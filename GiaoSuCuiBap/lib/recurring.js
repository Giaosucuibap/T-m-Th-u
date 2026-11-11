/* ============================================================================
 *  BÁO TRƯỚC GÓI LẶP LẠI HẰNG NĂM (4.22.0)
 *
 *  Nhiều gói năm nào cũng có: duy tu, sửa chữa thường xuyên, nạo vét kênh mương, bảo vệ,
 *  vệ sinh… Cùng một chủ đầu tư, tên gần như y nguyên, chỉ khác năm. Mô-đun này tìm các
 *  gói như vậy trong dữ liệu ĐÃ CÓ TRÊN MÁY (kho quan sát mở thầu / kết quả và kho gói) và
 *  ước lượng kỳ đăng tiếp theo, để chuẩn bị hồ sơ sớm.
 *
 *  Nói thẳng giới hạn (trang cũng ghi):
 *    - Chỉ thấy những gì đã quét về máy. Kho càng nhiều năm thì càng đáng tin.
 *    - "Kỳ dự kiến" là SUY TỪ CÁC NĂM TRƯỚC, không phải kế hoạch của chủ đầu tư. Nguồn
 *      chính thức về gói sắp mời thầu là Kế hoạch lựa chọn nhà thầu (màn hình riêng).
 *    - Phần mềm không đọc được thời hạn hợp đồng nên KHÔNG báo "hợp đồng sắp hết hạn".
 *
 *  Hàm thuần: không mạng, không kho.
 * ========================================================================== */

const VN = 7 * 3600_000;
const DAY = 86_400_000;

export function foldName(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

/** Bỏ phần đổi theo từng năm/từng đợt khỏi tên gói, giữ phần mô tả công việc. Trả về mảng từ. */
export function nameTokens(name) {
  const text = foldName(name)
    .replace(/\b(?:19|20)\d{2}\s*[-–—/]\s*(?:19|20)?\d{2,4}\b/g, ' ')      // 2024-2025, 2024/25
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')                                      // 2025
    .replace(/\b(?:nam|nien do|giai doan|ke hoach nam)\b/g, ' ')
    .replace(/\b(?:dot|lan|quy|thang|ky)\s+(?:\d+|[ivx]+)\b/g, ' ')
    .replace(/\bgoi(?:\s+thau)?(?:\s+so)?\s*\d*\s*[:.\-–]?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  return text ? text.split(' ').filter((t) => t.length > 1 || /\d/.test(t)) : [];
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let both = 0;
  for (const t of a) if (b.has(t)) both++;
  return both / (a.size + b.size - both);
}

/* Chữ gợi ý gói thường niên — chỉ dùng để xếp hạng và gắn nhãn, không dùng để loại. */
const ANNUAL_HINT = /\b(duy tu|bao duong|bao tri|sua chua thuong xuyen|thuong xuyen|nao vet|ve sinh|bao ve|cham soc|cay xanh|van hanh|quan ly khai thac|dinh ky|hang nam|cung cap|cung ung|dich vu|thue|bao hiem|in an|van phong pham|suat an|xang dau|chong han|phong chong|khac phuc)\b/;

const iso = (ms) => new Date(ms).toISOString();
const parse = (value) => { const n = Date.parse(String(value || '')); return Number.isFinite(n) ? n : NaN; };
const vnYear = (ms) => new Date(ms + VN).getUTCFullYear();
const dayOfYear = (ms) => { const d = new Date(ms + VN); return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY); };
const median = (list) => { const s = [...list].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2)) : NaN; };

function packageCode(row = {}) {
  const raw = String(row.notifyNo || row.packageKey || row.key || '').trim();
  const code = raw.match(/IB\d+/i)?.[0] || raw.split('::')[0];
  return code.replace(/-\d{2}$/, '').toUpperCase();
}

/**
 * Gom mọi gói đã biết thành một danh sách không trùng mã.
 * Nguồn: kho quan sát (mỗi gói nhiều dòng — mỗi nhà thầu một dòng) và kho gói TBMT.
 */
export function collectPackages({ observations = [], tenders = [] } = {}) {
  const map = new Map();
  const put = (code, row) => {
    if (!code || !row.name || !Number.isFinite(row.at)) return;
    const prev = map.get(code);
    if (!prev) { map.set(code, row); return; }
    // Giữ ngày SỚM nhất biết được (gần ngày đăng hơn) và bổ sung trường còn thiếu.
    map.set(code, { ...prev, at: Math.min(prev.at, row.at), price: prev.price || row.price, investorName: prev.investorName || row.investorName,
      location: prev.location || row.location, field: prev.field || row.field, url: prev.url || row.url });
  };
  for (const o of Array.isArray(observations) ? observations : []) {
    if (!o || typeof o !== 'object') continue;
    put(packageCode(o), { code: packageCode(o), name: String(o.bidName || '').trim(), investorName: String(o.investorName || '').trim(), investorCode: String(o.investorCode || '').trim(),
      field: String(o.field || '').trim(), location: String(o.location || '').trim(), price: Number(o.packageBasis) > 0 ? Number(o.packageBasis) : 0, at: parse(o.at), url: String(o.sourceUrl || '') });
  }
  for (const t of Array.isArray(tenders) ? tenders : []) {
    if (!t || typeof t !== 'object') continue;
    put(packageCode(t), { code: packageCode(t), name: String(t.bidName || '').trim(), investorName: String(t.investorName || t.procuringEntityName || '').trim(), investorCode: String(t.investorCode || '').trim(),
      field: String(t.fieldRaw || t.field || '').trim(), location: String(t.location || '').trim(), price: Number(t.price) > 0 ? Number(t.price) : 0,
      at: parse(t.publicDate || t.closeDate || t.firstSeenAt), url: String(t.detailUrl || '') });
  }
  return [...map.values()];
}

