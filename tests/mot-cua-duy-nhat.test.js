/* ============================================================================
 *  MỘT CỬA DUY NHẤT CHO LỌC, THỐNG KÊ VÀ XUẤT  (B1.4)
 *
 *  Lỗi cần chặn: bản Excel xuất ra KHÁC danh sách đang hiện trên màn hình.
 *
 *  Vì sao nó xảy ra: khi mỗi đường đi tự lọc theo cách riêng. Thêm một tiêu chí
 *  vào giao diện mà quên thêm vào đường xuất, thế là hai bên nói hai chuyện.
 *  Người dùng cầm bản Excel đi họp với con số không khớp thứ họ vừa nhìn thấy,
 *  và không có cách nào biết bên nào đúng.
 *
 *  Bản 4.11.0 gom về `lib/result-view.js`:
 *    • `createResultView()` — MỘT phép lọc, dùng chung cho danh sách, thống kê
 *      và bản xuất. Phân trang thuộc về phần vẽ, không được cắt kết quả này.
 *    • `verifyExportKeys()` — chốt chặn: danh sách khoá gửi kèm lệnh xuất phải
 *      TRÙNG KHÍT tập đang hiện; lệch một khoá là NÉM LỖI, không xuất im lặng.
 *
 *  Chốt chặn thứ hai chặt hơn hẳn cách chỉ "cùng gọi một hàm": kể cả khi màn
 *  hình gửi sai, bản xuất vẫn không thể lệch mà không ai biết.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { passesHardFilter, hardFilterReason, HARD_FILTER_REASON_LABELS } from '../lib/hard-filter.js';
import { createResultView, verifyExportKeys, resultRevision } from '../lib/result-view.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* --------------------------------------------------------------------------
 *  1. Mọi lý do loại trừ đều phải có nhãn tiếng Việt
 *
 *  Một lý do không nhãn sẽ hiện ra màn hình dưới dạng mã máy, hoặc rỗng. Khi đó
 *  người dùng thấy gói biến mất mà không biết vì sao — đúng thứ cổng ba trạng
 *  thái sinh ra để xoá bỏ.
 * ------------------------------------------------------------------------ */

test('mọi lý do loại trừ phát ra từ bộ lọc đều có nhãn', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib/hard-filter.js'), 'utf8');
  const phatRa = [...new Set([...src.matchAll(/add\('[a-z]+',\s*'([a-z-]+)'/g)].map((m) => m[1]))];
  assert.ok(phatRa.length >= 10, 'không dò được lý do nào — biểu thức dò đã hỏng');

  const thieu = phatRa.filter((r) => !Object.hasOwn(HARD_FILTER_REASON_LABELS, r));
  assert.deepEqual(thieu, [], `lý do chưa có nhãn: ${thieu.join(', ')}`);
});

test('lý do lạ không làm vỡ giao diện', () => {
  // Thà hiện một câu chung còn hơn hiện chuỗi rỗng hoặc "undefined".
  const s = hardFilterReason('mot-ly-do-chua-tung-co');
  assert.equal(typeof s, 'string');
  assert.ok(s.length > 0);
});

/* --------------------------------------------------------------------------
 *  2. Cổng phải THUẦN — cùng đầu vào, cùng kết quả
 *
 *  Nếu cổng phụ thuộc vào trạng thái ẩn (thời điểm gọi, thứ tự gọi, bộ nhớ
 *  đệm), thì lượt chấm lúc LƯU và lượt chấm lúc XUẤT có thể ra khác nhau — dù
 *  cùng một hàm. Đó là đường quay lại của chính lỗi đang chặn.
 * ------------------------------------------------------------------------ */

const AREAS = {
  provinces: [{ code: '68', name: 'Lâm Đồng' }, { code: '75', name: 'Đồng Nai' }],
  wards: [{ code: '23122', name: 'Xã Đức Trọng', parentCode: '68' }]
};

const HO_SO = [
  { bidName: 'Kênh mương Đức Trọng', price: 2e9, locations: [{ provCode: '68', districtCode: '23122' }] },
  { bidName: 'Đường xã Tân Minh',    price: 5e8, locations: [{ provCode: '75' }] },
  { bidName: 'Gói chưa rõ địa bàn',  price: 1e9, locations: [] },
  { bidName: 'Gói chưa công bố giá',            locations: [{ provCode: '68', districtCode: '23122' }] }
];

test('chấm hai lần cho cùng kết quả — cổng không mang trạng thái ẩn', () => {
  const criteria = { province: 'Lâm Đồng', minPrice: 1e9 };
  const lan1 = HO_SO.map((r) => passesHardFilter(r, criteria, AREAS));
  const lan2 = HO_SO.map((r) => passesHardFilter(r, criteria, AREAS));
  assert.deepEqual(lan2, lan1, 'cùng đầu vào phải cho cùng kết quả');

  const nguoc = [...HO_SO].reverse().map((r) => passesHardFilter(r, criteria, AREAS)).reverse();
  assert.deepEqual(nguoc, lan1, 'đảo thứ tự chấm vẫn phải ra cùng kết quả');
});

