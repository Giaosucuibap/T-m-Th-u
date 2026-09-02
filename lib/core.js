const FIELD_KEYS = new Set([
  'notifyNo','notify_no','tbmtNo','bidNo','bidName','notifyName','packageName',
  'publicDate','publishDate','investorName','procuringEntityName','bidPrice',
  'notifyVersion','notifyVersionNo','investField','fieldName','bidCloseDate',
  'closeDate','projectName','pName','planNo','notifyId','bidOpenId',
  'bidPackageName','planName','investFieldName','bidFieldName','contractTypeName',
  'estimatedPrice','packagePrice','bidPackagePrice','executionLocation','provinceName'
]);

export const DEFAULT_SETTINGS = Object.freeze({
  requirementText: 'Thi công xây lắp hạ tầng, thủy lợi, kênh mương, hồ chứa, đập, trạm bơm, kè, đường giao thông, cầu cống, cấp thoát nước tại các tỉnh ưu tiên',
  provinces: ['Lâm Đồng','Đồng Nai','Khánh Hòa','Đắk Lắk','Gia Lai','Quảng Ngãi'],
  positiveKeywords: ['thủy lợi','kênh','kênh mương','hồ chứa','đập','trạm bơm','kè','đường giao thông','đường bê tông','đường nhựa','cầu','cống','san lấp','hạ tầng kỹ thuật','cấp nước','thoát nước','nạo vét'],
  requiredKeywords: [],
  negativeKeywords: ['nội thất','phần mềm','mua sắm thiết bị văn phòng'],
  minPrice: 3000000000,
  maxPrice: 500000000000,
  minDaysToClose: 3,
  reportMinScore: 55,
  requireConstruction: true,
  maxStoredTenders: 3000,
  // 5 trang là quá ít: bộ lọc e-GP thường để 10 dòng/trang, nên mặc định cũ
  // chỉ lấy được 50 gói rồi dừng — trong khi một tỉnh có thể có vài trăm gói
  // khớp tiêu chí. 20 trang bao được phần lớn trường hợp thực tế mà vẫn nghỉ
  // 350ms giữa các trang, tức khoảng 7 giây tải, không gây tải cho e-GP.
  maxPagesHint: 20,
  dailyTime: '06:05',
  autoScan: true,
  scanOnStartup: true,
  scanTimeoutSeconds: 75,
  autoExportMobileReport: false,
  openScheduledTabActive: false,
  alertMinScore: 85,
  telegramEnabled: false,
  telegramBotToken: '',
  telegramChatId: '',
  telegramMinScore: 70,
  // Nhắn cả khi không có gói mới, để biết hệ thống vẫn đang chạy.
  telegramDailySummary: false
});

export function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

export function foldText(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

const STOP_WORDS = new Set([
  'cac','cua','cho','voi','tai','tu','den','theo','tren','duoi','trong','ngoai',
  'mot','nhieu','nhung','hoac','va','la','co','khong','duoc','ve','nay','do',
  'goi','thau','nha','lua','chon','tbmt','ma','so','du','an','hang','muc'
]);

export function tokenizeText(value) {
  return foldText(value)
    .replace(/[^a-z0-9]+/g,' ')
    .split(' ')
    .filter(token => token.length >= 3 && !/^\d+$/.test(token) && !STOP_WORDS.has(token));
}

function keywordHits(haystack, keywords = []) {
  const folded = foldText(haystack);
  return (keywords || [])
    .map(cleanText)
    .filter(Boolean)
    .filter(keyword => folded.includes(foldText(keyword)));
}

function tenderSearchText(tender) {
  return [
    tender.bidName,
    tender.projectName,
    tender.fieldRaw,
    tender.location,
    tender.investorName,
    tender.procuringEntityName,
    tender.contractType,
    tender.rawText
  ].filter(Boolean).join(' ');
}

function similarityToRequirement(hay, settings = DEFAULT_SETTINGS) {
  const requirement = cleanText(settings.requirementText) || (settings.positiveKeywords || []).join(' ');
  if (!requirement) return {points:0,hits:[],ratio:0};
  const requirementTerms = [...new Set(tokenizeText(requirement))].slice(0,80);
  if (!requirementTerms.length) return {points:0,hits:[],ratio:0};
  const hayTerms = new Set(tokenizeText(hay));
  const hits = requirementTerms.filter(term => hayTerms.has(term));
  const denominator = Math.max(1, Math.min(requirementTerms.length, 32));
  const ratio = Math.min(1, hits.length / denominator);
  return {points:Math.round(ratio * 20),hits,ratio};
}

export function parseMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'bigint') return Number(value);
  const raw = cleanText(value).toLowerCase();
  const multiplier = raw.includes('tỷ') || raw.includes('ty') ? 1e9 : raw.includes('triệu') || raw.includes('trieu') ? 1e6 : 1;
  if (multiplier !== 1) {
    const m = raw.match(/([0-9]+(?:[.,][0-9]+)?)/);
    if (m) return Math.round(Number(m[1].replace(',', '.')) * multiplier);
  }
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const s = cleanText(value);
  const dmy = s.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (dmy) {
    const [,dd,mm,yyyy,hh='0',mi='0',ss='0'] = dmy;
    const d = new Date(Number(yyyy), Number(mm)-1, Number(dd), Number(hh), Number(mi), Number(ss));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizeVersion(value) {
  if (value === null || value === undefined || value === '') return '00';
  const m = cleanText(value).match(/\d+/);
  return m ? String(Number(m[0])).padStart(2,'0') : cleanText(value).slice(0,20);
}

function first(obj, keys) {
  for (const key of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj,key)) {
      const value = obj[key];
      if (value !== null && value !== undefined && value !== '') return value;
    }
  }
  return null;
}

