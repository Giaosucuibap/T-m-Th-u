import { similarWorkType } from './capability.js';
import { normalizeGates } from './hsmt-matrix.js';

function fold(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function normalizeContract(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const name = String(raw.name || raw.bidName || '').trim().slice(0, 240);
  const workType = raw.workType || similarWorkType(name);
  const price = Number(raw.price);
  const year = Number(raw.year);
  if (!name || name.length < 4) return null;
  return {
    id: String(raw.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80),
    name,
    workType: String(workType || '').slice(0, 40),
    price: Number.isFinite(price) && price > 0 ? Math.round(price) : 0,
    year: Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : 0,
    province: String(raw.province || '').trim().slice(0, 80),
    note: String(raw.note || '').trim().slice(0, 400),
    windowYears: Number.isInteger(Number(raw.windowYears)) && Number(raw.windowYears) >= 1 && Number(raw.windowYears) <= 30 ? Number(raw.windowYears) : null,
    updatedAt: Number.isFinite(Date.parse(raw.updatedAt)) ? new Date(raw.updatedAt).toISOString() : '',
    gates: normalizeGates(raw.gates || raw)
  };
}

export function safeContracts(raw) {
  const ids = new Set();
  return (Array.isArray(raw) ? raw : []).flatMap((item) => {
    const row = normalizeContract(item);
    if (!row) return [];
    let nextId = row.id || `hd-${ids.size + 1}`;
    let suffix = 1;
    while (ids.has(nextId)) nextId = `${row.id || 'hd'}-${++suffix}`;
    row.id = nextId;
    ids.add(row.id);
    return [row];
  });
}

export function matchContract(tender = {}, contract = {}) {
  const tenderType = similarWorkType(tender.bidName || tender.projectName || '');
  const typeOk = Boolean(tenderType && contract.workType && tenderType === contract.workType)
    || (contract.name && fold(tender.bidName || '').includes(fold(contract.name).slice(0, 18)));
  const price = Number(tender.price);
  let priceOk = null;
  if (contract.price && Number.isFinite(price) && price > 0) {
    priceOk = price <= contract.price * 1.5 && price >= contract.price * 0.25;
  }
  let status = 'chua';
  if (typeOk && priceOk) status = 'dat';
  else if (typeOk && priceOk === false) status = 'thieu';
  else if (!typeOk && contract.workType) status = 'lech-loai';
  return { status, typeOk, priceOk, tenderType, contract };
}

export function bestContractMatch(tender, contracts = []) {
  const rows = (contracts || []).map((c) => matchContract(tender, c));
  const dat = rows.find((r) => r.status === 'dat');
  if (dat) return dat;
  return rows.find((r) => r.typeOk) || rows[0] || { status: 'chua', typeOk: false, priceOk: null, tenderType: similarWorkType(tender.bidName || ''), contract: null };
}

export const MATCH_LABEL = Object.freeze({
  dat: 'Gợi ý HĐ gần loại việc · cần đối chiếu HSMT',
  thieu: 'Quy mô HĐ khác khoảng tham khảo',
  chua: 'Chưa đủ dữ liệu so HĐ tương tự',
  'lech-loai': 'Chưa khớp loại việc trong kho HĐ'
});
