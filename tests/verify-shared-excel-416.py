"""Read-only independent OOXML audit of actual 4.16 shared-flow downloads.

No extension code or spreadsheet writer is imported. Expected values come
from the captured live job, and every inspected row is compared by identity.
"""
import datetime as dt
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
ROOT = Path(__file__).resolve().parents[1]
REPORT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent.parent / 'test-results/4.16.0/live-shared/shared-flows-live.json'
REPORT = REPORT.resolve()
live = json.loads(REPORT.read_text(encoding='utf-8'))
checks = []

def sheets_of(path):
    with zipfile.ZipFile(path) as book:
        files = {name: book.read(name) for name in book.namelist() if name.endswith('.xml')}
    names = [sheet.attrib['name'] for sheet in ET.fromstring(files['xl/workbook.xml']).find('s:sheets', NS)]
    sheets = {}
    for index, name in enumerate(names, 1):
        sheet = ET.fromstring(files[f'xl/worksheets/sheet{index}.xml'])
        assert sheet.find('.//s:f', NS) is None, f'{name}: unexpected formula'
        rows = []
        for row in sheet.findall('s:sheetData/s:row', NS):
            cells = []
            for cell in row.findall('s:c', NS):
                value = cell.find('s:v', NS)
                text = ''.join(t.text or '' for t in cell.findall('.//s:t', NS))
                cells.append({'value': value.text if value is not None else text, 'number': value is not None and cell.attrib.get('t') not in {'s', 'inlineStr', 'str', 'e'}})
            rows.append(cells)
        headers = [cell['value'] for cell in rows[0]]
        sheets[name] = {'xml': sheet, 'rows': [{label: cells[index] for index, label in enumerate(headers)} for cells in rows[1:]]}
    assert b'<borders ' in files['xl/styles.xml']
    return sheets

def text(row, label, expected):
    assert label in row, label
    assert row[label]['value'] == str(expected or ''), f'{label}: {row[label]["value"]!r} != {expected!r}'

def money(row, label, expected):
    assert label in row, label
    cell = row[label]
    if expected is None or expected == '':
        assert cell['value'] == '', f'{label}: missing value became {cell["value"]}'
    else:
        assert cell['number'], f'{label}: money stored as text'
        assert abs(Decimal(cell['value']) - Decimal(str(expected))) <= Decimal('0.0001'), f'{label}: {cell["value"]} != {expected}'

def scope(rows, code):
    chosen = set(live['provinceCodes'])
    for row in rows:
        codes = {row.get('investorCode'), row.get('procuringEntityCode'), *(row.get('investorCodes') or [])}
        assert code in codes, f'Owner identity {code} absent from {row.get("key")}'
        geography = set(row.get('provinceCodes') or [])
        geography.update(location.get('provCode') or location.get('provinceCode') for location in row.get('locations') or [])
        if row.get('areaEvidence'):
            geography.update(row['areaEvidence'].get('provinceCodes') or [])
        assert geography & chosen, f'No province proof for {row.get("key")}'
        assert row.get('filterState') == 'MATCH', row.get('key')

