/* ============================================================================
 *  ĐÓNG GÓI BẢN PHÁT HÀNH
 *
 *  node tools/release/dong-goi.mjs <thư-mục-chứa-cầu-nối-từ-CI>
 *
 *  Gói gồm:
 *    - mọi tệp git đang theo dõi (trừ .github, .gitignore);
 *    - HAI cầu nối lấy từ CI Windows bằng tools/release/lay-cau-noi-tu-ci.mjs, mỗi tệp
 *      kèm .sha256: GiaoSuCuiBap.NativeHost.exe (E-HSMT) và GiaoSuCuiBap.DienThoai.exe
 *      (Link điện thoại, 4.20.0);
 *    - native-agent/web: giao diện iPhone của Link điện thoại, DỰNG NGAY TẠI ĐÂY từ
 *      mobile-app của đúng commit này, ở chế độ máy tính công ty
 *      (EXPO_PUBLIC_GSCB_MODE=remote; cần đã chạy `npm ci` trong mobile-app).
 *  Từ chối đóng gói khi:
 *    - cây làm việc có thay đổi chưa commit (gói phải đúng một commit);
 *    - tệp .exe không khớp mã SHA-256 ghi kèm, hoặc không phải tệp Windows;
 *    - phiên bản manifest.json khác package.json;
 *    - bản web dựng ra thiếu index.html hay thiếu mã chế độ máy tính công ty.
 *  Ghi dist/GiaoSuCuiBap-<phiên bản>.zip và in SHA-256 của gói.
 * ========================================================================== */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(new URL('../../', import.meta.url).pathname);
const exeDir = path.resolve(process.argv[2] || '');
const fail = (m) => { console.error(`KHÔNG ĐÓNG GÓI: ${m}`); process.exit(1); };
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const EXES = ['GiaoSuCuiBap.NativeHost.exe', 'GiaoSuCuiBap.DienThoai.exe'];

if (git('status', '--porcelain', '--untracked-files=no').trim()) fail('còn thay đổi chưa commit.');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'GiaoSuCuiBap/manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) fail(`manifest ${manifest.version} ≠ package ${pkg.version}.`);
const exeHashes = {};
for (const name of EXES) {
  const exe = path.join(exeDir, name);
  if (!fs.existsSync(exe) || !fs.existsSync(`${exe}.sha256`)) fail(`thiếu ${exe} hoặc tệp .sha256 — chạy tools/release/lay-cau-noi-tu-ci.mjs trước.`);
  const bytes = fs.readFileSync(exe);
  const want = fs.readFileSync(`${exe}.sha256`, 'utf8').trim().split(/\s+/)[0];
  const got = sha256(bytes);
  if (got !== want) fail(`SHA-256 ${name} lệch: ${got} ≠ ${want}.`);
  if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) fail(`${name} không phải tệp chạy Windows.`);
  exeHashes[name] = got;
}

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'gscb-goi-'));
const webOut = path.join(stage, 'native-agent', 'web');
console.log('Dựng giao diện iPhone (Link điện thoại) từ mobile-app…');
execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', webOut], {
  cwd: path.join(root, 'mobile-app'), stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, EXPO_PUBLIC_GSCB_MODE: 'remote', EXPO_NO_TELEMETRY: '1', CI: '1' }
});
const jsDir = path.join(webOut, '_expo', 'static', 'js', 'web');
if (!fs.existsSync(path.join(webOut, 'index.html')) || !fs.existsSync(jsDir)) fail('bản web dựng ra thiếu index.html hoặc mã.');
const bundle = fs.readdirSync(jsDir).map((f) => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n');
if (!bundle.includes('X-GSCB-Key') || !bundle.includes('/api/search')) fail('bản web không có mã chế độ máy tính công ty.');
let webFiles = 0;
(function count(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? count(path.join(d, e.name)) : webFiles++; })(webOut);

const files = git('ls-files', '-z').split('\0').filter((f) => f && !f.startsWith('.github/') && f !== '.gitignore');
for (const f of files) { fs.mkdirSync(path.dirname(path.join(stage, f)), { recursive: true }); fs.copyFileSync(path.join(root, f), path.join(stage, f)); }
for (const name of EXES) {
  fs.copyFileSync(path.join(exeDir, name), path.join(stage, 'native-agent', name));
  fs.copyFileSync(path.join(exeDir, `${name}.sha256`), path.join(stage, 'native-agent', `${name}.sha256`));
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', `GiaoSuCuiBap-${manifest.version}.zip`);
fs.rmSync(out, { force: true });
execFileSync('zip', ['-q', '-r', '-X', out, '.'], { cwd: stage });
fs.rmSync(stage, { recursive: true, force: true });
const zipHash = sha256(fs.readFileSync(out));
console.log(`Đã đóng gói ${path.relative(root, out)} — ${files.length + EXES.length * 2 + webFiles} tệp (gồm ${webFiles} tệp giao diện iPhone), ${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB`);
console.log(`Commit ${git('rev-parse', '--short', 'HEAD').trim()} · ${EXES.map((n) => `${n} SHA-256 ${exeHashes[n]}`).join(' · ')} · gói SHA-256 ${zipHash}`);
