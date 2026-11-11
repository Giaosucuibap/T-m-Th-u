/* ============================================================================
 *  4.22.0 — GIAO DIỆN CHO NGÓN TAY (iPad / iPhone) VÀ CHỮ NÓI ĐÚNG VỀ SAFARI
 *
 *  Số đo ngày 11/11/2026 ở cỡ iPad cho bản 4.21.0: nút phổ biến cao 33 px, một thẻ gói cao
 *  521 px, giờ đóng thầu chỉ nằm trong chú thích rê chuột, nhiều câu nói về "Chrome" và
 *  "máy tính". Các bài ở đây khoá phần LÔ-GIC của cách sửa:
 *   - lib/device.js: cờ cảm ứng, số gói mỗi trang, chọn nhãn hiện trên thẻ thu gọn;
 *   - theme.css: mọi quy tắc cho ngón tay nằm sau html[data-touch] — máy tính dùng chuột
 *     không đổi một điểm ảnh nào;
 *   - các trang: giờ đóng thầu ghi thẳng, nút E-HSMT không hiện trong bản Safari;
 *   - lớp vỏ Safari: không câu nào người dùng đọc còn nhắc "Chrome".
 *  Phần ĐO THẬT (chỗ bấm ≥ 44 px, chiều cao thẻ, không tràn ngang) nằm ở bài đầu-cuối
 *  tools/test/safari-app.mjs, chạy trong nhân WebKit cỡ iPad và iPhone.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { TOUCH, PLATFORM, pageSize, markDocument, pickTopChips, capChipHtml } from '../GiaoSuCuiBap/lib/device.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n');

test('máy tính (Node, không có con trỏ ngón tay): không bật chế độ cảm ứng, nền tảng là chrome', () => {
  assert.equal(TOUCH, false);
  assert.equal(PLATFORM, 'chrome');
  assert.equal(pageSize(30, 20), 30);
  assert.equal(pageSize(30, 20, true), 20);
  assert.equal(pageSize(60, 20, true), 20);
});

test('markDocument gắn data-touch chỉ khi dùng ngón tay; data-platform luôn có', () => {
  const make = () => { const attrs = {}; return { documentElement: { setAttribute(k, v) { attrs[k] = v; } }, attrs }; };
  const mouse = make(); markDocument(mouse, false, 'chrome');
  assert.deepEqual(mouse.attrs, { 'data-platform': 'chrome' });
  const finger = make(); markDocument(finger, true, 'safari');
  assert.deepEqual(finger.attrs, { 'data-touch': '1', 'data-platform': 'safari' });
  assert.doesNotThrow(() => markDocument(null));
});

test('thẻ thu gọn: nhãn cảnh báo được hiện trước, còn lại theo thứ tự gốc; đếm đúng số nhãn ẩn', () => {
  const chips = [{ warn: false }, { warn: false }, { warn: true }, { warn: false }, { warn: true }];
  const three = pickTopChips(chips, 3);
  assert.deepEqual([...three.top].sort(), [0, 2, 4]);
  assert.equal(three.rest, 2);
  assert.deepEqual([...pickTopChips(chips, 2).top].sort(), [2, 4]);
  assert.deepEqual(pickTopChips([], 3), { top: new Set(), rest: 0 });
  assert.equal(pickTopChips(chips, 9).rest, 0);
});

test('capChipHtml: đánh dấu đúng nhãn, giữ nguyên thứ tự và nội dung, thêm ô "+N" khi còn nhãn ẩn', () => {
  const chip = (text, cls = '') => `<span class="reason-chip${cls ? ` ${cls}` : ''}" title="t">${text}</span>`;
  const html = chip('Minh bạch', 'tp tp-ok') + chip('Khớp tiêu chí') + chip('Nghiên cứu ngay') + chip('Thiếu HĐ tương tự', 'warn') + chip('Bảo đảm dự thầu', 'warn') + chip('Đủ trường chính');
  const out = capChipHtml(html, 3);
  const tops = [...out.matchAll(/<span class="reason-chip[^"]*\btop\b[^"]*"[^>]*>([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(tops, ['Minh bạch', 'Thiếu HĐ tương tự', 'Bảo đảm dự thầu', '+3']);
  assert.equal(out.replace(/ top/g, '').replace(/<span class="reason-chip reason-more"[^>]*>\+3<\/span>$/, ''), html, 'chỉ thêm lớp top và ô +N, không đổi gì khác');
  // Chỉ số minh bạch ở mức cảnh báo (tp-warn) cũng được coi là cảnh báo.
  assert.match(capChipHtml(chip('A') + chip('B') + chip('C') + chip('Minh bạch thấp', 'tp tp-warn'), 1), /reason-chip top tp tp-warn/);
  // Ít nhãn hơn giới hạn: hiện hết, không có ô +N.
  const few = capChipHtml(chip('A') + chip('B', 'warn'), 3);
  assert.equal((few.match(/reason-chip top/g) || []).length, 2);
  assert.doesNotMatch(few, /reason-more/);
  assert.equal(capChipHtml('', 3), '');
});

test('theme.css: mọi quy tắc cho ngón tay nằm sau html[data-touch] — giao diện máy tính không đổi', () => {
  const css = read('GiaoSuCuiBap', 'theme.css');
  const at = css.indexOf('MÀN CẢM ỨNG (4.22.0)');
  assert.ok(at > 0, 'có mục MÀN CẢM ỨNG');
  const section = css.slice(css.indexOf('*/', at) + 2).replace(/\/\*[\s\S]*?\*\//g, '');
  /* Quy tắc nền (áp dụng cả máy tính) chỉ được là những phần tử MỚI của 4.22.0, mặc định ẩn hoặc trung tính. */
  const neutral = /^(\.deadline-exact( i)?|\.deadline-left|\.reason-more|\.card-more|\.qf-close|\.touch-tip)$/;
  const flat = section.replace(/@media[^{]*\{/g, '').replace(/\}\s*\}/g, '}');
  let rules = 0;
  for (const match of flat.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    for (const selector of match[1].split(',').map((x) => x.trim()).filter(Boolean)) {
      rules++;
      assert.ok(selector.startsWith('html[data-touch]') || neutral.test(selector), `quy tắc "${selector}" phải nằm sau html[data-touch]`);
    }
  }
  assert.ok(rules >= 40, `${rules} bộ chọn`);
  // Ba phần tử mới mặc định ẩn trên máy tính.
  assert.match(css, /\.reason-more,\.card-more,\.qf-close\{display:none\}/);
  // Chỗ bấm chính đạt 44 px.
  for (const need of ['html[data-touch] .btn{min-height:46px', 'html[data-touch] .btn.sm,html[data-touch] .btn.small{min-height:44px', 'html[data-touch] .ws-sidebar nav a{min-height:44px',
    'html[data-touch] .result-links button,html[data-touch] .result-links a{min-height:44px', 'html[data-touch] select,html[data-touch] input:not([type=checkbox])']) assert.ok(css.includes(need), need);
});

