/* ============================================================================
 *  Giáo Sư Cùi Bắp — lib/bbmt.js
 *  BIÊN BẢN MỞ THẦU — gói thầu ĐÃ MỞ THẦU nhưng CHƯA CÓ KẾT QUẢ, kèm giá dự
 *  thầu và TỶ LỆ GIẢM GIÁ của từng nhà thầu tham dự.
 *
 *  ---------------------------------------------------------------------------
 *  VÌ SAO TÍNH NĂNG NÀY PHẢI QUÉT, KHÔNG TRA THẲNG ĐƯỢC
 *  ---------------------------------------------------------------------------
 *  Với KQLCNT (lib/kqlcnt.js) ta lọc thẳng theo `winningCode` nên gõ mã số thuế
 *  là ra ngay. Với Biên bản mở thầu thì KHÔNG: chỉ mục tìm kiếm của e-GP không
 *  hề chứa danh tính nhà thầu tham dự. Đã kiểm chứng bằng đối chứng có kiểm soát
 *  trên dữ liệu thật (15/08/2026):
 *
 *    A. BBMT, không lọc nhà thầu                        -> 10.000 kết quả  ✔
 *    B. KQLCNT + winningCode (đối chứng dương)          ->     28 kết quả  ✔
 *    C. BBMT + winningCode của nhà thầu CHẮC CHẮN đang dự ->    0 kết quả  ✘
 *    D. BBMT + tìm theo tên nhà thầu                    ->      0 kết quả  ✘
 *
 *  Ngoài ra đã thử 11 tên trường khác nhau (contractorCode, bidderCode,
 *  orgCode, bidderTaxCode, participantCode, ...) — tất cả đều 0.
 *
 *  Danh sách nhà thầu tham dự CHỈ có ở trang chi tiết từng biên bản, qua
 *  `.../expose/ldtkqmt/bid-notification-p/bid-open` cho gói đơn và
 *  `.../expose/ldtkqmt/bid-notification-p/lotOpenDetail` cho phần/lô. Vì vậy quy
 *  trình bắt buộc là hai giai đoạn:
 *
 *    Giai đoạn 1 — LỌC TRÊN MÁY CHỦ (rẻ): lấy danh sách gói đã mở thầu chưa có
 *                  kết quả, theo tiêu chí người dùng đặt. 50 gói mỗi request.
 *    Giai đoạn 2 — ĐỌC CHI TIẾT (đắt): mở trang biên bản của từng gói,
 *                  ghép bảng với dự toán và loại biên bản; tối đa hai tab.
 *
 *  Do giai đoạn 2 tốn kém, tính năng LUÔN có trần số gói và nút dừng. Quét mù
 *  toàn bộ là bất khả thi: chỉ riêng Xây lắp trong 30 ngày đã có hơn 8.400 gói
 *  đang chờ kết quả.
 * ========================================================================== */

import { cleanText, foldText, parseMoney, parseDate,
  dateRangeFrom, firstStampMs } from './core.js';
import { CONFIDENCE, isOfficial } from './provenance.js';
import {
  EGP_ORIGIN, ES_INDEX, ES_TYPE_NOTIFY,
  normalizeTaxCodeForEgp, toWinningCode, priceFacts
} from './kqlcnt.js';

/**
 * Endpoint trả bảng nhà thầu của các phần/lô trong biên bản mở thầu.
 *
 * page-hook.js chạy trong MAIN world dưới dạng script thường nên không import
 * được hằng số này — nó khai báo lại y hệt chuỗi trên. Đổi ở đây thì phải đổi
 * cả bên đó, nếu không tiện ích sẽ im lặng không bắt được bảng nhà thầu.
 */
export const LOT_OPEN_DETAIL_ENDPOINT = '/services/expose/ldtkqmt/bid-notification-p/lotOpenDetail';
export const BID_OPEN_ENDPOINT = '/services/expose/ldtkqmt/bid-notification-p/bid-open';

