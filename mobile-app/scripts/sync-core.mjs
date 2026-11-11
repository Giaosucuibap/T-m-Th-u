/* ============================================================================
 *  ĐỒNG BỘ LÕI TỪ TIỆN ÍCH SANG APP DI ĐỘNG
 *
 *  node scripts/sync-core.mjs          chép lại
 *  node scripts/sync-core.mjs --check  chỉ kiểm tra (lệch là thoát mã 1)
 *
 *  App KHÔNG viết lại logic tra cứu: nó dùng NGUYÊN VĂN các tệp đã kiểm thử của
 *  tiện ích Chrome —
 *    - lib/*.js (dựng truy vấn e-GP, chuẩn hoá gói thầu, lọc tiêu chí, đối soát);
 *    - page-hook.js + content.js (chạy trong trang e-GP, gắn tiêu chí vào chính
 *      yêu cầu tìm kiếm của e-GP) — ở app, hai tệp này được tiêm vào khung trình
 *      duyệt nhúng (WebView) qua src/egp/injected.generated.js.
 *  Sửa lõi ở tiện ích rồi chạy lại lệnh này; bài kiểm thử chặn hai bên lệch nhau.
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.resolve(APP, '../GiaoSuCuiBap');
const OUT_LIB = path.join(APP, 'src/core/egp');
const OUT_INJECTED = path.join(APP, 'src/egp/injected.generated.js');
const ENTRIES = ['lib/kqlcnt.js', 'lib/core.js', 'lib/hard-filter.js', 'lib/match-gate.js', 'lib/workspace.js',
  'lib/quick-find-core.js', 'lib/tender-categories.js', 'lib/area-match.js', 'lib/lifecycle.js'];
const check = process.argv.includes('--check');
const sha = (s) => createHash('sha256').update(s).digest('hex');

/** Các tệp lib cần chép: điểm vào + mọi tệp chúng import (đệ quy). */
export function libClosure() {
  const seen = new Set();
  const walk = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const src = fs.readFileSync(path.join(EXT, rel), 'utf8');
    for (const m of src.matchAll(/^\s*(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]/gm)) walk(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
  };
  ENTRIES.forEach(walk);
  return [...seen].sort();
}

export function injectedModule() {
  const hook = fs.readFileSync(path.join(EXT, 'page-hook.js'), 'utf8');
  const content = fs.readFileSync(path.join(EXT, 'content.js'), 'utf8');
  const version = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')).version;
  return `/* TỆP SINH TỰ ĐỘNG bởi scripts/sync-core.mjs — KHÔNG sửa tay.
   Nguyên văn page-hook.js và content.js của tiện ích Giáo Sư Cùi Bắp ${version}.
   page-hook.js sha256 ${sha(hook)}
   content.js   sha256 ${sha(content)} */
export const EXTENSION_VERSION = ${JSON.stringify(version)};
export const PAGE_HOOK_SOURCE = ${JSON.stringify(hook)};
export const CONTENT_SOURCE = ${JSON.stringify(content)};
`;
}

function main() {
  const drift = [];
  const files = libClosure();
  for (const rel of files) {
    const from = path.join(EXT, rel);
    const to = path.join(OUT_LIB, path.relative('lib', rel));
    const src = fs.readFileSync(from);
    const cur = fs.existsSync(to) ? fs.readFileSync(to) : null;
    if (!cur || !cur.equals(src)) {
      drift.push(rel);
      if (!check) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, src); }
    }
  }
  // Tệp thừa (lõi tiện ích đã bỏ) cũng là lệch.
  if (fs.existsSync(OUT_LIB)) {
    const wanted = new Set(files.map((f) => path.relative('lib', f)));
    for (const f of fs.readdirSync(OUT_LIB, { recursive: true })) {
      const rel = String(f);
      if (rel.endsWith('.js') && !wanted.has(rel)) { drift.push(`thừa: ${rel}`); if (!check) fs.rmSync(path.join(OUT_LIB, rel)); }
    }
  }
  const injected = injectedModule();
  const curInjected = fs.existsSync(OUT_INJECTED) ? fs.readFileSync(OUT_INJECTED, 'utf8') : '';
  if (curInjected !== injected) { drift.push('src/egp/injected.generated.js'); if (!check) { fs.mkdirSync(path.dirname(OUT_INJECTED), { recursive: true }); fs.writeFileSync(OUT_INJECTED, injected); } }
  if (check) {
    if (drift.length) { console.error(`Lõi app LỆCH với tiện ích: ${drift.join(', ')} — chạy: node scripts/sync-core.mjs`); process.exit(1); }
    console.log(`Lõi app khớp tiện ích (${files.length} tệp lib + page-hook.js + content.js).`);
  } else console.log(drift.length ? `Đã đồng bộ: ${drift.join(', ')}` : 'Không có gì thay đổi.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
