/* ============================================================================
 *  KHỚP XÃ / PHƯỜNG THEO MÃ  (B1.3)
 *
 *  Trước 4.11.0, bộ lọc xã/phường so CỤM CHỮ. Cách đó có hai đường hỏng ngược
 *  chiều nhau, và cả hai đều im lặng:
 *
 *    NHẬN NHẦM — cả nước có nhiều xã trùng tên. Người dùng ở Lâm Đồng đọc phải
 *                gói thầu của tỉnh khác, tưởng là cơ hội của mình.
 *    BỎ SÓT    — e-GP ghi "Xã Đức Trọng", "Đức Trọng", "Huyện Đức Trọng" (tên
 *                trước sáp nhập). Gõ một kiểu, gói ghi kiểu khác là mất hút.
 *
 *  Với người đi đấu thầu, BỎ SÓT đắt hơn nhiều: mất hẳn một cơ hội, và không
 *  bao giờ biết mình đã mất.
 *
 *  Mã xã thì duy nhất và chỉ có một kiểu viết. Nên thứ tự là MÃ trước, tên chỉ
 *  dùng để quy ra mã, và chỉ khi bản ghi không có mã nào mới lùi về so chữ.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';

import { matchesWardCodes, wardCodesForName, recordWardCodes } from '../lib/area-match.js';
import { passesHardFilter } from '../lib/hard-filter.js';

/* Danh mục địa bàn đúng hình dạng e-GP trả về: mỗi xã gắn `parentCode` là mã
   tỉnh. Cố tình dựng HAI xã trùng tên ở hai tỉnh — đó là ca cần phân biệt. */
const AREAS = {
  provinces: [
    { code: '68', name: 'Lâm Đồng' },
    { code: '703', name: 'Lâm Đồng' },   // mã cũ, cùng tên
    { code: '75', name: 'Đồng Nai' }
  ],
  wards: [
    { code: '23122', name: 'Xã Đức Trọng', parentCode: '68' },
    { code: '99001', name: 'Xã Đức Trọng', parentCode: '75' },  // TRÙNG TÊN, khác tỉnh
    { code: '23130', name: 'Xã Tà Hine', parentCode: '68' },
    { code: '70455', name: 'Xã Đức Trọng cũ', parentCode: '703' }
  ]
};

/* --------------------------------------------------------------------------
 *  1. Quy tên xã ra mã — phải giới hạn theo tỉnh
 * ------------------------------------------------------------------------ */

test('quy tên xã ra mã, GIỚI HẠN trong tỉnh đã chọn', () => {
  assert.deepEqual(wardCodesForName('Đức Trọng', ['68'], AREAS), ['23122']);
  assert.deepEqual(wardCodesForName('Đức Trọng', ['75'], AREAS), ['99001']);
});

test('không giới hạn tỉnh thì lấy hết mã trùng tên — và đó là lý do phải giới hạn', () => {
  const all = wardCodesForName('Đức Trọng', [], AREAS);
  assert.equal(all.length, 2, 'hai tỉnh cùng có xã tên Đức Trọng');
  assert.ok(all.includes('23122') && all.includes('99001'));
});

test('tiền tố đơn vị hành chính không làm lệch kết quả', () => {
  for (const cach of ['Đức Trọng', 'Xã Đức Trọng', 'xã đức trọng', 'Huyện Đức Trọng', 'ĐỨC TRỌNG']) {
    assert.deepEqual(wardCodesForName(cach, ['68'], AREAS), ['23122'],
      `"${cach}" phải ra cùng một mã`);
  }
});

/* --------------------------------------------------------------------------
 *  2. Lấy mã xã từ bản ghi e-GP
 * ------------------------------------------------------------------------ */

test('gom mã xã từ mọi chỗ e-GP có thể đặt nó', () => {
  assert.deepEqual(recordWardCodes({ locations: [{ districtCode: '23122' }] }), ['23122']);
  assert.deepEqual(recordWardCodes({ wardCode: '23122' }), ['23122']);
  assert.deepEqual(recordWardCodes({ districtCode: '23122' }), ['23122']);
});

test('bỏ qua mã 0 — chỉ mục TBMT trả districtCode = 0 cho mọi gói', () => {
  // Nhận 0 làm mã thật thì mọi gói TBMT sẽ "cùng một xã", loại sạch kết quả.
  assert.deepEqual(recordWardCodes({ locations: [{ districtCode: '0' }] }), []);
  assert.deepEqual(recordWardCodes({ districtCode: 0 }), []);
});

/* --------------------------------------------------------------------------
 *  3. Chặn NHẬN NHẦM — đây là điều cách so chữ không làm được
 * ------------------------------------------------------------------------ */

test('xã TRÙNG TÊN ở tỉnh khác bị loại, dù chuỗi chữ khớp hoàn toàn', () => {
  const cuaToi = { locations: [{ districtCode: '23122', districtName: 'Xã Đức Trọng' }] };
  const tinhKhac = { locations: [{ districtCode: '99001', districtName: 'Xã Đức Trọng' }] };

  assert.equal(matchesWardCodes(cuaToi, 'Đức Trọng', ['68'], AREAS).ok, true);

  const v = matchesWardCodes(tinhKhac, 'Đức Trọng', ['68'], AREAS);
  assert.equal(v.ok, false, 'tên giống hệt nhưng mã khác tỉnh -> phải loại');
  assert.equal(v.state, 'OUT_OF_RANGE', 'có đủ căn cứ để kết luận, không phải "chưa biết"');
  assert.equal(v.reason, 'ward');
});

