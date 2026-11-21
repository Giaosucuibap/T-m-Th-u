import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeKhlcntPlan, needsKhlcntPackageDetails, applyKhlcntPackageDetail,
  classifyPlansByCriteria } from '../GiaoSuCuiBap/lib/khlcnt.js';
import { parseDate } from '../GiaoSuCuiBap/lib/core.js';

// Public native search + detail captured on 05/10/2026. These tests replay a
// frozen receipt and do not claim another live e-GP request took place.
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/egp-plan-detail-PL2600333000-20261005.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const base = () => normalizeKhlcntPlan(structuredClone(fixture.searchRow));
const receipt = () => ({url:fixture.url, status:fixture.status, capturedAt:fixture.capturedAt,
  header:structuredClone(fixture.data.bidPoBidpPlanProjectDetailView),
  packages:structuredClone(fixture.data.bidpPlanDetailToProjectList)});
const criteria = {investor:'vn5800939408', province:'Tỉnh Lâm Đồng', provinceCodes:['68'],
  category:'XL', fromDate:'2026-07-07', toDate:'2026-10-05'};

test('Observed paired detail recovers correct construction package prices and explicit official fields', () => {
  const plan = base(), native = receipt();
  const beforePlan = JSON.stringify(plan), beforeReceipt = JSON.stringify(native);
  assert.equal(needsKhlcntPackageDetails(plan), true);
  assert.equal(classifyPlansByCriteria([plan], criteria).match.length, 0);
  const result = applyKhlcntPackageDetail(plan, native);
  assert.equal(result.ok, true, result.message);
  assert.equal(JSON.stringify(plan), beforePlan);
  assert.equal(JSON.stringify(native), beforeReceipt);
  assert.equal(needsKhlcntPackageDetails(result.plan), false);
  assert.deepEqual(result.plan.packages.map(pkg => [pkg.bidNo,pkg.price,pkg.fieldCode]), [
    ['BP2600838007',51197946,'TV'], ['BP2600838021',1788792936,'XL'],
    ['BP2600838043',71728323,'TV'], ['BP2600838106',744649682068,'XL'],
    ['BP2600838169',6494920366,'TV'], ['BP2600838189',2223659215,'PTV']
  ]);
  const checked = classifyPlansByCriteria([result.plan], criteria);
  assert.equal(checked.insufficient.length, 0);
  assert.deepEqual(checked.match[0].packages.map(pkg => pkg.bidNo), ['BP2600838021','BP2600838106']);
  assert.equal(checked.match[0].totalPackagePrice, 746438475004);
  assert.equal(checked.match[0].originalPackageCount, 6);
  assert.equal(checked.match[0].originalTotalPackagePrice, result.plan.totalPackagePrice);
  assert.equal(result.plan.investorCode, 'vn5800939408');
  assert.deepEqual(result.plan.locations, plan.locations);
  assert.equal(result.plan.capturedAt, plan.capturedAt);
  assert.equal(result.plan.decisionDate, parseDate(fixture.data.bidPoBidpPlanProjectDetailView.decisionDate));
  assert.notEqual(result.plan.decisionDate, parseDate(fixture.data.project.decisionDate));
});

test('Detail receipt is rejected for a different plan, version, URL, partial table or duplicate child', () => {
  const cases = [
    native => {native.status = 500;},
    native => {native.header.id = 'another-plan-id';},
    native => {native.header.planNo = 'PL2600000001';},
    native => {native.header.planVersion = '01';},
    native => {delete native.header.planVersion;},
    native => {native.url = native.url.replace('muasamcong.mpi.gov.vn','example.org');},
    native => {native.url = native.url.replace('id=f87391ba-3d03-4330-b623-2e817fe296c6','id=another-plan-id');},
    native => {native.url += '&id=another-plan-id';},
    native => {native.url = native.url.replace('step=khlcnt','step=tbmt');},
    native => {native.header.bidPack = null;},
    native => {native.packages.pop();},
    native => {native.packages[1] = structuredClone(native.packages[0]);},
    native => {native.packages[0].idPlan = 'another-plan-id';},
    native => {native.packages[0].planNo = 'PL2600000001';},
    native => {native.packages[0].bidName = null;},
    native => {native.packages[0].id = null; native.packages[0].bidNo = null;}
  ];
  for (const alter of cases) {
    const plan = base(), native = receipt(); alter(native);
    const before = JSON.stringify(plan);
    const result = applyKhlcntPackageDetail(plan, native);
    assert.equal(result.ok, false, alter.toString());
    assert.ok(result.reason && result.message);
    assert.equal(Object.hasOwn(result, 'plan'), false);
    assert.equal(JSON.stringify(plan), before);
  }
});

