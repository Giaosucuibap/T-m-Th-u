/* ============================================================================
 *  Giáo Sư Cùi Bắp — lib/kqlcnt.js
 *  TRA CỨU KẾT QUẢ LỰA CHỌN NHÀ THẦU (KQLCNT) trên Hệ thống mạng đấu thầu
 *  quốc gia — muasamcong.mpi.gov.vn (e-GP v2).
 *
 *  Toàn bộ hằng số dưới đây được đối chiếu trực tiếp với giao diện thật của
 *  e-GP (module egp-portal-contractor-selection-v2), nên kết quả trả về là
 *  đúng nguyên bản dữ liệu công khai mà chính trang e-GP hiển thị.
 *
 *  ĐIỂM MẤU CHỐT VỀ ĐỘ CHÍNH XÁC
 *  -----------------------------
 *  e-GP đánh dấu nhà thầu trúng thầu bằng trường `winningCode` — là MÃ SỐ THUẾ
 *  có tiền tố "vn" (ví dụ MST 5400512273 -> "vn5400512273"). Đây là khoá định
 *  danh duy nhất và chính xác tuyệt đối:
 *
 *    • Với gói thầu một nhà thầu  : winningCode = [MST của nhà thầu trúng]
 *    • Với gói thầu LIÊN DANH     : winningCode = [MST của TẤT CẢ thành viên]
 *      và `contractorName` chỉ là tên liên danh (ví dụ "Liên danh Gói thầu số
 *      14"), KHÔNG chứa tên từng thành viên.
 *
 *  Vì vậy tra cứu theo TÊN sẽ BỎ SÓT các gói trúng theo liên danh, còn tra cứu
 *  theo winningCode thì không bỏ sót gói nào. Module này luôn quy tên công ty
 *  về mã số thuế trước khi chốt kết quả.
 *
 *  LƯU Ý: thứ tự phần tử trong `winningCode` KHÔNG khớp thứ tự trong
 *  `winningContractorName` (đã kiểm chứng trên dữ liệu thật), nên tuyệt đối
 *  không ghép cặp hai mảng này theo chỉ số.
 * ========================================================================== */

import { cleanText, foldText, parseMoney, parseDate, formatMoney, wardCoreName } from './core.js';
import { CONFIDENCE, withProvenance, explainDiscount, PRICE_BASIS_SOURCE } from './provenance.js';

export const EGP_ORIGIN = 'https://muasamcong.mpi.gov.vn';

/** Trang tìm kiếm Lựa chọn nhà thầu (chế độ tìm kiếm nâng cao). */
export const EGP_SEARCH_PAGE = `${EGP_ORIGIN}/vi/web/guest/contractor-selection?render=search`;

/** Endpoint tìm kiếm thật của e-GP. Chỉ dùng để nhận diện request cần can thiệp. */
export const EGP_SEARCH_ENDPOINT = '/o/egp-portal-contractor-selection-v2/services/smart/search';

/** Chỉ mục Elasticsearch + bộ lọc cố định để chỉ lấy đúng bản ghi KQLCNT. */
export const ES_INDEX = 'es-contractor-selection';
export const ES_TYPE_NOTIFY = 'es-notify-contractor';
export const ES_STEP_KQLCNT = 'notify-contractor-step-4-kqlcnt';

/** Số bản ghi mỗi trang. e-GP chấp nhận 10 / 20 / 50; 50 là mức lớn nhất. */
export const PAGE_SIZE = 50;

