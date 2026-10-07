import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {queryHash,createQueryCache} from '../GiaoSuCuiBap/lib/query-cache.js';
import {createQueryRuntime,schemaIsRed} from '../GiaoSuCuiBap/lib/runtime-query.js';
import {createResultView,verifyExportKeys} from '../GiaoSuCuiBap/lib/result-view.js';
import {createSearchStateRuntime} from '../GiaoSuCuiBap/lib/runtime-search-state.js';
import {safeRunForBackup,safeTenderForBackup} from '../GiaoSuCuiBap/lib/backup.js';

const query={mode:'tbmt',pageSize:50,maxPages:1,query:{index:'es-contractor-selection',filters:[{fieldName:'type',fieldValues:['es-notify-contractor']} ]}};
const payload=(id='first')=>({...query,id,queryIndex:0});
function runner(state={}){
  const calls={sent:[],created:[],updated:[],results:[],done:[],cache:[]},known=[];
  const runtime=createQueryRuntime({getState:async()=>({settings:{},...state}),cryptoApi:webcrypto,
    tabs:{query:async()=>known,create:async args=>{const tab={id:77,...args};known.push(tab);calls.created.push(args);return tab;},update:async(id,args)=>{calls.updated.push(args);return {...known.find(t=>t.id===id),...args};}},
    waitForTab:async()=>{},sendToTab:async(tabId,message)=>{calls.sent.push({tabId,message});return message.type==='KQLCNT_PROBE'?{ok:true,resultsView:true,searchView:false,ready:true,pageError:null,busy:false}:{ok:true};},
    routeResults:async(p,s)=>{calls.results.push({p,s});return {ok:true};},routeDone:async(p,s)=>{calls.done.push({p,s});return {ok:true};},markCacheHit:async(id,meta)=>calls.cache.push({id,meta})});
  return {runtime,calls,state};
}

test('411 query hash ignores object property order but separates mode, limits and native filter identity',async()=>{
 const original=await queryHash(query,webcrypto);
 assert.equal(original,await queryHash({query:query.query,maxPages:1,pageSize:50,mode:'tbmt'},webcrypto));
 for(const change of [{mode:'khlcnt'},{maxPages:2},{pageSize:100},{query:{...query.query,index:'other'}}])assert.notEqual(original,await queryHash({...query,...change},webcrypto));
});

test('411 query cache expires strictly and keeps capped/unknown coverage without certifying it complete',()=>{
 let now=1000;const cache=createQueryCache({now:()=>now,ttlMs:100});
 const pages=[{pageIndex:0,records:[{notifyNo:'IB1'}],totalElements:200,totalPages:4,done:false},{pageIndex:1,records:[],totalElements:200,totalPages:4,done:true,capped:true,partial:true}];
 assert.equal(cache.put('key',pages,{ok:true,partial:true}),true);
 const hit=cache.get('key');assert.equal(hit.pages[1].partial,true);assert.equal(hit.pages[1].totalPages,4);assert.equal(hit.pages[1].capped,true);
 hit.pages[0].records[0].notifyNo='mutated';assert.equal(cache.get('key').pages[0].records[0].notifyNo,'IB1');
 now=1099;assert.ok(cache.get('key'));now=1100;assert.equal(cache.get('key'),null);
 assert.equal(cache.put('missing',[{pageIndex:1,records:[]},{pageIndex:2,done:true}],{ok:true}),false);
 assert.equal(cache.put('schema',[{pageIndex:0,records:[]},{pageIndex:1,done:true,schemaIssue:true}],{ok:true}),false);
});

