/* ============================================================================
 *  lib/brandlogo.js — XỬ LÝ ẢNH LOGO NGƯỜI DÙNG NẠP
 *
 *  Ba việc, tách riêng để kiểm thử được:
 *    1. Thu nhỏ ảnh về kích thước hợp lý (ảnh gốc có thể 4000px, nặng vô ích).
 *    2. Xoá nền trắng thành trong suốt — logo thường được lưu trên nền trắng,
 *       để nguyên thì trang hiện một ô vuông trắng thay vì logo chìm.
 *    3. Trả về data URL để lưu vào chrome.storage.
 *
 *  Chạy trong trang tiện ích (có <canvas>), KHÔNG chạy trong service worker.
 * ========================================================================== */

export const LOGO_MAX_SIDE = 900;      // cạnh dài nhất sau khi thu nhỏ
export const LOGO_MAX_BYTES = 4e6;     // trần an toàn cho một mục trong storage

/**
 * Ngưỡng coi là "nền trắng". Ảnh JPEG nén thường có nền 248–255 chứ không
 * đúng 255, nên phải để ngưỡng dưới 255. 236 là mức bắt được nền JPEG mà
 * chưa ăn vào phần sáng của logo.
 */
export const WHITE_CUTOFF = 236;

/**
 * Bề rộng dải chuyển tiếp, tính NGAY DƯỚI ngưỡng.
 *
 * Đây là chỗ bản đầu tôi làm sai: tôi cho mờ dần TỪ ngưỡng LÊN 255, nên nền
 * trắng JPEG ở mức 250 chỉ mờ đi còn ~26% đục — ô vuông trắng vẫn hiện rõ,
 * đúng thứ mà tính năng này sinh ra để dẹp. Kiểm thử bắt được.
 *
 * Đúng ra phải ngược lại: từ ngưỡng trở lên là NỀN, xoá hẳn; dải mềm nằm ở
 * phía dưới ngưỡng để viền logo không bị răng cưa.
 */
export const WHITE_FEATHER = 22;

/**
 * Xoá nền trắng khỏi dữ liệu điểm ảnh, tại chỗ.
 *
 * Chỉ đụng tới điểm ảnh mà CẢ BA kênh R,G,B đều sáng — tức trắng hoặc gần
 * trắng, không phải màu sáng có sắc độ. Vàng nhạt (255,240,150) có kênh xanh
 * lam tối nên được giữ nguyên; đó là lý do xét theo kênh tối nhất.
 *
 * @param {Uint8ClampedArray} data - dữ liệu RGBA từ ImageData
 * @param {number} cutoff - từ mức này trở lên coi là nền, 0..255
 * @returns {number} số điểm ảnh đã thành trong suốt hoàn toàn
 */
export function stripWhite(data, cutoff = WHITE_CUTOFF) {
  const floor = cutoff - WHITE_FEATHER;
  let cleared = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lo = Math.min(data[i], data[i + 1], data[i + 2]);
    if (lo >= cutoff) {                 // nền: xoá hẳn
      data[i + 3] = 0;
      cleared += 1;
    } else if (lo > floor) {            // sát nền: mờ dần cho mượt viền
      const keep = (cutoff - lo) / WHITE_FEATHER;   // 1 ở đáy dải → 0 ở ngưỡng
      data[i + 3] = data[i + 3] * keep;
      if (data[i + 3] <= 2) cleared += 1;
    }
  }
  return cleared;
}

/**
 * Tính kích thước sau khi thu nhỏ, giữ nguyên tỷ lệ.
 * Ảnh nhỏ hơn giới hạn thì để nguyên, không phóng to (phóng to làm vỡ nét).
 */
export function fitSize(width, height, maxSide = LOGO_MAX_SIDE) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const longest = Math.max(w, h);
  if (longest <= maxSide) return { width: w, height: h, scaled: false };
  const k = maxSide / longest;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)), scaled: true };
}

/** Đọc một File thành đối tượng ảnh đã giải mã. */
function decode(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được tệp ảnh này. Hãy thử tệp PNG hoặc JPG khác.'));
    };
    img.src = url;
  });
}

/**
 * Nạp một tệp ảnh và trả về data URL PNG đã thu nhỏ (và tuỳ chọn đã xoá nền trắng).
 *
 * @param {File} file
 * @param {{removeWhite?: boolean, maxSide?: number}} opts
 * @returns {Promise<{dataUrl:string, width:number, height:number, bytes:number,
 *                    scaled:boolean, clearedRatio:number}>}
 */
export async function prepareLogo(file, opts = {}) {
  const { removeWhite = true, maxSide = LOGO_MAX_SIDE } = opts;
  if (!file) throw new Error('Chưa chọn tệp.');
  if (!/^image\//.test(file.type || '')) throw new Error('Tệp này không phải ảnh.');

  const img = await decode(file);
  const size = fitSize(img.naturalWidth || img.width, img.naturalHeight || img.height, maxSide);

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, size.width, size.height);

  let clearedRatio = 0;
  if (removeWhite) {
    const px = ctx.getImageData(0, 0, size.width, size.height);
    const cleared = stripWhite(px.data);
    ctx.putImageData(px, 0, 0);
    clearedRatio = cleared / (size.width * size.height);
  }

  // PNG vì phải giữ được kênh trong suốt. JPG không có alpha.
  const dataUrl = canvas.toDataURL('image/png');
  const bytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);
  if (bytes > LOGO_MAX_BYTES) {
    throw new Error(`Ảnh sau xử lý vẫn nặng ${(bytes / 1e6).toFixed(1)} MB. Hãy dùng ảnh nhỏ hơn.`);
  }
  return { dataUrl, width: size.width, height: size.height, bytes, scaled: size.scaled, clearedRatio };
}
