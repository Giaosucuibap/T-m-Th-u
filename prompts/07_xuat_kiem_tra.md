# Nhập hồ sơ Excel và xuất hồ sơ độc lập


Đọc AGENTS.md, CLAUDE.md, STATUS.md, toàn bộ docs và các hợp đồng trong contracts trước khi làm. Đây là dự án Excel VBA trên Windows; giữ nguyên lựa chọn công nghệ trừ khi nêu được trở ngại cụ thể và phương án xử lý.
Không bịa dữ liệu pháp lý. Tiếp tục bằng DEMO nếu thiếu nguồn thật. Tự hoàn thành và sửa lỗi trong phạm vi chặng; không dừng chỉ để đưa kế hoạch. Kết thúc bằng file thay đổi, lệnh chạy, kết quả thực, điểm chưa kiểm trên Excel và cập nhật STATUS.md.


1. Nhập tiên lượng từ Excel bằng màn hình mapping: mã, tên, đơn vị, lượng, giá, hao phí nếu có. Có preview và báo dòng không ánh xạ được. Không hứa đọc mọi file G8/ETA/F1 gốc.
2. Chọn rõ chế độ “giữ số liệu gốc để đối chiếu” hoặc “lập lại theo bộ đã chọn”; không tự đổi định mức của file nhập.
3. Tệp nhập chỉ được đọc dữ liệu cần thiết, không bật macro. Cột text bắt đầu =,+,-,@ được xử lý như text theo kiểu cột; không thực thi công thức tùy ý. Diễn giải số học phải qua parser whitelist.
4. Kiểm tra độc lập: missing price, missing norm, wrong unit, duplicate ID, unresolved adjustment, formula error, circular dependency, inconsistent totals, demo data, source status.
5. Xuất .xlsx tự chứa snapshot và công thức chuẩn; không UDF, link ngoài, query refresh. Nếu không thể giữ một tính năng thì ghi rõ và chặn xuất kiểu tuyên bố tương thích.
6. Cấu hình in A3/A4, lặp header, tên công trình, hạng mục, số trang, chữ ký theo mẫu người dùng; không thu nhỏ chữ đến khó đọc.
7. Có lưu dự thảo dù còn lỗi; “phát hành” phải qua validation trực tiếp từ dữ liệu đang có. Sheet KIEM_TRA chỉ là báo cáo cuối.
Điều kiện đạt: máy không có add-in vẫn mở và thay lượng/giá để tính lại; thử một tệp nhập bị xáo cột và một tệp chứa công thức không được phép; kiểm A3/A4 thực.
