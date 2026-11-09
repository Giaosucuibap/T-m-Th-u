/* ============================================================================
 *  4.20.0 — LINK ĐIỆN THOẠI: phần THUẦN (không chạm Chrome), kiểm thử được.
 *
 *  Máy tính công ty làm máy tra: iPhone mở link (Safari) → máy phục vụ
 *  GiaoSuCuiBap.DienThoai.exe → tiện ích chạy đúng luồng "Tìm gói thầu" →
 *  kết quả quay về điện thoại. Tệp này dựng KẾT QUẢ GỬI ĐIỆN THOẠI từ lượt tra
 *  của tiện ích, lọc tiêu chí điện thoại gửi lên, sinh khoá và link.
 *  Giao thức: native-agent/DIEN-THOAI-GIAO-THUC.md
 * ========================================================================== */
import { hardFilterReason } from './hard-filter.js';
import { bidStatus, BID_STATUS_LABEL, parseDate } from './core.js';
import { isEgpUrl } from './egp-host.js';
import { defaultRelayState } from './phone-relay.js';

export const PHONE_HOST = 'vn.giaosucuibap.dienthoai';
export const PHONE_STORE_KEY = 'phoneLink';
export const PHONE_ALARM = 'gscb-phone-link';
export const PHONE_MAX_TENDERS = 1000;
export const PHONE_CRITERIA_FIELDS = Object.freeze(['province', 'category', 'keyword', 'investor', 'minPrice', 'maxPrice', 'mustKeywords', 'excludeKeywords', 'ward']);

/** Lời giải thích tiếng Việt cho các mã trạng thái máy phục vụ / đường hầm. */
export const PHONE_CODE_TEXT = Object.freeze({
  CLOUDFLARED_MISSING: 'Chưa có cloudflared.exe cạnh cầu nối điện thoại. Chạy lại native-agent\\BAT-LINK-DIEN-THOAI.bat.',
  TUNNEL_RESTARTING: 'Đường hầm vừa rớt, đang tự mở lại (link sẽ đổi).',
  NO_TUNNEL: 'Chế độ thử: không mở đường hầm ra Internet.',
  BAD_KEY: 'Khoá không hợp lệ.',
  HOST_MISSING: 'Chưa cài cầu nối điện thoại trên máy này. Chạy native-agent\\BAT-LINK-DIEN-THOAI.bat (bấm đúp, một lần).'
});

const ACTIVE = new Set(['STARTING', 'OPENING', 'RUNNING', 'LISTING', 'SCANNING']);
export const isActiveRunStatus = (status) => ACTIVE.has(String(status || ''));

const toBase64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Khoá 32 ký tự (192 bit ngẫu nhiên), chỉ gồm A–Z a–z 0–9 - _ như máy phục vụ đòi. */
export function newPhoneKey(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  return toBase64Url(random(24));
}

export function defaultPhoneState() {
  return {
    enabled: false, key: '', tunnel: { state: 'off', url: '', code: '' }, host: { connected: false, version: '', error: '' }, lastJobAt: null, lastJobStatus: '',
    // Gửi link mới qua Telegram (mặc định TẮT): link chứa khoá nên chỉ gửi vào chat riêng.
    telegram: false, telegramSentLink: '', telegramTried: '', telegramLast: null,
    // 4.21.0 — địa chỉ cố định (Cloudflare Worker của chủ phần mềm), xem lib/phone-relay.js.
    relay: defaultRelayState()
  };
}

const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Chat ID riêng (người dùng ↔ bot) là số dương. Nhóm/kênh là số âm hoặc @tên — KHÔNG gửi link có khoá vào đó. */
export function isPrivateTelegramChat(chatId) {
  return /^\d{1,20}$/.test(String(chatId ?? '').trim());
}

/** Tin nhắn Telegram (HTML) báo link điện thoại mới. */
export function phoneLinkMessage(link, now = Date.now()) {
  const when = new Date(now).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  return `📱 <b>Link điện thoại mới</b> — ${escapeHtml(when)}\n`
    + 'Máy tính công ty vừa mở lại đường hầm; link cũ không dùng được nữa.\n\n'
    + `👉 <a href="${escapeHtml(link)}">Bấm vào đây để mở trên iPhone</a>\n\n`
    + '<i>Ai có link này đều tra được bằng máy tính công ty — đừng chuyển tiếp cho người ngoài.</i>';
}

