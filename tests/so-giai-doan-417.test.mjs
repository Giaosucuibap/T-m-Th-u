/* ============================================================================
 *  SỔ GIAI ĐOẠN TRA CỨU + THỐNG KÊ  (lib/run-trace.js, content.js, background.js)
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {traceEntry, appendTrace, percentile, summarizeTrace, TRACE_LIMIT, STAGES} from '../GiaoSuCuiBap/lib/run-trace.js';

const AT=Date.parse('2026-10-08T03:00:00Z');
const xong=(o={})=>({planId:'run-1',queryIndex:0,mode:'tbmt',ok:true,trace:{stage:'ok',hookMs:120,firstPageMs:900,totalMs:2400,pages:3,reReads:0},...o});

test('một dòng sổ chỉ có con số và nhãn — không lọt tiêu chí, tên gói, thông báo', ()=>{
  const e=traceEntry(xong({label:'Trường học Lâm Đồng — Ban QLDA X',message:'Xong: 37 kết quả của Công ty ABC MST 0101234567',
    query:[{bidName:'bí mật'}],focusTaxCode:'0101234567',trace:{stage:'ok',totalMs:2400,note:'lạ',criteria:{a:1}}}),{at:AT,openMs:3100,warm:true});
  assert.deepEqual(Object.keys(e).sort(),['at','cached','firstPageMs','hookMs','id','mode','ok','openMs','pages','reReads','stage','status','totalMs','warm'].sort());
  const json=JSON.stringify(e);
  for(const lo of ['Lâm Đồng','ABC','0101234567','bí mật','lạ','criteria'])assert.equal(json.includes(lo),false,lo);
  assert.equal(e.openMs,3100);assert.equal(e.warm,true);
});

test('giai đoạn: thành công luôn là ok; lỗi giữ giai đoạn đã biết; nhãn lạ không lọt vào', ()=>{
  assert.equal(traceEntry(xong()).stage,'ok');
  assert.equal(traceEntry(xong({ok:false,trace:{stage:'trigger'}})).stage,'trigger');
  assert.equal(traceEntry(xong({ok:false,trace:{stage:'<script>'}})).stage,'response');
  assert.equal(traceEntry(xong({ok:false,trace:null})).stage,'response');
  assert.equal(traceEntry(xong({ok:false,cancelled:true,trace:{stage:'cancelled'}})).stage,'cancelled');
  // ok:true mà nội dung nói lỗi → vẫn tin cờ ok (đó là kết luận của bộ thu)
  assert.equal(traceEntry(xong({ok:true,trace:{stage:'harvest'}})).stage,'ok');
  assert.equal(traceEntry(xong({mode:'xyz'})).mode,'khac');
  assert.equal(traceEntry(xong({trace:{totalMs:-5}})).totalMs,null);
  assert.equal(traceEntry(xong({fromCache:true})).cached,true);
  for(const k of Object.keys(STAGES))assert.equal(typeof STAGES[k],'string');
});

test('KQLCNT_DONE gửi lại (tối đa 3 lần) không bị ghi hai dòng; sổ giữ tối đa 200 dòng', ()=>{
  let sổ=[];
  for(let i=0;i<3;i++)sổ=appendTrace(sổ,traceEntry(xong(),{at:AT}));
  assert.equal(sổ.length,1);
  sổ=appendTrace(sổ,traceEntry(xong({queryIndex:1}),{at:AT}));
  assert.equal(sổ.length,2,'truy vấn thứ hai của cùng lượt là một dòng riêng');
  for(let i=0;i<TRACE_LIMIT+30;i++)sổ=appendTrace(sổ,traceEntry(xong({planId:`r${i}`}),{at:AT}));
  assert.equal(sổ.length,TRACE_LIMIT);
  assert.equal(sổ.at(-1).id,`r${TRACE_LIMIT+29}:0`);
});

test('phân vị theo hạng gần nhất — luôn là một giá trị đã đo thật', ()=>{
  const v=[100,200,300,400,500,600,700,800,900,1000];
  assert.equal(percentile(v,50),500);
  assert.equal(percentile(v,95),1000);
  assert.equal(percentile([7],95),7);
  assert.equal(percentile([],50),null);
  assert.equal(percentile([3,null,1,NaN,2],50),2);
});

test('thống kê: tỉ lệ lỗi KHÔNG tính lượt bộ nhớ đệm và lượt người dùng dừng; lỗi xếp theo giai đoạn', ()=>{
  const rows=[
    ...[1000,2000,3000,4000].map((t,i)=>traceEntry(xong({planId:`ok${i}`,trace:{stage:'ok',totalMs:t,firstPageMs:t/2}}),{at:AT,openMs:500})),
    traceEntry(xong({planId:'f1',ok:false,trace:{stage:'trigger',totalMs:9000}}),{at:AT}),
    traceEntry(xong({planId:'f2',ok:false,trace:{stage:'response',totalMs:45000}}),{at:AT}),
    traceEntry(xong({planId:'f3',ok:false,trace:{stage:'response',status:503}}),{at:AT}),
    traceEntry(xong({planId:'c1',fromCache:true}),{at:AT}),
    traceEntry(xong({planId:'x1',ok:false,cancelled:true,trace:{stage:'cancelled'}}),{at:AT}),
    traceEntry(xong({planId:'k1',mode:'khlcnt',trace:{stage:'ok',totalMs:1500,reReads:2}}),{at:AT})
  ];
  const s=summarizeTrace(rows,{now:AT});
  assert.equal(s.runs,8);assert.equal(s.ok,5);
  assert.equal(s.errorRate,3/8);
  assert.equal(s.cached,1);assert.equal(s.cancelled,1);
  assert.deepEqual(s.failures,{trigger:1,response:2});
  assert.equal(s.p50,2000,'chỉ lượt thành công mới vào độ trễ');
  assert.equal(s.p95,4000);
  assert.equal(s.reReads,2);
  assert.equal(s.byMode.tbmt.runs,7);assert.equal(s.byMode.khlcnt.errorRate,0);
  assert.equal(s.openP50,500);
});

test('thống kê theo khoảng thời gian (7 ngày)', ()=>{
  const cu=traceEntry(xong({planId:'cu',ok:false,trace:{stage:'trigger'}}),{at:AT-8*864e5});
  const moi=traceEntry(xong({planId:'moi'}),{at:AT});
  assert.equal(summarizeTrace([cu,moi],{now:AT,sinceMs:7*864e5}).errorRate,0);
  assert.equal(summarizeTrace([cu,moi],{now:AT}).errorRate,0.5);
});

/* ---- content.js: tín hiệu KQLCNT_DONE mang theo giai đoạn thật ---- */
const content=fs.readFileSync(new URL('../GiaoSuCuiBap/content.js',import.meta.url),'utf8');
function hamContent(){
  const a=content.indexOf('  let kqTr=null;'),b=content.indexOf('  function kqFinish(',a);
  assert.ok(a>0&&b>a);
  const ctx=vm.createContext({Date});
  vm.runInContext(content.slice(a,b).replace('let kqTr=null;','var kqTr=null;'),ctx);
  return ctx;
}
test('content: mốc bắt đầu nằm trong plan, nên e-GP tải lại trang giữa lượt vẫn đo đúng tổng thời gian', ()=>{
  const ctx=hamContent();
  ctx.kqTraceReset({traceStart:Date.now()-5000});
  const t=ctx.kqTraceSummary(true,false);
  assert.ok(t.totalMs>=5000&&t.totalMs<6000,String(t.totalMs));
  assert.equal(t.stage,'ok');
  assert.equal(ctx.kqTraceSummary(false,true,'trigger').stage,'cancelled');
  assert.equal(ctx.kqTraceSummary(false,false,'trigger').stage,'trigger');
});

