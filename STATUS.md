# Trạng thái triển khai

Ngày khởi tạo đặc tả: 2026-09-30

- Đã có: đặc tả; môi trường và điểm vênh (`ENVIRONMENT.md`, `docs/15_spec_issues.md`); hợp đồng workbook schema 1.1; mã nguồn add-in VBA (chưa build); mẫu công trình, catalog và công trình DEMO; lõi tính tham chiếu; 56 kiểm thử tự động.
- Chưa có: `TA_Estimate.xlam` đã build; bất kỳ kết quả chạy trên Excel thật nào; thư viện định mức chính thức đã kiểm; 3 hồ sơ đối chiếu.
- Chặng tiếp theo: **build và chạy thử trên Windows/Excel** theo `docs/BUILD.md` mục 4 (điều kiện đạt của chặng 01–04), sau đó 05_nhap_dinh_muc khi có phụ lục TT38/TT37.
- Giả định: Windows, Excel 365/2024 64 bit; cấu hình thực CHƯA BIẾT.

## Cập nhật 2026-09-30 – chặng 00 đến 04 (phần logic)

Chặng: 00_khoi_dong, 01_khung_excel, 02_tra_cuu, 03_chiet_tinh, 04_gia_chi_phi — hoàn thành phần mã nguồn và kiểm thử logic; phần tích hợp Excel NOT RUN.
Commit: nhánh `claude/hopeful-bardeen-bqudvv` (xem git log / PR).
Người/công cụ thực hiện: Claude Code (phiên cloud, Linux, không có Excel).

File tạo hoặc sửa:
- `ENVIRONMENT.md`, `docs/15_spec_issues.md`, `docs/BUILD.md`, `contracts/workbook_contract.md`, `contracts/workbook_tables.json` (1.0 → 1.1), `contracts/catalog_tables.json`, `contracts/source_register.example.json`
- `src/vba/*` (14 module viết tay + 7 module sinh tự động + `CCatalog.cls` + `forms/frmSearch.code.vba`), `src/ribbon/customUI14.xml`, `src/resources/*.json`
- `scripts/` (build_addin.ps1, build_demo.py, gen_vba.py, lint_vba.py, check_vba_lo.py, inject_ribbon.py, `ta/`)
- `data/demo/catalog_demo.json`, `samples/demo/*`, `tests/test_engine.py`, `tests/test_workbook.py`, `tests/test_tooling.py`

Lệnh kiểm tra đã chạy:
```
python3 -m unittest discover -s tests -t .      # 56 test, OK
python3 scripts/lint_vba.py                     # 23 file, 0 vấn đề
python3 scripts/check_vba_lo.py                 # 21 module + 1 lớp nạp vào LibreOffice Basic (VBA mode), 0 lỗi
python3 scripts/build_demo.py --out samples/demo
```