// Public BBMT JSON can contain fractional VND (e.g. 2609041591.923).
// Keep those numbers intact; the general search parser rounds whole VND.
export function parseOpeningMoney(value) {
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value==='string'&&/^[+-]?\d{4,}\.\d+$/.test(value.trim()))return Number(value);
  return parseMoney(value);
}
export function formatOpeningMoney(value) {
  if(value===null||value===undefined||value==='')return 'Chưa xác định';
  const n=Number(value);
  return Number.isFinite(n)?`${n.toLocaleString('vi-VN',{maximumFractionDigits:3})} đ`:cleanText(value);
}

/** Match the notice and opening, tolerating absent optional URL placeholders. */
export function sameBbmtDetailPage(expectedUrl, actualUrl) {
  try {
    const a=new URL(expectedUrl), b=new URL(actualUrl);
    if(a.origin!==EGP_ORIGIN||b.origin!==EGP_ORIGIN||!b.pathname.endsWith('/contractor-selection'))return false;
    const value=(u,k)=>{const v=u.searchParams.get(k);return !v||v==='undefined'||v==='null'?'':v;};
    if(!value(a,'notifyNo')||value(a,'notifyNo')!==value(b,'notifyNo'))return false;
    const notice=u=>value(u,'notifyId')||value(u,'id');
    if(!notice(a)||notice(a)!==notice(b))return false;
    return !value(a,'bidOpenId')||!value(b,'bidOpenId')||value(a,'bidOpenId')===value(b,'bidOpenId');
  } catch { return false; }
}

/**
 * Các bước đã mở thầu nhưng CHƯA công bố kết quả lựa chọn nhà thầu.
 *   step-2-kqmt    — đã đăng tải biên bản mở thầu
 *   step-3-dsntdkt — đã có danh sách nhà thầu đáp ứng kỹ thuật
 * Gói đã có kết quả sẽ chuyển sang step-4-kqlcnt nên tự động rơi khỏi bộ lọc.
 */
export const STEPS_AWAITING_RESULT = ['notify-contractor-step-2-kqmt', 'notify-contractor-step-3-dsntdkt'];

/**
 * Bước ĐÃ CÔNG BỐ kết quả lựa chọn nhà thầu.
 *
 * VÌ SAO CẦN CÁI NÀY — ĐỂ TÌM RA GÓI TRƯỢT
 * ----------------------------------------
 * Muốn biết một nhà thầu TRƯỢT gói nào thì phải tìm gói mà họ CÓ dự nhưng
 * người khác thắng. Gói như vậy đã có kết quả, tức đang ở bước 4 — mà bộ lọc
 * `STEPS_AWAITING_RESULT` ở trên loại đúng bước đó ra.
 *
 * Hệ quả: quét "gói đang chờ kết quả" thì DÙ CÓ CHẠY BAO NHIÊU LẦN cũng không
 * bao giờ tìm ra một gói trượt nào. Không phải nhà thầu chưa từng trượt — mà
 * là chỗ đi tìm không thể chứa thứ cần tìm.
 *
 * Bảng nhà thầu dự (biên bản mở thầu) vẫn công khai sau khi có kết quả, nên
 * quét ở bước 4 rồi đọc bảng đó là cách duy nhất thấy được gói trượt.
 */
export const STEPS_DECIDED = ['notify-contractor-step-4-kqlcnt'];

/** Lĩnh vực cho ô chọn trên giao diện. */
export const FIELD_OPTIONS = [
  { value: '', label: 'Tất cả lĩnh vực' },
  { value: 'XL', label: 'Xây lắp' },
  { value: 'HH', label: 'Hàng hóa' },
  { value: 'TV', label: 'Tư vấn' },
  { value: 'PTV', label: 'Phi tư vấn' },
  { value: 'HON_HOP', label: 'Hỗn hợp' }
];

