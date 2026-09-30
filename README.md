# TA Estimate — phần mềm dự toán Trường An chạy trên Excel

Mục tiêu: add-in Excel để tra định mức xây dựng và thủy lợi, chèn công tác và lập dự toán ngay trong file công trình.

**Trạng thái (30/09/2026): đã có mã nguồn add-in VBA, mẫu công trình, thư viện DEMO và bộ kiểm thử logic. CHƯA build và CHƯA chạy trên Excel thật** — xem `STATUS.md`.
Dữ liệu DEMO là số giả lập để kiểm thuật toán; không phải định mức hoặc giá pháp lý và không dùng lập hồ sơ thật.

## Xem thử ngay (không cần macro)

Mở bằng Excel các file trong `samples/demo/` (trên GitHub: bấm vào file → **Download raw file**):

| File | Nội dung |
|---|---|
| `Cong_trinh_DEMO.xlsx` | Công trình mẫu 4 công tác DEMO: TIEN_LUONG, CHIET_TINH, TONG_HOP… toàn công thức Excel chuẩn. Dòng 1: 250 m³ theo định mức 100 m³ → **5.010.000 đ**. Sửa khối lượng/giá là tính lại, không cần add-in. |
| `TA_Template.xltx` | Mẫu công trình trống |
| `Catalog_DEMO.xlsx` | Thư viện định mức DEMO (7 mã) cho add-in |

Nếu Excel mở ở chế độ Protected View thì bấm **Enable Editing** để Excel tính lại.

## Build add-in trên Windows

Xem `docs/BUILD.md`: một lệnh PowerShell tạo `dist/TA_Estimate.xlam` (có thẻ Ribbon **Trường An**), sau đó chạy **Tự kiểm tra add-in** và gửi lại file kết quả.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `docs/` | Đặc tả 00–14 (từ bản kế hoạch), `15_spec_issues.md` (điểm vênh và quyết định), `BUILD.md`, `goc/` (file Word gốc) |
| `contracts/` | Hợp đồng dữ liệu; `workbook_tables.json` (schema 1.1 – nguồn duy nhất cho sheet/bảng/cột), `workbook_contract.md`, `catalog_tables.json` |
| `src/vba/` | Mã add-in: `modEntry` (lệnh/Ribbon), `modWorkbook`, `CCatalog` + `modCatalog` (tra cứu), `modEstimate` (chèn công tác, tổng hợp), `modValidation`, `modCostRules`, `modUnits`, `modCalc`, `modExport`, `modLog`, `modApp`, `modText`, `modTests` (TA_SelfTest). Các module `modRes`, `modSchema`, `modFormulas`, `modUnitsData`, `modGolden`, `modDemoData`, `modFormCode` **sinh tự động** bằng `scripts/gen_vba.py` |
| `src/resources/` | `formulas.json` (công thức Excel chuẩn), `strings_vi.json` (chữ tiếng Việt giao diện) |
| `src/ribbon/` | `customUI14.xml` |
| `scripts/` | `build_addin.ps1` (Windows), `build_demo.py`, `gen_vba.py`, `lint_vba.py`, `check_vba_lo.py`, `inject_ribbon.py`, `ta/` (lõi tính tham chiếu, dựng workbook, validator, kiểm file tự chứa) |
| `tests/` | `golden_cases.json` + 56 kiểm thử tự động (`python -m unittest discover -s tests -t .`) |
| `data/demo/` | Dữ liệu DEMO; `data/source`, `data/staging`, `data/released`, `tests/private_projects` dành cho tài liệu thật và bị `.gitignore` chặn |
| `samples/demo/` | File DEMO đã build (sinh lại bằng `python scripts/build_demo.py --out samples/demo`) |

## Quy trình làm việc với Claude Code / Codex

1. Đọc `AGENTS.md`, `STATUS.md`, `docs/`, `contracts/`.
2. Giao lần lượt `prompts/00` → `08`; dùng `prompts/09_review.md` để kiểm độc lập sau mỗi chặng.
3. Chỉ chuyển chặng khi điều kiện đạt đã được kiểm; phần tích hợp Excel phải chạy trên Windows có Excel thật và ghi bằng chứng vào `STATUS.md`.
4. Sửa cấu trúc bảng/công thức/chữ giao diện ở file JSON rồi chạy `python scripts/gen_vba.py` — không sửa tay các module sinh tự động.

Không tự dựng hao phí, giá, thuế suất hoặc nguồn pháp lý. Khi thiếu tài liệu thật, tiếp tục bằng DEMO và ghi rõ phần chờ dữ liệu.

## Tệp cần bổ sung

Đặt tài liệu được phép dùng vào `data/source/` (không đưa lên kho công khai): thông tư và phụ lục chính thức, một file dự toán mẫu, bảng giá địa phương và 3 hồ sơ đã được QS xác nhận. Tạo `source_register.json` theo `contracts/source_register.example.json`.

**Lưu ý:** kho GitHub này đang để **công khai**. Nên chuyển sang Private (Settings → General → Danger Zone → Change visibility) trước khi đưa bất kỳ dữ liệu nào của công ty lên.
