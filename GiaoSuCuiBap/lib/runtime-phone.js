/* ============================================================================
 *  4.20.0 — LINK ĐIỆN THOẠI: phần chạy trong service worker.
 *
 *  Khi bật, tiện ích mở MỘT cổng native messaging tới cầu nối điện thoại
 *  (vn.giaosucuibap.dienthoai). Cổng mở giữ service worker sống (Chrome ≥ 105),
 *  và Chrome giữ tệp .exe chạy chừng nào cổng còn mở. Lệnh "tìm gói" từ điện
 *  thoại chạy ĐÚNG luồng Tìm gói thầu của tiện ích (startTbmtSearch) — cùng hàng
 *  đợi, cùng khoá chống chạy chồng, cùng chặn khi e-GP đổi cấu trúc hay khi đang
 *  khoá chỉnh sửa. Mọi phụ thuộc Chrome được truyền vào để kiểm thử.
 * ========================================================================== */
import { PHONE_HOST, PHONE_STORE_KEY, cleanPhoneCriteria, buildPhoneResult, phoneProgress, newPhoneKey, defaultPhoneState, phoneLinkUrl, isActiveRunStatus, phoneLinkMessage } from './phone-link.js';

export const TELEGRAM_RETRY_MS = 10 * 60 * 1000;

