/* ============================================================================
 *  LỌC THEO NGÀY CHO "KẾ HOẠCH LỰA CHỌN NHÀ THẦU"
 *
 *  Người dùng tra "đức trọng / Tỉnh Lâm Đồng" và nhận về kế hoạch năm 2025
 *  (PL2500319720) lẫn vào kế hoạch 2026, đồng thời phải xét 485 kế hoạch mới
 *  lấy được 100 vì chạm giới hạn trang.
 *
 *  HAI LỚP, cùng cách đã dùng ở lib/bbmt.js:
 *    1. MÁY CHỦ — filter `range` trên `publicDate`, đã NỚI BIÊN. Chỉ để thu hẹp
 *       cho nhanh; chưa có phép đo nào chứng minh e-GP lọc range được trên bản
 *       ghi `es-plan-project-p`.
 *    2. TẠI CHỖ — `khlcntInDateRange()` đối chiếu NGÀY PHÊ DUYỆT, đúng ngày
 *       hiển thị trên thẻ kết quả. Đây mới là thứ quyết định.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildKhlcntQuery, khlcntDateRange, khlcntInDateRange, KHLCNT_SERVER_PAD_DAYS
} from '../lib/khlcnt.js';
import { dateRangeFrom, parseDayMs, padRange, firstStampMs } from '../lib/core.js';

const dateFilters = (q) => q.filters.filter((f) => f.fieldName === 'publicDate');

/* --------------------------------------------------------------------------
 *  1. Bộ lọc gửi lên máy chủ
 * ------------------------------------------------------------------------ */

test('KHÔNG gửi bộ lọc ngày lên máy chủ cho màn hình kế hoạch', () => {
  /* Bài này trước đây đòi ngược lại: phải có một filter `range` trên publicDate,
     nới biên 30 ngày. Đã đổi từ 4.10.1, và đổi đúng.

     Máy chủ chỉ lọc được NGÀY ĐĂNG TẢI, còn người dùng chọn NGÀY PHÊ DUYỆT.
     Nới biên 30 ngày chỉ che được phần lớn độ lệch chứ không che hết: kế hoạch
     phê duyệt tháng 6 mà mãi tháng 8 mới đăng vẫn rơi ra ngoài biên và BỊ MẤT
     — không một lời báo. Bỏ hẳn lớp máy chủ thì chậm hơn, đổi lại không bỏ sót.

     Đây là cùng một kết luận đã áp dụng cho màn hình mở thầu: thà một lớp đúng
     còn hơn hai lớp mà một lớp nói sai chuyện. */
  for (const scope of [{ fromDate: '2026-06-01', toDate: '2026-09-02' }, { days: 90 }]) {
    assert.equal(dateFilters(buildKhlcntQuery(scope)).length, 0,
      `${JSON.stringify(scope)} không được sinh filter ngày gửi lên máy chủ`);
  }
  assert.equal(KHLCNT_SERVER_PAD_DAYS, 0, 'không còn nới biên vì không còn lớp máy chủ');
});

test('không còn greater_equal/less_equal — dạng e-GP bỏ qua lặng lẽ', () => {
  for (const scope of [{ days: 90 }, { fromDate: '2026-01-01', toDate: '2026-03-31' }]) {
    for (const f of buildKhlcntQuery(scope).filters) {
      assert.ok(!['greater_equal', 'less_equal'].includes(f.searchType),
        `${JSON.stringify(scope)} còn sinh searchType=${f.searchType}`);
    }
  }
});

test('không chọn thời gian thì không sinh bộ lọc khoảng', () => {
  assert.equal(dateFilters(buildKhlcntQuery({ investor: 'đức trọng' })).length, 0);
});

test('lớp tại chỗ vẫn khoanh đúng khoảng người dùng chọn', () => {
  // Bỏ lớp máy chủ thì lớp tại chỗ là lớp DUY NHẤT — càng phải đúng.
  const r = khlcntDateRange({ fromDate: '2026-06-01', toDate: '2026-09-02' });
  assert.equal(khlcntInDateRange({ decisionDate: '2026-06-01T05:00:00+07:00' }, r), true);
  assert.equal(khlcntInDateRange({ decisionDate: '2026-09-02T23:30:00+07:00' }, r), true);
  assert.equal(khlcntInDateRange({ decisionDate: '2026-05-31T23:30:00+07:00' }, r), false);
  assert.equal(khlcntInDateRange({ decisionDate: '2026-09-03T00:30:00+07:00' }, r), false);
});

