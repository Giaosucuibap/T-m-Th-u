# Hướng dẫn bản 4.21.0 — App "Cùi Bắp" trên iPhone và iPad, địa chỉ cố định

**Điểm mới:**

- iPhone và iPad có **biểu tượng app trên màn hình chính**, mở bằng một chạm.
- Có **địa chỉ cố định**: quét mã **một lần** cho mỗi máy. Máy tính công ty khởi động lại, app tự tìm lại máy
  tính, **không phải về văn phòng quét lại mã**.
- iPad có bố cục 2 cột: tiêu chí bên trái, danh sách gói bên phải.
- Mất mạng vẫn mở được app và xem kết quả, gói theo dõi đã lưu.

```
iPhone / iPad (biểu tượng "Cùi Bắp") ──▶ địa chỉ cố định (Cloudflare, đứng tên anh) ──▶ máy tính công ty ──▶ e-GP
```

## A. Cập nhật tiện ích trên máy tính (khoảng 3 phút)

1. Tiện ích → **Cấu hình → Sao lưu**, cất tệp sao lưu.
2. Giải nén `GiaoSuCuiBap-4.21.0.zip`, chép đè vào đúng thư mục tiện ích, nhớ chép cả `native-agent`.
3. Vào `chrome://extensions`, bấm **Tải lại**. Góc dưới thanh bên trái phải ghi **PHIÊN BẢN 4.21.0**.
4. Nhấp đúp lại `native-agent\BAT-LINK-DIEN-THOAI.bat` một lần để cập nhật giao diện điện thoại. Chờ chữ
   **XONG**; công cụ cloudflared đã có nên tệp không tải lại.

## B. Tạo địa chỉ cố định (một lần, khoảng 10 phút, làm cùng em)

Địa chỉ cố định chạy trên Cloudflare, gói **miễn phí**, **đứng tên anh**. Em làm phần kỹ thuật; anh chỉ cần:

1. Mở **dash.cloudflare.com/sign-up**, đăng ký bằng email và mật khẩu của anh, rồi bấm link xác nhận trong
   email.
2. Mở **dash.cloudflare.com/profile/api-tokens** và tạo token theo các bước sau:
   - Bấm **Create Token**.
   - Dòng **"Edit Cloudflare Workers"**: bấm **Use template**.
   - **Account Resources**: chọn tài khoản của anh.
   - **Zone Resources**: để **All zones**.
   - Bấm **Continue to summary**, rồi **Create Token**, rồi **Copy**.
3. Đưa token cho môi trường làm việc, **không dán vào khung chat**. Chọn một trong hai cách:
   - em gửi **ô bảo mật** trong cuộc trò chuyện, anh dán token vào đó;
   - hoặc anh tự thêm: trên thanh tiêu đề cuộc trò chuyện, mở menu môi trường **"Tìm Thầu"**, bấm **Edit**,
     vào mục **Network secrets** (bản app cũ ghi **API credentials**). Thêm một mục với máy chủ
     `api.cloudflare.com`, kiểu **Bearer**, rồi dán token. Xong anh nhắn em "đã thêm token".

   Cách nào thì em cũng không nhìn thấy token. Token chỉ dùng cho môi trường "Tìm Thầu".
4. Em triển khai rồi nhắn anh hai thứ:
   - **địa chỉ cố định**, dạng `https://thau.<tên-anh-chọn>.workers.dev`;
   - **mã ghép nối** 8 ký tự, dạng `7KQ2-M9XD`.

   Anh giữ mã này như mật khẩu: cài lại máy tính thì cần ghép lại bằng mã này.

**Chưa làm mục B?** Link trực tiếp vẫn chạy như 4.20.0, có thêm các sửa lỗi và bố cục iPad mới. Tuy vậy,
**chưa nên cài biểu tượng** (mục D): máy tính khởi động lại thì link đổi, biểu tượng cũ hết dùng được.

## C. Ghép máy tính với địa chỉ cố định (một lần)

1. Tiện ích → **Hệ thống → Link điện thoại**. Link phải đang bật.
2. Mục **"Địa chỉ cố định — không phải quét lại mã"**: nhập **địa chỉ** và **mã ghép nối**, bấm **Ghép nối**.
3. Thấy dòng xanh **"Đã ghép … điện thoại tự tìm thấy máy tính này"** là xong. Mã QR trên trang giờ là địa chỉ
   cố định.

## D. Cài app trên iPhone và iPad (một lần cho mỗi máy)

1. Mở **Camera**, quét **mã QR mới** trên trang Link điện thoại. Safari mở trang tìm gói.
2. Vào tab **Thông tin**, mục **"Cài thành app trên màn hình chính"**, bấm **Bắt đầu cài**.
3. Bấm nút **Chia sẻ** của Safari: ô vuông có mũi tên lên, nằm ở **thanh dưới trên iPhone** và **góc trên bên
   phải trên iPad**.
