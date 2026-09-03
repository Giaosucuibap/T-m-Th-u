/* ============================================================================
 *  lib/attachments.js — TỆP ĐÍNH KÈM CỦA GÓI THẦU
 *
 *  Gom danh sách tệp mà e-GP công bố kèm mỗi gói: hồ sơ mời thầu (E-HSMT),
 *  quyết định phê duyệt kết quả, và báo cáo đánh giá tổng hợp E-HSDT — tức
 *  báo cáo chấm thầu.
 *
 *  ---------------------------------------------------------------------------
 *  TỆP TẢI TỪ ĐÂU — ĐÃ KIỂM CHỨNG
 *
 *  e-GP KHÔNG phát tệp qua máy chủ web. Bấm vào tên tệp trên trang chi tiết thì
 *  trang gọi PHẦN MỀM HỖ TRỢ e-GP cài trên máy người dùng:
 *
 *      GET http://localhost:1234/api/download/file/browser/public?fileId=<uuid>
 *
 *  Đã thử 6 đường dẫn tương ứng trên chính máy chủ muasamcong.mpi.gov.vn với
 *  đúng mã tệp — CẢ 6 ĐỀU TRẢ 404. Đường `edocproxy/file/share/<hash>` thì chạy
 *  nhưng chỉ phục vụ tài liệu hướng dẫn tĩnh, không dùng cho hồ sơ gói thầu.
 *
 *  Nên nút "Tải về" của tiện ích gọi đúng endpoint cục bộ đó — chính là làm hộ
 *  người dùng cú bấm mà họ vẫn tự làm trên e-GP, bằng phần mềm của chính họ,
 *  trên máy của chính họ. KHÔNG giả mạo phiên đăng nhập, KHÔNG giả chữ ký số,
 *  KHÔNG gọi API máy chủ của e-GP để lấy tệp.
 *
 *  ---------------------------------------------------------------------------
 *  CÁCH BÓC TÁCH DANH SÁCH TỆP
 *
 *  Đã đọc được phản hồi thật của endpoint `expose/contractor-input-result/get`
 *  nên không còn phải đoán. Chi tiết quy ước đặt tên và hai cái bẫy trong đó
 *  nằm ngay trên hàm `extractAttachments` bên dưới.
 * ========================================================================== */

import { cleanText } from './core.js';

/** Endpoint của phần mềm hỗ trợ e-GP cài trên máy người dùng. */
export const AGENT_ORIGIN = 'http://localhost:1234';
export const AGENT_DOWNLOAD_PATH = '/api/download/file/browser/public';

