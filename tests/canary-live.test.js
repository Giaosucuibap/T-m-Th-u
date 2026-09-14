/* ============================================================================
 *  CANARY SỐNG — phần chấm điểm và cổng chặn bản dựng  (B1.1)
 *
 *  Phép thử ngoại tuyến chứng minh bộ chuẩn hoá không tự hỏng. Nó KHÔNG biết
 *  e-GP vừa đổi tên một trường hay vừa bỏ một mã tỉnh — đúng những thứ làm
 *  phần mềm trả kết quả sai mà vẫn xanh toàn bộ phép thử.
 *
 *  Tệp này kiểm phần THUẦN của canary sống: chấm kết quả, và quyết định có
 *  chặn bản dựng hay không. Phần gọi mạng chạy trong tiện ích, không ở đây.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateLiveCanary, canaryGate, inCanaryWindow,
  LIVE_CANARY_CODES, AREA_INVARIANTS, CANARY_MAX_AGE_DAYS
} from '../lib/canary-live.js';

const AREAS_OK = { provinces: [
  { code: '68', name: 'Lâm Đồng' }, { code: '703', name: 'Tỉnh Lâm Đồng' },
  { code: '92', name: 'Cần Thơ' },  { code: '815', name: 'TP Cần Thơ' }
]};
/** Thiếu 703 — đúng kiểu trôi mã mà không ai thấy bằng mắt. */
const AREAS_DRIFT = { provinces: [
  { code: '68', name: 'Lâm Đồng' },
  { code: '92', name: 'Cần Thơ' }, { code: '815', name: 'TP Cần Thơ' }
]};

/** Dựng một lượt quan sát "mọi thứ bình thường" cho toàn bộ danh sách mã. */
function quanSatTot() {
  return LIVE_CANARY_CODES.map(spec => ({
    code: spec.code,
    record: Object.fromEntries(spec.need.map(f => [f, f.includes('Price') ? 1_000_000_000 : 'giá trị có thật']))
  }));
}

/* --------------------------------------------------------------------------
 *  1. Ba thứ canary phải canh
 * ------------------------------------------------------------------------ */

test('mọi thứ bình thường thì canary đạt', () => {
  const r = evaluateLiveCanary(quanSatTot(), AREAS_OK);
  assert.equal(r.ok, true);
  assert.equal(r.checked, LIVE_CANARY_CODES.length);
  assert.deepEqual(r.failures, []);
});

test('TRƯỜNG BIẾN MẤT bị bắt, kèm tên trường', () => {
  const obs = quanSatTot();
  delete obs[0].record.bidPrice;       // e-GP thôi trả giá cho mã này
  const r = evaluateLiveCanary(obs, AREAS_OK);
  assert.equal(r.ok, false);
  const row = r.rows.find(x => x.code === obs[0].code);
  assert.equal(row.status, 'FIELD_LOST');
  assert.deepEqual(row.missing, ['bidPrice'], 'phải nói rõ trường nào mất');
});

test("chuỗi 'null' của e-GP tính là TRƯỜNG MẤT, không phải có giá trị", () => {
  // Đây đúng lỗi đã gặp ở gói chỉ định thầu: e-GP gửi chữ 'null'.
  const obs = quanSatTot();
  obs[1].record.investorName = 'null';
  const r = evaluateLiveCanary(obs, AREAS_OK);
  assert.equal(r.rows.find(x => x.code === obs[1].code).status, 'FIELD_LOST');
});

test('MÃ BIẾN MẤT bị bắt riêng, khác với trường mất', () => {
  const obs = quanSatTot();
  obs[2] = { code: obs[2].code, record: null, error: 'e-GP trả 0 bản ghi' };
  const r = evaluateLiveCanary(obs, AREAS_OK);
  const row = r.rows.find(x => x.code === obs[2].code);
  assert.equal(row.status, 'GONE');
  assert.match(row.detail, /0 bản ghi/);
});

test('MÃ ĐỊA BÀN TRÔI bị bắt — 703 thôi khớp Lâm Đồng', () => {
  const r = evaluateLiveCanary(quanSatTot(), AREAS_DRIFT);
  assert.equal(r.ok, false);
  const row = r.areaRows.find(x => x.name === 'Lâm Đồng');
  assert.equal(row.status, 'AREA_DRIFT');
  assert.deepEqual(row.missing, ['703']);
  assert.match(row.why, /bỏ sót/, 'phải giải thích vì sao điều này nguy hiểm');
});

test('không có danh mục địa bàn thì nói CHƯA KIỂM, không nói đạt', () => {
  const r = evaluateLiveCanary(quanSatTot(), null);
  assert.equal(r.ok, false, 'thiếu dữ liệu để kết luận thì không được coi là đạt');
  assert.ok(r.areaRows.every(x => x.status === 'NOT_RUN'));
});

test('mã chưa đối chứng thì ghi NOT_RUN, không lặng lẽ bỏ qua', () => {
  const r = evaluateLiveCanary([quanSatTot()[0]], AREAS_OK);
  assert.equal(r.ok, false, 'mới chạy 1 mã mà báo đạt là nói dối về phạm vi');
  assert.equal(r.checked, 1);
  assert.equal(r.total, LIVE_CANARY_CODES.length);
});

