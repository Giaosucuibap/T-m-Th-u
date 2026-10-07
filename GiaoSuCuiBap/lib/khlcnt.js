/* ============================================================================
 *  Giáo Sư Cùi Bắp — lib/khlcnt.js
 *  KẾ HOẠCH LỰA CHỌN NHÀ THẦU (KHLCNT) — tra theo CHỦ ĐẦU TƯ và XÃ/PHƯỜNG.
 *
 *  ---------------------------------------------------------------------------
 *  TỰ DỰNG TRUY VẤN, LỌC ĐỊA BÀN Ở MÁY CHỦ
 *
 *  Bản đầu để e-GP tự dựng truy vấn qua biểu mẫu, vì lúc đó chưa lấy được mã
 *  xã/phường. Nay đã lấy được đủ 97 tỉnh và 4.055 xã/phường (xem lib/areas.js)
 *  nên tự dựng được, và nhanh hơn hẳn.
 *
 *  Mã địa bàn sau sáp nhập 01/7/2025 có hai lớp chồng nhau:
 *      code "68"  · Tỉnh Lâm Đồng   · status 1  -> HIỆN HÀNH
 *      code "703" · Tỉnh Lâm Đồng   · status 0  -> Lâm Đồng CŨ
 *      code "715" · Tỉnh Bình Thuận · status 0  -> đã nhập vào Lâm Đồng
 *  Nên khi người dùng chọn một TÊN tỉnh, phải gửi lên ĐỦ MỌI MÃ cùng tên,
 *  đúng như chính e-GP làm. `provinceCodesByName` lo việc này.
 *
 *  Chi tiết số liệu đo được nằm ngay trên hàm `buildKhlcntQuery`.
 * ========================================================================== */

import { cleanText, foldText, parseMoney, parseDate, formatMoney, wardCoreName ,
  dateRangeFrom, firstStampMs, standardCode, normalizeVersion, VN_UTC_OFFSET_HOURS } from './core.js';
import { EGP_ORIGIN } from './kqlcnt.js';
import { matchesAreaCodes, matchesWardCodes, recordWardIdentities } from './area-match.js';
import { passesHardFilter } from './hard-filter.js';
import { categoryField, normalizeCategory, isUnknownCategory, matchesTenderCategory, tenderFieldOf } from './tender-categories.js';
import { matchesQuery, matchesExcludeKeywords } from './workspace.js';
import { parseInvestorFilter, matchesInvestorFilter } from './investor-filter.js';
import { coverageOf } from './match-gate.js';

const CHILD_LOCATION_KEYS = ['locations','wardIdentities','wardCode','districtCode','wardParentCode','parentCode','parentAreaCode',
  'provinceCodes','provinceCode','provCode','areaProvCode','provinces','wards','location','locationName','provinceName','provName','wardName','districtName','areaName'];
const CHILD_INVESTOR_KEYS = ['investorName','investorCode','investorNames','investorCodes',
  'procuringEntityName','procuringEntityCode','investorFold'];

function investorTerms(value) {
  const parsed = parseInvestorFilter(value);
  if (!parsed.ok) throw new Error(parsed.message || 'Danh sách chủ đầu tư không hợp lệ.');
  return parsed.terms;
}

export const KHLCNT_TYPE = 'es-plan-project-p';
export const KHLCNT_STEP = 'plan-step-1';

/* ---------------------------------------------------------------------------
 *  LỌC THEO NGÀY PHÊ DUYỆT
 *
 *  Không dùng ngày đăng tải để thay thế ngày phê duyệt. Biểu mẫu KHLCNT
 *  chính thức dùng bidCloseDate làm trường chỉ mục cho ngày phê duyệt.
 *  Máy chủ khoanh ngày theo lịch; classifyPlansByCriteria kiểm lại quyết định
 *  trong đúng khoảng thời gian đã cố định khi bắt đầu lượt tra cứu.
 *  Thiếu ngày phê duyệt nằm riêng trong nhóm thiếu dữ liệu. Khi đạt giới hạn
 *  trang, coverage phải nói rõ lượt tra chưa đủ dữ liệu.
 * ------------------------------------------------------------------------- */

/** Quy lựa chọn thời gian của người dùng về khoảng epoch ms. */
export function khlcntDateRange(scope = {}) {
  return dateRangeFrom(scope);
}

/** Mốc thời gian của một kế hoạch: ưu tiên NGÀY PHÊ DUYỆT vì đó là ngày hiển thị. */
function khlcntStampMs(plan) {
  // The control says approval date; publication is not a substitute.
  return firstStampMs(plan, ['decisionDate']);
}

/**
 * Kế hoạch này có nằm trong khoảng người dùng chọn không?
 *
 * Kế hoạch KHÔNG có mốc thời gian nào thì GIỮ LẠI — loại bỏ sẽ là tự bịa ra
 * kết luận từ chỗ không có dữ liệu.
 */
export function khlcntStamp(plan) { return khlcntStampMs(plan); }

export function khlcntInDateRange(plan, range) {
  if (!range) return true;
  const t = khlcntStampMs(plan);
  if (t === null) return true;
  return t >= range.from && t <= range.to;
}

/** Compatibility export; publication-date padding is no longer applied. */
export const KHLCNT_SERVER_PAD_DAYS = 0;