/* --------------------------------------------------------------------------
 *  GIÁ & TỶ LỆ GIẢM GIÁ — cơ sở so sánh
 *
 *  Trường `bidPrice` của chỉ mục tìm kiếm KQLCNT KHÔNG phải lúc nào cũng là
 *  "Giá gói thầu". Đã đối chiếu với trang chi tiết của e-GP trên hai gói thật:
 *
 *    IB2600455310 — Dự toán: (trống)          Giá gói thầu: 1.116.030.000
 *                   bidPrice = 1.116.030.000  -> chính là GIÁ GÓI THẦU
 *
 *    IB2600267317 — Dự toán: 70.379.316.000   Giá gói thầu: 62.470.200.000
 *                   bidPrice = 70.379.316.000 -> chính là DỰ TOÁN
 *
 *  Nghĩa là e-GP lập chỉ mục theo quy tắc: DỰ TOÁN được duyệt sau KHLCNT nếu
 *  có, ngược lại lấy GIÁ GÓI THẦU. Đây đúng là mốc trần dùng để đánh giá hồ sơ
 *  dự thầu theo Luật Đấu thầu, nên cũng là mẫu số đúng để tính tỷ lệ giảm giá.
 *
 *  Kiểm chứng lại bằng chính số liệu trên: nếu lấy nhầm "Giá gói thầu"
 *  62.470.200.000 làm mẫu số cho gói IB2600267317 thì giá trúng 70.049.971.000
 *  sẽ thành "tăng 12%" — vô lý. Lấy dự toán thì ra "giảm 0,47%" — hợp lý.
 *
 *  LƯU Ý VỀ "GIÁ DỰ THẦU": giá dự thầu của từng nhà thầu (và giá sau hiệu
 *  chỉnh sai lệch) chỉ có ở TRANG CHI TIẾT từng gói, không có trong chỉ mục
 *  tìm kiếm. Lấy được nó sẽ tốn thêm một request cho mỗi gói, nên tiện ích
 *  không lấy hàng loạt; mỗi dòng kết quả đều có link mở thẳng trang chi tiết.
 * ------------------------------------------------------------------------ */

/** Trạng thái KQLCNT do e-GP trả về ở trường `statusForNotify`. */
const NOTIFY_STATUS = {
  CNTTT: 'Có nhà thầu trúng thầu',
  KCNTTT: 'Không có nhà thầu trúng thầu',
  HUY: 'Hủy thầu'
};

/** Lĩnh vực (`investField` / `bidField`). */
const FIELD_LABEL = {
  HH: 'Hàng hóa',
  XL: 'Xây lắp',
  TV: 'Tư vấn',
  PTV: 'Phi tư vấn',
  HON_HOP: 'Hỗn hợp'
};

/** Hình thức lựa chọn nhà thầu (`bidForm`). */
const BID_FORM_LABEL = {
  DTRR: 'Đấu thầu rộng rãi',
  DTHC: 'Đấu thầu hạn chế',
  CHCT: 'Chào hàng cạnh tranh',
  CDT: 'Chỉ định thầu',
  CDTRG: 'Chỉ định thầu rút gọn',
  MSTT: 'Mua sắm trực tiếp',
  TTH: 'Tự thực hiện',
  CGTT: 'Chào giá trực tuyến',
  DBDT: 'Đàm phán giá'
};

/* --------------------------------------------------------------------------
 *  MÃ SỐ THUẾ
 * ------------------------------------------------------------------------ */

/**
 * Chuẩn hoá mã số thuế Việt Nam về dạng e-GP dùng để so khớp.
 * Chấp nhận: "5400512273", "5400512273-001", "0301234567 - 001", "vn5400512273".
 * Trả về chuỗi 10 chữ số (mã đơn vị chính) hoặc '' nếu không phải MST.
 *
 * e-GP lập chỉ mục nhà thầu theo MST 10 số của pháp nhân, không theo mã chi
 * nhánh 3 số phía sau, nên phần đuôi được lược bỏ có chủ đích.
 */
export function normalizeTaxCodeForEgp(value) {
  const digits = cleanText(value).replace(/^vn/i, '').replace(/[^0-9]/g, '');
  if (digits.length === 10 || digits.length === 13) return digits.slice(0, 10);
  return '';
}

/** Ghép MST thành mã `winningCode` mà e-GP dùng: "vn" + 10 chữ số. */
export function toWinningCode(taxCode) {
  const mst = normalizeTaxCodeForEgp(taxCode);
  return mst ? `vn${mst}` : '';
}

/** Tách MST khỏi `winningCode` ("vn5400512273" -> "5400512273"). */
export function fromWinningCode(code) {
  return normalizeTaxCodeForEgp(code);
}

/** Người dùng đang nhập MST hay tên công ty? */
export function looksLikeTaxCode(value) {
  return Boolean(normalizeTaxCodeForEgp(value));
}

/* --------------------------------------------------------------------------
 *  DỰNG TRUY VẤN GỬI LÊN e-GP
 * ------------------------------------------------------------------------ */

/**
 * Dựng khối `query` cho endpoint smart/search của e-GP.
 *
 * @param {object} plan
 * @param {string[]} [plan.taxCodes]  Danh sách MST -> lọc chính xác theo winningCode.
 * @param {string}   [plan.keyword]   Tên công ty -> dò theo contractorName (chỉ dùng
 *                                    ở bước KHÁM PHÁ mã số thuế, không dùng để chốt).
 * @param {string}   [plan.matchType] Kiểu khớp của e-GP: all-1 | all-0 | any-1 | any-0 | exact.
 */