/* --------------------------------------------------------------------------
 *  GIAI ĐOẠN 1 — dựng truy vấn danh sách
 * ------------------------------------------------------------------------ */

/** Mốc thời gian ISO của "N ngày trước". Giữ lại cho mã cũ còn tham chiếu. */
export function daysAgoIso(days) {
  const n = Math.max(1, Number(days) || 30);
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 19);
}

/* ---------------------------------------------------------------------------
 *  LỌC THEO NGÀY MỞ THẦU THỰC TẾ
 *
 *  Mẫu tìm kiếm chính thức chỉ dùng publicDateKqmt với not_null. Trường này
 *  không đồng nghĩa ngày mở thầu: dữ liệu thật IB2600486024 có ngày công bố
 *  26/8/2026 nhưng bidRealityOpenDate là 5/9/2026. Lọc range theo ngày công
 *  bố có thể làm mất gói vừa mở dù người dùng chọn đúng khoảng ngày mở.
 *
 *  Vì vậy máy chủ chỉ lọc trạng thái, lĩnh vực và địa bàn đã được xác nhận;
 *  khoảng ngày được đối chiếu tại chỗ bằng bbmtInDateRange(). Không gửi một
 *  range cho trường ngày mở chưa được kiểm chứng trong truy vấn chính thức.
 * ------------------------------------------------------------------------- */

/**
 * Quy lựa chọn thời gian của người dùng về khoảng epoch ms.
 *
 * Chỉ là lớp gọi lại `dateRangeFrom()` của lib/core.js — dùng chung với màn
 * hình Kế hoạch lựa chọn nhà thầu để hai nơi không thể lệch logic.
 */
export function bbmtDateRange(scope = {}) {
  return dateRangeFrom(scope);
}

/** Mốc thời gian của một gói dùng để đối chiếu khoảng đã chọn. */
function bbmtStampMs(pkg) {
  // The control asks when bids opened. e-GP can retain an earlier publication
  // timestamp even when the actual opening occurred inside the selected range.
  return firstStampMs(pkg, ['bidRealityOpenDate', 'bidOpenDate', 'publicDateKqmt']);
}

/**
 * Gói này có nằm trong khoảng thời gian người dùng chọn không?
 *
 * Gói KHÔNG có mốc thời gian nào thì GIỮ LẠI, kèm nhãn cảnh báo ở giao diện —
 * loại bỏ sẽ là tự bịa ra kết luận "gói này ngoài khoảng" từ chỗ không có dữ liệu.
 */
export function bbmtInDateRange(pkg, range) {
  if (!range) return true;
  const t = bbmtStampMs(pkg);
  if (t === null) return true;
  return t >= range.from && t <= range.to;
}

/**
 * Dựng khối `query` lấy các gói ĐÃ MỞ THẦU, CHƯA CÓ KẾT QUẢ.
 *
 * @param {object} scope
 * @param {number} [scope.days]     Chỉ lấy gói mở thầu trong N ngày gần đây.
 * @param {string} [scope.field]    Mã lĩnh vực: XL | HH | TV | PTV | HON_HOP.
 * @param {string[]} [scope.provinces] Mã tỉnh (provCode) — bỏ trống là toàn quốc.
 * @param {number} [scope.minPrice] Giá gói thầu tối thiểu.
 * @param {number} [scope.maxPrice] Giá gói thầu tối đa.
 * @param {string} [scope.keyword]  Từ khoá tên gói thầu.
 */
