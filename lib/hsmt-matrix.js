/** Ma trận HĐ tương tự × cửa năng lực HSMT (không đọc file HSMT thật). */

export const HSMT_GATES = Object.freeze([
  { id: 'similar', label: 'HĐ tương tự (cùng loại việc)' },
  { id: 'staff', label: 'Nhân sự chủ chốt' },
  { id: 'equip', label: 'Thiết bị thi công' },
  { id: 'finance', label: 'Năng lực tài chính / doanh thu' }
]);

function flag(value) {
  if (value === true || value === 'dat' || value === 'yes' || value === '1') return 'dat';
  if (value === false || value === 'thieu' || value === 'no' || value === '0') return 'thieu';
  return 'chua';
}

export function normalizeGates(raw = {}) {
  return Object.fromEntries(HSMT_GATES.map((g) => [g.id, flag(raw[g.id])]));
}

export function matrixCell(status, gateLabel) {
  if (status === 'dat') return `Đạt · ${gateLabel}`;
  if (status === 'thieu') return `Thiếu · ${gateLabel}`;
  return `Chưa khai · ${gateLabel}`;
}

export function contractMatrix(contract = {}, tender = {}) {
  const gates = normalizeGates(contract.gates || contract);
  const typeHit = Boolean(contract.workType && tender.workType && contract.workType === tender.workType);
  if (typeHit && gates.similar === 'chua') gates.similar = 'dat';
  if (!typeHit && contract.workType && tender.workType) gates.similar = gates.similar === 'dat' ? 'dat' : 'thieu';
  return HSMT_GATES.map((g) => ({
    id: g.id,
    label: g.label,
    status: gates[g.id],
    text: matrixCell(gates[g.id], g.label)
  }));
}

export function matrixSummary(rows = []) {
  const dat = rows.filter((r) => r.status === 'dat').length;
  const thieu = rows.filter((r) => r.status === 'thieu').length;
  if (thieu) return { level: 'thieu', text: `Thiếu ${thieu} cửa HSMT` };
  if (dat === rows.length && rows.length) return { level: 'dat', text: 'Đủ các cửa đã khai' };
  return { level: 'chua', text: 'Chưa đủ dữ liệu cửa HSMT' };
}