/* --------------------------------------------------------------------------
 *  4. Chặn BỎ SÓT — cách viết tên khác nhau vẫn phải khớp
 * ------------------------------------------------------------------------ */

test('bản ghi không có mã thì so tên, và mọi cách viết đều khớp', () => {
  for (const ghi of ['Xã Đức Trọng', 'Đức Trọng', 'Huyện Đức Trọng']) {
    const r = { locations: [{ provCode: '68', districtName: ghi }] };
    assert.equal(matchesWardCodes(r, 'Đức Trọng', ['68'], AREAS).ok, true,
      `e-GP ghi "${ghi}" mà người dùng gõ "Đức Trọng" -> phải khớp`);
  }
});

test('chỉ có chuỗi địa điểm gộp thì vẫn dò được cụm từ', () => {
  const r = { location: 'Xã Đức Trọng - Tỉnh Lâm Đồng' };
  assert.equal(matchesWardCodes(r, 'Đức Trọng', ['68'], AREAS).ok, true);
});

/* --------------------------------------------------------------------------
 *  5. Không đủ dữ liệu thì nói CHƯA BIẾT, không nói "ngoài tiêu chí"
 * ------------------------------------------------------------------------ */

test('không có mã lẫn tên xã -> CHƯA ĐỦ DỮ LIỆU, giữ lại để người dùng tự xem', () => {
  const v = matchesWardCodes({ locations: [{ provCode: '68' }] }, 'Đức Trọng', ['68'], AREAS);
  assert.equal(v.state, 'INSUFFICIENT',
    'gói TBMT thường không có mã xã — xếp nó vào "ngoài tiêu chí" là vứt đi một gói có thể đúng');
  assert.equal(v.reason, 'insufficient-ward');
});

test('địa điểm có nhắc đơn vị hành chính khác thì mới dám nói ngoài tiêu chí', () => {
  const v = matchesWardCodes({ location: 'Xã Tà Hine - Tỉnh Lâm Đồng' }, 'Đức Trọng', ['68'], AREAS);
  assert.equal(v.state, 'OUT_OF_RANGE');
});

test('không chọn xã thì mọi bản ghi đều qua', () => {
  assert.equal(matchesWardCodes({}, '', ['68'], AREAS).ok, true);
  assert.equal(matchesWardCodes({}, null, [], null).ok, true);
});

/* --------------------------------------------------------------------------
 *  6. Nối đúng vào bộ lọc chung
 * ------------------------------------------------------------------------ */

test('passesHardFilter dùng đúng lớp khớp theo mã', () => {
  const criteria = { province: 'Lâm Đồng', ward: 'Đức Trọng' };

  const dung = passesHardFilter({ locations: [{ provCode: '68', districtCode: '23122' }] }, criteria, AREAS);
  assert.equal(dung.ok, true);

  // Cách viết tên khác -> vẫn giữ (chặn bỏ sót).
  const khacCach = passesHardFilter(
    { locations: [{ provCode: '68', districtName: 'Huyện Đức Trọng' }] }, criteria, AREAS);
  assert.equal(khacCach.ok, true, 'ghi tên kiểu cũ vẫn phải khớp');

  // Thiếu dữ liệu xã -> chưa đủ để kết luận, KHÔNG phải "ngoài tiêu chí".
  const thieu = passesHardFilter({ locations: [{ provCode: '68' }] }, criteria, AREAS);
  assert.equal(thieu.state, 'INSUFFICIENT');
  assert.equal(thieu.reason, 'insufficient-ward');
});

test('CỔNG XÃ tự nó chặn xã trùng tên, dù chuỗi tên khớp hoàn toàn', () => {
  /* Bài canh quan trọng nhất của cả tệp.

     Mười hai bài trên gọi THẲNG matchesWardCodes(), nên chúng vẫn xanh kể cả
     khi hàm đó không được nối vào bộ lọc. Chỉ đường đi qua passesHardFilter
     mới chứng minh việc nối đã xảy ra.

     Bản ghi dựng riêng để CÔ LẬP cổng xã: không có mã tỉnh (nên cổng tỉnh chỉ
     kết luận được "chưa đủ dữ liệu", không chặn thay), nhưng có mã xã của tỉnh
     KHÁC kèm tên trùng khít. Cách so chữ cũ sẽ cho qua vì tên khớp; cách theo
     mã phải loại. */
  const criteria = { province: 'Lâm Đồng', ward: 'Đức Trọng' };
  const maTinhKhac = {
    districtName: 'Xã Đức Trọng',
    locations: [{ districtCode: '99001', districtName: 'Xã Đức Trọng' }]
  };

  const v = passesHardFilter(maTinhKhac, criteria, AREAS);
  assert.equal(v.ok, false, 'tên khớp nhưng mã thuộc tỉnh khác -> phải loại');
  assert.equal(v.reason, 'ward', 'và phải loại VÌ XÃ, không phải vì lý do khác');
  assert.equal(v.state, 'OUT_OF_RANGE',
    'có mã để đối chiếu thì kết luận chắc chắn, không hạ xuống "chưa biết"');
});

test('mã cũ và mã mới của cùng một tỉnh đều được nhận', () => {
  // Lâm Đồng có cả 68 và 703 trong danh mục e-GP; chọn tỉnh phải lấy cả hai.
  const codes = wardCodesForName('Đức Trọng cũ', ['68', '703'], AREAS);
  assert.deepEqual(codes, ['70455']);
});