export function buildBbmtQuery(scope = {}) {
  const filters = [
    { fieldName: 'type', searchType: 'in', fieldValues: [ES_TYPE_NOTIFY] },
    // Mặc định giữ nguyên hành vi cũ; truyền scope.steps để đi tìm gói trượt.
    { fieldName: 'stepCode', searchType: 'in',
      fieldValues: (scope.steps && scope.steps.length) ? scope.steps : STEPS_AWAITING_RESULT },
    // Chỉ lấy gói đã thực sự đăng tải biên bản mở thầu.
    { fieldName: 'publicDateKqmt', searchType: 'not_null', fieldValues: [''] }
  ];

  // Date scopes are applied to actual opening dates after list normalization.
  if (cleanText(scope.field)) {
    // Native advanced search maps the sector control to investField. bidField
    // is also present in returned records, but is not the native query field.
    filters.push({ fieldName: 'investField', searchType: 'in', fieldValues: [cleanText(scope.field)] });
  }
  const provinces = (scope.provinces || []).map(cleanText).filter(Boolean);
  if (provinces.length) {
    filters.push({ fieldName: 'locations.provCode', searchType: 'in', fieldValues: provinces });
  }
  /* Khoảng giá: CÙNG một lỗi như bộ lọc thời gian ở trên — hai filter
     greater_equal/less_equal chồng lên trường bidPrice, dạng mà e-GP bỏ qua
     lặng lẽ. Dạng đã bắt nguyên văn từ request do chính e-GP dựng (xem
     lib/kqlcnt.js) là MỘT filter `range` với from/to là SỐ. */
  const minPrice = Number(scope.minPrice) || 0;
  const maxPrice = Number(scope.maxPrice) || 0;
  if (minPrice > 0 || maxPrice > 0) {
    filters.push({ fieldName: 'bidPrice', searchType: 'range', from: minPrice, to: maxPrice || 9.99e14 });
  }

  const query = { index: ES_INDEX, filters };

  /* Lọc theo CHỦ ĐẦU TƯ là cách thu hẹp mạnh nhất khi đi tìm một nhà thầu cụ
     thể: nhà thầu địa phương dự đi dự lại của cùng vài chủ đầu tư. Không lọc
     được theo nhà thầu (chỉ mục e-GP không chứa danh tính người dự — xem đầu
     tệp này), nên chủ đầu tư là thứ thay thế gần nhất. */
  const investor = cleanText(scope.investor);
  const keyword = cleanText(scope.keyword);
  if (investor) {
    query.keyWord = investor;
    query.matchType = 'all-0';
    query.matchFields = ['investorName', 'investorCode', 'procuringEntityName', 'procuringEntityCode'];
  } else if (keyword) {
    query.keyWord = keyword;
    query.matchType = 'all-0';
    // Live IB2600486024 control: the same filters returned 0 with bidName
    // first and 1 with the native notifyNo-first order. Keep name searches
    // unchanged; this order fix does not strip versions or alter the keyword.
    query.matchFields = /^IB\d{10}(?:-\d{2})?$/i.test(keyword)
      ? ['notifyNo', 'bidName'] : ['bidName', 'notifyNo'];
  }
  return query;
}

/* --------------------------------------------------------------------------
 *  GIAI ĐOẠN 1 — chuẩn hoá bản ghi gói thầu
 * ------------------------------------------------------------------------ */

function firstOf(value) {
  if (Array.isArray(value)) return value.length ? value[0] : null;
  return value === undefined ? null : value;
}

function locationsOf(record) {
  const list = Array.isArray(record.locations) ? record.locations : [];
  return list
    .map((l) => [cleanText(l && l.districtName), cleanText(l && l.provName)].filter(Boolean).join(' - '))
    .filter(Boolean)
    .join('; ');
}

/** Trạng thái xét thầu do e-GP ghi ở `statusForNotify`. */
const STAGE_LABEL = {
  'notify-contractor-step-2-kqmt': 'Đã mở thầu, đang xét',
  'notify-contractor-step-3-dsntdkt': 'Đã có DS đáp ứng kỹ thuật'
};

