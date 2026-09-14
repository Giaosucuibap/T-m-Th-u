# Giáo Sư Cùi Bắp 4.11.0

Bản này làm nhóm **B1 — Chính xác hơn nữa**: khớp xã theo mã thay vì theo chữ,
thêm canary đối chứng với e-GP thật, khoá lại việc bản Excel xuất ra phải trùng
khít danh sách đang hiện, và bỏ những lời hứa không giữ được trên giao diện.

## Cập nhật bản đang sử dụng

1. Vào Cấu hình của bản đang dùng, xuất bản sao lưu và giữ file đó ở nơi riêng.
2. Dừng lượt quét đang chạy, đóng các trang chức năng của tiện ích và các tab
   e-GP đang được lượt quét sử dụng.
3. Giải nén ZIP mới. Sao chép nội dung thư mục `GiaoSuCuiBap` vào đúng thư mục
   tiện ích Chrome đang nạp, thay thế các file cũ.
4. Mở `chrome://extensions`, tìm Giáo Sư Cùi Bắp và bấm nút tải lại. Kiểm tra
   phiên bản hiện là **4.11.0**.
5. Mở lại chức năng từ icon tiện ích, chạy một lượt tìm mới.

Không cần gỡ tiện ích để cập nhật; gỡ tiện ích có thể xoá kho dữ liệu của nó.

## Có gì mới

### Lọc theo xã đã chặt hơn

Trước đây tiêu chí xã khớp bằng **cụm chữ**. Một xã trùng tên ở tỉnh khác vẫn
lọt vào danh sách, và không có cách nào nhìn ra. Nay phần mềm đối chiếu theo
**mã địa bàn** của e-GP:

- Hai bên đều có mã → kết luận dứt khoát theo mã.
- Chỉ một bên có mã → đối chiếu tên, nhưng giới hạn trong mã tỉnh đã chọn.
- Không đủ căn cứ → xếp vào **Chưa đủ dữ liệu**, giữ lại để anh tự xét, chứ
  không âm thầm vứt đi.

Nhóm *Chưa đủ dữ liệu* vẫn là nhóm đáng mở ra xem nhất. Nó không phải "không
đạt" — nó là "chưa biết", và e-GP thiếu dữ liệu thường xuyên hơn người ta tưởng.

### Bản Excel xuất ra trùng khít danh sách đang hiện

Đây là thứ dễ sai nhất mà không ai phát hiện: màn hình hiện 24 gói, file Excel
mở ra 31 gói, và anh cầm con số nào đi họp cũng có thể sai. Bản này khoá lại
bằng một phép thử chạy **chính hàm xuất thật**, trên 7 tổ hợp bộ lọc. Nếu sau
này ai đó thêm một bộ lọc riêng vào đường xuất, phép thử báo đỏ ngay.

Kèm theo: gói **thiếu giá vẫn nằm trong file**, ô giá để **trống** chứ không ghi
"0 đ" — bỏ nó đi cho bảng đẹp là xoá đúng nhóm cần soi nhất.

### Canary sống — biết khi e-GP đổi

Đây là chỗ cần nói thẳng. Toàn bộ 453 phép thử tự động của phần mềm chạy trên
**dữ liệu tự dựng**. Chúng chứng minh phần mềm không tự hỏng, và chỉ vậy. Chúng
**không** biết e-GP vừa đổi tên một trường hay vừa bỏ một mã tỉnh — đúng loại
hỏng làm phần mềm trả kết quả thiếu mà vẫn "xanh" hết.

Canary sống lấp chỗ đó. Mở tiện ích → **Chẩn đoán** → **"Chạy canary sống"**
(nên chạy sau 22h; e-GP là hệ thống công, đừng thêm tải vào giờ các đơn vị đang
nộp hồ sơ). Nó canh ba thứ:

| Hỏng | Hậu quả nếu không biết |
|---|---|
| Một trường biến mất | Cột giá trống hàng loạt, không ai hiểu vì sao |
| Một mã tra được nay mất | Gói cũ không mở lại được |
| **Mã địa bàn trôi** | Lâm Đồng có cả mã `68` và `703`. Mất `703` là **bỏ sót lặng lẽ toàn bộ hồ sơ trước 1/7/2025** |

