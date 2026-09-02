/* ============================================================================
 *  logo.js — VẼ LOGO CHÌM TRÊN MỌI TRANG
 *
 *  Tệp này được mọi trang nạp. Nó đọc logo người dùng đã nạp trong Cấu hình
 *  rồi đặt vào biến CSS --watermark-image; app.css lo phần còn lại.
 *
 *  ---------------------------------------------------------------------------
 *  VÌ SAO LƯU LOGO TRONG chrome.storage CHỨ KHÔNG PHẢI MỘT TỆP TRONG THƯ MỤC
 *
 *  Bản đầu tôi bảo người dùng chép logo vào icons/logo.png. Cách đó có một
 *  khiếm khuyết nặng: MỖI BẢN CẬP NHẬT giải nén đè lên thư mục cũ sẽ XOÁ MẤT
 *  tệp đó, và người dùng phải chép lại sau mỗi lần cập nhật.
 *
 *  Lưu trong chrome.storage thì logo sống qua mọi lần cập nhật, và người dùng
 *  chỉ cần chọn tệp một lần bằng hộp thoại quen thuộc, không phải mò vào thư
 *  mục chương trình.
 *
 *  Vẫn giữ đường dẫn tệp icons/logo.png làm phương án dự phòng — ai thích chép
 *  tay thì vẫn dùng được.
 * ========================================================================== */

(() => {
  const KEY = 'brandLogo';

  /** Đặt logo vào biến CSS. Trang nào cũng đọc biến này qua app.css. */
  function apply(entry) {
    const root = document.documentElement;
    if (entry && entry.dataUrl) {
      root.style.setProperty('--watermark-image', `url("${entry.dataUrl}")`);
      if (Number.isFinite(Number(entry.opacity))) {
        root.style.setProperty('--watermark-opacity', String(entry.opacity));
      }
      if (Number(entry.size) > 0) {
        root.style.setProperty('--watermark-size', `min(70vmin, ${Number(entry.size)}px)`);
      }
    } else {
      /* Chưa nạp logo riêng trong Cấu hình → dùng logo mặc định đi kèm phần mềm.
       *
       * Bản trước đặt 'none' rồi fetch() thử xem tệp có tồn tại không. Nhưng
       * icons/logo.png KHÔNG được đóng gói, nên mọi trang đều bắn một request
       * 404 và Chrome ghi "Failed to load resource: net::ERR_FILE_NOT_FOUND"
       * vào console — chính cái rác mà đoạn đó định tránh. Nay tệp được đóng
       * gói sẵn, nên gán thẳng, bỏ hẳn fetch dò tệp. */
      root.style.setProperty('--watermark-image', `url("${chrome.runtime.getURL('icons/logo.png')}")`);
    }
  }

  chrome.storage.local.get({ [KEY]: null })
    .then((s) => apply(s[KEY]))
    .catch(() => apply(null));

  // Đổi logo ở trang Cấu hình thì mọi tab đang mở cập nhật ngay, không cần tải lại.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) apply(changes[KEY].newValue);
  });
})();