/** Link sâu tới đúng trang Biên bản mở thầu của gói. */
export function buildBbmtDetailUrl(record) {
  const P = '_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render';
  const params = new URLSearchParams({
    p_p_id: 'egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2',
    p_p_lifecycle: '0',
    p_p_state: 'normal',
    p_p_mode: 'view',
    [P]: 'detail-v2',
    type: ES_TYPE_NOTIFY,
    stepCode: cleanText(record.stepCode) || STEPS_AWAITING_RESULT[0],
    id: cleanText(record.id || record.notifyId),
    notifyId: cleanText(record.notifyId || record.id),
    inputResultId: cleanText(record.inputResultId) || 'undefined',
    bidOpenId: cleanText(record.bidOpenId) || 'undefined',
    techReqId: cleanText(record.techReqId) || 'undefined',
    bidPreNotifyResultId: 'undefined',
    bidPreOpenId: 'undefined',
    processApply: cleanText(record.processApply),
    bidMode: cleanText(record.bidMode),
    notifyNo: cleanText(record.notifyNo),
    planNo: cleanText(record.planNo),
    pno: 'undefined',
    step: 'bbmt',
    isInternet: String(record.isInternet ?? ''),
    caseKHKQ: 'undefined',
    bidForm: cleanText(record.bidForm)
  });
  return `${EGP_ORIGIN}/vi/web/guest/contractor-selection?${params.toString()}`;
}

/** Chuẩn hoá một gói thầu đang chờ kết quả (giai đoạn 1). */
export function normalizeBbmtPackage(record) {
  if (!record || typeof record !== 'object') return null;
  const notifyNo = cleanText(record.notifyNo);
  if (!notifyNo) return null;
  const version = cleanText(record.notifyVersion) || '00';

  return {
    key: `${notifyNo}::${version}`,
    notifyNo,
    version,
    notifyNoStand: cleanText(record.notifyNoStand) || `${notifyNo}-${version}`,
    bidName: cleanText(firstOf(record.bidName)) || notifyNo,
    investorName: cleanText(record.investorName),
    location: locationsOf(record),
    field: cleanText(firstOf(record.investField) || record.bidField),
    bidForm: cleanText(record.bidForm),
    // Giá gói thầu — mốc để so với giá dự thầu của từng nhà thầu.
    bidPrice: parseMoney(firstOf(record.bidPrice)),
    priceBasis: parseMoney(firstOf(record.bidEstimatePrice)) > 0
      ? parseMoney(firstOf(record.bidEstimatePrice)) : parseMoney(firstOf(record.bidPrice)),
    priceBasisLabel: parseMoney(firstOf(record.bidEstimatePrice)) > 0
      ? 'Dự toán được duyệt (e-GP)' : 'Giá gói thầu (e-GP)',
    priceBasisSource: parseMoney(firstOf(record.bidEstimatePrice)) > 0 ? 'bidEstimatePrice' : 'bidPrice',
    bidOpenDate: parseDate(record.bidOpenDate),
    bidRealityOpenDate: parseDate(record.bidRealityOpenDate),
    publicDateKqmt: parseDate(record.publicDateKqmt),
    numBidderJoin: Number(record.numBidderJoin || 0),
    stepCode: cleanText(record.stepCode),
    stageLabel: STAGE_LABEL[cleanText(record.stepCode)] || 'Chưa có kết quả',
    planNo: cleanText(record.planNo),
    detailUrl: buildBbmtDetailUrl(record),
    // Giai đoạn 2 điền vào:
    bidders: null,
    scannedAt: null
  };
}

/* --------------------------------------------------------------------------
 *  GIAI ĐOẠN 2 — bảng nhà thầu tham dự
 * ------------------------------------------------------------------------ */

/**
 * Chuẩn hoá một dòng nhà thầu. Hook ánh xạ bảng bid-open sang cùng cấu trúc
 * giá dưới đây; lotOpenDetail đã dùng sẵn các trường này.
 *
 * Trường của e-GP:
 *   contractorCode  "vn" + mã số thuế
 *   lotPrice        Giá dự thầu
 *   discountPercent Tỷ lệ giảm giá (%) — nếu thiếu thì đối chiếu hai mức giá
 *   lotFinalPrice   Giá dự thầu sau giảm giá
 *   ventureName     Tên liên danh (nếu dự thầu theo liên danh)
 *   ranking/passedYn/succBidderYn  chỉ có ở các bước xét thầu về sau
 */
