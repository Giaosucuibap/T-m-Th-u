import { passesHardFilter, hardFilterReason } from './hard-filter.js';
import { runTenders } from './workspace.js';
import { filterAndSort, statusOf } from './decision.js';
import { parseDayMs } from './core.js';
import { createSearchIndex, selectIndexedRows } from './search-index.js';

/** Shared, deterministic view for the list, its totals and the complete export.
 * Pagination belongs to the renderer and never limits this result. */
export function resultRows(tenders, run) {
  return runTenders(tenders, run).map(t => {
    const saved = run?.resultStates?.[t.key];
    const gate = saved?.filterState ? null : run?.criteria ? passesHardFilter(t, run.criteria)
      : {state:'INSUFFICIENT', reason:'Bản lưu cũ chưa ghi tiêu chí để đối chiếu'};
    const state = saved?.filterState || gate.state;
    return {...t, ...(saved || {}), filterState:state,
      filterReason:hardFilterReason(saved?.filterState ? {state, reason:saved.filterReason} : gate),
      matched:Boolean(saved?.matched ?? t.matched) && state === 'MATCH'};
  });
}

export function normalizeResultFilters(input = {}) {
  return {criteriaState:['', 'MATCH', 'INSUFFICIENT', 'OUT_OF_RANGE'].includes(input.criteriaState) ? input.criteriaState : 'MATCH',
    text:String(input.text || '').slice(0,500), status:String(input.status || '').slice(0,30),
    minScore:Math.max(0, Math.min(100, Number(input.minScore) || 0)), sortBy:String(input.sortBy || '').slice(0,40),
    onlyMatched:input.onlyMatched === true, onlyWatch:input.onlyWatch === true,
    provinceCode:String(input.provinceCode||'').slice(0,40),closeFrom:String(input.closeFrom||'').slice(0,10),closeTo:String(input.closeTo||'').slice(0,10)};
}

export function createResultView(tenders, run, input = {}, {index:providedIndex} = {}) {
  const filters = normalizeResultFilters(input), index=providedIndex||createSearchIndex(resultRows(tenders,run)),all=index.rows;
  const closeFrom=filters.closeFrom?parseDayMs(filters.closeFrom):undefined,closeTo=filters.closeTo?parseDayMs(filters.closeTo,true):undefined;
  const validDates=(!filters.closeFrom||closeFrom!==null)&&(!filters.closeTo||closeTo!==null);
  const scoped=validDates?selectIndexedRows(index,{provinceCodes:filters.provinceCode?[filters.provinceCode]:undefined,closeFrom,closeTo}):[];
  const rows = filterAndSort(scoped.filter(t => !filters.criteriaState || t.filterState === filters.criteriaState), filters)
    .filter(t => !filters.onlyWatch || t.watchlisted);
  const priced = rows.filter(t => t.price !== null && t.price !== undefined && t.price !== '' && Number.isFinite(Number(t.price)));
  return {all, rows, filters, summary:{total:rows.length, match:rows.filter(t => t.filterState === 'MATCH').length,
    insufficient:rows.filter(t => t.filterState === 'INSUFFICIENT').length, outOfRange:rows.filter(t => t.filterState === 'OUT_OF_RANGE').length,
    matched:rows.filter(t => t.matched).length, open:rows.filter(t => statusOf(t) === 'OPEN').length,
    priced:priced.length, totalValue:priced.length ? priced.reduce((sum,t) => sum + Number(t.price),0) : null}};
}

/** Revision is an opaque cache validator, never an authorization token. */
export function resultRevision(value) {
  const text = JSON.stringify(value);
  let a = 2166136261, b = 5381;
  for (let i=0;i<text.length;i++) { a=Math.imul(a^text.charCodeAt(i),16777619); b=Math.imul(b,33)^text.charCodeAt(i); }
  return `v1-${(a>>>0).toString(36)}-${(b>>>0).toString(36)}-${text.length.toString(36)}`;
}

export function verifyExportKeys(rows, keys) {
  if (keys == null) return rows;
  if (!Array.isArray(keys) || keys.length > 10000 || keys.some(k => typeof k !== 'string')) throw new Error('Phạm vi xuất không hợp lệ.');
  const visible = new Set(rows.map(t => t.key)), supplied = new Set(keys);
  if (supplied.size !== keys.length || supplied.size !== visible.size || keys.some(key => !visible.has(key)))
    throw new Error('Phạm vi xuất phải khớp toàn bộ danh sách sau lọc, bao gồm mọi trang. Hãy tải lại kết quả.');
  return rows;
}
