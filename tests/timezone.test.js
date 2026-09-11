/* ============================================================================
 *  MỘT MÚI GIỜ DUY NHẤT CHO TOÀN BỘ PHẦN MỀM
 *
 *  LỖI THẬT, phát hiện khi hợp nhất 4.8.0 vào 4.2.0:
 *
 *    · `parseDate()` neo mốc thời gian của e-GP vào GIỜ VIỆT NAM (UTC+7) —
 *      đúng, vì e-GP công bố theo đồng hồ Việt Nam.
 *    · `parseDayMs()` lại dựng biên khoảng bằng GIỜ MÁY.
 *
 *  Hai cách neo khác nhau cho cùng một khái niệm "ngày". Trên máy đặt giờ Việt
 *  Nam thì trùng nhau nên không ai thấy gì; đổi múi giờ là lệch đúng 7 tiếng:
 *
 *      Kế hoạch phê duyệt 01/06/2026 lúc 05:00 giờ Việt Nam
 *        -> parseDate  = 2026-05-31T22:00:00Z
 *        -> biên dưới của "từ ngày 01/06" trên máy UTC = 2026-06-01T00:00:00Z
 *        -> 22:00 ngày 31/05 < 00:00 ngày 01/06  =>  BỊ LOẠI OAN
 *
 *  Người dùng chọn đúng ngày phê duyệt mà kế hoạch vẫn biến mất, không một lời
 *  báo lỗi. Đây là kiểu hỏng tệ nhất: im lặng, và chỉ lộ ra ở máy người khác.
 *
 *  Các bài dưới đây chạy lại đúng kịch bản đó ở NHIỀU múi giờ. Chúng chỉ có ý
 *  nghĩa khi `npm test` được chạy ở ít nhất một múi không phải UTC+7 — xem
 *  `npm run test:tz`.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDate, parseDayMs, dateRangeFrom, VN_UTC_OFFSET_HOURS } from '../lib/core.js';
import { khlcntInDateRange } from '../lib/khlcnt.js';
import { bbmtInDateRange, bbmtDateRange } from '../lib/bbmt.js';

const VN = (s) => parseDate(s);   // chuỗi giờ Việt Nam -> mốc tuyệt đối

test('biên của khoảng ngày là NỬA ĐÊM GIỜ VIỆT NAM, không phải nửa đêm giờ máy', () => {
  // 00:00 ngày 01/06/2026 giờ Việt Nam = 17:00 ngày 31/05/2026 UTC.
  assert.equal(new Date(parseDayMs('2026-06-01')).toISOString(), '2026-05-31T17:00:00.000Z');
  // 23:59:59.999 ngày 02/09/2026 giờ Việt Nam = 16:59:59.999 cùng ngày UTC.
  assert.equal(new Date(parseDayMs('2026-09-02', true)).toISOString(), '2026-09-02T16:59:59.999Z');
});

test('kết quả KHÔNG đổi theo múi giờ của máy — đúng kịch bản đã làm lộ lỗi', () => {
  const r = dateRangeFrom({ fromDate: '2026-06-01', toDate: '2026-09-02' });

  // Phê duyệt 05:00 sáng ngày ĐẦU khoảng, giờ Việt Nam. Đây là ca bị loại oan.
  assert.equal(khlcntInDateRange({ decisionDate: VN('01/06/2026 05:00') }, r), true,
    'kế hoạch phê duyệt sáng sớm ngày đầu khoảng phải được giữ');

  // Phê duyệt 23:30 ngày CUỐI khoảng, giờ Việt Nam. Ca đối xứng ở biên trên.
  assert.equal(khlcntInDateRange({ decisionDate: VN('02/09/2026 23:30') }, r), true,
    'kế hoạch phê duyệt tối muộn ngày cuối khoảng phải được giữ');

  // Ngay trước và ngay sau khoảng thì phải bị loại — biên không được nới lỏng.
  assert.equal(khlcntInDateRange({ decisionDate: VN('31/05/2026 23:30') }, r), false);
  assert.equal(khlcntInDateRange({ decisionDate: VN('03/09/2026 00:30') }, r), false);
});

test('màn hình mở thầu dùng chung đúng một quy ước giờ với màn hình kế hoạch', () => {
  const r = bbmtDateRange({ fromDate: '2026-09-01', toDate: '2026-09-30' });
  assert.equal(bbmtInDateRange({ bidRealityOpenDate: VN('01/09/2026 06:00') }, r), true);
  assert.equal(bbmtInDateRange({ bidRealityOpenDate: VN('30/09/2026 23:45') }, r), true);
  assert.equal(bbmtInDateRange({ bidRealityOpenDate: VN('31/08/2026 23:45') }, r), false);
});

test('chuỗi e-GP KHÔNG kèm múi giờ vẫn được hiểu là giờ Việt Nam', () => {
  /* Bài này được thêm sau khi bản đầu tiên của chính nó BỎ SÓT một lỗi.
     Bản đầu dựng dữ liệu mẫu bằng parseDate(), nên mọi chuỗi đều có hậu tố 'Z'
     — mà 'Z' thì `new Date()` cũng hiểu đúng. Thành ra bài kiểm thử không chạm
     tới được chỗ hỏng: firstStampMs() dùng thẳng `new Date(raw)`.

     e-GP thường trả chuỗi KHÔNG kèm múi giờ. Đó mới là ca phân biệt được đúng
     và sai, nên phải dùng nguyên dạng đó ở đây. */
  const r = dateRangeFrom({ fromDate: '2026-03-01', toDate: '2026-03-31' });

  // 23:59 ngày cuối khoảng, đúng dạng e-GP trả về.
  assert.equal(bbmtInDateRange({ publicDateKqmt: '2026-03-31T23:59:00' }, r), true,
    'gói mở thầu tối muộn ngày cuối khoảng phải được giữ');
  assert.equal(bbmtInDateRange({ publicDateKqmt: '2026-03-01T00:00:01' }, r), true,
    'gói ngay đầu ngày đầu khoảng phải được giữ');
  assert.equal(khlcntInDateRange({ decisionDate: '2026-03-31T23:59:00' }, r), true);

  // Và vẫn loại đúng những gói thật sự nằm ngoài.
  assert.equal(bbmtInDateRange({ publicDateKqmt: '2026-02-28T23:00:00' }, r), false);
  assert.equal(bbmtInDateRange({ publicDateKqmt: '2026-04-01T00:30:00' }, r), false);

  // Dạng dd/mm/yyyy của e-GP cũng phải cho cùng kết quả.
  assert.equal(bbmtInDateRange({ publicDateKqmt: '31/03/2026 23:59' }, r), true);
});

test('hằng số múi giờ chỉ khai báo MỘT chỗ', () => {
  assert.equal(VN_UTC_OFFSET_HOURS, 7);
  // Hai hàm phải khớp nhau: nửa đêm giờ Việt Nam do parseDayMs dựng phải đúng
  // bằng mốc mà parseDate quy ra cho cùng thời điểm đó.
  assert.equal(parseDayMs('2026-06-01'), Date.parse(parseDate('01/06/2026 00:00')));
});

test('parseDayMs vẫn từ chối ngày không tồn tại sau khi đổi sang UTC', () => {
  // Date.UTC cuộn ngày y hệt Date thường, nên phép kiểm phải nằm TRƯỚC lúc dựng.
  for (const bad of ['2026-13-45', '2026-02-31', '2026-00-10', '2026-02-29', '31/02/2026', '']) {
    assert.equal(parseDayMs(bad), null, `${JSON.stringify(bad)} phải bị từ chối`);
  }
  assert.equal(typeof parseDayMs('2028-02-29'), 'number', '2028 nhuận nên 29/02 có thật');
});
