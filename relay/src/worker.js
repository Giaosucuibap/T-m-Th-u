/* ============================================================================
 *  ĐỊA CHỈ CỐ ĐỊNH CHO LINK ĐIỆN THOẠI (4.21.0) — Cloudflare Worker
 *
 *  Vấn đề: đường hầm miễn phí của máy tính công ty (https://….trycloudflare.com)
 *  đổi địa chỉ mỗi lần máy tính / Chrome khởi động lại → iPhone phải quét lại mã.
 *  Worker này cho MỘT địa chỉ không đổi (https://<tên>.<tài-khoản>.workers.dev):
 *   - phát giao diện iPhone/iPad (tệp tĩnh) — mở được cả khi máy tính đang tắt;
 *   - giữ "con trỏ" tới đường hầm hiện tại của máy tính (KV), máy tính tự đăng ký
 *     mỗi khi đường hầm đổi (chữ ký ECDSA bằng khoá riêng của máy tính đã ghép);
 *   - chuyển tiếp /api/* tới đúng đường hầm đó, KHÔNG tới bất kỳ đâu khác.
 *
 *  Lớp bảo vệ khoá điện thoại (khoá truy cập nằm sau dấu # của link, không bao giờ
 *  gửi lên Worker ngoài tiêu đề X-GSCB-Key của từng lệnh):
 *   1. Chỉ máy tính đã ghép (giữ khoá riêng) mới đổi được con trỏ.
 *   2. Con trỏ còn mang keySig = HMAC(khoá điện thoại, url|ts) do máy tính ký; điện
 *      thoại TỰ KIỂM keySig rồi mới gửi lệnh, kèm X-GSCB-Target = đích đã kiểm. Worker
 *      chỉ chuyển tiếp khi đích đó trùng con trỏ hiện tại. Kể cả khi Worker / kho KV
 *      bị chiếm, khoá điện thoại không bị gửi tới máy lạ.
 *
 *  Ràng buộc (env): ASSETS (tệp tĩnh), GSCB (KV), CLAIM_CODE_HASH (SHA-256 hex của
 *  mã ghép nối, bí mật), FETCH (chỉ dùng khi kiểm thử).
 *  Giao thức: native-agent/DIEN-THOAI-GIAO-THUC.md (mục "Địa chỉ cố định").
 * ========================================================================== */
export const RELAY_VERSION = '1.0.0';
export const EXT_ORIGIN = 'chrome-extension://injgpddgeaedalfgbnnbobdidghjncoj';
export const TUNNEL_RE = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com$/;
const MAX_SKEW_MS = 15 * 60 * 1000;
const POINTER_CACHE_MS = 10 * 1000;
const MAX_BODY = 64 * 1024;
const CLAIM_FAIL_LIMIT = 20;
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'";

const enc = new TextEncoder();
let pointerCache = null;   // { at, value } — bộ đệm 10 giây trong một isolate
export function resetCacheForTests() { pointerCache = null; }

export function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromB64url(text) {
  const s = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function sha256hex(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
/** Mã ghép nối: 8 ký tự Crockford base32, người dùng có thể gõ thường, có gạch/khoảng. */
export function normalizeClaimCode(code) {
  return String(code || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

const baseHeaders = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
const corsHeaders = { 'access-control-allow-origin': EXT_ORIGIN, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600', vary: 'Origin' };
function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...baseHeaders, ...extra } });
}
async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw Object.assign(new Error('Thân yêu cầu quá lớn'), { status: 413 });
  return text;
}
async function readJson(request) {
  try { return JSON.parse(await readBody(request)); } catch (e) { throw Object.assign(new Error('JSON không hợp lệ'), { status: e.status || 400 }); }
}
async function importPublicKey(jwk) {
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string' || jwk.x.length > 64 || jwk.y.length > 64) throw new Error('Khoá công khai không hợp lệ');
  return crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
}
async function verifySig(publicKey, sig, message) {
  try {
    const bytes = fromB64url(sig);
    if (bytes.length !== 64) return false;
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, bytes, enc.encode(message));
  } catch { return false; }
}
export const claimMessage = (code, ts, x, y) => `gscb-claim|${code}|${ts}|${x}|${y}`;
export const registerMessage = (url, ts, keySig) => `gscb-register|${url}|${ts}|${keySig}`;

