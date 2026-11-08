# Hướng dẫn bản 4.20.0 — Link điện thoại: tra gói thầu trên iPhone bằng Safari

**Ý tưởng:** máy tính ở công ty (Chrome + tiện ích) làm việc tra e-GP. iPhone chỉ mở **một đường link**
trong Safari. Trên điện thoại **không cài gì**, không cần App Store, và không cần chung mạng Wi-Fi: ở công
trường dùng 4G vẫn tra được.

```
iPhone (Safari) ──Internet──▶ máy tính công ty (Chrome + tiện ích) ──▶ e-GP
```

## A. Cài một lần trên MÁY TÍNH CÔNG TY (khoảng 5 phút)

1. Trong tiện ích đang dùng: **Cấu hình → Sao lưu**, xuất tệp sao lưu rồi cất riêng.
2. Giải nén `GiaoSuCuiBap-4.20.0.zip`, chép đè vào **đúng thư mục** tiện ích đang nạp trong Chrome. Nhớ
   chép cả thư mục `native-agent`.
3. Mở `chrome://extensions`, bấm ↻ **Tải lại (Reload)** ở thẻ Giáo Sư Cùi Bắp. Góc dưới thanh bên trái phải
   ghi **PHIÊN BẢN 4.20.0**.
4. Mở thư mục `native-agent`, **nhấp đúp `BAT-LINK-DIEN-THOAI.bat`**.
   - Màn hình đen hiện chữ chạy. Tệp tự tải công cụ đường hầm **cloudflared** của Cloudflare (khoảng 53 MB)
     và tự kiểm đúng bản, đúng chữ ký số.
   - Chờ đến khi thấy chữ **XONG** thì bấm phím bất kỳ để đóng.
   - Nếu Windows hiện "Windows protected your PC": bấm **More info → Run anyway**.
   - Không cần quyền Administrator.
5. Mở tiện ích → **Hệ thống → Link điện thoại** → bấm **Bật link điện thoại**. Chờ 10–30 giây, **mã QR**
   sẽ hiện ra.

## B. Trên iPhone

1. Mở ứng dụng **Camera**, hướng vào mã QR trên màn hình máy tính, chạm dòng hiện ra để mở trong Safari.
2. Trang **Giáo Sư Cùi Bắp** mở ra, góc trên ghi **"Máy tính công ty: Đã kết nối"**.
3. Chọn tỉnh, loại gói, từ khoá, khoảng giá…, rồi bấm **Tìm gói thầu**. Máy tính sẽ tra e-GP, nên chờ vài
   chục giây đến vài phút. Kết quả hiện trên điện thoại, gói **khớp tiêu chí** và **còn hạn nộp** lên đầu.
4. Bấm vào một gói để xem chi tiết. Từ đó có thể **mở trang e-GP**, hoặc bấm **"Thêm vào Lịch iPhone (nhắc 3
   lần)"**: Lịch sẽ nhắc trước hạn nộp 3 ngày, 24 giờ và 3 giờ, kể cả khi đã đóng Safari.
5. Mở lại link lần sau sẽ thấy ngay kết quả lượt tra gần nhất.

## C. Nhận link mới qua Telegram (nên bật)

Link **đổi mỗi khi máy tính hoặc Chrome khởi động lại**. Nếu không muốn về văn phòng quét lại mã:

1. Telegram phải đã cài ở **Cấu hình**: có Bot Token và Chat ID, đúng như bộ săn đang nhắn tin cho anh.
2. Trang **Link điện thoại** → mục **"Nhận link mới qua Telegram"** → đánh dấu ô **Gửi link mới qua
   Telegram**. Tiện ích gửi ngay link hiện tại; sau này link đổi thì tự gửi link mới.
3. Trên iPhone: mở tin nhắn mới nhất của bot, bấm **"Bấm vào đây để mở trên iPhone"**.

