# Giáo Sư Cùi Bắp 4.11.0

## Cập nhật

Xuất bản sao lưu trong Cấu hình, dừng lượt quét và đóng các trang của tiện ích. Giải nén ZIP mới, thay nội dung thư mục `GiaoSuCuiBap` đang được Chrome nạp rồi bấm tải lại tại `chrome://extensions`. Kiểm tra phiên bản **4.11.0**. Giữ nguyên tiện ích đang cài để giữ kho dữ liệu; không cần gỡ cài đặt. Khi cài lần đầu, dùng **Tải tiện ích đã giải nén**, chọn thư mục chứa `manifest.json`.

## Luồng sử dụng

**Tìm → Kho → Săn → Checklist** là bốn mục chính. Kho giữ các gói đã thu; từ mỗi gói có thể mở checklist đúng gói đó. Checklist có phạm vi kho rõ ràng, lưu theo từng gói. Các chức năng phân tích, kế hoạch, biên bản, chẩn đoán và cấu hình nằm trong **Nâng cao**.

Loại gói lấy theo mã lĩnh vực chính thức của e-GP. Tên gói hỗ trợ phân nhánh thiết kế, giám sát… trong nhóm tư vấn. Nếu thiếu mã hoặc thông tin cần đối chiếu, gói nằm trong nhóm **Chưa đủ dữ liệu**. Chọn xã/phường từ danh sách có mã và tỉnh cha; tên địa danh xuất hiện trong tên chủ đầu tư không chứng minh nơi thực hiện gói.

Tổng số, tổng giá và Excel cùng dùng danh sách đã lọc. Nếu kết quả trải qua nhiều trang giao diện, Excel xuất toàn bộ dòng khớp bộ lọc. Không cộng những dòng ngoài tiêu chí. Kết quả bị giới hạn số trang nguồn vẫn ghi **Một phần**.

## Canary trực tiếp

Lịch mặc định đã đặt **02:00 thứ Hai, giờ Việt Nam**, gồm 25 mã IB / PL / BBMT cùng kiểm tra tỉnh 703. Chrome cần hoạt động để chạy. Nếu bị lỡ lúc Chrome đóng, phần mềm chạy bù trong khung 00:00–04:59 giờ Việt Nam; khi mở lại ban ngày, lịch bù chuyển sang 02:00 hôm sau. Sau lượt thành công, lịch trở về thứ Hai tiếp theo.

Vào **Nâng cao → Chẩn đoán** để xem từng mã hoặc bấm kiểm tra ngay. Cấu hình cho phép bật/tắt và đổi lịch trong giờ thấp điểm.

- **Xanh:** các mã mẫu và trường yêu cầu khớp tại thời điểm kiểm tra, trên phiên bản mã nguồn đang dùng.
- **Đỏ:** có sai khác mã, trường hoặc danh mục tỉnh; dừng các lượt truy vấn để kiểm tra trước khi tiếp tục.
- **Chưa xác định:** có ca chưa đọc được do mạng, trang e-GP hoặc quá thời gian. Không tính là đạt. Nếu trước đó đang Đỏ, khóa tiếp tục được giữ cho đến khi một lượt kiểm tra đầy đủ đạt.

Kiểm tra này lấy mẫu để phát hiện thay đổi; không chứng minh mọi hồ sơ trên e-GP đều đầy đủ. Danh mục mã đối chứng được đóng gói trong `data/live-canary-cases.json`; mã ngừng công khai cần được điều tra và cập nhật có ghi nhận, không tự đổi mã để bỏ qua lỗi.

## Tốc độ và tải hệ thống

Tiện ích dùng lại tab danh sách e-GP, đọc biên bản trên tối đa hai tab chi tiết và giữ cache danh sách 120 giây. Khi dùng cache, mốc dữ liệu được ghi rõ. Gặp HTTP 429, phần mềm chờ theo `Retry-After`, giới hạn số lần thử; yêu cầu chờ quá một phút sẽ kết thúc lượt với dữ liệu đã có, không cố truy vấn sớm.

Bản đồ OpenStreetMap tắt khi mở trang. Bảng thống kê vẫn dùng được; chỉ khi bấm mở bản đồ, trình duyệt mới kết nối máy chủ bản đồ.

## Hồ sơ E-HSMT

Bản này dùng cầu nối Native Messaging. Cài cầu nối từ thư mục `native-agent` trong ZIP rồi kiểm tra trong Chẩn đoán. Đọc [hướng dẫn cầu nối](HUONG-DAN-NATIVE.md). Phần mềm hỗ trợ e-GP chính thức vẫn cần chạy khi tải hồ sơ.

## Khi kết nối gặp lỗi

Giữ dữ liệu đã nhận, xem nguyên nhân và đối chiếu nguồn. **Đọc lại gói này** lấy lại biên bản của gói đã chọn. Không dùng bảng chưa đủ nhà thầu để kết luận mức cạnh tranh hoặc coi giá thiếu là 0. Mốc so sánh giá ghi ngay tại từng gói: dự toán được duyệt khi nguồn có cung cấp; nếu dùng giá gói thầu, nhãn sẽ ghi rõ mốc đó.

HAR đi kèm báo cáo đã bỏ thông tin phiên, cookie, token và nội dung phản hồi; chỉ giữ dấu vết yêu cầu, cấu trúc trường và mã hồ sơ công khai để đối soát.
