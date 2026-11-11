/* ============================================================================
 *  THEO DÕI ĐỐI THỦ (4.22.0) — lib/rival-watch.js, lib/runtime-rivals.js
 *
 *  Khoá: vừa thêm đối thủ thì KHÔNG báo các gói đã có; gói mới dự / mới trúng thì báo một
 *  lần; "dự" rồi "trúng" là hai tin; "trúng" không lùi về "dự"; bỏ theo dõi thì xoá dấu;
 *  tra e-GP mỗi đối thủ tối đa một lần/ngày, mỗi lượt tối đa 5, dừng khi bận / bị huỷ /
 *  đang khoá; Telegram chỉ nhắn khi đã bật gửi tự động.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { safeRivalWatches, rivalTax, packageOf, newRivalEvents, rivalSummary, rivalsDue, rivalEventText, rivalTelegramText,
  MAX_RIVALS, RIVAL_STALE_MS, RIVAL_SWEEP_LIMIT } from '../GiaoSuCuiBap/lib/rival-watch.js';
import { createRivalRuntime, readRivalWatch } from '../GiaoSuCuiBap/lib/runtime-rivals.js';
import { insightHandlers } from '../GiaoSuCuiBap/lib/handlers/insight.js';
import { sanitizeBackupFeatures } from '../GiaoSuCuiBap/lib/backup.js';

const T0 = Date.parse('2026-11-11T02:00:00Z');
const A = '5800000111', B = '5800000222';
const bid = (tax, no, extra = {}) => ({ source: 'bbmt', notifyNo: no, bidName: `Gói ${no}`, investorName: 'Ban QLDA Đức Trọng', taxCode: tax, contractorName: `Cty ${tax}`, bidPrice: 4.8e9, packageBasis: 5e9, bidderCount: 3, won: null, at: '2026-11-05T02:00:00Z', ...extra });
const win = (tax, no, extra = {}) => ({ source: 'kqlcnt', notifyNo: no, bidName: `Gói ${no}`, investorName: 'Ban QLDA Đức Trọng', taxCode: `vn${tax}`, contractorName: `Cty ${tax}`, finalPrice: 4.7e9, won: true, at: '2026-11-09T02:00:00Z', sourceUrl: 'https://muasamcong.mof.gov.vn/x', ...extra });

test('mã số thuế: nhận 10 số, bỏ "vn" và mã chi nhánh; danh sách không trùng, tối đa 30', () => {
  assert.equal(rivalTax('vn5800000111'), A);
  assert.equal(rivalTax('5800000111-001'), A);
  assert.equal(rivalTax(' 58 0000 0111 '), A);
  assert.equal(rivalTax('12345'), '');
  assert.equal(rivalTax(null), '');
  const list = safeRivalWatches([{ taxCode: A, name: ' Cty  A ' }, { taxCode: `vn${A}` }, { taxCode: 'sai' }, null, { taxCode: B, addedAt: 'không phải ngày' }]);
  assert.deepEqual(list.map((r) => r.taxCode), [A, B]);
  assert.equal(list[0].name, 'Cty A');
  assert.equal(list[1].addedAt, '');
  assert.equal(safeRivalWatches(Array.from({ length: 50 }, (_, i) => ({ taxCode: String(5800000000 + i) }))).length, MAX_RIVALS);
  assert.equal(packageOf({ notifyNo: 'IB2600455010-01' }), 'IB2600455010');
  assert.equal(packageOf({ packageKey: 'ib2600455010-00::x' }), 'IB2600455010');
});

test('vừa theo dõi: ghi mốc, không báo gói đã có; sau đó chỉ báo gói mới', () => {
  const watches = [{ taxCode: A, name: 'Cty A' }];
  const first = newRivalEvents({ watches, observations: [bid(A, 'IB1'), win(A, 'IB2')], now: T0 });
  assert.equal(first.events.length, 0);
  assert.deepEqual(first.seen, { [`${A}|IB1`]: 'bid', [`${A}|IB2`]: 'won' });
  assert.ok(first.baseline[A]);
  const next = newRivalEvents({ watches, observations: [bid(A, 'IB1'), win(A, 'IB2'), bid(A, 'IB3'), bid(B, 'IB9')], seen: first.seen, baseline: first.baseline, now: T0 + 1000 });
  assert.deepEqual(next.events.map((e) => [e.notifyNo, e.kind]), [['IB3', 'bid']]);
  assert.equal(next.events[0].name, 'Cty A');
  assert.equal(next.events[0].bidderCount, 3);
  // Lần sau nữa, không có gì mới thì không báo lại.
  assert.equal(newRivalEvents({ watches, observations: [bid(A, 'IB3')], seen: next.seen, baseline: next.baseline }).events.length, 0);
});

test('"dự" rồi "trúng" là hai tin; "trúng" không lùi về "dự"; quan sát cũ bị dọn rồi nạp lại không thành tin mới', () => {
  const watches = [{ taxCode: A }];
  const base = newRivalEvents({ watches, observations: [], now: T0 });
  const s1 = newRivalEvents({ watches, observations: [bid(A, 'IB5')], seen: base.seen, baseline: base.baseline });
  assert.deepEqual(s1.events.map((e) => e.kind), ['bid']);
  const s2 = newRivalEvents({ watches, observations: [bid(A, 'IB5'), win(A, 'IB5')], seen: s1.seen, baseline: s1.baseline });
  assert.deepEqual(s2.events.map((e) => [e.kind, e.upgraded]), [['won', true]]);
  assert.equal(s2.events[0].sourceUrl, 'https://muasamcong.mof.gov.vn/x');
  const s3 = newRivalEvents({ watches, observations: [bid(A, 'IB5')], seen: s2.seen, baseline: s2.baseline });
  assert.equal(s3.events.length, 0);
  assert.equal(s3.seen[`${A}|IB5`], 'won');
  const pruned = newRivalEvents({ watches, observations: [], seen: s3.seen, baseline: s3.baseline });
  assert.equal(pruned.seen[`${A}|IB5`], 'won', 'giữ dấu đã xem khi kho dọn quan sát cũ');
  assert.equal(newRivalEvents({ watches, observations: [win(A, 'IB5')], seen: pruned.seen, baseline: pruned.baseline }).events.length, 0);
  // Bỏ theo dõi: dấu của đối thủ đó được xoá.
  assert.deepEqual(newRivalEvents({ watches: [], observations: [win(A, 'IB5')], seen: s3.seen, baseline: s3.baseline }).seen, {});
});

test('đường dẫn nguồn chỉ nhận trang e-GP; liên danh và giá được ghi đúng', () => {
  const watches = [{ taxCode: A, name: 'Cty A' }];
  const base = newRivalEvents({ watches, observations: [], now: T0 });
  const r = newRivalEvents({ watches, observations: [win(A, 'IB7', { sourceUrl: 'https://evil.example/x', isVenture: true })], seen: base.seen, baseline: base.baseline });
  assert.equal(r.events[0].sourceUrl, '');
  assert.match(rivalEventText(r.events[0]), /Cty A trúng \(liên danh\): Gói IB7 — giá trúng 4,7 tỷ \(09\/11\/2026\)/);
  const tg = rivalTelegramText([r.events[0], { ...r.events[0], kind: 'bid', name: '<b>x</b>' }], (s) => String(s).replace(/</g, '&lt;'));
  assert.match(tg, /Động thái đối thủ đang theo dõi<\/b> \(2\)/);
  assert.match(tg, /TRÚNG \(liên danh\)/);
  assert.match(tg, /&lt;b>x&lt;\/b>/, 'tên phải được thoát ký tự trước khi đưa vào tin HTML');
  assert.equal(rivalTelegramText([]), '');
});

test('tóm tắt và lượt tra e-GP: lâu chưa tra đứng trước, quá hạn mới tra, tối đa 5 mỗi lượt', () => {
  const watches = [{ taxCode: A, name: 'A' }, { taxCode: B, name: 'B' }];
  const sum = rivalSummary({ watches, observations: [bid(A, 'IB1'), win(A, 'IB1'), bid(A, 'IB2')], checkedAt: { [A]: '2026-11-10T00:00:00Z' } });
  assert.deepEqual(sum.map((r) => [r.taxCode, r.packages, r.wins, r.bidsOnly]), [[A, 2, 1, 1], [B, 0, 0, 0]]);
  assert.equal(sum[0].latest.length, 2);
  const due = rivalsDue({ watches, checkedAt: { [A]: new Date(T0 - 3600_000).toISOString() }, now: T0 });
  assert.deepEqual(due.map((r) => r.taxCode), [B], 'A vừa tra 1 giờ trước nên chưa đến lượt');
  assert.deepEqual(rivalsDue({ watches, checkedAt: { [A]: new Date(T0 - RIVAL_STALE_MS - 1).toISOString(), [B]: new Date(T0 - 2 * RIVAL_STALE_MS).toISOString() }, now: T0 }).map((r) => r.taxCode), [B, A]);
  const many = Array.from({ length: 12 }, (_, i) => ({ taxCode: String(5800000000 + i) }));
  assert.equal(rivalsDue({ watches: many, now: T0 }).length, RIVAL_SWEEP_LIMIT);
  assert.equal(rivalsDue({ watches, checkedAt: { [A]: new Date(T0).toISOString(), [B]: new Date(T0).toISOString() }, now: T0, force: true }).length, 2);
});

function harness({ state = {}, lookups = {}, blocked = false } = {}) {
  let s = { settings: { telegramEnabled: true }, watchedRivals: [], rivalWatch: null, observations: [], ...state };
  let clock = T0, current = null, blockedNow = blocked;
  const sent = [], notes = [], started = [];
  const rt = createRivalRuntime({ getState: async () => s, save: async (v) => { s = { ...s, ...v }; }, withLock: async (fn) => fn(), KEYS: { watchedRivals: 'watchedRivals', rivalWatch: 'rivalWatch' },
    sendTelegram: async (settings, text, opts) => { sent.push({ text, opts }); return { ok: true }; }, notify: (n) => notes.push(n), escapeHtml: (x) => String(x),
    startWinnerLookup: async (p) => {
      started.push(p.taxCode);
      const plan = lookups[p.taxCode] || { status: 'SUCCESS', add: [] };
      if (plan.refuse) return { ok: false, message: 'Một lượt tra cứu nhà thầu đang chạy.' };
      current = { id: `lk-${started.length}`, status: 'RUNNING', polls: 0, plan };
      return { ok: true, lookup: { id: current.id } };
    },
    readLookup: async () => {
      if (!current) return null;
      if (++current.polls >= 2 && current.status === 'RUNNING') { current.status = current.plan.status; s = { ...s, observations: [...s.observations, ...(current.plan.add || [])] }; }
      return { id: current.id, status: current.status, packages: [], message: current.plan.message || '' };
    },
    blocked: async () => blockedNow, sleep: async () => {}, now: () => clock, pollMs: 0, maxPolls: 6 });
  return { rt, sent, notes, started, state: () => s, tick: (ms) => { clock += ms; }, block: (v) => { blockedNow = v; } };
}

test('thêm đối thủ: ghi mốc im lặng; sai mã số thuế bị từ chối; quá 30 thì báo', async () => {
  const h = harness({ state: { observations: [win(A, 'IB1'), bid(A, 'IB2')] } });
  assert.equal((await h.rt.add({ taxCode: '123' })).ok, false);
  const r = await h.rt.add({ taxCode: `vn${A}`, name: 'Cty A' });
  assert.equal(r.ok, true); assert.equal(r.added, true);
  assert.equal(r.rivals[0].packages, 2);
  assert.equal(r.events.length, 0, 'gói đã có trong kho không phải tin mới');
  assert.equal(h.sent.length + h.notes.length, 0);
  assert.equal((await h.rt.add({ taxCode: A, name: 'Tên mới' })).added, false);
  assert.equal(h.state().watchedRivals[0].name, 'Tên mới');
  const full = harness({ state: { watchedRivals: Array.from({ length: MAX_RIVALS }, (_, i) => ({ taxCode: String(5800000000 + i) })) } });
  assert.match((await full.rt.add({ taxCode: '5900000001' })).message, /tối đa 30/);
});

test('có gói mới: lưu sự kiện, tăng số chưa xem, báo trên máy và nhắn MỘT tin Telegram; tắt gửi tự động hoặc đang khoá thì không nhắn', async () => {
  const h = harness();
  await h.rt.add({ taxCode: A, name: 'Cty A' });
  h.state().observations.push(win(A, 'IB1'), bid(A, 'IB2'));
  const r = await h.rt.evaluate();
  assert.equal(r.events.length, 2);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].opts.kind, 'rival');
  assert.equal(h.notes.length, 1);
  assert.match(h.notes[0].title, /2 gói mới/);
  let st = await h.rt.status();
  assert.equal(st.unread, 2); assert.equal(st.events.length, 2);
  assert.equal((await h.rt.evaluate()).events.length, 0, 'không báo lại');
  assert.equal(h.sent.length, 1);
  st = await h.rt.markRead();
  assert.equal(st.unread, 0); assert.equal(st.events.length, 2, 'đánh dấu đã xem không xoá tin');
  for (const settings of [{ telegramEnabled: false }, { telegramEnabled: true, readOnlyMode: true }]) {
    const quiet = harness({ state: { settings } });
    await quiet.rt.add({ taxCode: A });
    quiet.state().observations.push(win(A, 'IB3'));
    assert.equal((await quiet.rt.evaluate()).events.length, 1);
    assert.equal(quiet.sent.length, 0);
  }
});

test('lượt tra e-GP: tra lần lượt, ghi mốc đã tra, gom tin mới; trong ngày không tra lại', async () => {
  const h = harness({ lookups: { [A]: { status: 'SUCCESS', add: [win(A, 'IB11')] }, [B]: { status: 'PARTIAL', add: [] } } });
  await h.rt.add({ taxCode: A, name: 'A' }); await h.rt.add({ taxCode: B, name: 'B' });
  const r = await h.rt.sweep();
  assert.deepEqual(h.started, [A, B]);
  assert.equal(r.checked, 2);
  assert.deepEqual(r.events.map((e) => e.notifyNo), ['IB11']);
  assert.match(r.message, /Đã tra e-GP cho 2\/2 đối thủ\. 1 gói mới\./);
  const w = readRivalWatch(h.state().rivalWatch);
  assert.ok(w.checkedAt[A] && w.checkedAt[B] && w.lastSweepAt);
  const again = await h.rt.sweep();
  assert.equal(again.checked, 0);
  assert.equal(h.started.length, 2, 'chưa quá một ngày thì không hỏi e-GP nữa');
  h.tick(RIVAL_STALE_MS + 1000);
  await h.rt.sweep();
  assert.equal(h.started.length, 4);
});

test('lượt tra e-GP dừng đúng lúc: đang bận, bị từ chối, người dùng bấm Dừng, quá lâu; lỗi của một đối thủ không chặn đối thủ sau', async () => {
  const busy = harness({ blocked: true });
  await busy.rt.add({ taxCode: A });
  const r1 = await busy.rt.sweep();
  assert.equal(busy.started.length, 0);
  assert.match(r1.message, /Đang có lượt tra cứu khác/);
  assert.equal(readRivalWatch(busy.state().rivalWatch).checkedAt[A], undefined, 'chưa tra thì không ghi mốc — lần sau tra lại');

  const refused = harness({ lookups: { [A]: { refuse: true } } });
  await refused.rt.add({ taxCode: A }); await refused.rt.add({ taxCode: B });
  await refused.rt.sweep();
  assert.deepEqual(refused.started, [A], 'bị từ chối thì dừng cả lượt');

  const cancelled = harness({ lookups: { [A]: { status: 'CANCELLED' } } });
  await cancelled.rt.add({ taxCode: A }); await cancelled.rt.add({ taxCode: B });
  const r3 = await cancelled.rt.sweep();
  assert.deepEqual(cancelled.started, [A]);
  assert.match(r3.message, /đã bị dừng/);

  const slow = harness({ lookups: { [A]: { status: 'RUNNING' } } });
  await slow.rt.add({ taxCode: A });
  assert.match((await slow.rt.sweep()).message, /quá lâu/);

  const oneFails = harness({ lookups: { [A]: { status: 'ERROR', message: 'e-GP lỗi 500' }, [B]: { status: 'SUCCESS' } } });
  await oneFails.rt.add({ taxCode: A, name: 'A' }); await oneFails.rt.add({ taxCode: B });
  const r5 = await oneFails.rt.sweep();
  assert.deepEqual(oneFails.started, [A, B]);
  assert.equal(r5.checked, 1);
  assert.match(r5.message, /A: e-GP lỗi 500/);
});

test('tắt tự kiểm tra thì lịch không tra; bấm nút vẫn tra; đang khoá thì không; bấm cạnh một đối thủ chỉ tra đúng đối thủ đó', async () => {
  const h = harness();
  await h.rt.add({ taxCode: A }); await h.rt.add({ taxCode: B });
  await h.rt.setAuto({ auto: false });
  assert.equal((await h.rt.sweep()).reason, 'off');
  assert.equal(h.started.length, 0);
  await h.rt.sweep({ force: true, only: B });
  assert.deepEqual(h.started, [B]);
  await h.rt.sweep({ force: true });
  assert.deepEqual(h.started, [B, A, B].slice(0, h.started.length));
  assert.equal(h.started.length, 3, 'bấm nút: tra cả hai, kể cả đối thủ vừa tra');
  const locked = harness({ state: { settings: { readOnlyMode: true }, watchedRivals: [{ taxCode: A }] } });
  assert.equal((await locked.rt.sweep({ force: true })).reason, 'read-only');
  // Hai lượt gọi cùng lúc dùng chung một lượt chạy.
  const twin = harness();
  await twin.rt.add({ taxCode: A });
  await Promise.all([twin.rt.sweep(), twin.rt.sweep()]);
  assert.equal(twin.started.length, 1);
});

test('bỏ theo dõi: xoá khỏi danh sách cùng dấu đã xem, mốc và tin cũ của đối thủ đó', async () => {
  const h = harness();
  await h.rt.add({ taxCode: A }); await h.rt.add({ taxCode: B });
  h.state().observations.push(win(A, 'IB1'), win(B, 'IB2'));
  await h.rt.evaluate();
  const st = await h.rt.remove({ taxCode: A });
  assert.deepEqual(st.rivals.map((r) => r.taxCode), [B]);
  assert.deepEqual(st.events.map((e) => e.taxCode), [B]);
  const w = readRivalWatch(h.state().rivalWatch);
  assert.deepEqual(Object.keys(w.seen), [`${B}|IB2`]);
  assert.equal(w.baseline[A], undefined);
});

test('nối dây: lệnh, khoá chỉnh sửa, e-GP đổi cấu trúc, nhịp 30 phút, sao lưu và khôi phục', async () => {
  const bg = fs.readFileSync(new URL('../GiaoSuCuiBap/background.js', import.meta.url), 'utf8');
  const calls = [];
  const h = insightHandlers({ rivalRuntime: { status: async () => ({ ok: true }), add: async (p) => p, remove: async (p) => p, setAuto: async (p) => p, markRead: async () => ({ ok: true }), sweep: async (o) => { calls.push(o); return { ok: true }; } } });
  assert.deepEqual(Object.keys(h).filter((type) => /RIVAL/.test(type)).sort(), ['DELETE_RIVAL_WATCH', 'GET_RIVAL_WATCH', 'RIVAL_SWEEP_NOW', 'SAVE_RIVAL_WATCH', 'SET_RIVAL_AUTO', 'SET_RIVAL_READ']);
  await h.RIVAL_SWEEP_NOW({ taxCode: A }); await h.RIVAL_SWEEP_NOW({});
  assert.deepEqual(calls, [{ force: true, only: A }, { force: true, only: '' }]);
  assert.match(bg, /register\('hieu-thi-truong',insightHandlers\(\{rivalRuntime,hsmtRuntime\}\)\)/);
  assert.match(bg, /const WRITE_TYPES=new Set\(\[[^\]]*'RIVAL_SWEEP_NOW'/);
  assert.match(bg, /'INVESTOR_SCAN','RIVAL_SWEEP_NOW'\]\.includes\(type\)&&\(schemaIsRed/, 'e-GP đổi cấu trúc thì nút tra cũng bị chặn');
  assert.match(bg, /blocked:async\(\)=>Boolean\(schemaIsRed\(await readSafetyState\(\)\)\|\|activeListJob/);
  assert.match(bg, /rivalRuntime\.evaluate\(\)\.then\(\(\)=>rivalRuntime\.sweep\(\)\)/);
  assert.match(bg, /\[KEYS\.watchedRivals\]:clean\.watchedRivals,\[KEYS\.rivalWatch\]:null/, 'khôi phục: danh sách về, dấu đã xem đặt lại');
  const backup = sanitizeBackupFeatures({ watchedRivals: [{ taxCode: `vn${A}`, name: 'Cty A', note: 'ghi chú' }, { taxCode: 'x' }] });
  assert.deepEqual(backup.watchedRivals.map((r) => [r.taxCode, r.name, r.note]), [[A, 'Cty A', 'ghi chú']]);
  const html = fs.readFileSync(new URL('../GiaoSuCuiBap/rivals.html', import.meta.url), 'utf8');
  for (const id of ['watch-form', 'watch-tax', 'watch-list', 'watch-sweep', 'watch-auto', 'watch-events']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /chưa thấy không có nghĩa là họ không dự/, 'giới hạn của dữ liệu phải ghi rõ trên màn hình');
});
