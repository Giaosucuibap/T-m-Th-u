import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const content=fs.readFileSync(new URL('../GiaoSuCuiBap/content.js',import.meta.url),'utf8');
const start=content.indexOf('  async function kqRunHarvest(){');
const end=content.indexOf('  function kqFinish(',start);
assert.ok(start>0&&end>start);
// Hàm thuần xác định lỗi THOÁNG QUA — nạp thật từ content.js, không chép lại.
const tStart=content.indexOf('  function kqTransientFailure(page){'),tEnd=content.indexOf('  async function kqReReadPage(',tStart);
assert.ok(tStart>0&&tEnd>tStart,'không tìm thấy kqTransientFailure');
const transientSrc=content.slice(tStart,tEnd);
const records=(page,n=2)=>Array.from({length:n},(_,i)=>({notifyNo:`IB260000${page}${i}`,bidName:`Gói ${page}-${i}`}));
const page=(i,{totalPages=3,totalElements=6,rows=records(i)}={})=>({ok:true,data:{page:{content:rows,totalPages,totalElements}}});
async function harvest(pages,{maxPages=0,failDelivery=false,failFinal=false,cancel=false,queryIndex=0,recovered=[]}={}){
 const sent=[],queue=structuredClone(pages),reread=structuredClone(recovered);let terminal,rereads=0;
 const context=vm.createContext({kqPlan:{id:'collector-test',queryIndex,mode:'tbmt',label:'fixture',maxPages},kqCancelled:false,KQ_PAGE_PAUSE:0,
  kqSendPlanToHook:async()=>true,kqReport:()=>{},kqTriggerFirstPage:async()=>queue.shift(),
  kqGoNextPage:async()=>queue.shift(),setTimeout:fn=>{if(cancel)context.kqCancelled=true;fn();},
  kqSend:async(type,payload)=>{sent.push({type,payload:structuredClone(payload)});return {ok:payload.done?!failFinal:!failDelivery};},
  // Đọc lại trang lỗi thoáng qua: trả trang trong `recovered` nếu có, nếu
  // không thì lỗi vẫn còn nguyên (mạng hỏng hẳn).
  kqRecoverTransient:async(p)=>{rereads++;return reread.length?reread.shift():p;},
  kqFinish:(ok,message)=>{terminal={ok,message};}});
 await vm.runInContext(transientSrc+content.slice(start,end)+'\nkqRunHarvest()',context);
 return {terminal,sent,rereads,final:sent.findLast(p=>p.payload.done)?.payload,rows:sent.filter(p=>!p.payload.done).flatMap(p=>p.payload.records),remaining:queue.length};
}

