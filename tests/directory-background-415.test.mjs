import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {DEFAULT_SETTINGS} from '../GiaoSuCuiBap/lib/core.js';
import {ORGANIZATION_DIRECTORY} from '../GiaoSuCuiBap/lib/organization-directory-data.js';

// Independent copy of the minimal 4.14 router harness. The real background
// router and imported business rules execute unchanged. Only Chrome I/O and
// public administrative catalog responses are deterministic fakes.
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
const event=()=>{const listeners=[];return{listeners,addListener(fn){listeners.push(fn);},removeListener(fn){const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);}};};
const origin='https://muasamcong.mpi.gov.vn/web/guest/contractor-selection';
const alias='ban 1 tỉnh lâm đồng',boardCode='vn5800939408';
const boardName='Ban Quản lý dự án đầu tư xây dựng số 1';
const main1=ORGANIZATION_DIRECTORY.entries.find(e=>e.id==='ld-pmb-1');
assert.equal(main1?.eGpCode,boardCode,'The release must contain the directly verified Lâm Đồng Ban 1 identity');
const stamp=new Date().toISOString();
const catalog={fetchedAt:stamp,provinces:[
  {code:'68',name:'Tỉnh Lâm Đồng',current:true,fold:'tinh lam dong'},
  {code:'703',name:'Tỉnh Lâm Đồng',current:false,fold:'tinh lam dong'},
  {code:'75',name:'Tỉnh Đồng Nai',current:true,fold:'tinh dong nai'}
],wardsByProvince:{
  // Synthetic public-catalog identities, explicitly separate from organizations.
  '68':[{code:'90001',parentCode:'68',name:'Xã Đức Trọng',current:true}],
  '703':[{code:'90002',parentCode:'703',name:'Xã Đức Trọng',current:false}],
  '75':[{code:'90003',parentCode:'75',name:'Xã Long Thành',current:true}]
}};
const quiet={...DEFAULT_SETTINGS,autoScan:false,scanOnStartup:false,telegramEnabled:false,notifyWebhook:'',notifyEmail:'',minPrice:0,maxPrice:0,requiredKeywords:[],requireConstruction:false,provinces:[],alertMinScore:101};
async function harness(initial={},directoryData){
  let state=structuredClone({settings:quiet,areas:catalog,provinceCatalog:catalog,...initial});
  const calls={queries:[],details:[],network:[],notifications:[]},alarms=new Map(),clone=structuredClone;
  const fail=async(...args)=>{calls.network.push(args.map(String));throw Error('Network disabled in independent directory router fixture');};
  const runtime={id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',getURL:p=>`chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${p}`,getManifest:()=>clone(manifest),onMessage:event(),onInstalled:event(),onStartup:event()};
  const local={
    async get(keys){
      if(keys==null)return clone(state);
      if(typeof keys==='string')return clone({[keys]:state[keys]});
      if(Array.isArray(keys))return clone(Object.fromEntries(keys.map(k=>[k,state[k]])));
      return clone(Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,Object.hasOwn(state,k)?state[k]:v])));
    },
    async set(patch){Object.assign(state,clone(patch));},
    async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete state[key];},
    async clear(){state={};},async setAccessLevel(){}
  };
  const chrome={runtime,storage:{local},alarms:{onAlarm:event(),async get(name){return clone(alarms.get(name));},async getAll(){return clone([...alarms.values()]);},async create(name,value){alarms.set(name,{name,...clone(value)});},async clear(name){return alarms.delete(name);},async clearAll(){alarms.clear();}},
    tabs:{onRemoved:event(),onUpdated:event(),query:async()=>[],get:async id=>({id,status:'complete',url:origin}),create:fail,update:fail,remove:async()=>{},sendMessage:async()=>({ok:true})},
    notifications:{onClicked:event(),onButtonClicked:event(),async create(...args){calls.notifications.push(clone(args));return 'blocked';}},downloads:{download:fail},commands:{onCommand:event()}};
  const context=vm.createContext({...bindings,chrome,console,Date,URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,Blob,setTimeout,clearTimeout,setInterval,clearInterval,structuredClone,crypto:webcrypto,
    ...(directoryData?{createDirectoryRuntime:opts=>bindings.createDirectoryRuntime({...opts,data:directoryData})}:{}),
    fetch:fail,fetchAllAreas:fail,fetchProvinces:fail,fetchWards:fail,btoa:v=>Buffer.from(v,'binary').toString('base64'),atob:v=>Buffer.from(v,'base64').toString('binary'),
    __query:async(tabId,payload)=>{calls.queries.push(clone({tabId,payload}));return{ok:true};},
    __detail:async(...args)=>{calls.details.push(clone(args));}});
  vm.runInContext(executable+'\nensureEgpSearchTab=async()=>({id:77,status:"complete"});\ndispatchLookupToTab=__query;\nstartBidOpenDetailPhase=__detail;\nglobalThis.__flush=async()=>{await storageQueue;};',context);
  await new Promise(resolve=>setImmediate(resolve));await context.__flush();assert.equal(runtime.onMessage.listeners.length,1);
  async function send(type,payload={},content=false){
    const sender=content?{id:runtime.id,url:origin,tab:{id:77,url:origin}}:{id:runtime.id,url:runtime.getURL('search.html')};
    let timer;
    try{
      return await Promise.race([
        new Promise(resolve=>runtime.onMessage.listeners[0]({type,payload:clone(payload)},sender,value=>resolve(clone(value)))),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('No reply '+type)),2500);})
      ]);
    }finally{clearTimeout(timer);}
  }
  return{send,calls,get state(){return clone(state);},flush:()=>context.__flush()};
}
const entryPoints=[
  ['TBMT_SEARCH','investor','tbmt'],
  ['PLAN_LOOKUP','investor','khlcnt'],
  ['BID_OPEN_SCAN','investor','bbmt-list'],
  ['WINNER_LOOKUP','investor','exact'],
  ['AREA_SCAN','investor','area'],
  ['INVESTOR_SCAN','keyword','investor']
];
const latest=h=>h.calls.queries.at(-1)?.payload;
const queryPayload=(q,extra={})=>({planId:q.id,mode:q.mode,queryIndex:Number(q.queryIndex)||0,...extra});
async function finishQuery(h,records=[]){
  const q=latest(h),before=h.calls.queries.length;
  assert.equal((await h.send('KQLCNT_RESULTS',queryPayload(q,{records,pageIndex:0,totalElements:records.length,totalPages:1}),true)).ok,true);
  assert.equal((await h.send('KQLCNT_RESULTS',queryPayload(q,{records:[],pageIndex:1,totalElements:records.length,totalPages:1,done:true}),true)).ok,true);
  assert.equal(h.calls.queries.length,before,'The next query waits for its DONE acknowledgment');
  assert.equal((await h.send('KQLCNT_DONE',queryPayload(q,{ok:true}),true)).ok,true);
  await h.flush();return q;
}
const notice=(n,extra={})=>({
  notifyNo:`IB269999${String(n).padStart(4,'0')}`,notifyVersion:'00',
  bidName:'Thi công kênh mương',investorName:boardName,investorCode:boardCode,
  bidPrice:3e9,investField:'XL',locations:[{provCode:'68',provName:'Tỉnh Lâm Đồng'}],
  publicDate:'2026-09-14T01:00:00Z',bidCloseDate:'2099-01-01T00:00:00Z',
  bidRealityOpenDate:'2026-09-14T02:00:00Z',...extra
});
const plan=(n,extra={})=>({
  planNo:`PL269999${String(n).padStart(4,'0')}`,investorName:boardName,investorCode:boardCode,
  decisionDate:'2026-09-14T01:00:00Z',investField:['XL'],bidName:['Thi công kênh mương'],bidPrice:[3e9],
  locations:[{provCode:'68',provName:'Tỉnh Lâm Đồng'}],...extra
});
const provinceValues=q=>q.filters.filter(f=>f.fieldName==='locations.provCode').flatMap(f=>f.fieldValues).sort();

