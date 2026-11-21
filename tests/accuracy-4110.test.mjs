import test from 'node:test';
import assert from 'node:assert/strict';
import { tenderFieldOf, matchesTenderCategory } from '../GiaoSuCuiBap/lib/tender-categories.js';
import { normalizeCandidate, isConstructionTender } from '../GiaoSuCuiBap/lib/core.js';
import { normalizeBbmtPackage } from '../GiaoSuCuiBap/lib/bbmt.js';
import { normalizeKhlcntPlan, classifyPlansByCriteria, filterPlansByCategory } from '../GiaoSuCuiBap/lib/khlcnt.js';
import { passesHardFilter } from '../GiaoSuCuiBap/lib/hard-filter.js';
import { matchesAreaCodes, matchesWardCodes, resolveWardSelection, recordWardIdentities } from '../GiaoSuCuiBap/lib/area-match.js';
import { wardIdentitiesForProvince, wardCodesByName } from '../GiaoSuCuiBap/lib/areas.js';

// Synthetic identities intentionally repeat across parents and use names
// also found on investor labels; no fixture claims to be an official catalog.
const areas={provinces:[{code:'68',name:'Tỉnh Lâm Đồng'},{code:'703',name:'Tỉnh Lâm Đồng'},{code:'75',name:'Tỉnh Đồng Nai'}],wardsByProvince:{
  68:[{code:'NEW',parentCode:'68',name:'Xã Đức Trọng',current:true},{code:'OTHER',parentCode:'68',name:'Xã Đức Trọng Bắc',current:true}],
  703:[{code:'OLD',parentCode:'703',name:'Xã Đức Trọng',current:false}],
  75:[{code:'NEW',parentCode:'75',name:'Xã Đức Trọng',current:true}]
}};
const criteria={province:'Lâm Đồng',ward:'Xã Đức Trọng',wardIdentities:[{code:'NEW',parentCode:'68'}]};
const state=(record,selected=criteria)=>passesHardFilter(record,selected,areas).state;

test('411 official investField overrides every conflicting field alias and misleading construction title',()=>{
  for(const alias of ['fieldCode','bidField','field','fieldRaw','investFieldName','bidFieldName','fieldName','fieldLabel']) {
    const raw={notifyNo:'IB2600000001',investField:'TV',[alias]:'XL',bidName:'Giám sát thi công xây lắp',projectName:'Xây dựng cầu',rawText:'Xây lắp'};
    for(const item of [raw,normalizeCandidate(raw),normalizeBbmtPackage(raw)]) {
      assert.equal(tenderFieldOf(item),'TV',alias);
      assert.equal(isConstructionTender(item),false,alias);
      assert.equal(passesHardFilter(item,{category:'XL'}).state,'OUT_OF_RANGE');
      assert.equal(passesHardFilter(item,{requireConstruction:true}).state,'OUT_OF_RANGE');
    }
  }
  assert.equal(tenderFieldOf({investField:['TV'],fieldCode:'XL'}),'TV');
  assert.equal(tenderFieldOf({investField:'Tư vấn',fieldCode:'XL'}),'TV');
  for(const investField of ['FUTURE_CODE',['XL','TV']]) assert.equal(tenderFieldOf({investField,fieldCode:'XL'}),'');
});

test('411 package titles help consulting subtypes only after a source TV classification',()=>{
  for(const name of ['Thi công xây dựng','Xây lắp trường học','Tư vấn thiết kế','TVGS thi công','Mua sắm thiết bị','Dịch vụ bảo vệ']) {
    assert.equal(tenderFieldOf({name}),'',name);
    assert.equal(passesHardFilter({name},{category:'XL'}).state,'INSUFFICIENT');
    assert.equal(passesHardFilter({name},{requireConstruction:true}).state,'INSUFFICIENT');
  }
  assert.equal(matchesTenderCategory({investField:'TV',name:'TVGS thi công'},'TV_SUPERVISION'),true);
  assert.equal(matchesTenderCategory({investField:'HH',name:'Tư vấn thiết kế'},'TV_DESIGN'),false);
});

test('411 province 703 remains Lâm Đồng; same-name catalogs preserve current and legacy identities',()=>{
  assert.equal(matchesAreaCodes({provinceCode:'703'},'Lâm Đồng',areas).ok,true);
  assert.equal(matchesAreaCodes({provinceCode:'703'},'Đồng Nai',areas).ok,false);
  assert.deepEqual(wardIdentitiesForProvince(areas,'Lâm Đồng').filter(x=>x.name==='Xã Đức Trọng').map(x=>[x.code,x.parentCode]),[['NEW','68'],['OLD','703']]);
  assert.deepEqual(wardCodesByName(areas,'Lâm Đồng','Đức Trọng'),['NEW','OLD']);
  assert.deepEqual(wardCodesByName(areas,'Lâm Đồng','Đức'),[]);
});