/** Link mở trên điện thoại: khoá nằm sau dấu # nên KHÔNG bao giờ gửi lên máy chủ đường hầm.
 *  Đã ghép địa chỉ cố định (relayUrl) thì link LUÔN là địa chỉ cố định — không đổi khi
 *  đường hầm đổi; điện thoại tự tìm đường hầm hiện tại qua con trỏ đã ký. */
export function phoneLinkUrl(tunnel = {}, key = '', relayUrl = '') {
  const url = String(tunnel?.url || '');
  if (!/^[A-Za-z0-9_-]{24,128}$/.test(String(key))) return '';
  if (/^https:\/\/[a-z0-9.-]+(?::\d{2,5})?$/.test(String(relayUrl))) return `${relayUrl}/#k=${key}`;
  const real = tunnel.state === 'up' && /^https:\/\/[a-z0-9][a-z0-9-]*\.trycloudflare\.com$/.test(url) && url !== 'https://api.trycloudflare.com';
  const local = tunnel.state === 'off' && /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(url);
  return real || local ? `${url}/#k=${key}` : '';
}

/** Chỉ giữ tiêu chí đã biết, dạng chuỗi, tối đa 500 ký tự — điện thoại là nguồn không tin cậy. */
export function cleanPhoneCriteria(raw = {}) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const key of PHONE_CRITERIA_FIELDS) {
    const value = raw[key];
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    out[key] = String(value).trim().slice(0, 500);
  }
  return out;
}

