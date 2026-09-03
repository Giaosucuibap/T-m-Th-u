/* ============================================================================
 *  HỢP ĐỒNG GIỮA TRANG GIAO DIỆN VÀ TẦNG NỀN
 *
 *  Lỗi thật đã xảy ra khi thêm bộ lọc ngày cho màn hình KHLCNT:
 *    · `plans.js` gửi lên `fromDate`/`toDate`/`days`;
 *    · `startPlanLookup()` chỉ ĐỌC `fromDate`, `toDate` mà không khai báo, nên
 *      chết ngay với "fromDate is not defined";
 *    · sau khi khai báo thì `days` vẫn bị rơi lặng lẽ — chọn "3 tháng gần đây"
 *      mà chẳng lọc gì cả, không một lời báo lỗi.
 *
 *  Chỗ này chỉ có Chromium mới phát hiện được, mà máy bàn giao lại không có
 *  Chromium. Nên phép thử dưới đây đối chiếu bằng văn bản: mỗi khoá mà trang
 *  giao diện gửi đi phải có một chỗ đọc `payload.<khoá>` tương ứng ở tầng nền,
 *  và phải được đưa tiếp vào tiêu chí lẫn truy vấn.
 *
 *  Đây là phép đối chiếu thô, KHÔNG thay thế được `tools/test/plans-e2e.mjs`.
 *  Nó chỉ chặn đúng một kiểu sai: giao diện gửi thứ tầng nền không nhận.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const BG = read('background.js');

/** Cắt lấy thân một hàm ở cấp cao nhất: từ dòng khai báo tới hàm kế tiếp.
 *  Đếm ngoặc nhọn thì hỏng vì `payload={}` ngay trong danh sách tham số, còn
 *  chuỗi và biểu thức chính quy trong thân hàm cũng có ngoặc. Cắt theo mốc
 *  "hàm kế tiếp ở đầu dòng" là thứ duy nhất chắc chắn đúng ở đây. */
function bodyOf(src, name) {
  const start = src.indexOf(`\nasync function ${name}(`);
  assert.notEqual(start, -1, `không tìm thấy ${name}() trong background.js`);
  const rest = src.slice(start + 1);
  const next = /\n(?:async )?function [A-Za-z_$]/.exec(rest.slice(1));
  return next ? rest.slice(0, next.index + 1) : rest;
}

/* Khoá mỗi màn hình gửi đi -> hàm tiếp nhận ở tầng nền. */
const HOP_DONG = [
  {
    man: 'plans.js — Kế hoạch lựa chọn nhà thầu',
    ham: 'startPlanLookup',
    khoa: ['investor', 'province', 'ward', 'keyword', 'fromDate', 'toDate', 'days']
  },
  {
    man: 'bidopen.js — Gói đang chờ kết quả',
    ham: 'startBidOpenScan',
    khoa: ['fromDate', 'toDate']
  }
];

for (const { man, ham, khoa } of HOP_DONG) {
  test(`${man}: tầng nền đọc đủ mọi khoá giao diện gửi lên`, () => {
    const than = bodyOf(BG, ham);
    for (const k of khoa) {
      assert.ok(than.includes(`payload.${k}`),
        `${ham}() không đọc payload.${k} — giao diện gửi mà tầng nền bỏ qua lặng lẽ`);
    }
  });
}

test('startPlanLookup: khoá thời gian phải vào CẢ tiêu chí lẫn truy vấn', () => {
  const than = bodyOf(BG, 'startPlanLookup');

  // criteria: lớp lọc lại tại chỗ (ingestPlanPage) đọc từ đây.
  const criteria = /criteria:\{([^}]*)\}/.exec(than);
  assert.ok(criteria, 'không thấy khối criteria trong startPlanLookup()');
  for (const k of ['fromDate', 'toDate', 'days']) {
    assert.ok(criteria[1].includes(k),
      `criteria thiếu ${k} — khlcntDateRange() sẽ không thấy khoảng người dùng chọn`);
  }

  // buildKhlcntQuery: bộ lọc gửi lên máy chủ, để thu hẹp cho nhanh.
  const query = /buildKhlcntQuery\(\{([^}]*)\}\)/.exec(than);
  assert.ok(query, 'không thấy lời gọi buildKhlcntQuery() trong startPlanLookup()');
  for (const k of ['fromDate', 'toDate', 'days']) {
    assert.ok(query[1].includes(k), `buildKhlcntQuery() thiếu ${k}`);
  }
});

test('mọi biến thời gian dùng trong startPlanLookup đều đã được khai báo', () => {
  // Đúng lỗi "fromDate is not defined": đọc mà quên khai báo.
  const than = bodyOf(BG, 'startPlanLookup');
  for (const k of ['fromDate', 'toDate', 'days']) {
    assert.ok(new RegExp(`const\\s+${k}\\s*=`).test(than),
      `${k} được dùng nhưng không có "const ${k}=" trong startPlanLookup()`);
  }
});

test('trang KHLCNT gửi đúng ba khoá thời gian, không thừa không thiếu', () => {
  const js = read('plans.js');
  assert.ok(/function dateCriteria\(\)/.test(js), 'plans.js phải có dateCriteria()');
  assert.ok(/\.\.\.dateCriteria\(\)/.test(js), 'payload phải trải dateCriteria() vào');
  for (const k of ['fromDate', 'toDate', 'days']) {
    assert.ok(new RegExp(`${k}:`).test(js), `dateCriteria() thiếu khoá ${k}`);
  }
  const html = read('plans.html');
  for (const id of ['period', 'fromDate', 'toDate', 'dateRange', 'dateRange2']) {
    assert.ok(html.includes(`id="${id}"`), `plans.html thiếu phần tử #${id}`);
  }
});
