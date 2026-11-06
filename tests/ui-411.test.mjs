import test from 'node:test';
import assert from 'node:assert/strict';
import {createSearchIndex,selectIndexedRows} from '../GiaoSuCuiBap/lib/search-index.js';
import {createResultView,resultRows,verifyExportKeys} from '../GiaoSuCuiBap/lib/result-view.js';
import {createWardPicker} from '../GiaoSuCuiBap/ward-picker.js';
import {parseDayMs} from '../GiaoSuCuiBap/lib/core.js';

test('411 index retains latest identity once and intersects exact province codes without prefix guesses',()=>{
  const rows=[{key:'a',provinceCode:'68',price:1},{key:'b',provinceCode:'703',price:2},{key:'c',wardCode:'68123'},
    {key:'a',provinceCodes:['66','703'],price:3},{key:'d',locations:[{provCode:'68'}]}];
  const index=createSearchIndex(rows);
  assert.equal(index.byKey.get('a').price,3);
  assert.deepEqual(selectIndexedRows(index,{provinceCodes:['68']}).map(x=>x.key),['d']);
  assert.deepEqual(selectIndexedRows(index,{keys:['a','c'],provinceCodes:['703']}).map(x=>x.key),['a']);
  assert.deepEqual(selectIndexedRows(index,{provinceCodes:['70']}),[]);
  assert.deepEqual(selectIndexedRows(index,{keys:[]}),[]);
  assert.deepEqual(selectIndexedRows(index).map(x=>x.key),['a','b','c','d']);
});

test('411 closing index includes Vietnam-day edges and excludes unknown dates from date selection',()=>{
  const rows=[{key:'start',closeDate:'2026-09-13T17:00:00Z'},{key:'end',closeDate:'2026-09-14T16:59:59.999Z'},
    {key:'next',closeDate:'2026-09-14T17:00:00Z'},{key:'missing',closeDate:null},{key:'bad',closeDate:'2026-02-30'}];
  const index=createSearchIndex(rows),closeFrom=parseDayMs('2026-09-14'),closeTo=parseDayMs('2026-09-14',true);
  assert.deepEqual(selectIndexedRows(index,{closeFrom,closeTo}).map(x=>x.key),['start','end']);
  assert.deepEqual(selectIndexedRows(index,{closeFrom:closeTo,closeTo:closeFrom}),[]);
  assert.deepEqual(selectIndexedRows(index,{closeFrom:NaN}),[]);
  assert.equal(selectIndexedRows(index).length,5);
});

test('411 shared result totals and export cover every filtered page, excluding unseen warehouse records',()=>{
  const rows=Array.from({length:95},(_,i)=>({key:`k${i}`,bidName:`Thi công ${i}`,provinceCode:i<80?'68':'66',price:i+1,score:80,matched:true,closeDate:'2026-09-20T08:00:00+07:00'}));
  const run={id:'r',foundKeys:rows.slice(0,90).map(t=>t.key),resultStates:Object.fromEntries(rows.slice(0,90).map(t=>[t.key,{filterState:'MATCH',matched:true}]))};
  const filters={criteriaState:'MATCH',provinceCode:'68',closeFrom:'2026-09-20',closeTo:'2026-09-20',sortBy:'priceAsc'};
  const index=createSearchIndex(resultRows(rows,run)),cached=createResultView(rows,run,filters,{index}),fresh=createResultView(rows,run,filters);
  assert.deepEqual(cached,fresh);
  assert.equal(cached.rows.length,80);assert.equal(cached.summary.total,80);assert.equal(cached.summary.totalValue,3240);
  assert.equal(cached.rows.slice(0,30).length,30);
  assert.equal(verifyExportKeys(cached.rows,cached.rows.map(t=>t.key)).length,80);
  assert.throws(()=>verifyExportKeys(cached.rows,cached.rows.slice(0,30).map(t=>t.key)),/mọi trang/);
  assert.equal(cached.all.length,90);
});

