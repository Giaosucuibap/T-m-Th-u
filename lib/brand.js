/* ============================================================================
 *  lib/brand.js — THÔNG TIN THƯƠNG HIỆU
 *
 *  Gom một chỗ để đổi email hay giá chỉ phải sửa tệp này.
 *  TÊN "Giáo Sư Cùi Bắp" LÀ CỐ ĐỊNH — không đổi.
 *  Riêng tên trong manifest.json phải sửa tay vì Chrome đọc tệp đó trực tiếp.
 * ========================================================================== */

export const BRAND = {
  /** Tên đầy đủ, hiện ở tiêu đề các trang và thông báo. */
  name: 'Giáo Sư Cùi Bắp',

  /** Tên ngắn không dấu — dùng đặt tên thư mục khi xuất CSV. */
  slug: 'GiaoSuCuiBap',

  /** Email liên hệ hỗ trợ, hiện trong ứng dụng. */
  email: 'giaosucuibap@gmail.com',

  /** Câu mô tả ngắn hiện dưới tên ở màn hình chính. */
  tagline: 'Trợ lý đấu thầu trên Hệ thống mạng đấu thầu quốc gia',

  /** Giá bán và thời hạn — chỉ để hiển thị, phần mềm không tự kiểm tra. */
  price: '200.000 đ',
  durationText: '1 năm',

  /** Kênh liên hệ phụ (để trống thì không hiện). */
  zalo: '',
  website: ''
};

/** Tiêu đề trang: "Tra cứu — Giáo Sư Cùi Bắp" */
export function pageTitle(part) {
  return part ? `${part} — ${BRAND.name}` : BRAND.name;
}
