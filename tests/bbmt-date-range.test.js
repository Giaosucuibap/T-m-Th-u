/* ============================================================================
 *  LỌC THỜI GIAN CHO "GÓI ĐANG CHỜ KẾT QUẢ"
 *
 *  LỖI THẬT: người dùng chọn "Mở thầu trong vòng 15 ngày" (tháng 9/2026) nhưng
 *  kết quả trả về toàn gói mở thầu tháng 4–5 năm 2023.
 *
 *  Nguyên nhân: truy vấn cũ lọc bằng
 *      { fieldName:'publicDateKqmt', searchType:'greater_equal',
 *        fieldValues:['2026-08-18T...'] }
 *  e-GP KHÔNG hiểu dạng này và BỎ QUA LẶNG LẼ — không báo lỗi, chỉ trả về mọi
 *  gói từ trước tới nay. Dạng đã đo được là chạy đúng (xem lib/kqlcnt.js,
 *  buildWardMarketQuery) là `searchType:'range'` với from/to là SỐ epoch ms.
 *
 *  Vì máy chủ nuốt lỗi thay vì báo, bộ lọc phía máy chủ KHÔNG bao giờ đủ để
 *  tin. Lớp quyết định phải nằm tại chỗ.
 *
 *  CẬP NHẬT 4.9.0: bộ lọc ngày gửi lên máy chủ đã được BỎ HẲN ở màn hình này,
 *  không phải sửa lại định dạng. Lý do nằm trong bài đầu tiên dưới đây: trường
 *  duy nhất máy chủ lọc được là ngày ĐĂNG biên bản, không phải ngày MỞ thầu,
 *  nên lọc bằng nó là tự cắt mất gói vừa mở. Giữ lại một lớp duy nhất mà đúng,
 *  hơn là hai lớp trong đó một lớp nói sai chuyện.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBbmtQuery, bbmtDateRange, bbmtInDateRange,
  bbmtReadState, bbmtReadStateOf, READ_STATE } from '../lib/bbmt.js';

const dateFilters = (q) => q.filters.filter((f) => /^publicDate/.test(f.fieldName));

/* --------------------------------------------------------------------------
 *  1. Định dạng bộ lọc gửi lên máy chủ
 * ------------------------------------------------------------------------ */

test('KHÔNG gửi bộ lọc ngày lên máy chủ cho màn hình mở thầu', () => {
  /* Bài này trước đây đòi ngược lại: bắt buộc phải có một filter `range` trên
     publicDateKqmt. Đã đổi vì có bằng chứng từ dữ liệu thật.

     publicDateKqmt là ngày ĐĂNG biên bản, không phải ngày MỞ thầu. Gói
     IB2600486024 đăng 26/8/2026 nhưng bidRealityOpenDate là 5/9/2026. Người
     dùng hỏi "mở thầu trong khoảng nào", nên lọc máy chủ theo ngày đăng sẽ cắt
     mất gói vừa mở — BỎ SÓT, đúng thứ tệ nhất với người đi tìm việc.

     Nên máy chủ chỉ lọc những trường đã kiểm chứng (trạng thái, lĩnh vực, địa
     bàn, giá), còn khoảng ngày do bbmtInDateRange() đối chiếu tại chỗ trên
     bidRealityOpenDate. Chậm hơn một chút, đổi lấy không bỏ sót. */
  for (const scope of [{ days: 15 }, { fromDate: '2026-06-01', toDate: '2026-09-02' }]) {
    assert.equal(dateFilters(buildBbmtQuery(scope)).filter((f) => f.searchType === 'range').length, 0,
      `${JSON.stringify(scope)} không được sinh filter ngày gửi lên máy chủ`);
  }
});

test('bù lại: lớp tại chỗ soi NGÀY MỞ THẦU THỰC TẾ trước ngày đăng', () => {
  const r = bbmtDateRange({ fromDate: '2026-09-01', toDate: '2026-09-30' });
  // Đúng gói IB2600486024: đăng 26/8 (ngoài khoảng), mở thật 5/9 (trong khoảng).
  assert.equal(bbmtInDateRange(
    { publicDateKqmt: '2026-08-26T09:00:00+07:00', bidRealityOpenDate: '2026-09-05T09:00:00+07:00' }, r),
    true, 'gói mở 5/9 phải được giữ, dù đăng biên bản từ 26/8');
});