/**
 * Dựng truy vấn KHLCNT — TỰ DỰNG, không qua biểu mẫu e-GP.
 *
 * Vì sao đổi cách: mã xã/phường không có ở bất kỳ API hay thẻ DOM nào của e-GP
 * (đã thử 9 đường dẫn và soi cả dropdown), nên muốn lọc địa bàn thì buộc phải
 * điều khiển ô chọn của e-GP. Việc đó hay thất bại, và khi thất bại thì tiện
 * ích quét sạch 10.000 kế hoạch toàn quốc — vừa chậm vừa sai.
 *
 * Chủ đầu tư, từ khoá, tỉnh và xã/phường giúp thu hẹp ở máy chủ. Tiêu chí
 * ngày phê duyệt, giá và tên từng gói được kiểm lại bằng bộ lọc chung tại chỗ.
 *
 * @param {object} scope
 * @param {string} [scope.investor] tên hoặc mã định danh chủ đầu tư
 * @param {string} [scope.keyword]  từ khoá tên kế hoạch / tên gói thầu
 */
export function buildKhlcntQuery(scope = {}) {
  const filters = [
    { fieldName: 'type', searchType: 'in', fieldValues: [KHLCNT_TYPE] }
  ];
  const field = categoryField(scope.category);
  if (field) filters.push({ fieldName: 'investField', searchType: 'in', fieldValues: [field] });

  /* ĐỊA BÀN LỌC ĐƯỢC Ở MÁY CHỦ — khác hẳn TBMT.
   *
   * Đã đo trên e-GP thật với bản ghi es-plan-project-p:
   *     chỉ KHLCNT, không lọc                 -> 10.000 (trần), bản đầu ở TP.HCM
   *     + locations.provCode ["68","703"]     -> bản đầu chuyển sang Lâm Đồng ✔
   *     + locations.districtCode ["23122"]    ->    108  ✔
   *
   * Lưu ý: cùng hai tên trường ấy nhưng với bản ghi TBMT
   * (es-notify-contractor) thì districtCode trả 0 — xem buildTbmtQuery. Nên
   * KHÔNG suy diễn từ loại bản ghi này sang loại kia.
   *
   * Mã tỉnh phải gửi ĐỦ MỌI MÃ CÙNG TÊN (Lâm Đồng = 68 hiện hành + 703 cũ),
   * thiếu mã là bỏ sót kế hoạch đăng trước 1/7/2025.
   */
  const provinces = (scope.provinces || []).map(cleanText).filter(Boolean);
  if (provinces.length) {
    filters.push({ fieldName: 'locations.provCode', searchType: 'in', fieldValues: provinces });
  }
  const wards = (scope.wards || []).map(cleanText).filter(Boolean);
  if (wards.length) {
    filters.push({ fieldName: 'locations.districtCode', searchType: 'in', fieldValues: wards });
  }

  // Native KHLCNT approval-date control was witnessed on 05/10/2026. Its
  // actual indexed field is bidCloseDate, with ISO wall-clock day bounds;
  // it is not the closing date of a tender in this record type. Never reuse
  // this alias for TBMT or substitute a publication date for approval.
  const range=khlcntDateRange(scope);
  if(range){
    const day=86400000,offset=VN_UTC_OFFSET_HOURS*3600000;
    // The list mixes naive VN timestamps and explicit-zone timestamps.
    // Retrieve a conservative calendar window, then keep the strict frozen
    // decisionDate gate locally. One extra day on either side avoids dropping
    // valid boundary records because the native UI serializes wall time as Z.
    const iso=value=>new Date(value).toISOString().replace('.000Z','Z');
    const from=range.from<=-8640000000000000?null:iso(Math.floor((range.from+offset)/day)*day-day);
    const to=range.to>=8640000000000000?null:iso(Math.floor((range.to+offset)/day)*day+2*day-1);
    filters.push({fieldName:'bidCloseDate',searchType:'range',from,to});
  }

  const query = { index: 'es-contractor-selection', filters };

  const terms = investorTerms(scope.investor);
  if (terms.length > 1) throw new Error('Mỗi truy vấn e-GP chỉ nhận một chủ đầu tư. Hãy dùng buildKhlcntQueries.');
  const investor = terms[0] || '';
  const keyword = cleanText(scope.keyword);

  if (investor) {
    query.keyWord = investor;
    query.matchType = 'all-0';
    // `procuringEntityName/Code` là tên trường thật của chủ đầu tư trong bản
    // ghi KHLCNT; hai tên còn lại giữ để dự phòng bản ghi cũ. Đã thử thật:
    // trả 71 kế hoạch cho "Ban quản lý dự án ... huyện Đơn Dương".
    query.matchFields = ['procuringEntityName', 'procuringEntityCode', 'investorName', 'investorCode'];
  } else if (keyword) {
    query.keyWord = keyword;
    query.matchType = 'all-0';
    query.matchFields = ['name', 'planNo', 'bidName'];
  }
  return query;
}

/** Separate native queries implement OR without relying on undocumented syntax. */
export function buildKhlcntQueries(scope = {}) {
  const terms = investorTerms(scope.investor);
  return (terms.length ? terms : ['']).map(investor => buildKhlcntQuery({...scope, investor}));
}

/** Nhãn đúng nguyên văn trong ô "Loại thông báo" của e-GP. */
export const KHLCNT_NOTICE_LABEL = 'Kế hoạch lựa chọn nhà thầu';

