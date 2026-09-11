/** Escape and safe DOM helpers for extension pages. Never assign raw e-GP text to innerHTML. */

const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => MAP[ch]);
}

export function setText(el, value) {
  if (!el) return;
  el.textContent = value == null ? '' : String(value);
}

/** Trusted markup only. Interpolated values must already be escaped. */
export function setTrustedHtml(el, html) {
  if (!el) return;
  el.innerHTML = html == null ? '' : String(html);
}

export function noticeHtml(message) {
  return escapeHtml(message);
}
