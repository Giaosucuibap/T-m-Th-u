/* ============================================================================
 *  TÌM BẰNG CÂU THƯỜNG (4.22.0)
 *
 *  "kênh mương dưới 10 tỷ ở Lâm Đồng, đóng thầu trong hai tuần"
 *     → từ khoá "kênh mương" · giá đến 10 tỷ · tỉnh Lâm Đồng · đóng thầu trong 14 ngày
 *
 *  Làm bằng LUẬT, không dùng AI: cùng một câu luôn cho cùng một kết quả, chạy ngay trên
 *  máy, không gửi câu của người dùng đi đâu. Hàm chỉ ĐIỀN tiêu chí; người dùng thấy rõ
 *  phần đã hiểu, phần chưa hiểu rồi mới bấm tìm. Câu gõ không dấu cũng nhận.
 *
 *  Cách làm: gập câu về chữ thường không dấu (giữ nguyên độ dài để vị trí khớp với câu
 *  gốc), lần lượt nhận từng mệnh đề (hạn đóng thầu, giá, tỉnh, loại gói, chủ đầu tư) và
 *  đánh dấu đoạn đã dùng; phần còn lại, bỏ từ đệm, là từ khoá — lấy từ câu GỐC nên còn dấu.
 * ========================================================================== */

/** Gập từng ký tự: bỏ dấu, đ→d, chữ thường. Trả về chuỗi CÙNG ĐỘ DÀI với chuỗi vào (đã NFC). */
export function foldSameLength(text) {
  let out = '';
  for (const ch of String(text ?? '').normalize('NFC')) {
    let base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    base = base.replace(/[đĐ]/g, 'd').toLowerCase();
    out += base.length === ch.length ? base : (base[0] || ' ').padEnd(ch.length, ' ');
  }
  return out;
}

/* 63 tỉnh thành trước khi sáp nhập (hồ sơ cũ trên e-GP còn dùng) — danh mục e-GP hiện
   hành, nếu trang truyền vào, được ưu tiên và ghép thêm. */
export const PROVINCE_NAMES = Object.freeze(['An Giang', 'Bà Rịa - Vũng Tàu', 'Bắc Giang', 'Bắc Kạn', 'Bạc Liêu', 'Bắc Ninh', 'Bến Tre', 'Bình Định', 'Bình Dương',
  'Bình Phước', 'Bình Thuận', 'Cà Mau', 'Cần Thơ', 'Cao Bằng', 'Đà Nẵng', 'Đắk Lắk', 'Đắk Nông', 'Điện Biên', 'Đồng Nai', 'Đồng Tháp', 'Gia Lai', 'Hà Giang',
  'Hà Nam', 'Hà Nội', 'Hà Tĩnh', 'Hải Dương', 'Hải Phòng', 'Hậu Giang', 'Hòa Bình', 'Hưng Yên', 'Khánh Hòa', 'Kiên Giang', 'Kon Tum', 'Lai Châu', 'Lâm Đồng',
  'Lạng Sơn', 'Lào Cai', 'Long An', 'Nam Định', 'Nghệ An', 'Ninh Bình', 'Ninh Thuận', 'Phú Thọ', 'Phú Yên', 'Quảng Bình', 'Quảng Nam', 'Quảng Ngãi', 'Quảng Ninh',
  'Quảng Trị', 'Sóc Trăng', 'Sơn La', 'Tây Ninh', 'Thái Bình', 'Thái Nguyên', 'Thanh Hóa', 'Thừa Thiên Huế', 'Tiền Giang', 'TP. Hồ Chí Minh', 'Trà Vinh',
  'Tuyên Quang', 'Vĩnh Long', 'Vĩnh Phúc', 'Yên Bái', 'Huế']);
const PROVINCE_ALIASES = Object.freeze([['tp hcm', 'TP. Hồ Chí Minh'], ['tphcm', 'TP. Hồ Chí Minh'], ['hcm', 'TP. Hồ Chí Minh'], ['sai gon', 'TP. Hồ Chí Minh'],
  ['ho chi minh', 'TP. Hồ Chí Minh'], ['vung tau', 'Bà Rịa - Vũng Tàu'], ['ba ria', 'Bà Rịa - Vũng Tàu'], ['dak lak', 'Đắk Lắk'], ['daklak', 'Đắk Lắk'], ['dac lac', 'Đắk Lắk'],
  ['dak nong', 'Đắk Nông'], ['dac nong', 'Đắk Nông'], ['hue', 'Huế']]);

