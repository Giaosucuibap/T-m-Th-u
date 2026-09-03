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
  dateRangeFrom, firstStampMs, padRange } from './core.js';
import { EGP_ORIGIN } from './kqlcnt.js';

export const KHLCNT_TYPE = 'es-plan-project-p';
export const KHLCNT_STEP = 'plan-step-1';

/* ---------------------------------------------------------------------------
 *  LỌC THEO NGÀY — tránh lôi về kế hoạch của những năm cũ
 *
 *  Người dùng chọn địa bàn rồi vẫn nhận kế hoạch từ 2025 lẫn vào 2026, và mỗi
 *  lượt tra phải xét tới 485 kế hoạch mới lấy được 100 (chạm giới hạn trang).
 *  Khoanh theo ngày vừa cắt đúng thứ cần, vừa giảm hẳn khối lượng phải tải.
 *
 *  HAI LỚP, GIỐNG CÁCH ĐÃ LÀM Ở lib/bbmt.js:
 *
 *    1. MÁY CHỦ — gửi filter `range` trên `publicDate` (ngày đăng tải). Đây là
 *       trường duy nhất đã đo được là lọc khoảng chạy thật (xem lib/kqlcnt.js).
 *       Nhưng phép đo đó làm trên bản ghi `es-notify-contractor`, còn KHLCNT là
 *       `es-plan-project-p` — chính tệp này đã cảnh báo KHÔNG suy diễn từ loại
 *       bản ghi này sang loại kia. Nên đây chỉ là tối ưu tốc độ, không phải bảo đảm.
 *
 *    2. TẠI CHỖ — `khlcntInDateRange()` mới là thứ quyết định. Nó đối chiếu
 *       NGÀY PHÊ DUYỆT, đúng cái ngày người dùng nhìn thấy trên thẻ kết quả.
 *
 *  VÌ SAO KHOẢNG GỬI LÊN MÁY CHỦ ĐƯỢC NỚI BIÊN: hai lớp soi hai trường khác
 *  nhau — máy chủ soi ngày ĐĂNG TẢI, tại chỗ soi ngày PHÊ DUYỆT. Hai mốc lệch
 *  nhau vài ngày. Gửi lên đúng khoảng người dùng chọn thì máy chủ có thể cắt
 *  mất kế hoạch mà lớp tại chỗ lẽ ra giữ, tức là BỎ SÓT — thứ tệ nhất với
 *  người đi tìm thầu. Nới biên thì ranh giới chính xác do lớp tại chỗ quyết định.
 * ------------------------------------------------------------------------- */

/** Quy lựa chọn thời gian của người dùng về khoảng epoch ms. */
export function khlcntDateRange(scope = {}) {
  return dateRangeFrom(scope);
}

/** Mốc thời gian của một kế hoạch: ưu tiên NGÀY PHÊ DUYỆT vì đó là ngày hiển thị. */
function khlcntStampMs(plan) {
  return firstStampMs(plan, ['decisionDate', 'publicDate']);
}

/**
 * Kế hoạch này có nằm trong khoảng người dùng chọn không?
 *
 * Kế hoạch KHÔNG có mốc thời gian nào thì GIỮ LẠI — loại bỏ sẽ là tự bịa ra
 * kết luận từ chỗ không có dữ liệu.
 */
export function khlcntInDateRange(plan, range) {
  if (!range) return true;
  const t = khlcntStampMs(plan);
  if (t === null) return true;
  return t >= range.from && t <= range.to;
}

/** Biên an toàn cho khoảng gửi lên máy chủ, tính bằng ngày. */
export const KHLCNT_SERVER_PAD_DAYS = 30;

/**
 * Dựng truy vấn KHLCNT — TỰ DỰNG, không qua biểu mẫu e-GP.
 *
 * Vì sao đổi cách: mã xã/phường không có ở bất kỳ API hay thẻ DOM nào của e-GP
 * (đã thử 9 đường dẫn và soi cả dropdown), nên muốn lọc địa bàn thì buộc phải
 * điều khiển ô chọn của e-GP. Việc đó hay thất bại, và khi thất bại thì tiện
 * ích quét sạch 10.000 kế hoạch toàn quốc — vừa chậm vừa sai.
 *
 * Nay MỌI tiêu chí đều lọc ở phía máy chủ: chủ đầu tư, từ khoá, tỉnh và
 * xã/phường. Vì vậy chỉ chọn tỉnh cũng tra được, không bắt buộc nhập chủ đầu
 * tư như bản trước.
 *
 * @param {object} scope
 * @param {string} [scope.investor] tên hoặc mã định danh chủ đầu tư
 * @param {string} [scope.keyword]  từ khoá tên kế hoạch / tên gói thầu
 */
