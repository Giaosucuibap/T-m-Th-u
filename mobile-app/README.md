# Giáo Sư Cùi Bắp — app di động (iPhone/Android)

Tìm gói thầu trên e-GP ngay trên điện thoại, chấm điểm phù hợp và nhắc hạn nộp hồ sơ.
Expo SDK 58 · React Native 0.88 · Expo Router. Người dùng: xem `../HUONG-DAN-APP-IPHONE.md`.

## Kiến trúc

```
src/app/                 màn hình (Expo Router): Tìm gói, Theo dõi, Thông tin, goi/[key] (chi tiết)
src/egp/EgpProvider.js   khung trình duyệt (WebView) mở trang Tra cứu LCNT của e-GP, nằm sau giao diện
src/egp/inject.js        mã tiêm: lớp đệm chrome.runtime ↔ WebView + page-hook.js + content.js (nguyên văn)
src/egp/injected.generated.js   SINH TỰ ĐỘNG từ tiện ích — không sửa tay
src/core/egp/*.js        CHÉP NGUYÊN VĂN từ GiaoSuCuiBap/lib — không sửa tay
src/core/search.js       bộ điều phối (thay vai trò background.js): PROBE → START → RESULTS(ack) → DONE
src/core/page-channel.js kênh nhắn tin app ↔ trang (dữ liệu từ trang luôn coi là không tin cậy)
src/core/store.js        lưu trên máy (AsyncStorage); reminders.js nhắc hạn (thông báo cục bộ)
src/egp/EgpProvider.web.js, sample-data.js   bản web CHỈ để xem trước giao diện, dữ liệu mẫu
```

Luồng một lượt tra: app kiểm tiêu chí bằng `validateCriteria` → quy tên tỉnh ra mọi mã cùng tên
(`codesForProvinceName`, Lâm Đồng = 68 + 703) → `buildTbmtQueries` → giao `KQLCNT_START` cho trang →
content.js bấm "Tìm kiếm" của e-GP, page-hook.js gắn truy vấn vào chính yêu cầu của trang → từng trang kết
quả về app (app xác nhận `{ok:true}`, chống đếm trùng) → `normalizeCandidate`, `scoreTender`,
`passesHardFilter`, `coverageOf` → danh sách + độ phủ trung thực ("CHƯA XÁC NHẬN LẤY ĐỦ" khi thiếu).

## Lệnh

```bash
npm install                     # một lần
npm run sync-core               # chép lại lõi sau khi sửa tiện ích
npm test                        # 29 bài đơn vị (không cần cài gì, chỉ cần Node 22)
npm run test:browser            # 7 kịch bản cầu nối: Chromium + e-GP giả lập (cần Playwright ở thư mục gốc
                                # và chứng chỉ tools/test/certs — xem .github/workflows/kiem-thu.yml)
npx expo start                  # chạy thử: quét mã QR bằng app Expo Go trên iPhone (cùng mạng Wi-Fi)
npx expo export --platform ios  # đóng gói thử (kiểm tra biên dịch)
```

Phát hành: `npx eas-cli@latest build -p ios` (cần tài khoản Apple Developer) → `npx eas-cli@latest submit -p ios`
→ TestFlight → App Store. Android: `build -p android` → Google Play.

## Giới hạn đã biết (bản 1.0.0)

- Tra cứu chạy khi app mở trên màn hình; iOS không cho chạy nền theo giờ. Bộ săn + Telegram vẫn ở tiện ích.
- Chưa có: lọc xã/phường (cần danh mục địa bàn e-GP), KQLCNT, biên bản mở thầu, kế hoạch LCNT.
- Trang e-GP được ép bố cục máy tính (viewport 1280) vì content.js được viết cho giao diện máy tính.
- **Chưa kiểm trên iPhone thật và e-GP thật**: WebView của iPhone (WebKit) khác Chromium; tường lửa e-GP
  có thể đối xử khác với trình duyệt nhúng. Phải chạy thử trên máy thật trước khi phát hành.
