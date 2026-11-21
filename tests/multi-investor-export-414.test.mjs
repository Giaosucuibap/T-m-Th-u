import test from 'node:test';
import assert from 'node:assert/strict';
import {createScopedExportFixtures, ownerText, expectedNoticeIds, unknownNoticeId, outsideNoticeId,
  unpackWorkbook, workbookSheetXml} from './fixtures/multi-investor-export-414.mjs';

const fixture = await createScopedExportFixtures();
const detailOf = output => output.spec.sheets?.find(sheet => sheet.sheetName === output.detailSheet)
  || (output.spec.sheetName === output.detailSheet ? output.spec : null);
const value = (sheet, label) => sheet.rows.find(row => row.label === label)?.value;

for (const output of fixture.outputs) {
  test(`414 ${output.kind} Excel exports exactly three matched owners and records the original OR/province scope`, () => {
    const detail = detailOf(output);
    assert.ok(detail, 'detail sheet exists');
    assert.equal(detail.rows.length, 3);
    const expectedIds = expectedNoticeIds.map(id => output.kind === 'KHLCNT' ? id.replace(/^IB/, 'PL')
      : output.kind === 'TBMT' ? id.slice(0, -3) : id);
    assert.deepEqual(detail.rows.map(row => row[output.idField]).sort(), expectedIds.sort());
    const xml = workbookSheetXml(output, output.detailSheet);
    assert.equal(xml.includes(unknownNoticeId.slice(0, -3)), false);
    assert.equal(xml.includes(outsideNoticeId.slice(0, -3)), false);
    const reconciliation = output.spec.sheets.find(sheet => sheet.sheetName === 'Đối soát');
    assert.ok(reconciliation, `${output.kind}: reconciliation sheet`);
    assert.equal(value(reconciliation, 'Tiêu chí gốc · Chủ đầu tư'), ownerText);
    assert.equal(value(reconciliation, 'Tiêu chí gốc · Tỉnh/thành phố'), 'Tỉnh Lâm Đồng');
    assert.equal(value(reconciliation, 'Tiêu chí gốc · Mã tỉnh/thành phố'), '68, 703');
    assert.equal(value(reconciliation, 'e-GP công bố'), 5);
    assert.equal(value(reconciliation, 'Đã tải từ e-GP'), 5);
    assert.equal(value(reconciliation, 'Khớp tiêu chí gốc'), 3);
    assert.equal(value(reconciliation, 'Chưa đủ dữ liệu'), 1);
    assert.equal(value(reconciliation, 'Ngoài tiêu chí gốc'), 1);
    assert.equal(value(reconciliation, 'Số bản ghi sau bộ lọc xuất'), 3);
    assert.equal(value(reconciliation, 'Số dòng dữ liệu xuất'), 3);
    assert.match(workbookSheetXml(output, 'Đối soát'), /Đức Trọng; Đơn Dương; Phan Thiết/);
    assert.match(workbookSheetXml(output, 'Đối soát'), /Chưa đủ dữ liệu/);
  });
}

test('414 all scoped Excel totals and contractor summaries exclude missing or conflicting province records', () => {
  const {state, groups} = fixture;
  assert.deepEqual(groups.counts, {match: 3, insufficient: 1, outOfRange: 1});
  const total = groups.match.reduce((sum, row) => sum + row.winningPrice, 0);
  assert.equal(total, 5400000);
  assert.equal(state.areaScan.summary.totalValue, total);
  assert.equal(state.investorScan.summary.soloValue, total);
  const investor = fixture.outputs.find(output => output.kind === 'CHU-DAU-TU');
  const overview = investor.spec.sheets.find(sheet => sheet.sheetName === 'Tổng quan');
  assert.equal(overview.rows.find(row => row.k === 'Số gói đã tổ chức (có kết quả)').v, 3);
  assert.equal(overview.rows.find(row => row.k === 'Giá trị trúng độc lập').v, total);
  const area = fixture.outputs.find(output => output.kind === 'DIA-BAN');
  const relations = area.spec.sheets.find(sheet => sheet.sheetName === 'Quan hệ CĐT - Nhà thầu');
  assert.equal(relations.rows.reduce((sum, row) => sum + row.packages, 0), 3);
  assert.equal(relations.rows.reduce((sum, row) => sum + row.soloValue, 0), total);
});

test('414 scoped Excel OOXML preserves full owner list, typed money and leading-zero identifiers', () => {
  for (const output of fixture.outputs) {
    const files = unpackWorkbook(output.bytes);
    assert.ok(files['[Content_Types].xml']);
    assert.ok(files['xl/styles.xml']);
    assert.equal(Object.values(files).some(xml => /<f(?:>|\s)/.test(xml)), false);
    assert.match(files['xl/workbook.xml'], /name="Đối soát"/);
    const detail = workbookSheetXml(output, output.detailSheet);
    assert.match(detail, /<v>(?:1000000|900000)<\/v>/);
    if (output.kind === 'BBMT') assert.match(detail, /t="inlineStr"[^>]*>.*0012345678/);
    if (output.kind === 'CHU-DAU-TU') {
      assert.match(workbookSheetXml(output, 'Nhà thầu đã trúng'), /t="inlineStr"[^>]*>.*0012345678/);
    }
    assert.match(files['xl/styles.xml'], /style="thin"/);
    assert.match(detail, /<autoFilter/);
    assert.match(detail, /<pane/);
  }
});

test('414 winner, area and investor exports isolate missing-province rows from matched details and totals', () => {
  for (const output of fixture.outputs.filter(row => ['KQLCNT','DIA-BAN','CHU-DAU-TU'].includes(row.kind))) {
    const sheet = output.spec.sheets.find(row => row.sheetName === 'Chưa đủ dữ liệu');
    assert.ok(sheet, `${output.kind}: missing-data sheet`);
    assert.equal(sheet.rows.length, 1);
    const xml = workbookSheetXml(output, 'Chưa đủ dữ liệu');
    assert.match(xml, new RegExp(unknownNoticeId));
    assert.equal(xml.includes(outsideNoticeId), false);
    assert.equal(xml.includes(expectedNoticeIds[0]), false);
    assert.match(xml, /Chưa đủ dữ liệu tỉnh\/thành|insufficient-area|insufficient/);
    assert.equal(workbookSheetXml(output, output.detailSheet).includes(unknownNoticeId), false);
  }
});

test('414 TBMT export rejects keys outside the selected owner/province result, including unknown records', async () => {
  const valid = fixture.state.tenders.filter(row => row.filterState === 'MATCH').map(row => row.key);
  for (const row of fixture.state.tenders.filter(row => row.filterState !== 'MATCH')) {
    await assert.rejects(fixture.runtime.exportCsv(false, [...valid.slice(1), row.key], 'tbmt-scope', {criteriaState: 'MATCH'}, 'fixture-r1'), /mọi trang/);
  }
});
