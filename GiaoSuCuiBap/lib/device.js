/* ============================================================================
 *  MÁY ĐANG DÙNG (4.22.0) — ngón tay hay chuột, Chrome hay bản chạy trên Safari
 *
 *  Giao diện vốn làm cho chuột và bàn phím. Đo ngày 11/11/2026 ở cỡ iPad: nút và mục
 *  danh mục phổ biến cao 33 px (Apple khuyên 44), một thẻ gói cao 521 px, giờ đóng thầu
 *  chính xác chỉ nằm trong chú thích rê chuột. Mô-đun này cho các trang biết máy đang
 *  dùng ngón tay để chỉnh ba chuyện đó; trên máy tính không có gì thay đổi.
 *
 *  - TOUCH:    con trỏ chính là ngón tay (iPad, iPhone, máy tính bảng). Bản Safari truyền
 *              sẵn cờ __GSCB_TOUCH__ vì iPad tự xưng là máy Mac; còn lại hỏi trình duyệt.
 *  - PLATFORM: 'safari' khi chạy trong bản Safari (không có cầu nối Windows, không chạy
 *              nền), ngược lại 'chrome'.
 *  Hai thuộc tính data-touch / data-platform trên <html> là chỗ CSS bám vào (theme.css).
 * ========================================================================== */
const g = typeof globalThis === 'object' && globalThis ? globalThis : {};

function detectTouch() {
  if (typeof g.__GSCB_TOUCH__ === 'boolean') return g.__GSCB_TOUCH__;
  try { return typeof g.matchMedia === 'function' && g.matchMedia('(pointer: coarse)').matches; } catch { return false; }
}

export const TOUCH = detectTouch();
export const PLATFORM = g.__GSCB_PLATFORM__ === 'safari' ? 'safari' : 'chrome';

/** Số dòng mỗi trang của một danh sách: ít hơn khi cuộn bằng ngón tay. */
export function pageSize(desktop, touch, isTouch = TOUCH) {
  return isTouch ? touch : desktop;
}

/** Gắn hai thuộc tính lên <html> (gọi một lần ở shell.js; gọi lại không sao). */
export function markDocument(doc = g.document, isTouch = TOUCH, platform = PLATFORM) {
  const root = doc && doc.documentElement;
  if (!root) return;
  if (isTouch) root.setAttribute('data-touch', '1');
  root.setAttribute('data-platform', platform);
}

/**
 * Trên máy cảm ứng một thẻ chỉ hiện tối đa `limit` nhãn; nhãn cảnh báo được ưu tiên, rồi
 * mới theo thứ tự gốc. Trả về chỉ số các nhãn được hiện và số nhãn còn lại.
 * `chips`: mảng {warn: boolean}.
 */
export function pickTopChips(chips, limit = 3) {
  const order = chips.map((chip, index) => ({ index, warn: Boolean(chip && chip.warn) }))
    .sort((a, b) => Number(b.warn) - Number(a.warn) || a.index - b.index)
    .slice(0, Math.max(0, limit));
  return { top: new Set(order.map((entry) => entry.index)), rest: Math.max(0, chips.length - order.length) };
}

/** Đánh dấu `top` cho các nhãn được hiện trong một chuỗi HTML gồm các <span class="reason-chip …">. */
export function capChipHtml(html, limit = 3) {
  const parts = String(html || '').split(/(?=<span class="reason-chip)/).filter(Boolean);
  if (parts.length <= limit) return parts.map((part) => part.replace('class="reason-chip', 'class="reason-chip top')).join('');
  const { top, rest } = pickTopChips(parts.map((part) => ({ warn: /^<span class="reason-chip[^"]*\bwarn\b/.test(part) })), limit);
  return parts.map((part, index) => (top.has(index) ? part.replace('class="reason-chip', 'class="reason-chip top') : part)).join('')
    + `<span class="reason-chip reason-more top" aria-hidden="true">+${rest}</span>`;
}
