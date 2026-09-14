/* ============================================================================
 *  MỘT CỬA DUY NHẤT CHO LỌC, THỐNG KÊ VÀ XUẤT DỮ LIỆU  (B1.4)
 *
 *  Lỗi cần chặn: bản Excel xuất ra KHÁC danh sách đang hiện trên màn hình.
 *
 *  Vì sao nó xảy ra: khi mỗi đường đi tự lọc theo cách riêng. Thêm một tiêu chí
 *  vào giao diện mà quên thêm vào đường xuất, thế là hai bên nói hai chuyện.
 *  Người dùng cầm bản Excel đi họp với con số không khớp thứ họ vừa nhìn thấy,
 *  và không có cách nào biết bên nào đúng.
 *
 *  Bản 4.10.1 đã gom về một cửa: `passesHardFilter()` chấm từng bản ghi TRƯỚC
 *  khi lưu, nên thống kê, thông báo và xuất đều đọc cùng một kho đã lọc.
 *
 *  Tệp này khoá lại hai tính chất khiến "một cửa" còn giữ được ý nghĩa.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { passesHardFilter, hardFilterReason, HARD_FILTER_REASON_LABELS } from '../lib/hard-filter.js';
import { filterAndSort, statusOf } from '../lib/decision.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* --------------------------------------------------------------------------
 *  1. Mọi lý do loại trừ đều phải có nhãn tiếng Việt
 *
 *  Một lý do không nhãn sẽ hiện ra màn hình dưới dạng mã máy, hoặc rỗng. Khi đó
 *  người dùng thấy gói biến mất mà không biết vì sao — đúng thứ cổng ba trạng
 *  thái sinh ra để xoá bỏ.
 * ------------------------------------------------------------------------ */

test('mọi lý do loại trừ phát ra từ bộ lọc đều có nhãn', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib/hard-filter.js'), 'utf8');
  const phatRa = [...new Set([...src.matchAll(/add\('[a-z]+',\s*'([a-z-]+)'/g)].map((m) => m[1]))];
  assert.ok(phatRa.length >= 10, 'không dò được lý do nào — biểu thức dò đã hỏng');

  const thieu = phatRa.filter((r) => !Object.hasOwn(HARD_FILTER_REASON_LABELS, r));
  assert.deepEqual(thieu, [], `lý do chưa có nhãn: ${thieu.join(', ')}`);
});

test('lý do khớp xã theo mã — đường mới của 4.11.0 — cũng có nhãn', () => {
  for (const r of ['ward', 'insufficient-ward']) {
    assert.ok(Object.hasOwn(HARD_FILTER_REASON_LABELS, r), `thiếu nhãn cho "${r}"`);
    assert.ok(hardFilterReason(r).length > 0);
  }
});

test('lý do lạ không làm vỡ giao diện', () => {
  // Thà hiện một câu chung còn hơn hiện chuỗi rỗng hoặc "undefined".
  const s = hardFilterReason('mot-ly-do-chua-tung-co');
  assert.equal(typeof s, 'string');
  assert.ok(s.length > 0);
});

/* --------------------------------------------------------------------------
 *  2. Cổng phải THUẦN — cùng đầu vào, cùng kết quả
 *
 *  Nếu cổng phụ thuộc vào trạng thái ẩn (thời điểm gọi, thứ tự gọi, bộ nhớ
 *  đệm), thì lượt chấm lúc LƯU và lượt chấm lúc XUẤT có thể ra khác nhau — dù
 *  cùng một hàm. Đó là đường quay lại của chính lỗi đang chặn.
 * ------------------------------------------------------------------------ */

const AREAS = {
  provinces: [{ code: '68', name: 'Lâm Đồng' }, { code: '75', name: 'Đồng Nai' }],
  wards: [{ code: '23122', name: 'Xã Đức Trọng', parentCode: '68' }]
};

const HO_SO = [
  { bidName: 'Kênh mương Đức Trọng', price: 2e9, locations: [{ provCode: '68', districtCode: '23122' }] },
  { bidName: 'Đường xã Tân Minh',    price: 5e8, locations: [{ provCode: '75' }] },
  { bidName: 'Gói chưa rõ địa bàn',  price: 1e9, locations: [] },
  { bidName: 'Gói chưa công bố giá',            locations: [{ provCode: '68', districtCode: '23122' }] }
];

test('chấm hai lần cho cùng kết quả — cổng không mang trạng thái ẩn', () => {
  const criteria = { province: 'Lâm Đồng', ward: 'Đức Trọng', minPrice: 1e9 };
  const lan1 = HO_SO.map((r) => passesHardFilter(r, criteria, AREAS));
  const lan2 = HO_SO.map((r) => passesHardFilter(r, criteria, AREAS));
  assert.deepEqual(lan2, lan1, 'cùng đầu vào phải cho cùng kết quả');

  // Và thứ tự gọi không được ảnh hưởng.
  const nguoc = [...HO_SO].reverse().map((r) => passesHardFilter(r, criteria, AREAS)).reverse();
  assert.deepEqual(nguoc, lan1, 'đảo thứ tự chấm vẫn phải ra cùng kết quả');
});

