/* ============================================================================
 *  4.20.0 — MÁY PHỤC VỤ LINK ĐIỆN THOẠI (native-agent/DienThoai.cs)
 *
 *  Bài thử đóng vai CHROME (gửi/nhận khung native messaging qua stdin/stdout)
 *  và vai ĐIỆN THOẠI (gọi HTTP vào cổng 127.0.0.1 của tệp). Chạy trên Windows
 *  (tệp .exe do csc.exe biên dịch ở bước CI) và trên Linux nếu có Mono (mcs).
 *  Chế độ thử --no-tunnel: không mở đường hầm ra Internet.
 * ========================================================================== */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'chrome-extension://injgpddgeaedalfgbnnbobdidghjncoj/';
const KEY = 'k'.repeat(8) + 'A1b2C3d4E5f6G7h8I9j0';
const WIN = process.platform === 'win32';

/** Tìm hoặc dựng tệp .exe: Windows dùng bản CI vừa biên dịch; Linux tự dựng bằng mcs. */
function buildHost() {
  const prebuilt = process.env.GSCB_DIENTHOAI_EXE || path.join(root, 'native-agent', 'GiaoSuCuiBap.DienThoai.exe');
  if (WIN) return fs.existsSync(prebuilt) ? { cmd: prebuilt, pre: [] } : null;
  const mcs = spawnSync('mcs', ['--version'], { encoding: 'utf8' });
  const mono = spawnSync('mono', ['--version'], { encoding: 'utf8' });
  if (mcs.status !== 0 || mono.status !== 0) return null;
  const out = path.join(root, 'test-results', 'dien-thoai-420');
  fs.mkdirSync(out, { recursive: true });
  const exe = path.join(out, 'GiaoSuCuiBap.DienThoai.exe');
  const built = spawnSync('mcs', ['-langversion:5', '-target:exe', '-optimize+', '-r:System.Web.Extensions.dll', `-out:${exe}`, path.join(root, 'native-agent', 'DienThoai.cs')], { encoding: 'utf8' });
  assert.equal(built.status, 0, built.stdout + built.stderr);
  return { cmd: 'mono', pre: [exe] };
}
const HOST = buildHost();
const RUN = HOST ? {} : { skip: 'cần Windows (tệp .exe từ csc.exe) hoặc Mono (mcs) để dựng máy phục vụ' };

let webRoot;
before(() => {
  webRoot = fs.mkdtempSync(path.join(root, 'test-results', 'dien-thoai-web-'));
  fs.mkdirSync(path.join(webRoot, '_expo', 'static', 'js'), { recursive: true });
  fs.writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>GSCB</title>');
  fs.writeFileSync(path.join(webRoot, '_expo', 'static', 'js', 'entry-abc.js'), 'console.log(1)');
  fs.writeFileSync(path.join(root, 'test-results', 'bi-mat.txt'), 'khong duoc lo');
});
after(() => { if (webRoot) fs.rmSync(webRoot, { recursive: true, force: true }); });

/** Khởi động một phiên: trả về hàm gửi khung, hàng đợi khung nhận, cổng HTTP. */
async function session({ args = [], key = KEY } = {}) {
  const child = spawn(HOST.cmd, [...HOST.pre, ORIGIN, '--no-tunnel', '--web', webRoot, '--log', path.join(webRoot, 'log.txt'), ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  const frames = [];
  const waiters = [];
  let buf = Buffer.alloc(0);
  child.stdout.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const size = buf.readUInt32LE(0);
      if (buf.length < 4 + size) break;
      const msg = JSON.parse(buf.subarray(4, 4 + size).toString('utf8'));
      buf = buf.subarray(4 + size);
      frames.push(msg);
      for (const w of [...waiters]) if (w.match(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
    }
  });
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  const send = (obj) => { const body = Buffer.from(JSON.stringify(obj)); const head = Buffer.alloc(4); head.writeUInt32LE(body.length); child.stdin.write(Buffer.concat([head, body])); };
  const next = (match, ms = 8000) => {
    const found = frames.find(match);
    if (found) { frames.splice(frames.indexOf(found), 1); return Promise.resolve(found); }
    return new Promise((resolve, reject) => {
      const w = { match, resolve: (m) => { clearTimeout(t); frames.splice(frames.indexOf(m), 1); resolve(m); } };
      const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error('Hết hạn chờ khung tin từ máy phục vụ')); }, ms);
      waiters.push(w);
    });
  };
  if (key) send({ type: 'config', key, version: '4.20.0' });
  const ready = key ? await next((m) => m.type === 'ready') : null;
  return { child, send, next, frames, exited, port: ready?.port, ready };
}

