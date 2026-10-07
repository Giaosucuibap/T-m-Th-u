import { parseInvestorFilter } from './investor-filter.js';
import { buildTbmtQueries } from './kqlcnt.js';
import { coverageOf } from './match-gate.js';
import { passesHardFilter } from './hard-filter.js';

export function investorScopes(scope = {}) {
  const parsed = parseInvestorFilter(scope.investor);
  if (!parsed.ok) throw new Error(parsed.message);
  return (parsed.terms.length ? parsed.terms : ['']).map(investor => ({...scope, investor}));
}

/** e-GP has one keyword block. Query each owner separately; never invent OR syntax. */
export function lookupBatch(criteria, queries, mode, maxPages = 0, verifyProvince = false) {
  const scope = verifyProvince && (criteria.province || criteria.provinces?.length)
    ? buildTbmtQueries({investor: criteria.investor || '', provinces: criteria.provinces || []})
      .map(query => ({query, mode: 'tbmt', purpose: 'province', maxPages: 40})) : [];
  return [...scope, ...queries.map(query => ({query, mode, purpose: 'results', maxPages}))];
}

export const batchTask = job => job?.queryBatch?.[Number(job.qi) || 0] || null;
export const batchHasNext = job => Boolean(job?.queryBatch && Number(job.qi || 0) < job.queryBatch.length - 1);

const areaFields = ['provinceCode','provinceCodes','locations','location','wardCode','wardParentCode','parentCode','wardIdentities'];
export function noticeIdentity(row = {}) {
  const raw = String(row.notifyNo || '').trim().toUpperCase();
  const match = /^(IB\d{10})(?:-(\d{2}))?$/.exec(raw);
  if (!match) return '';
  const version = String(row.version ?? row.notifyVersion ?? match[2] ?? '00');
  return `${match[1]}::${version.padStart(2, '0')}`;
}
export function provinceEvidence(row) {
  const key = noticeIdentity(row);
  if (!key) return null;
  return {key, notifyNo: row.notifyNo, version: row.version, detailUrl: row.detailUrl || '',
    ...Object.fromEntries(areaFields.filter(k => row[k] !== undefined).map(k => [k, row[k]]))};
}
export function enrichProvince(row, job = {}, areas = null) {
  const criteria = job.criteria || job.scope || {};
  const direct = passesHardFilter(row, {province: criteria.province, provinces: criteria.provinces}, areas);
  if (direct.state !== 'INSUFFICIENT') return row;
  const proof = job.provinceEvidence?.[noticeIdentity(row)];
  if (!proof) return row;
  // Link only the exact public notice revision, and never replace explicit conflicting geography.
  return {...row, ...Object.fromEntries(areaFields.filter(k => proof[k] !== undefined).map(k => [k, proof[k]])),
    areaEvidence: {type: 'linked-tbmt', notifyNo: proof.notifyNo, version: proof.version, url: proof.detailUrl}};
}

export function batchCoverage(job, receipts = {}, counts = {}) {
  const tasks = job.queryBatch || [], resultIndexes = tasks.flatMap((task, i) => task.purpose === 'results' ? [i] : []);
  const parts = resultIndexes.map(i => receipts[i]);
  const all = parts.length > 0 && parts.every(Boolean);
  const sum = key => all && parts.every(p => p[key] != null) ? parts.reduce((n, p) => n + p[key], 0) : null;
  const scopeMissing = tasks.some((task, i) => task.purpose === 'province' && !receipts[i]?.complete);
  const doneCount = parts.filter(p => p?.done).length;
  const coverage = coverageOf({serverTotal: sum('serverTotal'), totalPages: sum('totalPages'),
    pagesRead: parts.reduce((n,p) => n + (p?.pagesRead || 0), 0), fetched: parts.reduce((n,p) => n + (p?.fetched || 0), 0),
    ...counts, done: all && parts.every(p => p.done), partial: scopeMissing || parts.some(p => p?.done && !p.complete)});
  if (resultIndexes.length > 1) coverage.text += ` · Đã xong ${doneCount}/${resultIndexes.length} mục chủ đầu tư; tổng nguồn/tải là lượt bản ghi theo truy vấn, có thể giao nhau. Kết quả đã loại trùng.`;
  if (scopeMissing) coverage.text += ' · Chưa lấy đủ dữ liệu TBMT để đối chiếu tỉnh; gói chưa có bằng chứng được giữ ở nhóm chưa đủ dữ liệu.';
  return coverage;
}
