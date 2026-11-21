/* ============================================================================
 *  4.22.0 — BẢN SAFARI: không dùng thứ mà Safari 16.4 (mốc tối thiểu) chưa có
 *
 *  Bộ thử WebKit của kho chạy nhân mới (2.52) nên một hàm chỉ có từ Safari 17, 18 vẫn "đạt"
 *  trong phòng thí nghiệm, rồi ném lỗi trên iPad đời cũ hơn của người dùng. Bài này soát
 *  tĩnh mọi tệp ĐƯỢC GÓI vào bản Safari (đúng nội dung sau khi gói) và mã lớp vỏ safari/src:
 *
 *    - hàm / đối tượng JS xuất hiện sau Safari 16.4;
 *    - tính năng CSS mà Safari 16.4 bỏ cả quy tắc (lồng quy tắc, light-dark()…).
 *
 *  Cú pháp JS (cờ v, using…) do tools/test/cu-phap-safari.mjs soát bằng trình phân tích.
 *  Cần dùng một thứ trong danh sách thì phải kiểm tra có/không trước khi gọi, rồi ghi tệp và
 *  lý do vào DA_KIEM_TRUOC bên dưới — không được nới danh sách cấm.
 *
 *  Đây là soát tĩnh theo danh sách: không thay được việc chạy trên một iPad 16.4 thật.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPack } from '../safari/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** [tên, mẫu, có từ bản Safari nào]. Số phiên bản ghi theo hiểu biết của người viết, để người đọc biết vì sao bị
 *  chặn; mục đích của danh sách là chặn, không phải tra cứu — chưa đối chiếu từng mục với một máy thật. */