for(const [type,field,resultMode] of entryPoints)test(`415 actual router ${type} expands the official Ban 1 alias before sending e-GP queries`,async()=>{
  const h=await harness();
  const r=await h.send(type,{[field]:alias,province:'Lâm Đồng',...(type==='TBMT_SEARCH'?{category:'XL'}:{})});
  assert.equal(r.ok,true,r.message);assert.equal(h.calls.queries.length,1,type);
  const first=latest(h);
  assert.equal(first.query.keyWord,boardCode,type);
  assert.ok(first.query.matchFields.includes('investorCode'),type);
  assert.deepEqual(provinceValues(first.query),['68','703'],type+' retains current and legacy province identities');
  if(['WINNER_LOOKUP','AREA_SCAN','INVESTOR_SCAN'].includes(type)){
    assert.equal(first.mode,'tbmt','Province evidence must precede the award query');
    await finishQuery(h,[notice(1)]);
    const award=latest(h);assert.equal(award.mode,resultMode,type);
    assert.equal(award.query.keyWord,boardCode,type+' award phase retains the resolved code');
    assert.ok(award.query.matchFields.includes('investorCode'),type);
  }else assert.equal(first.mode,resultMode,type);
  assert.equal(h.calls.network.length,0);assert.equal(h.calls.notifications.length,0);
});

