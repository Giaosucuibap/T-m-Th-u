# Hợp đồng dữ liệu phiên bản 1

## Thư viện bất biến

Norm identity = source namespace + document_id + revision + code + variant_id. `norm_id` là khóa nội bộ duy nhất, không dùng chuỗi mã như AB.* làm khóa toàn hệ thống. Số liệu gốc không bị sửa khi dùng ở công trình.

Metadata tối thiểu cho dữ liệu thật: document_id, document number, issuing authority, issue_date, effective_from, effective_to (nullable), transition_note, relation_to_previous, source_url, source_file_sha256, source_page, source_table, source_column, reviewer, reviewed_at.

`amount_kind` gồm quantity hoặc percent. Quantity yêu cầu resource_id, resource_unit và amount; percent yêu cầu amount, basis_ref và loại chi phí. Số lượng lưu dưới dạng chuỗi thập phân chuẩn; `2` percent nghĩa là 2%, không phải hệ số 2. Mọi bước tính phải thể hiện phép chia 100.

`norm_basis_qty` > 0, `base_unit` là đơn vị cơ sở và `source_unit_text` giữ nguyên từ nguồn; ví dụ base_unit=m3, norm_basis_qty=100, source_unit_text=100 m³.

## Trạng thái

- `verified`: đã đối chiếu đầy đủ các trường bắt buộc và thuyết minh, có người kiểm.
- `needs_review`: thiếu hoặc nghi ngờ; được tra cứu nhưng chặn xuất chính thức.
- `not_applicable`: một nhóm hao phí được xác nhận không áp dụng; không phải dòng hao phí bị mất.
- `is_demo=true`: luôn chặn phát hành chính thức, kể cả test_status=verified.

Nhóm VL/NC/M cần group_status để phân biệt xác nhận không có hao phí với trích xuất thiếu. `consumptions=[]` cùng verified phải có cơ sở giải thích hợp lệ; không tự suy ra không có chi phí.

## Giá

Khóa giá gồm resource_id, specification, locality, period, source, delivery_condition, tax_basis. Giá thiếu là null; giá 0 cần zero_reason và reviewer. Không gộp hai tài nguyên chỉ vì tên giống. VAT đưa về cùng cơ sở trước khi so sánh, theo phương pháp thuế áp dụng cho hồ sơ.

## Hồ sơ công trình

Mỗi công tác có item_id và snapshot_id riêng, pin code_version, schema_version, catalog_release_id, cost_rule_profile_id. Adjustment là lớp riêng với before/after, scope, basis, reason, author, time. Update catalog không thay snapshot nếu chưa có thao tác cập nhật công trình và xem diff.

## Profile chi phí

Mỗi rule có id, type, base_refs, rate hoặc fixed_amount, điều kiện, rounding_stage, source. Các rule là một đồ thị không chu trình. Tỷ lệ, điều kiện nội suy và khoản thuế không có mặc định pháp lý trong bộ DEMO. Triển khai chỉ hỗ trợ toán tử whitelist; không evaluate mã tùy ý.

## Lưu và xuất

VBA ghi công thức Excel chuẩn; workbook tự chứa bảng snapshot, giá áp dụng và profile. Chữ ký số hoặc checksum giúp quản lý phiên bản; bảo vệ sheet và lịch sử Excel không bảo đảm chống sửa bởi người có toàn quyền file.
