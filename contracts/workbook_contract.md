# Hợp đồng file công trình – schema 1.1

Nguồn máy đọc: `contracts/workbook_tables.json` (tên sheet, bảng, cột, loại ô, nhãn). Công thức: `src/resources/formulas.json`. Cả bộ build Python (`scripts/ta/project.py`) và add-in VBA (`modSchema`, `modFormulas` sinh tự động) đọc cùng hai file này, nên không lệch nhau. Cột có `"ext": true` là phần mở rộng so với bản 1.0 (lý do ở `docs/15_spec_issues.md`).

## 1. Loại ô

| kind | Ai ghi | Hiển thị |
|---|---|---|
| `key` | add-in sinh (`IT0001`, `SN0001`, `AN000001`, `EV000001`) | không sửa tay |
| `value` | add-in chép từ catalog/snapshot | không sửa tay |
| `input` | người lập | nền vàng nhạt, chữ xanh, mở khóa |
| `formula` | công thức Excel chuẩn | khóa (chưa bật bảo vệ sheet – xem mục 6) |

## 2. Khóa và quan hệ

```
tblItems.item_id ─┬─< tblAnalysis.item_id            (mỗi công tác nhiều dòng chiết tính)
                  └── tblItems.snapshot_id ── tblSnapshotNorms.snapshot_id (1 snapshot riêng mỗi công tác)
tblSnapshotNorms.snapshot_id ─< tblSnapshotLines.snapshot_id ─ tblAnalysis.snapshot_line_id (SN0001.L1)
tblSnapshotNorms.snapshot_id ─< tblSnapshotNotes.snapshot_id
tblAnalysis.price_id >── tblPrices.price_id            (mặc định "P." & resource_id; đổi được theo biến thể giá)
tblAnalysis.basis_ref ── snapshot_line_id cùng item hoặc token nhóm VL/NC/M (chỉ dòng percent)
tblResourceSummary.(resource_id, price_id) ── tổng các dòng quantity cùng khóa
tblSummary.cost_id: VL, NC, M, T + rule_id của tblCostRules (thứ tự tô-pô)
tblProject.key: schema_version, catalog_release_id (chốt khi chèn mã đầu tiên), round_cost_digits, ...
```

Mọi công thức dùng tham chiếu bảng + khóa (`INDEX/MATCH`, `SUMIFS`), không dùng vị trí dòng → **sắp xếp, chèn, xóa dòng không làm lẫn hao phí giữa các công tác** (đã kiểm bằng kịch bản đảo thứ tự dòng).

## 3. Chuỗi tính (đúng docs/06_spec.md)

| Bước | Ô | Công thức (rút gọn) |
|---|---|---|
| Số đơn vị ĐM | `tblItems.norm_count` | `input_quantity × unit_conversion / norm_basis_qty`; thiếu số hoặc quy mô ≤ 0 → `#N/A` |
| Hao phí áp dụng | `tblAnalysis.effective_amount` | `original_amount × adjustment_factor` (gốc lấy từ snapshot) |
| Lượng tài nguyên | `total_quantity` | `norm_count × effective_amount` (chỉ dòng quantity; dòng % để trống) |
| Giá | `price` | giá áp dụng từ `tblPrices` theo `price_id`; không có → `#N/A` |
| Tiền theo lượng | `qty_cost` | `ROUND(total_quantity × price, TA_RoundCost)` |
| Thành tiền | `cost` | quantity: `qty_cost`; percent: `ROUND(rate/100 × SUMIFS(qty_cost, cùng item, basis), TA_RoundCost)`; cơ sở không tồn tại / tự tham chiếu / % trên % → `#N/A` |
| Giá hiện trường | `tblPrices.effective_price` | `yes`/`n/a`: giá gốc + bốc xếp; `no`: + cước (bắt buộc); giá 0 cần lý do + người xác nhận |
| Tổng công tác | `tblItems.cost_VL/NC/M`, `direct_cost` | `SUMIFS(tblAnalysis[cost], item, nhóm)` |
| Tổng hợp | `tblSummary` | VL/NC/M = `SUMIFS` theo nhóm; T = VL+NC+M; các khoản theo quy tắc, tham chiếu ô trực tiếp |

Tên định nghĩa: `TA_RoundCost`, `TA_RoundPrice` là công thức `INDEX/MATCH` vào `tblProject` (không phụ thuộc vị trí).

## 4. Sheet và ô nhập

| Sheet | Bảng | Ô người lập nhập |
|---|---|---|
| THONG_TIN | tblProject | `value`, `source_ref` |
| TIEN_LUONG | tblItems | `group_id`, `description`, `input_unit`, `input_quantity`, `unit_conversion`, `conversion_basis`, `quantity_note` |
| CHIET_TINH | tblAnalysis | `adjustment_factor` (nên dùng lệnh **Áp hệ số** để có nhật ký), `price_id` |
| GIA_DAU_VAO | tblPrices | địa bàn, kỳ giá, nguồn, giá gốc, thuế, cờ vận chuyển, cước, bốc xếp, lý do giá 0, người xác nhận |
| QUY_TAC_CP | tblCostRules | toàn bộ (người có trách nhiệm) |
| TONG_HOP, TONG_HOP_VT, KIEM_TRA, DM_SNAPSHOT, NHAT_KY | – | không nhập tay (add-in sinh) |

## 5. Bất biến kiểm tra (modValidation / scripts/ta/validate.py)

Chặn phát hành (BLOCKER/ERROR): thiếu khối lượng, hệ số đổi đơn vị sai/thiếu căn cứ, đổi trạng thái đất không căn cứ, dữ liệu DEMO, mã chưa `verified`, nhóm hao phí `unknown`, snapshot khác bộ đã chốt, thiếu mã giá/giá, giá 0 chưa duyệt, dòng % sai cơ sở, hệ số không có nhật ký, trùng khóa, dòng mồ côi, quy tắc vòng lặp/không hỗ trợ, quy tắc chưa `approved`, tổng không khớp (TIEN_LUONG ↔ TONG_HOP ↔ TONG_HOP_VT + dòng %).
Cảnh báo: khối lượng âm có diễn giải, giá đã gồm vận chuyển mà vẫn nhập cước, trộn giá trước/sau VAT, chưa có quy tắc chi phí.

## 6. Xuất và bảo vệ

- File gửi đi là `.xlsx`: chỉ các hàm IF, AND, OR, NOT, ISNUMBER, ISERROR, ISNA, NA, N, INDEX, MATCH, SUM, SUMIF, SUMIFS, COUNTIF, COUNTIFS, SUMPRODUCT, ROUND; không UDF, không liên kết ngoài, không kết nối/query, không macro (kiểm bằng `scripts/ta/xlsx_check.py` và `modExport.SelfContainedProblems`).
- Chưa bật Protect Sheet vì bảng Excel đang bảo vệ không thêm được dòng từ VBA sau khi mở lại file. Ô công thức đã đặt `Locked`; bật/tắt bảo vệ sẽ làm ở chặng 07. Bảo vệ sheet và NHAT_KY **không** chống sửa tuyệt đối.
- In: sheet rộng khổ A3 ngang, sheet khác A4 ngang, vừa 1 trang ngang, lặp dòng tiêu đề. Bố cục in theo mẫu công ty làm ở chặng 07.