test('collector verifies all three real pages and six delivered records',async()=>{
 const r=await harvest([page(0),page(1),page(2)]);
 assert.equal(r.terminal.ok,true);assert.equal(r.final.partial,false);assert.equal(r.final.pageIndex,3);assert.equal(r.rows.length,6);
});
for(const [name,bad] of [
 ['empty middle',page(1,{rows:[]})],['missing content',{ok:true,data:{page:{totalPages:3,totalElements:6}}}],
 ['unrelated schema',{ok:true,data:{unrelated:true}}],['invalid row',page(1,{rows:[null]})],
 ['network failure',{ok:false,status:0}],['timeout',null],['repeated page',page(0)]
])test(`collector retains first page and reports incomplete on ${name}`,async()=>{
 const r=await harvest([page(0),bad,page(2)]);
 assert.equal(r.terminal.ok,false);assert.equal(r.final.partial,true);assert.equal(r.final.pageIndex,1);
 assert.equal(r.rows.length,2);assert.equal(r.remaining,1);
});
for(const [name,bad] of [['network failure',{ok:false,status:0}],['timeout',null],['e-GP 503',{ok:false,status:503}]])
test(`a ${name} on a middle page is RE-READ, and a successful re-read completes the run`,async()=>{
 /* Một cú chập mạng không được làm hỏng cả lượt. Chạy trên máy chủ giả lập với
    25% kết nối bị cắt: trước khi có bước đọc lại, 1/8 lượt dừng ở "chưa đầy đủ"
    vì đúng một trang giữa bị rớt. */
 const r=await harvest([page(0),bad,page(2)],{recovered:[page(1)]});
 assert.equal(r.rereads,1,'không đọc lại trang lỗi');
 assert.equal(r.terminal.ok,true);assert.equal(r.final.partial,false);assert.equal(r.final.pageIndex,3);assert.equal(r.rows.length,6);
});
test('schema problems and 4xx are NOT re-read — re-reading cannot fix them',async()=>{
 for(const bad of [{ok:false,status:403},{ok:false,status:0,schemaIssue:true},{ok:false,status:0,cancelled:true}]){
  const r=await harvest([page(0),bad,page(2)],{recovered:[page(1)]});
  assert.equal(r.rereads,0,JSON.stringify(bad));assert.equal(r.final.partial,true);
 }
});
test('explicit zero results is complete, not a schema failure',async()=>{
 for(const totalPages of [0,1]){
  const r=await harvest([page(0,{rows:[],totalPages,totalElements:0})]);
  assert.equal(r.terminal.ok,true);assert.equal(r.final.partial,false);assert.equal(r.final.totalElements,0);
 }
});
test('missing or malformed totals retain valid records but never certify completeness',async()=>{
 for(const totalPages of [null,undefined,-1,1.5,'unknown']){
  const sample=page(0,{totalElements:2});sample.data.page.totalPages=totalPages;
  const r=await harvest([sample]);
  assert.equal(r.rows.length,2);assert.equal(r.final.partial,true);assert.equal(r.final.schemaIssue,true);
  assert.equal(r.terminal.ok,false);
 }
});
test('short final page cannot conceal a missing source record',async()=>{
 const r=await harvest([page(0),page(1),page(2,{rows:records(2,1)})]);
 assert.equal(r.final.partial,true);assert.equal(r.rows.length,5);assert.equal(r.terminal.ok,false);
});
test('changing source total preserves received rows and requires a fresh reconciliation',async()=>{
 const r=await harvest([page(0),page(1,{totalElements:7}),page(2)]);
 assert.equal(r.final.partial,true);assert.equal(r.final.schemaIssue,true);assert.equal(r.rows.length,4);
});
test('intentional one-page limit is capped and accurately counted',async()=>{
 const r=await harvest([page(0),page(1)],{maxPages:1});
 assert.equal(r.final.capped,true);assert.equal(r.final.pageIndex,1);assert.equal(r.rows.length,2);
 assert.equal(r.final.partial,false); // cap is an independent explicit incompleteness flag
});
test('failed storage acknowledgement never advances the received-page count',async()=>{
 const r=await harvest([page(0)],{failDelivery:true});
 assert.equal(r.final.partial,true);assert.equal(r.final.pageIndex,0);assert.equal(r.terminal.ok,false);
});
test('failed terminal acknowledgement cannot report success',async()=>{
 const r=await harvest([page(0,{totalPages:1,totalElements:2})],{failFinal:true});
 assert.equal(r.terminal.ok,false);
});
test('user cancellation preserves the accepted first page',async()=>{
 const r=await harvest([page(0),page(1)],{cancel:true});
 assert.equal(r.final.cancelled,true);assert.equal(r.final.pageIndex,1);assert.equal(r.rows.length,2);
});