export function normalizeBidder(row, packageBidPrice) {
  if (!row || typeof row !== 'object') return null;
  const taxCode = normalizeTaxCodeForEgp(row.contractorCode);
  const name = cleanText(row.contractorName);
  if (!taxCode && !name) return null;

  const bidPrice = parseOpeningMoney(row.lotPrice);
  const reportedFinal = parseOpeningMoney(row.lotFinalPrice);
  // A missing percentage alone does not prove that the bidder offered no discount.
  const declared = row.discountPercent === null || row.discountPercent === undefined || row.discountPercent === ''
    ? null : Number(String(row.discountPercent).replace(',', '.'));
  const validDeclared = declared !== null && Number.isFinite(declared) && declared >= 0 && declared <= 100;
  const finalPrice = reportedFinal !== null ? reportedFinal
    : bidPrice !== null && validDeclared ? Math.round(bidPrice * (1 - declared / 100)*1000)/1000 : null;

  // Tỷ lệ giảm giá do nhà thầu khai. Nếu e-GP không ghi thì tự tính lại từ
  // giá dự thầu và giá sau giảm giá — hai nguồn này phải khớp nhau.
  const computed = priceFacts(bidPrice, reportedFinal).discountRate;
  const discountPercent = validDeclared ? declared : computed;

  // So giá cuối cùng của nhà thầu với giá gói thầu — đây mới là mức giảm mà
  // chủ đầu tư nhìn thấy, khác với mức giảm nhà thầu tự khai trên giá dự thầu.
  const vsPackage = priceFacts(packageBidPrice, finalPrice);

  return {
    taxCode,
    name: name || 'Chưa rõ tên',
    nameFold: foldText(name),
    ventureName: cleanText(row.ventureName),
    isVenture: Boolean(cleanText(row.ventureCode) || cleanText(row.ventureName)),
    bidPrice,
    discountPercent,
    finalPrice,
    vsPackageRate: vsPackage.discountRate,
    vsPackageAmount: vsPackage.savedAmount===null?null:Number(vsPackage.savedAmount.toFixed(3)),
    finalPriceDerived: reportedFinal === null && validDeclared,
    lotCode: cleanText(row.lotCode || row.lotNo),
    lotName: cleanText(row.lotName),
    guaranteeAmount: parseMoney(row.bidGuaranteeAmount),
    guaranteeDays: row.bidGuaranteeEff === null || row.bidGuaranteeEff === undefined ? null : Number(row.bidGuaranteeEff),
    // Các bước xét thầu về sau (có thể còn trống ở thời điểm mở thầu).
    ranking: row.ranking === null || row.ranking === undefined ? null : Number(row.ranking),
    passed: row.passedYn === null || row.passedYn === undefined ? null : Boolean(Number(row.passedYn)),
    techScore: row.techScore === null || row.techScore === undefined ? null : Number(row.techScore)
  };
}

/**
 * Chuẩn hoá cả bảng nhà thầu của một gói và xếp hạng theo giá sau giảm giá.
 * Trả về mảng đã sắp xếp: rẻ nhất đứng đầu.
 */
/* ---------------------------------------------------------------------------
 *  BỐN KẾT CỤC CỦA MỘT LẦN ĐỌC BIÊN BẢN
 *
 *  Trước đây chỉ có hai nhãn và cả hai đều nói sai:
 *    - e-GP trả bảng RỖNG  -> hiện "Chưa đọc biên bản gói này", y hệt gói còn
 *      chưa tới lượt. Người dùng thấy gói 1 ghi "chưa đọc" mà gói 3 đã có
 *      bảng, nên tưởng phần mềm trả kết quả lộn xộn. Thực ra đọc đúng thứ tự.
 *    - HẾT HẠN CHỜ -> hiện "e-GP không trả dữ liệu", một kết luận về e-GP mà
 *      ta không có cơ sở đưa ra. Hết hạn chờ chỉ có nghĩa là CHƯA BIẾT.
 * ------------------------------------------------------------------------- */