def clock(value):
    stamp = dt.datetime.fromtimestamp(value // 1000, dt.timezone(dt.timedelta(hours=7)))
    return stamp.strftime('%d/%m/%Y %H:%M:%S.') + f'{int(value % 1000):03}' + ' (UTC+07:00)'

def expected_for(kind):
    if kind == 'TBMT':
        sample = live.get('tbmtPositiveControl') or live['tbmt']
        return sample['rows'], sample['run']['criteria']['investor'], sample['rows']
    key = {'KHLCNT': 'planLookup', 'AREA': 'areaScan', 'WINNERS': 'winnerLookup', 'BBMT': 'bidOpenScan'}[kind]
    job = live[key]['job']
    parents = job.get('plans') if kind == 'KHLCNT' else job['packages']
    expanded = [(plan, child) for plan in parents for child in plan['packages']] if kind == 'KHLCNT' else [(package, bidder) for package in parents for bidder in package.get('bidders') or []] if kind == 'BBMT' else parents
    return parents, live['criteria']['investor'], expanded

for export in live['exports']:
    path = REPORT.parent / export['filename']
    assert hashlib.sha256(path.read_bytes()).hexdigest() == export['sha256'], 'Download hash changed'
    sheets = sheets_of(path)
    target = sheets[export['verification']['detailSheet']]
    assert target['xml'].find('s:autoFilter', NS) is not None
    assert target['xml'].find('s:sheetViews/s:sheetView/s:pane', NS) is not None
    parents, owner, expected = expected_for(export['kind'])
    scope(parents, owner)
    rows = target['rows']
    assert len(rows) == len(expected), f'{export["kind"]}: row count differs'
    values = {row['Chỉ tiêu']['value']: row['Giá trị']['value'] for row in sheets['Đối soát']['rows']}
    assert values['Tiêu chí gốc · Chủ đầu tư'] == owner
    assert values['Tiêu chí gốc · Tỉnh/thành phố'] == live['criteria']['province']
    assert int(values['Số bản ghi sau bộ lọc xuất']) == len(parents)
    assert int(values['Số dòng dữ liệu xuất']) == len(expected)
    for actual, source in zip(rows, expected):
        kind = export['kind']
        if kind == 'KHLCNT':
            parent, child = source
            text(actual, 'Mã KHLCNT', parent['planNoStand']); text(actual, 'Tên kế hoạch', parent['name'])
            text(actual, 'Tên gói thầu', child['name']); text(actual, 'Chủ đầu tư', parent['investorName']); money(actual, 'Giá gói thầu', child['price'])
            assert child.get('filterState') == 'MATCH' and not child.get('priceBindingPending')
        elif kind == 'BBMT':
            parent, bidder = source
            text(actual, 'Mã TBMT', parent['notifyNoStand']); text(actual, 'Tên gói thầu', parent['bidName'])
            text(actual, 'Nhà thầu', bidder['name']); text(actual, 'Mã số thuế', bidder.get('taxCode'))
            money(actual, 'Giá dự thầu', bidder.get('bidPrice')); money(actual, 'Giá sau giảm giá', bidder.get('finalPrice'))
        else:
            text(actual, 'Mã TBMT', source['notifyNo'] if kind == 'TBMT' else source['notifyNoStand'])
            text(actual, 'Tên gói thầu', source['bidName']); text(actual, 'Chủ đầu tư', source['investorName'])
            if kind == 'TBMT':
                money(actual, 'Giá gói thầu', source.get('price'))
            else:
                text(actual, 'Nhà thầu trúng' if kind == 'AREA' else 'Nhà thầu trúng thầu', source.get('winnerName'))
                money(actual, 'Giá gói thầu/dự toán', source.get('priceBasis')); money(actual, 'Giá trúng thầu', source.get('winningPrice'))
    if export['kind'] == 'KHLCNT':
        frozen = live['planLookup']['job']['criteria']['dateRange']
        assert values['Tiêu chí gốc · Từ thời điểm đã cố định'] == clock(frozen['from'])
        assert values['Tiêu chí gốc · Đến thời điểm đã cố định'] == clock(frozen['to'])
        assert values['Tiêu chí gốc · Mốc thời gian đối chiếu'] == 'Ngày phê duyệt kế hoạch (decisionDate)'
    checks.append({'kind': export['kind'], 'filename': export['filename'], 'records': len(parents), 'rows': len(rows), 'allIdentitiesNamesPricesMatch': True, 'ownerProvinceMatch': True})

assert {item['kind'] for item in checks} == {'TBMT', 'KHLCNT', 'AREA', 'WINNERS', 'BBMT'}
result = {'ok': True, 'readOnly': True, 'fixture': False, 'independentParser': 'Python stdlib zipfile + ElementTree + Decimal, no extension imports', 'liveReport': str(REPORT), 'liveSourceGatePassed': live.get('sourceUnchanged') is True, 'reportSha256': hashlib.sha256(REPORT.read_bytes()).hexdigest(), 'checks': checks}
(REPORT.parent / 'shared-excel-independent.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