test('các trang: giờ đóng thầu ghi thẳng trên thẻ; 20 gói một trang trên máy cảm ứng; nút E-HSMT không hiện trong bản Safari; hết chữ kỹ thuật', () => {
  const search = read('GiaoSuCuiBap', 'search.js'), dashboard = read('GiaoSuCuiBap', 'dashboard.js'), shell = read('GiaoSuCuiBap', 'shell.js');
  assert.match(search, /const PAGE_SIZE=pageSize\(30,20\);/);
  assert.match(dashboard, /const PAGE_SIZE = pageSize\(60, 20\);/);
  assert.match(search, /<span class="deadline-exact"><i>đóng <\/i>\$\{esc\(formatDate\(t\.closeDate\)\)\}<\/span>/);
  assert.match(search, /t\.notifyNo&&url&&PLATFORM!=='safari'\?`<button type="button" data-download=/);
  assert.match(search, /TOUCH\?capChipHtml\(allChips,innerWidth<=540\?2:3\):allChips/);
  assert.doesNotMatch(dashboard, /investField \(\$\{/, 'tên trường nội bộ không còn lộ ra màn hình Kho gói');
  assert.match(dashboard, /gói chưa có mã lĩnh vực chính thức từ e-GP/);
  assert.match(shell, /import \{ TOUCH, markDocument \} from '\.\/lib\/device\.js';\n[\s\S]{0,400}markDocument\(\);/);
  assert.match(shell, /tip\.className = 'touch-tip'/);
  assert.match(read('GiaoSuCuiBap', 'search.html'), /<span class="key-hint"><br>Nhấn <kbd>\/<\/kbd>/);
  assert.match(read('GiaoSuCuiBap', 'lib', 'quick-find.js'), /class="qf-close" aria-label="Đóng tìm nhanh"/);
});

/* ------------------------------------------------------- lớp vỏ Safari: đổi chữ */
const assets = read('safari', 'src', '10-assets.js');
const wording = (() => {
  const from = assets.indexOf('const SAFARI_WORDS = ['), to = assets.indexOf('/** Đổi chữ trong một nhánh DOM');
  assert.ok(from > 0 && to > from);
  return vm.runInNewContext(`${assets.slice(from, to)}; safariWording`);
})();

test('lớp vỏ Safari: câu viết cho Chrome được đổi cho đúng; câu không liên quan giữ nguyên', () => {
  assert.equal(wording('Quét mỗi ngày khi Chrome đang hoạt động'), 'Quét mỗi ngày khi Cùi Bắp đang mở');
  assert.equal(wording('Quét bù khi mở Chrome nếu hơn 18 giờ chưa thành công'), 'Quét bù khi mở Cùi Bắp nếu hơn 18 giờ chưa thành công');
  assert.equal(wording('Cảnh báo trên máy tính và Telegram'), 'Cảnh báo trong Cùi Bắp và Telegram');
  assert.equal(wording('Dữ liệu chính được xử lý và lưu trong Chrome trên máy này.'), 'Dữ liệu chính được xử lý và lưu trong Safari trên máy này.');
  assert.equal(wording('Đã lưu bộ săn và đăng ký lịch Chrome.'), 'Đã lưu bộ săn và đặt lịch.');
  assert.match(wording('Chrome không thể tự đánh thức máy đang tắt hoặc ngủ. Lượt bị trễ sẽ chạy bù sau khi Chrome hoạt động lại nếu tùy chọn quét bù được bật.'), /^Safari không tự đánh thức được máy đang tắt hoặc ngủ\. Lượt bị trễ sẽ chạy bù sau khi anh mở lại Cùi Bắp/);
  const same = 'Gói thầu xây lắp kênh mương, giá 18.500.000.000 đ';
  assert.equal(wording(same), same);
});

test('lớp vỏ Safari: sau khi đổi, KHÔNG câu nào trong các trang còn nhắc "Chrome" (trừ các mục đã ẩn vì chỉ dành cho máy tính)', () => {
  const hidden = assets.slice(assets.indexOf('const SAFARI_HIDE = ['), assets.indexOf('];', assets.indexOf('const SAFARI_HIDE = [')));
  for (const need of ['a[href="phone.html"]', '#station', 'native-title', '[data-download]']) assert.ok(hidden.includes(need), `ẩn ${need}`);
  const dir = path.join(ROOT, 'GiaoSuCuiBap');
  const leftovers = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.html') && f !== 'phone.html')) {
    let html = read('GiaoSuCuiBap', file).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '');
    html = html.replace(/<section[^>]*id="station"[\s\S]*?<\/section>/, '').replace(/<section[^>]*aria-labelledby="native-title"[\s\S]*?<\/section>/, '');
    const texts = [...html.split(/<[^>]+>/), ...[...html.matchAll(/\b(?:title|placeholder|aria-label)="([^"]*)"/g)].map((m) => m[1])];
    for (const text of texts) { const out = wording(text); if (/Chrome/.test(out)) leftovers.push(`${file}: ${out.trim().slice(0, 90)}`); }
  }
  assert.deepEqual(leftovers, []);
  // Câu do mã trang sinh ra lúc chạy (bộ săn).
  for (const text of ['Đã bắt đầu lượt săn. Giữ Chrome và tab e-GP.', 'Đã tắt chạy nền. Đóng Chrome thì bộ săn dừng; lượt lỡ sẽ chạy bù khi mở lại.', '7 ngày qua Chrome/máy không chạy 2 lần, tổng 3 giờ.']) assert.doesNotMatch(wording(text), /Chrome/);
});
