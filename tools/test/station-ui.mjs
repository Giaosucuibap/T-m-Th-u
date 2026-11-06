/* ============================================================================
 *  KỊCH BẢN: ô "Trạm săn" ở trang Bộ săn (4.19.0) trên Chromium thật
 *
 *  Kiểm điều bài kiểm thử đơn vị không kiểm được:
 *    - Chromium CHẤP NHẬN "background" là quyền tuỳ chọn (nếu không, mọi lệnh
 *      chrome.permissions.contains/request về quyền này sẽ ném lỗi);
 *    - service worker trả STATION_STATUS, trang hiện trạng thái và dòng giờ săn
 *      đúng với bộ săn vừa lưu (06:05, 13:05 → đánh thức 06:02, 13:02);
 *    - nhịp tim đã được ghi khi tiện ích khởi động.
 *
 *  node tools/test/station-ui.mjs <thư-mục-tiện-ích>
 * ========================================================================== */
import { chromium } from 'playwright';
import fs from 'node:fs';

const EXT = process.argv[2], PORT = process.env.MOCK_PORT || 9443;
const UD = fs.mkdtempSync('/tmp/ud-');
const ctx = await chromium.launchPersistentContext(UD, { headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run',
    '--no-proxy-server', '--ignore-certificate-errors', `--host-resolver-rules=MAP muasamcong.mof.gov.vn 127.0.0.1:${PORT}, MAP muasamcong.mpi.gov.vn 127.0.0.1:${PORT}`] });
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const ID = new URL(sw.url()).host;
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`chrome-extension://${ID}/hunts.html`);
await page.waitForSelector('#station-status');
const loi = [];
const perm = await page.evaluate(async () => {
  try { return { ok: true, granted: await chrome.permissions.contains({ permissions: ['background'] }), optional: chrome.runtime.getManifest().optional_permissions }; }
  catch (e) { return { ok: false, message: String(e.message || e) }; }
});
console.log('Quyền chạy nền:', JSON.stringify(perm));
if (!perm.ok) loi.push(`Chromium không nhận "background" là quyền tuỳ chọn: ${perm.message}`);
else if (perm.granted) loi.push('quyền chạy nền đang BẬT sẵn — phải là tuỳ chọn người dùng tự bật');
const send = (type, payload = {}) => page.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [type, payload]);
const saved = await send('SAVE_HUNT', { name: 'Thủy lợi Lâm Đồng', kind: 'tbmt', enabled: true, telegram: false, times: '06:05, 13:05', criteria: { province: 'Lâm Đồng', keyword: 'kênh' } });
if (!saved?.ok) loi.push(`không lưu được bộ săn: ${saved?.message}`);
await page.reload();
await page.waitForFunction(() => !/Đang đọc/.test(document.getElementById('station-status').textContent), null, { timeout: 15000 });
const ui = await page.evaluate(() => ({ status: document.getElementById('station-status').innerText, wake: document.getElementById('wake-line').innerText,
  note: document.getElementById('wake-note').innerText, bg: document.getElementById('bg-state').innerText, btn: document.getElementById('bg-toggle').innerText }));
console.log(JSON.stringify(ui, null, 1));
const st = await send('STATION_STATUS');
if (ui.wake.trim() !== '06:05,13:05') loi.push(`dòng giờ săn "${ui.wake}" ≠ "06:05,13:05"`);
if (!/06:02, 13:02/.test(ui.note)) loi.push(`giờ đánh thức sai: ${ui.note}`);
if (!st?.station?.lastAliveAt) loi.push('chưa ghi nhịp tim khi tiện ích khởi động');
if (!/Hoạt động gần nhất/.test(ui.status)) loi.push('ô trạng thái không hiện nhịp hoạt động');
if (ui.btn !== 'Bật chạy nền') loi.push(`nút chạy nền ghi "${ui.btn}"`);
// Trang hiện dải cảnh báo khi bộ săn lỗi (đọc EGP_HEALTH).
const health = await send('EGP_HEALTH');
if (!health?.ok || health.red) loi.push(`EGP_HEALTH bất thường: ${JSON.stringify(health)}`);
if (errors.length) loi.push(`lỗi trang: ${errors.join(' | ')}`);
await ctx.close();
if (loi.length) { console.log(`\nKHÔNG ĐẠT:\n- ${loi.join('\n- ')}`); process.exit(1); }
console.log('\nĐẠT: Chromium nhận quyền chạy nền tuỳ chọn; trạm săn hiện đúng giờ săn, giờ đánh thức và nhịp tim.');
