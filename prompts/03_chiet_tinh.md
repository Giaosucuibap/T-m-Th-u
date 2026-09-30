# Tiên lượng và chiết tính hao phí


Đọc AGENTS.md, CLAUDE.md, STATUS.md, toàn bộ docs và các hợp đồng trong contracts trước khi làm. Đây là dự án Excel VBA trên Windows; giữ nguyên lựa chọn công nghệ trừ khi nêu được trở ngại cụ thể và phương án xử lý.
Không bịa dữ liệu pháp lý. Tiếp tục bằng DEMO nếu thiếu nguồn thật. Tự hoàn thành và sửa lỗi trong phạm vi chặng; không dừng chỉ để đưa kế hoạch. Kết thúc bằng file thay đổi, lệnh chạy, kết quả thực, điểm chưa kiểm trên Excel và cập nhật STATUS.md.


1. Chèn mã vào TIEN_LUONG với item_id độc lập; copy snapshot norm, notes và resource lines. Hai công tác cùng mã vẫn sửa hệ số riêng.
2. Implement quan hệ quantity × conversion / norm_basis_qty. Kiểm đơn vị cùng đại lượng và trạng thái vật lý trước khi tính.
3. Sinh CHIET_TINH gồm lượng đơn vị định mức, hao phí gốc, hệ số theo VL/NC/M, hao phí áp dụng, lượng tài nguyên, giá và thành tiền. Hiển thị được các bước, tránh một công thức dài không kiểm tra được.
4. Phân loại quantity và percent; percent có base_refs. Nếu chưa hỗ trợ loại công thức đặc biệt, chặn có thông báo thay vì âm thầm bỏ qua.
5. Xử lý lượng bằng 0 hợp lệ, basis bằng 0 không hợp lệ, âm phải có chế độ điều chỉnh rõ. Chuỗi số nhập phải có quy tắc locale, không đoán 1.250 là 1,25 hay 1250.
6. Đổi mã tạo diff và snapshot mới của item; giữ khối lượng và adjustment khi người dùng xác nhận phù hợp, không tự áp điều chỉnh cũ sang cấu trúc mới.
Điều kiện đạt: chạy golden_cases.json và kiểm công thức Excel cho ví dụ DEMO 250 m³ / 100 m³. Chèn/xóa/sort dòng không làm lẫn hao phí giữa item_id.
