/* ============================================================================
 *  SAO LƯU TỰ ĐỘNG LÊN TELEGRAM (4.22.0)
 *
 *  Vì sao có: trên iPad, toàn bộ dữ liệu nằm trong kho của Safari cho trang muasamcong.
 *  Xoá dữ liệu duyệt web, đổi máy hay hỏng máy là mất kho gói, bộ săn, checklist. Người
 *  dùng đã có sẵn một kênh riêng tới chính mình — bot Telegram — nên mỗi ngày phần mềm
 *  gửi vào đó MỘT tệp sao lưu; khôi phục bằng nút "Nhập backup" đã có ở Cấu hình.
 *
 *  Tệp là bản sao AN TOÀN (lib/backup.js): không có Bot Token, Chat ID, cookie, hàng đợi.
 *  Mô-đun này chỉ gồm phần tính toán thuần (không mạng, không kho) để kiểm thử được:
 *    - backupDecision: hôm nay có gửi không, vì sao;
 *    - packBackup:     đóng tệp (JSON thường; nén gzip khi lớn);
 *    - readBackupBytes: đọc lại tệp .json hoặc .json.gz khi khôi phục.
 * ========================================================================== */

export const BACKUP_GAP_MS = 20 * 3600_000;        // mỗi ngày tối đa một tệp
export const BACKUP_RETRY_MS = 60 * 60_000;        // gửi hỏng hoặc dữ liệu chưa đổi: 60 phút sau mới xét lại
export const BACKUP_FORCE_AFTER_MS = 7 * 86_400_000; // dữ liệu không đổi vẫn gửi lại sau 7 ngày, để biết còn chạy
export const GZIP_FROM_BYTES = 8_000_000;          // dưới ngưỡng này gửi JSON thường (bản 4.21.0 cũng nhập được)
export const TELEGRAM_FILE_MAX = 49_000_000;       // bot Telegram gửi tệp tối đa 50 MB
export const BACKUP_STATE_KEY = 'telegramBackup';

const time = (value) => { const n = Date.parse(String(value || '')); return Number.isFinite(n) ? n : 0; };

/**
 * Có gửi bản sao lưu lúc này không.
 * `last` = {okAt, attemptAt, fingerprint}; `fingerprint` = dấu vân của dữ liệu hiện tại
 * (để trống nếu chưa tính — khi đó không xét điều kiện "không đổi").
 */
export function backupDecision({ enabled = false, configured = false, readOnly = false, last = {}, now = Date.now(), fingerprint = '', force = false } = {}) {
  if (force) return configured ? { send: true, reason: 'manual' } : { send: false, reason: 'no-telegram' };
  if (!enabled) return { send: false, reason: 'off' };
  if (readOnly) return { send: false, reason: 'read-only' };
  if (!configured) return { send: false, reason: 'no-telegram' };
  const okAt = time(last.okAt), attemptAt = time(last.attemptAt);
  if (okAt && now - okAt < BACKUP_GAP_MS) return { send: false, reason: 'recent' };
  if (attemptAt && now - attemptAt < BACKUP_RETRY_MS) return { send: false, reason: 'retry-wait' };
  if (okAt && fingerprint && fingerprint === last.fingerprint && now - okAt < BACKUP_FORCE_AFTER_MS) return { send: false, reason: 'unchanged' };
  return { send: true, reason: okAt ? 'due' : 'first' };
}

/** Lý do không gửi, viết cho người dùng đọc. */
export function backupReasonText(reason) {
  return ({
    off: 'Chưa bật sao lưu tự động.',
    'read-only': 'Đang khoá chỉnh sửa và tự động hoá nên không gửi.',
    'no-telegram': 'Chưa có Bot Token và Chat ID ở mục Telegram.',
    recent: 'Hôm nay đã gửi bản sao lưu.',
    'retry-wait': 'Vừa thử cách đây chưa lâu; sẽ thử lại sau.',
    unchanged: 'Dữ liệu chưa đổi từ bản sao lưu gần nhất nên không gửi lại.',
    'too-big': 'Tệp sao lưu vượt 49 MB, Telegram không nhận. Hãy dọn bớt kho gói rồi thử lại.'
  })[reason] || '';
}

/**
 * Dấu vân của nội dung sao lưu: hai phép băm FNV-1a 32 bit với hạt khác nhau, ghép thành
 * 16 ký tự. Không dùng cho bảo mật — chỉ để biết dữ liệu có đổi so với lần gửi trước.
 * Bỏ các trường thay đổi theo thời điểm xuất (exportedAt) trước khi băm.
 */
