/** Mã tỉnh e-GP (cũ 63 + một số mã sau sáp nhập) → tọa độ gần đúng. */

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
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 5) return digits.slice(0, 5);
  if (digits.length >= 3) return digits.slice(0, 3);
  if (digits.length === 1) return digits.padStart(2, '0');
  return digits.slice(0, 2);
}

export function provinceCodeOf(tender = {}) {
  const direct = normalizeAreaCode(
    tender.provinceCode || tender.provCode || tender.areaCode || tender.locationCode || tender.areaProvCode
  );
  if (PROVINCE_BY_CODE[direct]) return direct;
  if (direct.length >= 2 && PROVINCE_BY_CODE[direct.slice(0, 2)]) return direct.slice(0, 2);
  if (direct.length >= 2) return direct.slice(0, 2);
  return '';
}

export function coordsForCode(code, extra = {}) {
  const c = normalizeAreaCode(code);
  const prov = c.slice(0, 2);
  const base = PROVINCE_BY_CODE[c] || extra[c] || PROVINCE_BY_CODE[prov] || extra[prov];
  if (!base) return null;
  let { lat, lng, name } = base;
  if (c.length >= 3) {
    const n = Number(c.slice(2)) || c.length;
    lat += ((n % 7) - 3) * 0.06;
    lng += ((n % 5) - 2) * 0.06;
  }
  return { lat, lng, name: name || prov, code: c, provinceCode: prov };
}

export function lookupAreaCode(tender, areas = []) {
  const fromTender = provinceCodeOf(tender);
  if (fromTender) return fromTender;
  const hay = String(tender.location || tender.provinceName || '').toLowerCase();
  for (const area of areas || []) {
    if (area?.code && area?.name && hay.includes(String(area.name).toLowerCase())) {
      return normalizeAreaCode(area.code).slice(0, 2);
    }
  }
  return '';
}
