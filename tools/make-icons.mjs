/* ============================================================================
 *  SINH BỘ ICON TỪ MỘT NGUỒN DUY NHẤT
 *
 *  VÌ SAO CẦN TỆP NÀY: bộ icon cũ được vẽ rời từng cỡ, và kết quả là ba cái
 *  dấu KHÁC NHAU cùng đại diện một phần mềm —
 *
 *      16px, 32px : vòng tròn + dấu tích
 *      48px       : thêm vạch ngắm và khung tài liệu, chen chúc, rối
 *      128px      : một cảnh radar khác hẳn
 *
 *  Người dùng nhận ra phần mềm bằng cái dấu trên thanh công cụ. Dấu đổi hình
 *  tuỳ chỗ xuất hiện thì họ không nhận ra, và trông như ba sản phẩm.
 *
 *  NGUYÊN TẮC Ở ĐÂY — GIẢN LƯỢC DẦN, KHÔNG ĐỔI DÁNG:
 *
 *    • DÁNG CỐT LÕI giữ nguyên ở mọi cỡ: vòng radar + dấu tích vàng. Nhìn
 *      thoáng ở 16px hay 128px đều nhận ra cùng một hình.
 *    • Chi tiết THÊM VÀO theo cỡ, không thay thế: vạch ngắm từ 48px, chấm quét
 *      và vòng ngoài từ 96px. Cỡ càng nhỏ càng bỏ bớt, chứ không vẽ hình khác.
 *    • Nét đậm dần theo tỉ lệ nghịch với cỡ: ở 16px một nét 4/128 chỉ còn nửa
 *      điểm ảnh và biến thành vệt xám. Nên nét được khai theo từng cỡ.
 *
 *  CHẠY:  node tools/make-icons.mjs
 *  Cần Chromium của Playwright (đã có sẵn trong môi trường phát triển).
 * ========================================================================== */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'icons');

/** Bảng màu thương hiệu — cùng tông với giao diện (xanh #0F766E). */
const MAU = {
  nen1: '#14564A', nen2: '#06302A',
  vongNgoai: '#5FBFA0', vongTrong: '#A8E3C4',
  vach: '#DCEFD2', tich: '#EFC75E', giay: '#F3F7DE'
};

/**
 * Dựng SVG cho một cỡ.
 * @param {number} size    cỡ ảnh
 * @param {object} chiTiet mức chi tiết: vach = vạch ngắm, giay = khung tài liệu,
 *                         vongNgoai = vòng radar ngoài, cham = chấm quét
 */
function svg(size, { vach, giay, vongNgoai, cham }, net) {
  const r = size >= 64 ? 30 : size >= 32 ? 28 : 26; // bo góc theo tỉ lệ 128
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs><linearGradient id="g" x2="1" y2="1">
    <stop stop-color="${MAU.nen1}"/><stop offset="1" stop-color="${MAU.nen2}"/>
  </linearGradient></defs>
  <rect width="128" height="128" rx="${r}" fill="url(#g)"/>
  ${vongNgoai ? `<circle cx="62" cy="64" r="44" fill="none" stroke="${MAU.vongNgoai}" stroke-width="${net.mo}" opacity=".40"/>` : ''}
  <circle cx="62" cy="64" r="${vach ? 30 : 33}" fill="none" stroke="${MAU.vongTrong}" stroke-width="${net.vong}"/>
  ${vach ? `<path d="M62 22v10M20 64h10M62 96v10M94 64h10" stroke="${MAU.vach}" stroke-width="${net.vach}" stroke-linecap="round" opacity=".85"/>` : ''}
  ${giay ? `<path d="M50 50h26v40H40V62" fill="none" stroke="${MAU.giay}" stroke-width="${net.giay}" stroke-linejoin="round" opacity=".75"/>` : ''}
  <path d="m44 65 14 15 30-38" fill="none" stroke="${MAU.tich}" stroke-width="${net.tich}" stroke-linecap="round" stroke-linejoin="round"/>
  ${cham ? `<circle cx="96" cy="33" r="8" fill="${MAU.tich}"/>` : ''}
</svg>`;
}

/* Mức chi tiết và độ dày nét cho từng cỡ. Nét khai theo hệ toạ độ 128, nên ở
   cỡ nhỏ phải khai dày hơn để sau khi thu còn nhìn thấy. */
const CO = [
  { size: 16,  chiTiet: { vach: false, giay: false, vongNgoai: false, cham: false }, net: { vong: 9,  tich: 13, vach: 0, giay: 0, mo: 0 } },
  { size: 32,  chiTiet: { vach: false, giay: false, vongNgoai: false, cham: false }, net: { vong: 7,  tich: 11, vach: 0, giay: 0, mo: 0 } },
  { size: 48,  chiTiet: { vach: true,  giay: false, vongNgoai: false, cham: false }, net: { vong: 6,  tich: 10, vach: 5, giay: 0, mo: 0 } },
  { size: 128, chiTiet: { vach: true,  giay: true,  vongNgoai: true,  cham: true  }, net: { vong: 5,  tich: 8,  vach: 4, giay: 5, mo: 4 } }
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
for (const { size, chiTiet, net } of CO) {
  const markup = svg(size, chiTiet, net);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>${markup}`);
  await page.screenshot({ path: path.join(OUT, `icon${size}.png`), omitBackground: true });
  console.log(`icon${size}.png`);
}
// Dấu thương hiệu dùng trong giao diện: bản đầy đủ, dạng vector.
fs.writeFileSync(path.join(OUT, 'brand-mark.svg'), svg(128, CO[3].chiTiet, CO[3].net).trim() + '\n');
fs.writeFileSync(path.join(OUT, 'brand-mark-small.svg'), svg(32, CO[1].chiTiet, CO[1].net).trim() + '\n');
console.log('brand-mark.svg, brand-mark-small.svg');
await browser.close();