**Phần chưa xong, nói rõ:** danh sách mới có 9 mã (mục tiêu 20–30), trong đó 4
mã đã đọc được trên e-GP thật, 5 mã mới lấy từ kết quả tìm kiếm chưa mở chi tiết
xác nhận. Phần tra từng mã **chưa tự động** — màn hình Chẩn đoán ghi thẳng
`0/9 — chưa tự động` chứ không báo đạt. Phần bất biến mã địa bàn thì đã tự động
đầy đủ và chạy được ngay.

### Bỏ chữ "tuyệt đối" trên giao diện

Dữ liệu nằm ở e-GP, một hệ thống phần mềm này không kiểm soát: nó có thể đổi cấu
trúc bất cứ lúc nào, **bỏ qua lặng lẽ** bộ lọc nó không hiểu, và trả về chuỗi
`'null'` thay cho trường trống. Trên một nguồn như vậy, không phần mềm nào bảo
đảm được tính tuyệt đối.

Hứa điều đó là có hại thật: anh sẽ thôi đối chiếu lại với e-GP, và một lần bỏ
sót sẽ không ai phát hiện. Cái phần mềm làm được, và đang làm, là chính xác
**kiểm chứng được**: mọi con số truy ngược được về nguồn, mọi chỗ thiếu dữ liệu
đều được nói ra, và không bao giờ suy diễn từ chỗ không có dữ liệu.

## Đọc kết quả đúng phạm vi

- **Khớp tiêu chí** — đủ dữ liệu và đáp ứng điều kiện đã chọn.
- **Chưa đủ dữ liệu** — thiếu trường cần đối chiếu (giá, ngày, địa bàn). Mở
  nguồn e-GP kiểm tra. **Đừng bỏ qua nhóm này.**
- **Ngoài tiêu chí** — có đủ căn cứ để kết luận gói không đáp ứng. Không cộng
  nhóm này vào số gói khớp.
- **Kết quả một phần** — chưa xác nhận lấy đủ số trang. Chạy lại hoặc thu hẹp
  phạm vi nếu cần đối soát đầy đủ.

Thông báo kết thúc luôn ghi đủ mạch đối soát, ví dụ:
*"e-GP báo 137 · đã tải 137 · khớp 123 · ngoài tiêu chí 14 · trang 3/3"*.
Ba con số đầu phải cộng khớp. Nếu không khớp, đó là dấu hiệu cần xem lại chứ
không phải kết quả để dùng.

## Đã kiểm những gì trước khi phát hành

| Hạng mục | Kết quả |
|---|---|
| Phép thử tự động | 453/453 đạt |
| Chạy lại ở 4 múi giờ | đạt cả 4 (UTC, Việt Nam, New York, Auckland) |
| Nạp 22 trang giao diện trong Chromium | 0 lỗi |
| Kịch bản người dùng mới quét e-GP | SUCCESS, 137/137 |
| Kịch bản đang mở sẵn tab e-GP khác | SUCCESS, 137/137 |
| Kịch bản toàn trình (tìm → xem → xuất Excel) | 0 lỗi |
| Màn hình kế hoạch, lọc theo ngày | 5/5 đạt |
| Kích thước popup, 3000 gói | 0 lần nhảy |

Tất cả chạy trên **máy chủ e-GP giả lập**, không đụng vào máy chủ thật. Bản giả
lập không dựng lại reCAPTCHA v3, trạng thái phiên, hay thay đổi giao diện tương
lai của e-GP. Vì vậy bản này vẫn là **bản ứng cử để chạy thử**, không phải bằng
chứng tương thích đầy đủ.

## Còn nợ, ghi ra để không quên

- Danh sách canary mới 9/20 mã; phần tra từng mã chưa tự động.
- Kho dữ liệu vẫn nằm ở `chrome.storage.local` chứ chưa chuyển sang IndexedDB —
  đây là hạng mục lớn nhất còn lại, ảnh hưởng tốc độ khi kho vượt vài nghìn gói.
- Gói cài vẫn kèm 14 file hướng dẫn của các bản cũ.
