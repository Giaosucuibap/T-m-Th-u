import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {DEFAULT_SETTINGS} from '../GiaoSuCuiBap/lib/core.js';
import {createSearchStateRuntime} from '../GiaoSuCuiBap/lib/runtime-search-state.js';

const extension=new URL('../GiaoSuCuiBap/',import.meta.url),source=fs.readFileSync(new URL('background.js',extension),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',extension),'utf8')),bindings={};
for(const match of source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/gm)){
  const exports=await import(new URL(match[2],extension));
  for(const spec of match[1].split(',')){const [name,local=name]=spec.trim().split(/\s+as\s+/);assert.ok(name in exports,name);bindings[local]=exports[name];}
}
const executable=source.replace(/^import\s*\{[^}]+\}\s*from\s*['"][^'"]+['"];?/gm,'');
function event(){const listeners=[];return {listeners,addListener(fn){listeners.push(fn);},removeListener(fn){const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);}};}
const now=Date.parse('2026-09-24T03:00:00Z');
async function harness(initial={}){
  let state=structuredClone({settings:{...DEFAULT_SETTINGS,autoScan:false,telegramEnabled:false},...initial}),clock=now;
  const writes=[],network=[],alarms=new Map(),clone=structuredClone;
  class Clock extends Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
  const runtime={id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',getURL:p=>`chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${p}`,getManifest:()=>clone(manifest),onMessage:event(),onInstalled:event(),onStartup:event()};
  const local={async get(keys){if(keys==null)return clone(state);if(typeof keys==='string')return clone({[keys]:state[keys]});if(Array.isArray(keys))return clone(Object.fromEntries(keys.map(k=>[k,state[k]])));return clone(Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,Object.hasOwn(state,k)?state[k]:v])));},
    async set(patch){writes.push(clone(patch));Object.assign(state,clone(patch));},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete state[key];},async clear(){state={};},async setAccessLevel(){}};
  const fail=async(...args)=>{network.push(args);throw Error('Network disabled in warehouse router fixture');};
  const chrome={runtime,storage:{local},alarms:{onAlarm:event(),async get(name){return alarms.get(name);},async getAll(){return [...alarms.values()];},async create(name,value){alarms.set(name,{name,...value});},async clear(name){return alarms.delete(name);},async clearAll(){alarms.clear();}},
    tabs:{onRemoved:event(),onUpdated:event(),query:async()=>[],create:fail,update:fail,remove:async()=>{},sendMessage:fail},
    notifications:{onClicked:event(),onButtonClicked:event(),create:fail},downloads:{download:fail},commands:{onCommand:event()}};
  const context=vm.createContext({...bindings,chrome,console,Date:Clock,URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,Blob,
    setTimeout,clearTimeout,setInterval,clearInterval,structuredClone,crypto:webcrypto,fetch:fail,fetchAllAreas:fail,fetchProvinces:fail,
    btoa:v=>Buffer.from(v,'binary').toString('base64'),atob:v=>Buffer.from(v,'base64').toString('binary')});
  vm.runInContext(executable+'\nglobalThis.__flush=async()=>{await storageQueue;};',context);
  await new Promise(resolve=>setImmediate(resolve));await context.__flush();assert.equal(runtime.onMessage.listeners.length,1);
  async function send(type,payload={},kind='extension'){
    const sender=kind==='extension'?{id:runtime.id,url:runtime.getURL('dashboard.html')}:kind==='content'?{id:runtime.id,url:'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection',tab:{id:1,url:'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection'}}:{id:'outside',url:'https://example.test'};
    let timer;try{return await Promise.race([new Promise(resolve=>runtime.onMessage.listeners[0]({type,payload:clone(payload)},sender,value=>resolve(clone(value)))),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('No reply '+type)),2000);})]);}finally{clearTimeout(timer);}
  }
  return {send,writes,network,get state(){return clone(state);},patch:patch=>Object.assign(state,clone(patch)),advance:ms=>{clock+=ms;}};
}
const old=(key,extra={})=>({key,notifyNo:key,bidName:'Gói '+key,closeDate:'2025-01-01T00:00:00Z',...extra});
const fact={bidName:'Gói cũ',price:100,closeDate:'2026-10-01T00:00:00Z',publicDate:'2026-09-01T00:00:00Z',investorName:'CĐT',location:'Lâm Đồng',investField:'XL',filterState:'MATCH'};
const run=(id,rows,extra={})=>({id,mode:'form',criteria:{category:'XL'},coverage:{complete:true},foundKeys:Object.keys(rows),resultStates:rows,...extra});
const preview=h=>h.send('PREVIEW_WAREHOUSE_CLEANUP',{months:6});
const apply=(h,token,extra={})=>h.send('APPLY_WAREHOUSE_CLEANUP',{token,confirmed:true,...extra});