export function buildKqlcntQuery(plan = {}) {
  const filters = [
    { fieldName: 'type', searchType: 'in', fieldValues: [ES_TYPE_NOTIFY] },
    { fieldName: 'stepCode', searchType: 'in', fieldValues: [ES_STEP_KQLCNT] }
  ];

  const codes = [...new Set((plan.taxCodes || []).map(toWinningCode).filter(Boolean))];
  if (codes.length) {
    filters.push({ fieldName: 'winningCode', searchType: 'in', fieldValues: codes });
  }

  const query = { index: ES_INDEX, filters };

  const keyword = cleanText(plan.keyword);
  if (keyword && !codes.length) {
    // Chỉ dò theo tên khi CHƯA biết mã số thuế. "all-0" = khớp tất cả các từ,
    // không phân biệt dấu — đúng lựa chọn e-GP cung cấp trên giao diện.
    query.keyWord = keyword;
    query.matchType = plan.matchType || 'all-0';
    query.matchFields = ['contractorName'];
  }

  return query;
}

/**
 * Dựng truy vấn "soi địa bàn": mọi kết quả trúng thầu của các CHỦ ĐẦU TƯ mang
 * tên một xã/phường (hoặc huyện cũ).
 *
 * VÌ SAO LỌC THEO TÊN CHỦ ĐẦU TƯ CHỨ KHÔNG PHẢI ĐỊA BÀN
 *
 * Bản ghi KQLCNT của e-GP KHÔNG có trường địa bàn nào — đã kiểm chứng bằng
 * cách liệt kê toàn bộ 43 khoá của một bản ghi thật: không `locations`, không
 * `provName`, không `districtName`. Chỉ có `investorName` và `investorCode`.
 *
 * May mắn là với câu hỏi người dùng đang hỏi — "xã này hay có công ty nào
 * trúng" — thì lọc theo tên chủ đầu tư lại ĐÚNG hơn lọc theo địa bàn: tiền của
 * một xã do "UBND xã <tên>" hoặc "Ban QLDA huyện <tên>" chi, nên tên đơn vị
 * chính là thứ ràng buộc quan hệ.
 *
 * Dùng TÊN RIÊNG đã bỏ tiền tố ("Hàm Đức" thay vì "Xã Hàm Đức") để bắt hết mọi
 * đơn vị của địa bàn. Đã đo trên e-GP:
 *   "Xã Hàm Đức" →  20 gói (chỉ UBND xã)
 *   "Hàm Đức"    →  56 gói (thêm các đơn vị khác cùng địa bàn)
 *   "Đơn Dương"  → 477 gói (UBND xã, huyện uỷ, ban QLDA huyện cũ...)
 *
 * @param {object} scope
 * @param {string} scope.ward  tên xã/phường/huyện, có hay không tiền tố đều được
 */
