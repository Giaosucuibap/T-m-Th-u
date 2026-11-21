/* ============================================================================
 *  TỰ CHẠY LẠI CẢ LƯỢT KHI HỎNG TRƯỚC TRANG ĐẦU  (lib/run-retry.js,
 *  lib/runtime-query.js — redispatch, background.js — scheduleAutoRetry)
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {decideAutoRetry, retryNotice, RETRY_STAGES} from '../GiaoSuCuiBap/lib/run-retry.js';
import {createQueryRuntime} from '../GiaoSuCuiBap/lib/runtime-query.js';
import {EGP_SEARCH_PAGE} from '../GiaoSuCuiBap/lib/kqlcnt.js';

const hong=(o={})=>({planId:'r1',queryIndex:0,mode:'tbmt',ok:false,message:'e-GP không trả lời',trace:{stage:'response',pages:0,attempt:1},...o});
const dangChay={id:'r1',status:'RUNNING',qi:0};

test('hỏng trước trang đầu vì trang/mạng → chạy lại', ()=>{
  for(const stage of ['hook','controls','trigger','response']){
    const d=decideAutoRetry({payload:hong({trace:{stage,pages:0}}),job:dangChay});
    assert.equal(d.retry,true,stage);assert.equal(d.qi,0);assert.equal(d.stage,stage);
  }
  assert.deepEqual([...RETRY_STAGES].sort(),['controls','hook','response','trigger']);
});

test('KHÔNG chạy lại khi chạy lại có thể che giấu vấn đề hoặc làm tệ hơn', ()=>{
  const ca={
    'đã có trang dữ liệu':[hong({trace:{stage:'response',pages:1}}),dangChay],
    'dừng giữa chừng':[hong({trace:{stage:'harvest',pages:3}}),dangChay],
    'sai cấu trúc':[hong({trace:{stage:'schema',pages:0}}),dangChay],
    'HTTP 4xx/429':[hong({trace:{stage:'http',status:429,pages:0}}),dangChay],
    'trang e-GP báo lỗi/từ chối':[hong({trace:{stage:'page',pages:0}}),dangChay],
    'người dùng dừng':[hong({trace:{stage:'cancelled',pages:0}}),dangChay],
    'lượt dừng ở background':[hong(),{...dangChay,cancelled:true}],
    'lượt đã kết thúc':[hong(),{...dangChay,status:'ERROR'}],
    'đây đã là lần chạy lại':[hong({trace:{stage:'response',pages:0,attempt:2}}),dangChay],
    'đã chạy lại truy vấn này rồi':[hong(),{...dangChay,autoRetries:[0]}],
    'tín hiệu của truy vấn khác':[hong({queryIndex:1}),dangChay],
    'từ bộ nhớ đệm':[hong({fromCache:true}),dangChay],
    'không có sổ giai đoạn':[hong({trace:null}),dangChay],
    'thành công':[{...hong(),ok:true},dangChay],
    'không có lượt':[hong(),null]
  };
  for(const [ten,[payload,job]] of Object.entries(ca))assert.equal(decideAutoRetry({payload,job}).retry,false,ten);
});

test('truy vấn thứ hai của một lượt nhiều truy vấn vẫn được chạy lại riêng', ()=>{
  const job={...dangChay,qi:1,autoRetries:[0]};
  assert.equal(decideAutoRetry({payload:hong({queryIndex:1}),job}).retry,true);
});

test('câu báo nói rõ: chưa có dữ liệu, đang tải lại và chạy lại MỘT lần', ()=>{
  assert.match(retryNotice('trigger'),/chưa có dữ liệu nào.*tải lại trang e-GP.*một lần/);
});

function runtime({probe=()=>({ok:true,busy:false,ready:true})}={}){
  const calls={updates:[],starts:[],waited:0};
  const rt=createQueryRuntime({getState:async()=>({settings:{}}),cryptoApi:webcrypto,now:(()=>{let t=0;return()=>t+=100;})(),sleep:async()=>{},
    tabs:{query:async()=>[],update:async(id,args)=>{calls.updates.push({id,args});return {id,...args};},create:async a=>({id:9,...a})},
    sendToTab:async(id,m)=>{if(m.type==='KQLCNT_PROBE')return probe();calls.starts.push({id,payload:m.payload});return {ok:true};},
    waitForTab:async()=>{calls.waited++;},routeResults:async()=>({ok:true}),routeDone:async()=>({ok:true}),markCacheHit:async()=>{}});
  return {rt,calls};
}
const PAYLOAD={id:'r1',mode:'tbmt',queryIndex:0,query:[{pageSize:50,query:[{index:'es-contractor-selection'}]}],pageSize:50,maxPages:20,label:'x'};

test('redispatch: tải lại ĐÚNG tab đó về trang tra cứu, chờ sẵn sàng, gửi lại ĐÚNG tiêu chí cũ kèm dấu chạy lại', async()=>{
  const {rt,calls}=runtime();
  await rt.dispatch(7,PAYLOAD);
  await rt.redispatch('r1',0);
  assert.deepEqual(calls.updates,[{id:7,args:{url:EGP_SEARCH_PAGE}}]);
  assert.equal(calls.waited,1);
  assert.equal(calls.starts.length,2);
  assert.equal(calls.starts[1].id,7);
  assert.deepEqual({...calls.starts[1].payload,autoRetry:undefined},{...PAYLOAD,autoRetry:undefined});
  assert.equal(calls.starts[1].payload.autoRetry,1);
});

test('redispatch: trang tải lại báo lỗi / đang bận / không có tiêu chí cũ → báo lỗi rõ, không gửi gì', async()=>{
  for(const [probe,re] of [[()=>({pageError:'ACCESS_DENIED'}),/báo lỗi/],[()=>({busy:true}),/bận/]]){
    const {rt,calls}=runtime({probe});
    await rt.dispatch(7,PAYLOAD);
    await assert.rejects(rt.redispatch('r1',0),re);
    assert.equal(calls.starts.length,1);
  }
  const {rt}=runtime();
  await assert.rejects(rt.redispatch('khong-co',0),/Không còn tiêu chí/);
});

test('background: chạy lại được quyết định TRƯỚC khi đánh lỗi lượt, có ghi dấu chống chạy lại lần hai, tôn trọng nút Dừng', ()=>{
  const bg=fs.readFileSync(new URL('../GiaoSuCuiBap/background.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const f=bg.slice(bg.indexOf('async function routeKqlcntDone('));
  const retry=f.indexOf('await scheduleAutoRetry(key,job,payload)'),fail=f.indexOf("if(payload.ok===false){\n    if(key==='activeRun')await finishRun(");
  assert.ok(retry>0&&fail>retry);
  const g=bg.slice(bg.indexOf('async function scheduleAutoRetry('),bg.indexOf('async function routeKqlcntDone('));
  assert.ok(g.indexOf('autoRetries:[...(cur.autoRetries||[]),decision.qi]')<g.indexOf('queryRuntime.redispatch('),'ghi dấu TRƯỚC khi chạy lại');
  assert.match(g,/cur\.cancelled\|\|!\['STARTING','OPENING','RUNNING','LISTING'\]\.includes\(cur\.status\)\)return;/);
  assert.match(g,/Đã tự chạy lại một lần nhưng không được/);
  const content=fs.readFileSync(new URL('../GiaoSuCuiBap/content.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  assert.match(content,/attempt:kqPlan\?\.autoRetry\?2:1/);
});
