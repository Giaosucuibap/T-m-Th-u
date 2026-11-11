# Bản 4.4.0 — bộ săn, theo dõi CĐT, lọc đa tỉnh

Bản này gồm việc đã lên kế hoạch cho 4.3.5 và phần săn tự động của 4.4.

## Cài hoặc cập nhật

1. Giải nén ZIP. Thư mục nạp Chrome là **GiaoSuCuiBap** (có `manifest.json`).
2. Nếu đang dùng 4.3.x: chép đè vào thư mục cũ, mở `chrome://extensions`, bấm **Tải lại**. Không cần gỡ tiện ích — dữ liệu local được giữ.
3. Tải lại tab e-GP. Kiểm tra phiên bản **4.4.0**.

Cài lần đầu: bật chế độ nhà phát triển → Tải tiện ích đã giải nén → chọn thư mục GiaoSuCuiBap.

## Việc mới trên form tìm TBMT

- Nhiều tỉnh trong một ô, cách nhau bằng dấu phẩy hoặc chấm phẩy.
- Ô **Từ khóa bắt buộc** và **Không chứa từ**: lọc tại máy trên dữ liệu đã tải.
- Viết tắt tư vấn: TVGS, TVTK, TVKS, QLDA, TVQLDA.
- Thẻ kết quả có giai đoạn: kế hoạch / mời thầu / mở thầu / kết quả.

## Bộ săn tự động

Mở **Bộ săn tự động** trên thanh bên.

Mỗi bộ gồm: loại TBMT hoặc KHLCNT, tiêu chí, giờ chạy (ví dụ `06:05, 16:00`), bật/tắt, tùy chọn Telegram.

- Tối đa 12 bộ.
- Lịch dùng báo thức Chrome. Máy tắt hoặc Chrome đóng thì chạy bù khi mở lại.
- **Chạy ngay** vẫn cần tab e-GP.

## Theo dõi chủ đầu tư

Trong cùng trang Bộ săn, thêm tên đơn vị hoặc MST. Gói khớp khi quét sẽ được gắn theo dõi và vào nhóm cảnh báo.

## Nhắc hạn nộp

Gói đang theo dõi, đang trong pipeline, hoặc đạt ngưỡng cảnh báo được nhắc khoảng 72 giờ, 24 giờ và 3 giờ trước hạn. Telegram dùng cấu hình chung.

## Bảo mật

- Token Telegram không còn đi kèm `GET_STATE`. Chỉ trang Cấu hình đọc được token thật.
- Thông báo lỗi trên một số màn không còn gắn HTML thô từ dữ liệu e-GP.
- `postMessage` ghi origin trang hiện tại.

Nếu Chẩn đoán hoặc trang Bộ săn báo schema lạ: e-GP vừa đổi field JSON. Đối chiếu trực tiếp trên cổng, đừng tin số 0 gói.
