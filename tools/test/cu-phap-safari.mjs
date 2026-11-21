/* ============================================================================
 *  BẢN SAFARI — SOÁT CÚ PHÁP Ở MỨC SAFARI 16.4 (4.22.0)
 *
 *  node tools/test/cu-phap-safari.mjs
 *
 *  Dấu trang nạp một tệp duy nhất rồi chạy. Một dòng cú pháp mà Safari trên máy người dùng
 *  chưa hiểu là CẢ TỆP không chạy: chạm dấu trang mà không có gì xảy ra, và cơ chế "hỏi
 *  trước khi cập nhật / quay về bản trước" cũng nằm trong chính tệp đó nên không cứu được.
 *  Bộ thử WebKit của kho dùng nhân mới (2.52) nên KHÔNG bắt được loại lỗi này.
 *
 *  Bài này phân tích bằng acorn ở mức ES2023 — mức Safari 16.4 (mốc tối thiểu của bản
 *  Safari) hiểu trọn:
 *    - từng tệp JS đúng như được gói (sau khi đổi import, chèn lớp location);
 *    - tệp gói dựng từ mã nguồn hiện tại;
 *    - tệp ổn định đang phát hành trong safari/dist.
 *  Cú pháp mới hơn (cờ v của biểu thức chính quy, using, import attributes, nhóm trùng tên…)
 *  bị từ chối. Bài này KHÔNG soát được API (hàm chưa có trên máy cũ): phần đó có danh sách
 *  cấm trong tests/safari-toi-thieu-422.test.mjs.
 *
 *  acorn lấy từ thư viện của mobile-app (có trong package-lock; CI đã `npm ci` ở đó).
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildPack } from '../../safari/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ES = 2023;

let acorn;
try { acorn = createRequire(path.join(ROOT, 'mobile-app', 'package.json'))('acorn'); }
catch {
  console.error('Thiếu acorn: chạy `npm ci` trong mobile-app trước (acorn nằm trong package-lock của app).');
  process.exit(2);
}

/** Phân tích một đoạn mã; trả '' nếu được, hoặc thông báo lỗi kèm dòng:cột. */
function syntaxProblem(code, { module = false } = {}) {
  try {
    acorn.parse(code, { ecmaVersion: ES, sourceType: module ? 'module' : 'script', allowHashBang: true });
    return '';
  } catch (error) { return String(error && error.message || error); }
}

const problems = [];
const { code, pack } = buildPack();
let count = 0;
for (const [rel, entry] of Object.entries(pack.files)) {
  if (!rel.endsWith('.js') || typeof entry.s !== 'string') continue;
  count++;
  const problem = syntaxProblem(entry.s, { module: Boolean(entry.m) });
  if (problem) problems.push(`${rel}${entry.m ? ' (mô-đun)' : ''}: ${problem}`);
}
const bundleProblem = syntaxProblem(code);
if (bundleProblem) problems.push(`tệp gói dựng từ mã nguồn (cuibap.js ${pack.version} · ${pack.build}): ${bundleProblem}`);

const stableFile = path.join(ROOT, 'safari', 'dist', 'cuibap.js');
let stableNote = 'không có safari/dist/cuibap.js';
if (fs.existsSync(stableFile)) {
  const stable = fs.readFileSync(stableFile, 'utf8');
  const stableProblem = syntaxProblem(stable);
  const head = /Giáo Sư Cùi Bắp (\d+\.\d+\.\d+)[^\n]*?Bản dựng ([0-9a-f]{12})/.exec(stable.slice(0, 600));
  stableNote = head ? `${head[1]} · ${head[2]}` : 'không đọc được phiên bản';
  if (stableProblem) problems.push(`bản ổn định safari/dist/cuibap.js (${stableNote}): ${stableProblem}`);
}

// Phép kiểm phải thật sự bắt được cú pháp mới: ba mẫu dưới đây PHẢI bị từ chối ở ES2023.
const probes = [['cờ v của biểu thức chính quy', 'const r = /[\\p{L}--[a-z]]/v;'], ['khai báo using', '{ using x = f(); }'], ['import attributes', 'import data from "./a.json" with { type: "json" };']];
for (const [name, sample] of probes) {
  if (!syntaxProblem(sample, { module: true })) problems.push(`phép kiểm mất tác dụng: mẫu "${name}" lẽ ra phải bị từ chối ở ES${ES}`);
}

if (problems.length) {
  console.log(`HỎNG — ${problems.length} chỗ Safari 16.4 không đọc được:`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`ĐẠT — ${count} tệp JS trong gói, tệp gói ${pack.version} · ${pack.build} và bản ổn định ${stableNote} đều phân tích được ở ES${ES} (acorn ${acorn.version}).`);
