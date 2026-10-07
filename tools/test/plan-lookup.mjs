/* ============================================================================
 *  KỊCH BẢN: "Kế hoạch lựa chọn nhà thầu" — nhiều lượt lạnh liên tiếp
 *
 *  Đo GIAI ĐOẠN LẤY DANH SÁCH (đúng chỗ lỗi "e-GP chưa trả dữ liệu cho lượt tra
 *  cứu" xuất hiện). Bản giả lập không dựng trang chi tiết kế hoạch, nên khi
 *  danh sách đã lấy xong và chuyển sang đọc chi tiết thì coi giai đoạn danh
 *  sách là đạt và dừng lượt.
 *
 *  node tools/test/plan-lookup.mjs <thư-mục-tiện-ích> [số-lượt]
 * ========================================================================== */
import { chromium } from 'playwright';
import fs from 'node:fs';

const EXT = process.argv[2], RUNS = Number(process.argv[3] || 3), PORT = process.env.MOCK_PORT || 9443;
const UD = fs.mkdtempSync('/tmp/ud-');
const ctx = await chromium.launchPersistentContext(UD, { headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run',
    '--no-proxy-server', '--ignore-certificate-errors', `--host-resolver-rules=MAP muasamcong.mpi.gov.vn 127.0.0.1:${PORT}`] });
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const ID = new URL(sw.url()).host;
const page = await ctx.newPage();
await page.goto(`chrome-extension://${ID}/plans.html`);
await page.waitForTimeout(1200);
const send = (type, payload = {}) => page.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [type, payload]);

const TINH = ['Lâm Đồng', 'Đồng Nai', 'Khánh Hòa', 'Đắk Lắk', 'Gia Lai', 'Quảng Ngãi', 'Cần Thơ'];
const LOAI = ['', 'XL', 'TV'];
const ketQua = [];
for (let lan = 1; lan <= RUNS; lan++) {
  for (const p of ctx.pages()) if (/muasamcong/.test(p.url())) await p.close().catch(() => {});
  await send('CANCEL_PLAN_LOOKUP').catch(() => {});
  await send('CLEAR_PLAN_LOOKUP').catch(() => {});
  await page.waitForTimeout(300);
  const t0 = Date.now();
  const payload = { investor: '', province: TINH[(lan - 1) % TINH.length], ward: '', keyword: '',
    category: LOAI[Math.floor((lan - 1) / TINH.length) % LOAI.length], days: 90, fromDate: '', toDate: '' };
  const start = await send('PLAN_LOOKUP', payload);
  if (!start?.ok) { ketQua.push({ lan, status: 'KHÔNG KHỞI ĐỘNG', message: start?.message }); console.log(`  lượt ${lan}: KHÔNG KHỞI ĐỘNG — ${start?.message}`); continue; }
  let lk = null;
  for (let i = 0; i < 180; i++) {
    await page.waitForTimeout(500);
    const r = await send('GET_PLAN_STATE', {});
    lk = r?.lookup || null;
    if (!lk) continue;
    // Danh sách đã lấy xong (đang sang đọc chi tiết) hoặc đã kết thúc.
    if (lk.listFinished || !['STARTING', 'OPENING', 'RUNNING', 'LISTING'].includes(lk.status)) break;
  }
  const giay = ((Date.now() - t0) / 1000).toFixed(1);
  const listedOk = Boolean(lk?.listFinished) && !lk?.cancelled;
  const status = listedOk && ['RUNNING', 'LISTING', 'DETAILS', 'SCANNING'].includes(lk.status) ? 'LISTED' : (lk?.status || '(không rõ)');
  const message = String(lk?.message || '').slice(0, 140);
  ketQua.push({ lan, status, message });
  console.log(`  lượt ${lan}: ${status} sau ${giay}s — ${payload.province}/${payload.category || 'mọi loại'} — ${message}`);
}
await send('CANCEL_PLAN_LOOKUP').catch(() => {});
const hong = ketQua.filter((k) => !['SUCCESS', 'LISTED', 'PARTIAL'].includes(k.status) || /chưa trả dữ liệu|không giao được|bỏ qua thao tác/i.test(k.message));
console.log(`\nĐẠT ${RUNS - hong.length}/${RUNS} lượt (giai đoạn lấy danh sách)`);
for (const k of hong) console.log(`  ✗ lượt ${k.lan}: ${k.status} — ${k.message}`);
let hoiThat = null;
if (process.env.MOCK_LOG && fs.existsSync(process.env.MOCK_LOG)) {
  hoiThat = fs.readFileSync(process.env.MOCK_LOG, 'utf8').split('\n').filter((l) => /SEARCH page=0 /.test(l) && /filters=type/.test(l)).length;
  console.log(`e-GP thật sự được hỏi: ${hoiThat}/${RUNS - hong.length} lượt đạt`);
}
await ctx.close();
fs.rmSync(UD, { recursive: true, force: true });
process.exit(hong.length || (hoiThat !== null && hoiThat < RUNS - hong.length) ? 1 : 0);
