import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTbmtQuery, buildTbmtQueries, buildKqlcntQuery, buildKqlcntQueries, buildWardMarketQuery,
  buildWardMarketQueries, normalizeKqlcntRecord} from '../GiaoSuCuiBap/lib/kqlcnt.js';
import {buildKhlcntQuery, buildKhlcntQueries, normalizeKhlcntPlan, matchesInvestor, auditPlans,
  classifyPlansByCriteria} from '../GiaoSuCuiBap/lib/khlcnt.js';
import {buildInvestorDiscoveryQuery, buildInvestorDiscoveryQueries, buildInvestorProfileQuery} from '../GiaoSuCuiBap/lib/investor.js';
import {classifyAreaPackages, summarizeArea} from '../GiaoSuCuiBap/lib/localmarket.js';
import {createIngestRuntime} from '../GiaoSuCuiBap/lib/runtime-ingest.js';
import {DEFAULT_SETTINGS} from '../GiaoSuCuiBap/lib/core.js';
import {passesHardFilter} from '../GiaoSuCuiBap/lib/hard-filter.js';

const owners = 'Đức Trọng; Đơn Dương; Phan Thiết';
const province = {province: 'Tỉnh Lâm Đồng', provinces: ['68','703']};
const kql = (id, owner, provCode = '703') => normalizeKqlcntRecord({notifyNo: `IB26000000${id}`,
  notifyVersion: '00', investorName: owner, investorCode: 'vn0012345678',
  locations: provCode ? [{provCode, districtCode: 'A'}] : [], winningCode: ['vn0987654321'],
  contractorName: ['Nhà thầu A'], bidPrice: 100, bidWinningPrice: 90});

test('414 TBMT and PL issue separate owner queries, retaining province/category/price/ward filters', () => {
  for (const build of [buildTbmtQueries, buildKhlcntQueries]) {
    const scope = {...province, wards: ['W1'], investor: owners, category: 'XL', minPrice: 10, maxPrice: 100,
      keyword: 'kênh mương'};
    const before = structuredClone(scope), queries = build(scope);
    assert.equal(queries.length, 3);
    assert.deepEqual(queries.map(query => query.keyWord), ['Đức Trọng','Đơn Dương','Phan Thiết']);
    for (const query of queries) {
      assert.deepEqual(query.filters.find(filter => filter.fieldName === 'locations.provCode').fieldValues, ['68','703']);
      assert.deepEqual(query.filters.find(filter => filter.fieldName === 'investField').fieldValues, ['XL']);
      assert.ok(query.matchFields.includes('investorCode'));
      assert.ok(query.matchFields.includes('procuringEntityName'));
    }
    assert.deepEqual(scope, before);
  }
});

test('414 native singular builders reject multiple or invalid owners instead of broadening', () => {
  for (const build of [buildTbmtQuery, buildKhlcntQuery, buildKqlcntQuery, buildWardMarketQuery]) {
    assert.throws(() => build({investor: owners}));
    for (const investor of ['; ;', [], {}, 'A'.repeat(501)]) assert.throws(() => build({investor}));
  }
  assert.throws(() => buildInvestorDiscoveryQuery({keyword: owners}));
  assert.throws(() => buildInvestorDiscoveryQuery({keyword: ';'}));
});

test('414 blank and single owner queries remain compatible and commas stay inside names', () => {
  for (const [buildOne, buildMany] of [[buildTbmtQuery, buildTbmtQueries], [buildKhlcntQuery, buildKhlcntQueries]]) {
    for (const investor of ['', 'Đức Trọng', 'Ban quản lý đầu tư, xây dựng Đức Trọng']) {
      assert.deepEqual(buildMany({...province, investor, keyword: 'kênh mương'}), [buildOne({...province, investor, keyword: 'kênh mương'})]);
    }
  }
  assert.equal(buildTbmtQueries({investor: 'Đức Trọng; duc trong\nĐơn Dương'}).length, 2);
});