export function backupFingerprint(payload = {}) {
  const { exportedAt, ...rest } = payload || {};
  const text = JSON.stringify(rest);
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ ((c << 8) | (c >>> 8)), 0x85ebca6b);
  }
  const hex = (n) => (n >>> 0).toString(16).padStart(8, '0');
  return hex(a) + hex(b);
}

/** Vài con số để ghi vào lời nhắn kèm tệp. */
export function backupCounts(payload = {}) {
  const len = (v) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0);
  return { tenders: len(payload.tenders), hunts: len(payload.hunts), checklists: len(payload.checklists), contracts: len(payload.pastContracts), rivals: len(payload.watchedRivals), hsmt: len(payload.hsmtReads) };
}

const two = (n) => String(n).padStart(2, '0');
/** Ngày giờ Việt Nam (UTC+7) dạng 2026-11-11_07-05, không phụ thuộc múi giờ của máy. */
export function vnStamp(now = Date.now()) {
  const d = new Date(now + 7 * 3600_000);
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}_${two(d.getUTCHours())}-${two(d.getUTCMinutes())}`;
}

export function backupCaption(payload = {}, now = Date.now()) {
  const c = backupCounts(payload);
  const d = new Date(now + 7 * 3600_000);
  const when = `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
  const parts = [`${c.tenders} gói`, `${c.hunts} bộ săn`, `${c.checklists} checklist`, `${c.contracts} hợp đồng tương tự`];
  if (c.rivals) parts.push(`${c.rivals} đối thủ theo dõi`);
  if (c.hsmt) parts.push(`${c.hsmt} bản đọc E-HSMT`);
  return `🗄 Sao lưu Giáo Sư Cùi Bắp ${payload.version || ''} · ${when} (giờ VN)\n${parts.join(' · ')}\n`
    + 'Khôi phục: lưu tệp này về máy → Cấu hình → Khôi phục và xoá dữ liệu → Nhập backup.\n'
    + 'Tệp không chứa Bot Token, Chat ID hay mật khẩu.';
}

async function streamBytes(stream) {
  const chunks = []; let size = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); size += value.byteLength;
  }
  const out = new Uint8Array(size); let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

/** Nén gzip; trả null nếu trình duyệt không có CompressionStream. */
export async function gzipBytes(bytes, scope = globalThis) {
  if (typeof scope.CompressionStream !== 'function' || typeof scope.Blob !== 'function') return null;
  try { return await streamBytes(new scope.Blob([bytes]).stream().pipeThrough(new scope.CompressionStream('gzip'))); } catch { return null; }
}

export async function gunzipBytes(bytes, scope = globalThis) {
  if (typeof scope.DecompressionStream !== 'function' || typeof scope.Blob !== 'function') throw new Error('Trình duyệt này không giải nén được tệp .gz. Hãy giải nén trên máy tính rồi nhập tệp .json.');
  return streamBytes(new scope.Blob([bytes]).stream().pipeThrough(new scope.DecompressionStream('gzip')));
}

export const isGzip = (bytes) => Boolean(bytes && bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b);

/**
 * Đóng tệp sao lưu. Trả {bytes, filename, mime, gz, jsonBytes} hoặc {error:'too-big'}.
 * Tệp nhỏ gửi JSON thường để bản cũ (4.21.0 trở về trước) vẫn nhập được nếu phải quay về.
 */
export async function packBackup(payload, { now = Date.now(), scope = globalThis, gzipFrom = GZIP_FROM_BYTES } = {}) {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const base = `GiaoSuCuiBap-sao-luu-${vnStamp(now)}`;
  if (json.byteLength >= gzipFrom) {
    const gz = await gzipBytes(json, scope);
    if (gz && gz.byteLength <= TELEGRAM_FILE_MAX) return { bytes: gz, filename: `${base}.json.gz`, mime: 'application/gzip', gz: true, jsonBytes: json.byteLength };
  }
  if (json.byteLength > TELEGRAM_FILE_MAX) return { error: 'too-big', jsonBytes: json.byteLength };
  return { bytes: json, filename: `${base}.json`, mime: 'application/json', gz: false, jsonBytes: json.byteLength };
}

/** Đọc tệp sao lưu người dùng chọn: nhận cả .json và .json.gz. Ném lỗi có lời giải thích. */
export async function readBackupBytes(bytes, scope = globalThis) {
  let raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (isGzip(raw)) raw = await gunzipBytes(raw, scope);
  let data;
  try { data = JSON.parse(new TextDecoder().decode(raw)); } catch { throw new Error('Tệp không phải bản sao lưu của Giáo Sư Cùi Bắp (không đọc được JSON).'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Tệp không phải bản sao lưu của Giáo Sư Cùi Bắp.');
  return data;
}

export const fileSizeText = (n) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