function locationText(value) {
  if (!value) return '';
  if (Array.isArray(value)) return value.map(locationText).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    return cleanText(first(value,['fullName','provinceName','provName','name','wardName','districtName','address']) || Object.values(value).filter(v => typeof v === 'string').join(' '));
  }
  return cleanText(value);
}

export function extractCandidateObjects(value, maxObjects = 750) {
  const out = [];
  const seen = new WeakSet();
  let nodes = 0;
  function walk(node, depth) {
    if (out.length >= maxObjects || nodes > 15000 || depth > 12 || node === null || node === undefined) return;
    nodes += 1;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    const keys = Object.keys(node);
    const hit = keys.some(k => FIELD_KEYS.has(k));
    const identity = keys.some(k => ['notifyNo','notify_no','tbmtNo','bidNo','bidName','notifyName'].includes(k));
    if (hit && identity) out.push(node);
    for (const val of Object.values(node)) walk(val, depth + 1);
  }
  walk(value,0);
  return out;
}

/* ---------------------------------------------------------------------------
 *  ĐỊNH DANH GÓI THẦU TRÊN e-GP — ba loại mã KHÁC NHAU, tuyệt đối không lẫn:
 *
 *    IB… (notifyNo) — MÃ TBMT, cấp khi gói thầu được đăng Thông báo mời thầu.
 *    BP… (bidNo)    — MÃ GÓI THẦU trong Kế hoạch lựa chọn nhà thầu. Có từ khi
 *                     duyệt KHLCNT, tức là TRƯỚC khi có TBMT.
 *    PL… (planNo)   — MÃ KHLCNT của cả kế hoạch.
 *
 *  Đối chiếu trên một bản ghi thật của e-GP:
 *    notifyNo "IB2600455310" · bidNo "BP2600643669" · planNo "PL2600259406"
 *
 *  Gói mới nằm trong KHLCNT thì CHƯA có mã IB — chỉ có BP. Trước đây `bidNo`
 *  bị xếp chung nhóm với notifyNo nên tiện ích hiển thị "BP2600582792-00" như
 *  thể đó là mã TBMT. Nay tách bạch: mỗi loại mã một hàm riêng, và giao diện
 *  ghi rõ đang hiển thị mã nào.
 * ------------------------------------------------------------------------- */

/** Chỉ trả về MÃ TBMT (IB…). Không có thì trả ''. */
function extractNotifyNo(obj, rawText='') {
  const direct = cleanText(first(obj,['notifyNo','notify_no','tbmtNo','notifyNoStand']));
  const source = `${direct} ${cleanText(rawText)}`;
  const m = source.match(/\bIB\d{6,}\b/i);
  return m ? m[0].toUpperCase() : '';
}

/** Chỉ trả về MÃ GÓI THẦU trong KHLCNT (BP…). */
function extractBidNo(obj, rawText='') {
  const direct = cleanText(first(obj,['bidNo','bidPackageNo','lotNo','packageNo']));
  const source = `${direct} ${cleanText(rawText)}`;
  const m = source.match(/\bBP\d{6,}\b/i);
  return m ? m[0].toUpperCase() : '';
}

/** Chỉ trả về MÃ KHLCNT (PL…). */
function extractPlanNo(obj, rawText='') {
  const direct = cleanText(first(obj,['planNo','plan_no','khqlcntNo']));
  const source = `${direct} ${cleanText(rawText)}`;
  const m = source.match(/\bPL\d{6,}\b/i);
  return m ? m[0].toUpperCase() : cleanText(direct);
}

