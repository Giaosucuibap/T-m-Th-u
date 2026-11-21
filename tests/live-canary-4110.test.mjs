import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {webcrypto} from 'node:crypto';
import {CANARY_ALARM,CANARY_DEFAULT,CANARY_SOURCE_FILES,canaryConfig,offPeak,nextCanaryTime,canaryQuery,checkCanaryRecord,canarySourceDigest,createLiveCanaryRuntime} from '../GiaoSuCuiBap/lib/live-canary.js';

const registry=JSON.parse(fs.readFileSync(new URL('../GiaoSuCuiBap/data/live-canary-cases.json',import.meta.url),'utf8'));
const digest='a'.repeat(64), fixed=Date.parse('2026-09-13T19:00:00Z');
const row={contractorCode:'vn0123456789',contractorName:'Nhà thầu đối chứng',lotPrice:100000000,lotFinalPrice:95000000,discountPercent:5};
function raw(item){return item.type==='PL'?{planNo:item.id,planVersion:'00',name:'Kế hoạch đối chứng',investField:['XL'],decisionDate:'2026-09-01T10:00:00'}:{notifyNo:item.id,notifyVersion:'00',bidName:['Gói đối chứng'],investField:[item.expectedField||'XL'],bidPrice:[200000000],numBidderJoin:1};}
function result(item){return{status:'OK',complete:true,records:[raw(item)],totalElements:1,totalPages:1};}
function harness(options={}){
  let state={settings:{},canaryConfig:{...CANARY_DEFAULT},liveCanary:{status:'UNKNOWN',cases:[]},...structuredClone(options.state||{})};
  const saved=[],probes=[],openingCalls=[],alarmCalls=[];let stops=0,clock=options.time??fixed;
  const runtime=createLiveCanaryRuntime({
    getState:async()=>state,save:async update=>{saved.push(structuredClone(update));state={...state,...structuredClone(update)};},
    runProbe:async(query,scope)=>{probes.push({query,scope});const item=registry.cases.find(c=>c.id===query.keyWord);return options.runProbe?options.runProbe(query,scope,probes.length,item):result(item);},
    readOpening:async(pkg,scope)=>{openingCalls.push({pkg,scope});return options.readOpening?options.readOpening(pkg,scope):{status:'OK',rows:[{...row}]};},
    fetchProvinces:options.fetchProvinces||(async()=>[{code:'703',name:'Tỉnh Lâm Đồng'}]),
    stopScans:async()=>{stops++;},alarms:{create:async(name,value)=>alarmCalls.push({action:'create',name,...value}),clear:async name=>alarmCalls.push({action:'clear',name})},
    loadCases:options.loadCases||(async()=>structuredClone(registry)),sourceDigest:options.sourceDigest||(async()=>digest),now:()=>clock,version:'4.11.0'
  });
  return{runtime,saved,probes,openingCalls,alarmCalls,get state(){return state;},get stops(){return stops;},setState(value){state={...state,...value};},setTime(value){clock=value;}};
}
async function idle(runtime){for(let n=0;n<1000&&runtime.isRunning();n++)await new Promise(setImmediate);assert.equal(runtime.isRunning(),false,'Fixture canary should finish without network waits');}

