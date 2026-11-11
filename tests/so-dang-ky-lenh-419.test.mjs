/* ============================================================================
 *  SỔ ĐĂNG KÝ LỆNH — bước đầu tách khối switch của background.js (4.19.0)
 *
 *  Khoá: mỗi lệnh đúng một chủ (đăng ký trùng là lỗi khi khởi động); lệnh đã
 *  chuyển sang mô-đun không còn sót trong switch cũ; lệnh của mô-đun không lọt
 *  vào danh sách content script được gọi; và các lệnh chạy đúng với phụ thuộc giả.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMessageRegistry } from '../GiaoSuCuiBap/lib/message-registry.js';
import { automationHandlers } from '../GiaoSuCuiBap/lib/handlers/automation.js';
import { validateHunt, safeWatches, MAX_HUNTS_ALLOWED } from '../GiaoSuCuiBap/lib/hunts.js';
import { wakeTimes } from '../GiaoSuCuiBap/lib/station.js';

const bg = fs.readFileSync(new URL('../GiaoSuCuiBap/background.js', import.meta.url), 'utf8');

function deps(over = {}) {
  let state = { hunts: [], watchedInvestors: [], settings: {} };
  const calls = [];
  const d = { getState: async () => state, save: async (v) => { state = { ...state, ...v }; }, withLock: async (fn) => fn(), KEYS: { hunts: 'hunts', watchedInvestors: 'watchedInvestors' },
    validateHunt, maxHunts: MAX_HUNTS_ALLOWED, ensureHuntAlarms: async (h) => calls.push(['alarms', h.length]), runHuntById: async (id, o) => ({ ok: true, id, o }),
    huntRuntime: { stationStatus: async () => ({ lastAliveAt: 'x' }) }, liveCanaryRuntime: { status: async () => ({ ok: true, liveCanary: { status: 'GREEN' } }), configure: async (p) => ({ ok: true, p }), run: async (o) => ({ ok: true, o }) },
    historyRuntime: { status: async () => ({ ok: true }), configure: async (p, o) => ({ ok: true, p, o }), setPaused: async (v) => ({ ok: true, v }), clear: async () => ({ ok: true }), tick: async () => calls.push(['tick']) },
    wakeTimes, schemaIsRed: () => false, canaryBlocked: async () => false, safeWatches, uuid: () => 'id-1', now: () => Date.parse('2026-11-06T03:00:00Z'), ...over };
  return { d, calls, get: () => state };
}

test('mỗi lệnh đúng một chủ: đăng ký trùng hoặc thiếu hàm là lỗi ngay', () => {
  const r = createMessageRegistry().register('a', { X_ONE: () => 1 });
  assert.throws(() => r.register('b', { X_ONE: () => 2 }), /đã do "a" xử lý/);
  assert.throws(() => r.register('b', { X_TWO: 5 }), /thiếu hàm/);
  assert.throws(() => r.register('b', { 'xấu': () => 1 }), /không hợp lệ/);
  assert.equal(r.owner('X_ONE'), 'a');
});

test('lệnh chưa đăng ký đi tiếp xuống switch cũ; lệnh đã đăng ký trả kết quả của mô-đun', async () => {
  const r = createMessageRegistry().register('a', { PING: async (p) => ({ ok: true, echo: p.x }) });
  assert.deepEqual(await r.dispatch({ type: 'KHAC' }, {}), { handled: false });
  assert.deepEqual(await r.dispatch({ type: 'PING', payload: { x: 7 } }, {}), { handled: true, response: { ok: true, echo: 7 } });
});

test('lệnh mảng tự động hoá đã rời khỏi switch cũ và không mở cho content script', () => {
  const types = Object.keys(automationHandlers(deps().d));
  assert.equal(types.length, 15);
  for (const t of types) assert.doesNotMatch(bg, new RegExp(`case '${t}'`), `${t} còn sót trong switch`);
  const set = bg.slice(bg.indexOf('const CONTENT_MESSAGE_TYPES=new Set(['), bg.indexOf(']);', bg.indexOf('const CONTENT_MESSAGE_TYPES')));
  for (const t of types) assert.doesNotMatch(set, new RegExp(`'${t}'`));
  // Cửa vào chung kiểm nguồn gửi và chế độ khoá TRƯỚC khi chuyển cho sổ đăng ký.
  const gate = bg.indexOf("if(mutating&&(await readSafetyState()).settings.readOnlyMode)");
  const route = bg.indexOf('const routed=await messageRegistry.dispatch(message,sender);');
  assert.ok(gate > 0 && route > gate, 'sổ đăng ký phải nằm sau phần kiểm tra an toàn');
});

test('SAVE_HUNT qua mô-đun: tạo mới ghi mốc hiệu lực, đặt lại báo thức; quá 12 bộ thì từ chối', async () => {
  const x = deps();
  const h = automationHandlers(x.d);
  const r = await h.SAVE_HUNT({ name: 'Thủy lợi', times: '06:05', criteria: { province: 'Lâm Đồng' } });
  assert.equal(r.ok, true);
  assert.equal(r.hunts[0].id, 'id-1');
  assert.equal(r.hunts[0].createdAt, '2026-11-06T03:00:00.000Z');
  assert.equal(r.hunts[0].activeSince, '2026-11-06T03:00:00.000Z');
  assert.deepEqual(x.calls[0], ['alarms', 1]);
  assert.equal((await h.SAVE_HUNT({ name: '' })).ok, false);
  const full = deps(); full.d.getState = async () => ({ hunts: Array.from({ length: MAX_HUNTS_ALLOWED }, (_, i) => ({ id: `h${i}` })) });
  await assert.rejects(automationHandlers({ ...full.d, uuid: () => 'moi' }).SAVE_HUNT({ name: 'x', criteria: { province: 'Lâm Đồng' } }), /Đã đủ/);
});

test('CANARY_RUN nhường lượt tra cứu đang chạy; STATION_STATUS trả giờ săn và giờ đánh thức', async () => {
  const blocked = automationHandlers(deps({ canaryBlocked: async () => true }).d);
  assert.match((await blocked.CANARY_RUN({})).message, /Hãy chờ/);
  const x = deps(); x.d.getState = async () => ({ hunts: [{ enabled: true, times: ['06:05'] }], settings: {} });
  const st = await automationHandlers(x.d).STATION_STATUS();
  assert.deepEqual([st.huntTimes, st.wakeTimes], [['06:05'], ['06:02']]);
  const w = await automationHandlers(deps().d).SAVE_WATCH({ name: 'Ban QLDA tỉnh Lâm Đồng', taxCode: '5800000001' });
  assert.equal(w.watchedInvestors[0].name, 'Ban QLDA tỉnh Lâm Đồng');
});

import { navigationHandlers, PAGE_COMMANDS } from '../GiaoSuCuiBap/lib/handlers/navigation.js';
import { searchStoreHandlers } from '../GiaoSuCuiBap/lib/handlers/search-store.js';
import { isEgpUrl } from '../GiaoSuCuiBap/lib/egp-host.js';

test('điều hướng: mở đúng trang của tiện ích; OPEN_EGP chỉ mở địa chỉ e-GP chính thức', async () => {
  const opened = [];
  const nav = navigationHandlers({ tabs: { create: async (o) => opened.push(o.url) }, runtime: { getURL: (p) => `chrome-extension://x/${p}`, openOptionsPage: async () => opened.push('options') },
    getState: async () => ({ template: { sourcePageUrl: 'https://evil.example/phishing' } }), isEgpUrl, defaultEgpUrl: 'https://muasamcong.mof.gov.vn/vi/web/guest/contractor-selection' });
  assert.equal(Object.keys(nav).length, Object.keys(PAGE_COMMANDS).length + 2);
  await nav.OPEN_BID_OPEN(); await nav.OPEN_OPTIONS(); await nav.OPEN_EGP();
  assert.deepEqual(opened, ['chrome-extension://x/bidopen.html', 'options', 'https://muasamcong.mof.gov.vn/vi/web/guest/contractor-selection']);
  for (const t of Object.keys(nav)) assert.doesNotMatch(bg, new RegExp(`case '${t}'`), `${t} còn sót trong switch`);
});

test('tra cứu kho: bộ tìm kiếm có tên tối đa 30; lệnh đã rời switch cũ', async () => {
  let state = { savedSearches: Array.from({ length: 30 }, (_, i) => ({ id: `s${i}` })) };
  const h = searchStoreHandlers({ getState: async () => state, save: async (v) => { state = { ...state, savedSearches: v.saved }; }, withLock: async (fn) => fn(), appStorage: {}, searchStateRuntime: {},
    KEYS: {}, SAVED_SEARCHES: 'saved', safeSavedSearches: (rows) => rows.filter((r) => r.name), isEgpUrl });
  await assert.rejects(h.SAVE_NAMED_SEARCH({ name: 'Lâm Đồng', criteria: {} }), /Đã lưu 30/);
  await assert.rejects(h.SAVE_NAMED_SEARCH({ name: '' }), /không hợp lệ/);
  assert.equal((await h.DELETE_NAMED_SEARCH({ id: 's0' })).savedSearches.length, 29);
  for (const t of Object.keys(h)) assert.doesNotMatch(bg, new RegExp(`case '${t}'`), `${t} còn sót trong switch`);
});