/** Loại kế hoạch (`planType`). */
const PLAN_TYPE_LABEL = {
  DTPT: 'Đầu tư phát triển',
  TX: 'Chi thường xuyên',
  KHAC: 'Khác'
};

const FIELD_LABEL = {
  HH: 'Hàng hóa', XL: 'Xây lắp', TV: 'Tư vấn', PTV: 'Phi tư vấn', HON_HOP: 'Hỗn hợp'
};

/* --------------------------------------------------------------------------
 *  ĐỌC BẢN GHI
 * ------------------------------------------------------------------------ */

function listOf(value) {
  if (Array.isArray(value)) return value;
  return value === null || value === undefined || value === '' ? [] : [value];
}

/** Link sâu tới đúng trang chi tiết KHLCNT trên e-GP. */
export function buildKhlcntDetailUrl(record) {
  const P = '_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render';
  const params = new URLSearchParams({
    p_p_id: 'egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2',
    p_p_lifecycle: '0',
    p_p_state: 'normal',
    p_p_mode: 'view',
    [P]: 'detail-v2',
    type: KHLCNT_TYPE,
    stepCode: KHLCNT_STEP,
    id: cleanText(record.id),
    notifyId: 'undefined',
    inputResultId: 'undefined',
    bidOpenId: 'undefined',
    techReqId: 'undefined',
    bidPreNotifyResultId: 'undefined',
    bidPreOpenId: 'undefined',
    processApply: 'undefined',
    bidMode: 'undefined',
    notifyNo: 'undefined',
    planNo: cleanText(record.planNo),
    pno: 'undefined',
    step: 'khlcnt',
    isInternet: 'undefined',
    caseKHKQ: 'undefined',
    bidForm: 'undefined'
  });
  return `${EGP_ORIGIN}/vi/web/guest/contractor-selection?${params.toString()}`;
}

/**
 * Chuẩn hoá một Kế hoạch lựa chọn nhà thầu.
 *
 * A plan can contain several packages. Search aggregates bidName, bidPrice
 * and investField independently; equal array lengths do not establish the
 * name/price/sector relationship. Only an item's own fields, or a genuine
 * one-package aggregate, can supply that relationship.
 */
export function normalizeKhlcntPlan(record) {
  if (!record || typeof record !== 'object') return null;
  const planNo = cleanText(record.planNo);
  if (!planNo) return null;
  const version = normalizeVersion(record.planVersion);

  const names = listOf(record.bidName).map((name, index) => ({name: cleanText(name), index})).filter(x => x.name);
  const namesNew = listOf(record.bidNamePlanNew).map((item, index) => ({name: cleanText(item && item.name), index, item})).filter(x => x.name);
  const prices = listOf(record.bidPrice);
  const source = namesNew.length >= names.length ? namesNew : names;
  const sourceCount = listOf(source === namesNew ? record.bidNamePlanNew : record.bidName).length;
  const singleSourceField = sourceCount === 1 && listOf(record.investField).length === 1
    ? tenderFieldOf({investField: listOf(record.investField)[0]}) : '';
  const singleton = sourceCount === 1 && source.length === 1 && prices.length === 1;
  const packages = source.map(({name, item}) => {
    const ownPriceKey = item && ['bidPrice','price'].find(key => Object.hasOwn(item, key));
    const price = ownPriceKey ? parseMoney(item[ownPriceKey]) : singleton ? parseMoney(prices[0]) : null;
    return {
      ...(item && typeof item === 'object' ? item : {}), name, price,
      // Several standalone prices are not paired with package names. Keep the
      // list visible as insufficient until an official detail table binds it.
      priceBindingPending: !ownPriceKey && !singleton && prices.length > 0,
      priceSource: ownPriceKey ? `package.${ownPriceKey}` : singleton ? 'single-package-aggregate' : '',
      investField: item?.investField ?? (tenderFieldOf(item) ? '' : singleSourceField),
      fieldCode: tenderFieldOf(item),
      ...(item?.locations ? {locations: listOf(item.locations).map(value => ({...value})), wardIdentities: recordWardIdentities(item)} : {})
    };
  });
  const fieldCodes = [...new Set(listOf(record.investField).map(cleanText).filter(Boolean))];

  const locations = listOf(record.locations);
  const provinces = [...new Set([record.provinceName,record.provName,...locations.map(l => l?.provName || l?.provinceName)].map(cleanText).filter(Boolean))];
  const wards = [...new Set([record.wardName,record.districtName,...locations.flatMap(l => [l?.wardName,l?.districtName])].map(cleanText).filter(Boolean))];

  const totalPackagePrice = packages.reduce((s, p) => s + (Number(p.price) || 0), 0);

  return {
    key: `${planNo}::${version}`,
    sourceId: cleanText(record.id),
    planNo,
    version,
    planNoStand: standardCode(record.planNoStand, planNo, record.planVersion),
    name: cleanText(record.name) || planNo,
    projectName: cleanText(record.pname),

    // Bản ghi KHLCNT của e-GP KHÔNG có `investorName`/`investorCode` — đã kiểm
    // chứng bằng cách liệt kê toàn bộ khoá của bản ghi thật (PL2300148182):
    // chủ đầu tư nằm ở `procuringEntityName` và `procuringEntityCode`
    // (dạng "vn" + MST). Đọc sai tên trường là nguyên nhân tên chủ đầu tư luôn
    // rỗng, khiến bước soát tiêu chí đánh dấu MỌI bản ghi là "không khớp".
    // Vẫn đọc `investorName` làm phương án dự phòng cho bản ghi cũ.
    investorName: cleanText(record.procuringEntityName) || cleanText(record.investorName),
    investorCode: cleanText(record.procuringEntityCode) || cleanText(record.investorCode),
    // Preserve both source identities even when the plan's displayed owner
    // comes from procuringEntityName/procuringEntityCode.
    investorCodes: [...new Set([record.investorCode,record.procuringEntityCode].map(cleanText).filter(Boolean))],
    investorNames: [...new Set([record.investorName,record.procuringEntityName].map(cleanText).filter(Boolean))],
    procuringEntityName: cleanText(record.procuringEntityName),
    procuringEntityCode: cleanText(record.procuringEntityCode),
    investorFold: foldText(cleanText(record.procuringEntityName) || cleanText(record.investorName)),

    provinces,
    provinceCodes: [...new Set([record.provinceCode, record.provCode, record.areaProvCode, ...locations.map(l => l && (l.provCode || l.provinceCode))].map(cleanText).filter(Boolean))],
    wards,
    locations: locations.filter(value => value && typeof value === 'object').map(value => ({...value})),
    wardIdentities: recordWardIdentities(record),
    location: locations
      .map((l) => [cleanText(l && l.districtName), cleanText(l && l.provName)].filter(Boolean).join(' - '))
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join('; '),

    packages,
    fieldCodes,
    packageCount: packages.length,
    totalPackagePrice,
    investTotal: parseMoney(record.investTotal),

    fields: [...new Set(listOf(record.investField).map(cleanText).filter(Boolean))]
      .map((f) => FIELD_LABEL[f] || f),
    planType: cleanText(record.planType),
    planTypeLabel: PLAN_TYPE_LABEL[cleanText(record.planType)] || cleanText(record.planType),

    decisionDate: parseDate(record.decisionDate),
    publicDate: parseDate(record.publicDate),
    // e-GP đánh dấu 1 khi kế hoạch còn gói thầu CHƯA đăng thông báo mời thầu —
    // tức là cơ hội còn ở phía trước.
    hasUnannounced: Number(record.haveBidNotNotify) === 1,

    detailUrl: buildKhlcntDetailUrl(record),
    capturedAt: new Date().toISOString()
  };
}

