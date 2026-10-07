import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeKhlcntPlan, applyKhlcntPackageDetail, classifyPlansByCriteria,
  restoreLegacyKhlcntView } from '../GiaoSuCuiBap/lib/khlcnt.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/egp-plan-detail-PL2600333000-20261005.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const criteria = {category:'XL',fromDate:'2026-07-07',toDate:'2026-10-05'};
const legacy = () => ({id:'old-lookup',status:'SUCCESS',criteria,userNotes:'Giữ công việc đã ghi',plans:[{
  key:'PL2600333000::00',planNo:'PL2600333000',version:'00',planNoStand:'PL2600333000-00',
  decisionDate:'2026-10-02',publicDate:'2026-10-02',name:'Kế hoạch cũ',wards:[],fields:['Xây lắp'],
  packages:[{name:'Thi công A',price:51197946,fieldCode:'XL',userNote:'Cần đối chiếu'},
    {name:'Thi công B',price:71728323,fieldCode:'XL'}],packageCount:2,totalPackagePrice:122926269,
  originalTotalPackagePrice:755279980854,detailUrl:fixture.url}],insufficientPlans:[],
  resultStates:{'PL2600333000::00':{filterState:'MATCH'}},
  coverage:{serverTotal:1,fetched:1,match:1,insufficient:0,outOfRange:0,pagesRead:1,totalPages:1,done:true,complete:true}});

test('An old normalized price is retained for review but removed from displayed and exportable matches',()=>{
  const old=legacy(),before=JSON.stringify(old),fixed=restoreLegacyKhlcntView(old);
  assert.equal(JSON.stringify(old),before);
  assert.equal(fixed.userNotes,'Giữ công việc đã ghi');
  assert.equal(fixed.status,'PARTIAL');assert.equal(fixed.legacyPlanDataReviewRequired,true);
  assert.match(fixed.legacyPlanDataNotice,/Bản lưu cũ cần tra lại/);
  assert.equal(fixed.plans.length,0);assert.equal(fixed.summary.packageCount,0);assert.equal(fixed.summary.totalValue,0);
  const row=fixed.insufficientPlans[0];
  assert.equal(row.key,old.plans[0].key);assert.equal(row.detailUrl,fixture.url);
  assert.equal(row.originalTotalPackagePrice,null);
  assert.equal(row.legacySavedTotalPackagePrice,122926269);
  assert.deepEqual(row.packages.map(pkg=>[pkg.price,pkg.legacySavedPrice]),[[null,51197946],[null,71728323]]);
  assert.equal(row.packages[0].userNote,'Cần đối chiếu');
  assert.equal(fixed.coverage.match,0);assert.equal(fixed.coverage.insufficient,1);assert.equal(fixed.coverage.complete,false);
  assert.equal(fixed.resultStates[row.key].filterState,'INSUFFICIENT');
  assert.equal(restoreLegacyKhlcntView(fixed),fixed,'Repairing a view twice is idempotent');
});

test('Split legacy projections retain every unidentified child, including equal names',()=>{
  const old=legacy();old.insufficientPlans=[{...old.plans[0],packages:[{name:'Thi công A',price:99,fieldCode:'XL'}]}];
  const fixed=restoreLegacyKhlcntView(old);
  assert.equal(fixed.insufficientPlans[0].packages.length,3);
  assert.deepEqual(fixed.insufficientPlans[0].packages.map(pkg=>pkg.legacySavedPrice),[51197946,71728323,99]);
});

test('An explicit verified canonical child preserves its price and the original full plan total',()=>{
  const plan=normalizeKhlcntPlan(fixture.searchRow);
  const bound=applyKhlcntPackageDetail(plan,{url:fixture.url,status:200,header:fixture.data.bidPoBidpPlanProjectDetailView,
    packages:fixture.data.bidpPlanDetailToProjectList}).plan;
  const selected=classifyPlansByCriteria([bound],criteria).match;
  const old={...legacy(),plans:selected,resultStates:{[bound.key]:{filterState:'MATCH'}}};
  const fixed=restoreLegacyKhlcntView(old);
  assert.equal(fixed.plans[0].totalPackagePrice,746438475004);
  assert.equal(fixed.plans[0].originalTotalPackagePrice,755279980854);
  assert.equal(fixed.plans[0].originalPackageCount,6);
  assert.equal(fixed.summary.totalValue,746438475004);
  assert.equal(fixed.legacyPlanDataReviewRequired,undefined);
});

test('A naked child id/bidPrice cannot pretend it came from a verified canonical table',()=>{
  const old=legacy();Object.assign(old.plans[0],{sourceId:fixture.searchRow.id});
  Object.assign(old.plans[0].packages[0],{id:'fake-bound-id',idPlan:fixture.searchRow.id,planNo:fixture.searchRow.planNo,
    bidPrice:51197946,bidPriceUnit:'VND',priceSource:'plan-detail.bidPrice'});
  const fixed=restoreLegacyKhlcntView(old);
  assert.equal(fixed.insufficientPlans[0].packages[0].price,null);
  assert.equal(fixed.insufficientPlans[0].packages[0].bidPrice,null);
  assert.equal(fixed.insufficientPlans[0].packages[0].legacySavedBidPrice,51197946);
});

test('Legacy repair does not bypass owner/date gates or touch a version 2 job',()=>{
  const old=legacy();old.plans[0].decisionDate='2023-06-14';
  const fixed=restoreLegacyKhlcntView(old);
  assert.equal(fixed.plans.length,0);assert.equal(fixed.insufficientPlans.length,0);
  assert.equal(fixed.resultStates[old.plans[0].key].filterState,'OUT_OF_RANGE');
  const modern={...legacy(),planDataVersion:2};assert.equal(restoreLegacyKhlcntView(modern),modern);
  assert.equal(restoreLegacyKhlcntView(null),null);
});