test('không còn dùng greater_equal/less_equal cho ngày — e-GP bỏ qua lặng lẽ', () => {
  for (const scope of [{ days: 15 }, { fromYear: 2024, toYear: 2025 },
    { fromDate: '2026-01-01', toDate: '2026-03-31' }]) {
    for (const f of dateFilters(buildBbmtQuery(scope))) {
      assert.ok(!['greater_equal', 'less_equal'].includes(f.searchType),
        `${JSON.stringify(scope)} còn sinh searchType=${f.searchType}, dạng e-GP không hiểu`);
    }
  }
});

test('nhiều cách chọn thời gian cùng lúc vẫn chỉ ra MỘT khoảng', () => {
  // Trước đây `days` và `fromYear/toYear` cùng đẩy filter lên publicDateKqmt,
  // nên máy chủ nhận hai điều kiện chồng nhau trên cùng một trường. Nay không
  // gửi lên máy chủ nữa, nhưng bất biến "một khoảng duy nhất" vẫn phải giữ ở
  // lớp tại chỗ, nếu không thì hai tiêu chí sẽ đá nhau.
  const r = bbmtDateRange({ days: 15, fromYear: 2023, toYear: 2024, fromDate: '2026-01-01', toDate: '2026-03-31' });
  assert.ok(r && typeof r.from === 'number' && typeof r.to === 'number');
  assert.ok(r.from < r.to);
  // 00:00 ngày 01/01/2026 giờ Việt Nam = 17:00 ngày 31/12/2025 UTC — nên KHÔNG
  // được đọc bằng getUTCFullYear() rồi mong thấy 2026. So chuỗi cho khỏi nhầm.
  assert.equal(new Date(r.from).toISOString(), '2025-12-31T17:00:00.000Z',
    'khoảng ngày phải thắng khoảng năm và "N ngày gần đây"');
});

test('vẫn giữ bộ lọc not_null để chỉ lấy gói đã đăng biên bản mở thầu', () => {
  const q = buildBbmtQuery({ days: 15 });
  assert.ok(q.filters.some((f) => f.fieldName === 'publicDateKqmt' && f.searchType === 'not_null'));
});

test('không chọn thời gian thì không sinh bộ lọc khoảng', () => {
  const ranges = dateFilters(buildBbmtQuery({})).filter((f) => f.searchType === 'range');
  assert.equal(ranges.length, 0);
});

/* --------------------------------------------------------------------------
 *  2. Quy đổi lựa chọn của người dùng thành khoảng
 * ------------------------------------------------------------------------ */

test('khoảng ngày tự chọn được ưu tiên hơn khoảng năm và "N ngày gần đây"', () => {
  // Đọc biên bằng getUTC*, KHÔNG bằng getFullYear/getDate: biên được neo vào
  // nửa đêm GIỜ VIỆT NAM, nên đọc bằng giờ máy sẽ ra ngày khác ở múi giờ khác
  // và bài kiểm thử lại tự tạo ra đúng loại lỗi nó đang đi tìm.
  const r = bbmtDateRange({ fromDate: '2026-02-01', toDate: '2026-02-28', fromYear: 2020, days: 7 });
  assert.equal(new Date(r.from).toISOString(), '2026-01-31T17:00:00.000Z',
    '00:00 ngày 01/02 giờ Việt Nam');
  assert.equal(new Date(r.to).toISOString(), '2026-02-28T16:59:59.999Z',
    '23:59:59.999 ngày 28/02 giờ Việt Nam');
});

test('"đến ngày" bao trọn cả ngày đó, không cắt lúc 00:00', () => {
  const r = bbmtDateRange({ fromDate: '2026-03-01', toDate: '2026-03-01' });
  // Gói mở thầu lúc 14:30 và lúc 23:45 GIỜ VIỆT NAM cùng ngày đều phải lọt.
  assert.equal(bbmtInDateRange({ bidRealityOpenDate: '2026-03-01T14:30:00+07:00' }, r), true);
  assert.equal(bbmtInDateRange({ bidRealityOpenDate: '2026-03-01T23:45:00+07:00' }, r), true);
  // Nửa đêm sang ngày hôm sau thì hết.
  assert.equal(bbmtInDateRange({ bidRealityOpenDate: '2026-03-02T00:15:00+07:00' }, r), false);
});

