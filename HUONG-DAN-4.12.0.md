# Giáo Sư Cùi Bắp 4.12.0

Bản này nhận **4.11.0 của tác giả** làm nền và làm tiếp bốn việc: **nhanh gấp
4,2–4,7 lần**, **bảng Excel kẻ ô và có màu**, **bộ icon nhất quán**, và sửa một
số lỗi âm thầm.

## Cập nhật bản đang dùng

1. Vào Cấu hình, xuất bản sao lưu, giữ file ở nơi riêng.
2. Dừng lượt quét đang chạy, đóng các trang chức năng và tab e-GP đang dùng.
3. Giải nén ZIP mới, chép đè nội dung thư mục `GiaoSuCuiBap`.
4. Mở `chrome://extensions`, bấm tải lại. Kiểm tra phiên bản hiện là **4.12.0**.

Không cần gỡ tiện ích; gỡ có thể xoá kho dữ liệu.

## 1. Nhanh hơn — và nút thắt không nằm ở chỗ ai cũng đoán

Đo trên chính bản của tác giả và bản này, trung vị 7 lượt:

| Thao tác | Kho 3.000 gói | Kho 20.000 gói |
|---|---|---|
| Gõ một phím vào ô tìm | 322 → **77 ms** | 2.374 → **506 ms** |
| Đổi bộ lọc điểm | 85 → **19 ms** | 649 → **137 ms** |
| Đổi mã tỉnh | 44 → **10 ms** | 370 → **74 ms** |

Tách từng phần trên kho 20.000 gói thì lọc theo chữ chỉ tốn **1 ms**, chọn qua
chỉ mục **0–2 ms**, còn **phép sắp xếp tốn 2.198 ms**.

Lý do: mỗi lần so sánh hai gói, phần mềm tính lại trạng thái và số ngày còn lại
của cả hai — mà một lần sắp 20.000 gói cần khoảng 286.000 phép so sánh. Thành ra
~570.000 lần phân tích ngày cho **một** lần sắp, và nó chạy lại mỗi lần anh gõ
một phím.

Nay các con số đó tính **một lần cho mỗi gói**, rồi sắp trên số đã tính. Thứ tự
hiện ra **không đổi một dòng nào** — điều này được kiểm tự động trên cả bốn kiểu
sắp, vì sắp sai thứ tự còn tệ hơn chậm.

**Kèm theo:** kết quả nay **lặp lại được**. Trước đây hai gói bằng điểm nhau thì
đứng theo thứ tự chúng tình cờ nằm trong kho — tra hai lần, in hai tờ, so ra
lệch, mà không biết bên nào đúng. Nay thứ tự cố định.

## 2. Bảng Excel xuất ra

Mở file ra là thấy ngay:

- **Dải đầu bảng** hai dòng: tên báo cáo, đang lọc theo gì, mạch đối soát e-GP
  (*"e-GP báo 137 · đã tải 137 · khớp 123 · ngoài tiêu chí 14"*), xuất lúc nào.
  Người nhận file không ngồi cạnh anh, bảng phải tự giải thích được.
- **Kẻ khung từng ô**, dòng tiêu đề nền xanh chữ trắng, cố định khi cuộn, có sẵn
  nút lọc trên từng cột.
- **Màu nền mang đúng kết luận**, không phải trang trí:

| Màu | Nghĩa | Việc cần làm |
|---|---|---|
| Xanh nhạt | Khớp tiêu chí | Xử lý theo điểm phù hợp |
| **Vàng nhạt** | **Chưa đủ dữ liệu** | **Mở e-GP kiểm lại — đừng bỏ qua nhóm này** |
| Đỏ nhạt | Ngoài tiêu chí | Có căn cứ để loại |

  Gói không có kết luận thì **không tô màu**, chỉ kẻ dải chẵn/lẻ cho dễ dò hàng.
  Tô màu khi không có căn cứ là nói một điều chắc chắn mà sai.
- **Đậm** tên gói và giá gói; **nghiêng xám** lý do đối chiếu.
- **Ô thiếu giá để TRỐNG**, không phải "0 đ". Bỏ hẳn gói thiếu giá ra khỏi bảng
  cho đẹp là xoá đúng nhóm cần soi nhất.
- Giá là **số thật**, cộng và sắp xếp được trong Excel.

## 3. Icon