test('413 warehouse protocols reject content-script and unrelated senders before any mutation',async()=>{
  const h=await harness({tenders:[old('A')]});const before=h.state;
  for(const kind of ['content','outside'])for(const type of ['COMPARE_SEARCH_RUNS','PREVIEW_WAREHOUSE_CLEANUP','APPLY_WAREHOUSE_CLEANUP']){
    assert.equal((await h.send(type,{months:6,confirmed:true,token:'fake'},kind)).ok,false,`${kind} ${type}`);
  }
  assert.deepEqual(h.state,before);assert.equal(h.network.length,0);
});

test('413 router comparison uses snapshots only and does not fill old facts from current warehouse',async()=>{
  const a=run('A',{same:fact,oldOnly:fact,missing:{bidName:fact.bidName,filterState:'MATCH'}}),b=run('B',{same:{...fact,price:200},newOnly:fact,missing:fact},{coverage:{complete:false},criteria:{category:'TV'}});
  const h=await harness({runs:[a,b],tenders:[old('same',{price:999999}),old('missing',{price:888888})]});
  const response=await h.send('COMPARE_SEARCH_RUNS',{leftRunId:'A',rightRunId:'B'});assert.equal(response.ok,true);
  assert.deepEqual(response.counts,{leftOnly:1,rightOnly:1,changed:1,unchanged:0,unavailable:1});
  const price=response.rows.find(r=>r.key==='same').changes.find(r=>r.field==='price');assert.equal(price.before,100);assert.equal(price.after,200);
  assert.equal(response.rows.find(r=>r.key==='missing').left.price,undefined);assert.equal(response.warnings.length,3);assert.equal(h.network.length,0);
});

test('413 router comparison rejects same, unknown or malformed run IDs',async()=>{
  const h=await harness({runs:[run('A',{a:fact}),run('B',{a:fact})]});
  for(const payload of [{leftRunId:'A',rightRunId:'A'},{leftRunId:'A',rightRunId:'missing'},{leftRunId:['A'],rightRunId:'B'},{}])assert.equal((await h.send('COMPARE_SEARCH_RUNS',payload)).ok,false,JSON.stringify(payload));
});

test('413 read-only mode prevents preview token writes and cleanup while retaining comparison access',async()=>{
  const h=await harness({settings:{...DEFAULT_SETTINGS,readOnlyMode:true},tenders:[old('A')],runs:[run('A',{a:fact}),run('B',{a:fact})]});
  const before=h.state,writes=h.writes.length;
  assert.equal((await preview(h)).ok,false);assert.equal((await apply(h,'fake')).ok,false);
  assert.deepEqual(h.state,before);assert.equal(h.writes.length,writes);
  assert.equal((await h.send('COMPARE_SEARCH_RUNS',{leftRunId:'A',rightRunId:'B'})).ok,true);
});

test('413 preview validates retention and never exposes a raw deletion key list or internal signature',async()=>{
  const h=await harness({tenders:[old('A')]});const before=h.state;
  for(const months of [undefined,0,3,'6',12])assert.equal((await h.send('PREVIEW_WAREHOUSE_CLEANUP',{months})).ok,false);
  assert.deepEqual(h.state,before);const result=await preview(h);assert.equal(result.ok,true);assert.equal(result.count,1);assert.equal(result.preview[0].key,'A');
  assert.equal(result.keys,undefined);assert.equal(result.signature,undefined);assert.ok(result.token);assert.deepEqual(h.state.tenders,before.tenders);
});

test('413 cleanup requires exact current token and confirmation, expires, and consumes one preview once',async()=>{
  const h=await harness({tenders:[old('A')]});const first=await preview(h),second=await preview(h);assert.notEqual(first.token,second.token);
  for(const [token,extra] of [[first.token,{}],['wrong',{}],[second.token,{confirmed:false}],[second.token,{confirmed:'true'}]])assert.equal((await apply(h,token,extra)).ok,false);
  assert.equal(h.state.tenders.length,1);h.advance(10*60000+1);assert.equal((await apply(h,second.token)).ok,false);
  const fresh=await preview(h),removed=await apply(h,fresh.token);assert.equal(removed.ok,true);assert.equal(removed.removed,1);assert.equal(h.state.tenders.length,0);
  assert.equal(h.state.warehouseCleanupPreview,null);assert.equal(h.state.auditLog[0].kind,'warehouse_cleanup');assert.equal((await apply(h,fresh.token)).ok,false);
});