async function getPointer(env, fresh = false) {
  if (!fresh && pointerCache && Date.now() - pointerCache.at < POINTER_CACHE_MS) return pointerCache.value;
  const value = await env.GSCB.get('pointer', 'json');
  pointerCache = { at: Date.now(), value };
  return value;
}

/* ------------------------------------------------- ghép nối (một lần, từ máy tính) */
async function claim(request, env) {
  const body = await readJson(request);
  if (await env.GSCB.get('claim-lock')) return json(429, { ok: false, code: 'LOCKED' }, corsHeaders);
  const code = normalizeClaimCode(body.code);
  const good = /^[0-9A-Z]{8}$/.test(code) && typeof env.CLAIM_CODE_HASH === 'string' && safeEqual(await sha256hex(code), env.CLAIM_CODE_HASH.toLowerCase());
  if (!good) {
    const fails = (Number(await env.GSCB.get('claim-fails')) || 0) + 1;
    await env.GSCB.put('claim-fails', String(fails), { expirationTtl: 3600 });
    if (fails >= CLAIM_FAIL_LIMIT) await env.GSCB.put('claim-lock', '1', { expirationTtl: 3600 });
    return json(403, { ok: false, code: 'BAD_CODE' }, corsHeaders);
  }
  let key;
  try { key = await importPublicKey(body.publicKey); } catch { return json(400, { ok: false, code: 'BAD_KEY' }, corsHeaders); }
  const ts = Number(body.ts);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) return json(400, { ok: false, code: 'BAD_TIME' }, corsHeaders);
  // Chứng minh giữ khoá riêng: chữ ký trên mã + thời điểm + chính khoá công khai.
  if (!(await verifySig(key, String(body.sig || ''), claimMessage(code, ts, body.publicKey.x, body.publicKey.y)))) return json(403, { ok: false, code: 'BAD_SIGNATURE' }, corsHeaders);
  // Ghép lại (máy tính cài lại) thay khoá cũ; con trỏ cũ bị xoá để điện thoại không dùng đích cũ.
  await env.GSCB.put('owner', JSON.stringify({ publicKey: { kty: 'EC', crv: 'P-256', x: body.publicKey.x, y: body.publicKey.y }, claimedAt: new Date().toISOString() }));
  await env.GSCB.delete('pointer');
  await env.GSCB.delete('claim-fails');
  pointerCache = null;
  return json(200, { ok: true, version: RELAY_VERSION }, corsHeaders);
}

/* ----------------------------------------- máy tính báo đường hầm mới (mỗi lần đổi) */
async function register(request, env) {
  const body = await readJson(request);
  const owner = await env.GSCB.get('owner', 'json');
  if (!owner) return json(409, { ok: false, code: 'NOT_CLAIMED' }, corsHeaders);
  const url = String(body.url || '');
  const ts = Number(body.ts);
  const keySig = String(body.keySig || '');
  if (!TUNNEL_RE.test(url) || url === 'https://api.trycloudflare.com') return json(400, { ok: false, code: 'BAD_URL' }, corsHeaders);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) return json(400, { ok: false, code: 'BAD_TIME' }, corsHeaders);
  if (!/^[A-Za-z0-9_-]{43}$/.test(keySig)) return json(400, { ok: false, code: 'BAD_KEYSIG' }, corsHeaders);
  let key;
  try { key = await importPublicKey(owner.publicKey); } catch { return json(500, { ok: false, code: 'OWNER_BROKEN' }, corsHeaders); }
  if (!(await verifySig(key, String(body.sig || ''), registerMessage(url, ts, keySig)))) return json(403, { ok: false, code: 'BAD_SIGNATURE' }, corsHeaders);
  const cur = await env.GSCB.get('pointer', 'json');
  if (cur && Number(cur.ts) > ts) return json(409, { ok: false, code: 'STALE' }, corsHeaders);   // gói đăng ký cũ gửi lại
  const value = { url, ts, keySig };
  await env.GSCB.put('pointer', JSON.stringify(value));
  pointerCache = { at: Date.now(), value };
  return json(200, { ok: true }, corsHeaders);
}

