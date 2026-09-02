/* Kịch bản NGƯỜI DÙNG MỚI: chưa lưu bộ lọc nào, bấm "Quét" ngay.
 * 4.0.0 thu hẹp content_scripts chỉ còn trang contractor-selection, nhưng
 * prepareScanTabFor() vẫn dự phòng về /web/guest/home. Kiểm tra xem tab được
 * mở ở đâu và content script có nạp được không. */
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

const ui = await ctx.newPage();
await ui.goto(`chrome-extension://${ID}/privacy.html`);
const send = (t, p = {}) =>
  ui.evaluate(([a, b]) => chrome.runtime.sendMessage({ type: a, payload: b }).catch((e) => ({ err: String(e) })), [t, p]);

console.log('Kho dữ liệu ban đầu: template =',
  JSON.stringify((await sw.evaluate(() => chrome.storage.local.get('searchTemplate'))).searchTemplate));

console.log('\n--- Bấm "Quét e-GP ngay" khi CHƯA có bộ lọc ---');
console.log('START_SCAN ->', JSON.stringify(await send('START_SCAN', { mode: 'manual' })));

for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const st = await sw.evaluate(() => chrome.storage.local.get(['activeRun', 'runs', 'tenders']));
  const run = st.activeRun || (st.runs || [])[0];
  const urls = ctx.pages().map((p) => p.url()).filter((u) => u.includes('muasamcong'));
  process.stdout.write(`\r  ${i * 3}s | gói=${(st.tenders || []).length} | ${run ? run.status + ' — ' + String(run.message).slice(0, 62) : '?'} | tab e-GP: ${urls[0] || 'chưa mở'}   `);
  if (!st.activeRun && i > 1) break;
}
console.log('\n');

const st = await sw.evaluate(() => chrome.storage.local.get(['runs', 'tenders']));
const run = (st.runs || [])[0];
console.log('KẾT QUẢ  :', run ? `${run.status} — ${run.message}` : '(không có lượt quét)');
console.log('Số gói   :', (st.tenders || []).length);
console.log('Tab e-GP :', ctx.pages().map((p) => p.url()).filter((u) => u.includes('muasamcong')).join('\n           ') || '(không mở tab nào)');

await ctx.close();
fs.rmSync(UD, { recursive: true, force: true });