test('414 winner query combines known winner code with each owner, while contractor discovery runs once', () => {
  const queries = buildKqlcntQueries({taxCodes: ['0987654321'], investor: owners});
  assert.equal(queries.length, 3);
  for (const query of queries) {
    assert.deepEqual(query.filters.find(filter => filter.fieldName === 'winningCode').fieldValues, ['vn0987654321']);
    assert.ok(query.matchFields.includes('investorName'));
  }
  const discovery = buildKqlcntQueries({keyword: 'Công ty A', investor: owners});
  assert.equal(discovery.length, 1);
  assert.equal(discovery[0].keyWord, 'Công ty A');
  assert.deepEqual(discovery[0].matchFields, ['contractorName']);
  assert.throws(() => buildKqlcntQueries({keyword: 'Công ty A', investor: ';'}));
});

test('414 area owner queries keep legacy ward fallback without invented e-GP OR syntax', () => {
  const queries = buildWardMarketQueries({investor: owners, ward: 'Không dùng', fromYear: 2025, fields: ['XL']});
  assert.deepEqual(queries.map(query => query.keyWord), ['Đức Trọng','Đơn Dương','Phan Thiết']);
  assert.ok(queries.every(query => query.filters.some(filter => filter.fieldName === 'publicDate')));
  assert.deepEqual(buildWardMarketQueries({ward: 'Xã Đức Trọng; Huyện Đơn Dương'}).map(query => query.keyWord), ['Đức Trọng','Đơn Dương']);
  assert.deepEqual(buildWardMarketQueries({}), []);
  assert.equal(buildWardMarketQuery({}), null);
});

test('414 investor discovery fans out names, while exact profile identities stay exact', () => {
  const queries = buildInvestorDiscoveryQueries({keyword: owners, provinces: ['703']});
  assert.deepEqual(queries.map(query => query.keyWord), ['Đức Trọng','Đơn Dương','Phan Thiết']);
  assert.ok(queries.every(query => query.filters.some(filter => filter.fieldName === 'locations.provCode')));
  const exact = buildInvestorProfileQuery({codes: ['vn0012345678','vn0987654321']});
  assert.deepEqual(exact.filters.find(filter => filter.fieldName === 'investorCode').fieldValues, ['vn0012345678','vn0987654321']);
  assert.equal(exact.keyWord, undefined);
});

test('414 PL audit uses OR owners plus province AND and exact code identities', () => {
  const make = (planNo, investorName, provCode) => normalizeKhlcntPlan({planNo, investorName,
    investorCode: 'vn0012345678', locations: [{provCode}], bidName: ['Thi công kênh mương'], bidPrice: [100]});
  const plans = [make('PL1','UBND xã Đức Trọng','703'), make('PL2','Ban QLDA Đơn Dương','68'),
    make('PL3','UBND phường Phan Thiết','68'), make('PL4','UBND xã Khác','703'), make('PL5','UBND xã Đức Trọng','75')];
  const criteria = {...province, investor: owners};
  assert.deepEqual(auditPlans(plans, criteria).map(plan => plan.planNo), ['PL4','PL5']);
  assert.equal(matchesInvestor(plans[0], '0012345678'), true);
  assert.equal(matchesInvestor(plans[0], '00123456780'), false);
  assert.equal(matchesInvestor(plans[0], ';'), false);
});

test('414 PL child owner identities cannot inherit a different parent alias', () => {
  const plan = {key: 'PL1', investorName: 'UBND xã Đức Trọng', investorNames: ['UBND xã Đức Trọng'],
    investorCode: 'vn0012345678', investorCodes: ['vn0012345678'], procuringEntityName: 'Ban QLDA Đức Trọng',
    provinceCodes: ['703'], packages: [{name: 'Gói của xã khác', price: 10, investorName: 'UBND xã Khác'},
      {name: 'Gói kế thừa chủ đầu tư', price: 20}]};
  const before = structuredClone(plan), result = classifyPlansByCriteria([plan], {...province, investor: owners});
  assert.equal(result.counts.match, 1);
  assert.equal(result.counts.outOfRange, 1);
  assert.equal(result.match[0].packages[0].name, 'Gói kế thừa chủ đầu tư');
  assert.deepEqual(plan, before);
});