/* ---------------------------------------------------------------------------
 *  LINK TỚI TRANG CHI TIẾT GÓI THẦU TRÊN e-GP
 *
 *  Ghi chú cũ trong tệp này cho rằng e-GP "không có link chia sẻ trực tiếp" nên
 *  chỉ mở trang tìm kiếm kèm mã TBMT. Điều đó SAI, và đường dẫn dự phòng còn
 *  thiếu đoạn "/web/guest/" nên e-GP báo "egp-portal-contractor-selection-v2
 *  tạm thời không có" — đúng lỗi bấm link không hiện gì.
 *
 *  Thực tế module contractor-selection-v2 có route `render=detail-v2` nhận đủ
 *  tham số qua query string. Đã đối chiếu link do chính e-GP sinh ra:
 *
 *    Thông báo mời thầu : stepCode=notify-contractor-step-1-tbmt · step=tbmt
 *    Biên bản mở thầu   : stepCode=notify-contractor-step-2-kqmt · step=bbmt
 *    Kết quả LCNT       : stepCode=notify-contractor-step-4-kqlcnt · step=kqlcnt
 * ------------------------------------------------------------------------- */
const EGP_ORIGIN_URL = 'https://muasamcong.mpi.gov.vn';
const EGP_SEARCH = `${EGP_ORIGIN_URL}/vi/web/guest/contractor-selection?render=search`;

/** Từ stepCode của bản ghi suy ra giá trị `step` mà route chi tiết cần. */
function stepFromCode(stepCode) {
  const s = cleanText(stepCode);
  if (s.includes('step-4-kqlcnt')) return 'kqlcnt';
  if (s.includes('step-2-kqmt') || s.includes('step-3-dsntdkt')) return 'bbmt';
  return 'tbmt';
}

/** Dựng link sâu tới trang chi tiết. Trả '' nếu bản ghi thiếu định danh. */
function buildTenderDetailUrl(obj) {
  const id = cleanText(first(obj, ['notifyId', 'id', 'notifyDbId']));
  const notifyNo = cleanText(first(obj, ['notifyNo', 'notify_no', 'tbmtNo']));
  if (!id || !notifyNo) return '';
  const P = '_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render';
  const params = new URLSearchParams({
    p_p_id: 'egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2',
    p_p_lifecycle: '0',
    p_p_state: 'normal',
    p_p_mode: 'view',
    [P]: 'detail-v2',
    type: 'es-notify-contractor',
    stepCode: cleanText(obj.stepCode) || 'notify-contractor-step-1-tbmt',
    id,
    notifyId: id,
    inputResultId: cleanText(obj.inputResultId) || 'undefined',
    bidOpenId: cleanText(obj.bidOpenId) || 'undefined',
    techReqId: 'undefined',
    bidPreNotifyResultId: 'undefined',
    bidPreOpenId: 'undefined',
    processApply: cleanText(obj.processApply),
    bidMode: cleanText(obj.bidMode),
    notifyNo,
    planNo: cleanText(first(obj, ['planNo', 'plan_no'])),
    pno: 'undefined',
    step: stepFromCode(obj.stepCode),
    isInternet: String(obj.isInternet ?? ''),
    caseKHKQ: obj.caseKHKQ === undefined || obj.caseKHKQ === null ? 'undefined' : String(obj.caseKHKQ),
    bidForm: cleanText(obj.bidForm)
  });
  return `${EGP_ORIGIN_URL}/vi/web/guest/contractor-selection?${params.toString()}`;
}

function isBareEgpHome(s) {
  return /^https:\/\/muasamcong\.mpi\.gov\.vn(\/(vi|en))?(\/web\/guest)?(\/home)?\/?$/i.test(s);
}

/**
 * Chọn link tốt nhất có thể: link thật e-GP đã sinh > link sâu tự dựng >
 * trang tìm kiếm (dùng cho gói mới nằm trong KHLCNT, chưa có trang chi tiết).
 */
function safeDetailUrl(value, sourcePageUrl, obj) {
  const s = cleanText(value);
  if (/^https:\/\/muasamcong\.mpi\.gov\.vn\/.+/i.test(s) && !isBareEgpHome(s)) return s;
  if (s.startsWith('/') && s.length > 1) return `${EGP_ORIGIN_URL}${s}`;
  return buildTenderDetailUrl(obj || {}) || EGP_SEARCH;
}

/* ---------------------------------------------------------------------------
 *  TRẠNG THÁI MỞ / ĐÓNG THẦU
 *
 *  Bốn nhóm, xếp theo mức độ cần hành động ngay:
 *    OPEN    Đang mở thầu — còn nhận hồ sơ, nộp được.
 *    PLAN    Chưa có TBMT — mới nằm trong KHLCNT, chờ mời thầu.
 *    UNKNOWN Có TBMT nhưng dữ liệu công khai không ghi rõ thời điểm đóng thầu.
 *    CLOSED  Đã đóng thầu — hết cơ hội nộp.
 * ------------------------------------------------------------------------- */
