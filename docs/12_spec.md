# 12 Tiêu chí nghiệm thu và công việc bắt đầu ngay

| Nhóm kiểm | Điều kiện đạt đề xuất |
| --- | --- |
| Tính toán | Golden cases đều đạt; so 3 hồ sơ chuẩn đến từng dòng hao phí, chi phí và quy tắc làm tròn. |
| Dữ liệu | 100% mã phát hành có nguồn; không còn ô thiếu bị hiểu là 0; mã cần kiểm không được xuất chính thức. |
| Tính nhất quán | Cộng chiết tính bằng trực tiếp trên tổng hợp; tổng tài nguyên khớp lượng đã phân tích; điều chỉnh riêng không lan sang dòng khác. |
| Tính độc lập | Chép công trình sang thư mục khác, tắt add-in, mở lại; đổi khối lượng/giá và tính lại không gặp #NAME? hoặc liên kết ngoài. |
| Cài đặt | Mở, lưu, đóng, mở lại trên máy sạch có Excel mục tiêu; thử thêm/xóa/sắp xếp dòng và hai workbook cùng mở. |
| Hiệu năng mục tiêu | Tra cứu sau nạp ≤ 0,5 giây; tạo 500 công tác ≤ 15 giây trên máy chuẩn thống nhất; ghi cấu hình và kết quả đo. |
| In và xuất | Không mất cột trên A3/A4; có tên công trình, đơn vị, nguồn và phiên bản hồ sơ. |
| Khôi phục | Sao lưu trước cập nhật; quay về phiên bản dữ liệu cũ mà công trình đã lưu vẫn giữ nguyên kết quả. |

Các ngưỡng hiệu năng là mục tiêu để đo, không phải cam kết đã đạt. Không có sai số tiền tùy ý: mọi chênh lệch phải quy về một quy tắc làm tròn đã công bố hoặc một nguyên nhân được sửa.

Ngay khi bắt đầu, cần chuẩn bị: một file dự toán Excel chuẩn của công ty; phụ lục định mức chính thức; một bảng giá vật liệu, nhân công, ca máy của địa bàn; ba hồ sơ có người QS xác nhận; ảnh phiên bản Excel. Có thể bắt đầu khung kỹ thuật bằng dữ liệu thử trước khi đủ các tệp này.

Phiên làm việc đầu tiên nên đạt bốn việc: đọc toàn bộ bộ đặc tả, báo cấu hình đang có, tạo cấu trúc mã nguồn, và build được file mẫu với dữ liệu thử. Không nhập hàng nghìn mã trước khi bài toán quy đổi đơn vị và công thức tổng hợp chạy đúng.

```text
Hãy đọc README.md, AGENTS.md và toàn bộ docs.
Thực hiện prompts/00_khoi_dong.md.
Dùng dữ liệu DEMO, không tự tạo hao phí pháp lý.
Ghi rõ việc đã kiểm trên Excel thật và việc chưa kiểm.
Cập nhật STATUS.md để tôi chuyển tiếp cho công cụ còn lại.
```
