# Đề xuất triển khai web Safari không phụ thuộc máy tính

Ngày: **10/11/2026**. Trạng thái: **đề xuất có thể xem xét; chưa tạo hạ tầng Render, chưa bật tự triển khai, chưa có web app hoàn chỉnh**.

## 1. Việc cần giải quyết trước

Người sử dụng chỉ mở một URL HTTPS trên Safari. Tìm nguồn, lưu lượt, chạy lịch và xử lý nhiều trang nằm ở máy chủ đám mây; iPad không cần cài thêm ứng dụng hoặc giữ máy tính ở công ty chạy.

Thiết kế này khả thi về mô hình web, nhưng nguồn e-GP phải được kiểm chứng trước. `source-probe.mjs` kiểm tra khả năng dùng giao diện nguồn bình thường từ hạ tầng đám mây. Nó không cung cấp API tìm thầu cho người dùng, không phải bộ dữ liệu e-GP và không chứng minh mọi chức năng 4.20.0 đã chuyển.

## 2. Hai giai đoạn đề xuất

### Giai đoạn A — chỉ kiểm chứng nguồn

Chạy một job ngắn bằng CI hoặc container theo thao tác chủ động của người bảo trì. Chỉ thử số trường hợp đã giới hạn. Trình duyệt thao tác UI nguồn; nếu bị yêu cầu xác minh hoặc truy cập không được phép thì ghi kết quả và dừng.

Đầu ra là JSON đã lọc thông tin nhạy cảm cùng kết luận từng cổng. Không mở API công khai, không thu phí người dùng, không chạy lịch liên tục và không gửi tin nhắn ngoài hệ thống. Chưa có lượt live nào được xác nhận đạt trong tài liệu soạn trước CI; đọc artifact từng lần chạy để xác định trạng thái thực tế.

`Dockerfile.prototype` chỉ đóng gói job này. Không nên triển khai nó như một web service rồi kỳ vọng có trang iPad, vì nó không nghe cổng HTTP và sẽ thoát khi kiểm tra xong.

Một lớp HTTP thử nghiệm riêng được chuẩn bị trong `server.mjs`, cùng `Dockerfile.server`. Nó chỉ giúp người bảo trì tạo/đọc/hủy phép thử nguồn qua API có Bearer key; chưa có giao diện người dùng hay database. `/healthz` chỉ báo tiến trình sẵn sàng, không chứng minh kết nối e-GP. Cấu hình hiện giới hạn một job chạy cùng lúc, hai lần khởi tạo mỗi giờ trong cùng tiến trình và thời hạn job sáu phút. Biên bản giữ trong bộ nhớ tối đa một giờ; khởi động lại sẽ mất chúng và đặt lại bộ đếm. Những giới hạn này là lý do chỉ dùng làm dịch vụ thử nguồn tạm thời, không phải backend vận hành.

CI có thể đã đủ để quyết định cổng nguồn; không cần tạo tài nguyên Render chỉ để lặp một phép thử đã bị nguồn từ chối. Nếu sau này cần thử HTTP wrapper từ hạ tầng khác, phải xác nhận workspace và cấu hình triển khai cụ thể trước, đồng thời đo bộ nhớ trình duyệt thực tế. Chưa có phép đo chứng minh một instance miễn phí đáp ứng đủ RAM.

### Giai đoạn B — web và dịch vụ vận hành

Chỉ thực hiện sau khi cổng nguồn đủ bằng chứng, đồng thời vẫn phải nghiệm thu riêng những nghiệp vụ chưa kiểm tra:

| Thành phần | Phạm vi triển khai cụ thể |
|---|---|
| Web HTTPS | Giao diện thích ứng Safari, bộ lọc, kho theo dõi, hồ sơ, lịch, báo cáo và tải tệp |
| API tài khoản | Xác thực, phân quyền, tạo/hủy lượt, đọc tiến độ, lọc và phân trang kết quả |
| Worker | Hàng đợi có checkpoint/idempotency, kết nối nguồn, săn theo lịch, tạo báo cáo dài |
| Database bền vững | Người dùng, tiêu chí, lượt tìm, phiên bản bản ghi, danh mục, theo dõi và lịch sử |
| Object storage | Hồ sơ được phép tải, tệp người dùng nhập, báo cáo xuất và bằng chứng đã làm sạch |
| Theo dõi vận hành | Lỗi nguồn/schema, số trang thiếu, độ trễ, kiểm thử hồi quy và cảnh báo đúng quyền được cấp |

