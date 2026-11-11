/* ============================================================================
 *  ĐỌC E-HSMT BẰNG AI — CẦU NỐI KHÔNG CẦN KHOÁ API (4.22.0)
 *
 *  Phần mềm KHÔNG tự gọi dịch vụ AI nào. Người dùng đã có sẵn ChatGPT / Gemini / Claude:
 *    1. Phần mềm soạn một CÂU LỆNH chuẩn (buildHsmtPrompt) — người dùng chép, dán vào trợ lý
 *       AI của mình cùng các tệp E-HSMT đã tải từ e-GP.
 *    2. Trợ lý trả về một khối JSON theo mẫu cố định, mỗi yêu cầu kèm CÂU TRÍCH nguyên văn
 *       và vị trí trong hồ sơ.
 *    3. Người dùng dán câu trả lời vào phần mềm (parseHsmtAnswer): phần mềm kiểm tra, lưu,
 *       và lập bảng đối chiếu từng yêu cầu với năng lực công ty đã khai (matchRequirements).
 *
 *  Vì sao làm vậy: không phải đưa khoá API hay hồ sơ thầu cho phần mềm này gửi đi đâu; dùng
 *  được ngay với gói AI người dùng đang trả tiền; và mọi kết luận đều có câu trích để người
 *  phụ trách đối chiếu lại với hồ sơ gốc. AI CÓ THỂ ĐỌC SAI — bảng đối chiếu là công cụ rà
 *  soát, không thay việc đọc E-HSMT.
 *
 *  Hàm thuần: không mạng, không kho.
 * ========================================================================== */
import { similarWorkType } from './capability.js';

export const HSMT_SCHEMA = 1;
export const HSMT_MAX_READS = 200;
export const HSMT_GROUPS = Object.freeze([
  { id: 'tai_chinh', label: 'Tài chính' },
  { id: 'kinh_nghiem', label: 'Kinh nghiệm · hợp đồng tương tự' },
  { id: 'nhan_su', label: 'Nhân sự chủ chốt' },
  { id: 'thiet_bi', label: 'Thiết bị thi công' },
  { id: 'ky_thuat', label: 'Kỹ thuật' },
  { id: 'khac', label: 'Khác' }
]);
const GROUP_IDS = new Set(HSMT_GROUPS.map((g) => g.id));
export const HSMT_TERM_LABEL = Object.freeze({ tam_ung: 'Tạm ứng', bao_dam_thuc_hien: 'Bảo đảm thực hiện hợp đồng', bao_hanh: 'Bảo hành', phat: 'Phạt vi phạm',
  thanh_toan: 'Thanh toán', dieu_chinh_gia: 'Điều chỉnh giá', khac: 'Khác' });

const fold = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max);
const num = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : 0;
  // AI hay viết "1.500.000.000" hoặc "1,500,000,000" trong chuỗi: bỏ dấu ngăn cách hàng nghìn.
  const raw = String(value ?? '').trim();
  if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) return Number(raw.replace(/[.,]/g, ''));
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const list = (value, max) => (Array.isArray(value) ? value : []).slice(0, max);

/* ------------------------------------------------------------------ 1. CÂU LỆNH --- */

