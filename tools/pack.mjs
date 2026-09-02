/* ============================================================================
 *  tools/pack.mjs — đóng gói tiện ích thành tệp .zip cài được
 *
 *      node tools/pack.mjs            -> dist/GiaoSuCuiBap-<version>.zip
 *      node tools/pack.mjs /duong/dan -> ghi vào thư mục khác
 *
 *  Chỉ đưa vào gói những gì Chrome thật sự cần chạy. Danh sách loại trừ dưới
 *  đây PHẢI khớp với NON_SHIPPED_DIRS trong tests/structure.test.js — nếu lệch,
 *  hoặc là gói mang theo mã kiểm thử, hoặc là bài kiểm tra cấu trúc soi nhầm
 *  các tệp không được đóng gói (đúng lỗi từng xảy ra với trang e-GP giả lập).
 * ========================================================================== */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(process.argv[2] || join(ROOT, 'dist'));

/** Thư mục và tệp KHÔNG đóng gói. Đồng bộ với tests/structure.test.js. */
const EXCLUDE = new Set([
  'tests', 'test', 'tools', 'scripts', 'node_modules', 'dist',
  '.git', '.github', '.gitignore',
  'package.json', 'package-lock.json',
  'CHANGELOG.md', 'README.md', 'BAO-CAO-DANH-GIA.md', 'KIEM-THU-PHAT-HANH.md'
]);

const version = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')).version;
const name = `GiaoSuCuiBap-${version}`;

const stage = mkdtempSync(join(tmpdir(), 'gscb-pack-'));
const dest = join(stage, 'GiaoSuCuiBap');

cpSync(ROOT, dest, {
  recursive: true,
  filter: (src) => {
    const rel = src.slice(ROOT.length + 1);
    if (!rel) return true;
    return !EXCLUDE.has(rel.split(/[\\/]/)[0]);
  }
});

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const zipPath = join(OUT_DIR, `${name}.zip`);
rmSync(zipPath, { force: true });

execFileSync('zip', ['-qr', zipPath, 'GiaoSuCuiBap'], { cwd: stage });
rmSync(stage, { recursive: true, force: true });

console.log(`Đã đóng gói: ${zipPath}`);
