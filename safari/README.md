# safari/ — Giáo Sư Cùi Bắp chạy thẳng trên Safari (iPad / iPhone)

Thư mục này biến tiện ích Chrome trong `GiaoSuCuiBap/` thành **một tệp JavaScript** chạy ngay trong tab
muasamcong của Safari. Người dùng cài một dấu trang (bookmarklet); mỗi lần chạm, dấu trang tải
`safari/dist/cuibap.js` từ kho này rồi chạy nó trong trang đang mở. Hướng dẫn cho người dùng:
`HUONG-DAN-SAFARI-IPAD.md`. Thẩm định: `BAO-CAO-THAM-DINH-SAFARI.md`.

## Vì sao phải làm kiểu này

Lệnh tìm kiếm của e-GP cần mã reCAPTCHA do **chính trang e-GP** sinh ra (thiếu mã → HTTP 400). Vì vậy mã đọc
e-GP phải chạy **bên trong trang e-GP**. Trên iPad chỉ có ba cách đưa mã vào đó: dấu trang (dùng được ngay,
không tốn gì), tiện ích Safari (cần tài khoản Apple Developer + máy Mac), app riêng. Bản này là cách thứ nhất.

## Kiến trúc

```
tab Safari: trang muasamcong (cấp cao nhất)
 └─ lớp vỏ (safari/src, chạy trong trang)
     ├─ khung NỀN        background.js của tiện ích, nguyên văn, với chrome.* mô phỏng
     ├─ khung GIAO DIỆN  23 trang của tiện ích (search.html, plans.html…), nguyên văn
     └─ khung e-GP ("tab ảo")  trang tra cứu / trang chi tiết THẬT của muasamcong,
                               có page-hook.js + content.js nguyên văn — như tab nền của Chrome
```

| Tệp | Việc |
|---|---|
| `src/00-core.js` | Hằng số, nhật ký chẩn đoán, phân loại địa chỉ (e-GP / trang tiện ích), `openableFrame`. |
| `src/10-assets.js` | Tệp của tiện ích → blob URL, import map, HTML của từng trang. |
| `src/20-storage.js` | `chrome.storage.local` trên IndexedDB (`gscb-safari`: ngăn `local`, `meta`, `goi`). |
| `src/30-chrome.js` | `chrome.*` cho từng khung, định tuyến tin nhắn, báo thức, tải tệp, `fetch` đã chỉnh. |
| `src/40-egp.js` | Tab e-GP ảo: nạp chủ động, tiêm content script, bắt chuyển trang, chế độ hạn chế. |
| `src/50-ui.js` | Lớp phủ: thanh trên cùng, khung giao diện, thông báo, chuông, bảng chẩn đoán. |
| `src/90-main.js` | Khởi động, chọn chế độ, chốt một-tab, chốt chuyển trang của trang chính. |
| `build.mjs` | Gói tất cả thành `dist/cuibap.js`; sinh mã dấu trang `dist/dau-trang.txt`. |

### "Nạp chủ động" một trang e-GP vào khung

1. `fetch()` lấy HTML (cùng nguồn, kèm cookie).
2. Tạo khung, cho nó đi tới `about:blank?gscb` (một trang about:blank **thật**), rồi `document.open()` và
   `history.replaceState()` cho đúng địa chỉ trang.
3. Cài `page-hook.js` + `content.js` **trước** khi viết HTML — đúng thời điểm `document_start`.
4. `document.write(HTML)`: trang e-GP tự tải script, tự sinh reCAPTCHA, tự phát yêu cầu tìm kiếm.

Cách này không phụ thuộc `X-Frame-Options` (tiêu đề đó chỉ chặn khung tải qua mạng).

**Bước 2 là chỗ dễ sai nhất.** Đo trên WebKit 2.52: khung trắng *ban đầu* của trình duyệt bị tắt Navigation API
(`navigation.entries()` rỗng, `navigate` không bắn) kể cả sau `document.open()`. Qua `about:blank?gscb` thì
`navigate` bắn và huỷ được, `baseURI` và cookie đúng. `srcdoc` cũng bắn `navigate` nhưng giữ `baseURI` của trang
cha — không dùng.

