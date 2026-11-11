/* ============================================================================
 *  GIAO DIỆN 4.18.0 — các cam kết đo được của bản thiết kế lại
 *
 *  Đo trên 4.17.3 bằng tools/test/ui-shots.mjs (23 trang, 1366×768): 57,9% khối
 *  chữ nhỏ hơn 12px (cửa sổ bật lên: cỡ giữa 9px), 14,3% khối chữ không đạt
 *  tương phản WCAG AA, hai kiểu khung trang khác nhau, emoji lẫn biểu tượng.
 *  Bài này khoá các cam kết ở mức mã nguồn để không trôi ngược về sau.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const DIR = new URL('../GiaoSuCuiBap/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, DIR), 'utf8').replace(/\r\n/g, '\n');
const pagesOf = () => fs.readdirSync(DIR).filter((f) => f.endsWith('.html'));

test('không còn cỡ chữ nào dưới 12px trong CSS, HTML và mẫu dựng bằng JS', () => {
  const files = [...fs.readdirSync(DIR).filter((f) => /\.(css|html|js)$/.test(f)),
    ...fs.readdirSync(new URL('lib/', DIR)).filter((f) => f.endsWith('.js')).map((f) => `lib/${f}`), 'mobile/iphone.html'];
  const nho = [];
  for (const f of files) {
    for (const m of read(f).matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) if (Number(m[1]) > 0 && Number(m[1]) < 12) nho.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(nho, []);
});

test('mọi trang nạp theme.css SAU CÙNG — hệ thống thiết kế là lớp trên cùng', () => {
  for (const page of pagesOf()) {
    const links = [...read(page).matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
    assert.equal(links.at(-1), 'theme.css', `${page}: ${links.join(', ')}`);
  }
});

test('phông Be Vietnam Pro đủ 4 độ đậm, có bảng mã tiếng Việt, tệp có thật; tệp TTF cũ đã gỡ', () => {
  const css = read('theme.css');
  for (const w of ['400', '500', '600', '700']) {
    assert.match(css, new RegExp(`font-weight:${w}[^}]*be-vietnam-pro-vietnamese-${w}\\.woff2`), `thiếu độ đậm ${w}`);
    for (const sub of ['vietnamese', 'latin', 'latin-ext']) assert.ok(fs.existsSync(new URL(`fonts/be-vietnam-pro-${sub}-${w}.woff2`, DIR)), `${sub}-${w}`);
  }
  assert.ok(fs.existsSync(new URL('fonts/OFL.txt', DIR)), 'giấy phép OFL đi kèm phông');
  for (const f of [...pagesOf(), 'app.css', 'workspace.css', 'theme.css']) assert.doesNotMatch(read(f), /BeVietnamPro-(Regular|SemiBold)\.ttf/, f);
});

/* Tương phản theo WCAG 2.1 tính từ đúng giá trị khai trong theme.css. */
function token(css, name) { const m = css.match(new RegExp(`--${name}:(#[0-9a-f]{6})`, 'i')); assert.ok(m, `thiếu --${name}`); return m[1]; }
function ratio(a, b) {
  const lum = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05);
}
test('màu chữ của hệ thống thiết kế đạt WCAG AA (≥ 4,5:1) trên đúng nền dùng chúng', () => {
  const css = read('theme.css');
  const nen = { trang: '#ffffff', bg: token(css, 'bg'), surface2: token(css, 'surface-2'), sidebar: token(css, 'brand-900') };
  const cap = [
    [token(css, 'ink'), nen.trang], [token(css, 'text'), nen.trang], [token(css, 'text-2'), nen.trang],
    [token(css, 'muted'), nen.trang], [token(css, 'muted'), nen.bg], [token(css, 'subtle'), nen.trang], [token(css, 'subtle'), nen.bg],
    [token(css, 'brand-700'), nen.trang], ['#ffffff', token(css, 'brand-700')],
    [token(css, 'ok'), token(css, 'ok-bg')], [token(css, 'warn'), token(css, 'warn-bg')], [token(css, 'bad'), token(css, 'bad-bg')], ['#14306d', token(css, 'info-bg')],
    // Thanh trái: chữ mục, chữ nhóm, chữ phiên bản trên nền xanh đậm.
    ['#d4e4e0', nen.sidebar], ['#94c9bf', nen.sidebar], ['#a9cbc4', nen.sidebar]
  ];
  for (const [chu, nenMau] of cap) assert.ok(ratio(chu, nenMau) >= 4.5, `${chu} trên ${nenMau}: ${ratio(chu, nenMau).toFixed(2)}:1`);
});

