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

## Dựng và kiểm thử

```
node safari/build.mjs            # dựng safari/dist (bắt buộc sau MỌI thay đổi trong GiaoSuCuiBap/ hoặc safari/src/)
node safari/build.mjs --check    # CI: dist phải khớp mã nguồn
node --test tests/safari-ban-dung.test.mjs
xvfb-run -a node tools/test/safari-app.mjs [--nhanh] [--chi 2,14]   # WebKit thật, cần webkit2gtk-driver
```

`tools/test/safari-app.mjs` chạy **đúng mã dấu trang** trong WebKit (cỡ iPad 1024×1366 và iPhone 390×844).
Proxy `tools/test/map-proxy.mjs` ánh xạ `muasamcong.*`, `raw.githubusercontent.com`, `api.telegram.org` về máy
chủ giả lập và **từ chối mọi tên miền khác**. Kịch bản 1 đối chiếu từng mã TBMT với tiện ích Chrome thật.

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
trang lâu không mở. Chưa chạy trên iPad thật và muasamcong thật.
