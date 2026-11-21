# Hướng dẫn bản 4.17.2 — sửa lỗi "cấu trúc tiện ích không nhận ra"

## Lỗi đã sửa
Sau khi e-GP chuyển sang **muasamcong.mof.gov.vn**, màn hình *Gói đang chờ kết quả*
(và các màn hình tra cứu khác) có thể báo:

> e-GP đã gửi yêu cầu tìm kiếm theo một cấu trúc tiện ích không nhận ra, nên không
> gắn được tiêu chí…

Bản 4.17.1 chỉ hiểu **một** cách trang e-GP đóng gói yêu cầu tìm kiếm. Bản 4.17.2 hiểu
thêm các cách đóng gói mà trang web hiện đại hay dùng, và không bỏ cuộc ngay khi gặp
một yêu cầu lạ lần đầu.

## Cài đặt
1. Giải nén `GiaoSuCuiBap-4.17.2.zip`, chép đè thư mục `GiaoSuCuiBap` cũ.
2. Mở `chrome://extensions` → bấm ↻ **Reload** ở thẻ Giáo Sư Cùi Bắp.
3. **Đóng hết các tab e-GP đang mở** (tab cũ vẫn mang bản cũ của tiện ích bên trong).
4. Thanh bên trái phải hiện **PHIÊN BẢN 4.17.2**. Dữ liệu cũ giữ nguyên.

## Thử lại
Mở *Gói đang chờ kết quả* → Tỉnh Lâm Đồng → 15 ngày gần đây → **Bắt đầu quét**.

## Nếu vẫn báo lỗi
Câu báo lỗi mới có thêm đoạn **"dạng yêu cầu: …"**, ví dụ
`dạng yêu cầu: Blob → đối tượng {pageSize,pageNumber,query[1]}`.
Đoạn này **chỉ có tên trường**, không có dữ liệu, mật khẩu hay mã bảo vệ nào.
Anh chụp màn hình câu báo lỗi đó gửi lại — đủ để sửa đúng chỗ trong một lần,
không phải đoán.

## Cần biết
- Môi trường phát triển **không vào được trang e-GP thật**, nên tôi chưa thấy tận mắt
  yêu cầu của trang mới. Bản sửa được kiểm trên máy chủ e-GP giả lập với 7 dạng yêu
  cầu khác nhau: bản 4.17.1 hỏng 6/7 (đúng câu lỗi anh gặp), bản 4.17.2 đạt 7/7.
- "Không gắn được tiêu chí" nghĩa là e-GP **chưa được hỏi** theo điều kiện của anh —
  không phải "không có gói nào".