function request(port, { method = 'GET', path: p = '/', headers = {}, body = null, raw = null } = {}) {
  return new Promise((resolve, reject) => {
    if (raw) {
      const net = http.request({ host: '127.0.0.1', port, method: 'GET', path: '/', createConnection: undefined });
      net.destroy();
    }
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* không phải JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}
const auth = { 'X-GSCB-Key': KEY, 'content-type': 'application/json' };

test('420 máy phục vụ từ chối nguồn gọi không phải tiện ích', RUN, async () => {
  for (const args of [[], ['chrome-extension://other/'], [ORIGIN.replace('jnc', 'jnx')], ['https://muasamcong.mof.gov.vn']]) {
    const r = spawnSync(HOST.cmd, [...HOST.pre, ...args], { input: Buffer.alloc(0), encoding: 'utf8' });
    assert.equal(r.status, 2, `tham số ${JSON.stringify(args)}`);
    assert.equal(r.stdout.length, 0);
  }
});

test('420 khoá sai dạng bị từ chối; khoá đúng → sẵn sàng, chế độ thử không mở đường hầm', RUN, async () => {
  const s = await session({ key: null });
  s.send({ type: 'config', key: 'ngan' });
  assert.equal((await s.next((m) => m.type === 'error')).code, 'BAD_KEY');
  s.send({ type: 'config', key: KEY });
  const ready = await s.next((m) => m.type === 'ready');
  assert.ok(ready.port > 0);
  const tunnel = await s.next((m) => m.type === 'tunnel');
  assert.equal(tunnel.state, 'off');
  assert.equal(tunnel.url, `http://127.0.0.1:${ready.port}`);
  s.child.stdin.end();
  assert.equal(await s.exited, 0, 'Chrome đóng cổng thì máy phục vụ thoát');
});

test('420 API đòi đúng khoá; trạng thái, tìm gói, chống chạy chồng, tiến độ, kết quả, lượt gần nhất', RUN, async () => {
  const s = await session();
  try {
    assert.equal((await request(s.port, { path: '/api/status' })).status, 401);
    assert.equal((await request(s.port, { path: '/api/status', headers: { 'X-GSCB-Key': KEY.slice(0, -1) + 'x' } })).status, 401);
    const st = await request(s.port, { path: '/api/status', headers: auth });
    assert.equal(st.status, 200);
    assert.equal(st.json.busy, false);
    assert.equal(st.headers['cache-control'], 'no-store');

    const criteria = { province: 'Lâm Đồng', category: 'XL', keyword: 'x'.repeat(900), evil: 'rm -rf', minPrice: 3000000000, nested: { a: 1 }, investor: ['mảng'] };
    const start = await request(s.port, { method: 'POST', path: '/api/search', headers: auth, body: JSON.stringify({ criteria }) });
    assert.equal(start.status, 202);
    const job = await s.next((m) => m.type === 'job' && m.op === 'search');
    assert.equal(job.id, start.json.jobId);
    assert.deepEqual(Object.keys(job.criteria).sort(), ['category', 'keyword', 'minPrice', 'province']);
    assert.equal(job.criteria.keyword.length, 500);
    assert.equal(job.criteria.province, 'Lâm Đồng');
    assert.equal(job.criteria.minPrice, '3000000000');

    const busy = await request(s.port, { method: 'POST', path: '/api/search', headers: auth, body: JSON.stringify({ criteria: { province: 'Đồng Nai' } }) });
    assert.equal(busy.status, 409);
    assert.equal(busy.json.code, 'BUSY');

    s.send({ type: 'job-progress', id: job.id, progress: { message: 'Đã lấy 50/137', fetched: 50 } });
    s.send({ type: 'job-result', id: 'khong-co', resultJson: '{"gia":"mao"}' });
    await new Promise((r) => setTimeout(r, 150));
    const running = await request(s.port, { path: `/api/job?id=${job.id}`, headers: auth });
    assert.equal(running.json.state, 'running');
    assert.equal(running.json.progress.fetched, 50);
    assert.equal(running.json.result, null);

    const result = { status: 'SUCCESS', counts: { match: 115 }, tenders: [{ key: 'IB1::00', bidName: 'Kênh mương "N1" <b>' }] };
    s.send({ type: 'job-result', id: job.id, resultJson: JSON.stringify(result) });
    await new Promise((r) => setTimeout(r, 150));
    const done = await request(s.port, { path: `/api/job?id=${job.id}`, headers: auth });
    assert.equal(done.json.state, 'done');
    assert.deepEqual(done.json.result, result);
    assert.deepEqual((await request(s.port, { path: '/api/last', headers: auth })).json.result, result);
    assert.equal((await request(s.port, { path: '/api/status', headers: auth })).json.busy, false);
    assert.equal((await request(s.port, { path: '/api/job?id=khong-co', headers: auth })).status, 404);
  } finally { s.child.stdin.end(); await s.exited; }
});

test('420 bấm Dừng trên điện thoại → lệnh huỷ đúng lượt; lỗi từ tiện ích giải phóng lượt', RUN, async () => {
  const s = await session();
  try {
    const idle = await request(s.port, { method: 'POST', path: '/api/cancel', headers: auth, body: '{}' });
    assert.equal(idle.json.idle, true);
    const start = await request(s.port, { method: 'POST', path: '/api/search', headers: auth, body: JSON.stringify({ criteria: { province: 'Lâm Đồng' } }) });
    const job = await s.next((m) => m.type === 'job' && m.op === 'search');
    await request(s.port, { method: 'POST', path: '/api/cancel', headers: auth, body: '{}' });
    const cancel = await s.next((m) => m.type === 'job' && m.op === 'cancel');
    assert.equal(cancel.target, start.json.jobId);
    s.send({ type: 'job-error', id: job.id, code: 'BUSY_EXTENSION', message: 'Máy tính đang bận' });
    await new Promise((r) => setTimeout(r, 150));
    const err = await request(s.port, { path: `/api/job?id=${job.id}`, headers: auth });
    assert.equal(err.json.state, 'error');
    assert.equal(err.json.code, 'BUSY_EXTENSION');
    assert.equal((await request(s.port, { path: '/api/status', headers: auth })).json.busy, false);
  } finally { s.child.stdin.end(); await s.exited; }
});

test('420 phục vụ giao diện: CSP, ứng dụng một trang, bộ nhớ đệm, chặn đường dẫn lạ', RUN, async () => {
  const s = await session();
  try {
    const index = await request(s.port, { path: '/' });
    assert.equal(index.status, 200);
    assert.match(index.headers['content-type'], /text\/html/);
    assert.match(index.headers['content-security-policy'], /script-src 'self'/);
    assert.equal(index.headers['x-frame-options'], 'DENY');
    assert.equal((await request(s.port, { path: '/theo-doi' })).text, '<!doctype html><title>GSCB</title>');
    const js = await request(s.port, { path: '/_expo/static/js/entry-abc.js' });
    assert.match(js.headers['content-type'], /text\/javascript/);
    assert.match(js.headers['cache-control'], /immutable/);
    for (const p of ['/../bi-mat.txt', '/%2e%2e/bi-mat.txt', '/a%5c..%5cbi-mat.txt', '/C:/Windows/win.ini', '//etc/passwd', '/a%00.js']) {
      const r = await request(s.port, { path: p });
      assert.ok([400, 404].includes(r.status), `${p} → ${r.status}`);
      assert.doesNotMatch(r.text, /khong duoc lo/);
    }
    assert.equal((await request(s.port, { path: '/khong-co.png' })).status, 404);
    assert.equal((await request(s.port, { method: 'DELETE', path: '/' })).status, 405);
  } finally { s.child.stdin.end(); await s.exited; }
});

test('420 thêm hạn nộp vào Lịch: đúng khoá → tệp .ics 3 lời nhắc; dòng ≤ 75 byte; liên kết lạ bị bỏ', RUN, async () => {
  const s = await session();
  try {
    const form = (fields) => new URLSearchParams(fields).toString();
    const base = { summary: 'Hạn nộp: Thi công kênh mương N1, N2; xã Đơn Dương — gói rất dài '.repeat(2), close: '2026-12-20T03:00:00.000Z', description: 'IB2600455000-00\nChủ đầu tư: Ban QLDA', url: 'https://muasamcong.mof.gov.vn/vi/web/guest/contractor-selection?notifyNo=IB2600455000' };
    const bad = await request(s.port, { method: 'POST', path: '/api/ics', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ ...base, k: 'sai' }) });
    assert.equal(bad.status, 401);
    const ok = await request(s.port, { method: 'POST', path: '/api/ics', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ ...base, k: KEY }) });
    assert.equal(ok.status, 200);
    assert.match(ok.headers['content-type'], /text\/calendar/);
    assert.equal((ok.text.match(/BEGIN:VALARM/g) || []).length, 3);
    for (const t of ['-PT72H', '-PT24H', '-PT3H']) assert.ok(ok.text.includes(`TRIGGER:${t}`));
    assert.match(ok.text, /DTSTART:20261220T030000Z/);
    for (const line of ok.text.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `dòng quá dài: ${line}`);
    const unfolded = ok.text.replace(/\r\n /g, '');
    assert.ok(unfolded.includes('SUMMARY:Hạn nộp: Thi công kênh mương N1\\, N2\\; xã Đơn Dương'));
    assert.ok(unfolded.includes('URL:https://muasamcong.mof.gov.vn/'));
    const evil = await request(s.port, { method: 'POST', path: '/api/ics', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ ...base, url: 'https://evil.example/x', k: KEY }) });
    assert.doesNotMatch(evil.text, /evil\.example/);
    const badDate = await request(s.port, { method: 'POST', path: '/api/ics', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ ...base, close: 'không phải ngày', k: KEY }) });
    assert.equal(badDate.status, 400);
  } finally { s.child.stdin.end(); await s.exited; }
});

