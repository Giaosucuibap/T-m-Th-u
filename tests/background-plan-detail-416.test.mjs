import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { DEFAULT_SETTINGS } from '../GiaoSuCuiBap/lib/core.js';

const extension = new URL('../GiaoSuCuiBap/', import.meta.url);
const source = fs.readFileSync(new URL('background.js', extension), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', extension), 'utf8'));
const bindings = {};
for (const match of source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/gm)) {
  const exports = await import(new URL(match[2], extension));
  for (const spec of match[1].split(',')) {
    const [name, local = name] = spec.trim().split(/\s+as\s+/);
    bindings[local] = exports[name];
  }
}
const executable = source.replace(/^import\s*\{[^}]+\}\s*from\s*['"][^'"]+['"];?/gm, '');
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/egp-plan-detail-PL2600333000-20261005.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const nativeReceipt = () => ({url:fixture.url,status:fixture.status,
  header:structuredClone(fixture.data.bidPoBidpPlanProjectDetailView),
  packages:structuredClone(fixture.data.bidpPlanDetailToProjectList)});
const event = () => {const listeners=[];return {listeners,addListener(fn){listeners.push(fn);},removeListener(fn){const index=listeners.indexOf(fn);if(index>=0)listeners.splice(index,1);}};};

// Execute the entire background and actual imported modules. Only Chrome I/O
// is fake. A frozen public native receipt arrives through the real router;
// this does not launch Chrome, perform HTTP replay or claim a new live test.
async function harness({automatic=true, alterReceipt, initial}={}) {
  let state=structuredClone(initial||{settings:{...DEFAULT_SETTINGS,readOnlyMode:false},provinceCatalog:{
    fetchedAt:new Date().toISOString(),provinces:[{code:'68',name:'Tỉnh Lâm Đồng',fold:'tinh lam dong'},
      {code:'703',name:'Tỉnh Lâm Đồng',fold:'tinh lam dong'}],wardsByProvince:{}}});
  const calls={queries:[],created:[],updates:[],removed:[],writes:[]};
  const alarms=new Map(),tabs=new Map([[77,{id:77,status:'complete',url:'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection'}]]);
  let nextTab=200, emit;
  const clone=value=>structuredClone(value);
  const runtime={id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',getURL:path=>`chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${path}`,
    getManifest:()=>clone(manifest),onMessage:event(),onInstalled:event(),onStartup:event()};
  const chrome={runtime,storage:{local:{async get(keys){
    if(keys==null)return clone(state);if(typeof keys==='string')return clone({[keys]:state[keys]});
    if(Array.isArray(keys))return clone(Object.fromEntries(keys.map(key=>[key,state[key]])));
    return clone(Object.fromEntries(Object.entries(keys).map(([key,fallback])=>[key,Object.hasOwn(state,key)?state[key]:fallback])));
  },async set(patch){calls.writes.push(clone(patch));state={...state,...clone(patch)};},
    async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete state[key];},async clear(){state={};},async setAccessLevel(){}}},
    alarms:{onAlarm:event(),async create(name,value){alarms.set(name,{name,...clone(value)});},async clear(name){return alarms.delete(name);},async get(name){return clone(alarms.get(name));},async getAll(){return clone([...alarms.values()]);}},
    notifications:{onClicked:event(),onButtonClicked:event(),async create(){throw Error('Notifications disabled');}},
    downloads:{async download(){throw Error('Downloads disabled');}},commands:{onCommand:event()},
    tabs:{onRemoved:event(),onUpdated:event(),async query(){return clone([...tabs.values()].filter(tab=>tab.url.startsWith('https://muasamcong.mpi.gov.vn/')));},
      async get(id){if(!tabs.has(id))throw Error('No tab');return clone(tabs.get(id));},
      async create(args){const tab={id:++nextTab,status:'complete',...clone(args)};tabs.set(tab.id,tab);calls.created.push(clone(tab));return clone(tab);},
      async update(id,args){const tab={...tabs.get(id),...clone(args)};tabs.set(id,tab);calls.updates.push(clone(tab));
        if(automatic&&args.url?.includes('step=khlcnt'))queueMicrotask(()=>{
          const receipt=nativeReceipt();alterReceipt?.(receipt);void emit('KHLCNT_DETAIL',receipt,id,args.url);
        });return clone(tab);},
      async remove(id){tabs.delete(id);calls.removed.push(id);},async sendMessage(){return {ok:true};}}};
  const context=vm.createContext({...bindings,chrome,console,Date,URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,Blob,
    setTimeout,clearTimeout,setInterval,clearInterval,structuredClone,crypto:webcrypto,
    btoa:value=>Buffer.from(value,'binary').toString('base64'),atob:value=>Buffer.from(value,'base64').toString('binary'),
    fetch:async()=>{throw Error('All network disabled');},
    __egress:async(tabId,payload)=>{calls.queries.push(clone({tabId,payload}));return {ok:true};}});
  vm.runInContext(executable+'\nensureEgpSearchTab=async()=>({id:77,status:"complete"});dispatchLookupToTab=__egress;globalThis.__flush=async()=>{await storageQueue;};',context);
  async function send(type,payload={},tabId=null,url='') {
    const sender=tabId==null?{id:runtime.id,url:runtime.getURL('plans.html')}:
      {id:runtime.id,url:url||tabs.get(tabId)?.url,tab:{id:tabId,url:url||tabs.get(tabId)?.url}};
    return new Promise(resolve=>runtime.onMessage.listeners[0]({type,payload:clone(payload)},sender,value=>resolve(clone(value))));
  }
  emit=send;await new Promise(resolve=>setImmediate(resolve));await context.__flush();
  return {send,calls,context,alarms,get state(){return clone(state);},async wait(predicate){
    const until=Date.now()+2500;while(!predicate()){assert.ok(Date.now()<until,'Background phase did not settle');await new Promise(resolve=>setImmediate(resolve));}
    await context.__flush();
  }};
}
async function list(h,investor='vn5800939408') {
  assert.equal((await h.send('PLAN_LOOKUP',{investor,province:'Lâm Đồng',category:'XL',fromDate:'2026-07-07',toDate:'2026-10-05'})).ok,true);
  const id=h.state.planLookup.id;
  assert.equal((await h.send('KQLCNT_RESULTS',{planId:id,mode:'khlcnt',queryIndex:0,pageIndex:0,totalElements:1,totalPages:1,records:[fixture.searchRow]},77)).ok,true);
  const final={planId:id,mode:'khlcnt',queryIndex:0,pageIndex:1,totalElements:1,totalPages:1,records:[],done:true};
  assert.equal((await h.send('KQLCNT_RESULTS',final,77)).ok,true);
  return {id,final,done:{planId:id,mode:'khlcnt',queryIndex:0,ok:true}};
}

