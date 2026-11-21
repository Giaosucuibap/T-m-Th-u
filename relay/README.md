# Địa chỉ cố định cho Link điện thoại (Cloudflare Worker)

`src/worker.js` — Worker miễn phí trên tài khoản Cloudflare **của chủ phần mềm**. Worker này cho iPhone/iPad một
địa chỉ không đổi, tự trỏ tới đường hầm hiện tại của máy tính công ty. Giao thức và các lớp bảo vệ:
`../native-agent/DIEN-THOAI-GIAO-THUC.md`, mục "Địa chỉ cố định".

```bash
CLOUDFLARE_API_TOKEN=… node relay/trien-khai.mjs --tai-khoan-con truongan            # lần đầu: in MÃ GHÉP NỐI
CLOUDFLARE_API_TOKEN=… node relay/trien-khai.mjs --chi-cap-nhat                       # cập nhật giao diện, giữ mã
```

- API token dùng mẫu quyền **"Edit Cloudflare Workers"**.
- Gói miễn phí Workers: 100.000 lượt gọi/ngày. KV: 100.000 lượt đọc và 1.000 lượt ghi mỗi ngày. Máy tính chỉ
  ghi khi đường hầm đổi.
- Kiểm thử:
  - `tests/relay-421.test.mjs`: chạy đúng mã Worker trong Node.
  - `tools/test/phone-relay.mjs`: Chrome cùng tiện ích, cầu nối, Worker giả lập và WebKit cỡ iPhone/iPad.