Bộ cũ là ba cái dấu khác nhau: 16/32px một kiểu, 48px chen chúc thêm vạch ngắm
và khung tài liệu, 128px một cảnh radar khác hẳn. Bộ mới giữ **một dáng duy
nhất** ở mọi cỡ, chi tiết chỉ thêm vào khi kích thước cho phép.

## 4. Lỗi đã sửa

- **`Failed to fetch` hiện thẳng ra màn hình.** Dưới ô *Xã / Phường* trước đây
  hiện đúng hai chữ tiếng Anh đó. Điều tệ nhất không phải câu chữ: ô chọn xã im
  lặng ngừng hoạt động, nên anh vẫn bấm tìm và vẫn nhận kết quả — chỉ là kết quả
  **không hề lọc theo xã**, mà trông vẫn bình thường. Nay báo rõ: hỏng ở đâu,
  tiêu chí xã **đang không được áp dụng**, và phải làm gì.
- **Bộ lọc xã trên màn hình Kế hoạch chưa bao giờ dùng được** — chỗ gọi không
  được truyền danh mục địa bàn, nên mọi kế hoạch đều rơi vào "Chưa đủ dữ liệu".
- **Mã loại gói gõ sai bị hiểu là "không lọc gì"** và trả về toàn bộ gói thầu,
  trong khi màn hình vẫn hiện bộ lọc đang bật.
- **Gói con của kế hoạch mượn được tên xã của kế hoạch mẹ**, nên một gói ở xã
  khác vẫn khớp.
- Bản Excel: **giá lẻ và giá chẵn khác độ đậm** trong cùng một cột.
- Gói cài ghi **`version_name` là 4.11.0** trong khi phiên bản thật là 4.12.0 —
  và đó chính là con số Chrome hiện cho người dùng.

## 5. Về tiêu chí Xã/Phường — nên biết để dùng cho đúng

Xã được nhận dạng bằng **cặp mã xã + mã tỉnh**, không phải bằng tên. Lý do: "Đức
Trọng" có ở nhiều tỉnh, khớp theo tên là nhận nhầm gói cách đó bốn trăm cây số.

Khi hồ sơ không kèm mã, phần mềm chấp nhận chữ trong chuỗi địa điểm — nhưng phải
nêu **đồng thời** tên xã và một tỉnh nằm trong phạm vi anh chọn. Nêu mỗi tên xã
thì chưa đủ.

Chữ chỉ đủ để **công nhận**, không đủ để **loại bỏ**: chuỗi nêu một xã khác vẫn
được xếp "Chưa đủ dữ liệu" chứ không loại hẳn, vì địa chỉ chủ đầu tư không phải
địa điểm thi công.

**Vì vậy nhóm "Chưa đủ dữ liệu" là nhóm đáng mở ra xem nhất.** Nó không có nghĩa
là không đạt — nó có nghĩa là chưa biết.

## Đã kiểm những gì trước khi phát hành

| Hạng mục | Kết quả |
|---|---|
| Phép thử tự động | **475/475 đạt** |
| Chạy lại ở 4 múi giờ | đạt cả 4 |
| Nạp 22 trang giao diện trong Chromium | 0 lỗi |
| Người dùng mới quét e-GP | SUCCESS, 137/137 |
| Toàn trình: tìm → xem → xuất Excel | 0 lỗi |
| Kích thước popup | ĐẠT, không co |
| Đối chiếu thứ tự sắp xếp trước/sau tối ưu | trùng khớp cả 4 kiểu |
| Cấu trúc file Excel | kiểm bằng bộ đọc Excel độc lập |

Tất cả chạy trên **máy chủ e-GP giả lập**, không đụng máy chủ thật. Bản giả lập
không dựng lại reCAPTCHA v3, trạng thái phiên hay thay đổi giao diện tương lai
của e-GP.

## Còn nợ, ghi ra để không quên

- Danh sách canary sống mới có ít mã; phần tra từng mã chưa tự động.
- Kho dữ liệu vẫn ở `chrome.storage.local`, chưa chuyển IndexedDB. Đây là hạng
  mục lớn nhất còn lại: sau tối ưu này, phần chậm còn lại nằm ở chỗ đọc cả kho
  ra bộ nhớ mỗi lần mở màn hình.
- Chưa đo trên máy chủ e-GP thật, nên các con số tốc độ ở trên là tốc độ **xử
  lý cục bộ**, không bao gồm thời gian chờ mạng.
- Gói cài vẫn kèm nhiều file hướng dẫn của các bản cũ.
