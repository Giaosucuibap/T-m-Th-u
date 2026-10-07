# Giáo Sư Cùi Bắp 4.16.0

Bản này sửa lượt tìm kế hoạch theo Chủ đầu tư, tỉnh, loại gói và khoảng ngày phê duyệt. Khi chọn Ban số 1 Lâm Đồng và 3 tháng gần đây, tiêu chí thời gian được gửi đến e-GP và kiểm lại tại máy. Kết quả xếp theo ngày phê duyệt mới nhất trước, ngày đăng tải chỉ dùng khi hai kế hoạch có cùng ngày phê duyệt.

## Đọc đúng từng gói trong kế hoạch

Danh sách tìm kiếm e-GP có thể trả tên gói, giá và lĩnh vực dưới những mảng tổng hợp khác thứ tự. Tiện ích không ghép giá theo vị trí của những mảng đó. Nếu danh sách chưa đủ căn cứ, tiện ích tự mở tối đa hai tab chi tiết và đọc bảng có mã gói, tên, lĩnh vực và giá trên cùng một dòng. Mã, phiên bản kế hoạch và số gói phải khớp trước khi dùng bảng.

Kết quả và tổng giá hiện dần. Giữ các tab e-GP trong lúc đọc; có thể tiếp tục xem ở trang Kế hoạch. Nút Dừng giữ phần đã nhận. Lượt rộng được đọc tối đa 200 chi tiết; phần chưa đọc hoặc lỗi kết nối được báo riêng, không cộng giá chưa xác minh. Tab danh sách được giữ để dùng lại; chỉ tab chi tiết do tiện ích tạo được tự đóng.

Bản lưu từ phiên bản cũ có thể cần tra lại để xác minh giá từng gói. Không dùng giá chưa đối chiếu trong thống kê hay Excel. Tính năng này không tự thay đổi giá hay thông tin trên e-GP.

## Tốc độ và phạm vi

Tiến độ kế hoạch chỉ đọc trạng thái lượt tìm, không đọc cả kho gói thầu. Phản hồi gửi trùng được xử lý một lần. Chờ e-GP và chờ service worker đều có hạn; lỗi hoặc dữ liệu thiếu không được đổi thành kết quả rỗng thành công. Khoảng thời gian được cố định lúc bắt đầu và giữ nguyên khi xuất Excel.

Ở Mở thầu · Chờ kết quả, các gói đã thu được được xếp theo ngày mở thầu trước khi áp dụng số gói đọc chi tiết. Giới hạn đọc biên bản không cắt trang danh sách của một Chủ đầu tư. Lượt rộng có ngân sách riêng 2.000 bản ghi và báo dữ liệu một phần nếu chưa lấy đủ. Ngày mở thầu không được thay thế bằng ngày đăng tải.

Excel giữ bảng gói khớp, tiêu chí, hai mốc thời gian đã dùng và phần Đối soát. Giá là số, có định dạng tiền; giá chưa xác minh để trống. Có hàng tiêu đề, bộ lọc, dòng cố định, màu sắc và đường kẻ như phiên bản trước.

## Cập nhật

1. Xuất bản sao lưu trong tiện ích trước khi cập nhật.
2. Giải nén ZIP vào thư mục mới; không sửa thư mục đang được Chrome nạp khi đang quét.
3. Vào `chrome://extensions`, chọn tiện ích hiện có và nạp thư mục `GiaoSuCuiBap` của bản này, hoặc giữ đường dẫn cũ và thay nội dung khi Chrome đã dừng lượt quét, rồi bấm Tải lại.
4. Đóng trang tiện ích cũ và mở lại Kế hoạch lựa chọn NT. Kiểm tra phiên bản 4.16.0 trong trang quản lý tiện ích.
5. Chọn Ban số 1, Tỉnh Lâm Đồng, Xây lắp, 3 tháng gần đây và Tra cứu. Nhóm kết quả khớp và nhóm chưa đủ dữ liệu được trình bày riêng.

Mã tiện ích, quyền và kho IndexedDB được giữ. Cầu nối E-HSMT giữ nguyên thành phần 4.11.0; không cần cài lại. Lịch kiểm tra cấu trúc vẫn là 02:00 thứ Hai, giờ Việt Nam, khi Chrome đang mở.

Ngày công bố, sửa đổi dữ liệu, chất lượng trường dữ liệu và thời gian đáp ứng do e-GP cung cấp. Phần Đối soát thể hiện phạm vi thực tế đã nhận; không coi kết quả một phần là toàn bộ dữ liệu.