const NUMBER_WORDS = Object.freeze({ mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10, 'muoi lam': 15, 'hai muoi': 20, 'ba muoi': 30, nua: 0.5 });
const NUM = '(\\d+(?:[.,]\\d+)?|muoi lam|hai muoi|ba muoi|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)';
const UNIT = '(nghin ty|ngan ty|ty|ti|trieu|tr)';
const AMOUNT = `${NUM}\\s*${UNIT}(\\s+ruoi)?(?:\\s*(?:dong|vnd|d))?`;

function numberOf(raw) {
  const s = String(raw || '').trim();
  if (Object.hasOwn(NUMBER_WORDS, s)) return NUMBER_WORDS[s];
  // "2,5" và "2.5" đều là hai phẩy năm; "1.500" (ba chữ số sau dấu chấm) là một nghìn rưỡi.
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}
function amountOf(num, unit, half) {
  const n = numberOf(num);
  if (!Number.isFinite(n)) return NaN;
  const scale = /nghin ty|ngan ty/.test(unit) ? 1e12 : /^t[yi]$/.test(unit) ? 1e9 : 1e6;
  return Math.round((n + (half ? 0.5 : 0)) * scale);
}

/** Viết số tiền gọn: 10 tỷ, 2,5 tỷ, 500 triệu. */
export function moneyShort(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  const fmt = (x) => String(Math.round(x * 100) / 100).replace('.', ',');
  if (n >= 1e9) return `${fmt(n / 1e9)} tỷ`;
  if (n >= 1e6) return `${fmt(n / 1e6)} triệu`;
  return `${Math.round(n).toLocaleString('vi-VN')} đ`;
}