test('415 actual router refuses a deliberately ambiguous directory alias at all six entry points before creating queries',async()=>{
  // Inject only source data, never rules: this fixed collision fixture remains
  // meaningful when the national directory gains or loses real organizations.
  const duplicate={...main1,id:'fixture-dongnai-main1',provinceName:'Tỉnh Đồng Nai',provinceCode:'75',
    eGpCode:'',egpProof:null,aliases:['ban 1'],sources:[{url:'https://dongnai.gov.vn/fixture/main1',date:'2026-10-05'}]};
  const fixed={checkedAt:'2026-10-05',entries:[main1,duplicate]};
  for(const [type,field] of entryPoints){
    const h=await harness({},fixed),r=await h.send(type,{[field]:'ban 1'});
    assert.equal(r.ok,false,type);assert.equal(r.error,'ambiguous-directory',type);
    assert.equal(h.calls.queries.length,0,type);assert.equal(h.calls.network.length,0,type);
  }
});

test('415 actual router never resolves a Lâm Đồng-qualified alias to its code while another province is selected',async()=>{
  for(const [type,field] of entryPoints){
    const h=await harness(),r=await h.send(type,{[field]:alias,province:'Tỉnh Đồng Nai'});
    assert.equal(r.ok,true,r.message);
    const q=latest(h);
    assert.equal(q.query.keyWord,alias,type+' preserves unmatched free input');
    assert.notEqual(q.query.keyWord,boardCode,type);
    assert.deepEqual(provinceValues(q.query),['75'],type);
    assert.equal(h.calls.network.length,0,type);
  }
});

test('415 router deduplicates alias and its verified code without changing free geographic OR terms',async()=>{
  const h=await harness(),r=await h.send('PLAN_LOOKUP',{investor:`${alias}; ${boardCode}; Đức Trọng`,province:'Lâm Đồng'});
  assert.equal(r.ok,true,r.message);assert.equal(latest(h).query.keyWord,boardCode);
  await finishQuery(h,[]);
  assert.equal(latest(h).query.keyWord,'Đức Trọng');await finishQuery(h,[]);
  assert.deepEqual(h.calls.queries.map(c=>c.payload.query.keyWord),[boardCode,'Đức Trọng']);
  assert.equal(h.state.planLookup.status,'SUCCESS');
});

test('415 actual TBMT result gate uses the resolved code, rejects a same-name different code and preserves province uncertainty',async()=>{
  const h=await harness();assert.equal((await h.send('TBMT_SEARCH',{investor:alias,province:'Lâm Đồng',category:'XL'})).ok,true);
  const id=h.state.activeRun.id;
  await finishQuery(h,[
    notice(1,{investorName:'Tên hiển thị rút gọn của đơn vị'}),
    notice(2,{investorCode:'vn3400456032'}),
    notice(3,{locations:[{provCode:'75',provName:'Tỉnh Đồng Nai'}]}),
    notice(4,{investorCode:''})
  ]);
  const run=h.state.runs.find(r=>r.id===id);
  assert.equal(run.criteria.investor,boardCode);
  assert.equal(run.status,'SUCCESS');assert.equal(run.coverage.match,1);
  assert.equal(run.coverage.outOfRange,2);assert.equal(run.coverage.insufficient,1);
  const matched=Object.entries(run.resultStates).filter(([,r])=>r.filterState==='MATCH');
  assert.equal(matched.length,1);
  assert.equal(h.state.tenders.find(t=>t.key===matched[0][0]).notifyNo,notice(1).notifyNo);
});

