# Hướng dẫn bản 4.19.0 — trạm săn, kiểm chứng trên e-GP thật, kho lịch sử

## Cài đặt (giữ nguyên dữ liệu)
1. Trong tiện ích đang dùng: **Cấu hình → Sao lưu** (xuất tệp sao lưu), cất riêng.
2. Giải nén `GiaoSuCuiBap-4.19.0.zip`, chép đè vào **đúng thư mục** tiện ích đang nạp trong Chrome
   (chép cả thư mục `native-agent` — gói này **có** tệp cầu nối `GiaoSuCuiBap.NativeHost.exe`).
3. Mở `chrome://extensions` → bấm ↻ **Tải lại (Reload)** ở thẻ Giáo Sư Cùi Bắp.
4. Đóng hết các tab e-GP và các trang tiện ích đang mở, rồi mở lại từ biểu tượng tiện ích.
5. Góc dưới thanh bên trái phải ghi **PHIÊN BẢN 4.19.0**.

## Việc nên làm ngay sau khi cài (15–25 phút, một lần)
**Kiểm chứng trên e-GP thật** — đây là bước quan trọng nhất của bản này.
1. Mở tiện ích → **Hệ thống › Kiểm tra dữ liệu** (trang Chẩn đoán).
2. Ở mục **"Kiểm chứng toàn trình trên e-GP thật"**, bấm **Chạy kiểm chứng**. Giữ trang mở, không tra cứu
   gì khác trong lúc chạy (tab e-GP tự mở ở nền).
3. Xong, bấm **Tải tệp bằng chứng (.json)** và gửi tệp đó lại cho người bảo trì.

Phần mềm sẽ chạy: Tìm gói thầu Lâm Đồng (xây lắp) → Kế hoạch LCNT 30 ngày → Mở thầu 7 ngày (đọc tối đa
3 biên bản) → Kiểm tra cấu trúc 25 mã đã biết. Mỗi luồng ghi ĐẠT/CHƯA ĐẠT kèm lý do. Tệp bằng chứng chỉ có
trạng thái, thời gian, con số đối soát; không có tên gói, nhà thầu hay giá.

## Có gì mới

### 1. Trạm săn — bộ săn chạy cả khi đóng Chrome, lượt lỡ được chạy bù
Trang **Bộ săn tự động**, mục **Trạm săn**:
- **Bước 1 — Bật chạy nền**: bấm nút, Chrome hỏi quyền → **Cho phép**. Từ đó đóng hết cửa sổ Chrome thì
  bộ săn vẫn chạy (biểu tượng Chrome ở khay hệ thống, góc phải dưới). Trong Chrome, mục *Cài đặt › Hệ thống
  › Tiếp tục chạy ứng dụng nền khi đóng Google Chrome* phải đang bật (mặc định đã bật).
- **Bước 2 — Đánh thức máy (Windows)**: trong thư mục `native-agent`, nhấp đúp **`BAT-TRAM-SAN.bat`**, gõ
  đúng dòng giờ săn mà trang Bộ săn hiện (ví dụ `06:05,13:05`) rồi Enter. Máy đang **Ngủ (Sleep)** sẽ tự
  dậy trước giờ săn 3 phút và mở Chrome chạy nền; khi đăng nhập Windows, Chrome cũng tự mở chạy nền.
  Đổi giờ săn thì chạy lại bước này. Gỡ: nhấp đúp `GO-TRAM-SAN.bat`.
- **Tự chạy bù**: máy tắt đúng giờ săn → khi Chrome chạy lại, bộ săn tự chạy bù khoảng 2 phút sau, và nhắn
  Telegram "máy tắt từ … đến …, đang chạy bù …" (nếu bộ săn bật Telegram).
- Sổ trạm săn 7 ngày: số lần máy/Chrome không chạy, số lượt lỡ, số lượt đã chạy bù.

**Giới hạn thật:** máy **tắt hẳn** (Shut down) thì không phần mềm nào trên máy chạy được — chỉ chạy bù khi
bật lại. Laptop: *Power Options › Sleep › Allow wake timers* phải là *Enable*.

### 2. Không để hỏng âm thầm
- Bộ săn lỗi → nhắn Telegram ngay lần đầu; chạy lại được → nhắn báo hồi phục.
- Các trang tra cứu hiện **dải cảnh báo** khi tiện ích đã tự dừng vì e-GP đổi cấu trúc, hoặc bộ săn đang lỗi.

### 3. Kho lịch sử biên bản mở thầu
Thanh bên trái › nhóm **Phân tích thị trường** › trang **Phân tích thị trường** › thẻ **Kho lịch sử**:
- Chọn tỉnh, lĩnh vực, số tháng (mặc định Lâm Đồng · Xây lắp · 12 tháng), bấm **Lập kế hoạch và bắt đầu**.
- Phần mềm đọc dần biên bản mở thầu của các gói **đã có kết quả** — mỗi tháng một lượt, rồi toàn bộ lịch
  sử 4 năm của các **chủ đầu tư đang theo dõi** (khai ở trang Bộ săn). Mặc định chỉ chạy **ban đêm
  23:00–06:00**, luôn nhường lượt tra cứu của anh, giờ bộ săn và giờ kiểm tra cấu trúc e-GP.
- Bảng độ phủ cho biết từng tháng: số gói, số biên bản đọc đủ / thiếu / chưa đọc được.
- Dữ liệu vào đúng kho mà các thẻ *Chân dung giảm giá*, *Quan hệ CĐT – Nhà thầu* đang dùng.
- Lượt do kho chạy hiện ở trang *Mở thầu · Chờ kết quả* với nhãn **"Kho lịch sử"**. Kho chờ **2 giờ** sau khi
  lượt soi biên bản của anh xong mới chạy, để không thay mất kết quả anh đang xem.

**Giới hạn:** tra theo tỉnh, e-GP không lọc ngày ở máy chủ — tiện ích đọc tối đa 2.000 dòng mới nhất rồi
lọc ngày trên máy, nên tháng càng xa càng dễ thiếu (bảng ghi rõ). Tra theo chủ đầu tư thì đủ lịch sử.

### 4. Cầu nối E-HSMT có trong gói
Tệp `native-agent/GiaoSuCuiBap.NativeHost.exe` được biên dịch từ mã nguồn `NativeHost.cs` **trên máy Windows
của hệ thống kiểm thử tự động**, đã chạy qua toàn bộ bài kiểm thử Windows trước khi đưa vào gói. Mã SHA-256
nằm trong `GiaoSuCuiBap.NativeHost.exe.sha256` cạnh tệp. Máy đã cài cầu nối từ trước: chép đè là xong,
không cần cài lại.

## Cần biết
- Môi trường phát triển **không vào được e-GP thật** (tường lửa e-GP chặn trình duyệt tự động từ máy chủ).
  Mọi số đo trong báo cáo là trên e-GP giả lập; bằng chứng trên e-GP thật phải đến từ máy anh (mục
  *Kiểm chứng* ở trên).
- Nếu gặp lỗi, chụp màn hình cả trang (có thanh bên trái để thấy số phiên bản) và gửi kèm tệp
  *Xuất file chẩn đoán* ở trang Chẩn đoán.
