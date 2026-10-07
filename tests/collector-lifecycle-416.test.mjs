import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../GiaoSuCuiBap/content.js',import.meta.url),'utf8');
function fn(name){
  const start=source.search(new RegExp(`  (?:async )?function ${name}\\(`));
  assert.ok(start>=0,name);
  const end=source.indexOf('\n  }',start);
  assert.ok(end>start,name);
  return source.slice(start,end+4);
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function sender(sendMessage,{plan={id:'job-416',queryIndex:0},cancelled=false,timeout=20}={}){
  const calls=[];
  const context=vm.createContext({kqPlan:plan,kqCancelled:cancelled,KQ_ACK_TIMEOUT:timeout,
    // Production deadline path uses actual asynchronous timers. Only the
    // retry backoff is shortened so this test need not wait 750 milliseconds.
    setTimeout:(callback,ms)=>setTimeout(callback,ms>=250?1:ms),clearTimeout,
    chrome:{runtime:{sendMessage:message=>{calls.push(structuredClone(message));return sendMessage(message,calls.length);}}}});
  vm.runInContext(fn('kqSend'),context);
  return {context,calls,send:(type,payload,options)=>context.kqSend(type,payload,options)};
}
const payload={planId:'job-416',queryIndex:0,mode:'khlcnt',pageIndex:1,done:true,records:[],totalElements:1,totalPages:1};

test('a worker that never replies reaches the actual deadline and cannot report successful delivery',async()=>{
  const h=sender(()=>new Promise(()=>{}));
  const started=performance.now();
  const result=await h.send('KQLCNT_RESULTS',payload,{requireAck:true,attempts:1});
  assert.equal(result.ok,false);
  assert.match(result.message,/Hết thời gian chờ/);
  assert.equal(h.calls.length,1);
  assert.ok(performance.now()-started<500,'unresponsive message must settle, not leave the port wait hanging');
});

test('all three production retry attempts remain bounded when no worker message ever settles',async()=>{
  const h=sender(()=>new Promise(()=>{}));
  const started=performance.now(),result=await h.send('KQLCNT_RESULTS',payload,{requireAck:true,attempts:3});
  assert.equal(result.ok,false);assert.equal(h.calls.length,3);
  assert.match(result.message,/Hết thời gian chờ/);assert.ok(performance.now()-started<500);
  assert.deepEqual(h.calls[0],h.calls[2]);
});

test('terminal acknowledgement retries retain the identical job, query and final-page identity',async()=>{
  const h=sender((_,attempt)=>Promise.resolve(attempt===1?{ok:false,message:'Chưa ghi được receipt'}:{ok:true,duplicate:true}));
  const result=await h.send('KQLCNT_RESULTS',payload,{requireAck:true,attempts:3});
  assert.equal(result.ok,true);assert.equal(result.duplicate,true);assert.equal(h.calls.length,2);
  assert.deepEqual(h.calls[0],h.calls[1]);
});

test('an uncertain timeout is retried but its late reply cannot replace the acknowledged retry',async()=>{
  let firstReply;
  const h=sender((_,attempt)=>attempt===1?new Promise(resolve=>{firstReply=resolve;}):Promise.resolve({ok:true,duplicate:true}));
  const result=await h.send('KQLCNT_RESULTS',payload,{requireAck:true,attempts:3});
  assert.equal(result.ok,true);assert.equal(h.calls.length,2);assert.deepEqual(h.calls[0],h.calls[1]);
  firstReply({ok:false,message:'Late failure from the first port'});
  await pause(5);assert.equal(result.ok,true);assert.equal(h.calls.length,2);
});

test('cancellation stops retransmitting an unacknowledged data page while allowing its terminal cancellation receipt',async()=>{
  const plan={id:'job-416',queryIndex:0};
  const h=sender(()=>new Promise(()=>{}),{plan});
  const waiting=h.send('KQLCNT_RESULTS',{...payload,done:false,records:[{planNo:'PL2600000001'}]},{requireAck:true,attempts:3});
  await pause(2);h.context.kqCancelled=true;
  const result=await waiting;
  assert.equal(result.ok,false);assert.equal(result.cancelled,true);assert.equal(h.calls.length,1);
  let terminalAttempts=0;
  h.context.chrome.runtime.sendMessage=()=>Promise.resolve(++terminalAttempts===1?{ok:false}:{ok:true});
  const terminal=await h.send('KQLCNT_RESULTS',{...payload,cancelled:true},{requireAck:true,attempts:3});
  assert.equal(terminal.ok,true);assert.equal(terminalAttempts,2);
});

test('a new query of the same job prevents an older pending delivery from being sent again',async()=>{
  const h=sender(()=>new Promise(()=>{}),{plan:{id:'job-416',queryIndex:0}});
  const waiting=h.send('KQLCNT_RESULTS',payload,{requireAck:true,attempts:3});
  await pause(2);h.context.kqPlan={id:'job-416',queryIndex:1};
  const result=await waiting;
  assert.equal(result.ok,false);assert.equal(result.cancelled,true);assert.equal(h.calls.length,1);
});

test('an already stale page identity is rejected before opening any worker message port',async()=>{
  const h=sender(()=>assert.fail('a stale page must not be dispatched'),{plan:{id:'job-416',queryIndex:1}});
  const result=await h.send('KQLCNT_RESULTS',payload,{requireAck:true,attempts:3});
  assert.equal(result.ok,false);assert.equal(result.cancelled,true);assert.equal(h.calls.length,0);
});

function pageWaitHarness(){
  const timers=[],cleared=[];
  const context=vm.createContext({kqPlan:{id:'first-job'},kqPageWaiter:null,KQ_RESPONSE_TIMEOUT:25000,
    setTimeout:callback=>(timers.push(callback),timers.length),clearTimeout:id=>cleared.push(id)});
  for(const name of ['kqAwaitPage','kqSameQuery'])vm.runInContext(fn(name),context);
  return {context,timers,cleared};
}

test('an older waiter or already-queued timeout cannot erase the waiter of a later query',async()=>{
  const h=pageWaitHarness(),first=h.context.kqAwaitPage(),oldWaiter=h.context.kqPageWaiter;
  h.context.kqPlan={id:'second-job'};
  const second=h.context.kqAwaitPage(),newWaiter=h.context.kqPageWaiter;
  assert.equal(await first,null);
  h.timers[0]();oldWaiter({ok:true,data:'old response'});
  assert.equal(h.context.kqPageWaiter,newWaiter);
  newWaiter({ok:true,data:'new response'});
  assert.equal((await second).data,'new response');assert.equal(h.context.kqPageWaiter,null);
  assert.ok(h.cleared.includes(1));assert.ok(h.cleared.includes(2));
});

function addListener(h){
  const start=source.lastIndexOf('  chrome.runtime.onMessage.addListener(');
  const end=source.indexOf('\n  });',start);
  assert.ok(start>=0&&end>start);
  const messages=[],starts=[];
  h.context.chrome={runtime:{onMessage:{addListener:callback=>{h.handler=callback;}}}};
  h.context.kqReport=message=>messages.push(message);
  h.context.kqCancelled=false;
  h.context.kqStart=plan=>starts.push(plan);
  vm.runInContext(source.slice(start,end+7),h.context);
  return {messages,starts};
}

test('only the matching cancel command releases the native waiter, without waiting for e-GP',async()=>{
  const h=pageWaitHarness();addListener(h);
  const waiting=h.context.kqAwaitPage(),responses=[];
  h.handler({type:'KQLCNT_CANCEL',payload:{planId:'other-job'}},{},r=>responses.push(r));
  assert.equal(h.context.kqCancelled,false);assert.equal(responses[0].ignored,true);assert.ok(h.context.kqPageWaiter);
  h.handler({type:'KQLCNT_CANCEL',payload:{planId:'first-job'}},{},r=>responses.push(r));
  const result=await waiting;
  assert.equal(result.cancelled,true);assert.equal(h.context.kqCancelled,true);assert.equal(h.context.kqPageWaiter,null);
  h.context.kqPlan={id:'next-job'};
  const next=h.context.kqAwaitPage(),waiter=h.context.kqPageWaiter;
  h.timers[0]();assert.equal(h.context.kqPageWaiter,waiter);
  waiter({ok:true});assert.equal((await next).ok,true);
});

test('a duplicate start does not launch a second harvester or replace an active query',()=>{
  const h=pageWaitHarness(),{starts}=addListener(h),responses=[];
  h.handler({type:'KQLCNT_START',payload:{id:'first-job',queryIndex:0}},{},r=>responses.push(r));
  assert.equal(responses[0].ok,true);assert.equal(responses[0].duplicate,true);assert.equal(starts.length,0);
  h.handler({type:'KQLCNT_START',payload:{id:'first-job',queryIndex:1}},{},r=>responses.push(r));
  assert.equal(responses[1].ok,false);assert.equal(responses[1].busy,true);assert.equal(starts.length,0);
});

test('a pending first native response cannot finish a replacement job',async()=>{
  const start=source.indexOf('  async function kqRunHarvest(){'),end=source.indexOf('  function kqFinish(',start);
  let release;const finishes=[],plan={id:'old',mode:'khlcnt',label:'old'};
  const context=vm.createContext({kqPlan:plan,kqCancelled:false,kqSendPlanToHook:async()=>true,kqReport:()=>{},
    kqTriggerFirstPage:()=>new Promise(resolve=>{release=resolve;}),kqFinish:(...args)=>finishes.push(args)});
  const waiting=vm.runInContext(source.slice(start,end)+'\nkqRunHarvest()',context);
  await pause(0);const next={id:'new'};context.kqPlan=next;
  release({ok:false,status:0});await waiting;
  assert.equal(finishes.length,0);assert.equal(context.kqPlan,next);
});
