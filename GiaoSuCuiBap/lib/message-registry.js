/* ============================================================================
 *  SỔ ĐĂNG KÝ LỆNH (4.19.0) — thay dần khối switch hơn 120 nhánh trong
 *  background.js bằng các mô-đun theo mảng nghiệp vụ (lib/handlers/*.js).
 *
 *  Quy tắc: MỖI LỆNH ĐÚNG MỘT CHỦ. Đăng ký trùng là lỗi ngay khi khởi động — không
 *  để hai nơi cùng xử lý một lệnh rồi lệnh nào thắng tuỳ thứ tự viết. Phần kiểm
 *  tra nguồn gửi / khoá chỉnh sửa vẫn nằm ở cửa vào chung trong background.js,
 *  chạy TRƯỚC khi lệnh tới đây, nên mô-đun không phải lặp lại.
 * ========================================================================== */
export function createMessageRegistry() {
  const handlers = new Map(), owners = new Map();
  function register(domain, map) {
    for (const [type, fn] of Object.entries(map || {})) {
      if (!/^[A-Z][A-Z0-9_]{1,79}$/.test(type)) throw new Error(`Tên lệnh không hợp lệ: ${type}`);
      if (typeof fn !== 'function') throw new Error(`Lệnh ${type} (${domain}) thiếu hàm xử lý.`);
      if (handlers.has(type)) throw new Error(`Lệnh ${type} đã do "${owners.get(type)}" xử lý — mỗi lệnh chỉ một chủ.`);
      handlers.set(type, fn); owners.set(type, domain);
    }
    return api;
  }
  /** Lệnh chưa đăng ký → {handled:false}, để cửa vào chuyển tiếp cho khối switch cũ. */
  async function dispatch(message, sender) {
    const fn = handlers.get(message?.type);
    if (!fn) return { handled: false };
    return { handled: true, response: await fn(message.payload || {}, { message, sender }) };
  }
  const api = { register, dispatch, has: (t) => handlers.has(t), types: () => [...handlers.keys()].sort(), owner: (t) => owners.get(t) || null };
  return api;
}
