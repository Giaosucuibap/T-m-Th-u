/* KÍCH THƯỚC CỬA SỔ POPUP
 *
 * Lỗi thật: người dùng bấm vào biểu tượng tiện ích, popup hiện ra hẹp như sợi
 * chỉ, chữ vỡ dòng từng từ, nội dung nhảy loạn như đang tự chạy.
 *
 * Nguyên nhân: `body{max-width:100vw}`. Cửa sổ popup tự co theo nội dung, nên
 * 100vw thành vòng lặp tự bóp. Hai phép đo dưới đây khoá lại cả hai mặt:
 *   1. Thân KHÔNG được co lại theo cửa sổ, dù cửa sổ hẹp đến đâu.
 *   2. Ở chiều rộng Chrome thật sự cấp cho popup (nội dung + thanh cuộn),
 *      không được sinh thanh cuộn NGANG.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
const EXT = process.argv[2];
const RONG = 420;                 // chiều rộng popup khai trong popup.html
const CUON = 15;                  // bề rộng thanh cuộn dọc của Chrome trên Linux
const UD = fs.mkdtempSync('/tmp/ud-');
const ctx = await chromium.launchPersistentContext(UD, { headless:false,
  args:[`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`,'--no-sandbox','--disable-dev-shm-usage','--no-first-run','--no-proxy-server'] });
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker',{timeout:15000});
const ID = new URL(sw.url()).host;
const p = await ctx.newPage();
const dat = [];

async function do_(w, tall) {
  await p.setViewportSize({ width: w, height: 600 });
  await p.goto(`chrome-extension://${ID}/popup.html`);
  await p.waitForTimeout(600);
  if (tall) {
    await p.evaluate(() => { const d=document.createElement('div'); d.style.height='2000px'; document.body.appendChild(d); });
    await p.waitForTimeout(400);
  }
  return p.evaluate(() => ({
    body: document.body.offsetWidth,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth
  }));
}

console.log('1) Thân KHÔNG được co theo cửa sổ hẹp');
for (const w of [1280, 420, 320, 240, 200]) {
  const m = await do_(w, false);
  const ok = m.body >= RONG;
  dat.push(ok);
  console.log(`   cửa sổ ${String(w).padStart(4)}px -> body ${String(m.body).padStart(4)}px   ${ok?'✓':'✗ BỊ BÓP'}`);
}

console.log('\n2) Ở bề rộng Chrome cấp cho popup thì không tràn ngang');
for (const [nhan, tall] of [['nội dung ngắn', false], ['nội dung dài (có cuộn dọc)', true]]) {
  const m = await do_(RONG + CUON, tall);
  const ok = m.scrollW <= m.clientW + 1;
  dat.push(ok);
  console.log(`   ${nhan.padEnd(28)} body=${m.body}  vùng nhìn=${m.clientW}  ${ok?'✓ không tràn':'✗ TRÀN NGANG'}`);
}

const pass = dat.every(Boolean);
console.log('\nKẾT LUẬN:', pass ? 'ĐẠT' : 'CHƯA ĐẠT');
await p.setViewportSize({ width: RONG + CUON, height: 600 });
await p.goto(`chrome-extension://${ID}/popup.html`);
await p.waitForTimeout(900);
await p.screenshot({ path:'/tmp/shot-popup.png' });
await ctx.close(); fs.rmSync(UD,{recursive:true,force:true});
process.exit(pass ? 0 : 1);
