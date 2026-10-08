# Hướng dẫn bản 4.17.0 — Giáo Sư Cùi Bắp

Bản này thêm 10 nâng cấp. Dưới đây là **cách dùng** từng cái, **bật/tắt ở đâu**, và
**điều cần biết** (giới hạn nói thẳng).

## Cài đặt / cập nhật

1. Giải nén `GiaoSuCuiBap-4.17.0.zip`, chép đè thư mục `GiaoSuCuiBap` cũ.
2. Mở `chrome://extensions` → bấm ↻ **Reload** ở thẻ Giáo Sư Cùi Bắp.
3. Thanh bên trái phải hiện **PHIÊN BẢN 4.17.0**. Dữ liệu cũ (kho gói, bộ săn, cấu
   hình) giữ nguyên.

## 1. Tab e-GP mở sẵn — tra cứu lượt đầu nhanh hơn

- **Tự động.** Mở *Tìm gói thầu*, *Mở thầu · Chờ kết quả*, *Kế hoạch LCNT*, *Nhà thầu
  trúng thầu*, *Phân tích địa bàn* hoặc *Hồ sơ chủ đầu tư* → phần mềm mở sẵn trang tra
  cứu e-GP ở **một tab nền**, trong lúc anh còn nhập tiêu chí.
- Không gửi tiêu chí, không bấm gì trên e-GP. Nếu anh đã mở sẵn trang tra cứu e-GP,
  phần mềm dùng lại, không mở thêm.
- Tắt: *Cấu hình* → bỏ chọn **"Mở sẵn trang e-GP ở tab nền để tra cứu nhanh hơn"**.
- Đo trên máy giả lập: lượt đầu từ 11,8 giây còn 5,9 giây. **Trên e-GP thật chưa đo
  được** — mức lợi tùy e-GP tải trang nhanh hay chậm hôm đó.

## 2. Bảng "Độ ổn định tra cứu e-GP"

- *Nâng cao → Kiểm tra dữ liệu (Chẩn đoán)* → mục **Độ ổn định tra cứu e-GP**.
- Cho biết: bao nhiêu % lượt hỏi e-GP thành công (tổng và 7 ngày), một lượt mất bao lâu
  (trung vị, chậm nhất 5%), **hỏng ở bước nào** (trang e-GP lỗi, trang bỏ qua thao tác,
  e-GP không trả lời…), số lần phần mềm tự đọc lại trang.
- Khi thấy "lúc được lúc mất", mở bảng này và gửi file *Xuất file chẩn đoán* cho người
  hỗ trợ — có số đo thật thay vì đoán.

## 3. Bộ săn TBMT: "Quét nhanh phần mới"

- *Bộ săn tự động* → sửa bộ săn **Thông báo mời thầu** → chọn **"Quét nhanh: chỉ hỏi
  gói đăng mới từ lần trước"** → Lưu.
- Mỗi ngày vẫn có **ít nhất một lượt quét đầy đủ**; các lượt khác chỉ hỏi gói mới đăng.
- Dòng trạng thái dưới bộ săn cho biết đã kiểm chứng chưa. Nếu e-GP không lọc đúng theo
  ngày đăng, phần mềm **tự tắt** quét nhanh cho bộ săn đó và ghi rõ lý do; bấm **"Thử
  lại quét nhanh"** khi muốn kiểm lại.
- **Cần biết:** bộ lọc ngày đăng của e-GP đã được đo cho kết quả LCNT nhưng **chưa được
  đo cho TBMT trên e-GP thật**. Vì thế chế độ này tắt sẵn và có các lớp tự kiểm ở trên.
  Bộ săn có quá nhiều kết quả (vượt giới hạn trang) sẽ luôn quét đầy đủ.

## 4. Tìm lại cùng tiêu chí: thấy ngay kết quả cũ, rồi nhãn **Mới / Đổi**

- Bấm *Tìm gói thầu* với tiêu chí đã từng tìm → trong lúc chờ e-GP, màn hình hiện
  **kết quả lượt trước** kèm dải vàng "Đang cập nhật… có thể đã cũ".
- Lượt mới xong: dải tóm tắt "So với lượt trước: X gói mới · Y gói đổi thông tin · Z gói
  không còn". Thẻ gói có nhãn **Mới** (xanh) hoặc **Đổi** (vàng — rê chuột xem trường
  nào đổi: giá, hạn đóng thầu…). Tích **"Chỉ xem gói Mới/Đổi"** để lọc.
- Nếu một trong hai lượt chưa tải đủ, phần mềm chỉ nói "Chưa thấy ở lượt trước",
  **không** khẳng định là gói mới đăng.

## 5. Tự chạy lại khi e-GP chập chờn ngay lúc bắt đầu

- **Tự động.** Mạng rớt ở trang đầu → gửi lại có giãn cách. Vẫn không được và **chưa có
  dữ liệu nào** → tải lại trang e-GP, chạy lại đúng tiêu chí **một lần**; dòng trạng thái
  ghi rõ đang tự chạy lại.