/** A native detail is useful once per plan when the list cannot bind children.
 * A verified detail with missing source fields remains unknown; fetching the
 * same table repeatedly cannot manufacture the missing information. */
export function needsKhlcntPackageDetails(plan) {
  if (!plan || plan.packageDetail?.verified) return false;
  return !Array.isArray(plan.packages) || !plan.packages.length || plan.packages.some(pkg =>
    pkg.priceBindingPending || pkg.price == null || !tenderFieldOf(pkg));
}

/** Bind an observed, paired native KHLCNT table to its exact list record.
 * The bridge supplies only {url,status,header,packages,capturedAt}; no project
 * approval, aggregate search array or page text can supply a child field.
 * Reject foreign versions, partial tables and duplicate child identities.
 * Never mutate the list record or the native receipt. */
export function applyKhlcntPackageDetail(plan, receipt) {
  const reject = (reason, message) => ({ok: false, reason, message});
  if (!plan || !receipt || Number(receipt.status) !== 200) {
    return reject('detail-response', 'Chưa nhận được bảng chi tiết hợp lệ từ e-GP.');
  }
  const header = receipt.header;
  const sourceId = cleanText(plan.sourceId);
  const planNo = cleanText(plan.planNo);
  if (!header || !sourceId || !planNo || cleanText(header.id) !== sourceId ||
      cleanText(header.planNo) !== planNo || !cleanText(header.planVersion) ||
      cleanText(header.planVersion) !== cleanText(plan.version)) {
    return reject('detail-identity', 'Bảng chi tiết không khớp mã hoặc phiên bản kế hoạch.');
  }
  let url;
  try { url = new URL(receipt.url); } catch { return reject('detail-url', 'Đường dẫn chi tiết không hợp lệ.'); }
  if (url.origin !== EGP_ORIGIN || url.username || url.password ||
      !/^\/(?:vi\/)?web\/guest\/contractor-selection\/?$/.test(url.pathname) ||
      ['id','planNo','type','step'].some(key => url.searchParams.getAll(key).length !== 1) ||
      url.searchParams.get('id') !== sourceId || url.searchParams.get('planNo') !== planNo ||
      url.searchParams.get('type') !== KHLCNT_TYPE || url.searchParams.get('step') !== 'khlcnt') {
    return reject('detail-url', 'Đường dẫn không xác nhận đúng kế hoạch trên e-GP.');
  }
  const rows = receipt.packages;
  const rawCount = header.bidPack;
  const count = typeof rawCount === 'number' || typeof rawCount === 'string' && rawCount.trim() !== ''
    ? Number(rawCount) : NaN;
  if (!Array.isArray(rows) || !Number.isInteger(count) || count < 0 || rows.length !== count) {
    return reject('detail-count', 'Bảng chi tiết chưa đủ số gói e-GP công bố.');
  }
  const ids = new Set(), bidNos = new Set();
  const packages = [];
  const parentNames = new Set([plan.investorName, plan.procuringEntityName, ...(plan.investorNames || [])]
    .map(foldText).filter(Boolean));
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        cleanText(row.idPlan) !== sourceId || cleanText(row.planNo) !== planNo) {
      return reject('detail-child-identity', 'Có gói trong bảng không thuộc đúng kế hoạch.');
    }
    const id = cleanText(row.id), bidNo = cleanText(row.bidNo), name = cleanText(row.bidName);
    if ((!id && !bidNo) || !name || id && ids.has(id) || bidNo && bidNos.has(bidNo)) {
      return reject('detail-child-duplicate', 'Bảng có gói thiếu định danh, thiếu tên hoặc trùng định danh.');
    }
    if (id) ids.add(id);
    if (bidNo) bidNos.add(bidNo);
    const unit = cleanText(row.bidPriceUnit).toUpperCase();
    const rawPrice = row.bidPrice;
    const parsed = typeof rawPrice === 'number' || typeof rawPrice === 'string' && /^[+-]?\d[\d\s.,]*$/.test(rawPrice.trim())
      ? parseMoney(rawPrice) : null;
    const price = unit === 'VND' && parsed !== null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    const fieldCode = tenderFieldOf({bidField: row.bidField});
    const child = { id, bidNo, idPlan: sourceId, planNo, name, bidName: name, price,
      bidPrice: price, bidPriceUnit: unit, bidField: cleanText(row.bidField), fieldCode,
      priceBindingPending: price === null, priceSource: 'plan-detail.bidPrice',
      fieldSource: 'plan-detail.bidField', notifyNo: cleanText(row.notifyNo),
      notifyVersion: cleanText(row.notifyVersion) };
    // Null owner aliases in the native table do not erase the list's verified
    // investor code. A genuinely different explicit child owner still wins.
    const ownName = cleanText(row.investorName), ownCode = cleanText(row.investorCode);
    if (ownCode || ownName && !parentNames.has(foldText(ownName))) {
      if (ownName) child.investorName = ownName;
      if (ownCode) child.investorCode = ownCode;
    }
    const locations = Array.isArray(row.locations) ? row.locations.filter(value =>
      value && typeof value === 'object' && !Array.isArray(value) &&
      CHILD_LOCATION_KEYS.some(key => key !== 'locations' && cleanText(value[key]))) : [];
    if (locations.length) {
      child.locations = locations.map(location => ({...location}));
      child.wardIdentities = recordWardIdentities(child);
    }
    packages.push(child);
  }
  const fieldCodes = [...new Set(packages.map(pkg => pkg.fieldCode).filter(Boolean))];
  const totalPackagePrice = packages.reduce((sum, pkg) => sum + (pkg.price ?? 0), 0);
  const enriched = { ...plan, packages, packageCount: packages.length,
    originalPackageCount: packages.length, totalPackagePrice, originalTotalPackagePrice: totalPackagePrice,
    fieldCodes, fields: fieldCodes.map(field => FIELD_LABEL[field] || field),
    // These are PLAN approval/publication dates from the bound detail header.
    // The enclosing project's dates are deliberately absent from the receipt.
    decisionDate: parseDate(header.decisionDate) ?? plan.decisionDate,
    publicDate: parseDate(header.publicDate) ?? plan.publicDate,
    packageDetail: { verified: true, url: url.href, source: 'bidpPlanDetailToProjectList',
      capturedAt: parseDate(receipt.capturedAt) ?? new Date().toISOString(),
      version: cleanText(header.planVersion), count: packages.length,
      unknownPrices: packages.filter(pkg => pkg.price === null).length,
      unknownFields: packages.filter(pkg => !pkg.fieldCode).length } };
  return {ok: true, plan: enriched, message: 'Đã đối chiếu bảng gói thầu từ chi tiết e-GP.'};
}