test('chọn ngược từ/đến thì tự hoán đổi thay vì trả khoảng rỗng', () => {
  const r = bbmtDateRange({ fromDate: '2026-05-31', toDate: '2026-05-01' });
  assert.ok(r.from < r.to, 'khoảng phải hợp lệ sau khi hoán đổi');
});

test('bỏ trống một đầu thì đầu đó không giới hạn', () => {
  const chiTuNgay = bbmtDateRange({ fromDate: '2026-01-01' });
  assert.ok(chiTuNgay.to >= Date.now() - 1000, 'thiếu "đến ngày" thì lấy tới hiện tại');

  const chiDenNgay = bbmtDateRange({ toDate: '2026-01-31' });
  assert.ok(new Date(chiDenNgay.from).getUTCFullYear() <= 2000, 'thiếu "từ ngày" thì lấy từ rất xa');
});

test('"N ngày gần đây" cho khoảng đúng bằng N ngày', () => {
  const r = bbmtDateRange({ days: 15 });
  const span = (r.to - r.from) / 86400000;
  assert.ok(Math.abs(span - 15) < 0.01, `khoảng phải là 15 ngày, đang là ${span}`);
});

test('ngày không hợp lệ bị bỏ qua, không tạo khoảng rác', () => {
  for (const bad of ['', '31/02/2026', 'hôm qua', '2026-13-45', null, undefined]) {
    assert.equal(bbmtDateRange({ fromDate: bad, toDate: bad }), null,
      `${JSON.stringify(bad)} không được tạo thành khoảng`);
  }
});

/* --------------------------------------------------------------------------
 *  3. Lớp bảo đảm: lọc lại tại chỗ
 *
 *  Đây là lớp duy nhất chắc chắn đúng, vì nó không phụ thuộc vào việc e-GP có
 *  tôn trọng bộ lọc hay không.
 * ------------------------------------------------------------------------ */

const goi = (iso) => ({ publicDateKqmt: iso });

test('gói ngoài khoảng bị loại — đúng triệu chứng người dùng gặp', () => {
  const r = bbmtDateRange({ fromDate: '2026-08-18', toDate: '2026-09-02' });

  // Bốn gói năm 2023 lấy từ đúng ảnh chụp màn hình người dùng gửi.
  for (const cu of ['2023-05-24T10:47:00', '2023-04-03T09:02:00',
    '2023-05-08T09:04:00', '2023-04-10T10:04:00']) {
    assert.equal(bbmtInDateRange(goi(cu), r), false, `${cu} phải bị loại`);
  }

  assert.equal(bbmtInDateRange(goi('2026-08-25T08:00:00'), r), true);
});

test('gói nằm đúng hai biên của khoảng vẫn được giữ', () => {
  const r = bbmtDateRange({ fromDate: '2026-03-01', toDate: '2026-03-31' });
  assert.equal(bbmtInDateRange(goi('2026-03-01T00:00:01'), r), true);
  assert.equal(bbmtInDateRange(goi('2026-03-31T23:59:00'), r), true);
  assert.equal(bbmtInDateRange(goi('2026-02-28T23:00:00'), r), false);
  assert.equal(bbmtInDateRange(goi('2026-04-01T00:30:00'), r), false);
});

test('thiếu publicDateKqmt thì lùi về ngày mở thầu thực tế', () => {
  const r = bbmtDateRange({ fromDate: '2026-03-01', toDate: '2026-03-31' });
  assert.equal(bbmtInDateRange({ bidRealityOpenDate: '2026-03-15T09:00:00' }, r), true);
  assert.equal(bbmtInDateRange({ bidOpenDate: '2023-03-15T09:00:00' }, r), false);
});

