/* ============================================================================
 *  4.21.0 — ĐỊA CHỈ CỐ ĐỊNH CHO LINK ĐIỆN THOẠI: phần THUẦN của tiện ích.
 *
 *  Máy tính GHÉP NỐI một lần với Worker Cloudflare của chủ phần mềm (địa chỉ
 *  https://<tên>.<tài-khoản>.workers.dev + mã ghép nối 8 ký tự), giữ khoá riêng
 *  ECDSA P-256 trong kho tiện ích, rồi mỗi lần đường hầm đổi thì ĐĂNG KÝ đường hầm
 *  mới (ký bằng khoá riêng). Kèm keySig = HMAC(khoá điện thoại, url|ts) để điện
 *  thoại tự kiểm con trỏ trước khi gửi lệnh. Máy chủ Worker: relay/src/worker.js.
 * ========================================================================== */
const enc = new TextEncoder();

export const RELAY_CODE_TEXT = Object.freeze({
  BAD_URL: 'Địa chỉ cố định không hợp lệ. Dạng đúng: https://thau.ten-cua-anh.workers.dev',
  BAD_CODE: 'Mã ghép nối không đúng (8 ký tự, ví dụ 7KQ2-M9XD).',
  LOCKED: 'Nhập sai mã quá nhiều lần — địa chỉ cố định tạm khoá ghép nối 1 giờ.',
  BAD_TIME: 'Đồng hồ máy tính lệch quá 15 phút — chỉnh lại ngày giờ Windows rồi thử lại.',
  BAD_SIGNATURE: 'Máy này không còn là máy đã ghép (địa chỉ cố định đã được ghép lại ở máy khác). Ghép lại bằng mã ghép nối.',
  NOT_CLAIMED: 'Địa chỉ cố định chưa ghép với máy nào. Ghép lại bằng mã ghép nối.',
  NETWORK: 'Không gọi được địa chỉ cố định (mạng chập chờn?). Tiện ích tự thử lại.',
  NOT_RELAY: 'Địa chỉ này không phải địa chỉ cố định của Giáo Sư Cùi Bắp.'
});

/** "thau.abc.workers.dev" / "https://thau.abc.workers.dev/" → "https://thau.abc.workers.dev"; sai dạng → "".
 *  Chỉ https, không đường dẫn / tham số / tài khoản; cổng riêng được giữ (tên miền riêng sau này). */
export function normalizeRelayUrl(input) {
  let s = String(input || '').trim();
  if (!s) return '';
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  let u;
  try { u = new URL(s); } catch { return ''; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) return '';
  const host = u.hostname.toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host) || host.length > 200) return '';
  return `https://${host}${u.port ? `:${u.port}` : ''}`;
}

/** Mã ghép nối: 8 ký tự Crockford base32; chấp nhận gõ thường, có gạch/khoảng, O→0, I/L→1. */
export function normalizeClaimCode(code) {
  return String(code || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}
export const claimCodeOk = (code) => /^[0-9A-Z]{8}$/.test(normalizeClaimCode(code));

export const pointerMessage = (url, ts) => `gscb-pointer|${url}|${ts}`;
export const claimMessage = (code, ts, x, y) => `gscb-claim|${code}|${ts}|${x}|${y}`;
export const registerMessage = (url, ts, keySig) => `gscb-register|${url}|${ts}|${keySig}`;

export function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hmacB64url(secret, message) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, enc.encode(message)));
}

/** Chữ ký con trỏ cho điện thoại: chỉ ai giữ khoá điện thoại mới tạo được. */
export const pointerKeySig = (phoneKey, url, ts) => hmacB64url(phoneKey, pointerMessage(url, ts));

/** Dấu nhận khoá điện thoại (16 hex): biết khoá đã đổi mà không lưu thêm bản sao khoá. */
export async function keyFingerprint(phoneKey) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(`gscb-fp|${phoneKey}`));
  return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function newRelayKeyPair() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const [pub, priv] = await Promise.all([crypto.subtle.exportKey('jwk', pair.publicKey), crypto.subtle.exportKey('jwk', pair.privateKey)]);
  return { publicJwk: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y }, privateJwk: { kty: 'EC', crv: 'P-256', x: priv.x, y: priv.y, d: priv.d } };
}

export async function signWithJwk(privateJwk, message) {
  const k = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: privateJwk.x, y: privateJwk.y, d: privateJwk.d, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k, enc.encode(message)));
}

/** Thử lại đăng ký khi lỗi: 1, 2, 5, 10, 30 phút. */
export const relayBackoffMs = (failures) => [1, 2, 5, 10, 30][Math.min(Math.max(failures, 1), 5) - 1] * 60 * 1000;

export function defaultRelayState() {
  return { url: '', claimed: false, publicJwk: null, privateJwk: null, registeredUrl: '', registeredKeyFp: '', registeredAt: null, error: '', failures: 0, retryAt: null };
}
