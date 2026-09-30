# Số hóa định mức chính thức có kiểm soát


Đọc AGENTS.md, CLAUDE.md, STATUS.md, toàn bộ docs và các hợp đồng trong contracts trước khi làm. Đây là dự án Excel VBA trên Windows; giữ nguyên lựa chọn công nghệ trừ khi nêu được trở ngại cụ thể và phương án xử lý.
Không bịa dữ liệu pháp lý. Tiếp tục bằng DEMO nếu thiếu nguồn thật. Tự hoàn thành và sửa lỗi trong phạm vi chặng; không dừng chỉ để đưa kế hoạch. Kết thúc bằng file thay đổi, lệnh chạy, kết quả thực, điểm chưa kiểm trên Excel và cập nhật STATUS.md.


1. Liệt kê tài liệu có thật trong data/source. TT38/2026/TT-BXD và TT37/2026/TT-BNNMT phải có văn bản và phụ lục phù hợp; nếu thiếu, ghi phần thiếu và không tạo dữ liệu mang số hiệu đó từ trí nhớ.
2. Tạo source_register: URL, file, SHA-256, số văn bản, ngày hiệu lực, ngày tải. Tách metadata xác minh được với trường còn chờ.
3. Trích bảng vào data/staging, giữ original_text, source_page, table, column, note scope và confidence. Không nối cột theo phỏng đoán khi bảng có merge hoặc ngắt trang.
4. Tạo báo cáo duplicate key, missing resource, unit mismatch, percent without basis, empty consumption, OCR anomaly. Chặn chuyển needs_review sang verified bằng chương trình tự động nếu chưa có biên bản người kiểm.
5. Triển khai UI/bảng kiểm để QS đối chiếu từng mã pilot. Lưu người kiểm, thời điểm, tệp nguồn và thay đổi đã xác nhận.
6. Build data/released chỉ gồm mã được kiểm. Giữ data/staging tách biệt. Tạo coverage report và manifest version. Cập nhật so sánh new/removed/changed với release trước.
Điều kiện đạt: mẫu thật do QS chọn truy được đến trang/cột; không sửa library cũ; dự án pin release cũ vẫn tính đúng. Không thu thập hoặc sao chép cơ sở dữ liệu thương mại ngoài phạm vi được phép.
