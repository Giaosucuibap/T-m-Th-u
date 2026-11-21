# Hướng dẫn bản 4.17.1 — e-GP đổi địa chỉ

Hệ thống mạng đấu thầu quốc gia đã chuyển sang **https://muasamcong.mof.gov.vn**
(Bộ Tài chính). Bản 4.17.1 cập nhật phần mềm theo địa chỉ mới.

## Cài đặt
1. Giải nén `GiaoSuCuiBap-4.17.1.zip`, chép đè thư mục `GiaoSuCuiBap` cũ.
2. Mở `chrome://extensions` → bấm ↻ **Reload** ở thẻ Giáo Sư Cùi Bắp.
3. Thanh bên trái phải hiện **PHIÊN BẢN 4.17.1**. Dữ liệu cũ giữ nguyên.

## Thay đổi
- Mọi lượt tra cứu, tab mở sẵn, liên kết "Mở e-GP" nay dùng **muasamcong.mof.gov.vn**.
- Tab e-GP anh đang mở ở **địa chỉ cũ** vẫn dùng được; gói đã lưu từ trước vẫn mở được —
  liên kết cũ tự đổi sang địa chỉ mới khi anh bấm.
- Không cần làm gì thêm, không đổi cấu hình.

## Nên làm ngay sau khi cài
1. Bấm **Tìm gói thầu** một lượt nhỏ (ví dụ một tỉnh) để chắc trang mới chạy.
2. Mở *Nâng cao → Kiểm tra dữ liệu (Chẩn đoán)* → **Kiểm tra mẫu trên e-GP → Kiểm tra
   ngay**. Nếu báo **ĐỎ**, e-GP mới đã đổi cả cách trả dữ liệu — phần mềm tự dừng quét
   tự động để không lưu sai; khi đó gửi file chẩn đoán cho người hỗ trợ.

## Cần biết
- Tôi đã xác minh địa chỉ mới qua chỉ mục tìm kiếm công khai (trang mang tên "Hệ thống
  mạng đấu thầu quốc gia - Bộ Tài chính", cùng phần mềm EGP_v2.0, cùng cấu trúc đường
  dẫn), nhưng **môi trường của tôi không vào thẳng được trang e-GP**, nên chưa chạy thử
  trên trang thật. Toàn bộ kiểm thử chạy trên máy chủ giả lập.