export const BID_STATUS_ORDER = ['OPEN', 'PLAN', 'UNKNOWN', 'CLOSED'];

export const BID_STATUS_LABEL = {
  OPEN: 'Đang mở thầu',
  PLAN: 'Chưa có TBMT (mới trong KHLCNT)',
  UNKNOWN: 'Chưa rõ thời điểm đóng thầu',
  CLOSED: 'Đã đóng thầu'
};

/** Số ngày còn lại tới thời điểm đóng thầu; null nếu không xác định được. */
export function daysToClose(closeDate) {
  if (!closeDate) return null;
  const t = new Date(closeDate).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((t - Date.now()) / 86400000);
}

/** Phân loại một gói thầu vào một trong bốn nhóm trên. */
export function bidStatus(tender) {
  if (!tender) return 'UNKNOWN';
  // Chưa có mã TBMT nghĩa là gói chưa được mời thầu, dù có ngày tháng gì đi nữa.
  if (!cleanText(tender.notifyNo)) return 'PLAN';
  const days = daysToClose(tender.closeDate);
  if (days === null) return 'UNKNOWN';
  return days >= 0 ? 'OPEN' : 'CLOSED';
}

export function normalizeCandidate(obj, meta = {}) {
  const rawText = cleanText(first(obj,['rawText','text','textDump']));
  const notifyNo = extractNotifyNo(obj, rawText);
  const bidNo = extractBidNo(obj, rawText);
  // Gói chỉ cần có MỘT trong hai mã là đủ để theo dõi: có IB thì đã mời thầu,
  // chỉ có BP thì mới nằm trong kế hoạch — cả hai đều đáng quan tâm.
  if (!notifyNo && !bidNo) return null;
  const version = normalizeVersion(first(obj,['notifyVersion','notifyVersionNo','version','notify_version']));
  const bidName = cleanText(first(obj,['bidName','notifyName','packageName','name','bidPackageName'])) || rawText.split(' | ')[0] || notifyNo || bidNo;
  const projectName = cleanText(first(obj,['projectName','pName','project_name','planName']));
  const fieldRaw = cleanText(first(obj,['investFieldName','investField','fieldName','field','bidFieldName','bidField']));
  const location = locationText(first(obj,['locations','location','bidLocation','executionLocation','workLocation','provinceName','provName','place','addresses'])) || extractProvinceFromText(rawText);
  const price = parseMoney(first(obj,['bidPrice','price','packagePrice','bidPackagePrice','investTotal','totalPrice'])) ?? parseMoneyFromText(rawText);
  const publicDate = parseDate(first(obj,['publicDate','publishDate','public_date','createdDate']));
  const closeDate = parseDate(first(obj,['bidCloseDate','closeDate','bidClosingDate','expiredTime','deadline']));
  const noticeId = cleanText(first(obj,['notifyId','bidOpenId','id','notifyDbId','tbmtId']));
  // Mã dùng để dò link trong DOM: ưu tiên mã TBMT, chưa có thì dùng mã gói thầu.
  const searchCode = notifyNo || bidNo;
  const detailUrl = safeDetailUrl(first(obj,['detailUrl','url','href','link','seoUrl','detailPath','notifyDetailUrl','viewUrl']) || (meta.domLinks && meta.domLinks[searchCode]), meta.sourcePageUrl, obj);
  const investorName = cleanText(first(obj,['investorName','investor','investorNameNew','agencyName']));
  const procuringEntityName = cleanText(first(obj,['procuringEntityName','bidSolicitorName','procuringEntity','bidSolicitor']));
  const contractType = cleanText(first(obj,['contractTypeName','contractType','ctypeName','ctype']));
  const planNo = extractPlanNo(obj, rawText);
  const capturedAt = meta.capturedAt || new Date().toISOString();
  return {
    // Gói chưa có TBMT được khoá theo mã gói thầu; khi TBMT ra đời nó sẽ xuất
    // hiện thành một mục mới có mã IB — đúng bản chất, vì đó là hai mốc khác nhau.
    key: notifyNo ? `${notifyNo}::${version}` : `BP:${bidNo}`,
    notifyNo, bidNo, version, bidName, projectName, fieldRaw,
    // Mã hiển thị trên giao diện, kèm nhãn nói rõ đó là mã gì.
    displayCode: notifyNo ? `${notifyNo}-${version}` : bidNo,
    codeLabel: notifyNo ? 'Mã TBMT' : 'Mã gói thầu (KHLCNT)',
    location, price, publicDate, closeDate,
    investorName, procuringEntityName, contractType, planNo,
    noticeId,
    detailUrl,
    sourcePageUrl: meta.sourcePageUrl || detailUrl,
    sourceRequestUrl: meta.requestUrl || '',
    capturedAt,
    firstSeenAt: capturedAt,
    lastSeenAt: capturedAt,
    rawText: rawText.slice(0,4000),
    watchlisted: false
  };
}

