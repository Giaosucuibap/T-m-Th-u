# Khảo sát môi trường và khởi tạo dự án


Đọc AGENTS.md, CLAUDE.md, STATUS.md, toàn bộ docs và các hợp đồng trong contracts trước khi làm. Đây là dự án Excel VBA trên Windows; giữ nguyên lựa chọn công nghệ trừ khi nêu được trở ngại cụ thể và phương án xử lý.
Không bịa dữ liệu pháp lý. Tiếp tục bằng DEMO nếu thiếu nguồn thật. Tự hoàn thành và sửa lỗi trong phạm vi chặng; không dừng chỉ để đưa kế hoạch. Kết thúc bằng file thay đổi, lệnh chạy, kết quả thực, điểm chưa kiểm trên Excel và cập nhật STATUS.md.


1. Kiểm tra thư mục hiện tại, Git, hệ điều hành và công cụ đã cài. Xác định có Excel desktop thật hay chỉ môi trường Linux. Không tự nhận Excel đã có.
2. Tạo ENVIRONMENT.md ghi Windows, Excel version/bitness, locale số, quyền macro, máy thử và các phần chưa biết. Nếu chưa có thông tin, giữ baseline 64 bit và tiếp tục.
3. Rà các file đặc tả để phát hiện xung đột: đơn vị/100, dòng %, profile giá, snapshot, vòng lặp công thức. Báo vấn đề bằng ví dụ cụ thể.
4. Tạo src/vba, src/ribbon, scripts, data/source, data/staging, data/released, tests/private_projects, dist. Đọc .gitignore trước khi đưa hồ sơ thật vào Git.
5. Viết contracts/workbook_contract.md dựa trên workbook_tables.json: khóa, tên cột, quan hệ, ô nhập, công thức, các sheet được xuất.
6. Chốt kế hoạch build bằng Excel thật. Nếu không có Windows/Excel, vẫn viết mã nguồn và hướng dẫn build cục bộ; trạng thái integration chưa chạy phải hiện rõ.
Điều kiện đạt: không có định mức/thuế suất được tự bịa; cấu trúc thư mục và kế hoạch build cụ thể; tiếp tục thực hiện khung nhỏ nhất có thể chạy kiểm dữ liệu DEMO.
