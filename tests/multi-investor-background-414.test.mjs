import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {DEFAULT_SETTINGS} from '../GiaoSuCuiBap/lib/core.js';
import {lookupBatch,batchCoverage,enrichProvince,provinceEvidence} from '../GiaoSuCuiBap/lib/investor-query-plan.js';
import {safeRunForBackup,safeTenderForBackup} from '../GiaoSuCuiBap/lib/backup.js';
import {passesHardFilter,hardFilterReason} from '../GiaoSuCuiBap/lib/hard-filter.js';
import {workbookSheetXml} from './fixtures/multi-investor-export-414.mjs';

// The actual router and imported business rules run here. Only browser I/O,
// catalogs and the later BBMT detail-reading phase are deterministic fakes.
const extension=new URL('../GiaoSuCuiBap/',import.meta.url),source=fs.readFileSync(new URL('background.js',extension),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',extension),'utf8')),bindings={};
for(const item of source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/gm)){
  const exports=await import(new URL(item[2],extension));
  for(const spec of item[1].split(',')){const [name,local=name]=spec.trim().split(/\s+as\s+/);assert.ok(name in exports,name);bindings[local]=exports[name];}
}
const executable=source.replace(/^import\s*\{[^}]+\}\s*from\s*['"][^'"]+['"];?/gm,'');
const event=()=>{const listeners=[];return{listeners,addListener(fn){listeners.push(fn);},removeListener(fn){const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);}};};
const origin='https://muasamcong.mpi.gov.vn/web/guest/contractor-selection';
const selected='Đức Trọng; Đơn Dương; Phan Thiết';
const names=['Đức Trọng','Đơn Dương','Phan Thiết'];
const catalog={fetchedAt:new Date().toISOString(),provinces:[{code:'703',name:'Tỉnh Lâm Đồng',fold:'tinh lam dong'},{code:'75',name:'Tỉnh Đồng Nai',fold:'tinh dong nai'}],wardsByProvince:{}};
const quiet={...DEFAULT_SETTINGS,autoScan:false,scanOnStartup:false,telegramEnabled:false,notifyWebhook:'',notifyEmail:'',minPrice:0,maxPrice:0,requiredKeywords:[],requireConstruction:false,provinces:[],alertMinScore:101};
async function harness(initial={}){
  let state=structuredClone({settings:quiet,areas:catalog,provinceCatalog:catalog,...initial});
  const calls={queries:[],details:[],network:[],notifications:[],downloads:[]},alarms=new Map(),clone=structuredClone;
  const fail=async(...args)=>{calls.network.push(args.map(String));throw Error('Network disabled in multi-investor router fixture');};
  const runtime={id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',getURL:p=>`chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${p}`,getManifest:()=>clone(manifest),onMessage:event(),onInstalled:event(),onStartup:event()};
  const local={async get(keys){if(keys==null)return clone(state);if(typeof keys==='string')return clone({[keys]:state[keys]});if(Array.isArray(keys))return clone(Object.fromEntries(keys.map(k=>[k,state[k]])));return clone(Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,Object.hasOwn(state,k)?state[k]:v])));},
    async set(patch){Object.assign(state,clone(patch));},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete state[key];},async clear(){state={};},async setAccessLevel(){}};
  const chrome={runtime,storage:{local},alarms:{onAlarm:event(),async get(name){return clone(alarms.get(name));},async getAll(){return clone([...alarms.values()]);},async create(name,value){alarms.set(name,{name,...clone(value)});},async clear(name){return alarms.delete(name);},async clearAll(){alarms.clear();}},
    tabs:{onRemoved:event(),onUpdated:event(),query:async()=>[],get:async id=>({id,status:'complete',url:origin}),create:fail,update:fail,remove:async()=>{},sendMessage:async()=>({ok:true})},
    notifications:{onClicked:event(),onButtonClicked:event(),async create(...args){calls.notifications.push(clone(args));return 'blocked';}},downloads:{async download(args){calls.downloads.push(clone(args));return calls.downloads.length;}},commands:{onCommand:event()}};
  const context=vm.createContext({...bindings,chrome,console,Date,URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,Blob,setTimeout,clearTimeout,setInterval,clearInterval,structuredClone,crypto:webcrypto,
    fetch:fail,fetchAllAreas:fail,fetchProvinces:fail,fetchWards:fail,btoa:v=>Buffer.from(v,'binary').toString('base64'),atob:v=>Buffer.from(v,'base64').toString('binary'),
    __query:async(tabId,payload)=>{calls.queries.push(clone({tabId,payload}));return{ok:true};},__detail:async(...args)=>{calls.details.push(clone(args));}});
  vm.runInContext(executable+'\nensureEgpSearchTab=async()=>({id:77,status:"complete"});\ndispatchLookupToTab=__query;\nstartBidOpenDetailPhase=__detail;\nglobalThis.__flush=async()=>{await storageQueue;};',context);
  await new Promise(resolve=>setImmediate(resolve));await context.__flush();assert.equal(runtime.onMessage.listeners.length,1);
  async function send(type,payload={},content=false){
    const sender=content?{id:runtime.id,url:origin,tab:{id:77,url:origin}}:{id:runtime.id,url:runtime.getURL('search.html')};
    let timer;try{return await Promise.race([new Promise(resolve=>runtime.onMessage.listeners[0]({type,payload:clone(payload)},sender,value=>resolve(clone(value)))),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('No reply '+type)),2500);})]);}finally{clearTimeout(timer);}
  }
  return{send,calls,context,alarms,get state(){return clone(state);},flush:()=>context.__flush()};
}
const notice=(n,name='Ban QLDA Đức Trọng và Đơn Dương',extra={})=>({notifyNo:`IB260000${String(n).padStart(4,'0')}`,notifyVersion:'00',bidName:'Thi công kênh mương',investorName:name,investorCode:'vn0012345678',bidPrice:3e9,investField:'XL',locations:[{provCode:'703',provName:'Tỉnh Lâm Đồng'}],publicDate:'2026-09-14T01:00:00Z',bidCloseDate:'2099-01-01T00:00:00Z',bidRealityOpenDate:'2026-09-14T02:00:00Z',...extra});
const plan=(n,name,extra={})=>({planNo:`PL260000${String(n).padStart(4,'0')}`,investorName:name,investorCode:'vn0012345678',decisionDate:'2026-09-14T01:00:00Z',investField:['XL'],bidName:['Thi công kênh mương'],bidPrice:[3e9],locations:[{provCode:'703',provName:'Tỉnh Lâm Đồng'}],...extra});
const winner=(n,name,extra={})=>({...notice(n,name),winningCode:['vn0101234567'],winningContractorName:['Công ty A'],contractorName:'Công ty A',bidWinningPrice:2.8e9,decisionDate:'2026-09-15T02:00:00Z',publicDateKqlcnt:'2026-09-15T02:00:00Z',statusForNotify:'CNTTT',...extra});
const activeQuery=h=>h.calls.queries.at(-1).payload;
const queryPayload=(query,extra={})=>({planId:query.id,mode:query.mode,queryIndex:Number(query.queryIndex)||0,...extra});
async function resultPage(h,query,records,extra={}){
  const reply=await h.send('KQLCNT_RESULTS',queryPayload(query,{records,pageIndex:0,totalElements:records.length,totalPages:1,...extra}),true);assert.equal(reply.ok,true,reply.message);return reply;
}
async function finalPage(h,query,total,extra={}){
  const reply=await h.send('KQLCNT_RESULTS',queryPayload(query,{records:[],pageIndex:1,totalElements:total,totalPages:1,done:true,...extra}),true);assert.equal(reply.ok,true,reply.message);return reply;
}
async function ack(h,query,extra={}){const reply=await h.send('KQLCNT_DONE',queryPayload(query,{ok:true,...extra}),true);assert.equal(reply.ok,true,reply.message);await h.flush();return reply;}
async function finishQuery(h,records,extra={}){
  const query=activeQuery(h),before=h.calls.queries.length;await resultPage(h,query,records);await finalPage(h,query,records.length,extra);
  assert.equal(h.calls.queries.length,before,'next query waits for DONE acknowledgment');await ack(h,query,extra);return query;
}
function assertTerms(h,mode,expected=names){
  const queries=h.calls.queries.filter(call=>call.payload.mode===mode).map(call=>call.payload.query);
  assert.deepEqual(queries.map(query=>query.keyWord),expected);
  for(const query of queries)assert.doesNotMatch(query.keyWord,/[;\r\n]/);
}