function parseMoneyFromText(text) {
  const m = cleanText(text).match(/(?:giá gói thầu|giá trị|dự toán)[^0-9]{0,30}([0-9][0-9. ,]{5,})/i);
  return m ? parseMoney(m[1]) : null;
}

function extractProvinceFromText(text) {
  const provinces = ['Lâm Đồng','Đồng Nai','Khánh Hòa','Đắk Lắk','Gia Lai','Quảng Ngãi','Bình Thuận','Ninh Thuận','TP. Hồ Chí Minh','Hà Nội'];
  const folded = foldText(text);
  return provinces.find(p => folded.includes(foldText(p))) || '';
}

export function isConstructionTender(tender) {
  const hay = foldText([tender.fieldRaw,tender.bidName,tender.projectName,tender.rawText].filter(Boolean).join(' '));
  return ['xay lap','thi cong','xay dung','sua chua','nang cap','cai tao'].some(x => hay.includes(x));
}

export function scoreTender(tender, settings = DEFAULT_SETTINGS) {
  const parts = {};
  const reasons = [];
  const hay = tenderSearchText(tender);
  const folded = foldText(hay);
  const construction = isConstructionTender(tender);
  parts.construction = construction ? 18 : 0;
  if (construction) reasons.push('Có dấu hiệu là gói xây lắp/thi công xây dựng');

  const provinces = settings.provinces || [];
  const provinceHits = provinces.filter(p => folded.includes(foldText(p)));
  parts.province = provinces.length === 0 ? 16 : provinceHits.length ? 16 : 0;
  if (provinceHits.length) reasons.push(`Địa bàn ưu tiên: ${provinceHits.slice(0,2).join(', ')}`);

  const similarity = similarityToRequirement(hay, settings);
  parts.similarity = similarity.points;
  if (similarity.hits.length) reasons.push(`Giống yêu cầu: ${similarity.hits.slice(0,8).join(', ')}`);

  const posHits = keywordHits(hay, settings.positiveKeywords);
  const requiredHits = keywordHits(hay, settings.requiredKeywords);
  const negHits = keywordHits(hay, settings.negativeKeywords);
  parts.keywords = Math.min(22, posHits.length * 5);
  if (posHits.length) reasons.push(`Từ khóa thế mạnh: ${posHits.slice(0,5).join(', ')}`);
  if ((settings.requiredKeywords || []).length) {
    if (requiredHits.length) reasons.push(`Có từ khóa bắt buộc: ${requiredHits.slice(0,3).join(', ')}`);
    else reasons.push('Chưa thấy từ khóa bắt buộc trong dữ liệu công khai');
  }
  if (negHits.length) {
    parts.keywords = Math.max(0, parts.keywords - Math.min(15, negHits.length * 5));
    parts.similarity = Math.max(0, parts.similarity - Math.min(6, negHits.length * 3));
    reasons.push(`Từ khóa hạn chế: ${negHits.slice(0,3).join(', ')}`);
  }

  if (tender.price === null || tender.price === undefined) {
    parts.price = 4;
    reasons.push('Trang kết quả chưa thể hiện rõ giá gói thầu');
  } else if (tender.price >= Number(settings.minPrice || 0) && tender.price <= Number(settings.maxPrice || Number.MAX_SAFE_INTEGER)) {
    parts.price = 12;
    reasons.push('Giá gói thầu trong dải quan tâm');
  } else parts.price = 0;

  if (tender.closeDate) {
    const days = (new Date(tender.closeDate).getTime() - Date.now()) / 86400000;
    if (days >= Math.max(10, Number(settings.minDaysToClose || 3))) parts.time = 7;
    else if (days >= Number(settings.minDaysToClose || 3)) parts.time = 4;
    else parts.time = 0;
    reasons.push(days >= 0 ? `Còn khoảng ${Math.floor(days)} ngày trước đóng thầu` : 'Đã qua thời điểm đóng thầu');
  } else parts.time = 3;

  const completeness = [tender.bidName,tender.location,tender.price,tender.investorName,tender.closeDate].filter(v => v !== null && v !== undefined && v !== '').length;
  parts.completeness = completeness >= 4 ? 5 : completeness >= 2 ? 3 : 1;

  let score = Object.values(parts).reduce((a,b) => a+b,0);
  score = Math.max(0,Math.min(100,score));
  const recommendation = score >= 85 ? 'NGHIÊN CỨU NGAY' : score >= 70 ? 'RẤT ĐÁNG QUAN TÂM' : score >= 55 ? 'NÊN XEM' : 'THAM KHẢO';
  const requiredOk = !(settings.requiredKeywords || []).length || requiredHits.length > 0;
  const matched = requiredOk && (!settings.requireConstruction || construction) && score >= Number(settings.reportMinScore || 55);
  // Trạng thái mở/đóng thầu đi kèm điểm số để giao diện xếp nhóm được ngay.
  const status = bidStatus(tender);
  return {score,recommendation,matched,parts,reasons,construction,posHits,requiredHits,negHits,similarityHits:similarity.hits,
    status,statusLabel:BID_STATUS_LABEL[status],daysLeft:daysToClose(tender.closeDate)};
}

