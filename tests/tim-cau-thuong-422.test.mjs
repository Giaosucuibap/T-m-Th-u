/* ============================================================================
 *  TÌM BẰNG CÂU THƯỜNG (4.22.0) — lib/nl-query.js
 *
 *  Khoá: câu có dấu và không dấu cho cùng tiêu chí; giá (dưới/trên/từ–đến/khoảng/rưỡi),
 *  hạn đóng thầu (số ngày/tuần/tháng, tuần này, trước ngày), tỉnh (nhiều tỉnh, tên gọi tắt),
 *  loại gói, chủ đầu tư (tên có chứa tên tỉnh); từ khoá giữ nguyên dấu và KHÔNG mất các
 *  chữ dễ nhầm với từ đệm (kè, chợ, xe tải, cửa cống, Đức Trọng, Lâm Đồng).
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseNaturalQuery, foldSameLength, moneyShort, vnDateInput } from '../GiaoSuCuiBap/lib/nl-query.js';
import { parseMoney } from '../GiaoSuCuiBap/lib/core.js';
import { normalizeCategory } from '../GiaoSuCuiBap/lib/tender-categories.js';

const NOW = Date.parse('2026-11-11T03:00:00Z'); // thứ Tư 11/11/2026, 10:00 giờ Việt Nam
const q = (text, extra = {}) => parseNaturalQuery(text, { now: NOW, ...extra });

test('câu mẫu trong hướng dẫn: từ khoá, giá, tỉnh, hạn — có dấu và không dấu như nhau', () => {
  const a = q('kênh mương dưới 10 tỷ ở Lâm Đồng, đóng thầu trong hai tuần');
  assert.deepEqual(a.criteria, { maxPrice: 10e9, province: 'Lâm Đồng', keyword: 'kênh mương' });
  assert.deepEqual(a.view, { closeFrom: '2026-11-11', closeTo: '2026-11-25' });
  assert.deepEqual(a.understood.map((u) => u.kind).sort(), ['deadline', 'keyword', 'price', 'province']);
  const b = q('kenh muong duoi 10 ty o lam dong, dong thau trong hai tuan');
  assert.deepEqual({ ...b.criteria, keyword: '' }, { ...a.criteria, keyword: '' });
  assert.deepEqual(b.view, a.view);
  assert.equal(b.criteria.keyword, 'kenh muong');
});

test('giá: dưới, trên, từ–đến, gạch nối, khoảng, rưỡi, triệu, số có dấu phẩy/chấm', () => {
  assert.equal(q('hồ chứa dưới 3 tỷ rưỡi').criteria.maxPrice, 3.5e9);
  assert.equal(q('hồ chứa không quá 800 triệu').criteria.maxPrice, 8e8);
  assert.equal(q('hồ chứa <= 15 ty').criteria.maxPrice, 15e9);
  assert.equal(q('trạm bơm trên 5 tỷ').criteria.minPrice, 5e9);
  assert.equal(q('sửa chữa đập 500 triệu trở lên').criteria.minPrice, 5e8);
  assert.deepEqual(q('kè từ 3 đến 20 tỷ').criteria, { minPrice: 3e9, maxPrice: 20e9, keyword: 'kè' });
  assert.deepEqual(q('khoan phụt chống thấm đập 3-20 tỷ').criteria, { minPrice: 3e9, maxPrice: 20e9, keyword: 'khoan phụt chống thấm đập' });
  assert.deepEqual(q('kè sông 1.500 triệu đến 3 tỷ').criteria, { minPrice: 1.5e9, maxPrice: 3e9, keyword: 'kè sông' });
  const about = q('tư vấn giám sát hồ chứa nước khoảng 2,5 tỷ').criteria;
  assert.equal(about.minPrice, 1.75e9); assert.equal(about.maxPrice, 3.25e9);
  assert.equal(q('đập dâng mười tỷ trở xuống').criteria.maxPrice, 10e9);
  // Không có đơn vị tiền thì không đoán là giá.
  assert.equal(q('gói thầu số 3 đường QL20').criteria.maxPrice, undefined);
});

test('số tiền điền vào ô giá đọc lại đúng bằng bộ đọc giá của biểu mẫu', () => {
  for (const n of [5e8, 1.75e9, 3.5e9, 10e9, 20e9, 1.5e12]) assert.equal(parseMoney(moneyShort(n)), n, moneyShort(n));
  assert.equal(moneyShort(0), '');
});

test('hạn đóng thầu: còn N ngày, trong vòng tháng, tuần này, hôm nay, trước ngày; "ngày qua" không phải hạn', () => {
  assert.deepEqual(q('trạm bơm còn hạn 10 ngày').view, { closeFrom: '2026-11-11', closeTo: '2026-11-21' });
  assert.equal(q('trạm bơm trong vòng 1 tháng tới').view.closeTo, '2026-12-11');
  assert.deepEqual(q('sửa chữa đập đóng thầu tuần này').view, { closeFrom: '2026-11-11', closeTo: '2026-11-15' }, 'đến hết Chủ nhật');
  assert.deepEqual(q('đập đóng thầu hôm nay').view, { closeFrom: '2026-11-11', closeTo: '2026-11-11' });
  assert.equal(q('đóng thầu trước 25/11 thủy lợi').view.closeTo, '2026-11-25');
  assert.equal(q('đóng thầu trước 05/01 thủy lợi').view.closeTo, '2027-01-05', 'ngày đã qua trong năm thì hiểu là năm sau');
  const posted = q('đăng trong 7 ngày qua thủy lợi');
  assert.deepEqual(posted.view, {});
  assert.equal(posted.criteria.keyword, 'thủy lợi');
  assert.ok(posted.understood.some((u) => u.kind === 'ignored' && /ngày đăng/.test(u.text)), 'nói rõ phần bị bỏ qua');
  assert.equal(vnDateInput(Date.parse('2026-12-31T18:00:00Z')), '2027-01-01', 'ngày tính theo giờ Việt Nam');
});

test('tỉnh: nhiều tỉnh, tên gọi tắt, danh mục e-GP truyền vào; chữ "Đồng" trong tên tỉnh không bị coi là "đóng"', () => {
  assert.equal(q('kè chống sạt lở tại Đắk Lắk và Lâm Đồng').criteria.province, 'Lâm Đồng, Đắk Lắk');
  assert.equal(q('bàn ghế học sinh tp hcm').criteria.province, 'TP. Hồ Chí Minh');
  assert.equal(q('thủy lợi Đồng Nai đóng trong 2 tuần').criteria.province, 'Đồng Nai');
  assert.equal(q('thủy lợi Đồng Nai đóng trong 2 tuần').criteria.keyword, 'thủy lợi');
  assert.equal(q('gói của Ban QLDA huyện Đức Trọng ở Lâm Đồng trong vòng 1 tháng tới').criteria.province, 'Lâm Đồng');
  assert.equal(q('kênh ở tỉnh lâm đồng', { provinces: ['Tỉnh Lâm Đồng'] }).criteria.province, 'Tỉnh Lâm Đồng', 'dùng đúng cách viết của danh mục e-GP');
});

test('loại gói khớp đúng mã của biểu mẫu; "xây dựng" không tự thành Xây lắp', () => {
  const cases = { 'xây lắp trạm bơm': 'XL', 'thi công đường giao thông': 'XL', 'tư vấn giám sát hồ chứa': 'TV_SUPERVISION', 'tư vấn thiết kế đập dâng': 'TV_DESIGN',
    'phi tư vấn bảo vệ': 'PTV', 'mua sắm xe tải': 'HH', 'tvgs kênh N1': 'TV_SUPERVISION' };
  for (const [text, value] of Object.entries(cases)) { const c = q(text).criteria.category; assert.equal(c, value, text); assert.equal(normalizeCategory(c), value); }
  assert.equal(q('xây dựng chợ nông sản').criteria.category, undefined);
});

test('chủ đầu tư: xét trước tỉnh và loại gói, dừng ở dấu phẩy, ở chữ "ở/tại" và ở mệnh đề giá', () => {
  const a = q('nạo vét kênh của Ban QLDA đầu tư xây dựng huyện Đức Trọng dưới 3 tỷ rưỡi').criteria;
  assert.deepEqual(a, { maxPrice: 3.5e9, investor: 'Ban QLDA đầu tư xây dựng huyện Đức Trọng', keyword: 'nạo vét kênh' });
  const b = q('chủ đầu tư: Sở Nông nghiệp và Môi trường Lâm Đồng, thi công đường giao thông 10-50 tỷ').criteria;
  assert.equal(b.investor, 'Sở Nông nghiệp và Môi trường Lâm Đồng');
  assert.equal(b.province, undefined, 'tên tỉnh nằm trong tên cơ quan không thành tiêu chí tỉnh');
  assert.equal(b.category, 'XL'); assert.equal(b.keyword, 'đường giao thông');
  assert.equal(q('gói của Ban QLDA huyện Đức Trọng ở Lâm Đồng').criteria.investor, 'Ban QLDA huyện Đức Trọng');
});

test('từ khoá: bỏ lời mở đầu, giữ nguyên dấu, không mất chữ dễ nhầm với từ đệm', () => {
  assert.equal(q('tìm cho tôi các gói kè chống sạt lở từ 3 đến 20 tỷ').criteria.keyword, 'kè chống sạt lở');
  assert.equal(q('tim cho toi cac goi ke chong sat lo tu 3 den 20 ty').criteria.keyword, 'ke chong sat lo');
  assert.equal(q('danh sách các gói thầu tư vấn thiết kế đập dâng Đạ Tẻh trên 1 tỷ').criteria.keyword, 'đập dâng Đạ Tẻh');
  assert.equal(q('xây dựng chợ nông sản ở Hòa Bình').criteria.keyword, 'xây dựng chợ nông sản');
  assert.equal(q('mua sắm xe tải dưới 2 tỷ').criteria.keyword, 'xe tải');
  assert.equal(q('sửa chữa cửa cống ở lâm đồng').criteria.keyword, 'sửa chữa cửa cống');
  assert.equal(q('xây dựng gối cầu').criteria.keyword, 'xây dựng gối cầu');
  assert.equal(q('hồ chứa nước').criteria.keyword, 'hồ chứa nước');
  // Lời mở đầu còn sót lại sau khi một mệnh đề khác đã lấy phần sau ("gói xây lắp" là loại gói).
  assert.deepEqual(q('tìm các gói xây lắp ở Lâm Đồng dưới 900 tỷ').criteria, { maxPrice: 900e9, province: 'Lâm Đồng', category: 'XL' });
  assert.equal(q('xem những gói thi công ở Đắk Lắk').criteria.keyword, undefined);
  assert.equal(q('liệt kê tất cả các gói tư vấn giám sát').criteria.keyword, undefined);
});

test('câu rỗng hoặc chỉ có lời mở đầu: báo là chưa hiểu, không điền gì', () => {
  for (const text of ['', '   ', 'tìm gói thầu', 'tim goi thau', null, undefined]) { const r = q(text); assert.equal(r.empty, true, String(text)); assert.deepEqual(r.criteria, {}); }
  assert.equal(q('x'.repeat(2000)).criteria.keyword.length <= 200, true);
});

test('gập chữ giữ nguyên độ dài để vị trí khớp với câu gốc (kể cả chữ gõ dạng tổ hợp)', () => {
  const samples = ['Đắk Lắk – Lâm Đồng', 'kênh mương ở Lâm Đồng', 'é tổ hợp', 'ỹ Ỹ đ Đ'];
  for (const text of samples) assert.equal(foldSameLength(text).length, text.normalize('NFC').length, text);
  assert.equal(foldSameLength('Lâm Đồng'), 'lam dong');
});

test('trang Tìm gói có ô câu thường; kết quả chỉ ĐIỀN tiêu chí, người dùng tự bấm tìm', () => {
  const html = fs.readFileSync(new URL('../GiaoSuCuiBap/search.html', import.meta.url), 'utf8');
  const js = fs.readFileSync(new URL('../GiaoSuCuiBap/search.js', import.meta.url), 'utf8');
  assert.match(html, /id="nl-input"[^>]*enterkeyhint="search"/);
  assert.match(html, /id="nl-go"/);
  assert.ok(html.indexOf('id="nl-row"') < html.indexOf('id="search-form"'), 'ô câu thường đứng trước biểu mẫu');
  const fn = js.slice(js.indexOf('function applyNaturalQuery'), js.indexOf("$('nl-go').addEventListener"));
  assert.match(fn, /fillCriteria\(/);
  assert.doesNotMatch(fn, /send\('TBMT_SEARCH'/, 'không tự gửi truy vấn lên e-GP');
  assert.match(fn, /\$\('nl-run'\)\.addEventListener\('click',\(\)=>\$\('go'\)\.click\(\)\)/);
});