Tiện ích **chỉ gửi vào chat riêng** giữa anh và bot (Chat ID là số dương). Chat ID là nhóm thì tiện ích từ
chối gửi, vì ai trong nhóm cũng sẽ tra được bằng máy tính công ty.

## D. Điều kiện để dùng được

- Máy tính công ty **đang bật**, **Chrome đang mở** (hoặc chạy nền nhờ Trạm săn của bản 4.19.0), và trang
  Link điện thoại **đang bật**.
- Khi máy tính đang chạy Bộ săn hoặc một lượt tra khác, điện thoại báo **"Máy tính đang bận"**. Chờ một
  lát rồi bấm Tìm lại. Mỗi lúc chỉ chạy một lượt.

## E. Gặp sự cố

| Thấy gì | Làm gì |
|---|---|
| Trang Link điện thoại báo "Chưa cài cầu nối điện thoại" | Nhấp đúp lại `BAT-LINK-DIEN-THOAI.bat`, rồi Tải lại tiện ích ở `chrome://extensions`. |
| Màn hình đen báo **KHONG TAI DUOC cloudflared** | Mạng chặn GitHub. Dán đường link in trên màn hình vào Chrome để tải tệp về thư mục Downloads, rồi nhấp đúp lại tệp BAT. |
| Trang Link điện thoại báo "đang tự mở lại" mãi | Mạng công ty có thể chặn Cloudflare (cổng 7844). Thử mạng khác, hoặc báo người bảo trì. |
| iPhone báo "Không kết nối được máy tính công ty" | Máy tính hoặc Chrome đang tắt, link đang tắt, hoặc link đã đổi. Quét mã mới, hoặc mở link mới trong Telegram. |
| iPhone báo khoá không đúng, cần quét lại mã | Ai đó đã bấm "Đổi khoá". Quét mã mới. |
| Muốn gỡ hẳn | Nhấp đúp `native-agent\GO-LINK-DIEN-THOAI.bat`. Tiện ích và Bộ săn không bị ảnh hưởng. |

## F. Giới hạn — nói thẳng

1. **Chưa thử trên iPhone thật và e-GP thật.** Toàn bộ chuỗi đã chạy đạt trên máy kiểm thử: Chrome thật,
   tiện ích thật, cầu nối thật, e-GP giả lập, trang điện thoại cỡ iPhone. Đường hầm Cloudflare thật có bài
   thử tự động trên máy Windows của GitHub. Anh là người đầu tiên dùng trên iPhone; gặp lỗi gì xin chụp màn
   hình gửi lại.
2. **Đường hầm miễn phí của Cloudflare (TryCloudflare)** không cần tài khoản. Cloudflare ghi rõ dịch vụ này
   dành cho thử nghiệm và **không cam kết luôn chạy**. Nếu dùng hằng ngày và cần **link cố định**, bước sau
   có thể chuyển sang đường hầm có tài khoản Cloudflare: vẫn miễn phí, nhưng cần một tên miền riêng. Tên
   miền .com tốn khoảng vài trăm nghìn đồng mỗi năm.
3. **Link đổi** mỗi khi máy tính hoặc Chrome khởi động lại. Không nên "Thêm vào MH chính" trên iPhone, vì
   biểu tượng đó giữ link cũ.
4. **An toàn:**
   - Link có một khoá ngẫu nhiên dài 32 ký tự. Ai có link đều tra gói thầu được bằng máy tính công ty, nhưng
     **chỉ tra được gói thầu**: không xem được tệp hay dữ liệu nào khác trên máy.
   - Lỡ gửi link cho người ngoài: bấm **Đổi khoá**, link cũ mất hiệu lực ngay.
   - Khoá nằm sau dấu `#` của link, nên không đi qua máy chủ của Cloudflare.
5. App iPhone (Expo) hướng dẫn ở `HUONG-DAN-APP-IPHONE.md` vẫn giữ nguyên, nhưng **không cần nữa**. Link
   điện thoại là cách đơn giản nhất.
