# 11 Trình tự giao việc và đưa mã vào Excel

| Prompt trong bộ khởi động | Công việc | Bằng chứng cần xem |
| --- | --- | --- |
| 00_khoi_dong | Khảo sát môi trường và chốt hợp đồng dữ liệu. | ENVIRONMENT.md, cấu trúc dự án, hạng mục cần người dùng cung cấp. |
| 01_khung_excel | Tạo khung VBA, mẫu bảng và quy trình build. | Mẫu mở được, macro tự kiểm tra và hướng dẫn build. |
| 02_tra_cuu | Tra mã, bộ lọc, thuyết minh và nguồn. | Thử mã đúng, sai, bỏ dấu và mã cùng số khác bộ. |
| 03_chiet_tinh | Chèn công tác, khối lượng và hao phí. | Ví dụ 250/100 cho ra 5.010.000 đ theo dữ liệu thử. |
| 04_gia_chi_phi | Giá, quy tắc %, tổng hợp và làm tròn. | Thiếu giá bị phát hiện; bảng tổng khớp chi tiết. |
| 05_nhap_dinh_muc | Số hóa phụ lục và quy trình kiểm duyệt. | Mỗi mã phát hành có trang nguồn và người kiểm. |
| 06_thuy_loi | Điều kiện thủy lợi, cấp phối và ca máy. | Không tính trùng vật tư, nhiên liệu hoặc phạm vi công việc. |
| 07_xuat_kiem_tra | Nhập hồ sơ, kiểm tra, xuất và bản in. | File gửi đi tính lại được khi tắt add-in. |
| 08_nghiem_thu | Cài đặt, hiệu năng, hồi quy và 3 hồ sơ thật. | Báo cáo chạy thật, lỗi còn lại, phiên bản phát hành. |
| 09_review | Kiểm độc lập sau mỗi chặng. | Lỗi có vị trí, tình huống tái hiện và cách sửa. |

Nếu chưa có quy trình build tự động: mở workbook trống trong Excel → Alt+F11 → File → Import File, nhập các .bas/.cls/.frm đã xuất đúng định dạng; với UserForm giữ tệp .frx đi kèm. Chạy Debug → Compile VBAProject rồi macro TA_BuildTemplate hoặc TA_SelfTest do chặng 1 cung cấp.

Lưu chương trình thành .xlam. Cài qua File → Options → Add-ins → Manage Excel Add-ins → Go → Browse. Ribbon XML được đưa vào gói add-in theo quy trình build đã kiểm. Các tên macro trên là yêu cầu đầu ra của chặng lập trình, chưa phải lệnh có sẵn trong bộ đặc tả.

Khi Office chặn macro tải về, thực hiện theo chính sách doanh nghiệp và hướng dẫn Microsoft [S12]; ưu tiên bản phát hành đã ký hoặc đường dẫn tin cậy được quản trị viên chấp thuận. Không bật tất cả macro hoặc bỏ bảo vệ toàn hệ thống. Build có truy cập VBA Project cần được giải thích và cấu hình riêng trên máy phát triển.
