"""Portable read-only 4.16 release gate; no network or product mutation.

The entire runtime inventory must match every final QA run. Synthetic local
warehouse/upgrade cases never substitute for actual native e-GP acceptance.
Old 4.15 research is background, not proof of current 4.16 software behavior.
"""
from pathlib import Path
import ast
import datetime as dt
import hashlib
import json
import math
import re
import sys
import unicodedata

VERSION = '4.16.0'
EXTENSION_ID = 'injgpddgeaedalfgbnnbobdidghjncoj'
OWNER = 'vn5800939408'
EXPECTED_PLANS = {'PL2600333000', 'PL2600281325', 'PL2600277679', 'PL2600244629',
                  'PL2600243128', 'PL2600237244', 'PL2600224207'}
FEATURES = [
    'Real TBMT UI resolves Ban 1 shorthand and verifies native scope plus a positive public owner-code control',
    'Real KHLCNT Ban 1 with a frozen 90-day approval range returns newest approvals first and own child prices',
    'Real 2026 area scan queries verified owner code and independently verifies every MATCH province',
    'Real owner-only winning lookup keeps exact code and province without a contractor filter',
    'Real investor discovery resolves registry alias before native request and retains exact province scope',
    'Real pending bid openings use verified code with 90 days and a five-package read bound',
    'Actual production Excel downloads preserve live rows, scope and reconciliation using an independent OOXML reader',
]

def require(value, message):
    if not value:
        raise ValueError(message)

def read(file):
    return json.loads(file.read_text(encoding='utf-8-sig'))

def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()

def inventory(folder, relative_to=None, pattern='*'):
    return {p.relative_to(relative_to or folder).as_posix(): sha(p)
            for p in sorted(folder.rglob(pattern)) if p.is_file()}

def number(value):
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)

def millis(value):
    value = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if value.tzinfo is None:
        value = value.replace(tzinfo=dt.timezone(dt.timedelta(hours=7)))
    return value.timestamp() * 1000

def fold(value):
    return ''.join(c for c in unicodedata.normalize('NFD', value)
                   if not unicodedata.combining(c)).lower().replace('đ', 'd').removeprefix('tinh ').strip()

def file_name(value):
    require(value and '/' not in value and '\\' not in value and Path(value).name == value,
            'Artifact must be a plain filename: ' + str(value))
    return value

def complete(job):
    c = job.get('coverage', {})
    return job.get('status') == 'SUCCESS' and c.get('complete') is True and c.get('consistent') is True and c.get('done') is True and c.get('partial') is False

def delivered(job):
    return bool(job.get('finalPageReceipt', {}).get('doneAcknowledged') or job.get('queryCache', {}).get('hit'))

def verify_tbmt_zero(item, responses, requests):
    # GET_SEARCH_STATE intentionally projects public run coverage and omits
    # internal consistent/partial fields. Check the actual projected contract,
    # run-level partial/schema flags and acknowledged native zero instead.
    job = item['run']; c = job.get('coverage', {}); receipt = job.get('finalPageReceipt', {})
    require(item.get('zeroConfirmed') is True and not item.get('rows')
            and job.get('status') == 'SUCCESS' and job.get('partial') is False
            and job.get('schemaIssue') is False and c.get('complete') is True and c.get('done') is True
            and all(c.get(k) == 0 for k in ('serverTotal', 'fetched', 'match', 'insufficient', 'outOfRange', 'pagesRead', 'totalPages'))
            and all(job.get(k) == 0 for k in ('captured', 'sourceCount', 'invalidCount', 'duplicateCount'))
            and not job.get('foundKeys') and receipt.get('doneAcknowledged') is True
            and receipt.get('id') == job.get('id') and receipt.get('mode') == 'tbmt',
            'Unproved TBMT zero result')
    require(job.get('criteria', {}).get('investor') == OWNER
            and job['criteria'].get('category') == 'XL' and '703' in job['criteria'].get('provinces', []),
            'TBMT zero is not the requested exact Ban 1/province/category scope')
    require(any(r.get('status') == 200 and r.get('totalElements') == r.get('totalPages') == 0
                and r.get('feature') == FEATURES[0] and r['path'].endswith('/smart/search')
                and r.get('identifiers') == [] for r in responses), 'No actual empty zero-total HTTP 200 response')
    queries = [q for r in requests if r.get('feature') == FEATURES[0]
               for page in r.get('pages') or [] for q in page.get('query') or []]
    require(any(q.get('keyWord') == OWNER
                and any(f.get('fieldName') == 'locations.provCode' and '703' in f.get('fieldValues', []) for f in q.get('filters') or [])
                and any(f.get('fieldName') == 'investField' and f.get('fieldValues') == ['XL'] for f in q.get('filters') or []) for q in queries),
            'TBMT zero lacks the actual owner/province/XL native request')

