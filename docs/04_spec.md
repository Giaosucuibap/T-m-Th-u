# 4 Cấu trúc file dự toán công trình

| Sheet | Nội dung chính | Ai nhập hoặc tạo |
| --- | --- | --- |
| TONG_HOP | Chi phí theo hạng mục, trực tiếp, các khoản bổ sung, thuế và tổng cộng. | Công thức từ chiết tính và quy tắc được chọn. |
| THONG_TIN | Tên công trình, địa bàn, thời điểm, phiên bản bộ định mức, quy tắc làm tròn. | Người lập. |
| TIEN_LUONG | Mã, tên, đơn vị, diễn giải, khối lượng, nguồn và trạng thái từng công tác. | Người lập và add-in. |
| CHIET_TINH | Hao phí gốc, hệ số, hao phí áp dụng, giá, tiền VL–NC–M và khoản %. | Sinh theo từng item_id; cho phép điều chỉnh có lý do. |
| TONG_HOP_VT | Nhu cầu vật liệu, nhân công, máy theo tài nguyên và biến thể giá. | Tổng từ chiết tính; không gộp khác quy cách. |
| GIA_DAU_VAO | Giá mua, vận chuyển, bốc xếp, giá hiện trường; giá nhân công và ca máy. | Người lập; lưu nguồn và thời điểm. |
| QUY_TAC_CP | Tỷ lệ, cơ sở tính, công thức và nguồn cho từng khoản chi phí. | Người có trách nhiệm kiểm tra hồ sơ. |
| KIEM_TRA | Thiếu giá, thiếu hao phí, sai đơn vị, mã trùng, sai công thức, chênh tổng. | Khu vực kiểm tra độc lập. |
| DM_SNAPSHOT | Bản sao định mức, thuyết minh và phiên bản thực sự dùng trong công trình. | Add-in sao chép khi chọn mã. |
| NHAT_KY | Phiên bản, thao tác thay mã, sửa hao phí, đổi giá và người ghi nhận. | Add-in ghi; lưu bản phát hành có dấu kiểm tra. |

Bản v1.1 có thể thêm SO_SANH_GIA_VON, VAN_CHUYEN và GIA_CA_MAY khi cần các bảng tính riêng. Không tạo bảng chi tiết trống chỉ để tăng số lượng sheet.

Mỗi dòng công tác có item_id ổn định: sắp xếp hoặc chèn dòng không làm đổi quan hệ hao phí. Các ô nhập dùng màu nền nhạt và chữ xanh; ô công thức khóa chống sửa nhầm. Bảo vệ sheet không được coi là cơ chế bảo mật hoặc nhật ký không thể sửa.

Các bảng kiểm tra chỉ đọc kết quả từ nguồn và bảng tính. Quy tắc chặn xuất hồ sơ gọi bộ kiểm tra nghiệp vụ trực tiếp; công thức dự toán không lấy số từ sheet KIEM_TRA.
