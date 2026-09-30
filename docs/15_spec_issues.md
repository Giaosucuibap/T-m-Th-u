# 15 Điểm vênh trong đặc tả và cách đã xử lý (chặng 00, bước 3)

Rà `docs/`, `contracts/`, `tests/` trước khi lập trình. Mỗi điểm có ví dụ cụ thể và quyết định. Các quyết định ghi vào hợp đồng `contracts/workbook_tables.json` (schema 1.1) và `contracts/workbook_contract.md`.

| # | Vấn đề | Ví dụ | Quyết định |
|---|---|---|---|
| 1 | Dòng % chỉ có một cột `cost` → công thức tính % trên cột `cost` tự tham chiếu cột chứa chính nó | `cost` dòng L4 = 2% × SUMIFS(`cost`…) → Excel báo vòng lặp | Thêm cột `qty_cost` (tiền theo lượng, chỉ dòng quantity). Dòng % lấy `SUMIFS(qty_cost…)`. |
| 2 | `basis_ref` trong `norm_demo.json` là mã dòng cục bộ `"L1"` – mơ hồ khi một công trình có hai công tác cùng mã | 2 dòng DEMO.001 đều có `L1` | Trong công trình dùng khóa toàn cục `SN0001.L1` và luôn lọc thêm theo `item_id`. |
| 3 | Định mức thật thường ghi "vật liệu khác x% vật liệu chính" – cơ sở là cả nhóm, không phải một dòng | DEMO.020 | Cho phép `basis_ref` là **một** dòng hoặc token nhóm `VL`/`NC`/`M`. Nhiều dòng lẻ (`L1;L2`) và % trên % bị **chặn có thông báo** (`UNSUPPORTED_MULTI_BASIS`, `PERCENT_ON_PERCENT_UNSUPPORTED`). |
| 4 | Hệ số nhóm (G07) có nhân vào dòng % hay không | NC ×1,1 và dòng "NC khác %" | Chỉ nhân dòng quantity. Dòng % tự tăng theo cơ sở; nhân thêm sẽ thành áp hệ số hai lần. |
| 5 | `includes_transport` là true/false nhưng nhân công, ca máy không có vận chuyển | Giá nhân công | Ba trạng thái `yes` / `no` / `n/a`. `no` bắt buộc nhập cước. Trống = thiếu giá. |
| 6 | Tổng hợp có khoản % tính trên khoản khác trong cùng cột `amount` | TL = % × (T + C) | TONG_HOP dùng tham chiếu ô trực tiếp (`=ROUND(E13/100*(F11+F12),TA_RoundCost)`) do add-in sinh theo thứ tự tô-pô; QS đọc được. |
| 7 | "Thiếu giá không thành 0" nhưng người lập vẫn cần xem tổng tạm | – | Tổng chính thức giữ `#N/A`. Dòng trạng thái TONG_HOP hiện riêng "chi phí trực tiếp tạm tính, bỏ qua dòng lỗi" và số dòng lỗi. |
| 8 | `consumptions=[]` với `verified` không phân biệt "không có hao phí" với "trích thiếu" | DEMO.030 không có máy | Thêm `vl_status`/`nc_status`/`m_status` = `present` / `none_verified` / `unknown`. `unknown` chặn phát hành. |
| 9 | `norm_demo.json` dùng `test_status`/`legal_status`, hợp đồng dùng `status`/`is_demo` | – | Ánh xạ `status = test_status`, `is_demo = true` (luôn chặn phát hành). |
| 10 | VBA `Round` là làm tròn ngân hàng, khác Excel `ROUND` | ROUND(2,5) Excel = 3, VBA Round = 2 | Tiền luôn là công thức Excel. VBA chỉ dùng `WorksheetFunction.Round` khi cần. Python tham chiếu dùng `ROUND_HALF_UP`. |
| 11 | Chuỗi tiếng Việt trong mã VBA | VBE nhập .bas theo bảng mã ANSI của máy | Mã VBA chỉ ASCII. Chuỗi Việt nằm ở `src/resources/strings_vi.json`, sinh sang `\uXXXX` và giải mã bằng `ChrW` lúc chạy. `MsgBox` VBA không hiện Unicode → dùng `MessageBoxW`. |
| 12 | Không có quy tắc làm tròn đơn giá theo đơn vị định mức | Đơn giá × KL hay cộng từng dòng | Bản này làm tròn **thành tiền từng dòng** (`TA_RoundCost`) và giá áp dụng (`TA_RoundPrice`). Cột `unit_price` chỉ để tham khảo. **Cần QS chốt** theo cách trình bày của công ty. |
| 13 | `.gitignore` chặn `dist/` nhưng người dùng cần file DEMO để xem thử | – | Thêm `samples/demo/` (chỉ dữ liệu DEMO, sinh lại được bằng `scripts/build_demo.py`). |
| 14 | Kế hoạch nói "chưa cần đưa lên kho công khai" nhưng repo đang public | – | Chỉ đưa đặc tả, mã và DEMO; tài liệu thật bị `.gitignore` chặn. **Khuyến nghị chuyển repo sang Private** trước khi đưa dữ liệu công ty. |
| 15 | Hằng số tỷ lệ cho bộ quy tắc DEMO | Chi phí gián tiếp, VAT | Không có tỷ lệ mặc định trong mẫu. Bộ DEMO dùng số lạ (3,5%, 2,5%, 7,5%) gắn nhãn `[DEMO]` để không bị nhầm là tỷ lệ pháp lý. |
