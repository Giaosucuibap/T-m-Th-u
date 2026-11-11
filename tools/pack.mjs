/* ============================================================================
 *  tools/pack.mjs — đóng gói bản giao
 *
 *      node tools/pack.mjs            -> dist/GiaoSuCuiBap-<version>.zip
 *      node tools/pack.mjs /duong/dan -> ghi vào thư mục khác
 *
 *  Bố cục giữ đúng như gói tác giả gửi từ 4.16.0:
 *
 *      GiaoSuCuiBap/   tiện ích — đây là thư mục chọn ở "Tải tiện ích đã giải nén"
 *      tests/ tools/   bộ kiểm thử và công cụ — để người sau chạy lại được
 *      native-agent/   cầu nối E-HSMT cho Windows
 *      *.md            hướng dẫn, báo cáo, nhật ký thay đổi
 *
 *  KHÔNG đóng gói `evidence/`: đó là bằng chứng chạy trên e-GP thật, gắn với mã
 *  băm từng tệp nguồn của MỘT phiên bản. Mang bằng chứng của bản cũ sang bản
 *  mới là nói một điều không đúng — và cổng phát hành tools/check-live-evidence.py
 *  sẽ chặn đúng chỗ đó ("Unit source mismatch").
 * ========================================================================== */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(process.argv[2] || join(ROOT, 'dist'));
const version = JSON.parse(readFileSync(join(ROOT, 'GiaoSuCuiBap', 'manifest.json'), 'utf8')).version;

/** Mục ở gốc kho được đưa vào gói. */
const INCLUDE = ['GiaoSuCuiBap', 'tests', 'tools', 'native-agent', 'package.json', 'README.md', 'CHANGELOG.md'];
/** Trong các mục trên, loại những thứ sinh ra khi chạy hoặc chỉ có trên máy này. */
const SKIP = [/(^|\/)node_modules(\/|$)/, /^tools\/test\/certs(\/|$)/, /(^|\/)test-results(\/|$)/, /\.profile-/];

const stage = mkdtempSync(join(tmpdir(), 'gscb-pack-'));
const docs = execFileSync('ls', [ROOT], { encoding: 'utf8' }).split('\n')
  .filter((f) => /^(HUONG-DAN|BAO-CAO)-[\w.-]+\.md$/.test(f));

for (const item of [...INCLUDE, ...docs]) {
  const src = join(ROOT, item);
  if (!existsSync(src)) continue;
  cpSync(src, join(stage, item), {
    recursive: true,
    dereference: false,
    filter: (p) => !SKIP.some((re) => re.test(p.slice(ROOT.length + 1)))
  });
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const zipPath = join(OUT_DIR, `GiaoSuCuiBap-${version}.zip`);
rmSync(zipPath, { force: true });
execFileSync('zip', ['-qr', zipPath, '.'], { cwd: stage });
rmSync(stage, { recursive: true, force: true });
console.log(`Đã đóng gói: ${zipPath}`);