/* ------------------------------------------- chuyển tiếp lệnh của điện thoại tới máy tính */
async function proxy(request, env, url) {
  let pointer = await getPointer(env);
  if (!pointer) return json(503, { ok: false, code: 'NO_POINTER' });
  let target = request.headers.get('x-gscb-target') || '';
  let body;
  if (request.method === 'POST' && url.pathname === '/api/ics') {
    // Biểu mẫu thường (Safari tải tệp .ics) không đặt được tiêu đề: đích nằm ở trường "t".
    const form = new URLSearchParams(await readBody(request));
    target = form.get('t') || target;
    form.delete('t');
    body = form.toString();
  } else if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await readBody(request);
  }
  if (target !== pointer.url) {
    pointer = await getPointer(env, true);
    if (!pointer || target !== pointer.url) return json(409, { ok: false, code: 'STALE_TARGET' });
  }
  const headers = { 'x-gscb-key': request.headers.get('x-gscb-key') || '' };
  const type = request.headers.get('content-type');
  if (type) headers['content-type'] = type;
  let res;
  try {
    res = await (env.FETCH || fetch)(pointer.url + url.pathname + url.search, { method: request.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(25000) });
  } catch {
    return json(502, { ok: false, code: 'PC_OFFLINE', since: pointer.ts });
  }
  // Đường hầm đã đóng (cloudflared tắt): Cloudflare trả 530; cloudflared còn nhưng máy phục vụ tắt: 502.
  if (res.status === 502 || res.status === 503 || res.status === 504 || res.status >= 520) return json(502, { ok: false, code: 'PC_OFFLINE', since: pointer.ts, upstream: res.status });
  const out = new Headers(baseHeaders);
  for (const h of ['content-type', 'content-disposition']) { const v = res.headers.get(h); if (v) out.set(h, v); }
  return new Response(res.body, { status: res.status, headers: out });
}

/* ------------------------------------------------------------------- tệp tĩnh */
async function asset(request, env) {
  const res = await env.ASSETS.fetch(request);
  const headers = new Headers(res.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  const type = headers.get('content-type') || '';
  const path = new URL(request.url).pathname;
  if (type.startsWith('text/html')) {
    headers.set('content-security-policy', CSP);
    headers.set('x-frame-options', 'DENY');
    headers.set('cache-control', 'no-cache');
  } else if (path === '/sw.js') {
    headers.set('cache-control', 'no-cache');
  } else if (path.startsWith('/_expo/static/') || path.startsWith('/assets/')) {
    headers.set('cache-control', 'public, max-age=31536000, immutable');
  }
  return new Response(res.body, { status: res.status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/_gscb/')) {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
        if (url.pathname === '/_gscb/claim' && request.method === 'POST') return await claim(request, env);
        if (url.pathname === '/_gscb/register' && request.method === 'POST') return await register(request, env);
        if (url.pathname === '/_gscb/pointer' && request.method === 'GET') {
          const p = await getPointer(env);
          return p ? json(200, { ok: true, url: p.url, ts: p.ts, keySig: p.keySig, now: Date.now() }) : json(404, { ok: false, code: 'NO_POINTER' });
        }
        if (url.pathname === '/_gscb/health' && request.method === 'GET') {
          const [owner, p] = await Promise.all([env.GSCB.get('owner', 'json'), getPointer(env)]);
          return json(200, { ok: true, version: RELAY_VERSION, claimed: Boolean(owner), pointerAgeSec: p ? Math.round((Date.now() - p.ts) / 1000) : null });
        }
        return json(404, { ok: false, code: 'NOT_FOUND' });
      }
      if (url.pathname.startsWith('/api/')) return await proxy(request, env, url);
      if (request.method !== 'GET' && request.method !== 'HEAD') return json(405, { ok: false, code: 'METHOD' });
      return await asset(request, env);
    } catch (e) {
      return json(e.status || 500, { ok: false, code: e.status === 413 ? 'TOO_BIG' : e.status === 400 ? 'BAD_REQUEST' : 'ERROR' });
    }
  }
};
