# Cổng kiểm chứng nguồn cho web Safari độc lập

Ngày soạn: **10/11/2026, giờ Việt Nam**. Đây là đặc tả nghiệm thu bộ kiểm chứng nguồn, không phải báo cáo ứng dụng hoàn chỉnh đã chạy trên iPad.

## Mục tiêu và giới hạn

Mục tiêu sản phẩm là một URL HTTPS cố định mà người sử dụng mở trực tiếp bằng Safari trên iPad/iPhone, không bật máy tính công ty, quét QR hoặc cài tiện ích. Phần xử lý cần thiết nằm trên máy chủ của ứng dụng.

Thư mục `cloud-direct/` hiện chỉ kiểm tra một tiền đề: trình duyệt đặt trên hạ tầng đám mây có thể thao tác giao diện công khai e-GP theo cách thông thường và nhận dữ liệu **đúng lượt, đúng bộ lọc** hay không. Nó chưa phải giao diện tìm thầu cho người dùng, chưa thay toàn bộ chức năng trong ZIP 4.20.0 và chưa phải API được e-GP cam kết ổn định.

Phạm vi bộ kiểm chứng hiện hành là request tìm kiếm, metadata phân trang, định danh công khai và mã tỉnh. Biên bản giữ **`rowStatusVerified: false`** và **`rowPriceVerified: false`**: nhãn `PAGE_VERIFIED` chưa xác nhận trạng thái/giá của từng gói. Điều kiện ngày "đang mở" chỉ được so với cách biểu diễn request quan sát ở nguồn; không được dùng phép so request này thay cho nghiệm thu nghĩa ngày giờ của bản ghi.

`SOURCE_ACCEPTANCE_SAMPLE_PASSED` và `sourceGatePassed: true` chỉ xác nhận mẫu kiểm chứng trong phạm vi này; một mẫu có thể là trang rỗng hợp lệ hoặc số trang được giới hạn. `appReadyForProduction` vẫn phải là false. Hàm `validateProbeReport` kiểm tra schema, tỉnh/engine đã yêu cầu, cờ giới hạn và phép cộng số nhận; một tệp JSON tồn tại hoặc tiến trình thoát mã 0 chưa đủ để công bố đạt.

**Số lượt e-GP thật được xác nhận đạt trong tài liệu này: 0.** Khi CI chạy, phải đọc biên bản do chính lần chạy đó tạo. Không đổi con số này chỉ vì cài được browser, GET HTML trả 200 hoặc các test dùng dữ liệu dựng đạt.

## Phân biệt bốn lớp bằng chứng

| Lớp | Chứng minh được | Không chứng minh được |
|---|---|---|
| Kiểm tra thuần với dữ liệu dựng | Hàm đối chiếu và lọc bằng chứng xử lý đúng các ca đã cho | Có kết nối nguồn thật |
| Playwright trên Linux | Engine đã thực thi thao tác; nếu truy cập nguồn thành công thì có bằng chứng nguồn của lượt đó | Safari/iPad thật đã chạy |
| Web Safari trên thiết bị thật | Hiển thị, bàn phím, tải tệp, vòng đời và xác thực trên thiết bị đã thử | Toàn bộ dữ liệu nguồn luôn đầy đủ và không đổi |
| Đối chiếu chức năng 4.20.0 | Chức năng tương ứng có dữ liệu và ca nghiệm thu | Chức năng khác tự động được coi là đã chuyển |

## Quy tắc truy cập nguồn

1. Đi từ trang nguồn được cho phép, dùng ô chọn/nút tìm thông thường. Không tự tạo hoặc lấy cắp token, sửa `grecaptcha`, replay cookie của người khác, dùng dịch vụ giải CAPTCHA hoặc chèn request giả để khiến kết quả trông như thành công.
2. Nếu nguồn yêu cầu xác minh người dùng mà CI không thực hiện được, ghi `VERIFICATION_REQUIRED` hoặc lỗi nguồn cụ thể và dừng. Đó là kết quả kiểm chứng không đạt điều kiện tự động, không phải 0 gói thầu.
3. Không thay response e-GP bằng fixture trong một lượt gắn nhãn live. Các bài test cục bộ phải nằm riêng và được ghi rõ là dữ liệu dựng.
4. Giới hạn số trường hợp, thời gian chờ và số request. Tôn trọng lỗi 429 và hướng dẫn chờ của nguồn; không chạy vòng retry vô hạn.
5. Nếu source contract thay đổi, thất bại rõ ràng; không nới điều kiện đối chiếu để chuyển màu kết quả.

## Cổng tương quan giữa thao tác và phản hồi

Mỗi trường hợp phải có một bản ghi về bộ lọc dự định gửi, thời điểm thao tác và phản hồi nguồn được đối chiếu. Các điều kiện cần xác minh:

