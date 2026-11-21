/* ============================================================================
 *  NHẮC HẠN NỘP HỒ SƠ — thông báo cục bộ, hẹn sẵn trên điện thoại
 *
 *  Cùng ba mốc với tiện ích (lib/lifecycle.js · DEADLINE_WINDOWS): còn 3 ngày,
 *  còn 24 giờ, còn 3 giờ trước thời điểm đóng thầu. Lời nhắc được HẸN TRƯỚC với
 *  hệ điều hành nên vẫn kêu khi app đang đóng — không cần app chạy nền.
 *  Giới hạn thật: iOS chỉ giữ tối đa 64 lời nhắc hẹn trước cho một app.
 * ========================================================================== */
import { DEADLINE_WINDOWS } from './egp/lifecycle.js';
import { vnParts, formatDateTimeVn } from './format.js';

export const IOS_PENDING_LIMIT = 64;

/** Các lời nhắc cần hẹn cho một gói (mốc đã qua thì bỏ). Thuần, không đụng hệ điều hành. */
export function planReminders(tender, now = Date.now()) {
  const close = vnParts(tender?.closeDate);
  if (!close || close.ms <= now) return [];
  const name = String(tender.bidName || tender.displayCode || 'Gói thầu').slice(0, 140);
  return DEADLINE_WINDOWS
    .map((w) => ({ key: w.key, at: close.ms - w.hours * 3600 * 1000, label: w.label }))
    .filter((r) => r.at > now + 30_000)
    .map((r) => ({
      key: r.key,
      at: r.at,
      title: `Hạn nộp · ${r.label}`,
      body: `${name}\n${tender.displayCode || ''} · đóng thầu ${formatDateTimeVn(tender.closeDate)}`.trim(),
      data: { tenderKey: tender.key, window: r.key }
    }));
}

/**
 * @param {object} api  bộ hàm thông báo (expo-notifications thật, hoặc giả khi kiểm thử)
 *   api.schedule({title, body, data, at}) → id ;  api.cancel(id) ;  api.pendingCount() → số
 */
export function createReminders(api) {
  return {
    /** Hẹn lời nhắc cho một gói; trả về danh sách id đã hẹn (rỗng nếu không còn mốc nào). */
    async scheduleFor(tender, { now = Date.now() } = {}) {
      const plan = planReminders(tender, now);
      if (!plan.length) return { ids: [], skipped: 'no-future-window' };
      const pending = typeof api.pendingCount === 'function' ? await api.pendingCount() : 0;
      const room = Math.max(0, IOS_PENDING_LIMIT - pending);
      // Hết chỗ thì giữ các mốc SÁT HẠN nhất (24 giờ, 3 giờ) — chúng quan trọng hơn mốc 3 ngày.
      const chosen = room >= plan.length ? plan : plan.slice(plan.length - room);
      const ids = [];
      for (const item of chosen) ids.push(await api.schedule(item));
      return { ids, skipped: ids.length < plan.length ? 'ios-limit' : null };
    },
    async cancel(ids = []) {
      for (const id of ids) { try { await api.cancel(id); } catch { /* lời nhắc đã kêu hoặc đã bị xoá */ } }
    }
  };
}
