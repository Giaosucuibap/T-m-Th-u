# Hướng dẫn bản 4.17.3

## Vì sao có bản này ngay sau 4.17.2
Anh gửi bản tác giả 4.17.1 (cài đặt ngày 20/10/2026). Đọc mã bản đó tôi thấy: phần đọc
yêu cầu tìm kiếm của tác giả **vẫn chỉ nhận dạng cũ**, mà theo báo cáo kèm theo đã đọc đủ
156/156 bản ghi trên e-GP thật `muasamcong.mof.gov.vn`. Nghĩa là e-GP mới **không đổi dạng
yêu cầu chính** — nhận định ở 4.17.2 của tôi chưa trúng nguyên nhân.

Nguyên nhân thật (khớp với cách bản tác giả xử lý):
1. Trang e-GP mới tự gửi thêm **yêu cầu phụ** (đếm, gợi ý). Bản cũ của tôi coi đó là
   "e-GP đổi cấu trúc" rồi **dừng cả lượt** — đúng câu lỗi anh chụp.
2. Trang mới **chậm hơn** (máy bận): bản cũ chờ quá ngắn.

## 4.17.3 sửa
- Bỏ qua yêu cầu phụ của trang, không dừng lượt vì chúng.
- Chờ trang xác nhận nhận tiêu chí tới ~5 giây (trước ~2 giây); chờ trang phát yêu cầu
  8 giây mỗi lần thao tác (trước 5 giây), thử tối đa 4 cách.
- Bỏ một thay đổi của 4.17.2 có thể đọc nhầm yêu cầu đếm thành trang kết quả.

## Cài đặt
1. Giải nén `GiaoSuCuiBap-4.17.3.zip`, chép đè thư mục `GiaoSuCuiBap` đang nạp trong Chrome.
2. `chrome://extensions` → ↻ **Reload**.
3. **Đóng hết tab e-GP đang mở**, rồi mở lại từ tiện ích.
4. Thanh bên trái phải hiện **PHIÊN BẢN 4.17.3**.

## Nếu vẫn lỗi
Chụp màn hình câu báo lỗi (có đoạn "dạng yêu cầu: …" nếu có) gửi lại.

## Cần biết
Môi trường của tôi vẫn không vào được e-GP thật; kiểm thử chạy trên máy e-GP giả lập.
Bằng chứng trên trang thật nêu ở trên là **của bản tác giả**, tôi đọc từ báo cáo trong gói
anh gửi — các tệp bằng chứng gốc không có trong gói nên tôi không đối chiếu được.
