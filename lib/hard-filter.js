/** One traceable decision for storage, counts, alerts, display and export. */
import { matchesQuery, matchesExcludeKeywords } from './workspace.js';
import { matchesAreaCodes, matchesWardCodes } from './area-match.js';
import { cleanText, foldText, parseMoney, dateRangeFrom, firstStampMs, parseDayMs, isConstructionTender } from './core.js';
import { normalizeCategory, matchesTenderCategory, tenderFieldOf } from './tender-categories.js';
import { dateGate, GATE_MATCH, GATE_INSUFFICIENT, GATE_OUT } from './match-gate.js';

const list = value => Array.isArray(value) ? value : value == null ? [] : [value];
const text = value => list(value).map(cleanText).filter(Boolean).join(' ');
const words = value => foldText(value).replace(/[^a-z0-9]+/g, ' ').trim();
const phrase = (hay, needle) => ` ${words(hay)} `.includes(` ${words(needle)} `);
const present = value => cleanText(value) !== '';

export const HARD_FILTER_REASON_LABELS = Object.freeze({
  match: 'Khớp các tiêu chí đã chọn', area: 'Khác tỉnh/thành đã chọn',
  'insufficient-area': 'Chưa đủ dữ liệu tỉnh/thành', 'unresolved-area': 'Chưa nhận diện được tỉnh/thành đã chọn',
  'insufficient-price': 'Chưa có giá gói thầu để đối chiếu', 'price-low': 'Giá thấp hơn khoảng đã chọn', 'price-high': 'Giá cao hơn khoảng đã chọn',
  'invalid-price-filter': 'Khoảng giá không hợp lệ', investor: 'Khác chủ đầu tư đã chọn', 'insufficient-investor': 'Thiếu thông tin chủ đầu tư',
  ward: 'Khác xã/phường đã chọn', 'insufficient-ward': 'Chưa đủ dữ liệu xã/phường', 'unresolved-ward': 'Chưa xác định mã xã/phường và tỉnh đã chọn',
  category: 'Khác loại gói thầu đã chọn', 'insufficient-category': 'Chưa xác định loại gói thầu', 'invalid-category': 'Loại gói thầu không hợp lệ',
  keyword: 'Không khớp từ khóa tên gói', must: 'Thiếu từ khóa bắt buộc', exclude: 'Có từ khóa loại trừ',
  required: 'Không khớp nhóm từ khóa yêu cầu', 'insufficient-title': 'Chưa có tên gói thầu', 'not-construction': 'Không thuộc gói xây lắp',
  date: 'Ngoài khoảng thời gian đã chọn', 'insufficient-date': 'Chưa có ngày để đối chiếu', 'invalid-date-filter': 'Khoảng ngày không hợp lệ',
  'insufficient-packages': 'Chưa có danh sách gói thầu trong kế hoạch'
});

export function hardFilterReason(result) {
  const key = typeof result === 'string' ? result : result?.reason;
  return HARD_FILTER_REASON_LABELS[key] || key || HARD_FILTER_REASON_LABELS.match;
}

