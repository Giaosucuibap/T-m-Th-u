/* ============================================================================
 *  KHÔNG HỨA "CHÍNH XÁC TUYỆT ĐỐI" VỚI NGƯỜI DÙNG  (B1.5)
 *
 *  Dữ liệu nằm ở một hệ thống bên ngoài mà phần mềm này không kiểm soát: e-GP
 *  có thể đổi cấu trúc bất cứ lúc nào, BỎ QUA LẶNG LẼ bộ lọc nó không hiểu, và
 *  trả về chuỗi 'null' thay cho trường trống. Trên một nguồn như vậy, không
 *  phần mềm nào bảo đảm được tính tuyệt đối.
 *
 *  Hứa điều đó với người đi đấu thầu là có hại thật, không phải chuyện câu chữ:
 *  họ sẽ thôi đối chiếu lại với e-GP, và một lần bỏ sót sẽ không ai phát hiện.
 *
 *  Điều phần mềm LÀM ĐƯỢC và đang làm là chính xác KIỂM CHỨNG ĐƯỢC: mọi con số
 *  truy ngược được về nguồn, mọi chỗ thiếu dữ liệu đều được nói ra, và không
 *  bao giờ suy diễn từ chỗ không có dữ liệu. Câu chữ trên giao diện phải nói
 *  đúng điều đó.
 *
 *  PHẠM VI: chỉ soi chuỗi NGƯỜI DÙNG ĐỌC. Chú thích trong mã nguồn dùng cụm
 *  "tuyệt đối không được…" mang nghĩa hoàn toàn khác (một mệnh lệnh cho người
 *  lập trình), nên không bị tính.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Các lời hứa không giữ được. Mỗi mẫu kèm câu nên dùng thay thế. */
const LOI_HUA = [
  [/chính xác\s+tuyệt\s*đối/i, 'nói rõ cái gì được bảo đảm, ví dụ "không bỏ sót gói trúng theo liên danh"'],
  [/đầy\s*đủ\s+tuyệt\s*đối/i, 'dùng "đã đối soát với số e-GP công bố"'],
  [/không\s+bao\s+giờ\s+(?:sai|bỏ\s*sót)/i, 'nói phạm vi đã kiểm chứng, đừng hứa vô điều kiện'],
  [/(?:bảo\s*đảm|cam\s*kết)\s+(?:100%|chính xác)/i, 'bỏ lời cam kết; nêu điều kiện và giới hạn'],
  [/toàn\s+bộ\s+thị\s+trường/i, 'kho dữ liệu luôn là một phần; đừng gọi nó là toàn bộ thị trường']
];

/** Bóc chuỗi người dùng đọc: nội dung HTML, và literal trong JS. */
function chuoiNguoiDungDoc(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (file.endsWith('.html')) {
    return src.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  }
  // Bỏ chú thích trước, rồi chỉ giữ literal chuỗi — đó mới là thứ hiện lên màn hình.
  const khongChuThich = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
  return (khongChuThich.match(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g) || []).join('\n');
}

const TRANG = fs.readdirSync(ROOT).filter(f => /\.(html|js)$/.test(f) && !f.startsWith('.'));

test('không trang nào hứa "chính xác tuyệt đối" với người dùng', () => {
  const viPham = [];
  for (const file of TRANG) {
    const text = chuoiNguoiDungDoc(file);
    for (const [mau, thayBang] of LOI_HUA) {
      const hit = mau.exec(text);
      if (hit) viPham.push(`${file}: "${hit[0]}" — ${thayBang}`);
    }
  }
  assert.deepEqual(viPham, [], `Lời hứa không giữ được:\n  ${viPham.join('\n  ')}`);
});

test('README nêu giới hạn thay vì hứa hẹn', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  // Được phép dùng chữ "tuyệt đối" trong câu PHỦ ĐỊNH một cam kết
  // ("chưa cam kết tương thích tuyệt đối") — đó là nói rõ giới hạn.
  for (const [mau] of LOI_HUA) {
    const hit = mau.exec(readme);
    if (!hit) continue;
    const quanh = readme.slice(Math.max(0, hit.index - 60), hit.index + hit[0].length);
    assert.match(quanh, /(chưa|không|chớ|đừng)\s/i,
      `README hứa "${hit[0]}" mà không kèm phủ định nêu giới hạn`);
  }
});

test('các mẫu kiểm tra thật sự bắt được lời hứa', () => {
  // Phép tự kiểm: nếu bộ mẫu hỏng thì hai bài trên xanh một cách vô nghĩa.
  const mau = LOI_HUA.map(([m]) => m);
  assert.ok(mau.some(m => m.test('tra chính xác tuyệt đối')));
  assert.ok(mau.some(m => m.test('bảo đảm 100%')));
  assert.ok(mau.some(m => m.test('không bao giờ bỏ sót')));
  // Và không bắt nhầm chú thích lập trình.
  assert.ok(!mau.some(m => m.test('tuyệt đối không được đổi phase đó thành ERROR')));
});
