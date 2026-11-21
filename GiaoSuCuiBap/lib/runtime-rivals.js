/* ============================================================================
 *  THEO DÕI ĐỐI THỦ — phần có trạng thái (4.22.0). Luật ở lib/rival-watch.js.
 *
 *  Hai việc:
 *   - evaluate(): so kho quan sát với lần xem trước, lưu sự kiện mới, báo trên máy và
 *     (nếu đã bật gửi tự động) nhắn một tin Telegram gom cả lượt.
 *   - sweep(): lần lượt tra e-GP "các gói đã trúng" của từng đối thủ đến lượt (mỗi đối thủ
 *     tối đa một lần mỗi ngày, mỗi lượt tối đa 5 đối thủ), dùng đúng bộ máy tra cứu của màn
 *     hình Nhà thầu trúng thầu. Đang có lượt tra khác, đang khoá, hay e-GP đổi cấu trúc thì
 *     KHÔNG chạy. Người dùng bấm Dừng thì dừng cả lượt.
 * ========================================================================== */
import { safeRivalWatches, newRivalEvents, rivalSummary, rivalsDue, rivalEventText, rivalTelegramText, rivalTax, MAX_RIVALS, MAX_RIVAL_EVENTS } from './rival-watch.js';

const BUSY = new Set(['STARTING', 'OPENING', 'RUNNING', 'LISTING', 'SCANNING']);
const plain = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export function readRivalWatch(raw) {
  const w = plain(raw);
  return { seen: plain(w.seen), baseline: plain(w.baseline), checkedAt: plain(w.checkedAt),
    events: (Array.isArray(w.events) ? w.events : []).filter((e) => e && typeof e === 'object' && e.id).slice(0, MAX_RIVAL_EVENTS),
    auto: w.auto !== false, unread: Math.max(0, Math.trunc(Number(w.unread) || 0)),
    lastSweepAt: String(w.lastSweepAt || '').slice(0, 40), lastSweepNote: String(w.lastSweepNote || '').slice(0, 400) };
}