test('thanh trái có MỌI trang chức năng; bốn trang tra cứu e-GP đứng đầu, không bị thu gọn', () => {
  const src = read('shell.js');
  const nav = [...src.matchAll(/\['([a-z0-9-]+\.html)', '([a-z]+)', '([^']+)'\]/g)].map((m) => m[1]);
  const conLai = pagesOf().filter((p) => !['popup.html', 'onboarding.html', 'privacy.html'].includes(p)).filter((p) => !nav.includes(p));
  assert.deepEqual(conLai, [], 'trang không vào được từ thanh trái');
  const dau = src.slice(src.indexOf("{ id: 'tra-cuu'"), src.indexOf("{ id: 'theo-doi'"));
  for (const p of ['search.html', 'plans.html', 'bidopen.html', 'winners.html']) assert.ok(dau.includes(p), p);
  assert.doesNotMatch(dau, /fold:\s*true/, 'nhóm tra cứu e-GP không được thu gọn');
});

test('shell.js: không chèn thanh 4 bước, không đụng cửa sổ bật lên, không ghi nhớ nhóm tự mở', () => {
  const src = read('shell.js');
  assert.doesNotMatch(src, /workflow-strip/);
  assert.match(src, /const IS_POPUP = file === 'popup\.html';/);
  assert.match(src, /if \(!IS_POPUP\) \{\n  adoptLegacyHeader\(\);/);
  assert.doesNotMatch(src, /addEventListener\('toggle'/, 'sự kiện toggle cũng bắn khi nhóm tự mở — chỉ được ghi khi người dùng bấm');
});

test('nút và thẻ chuyển tab trong mọi trang không còn emoji — dùng bộ biểu tượng SVG chung', () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{231A}-\u{23FF}]/u;
  const loi = [];
  for (const page of pagesOf()) {
    for (const m of read(page).matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) if (emoji.test(m[1])) loi.push(`${page}: ${m[1].trim().slice(0, 40)}`);
  }
  assert.deepEqual(loi, []);
});

test('Mở thầu: số gói tối đa ngoài danh sách chọn được thêm vào ô chọn, không còn hiện trống', () => {
  const src = read('bidopen.js');
  const a = src.indexOf('function setMaxPackages(value){');
  assert.ok(a > 0, 'thiếu setMaxPackages');
  const fn = src.slice(a, src.indexOf('\n}\n', a) + 2);
  const options = ['50', '150', '300', '600'].map((value) => ({ value }));
  const sel = { options, value: '150', add(o) { options.push(o); } };
  const ctx = vm.createContext({ $: () => sel, Option: class { constructor(text, value) { this.text = text; this.value = value; } } });
  vm.runInContext(`${fn}\nthis.setMaxPackages=setMaxPackages;`, ctx);
  ctx.setMaxPackages(20);
  assert.equal(sel.value, '20');
  assert.ok(options.some((o) => o.value === '20' && o.text === '20 gói'));
  ctx.setMaxPackages(999);
  assert.equal(sel.value, '600', 'giới hạn 600 như phía nền');
  ctx.setMaxPackages(undefined);
  assert.equal(sel.value, '150');
  assert.match(src, /setMaxPackages\(SCAN\.maxPackages\)/);
});
