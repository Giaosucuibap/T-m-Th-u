# Cập nhật 4.3.2 — Sửa bảng nhà thầu của gói đang chờ kết quả

1. Giải nén `GiaoSuCuiBap-4.3.2.zip`.
2. Chép toàn bộ tệp trong thư mục `GiaoSuCuiBap` mới vào thư mục tiện ích đang nạp trong Chrome, thay thế tệp cũ.
3. Mở `chrome://extensions`, tìm **Giáo Sư Cùi Bắp**, bấm **Tải lại ↻**. Kiểm tra số phiên bản **4.3.2**.
4. Tải lại các tab e-GP và mở lại mục **Gói đang chờ kết quả**.
5. Với danh sách đã quét trong ảnh, bấm **Đọc tiếp các gói chưa đủ dữ liệu** hoặc **Đọc lại gói này**. Tiện ích đọc lại biên bản trong danh sách đã có.

Giữ tiện ích hiện tại để giữ dữ liệu và cấu hình. Bản 4.3.2 giữ nguyên khóa định danh và quyền truy cập. Nếu cài mới, bật Chế độ nhà phát triển và dùng **Tải tiện ích đã giải nén**, chọn thư mục chứa `manifest.json`.

## Lỗi đã sửa

Gói không chia lô trên e-GP trả bảng qua `bid-open`, với các trường `bidPrice`, `saleNumber`, `bidFinalPrice`. Bản 4.3.1 chỉ nghe `lotOpenDetail` nên bỏ qua bảng này; bấm lại vẫn không nhận được nhà thầu. Bản 4.3.2 nhận cả hai loại bảng và chọn đúng nguồn theo thông tin biên bản.

Tên nhà thầu, MST, giá dự thầu, tỷ lệ giảm tự khai, giá sau giảm và chênh lệch so mốc giá hiện ngay dưới từng gói. Giá có phần lẻ đồng được giữ đến ba chữ số thập phân trên màn hình và Excel.

Tiện ích ghép bảng với thông tin dự toán và loại gói do e-GP trả riêng. Nếu có dự toán được duyệt, bảng dùng mốc đó; nếu nguồn chỉ có giá gói, nhãn ghi rõ **Giá gói thầu (e-GP)**. Với nhiều phần/lô, không lấy giá một lô so với giá toàn gói. Dữ liệu chưa đầy đủ được ghi rõ và có thể đọc tiếp.

## Đối chiếu gói trong ảnh

Đã đọc trực tiếp bảng công khai của **IB2600486024-00** trên e-GP ngày 05/09/2026:

- Nhà thầu: **CÔNG TY TRÁCH NHIỆM HỮU HẠN TƯ VẤN XÂY DỰNG VÀ THƯƠNG MẠI PHÚ HOÀNG NAM**.
- MST: **5801400520**.
- Giá gói thầu: **2.646.341.557 đồng**.
- Giá dự thầu và giá sau giảm: **2.609.041.591,923 đồng**.
- Giảm tự khai trên giá dự thầu: **0%**.
- Thấp hơn giá gói thầu: **37.299.965,077 đồng**, tương đương **1,41%**.

Hai tỷ lệ 0% và 1,41% có mốc tính khác nhau. Đây là số liệu tại lúc đối chiếu; nếu e-GP cập nhật biên bản, lần đọc mới dùng dữ liệu mới. Hạng giá không phải kết quả trúng thầu.

## Tốc độ và trạng thái

Đọc tối đa hai biên bản cùng lúc; bảng đầy đủ được lưu 30 phút và gắn thời điểm đọc. Dùng **Cập nhật biên bản** để lấy mới riêng một gói. Dữ liệu lỗi hoặc thiếu không được ghi vào bộ nhớ như kết quả đầy đủ. Lần thử thất bại ghi **Lần thử gần nhất**, không ghi nhầm **Đã đọc**.

Giữ các tab e-GP đang phục vụ lượt đọc mở. Nút **Dừng** giữ lại phần đã đọc. Khi nguồn liên tục không trả đủ dữ liệu, tiện ích dừng giao thêm gói để tránh chờ hết cả danh sách.

## Phạm vi kiểm chứng

Nguyên nhân và số liệu đã được đối chiếu trên trang e-GP thật. Các kiểm thử tự động chạy extension trong Chromium cách ly, dùng phản hồi dựng theo cấu trúc chính thức và một bộ số liệu đã quan sát từ bảng thật; chúng kiểm tra cầu nối, xử lý nền, giao diện và Excel.

Lượt chạy tự động nối trực tiếp e-GP chưa hoàn tất vì kết nối bị `ERR_CONNECTION_RESET` / timeout trong môi trường kiểm thử. Vì vậy bản giao không khẳng định đã kiểm chứng thành công toàn bộ lượt quét trực tiếp trên Chrome của người dùng. Chi tiết bằng chứng nằm trong `BAO-CAO-SUA-LOI-4.3.2.md` và `test-results/4.3.2/`.
