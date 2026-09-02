/* ============================================================================
 *  tools/render-icons.mjs — kết xuất icon-src/*.svg thành icons/*.png
 *
 *  Dùng chính Chromium để rasterise, nên không cần cài ImageMagick hay rsvg.
 *
 *  Cách chạy:   npm i -D playwright && node tools/render-icons.mjs ./icons
 *  Chỉ cần chạy lại khi SỬA file SVG trong tools/icon-src. Các tệp PNG kết quả
 *  đã được commit sẵn, nên người dùng cuối không phải chạy gì cả.
 * ========================================================================== */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SRC = new URL('./icon-src/', import.meta.url).pathname;
const OUT = process.argv[2] || 'icons';

const JOBS = [
  { svg: 'icon-16.svg',  png: 'icon16.png',  size: 16 },
  { svg: 'icon-32.svg',  png: 'icon32.png',  size: 32 },
  { svg: 'icon-48.svg',  png: 'icon48.png',  size: 48 },
  { svg: 'icon-128.svg', png: 'icon128.png', size: 128 },
  { svg: 'logo.svg',     png: 'logo.png',    size: 900, height: 420 }
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });

for (const j of JOBS) {
  const svg = fs.readFileSync(path.join(SRC, j.svg), 'utf8');
  const h = j.height || j.size;
  const page = await browser.newPage({
    viewport: { width: j.size, height: h },
    deviceScaleFactor: 1
  });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:${j.size}px;height:${h}px}</style>${svg}`,
    { waitUntil: 'load' }
  );
  await page.waitForTimeout(150);
  const buf = await page.screenshot({ omitBackground: true, type: 'png' });
  fs.writeFileSync(path.join(OUT, j.png), buf);
  console.log(`${j.png.padEnd(12)} ${j.size}x${h}  ${buf.length} bytes`);
  await page.close();
}

await browser.close();
