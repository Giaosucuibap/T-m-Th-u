# Tiêu chí nghiệm thu

Các ca trong golden_cases.json là kỳ vọng độc lập. Không đổi expected để khớp implementation đang sai. Dữ liệu đều là giả lập, không có ý nghĩa pháp lý.

## Tính toán

- Quy mô định mức 1, 10, 100 và đơn vị tấn/kg được tính đúng.
- Nhiều dòng cùng mã norm, khác hệ số hoặc giá theo hạng mục không bị gộp sai.
- % tính trên đúng basis, không cộng vào tổng lượng tài nguyên, không tự tham chiếu.
- Thiếu giá/hao phí, needs_review, profile chưa được duyệt và DEMO chặn phát hành chính thức.
- Không cộng trùng thương phẩm/cấp phối, ca máy/nhiên liệu, giá đến hiện trường/cước.
- Tổng chiết tính, tổng hợp vật tư và tổng trực tiếp khớp theo chính sách làm tròn đã chọn.
- Các nhóm VAT khác nhau, chi phí nội suy ngoài miền và profile cũ được xử lý có kiểm soát.

## Excel thật

- Compile VBA; mở, lưu, đóng, mở lại.
- Mở hai công trình và thư viện; lệnh luôn ghi đúng workbook.
- Add/remove/sort rows không làm hỏng quan hệ item_id.
- Hủy thao tác, lỗi file chỉ đọc và lỗi giữa chừng đều khôi phục Application state.
- Unicode tiếng Việt hiển thị đúng, số nhập khác locale không bị đoán sai.
- Copy file công trình sang đường dẫn mới, tắt add-in, đổi khối lượng và giá: tính lại bằng Excel chuẩn.
- Không externalLinks, UDF, refresh connection bắt buộc hoặc macro trong file .xlsx gửi đi.
- A3 và A4 đọc được, không mất cột, không chồng chữ.

## Dữ liệu và hồ sơ thật

- QS kiểm toàn bộ mã của bộ pilot và các thuyết minh áp dụng.
- Đối chiếu 3 hồ sơ: kênh bê tông, đường, khoan phụt với số chuẩn do QS xác nhận.
- Khi kết quả khác phần mềm thương mại: tìm nguyên nhân về bộ mã, hao phí, giá, hệ số hoặc làm tròn, không mặc định bên nào đúng.
- Đo hiệu năng ở cấu hình chuẩn; mục tiêu tra cứu sau nạp <=0,5s và tạo 500 công tác <=15s.

## Biên bản

Ghi ngày, người kiểm, code/template/catalog/schema version, hệ điều hành, Excel/bitness, locale, file test, kết quả expected/actual, sai khác, xử lý và phạm vi còn thiếu. Lưu log và ảnh từ Excel thật cho test giao diện. Chưa chạy phải ghi NOT RUN, không PASS.