export function buildWardMarketQuery(scope = {}) {
  const core = wardCoreName(scope.ward);
  if (!core) return null;

  const filters = [
    { fieldName: 'type', searchType: 'in', fieldValues: [ES_TYPE_NOTIFY] },
    { fieldName: 'stepCode', searchType: 'in', fieldValues: [ES_STEP_KQLCNT] }
  ];

  /* --- Năm đăng tải kết quả -------------------------------------------
   * Trường lọc được là `publicDate`, và GIÁ TRỊ PHẢI LÀ MỐC EPOCH MILI-GIÂY.
   * Đã đo trên e-GP: `decisionDate` (ngày phê duyệt) trả về 0 ở cả ba định
   * dạng thử (epoch, yyyy-MM-dd, dd/MM/yyyy) — trường đó không lập chỉ mục
   * để lọc khoảng. Còn `publicDate` dạng epoch cho 262/477 gói khi đặt
   * 2024–2025, và ngày phê duyệt của kết quả trả về đúng nằm trong khoảng.
   *
   * Vì vậy giao diện phải gọi đây là "năm ĐĂNG TẢI kết quả", không phải
   * "năm phê duyệt" — hai mốc này lệch nhau. */
  const fromYear = Number(scope.fromYear) || 0;
  const toYear = Number(scope.toYear) || 0;
  if (fromYear || toYear) {
    filters.push({
      fieldName: 'publicDate',
      searchType: 'range',
      from: Date.UTC(fromYear || 2000, 0, 1),
      to: Date.UTC(toYear || new Date().getFullYear(), 11, 31, 23, 59, 59)
    });
  }

  /* --- Khoảng giá gói thầu ---------------------------------------------
   * Đã bắt được nguyên văn từ request e-GP tự dựng: `from`/`to` là SỐ, không
   * phải chuỗi. */
  const minPrice = Number(scope.minPrice) || 0;
  const maxPrice = Number(scope.maxPrice) || 0;
  if (minPrice || maxPrice) {
    filters.push({
      fieldName: 'bidPrice',
      searchType: 'range',
      from: minPrice,
      to: maxPrice || 9.99e14
    });
  }

  // Lĩnh vực: XL (xây lắp), HH (hàng hoá), TV (tư vấn), PTV (phi tư vấn), HON_HOP.
  const fields = (scope.fields || []).filter(Boolean);
  if (fields.length) filters.push({ fieldName: 'investField', searchType: 'in', fieldValues: fields });

  // Hình thức lựa chọn nhà thầu: DTRR, CHCT, CDT, CDTRG...
  const forms = (scope.forms || []).filter(Boolean);
  if (forms.length) filters.push({ fieldName: 'bidForm', searchType: 'in', fieldValues: forms });

  // Qua mạng ('1') hay không qua mạng ('0').
  const online = cleanText(scope.online);
  if (online === '0' || online === '1') {
    filters.push({ fieldName: 'isInternet', searchType: 'in', fieldValues: [online] });
  }

  return {
    index: ES_INDEX,
    keyWord: cleanText(scope.ward)
      .replace(/^(Xã|Phường|Thị trấn|Thị xã|Quận|Huyện|Tỉnh|Thành phố|TP\.?)\s+/i, '').trim() || core,
    matchType: 'all-0',
    matchFields: ['investorName', 'investorCode'],
    filters
  };
}

/** Bước TBMT — thông báo mời thầu. */
export const ES_STEP_TBMT = 'notify-contractor-step-1-tbmt';

/**
 * Dựng truy vấn TÌM THÔNG BÁO MỜI THẦU — tự dựng, không qua biểu mẫu e-GP.
 *
 * VÌ SAO ĐỔI: đây là chức năng cuối cùng còn điều khiển biểu mẫu của e-GP.
 * Cách đó không lọc được khi người dùng CHỈ chọn tỉnh mà bỏ trống chủ đầu tư
 * và xã/phường — đúng lỗi người dùng gặp. Ba chức năng kia đã tự dựng truy vấn
 * từ lâu và chạy ổn, nên nay thống nhất nốt.
 *
 * ĐÃ ĐO TRÊN e-GP THẬT (Tỉnh Lâm Đồng):
 *     chỉ TBMT, không lọc                      -> 10.000
 *     + locations.provCode in ["68","703"]     ->    579   ✔
 *     + bidPrice range from 3.000.000.000      ->    186   ✔
 *     + locations.districtCode in ["23122"]    ->      0   ✘
 *
 * Nên TỈNH lọc được ở máy chủ, còn XÃ/PHƯỜNG thì KHÔNG — mã xã có thật và đúng
 * dạng nhưng e-GP không trả gì. Vì vậy xã/phường được lọc tại chỗ sau khi tải,
 * giống cách làm ở lib/khlcnt.js.
 *
 * Mã tỉnh phải gửi ĐỦ MỌI MÃ CÙNG TÊN: sau sáp nhập 1/7/2025 một tỉnh mang hai
 * mã (Lâm Đồng = 68 hiện hành + 703 cũ), thiếu mã là bỏ sót hồ sơ cũ.
 *
 * @param {object} c
 * @param {string[]} [c.provinces] danh sách MÃ tỉnh (không phải tên)
 * @param {string}   [c.investor]  tên hoặc mã chủ đầu tư
 * @param {string}   [c.keyword]   từ khoá tên gói thầu / mã TBMT
 * @param {number}   [c.minPrice]
 * @param {number}   [c.maxPrice]
 */
