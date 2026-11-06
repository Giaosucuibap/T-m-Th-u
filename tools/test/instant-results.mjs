/* ============================================================================
 *  KỊCH BẢN: kết quả tức thì từ kho + Tìm nhanh (Ctrl K) — 4.18.0
 *
 *  MOCK_CHAOS=autoload,nativeslow=3000,slow=2500 node tools/test/instant-results.mjs <ext> [--cu]
 *
 *  1. Lượt 1 trên giao diện thật: Lâm Đồng, mọi loại gói — để kho có dữ liệu.
 *  2. Lượt 2, TIÊU CHÍ KHÁC (từ khóa "trạm bơm" — gửi tới e-GP nên không trúng
 *     bộ nhớ đệm): đo thời gian từ lúc bấm "Tìm gói
 *     thầu" tới khi thẻ gói ĐẦU TIÊN hiện trên màn hình.
 *       • 4.18.0: phải hiện ngay từ kho, kèm dải "Kết quả tức thì từ kho", nút
 *         Xuất Excel bị khoá; khi e-GP trả về thì thay bằng dữ liệu mới, dải biến
 *         mất, Excel mở lại.
 *       • --cu (bản cũ, chỉ đo): thẻ đầu tiên chỉ hiện khi e-GP trả trang đầu.
 *  3. Ctrl K: gõ đúng mã TBMT có trong kho → mục "Đúng mã"; gõ chữ → gói khớp.
 *  Cần MOCK_LOG để xác nhận lượt 2 thật sự hỏi e-GP.
 * ========================================================================== */
import { chromium } from 'playwright';
import fs from 'node:fs';

