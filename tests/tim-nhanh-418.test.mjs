/* ============================================================================
 *  TÌM NHANH (Ctrl K) + KẾT QUẢ TỨC THÌ TỪ KHO — 4.18.0
 *
 *  Đo trên Chromium với e-GP giả lập chậm (tools/test/instant-results.mjs):
 *  thẻ gói đầu tiên của một lượt tìm có tiêu chí mới hiện sau 8,26 giây ở 4.17.3,
 *  sau 0,22 giây ở 4.18.0 (trung vị 3 lần) (từ kho trên máy, ghi rõ có thể cũ, không cho xuất).
 *  Bài này khoá phần lõi: nhận diện mã, khớp chính xác, khớp chữ không dấu,
 *  xếp hạng, và hai hàng rào chính xác của danh sách tạm.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyQuery, quickFindPackages, quickFindPages, egpLookupAction } from '../GiaoSuCuiBap/lib/quick-find-core.js';
import { createResultView } from '../GiaoSuCuiBap/lib/result-view.js';

const read = (f) => fs.readFileSync(new URL(`../GiaoSuCuiBap/${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const NOW = Date.parse('2026-11-06T03:00:00Z');
const goi = (n, o = {}) => ({ key: `IB26004551${n}::00`, notifyNo: `IB26004551${n}`, version: '00', displayCode: `IB26004551${n}-00`,
  bidName: `Gói ${n}`, investorName: 'Sở Nông nghiệp tỉnh Lâm Đồng', location: 'Lâm Đồng', price: 1e9, closeDate: '2026-11-20T03:00:00Z', ...o });

test('nhận diện mã TBMT / KHLCNT / mã gói, kể cả viết thường, có khoảng trắng hay hậu tố phiên bản', () => {
  assert.deepEqual(classifyQuery(' ib2600455130 '), { q: 'ib2600455130', kind: 'tbmt', code: 'IB2600455130', version: null });
  assert.deepEqual(classifyQuery('IB2600455130-01'), { q: 'IB2600455130-01', kind: 'tbmt', code: 'IB2600455130', version: '01' });
  assert.equal(classifyQuery('PL2600240212').kind, 'plan');
  assert.equal(classifyQuery('BP 2600 1234 56').kind, 'bid');
  assert.equal(classifyQuery('trạm bơm').kind, 'text');
  assert.equal(classifyQuery('   ').kind, 'empty');
  assert.equal(classifyQuery('IB26').kind, 'text', 'mã cụt không coi là mã');
});

test('đúng mã: khớp CHÍNH XÁC trong kho, lọc theo phiên bản nếu có; không lẫn gói khác', () => {
  const kho = [goi(30), goi(30, { key: 'IB2600455130::01', version: '01', displayCode: 'IB2600455130-01' }), goi(31), goi(32)];
  const r = quickFindPackages(kho, 'IB2600455130', { now: NOW });
  assert.deepEqual(r.exact.map((t) => t.key), ['IB2600455130::00', 'IB2600455130::01']);
  assert.deepEqual(r.hits, [], 'các gói khác không được chen vào kết quả theo mã');
  assert.deepEqual(quickFindPackages(kho, 'IB2600455130-01', { now: NOW }).exact.map((t) => t.key), ['IB2600455130::01']);
  assert.deepEqual(quickFindPackages(kho, 'IB2600455199', { now: NOW }).exact, []);
});

test('chữ: MỌI từ phải có (không dấu) trong tên gói / chủ đầu tư / địa điểm / mã; không khớp gần đúng', () => {
  const kho = [goi(40, { bidName: 'Xây dựng trạm bơm tưới Hàm Đức' }), goi(41, { bidName: 'Nạo vét kênh mương Đơn Dương' }),
    goi(42, { bidName: 'Sửa chữa trạm y tế', location: 'Đồng Nai', investorName: 'UBND xã' })];
  assert.deepEqual(quickFindPackages(kho, 'tram bom', { now: NOW }).hits.map((t) => t.notifyNo), ['IB2600455140']);
  assert.deepEqual(quickFindPackages(kho, 'TRẠM', { now: NOW }).hits.map((t) => t.notifyNo).sort(), ['IB2600455140', 'IB2600455142']);
  assert.deepEqual(quickFindPackages(kho, 'trạm lâm đồng', { now: NOW }).hits.map((t) => t.notifyNo), ['IB2600455140'], 'từ thứ hai loại gói ở Đồng Nai');
  assert.deepEqual(quickFindPackages(kho, 'đập', { now: NOW }).hits, []);
});

test('xếp hạng: gói còn hạn trước, rồi hạn gần nhất; giới hạn số dòng; bỏ qua bản ghi hỏng', () => {
  const kho = [null, 'rác', goi(50, { closeDate: '2026-10-01T00:00:00Z' }), goi(51, { closeDate: '2026-12-30T00:00:00Z' }),
    goi(52, { closeDate: '2026-11-08T00:00:00Z' }), goi(53, { closeDate: '' })];
  const r = quickFindPackages(kho, 'goi', { now: NOW, limit: 3 });
  assert.deepEqual(r.hits.map((t) => t.notifyNo), ['IB2600455152', 'IB2600455151', 'IB2600455150']);
  assert.equal(r.total, 4);
});

test('trang chức năng khớp tên (không dấu); lệnh tra e-GP đúng đích cho từng loại mã', () => {
  const nav = [['plans.html', 'plan', 'Kế hoạch lựa chọn NT', 'Tra cứu e-GP'], ['winners.html', 'trophy', 'Nhà thầu trúng thầu', 'Tra cứu e-GP']];
  assert.deepEqual(quickFindPages(nav, 'trung thau').map((n) => n[0]), ['winners.html']);
  assert.equal(egpLookupAction(classifyQuery('IB2600455130')).href, 'search.html?q=IB2600455130&run=1');
  assert.equal(egpLookupAction(classifyQuery('pl2600240212')).href, 'plans.html?planNo=PL2600240212');
  assert.equal(egpLookupAction(classifyQuery('BP260012345')), null, 'e-GP không tra thông báo theo mã gói');
  assert.equal(egpLookupAction(classifyQuery('kênh')), null);
});

test('nền: QUICK_FIND chỉ đọc kho, trả vài trường; trang e-GP (content script) không gọi được', () => {
  const bg = read('background.js');
  const a = bg.indexOf("case 'QUICK_FIND'");
  assert.ok(a > 0);
  const block = bg.slice(a, bg.indexOf('break;', a));
  assert.match(block, /appStorage\.get\(\{\[KEYS\.tenders\]:\[\]\}\)/);
  assert.match(block, /detailUrl:isEgpUrl\(t\.detailUrl\)\?t\.detailUrl:''/, 'chỉ trả liên kết e-GP chính thức');
  assert.doesNotMatch(block, /chrome\.tabs|fetch\(|sendMessage/, 'không mở tab, không gọi mạng');
  const set = bg.slice(bg.indexOf('const CONTENT_MESSAGE_TYPES=new Set(['), bg.indexOf(']);', bg.indexOf('const CONTENT_MESSAGE_TYPES')));
  assert.doesNotMatch(set, /QUICK_FIND/);
});

test('kết quả tức thì: lọc kho bằng ĐÚNG cổng tiêu chí của lượt mới — chỉ gói khớp mới hiện', () => {
  const kho = [goi(60, { bidName: 'Xây dựng trạm bơm tưới', provinceCodes: ['68'] }),
    goi(61, { bidName: 'Nhà văn hóa thôn', provinceCodes: ['68'] }),
    goi(62, { bidName: 'Trạm bơm Tân Phú', provinceCodes: ['75'], location: 'Đồng Nai' })];
  const run = { criteria: { province: 'Lâm Đồng', provinces: ['68', '703'], keyword: 'trạm bơm', dateFields: false }, foundKeys: kho.map((t) => t.key) };
  const view = createResultView(kho, run, {});
  assert.deepEqual(view.rows.map((t) => t.notifyNo), ['IB2600455160']);
  assert.equal(view.summary.total, 1);
});

test('kết quả tức thì: danh sách tạm không bao giờ được xuất Excel/lịch, và luôn ghi rõ là dữ liệu đã lưu', () => {
  const src = read('search.js');
  assert.match(src, /const stale=showingOld\|\|showingStore;/);
  assert.match(src, /\$\('csv'\)\.disabled=stale\|\|!filtered\.length;\$\('calendar'\)\.disabled=stale\|\|/);
  assert.match(src, /Kết quả tức thì từ kho trên máy: \$\{n\.toLocaleString\('vi-VN'\)\} gói khớp tiêu chí\.<\/b> Đây là dữ liệu đã lưu từ các lượt trước — có thể đã cũ/);
  // Chỉ hiện khi lượt mới CHƯA có trang nào, và chỉ khi không có lượt trước cùng tiêu chí.
  assert.match(src, /const showingStore=!showingOld&&running&&!view\.all\.length&&instant\.forRun===runId&&instant\.keys\.length>0&&Boolean\(run\?\.criteria\);/);
  // Phạm vi và chất lượng dữ liệu mô tả LƯỢT ĐANG CHẠY, không mô tả danh sách tạm.
  assert.match(src, /renderScope\(run,stale\?\[\]:all\);/);
  assert.match(src, /\$\('run-field-quality'\)\.classList\.toggle\('hidden',stale\|\|!all\.length\);/);
  // Lượt đang chạy chưa có kết quả không bị gọi là "bản lưu cũ".
  assert.match(src, /const live=STATE\.activeRun\?\.id===run\.id;/);
  assert.match(src, /\$\{!live&&!run\.resultStates\?'<div>Bản lưu cũ chưa lưu riêng giá/);
  assert.match(src, /gói \$\{showingStore\?'trong kho trên máy':showingOld\?'trong lượt trước cùng tiêu chí':'trong lượt tìm'\}/);
  // Mở từ Tìm nhanh: chỉ nhận đúng dạng mã, không nhận chuỗi tùy ý trên địa chỉ trang.
  assert.match(src, /\/\^\(\?:IB\|PL\)\\d\{8,12\}\(\?:-\\d\{1,2\}\)\?\$\/i\.test\(code\)/);
});
