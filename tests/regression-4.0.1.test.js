/* ============================================================================
 *  Kiểm thử hồi quy cho ba lỗi phát hiện khi chạy 4.0.0 THẬT trong Chromium.
 *
 *  Bộ kiểm thử 4.0.0 có 44 bài và đều đạt, nhưng cả ba lỗi dưới đây vẫn lọt —
 *  vì chúng chỉ lộ ra khi nạp tiện ích vào trình duyệt thật, thứ mà môi trường
 *  đóng gói 4.0.0 không có (xem mục "Hạn chế đã biết" trong CHANGELOG).
 *
 *  Mỗi bài dưới đây kiểm được bằng Node thuần, nên từ nay `npm test` chặn được
 *  chúng mà không cần Chromium.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildXlsx } from '../lib/xlsx.js';
import { EGP_SCAN_PAGE, hasContentScript, scanTargetUrl } from '../lib/core.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

/* --------------------------------------------------------------------------
 *  1. Trang quét phải nằm trong phạm vi content script của manifest
 *
 *  Lỗi thật: 4.0.0 thu hẹp content_scripts xuống contractor-selection, nhưng
 *  background vẫn dự phòng mở /web/guest/home. Người dùng mới bấm "Quét e-GP
 *  ngay" thì nhận đúng dòng này và không có gói nào:
 *      "Could not establish connection. Receiving end does not exist."
 * ------------------------------------------------------------------------ */

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

function contentScriptMatchers() {
  return (manifest.content_scripts || [])
    .flatMap((cs) => cs.matches || [])
    .map(matchPatternToRegExp);
}

test('trang quét mặc định nằm trong phạm vi content script của manifest', () => {
  const matchers = contentScriptMatchers();
  assert.ok(matchers.length, 'manifest phải khai báo content script');
  assert.ok(
    matchers.some((re) => re.test(EGP_SCAN_PAGE)),
    `EGP_SCAN_PAGE (${EGP_SCAN_PAGE}) phải khớp ít nhất một mẫu content_scripts.matches`
  );
});

