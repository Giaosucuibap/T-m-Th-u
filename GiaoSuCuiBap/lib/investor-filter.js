/** OR between investor entries; AND between whole words inside one identity.
 * Commas belong to organization names. This syntax is local: callers must
 * issue separate e-GP queries instead of sending the whole list as a keyword. */
import { cleanText, foldText } from './core.js';
import { GATE_MATCH, GATE_INSUFFICIENT, GATE_OUT } from './match-gate.js';

export const MAX_INVESTOR_TERMS = 20;
export const MAX_INVESTOR_TEXT_LENGTH = 500;
const list = value => Array.isArray(value) ? value : value == null ? [] : [value];
const scalar = value => typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value)) ? cleanText(value) : '';
const words = value => foldText(value).replace(/[^a-z0-9]+/g, ' ').trim();
const codeIdentity = value => /^(?:vn[a-z0-9]+(?:-\d+)?|\d{8,}(?:-\d+)?)$/i.test(value)
  ? value.toLowerCase().replace(/^vn/, '').replace(/-/g, '') : '';
const invalid = (error, message) => ({ ok: false, terms: [], value: '', error, message });

/** Validate before normalizing, never truncate an overlong selection into a
 * different query. Absent/blank is no filter; malformed input fails closed. */
export function parseInvestorFilter(value) {
  if (value == null) return { ok: true, terms: [], value: '' };
  if (typeof value !== 'string') return invalid('type', 'Chủ đầu tư phải là tên hoặc mã dạng chữ; ngăn cách nhiều mục bằng dấu chấm phẩy.');
  if (value.length > MAX_INVESTOR_TEXT_LENGTH) return invalid('length', `Danh sách chủ đầu tư không được vượt quá ${MAX_INVESTOR_TEXT_LENGTH} ký tự.`);
  if (!value.trim()) return { ok: true, terms: [], value: '' };
  const rawTerms = value.split(/[;\r\n]+/).map(term => term.trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (!rawTerms.length || rawTerms.some(term => !words(term))) return invalid('empty', 'Nhập ít nhất một tên hoặc mã chủ đầu tư hợp lệ; dấu chấm phẩy dùng để tách các mục.');
  const unique = new Map();
  for (const term of rawTerms) {
    const key = codeIdentity(term) ? `code:${codeIdentity(term)}` : `name:${words(term)}`;
    if (!unique.has(key)) unique.set(key, term);
  }
  if (unique.size > MAX_INVESTOR_TERMS) return invalid('count', `Chỉ chọn tối đa ${MAX_INVESTOR_TERMS} chủ đầu tư hoặc nhóm tên trong một lượt.`);
  const terms = [...unique.values()];
  const normalized = terms.join('; ');
  if (normalized.length > MAX_INVESTOR_TEXT_LENGTH) return invalid('length', `Danh sách chủ đầu tư không được vượt quá ${MAX_INVESTOR_TEXT_LENGTH} ký tự sau khi chuẩn hóa.`);
  return { ok: true, terms, value: normalized };
}

/** Compile once per collection, not once per row. A term must be satisfied by
 * one investor/procuring entity, never by joining names, titles or locations. */
export function compileInvestorFilter(value) {
  const parsed = parseInvestorFilter(value);
  if (!parsed.ok) return () => ({ ok: false, state: GATE_INSUFFICIENT, reason: 'invalid-investor-filter', matchedTerms: [] });
  if (!parsed.terms.length) return () => ({ ok: true, state: GATE_MATCH, reason: 'match', matchedTerms: [] });
  const terms = parsed.terms.map(label => ({ label, code: codeIdentity(label), tokens: words(label).split(' ') }));
  return (rawRecord = {}) => {
    const record = rawRecord && typeof rawRecord === 'object' && !Array.isArray(rawRecord) ? rawRecord : {};
    const codes = [record.investorCode, record.procuringEntityCode, ...list(record.investorCodes)]
      .map(scalar).filter(Boolean).map(codeIdentity).filter(Boolean);
    const identities = [record.investorName, record.procuringEntityName, ...list(record.investorNames)]
      .flatMap(list).map(scalar).map(words).filter(Boolean).map(name => new Set(name.split(' ')));
    const matchedTerms = [];
    let unknown = false;
    for (const term of terms) {
      if (term.code) {
        if (!codes.length) unknown = true;
        else if (codes.includes(term.code)) matchedTerms.push(term.label);
      } else {
        if (!identities.length) unknown = true;
        else if (identities.some(identity => term.tokens.every(token => identity.has(token)))) matchedTerms.push(term.label);
      }
    }
    const state = matchedTerms.length ? GATE_MATCH : unknown ? GATE_INSUFFICIENT : GATE_OUT;
    return { ok: state === GATE_MATCH, state, reason: state === GATE_MATCH ? 'match' : state === GATE_INSUFFICIENT ? 'insufficient-investor' : 'investor', matchedTerms };
  };
}

export function matchesInvestorFilter(record, value) {
  return compileInvestorFilter(value)(record);
}
