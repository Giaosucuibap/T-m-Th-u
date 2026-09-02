/* ============================================================================
 *  Số phiên bản phải khớp nhau ở mọi nơi công bố nó.
 *
 *  VÌ SAO CÓ TỆP NÀY: đã hai lần bump `manifest.json` mà quên `README.md`, nên
 *  tài liệu công bố một số hiệu trong khi Chrome cài một số hiệu khác. Lần thứ
 *  hai còn để lại hai câu đã sai sự thật ("44/44 kiểm thử", "môi trường không
 *  có Chromium") vì chúng nằm ngay cạnh số hiệu cũ.
 *
 *  Sai lệch kiểu này không làm hỏng phần mềm, nhưng làm người đọc không biết
 *  mình đang cầm bản nào — với một công cụ mà người dùng phải tự tải và tự cài
 *  bằng tay thì đó là vấn đề thật.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(join(ROOT, name), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const packageJson = JSON.parse(read('package.json'));
const readme = read('README.md');
const changelog = read('CHANGELOG.md');

const VERSION = manifest.version;

test('manifest.json có số phiên bản đúng dạng x.y.z', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/, `phiên bản không hợp lệ: ${VERSION}`);
});

test('package.json trùng phiên bản với manifest.json', () => {
  assert.equal(packageJson.version, VERSION,
    `package.json (${packageJson.version}) lệch manifest.json (${VERSION})`);
});

test('tiêu đề README trùng phiên bản với manifest.json', () => {
  const m = /^#\s+Giáo Sư Cùi Bắp\s+(\d+\.\d+\.\d+)\s*$/m.exec(readme);
  assert.ok(m, 'README phải mở đầu bằng "# Giáo Sư Cùi Bắp <phiên bản>"');
  assert.equal(m[1], VERSION,
    `tiêu đề README (${m[1]}) lệch manifest.json (${VERSION}) — nhớ sửa README khi bump phiên bản`);
});

test('CHANGELOG có mục cho phiên bản hiện tại', () => {
  assert.ok(changelog.includes(`## [${VERSION}]`),
    `CHANGELOG.md thiếu mục "## [${VERSION}]"`);
});

test('CHANGELOG đặt phiên bản hiện tại lên đầu danh sách', () => {
  const first = /^##\s+\[(\d+\.\d+\.\d+)\]/m.exec(changelog);
  assert.ok(first, 'CHANGELOG phải có ít nhất một mục "## [x.y.z]"');
  assert.equal(first[1], VERSION,
    `mục đầu CHANGELOG là ${first[1]}, phải là phiên bản hiện tại ${VERSION}`);
});

/* --------------------------------------------------------------------------
 *  Các bước cài đặt không được gắn cứng số phiên bản.
 *
 *  "Chọn đúng thư mục chứa manifest.json của phiên bản 4.0.1" trở thành hướng
 *  dẫn sai ngay lần bump kế tiếp. Viết trung tính thì không bao giờ phải sửa.
 * ------------------------------------------------------------------------ */
test('hướng dẫn cài đặt trong README không gắn cứng số phiên bản', () => {
  const section = readme.slice(readme.indexOf('## Cài đặt thủ công'));
  const install = section.slice(0, section.indexOf('## Bắt đầu sử dụng'));
  assert.ok(install.length, 'không tìm thấy mục "Cài đặt thủ công" trong README');
  const hits = install.match(/phiên bản \d+\.\d+\.\d+/g) || [];
  assert.deepEqual(hits, [],
    `các bước cài đặt nhắc số phiên bản cụ thể (${hits.join(', ')}); hãy viết trung tính`);
});