test('411 native list tab is reused and cached pages replay through the same routers with the new job identity',async()=>{
 const {runtime,calls,state}=runner();const first=await runtime.acquire();
 state.bidOpenScan={id:'detail-job',status:'SCANNING',tabId:77,detailTabIds:[88,89]};
 const second=await runtime.acquire();assert.equal(first.id,second.id);assert.equal(calls.created.length,1);
 await runtime.dispatch(first.id,payload());
 runtime.captureResult({planId:'first',mode:'tbmt',queryIndex:0,pageIndex:0,totalElements:200,totalPages:4,records:[{notifyNo:'IB1'}],done:false},{tab:{id:77}});
 runtime.captureResult({planId:'first',mode:'tbmt',queryIndex:0,pageIndex:1,totalElements:200,totalPages:4,records:[],done:true,capped:true,partial:true},{tab:{id:77}});
 runtime.captureDone({planId:'first',mode:'tbmt',queryIndex:0,ok:true,partial:true},{tab:{id:77}});
 assert.equal((await runtime.dispatch(77,payload('second'))).cached,true);
 assert.equal(calls.sent.filter(x=>x.message.type==='KQLCNT_START').length,1);
 assert.equal(calls.results.length,2);assert.equal(calls.results[0].p.planId,'second');assert.equal(calls.results[1].p.capped,true);assert.equal(calls.results[1].p.totalPages,4);
 assert.equal(calls.done[0].p.planId,'second');assert.equal(calls.cache[0].meta.hit,true);
});

test('411 structural RED blocks ordinary native work while private recovery canary handles an explicitly empty source',async()=>{
 const {runtime,calls}=runner({liveCanary:{status:'RUNNING',lastStructuralStatus:'RED'}});
 assert.equal(schemaIsRed({liveCanary:{status:'RUNNING',lastStructuralStatus:'RED'}}),true);
 await assert.rejects(runtime.dispatch(77,payload()),/ĐỎ/);
 const pending=runtime.runProbe(query.query,{schema:'tbmt',timeoutMs:1000});
 while(!calls.sent.some(x=>x.message.type==='KQLCNT_START'))await new Promise(r=>setImmediate(r));
 const id=calls.sent.find(x=>x.message.type==='KQLCNT_START').message.payload.id;
 assert.equal(runtime.routeProbe('KQLCNT_RESULTS',{planId:id,mode:'tbmt',pageIndex:0,records:[],totalElements:0,totalPages:0},{tab:{id:88}}).ok,false);
 runtime.routeProbe('KQLCNT_RESULTS',{planId:id,mode:'tbmt',pageIndex:0,records:[],totalElements:0,totalPages:0},{tab:{id:77}});
 runtime.routeProbe('KQLCNT_RESULTS',{planId:id,mode:'tbmt',pageIndex:1,records:[],totalElements:0,totalPages:0,done:true},{tab:{id:77}});
 runtime.stop({keepProbes:true});assert.equal(runtime.isProbeTab(77),true);
 runtime.routeProbe('KQLCNT_DONE',{planId:id,mode:'tbmt',ok:true},{tab:{id:77}});
 const result=await pending;assert.equal(result.complete,true);assert.deepEqual(result.records,[]);assert.equal(runtime.isBusy(),false);
 assert.equal(calls.results.length,0);assert.equal(calls.done.length,0);assert.equal(runtime.cache.size(),0);
});

test('411 a structural terminal error remains SCHEMA_ERROR even when the final native acknowledgement has ok false',async()=>{
 for(const ok of [true,false]){
  const {runtime,calls}=runner();const pending=runtime.runProbe(query.query,{schema:'tbmt',timeoutMs:1000});
  while(!calls.sent.some(x=>x.message.type==='KQLCNT_START'))await new Promise(resolve=>setImmediate(resolve));
  const id=calls.sent.find(x=>x.message.type==='KQLCNT_START').message.payload.id;
  runtime.routeProbe('KQLCNT_RESULTS',{planId:id,mode:'tbmt',queryIndex:0,pageIndex:0,records:[],totalElements:null,totalPages:null,done:true,schemaIssue:true,partial:true,failureReason:'Fixture schema drift'},{tab:{id:77}});
  runtime.routeProbe('KQLCNT_DONE',{planId:id,mode:'tbmt',queryIndex:0,ok,message:'Fixture stopped native query'},{tab:{id:77}});
  const result=await pending;assert.equal(result.status,'SCHEMA_ERROR');assert.equal(result.complete,false);assert.equal(runtime.isBusy(),false);assert.equal(calls.results.length,0);assert.equal(calls.done.length,0);
 }
});