/** Câu lệnh để dán vào trợ lý AI, kèm các tệp E-HSMT. */
export function buildHsmtPrompt(tender = {}) {
  const facts = [
    tender.bidName ? `- Tên gói thầu: ${text(tender.bidName, 400)}` : '',
    tender.notifyNo || tender.displayCode ? `- Mã TBMT: ${text(tender.displayCode || tender.notifyNo, 40)}` : '',
    tender.investorName ? `- Chủ đầu tư: ${text(tender.investorName, 300)}` : '',
    Number(tender.price) > 0 ? `- Giá gói thầu trên e-GP: ${Math.round(Number(tender.price)).toLocaleString('vi-VN')} đồng` : ''
  ].filter(Boolean).join('\n');
  return `Bạn là chuyên gia đấu thầu xây lắp tại Việt Nam. Tôi gửi kèm các tệp E-HSMT (hồ sơ mời thầu qua mạng) của một gói thầu. Hãy ĐỌC CÁC TỆP ĐÍNH KÈM và trích xuất thông tin theo đúng mẫu JSON bên dưới.

Thông tin gói thầu tôi đang xem (để bạn đối chiếu đúng hồ sơ):
${facts || '- (chưa có)'}

QUY TẮC BẮT BUỘC
1. Chỉ dùng nội dung trong các tệp đính kèm. Không dùng kiến thức chung, không suy đoán.
2. Mỗi yêu cầu phải có "trich": chép NGUYÊN VĂN một câu hoặc đoạn ngắn (tối đa 300 ký tự) từ hồ sơ, và "muc": chương / mục / trang nơi có câu đó.
3. Không tìm thấy thì KHÔNG bịa: để giá trị 0 hoặc chuỗi rỗng và ghi điều chưa tìm thấy vào "chua_ro".
4. Số tiền ghi bằng ĐỒNG, là số nguyên, không có dấu chấm phẩy (ví dụ 1500000000). Thời gian ghi bằng số ngày.
5. "nhom" chỉ nhận một trong: tai_chinh, kinh_nghiem, nhan_su, thiet_bi, ky_thuat, khac.
6. Trả lời DUY NHẤT một khối \`\`\`json ... \`\`\`, không thêm lời giải thích trước hay sau.

MẪU JSON
\`\`\`json
{
  "phien_ban": ${HSMT_SCHEMA},
  "goi_thau": { "ten": "", "ma_tbmt": "", "chu_dau_tu": "" },
  "tom_tat": "3 đến 6 câu: phạm vi công việc chính, địa điểm, điểm đáng chú ý",
  "moc_thoi_gian": { "thoi_gian_thuc_hien_ngay": 0, "hieu_luc_hsdt_ngay": 0 },
  "bao_dam_du_thau": { "gia_tri_dong": 0, "hinh_thuc": "", "hieu_luc_ngay": 0, "trich": "", "muc": "" },
  "yeu_cau": [
    { "nhom": "tai_chinh", "noi_dung": "Doanh thu bình quân hằng năm (không bao gồm thuế VAT) của 3 năm gần nhất", "gia_tri_dong": 0, "so_luong": 0, "so_nam": 3, "trich": "", "muc": "" },
    { "nhom": "tai_chinh", "noi_dung": "Nguồn lực tài chính cho gói thầu", "gia_tri_dong": 0, "so_luong": 0, "so_nam": 0, "trich": "", "muc": "" },
    { "nhom": "kinh_nghiem", "noi_dung": "Hợp đồng tương tự đã hoàn thành", "gia_tri_dong": 0, "so_luong": 1, "so_nam": 5, "trich": "", "muc": "" },
    { "nhom": "nhan_su", "noi_dung": "Chỉ huy trưởng công trường: trình độ, chứng chỉ, số năm kinh nghiệm", "gia_tri_dong": 0, "so_luong": 1, "so_nam": 0, "trich": "", "muc": "" },
    { "nhom": "thiet_bi", "noi_dung": "Máy đào dung tích gầu ≥ 0,8 m3", "gia_tri_dong": 0, "so_luong": 2, "so_nam": 0, "trich": "", "muc": "" }
  ],
  "dieu_khoan_hop_dong": [
    { "loai": "tam_ung", "noi_dung": "", "trich": "", "muc": "" }
  ],
  "tieu_chi_danh_gia": [
    { "noi_dung": "", "trich": "", "muc": "" }
  ],
  "rui_ro": [ "điểm bất lợi hoặc dễ bị loại mà nhà thầu cần lưu ý, có trong hồ sơ" ],
  "chua_ro": [ "điều mẫu này hỏi mà hồ sơ không có hoặc bạn không đọc được" ]
}
\`\`\`

Ghi chú về mẫu: các dòng trong "yeu_cau" ở trên chỉ là VÍ DỤ về cách ghi — hãy thay bằng TOÀN BỘ yêu cầu thật trong hồ sơ (tư cách hợp lệ, năng lực tài chính, kinh nghiệm, từng vị trí nhân sự chủ chốt, từng loại thiết bị, yêu cầu kỹ thuật chính). "loai" của điều khoản hợp đồng nhận: tam_ung, bao_dam_thuc_hien, bao_hanh, phat, thanh_toan, dieu_chinh_gia, khac.`;
}

