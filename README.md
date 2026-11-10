# Kiểm chứng đường nguồn cho web Safari trực tiếp

Nhánh này chứa **phép thử nguồn và dịch vụ kiểm tra có giới hạn**, không phải
bản ứng dụng tìm thầu đã hoàn thiện hoặc đã nghiệm thu trên iPad.

Mục tiêu kỹ thuật là kiểm tra khả năng dùng trình duyệt trên máy chủ thao tác
giao diện công khai của e-GP, để giao diện web sau này không phụ thuộc máy tính
công ty, QR, extension hoặc ứng dụng phụ trên điện thoại.

## Thành phần

| Tệp | Vai trò |
| --- | --- |
| `cloud-direct/source-probe.mjs` | Thao tác UI nguồn bình thường, kiểm tra tương quan truy vấn và phản hồi; dừng khi nguồn yêu cầu xác minh |
| `cloud-direct/server.mjs` | HTTP/job wrapper có khóa truy cập, giới hạn lượt, hủy và thời hạn |
| `cloud-direct/tests/` | Kiểm thử logic tiếp nhận dữ liệu, quyền truy cập và vòng đời lượt |
| `cloud-direct/ACCEPTANCE.md` | Các cổng nguồn, dữ liệu, chức năng và thiết bị còn phải đạt |
| `cloud-direct/SERVICE-CONTRACT.md` | Hợp đồng dịch vụ thử nghiệm và giới hạn lưu trữ |
| `cloud-direct/deployment-proposal.md` | Điều kiện chuyển sang web và backend vận hành |
| `.github/workflows/direct-safari-source.yml` | Kiểm tra Chromium và WebKit trên Linux; không gọi là Safari iPad thật |

Không giải CAPTCHA, không thu/replay token, không tải hồ sơ cần xác thực, không
gửi thông báo và không tự tạo tài nguyên trả phí. Không ghi cookie, header,
storage-state, HAR hay URL có token vào biên bản.

Một phép thử chỉ bao phủ tối đa ba trang cho mỗi tỉnh được chọn. Tỉnh được UI
nguồn chọn chưa tự chứng minh bao phủ mọi địa bàn tiền thân. Biên bản phải giữ
các giới hạn này, kể cả khi phép thử mẫu đạt. Chưa chuyển đầy đủ nghiệp vụ của
ứng dụng cũ vào nhánh này.

Kết quả thực tế nằm trong artifact của từng GitHub Actions run. Unit test đạt,
HTTP health đạt hoặc xuất hiện file JSON đều không thay thế nghiệm thu nguồn
thật và Safari thiết bị thật.
