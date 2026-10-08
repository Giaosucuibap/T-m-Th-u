# Giáo Sư Cùi Bắp 4.12.0

## Cập nhật từ bản đang sử dụng

Xuất bản sao lưu trong Cấu hình, dừng lượt quét và đóng các trang tiện ích. Giải nén bản mới, thay nội dung thư mục `GiaoSuCuiBap` đang được Chrome nạp rồi bấm **Tải lại** tại `chrome://extensions`. Kiểm tra số phiên bản 4.12.0. Giữ tiện ích đang cài để giữ kho và cấu hình. Khi cài lần đầu, chọn **Tải tiện ích đã giải nén** và mở thư mục chứa `manifest.json`.

## Giao diện và thao tác

Bốn mục chính vẫn là **Tìm → Kho → Săn → Checklist**. Kế hoạch lựa chọn nhà thầu, biên bản mở thầu, phân tích và cấu hình nằm trong **Nâng cao**. Dùng **Gọn/Thoáng** để thay khoảng cách trình bày theo màn hình; lựa chọn này không đổi tiêu chí hoặc phạm vi dữ liệu. Có liên kết bỏ qua điều hướng để tới nội dung khi dùng bàn phím.

Chữ phụ và nhãn được tăng độ rõ, số tiền căn theo cột; các biểu tượng dùng chung một bộ SVG có sẵn trong tiện ích. Không phải tải phông hoặc biểu tượng từ dịch vụ bên ngoài.

## Tìm kiếm và dữ liệu

Phần mềm giảm xử lý lịch sử không dùng, chỉ đọc các trường điều khiển cần thiết khi điều phối tab e-GP. Lọc cục bộ phân tích từ khóa một lần, dùng chỉ mục mã gói/tỉnh/ngày và tính các giá trị sắp xếp một lần cho mỗi dòng. Hạn đóng thầu vẫn được tính lại khi hiển thị, không giữ trạng thái còn hạn đã cũ.

Loại gói ưu tiên `investField` chính thức. Xã/phường đối chiếu mã cùng tỉnh cha. Gói thiếu căn cứ vẫn vào **Chưa đủ dữ liệu**. Danh sách, tổng hợp và Excel dùng cùng phạm vi đã lọc; phân trang giao diện không cắt bớt dữ liệu xuất.

Cache danh sách tồn tại tối đa 120 giây tính từ lúc bắt đầu truy vấn nguồn. Một lượt đọc chậm không làm dữ liệu trang đầu được coi như vừa mới lấy. Tốc độ nhận dữ liệu trực tiếp còn phụ thuộc e-GP và kết nối; đọc nhanh bộ lọc trên máy không đồng nghĩa đã lấy đủ mọi trang nguồn.

## Excel

Bản xuất có trang **Xem nhanh** cho TBMT, biên bản và kế hoạch, giữ trang chi tiết để đối chiếu đầy đủ. Tiêu đề in đậm, màu nền và hàng xen kẽ hỗ trợ đọc; ghi chú dùng chữ nghiêng. Có kẻ ô, cố định tiêu đề, bộ lọc, độ rộng cột và thiết lập in.

Số tiền và tỷ lệ được giữ dạng số. Ngày giờ hợp lệ là ô ngày Excel theo giờ Việt Nam; mã hồ sơ và mã số thuế giữ dạng chữ để không mất số 0 đầu. Ô không có giá không biến thành số 0. Trang **Thông tin xuất** ghi nguồn, thời điểm và phạm vi; các biên bản chưa đọc đủ được nêu để tránh hiểu rằng danh sách nhà thầu đã đầy đủ.

Mốc so sánh giá theo trường nguồn thực sự cung cấp: dự toán được duyệt khi có; nếu chỉ có giá gói thầu, tên mốc ghi rõ điều đó. Bản Excel phản ánh dữ liệu lúc xuất; cần đọc lại trên e-GP khi nguồn thay đổi.

Với gói nhiều phần/lô, bảng giữ mã và tên lô cạnh nhà thầu. Giá được tính từ tỷ lệ giảm có chú thích riêng với giá nguồn công bố. Khi chưa có mốc giá phù hợp để đối chiếu, ô chênh lệch để trống và ghi nguyên nhân ở trang chi tiết.

## Kiểm tra định kỳ và hồ sơ

Lịch canary giữ **02:00 thứ Hai, giờ Việt Nam**, gồm 25 mã và kiểm tra tỉnh 703. Chrome cần hoạt động. Nếu lỡ lịch, tiện ích chạy bù trong khung thấp điểm theo cấu hình. Mở **Nâng cao → Kiểm tra dữ liệu** để xem kết quả hoặc chạy ngay. Đỏ sẽ dừng truy vấn; Chưa xác định không được tính là đạt.

Tải E-HSMT tiếp tục dùng cầu nối Native Messaging đi kèm. Phần mềm hỗ trợ e-GP chính thức cần chạy trên máy. Xem [hướng dẫn cầu nối](HUONG-DAN-NATIVE.md).

Mọi kiểm tra đối chứng đều có phạm vi và thời điểm. Dữ liệu chưa công bố, kết nối lỗi hoặc thay đổi của e-GP phải được báo rõ, không được thay bằng một kết quả có vẻ đầy đủ.
