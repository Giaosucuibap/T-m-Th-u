/** Hồ sơ năng lực công ty — chấm điểm bổ sung, không thay thế tiêu chí e-GP. */

function fold(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function lines(value) {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  return String(value ?? '').split(/\r?\n|;/).map((x) => x.trim()).filter(Boolean);
}

export function normalizeCapability(raw = {}) {
  const trades = lines(raw.trades).slice(0, 40);
  const equipment = lines(raw.equipment).slice(0, 40);
  const staff = lines(raw.staff).slice(0, 20);
  const avoid = lines(raw.avoidProvinces).slice(0, 20);
  const maxComfort = Number(raw.maxComfortPrice);
  return {
    trades,
    equipment,
    staff,
    avoidProvinces: avoid,
    maxComfortPrice: Number.isFinite(maxComfort) && maxComfort > 0 ? Math.round(maxComfort) : 0,
    notes: String(raw.notes || '').trim().slice(0, 2000)
  };
}

export function capabilityHaystack(tender = {}) {
  return fold([tender.bidName, tender.projectName, tender.fieldRaw, tender.location, tender.rawText]
    .filter(Boolean).join(' '));
}

export function applyCapability(tender = {}, capability = {}) {
  const cap = normalizeCapability(capability);
  const hay = capabilityHaystack(tender);
  const reasons = [];
  let delta = 0;
  if (!hay && !tender.price) return { delta: 0, reasons, hits: [] };

  const tradeHits = cap.trades.filter((t) => hay.includes(fold(t)));
  if (tradeHits.length) {
    delta += Math.min(10, tradeHits.length * 3);
    reasons.push(`Khớp nghề công ty: ${tradeHits.slice(0, 3).join(', ')}`);
  } else if (cap.trades.length) {
    delta -= 4;
    reasons.push('Chưa thấy nghề đã khai trong tên gói công khai');
  }

  const equipHits = cap.equipment.filter((t) => hay.includes(fold(t)));
  if (equipHits.length) {
    delta += Math.min(4, equipHits.length * 2);
    reasons.push(`Gợi ý thiết bị: ${equipHits.slice(0, 2).join(', ')}`);
  }

  const avoidHits = cap.avoidProvinces.filter((p) => hay.includes(fold(p)) || fold(tender.location || '').includes(fold(p)));
  if (avoidHits.length) {
    delta -= 12;
    reasons.push(`Địa bàn đang tránh: ${avoidHits.slice(0, 2).join(', ')}`);
  }

  if (cap.maxComfortPrice && Number.isFinite(Number(tender.price)) && Number(tender.price) > cap.maxComfortPrice) {
    delta -= 8;
    reasons.push('Giá gói vượt trần tự tin của công ty');
  }

  return { delta: Math.max(-15, Math.min(12, delta)), reasons, hits: tradeHits };
}

export const CHECKLIST_ITEMS = Object.freeze([
  { id: 'hsmt', label: 'Đã tải và đọc HSMT' },
  { id: 'lamro', label: 'Đã làm rõ HSMT (nếu cần)' },
  { id: 'baodam', label: 'Đủ bảo đảm dự thầu' },
  { id: 'tuongtu', label: 'Có hợp đồng tương tự' },
  { id: 'nhansu', label: 'Bố trí nhân sự chủ chốt' },
  { id: 'thietbi', label: 'Bố trí thiết bị thi công' },
  { id: 'gia', label: 'Đã lập giá dự thầu' },
  { id: 'nop', label: 'Sẵn sàng nộp trên e-GP' }
]);

export const CHECKLIST_XL_EXTRA = Object.freeze([
  { id: 'bienphap', label: 'Thuyết minh biện pháp thi công' },
  { id: 'bave', label: 'Đã rà bản vẽ / khối lượng' }
]);

export const CHECKLIST_TVGS_EXTRA = Object.freeze([
  { id: 'chungchi', label: 'Chứng chỉ hành nghề giám sát' },
  { id: 'nhatky', label: 'Mẫu nhật ký / biên bản giám sát' }
]);

export function checklistItemsFor(category = '') {
  const extra = category === 'TV_SUPERVISION' || category === 'TV'
    ? CHECKLIST_TVGS_EXTRA
    : category === 'XL' || category === 'HON_HOP'
      ? CHECKLIST_XL_EXTRA
      : [];
  return [...CHECKLIST_ITEMS, ...extra];
}

export function emptyChecklist(category = '') {
  return Object.fromEntries(checklistItemsFor(category).map((item) => [item.id, false]));
}

export function checklistProgress(state = {}, category = '') {
  const list = checklistItemsFor(category);
  const items = { ...emptyChecklist(category), ...(state.items || state) };
  const total = list.length;
  const done = list.filter((item) => items[item.id]).length;
  return { items, total, done, ratio: done / total, owner: state.owner || '', category };
}

export function similarWorkType(name = '') {
  const hay = fold(name);
  const types = [
    ['thuy-loi', ['thuy loi', 'kenh', 'kenh muong', 'ho chua', 'dap', 'tram bom', 'nao vet']],
    ['giao-thong', ['duong giao thong', 'duong betong', 'duong nhua', 'cau ', 'cong ', 'duong noi']],
    ['cap-thoat', ['cap nuoc', 'thoat nuoc', 'cong thoat', 'tram xu ly']],
    ['ke-bo', ['ke bo', 'ke song', 'chong sat lo']],
    ['dan-dung', ['truong hoc', 'tram y te', 'nha van hoa', 'tru so']]
  ];
  for (const [key, words] of types) {
    if (words.some((w) => hay.includes(w.trim()))) return key;
  }
  return '';
}