test('411 list totals and export share every filtered result across pages and reject hidden/partial arbitrary keys',()=>{
 const tenders=Array.from({length:86},(_,i)=>({key:`IB${i}`,notifyNo:`IB${i}`,bidName:`Cầu ${i}`,score:90,price:i+1,provinceCode:i<72?'68':'75',closeDate:'2099-01-01T00:00:00Z',watchlisted:true}));
 const run={id:'r',foundKeys:tenders.map(t=>t.key),criteria:{},resultStates:Object.fromEntries(tenders.map((t,i)=>[t.key,{filterState:i<80?'MATCH':'OUT_OF_RANGE',matched:i<80,price:t.price}]))};
 const view=createResultView(tenders,run,{criteriaState:'MATCH',provinceCode:'68',closeFrom:'2099-01-01',closeTo:'2099-01-01'});
 assert.equal(view.rows.length,72);assert.equal(view.summary.total,72);assert.equal(view.summary.totalValue,2628);
 assert.deepEqual(verifyExportKeys(view.rows,view.rows.map(t=>t.key)),view.rows);
 assert.throws(()=>verifyExportKeys(view.rows,view.rows.slice(0,30).map(t=>t.key)),/mọi trang/);
 assert.throws(()=>verifyExportKeys(view.rows,[...view.rows.slice(1).map(t=>t.key),'IB85']),/mọi trang/);
});

test('411 scoped search response validates revision and excludes other run records, snapshots and checklists',async()=>{
 let data={settings:{telegramBotToken:'SECRET'},tenders:[{key:'one'},{key:'hidden'}],runs:[{id:'r',mode:'form',foundKeys:['one'],resultStates:{one:{filterState:'MATCH'}}},{id:'other',foundKeys:['hidden'],resultStates:{hidden:{filterState:'MATCH'}}}],checklists:{one:{owner:'Alice'},hidden:{owner:'Bob'}}};
 const runtime=createSearchStateRuntime({storage:{get:async defaults=>({...defaults,...data})}});
 const state=await runtime.read({runId:'r'});assert.deepEqual(state.tenders.map(t=>t.key),['one']);assert.equal(state.runs[1].resultStates,undefined);assert.equal(state.checklists.hidden,undefined);assert.equal(JSON.stringify(state).includes('SECRET'),false);
 const same=await runtime.read({runId:'r',revision:state.revision});assert.equal(same.unchanged,true);assert.equal(same.tenders,undefined);
 data={...data,checklists:{...data.checklists,one:{owner:'Changed'}}};assert.notEqual((await runtime.read({runId:'r'})).revision,state.revision);
 const warehouse=await runtime.read({scope:'warehouse',keys:['hidden']});assert.deepEqual(warehouse.tenders.map(t=>t.key),['hidden']);assert.equal(warehouse.selectedRun,null);assert.equal(warehouse.checklists.one,undefined);
 assert.deepEqual((await runtime.read({runId:'absent'})).tenders,[]);
});

test('411 backup preserves exact ward parent evidence, category source and original run snapshot location',()=>{
 const record={key:'one',investField:'TV',fieldCode:'TV',provinceCode:'68',wardIdentities:[{code:'001',parentCode:'68',name:'Xã A'}],locations:[{provCode:'68',districtCode:'001'}]};
 const saved=safeTenderForBackup(record);assert.deepEqual(saved.wardIdentities,record.wardIdentities);assert.deepEqual(saved.locations,record.locations);assert.equal(saved.investField,'TV');
 const run=safeRunForBackup({foundKeys:['one'],criteria:{ward:'Xã A',wardIdentities:record.wardIdentities},resultStates:{one:{...record,filterState:'MATCH'}}});
 assert.deepEqual(run.criteria.wardIdentities,record.wardIdentities);assert.deepEqual(run.resultStates.one.locations,record.locations);assert.equal(run.resultStates.one.fieldCode,'TV');
});
