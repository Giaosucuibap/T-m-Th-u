/** Province identity is exact. Never derive a province by truncating a ward code,
 * and never interpret an unrecognised selection as a nationwide request. */
function fold(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
const coreName = value => fold(value).replace(/^(?:tinh|thanh pho|tp)\s+/, '').replace(/\s+ma cu$/, '');
const code = value => /^\d{1,3}$/.test(String(value ?? '').trim()) ? String(value).trim().padStart(2, '0') : '';
const unique = items => [...new Set(items.filter(Boolean))];
const array = value => Array.isArray(value) ? value : value == null ? [] : [value];
const names = value => array(value).flatMap(v => String(v ?? '').split(/[;,|\n]+/)).map(v => v.trim()).filter(Boolean);

// Known numeric identities. A current/legacy e-GP catalog is preferred below;
// this fallback does not infer that a former province belongs to a new one.
export const NAME_TO_CODES = Object.freeze(Object.fromEntries([
  ['ha noi','01'],['ha giang','02'],['cao bang','04'],['bac kan','06'],['tuyen quang','08'],
  ['lao cai','10'],['dien bien','11'],['lai chau','12'],['son la','14'],['yen bai','15'],
  ['hoa binh','17'],['thai nguyen','19'],['lang son','20'],['quang ninh','22'],['bac giang','24'],
  ['phu tho','25'],['vinh phuc','26'],['bac ninh','27'],['hai duong','30'],['hai phong','31'],
  ['hung yen','33'],['thai binh','34'],['ha nam','35'],['nam dinh','36'],['ninh binh','37'],
  ['thanh hoa','38'],['nghe an','40'],['ha tinh','42'],['quang binh','44'],['quang tri','45'],
  ['thua thien hue','46'],['hue','46'],['da nang','48'],['quang nam','49'],['quang ngai','51'],
  ['binh dinh','52'],['phu yen','54'],['khanh hoa','56'],['ninh thuan','58'],['binh thuan','60'],
  ['kon tum','62'],['gia lai','64'],['dak lak','66'],['daklak','66'],['dak nong','67'],
  ['lam dong','68,703'],['binh phuoc','70'],['tay ninh','72'],['binh duong','74'],['dong nai','75'],
  ['ba ria vung tau','77'],['ho chi minh','79'],['long an','80'],['tien giang','82'],['ben tre','83'],
  ['tra vinh','84'],['vinh long','86'],['dong thap','87'],['an giang','89'],['kien giang','91'],
  ['can tho','92,815'],['hau giang','93'],['soc trang','94'],['bac lieu','95'],['ca mau','96']
].map(([name, codes]) => [name, Object.freeze(codes.split(','))])));

export function codesForProvinceName(name, areas = null) {
  const numeric = code(name);
  if (numeric) return [numeric];
  const q = coreName(name);
  if (!q) return [];
  const catalog = array(areas?.provinces).filter(p => coreName(p?.name) === q).map(p => code(p.code));
  return unique(catalog.length ? catalog : (NAME_TO_CODES[q] || []));
}

function selection(value, areas) {
  const criteria = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  const resolved = criteria && array(criteria.provinces);
  if (resolved?.length && resolved.every(v => Boolean(code(v)))) {
    return { selected: true, wanted: unique(resolved.map(code)), unresolved: [], queries: names(criteria.province) };
  }
  const queries = names(criteria ? (criteria.province || criteria.provinces) : value);
  const unresolved = queries.filter(q => !codesForProvinceName(q, areas).length);
  return { selected: queries.length > 0, wanted: unique(queries.flatMap(q => codesForProvinceName(q, areas))), unresolved, queries };
}

export function codesWanted(provinceText, areas = null) { return selection(provinceText, areas).wanted; }

export function recordCodes(record = {}) {
  return unique([
    record.provinceCode, record.provCode, record.areaProvCode,
    ...array(record.provinceCodes),
    ...array(record.locations).map(l => l && (l.provCode || l.provinceCode))
  ].map(code));
}

export function matchesAreaCodes(record = {}, provinceText, areas = null) {
  const selected = selection(provinceText, areas);
  if (!selected.selected) return { ok: true, state: 'MATCH', reason: 'no-area-filter' };
  if (selected.unresolved.length) return { ok: false, state: 'INSUFFICIENT', reason: 'unresolved-area', unresolved: selected.unresolved };
  const have = recordCodes(record);
  if (have.length) {
    const ok = have.some(c => selected.wanted.includes(c));
    return { ok, state: ok ? 'MATCH' : 'OUT_OF_RANGE', reason: ok ? 'code' : 'mismatch', wanted: selected.wanted, have };
  }
  const provinceNames = [record.provinceName, ...array(record.provinces), ...array(record.locations).map(l => l?.provName || l?.provinceName)].filter(Boolean);
  const namedCodes = unique(provinceNames.flatMap(n => codesForProvinceName(n, areas)));
  if (namedCodes.length) {
    const ok = namedCodes.some(c => selected.wanted.includes(c));
    return { ok, state: ok ? 'MATCH' : 'OUT_OF_RANGE', reason: ok ? 'province-name' : 'mismatch', wanted: selected.wanted, have: namedCodes };
  }
  const location = ` ${fold(record.location)} `;
  const wantedNames = unique([
    ...selected.queries.map(coreName),
    ...Object.entries(NAME_TO_CODES).filter(([, codes]) => codes.some(c => selected.wanted.includes(c))).map(([name]) => name),
    ...array(areas?.provinces).filter(p => selected.wanted.includes(code(p.code))).map(p => coreName(p.name))
  ]).filter(n => n && !/^\d+$/.test(n));
  if (wantedNames.some(n => location.includes(` ${n} `))) return { ok: true, state: 'MATCH', reason: 'text-fallback', wanted: selected.wanted };
  const knownLocation = Object.keys(NAME_TO_CODES).some(n => location.includes(` ${n} `));
  return { ok: false, state: knownLocation ? 'OUT_OF_RANGE' : 'INSUFFICIENT', reason: knownLocation ? 'mismatch' : 'insufficient', wanted: selected.wanted };
}

/* ============================================================================
 *  KHỚP XÃ / PHƯỜNG THEO MÃ
 *
 *  VÌ SAO phải theo mã chứ không chỉ theo chữ:
 *
 *  Khớp bằng cụm chữ "Đức Trọng" có hai đường hỏng ngược chiều nhau, và cả hai
 *  đều im lặng:
 *
 *    NHẬN NHẦM  — cả nước có nhiều xã trùng tên. Tìm "Tân Minh" ở Lâm Đồng mà
 *                 khớp trúng "Tân Minh" của tỉnh khác thì người dùng đọc một
 *                 gói thầu không thuộc địa bàn mình, tưởng là cơ hội.
 *    BỎ SÓT     — e-GP ghi tên theo nhiều kiểu: "Xã Đức Trọng", "Đức Trọng",
 *                 "Huyện Đức Trọng" (tên trước sáp nhập). Một gói ghi kiểu
 *                 khác kiểu người dùng gõ là biến mất khỏi kết quả.
 *
 *  Mã xã thì duy nhất và không có hai kiểu viết. Nên thứ tự là: MÃ trước, tên
 *  chỉ để quy ra mã, và chỉ khi bản ghi không có mã nào mới lùi về so chữ.
 *
 *  GIỚI HẠN THEO TỈNH LÀ BẮT BUỘC. Danh mục xã của e-GP gắn `parentCode` là mã
 *  tỉnh. Quy tên xã ra mã mà không lọc theo tỉnh đã chọn thì chính là mở lại
 *  đường "nhận nhầm" ở trên, chỉ khác là bằng mã.
 *
 *  LƯU Ý VỀ TBMT: chỉ mục `es-notify-contractor` trả `districtCode` bằng 0 (xem
 *  lib/kqlcnt.js), nên gói TBMT thường KHÔNG có mã xã. Với chúng, đường so chữ
 *  vẫn là đường duy nhất — và khi cả mã lẫn chữ đều không kết luận được thì
 *  trạng thái đúng là CHƯA ĐỦ DỮ LIỆU, không phải "ngoài tiêu chí".
 * ========================================================================== */

/** Mã xã/phường của một bản ghi, gom từ mọi chỗ e-GP có thể đặt nó. */
export function recordWardCodes(record = {}) {
  const w = value => /^\d{1,8}$/.test(String(value ?? '').trim()) ? String(value).trim() : '';
  return unique([
    record.wardCode, record.districtCode, record.areaCode,
    ...array(record.wardCodes),
    ...array(record.locations).map(l => l && (l.districtCode || l.wardCode))
  ].map(w).filter(c => c && c !== '0'));
}

/**
 * Quy TÊN xã/phường người dùng gõ ra danh sách mã, GIỚI HẠN trong các tỉnh đã
 * chọn.
 *
 * @param {string} name           Tên xã/phường người dùng gõ.
 * @param {string[]} provinceCodes Mã tỉnh đã chọn; rỗng = không giới hạn.
 * @param {object} areas          Danh mục địa bàn đã tải từ e-GP.
 */
export function wardCodesForName(name, provinceCodes = [], areas = null) {
  const q = wardCore(name);
  if (!q) return [];
  const wanted = unique(array(provinceCodes).map(code));
  return unique(array(areas?.wards)
    .filter(w => wardCore(w?.name) === q)
    // parentCode là mã tỉnh. Không lọc bước này là mở lại đúng đường nhận nhầm.
    .filter(w => !wanted.length || wanted.includes(code(w?.parentCode)))
    .map(w => String(w?.code ?? '').trim())
    .filter(Boolean));
}

/** Bỏ tiền tố đơn vị hành chính để "Xã Đức Trọng" và "Đức Trọng" là một. */
function wardCore(value) {
  return fold(value).replace(/^(xa|phuong|thi tran|thi xa|quan|huyen)\s+/, '').replace(/\s+ma cu$/, '').trim();
}

/**
 * Bản ghi này có thuộc xã/phường người dùng chọn không?
 *
 * Trả về cùng hợp đồng ba trạng thái như matchesAreaCodes():
 *   MATCH        — khớp, có căn cứ.
 *   OUT_OF_RANGE — có căn cứ và KHÔNG khớp.
 *   INSUFFICIENT — chưa đủ dữ liệu để kết luận; giữ lại cho người dùng tự xem.
 */
export function matchesWardCodes(record = {}, wardText, provinceCodes = [], areas = null) {
  const queries = names(wardText);
  if (!queries.length) return { ok: true, state: 'MATCH', reason: 'no-ward-filter' };

  const wantedCodes = unique(queries.flatMap(q => wardCodesForName(q, provinceCodes, areas)));
  const have = recordWardCodes(record);

  // 1. Cả hai bên đều có mã -> kết luận chắc chắn, không cần đoán theo chữ.
  if (wantedCodes.length && have.length) {
    const ok = have.some(c => wantedCodes.includes(c));
    return { ok, state: ok ? 'MATCH' : 'OUT_OF_RANGE', reason: ok ? 'ward-code' : 'ward', wanted: wantedCodes, have };
  }

  // 2. Không có mã -> so tên xã trong chính các trường tên của bản ghi.
  const recordNames = [record.wardName, record.districtName, ...array(record.wards),
    ...array(record.locations).flatMap(l => [l?.wardName, l?.districtName])].filter(Boolean);
  const cores = queries.map(wardCore).filter(Boolean);
  if (recordNames.length) {
    const ok = recordNames.some(n => cores.includes(wardCore(n)));
    return { ok, state: ok ? 'MATCH' : 'OUT_OF_RANGE', reason: ok ? 'ward-name' : 'ward', wanted: cores };
  }

  // 3. Chỉ còn một chuỗi địa điểm gộp -> so cụm từ, và chỉ dám kết luận "ngoài
  //    tiêu chí" khi chuỗi đó thật sự có nhắc tới một đơn vị hành chính.
  const location = ` ${fold(record.location)} `;
  if (cores.some(c => location.includes(` ${c} `))) {
    return { ok: true, state: 'MATCH', reason: 'ward-text', wanted: cores };
  }
  const coHanhChinh = /\b(xa|phuong|thi tran|thi xa|quan|huyen)\b/.test(fold(record.location));
  return coHanhChinh
    ? { ok: false, state: 'OUT_OF_RANGE', reason: 'ward', wanted: cores }
    : { ok: false, state: 'INSUFFICIENT', reason: 'insufficient-ward', wanted: cores };
}
