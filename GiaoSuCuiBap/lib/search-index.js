/** Local indexes of the current result scope. No fuzzy geography, no network. */
import { firstStampMs } from './core.js';
import { recordCodes } from './area-match.js';

export function createSearchIndex(rows = []) {
  const byKey = new Map(), byProvinceCode = new Map(), closeDates = [], order = new Map(), closeByKey = new Map();
  for (const row of rows) {
    if (!row?.key) continue;
    byKey.set(String(row.key), row);
  }
  // Duplicated keys retain the latest row; all indexes reference that version.
  for (const [key, row] of byKey) {
    order.set(key, order.size);
    for (const provinceCode of recordCodes(row)) {
      if (!byProvinceCode.has(provinceCode)) byProvinceCode.set(provinceCode, new Set());
      byProvinceCode.get(provinceCode).add(key);
    }
    const stamp = firstStampMs(row, ['closeDate']);
    if (stamp !== null) { closeDates.push({ key, stamp }); closeByKey.set(key, stamp); }
  }
  closeDates.sort((a,b) => a.stamp-b.stamp || a.key.localeCompare(b.key));
  return { byKey, byProvinceCode, closeDates, order, closeByKey, rows: [...byKey.values()] };
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
  const intersect = next => {
    if (selected === null) { selected = next; return; }
    const [small, large] = selected.size <= next.size ? [selected, next] : [next, selected];
    selected = new Set([...small].filter(key => large.has(key)));
  };
  if (Array.isArray(keys)) intersect(new Set(keys.map(String).filter(key => index.byKey.has(key))));
  if (Array.isArray(provinceCodes)) {
    const wanted = new Set();
    const provinces=provinceCodes.map(code=>index.byProvinceCode.get(String(code))).filter(Boolean);
    if(selected!==null) {
      for(const key of selected)if(provinces.some(keys=>keys.has(key)))wanted.add(key);
    } else {
      for (const province of provinces) for (const key of province) wanted.add(key);
    }
    intersect(wanted);
  }
  if (closeFrom != null || closeTo != null) {
    const from = closeFrom ?? -Infinity, to = closeTo ?? Infinity;
    const wanted = new Set();
    if (typeof from === 'number' && typeof to === 'number' && !Number.isNaN(from) && !Number.isNaN(to) && from <= to) {
      if(selected!==null&&index.closeByKey) {
        for(const key of selected){const stamp=index.closeByKey.get(key);if(stamp!==undefined&&stamp>=from&&stamp<=to)wanted.add(key);}
      } else {
        for (let i=lowerBound(index.closeDates,from); i<index.closeDates.length && index.closeDates[i].stamp<=to; i++) wanted.add(index.closeDates[i].key);
      }
    }
    intersect(wanted);
  }
  if (selected === null) return [...index.rows];
  // A sparse selection must not walk the full warehouse again. Retain source
  // order (including the latest value of a duplicate key) for stable sort ties.
  if (index.order && selected.size * 2 < index.rows.length)
    return [...selected].sort((a,b) => index.order.get(a)-index.order.get(b)).map(key => index.byKey.get(key));
  return index.rows.filter(row => selected.has(String(row.key)));
}
