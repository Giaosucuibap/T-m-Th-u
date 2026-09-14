# Báo cáo sửa lỗi Giáo Sư Cùi Bắp 4.10.1

Ngày kiểm thử: 14/09/2026. Bản phát hành sửa các lỗi đã xác nhận trong lần đánh giá 4.10.0, đồng thời tích hợp lại các sửa chữa đã kiểm chứng ở 4.8.1. Các ZIP đầu vào được giữ nguyên.

## Những thay đổi chính

| Nhóm | Lỗi đã xử lý và hành vi sau sửa |
|---|---|
| Bộ lọc tìm kiếm | Kiểm tra tỉnh, xã/phường, chủ đầu tư, giá, từ khóa, loại gói và thời gian bằng cùng một bộ lọc trước khi thống kê, thông báo và xuất dữ liệu. Tỉnh không nhận diện được không trở thành tìm toàn quốc. Tên tỉnh đối chiếu chính xác, có hỗ trợ mã hiện hành và mã cũ cùng tên. |
| Dữ liệu thiếu | Phân biệt khớp tiêu chí, chưa đủ dữ liệu và ngoài tiêu chí. Giá thiếu không thành giá 0; ngày thiếu không được tự thay bằng một loại ngày khác. Dữ liệu thiếu được giữ riêng để người dùng kiểm tra. |
| KHLCNT | Lọc giá, loại gói và từ khóa ở từng gói trong kế hoạch. Không dùng tổng giá kế hoạch thay giá từng gói. Kiểm ngày phê duyệt đúng nghĩa; bỏ giới hạn ngày đăng tải ±30 ngày từng có thể bỏ sót kế hoạch công bố muộn. |
| TBMT | Tách trạng thái khớp tiêu chí khỏi điểm phù hợp. Ô “Đạt ngưỡng điểm” tiếp tục lọc theo điểm. Giá, tiêu chí và kết quả đối chiếu được lưu theo từng lượt, để xem lại hoặc xuất Excel đúng thời điểm tìm. |
| Biên bản mở thầu | Giữ mã định danh phục vụ bộ lọc; bảng nhà thầu, giá dự thầu, giá sau giảm và chênh lệch theo mốc giá tiếp tục hiện tại từng gói. Giữ cơ chế đọc lại riêng gói, cache, đọc dự phòng từ bảng công khai và trạng thái thiếu dữ liệu. |
| Đối soát dữ liệu | Đếm trang duy nhất; giữ tổng chưa biết ở trạng thái chưa biết. Phát hiện trang rỗng bất thường, trang lặp, cấu trúc phản hồi sai, tổng thay đổi và kết nối bị ngắt. Không báo hoàn tất khi chưa đối soát lấy đủ nguồn. |
| Chuyển giữa các lượt tra | Sửa lỗi phát hiện trên e-GP thật: lượt kế hoạch kế tiếp bắt đầu ở trang 2 còn lưu từ lượt TBMT trước. Bản sửa bấm trang 1 của bộ phân trang thật; đồng thời đối chiếu số trang trong yêu cầu nguồn, không nhận trang 2 thành trang 1. |
| Độ ổn định | Tín hiệu lỗi fetch/XHR được chuyển ngay cho lượt thu thập. Lượt nhiều bộ lọc có bộ đếm riêng cho từng truy vấn. Xử lý việc gửi lại khi mất xác nhận để tránh kết thúc nhầm truy vấn kế tiếp hoặc đổi kết quả đã nhận thành lỗi. |
| Mở tab và đọc lại | Đăng ký nhận sự kiện tải trang trước khi đọc trạng thái tab, khắc phục lỗi tab tải nhanh nhưng bị báo hết thời gian chờ. Dọn bộ đếm và bộ nhận sự kiện khi xong, lỗi hoặc đóng tab. |
| Tốc độ | Danh sách xã/phường chỉ tải cho tỉnh được chọn, dùng chung yêu cầu đang chạy và dùng cache; bỏ việc tải toàn bộ 97 mã tỉnh cho thao tác này. Kết quả từng phần và từng biên bản vẫn cập nhật trong quá trình đọc. |
| Tính năng được bảo toàn | Sao lưu và khôi phục, đồng bộ checklist, chế độ chỉ xem, lịch chờ, theo dõi phiên bản hồ sơ, bản đồ, đánh giá HSMT và xuất hồ sơ tiếp tục có kiểm thử hồi quy. |
| Cài đặt | Phiên bản hiển thị và manifest cùng là 4.10.1; giữ khóa định danh extension và phạm vi quyền của bản nền đã kiểm chứng. |

