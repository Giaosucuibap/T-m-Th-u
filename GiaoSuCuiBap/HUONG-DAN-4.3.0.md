# Giáo Sư Cùi Bắp 4.3.0

Không gian tìm thầu cho Chrome, nâng cấp từ mã nguồn 4.2.0 do bạn cung cấp.

## Cài lần đầu

1. Giải nén file ZIP. Không chạy extension trực tiếp từ file nén.
2. Mở `chrome://extensions` trong Google Chrome.
3. Bật **Chế độ dành cho nhà phát triển / Developer mode**.
4. Bấm **Tải tiện ích đã giải nén / Load unpacked**.
5. Chọn thư mục **GiaoSuCuiBap**, nơi chứa `manifest.json`.
6. Ghim tiện ích. Bấm icon → **Tìm cơ hội tiếp theo**.

Phím tắt mở không gian tìm thầu: **Alt + Shift + F**. Nếu phím bị ứng dụng khác sử dụng, đổi tại `chrome://extensions/shortcuts`.

## Cập nhật từ 4.2.0 và giữ dữ liệu

Trước khi thay phiên bản, mở **Cấu hình → xuất backup an toàn** và dừng các lượt tra đang chạy. Giữ bản ZIP 4.2.0 để có thể quay lại.

Với bản đang được nạp bằng Load unpacked: chép nội dung thư mục bản mới vào đúng thư mục extension đang dùng, rồi bấm **Tải lại / Reload** trong `chrome://extensions`. Tải lại các tab e-GP và tab extension đang mở. **Không gỡ cài đặt extension** nếu muốn giữ kho cục bộ.

Bản mới giữ nguyên trường `key` của manifest gốc. Lịch sử lượt tìm từ bản cũ có sẵn `foundKeys` sẽ được giữ khi cập nhật. Nếu thông tin đó đã bị một phiên bản trước xóa, không thể tự dựng lại; hãy tìm lại lượt tương ứng.

Khi nhập backup, kiểm tra lại lịch quét và Telegram. Luồng nhập an toàn chủ động tắt các chức năng tự chạy; Bot Token và Chat ID không nằm trong backup an toàn.

## Sử dụng màn hình mới

- Nhập từ khóa, chủ đầu tư, tỉnh, xã/phường hoặc giá rồi bấm **Tìm gói thầu**. Cần ít nhất một tiêu chí.
- Giá nhận `3,5 tỷ`, `500 triệu`, `3.500.000.000` hoặc số đồng không phân cách. Bỏ trống giá đến để không giới hạn trên.
- Tỉnh lấy tên từ danh mục e-GP. Xã/phường lọc trên kết quả đã tải. Khi nhập đồng thời chủ đầu tư và từ khóa, chủ đầu tư gửi lên e-GP, từ khóa được lọc tại máy. Phạm vi này được ghi rõ trong giao diện.
- **Lưu tiêu chí** lưu tối đa 30 bộ tìm kiếm. Bấm tên bộ để điền lại, sau đó bấm tìm. Đây là thao tác thủ công; bộ lọc dùng cho lịch Radar vẫn quản lý ở bàn điều hành.
- **Lọc nhanh** hỗ trợ không dấu; các từ kết hợp theo AND. Ví dụ: `"truong hoc" -thietbi`, hoặc `truong -"thiet bi"`. Cú pháp này áp dụng cho lọc tại máy, không phải cú pháp được cam kết bởi e-GP.
- Chọn 2–4 gói rồi bấm **So sánh**. Gói đã chọn được giữ qua các trang của cùng lượt tìm; đổi lượt tìm sẽ bỏ chọn.
- Bấm **Theo dõi** để lưu gói vào danh sách theo dõi và quản lý tiếp tại bàn điều hành.
- **Xuất Excel** xuất toàn bộ kết quả sau bộ lọc nhanh, gồm mọi trang; không chỉ 30 thẻ trên màn hình.
- **Lịch đóng thầu** xuất file `.ics` cho các gói còn hạn trong kết quả sau lọc, có nhắc trước 24 giờ. Nhập file vào Outlook/Google Calendar/ứng dụng lịch hỗ trợ iCalendar. Nếu thời điểm nhắc đã qua, ứng dụng lịch có thể không báo. Lịch là bản chụp tại lúc xuất, không tự đồng bộ khi gia hạn.
- **E-HSMT** dùng luồng tải của bản gốc và phần mềm hỗ trợ e-GP trên máy; có thể cần phiên đăng nhập hợp lệ.

