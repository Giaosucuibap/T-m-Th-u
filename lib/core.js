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
  // e-GP thường chỉ hiển thị 10–50 kết quả/trang. Mặc định 20 trang giúp
  // giảm nguy cơ bỏ sót cơ hội; người dùng vẫn có thể hạ xuống hoặc tăng tới 40.
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
  const phrase = (value) => foldText(value).replace(/[^a-z0-9]+/g,' ').trim();
  const folded = ` ${phrase(haystack)} `;
  // "cầu" là loại công trình nhưng cũng xuất hiện trong cụm chức năng
  // "yêu cầu". Giữ dấu nối nội bộ để cụm sau không tạo bằng chứng xây cầu.
  const searchable = folded.replace(/\syeu\s+cau(?=\s)/g,' yeu-cau');
  const unique = [...new Map((keywords || []).map(cleanText).filter(Boolean)
    .map((keyword) => [phrase(keyword), keyword])).entries()]
    .filter(([key]) => key)
    .sort((a,b) => b[0].length-a[0].length);
  const hits=[];
  for(const [key,label] of unique){
    if(!searchable.includes(` ${key} `))continue;
    // Khi "kênh mương" đã khớp, không cộng thêm "kênh" trên cùng cụm.
    // Điều này giữ thang điểm ổn định và tránh cấu hình từ khóa lồng nhau tự
    // khuếch đại điểm mà không có thêm bằng chứng.
    if(hits.some((hit)=>` ${hit.key} `.includes(` ${key} `)))continue;
    hits.push({key,label});
  }
  return hits.map((hit)=>hit.label);
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
  const multiplier = /\bty\b|tỷ/.test(raw) ? 1e9
    : /trieu|triệu/.test(raw) ? 1e6
      : /nghin|nghìn|ngan|ngàn/.test(raw) ? 1e3 : 1;
  const match = raw.match(/[-+]?\d[\d\s.,]*/);
  if (!match) return null;

  // e-GP và hồ sơ người dùng có thể trộn hai quy ước: 1.234,56 (VI) và
  // 1,234.56 (EN). Chỉ coi 1–2 chữ số cuối là phần thập phân; các nhóm ba
  // chữ số còn lại là phân cách hàng nghìn. Với đơn vị "tỷ/triệu", một dấu
  // đơn được hiểu là dấu thập phân để "1,5 tỷ" không biến thành 15 tỷ.
  let token = match[0].replace(/\s+/g, '');
  const sign = token.startsWith('-') ? -1 : 1;
  token = token.replace(/^[-+]/, '');
  const dots = [...token.matchAll(/\./g)].map(m => m.index);
  const commas = [...token.matchAll(/,/g)].map(m => m.index);
  const separators = [...dots, ...commas].sort((a,b) => a-b);
  let normalized = token;
  if (separators.length) {
    const last = separators[separators.length - 1];
    const fractionLength = token.length - last - 1;
    const singleWithUnit = multiplier !== 1 && separators.length === 1;
    const decimal = (fractionLength > 0 && fractionLength <= 2) || singleWithUnit;
    if (decimal) {
      const whole = token.slice(0,last).replace(/[.,]/g,'');
      const fraction = token.slice(last+1).replace(/[.,]/g,'');
      normalized = `${whole || '0'}.${fraction}`;
    } else {
      normalized = token.replace(/[.,]/g,'');
    }
  }
  const n = Number(normalized) * sign * multiplier;
  return Number.isFinite(n) ? Math.round(n) : null;
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
    const parts=[yyyy,mm,dd,hh,mi,ss].map(Number);
    const [y,mo,day,hour,minute,second]=parts;
    const maxDay=new Date(y,mo,0).getDate();
    if(mo<1||mo>12||day<1||day>maxDay||hour<0||hour>23||minute<0||minute>59||second<0||second>59)return null;
    const d = new Date(y, mo-1, day, hour, minute, second);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const ymd=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if(ymd){
    const [,yyyy,mm,dd,hh='0',mi='0',ss='0']=ymd;
    const [y,mo,day,hour,minute,second]=[yyyy,mm,dd,hh,mi,ss].map(Number);
    const maxDay=new Date(y,mo,0).getDate();
    if(mo<1||mo>12||day<1||day>maxDay||hour>23||minute>59||second>59)return null;
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

/** Chuẩn hóa một liên kết e-GP; trả fallback nếu khác giao thức hoặc khác origin. */
export function canonicalEgpUrl(value, fallback = '') {
  try {
    const u = new URL(cleanText(value));
    return u.protocol === 'https:' && u.origin === EGP_ORIGIN_URL ? u.href : fallback;
  } catch { return fallback; }
}

/* ---------------------------------------------------------------------------
 *  KHOẢNG THỜI GIAN NGƯỜI DÙNG CHỌN — DÙNG CHUNG CHO MỌI MÀN HÌNH
 *
 *  Đặt ở đây vì cả "Gói đang chờ kết quả" lẫn "Kế hoạch lựa chọn nhà thầu" đều
 *  cần đúng logic này. Viết hai lần là hai lần có thể sai khác nhau.
 *
 *  BÀI HỌC ĐÃ TRẢ GIÁ: e-GP chỉ hiểu bộ lọc thời gian dạng
 *      { searchType:'range', from:<epoch ms>, to:<epoch ms> }
 *  Dạng khác (greater_equal + chuỗi ISO) bị BỎ QUA LẶNG LẼ — máy chủ không báo
 *  lỗi, chỉ trả về mọi bản ghi từ trước tới nay. Vì vậy mọi nơi phải dùng đúng
 *  một dạng, và LUÔN lọc lại tại chỗ sau khi tải về.
 * ------------------------------------------------------------------------- */

/**
 * 'yyyy-mm-dd' (dạng của <input type="date">) → epoch ms, giờ địa phương.
 *
 * PHẢI đối chiếu lại ba thành phần sau khi dựng Date: JavaScript tự CUỘN ngày
 * không tồn tại sang ngày khác thay vì báo lỗi — `new Date(2026, 12, 45)` cho
 * ra 14/02/2027, còn 31/02 thành 03/03. Chỉ kiểm `Number.isNaN` là không đủ,
 * và người dùng sẽ nhận kết quả của một khoảng thời gian họ không hề chọn.
 *
 * @param {string} value
 * @param {boolean} endOfDay  true = 23:59:59.999 để "đến ngày" bao trọn ngày đó
 */
export function parseDayMs(value, endOfDay = false) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  // Ngày đã bị cuộn sang tháng/năm khác → đầu vào không phải ngày có thật.
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d.getTime();
}

