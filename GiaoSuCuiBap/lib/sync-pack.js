import { hmacSha256Hex } from './hmac.js';
import { normalizeContract, safeContracts } from './contracts.js';

export const SYNC_DECISION_FIELDS = Object.freeze(['decisionState', 'decisionOwner', 'decisionNote', 'decisionPrice', 'decisionAt', 'decisionUpdatedAt', 'decisionProposedBy', 'decisionProposedAt', 'decisionTechBy', 'decisionTechAt', 'decisionConfirmedBy', 'decisionConfirmedAt', 'decisionDirectorBy', 'decisionDirectorAt']);
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const identity = (value) => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
const validKey = (key) => typeof key === 'string' && key.length > 0 && key.length <= 220 && !['__proto__', 'constructor', 'prototype'].includes(key);
const stamp = (value) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const decisionStamp = (row) => Math.max(0, ...SYNC_DECISION_FIELDS.filter((key) => key.endsWith('At')).map((key) => stamp(row[key])));
const pickDecision = (row) => Object.fromEntries(SYNC_DECISION_FIELDS.filter((field) => Object.hasOwn(row, field)).map((field) => [field, typeof row[field] === 'number' ? row[field] : String(row[field] ?? '').slice(0, field === 'decisionNote' ? 2000 : 220)]));
const checklistItems = new Set(['hsmt', 'lamro', 'baodam', 'tuongtu', 'nhansu', 'thietbi', 'gia', 'nop', 'bienphap', 'bave', 'chungchi', 'nhatky']);
function normalizeChecklist(row) {
  if (!record(row) || !record(row.items)) return null;
  return {
    items: Object.fromEntries(Object.entries(row.items).filter(([key]) => checklistItems.has(key)).map(([key, value]) => [key, value === true])),
    owner: String(row.owner || '').trim().slice(0, 80),
    updatedAt: stamp(row.updatedAt) ? new Date(row.updatedAt).toISOString() : '',
    category: String(row.category || '').slice(0, 40)
  };
}

function canonicalPack(pack) {
  const copy = { ...pack };
  delete copy.signature;
  return JSON.stringify(copy);
}

export function signChecklistPack(pack, secret) {
  const body = canonicalPack(pack);
  return secret ? `sha256=${hmacSha256Hex(secret, body)}` : '';
}

export function verifyChecklistPack(pack, secret) {
  if (!secret) return { ok: true, unsigned: true };
  const expect = signChecklistPack(pack, secret);
  const got = String(pack?.signature || '');
  if (!got) return { ok: false, message: 'Gói JSON thiếu chữ ký HMAC.' };
  if (got !== expect) return { ok: false, message: 'Chữ ký HMAC không khớp — tệp có thể đã bị sửa.' };
  return { ok: true };
}

export function buildChecklistPack(state = {}, secret = '') {
  const decisions = (state.tenders || []).filter((t) => t.decisionState && (t.decisionState !== 'NEW' || decisionStamp(t) > 0))
    .map((t) => ({ key: t.key, ...pickDecision(t) }));
  const pack = {
    source: 'GiaoSuCuiBap',
    version: '4.8.1',
    exportedAt: new Date().toISOString(),
    operator: state.settings?.operatorName || '',
    checklists: Object.fromEntries(Object.entries(state.checklists || {}).filter(([key, value]) => validKey(key) && normalizeChecklist(value)).map(([key, value]) => [key, normalizeChecklist(value)])),
    decisions,
    pastContracts: safeContracts(state.pastContracts)
  };
  pack.signature = signChecklistPack(pack, secret || state.settings?.webhookSecret || state.settings?.packSecret || '');
  return pack;
}