## Kết quả kiểm thử

| Cấp kiểm tra | Kết quả |
|---|---|
| Logic và service worker | 279/279 ca đạt, không bỏ qua ca nào; gồm 24 tệp kiểm thử. |
| Ngày giờ | 62/62 ca ở mỗi múi giờ UTC, Việt Nam, New York và Tokyo; tổng 248 lượt chạy. Đây là chạy lặp một nhóm kiểm thử ở các múi giờ, không phải 248 tình huống độc lập. |
| Mã và tài nguyên | 78 tệp JavaScript hợp lệ; 148 liên kết import, 209 liên kết tài nguyên HTML và 2 liên kết CSS đều tồn tại. |
| Chrome với dữ liệu kiểm soát | 43 tình huống đạt trên Google Chrome 152.0.7977.83: bộ lọc và Excel; thao tác hồ sơ, sao lưu, chỉ xem; chọn loại gói và chuyển lượt tìm; cache, đọc lại, giá đối chiếu và dừng đọc biên bản. Không ghi nhận lỗi JavaScript trong các tình huống này. |
| e-GP thật | 5/5 tình huống đạt, dùng phản hồi HTTPS thật; không thay dữ liệu trả về và không phát lại token tìm kiếm. |

Kết quả e-GP thật, chạy liên tiếp trên cùng phiên trình duyệt lúc khoảng 12:28–12:29 ngày 14/09/2026:

| Tình huống | Kết quả đối chiếu | Thời gian lượt thử |
|---|---|---|
| TBMT, tư vấn giám sát | Nhận 100 hồ sơ qua 2/46 trang nguồn, 28 hồ sơ khớp chuyên môn, 72 ngoài tiêu chí. Nguồn công bố 2.300 hồ sơ trước lọc chuyên môn. Trạng thái một phần đúng với giới hạn thử 2 trang. | 13,755 giây |
| KHLCNT `PL2600085770` | Tìm được “Tư vấn lập phương án bảo trì, sửa chữa hồ chứa thủy điện Bảo Lộc”, 1/1 hồ sơ và 1/1 trang. Lượt này bắt đầu đúng trang 1 sau khi lượt TBMT trước kết thúc tại trang 2. | 4,299 giây |
| Biên bản `IB2600509787-01` | Đọc đủ 1/1 nhà thầu: CÔNG TY TNHH TOÀN PHÁT YB99. Giá dự thầu và giá sau giảm đều 8.768.657.616 đồng, đối chiếu trùng phản hồi `bid-open` do trang gốc phát. Chênh 45.613.637 đồng, tương đương 0,52% so với giá gói thầu 8.814.271.253 đồng. | 11,717 giây |
| Quét lại cùng gói, dùng cache | Tìm lại đúng gói trên và khôi phục bảng nhà thầu đã đọc từ cache, giữ đúng giá đã đối chiếu. Thời gian gồm cả việc tra danh sách trên e-GP. | 8,913 giây |
| Bấm “Đọc lại” riêng gói | Nhận thêm phản hồi biên bản mới từ trang e-GP, xác nhận bảng nhà thầu và giá vẫn khớp. | 7,774 giây |

Trong phép thử biên bản, nguồn không trả `IB2600486024` ở truy vấn gói đang chờ kết quả. Không suy đoán nguyên nhân hay trạng thái trúng thầu của hồ sơ này; đã chuyển sang gói vừa công bố để kiểm chứng bảng giá thực tế. Lượt danh sách chỉ thử một trang và một gói đọc chi tiết, nên toàn lượt vẫn ghi **một phần**, dù bảng nhà thầu của gói đã đọc đủ. Mốc so sánh trong ví dụ là **giá gói thầu**, không tự ghi thành dự toán được duyệt.

