# Bản 4.3.4 — chọn loại gói trong KHLCNT và TBMT

Hai màn hình **Kế hoạch lựa chọn nhà thầu** và **Tìm thông báo mời thầu** có cùng ô **Loại gói thầu**:

- Xây lắp.
- Tư vấn — tất cả.
- Tư vấn thiết kế.
- Tư vấn giám sát.
- Tư vấn khảo sát.
- Tư vấn thẩm tra / thẩm định.
- Tư vấn quản lý dự án.
- Hàng hóa.
- Phi tư vấn.
- Hỗn hợp.

Chọn **Tất cả loại gói thầu** để bỏ điều kiện này. Có thể kết hợp loại gói với tỉnh, chủ đầu tư, từ khóa và những tiêu chí sẵn có trên từng màn hình. Chọn xong, bấm **Tra cứu trên e-GP** hoặc **Tìm gói thầu** để chạy lượt mới.

## Cách lọc và đọc kết quả

Lĩnh vực chung được gửi đến e-GP để thu hẹp dữ liệu. Các nhóm tư vấn chi tiết được phân biệt theo tên từng gói đã tải, không phải mã phân ngành riêng do e-GP công bố. Gói kết hợp thiết kế và giám sát có thể khớp cả hai lựa chọn. Tên mô tả thiếu hoặc viết tắt khác thường có thể không khớp nhóm chi tiết; chọn **Tư vấn — tất cả** để xem rộng hơn.

Kế hoạch có nhiều loại gói chỉ hiển thị những gói khớp. Thẻ ghi số gói khớp trên tổng số gói của kế hoạch; tổng giá được ghi rõ là giá các gói khớp. Tổng mức đầu tư của dự án vẫn được ghi nhãn riêng. Excel kế hoạch xuất các gói thuộc kết quả đã lọc loại.

Ưu tiên lĩnh vực riêng của từng gói. Khi chỉ có một lĩnh vực cho toàn kế hoạch, có thể dùng lĩnh vực đó cho các gói chưa có mã riêng. Với kế hoạch nhiều lĩnh vực, không gán toàn bộ các lĩnh vực cho từng gói; phần mềm đối chiếu tên gói và thông báo số gói chưa đủ thông tin phân loại.

Mục **Lưu tiêu chí** trong tìm TBMT lưu cả loại gói. Mở lại trang giữ lựa chọn gần nhất; nút xóa đưa loại gói về **Tất cả**. Tiêu chí cũ chưa có loại gói vẫn dùng được.

Giới hạn số trang vẫn được ghi rõ nếu lượt quét chỉ thu thập một phần dữ liệu. Thêm tỉnh, chủ đầu tư hoặc từ khóa giúp thu hẹp phạm vi.

## Cập nhật giữ dữ liệu

1. Giải nén ZIP mới. Thư mục cài là **GiaoSuCuiBap**, nơi có `manifest.json`.
2. Chép nội dung thư mục này vào đúng thư mục nguồn của tiện ích đang dùng. Mở `chrome://extensions` và bấm **Tải lại** trên thẻ tiện ích. Không cần gỡ tiện ích.
3. Tải lại các tab e-GP và mở lại hai màn hình tìm kiếm. Kiểm tra phiên bản **4.3.4**.

Nếu cài lần đầu, bật **Chế độ dành cho nhà phát triển**, chọn **Tải tiện ích đã giải nén** và chọn thư mục **GiaoSuCuiBap**.