Không chuyển toàn bộ dữ liệu thành HTML cứng. Không giữ kho chính trong bộ nhớ một tiến trình hoặc thư mục tạm của dịch vụ.

## 3. Định hình phương án Render để duyệt

Nếu chọn Render, cấu hình dự kiến gồm một web service/API, một background worker, database và kho tệp. Lịch chạy nền phải dùng scheduler/queue thực, không phụ thuộc tab Safari đang mở. Background worker của Render nhận công việc từ hàng đợi, không trực tiếp nhận request HTTP công khai. Nguồn: [Render — Background workers](https://render.com/docs/background-workers).

Workspace phải do chủ tài khoản xác nhận trước khi tạo tài nguyên; không tự chọn vì chỉ nhìn thấy một workspace. Bản đề xuất **không có blueprint tự áp dụng** và không tự bật deploy khi push Git. Sau khi phương án và phạm vi đã chốt mới chọn vùng máy chủ, loại instance, giới hạn chi phí và quyền nguồn phù hợp.

**Chưa báo giá chi phí Render trong đề xuất này vì chưa xác minh cấu hình/tải cần dùng.** Không coi gói miễn phí là phương án vận hành nhanh liên tục: tài liệu Render cho biết free web service ngủ khi không có lưu lượng, khởi động lại có độ trễ và không có filesystem bền. Nguồn: [Render — Free services](https://render.com/docs/free).

Nếu nguồn chỉ cần HTTP API được phép, Sites Worker cùng kho dữ liệu phù hợp có thể đơn giản hơn. Nếu phải dùng browser runtime, phải chọn nền tảng có browser process và quản lý phiên phù hợp; không giả định mọi Worker HTTP tự chạy được Playwright hoặc Chrome extension.

## 4. Quyền truy cập, độ đúng và rủi ro

- Bộ kết nối dựa trên UI có thể gãy khi nguồn đổi giao diện, kiểm tra truy cập hoặc phiên; phải có canary và dừng khi schema/điều kiện không còn khớp.
- Backend không có quyền bỏ qua CAPTCHA, tạo token giả hay lấy cookie từ iPad. Nếu phương thức truy cập cần sự hỗ trợ của nguồn thì đó là điều kiện triển khai, không phải lỗi có thể che bằng giao diện.
- Mỗi kết quả giữ mã/phiên bản nguồn, URL đối chiếu và giờ lấy. Giá thiếu là chưa biết. Đã quá hạn không tự suy ra chưa có KQLCNT.
- Tốc độ hiển thị cache và tốc độ tra mới phải báo riêng. Dữ liệu mới không được thay bằng dữ liệu mẫu khi nguồn lỗi.
- Tệp hồ sơ cần đường tải riêng đã được kiểm chứng, kiểm MIME/kích thước/nội dung. Không đưa token hoặc HAR vào báo cáo hay CI artifacts.
- Chỉ triển khai gửi thông báo/email/Telegram sau khi có cấu hình và quyền gửi tương ứng. Phép thử nguồn này không gửi tin nhắn.

## 5. Kết quả phải có trước khi đưa URL sử dụng

1. Ma trận đầy đủ chức năng 4.20.0 được đánh dấu bằng bằng chứng chuyển đổi, không chỉ bằng số lượng màn hình.
2. Bộ lấy dữ liệu mới có ít nhất các ca nguồn thật đã nêu trong `ACCEPTANCE.md`.
3. Backend lưu bền và tiếp tục công việc khi iPad đóng tab, không cần PC công ty.
4. Web mở được và thao tác được trên Safari iPad/iPhone thật; ghi phiên bản hệ điều hành và bản dựng.
5. Số liệu tốc độ lấy từ lượt thật, có số mẫu và phạm vi dữ liệu. Các ca lỗi/thiếu trang không bị tính thành lượt thành công.

Đến thời điểm soạn, đây là tài liệu để quyết định triển khai sau cổng nguồn; chưa có căn cứ gọi bản prototype là bản chính thức.