export function createRivalRuntime({ getState, save, withLock, KEYS, sendTelegram, notify = () => {}, escapeHtml, startWinnerLookup, readLookup, flushObservations = async () => {},
  blocked = async () => false, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), pollMs = 2000, maxPolls = 150 }) {
  let sweeping = null;

  async function evaluate({ silent = false } = {}) {
    const out = await withLock(async () => {
      const s = await getState();
      const watches = safeRivalWatches(s.watchedRivals);
      const w = readRivalWatch(s.rivalWatch);
      const r = newRivalEvents({ watches, observations: s.observations, seen: w.seen, baseline: w.baseline, now: now() });
      const same = !r.events.length && JSON.stringify(r.seen) === JSON.stringify(w.seen) && JSON.stringify(r.baseline) === JSON.stringify(w.baseline);
      if (!same) {
        const known = new Set(r.events.map((e) => e.id));
        const events = [...r.events, ...w.events.filter((e) => !known.has(e.id))].slice(0, MAX_RIVAL_EVENTS);
        await save({ [KEYS.rivalWatch]: { ...w, seen: r.seen, baseline: r.baseline, events, unread: Math.min(999, w.unread + r.events.length) } });
      }
      return { events: r.events, settings: s.settings || {} };
    });
    if (out.events.length && !silent) {
      const first = out.events[0];
      try { notify({ title: `Đối thủ đang theo dõi: ${out.events.length} gói mới`, message: rivalEventText(first).slice(0, 180) + (out.events.length > 1 ? ` … và ${out.events.length - 1} gói khác` : '') }); } catch { /* thông báo trên máy là phụ */ }
      if (out.settings.telegramEnabled && !out.settings.readOnlyMode) {
        await Promise.resolve(sendTelegram(out.settings, rivalTelegramText(out.events, escapeHtml), { kind: 'rival' })).catch(() => null);
      }
    }
    return { ok: true, events: out.events };
  }

  async function waitLookup(id) {
    for (let i = 0; i < maxPolls; i++) {
      const lookup = await readLookup();
      if (!lookup || lookup.id !== id) return { finished: true, status: 'REPLACED' };
      if (!BUSY.has(String(lookup.status || ''))) return { finished: true, status: String(lookup.status || ''), count: Array.isArray(lookup.packages) ? lookup.packages.length : 0, message: String(lookup.message || '') };
      await sleep(pollMs);
    }
    return { finished: false, status: 'TIMEOUT' };
  }

  async function patch(change) {
    return withLock(async () => {
      const s = await getState();
      const w = readRivalWatch(s.rivalWatch);
      await save({ [KEYS.rivalWatch]: { ...w, ...change(w) } });
    });
  }

  async function runSweep({ force = false, only = '' } = {}) {
    const s0 = await getState();
    const w0 = readRivalWatch(s0.rivalWatch);
    if (!force && !w0.auto) return { ok: false, skipped: true, reason: 'off' };
    if ((s0.settings || {}).readOnlyMode) return { ok: false, skipped: true, reason: 'read-only', message: 'Đang khoá chỉnh sửa và tự động hoá.' };
    const one = rivalTax(only);
    // Bấm "Tra e-GP" cạnh một đối thủ: chỉ tra đúng đối thủ đó, không tính hạn mức một ngày.
    const due = one ? safeRivalWatches(s0.watchedRivals).filter((r) => r.taxCode === one)
      : rivalsDue({ watches: s0.watchedRivals, checkedAt: w0.checkedAt, now: now(), force });
    if (!due.length) return { ok: true, checked: 0, events: [], message: safeRivalWatches(s0.watchedRivals).length ? 'Hôm nay đã kiểm tra các đối thủ đang theo dõi.' : 'Chưa có đối thủ nào trong danh sách theo dõi.' };
    let checked = 0;
    const notes = [];
    for (const rival of due) {
      if (await blocked()) { notes.push('Đang có lượt tra cứu khác hoặc e-GP đang được kiểm tra; phần còn lại sẽ kiểm tra sau.'); break; }
      const started = await startWinnerLookup({ taxCode: rival.taxCode, contractorName: rival.name, focusTab: false });
      if (!started?.ok || !started.lookup?.id) { notes.push(started?.message || 'Chưa bắt đầu được lượt tra e-GP.'); break; }
      const done = await waitLookup(started.lookup.id);
      if (!done.finished) { notes.push(`Tra ${rival.name || rival.taxCode} quá lâu; sẽ thử lại lần sau.`); break; }
      if (done.status === 'CANCELLED' || done.status === 'REPLACED') { notes.push('Lượt tra đã bị dừng; phần còn lại sẽ kiểm tra sau.'); break; }
      if (done.status === 'ERROR' || done.status === 'TIMEOUT') { notes.push(`${rival.name || rival.taxCode}: ${done.message || 'e-GP không trả kết quả.'}`); continue; }
      checked += 1;
      const stamp = new Date(now()).toISOString();
      await patch((w) => ({ checkedAt: { ...w.checkedAt, [rival.taxCode]: stamp } }));
    }
    await flushObservations();
    const result = await evaluate();
    const message = [`Đã tra e-GP cho ${checked}/${due.length} đối thủ.`, result.events.length ? `${result.events.length} gói mới.` : 'Không có gói mới.', ...notes].join(' ');
    await patch(() => ({ lastSweepAt: new Date(now()).toISOString(), lastSweepNote: message }));
    return { ok: true, checked, due: due.length, events: result.events, message };
  }

  /** Mỗi lúc chỉ một lượt; gọi trùng thì dùng chung kết quả. */
  function sweep(options = {}) {
    if (!sweeping) sweeping = runSweep(options).finally(() => { sweeping = null; });
    return sweeping;
  }

  async function status() {
    const s = await getState();
    const w = readRivalWatch(s.rivalWatch);
    return { ok: true, max: MAX_RIVALS, rivals: rivalSummary({ watches: s.watchedRivals, observations: s.observations, checkedAt: w.checkedAt }),
      events: w.events.slice(0, 60), unread: w.unread, auto: w.auto, lastSweepAt: w.lastSweepAt, lastSweepNote: w.lastSweepNote, sweeping: Boolean(sweeping),
      telegram: Boolean(s.settings?.telegramEnabled) };
  }

  async function add(payload = {}) {
    const taxCode = rivalTax(payload.taxCode);
    if (!taxCode) return { ok: false, field: 'taxCode', message: 'Mã số thuế phải có 10 chữ số (ví dụ 5800000111).' };
    const result = await withLock(async () => {
      const s = await getState();
      const list = safeRivalWatches(s.watchedRivals);
      const at = list.findIndex((r) => r.taxCode === taxCode);
      if (at < 0 && list.length >= MAX_RIVALS) return { ok: false, message: `Danh sách theo dõi tối đa ${MAX_RIVALS} đối thủ. Bỏ bớt trước khi thêm.` };
      const row = { taxCode, name: String(payload.name || (at >= 0 ? list[at].name : '')).trim().slice(0, 200), note: String(payload.note ?? (at >= 0 ? list[at].note : '')).trim().slice(0, 300),
        addedAt: at >= 0 && list[at].addedAt ? list[at].addedAt : new Date(now()).toISOString() };
      if (at >= 0) list[at] = row; else list.push(row);
      await save({ [KEYS.watchedRivals]: safeRivalWatches(list) });
      return { ok: true, added: at < 0 };
    });
    if (!result.ok) return result;
    await evaluate({ silent: true });       // ghi mốc: các gói đã có trong kho không thành "tin mới"
    return { ...(await status()), added: result.added };
  }

  async function remove(payload = {}) {
    const taxCode = rivalTax(payload.taxCode);
    await withLock(async () => {
      const s = await getState();
      const w = readRivalWatch(s.rivalWatch);
      const { [taxCode]: dropBase, ...baseline } = w.baseline;
      const { [taxCode]: dropChecked, ...checkedAt } = w.checkedAt;
      const seen = Object.fromEntries(Object.entries(w.seen).filter(([key]) => key.split('|')[0] !== taxCode));
      await save({ [KEYS.watchedRivals]: safeRivalWatches(s.watchedRivals).filter((r) => r.taxCode !== taxCode),
        [KEYS.rivalWatch]: { ...w, baseline, checkedAt, seen, events: w.events.filter((e) => e.taxCode !== taxCode) } });
    });
    return status();
  }

  async function setAuto(payload = {}) { await patch(() => ({ auto: payload.auto !== false })); return status(); }
  async function markRead() { await patch(() => ({ unread: 0 })); return status(); }

  return { evaluate, sweep, status, add, remove, setAuto, markRead };
}