test('414 router TBMT queries owners sequentially, rejects stale pages and combines deduplicated complete coverage',async()=>{
  const h=await harness();const start=await h.send('TBMT_SEARCH',{investor:selected,province:'Lâm Đồng',category:'XL'});assert.equal(start.ok,true,start.message);
  const id=h.state.activeRun.id;assert.equal(h.calls.queries.length,1);assert.equal(activeQuery(h).query.keyWord,names[0]);
  const a=notice(1),foreign=notice(2,'UBND xã Đơn Dương',{locations:[{provCode:'75',provName:'Tỉnh Đồng Nai'}]}),other=notice(3,'UBND xã Bảo Lâm'),unknown=notice(4,'UBND phường Phan Thiết',{locations:[]});
  const first=await finishQuery(h,[a,foreign,other,unknown]);assert.equal(h.calls.queries.length,2);
  const before=h.state.activeRun;const stale=await h.send('KQLCNT_RESULTS',queryPayload(first,{pageIndex:0,totalElements:1,totalPages:1,records:[notice(99)]}),true);
  assert.equal(stale.ok,false);assert.deepEqual(h.state.activeRun,before);
  await finishQuery(h,[a]);await finishQuery(h,[notice(5,'UBND phường Phan Thiết')]);assertTerms(h,'tbmt');
  assert.equal(h.state.activeRun,null);const run=h.state.runs.find(item=>item.id===id);
  assert.equal(run.status,'SUCCESS');assert.equal(run.coverage.complete,true);assert.equal(run.coverage.fetched,6);assert.equal(run.coverage.match,2);assert.equal(run.coverage.outOfRange,2);assert.equal(run.coverage.insufficient,1);
  assert.equal(new Set(run.foundKeys).size,5);assert.equal(h.calls.network.length,0);
});

test('414 router plans combine OR queries without treating cross-query overlap as missing source data',async()=>{
  const h=await harness();const start=await h.send('PLAN_LOOKUP',{investor:selected,province:'Lâm Đồng'});assert.equal(start.ok,true,start.message);
  const a=plan(1,'Ban QLDA Đức Trọng và Đơn Dương');await finishQuery(h,[a]);assert.equal(h.state.planLookup.status,'RUNNING');
  await finishQuery(h,[a,plan(2,'UBND xã Đơn Dương',{locations:[{provCode:'75',provName:'Tỉnh Đồng Nai'}]})]);
  await finishQuery(h,[plan(3,'UBND phường Phan Thiết'),plan(4,'UBND phường Phan Thiết',{locations:[]})]);assertTerms(h,'khlcnt');
  const lookup=h.state.planLookup;assert.equal(lookup.status,'SUCCESS');assert.equal(lookup.coverage.complete,true);assert.equal(lookup.coverage.fetched,5);
  assert.equal(lookup.plans.length,2);assert.equal(lookup.insufficientPlans.length,1);assert.equal(lookup.coverage.outOfRange,1);assert.equal(lookup.summary.packageCount,2);
});

