/* ============================================================================
 *  TRIỂN KHAI ĐỊA CHỈ CỐ ĐỊNH (Cloudflare Worker) LÊN TÀI KHOẢN CLOUDFLARE CỦA CHỦ PHẦN MỀM
 *
 *  node relay/trien-khai.mjs [--ten thau] [--tai-khoan-con truongan] [--chi-cap-nhat]
 *
 *  Cần biến môi trường CLOUDFLARE_API_TOKEN (mẫu quyền "Edit Cloudflare Workers").
 *  Các bước:
 *   1. Dựng giao diện iPhone/iPad (mobile-app, chế độ remote) vào relay/build.
 *   2. Tạo (hoặc dùng lại) kho KV "gscb-dien-thoai".
 *   3. Có tài khoản con workers.dev chưa — chưa có thì đăng ký tên --tai-khoan-con.
 *   4. Ghi cấu hình relay/.wrangler.jsonc (không đưa vào git), wrangler deploy.
 *   5. Lần đầu (không có --chi-cap-nhat): sinh MÃ GHÉP NỐI 8 ký tự, chỉ lưu SHA-256
 *      của mã làm bí mật CLAIM_CODE_HASH của Worker; in mã MỘT LẦN cho người dùng.
 *   6. In địa chỉ cố định và kiểm tra /_gscb/health nếu mạng cho phép.
 * ========================================================================== */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELAY = path.join(ROOT, 'relay');
const args = process.argv.slice(2);
const opt = (name, def = '') => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const NAME = opt('--ten', 'thau');
const SUB = opt('--tai-khoan-con', '');
const UPDATE_ONLY = args.includes('--chi-cap-nhat');
const WRANGLER = ['--yes', 'wrangler@4'];
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1', EXPO_NO_TELEMETRY: '1' };
const fail = (m) => { console.error(`KHÔNG TRIỂN KHAI ĐƯỢC: ${m}`); process.exit(1); };
if (!/^[a-z][a-z0-9-]{1,40}$/.test(NAME)) fail('tên Worker chỉ gồm a-z, 0-9, dấu gạch.');
if (!process.env.CLOUDFLARE_API_TOKEN) fail('thiếu CLOUDFLARE_API_TOKEN.');

function wrangler(cmd, { input, capture = true } = {}) {
  const r = spawnSync('npx', [...WRANGLER, ...cmd], { cwd: RELAY, env, input, encoding: 'utf8', stdio: capture ? ['pipe', 'pipe', 'pipe'] : 'inherit', maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) fail(`wrangler ${cmd.join(' ')}:\n${(r.stdout || '') + (r.stderr || '')}`.slice(0, 3000));
  return (r.stdout || '') + (r.stderr || '');
}
async function cf(method, p, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${p}`, { method, headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok && j.success !== false, status: res.status, j };
}

// 1. Giao diện
console.log('1/6 Dựng giao diện iPhone/iPad…');
const build = path.join(RELAY, 'build');
fs.rmSync(build, { recursive: true, force: true });
execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', build], { cwd: path.join(ROOT, 'mobile-app'), env: { ...env, EXPO_PUBLIC_GSCB_MODE: 'remote' }, stdio: ['ignore', 'ignore', 'inherit'] });
if (!fs.existsSync(path.join(build, 'index.html')) || !fs.existsSync(path.join(build, 'sw.js'))) fail('bản dựng thiếu index.html / sw.js.');

// 2. Tài khoản + kho KV
console.log('2/6 Tài khoản Cloudflare và kho KV…');
const acc = await cf('GET', '/accounts?per_page=5');
if (!acc.ok || !acc.j.result?.length) fail(`token không đọc được tài khoản (HTTP ${acc.status}).`);
if (acc.j.result.length > 1 && !process.env.CLOUDFLARE_ACCOUNT_ID) fail('token thấy nhiều tài khoản — đặt CLOUDFLARE_ACCOUNT_ID.');
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || acc.j.result[0].id;
env.CLOUDFLARE_ACCOUNT_ID = ACCOUNT;
const list = await cf('GET', `/accounts/${ACCOUNT}/storage/kv/namespaces?per_page=100`);
let kv = (list.j.result || []).find((n) => n.title === 'gscb-dien-thoai');
if (!kv) {
  const made = await cf('POST', `/accounts/${ACCOUNT}/storage/kv/namespaces`, { title: 'gscb-dien-thoai' });
  if (!made.ok) fail(`không tạo được kho KV: ${JSON.stringify(made.j.errors || made.j).slice(0, 300)}`);
  kv = made.j.result;
}

// 3. Tài khoản con workers.dev
console.log('3/6 Tên miền workers.dev…');
let sub = (await cf('GET', `/accounts/${ACCOUNT}/workers/subdomain`)).j.result?.subdomain || '';
if (!sub) {
  if (!SUB) fail('tài khoản chưa có tên workers.dev — chạy lại với --tai-khoan-con <tên> (ví dụ truongan).');
  const put = await cf('PUT', `/accounts/${ACCOUNT}/workers/subdomain`, { subdomain: SUB });
  if (!put.ok) fail(`không đăng ký được ${SUB}.workers.dev: ${JSON.stringify(put.j.errors || put.j).slice(0, 300)}`);
  sub = SUB;
}
const URL_FIXED = `https://${NAME}.${sub}.workers.dev`;

// 4. Cấu hình + triển khai
console.log(`4/6 Triển khai ${URL_FIXED}…`);
const config = {
  name: NAME, main: 'src/worker.js', compatibility_date: '2025-06-01', workers_dev: true, account_id: ACCOUNT,
  assets: { directory: './build', binding: 'ASSETS', not_found_handling: 'single-page-application', run_worker_first: true },
  kv_namespaces: [{ binding: 'GSCB', id: kv.id }],
  observability: { enabled: false }
};
const cfgPath = path.join(RELAY, '.wrangler.jsonc');
fs.writeFileSync(cfgPath, `// SINH TỰ ĐỘNG bởi relay/trien-khai.mjs — không đưa vào git.\n${JSON.stringify(config, null, 2)}\n`);
wrangler(['deploy', '--config', cfgPath], { capture: false });

// 5. Mã ghép nối (lần đầu)
let code = '';
if (!UPDATE_ONLY) {
  console.log('5/6 Sinh mã ghép nối…');
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford: không I, L, O, U
  code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('');
  const hash = createHash('sha256').update(code).digest('hex');
  wrangler(['secret', 'put', 'CLAIM_CODE_HASH', '--config', cfgPath], { input: `${hash}\n` });
} else {
  console.log('5/6 Giữ mã ghép nối cũ (--chi-cap-nhat).');
}

// 6. Kiểm tra
console.log('6/6 Kiểm tra…');
let health = 'không gọi được từ máy này (mạng chặn workers.dev) — kiểm tra trên điện thoại.';
try {
  const r = await fetch(`${URL_FIXED}/_gscb/health`, { signal: AbortSignal.timeout(15000) });
  health = `${r.status} ${await r.text()}`;
} catch { /* mạng chặn */ }
console.log(`\nĐỊA CHỈ CỐ ĐỊNH: ${URL_FIXED}\nKiểm tra: ${health}`);
if (code) console.log(`MÃ GHÉP NỐI (chỉ hiện một lần): ${code.slice(0, 4)}-${code.slice(4)}`);