test('411 unknown-only shared result statistics do not count matches or invent missing values',()=>{
  const rows=[{key:'a',price:null,matched:true},{key:'b',price:0,matched:true},{key:'c',price:500,matched:true}];
  const run={foundKeys:['a','b','c'],resultStates:{a:{filterState:'INSUFFICIENT'},b:{filterState:'INSUFFICIENT'},c:{filterState:'MATCH'}}};
  const view=createResultView(rows,run,{criteriaState:'INSUFFICIENT'});
  assert.deepEqual(view.rows.map(x=>x.key),['a','b']);
  assert.equal(view.summary.total,2);assert.equal(view.summary.matched,0);assert.equal(view.summary.priced,1);assert.equal(view.summary.totalValue,0);
  assert.deepEqual(resultRows(rows,null),[]);
});

function picker(send){
  const elements={province:{value:'Tỉnh Lâm Đồng'},ward:{value:''},list:{innerHTML:''},hint:{textContent:''}};
  return {elements,api:createWardPicker({send,...elements})};
}
const wardA={code:'12345',parentCode:'68',name:'Xã An Bình',current:false};
const wardB={code:'54321',parentCode:'703',name:'Xã An Bình',current:true};
test('411 duplicate ward names remain separate choices and submit selected code with exact parent',async()=>{
  const {elements,api}=picker(async()=>({ok:true,wardIdentities:[wardA,wardB]}));await api.load();
  assert.match(elements.list.innerHTML,/12345/);assert.match(elements.list.innerHTML,/54321/);
  elements.ward.value='Xã An Bình';assert.deepEqual(api.read(),{ward:'Xã An Bình'});
  elements.ward.value='Xã An Bình · mã 54321 · tỉnh 703 · hiện hành';
  assert.deepEqual(api.read(),{ward:'Xã An Bình',wardIdentities:[{code:'54321',parentCode:'703',name:'Xã An Bình'}]});
});
test('411 ward catalog stale response cannot restore a previous province selection',async()=>{
  const pending=[];const {elements,api}=picker(()=>new Promise(resolve=>pending.push(resolve)));
  const first=api.load();api.clear();elements.province.value='Đắk Lắk';const second=api.load();
  pending[1]({ok:true,wardIdentities:[{...wardA,parentCode:'66',name:'Xã Mới'}]});await second;
  pending[0]({ok:true,wardIdentities:[wardB]});await first;
  assert.match(elements.list.innerHTML,/Xã Mới/);assert.doesNotMatch(elements.list.innerHTML,/54321/);
  assert.deepEqual(api.read(),{ward:''});
});
test('411 saved ward identity is restored by exact code and parent without overwriting an edit',async()=>{
  const {elements,api}=picker(async()=>({ok:true,wardIdentities:[wardA,wardB]}));api.set([wardA]);elements.ward.value='Xã An Bình';
  await api.load();assert.match(elements.ward.value,/12345.*68/);
  elements.ward.value='Người dùng đang sửa';await api.load();assert.equal(elements.ward.value,'Người dùng đang sửa');
  api.clear();assert.deepEqual(api.read(),{ward:''});
});
test('411 ward catalog option values are escaped and offline catalog never creates a guessed identity',async()=>{
  const {elements,api}=picker(async()=>({ok:true,wardIdentities:[{...wardA,name:'Xã <img src=x onerror="bad"> & Test'}]}));
  await api.load();assert.doesNotMatch(elements.list.innerHTML,/<img/);assert.match(elements.list.innerHTML,/&lt;img/);
  const offline=picker(async()=>({ok:false,message:'Ngoại tuyến'}));await offline.api.load();offline.elements.ward.value='Xã An Bình';
  assert.deepEqual(offline.api.read(),{ward:'Xã An Bình'});assert.match(offline.elements.hint.textContent,/Không kết nối.*Tiêu chí đã chọn được giữ nguyên/);
});