test('414 router BBMT completes every owner list before starting a single detail-reading phase',async()=>{
  const h=await harness();const start=await h.send('BID_OPEN_SCAN',{investor:selected,province:'Lâm Đồng',fromDate:'2026-09-01',toDate:'2026-09-30',maxPackages:20});assert.equal(start.ok,true,start.message);
  const a=notice(1);await finishQuery(h,[a]);assert.equal(h.calls.details.length,0);assert.equal(h.state.bidOpenScan.status,'LISTING');
  await finishQuery(h,[a,notice(2,'UBND xã Đơn Dương',{locations:[{provCode:'75',provName:'Tỉnh Đồng Nai'}]})]);assert.equal(h.calls.details.length,0);
  await finishQuery(h,[notice(3,'UBND phường Phan Thiết')]);assertTerms(h,'bbmt-list');
  assert.equal(h.calls.details.length,1);assert.equal(h.state.bidOpenScan.packages.length,2);assert.equal(h.state.bidOpenScan.coverage.complete,true);
  assert.equal(h.state.bidOpenScan.partial,false);assert.equal(h.state.bidOpenScan.coverage.outOfRange,1);
});

test('414 router winner lookup joins province proof only for the exact notice revision and still applies owner names',async()=>{
  const h=await harness();const start=await h.send('WINNER_LOOKUP',{query:'0101234567',investor:selected,province:'Lâm Đồng'});assert.equal(start.ok,true,start.message);
  assert.equal(activeQuery(h).mode,'tbmt','province evidence precedes result queries');
  await finishQuery(h,[notice(1)]);await finishQuery(h,[notice(2)]);await finishQuery(h,[notice(3)]);
  assertTerms(h,'tbmt');assert.equal(activeQuery(h).mode,'exact');
  await finishQuery(h,[winner(1,'UBND xã Đức Trọng',{locations:[]}),winner(2,'UBND xã Đơn Dương',{notifyVersion:'01',locations:[]}),winner(4,'UBND xã Bảo Lâm')]);
  await finishQuery(h,[winner(1,'UBND xã Đức Trọng',{locations:[]}),winner(5,'UBND xã Đơn Dương',{locations:[{provCode:'75',provName:'Tỉnh Đồng Nai'}]})]);
  await finishQuery(h,[winner(3,'UBND phường Phan Thiết',{locations:[]})]);assertTerms(h,'exact');
  const lookup=h.state.winnerLookup;assert.equal(lookup.status,'SUCCESS');assert.equal(lookup.packages.length,2);assert.equal(lookup.insufficientPackages.length,1);
  assert.equal(lookup.coverage.outOfRange,2);assert.equal(lookup.coverage.insufficient,1);assert.equal(lookup.coverage.complete,true);
  assert.ok(lookup.packages.every(row=>row.areaEvidence?.type==='linked-tbmt'));assert.equal(lookup.insufficientPackages[0].version,'01');
});

test('414 area analysis accepts an owner list without one compulsory ward and limits both queries and statistics',async()=>{
  const h=await harness();const start=await h.send('AREA_SCAN',{investor:selected,province:'Lâm Đồng'});assert.equal(start.ok,true,start.message);
  await finishQuery(h,[notice(1)]);await finishQuery(h,[notice(2)]);await finishQuery(h,[notice(3)]);assertTerms(h,'tbmt');
  await finishQuery(h,[winner(1,'UBND xã Đức Trọng',{locations:[]})]);await finishQuery(h,[winner(2,'UBND xã Đơn Dương',{locations:[]})]);
  await finishQuery(h,[winner(3,'UBND phường Phan Thiết',{locations:[]}),winner(4,'UBND xã Bảo Lâm')]);assertTerms(h,'area');
  const scan=h.state.areaScan;assert.equal(scan.status,'SUCCESS');assert.equal(scan.packages.length,3);assert.equal(scan.coverage.outOfRange,1);assert.equal(scan.coverage.complete,true);
  assert.equal(scan.summary.packageCount,3);
});

test('414 investor discovery fans out names, applies province evidence and never emits unselected owners',async()=>{
  const h=await harness();const start=await h.send('INVESTOR_SCAN',{keyword:selected,province:'Lâm Đồng'});assert.equal(start.ok,true,start.message);
  await finishQuery(h,[notice(1)]);await finishQuery(h,[notice(2)]);await finishQuery(h,[notice(3)]);assertTerms(h,'tbmt');
  await finishQuery(h,[winner(1,'UBND xã Đức Trọng',{locations:[],investorCode:'vn0012345671'})]);
  await finishQuery(h,[winner(2,'UBND xã Đơn Dương',{locations:[],investorCode:'vn0012345672'})]);
  await finishQuery(h,[winner(3,'UBND phường Phan Thiết',{locations:[],investorCode:'vn0012345673'}),winner(4,'UBND xã Bảo Lâm',{investorCode:'vn0012345674'})]);assertTerms(h,'investor');
  const scan=h.state.investorScan;assert.equal(scan.status,'SUCCESS');assert.equal(scan.packages.length,3);assert.equal(scan.candidates.length,3);assert.equal(scan.coverage.outOfRange,1);assert.equal(scan.coverage.complete,true);
});

