# Hướng dẫn bản 4.18.0 — giao diện mới, Tìm nhanh, kết quả tức thì

## Cài đặt (giữ nguyên dữ liệu)
1. Trong tiện ích đang dùng: **Cấu hình → Sao lưu** (xuất tệp sao lưu), cất riêng.
2. Giải nén `GiaoSuCuiBap-4.18.0.zip`, chép đè vào **đúng thư mục** tiện ích đang nạp trong Chrome.
3. Mở `chrome://extensions` → bấm ↻ **Tải lại (Reload)** ở thẻ Giáo Sư Cùi Bắp.
4. **Đóng hết các tab e-GP và các trang tiện ích đang mở**, rồi mở lại từ biểu tượng tiện ích.
5. Góc dưới thanh bên trái phải ghi **PHIÊN BẢN 4.18.0**.

## Có gì mới

### 1. Giao diện mới — một bố cục cho mọi trang
- **Thanh điều hướng bên trái cố định** trên mọi trang, chia theo công việc:
  - **Tra cứu e-GP**: Tìm gói thầu · Kế hoạch lựa chọn NT · Mở thầu – Chờ kết quả · Nhà thầu trúng thầu
  - **Theo dõi**: Kho gói đã lưu · Bộ săn tự động · Checklist hồ sơ
  - **Phân tích thị trường** (bấm để mở): địa bàn, thị trường, đối thủ, chủ đầu tư, hồ sơ nhà thầu 360°, nhà thầu đã quét
  - **Năng lực công ty** (bấm để mở): năng lực, hợp đồng tương tự, khung BPTC, nhật ký điều chỉnh
  - **Hệ thống**: Cấu hình · Kiểm tra dữ liệu
- **Chữ to và rõ hơn**: phông Be Vietnam Pro (đủ 4 độ đậm, chuẩn tiếng Việt), chữ thân 15px,
  không còn chữ nào nhỏ hơn 12px; màu chữ đạt chuẩn quốc tế về độ tương phản (WCAG 2.1 AA).
- Các đoạn giải thích dài được **thu gọn** dưới dòng "Cách tra cứu và phạm vi dữ liệu" — bấm để đọc khi cần.
- Nút **Gọn / Thoáng** ở góc trên phải vẫn giữ: chỉ đổi khoảng cách, không đổi dữ liệu.
- Màn hình hẹp (dưới 900px): thanh trái thu vào nút ☰ ở đầu trang.

### 2. Tìm nhanh — phím **Ctrl + K** (hoặc ô "Tìm nhanh…" ở thanh trái)
- Gõ **mã TBMT** (ví dụ `IB2600455130`) hoặc **mã kế hoạch** (`PL2600240212`):
  - nếu gói đã có trong kho trên máy → hiện ngay, bấm để mở trên e-GP;
  - luôn có dòng **"Tra … trên e-GP"** để hỏi e-GP bản mới nhất (tự điền mã và tìm).
- Gõ **chữ** (không cần dấu, ví dụ `tram bom lam dong`): hiện các gói trong kho có đủ mọi từ đó,
  gói còn hạn nộp lên trước. Gõ tên trang (ví dụ `trung thau`) để chuyển trang.
- Phím: ↑ ↓ chọn · Enter mở · Esc đóng.

### 3. Kết quả tức thì khi tìm gói thầu
- Bấm **Tìm gói thầu** với tiêu chí mới: trong lúc chờ e-GP, màn hình **hiện ngay các gói khớp tiêu chí
  đã có trong kho trên máy** (dải xanh "Kết quả tức thì từ kho trên máy").
- Đây là dữ liệu **đã lưu, có thể cũ hoặc thiếu gói mới đăng**. Khi e-GP trả về, danh sách **tự thay**
  bằng dữ liệu mới. Trong lúc đó nút **Xuất Excel** và **Lịch đóng thầu** bị khoá — Excel chỉ xuất dữ liệu mới.
- Đo trên máy thử với e-GP giả lập chậm: gói đầu tiên hiện sau **0,2 giây** thay vì **8,3 giây**
  (bản 4.17.3). Tổng thời gian chờ e-GP trả đủ dữ liệu **không đổi** — e-GP vẫn là giới hạn.

### 4. Sửa lỗi
- Trang **Mở thầu · Chờ kết quả**: ô "Số gói tối đa sẽ đọc" có lúc hiện **trống** sau khi mở lại một lượt cũ,
  và lượt quét sau âm thầm dùng 150 gói. Nay hiện đúng số đã dùng.
- Cửa sổ bật lên (biểu tượng tiện ích): bỏ thanh 4 bước bị bóp chữ và dòng "Đến nội dung chính" lộ ra.

## Cần biết
- **Cầu nối E-HSMT (thư mục `native-agent`)**: gói này **không kèm tệp `GiaoSuCuiBap.NativeHost.exe`**
  (tệp chạy dựng sẵn không nằm trong mã nguồn; lần đóng gói này không có bản dựng đã kiểm trên Windows).
  Cầu nối **không thay đổi từ bản 4.17.0**: chép đè gói mới lên thư mục cũ thì tệp `.exe` cũ vẫn còn và
  dùng tiếp bình thường; máy đã cài cầu nối thì không cần cài lại. Nếu cài trên máy mới, lấy thư mục
  `native-agent` từ gói 4.17.3.
- Môi trường phát triển **không vào được e-GP thật**; mọi số đo ở trên là trên **e-GP giả lập**.
  Sau khi cài, anh chạy thử một lượt Lâm Đồng ở *Tìm gói thầu* và *Mở thầu · Chờ kết quả*.
- Kết quả tức thì chỉ có khi kho trên máy đã có gói khớp (đã tìm trước đó). Máy mới cài thì lượt đầu vẫn phải chờ e-GP.
- Nếu gặp lỗi, chụp màn hình cả trang (có thanh bên trái để thấy số phiên bản) gửi lại.
