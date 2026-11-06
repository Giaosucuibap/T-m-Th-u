/* ============================================================================
 *  TÌM NHANH (Ctrl K) — phần lõi, không đụng trình duyệt, kiểm thử được.
 *
 *  Ba nguồn, theo thứ tự ưu tiên:
 *    1. MÃ: gõ đúng mã TBMT (IB…), mã KHLCNT (PL…) hay mã gói (BP…) → khớp
 *       CHÍNH XÁC trong kho trên máy; đồng thời luôn có lệnh tra mã đó trên
 *       e-GP, vì kho trên máy có thể chưa có hoặc đã cũ.
 *    2. GÓI TRONG KHO: mọi từ gõ vào (không phân biệt dấu) phải có trong tên
 *       gói, chủ đầu tư, địa điểm hoặc mã. Không đoán, không "gần đúng".
 *    3. TRANG CHỨC NĂNG: theo tên trang.
 *  Gói còn hạn nộp xếp trước, rồi tới hạn gần nhất — thứ cần xử lý trước.
 * ========================================================================== */
import { foldText } from './core.js';

export const QUICK_FIND_LIMIT = 8;
const CODE = /^(IB|PL|BP)(\d{8,12})(?:-(\d{1,2}))?$/i;

/** Nhận diện chuỗi gõ vào: mã thông báo, mã kế hoạch, mã gói hay chữ thường. */
export function classifyQuery(raw) {
  const q = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const compact = q.replace(/\s+/g, '').toUpperCase();
  const m = compact.match(CODE);
  if (m) {
    const kind = { IB: 'tbmt', PL: 'plan', BP: 'bid' }[m[1].toUpperCase()];
    return { q, kind, code: `${m[1].toUpperCase()}${m[2]}`, version: m[3] ?? null };
  }
  return { q, kind: q ? 'text' : 'empty', code: '', version: null };
}

const tokensOf = (q) => foldText(q).split(/[^a-z0-9]+/).filter((t) => t.length > 0);

function haystack(t) {
  return foldText([t.bidName, t.investorName, t.procuringEntityName, t.location, t.notifyNo, t.displayCode, t.bidNo, t.planNo].filter(Boolean).join(' '));
}

function isOpen(t, now) {
  const ms = Date.parse(t.closeDate || '');
  return Number.isFinite(ms) && ms > now;
}

/**
 * Tìm gói trong kho trên máy.
 * @returns {{query:object, exact:object[], hits:object[], total:number}}
 *   exact: gói khớp đúng mã; hits: gói khớp chữ (đã loại các gói trong exact).
 */
export function quickFindPackages(tenders, raw, { limit = QUICK_FIND_LIMIT, now = Date.now() } = {}) {
  const query = classifyQuery(raw);
  const list = Array.isArray(tenders) ? tenders.filter((t) => t && typeof t === 'object') : [];
  if (query.kind === 'empty') return { query, exact: [], hits: [], total: 0 };
  const rank = (a, b) => (isOpen(b, now) - isOpen(a, now))
    || ((Date.parse(a.closeDate || '') || Infinity) - (Date.parse(b.closeDate || '') || Infinity))
    || String(a.bidName || '').localeCompare(String(b.bidName || ''), 'vi');
  let exact = [];
  if (query.code) {
    const field = { tbmt: ['notifyNo'], plan: ['planNo'], bid: ['bidNo'] }[query.kind];
    exact = list.filter((t) => field.some((f) => String(t[f] || '').toUpperCase() === query.code)
      && (query.version === null || String(t.version ?? '').padStart(2, '0') === query.version.padStart(2, '0')));
    exact.sort(rank);
  }
  const tokens = tokensOf(query.q);
  const exactKeys = new Set(exact.map((t) => t.key));
  const matches = tokens.length ? list.filter((t) => !exactKeys.has(t.key) && tokens.every((tok) => haystack(t).includes(tok))) : [];
  matches.sort(rank);
  return { query, exact: exact.slice(0, limit), hits: matches.slice(0, Math.max(0, limit - Math.min(exact.length, limit))), total: exact.length + matches.length };
}

/** Trang chức năng khớp chữ gõ vào (không dấu, mọi từ phải có). */
export function quickFindPages(navItems, raw, { limit = 6 } = {}) {
  const tokens = tokensOf(raw);
  const items = Array.isArray(navItems) ? navItems : [];
  if (!tokens.length) return items.slice(0, limit);
  return items.filter((item) => { const hay = foldText(`${item[2]} ${item[3] || ''}`); return tokens.every((tok) => hay.includes(tok)); }).slice(0, limit);
}

/** Lệnh tra mã trên e-GP cho một mã đã nhận diện (null nếu không phải mã). */
export function egpLookupAction(query) {
  // Mã gói (BP…) chỉ tra được trong kho: e-GP không tìm thông báo theo mã gói.
  if (!query?.code || query.kind === 'bid') return null;
  if (query.kind === 'plan') return { href: `plans.html?planNo=${encodeURIComponent(query.code)}`, label: `Tra kế hoạch ${query.code} trên e-GP`, glyph: 'plan' };
  return { href: `search.html?q=${encodeURIComponent(query.code)}&run=1`, label: `Tra ${query.kind === 'tbmt' ? 'thông báo' : 'gói'} ${query.code} trên e-GP`, glyph: 'search' };
}
