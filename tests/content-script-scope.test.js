/* ============================================================================
 *  Phạm vi content script: manifest và phần nền phải nói cùng một chuyện.
 *
 *  Từ 4.0.0, `content_scripts.matches` chỉ còn các trang lựa chọn nhà thầu.
 *  Mọi tab mà phần nền đưa lượt quét tới đều PHẢI nằm trong phạm vi đó, nếu
 *  không tầng nền sẽ nhắn cho một bên nhận không tồn tại và lượt quét chết
 *  bằng nguyên văn thông báo tiếng Anh của Chrome:
 *
 *      "Could not establish connection. Receiving end does not exist."
 *
 *  Đã xảy ra HAI lần, cùng một gốc:
 *    4.0.0  route mặc định trỏ /web/guest/home
 *    4.0.1  tái dùng tab e-GP đang mở nguyên trạng (trang chủ chẳng hạn)
 *
 *  Cả hai đều lọt qua toàn bộ bộ kiểm thử vì chúng chỉ lộ ra trong trình duyệt
 *  thật. Các bài dưới đây kiểm được bằng Node thuần, bằng cách dịch chính mẫu
 *  match trong manifest.json sang RegExp rồi đối chiếu — nên hai nơi không thể
 *  lệch nhau lần nữa.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EGP_SCAN_PAGE, hasContentScript, scanTargetUrl } from '../lib/core.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

/** Đổi một mẫu match của Chrome thành RegExp để đối chiếu URL. */
function matchPatternToRegExp(pattern) {
  const m = /^(\*|https?|file|ftp):\/\/([^/]+)(\/.*)$/.exec(pattern);
  assert.ok(m, `mẫu match không hợp lệ: ${pattern}`);
  const [, scheme, host, path] = m;
  const esc = (s) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const schemeRe = scheme === '*' ? 'https?' : scheme;
  const hostRe = host === '*' ? '[^/]+'
    : host.startsWith('*.') ? `(?:[^/]+\\.)?${esc(host.slice(2))}`
      : esc(host);
  const pathRe = path.split('*').map(esc).join('.*');
  return new RegExp(`^${schemeRe}://${hostRe}${pathRe}$`);
}

const matchers = (manifest.content_scripts || [])
  .flatMap((cs) => cs.matches || [])
  .map(matchPatternToRegExp);

const inManifestScope = (url) => matchers.some((re) => re.test(url));

test('manifest có khai báo content script', () => {
  assert.ok(matchers.length, 'manifest.content_scripts phải có ít nhất một mẫu match');
});

test('trang quét mặc định nằm trong phạm vi content script của manifest', () => {
  assert.ok(
    inManifestScope(EGP_SCAN_PAGE),
    `EGP_SCAN_PAGE (${EGP_SCAN_PAGE}) phải khớp một mẫu trong content_scripts.matches`
  );
});

test('hasContentScript nhất quán với mẫu match trong manifest', () => {
  const urls = [
    // trong phạm vi
    'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?render=search',
    'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection',
    'https://muasamcong.mpi.gov.vn/en/web/guest/contractor-selection?x=1',
    // ngoài phạm vi — đây chính là các trang từng làm lượt quét chết
    'https://muasamcong.mpi.gov.vn/web/guest/home',
    'https://muasamcong.mpi.gov.vn/vi/web/guest/home',
    'https://muasamcong.mpi.gov.vn/',
    // sai giao thức hoặc sai miền
    'http://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection',
    'https://muasamcong.mpi.gov.vn.evil.example/vi/web/guest/contractor-selection',
    'https://example.com/vi/web/guest/contractor-selection'
  ];

  for (const url of urls) {
    assert.equal(hasContentScript(url), inManifestScope(url),
      `hasContentScript(${url}) phải trùng kết quả đối chiếu manifest`);
  }
});

test('hasContentScript từ chối giá trị rỗng và lược đồ nguy hiểm', () => {
  for (const value of ['', null, undefined, 'javascript:alert(1)', 'data:text/html,x', 'not a url']) {
    assert.equal(hasContentScript(value), false,
      `hasContentScript(${JSON.stringify(value)}) phải là false`);
  }
});

test('scanTargetUrl không bao giờ trả về trang thiếu content script', () => {
  const outOfScope = [
    '',
    null,
    undefined,
    'https://muasamcong.mpi.gov.vn/web/guest/home',
    'https://muasamcong.mpi.gov.vn/',
    'http://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection',
    'https://example.com/vi/web/guest/contractor-selection',
    'javascript:alert(1)'
  ];
  for (const value of outOfScope) {
    assert.equal(scanTargetUrl(value), EGP_SCAN_PAGE,
      `scanTargetUrl(${JSON.stringify(value)}) phải quay về trang tìm kiếm`);
  }
});

test('scanTargetUrl giữ nguyên bộ lọc đã lưu khi trang đó hợp lệ', () => {
  const saved = 'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?render=search&x=1';
  assert.equal(scanTargetUrl(saved), saved);
  assert.ok(hasContentScript(scanTargetUrl(saved)));
});

/* --------------------------------------------------------------------------
 *  Phần nền không được tự dựng URL trang quét bằng chuỗi rời.
 *
 *  Hai lần hỏng đều bắt đầu từ một hằng số URL viết tay trong background.js.
 *  Bài này chốt lại: mọi đường đi tới tab quét phải qua lib/core.js.
 * ------------------------------------------------------------------------ */
test('background.js lấy trang quét từ lib/core.js, không viết tay URL', () => {
  const source = readFileSync(join(ROOT, 'background.js'), 'utf8');

  assert.match(source, /EGP_DEFAULT_URL\s*=\s*EGP_SCAN_PAGE/,
    'EGP_DEFAULT_URL phải lấy từ EGP_SCAN_PAGE của lib/core.js');

  assert.match(source, /scanTargetUrl\(/, 'prepareScanTabFor phải dùng scanTargetUrl()');
  assert.match(source, /hasContentScript\(/, 'prepareScanTabFor phải kiểm tra hasContentScript()');

  // Không còn hằng số trang chủ e-GP viết tay — đây đúng là dòng gây lỗi 4.0.0.
  assert.doesNotMatch(source, /['"`]https:\/\/muasamcong\.mpi\.gov\.vn\/web\/guest\/home['"`]/,
    'không được viết tay URL trang chủ e-GP làm đích quét');
});