/**
 * Quy mọi cách người dùng chọn thời gian về MỘT khoảng epoch ms.
 *
 * Thứ tự ưu tiên, chặt trước lỏng sau:
 *   1. fromDate / toDate  — người dùng tự chọn ngày (chính xác nhất)
 *   2. fromYear / toYear  — chọn theo năm
 *   3. days               — "trong vòng N ngày gần đây"
 *
 * Trả `null` khi người dùng không giới hạn thời gian.
 *
 * @returns {{from:number,to:number}|null}
 */
export function dateRangeFrom(scope = {}) {
  const from = parseDayMs(scope.fromDate, false);
  const to = parseDayMs(scope.toDate, true);
  if (from !== null || to !== null) {
    // Người dùng lỡ chọn ngược thì hoán đổi thay vì trả về khoảng rỗng.
    const lo = from === null ? Date.UTC(2000, 0, 1) : from;
    const hi = to === null ? Date.now() : to;
    return lo <= hi ? { from: lo, to: hi } : { from: hi, to: lo };
  }

  const fromYear = Number(scope.fromYear) || 0;
  const toYear = Number(scope.toYear) || 0;
  if (fromYear || toYear) {
    return {
      from: new Date(fromYear || 2000, 0, 1, 0, 0, 0, 0).getTime(),
      to: new Date(toYear || new Date().getFullYear(), 11, 31, 23, 59, 59, 999).getTime()
    };
  }

  const days = Number(scope.days) || 0;
  if (days > 0) return { from: Date.now() - days * 86400000, to: Date.now() };

  return null;
}

