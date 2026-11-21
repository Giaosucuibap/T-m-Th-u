# Cập nhật và sử dụng bản 4.3.3

## Cập nhật trong Chrome

1. Giải nén ZIP. Thư mục cài tiện ích là `GiaoSuCuiBap`, nơi có `manifest.json`.
2. Mở `chrome://extensions`, bật Chế độ dành cho nhà phát triển. Với tiện ích đang cài, xem đường dẫn thư mục nguồn và chép nội dung bản mới vào đúng thư mục đó. Bấm **Tải lại** trên thẻ tiện ích để giữ nguyên cấu hình và dữ liệu đã lưu; không cần gỡ tiện ích.
3. Tải lại các tab e-GP đang mở, rồi mở lại **Gói đang chờ kết quả**. Kiểm tra phiên bản trên thẻ tiện ích là **4.3.3**.
4. Nếu cài lần đầu, bấm **Tải tiện ích đã giải nén** và chọn thư mục `GiaoSuCuiBap`.

## Đọc và đối chiếu nhà thầu

- Có thể nhập tên gói hoặc mã TBMT vào ô từ khóa. Chọn tỉnh hoặc chủ đầu tư để thu hẹp danh sách.
- Khoảng thời gian ưu tiên ngày mở thầu thực tế. Ngày đăng thông báo có thể sớm hơn nhiều ngày và không được ưu tiên thay cho ngày mở thầu.
- Bảng hiển thị tên/MST, giá dự thầu, tỷ lệ giảm trong hồ sơ, giá sau giảm và chênh lệch bằng đồng/% so với mốc giá. Tỷ lệ giảm trong hồ sơ và mức thấp hơn dự toán là hai chỉ tiêu riêng.
- Nếu dữ liệu dự toán được duyệt có công bố, phần mềm ưu tiên mốc đó. Nếu chỉ có giá gói thầu, nhãn ghi đúng **Giá gói thầu (e-GP)**. Không tự gán giá gói thầu thành dự toán.
- Bảng có thể hiện trước khi thông tin đối chiếu hoàn tất. Khi chưa xác định được loại gói/phần lô hoặc mốc giá, phần chênh lệch được để trống.
- Với phần/lô, giữ riêng từng lô; không so giá của một lô với giá cả gói.
- **Đọc lại gói này** mở lại biên bản để nhận dữ liệu mới, không chỉ hiện lại bảng trong bộ nhớ. **Dừng** giữ phần đã đọc.
- Nếu lượt tìm kiếm chỉ thu thập được các trang đầu do giới hạn, thông báo sẽ ghi rõ danh sách chưa đầy đủ. Thu hẹp tỉnh/chủ đầu tư/từ khóa giúp đọc được các gói cần đối chiếu nhanh hơn.

## Khi e-GP trả lỗi

Thời gian tải trang và thời gian chờ dữ liệu được theo dõi riêng. Trang từ chối truy cập hoặc lỗi thành phần e-GP được nhận diện; không được ghi thành “không có nhà thầu”. Nếu bảng cũ đã có nhưng lần đọc mới lỗi, phần mềm giữ bảng cũ và phân biệt thời điểm nhận bảng với lần thử gần nhất.

Kết quả kiểm thử và phạm vi đã xác minh được ghi trong báo cáo đi kèm ZIP. Bảng giá ở biên bản mở thầu không phải thông báo trúng thầu.