test('hasContentScript nhất quán với mẫu match trong manifest', () => {
  const matchers = contentScriptMatchers();
  const inScope = (url) => matchers.some((re) => re.test(url));

  const urls = [
    'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?render=search',
    'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection',
    'https://muasamcong.mpi.gov.vn/en/web/guest/contractor-selection?x=1',
    'https://muasamcong.mpi.gov.vn/web/guest/home',
    'https://muasamcong.mpi.gov.vn/vi/web/guest/home',
    'https://muasamcong.mpi.gov.vn/',
    'http://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection',
    'https://muasamcong.mpi.gov.vn.evil.example/vi/web/guest/contractor-selection',
    'https://example.com/vi/web/guest/contractor-selection'
  ];

  for (const url of urls) {
    assert.equal(hasContentScript(url), inScope(url),
      `hasContentScript(${url}) phải trùng kết quả đối chiếu manifest`);
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

  // Bộ lọc đã lưu trỏ đúng trang hợp lệ thì được giữ nguyên.
  const saved = 'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?render=search&x=1';
  assert.equal(scanTargetUrl(saved), saved);
  assert.ok(hasContentScript(scanTargetUrl(saved)));
});

/* --------------------------------------------------------------------------
 *  2. Cột link trong Excel phải là siêu liên kết THẬT
 *
 *  Lỗi thật: ô chỉ được tô xanh gạch chân, không có <hyperlinks> nào, nên bấm
 *  vào không mở được e-GP — dù chú thích đầu lib/xlsx.js hứa điều ngược lại.
 * ------------------------------------------------------------------------ */

/** Đọc các mục trong ZIP ghi theo phương thức store. */
function zipEntries(bytes) {
  const buf = Buffer.from(bytes);
  const out = new Map();
  let off = 0;
  while (off + 30 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const size = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const nameStart = off + 30;
    const dataStart = nameStart + nameLen + extraLen;
    out.set(buf.subarray(nameStart, nameStart + nameLen).toString('utf8'),
      buf.subarray(dataStart, dataStart + size).toString('utf8'));
    off = dataStart + size;
  }
  return out;
}

const LINK_SPEC = {
  sheetName: 'Gói thầu',
  columns: [
    { header: 'Tên gói thầu', key: 'name' },
    { header: 'Giá gói thầu', key: 'price', type: 'money' },
    { header: 'Link e-GP', key: 'url', type: 'url' }
  ],
  rows: [
    { name: 'Kênh mương N1', price: 12_500_000_000, url: 'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?a=1&b=2' },
    { name: 'Không có link', price: null, url: '' },
    { name: 'Link rác phải bỏ qua', price: 1, url: 'javascript:alert(1)' },
    { name: 'Hồ Đạ Tẻh', price: 987_654_321, url: 'https://muasamcong.mpi.gov.vn/x' }
  ]
};

test('cột kiểu url trở thành siêu liên kết bấm được', () => {
  const files = zipEntries(buildXlsx(LINK_SPEC));
  const sheet = files.get('xl/worksheets/sheet1.xml');
  const rels = files.get('xl/worksheets/_rels/sheet1.xml.rels');

  assert.ok(rels, 'trang tính có link phải kèm tệp _rels riêng');

  // Đúng hai ô có link http(s); ô rỗng và ô javascript: bị loại.
  const refs = [...sheet.matchAll(/<hyperlink ref="([A-Z]+\d+)" r:id="(rId\d+)"\/>/g)];
  assert.equal(refs.length, 2, 'chỉ ô có địa chỉ http(s) mới được gắn link');
  assert.deepEqual(refs.map((m) => m[1]), ['C2', 'C5']);

  // Mỗi r:id trong trang tính phải có quan hệ tương ứng, trỏ ra ngoài.
  for (const [, , rid] of refs) {
    const rel = new RegExp(`<Relationship Id="${rid}"[^>]*TargetMode="External"/>`);
    assert.match(rels, rel, `${rid} phải là quan hệ hyperlink TargetMode="External"`);
  }

  // Ký tự & trong URL phải được thoát, nếu không Excel báo tệp hỏng.
  assert.match(rels, /Target="https:\/\/muasamcong\.mpi\.gov\.vn\/vi\/web\/guest\/contractor-selection\?a=1&amp;b=2"/);

  // Khai báo namespace r: là bắt buộc khi có r:id.
  assert.match(sheet, /xmlns:r="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships"/);

  // Thứ tự lược đồ OOXML: <hyperlinks> phải nằm SAU <autoFilter>.
  assert.ok(sheet.indexOf('<autoFilter') < sheet.indexOf('<hyperlinks>'),
    '<hyperlinks> đặt trước <autoFilter> sẽ làm Excel báo tệp hỏng');
});

test('trang tính không có link thì không sinh tệp quan hệ thừa', () => {
  const files = zipEntries(buildXlsx({
    sheetName: 'Không link',
    columns: [{ header: 'Tên', key: 'name' }],
    rows: [{ name: 'A' }, { name: 'B' }]
  }));
  assert.ok(files.has('xl/worksheets/sheet1.xml'));
  assert.equal(files.has('xl/worksheets/_rels/sheet1.xml.rels'), false);
  assert.equal(files.get('xl/worksheets/sheet1.xml').includes('<hyperlinks>'), false);
});

test('nhiều trang tính: mỗi trang có tệp quan hệ riêng, đánh số độc lập', () => {
  const files = zipEntries(buildXlsx({
    sheets: [
      { sheetName: 'Không link', columns: [{ header: 'Tên', key: 'name' }], rows: [{ name: 'A' }] },
      LINK_SPEC
    ]
  }));
  assert.equal(files.has('xl/worksheets/_rels/sheet1.xml.rels'), false);
  assert.ok(files.has('xl/worksheets/_rels/sheet2.xml.rels'));
  assert.match(files.get('xl/worksheets/sheet2.xml'), /<hyperlink ref="C2" r:id="rId1"\/>/);
});

/* --------------------------------------------------------------------------
 *  3. Mọi trang giao diện phải có <title>
 *
 *  popup.html thiếu <title> nên tab trình duyệt hiện chuỗi rỗng.
 * ------------------------------------------------------------------------ */
test('mọi trang HTML của tiện ích đều có <title> không rỗng', () => {
  const pages = [
    'popup.html', 'dashboard.html', 'options.html', 'search.html', 'winners.html',
    'bidopen.html', 'plans.html', 'market.html', 'investor.html', 'profile.html',
    'contractors.html', 'analytics.html', 'diagnostics.html', 'onboarding.html',
    'privacy.html', 'mobile/iphone.html'
  ];
  for (const page of pages) {
    const html = readFileSync(join(ROOT, page), 'utf8');
    const m = /<title>([^<]*)<\/title>/i.exec(html);
    assert.ok(m, `${page} phải có thẻ <title>`);
    assert.ok(m[1].trim().length > 0, `${page} có <title> rỗng`);
  }
});
