import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {DEFAULT_SETTINGS} from '../GiaoSuCuiBap/lib/core.js';
import {workbookSheetXml} from './fixtures/multi-investor-export-414.mjs';

// Run the complete background router and its real imports. Only browser I/O
// and local storage are faked; business rules and page transactions are real.
const extension=new URL('../GiaoSuCuiBap/',import.meta.url);
const source=fs.readFileSync(new URL('background.js',extension),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',extension),'utf8'));
const bindings={};
for(const item of source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/gm)){
  const exports=await import(new URL(item[2],extension));
  for(const spec of item[1].split(',')){
    const [name,local=name]=spec.trim().split(/\s+as\s+/);
    assert.ok(name in exports,name);bindings[local]=exports[name];
  }
}
const executable=source.replace(/^import\s*\{[^}]+\}\s*from\s*['"][^'"]+['"];?/gm,'');
const origin='https://muasamcong.mpi.gov.vn/web/guest/contractor-selection';
const catalog={fetchedAt:new Date().toISOString(),provinces:[{code:'703',name:'Tỉnh Lâm Đồng',fold:'tinh lam dong'},{code:'68',name:'Tỉnh Lâm Đồng',fold:'tinh lam dong'}],wardsByProvince:{}};
const quiet={...DEFAULT_SETTINGS,autoScan:false,scanOnStartup:false,telegramEnabled:false,notifyWebhook:'',notifyEmail:'',minPrice:0,maxPrice:0,requiredKeywords:[],requireConstruction:false,provinces:[],alertMinScore:101};
const event=()=>{const listeners=[];return{listeners,addListener(fn){listeners.push(fn);},removeListener(fn){const index=listeners.indexOf(fn);if(index>=0)listeners.splice(index,1);}};};
const warehouseKeys=new Set(['tenders','runs','participations']);
const legacyRow={notifyNo:'IB2600000999',notifyVersion:'00',bidName:'Legacy source requiring award restoration',winningCode:['vn0012345678'],winningContractorName:['Old winner'],bidWinningPrice:200,investorCode:'vn5800939408',investorName:'Ban Quản lý dự án đầu tư xây dựng số 1',locations:[{provCode:'703'}]};
const legacy={status:'SUCCESS',packages:[legacyRow]};
async function harness(initial={}){
  let state=structuredClone({settings:quiet,areas:catalog,provinceCatalog:catalog,
    organizationDirectoryObservations:{schema:1,entries:[]},
    tenders:Array.from({length:20000},(_,i)=>({key:'vault-'+i,bidName:'Stored tender '+i,provinceCode:'703',closeDate:'2026-08-01'})),
    runs:Array.from({length:500},(_,i)=>({id:'run-'+i,foundKeys:['vault-'+i]})),
    participations:Array.from({length:1000},(_,i)=>({key:'participation-'+i,contractor:'Test '+i})),
    winnerLookup:legacy,areaScan:legacy,investorScan:legacy,...initial});
  const calls={gets:[],sets:[],queries:[],network:[],downloads:[]},alarms=new Map();
  let strict=false,hold=null;
  const fail=async(...args)=>{calls.network.push(args.map(String));throw Error('Network disabled in hot-path fixture');};
  const runtime={id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',getURL:p=>`chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${p}`,getManifest:()=>structuredClone(manifest),onMessage:event(),onInstalled:event(),onStartup:event()};
  const local={
    async get(keys){
      const names=keys==null?null:typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);
      calls.gets.push(names);
      if(strict&&(names===null||names.some(key=>warehouseKeys.has(key))))throw Error('Hot path read warehouse: '+JSON.stringify(names));
      if(keys==null)return structuredClone(state);
      if(typeof keys==='string')return structuredClone({[keys]:state[keys]});
      if(Array.isArray(keys))return structuredClone(Object.fromEntries(keys.map(key=>[key,state[key]])));
      return structuredClone(Object.fromEntries(Object.entries(keys).map(([key,value])=>[key,Object.hasOwn(state,key)?state[key]:value])));
    },
    async set(patch){
      calls.sets.push(Object.keys(patch));
      if(hold&&Object.hasOwn(patch,'planLookup')){const current=hold;hold=null;current.started();await current.wait;}
      Object.assign(state,structuredClone(patch));
    },
    async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete state[key];},
    async clear(){state={};},async setAccessLevel(){}
  };
  const chrome={runtime,storage:{local},
    alarms:{onAlarm:event(),async get(name){return structuredClone(alarms.get(name));},async getAll(){return structuredClone([...alarms.values()]);},async create(name,value){alarms.set(name,{name,...structuredClone(value)});},async clear(name){return alarms.delete(name);},async clearAll(){alarms.clear();}},
    tabs:{onRemoved:event(),onUpdated:event(),query:async()=>[],get:async id=>({id,status:'complete',url:origin}),create:fail,update:fail,remove:async()=>{},sendMessage:async()=>({ok:true})},
    notifications:{onClicked:event(),onButtonClicked:event(),create:async()=>''},
    downloads:{async download(args){calls.downloads.push(structuredClone(args));return calls.downloads.length;}},commands:{onCommand:event()}};
  const context=vm.createContext({...bindings,chrome,console,Date,URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,Blob,setTimeout,clearTimeout,setInterval,clearInterval,structuredClone,crypto:webcrypto,
    fetch:fail,fetchAllAreas:fail,fetchProvinces:fail,fetchWards:fail,
    btoa:value=>Buffer.from(value,'binary').toString('base64'),atob:value=>Buffer.from(value,'base64').toString('binary'),
    __query:async(tabId,payload)=>{calls.queries.push(structuredClone({tabId,payload}));return{ok:true};}});
  vm.runInContext(executable+'\nensureEgpSearchTab=async()=>({id:77,status:"complete"});\ndispatchLookupToTab=__query;\nglobalThis.__flush=async()=>{await storageQueue;};',context);
  await new Promise(resolve=>setImmediate(resolve));await context.__flush();
  assert.equal(runtime.onMessage.listeners.length,1);
  async function send(type,payload={},content=false){
    const sender=content?{id:runtime.id,url:origin,tab:{id:77,url:origin}}:{id:runtime.id,url:runtime.getURL('plans.html')};
    let timer;
    try{return await Promise.race([new Promise(resolve=>runtime.onMessage.listeners[0]({type,payload:structuredClone(payload)},sender,value=>resolve(structuredClone(value)))),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('No reply '+type)),2500);})]);}
    finally{clearTimeout(timer);}
  }
  return{send,calls,context,get state(){return structuredClone(state);},flush:()=>context.__flush(),
    protectWarehouse(){strict=true;calls.gets.length=0;},allowWarehouse(){strict=false;},
    holdNextPlanSave(){let started,release;const reached=new Promise(resolve=>{started=resolve;}),wait=new Promise(resolve=>{release=resolve;});hold={started,wait};return{reached,release};}};
}
function plan(n,decisionDate='2026-09-20T23:59:59',extra={}){
  return{planNo:`PL260000${String(n).padStart(4,'0')}`,planVersion:'00',name:'Kế hoạch kiểm thử '+n,
    procuringEntityCode:'vn5800939408',procuringEntityName:'Ban Quản lý dự án đầu tư xây dựng số 1',
    locations:[{provCode:'703',provName:'Tỉnh Lâm Đồng'}],decisionDate,publicDate:'2026-10-03T09:00:00',
    bidNamePlanNew:[{name:'Thi công kênh mương '+n,bidPrice:n*1000000000,bidField:'XL'}],
    bidName:['Thi công kênh mương '+n],bidPrice:[n*1000000000],investField:['XL'],...extra};
}
const activeQuery=h=>h.calls.queries.at(-1).payload;
const page=(query,records,extra={})=>({planId:query.id,mode:query.mode,queryIndex:Number(query.queryIndex)||0,records,pageIndex:0,totalElements:records.length,totalPages:1,...extra});
async function begin(h,criteria={}){
  const reply=await h.send('PLAN_LOOKUP',{investor:'vn5800939408',province:'Lâm Đồng',category:'XL',...criteria});
  assert.equal(reply.ok,true,reply.message);return activeQuery(h);
}
async function finish(h,query,total){
  const final=page(query,[],{pageIndex:1,totalElements:total,done:true});
  const reply=await h.send('KQLCNT_RESULTS',final,true);assert.equal(reply.ok,true,reply.message);
  const ack=await h.send('KQLCNT_DONE',{planId:query.id,mode:query.mode,queryIndex:Number(query.queryIndex)||0,ok:true},true);
  assert.equal(ack.ok,true,ack.message);await h.flush();return final;
}
function assertScopedReads(h){
  assert.ok(h.calls.gets.length>0);
  for(const keys of h.calls.gets){assert.ok(keys!==null,'no full-store read');assert.ok(keys.every(key=>!warehouseKeys.has(key)),JSON.stringify(keys));}
  assert.equal(h.calls.network.length,0);
}

