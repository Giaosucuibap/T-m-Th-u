import test from 'node:test';
import assert from 'node:assert/strict';
import {isUnknownCategory,categoryLabel,matchesTenderCategory,tenderFieldOf,summarizeTenderFields} from '../GiaoSuCuiBap/lib/tender-categories.js';
import {classifyPlansByCriteria,filterPlansByCategory,normalizeKhlcntPlan} from '../GiaoSuCuiBap/lib/khlcnt.js';
import {validateCriteria} from '../GiaoSuCuiBap/lib/workspace.js';
import {passesHardFilter} from '../GiaoSuCuiBap/lib/hard-filter.js';
import {matchesWardCodes} from '../GiaoSuCuiBap/lib/area-match.js';
import {createWardPicker,wardCatalogErrorMessage} from '../GiaoSuCuiBap/ward-picker.js';

const selected={province:'Lâm Đồng',provinces:['703'],ward:'Xã Đức Trọng',wardIdentities:[{code:'A',parentCode:'703',name:'Xã Đức Trọng'}]};
const areas={provinces:[{code:'703',name:'Tỉnh Lâm Đồng'},{code:'75',name:'Tỉnh Đồng Nai'}],wardsByProvince:{703:[selected.wardIdentities[0]]}};

test('413 category typos and malformed saved selections are never normalized into a match-all search',()=>{
  const record={investField:'XL',name:'Xây lắp'};
  for(const category of ['TV_DESING','<script>','0',[],['XL'],{},0,false]){
    assert.equal(isUnknownCategory(category),true,JSON.stringify(category));assert.equal(matchesTenderCategory(record,category),false);
    assert.equal(categoryLabel(category),'Loại gói thầu không hợp lệ');
    const result=validateCriteria({province:'Lâm Đồng',category});assert.equal(result.ok,false);assert.equal(result.field,'category');
  }
  for(const category of [undefined,null,'','  ',' xl ','TV_DESIGN'])assert.equal(isUnknownCategory(category),false);
  assert.equal(validateCriteria({province:'Lâm Đồng',category:''}).ok,true);assert.equal(matchesTenderCategory(record,''),true);
});

test('413 plan category projection rejects unknown selection with a reason and preserves explicit valid child fields',()=>{
  const plan={key:'P',packages:[{name:'Thi công',investField:'XL',price:10},{name:'Giám sát thi công',investField:'TV',price:2}],packageCount:2,totalPackagePrice:12};
  const before=JSON.stringify(plan);
  for(const category of ['TV_DESING',[]]){const result=filterPlansByCategory([plan],category);assert.deepEqual(result.kept,[]);assert.equal(result.dropped,1);assert.match(result.message,/không hợp lệ/);}
  const kept=filterPlansByCategory([plan],'TV_SUPERVISION').kept[0];assert.equal(kept.packageCount,1);assert.equal(kept.totalPackagePrice,2);assert.equal(kept.originalTotalPackagePrice,12);
  assert.equal(JSON.stringify(plan),before);assert.deepEqual(filterPlansByCategory([plan],'').kept,[plan]);
});

test('413 malformed official investField never becomes valid through a conflicting legacy alias or package title',()=>{
  for(const investField of [123,false,{code:'XL'},[123],[{}],['FUTURE'],['TV','XL']]){
    const row={investField,fieldCode:'XL',name:'Thi công xây dựng'};
    assert.equal(tenderFieldOf(row),'',JSON.stringify(investField));assert.equal(passesHardFilter(row,{category:'XL'}).state,'INSUFFICIENT');
  }
  assert.equal(tenderFieldOf({investField:'TV',fieldCode:'XL',name:'Thi công'}),'TV');
  assert.equal(tenderFieldOf({investField:null,fieldCode:'XL'}),'XL');
  assert.equal(tenderFieldOf(Object.assign(Object.create({investField:['TV','HH']}),{fieldCode:'XL'})),'XL');
});

test('413 official-field coverage separates absent source, invalid source and usable legacy aliases without name inference',()=>{
  const rows=[{investField:'TV',fieldCode:'XL'},{fieldCode:'XL'},{bidName:'Xây dựng trường học'},
    {investField:'FUTURE',fieldCode:'XL'},{investField:['TV','XL']},{investField:[],fieldCode:'HH'},{investField:123,fieldCode:'XL'},null];
  const before=JSON.stringify(rows);const result=summarizeTenderFields(rows);
  assert.deepEqual(result,{total:7,missingOfficial:3,missingOfficialPercent:300/7,validOfficial:1,invalidOfficial:3,legacyClassified:2,unclassified:4});
  assert.equal(result.validOfficial+result.invalidOfficial+result.missingOfficial,result.total);assert.equal(JSON.stringify(rows),before);
  assert.deepEqual(summarizeTenderFields([]),{total:0,missingOfficial:0,missingOfficialPercent:0,validOfficial:0,invalidOfficial:0,legacyClassified:0,unclassified:0});
  assert.equal(summarizeTenderFields([{investField:' '},{investField:[null,'']},Object.create({investField:'XL'})]).missingOfficial,3);
});

