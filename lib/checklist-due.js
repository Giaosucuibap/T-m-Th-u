import { checklistItemsFor, checklistProgress } from './capability.js';

/** Số giờ trước đóng thầu mà mục nên được tick. */
export const CHECKLIST_HOURS_BEFORE = Object.freeze({
  hsmt: 120,
  lamro: 96,
  baodam: 48,
  tuongtu: 72,
  nhansu: 48,
  thietbi: 48,
  gia: 24,
  nop: 6,
  bienphap: 36,
  bave: 36,
  chungchi: 72,
  nhatky: 48
});

export function hoursLeft(closeDate, now = Date.now()) {
  const t = Date.parse(closeDate || '');
  if (!Number.isFinite(t)) return null;
  return (t - now) / 36e5;
}

export function checklistDueItems(tender = {}, state = {}, category = '', now = Date.now()) {
  const hours = hoursLeft(tender.closeDate, now);
  if (hours === null) return [];
  const list = checklistItemsFor(category || tender.category || '');
  const progress = checklistProgress(state, category || tender.category || '');
  return list.filter((item) => {
    if (progress.items[item.id]) return false;
    const need = CHECKLIST_HOURS_BEFORE[item.id];
    if (!need) return false;
    return hours <= need;
  }).map((item) => ({
    ...item,
    hoursLeft: Math.round(hours),
    dueHours: CHECKLIST_HOURS_BEFORE[item.id]
  }));
}

/** Xây lắp / hỗn hợp: 5 năm. Tư vấn, hàng hóa, phi tư vấn: 3 năm. */
export function contractWindowYears(workType = '', category = '') {
  const w = String(workType || category || '').toLowerCase();
  if (w.includes('thuy') || w.includes('giao') || w.includes('cap-') || w.includes('ke-') || w.includes('dan-') || w === 'xl' || w.includes('xay')) return 5;
  if (w.includes('tv') || w.includes('tu-van') || w === 'hh' || w === 'ptv' || w.includes('tu van')) return 3;
  return 5;
}

export function contractYearsLeft(contract = {}, now = Date.now(), windowYears) {
  const year = Number(contract.year);
  if (!Number.isFinite(year) || year < 2000) return null;
  const years = windowYears || contractWindowYears(contract.workType, contract.category);
  const end = Date.UTC(year + years, 11, 31);
  return (end - now) / 86400000;
}

export function contractExpiryAlert(contract = {}, now = Date.now()) {
  const years = contractWindowYears(contract.workType, contract.category);
  const days = contractYearsLeft(contract, now, years);
  if (days === null) return { ok: true, level: '', text: 'Chưa có năm HĐ', years };
  if (days < 0) return { ok: false, level: 'het', text: `HĐ đã quá ${years} năm — không dùng làm tương tự`, days, years };
  if (days <= 180) return { ok: false, level: 'gan', text: `HĐ còn khoảng ${Math.floor(days)} ngày nữa là đủ ${years} năm`, days, years };
  return { ok: true, level: 'con', text: `Còn ${Math.floor(days)} ngày trong cửa sổ ${years} năm`, days, years };
}
