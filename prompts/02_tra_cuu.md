# Tra cứu định mức và thuyết minh


Đọc AGENTS.md, CLAUDE.md, STATUS.md, toàn bộ docs và các hợp đồng trong contracts trước khi làm. Đây là dự án Excel VBA trên Windows; giữ nguyên lựa chọn công nghệ trừ khi nêu được trở ngại cụ thể và phương án xử lý.
Không bịa dữ liệu pháp lý. Tiếp tục bằng DEMO nếu thiếu nguồn thật. Tự hoàn thành và sửa lỗi trong phạm vi chặng; không dừng chỉ để đưa kế hoạch. Kết thúc bằng file thay đổi, lệnh chạy, kết quả thực, điểm chưa kiểm trên Excel và cập nhật STATUS.md.


1. Tạo Catalog_DEMO.xlsx từ dữ liệu data/demo và hợp đồng contracts. Catalog chỉ có giá trị, không macro/link ngoài/công thức thực thi. Nạp dữ liệu theo mảng, xây index một lần.
2. Tìm theo mã, tên có dấu/không dấu; xếp mã đúng hoàn toàn trước, rồi tiền tố, từ khóa. Bỏ dấu chỉ dùng cho tìm kiếm; giữ nguyên tên gốc.
3. Lọc theo bộ nguồn, revision, phụ lục, chương, nhóm, đơn vị và trạng thái. Hai mã giống chữ nhưng khác nguồn phải cùng xuất hiện với nhãn phân biệt.
4. Hiển thị đơn vị định mức và norm_basis_qty, vật liệu/nhân công/máy, dòng %, điều kiện và thuyết minh theo cấp. Nút mở nguồn trỏ đến document+page thực đã lưu.
5. Mã needs_review được tra cứu nhưng bị chặn chèn để xuất chính thức; có chế độ bản nháp rõ ràng. Không lấy thiếu hao phí thành 0.
6. Chưa thêm tìm bằng AI; tìm xác định được và đo tốc độ. Giữ giao diện phù hợp Excel, không mở website bên ngoài để nhập tiên lượng.
Điều kiện đạt: các truy vấn mã, “khoan phut”, “bê tông”, không có kết quả và hai phiên bản cùng mã đều có kết quả/không kết quả đúng; bộ lọc không làm mất thuyết minh.