export const agentDownloadUrl = (fileId) =>
  `${AGENT_ORIGIN}${AGENT_DOWNLOAD_PATH}?fileId=${encodeURIComponent(fileId)}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_RE = /\.(pdf|docx?|xlsx?|zip|rar|7z|png|jpe?g)$/i;

export const looksLikeFileId = (v) => typeof v === 'string' && UUID_RE.test(v.trim());
export const looksLikeFileName = (v) =>
  typeof v === 'string' && v.trim().length > 4 && v.trim().length < 300 && FILE_RE.test(v.trim());

/**
 * Phân loại tệp theo tên và theo nhãn đi kèm.
 *
 * Từ khoá lấy từ nhãn thật trên trang e-GP đã xem:
 *   "Quyết định phê duyệt"            -> IB..._QuyetDinhPheDuyetKQLCNT_....pdf
 *   "Báo cáo đánh giá tổng hợp E-HSDT" -> BCDG ... .pdf
 */
export function classifyAttachment(name, label = '') {
  const hay = `${cleanText(label)} ${cleanText(name)}`.toLowerCase();
  const has = (...kws) => kws.some((k) => hay.includes(k));

  if (has('bcdg', 'báo cáo đánh giá', 'bao cao danh gia', 'danhgia', 'e-hsdt', 'ehsdt')) {
    return { kind: 'BCDG', label: 'Báo cáo đánh giá (chấm thầu)' };
  }
  if (has('quyetdinh', 'quyết định', 'quyet dinh', 'qđ-', 'qd-')) {
    return { kind: 'QD', label: 'Quyết định phê duyệt' };
  }
  if (has('hsmt', 'hồ sơ mời thầu', 'ho so moi thau', 'e-hsmt', 'ehsmt')) {
    return { kind: 'HSMT', label: 'Hồ sơ mời thầu' };
  }
  if (has('bienban', 'biên bản', 'bien ban', 'bbmt')) {
    return { kind: 'BBMT', label: 'Biên bản mở thầu' };
  }
  if (has('bảng giá', 'bang gia', 'dutoan', 'dự toán', 'tienluong', 'tiên lượng')) {
    return { kind: 'PHULUC', label: 'Phụ lục / bảng khối lượng' };
  }
  return { kind: 'KHAC', label: 'Tệp khác' };
}

/* --------------------------------------------------------------------------
 *  BÓC TÁCH — GHÉP THEO TIỀN TỐ TÊN TRƯỜNG
 *
 *  Đã đọc được phản hồi thật của e-GP (endpoint contractor-input-result/get)
 *  và thấy quy ước đặt tên rất nhất quán: mã tệp và tên tệp là hai trường ANH
 *  EM cùng tiền tố.
 *
 *      "decisionFileId":   "ebf995db-6c3e-4722-94ed-82713e687288"
 *      "decisionFileName": "IB2600354764_QuyetDinhPheDuyetKQLCNT_31_07_2026.pdf"
 *      "goodFileId" / "goodFileName", "cancelFileAttachId" / "cancelFileAttachName"
 *      "fileId" / "fileName"
 *
 *  Bản đầu tiên của hàm này lấy "UUID đầu tiên + tên tệp đầu tiên" trong cùng
 *  đối tượng. SAI: đối tượng gốc mở đầu bằng `"id":"fa56e77a-..."` (mã bản ghi
 *  kết quả), nên nó ghép nhầm mã bản ghi với tên tệp và lượt tải luôn thất bại.
 *  Ghép theo tiền tố thì không thể nhầm.
 *
 *  MỘT CHỖ NỮA DỄ BỎ SÓT: báo cáo đánh giá (báo cáo chấm thầu) nằm ở
 *
 *      "evalReportFileInfo": "[{\"fileId\":\"01b02edb-...\",\"fileName\":\"BCDG ....pdf\"}]"
 *
 *  tức một CHUỖI JSON lồng trong JSON. Phải thử phân tích mọi chuỗi trông như
 *  JSON, nếu không sẽ mất đúng cái tệp người dùng cần nhất.
 * ------------------------------------------------------------------------ */

/** Cắt phần đuôi Id/FileId… để lấy tiền tố dùng ghép cặp. */
function idPrefix(key) {
  const m = String(key).match(/^(.*?)(FileAttachId|FileId|AttachId|Id)$/i);
  return m ? (m[1] || 'file').toLowerCase() : null;
}
function namePrefix(key) {
  const m = String(key).match(/^(.*?)(FileAttachName|FileName|AttachName|Name)$/i);
  return m ? (m[1] || 'file').toLowerCase() : null;
}

/** Chuỗi này có phải JSON lồng bên trong không? */
function parseNested(value) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (t.length < 2 || !/^[[{]/.test(t)) return null;
  try { return JSON.parse(t); } catch { return null; }
}

/**
 * Duyệt cây JSON, gom mọi cặp (mã tệp, tên tệp).
 *
 * `maxNodes` chặn phản hồi khổng lồ làm treo trang.
 */
export function extractAttachments(payload, { maxNodes = 20000 } = {}) {
  const out = [];
  const seen = new Set();
  let nodes = 0;

  const push = (fileId, fileName, label) => {
    const id = cleanText(fileId);
    const name = cleanText(fileName);
    if (!looksLikeFileId(id) || !looksLikeFileName(name) || seen.has(id)) return;
    seen.add(id);
    out.push({ fileId: id, fileName: name, ...classifyAttachment(name, label), sourceLabel: cleanText(label) });
  };

  const visit = (value, parentLabel) => {
    if (nodes++ > maxNodes || value === null || value === undefined) return;

    if (Array.isArray(value)) {
      for (const v of value) visit(v, parentLabel);
      return;
    }

    if (typeof value === 'string') {
      // Chuỗi JSON lồng — chỗ e-GP giấu báo cáo đánh giá.
      const inner = parseNested(value);
      if (inner) visit(inner, parentLabel);
      return;
    }

    if (typeof value !== 'object') return;

    // Ghép theo tiền tố tên trường.
    const ids = new Map();
    const names = new Map();
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string') {
        const ip = idPrefix(k);
        if (ip && looksLikeFileId(v)) ids.set(ip, v);
        const np = namePrefix(k);
        if (np && looksLikeFileName(v)) names.set(np, v);
      }
    }
    for (const [prefix, name] of names) {
      const id = ids.get(prefix);
      if (id) push(id, name, cleanText(value.type) || prefix);
    }

    // Dự phòng: đối tượng chỉ có ĐÚNG một UUID và ĐÚNG một tên tệp thì ghép
    // chúng với nhau. Chặt hơn bản cũ ở chỗ đòi "đúng một", nên không thể ghép
    // nhầm mã bản ghi với tên tệp như trước.
    if (!names.size) {
      const allIds = [];
      const allNames = [];
      for (const v of Object.values(value)) {
        if (typeof v !== 'string') continue;
        if (looksLikeFileId(v)) allIds.push(v);
        else if (looksLikeFileName(v)) allNames.push(v);
      }
      if (allIds.length === 1 && allNames.length === 1) {
        push(allIds[0], allNames[0], cleanText(value.type) || parentLabel);
      }
    }

    for (const v of Object.values(value)) visit(v, parentLabel);
  };

  visit(payload, '');
  return out;
}

/** Gộp danh sách tệp của cùng một gói, chống trùng theo mã tệp. */
export function mergeAttachments(existing, incoming) {
  const map = new Map((existing || []).map((f) => [f.fileId, f]));
  for (const f of incoming || []) {
    if (!f || !f.fileId) continue;
    map.set(f.fileId, { ...(map.get(f.fileId) || {}), ...f });
  }
  // Xếp theo mức hữu ích: báo cáo chấm thầu và HSMT lên trước.
  const rank = { BCDG: 0, HSMT: 1, QD: 2, BBMT: 3, PHULUC: 4, KHAC: 5 };
  return [...map.values()].sort(
    (a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) || a.fileName.localeCompare(b.fileName, 'vi'));
}

/** Tên tệp an toàn khi lưu xuống đĩa. */
export function safeDownloadName(notifyNo, file) {
  const base = cleanText(file && file.fileName) || 'tep-dinh-kem';
  const prefix = cleanText(notifyNo);
  const clean = base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return prefix && !clean.includes(prefix) ? `${prefix}_${clean}` : clean;
}

export const AGENT_MISSING_MESSAGE =
  'Không liên lạc được với phần mềm hỗ trợ e-GP trên máy (localhost:1234). '
  + 'e-GP không phát tệp qua máy chủ web — mọi tệp hồ sơ đều tải qua phần mềm này, '
  + 'kể cả khi bạn bấm trực tiếp trên trang e-GP. Hãy mở phần mềm hỗ trợ rồi thử lại, '
  + 'hoặc bấm "Mở trang tải" để tải thủ công trên e-GP.';
