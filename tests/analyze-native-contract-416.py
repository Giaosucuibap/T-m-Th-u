"""Independent, offline comparison of the real native Chrome observations."""
import hashlib, json
from pathlib import Path

root = Path(__file__).resolve().parents[3] / 'test-results' / '4.16.0'
files = {
    'full': root / 'native-full-control' / 'native-controls.json',
    'bounded': root / 'native-date-final' / 'native-controls.json',
    'detail': root / 'native-controls' / 'native-controls.json',
    'sort': root / 'native-sort-final' / 'native-controls.json',
}
data = {k: json.loads(p.read_text(encoding='utf-8')) for k, p in files.items()}
searches = lambda d: [r for r in d['responses'] if r['path'].endswith('/smart/search')]
full_response = searches(data['full'])[-1]
bounded_response = searches(data['bounded'])[-1]
full, bounded = full_response['data']['page']['content'], bounded_response['data']['page']['content']
local = [r for r in full if r.get('decisionDate') and '2026-07-07' <= r['decisionDate'][:10] <= '2026-10-05']
identity = lambda rows: sorted((r['planNo'], r.get('planVersion')) for r in rows)
detail = data['detail']['responses'][-1]['data']
detail_rows = detail['bidpPlanDetailToProjectList']
plan = next(r for r in full if r['planNo'] == 'PL2600333000')
proper_prices = {r['bidName']: r['bidPrice'] for r in detail_rows}
wrong_pairs = [{'name': n, 'indexedPrice': p, 'pairedDetailPrice': proper_prices.get(n)}
               for n, p in zip(plan['bidName'], plan['bidPrice']) if p != proper_prices.get(n)]
sort_rows = searches(data['sort'])
control = sort_rows[0]['data']['page']['content']
sort_results = []
for response in sort_rows[1:]:
    rows = response['data']['page']['content']
    dates = [r['decisionDate'] for r in rows]
    sort_results.append({'candidate': response['phase'], 'status': response['status'],
        'sameIdentities': identity(rows) == identity(control),
        'sameOrder': [r['planNo'] for r in rows] == [r['planNo'] for r in control],
        'approvalDescending': dates == sorted(dates, reverse=True),
        'dates': dates})
report = {
    'readOnly': True, 'fixture': False, 'liveSources': True,
    'files': {k: {'path': str(p), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
                 'closed': data[k].get('closed'), 'completed': data[k].get('completed')}
              for k, p in files.items()},
    'dateControl': {
        'from': '2026-07-07', 'to': '2026-10-05', 'serverField': 'bidCloseDate',
        'fullSourceCount': len(full), 'boundedSourceCount': len(bounded),
        'fullReportedCount': full_response['data']['page']['totalElements'],
        'boundedReportedCount': bounded_response['data']['page']['totalElements'],
        'localApprovalCount': len(local), 'sameBoundedIdentitySet': identity(local) == identity(bounded),
        'removedOutsideApprovalPeriod': len(full) - len(local),
        'aliasExactPresentCount': sum(bool(r.get('bidCloseDate')) and r['bidCloseDate'] == r.get('decisionDate') for r in full),
        'aliasMissing': [{'planNo': r['planNo'], 'decisionDate': r.get('decisionDate')} for r in full if not r.get('bidCloseDate')],
        'boundedPlans': [{'planNo': r['planNo'], 'decisionDate': r['decisionDate'], 'publicDate': r.get('publicDate')} for r in bounded],
        'interpretation': 'Native approval-day bounds use bidCloseDate for plan-project index. Keep a local decisionDate gate and monitor alias/schema; this is evidence for the observed source scope.'
    },
    'pairingControl': {
        'planNo': plan['planNo'], 'id': plan['id'], 'detailEndpoint': data['detail']['responses'][-1]['path'],
        'indexedNames': len(plan['bidName']), 'indexedPrices': len(plan['bidPrice']), 'detailRows': len(detail_rows),
        'unsafeIndexPairs': wrong_pairs,
        'pairedRows': [{'id': r['id'], 'bidNo': r['bidNo'], 'name': r['bidName'], 'price': r['bidPrice'], 'field': r['bidField']} for r in detail_rows],
        'interpretation': 'Equal array lengths are not evidence of name/price pairing. Use ID-bound structured detail rows.'
    },
    'sortControl': {'candidatesActuallySent': len(data['sort'].get('appliedSorts', [])),
        'results': sort_results, 'acceptedApprovalSort': any(r['approvalDescending'] for r in sort_results),
        'interpretation': 'All three tested sort encodings preserved the unsorted approval order. No supported remote sort contract was established; sort the validated results locally.'},
}
assert len(full) == full_response['data']['page']['totalElements'] == 48
assert len(bounded) == len(local) == 7 and identity(local) == identity(bounded)
assert len(wrong_pairs) == 6 and len(detail_rows) == 6
assert len(sort_results) == report['sortControl']['candidatesActuallySent'] == 3
assert all(r['status'] == 200 and r['sameIdentities'] and r['sameOrder'] and not r['approvalDescending'] for r in sort_results)
assert all(data[k].get('closed') for k in files)
report['comparisonChecksPassed'] = True
target = root / 'native-contract-analysis.json'
target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'report': str(target), 'source': 48, 'bounded': 7, 'unsafePairs': 6, 'unsupportedSortCandidates': 3, 'passed': True}))