test('Actual router hands a complete unknown list to paired native detail and finishes with the two correct XL packages',async()=>{
  const h=await harness(),job=await list(h);
  assert.equal(h.state.planLookup.plans.length,0);
  assert.equal(h.state.planLookup.insufficientPlans.length,1);
  assert.equal(h.state.planLookup.detailStatus,'PENDING');
  assert.equal(h.calls.created.length,0,'Details start after list completion ACK');
  assert.equal((await h.send('KQLCNT_DONE',job.done,77)).ok,true);
  await h.wait(()=>h.state.planLookup.detailStatus==='DONE');
  const final=h.state.planLookup;
  assert.equal(final.status,'SUCCESS');
  assert.equal(final.insufficientPlans.length,0);
  assert.equal(final.summary.packageCount,2);
  assert.equal(final.summary.totalValue,746438475004);
  assert.equal(final.coverage.match,1);
  assert.equal(final.coverage.insufficient,0);
  assert.equal(final.coverage.complete,true);
  assert.equal(final.categoryUnknownPackages,0);assert.equal(final.unknownPrices,0);
  assert.equal(final.plans[0].investorCode,'vn5800939408');
  assert.deepEqual(final.plans[0].packages.map(pkg=>[pkg.bidNo,pkg.price]),[['BP2600838021',1788792936],['BP2600838106',744649682068]]);
  assert.equal(h.calls.created.length,1);assert.deepEqual(h.calls.removed,[h.calls.created[0].id]);
  assert.equal(h.calls.removed.includes(77),false);
});

test('Duplicate list completion ACK during hydration does not fail or restart the detail phase',async()=>{
  const h=await harness({automatic:false}),job=await list(h);
  await h.send('KQLCNT_DONE',job.done,77);
  await h.wait(()=>h.calls.updates.length===1);
  const duplicate=await h.send('KQLCNT_DONE',job.done,77);
  assert.equal(duplicate.ok,true);
  assert.equal(h.state.planLookup.status,'RUNNING');
  assert.equal(h.state.planLookup.detailStatus,'READING');
  const tab=h.calls.updates[0];await h.send('KHLCNT_DETAIL',nativeReceipt(),tab.id,tab.url);
  await h.wait(()=>h.state.planLookup.detailStatus==='DONE');
  assert.equal(h.state.planLookup.status,'SUCCESS');assert.equal(h.state.planLookup.detailRead,1);
  assert.equal(h.calls.created.length,1);
  const before=JSON.stringify(h.state.planLookup);
  await h.send('KHLCNT_DETAIL',nativeReceipt(),tab.id,tab.url);
  assert.equal(JSON.stringify(h.state.planLookup),before);
});

