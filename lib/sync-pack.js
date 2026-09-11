import { hmacSha256Hex } from './hmac.js';

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
  const decisions = (state.tenders || []).filter((t) => t.decisionState && t.decisionState !== 'NEW')
    .map((t) => ({
      key: t.key,
      notifyNo: t.notifyNo,
      bidName: t.bidName,
      decisionState: t.decisionState,
      decisionOwner: t.decisionOwner || '',
      decisionProposedBy: t.decisionProposedBy || '',
      decisionConfirmedBy: t.decisionConfirmedBy || ''
    }));
  const pack = {
    source: 'GiaoSuCuiBap',
    version: '4.8.0',
    exportedAt: new Date().toISOString(),
    operator: state.settings?.operatorName || '',
    checklists: state.checklists || {},
    decisions,
    pastContracts: state.pastContracts || []
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
  const checklists = { ...(current.checklists || {}) };
  let checklistCount = 0;
  for (const [key, row] of Object.entries(pack.checklists || {})) {
    const prev = checklists[key];
    if (prev?.owner && row?.owner && prev.owner !== row.owner && prev.updatedAt > (row.updatedAt || '')) continue;
    checklists[key] = { ...row, importedAt: new Date().toISOString(), importedBy: operator };
    checklistCount += 1;
  }
  const byKey = new Map((current.tenders || []).map((t) => [t.key, { ...t }]));
  let decisionCount = 0;
  for (const d of pack.decisions || []) {
    if (!d?.key || !byKey.has(d.key)) continue;
    const t = byKey.get(d.key);
    if (t.decisionOwner && d.decisionOwner && t.decisionOwner !== d.decisionOwner && !d.force) continue;
    byKey.set(d.key, { ...t, ...d });
    decisionCount += 1;
  }
  return {
    ok: true,
    checklists,
    tenders: [...byKey.values()],
    pastContracts: [...(pack.pastContracts || []), ...(current.pastContracts || [])],
    checklistCount,
    decisionCount
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