test('không sửa bản ghi gốc — nếu sửa, lượt chấm sau sẽ khác lượt trước', () => {
  const criteria = { province: 'Lâm Đồng' };
  const truoc = JSON.stringify(HO_SO);
  HO_SO.forEach((r) => passesHardFilter(r, criteria, AREAS));
  assert.equal(JSON.stringify(HO_SO), truoc, 'bộ lọc đã sửa dữ liệu đầu vào');
});

test('gói CHƯA ĐỦ DỮ LIỆU không bị lẫn vào nhóm "ngoài tiêu chí"', () => {
  // Gộp hai nhóm này là âm thầm vứt đi những gói có thể đúng. Người đi đấu
  // thầu mất cơ hội mà không bao giờ biết mình đã mất.
  const criteria = { province: 'Lâm Đồng', minPrice: 1e9 };
  assert.equal(passesHardFilter(HO_SO[2], criteria, AREAS).state, 'INSUFFICIENT');
  assert.equal(passesHardFilter(HO_SO[3], criteria, AREAS).state, 'INSUFFICIENT');
  assert.equal(passesHardFilter(HO_SO[1], criteria, AREAS).state, 'OUT_OF_RANGE',
    'có đủ căn cứ thì phải kết luận dứt khoát');
});

/* --------------------------------------------------------------------------
 *  3. BẢN XUẤT PHẢI TRÙNG KHÍT DANH SÁCH ĐANG HIỆN
 *
 *  Kiểm trên chính `lib/result-view.js` — cửa thật mà `lib/runtime-export.js`
 *  đi qua — chứ không mô phỏng lại phép lọc ở đây. Mô phỏng thì bài thử chỉ
 *  chứng minh bản mô phỏng đúng với chính nó.
 * ------------------------------------------------------------------------ */

const KHO = [
  { key:'k1', bidName:'Kênh mương Đức Trọng',  score:88, price:2e9,   closeDate:'2026-12-01', watchlisted:true,  locations:[{provCode:'68'}] },
  { key:'k2', bidName:'Hồ chứa Đạ Tẻh',        score:71, price:9e9,   closeDate:'2026-11-20', watchlisted:false, locations:[{provCode:'68'}] },
  { key:'k3', bidName:'Đường xã Tân Minh',     score:12, price:3e8,   closeDate:'2026-11-05', watchlisted:false, locations:[{provCode:'75'}] },
  { key:'k4', bidName:'Gói chưa công bố giá',  score:64,              closeDate:'2026-10-30', watchlisted:false, locations:[{provCode:'68'}] },
  { key:'k5', bidName:'Trạm bơm Cát Tiên',     score:95, price:1.4e10,closeDate:'2026-12-15', watchlisted:true,  locations:[{provCode:'68'}] }
];
const LUOT = { id:'r1', foundKeys:KHO.map(t => t.key), criteria:{ province:'Lâm Đồng' }, resultStates:{} };

const TO_HOP = [
  { ten:'không lọc thêm',          view:{ criteriaState:'' } },
  { ten:'chỉ gói KHỚP',            view:{ criteriaState:'MATCH' } },
  { ten:'chỉ CHƯA ĐỦ DỮ LIỆU',     view:{ criteriaState:'INSUFFICIENT' } },
  { ten:'chỉ NGOÀI TIÊU CHÍ',      view:{ criteriaState:'OUT_OF_RANGE' } },
  { ten:'điểm từ 70',              view:{ criteriaState:'', minScore:70 } },
  { ten:'chỉ gói đang theo dõi',   view:{ criteriaState:'', onlyWatch:true } },
  { ten:'tìm chữ trong tên',       view:{ criteriaState:'', text:'Đức Trọng' } },
  { ten:'theo mã tỉnh 68',         view:{ criteriaState:'', provinceCode:'68' } },
  { ten:'đóng thầu tới 30/11',     view:{ criteriaState:'', closeTo:'2026-11-30' } },
  { ten:'chồng nhiều bộ lọc',      view:{ criteriaState:'MATCH', minScore:70, onlyWatch:true } }
];

test('BẢN XUẤT trùng khít DANH SÁCH ĐANG HIỆN, ở mọi tổ hợp bộ lọc', () => {
  for (const { ten, view } of TO_HOP) {
    const hien = createResultView(KHO, LUOT, view).rows;
    // Đây đúng việc màn hình làm: gửi khoá của TOÀN BỘ danh sách sau lọc.
    const khoaGuiDi = hien.map((t) => t.key);
    const xuatRa = verifyExportKeys(createResultView(KHO, LUOT, view).rows, khoaGuiDi);
    assert.deepEqual(xuatRa.map((t) => t.key), khoaGuiDi,
      `"${ten}": bản xuất KHÁC danh sách đang hiện — người dùng sẽ cầm con số sai đi họp`);
  }
});

