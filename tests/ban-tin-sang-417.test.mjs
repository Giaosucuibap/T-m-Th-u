/* ============================================================================
 *  BẢN TIN BUỔI SÁNG  (lib/morning-bulletin.js + nối dây)
 *  Chạy cả trong tests/run-timezones.mjs: 07:00 phải là giờ VIỆT NAM bất kể
 *  máy đặt múi giờ nào.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {nextBulletinTime, shouldSendBulletin, buildBulletin, vnDate} from '../GiaoSuCuiBap/lib/morning-bulletin.js';

const at=s=>Date.parse(s);
const H=36e5,D=864e5;

test('07:00 là giờ Việt Nam, không phụ thuộc múi giờ máy', ()=>{
  assert.equal(nextBulletinTime(at('2026-10-07T20:00:00Z'),'07:00'),at('2026-10-08T00:00:00Z'),'03:00 VN → 07:00 VN cùng ngày');
  assert.equal(nextBulletinTime(at('2026-10-08T00:00:00Z'),'07:00'),at('2026-10-09T00:00:00Z'),'đúng 07:00 → hôm sau');
  assert.equal(nextBulletinTime(at('2026-10-08T01:00:00Z'),'rác'),at('2026-10-09T00:00:00Z'),'giờ không hợp lệ → mặc định 07:00');
  assert.equal(vnDate(at('2026-10-07T17:30:00Z')),'2026-10-08','00:30 VN đã là ngày mới');
});

test('mỗi ngày tối đa MỘT tin; lỡ giờ thì gửi bù trước 12:00; tắt thì không gửi', ()=>{
  const n=at('2026-10-08T01:30:00Z'); // 08:30 VN
  assert.equal(shouldSendBulletin({enabled:true,lastSentOn:'2026-10-07',now:n}).send,true);
  assert.equal(shouldSendBulletin({enabled:true,lastSentOn:'2026-10-08',now:n}).reason,'already');
  assert.equal(shouldSendBulletin({enabled:false,now:n}).reason,'off');
  assert.equal(shouldSendBulletin({enabled:true,now:at('2026-10-07T23:00:00Z')}).reason,'early','06:00 VN chưa tới giờ');
  assert.equal(shouldSendBulletin({enabled:true,now:at('2026-10-08T06:00:00Z')}).reason,'missed','13:00 VN thôi, đợi sáng mai');
  assert.equal(shouldSendBulletin({enabled:false,lastSentOn:'2026-10-08',now:n,force:true}).send,true,'gửi thử luôn được');
});

const NOW=at('2026-10-08T00:00:00Z');
const t=(key,o={})=>({key,notifyNo:key,displayCode:`${key}-00`,bidName:`Gói ${key}`,price:5e9,investorName:'Ban QLDA',score:80,filterState:'MATCH',
  firstSeenAt:new Date(NOW-2*H).toISOString(),closeDate:new Date(NOW+10*D).toISOString(),detailUrl:'https://muasamcong.mpi.gov.vn/x',...o});

test('mục 1: chỉ gói MỚI (24 giờ), khớp tiêu chí, đạt ngưỡng, còn hạn — xếp theo điểm', ()=>{
  const b=buildBulletin({now:NOW,minScore:70,tenders:[t('A',{score:90}),t('B'),t('CU',{firstSeenAt:new Date(NOW-30*H).toISOString()}),
    t('THAP',{score:50}),t('NGOAI',{filterState:'OUT_OF_RANGE'}),t('DONG',{closeDate:new Date(NOW-H).toISOString()})]});
  assert.equal(b.counts.fresh,2);
  assert.ok(b.text.indexOf('Gói A')<b.text.indexOf('Gói B'));
  for(const k of ['CU','THAP','NGOAI','DONG'])assert.doesNotMatch(b.text,new RegExp(`Gói ${k}\\b`));
});

test('mục 2: gói đang theo dõi/đã quyết định sắp đóng ≤3 ngày, ≤1 ngày đánh dấu đỏ lên trước', ()=>{
  const b=buildBulletin({now:NOW,tenders:[t('X',{watchlisted:true,closeDate:new Date(NOW+2.5*D).toISOString(),firstSeenAt:'2026-01-01'}),
    t('Y',{decisionState:'GO',closeDate:new Date(NOW+5*H).toISOString(),firstSeenAt:'2026-01-01'}),
    t('Z',{watchlisted:true,closeDate:new Date(NOW+6*D).toISOString(),firstSeenAt:'2026-01-01'}),
    t('W',{closeDate:new Date(NOW+5*H).toISOString(),firstSeenAt:'2026-01-01'})]});
  assert.deepEqual([b.counts.soon,b.counts.urgent],[2,1]);
  assert.match(b.text,/🔴 Gói Y — còn 5 giờ/);
  assert.match(b.text,/🟡 Gói X — còn 2 ngày 12 giờ/);
  assert.ok(b.text.indexOf('Gói Y')<b.text.indexOf('Gói X'));
  assert.doesNotMatch(b.text,/Gói Z|Gói W/);
});

test('mục 3 nói thật: chưa quét / quét quá 24 giờ / cấu trúc ĐỎ; chống chèn HTML', ()=>{
  assert.match(buildBulletin({now:NOW}).text,/Chưa có lượt quét nào/);
  assert.match(buildBulletin({now:NOW,lastRun:{startedAt:new Date(NOW-30*H).toISOString(),status:'SUCCESS'}}).text,/Hơn 24 giờ chưa quét/);
  assert.match(buildBulletin({now:NOW,liveCanary:{status:'RED'}}).text,/ĐỎ — quét tự động đang dừng/);
  const x=buildBulletin({now:NOW,tenders:[t('<b>',{bidName:'<script>x</script>'})]});
  assert.doesNotMatch(x.text,/<script>/);
  assert.match(x.text,/&lt;script&gt;/);
  assert.match(buildBulletin({now:NOW}).text,/không tự hỏi e-GP/);
});

test('nối dây: mặc định TẮT; gửi thử không chiếm suất trong ngày; gửi hỏng thì không đánh dấu đã gửi', async()=>{
  const {DEFAULT_SETTINGS}=await import('../GiaoSuCuiBap/lib/core.js');
  assert.equal(DEFAULT_SETTINGS.telegramMorningBulletin,false);
  const bg=fs.readFileSync(new URL('../GiaoSuCuiBap/background.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  assert.match(bg,/\.\.\.\(sent\?\.ok&&!force\?\{lastSentOn:vnDate\(now\)\}:\{\}\)/);
  assert.match(bg,/else if\(alarm\.name===BULLETIN_ALARM\)\{await maybeSendBulletin\(\);await ensureBulletinAlarm\(await getState\(\)\);\}/);
  assert.match(bg,/const on=s\.settings\.telegramEnabled&&s\.settings\.telegramMorningBulletin&&!s\.settings\.readOnlyMode;/);
});

test('liên kết gọn, chỉ tới e-GP; bản tin đầy vẫn vừa MỘT tin Telegram (≤4096 ký tự hiển thị)', ()=>{
  const dai='https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?'+'p=1&'.repeat(150); // ~670 ký tự như đường dẫn e-GP thật
  const many=Array.from({length:60},(_,i)=>t(`K${i}`,{detailUrl:dai,bidName:'Thi công xây lắp kênh mương nội đồng N1, N2 xã Đơn Dương (gói số 2)',watchlisted:i<20,closeDate:new Date(NOW+(i<20?2*D:10*D)).toISOString()}));
  const b=buildBulletin({now:NOW,tenders:many,lastRun:{startedAt:new Date(NOW-H).toISOString(),status:'SUCCESS'}});
  assert.ok(b.text.length<=3800,`dài thô ${b.text.length} — hàm gửi Telegram sẽ cắt thành nhiều tin`);
  assert.ok(b.counts.linked>=1&&b.counts.linked<10,`gắn ${b.counts.linked} liên kết khi còn chỗ`);
  assert.match(b.text,/<a href="https:\/\/muasamcong\.mpi\.gov\.vn\/[^"]*">Mở e-GP<\/a>/);
  const xau=buildBulletin({now:NOW,tenders:[t('E',{detailUrl:'javascript:alert(1)'}),t('F',{detailUrl:'https://evil.example/x'})]});
  assert.doesNotMatch(xau.text,/javascript:|evil\.example/);
});

test('gửi bù chỉ khi Chrome khởi động, không khi vừa lưu Cấu hình (tránh 2 tin trùng — đã gặp khi chạy thật)', ()=>{
  const bg=fs.readFileSync(new URL('../GiaoSuCuiBap/background.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const ensure=bg.slice(bg.indexOf('async function ensureBulletinAlarm('),bg.indexOf('async function maybeSendBulletin('));
  assert.doesNotMatch(ensure,/maybeSendBulletin\(/);
  const startup=bg.slice(bg.indexOf('chrome.runtime.onStartup.addListener('));
  assert.match(startup.slice(0,400),/void maybeSendBulletin\(\)/);
});