test('414 stopping after the first final page prevents every later owner query, including a late DONE replay',async()=>{
  for(const [type,cancel,payload,key] of [
    ['PLAN_LOOKUP','CANCEL_PLAN_LOOKUP',{investor:selected,province:'Lâm Đồng'},'planLookup'],
    ['BID_OPEN_SCAN','CANCEL_BID_OPEN_SCAN',{investor:selected,province:'Lâm Đồng'},'bidOpenScan'],
    ['WINNER_LOOKUP','CANCEL_WINNER_LOOKUP',{query:'0101234567',investor:selected,province:'Lâm Đồng'},'winnerLookup'],
    ['AREA_SCAN','CANCEL_AREA_SCAN',{investor:selected,province:'Lâm Đồng'},'areaScan'],
    ['INVESTOR_SCAN','CANCEL_INVESTOR_SCAN',{keyword:selected,province:'Lâm Đồng'},'investorScan']]){
    const h=await harness();const start=await h.send(type,payload);assert.equal(start.ok,true,`${type}: ${start.message}`);
    const query=activeQuery(h);await resultPage(h,query,[]);await finalPage(h,query,0);
    assert.equal((await h.send(cancel)).ok,true,cancel);const stopped=h.state[key];assert.equal(stopped.cancelled,true);
    await ack(h,query);assert.equal(h.calls.queries.length,1,type);assert.equal(h.calls.details.length,0,type);assert.equal(h.state[key].cancelled,true);
  }
});

test('414 invalid owner selections are rejected before any browser query across all entry points',async()=>{
  const tooMany=Array.from({length:21},(_,i)=>`Đơn vị ${i}`).join(';');
  for(const invalid of [';',{},false,'Đức Trọng; '+'x'.repeat(500),tooMany])for(const type of ['TBMT_SEARCH','PLAN_LOOKUP','BID_OPEN_SCAN','WINNER_LOOKUP','AREA_SCAN','INVESTOR_SCAN']){
    const h=await harness();const payload={province:'Lâm Đồng',investor:invalid,query:'0101234567',keyword:type==='INVESTOR_SCAN'?invalid:''};
    const reply=await h.send(type,payload);assert.equal(reply.ok,false,`${type} ${JSON.stringify(invalid)}`);assert.equal(h.calls.queries.length,0,type);
  }
});

test('414 a capped owner query retains partial coverage even when later owner queries finish normally',async()=>{
  const h=await harness();assert.equal((await h.send('PLAN_LOOKUP',{investor:selected,province:'Lâm Đồng'})).ok,true);
  const first=activeQuery(h);await resultPage(h,first,[plan(1,'UBND xã Đức Trọng')],{totalElements:100,totalPages:2});
  await finalPage(h,first,100,{totalPages:2,capped:true,partial:true});await ack(h,first,{partial:true});
  await finishQuery(h,[plan(2,'UBND xã Đơn Dương')]);await finishQuery(h,[plan(3,'UBND phường Phan Thiết')]);
  assert.equal(h.state.planLookup.status,'PARTIAL');assert.equal(h.state.planLookup.coverage.complete,false);assert.equal(h.state.planLookup.plans.length,3);
});

test('414 winners can be searched by the chosen owners without requiring one contractor name or tax code',async()=>{
  const h=await harness();const start=await h.send('WINNER_LOOKUP',{investor:selected});assert.equal(start.ok,true,start.message);
  assert.equal(h.state.winnerLookup.scopeOnly,true);assert.equal(activeQuery(h).mode,'exact');
  await finishQuery(h,[winner(1,'UBND xã Đức Trọng')]);await finishQuery(h,[winner(2,'UBND xã Đơn Dương',{winningCode:['vn0201234567'],winningContractorName:['Công ty B']})]);
  await finishQuery(h,[winner(3,'UBND phường Phan Thiết')]);assertTerms(h,'exact');
  assert.equal(h.state.winnerLookup.packages.length,3);assert.equal(h.state.winnerLookup.status,'SUCCESS');assert.equal(h.state.winnerLookup.coverage.complete,true);
  assert.deepEqual(h.state.winnerCache||{},{});
});

const ownerResultFlows=[
  ['WINNER_LOOKUP','winnerLookup',{investor:selected}],
  ['AREA_SCAN','areaScan',{investor:selected}],
  ['INVESTOR_SCAN','investorScan',{keyword:selected}]
];
const noWinner={winningCode:[],winningContractorName:[],contractorName:'',ventureName:'',bidWinningPrice:null};

test('414 owner-only winners, area statistics and investor discovery distinguish missing winners from confirmed no-award results',async()=>{
  for(const [type,key,payload] of ownerResultFlows){
    const h=await harness();assert.equal((await h.send(type,payload)).ok,true,type);
    await finishQuery(h,[
      winner(1,'UBND xã Đức Trọng',noWinner),
      winner(2,'UBND xã Đức Trọng',{...noWinner,statusForNotify:'DHT'}),
      winner(3,'UBND xã Đức Trọng',{statusForNotify:'HUY'}),
      winner(4,'UBND xã Đức Trọng',{...noWinner,statusForNotify:'KCNTTT'}),
      winner(5,'UBND xã Đức Trọng',{winningContractorName:[],contractorName:'',bidWinningPrice:0}),
      winner(6,'UBND xã Đức Trọng',{winningCode:[],bidWinningPrice:null})
    ]);
    await finishQuery(h,[]);await finishQuery(h,[]);
    const job=h.state[key];assert.equal(job.status,'SUCCESS',type);assert.equal(job.coverage.complete,true,type);
    assert.deepEqual(job.packages.map(row=>row.notifyNo).sort(),['IB2600000005','IB2600000006'],type);
    assert.deepEqual(job.insufficientPackages.map(row=>row.notifyNo).sort(),['IB2600000001','IB2600000002'],type);
    assert.equal(job.coverage.match,2,type);assert.equal(job.coverage.insufficient,2,type);assert.equal(job.coverage.outOfRange,2,type);
    assert.ok(job.insufficientPackages.every(row=>row.filterReason==='insufficient-winner'),type);
    assert.equal(job.packages.find(row=>row.notifyNo==='IB2600000005').winningPrice,0,type);
    assert.equal(job.packages.find(row=>row.notifyNo==='IB2600000006').discount.rate,null,type);
    if(key==='areaScan')assert.equal(job.summary.packageCount,2,type);
    if(key==='investorScan')assert.equal(job.candidates.reduce((sum,candidate)=>sum+candidate.packages,0),2,type);
  }
  assert.equal(hardFilterReason('no-award'),'Gói thầu đã hủy hoặc không có nhà thầu trúng thầu');
  assert.equal(hardFilterReason('insufficient-winner'),'Chưa có thông tin nhà thầu trúng thầu');
});

