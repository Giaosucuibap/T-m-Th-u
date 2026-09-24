/* ============================================================================
 *  SẮP XẾP NHANH MÀ KHÔNG ĐỔI THỨ TỰ
 *
 *  VẤN ĐỀ ĐO ĐƯỢC: `compareTenders` gọi `decisionRank`, mà hàm này lại gọi
 *  `statusOf` và `daysToClose` — cả hai phân tích chuỗi ngày. Sắp n phần tử cần
 *  ~n·log₂n phép so sánh, mỗi phép chạy chúng HAI lần. Kho 20.000 gói là
 *  ~570.000 lần phân tích ngày cho MỘT lần sắp, đo được 2.198 ms — và nó chạy
 *  lại mỗi lần người dùng gõ một phím vào ô tìm hoặc đổi bộ lọc.
 *
 *  CÁCH SỬA: tính khoá sắp xếp một lần cho mỗi dòng rồi so sánh trên số đã
 *  tính. Đo lại: 357 ms. Cả lượt vẽ màn hình từ 2.309 ms xuống 460 ms.
 *
 *  CÁI GIÁ PHẢI CANH: tối ưu kiểu này chỉ đúng khi mọi khoá CHỈ phụ thuộc vào
 *  chính dòng đó, không phụ thuộc cặp đang so sánh. Sai một chỗ là thứ tự đổi
 *  âm thầm — người dùng thấy gói khác lên đầu danh sách mà không hiểu vì sao,
 *  và đó là kiểu hỏng không ai báo lỗi. Bài này khoá lại điều đó.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';

import { filterAndSort, compareTenders } from '../lib/decision.js';

/** Bộ dữ liệu cố ý lắm trường hợp biên: thiếu giá, thiếu ngày, điểm null,
 *  gói đã đóng, gói kế hoạch, ngày quá khứ. */
function khoMau(n = 600) {
  const P = ['68', '75', '56'];
  return Array.from({ length: n }, (_, i) => ({
    key: 'k' + i,
    bidName: 'Gói thầu số ' + i,
    price: [null, 0, 1e9 + (i % 997) * 1e6, undefined][i % 4],
    score: [0, i % 101, null, 100][i % 4],
    closeDate: [`2026-1${i % 2 ? 1 : 2}-${String(1 + (i % 28)).padStart(2, '0')}T09:00:00`,
      '', null, '2024-01-05T09:00:00'][i % 4],
    matched: i % 3 === 0,
    watchlisted: i % 17 === 0,
    status: ['OPEN', 'CLOSED', 'PLAN', ''][i % 4],
    locations: [{ provCode: P[i % 3] }]
  }));
}

const KIEU_SAP = ['', 'score', 'price', 'deadline'];

test('thứ tự sau tối ưu TRÙNG KHỚP thứ tự do compareTenders sinh ra', () => {
  const kho = khoMau();
  for (const sortBy of KIEU_SAP) {
    const moi = filterAndSort(kho, { sortBy }).map((t) => t.key);
    const cu = [...kho].sort((a, b) => compareTenders(a, b, sortBy)).map((t) => t.key);
    assert.deepEqual(moi, cu, `sortBy="${sortBy || '(mặc định)'}" cho thứ tự KHÁC`);
  }
});

test('thứ tự không phụ thuộc thứ tự đầu vào', () => {
  // Nếu còn phụ thuộc thì hai lượt tra cùng tiêu chí sẽ cho hai bảng khác nhau.
  const kho = khoMau();
  for (const sortBy of KIEU_SAP) {
    const xuoi = filterAndSort(kho, { sortBy }).map((t) => t.key);
    const nguoc = filterAndSort([...kho].reverse(), { sortBy }).map((t) => t.key);
    assert.deepEqual(nguoc, xuoi, `sortBy="${sortBy}" đổi kết quả khi đảo đầu vào`);
  }
});

test('KHÔNG sửa mảng gốc và KHÔNG gắn thêm trường đếm được vào bản ghi', () => {
  /* Gắn một trường đếm được lên bản ghi là nó sẽ theo vào tệp Excel, vào bản
     sao lưu, và làm đổi mốc phiên bản kết quả — chốt chặn "tải lại rồi hãy
     xuất" sẽ báo nhầm là dữ liệu đã thay đổi. */
  const kho = khoMau(50);
  const truoc = JSON.stringify(kho);
  const khoaTruoc = kho.map((t) => Object.keys(t).join(','));
  for (const sortBy of KIEU_SAP) filterAndSort(kho, { sortBy });
  assert.equal(JSON.stringify(kho), truoc, 'đã sửa dữ liệu gốc');
  assert.deepEqual(kho.map((t) => Object.keys(t).join(',')), khoaTruoc, 'đã gắn thêm trường đếm được');
});

test('bộ đệm chuỗi tìm kiếm KHÔNG lọt vào JSON, Excel hay bản sao lưu', () => {
  /* Chuỗi tìm kiếm đã chuẩn hoá được gắn lên bản ghi để khỏi tính lại mỗi lần
     gõ phím. Nó phải VÔ HÌNH với mọi thứ đọc bản ghi bằng cách duyệt khoá. */
  const kho = khoMau(20);
  const truoc = JSON.stringify(kho);
  filterAndSort(kho, { text: 'gói thầu' });
  assert.equal(JSON.stringify(kho), truoc, 'bộ đệm đã lọt vào JSON');
  for (const t of kho) {
    assert.ok(!Object.keys(t).some((k) => k.startsWith('__')), 'bộ đệm đếm được khi duyệt khoá');
  }
});

test('lọc theo chữ vẫn đúng sau khi có bộ đệm', () => {
  const kho = [
    { key: 'a', bidName: 'Thi công kênh mương Đức Trọng', score: 1 },
    { key: 'b', bidName: 'Mua sắm bàn ghế', score: 1 },
    { key: 'c', bidName: 'Kênh mương nội đồng', investorName: 'Ban QLDA Đức Trọng', score: 1 }
  ];
  assert.deepEqual(filterAndSort(kho, { text: 'đức trọng' }).map((t) => t.key).sort(), ['a', 'c']);
  // Không dấu vẫn phải tìm ra — người dùng hay gõ không dấu.
  assert.deepEqual(filterAndSort(kho, { text: 'duc trong' }).map((t) => t.key).sort(), ['a', 'c']);
  assert.deepEqual(filterAndSort(kho, { text: 'ban ghe' }).map((t) => t.key), ['b']);

  // Và bộ đệm phải theo kịp khi TÊN GÓI ĐỔI — e-GP sửa tên gói là chuyện thường.
  const doiTen = kho.map((t) => (t.key === 'b' ? { ...t, bidName: 'Mua sắm máy bơm' } : t));
  assert.deepEqual(filterAndSort(doiTen, { text: 'may bom' }).map((t) => t.key), ['b']);
  assert.deepEqual(filterAndSort(doiTen, { text: 'ban ghe' }).map((t) => t.key), []);
});