test('416 GET_PLAN_STATE initial and unchanged revision do not deserialize a 20k vault or restore unrelated legacy views',async()=>{
  const lookup={id:'finished-plan-job',status:'SUCCESS',plans:[],planDataVersion:2,_viewRevision:'revision-seed'};
  const h=await harness({planLookup:lookup,planLookupViewRevision:'revision-seed'});h.protectWarehouse();
  const initial=await h.send('GET_PLAN_STATE');assert.equal(initial.ok,true,initial.message);assert.deepEqual(initial.lookup,lookup);assert.equal(initial.revision,'revision-seed');
  const afterInitial=h.calls.gets.length;
  const unchanged=await h.send('GET_PLAN_STATE',{revision:initial.revision});
  assert.deepEqual(unchanged,{ok:true,unchanged:true,revision:'revision-seed'});
  assert.equal(h.calls.gets.slice(afterInitial).some(keys=>keys?.includes('planLookup')),false,'unchanged view does not read the lookup array');
  assertScopedReads(h);
});

test('416 plan start, page ingest and terminal ACK use scoped reads and preserve disjoint counts',async()=>{
  const h=await harness();h.protectWarehouse();const query=await begin(h);
  const reply=await h.send('KQLCNT_RESULTS',page(query,[plan(1),plan(2,'2024-01-29T23:59:59')]),true);assert.equal(reply.ok,true,reply.message);
  await finish(h,query,2);
  const lookup=h.state.planLookup;assert.equal(lookup.status,'SUCCESS');assert.equal(lookup.serverCount,2);assert.equal(lookup.plans.length,2);assert.equal(lookup.coverage.complete,true);
  assertScopedReads(h);
});

