# Giáo Sư Cùi Bắp 4.10.1

Bản sửa lỗi lọc dữ liệu, đối soát kết quả, sao lưu và quản lý hồ sơ. Ngày phát hành và kết quả chạy thử được ghi trong báo cáo đi kèm gói ZIP.

## Cập nhật bản đang sử dụng

1. Vào Cấu hình của bản đang dùng, xuất bản sao lưu và giữ file đó ở nơi riêng.
2. Dừng lượt quét đang chạy, đóng các trang chức năng của tiện ích và các tab e-GP đang được lượt quét sử dụng.
3. Giải nén ZIP mới. Sao chép nội dung thư mục `GiaoSuCuiBap` vào đúng thư mục tiện ích Chrome đang nạp, thay thế các file cũ.
4. Mở `chrome://extensions`, tìm Giáo Sư Cùi Bắp và bấm nút tải lại. Kiểm tra phiên bản hiện là **4.10.1**.
5. Mở lại chức năng từ icon tiện ích. Chạy một lượt tìm mới để có kết quả đã đối soát theo bộ lọc mới.

Không cần gỡ tiện ích để cập nhật; gỡ tiện ích có thể xóa kho dữ liệu của nó. Bản mới giữ khóa định danh extension để hỗ trợ cập nhật tại cùng vị trí. Nếu cài lần đầu: bật Chế độ dành cho nhà phát triển tại `chrome://extensions`, chọn Tải tiện ích đã giải nén và trỏ tới thư mục `GiaoSuCuiBap` chứa `manifest.json`.

## Đọc kết quả đúng phạm vi

- **Khớp tiêu chí:** có đủ dữ liệu để đáp ứng điều kiện đã chọn. Điểm phù hợp là bước ưu tiên xử lý tiếp theo.
- **Chưa đủ dữ liệu:** thiếu trường cần đối chiếu, chẳng hạn giá hoặc ngày. Xem nhóm này riêng và mở nguồn e-GP để kiểm tra.
- **Ngoài tiêu chí:** dữ liệu cho thấy gói không đáp ứng ít nhất một điều kiện. Không cộng nhóm này vào số gói khớp.
- **Kết quả một phần:** chưa xác nhận lấy đủ số trang hoặc số bản ghi của nguồn. Có thể xem dữ liệu đã nhận; cần chạy lại hoặc thu hẹp phạm vi nếu muốn đối soát đầy đủ.

Ô “Đạt ngưỡng điểm” chỉ lọc theo điểm; bộ chọn trạng thái khớp tiêu chí có ý nghĩa riêng. Kế hoạch thiếu dữ liệu và biên bản chưa xác định được ngày có nhóm riêng để kiểm tra. Giá thiếu không được xem là giá 0.

## Khi e-GP bị ngắt kết nối

Phần mềm giữ dữ liệu đã nhận và hiển thị trạng thái chưa đầy đủ. Kiểm tra trang e-GP đã hoạt động trở lại, sau đó đọc lại gói hoặc chạy lại lượt tìm. Dữ liệu được đối soát lại; không coi thông báo lỗi mạng hoặc phản hồi rỗng bất thường là kết quả tìm bằng 0.

Giữ các tab đọc biên bản cho tới khi lượt quét hoàn tất. Bảng nhà thầu chỉ lấy giá trị nguồn đã công bố. Giá sau giảm và chênh lệch so với mốc giá được ghi rõ; chưa có số liệu thì để trạng thái chưa xác định.

## Dữ liệu và hồ sơ

Bản sao lưu bao gồm các nhóm hồ sơ nghiệp vụ được hỗ trợ, nhưng không mang theo khóa bí mật hoặc tự bật lịch gửi thông báo khi khôi phục. Khi chuyển máy, kiểm tra cấu hình thông báo và lịch quét trước khi bật lại theo nhu cầu.

Điểm phù hợp, gợi ý hợp đồng tương tự và từ khóa HSMT hỗ trợ sàng lọc. Chúng không thay cho việc đọc hồ sơ gốc, đánh giá năng lực có chứng cứ hoặc kết quả lựa chọn nhà thầu do chủ đầu tư công bố.
