import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSearchRuns, cleanupCutoff, warehouseCleanupPlan, warehouseStatus } from '../GiaoSuCuiBap/lib/warehouse-maintenance.js';
import { createWarehouseStorage } from '../GiaoSuCuiBap/lib/warehouse-storage.js';
import { createSearchStateRuntime } from '../GiaoSuCuiBap/lib/runtime-search-state.js';
const fact={bidName:'Gói A',price:100,closeDate:'2026-10-01T00:00:00Z',publicDate:'2026-09-01T00:00:00Z',investorName:'CĐT',location:'Lâm Đồng',investField:'XL',filterState:'MATCH'};
const run=(id,rows)=>({id,criteria:{category:'XL'},coverage:{complete:true},foundKeys:Object.keys(rows),resultStates:rows});
test('413 compare uses historical snapshots and distinguishes changed, only-side and unchanged',()=>{
  const r=compareSearchRuns(run('a',{a:fact,b:fact,d:fact}),run('b',{a:{...fact,price:200},c:fact,d:fact}));
  assert.deepEqual(r.counts,{leftOnly:1,rightOnly:1,changed:1,unchanged:1,unavailable:0});
  assert.equal(r.rows.find(r=>r.key==='a').changes[0].before,100);
  assert.equal(r.rows.find(r=>r.key==='a').changes[0].after,200);
});
test('413 missing historical facts remain unavailable and partial or different criteria warn',()=>{
  const a=run('a',{a:{filterState:'MATCH'},b:fact}),b=run('b',{a:fact,b:{...fact}});
  delete b.resultStates.b.price;b.coverage.complete=false;b.criteria.category='TV';
  const r=compareSearchRuns(a,b);assert.equal(r.counts.unavailable,2);assert.equal(r.warnings.length,3);
  assert.throws(()=>compareSearchRuns(a,a),/khác nhau/);
  assert.throws(()=>compareSearchRuns(a,null),/Không tìm/);
});
test('413 cleanup uses six calendar months, clamps month ends and is timezone independent',()=>{
  assert.equal(new Date(cleanupCutoff(Date.parse('2026-08-31T18:00:00Z'))).toISOString(),'2026-02-28T18:00:00.000Z');
  assert.equal(new Date(cleanupCutoff(Date.parse('2026-09-24T03:00:00Z'))).toISOString(),'2026-03-24T03:00:00.000Z');
});
test('413 cleanup protects tracked, decided, checklist, contract and run references; unknown dates stay',()=>{
  const old={closeDate:'2025-01-01T00:00:00Z'};
  const state={tenders:[{...old,key:'delete'},{...old,key:'watch',watchlisted:true},{...old,key:'go',decisionState:'GO'},{...old,key:'check'},{...old,key:'contract'},{...old,key:'run'},{key:'unknown'},{...old,key:'future',closeDate:'2027-01-01'}],runs:[{id:'a',foundKeys:['run']}],checklists:{check:{done:true}},pastContracts:[{tenderKey:'contract'}]};
  const p=warehouseCleanupPlan(state,Date.parse('2026-09-24'));assert.deepEqual(p.keys,['delete']);assert.equal(p.retainedCount,7);
  assert.notEqual(p.signature,warehouseCleanupPlan({...state,tenders:state.tenders.map(t=>t.key==='delete'?{...t,watchlisted:true}:t)},Date.parse('2026-09-24')).signature);
});
test('413 warehouse warning uses count or bytes and never alters records',()=>{
  const rows=Array.from({length:10000},(_,i)=>({key:String(i)})),before=JSON.stringify(rows);
  assert.equal(warehouseStatus({tenders:rows}).warning,true);assert.equal(JSON.stringify(rows),before);
  assert.equal(warehouseStatus({tenders:[]}).warning,false);
});
function local(initial){let data=structuredClone(initial);return {async get(q){if(q==null)return structuredClone(data);if(typeof q==='string')return {[q]:data[q]};if(Array.isArray(q))return Object.fromEntries(q.map(k=>[k,data[k]]));return structuredClone({...q,...Object.fromEntries(Object.keys(q).filter(k=>k in data).map(k=>[k,data[k]]))});},async set(p){Object.assign(data,structuredClone(p));},async clear(){data={};},async remove(keys){keys.forEach(k=>delete data[k]);}};}
test('413 storage facade preserves local replay behavior and empty notice never joins unrelated participation',async()=>{
  const storage=createWarehouseStorage({local:local({tenders:[{key:'a'},{key:'b',notifyNo:'IB1'}],runs:[run('r',{a:fact})],participations:[{tenderKey:'a',contractorName:'Correct'},{notifyNo:'',contractorName:'Wrong'}]}),indexedDB:null});
  assert.equal(storage.engine,'local');
  assert.deepEqual(await storage.participationsFor(['a'],[]),[{tenderKey:'a',contractorName:'Correct'}]);
  const r=await createSearchStateRuntime({storage}).read({runId:'r'});assert.equal(r.tenders.length,1);assert.equal(r.participations.length,1);
  assert.deepEqual((await storage.runHeaders())[0],{id:'r',criteria:{category:'XL'},coverage:{complete:true}});
});
test('413 indexed scope never requests complete tender/run/participation arrays',async()=>{
  const seen=[];const storage={
    async get(query){assert.ok(!['tenders','runs','participations'].some(k=>k in query));return {...query};},
    async runHeaders(){return [{id:'r',mode:'form'}];},
    async lookup(kind,index,keys){seen.push({kind,index,keys});return kind==='runs'?[run('r',{a:fact})]:[{key:'a',notifyNo:'IB1'}];},
    async participationsFor(keys,notices){assert.deepEqual(keys,['a']);assert.deepEqual(notices,['IB1']);return []}
  };
  const r=await createSearchStateRuntime({storage}).read({runId:'r'});
  assert.equal(r.tenders.length,1);assert.deepEqual(seen[1],{kind:'tenders',index:'key',keys:['a']});
});