test('không sửa bản ghi gốc — nếu sửa, lượt chấm sau sẽ khác lượt trước', () => {
  const criteria = { province: 'Lâm Đồng', ward: 'Đức Trọng' };
  const truoc = JSON.stringify(HO_SO);
  HO_SO.forEach((r) => passesHardFilter(r, criteria, AREAS));
  assert.equal(JSON.stringify(HO_SO), truoc, 'bộ lọc đã sửa dữ liệu đầu vào');
});

test('mọi gói bị loại đều nói được VÌ SAO, cả trên màn hình lẫn trong tệp xuất', () => {
  const criteria = { province: 'Lâm Đồng', ward: 'Đức Trọng', minPrice: 1e9 };
  const daCham = HO_SO.map((r) => ({ record: r, verdict: passesHardFilter(r, criteria, AREAS) }));
  for (const x of daCham.filter((v) => !v.verdict.ok)) {
    assert.ok(hardFilterReason(x.verdict.reason).length > 0,
      `gói "${x.record.bidName}" bị loại mà không giải thích được`);
  }
});

/* --------------------------------------------------------------------------
 *  3. BẢN XUẤT PHẢI TRÙNG KHÍT DANH SÁCH ĐANG HIỆN — kiểm trên mã THẬT
 *
 *  Đây mới là bài hồi quy người dùng cần. Nó KHÔNG mô phỏng lại logic; nó cắt
 *  đúng hàm `exportCsv` trong background.js ra và chạy thật, với danh sách khoá
 *  y hệt cái màn hình gửi sang (`search.js`: keys = filtered.map(t => t.key)).
 *
 *  Nếu ai đó thêm một bộ lọc riêng vào đường xuất — lọc điểm, lọc trạng thái,
 *  bỏ gói thiếu giá — bài này đỏ ngay. Đó là toàn bộ mục đích của nó.
 * ------------------------------------------------------------------------ */

