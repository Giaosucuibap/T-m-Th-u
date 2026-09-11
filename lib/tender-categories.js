/** Shared package choices for KHLCNT and TBMT. TV subtypes are name filters,
 * not extra sector codes published by e-GP. This module never reads plan-wide
 * `fields`, project names, investor names, or the raw page text as package data.
 */
export const TENDER_CATEGORIES = Object.freeze([
  { value: '', label: 'Tất cả loại gói thầu' },
  { value: 'XL', label: 'Xây lắp' },
  { value: 'TV', label: 'Tư vấn — tất cả' },
  { value: 'TV_DESIGN', label: 'Tư vấn thiết kế' },
  { value: 'TV_SUPERVISION', label: 'Tư vấn giám sát' },
  { value: 'TV_SURVEY', label: 'Tư vấn khảo sát' },
  { value: 'TV_APPRAISAL', label: 'Tư vấn thẩm tra / thẩm định' },
  { value: 'TV_PROJECT_MANAGEMENT', label: 'Tư vấn quản lý dự án' },
  { value: 'HH', label: 'Hàng hóa' },
  { value: 'PTV', label: 'Phi tư vấn' },
  { value: 'HON_HOP', label: 'Hỗn hợp' }
].map(Object.freeze));

const CHOICES = new Map(TENDER_CATEGORIES.map((option) => [option.value, option]));
const FIELDS = new Set(['XL', 'TV', 'HH', 'PTV', 'HON_HOP']);
const FIELD_KEYS = ['fieldCode', 'investField', 'bidField', 'field', 'fieldRaw', 'investFieldName', 'bidFieldName', 'fieldName', 'fieldLabel'];
const NAME_KEYS = ['bidName', 'notifyName', 'packageName', 'name', 'bidPackageName'];

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function fold(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function phrase(haystack, needle) {
  return ` ${haystack} `.includes(` ${needle} `);
}

export function normalizeCategory(value) {
  const key = text(value).toUpperCase();
  return CHOICES.has(key) ? key : '';
}

export function categoryLabel(value) {
  return CHOICES.get(normalizeCategory(value)).label;
}

/** Official base sector; callers decide whether their verified query supports it. */
export function categoryField(value) {
  const category = normalizeCategory(value);
  return category.startsWith('TV_') ? 'TV' : category;
}

function ownValue(record, key) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return '';
  const value = record[key];
  // Only a single value can describe an individual package. A mixed field
  // array is plan-level metadata and must not be assigned to every child.
  return Array.isArray(value) ? (value.length === 1 ? text(value[0]) : '') : text(value);
}

function packageName(record) {
  return NAME_KEYS.map((key) => ownValue(record, key)).find(Boolean) || '';
}

function explicitTenderField(record) {
  const values = FIELD_KEYS.map((key) => ownValue(record, key)).filter(Boolean);
  // Prefer any exact official code to a stale or translated display label.
  for (const value of values) {
    const code = value.toUpperCase();
    if (FIELDS.has(code)) return code;
  }
  const labels = { 'xay lap': 'XL', 'tu van': 'TV', 'hang hoa': 'HH', 'phi tu van': 'PTV', 'hon hop': 'HON_HOP' };
  for (const value of values) {
    const field = labels[fold(value)];
    if (field) return field;
  }
  return '';
}