const hook=fs.readFileSync(new URL('../GiaoSuCuiBap/page-hook.js',import.meta.url),'utf8');
function hookHarness({rejectFetch=false,invalidJson=false,waitFetch=null}={}){
 const messages=[],listeners=[];
 class XHR{
  constructor(){this.events=new Map();this.status=0;}
  open(){}setRequestHeader(){}send(){}
  addEventListener(t,fn){if(!this.events.has(t))this.events.set(t,new Set());this.events.get(t).add(fn);}
  removeEventListener(t,fn){this.events.get(t)?.delete(fn);}
  fire(t){for(const fn of [...(this.events.get(t)||[])])fn();}
 }
 const response={status:200,ok:true,url:'https://muasamcong.mpi.gov.vn/o/egp-portal-contractor-selection-v2/services/smart/search',
  headers:{get:()=> 'application/json'},json:async()=>{if(invalidJson)throw Error('Invalid JSON');return {};}};
 response.clone=()=>response;
 const window={postMessage:m=>messages.push(m),addEventListener:(t,fn)=>{if(t==='message')listeners.push(fn);},
  fetch:async()=>{if(waitFetch)await waitFetch();if(rejectFetch)throw Error('fixture reset');return response;}};
 const location={href:'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection',origin:'https://muasamcong.mpi.gov.vn'};
 vm.runInNewContext(hook,{window,location,XMLHttpRequest:XHR,URL,URLSearchParams,Headers,Request,console});
 const plan={id:'collector-test',pageSize:50,query:{index:'es-contractor-selection',filters:[
  {fieldName:'type',searchType:'in',fieldValues:['es-notify-contractor']},
  {fieldName:'stepCode',searchType:'in',fieldValues:['notify-contractor-step-1-tbmt']} ]}};
 const post=payload=>listeners.forEach(fn=>fn({source:window,data:{source:'BID_RADAR_ONE_CONTENT',type:'KQLCNT_PLAN',payload}}));
 post(plan);
 return {window,XHR,post,plan,url:response.url,body:JSON.stringify([{pageNumber:0,pageSize:50,query:[]}]),
  pages:()=>messages.filter(m=>m.type==='KQLCNT_PAGE').map(m=>m.payload)};
}
test('fetch connection reset is reported immediately to the pending collector',async()=>{
 const h=hookHarness({rejectFetch:true});
 await assert.rejects(h.window.fetch(h.url,{method:'POST',body:h.body}),/fixture reset/);
 assert.equal(h.pages().length,1);assert.equal(h.pages()[0].ok,false);assert.equal(h.pages()[0].status,0);
});
test('unreadable JSON is reported without silently waiting for a timeout',async()=>{
 const h=hookHarness({invalidJson:true});await h.window.fetch(h.url,{method:'POST',body:h.body});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.pages().length,1);assert.equal(h.pages()[0].schemaIssue,true);
});
for(const event of ['error','timeout','abort'])test(`XHR ${event} reaches collector and reused XHR does not retain the old job`,()=>{
 const h=hookHarness(),xhr=new h.XHR();xhr.open('POST',h.url);xhr.send(h.body);xhr.fire(event);
 assert.equal(h.pages().length,1);assert.equal(h.pages()[0].ok,false);
 h.post(null);xhr.open('POST',h.url);xhr.send(h.body);xhr.fire(event);
 assert.equal(h.pages().length,1);
});

test('every collector delivery keeps the current query identity, including the final page',async()=>{
 const r=await harvest([page(0,{totalPages:1,totalElements:2})],{queryIndex:3});
 assert.ok(r.sent.length>=2);assert.ok(r.sent.every(x=>x.payload.queryIndex===3));
});

test('a late response keeps its original query and cannot satisfy the next query waiter',async()=>{
 let release,started;const begun=new Promise(r=>started=r),pending=new Promise(r=>release=r);
 const h=hookHarness({waitFetch:()=>{started();return pending;}});
 h.post({...h.plan,queryIndex:0});const fetching=h.window.fetch(h.url,{method:'POST',body:h.body});
 await begun;h.post({...h.plan,queryIndex:1});release();await fetching;await new Promise(r=>setImmediate(r));
 assert.equal(h.pages()[0].queryIndex,0);
 const a=content.indexOf('  function kqSameQuery('),b=content.indexOf('  function kqSendPlanToHook(',a);
 const same=vm.runInNewContext(content.slice(a,b)+'\nkqSameQuery');
 assert.equal(same(h.pages()[0],{id:h.plan.id,queryIndex:1}),false);
 assert.equal(same({...h.pages()[0],queryIndex:1},{id:h.plan.id,queryIndex:1}),true);
 assert.equal(same(h.pages()[0],null),false);
});

test('XHR failure carries its query identity after the next query is installed',()=>{
 const h=hookHarness(),xhr=new h.XHR();h.post({...h.plan,queryIndex:2});xhr.open('POST',h.url);xhr.send(h.body);
 h.post({...h.plan,queryIndex:3});xhr.fire('error');assert.equal(h.pages()[0].queryIndex,2);
});