const two = (n) => String(n).padStart(2, '0');
/** Ngày theo giờ Việt Nam, dạng YYYY-MM-DD (đúng dạng ô <input type="date">). */
export function vnDateInput(ms) {
  const d = new Date(ms + 7 * 3600_000);
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
}
const vnDateText = (iso) => { const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y}`; };

const CATEGORY_RULES = Object.freeze([
  [/\b(phi tu van)\b/, 'PTV', 'Phi tư vấn'],
  [/\b(tu van giam sat|tvgs|giam sat thi cong)\b/, 'TV_SUPERVISION', 'Tư vấn giám sát'],
  [/\b(tu van thiet ke|tvtk|thiet ke ban ve thi cong)\b/, 'TV_DESIGN', 'Tư vấn thiết kế'],
  [/\b(tu van khao sat|khao sat dia (?:hinh|chat))\b/, 'TV_SURVEY', 'Tư vấn khảo sát'],
  [/\b(tu van tham tra|tu van tham dinh|tham tra thiet ke)\b/, 'TV_APPRAISAL', 'Tư vấn thẩm tra / thẩm định'],
  [/\b(tu van quan ly du an|tu van qlda)\b/, 'TV_PROJECT_MANAGEMENT', 'Tư vấn quản lý dự án'],
  [/\b(goi tu van|tu van)\b/, 'TV', 'Tư vấn'],
  [/\b(goi xay lap|xay lap|goi thi cong|thi cong xay dung|thi cong)\b/, 'XL', 'Xây lắp'],
  [/\b(goi hang hoa|hang hoa|mua sam hang hoa|mua sam)\b/, 'HH', 'Hàng hóa'],
  [/\b(goi hon hop|hon hop|epc)\b/, 'HON_HOP', 'Hỗn hợp']
]);

/* Lời mở đầu và từ nối bỏ khỏi từ khoá. So trên chữ thường CÒN DẤU, chỉ theo cụm ở đầu/cuối, và
   chỉ nhận dạng không dấu với từ không gây nhầm: "kè" (kè chống sạt lở) không bị coi là "kê" của
   "liệt kê"; "chợ" không bị coi là "cho"; "xe tải" không mất chữ "tải" vì giống "tại". */
const LEAD_WORDS = new RegExp('^(?:(?:hãy|hay|xin)\\s+)?'
  + '(?:(?:tìm(?:\\s+kiếm)?|tim(?:\\s+kiem)?|xem|liệt\\s+kê|liet\\s+ke|danh\\s+sách|danh\\s+sach|cho\\s+xem)(?:\\s+(?:giúp|giup))?(?:\\s+cho)?(?:\\s+(?:tôi|toi|mình|minh|em|anh))?\\s*)?'
  + '(?:(?:các|cac|những|nhung|tất\\s+cả(?:\\s+các)?|tat\\s+ca(?:\\s+cac)?)(?:\\s+|$))?'
  + '(?:(?:gói|goi)(?:\\s+(?:thầu|thau))?(?:\\s+|$))?');
const TAIL_WORDS = /(?:(?:^|\s+)(?:ở|o|tại|và|va|với|voi|thuộc|thuoc|có giá|co gia|có|giá|trị giá|tri gia|trên địa bàn|tren dia ban|địa bàn|dia ban|của|đóng))+$/;

/**
 * Phân tích một câu tìm kiếm.
 * @param {string} text
 * @param {{provinces?: string[], now?: number}} options
 * @returns {{criteria: object, view: object, understood: {kind:string,text:string}[], leftover: string, empty: boolean}}
 */
export function parseNaturalQuery(text, { provinces = [], now = Date.now() } = {}) {
  const original = String(text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 400);
  const folded = foldSameLength(original);
  const used = new Array(original.length).fill(false);
  const understood = [];
  const criteria = {};
  const view = {};

  const take = (start, end) => { for (let i = Math.max(0, start); i < Math.min(used.length, end); i++) used[i] = true; };
  const free = (start, end) => { for (let i = start; i < end; i++) if (used[i]) return false; return true; };
  /** Chạy một mẫu trên phần chưa dùng; trả về match đầu tiên còn tự do. */
  const find = (pattern) => {
    const re = new RegExp(pattern, 'g');
    for (let m = re.exec(folded); m; m = re.exec(folded)) {
      if (m[0] && free(m.index, m.index + m[0].length)) return m;
      if (!m[0]) re.lastIndex++;
    }
    return null;
  };

  /* 0. NGÀY ĐĂNG — chưa có bộ lọc theo ngày đăng: nhận ra để KHÔNG biến thành từ khoá, và nói rõ là bỏ qua. */
  let m = find(`\\b(?:moi\\s+)?(?:dang tai|dang|cong bo|phat hanh)\\s+(?:trong\\s+)?${NUM}\\s*(?:ngay|tuan|thang)\\s*(?:vua qua|qua|gan day|truoc)\\b`);
  if (m) {
    understood.push({ kind: 'ignored', text: `Chưa lọc được theo ngày đăng — bỏ qua “${original.slice(m.index, m.index + m[0].length).trim()}”` });
    take(m.index, m.index + m[0].length);
  }

  /* 1. HẠN ĐÓNG THẦU ------------------------------------------------------ */
  const lead = '(?:\\b(?:han dong thau|dong thau|het han(?: nop)?(?: thau| ho so)?|con han(?: nop)?(?: thau| ho so)?|han nop(?: thau| ho so)?|nop thau|nop ho so)\\s+)';
  m = find(`(?:${lead}(?:trong(?: vong)?\\s+)?|\\btrong(?: vong)?\\s+|\\bcon\\s+)${NUM}\\s*(ngay|tuan|thang)\\b(?:\\s+(?:toi|nua|nay))?(?!\\s*(?:qua|truoc|gan day))`);
  if (m) {
    const n = numberOf(m[1]);
    const days = Math.round(n * (m[2] === 'tuan' ? 7 : m[2] === 'thang' ? 30 : 1));
    if (Number.isFinite(days) && days > 0 && days <= 366) {
      view.closeFrom = vnDateInput(now); view.closeTo = vnDateInput(now + days * 86_400_000);
      understood.push({ kind: 'deadline', text: `Đóng thầu trong ${days} ngày (đến ${vnDateText(view.closeTo)})` });
      take(m.index, m.index + m[0].length);
    }
  }
  if (!view.closeTo) {
    m = find(`${lead}?(?:\\btrong\\s+)?\\b(tuan nay|tuan sau|tuan toi|thang nay|thang sau|thang toi|hom nay|ngay mai)\\b`);
    if (m && (/dong|het han|con han|nop/.test(m[0]) || /tuan|thang/.test(m[1]))) {
      const vn = new Date(now + 7 * 3600_000);
      const dow = (vn.getUTCDay() + 6) % 7;                        // thứ Hai = 0
      const daysInMonth = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() + 1, 0)).getUTCDate();
      const span = ({ 'hom nay': [0, 0], 'ngay mai': [1, 1], 'tuan nay': [0, 6 - dow], 'tuan sau': [7 - dow, 13 - dow], 'tuan toi': [7 - dow, 13 - dow],
        'thang nay': [0, daysInMonth - vn.getUTCDate()], 'thang sau': [daysInMonth - vn.getUTCDate() + 1, daysInMonth - vn.getUTCDate() + 30], 'thang toi': [daysInMonth - vn.getUTCDate() + 1, daysInMonth - vn.getUTCDate() + 30] })[m[1]];
      view.closeFrom = vnDateInput(now + span[0] * 86_400_000); view.closeTo = vnDateInput(now + span[1] * 86_400_000);
      understood.push({ kind: 'deadline', text: `Đóng thầu từ ${vnDateText(view.closeFrom)} đến ${vnDateText(view.closeTo)}` });
      take(m.index, m.index + m[0].length);
    }
  }
  if (!view.closeTo) {
    m = find(`${lead}(?:truoc|den|toi)\\s+(?:ngay\\s+)?(\\d{1,2})[/-](\\d{1,2})(?:[/-](\\d{4}))?`);
    if (m) {
      const vn = new Date(now + 7 * 3600_000);
      let year = m[3] ? Number(m[3]) : vn.getUTCFullYear();
      const day = Number(m[1]), month = Number(m[2]);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        if (!m[3] && Date.UTC(year, month - 1, day) < Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate())) year += 1;
        view.closeFrom = vnDateInput(now); view.closeTo = `${year}-${two(month)}-${two(day)}`;
        understood.push({ kind: 'deadline', text: `Đóng thầu đến ${vnDateText(view.closeTo)}` });
        take(m.index, m.index + m[0].length);
      }
    }
  }

  /* 2. GIÁ ---------------------------------------------------------------- */
  const priceLead = '(?:\\b(?:co\\s+)?(?:gia goi thau|gia tri|tri gia|gia|quy mo)\\s+)?';
  m = find(`${priceLead}(?:\\btu\\s+)?\\b${NUM}\\s*${UNIT}?(\\s+ruoi)?\\s*(?:den|toi|-|–|—)\\s*${AMOUNT}\\b`);
  if (m && (m[2] || /\d|muoi|mot|hai|ba|bon|nam|sau|bay|tam|chin/.test(m[1]))) {
    const hi = amountOf(m[4], m[5], m[6]);
    const lo = amountOf(m[1], m[2] || m[5], m[3]);
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi >= lo) {
      criteria.minPrice = lo; criteria.maxPrice = hi;
      understood.push({ kind: 'price', text: `Giá từ ${moneyShort(lo)} đến ${moneyShort(hi)}` });
      take(m.index, m.index + m[0].length);
    }
  }
  if (criteria.maxPrice === undefined) {
    m = find(`${priceLead}(?:\\b(?:duoi|khong qua|toi da|nho hon|it hon|khong vuot(?: qua)?)|<=?)\\s*${AMOUNT}\\b`) || find(`${priceLead}\\b${AMOUNT}\\s*(?:tro xuong|do lai|tro lai)\\b`);
    if (m) {
      const hi = amountOf(m[1], m[2], m[3]);
      if (Number.isFinite(hi) && hi > 0) { criteria.maxPrice = hi; understood.push({ kind: 'price', text: `Giá đến ${moneyShort(hi)}` }); take(m.index, m.index + m[0].length); }
    }
    m = find(`${priceLead}(?:\\b(?:tren|tu|it nhat|toi thieu|lon hon|hon)|>=?)\\s*${AMOUNT}\\b(?:\\s*tro len)?`) || find(`${priceLead}\\b${AMOUNT}\\s*tro len\\b`);
    if (m) {
      const lo = amountOf(m[1], m[2], m[3]);
      if (Number.isFinite(lo) && lo > 0 && (criteria.maxPrice === undefined || lo <= criteria.maxPrice)) {
        criteria.minPrice = lo; understood.push({ kind: 'price', text: `Giá từ ${moneyShort(lo)}` }); take(m.index, m.index + m[0].length);
      }
    }
    if (criteria.maxPrice === undefined && criteria.minPrice === undefined) {
      m = find(`${priceLead}(?:\\b(?:khoang|tam|co|gan)\\s+)?\\b${AMOUNT}\\b`);
      if (m) {
        const mid = amountOf(m[1], m[2], m[3]);
        if (Number.isFinite(mid) && mid > 0) {
          criteria.minPrice = Math.round(mid * 0.7); criteria.maxPrice = Math.round(mid * 1.3);
          understood.push({ kind: 'price', text: `Giá khoảng ${moneyShort(mid)} (từ ${moneyShort(criteria.minPrice)} đến ${moneyShort(criteria.maxPrice)})` });
          take(m.index, m.index + m[0].length);
        }
      }
    }
  }

  /* 3. CHỦ ĐẦU TƯ — xét TRƯỚC tỉnh và loại gói: tên cơ quan thường chứa tên tỉnh ("Sở … Lâm Đồng")
        hoặc chữ "tư vấn"; phần đã thuộc tên chủ đầu tư thì không xét lại. Tên dừng ở dấu phẩy,
        ở chữ "ở/tại", hoặc ở mệnh đề giá/hạn đã nhận. */
  {
    const patterns = ['\\b(?:chu dau tu|cdt|ben moi thau)\\s*(?:la\\s+|:\\s*|\\s+)([^,;]+)',
      '\\bcua\\s+((?:ban|bql|ubnd|uy ban|so|phong|chi cuc|trung tam|cong ty|tong cong ty|cuc|vien|truong|benh vien)\\b[^,;]*)'];
    for (const pattern of patterns) {
      const re = new RegExp(pattern, 'g');
      let hit = null;
      for (let x = re.exec(folded); x; x = re.exec(folded)) { if (!used[x.index]) { hit = x; break; } }
      if (!hit) continue;
      const start = hit.index + hit[0].lastIndexOf(hit[1]);
      let end = start;
      while (end < start + hit[1].length && !used[end]) end++;
      const stop = folded.slice(start, end).search(/\s(?:o|tai)\s/);
      if (stop > 0) end = start + stop;
      const name = original.slice(start, end).trim().replace(/[.\s]+$/, '');
      if (name.length < 3) continue;
      criteria.investor = name;
      understood.push({ kind: 'investor', text: `Chủ đầu tư: ${name}` });
      take(hit.index, end);
      break;
    }
  }

  /* 4. TỈNH --------------------------------------------------------------- */
  const names = new Map();
  for (const name of [...PROVINCE_NAMES, ...(Array.isArray(provinces) ? provinces : [])]) {
    const clean = String(name || '').trim();
    const key = foldSameLength(clean).replace(/^(?:tinh|thanh pho|tp\.?)\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
    if (key.length >= 3) names.set(key, clean);               // danh mục e-GP (truyền sau) ghi đè cách viết
  }
  for (const [alias, name] of PROVINCE_ALIASES) if (!names.has(alias)) names.set(alias, [...names.values()].find((v) => foldSameLength(v) === foldSameLength(name)) || name);
  const foundProvinces = [];
  for (const key of [...names.keys()].sort((a, b) => b.length - a.length)) {
    const pattern = `(?:\\b(?:o|tai|thuoc|tren dia ban|dia ban|khu vuc|va)\\s+)?(?:\\b(?:tinh|thanh pho|tp\\.?)\\s+)?\\b${key.replace(/ /g, '[\\s-]+')}\\b`;
    const hit = find(pattern);
    if (!hit) continue;
    take(hit.index, hit.index + hit[0].length);
    if (!foundProvinces.includes(names.get(key))) foundProvinces.push(names.get(key));
  }
  if (foundProvinces.length) {
    criteria.province = foundProvinces.join(', ');
    understood.push({ kind: 'province', text: `Tỉnh: ${criteria.province}` });
  }

  /* 5. LOẠI GÓI ----------------------------------------------------------- */
  for (const [pattern, value, label] of CATEGORY_RULES) {
    const hit = find(pattern.source);
    if (!hit) continue;
    criteria.category = value;
    understood.push({ kind: 'category', text: `Loại gói: ${label}` });
    take(hit.index, hit.index + hit[0].length);
    break;
  }

  /* 6. TỪ KHOÁ: phần còn lại --------------------------------------------- */
  const pieces = [];
  let buffer = '';
  const flush = () => { if (buffer.trim()) pieces.push(buffer.trim()); buffer = ''; };
  for (let i = 0; i < original.length; i++) {
    if (used[i] || /[,;.!?:()"“”]/.test(original[i])) flush(); else buffer += original[i];
  }
  flush();
  const cleaned = pieces.map((piece) => {
    let text = piece.trim();
    text = text.slice((text.toLowerCase().match(LEAD_WORDS) || [''])[0].length);
    const tail = (text.toLowerCase().match(TAIL_WORDS) || [''])[0].length;
    if (tail) text = text.slice(0, text.length - tail);
    return text.trim();
  }).filter((piece) => piece.length >= 2);
  const keyword = cleaned.join(' ').slice(0, 200);
  if (keyword) { criteria.keyword = keyword; understood.push({ kind: 'keyword', text: `Từ khoá: ${keyword}` }); }

  return { criteria, view, understood, leftover: keyword, empty: !understood.some((item) => item.kind !== 'ignored') };
}