/** Cắt `exportCsv` khỏi background.js và chạy nó với các phụ thuộc giả lập. */
function napHamXuat() {
  const src = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');
  const start = src.indexOf('async function exportCsv');
  assert.ok(start >= 0, 'không tìm thấy exportCsv trong background.js — mốc cắt đã hỏng');
  const rest = src.slice(start);
  const next = /\n(?:async )?function [A-Za-z_$]/.exec(rest.slice(1));
  const body = next ? rest.slice(0, next.index + 1) : rest;

  // Phải là bản THẬT, không phải một đoạn rỗng lọt qua.
  assert.match(body, /downloadXlsx\(/, 'đoạn cắt được không chứa lệnh xuất');

  const batDuoc = {};
  const sandbox = {
    getState: async () => JSON.parse(JSON.stringify(sandbox.__state)),
    downloadXlsx: async (filename, spec) => { batDuoc.filename = filename; batDuoc.spec = spec; return 1; },
    stamp: () => '2026-09-14',
    numOrNull: (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean'
      || !Number.isFinite(Number(v))) ? null : Number(v),
    statusOf,
    hardFilterReason,
    BID_STATUS_LABEL: new Proxy({}, { get: (_, k) => String(k) }),
    GATE_LABEL: new Proxy({}, { get: (_, k) => String(k) }),
    DECISION_STATE_LABEL: new Proxy({}, { get: (_, k) => String(k) }),
    normalizeDecisionState: (v) => v || 'NONE',
    __state: null
  };
  vm.createContext(sandbox);
  vm.runInContext(`${body}\n;globalThis.__exportCsv = exportCsv;`, sandbox);
  return { sandbox, batDuoc, exportCsv: sandbox.__exportCsv };
}

/** Kho gói thầu đã qua cổng lọc — đúng thứ nằm trong storage thật. */
const KHO = [
  { key: 'k1', bidName: 'Kênh mương Đức Trọng',  score: 88, price: 2e9,  closeDate: '2026-12-01', watchlisted: true,  matched: true,  filterState: 'MATCH' },
  { key: 'k2', bidName: 'Hồ chứa Đạ Tẻh',        score: 71, price: 9e9,  closeDate: '2026-11-20', watchlisted: false, matched: true,  filterState: 'MATCH' },
  { key: 'k3', bidName: 'Gói điểm thấp',         score: 12, price: 3e8,  closeDate: '2026-11-05', watchlisted: false, matched: false, filterState: 'MATCH' },
  { key: 'k4', bidName: 'Gói chưa rõ giá',       score: 64,              closeDate: '2026-10-30', watchlisted: false, matched: true,  filterState: 'INSUFFICIENT' },
  { key: 'k5', bidName: 'Trạm bơm Cát Tiên',     score: 95, price: 1.4e10, closeDate: '2026-12-15', watchlisted: true, matched: true, filterState: 'MATCH' }
];

/** Đúng công thức trong search.js:156 — kể cả hai bộ lọc nằm ngoài filterAndSort. */
function danhSachDangHien(view = {}) {
  const theoTrangThai = KHO.filter((t) => !view.criteriaState || t.filterState === view.criteriaState);
  return filterAndSort(theoTrangThai, view).filter((t) => !view.onlyWatch || t.watchlisted);
}

test('BẢN XUẤT trùng khít DANH SÁCH ĐANG HIỆN, ở mọi tổ hợp bộ lọc', async () => {
  const { sandbox, batDuoc, exportCsv } = napHamXuat();

  const toHop = [
    { ten: 'không lọc gì',            view: {} },
    { ten: 'chỉ gói khớp tiêu chí',   view: { onlyMatched: true } },
    { ten: 'điểm từ 70',              view: { minScore: 70 } },
    { ten: 'chỉ gói đang theo dõi',   view: { onlyWatch: true } },
    { ten: 'chỉ trạng thái MATCH',    view: { criteriaState: 'MATCH' } },
    { ten: 'tìm chữ trong tên',       view: { text: 'Đức Trọng' } },
    { ten: 'chồng nhiều bộ lọc',      view: { onlyMatched: true, minScore: 70, onlyWatch: true } }
  ];

  for (const { ten, view } of toHop) {
    const hien = danhSachDangHien(view);
    if (!hien.length) continue;                       // e-GP rỗng thì không có gì để đối chiếu

    sandbox.__state = { tenders: KHO, runs: [] };
    await exportCsv(false, hien.map((t) => t.key), '');

    const xuatRa = batDuoc.spec.rows.map((r) => r.bidName);
    assert.deepEqual(
      [...xuatRa].sort(), [...hien.map((t) => t.bidName)].sort(),
      `"${ten}": bản xuất KHÁC danh sách đang hiện — người dùng sẽ cầm con số sai đi họp`
    );
  }
});

test('đường xuất không được tự lọc thêm — gói thiếu giá vẫn phải có trong tệp', async () => {
  /* Bỏ gói thiếu giá cho "bảng đẹp" là âm thầm xoá đúng nhóm gói người dùng
     cần soi nhất. Nếu nó biến mất khỏi tệp mà vẫn nằm trên màn hình thì hai
     bên đang nói hai chuyện. */
  const { sandbox, batDuoc, exportCsv } = napHamXuat();
  sandbox.__state = { tenders: KHO, runs: [] };
  await exportCsv(false, ['k4'], '');

  assert.equal(batDuoc.spec.rows.length, 1);
  assert.equal(batDuoc.spec.rows[0].bidName, 'Gói chưa rõ giá');
  assert.equal(batDuoc.spec.rows[0].price, null, 'thiếu giá phải là ô TRỐNG, không phải 0 đ');
});

test('xuất khoá không thuộc lượt tra cứu đã chọn thì DỪNG, không xuất im lặng', async () => {
  // Xuất nhầm gói của lượt khác là báo cáo sai phạm vi. Thà báo lỗi.
  const { sandbox, exportCsv } = napHamXuat();
  sandbox.__state = {
    tenders: KHO,
    runs: [{ id: 'r1', foundKeys: ['k1', 'k2'], resultStates: {} }]
  };
  await assert.rejects(() => exportCsv(false, ['k1', 'k5'], 'r1'), /không thuộc lượt tra cứu/);
});

test('phạm vi xuất vô lý bị chặn trước khi dựng tệp', async () => {
  const { sandbox, exportCsv } = napHamXuat();
  sandbox.__state = { tenders: KHO, runs: [] };
  await assert.rejects(() => exportCsv(false, ['k1', 123], ''), /không hợp lệ/);
  await assert.rejects(() => exportCsv(false, [], ''), /Không có gói/);
});

test('gói CHƯA ĐỦ DỮ LIỆU không bị lẫn vào nhóm "ngoài tiêu chí"', () => {
  // Gộp hai nhóm này là âm thầm vứt đi những gói có thể đúng. Người đi đấu
  // thầu mất cơ hội mà không bao giờ biết mình đã mất.
  const criteria = { province: 'Lâm Đồng', ward: 'Đức Trọng', minPrice: 1e9 };
  const chuaRoDiaBan = passesHardFilter(HO_SO[2], criteria, AREAS);
  const chuaCoGia = passesHardFilter(HO_SO[3], criteria, AREAS);

  assert.equal(chuaRoDiaBan.state, 'INSUFFICIENT');
  assert.equal(chuaCoGia.state, 'INSUFFICIENT');

  const ngoaiTieuChi = passesHardFilter(HO_SO[1], criteria, AREAS);
  assert.equal(ngoaiTieuChi.state, 'OUT_OF_RANGE', 'có đủ căn cứ thì phải kết luận dứt khoát');
});