export function passesHardFilter(record = {}, criteria = {}, areas = null) {
  const reasons = [];
  const add = (field, reason, state = GATE_OUT) => reasons.push({ field, reason, state });
  const area = matchesAreaCodes(record, criteria, areas);
  if (!area.ok) add('province', area.reason === 'unresolved-area' ? 'unresolved-area' : area.state === GATE_INSUFFICIENT ? 'insufficient-area' : 'area', area.state);

  const min = present(criteria.minPrice) ? parseMoney(criteria.minPrice) : 0;
  const max = present(criteria.maxPrice) ? parseMoney(criteria.maxPrice) : 0;
  if (min == null || max == null || min < 0 || max < 0 || (max > 0 && min > max)) add('price', 'invalid-price-filter', GATE_INSUFFICIENT);
  else if (min > 0 || max > 0) {
    const raw = Object.hasOwn(record, 'price') ? record.price : record.bidPrice ?? record.packageBidPrice;
    const price = present(raw) ? (typeof raw === 'number' ? raw : /^[+-]?\d{4,}\.\d+$/.test(String(raw).trim()) ? Number(raw) : parseMoney(raw)) : null;
    if (price == null || !Number.isFinite(price) || Math.abs(price) > Number.MAX_SAFE_INTEGER || price < 0) add('price', 'insufficient-price', GATE_INSUFFICIENT);
    else if (min > 0 && price < min) add('price', 'price-low');
    else if (max > 0 && price > max) add('price', 'price-high');
  }

  if (present(criteria.investor)) {
    const q = cleanText(criteria.investor).toLowerCase();
    const codes = [record.investorCode, record.procuringEntityCode, ...list(record.investorCodes)].map(cleanText).filter(Boolean).map(v => v.toLowerCase());
    const hay = words([record.investorName, record.procuringEntityName, ...list(record.investorNames)].map(text).join(' '));
    if (/^(?:vn[a-z0-9]+|\d{8,}(?:-\d+)?)$/i.test(q)) {
      const canonical = v => v.replace(/^vn/, '').replace(/[-\s]/g, '');
      if (!codes.length) add('investor', 'insufficient-investor', GATE_INSUFFICIENT);
      else if (!codes.some(c => canonical(c) === canonical(q))) add('investor', 'investor');
    } else if (!hay) add('investor', 'insufficient-investor', GATE_INSUFFICIENT);
    else if (!words(q).split(' ').every(token => phrase(hay, token))) add('investor', 'investor');
  }

  const ward = matchesWardCodes(record, criteria, areas);
  if (!ward.ok) add('ward', ward.reason, ward.state);

  const category = normalizeCategory(criteria.category || criteria.field);
  if (present(criteria.category || criteria.field) && !category) add('category', 'invalid-category', GATE_INSUFFICIENT);
  else if (category && !tenderFieldOf(record)) add('category', 'insufficient-category', GATE_INSUFFICIENT);
  else if (category && !matchesTenderCategory(record, category)) add('category', 'category');
  const title = ['bidName','notifyName','packageName','bidPackageName','name'].map(k => text(record[k])).find(Boolean) || '';
  const codeQuery = /^(?:IB|PL|BP)\d{8,}(?:-\d+)?$/i.test(cleanText(criteria.keyword));
  const codeMatches = codeQuery && ['notifyNo','planNo','bidNo','displayCode','notifyNoStand','planNoStand'].some(k => cleanText(record[k]).toUpperCase() === cleanText(criteria.keyword).toUpperCase());
  const hasTitleCriteria = ['mustKeywords','excludeKeywords'].some(k => present(criteria[k])) || (present(criteria.keyword) && !codeQuery) || list(criteria.requiredKeywords).length > 0;
  if (codeQuery && !codeMatches) add('keyword', 'keyword');
  if (hasTitleCriteria && !title) add('title', 'insufficient-title', GATE_INSUFFICIENT);
  else {
    if (present(criteria.keyword) && !codeQuery && !matchesQuery(title, criteria.keyword)) add('keyword', 'keyword');
    if (present(criteria.mustKeywords) && !matchesQuery(title, criteria.mustKeywords)) add('mustKeywords', 'must');
    if (present(criteria.excludeKeywords) && !matchesExcludeKeywords(title, criteria.excludeKeywords)) add('excludeKeywords', 'exclude');
    if (list(criteria.requiredKeywords).length && !list(criteria.requiredKeywords).some(q => matchesQuery(title, q))) add('requiredKeywords', 'required');
  }
  if (criteria.requireConstruction && !tenderFieldOf(record)) add('construction', 'insufficient-category', GATE_INSUFFICIENT);
  else if (criteria.requireConstruction && !isConstructionTender(record)) add('construction', 'not-construction');

  if (criteria.dateFields !== false) {
    if (['fromDate','toDate'].some(k => present(criteria[k]) && parseDayMs(criteria[k]) === null)) add('date', 'invalid-date-filter', GATE_INSUFFICIENT);
    else {
      const range = criteria.dateRange || dateRangeFrom(criteria);
      const fields = Array.isArray(criteria.dateFields) ? criteria.dateFields : ['publicDate'];
      const gate = dateGate(firstStampMs(record, fields), range);
      if (gate !== GATE_MATCH) add('date', gate === GATE_INSUFFICIENT ? 'insufficient-date' : 'date', gate);
    }
  }
  const first = reasons.find(r => r.state === GATE_OUT) || reasons[0];
  const state = first?.state || GATE_MATCH;
  return { ok: state === GATE_MATCH, state, reason: first?.reason || 'match', field: first?.field || null, reasons };
}
