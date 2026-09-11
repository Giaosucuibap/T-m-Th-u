import { similarWorkType } from './capability.js';

function fold(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function normalizeContract(raw = {}) {
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
    gates: {
      similar: raw.gates?.similar || raw.similar || 'chua',
      staff: raw.gates?.staff || raw.staff || 'chua',
      equip: raw.gates?.equip || raw.equip || 'chua',
      finance: raw.gates?.finance || raw.finance || 'chua'
    }
  };
}

export function safeContracts(raw) {
  const ids = new Set();
  return (Array.isArray(raw) ? raw : []).slice(0, 20).flatMap((item) => {
    const row = normalizeContract(item);
    if (!row) return [];
    row.id = row.id && !ids.has(row.id) ? row.id : `hd-${ids.size + 1}`;
    ids.add(row.id);
    return [row];
  });
}

export function matchContract(tender = {}, contract = {}) {
  const tenderType = similarWorkType(tender.bidName || tender.projectName || '');
  const typeOk = Boolean(tenderType && contract.workType && tenderType === contract.workType)
    || (contract.name && fold(tender.bidName || '').includes(fold(contract.name).slice(0, 18)));
  const price = Number(tender.price);
  let priceOk = true;
  if (contract.price && Number.isFinite(price) && price > 0) {
    priceOk = price <= contract.price * 1.5 && price >= contract.price * 0.25;
  }
  let status = 'thieu';
  if (typeOk && priceOk) status = 'dat';
  else if (!typeOk && contract.workType) status = 'lech-loai';
  return { status, typeOk, priceOk, tenderType, contract };
}

export function bestContractMatch(tender, contracts = []) {
  const rows = (contracts || []).map((c) => matchContract(tender, c));
  const dat = rows.find((r) => r.status === 'dat');
  if (dat) return dat;
  const lech = rows.find((r) => r.status === 'lech-loai');
  if (lech) return lech;
  return rows[0] || { status: 'thieu', typeOk: false, priceOk: false, tenderType: similarWorkType(tender.bidName || ''), contract: null };
}

export const MATCH_LABEL = Object.freeze({
  dat: 'Đạt HĐ tương tự',
  thieu: 'Thiếu HĐ tương tự',
  'lech-loai': 'Lệch loại việc'
});
