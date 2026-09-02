# Biên bản kiểm thử phát hành 4.0.0

**Ngày kiểm thử:** 2026-09-02  
**Phạm vi:** mã nguồn extension đã đóng gói, tài nguyên cục bộ và logic nghiệp vụ thuần  
**Kết luận:** đạt kiểm thử tự động; đủ điều kiện đưa vào pilot/canary có kiểm soát.

## Kết quả tự động

Lệnh chuẩn:

```bash
npm test
```

Kết quả: **44/44 đạt, 0 lỗi, 0 bỏ qua**.

Các nhóm đã kiểm tra:

- chuẩn hoá tiếng Việt, tiền tệ, ngày tháng và mã định danh;
- phân loại gói xây lắp, chấm điểm từ khoá và trạng thái thắng ba giá trị;
- URL e-GP chính thức, request allowlist, loại bí mật và redaction;
- hồi quy sao lưu: template luôn được scrub khi xuất/nâng cấp; `PARTIAL` không bị đổi sai thành `SUCCESS` khi nhập;
- pipeline Go/No-Go, ưu tiên, độ đầy đủ dữ liệu, cảnh báo và Radar;
- liên danh: không ghép tên/MST theo chỉ số, không nhân giá trị, HHI chỉ dùng gói độc lập;
- Manifest V3, CSP, public key, kích thước/icon RGBA và tài nguyên tham chiếu;
- cú pháp của toàn bộ JavaScript, import/export và ID HTML;
- workbook XLSX và đồng bộ bookmarklet iPhone.

## Rà soát tĩnh bổ sung

- Không phát hiện API key, Bot Token thật, private key, `TODO` hoặc `FIXME` trong gói phát hành.
- Content script chỉ chạy trên trang lựa chọn nhà thầu của đúng host e-GP.
- Tin nhắn từ content script có whitelist, kiểm tra sender, kích thước và hình dạng payload.
- Tác vụ được cô lập theo `jobId`, `mode`, `planId` và `tabId`; tab do lịch tự mở được đóng sau khi tác vụ kết thúc.
- Kết quả bị giới hạn, timeout hoặc huỷ được ghi `PARTIAL`, không giả là thành công đầy đủ.
- Luồng cũ phát lại nguyên request/token đã bị loại; truy vấn dùng phiên do trang e-GP hiện hành tạo.

## Chưa được chứng minh trong môi trường bàn giao

Không có Chromium/Chrome nhị phân trong môi trường kiểm thử nên chưa thể chạy E2E thật, đăng nhập/CAPTCHA, tải extension unpacked và đối chiếu trực tiếp với phiên e-GP đang vận hành. Chưa có stress test hàng chục tab, hàng trăm nghìn bản ghi, audit screen reader hoặc kiểm toán bảo mật độc lập.

Luồng quét chi tiết BBMT có alarm bền để tránh treo khi service worker bị Chrome dọn. Tuy nhiên nó chưa lưu cursor để tự tiếp tục đúng gói; tác vụ sẽ kết thúc an toàn và người dùng cần chạy lại.

## Cổng phát hành

Chỉ triển khai rộng sau khi checklist canary trong `README.md` và `BAO-CAO-DANH-GIA.md` đạt trên ít nhất hai Chrome profile, gồm một trạng thái chưa đăng nhập và một trạng thái đã đăng nhập (nếu nghiệp vụ yêu cầu). Nếu sai schema, sai URL, trùng bản ghi bất thường hoặc báo đầy đủ cho dữ liệu một phần, dừng lịch tự động và rollback 3.9.1.
