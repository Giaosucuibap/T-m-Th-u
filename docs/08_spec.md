# 8 Quy trình số hóa và nghiệm thu dữ liệu

- 1. Tiếp nhận văn bản và toàn bộ phụ lục. Ghi số hiệu, ngày, tệp, URL, checksum và phạm vi áp dụng.
- 2. Đọc cấu trúc PDF. Tách thuyết minh chung, chương, nhóm và bảng. Với bản quét dùng OCR nhưng giữ ảnh/trang nguồn để kiểm.
- 3. Đưa dữ liệu trích xuất vào khu vực chờ kiểm. Giữ chuỗi số gốc, đơn vị gốc, số trang và tên cột trước khi chuẩn hóa.
- 4. Kiểm tra máy: khóa trùng, liên kết thiếu, đơn vị bất thường, lệch số cột, số âm, dấu phẩy, ký hiệu ≤ và các dòng %. Dữ liệu nghi ngờ phải có danh sách riêng.
- 5. Kỹ sư QS đối chiếu từng mã và toàn bộ dòng hao phí của bộ thí điểm với trang nguồn. Người thứ hai kiểm các trường đã sửa và các trường hợp %, quy đổi, cấp phối, thuyết minh kế thừa.
- 6. Chỉ phát hành những mã đủ điều kiện. Những mã chưa xác nhận vẫn tra cứu được với cảnh báo, nhưng không được dùng để phát hành dự toán chính thức.
- 7. Khi cập nhật, tạo báo cáo mã thêm, bỏ, sửa; lưu bản cũ và cho người dùng xem tác động trước khi thay mã trong công trình.

Cần kiểm cả phạm vi thành phần công việc, không chỉ so số hao phí. Hai mã có tên gần giống nhưng khác biện pháp hoặc khác nội dung đã bao gồm sẽ cho kết quả khác nhau.

| Chỉ tiêu dữ liệu thí điểm | Điều kiện đạt |
| --- | --- |
| Nguồn và vị trí | 100% mã được phát hành truy được tệp, trang, bảng/cột. |
| Số hao phí và đơn vị | 100% dòng của mã phát hành đã đối chiếu; không còn thiếu chưa xử lý. |
| Khóa và liên kết | Không trùng khóa nghiệp vụ; không có hao phí mất mã hoặc mất tài nguyên. |
| Công trình đang làm | Cập nhật thư viện không làm đổi snapshot đã chốt. |
| Mã cần kiểm | Không được tự suy diễn hao phí 0 hoặc dùng cho xuất chính thức. |

Người phụ trách dữ liệu giữ quyền phát hành bộ chính thức; người dùng thường chỉ tạo điều chỉnh cấp công trình. Việc phát hành cần kèm danh sách mã được hỗ trợ để tránh hiểu nhầm bộ thí điểm là thư viện đầy đủ.