/* --------------------------------------------------------------- 2. ĐỌC CÂU TRẢ LỜI --- */

function extractJson(raw) {
  const source = String(raw ?? '');
  const fenced = [...source.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)].map((m) => m[1]).filter((body) => body.includes('{'));
  const candidates = [...fenced];
  const start = source.indexOf('{'), end = source.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(source.slice(start, end + 1));
  for (const candidate of candidates) {
    const variants = [candidate, candidate.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1')];
    for (const variant of variants) {
      try { const data = JSON.parse(variant); if (data && typeof data === 'object' && !Array.isArray(data)) return data; } catch { /* thử cách khác */ }
    }
  }
  return null;
}

function normalizeRequirement(row) {
  if (!row || typeof row !== 'object') return null;
  const content = text(row.noi_dung, 600);
  if (!content) return null;
  const group = GROUP_IDS.has(row.nhom) ? row.nhom : 'khac';
  return { group, text: content, value: Math.round(num(row.gia_tri_dong ?? row.gia_tri)), count: Math.min(999, Math.round(num(row.so_luong))), years: Math.min(50, Math.round(num(row.so_nam))),
    quote: text(row.trich, 400), ref: text(row.muc, 160) };
}

/** Chuẩn hoá dữ liệu đã đọc (từ AI hoặc từ kho/bản sao lưu). Trả null nếu không dùng được. */
export function normalizeHsmtRead(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const pkg = data.goi_thau && typeof data.goi_thau === 'object' ? data.goi_thau : {};
  const time = data.moc_thoi_gian && typeof data.moc_thoi_gian === 'object' ? data.moc_thoi_gian : {};
  const bond = data.bao_dam_du_thau && typeof data.bao_dam_du_thau === 'object' ? data.bao_dam_du_thau : {};
  const requirements = list(data.yeu_cau, 80).map(normalizeRequirement).filter(Boolean);
  const terms = list(data.dieu_khoan_hop_dong, 30).map((row) => (row && typeof row === 'object' && text(row.noi_dung, 600)
    ? { kind: Object.hasOwn(HSMT_TERM_LABEL, row.loai) ? row.loai : 'khac', text: text(row.noi_dung, 600), quote: text(row.trich, 400), ref: text(row.muc, 160) } : null)).filter(Boolean);
  const criteria = list(data.tieu_chi_danh_gia, 30).map((row) => (row && typeof row === 'object' && text(row.noi_dung, 600)
    ? { text: text(row.noi_dung, 600), quote: text(row.trich, 400), ref: text(row.muc, 160) } : null)).filter(Boolean);
  const read = {
    schema: HSMT_SCHEMA,
    package: { name: text(pkg.ten, 400), code: text(pkg.ma_tbmt, 40), investor: text(pkg.chu_dau_tu, 300) },
    summary: text(data.tom_tat, 1500),
    durationDays: Math.min(5000, Math.round(num(time.thoi_gian_thuc_hien_ngay))), validityDays: Math.min(1000, Math.round(num(time.hieu_luc_hsdt_ngay))),
    bond: { value: Math.round(num(bond.gia_tri_dong)), form: text(bond.hinh_thuc, 300), validityDays: Math.min(1000, Math.round(num(bond.hieu_luc_ngay))), quote: text(bond.trich, 400), ref: text(bond.muc, 160) },
    requirements, terms, criteria,
    risks: list(data.rui_ro, 20).map((x) => text(x, 400)).filter(Boolean),
    unclear: list(data.chua_ro, 20).map((x) => text(x, 400)).filter(Boolean)
  };
  if (!read.summary && !requirements.length && !terms.length && !read.bond.value) return null;
  return read;
}

/**
 * Đọc câu trả lời người dùng dán vào.
 * @returns {{ok:true, read:object, warnings:string[]} | {ok:false, message:string}}
 */