export function buildTbmtQuery(c = {}) {
  const filters = [
    { fieldName: 'type', searchType: 'in', fieldValues: [ES_TYPE_NOTIFY] },
    { fieldName: 'stepCode', searchType: 'in', fieldValues: [ES_STEP_TBMT] }
  ];

  const provinces = (c.provinces || []).map(cleanText).filter(Boolean);
  if (provinces.length) {
    filters.push({ fieldName: 'locations.provCode', searchType: 'in', fieldValues: provinces });
  }

  const minPrice = Number(c.minPrice) || 0;
  const maxPrice = Number(c.maxPrice) || 0;
  if (minPrice || maxPrice) {
    // `from`/`to` là SỐ — đã bắt nguyên văn từ request e-GP tự dựng.
    filters.push({ fieldName: 'bidPrice', searchType: 'range', from: minPrice, to: maxPrice || 9.99e14 });
  }

  const query = { index: ES_INDEX, filters };

  /* Chỉ gửi được MỘT khối keyWord. Ưu tiên chủ đầu tư vì nó thu hẹp mạnh hơn
     và là thứ người dùng hay dùng để theo dõi một đơn vị cụ thể. */
  const investor = cleanText(c.investor);
  const keyword = cleanText(c.keyword);
  if (investor) {
    query.keyWord = investor;
    query.matchType = 'all-0';
    query.matchFields = ['investorName', 'investorCode', 'procuringEntityName', 'procuringEntityCode'];
  } else if (keyword) {
    query.keyWord = keyword;
    query.matchType = 'all-0';
    query.matchFields = ['bidName', 'notifyNo'];
  }
  return query;
}

/**
 * Gói thầu này có thuộc xã/phường người dùng hỏi không?
 *
 * Lọc TẠI CHỖ vì e-GP không lọc được theo mã xã (xem ghi chú trên).
 */
export function tbmtMatchesWard(record, wardName) {
  const core = wardCoreName(wardName);
  if (!core) return true;
  const list = Array.isArray(record.locations) ? record.locations : [];
  const names = list.map((l) => cleanText(l && l.districtName)).filter(Boolean);
  const hay = names.length ? names : [cleanText(record.location)];
  return hay.some((n) => wardCoreName(n).includes(core) || foldText(n).includes(core));
}

/* --------------------------------------------------------------------------
 *  ĐỌC PHẢN HỒI
 * ------------------------------------------------------------------------ */

/** Bóc phần phân trang từ phản hồi e-GP: {page:{content,totalPages,...}}. */
export function readPageEnvelope(data) {
  const page = data && data.page ? data.page : null;
  if (!page) return null;
  return {
    content: Array.isArray(page.content) ? page.content : [],
    totalPages: Number(page.totalPages || 0),
    totalElements: Number(page.totalElements || 0),
    currentPage: Number(page.currentPage || 0),
    pageSize: Number(page.pageSize || 0)
  };
}

function firstOf(value) {
  if (Array.isArray(value)) return value.length ? value[0] : null;
  return value === undefined ? null : value;
}

function listOf(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  const one = cleanText(value);
  return one ? [one] : [];
}

/**
 * Tính bộ số liệu giá của một gói.
 *
 *   priceBasis    mốc trần (dự toán nếu có, ngược lại giá gói thầu)
 *   winningPrice  giá trúng thầu
 *   savedAmount   số tiền giảm được (âm nếu giá trúng cao hơn mốc trần)
 *   discountRate  tỷ lệ giảm giá, đơn vị %, làm tròn 2 chữ số thập phân
 *
 * Trả `null` cho các số dẫn xuất khi thiếu dữ liệu hoặc mốc trần bằng 0 —
 * tuyệt đối không suy đoán, vì đây là số liệu tài chính.
 */
/**
 * Làm tròn 2 chữ số thập phân, chống sai số dấu phẩy động.
 *
 * Không có epsilon thì trung vị của [0,47 ; 5,02] ra 2,74 thay vì 2,745 -> 2,75,
 * vì 0.47 + 5.02 trong dấu phẩy động là 5.489999999999999. Với số liệu tài
 * chính hiển thị cho người dùng thì độ lệch kiểu này không chấp nhận được.
 */
function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function priceFacts(basis, winning) {
  const b = Number.isFinite(basis) ? basis : null;
  const w = Number.isFinite(winning) ? winning : null;
  if (b === null || w === null || b <= 0) {
    return { priceBasis: b, winningPrice: w, savedAmount: null, discountRate: null };
  }
  const saved = b - w;
  return {
    priceBasis: b,
    winningPrice: w,
    savedAmount: saved,
    discountRate: round2((saved / b) * 100)
  };
}