test('413 a child with its own province or text location cannot inherit the parent ward/province evidence',()=>{
  const ownLocations=[{provinceCode:'75'},{provCode:'75'},{areaProvCode:'75'},{provinceName:'Tỉnh Đồng Nai'},
    {location:'Xã Khác - Tỉnh Đồng Nai'},{locations:[{provCode:'75'}]}];
  for(const childLocation of ownLocations){
    const child={name:'Gói con',price:1,investField:'XL',...childLocation};
    const plan={key:'P',provinceCodes:['703'],provinces:['Tỉnh Lâm Đồng'],wards:['Xã Đức Trọng'],locations:[{provCode:'703',districtCode:'A'}],wardIdentities:selected.wardIdentities,packages:[child]};
    const before=JSON.stringify(plan),result=classifyPlansByCriteria([plan],selected,areas);
    assert.equal(result.counts.match,0,JSON.stringify(childLocation));assert.equal(result.counts.outOfRange,1,JSON.stringify(childLocation));assert.equal(JSON.stringify(plan),before);
  }
});

test('413 a child with missing parent code remains insufficient rather than pairing with parent-plan province',()=>{
  const plan={key:'P',provinceCode:'703',provCode:'703',provinceName:'Lâm Đồng',wardIdentities:selected.wardIdentities,
    locations:[{provCode:'703',districtCode:'A'}],packages:[{name:'Gói con',price:1,wardCode:'A'}]};
  const result=classifyPlansByCriteria([plan],selected,areas);assert.equal(result.counts.insufficient,1);assert.equal(result.counts.match,0);
  const correct={...plan,packages:[{name:'Gói con',price:1,wardCode:'A',wardParentCode:'703',provinceCode:'703'}]};
  assert.equal(classifyPlansByCriteria([correct],selected,areas).counts.match,1);
  assert.equal(classifyPlansByCriteria([{...plan,packages:[{name:'Gói con',price:1}]}],selected,areas).counts.match,1);
});

test('413 normalized plan children keep their own location evidence, and aggregate fields do not classify every child',()=>{
  const plan=normalizeKhlcntPlan({planNo:'PL2600000001',investField:['XL','TV'],locations:[{provCode:'703',districtCode:'A',districtName:'Xã Đức Trọng'}],
    bidNamePlanNew:[{name:'Giám sát',investField:'TV',bidPrice:1,locations:[{provCode:'75',districtCode:'A'}]},{name:'Thi công',investField:'XL',bidPrice:2,locations:[{provCode:'703',districtCode:'A'}]},{name:'Xây dựng gói chưa rõ',bidPrice:3}],bidPrice:[1,2,3]});
  const result=classifyPlansByCriteria([plan],{...selected,category:'XL'},areas);
  assert.equal(result.counts.match,1);assert.equal(result.match[0].packages[0].name,'Thi công');assert.equal(result.counts.insufficient,1);assert.equal(result.counts.outOfRange,1);
});

test('413 names across unrelated locations, name substrings and missing ward codes never become confirmed ward matches',()=>{
  for(const record of [
    {locations:[{provCode:'75',wardName:'Xã Đức Trọng'},{provCode:'703',wardName:'Xã Khác'}]},
    {provinceCode:'703',location:'Xã Đức Trọng Bắc - Tỉnh Lâm Đồng'},
    {provinceCode:'703',location:'Xã Đức Trọng - Tỉnh Lâm Đồng'},
    {provinceCode:'75',location:'Xã Đức Trọng - Tỉnh Lâm Đồng'}])assert.equal(matchesWardCodes(record,selected,areas).state,'INSUFFICIENT');
  assert.equal(matchesWardCodes({locations:[{districtCode:'A',provCode:'75',districtName:'Xã Đức Trọng'}]},selected,areas).state,'OUT_OF_RANGE');
});

test('413 legacy ward names resolve only through a provided catalog and exact source code-parent pair',()=>{
  const plan={key:'P',locations:[{provCode:'703',districtCode:'A'}],packages:[{name:'Gói con',price:1}]};
  const criteria={province:'Lâm Đồng',ward:'Đức Trọng'};
  assert.equal(classifyPlansByCriteria([plan],criteria).counts.insufficient,1);
  assert.equal(classifyPlansByCriteria([plan],criteria,areas).counts.match,1);
});

test('413 ward catalog errors explain recovery without leaking raw server text or claiming the criterion was disabled',async()=>{
  for(const [message,expected] of [['Failed to fetch',/Không kết nối/],['HTTP 429 https://example.test/?token=SECRET',/HTTP 429/],['request aborted',/quá thời gian/],['unknown SECRET',/Chưa lấy được/]]){
    const result=wardCatalogErrorMessage(new Error(message));assert.match(result,expected);assert.match(result,/Tiêu chí đã chọn được giữ nguyên/);assert.doesNotMatch(result,/SECRET|CHƯA được áp dụng|chưa được áp dụng/);
  }
  const elements={province:{value:'Lâm Đồng'},ward:{value:'Xã Đức Trọng'},list:{innerHTML:''},hint:{textContent:''}};
  const picker=createWardPicker({...elements,send:async()=>{throw Error('Failed to fetch');}});picker.set(selected.wardIdentities);
  await picker.load();assert.deepEqual(picker.read(),{ward:'Xã Đức Trọng',wardIdentities:selected.wardIdentities});assert.match(elements.hint.textContent,/Kiểm tra kết nối/);
});

test('413 a stale ward catalog error cannot overwrite the current province hint',async()=>{
  let reject;const elements={province:{value:'Lâm Đồng'},ward:{value:''},list:{innerHTML:''},hint:{textContent:''}};
  const picker=createWardPicker({...elements,send:()=>new Promise((_,fail)=>{reject=fail;})});
  const loading=picker.load();elements.province.value='Đồng Nai';elements.hint.textContent='Danh mục tỉnh đang chọn';reject(Error('Failed to fetch'));await loading;
  assert.equal(elements.hint.textContent,'Danh mục tỉnh đang chọn');
});
