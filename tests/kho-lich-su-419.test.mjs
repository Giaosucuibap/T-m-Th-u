/* ============================================================================
 *  KHO LỊCH SỬ BIÊN BẢN MỞ THẦU — 4.19.0
 *
 *  Điểm yếu: không có kho lịch sử sẵn như dịch vụ máy chủ. Kho lịch sử là một
 *  hàng đợi dùng ĐÚNG luồng đọc biên bản mở thầu đã kiểm thử. Bài này khoá:
 *  tháng theo lịch Việt Nam, luôn nhường người dùng/bộ săn/canary, tiếp tục được
 *  sau khi Chrome tắt, lượt bị gián đoạn thử lại tối đa 3 lần, và bảng độ phủ nói
 *  thật (tháng chạm giới hạn danh sách e-GP được ghi rõ).
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { monthWindows, buildHistoryQueue, canStartNow, huntDueWithin, outcomeFromScan, recordOutcome, nextItem, archiveSummary, isNight, safeHistoryConfig,
  HISTORY_KEY, HISTORY_ALARM } from '../GiaoSuCuiBap/lib/history-archive.js';
import { createHistoryRuntime } from '../GiaoSuCuiBap/lib/runtime-history.js';

const read = (f) => fs.readFileSync(new URL(`../GiaoSuCuiBap/${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const vn = (s) => Date.parse(`${s}+07:00`);

test('tháng theo lịch Việt Nam, kể cả lúc nửa đêm đầu tháng (máy ở múi giờ khác)', () => {
  const w = monthWindows(vn('2026-11-01T01:00:00'), 3);
  assert.deepEqual(w.map((x) => [x.key, x.fromDate, x.toDate]), [['2026-11', '2026-11-01', '2026-11-30'], ['2026-10', '2026-10-01', '2026-10-31'], ['2026-09', '2026-09-01', '2026-09-30']]);
  assert.equal(monthWindows(vn('2026-01-15T12:00:00'), 2)[1].key, '2025-12', 'lùi qua năm');
  assert.equal(monthWindows(vn('2028-03-10T12:00:00'), 2)[1].toDate, '2028-02-29', 'năm nhuận');
});

test('hàng đợi: các tháng của tỉnh + lĩnh vực (chế độ gói đã có kết quả), rồi từng chủ đầu tư theo dõi — không trùng', () => {
  const { config, items } = buildHistoryQueue({ province: 'Lâm Đồng', field: 'XL', months: 2, perJob: 999 }, { now: vn('2026-11-06T10:00:00'),
    watchedInvestors: [{ name: 'Ban QLDA ĐTXD tỉnh Lâm Đồng', taxCode: '5800000001' }, { name: 'Ban QLDA ĐTXD tỉnh Lâm Đồng', taxCode: '5800000001' }, { name: 'UBND xã Đạ Tẻh' }, { name: '' }] });
  assert.equal(config.perJob, 300, 'giới hạn trên mỗi lượt');
  assert.deepEqual(items.map((i) => i.id), ['m-2026-11', 'm-2026-10', 'i-5800000001', 'i-ubnd-xa-da-teh']);
  const m = items[0].payload;
  assert.equal(m.mode, 'loss'); assert.equal(m.province, 'Tỉnh Lâm Đồng'); assert.equal(m.field, 'XL'); assert.equal(m.maxPackages, 300);
  assert.equal(m.fromDate, '2026-11-01'); assert.equal(m.toDate, '2026-11-30');
  const inv = items[2].payload;
  assert.equal(inv.investor, '5800000001'); assert.equal(inv.province, ''); assert.equal(inv.fromYear, 2022, 'chủ đầu tư: đọc lịch sử 4 năm gần đây');
  assert.equal(buildHistoryQueue({ includeWatched: false }, { now: vn('2026-11-06T10:00:00'), watchedInvestors: [{ name: 'x' }] }).items.length, 12, 'mặc định 12 tháng');
  assert.equal(safeHistoryConfig({ schedule: 'lung tung' }).schedule, 'night');
});

test('luôn nhường: người dùng đang tra cứu, giờ bộ săn, giờ canary; mặc định chỉ chạy ban đêm', () => {
  const st = { enabled: true, paused: false, config: { schedule: 'night' } };
  assert.equal(isNight(vn('2026-11-06T23:30:00')), true); assert.equal(isNight(vn('2026-11-06T06:00:00')), false);
  assert.equal(canStartNow(st, { now: vn('2026-11-06T10:00:00') }).ok, false);
  assert.equal(canStartNow(st, { now: vn('2026-11-07T01:00:00') }).ok, true);
  assert.match(canStartNow(st, { now: vn('2026-11-07T01:00:00'), activeJob: { id: 'x' } }).reason, /nhường/);
  assert.match(canStartNow(st, { now: vn('2026-11-07T01:50:00'), canaryNextRunAt: new Date(vn('2026-11-07T02:00:00')).toISOString() }).reason, /kiểm tra cấu trúc/);
  assert.match(canStartNow(st, { now: vn('2026-11-07T01:00:00'), huntDueSoon: true }).reason, /bộ săn/);
  assert.equal(canStartNow({ ...st, config: { schedule: 'now' } }, { now: vn('2026-11-06T10:00:00') }).ok, true);
  assert.equal(canStartNow({ ...st, paused: true }, { now: vn('2026-11-07T01:00:00') }).ok, false);
  // Giờ bộ săn tính theo giờ trên máy, như báo thức Chrome.
  const now = new Date(2026, 10, 7, 5, 55).getTime();
  assert.equal(huntDueWithin([{ enabled: true, times: ['06:05'] }], now), true);
  assert.equal(huntDueWithin([{ enabled: true, times: ['06:30'] }], now), false);
  assert.equal(huntDueWithin([{ enabled: false, times: ['06:05'] }], now), false);
});

test('độ phủ nói thật: tháng chạm giới hạn danh sách e-GP và biên bản chưa đọc được đều ghi rõ', () => {
  const o = outcomeFromScan({ status: 'PARTIAL', listingCapped: true, listedRows: 2000,
    packages: [{ bidders: [{}, {}], fromCache: true, readState: 'OK' }, { bidders: [{}], readState: 'PARTIAL' }, { bidders: [], readState: 'TIMEOUT' }] });
  assert.deepEqual([o.packages, o.read, o.complete, o.cached, o.failed, o.bidderRows], [3, 2, 1, 1, 1, 3]);
  assert.match(o.note, /1 biên bản đọc thiếu nhà thầu/);
  assert.match(o.note, /giới hạn dòng/); assert.match(o.note, /1 biên bản chưa đọc được/);
  // Bị gián đoạn: thử lại tối đa 3 lần rồi mới báo lỗi.
  let st = { items: [{ id: 'a', status: 'running', attempts: 1 }], current: { itemId: 'a' } };
  st = recordOutcome(st, 'a', { status: 'INTERRUPTED' }, 0);
  assert.equal(st.items[0].status, 'interrupted'); assert.equal(st.current, null); assert.equal(nextItem(st).id, 'a');
  st = recordOutcome({ items: [{ id: 'a', status: 'running', attempts: 3 }] }, 'a', { status: 'TIMEOUT' }, 0);
  assert.equal(st.items[0].status, 'error'); assert.equal(nextItem(st), null);
  assert.equal(recordOutcome({ items: [{ id: 'a', attempts: 1 }] }, 'a', { status: 'SUCCESS' }, 0).items[0].status, 'done');
});

function harness({ schedule = 'now' } = {}) {
  const store = {}, alarms = new Map(), started = [];
  let jobs = { bidOpenScan: null, activeJob: null, canaryNextRunAt: null, hunts: [], readOnly: false, schemaRed: false };
  let t = vn('2026-11-06T10:00:00');
  const rt = createHistoryRuntime({
    storage: { get: async (d) => ({ ...d, ...store }), set: async (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); } },
    alarms: { create: async (n, i) => { alarms.set(n, i); }, clear: async (n) => alarms.delete(n) },
    readJobs: async () => jobs,
    startScan: async (p) => { const id = `scan-${started.length + 1}`; started.push(p); jobs = { ...jobs, bidOpenScan: { id, status: 'LISTING', packages: [] } }; return { ok: true, scan: { id } }; },
    readObservations: async () => [{ source: 'bbmt', notifyNo: 'IB1', field: 'XL', at: '2026-10-02T03:00:00Z' }, { source: 'bbmt', notifyNo: 'IB1', field: 'XL', at: '2025-05-01T03:00:00Z' }],
    now: () => t });
  return { rt, store, alarms, started, setJobs: (p) => { jobs = { ...jobs, ...p }; }, finish: (patch = {}) => { jobs = { ...jobs, bidOpenScan: { ...jobs.bidOpenScan, status: 'SUCCESS', packages: [{ bidders: [{}, {}] }], ...patch } }; }, at: (s) => { t = vn(s); }, schedule };
}

test('chạy thật trong runtime: lập kế hoạch → nạp từng mục → ghi độ phủ → xong thì tắt báo thức', async () => {
  const h = harness();
  const r = await h.rt.configure({ months: 2, schedule: 'now', includeWatched: false });
  assert.equal(r.ok, true);
  assert.equal(h.alarms.get(HISTORY_ALARM)?.periodInMinutes, 10);
  assert.equal(r.archive.packages, 1); assert.deepEqual(r.archive.byYear, { 2025: 1, 2026: 1 });
  assert.equal((await h.rt.tick()).started, true);
  assert.equal(h.started[0].fromDate, '2026-11-01'); assert.equal(h.started[0].focusTab, false); assert.equal(h.started[0].historyLabel, 'Tháng 11/2026');
  assert.equal((await h.rt.tick()).skipped, 'running', 'lượt đang chạy thì chờ');
  h.finish();
  assert.equal((await h.rt.tick()).started, true, 'xong lượt 1 → ghi kết quả và bắt đầu lượt 2');
  assert.equal(h.started[1].fromDate, '2026-10-01');
  h.finish({ status: 'PARTIAL', listingCapped: true });
  const end = await h.rt.tick();
  assert.equal(end.done, true);
  assert.equal(h.alarms.has(HISTORY_ALARM), false, 'xong kế hoạch thì không đánh thức nữa');
  const st = (await h.rt.status()).state;
  assert.deepEqual(st.items.map((i) => [i.id, i.status, i.outcome.read]), [['m-2026-11', 'done', 1], ['m-2026-10', 'done', 1]]);
  assert.match(st.items[1].outcome.note, /giới hạn dòng/);
  assert.equal(st.items[0].payload, undefined, 'trạng thái gửi cho trang không kèm truy vấn');
});

test('nhường và tiếp tục: người dùng chen lượt soi biên bản khác → mục bị gián đoạn và thử lại; chỉ chạy đêm thì ban ngày chờ', async () => {
  const h = harness();
  await h.rt.configure({ months: 1, schedule: 'night', includeWatched: false });
  const day = await h.rt.tick();
  assert.match(day.skipped, /giờ đêm/);
  h.at('2026-11-07T00:30:00');
  h.setJobs({ activeJob: { id: 'user-run' } });
  assert.match((await h.rt.tick()).skipped, /nhường/);
  h.setJobs({ activeJob: null });
  assert.equal((await h.rt.tick()).started, true);
  h.setJobs({ bidOpenScan: { id: 'user-scan', status: 'SCANNING' } });          // người dùng bấm soi biên bản riêng
  h.setJobs({ activeJob: { id: 'user-scan' } });
  await h.rt.tick();
  let st = (await h.rt.status()).state;
  assert.equal(st.items[0].status, 'interrupted');
  assert.match(st.items[0].outcome.note, /thử lại/);
  h.setJobs({ activeJob: null, bidOpenScan: null });
  assert.equal((await h.rt.tick()).started, true, 'thử lại khi e-GP rảnh');
  // Tắt Chrome giữa chừng: runtime mới đọc lại trạng thái đã lưu và chạy tiếp.
  const again = createHistoryRuntime({ storage: { get: async (d) => ({ ...d, ...h.store }), set: async (o) => Object.assign(h.store, o) }, alarms: { create: async (n, i) => h.alarms.set(n, i), clear: async () => {} },
    readJobs: async () => ({ bidOpenScan: { id: 'scan-2', status: 'SUCCESS', packages: [] }, activeJob: null, hunts: [] }), startScan: async () => ({ ok: true, scan: { id: 'x' } }), now: () => vn('2026-11-07T01:00:00') });
  await again.resume();
  assert.ok(h.alarms.has(HISTORY_ALARM));
  const done = await again.tick();
  assert.equal(done.done, true);
  st = (await again.status()).state;
  assert.equal(st.items[0].status, 'done');
});

test('lập lại kế hoạch giữ các mục đã nạp xong (không hỏi lại e-GP vô ích); đang có lượt dở thì không cho lập lại', async () => {
  const h = harness();
  await h.rt.configure({ months: 1, schedule: 'now', includeWatched: false });
  await h.rt.tick(); h.finish(); await h.rt.tick();
  const r = await h.rt.configure({ months: 2, schedule: 'now', includeWatched: false });
  assert.deepEqual(r.state.items.map((i) => [i.id, i.status]), [['m-2026-11', 'done'], ['m-2026-10', 'pending']]);
  await h.rt.tick();
  assert.equal((await h.rt.configure({ months: 3 })).ok, false);
  assert.equal((await h.rt.clear()).ok, false);
});

test('nền: lệnh Kho lịch sử không mở cho content script; báo thức đi qua runtime; lượt do kho chạy được ghi nhãn', () => {
  const bg = read('background.js');
  const set = bg.slice(bg.indexOf('const CONTENT_MESSAGE_TYPES=new Set(['), bg.indexOf(']);', bg.indexOf('const CONTENT_MESSAGE_TYPES')));
  assert.doesNotMatch(set, /HISTORY_/);
  assert.match(bg, /if\(await historyRuntime\.onAlarm\(alarm\)\)return;/);
  assert.match(bg, /origin:historyLabel\?'history':''/);
  assert.match(bg, /await historyRuntime\.resume\(\)/);
  const html = read('analytics.html');
  assert.match(html, /data-t="history"/);
  assert.match(html, /tối đa 2\.000 dòng mới nhất/);
  void HISTORY_KEY; void archiveSummary;
});
