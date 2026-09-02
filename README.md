# Giáo Sư Cùi Bắp

Tiện ích Chrome (Manifest V3) tra cứu gói thầu trên Hệ thống mạng đấu thầu quốc
gia — [muasamcong.mpi.gov.vn](https://muasamcong.mpi.gov.vn).

## Bảy chức năng

| # | Chức năng | Trả lời câu hỏi |
|---|---|---|
| 1 | Tìm thông báo mời thầu | Có gói nào đang mời thầu hợp năng lực công ty không? |
| 2 | Nhà thầu trúng thầu | Công ty này (theo MST) đã trúng những gói nào? |
| 3 | Gói đang chờ kết quả | Ai đang dự thầu, và giảm giá bao nhiêu phần trăm? |
| 4 | Kế hoạch lựa chọn nhà thầu | Chủ đầu tư này sắp mời thầu những gói gì? |
| 5 | Soi địa bàn | Xã/phường này hay có công ty nào trúng? |
| 6 | Hồ sơ 360° nhà thầu | Lịch sử trúng thầu theo năm, địa bàn, bên mời thầu |
| 7 | Hồ sơ chủ đầu tư | Đơn vị này tổ chức bao nhiêu gói, ai hay trúng? |

Kèm theo: chấm điểm mức độ phù hợp năng lực, xuất Excel `.xlsx`, đẩy cảnh báo
gói mới về Telegram, và báo cáo HTML độc lập để xem trên điện thoại.

## Cài đặt

1. Tải mã nguồn về, giải nén ra một thư mục cố định (đừng để trong Downloads —
   xoá nhầm là mất dữ liệu đã quét).
2. Mở Chrome → `chrome://extensions`
3. Bật **Chế độ dành cho nhà phát triển** (góc trên bên phải)
4. Bấm **Tải tiện ích đã giải nén** → chọn thư mục vừa giải nén

## Dùng lần đầu

1. Mở **Cấu hình**, nhập tỉnh ưu tiên, từ khoá thế mạnh, dải giá gói thầu.
2. Mở e-GP → **Tra cứu › Lựa chọn nhà thầu** → tìm kiếm một lần cho ra kết quả.
3. Bấm biểu tượng tiện ích → **Lưu bộ lọc vừa tìm**.
4. Từ đó về sau chỉ cần bấm **Quét & trích xuất**.

> **Số trang tối đa** trong Cấu hình quyết định quét được bao nhiêu gói. Mỗi
> trang thường 10–50 gói. Nếu chưa lấy hết, phần mềm sẽ báo rõ *"CHƯA LẤY HẾT:
> mới quét 3/14 trang…"* chứ không im lặng.

## Nguyên tắc hoạt động

- **Chỉ đọc dữ liệu công khai.** Không cần đăng nhập e-GP, không lưu tài khoản,
  mật khẩu hay cookie.
- **Chạy bằng chính giao diện e-GP.** Endpoint tìm kiếm của e-GP được bảo vệ
  bằng reCAPTCHA v3, nên tiện ích không tự gọi API mà để trang e-GP tự phát
  request kèm token hợp lệ của nó, rồi chỉ tinh chỉnh tiêu chí tìm kiếm.
- **Không dồn dập.** Nghỉ 350 ms giữa mỗi trang khi phát lại bộ lọc, 900 ms khi
  chuyển trang qua giao diện e-GP.
- **Dữ liệu nằm trên máy bạn.** Chỉ ra khỏi máy khi bạn tự bật Telegram
  (bot của chính bạn).

## Kiến trúc

```
page-hook.js   (MAIN world)      quan sát fetch/XHR của e-GP, phát lại bộ lọc
content.js     (ISOLATED world)  điều khiển giao diện e-GP, chuyển dữ liệu về nền
background.js  (service worker)  chuẩn hoá, chấm điểm, chống trùng, lưu trữ, xuất
lib/                             logic thuần: e-GP, chấm điểm, Excel, thống kê
*.html + *.js                    giao diện từng chức năng
```

Ba loại mã trên e-GP được tách bạch, tuyệt đối không lẫn:

| Mã | Trường | Ý nghĩa |
|---|---|---|
| `IB…` | `notifyNo` | Mã TBMT — cấp khi đăng Thông báo mời thầu |
| `BP…` | `bidNo` | Mã gói thầu trong KHLCNT — có **trước** khi có TBMT |
| `PL…` | `planNo` | Mã của cả bản kế hoạch lựa chọn nhà thầu |

## Kiểm thử

Xem [`tools/test/README.md`](tools/test/README.md). Có e-GP giả lập để chạy
toàn trình mà không đụng vào máy chủ thật.

## Sinh lại bộ icon

Icon nguồn là SVG trong `tools/icon-src/`. Sau khi sửa:

```bash
node tools/render-icons.mjs ./icons
```

Bốn cỡ được vẽ **riêng** chứ không thu nhỏ từ một file: ở 16 px chỉ giữ được ba
nét nên vòng phụ bị bỏ và nét dày hẳn lên, còn ở 128 px mới đủ chỗ cho vệt quét
radar và ba vòng cự ly.

## Giới hạn cần biết

- Điểm phù hợp là công cụ **ưu tiên nội bộ**, không thay thế việc đọc HSMT.
  Quyết định dự thầu phải kiểm tra lại trên nguồn chính thức.
- Giá dự thầu của từng nhà thầu chỉ có ở **trang chi tiết** từng gói, không có
  trong chỉ mục tìm kiếm — nên không lấy được hàng loạt.
- e-GP **không lọc được theo mã xã/phường** (đã đo: trả về 0 kết quả), nên
  xã/phường được lọc tại chỗ sau khi tải về.
- Chrome trên điện thoại không cài được tiện ích. Dùng chức năng **Xuất báo cáo
  điện thoại** để tạo file HTML độc lập.
