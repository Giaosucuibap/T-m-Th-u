# 3 Kiến trúc chạy trong Excel

| Thành phần | Vai trò | Quy tắc triển khai |
| --- | --- | --- |
| TA_Estimate.xlam | Chương trình: tra mã, chèn công tác, tạo bảng, kiểm tra và xuất hồ sơ. | VBA dạng .bas/.cls và Ribbon XML quản lý bằng Git. |
| TA_Template.xltx | Mẫu để tạo file công trình mới. | Có bảng Excel chuẩn, tên bảng và tên cột ổn định. |
| Catalog_*.xlsx | Thư viện định mức đã phát hành. | Mở chỉ đọc; nạp mảng và chỉ mục vào bộ nhớ; dữ liệu thuần giá trị. |
| Cong_trinh_*.xlsx | Toàn bộ số liệu, hao phí đã chọn và kết quả. | Tự chứa dữ liệu dùng cho hồ sơ; không cần liên kết ngoài để tính lại. |
| Tệp nguồn PDF | Căn cứ để kiểm tra định mức. | Lưu đường dẫn tương đối và đường dẫn trực tuyến dự phòng. |

Giao diện bản đầu: nhóm lệnh Trường An trong Excel, ô tìm kiếm hoặc UserForm modeless với ListBox chuẩn. Tránh phụ thuộc TreeView OCX cũ và ActiveX đặt trên sheet. Danh mục lớn được nạp một lần; chỉ sao chép các mã đã sử dụng vào công trình.

Luồng xử lý: chọn bộ định mức → tra và đọc thuyết minh → chèn công tác theo item_id riêng → nhập khối lượng và giá → tính chiết tính → tổng hợp vật tư và chi phí → kiểm tra → xuất hồ sơ.

Công thức tài chính cuối cùng dùng hàm Excel thông thường. Không dùng hàm VBA tự viết làm điều kiện bắt buộc để người nhận file tính lại. Add-in thực hiện thao tác tạo và cập nhật cấu trúc; file .xlsx giữ được công thức và dữ liệu đã chọn khi gỡ add-in.

VBA phù hợp cho MVP ngoại tuyến. Office.js là hướng mở rộng khi cần nhiều nền tảng và giao diện web; Microsoft mô tả kiến trúc này có manifest và ứng dụng web được lưu trên máy chủ. [S8] C# và Excel-DNA chỉ xét khi phép đo thực tế cho thấy VBA không đạt tải yêu cầu.

Excel web không chạy VBA. [S9] Bản Windows này không đặt mục tiêu chạy add-in trên iPhone; điện thoại dùng để xem file hoặc PDF. Nếu công ty dùng Mac hay Excel 32 bit, cần điều chỉnh phạm vi và nghiệm thu riêng trước khi lập trình sâu.
