// Shared, pure search/workspace rules. No network, storage, or DOM dependencies.
import { parseMoney, parseDate, bidStatus, formatDate } from './core.js';
import { normalizeCategory } from './tender-categories.js';

export const CRITERIA_FIELDS = ['investor', 'province', 'ward', 'keyword', 'mustKeywords', 'excludeKeywords', 'minPrice', 'maxPrice', 'category'];
const TEXT_FIELDS = ['investor', 'province', 'ward', 'keyword', 'mustKeywords', 'excludeKeywords'];
const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();

export function splitProvinceNames(value) {
  return String(value ?? '')
    .split(/\s*[;|\n]+\s*|,(?=\s*[^0-9])/g)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
    .slice(0, 12);
}

export function validateCriteria(raw = {}) {
  const criteria = {};
  for (const key of TEXT_FIELDS) criteria[key] = String(raw[key] ?? '').trim().slice(0, 500);
  criteria.category = normalizeCategory(raw.category);
  if (String(raw.category ?? '').trim() && !criteria.category) {
    return { ok: false, field: 'category', message: 'Loại gói thầu không hợp lệ. Hãy chọn lại trong danh sách.' };
  }
  for (const key of ['minPrice', 'maxPrice']) {
    const value = String(raw[key] ?? '').trim();
    const amount = value === '' ? 0 : parseMoney(value);
    if (amount === null || !Number.isSafeInteger(amount) || amount < 0 ||
        (value && !/^-?[\d\s.,]+(?:\s*(?:đ|đồng|vnd|tỷ|ty|tỉ|triệu|trieu|nghìn|nghin|ngàn|ngan))?$/iu.test(value))) {
      return { ok: false, field: key, message: 'Nhập giá không âm bằng đồng, hoặc dạng 3,5 tỷ / 500 triệu.' };
    }
    criteria[key] = amount;
  }
  if (criteria.maxPrice && criteria.minPrice > criteria.maxPrice) {
    return { ok: false, field: 'maxPrice', message: 'Giá đến phải lớn hơn hoặc bằng giá từ.' };
  }
  if (!Object.values(criteria).some(Boolean)) return { ok: false, field: 'keyword', message: 'Nhập ít nhất một tiêu chí để tìm trên e-GP.' };
  return { ok: true, criteria };
}

// AND between terms, quoted phrases, and -exclusions. This is a LOCAL filter;
// syntax is never forwarded as an undocumented e-GP query.
export function matchesQuery(text, query) {
  const hay = fold(text);
  const tokens = String(query ?? '').match(/-?"[^"]+"|-?\S+/g) || [];
  return tokens.every(token => {
    const exclude = token.startsWith('-') && token.length > 1;
    const word = fold((exclude ? token.slice(1) : token).replace(/^"|"$/g, ''));
    return !word || (exclude ? !hay.includes(word) : hay.includes(word));
  });
}

export function runTenders(tenders, run) {
  const keys = new Set(Array.isArray(run?.foundKeys) ? run.foundKeys : []);
  return (tenders || []).filter(t => keys.has(t.key));
}

export function recordTitle(record = {}) {
  return [record.bidName, record.notifyName, record.packageName, record.bidPackageName, record.notifyNo]
    .filter(Boolean).join(' ');
}

export function matchesAdditionalKeyword(record, criteria = {}) {
  if (!criteria.investor || !criteria.keyword) return true;
  return matchesQuery(recordTitle(record), criteria.keyword);
}

export function matchesExcludeKeywords(text, exclude) {
  if (!String(exclude || '').trim()) return true;
  const hay = fold(text);
  const tokens = String(exclude).match(/-?"[^"]+"|-?\S+/g) || [];
  return tokens.every((token) => {
    const word = fold(token.replace(/^-+/, '').replace(/^"|"$/g, ''));
    return !word || !hay.includes(word);
  });
}

export function matchesLocalFilters(record, criteria = {}) {
  if (!matchesAdditionalKeyword(record, criteria)) return false;
  const title = recordTitle(record);
  if (criteria.mustKeywords && !matchesQuery(title, criteria.mustKeywords)) return false;
  if (criteria.excludeKeywords && !matchesExcludeKeywords(title, criteria.excludeKeywords)) return false;
  return true;
}