test('bỏ lọc ngày ở máy chủ KHÔNG được làm mất bộ lọc địa bàn', () => {
  // Rủi ro khi gỡ một filter là gỡ nhầm cả các filter bên cạnh.
  const names = buildKhlcntQuery({ provinces: ['68', '703'], wards: ['23122'], days: 90 })
    .filters.map((f) => f.fieldName);
  assert.ok(names.includes('type'), 'vẫn phải lọc đúng loại bản ghi kế hoạch');
  assert.ok(names.includes('locations.provCode'), 'vẫn phải lọc tỉnh ở máy chủ');
  assert.ok(names.includes('locations.districtCode'), 'vẫn phải lọc xã/phường ở máy chủ');
});

/* --------------------------------------------------------------------------
 *  2. Lớp bảo đảm: lọc lại tại chỗ theo NGÀY PHÊ DUYỆT
 * ------------------------------------------------------------------------ */

test('kế hoạch năm cũ bị loại — đúng triệu chứng người dùng gặp', () => {
  const r = khlcntDateRange({ fromDate: '2026-06-01', toDate: '2026-09-02' });

  // Lấy từ đúng ảnh chụp màn hình người dùng gửi.
  const cu = { planNo: 'PL2500319720', decisionDate: '2025-11-20T10:00:00' };
  const moi = { planNo: 'PL2600286616', decisionDate: '2026-08-28T23:59:00' };

  assert.equal(khlcntInDateRange(cu, r), false, 'kế hoạch 2025 phải bị loại');
  assert.equal(khlcntInDateRange(moi, r), true, 'kế hoạch 28/8/26 phải được giữ');
});

test('đối chiếu NGÀY PHÊ DUYỆT trước, vì đó là ngày hiển thị trên thẻ', () => {
  const r = khlcntDateRange({ fromDate: '2026-08-01', toDate: '2026-08-31' });
  // Phê duyệt trong khoảng, đăng tải ngoài khoảng -> vẫn giữ.
  assert.equal(khlcntInDateRange(
    { decisionDate: '2026-08-15T09:00:00', publicDate: '2026-09-05T09:00:00' }, r), true);
  // Phê duyệt ngoài khoảng -> loại, dù đăng tải nằm trong.
  assert.equal(khlcntInDateRange(
    { decisionDate: '2025-08-15T09:00:00', publicDate: '2026-08-20T09:00:00' }, r), false);
});

test('thiếu ngày phê duyệt thì GIỮ LẠI, không lấy ngày đăng tải thay thế', () => {
  /* Đổi từ 4.10.1, và đổi đúng. Người dùng chọn "kế hoạch phê duyệt trong
     khoảng"; lấy ngày ĐĂNG TẢI thay vào là trả lời một câu hỏi khác rồi dán
     nhãn câu hỏi đã hỏi. Hai mốc này lệch nhau hàng tháng.

     Không có ngày phê duyệt thì câu trả lời đúng là CHƯA BIẾT — giữ lại để
     người dùng tự xem, chứ không tự quyết thay bằng một trường khác. */
  const r = khlcntDateRange({ fromDate: '2026-08-01', toDate: '2026-08-31' });
  assert.equal(khlcntInDateRange({ publicDate: '2026-08-15T09:00:00+07:00' }, r), true,
    'không có ngày phê duyệt -> giữ lại');
  assert.equal(khlcntInDateRange({ publicDate: '2025-08-15T09:00:00+07:00' }, r), true,
    'kể cả khi ngày ĐĂNG TẢI nằm ngoài khoảng, vẫn giữ vì chưa biết ngày phê duyệt');
  // Có ngày phê duyệt thì mới được phép loại.
  assert.equal(khlcntInDateRange(
    { decisionDate: '2025-08-15T09:00:00+07:00', publicDate: '2026-08-20T09:00:00+07:00' }, r), false);
});

