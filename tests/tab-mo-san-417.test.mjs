/* ============================================================================
 *  TAB E-GP MỞ SẴN  (lib/runtime-query.js — prewarm)
 *
 *  Mở màn hình tra cứu → mở sẵn trang tra cứu e-GP ở tab nền. Các bất biến:
 *    • KHÔNG BAO GIỜ điều hướng/tải lại tab e-GP của người dùng;
 *    • không mở tab thứ hai khi đã có một tab dùng được;
 *    • lượt tra cứu tới khi tab mở sẵn còn đang tải thì CHỜ nó, không mở tab mới;
 *    • tab mở sẵn vừa tải xong mà e-GP chưa vẽ xong ô tìm kiếm thì chờ, không tải lại;
 *    • tắt được, và tôn trọng khóa chỉnh sửa / kiểm tra cấu trúc đỏ / lượt đang chạy.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createQueryRuntime, WARM_MAX_AGE_MS} from '../GiaoSuCuiBap/lib/runtime-query.js';
import {EGP_SEARCH_PAGE} from '../GiaoSuCuiBap/lib/kqlcnt.js';

const READY={ok:true,busy:false,pageError:null,searchView:true,resultsView:false,ready:true};
const NOT_YET={ok:true,busy:false,pageError:null,searchView:false,resultsView:false,ready:false};

function dung({state={},tabs=[],probe=()=>READY,clock={t:1_000_000}}={}){
  const calls={created:[],updates:[],waited:[],probes:0};
  let nextId=50,loadDone,dangTai=false;
  const known=[...tabs];
  const runtime=createQueryRuntime({getState:async()=>({settings:{},...state}),cryptoApi:webcrypto,
    now:()=>clock.t,sleep:async ms=>{clock.t+=ms;},
    tabs:{query:async()=>known.slice(),
      update:async(id,args)=>{calls.updates.push({id,args});return {id,...args};},
      create:async(args)=>{const tab={id:nextId++,...args};calls.created.push(args);known.push({...tab});return tab;}},
    // Như Chrome thật: trang đang tải thì chưa có content script để trả lời.
    sendToTab:async(id,m)=>{if(m.type==='KQLCNT_PROBE'){calls.probes++;if(dangTai)throw Error('Receiving end does not exist.');return probe(id);}return {ok:true};},
    // Lần tải ĐẦU (tab mở sẵn) treo tới khi bài gọi xongTai(); các lần sau xong ngay.
    waitForTab:(...args)=>{calls.waited.push(args);if(calls.waited.length>1)return Promise.resolve();dangTai=true;return new Promise(r=>{loadDone=()=>{dangTai=false;r();};});},
    routeResults:async()=>({ok:true}),routeDone:async()=>({ok:true}),markCacheHit:async()=>{}});
  return {runtime,calls,known,clock,xongTai:()=>loadDone?.()};
}

test('chưa có tab e-GP → mở một tab NỀN tới trang tra cứu, chống Chrome cho tab ngủ', async()=>{
  const {runtime,calls}=dung();
  const r=await runtime.prewarm();
  assert.equal(r.warmed,true);
  assert.deepEqual(calls.created,[{url:EGP_SEARCH_PAGE,active:false}]);
  assert.deepEqual(calls.updates,[{id:r.tabId,args:{autoDiscardable:false}}]);
  assert.equal(runtime.warmTabId(),r.tabId);
});

test('người dùng đang mở trang tra cứu e-GP → không mở thêm, không đụng vào tab đó', async()=>{
  const {runtime,calls}=dung({tabs:[{id:7,url:EGP_SEARCH_PAGE,active:true}]});
  const r=await runtime.prewarm();
  assert.equal(r.reason,'user-tab');
  assert.deepEqual(calls.created,[]);
  assert.deepEqual(calls.updates,[]);
  assert.equal(calls.probes,0);
});

test('mở nhiều màn hình liên tiếp → vẫn chỉ MỘT tab mở sẵn', async()=>{
  const {runtime,calls}=dung();
  const [a,b]=await Promise.all([runtime.prewarm(),runtime.prewarm()]);
  await runtime.prewarm();
  assert.equal(calls.created.length,1);
  assert.equal([a,b].filter(x=>x.warmed).length,1);
});

test('tắt ở Cấu hình / khóa chỉnh sửa / kiểm tra cấu trúc đỏ / đang có lượt chạy → không mở', async()=>{
  for(const [state,reason] of [[{settings:{keepEgpTabWarm:false}},'off'],[{settings:{readOnlyMode:true}},'blocked'],
    [{liveCanary:{status:'RED'}},'blocked'],[{activeRun:{id:'r',status:'RUNNING',tabId:3}},'busy']]){
    const {runtime,calls}=dung({state});
    const r=await runtime.prewarm();
    assert.equal(r.reason,reason,JSON.stringify(state));
    assert.equal(r.warmed,false);
    assert.equal(calls.created.length,0,JSON.stringify(state));
  }
});

test('lượt tra cứu tới khi tab mở sẵn còn đang tải → chờ nó tải xong rồi dùng, không mở tab thứ hai', async()=>{
  const {runtime,calls,xongTai}=dung();
  const {tabId}=await runtime.prewarm();
  let got=null;
  const p=runtime.acquire(false).then(t=>{got=t;});
  await new Promise(r=>setTimeout(r,5));
  assert.equal(got,null,'phải chờ tab mở sẵn tải xong');
  xongTai();await p;
  assert.equal(got.id,tabId);
  assert.equal(calls.created.length,1);
  assert.equal(calls.updates.filter(u=>u.args.url).length,0,'không tải lại trang vừa mở sẵn');
});

test('tab mở sẵn đã tải nhưng e-GP chưa vẽ xong ô tìm kiếm → chờ thêm, KHÔNG tải lại', async()=>{
  let lan=0;
  const {runtime,calls,xongTai}=dung({probe:()=>(++lan<4?NOT_YET:READY)});
  const {tabId}=await runtime.prewarm();xongTai();
  const tab=await runtime.acquire(false);
  assert.equal(tab.id,tabId);
  assert.equal(lan,4);
  assert.equal(calls.updates.filter(u=>u.args.url).length,0);
});

test('tab mở sẵn hỏng hẳn (quá thời gian chờ) → quay về đường cũ: nạp lại trang tra cứu', async()=>{
  const {runtime,calls,xongTai}=dung({probe:()=>NOT_YET});
  const {tabId}=await runtime.prewarm();xongTai();
  await runtime.acquire(false);
  assert.deepEqual(calls.updates.filter(u=>u.args.url).map(u=>u.id),[tabId]);
});

test('tab mở sẵn để quá lâu → làm mới khi người dùng không xem nó; đang xem thì để yên', async()=>{
  const h=dung();
  const {tabId}=await h.runtime.prewarm();h.xongTai();
  h.clock.t+=WARM_MAX_AGE_MS+1;
  h.known.find(t=>t.id===tabId).active=true;
  assert.equal((await h.runtime.prewarm()).reason,'warm');
  assert.equal(h.calls.updates.filter(u=>u.args.url).length,0,'đang xem thì không tải lại');
  h.known.find(t=>t.id===tabId).active=false;
  const r=await h.runtime.prewarm();
  assert.equal(r.refreshed,true);
  assert.deepEqual(h.calls.updates.filter(u=>u.args.url),[{id:tabId,args:{url:EGP_SEARCH_PAGE}}]);
});

test('người dùng đóng tab mở sẵn → lần sau mở lại tab mới', async()=>{
  const h=dung();
  const {tabId}=await h.runtime.prewarm();
  h.known.splice(h.known.findIndex(t=>t.id===tabId),1);
  const r=await h.runtime.prewarm();
  assert.equal(r.warmed,true);
  assert.notEqual(r.tabId,tabId);
});

test('trang Cấu hình có ô bật/tắt, mặc định BẬT', async()=>{
  const fs=await import('node:fs');
  const {DEFAULT_SETTINGS}=await import('../GiaoSuCuiBap/lib/core.js');
  assert.equal(DEFAULT_SETTINGS.keepEgpTabWarm,true);
  assert.match(fs.readFileSync(new URL('../GiaoSuCuiBap/options.html',import.meta.url),'utf8').replace(/\r\n/g,'\n'),/id="keepEgpTabWarm"/);
  assert.match(fs.readFileSync(new URL('../GiaoSuCuiBap/options.js',import.meta.url),'utf8').replace(/\r\n/g,'\n'),/'keepEgpTabWarm'/);
  assert.match(fs.readFileSync(new URL('../GiaoSuCuiBap/background.js',import.meta.url),'utf8').replace(/\r\n/g,'\n'),/case 'EGP_PREWARM': sendResponse\(await queryRuntime\.prewarm\(\)\)/);
});

test('mọi kịch bản trình duyệt trong tools/test đều chỉ e-GP về máy giả lập — không chạm e-GP thật', async()=>{
  /* Có tab mở sẵn, chỉ cần MỞ một màn hình tra cứu là trình duyệt tải trang e-GP.
     Kịch bản thử nào quên dòng này sẽ gõ cửa e-GP thật. (Các bài live-* trong
     tests/ cố ý chạy trên e-GP thật, có kiểm soát — không thuộc phạm vi này.) */
  const fs=await import('node:fs');
  const dir=new URL('../tools/test/',import.meta.url);
  const thieu=fs.readdirSync(dir).filter(f=>f.endsWith('.mjs')).filter(f=>{
    const src=fs.readFileSync(new URL(f,dir),'utf8').replace(/\r\n/g,'\n');
    return /chromium\.launch/.test(src)&&!/--host-resolver-rules=MAP muasamcong\.mpi\.gov\.vn 127\.0\.0\.1:/.test(src);
  });
  assert.deepEqual(thieu,[]);
});
