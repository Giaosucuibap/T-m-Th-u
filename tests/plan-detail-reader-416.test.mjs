import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlanDetailReader,samePlanDetailUrl} from '../GiaoSuCuiBap/lib/plan-detail-reader.js';

const plan=n=>({key:`PL260000${n}::00`,planNo:`PL260000${n}`,version:'00',sourceId:`source-${n}`,
  detailUrl:`https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?type=es-plan-project-p&id=source-${n}&planNo=PL260000${n}`});
const receipt=p=>({url:p.detailUrl,status:200,header:{id:p.sourceId,planNo:p.planNo,planVersion:'00',bidPack:1},packages:[{id:`pack-${p.key}`,idPlan:p.sourceId,planNo:p.planNo,bidName:'Thi công',bidField:'XL',bidPrice:123}]});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(timeoutMs=100){
  let next=10,reader;const created=[],removed=[],updates=[];
  const tabs={async create(){const id=next++;created.push(id);return {id};},async remove(id){removed.push(id);},async update(id,args){updates.push({id,...args});}};
  reader=createPlanDetailReader({tabs,timeoutMs});return {reader,created,removed,updates};
}
test('416 plan detail URL must bind the exact plan and source id on the official HTTPS page',()=>{
  const p=plan(1);assert.equal(samePlanDetailUrl(p,p.detailUrl),true);
  for(const url of [p.detailUrl.replace('source-1','other'),p.detailUrl.replace('PL2600001','PL2600002'),p.detailUrl.replace('https:','http:'),p.detailUrl.replace('muasamcong.mpi.gov.vn','muasamcong.mpi.gov.vn.evil')])assert.equal(samePlanDetailUrl(p,url),false);
});
test('416 detail reader owns two tabs, accepts only bound receipts, publishes each success and closes only its own tabs',async()=>{
  const h=setup(),plans=[plan(1),plan(2),plan(3)],published=[];
  const run=h.reader.run('job',plans,async(p,result)=>{published.push({key:p.key,result});return {ok:true};});await tick();
  assert.equal(h.created.length,2);assert.equal(h.reader.ownsTab(999),false);
  for(let i=0;i<3;i++){
    const u=h.updates[i],p=plans.find(p=>p.detailUrl===u.url);
    assert.equal(h.reader.accept(receipt(p),999,p.detailUrl).ignored,true);
    assert.equal(h.reader.accept({...receipt(p),header:{...receipt(p).header,planVersion:'01'}},u.id,p.detailUrl).ignored,true);
    assert.equal(h.reader.accept(receipt(p),u.id,plan(99).detailUrl).ignored,true);
    assert.equal(h.reader.accept(receipt(p),u.id,p.detailUrl).ok,true);await tick();
  }
  const result=await run;assert.equal(result.readCount,3);assert.equal(result.failedCount,0);assert.equal(published.length,3);
  assert.deepEqual(h.removed.sort(),h.created.sort());assert.equal(h.reader.isRunning(),false);
});
test('416 valid detail cache avoids a second navigation; failed application is never cached',async()=>{
  const h=setup(),p=plan(1);let calls=0;
  async function complete(ok){const run=h.reader.run('job',[p],()=>{calls++;return {ok};});await tick();const u=h.updates.at(-1);h.reader.accept(receipt(p),u.id,p.detailUrl);return run;}
  assert.equal((await complete(false)).failedCount,1);assert.equal((await complete(true)).readCount,1);
  const navigations=h.updates.length;const again=await h.reader.run('job',[p],(_p,r)=>{assert.equal(r.fromCache,true);return {ok:true};});
  assert.equal(again.readCount,1);assert.equal(h.updates.length,navigations);assert.equal(calls,2);
});
test('416 cancellation settles blocked native waits immediately and late receipts cannot publish into a replacement job',async()=>{
  const h=setup(1000),p=plan(1);let applied=0;
  const run=h.reader.run('job',[p],()=>{applied++;});await tick();const u=h.updates[0];
  assert.equal(h.reader.cancel('other'),false);assert.equal(h.reader.cancel('job'),true);
  assert.equal((await run).cancelled,true);assert.equal(applied,0);
  assert.equal(h.reader.accept(receipt(p),u.id,p.detailUrl).ignored,true);
  assert.deepEqual(h.removed,h.created);
});
test('416 absent native response tries exactly twice, then publishes one bounded failure without certifying an empty plan',async()=>{
  const h=setup(15),start=Date.now(),published=[];
  const done=await h.reader.run('job',[plan(1)],(_p,r)=>{published.push(r);return {ok:false};});
  assert.ok(Date.now()-start<500);assert.equal(done.failedCount,1);assert.equal(done.readCount,0);
  assert.equal(h.updates.length,2);assert.equal(h.updates[0].id,h.updates[1].id);assert.equal(h.updates[0].url,h.updates[1].url);
  assert.equal(published.length,1);assert.equal(published[0].ok,false);assert.equal(published[0].retryable,true);
  assert.match(published[0].message,/30 giây/);assert.deepEqual(h.removed,h.created);
});
test('416 a timeout moves behind other queued plans, succeeds on one retry and publishes only the final receipt without mutating input',async()=>{
  const plans=Object.freeze([Object.freeze(plan(1)),Object.freeze(plan(2)),Object.freeze(plan(3))]);
  const before=structuredClone(plans),updates=[],removed=[],published=[];let next=10,reader;
  const tabs={async create(){return {id:next++};},async remove(id){removed.push(id);},async update(id,args){
    const p=plans.find(p=>p.detailUrl===args.url);updates.push({id,key:p.key});
    if(p!==plans[0]||updates.filter(u=>u.key===p.key).length===2)reader.accept(receipt(p),id,p.detailUrl);
  }};
  reader=createPlanDetailReader({tabs,timeoutMs:15});
  const done=await reader.run('job',plans,(p,r)=>{published.push({key:p.key,result:r});return {ok:true};});
  assert.deepEqual(updates.map(u=>u.key),[plans[0].key,plans[1].key,plans[2].key,plans[0].key]);
  assert.equal(done.readCount,3);assert.equal(done.failedCount,0);assert.equal(published.length,3);
  assert.equal(published.filter(p=>p.key===plans[0].key).length,1);assert.equal(published.every(p=>p.result.ok),true);
  assert.deepEqual(plans,before);assert.deepEqual(removed.sort(),[10,11]);
  const count=updates.length;const cached=await reader.run('second',[plans[0]],(_p,r)=>{assert.equal(r.fromCache,true);return {ok:true};});
  assert.equal(cached.readCount,1);assert.equal(updates.length,count);
});
test('416 cancellation after a first timeout prevents its queued retry and any final publication',async()=>{
  const plans=[plan(1),plan(2),plan(3)],updates=[],removed=[];let next=10,reader;
  const tabs={async create(){return {id:next++};},async remove(id){removed.push(id);},async update(id,args){
    updates.push({id,url:args.url});if(args.url===plans[2].detailUrl)reader.cancel('job');
  }};
  reader=createPlanDetailReader({tabs,timeoutMs:15});
  const done=await reader.run('job',plans,()=>assert.fail('a cancelled read must not publish'));
  assert.equal(done.cancelled,true);assert.equal(done.readCount,0);assert.equal(done.failedCount,0);
  assert.equal(updates.filter(u=>u.url===plans[0].detailUrl).length,1);
  assert.equal(updates.filter(u=>u.url===plans[1].detailUrl).length,1);assert.equal(updates.length,3);
  assert.deepEqual(removed.sort(),[10,11]);assert.equal(reader.isRunning(),false);
});
test('416 invalid detail URLs and navigation exceptions are final errors without automatic retries',async()=>{
  const h=setup(15),invalid={...plan(1),detailUrl:plan(99).detailUrl};let published=0;
  const done=await h.reader.run('invalid',[invalid],(_p,r)=>{published++;assert.equal(r.retryable,undefined);return {ok:false};});
  assert.equal(done.failedCount,1);assert.equal(h.updates.length,0);assert.equal(published,1);
  let updates=0;const reader=createPlanDetailReader({tabs:{async create(){return {id:42};},async remove(){},async update(){updates++;throw Error('navigation rejected');}},timeoutMs:15});
  const failed=await reader.run('navigation',[plan(1)],(_p,r)=>{assert.equal(r.retryable,undefined);assert.match(r.message,/navigation rejected/);return {ok:false};});
  assert.equal(failed.failedCount,1);assert.equal(updates,1);
});
test('416 a failed tab creation waits for a sibling creation to settle and closes the late owned tab',async()=>{
  let calls=0;const removed=[];
  const tabs={async create(){if(++calls===1)throw Error('create failed');await new Promise(r=>setTimeout(r,20));return {id:42};},async update(){throw Error('must not navigate after cancellation');},async remove(id){removed.push(id);}};
  const reader=createPlanDetailReader({tabs});
  const result=await reader.run('job',[plan(1),plan(2)],()=>assert.fail('no delivery'));
  assert.equal(result.ok,false);assert.deepEqual(removed,[42]);assert.equal(reader.isRunning(),false);
});