test('content: mọi đường kết thúc lỗi đều ghi rõ giai đoạn', ()=>{
  const calls=[...content.matchAll(/kqFinish\(([\s\S]*?)\);\s*(?:return|\})/g)].map(m=>m[0]);
  // Các cuộc gọi kqFinish(false,...) phải truyền đối số giai đoạn thứ ba.
  const thieu=calls.filter(c=>/kqFinish\(false,/.test(c)&&!/,'(page|hook|cancelled)'\)|,\s*page\?\.stage/.test(c));
  assert.deepEqual(thieu,[]);
  assert.match(content,/transferFailed\|\|deliveryFailed\?'delivery':schemaIssue\?'schema':'harvest'\)/);
  assert.match(content,/'KQLCNT_DONE',\{\.\.\.donePlan,ok,cancelled,partial:!ok,message,trace\}/);
});

test('background: ghi sổ ở KQLCNT_DONE, lượt kiểm tra cấu trúc không vào sổ, xóa sổ bị khóa khi chỉ xem', ()=>{
  const bg=fs.readFileSync(new URL('../GiaoSuCuiBap/background.js',import.meta.url),'utf8');
  const f=bg.slice(bg.indexOf('async function routeKqlcntDone('));
  const probe=f.indexOf("routeProbe('KQLCNT_DONE'"),rec=f.indexOf('recordRunTrace(payload,sender)');
  assert.ok(probe>0&&rec>probe,'lượt kiểm tra cấu trúc phải rẽ đi TRƯỚC khi ghi sổ');
  assert.match(bg,/case 'CLEAR_RUN_TRACE'/,'tên CLEAR_ để khóa chỉ-xem chặn được');
  const rq=fs.readFileSync(new URL('../GiaoSuCuiBap/lib/runtime-query.js',import.meta.url),'utf8');
  assert.match(rq,/queryIndex:payload\.queryIndex\|\|0,fromCache:true\}/,'lượt phát lại từ bộ nhớ đệm phải được đánh dấu');
});

