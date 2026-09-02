/* Đo thời gian đọc biên bản trên e-GP giả lập.
 *
 * Máy chủ giả lập cho MỘT PHẦN gói không phát request nhà thầu — đúng tình
 * huống thật. Trước khi sửa, mỗi gói như vậy làm vòng lặp nằm chết đủ 20 giây. */
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

console.log('--- Bắt đầu quét "Gói đang chờ kết quả" ---');
const t0 = Date.now();
console.log('BID_OPEN_SCAN ->', JSON.stringify(await send('BID_OPEN_SCAN', {
  days: 30, field: 'XL', maxPackages: 8, focusTab: false
})));

let last = '';
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 1500));
  const st = await sw.evaluate(() => chrome.storage.local.get('bidOpenScan'));
  const scan = st.bidOpenScan;
  if (!scan) continue;
  if (scan.message !== last) {
    console.log(`  ${String(((Date.now() - t0) / 1000).toFixed(1)).padStart(5)}s | ${scan.status} | ${scan.message}`);
    last = scan.message;
  }
  if (scan.status === 'SUCCESS' || scan.status === 'PARTIAL' || scan.status === 'ERROR') break;
}

const st = await sw.evaluate(() => chrome.storage.local.get('bidOpenScan'));
const scan = st.bidOpenScan || {};
const secs = (Date.now() - t0) / 1000;
const pkgs = scan.packages || [];
const by = {};
for (const p of pkgs) by[p.readState || 'PENDING'] = (by[p.readState || 'PENDING'] || 0) + 1;

console.log('\n=== KẾT QUẢ ===');
console.log('Tổng thời gian :', secs.toFixed(1), 'giây cho', pkgs.length, 'gói');
console.log('Trung bình     :', pkgs.length ? (secs / pkgs.length).toFixed(1) : '—', 'giây/gói');
console.log('Theo kết cục   :', JSON.stringify(by));
console.log('Thông báo cuối :', scan.message);

await ctx.close();
fs.rmSync(UD, { recursive: true, force: true });
