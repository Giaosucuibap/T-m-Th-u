/* ============================================================================
 *  CỔNG CHẶN BẢN DỰNG THEO CANARY SỐNG  (B1.1)
 *
 *  `npm test` không gọi được e-GP — Node không có token của trang. Nên canary
 *  sống chạy trong tiện ích và GHI kết quả ra `canary-result.json`; bài này đọc
 *  tệp đó và quyết định có chặn bản dựng hay không.
 *
 *  Cách chạy canary: mở tiện ích → Chẩn đoán → "Chạy canary sống", rồi lưu tệp
 *  kết quả vào gốc kho mã. Xem tools/test/README.md.
 *
 *  VÌ SAO CHẶN THAY VÌ CHỈ CẢNH BÁO: e-GP đổi một tên trường hay bỏ một mã tỉnh
 *  thì phần mềm vẫn xanh toàn bộ phép thử, vẫn chạy, chỉ là trả kết quả thiếu.
 *  Người dùng không có cách nào biết. Chặn bản dựng là chốt chặn cuối cùng.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canaryGate, CANARY_MAX_AGE_DAYS } from '../lib/canary-live.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'canary-result.json');

function docKetQua() {
  if (!fs.existsSync(FILE)) return null;
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) { return { __hong: String(e.message) }; }
}

test('kết quả canary sống không được chặn bản dựng', () => {
  const ketQua = docKetQua();

  if (ketQua?.__hong) {
    assert.fail(`canary-result.json không đọc được: ${ketQua.__hong}. `
      + 'Xoá tệp rồi chạy lại canary, đừng sửa tay.');
  }

  const g = canaryGate(ketQua);

  if (g.verdict === 'WARN') {
    /* Chưa chạy lần nào. KHÔNG chặn — chặn thì không ai cài được lần đầu và
       người ta sẽ học cách bỏ qua bài này. Nhưng in to để không ai quên. */
    console.warn(
      '\n  ⚠  CHƯA CHẠY CANARY SỐNG LẦN NÀO.\n'
      + '     Toàn bộ phép thử hiện chạy trên dữ liệu tự dựng. Chúng KHÔNG biết\n'
      + '     e-GP vừa đổi tên trường hay bỏ một mã tỉnh.\n'
      + '     Chạy: mở tiện ích → Chẩn đoán → "Chạy canary sống"\n'
      + `     rồi lưu kết quả vào ${path.relative(ROOT, FILE)}\n`);
    return;
  }

  assert.equal(g.block, false,
    `CANARY SỐNG BÁO ĐỎ — ${g.reason}\n`
    + '  Đây là dấu hiệu e-GP đã đổi, không phải lỗi của phép thử.\n'
    + '  Đối chiếu lại các mã trong lib/canary-live.js trước khi phát hành.');
});

test('ngưỡng hết hạn đủ ngắn để còn ý nghĩa', () => {
  // Canary ba tháng tuổi thì không nói được gì về e-GP hôm nay, mà tin vào nó
  // còn tệ hơn không có — người ta sẽ tưởng đã kiểm rồi.
  assert.ok(CANARY_MAX_AGE_DAYS <= 14, 'quá 2 tuần thì kết quả không còn nói lên điều gì');
  assert.ok(CANARY_MAX_AGE_DAYS >= 7, 'ngắn hơn 1 tuần thì bản dựng bị chặn liên miên');
});
