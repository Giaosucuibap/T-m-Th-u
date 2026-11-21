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

const wardCode = value => /^[a-z0-9_-]+$/i.test(String(value ?? '').trim()) && !/^(?:null|undefined|nan)$/i.test(String(value).trim()) ? String(value).trim() : '';
const wardName = value => fold(value).replace(/^(?:xa|phuong|thi tran|huyen|quan|thi xa|thanh pho|tp)\s+/, '');
const pairKey = value => `${value.parentCode}:${value.code}`;
const uniquePairs = values => [...new Map(values.map(value => [pairKey(value), value])).values()];
function identity(value, parent = '') {
  if (!value || typeof value !== 'object') return null;
  const result = { code: wardCode(value.code || value.wardCode || value.districtCode),
    parentCode: code(value.parentCode || value.wardParentCode || value.provCode || value.provinceCode || parent) };
  return result.code && result.parentCode ? {...result, ...(value.name ? {name: String(value.name).trim()} : {})} : null;
}

/** Retain pairs from the same source location. Never cross-product independent
 * province and ward arrays or infer a parent by slicing the ward's code. */
export function recordWardIdentities(record = {}) {
  return uniquePairs([
    ...array(record.wardIdentities).map(value => identity(value)),
    ...array(record.locations).map(value => identity(value)),
    identity({wardCode: record.wardCode || record.districtCode,
      parentCode: record.wardParentCode || record.parentCode || record.parentAreaCode || record.provinceCode || record.provCode || record.areaProvCode})
  ].filter(Boolean));
}

/** A ward selection is a code + parent pair. Legacy text can resolve only to
 * one exact catalog identity within explicitly selected province identities. */
export function resolveWardSelection(criteria = {}, areas = null) {
  if (typeof criteria === 'string') criteria = {ward: criteria};
  if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) criteria = {};
  const explicit = [...array(criteria.wardIdentities)];
  if (criteria.wardCode || criteria.wardParentCode) explicit.push({code: criteria.wardCode, parentCode: criteria.wardParentCode});
  // `wards` is a server query field, not proof of its parent identity.
  const queries = names(criteria.ward);
  const requestedCodes = array(criteria.wards).map(wardCode).filter(Boolean);
  const selected = Boolean(explicit.length || queries.length || requestedCodes.length);
  if (!selected) return {selected: false, ok: true, state: 'MATCH', identities: [], codes: [], reason: 'no-ward-filter'};
  const province = selection(criteria, areas);
  const supplied = explicit.map(value => identity(value));
  if (explicit.length) {
    if (supplied.some(value => !value) || province.unresolved.length || (province.selected && supplied.some(value => !province.wanted.includes(value.parentCode)))) {
      return {selected: true, ok: false, state: 'INSUFFICIENT', identities: [], codes: [], reason: 'unresolved-ward'};
    }
    const identities = uniquePairs(supplied);
    return {selected: true, ok: true, state: 'MATCH', identities, codes: unique(identities.map(value => value.code)), reason: 'ward-identity'};
  }
  if (!province.selected || province.unresolved.length || !province.wanted.length) return {selected: true, ok: false, state: 'INSUFFICIENT', identities: [], codes: [], reason: 'unresolved-ward'};
  const catalog = uniquePairs(province.wanted.flatMap(parent => array(areas?.wardsByProvince?.[parent])
    .map(value => identity(value, parent)).filter(Boolean)));
  const selections = queries.length ? queries.map(query => catalog.filter(value => wardName(value.name) === wardName(query)))
    : requestedCodes.map(query => catalog.filter(value => value.code === query));
  if (!selections.length || selections.some(values => values.length !== 1)) return {selected: true, ok: false, state: 'INSUFFICIENT', identities: [], codes: [], reason: 'unresolved-ward'};
  const identities = uniquePairs(selections.flat());
  return {selected: true, ok: true, state: 'MATCH', identities, codes: unique(identities.map(value => value.code)), reason: 'ward-catalog'};
}

export function matchesWardCodes(record = {}, criteria = {}, areas = null) {
  const selected = resolveWardSelection(criteria, areas);
  if (!selected.selected || !selected.ok) return selected;
  const have = recordWardIdentities(record);
  if (!have.length) return {ok: false, state: 'INSUFFICIENT', reason: 'insufficient-ward', wanted: selected.identities, have};
  const keys = new Set(selected.identities.map(pairKey));
  const ok = have.some(value => keys.has(pairKey(value)));
  return {ok, state: ok ? 'MATCH' : 'OUT_OF_RANGE', reason: ok ? 'ward-code' : 'ward', wanted: selected.identities, have};
}
