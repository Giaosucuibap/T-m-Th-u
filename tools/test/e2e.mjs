/* Chạy thử toàn trình: e-GP giả lập -> page-hook -> content.js -> background -> kho dữ liệu */
import { chromium } from 'playwright';
import fs from 'node:fs';

const EXT = process.argv[2] || new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const PORT = process.env.MOCK_PORT || 8443;
const UD = fs.mkdtempSync('/tmp/ud-');
const errors = [];

const ctx = await chromium.launchPersistentContext(UD, {
  
  headless: false,
  ignoreHTTPSErrors: true,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    `--host-resolver-rules=MAP muasamcong.mpi.gov.vn 127.0.0.1:${PORT}`,
    '--ignore-certificate-errors', '--no-proxy-server',
    '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run'
  ]
});

let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
sw.on('console', (m) => { if (m.type() === 'error') errors.push('[SW] ' + m.text()); });
const ID = new URL(sw.url()).host;
console.log('Extension ID:', ID);

const egp = await ctx.newPage();
egp.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error') errors.push('[e-GP] ' + t);
});
egp.on('pageerror', (e) => errors.push('[e-GP pageerror] ' + e.message));

console.log('\n--- 1. Mở trang e-GP, để người dùng "tìm kiếm" một lần ---');
await egp.goto('https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?render=search', { waitUntil: 'load' });
await egp.waitForTimeout(1200);
await egp.click('#btnSearch');
await egp.waitForTimeout(2500);

// Bộ lọc đã được quan sát chưa?
let st = await sw.evaluate(() => chrome.storage.local.get(null));
console.log('lastObservedTemplate:', st.lastObservedTemplate ? `CÓ (${st.lastObservedTemplate.method} ${st.lastObservedTemplate.candidateCount} bản ghi)` : 'KHÔNG');
console.log('tenders sau lần tìm đầu:', (st.tenders || []).length);

// chrome.runtime.sendMessage gọi từ chính service worker KHÔNG tự nhận được,
// nên dùng một trang tiện ích làm nơi phát lệnh — đúng như popup thật.
const ui = await ctx.newPage();
await ui.goto(`chrome-extension://${ID}/privacy.html`);
const send = (type, payload = {}) =>
  ui.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }).catch((e) => ({ err: String(e) })), [type, payload]);

console.log('\n--- 2. Lưu bộ lọc (như bấm nút trong popup) ---');
const saveRes = await send('SAVE_LAST_TEMPLATE');
console.log('SAVE_LAST_TEMPLATE ->', JSON.stringify(saveRes));

if (process.env.CAP) {
  await send('UPDATE_SETTINGS', { maxPagesHint: Number(process.env.CAP) });
  console.log('\n(đặt Số trang tối đa = ' + process.env.CAP + ' để thử cảnh báo cắt cụt)');
}
console.log('\n--- 3. Bấm "Quét & trích xuất" (phát lại bộ lọc, phân trang thật) ---');
const scanRes = await send('START_SCAN', { mode: 'manual' });
console.log('START_SCAN ->', JSON.stringify(scanRes));

for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  st = await sw.evaluate(() => chrome.storage.local.get(null));
  const run = st.activeRun;
  process.stdout.write(`\r   ...${(st.tenders || []).length} gói | ${run ? run.status + ' — ' + String(run.message).slice(0, 70) : 'xong'}      `);
  if (!run) break;
}
console.log('');

st = await sw.evaluate(() => chrome.storage.local.get(null));
const tenders = st.tenders || [];
const runs = st.runs || [];
console.log('\n=== KẾT QUẢ ===');
console.log('Tổng gói đã lưu :', tenders.length);
console.log('Lượt quét cuối  :', runs[0] ? `${runs[0].status} | captured=${runs[0].captured} new=${runs[0].newCount} matched=${runs[0].matchedCount} | ${runs[0].message}` : '(không có)');

const byStatus = {};
for (const t of tenders) byStatus[t.statusLabel || '?'] = (byStatus[t.statusLabel || '?'] || 0) + 1;
console.log('Theo trạng thái :', JSON.stringify(byStatus, null, 0));
console.log('Đạt ngưỡng      :', tenders.filter((t) => t.matched).length);
console.log('Điểm >= 85      :', tenders.filter((t) => t.score >= 85).length);

console.log('\nTop 5 theo điểm:');
for (const t of [...tenders].sort((a, b) => b.score - a.score).slice(0, 5)) {
  console.log(`  ${String(t.score).padStart(3)}đ ${(t.displayCode || '').padEnd(16)} ${t.statusLabel.padEnd(34)} ${String(t.bidName).slice(0, 60)}`);
  console.log(`       link: ${String(t.detailUrl).slice(0, 110)}`);
}

console.log('\n--- 4. Mở popup, kiểm tra hiển thị ---');
const popup = await ctx.newPage();
popup.on('pageerror', (e) => errors.push('[popup] ' + e.message));
popup.on('console', (m) => { if (m.type() === 'error') errors.push('[popup] ' + m.text()); });
await popup.goto(`chrome-extension://${ID}/popup.html`);
await popup.waitForTimeout(2500);
console.log('popup #count :', (await popup.textContent('#count')) || '(rỗng)');
console.log('popup #status:', (await popup.textContent('#status')) || '(rỗng)');
console.log('popup số thẻ :', await popup.evaluate(() => document.querySelectorAll('#list .tender').length));
await popup.screenshot({ path: '/tmp/shot-popup.png', fullPage: true });

const dash = await ctx.newPage();
dash.on('pageerror', (e) => errors.push('[dashboard] ' + e.message));
await dash.goto(`chrome-extension://${ID}/dashboard.html`);
await dash.waitForTimeout(2000);
console.log('dashboard tổng:', await dash.textContent('#total'), '| đạt ngưỡng:', await dash.textContent('#matched'));
await dash.screenshot({ path: '/tmp/shot-dashboard.png', fullPage: true });

console.log('\n--- 5. Xuất Excel ---');
const exp = await send('EXPORT_CSV');
console.log('EXPORT_CSV ->', JSON.stringify(exp).slice(0, 300));

console.log('\n================ LỖI (' + [...new Set(errors)].length + ') ================');
for (const e of [...new Set(errors)]) console.log(e);

await ctx.close();
fs.rmSync(UD, { recursive: true, force: true });
