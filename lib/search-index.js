/** Local indexes of the current result scope. No fuzzy geography, no network. */
import { firstStampMs } from './core.js';
import { recordCodes } from './area-match.js';
import { searchableText } from './decision.js';

export function createSearchIndex(rows = []) {
  const byKey = new Map(), byProvinceCode = new Map(), closeDates = [];
  for (const row of rows) {
    if (!row?.key) continue;
    byKey.set(String(row.key), row);
  }
  // Duplicated keys retain the latest row; all indexes reference that version.
  for (const [key, row] of byKey) {
    /* Chuẩn hoá sẵn chuỗi tìm kiếm ngay tại đây — một lần cho mỗi lượt tra,
       thay vì làm lại toàn kho ở mỗi lần gõ phím. Đo trên kho 20.000 gói:
       2,3 giây mỗi phím trước khi có dòng này. */
    searchableText(row);
    for (const provinceCode of recordCodes(row)) {
      if (!byProvinceCode.has(provinceCode)) byProvinceCode.set(provinceCode, new Set());
      byProvinceCode.get(provinceCode).add(key);
    }
    const stamp = firstStampMs(row, ['closeDate']);
    if (stamp !== null) closeDates.push({ key, stamp });
  }
  closeDates.sort((a,b) => a.stamp-b.stamp || a.key.localeCompare(b.key));
  return { byKey, byProvinceCode, closeDates, rows: [...byKey.values()] };
}

function lowerBound(rows, stamp) {
  let lo = 0, hi = rows.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (rows[mid].stamp < stamp) lo = mid + 1; else hi = mid; }
  return lo;
}

/** Intersect explicit key/province/date selections; no supplied selection means
 * all rows. Missing dates cannot match a requested closing-date interval. */
export function selectIndexedRows(index, { keys, provinceCodes, closeFrom, closeTo } = {}) {
  let selected = null;
  const intersect = next => { selected = selected === null ? next : new Set([...selected].filter(key => next.has(key))); };
  if (Array.isArray(keys)) intersect(new Set(keys.map(String).filter(key => index.byKey.has(key))));
  if (Array.isArray(provinceCodes)) {
    const wanted = new Set();
    for (const code of provinceCodes) for (const key of index.byProvinceCode.get(String(code)) || []) wanted.add(key);
    intersect(wanted);
  }
  if (closeFrom != null || closeTo != null) {
    const from = closeFrom ?? -Infinity, to = closeTo ?? Infinity;
    const wanted = new Set();
    if (typeof from === 'number' && typeof to === 'number' && !Number.isNaN(from) && !Number.isNaN(to) && from <= to) {
      for (let i=lowerBound(index.closeDates,from); i<index.closeDates.length && index.closeDates[i].stamp<=to; i++) wanted.add(index.closeDates[i].key);
    }
    intersect(wanted);
  }
  return selected === null ? [...index.rows] : index.rows.filter(row => selected.has(String(row.key)));
}
