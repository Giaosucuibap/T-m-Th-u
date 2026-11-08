/* ============================================================================
 *  LẤY HAI CẦU NỐI (.exe) ĐÃ BIÊN DỊCH VÀ ĐÃ KIỂM THỬ TRÊN CI WINDOWS
 *
 *  node tools/release/lay-cau-noi-tu-ci.mjs <mã-commit> <thư-mục-ra>
 *  node tools/release/lay-cau-noi-tu-ci.mjs --log <tệp-nhật-ký-việc-Windows> <thư-mục-ra>
 *
 *  Việc "Bộ kiểm thử (Windows)" biên dịch native-agent/NativeHost.cs (E-HSMT) và
 *  native-agent/DienThoai.cs (Link điện thoại, 4.20.0) bằng csc.exe, chạy toàn bộ bài
 *  kiểm thử trên đúng các tệp đó, rồi in từng tệp ra nhật ký dạng base64 kèm SHA-256
 *  (và lưu thành artifact). Công cụ này đọc nhật ký (qua `gh api`, hoặc tệp nhật ký đã
 *  tải sẵn với --log), ghép lại, và CHỈ ghi tệp khi mã băm + độ dài + chữ ký "MZ" đều
 *  khớp. Dùng khi máy đóng gói không tải được artifact (máy chủ lưu trữ bị chặn).
 * ========================================================================== */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.env.GSCB_REPO || 'giaosucuibap/t-m-th-u';
const gh = (p) => execFileSync('gh', ['api', p], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
export const CI_EXES = Object.freeze(['GiaoSuCuiBap.NativeHost.exe', 'GiaoSuCuiBap.DienThoai.exe']);

/** Khối "GSCB-EXE-BEGIN <sha256> <độ-dài-base64> [tên]" … "GSCB-EXE-END". Khối không tên (4.19.0) là cầu nối E-HSMT. */
export function extractExe(log, name = CI_EXES[0]) {
  const lines = String(log).split(/\r?\n/).map((l) => l.replace(/^\S+Z\s/, ''));
  let begin = -1;
  let hash = '';
  let len = 0;
  lines.forEach((l, i) => {
    if (begin >= 0 || !l.startsWith('GSCB-EXE-BEGIN ')) return;
    const [, h, n, file = CI_EXES[0]] = l.trim().split(/\s+/);
    if (file === name) { begin = i; hash = h; len = Number(n); }
  });
  if (begin < 0) throw new Error(`Nhật ký không có khối GSCB-EXE-BEGIN cho ${name}.`);
  let b64 = '';
  for (const l of lines.slice(begin + 1)) {
    if (l.startsWith('GSCB-EXE-END')) break;
    if (l.startsWith('GSCB-EXE ')) b64 += l.slice(9).trim();
  }
  if (b64.length !== len) throw new Error(`Độ dài base64 lệch: ${b64.length} ≠ ${len}.`);
  const bytes = Buffer.from(b64, 'base64');
  const got = createHash('sha256').update(bytes).digest('hex');
  if (got !== hash) throw new Error(`SHA-256 lệch: ${got} ≠ ${hash}.`);
  if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) throw new Error('Không phải tệp chạy Windows (thiếu chữ ký MZ).');
  return { bytes, hash };
}

function writeAll(log, outDir, source) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of CI_EXES) {
    const { bytes, hash } = extractExe(log, name);
    fs.writeFileSync(path.join(outDir, name), bytes);
    fs.writeFileSync(path.join(outDir, `${name}.sha256`), `${hash}  ${name}\n`);
    console.log(`Đã lấy ${name} từ CI (${source}): ${bytes.length} byte, SHA-256 ${hash}.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args[0] === '--log') {
    if (!args[1] || !args[2]) { console.error('Cách dùng: node tools/release/lay-cau-noi-tu-ci.mjs --log <tệp-nhật-ký> <thư-mục-ra>'); process.exit(2); }
    writeAll(fs.readFileSync(args[1], 'utf8'), args[2], `nhật ký ${path.basename(args[1])}`);
    process.exit(0);
  }
  const [sha, outDir] = args;
  if (!/^[0-9a-f]{7,40}$/.test(sha || '') || !outDir) { console.error('Cách dùng: node tools/release/lay-cau-noi-tu-ci.mjs <mã-commit> <thư-mục-ra>'); process.exit(2); }
  // GitHub chỉ lọc theo mã commit ĐẦY ĐỦ 40 ký tự; mã ngắn thì hỏi git trên máy.
  const full = sha.length === 40 ? sha : execFileSync('git', ['rev-parse', sha], { encoding: 'utf8' }).trim();
  const runs = JSON.parse(gh(`repos/${REPO}/actions/runs?head_sha=${full}&per_page=20`)).workflow_runs || [];
  let found = null;
  for (const run of runs) {
    const jobs = JSON.parse(gh(`repos/${REPO}/actions/runs/${run.id}/jobs`)).jobs || [];
    const win = jobs.find((j) => /Windows/.test(j.name) && j.conclusion === 'success');
    if (win) { found = { run, win }; break; }
  }
  if (!found) { console.error(`Chưa có việc Windows THÀNH CÔNG cho commit ${sha}.`); process.exit(1); }
  writeAll(gh(`repos/${REPO}/actions/jobs/${found.win.id}/logs`), outDir, `lượt ${found.run.id}, việc ${found.win.id}`);
}
