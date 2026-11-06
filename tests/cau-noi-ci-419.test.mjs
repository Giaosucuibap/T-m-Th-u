/* ============================================================================
 *  GÓI CÀI KÈM CẦU NỐI E-HSMT ĐÃ KIỂM THỬ — 4.19.0
 *
 *  4.18.0 thiếu GiaoSuCuiBap.NativeHost.exe trong gói. Nay CI Windows biên dịch từ
 *  mã nguồn, chạy bộ kiểm thử trên đúng tệp đó, rồi giữ tệp (artifact + nhật ký
 *  base64 kèm SHA-256). Bài này khoá: thứ tự "kiểm thử rồi mới giữ tệp", và công
 *  cụ lấy tệp từ nhật ký chỉ chấp nhận tệp khớp mã băm, độ dài và chữ ký MZ.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { extractExe } from '../tools/release/lay-cau-noi-tu-ci.mjs';

const ci = fs.readFileSync(new URL('../.github/workflows/kiem-thu.yml', import.meta.url), 'utf8');

test('CI Windows: biên dịch → npm test → mới lưu tệp (artifact + base64 + SHA-256)', () => {
  const win = ci.slice(ci.indexOf('  windows:'), ci.indexOf('  trinh-duyet:'));
  const order = ['csc.exe', 'run: npm test', 'Get-FileHash', 'GSCB-EXE-BEGIN', 'actions/upload-artifact@v4'].map((k) => win.indexOf(k));
  assert.ok(order.every((i) => i > 0), 'đủ các bước');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'tệp chỉ được giữ SAU khi bộ kiểm thử Windows đạt');
  assert.match(win, /if-no-files-found: error/);
});

function fakeLog(bytes, { tamper = false } = {}) {
  const hash = createHash('sha256').update(bytes).digest('hex');
  const b64 = bytes.toString('base64');
  const ts = '2026-11-06T20:04:07.5205302Z ';
  const lines = [`${ts}GSCB-EXE-BEGIN ${hash} ${b64.length}`];
  for (let i = 0; i < b64.length; i += 40) lines.push(`${ts}GSCB-EXE ${tamper && i === 0 ? 'A' + b64.slice(i + 1, i + 40) : b64.slice(i, i + 40)}`);
  lines.push(`${ts}GSCB-EXE-END`);
  return ['noise', ...lines, 'more noise'].join('\r\n');
}

test('lấy tệp từ nhật ký: đúng từng byte khi khớp; từ chối khi lệch mã băm hoặc không phải tệp Windows', () => {
  const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(300, 7)]);
  const got = extractExe(fakeLog(exe));
  assert.ok(got.bytes.equals(exe));
  assert.throws(() => extractExe(fakeLog(exe, { tamper: true })), /SHA-256 lệch/);
  assert.throws(() => extractExe(fakeLog(Buffer.alloc(100, 1))), /MZ/);
  assert.throws(() => extractExe('không có gì'), /GSCB-EXE-BEGIN/);
});
