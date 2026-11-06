# BÁO CÁO THẨM ĐỊNH LẠI — GIÁO SƯ CÙI BẮP 4.19.0

*Ngày 06/11/2026 · đánh giá lại sau khi khắc phục các điểm yếu nêu ở báo cáo 4.18.0 · cùng thang điểm, cùng trọng số.*

## 1. Kết luận cho Ban Giám đốc

| | 4.17.3 | 4.18.0 | **4.19.0** |
|---|---|---|---|
| **Điểm tổng (thang 10)** | 7,2 | 7,9 | **8,2** |
| Lượt săn lỡ giờ khi máy tắt / Chrome đóng | mất hẳn (lỗi) | mất hẳn (lỗi) | **chạy bù**, có báo Telegram |
| Bộ săn lỗi | im lặng | im lặng | **Telegram ngay lần đầu** + dải cảnh báo |
| Chrome đóng cửa sổ | bộ săn dừng | bộ săn dừng | chạy tiếp (chạy nền, tuỳ chọn) |
| Máy đang Ngủ (Sleep) tới giờ săn | không chạy | không chạy | **tự đánh thức** (Task Scheduler) |
| Kho lịch sử biên bản mở thầu | tự tích luỹ khi tra | như cũ | **nạp dần theo tháng + chủ đầu tư** |
| Gói cài có cầu nối E-HSMT (.exe) | có | **thiếu** | **có**, dựng và kiểm thử trên Windows CI |
| Kiểm chứng trên e-GP thật | thủ công | thủ công | **một chạm**, xuất tệp bằng chứng |
| `background.js` | 4.343 dòng · 118 nhánh lệnh | như cũ | **4.120 dòng · 94 nhánh** (+3 mô-đun lệnh, mô-đun Telegram) |
| Bài kiểm thử tự động | 769 | 785 | **836** (+3 kịch bản Chromium) |

**Chưa đạt điểm tối đa, và không nên tự nhận 10/10.** Ba việc còn lại nằm ngoài tầm sửa mã trong môi trường
phát triển — mục 4 nói rõ từng việc và ai làm được.

## 2. Từng điểm yếu: đã làm gì, bằng chứng, còn lại gì

### 2.1 "Chỉ chạy khi Chrome trên máy đang mở" — khắc phục phần lớn
- **Tìm ra một lỗi thật:** trang Bộ săn ghi "máy tắt thì chạy bù khi mở lại", nhưng mã cũ mỗi lần Chrome khởi
  động lại xoá báo thức và đặt sang lần tới — lượt 06:05 lỡ khi máy tắt **mất hẳn, không ai biết**. Đã sửa:
  lượt lỡ được chạy bù ~2 phút sau khi Chrome chạy lại, không chạy trùng, không chạy cho giờ chưa từng hẹn.
- Chrome **chạy nền** khi đóng cửa sổ (quyền tuỳ chọn, người dùng tự bật — đã kiểm Chromium thật chấp nhận).
- `BAT-TRAM-SAN.bat`: Windows **tự mở Chrome chạy nền khi đăng nhập** và **đánh thức máy đang Ngủ** trước giờ
  săn 3 phút. Bằng chứng: CI đăng ký tác vụ thật trên Windows, xuất XML kiểm `WakeToRun`, giờ 06:02/13:02,
  rồi gỡ sạch.
- **Còn lại:** máy **tắt hẳn** thì không phần mềm nào trên máy chạy được. Muốn 24/7 tuyệt đối cần một máy
  luôn bật (máy văn phòng để Ngủ thay vì Tắt là đủ cho phần lớn trường hợp).

### 2.2 "Phụ thuộc giao diện e-GP" — giảm rủi ro, không xoá được gốc
- Không còn **hỏng âm thầm**: bộ săn lỗi → Telegram ngay; hồi phục → Telegram; các trang tra cứu hiện dải
  cảnh báo khi tiện ích đã tự dừng vì e-GP đổi cấu trúc.
- **Kiểm chứng toàn trình** một chạm (trang Chẩn đoán) giúp biết trong 15–25 phút e-GP còn chạy đúng không,
  và tệp bằng chứng (có tên trường của yêu cầu lạ, không có dữ liệu doanh nghiệp) giúp sửa nhanh khi e-GP đổi.
- **Còn lại:** e-GP không có API chính thức; e-GP đổi giao diện vẫn có thể làm tiện ích dừng — nay dừng
  **có báo**, không còn âm thầm.