test('414 latest award classification removes stale matched rows and allows a later verified winner to recover',async()=>{
  for(const [type,key,payload] of ownerResultFlows){
    const h=await harness();assert.equal((await h.send(type,payload)).ok,true,type);
    await finishQuery(h,[winner(1),winner(2)]);assert.equal(h.state[key].packages.length,2,type);
    await finishQuery(h,[winner(1,undefined,noWinner),winner(2,undefined,{statusForNotify:'HUY'})]);
    const intermediate=h.state[key];assert.equal(intermediate.packages.length,0,type);assert.equal(intermediate.insufficientPackages.length,1,type);
    assert.equal(intermediate.coverage.match,0,type);assert.equal(intermediate.coverage.outOfRange,1,type);assert.equal(intermediate.coverage.insufficient,1,type);
    await finishQuery(h,[winner(1,undefined,{bidWinningPrice:0})]);
    const job=h.state[key];assert.equal(job.packages.length,1,type);assert.equal(job.insufficientPackages.length,0,type);
    assert.equal(job.packages[0].notifyNo,'IB2600000001',type);assert.equal(job.packages[0].winningPrice,0,type);
    assert.equal(job.coverage.match,1,type);assert.equal(job.coverage.outOfRange,1,type);assert.equal(job.coverage.insufficient,0,type);
  }
});

test('414 an exact owner profile also excludes cancelled awards and separates missing winner identity',async()=>{
  const h=await harness();assert.equal((await h.send('INVESTOR_SCAN',{codes:['vn0012345678'],name:'Ban QLDA đã chọn'})).ok,true);
  await finishQuery(h,[winner(1),winner(2,undefined,noWinner),winner(3,undefined,{statusForNotify:'KCNTTT'})]);
  const job=h.state.investorScan;assert.equal(job.status,'SUCCESS');assert.equal(job.packages.length,1);assert.equal(job.insufficientPackages.length,1);
  assert.equal(job.coverage.match,1);assert.equal(job.coverage.insufficient,1);assert.equal(job.coverage.outOfRange,1);
  assert.equal(job.insufficientPackages[0].filterReason,'insufficient-winner');
});

test('414 a confirmed no-award status remains outside even when its province is missing',async()=>{
  for(const [type,key,payload] of ownerResultFlows){
    const h=await harness();assert.equal((await h.send(type,{...payload,province:'Lâm Đồng'})).ok,true,type);
    for(let i=0;i<3;i++)await finishQuery(h,[]);
    await finishQuery(h,[winner(1,'UBND xã Đức Trọng',{locations:[],statusForNotify:'HUY'}),
      winner(2,'UBND xã Đức Trọng',{...noWinner,locations:[],statusForNotify:'KCNTTT'}),
      winner(3,'UBND xã Đức Trọng',{locations:[]})]);
    await finishQuery(h,[]);await finishQuery(h,[]);
    const job=h.state[key];assert.equal(job.packages.length,0,type);assert.equal(job.insufficientPackages.length,1,type);
    assert.equal(job.insufficientPackages[0].notifyNo,'IB2600000003',type);assert.equal(job.coverage.outOfRange,2,type);
    for(const n of [1,2])assert.deepEqual(job.resultStates[`IB260000000${n}::00`],{filterState:'OUT_OF_RANGE',filterReason:'no-award'},type);
  }
});