4. Kéo xuống, chọn **"Thêm vào MH chính"**, rồi bấm **Thêm**.
5. Quay lại Safari, bấm **Xong**.
6. Từ nay mở bằng biểu tượng **"Cùi Bắp"** trên màn hình chính. App mở toàn màn hình, không có thanh địa chỉ.

## E. Dùng hằng ngày

- **Tìm gói**: chọn tỉnh, loại gói, từ khoá, rồi bấm **Tìm trên e-GP**. Máy tính công ty tra e-GP và gửi kết
  quả về. Trên iPhone, app **tự cuộn tới kết quả**.
- **Máy tính khởi động lại** (Windows cập nhật, mất điện): anh không phải làm gì. Khi Chrome mở lại, chừng nửa
  phút sau app tự nối lại.
- **Máy tính tắt**: app báo *"Máy tính công ty đang tắt…"*. Kết quả gần nhất và gói theo dõi **vẫn xem được**.
- **Nhắc hạn nộp**: mở gói, bấm **"Thêm vào Lịch iPhone"**. Lịch sẽ nhắc trước 3 ngày, 24 giờ và 3 giờ.
- **Tin Telegram về link mới**: không cần nữa vì địa chỉ đã cố định. Có thể tắt.
- **Lỡ gửi link cho người ngoài**: trên máy tính bấm **Đổi khoá**, rồi quét mã mới trên iPhone và iPad. Cài lại
  biểu tượng nếu cần.

## F. Gặp sự cố

| Thấy gì | Làm gì |
|---|---|
| App báo "Khoá trên máy này đã cũ" | Máy tính vừa **Đổi khoá**. Quét mã QR mới, cài lại biểu tượng. |
| App báo "Máy tính công ty chưa báo địa chỉ" | Trên máy tính: bật Link điện thoại, kiểm tra mục Địa chỉ cố định đã ghép chưa. |
| App báo "Máy tính công ty đang tắt…" | Bật máy tính hoặc Chrome. Trạm săn 4.19.0 tự mở Chrome khi đăng nhập Windows. |
| Ghép nối báo "Mã ghép nối không đúng" | Gõ lại mã; chữ O và số 0 như nhau. Sai 20 lần thì phải chờ 1 giờ. |
| Ghép nối báo "Đồng hồ máy tính lệch" | Chỉnh lại ngày giờ Windows (tự động theo Internet). |
| Biểu tượng mở ra báo "chưa có khoá" | Vào **Thông tin → Dán link kết nối**, dán link có `#k=…` (từ Telegram hoặc từ máy tính). Hoặc cài lại theo mục D. |

## G. Giới hạn — nói thẳng

1. **Máy tính công ty vẫn là máy tra e-GP.** App trên điện thoại giống chiếc điều khiển từ xa. Máy tính tắt hẳn
   thì không tra mới được, nhưng vẫn xem được dữ liệu đã lưu.
2. **Đã kiểm thử bằng nhân WebKit**, cùng nhân với Safari, ở cỡ iPhone (390×844) và iPad Pro (1024×1366). Phần
   này **chưa chạy trên iPhone hay iPad thật qua địa chỉ cố định**: anh là người thử đầu tiên. Phần link trực
   tiếp thì đã chạy thật trên iPhone của anh với e-GP thật (Lâm Đồng xây lắp, 124 gói).
3. Vỏ của Safari thật (nút Chia sẻ, "Thêm vào MH chính", vuốt cuộn) không giả lập được trên máy kiểm thử. Bước
   cài ở mục D làm theo cách Apple mô tả. Bước nào không giống trên máy anh, anh chụp màn hình gửi em.
4. **Thông báo đẩy** (rung báo gói mới) chưa có trên app. Nhắc hạn nộp dùng Lịch iPhone; gói mới vẫn báo qua
   Telegram như cũ.
5. Cloudflare miễn phí: 100.000 lượt gọi mỗi ngày, dư cho vài người dùng.

## H. Về App Store

Bản này đáp ứng đúng nhu cầu "mở như app, ở đâu cũng dùng được" mà **không mất phí**. Lên App Store cần:

- Tài khoản **Apple Developer**: 99 USD/năm (khoảng 2,6 triệu đồng). Đăng ký theo công ty cần mã D-U-N-S, mất
  khoảng 1–2 tuần.
- Apple xét duyệt từng bản, và có thể từ chối app chỉ "đọc lại" một trang web nhà nước.

Mã nguồn app gốc (thư mục `mobile-app`) đã sẵn sàng. Khi anh có tài khoản Apple Developer, em đưa lên
**TestFlight** để dùng nội bộ (không cần Apple xét duyệt cho người dùng nội bộ). Bản đó tự tra e-GP ngay trên
điện thoại, không cần máy tính, nhưng phải kiểm thử lại trên máy thật.
