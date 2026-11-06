/* ============================================================================
 *  ĐÓNG GÓI BẢN PHÁT HÀNH
 *
 *  node tools/release/dong-goi.mjs <thư-mục-chứa-cầu-nối-từ-CI>
 *
 *  Gói = mọi tệp git đang theo dõi (trừ .github, .gitignore) + cầu nối E-HSMT
 *  GiaoSuCuiBap.NativeHost.exe và tệp .sha256 lấy từ CI Windows bằng
 *  tools/release/lay-cau-noi-tu-ci.mjs. Từ chối đóng gói khi:
 *    - cây làm việc có thay đổi chưa commit (gói phải đúng một commit);
 *    - tệp .exe không khớp mã SHA-256 ghi kèm, hoặc không phải tệp Windows;
 *    - phiên bản manifest.json khác package.json.
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

if (git('status', '--porcelain', '--untracked-files=no').trim()) fail('còn thay đổi chưa commit.');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'GiaoSuCuiBap/manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) fail(`manifest ${manifest.version} ≠ package ${pkg.version}.`);
const exe = path.join(exeDir, 'GiaoSuCuiBap.NativeHost.exe');
const shaFile = `${exe}.sha256`;
if (!fs.existsSync(exe) || !fs.existsSync(shaFile)) fail(`thiếu ${exe} hoặc tệp .sha256 — chạy tools/release/lay-cau-noi-tu-ci.mjs trước.`);
const bytes = fs.readFileSync(exe);
const want = fs.readFileSync(shaFile, 'utf8').trim().split(/\s+/)[0];
const got = createHash('sha256').update(bytes).digest('hex');
if (got !== want) fail(`SHA-256 cầu nối lệch: ${got} ≠ ${want}.`);
if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) fail('cầu nối không phải tệp chạy Windows.');

const files = git('ls-files', '-z').split('\0').filter((f) => f && !f.startsWith('.github/') && f !== '.gitignore');
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'gscb-goi-'));
for (const f of files) { fs.mkdirSync(path.dirname(path.join(stage, f)), { recursive: true }); fs.copyFileSync(path.join(root, f), path.join(stage, f)); }
fs.copyFileSync(exe, path.join(stage, 'native-agent/GiaoSuCuiBap.NativeHost.exe'));
fs.copyFileSync(shaFile, path.join(stage, 'native-agent/GiaoSuCuiBap.NativeHost.exe.sha256'));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', `GiaoSuCuiBap-${manifest.version}.zip`);
fs.rmSync(out, { force: true });
execFileSync('zip', ['-q', '-r', '-X', out, '.'], { cwd: stage });
fs.rmSync(stage, { recursive: true, force: true });
const zipHash = createHash('sha256').update(fs.readFileSync(out)).digest('hex');
console.log(`Đã đóng gói ${path.relative(root, out)} — ${files.length + 2} tệp, ${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB`);
console.log(`Commit ${git('rev-parse', '--short', 'HEAD').trim()} · cầu nối SHA-256 ${got} · gói SHA-256 ${zipHash}`);
