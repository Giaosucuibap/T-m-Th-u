/** Mức tự rà soát do người dùng khai; không xác nhận đạt tiêu chí một HSMT. */

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
  raw = raw && typeof raw === 'object' ? raw : {};
  return Object.fromEntries(HSMT_GATES.map((g) => [g.id, flag(raw[g.id])]));
}

export function matrixCell(status, gateLabel) {
  if (status === 'dat') return `Đã tự rà soát · ${gateLabel}`;
  if (status === 'thieu') return `Cần bổ sung · ${gateLabel}`;
  return `Chưa khai · ${gateLabel}`;
}

export function contractMatrix(contract = {}, tender = {}) {
  const gates = normalizeGates(contract.gates || contract);
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
  if (thieu) return { level: 'thieu', text: `Cần bổ sung ${thieu} mục tự rà soát` };
  if (dat === rows.length && rows.length) return { level: 'dat', text: 'Đã tự rà soát các mục · cần đối chiếu HSMT' };
  return { level: 'chua', text: 'Chưa khai đủ các mục tự rà soát' };
}
