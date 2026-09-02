/* Kiểm tra khối "Từ ngày / Đến ngày" trên trang Gói đang chờ kết quả. */
import { chromium } from 'playwright';
import fs from 'node:fs';
const EXT = process.argv[2] || new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const UD = fs.mkdtempSync('/tmp/ud-');
const errors = [];
const ctx = await chromium.launchPersistentContext(UD, {
   headless: false,
  args: [`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`,'--no-sandbox','--disable-dev-shm-usage','--no-first-run','--no-proxy-server']
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker',{timeout:15000});
const ID = new URL(sw.url()).host;
const p = await ctx.newPage();
p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: ' + m.text()); });
await p.goto(`chrome-extension://${ID}/bidopen.html`);
await p.waitForTimeout(1500);

const hidden = () => p.evaluate(() => document.getElementById('dateRange').classList.contains('hidden'));
console.log('Mặc định (30 ngày) — khối ngày ẩn:', await hidden());

await p.selectOption('#days', 'custom');
await p.waitForTimeout(400);
console.log('Sau khi chọn "Tự chọn"  — khối ngày ẩn:', await hidden());
console.log('  Từ ngày tự điền  :', await p.inputValue('#fromDate'));
console.log('  Đến ngày tự điền :', await p.inputValue('#toDate'));

await p.fill('#fromDate','2026-08-01');
await p.fill('#toDate','2026-09-02');
const payload = await p.evaluate(() => ({
  days: document.getElementById('days').value === 'custom' ? 0 : Number(document.getElementById('days').value),
  fromDate: document.getElementById('days').value === 'custom' ? document.getElementById('fromDate').value : '',
  toDate: document.getElementById('days').value === 'custom' ? document.getElementById('toDate').value : ''
}));
console.log('Payload gửi đi        :', JSON.stringify(payload));

await p.selectOption('#days', '15');
await p.waitForTimeout(300);
console.log('Quay lại "15 ngày"    — khối ngày ẩn:', await hidden());

await p.screenshot({ path: '/tmp/shot-bidopen.png', fullPage: false });
console.log('\nLỖI (' + [...new Set(errors)].length + ')');
for (const e of [...new Set(errors)]) console.log(' ', e);
await ctx.close(); fs.rmSync(UD,{recursive:true,force:true});
