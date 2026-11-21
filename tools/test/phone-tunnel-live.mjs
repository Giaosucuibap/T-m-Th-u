/* ============================================================================
 *  4.20.0 — ĐƯỜNG HẦM CLOUDFLARE THẬT cho Link điện thoại (chỉ Windows, chỉ CI)
 *
 *  node tools/test/phone-tunnel-live.mjs
 *
 *  Bài thử mạng THẬT, chạy trên máy Windows dùng một lần của CI:
 *   1. cài bằng chính native-agent/link-dien-thoai.ps1 (tải cloudflared từ GitHub,
 *      kiểm kích thước + SHA-256 + chữ ký số);
 *   2. chạy tệp .exe đã cài ĐÚNG như Chrome chạy (tham số đầu là mã tiện ích,
 *      khung native messaging qua stdin/stdout), gửi khoá;
 *   3. chờ cloudflared báo link https://….trycloudflare.com;
 *   4. gọi link đó từ Internet: /api/status có khoá → 200; thiếu khoá → 401;
 *      trang chủ có CSP; lệnh tìm đi vòng Internet → tệp .exe → "tiện ích" (bài
 *      thử đóng vai) → kết quả quay lại qua đường hầm;
 *   5. đóng kênh như Chrome tắt → tệp .exe thoát, cloudflared thoát theo;
 *   6. chạy lại rồi GIẾT NGANG tệp .exe → cloudflared vẫn phải chết theo (job tự huỷ);
 *   7. gỡ cài.
 *  Phụ thuộc dịch vụ miễn phí của Cloudflare nên CI không chặn theo bước này;
 *  kết quả (đạt/hỏng) vẫn in rõ trong nhật ký.
 * ========================================================================== */
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'chrome-extension://injgpddgeaedalfgbnnbobdidghjncoj/';
if (process.platform !== 'win32') { console.error('Chỉ chạy trên Windows.'); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const step = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push(true); console.log(`  ĐẠT  ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (error) { results.push(false); console.log(`  HỎNG ${name}: ${error.message}`); throw error; }
};
const must = (cond, message) => { if (!cond) throw new Error(message); };

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'gscb-tunnel-'));
const exeSrc = path.join(root, 'native-agent', 'GiaoSuCuiBap.DienThoai.exe');
const dest = path.join(process.env.LOCALAPPDATA, 'GiaoSuCuiBap', 'DienThoai');
const installed = path.join(dest, 'GiaoSuCuiBap.DienThoai.exe');
const ps = (args) => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args], { encoding: 'utf8', windowsHide: true, timeout: 240000 });
const ourCloudflared = () => Number(ps(['-Command', `@(Get-Process cloudflared -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${dest.replace(/'/g, "''")}\\*' }).Count`]).stdout.trim() || '0');

/** Phiên "Chrome": khởi động tệp .exe đã cài, đọc/gửi khung native messaging. */
function startHost() {
  const child = spawn(installed, [ORIGIN, '--parent-window=0'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const frames = [];
  let buf = Buffer.alloc(0);
  child.stdout.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const size = buf.readUInt32LE(0);
      if (buf.length < 4 + size) break;
      frames.push(JSON.parse(buf.subarray(4, 4 + size).toString('utf8')));
      buf = buf.subarray(4 + size);
    }
  });
  const send = (msg) => { const body = Buffer.from(JSON.stringify(msg), 'utf8'); const head = Buffer.alloc(4); head.writeUInt32LE(body.length, 0); child.stdin.write(Buffer.concat([head, body])); };
  const waitFrame = async (pred, ms, what) => {
    const end = Date.now() + ms;
    for (;;) {
      const f = frames.find(pred);
      if (f) return f;
      if (Date.now() > end) throw new Error(`hết giờ chờ ${what}; đã nhận: ${JSON.stringify(frames).slice(0, 600)}`);
      await sleep(200);
    }
  };
  const exited = new Promise((r) => child.on('exit', (code) => r(code)));
  return { child, frames, send, waitFrame, exited };
}

async function fetchRetry(url, opts, ms) {
  const end = Date.now() + ms;
  let last;
  for (;;) {
    try { const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) }); if (res.status < 500 || Date.now() > end) return res; last = new Error(`HTTP ${res.status}`); }
    catch (error) { last = error; }
    if (Date.now() > end) throw new Error(`không gọi được ${url.replace(/#.*/, '')}: ${last?.message}`);
    await sleep(2000);
  }
}

let exitCode = 0;
try {
  await step('Cài bằng link-dien-thoai.ps1 (tải cloudflared từ GitHub, kiểm SHA-256 + chữ ký số)', async () => {
    fs.copyFileSync(path.join(root, 'native-agent', 'link-dien-thoai.ps1'), path.join(stage, 'link-dien-thoai.ps1'));
    fs.copyFileSync(exeSrc, path.join(stage, 'GiaoSuCuiBap.DienThoai.exe'));
    const hash = createHash('sha256').update(fs.readFileSync(exeSrc)).digest('hex');
    fs.writeFileSync(path.join(stage, 'GiaoSuCuiBap.DienThoai.exe.sha256'), `${hash}  GiaoSuCuiBap.DienThoai.exe\n`);
    fs.mkdirSync(path.join(stage, 'web'));
    fs.writeFileSync(path.join(stage, 'web', 'index.html'), '<!doctype html><title>GSCB-TUNNEL-OK</title>');
    const r = ps(['-File', path.join(stage, 'link-dien-thoai.ps1')]);
    console.log(r.stdout.split(/\r?\n/).filter((l) => /cloudflared|Chu ky|XONG/.test(l)).map((l) => `        ${l}`).join('\n'));
    must(r.status === 0, `tệp cài thoát mã ${r.status}: ${r.stderr.slice(0, 400)}`);
  });

  const key = randomBytes(24).toString('base64url');
  let host = startHost();
  let url = '';
  await step('Tệp .exe chạy như Chrome gọi; cloudflared mở đường hầm https://….trycloudflare.com', async () => {
    host.send({ type: 'config', key });
    const ready = await host.waitFrame((f) => f.type === 'ready', 15000, 'ready');
    must(ready.port > 0, 'thiếu cổng');
    const up = await host.waitFrame((f) => f.type === 'tunnel' && (f.state === 'up' || f.state === 'missing'), 120000, 'đường hầm lên');
    must(up.state === 'up', `đường hầm: ${up.state} ${up.code}`);
    url = up.url;
    must(/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(url), `link lạ: ${url}`);
    console.log(`        link: ${url}`);
  });

  await step('Từ Internet: có khoá → trạng thái; thiếu/sai khoá → 401; trang chủ có CSP', async () => {
    const status = await fetchRetry(`${url}/api/status`, { headers: { 'X-GSCB-Key': key } }, 90000);
    must(status.status === 200, `status HTTP ${status.status}`);
    const body = await status.json();
    must(body.ok === true && body.tunnel?.state === 'up' && body.tunnel?.url === url, JSON.stringify(body));
    const none = await fetchRetry(`${url}/api/status`, {}, 30000);
    must(none.status === 401, `thiếu khoá phải 401, được ${none.status}`);
    const wrong = await fetchRetry(`${url}/api/last`, { headers: { 'X-GSCB-Key': key.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) } }, 30000);
    must(wrong.status === 401, `sai khoá phải 401, được ${wrong.status}`);
    const home = await fetchRetry(`${url}/`, {}, 30000);
    must(home.status === 200 && (await home.text()).includes('GSCB-TUNNEL-OK'), 'trang chủ');
    must(/script-src 'self'/.test(home.headers.get('content-security-policy') || ''), 'thiếu CSP');
  });

  await step('Lệnh tìm đi vòng Internet → tệp .exe → tiện ích → kết quả quay lại qua đường hầm', async () => {
    const start = await fetchRetry(`${url}/api/search`, { method: 'POST', headers: { 'X-GSCB-Key': key, 'content-type': 'application/json' }, body: JSON.stringify({ criteria: { province: 'Lâm Đồng', keyword: 'kênh', evil: 'x' } }) }, 30000);
    must(start.status === 202, `search HTTP ${start.status}`);
    const { jobId } = await start.json();
    const job = await host.waitFrame((f) => f.type === 'job' && f.id === jobId, 15000, 'lệnh tìm tới tiện ích');
    must(job.op === 'search' && job.criteria.province === 'Lâm Đồng' && !('evil' in job.criteria), JSON.stringify(job));
    host.send({ type: 'job-progress', id: jobId, progress: { status: 'RUNNING', fetched: 50 } });
    host.send({ type: 'job-result', id: jobId, resultJson: JSON.stringify({ status: 'SUCCESS', ok: true, tenders: [{ key: 'IB2600012345-00', bidName: 'Nạo vét kênh' }] }) });
    let done;
    for (let i = 0; i < 30 && !done; i++) {
      const res = await fetchRetry(`${url}/api/job?id=${jobId}`, { headers: { 'X-GSCB-Key': key } }, 20000);
      const j = await res.json();
      if (j.state === 'done') done = j; else await sleep(500);
    }
    must(done?.result?.tenders?.[0]?.bidName === 'Nạo vét kênh', `kết quả: ${JSON.stringify(done)}`);
  });

  await step('Chrome đóng kênh → tệp .exe thoát, cloudflared thoát theo', async () => {
    host.child.stdin.end();
    const code = await Promise.race([host.exited, sleep(15000).then(() => 'treo')]);
    must(code !== 'treo', 'tệp .exe không thoát sau 15 giây');
    await sleep(2000);
    must(ourCloudflared() === 0, 'cloudflared vẫn chạy sau khi tệp .exe thoát');
  });

  await step('Tệp .exe bị GIẾT NGANG → cloudflared vẫn bị Windows đóng theo (job tự huỷ)', async () => {
    host = startHost();
    host.send({ type: 'config', key });
    await host.waitFrame((f) => f.type === 'tunnel' && f.state !== 'off', 60000, 'cloudflared khởi động');
    await sleep(3000);
    must(ourCloudflared() >= 1, 'cloudflared chưa chạy');
    host.child.kill();   // TerminateProcess — không kịp dọn dẹp
    await host.exited;
    let left = 1;
    for (let i = 0; i < 20 && left > 0; i++) { await sleep(500); left = ourCloudflared(); }
    must(left === 0, 'cloudflared mồ côi còn chạy sau khi tệp .exe bị giết');
  });
} catch {
  exitCode = 1;
} finally {
  const go = ps(['-File', path.join(stage, 'link-dien-thoai.ps1'), '-Go']);
  if (go.status !== 0) { console.log(`  HỎNG gỡ cài: ${go.stdout}${go.stderr}`); exitCode = 1; }
  fs.rmSync(stage, { recursive: true, force: true });
}
console.log(`\nĐường hầm Cloudflare thật: ${exitCode === 0 ? 'ĐẠT' : 'HỎNG'} ${results.filter(Boolean).length}/${results.length}`);
process.exit(exitCode);