/** Repair the VIEW of a pre-4.16 lookup without changing stored user work.
 * Old normalized rows lost the name/price relationship. Keep their old value
 * for review, but never display/export it as a verified individual price. */
export function restoreLegacyKhlcntView(job, areas = null) {
  if (!job || Number(job.planDataVersion) >= 2) return job;
  const source = new Map();
  for (const row of [...(job.plans || []), ...(job.insufficientPlans || [])]) {
    if (!row || !row.key) continue;
    const existing = source.get(row.key);
    const children = [...(existing?.packages || []), ...(Array.isArray(row.packages) ? row.packages : [])];
    const seen = new Set();
    // Stable identities deduplicate overlapping projections. Unidentified
    // legacy children are retained, including genuinely equal package names.
    const packages = children.filter(child => {
      const identity = cleanText(child?.id) || cleanText(child?.bidNo);
      if (!identity) return true;
      if (seen.has(identity)) return false;
      seen.add(identity); return true;
    });
    source.set(row.key, {...existing, ...row, packages});
  }
  let uncertain = false;
  const repaired = [...source.values()].map(plan => {
    const packages = plan.packages.map(child => {
      const bound = plan.packageDetail?.verified && cleanText(plan.sourceId) &&
        cleanText(plan.packageDetail.version) === cleanText(plan.version) &&
        cleanText(child.idPlan) === cleanText(plan.sourceId) && cleanText(child.planNo) === cleanText(plan.planNo) &&
        (cleanText(child.id) || cleanText(child.bidNo)) && child.priceSource === 'plan-detail.bidPrice' &&
        cleanText(child.bidPriceUnit).toUpperCase() === 'VND' && typeof child.bidPrice === 'number' &&
        Number.isFinite(child.bidPrice) && child.bidPrice >= 0 && child.price === child.bidPrice;
      if (bound) return {...child};
      uncertain = true;
      return {...child, legacySavedPrice: child.legacySavedPrice ?? child.price ?? null,
        ...(Object.hasOwn(child,'bidPrice') ? {legacySavedBidPrice:child.legacySavedBidPrice ?? child.bidPrice} : {}),
        price:null, bidPrice:null, priceSource:'', priceBindingPending:true};
    });
    const known = packages.length > 0 && packages.every(child => child.price !== null && !child.priceBindingPending);
    const total = known ? packages.reduce((sum, child) => sum + child.price, 0) : null;
    return {...plan, packages, packageCount:packages.length, totalPackagePrice:total,
      legacySavedTotalPackagePrice:plan.legacySavedTotalPackagePrice ?? plan.totalPackagePrice ?? null,
      originalPackageCount:plan.originalPackageCount ?? plan.packageCount ?? packages.length,
      originalTotalPackagePrice:known ? plan.originalTotalPackagePrice ?? total : null};
  });
  const classified = classifyPlansByCriteria(repaired, job.criteria || {}, areas);
  const resultStates = {...(job.resultStates || {})};
  for (const group of ['outOfRange','insufficient','match']) for (const plan of classified[group]) {
    resultStates[plan.key] = {filterState:plan.filterState, filterReason:plan.filterReason};
  }
  const states = Object.values(resultStates);
  const counts = {match:states.filter(row => row.filterState === 'MATCH').length,
    insufficient:states.filter(row => row.filterState === 'INSUFFICIENT').length + (Number(job.invalidCount) || 0),
    outOfRange:states.filter(row => row.filterState === 'OUT_OF_RANGE').length};
  const plans = dedupeKhlcnt(classified.match), insufficientPlans = dedupeKhlcnt(classified.insufficient);
  const notice = 'Bản lưu cũ cần tra lại để đối chiếu giá từng gói.';
  return {...job, planDataVersion:2, plans, insufficientPlans, resultStates,
    summary:summarizeKhlcnt(plans), matchCount:counts.match, insufficientCount:counts.insufficient,
    outOfRangeCount:counts.outOfRange, unknownPrices:insufficientPlans.reduce((sum,plan) =>
      sum + plan.packages.filter(child => child.priceBindingPending).length,0),
    ...(uncertain ? {legacyPlanDataReviewRequired:true,legacyPlanDataNotice:notice,
      partial:true,status:job.status === 'SUCCESS' ? 'PARTIAL' : job.status,
      ...(job.coverage ? {coverage:coverageOf({...job.coverage,...counts,partial:true})} : {})} : {})};
}

