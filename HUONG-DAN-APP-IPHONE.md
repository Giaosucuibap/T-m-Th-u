# Hướng dẫn app iPhone — Giáo Sư Cùi Bắp (bản thử 1.0.0)

## Tình trạng hiện tại

**Đã làm xong**
- **Tìm gói thầu (TBMT)** theo tỉnh, loại gói, từ khoá, khoảng giá, chủ đầu tư, từ bắt buộc/loại trừ.
- **Chi tiết gói**: điểm phù hợp kèm lý do, đối chiếu từng tiêu chí, nút mở trang e-GP, nút chia sẻ (Zalo, tin nhắn).
- **Theo dõi & nhắc hạn**: mỗi gói có 3 lời nhắc hẹn sẵn trên điện thoại (còn 3 ngày, còn 24 giờ, còn 3 giờ).
  Lời nhắc kêu cả khi app đang đóng. Khi tra lại thấy gói được gia hạn, app tự hẹn lại theo hạn mới.
- **Lịch sử** 10 lượt tra gần nhất, chạm một lần là dùng lại tiêu chí.
- **Dùng chung lõi tra cứu với tiện ích Chrome 4.19.0**, nguyên văn từng dòng. Hai bên luôn cho cùng kết quả
  chấm điểm và lọc.

**Đã kiểm thử trong môi trường phát triển**
- 29/29 bài kiểm thử đơn vị.
- 7/7 kịch bản trên trình duyệt thật với e-GP giả lập, gồm cả chế độ "khó tính": mạng rớt 25%, bấm Dừng
  giữa chừng, nhiều chủ đầu tư.
- Đóng gói thử cho iPhone đạt.
- Chụp 7 màn hình cỡ iPhone, không có lỗi.

**Chưa kiểm — cần anh**
- Chưa chạy trên **iPhone thật**: khung trình duyệt của iPhone khác Chrome.
- Chưa chạy với **e-GP thật**: môi trường phát triển bị tường lửa e-GP chặn.

Hai điều trên chỉ kiểm được trên điện thoại của anh. Đó là Chặng 1 dưới đây.

## Chặng 1 — Chạy thử bằng Expo Go
Miễn phí, mất khoảng 15 phút, không cần tài khoản Apple trả phí.

1. **Cài Expo Go.** Trên iPhone mở App Store, tìm **Expo Go** (nhà phát triển: 650 Industries, Inc.), bấm Nhận.
2. **Tạo tài khoản Expo miễn phí** tại <https://expo.dev/signup>, dùng email công ty hoặc Gmail.
3. **Tạo mã truy cập.**
   - Đăng nhập expo.dev, bấm ảnh đại diện ở góc phải.
   - Vào **Account settings › Access tokens › Create token**, đặt tên `giao-su-cui-bap`.
   - Bấm **Copy** để chép mã.
4. **Cất mã vào GitHub của anh** (mã nằm trong kho của anh, không đưa cho ai, kể cả tôi):
   - Mở <https://github.com/Giaosucuibap/T-m-Th-u/settings/secrets/actions> (cần đăng nhập GitHub).
   - Bấm **New repository secret**.
   - Ô **Name** gõ đúng `EXPO_TOKEN`. Ô **Secret** dán mã vừa chép. Bấm **Add secret**.
5. **Nhắn tôi "đã thêm EXPO_TOKEN".**
   - Tôi chạy quy trình tự động "App — bản thử iPhone" trên GitHub. Quy trình tự kiểm thử lại, đăng bản
     thử vào tài khoản Expo của anh, rồi tạo **mã QR**. Tôi gửi anh đường link tới trang có mã QR.
   - Anh cũng có thể tự chạy: tab **Actions** › **App — bản thử iPhone** › chọn lượt mới nhất ›
     **Re-run all jobs**.
   - Từ đó, mỗi lần tôi sửa app, bản thử mới được đăng tự động.
6. **Mở app trên iPhone**, chọn một trong hai cách:
   - Mở trang có mã QR trên máy tính, dùng **camera iPhone** quét mã, rồi bấm "Mở trong Expo Go".
   - Hoặc mở Expo Go, đăng nhập đúng tài khoản Expo ở bước 2, vào mục **Projects** › **Giáo Sư Cùi Bắp**.