/** Mốc thời gian đầu tiên đọc được trong danh sách trường; null nếu không có. */
export function firstStampMs(source, fields) {
  for (const f of fields) {
    const raw = source && source[f];
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

/**
 * Nới rộng khoảng gửi lên MÁY CHỦ thêm một biên an toàn.
 *
 * VÌ SAO: bộ lọc máy chủ và bộ lọc tại chỗ có thể soi hai trường ngày KHÁC
 * nhau (ví dụ máy chủ lọc `publicDate`, còn tại chỗ đối chiếu `decisionDate` —
 * là ngày người dùng nhìn thấy trên giao diện). Hai mốc đó lệch nhau vài ngày.
 * Nếu gửi lên đúng khoảng người dùng chọn, máy chủ có thể cắt mất bản ghi mà
 * bộ lọc tại chỗ lẽ ra giữ lại — tức là BỎ SÓT, thứ tệ nhất với người đi tìm
 * thầu.
 *
 * Nới biên thì máy chủ chỉ còn vai trò thu hẹp cho nhanh, còn ranh giới chính
 * xác do bộ lọc tại chỗ quyết định.
 */
export function padRange(range, days = 30) {
  if (!range) return null;
  const pad = Math.max(0, Number(days) || 0) * 86400000;
  return { from: range.from - pad, to: range.to + pad };
}

/* ---------------------------------------------------------------------------
 *  TRANG NÀO CÓ CONTENT SCRIPT?
 *
 *  4.0.0 thu hẹp `content_scripts.matches` từ toàn bộ e-GP xuống đúng các trang
 *  lựa chọn nhà thầu — đúng về quyền riêng tư. Nhưng phần nền lại có HAI đường
 *  vẫn đưa lượt quét tới trang không còn content script, và cả hai đều chết
 *  bằng nguyên văn thông báo tiếng Anh của Chrome:
 *
 *      "Could not establish connection. Receiving end does not exist."
 *
 *    1. Chưa lưu bộ lọc  -> dự phòng về /web/guest/home     (đã sửa ở 4.0.1)
 *    2. Đang mở sẵn e-GP -> tái dùng tab đó NGUYÊN TRẠNG,
 *                           dù nó là trang chủ hay trang bất kỳ  (đường này)
 *
 *  Đường 2 rất dễ gặp: người dùng vừa vào trang chủ e-GP xem tin, rồi bấm
 *  "Quét e-GP ngay". Đã tái hiện trong Chromium: 0 gói.
 *
 *  Ba thứ dưới đây là NGUỒN SỰ THẬT DUY NHẤT về phạm vi content script, để
 *  manifest và phần nền không thể lệch nhau lần nữa. Có kiểm thử đối chiếu
 *  thẳng với manifest.json trong tests/content-script-scope.test.js.
 * ------------------------------------------------------------------------- */

/** Trang mặc định để quét: luôn là trang có content script. */
export const EGP_SCAN_PAGE = EGP_SEARCH;

/** URL này có nằm trong phạm vi content script của manifest không? */
export function hasContentScript(url) {
  const href = canonicalEgpUrl(url);
  if (!href) return false;
  try {
    return /^\/(?:[a-z]{2}\/)?web\/guest\/contractor-selection/i.test(new URL(href).pathname);
  } catch { return false; }
}

/**
 * Chọn trang để mở cho một lượt quét.
 *
 * Chỉ giữ `sourcePageUrl` đã lưu khi trang đó thật sự có content script;
 * ngược lại quay về trang tìm kiếm lựa chọn nhà thầu.
 */
export function scanTargetUrl(sourcePageUrl) {
  return hasContentScript(sourcePageUrl) ? canonicalEgpUrl(sourcePageUrl) : EGP_SCAN_PAGE;
}

/**
 * Chọn link tốt nhất có thể: link thật e-GP đã sinh > link sâu tự dựng >
 * trang tìm kiếm (dùng cho gói mới nằm trong KHLCNT, chưa có trang chi tiết).
 */
function safeDetailUrl(value, sourcePageUrl, obj) {
  const s = cleanText(value);
  const direct = canonicalEgpUrl(s);
  if (direct && !isBareEgpHome(direct)) return direct;
  if (s.startsWith('/') && !s.startsWith('//') && s.length > 1) return `${EGP_ORIGIN_URL}${s}`;
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
    watchlisted: false,
    // Pipeline Go/No-Go là dữ liệu do người dùng quyết định. Giá trị mặc định
    // chỉ áp dụng cho gói mới; mergeTender() luôn ưu tiên quyết định đã lưu.
    decisionState: 'NEW',
    decisionOwner: '',
    decisionNote: '',
    decisionUpdatedAt: null,
    changeLog: []
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
  const normalized=` ${hay.replace(/[^a-z0-9]+/g,' ')} `;
  return normalized.includes(' xl ') || ['xay lap','thi cong','xay dung','sua chua','nang cap','cai tao']
    .some(x => normalized.includes(` ${x} `));
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

  const minPrice = Number(settings.minPrice ?? 0);
  const maxPrice = Number(settings.maxPrice ?? Number.MAX_SAFE_INTEGER);
  const minDays = Math.max(0, Number(settings.minDaysToClose ?? 3));
  if (tender.price === null || tender.price === undefined) {
    parts.price = 4;
    reasons.push('Trang kết quả chưa thể hiện rõ giá gói thầu');
  } else if (tender.price >= minPrice && tender.price <= maxPrice) {
    parts.price = 12;
    reasons.push('Giá gói thầu trong dải quan tâm');
  } else parts.price = 0;

  if (tender.closeDate) {
    const days = (new Date(tender.closeDate).getTime() - Date.now()) / 86400000;
    if (days >= Math.max(10, minDays)) parts.time = 7;
    else if (days >= minDays) parts.time = 4;
    else parts.time = 0;
    reasons.push(days >= 0 ? `Còn khoảng ${Math.floor(days)} ngày trước đóng thầu` : 'Đã qua thời điểm đóng thầu');
  } else parts.time = 3;

  const completeness = [tender.bidName,tender.location,tender.price,tender.investorName,tender.closeDate].filter(v => v !== null && v !== undefined && v !== '').length;
  parts.completeness = completeness >= 4 ? 5 : completeness >= 2 ? 3 : 1;

  let score = Object.values(parts).reduce((a,b) => a+b,0);
  score = Math.max(0,Math.min(100,score));
  const recommendation = score >= 85 ? 'NGHIÊN CỨU NGAY' : score >= 70 ? 'RẤT ĐÁNG QUAN TÂM' : score >= 55 ? 'NÊN XEM' : 'THAM KHẢO';
  const requiredOk = !(settings.requiredKeywords || []).length || requiredHits.length > 0;
  const matched = requiredOk && (!settings.requireConstruction || construction) && score >= Number(settings.reportMinScore ?? 55);
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
  // Không để một lượt quét mới ghi đè quyết định nội bộ về lại "Mới".
  merged.decisionState = existing?.decisionState || incoming.decisionState || 'NEW';
  merged.decisionOwner = existing?.decisionOwner || incoming.decisionOwner || '';
  merged.decisionNote = existing?.decisionNote || incoming.decisionNote || '';
  merged.decisionUpdatedAt = existing?.decisionUpdatedAt || incoming.decisionUpdatedAt || null;

  /* Radar thay đổi: chỉ ghi khi CẢ giá trị cũ và mới đều có dữ liệu. Bản ghi
     một phần từ DOM thường thiếu trường; coi phần thiếu đó là "bị xóa" sẽ tạo
     cảnh báo giả. Giữ tối đa 20 thay đổi gần nhất để kho không phình vô hạn. */
  const tracked = [
    ['price','Giá gói thầu'],
    ['closeDate','Hạn đóng thầu'],
    ['bidName','Tên gói thầu'],
    ['location','Địa điểm'],
    ['investorName','Chủ đầu tư']
  ];
  const at = incoming.lastSeenAt || incoming.capturedAt || new Date().toISOString();
  const changes = [];
  if (existing && existing.key) {
    for (const [field,label] of tracked) {
      const before = existing[field];
      const after = incoming[field];
      const beforeOk = before !== null && before !== undefined && before !== '';
      const afterOk = after !== null && after !== undefined && after !== '';
      if (beforeOk && afterOk && String(before) !== String(after)) {
        changes.push({field,label,before,after,at});
      }
    }
  }
  merged.changeLog = [...(Array.isArray(existing?.changeLog) ? existing.changeLog : []), ...changes].slice(-20);
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
    if (u.protocol !== 'https:' || u.origin !== 'https://muasamcong.mpi.gov.vn') return null;
    if (u.pathname !== '/o/egp-portal-contractor-selection-v2/services/smart/search') return null;
    for (const key of [...u.searchParams.keys()]) {
      if (/token|jwt|session|auth|signature|secret/i.test(key)) u.searchParams.delete(key);
    }
    url = u.href;
  } catch { return null; }

  // Chỉ chấp nhận đúng truy vấn tìm kiếm JSON. Không lưu một request HTTP tùy
  // ý rồi phát lại bằng phiên đăng nhập của người dùng.
  if (String(request.method || 'POST').toUpperCase() !== 'POST') return null;
  const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body || null);
  if (!rawBody || rawBody.length > 100000) return null;
  let parsed;
  try { parsed = JSON.parse(rawBody); } catch { return null; }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0] || typeof parsed[0] !== 'object') return null;
  if (!Array.isArray(parsed[0].query) || parsed[0].query.length === 0) return null;

  const secretKey = /(token|captcha|csrf|xsrf|jwt|session|auth|signature|secret|cookie|password)/i;
  let nodes = 0;
  const scrub = (value, depth = 0) => {
    if (depth > 12 || nodes++ > 12000) throw new Error('search template too large');
    if (Array.isArray(value)) return value.slice(0,500)
      .map((x) => scrub(x, depth + 1)).filter((x) => x !== undefined);
    if (value && typeof value === 'object') {
      const semanticName=value.fieldName??value.field??value.key??value.name;
      // e-GP có dạng `{fieldName:'captchaToken', fieldValues:[...]}`: tên khóa
      // trực tiếp vô hại nhưng giá trị vẫn là bí mật, nên bỏ cả filter đó.
      if(typeof semanticName==='string'&&secretKey.test(semanticName))return undefined;
      const out = {};
      for (const [k,v] of Object.entries(value).slice(0,300)) {
        if (!secretKey.test(k)) {
          const clean=scrub(v, depth + 1);
          if(clean!==undefined)out[k]=clean;
        }
      }
      return out;
    }
    return typeof value === 'string' ? value.slice(0,10000) : value;
  };
  try { parsed = scrub(parsed); } catch { return null; }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !Array.isArray(parsed[0]?.query)
    || parsed[0].query.length === 0) return null;
  const body = JSON.stringify(parsed);
  // Không cần mang query của tab nguồn sang lần chạy sau. Dùng route tìm kiếm
  // chuẩn giúp loại cả token phiên có tên lạ mà blacklist không thể đoán hết.
  const safeSource = 'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?render=search';
  return {
    url,
    method: 'POST',
    headers: {'accept':'application/json','content-type':'application/json'},
    body,
    sourcePageUrl:safeSource,
    candidateCount:Math.max(0,Math.min(5000,Number(candidateCount)||0)),
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
  if (/^(1|true|yes)$/.test(s) || /(trung thau|winner|selected|thanh cong|success)/.test(s) && !/(khong|truot|fail|loai)/.test(s)) return true;
  if (/^(0|false|no)$/.test(s) || /(truot|khong trung|khong dat|fail|loai|rejected)/.test(s)) return false;
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
    role: isWinner === true ? 'Trúng thầu' : (isWinner === false ? 'Không trúng' : 'Chưa xác định'),
    isWinner,
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
  merged.isWinner = existing?.isWinner === true || incoming.isWinner === true
    ? true
    : existing?.isWinner === false || incoming.isWinner === false ? false : null;
  merged.role = merged.isWinner === true ? 'Trúng thầu'
    : merged.isWinner === false ? 'Không trúng' : 'Chưa xác định';
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