def verify_scope(rows, owner=OWNER, provinces=('703', '68')):
    require(len({r['key'] for r in rows}) == len(rows), 'Duplicate MATCH key')
    for r in rows:
        codes = {r.get('investorCode'), r.get('procuringEntityCode'), *(r.get('investorCodes') or [])}
        geography = set(r.get('provinceCodes') or [])
        geography.update(loc.get('provCode') or loc.get('provinceCode') for loc in r.get('locations') or [])
        geography.update((r.get('areaEvidence') or {}).get('provinceCodes') or [])
        require(owner in codes and bool(geography & set(provinces)) and r.get('filterState') == 'MATCH',
                'Wrong or unproven owner/province/MATCH for ' + str(r.get('key')))

def verify_plan_job(job):
    require(complete(job) and delivered(job), 'KHLCNT incomplete coverage or final delivery')
    require(job.get('planDataVersion') == 2 and job.get('serverCount') == 7 and job.get('detailRead') == 7 and job.get('detailFailed') == 0,
            'Not all seven actual recent plan details were verified')
    criteria = job['criteria']
    require(criteria.get('investor') == OWNER and criteria.get('category') == 'XL' and criteria.get('days') == 90 and fold(criteria.get('province', '')) == 'lam dong',
            'Ban 1 exact UI criteria changed')
    span = criteria['dateRange']
    require(number(span.get('from')) and number(span.get('to')) and span['to'] - span['from'] == 90 * 86400000,
            'Approval range not frozen to 90 days')
    plans = job.get('plans') or []
    require({p['planNo'] for p in plans} == EXPECTED_PLANS and len(plans) == 7 and not job.get('insufficientPlans'),
            'Seven positive recent plans were not all resolved')
    verify_scope(plans)
    dates = [millis(p['decisionDate']) for p in plans]
    require(all(span['from'] <= value <= span['to'] for value in dates) and dates == sorted(dates, reverse=True),
            'Old or unordered approval dates escaped the local gate')
    children = []
    for p in plans:
        require(p.get('packageDetail', {}).get('verified') is True and p.get('packages'), 'Unverified child detail for ' + p['planNo'])
        for child in p['packages']:
            require(child.get('filterState') == 'MATCH' and child.get('bidField') == 'XL' and child.get('priceBindingPending') is False
                    and number(child.get('price')) and child['price'] >= 0 and child.get('id') and child.get('bidNo')
                    and child.get('priceSource') == 'plan-detail.bidPrice' and child.get('fieldSource') == 'plan-detail.bidField',
                    'Unsafe child name/price/category binding for ' + p['planNo'])
            children.append(child)
    require(len(children) == 12 and job.get('summary', {}).get('packageCount') == 12, 'The actual 12 XL child packages are incomplete')
    require(len({c['id'] for c in children}) == len(children)
            and len({c['bidNo'] for c in children}) == len(children), 'Duplicate native child identity in matched XL packages')
    main = next(p for p in plans if p['planNo'] == 'PL2600333000')
    require(len(main['packages']) == 2 and main.get('totalPackagePrice') == 746438475004
            and sorted(c['price'] for c in main['packages']) == [1788792936, 744649682068],
            'Observed Số 15 / Số 17 prices incorrectly paired or omitted')
    return plans