function subtypeMatches(name, category) {
  if (category === 'TV_DESIGN') {
    // Reviewing another designer's work is not a design commission. A later
    // independent "thiết kế" phrase still matches a combined commission.
    const remaining = name.replace(/\b(?:tham tra|tham dinh)(?: ho so| ket qua| phuong an)? thiet ke\b/g, ' ');
    return phrase(remaining, 'thiet ke') || phrase(remaining, 'tvtk');
  }
  if (category === 'TV_SUPERVISION') {
    const remaining = name.replace(/\b(?:camera|he thong|phan mem|thiet bi) giam sat\b/g, ' ');
    return phrase(remaining, 'giam sat') || phrase(remaining, 'tvgs') || phrase(remaining, 'gsxl');
  }
  if (category === 'TV_SURVEY') return phrase(name, 'khao sat') || phrase(name, 'tvks');
  if (category === 'TV_APPRAISAL') {
    return phrase(name, 'tham tra') || phrase(name, 'tham dinh') || phrase(name, 'tvtt') || phrase(name, 'tvtd');
  }
  if (category === 'TV_PROJECT_MANAGEMENT') {
    return phrase(name.replace(/\bban quan ly du an\b/g, ' '), 'quan ly du an')
      || phrase(name, 'tvqlda') || phrase(name, 'qlda');
  }
  return true;
}

/** Conservative display-filter inference, used only without an explicit field.
 * It is not official classification. Unknown names return an empty field.
 * Keep the input to the package name: "Ban quản lý dự án" in the investor or
 * "xây dựng" in the project must never classify an unrelated package.
 */
export function inferTenderFieldFromName(value) {
  const name = fold(value);
  if (!name) return '';
  if (phrase(name, 'hon hop') || phrase(name, 'chia khoa trao tay') || phrase(name, 'epc')) return 'HON_HOP';
  if (phrase(name, 'phi tu van')) return 'PTV';
  if (phrase(name, 'tu van')) return 'TV';
  if (['mua sam', 'mua thiet bi', 'mua thuoc', 'cung cap thiet bi', 'cung cap vat tu', 'cung cap hang hoa', 'cung cap thuoc'].some((p) => phrase(name, p))) return 'HH';
  if (['dich vu ve sinh', 'dich vu bao ve', 'dich vu van chuyen', 'dich vu bao hiem', 'bao hiem cong trinh'].some((p) => phrase(name, p))) return 'PTV';
  // An unlabelled consulting task must lead the name, optionally after a
  // normal package number. Mere mentions of design/supervision equipment
  // later in a construction title are insufficient.
  const taskName = name.replace(/^(?:goi thau|goi)(?: so)?(?: [a-z]*[0-9]+[a-z]*| [ivx]+)? /, '');
  if (/^(?:thiet ke|giam sat|khao sat|tham tra|tham dinh|quan ly du an)\b/.test(taskName)) return 'TV';
  if (['xay lap', 'thi cong', 'xay dung', 'sua chua', 'nang cap', 'cai tao'].some((p) => phrase(name, p))) return 'XL';
  return '';
}

function isPlanOrAmbiguousContainer(record) {
  if (Array.isArray(record.packages)) return true;
  const type = ownValue(record, 'type');
  if (type === 'es-plan-project-p' || /^plan-step-/.test(ownValue(record, 'stepCode'))) return true;
  if (!Array.isArray(record.bidName)) return false;
  // Native es-notify-contractor search results also wrap a SINGLE notice's
  // bidName and investField in arrays. Only a notice identity distinguishes
  // this observed shape from a plan's list of child package names.
  if (record.bidName.length !== 1) return true;
  const noticeNo = ownValue(record, 'notifyNo');
  const noticeId = ownValue(record, 'notifyId');
  const knownNotice = /^IB\d{10}(?:-\d{2})?$/i.test(noticeNo)
    || /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(noticeId)
    || type === 'es-notify-contractor';
  return !knownNotice;
}

/** Resolve an individual package's explicit field, then its name inference.
 * Empty means unclassified; callers can count and disclose these omissions.
 */
export function tenderFieldOf(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return '';
  if (isPlanOrAmbiguousContainer(record)) return '';
  return explicitTenderField(record) || inferTenderFieldFromName(packageName(record));
}

/** Match one TBMT or one child package, never a whole multi-package plan. */
export function matchesTenderCategory(record, value) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  const category = normalizeCategory(value);
  if (!category) return true;
  const field = tenderFieldOf(record);
  if (field !== categoryField(category)) return false;
  return !category.startsWith('TV_') || subtypeMatches(fold(packageName(record)), category);
}