test('414 restored lookup GET and real Excel export repair stale matched winners without changing saved source data',async()=>{
  for(const [key,mode,exportType,detail] of [
    ['winnerLookup','exact','EXPORT_WINNERS_CSV','Gói đã trúng'],
    ['areaScan','area','EXPORT_AREA_XLSX','Danh sách gói thầu'],
    ['investorScan','profile','EXPORT_INVESTOR_XLSX','Danh sách gói thầu']]){
    const packages=[winner(1),winner(2,undefined,noWinner),winner(3,undefined,{statusForNotify:'HUY'}),winner(4,undefined,{locations:[]})]
      .map(row=>({...bindings.normalizeKqlcntRecord(row),filterState:'MATCH',filterReason:'match'}));
    packages[1].discount={rate:100,formula:'(3.000.000.000 − 0) ÷ 3.000.000.000 × 100 = 100,00%',basisSource:'Giá gói thầu'};
    const legacy={id:`legacy-${key}`,mode,status:'SUCCESS',scopeOnly:true,criteria:{investor:selected,province:'Lâm Đồng',provinces:['703'],codes:['vn0012345678'],name:'Ban đã chọn'},
      packages,insufficientPackages:[],summary:{total:4,packageCount:4,totalValue:99e9},
      resultStates:Object.fromEntries(packages.map(row=>[row.key,{filterState:'MATCH',filterReason:'match'}])),
      coverage:bindings.coverageOf({serverTotal:4,totalPages:1,pagesRead:1,fetched:4,match:4,done:true})};
    const h=await harness({[key]:legacy});const before=h.state[key];
    const response=key==='winnerLookup'?await h.send('GET_WINNER_STATE'):await h.send('GET_STATE');assert.equal(response.ok,true,key);
    const job=key==='winnerLookup'?response.lookup:response[key];
    assert.equal(job.packages.length,1,key);assert.equal(job.packages[0].notifyNo,'IB2600000001',key);
    assert.equal(job.insufficientPackages.length,2,key);assert.equal(job.excludedPackages.length,1,key);
    assert.equal(job.coverage.match,1,key);assert.equal(job.coverage.insufficient,2,key);assert.equal(job.coverage.outOfRange,1,key);
    assert.equal(job.summary.total??job.summary.packageCount,1,key);assert.match(job.migrationNote,/bản lưu cũ/);
    const unknown=job.insufficientPackages.find(row=>row.notifyNo==='IB2600000002');assert.equal(unknown.discount.rate,null);assert.equal(unknown.discount.formula,null);
    assert.deepEqual(h.state[key],before,'GET repair must not race-write saved data');
    assert.equal((await h.send(exportType)).ok,true,key);assert.equal(h.calls.downloads.length,1,key);
    const output={bytes:Buffer.from(h.calls.downloads[0].url.split(',')[1],'base64')};
    const xml=workbookSheetXml(output,detail);assert.match(xml,/IB2600000001/);
    for(const n of [2,3,4])assert.doesNotMatch(xml,new RegExp(`IB260000000${n}`),key);
    const unknownXml=workbookSheetXml(output,'Chưa đủ dữ liệu');assert.match(unknownXml,/IB2600000002/);assert.match(unknownXml,/IB2600000004/);assert.doesNotMatch(unknownXml,/IB2600000003/);
    assert.match(unknownXml,/Chưa có thông tin nhà thầu trúng thầu/);assert.deepEqual(h.state[key],before,'export repair must remain read-only');
    assert.equal(h.calls.queries.length,0);assert.equal(h.calls.network.length,0);
  }
});

test('414 restored lookup preserves explicit zero and original uncertain estimate evidence while requesting a rescan',async()=>{
  const zero=bindings.normalizeKqlcntRecord(winner(1,undefined,{bidWinningPrice:0}));
  const uncertain={...bindings.normalizeKqlcntRecord(winner(2)),discount:{basisSource:'Dự toán được duyệt sau KHLCNT',rate:6.67,formula:'old estimate label'},priceBasis:3e9};
  const raw=winner(3,undefined,{bidPrice:3e9,bidEstimatePrice:2.5e9,bidWinningPrice:2e9});
  const legacy={id:'legacy-prices',mode:'exact',scopeOnly:true,status:'PARTIAL',partial:true,criteria:{investor:selected},packages:[zero,uncertain,raw],
    coverage:bindings.coverageOf({serverTotal:10,totalPages:2,pagesRead:1,fetched:3,match:3,done:true,partial:true})};
  const h=await harness({winnerLookup:legacy});const {lookup}=await h.send('GET_WINNER_STATE');
  const repairedZero=lookup.packages.find(row=>row.notifyNo===zero.notifyNo);assert.equal(repairedZero.winningPrice,0);assert.equal(repairedZero.discount.rate,100);
  const repairedEstimate=lookup.packages.find(row=>row.notifyNo===uncertain.notifyNo);
  assert.equal(repairedEstimate.priceBasis,null);assert.equal(repairedEstimate.discountRate,null);assert.equal(repairedEstimate.discount.formula,null);
  assert.equal(repairedEstimate.legacyPriceFacts.priceBasis,3e9);assert.equal(repairedEstimate.legacyPriceFacts.discount.formula,'old estimate label');
  assert.match(lookup.migrationNote,/tra cứu lại/);assert.equal(lookup.coverage.complete,false);assert.equal(lookup.status,'PARTIAL');
  const normalizedRaw=lookup.packages.find(row=>row.notifyNo===raw.notifyNo);assert.equal(normalizedRaw.priceBasis,2.5e9);assert.equal(normalizedRaw.discount.rate,20);
  assert.deepEqual(h.state.winnerLookup,legacy);assert.equal(h.calls.queries.length,0);
});

test('414 a later query reclassifies same-key winner, area and investor rows instead of retaining stale matches',async()=>{
  for(const [type,key,payload] of [['WINNER_LOOKUP','winnerLookup',{query:'0101234567',investor:selected}],['AREA_SCAN','areaScan',{investor:selected}],['INVESTOR_SCAN','investorScan',{keyword:selected}]]){
    const h=await harness();assert.equal((await h.send(type,payload)).ok,true,type);
    await finishQuery(h,[winner(1,'Ban QLDA Đức Trọng và Đơn Dương'),winner(2,'Ban QLDA Đơn Dương và Phan Thiết')]);
    await finishQuery(h,[winner(1,'UBND xã Bảo Lâm')]);await finishQuery(h,[winner(2,'',{procuringEntityName:''})]);
    const job=h.state[key];assert.equal(job.packages.length,0,type);assert.equal(job.insufficientPackages.length,1,type);
    assert.equal(job.coverage.match,0,type);assert.equal(job.coverage.outOfRange,1,type);assert.equal(job.coverage.insufficient,1,type);
  }
});