### Khi trang e-GP tự chuyển trang

- Có Navigation API (Safari 26.2+): `preventDefault()`, đọc **đúng** địa chỉ đích, nạp chủ động địa chỉ đó.
  Máy chủ trả tệp chứ không phải trang → lưu tệp, giữ trang cũ.
- Không có: để khung tự chuyển rồi tiêm lại mã; nếu e-GP cấm nhúng khung thì nạp chủ động địa chỉ **suy đoán**
  (`render=search` → `render=index`) và ghi vào chẩn đoán. Địa chỉ suy đoán này **chưa được đối chiếu với e-GP
  thật**.
- Không dựng nổi trang tra cứu trong 30 giây → **chế độ hạn chế**: dùng chính trang cấp cao nhất làm tab danh
  sách (cách bản bookmarklet cũ của tác giả vẫn làm).

## Dựng, phát hành và kiểm thử

```
node safari/build.mjs              # xem tình trạng: bản ổn định trong kho và bản dựng từ mã nguồn hiện tại
node safari/build.mjs --check      # CI: safari/dist còn nguyên vẹn (mã băm, số byte, mã dấu trang)
node safari/build.mjs --phat-hanh  # ĐƯA mã nguồn hiện tại lên kênh ổn định (ghi safari/dist)
node safari/build.mjs --out <thư mục>   # dựng ra chỗ khác để thử
node --test tests/safari-ban-dung.test.mjs
node --test tests/safari-toi-thieu-422.test.mjs   # không dùng hàm / CSS chỉ có ở Safari mới hơn 16.4
node tools/test/cu-phap-safari.mjs      # mọi tệp được gói đọc được ở mức cú pháp Safari 16.4 (cần npm ci trong mobile-app)
xvfb-run -a node tools/test/safari-app.mjs [--nhanh] [--chi 2,14]   # WebKit thật, cần webkit2gtk-driver
```

**Kênh phát hành (từ 4.22.0).** `safari/dist/cuibap.js` là bản ỔN ĐỊNH — thứ dấu trang của người dùng tải về.
Mã nguồn được phép đi trước; chỉ `--phat-hanh` mới đổi tệp đó, và chỉ chạy sau khi toàn bộ kiểm thử đạt. Ghi
chú hiện trong hộp "Có bản mới" nằm ở `safari/ghi-chu-phat-hanh.txt` (tối đa 8 dòng).

Tệp mới nhất luôn chạy trước và quyết định bản nào được dùng (`src/80-phat-hanh.js`): khác bản đang dùng thì
hỏi; "Để sau" thì trao quyền cho bản đang dùng cất trong IndexedDB (ngăn `goi`: `js` = mới nhất, `dung` = đang
dùng, `truoc` = bản trước); lần mở dở dang thì hỏi thử lại hay dùng bản kia. Bản được trao quyền không cần
biết cơ chế này — kể cả 4.21.0 (mẫu thử: `tools/test/fixtures/cuibap-4.21.0-5663e848c26b.js.gz`).

**Mức Safari tối thiểu là 16.4.** Bộ thử WebKit dùng nhân đời mới nên không bắt được cú pháp hay hàm mà máy đời
cũ chưa có — và một dòng cú pháp lạ là cả tệp dấu trang không chạy. Hai chốt chặn: `cu-phap-safari.mjs` (phân
tích bằng acorn ở ES2023, chạy trên CI) và `safari-toi-thieu-422.test.mjs` (danh sách cấm). Cần dùng một hàm mới
thì kiểm tra có/không trước khi gọi rồi ghi vào `DA_KIEM_TRUOC` của bài kiểm; không nới danh sách cấm.

`tools/test/safari-app.mjs` chạy **đúng mã dấu trang** trong WebKit (cỡ iPad 1024×1366 và iPhone 390×844), luôn
dựng từ MÃ NGUỒN chứ không dùng `safari/dist`. Proxy `tools/test/map-proxy.mjs` ánh xạ `muasamcong.*`,
`raw.githubusercontent.com`, `api.telegram.org` về máy chủ giả lập và **từ chối mọi tên miền khác**. Kịch bản 1
đối chiếu từng mã TBMT với tiện ích Chrome thật; 15: thao tác lùi; 16: nâng cấp từ bản 4.21.0; 17: tuỳ chọn;
18: màn cảm ứng; 19: các tính năng 4.22.0.