test('old bootstrap timers cannot finish or start the next query of the same run',()=>{
 const a=content.indexOf('  function kqWaitForResultsView(){'),b=content.indexOf('  // Nhận trang kết quả',a);
 const timers=[];let started=0,finished=0;
 const context=vm.createContext({kqPlan:{id:'same-run',queryIndex:0},setInterval:fn=>(timers.push(fn),1),clearInterval:()=>{},
  setTimeout:fn=>timers.push(fn),document:{readyState:'complete',title:'',body:{innerText:''}},kqNativePageError:()=>null,
  kqIsResultsView:()=>false,kqRunHarvest:()=>started++,kqFinish:()=>finished++,kqPageErrorMessage:()=>''});
 vm.runInContext(content.slice(a,b)+'\nkqWaitForResultsView()',context);
 context.kqPlan={id:'same-run',queryIndex:1};for(const fire of timers)fire();
 assert.equal(finished,0);assert.equal(started,0);
});

test('collector rejects an inherited or skipped source page instead of claiming it is the first or next page',async()=>{
 const inherited=page(0,{totalPages:1,totalElements:2});inherited.sourcePageIndex=1;
 const first=await harvest([inherited]);assert.equal(first.rows.length,0);assert.equal(first.final.partial,true);assert.equal(first.final.totalElements,2);
 const good=page(0);good.sourcePageIndex=0;const skipped=page(2);skipped.sourcePageIndex=2;
 const second=await harvest([good,skipped]);assert.equal(second.rows.length,2);assert.equal(second.final.pageIndex,1);assert.equal(second.final.partial,true);
});

test('hook reports the page number actually requested by the native website',async()=>{
 const h=hookHarness();await h.window.fetch(h.url,{method:'POST',body:JSON.stringify([{pageNumber:'2',pageSize:10,query:[]}])});
 await new Promise(r=>setImmediate(r));assert.equal(h.pages()[0].sourcePageIndex,2);
 const xhr=new h.XHR();xhr.open('POST',h.url);xhr.send(h.body);xhr.responseType='json';xhr.response={};xhr.status=200;xhr.fire('load');
 assert.equal(h.pages()[1].sourcePageIndex,0);
});

test('new query clicks visible native page 1 after a prior query ended on a later page',async()=>{
 /* 4.16.x: kqTriggerFirstPage nay bắt tay có xác nhận (xem
    tests/khoi-dong-trang-dau-416x.test.mjs). Ý định gốc của bài này giữ nguyên:
    bấm đúng nút "1" ĐANG HIỆN khi đang ở trang khác, không bao giờ bấm nút ẩn;
    đang ở trang 1 rồi thì đổi ô số bản ghi. */
 const a=content.indexOf('  function kqFirstPageMechanisms(){'),b=content.indexOf('\n  /**',content.indexOf('  async function kqTriggerFirstPage(){',a));
 assert.ok(a>0&&b>a);
 let firstClicks=0,selectChanges=0;const response={ok:true,sourcePageIndex:0};
 const hidden={offsetParent:null,textContent:'1',classList:{contains:()=>false},click:()=>assert.fail('hidden duplicate pager')};
 const first={offsetParent:{},textContent:'1',classList:{contains:()=>false},click:()=>firstClicks++};
 const select={value:'50',options:[{value:'10'},{value:'50'}],dispatchEvent:()=>selectChanges++};
 const context=vm.createContext({document:{querySelectorAll:()=>[hidden,first]},clean:s=>s.trim(),
  kqAwaitPage:()=>Promise.resolve(response),kqAwaitSent:()=>Promise.resolve(true),kqPageWaiter:null,kqSentWaiter:null,
  kqPageSizeSelect:()=>select,kqClickSearch:()=>false,Event:class{},kqPlan:{id:'p'},kqCancelled:false,kqRejected:null,
  egpInFlight:0,kqWaitEgpIdle:async()=>true,kqReport:()=>{},KQ_TRIGGER_ATTEMPTS:4,setTimeout,Date});
 const trigger=vm.runInContext(content.slice(a,b)+'\nkqTriggerFirstPage',context);
 assert.equal(await trigger(),response);assert.equal(firstClicks,1);assert.equal(selectChanges,0);
 first.classList.contains=()=>true;
 assert.equal(await trigger(),response);assert.equal(firstClicks,1);assert.equal(selectChanges,1);
});
