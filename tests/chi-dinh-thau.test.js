/* ============================================================================
 *  GÓI CHỈ ĐỊNH THẦU — MÃ, LINK TRA CỨU VÀ ĐƯỜNG VỀ KẾ HOẠCH
 *
 *  LỖI THẬT, từ ảnh chụp màn hình người dùng gửi:
 *
 *    Phần mềm hiện   :  IB2600501375-null
 *    e-GP thật hiện  :  IB2600501375-00
 *
 *  và bấm vào link thì e-GP mở ra một trang TRẮNG TRƠN — mọi ô "Mã TBMT",
 *  "Ngày đăng tải", "Mã KHLCNT" đều rỗng.
 *
 *  NGUYÊN NHÂN: e-GP trả về nguyên văn CHUỖI 'null' cho `notifyVersion` của gói
 *  chỉ định thầu (loại không đi qua bước mở thầu nên thiếu hẳn nhiều trường).
 *  `cleanText('null')` trả lại 'null' — một chuỗi có nội dung — nên phép chống
 *  đỡ `|| '00'` không bao giờ chạy. Từ đó 'null' chui vào:
 *      · mã hiển thị,
 *      · khoá chống trùng,
 *      · và tham số của link tra cứu → trang trắng.
 *
 *  Hỏng theo dây chuyền từ một chỗ nhận nhầm "không có dữ liệu" thành "dữ liệu".
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanText, normalizeVersion, standardCode } from '../lib/core.js';
import { normalizeKqlcntRecord, buildKqlcntDetailUrl } from '../lib/kqlcnt.js';

/* Dựng lại đúng hình dạng bản ghi mà e-GP trả về cho gói chỉ định thầu:
   có mã, có giá, nhưng các trường thuộc quy trình mở thầu đều là chuỗi 'null'. */
const goiChiDinhThau = {
  id: '700123',
  notifyId: '700123',
  notifyNo: 'IB2600501375',
  notifyVersion: 'null',
  notifyNoStand: 'IB2600501375-null',
  planNo: 'PL2600298877',
  bidName: 'Thi công Cải tạo, nâng cấp hệ thống điện chiếu sáng trung tâm xã Tà Hine',
  investorName: 'Văn phòng Hội đồng nhân dân và Uỷ ban nhân dân xã Tà Hine',
  bidForm: 'CDTRG',
  bidPrice: 1748076757,
  bidWinningPrice: 1660672000,
  contractorName: 'Công ty TNHH XD TM DV Trí Khôi',
  winningCode: 'vn5801521187',
  decisionDate: '25/08/2026 23:59',
  // Không qua mạng nên không có bước mở thầu — e-GP trả 'null' cho cả loạt.
  inputResultId: 'null',
  bidOpenId: 'null',
  techReqId: 'null',
  processApply: 'null',
  bidMode: 'null',
  isInternet: 0
};

test("chuỗi 'null' của e-GP được coi là KHÔNG CÓ DỮ LIỆU", () => {
  for (const word of ['null', 'NULL', 'undefined', 'NaN', ' null ']) {
    assert.equal(cleanText(word), '', `${JSON.stringify(word)} phải thành rỗng`);
  }
  // Không được đụng vào dữ liệu thật.
  assert.equal(cleanText('Nhà văn hóa xã Cát Tiên 3'), 'Nhà văn hóa xã Cát Tiên 3');
  assert.equal(cleanText('IB2600501375'), 'IB2600501375');
  assert.equal(cleanText(0), '0', 'số 0 là giá trị thật, không phải rỗng');
});

test('thiếu phiên bản nghĩa là bản gốc 00, không phải rỗng', () => {
  assert.equal(normalizeVersion('null'), '00');
  assert.equal(normalizeVersion(null), '00');
  assert.equal(normalizeVersion(''), '00');
  assert.equal(normalizeVersion('0'), '00');
  assert.equal(normalizeVersion('1'), '01');
  assert.equal(normalizeVersion('00'), '00');
});

