import { coordsForCode, lookupAreaCode, provinceCodeOf } from './province-codes.js';

/** Bản đồ nhiệt huyện/tỉnh trên kho gói đã lưu tại máy. */

function fold(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

const DISTRICT_RE = /(?:huyen|thi xa|thanh pho|tp\.?|quan|thi tran)\s+([a-z0-9 ]{2,40})/i;

const PROV_XY = {
  'lam dong': [11.94, 108.44],
  'dong nai': [10.96, 106.86],
  'khanh hoa': [12.26, 109.19],
  'dak lak': [12.67, 108.05],
  'gia lai': [13.98, 108.0],
  'quang ngai': [15.12, 108.8],
  'binh thuan': [10.93, 108.1],
  'ninh thuan': [11.56, 108.99],
  'ho chi minh': [10.78, 106.7],
  'ha noi': [21.03, 105.85]
};

export function flattenAreas(areas) {
  if (!areas) return [];
  if (Array.isArray(areas)) return areas;
  const provinces = areas.provinces || [];
  const wards = Object.values(areas.wardsByProvince || {}).flat();
  return [...provinces, ...wards];
}

export function parentCodeOf(tender = {}, areas) {
  const list = flattenAreas(areas);
  const code = String(tender.wardCode || tender.areaCode || tender.districtCode || '').trim();
  const hit = list.find((a) => a.code === code);
  return hit?.parentCode || tender.parentCode || '';
}

export function placeOf(tender = {}, areas = []) {
  const raw = String(tender.location || tender.executionLocation || '');
  const folded = fold(raw);
  const m = folded.match(DISTRICT_RE);
  const district = m ? m[0].trim() : '';
  const province = String(raw).split(/[,-]/).map((x) => x.trim()).filter(Boolean).slice(-1)[0] || raw;
  const parent = parentCodeOf(tender, areas);
  const list = flattenAreas(areas);
  const code = lookupAreaCode(tender, list) || parent || provinceCodeOf(tender);
  const byCode = coordsForCode(tender.wardCode || tender.districtCode || parent || code);
  let lat = 16.0, lng = 107.5;
  if (byCode) { lat = byCode.lat; lng = byCode.lng; }
  else {
    for (const [name, xy] of Object.entries(PROV_XY)) {
      if (folded.includes(name) || fold(province).includes(name)) { [lat, lng] = xy; break; }
    }
  }
  if (district && !tender.wardCode) {
    lat += ((district.length % 7) - 3) * 0.08;
    lng += ((district.length % 5) - 2) * 0.08;
  }
  return {
    district: district || fold(province) || code || 'chua-ro',
    province: byCode?.name || province || 'Chưa rõ',
    raw,
    lat,
    lng,
    code: code || ''
  };
}

export function districtHeat(tenders = [], areas = []) {
  const map = new Map();
  for (const t of tenders || []) {
    const place = placeOf(t, areas);
    const key = place.code || place.district || fold(place.province);
    const cur = map.get(key) || { key, label: place.raw || place.province, province: place.province, count: 0, value: 0, open: 0, lat: place.lat, lng: place.lng, tenders: [] };
    cur.count += 1;
    const price = Number(t.price);
    if (Number.isFinite(price)) cur.value += price;
    if (t.status === 'OPEN' || (!t.notifyNo ? false : Date.parse(t.closeDate) > Date.now())) cur.open += 1;
    if ((place.raw || '').length > cur.label.length) cur.label = place.raw;
    if (cur.tenders.length < 30) {
      cur.tenders.push({ key: t.key, bidName: t.bidName, notifyNo: t.notifyNo, price: t.price, closeDate: t.closeDate });
    }
    map.set(key, cur);
  }
  const rows = [...map.values()].sort((a, b) => b.count - a.count);
  const max = rows[0]?.count || 1;
  return rows.map((row) => ({ ...row, heat: row.count / max }));
}

export function heatBar(heat) {
  const n = Math.max(0, Math.min(1, Number(heat) || 0));
  return Math.round(n * 12);
}
