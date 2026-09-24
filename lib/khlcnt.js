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
  dateRangeFrom, firstStampMs, standardCode, normalizeVersion } from './core.js';
import { EGP_ORIGIN } from './kqlcnt.js';
import { matchesAreaCodes, matchesWardCodes, recordWardIdentities } from './area-match.js';
import { passesHardFilter } from './hard-filter.js';
import { categoryField, normalizeCategory, isUnknownCategory, matchesTenderCategory, tenderFieldOf } from './tender-categories.js';
import { matchesQuery, matchesExcludeKeywords } from './workspace.js';

export const KHLCNT_TYPE = 'es-plan-project-p';
export const KHLCNT_STEP = 'plan-step-1';

/* ---------------------------------------------------------------------------
 *  LỌC THEO NGÀY PHÊ DUYỆT
 *
 *  Không dùng ngày đăng tải để thay thế hoặc nới biên 30 ngày: kế hoạch có
 *  thể đăng tải muộn hơn bất kỳ biên giả định nào. Máy chủ lọc các tiêu chí
 *  địa bàn/chủ đầu tư; classifyPlansByCriteria kiểm ngày phê duyệt tại chỗ.
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

  // Approval may precede publication by more than 30 days. Filtering server
  // publicDate would silently remove valid plans before the approval gate.
  // Keep approval checks local until a native decisionDate query is verified.

  const query = { index: 'es-contractor-selection', filters };

  const investor = cleanText(scope.investor);
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
 * Một KHLCNT chứa NHIỀU gói thầu: e-GP trả song song hai mảng `bidName` và
 * `bidPrice` theo cùng thứ tự, cộng thêm `bidNamePlanNew` là dạng object.
 * Ghép chúng lại thành danh sách gói thầu để hiển thị.
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
  // Retain source indexes: an unnamed entry must not shift the following prices.
  const packages = source.map(({name, index, item}) => ({
    ...(item && typeof item === 'object' ? item : {}),
    name, price: parseMoney(prices[index]),
    investField: item?.investField ?? (tenderFieldOf(item) ? '' : singleSourceField),
    fieldCode: tenderFieldOf(item),
    ...(item?.locations ? {locations: listOf(item.locations).map(value => ({...value})), wardIdentities: recordWardIdentities(item)} : {})
  }));
  const fieldCodes = [...new Set(listOf(record.investField).map(cleanText).filter(Boolean))];

  const locations = listOf(record.locations);
  const provinces = [...new Set([record.provinceName,record.provName,...locations.map(l => l?.provName || l?.provinceName)].map(cleanText).filter(Boolean))];
  const wards = [...new Set([record.wardName,record.districtName,...locations.flatMap(l => [l?.wardName,l?.districtName])].map(cleanText).filter(Boolean))];

  const totalPackagePrice = packages.reduce((s, p) => s + (Number(p.price) || 0), 0);

  return {
    key: `${planNo}::${version}`,
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

/* --------------------------------------------------------------------------
 *  ĐỐI CHIẾU LẠI KẾT QUẢ CỦA e-GP
 *
 *  Truy vấn do e-GP dựng nên kết quả đã đúng theo định nghĩa của hệ thống.
 *  Dù vậy vẫn đối chiếu lại tại chỗ: nếu có bản ghi lệch tiêu chí thì hiện
 *  cảnh báo thay vì lặng lẽ trình bày như thể mọi thứ đều khớp.
 * ------------------------------------------------------------------------ */

/**
 * Kế hoạch này có đúng chủ đầu tư người dùng hỏi không?
 *
 * PHẢI khớp theo TỪNG TỪ, không so chuỗi liền. e-GP dùng kiểu "all-1" —
 * đủ mọi từ, không cần liền nhau và không cần đúng thứ tự. Trước đây hàm này
 * so chuỗi liền nên gắt hơn e-GP, khiến kết quả hợp lệ bị báo nhầm là "không
 * khớp tiêu chí": tra "Ban quản lý dự án" thì "Ban quản lý ĐẦU TƯ, phát triển
 * đô thị..." bị đánh dấu sai, dù chính e-GP coi là khớp.
 */
export function matchesInvestor(plan, query) {
  const q = foldText(query);
  if (!q) return true;
  const code = cleanText(query).toLowerCase();
  if (code && cleanText(plan.investorCode).toLowerCase().includes(code)) return true;
  const hay = plan.investorFold || foldText(plan.investorName);
  return q.split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
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
  // Mã loại gói không tồn tại (gõ sai, bộ săn lưu từ bản cũ, hằng số đổi tên)
  // trước đây rơi về '' và được hiểu là "không lọc gì" — trả về TOÀN BỘ kế
  // hoạch trong khi người dùng thấy bộ lọc đang bật. Nay nói thẳng ra.
  if (isUnknownCategory(value)) {
    return { kept: [], dropped: (plans || []).length, unknownPackages: 0,
      invalidCategory: String(value),
      message: `Loại gói thầu "${String(value)}" không có trong danh mục. Hãy chọn lại loại gói thầu.` };
  }
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
      if (Object.hasOwn(child, 'locations') || Object.hasOwn(child, 'wardIdentities') || Object.hasOwn(child, 'wardCode') || Object.hasOwn(child, 'districtCode')) {
        // `wards` nằm trong danh sách này vì nó là TÊN xã gom ở mức kế hoạch.
        // Bỏ sót nó thì một gói con đã khai địa bàn riêng vẫn mượn được tên xã
        // của kế hoạch mẹ để khớp — đúng kiểu mượn dữ liệu chỗ khác làm của
        // mình mà cả thiết kế này sinh ra để chặn.
        for (const key of ['locations','wardIdentities','wardCode','districtCode','wardParentCode','parentCode','provinceCodes','provinceCode','provinces','wards','location']) if (!Object.hasOwn(child, key)) delete record[key];
      }
      // Never inherit a plan's aggregate names/fields or total investment as
      // evidence for a child. Source-specific child metadata wins above.
      delete record.packages;
      const result = passesHardFilter(record, scoped, areas);
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
  return [...map.values()].sort(
    (a, b) => (firstStampMs(b, ['publicDate', 'decisionDate']) ?? 0) - (firstStampMs(a, ['publicDate', 'decisionDate']) ?? 0));
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