Không muốn dùng GitHub? Anh có thể tự thêm mã vào phần cài đặt môi trường của Claude Code (mục
**Network secrets**, máy chủ `api.expo.dev`), rồi nhắn tôi để tôi đăng trực tiếp.
7. **Chạy thử theo kịch bản** (mỗi bước chụp màn hình gửi lại):
   1. Ở dòng trên cùng màn Tìm gói, chờ **e-GP: Sẵn sàng** (lần đầu mất khoảng 5–20 giây).
   2. Để nguyên **Lâm Đồng · Xây lắp**, bấm **Tìm trên e-GP**. Giữ app mở tới khi xong, thường dưới 1 phút.
   3. **Đối chiếu với tiện ích Chrome.** Trên máy tính, tra cùng tiêu chí trong tiện ích Chrome. Hai con số
      "e-GP báo …" phải bằng nhau. Đây là bằng chứng app lấy đúng dữ liệu e-GP thật.
   4. Mở một gói, bấm **Theo dõi & nhắc hạn**, rồi bấm **Cho phép** thông báo.
   5. Nếu báo lỗi: vào **Thông tin › Xem trang e-GP** để xem trang e-GP trong app có mở được không.
      Chụp lại cho tôi.

**Lưu ý về Expo Go**
- Expo Go là app "chạy thử" chính thức của Expo. App của mình chạy **bên trong** Expo Go, nên biểu tượng
  trên màn hình chính và tên trên thông báo là của Expo Go.
- Một số tính năng có thể khác bản chính thức, ví dụ thông báo nhắc hạn. Nếu không thấy thông báo, đó có thể
  là giới hạn của Expo Go chứ chưa chắc là lỗi app; bản TestFlight sẽ cho câu trả lời chắc chắn.

## Chặng 2 — Bản TestFlight (bản chính thức nội bộ, biểu tượng riêng)

Cần **tài khoản Apple Developer Program**, 99 USD/năm.
- **Đăng ký theo doanh nghiệp** (Công ty TNHH xây lắp Trường An): cần **mã D-U-N-S** (miễn phí, thường
  1–2 tuần). Trên App Store sẽ hiện tên công ty.
- **Đăng ký cá nhân**: nhanh hơn, nhưng hiện tên anh.

Có tài khoản rồi thì làm như sau:
1. Tôi dựng bản cài trên máy chủ Expo (EAS Build) và gửi lên App Store Connect.
2. Anh cài app **TestFlight** trên iPhone, rồi bấm vào lời mời.
3. App có biểu tượng riêng. Mời được tối đa 100 người trong công ty.

## Chặng 3 — Lên App Store / Google Play

- **App Store công khai.** Apple duyệt mất 1–3 ngày.
  - Cần: trang chính sách quyền riêng tư (app không thu thập dữ liệu), ảnh màn hình và mô tả.
  - Rủi ro thật:
    - Apple hay từ chối app "chỉ bọc trang web" (mục 4.2). App mình có chức năng riêng (chấm điểm, theo
      dõi, nhắc hạn) nhưng vẫn có thể bị hỏi.
    - App phải ghi rõ **không phải sản phẩm của e-GP hay Bộ Tài chính**.
  - Nếu chỉ dùng trong công ty, dùng TestFlight (Chặng 2) là đủ và nhẹ nhàng hơn.
- **Android (Google Play).**
  - Phí đăng ký 25 USD, trả một lần.
  - Theo quy định tôi biết (có thể đã đổi), tài khoản **cá nhân** mới phải chạy thử kín với khoảng 12 người
    trong 14 ngày trước khi lên Play công khai. Tài khoản **tổ chức** không bị yêu cầu này.
  - Cách khác: tôi dựng tệp cài **.apk** để cài thẳng cho máy Android trong công ty, không qua Play.

## Giới hạn của bản 1.0.0

- **Tra cứu chạy khi app đang mở.** iPhone không cho app tự chạy theo giờ như máy tính. Vì vậy
  **Bộ săn tự động và tin nhắn Telegram vẫn do tiện ích Chrome trên máy tính đảm nhận.**
- **Chưa có trên app:** lọc xã/phường, kết quả lựa chọn nhà thầu, biên bản mở thầu, kế hoạch LCNT.
  Những việc này vẫn làm trên tiện ích.
- **Dữ liệu chỉ lưu trên điện thoại:** tiêu chí, kết quả và gói theo dõi không gửi về máy chủ nào.
- **Khi e-GP đổi giao diện**, app và tiện ích cùng cần cập nhật lõi. Một lần sửa áp dụng cho cả hai.