/**
 * Tìm các nhóm gói lặp lại qua các năm và ước lượng kỳ tiếp theo.
 * @returns {Array<{id,investorName,name,field,location,years:number[],occurrences:Array,typicalMonth:number,expectedAt:string,
 *   windowFrom:string,windowTo:string,status:'sap-toi'|'da-toi-ky'|'con-xa'|'ngung',daysUntil:number,annualHint:boolean,lastPrice:number,strength:number}>}
 */
export function findRecurring(packages = [], { now = Date.now(), similarity = 0.8, minYears = 2 } = {}) {
  const byInvestor = new Map();
  for (const p of packages) {
    const key = foldName(p.investorCode || p.investorName).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key) continue;                                   // không rõ chủ đầu tư thì không dám ghép
    const tokens = new Set(nameTokens(p.name));
    if (tokens.size < 2) continue;                        // tên quá ngắn sau khi bỏ năm: ghép sẽ nhầm
    if (!byInvestor.has(key)) byInvestor.set(key, []);
    byInvestor.get(key).push({ ...p, tokens });
  }
  const out = [];
  for (const list of byInvestor.values()) {
    if (list.length < minYears) continue;
    list.sort((a, b) => a.at - b.at);
    const clusters = [];
    for (const p of list) {
      let best = null, bestScore = 0;
      for (const c of clusters) { const s = jaccard(p.tokens, c.tokens); if (s > bestScore) { best = c; bestScore = s; } }
      if (best && bestScore >= similarity) best.items.push(p);
      else clusters.push({ tokens: p.tokens, items: [p] });
    }
    for (const c of clusters) {
      const years = [...new Set(c.items.map((p) => vnYear(p.at)))].sort((a, b) => a - b);
      if (years.length < minYears) continue;
      // Mỗi năm lấy lần xuất hiện ĐẦU TIÊN làm mốc "kỳ đăng" của năm đó.
      const firstOfYear = years.map((y) => c.items.find((p) => vnYear(p.at) === y));
      const typicalDay = median(firstOfYear.map((p) => dayOfYear(p.at)));
      const lastYear = years[years.length - 1];
      const last = c.items[c.items.length - 1];
      const expected = Date.UTC(lastYear + 1, 0, 1) + typicalDay * DAY - VN + 12 * 3600_000;
      const daysUntil = Math.round((expected - now) / DAY);
      // Khoảng dao động giữa các năm (tối thiểu ±30 ngày) để ghi "khoảng từ … đến …".
      const spread = Math.max(30, ...firstOfYear.map((p) => Math.abs(dayOfYear(p.at) - typicalDay)));
      const status = daysUntil > 120 ? 'con-xa' : daysUntil >= 0 ? 'sap-toi' : daysUntil >= -150 ? 'da-toi-ky' : 'ngung';
      const consecutive = years.every((y, i) => i === 0 || y - years[i - 1] === 1);
      out.push({
        id: `${last.code}`, investorName: last.investorName, name: last.name, field: last.field, location: last.location,
        years, occurrences: c.items.slice(-8).map((p) => ({ code: p.code, name: p.name, at: iso(p.at), year: vnYear(p.at), price: p.price, url: p.url })),
        typicalMonth: new Date(Date.UTC(2001, 0, 1) + typicalDay * DAY).getUTCMonth() + 1,
        expectedAt: iso(expected), windowFrom: iso(expected - spread * DAY), windowTo: iso(expected + spread * DAY),
        status, daysUntil, annualHint: ANNUAL_HINT.test(foldName(last.name)), lastPrice: [...c.items].reverse().find((p) => p.price)?.price || 0,
        strength: years.length + (consecutive ? 1 : 0) + (ANNUAL_HINT.test(foldName(last.name)) ? 1 : 0)
      });
    }
  }
  const order = { 'da-toi-ky': 0, 'sap-toi': 1, 'con-xa': 2, ngung: 3 };
  return out.sort((a, b) => order[a.status] - order[b.status] || Math.abs(a.daysUntil) - Math.abs(b.daysUntil) || b.strength - a.strength);
}

/** Lọc theo ô người dùng nhập (không dấu, chứa là khớp). */
export function filterRecurring(rows = [], { province = '', keyword = '', field = '', investor = '', upcomingOnly = false } = {}) {
  const has = (hay, needle) => !needle || foldName(hay).includes(foldName(needle).trim());
  return rows.filter((r) => has(r.location, province) && has(`${r.name} ${r.occurrences.map((o) => o.name).join(' ')}`, keyword) && has(r.investorName, investor)
    && (!field || foldName(r.field) === foldName(field) || foldName(r.field).includes(foldName(field)))
    && (!upcomingOnly || r.status === 'sap-toi' || r.status === 'da-toi-ky'));
}

export const RECURRING_STATUS_LABEL = Object.freeze({
  'sap-toi': 'Sắp tới kỳ', 'da-toi-ky': 'Đã tới kỳ — chưa thấy trong kho', 'con-xa': 'Còn xa', ngung: 'Có thể đã ngừng'
});

export const RECURRING_NOTE = 'Kỳ dự kiến suy từ các năm trước trong dữ liệu đã tải về máy, không phải kế hoạch của chủ đầu tư. '
  + '“Đã tới kỳ — chưa thấy trong kho” có thể vì gói chưa đăng, hoặc vì năm nay chưa quét tới. Nguồn chính thức về gói sắp mời thầu là Kế hoạch lựa chọn nhà thầu.';
