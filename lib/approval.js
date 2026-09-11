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

export function applyApproval(tender = {}, operator = '', state = '', steps = 3) {
  const name = String(operator || '').trim();
  const need = Number(steps) === 2 ? 2 : 3;
  const cur = approvalOf(tender);
  const next = { ...tender };
  if (state !== 'GO') {
    if (state === 'NO_GO' || state === 'NEW') {
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
  if (!name) {
    return { tender: next, ok: true, message: 'Chưa đặt tên người dùng — Go ghi một mình.' };
  }
  if (!cur.proposedBy) {
    next.decisionProposedBy = name;
    next.decisionProposedAt = new Date().toISOString();
    next.decisionState = 'GO';
    return { tender: next, ok: true, message: `Đề xuất Go bởi ${name}. Chờ kỹ thuật xác nhận.` };
  }
  if (need === 3 && !cur.techBy) {
    if (cur.proposedBy === name) return { tender: next, ok: false, message: `${name} đã đề xuất. Cần người kỹ thuật khác.` };
    next.decisionTechBy = name;
    next.decisionTechAt = new Date().toISOString();
    next.decisionState = 'GO';
    return { tender: next, ok: true, message: `Kỹ thuật ${name} đã xác nhận. Chờ giám đốc.` };
  }
  const last = cur.confirmedBy;
  if (last) return { tender: next, ok: true, message: `Đã đủ chữ ký (${cur.proposedBy} → ${cur.techBy || cur.proposedBy} → ${last}).` };
  const blocked = [cur.proposedBy, need === 3 ? cur.techBy : ''].filter(Boolean);
  if (blocked.includes(name)) {
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