export function parseHsmtAnswer(raw, tender = {}) {
  const source = String(raw ?? '');
  if (source.trim().length < 20) return { ok: false, message: 'Chưa có nội dung. Dán toàn bộ câu trả lời của trợ lý AI vào ô này.' };
  if (source.length > 400_000) return { ok: false, message: 'Nội dung dán vào quá dài (trên 400.000 ký tự). Chỉ dán câu trả lời của AI, không dán cả hồ sơ.' };
  const data = extractJson(source);
  if (!data) return { ok: false, message: 'Không tìm thấy khối JSON hợp lệ trong câu trả lời. Hãy yêu cầu AI “trả lời lại đúng một khối json theo mẫu”, rồi dán lại.' };
  const read = normalizeHsmtRead(data);
  if (!read) return { ok: false, message: 'Khối JSON không có nội dung theo mẫu (thiếu tóm tắt và danh sách yêu cầu). Hãy chép lại câu lệnh và hỏi AI lần nữa.' };
  const warnings = [];
  const wantCode = String(tender.notifyNo || '').match(/IB\d+/i)?.[0]?.toUpperCase();
  const gotCode = read.package.code.match(/IB\d+/i)?.[0]?.toUpperCase();
  if (wantCode && gotCode && wantCode !== gotCode) warnings.push(`Mã TBMT trong câu trả lời (${gotCode}) khác gói đang xem (${wantCode}). Kiểm tra lại xem đã gửi đúng hồ sơ cho AI chưa.`);
  const noQuote = read.requirements.filter((r) => !r.quote).length;
  if (noQuote) warnings.push(`${noQuote} yêu cầu không có câu trích — không đối chiếu được với hồ sơ gốc, cần tự kiểm tra.`);
  if (!read.requirements.length) warnings.push('AI không trả về yêu cầu năng lực nào. Có thể tệp gửi kèm thiếu chương Tiêu chuẩn đánh giá.');
  if (read.unclear.length) warnings.push(`AI báo ${read.unclear.length} điểm không tìm thấy trong hồ sơ (xem mục “Chưa rõ”).`);
  return { ok: true, read, warnings };
}

/* ---------------------------------------------------- 3. ĐỐI CHIẾU VỚI NĂNG LỰC CÔNG TY --- */

export const MATCH_STATUS = Object.freeze({
  dat: { label: 'Đủ theo số đã khai', tone: 'good' },
  thieu: { label: 'Thiếu so với yêu cầu', tone: 'bad' },
  'tu-doi-chieu': { label: 'Có dữ liệu — tự đối chiếu chi tiết', tone: 'info' },
  'chua-co': { label: 'Chưa có dữ liệu để so', tone: 'warn' }
});

const money = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')} đ`;
const STOP = new Set(['co', 'cua', 'cac', 'va', 'la', 'cho', 'trong', 'toi', 'thieu', 'it', 'nhat', 'tro', 'len', 'so', 'luong', 'nam', 'kinh', 'nghiem', 'chung', 'chi', 'trinh', 'do', 'dai', 'hoc',
  'nganh', 'chuyen', 'yeu', 'cau', 'phai', 'duoc', 'hoac', 'tuong', 'duong', 'thi', 'cong', 'trinh', 'xay', 'dung', 'may', 'chiec', 'cai', 'bo', 'nguoi', 'dung', 'tich', 'suat', 'tai', 'trong']);
const keyTokens = (value) => fold(value).split(' ').filter((t) => t.length >= 2 && !STOP.has(t) && !/^\d+$/.test(t));

/** Dòng năng lực đã khai giống yêu cầu nhất (theo số từ khoá chung); null nếu không có dòng nào chung từ khoá. */
function closestLine(requirement, lines) {
  const want = new Set(keyTokens(requirement));
  if (!want.size) return null;
  let best = null, bestScore = 0;
  for (const line of Array.isArray(lines) ? lines : []) {
    const have = new Set(keyTokens(line));
    let score = 0;
    for (const t of want) if (have.has(t)) score++;
    // Cụm hai từ liền nhau trùng (vd. "may dao", "chi huy") đáng tin hơn từ đơn lẻ.
    const a = fold(requirement), b = fold(line);
    const words = a.split(' ');
    for (let i = 0; i + 1 < words.length; i++) if (words[i].length >= 2 && (` ${b} `).includes(` ${words[i]} ${words[i + 1]} `) && !STOP.has(words[i + 1])) score += 2;
    if (score > bestScore) { best = line; bestScore = score; }
  }
  return bestScore >= 2 ? best : null;
}

