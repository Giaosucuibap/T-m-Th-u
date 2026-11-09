/* LỆNH TRANG ĐIỆN THOẠI (4.20.0): bật/tắt link điện thoại, đọc trạng thái, đổi
   khoá, bật/tắt gửi link mới qua Telegram, ghép/bỏ ghép địa chỉ cố định. Không có trong CONTENT_MESSAGE_TYPES nên trang e-GP không gọi được; lệnh
   SET_* bị chặn khi tiện ích đang khoá chỉnh sửa (cửa vào chung của background). */
export function phoneHandlers({ phoneRuntime }) {
  return {
    PHONE_LINK_STATE: () => phoneRuntime.state(),
    SET_PHONE_LINK: (p) => phoneRuntime.setEnabled(p?.enabled === true),
    SET_PHONE_LINK_KEY: () => phoneRuntime.rotateKey(),
    SET_PHONE_LINK_TELEGRAM: (p) => phoneRuntime.setTelegram(p?.enabled === true),
    // 4.21.0 — địa chỉ cố định: ghép nối (địa chỉ + mã 8 ký tự) / bỏ ghép.
    SET_PHONE_RELAY: (p) => phoneRuntime.pairRelay({ url: String(p?.url || '').slice(0, 300), code: String(p?.code || '').slice(0, 40) }),
    CLEAR_PHONE_RELAY: () => phoneRuntime.unpairRelay()
  };
}
