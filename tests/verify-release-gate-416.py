"""Read-only negative guard checks for the portable release gate.

Mutations are in-memory QA cases. They never replace public live evidence.
"""
import copy
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent.parent
spec = importlib.util.spec_from_file_location('release_gate', ROOT / 'tools/check-live-evidence.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
exact_file = WORKSPACE / 'test-results/4.16.0/live-exact/live-plans.json'
before = gate.sha(exact_file)
exact = gate.read(exact_file)
gate.verify_plan_job(exact['job'])
gate.verify_plan_job(exact['repeat']['job'])

mutations = {
    'old approval': lambda j: j['plans'][0].update(decisionDate='2023-10-02T16:59:59.000Z'),
    'wrong aggregate pairing': lambda j: j['plans'][0]['packages'][0].update(price=51197946),
    'unknown package as match': lambda j: j['plans'][0]['packages'][0].update(filterState='INSUFFICIENT'),
    'duplicate child': lambda j: j['plans'][1]['packages'][0].update(id=j['plans'][0]['packages'][0]['id']),
    'missing actual plan': lambda j: j['plans'].pop(),
    'unacknowledged final page': lambda j: j['finalPageReceipt'].update(doneAcknowledged=False),
    'unfrozen range': lambda j: j['criteria']['dateRange'].update({'from': j['criteria']['dateRange']['from'] + 1}),
    'wrong owner': lambda j: j['plans'][0].update(investorCode='vn0000000000', investorCodes=[]),
    'wrong province': lambda j: j['plans'][0].update(provinceCodes=['001'], locations=[]),
    'partial success': lambda j: j['coverage'].update(partial=True, complete=False),
}
rejected = []
for name, mutate in mutations.items():
    altered = copy.deepcopy(exact['job'])
    mutate(altered)
    try:
        gate.verify_plan_job(altered)
    except ValueError as error:
        rejected.append({'name': name, 'reason': str(error), 'rejected': True})
    else:
        raise ValueError('Gate incorrectly accepted in-memory negative case: ' + name)
assert before == gate.sha(exact_file), 'Guard checks modified real public evidence'
result = {'ok': True, 'readOnly': True, 'fixtureGuardTests': True,
          'actualPositivePlansAccepted': True, 'realEvidenceUnchanged': True,
          'exactReportSha256': before, 'checks': rejected}
if len(sys.argv) > 1:
    stage = Path(sys.argv[1]).resolve()
    stage_before = gate.inventory(stage)
    result['actualFullStageAcceptance'] = gate.check(stage)
    original_read = gate.read
    zero_feature = gate.FEATURES[0]
    def erase_zero_response(r):
        for response in r['responses']:
            if response.get('feature') == zero_feature and response.get('totalElements') == 0:
                response['status'] = 503
    def erase_zero_request(r):
        for request in r['requests']:
            if request.get('feature') == zero_feature:
                for page in request.get('pages', []):
                    for query in page.get('query', []):
                        if query.get('keyWord') == gate.OWNER:
                            query['keyWord'] = 'unresolved board name'
    negatives = [
        ('unit-result.json', 'different product source', lambda r: r['sourceHashes'].update({'background.js': '0' * 64})),
        ('unit-result.json', 'skipped regression', lambda r: r['counts'].update(skipped=1)),
        ('shared-flows-live.json', 'TBMT zero still running', lambda r: r['tbmt']['run'].update(status='RUNNING')),
        ('shared-flows-live.json', 'TBMT zero missing ACK', lambda r: r['tbmt']['run']['finalPageReceipt'].update(doneAcknowledged=False)),
        ('shared-flows-live.json', 'TBMT zero lacks native 200', erase_zero_response),
        ('shared-flows-live.json', 'TBMT zero lacks native owner code', erase_zero_request),
        ('shared-flows-live.json', 'TBMT zero has unresolved source records', lambda r: r['tbmt']['run']['coverage'].update(insufficient=1)),
        ('shared-flows-live.json', 'changed actual workbook hash', lambda r: r['exports'][0].update(sha256='0' * 64)),
        ('excel-live.json', 'independent price comparison failed', lambda r: r['checks'][0].update(allIdentitiesNamesPricesMatch=False)),
        ('excel-visual-review.json', 'workbook visuals not reviewed', lambda r: r.update(reviewed=False)),
        ('upgrade-browser.json', 'extension identity changed', lambda r: r.update(currentId='a' * 32)),
        ('live-canary.json', 'canary belongs to old source', lambda r: r['sourceHashes'].update({'background.js': '0' * 64})),
        ('live-canary.json', 'canary has missing case', lambda r: r['canary']['cases'].pop()),
        ('live-canary.json', 'canary is red', lambda r: r['canary'].update(status='RED')),
        ('live-canary.json', 'canary stale', lambda r: r['canary'].update(checkedAt='2026-10-01T02:00:00.000Z')),
        ('live-canary.json', 'weekly schedule changed', lambda r: r.update(nextRunAt='2026-10-12T20:00:00.000Z')),
    ]
    full_rejected = []
    try:
        for file, name, mutate in negatives:
            def altered_read(path, target=file, change=mutate):
                receipt = original_read(path)
                if path == stage / 'evidence' / target:
                    receipt = copy.deepcopy(receipt)
                    change(receipt)
                return receipt
            gate.read = altered_read
            try:
                gate.check(stage)
            except ValueError as error:
                full_rejected.append({'name': name, 'reason': str(error), 'rejected': True})
            else:
                raise ValueError('Full gate incorrectly accepted in-memory negative case: ' + name)
    finally:
        gate.read = original_read
    assert gate.inventory(stage) == stage_before, 'Negative gate checks modified the actual stage'
    result['stageEvidenceUnchanged'] = True
    result['fullGateChecks'] = full_rejected
out = WORKSPACE / 'test-results/4.16.0/release-gate-guards.json'
out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