/** Tiến độ gọn cho điện thoại (không có tên gói, không có dữ liệu thô). */
export function phoneProgress(run = {}) {
  const c = run.coverage || {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  return {
    status: String(run.status || ''),
    message: String(run.message || '').slice(0, 300),
    fetched: num(run.sourceCount) ?? num(c.fetched) ?? num(run.captured) ?? 0,
    pagesRead: num(c.pagesRead),
    totalPages: num(c.totalPages),
    serverTotal: num(c.serverTotal)
  };
}

const text = (v, max) => (v == null ? '' : String(v).slice(0, max));
const money = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** "Tỉnh Lâm Đồng; Tỉnh Lâm Đồng" → "Tỉnh Lâm Đồng" (e-GP lặp địa điểm khi gói có nhiều hạng mục cùng tỉnh). */
export function dedupeLocation(value, max = 300) {
  const seen = new Set();
  return String(value ?? '').split(/\s*;\s*/).map((s) => s.trim()).filter((s) => {
    const k = s.toLocaleLowerCase('vi');
    if (!s || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).join('; ').slice(0, max);
}

/** Giá trong tiêu chí: 0, trống, "0" (bản lưu đổi số thành chữ) hay mức trần 1e15 nghĩa là KHÔNG đặt. */
export function criteriaPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n < 1e15 ? n : null;
}

/** Một gói thầu theo đúng hình dạng giao diện điện thoại dùng (như app di động). */
export function phoneTender(t = {}, rs = {}, now = Date.now()) {
  const state = ['MATCH', 'INSUFFICIENT', 'OUT_OF_RANGE'].includes(rs.filterState) ? rs.filterState
    : ['MATCH', 'INSUFFICIENT', 'OUT_OF_RANGE'].includes(t.filterState) ? t.filterState : 'INSUFFICIENT';
  const reason = text(rs.filterReason ?? t.filterReason ?? '', 220);
  const status = bidStatus(t, now);
  const reasons = (Array.isArray(t.filterReasons) ? t.filterReasons : [])
    .filter((r) => r && r.state !== 'MATCH').slice(0, 10)
    .map((r) => ({ field: text(r.field, 40), reason: text(r.reason, 80), state: text(r.state, 20), label: hardFilterReason(r) }));
  return {
    key: text(t.key, 220),
    notifyNo: text(t.notifyNo, 40), bidNo: text(t.bidNo, 40), planNo: text(t.planNo, 40),
    displayCode: text(t.displayCode || t.notifyNo || t.bidNo, 60), codeLabel: text(t.codeLabel, 60),
    bidName: text(t.bidName || rs.bidName, 600), projectName: text(t.projectName, 600),
    investorName: text(t.investorName || rs.investorName, 300), procuringEntityName: text(t.procuringEntityName, 300),
    location: dedupeLocation(t.location || rs.location, 300), fieldCode: text(t.fieldCode, 20),
    price: money(t.price ?? rs.price), publicDate: parseDate(t.publicDate || rs.publicDate) || null,
    closeDate: parseDate(t.closeDate || rs.closeDate) || null,
    contractType: text(t.contractType, 120), bidForm: text(t.bidForm, 10),
    isInternet: t.isInternet === true ? true : t.isInternet === false ? false : null,
    detailUrl: isEgpUrl(t.detailUrl) ? text(t.detailUrl, 2400) : '',
    score: Math.max(0, Math.min(100, Math.round(Number(rs.score ?? t.score) || 0))),
    recommendation: text(t.recommendation, 60),
    reasons: (Array.isArray(t.reasons) ? t.reasons : []).slice(0, 8).map((r) => text(r, 200)),
    bidState: status, bidStateLabel: BID_STATUS_LABEL[status] || '',
    matched: state === 'MATCH' && (rs.matched === true || t.matched === true),
    filterState: state, filterReason: reason, filterReasonLabel: hardFilterReason({ state, reason }),
    filterReasons: reasons
  };
}

const GATE_ORDER = { MATCH: 0, INSUFFICIENT: 1, OUT_OF_RANGE: 2 };
const STATUS_ORDER = { OPEN: 0, UNKNOWN: 1, PLAN: 2, CLOSED: 3 };

/** Khớp tiêu chí trước, rồi gói còn nhận hồ sơ, rồi điểm cao, rồi hạn nộp gần — như app di động. */
export function sortPhoneTenders(list = []) {
  const close = (t) => { const ms = Date.parse(t.closeDate || ''); return Number.isFinite(ms) ? ms : Infinity; };
  return [...list].sort((a, b) => (GATE_ORDER[a.filterState] ?? 9) - (GATE_ORDER[b.filterState] ?? 9)
    || (STATUS_ORDER[a.bidState] ?? 9) - (STATUS_ORDER[b.bidState] ?? 9)
    || (b.score || 0) - (a.score || 0)
    || close(a) - close(b));
}

/** Kết quả gửi điện thoại từ lượt tra (đã làm sạch bằng safeRunForBackup) và các gói của lượt. */
export function buildPhoneResult(run = {}, tenders = [], now = Date.now()) {
  const states = run.resultStates && typeof run.resultStates === 'object' ? run.resultStates : {};
  const all = sortPhoneTenders((tenders || []).filter((t) => t && t.key).map((t) => phoneTender(t, states[t.key] || {}, now)));
  const count = (state) => all.filter((t) => t.filterState === state).length;
  const raw = String(run.status || '');
  const status = raw === 'TIMEOUT' ? (all.length ? 'PARTIAL' : 'ERROR')
    : ['SUCCESS', 'PARTIAL', 'ERROR', 'CANCELLED'].includes(raw) ? raw : (all.length ? 'PARTIAL' : 'ERROR');
  const c = run.coverage || {};
  const notes = [];
  if (all.length > PHONE_MAX_TENDERS) notes.push(`Điện thoại hiện ${PHONE_MAX_TENDERS} gói đầu (sau khi xếp hạng) trong ${all.length} gói — thu hẹp tiêu chí để xem hết.`);
  if (run.partialMessage && status !== 'SUCCESS') notes.push(text(run.partialMessage, 400));
  // Lượt tra đọc lại từ kho đã qua safeRunForBackup: mọi tiêu chí thành CHUỖI ("0" cho giá
  // trống) — điện thoại từng hiện "0 đ – 0 đ". Giá chỉ giữ khi thật sự đặt; chữ bỏ khoảng trắng.
  const criteria = {};
  for (const key of PHONE_CRITERIA_FIELDS) {
    const v = run.criteria ? run.criteria[key] : null;
    if (v == null) continue;
    if (key === 'minPrice' || key === 'maxPrice') { const n = criteriaPrice(v); if (n) criteria[key] = n; continue; }
    const t = String(v).trim();
    if (t) criteria[key] = t.slice(0, 500);
  }
  return {
    id: text(run.id, 80), source: 'pc',
    ok: status === 'SUCCESS' || status === 'PARTIAL', status,
    message: text(run.message, 400), notes,
    criteria, startedAt: run.startedAt || null, finishedAt: run.finishedAt || new Date(now).toISOString(),
    coverage: {
      text: text(c.text, 1200), complete: c.complete === true,
      serverTotal: c.serverTotal ?? null, fetched: c.fetched ?? null, pagesRead: c.pagesRead ?? null, totalPages: c.totalPages ?? null
    },
    counts: {
      fetched: Number(run.sourceCount ?? c.fetched ?? all.length) || 0, unique: all.length,
      match: count('MATCH'), insufficient: count('INSUFFICIENT'), outOfRange: count('OUT_OF_RANGE')
    },
    tenders: all.slice(0, PHONE_MAX_TENDERS), truncated: all.length > PHONE_MAX_TENDERS
  };
}
