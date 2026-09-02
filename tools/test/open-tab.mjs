/* Kịch bản: người dùng ĐANG MỞ SẴN một trang e-GP không phải trang lựa chọn
 * nhà thầu (trang chủ), rồi bấm "Quét e-GP ngay".
 *
 * prepareScanTabFor() tái dùng tab đang mở nguyên trạng khi chưa có bộ lọc.
 * Trang chủ không có content script, nên tầng nền nhắn cho một bên nhận không
 * tồn tại. Đây là đường hỏng THỨ HAI, cùng gốc với lỗi route mặc định. */
import { chromium } from 'playwright';
import fs from 'node:fs';

const EXT = process.argv[2] || new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const PORT = process.env.MOCK_PORT || 8443;
const UD = fs.mkdtempSync('/tmp/ud-');

const ctx = await chromium.launchPersistentContext(UD, {
  
  headless: false, ignoreHTTPSErrors: true,
  args: [
    `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
    `--host-resolver-rules=MAP muasamcong.mpi.gov.vn 127.0.0.1:${PORT}`,
    '--ignore-certificate-errors', '--no-proxy-server',
    '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run'
  ]
});

const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const ID = new URL(sw.url()).host;

// Người dùng đang đứng ở TRANG CHỦ e-GP — hoàn toàn bình thường.
const home = await ctx.newPage();
await home.goto('https://muasamcong.mpi.gov.vn/web/guest/home', { waitUntil: 'load' });
await home.bringToFront();
console.log('Tab đang hoạt động:', home.url());

// Bấm "Quét e-GP ngay" từ popup — mode 'manual', đúng như người dùng thật.
const popup = await ctx.newPage();
await popup.goto(`chrome-extension://${ID}/popup.html`);
await popup.waitForTimeout(1200);
await home.bringToFront();          // trả lại tiêu điểm cho tab e-GP
const res = await popup.evaluate(() =>
  chrome.runtime.sendMessage({ type: 'START_SCAN', payload: { mode: 'manual' } })
    .catch((e) => ({ err: String(e) })));
console.log('START_SCAN ->', JSON.stringify(res));

for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const st = await sw.evaluate(() => chrome.storage.local.get(['activeRun', 'runs', 'tenders']));
  const run = st.activeRun || (st.runs || [])[0];
  process.stdout.write(`\r  ${i * 3}s | gói=${(st.tenders || []).length} | ${run ? run.status + ' — ' + String(run.message).slice(0, 60) : '?'}      `);
  if (!st.activeRun && i > 1) break;
}
console.log('\n');

const st = await sw.evaluate(() => chrome.storage.local.get(['runs', 'tenders']));
const run = (st.runs || [])[0];
console.log('KẾT QUẢ  :', run ? `${run.status} — ${run.message}` : '(không có lượt quét)');
console.log('Số gói   :', (st.tenders || []).length);
console.log('Tab e-GP :', ctx.pages().map((p) => p.url()).filter((u) => u.includes('muasamcong')).join('\n           '));

await ctx.close();
fs.rmSync(UD, { recursive: true, force: true });