Các tình huống có dự toán được duyệt đến muộn, nhiều nhà thầu, giảm giá, nhiều lô, dữ liệu lỗi và thao tác đọc lại được kiểm tra thêm bằng dữ liệu kiểm soát. Các con số thời gian trên chỉ mô tả đúng lượt thử này, không phải cam kết tốc độ cho mọi truy vấn.

Lúc khoảng 12:21, một lần thử kết nối bị timeout rồi `ERR_CONNECTION_RESET` trước khi bắt đầu truy vấn. Lần đó được lưu là không đạt. Sau khi kết nối hoạt động lại, cùng mã nguồn cuối chạy đạt cả 5 tình huống ở bảng trên. Vì vậy, bản sửa đã được kiểm chứng cả đọc lại thực tế; độ sẵn sàng của trang e-GP vẫn phụ thuộc hệ thống nguồn và đường truyền.

Gói ZIP được kiểm tra CRC và đối chiếu SHA-256 từng tệp nguồn với mã đã kiểm thử. Trình duyệt kiểm thử dùng hồ sơ riêng; không gửi Telegram, webhook hoặc thông báo cho người khác. Hồ sơ trình duyệt tạm được dọn sau kiểm thử.

## Phạm vi chính xác và giới hạn nguồn

“Khớp tiêu chí” có nghĩa các trường đã nhận đáp ứng điều kiện đã chọn. Điều này không chứng minh dữ liệu gốc của e-GP luôn đầy đủ hoặc đúng trong mọi thời điểm. Chuyên môn tư vấn chi tiết được nhận diện theo tên gói trong dữ liệu đã tải; cần mở hồ sơ gốc khi tên gói chưa mô tả đủ phạm vi công việc.

Giới hạn số trang hoặc số gói do cấu hình vẫn được áp dụng. Nếu giới hạn làm lượt tra chưa lấy đủ, giao diện ghi kết quả một phần và số đã nhận so với nguồn. Không dùng số đó như toàn bộ thị trường. Kế hoạch lọc ngày phê duyệt tại máy có thể cần phạm vi tỉnh, xã hoặc chủ đầu tư cụ thể hơn để nhận đủ trong giới hạn trang.

Mức giảm giá được tính từ dữ liệu nguồn có thể đối chiếu, với nhãn mốc so sánh rõ ràng. Không có giá công bố thì không suy đoán giá dự thầu hoặc kết quả trúng thầu. Đọc bảng dự thầu không đồng nghĩa xác định nhà thầu trúng thầu.

Các phép thử ghi nhận độ đúng ở tình huống đã kiểm tra. Chưa có phép đo A/B cùng dữ liệu, cùng phiên e-GP để công bố tỷ lệ tăng tốc toàn hệ thống. Không cam kết không bao giờ phát sinh lỗi khi mạng hoặc trang nguồn thay đổi.

## Cách cập nhật

1. Xuất sao lưu từ bản đang dùng.
2. Dừng lượt quét; đóng các trang chức năng của tiện ích.
3. Giải nén ZIP, chép nội dung thư mục `GiaoSuCuiBap` vào đúng thư mục extension Chrome đang nạp.
4. Tại `chrome://extensions`, bấm tải lại và kiểm tra phiên bản 4.10.1. Không cần gỡ extension.
5. Mở lại chức năng và chạy lượt tìm mới. Lượt lưu từ bản cũ chưa có ảnh chụp dữ liệu theo thời điểm được ghi chú trên giao diện.

Hướng dẫn chi tiết: `GiaoSuCuiBap/HUONG-DAN-4.10.1.md`. Bộ kiểm thử logic nằm trong `tests`; chạy `npm test` và `npm run test:tz` bằng Node.js tương thích `node:test`.
