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

test('bộ lọc thời gian dùng range + epoch mili-giây', () => {
  const fs = dateFilters(buildKhlcntQuery({ fromDate: '2026-06-01', toDate: '2026-09-02' }));
  assert.equal(fs.length, 1, 'phải có đúng một bộ lọc khoảng thời gian');
  assert.equal(fs[0].searchType, 'range');
  assert.equal(typeof fs[0].from, 'number');
  assert.equal(typeof fs[0].to, 'number');
  assert.equal(fs[0].fieldValues, undefined, 'range không dùng fieldValues');
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

test('khoảng gửi lên máy chủ được NỚI BIÊN so với khoảng người dùng chọn', () => {
  // Máy chủ soi ngày ĐĂNG TẢI, lớp tại chỗ soi ngày PHÊ DUYỆT. Hai mốc lệch
  // nhau vài ngày; không nới biên thì máy chủ cắt mất kế hoạch mà lớp tại chỗ
  // lẽ ra giữ — tức là BỎ SÓT.
  const scope = { fromDate: '2026-06-01', toDate: '2026-09-02' };
  const chon = dateRangeFrom(scope);
  const [f] = dateFilters(buildKhlcntQuery(scope));
  const padMs = KHLCNT_SERVER_PAD_DAYS * 86400000;

  assert.equal(f.from, chon.from - padMs);
  assert.equal(f.to, chon.to + padMs);
  assert.ok(f.from < chon.from, 'biên dưới phải rộng hơn khoảng người dùng chọn');
  assert.ok(f.to > chon.to, 'biên trên phải rộng hơn khoảng người dùng chọn');
});

test('bộ lọc ngày không thay thế bộ lọc địa bàn và loại bản ghi', () => {
  const q = buildKhlcntQuery({
    provinces: ['68', '703'], wards: ['23122'], days: 90
  });
  const names = q.filters.map((f) => f.fieldName);
  assert.ok(names.includes('type'));
  assert.ok(names.includes('locations.provCode'));
  assert.ok(names.includes('locations.districtCode'));
  assert.ok(names.includes('publicDate'));
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

test('thiếu ngày phê duyệt thì lùi về ngày đăng tải', () => {
  const r = khlcntDateRange({ fromDate: '2026-08-01', toDate: '2026-08-31' });
  assert.equal(khlcntInDateRange({ publicDate: '2026-08-15T09:00:00' }, r), true);
  assert.equal(khlcntInDateRange({ publicDate: '2025-08-15T09:00:00' }, r), false);
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
  assert.equal(firstStampMs({ a: null, b: '2026-03-01T00:00:00' }, ['a', 'b']),
    new Date('2026-03-01T00:00:00').getTime());
  assert.equal(firstStampMs({ a: 'không phải ngày' }, ['a']), null);
  assert.equal(firstStampMs({}, ['a', 'b']), null);
  assert.equal(firstStampMs(null, ['a']), null);
});

test('dateRangeFrom giữ đúng thứ tự ưu tiên cho cả hai màn hình', () => {
  const r = dateRangeFrom({ fromDate: '2026-02-01', toDate: '2026-02-28', fromYear: 2020, days: 7 });
  assert.equal(new Date(r.from).getFullYear(), 2026, 'khoảng ngày phải thắng khoảng năm và N ngày');
  assert.equal(new Date(r.to).getDate(), 28);
});
