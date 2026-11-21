/* ============================================================================
 *  4.23.0 — CHẠM TIÊU ĐỀ CỘT ĐỂ SẮP XẾP (lib/table-sort.js)
 *
 *  Phần đọc giá trị từ chữ hiển thị kiểu Việt Nam và phần so sánh là hàm thuần, kiểm ở đây.
 *  Phần gắn vào bảng thật được bài đo trên nhân Safari (tools/test/bang-doc-duoc.mjs) bấm thử.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sortValue, compareValues } from '../GiaoSuCuiBap/lib/table-sort.js';

const n = (text) => { const v = sortValue(text); assert.equal(v.kind, 'number', JSON.stringify(text)); return v.n; };
const order = (list, direction) => list.map((text) => ({ text, v: sortValue(text) })).sort((a, b) => compareValues(a.v, b.v, direction)).map((x) => x.text);

test('Số tiền, phần trăm, số đếm viết kiểu Việt Nam (chấm ngăn nghìn, phẩy thập phân) đọc đúng', () => {
  assert.equal(n('12.480.335.000 đ'), 12480335000);
  assert.equal(n('472.567.429 đ'), 472567429);
  assert.equal(n('13,8%'), 13.8);
  assert.equal(n('0%'), 0);
  assert.equal(n('100,0% 16/16'), 100);
  assert.equal(n('16 / 0'), 16, 'ô "độc lập / liên danh" so theo số đầu');
  assert.equal(n('16'), 16);
  assert.equal(n('1,25 tỷ'), 1.25e9);
  assert.equal(n('350 triệu'), 350e6);
  assert.equal(n('-3,5%'), -3.5);
  assert.equal(n('−3,5%'), -3.5, 'dấu trừ kiểu in');
  assert.equal(n('  7,8%  '), 7.8);
  assert.equal(n('1.500'), 1500, 'ba chữ số sau dấu chấm là một nghìn rưỡi');
  assert.equal(n('2026'), 2026);
});

test('Ngày tháng so theo thời gian, không theo chữ', () => {
  assert.ok(n('2026-11-21') > n('2026-02-03'));
  assert.ok(n('21/11/2026') > n('03/12/2025'), 'ngày/tháng/năm: 21/11/2026 sau 03/12/2025 dù "21" > "03" hay không');
  assert.ok(n('05/01/2026 14:30') > n('05/01/2026 09:00'));
  assert.equal(n('21/11/2026'), n('2026-11-21'));
});

test('Ô trống, gạch ngang, "chưa có…" là ô không có số liệu; tên, mã có chữ đứng đầu là chữ', () => {
  for (const text of ['', '   ', '—', '–', '-', '?', 'Chưa công bố tên', 'chưa rõ', 'Không có']) assert.deepEqual(sortValue(text), { kind: 'empty' }, JSON.stringify(text));
  assert.deepEqual(sortValue('CÔNG TY TNHH NAM SƠN'), { kind: 'text', s: 'CÔNG TY TNHH NAM SƠN' });
  assert.equal(sortValue('IB2600455310-00').kind, 'text');
  assert.equal(sortValue('Đấu thầu rộng rãi').kind, 'text');
  assert.equal(sortValue(null).kind, 'empty');
});

test('Sắp xếp: số lớn → nhỏ hoặc nhỏ → lớn; ô không có số liệu LUÔN nằm cuối, cả hai chiều', () => {
  const money = ['3.595.791.470 đ', '—', '472.567.429 đ', '12.480.335.000 đ', '', '1.210.000.000 đ'];
  assert.deepEqual(order(money, -1), ['12.480.335.000 đ', '3.595.791.470 đ', '1.210.000.000 đ', '472.567.429 đ', '—', '']);
  assert.deepEqual(order(money, 1), ['472.567.429 đ', '1.210.000.000 đ', '3.595.791.470 đ', '12.480.335.000 đ', '—', '']);
  assert.deepEqual(order(['9,5%', '13,8%', '100,0%', '0%'], -1), ['100,0%', '13,8%', '9,5%', '0%'], 'không xếp theo chữ ("9,5" sau "13,8")');
});

test('Sắp xếp chữ theo bảng chữ cái tiếng Việt, không phân biệt hoa thường; số trong tên so theo giá trị', () => {
  const names = ['Tỉnh Đồng Tháp', 'Thành phố Đà Nẵng', 'tỉnh an giang', 'Tỉnh Lâm Đồng', 'Thành phố Cần Thơ'];
  assert.deepEqual(order(names, 1), ['Thành phố Cần Thơ', 'Thành phố Đà Nẵng', 'tỉnh an giang', 'Tỉnh Đồng Tháp', 'Tỉnh Lâm Đồng']);
  assert.deepEqual(order(['Gói thầu số 10', 'Gói thầu số 2', 'Gói thầu số 1'], 1), ['Gói thầu số 1', 'Gói thầu số 2', 'Gói thầu số 10']);
  assert.deepEqual(order(names, -1), order(names, 1).reverse());
});

test('Cột lẫn số và chữ: số đứng trước chữ khi tăng dần; hai ô bằng nhau trả 0 để giữ thứ tự gốc', () => {
  assert.deepEqual(order(['Liên danh', '3', '12', '—'], 1), ['3', '12', 'Liên danh', '—']);
  assert.equal(compareValues(sortValue('16'), sortValue('16 / 0'), 1), 0);
  assert.equal(compareValues(sortValue('—'), sortValue(''), -1), 0);
  assert.equal(compareValues(sortValue('—'), sortValue('5'), 1), 1);
  assert.equal(compareValues(sortValue('—'), sortValue('5'), -1), 1);
});