test('kế hoạch không có mốc thời gian nào thì GIỮ LẠI', () => {
  const r = khlcntDateRange({ days: 90 });
  assert.equal(khlcntInDateRange({ planNo: 'PL2600000001' }, r), true,
    'loại bỏ là bịa ra kết luận từ chỗ không có dữ liệu');
});

test('không chọn khoảng thì giữ mọi kế hoạch', () => {
  assert.equal(khlcntInDateRange({ decisionDate: '2019-01-01T00:00:00' }, null), true);
});

test('hai biên của khoảng đều được giữ', () => {
  const r = khlcntDateRange({ fromDate: '2026-03-01', toDate: '2026-03-31' });
  assert.equal(khlcntInDateRange({ decisionDate: '2026-03-01T00:00:01' }, r), true);
  assert.equal(khlcntInDateRange({ decisionDate: '2026-03-31T23:59:00' }, r), true);
  assert.equal(khlcntInDateRange({ decisionDate: '2026-02-28T23:00:00' }, r), false);
  assert.equal(khlcntInDateRange({ decisionDate: '2026-04-01T00:30:00' }, r), false);
});

/* --------------------------------------------------------------------------
 *  3. Hàm dùng chung ở lib/core.js
 *
 *  Hai màn hình cùng gọi một chỗ, nên logic không thể lệch nhau.
 * ------------------------------------------------------------------------ */

test('parseDayMs từ chối ngày không tồn tại thay vì cuộn sang ngày khác', () => {
  // JavaScript tự cuộn: new Date(2026, 12, 45) ra 14/02/2027, 31/02 ra 03/03.
  for (const bad of ['2026-13-45', '2026-02-31', '2026-00-10', '31/02/2026', '', 'hôm qua']) {
    assert.equal(parseDayMs(bad), null, `${JSON.stringify(bad)} phải bị từ chối`);
  }
  assert.equal(typeof parseDayMs('2026-02-28'), 'number');
  assert.equal(typeof parseDayMs('2028-02-29'), 'number', '2028 là năm nhuận, 29/02 có thật');
  assert.equal(parseDayMs('2026-02-29'), null, '2026 không nhuận nên 29/02 không tồn tại');
});

test('padRange nới đều hai đầu và bỏ qua khoảng rỗng', () => {
  assert.equal(padRange(null), null);
  const r = padRange({ from: 1000, to: 2000 }, 1);
  assert.equal(r.from, 1000 - 86400000);
  assert.equal(r.to, 2000 + 86400000);
  // Biên 0 ngày thì giữ nguyên.
  assert.deepEqual(padRange({ from: 1000, to: 2000 }, 0), { from: 1000, to: 2000 });
});

test('firstStampMs lấy trường đầu tiên đọc được, bỏ qua trường rỗng', () => {
  // Mốc so sánh phải là 00:00 GIỜ VIỆT NAM, không phải `new Date(...)` — chuỗi
  // e-GP không kèm múi giờ, mà new Date() lại hiểu nó theo giờ máy.
  assert.equal(firstStampMs({ a: null, b: '2026-03-01T00:00:00' }, ['a', 'b']),
    Date.parse('2026-03-01T00:00:00+07:00'));
  assert.equal(firstStampMs({ a: 'không phải ngày' }, ['a']), null);
  assert.equal(firstStampMs({}, ['a', 'b']), null);
  assert.equal(firstStampMs(null, ['a']), null);
});

test('dateRangeFrom giữ đúng thứ tự ưu tiên cho cả hai màn hình', () => {
  const r = dateRangeFrom({ fromDate: '2026-02-01', toDate: '2026-02-28', fromYear: 2020, days: 7 });
  // So bằng chuỗi ISO tuyệt đối: getFullYear()/getDate() đọc theo giờ máy nên
  // ở múi giờ khác sẽ cho ngày khác, và bài kiểm thử tự sinh ra lỗi giả.
  assert.equal(new Date(r.from).toISOString(), '2026-01-31T17:00:00.000Z',
    'khoảng ngày phải thắng khoảng năm và N ngày');
  assert.equal(new Date(r.to).toISOString(), '2026-02-28T16:59:59.999Z');
});
