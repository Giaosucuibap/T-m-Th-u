/* ============================================================================
 *  4.21.0 — ĐỊA CHỈ CỐ ĐỊNH (Cloudflare Worker relay/src/worker.js)
 *
 *  Chạy đúng mã Worker trong Node (kho KV trong bộ nhớ, tệp tĩnh từ thư mục,
 *  fetch giả cho đường hầm). Khoá chặt:
 *   - ghép nối: mã sai bị đếm và khoá sau 20 lần; phải chứng minh giữ khoá riêng;
 *   - đăng ký đường hầm: chỉ máy đã ghép, chỉ *.trycloudflare.com, không lùi thời gian;
 *   - chuyển tiếp: CHỈ tới đúng đường hầm đang đăng ký và đúng đích điện thoại đã
 *     kiểm; chỉ mang khoá + kiểu nội dung; máy tính tắt → PC_OFFLINE;
 *   - ba phía cùng thuật toán: tiện ích ký (phone-relay.js) — Worker kiểm — trang
 *     iPhone kiểm (remote-link.js); runtime thật của tiện ích ghép + đăng ký qua Worker.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import worker, { resetCacheForTests, CSP, TUNNEL_RE } from '../relay/src/worker.js';
import { memoryKv, directoryAssets } from '../tools/test/relay-sim.mjs';
import { newRelayKeyPair, signWithJwk, claimMessage, registerMessage, pointerKeySig, normalizeRelayUrl, normalizeClaimCode, claimCodeOk } from '../GiaoSuCuiBap/lib/phone-relay.js';
import { createPhoneRuntime } from '../GiaoSuCuiBap/lib/runtime-phone.js';
import { PHONE_STORE_KEY } from '../GiaoSuCuiBap/lib/phone-link.js';
import { verifyPointer, readPointer, lastSeenText } from '../mobile-app/src/egp/remote-link.js';

const CODE = '7KQ2M9XD';
const KEY = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const TUN = 'https://ba-chu-ngau-nhien.trycloudflare.com';
const ORIGIN = 'https://thau.truongan.workers.dev';

function makeEnv({ upstream } = {}) {
  resetCacheForTests();
  const web = fs.mkdtempSync(path.join(os.tmpdir(), 'gscb-relay-web-'));
  fs.mkdirSync(path.join(web, '_expo', 'static', 'js'), { recursive: true });
  fs.writeFileSync(path.join(web, 'index.html'), '<!doctype html><title>GSCB</title>');
  fs.writeFileSync(path.join(web, '_expo', 'static', 'js', 'entry-abc.js'), 'console.log(1)');
  fs.writeFileSync(path.join(web, 'sw.js'), 'self.addEventListener("fetch",()=>{})');
  const calls = [];
  const env = {
    GSCB: memoryKv(), ASSETS: directoryAssets(web), CLAIM_CODE_HASH: createHash('sha256').update(CODE).digest('hex'),
    FETCH: async (url, init) => { calls.push({ url, init }); return upstream ? upstream(url, init) : Response.json({ ok: true, echo: url }); }
  };
  const call = (p, init = {}) => worker.fetch(new Request(ORIGIN + p, init), env);
  return { env, call, calls, web };
}
const post = (body) => ({ method: 'POST', headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(body) });

async function claimBody(code = CODE, pair, ts = Date.now()) {
  const { publicJwk, privateJwk } = pair || await newRelayKeyPair();
  const c = normalizeClaimCode(code);
  return { body: { code: c, ts, publicKey: publicJwk, sig: await signWithJwk(privateJwk, claimMessage(c, ts, publicJwk.x, publicJwk.y)) }, publicJwk, privateJwk };
}
async function registerBody(privateJwk, url = TUN, ts = Date.now(), key = KEY) {
  const keySig = await pointerKeySig(key, url, ts);
  return { url, ts, keySig, sig: await signWithJwk(privateJwk, registerMessage(url, ts, keySig)) };
}

test('tệp tĩnh: trang có CSP chặt + chống nhúng; tệp băm lưu lâu; sw.js không lưu; đường dẫn ứng dụng một trang trả index', async () => {
  const { call } = makeEnv();
  const home = await call('/');
  assert.equal(home.status, 200);
  assert.equal(home.headers.get('content-security-policy'), CSP);
  assert.match(CSP, /connect-src 'self'/);
  assert.match(CSP, /frame-ancestors 'none'/);
  assert.equal(home.headers.get('x-frame-options'), 'DENY');
  assert.match((await call('/_expo/static/js/entry-abc.js')).headers.get('cache-control'), /immutable/);
  assert.equal((await call('/sw.js')).headers.get('cache-control'), 'no-cache');
  assert.equal(await (await call('/theo-doi')).text(), '<!doctype html><title>GSCB</title>');
  assert.equal((await call('/khong-co.png')).status, 404);
  assert.equal((await call('/', { method: 'POST' })).status, 405);
});

test('ghép nối: mã sai bị từ chối và đếm, 20 lần sai khoá 1 giờ; phải ký bằng khoá riêng; đúng thì ghi chủ và xoá con trỏ cũ', async () => {
  const { call, env } = makeEnv();
  const wrong = await claimBody('AAAA-AAAA');
  const r1 = await call('/_gscb/claim', post(wrong.body));
  assert.equal(r1.status, 403);
  assert.equal((await r1.json()).code, 'BAD_CODE');
  assert.equal(r1.headers.get('access-control-allow-origin'), 'chrome-extension://injgpddgeaedalfgbnnbobdidghjncoj');
  const good = await claimBody();
  const forged = { ...good.body, sig: wrong.body.sig };
  assert.equal((await (await call('/_gscb/claim', post(forged))).json()).code, 'BAD_SIGNATURE', 'mã đúng nhưng không giữ khoá riêng');
  const old = await claimBody(CODE, null, Date.now() - 20 * 60 * 1000);
  assert.equal((await (await call('/_gscb/claim', post(old.body))).json()).code, 'BAD_TIME');
  await env.GSCB.put('pointer', JSON.stringify({ url: 'https://cu.trycloudflare.com', ts: 1, keySig: 'x' }));
  const ok = await call('/_gscb/claim', post(good.body));
  assert.equal(ok.status, 200, await ok.clone().text());
  assert.deepEqual((await env.GSCB.get('owner', 'json')).publicKey, good.publicJwk);
  assert.equal(await env.GSCB.get('pointer'), null, 'ghép lại thì con trỏ cũ bị xoá');
  assert.equal(await env.GSCB.get('claim-fails'), null);
  for (let i = 0; i < 20; i++) await call('/_gscb/claim', post(wrong.body));
  const locked = await call('/_gscb/claim', post(good.body));
  assert.equal(locked.status, 429, 'sai 20 lần thì khoá, kể cả mã đúng');
  assert.equal((await call('/_gscb/claim', { method: 'OPTIONS' })).status, 204);
  assert.ok(claimCodeOk('7kq2-m9xd') && claimCodeOk('7KQ2 M9XD') && !claimCodeOk('7KQ2M9X'));
  assert.equal(normalizeClaimCode('oil-0oIL'), '0110011', 'O→0, I/L→1');
});

test('đăng ký đường hầm: chỉ máy đã ghép, chỉ *.trycloudflare.com, đúng chữ ký, không lùi thời gian', async () => {
  const { call } = makeEnv();
  const owner = await claimBody();
  const before = await call('/_gscb/register', post(await registerBody(owner.privateJwk)));
  assert.equal((await before.json()).code, 'NOT_CLAIMED');
  await call('/_gscb/claim', post(owner.body));
  for (const url of ['https://evil.example.com', 'http://x.trycloudflare.com', 'https://api.trycloudflare.com', 'https://x.trycloudflare.com.evil.com', `${TUN}/duong-dan`, 'https://-x.trycloudflare.com']) {
    const r = await call('/_gscb/register', post(await registerBody(owner.privateJwk, url)));
    assert.equal(r.status, 400, url);
  }
  const stranger = await newRelayKeyPair();
  assert.equal((await (await call('/_gscb/register', post(await registerBody(stranger.privateJwk)))).json()).code, 'BAD_SIGNATURE', 'máy lạ không đổi được con trỏ');
  const t1 = Date.now();
  assert.equal((await call('/_gscb/register', post(await registerBody(owner.privateJwk, TUN, t1)))).status, 200);
  const p = await (await call('/_gscb/pointer')).json();
  assert.equal(p.url, TUN);
  assert.equal(p.ts, t1);
  assert.equal(await verifyPointer(KEY, p), true, 'trang iPhone kiểm được chữ ký con trỏ do tiện ích tạo');
  assert.equal(await verifyPointer('Khac' + KEY.slice(4), p), false, 'khoá khác → không tin con trỏ');
  assert.equal(await verifyPointer(KEY, { ...p, url: 'https://khac.trycloudflare.com' }), false, 'đổi url → chữ ký sai');
  const replay = await call('/_gscb/register', post(await registerBody(owner.privateJwk, 'https://cu-hon.trycloudflare.com', t1 - 1000)));
  assert.equal((await replay.json()).code, 'STALE', 'gói đăng ký cũ gửi lại không lùi được con trỏ');
  const health = await (await call('/_gscb/health')).json();
  assert.equal(health.claimed, true);
  assert.ok(health.pointerAgeSec >= 0);
});

test('chuyển tiếp: chỉ tới đúng đường hầm đã đăng ký và đúng đích điện thoại đã kiểm; chỉ mang khoá + kiểu nội dung', async () => {
  const { call, calls } = makeEnv();
  const noPointer = await call('/api/status', { headers: { 'x-gscb-key': KEY, 'x-gscb-target': TUN } });
  assert.equal((await noPointer.json()).code, 'NO_POINTER');
  const owner = await claimBody();
  await call('/_gscb/claim', post(owner.body));
  await call('/_gscb/register', post(await registerBody(owner.privateJwk)));
  for (const target of ['', 'https://evil.example.com', 'https://khac.trycloudflare.com']) {
    const r = await call('/api/status', { headers: { 'x-gscb-key': KEY, 'x-gscb-target': target } });
    assert.equal(r.status, 409, target);
    assert.equal((await r.json()).code, 'STALE_TARGET');
  }
  assert.equal(calls.length, 0, 'không gửi gì khi đích không khớp');
  const ok = await call('/api/search?x=1', { method: 'POST', headers: { 'x-gscb-key': KEY, 'x-gscb-target': TUN, 'content-type': 'application/json', cookie: 'bi-mat=1', authorization: 'Bearer lo' }, body: '{"criteria":{}}' });
  assert.equal(ok.status, 200);
  assert.equal(calls[0].url, `${TUN}/api/search?x=1`);
  assert.deepEqual(calls[0].init.headers, { 'x-gscb-key': KEY, 'content-type': 'application/json' }, 'không chuyển cookie / authorization / đích');
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  const form = new URLSearchParams({ k: KEY, summary: 'Hạn nộp', close: '2026-12-20T03:00:00Z', t: TUN }).toString();
  await call('/api/ics', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form });
  assert.equal(calls[1].url, `${TUN}/api/ics`);
  assert.equal(new URLSearchParams(calls[1].init.body).get('t'), null, 'trường đích bị bỏ trước khi chuyển');
  assert.equal(new URLSearchParams(calls[1].init.body).get('k'), KEY);
  const badIcs = await call('/api/ics', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ k: KEY, t: 'https://evil.trycloudflare.com' }).toString() });
  assert.equal(badIcs.status, 409);
  assert.equal(calls.length, 2);
  const big = await call('/api/search', { method: 'POST', headers: { 'x-gscb-key': KEY, 'x-gscb-target': TUN }, body: 'x'.repeat(70 * 1024) });
  assert.equal(big.status, 413);
});

test('máy tính tắt / đường hầm đóng / máy phục vụ tắt → 502 PC_OFFLINE kèm thời điểm đăng ký; lỗi khác giữ nguyên mã', async () => {
  for (const [label, upstream] of [['530', () => new Response('error code: 1033', { status: 530 })], ['502', () => new Response('bad gateway', { status: 502 })], ['ném lỗi', () => { throw new TypeError('fetch failed'); }]]) {
    const { call } = makeEnv({ upstream });
    const owner = await claimBody();
    await call('/_gscb/claim', post(owner.body));
    const ts = Date.now();
    await call('/_gscb/register', post(await registerBody(owner.privateJwk, TUN, ts)));
    const r = await call('/api/status', { headers: { 'x-gscb-key': KEY, 'x-gscb-target': TUN } });
    assert.equal(r.status, 502, label);
    const j = await r.json();
    assert.equal(j.code, 'PC_OFFLINE');
    assert.equal(j.since, ts);
  }
  const { call } = makeEnv({ upstream: () => Response.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 }) });
  const owner = await claimBody();
  await call('/_gscb/claim', post(owner.body));
  await call('/_gscb/register', post(await registerBody(owner.privateJwk)));
  assert.equal((await call('/api/status', { headers: { 'x-gscb-key': 'sai', 'x-gscb-target': TUN } })).status, 401, 'khoá sai: máy tính trả 401, Worker giữ nguyên');
  assert.match(lastSeenText(Date.parse('2026-11-09T01:15:00Z'), Date.parse('2026-11-09T05:00:00Z')), /^lúc 08:15 hôm nay$/);
  assert.match(lastSeenText(Date.parse('2026-11-08T01:15:00Z'), Date.parse('2026-11-09T05:00:00Z')), /hôm qua/);
});

test('runtime thật của tiện ích: ghép nối → đường hầm lên thì tự đăng ký → điện thoại tìm thấy và tin con trỏ; đổi khoá thì đăng ký lại; mã QR là địa chỉ cố định', async () => {
  const { env, call } = makeEnv();
  const store = {};
  const storage = { async get(d) { const o = {}; for (const [k, v] of Object.entries(d)) o[k] = k in store ? structuredClone(store[k]) : v; return o; }, async set(o) { Object.assign(store, structuredClone(o)); } };
  const ports = [];
  const runtime = { lastError: null, connectNative() { const l = { m: [], d: [] }; const p = { sent: [], onMessage: { addListener: (f) => l.m.push(f) }, onDisconnect: { addListener: (f) => l.d.push(f) }, postMessage: (m) => p.sent.push(m), disconnect() {}, emit: (m) => l.m.forEach((f) => f(m)) }; ports.push(p); return p; } };
  const fetchImpl = (url, init) => worker.fetch(new Request(url, init), env);
  const rt = createPhoneRuntime({ storage, runtime, version: '4.21.0', fetchImpl, startSearch: async () => ({ ok: false }), cancelSearch: async () => {}, readActiveRun: async () => null, readFinishedRun: async () => ({}) });
  await rt.setEnabled(true);
  const key = ports[0].sent[0].key;
  const bad = await rt.pairRelay({ url: 'thau.truongan.workers.dev', code: 'AAAA-AAAA' });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /Mã ghép nối không đúng/);
  assert.equal((await rt.pairRelay({ url: 'http://thau.truongan.workers.dev', code: CODE })).code, 'BAD_URL', 'chỉ https');
  let s = await rt.pairRelay({ url: 'thau.truongan.workers.dev/', code: '7kq2-m9xd' });
  assert.equal(s.relay.claimed, true, JSON.stringify(s));
  assert.equal(s.link, `${ORIGIN}/#k=${key}`, 'mã QR = địa chỉ cố định (không phải đường hầm)');
  assert.equal(JSON.stringify(s).includes('"d"'), false, 'khoá riêng không ra ngoài trang');
  assert.equal(store[PHONE_STORE_KEY].relay.privateJwk.kty, 'EC');
  assert.equal((await call('/_gscb/pointer')).status, 404, 'chưa có đường hầm → chưa đăng ký');
  ports[0].emit({ type: 'tunnel', state: 'up', url: TUN, code: '' });
  for (let i = 0; i < 50 && !(await rt.state()).relay.current; i++) await new Promise((r) => setTimeout(r, 10));
  s = await rt.state();
  assert.equal(s.relay.current, true);
  assert.equal(s.directLink, `${TUN}/#k=${key}`);
  const phoneFetch = (u, init) => worker.fetch(new Request(ORIGIN + u, init), env);
  const found = await readPointer(key, phoneFetch);
  assert.equal(found.kind, 'relay');
  assert.equal(found.valid, true);
  assert.equal(found.pointer.url, TUN);
  ports[0].emit({ type: 'tunnel', state: 'up', url: 'https://duong-ham-moi.trycloudflare.com', code: '' });
  for (let i = 0; i < 50 && (await readPointer(key, phoneFetch)).pointer?.url !== 'https://duong-ham-moi.trycloudflare.com'; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal((await readPointer(key, phoneFetch)).pointer.url, 'https://duong-ham-moi.trycloudflare.com', 'máy tính khởi động lại → con trỏ tự đổi, không phải quét lại');
  s = await rt.rotateKey();
  const newKey = ports[0].sent.filter((m) => m.type === 'config').at(-1).key;
  assert.notEqual(newKey, key);
  assert.equal(s.link, `${ORIGIN}/#k=${newKey}`);
  const afterRotate = await readPointer(key, phoneFetch);
  assert.equal(afterRotate.valid, false, 'điện thoại giữ khoá cũ không tin con trỏ mới → báo quét lại mã');
  assert.equal((await readPointer(newKey, phoneFetch)).valid, true);
  s = await rt.unpairRelay();
  assert.equal(s.relay.claimed, false);
  assert.equal(s.link, `https://duong-ham-moi.trycloudflare.com/#k=${newKey}`, 'bỏ ghép → mã QR quay về link đường hầm (như 4.20.0)');
});

test('trang do máy tính phát trực tiếp (không có Worker): nhận ra chế độ trực tiếp; mất mạng: báo offline', async () => {
  const html = async () => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  assert.deepEqual(await readPointer(KEY, html), { kind: 'direct' });
  assert.deepEqual(await readPointer(KEY, async () => { throw new TypeError('offline'); }), { kind: 'offline' });
  assert.equal(normalizeRelayUrl('THAU.truongan.workers.dev'), ORIGIN);
  for (const bad of ['', 'ftp://x.y', 'http://a.b', 'https://x', 'https://a.b/duong', 'https://u:p@a.b', 'https://a.b/?q=1', 'https://a.b/#k=1']) assert.equal(normalizeRelayUrl(bad), '', bad);
  assert.equal(normalizeRelayUrl('https://thau.truongan.vn:8443/'), 'https://thau.truongan.vn:8443', 'tên miền riêng có cổng riêng');
  assert.ok(TUNNEL_RE.test(TUN));
});

test('CI Linux chạy bài đầu-cuối địa chỉ cố định với WebKit BẮT BUỘC (thiếu WebKit là hỏng, không lặng lẽ bỏ qua); triển khai không đưa bí mật vào git', () => {
  const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const ci = read('.github/workflows/kiem-thu.yml');
  const app = ci.slice(ci.indexOf('  app-di-dong:'), ci.indexOf('  windows:'));
  const install = app.indexOf('webkit2gtk-driver matchbox-window-manager');
  const run = app.indexOf('tools/test/phone-relay.mjs');
  assert.ok(install > 0 && run > install, 'cài WebKit trước khi chạy bài đầu-cuối');
  assert.match(app, /runs-on: ubuntu-24\.04\r?\n/, 'job app ghim Ubuntu 24.04: 26.04 không có gói webkit2gtk-driver');
  assert.match(app.slice(install, run), /GSCB_REQUIRE_WEBKIT: '1'/);
  assert.ok(app.includes('test-results/phone-relay/*.png'), 'lưu ảnh chụp iPhone/iPad');
  assert.match(read('tools/test/phone-relay.mjs'), /process\.env\.GSCB_REQUIRE_WEBKIT/);
  const ignore = read('.gitignore');
  for (const p of ['relay/build/', 'relay/.wrangler.jsonc', 'relay/.wrangler/']) assert.ok(ignore.split(/\r?\n/).includes(p), `.gitignore có ${p}`);
  const deploy = read('relay/trien-khai.mjs');
  assert.match(deploy, /createHash\('sha256'\)\.update\(code\)/, 'Worker chỉ nhận SHA-256 của mã ghép nối');
  assert.doesNotMatch(deploy, /writeFileSync\([^)]*code/, 'mã ghép nối không ghi ra tệp');
});