/**
 * Sửa dữ liệu gói thầu đã lưu từ các bản trước 1.4.0.
 *
 * Bản cũ xếp `bidNo` chung nhóm với `notifyNo`, nên gói mới nằm trong KHLCNT bị
 * lưu với notifyNo = "BP…" như thể đó là mã TBMT. Hàm này trả mã về đúng trường
 * và dựng lại khoá chống trùng, để danh sách đã quét trước đây không còn hiển
 * thị sai. Bản ghi đã đúng thì trả về nguyên trạng, không đụng tới.
 */
export function migrateTenderCodes(tender) {
  if (!tender) return tender;
  const isIb = (v) => /^IB\d{6,}$/i.test(cleanText(v));
  const isBp = (v) => /^BP\d{6,}$/i.test(cleanText(v));
  const up = (v) => cleanText(v).toUpperCase();

  const notifyNo = isIb(tender.notifyNo) ? up(tender.notifyNo) : '';
  const bidNo = isBp(tender.bidNo) ? up(tender.bidNo) : (isBp(tender.notifyNo) ? up(tender.notifyNo) : '');
  if (notifyNo === up(tender.notifyNo) && bidNo === up(tender.bidNo) && tender.displayCode) return tender;

  const version = tender.version || '00';
  return {
    ...tender,
    notifyNo,
    bidNo,
    key: notifyNo ? `${notifyNo}::${version}` : (bidNo ? `BP:${bidNo}` : tender.key),
    displayCode: notifyNo ? `${notifyNo}-${version}` : bidNo,
    codeLabel: notifyNo ? 'Mã TBMT' : 'Mã gói thầu (KHLCNT)'
  };
}

export function mergeTender(existing, incoming, settings) {
  const merged = {...existing};
  for (const [key,value] of Object.entries(incoming)) {
    if (value !== null && value !== undefined && value !== '') merged[key] = value;
  }
  merged.firstSeenAt = existing?.firstSeenAt || incoming.firstSeenAt || new Date().toISOString();
  merged.lastSeenAt = incoming.lastSeenAt || new Date().toISOString();
  merged.watchlisted = Boolean(existing?.watchlisted || incoming.watchlisted);
  const scored = scoreTender(merged,settings);
  return {...merged,...scored};
}

export function dedupeTenders(items, settings = DEFAULT_SETTINGS) {
  const map = new Map();
  for (const item of items) {
    if (!item?.key) continue;
    map.set(item.key, map.has(item.key) ? mergeTender(map.get(item.key),item,settings) : mergeTender({},item,settings));
  }
  return [...map.values()];
}

