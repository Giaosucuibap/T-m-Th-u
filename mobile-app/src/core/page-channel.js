/* ============================================================================
 *  KÊNH NHẮN TIN APP ↔ TRANG e-GP (thuần JS, kiểm thử được bằng node)
 *
 *  Trang → app: lớp đệm trong trang gửi chuỗi JSON qua ReactNativeWebView.postMessage
 *    {kind:'send', id, message}        content.js gọi chrome.runtime.sendMessage
 *    {kind:'commandReply', id, response} trả lời một lệnh app đã giao
 *    {kind:'injectError', where, message} một phần mã tiêm bị lỗi
 *  App → trang: chạy câu lệnh do deliverScript() dựng trong WebView.
 *
 *  Mọi thứ từ trang là DỮ LIỆU KHÔNG TIN CẬY: chỉ nhận đúng ba loại trên, bỏ qua
 *  mọi thứ khác, không bao giờ eval nội dung nhận được.
 * ========================================================================== */
import { deliverScript } from '../egp/inject.js';

const MAX_MESSAGE_CHARS = 8_000_000; // một trang 50 gói thầu ~ 200–400 KB

export function createPageChannel({ inject, onInjectError, onTrace } = {}) {
  if (typeof inject !== 'function') throw new Error('Thiếu hàm inject để gửi lệnh vào trang e-GP.');
  let seq = 0;
  let handler = null;
  const pending = new Map();
  const nonce = Math.random().toString(36).slice(2, 8);
  const trace = (event) => { try { onTrace?.(event); } catch { /* chỉ để chẩn đoán */ } };

  function post(obj) {
    inject(deliverScript(obj));
  }

  function receive(raw) {
    if (typeof raw === 'string' && raw.length > MAX_MESSAGE_CHARS) { trace({ kind: 'dropped', reason: 'too-large' }); return false; }
    let msg;
    try { msg = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { trace({ kind: 'dropped', reason: 'not-json' }); return false; }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return false;

    if (msg.kind === 'send' && (typeof msg.id === 'string' || typeof msg.id === 'number')) {
      const id = msg.id;
      const message = msg.message && typeof msg.message === 'object' ? msg.message : {};
      trace({ kind: 'page', type: String(message.type || '') });
      Promise.resolve()
        .then(() => (handler ? handler(message) : { ok: false, message: 'App chưa sẵn sàng nhận dữ liệu.' }))
        .catch((error) => ({ ok: false, message: String(error?.message || error) }))
        .then((response) => post({ kind: 'reply', id, response: response === undefined ? null : response }));
      return true;
    }
    if (msg.kind === 'commandReply') {
      const entry = pending.get(msg.id);
      if (!entry) return false;
      pending.delete(msg.id);
      clearTimeout(entry.timer);
      entry.resolve(msg.response ?? null);
      return true;
    }
    if (msg.kind === 'injectError') {
      trace({ kind: 'injectError', where: String(msg.where || ''), message: String(msg.message || '').slice(0, 300) });
      try { onInjectError?.({ where: String(msg.where || ''), message: String(msg.message || '').slice(0, 300) }); } catch { /* bỏ qua */ }
      return true;
    }
    return false;
  }

  /** Giao một lệnh (KQLCNT_PROBE, KQLCNT_START, KQLCNT_CANCEL) và chờ trang trả lời. */
  function command(message, timeoutMs = 15_000) {
    const id = `${nonce}.${++seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Trang e-GP chưa phản hồi lệnh của app.'));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try { post({ kind: 'command', id, message }); } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  }

  /** Trang vừa tải lại: lệnh đang chờ ở trang cũ sẽ không bao giờ được trả lời. */
  function abandon(reason = 'Trang e-GP vừa tải lại.') {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
      pending.delete(id);
    }
  }

  return {
    receive,
    command,
    abandon,
    setHandler(fn) { handler = typeof fn === 'function' ? fn : null; },
    get pendingCount() { return pending.size; }
  };
}
