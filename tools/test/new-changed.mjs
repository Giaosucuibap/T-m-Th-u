/* ============================================================================
 *  KỊCH BẢN GIAO DIỆN: hiện kết quả lượt trước ngay + nhãn Mới/Đổi
 *
 *  MOCK_CHAOS=autoload,mutable,slow=3000 node tools/test/new-changed.mjs <ext> [ảnh-chụp-thư-mục]
 *  1. Bấm "Tìm gói thầu" (Lâm Đồng) trên trang thật, chờ xong.
 *  2. e-GP giả lập: thêm 2 gói mới đăng, đổi giá 1 gói.
 *  3. Chờ hết hạn bộ nhớ đệm 2 phút, bấm tìm lại CÙNG tiêu chí.
 *  4. Trong lúc lượt mới chưa có dữ liệu: phải thấy kết quả lượt trước + dải "có thể đã cũ".
 *  5. Lượt mới xong: phải có đúng 2 nhãn "Mới", ≥1 nhãn "Đổi" có "Giá gói thầu".
 * ========================================================================== */
import { chromium } from 'playwright';
import fs from 'node:fs';
import https from 'node:https';

const EXT = process.argv[2];
const SHOTS = process.argv[3] || '';
const PORT = process.env.MOCK_PORT || 9443;
const WAIT_CACHE = Number(process.env.WAIT_CACHE_MS || 125_000);
const UD = fs.mkdtempSync('/tmp/ud-');
const ctx = await chromium.launchPersistentContext(UD, {
  headless: false, viewport: { width: 1360, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--disable-dev-shm-usage',
    '--no-first-run', '--no-proxy-server', '--ignore-certificate-errors', `--host-resolver-rules=MAP muasamcong.mpi.gov.vn 127.0.0.1:${PORT}`]
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const ID = new URL(sw.url()).host;
const page = await ctx.newPage();
await page.goto(`chrome-extension://${ID}/search.html`);
await page.waitForTimeout(1500);
const loi = [];
const can = (dk, msg) => { if (!dk) loi.push(msg); console.log(`  ${dk ? '✓' : '✗'} ${msg}`); };

async function tim() {
  await page.bringToFront();
  await page.fill('#province', 'Lâm Đồng');
  await page.selectOption('#category', '');
  await page.fill('#minPrice', ''); await page.fill('#maxPrice', '');
  await page.fill('#keyword', '').catch(() => {});
  await page.click('#go');
  await page.waitForTimeout(400);
  await page.bringToFront();
}
async function choXong() {
  for (let i = 0; i < 240; i++) {
    await page.waitForTimeout(500);
    const xong = await page.evaluate(() => document.getElementById('progress').classList.contains('hidden') && !document.getElementById('go').disabled);
    if (xong) return true;
  }
  return false;
}

console.log('Lượt 1:');
await tim();
can(await choXong(), 'lượt 1 xong');
await page.waitForTimeout(1500);
const soLuot1 = await page.evaluate(() => document.getElementById('result-count').textContent);
console.log(`  lượt 1: ${soLuot1} gói`);

const mut = await new Promise((res, rej) => https.get({ host: '127.0.0.1', port: PORT, path: '/__mock/mutate', rejectUnauthorized: false },
  (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res(JSON.parse(b))); }).on('error', rej));
console.log(`  e-GP giả lập: +2 gói mới, đổi giá ${mut.changed}`);
console.log(`  chờ ${WAIT_CACHE / 1000}s cho hết hạn bộ nhớ đệm 2 phút…`);
await page.waitForTimeout(WAIT_CACHE);

console.log('Lượt 2 (cùng tiêu chí):');
await tim();
let thayCu = false, soCu = 0;
for (let i = 0; i < 40 && !thayCu; i++) {
  await page.waitForTimeout(150);
  const s = await page.evaluate(() => ({ strip: document.getElementById('baseline-strip')?.textContent || '',
    visible: !document.getElementById('baseline-strip')?.classList.contains('hidden'),
    cards: document.querySelectorAll('#list .ws-result').length }));
  if (s.visible && /Đang cập nhật/.test(s.strip) && s.cards > 0) { thayCu = true; soCu = s.cards; }
}
if (thayCu && SHOTS) { await page.evaluate(() => document.getElementById('baseline-strip').scrollIntoView({ block: 'start' })); await page.screenshot({ path: `${SHOTS}/1-dang-cap-nhat-hien-luot-truoc.png`, fullPage: false }); }
can(thayCu, `trong lúc chờ e-GP, hiện ngay kết quả lượt trước (${soCu} thẻ trên trang) kèm dải "có thể đã cũ"`);
can(await choXong(), 'lượt 2 xong');
await page.waitForTimeout(2500);
const strip = await page.evaluate(() => document.getElementById('baseline-strip').textContent);
console.log(`  dải so sánh: ${strip.trim()}`);
can(/2 gói mới/.test(strip), 'dải so sánh nói đúng "2 gói mới"');
can(/1 gói đổi thông tin/.test(strip), 'dải so sánh nói đúng "1 gói đổi thông tin"');
await page.check('#only-diff');
await page.waitForTimeout(500);
const nhan = await page.evaluate(() => ({ moi: [...document.querySelectorAll('#list .pill.diff-new')].length,
  doi: [...document.querySelectorAll('#list .pill.diff-changed')].map((p) => p.title),
  ten: [...document.querySelectorAll('#list .ws-result h3')].map((h) => h.textContent.trim()) }));
console.log(`  chỉ xem Mới/Đổi: ${nhan.ten.join(' | ')}`);
can(nhan.moi === 2, `đúng 2 nhãn "Mới" (thấy ${nhan.moi})`);
can(nhan.doi.length === 1 && /Giá gói thầu/.test(nhan.doi[0]), `1 nhãn "Đổi" nêu "Giá gói thầu" (${nhan.doi.join('; ')})`);
if (SHOTS) { await page.evaluate(() => document.querySelector('#list .ws-result')?.scrollIntoView({ block: 'start' })); await page.screenshot({ path: `${SHOTS}/2-nhan-moi-doi.png`, fullPage: false }); }
console.log(loi.length ? `\nHỎNG: ${loi.length} điều kiện` : '\nĐẠT');
await ctx.close();
fs.rmSync(UD, { recursive: true, force: true });
process.exit(loi.length ? 1 : 0);
