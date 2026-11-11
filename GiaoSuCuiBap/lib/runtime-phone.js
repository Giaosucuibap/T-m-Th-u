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
import { normalizeRelayUrl, normalizeClaimCode, claimCodeOk, newRelayKeyPair, signWithJwk, claimMessage, registerMessage, pointerKeySig, keyFingerprint, relayBackoffMs, defaultRelayState, RELAY_CODE_TEXT } from './phone-relay.js';

const TUNNEL_URL_RE = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com$/;

export const TELEGRAM_RETRY_MS = 10 * 60 * 1000;

export function createPhoneRuntime({
  storage, runtime, version = '',
  startSearch, cancelSearch, readActiveRun, readFinishedRun, blockedReason = async () => null,
  onEnabledChange = async () => {}, sendLinkMessage = null,
  fetchImpl = (...a) => fetch(...a),
  now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  pollMs = 1000, jobTimeoutMs = 15 * 60 * 1000
}) {
  let port = null;
  let job = null;          // {id, runId}
  let writing = Promise.resolve();
  let sending = null;      // lời gửi Telegram đang chạy (không gửi chồng)
  let registering = null;  // lời đăng ký đường hầm với địa chỉ cố định đang chạy

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
      await maybeRegister();
      await maybeSendLink();
    } else if (msg.type === 'tunnel') {
      await writeState({ tunnel: safeTunnel(msg) });
      await maybeRegister();
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
      const link = phoneLinkUrl(s.tunnel, s.key, relayUrlOf(s));
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
    if (port) { await maybeRegister(); await maybeSendLink(); return readState(); }
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
    await maybeRegister(true);
    await maybeSendLink();
    return state();
  }

  /* ------------------------------------------------ 4.21.0 — địa chỉ cố định */
  const relayUrlOf = (s) => (s.relay?.claimed && s.relay.url ? s.relay.url : '');
  const iso = (ms) => new Date(ms).toISOString();
  async function postRelay(url, body) {
    try {
      // text/plain: yêu cầu "đơn giản", không cần hỏi trước (preflight); Worker trả CORS cho đúng tiện ích.
      const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => null);
      if (!j || typeof j !== 'object') return { ok: false, code: 'NOT_RELAY' };
      return { ok: res.ok && j.ok === true, code: String(j.code || (res.ok ? '' : `HTTP_${res.status}`)).slice(0, 40) };
    } catch { return { ok: false, code: 'NETWORK' }; }
  }

  /** Ghép nối một lần: địa chỉ cố định + mã 8 ký tự (người bảo trì đưa khi tạo địa chỉ). */
  async function pairRelay({ url, code } = {}) {
    const relayUrl = normalizeRelayUrl(url);
    if (!relayUrl) return { ok: false, code: 'BAD_URL', message: RELAY_CODE_TEXT.BAD_URL };
    if (!claimCodeOk(code)) return { ok: false, code: 'BAD_CODE', message: RELAY_CODE_TEXT.BAD_CODE };
    const c = normalizeClaimCode(code);
    const { publicJwk, privateJwk } = await newRelayKeyPair();
    const ts = now();
    const sig = await signWithJwk(privateJwk, claimMessage(c, ts, publicJwk.x, publicJwk.y));
    const r = await postRelay(`${relayUrl}/_gscb/claim`, { code: c, ts, publicKey: publicJwk, sig });
    if (!r.ok) {
      await writeState((cur) => ({ relay: { ...defaultRelayState(), ...cur.relay, error: r.code } }));
      return { ok: false, code: r.code, message: RELAY_CODE_TEXT[r.code] || `Không ghép được (${r.code}).` };
    }
    await writeState({ relay: { ...defaultRelayState(), url: relayUrl, claimed: true, publicJwk, privateJwk } });
    await maybeRegister(true);
    await maybeSendLink();
    return state();
  }

  async function unpairRelay() {
    await writeState({ relay: defaultRelayState() });
    return state();
  }

  /** Đường hầm đổi / khoá đổi / mới ghép → đăng ký đường hầm hiện tại với địa chỉ cố định. */
  async function maybeRegister(force = false) {
    if (registering) return registering;
    registering = (async () => {
      const s = await readState();
      const r = s.relay || {};
      if (!s.enabled || !r.claimed || !r.privateJwk || !r.url) return;
      const tunnelUrl = String(s.tunnel?.url || '');
      if (s.tunnel?.state !== 'up' || !TUNNEL_URL_RE.test(tunnelUrl) || tunnelUrl === 'https://api.trycloudflare.com') return;
      if (!/^[A-Za-z0-9_-]{24,128}$/.test(String(s.key))) return;
      const fp = await keyFingerprint(s.key);
      const same = r.registeredUrl === tunnelUrl && r.registeredKeyFp === fp;
      if (same && !force) return;
      if (!force && r.retryAt && now() < Date.parse(r.retryAt)) return;
      const ts = now();
      const keySig = await pointerKeySig(s.key, tunnelUrl, ts);
      const sig = await signWithJwk(r.privateJwk, registerMessage(tunnelUrl, ts, keySig));
      const res = await postRelay(`${r.url}/_gscb/register`, { url: tunnelUrl, ts, keySig, sig });
      await writeState((cur) => {
        const rel = { ...defaultRelayState(), ...cur.relay };
        if (res.ok) return { relay: { ...rel, registeredUrl: tunnelUrl, registeredKeyFp: fp, registeredAt: iso(now()), error: '', failures: 0, retryAt: null } };
        const failures = (rel.failures || 0) + 1;
        return { relay: { ...rel, error: res.code, failures, retryAt: iso(now() + relayBackoffMs(failures)) } };
      });
    })().catch(() => {}).finally(() => { registering = null; });
    return registering;
  }

  async function state() {
    const s = await readState();
    const relayUrl = relayUrlOf(s);
    const link = s.enabled ? phoneLinkUrl(s.tunnel, s.key, relayUrl) : '';
    const directLink = s.enabled && relayUrl ? phoneLinkUrl(s.tunnel, s.key) : '';
    const { key, telegramSentLink, telegramTried, relay: rel = {}, ...rest } = s;
    const fp = key && rel.claimed ? await keyFingerprint(key) : '';
    const relay = {
      url: rel.url || '', claimed: rel.claimed === true, registeredAt: rel.registeredAt || null, error: rel.error || '',
      errorText: rel.error ? (RELAY_CODE_TEXT[rel.error] || rel.error) : '', retryAt: rel.retryAt || null,
      current: Boolean(rel.claimed) && rel.registeredUrl === String(s.tunnel?.url || '') && rel.registeredKeyFp === fp && s.tunnel?.state === 'up'
    };
    return { ok: true, ...rest, relay, hasKey: Boolean(key), link, directLink, busy: Boolean(job), telegramSentCurrent: Boolean(link) && telegramSentLink === link };
  }

  return { ensure, setEnabled, setTelegram, rotateKey, pairRelay, unpairRelay, state, disconnect, isConnected: () => Boolean(port), sendPending: () => sending, registerPending: () => registering };
}