export const READ_STATE = {
  PENDING: 'PENDING',   // chưa tới lượt
  READING: 'READING',
  PARTIAL: 'PARTIAL',
  OK: 'OK',             // đọc được bảng nhà thầu
  EMPTY: 'EMPTY',       // đã đọc, biên bản chưa ghi nhận nhà thầu nào
  TIMEOUT: 'TIMEOUT'    // hết hạn chờ — chưa biết gói này thế nào
};

/**
 * Phân loại kết quả một lần đọc.
 * @param {Array|null} rows  mảng e-GP trả về, hoặc null khi hết hạn chờ
 */
export function bbmtReadState(rows) {
  if (!Array.isArray(rows)) return READ_STATE.TIMEOUT;
  return rows.length ? READ_STATE.OK : READ_STATE.EMPTY;
}

/** Đọc trạng thái của một gói, dung nạp dữ liệu lưu từ bản cũ chưa có readState. */
export function bbmtReadStateOf(pkg) {
  if (!pkg) return READ_STATE.PENDING;
  if (pkg.readState && READ_STATE[pkg.readState]) return pkg.readState;
  // Bản cũ chỉ có `bidders` và `scannedAt`.
  if (!pkg.scannedAt) return READ_STATE.PENDING;
  if (pkg.bidders === null) return READ_STATE.TIMEOUT;
  return (pkg.bidders || []).length ? READ_STATE.OK : READ_STATE.EMPTY;
}

export function normalizeBidderTable(rows, packageBidPrice) {
  const list = (Array.isArray(rows) ? rows : [])
    .map((r) => normalizeBidder(r, packageBidPrice))
    .filter(Boolean);

  // Chống trùng: một nhà thầu chỉ xuất hiện một lần trong một gói.
  const seen = new Map();
  for (const b of list) seen.set([b.taxCode || b.nameFold, b.ventureName, b.lotCode].join('|'), b);
  const unique = [...seen.values()];

  unique.sort((a, b) => {
    const x = a.finalPrice === null ? Infinity : a.finalPrice;
    const y = b.finalPrice === null ? Infinity : b.finalPrice;
    return x - y;
  });
  const multiLot = new Set(unique.map(b => b.lotCode).filter(Boolean)).size > 1;
  // A lot price cannot be compared with the estimate of the whole package.
  let rank = 0, previous = null;
  return unique.map((b, i) => {
    if (b.finalPrice !== previous) rank = i + 1;
    previous = b.finalPrice;
    return { ...b, priceRank: b.finalPrice === null || multiLot ? null : rank,
      vsPackageRate: multiLot ? null : b.vsPackageRate,
      vsPackageAmount: multiLot ? null : b.vsPackageAmount, multiLot };
  });
}

/**
 * Nhà thầu đang quan tâm có mặt trong bảng không?
 *
 * Trả về `{bidder, confidence}` chứ không chỉ bản ghi, vì hai cách khớp có độ
 * chắc chắn khác hẳn nhau:
 *   • khớp MÃ SỐ THUẾ  -> chắc chắn, được vào số liệu chính thức
 *   • khớp TÊN gần đúng -> chỉ là gợi ý, KHÔNG được vào số liệu
 *
 * Nếu nhiều nhà thầu cùng khớp tên thì đánh dấu mơ hồ, không tự chọn bừa một.
 */