test('413 newly changed rows, checklist, run references and contract references invalidate an accepted preview',async()=>{
  for(const change of [{tenders:[old('A',{watchlisted:true})]},{checklists:{A:{items:{hsmt:true}}}},{runs:[run('R',{A:fact})]},
    {pastContracts:[{id:'C',name:'Hợp đồng liên quan',price:10,year:2025,tenderKey:'A'}]}]){
    const h=await harness({tenders:[old('A')]});const p=await preview(h);h.patch(change);
    const result=await apply(h,p.token);assert.equal(result.ok,false,JSON.stringify(change));assert.match(result.message,/thay đổi/);assert.equal(h.state.tenders.length,1);
  }
});

test('413 a protected or recent duplicate blocks deletion of every occurrence of its key',async()=>{
  for(const protectedRow of [old('A',{watchlisted:true}),old('A',{closeDate:'2026-09-23T00:00:00Z'}),old('A',{decisionState:'GO'}),old('A',{closeDate:null})]){
    const h=await harness({tenders:[old('A'),protectedRow,old('DELETE')]});const p=await preview(h);
    assert.equal(p.ok,true);assert.equal(p.count,1,JSON.stringify(protectedRow));assert.equal(p.preview[0].key,'DELETE');
    const result=await apply(h,p.token);assert.equal(result.ok,true);assert.equal(result.removed,1);assert.equal(h.state.tenders.length,2);assert.ok(h.state.tenders.every(row=>row.key==='A'));
  }
});

test('413 real getState contract sanitization preserves tender-reference cleanup protection',async()=>{
  const h=await harness({tenders:[old('CONTRACT'),old('DELETE')],pastContracts:[{id:'C',name:'Hợp đồng liên quan',tenderKey:'CONTRACT',price:10,year:2025}]});
  const p=await preview(h);assert.equal(p.count,1);assert.equal(p.preview[0].key,'DELETE');
  const result=await apply(h,p.token);assert.equal(result.ok,true);assert.deepEqual(h.state.tenders.map(row=>row.key),['CONTRACT']);
});

test('413 invalid tender identities are kept during cleanup instead of becoming a broad undefined-key deletion',async()=>{
  const h=await harness({tenders:[old(''),old(undefined),old('DELETE')]});const p=await preview(h);assert.equal(p.count,1);
  assert.equal((await apply(h,p.token)).removed,1);assert.equal(h.state.tenders.length,2);
});

test('413 cleanup rechecks read-only and active job state after preview',async()=>{
  for(const patch of [{settings:{...DEFAULT_SETTINGS,readOnlyMode:true}},{activeRun:{id:'busy',status:'RUNNING',foundKeys:[]}}]){
    const h=await harness({tenders:[old('A')]});const p=await preview(h);h.patch(patch);assert.equal((await apply(h,p.token)).ok,false);assert.equal(h.state.tenders.length,1);
  }
});

test('413 an indexed run removed between header read and lookup does not create null history entries',async()=>{
  const storage={get:async defaults=>({...defaults}),runHeaders:async()=>[{id:'vanished',mode:'form'}],lookup:async()=>[],participationsFor:async()=>[]};
  const response=await createSearchStateRuntime({storage}).read({runId:'vanished'});
  assert.equal(response.selectedRun,null);assert.deepEqual(response.tenders,[]);assert.ok(response.runs.every(run=>run&&typeof run.id==='string'));
});

test('413 adds no domains, host permissions or content injection scope beyond the accepted 4.12.0 manifest',()=>{
  // Exact relevant fields copied from the accepted 4.12.0 manifest. Kept in
  // this standalone test so an extracted release needs no sibling checkout.
  const before={permissions:['storage','unlimitedStorage','alarms','tabs','downloads','notifications','nativeMessaging'],
    host_permissions:['https://muasamcong.mpi.gov.vn/*','https://api.telegram.org/*'],
    content_security_policy:{extension_pages:"script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; img-src 'self' data: https: blob:; style-src 'self' 'unsafe-inline'"},
    content_scripts:[
      {matches:['https://muasamcong.mpi.gov.vn/*/web/guest/contractor-selection*','https://muasamcong.mpi.gov.vn/web/guest/contractor-selection*'],js:['page-hook.js'],run_at:'document_start',world:'MAIN'},
      {matches:['https://muasamcong.mpi.gov.vn/*/web/guest/contractor-selection*','https://muasamcong.mpi.gov.vn/web/guest/contractor-selection*'],js:['content.js'],run_at:'document_start',world:'ISOLATED'}]};
  for(const key of ['permissions','host_permissions','content_scripts','content_security_policy'])assert.deepEqual(manifest[key],before[key],key);
});
