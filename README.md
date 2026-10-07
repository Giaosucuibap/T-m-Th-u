# Giáo Sư Cùi Bắp 4.16.0

Sửa lọc ngày phê duyệt KHLCNT tại máy chủ theo trường chỉ mục thực tế đã kiểm chứng, xếp ngày phê duyệt mới nhất trước và đọc bảng chi tiết để gắn đúng tên–lĩnh vực–giá từng gói. Bản lưu cũ không được dùng giá từ mảng tổng hợp chưa đối chiếu. Tiến độ không đọc cả kho; khoảng thời gian được cố định đến lúc xuất Excel. Giới hạn ACK, chống gửi trùng, Dừng và phục hồi sau khi worker khởi động lại được kiểm thử. Đọc `HUONG-DAN-4.16.0.md` ở thư mục gốc trước khi cập nhật; hướng dẫn này bổ sung cách thay thư mục và giới hạn thử lại.

Danh mục tổ chức và gợi ý tên/mã từ bản 4.15.0 được giữ lại. Có 173 đơn vị tại 34 tỉnh/thành, gồm 31 Ban QLDA Lâm Đồng. 57 mã e-GP đã đối chiếu trực tiếp; chưa có mã thì tìm theo tên. Danh mục chưa phải kiểm kê toàn bộ mọi Ban đang hoạt động. Nạp thư mục `GiaoSuCuiBap` tại `chrome://extensions`. Đọc `HUONG-DAN-4.16.0.md` trước khi cập nhật. Kho và lịch sử tiếp tục dùng IndexedDB; nên xuất sao lưu trước khi cập nhật. Cầu nối E-HSMT trong `native-agent` giữ nguyên thành phần 4.11.0.

Ví dụ: nhập `Đức Trọng; Đơn Dương; Phan Thiết` vào Chủ đầu tư và chọn `Tỉnh Lâm Đồng`. Tên trong danh sách kết hợp theo HOẶC; tỉnh và tiêu chí khác kết hợp theo VÀ. Mỗi mục được tra riêng, gộp theo mã và phiên bản để tránh đếm trùng. Tối đa 20 mục, 500 ký tự; dấu phẩy được giữ trong tên tổ chức.

Áp dụng tại tìm TBMT, KHLCNT, mở thầu, nhà thầu trúng thầu, phân tích địa bàn, hồ sơ chủ đầu tư, đối thủ, bộ săn và bộ lọc chủ đầu tư trong phân tích quan hệ. Phân tích quan hệ dùng kho quan sát đã có. Tra nhà thầu trúng thầu có thể để trống tên/MST để xem các nhà thầu trúng trong nhóm chủ đầu tư đã chọn. Tỉnh của kết quả thiếu địa bàn được đối chiếu qua cùng mã và phiên bản TBMT; chưa chứng minh được thì hiện riêng, không tính vào bảng khớp. Excel giữ tiêu chí ở Đối soát và tách Chưa đủ dữ liệu ở ba báo cáo kết quả trúng thầu/địa bàn/hồ sơ chủ đầu tư.

Giữ kho phân trang, so sánh lượt tìm, sửa lỗi đọc biên bản và 25 mã canary lúc 02:00 thứ Hai giờ Việt Nam. Quyền và mã tiện ích không đổi. Các báo cáo kèm theo phân biệt dữ liệu mô phỏng, Chrome thực và e-GP trực tiếp. Người bảo trì dùng Node.js hỗ trợ `node:test`: chạy `npm test`; kiểm tra múi giờ bằng `npm run test:tz`.

Với người bảo trì mã nguồn: `npm run build` chạy kiểm thử rồi kiểm tra bằng chứng e-GP trực tiếp trong `evidence`. Cổng kiểm tra sẽ chặn bản dựng khi canary Đỏ/Chưa xác định, thiếu trường, tỉnh 703 không khớp Lâm Đồng, mã nguồn thay đổi hoặc bằng chứng đã quá 24 giờ. Không đổi trạng thái trong file để bỏ qua; phải thu lại bằng chứng trên bản mã mới. Kiểm thử tải hồ sơ dùng máy chủ mẫu trong tiến trình thử, không gọi phần mềm e-GP cá nhân.

Chọn Ban QLDA trong bộ chọn xã/phường/ban sẽ chuyển đơn vị vào Chủ đầu tư, không coi mã tổ chức là mã xã. Gợi ý dùng chỉ mục riêng; không đọc toàn bộ kho khi gõ. Có nguồn và ngày đối chiếu; tên/mã mâu thuẫn không được tự lựa chọn. Ví dụ gõ ban 1 tỉnh lâm đồng và chọn đúng đơn vị, tiêu chí dùng mã vn5800939408.
