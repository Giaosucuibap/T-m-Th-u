# Link điện thoại — giao thức (4.20.0)

Tài liệu kỹ thuật cho người bảo trì. Người dùng xem `HUONG-DAN-LINK-DIEN-THOAI.md`.

## Sơ đồ

```
iPhone Safari ──https──▶ https://<ngẫu-nhiên>.trycloudflare.com   (cloudflared, đường hầm nhanh của Cloudflare)
                                   │
                                   ▼
                      127.0.0.1:<cổng ngẫu nhiên>   GiaoSuCuiBap.DienThoai.exe  (chỉ nghe trong máy)
                                   │  stdin/stdout, khung native messaging
                                   ▼
                      Chrome ─ tiện ích Giáo Sư Cùi Bắp (lib/runtime-phone.js)
                                   │  startTbmtSearch — đúng luồng tra cứu của trang Tìm gói
                                   ▼
                              e-GP (muasamcong.mof.gov.vn)
```

- Chrome khởi động tệp `.exe` qua native messaging, tên `vn.giaosucuibap.dienthoai`. Tệp kê khai (manifest) chỉ cho phép đúng mã tiện ích `chrome-extension://injgpddgeaedalfgbnnbobdidghjncoj/`. Tệp `.exe` kiểm lại chính mã này ở tham số đầu tiên, sai thì thoát với mã 2.
- Cổng mở mặc định chỉ sống khi tiện ích đang bật "Link điện thoại". Tắt link, tắt Chrome, hay Chrome đóng cổng thì `.exe` thoát và dừng luôn `cloudflared.exe`. Trên Windows, `cloudflared` nằm trong một job tự huỷ (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`), nên kể cả khi `.exe` bị tắt ngang cũng không để lại đường hầm mồ côi.
- Cổng native đang mở giữ cho service worker MV3 không bị tắt (Chrome ≥ 105). Tiện ích còn đặt báo thức `gscb-phone-link` mỗi phút để tự nối lại khi mất kết nối.

## Khoá

- Tiện ích sinh khoá 24 byte ngẫu nhiên, viết dạng base64url (32 ký tự), rồi lưu ở `chrome.storage.local` (`phoneLink.key`). Bấm "Đổi khoá" thì link cũ hết hiệu lực ngay.
- Khoá nằm sau dấu `#` của link trong mã QR: `https://….trycloudflare.com/#k=<khoá>`. Phần sau `#` không bao giờ được gửi lên máy chủ, kể cả Cloudflare. Trang web đọc khoá rồi lưu vào `localStorage` (`gscb.key`) của Safari, sau đó xoá khỏi thanh địa chỉ.
- Mọi lệnh `/api/*` phải kèm tiêu đề `X-GSCB-Key`, được so khớp trong thời gian không đổi. Riêng `POST /api/ics` (biểu mẫu thường, không đặt được tiêu đề) nhận khoá ở trường `k` trong thân yêu cầu, không bao giờ ở URL.
- API không mở CORS: trang khác nguồn không đọc được kết quả.

## Khung native messaging

Mỗi khung gồm 4 byte độ dài (little-endian), theo sau là JSON UTF-8. Từ `.exe` gửi Chrome tối đa 1 MB, từ Chrome gửi `.exe` tối đa 32 MB.

Tiện ích → `.exe`:

| `type` | Trường | Ý nghĩa |
|---|---|---|
| `config` | `key` | Đặt hoặc đổi khoá (`^[A-Za-z0-9_-]{24,128}$`, sai thì nhận lại `error BAD_KEY`). Lần đầu nhận sẽ khởi động đường hầm. |
| `ping` | — | Nhận lại `pong {version}`. |
| `job-progress` | `id`, `progress` | Tiến độ của lệnh tìm. |
| `job-result` | `id`, `resultJson` | Kết quả (chuỗi JSON dựng sẵn bởi `buildPhoneResult`). |
| `job-error` | `id`, `code`, `message` | Lỗi: `PC_BUSY`, `READ_ONLY`, `SCHEMA_RED`, `TIMEOUT`, `RUN_MISSING`, `START_FAILED`, `EXTENSION_ERROR`. |

`.exe` → tiện ích:

| `type` | Trường | Ý nghĩa |
|---|---|---|
| `ready` | `version`, `port`, `tunnel` | Trả lời `config`. |
| `tunnel` | `state`, `url`, `code` | `starting`, `up` (kèm `url`), `down` (`TUNNEL_RESTARTING`, chờ lùi dần 5/15/30/60/120/300 giây), `missing` (`CLOUDFLARED_MISSING`), `off` (`NO_TUNNEL`, chế độ thử). |
| `job` | `id`, `op:'search'`, `criteria` | Điện thoại yêu cầu tìm. Chỉ chuyển các trường đã biết, mỗi trường là chuỗi tối đa 500 ký tự. |
| `job` | `id`, `op:'cancel'`, `target` | Điện thoại bấm Dừng. |

## HTTP (chỉ trên 127.0.0.1, ra ngoài qua đường hầm)

| Lệnh | Trả về |
|---|---|
| `GET /api/status` | `{ok, version, busy, hasLast, tunnel}` |
| `POST /api/search` `{criteria}` | `202 {jobId}`. Nếu đang có lượt khác thì `409 {code:'BUSY', jobId}`. |
| `GET /api/job?id=` | `{state: queued\|running\|done\|error, code, progress, result}` |
| `POST /api/cancel` | `202`, hoặc `{idle:true}` khi không có lượt nào. |
| `GET /api/last` | Kết quả lượt gần nhất (để mở lại điện thoại là thấy ngay). |
| `POST /api/ics` (biểu mẫu) | `text/calendar`: một sự kiện vào giờ đóng thầu, kèm 3 lời nhắc trước 72 giờ, 24 giờ và 3 giờ. |
| `GET /…` | Tệp tĩnh trong thư mục `web` (bản xuất web của `mobile-app` ở chế độ `EXPO_PUBLIC_GSCB_MODE=remote`). Đường dẫn không có đuôi tệp sẽ trả `index.html`. |

Giới hạn:

- Phần đầu yêu cầu tối đa 16 KB, thân tối đa 64 KB, nhận cả dạng chunked.
- Mọi trả lời đều kèm `Connection: close`, `X-Content-Type-Options: nosniff` và `Referrer-Policy: no-referrer`.
- Trang HTML còn kèm CSP (`script-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`) và `X-Frame-Options: DENY`.
- Từ chối mọi đường dẫn chứa `..`, `\`, `:`, `//` hoặc ký tự NUL.

## Cài đặt (`link-dien-thoai.ps1`)

1. Chép tệp `.exe` và thư mục `web` vào `%LOCALAPPDATA%\GiaoSuCuiBap\DienThoai`. Trước khi chép, kiểm `.exe` khớp tệp `.sha256` trong gói.
2. Lấy `cloudflared.exe` bản **2026.10.7**. Chỉ nhận đúng 55.390.512 byte và SHA-256 `2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343`.
   - Thứ tự tìm: tệp anh tự tải bỏ cạnh BAT, hoặc nằm trong `Downloads`; nếu không có thì tải từ GitHub phát hành chính thức của Cloudflare.
   - Chữ ký Authenticode được in ra để đối chiếu: người ký "Cloudflare, Inc.", do DigiCert Trusted G4 Code Signing cấp, ký ngày 30/10/2026.
   - Khi nâng cấp cloudflared, phải đổi cả ba hằng số (phiên bản, kích thước, mã băm).
3. Ghi tệp kê khai `vn.giaosucuibap.dienthoai.json` và đăng ký vào `HKCU\Software\Google\Chrome\NativeMessagingHosts\vn.giaosucuibap.dienthoai`.

Hai tuỳ chọn khác: `-KiemTra` để xem trạng thái, `-Go` để gỡ (chỉ gỡ khi đăng ký trỏ đúng bản này).

## Giới hạn đã biết

- Đường hầm nhanh của TryCloudflare miễn phí, không cần tài khoản. Cloudflare ghi rõ dịch vụ này dành cho thử nghiệm, không cam kết thời gian hoạt động.
- Link đổi mỗi khi `cloudflared` khởi động lại (máy tính hoặc Chrome khởi động lại, mạng rớt lâu). Tuỳ chọn "Gửi link mới qua Telegram" đỡ phải ra tận máy quét lại mã.
- Mạng công ty chặn cổng ra 7844 (cả UDP/QUIC lẫn TCP) của Cloudflare thì đường hầm không lên. Trang Link điện thoại sẽ báo "đang chạy lại".
- Máy có tệp `%USERPROFILE%\.cloudflared\config.yml` thì đường hầm nhanh không chạy. Tệp cài có cảnh báo trường hợp này.

## Địa chỉ cố định (4.21.0) — `relay/src/worker.js`

Đường hầm nhanh đổi địa chỉ mỗi lần `cloudflared` khởi động lại. Worker Cloudflare của chủ phần mềm
cho **một địa chỉ không đổi** (`https://<tên>.<tài-khoản>.workers.dev`):

```
iPhone/iPad (app trên màn hình chính) ──▶ https://thau.<tài-khoản>.workers.dev   (Worker: giao diện + chuyển tiếp)
                                              │  /api/* chỉ tới ĐÚNG đường hầm đã đăng ký (con trỏ trong KV)
                                              ▼
                                   https://<ngẫu-nhiên>.trycloudflare.com ──▶ GiaoSuCuiBap.DienThoai.exe ──▶ tiện ích ──▶ e-GP
```

| Lệnh | Ai gọi | Nội dung |
|---|---|---|
| `POST /_gscb/claim` | tiện ích (một lần) | `{code, ts, publicKey (JWK P-256), sig}`. Đúng mã ghép nối (Worker chỉ giữ SHA-256 của mã: bí mật `CLAIM_CODE_HASH`) và chữ ký ECDSA trên `gscb-claim\|code\|ts\|x\|y` thì lưu khoá công khai làm chủ, xoá con trỏ cũ. Sai mã quá 20 lần trong 1 giờ thì khoá ghép nối. |
| `POST /_gscb/register` | tiện ích (mỗi khi đường hầm hoặc khoá đổi) | `{url, ts, keySig, sig}`. `sig` = ECDSA của máy đã ghép trên `gscb-register\|url\|ts\|keySig`; `url` phải là `https://*.trycloudflare.com`; `ts` lệch tối đa 15 phút, không lùi so với con trỏ hiện tại. |
| `GET /_gscb/pointer` | trang iPhone | `{url, ts, keySig}`. Trang tự kiểm `keySig = HMAC-SHA256(khoá điện thoại, "gscb-pointer\|url\|ts")`. Sai thì báo "khoá đã cũ — quét lại mã" và không gửi lệnh. |
| `/api/*` | trang iPhone | Kèm `X-GSCB-Target` là đích trang đã kiểm. Worker chỉ chuyển tiếp khi đích trùng con trỏ hiện tại (không thì `409 STALE_TARGET`, trang hỏi lại con trỏ). Chỉ mang theo `X-GSCB-Key` và kiểu nội dung. Đường hầm đóng hoặc máy phục vụ tắt thì trả `502 PC_OFFLINE` kèm thời điểm đăng ký. `POST /api/ics` (biểu mẫu) mang đích ở trường `t`. |
| `GET /_gscb/health` | kiểm tra | `{version, claimed, pointerAgeSec}`. |
| còn lại | Safari | Giao diện (Workers Static Assets, ứng dụng một trang) kèm CSP `connect-src 'self'`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`. `public/sw.js` lưu giao diện để mở khi mất mạng; không lưu `/api/` hay `/_gscb/`. |

Hai lớp bảo vệ khoá điện thoại:

1. Chỉ máy đã ghép (giữ khoá riêng trong `chrome.storage.local`) mới đổi được con trỏ.
2. Điện thoại tự kiểm chữ ký con trỏ bằng khoá của mình trước khi gửi lệnh, và Worker chỉ chuyển tiếp tới
   đích điện thoại đã kiểm. Kể cả khi tài khoản Cloudflare hay kho KV bị chiếm, khoá vẫn không đi tới máy lạ.

Cài lên màn hình chính iOS: biểu tượng lấy địa chỉ đang mở, và app trên màn hình chính có kho dữ liệu riêng,
tách khỏi Safari. Vì vậy mục "Cài lên màn hình chính" tạm đặt `#k=<khoá>` lên thanh địa chỉ trong lúc cài,
rồi xoá đi khi bấm "Xong". App mở từ màn hình chính đọc khoá một lần, lưu lại, rồi xoá khỏi thanh địa chỉ.

Triển khai: `CLOUDFLARE_API_TOKEN=… node relay/trien-khai.mjs --tai-khoan-con <tên>`. Lệnh này dựng giao
diện, tạo kho KV, triển khai, rồi in mã ghép nối **một lần**. Cập nhật giao diện về sau thì thêm
`--chi-cap-nhat` (giữ mã cũ).

Chế độ thử của cầu nối:

- `--fake-tunnel <url>`: báo đường hầm "up" với địa chỉ cho trước, không chạy cloudflared.
- `--port <n>`: cổng cố định.

Hai cờ này dùng cho `tools/test/phone-relay.mjs`. Bài thử đó chạy đúng mã Worker trong Node qua
`tools/test/relay-sim.mjs`, rồi chạy trang bằng WebKit cỡ iPhone và iPad qua `tools/test/webkit-driver.mjs`.
