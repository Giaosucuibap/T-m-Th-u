/* ============================================================================
 *  LẤY CẦU NỐI E-HSMT (.exe) ĐÃ BIÊN DỊCH VÀ ĐÃ KIỂM THỬ TRÊN CI WINDOWS
 *
 *  node tools/release/lay-cau-noi-tu-ci.mjs <mã-commit> <thư-mục-ra>
 *
 *  Việc "Bộ kiểm thử (Windows)" biên dịch native-agent/NativeHost.cs bằng csc.exe,
 *  chạy toàn bộ bài kiểm thử trên đúng tệp đó, rồi in tệp ra nhật ký dạng base64
 *  kèm SHA-256 (và lưu thành artifact). Công cụ này đọc nhật ký qua `gh api`,
 *  ghép lại, và CHỈ ghi tệp khi mã băm + độ dài + chữ ký "MZ" đều khớp.
 *  Dùng khi máy đóng gói không tải được artifact (máy chủ lưu trữ bị chặn).
 * ========================================================================== */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.env.GSCB_REPO || 'giaosucuibap/t-m-th-u';
const gh = (p) => execFileSync('gh', ['api', p], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

export function extractExe(log) {
  const lines = String(log).split(/\r?\n/).map((l) => l.replace(/^\S+Z\s/, ''));
  const begin = lines.findIndex((l) => l.startsWith('GSCB-EXE-BEGIN '));
  if (begin < 0) throw new Error('Nhật ký không có khối GSCB-EXE-BEGIN.');
  const [, hash, len] = lines[begin].split(' ');
  let b64 = '';
  for (const l of lines.slice(begin + 1)) {
    if (l.startsWith('GSCB-EXE-END')) break;
    if (l.startsWith('GSCB-EXE ')) b64 += l.slice(9).trim();
  }
  if (b64.length !== Number(len)) throw new Error(`Độ dài base64 lệch: ${b64.length} ≠ ${len}.`);
  const bytes = Buffer.from(b64, 'base64');
  const got = createHash('sha256').update(bytes).digest('hex');
  if (got !== hash) throw new Error(`SHA-256 lệch: ${got} ≠ ${hash}.`);
  if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) throw new Error('Không phải tệp chạy Windows (thiếu chữ ký MZ).');
  return { bytes, hash };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [sha, outDir] = process.argv.slice(2);
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
  const { bytes, hash } = extractExe(gh(`repos/${REPO}/actions/jobs/${found.win.id}/logs`));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'GiaoSuCuiBap.NativeHost.exe'), bytes);
  fs.writeFileSync(path.join(outDir, 'GiaoSuCuiBap.NativeHost.exe.sha256'), `${hash}  GiaoSuCuiBap.NativeHost.exe\n`);
  console.log(`Đã lấy cầu nối từ CI: lượt ${found.run.id}, việc ${found.win.id} (${found.win.name}), ${bytes.length} byte, SHA-256 ${hash}.`);
}
