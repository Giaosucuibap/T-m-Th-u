/* ============================================================================
 *  KỊCH BẢN: "Gói đang chờ kết quả" — quét biên bản mở thầu
 *
 *  Tái hiện đúng màn hình người dùng chụp lỗi:
 *      Mở thầu trong khoảng 7 ngày · Xây lắp · Tỉnh Lâm Đồng · Bắt đầu quét
 *      → "e-GP chưa trả dữ liệu cho lượt tra cứu. Hãy thử lại sau ít phút."
 *
 *  Chạy NHIỀU LƯỢT liên tiếp trên cùng một trình duyệt, vì lỗi cần bắt là lỗi
 *  CHẬP CHỜN: chạy một lượt mà đạt thì chưa chứng minh được gì.
 *
 *  node tools/test/bidopen-scan.mjs <thư-mục-tiện-ích> [số-lượt]
 *  Cần máy chủ giả lập đang chạy (MOCK_PORT, mặc định 9443). Chế độ "khó tính"
 *  bật ở phía máy chủ bằng MOCK_CHAOS — xem mock-egp.mjs.
 * ========================================================================== */
import { chromium } from 'playwright';
import fs from 'node:fs';

const EXT = process.argv[2];
const RUNS = Number(process.argv[3] || 3);
const PORT = process.env.MOCK_PORT || 9443;
const UD = fs.mkdtempSync('/tmp/ud-');

const ctx = await chromium.launchPersistentContext(UD, {
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox',
    '--disable-dev-shm-usage', '--no-first-run', '--no-proxy-server', '--ignore-certificate-errors',
    `--host-resolver-rules=MAP muasamcong.mpi.gov.vn 127.0.0.1:${PORT}`]
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const ID = new URL(sw.url()).host;

const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`chrome-extension://${ID}/bidopen.html`);
await page.waitForTimeout(1200);

const send = (type, payload = {}) => page.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [type, payload]);

const ketQua = [];
for (let lan = 1; lan <= RUNS; lan++) {
  /* Mỗi lượt phải đi qua ĐÚNG cuộc đua cần bắt: đóng mọi tab e-GP để tiện ích
     mở tab mới (trang tự tải danh sách mặc định), và đổi khoảng ngày để không
     trúng bộ nhớ đệm 2 phút — trúng đệm thì e-GP không hề được hỏi. */
  for (const p of ctx.pages()) if (/muasamcong/.test(p.url())) await p.close().catch(() => {});
  await page.waitForTimeout(300);
  const t0 = Date.now();
  /* Đổi TỈNH và LĨNH VỰC mỗi lượt. Chỉ đổi số ngày là KHÔNG đủ: khoá bộ nhớ
     đệm không đổi theo nó, và lần chạy đầu của kịch bản này đã "đạt 10/10"
     trong khi 9 lượt trúng đệm, e-GP không hề được hỏi. */
  const TINH = ['Tỉnh Lâm Đồng', 'Tỉnh Đồng Nai', 'Tỉnh Khánh Hòa', 'Tỉnh Đắk Lắk', 'Tỉnh Gia Lai', 'Tỉnh Quảng Ngãi', 'Thành phố Cần Thơ'];
  const LINH_VUC = ['XL', 'TV', 'HH', 'PTV'];
  const start = await send('BID_OPEN_SCAN', { query: '', taxCode: '', days: 6 + lan, fromDate: '', toDate: '',
    field: LINH_VUC[Math.floor((lan - 1) / TINH.length) % LINH_VUC.length], province: TINH[(lan - 1) % TINH.length], investor: '', keyword: '', minPrice: 0, maxPrice: 0, maxPackages: 20, focusTab: false });
  if (!start?.ok) { ketQua.push({ lan, trangThai: 'KHÔNG KHỞI ĐỘNG', thongBao: start?.message, giay: 0 }); continue; }

  let scan = null;
  for (let i = 0; i < 180; i++) {               // tối đa 90 giây mỗi lượt
    await page.waitForTimeout(500);
    const r = await send('GET_BID_OPEN_STATE');
    scan = r?.scan;
    // Lỗi cần bắt nằm ở giai đoạn LẤY DANH SÁCH. Qua được tới SCANNING (đọc
    // từng biên bản) là giai đoạn đó đã xong; bản giả lập không dựng đủ trang
    // chi tiết biên bản nên không chờ tiếp.
    if (scan && !['STARTING', 'OPENING', 'RUNNING', 'LISTING'].includes(scan.status)) break;
  }
  if (scan?.status === 'SCANNING') {
    await send('CANCEL_BID_OPEN_SCAN');
    for (let i = 0; i < 40; i++) { await page.waitForTimeout(250); const r = await send('GET_BID_OPEN_STATE');
      if (!['STARTING', 'OPENING', 'RUNNING', 'LISTING', 'SCANNING'].includes(r?.scan?.status)) break; }
    scan = { ...scan, status: 'LISTED' };
  }
  const giay = ((Date.now() - t0) / 1000).toFixed(1);
  ketQua.push({ lan, trangThai: scan?.status || '(không rõ)', thongBao: String(scan?.message || '').slice(0, 150),
    goi: (scan?.packages || scan?.rows || []).length ?? '', giay });
  console.log(`  lượt ${lan}: ${scan?.status} sau ${giay}s — ${String(scan?.message || '').slice(0, 110)}`);
  await page.waitForTimeout(800);
}

const hong = ketQua.filter((k) => !['SUCCESS', 'PARTIAL', 'LISTED'].includes(k.trangThai)
  || /chưa trả dữ liệu|không giao được|không mở được/i.test(k.thongBao));
console.log(`\nĐẠT ${RUNS - hong.length}/${RUNS} lượt`);
/* TỰ KIỂM: lượt "đạt" có thật sự hỏi e-GP không? Đếm trong nhật ký máy chủ
   giả lập số yêu cầu trang 0 MANG TIÊU CHÍ. Ít hơn số lượt đạt nghĩa là có
   lượt trúng bộ nhớ đệm — kết quả đạt đó không chứng minh được gì. */
let hoiThat = null;
if (process.env.MOCK_LOG && fs.existsSync(process.env.MOCK_LOG)) {
  hoiThat = fs.readFileSync(process.env.MOCK_LOG, 'utf8').split('\n')
    .filter((l) => /SEARCH page=0 /.test(l) && /filters=type/.test(l)).length;
  console.log(`e-GP thật sự được hỏi: ${hoiThat}/${RUNS - hong.length} lượt đạt`);
  if (hoiThat < RUNS - hong.length) console.log('  ✗ CÓ LƯỢT TRÚNG BỘ NHỚ ĐỆM — kết quả đạt không có giá trị chứng minh');
}
for (const k of hong) console.log(`  ✗ lượt ${k.lan}: ${k.trangThai} — ${k.thongBao}`);
if (pageErrors.length) console.log('LỖI TRANG:', [...new Set(pageErrors)].join(' | '));
await ctx.close();
fs.rmSync(UD, { recursive: true, force: true });
process.exit(hong.length || (hoiThat !== null && hoiThat < RUNS - hong.length) ? 1 : 0);