test('A partial native child table retains the unknown packages and ends PARTIAL with no invented price',async()=>{
  const h=await harness({alterReceipt:native=>native.packages.pop()}),job=await list(h);
  await h.send('KQLCNT_DONE',job.done,77);
  await h.wait(()=>h.state.planLookup.detailStatus==='DONE');
  const final=h.state.planLookup;
  assert.equal(final.status,'PARTIAL');assert.equal(final.detailFailed,1);
  assert.equal(final.coverage.complete,false);assert.equal(final.coverage.partial,true);
  assert.equal(final.plans.length,0);assert.equal(final.insufficientPlans.length,1);
  assert.ok(final.insufficientPlans[0].packages.every(pkg=>pkg.price===null));
  assert.match(final.insufficientPlans[0].detailReadError,/chưa đủ/i);
  assert.equal(final.summary.totalValue,0);assert.equal(h.calls.removed.includes(77),false);
});

test('Cancellation closes only owned detail tabs; late detail receipt cannot change the retained lookup',async()=>{
  const h=await harness({automatic:false}),job=await list(h);
  await h.send('KQLCNT_DONE',job.done,77);await h.wait(()=>h.calls.updates.length===1);
  const tab=h.calls.updates[0];await h.send('CANCEL_PLAN_LOOKUP');
  await h.wait(()=>h.calls.removed.includes(tab.id));
  const before=JSON.stringify(h.state.planLookup);
  assert.equal(h.state.planLookup.cancelled,true);
  await h.send('KHLCNT_DETAIL',nativeReceipt(),tab.id,tab.url);
  assert.equal(JSON.stringify(h.state.planLookup),before);
  assert.ok(h.state.planLookup.insufficientPlans[0].packages.every(pkg=>pkg.price===null));
  assert.equal(h.calls.removed.includes(77),false);
});

test('Multiple owner queries finish listing before the single native hydration phase',async()=>{
  const h=await harness();
  assert.equal((await h.send('PLAN_LOOKUP',{investor:'vn5800939408; vn9999999999',province:'Lâm Đồng',category:'XL',fromDate:'2026-07-07',toDate:'2026-10-05'})).ok,true);
  const id=h.state.planLookup.id;
  await h.send('KQLCNT_RESULTS',{planId:id,mode:'khlcnt',queryIndex:0,pageIndex:0,totalElements:1,totalPages:1,records:[fixture.searchRow]},77);
  await h.send('KQLCNT_RESULTS',{planId:id,mode:'khlcnt',queryIndex:0,pageIndex:1,totalElements:1,totalPages:1,records:[],done:true},77);
  assert.equal(h.state.planLookup.detailStatus,undefined);
  await h.send('KQLCNT_DONE',{planId:id,mode:'khlcnt',queryIndex:0,ok:true},77);
  assert.equal(h.state.planLookup.qi,1);assert.equal(h.calls.created.length,0);
  await h.send('KQLCNT_RESULTS',{planId:id,mode:'khlcnt',queryIndex:1,pageIndex:0,totalElements:0,totalPages:0,records:[],done:true},77);
  assert.equal(h.state.planLookup.detailStatus,'PENDING');
  await h.send('KQLCNT_DONE',{planId:id,mode:'khlcnt',queryIndex:1,ok:true},77);
  await h.wait(()=>h.state.planLookup.detailStatus==='DONE');
  assert.equal(h.state.planLookup.status,'SUCCESS');
  assert.equal(h.state.planLookup.summary.packageCount,2);
  assert.equal(h.state.planLookup.summary.totalValue,746438475004);
  assert.equal(h.state.planLookup.coverage.serverTotal,1);
  assert.equal(h.calls.created.length,1);
});

test('A cold worker can ACK its persisted final list receipt and start pending details',async()=>{
  const first=await harness({automatic:false}),job=await list(first);
  const resumed=await harness({initial:first.state});
  assert.equal(resumed.state.planLookup.detailStatus,'PENDING');
  const ack=await resumed.send('KQLCNT_DONE',job.done,77);
  assert.equal(ack.ok,true);
  await resumed.wait(()=>resumed.state.planLookup.detailStatus==='DONE');
  assert.equal(resumed.state.planLookup.status,'SUCCESS');
  assert.equal(resumed.state.planLookup.summary.totalValue,746438475004);
});

test('A cold worker marks lost hydration PARTIAL and retains its already received unknown list',async()=>{
  const first=await harness({automatic:false}),job=await list(first);
  await first.send('KQLCNT_DONE',job.done,77);await first.wait(()=>first.calls.updates.length===1);
  const snapshot=first.state;
  await first.send('CANCEL_PLAN_LOOKUP');await first.wait(()=>first.calls.removed.length===1);
  const resumed=await harness({initial:snapshot});
  assert.equal(resumed.state.planLookup.status,'PARTIAL');
  assert.equal(resumed.state.planLookup.partial,true);
  assert.equal(resumed.state.planLookup.insufficientPlans.length,1);
  assert.ok(resumed.state.planLookup.insufficientPlans[0].packages.every(pkg=>pkg.price===null));
  assert.equal(resumed.calls.created.length,0);
});
