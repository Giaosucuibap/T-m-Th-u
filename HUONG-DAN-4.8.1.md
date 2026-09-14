# Cập nhật và dùng Giáo Sư Cùi Bắp 4.8.1

## Cập nhật từ bản đang dùng

1. Trong tiện ích cũ, vào **Cấu hình** và xuất bản sao lưu dữ liệu. Giữ tệp này cùng thư mục cài cũ để có thể quay lại.
2. Giải nén `GiaoSuCuiBap-4.8.1.zip` vào một thư mục cố định. Thư mục để cài là `GiaoSuCuiBap`, bên trong có `manifest.json`.
3. Mở `chrome://extensions`, bật **Chế độ dành cho nhà phát triển**. Nếu cập nhật tại thư mục Chrome đang nạp, đóng các trang tiện ích/e-GP đang tra cứu, chép nội dung mới vào đúng thư mục đó rồi bấm **Tải lại** ở tiện ích. Không cần gỡ tiện ích để cập nhật theo cách này.
4. Nếu chọn một thư mục cài mới, dùng **Tải tiện ích đã giải nén** và chọn `GiaoSuCuiBap`. Tránh chạy hai bản cùng lúc. Kiểm tra tên và phiên bản **4.8.1**.
5. Mở lại trang tìm thầu và trang e-GP để dùng mã mới. Kiểm tra danh sách theo dõi, tiêu chí đã lưu và cấu hình. Chỉ nhập sao lưu khi cần phục hồi: nhập sao lưu thay thế dữ liệu hiện tại, không phải gộp.

Tiện ích giữ cùng khóa nhận diện với bản trước. Tuy vậy, hãy xuất sao lưu trước khi đổi thư mục hoặc gỡ cài. Sao lưu không mang theo Bot Token, khóa HMAC và địa chỉ gửi thông báo. Lịch tự động và gửi Telegram được tắt khi nhập sao lưu; bạn kiểm tra lại rồi chủ động bật khi cần. Gói đồng bộ JSON ở Nhật ký dùng để gộp checklist/quyết định/hợp đồng, khác với sao lưu toàn bộ.

## Tìm nhanh hơn

Trong **Tìm thông báo mời thầu** và **Kế hoạch lựa chọn nhà thầu**, chọn loại gói: xây lắp, tư vấn, thiết kế, giám sát, khảo sát, thẩm tra/thẩm định, quản lý dự án, hàng hóa, phi tư vấn hoặc hỗn hợp.

- Nhập nhiều tỉnh, cách nhau bằng dấu phẩy, ví dụ `Lâm Đồng, Đắk Lắk`.
- Trang **Tìm thông báo mời thầu** có các ô chủ đầu tư, từ khóa, khoảng giá, **Từ khóa bắt buộc** và **Không chứa từ**. Hai ô từ khóa bổ sung đối chiếu tên gói đã tải về.
- Để áp dụng từ bắt buộc, từ loại trừ và khoảng giá cho **KHLCNT**, vào **Bộ săn tự động**, chọn loại thông tin **Kế hoạch lựa chọn nhà thầu**, nhập tiêu chí rồi lưu/chạy bộ săn. Trang KHLCNT riêng vẫn dùng bộ lọc loại gói, địa bàn, chủ đầu tư, từ khóa và ngày. Điều kiện nâng cao của bộ săn áp dụng cho từng gói con; giá trị khớp không bị cộng lẫn các gói khác trong cùng kế hoạch.
- Lĩnh vực chung gửi đến e-GP; các loại tư vấn chi tiết còn đối chiếu tên gói. Nếu hồ sơ đặt tên khác thông thường, dùng **Tư vấn — tất cả** để tìm rộng hơn.
- Không đọc được danh mục tỉnh thì tiện ích báo lỗi, không tự chuyển thành quét cả nước.
- Nếu chạm số trang tối đa, kết quả ghi rõ là dữ liệu một phần. Thêm tỉnh, chủ đầu tư hoặc từ khóa để thu hẹp phạm vi.