test('420 yêu cầu quá lớn bị chặn; thân "chunked" (qua đường hầm) vẫn nhận đúng', RUN, async () => {
  const s = await session();
  try {
    const big = await request(s.port, { method: 'POST', path: '/api/search', headers: { ...auth, 'content-length': String(70 * 1024) }, body: 'x'.repeat(70 * 1024) }).catch(() => ({ status: 400 }));
    assert.equal(big.status, 400);
    const hugeHeader = await request(s.port, { path: '/api/status', headers: { ...auth, 'x-dem': 'y'.repeat(20 * 1024) } }).catch(() => ({ status: 400 }));
    assert.equal(hugeHeader.status, 400);
    const chunked = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: s.port, method: 'POST', path: '/api/search', headers: { ...auth, 'transfer-encoding': 'chunked' } }, (res) => {
        const parts = []; res.on('data', (c) => parts.push(c)); res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(parts).toString()) }));
      });
      req.on('error', reject);
      req.write('{"criteria":');
      req.write('{"province":"Khánh Hòa"}}');
      req.end();
    });
    assert.equal(chunked.status, 202);
    const job = await s.next((m) => m.type === 'job' && m.op === 'search');
    assert.equal(job.criteria.province, 'Khánh Hòa');
  } finally { s.child.stdin.end(); await s.exited; }
});