test('Null same-owner aliases inherit the verified parent; an explicit different child owner replaces it', () => {
  const native = receipt();
  native.packages[3].investorName = 'Chủ đầu tư khác';
  native.packages[3].investorCode = 'vn9999999999';
  const result = applyKhlcntPackageDetail(base(), native);
  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.plan.packages[1], 'investorName'), false);
  assert.equal(Object.hasOwn(result.plan.packages[1], 'investorCode'), false);
  const checked = classifyPlansByCriteria([result.plan], criteria);
  assert.deepEqual(checked.match[0].packages.map(pkg => pkg.bidNo), ['BP2600838021']);
  const foreign = checked.outOfRange.flatMap(plan => plan.packages).find(pkg => pkg.bidNo === 'BP2600838106');
  assert.equal(foreign.filterState, 'OUT_OF_RANGE');
  assert.ok(foreign.filterReasons.some(reason => reason.field === 'investor'));
});

test('A child location replaces the parent area; an empty native location does not erase it', () => {
  const native = receipt();
  native.packages[1].locations = [{provCode:'79',provName:'Thành phố Hồ Chí Minh'}];
  native.packages[3].locations = [null,{}];
  const result = applyKhlcntPackageDetail(base(), native);
  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.plan.packages[3], 'locations'), false);
  const checked = classifyPlansByCriteria([result.plan], criteria);
  assert.deepEqual(checked.match[0].packages.map(pkg => pkg.bidNo), ['BP2600838106']);
  assert.equal(checked.outOfRange.flatMap(plan => plan.packages).find(pkg => pkg.bidNo === 'BP2600838021').filterState, 'OUT_OF_RANGE');
  result.plan.packages[1].locations[0].provCode = 'changed';
  assert.equal(native.packages[1].locations[0].provCode, '79');
});

test('Missing official sector, malformed prices and foreign currencies stay unknown after bound detail', () => {
  for (const alter of [
    row => {row.bidField = null;},
    row => {row.bidPrice = [744649682068,1];},
    row => {row.bidPrice = 'error 744649682068';},
    row => {row.bidPrice = -1;},
    row => {row.bidPriceUnit = 'USD';},
    row => {row.bidPriceUnit = null;}
  ]) {
    const native = receipt(); alter(native.packages[3]);
    const result = applyKhlcntPackageDetail(base(), native);
    assert.equal(result.ok, true);
    const checked = classifyPlansByCriteria([result.plan], criteria);
    assert.deepEqual(checked.match[0].packages.map(pkg => pkg.bidNo), ['BP2600838021']);
    assert.equal(checked.insufficient[0].packages[0].bidNo, 'BP2600838106');
    assert.equal(needsKhlcntPackageDetails(result.plan), false, 'Missing source data is disclosed without refetching forever');
  }
});

test('Native detail cannot bypass the approval date window', () => {
  const native = receipt(); native.header.decisionDate = '2023-06-14';
  const result = applyKhlcntPackageDetail(base(), native);
  assert.equal(result.ok, true);
  const checked = classifyPlansByCriteria([result.plan], criteria);
  assert.equal(checked.match.length, 0);
  assert.equal(checked.insufficient.length, 0);
  assert.equal(checked.outOfRange[0].packages.length, 6);
  assert.ok(checked.outOfRange[0].packages.every(pkg => pkg.filterReasons.some(reason => reason.field === 'date')));
});
