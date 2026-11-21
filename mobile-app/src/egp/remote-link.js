/* ============================================================================
 *  4.21.0 — TÌM MÁY TÍNH CÔNG TY QUA ĐỊA CHỈ CỐ ĐỊNH (phần thuần, kiểm thử được)
 *
 *  Trang được phát từ địa chỉ cố định (Cloudflare Worker, relay/src/worker.js).
 *  Worker giữ "con trỏ" tới đường hầm hiện tại của máy tính: {url, ts, keySig},
 *  keySig = HMAC-SHA256(khoá điện thoại, "gscb-pointer|url|ts") do MÁY TÍNH ký.
 *  Trang tự kiểm keySig bằng khoá của mình rồi mới gửi lệnh (kèm X-GSCB-Target):
 *  con trỏ giả (không có khoá) bị từ chối → khoá không bao giờ đi tới máy lạ.
 *  Cùng thuật toán với GiaoSuCuiBap/lib/phone-relay.js (bài kiểm thử đối chiếu).
 * ========================================================================== */
const enc = new TextEncoder();
export const TUNNEL_RE = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com$/;
export const KEY_RE = /^[A-Za-z0-9_-]{24,128}$/;

export function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hmacB64url(secret, message) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, enc.encode(message)));
}

/** Con trỏ hợp lệ khi: đúng dạng đường hầm Cloudflare, có thời điểm, và keySig khớp khoá của trang. */
export async function verifyPointer(key, p) {
  if (!KEY_RE.test(String(key || '')) || !p || typeof p !== 'object') return false;
  const url = String(p.url || '');
  const ts = Number(p.ts);
  const sig = String(p.keySig || '');
  if (!TUNNEL_RE.test(url) || url === 'https://api.trycloudflare.com' || !Number.isFinite(ts) || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return false;
  const want = await hmacB64url(key, `gscb-pointer|${url}|${ts}`);
  let d = want.length ^ sig.length;
  for (let i = 0; i < Math.min(want.length, sig.length); i++) d |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return d === 0;
}

/** Hỏi Worker con trỏ hiện tại. Trả: {kind:'relay', pointer, valid} | {kind:'relay-empty'} | {kind:'direct'} | {kind:'offline'}. */
export async function readPointer(key, fetchImpl = (...a) => fetch(...a)) {
  let res;
  try { res = await fetchImpl('/_gscb/pointer', { cache: 'no-store' }); } catch { return { kind: 'offline' }; }
  const type = res.headers.get('content-type') || '';
  // Trang do máy tính phát qua đường hầm (không có Worker): đường dẫn lạ trả về trang HTML.
  if (!type.includes('application/json')) return { kind: 'direct' };
  let j = null;
  try { j = await res.json(); } catch { return { kind: 'direct' }; }
  if (res.status === 404 && j?.code === 'NO_POINTER') return { kind: 'relay-empty' };
  if (!res.ok || !j?.ok) return { kind: 'offline' };
  const pointer = { url: j.url, ts: j.ts, keySig: j.keySig };
  return { kind: 'relay', pointer, valid: await verifyPointer(key, pointer), now: Number(j.now) || null };
}

/** "lần cuối thấy máy tính lúc 08:15 hôm qua" — giờ Việt Nam. */
export function lastSeenText(ts, now = Date.now()) {
  const t = Number(ts);
  if (!Number.isFinite(t) || t <= 0) return '';
  const fmt = (d) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const day = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
  const a = new Date(t);
  const b = new Date(now);
  if (day(a) === day(b)) return `lúc ${fmt(a)} hôm nay`;
  if (day(a) === day(new Date(now - 86400000))) return `lúc ${fmt(a)} hôm qua`;
  return `lúc ${fmt(a)} ngày ${new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' }).format(a)}`;
}