test('416 simultaneous identical page retries share one transaction and conflicting in-flight data are rejected',async()=>{
  const h=await harness();h.protectWarehouse();const query=await begin(h);
  const payload=page(query,[plan(1)]),gate=h.holdNextPlanSave();
  const first=h.send('KQLCNT_RESULTS',payload,true);await gate.reached;
  const retry=h.send('KQLCNT_RESULTS',payload,true);
  const conflict=await h.send('KQLCNT_RESULTS',{...payload,records:[plan(2)]},true);
  assert.equal(conflict.ok,false);assert.match(conflict.message,/nội dung khác nhau/);
  gate.release();
  const replies=await Promise.all([first,retry]);assert.ok(replies.every(reply=>reply.ok===true));
  let lookup=h.state.planLookup;assert.equal(lookup.serverCount,1);assert.equal(lookup.plans.length,1);assert.equal(lookup.duplicateCount,0);assert.deepEqual(lookup.receivedPages,[0]);
  const persistedReplay=await h.send('KQLCNT_RESULTS',payload,true);assert.equal(persistedReplay.ok,true);assert.equal(persistedReplay.duplicate,true);
  const final=await finish(h,query,1);const finalReplay=await h.send('KQLCNT_RESULTS',final,true);assert.equal(finalReplay.ok,true);assert.equal(finalReplay.duplicate,true);
  lookup=h.state.planLookup;assert.equal(lookup.serverCount,1);assert.equal(lookup.coverage.fetched,1);assert.equal(lookup.plans.length,1);assert.equal(lookup.coverage.complete,true);
  assertScopedReads(h);
});

test('416 the frozen 90-day approval scope survives a long job and export retains the same matching rows and prices',async()=>{
  const now=Date.now;try{
    Date.now=()=>Date.parse('2026-10-05T05:00:00Z');
    const h=await harness();h.protectWarehouse();const query=await begin(h,{days:90});
    const frozen=structuredClone(h.state.planLookup.criteria.dateRange);assert.ok(Number.isFinite(frozen.from)&&Number.isFinite(frozen.to));
    const remote=query.query.filters.find(filter=>filter.fieldName==='bidCloseDate');assert.ok(remote);assert.ok(Date.parse(remote.from)<=frozen.from);assert.ok(Date.parse(remote.to)>=frozen.to);
    // Core imports use the host clock too, so this advances the real date gate,
    // not just the VM's displayed timestamps.
    Date.now=()=>Date.parse('2027-01-05T05:00:00Z');
    const rows=[plan(1),plan(2,'2024-01-29T23:59:59'),plan(3,new Date(frozen.from+3600000).toISOString())];
    const reply=await h.send('KQLCNT_RESULTS',page(query,rows),true);assert.equal(reply.ok,true,reply.message);
    await finish(h,query,rows.length);
    const lookup=h.state.planLookup;assert.deepEqual(lookup.criteria.dateRange,frozen);assert.equal(lookup.status,'SUCCESS');
    assert.deepEqual(lookup.plans.map(row=>row.planNo).sort(),['PL2600000001','PL2600000003']);assert.equal(lookup.coverage.outOfRange,1);assert.equal(lookup.coverage.match,2);assert.equal(lookup.summary.totalValue,4000000000);
    assertScopedReads(h);h.allowWarehouse();
    const exported=await h.send('EXPORT_PLANS_CSV');assert.equal(exported.ok,true,exported.message);assert.equal(h.calls.downloads.length,1);
    const download=h.calls.downloads[0];assert.match(download.filename,/\.xlsx$/);
    const bytes=Buffer.from(download.url.split(',')[1],'base64');
    const detail=workbookSheetXml({bytes},'Kế hoạch LCNT'),reconciliation=workbookSheetXml({bytes},'Đối soát');
    assert.match(detail,/PL2600000001/);assert.match(detail,/PL2600000003/);assert.doesNotMatch(detail,/PL2600000002/);
    assert.match(detail,/<v>1000000000<\/v>/);assert.match(detail,/<v>3000000000<\/v>/);assert.match(reconciliation,/Số ngày gần đây/);assert.match(reconciliation,/<v>90<\/v>/);
    assert.deepEqual(h.state.planLookup.criteria.dateRange,frozen);
  }finally{Date.now=now;}
});