## Bộ săn và thay đổi thông báo

**Bộ săn tự động** lưu nhiều tiêu chí TBMT/KHLCNT và giờ chạy riêng. Khi một lượt cùng chức năng đang chạy, lượt đến sau vào hàng chờ. Chrome cần hoạt động để chạy lịch. Cấu hình Telegram theo từng bộ săn chỉ có hiệu lực khi bạn đã bật Telegram và nhập cấu hình hợp lệ.

Khi gặp phiên bản TBMT mới, tiện ích lưu dấu vết thay đổi và yêu cầu xem xét lại quyết định cũ. Checklist hoàn thành của phiên bản trước không tự được coi là hoàn thành cho hồ sơ mới. Khi hạn đóng thầu thay đổi, mốc nhắc hạn được cập nhật theo hạn mới.

## Hồ sơ dự thầu

- **Hồ sơ năng lực:** nhập thông tin doanh nghiệp để có đối chiếu phù hợp hơn. Không nhập thì không tự áp tiêu chí ngành nghề mặc định lên công ty.
- **Hợp đồng tương tự:** lưu giá trị, năm và thông tin công việc. Khoảng năm đối chiếu do bạn đặt theo HSMT cụ thể; thiếu dữ liệu được thể hiện là chưa rõ.
- **Nội dung HSMT:** dán phần văn bản cần kiểm tra. Phát hiện từ khóa chỉ gợi ý yêu cầu xuất hiện trong hồ sơ, không tự đánh dấu doanh nghiệp đạt. Với PDF ảnh/scan, cần trích xuất chữ hoặc OCR trước; bản này không có bộ đọc đầy đủ mọi PDF.
- **Checklist:** lưu từng việc theo gói; thao tác nhiều ô liên tiếp vẫn được giữ. Nếu tên người phụ trách xung đột, tiện ích báo lỗi và khôi phục ô về dữ liệu đã lưu.
- **Quyết định Go:** mặc định một bước để giữ thao tác quen thuộc; có thể đặt hai hoặc ba bước trong Cấu hình. Tên người thao tác là ghi nhận nội bộ trên máy, không phải tài khoản hoặc chữ ký số xác thực.
- **Đề cương:** chọn gói và xuất DOCX để biên tập tiếp. Đây là bản nháp có cấu trúc, cần bổ sung biện pháp và yêu cầu riêng của hồ sơ.

## Đối thủ, bản đồ và đồng bộ

Phân tích đối thủ và khoảng giá sử dụng kho dữ liệu đã đọc. Bộ lọc không có gói phù hợp sẽ trả trống; khoảng giá tham khảo không bảo đảm là mức giá có thể trúng thầu.

Bản đồ gộp dữ liệu theo tỉnh. Chấm là điểm tham chiếu gần đúng của tỉnh, không phải tọa độ công trình. Gói chưa xác định được tỉnh vẫn được đếm ở bảng và không bị gán tọa độ giả. Khi OpenStreetMap không tải được ảnh nền, bảng thống kê vẫn dùng được.

**Nhật ký** hỗ trợ lọc, xuất và đồng bộ JSON. Đặt cùng khóa HMAC ở các máy nếu muốn kiểm tra tệp bị thay đổi. Khóa này không mã hóa tệp và không xác thực người ký. Khi nhập, dữ liệu cũ hơn hoặc khác người phụ trách được giữ lại tại máy và báo xung đột để bạn đối chiếu. **Chỉ xem** khóa chỉnh sửa và lịch tự động tại máy; có thể mở khóa ở Cấu hình.

## Khi tra cứu không có dữ liệu

Kiểm tra kết quả là **không có gói khớp**, **dữ liệu một phần** hay **lỗi kết nối e-GP**. Đó là ba trạng thái khác nhau. Mở trang e-GP mà tiện ích đang dùng để xem trang có tải được không, giữ tab đó mở trong khi đọc. Nếu có lỗi, dùng Chẩn đoán và mã gói để đối chiếu. Không coi một bảng trống do lỗi mạng là kết quả thị trường bằng không.