export function formatMoney(value) {
  if (value === null || value === undefined || value === '') return 'Chưa xác định';
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n).toLocaleString('vi-VN')} đ` : cleanText(value);
}

export function formatDate(value) {
  if (!value) return 'Chưa xác định';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? cleanText(value) : new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'short'}).format(d);
}

export function safeFilename(value) {
  return foldText(value).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80) || 'bid-radar';
}

export function sanitizeRequestTemplate(request, sourcePageUrl='', candidateCount=0) {
  if (!request?.url) return null;
  let url;
  try {
    const u = new URL(request.url, sourcePageUrl || 'https://muasamcong.mpi.gov.vn/');
    if (u.hostname !== 'muasamcong.mpi.gov.vn') return null;
    for (const key of [...u.searchParams.keys()]) {
      if (/token|jwt|session|auth|signature|secret/i.test(key)) u.searchParams.delete(key);
    }
    url = u.href;
  } catch { return null; }
  const headers = {};
  for (const [k,v] of Object.entries(request.headers || {})) {
    if (['accept','content-type','x-requested-with'].includes(k.toLowerCase())) headers[k] = String(v);
  }
  const body = typeof request.body === 'string' ? request.body.slice(0,100000) : request.body ? JSON.stringify(request.body).slice(0,100000) : '';
  return {
    url,
    method: String(request.method || 'GET').toUpperCase(),
    headers,
    body,
    sourcePageUrl,
    candidateCount,
    capturedAt: new Date().toISOString()
  };
}

/* ====================================================================
 *  NHÀ THẦU — trích xuất nhà thầu tham dự / trúng thầu từ dữ liệu e-GP
 *  (kết quả mở thầu · KQLCNT). Dung nạp nhiều biến thể tên trường.
 * ==================================================================== */
const TAXCODE_KEYS = ['taxCode','mst','maSoThue','taxNo','taxNumber','enterpriseCode','businessCode','contractorTaxCode','supplierTaxCode','bidderTaxCode','taxCodeContractor'];
const CONTRACTOR_NAME_KEYS = ['contractorName','supplierName','bidderName','participantName','enterpriseName','companyName','tenNhaThau','nhaThau','contractor','supplier','bidder'];
const CONTRACTOR_LIST_KEYS = ['contractors','bidders','suppliers','participants','bidderList','contractorList','supplierList','participantList','lstBidder','listBidder','lstContractor','nhaThau','dsNhaThau'];
const WIN_KEYS = ['isWinner','winner','isWin','trungThau','isSelected','selected','resultStatus','result','ketQua','bidResult','winStatus'];
const BIDVALUE_KEYS = ['winPrice','dropPrice','bidValue','offerPrice','proposalPrice','giaDuThau','giaTrung','bidderPrice','contractorPrice'];

export function normalizeTaxCode(value) {
  const s = cleanText(value).replace(/\s+/g,'');
  const m = s.match(/\d{10}(?:-\d{3})?/);
  return m ? m[0] : '';
}

function interpretWin(value) {
  if (value === true) return true;
  if (value === false) return false;
  const s = foldText(value);
  if (!s) return null;
  if (/(trung thau|trung|win|selected|dat|thanh cong|success|1)/.test(s) && !/khong|truot|fail|loai/.test(s)) return true;
  if (/(truot|khong trung|khong dat|fail|loai|rejected|0)/.test(s)) return false;
  return null;
}

function looksLikeContractor(o) {
  if (!o || typeof o !== 'object') return false;
  const keys = Object.keys(o);
  const hasName = keys.some(k => CONTRACTOR_NAME_KEYS.includes(k) && cleanText(o[k]));
  const hasTax = keys.some(k => TAXCODE_KEYS.includes(k) && normalizeTaxCode(o[k]));
  return hasName || hasTax;
}

function packageIdentity(o) {
  const notifyNo = extractNotifyNo(o, '');
  const bidName = cleanText(first(o, ['bidName','notifyName','packageName','bidPackageName']));
  return { notifyNo: notifyNo || '', bidName: bidName || '' };
}

export function normalizeParticipation(contractor, pkg = {}, meta = {}) {
  const taxCode = normalizeTaxCode(first(contractor, TAXCODE_KEYS));
  const contractorName = cleanText(first(contractor, CONTRACTOR_NAME_KEYS));
  if (!contractorName && !taxCode) return null;
  const notifyNo = pkg.notifyNo || extractNotifyNo(contractor, '');
  const bidName = cleanText(pkg.bidName || first(contractor, ['bidName','notifyName','packageName']));
  if (!notifyNo && !bidName) return null;
  const isWinner = interpretWin(first(contractor, WIN_KEYS));
  const bidValue = parseMoney(first(contractor, BIDVALUE_KEYS));
  const detailUrl = safeDetailUrl(first(contractor, ['detailUrl','url','href','link']) || (pkg._src && first(pkg._src, ['detailUrl','url','href','link'])), meta.sourcePageUrl, notifyNo);
  const capturedAt = meta.capturedAt || new Date().toISOString();
  return {
    key: `${taxCode || foldText(contractorName)}::${notifyNo || foldText(bidName)}`,
    taxCode,
    contractorName: contractorName || 'Chưa rõ tên',
    contractorFold: foldText(contractorName),
    notifyNo: notifyNo || '',
    bidName: bidName || notifyNo || '',
    province: cleanText(pkg.province || first(contractor, ['provinceName','province','location'])),
    investorName: cleanText(pkg.investorName || first(contractor, ['investorName','procuringEntityName'])),
    role: isWinner === true ? 'Trúng thầu' : (isWinner === false ? 'Tham dự' : 'Tham dự'),
    isWinner: isWinner === true,
    bidValue,
    detailUrl,
    capturedAt,
    firstSeenAt: capturedAt,
    lastSeenAt: capturedAt
  };
}

export function extractParticipations(value, meta = {}, max = 5000) {
  const out = [];
  const seen = new WeakSet();
  let nodes = 0;
  function pair(pkg, c) { const p = normalizeParticipation(c, pkg, meta); if (p) out.push(p); }
  function walk(node, pkgCtx, depth) {
    if (out.length >= max || nodes > 40000 || depth > 12 || node == null) return;
    nodes++;
    if (Array.isArray(node)) { for (const it of node) walk(it, pkgCtx, depth + 1); return; }
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    const pid = packageIdentity(node);
    const ctx = (pid.notifyNo || pid.bidName)
      ? { ...(pkgCtx || {}), ...pid, _src: node, province: cleanText(first(node, ['provinceName','province','executionLocation'])) || (pkgCtx && pkgCtx.province), investorName: cleanText(first(node, ['investorName','procuringEntityName'])) || (pkgCtx && pkgCtx.investorName) }
      : pkgCtx;
    // Node bản thân là một nhà thầu (kèm sẵn mã gói) → ghép trực tiếp.
    if (looksLikeContractor(node) && (ctx?.notifyNo || ctx?.bidName || pid.notifyNo || pid.bidName)) {
      pair(ctx || pid, node);
    }
    for (const [k, v] of Object.entries(node)) {
      if (Array.isArray(v) && CONTRACTOR_LIST_KEYS.includes(k)) {
        for (const c of v) { if (c && typeof c === 'object' && looksLikeContractor(c)) pair(ctx || pid, c); else walk(c, ctx, depth + 1); }
      } else {
        walk(v, ctx, depth + 1);
      }
    }
  }
  walk(value, null, 0);
  return out;
}

export function mergeParticipation(existing, incoming) {
  const merged = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== null && v !== undefined && v !== '') merged[k] = v;
  }
  merged.isWinner = Boolean(existing?.isWinner || incoming.isWinner);
  merged.role = merged.isWinner ? 'Trúng thầu' : (merged.role || incoming.role || 'Tham dự');
  merged.firstSeenAt = existing?.firstSeenAt || incoming.firstSeenAt || new Date().toISOString();
  merged.lastSeenAt = incoming.lastSeenAt || new Date().toISOString();
  return merged;
}

export function dedupeParticipations(items) {
  const map = new Map();
  for (const it of items) {
    if (!it?.key) continue;
    map.set(it.key, map.has(it.key) ? mergeParticipation(map.get(it.key), it) : it);
  }
  return [...map.values()];
}

// Gom nhóm participations theo nhà thầu (MST hoặc tên), kèm thống kê.
export function summarizeContractors(participations) {
  const groups = new Map();
  for (const p of participations || []) {
    const id = p.taxCode || p.contractorFold || foldText(p.contractorName);
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, { id, taxCode: p.taxCode || '', contractorName: p.contractorName, packages: [], joined: 0, won: 0 });
    const g = groups.get(id);
    if (!g.taxCode && p.taxCode) g.taxCode = p.taxCode;
    g.packages.push(p);
    g.joined += 1;
    if (p.isWinner) g.won += 1;
  }
  return [...groups.values()]
    .map(g => ({ ...g, winRate: g.joined ? Math.round((g.won / g.joined) * 100) : 0 }))
    .sort((a, b) => b.joined - a.joined);
}

// Lọc participations theo mã số thuế hoặc tên nhà thầu.
export function findContractorPackages(participations, query) {
  const q = cleanText(query);
  if (!q) return [];
  const qTax = normalizeTaxCode(q);
  const qFold = foldText(q);
  return (participations || []).filter(p =>
    (qTax && p.taxCode === qTax) ||
    (!qTax && qFold && (p.contractorFold || foldText(p.contractorName)).includes(qFold))
  ).sort((a, b) => Number(b.isWinner) - Number(a.isWinner));
}

/**
 * Bỏ tiền tố đơn vị hành chính để lấy phần TÊN RIÊNG của địa danh.
 *
 * "Xã Đơn Dương", "Huyện Đơn Dương" → "don duong"; "Phường 2" → "2".
 *
 * Cần bước này vì cùng một địa danh xuất hiện dưới nhiều tiền tố khác nhau
 * (xã mới thường trùng tên huyện cũ), và tên ban quản lý dự án lại mang tiền
 * tố khác nữa. So theo tên riêng thì cả ba dạng gặp được nhau.
 */
export function wardCoreName(name) {
  return foldText(name)
    .replace(/^(xa|phuong|thi tran|thi xa|quan|huyen|tinh|thanh pho|tp)\s+/i, '')
    .trim();
}
