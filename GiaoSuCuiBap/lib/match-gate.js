/** Three mutually exclusive decisions, independent of recommendation scores. */
export const GATE_MATCH = 'MATCH';
export const GATE_INSUFFICIENT = 'INSUFFICIENT';
export const GATE_OUT = 'OUT_OF_RANGE';
export const GATE_LABEL = Object.freeze({ MATCH: 'Khớp tiêu chí', INSUFFICIENT: 'Chưa đủ dữ liệu để kết luận', OUT_OF_RANGE: 'Ngoài tiêu chí đã chọn' });

export function dateGate(stampMs, range) {
  if (!range) return GATE_MATCH;
  const from = range.from ?? -Infinity, to = range.to ?? Infinity;
  if (typeof from !== 'number' || typeof to !== 'number' || Number.isNaN(from) || Number.isNaN(to) || from > to) return GATE_INSUFFICIENT;
  if (stampMs === null || stampMs === undefined || !Number.isFinite(stampMs)) return GATE_INSUFFICIENT;
  return stampMs >= from && stampMs <= to ? GATE_MATCH : GATE_OUT;
}

const count = value => value == null || value === '' || !Number.isSafeInteger(Number(value)) || Number(value) < 0 ? null : Number(value);

/** Completeness describes retrieval only. Unknown source totals stay unknown;
 * pageIndexes are unique zero-based identities, never message counts. */
export function coverageOf(input = {}) {
  const serverTotal = count(input.serverTotal), totalPages = count(input.totalPages);
  const pageIndexes = Array.isArray(input.pageIndexes) ? [...new Set(input.pageIndexes.map(count).filter(v => v !== null))].sort((a,b) => a-b) : null;
  const pagesRead = pageIndexes ? pageIndexes.length : count(input.pagesRead) ?? 0;
  const fetched = count(input.fetched) ?? 0, match = count(input.match) ?? 0;
  const insufficient = count(input.insufficient) ?? 0, outOfRange = count(input.outOfRange) ?? 0;
  const classified = match + insufficient + outOfRange;
  const contiguous = !pageIndexes || pageIndexes.every((v,i) => v === i);
  const consistent = classified <= fetched && (serverTotal === null || fetched <= serverTotal) && (totalPages === null || pagesRead <= totalPages) && contiguous;
  const totalsKnown = serverTotal !== null || totalPages !== null;
  const pagesOk = totalPages === null || pagesRead === totalPages;
  const fetchedOk = serverTotal === null || fetched === serverTotal;
  const complete = totalsKnown && consistent && pagesOk && fetchedOk && input.done !== false && !input.partial;
  const output = { serverTotal, fetched, match, insufficient, outOfRange, pagesRead, totalPages,
    pageIndexes, done: input.done === true, partial: Boolean(input.partial), complete, consistent,
    unclassified: Math.max(0, fetched - classified), totalsKnown };
  output.text = coverageText(output);
  return output;
}

export function coverageText(c = {}) {
  const parts = [`e-GP báo ${c.serverTotal == null ? 'chưa rõ tổng' : c.serverTotal}`, `đã tải ${c.fetched ?? 0}`, `khớp ${c.match ?? 0}`];
  if (c.insufficient) parts.push(`thiếu dữ liệu ${c.insufficient}`);
  if (c.outOfRange) parts.push(`ngoài tiêu chí ${c.outOfRange}`);
  if (c.totalPages != null) parts.push(`trang ${c.pagesRead ?? 0}/${c.totalPages}`);
  if (c.consistent === false) parts.push('SỐ LIỆU CHƯA ĐỐI SOÁT');
  if (!c.complete) parts.push('CHƯA XÁC NHẬN LẤY ĐỦ — không xem là toàn bộ thị trường');
  return parts.join(' · ');
}

export function classifyByDate(records, range, stampFn) {
  const match = [], insufficient = [], outOfRange = [];
  for (const row of records || []) {
    const gate = dateGate(stampFn(row), range);
    (gate === GATE_MATCH ? match : gate === GATE_INSUFFICIENT ? insufficient : outOfRange).push(row);
  }
  return { match, insufficient, outOfRange };
}
