/* ============================================================================
 *  CHỤP GIAO DIỆN APP CỠ iPHONE (bản web xem trước, DỮ LIỆU MẪU)
 *
 *  npx expo export --platform web --output-dir <dist>
 *  node tests/browser/ui-shots.mjs <dist> <thư-mục-ảnh>
 *
 *  Đi đúng luồng người dùng: Tìm gói → đang tra → kết quả → chi tiết → theo dõi
 *  → tab Theo dõi → tab Thông tin. Gom mọi lỗi console; có lỗi là thoát mã 1.
 *  Chặn mọi yêu cầu ra ngoài máy (bản xem trước không được gọi mạng).
 * ========================================================================== */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [DIST, OUT] = process.argv.slice(2);
if (!DIST || !OUT) { console.error('Dùng: node tests/browser/ui-shots.mjs <dist> <thư-mục-ảnh>'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };
const ROOT = path.resolve(DIST);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  // Ứng dụng một trang: đường dẫn không phải tệp (vd. /theo-doi) trả về index.html.
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'vi-VN' });
const outside = [];
await context.route('**/*', (route) => {
  const u = new URL(route.request().url());
  if (u.hostname === '127.0.0.1' || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
  outside.push(u.href);
  return route.abort('blockedbyclient');
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log(`  ảnh ${name}.png`); };
const tapText = async (text) => { await page.getByText(text, { exact: true }).first().click(); };

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByText('Tìm trên e-GP').first().waitFor({ timeout: 20000 });
await shot('1-tim-goi');

await tapText('Tìm trên e-GP');
await page.getByText('Đang tra cứu trên e-GP').waitFor({ timeout: 10000 });
await page.waitForTimeout(900);
await shot('2-dang-tra');

await page.getByText(/^Khớp tiêu chí \(\d+\)$/).waitFor({ timeout: 20000 });
await page.evaluate(() => window.scrollTo(0, 0));
await page.mouse.wheel(0, 900);
await shot('3-ket-qua');

await page.locator('text=/\\(mẫu \\d+\\)$/').first().click();
await page.getByText('Theo dõi & nhắc hạn').waitFor({ timeout: 10000 });
await shot('4-chi-tiet');
await tapText('Theo dõi & nhắc hạn');
await page.getByText(/^Đã theo dõi/).waitFor({ timeout: 10000 });
await shot('5-da-theo-doi');

await page.goto(`${BASE}/theo-doi`, { waitUntil: 'networkidle' });
await page.getByText('Nhắc hạn nộp hồ sơ', { exact: true }).waitFor({ timeout: 10000 });
await shot('6-theo-doi');

await page.goto(`${BASE}/thong-tin`, { waitUntil: 'networkidle' });
await page.getByText('Kết nối e-GP', { exact: true }).waitFor({ timeout: 10000 });
await shot('7-thong-tin');

await browser.close();
server.close();
console.log(`\nLỗi console/trang: ${errors.length}${errors.length ? `\n${errors.join('\n')}` : ''}`);
console.log(`Yêu cầu ra ngoài bị chặn: ${outside.length}${outside.length ? `\n${outside.join('\n')}` : ''}`);
process.exit(errors.length || outside.length ? 1 : 0);