test('background: bộ lọc tín hiệu từ trang e-GP GIỮ sổ giai đoạn (chỉ nhãn ngắn và số)', ()=>{
  /* Lỗi thật đã gặp khi chạy Chromium: bộ lọc KQLCNT_DONE bỏ mất trường trace,
     sổ ghi đủ dòng nhưng mọi thời gian đều trống. Bài đơn vị cũ không bắt được. */
  const bg=fs.readFileSync(new URL('../GiaoSuCuiBap/background.js',import.meta.url),'utf8');
  assert.match(bg,/if\(type==='KQLCNT_DONE'\)return \{[^;]*trace:safeTrace\(p\.trace\)\};/);
  const a=bg.indexOf('function shortString('),b=bg.indexOf('function nullableCount(');
  const ctx=vm.createContext({});vm.runInContext(bg.slice(a,b),ctx);
  const t=JSON.parse(JSON.stringify(ctx.safeTrace({stage:'trigger'.repeat(10),totalMs:'1200',hookMs:5,pages:2,reReads:1,status:503,secret:'x',firstPageMs:{}})));
  assert.deepEqual(t,{stage:'triggertriggertrigger'.slice(0,20),hookMs:5,firstPageMs:null,totalMs:1200,pages:2,reReads:1,status:503});
  for(const bad of [null,'x',[1],7])assert.equal(ctx.safeTrace(bad),null);
});

test('thời gian không đo được là "không có", không bao giờ thành 0 ms', ()=>{
  /* Lỗi thật trong Chromium: lượt hỏng trước trang đầu ghi firstPageMs = 0 vì
     Number(null) === 0 — kéo trung vị "trang đầu" xuống thành số đẹp giả. */
  const e=traceEntry(xong({ok:false,trace:{stage:'response',hookMs:3,firstPageMs:null,totalMs:23}}));
  assert.equal(e.firstPageMs,null);
  assert.equal(traceEntry(xong({trace:{stage:'ok',totalMs:''}})).totalMs,null);
  assert.equal(traceEntry(xong({trace:{stage:'ok',totalMs:0}})).totalMs,0,'0 đo thật vẫn là 0');
});