test('thống kê trên màn hình đếm đúng tập sẽ được xuất', () => {
  // Con số tóm tắt và bản xuất phải sinh ra từ cùng một lượt chấm. Lệch nhau
  // thì người dùng đọc một con số ở đầu trang và đếm ra con số khác trong file.
  for (const { ten, view } of TO_HOP) {
    const v = createResultView(KHO, LUOT, view);
    assert.equal(v.summary.total, v.rows.length, `"${ten}": tổng không khớp số dòng`);
    assert.equal(v.summary.match + v.summary.insufficient + v.summary.outOfRange, v.rows.length,
      `"${ten}": ba nhóm cộng lại không bằng tổng — có gói không thuộc nhóm nào`);
  }
});

test('XUẤT THIẾU một gói thì DỪNG, không xuất im lặng', () => {
  const hien = createResultView(KHO, LUOT, { criteriaState: '' }).rows;
  assert.ok(hien.length >= 3, 'dữ liệu mẫu phải đủ để bỏ bớt mà vẫn còn');
  assert.throws(() => verifyExportKeys(hien, hien.slice(1).map((t) => t.key)), /khớp toàn bộ danh sách/);
});

test('XUẤT THỪA một gói ngoài danh sách cũng DỪNG', () => {
  // Xuất thừa nguy hiểm ngang xuất thiếu: báo cáo mang gói không thuộc phạm vi.
  const hien = createResultView(KHO, LUOT, { criteriaState: 'MATCH' }).rows;
  assert.throws(() => verifyExportKeys(hien, [...hien.map((t) => t.key), 'k-khong-co-that']),
    /khớp toàn bộ danh sách/);
});

test('XUẤT TRÙNG một khoá hai lần cũng DỪNG', () => {
  const hien = createResultView(KHO, LUOT, { criteriaState: '' }).rows;
  const trung = [...hien.map((t) => t.key)];
  trung[1] = trung[0];
  assert.throws(() => verifyExportKeys(hien, trung), /khớp toàn bộ danh sách/);
});

test('phạm vi xuất vô lý bị chặn trước khi dựng tệp', () => {
  const hien = createResultView(KHO, LUOT, {}).rows;
  assert.throws(() => verifyExportKeys(hien, ['k1', 123]), /không hợp lệ/);
  assert.throws(() => verifyExportKeys(hien, new Array(10001).fill('k1')), /không hợp lệ/);
});

test('MỐC PHIÊN BẢN đổi khi kết quả đổi — nền của chốt chặn "tải lại rồi hãy xuất"', () => {
  /* Bản xuất chốt theo `revision`. Nếu mốc này không đổi khi dữ liệu đổi thì
     chốt chặn thành vô nghĩa: kho đã thay mà lệnh xuất cũ vẫn được nhận. */
  const a = resultRevision(createResultView(KHO, LUOT, {}).rows);
  assert.equal(a, resultRevision(createResultView(KHO, LUOT, {}).rows), 'cùng dữ liệu phải cùng mốc');

  const khoDoi = KHO.map((t) => (t.key === 'k1' ? { ...t, price: 3e9 } : t));
  assert.notEqual(a, resultRevision(createResultView(khoDoi, LUOT, {}).rows),
    'đổi giá một gói mà mốc không đổi — chốt chặn xuất sẽ bỏ lọt');

  /* Một gói MỚI của lượt khác thì KHÔNG được đổi kết quả lượt này — phạm vi
     một lượt tra cứu do `foundKeys` của nó định nghĩa, không phải do kho. */
  const goiLuotKhac = { key:'k6', bidName:'Gói của lượt khác', score:50, closeDate:'2026-12-20', locations:[{provCode:'68'}] };
  assert.equal(a, resultRevision(createResultView([...KHO, goiLuotKhac], LUOT, {}).rows),
    'gói ngoài lượt tra cứu đã lọt vào kết quả của lượt này');

  // Nhưng thuộc lượt này thì phải đổi.
  const luotRong = { ...LUOT, foundKeys: [...LUOT.foundKeys, 'k6'] };
  assert.notEqual(a, resultRevision(createResultView([...KHO, goiLuotKhac], luotRong, {}).rows),
    'thêm gói vào chính lượt này mà mốc không đổi — chốt chặn xuất sẽ bỏ lọt');
});

/* --------------------------------------------------------------------------
 *  4. Bản xuất phải NÓI ĐƯỢC vì sao mỗi gói nằm trong đó
 * ------------------------------------------------------------------------ */

test('mọi dòng trong bản xuất đều mang kết luận và lý do đọc được', () => {
  for (const row of createResultView(KHO, LUOT, { criteriaState: '' }).rows) {
    assert.ok(['MATCH', 'INSUFFICIENT', 'OUT_OF_RANGE'].includes(row.filterState),
      `gói "${row.bidName}" không mang kết luận đối chiếu`);
    assert.ok(String(row.filterReason || '').length > 0,
      `gói "${row.bidName}" bị xếp nhóm mà không giải thích được`);
  }
});