test('411 canary registry contains 25 unique type-compatible witnessed IDs and the official 703 reference',()=>{
  assert.equal(registry.cases.length,25);assert.equal(new Set(registry.cases.map(c=>c.id)).size,25);
  for(const item of registry.cases){assert.match(item.id,item.type==='PL'?/^PL\d{10}$/:/^IB\d{10}$/);assert.ok(item.source);assert.ok(Number.isFinite(Date.parse(item.observedAt)));}
  assert.equal(registry.province.code,'703');assert.equal(registry.province.name,'Lâm Đồng');
});
test('411 weekly alarm stays Monday 02:00 Vietnam in every host timezone and handles exact-time boundaries',()=>{
  const module=new URL('../GiaoSuCuiBap/lib/live-canary.js',import.meta.url).href;
  const code=`import{nextCanaryTime,offPeak}from${JSON.stringify(module)};console.log(JSON.stringify([nextCanaryTime(Date.parse('2026-09-13T18:59:59Z')),nextCanaryTime(Date.parse('2026-09-13T19:00:00Z')),offPeak(Date.parse('2026-09-13T21:59:59Z')),offPeak(Date.parse('2026-09-13T22:00:00Z'))]));`;
  for(const TZ of ['UTC','Asia/Ho_Chi_Minh','America/Los_Angeles','Pacific/Auckland']){
    const p=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',windowsHide:true,env:{...process.env,TZ}});assert.equal(p.status,0,p.stderr);
    assert.deepEqual(JSON.parse(p.stdout),[Date.parse('2026-09-13T19:00:00Z'),Date.parse('2026-09-20T19:00:00Z'),true,false],TZ);
  }
  assert.equal(canaryConfig({weekday:99,hour:20,timezone:'UTC'}).timezone,'Asia/Ho_Chi_Minh');assert.equal(canaryConfig({hour:20}).hour,2);
});
test('411 exact code probes contain one correct identity field and never overwrite registry entries',()=>{
  for(const item of registry.cases){const before=JSON.stringify(item),query=canaryQuery(item);assert.equal(query.keyWord,item.id);assert.equal(query.matchType,'exact');assert.deepEqual(query.matchFields,[item.type==='PL'?'planNo':'notifyNo']);assert.equal(query.filters[0].fieldValues[0],item.type==='PL'?'es-plan-project-p':'es-notify-contractor');assert.equal(JSON.stringify(item),before);}
});
test('411 canary only marks a complete successful native response GREEN',()=>{
  const item=registry.cases[0],valid=result(item);assert.equal(checkCanaryRecord(item,valid).status,'GREEN');
  for(const status of ['BUSY','TIMEOUT','CANCELLED','ERROR']){
    assert.equal(checkCanaryRecord(item,{...valid,status,complete:false}).status,'UNKNOWN',status);
    assert.equal(checkCanaryRecord(item,{...valid,status,complete:true}).status,'UNKNOWN',status+' cannot contradict failed transport');
  }
  assert.equal(checkCanaryRecord(item,{status:'SCHEMA_ERROR',complete:false}).status,'RED');
  assert.equal(checkCanaryRecord(item,{...valid,records:[]}).status,'RED');
});
test('411 canary rejects missing placeholders and malformed field/date/price values rather than inventing source data',()=>{
  const notice=registry.cases[0],plan=registry.cases.find(c=>c.type==='PL');
  for(const bidPrice of ['',null,[],[''],[null],['null'],'undefined',Infinity,-1])assert.equal(checkCanaryRecord(notice,{...result(notice),records:[{...raw(notice),bidPrice}]}).status,'RED',JSON.stringify(bidPrice));
  for(const investField of ['',null,[],[''],'undefined','FUTURE_CODE'])assert.equal(checkCanaryRecord(plan,{...result(plan),records:[{...raw(plan),investField}]}).status,'RED',JSON.stringify(investField));
  for(const decisionDate of ['null','undefined','not-a-date','2026-02-31'])assert.equal(checkCanaryRecord(plan,{...result(plan),records:[{...raw(plan),decisionDate}]}).status,'RED',decisionDate);
  assert.equal(checkCanaryRecord(notice,{...result(notice),records:[{...raw(notice),bidField:notice.expectedField,investField:'TV'}]}).status,'RED');
});
test('411 canary evaluates the latest source version instead of hiding a regression behind an older record',()=>{
  const item=registry.cases[0];const older={...raw(item),notifyVersion:'00'},newer={...raw(item),notifyVersion:'01',investField:''};
  assert.equal(checkCanaryRecord(item,{status:'OK',complete:true,records:[older,newer]}).status,'RED');
});
test('411 successful runtime requires all 25 probes, BBMT tables and direct 703 evidence',async()=>{
  const h=harness();const r=await h.runtime.run({wait:true});assert.equal(r.ok,true);assert.equal(r.liveCanary.status,'GREEN');assert.equal(r.liveCanary.cases.length,25);assert.equal(h.probes.length,25);assert.equal(h.openingCalls.length,5);assert.equal(h.stops,0);
  assert.equal(r.liveCanary.version,'4.11.0');assert.equal(r.liveCanary.live,true);assert.equal(r.liveCanary.sourceDigest,digest);assert.equal(r.liveCanary.provinceCheck.name,'Tỉnh Lâm Đồng');assert.equal(h.state.liveCanary.lastStructuralStatus,'GREEN');
  assert.equal(h.alarmCalls.at(-1).when,Date.parse('2026-09-20T19:00:00Z'));
});
test('411 RED latches immediately, survives incomplete reruns, and clears only after a full successful recovery',async()=>{
  let mode='bad';const h=harness({runProbe:async(q,s,n,item)=>mode==='bad'&&q.keyWord===registry.cases[0].id?{status:'SCHEMA_ERROR',complete:false}:mode==='unknown'?{status:'TIMEOUT',complete:false}:result(item)});
  assert.equal((await h.runtime.run({wait:true})).liveCanary.status,'RED');assert.ok(h.stops>0);assert.equal(h.state.liveCanary.lastStructuralStatus,'RED');
  mode='unknown';assert.equal((await h.runtime.run({wait:true})).liveCanary.status,'UNKNOWN');assert.equal(h.state.liveCanary.lastStructuralStatus,'RED');
  mode='good';assert.equal((await h.runtime.run({wait:true})).liveCanary.status,'GREEN');assert.equal(h.state.liveCanary.lastStructuralStatus,'GREEN');
});
test('411 setup failures preserve a legacy RED latch even before RUNNING evidence can be saved',async()=>{
  for(const failedDependency of ['loadCases','sourceDigest']){
    const h=harness({state:{liveCanary:{status:'RED',cases:[]}},[failedDependency]:async()=>{throw Error('Fixture unavailable');}});
    assert.equal((await h.runtime.run({wait:true})).liveCanary.status,'UNKNOWN');assert.equal(h.state.liveCanary.lastStructuralStatus,'RED',failedDependency);assert.equal(h.probes.length,0);
  }
});
test('411 province fetch unavailability is UNKNOWN while a changed 703 identity is RED',async()=>{
  const missing=harness({fetchProvinces:async()=>{throw Error('offline');}});assert.equal((await missing.runtime.run({wait:true})).liveCanary.status,'UNKNOWN');assert.equal(missing.stops,0);
  const wrong=harness({fetchProvinces:async()=>[{code:'703',name:'Tỉnh Đồng Nai'}]});assert.equal((await wrong.runtime.run({wait:true})).liveCanary.status,'RED');assert.ok(wrong.stops>0);
});
test('411 BBMT source rows cannot become GREEN through placeholder names or normalization dropping malformed rows',async()=>{
  for(const rows of [[{...row,contractorName:''}],[{...row},{lotPrice:50,lotFinalPrice:40}],[{...row,lotPrice:null}],[{...row,lotFinalPrice:null,discountPercent:null}]]){
    const h=harness({readOpening:async()=>({status:'OK',rows})});assert.equal((await h.runtime.run({wait:true})).liveCanary.status,'RED',JSON.stringify(rows));
  }
  for(const opening of [{status:'TIMEOUT'},{status:'EMPTY',rows:[]},{status:'OK',rows:[row],incomplete:true},{status:'OK',rows:[row],comparisonPending:true}]){const h=harness({readOpening:async()=>opening});assert.equal((await h.runtime.run({wait:true})).liveCanary.status,'UNKNOWN');}
});
test('411 unavailable or busy probe stops the run promptly without fabricating remaining successful cases',async()=>{
  for(const status of ['BUSY','TIMEOUT']){const h=harness({runProbe:async()=>({status,complete:false})});const r=await h.runtime.run({wait:true});assert.equal(r.liveCanary.status,'UNKNOWN');assert.ok(h.probes.length>=1&&h.probes.length<=3,status+' must stop after a bounded number of unavailable probes');assert.equal(r.liveCanary.cases.filter(c=>!c.skipped).length,h.probes.length);assert.ok(r.liveCanary.cases.every(c=>c.status==='UNKNOWN'));}
});
test('411 invalid registry type identities are rejected before any native probe',async()=>{
  for(const changes of [{type:'PL',id:'IB2600000001'},{type:'BBMT',id:'PL2600000001'}]){
    const bad=structuredClone(registry);bad.cases[0]={...bad.cases[0],...changes};const h=harness({loadCases:async()=>bad});assert.equal((await h.runtime.run({wait:true})).liveCanary.status,'UNKNOWN');assert.equal(h.probes.length,0);
  }
});
test('411 read-only mode blocks manual, scheduled and configuration changes before probes',async()=>{
  const h=harness({state:{settings:{readOnlyMode:true}}});assert.equal((await h.runtime.run({wait:true})).ok,false);assert.equal((await h.runtime.configure({enabled:false})).ok,false);await h.runtime.onAlarm({name:CANARY_ALARM});await h.runtime.hydrate();assert.equal(h.probes.length,0);assert.equal(h.saved.length,0);assert.ok(h.alarmCalls.every(c=>c.action==='clear'));
});
test('411 enabling read-only mode during a run prevents subsequent probes',async()=>{
  let h;h=harness({runProbe:async(q,s,n,item)=>{h.setState({settings:{readOnlyMode:true}});return result(item);}});const r=await h.runtime.run({wait:true});assert.equal(h.probes.length,1);assert.notEqual(r.liveCanary.status,'GREEN');
});
test('411 simultaneous manual triggers run one probe sequence and reject the duplicate request',async()=>{
  const h=harness();const results=await Promise.all([h.runtime.run({wait:true}),h.runtime.run({wait:true})]);
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(h.probes.length,25);assert.equal(h.openingCalls.length,5);
});
test('411 a missed daytime alarm is rescheduled off-peak; an off-peak Chrome restart catches up once',async()=>{
  const due='2026-09-13T19:00:00Z';const daytime=harness({time:Date.parse('2026-09-14T06:00:00Z'),state:{liveCanary:{status:'UNKNOWN',nextRunAt:due,cases:[]}}});await daytime.runtime.hydrate();assert.equal(daytime.probes.length,0);assert.equal(daytime.alarmCalls.at(-1).when,Date.parse('2026-09-14T19:00:00Z'));
  const overnight=harness({time:Date.parse('2026-09-13T20:00:00Z'),state:{liveCanary:{status:'RUNNING',lastStructuralStatus:'RED',nextRunAt:due,cases:[]}}});await overnight.runtime.hydrate();await idle(overnight.runtime);assert.equal(overnight.probes.length,25);assert.equal(overnight.state.liveCanary.trigger,'catch-up');assert.ok(overnight.saved.some(s=>s.liveCanary?.status==='UNKNOWN'&&s.liveCanary.lastStructuralStatus==='RED'));
});
test('411 saved success from a prior extension version or source digest is never presented as current GREEN',async()=>{
  for(const stale of [{version:'4.10.1',sourceDigest:digest},{version:'4.11.0',sourceDigest:'b'.repeat(64)}]){
    const h=harness({state:{liveCanary:{status:'GREEN',lastStructuralStatus:'GREEN',live:true,checkedAt:new Date(fixed).toISOString(),cases:registry.cases.map(c=>({...c,status:'GREEN'})),...stale}}});
    assert.notEqual((await h.runtime.status()).liveCanary.status,'GREEN',JSON.stringify(stale));
  }
});
test('411 current GREEN requires a live complete registry-matched receipt with no skipped cases and verified 703',async()=>{
  const good=harness();await good.runtime.run({wait:true});const evidence=structuredClone(good.state.liveCanary);
  assert.equal((await good.runtime.status()).liveCanary.status,'GREEN');
  const mutations=[
    e=>{e.live=false;}, e=>{delete e.live;}, e=>{e.cases=[];}, e=>{e.cases.pop();},
    e=>{e.cases[0].skipped=true;}, e=>{e.cases[0].status='UNKNOWN';}, e=>{e.cases[0].status='RED';},
    e=>{e.cases[0].id='IB2699999999';}, e=>{e.cases[0].id=e.cases[1].id;}, e=>{e.cases[0].type='PL';},
    e=>{delete e.provinceCheck;}, e=>{e.provinceCheck.status='UNKNOWN';},
    e=>{e.provinceCheck.code='68';}, e=>{e.provinceCheck.name='Tỉnh Đồng Nai';}
  ];
  for(const mutate of mutations){const receipt=structuredClone(evidence);mutate(receipt);const h=harness({state:{liveCanary:receipt}});assert.notEqual((await h.runtime.status()).liveCanary.status,'GREEN',mutate.toString());}
});
test('411 source digest changes when any gated implementation file changes and fails on missing input',async()=>{
  const bytes=new Map(CANARY_SOURCE_FILES.map(file=>[file,new TextEncoder().encode(file)]));const read=async file=>bytes.get(file);
  const before=await canarySourceDigest(read,webcrypto);assert.match(before,/^[a-f0-9]{64}$/);bytes.set('lib/hard-filter.js',new TextEncoder().encode('changed gate'));assert.notEqual(await canarySourceDigest(read,webcrypto),before);
  await assert.rejects(canarySourceDigest(async()=>{throw Error('missing source');},webcrypto));
});