/* --------------------------------------------------------------------------
 *  2. Cổng chặn bản dựng
 * ------------------------------------------------------------------------ */

const MOI_CHAY = () => ({ ok: true, ranAt: new Date().toISOString(), failures: [] });

test('canary vừa chạy và sạch thì cho qua', () => {
  const g = canaryGate(MOI_CHAY());
  assert.equal(g.verdict, 'PASS');
  assert.equal(g.block, false);
});

test('có lỗi thì CHẶN, và nói rõ mã nào', () => {
  const g = canaryGate({ ok: false, ranAt: new Date().toISOString(), failures: ['IB2600509787-01', 'Lâm Đồng'] });
  assert.equal(g.verdict, 'BLOCK');
  assert.equal(g.block, true);
  assert.match(g.reason, /IB2600509787-01/);
  assert.match(g.reason, /Lâm Đồng/);
});

test('kết quả QUÁ HẠN thì CHẶN — canary cũ không nói được gì về e-GP hôm nay', () => {
  const cu = { ok: true, failures: [], ranAt: new Date(Date.now() - (CANARY_MAX_AGE_DAYS + 1) * 86400000).toISOString() };
  const g = canaryGate(cu);
  assert.equal(g.block, true);
  assert.match(g.reason, /quá hạn/);
});

test('ngay trước hạn thì vẫn cho qua', () => {
  const g = canaryGate({ ok: true, failures: [], ranAt: new Date(Date.now() - (CANARY_MAX_AGE_DAYS - 1) * 86400000).toISOString() });
  assert.equal(g.verdict, 'PASS');
});

test('CHƯA CHẠY lần nào thì CẢNH BÁO, không chặn', () => {
  // Chặn ở đây thì không ai cài được phần mềm lần đầu. Nhưng phải nói to.
  const g = canaryGate(null);
  assert.equal(g.verdict, 'WARN');
  assert.equal(g.block, false);
  assert.match(g.reason, /chưa chạy/);
});

test('kết quả không ghi thời điểm chạy thì CHẶN', () => {
  // Không có mốc thời gian thì không biết nó nói về e-GP của ngày nào.
  assert.equal(canaryGate({ ok: true, failures: [] }).block, true);
  assert.equal(canaryGate({ ok: true, failures: [], ranAt: 'hôm qua' }).block, true);
});

/* --------------------------------------------------------------------------
 *  3. Giờ chạy
 * ------------------------------------------------------------------------ */

test('canary chỉ chạy ngoài giờ hành chính', () => {
  // e-GP là hệ thống công. Đừng thêm tải vào lúc các đơn vị đang nộp hồ sơ.
  for (const h of [22, 23, 0, 2, 4]) assert.equal(inCanaryWindow(h), true, `${h}h phải được chạy`);
  for (const h of [5, 8, 10, 14, 17, 21]) assert.equal(inCanaryWindow(h), false, `${h}h không được chạy`);
  for (const bad of [-1, 24, 'tối', null, 1.5]) assert.equal(inCanaryWindow(bad), false);
});

/* --------------------------------------------------------------------------
 *  4. Chính danh sách mã
 * ------------------------------------------------------------------------ */

test('mỗi mã ghi rõ nguồn gốc và trường cần kiểm', () => {
  for (const spec of LIVE_CANARY_CODES) {
    assert.match(spec.code, /^(IB|PL)\d{8,}-\d{2}$/, `mã ${spec.code} sai định dạng`);
    assert.ok(['tbmt', 'khlcnt'].includes(spec.kind));
    assert.ok(spec.need.length > 0, `${spec.code} phải nêu ít nhất một trường cần kiểm`);
    assert.ok(['observed', 'candidate'].includes(spec.source),
      `${spec.code} phải ghi rõ đã xác nhận trên e-GP thật hay chưa`);
  }
});

test('bất biến địa bàn giữ đủ cặp mã cũ/mới đã biết', () => {
  const lamDong = AREA_INVARIANTS.find(x => x.name === 'Lâm Đồng');
  assert.deepEqual([...lamDong.codes], ['68', '703']);
});

test('danh sách mã chưa đủ 20 — ghi nhận công khai, không giấu', () => {
  /* Yêu cầu là 20–30 mã sống. Hiện mới có ngần này, và chỉ một phần đã xác
     nhận trên e-GP thật. Bài này KHÔNG phải để báo đỏ, mà để con số thiếu hụt
     nằm trong bộ kiểm thử chứ không nằm trong trí nhớ của ai đó. */
  const daXacNhan = LIVE_CANARY_CODES.filter(s => s.source === 'observed').length;
  assert.ok(LIVE_CANARY_CODES.length >= 9, 'không được rút ngắn danh sách');
  assert.ok(daXacNhan >= 4, 'phải giữ ít nhất các mã đã đọc được trên e-GP thật');
  assert.ok(LIVE_CANARY_CODES.length < 20,
    'khi đã đủ 20 mã, hãy xoá bài này và nâng ngưỡng ở bài trên lên 20');
});