test('411 ward membership requires both exact code and exact parent; names cannot repair conflicts',()=>{
  assert.equal(state({provinceCode:'68',locations:[{districtCode:'NEW',provCode:'68'}]}),'MATCH');
  assert.equal(state({provinceCode:'68',locations:[{districtCode:'OTHER',provCode:'68',districtName:'Xã Đức Trọng'}]}),'OUT_OF_RANGE');
  assert.equal(matchesWardCodes({locations:[{wardCode:'NEW',provCode:'75'}]},criteria,areas).state,'OUT_OF_RANGE');
  assert.equal(state({provinceCode:'68',wardCode:'NEW',parentCode:'703',wardName:'Xã Đức Trọng'}),'OUT_OF_RANGE');
  assert.equal(state({provinceCode:'703',locations:[{districtCode:'OLD',provCode:'703'}]}, {...criteria,wardIdentities:[{code:'OLD',parentCode:'703'}]}),'MATCH');
  assert.equal(state({provinceCode:'703',locations:[{districtCode:'OLD',provCode:'703'}]}),'OUT_OF_RANGE');
});

test('411 missing ward identity and ambiguous selections remain insufficient instead of nationwide',()=>{
  for(const record of [{location:'Xã Đức Trọng - Lâm Đồng'},{provinceCode:'68',wardName:'Xã Đức Trọng'},{wardCode:'NEW'},{investorName:'Ban QLDA Đức Trọng'}]) {
    assert.equal(matchesWardCodes(record,criteria,areas).state,'INSUFFICIENT');
  }
  for(const selected of [{ward:'Đức Trọng'}, {province:'Lâm Đồng',ward:'Đức Trọng'}, {province:'Lâm Đồng',ward:'Đức'},
    {wardCode:'NEW'}, {wardIdentities:[{code:'NEW'}]}, {provinces:['75'],wardIdentities:[{code:'NEW',parentCode:'68'}]},
    {province:'Không tồn tại',ward:'Đức Trọng'}]) assert.equal(resolveWardSelection(selected,areas).state,'INSUFFICIENT',JSON.stringify(selected));
  assert.deepEqual(resolveWardSelection({province:'Lâm Đồng',ward:'Đức Trọng Bắc'},areas).identities,[{code:'OTHER',parentCode:'68',name:'Xã Đức Trọng Bắc'}]);
  assert.equal(matchesWardCodes({},{}).ok,true);
  assert.deepEqual(recordWardIdentities({provinceCodes:['68','75'],wardCodes:['NEW','OTHER']}),[]);
});

test('411 native location pairs survive TBMT, BBMT and KHLCNT normalization',()=>{
  const locations=[{provCode:'68',districtCode:'NEW',districtName:'Xã Đức Trọng'},{provCode:'703',districtCode:'OLD',districtName:'Xã Đức Trọng'}];
  const raw={notifyNo:'IB2600000001',planNo:'PL2600000001',bidName:['Thi công cầu'],investField:['TV'],fieldCode:'XL',locations};
  for(const item of [normalizeCandidate(raw),normalizeBbmtPackage(raw),normalizeKhlcntPlan(raw)]) {
    assert.deepEqual(item.locations,locations);
    assert.deepEqual(item.wardIdentities,[{code:'NEW',parentCode:'68'},{code:'OLD',parentCode:'703'}]);
    assert.equal(state(item),'MATCH');
    assert.equal(state(JSON.parse(JSON.stringify(item))),'MATCH');
  }
});

test('411 each child uses its own field and source location; aggregate fields cannot contaminate siblings',()=>{
  const plan=normalizeKhlcntPlan({planNo:'PL2600000001',investField:['XL','TV'],locations:[{provCode:'68',districtCode:'NEW'}],
    bidNamePlanNew:[{name:'Giám sát thi công',investField:'TV',fieldCode:'XL'},{name:'Thi công trường học'},
      {name:'Xây cầu',investField:'XL',locations:[{provCode:'68',districtCode:'OTHER'}]}],bidPrice:[1,2,3]});
  const result=classifyPlansByCriteria([plan],{...criteria,category:'XL'},areas);
  assert.deepEqual(result.counts,{packages:3,match:0,insufficient:1,outOfRange:2,missingPackageTables:0});
  assert.equal(result.insufficient[0].packages[0].name,'Thi công trường học');
  assert.equal(filterPlansByCategory([plan],'TV_SUPERVISION').kept[0].packages[0].investField,'TV');
  const aggregate=normalizeKhlcntPlan({planNo:'PL2600000002',investField:['XL'],bidName:['Thi công trường','Thi công cầu']});
  assert.equal(classifyPlansByCriteria([aggregate],{category:'XL'}).counts.insufficient,2);
  const singleton=normalizeKhlcntPlan({planNo:'PL2600000003',investField:['XL'],bidName:['Gói số 1']});
  assert.equal(classifyPlansByCriteria([singleton],{category:'XL'}).counts.match,1);
});

test('411 ward resolution is pure and never widens a selected pair to same-name legacy options',()=>{
  const input=Object.freeze({...criteria,wardIdentities:Object.freeze([Object.freeze({code:'NEW',parentCode:'68'})]),wardCode:'NEW',wardParentCode:'68'});
  const before=JSON.stringify(input);
  assert.deepEqual(resolveWardSelection(input,areas).codes,['NEW']);
  assert.equal(JSON.stringify(input),before);
});