export function mergeChecklistPack(current = {}, pack = {}, operator = '', secret = '') {
  if (!pack || pack.source !== 'GiaoSuCuiBap') {
    return { ok: false, message: 'Tệp không phải gói đồng bộ Giáo Sư Cùi Bắp.' };
  }
  const signed = verifyChecklistPack(pack, secret);
  if (!signed.ok) return signed;
  if ((pack.checklists !== undefined && !record(pack.checklists)) || (pack.decisions !== undefined && !Array.isArray(pack.decisions)) || (pack.pastContracts !== undefined && !Array.isArray(pack.pastContracts))) {
    return { ok: false, message: 'Cấu trúc gói đồng bộ không hợp lệ.' };
  }
  if (Object.keys(pack.checklists || {}).length > 10000 || (pack.decisions || []).length > 10000 || (pack.pastContracts || []).length > 10000) return { ok: false, message: 'Gói đồng bộ vượt giới hạn 10.000 bản ghi mỗi nhóm.' };
  const checklists = { ...(current.checklists || {}) };
  const conflicts = [];
  let checklistCount = 0;
  for (const [key, raw] of Object.entries(pack.checklists || {})) {
    const row = normalizeChecklist(raw);
    if (!validKey(key) || !row) { conflicts.push({ kind: 'checklist', key, reason: 'invalid' }); continue; }
    const prev = checklists[key];
    if (prev && ((prev.owner && identity(prev.owner) !== identity(row.owner)) || !stamp(row.updatedAt) || stamp(prev.updatedAt) >= stamp(row.updatedAt))) {
      conflicts.push({ kind: 'checklist', key, reason: 'local-newer-or-owner' }); continue;
    }
    checklists[key] = { ...row, importedAt: new Date().toISOString(), importedBy: operator };
    checklistCount += 1;
  }
  const byKey = new Map((current.tenders || []).map((t) => [t.key, { ...t }]));
  let decisionCount = 0;
  for (const d of pack.decisions || []) {
    if (!record(d) || !validKey(d.key) || !byKey.has(d.key)) continue;
    if (!['NEW', 'REVIEW', 'GO', 'BID', 'SUBMITTED', 'NO_GO'].includes(d.decisionState)) { conflicts.push({ kind: 'decision', key: d.key, reason: 'invalid' }); continue; }
    const t = byKey.get(d.key);
    if ((t.decisionOwner && identity(t.decisionOwner) !== identity(d.decisionOwner))
      || (decisionStamp(t) > 0 && decisionStamp(t) >= decisionStamp(d))
      || (t.decisionState && t.decisionState !== 'NEW' && !decisionStamp(d))) {
      conflicts.push({ kind: 'decision', key: d.key, reason: 'local-newer-or-owner' }); continue;
    }
    const incoming = pickDecision(d);
    // Replace the whole approval record: absent old-format stages are unknown,
    // not previous local signatures accidentally attached to another decision.
    for (const field of SYNC_DECISION_FIELDS) if (!Object.hasOwn(incoming, field)) incoming[field] = '';
    byKey.set(d.key, { ...t, ...incoming });
    decisionCount += 1;
  }
  const contracts = new Map(safeContracts(current.pastContracts).map((row) => [row.id, row]));
  let contractCount = 0;
  for (const raw of pack.pastContracts || []) {
    const row = normalizeContract(raw);
    if (!row) { conflicts.push({ kind: 'contract', reason: 'invalid' }); continue; }
    if (!row.id) {
      const equivalent = [...contracts.values()].some((c) => c.name === row.name && c.price === row.price && c.year === row.year && c.province === row.province);
      if (equivalent) continue;
      let n = contracts.size + 1;
      while (contracts.has(`import-hd-${n}`)) n++;
      row.id = `import-hd-${n}`;
    }
    const previous = contracts.get(row.id);
    if (previous && (!stamp(row.updatedAt) || stamp(previous.updatedAt) >= stamp(row.updatedAt))) {
      conflicts.push({ kind: 'contract', key: row.id, reason: 'local-newer' }); continue;
    }
    contracts.set(row.id, row);
    contractCount++;
  }
  return {
    ok: true,
    checklists,
    tenders: [...byKey.values()],
    pastContracts: [...contracts.values()],
    checklistCount,
    decisionCount,
    contractCount,
    conflicts,
    unsigned: Boolean(signed.unsigned)
  };
}

export function auditEntry(kind, detail = {}, operator = '') {
  return {
    at: new Date().toISOString(),
    kind: String(kind || 'note').slice(0, 40),
    operator: String(operator || '').slice(0, 80),
    detail: String(detail.text || detail.message || JSON.stringify(detail)).slice(0, 400),
    key: String(detail.key || '').slice(0, 220)
  };
}
