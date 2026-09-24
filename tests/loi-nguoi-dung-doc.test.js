/* ============================================================================
 *  LỖI HIỆN RA MÀN HÌNH PHẢI LÀ CÂU NGƯỜI DÙNG ĐỌC ĐƯỢC
 *
 *  Đã gặp thật: chụp màn hình bản 4.11.0 thì dưới ô "Xã / Phường" hiện đúng
 *  hai chữ **"Failed to fetch"**. Tiếng Anh, không nói cái gì hỏng, không nói
 *  phải làm sao. Và điều tệ nhất không nằm ở câu chữ: ô chọn xã im lặng ngừng
 *  hoạt động, nên người dùng vẫn bấm tìm và vẫn nhận kết quả — chỉ là kết quả
 *  KHÔNG hề lọc theo xã. Trông vẫn bình thường.
 *
 *  Bài này khoá ba điều cho mọi câu lỗi hiện ra chỗ đó:
 *    1. Không được lọt chuỗi lỗi kỹ thuật tiếng Anh.
 *    2. Phải nói HẬU QUẢ — tiêu chí xã chưa được áp dụng.
 *    3. Phải nói VIỆC CẦN LÀM tiếp theo.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Nạp hàm dịch lỗi ra khỏi ward-picker.js và chạy thật. */
function napHamDichLoi() {
  const src = fs.readFileSync(path.join(ROOT, 'ward-picker.js'), 'utf8');
  const start = src.indexOf('function loiNguoiDungDoc');
  assert.ok(start >= 0, 'không tìm thấy hàm dịch lỗi — ward-picker.js đã đổi');
  const rest = src.slice(start);
  const end = rest.indexOf('\nexport function');
  const body = end > 0 ? rest.slice(0, end) : rest;
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`${body}\n;globalThis.__dich = loiNguoiDungDoc;`, sandbox);
  return sandbox.__dich;
}

const CAC_LOI = [
  new TypeError('Failed to fetch'),
  new TypeError('NetworkError when attempting to fetch resource.'),
  new Error('Load failed'),
  new Error('net::ERR_INTERNET_DISCONNECTED'),
  new Error('e-GP trả HTTP 503 khi lấy danh sách địa bàn.'),
  new Error('e-GP trả HTTP 429 khi lấy danh sách địa bàn.'),
  new Error('The operation was aborted due to timeout'),
  new Error(''),
  'một chuỗi trần không phải Error'
];

test('KHÔNG chuỗi lỗi kỹ thuật tiếng Anh nào lọt ra màn hình', () => {
  const dich = napHamDichLoi();
  for (const loi of CAC_LOI) {
    const cau = dich(loi);
    assert.ok(cau.length > 30, `câu quá ngắn để nói được gì: "${cau}"`);
    for (const xau of [/^failed to fetch$/i, /^load failed$/i, /^networkerror/i, /^net::/i, /undefined|\[object Object\]/i]) {
      assert.ok(!xau.test(cau.trim()), `lọt lỗi kỹ thuật ra màn hình: "${cau}"`);
    }
  }
});

test('mỗi câu lỗi đều nói NGƯỜI DÙNG PHẢI LÀM GÌ', () => {
  const dich = napHamDichLoi();
  // Không có việc cần làm thì câu lỗi chỉ là lời than.
  const VIEC = /(kiểm tra|bấm|thử lại|chọn|hãy)/i;
  for (const loi of CAC_LOI) {
    assert.match(dich(loi), VIEC, `câu lỗi không chỉ ra việc cần làm: "${dich(loi)}"`);
  }
});

test('câu lỗi nói rõ TIÊU CHÍ XÃ CHƯA ĐƯỢC ÁP DỤNG', () => {
  /* Đây là phần quan trọng nhất. Người dùng phải biết kết quả sắp nhận KHÔNG
     lọc theo xã, nếu không họ sẽ tin là đã lọc và bỏ qua những gói lẽ ra phải
     tự kiểm lại. Riêng lỗi phía e-GP thì hướng sang lọc theo tỉnh, cũng là
     nói rằng tiêu chí xã đang không dùng được. */
  const dich = napHamDichLoi();
  const NOI_RO = /(chưa được áp dụng|chưa lấy được|lọc theo (tỉnh|Tỉnh))/i;
  for (const loi of CAC_LOI) {
    assert.match(dich(loi), NOI_RO, `không nói rõ tiêu chí xã đang bỏ trống: "${dich(loi)}"`);
  }
});

test('lỗi mạng và lỗi phía e-GP được phân biệt — hai việc cần làm khác nhau', () => {
  const dich = napHamDichLoi();
  assert.match(dich(new TypeError('Failed to fetch')), /mạng/i);
  assert.match(dich(new Error('e-GP trả HTTP 503')), /e-GP/);
  assert.notEqual(dich(new TypeError('Failed to fetch')), dich(new Error('e-GP trả HTTP 503')));
});

test('không trang nào còn nhả thẳng e.message ra ô gợi ý', () => {
  /* Chặn đường quay lại: một lần gán `hint.textContent = String(e.message)` là
     lỗi cũ trở lại y nguyên. */
  for (const file of ['ward-picker.js', 'plans.js', 'search.js']) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(!/hint\.textContent\s*=\s*String\(\s*e(rror)?\.message/.test(src),
      `${file} đang nhả lỗi kỹ thuật ra ô gợi ý`);
    assert.ok(!/\$\('ward-hint'\)\.textContent\s*=\s*String\(\s*e(rror)?\.message/.test(src),
      `${file} đang nhả lỗi kỹ thuật ra ô gợi ý`);
  }
});
