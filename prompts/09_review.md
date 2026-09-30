# Rà soát độc lập sau một chặng


Đọc AGENTS.md, CLAUDE.md, STATUS.md, toàn bộ docs và các hợp đồng trong contracts trước khi làm. Đây là dự án Excel VBA trên Windows; giữ nguyên lựa chọn công nghệ trừ khi nêu được trở ngại cụ thể và phương án xử lý.
Không bịa dữ liệu pháp lý. Tiếp tục bằng DEMO nếu thiếu nguồn thật. Tự hoàn thành và sửa lỗi trong phạm vi chặng; không dừng chỉ để đưa kế hoạch. Kết thúc bằng file thay đổi, lệnh chạy, kết quả thực, điểm chưa kiểm trên Excel và cập nhật STATUS.md.


Đóng vai người kiểm độc lập về lập trình Excel và QS. Đọc đặc tả trước, rồi đọc git diff và các file liên quan. Đầu tiên chỉ phân tích, chưa sửa.
1. Tìm lỗi có thể tái hiện: chia nhầm /100, trộn norm revision, missing thành 0, percent sai basis, hệ số áp hai lần, ca máy/cấp phối/cước tính trùng, nhập giá gồm VAT nhưng tính lại VAT sai.
2. Kiểm item_id khi cùng mã nhiều dòng; orphan resources; sort/insert/delete; override làm biến dạng thư viện gốc; dependency vào add-in hoặc link ngoài.
3. Kiểm Excel đặc thù: ThisWorkbook vs ActiveWorkbook, Application state không khôi phục, locale, số dưới dạng text, VBA Round, file mở read-only, .frm/.frx, Unicode tiếng Việt.
4. Đọc test để phát hiện oracle dùng lại chính công thức đang kiểm; yêu cầu các số kỳ vọng độc lập từ golden cases và từ QS.
5. Phân loại Blocker / Major / Minor. Mỗi lỗi có file/vị trí, dữ liệu đầu vào, expected, actual, mức ảnh hưởng và đề xuất sửa.
6. Ghi phần chưa thể kiểm do thiếu Windows/Excel/tài liệu. Không suy diễn PASS.
Kết luận: chặng đủ điều kiện chuyển tiếp hay chưa, vì sao. Sau khi người dùng giao sửa, sửa đúng lỗi đã xác định, chạy lại phép kiểm liên quan và cập nhật STATUS.
