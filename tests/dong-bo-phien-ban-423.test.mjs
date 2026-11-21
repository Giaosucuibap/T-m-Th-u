/* ============================================================================
 *  4.23.0 — ĐỔI SỐ PHIÊN BẢN THÌ PHẢI ĐỒNG BỘ LÕI CHO APP DI ĐỘNG
 *
 *  mobile-app/src/egp/injected.generated.js chép nguyên văn page-hook.js + content.js của tiện ích và GHI
 *  KÈM SỐ PHIÊN BẢN. CI của 4.23.0 đỏ ngay phút đầu ("Lõi app LỆCH với tiện ích") vì số phiên bản đã lên
 *  4.23.0 mà tệp đó còn ghi 4.22.0 — `npm test` ở gốc kho không kiểm chuyện này nên chạy tại chỗ vẫn xanh.
 *  Bài này đưa phép kiểm đó vào `npm test`: quên chạy `node mobile-app/scripts/sync-core.mjs` là thấy ngay.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('lõi app di động ghi đúng số phiên bản của tiện ích (đổi phiên bản xong phải chạy mobile-app/scripts/sync-core.mjs)', () => {
  const version = JSON.parse(read('GiaoSuCuiBap/manifest.json')).version;
  const generated = read('mobile-app/src/egp/injected.generated.js');
  assert.ok(generated.includes(`export const EXTENSION_VERSION = ${JSON.stringify(version)};`),
    `mobile-app/src/egp/injected.generated.js chưa theo phiên bản ${version} — chạy: node mobile-app/scripts/sync-core.mjs`);
  assert.ok(generated.includes(`Giáo Sư Cùi Bắp ${version}.`));
});