/* --------------------------------------------------------------------------
 *  ĐỐI CHIẾU LẠI KẾT QUẢ CỦA e-GP
 *
 *  Truy vấn do e-GP dựng nên kết quả đã đúng theo định nghĩa của hệ thống.
 *  Dù vậy vẫn đối chiếu lại tại chỗ: nếu có bản ghi lệch tiêu chí thì hiện
 *  cảnh báo thay vì lặng lẽ trình bày như thể mọi thứ đều khớp.
 * ------------------------------------------------------------------------ */

/** Match any requested owner, using the same name/code model as TBMT. */
export function matchesInvestor(plan, query) {
  return matchesInvestorFilter(plan, query).ok;
}


/**
 * Kế hoạch này có thuộc xã/phường người dùng hỏi không?
 *
 * Mã xã/phường và mã tỉnh cha phải trùng với định danh đã chọn. Tên huyện
 * cũ hoặc tên chủ đầu tư không chứng minh địa điểm thực hiện của gói thầu.
 * Thiếu định danh được giữ riêng là chưa đủ dữ liệu, không mở rộng toàn quốc.
 */
export { wardCoreName };

export function matchesWard(plan, criteria, areas = null) {
  return matchesWardCodes(plan, criteria || {}, areas).ok;
}

/** Cách khớp nào làm kế hoạch này được giữ lại — để giao diện ghi rõ nguồn. */
export function wardMatchReason(plan, criteria, areas = null) {
  const result = matchesWardCodes(plan, criteria || {}, areas);
  return result.ok && result.reason !== 'no-ward-filter' ? 'location-code' : null;
}

/** Kế hoạch này có đúng tỉnh người dùng hỏi không? */
export function matchesProvince(plan, provinceName) {
  return matchesAreaCodes(plan, provinceName).ok;
}

/**
 * Lọc địa bàn NGAY TRÊN KẾT QUẢ ĐÃ TẢI, thay vì nhờ e-GP lọc.
 *
 * Soát mã địa bàn nguồn sau khi tải, kể cả khi truy vấn máy chủ đã có bộ lọc.
 * Bộ lọc đầy đủ classifyPlansByCriteria tách riêng các bản ghi thiếu dữ liệu.
 *
 * Trả về `{kept, dropped}` để giao diện nói rõ đã bỏ bao nhiêu bản ghi.
 */