const EXT = process.argv[2];
const CU = process.argv.includes('--cu');
const PORT = process.env.MOCK_PORT || 9443;
const UD = fs.mkdtempSync('/tmp/ud-');
const ctx = await chromium.launchPersistentContext(UD, {
  headless: false, viewport: { width: 1366, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--disable-dev-shm-usage',
    '--no-first-run', '--no-proxy-server', '--ignore-certificate-errors',
    `--host-resolver-rules=MAP muasamcong.mof.gov.vn 127.0.0.1:${PORT}, MAP muasamcong.mpi.gov.vn 127.0.0.1:${PORT}`]
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const ID = new URL(sw.url()).host;
const page = await ctx.newPage();
await page.goto(`chrome-extension://${ID}/search.html`);
await page.waitForTimeout(1500);
const loi = [];
const can = (dk, msg) => { if (!dk) loi.push(msg); console.log(`  ${dk ? '✓' : '✗'} ${msg}`); };
const egpTabs = () => ctx.pages().filter((p) => /muasamcong/.test(p.url()));

async function datTieuChi({ keyword = '', must = '' }) {
  await page.bringToFront();
  await page.fill('#keyword', keyword);
  await page.fill('#investor', '');
  await page.fill('#province', 'Lâm Đồng');
  await page.fill('#ward', '').catch(() => {});
  await page.selectOption('#category', '');
  await page.fill('#mustKeywords', must);
  await page.fill('#excludeKeywords', '');
  await page.fill('#minPrice', ''); await page.fill('#maxPrice', '');
}
async function choXong(ms = 120000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    await page.waitForTimeout(250);
    const xong = await page.evaluate(() => document.getElementById('progress').classList.contains('hidden') && !document.getElementById('go').disabled);
    if (xong) return true;
  }
  return false;
}

console.log('Lượt 1 (nạp kho):');
await datTieuChi({});
await page.click('#go');
can(await choXong(), 'lượt 1 xong');
for (const p of egpTabs()) await p.close().catch(() => {});
await page.waitForTimeout(800);
const kho = await page.evaluate(() => document.querySelectorAll('#list .ws-result').length);
console.log(`  kho có dữ liệu: ${kho} thẻ ở trang đầu kết quả lượt 1`);

console.log('Lượt 2 (tiêu chí khác: Lâm Đồng + từ khóa "trạm bơm"):');
await datTieuChi({ keyword: 'trạm bơm' });
const truoc = fs.existsSync(process.env.MOCK_LOG || '') ? fs.readFileSync(process.env.MOCK_LOG, 'utf8').split('\n').length : 0;
const t0 = Date.now();
await page.click('#go');
/* Thẻ của lượt 1 còn trên màn hình cho tới khi lượt 2 bắt đầu vẽ lại. Chỉ tính
   thẻ của LƯỢT 2: hoặc danh sách chuyển sang chế độ "từ kho", hoặc danh sách
   trống đi (lượt mới chưa có dữ liệu) rồi mới có thẻ trở lại. */
let tDau = null, thayKho = false, excelKhoa = null, nhanKho = '', daTrong = false;
while (Date.now() - t0 < 120000) {
  const s = await page.evaluate(() => ({ cards: document.querySelectorAll('#list .ws-result').length,
    store: document.getElementById('list').classList.contains('from-store'),
    strip: document.getElementById('baseline-strip')?.textContent || '',
    stripOn: !document.getElementById('baseline-strip')?.classList.contains('hidden'),
    csv: document.getElementById('csv').disabled }));
  if (s.cards === 0) daTrong = true;
  if (s.cards > 0 && (s.store || daTrong)) { tDau = Date.now() - t0; thayKho = s.store; excelKhoa = s.csv; nhanKho = s.stripOn ? s.strip : ''; break; }
  await page.waitForTimeout(40);
}
console.log(`  thẻ gói đầu tiên hiện sau ${tDau === null ? 'KHÔNG HIỆN' : (tDau / 1000).toFixed(2) + ' giây'}${thayKho ? ' (từ kho trên máy)' : ' (từ e-GP)'}`);
const xong2 = await choXong();
const tXong = Date.now() - t0;
const cuoi = await page.evaluate(() => ({ cards: document.querySelectorAll('#list .ws-result').length,
  store: document.getElementById('list').classList.contains('from-store'),
  stripText: document.getElementById('baseline-strip')?.classList.contains('hidden') ? '' : document.getElementById('baseline-strip').textContent,
  csv: document.getElementById('csv').disabled }));
console.log(`  e-GP trả xong sau ${(tXong / 1000).toFixed(2)} giây — ${cuoi.cards} thẻ`);
const sau = fs.existsSync(process.env.MOCK_LOG || '') ? fs.readFileSync(process.env.MOCK_LOG, 'utf8').split('\n').slice(truoc - 1) : [];
can(sau.some((l) => /SEARCH page=0 /.test(l) && /filters=type/.test(l)), 'lượt 2 thật sự hỏi e-GP (không trúng bộ nhớ đệm)');
can(xong2, 'lượt 2 xong');
if (!CU) {
  can(tDau !== null && tDau < 1500, `thẻ đầu tiên hiện dưới 1,5 giây (đo được ${tDau === null ? '—' : (tDau / 1000).toFixed(2) + 's'})`);
  can(thayKho && /Kết quả tức thì từ kho/.test(nhanKho), 'lúc chờ: thẻ lấy từ kho, có dải "Kết quả tức thì từ kho" ghi rõ có thể cũ');
  can(excelKhoa === true, 'lúc chờ: nút Xuất Excel bị khoá (không xuất dữ liệu tạm)');
  can(!cuoi.store && !/tức thì/.test(cuoi.stripText) && cuoi.cards > 0, 'khi e-GP trả về: thay bằng dữ liệu mới, dải tạm biến mất');
  can(cuoi.csv === false, 'khi e-GP trả về: Xuất Excel mở lại');

  console.log('Tìm nhanh (Ctrl K):');
  const ma = await page.evaluate(() => document.querySelector('#list .ws-result .code')?.textContent?.trim()?.split('-')[0] || '');
  await page.keyboard.press('Control+k');
  await page.waitForSelector('.qf-panel', { timeout: 3000 }).catch(() => {});
  can(await page.$('.qf-panel') !== null, 'Ctrl K mở hộp Tìm nhanh');
  await page.fill('.qf-q', ma);
  await page.waitForTimeout(600);
  const kq = await page.evaluate(() => [...document.querySelectorAll('.qf-group')].map((g) => g.textContent));
  console.log(`  gõ "${ma}" → ${kq.join(' | ')}`);
  can(/^IB\d{10}$/.test(ma) && kq.some((g) => /Đúng mã/.test(g)) && kq.some((g) => /Tra trực tiếp trên e-GP/.test(g)), 'gõ đúng mã TBMT: có mục "Đúng mã" trong kho và lệnh tra e-GP');
  await page.fill('.qf-q', 'tram bom');
  await page.waitForTimeout(600);
  const chu = await page.evaluate(() => ({ g: [...document.querySelectorAll('.qf-group')].map((x) => x.textContent), n: document.querySelectorAll('.qf-item').length }));
  console.log(`  gõ "tram bom" (không dấu) → ${chu.g.join(' | ')}`);
  can(chu.g.some((g) => /Gói trong kho/.test(g)) && chu.n > 0, 'gõ chữ không dấu: tìm ra gói trong kho');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  can(await page.$('.qf-panel') === null, 'Esc đóng hộp Tìm nhanh');
}
console.log(loi.length ? `\nHỎNG: ${loi.length} điều kiện` : `\nĐẠT — thẻ đầu tiên sau ${(tDau / 1000).toFixed(2)}s, e-GP xong sau ${(tXong / 1000).toFixed(2)}s`);
await ctx.close();
fs.rmSync(UD, { recursive: true, force: true });
process.exit(loi.length ? 1 : 0);