### 2.3 "Không có kho lịch sử sẵn" — khắc phục được phần quan trọng nhất
- **Kho lịch sử** nạp dần biên bản mở thầu (ai dự, giá dự thầu, giảm giá) của các gói đã có kết quả: từng tháng
  của tỉnh + lĩnh vực, và **toàn bộ 4 năm** của các chủ đầu tư đang theo dõi. Chạy ban đêm, tiếp tục được khi
  tắt máy, luôn nhường người dùng / bộ săn / canary. Bằng chứng: kịch bản Chromium nạp tháng thật trên e-GP
  giả lập, người dùng chen lượt → mục bị gián đoạn và thử lại, không chạy đè.
- **Còn lại (nói thẳng):** tra theo tỉnh, e-GP không lọc ngày ở máy chủ cho loại tra cứu này — tiện ích đọc tối
  đa 2.000 dòng mới nhất, tháng xa có thể thiếu (bảng độ phủ ghi rõ). Dịch vụ máy chủ vẫn hơn ở độ dày lịch
  sử toàn quốc; với thị trường của Trường An (Lâm Đồng, chủ đầu tư quen), kho này đủ dùng sau vài đêm nạp.

### 2.4 "Kiến trúc nặng ở một chỗ" — đã bắt đầu tách, có quy tắc
- `lib/runtime-telegram.js` tách trọn phần Telegram; `lib/message-registry.js` — **mỗi lệnh đúng một chủ**,
  đăng ký trùng là lỗi ngay khi khởi động; 32 lệnh chuyển sang 3 mô-đun theo mảng.
- `background.js` 4.343 → 4.120 dòng **dù thêm 4 tính năng**; khối switch 118 → 94 nhánh.
- **Còn lại:** phần đọc biên bản mở thầu, kế hoạch, trúng thầu vẫn ở `background.js` — tách tiếp theo cùng cách.

### 2.5 "Gói 4.18.0 thiếu GiaoSuCuiBap.NativeHost.exe" — đã khắc phục
CI Windows biên dịch từ `NativeHost.cs`, chạy toàn bộ bài kiểm thử Windows **trên đúng tệp đó**, rồi giữ tệp
kèm SHA-256. Công cụ lấy tệp chỉ nhận tệp khớp mã băm, độ dài và chữ ký MZ. Mã băm ghi cạnh tệp trong gói.

### 2.6 "Chưa kiểm chứng trên e-GP thật" — đã làm hết phần làm được ở phía phần mềm
- Môi trường phát triển bị **tường lửa e-GP chặn** (trang trả "This page can't be displayed" cho trình duyệt tự
  động, kể cả trang chủ) — đã thử thật, không phải do tiện ích. Không thể tạo bằng chứng ở đây, và **không
  làm giả**.
- Đã làm: nút kiểm chứng toàn trình chạy ngay trên máy anh, kết luận trung thực (bài kiểm thử bắt và đã sửa một
  chỗ tệp bằng chứng có thể lộ tên gói), cùng bản dòng lệnh `tools/live/kiem-chung-e-gp-that.mjs`.
- **Còn lại:** anh chạy một lần và gửi tệp — đó là bằng chứng trên e-GP thật đầu tiên của nhánh này.

### 2.7 "Hai nhánh song song" — chưa làm được, cần anh
Tệp `GiaoSuCuiBap-4.17.1-Cai-dat.zip` của tác giả **không còn trong môi trường** (phiên làm việc được làm mới)
và không có trên kho mã. Không có mã thì không hợp nhất được; tự viết lại phần đọc PDF/OCR của tác giả sẽ tạo
thêm một nhánh thứ ba. **Cần anh gửi lại tệp zip đó.**

## 3. Bảng điểm chi tiết