/** "giảm 4,53%" / "cao hơn 1,20%" / "—" */
export function formatDiscount(rate) {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return '—';
  const text = `${Math.abs(rate).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  if (rate > 0) return `giảm ${text}`;
  if (rate < 0) return `cao hơn ${text}`;
  return 'không giảm';
}

function locationsOf(record) {
  const list = Array.isArray(record.locations) ? record.locations : [];
  return list
    .map((l) => [cleanText(l && l.districtName), cleanText(l && l.provName)].filter(Boolean).join(' - '))
    .filter(Boolean)
    .join('; ');
}

/**
 * Dựng LINK SÂU tới đúng trang chi tiết KQLCNT trên e-GP.
 *
 * Trước đây tiện ích cho rằng e-GP không có link chia sẻ trực tiếp nên phải mở
 * trang tìm kiếm rồi tự gõ mã TBMT. Thực tế module contractor-selection-v2 có
 * route `render=detail-v2` nhận đủ tham số qua query string — dưới đây là đúng
 * bộ tham số mà chính e-GP sinh ra cho mỗi thẻ kết quả KQLCNT.
 */
export function buildKqlcntDetailUrl(record) {
  const P = '_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render';
  const params = new URLSearchParams({
    p_p_id: 'egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2',
    p_p_lifecycle: '0',
    p_p_state: 'normal',
    p_p_mode: 'view',
    [P]: 'detail-v2',
    type: ES_TYPE_NOTIFY,
    stepCode: ES_STEP_KQLCNT,
    id: cleanText(record.id || record.notifyId),
    notifyId: cleanText(record.notifyId || record.id),
    inputResultId: cleanText(record.inputResultId),
    bidOpenId: cleanText(record.bidOpenId) || 'undefined',
    techReqId: cleanText(record.techReqId) || 'undefined',
    bidPreNotifyResultId: cleanText(record.bidPreNotifyResultId) || 'undefined',
    bidPreOpenId: cleanText(record.bidPreOpenId) || 'undefined',
    processApply: cleanText(record.processApply),
    bidMode: cleanText(record.bidMode),
    notifyNo: cleanText(record.notifyNo),
    planNo: cleanText(record.planNo),
    pno: 'undefined',
    step: 'kqlcnt',
    isInternet: String(record.isInternet ?? ''),
    caseKHKQ: record.caseKHKQ === undefined || record.caseKHKQ === null ? 'undefined' : String(record.caseKHKQ),
    bidForm: cleanText(record.bidForm)
  });
  return `${EGP_ORIGIN}/vi/web/guest/contractor-selection?${params.toString()}`;
}

/**
 * Chuẩn hoá một bản ghi KQLCNT thô của e-GP thành dạng dùng trong tiện ích.
 *
 * @param {object} record   Bản ghi trong page.content
 * @param {string} [focusTaxCode] MST đang tra cứu — dùng để xác định vai trò
 *                                (trúng độc lập / trúng theo liên danh).
 */
export function normalizeKqlcntRecord(record, focusTaxCode = '') {
  if (!record || typeof record !== 'object') return null;
  const notifyNo = cleanText(record.notifyNo);
  if (!notifyNo) return null;

  const winningCodes = listOf(record.winningCode).map(fromWinningCode).filter(Boolean);
  const memberNames = listOf(record.winningContractorName);
  const displayNames = listOf(record.contractorName);
  const ventureName = cleanText(record.ventureName);
  // `winningCode` mới là danh sách thành viên có định danh chắc chắn. e-GP có
  // thể không trả `ventureName` hoặc chỉ trả một tên hiển thị cho cả liên danh,
  // nên chỉ dựa vào tên sẽ biến gói nhiều thành viên thành gói trúng độc lập.
  const isVenture = Boolean(ventureName) || winningCodes.length > 1 || memberNames.length > 1;

  const focus = normalizeTaxCodeForEgp(focusTaxCode);
  const version = cleanText(record.notifyVersion) || '00';

  const out = {
    // Khoá chống trùng: một KQLCNT là duy nhất theo (mã TBMT + phiên bản).
    key: `${notifyNo}::${version}`,
    notifyNo,
    version,
    notifyNoStand: cleanText(record.notifyNoStand) || `${notifyNo}-${version}`,

    bidName: cleanText(firstOf(record.bidName)) || notifyNo,
    investorName: cleanText(record.investorName),
    investorCode: cleanText(record.investorCode),
    location: locationsOf(record),

    field: cleanText(firstOf(record.investField) || record.bidField),
    fieldLabel: FIELD_LABEL[cleanText(firstOf(record.investField) || record.bidField)] || '',
    bidForm: cleanText(record.bidForm),
    bidFormLabel: BID_FORM_LABEL[cleanText(record.bidForm)] || cleanText(record.bidForm),
    isInternet: Number(record.isInternet) === 1,

    // Giá trị. `priceBasis` là mốc trần để so sánh (dự toán nếu có, ngược lại
    // là giá gói thầu) — xem ghi chú "GIÁ & TỶ LỆ GIẢM GIÁ" ở đầu tệp.
    ...priceFacts(parseMoney(firstOf(record.bidPrice)), parseMoney(firstOf(record.bidWinningPrice))),

    // Mốc thời gian.
    decisionDate: parseDate(record.decisionDate),
    publicDateKqlcnt: parseDate(record.publicDateKqlcnt || record.publicDate),
    bidOpenDate: parseDate(record.bidOpenDate),
    bidCloseDate: parseDate(record.bidCloseDate),

    // Nhà thầu trúng thầu.
    isVenture,
    ventureName,
    winnerName: isVenture ? (ventureName || displayNames[0] || '') : (displayNames[0] || memberNames[0] || ''),
    memberNames,
    winningTaxCodes: winningCodes,

    // Vai trò của nhà thầu đang tra cứu trong gói này.
    matchedFocus: Boolean(focus) && winningCodes.includes(focus),
    focusRole: !focus
      ? ''
      : winningCodes.includes(focus)
        ? (isVenture ? 'Trúng thầu (thành viên liên danh)' : 'Trúng thầu (độc lập)')
        : '',

    // Diễn giải tỷ lệ giảm kèm công thức và nguồn giá — để kiểm chứng được.
    discount: explainDiscount(
      parseMoney(firstOf(record.bidPrice)),
      parseMoney(firstOf(record.bidWinningPrice)),
      record.bidEstimatePrice ? PRICE_BASIS_SOURCE.ESTIMATE : PRICE_BASIS_SOURCE.PACKAGE,
      buildKqlcntDetailUrl(record)),

    statusCode: cleanText(record.statusForNotify),
    statusLabel: NOTIFY_STATUS[cleanText(record.statusForNotify)] || cleanText(record.statusForNotify),
    numBidderJoin: Number(record.numBidderJoin || 0),

    planNo: cleanText(record.planNo),
    detailUrl: buildKqlcntDetailUrl(record)
  };

  // Lọc theo winningCode là khớp mã số thuế -> chắc chắn. Không có MST cụ thể
  // thì chỉ là kết quả e-GP lọc theo tiêu chí, không phải khớp định danh.
  return withProvenance(
    out,
    focus ? CONFIDENCE.EXACT : CONFIDENCE.SERVER,
    out.detailUrl,
    { matchedBy: focus ? 'taxCode' : 'egpFilter' });
}

/* --------------------------------------------------------------------------
 *  KHÁM PHÁ MÃ SỐ THUẾ TỪ TÊN CÔNG TY
 * ------------------------------------------------------------------------ */

/**
 * Từ các bản ghi trả về khi dò theo TÊN, rút ra danh sách ứng viên
 * {taxCode, name} tin cậy.
 *
 * Chỉ lấy bản ghi MỘT nhà thầu trúng (không phải liên danh): khi đó
 * contractorName[0] và winningCode[0] chắc chắn là của cùng một pháp nhân.
 * Bản ghi liên danh bị bỏ qua vì hai mảng không khớp thứ tự.
 */
export function extractContractorCandidates(records, keyword) {
  const want = foldText(keyword);
  const map = new Map();

  for (const record of records || []) {
    const codes = listOf(record.winningCode).map(fromWinningCode).filter(Boolean);
    const names = listOf(record.contractorName);
    const members = listOf(record.winningContractorName);
    const isVenture = Boolean(cleanText(record.ventureName)) || members.length > 1;
    if (isVenture || codes.length !== 1 || names.length !== 1) continue;

    const taxCode = codes[0];
    const name = names[0];
    if (want && !foldText(name).includes(want)) continue;

    const existing = map.get(taxCode);
    if (existing) existing.hits += 1;
    else map.set(taxCode, { taxCode, name, hits: 1 });
  }

  return [...map.values()].sort((a, b) => b.hits - a.hits);
}

/* --------------------------------------------------------------------------
 *  TỔNG HỢP
 * ------------------------------------------------------------------------ */

/** Gộp danh sách gói theo khoá, bản mới ghi đè bản cũ. */
export function dedupeKqlcnt(items) {
  const map = new Map();
  for (const item of items || []) {
    if (!item || !item.key) continue;
    map.set(item.key, { ...(map.get(item.key) || {}), ...item });
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.decisionDate || b.publicDateKqlcnt || 0) - new Date(a.decisionDate || a.publicDateKqlcnt || 0)
  );
}

/**
 * Thống kê hồ sơ năng lực của một nhà thầu từ danh sách gói đã trúng.
 *
 * ---------------------------------------------------------------------------
 * GIÁ TRỊ LIÊN DANH — KHÔNG ĐƯỢC CỘNG CHUNG
 * ---------------------------------------------------------------------------
 * Gói trúng theo liên danh có giá trị thuộc về CẢ NHÓM, không phải riêng một
 * thành viên. e-GP KHÔNG công bố tỷ lệ góp (share_percent) trong dữ liệu tìm
 * kiếm, nên không có cách nào chia đúng phần của từng bên.
 *
 * Ví dụ thật: gói IB2600267317 trị giá 70.049.971.000 đ có 7 thành viên liên
 * danh. Nếu cộng đủ số này cho một thành viên thì "tổng giá trị trúng thầu"
 * của họ bị thổi lên gấp nhiều lần — con số sai lệch nghiêm trọng nếu dùng để
 * đánh giá năng lực.
 *
 * Vì vậy trả về BA con số tách bạch, tuyệt đối không gộp thành một:
 *   soloValue      — tổng giá trị các gói trúng ĐỘC LẬP (chắc chắn của họ)
 *   ventureValue   — tổng giá trị các gói liên danh (của cả nhóm, chưa chia)
 *   ventureShareUnknown — true khi có gói liên danh mà thiếu tỷ lệ góp
 */
export function summarizeWinner(packages) {
  const list = packages || [];
  const soloList = list.filter((p) => !p.isVenture);
  const ventureList = list.filter((p) => p.isVenture);
  const solo = soloList.length;
  const venture = ventureList.length;

  const soloValue = soloList.reduce((s, p) => s + (Number(p.winningPrice) || 0), 0);
  const ventureValue = ventureList.reduce((s, p) => s + (Number(p.winningPrice) || 0), 0);
  // Giữ lại tổng gộp để tương thích, nhưng giao diện phải hiện tách bạch.
  const totalValue = soloValue + ventureValue;

  // Chỉ tính tỷ lệ giảm giá trên những gói có ĐỦ cả mốc trần lẫn giá trúng.
  // Tỷ lệ tổng thể lấy theo tổng tiền (bình quân gia quyền) chứ không lấy
  // trung bình cộng các phần trăm — gói to phải có trọng số lớn hơn.
  const priced = list.filter((p) => p.discountRate !== null && p.discountRate !== undefined);
  const basisSum = priced.reduce((s, p) => s + (Number(p.priceBasis) || 0), 0);
  const winSum = priced.reduce((s, p) => s + (Number(p.winningPrice) || 0), 0);
  const savedTotal = basisSum - winSum;
  const overallDiscountRate = basisSum > 0 ? round2((savedTotal / basisSum) * 100) : null;
  const rates = priced.map((p) => p.discountRate).sort((a, b) => a - b);
  const medianDiscountRate = rates.length
    ? (rates.length % 2
        ? rates[(rates.length - 1) / 2]
        : round2((rates[rates.length / 2 - 1] + rates[rates.length / 2]) / 2))
    : null;

  const byField = new Map();
  const byInvestor = new Map();
  const byYear = new Map();

  for (const p of list) {
    const field = p.fieldLabel || 'Khác';
    byField.set(field, (byField.get(field) || 0) + 1);

    if (p.investorName) byInvestor.set(p.investorName, (byInvestor.get(p.investorName) || 0) + 1);

    const stamp = p.decisionDate || p.publicDateKqlcnt;
    if (stamp) {
      const year = new Date(stamp).getFullYear();
      if (Number.isFinite(year)) byYear.set(year, (byYear.get(year) || 0) + 1);
    }
  }

  const rank = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));

  return {
    total: list.length,
    solo,
    venture,
    // Ba con số giá trị tách bạch — xem ghi chú "GIÁ TRỊ LIÊN DANH" ở trên.
    soloValue,
    ventureValue,
    ventureShareUnknown: venture > 0,
    totalValue,
    totalValueText: formatMoney(totalValue),
    // Giá trị & mức giảm
    basisTotal: basisSum,
    savedTotal,
    overallDiscountRate,
    medianDiscountRate,
    pricedCount: priced.length,
    largest: list.reduce((best, p) => ((Number(p.winningPrice) || 0) > (Number(best?.winningPrice) || 0) ? p : best), null),
    byField: rank(byField),
    byInvestor: rank(byInvestor).slice(0, 10),
    byYear: [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, count]) => ({ year, count }))
  };
}