export function buildKhlcntQuery(scope = {}) {
  const filters = [
    { fieldName: 'type', searchType: 'in', fieldValues: [KHLCNT_TYPE] }
  ];

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

  /* Khoảng thời gian — dạng range + epoch mili-giây, dạng duy nhất e-GP hiểu.
     Nới biên vì máy chủ soi ngày đăng tải còn lớp tại chỗ soi ngày phê duyệt. */
  const range = padRange(dateRangeFrom(scope), KHLCNT_SERVER_PAD_DAYS);
  if (range) {
    filters.push({ fieldName: 'publicDate', searchType: 'range', from: range.from, to: range.to });
  }

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
  const version = cleanText(record.planVersion) || '00';

  const names = listOf(record.bidName).map(cleanText).filter(Boolean);
  const namesNew = listOf(record.bidNamePlanNew).map((x) => cleanText(x && x.name)).filter(Boolean);
  const prices = listOf(record.bidPrice);
  const source = namesNew.length >= names.length ? namesNew : names;
  const packages = source.map((name, i) => ({ name, price: parseMoney(prices[i]) }));

  const locations = listOf(record.locations);
  const provinces = [...new Set(locations.map((l) => cleanText(l && l.provName)).filter(Boolean))];
  const wards = [...new Set(locations.map((l) => cleanText(l && l.districtName)).filter(Boolean))];

  const totalPackagePrice = packages.reduce((s, p) => s + (Number(p.price) || 0), 0);

  return {
    key: `${planNo}::${version}`,
    planNo,
    version,
    planNoStand: cleanText(record.planNoStand) || `${planNo}-${version}`,
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
    investorFold: foldText(cleanText(record.procuringEntityName) || cleanText(record.investorName)),

    provinces,
    wards,
    location: locations
      .map((l) => [cleanText(l && l.districtName), cleanText(l && l.provName)].filter(Boolean).join(' - '))
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join('; '),

    packages,
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
 * Khớp theo HAI đường, vì sau sáp nhập xã/phường mới thường trùng tên với
 * huyện cũ, mà chủ đầu tư vẫn là "Ban quản lý dự án đầu tư xây dựng huyện <tên
 * cũ>" — hồ sơ của họ nằm ở địa bàn khác hoặc để trống địa bàn, nên lọc theo
 * `locations` một mình là bỏ sót:
 *
 *   1. Địa bàn của kế hoạch (`plan.wards`) chứa tên riêng đó, HOẶC
 *   2. TÊN CHỦ ĐẦU TƯ chứa tên riêng đó — bắt được ban quản lý dự án huyện cũ.
 *
 * Đường thứ hai là suy luận theo tên nên chỉ dùng để LỌC HIỂN THỊ; nó không
 * được dùng làm căn cứ cho số liệu chính thức (xem lib/provenance.js).
 */
export { wardCoreName };

export function matchesWard(plan, wardName) {
  const core = wardCoreName(wardName);
  if (!core) return true;
  if ((plan.wards || []).some((w) => wardCoreName(w).includes(core) || foldText(w).includes(core))) return true;
  const investor = plan.investorFold || foldText(plan.investorName);
  return Boolean(investor) && investor.includes(core);
}

/** Cách khớp nào làm kế hoạch này được giữ lại — để giao diện ghi rõ nguồn. */
export function wardMatchReason(plan, wardName) {
  const core = wardCoreName(wardName);
  if (!core) return null;
  if ((plan.wards || []).some((w) => wardCoreName(w).includes(core) || foldText(w).includes(core))) {
    return 'location';
  }
  const investor = plan.investorFold || foldText(plan.investorName);
  return investor && investor.includes(core) ? 'investorName' : null;
}

/** Kế hoạch này có đúng tỉnh người dùng hỏi không? */
export function matchesProvince(plan, provinceName) {
  const q = foldText(provinceName);
  if (!q) return true;
  return (plan.provinces || []).some((p) => foldText(p).includes(q));
}

/**
 * Lọc địa bàn NGAY TRÊN KẾT QUẢ ĐÃ TẢI, thay vì nhờ e-GP lọc.
 *
 * Máy chủ đã lọc theo chủ đầu tư / từ khoá rồi; tỉnh và xã/phường lọc ở đây.
 * Đổi cách vì mã xã/phường không lấy được từ e-GP (không có ở API nào, cũng
 * không có trên thẻ DOM của dropdown), nên muốn e-GP lọc thì buộc phải điều
 * khiển ô chọn — việc hay thất bại, và khi thất bại thì tiện ích quét sạch
 * 10.000 kế hoạch toàn quốc rồi trả kết quả sai địa bàn.
 *
 * Trả về `{kept, dropped}` để giao diện nói rõ đã bỏ bao nhiêu bản ghi.
 */
export function filterPlansByArea(plans, criteria = {}) {
  const kept = [];
  const dropped = [];
  for (const p of plans || []) {
    const ok = matchesProvince(p, criteria.province) && matchesWard(p, criteria.ward);
    (ok ? kept : dropped).push(p);
  }
  return { kept, dropped };
}

/**
 * Soát lại cả tập kết quả. Trả về danh sách bản ghi KHÔNG khớp tiêu chí, để
 * giao diện nói rõ với người dùng thay vì im lặng.
 */
export function auditPlans(plans, criteria = {}) {
  return (plans || []).filter((p) =>
    !matchesInvestor(p, criteria.investor) ||
    !matchesWard(p, criteria.ward) ||
    !matchesProvince(p, criteria.province));
}

/* --------------------------------------------------------------------------
 *  GỘP & THỐNG KÊ
 * ------------------------------------------------------------------------ */

export function dedupeKhlcnt(items) {
  const map = new Map();
  for (const item of items || []) {
    if (!item || !item.key) continue;
    map.set(item.key, { ...(map.get(item.key) || {}), ...item });
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.publicDate || b.decisionDate || 0) - new Date(a.publicDate || a.decisionDate || 0));
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
