/** Tọa độ tham chiếu của các tỉnh đã có trong bảng. Không phải tọa độ công trình,
 * không suy mã tỉnh bằng các chữ số đầu của mã xã và không tự tạo tọa độ. */

export const PROVINCE_BY_CODE = Object.freeze({
  '01': { name: 'Hà Nội', lat: 21.03, lng: 105.85 },
  '79': { name: 'TP. Hồ Chí Minh', lat: 10.78, lng: 106.70 },
  '48': { name: 'Đà Nẵng', lat: 16.05, lng: 108.20 },
  '68': { name: 'Lâm Đồng', lat: 11.94, lng: 108.44 },
  '703': { name: 'Lâm Đồng (mã cũ)', lat: 11.94, lng: 108.44 },
  '75': { name: 'Đồng Nai', lat: 10.96, lng: 106.86 },
  '56': { name: 'Khánh Hòa', lat: 12.26, lng: 109.19 },
  '66': { name: 'Đắk Lắk', lat: 12.67, lng: 108.05 },
  '64': { name: 'Gia Lai', lat: 13.98, lng: 108.00 },
  '51': { name: 'Quảng Ngãi', lat: 15.12, lng: 108.80 },
  '60': { name: 'Bình Thuận', lat: 10.93, lng: 108.10 },
  '58': { name: 'Ninh Thuận', lat: 11.56, lng: 108.99 },
  '31': { name: 'Hải Phòng', lat: 20.84, lng: 106.69 },
  '92': { name: 'Cần Thơ', lat: 10.03, lng: 105.78 },
  '74': { name: 'Bình Dương', lat: 11.17, lng: 106.67 },
  '77': { name: 'Bà Rịa - Vũng Tàu', lat: 10.40, lng: 107.14 },
  '80': { name: 'Long An', lat: 10.54, lng: 106.41 },
  '87': { name: 'Đồng Tháp', lat: 10.49, lng: 105.69 },
  '89': { name: 'An Giang', lat: 10.52, lng: 105.13 },
  '91': { name: 'Kiên Giang', lat: 10.01, lng: 105.08 },
  '96': { name: 'Cà Mau', lat: 9.18, lng: 105.15 },
  '26': { name: 'Vĩnh Phúc', lat: 21.36, lng: 105.55 },
  '27': { name: 'Bắc Ninh', lat: 21.19, lng: 106.08 },
  '22': { name: 'Quảng Ninh', lat: 21.01, lng: 107.29 }
});

export function normalizeAreaCode(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{1,8}$/.test(raw)) return '';
  return raw.length === 1 ? raw.padStart(2, '0') : raw;
}

export function provinceCodeOf(tender = {}) {
  const direct = normalizeAreaCode(
    tender.provinceCode || tender.provCode || tender.areaProvCode
  );
  return direct;
}

export function coordsForCode(code, extra = {}) {
  const c = normalizeAreaCode(code);
  const base = PROVINCE_BY_CODE[c] || extra[c];
  if (!base) return null;
  const { lat, lng, name } = base;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, name: name || c, code: c, provinceCode: c, approximate: true };
}

const fold = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const coreName = (value) => fold(value).replace(/^(?:tinh|thanh pho|tp)\s+/, '').replace(/ ma cu$/, '');

export function lookupAreaCode(tender, areas = []) {
  const fromTender = provinceCodeOf(tender);
  if (fromTender) return fromTender;
  const exact = normalizeAreaCode(tender.wardCode || tender.districtCode || tender.areaCode || tender.locationCode);
  const byCode = (areas || []).find((a) => normalizeAreaCode(a.code) === exact);
  if (byCode) return normalizeAreaCode(byCode.parentCode || byCode.code);
  const hay = ` ${fold(tender.provinceName || tender.location)} `;
  const candidates = (areas || []).filter((a) => a?.name && !a.parentCode);
  const hits = candidates.filter((a) => hay.includes(` ${coreName(a.name)} `));
  if (hits.length && new Set(hits.map((a) => coreName(a.name))).size === 1 && hay.endsWith(` ${coreName(hits[0].name)} `)) return normalizeAreaCode(hits[0].code);
  const fallback = Object.entries(PROVINCE_BY_CODE).filter(([, a]) => hay.includes(` ${coreName(a.name)} `));
  if (fallback.length && new Set(fallback.map(([, a]) => coreName(a.name))).size === 1 && hay.endsWith(` ${coreName(fallback[0][1].name)} `)) {
    return fallback.find(([code]) => code.length === 2)?.[0] || fallback[0][0];
  }
  return '';
}