test('gói không có mốc thời gian nào thì GIỮ LẠI, không tự suy đoán', () => {
  const r = bbmtDateRange({ days: 15 });
  assert.equal(bbmtInDateRange({ notifyNo: 'IB2600000001' }, r), true,
    'loại gói thiếu dữ liệu là bịa ra kết luận từ chỗ không có dữ liệu');
});

test('không chọn khoảng thì giữ mọi gói', () => {
  assert.equal(bbmtInDateRange(goi('2019-01-01T00:00:00'), null), true);
});

/* --------------------------------------------------------------------------
 *  4. Khoảng giá — cùng một lớp lỗi, cùng một cách sửa
 * ------------------------------------------------------------------------ */

const priceFilters = (q) => q.filters.filter((f) => f.fieldName === 'bidPrice');

test('khoảng giá dùng range + số, không dùng greater_equal/less_equal', () => {
  const q = buildBbmtQuery({ minPrice: 3_000_000_000, maxPrice: 50_000_000_000 });
  const fs = priceFilters(q);
  assert.equal(fs.length, 1, 'phải là MỘT filter range, không phải hai filter chồng nhau');
  assert.equal(fs[0].searchType, 'range');
  assert.equal(fs[0].from, 3_000_000_000);
  assert.equal(fs[0].to, 50_000_000_000);
  assert.equal(fs[0].fieldValues, undefined);
});

test('chỉ nhập giá tối thiểu thì trần để rất cao, không bỏ sót gói lớn', () => {
  const [f] = priceFilters(buildBbmtQuery({ minPrice: 3_000_000_000 }));
  assert.equal(f.from, 3_000_000_000);
  assert.ok(f.to >= 9e14, 'thiếu giá trần thì phải để mở, không được thành 0');
});

test('không nhập giá thì không sinh bộ lọc giá', () => {
  assert.equal(priceFilters(buildBbmtQuery({ days: 15 })).length, 0);
});

/* --------------------------------------------------------------------------
 *  5. Bốn kết cục của một lần đọc biên bản
 *
 *  Người dùng báo: "có những gói đọc trước rồi nhưng lại không trả kết quả
 *  liền, có những gói sau nhưng có kết quả". Thực ra thứ tự đọc vẫn đúng — chỉ
 *  là gói đã đọc xong mà e-GP trả bảng rỗng lại mang nhãn "Chưa đọc", giống
 *  hệt gói còn chưa tới lượt.
 * ------------------------------------------------------------------------ */

test('phân biệt được có dữ liệu / rỗng / hết hạn chờ', () => {
  assert.equal(bbmtReadState([{ taxCode: '3401122219' }]), READ_STATE.OK);
  assert.equal(bbmtReadState([]), READ_STATE.EMPTY, 'bảng rỗng KHÁC với chưa đọc');
  assert.equal(bbmtReadState(null), READ_STATE.TIMEOUT);
  assert.equal(bbmtReadState(undefined), READ_STATE.TIMEOUT);
});

test('bảng rỗng không bao giờ bị coi là chưa đọc', () => {
  const daDoc = { scannedAt: '2026-09-02T08:00:00Z', bidders: [], readState: READ_STATE.EMPTY };
  assert.equal(bbmtReadStateOf(daDoc), READ_STATE.EMPTY);
  assert.notEqual(bbmtReadStateOf(daDoc), READ_STATE.PENDING);
});

test('gói chưa tới lượt là PENDING', () => {
  assert.equal(bbmtReadStateOf({ notifyNo: 'IB2600477094' }), READ_STATE.PENDING);
  assert.equal(bbmtReadStateOf(null), READ_STATE.PENDING);
});

test('đọc được dữ liệu lưu từ bản cũ chưa có readState', () => {
  const at = '2026-09-02T08:00:00Z';
  assert.equal(bbmtReadStateOf({ scannedAt: at, bidders: [{ a: 1 }] }), READ_STATE.OK);
  assert.equal(bbmtReadStateOf({ scannedAt: at, bidders: [] }), READ_STATE.EMPTY);
  assert.equal(bbmtReadStateOf({ scannedAt: at, bidders: null }), READ_STATE.TIMEOUT);
  assert.equal(bbmtReadStateOf({ bidders: null }), READ_STATE.PENDING, 'chưa scannedAt thì chưa đọc');
});
