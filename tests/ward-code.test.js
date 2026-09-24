/* ============================================================================
 *  KHỚP XÃ/PHƯỜNG THEO MÃ, KHÔNG CHỈ THEO CHỮ  (B1.3)
 *
 *  HAI KIỂU HỎNG ÂM THẦM mà lớp này sinh ra để chặn:
 *
 *  1. NHẬN NHẦM — tiêu chí "Đức Trọng" khớp bằng cụm chữ, nên một xã TRÙNG TÊN
 *     ở tỉnh khác cũng lọt vào danh sách. Người dùng chuẩn bị hồ sơ cho một gói
 *     cách đó bốn trăm cây số.
 *
 *  2. BỎ SÓT — ngược lại, hồ sơ ghi tên xã theo lối cũ hoặc viết tắt thì cụm
 *     chữ không khớp, gói biến mất, và không có gì báo cho người dùng biết.
 *
 *  CÁCH BẢN 4.11.0 GIẢI: một xã được nhận dạng bằng CẶP (mã xã, mã tỉnh cha),
 *  không phải bằng mã xã trần và càng không phải bằng tên. Vì sao phải là cặp:
 *  mã xã của hai tỉnh khác nhau có thể trùng nhau, và sau đợt sáp nhập
 *  1/7/2025 thì e-GP giữ song song cả mã cũ lẫn mã mới.
 *
 *  Và quan trọng nhất: KHÔNG ĐỦ CĂN CỨ THÌ NÓI LÀ KHÔNG ĐỦ. Một cái tên xã
 *  không tra ra được đúng MỘT mã trong phạm vi tỉnh đã chọn thì kết luận là
 *  `Chưa đủ dữ liệu`, giữ gói lại cho người dùng tự xét — chứ không đoán, và
 *  cũng không lặng lẽ vứt đi.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';

import { matchesWardCodes, resolveWardSelection, recordWardIdentities } from '../lib/area-match.js';
import { passesHardFilter } from '../lib/hard-filter.js';

/* Danh mục địa bàn đúng hình dạng e-GP trả về: tỉnh, và xã theo mã tỉnh cha.
   Lâm Đồng có hai mã — `68` hiện hành và `703` trước sáp nhập. Đồng Nai `75`
   có một xã TRÙNG TÊN "Đức Trọng": đây chính là cái bẫy cần chặn. */
const AREAS = {
  provinces: [
    { code: '68',  name: 'Lâm Đồng',       parentCode: '', status: 1 },
    { code: '703', name: 'Tỉnh Lâm Đồng',  parentCode: '', status: 0 },
    { code: '75',  name: 'Đồng Nai',       parentCode: '', status: 1 }
  ],
  wardsByProvince: {
    68:  [{ code: '23122', name: 'Xã Đức Trọng', parentCode: '68' },
          { code: '23125', name: 'Xã Đơn Dương', parentCode: '68' }],
    703: [{ code: '70301', name: 'Xã Đạ Tẻh',    parentCode: '703' }],
    75:  [{ code: '24101', name: 'Xã Đức Trọng', parentCode: '75' },
          { code: '24102', name: 'Xã Tân Minh',  parentCode: '75' }]
  }
};

/* --------------------------------------------------------------------------
 *  1. Điều phải bảo đảm: xã trùng tên ở tỉnh khác KHÔNG lọt vào
 * ------------------------------------------------------------------------ */

test('xã TRÙNG TÊN ở tỉnh khác bị chặn, dù chuỗi tên khớp hoàn toàn', () => {
  const criteria = { province: 'Lâm Đồng', ward: 'Đức Trọng' };
  const xaDongNai = { wardCode: '24101', wardParentCode: '75', districtName: 'Xã Đức Trọng' };

  const v = matchesWardCodes(xaDongNai, criteria, AREAS);
  assert.equal(v.ok, false);
  assert.equal(v.state, 'OUT_OF_RANGE', 'đủ căn cứ để loại thì phải loại dứt khoát, không để lửng lơ');
  assert.equal(v.reason, 'ward');
});

test('đúng xã đúng tỉnh thì khớp', () => {
  const v = matchesWardCodes({ wardCode: '23122', wardParentCode: '68' },
    { province: 'Lâm Đồng', ward: 'Đức Trọng' }, AREAS);
  assert.equal(v.ok, true);
  assert.equal(v.state, 'MATCH');
});

test('cùng mã xã nhưng khác tỉnh cha vẫn bị chặn — nhận dạng là CẶP, không phải mã trần', () => {
  // Nếu chỉ so mã xã thì hai tỉnh trùng mã sẽ nhận nhầm nhau.
  const criteria = { wardIdentities: [{ code: '23122', parentCode: '68' }] };
  assert.equal(matchesWardCodes({ wardCode: '23122', wardParentCode: '68' }, criteria, AREAS).ok, true);
  assert.equal(matchesWardCodes({ wardCode: '23122', wardParentCode: '75' }, criteria, AREAS).ok, false);
});