test('415 actual plan result gate accepts only the verified owner code in the chosen province',async()=>{
  const h=await harness();assert.equal((await h.send('PLAN_LOOKUP',{investor:alias,province:'Lâm Đồng'})).ok,true);
  await finishQuery(h,[
    plan(1,{investorName:'Tên viết tắt trên e-GP'}),
    plan(2,{investorCode:'vn3400456032'}),
    plan(3,{locations:[{provCode:'75',provName:'Tỉnh Đồng Nai'}]}),
    plan(4,{investorCode:''})
  ]);
  const job=h.state.planLookup;
  assert.equal(job.status,'SUCCESS');assert.equal(job.criteria.investor,boardCode);
  assert.deepEqual(job.plans.map(r=>r.planNo),[plan(1).planNo]);
  assert.equal(job.insufficientPlans.length,1);assert.equal(job.coverage.outOfRange,2);
});

test('415 AREA_OPTIONS returns all 31 sourced Lâm Đồng boards separately from administrative ward identities',async()=>{
  const h=await harness(),r=await h.send('AREA_OPTIONS',{province:'Tỉnh Lâm Đồng'});
  assert.equal(r.ok,true,r.message);
  assert.equal(r.organizationOptions.length,31);
  const board=r.organizationOptions.find(e=>e.id==='ld-pmb-1');
  assert.equal(board.eGpCode,boardCode);assert.equal(board.queryValue,boardCode);
  assert.equal(board.kind,'organization');assert.equal(board.provinceName,'Tỉnh Lâm Đồng');
  assert.deepEqual(r.wardIdentities.map(w=>[w.code,w.parentCode]).sort(),[['90001','68'],['90002','703']]);
  assert.deepEqual(r.wards,['Xã Đức Trọng']);
  const wardCodes=new Set(r.wardIdentities.map(w=>w.code));
  for(const org of r.organizationOptions){
    assert.equal(org.kind,'organization');
    assert.ok(!Object.hasOwn(org,'code'));assert.ok(!Object.hasOwn(org,'parentCode'));
    assert.ok(!wardCodes.has(org.eGpCode));assert.ok(!r.wards.includes(org.name));
    assert.ok(!r.wardIdentities.some(w=>w.name===org.name));
  }
  assert.equal(h.calls.network.length,0);
});

test('415 AREA_OPTIONS and directory suggestions do not leak Lâm Đồng organizations into another province',async()=>{
  const h=await harness(),area=await h.send('AREA_OPTIONS',{province:'Tỉnh Đồng Nai'});
  assert.equal(area.ok,true,area.message);assert.deepEqual(area.wards,['Xã Long Thành']);
  assert.deepEqual(area.wardIdentities.map(w=>[w.code,w.parentCode]),[['90003','75']]);
  assert.ok(area.organizationOptions.every(e=>e.provinceName.replace(/^(?:Tỉnh|Thành phố) /,'')==='Đồng Nai'),JSON.stringify(area.organizationOptions.map(e=>[e.id,e.provinceName])));
  const suggestions=await h.send('INVESTOR_DIRECTORY',{province:'Tỉnh Đồng Nai',query:'ban 1 tỉnh lâm đồng'});
  assert.equal(suggestions.ok,true);assert.equal(suggestions.entries.length,0);
  assert.equal(h.calls.network.length,0);
});

test('415 website content scripts cannot request the organization directory or combined area options',async()=>{
  const h=await harness();
  for(const type of ['INVESTOR_DIRECTORY','AREA_OPTIONS']){
    const r=await h.send(type,{province:'Lâm Đồng',query:'ban 1'},true);
    assert.equal(r.ok,false);assert.match(r.message,/không được phép/);
    assert.equal(h.calls.queries.length,0);
  }
});