## Lớp vỏ cho màn cảm ứng (4.22.0)

- **Cờ cho trang**: lớp vỏ đặt `__GSCB_TOUCH__`, `__GSCB_PLATFORM__ = 'safari'` trước khi trang chạy;
  `lib/device.js` của tiện ích đọc hai cờ này và gắn `data-touch` / `data-platform` lên `<html>`. Mọi kiểu cho
  ngón tay trong `theme.css` nằm sau `html[data-touch]`.
- **Thao tác lùi**: khung dùng `location.replace` (không thêm mục lịch sử); lớp vỏ giữ một mục "bẫy" và biến
  `popstate` thành "về màn hình trước" (`50-ui.js`).
- **Cỡ hiển thị**: `zoom` đặt trên `<html>` CỦA TRANG (đặt trên thẻ `<iframe>` không phóng được trong WebKit).
- **Giao diện tối**: bộ lọc `invert(1) hue-rotate(180deg)` trên thẻ `<iframe>` + bảng màu tối tính ngược qua ma
  trận bộ lọc (`SAFARI_DARK_TOKENS`); ảnh, thanh trái, băng đầu trang được đảo lại (`SAFARI_KEEP`); bề mặt
  viết cứng màu trắng lấy màu thẻ (`SAFARI_DARK_SURFACES`).
- **In / Lưu PDF**: trang gọi `__GSCB_PRINT__(html)` (xem `lib/print.js`); lớp vỏ mở bản chụp ở tab mới ngay
  trong cú chạm (`openReport`).
- **Ẩn và đổi chữ**: mục cần Windows/Chrome bị ẩn (`SAFARI_HIDE`); câu chữ viết cho Chrome được đổi lúc hiển thị
  (`SAFARI_WORDS`).
- Tuỳ chọn thử nghiệm qua `window.__GSCB_OPTS__`: `touch`, `zoom`, `theme`, `noBackTrap`, `noRelease`, `noReload`,
  `release`.

## Quy tắc khi sửa

- **Không sửa `content.js`, `page-hook.js` cho riêng Safari.** Bộ dựng gói hai tệp đó nguyên văn và có bài
  kiểm chặn. Khác biệt của Safari xử lý ở lớp vỏ.
- **Mã dấu trang**: một dòng, chỉ ASCII, không có `%`, `#`, `"`. Người dùng không cài lại dấu trang khi cập
  nhật, nên mọi thứ thay đổi được phải nằm trong `cuibap.js`, không nằm trong dấu trang. Tên kho IndexedDB,
  ngăn `goi`, khoá `js` là "hợp đồng" giữa dấu trang và `20-storage.js`.
- **`safari/dist` nằm trong git** (ngoại lệ trong `.gitignore`) vì dấu trang tải thẳng từ
  `raw.githubusercontent.com`. Nhánh thử trước là nhánh phát triển, không có thì `main` (`REFS` trong
  `build.mjs`).
- Thêm một `chrome.*` mới vào tiện ích → thêm vào `makeChrome` (30-chrome.js); bài WebKit quét mã nguồn và báo
  hàm nào thiếu.
- Bộ dựng đưa mọi ký tự xuống dòng về LF, để dựng trên Windows và Linux ra cùng một tệp.

## Giới hạn đã biết

Không chạy nền; phải chạm dấu trang sau mỗi lần tải trang; không có native messaging (Tải E-HSMT, Link điện
thoại); thông báo là chuông trong trang; dữ liệu nằm cùng nguồn với trang e-GP; Safari có thể dọn dữ liệu của
trang lâu không mở (đã có sao lưu tự động lên Telegram). Người dùng xác nhận 4.21.0 chạy trên iPad thật
(11/11/2026) nhưng chưa có bảng Chẩn đoán; các phần của 4.22.0 chưa được kiểm trên thiết bị thật.