export function findBidderDetailed(bidders, taxCode, nameQuery) {
  const list = bidders || [];
  const mst = normalizeTaxCodeForEgp(taxCode);
  if (mst) {
    const hit = list.find((b) => b.taxCode === mst);
    return hit
      ? { bidder: hit, confidence: CONFIDENCE.EXACT, ambiguity: false }
      : { bidder: null, confidence: null, ambiguity: false };
  }
  const want = foldText(nameQuery);
  if (!want) return { bidder: null, confidence: null, ambiguity: false };
  const hits = list.filter((b) => (b.nameFold || foldText(b.name)).includes(want));
  if (!hits.length) return { bidder: null, confidence: null, ambiguity: false };
  return {
    bidder: hits[0],
    confidence: CONFIDENCE.FUZZY,
    ambiguity: hits.length > 1,
    candidates: hits.map((b) => ({ taxCode: b.taxCode, name: b.name }))
  };
}

/** Bản rút gọn giữ lại cho chỗ chỉ cần biết có hay không. */
export function findBidder(bidders, taxCode, nameQuery) {
  return findBidderDetailed(bidders, taxCode, nameQuery).bidder;
}

/** Rút gọn phần định danh e-GP dùng để nhận biết trang biên bản đang mở. */
export function notifyNoFromUrl(url) {
  try {
    return cleanText(new URL(url).searchParams.get('notifyNo'));
  } catch {
    return '';
  }
}

/* --------------------------------------------------------------------------
 *  TỔNG HỢP
 * ------------------------------------------------------------------------ */

/**
 * Thống kê một lượt soi biên bản mở thầu, đứng từ góc nhìn nhà thầu quan tâm.
 */
export function summarizeBidOpenings(packages, taxCode, nameQuery) {
  const list = packages || [];
  const scanned = list.filter((p) => Array.isArray(p.bidders));
  const joined = [];
  const suggested = [];
  let ambiguousCount = 0;

  for (const p of scanned) {
    const hit = findBidderDetailed(p.bidders, taxCode, nameQuery);
    if (!hit.bidder) continue;
    const row = { pkg: p, me: hit.bidder, confidence: hit.confidence, ambiguity: hit.ambiguity };
    if (hit.ambiguity) ambiguousCount += 1;
    // Khớp gần đúng theo tên KHÔNG được vào số liệu chính thức.
    if (isOfficial(hit.confidence)) joined.push(row);
    else suggested.push(row);
  }

  const rates = joined
    .map((j) => j.me.discountPercent)
    .filter((r) => r !== null && r !== undefined && Number.isFinite(r))
    .sort((a, b) => a - b);

  const avgDiscount = rates.length
    ? Math.round((rates.reduce((s, r) => s + r, 0) / rates.length) * 100) / 100
    : null;

  const cheapest = joined.filter((j) => j.me.priceRank === 1).length;
  const totalBidValue = joined.reduce((s, j) => s + (Number(j.me.finalPrice) || 0), 0);
  const byDate = (a, b) =>
    new Date(b.pkg.bidRealityOpenDate || b.pkg.publicDateKqmt || 0) -
    new Date(a.pkg.bidRealityOpenDate || a.pkg.publicDateKqmt || 0);

  return {
    candidates: list.length,
    scanned: scanned.length,
    joinedCount: joined.length,
    cheapestCount: cheapest,
    avgDiscount,
    bestDiscount: rates.length ? rates[rates.length - 1] : null,
    totalBidValue,
    joined: joined.sort(byDate),

    // Phần chỉ là gợi ý — hiện riêng, có nhãn, không cộng vào số liệu trên.
    suggested: suggested.sort(byDate),
    ambiguity: suggested.length > 0 || ambiguousCount > 0,
    ambiguityNote: suggested.length
      ? `${suggested.length} gói chỉ khớp gần đúng theo tên nên không tính vào số liệu. `
        + 'Nhập mã số thuế để có kết quả chắc chắn.'
      : (ambiguousCount ? `${ambiguousCount} gói có nhiều nhà thầu cùng khớp tên.` : '')
  };
}