test('414 KQL normalization retains code-only locations and every source owner identity', () => {
  const result = normalizeKqlcntRecord({notifyNo: 'IB2600000001', investorName: 'UBND xã Khác', investorCode: 'vn0012345678',
    procuringEntityName: 'Ban QLDA Phan Thiết', procuringEntityCode: 'vn0987654321',
    locations: [{provinceCode: '703', districtCode: 'A'}]});
  assert.deepEqual(result.investorNames, ['UBND xã Khác','Ban QLDA Phan Thiết']);
  assert.deepEqual(result.investorCodes, ['vn0012345678','vn0987654321']);
  assert.deepEqual(result.provinceCodes, ['703']);
  assert.equal(passesHardFilter(result, {...province, investor: owners}).state, 'MATCH');
  assert.equal(passesHardFilter(result, {provinces: ['75'], investor: owners}).state, 'OUT_OF_RANGE');
});

test('414 area reports owner-OR/province-AND, missing province separately, and deduplicates overlapping matches', () => {
  const rows = [kql('01','UBND xã Đức Trọng'), kql('02','Ban QLDA Đơn Dương'), kql('03','UBND phường Phan Thiết','68'),
    kql('04','UBND xã Đức Trọng','75'), kql('05','UBND xã Khác'), kql('06','UBND xã Đức Trọng','')];
  const before = structuredClone(rows), result = classifyAreaPackages([...rows, rows[0]], {...province, investor: owners});
  assert.deepEqual(result.counts, {match: 3, insufficient: 1, outOfRange: 2});
  assert.equal(result.insufficient[0].notifyNo, 'IB2600000006');
  assert.equal(summarizeArea(result.match).packageCount, 3);
  assert.equal(summarizeArea(result.match).totalValue, 270);
  assert.deepEqual(rows, before);
  assert.equal(classifyAreaPackages(rows, {...province, investor: ';'}).match.length, 0);
});

test('414 area legacy owner locality does not silently become a province or administrative ward claim', () => {
  const row = kql('01','Ban QLDA huyện Đức Trọng');
  assert.equal(classifyAreaPackages([row], {...province, ward: 'Xã Đức Trọng; Đơn Dương'}).match.length, 1);
  assert.equal(classifyAreaPackages([kql('02','UBND xã Đức Trọng','')], {...province, investor: owners}).insufficient.length, 1);
});

test('414 ingestion snapshots retain owner codes and separate names needed for later scoped history', async () => {
  let state = {settings: {...DEFAULT_SETTINGS, maxStoredTenders: 3000}, tenders: [], participations: [], watchedInvestors: [],
    runs: [{id: 'run1', criteria: {investor: owners}, foundKeys: [], resultStates: {}}]};
  const runtime = createIngestRuntime({getState: async () => state, save: async patch => Object.assign(state, patch),
    scoredWithGate: record => {const gate = passesHardFilter(record, {investor: owners}); return {filterState: gate.state, filterReason: gate.reason, score: 70, matched: gate.ok};},
    publicFilterCriteria: value => value, KEYS: {tenders: 'tenders', runs: 'runs', participations: 'participations', schemaHealth: 'schemaHealth', amendmentLog: 'amendmentLog', activeRun: 'activeRun'},
    withLock: callback => callback()});
  await runtime.ingest([{notifyNo: 'IB2600000001', bidName: 'Thi công trường học', investorName: 'UBND xã Đức Trọng',
    investorCode: 'vn0012345678', procuringEntityName: 'Ban QLDA Đức Trọng', procuringEntityCode: 'vn0987654321'}], {runId: 'run1'});
  const snapshot = Object.values(state.runs[0].resultStates)[0];
  assert.equal(snapshot.investorCode, 'vn0012345678');
  assert.equal(snapshot.procuringEntityCode, 'vn0987654321');
  assert.equal(snapshot.procuringEntityName, 'Ban QLDA Đức Trọng');
  assert.equal(passesHardFilter(snapshot, {investor: '0012345678'}).state, 'MATCH');
});