export function safeSavedSearches(raw) {
  const ids = new Set();
  return (Array.isArray(raw) ? raw : []).slice(0, 30).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const result = validateCriteria(item.criteria);
    const id = String(item.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    const name = String(item.name || '').trim().slice(0, 70);
    if (!result.ok || !id || !name || ids.has(id)) return [];
    ids.add(id);
    return [{ id, name, criteria: result.criteria }];
  });
}

export function deadlineInfo(t, now = Date.now()) {
  const iso = parseDate(t?.closeDate);
  const ms = iso ? Date.parse(iso) - now : NaN;
  if (!t?.notifyNo) return { label: 'Chờ thông báo mời thầu', level: 'neutral' };
  if (!Number.isFinite(ms)) return { label: 'Chưa rõ hạn nộp', level: 'warn' };
  if (ms <= 0) return { label: 'Đã đóng thầu', level: 'closed' };
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return { label: `Còn ${minutes} phút`, level: 'danger' };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: `Còn ${hours} giờ${minutes % 60 ? ` ${minutes % 60} phút` : ''}`, level: 'danger' };
  const days = Math.floor(hours / 24);
  return { label: `Còn ${days} ngày${hours % 24 ? ` ${hours % 24} giờ` : ''}`, level: days < 3 ? 'warn' : 'good' };
}

export function freshness(t, now = Date.now()) {
  const iso = parseDate(t?.lastSeenAt || t?.capturedAt);
  const age = iso ? now - Date.parse(iso) : NaN;
  if (!Number.isFinite(age) || age < -60000) return { stale: true, label: 'Chưa rõ thời điểm cập nhật' };
  return { stale: age > 86400000, label: `Ghi nhận ${formatDate(iso)}` };
}

export function safeSource(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'muasamcong.mpi.gov.vn' && !u.username && !u.password && !u.port ? u.href : '';
  } catch { return ''; }
}

const icsText = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/\r\n|\n|\r/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const utcStamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

// RFC 5545: fold at 75 OCTETS, without breaking a UTF-8 character.
export function foldCalendarLine(line) {
  let current = '', bytes = 0;
  const out = [];
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    if (bytes + size > 75) { out.push(current); current = ' '; bytes = 1; }
    current += ch; bytes += size;
  }
  return [...out, current].join('\r\n');
}

export function buildDeadlineCalendar(tenders, now = Date.now()) {
  const seen = new Set();
  const rows = (tenders || []).filter(t => {
    if (bidStatus(t, now) !== 'OPEN' || seen.has(t.key)) return false;
    seen.add(t.key); return true;
  });
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GiaoSuCuiBap//Tender Workspace 4.3//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Hạn đóng thầu'];
  for (const t of rows) {
    const close = parseDate(t.closeDate);
    const url = safeSource(t.detailUrl);
    lines.push('BEGIN:VEVENT', `UID:${encodeURIComponent(t.key)}@giaosucuibap.local`, `DTSTAMP:${utcStamp(now)}`,
      `DTSTART:${utcStamp(close)}`, `DTEND:${utcStamp(Date.parse(close) + 60000)}`,
      `SUMMARY:${icsText(`Đóng thầu · ${t.bidName || t.notifyNo}`)}`,
      `DESCRIPTION:${icsText(`${t.displayCode || t.notifyNo}\nChủ đầu tư: ${t.investorName || 'Chưa xác định'}\nMốc giờ theo dữ liệu đã ghi nhận; kiểm tra gia hạn trên e-GP trước khi nộp.\n${url}`)}`,
      `LOCATION:${icsText(t.location || '')}`, 'STATUS:CONFIRMED', 'TRANSP:TRANSPARENT');
    if (url) lines.push(`URL:${url}`);
    lines.push('BEGIN:VALARM', 'TRIGGER:-PT24H', 'ACTION:DISPLAY', 'DESCRIPTION:Kiểm tra hạn đóng thầu và hồ sơ trên e-GP', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return { count: rows.length, text: lines.map(foldCalendarLine).join('\r\n') + '\r\n' };
}