- Đúng host nguồn và đúng đường tìm kiếm đã quan sát, không nhận phản hồi trang chủ hoặc endpoint nghiệp vụ khác.
- Phản hồi thuộc request phát sinh **sau thao tác tìm của trường hợp hiện tại**. Không nhận request nền đã chạy khi vừa mở trang hoặc response đến muộn của trường hợp trước.
- Request chứa đúng tỉnh/mã tỉnh, nhóm trạng thái, lĩnh vực và tiêu chí khác đã yêu cầu. Thiếu một điều kiện bắt buộc là chưa chứng minh được phạm vi.
- Dữ liệu trả về là JSON schema tương ứng, không phải HTML đăng nhập, thông báo truy cập, body lỗi hoặc payload dựng.
- Kết quả có định danh nguồn và bằng chứng trường nghiệp vụ cần thiết. Trường không có dữ liệu phải giữ chưa biết, không tự điền mã, giá hoặc trạng thái.
- Bộ kiểm chứng hiện tại chưa thực hiện đối chiếu giá và trạng thái từng bản ghi; cờ tương ứng phải luôn false cho tới khi có kiểm chứng riêng.
- Nếu nguồn có tổng bản ghi, ghi riêng tổng nguồn và số đã nhận. Một trang đầu không đủ chứng minh đã đọc toàn bộ tỉnh.
- Phản hồi rỗng chỉ hợp lệ khi tương quan request/schema/phạm vi đã đạt. Lượt rỗng vẫn chưa đủ nghiệm thu độ đúng dữ liệu thực cho tỉnh đó.

Nếu không chứng minh được tương quan, kết quả là `INCONCLUSIVE` hoặc `FAIL`, không phải `PASS`.

## Các ca kiểm thử bắt buộc cho hàm đối chiếu

Các ca dưới đây phải dùng dữ liệu dựng riêng, không tạo số lượng gói giả cho báo cáo live:

| Ca | Kỳ vọng |
|---|---|
| Response tìm kiếm hợp lệ, request đúng tiêu chí | Cho phép tạo receipt giới hạn đúng bằng chứng |
| Sai host hoặc endpoint khác | Loại khỏi tương quan |
| Request khởi phát trước thao tác | Không nhận thành kết quả của lượt mới |
| Request của Lâm Đồng nhưng đang thử Hà Nội | Không đạt |
| Yêu cầu đang mời nhưng request thiếu/sai điều kiện trạng thái | Không đạt |
| Yêu cầu Xây lắp nhưng request dùng lĩnh vực khác | Không đạt |
| Body HTML, 401/403/429/5xx hoặc JSON chứa lỗi | Không được coi là danh sách gói rỗng |
| Danh sách thiếu định danh/phiên bản/trường cần đối chiếu | Giữ thiếu bằng chứng; không bịa dữ liệu |
| Tổng nguồn lớn hơn số nhận ở trang đầu | Ghi phạm vi mới đọc một phần |
| Query URL chứa token/cookie hoặc header bí mật | Receipt không được xuất các giá trị đó |

## Biên bản và dữ liệu nhạy cảm

Biên bản nên lưu phiên bản mã, engine, giờ chạy, tiêu chí không bí mật, trạng thái từng cổng, thời gian thực đo, tổng nguồn và số quan sát. Có thể lưu hash của payload công khai phục vụ đối chiếu.

**Không lưu toàn bộ HAR, headers, cookies, storageState, HTML chứa phiên, query token, request token hoặc bearer credentials vào artifact CI.** Ảnh/video nếu cần được đánh giá riêng; chúng không phải điều kiện bắt buộc để phép thử tối thiểu chạy.

Không ghi thông báo lỗi nguyên văn nếu chuỗi có thể kèm URL/token. Xuất mã lỗi cố định và phần mô tả đã giới hạn, làm sạch. Việc kết thúc tiến trình thành công vì đã ghi được JSON không tự có nghĩa cổng nguồn đạt: phải đọc cờ kết quả từng trường hợp và trạng thái tổng.

## Cổng chuyển sang phát triển đầy đủ

Chỉ nên lấy việc nguồn đạt làm cơ sở triển khai tiếp khi ít nhất:

1. Có tìm thật thành công với tỉnh cần dùng; đơn vị/xã trống không bị biến thành điều kiện sai.
2. Lặp được với hai tỉnh khác, có đối chiếu phạm vi và mã bản ghi.
3. Xác minh các nghiệp vụ TBMT, chờ KQLCNT, đã công bố KQLCNT riêng; kế hoạch và hồ sơ tệp có cổng độc lập.
4. Xác minh phân trang thực và lỗi/hủy không báo thành công giả.
5. Hiểu rõ cách hợp lệ xử lý phiên/xác minh, và cách báo sự cố khi nguồn thay đổi.

Nếu cổng này không đạt, tiếp tục nghiên cứu hợp đồng tích hợp hoặc phương thức truy cập được cho phép. Không triển khai một proxy bất kỳ rồi gọi đó là backend e-GP hoàn chỉnh.

## Nghiệm thu Safari sau khi có web/backend

Các việc này **chưa chạy trong prototype**:

- PC công ty tắt; Safari không extension; mở URL ổn định và tạo lượt tìm mới.
- iPad/iPhone dọc/ngang, bàn phím mở, ô chọn dài, bảng nhiều trang và nút tìm/dừng.
- Khóa màn hình, mất mạng, đóng tab rồi quay lại đúng mã lượt ở máy chủ; không nhân đôi job.
- Tải và mở tệp xuất; lưu theo dõi và khôi phục sau đăng nhập lại.
- Đối chiếu các gói thực với trang nguồn ở cùng thời điểm.
- Đo thời gian phản hồi, trang đầu và toàn lượt; tách cache và tìm mới. Không lấy số đo test dựng làm độ nhanh của nguồn.

Không có kết luận "chính xác tuyệt đối" hoặc "đã chạy trên Safari iPad" trước khi có bằng chứng tương ứng.
