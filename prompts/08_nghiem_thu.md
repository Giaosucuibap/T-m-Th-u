# Nghiệm thu và đóng gói bản thí điểm


Đọc AGENTS.md, CLAUDE.md, STATUS.md, toàn bộ docs và các hợp đồng trong contracts trước khi làm. Đây là dự án Excel VBA trên Windows; giữ nguyên lựa chọn công nghệ trừ khi nêu được trở ngại cụ thể và phương án xử lý.
Không bịa dữ liệu pháp lý. Tiếp tục bằng DEMO nếu thiếu nguồn thật. Tự hoàn thành và sửa lỗi trong phạm vi chặng; không dừng chỉ để đưa kế hoạch. Kết thúc bằng file thay đổi, lệnh chạy, kết quả thực, điểm chưa kiểm trên Excel và cập nhật STATUS.md.


1. Chạy toàn bộ golden cases, nghiệp vụ thủy lợi và 3 dự toán chuẩn. So từng dòng tài nguyên, direct cost, khoản %, thuế và làm tròn. Không bỏ qua chênh dù tổng cuối tình cờ khớp.
2. Chạy Windows/Excel thật: build .xlam, mở mới, lưu, mở lại, 2 workbook, update library, add/remove/sort item, file đích read-only, đường dẫn tiếng Việt và thao tác bị hủy.
3. Đo lookup sau nạp và sinh 500 item với cấu hình máy ghi rõ; báo p95 trên nhiều lượt hợp lý. Mục tiêu 0,5 giây và 15 giây là tiêu chí kế hoạch, chỉ ghi đạt khi có đo.
4. Kiểm backup, rollback, version của code/template/catalog/schema và snapshot. Migration có version và backup, không sửa nguồn im lặng.
5. Tạo dist gồm add-in, template, catalog có coverage, file mẫu, README cài đặt, CHANGELOG và báo cáo QA. Không đóng gói source nội bộ nhạy cảm vào bản chia sẻ rộng.
6. Hướng dẫn policy macro/ký mã từ Microsoft; không tự sửa registry hoặc Trust Center để vượt chính sách.
Điều kiện đạt: báo cáo nêu test đã chạy, test chưa chạy, lỗi còn lại và tác động; không có blocker tài chính hoặc nguồn dữ liệu. Nếu chưa có Excel thật, sản phẩm chỉ được gắn nhãn chưa nghiệm thu tích hợp.
