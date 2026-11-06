# Sửa lỗi KHLCNT 4.16.0 — kiểm chứng ngày 05/10/2026

Đã thử lại đúng trường hợp Ban Quản lý dự án đầu tư xây dựng số 1 (`vn5800939408`), Tỉnh Lâm Đồng, Xây lắp, 3 tháng gần đây trên e-GP bằng Chrome 154 trong hồ sơ kiểm thử riêng.

## Nguyên nhân và thay đổi

- Bản 4.15 chưa gửi giới hạn ngày phê duyệt. Đối chứng e-GP không giới hạn có 48 kế hoạch; giới hạn đã chọn có 7. 41 kế hoạch cũ nằm ngoài khoảng được loại ở máy chủ và kiểm lại tại máy.
- e-GP dùng trường chỉ mục `bidCloseDate` cho bộ lọc Ngày phê duyệt KHLCNT. Đã quan sát biểu mẫu gốc, so sánh tập 7 mã với đối chứng 48 mã. Trường này chỉ là ánh xạ chỉ mục KHLCNT; không dùng ngày đóng thầu TBMT thay cho ngày phê duyệt.
- Các mảng tên, lĩnh vực và giá trong danh sách có thể khác thứ tự. Bản sửa không ghép giá theo chỉ số; đọc bảng `bidpPlanDetailToProjectList`, xác nhận mã kế hoạch, phiên bản, mã gói, lĩnh vực, đơn vị VND và số dòng.
- Dùng tối đa hai tab chi tiết do tiện ích tạo, bộ nhớ đệm 30 phút, trả kết quả dần. Lỗi hết thời gian chờ được thử lại tối đa một lần ở cuối hàng đợi. Dừng giữ phần đã nhận; phản hồi trùng không ghi lại hay thay đổi dấu phiên bản.
- Tiến độ chỉ đọc lượt tìm thay vì toàn kho; mốc ngày cố định từ khi bắt đầu tới lúc xuất Excel. BBMT xếp theo ngày mở thực tế trước giới hạn số gói; không cắt trang nguồn theo giới hạn đọc chi tiết.
- Bản lưu cũ giữ giá cũ làm dấu vết đối chiếu, không dùng giá chưa xác minh trong bảng khớp hay Excel. Nhóm thiếu dữ liệu được ghi rõ, không gắn nhãn đã khớp.

## Kết quả kiểm thử trên mã nguồn cuối cùng

- 634/634 kiểm thử đạt; 101/101 mô-đun JavaScript liên kết. 61 ca về ngày và giá chạy đạt ở UTC, Việt Nam và New York.
- Kho kiểm thử 20.000 gói: nguồn kế hoạch thực tế 7/7, 12 gói XL khớp, không còn kế hoạch thiếu bảng. Kết quả đầu 14,5 giây; hoàn tất 23,6 giây; tìm lại cùng tiêu chí 0,6 giây. Kho lớn là dữ liệu mô phỏng cục bộ; 7 kế hoạch là phản hồi e-GP thật, không thay thế phản hồi mạng.
- Lượt độc lập KHLCNT với kho trống hoàn tất khoảng 14,0 giây. Các số đo là mẫu ngày 05/10/2026, không phải cam kết mọi mạng hay giờ cao điểm.
- 7/7 kiểm tra trực tiếp gồm TBMT, KHLCNT, địa bàn, nhà thầu trúng, chủ đầu tư, BBMT và Excel. BBMT đọc được 3 gói thực tế. 25/25 mã canary Xanh; tỉnh 703 khớp Lâm Đồng. Lịch 02:00 thứ Hai giờ Việt Nam được giữ.
- Nâng cấp Chrome 4.15→4.16 đạt 17/17: cùng mã tiện ích, giữ IndexedDB, theo dõi, ghi chú, cấu hình, tiêu chí đã lưu và checklist.
- 5 Excel từ lượt tìm độc lập và 1 Excel của ca kho 20.000 được kiểm tra: mọi dòng mã/tên/giá khớp nguồn; ngày, tiền là kiểu phù hợp; bộ lọc, cố định dòng, màu, chữ đậm/nghiêng, đường kẻ và Đối soát được giữ. Đã xem 61 ảnh ở 28 trang tính.

Trong `PL2600333000-00`, hai gói XL đã đối chiếu là 1.788.792.936 đồng và 744.649.682.068 đồng, tổng 746.438.475.004 đồng. Giá không còn gắn nhầm sang tên gói tư vấn.

## Phạm vi và giới hạn thực tế

Danh sách tiện ích và Excel xếp ngày phê duyệt mới nhất trước. Trang e-GP vẫn do hệ thống đó quyết định thứ tự nội bộ; ba dạng tham số sắp xếp thử trên máy chủ trả HTTP 200 nhưng bị bỏ qua, nên không đưa tham số chưa được hỗ trợ vào bản phát hành. Bộ lọc thời gian đã gửi tới e-GP loại các năm cũ ở ca đã kiểm tra.

Nhãn 3 tháng tương ứng 90 ngày gần đây trong cấu hình hiện tại; mốc thời gian chính xác tới mili giây được ghi trong Đối soát. Với khoảng tự chọn, dùng hai ô ngày. Một bản ghi lịch sử 2022 trong đối chứng không có trường chỉ mục ngày; bằng chứng 7 mã hiện tại không chứng minh mọi hồ sơ lịch sử đều đủ trường.

Nếu mất mạng, nguồn thiếu bảng hoặc worker dừng giữa lượt, kết quả chưa đủ được giữ và báo riêng; không biến lỗi thành kết quả rỗng thành công. Giới hạn 200 bảng chi tiết và 2.000 bản ghi lượt rộng vẫn được thông báo. Chỉ tổng các gói đã khớp được dùng.

Một số tên thành viên liên danh trong nguồn địa bàn còn trống, có mã số thuế; không tự điền tên suy đoán. Ảnh Excel dựng bằng công cụ đọc XLSX độc lập, chưa phải ảnh Microsoft Excel hay trang in. Công cụ ảnh hiển thị một số tiền thập phân ở dạng số thô dù định dạng tiền đã lưu đúng; nó tạo đủ 61 ảnh không lỗi dựng rồi thoát với mã 1, trạng thái này được lưu trong bằng chứng.

Giữ nguyên mã tiện ích và quyền. NativeHost E-HSMT giữ nguyên bản 4.11.0. File 4.15 đã giao không bị sửa. ZIP được đối chiếu từng file với mã nguồn đã thử và kiểm tra CRC trước giao.
