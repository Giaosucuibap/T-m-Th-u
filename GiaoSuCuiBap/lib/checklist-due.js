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
  if (hours === null || hours <= 0) return [];
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

/** Không suy ra cửa sổ hợp đồng từ loại việc. Người dùng nhập theo HSMT. */
export function contractWindowYears(workType = '', category = '', configured = null) {
  const n = Number(configured);
  return Number.isInteger(n) && n >= 1 && n <= 30 ? n : null;
}

export function contractYearsLeft(contract = {}, now = Date.now(), windowYears) {
  const year = Number(contract.year);
  if (!Number.isFinite(year) || year < 2000) return null;
  const years = contractWindowYears('', '', windowYears ?? contract.windowYears);
  if (!years) return null;
  const end = Date.UTC(year + years, 11, 31);
  return (end - now) / 86400000;
}

export function contractExpiryAlert(contract = {}, now = Date.now()) {
  const years = contractWindowYears('', '', contract.windowYears);
  const days = contractYearsLeft(contract, now, years);
  if (days === null) return { ok: true, level: '', text: 'Chưa đặt mốc năm đối chiếu — xem yêu cầu cụ thể trong HSMT.', years };
  if (days < 0) return { ok: false, level: 'het', text: `HĐ vượt mốc nội bộ ${years} năm; đối chiếu ngày hoàn thành và yêu cầu HSMT.`, days, years };
  if (days <= 180) return { ok: false, level: 'gan', text: `Gần mốc nội bộ ${years} năm (ước tính theo cuối năm HĐ). Kiểm tra HSMT.`, days, years };
  return { ok: true, level: 'con', text: `Trong mốc nội bộ ${years} năm (ước tính theo cuối năm HĐ); chưa kết luận đạt HSMT.`, days, years };
}