| # | Tiêu chí | Trọng số | 4.18.0 | **4.19.0** | Căn cứ thay đổi |
|---|---|---|---|---|---|
| 1 | Độ đúng dữ liệu & đối soát | 20% | 8,5 | **8,5** | Không đổi cách tính; nút kiểm chứng chỉ nâng điểm khi có kết quả thật |
| 2 | Chịu được thay đổi của e-GP | 15% | 6,5 | **7,0** | Hết hỏng âm thầm (Telegram + dải cảnh báo), kiểm chứng một chạm |
| 3 | Tốc độ cảm nhận | 10% | 8,0 | **8,0** | Không đổi (đo lại: thẻ đầu 0,23 giây) |
| 4 | Phạm vi nghiệp vụ | 15% | 8,3 | **8,8** | Trạm săn, kho lịch sử biên bản, kiểm chứng toàn trình |
| 5 | Giao diện & dễ đọc | 15% | 8,0 | **8,0** | Ô mới theo đúng hệ thống thiết kế; đo cỡ chữ/tương phản vẫn đạt |
| 6 | Bảo mật & riêng tư | 10% | 8,5 | **8,6** | Quyền chạy nền là tuỳ chọn; tác vụ Windows quyền thấp nhất; mở e-GP chỉ nhận địa chỉ chính thức; tệp bằng chứng lọc dữ liệu |
| 7 | Kiểm thử & phát hành | 10% | 8,7 | **9,2** | .exe dựng + kiểm thử trên Windows có SHA-256; Task Scheduler kiểm thật; +51 bài, +3 kịch bản Chromium |
| 8 | Kiến trúc & bảo trì | 5% | 5,5 | **6,5** | Mô-đun Telegram, sổ đăng ký lệnh; vẫn còn hai nhánh chưa hợp nhất |
| | **Tổng có trọng số** | | **7,9** | **8,2** | |

## 4. Vì sao chưa phải điểm tối đa — và ai làm được phần còn lại

| Việc | Nâng tiêu chí | Ai làm |
|---|---|---|
| Chạy **Kiểm chứng toàn trình** trên máy công ty, gửi tệp bằng chứng | 1, 2, 7 (ước +0,3–0,4 tổng) | **Anh** — 15–25 phút, một lần |
| Gửi lại zip **4.17.1** của tác giả để hợp nhất một bản duy nhất | 8 và giảm rủi ro cài nhầm | **Anh** gửi tệp; mình hợp nhất |
| API chính thức của e-GP | 2 | Không ai trong hai bên làm được — trần cấu trúc |
| Cảnh báo khi máy **tắt hẳn** | 4 | Cần một máy luôn bật hoặc dịch vụ máy chủ |

Vì vậy **không có phần mềm tra cứu e-GP nào chạy trên máy người dùng đạt 10/10** ở tiêu chí 2 và 4; tổ thẩm
định không cấp điểm tối đa cho phần chưa có bằng chứng.

## 5. Số đo kiểm thử của bản này
- Bài kiểm thử đơn vị: **836** (Linux: 825 đạt, 11 chỉ chạy trên Windows; Windows CI: chạy cả 11), chạy lại ở
  4 múi giờ đều đạt.
- Chromium + e-GP giả lập khó tính: 21 kịch bản cũ (tra cứu, mạng chập chờn, e-GP đổi dạng yêu cầu, giao diện) **cộng** 3 kịch bản mới — trạm săn,
  nút kiểm chứng (Tìm gói ĐẠT; Kế hoạch/Mở thầu báo CHƯA ĐẠT đúng lý do vì giả lập không có trang chi tiết),
  kho lịch sử.
- Kiểm thử và tự rà bắt lỗi trước khi phát hành: tệp bằng chứng có thể chứa tên gói từ dòng thông báo → đã lọc;
  luồng Mở thầu từng được tính "đạt" dù không đọc được biên bản nào → đã siết; lượt kiểm chứng trùng tiêu chí
  với lượt vừa chạy (lấy từ bộ nhớ đệm, không hỏi e-GP) từng được tính "đạt" → nay chờ đệm hết hạn rồi hỏi lại;
  kho lịch sử có thể đè kết quả anh vừa soi hoặc tự chạy lại sau khi anh bấm Dừng → nay chờ 2 giờ / tự tạm dừng.

## 6. Việc tiếp theo đề xuất
1. Anh chạy kiểm chứng và gửi tệp; mình đối chiếu, sửa nếu e-GP thật khác giả lập.
2. Gửi lại zip 4.17.1 → hợp nhất thành **một bản duy nhất** (lấy đọc HSMT PDF/OCR, nhật ký bền vững của tác giả).
3. Tách tiếp phần biên bản mở thầu / kế hoạch / trúng thầu khỏi `background.js` theo sổ đăng ký lệnh.
4. Gợi ý "gói vừa sức Trường An" dựa trên năng lực đã khai — chờ anh xác nhận tiêu chí năng lực dùng để chấm.
