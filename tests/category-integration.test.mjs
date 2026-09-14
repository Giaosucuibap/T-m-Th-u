import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCriteria, safeSavedSearches} from '../lib/workspace.js';
import {safeRunForBackup} from '../lib/backup.js';
import {buildTbmtQuery} from '../lib/kqlcnt.js';
import {buildKhlcntQuery, normalizeKhlcntPlan, filterPlansByCategory, summarizeKhlcnt} from '../lib/khlcnt.js';

test('Both query types send the base field and preserve independent criteria',()=>{
  for(const build of [buildTbmtQuery,buildKhlcntQuery]){
    const query=build({category:'TV_SUPERVISION',investor:'Ban QLDA',keyword:'cầu',provinces:['68','703']});
    assert.equal(query.keyWord,'Ban QLDA');
    assert.deepEqual(query.filters.find(f=>f.fieldName==='investField').fieldValues,['TV']);
    assert.deepEqual(query.filters.find(f=>f.fieldName==='locations.provCode').fieldValues,['68','703']);
    assert.equal(build({keyword:'cầu'}).filters.some(f=>f.fieldName==='investField'),false);
    assert.deepEqual(build({category:'XL'}).filters.find(f=>f.fieldName==='investField').fieldValues,['XL']);
  }
});

test('Category-only criteria work; invalid values are rejected and old presets retain all categories',()=>{
  assert.equal(validateCriteria({category:'TV_DESIGN'}).ok,true);
  assert.equal(validateCriteria({category:'injected'}).ok,false);
  assert.equal(validateCriteria({keyword:'cầu'}).criteria.category,'');
  const saved=safeSavedSearches([{id:'design',name:'Thiết kế',criteria:{category:'TV_DESIGN'}},{id:'old',name:'Cũ',criteria:{keyword:'cầu'}}]);
  assert.deepEqual(saved.map(x=>x.criteria.category),['TV_DESIGN','']);
  assert.equal(safeRunForBackup({id:'1',criteria:saved[0].criteria}).criteria.category,'TV_DESIGN');
});

const mixed=()=>normalizeKhlcntPlan({planNo:'PL2600000001',investField:['XL','TV'],
  bidName:['Thi công trường học','Tư vấn thiết kế trường học','Tư vấn giám sát trường học','Gói số 4'],
  bidPrice:[8000000000,200000000,300000000,50000000]});

test('A mixed plan returns matching children only and keeps original totals without mutating input',()=>{
  const plan=mixed(), original=JSON.stringify(plan);
  const result=filterPlansByCategory([plan],'TV_DESIGN');
  assert.equal(result.kept.length,1);assert.equal(result.kept[0].packages.length,1);
  assert.equal(result.kept[0].packages[0].name,'Tư vấn thiết kế trường học');
  assert.equal(result.kept[0].totalPackagePrice,200000000);
  assert.equal(result.kept[0].originalTotalPackagePrice,8550000000);
  assert.equal(result.kept[0].originalPackageCount,4);
  assert.equal(result.unknownPackages,1);
  assert.equal(summarizeKhlcnt(result.kept).totalValue,200000000);
  assert.equal(JSON.stringify(plan),original);
  assert.equal(filterPlansByCategory([plan],'').kept[0],plan);
});

test('Single declared field can classify unnamed tasks; mixed plan fields cannot',()=>{
  const plan=normalizeKhlcntPlan({planNo:'PL2600000002',investField:['XL'],bidName:['Gói thầu số 1'],bidPrice:[123]});
  assert.equal(filterPlansByCategory([plan],'XL').kept.length,1);
  assert.equal(filterPlansByCategory([{...plan,fieldCodes:['XL','TV']}],'XL').kept.length,0);
  assert.equal(filterPlansByCategory([{...plan,packages:[{...plan.packages[0],investField:'TV'}]}],'XL').kept.length,0);
  assert.equal(filterPlansByCategory([{...plan,packages:[{name:'Tư vấn giám sát',bidField:'TV',price:123}]}],'XL').kept.length,0);
  assert.equal(filterPlansByCategory([{...plan,packages:[{name:'Tư vấn giám sát',bidField:'TV',price:123}]}],'TV_SUPERVISION').kept.length,1);
  const unknownField=normalizeKhlcntPlan({planNo:'PL2600000005',investField:['XL','FUTURE_CODE'],bidName:['Gói thầu số 1'],bidPrice:[123]});
  assert.equal(filterPlansByCategory([unknownField],'XL').kept.length,0);
});

test('Plan package names and prices remain aligned when a source entry has no name',()=>{
  const plan=normalizeKhlcntPlan({planNo:'PL2600000003',bidName:['','Tư vấn giám sát'],bidPrice:[999,123]});
  assert.equal(plan.packages[0].price,123);
  const detailed=normalizeKhlcntPlan({planNo:'PL2600000004',bidNamePlanNew:[{name:''},{name:'Gói 2',investField:'TV'}],bidPrice:[999,456]});
  assert.equal(detailed.packages[0].price,456);assert.equal(detailed.packages[0].investField,'TV');
});

test('No matching category produces an empty plan result instead of keeping the previous plan',()=>{
  const result=filterPlansByCategory([mixed()],'HH');
  assert.equal(result.kept.length,0);assert.equal(result.dropped,1);
});
