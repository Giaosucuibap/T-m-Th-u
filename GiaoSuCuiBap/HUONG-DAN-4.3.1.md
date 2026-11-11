# Bản 4.3.1 — Nhà thầu và giá của gói đang chờ kết quả

Bản này sửa trực tiếp mục **Gói đang chờ kết quả** của bản 4.3.0.

## Cập nhật tiện ích đang dùng

1. Giải nén `GiaoSuCuiBap-4.3.1.zip`.
2. Chép toàn bộ nội dung thư mục `GiaoSuCuiBap` vừa giải nén vào thư mục tiện ích đang nạp trong Chrome, thay thế các tệp cũ.
3. Mở `chrome://extensions`, tìm **Giáo Sư Cùi Bắp**, bấm nút **Tải lại ↻**. Kiểm tra phiên bản **4.3.1**.
4. Tải lại các tab e-GP và mở lại **Gói đang chờ kết quả**.
5. Với danh sách trong ảnh đã quét dở, bấm **Đọc tiếp các gói chưa đủ dữ liệu**. Nút này đọc lại chi tiết trong danh sách hiện có, không chạy lại bước tìm danh sách.

Không cần gỡ tiện ích. Bản này giữ nguyên khóa định danh và các quyền truy cập của bản trước. Khi cài mới, bật Chế độ nhà phát triển, chọn **Tải tiện ích đã giải nén** và chọn thư mục chứa `manifest.json`.

## Kết quả dưới từng gói

- Tên nhà thầu, mã số thuế và liên danh khi nguồn có dữ liệu.
- Giá dự thầu, tỷ lệ giảm trên giá dự thầu, giá sau giảm.
- Số tiền giảm hoặc vượt mốc giá, kèm tỷ lệ phần trăm.
- Mốc giá đối chiếu, số nhà thầu đã đọc / số e-GP công bố, thời điểm đọc.
- **Cập nhật biên bản / Đọc lại gói này** để lấy lại riêng một gói.

Mốc giá ưu tiên trường dự toán `bidEstimatePrice` nếu e-GP trả giá trị dương; nếu không có thì dùng `bidPrice` và ghi rõ **Giá gói thầu (e-GP)**. Không tự coi giá gói thầu là dự toán được duyệt khi thiếu chứng cứ từ dữ liệu.

Ví dụ minh họa, không phải dữ liệu thầu thật: dự toán 2,8 tỷ, giá dự thầu 2,6 tỷ, giảm trên giá dự thầu 5%, giá sau giảm 2,47 tỷ. Mức giảm so dự toán là **330 triệu đồng, tương đương 11,79%**. Hai tỷ lệ 5% và 11,79% có mốc tính khác nhau.

Giá sau giảm = giá nguồn công bố; nếu thiếu nhưng có tỷ lệ giảm hợp lệ thì tính lại và gắn nhãn. Nếu thiếu cả hai thì để trống, không tự kết luận nhà thầu giảm 0%. Tỷ lệ chênh lệch = (mốc giá − giá sau giảm) / mốc giá × 100. Giá vượt mốc được hiển thị rõ là **Vượt**. Hạng giá không phải kết quả trúng thầu.

## Tốc độ và đọc tiếp

Tiện ích đọc tối đa **hai biên bản cùng lúc**, hiển thị từng bảng ngay khi nhận được, và tự thử lại một lần khi hết thời gian chờ. Giữ các tab e-GP đang phục vụ lượt đọc mở. Tab phụ do bộ đọc tạo được đóng sau khi hoàn tất hoặc dừng.

Bảng đầy đủ đã đọc trong **30 phút**, cùng phiên bản và thông tin mở thầu, được dùng lại ngay. Bản lưu có thời điểm rõ ràng; bấm **Cập nhật biên bản** nếu muốn đọc mới từ nguồn. Gói hết hạn chờ hoặc thiếu nhà thầu không được ghi vào bộ nhớ như kết quả hoàn chỉnh.

Nếu e-GP liên tục không trả bảng, bộ đọc ngừng giao thêm gói sau bốn gói thất bại liên tiếp thay vì chờ qua cả danh sách. Dữ liệu đã nhận được vẫn giữ lại. Dùng **Đọc tiếp** sau khi kiểm tra e-GP đã hoạt động.

Nút **Dừng** giữ danh sách và phần đã đọc. Mở lại màn hình giữa lượt quét vẫn cập nhật kết quả. Khi Chrome dừng bộ xử lý nền, màn hình báo dữ liệu chưa đầy đủ và cho đọc tiếp.

## Phạm vi đã kiểm tra

Đã kiểm tra công thức, bộ nhớ, Chrome extension, cầu nối fetch/XHR, phản hồi chậm, đọc lại riêng, thử lại bảng rỗng bất thường, dừng, mở lại màn hình và xuất Excel bằng dữ liệu giả lập có đánh dấu rõ. Ảnh kiểm thử không phải thông tin nhà thầu thật.

Việc đối chiếu trực tiếp mã `IB2600486024` còn phụ thuộc e-GP có tải được trong môi trường thử. Không coi việc đọc được danh sách hoặc số lượng nhà thầu là đã đọc được bảng giá. Gói nhiều phần/lô cần đối chiếu theo từng phần; khi nhận diện nhiều lô, tiện ích không lấy giá một lô so với dự toán toàn gói.
