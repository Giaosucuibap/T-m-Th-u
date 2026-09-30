# Giá đầu vào và tổng hợp chi phí


Đọc AGENTS.md, CLAUDE.md, STATUS.md, toàn bộ docs và các hợp đồng trong contracts trước khi làm. Đây là dự án Excel VBA trên Windows; giữ nguyên lựa chọn công nghệ trừ khi nêu được trở ngại cụ thể và phương án xử lý.
Không bịa dữ liệu pháp lý. Tiếp tục bằng DEMO nếu thiếu nguồn thật. Tự hoàn thành và sửa lỗi trong phạm vi chặng; không dừng chỉ để đưa kế hoạch. Kết thúc bằng file thay đổi, lệnh chạy, kết quả thực, điểm chưa kiểm trên Excel và cập nhật STATUS.md.


1. GIA_DAU_VAO tách nguồn giá, địa bàn, kỳ giá, quy cách, gồm/chưa gồm thuế, gồm/chưa gồm vận chuyển và đơn giá áp dụng. Không lấy giá mới nhất toàn thị trường làm mặc định.
2. Ánh xạ giá bằng resource_id + biến thể + phạm vi giá. Thiếu giá là missing, giá 0 cần reason+approver; không IFERROR(...,0) che lỗi.
3. Implement CostRules gồm fixed, percentage_on_basis, sum và interpolation có miền hợp lệ. Dựng đồ thị phụ thuộc; từ chối chu trình, basis không tồn tại và công thức arbitrary code. Chỉ thêm các dạng quy tắc thật sự dùng ở bộ pilot.
4. Tách giá mua, cước, bốc xếp và hao hụt được phép; tách ca máy đã công bố với ca máy tự tính. Ngăn cộng hai phương pháp lên nhau.
5. Thuế theo nhóm/cấu phần và hồ sơ, profile có nguồn. Nếu profile chưa xác nhận, tổng nháp được hiển thị và bị chặn phát hành; không tự mặc định 8% hay 10%.
6. Chốt làm tròn theo trường, từ dòng đến tổng; dùng cùng định nghĩa trong test tham chiếu và Excel ROUND. Tổng hợp tài nguyên không cộng dòng % vào lượng vật tư.
Điều kiện đạt: tổng trực tiếp chiết tính khớp tổng hợp; VAT nhiều nhóm không bị gộp sai; giá có sẵn cước không bị cộng cước lần hai; mọi thiếu giá được chỉ đến công tác liên quan.
