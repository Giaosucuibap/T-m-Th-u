/* ============================================================================
 *  ĐỊA CHỈ HỆ THỐNG MẠNG ĐẤU THẦU QUỐC GIA (4.17.1)
 *
 *  Hệ thống chuyển sang Bộ Tài chính và đổi địa chỉ:
 *      cũ : https://muasamcong.mpi.gov.vn
 *      mới: https://muasamcong.mof.gov.vn
 *  Cùng phần mềm EGP_v2.0, cùng cấu trúc đường dẫn (/vi/web/guest/...,
 *  /o/egp-portal-contractor-selection-v2/...).
 *
 *  Quy tắc trong toàn bộ tiện ích:
 *    • Mọi đường dẫn phần mềm TỰ TẠO (mở trang tra cứu, trang chi tiết, gọi
 *      danh mục địa bàn) dùng địa chỉ MỚI.
 *    • Mọi chỗ KIỂM TRA một đường dẫn có phải của e-GP hay không chấp nhận CẢ
 *      HAI địa chỉ — tab người dùng đang mở, dữ liệu đã lưu từ trước, bằng
 *      chứng tham chiếu cũ vẫn dùng được.
 *    • Đường dẫn cũ khi đưa ra cho người dùng bấm được đổi sang địa chỉ mới.
 *  Chỉ hai tên miền chính xác này — không nhận tên miền con hay tên giống.
 * ========================================================================== */
export const EGP_HOST = 'muasamcong.mof.gov.vn';
export const EGP_LEGACY_HOST = 'muasamcong.mpi.gov.vn';
export const EGP_HOSTS = Object.freeze([EGP_HOST, EGP_LEGACY_HOST]);
export const EGP_ORIGIN = `https://${EGP_HOST}`;
export const EGP_ORIGINS = Object.freeze(EGP_HOSTS.map((h) => `https://${h}`));
/** Mẫu cho chrome.tabs.query: mọi trang của e-GP ở cả hai địa chỉ. */
export const EGP_TAB_PATTERNS = Object.freeze(EGP_HOSTS.map((h) => `https://${h}/*`));

export function isEgpHost(hostname) {
  return EGP_HOSTS.includes(String(hostname || '').toLowerCase());
}
export function isEgpOrigin(origin) {
  return EGP_ORIGINS.includes(String(origin || '').toLowerCase());
}
/** Đường dẫn https tới e-GP (một trong hai địa chỉ), không tài khoản, không cổng lạ. */
export function isEgpUrl(value) {
  try {
    const u = new URL(String(value || ''));
    return u.protocol === 'https:' && isEgpHost(u.hostname) && !u.username && !u.password && !u.port;
  } catch { return false; }
}
/** Đổi đường dẫn e-GP địa chỉ cũ sang địa chỉ mới; đường dẫn khác giữ nguyên. */
export function currentEgpUrl(value) {
  try {
    const u = new URL(String(value || ''));
    if (u.protocol === 'https:' && u.hostname.toLowerCase() === EGP_LEGACY_HOST) { u.hostname = EGP_HOST; return u.href; }
    return u.href;
  } catch { return String(value || ''); }
}