const JS_TOO_NEW = [
  ['Object.groupBy / Map.groupBy', /\b(?:Object|Map)\.groupBy\b/, '17.4'],
  ['Promise.withResolvers', /\bPromise\.withResolvers\b/, '17.4'],
  ['Promise.try', /\bPromise\.try\s*\(/, '18.2'],
  ['phép tập hợp của Set (isSubsetOf, symmetricDifference…)', /\.(?:isSubsetOf|isSupersetOf|isDisjointFrom|symmetricDifference)\s*\(/, '17.0'],
  ['URL.canParse', /\bURL\.canParse\b/, '17.0'],
  ['URL.parse', /\bURL\.parse\s*\(/, '18.0'],
  ['AbortSignal.any', /\bAbortSignal\.any\b/, '17.4'],
  ['Element.checkVisibility', /\.checkVisibility\s*\(/, '17.4'],
  ['requestIdleCallback', /\brequestIdleCallback\b/, 'chưa bật mặc định ở 16–18'],
  ['scheduler.postTask / scheduler.yield', /\bscheduler\.(?:postTask|yield)\b/, 'chưa có ở 16–18'],
  ['Iterator.from / trợ thủ của Iterator', /\bIterator\.from\b/, '18.4'],
  ['RegExp.escape', /\bRegExp\.escape\b/, '18.2'],
  ['Uint8Array.fromBase64 / toBase64 / toHex', /\bUint8Array\.from(?:Base64|Hex)\b|\.to(?:Base64|Hex)\s*\(/, '18.2'],
  ['Float16Array / Math.f16round', /\bFloat16Array\b|\bMath\.f16round\b/, '18.2'],
  ['document.startViewTransition', /\.startViewTransition\s*\(/, '18.0'],
  ['Popover API', /\.(?:showPopover|hidePopover|togglePopover)\s*\(|\bpopover(?:target)?=/, '17.0'],
  ['setHTMLUnsafe / getHTML', /\.setHTMLUnsafe\s*\(|\.getHTML\s*\(/, '17.4'],
  ['dialog.requestClose', /\.requestClose\s*\(/, '18.4'],
  ['sự kiện scrollend', /['"]scrollend['"]/, 'chưa có trên iOS 16–18'],
  ['Temporal', /\bTemporal\.(?:Now|Instant|PlainDate|ZonedDateTime|Duration)\b/, 'chưa có ở 16–18'],
  ['Error.isError', /\bError\.isError\b/, 'chưa có ở 16–18'],
  ['CSS Custom Highlight (CSS.highlights)', /\bCSS\.highlights\b/, '17.2']
];
const CSS_TOO_NEW = [
  ['light-dark()', /\blight-dark\s*\(/, '17.5'],
  ['@scope', /@scope\b/, '17.4'],
  ['@starting-style', /@starting-style\b/, '17.5'],
  ['định vị theo neo (anchor)', /\banchor\s*\(|\bposition-anchor\s*:|@position-try\b/, '26'],
  [':popover-open', /:popover-open\b/, '17.0'],
  ['@view-transition', /@view-transition\b/, '18.2'],
  ['field-sizing', /\bfield-sizing\s*:/, 'chưa có ở 16–18'],
  ['interpolate-size', /\binterpolate-size\s*:/, 'chưa có ở 16–18'],
  [':state()', /:state\s*\(/, '17.4'],
  ['hoạt ảnh theo cuộn (animation-timeline…)', /\b(?:animation-timeline|scroll-timeline|view-timeline)\s*:/, '26'],
  ['lồng quy tắc CSS (&)', /[{;}]\s*&\s*[.:#[>+~\w]/, '17.2 (16.5 chỉ một phần)']
];
/** Chỗ đã kiểm tra có/không trước khi dùng: [tệp, tên trong danh sách, lý do]. Hiện chưa cần mục nào. */
const DA_KIEM_TRUOC = [];

/** Mọi văn bản được gói + mã lớp vỏ. Tệp của bên thứ ba (vendor) cũng tính: nó cũng chạy trên máy người dùng. */
function shippedTexts() {
  const out = [];
  const { pack } = buildPack();
  for (const [rel, entry] of Object.entries(pack.files)) {
    if (typeof entry.s === 'string' && /\.(js|css|html)$/.test(rel)) out.push({ file: `gói:${rel}`, kind: path.extname(rel).slice(1), text: entry.s });
  }
  const dir = path.join(ROOT, 'safari', 'src');
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.js')).sort()) out.push({ file: `safari/src/${name}`, kind: 'js', text: fs.readFileSync(path.join(dir, name), 'utf8') });
  return out;
}

function scan(texts, rules, kinds) {
  const hits = [];
  for (const { file, kind, text } of texts) {
    if (!kinds.includes(kind)) continue;
    const lines = text.split('\n');
    for (const [name, pattern, since] of rules) {
      if (DA_KIEM_TRUOC.some(([f, n]) => f === file && n === name)) continue;
      lines.forEach((line, i) => { if (pattern.test(line)) hits.push(`${file}:${i + 1} — ${name} (Safari ${since}): ${line.trim().slice(0, 120)}`); });
    }
  }
  return hits;
}

const TEXTS = shippedTexts();

test('Soát đủ rộng: hơn 130 tệp JS được gói, 5 tệp kiểu, 25 trang và toàn bộ lớp vỏ', () => {
  const count = (kind, prefix) => TEXTS.filter((t) => t.kind === kind && t.file.startsWith(prefix)).length;
  assert.ok(count('js', 'gói:') >= 130, `tệp JS trong gói: ${count('js', 'gói:')}`);
  assert.ok(count('css', 'gói:') >= 5);
  assert.equal(count('html', 'gói:'), 25);
  assert.ok(count('js', 'safari/src/') >= 8);
  for (const must of ['gói:phone.js', 'gói:brief.js', 'gói:lib/hsmt-ai.js', 'gói:lib/telegram-backup.js', 'gói:theme.css', 'safari/src/80-phat-hanh.js']) {
    assert.ok(TEXTS.some((t) => t.file === must), `thiếu ${must}`);
  }
});

test('Không có hàm / đối tượng JS nào xuất hiện sau Safari 16.4 trong bản Safari', () => {
  const hits = scan(TEXTS, JS_TOO_NEW, ['js', 'html']);
  assert.deepEqual(hits, [], `Safari 16.4 chưa có:\n${hits.join('\n')}`);
});

test('Không có tính năng CSS nào mà Safari 16.4 bỏ cả quy tắc', () => {
  // CSS nằm trong tệp .css, trong <style> của trang, và trong chuỗi kiểu của lớp vỏ (safari/src/*.js).
  const shell = TEXTS.filter((t) => t.file.startsWith('safari/src/')).map((t) => ({ ...t, kind: 'css' }));
  const hits = scan([...TEXTS, ...shell], CSS_TOO_NEW.filter(([name]) => name !== 'lồng quy tắc CSS (&)'), ['css', 'html']);
  // Lồng quy tắc chỉ soát ở tệp .css và trang: trong JS, "&&" sau dấu { ; } là phép toán chứ không phải CSS.
  const nesting = scan(TEXTS, CSS_TOO_NEW.filter(([name]) => name === 'lồng quy tắc CSS (&)'), ['css']);
  assert.deepEqual([...hits, ...nesting], [], `Safari 16.4 không hiểu:\n${[...hits, ...nesting].join('\n')}`);
});

test('Danh sách cấm thật sự bắt được: mỗi mẫu khớp với một ví dụ, và không khớp nhầm thứ Safari 16.4 đã có', () => {
  const jsSamples = ['Object.groupBy(rows, (r) => r.tinh)', 'const { promise, resolve } = Promise.withResolvers();', 'Promise.try(() => f())', 'a.isSubsetOf(b)', 'URL.canParse(text)',
    'URL.parse(text)', 'AbortSignal.any([a, b])', 'el.checkVisibility()', 'requestIdleCallback(run)', 'scheduler.postTask(run)', 'Iterator.from(list)', 'RegExp.escape(text)',
    'bytes.toBase64()', 'new Float16Array(4)', 'document.startViewTransition(() => {})', 'panel.showPopover()', 'el.setHTMLUnsafe(html)', 'dialog.requestClose()',
    "box.addEventListener('scrollend', done)", 'Temporal.Now.instant()', 'Error.isError(e)', 'CSS.highlights.set("x", h)'];
  for (const [name, pattern] of JS_TOO_NEW) assert.ok(jsSamples.some((sample) => pattern.test(sample)), `mẫu "${name}" không khớp ví dụ nào`);
  const cssSamples = ['color: light-dark(#000, #fff)', '@scope (.card) { a { color: red } }', '@starting-style { .x { opacity: 0 } }', 'top: anchor(bottom)', '.tip:popover-open { opacity: 1 }',
    '@view-transition { navigation: auto }', 'field-sizing: content', 'interpolate-size: allow-keywords', 'el:state(open) { color: red }', 'animation-timeline: scroll()', '.card { color: red; &:hover { color: blue } }'];
  for (const [name, pattern] of CSS_TOO_NEW) assert.ok(cssSamples.some((sample) => pattern.test(sample)), `mẫu "${name}" không khớp ví dụ nào`);
  // Những thứ phần mềm ĐANG dùng và Safari 16.4 đã có: không được báo nhầm.
  const fine = ['structuredClone(raw)', 'new CompressionStream("gzip")', 'text.toWellFormed()', 'navigator.wakeLock.request("screen")', 'list.findLast((x) => x.ok)', 'rows.toSorted(byDate)',
    'Array.fromAsync(stream)', 'AbortSignal.timeout(8000)', 'Object.hasOwn(o, "a")', 'crypto.randomUUID()', 'new URL(text, base)', 'a.union', 'const anchor = document.createElement("a")'];
  for (const sample of fine) for (const [name, pattern] of JS_TOO_NEW) assert.ok(!pattern.test(sample), `"${sample}" bị báo nhầm là ${name}`);
  const fineCss = ['color: color-mix(in srgb, red 20%, white)', '.a:has(.b) { gap: 4px }', '@container (min-width: 400px) { .a { color: red } }', '@media (width >= 700px) { .a { inset: 0 } }',
    'url("https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500&display=swap")', 'height: 100dvh', '.x { overflow-wrap: anywhere }'];
  for (const sample of fineCss) for (const [name, pattern] of CSS_TOO_NEW) assert.ok(!pattern.test(sample), `"${sample}" bị báo nhầm là ${name}`);
});
