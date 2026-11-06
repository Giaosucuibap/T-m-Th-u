/* ============================================================================
 *  KỊCH BẢN: Kho lịch sử (4.19.0) trên Chromium thật + e-GP giả lập
 *
 *  Lập kế hoạch 2 tháng (chạy ngay), bấm "Chạy lượt kế tiếp ngay" như người
 *  dùng, chờ lượt soi biên bản (chế độ gói đã có kết quả) xong, rồi kiểm:
 *    - lượt do kho chạy mang nhãn "Kho lịch sử · Tháng …" ở trang Mở thầu;
 *    - bảng độ phủ ghi kết quả thật của từng tháng, hàng đợi tiến lên;
 *    - người dùng chen một lượt soi biên bản riêng → mục đang nạp được đánh dấu
 *      bị gián đoạn để thử lại, không ghi đè kết quả người dùng.
 *
 *  node tools/test/history.mjs <thư-mục-tiện-ích>
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
page.on('dialog', (d) => d.accept());
await page.goto(`chrome-extension://${ID}/analytics.html`);
await page.click('.tab[data-t="history"]');
await page.waitForFunction(() => !/Đang đọc/.test(document.getElementById('h-archive').textContent));
const send = (type, payload = {}) => page.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [type, payload]);
const loi = [];
await page.fill('#hMonths', '2'); await page.selectOption('#hSchedule', 'now'); await page.uncheck('#hWatched');
await page.click('#hStart');
await page.waitForFunction(() => document.querySelectorAll('#h-table tbody tr').length === 2, null, { timeout: 10000 });
async function waitScan(ms = 240000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const s = (await send('GET_BID_OPEN_STATE'))?.scan;
    if (s && !['STARTING', 'OPENING', 'RUNNING', 'LISTING', 'SCANNING'].includes(s.status)) return s;
    await page.waitForTimeout(1000);
  }
  return null;
}
await page.click('#hTick');
await page.waitForTimeout(1500);
const first = (await send('GET_BID_OPEN_STATE'))?.scan;
console.log('Lượt 1:', first?.status, '·', first?.message);
if (first?.origin !== 'history' || !/^Tháng \d{2}\/\d{4}$/.test(first?.historyLabel || '')) loi.push(`lượt do kho chạy không mang nhãn: ${first?.origin} ${first?.historyLabel}`);
// Trang Mở thầu phải hiện nhãn — người dùng mở trang sáng hôm sau không hiểu nhầm là lượt mình bấm.
const bo = await ctx.newPage();
await bo.goto(`chrome-extension://${ID}/bidopen.html`);
await bo.waitForTimeout(2500);
const label = await bo.evaluate(() => `${document.getElementById('progress-text')?.textContent || ''} ${document.getElementById('result-status')?.textContent || ''}`);
if (!/Kho lịch sử/.test(label)) loi.push(`trang Mở thầu không ghi nhãn Kho lịch sử: "${label.slice(0, 160)}"`);
await bo.close();
if (first?.mode !== 'loss') loi.push(`lượt kho phải đọc gói ĐÃ CÓ KẾT QUẢ (mode loss), đang là ${first?.mode}`);
const done1 = await waitScan();
console.log('Lượt 1 xong:', done1?.status, '·', String(done1?.message || '').slice(0, 160));
await page.click('#hTick');
await page.waitForTimeout(1500);
let st = await send('HISTORY_STATUS');
const it0 = st.state.items[0], it1 = st.state.items[1];
console.log('Mục 1:', it0.status, JSON.stringify(it0.outcome));
console.log('Mục 2:', it1.status);
if (it0.status !== 'done' && it0.status !== 'error') loi.push(`mục 1 chưa được ghi kết quả (${it0.status})`);
if (!it0.outcome || typeof it0.outcome.packages !== 'number') loi.push('mục 1 không có số liệu độ phủ');
if (it1.status !== 'running') loi.push(`mục 2 chưa bắt đầu (${it1.status})`);
// Người dùng chen lượt riêng: dừng lượt kho, bấm soi biên bản của mình.
await send('CANCEL_BID_OPEN_SCAN');
await page.waitForTimeout(1500);
const own = await send('BID_OPEN_SCAN', { query: '', taxCode: '', days: 9, fromDate: '', toDate: '', field: 'XL', province: 'Tỉnh Lâm Đồng', investor: '', keyword: '', minPrice: 0, maxPrice: 0, maxPackages: 2, focusTab: false });
if (!own?.ok) loi.push(`không chạy được lượt riêng của người dùng: ${own?.message}`);
await page.click('#hTick');
await page.waitForTimeout(1000);
st = await send('HISTORY_STATUS');
console.log('Mục 2 sau khi người dùng chen:', st.state.items[1].status, '·', st.state.items[1].outcome?.note || '');
if (st.state.items[1].status !== 'interrupted') loi.push(`mục 2 phải bị đánh dấu gián đoạn để thử lại (đang là ${st.state.items[1].status})`);
const ownNow = (await send('GET_BID_OPEN_STATE'))?.scan;
if (ownNow?.origin === 'history') loi.push('kho lịch sử đã chạy đè lên lượt của người dùng');
const rows = await page.evaluate(() => [...document.querySelectorAll('#h-table tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ')));
for (const r of rows) console.log('  ', r);
if (errors.length) loi.push(`lỗi trang: ${errors.join(' | ')}`);
await send('HISTORY_PAUSE', { paused: true });
await ctx.close();
if (loi.length) { console.log(`\nKHÔNG ĐẠT:\n- ${loi.join('\n- ')}`); process.exit(1); }
console.log('\nĐẠT: kho lịch sử nạp từng tháng bằng luồng đọc biên bản thật, ghi độ phủ, nhường lượt của người dùng.');