export function filterPlansByArea(plans, criteria = {}, areas = null) {
  const kept = [];
  const dropped = [];
  for (const p of plans || []) {
    const ok = matchesAreaCodes(p, criteria, areas).ok && matchesWard(p, criteria, areas);
    (ok ? kept : dropped).push(p);
  }
  return { kept, dropped };
}

/**
 * Soát lại cả tập kết quả. Trả về danh sách bản ghi KHÔNG khớp tiêu chí, để
 * giao diện nói rõ với người dùng thay vì im lặng.
 */
export function auditPlans(plans, criteria = {}, areas = null) {
  return (plans || []).filter((p) =>
    !matchesInvestor(p, criteria.investor) ||
    !matchesWard(p, criteria, areas) ||
    !matchesAreaCodes(p, criteria, areas).ok);
}

/* --------------------------------------------------------------------------
 *  GỘP & THỐNG KÊ
 * ------------------------------------------------------------------------ */

/** Project only matching child packages, retaining the original plan totals. */
export function filterPlansByCategory(plans, value) {
  if (isUnknownCategory(value)) return {kept: [], dropped: (plans || []).length, unknownPackages: 0,
    invalidCategory: String(value), message: 'Loại gói thầu không hợp lệ. Hãy chọn lại trong danh sách.'};
  const category = normalizeCategory(value);
  if (!category) return { kept: plans || [], dropped: 0, unknownPackages: 0 };
  const kept = [];
  let dropped = 0, unknownPackages = 0;
  for (const plan of plans || []) {
    // Plan-wide metadata does not establish the classification of a child.
    const classified = (plan.packages || []).map(pkg => ({pkg, record: pkg}));
    unknownPackages += classified.filter(({record}) => !tenderFieldOf(record)).length;
    const packages = classified.filter(({record}) => matchesTenderCategory(record, category)).map(({pkg}) => pkg);
    if (!packages.length) { dropped++; continue; }
    kept.push({...plan, packages, packageCount: packages.length,
      totalPackagePrice: packages.reduce((sum, pkg) => sum + (Number(pkg.price) || 0), 0),
      originalPackageCount: plan.originalPackageCount ?? plan.packageCount,
      originalTotalPackagePrice: plan.originalTotalPackagePrice ?? plan.totalPackagePrice,
      categoryFiltered: true, category});
  }
  return { kept, dropped, unknownPackages };
}

/** Local hunt constraints describe a CHILD package. Never match a project
 * title, or compare an individual-price bound against the sum of a plan. */
export function filterPlansByLocalCriteria(plans, criteria = {}) {
  const minPrice = Number(criteria.minPrice) || 0;
  const maxPrice = Number(criteria.maxPrice) || 0;
  const hasPrice = minPrice > 0 || maxPrice > 0;
  if (!String(criteria.mustKeywords || '').trim() && !String(criteria.excludeKeywords || '').trim() && !hasPrice) {
    return { kept: plans || [], dropped: 0, packageDropped: 0, unknownPrices: 0 };
  }
  const kept = [];
  let dropped = 0, packageDropped = 0, unknownPrices = 0;
  for (const plan of plans || []) {
    const packages = (plan.packages || []).filter(pkg => {
      const name = cleanText(pkg.name || pkg.bidName || pkg.packageName);
      if (!matchesQuery(name, criteria.mustKeywords) || !matchesExcludeKeywords(name, criteria.excludeKeywords)) return false;
      if (!hasPrice) return true;
      if (pkg.price === null || pkg.price === undefined || pkg.price === '' || !Number.isFinite(Number(pkg.price))) {
        unknownPrices++;
        return false;
      }
      const price = Number(pkg.price);
      return price >= minPrice && (!maxPrice || price <= maxPrice);
    });
    packageDropped += (plan.packages || []).length - packages.length;
    if (!packages.length) { dropped++; continue; }
    kept.push({ ...plan, packages, packageCount: packages.length,
      totalPackagePrice: packages.reduce((sum, pkg) => sum + (Number(pkg.price) || 0), 0),
      originalPackageCount: plan.originalPackageCount ?? plan.packageCount ?? (plan.packages || []).length,
      originalTotalPackagePrice: plan.originalTotalPackagePrice ?? plan.totalPackagePrice,
      categoryFiltered: true, localCriteriaFiltered: true });
  }
  return { kept, dropped, packageDropped, unknownPrices };
}

/** Gate each child package with its own price/name and the plan's area/date.
 * A mixed plan can occur in several groups, but every child occurs in exactly
 * one group. counts refers to child packages, not duplicated parent rows. */