/**
 * Lập bảng đối chiếu.
 * @returns {{rows: Array, summary: {dat:number, thieu:number, tu:number, chua:number, total:number}}}
 */
export function matchRequirements(read, { capability = {}, contracts = [], tender = {}, now = Date.now() } = {}) {
  const cap = capability && typeof capability === 'object' ? capability : {};
  const tenderType = similarWorkType(tender.bidName || read?.package?.name || '');
  const year = new Date(now + 7 * 3600_000).getUTCFullYear();
  const rows = (read?.requirements || []).map((req) => {
    const low = fold(req.text);
    let status = 'tu-doi-chieu', company = '', note = '';
    if (req.group === 'tai_chinh') {
      const isRevenue = /doanh thu/.test(low);
      const isLiquid = /nguon luc tai chinh|tai san co tinh thanh khoan|kha nang thanh khoan|tin dung|von luu dong/.test(low);
      const have = isRevenue ? Number(cap.avgRevenue) : isLiquid ? Number(cap.liquidAssets) : 0;
      const label = isRevenue ? 'Doanh thu bình quân đã khai' : 'Nguồn lực tài chính đã khai';
      if (!isRevenue && !isLiquid) { company = 'Phần mềm không giữ số liệu này (ví dụ giá trị tài sản ròng, nghĩa vụ thuế).'; note = 'Đối chiếu với báo cáo tài chính.'; }
      else if (!(have > 0)) { status = 'chua-co'; company = `Chưa khai ở màn hình Năng lực công ty (${isRevenue ? 'doanh thu bình quân' : 'nguồn lực tài chính'}).`; }
      else if (!(req.value > 0)) { company = `${label}: ${money(have)}`; note = 'AI không đọc được con số yêu cầu — xem câu trích.'; }
      else if (have >= req.value) { status = 'dat'; company = `${label}: ${money(have)}`; note = `Yêu cầu ${money(req.value)}; dư ${money(have - req.value)}.`; }
      else { status = 'thieu'; company = `${label}: ${money(have)}`; note = `Yêu cầu ${money(req.value)}; thiếu ${money(req.value - have)}. Có thể cần liên danh.`; }
    } else if (req.group === 'kinh_nghiem') {
      const need = Math.max(1, req.count || 1);
      const pool = (Array.isArray(contracts) ? contracts : []).filter((c) => c && typeof c === 'object');
      if (!pool.length) { status = 'chua-co'; company = 'Chưa có hợp đồng nào ở màn hình Hợp đồng tương tự.'; }
      else {
        const fit = pool.filter((c) => (!req.value || Number(c.price) >= req.value) && (!req.years || !c.year || year - Number(c.year) <= req.years)
          && (!tenderType || !c.workType || c.workType === tenderType));
        const names = fit.slice(0, 3).map((c) => `${c.name}${c.year ? ` (${c.year})` : ''}${c.price ? ` — ${money(c.price)}` : ''}`).join('; ');
        if (fit.length >= need) { status = 'dat'; company = `${fit.length} hợp đồng đã khai khớp loại việc${req.value ? ', giá trị' : ''}${req.years ? ' và thời gian' : ''}: ${names}`; note = `Yêu cầu ${need} hợp đồng${req.value ? ` từ ${money(req.value)}` : ''}${req.years ? ` trong ${req.years} năm` : ''}. Vẫn phải đối chiếu tính chất “tương tự” theo E-HSMT.`; }
        else { status = 'thieu'; company = fit.length ? `Mới có ${fit.length}/${need} hợp đồng khớp: ${names}` : `Không có hợp đồng đã khai nào khớp (trong ${pool.length} hợp đồng).`; note = `Yêu cầu ${need} hợp đồng${req.value ? ` từ ${money(req.value)}` : ''}${req.years ? ` trong ${req.years} năm` : ''}.`; }
      }
    } else if (req.group === 'nhan_su' || req.group === 'thiet_bi') {
      const lines = req.group === 'nhan_su' ? cap.staff : cap.equipment;
      const where = req.group === 'nhan_su' ? 'Nhân sự chủ chốt' : 'Thiết bị chủ lực';
      const line = closestLine(req.text, lines);
      if (line) { company = `Đã khai: “${line}”`; note = `Tự đối chiếu số lượng${req.count ? ` (yêu cầu ${req.count})` : ''}, thông số và chứng chỉ với câu trích.`; }
      else { status = 'chua-co'; company = `Không thấy mục tương ứng trong ô ${where} (Năng lực công ty).`; note = req.count ? `Yêu cầu số lượng ${req.count}.` : ''; }
    } else {
      company = 'Phần mềm không có dữ liệu để so mục này.'; note = 'Đọc câu trích và tự đánh giá.';
    }
    return { ...req, status, company, note };
  });
  const count = (s) => rows.filter((r) => r.status === s).length;
  return { rows, summary: { dat: count('dat'), thieu: count('thieu'), tu: count('tu-doi-chieu'), chua: count('chua-co'), total: rows.length } };
}