export function createPhoneRuntime({
  storage, runtime, version = '',
  startSearch, cancelSearch, readActiveRun, readFinishedRun, blockedReason = async () => null,
  onEnabledChange = async () => {}, sendLinkMessage = null,
  now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  pollMs = 1000, jobTimeoutMs = 15 * 60 * 1000
}) {
  let port = null;
  let job = null;          // {id, runId}
  let writing = Promise.resolve();
  let sending = null;      // lời gửi Telegram đang chạy (không gửi chồng)

  async function readState() {
    const o = await storage.get({ [PHONE_STORE_KEY]: null });
    const s = o[PHONE_STORE_KEY];
    return { ...defaultPhoneState(), ...(s && typeof s === 'object' ? s : {}) };
  }
  /* Các bản ghi trạng thái nối tiếp nhau: tin "ready" và "tunnel" tới sát nhau
     không được ghi đè lẫn nhau. */
  function writeState(patch) {
    writing = writing.then(async () => {
      const s = await readState();
      const next = { ...s, ...(typeof patch === 'function' ? patch(s) : patch), updatedAt: new Date(now()).toISOString() };
      await storage.set({ [PHONE_STORE_KEY]: next });
      return next;
    }).catch(() => readState());
    return writing;
  }
  const post = (msg) => { try { port?.postMessage(msg); } catch { /* cổng vừa đóng */ } };

  function connect(key) {
    let p;
    try { p = runtime.connectNative(PHONE_HOST); } catch (error) {
      void writeState({ host: { connected: false, version: '', error: String(error?.message || error).slice(0, 300) } });
      return;
    }
    port = p;
    p.onMessage.addListener((msg) => { void onMessage(msg); });
    p.onDisconnect.addListener(() => {
      const error = String(runtime.lastError?.message || 'Cầu nối điện thoại đã đóng.').slice(0, 300);
      if (port === p) port = null;
      void writeState({ host: { connected: false, version: '', error }, tunnel: { state: 'off', url: '', code: '' } });
    });
    p.postMessage({ type: 'config', key, version });
  }

  function disconnect() {
    const p = port;
    port = null;
    try { p?.disconnect(); } catch { /* đã đóng */ }
  }

  async function onMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ready') {
      await writeState({ host: { connected: true, version: String(msg.version || '').slice(0, 20), error: '' }, tunnel: safeTunnel(msg.tunnel) });
      await maybeSendLink();
    } else if (msg.type === 'tunnel') {
      await writeState({ tunnel: safeTunnel(msg) });
      await maybeSendLink();
    } else if (msg.type === 'error') {
      await writeState((s) => ({ host: { ...s.host, error: String(msg.code || 'HOST_ERROR').slice(0, 60) } }));
    } else if (msg.type === 'job' && msg.op === 'search') {
      await runSearch(String(msg.id || ''), msg.criteria);
    } else if (msg.type === 'job' && msg.op === 'cancel') {
      if (job?.runId) await cancelSearch(job.runId).catch(() => {});
    }
  }

  const safeTunnel = (t = {}) => ({ state: String(t.state || 'off').slice(0, 20), url: String(t.url || '').slice(0, 200), code: String(t.code || '').slice(0, 60) });

  async function runSearch(id, rawCriteria) {
    if (!/^[a-f0-9]{8,64}$/.test(id)) return;
    if (job) { post({ type: 'job-error', id, code: 'PC_BUSY', message: 'Máy tính đang chạy một lượt tra từ điện thoại.' }); return; }
    const blocked = await blockedReason();
    if (blocked) { post({ type: 'job-error', id, code: blocked, message: '' }); return; }
    job = { id, runId: null };
    try {
      const started = await startSearch({ ...cleanPhoneCriteria(rawCriteria), focusTab: false });
      if (!started?.ok) {
        post({ type: 'job-error', id, code: started?.run ? 'PC_BUSY' : 'START_FAILED', message: String(started?.message || '').slice(0, 300) });
        return;
      }
      job.runId = started.runId;
      const deadline = now() + jobTimeoutMs;
      let last = '';
      for (;;) {
        const active = await readActiveRun();
        if (!active || active.id !== job.runId || !isActiveRunStatus(active.status)) break;
        const progress = phoneProgress(active);
        const sig = JSON.stringify(progress);
        if (sig !== last) { last = sig; post({ type: 'job-progress', id, progress }); }
        if (now() > deadline) {
          await cancelSearch(job.runId).catch(() => {});
          post({ type: 'job-error', id, code: 'TIMEOUT', message: '' });
          return;
        }
        await sleep(pollMs);
      }
      const { run, tenders } = await readFinishedRun(job.runId);
      if (!run) { post({ type: 'job-error', id, code: 'RUN_MISSING', message: '' }); return; }
      const result = buildPhoneResult(run, tenders, now());
      post({ type: 'job-result', id, resultJson: JSON.stringify(result) });
      await writeState({ lastJobAt: new Date(now()).toISOString(), lastJobStatus: result.status });
    } catch (error) {
      post({ type: 'job-error', id, code: 'EXTENSION_ERROR', message: String(error?.message || error).slice(0, 300) });
    } finally {
      job = null;
    }
  }

  /* Link đổi (đường hầm mở lại, đổi khoá) và người dùng bật "Gửi qua Telegram": gửi link
     mới MỘT lần. Gửi hỏng thì báo thức mỗi phút thử lại, nhưng cách nhau ít nhất 10 phút
     cho cùng một link — Bot Token sai không được biến thành tin rác mỗi phút. */
  async function maybeSendLink() {
    if (typeof sendLinkMessage !== 'function') return;
    if (sending) return sending;
    sending = (async () => {
      const s = await readState();
      if (!s.enabled || !s.telegram || s.tunnel?.state !== 'up') return;   // không gửi link 127.0.0.1 của chế độ thử
      const link = phoneLinkUrl(s.tunnel, s.key);
      if (!link || link === s.telegramSentLink) return;
      const lastAt = Date.parse(s.telegramLast?.at || '');
      if (s.telegramTried === link && s.telegramLast?.ok === false && Number.isFinite(lastAt) && now() - lastAt < TELEGRAM_RETRY_MS) return;
      let r;
      try { r = await sendLinkMessage(phoneLinkMessage(link, now())); } catch (error) { r = { ok: false, message: String(error?.message || error) }; }
      const ok = r?.ok === true;
      await writeState((cur) => ({
        telegramTried: link,
        telegramSentLink: ok ? link : cur.telegramSentLink,
        telegramLast: { at: new Date(now()).toISOString(), ok, message: String(r?.message || (ok ? 'Đã gửi.' : 'Không gửi được.')).slice(0, 300) }
      }));
    })().catch(() => {}).finally(() => { sending = null; });
    return sending;
  }

  /** Gọi khi service worker khởi động, khi báo thức kêu, khi bật/tắt. */
  async function ensure() {
    const s = await readState();
    if (!s.enabled) { disconnect(); return s; }
    if (port) { await maybeSendLink(); return readState(); }
    let key = s.key;
    if (!/^[A-Za-z0-9_-]{24,128}$/.test(key)) { key = newPhoneKey(); await writeState({ key }); }
    connect(key);
    return readState();
  }

  /** Bật/tắt gửi link mới qua Telegram. Bật lúc link đang chạy thì gửi ngay link hiện tại. */
  async function setTelegram(enabled) {
    await writeState({ telegram: enabled === true, telegramSentLink: '', telegramTried: '', telegramLast: null });
    if (enabled === true) await maybeSendLink();
    return state();
  }

  async function setEnabled(enabled) {
    await writeState({ enabled: enabled === true });
    await onEnabledChange(enabled === true);
    if (enabled !== true) {
      disconnect();
      await writeState({ host: { connected: false, version: '', error: '' }, tunnel: { state: 'off', url: '', code: '' } });
    }
    await ensure();
    return state();
  }

  /** Đổi khoá: mọi link/mã QR cũ hết hiệu lực ngay; máy phục vụ nhận khoá mới, giữ đường hầm. */
  async function rotateKey() {
    const key = newPhoneKey();
    await writeState({ key });
    post({ type: 'config', key, version });
    await maybeSendLink();
    return state();
  }

  async function state() {
    const s = await readState();
    const link = s.enabled ? phoneLinkUrl(s.tunnel, s.key) : '';
    const { key, telegramSentLink, telegramTried, ...rest } = s;
    return { ok: true, ...rest, hasKey: Boolean(key), link, busy: Boolean(job), telegramSentCurrent: Boolean(link) && telegramSentLink === link };
  }

  return { ensure, setEnabled, setTelegram, rotateKey, state, disconnect, isConnected: () => Boolean(port), sendPending: () => sending };
}