Trong màn hình tìm thầu: `/` đưa con trỏ vào tìm/lọc; `Ctrl + Enter` bắt đầu tìm; `Esc` đóng hộp thoại.

## Cách đọc kết quả

“Đang nhận hồ sơ” tính từ hạn đã ghi nhận, theo **giờ Việt Nam UTC+7**, và chỉ đúng nếu dữ liệu nguồn chưa thay đổi. Đúng thời điểm đóng thầu, gói được xếp đã đóng. Thời gian còn lại cập nhật mỗi phút khi màn hình hoạt động; mở lại tab sẽ làm mới trạng thái.

“Đạt ngưỡng phù hợp” là điểm quy tắc theo cấu hình. Điểm không chứng minh năng lực pháp lý, không thay thế đọc E-HSMT và không phải xác suất trúng thầu. Mức đầy đủ chỉ đo các trường dữ liệu đã có.

Đọc dòng phạm vi phía trên kết quả. “Một phần”, “Đã dừng”, “Có lỗi”, gói bị thiếu khỏi kho hoặc dữ liệu cũ đều cần được kiểm tra trước khi dùng làm thống kê.

## Khi gặp lỗi

| Tình huống | Cách xử lý |
|---|---|
| e-GP báo Error / từ chối truy cập | Mở trang e-GP trực tiếp trong Chrome; kiểm tra kết nối và phiên truy cập. Chỉ thử lại khi trang hoạt động. |
| CAPTCHA / yêu cầu đăng nhập | Xử lý trực tiếp trên e-GP, rồi chạy lại. Extension không tự giải CAPTCHA. |
| Có lượt khác đang chạy | Đợi hoàn tất hoặc dừng lượt đó ở bàn điều hành. |
| Danh mục tỉnh chưa tải được | Có thể tìm bằng từ khóa; thử tải lại danh mục khi e-GP hoạt động. |
| Kết quả một phần | Nới giới hạn trang trong Cấu hình hoặc chia nhỏ tiêu chí; không xem số đang có là tổng toàn thị trường. |
| Nút không phản hồi sau cập nhật | Reload extension, rồi tải lại các tab extension/e-GP. |
| Lịch/Excel bị hủy lưu | Thực hiện lại và chọn vị trí lưu trong hộp thoại Chrome. |

## Trạng thái kiểm thử của bản giao

Ngày 05/09/2026: 17 kiểm thử logic, 12 nhóm kiểm thử giao diện, 9 nhóm hồi quy đạt. Đã mở 15 trang HTML desktop không ghi nhận lỗi JavaScript trong dữ liệu kiểm thử; đã kiểm tra bố cục 390 px và các file Excel/lịch tải thực bằng Chromium 151.0.7922.34.

**Lượt thử lấy dữ liệu thật chưa xác nhận thành công:** e-GP trả trang “This page can't be displayed” trong hồ sơ Chromium kiểm thử. Bản giao không được mô tả là đã nghiệm thu lấy dữ liệu thật, tải E-HSMT, Telegram hoặc mọi chức năng phân tích trên phiên e-GP thực tế.

Chưa đóng gói CRX, chưa ký số/phát hành Chrome Web Store. File giao dùng Load unpacked.

## Font và tài nguyên

Font **Be Vietnam Pro** đóng gói cục bộ; giấy phép SIL OFL nằm trong `fonts/OFL.txt`. Nguồn: https://github.com/google/fonts/tree/main/ofl/bevietnampro.

Icon radar, SVG chức năng và minh họa trong bản nâng cấp được vẽ bằng mã vector; không phụ thuộc CDN hoặc ảnh tải bên ngoài khi mở giao diện.
