/* Toàn trình TRA KẾ HOẠCH LỰA CHỌN NHÀ THẦU trên e-GP giả lập.
 *
 * Máy chủ giả lập cố tình BỎ QUA bộ lọc thời gian — đúng như e-GP thật bỏ qua
 * lặng lẽ bộ lọc nó không hiểu. Nên nếu kết quả sạch bóng kế hoạch năm cũ thì
 * công đầu thuộc về lớp lọc lại TẠI CHỖ, chứ không phải bộ lọc gửi lên. */
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
    `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
    `--host-resolver-rules=MAP muasamcong.mpi.gov.vn 127.0.0.1:${PORT}`,
    '--ignore-certificate-errors', '--no-proxy-server',
    '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run'
  ]
});

const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
sw.on('console', (m) => { if (m.type() === 'error') errors.push('[SW] ' + m.text()); });
const ID = new URL(sw.url()).host;

const ui = await ctx.newPage();
ui.on('pageerror', (e) => errors.push('[ui] ' + e.message));
await ui.goto(`chrome-extension://${ID}/privacy.html`);
const send = (type, payload = {}) =>
  ui.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }).catch((e) => ({ err: String(e) })), [type, payload]);

async function chay(nhan, payload) {
  await send('CLEAR_PLAN_LOOKUP');
  const res = await send('PLAN_LOOKUP', payload);
  if (!res || res.ok !== true) { console.log(`${nhan}: KHÔNG CHẠY -> ${JSON.stringify(res)}`); return null; }
  let job = null;
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    job = (await sw.evaluate(() => chrome.storage.local.get('planLookup'))).planLookup;
    if (job && job.status !== 'RUNNING') break;
  }
  const plans = (job && job.plans) || [];
  const nam = {};
  for (const p of plans) {
    const d = p.decisionDate || p.publicDate || '';
    nam[String(d).slice(0, 4) || '?'] = (nam[String(d).slice(0, 4) || '?'] || 0) + 1;
  }
  console.log(`\n${nhan}`);
  console.log(`  trạng thái   : ${job ? job.status : '(không có)'}`);
  console.log(`  máy chủ trả  : ${job ? job.serverCount : '?'}`);
  console.log(`  giữ lại      : ${plans.length}`);
  console.log(`  loại vì ngày : ${job ? (job.dateDropped || 0) : '?'}`);
  console.log(`  theo năm     : ${JSON.stringify(nam)}`);
  console.log(`  thông báo    : ${job ? String(job.message).slice(0, 120) : ''}`);
  return { job, plans, nam };
}

console.log('=== TRA KẾ HOẠCH LỰA CHỌN NHÀ THẦU ===');

const khong = await chay('A. Không giới hạn thời gian (như bản cũ)', { province: 'Lâm Đồng', days: 0 });
const loc = await chay('B. Chỉ kế hoạch phê duyệt từ 01/06/2026 đến 03/09/2026',
  { province: 'Lâm Đồng', fromDate: '2026-06-01', toDate: '2026-09-02', days: 0 });
const ba = await chay('C. 3 tháng gần đây (mặc định của màn hình)', { province: 'Lâm Đồng', days: 90 });

console.log('\n=== SOÁT LẠI ===');
const ok = [];
const hong = [];
(khong && khong.nam['2025'] ? ok : hong).push('A: không lọc thì kế hoạch 2025 CÓ lẫn vào (đúng triệu chứng người dùng gặp)');
(loc && !loc.nam['2025'] ? ok : hong).push('B: lọc theo khoảng ngày thì KHÔNG còn kế hoạch 2025 nào');
(loc && loc.plans.length && loc.plans.length < (khong ? khong.plans.length : 0) ? ok : hong)
  .push('B: có giữ lại kết quả, và ít hơn khi không lọc');
(loc && loc.job && loc.job.dateDropped > 0 ? ok : hong).push('B: có đếm và báo số kế hoạch bị loại vì ngày');
(ba && !ba.nam['2025'] ? ok : hong).push('C: mốc 3 tháng cũng loại sạch kế hoạch 2025');

for (const d of ok) console.log('  ĐẠT     ', d);
for (const d of hong) console.log('  KHÔNG ĐẠT', d);

console.log('\nLỖI (' + [...new Set(errors)].length + ')');
for (const e of [...new Set(errors)]) console.log(' ', e);

await ctx.close();
fs.rmSync(UD, { recursive: true, force: true });
process.exit(hong.length ? 1 : 0);
