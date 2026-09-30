# Môi trường triển khai (chặng 00)

Cập nhật: 2026-09-30. Ghi rõ cái đã kiểm và cái chưa biết. **Chưa có máy Windows/Excel thật trong phiên này.**

## 1. Môi trường lập trình đã dùng (phiên Claude Code trên cloud)

| Hạng mục | Thực tế đã kiểm |
|---|---|
| Hệ điều hành | Ubuntu 24.04 (container Linux) – **không phải Windows** |
| Excel desktop | **Không có** |
| PowerShell | Không có (script `build_addin.ps1` chưa chạy lần nào) |
| Python | 3.11, openpyxl 3.1.5, lxml |
| LibreOffice | 24.2.7 (đã cài thêm `libreoffice-calc`), dùng để tính lại công thức và biên dịch thử VBA ở chế độ tương thích |
| Git | Có; repo `Giaosucuibap/T-m-Th-u` – **đang để công khai (public)** |

Hệ quả: mọi kiểm thử trong phiên này là **kiểm logic** (Python + LibreOffice). Ribbon, UserForm, VBA chạy trên Excel **chưa được kiểm** – trạng thái NOT RUN.

## 2. Máy sử dụng của công ty (cần anh/chị cung cấp)

| Hạng mục | Giá trị | Cách lấy |
|---|---|---|
| Windows | CHƯA BIẾT | Settings → System → About |
| Phiên bản Excel | CHƯA BIẾT – giả định Microsoft 365 hoặc Excel 2024 | Excel → File → Account → About Excel |
| 32/64 bit | CHƯA BIẾT – giả định 64 bit | Cùng hộp thoại About Excel |
| Dấu thập phân / phân cách | CHƯA BIẾT | Chạy `TA_SelfTest`, kết quả ghi tự động |
| Chính sách macro | CHƯA BIẾT | File → Options → Trust Center; hỏi quản trị mạng nếu có |
| Máy in A3/A4 | CHƯA BIẾT | – |

Cách nhanh nhất: sau khi cài add-in, bấm **Trường An → Tự kiểm tra add-in** (`TA_SelfTest`). Workbook kết quả ghi sẵn phiên bản Excel, build, hệ điều hành, 32/64 bit, dấu thập phân, dấu phân cách danh sách. Gửi file đó lại để cập nhật bảng này.

## 3. Giả định đang dùng

- Baseline: Windows + Excel 365/2024 **64 bit** (mã VBA vẫn khai báo cả nhánh 32 bit cho `MessageBoxW`).
- Nếu công ty dùng Mac hoặc Excel web: add-in VBA **không chạy** (Excel web không chạy VBA; Mac không có `user32`). Khi đó cần chốt lại phạm vi trước khi lập trình tiếp.
- File công trình `.xlsx` chỉ dùng công thức Excel chuẩn nên mở/tính lại được trên máy không cài add-in.
