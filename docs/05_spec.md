# 5 Mô hình dữ liệu dành cho lập trình

| Bảng logic | Các trường bắt buộc hoặc quan trọng |
| --- | --- |
| Documents | document_id, số văn bản, cơ quan, ngày ban hành, hiệu lực, quan hệ thay thế, URL, hash tệp. |
| Norms | norm_id, document_id, mã, phiên bản, phụ lục/chương/nhóm, tên, đơn vị gốc, norm_basis_qty, trạng thái kiểm. |
| Resources | resource_id, loại VL/NC/M, tên, quy cách/cấp bậc, đơn vị, namespace nguồn. |
| Consumptions | line_id, norm_id, resource_id, quantity hoặc percent, basis_ref, scope, vị trí nguồn. |
| Notes | note_id, phạm vi chung/chương/nhóm/mã, nội dung, thứ tự và liên kết nguồn. |
| Prices | price_id, resource_id, quy cách, địa bàn, kỳ giá, nguồn, thuế, vận chuyển, đơn giá áp dụng. |
| ProjectItems | item_id, norm_id và revision đã chốt, khối lượng nhập, đơn vị, hệ số quy đổi, tham số kỹ thuật. |
| Overrides | item_id/line_id, giá trị gốc, giá trị sửa, lý do, căn cứ, người và thời điểm. |
| CostRules | rule_id, loại khoản, base_refs, tỷ lệ/giá trị, điều kiện, thứ tự phụ thuộc, nguồn và phiên bản. |

Khóa định mức phải phân biệt bộ nguồn + phiên bản + mã + biến thể. Không dùng riêng chuỗi mã làm khóa toàn hệ thống. Khi sửa hao phí cho một công tác, lưu lớp điều chỉnh của công tác đó; không sửa thư viện gốc hoặc các công tác khác dùng cùng mã.

Lưu số thập phân trong JSON dưới dạng chuỗi chuẩn dấu chấm; ngày dùng YYYY-MM-DD. Giao diện Việt Nam định dạng lại dấu thập phân và phân cách hàng nghìn. Giá để trống là chưa có giá; giá 0 chỉ hợp lệ khi có lý do và người xác nhận.

Tách amount_kind = quantity và percent. Dòng % có cơ sở tính tường minh, không được cộng vào tổng kg/m³/công/ca. Mỗi dòng hao phí có trạng thái: verified, needs_review hoặc not_applicable. Không nhầm “nhóm này không có hao phí theo nguồn” với “dữ liệu trích xuất còn thiếu”.

Trong workbook dùng Excel Tables và tên cột cố định; danh sách bảng trên có thể ánh xạ thành nhiều bảng trên cùng sheet. Bộ hợp đồng dữ liệu trong thư mục contracts mô tả trường, trạng thái và bất biến cần kiểm tra.
