import { coordsForCode, lookupAreaCode, normalizeAreaCode } from './province-codes.js';

/** Counts are aggregated at province level. A reference point never represents
 * the location of an individual project. Unresolved locations remain unplotted. */
export function flattenAreas(areas) {
  if (!areas) return [];
  if (Array.isArray(areas)) return areas;
  return [...(areas.provinces || []), ...Object.values(areas.wardsByProvince || {}).flat()];
}

export function parentCodeOf(tender = {}, areas) {
  const list = flattenAreas(areas);
  let code = normalizeAreaCode(tender.wardCode || tender.areaCode || tender.districtCode);
  const visited = new Set();
  while (code && !visited.has(code)) {
    visited.add(code);
    const hit = list.find((a) => normalizeAreaCode(a.code) === code);
    if (!hit?.parentCode) break;
    code = normalizeAreaCode(hit.parentCode);
  }
  return visited.size > 1 ? code : normalizeAreaCode(tender.parentCode);
}

export function placeOf(tender = {}, areas = []) {
  const raw = String(tender.location || tender.executionLocation || tender.provinceName || '');
  const parent = parentCodeOf(tender, areas);
  const code = parent || lookupAreaCode({ ...tender, location: raw }, flattenAreas(areas));
  const point = coordsForCode(code);
  const areaName = flattenAreas(areas).find((a) => normalizeAreaCode(a.code) === code)?.name;
  return {
    district: '', province: point?.name || areaName || 'Chưa xác định tỉnh', raw,
    lat: point?.lat ?? null, lng: point?.lng ?? null, code: code || '',
    approximate: Boolean(point), mapped: Boolean(point)
  };
}

export function districtHeat(tenders = [], areas = []) {
  const groups = new Map(), seen = new Set();
  for (const t of tenders || []) {
    const identity = t.key || (t.notifyNo ? `${t.notifyNo}::${t.version || '00'}` : '');
    if (identity && seen.has(identity)) continue;
    if (identity) seen.add(identity);
    const place = placeOf(t, areas);
    // Legacy/current codes sharing one reference point form one province group.
    const key = place.mapped ? `point:${place.lat}:${place.lng}` : 'unmapped';
    const cur = groups.get(key) || {
      key, label: place.mapped ? place.province.replace(/ \(mã cũ\)$/, '') : 'Chưa có tọa độ tỉnh đối chiếu',
      province: place.province, count: 0, value: 0, knownPrices: 0, open: 0,
      lat: place.lat, lng: place.lng, mapped: place.mapped, approximate: place.approximate, tenders: []
    };
    cur.count += 1;
    const price = Number(t.price);
    if (Number.isFinite(price) && price > 0) { cur.value += price; cur.knownPrices += 1; }
    if (t.notifyNo && Date.parse(t.closeDate) > Date.now()) cur.open += 1;
    if (cur.tenders.length < 30) cur.tenders.push({ key: t.key, bidName: t.bidName, notifyNo: t.notifyNo, price: t.price, closeDate: t.closeDate });
    groups.set(key, cur);
  }
  const rows = [...groups.values()].sort((a, b) => b.count - a.count);
  const max = rows[0]?.count || 1;
  return rows.map((row) => ({ ...row, heat: row.count / max }));
}

export function heatBar(heat) {
  return Math.round(Math.max(0, Math.min(1, Number(heat) || 0)) * 12);
}
