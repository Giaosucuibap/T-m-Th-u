/* ============================================================================
 *  lib/redact.js — CHE BÍ MẬT TRƯỚC KHI XUẤT RA TỆP
 *
 *  Tệp chẩn đoán sinh ra ĐỂ GỬI ĐI — người dùng gặp lỗi thì tải nó rồi gửi cho
 *  người hỗ trợ. Trước đây nó chép nguyên `settings`, tức là mỗi lần gửi tệp
 *  chẩn đoán là gửi luôn cả Telegram Bot Token.
 *
 *  Bot Token không phải mật khẩu vặt: ai cầm nó cũng đọc được tin nhắn của bot
 *  và nhắn thay bot đó. Nên nó phải bị che, không phải "ẩn bớt cho gọn".
 *
 *  Nguyên tắc ở đây: DANH SÁCH TRẮNG cho phần được giữ nguyên thì an toàn hơn
 *  danh sách đen — nhưng cấu hình còn thêm trường mới dài dài, danh sách trắng
 *  sẽ âm thầm làm mất thông tin chẩn đoán. Nên dùng danh sách đen, kèm một
 *  lưới an toàn: bất kỳ tên trường nào NGHE NHƯ bí mật cũng bị che, kể cả
 *  trường mai này mới thêm mà quên khai báo.
 * ========================================================================== */

/**
 * Các trường chắc chắn là bí mật.
 *
 * `licenseKey` và `machineId` thuộc cơ chế bản quyền đã gỡ khỏi phần mềm.
 * Vẫn giữ trong danh sách vì bản sao lưu người dùng tạo từ các phiên bản
 * trước 3.7.0 CÓ chứa hai trường đó; nhập lại bản sao lưu cũ rồi xuất tệp
 * chẩn đoán thì chúng sẽ xuất hiện trở lại. Bỏ đi là mở lại đúng lỗ hổng
 * vừa vá.
 */
export const SECRET_FIELDS = [
  'telegramBotToken',
  'licenseKey',
  'machineId'
];

/**
 * Lưới an toàn: tên trường chứa các chữ này thì coi là bí mật, dù chưa khai báo.
 * Bắt được cả trường mới thêm sau này mà quên bổ sung vào SECRET_FIELDS.
 */
const SECRET_HINT = /(token|secret|password|passwd|apikey|api_key|authorization|cookie|privatekey|private_key|captcha|csrf|xsrf|jwt|session|signature|licensekey|machineid)/i;

/** Trường nhận diện cá nhân — không phải bí mật, nhưng che bớt cho kín. */
export const PARTIAL_FIELDS = ['telegramChatId'];

/** Tên trường này có thể chứa bí mật hoặc mã nhận diện riêng tư hay không. */
export function isSensitiveFieldName(name) {
  const key = String(name || '');
  return SECRET_FIELDS.includes(key) || PARTIAL_FIELDS.includes(key) || SECRET_HINT.test(key);
}

/** Che các cặp dạng token=..., Authorization: ... nếu chúng lọt vào chuỗi lỗi. */
function redactSecretText(value) {
  return String(value ?? '')
    .replace(/\b(token|secret|password|passwd|apikey|api_key|authorization|cookie|captcha|csrf|xsrf|jwt|session|signature)\b(\s*[:=]\s*)[^\s&;,]+/gi,
      (_all, key, sep) => `${key}${sep}[đã-loại]`);
}

/** Loại tham số bí mật khỏi URL nhưng giữ URL nghiệp vụ còn lại. */
function scrubUrlText(value) {
  const text = String(value ?? '');
  try {
    const url = new URL(text);
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveFieldName(key)) url.searchParams.delete(key);
    }
    url.hash = '';
    return url.href;
  } catch {
    return redactSecretText(text);
  }
}

/**
 * Sao chép sâu dữ liệu để xuất tệp, bỏ trường bí mật cả theo tên trực tiếp và
 * theo dạng semantic `{fieldName:'captcha', fieldValues:[...]}`.
 */
export function stripSecretsDeep(value, depth = 0, budget = { nodes: 0 }) {
  if (depth > 14 || budget.nodes++ > 250000) {
    throw new Error('Dữ liệu vượt giới hạn làm sạch an toàn.');
  }
  if (Array.isArray(value)) {
    return value.slice(0, 30000)
      .map((item) => stripSecretsDeep(item, depth + 1, budget))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
    const semanticName = value.fieldName ?? value.field ?? value.key ?? value.name;
    if (typeof semanticName === 'string' && isSensitiveFieldName(semanticName)) return undefined;
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 1000)) {
      if (isSensitiveFieldName(key)) continue;
      let clean;
      if (typeof item === 'string' && /url|href|link/i.test(key)) clean = scrubUrlText(item);
      else if (typeof item === 'string') clean = redactSecretText(item);
      else clean = stripSecretsDeep(item, depth + 1, budget);
      if (clean !== undefined) out[key] = clean;
    }
    return out;
  }
  return typeof value === 'string' ? redactSecretText(value) : value;
}

/** Che hoàn toàn, chỉ giữ lại dấu vết đủ để biết "có điền hay chưa". */
export function maskSecret(value) {
  const s = String(value ?? '');
  if (!s) return '';                       // rỗng thì cứ để rỗng: biết là CHƯA điền
  return `[đã che — ${s.length} ký tự]`;
}

/** Che một phần: giữ vài ký tự cuối để đối chiếu khi hỗ trợ. */
export function maskPartial(value) {
  const s = String(value ?? '');
  if (!s) return '';
  if (s.length <= 4) return '[đã che]';
  return `…${s.slice(-4)}`;
}

/**
 * Trả về BẢN SAO của cấu hình đã che bí mật. Không sửa đối tượng gốc —
 * hàm này hay bị gọi ngay trên state đang dùng, sửa tại chỗ là hỏng cấu hình.
 *
 * @param {object} settings
 * @returns {{settings:object, redacted:string[]}} danh sách trường đã che,
 *          để trang chẩn đoán nói thẳng cho người dùng biết đã che những gì.
 */
export function redactSettings(settings) {
  const out = { ...(settings || {}) };
  const redacted = [];
  for (const k of Object.keys(out)) {
    if (SECRET_FIELDS.includes(k) || SECRET_HINT.test(k)) {
      if (out[k]) redacted.push(k);
      out[k] = maskSecret(out[k]);
    } else if (PARTIAL_FIELDS.includes(k)) {
      if (out[k]) redacted.push(k);
      out[k] = maskPartial(out[k]);
    }
  }
  return { settings: out, redacted };
}

/**
 * Đếm bí mật đang có trong cấu hình, để cảnh báo TRƯỚC khi người dùng tạo
 * bản sao lưu. Bản sao lưu thì phải giữ nguyên bí mật (không thì khôi phục
 * xong lại mất cấu hình Telegram) — nên chỗ này cảnh báo chứ không che.
 */
export function countSecrets(settings) {
  const s = settings || {};
  return [...SECRET_FIELDS, ...PARTIAL_FIELDS].filter((k) => s[k]).length;
}