/* --------------------------------------------------------------------------
 *  2. Điều phải bảo đảm: không đủ căn cứ thì NÓI RA, không đoán
 * ------------------------------------------------------------------------ */

test('tên xã mơ hồ giữa hai tỉnh đã chọn → CHƯA ĐỦ DỮ LIỆU, không tự chọn một bên', () => {
  // "Đức Trọng" có ở cả Lâm Đồng lẫn Đồng Nai. Chọn bừa một bên là đoán.
  const v = resolveWardSelection({ province: 'Lâm Đồng, Đồng Nai', ward: 'Đức Trọng' }, AREAS);
  assert.equal(v.ok, false);
  assert.equal(v.state, 'INSUFFICIENT');
  assert.equal(v.reason, 'unresolved-ward');
});

test('chọn xã mà chưa chọn tỉnh → CHƯA ĐỦ DỮ LIỆU', () => {
  // Không có phạm vi tỉnh thì một cái tên xã không định danh được gì.
  const v = resolveWardSelection({ ward: 'Đức Trọng' }, AREAS);
  assert.equal(v.state, 'INSUFFICIENT');
});

test('chưa tải được danh mục địa bàn → CHƯA ĐỦ DỮ LIỆU, không âm thầm bỏ tiêu chí xã', () => {
  // Bỏ qua tiêu chí xã khi thiếu danh mục là mở rộng phạm vi tìm mà không báo.
  const v = resolveWardSelection({ province: 'Lâm Đồng', ward: 'Đức Trọng' }, null);
  assert.equal(v.ok, false);
  assert.equal(v.state, 'INSUFFICIENT');
});

test('hồ sơ không ghi mã xã nào → CHƯA ĐỦ DỮ LIỆU, giữ lại cho người dùng xét', () => {
  const v = matchesWardCodes({ bidName: 'Kênh mương nội đồng' },
    { province: 'Lâm Đồng', ward: 'Đức Trọng' }, AREAS);
  assert.equal(v.state, 'INSUFFICIENT');
  assert.equal(v.reason, 'insufficient-ward');
});

test('KHÔNG chọn xã thì không lọc gì cả', () => {
  const v = matchesWardCodes({ wardCode: '24101', wardParentCode: '75' }, { province: 'Lâm Đồng' }, AREAS);
  assert.equal(v.selected, false);
  assert.equal(v.ok, true);
});

/* --------------------------------------------------------------------------
 *  3. Đọc mã từ hồ sơ: không được suy ra mã tỉnh bằng cách cắt mã xã
 * ------------------------------------------------------------------------ */

test('không cắt mã xã để đoán mã tỉnh', () => {
  /* Cắt hai chữ số đầu của mã xã ra làm mã tỉnh là một mẹo trông có vẻ đúng và
     sai âm thầm: cách đánh mã của e-GP không bảo đảm quan hệ đó, nhất là với
     các mã cũ giữ lại sau sáp nhập. */
  const chiCoMaXa = recordWardIdentities({ wardCode: '23122' });
  assert.ok(chiCoMaXa.every((v) => v.parentCode !== '23'),
    'đã suy ra mã tỉnh "23" bằng cách cắt mã xã — đây là đoán, không phải dữ liệu');
});

test('đọc được mã xã từ nhiều dạng e-GP trả về', () => {
  const tuLocations = recordWardIdentities({ locations: [{ districtCode: '23122', provCode: '68' }] });
  assert.ok(tuLocations.some((v) => v.code === '23122' && v.parentCode === '68'));

  // Chuỗi 'null' của e-GP không phải một mã.
  const rong = recordWardIdentities({ wardCode: 'null', wardParentCode: 'null' });
  assert.ok(rong.every((v) => v.code !== 'null'), "chuỗi 'null' bị nhận nhầm là mã xã");
});

/* --------------------------------------------------------------------------
 *  4. Nối vào cổng lọc thật — đây mới là thứ người dùng gặp
 * ------------------------------------------------------------------------ */

test('CỔNG LỌC: xã trùng tên tỉnh khác bị loại, kèm lý do đọc được', () => {
  const v = passesHardFilter({ bidName: 'Kênh mương Đức Trọng', wardCode: '24101', wardParentCode: '75' },
    { province: 'Lâm Đồng', ward: 'Đức Trọng' }, AREAS);
  assert.equal(v.ok, false);
  assert.equal(v.state, 'OUT_OF_RANGE');
  assert.equal(v.reason, 'ward');
});

test('CỔNG LỌC: thiếu mã xã thì xếp CHƯA ĐỦ DỮ LIỆU, không phải NGOÀI TIÊU CHÍ', () => {
  const v = passesHardFilter({ bidName: 'Kênh mương nội đồng N1' },
    { province: 'Lâm Đồng', ward: 'Đức Trọng' }, AREAS);
  assert.equal(v.state, 'INSUFFICIENT',
    'gộp vào "ngoài tiêu chí" là âm thầm vứt đi gói có thể đúng');
});
