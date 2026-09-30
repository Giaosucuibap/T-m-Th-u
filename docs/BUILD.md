# Build, cài đặt và nghiệm thu trên Excel thật

Tài liệu cho người lập trình / người thử trên máy Windows có Excel desktop. Người dùng cuối **không** cần Python.

## 0. Chuẩn bị (máy phát triển)

1. Tải mã: GitHub → **Code → Download ZIP**, giải nén vào ví dụ `C:\TA_Estimate` (hoặc `git clone`).
2. Excel 365/2024 64 bit. Ghi phiên bản: File → Account → About Excel.
3. Chỉ trên máy build: File → Options → Trust Center → Trust Center Settings → Macro Settings → tích **Trust access to the VBA project object model**. Không cần bật "Enable all macros". Có thể tắt lại sau khi build.

## 1. Build tự động (khuyến nghị)

Mở PowerShell tại thư mục dự án:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_addin.ps1
```

Script: tạo workbook trống → nhập `src\vba\*.bas, *.cls` → tạo form `frmSearch` bằng control MSForms chuẩn → gỡ 2 module chỉ dùng khi build (`modDevBuild`, `modFormCode`) → lưu `dist\TA_Estimate.xlam` → chèn Ribbon `src\ribbon\customUI14.xml` → in SHA-256.

Sau đó mở `dist\TA_Estimate.xlam` bằng Excel, `Alt+F11` → **Debug → Compile VBAProject**. Không được có lỗi. (Trình biên dịch VBA thật chỉ có trên Excel; trong phiên lập trình đã kiểm tĩnh bằng `scripts/lint_vba.py` và biên dịch thử bằng LibreOffice Basic – chưa thay được bước này.)

## 2. Build tay (khi không được bật Trust access)

1. Excel → workbook trống → `Alt+F11`.
2. File → Import File: lần lượt nhập **tất cả** `src\vba\*.bas` và `src\vba\CCatalog.cls`.
3. Form tra cứu cần Trust access để tạo tự động. Nếu không có: bỏ qua; lệnh **Tra cứu** sẽ tự chuyển sang **Chèn theo mã** (hộp thoại nhập mã).
4. Xóa module `modDevBuild` và `modFormCode` (chuột phải → Remove, chọn No khi hỏi Export).
5. Debug → Compile VBAProject.
6. File → Save As → loại **Excel Add-in (*.xlam)** → `TA_Estimate.xlam`.
7. Ribbon: đóng Excel, chạy `python scripts\inject_ribbon.py dist\TA_Estimate.xlam` (hoặc dùng Office RibbonX Editor chèn `src\ribbon\customUI14.xml`). Không có Ribbon vẫn dùng được qua `Alt+F8`.

## 3. Cài đặt cho người dùng

1. Chép `TA_Estimate.xlam` và `Catalog_DEMO.xlsx` (hoặc bộ catalog đã phát hành) vào một thư mục cố định, ví dụ `C:\TA_Estimate\bin`.
2. Excel → File → Options → Add-ins → Manage: Excel Add-ins → Go → Browse → chọn `TA_Estimate.xlam` → OK.
3. Nếu Office chặn macro tải từ Internet: chuột phải file → Properties → Unblock, hoặc để file trong **Trusted Location** do quản trị viên cấp. Không bật "Enable all macros". Xem hướng dẫn Microsoft [S12].
4. Xuất hiện thẻ **Trường An** trên Ribbon.

## 4. Kiểm tra trên Excel thật (ghi kết quả vào STATUS.md)

| # | Thao tác | Kỳ vọng |
|---|---|---|
| 1 | Trường An → **Tự kiểm tra add-in** | Workbook kết quả mở ra, **0 FAIL**, có ghi phiên bản Excel/bitness/dấu thập phân. Gửi file này lại. |
| 2 | **Công trình mới** | Workbook mới có 10 sheet, bảng đúng tên; tiêu đề tiếng Việt hiển thị đúng dấu |
| 3 | **Nạp thư viện** → chọn `Catalog_DEMO.xlsx` | Thông báo 7 mã, 23 dòng hao phí, cảnh báo DEMO |
| 4 | **Tra cứu và chèn** → gõ `khoan phut` | Ra DEMO.010 (tên có dấu), chi tiết có hao phí + thuyết minh, nhãn CẦN KIỂM |
| 5 | Gõ `DEMO.001` | 3 kết quả: 2 revision + 1 bộ DEMO-TL |
| 6 | Chèn DEMO.001 (bộ DEMO rev 1), khối lượng 250; nhập giá ở GIA_DAU_VAO: VL1 20000 (yes), NC1 400000 (n/a), M1 1000000 (n/a) | TIEN_LUONG: chi phí trực tiếp **5.010.000** |
| 7 | Chọn dòng đó → **Áp hệ số** NC 1.1 có lý do | NC = 2.200.000; dòng khác không đổi; NHAT_KY có dòng ghi |
| 8 | Sắp xếp TIEN_LUONG/CHIET_TINH theo cột bất kỳ | Số liệu từng công tác không đổi |
| 9 | Xóa giá VL1 | Ô VL và tổng hiện `#N/A` (không phải 0); **Kiểm tra hồ sơ** báo MISSING_PRICE đúng dòng |
| 10 | **Cập nhật tổng hợp**, **Kiểm tra phát hành** | Bị chặn vì DEMO + quy tắc chưa duyệt |
| 11 | Lưu `.xlsx`, đóng, **gỡ add-in**, mở lại, sửa khối lượng/giá | Tính lại đúng, không `#NAME?`, không hỏi liên kết ngoài |
| 12 | Mở hai công trình, chèn vào file đang chọn | Chỉ file đang chọn thay đổi |
| 13 | Lỗi giữa chừng (ví dụ chèn khi đang ở file không phải công trình) | Thông báo lỗi tiếng Việt; Excel vẫn tự tính, màn hình cập nhật bình thường |
| 14 | `Alt+F8` → `TA_PerfTest` (N = 500) | Ghi thời gian chèn và tính lại (mục tiêu kế hoạch ≤ 15 giây, chỉ ghi ĐẠT khi đo được) |
| 15 | In thử TONG_HOP (A4) và TIEN_LUONG (A3) | Không mất cột; chữ đọc được |

Chưa chạy mục nào thì ghi **NOT RUN**, không ghi PASS.

## 5. Máy phát triển có Python (không bắt buộc cho người dùng)

```bash
pip install openpyxl lxml
python scripts/gen_vba.py        # sinh lại modRes/modSchema/modFormulas/... sau khi sửa JSON
python scripts/lint_vba.py       # kiểm tĩnh VBA
python scripts/build_demo.py --out samples/demo
python -m unittest discover -s tests -t . -v   # cần LibreOffice cho phần kiểm công thức
```