- Không tự chạy lại khi đã nhận được một phần dữ liệu, e-GP trả sai cấu trúc, e-GP từ
  chối (HTTP 4xx/429), hoặc anh bấm Dừng — chạy lại các trường hợp đó có thể che giấu dữ
  liệu thiếu.

## 6. Kiểm thử tự động trên GitHub (cho người phát triển)

- Mỗi lần đẩy mã: bộ kiểm thử trên Linux (4 múi giờ) và Windows (gồm cầu nối E-HSMT), và
  các kịch bản trình duyệt thật với e-GP giả lập "khó tính". Xem tab **Actions** của kho.

## 7. Kiểm tra cấu trúc e-GP hằng đêm + nhắn Telegram khi ĐỎ

- *Cấu hình* → mục kiểm tra định kỳ → **Tần suất: Hằng đêm** (mặc định vẫn hằng tuần), giờ
  0–4 sáng.
- Khi e-GP đổi cấu trúc dữ liệu (kết quả **ĐỎ**), phần mềm tự dừng quét tự động và — nếu
  đã bật Telegram — nhắn **một** tin nêu mã đối chứng hỏng. Hồi phục cũng nhắn một tin.
- Sửa lỗi cũ: ô giờ trước đây nhận 0–23 nhưng thực tế chỉ chạy 2 giờ sáng nếu chọn ngoài
  0–4. Nay chỉ nhận 0–4.

## 8. Chỉ số minh bạch tham khảo

- Thẻ gói (*Tìm gói thầu*), danh sách *Nhà thầu trúng thầu*, và file **Excel** (2 cột mới)
  có nhãn **"Minh bạch: điểm/100"**. Rê chuột để xem từng tín hiệu: hình thức lựa chọn
  (chỉ định thầu, chào hàng…), qua mạng hay không, thời gian mời thầu, số nhà thầu dự,
  mức giảm giá.
- Thiếu dữ liệu **không bị trừ điểm**; dưới 2 tín hiệu thì ghi "chưa đủ dữ liệu".
- **Không phải kết luận vi phạm** — chỉ gợi ý gói nào nên đọc kỹ hồ sơ trước khi bỏ công
  dự thầu. Mốc thời gian mời thầu (18 ngày; 9 ngày với gói quy mô nhỏ) là **mốc tham
  chiếu**; tôi không chắc tuyệt đối điều kiện áp dụng theo Luật Đấu thầu 2023 — cần đối
  chiếu văn bản trước khi dùng vào việc gì ngoài tham khảo.

## 9. Soi quan hệ chủ đầu tư – nhà thầu

- *Hồ sơ chủ đầu tư* → bảng nhà thầu đã trúng có thêm cột **Ít cạnh tranh** và **Chỉ 1
  NT dự**, nhãn **Cần xem** khi một nhà thầu có ≥3 gói mà phần lớn là chỉ định/1 nhà thầu
  hoặc chiếm ≥50% số gói.
- *Nhà thầu trúng thầu* (tra theo mã số thuế) → bảng **Quan hệ với chủ đầu tư** (nhà thầu
  này trúng tập trung ở đâu) và **Đối tác liên danh thường xuyên** — hữu ích khi tìm hiểu
  đối thủ trên địa bàn.
- Số liệu chỉ mô tả dữ liệu đã tải về máy. Ở địa bàn nhỏ, một nhà thầu trúng nhiều gói của
  cùng chủ đầu tư là bình thường — **không phải bằng chứng vi phạm**.

## 10. Bản tin sáng qua Telegram

- *Cấu hình* → Telegram (điền Bot Token, Chat ID, bật gửi tự động) → chọn **"Bản tin
  sáng"**, giờ (mặc định 07:00 giờ Việt Nam) → **Lưu cấu hình** → bấm **"Gửi thử bản tin
  ngay"** để xem mẫu.
- Mỗi sáng **một tin**: gói mới khớp tiêu chí 24 giờ qua, gói đang theo dõi sắp đóng thầu
  ≤3 ngày (≤1 ngày đánh dấu 🔴), tình trạng hệ thống. Máy tắt lúc 7 giờ thì gửi bù khi mở
  Chrome (trước 12 giờ trưa).
- Bản tin **chỉ dùng dữ liệu đã quét** trên máy — muốn mục 1 đầy đủ, hãy để Bộ săn chạy
  trước 7 giờ (ví dụ 06:05).

## Điều cần biết về độ tin cậy của bản này

- Toàn bộ kiểm thử chạy trên **máy chủ e-GP giả lập**, không chạm e-GP thật. Cổng phát
  hành của tác giả (`tools/check-live-evidence.py`) vẫn yêu cầu chạy lại kiểm tra trực
  tiếp trên e-GP thật (`tests/live-*.mjs`) trên một máy có mạng tới e-GP. Tôi **không**
  làm giả bằng chứng đó.
