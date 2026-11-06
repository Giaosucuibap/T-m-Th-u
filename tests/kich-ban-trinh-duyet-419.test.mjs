/* ============================================================================
 *  CANH GÁC KỊCH BẢN TRÌNH DUYỆT (4.19.0)
 *
 *  Lỗi đã gặp trên CI: page.waitForFunction của Playwright 1.48.2 (bản CI cài)
 *  phải eval chuỗi bên trong trang; trang tiện ích có CSP script-src 'self' nên
 *  Chrome chặn ("Refused to evaluate a string as JavaScript"). Máy phát triển
 *  dùng Playwright 1.63 nên không thấy. Kịch bản phải hỏi lặp bằng page.evaluate.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('kịch bản trình duyệt không dùng page.waitForFunction (bị CSP trang tiện ích chặn trên Playwright của CI)', () => {
  const dir = new URL('../tools/test/', import.meta.url);
  const bad = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.mjs'))) {
    fs.readFileSync(new URL(f, dir), 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').trim();
      if (/\.waitForFunction\(/.test(code) && !/^\*|^\/\*/.test(code)) bad.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});
