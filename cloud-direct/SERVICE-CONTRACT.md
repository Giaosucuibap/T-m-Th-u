# Dịch vụ thử đường nguồn — không phải bản ứng dụng hoàn chỉnh

`server.mjs` bổ sung HTTP/job wrapper cho phép chạy phép thử nguồn có giới hạn
trên máy chủ độc lập. Không cần máy tính công ty hoặc phần mở rộng Safari.
Đây chưa phải tầng tìm kiếm phục vụ đầy đủ các nghiệp vụ của ứng dụng.

## Hợp đồng và giới hạn

- `GET /healthz`: kiểm tra tiến trình; không xác nhận e-GP sẵn sàng hoặc Safari đã đạt.
- Các đường `/api/*` bắt buộc `Authorization: Bearer <PROBE_API_KEY>`.
- `POST /api/probes`: chỉ nhận JSON `{"confirm":"RUN_BOUNDED_SOURCE_ACCEPTANCE"}`;
  không nhận URL, mã thực thi, đường dẫn, token e-GP hay tùy chọn trình duyệt.
- `GET /api/probes/{id}`: lấy biên bản, trạng thái, thời gian và phạm vi phép thử.
- `POST /api/probes/{id}/cancel`: yêu cầu dừng; kết quả về muộn không được ghi thành công.
- Chỉ một lượt hoạt động, tối đa hai lượt/giờ, giới hạn sáu phút/lượt và một MiB biên bản.
- Thân request tối đa 2 KiB. Không trả CORS mở cho website bất kỳ.
- Bí mật API không được chuyển vào tiến trình browser con; stdout/stderr của browser
  không được xuất vào log. Biên bản nguồn phải qua whitelist trong probe.
- `finished` chỉ có nghĩa phép thử kết thúc; phải đọc verdict của biên bản để xét
  cổng nguồn. Không đồng nghĩa toàn bộ sản phẩm đã hoạt động.
- Biên bản chỉ ở RAM, xóa sau một giờ hoặc khi tiến trình khởi động lại. Không dùng
  cơ chế này làm kho gói thầu của bản vận hành.

## Cấu hình thử nghiệm

- Node 24 và Playwright theo lockfile.
- `PROBE_API_KEY`: bắt buộc ít nhất 32 ký tự, cấp qua kho biến bí mật của hạ tầng.
  Không ghi vào Git, frontend, URL, log hoặc gửi cùng báo cáo.
- `PORT`: cổng HTTP do nền tảng cung cấp, mặc định 10000.
- Dockerfile cho web service: `cloud-direct/Dockerfile.server`, build context là
  gốc repository. Dockerfile.prototype là job một lần và không thay thế tệp này.

Chưa triển khai Docker image hoặc dịch vụ Render khi soạn. Unit tests chỉ kiểm tra
hợp đồng handler/lifecycle, không chứng minh bộ lấy dữ liệu nguồn đã chạy thật.
Nền tảng phải cấp HTTPS và giới hạn tài nguyên; cần đo RAM trước khi chọn compute
plan. Bản miễn phí 512 MiB chưa được chứng minh đủ cho browser của nguồn.

## Trước khi tích hợp vào web Safari

1. Cổng tìm nguồn thật phải đạt trên hạ tầng mục tiêu và có biên bản tương ứng.
2. Bổ sung API nghiệp vụ có chọn tiêu chí, phân trang đủ và các trạng thái; probe
   chỉ kiểm tra phạm vi nhỏ, không thay API nghiệp vụ đó.
3. Đưa hàng đợi, phiên và kết quả vào kho bền vững; xác thực theo người dùng.
4. Chuyển đủ ma trận chức năng, kiểm tra tải hồ sơ, hiệu năng và Safari thiết bị thật.

Không triển khai công khai dịch vụ nếu thiếu khóa hoặc gọi nó là bản hoàn thiện.
