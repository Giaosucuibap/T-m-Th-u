/* ============================================================================
 *  BÁO TRƯỚC GÓI LẶP LẠI HẰNG NĂM (4.22.0) — lib/recurring.js
 *
 *  Khoá: tên chỉ khác năm/đợt/số gói thì coi là một nhóm; khác chủ đầu tư hoặc khác công
 *  việc thì không ghép; phải có ít nhất hai NĂM khác nhau; kỳ dự kiến lấy từ lần đầu của
 *  mỗi năm; trạng thái sắp tới / đã tới kỳ / còn xa / có thể đã ngừng; gói thiếu chủ đầu
 *  tư hoặc tên quá ngắn không được ghép bừa.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nameTokens, collectPackages, findRecurring, filterRecurring, RECURRING_STATUS_LABEL, RECURRING_NOTE } from '../GiaoSuCuiBap/lib/recurring.js';

const NOW = Date.parse('2026-11-11T03:00:00Z');
const CDT = 'Công ty TNHH MTV Khai thác công trình thủy lợi Lâm Đồng';
const obs = (no, name, at, extra = {}) => ({ source: 'kqlcnt', notifyNo: no, bidName: name, investorName: CDT, field: 'XL', location: 'Tỉnh Lâm Đồng', packageBasis: 3.2e9, taxCode: '5800000111', at, ...extra });

test('tên gói: bỏ năm, giai đoạn, đợt, "gói thầu số N" — giữ phần mô tả công việc', () => {
  const a = nameTokens('Gói thầu số 01: Nạo vét kênh mương nội đồng năm 2025 (đợt 2)');
  const b = nameTokens('Gói thầu số 3 - Nạo vét kênh mương nội đồng năm 2026');
  assert.deepEqual(a, b);
  assert.deepEqual(a, ['nao', 'vet', 'kenh', 'muong', 'noi', 'dong']);
  assert.deepEqual(nameTokens('Duy tu hồ chứa giai đoạn 2024-2025'), ['duy', 'tu', 'ho', 'chua']);
  assert.ok(nameTokens('Thi công kênh N1').includes('n1'), 'mã hạng mục có số được giữ');
  assert.deepEqual(nameTokens(''), []);
});

test('gom gói từ kho quan sát và kho TBMT: không trùng mã, lấy ngày sớm nhất, bổ sung giá', () => {
  const packages = collectPackages({
    observations: [obs('IB2500000001-00', 'Nạo vét kênh 2025', '2025-03-20T02:00:00Z', { taxCode: 'a' }), obs('IB2500000001', 'Nạo vét kênh 2025', '2025-03-20T02:00:00Z', { taxCode: 'b', packageBasis: 0 })],
    tenders: [{ notifyNo: 'IB2500000001', bidName: 'Nạo vét kênh 2025', investorName: CDT, publicDate: '2025-03-01T02:00:00Z', price: 3.3e9 }, { notifyNo: 'IB2600000009', bidName: 'Kè sông', investorName: CDT, closeDate: '2026-11-30T02:00:00Z', price: 9e9 }, { bidName: 'thiếu mã' }, null]
  });
  assert.equal(packages.length, 2);
  const p = packages.find((x) => x.code === 'IB2500000001');
  assert.equal(new Date(p.at).toISOString(), '2025-03-01T02:00:00.000Z');
  assert.equal(p.price, 3.2e9);
});

test('ba năm liền cùng chủ đầu tư, tên chỉ khác năm: một nhóm, kỳ dự kiến năm sau, trạng thái theo ngày hôm nay', () => {
  const packages = collectPackages({ observations: [
    obs('IB2400000011', 'Nạo vét kênh mương nội đồng năm 2024', '2024-03-12T02:00:00Z'),
    obs('IB2500000012', 'Gói thầu số 2: Nạo vét kênh mương nội đồng năm 2025', '2025-03-20T02:00:00Z', { packageBasis: 3.5e9 }),
    obs('IB2600000013', 'Nạo vét kênh mương nội đồng năm 2026', '2026-03-05T02:00:00Z', { packageBasis: 3.8e9 }),
    obs('IB2600000099', 'Xây dựng trạm bơm Đạ Tẻh', '2026-06-01T02:00:00Z')
  ] });
  const rows = findRecurring(packages, { now: NOW });
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.deepEqual(r.years, [2024, 2025, 2026]);
  assert.equal(r.typicalMonth, 3);
  assert.equal(r.expectedAt.slice(0, 7), '2027-03');
  assert.equal(r.status, 'con-xa');
  assert.equal(r.lastPrice, 3.8e9);
  assert.equal(r.annualHint, true);
  assert.equal(r.occurrences.length, 3);
  // Cùng dữ liệu, xem vào tháng 1/2027: sắp tới kỳ; tháng 5/2027 mà chưa có gói mới: đã tới kỳ; cuối 2027: có thể đã ngừng.
  assert.equal(findRecurring(packages, { now: Date.parse('2027-01-15T03:00:00Z') })[0].status, 'sap-toi');
  assert.equal(findRecurring(packages, { now: Date.parse('2027-05-01T03:00:00Z') })[0].status, 'da-toi-ky');
  assert.equal(findRecurring(packages, { now: Date.parse('2027-12-01T03:00:00Z') })[0].status, 'ngung');
});

test('không ghép bừa: khác chủ đầu tư, khác công việc, cùng một năm, thiếu chủ đầu tư, tên quá ngắn', () => {
  const none = [
    [obs('IB1', 'Nạo vét kênh mương năm 2025', '2025-03-01T02:00:00Z'), obs('IB2', 'Nạo vét kênh mương năm 2026', '2026-03-01T02:00:00Z', { investorName: 'UBND xã Tà Nung' })],
    [obs('IB1', 'Nạo vét kênh mương năm 2025', '2025-03-01T02:00:00Z'), obs('IB2', 'Sửa chữa đập dâng năm 2026', '2026-03-01T02:00:00Z')],
    [obs('IB1', 'Nạo vét kênh mương đợt 1', '2026-03-01T02:00:00Z'), obs('IB2', 'Nạo vét kênh mương đợt 2', '2026-08-01T02:00:00Z')],
    [obs('IB1', 'Nạo vét kênh mương năm 2025', '2025-03-01T02:00:00Z', { investorName: '' }), obs('IB2', 'Nạo vét kênh mương năm 2026', '2026-03-01T02:00:00Z', { investorName: '' })],
    [obs('IB1', 'Gói thầu số 1 năm 2025', '2025-03-01T02:00:00Z'), obs('IB2', 'Gói thầu số 1 năm 2026', '2026-03-01T02:00:00Z')]
  ];
  for (const [i, observations] of none.entries()) assert.equal(findRecurring(collectPackages({ observations }), { now: NOW }).length, 0, `trường hợp ${i + 1}`);
  // Tên gần giống (thêm bớt một hai chữ) vẫn ghép được.
  const near = collectPackages({ observations: [obs('IB1', 'Duy tu, sửa chữa thường xuyên hệ thống kênh mương hồ Đạ Tẻh năm 2025', '2025-02-10T02:00:00Z'),
    obs('IB2', 'Duy tu sửa chữa thường xuyên hệ thống kênh mương hồ chứa Đạ Tẻh năm 2026', '2026-02-20T02:00:00Z')] });
  assert.equal(findRecurring(near, { now: NOW }).length, 1);
});

test('xếp thứ tự và lọc: đã tới kỳ / sắp tới đứng trước; lọc theo tỉnh, chủ đầu tư, từ khoá không dấu', () => {
  const observations = [
    obs('IB1', 'Bảo vệ trụ sở năm 2024', '2024-12-10T02:00:00Z'), obs('IB2', 'Bảo vệ trụ sở năm 2025', '2025-12-12T02:00:00Z'),
    obs('IB3', 'Nạo vét kênh năm 2025 tuyến chính', '2025-03-01T02:00:00Z'), obs('IB4', 'Nạo vét kênh năm 2026 tuyến chính', '2026-03-01T02:00:00Z'),
    obs('IB5', 'Vệ sinh hồ chứa năm 2025 khu A', '2025-07-01T02:00:00Z', { location: 'Tỉnh Đắk Lắk' }), obs('IB6', 'Vệ sinh hồ chứa năm 2026 khu A', '2026-07-01T02:00:00Z', { location: 'Tỉnh Đắk Lắk' })
  ];
  const rows = findRecurring(collectPackages({ observations }), { now: NOW });
  assert.deepEqual(rows.map((r) => r.status), ['sap-toi', 'sap-toi', 'con-xa']);
  assert.match(rows[0].name, /Bảo vệ/, 'gần kỳ nhất đứng đầu');
  assert.equal(filterRecurring(rows, { upcomingOnly: true }).length, 2);
  assert.equal(filterRecurring(rows, { province: 'dak lak' }).length, 1);
  assert.equal(filterRecurring(rows, { keyword: 'nao vet' }).length, 1);
  assert.equal(filterRecurring(rows, { investor: 'khong co' }).length, 0);
  for (const r of rows) assert.ok(RECURRING_STATUS_LABEL[r.status]);
  assert.match(RECURRING_NOTE, /không phải kế hoạch của chủ đầu tư/);
});

test('màn hình có trong danh mục, ghi rõ giới hạn, dẫn sang Kế hoạch lựa chọn nhà thầu', () => {
  const html = fs.readFileSync(new URL('../GiaoSuCuiBap/forecast.html', import.meta.url), 'utf8');
  const js = fs.readFileSync(new URL('../GiaoSuCuiBap/forecast.js', import.meta.url), 'utf8');
  assert.match(fs.readFileSync(new URL('../GiaoSuCuiBap/shell.js', import.meta.url), 'utf8'), /\['forecast\.html', 'calendar', 'Gói lặp lại hằng năm'\]/, 'thiếu mục trong thanh trái');
  assert.match(html, /href="plans\.html"/);
  assert.match(js, /RECURRING_NOTE/);
  assert.match(js, /không báo “hợp đồng sắp hết hạn”/);
});
