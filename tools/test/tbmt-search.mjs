/* ============================================================================
 *  KỊCH BẢN: "Tìm gói thầu" (TBMT) — nhiều lượt lạnh liên tiếp
 *
 *  Cùng cơ chế đọc danh sách với "Gói đang chờ kết quả", nên phải chịu được
 *  đúng các tình huống đã làm màn hình đó hỏng: trang e-GP tự tải danh sách
 *  mặc định khi mở, bỏ qua thao tác lúc bận, mạng rớt giữa chừng.
 *
 *  node tools/test/tbmt-search.mjs <thư-mục-tiện-ích> [số-lượt]
 *  Bật MOCK_LOG=<nhật ký máy chủ giả lập> để tự kiểm lượt nào thật sự hỏi e-GP.
 * ========================================================================== */
import { chromium } from 'playwright';
import fs from 'node:fs';

const EXT = process.argv[2];
const RUNS = Number(process.argv[3] || 3);
const PORT = process.env.MOCK_PORT || 9443;
const UD = fs.mkdtempSync('/tmp/ud-');
const ctx = await chromium.launchPersistentContext(UD, {
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--disable-dev-shm-usage',
    '--no-first-run', '--no-proxy-server', '--ignore-certificate-errors', `--host-resolver-rules=MAP muasamcong.mpi.gov.vn 127.0.0.1:${PORT}`]
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const ID = new URL(sw.url()).host;
const page = await ctx.newPage();
await page.goto(`chrome-extension://${ID}/search.html`);
await page.waitForTimeout(1200);
const send = (type, payload = {}) => page.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [type, payload]);

// Đổi TỈNH + LOẠI GÓI mỗi lượt để không trúng bộ nhớ đệm (xem bidopen-scan.mjs).
const TINH = ['Lâm Đồng', 'Đồng Nai', 'Khánh Hòa', 'Đắk Lắk', 'Gia Lai', 'Quảng Ngãi', 'Cần Thơ'];
const LOAI = ['', 'XL', 'TV', 'HH'];
const ketQua = [];
for (let lan = 1; lan <= RUNS; lan++) {
  for (const p of ctx.pages()) if (/muasamcong/.test(p.url())) await p.close().catch(() => {});
  await page.waitForTimeout(300);
  const t0 = Date.now();
  const criteria = { province: TINH[(lan - 1) % TINH.length], category: LOAI[Math.floor((lan - 1) / TINH.length) % LOAI.length],
    keyword: '', investor: '', ward: '', mustKeywords: '', excludeKeywords: '', minPrice: '', maxPrice: '', focusTab: false };
  const start = await send('TBMT_SEARCH', criteria);
  if (!start?.ok) { ketQua.push({ lan, status: 'KHÔNG KHỞI ĐỘNG', message: start?.message }); console.log(`  lượt ${lan}: KHÔNG KHỞI ĐỘNG — ${start?.message}`); continue; }
  let run = null;
  for (let i = 0; i < 180; i++) {
    await page.waitForTimeout(500);
    const r = await send('GET_SEARCH_STATE', { runId: start.runId });
    run = r?.selectedRun || (r?.runs || []).find((x) => x.id === start.runId) || null;
    if (run && !['STARTING', 'OPENING', 'RUNNING', 'LISTING'].includes(run.status) && !r?.activeRun) break;
  }
  const giay = ((Date.now() - t0) / 1000).toFixed(1);
  const message = String(run?.message || run?.statusText || run?.error || '').slice(0, 140);
  ketQua.push({ lan, status: run?.status || '(không rõ)', message });
  console.log(`  lượt ${lan}: ${run?.status} sau ${giay}s — ${criteria.province}/${criteria.category || 'mọi loại'} — ${message}`);
}
const hong = ketQua.filter((k) => !['SUCCESS', 'PARTIAL'].includes(k.status) || k.status === 'PARTIAL');
console.log(`\nĐẠT ${RUNS - hong.length}/${RUNS} lượt (chỉ tính SUCCESS; PARTIAL là chưa đầy đủ)`);
for (const k of hong) console.log(`  ✗ lượt ${k.lan}: ${k.status} — ${k.message}`);
let hoiThat = null;
if (process.env.MOCK_LOG && fs.existsSync(process.env.MOCK_LOG)) {
  hoiThat = fs.readFileSync(process.env.MOCK_LOG, 'utf8').split('\n').filter((l) => /SEARCH page=0 /.test(l) && /filters=type/.test(l)).length;
  console.log(`e-GP thật sự được hỏi: ${hoiThat}/${RUNS - hong.length} lượt đạt`);
}
// Sổ giai đoạn phải ghi ĐÚNG mỗi lượt một dòng, với giai đoạn khớp kết quả.
const so = await send('RUN_TRACE_SUMMARY');
const dong = (so?.recent || []).filter((r) => r.mode === 'tbmt' && !r.cached);
const sum = so?.summary || {};
if (process.env.DEBUG_TRACE) console.log(JSON.stringify(dong.slice(0, 2)));
const g = (v) => (v === null || v === undefined ? '—' : `${(v / 1000).toFixed(1)}s`);
console.log(`Sổ giai đoạn: ${sum.ok}/${sum.runs} lần chạy thành công · trung vị ${g(sum.p50)} · p95 ${g(sum.p95)} · trang đầu trung vị ${g(sum.firstPageP50)} · đọc lại ${sum.reReads} lần · tự chạy lại ${sum.autoRetries} (cứu được ${sum.recovered}) · lỗi theo giai đoạn ${JSON.stringify(sum.failures)}`);
const daDat = ketQua.filter((k) => k.status === 'SUCCESS').length;
// Mỗi lượt đúng MỘT dòng "lần 1"; lượt tự chạy lại có thêm một dòng "lần 2".
const soSai = dong.filter((r) => r.attempt === 1).length !== ketQua.filter((k) => k.status !== 'KHÔNG KHỞI ĐỘNG').length || sum.ok !== daDat
  || dong.some((r) => r.ok && !(r.totalMs > 0 && r.firstPageMs > 0 && r.pages > 0));
if (soSai) console.log(`  ✗ Sổ giai đoạn không khớp: ${dong.length} dòng, ${sum.ok} ok — kỳ vọng ${ketQua.length} dòng, ${daDat} ok`);
await ctx.close();
fs.rmSync(UD, { recursive: true, force: true });
process.exit(hong.length || soSai || (hoiThat !== null && hoiThat < RUNS - hong.length) ? 1 : 0);