Kết quả kiểm tra logic (Python Decimal + LibreOffice 24.2 tính lại công thức):
- 16/16 golden case đạt ở lõi tham chiếu; VBA `TA_SelfTest` có cùng 16 ca (chưa chạy).
- Công thức Excel trong file công trình (tính bằng LibreOffice): 250 m³ / ĐM 100 m³ → norm_count 2,5; VL 510.000; NC 2.000.000; M 2.500.000; **trực tiếp 5.010.000** (khớp G06); hệ số NC 1,1 chỉ ở một dòng cùng mã → NC 2.200.000, dòng kia không đổi (G07); 1,2 t → 1.200 kg (G08); dòng % theo nhóm VL đúng; tổng TIEN_LUONG = TONG_HOP = TONG_HOP_VT + dòng %; quy tắc chi phí DEMO khớp lõi tham chiếu.
- Thiếu giá → `#N/A` lan lên tổng (không thành 0), số dòng lỗi và tổng tạm hiện riêng; quy mô 0, khối lượng trống, % tự tham chiếu → `#N/A`; giá 0 chỉ hợp lệ khi có lý do + người xác nhận; giá đã gồm vận chuyển không cộng cước lần hai.
- Đảo thứ tự dòng các bảng → kết quả từng công tác không đổi.
- Validator bắt đủ: thiếu khối lượng, đổi trạng thái đất không căn cứ, hệ số đổi đơn vị sai, % tự tham chiếu, mã cần kiểm, hệ số không nhật ký, cước trùng, giá 0, quy tắc vòng lặp, DEMO, bộ quy tắc chưa duyệt.
- File .xlsx/.xltx tạo ra: không liên kết ngoài, không macro, không kết nối, chỉ dùng 18 hàm Excel chuẩn trong danh sách cho phép.
- Tìm kiếm: `DEMO.001` ra 3 mã (2 revision + 1 bộ khác), `khoan phut` không dấu ra DEMO.010, `bê tông` ra DEMO.020, từ khóa lạ không ra kết quả; thuật toán bỏ dấu VBA mô phỏng khớp Python.
- VBA: kiểm tĩnh (khối lệnh, biến chưa khai báo, gọi thủ tục không tồn tại, trùng khai báo, Exit sai loại) – bộ kiểm đã được thử bằng 10 lỗi cài cố ý và bắt đủ; biên dịch thử bằng LibreOffice Basic đạt sau khi thay tạm 2 cú pháp LibreOffice không hỗ trợ (`Declare PtrSafe`, `vbObjectError` trong hằng).

Kết quả chạy trên Excel thật: **NOT RUN** (không có Windows/Excel trong phiên). Chưa kiểm: biên dịch VBA thật, Ribbon, UserForm, `TA_SelfTest`, hiệu năng 500 công tác, in A3/A4, mở file trên máy không cài add-in bằng Excel thật, locale tiếng Việt.

Vấn đề còn lại và tác động:
1. Toàn bộ VBA chưa từng chạy trên Excel → có thể còn lỗi thời gian chạy (đặc biệt: `ListObject.Resize`, gán `Validation` với danh sách phân cách dấu phẩy trên máy locale Việt, `Application.InputBox`). Chặn dùng thật cho tới khi `TA_SelfTest` đạt 0 FAIL.
2. Form tra cứu tạo bằng mã lúc build (cần Trust access trên máy build). Không có thì dùng lệnh "Chèn theo mã".
3. Quy tắc làm tròn đơn giá/thành tiền cần QS chốt theo mẫu công ty (hiện làm tròn thành tiền từng dòng).
4. Bố cục in TIEN_LUONG/CHIET_TINH còn nhiều cột kỹ thuật, chữ nhỏ trên A3 → làm ở chặng 07 theo mẫu in của công ty.
5. Chưa có: thay mã có xem khác biệt (G16 mới ở mức "không tự cập nhật"), cấp phối/ca máy (chặng 06), nhập hồ sơ Excel và xuất bản phát hành (chặng 07), bật/tắt bảo vệ sheet.
6. Repo đang public: không đưa dữ liệu công ty lên trước khi chuyển Private.

Dữ liệu còn thiếu: phụ lục TT 38/2026/TT-BXD và TT 37/2026/TT-BNNMT (PDF gốc); file dự toán mẫu của công ty (mẫu in); bảng giá địa phương; 3 hồ sơ đã được QS xác nhận (kênh bê tông, đường, khoan phụt); thông tin máy Excel (phiên bản, 32/64 bit).

Việc tiếp theo:
1. Trên máy Windows: build theo `docs/BUILD.md`, chạy `TA_SelfTest`, đi hết bảng kiểm mục 4, ghi PASS/FAIL/NOT RUN vào đây kèm file kết quả.
2. Giao `prompts/09_review.md` cho công cụ còn lại (Codex) rà phần này.
3. Khi có phụ lục: chặng 05 (số hóa có kiểm soát, ~150 mã pilot).