/** Giữ kho bản đọc gọn và an toàn (dùng khi nạp từ kho hoặc bản sao lưu). */
export function safeHsmtReads(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const entries = Object.entries(raw).filter(([key]) => /^[a-zA-Z0-9:_-]{1,220}$/.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key))
    .map(([key, value]) => {
      const read = normalizeHsmtRead(value && typeof value === 'object' ? denormalize(value.read) : null);
      if (!read) return null;
      const savedAt = Number.isFinite(Date.parse(value.savedAt)) ? new Date(value.savedAt).toISOString() : '';
      return [key, { savedAt, source: text(value.source, 60), read }];
    }).filter(Boolean)
    .sort((a, b) => (Date.parse(b[1].savedAt) || 0) - (Date.parse(a[1].savedAt) || 0)).slice(0, HSMT_MAX_READS);
  return Object.fromEntries(entries);
}

/** Đổi bản đọc đã chuẩn hoá về dạng mẫu JSON (để chuẩn hoá lại khi nạp từ kho — một đường kiểm tra duy nhất). */
export function denormalize(read) {
  if (!read || typeof read !== 'object') return null;
  return {
    goi_thau: { ten: read.package?.name, ma_tbmt: read.package?.code, chu_dau_tu: read.package?.investor },
    tom_tat: read.summary,
    moc_thoi_gian: { thoi_gian_thuc_hien_ngay: read.durationDays, hieu_luc_hsdt_ngay: read.validityDays },
    bao_dam_du_thau: { gia_tri_dong: read.bond?.value, hinh_thuc: read.bond?.form, hieu_luc_ngay: read.bond?.validityDays, trich: read.bond?.quote, muc: read.bond?.ref },
    yeu_cau: (read.requirements || []).map((r) => ({ nhom: r.group, noi_dung: r.text, gia_tri_dong: r.value, so_luong: r.count, so_nam: r.years, trich: r.quote, muc: r.ref })),
    dieu_khoan_hop_dong: (read.terms || []).map((t) => ({ loai: t.kind, noi_dung: t.text, trich: t.quote, muc: t.ref })),
    tieu_chi_danh_gia: (read.criteria || []).map((c) => ({ noi_dung: c.text, trich: c.quote, muc: c.ref })),
    rui_ro: read.risks, chua_ro: read.unclear
  };
}

export const HSMT_AI_NOTE = 'Bảng này do trợ lý AI của bạn đọc từ E-HSMT rồi phần mềm so với số liệu bạn đã khai. AI có thể đọc sai hoặc sót; mỗi dòng có câu trích và vị trí để đối chiếu với hồ sơ gốc. '
  + 'Không dùng bảng này thay cho việc rà soát E-HSMT trước khi nộp thầu.';