export function classifyPlansByCriteria(plans, criteria = {}, areas = null) {
  const match = [], insufficient = [], outOfRange = [];
  const counts = { packages: 0, match: 0, insufficient: 0, outOfRange: 0, missingPackageTables: 0 };
  const scoped = { ...criteria, dateFields: criteria.dateFields ?? ['decisionDate'] };
  for (const plan of plans || []) {
    const { packages: children, fieldCodes, fields, ...parent } = plan;
    const packages = Array.isArray(children) ? children : [];
    if (!packages.length) {
      // Validate available parent metadata without pretending the plan name
      // or investment total identifies a child package.
      const result = passesHardFilter({ ...parent, name: '', bidName: '', price: null }, scoped, areas);
      const isOut = result.state === 'OUT_OF_RANGE';
      const state = isOut ? result.state : 'INSUFFICIENT';
      (isOut ? outOfRange : insufficient).push({ ...plan, filterState: state,
        filterReason: isOut ? result.reason : 'insufficient-packages', filterReasons: result.reasons,
        packageCount: 0, totalPackagePrice: 0 });
      counts.missingPackageTables++;
      continue;
    }
    const groups = { MATCH: [], INSUFFICIENT: [], OUT_OF_RANGE: [] };
    for (const child of packages) {
      const name = cleanText(child.name || child.bidName || child.packageName);
      const record = { ...parent, ...child, name, bidName: name, price: child.price };
      for (const key of ['investField','fieldCode','bidField','field','fieldRaw','investFieldName','bidFieldName','fieldName','fieldLabel']) {
        if (!Object.hasOwn(child, key)) delete record[key];
      }
      // A child's own locations replace parent locations and their derived
      // identity arrays, preventing a different ward on the parent from
      // satisfying this child's requested area.
      if (CHILD_LOCATION_KEYS.some(key => Object.hasOwn(child, key))) {
        for (const key of CHILD_LOCATION_KEYS) if (!Object.hasOwn(child, key)) delete record[key];
      }
      // A child's explicitly supplied owner replaces parent owner aliases.
      // Otherwise a different child could match through the plan's old name/code.
      if (CHILD_INVESTOR_KEYS.some(key => Object.hasOwn(child, key))) {
        for (const key of CHILD_INVESTOR_KEYS) if (!Object.hasOwn(child, key)) delete record[key];
      }
      // Never inherit a plan's aggregate names/fields or total investment as
      // evidence for a child. Source-specific child metadata wins above.
      delete record.packages;
      const result = passesHardFilter(record, scoped, areas);
      if (child.priceBindingPending && result.state !== 'OUT_OF_RANGE') {
        const issue = { field: 'price', reason: 'insufficient-price', state: 'INSUFFICIENT' };
        result.ok = false; result.state = 'INSUFFICIENT';
        if (result.reason === 'match') result.reason = issue.reason;
        result.reasons = [...result.reasons, issue];
      }
      groups[result.state].push({ ...child, filterState: result.state, filterReason: result.reason, filterReasons: result.reasons });
      counts.packages++;
      counts[result.state === 'MATCH' ? 'match' : result.state === 'INSUFFICIENT' ? 'insufficient' : 'outOfRange']++;
    }
    for (const [state, selected] of Object.entries(groups)) {
      if (!selected.length) continue;
      const result = { ...plan, packages: selected, packageCount: selected.length,
        totalPackagePrice: selected.reduce((sum,pkg) => sum + (parseMoney(pkg.price) ?? 0), 0),
        originalPackageCount: plan.originalPackageCount ?? plan.packageCount ?? packages.length,
        originalTotalPackagePrice: plan.originalTotalPackagePrice ?? plan.totalPackagePrice,
        categoryFiltered: Boolean(normalizeCategory(criteria.category)), localCriteriaFiltered: true,
        filterState: state, filterReason: selected[0].filterReason,
        filterReasons: [...new Map(selected.flatMap(pkg => pkg.filterReasons).map(r => [`${r.field}:${r.reason}`,r])).values()] };
      (state === 'MATCH' ? match : state === 'INSUFFICIENT' ? insufficient : outOfRange).push(result);
    }
  }
  return { match, insufficient, outOfRange, counts };
}

export function dedupeKhlcnt(items) {
  const map = new Map();
  for (const item of items || []) {
    if (!item || !item.key) continue;
    map.set(item.key, { ...(map.get(item.key) || {}), ...item });
  }
  // The date control and each result card show approval, so a late-published
  // old plan must not jump ahead of a recently approved plan. Missing approval
  // remains a separate unknown; publication only breaks equal-date ties.
  const stamp = (row, field) => firstStampMs(row, [field]);
  const newest = (a, b) => a === b ? 0 : a === null ? 1 : b === null ? -1 : b - a;
  return [...map.values()].sort((a, b) =>
    newest(stamp(a, 'decisionDate'), stamp(b, 'decisionDate')) ||
    newest(stamp(a, 'publicDate'), stamp(b, 'publicDate')) ||
    String(a.key).localeCompare(String(b.key), 'en'));
}

/** Thống kê một lượt tra cứu KHLCNT. */
export function summarizeKhlcnt(plans) {
  const list = plans || [];
  const packageCount = list.reduce((s, p) => s + p.packageCount, 0);
  const totalValue = list.reduce((s, p) => s + (Number(p.totalPackagePrice) || 0), 0);
  const investTotal = list.reduce((s, p) => s + (Number(p.investTotal) || 0), 0);
  const withUnannounced = list.filter((p) => p.hasUnannounced).length;

  const rank = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  const byInvestor = new Map();
  const byWard = new Map();
  const byField = new Map();
  for (const p of list) {
    if (p.investorName) byInvestor.set(p.investorName, (byInvestor.get(p.investorName) || 0) + 1);
    for (const w of p.wards) byWard.set(w, (byWard.get(w) || 0) + 1);
    for (const f of p.fields) byField.set(f, (byField.get(f) || 0) + 1);
  }

  return {
    planCount: list.length,
    packageCount,
    totalValue,
    totalValueText: formatMoney(totalValue),
    investTotal,
    withUnannounced,
    byInvestor: rank(byInvestor).slice(0, 12),
    byWard: rank(byWard).slice(0, 12),
    byField: rank(byField)
  };
}
