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
 *  tin. Nên hai lớp phải cùng đúng, và cả hai đều được chốt ở đây:
 *      1. truy vấn gửi lên đúng định dạng e-GP hiểu
 *      2. dữ liệu tải về được lọc LẠI tại chỗ, bất kể máy chủ làm gì
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBbmtQuery, bbmtDateRange, bbmtInDateRange,
  bbmtReadState, bbmtReadStateOf, READ_STATE } from '../lib/bbmt.js';

const dateFilters = (q) => q.filters.filter((f) => /^publicDate/.test(f.fieldName));

/* --------------------------------------------------------------------------
 *  1. Định dạng bộ lọc gửi lên máy chủ
 * ------------------------------------------------------------------------ */

test('bộ lọc thời gian dùng range + epoch mili-giây, không phải chuỗi ISO', () => {
  const q = buildBbmtQuery({ days: 15 });
  const ranges = dateFilters(q).filter((f) => f.searchType === 'range');
  assert.equal(ranges.length, 1, 'phải có đúng một bộ lọc khoảng thời gian');

  const [f] = ranges;
  assert.equal(typeof f.from, 'number', '`from` phải là SỐ epoch ms');
  assert.equal(typeof f.to, 'number', '`to` phải là SỐ epoch ms');
  assert.ok(f.from < f.to);
  assert.equal(f.fieldValues, undefined, 'range không dùng fieldValues');
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

test('chỉ có MỘT bộ lọc khoảng thời gian, không chồng hai cái lên một trường', () => {
  // Trước đây `days` và `fromYear/toYear` cùng đẩy filter lên publicDateKqmt,
  // nên máy chủ nhận hai điều kiện chồng nhau trên cùng một trường.
  const q = buildBbmtQuery({ days: 15, fromYear: 2023, toYear: 2024, fromDate: '2026-01-01' });
  const ranges = dateFilters(q).filter((f) => f.searchType === 'range');
  assert.equal(ranges.length, 1);
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
  const r = bbmtDateRange({ fromDate: '2026-02-01', toDate: '2026-02-28', fromYear: 2020, days: 7 });
  assert.equal(new Date(r.from).getFullYear(), 2026);
  assert.equal(new Date(r.from).getMonth(), 1);
  assert.equal(new Date(r.from).getDate(), 1);
  assert.equal(new Date(r.to).getDate(), 28);
});

test('"đến ngày" bao trọn cả ngày đó, không cắt lúc 00:00', () => {
  const r = bbmtDateRange({ fromDate: '2026-03-01', toDate: '2026-03-01' });
  const to = new Date(r.to);
  assert.equal(to.getHours(), 23);
  assert.equal(to.getMinutes(), 59);
  // Gói mở thầu lúc 14:30 đúng ngày đó phải nằm trong khoảng.
  assert.ok(new Date(2026, 2, 1, 14, 30).getTime() <= r.to);
});

test('chọn ngược từ/đến thì tự hoán đổi thay vì trả khoảng rỗng', () => {
  const r = bbmtDateRange({ fromDate: '2026-05-31', toDate: '2026-05-01' });
  assert.ok(r.from < r.to, 'khoảng phải hợp lệ sau khi hoán đổi');
});

test('bỏ trống một đầu thì đầu đó không giới hạn', () => {
  const chiTuNgay = bbmtDateRange({ fromDate: '2026-01-01' });
  assert.ok(chiTuNgay.to >= Date.now() - 1000, 'thiếu "đến ngày" thì lấy tới hiện tại');

  const chiDenNgay = bbmtDateRange({ toDate: '2026-01-31' });
  assert.ok(new Date(chiDenNgay.from).getFullYear() <= 2000, 'thiếu "từ ngày" thì lấy từ rất xa');
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
