/** Chuỗi duyệt: đề xuất → kỹ thuật → giám đốc. */

export function approvalOf(tender = {}) {
  return {
    proposedBy: String(tender.decisionProposedBy || '').trim(),
    proposedAt: tender.decisionProposedAt || '',
    techBy: String(tender.decisionTechBy || '').trim(),
    techAt: tender.decisionTechAt || '',
    confirmedBy: String(tender.decisionConfirmedBy || tender.decisionDirectorBy || '').trim(),
    confirmedAt: tender.decisionConfirmedAt || tender.decisionDirectorAt || ''
  };
}

const identity = (value) => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
const APPROVAL_FIELDS = ['decisionProposedBy', 'decisionProposedAt', 'decisionTechBy', 'decisionTechAt', 'decisionConfirmedBy', 'decisionConfirmedAt', 'decisionDirectorBy', 'decisionDirectorAt'];

export function applyApproval(tender = {}, operator = '', state = '', steps = 1) {
  const name = String(operator || '').trim();
  const need = [2, 3].includes(Number(steps)) ? Number(steps) : 1;
  const cur = approvalOf(tender);
  const next = { ...tender, decisionState: state };
  if (state !== 'GO') {
    if (state !== 'GO') {
      next.decisionProposedBy = '';
      next.decisionProposedAt = '';
      next.decisionTechBy = '';
      next.decisionTechAt = '';
      next.decisionConfirmedBy = '';
      next.decisionConfirmedAt = '';
      next.decisionDirectorBy = '';
      next.decisionDirectorAt = '';
    }
    return { tender: next, ok: true, message: '' };
  }
  if (need === 1) {
    for (const field of APPROVAL_FIELDS) next[field] = '';
    next.decisionState = 'GO';
    return { tender: next, ok: true, message: 'Đã ghi quyết định Go cá nhân.' };
  }
  if (!name) {
    return { tender: { ...tender }, ok: false, message: 'Đặt tên người dùng trước khi ghi bước duyệt nội bộ.' };
  }
  const clearConfirmation = () => {
    for (const field of ['decisionConfirmedBy', 'decisionConfirmedAt', 'decisionDirectorBy', 'decisionDirectorAt']) next[field] = '';
    cur.confirmedBy = ''; cur.confirmedAt = '';
  };
  // Moving from two steps to three requires a fresh final confirmation after
  // technical review. A former two-step confirmation cannot serve both roles.
  if (need === 3 && !cur.techBy) clearConfirmation();
  if (need === 3 && cur.techBy && identity(cur.techBy) === identity(cur.proposedBy)) {
    next.decisionTechBy = ''; next.decisionTechAt = '';
    cur.techBy = ''; cur.techAt = '';
    clearConfirmation();
  }
  if (cur.confirmedBy && [cur.proposedBy, ...(need === 3 ? [cur.techBy] : [])]
    .filter(Boolean).some((previous) => identity(previous) === identity(cur.confirmedBy))) clearConfirmation();
  if (!cur.proposedBy) {
    next.decisionProposedBy = name;
    next.decisionProposedAt = new Date().toISOString();
    next.decisionState = 'GO';
    return { tender: next, ok: true, message: `Đề xuất Go bởi ${name}. Chờ ${need === 3 ? 'kỹ thuật' : 'người thứ hai'} xác nhận.` };
  }
  if (need === 3 && !cur.techBy) {
    if (identity(cur.proposedBy) === identity(name)) return { tender: next, ok: false, message: `${name} đã đề xuất. Cần người kỹ thuật khác.` };
    next.decisionTechBy = name;
    next.decisionTechAt = new Date().toISOString();
    next.decisionState = 'GO';
    return { tender: next, ok: true, message: `Kỹ thuật ${name} đã xác nhận. Chờ giám đốc.` };
  }
  const last = cur.confirmedBy;
  if (last) return { tender: next, ok: true, message: `Đã đủ bước xác nhận nội bộ (${[cur.proposedBy, cur.techBy, last].filter(Boolean).join(' → ')}).` };
  const blocked = [cur.proposedBy, need === 3 ? cur.techBy : ''].filter(Boolean);
  if (blocked.some((previous) => identity(previous) === identity(name))) {
    return { tender: next, ok: false, message: `${name} đã ký bước trước. Cần người khác hoàn tất.` };
  }
  next.decisionConfirmedBy = name;
  next.decisionConfirmedAt = new Date().toISOString();
  next.decisionDirectorBy = name;
  next.decisionDirectorAt = next.decisionConfirmedAt;
  next.decisionState = 'GO';
  return { tender: next, ok: true, message: `Giám đốc ${name} đã duyệt đề xuất của ${cur.proposedBy}.` };
}

export function approvalLabel(tender = {}) {
  const a = approvalOf(tender);
  if (tender.decisionState !== 'GO') return '';
  const names = [a.proposedBy, a.techBy, a.confirmedBy].filter(Boolean).map(identity);
  if (new Set(names).size !== names.length) return 'Go cần rà soát lại: trùng người xác nhận';
  if (a.proposedBy && a.techBy && a.confirmedBy) return `Go 3 bước (${a.proposedBy} → ${a.techBy} → ${a.confirmedBy})`;
  if (a.proposedBy && a.confirmedBy) return `Go đã duyệt (${a.proposedBy} → ${a.confirmedBy})`;
  if (a.proposedBy && a.techBy) return `Go chờ giám đốc (KT: ${a.techBy})`;
  if (a.proposedBy) return `Go chờ kỹ thuật (đề xuất: ${a.proposedBy})`;
  return 'Go một người';
}

export function approvalSignature(operator, at = new Date().toISOString()) {
  const raw = `${operator}|${at}`;
  let n = 0;
  for (const ch of raw) n = ((n << 5) - n + ch.charCodeAt(0)) | 0;
  return `GSCB-${Math.abs(n).toString(16).toUpperCase()}`;
}