test('mã đầy đủ dựng lại đúng như e-GP hiển thị', () => {
  // Đúng ca trong ảnh: máy chủ gửi cả chuỗi hỏng, ta vẫn phải ra mã đúng.
  assert.equal(standardCode('IB2600501375-null', 'IB2600501375', 'null'), 'IB2600501375-00');
  assert.equal(standardCode(null, 'IB2600308584', null), 'IB2600308584-00');
  // Chuỗi máy chủ ĐỌC ĐƯỢC thì giữ nguyên, không tự dựng lại.
  assert.equal(standardCode('IB2600242483-01', 'IB2600242483', '1'), 'IB2600242483-01');
});

test('gói chỉ định thầu ra đúng mã như trên e-GP', () => {
  const p = normalizeKqlcntRecord(goiChiDinhThau, '');
  assert.equal(p.notifyNoStand, 'IB2600501375-00',
    'đây chính là con số người dùng đối chiếu với e-GP bằng mắt');
  assert.equal(p.version, '00');
  assert.ok(!JSON.stringify(p).includes('-null'), 'không còn chỗ nào mang chuỗi "-null"');
});

test('link tra cứu KHÔNG được mang chữ null, và không được để tham số rỗng', () => {
  const url = new URL(buildKqlcntDetailUrl(goiChiDinhThau));

  assert.ok(!url.search.includes('null'),
    `link còn chữ null nên e-GP mở ra trang trắng: ${url.search}`);

  /* Tham số thiếu phải ghi 'undefined' — đúng quy ước link do CHÍNH e-GP sinh
     ra. Để rỗng là một dạng giá trị khác hẳn, và bộ định tuyến của e-GP có thể
     không phân giải được. */
  for (const key of ['inputResultId', 'bidOpenId', 'techReqId', 'processApply', 'bidMode']) {
    assert.equal(url.searchParams.get(key), 'undefined',
      `${key} thiếu dữ liệu thì phải là 'undefined', đang là ${JSON.stringify(url.searchParams.get(key))}`);
  }

  // Những tham số định danh thì phải có thật, nếu không thì trang không mở được.
  assert.equal(url.searchParams.get('notifyNo'), 'IB2600501375');
  assert.equal(url.searchParams.get('id'), '700123');
  assert.equal(url.searchParams.get('planNo'), 'PL2600298877');
});

test('giữ mã kế hoạch để còn đường vòng khi trang chi tiết trắng trơn', () => {
  // Trang KQLCNT của e-GP hay trắng với gói chỉ định thầu. Đường chắc ăn là đi
  // qua KHLCNT, nên `planNo` PHẢI còn trong bản ghi đã chuẩn hoá — nút
  // "Xem KHLCNT" ở winners.js đọc đúng trường này.
  const p = normalizeKqlcntRecord(goiChiDinhThau, '');
  assert.equal(p.planNo, 'PL2600298877');
});

test('gói qua mạng bình thường không bị thay đổi gì', () => {
  // Phép chống hồi quy: bản sửa chỉ được chạm vào dữ liệu THIẾU.
  const goiQuaMang = {
    ...goiChiDinhThau,
    notifyNo: 'IB2600242483',
    notifyVersion: '1',
    notifyNoStand: 'IB2600242483-01',
    inputResultId: '55501',
    bidOpenId: '90210',
    processApply: 'MTQM',
    bidMode: 'MTQM',
    isInternet: 1
  };
  const p = normalizeKqlcntRecord(goiQuaMang, '');
  assert.equal(p.notifyNoStand, 'IB2600242483-01');
  assert.equal(p.version, '01');

  const url = new URL(buildKqlcntDetailUrl(goiQuaMang));
  assert.equal(url.searchParams.get('inputResultId'), '55501');
  assert.equal(url.searchParams.get('bidOpenId'), '90210');
  assert.equal(url.searchParams.get('processApply'), 'MTQM');
});
