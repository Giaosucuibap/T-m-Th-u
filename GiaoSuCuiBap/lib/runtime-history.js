/* Điều phối KHO LỊCH SỬ (4.19.0): mỗi 10 phút một nhịp — ghi kết quả lượt vừa
   xong, rồi (nếu được phép) bắt đầu lượt kế tiếp. Trạng thái nằm trong
   chrome.storage.local nên tắt Chrome giữa chừng thì lần sau chạy tiếp; lượt dở
   dang được đánh dấu "bị gián đoạn" và thử lại. Mọi phụ thuộc Chrome/e-GP được
   truyền vào để kiểm thử chạy lại được. */
import { HISTORY_KEY, HISTORY_ALARM, emptyHistory, buildHistoryQueue, nextItem, canStartNow, huntDueWithin, outcomeFromScan, recordOutcome,
  isBusyScan, queueProgress, archiveSummary } from './history-archive.js';

export function createHistoryRuntime({ storage, alarms, readJobs, startScan, readObservations = async () => [], now = Date.now }) {
  let queue = Promise.resolve();
  const serial = (fn) => { const run = queue.then(fn); queue = run.catch(() => {}); return run; };
  async function load() {
    const raw = (await storage.get({ [HISTORY_KEY]: null }))[HISTORY_KEY];
    return raw && typeof raw === 'object' && Array.isArray(raw.items) ? { ...emptyHistory(), ...raw } : emptyHistory();
  }
  const save = (state) => storage.set({ [HISTORY_KEY]: state });

  async function status() {
    const state = await load();
    return { ok: true, state: { ...state, items: state.items.map(({ payload, ...rest }) => rest) }, progress: queueProgress(state), archive: archiveSummary(await readObservations()) };
  }

  function configure(raw, { watchedInvestors = [] } = {}) {
    return serial(async () => {
      const old = await load();
      if (old.current) return { ok: false, message: 'Đang có một lượt nạp chạy dở. Hãy tạm dừng và chờ lượt đó xong rồi lập lại kế hoạch.' };
      const { config, items } = buildHistoryQueue(raw, { now: now(), watchedInvestors });
      // Giữ kết quả các mục trùng (cùng tháng / cùng chủ đầu tư) đã nạp trước đó — không nạp lại vô ích.
      const prev = new Map(old.items.filter((i) => i.status === 'done').map((i) => [i.id, i]));
      const merged = items.map((i) => (prev.has(i.id) && JSON.stringify(prev.get(i.id).payload) === JSON.stringify(i.payload) ? prev.get(i.id) : i));
      const state = { ...emptyHistory(), enabled: true, paused: false, config, items: merged, createdAt: new Date(now()).toISOString() };
      await save(state);
      await alarms.create(HISTORY_ALARM, { delayInMinutes: 1, periodInMinutes: 10 });
      return { ok: true, ...(await status()) };
    });
  }

  function setPaused(paused) {
    return serial(async () => {
      const state = await load();
      if (!state.items.length) return { ok: false, message: 'Chưa lập kế hoạch nạp lịch sử.' };
      await save({ ...state, paused: Boolean(paused) });
      if (!paused) await alarms.create(HISTORY_ALARM, { delayInMinutes: 1, periodInMinutes: 10 });
      return { ok: true, ...(await status()) };
    });
  }

  function clear() {
    return serial(async () => {
      const state = await load();
      if (state.current) return { ok: false, message: 'Đang có một lượt nạp chạy dở; hãy tạm dừng và chờ lượt đó xong.' };
      await save(emptyHistory()); await alarms.clear(HISTORY_ALARM);
      return { ok: true, ...(await status()) };
    });
  }

  /** Một nhịp điều phối. Trả về lý do khi không làm gì — hiện cho người dùng. */
  function tick() {
    return serial(async () => {
      let state = await load();
      const at = now();
      if (!state.enabled || !state.items.length) return { ok: true, skipped: 'off' };
      const jobs = await readJobs();
      if (state.current) {
        const scan = jobs.bidOpenScan;
        if (scan && scan.id === state.current.scanId) {
          if (isBusyScan(scan)) { await save({ ...state, lastTickAt: new Date(at).toISOString(), lastSkip: 'Đang nạp.' }); return { ok: true, skipped: 'running' }; }
          state = recordOutcome(state, state.current.itemId, outcomeFromScan(scan), at);
        } else {
          state = recordOutcome(state, state.current.itemId, { status: 'INTERRUPTED', note: 'Lượt bị thay bởi một lượt soi biên bản khác, hoặc Chrome đóng giữa chừng — sẽ thử lại.' }, at);
        }
      }
      const next = nextItem(state);
      if (!next) {
        state = { ...state, finishedAt: state.finishedAt || new Date(at).toISOString(), lastTickAt: new Date(at).toISOString(), lastSkip: 'Đã nạp xong kế hoạch.' };
        await save(state); await alarms.clear(HISTORY_ALARM);
        return { ok: true, done: true };
      }
      if (jobs.readOnly || jobs.schemaRed) {
        await save({ ...state, lastTickAt: new Date(at).toISOString(), lastSkip: jobs.readOnly ? 'Đang khoá tự động hoá.' : 'e-GP vừa đổi cấu trúc — tự dừng.' });
        return { ok: true, skipped: 'blocked' };
      }
      const gate = canStartNow(state, { now: at, activeJob: jobs.activeJob, canaryNextRunAt: jobs.canaryNextRunAt, huntDueSoon: huntDueWithin(jobs.hunts, at) });
      if (!gate.ok) { await save({ ...state, lastTickAt: new Date(at).toISOString(), lastSkip: gate.reason }); return { ok: true, skipped: gate.reason }; }
      const started = await startScan({ ...next.payload, focusTab: false, historyLabel: next.label }).catch((e) => ({ ok: false, message: String(e?.message || e) }));
      state = { ...state, lastTickAt: new Date(at).toISOString(), lastSkip: '',
        items: state.items.map((i) => (i.id === next.id ? { ...i, attempts: i.attempts + 1, status: started?.ok ? 'running' : (i.attempts + 1 >= 3 ? 'error' : 'interrupted'),
          ...(started?.ok ? {} : { outcome: { status: 'NOT_STARTED', note: String(started?.message || 'không bắt đầu được').slice(0, 200), at: new Date(at).toISOString() } }) } : i)) };
      if (started?.ok) state.current = { itemId: next.id, scanId: started.scan?.id || '', startedAt: new Date(at).toISOString() };
      await save(state);
      return { ok: true, started: Boolean(started?.ok), item: next.id };
    });
  }

  /** Chrome khởi động / lưu cấu hình: kế hoạch còn dở thì giữ báo thức chạy tiếp. */
  async function resume() {
    const state = await load();
    if (state.enabled && !state.paused && !state.finishedAt && state.items.length) await alarms.create(HISTORY_ALARM, { delayInMinutes: 2, periodInMinutes: 10 });
  }

  async function onAlarm(alarm) {
    if (alarm?.name !== HISTORY_ALARM) return false;
    await tick();
    return true;
  }

  return { status, configure, setPaused, clear, tick, onAlarm, resume };
}