def check(base):
    require(__debug__, 'Optimized Python assertion mode is not allowed')
    source, ev = base / 'GiaoSuCuiBap', base / 'evidence'
    hashes = inventory(source)
    require(read(source / 'manifest.json')['version'] == VERSION, 'Wrong product version')
    def bound(file, live=False):
        r = read(ev / file)
        require(r.get('sourceUnchanged') is True and r.get('closed') is True and r.get('sourceHashes') == hashes and not r.get('fatal'),
                file + ': browser closure or entire source inventory mismatch')
        require(all(c.get('ok') is True for c in r.get('checks', [])), file + ': failed checks')
        if live:
            require(r.get('fixture') is False and r.get('version') == VERSION, file + ': historical/fixture evidence is not current live acceptance')
        return r
    unit = read(ev / 'unit-result.json'); counts = unit['counts']
    require(unit.get('exitCode') == 0 and counts['tests'] == counts['pass'] >= 631 and all(counts.get(k, 0) == 0 for k in ('fail', 'cancelled', 'skipped', 'todo')),
            'Regression suite failed, skipped tests or incomplete run')
    require(unit.get('sourceUnchanged') and unit.get('executedUnitSourcesUnchanged') and unit.get('sourceHashes') == hashes, 'Unit source mismatch')
    tests = inventory(base / 'tests', base, '*.test.mjs')
    require(unit.get('testHashes') == tests and unit.get('testFiles') == len(tests), 'Executed test inventory differs from packaged tests')
    static = read(ev / 'static-result.json')
    require(static.get('ok') and static.get('sourceUnchanged') and static.get('sourceHashes') == hashes
            and static.get('javascriptFiles') == static.get('linkedModules') == 101 and not static.get('failures'), '101-module parse/link gate failed')

    exact = bound('exact-live.json', True)
    require(exact.get('passed') and exact.get('investigationCompleted') and exact.get('replay') is False and not exact.get('boundedTimeout') and not exact.get('extensionErrors'),
            'Exact real UI case failed, timed out or replaced native responses')
    require(exact.get('input') == {'investor': OWNER, 'province': 'Tỉnh Lâm Đồng', 'category': 'XL', 'period': '90'}, 'Exact Ban 1 controls were not exercised')
    require(exact.get('warehouseFixture', {}).get('count') == 20000, 'No disclosed 20,000-row local warehouse load')
    plans = verify_plan_job(exact['job'])
    require(len(exact.get('rowAudit') or []) == 7 and all(r.get('owner') == r.get('province') == 'MATCH' and r.get('inDate') for r in exact['rowAudit']), 'Exact scope/date audit failed')
    cards = exact.get('dom', {}).get('cards') or []
    require(len(cards) == 7 and all(p['planNo'] in text for p, text in zip(plans, cards)), 'Sorted positive plan list absent from actual extension DOM')
    require('744.649.682.068' in cards[0] and '1.788.792.936' in cards[0] and not exact.get('dom', {}).get('insufficient'), 'Correct XL prices not displayed in actual DOM')
    require(number(exact.get('firstCardMs')) and number(exact.get('doneMs')) and 0 < exact['firstCardMs'] <= exact['doneMs'] <= 180000, 'Actual result/completion timings missing or unbounded')
    native = [r for r in exact['responses'] if r.get('phase') == 'extension-exact-case' and r.get('status') == 200 and r.get('total') == 7 and len(r.get('rows') or []) == 7]
    require(native and any({p['planNo'] for p in r['rows']} == EXPECTED_PLANS for r in native), 'No native HTTP 200 seven-plan response supports results')
    queries = [q for r in exact['requests'] if r.get('phase') == 'extension-exact-case' for envelope in r.get('envelope') or [] for q in envelope.get('query') or []]
    require(any(q.get('keyWord') == OWNER
                and any(f.get('fieldName') == 'locations.provCode' and '703' in f.get('fieldValues', []) for f in q.get('filters') or [])
                and any(f.get('fieldName') == 'bidCloseDate' and f.get('searchType') == 'range' and f.get('from') and f.get('to') for f in q.get('filters') or []) for q in queries),
            'Witnessed native organization/province/approval-range contract not sent')
    details = {r['planNo']: r for r in exact.get('detailResponses') or [] if r.get('phase') == 'extension-exact-case' and r.get('status') == 200}
    require(set(details) == EXPECTED_PLANS, 'Matched plans lack their own actual native detail responses')
    for p in plans:
        detail = details[p['planNo']]
        require(detail.get('id') == p['sourceId'] and str(detail.get('version')) == p['version'], 'Plan detail identity/version mismatch')
        raw = {c['id']: c for c in detail['packages']}
        require(len(raw) == len(detail['packages']) == detail['bidPack']
                and {c['id'] for c in p['packages']} == {c['id'] for c in detail['packages'] if c.get('bidField') == 'XL'},
                'Native detail is incomplete or not every exact-scope XL child was returned')
        for child in p['packages']:
            original = raw.get(child['id']) or {}
            require(all(child.get(f) == original.get(f) for f in ('id', 'idPlan', 'planNo', 'bidNo', 'bidName', 'bidField'))
                    and child['price'] == original.get('bidPrice') and original.get('bidField') == 'XL'
                    and child['idPlan'] == p['sourceId'] and child['planNo'] == p['planNo'],
                    'Child price/name/field differs from its native plan and child identity')
    verify_plan_job(exact['repeat']['job'])
    require(exact['repeat']['job'].get('queryCache', {}).get('hit') is True and 0 <= exact['repeat']['elapsedMs'] <= 90000
            and not any(r.get('phase') == 'extension-cache-repeat' for r in exact.get('detailResponses') or []), 'Repeat did not reuse verified detail cache')
    exact_export = exact['excel']; exact_name = file_name(exact_export['file'])
    require(sha(ev / 'workbooks' / exact_name) == exact_export['sha256'] and (ev / 'workbooks' / exact_name).stat().st_size == exact_export['bytes']
            and exact_export['rows'] == 12 and exact_export['sourcePlanJob'] == exact['job']['id'], 'Exact-case Excel bytes/rows/job differ')

    flow = bound('shared-flows-live.json', True)
    require(flow.get('ok') and flow.get('liveEndToEnd') and flow.get('replay') is False and [c['name'] for c in flow.get('checks', [])] == FEATURES, 'Seven current shared feature flows not completed')
    require(not any(e.get('extension') for e in flow.get('errors', []) if isinstance(e, dict)), 'Shared extension page errors')
    require(flow['tbmt']['run']['finalPageReceipt']['doneAcknowledged'], 'TBMT final page not acknowledged')
    if not flow['tbmt']['rows']:
        verify_tbmt_zero(flow['tbmt'], flow['responses'], flow['requests'])
    positive = flow['tbmtPositiveControl']; positive_owner = positive['run']['criteria']['investor']
    require(positive['rows'] and positive['run']['finalPageReceipt']['doneAcknowledged']
            and positive_owner in [positive['sample'].get('investorCode'), positive['sample'].get('procuringEntityCode')]
            and positive['sample']['detailUrl'].startswith('https://muasamcong.mpi.gov.vn/') and positive['provinceSearch']['sampleKey'] == positive['sample']['key'], 'TBMT positive control lacks native own-code/province proof')
    verify_scope(positive['rows'], positive_owner, flow['provinceCodes'])
    verify_plan_job(flow['planLookup']['job'])
    for key in ('areaScan', 'winnerLookup', 'investorScan', 'bidOpenScan'):
        job = flow[key]['job']
        require(job.get('coverage', {}).get('done') is True and delivered(job) and job.get('status') in ('SUCCESS', 'PARTIAL'), key + ': unfinished delivery')
        verify_scope(job['packages'], OWNER, flow['provinceCodes'])
    openings = flow['bidOpenScan']['job']['packages']
    require(openings and len(openings) <= 5 and all(p.get('readState') == 'OK' and p.get('bidders') for p in openings), 'Actual BBMT positive bidder reading not completed')
    for p in openings:
        for bidder in p['bidders']:
            require(bidder.get('name') and number(bidder.get('bidPrice')) and number(bidder.get('finalPrice')), 'Actual bidder name/price absent')
            if bidder['bidPrice'] == bidder['finalPrice'] == 0:
                require(bidder.get('financialPricePending') and all(bidder.get(f) is None for f in ('priceRank', 'vsPackageRate', 'vsPackageAmount')), 'Unpublished zero pair ranked or compared')

    exports = flow['exports']
    require(len(exports) == 5 and {e['kind'] for e in exports} == {'TBMT', 'KHLCNT', 'AREA', 'WINNERS', 'BBMT'}, 'Five actual shared Excel exporters not exercised')
    workbook_hashes = {file_name(e['filename']): e['sha256'] for e in exports}
    require(len(workbook_hashes) == 5, 'Duplicate Excel filename')
    for export in exports:
        file = ev / 'workbooks' / export['filename']
        require(sha(file) == export['sha256'] and file.stat().st_size == export['bytes'] and 'Đối soát' in export['verification']['sheets'], 'Workbook bytes or reconciliation sheet differ')
    excel = read(ev / 'excel-live.json')
    require(excel.get('ok') and excel.get('readOnly') and excel.get('fixture') is False and excel.get('liveSourceGatePassed')
            and excel.get('reportSha256') == sha(ev / 'shared-flows-live.json') and 'no extension imports' in excel.get('independentParser', ''), 'Independent workbook parser missing or source report mismatch')
    require(len(excel.get('checks') or []) == 5 and {c['filename'] for c in excel['checks']} == set(workbook_hashes)
            and all(c.get('allIdentitiesNamesPricesMatch') and c.get('ownerProvinceMatch') and c.get('rows', 0) > 0 for c in excel['checks']), 'Independent workbook identity/name/price/scope comparison failed')
    workbook_hashes[exact_name] = exact_export['sha256']
    review = read(ev / 'excel-visual-review.json')
    require(review.get('passed') and review.get('reviewed') and review.get('sourceUnchanged') and review.get('workbooksUnchanged') and review.get('productSourceHashes') == hashes
            and review.get('sourceReportSha256') == sha(ev / 'shared-flows-live.json') and review.get('exactReportSha256') == sha(ev / 'exact-live.json'), 'Actual Excel previews not reviewed on final sources/reports')
    require({item['file'] for item in review['files']} == set(workbook_hashes), 'Visual review omits a shared or exact-case workbook')
    for item in review['files']:
        require(workbook_hashes.get(item['file']) == item['sha256'] and sha(ev / 'excel-previews' / file_name(item['png'])) == item['pngSha256'], 'Reviewed workbook/preview hash mismatch')

    upgrade = read(ev / 'upgrade-browser.json')
    require(upgrade.get('fixture') is True and upgrade.get('network') is False and upgrade.get('closed') and upgrade.get('sourceUnchanged') and upgrade.get('ok') and not upgrade.get('fatal')
            and upgrade['sources']['current'] == hashes and upgrade.get('priorVersion') == '4.15.0' and upgrade.get('currentVersion') == VERSION
            and upgrade.get('priorId') == upgrade.get('currentId') == EXTENSION_ID and len(upgrade.get('checks') or []) >= 17 and all(c.get('ok') for c in upgrade['checks']), 'Actual same-ID 4.15 to 4.16 upgrade not verified on final sources')
    require(upgrade.get('storage', {}).get('engine') == 'indexeddb' and not upgrade['storage'].get('legacy') and 'gscb-warehouse-v1' in upgrade['storage'].get('databases', [])
            and not upgrade.get('pageErrors') and not upgrade.get('blockedRequests'), 'Upgrade IndexedDB preservation, page errors or public traffic failure')

    canary_report = bound('live-canary.json', True); canary = canary_report['canary']
    require(len(canary_report.get('checks') or []) == 2 and canary_report.get('reply', {}).get('ok') and canary.get('live') and canary.get('status') == 'GREEN'
            and canary.get('version') == VERSION and len(canary.get('cases') or []) == 25, 'Actual final-source 25-code canary is not GREEN')
    age = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(canary['checkedAt'].replace('Z', '+00:00'))
    require(dt.timedelta(seconds=-60) <= age <= dt.timedelta(hours=24), 'Final-source live canary evidence stale')
    province = canary['provinceCheck']
    require(province.get('status') == 'GREEN' and province.get('code') == '703' and fold(province.get('name', '')) == 'lam dong', '703 no longer proves Lâm Đồng')
    cases = read(source / 'data/live-canary-cases.json')['cases']
    require({(c['id'], c['type']) for c in cases} == {(c['id'], c['type']) for c in canary['cases']}, 'Canary omitted/substituted configured public identities')
    for case in canary['cases']:
        required = ['planNo', 'name', 'investField', 'decisionDate'] if case['type'] == 'PL' else ['notifyNo', 'bidName', 'investField', 'bidPrice']
        require(case.get('status') == 'GREEN' and not case.get('skipped') and all(f in case.get('fields', []) for f in required), 'Missing canary source fields')
        if case['type'] == 'BBMT':
            bidders = case.get('bidders') or []
            require(len(bidders) == case.get('bidderCount') and bidders and all(b.get('name', '').strip() and number(b.get('bidPrice')) and number(b.get('finalPrice')) for b in bidders), 'Live canary bidder name/price proof incomplete')
    canary_source = (source / 'lib/live-canary.js').read_text(encoding='utf-8')
    files = ast.literal_eval(re.search(r'CANARY_SOURCE_FILES = (\[.*?\]);', canary_source, re.S)[1])
    digest = hashlib.sha256('\n'.join(f'{file}:{hashes[file]}' for file in files).encode()).hexdigest()
    require(canary.get('sourceDigest') == digest, 'Canary production source digest differs')
    schedule = dt.datetime.fromisoformat(canary_report['nextRunAt'].replace('Z', '+00:00')).astimezone(dt.timezone(dt.timedelta(hours=7)))
    require(schedule.weekday() == 0 and schedule.hour == 2 and schedule.minute == schedule.second == 0, 'Weekly canary lost Monday 02:00 Vietnam schedule')
    return {'passed': True, 'version': VERSION, 'sourceFiles': len(hashes), 'unitTests': counts['pass'], 'linkedModules': 101,
            'actualRecentPlans': 7, 'actualXLChildren': 12, 'sharedFeatures': 7, 'actualWorkbooks': 6,
            'upgradeChecks': len(upgrade['checks']), 'canaryCases': 25,
            'firstCardMs': exact['firstCardMs'], 'doneMs': exact['doneMs'], 'repeatMs': exact['repeat']['elapsedMs']}

if __name__ == '__main__':
    try:
        target = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
        print(json.dumps(check(target), ensure_ascii=False))
    except Exception as error:
        print('BUILD BLOCKED: ' + str(error))
        sys.exit(1)
