/* LỆNH TRANG ĐIỆN THOẠI (4.20.0): bật/tắt link điện thoại, đọc trạng thái, đổi
   khoá, bật/tắt gửi link mới qua Telegram. Không có trong CONTENT_MESSAGE_TYPES nên trang e-GP không gọi được; lệnh
   SET_* bị chặn khi tiện ích đang khoá chỉnh sửa (cửa vào chung của background). */
export function phoneHandlers({ phoneRuntime }) {
  return {
    PHONE_LINK_STATE: () => phoneRuntime.state(),
    SET_PHONE_LINK: (p) => phoneRuntime.setEnabled(p?.enabled === true),
    SET_PHONE_LINK_KEY: () => phoneRuntime.rotateKey(),
    SET_PHONE_LINK_TELEGRAM: (p) => phoneRuntime.setTelegram(p?.enabled === true)
  };
}