test('414 a scoped winner lookup does not replace nationwide contractor cache or masquerade as its full profile',async()=>{
  const packages=[bindings.normalizeKqlcntRecord(winner(81,'UBND xã Đức Trọng'),'0101234567'),bindings.normalizeKqlcntRecord(winner(82,'UBND xã Bảo Lâm'),'0101234567')];
  const cached={taxCode:'0101234567',name:'Công ty A',total:2,totalValue:5.6e9,updatedAt:'2026-09-01T00:00:00Z',packages};
  const h=await harness({winnerCache:{'0101234567':cached}});assert.equal((await h.send('WINNER_LOOKUP',{query:'0101234567',investor:selected})).ok,true);
  await finishQuery(h,[winner(1,'UBND xã Đức Trọng')]);await finishQuery(h,[]);await finishQuery(h,[]);
  assert.deepEqual(h.state.winnerCache['0101234567'],cached);
  const profile=await h.send('CONTRACTOR_PROFILE',{taxCode:'0101234567'});assert.equal(profile.ok,true,profile.message);
  assert.equal(profile.profile.won.wonCount,2);assert.equal(profile.freshness.fresh,false);
});

test('414 province linking preserves explicit conflicts, isolates versions and never changes the result record',()=>{
  const selectedCriteria={investor:selected,province:'Lâm Đồng',provinces:['703']};
  const proof=provinceEvidence({notifyNo:'IB2600000001',version:'00',provinceCode:'703'});
  const job={criteria:selectedCriteria,provinceEvidence:{[proof.key]:proof}};
  const missing={notifyNo:'IB2600000001',version:'00',investorName:'UBND xã Đức Trọng'};
  const before=JSON.stringify(missing);assert.equal(enrichProvince(missing,job,catalog).provinceCode,'703');assert.equal(JSON.stringify(missing),before);
  assert.equal(enrichProvince({...missing,version:'01'},job,catalog).provinceCode,undefined);
  assert.equal(enrichProvince({...missing,provinceCode:'75'},job,catalog).provinceCode,'75');
  assert.equal(enrichProvince({...missing,notifyNo:'IB2600000099'},job,catalog).provinceCode,undefined);
});

test('414 batch coverage counts source query occurrences separately from deduplicated matches and flags missing province evidence',()=>{
  const criteria={investor:selected,province:'Lâm Đồng',provinces:['703']};
  const queries=names.map(keyWord=>({keyWord}));const queryBatch=lookupBatch(criteria,queries,'exact',0,true);assert.equal(queryBatch.length,6);
  assert.deepEqual(queryBatch.map(task=>task.purpose),['province','province','province','results','results','results']);
  assert.deepEqual(queryBatch.slice(0,3).map(task=>task.query.keyWord),names);
  const receipt={serverTotal:1,totalPages:1,pagesRead:1,fetched:1,complete:true,done:true};
  const receipts=Object.fromEntries(queryBatch.map((task,i)=>[i,{...receipt}]));
  const complete=batchCoverage({queryBatch},receipts,{match:2,insufficient:0,outOfRange:0});assert.equal(complete.complete,true);assert.equal(complete.serverTotal,3);assert.equal(complete.fetched,3);assert.equal(complete.match,2);
  delete receipts[0];assert.equal(batchCoverage({queryBatch},receipts,{match:2}).complete,false);
  assert.match(batchCoverage({queryBatch},receipts,{match:2}).text,/Chưa lấy đủ/);
});

test('414 an exact winner search excludes another tax code even if its owner belongs to the selected list',async()=>{
  const h=await harness();assert.equal((await h.send('WINNER_LOOKUP',{query:'0101234567',investor:selected})).ok,true);
  await finishQuery(h,[winner(1,'UBND xã Đức Trọng'),winner(2,'UBND xã Đức Trọng',{winningCode:['vn0201234567']})]);
  await finishQuery(h,[winner(1,'UBND xã Đơn Dương',{winningCode:['vn0201234567']})]);await finishQuery(h,[winner(3,'UBND phường Phan Thiết')]);
  const lookup=h.state.winnerLookup;assert.equal(lookup.packages.length,1);assert.equal(lookup.packages[0].notifyNo,'IB2600000003');
  assert.equal(lookup.coverage.outOfRange,2);assert.equal(lookup.coverage.match,1);assert.equal(lookup.status,'SUCCESS');
});

test('414 an owner profile checks investorCode itself and cannot substitute a matching procuring-entity code',async()=>{
  const h=await harness();const start=await h.send('INVESTOR_SCAN',{codes:['vn0012345678'],name:'Ban QLDA đã chọn'});assert.equal(start.ok,true,start.message);
  const query=activeQuery(h).query;assert.deepEqual(query.filters.find(item=>item.fieldName==='investorCode').fieldValues,['vn0012345678']);
  await finishQuery(h,[winner(1,'Ban đúng',{investorCode:'vn0012345678'}),winner(2,'Ban khác',{investorCode:'vn0098765432',procuringEntityCode:'vn0012345678'}),winner(3,'Chưa rõ chủ đầu tư',{investorCode:'',procuringEntityCode:'vn0012345678'})]);
  const scan=h.state.investorScan;assert.equal(scan.packages.length,1);assert.equal(scan.packages[0].notifyNo,'IB2600000001');
  assert.equal(scan.insufficientPackages.length,1);assert.equal(scan.coverage.outOfRange,1);assert.equal(scan.coverage.match,1);
});

test('414 an intermediate capped query stays cancellable while later owner queries are running',async()=>{
  const h=await harness();assert.equal((await h.send('PLAN_LOOKUP',{investor:selected,province:'Lâm Đồng'})).ok,true);
  const first=activeQuery(h);await resultPage(h,first,[plan(1,'UBND xã Đức Trọng')],{totalElements:100,totalPages:2});
  await finalPage(h,first,100,{totalPages:2,capped:true,partial:true});assert.equal(h.state.planLookup.status,'RUNNING');
  await ack(h,first,{partial:true});assert.equal(h.calls.queries.length,2);assert.equal(h.state.planLookup.status,'RUNNING');
  assert.equal((await h.send('CANCEL_PLAN_LOOKUP')).ok,true);assert.equal(h.state.planLookup.cancelled,true);assert.equal(h.state.planLookup.status,'PARTIAL');
  const second=activeQuery(h);const late=await h.send('KQLCNT_RESULTS',queryPayload(second,{pageIndex:0,totalElements:1,totalPages:1,records:[plan(2,'UBND xã Đơn Dương')]}),true);
  assert.equal(late.ok,false);assert.equal(h.calls.queries.length,2);assert.equal(h.state.planLookup.plans.length,1);
});

