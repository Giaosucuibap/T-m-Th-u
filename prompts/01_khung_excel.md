# Tạo khung VBA và mẫu công trình


Đọc AGENTS.md, CLAUDE.md, STATUS.md, toàn bộ docs và các hợp đồng trong contracts trước khi làm. Đây là dự án Excel VBA trên Windows; giữ nguyên lựa chọn công nghệ trừ khi nêu được trở ngại cụ thể và phương án xử lý.
Không bịa dữ liệu pháp lý. Tiếp tục bằng DEMO nếu thiếu nguồn thật. Tự hoàn thành và sửa lỗi trong phạm vi chặng; không dừng chỉ để đưa kế hoạch. Kết thúc bằng file thay đổi, lệnh chạy, kết quả thực, điểm chưa kiểm trên Excel và cập nhật STATUS.md.


1. Tạo module modEntry, modWorkbook, modValidation, modData, modLog, modTests và giao diện gọi lệnh. Option Explicit ở mọi module.
2. Implement TA_BuildTemplate, TA_SelfTest. Tạo các sheet và Excel Tables đúng workbook_tables.json; công thức tài chính chưa có dữ liệu phải báo trạng thái rõ, không điền số giả vào hồ sơ thật.
3. Template dùng .xltx; chương trình .xlam; mỗi công trình .xlsx. Không để module chương trình trong project .xlsx. Đặt tên workbook khi thao tác rõ ràng, không nhầm ThisWorkbook của add-in với file công trình.
4. Bản đầu cho phép gọi macro qua Alt+F8; sau đó tạo Ribbon XML nhóm Trường An và callback. Không dùng OCX TreeView. Nếu UserForm dùng .frm phải đóng gói .frx tương ứng.
5. Tạo quy trình build tái lập từ các file nguồn bằng Windows Excel. Không yêu cầu tắt Trust Center toàn hệ thống. Nếu tự động hóa VBProject bị chặn, cung cấp đường import thủ công chính xác.
6. Dùng nhãn tiếng Việt từ resource workbook/Unicode phù hợp; thử trên máy locale tiếng Anh và tiếng Việt nếu có. Không chỉ kiểm ASCII.
Điều kiện đạt: compile VBA; mở/save/reopen mẫu; hai workbook mở cùng lúc không ghi sai đích; lỗi giữa thao tác phải khôi phục Events/Calculation/ScreenUpdating.
