/* ============================================================================
 *  KIỂM TRA CẤU TRÚC e-GP HẰNG ĐÊM + BÁO ĐỎ QUA TELEGRAM  (lib/live-canary.js)
 *  Dùng runtime THẬT của tác giả, đối chứng giả (không gọi e-GP).
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CANARY_DEFAULT,canaryConfig,nextCanaryTime,canaryAlert,createLiveCanaryRuntime} from '../GiaoSuCuiBap/lib/live-canary.js';

const registry=JSON.parse(fs.readFileSync(new URL('../GiaoSuCuiBap/data/live-canary-cases.json',import.meta.url),'utf8'));
const VN=7*36e5;
const at=(iso)=>Date.parse(iso);

test('tần suất hằng đêm: mỗi ngày đúng giờ đã chọn (giờ VN), bỏ qua ngày trong tuần', ()=>{
  const c=canaryConfig({frequency:'daily',hour:2,weekday:3});
  assert.equal(c.frequency,'daily');
  // 01:00 VN ngày 8/10 → 02:00 VN cùng ngày
  assert.equal(nextCanaryTime(at('2026-10-07T18:00:00Z'),c),at('2026-10-07T19:00:00Z'));
  // 03:00 VN → 02:00 VN hôm sau
  assert.equal(nextCanaryTime(at('2026-10-07T20:00:00Z'),c),at('2026-10-08T19:00:00Z'));
  assert.equal(canaryConfig({frequency:'lạ'}).frequency,'weekly');
  assert.equal(CANARY_DEFAULT.frequency,'weekly','mặc định giữ hằng tuần như tác giả — không tự tăng tải e-GP');
  // hằng tuần không đổi hành vi cũ
  assert.equal(nextCanaryTime(at('2026-10-07T20:00:00Z'),canaryConfig({hour:2,weekday:1}))-at('2026-10-07T20:00:00Z')>2*864e5,true);
});

test('chỉ nhắn khi trạng thái ĐÃ BÁO đổi: lần đầu ĐỎ, và hồi phục sau ĐỎ; "chưa xác định" không báo động', ()=>{
  const red={status:'RED',reason:'Có sai khác',cases:[{id:'IB2600000001',status:'RED',reason:'Mất trường bidPrice'}],provinceCheck:{status:'GREEN'}};
  const a=canaryAlert({status:'GREEN'},red);
  assert.equal(a.send,true);assert.equal(a.status,'RED');
  assert.match(a.text,/IB2600000001: Mất trường bidPrice/);
  assert.match(a.text,/TỰ DỪNG mọi lượt quét tự động/);
  assert.equal(canaryAlert({status:'RED',alertedStatus:'RED'},red).send,false,'đêm sau vẫn đỏ: không nhắn lại');
  assert.equal(canaryAlert({alertedStatus:'RED'},{status:'UNKNOWN'}).send,false);
  assert.equal(canaryAlert({alertedStatus:null},{status:'UNKNOWN'}).send,false);
  const g=canaryAlert({alertedStatus:'RED'},{status:'GREEN',reason:'25/25 khớp'});
  assert.equal(g.send,true);assert.equal(g.status,'GREEN');
  assert.equal(canaryAlert({alertedStatus:'GREEN'},{status:'GREEN'}).send,false);
  assert.equal(canaryAlert(null,{status:'GREEN'}).send,false,'xanh từ đầu: không cần nhắn');
  assert.match(canaryAlert({},{status:'RED',cases:[],provinceCheck:{status:'RED'}}).text,/mã 703 không còn là Lâm Đồng/);
});

function harness({probeRed=false,notify}={}){
  let state={settings:{},canaryConfig:{...CANARY_DEFAULT},liveCanary:{status:'UNKNOWN',cases:[]}};
  const sent=[];
  const raw=item=>item.type==='PL'?{planNo:item.id,planVersion:'00',name:'KH',investField:['XL'],decisionDate:'2026-09-01T10:00:00'}
    :{notifyNo:item.id,notifyVersion:'00',bidName:['Gói'],investField:[item.expectedField||'XL'],bidPrice:[probeRed?'':200000000],numBidderJoin:1};
  const runtime=createLiveCanaryRuntime({
    getState:async()=>state,save:async u=>{state={...state,...structuredClone(u)};},
    runProbe:async q=>{const item=registry.cases.find(c=>c.id===q.keyWord);return {status:'OK',complete:true,records:[raw(item)],totalElements:1,totalPages:1};},
    readOpening:async()=>({status:'OK',rows:[{contractorCode:'vn0123456789',contractorName:'NT',lotPrice:1e8,lotFinalPrice:9.5e7,discountPercent:5}]}),
    fetchProvinces:async()=>[{code:'703',name:'Tỉnh Lâm Đồng'}],stopScans:async()=>{},
    alarms:{create:async()=>{},clear:async()=>{}},loadCases:async()=>structuredClone(registry),sourceDigest:async()=>'a'.repeat(64),
    now:()=>at('2026-10-07T19:00:00Z'),version:'4.17.0',notify:notify||(async text=>{sent.push(text);return {ok:true};})
  });
  return {runtime,sent,get state(){return state;},set(v){probeRed=v;}};
}

test('runtime thật: xanh→ĐỎ nhắn 1 tin; đêm sau vẫn ĐỎ không nhắn; hồi phục nhắn 1 tin', async()=>{
  const h=harness();
  await h.runtime.run({trigger:'nightly',wait:true});
  assert.equal(h.state.liveCanary.status,'GREEN');assert.equal(h.sent.length,0);
  h.set(true);
  await h.runtime.run({trigger:'nightly',wait:true});
  assert.equal(h.state.liveCanary.status,'RED');assert.equal(h.sent.length,1);
  assert.equal(h.state.liveCanary.alertedStatus,'RED');
  await h.runtime.run({trigger:'nightly',wait:true});
  assert.equal(h.sent.length,1,'không nhắn lại');
  assert.equal(h.state.liveCanary.alertedStatus,'RED','dấu đã báo không bị lượt mới xóa');
  h.set(false);
  await h.runtime.run({trigger:'nightly',wait:true});
  assert.equal(h.state.liveCanary.status,'GREEN');assert.equal(h.sent.length,2);
  assert.match(h.sent[1],/khớp trở lại/);
});

test('nhắn Telegram thất bại → ghi lại lý do và lần sau THỬ LẠI (không đánh dấu đã báo)', async()=>{
  let ok=false;const h=harness({probeRed:true,notify:async()=>(ok?{ok:true}:{ok:false,message:'Sai Bot Token'})});
  await h.runtime.run({trigger:'nightly',wait:true});
  assert.equal(h.state.liveCanary.alertedStatus,null);
  assert.match(h.state.liveCanary.alertNote,/Sai Bot Token/);
  ok=true;
  await h.runtime.run({trigger:'nightly',wait:true});
  assert.equal(h.state.liveCanary.alertedStatus,'RED');
});

test('nối dây: Telegram chỉ khi người dùng đã bật; ô giờ khớp giới hạn 0–4 của lõi', ()=>{
  const bg=fs.readFileSync(new URL('../GiaoSuCuiBap/background.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  assert.match(bg,/notify:async text=>\{const s=await getState\(\);if\(!s\.settings\.telegramEnabled\|\|s\.settings\.readOnlyMode\)return \{ok:false/);
  const html=fs.readFileSync(new URL('../GiaoSuCuiBap/options.html',import.meta.url),'utf8');
  assert.match(html,/id="canary-hour" type="number" min="0" max="4"/);
  assert.match(html,/id="canary-frequency"/);
  assert.equal(canaryConfig({hour:10}).hour,2,'lõi vẫn chặn giờ ngoài 0–4 — nay giao diện nói rõ, không âm thầm');
});
