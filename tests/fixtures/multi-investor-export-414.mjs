import assert from 'node:assert/strict';
import {buildXlsx} from '../../GiaoSuCuiBap/lib/xlsx.js';
import {createExportRuntime} from '../../GiaoSuCuiBap/lib/runtime-export.js';
import {normalizeKqlcntRecord, summarizeWinner} from '../../GiaoSuCuiBap/lib/kqlcnt.js';
import {normalizeKhlcntPlan, classifyPlansByCriteria} from '../../GiaoSuCuiBap/lib/khlcnt.js';
import {classifyAreaPackages, summarizeArea} from '../../GiaoSuCuiBap/lib/localmarket.js';
import {summarizeInvestor} from '../../GiaoSuCuiBap/lib/investor.js';
import {passesHardFilter} from '../../GiaoSuCuiBap/lib/hard-filter.js';
import {coverageOf} from '../../GiaoSuCuiBap/lib/match-gate.js';

export const ownerText = 'Đức Trọng; Đơn Dương; Phan Thiết';
export const criteria = {investor: ownerText, province: 'Tỉnh Lâm Đồng', provinces: ['68','703']};
const names = ['UBND xã Đức Trọng','Ban quản lý dự án Đơn Dương','UBND phường Phan Thiết','UBND xã Đức Trọng','UBND xã Đức Trọng'];
export const expectedNoticeIds = ['IB2600000101-00','IB2600000102-00','IB2600000103-00'];
export const unknownNoticeId = 'IB2600000104-00';
export const outsideNoticeId = 'IB2600000105-00';
const now = '2026-09-24T03:00:00.000Z';
const rows = names.map((investorName, i) => ({notifyNo: `IB260000010${i + 1}`, notifyVersion: '00',
  bidName: `Gói kiểm thử phạm vi ${i + 1}`, investorName, investorCode: `vn001234567${i}`,
  locations: i === 3 ? [] : [{provCode: i === 4 ? '75' : i === 1 ? '68' : '703', districtCode: 'A'}],
  bidPrice: (i + 1) * 1000000, bidWinningPrice: (i + 1) * 900000,
  investField: 'XL', winningCode: ['vn0012345678'], winningContractorName: ['Nhà thầu kiểm thử'],
  contractorName: ['Nhà thầu kiểm thử'], decisionDate: now, publicDate: now, numBidderJoin: 1, statusForNotify: 'CNTTT'}));

export function unpackWorkbook(bytes) {
  const b = Buffer.from(bytes), files = {}; let offset = 0;
  while (b.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(b.readUInt16LE(offset + 8), 0);
    const size = b.readUInt32LE(offset + 18), nameLength = b.readUInt16LE(offset + 26), extra = b.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extra;
    files[b.subarray(offset + 30, offset + 30 + nameLength).toString()] = b.subarray(start, start + size).toString();
    offset = start + size;
  }
  return files;
}

export function workbookSheetXml(output, name) {
  const files = unpackWorkbook(output.bytes);
  const names = [...files['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map(match => match[1]);
  const index = names.indexOf(name);
  assert.ok(index >= 0, `Missing sheet ${name}`);
  return files[`xl/worksheets/sheet${index + 1}.xml`];
}

export async function createScopedExportFixtures() {
  const kql = rows.map(row => normalizeKqlcntRecord(row, '0012345678'));
  const groups = classifyAreaPackages(kql, criteria);
  const coverage = coverageOf({serverTotal: 5, fetched: 5, totalPages: 1, pagesRead: 1,
    match: 3, insufficient: 1, outOfRange: 1, done: true});
  const lookup = {id: 'scope-fixture-414', criteria, coverage, invalidCount: 0, duplicateCount: 0,
    packages: groups.match, insufficientPackages: groups.insufficient,
    resultStates: Object.fromEntries([...groups.match,...groups.insufficient,...groups.outOfRange].map(row => [row.key, {filterState: row.filterState, filterReason: row.filterReason}]))};
  const tenders = kql.map(row => {
    const gate = passesHardFilter(row, criteria);
    return {...row, price: row.priceBasis, closeDate: '2099-01-01T03:00:00Z', filterState: gate.state,
      filterReason: gate.reason, score: 90, matched: gate.ok};
  });
  const run = {...lookup, id: 'tbmt-scope', foundKeys: tenders.map(row => row.key),
    resultStates: Object.fromEntries(tenders.map(row => [row.key, {...row}]))};
  const plans = rows.map((row, i) => normalizeKhlcntPlan({...row, planNo: `PL260000010${i + 1}`, planVersion: '00',
    procuringEntityName: row.investorName, procuringEntityCode: row.investorCode, name: `Kế hoạch ${i + 1}`,
    bidName: [row.bidName], bidPrice: [row.bidPrice], haveBidNotNotify: 1}));
  const planGroups = classifyPlansByCriteria(plans, criteria);
  const openings = groups.match.map(row => ({...row, readState: 'OK', scannedAt: now, bidPrice: row.priceBasis,
    priceBasisLabel: 'Dự toán được duyệt (e-GP)', bidders: [{name: 'Nhà thầu kiểm thử', taxCode: '0012345678',
      bidPrice: row.winningPrice, finalPrice: row.winningPrice, finalPriceDerived: false, vsPackageAmount: row.savedAmount, vsPackageRate: row.discountRate}]}));
  const state = {tenders, runs: [run], winnerLookup: {...lookup, mode: 'exact', focusTaxCode: '0012345678', summary: summarizeWinner(groups.match)},
    areaScan: {...lookup, summary: summarizeArea(groups.match, criteria)},
    investorScan: {...lookup, mode: 'profile', criteria: {...criteria, codes: ['vn0012345670','vn0012345671','vn0012345672'], name: 'Ba đơn vị được chọn'},
      summary: summarizeInvestor(groups.match)},
    bidOpenScan: {...lookup, scope: criteria, packages: openings},
    planLookup: {...lookup, plans: planGroups.match, insufficientPlans: planGroups.insufficient}};
  const outputs = [];
  const runtime = createExportRuntime({getState: async () => structuredClone(state),
    readSearchState: async () => ({revision: 'fixture-r1'}), stamp: () => 'scope-fixture-2026-09-24',
    numOrNull: value => value == null || value === '' ? null : Number(value),
    downloadXlsx: async (filename, spec) => {outputs.push({filename, spec, bytes: buildXlsx(spec)}); return outputs.length;}});
  const invokes = [
    ['TBMT', () => runtime.exportCsv(false, tenders.filter(row => row.filterState === 'MATCH').map(row => row.key), run.id, {criteriaState: 'MATCH'}, 'fixture-r1'), 'Gói thầu', 'notifyNo'],
    ['KHLCNT', () => runtime.exportPlansCsv(), 'Kế hoạch LCNT', 'planNoStand'],
    ['BBMT', () => runtime.exportBidOpenCsv(), 'Biên bản mở thầu', 'notifyNoStand'],
    ['KQLCNT', () => runtime.exportWinnersCsv(), 'Gói đã trúng', 'notifyNoStand'],
    ['DIA-BAN', () => runtime.exportAreaXlsx(), 'Danh sách gói thầu', 'notifyNoStand'],
    ['CHU-DAU-TU', () => runtime.exportInvestorXlsx(), 'Danh sách gói thầu', 'notifyNoStand']
  ];
  for (const [kind, invoke, detailSheet, idField] of invokes) {
    await invoke(); Object.assign(outputs.at(-1), {kind, detailSheet, idField});
  }
  return {state, outputs, groups, runtime};
}