test('414 actual backup export/import preserves owner aliases and codes in the warehouse and historical result snapshots',async()=>{
  const h=await harness();const rawCriteria={investor:' Đức Trọng\nĐơn Dương; Phan Thiết; duc trong ',province:'Lâm Đồng'};
  assert.equal((await h.send('TBMT_SEARCH',rawCriteria)).ok,true);
  const raw=notice(1,'Ban nguồn A',{procuringEntityName:'Ban QLDA Đức Trọng',procuringEntityCode:'vn0012345679',investorNames:['UBND phường Phan Thiết'],investorCodes:['vn0098765432']});
  await finishQuery(h,[raw]);await finishQuery(h,[]);await finishQuery(h,[]);
  assert.equal((await h.send('EXPORT_BACKUP')).ok,true);assert.equal(h.calls.downloads.length,1);
  const backup=JSON.parse(decodeURIComponent(h.calls.downloads[0].url.split(',').slice(1).join(',')));
  const tender=backup.tenders[0],run=backup.runs[0],snapshot=run.resultStates[tender.key];
  assert.equal(run.criteria.investor,selected);assert.deepEqual(run.criteria.provinces,['703']);
  for(const row of [tender,snapshot]){
    assert.equal(row.procuringEntityName,'Ban QLDA Đức Trọng');assert.equal(row.procuringEntityCode,'vn0012345679');assert.equal(row.investorCode,'vn0012345678');
    assert.ok(row.investorNames.includes('UBND phường Phan Thiết'));assert.ok(row.investorCodes.includes('vn0098765432'));
    assert.equal(passesHardFilter(row,{investor:'0098765432',provinces:['703']}).ok,true);
    assert.equal(passesHardFilter(row,{investor:'Phan Thiết',provinces:['703']}).ok,true);
  }
  const restored=await harness();assert.equal((await restored.send('IMPORT_BACKUP',{data:backup})).ok,true);
  const restoredTender=restored.state.tenders.find(row=>row.key===tender.key),restoredRun=restored.state.runs.find(row=>row.id===run.id);
  for(const key of ['investorCodes','investorNames','procuringEntityName','procuringEntityCode'])assert.deepEqual(restoredTender[key],tender[key],key);
  assert.deepEqual(restoredRun.resultStates[tender.key],snapshot);assert.equal(restoredRun.criteria.investor,selected);
  assert.equal(passesHardFilter(restoredTender,restoredRun.criteria).ok,true);
  assert.equal((await restored.send('EXPORT_BACKUP')).ok,true);
  const again=JSON.parse(decodeURIComponent(restored.calls.downloads[0].url.split(',').slice(1).join(',')));
  assert.deepEqual(again.runs[0].resultStates[tender.key],snapshot);assert.equal(again.runs[0].criteria.investor,selected);
});

test('414 malformed backup owner criteria remain invalid through repeated export/import rather than being truncated or cleared',async()=>{
  const badValues=[{},false,';','Đức Trọng; '+'x'.repeat(500),Array.from({length:21},(_,i)=>`Đơn vị ${i}`).join(';')];
  const tender=bindings.normalizeCandidate(notice(1));
  for(const [index,investor] of badValues.entries()){
    const run={id:`bad-${index}`,mode:'form',status:'SUCCESS',criteria:{investor,province:'Lâm Đồng',provinces:['703']},foundKeys:[tender.key],resultStates:{[tender.key]:{...tender,filterState:'MATCH',matched:true}}};
    const safe=safeRunForBackup(run);assert.equal(safe.criteria.investor,';');assert.equal(safe.criteria.investorFilterError,'invalid-investor-filter');assert.match(safe.criteria.investorFilterMessage,/không hợp lệ/);
    assert.deepEqual(safeRunForBackup(safe),safe);assert.equal(passesHardFilter(tender,safe.criteria).reason,'invalid-investor-filter');
    const restored=await harness();assert.equal((await restored.send('IMPORT_BACKUP',{data:{settings:quiet,tenders:[tender],runs:[run]}})).ok,true);
    const criteria=restored.state.runs[0].criteria;assert.equal(criteria.investor,';');assert.equal(criteria.investorFilterError,'invalid-investor-filter');
    assert.equal((await restored.send('TBMT_SEARCH',criteria)).ok,false);assert.equal(restored.calls.queries.length,0);
  }
});

test('414 backup identity lists reject non-string payloads, stay bounded and keep identifiers with leading zeros',()=>{
  const raw={procuringEntityName:'Ban QLDA Đức Trọng',procuringEntityCode:'vn0012345678',investorCode:'vn0012345679',investorNames:['Ban A',{},123,'Ban A',null],investorCodes:['vn0000123456',{},123,'vn0000123456',null]};
  const safe=safeTenderForBackup(raw);assert.deepEqual(safe.investorNames,['Ban A']);assert.deepEqual(safe.investorCodes,['vn0000123456']);
  assert.equal(safe.procuringEntityCode,raw.procuringEntityCode);assert.equal(safe.procuringEntityName,raw.procuringEntityName);
  const bounded=safeTenderForBackup({...raw,investorNames:Array.from({length:120},(_,i)=>`Ban ${i}`)});assert.equal(bounded.investorNames.length,100);
  assert.equal(hardFilterReason('contractor'),'Khác nhà thầu đã chọn');
});
