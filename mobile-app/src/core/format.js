/* Định dạng hiển thị cho người Việt — tự tính, không phụ thuộc Intl của máy
 * (Hermes trên một số máy Android không có đủ dữ liệu vi-VN). Giờ luôn là giờ
 * Việt Nam (UTC+7), dù điện thoại đang để múi giờ khác. */
import { parseDate } from './egp/core.js';

const VN_OFFSET_MS = 7 * 3600 * 1000;
const pad = (n) => String(n).padStart(2, '0');

function groupThousands(intString) {
  return intString.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 12500000000 → "12,5 tỷ"; 850000000 → "850 triệu"; null → "Chưa rõ giá". */
export function formatVndShort(value) {
  if (value === null || value === undefined || value === '') return 'Chưa rõ giá';
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 'Chưa rõ giá';
  if (n >= 1e9) return `${trimDecimal(n / 1e9, n >= 1e11 ? 0 : 2)} tỷ`;
  if (n >= 1e6) return `${trimDecimal(n / 1e6, n >= 1e8 ? 0 : 1)} triệu`;
  return `${groupThousands(String(Math.round(n)))} đ`;
}

/** Số tiền đầy đủ: 12.500.000.000 đ */
export function formatVndFull(value) {
  if (value === null || value === undefined || value === '') return 'Chưa rõ giá';
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? `${groupThousands(String(Math.round(n)))} đ` : 'Chưa rõ giá';
}

function trimDecimal(x, digits) {
  const fixed = x.toFixed(digits);
  const [int, dec = ''] = fixed.split('.');
  const d = dec.replace(/0+$/, '');
  return d ? `${groupThousands(int)},${d}` : groupThousands(int);
}

/** Mốc thời gian e-GP → phần tử ngày giờ Việt Nam; null nếu không đọc được. */
export function vnParts(value) {
  const iso = parseDate(value);
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + VN_OFFSET_MS);
  return { ms, day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

export function formatDateVn(value) {
  const p = vnParts(value);
  return p ? `${pad(p.day)}/${pad(p.month)}/${p.year}` : 'Chưa rõ';
}

export function formatDateTimeVn(value) {
  const p = vnParts(value);
  return p ? `${pad(p.hour)}:${pad(p.minute)} ${pad(p.day)}/${pad(p.month)}/${p.year}` : 'Chưa rõ';
}

/** Còn bao lâu tới đóng thầu, nói theo cách người dùng đọc nhanh. */
export function timeLeft(closeDate, now = Date.now()) {
  const p = vnParts(closeDate);
  if (!p) return { state: 'unknown', text: 'Chưa rõ hạn nộp', urgent: false };
  const ms = p.ms - now;
  if (ms <= 0) return { state: 'closed', text: 'Đã đóng thầu', urgent: false };
  const hours = ms / 3600000;
  if (hours < 1) return { state: 'open', text: `Còn ${Math.max(1, Math.floor(ms / 60000))} phút`, urgent: true };
  if (hours < 48) return { state: 'open', text: `Còn ${Math.floor(hours)} giờ`, urgent: true };
  const days = Math.floor(hours / 24);
  return { state: 'open', text: `Còn ${days} ngày`, urgent: days <= 3 };
}

/** "vừa xong", "5 phút trước", "3 giờ trước", "2 ngày trước". */
export function ago(iso, now = Date.now()) {
  const ms = Date.parse(iso || '');
  if (!Number.isFinite(ms)) return '';
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}

/** Chuỗi tiêu chí ngắn gọn để hiện trên thẻ lịch sử. */
export function criteriaSummary(c = {}) {
  const parts = [];
  if (c.province) parts.push(c.province);
  if (c.category) parts.push({ XL: 'Xây lắp', TV: 'Tư vấn', HH: 'Hàng hóa', PTV: 'Phi tư vấn', HON_HOP: 'Hỗn hợp' }[c.category] || c.category);
  if (c.investor) parts.push(`CĐT: ${c.investor}`);
  if (c.keyword) parts.push(`"${c.keyword}"`);
  if (c.minPrice || c.maxPrice) parts.push(`${c.minPrice ? formatVndShort(c.minPrice) : '0'} – ${c.maxPrice ? formatVndShort(c.maxPrice) : '∞'}`);
  return parts.join(' · ') || 'Mọi gói thầu';
}
