# Nhật ký thay đổi

Tài liệu này ghi lại các thay đổi quan trọng của Giáo Sư Cùi Bắp. Cấu trúc tham khảo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) và phiên bản tuân theo cách đánh số ngữ nghĩa ở mức sản phẩm.

## [4.22.0] — 2026-11-11

**Bản Safari thành phần mềm của iPad thật sự, và tám tính năng mới không cần máy chủ.** Làm theo bản thẩm định
ngày 11/11/2026 (9 nhược điểm, 10 tính năng đề xuất). Hướng dẫn: `HUONG-DAN-4.22.0.md`. Thẩm định lại sau khi
làm: `BAO-CAO-THAM-DINH-SAFARI.md`, mục "Thẩm định lại sau 4.22.0".

**Kênh ổn định của bản Safari:** 4.22.0 · bản dựng `081028c6ffac` (3.111.915 byte, SHA-256 `ebd91d78…0b9d` — đủ
trong `safari/dist/phien-ban.json`), đưa lên ngày 11/11/2026 sau khi mọi phép kiểm tại chỗ và CI đạt. Dấu trang đã
cài không đổi; máy đang dùng 4.21.0 được hỏi trước khi cập nhật.

### Sửa lỗi
- **Thao tác lùi của Safari làm trắng màn hình.** Mỗi lần đổi màn hình, lớp vỏ thêm một mục vào lịch sử của tab
  (27 lần đổi: 4 → 31 mục); lùi một bước thì khung giao diện về `about:blank`. Nay khung dùng
  `location.replace`, và thao tác lùi được bắt thành "về màn hình trước của Cùi Bắp".
- **Link điện thoại (Chrome trên máy tính): lỗi ghép địa chỉ cố định hiện rồi tự mất.** Trang tự làm mới 2 giây
  một lần và nhịp làm mới ghi đè dòng "Mã ghép nối không đúng" (đo: hiện 1,78 giây; có lượt mất gần như ngay).
  Lỗi có từ 4.21.0, bộ kiểm thử trên GitHub bắt được. Nay dòng báo lỗi giữ tới lần bấm "Ghép nối" kế tiếp; các
  dòng trạng thái chỉ ghi lại khi nội dung đổi (trình đọc màn hình không bị đọc lặp).
- **Trang Đối thủ: lời báo đi trước danh sách.** Sau "Kiểm tra ngay trên e-GP", dòng "7 gói mới" hiện trước còn
  danh sách "Động thái mới" tới sau một lượt hỏi tiện ích; trên máy chậm có lúc thấy lời báo mà chưa thấy gói
  (CI đỏ 1/2 lượt). Nay vẽ danh sách xong mới hiện lời báo, cùng một nhịp.

### Bản Safari
- **Phát hành an toàn**: `safari/dist/cuibap.js` là bản ỔN ĐỊNH, chỉ đổi bằng `node safari/build.mjs
  --phat-hanh`. Có bản mới thì **hỏi trước**; "Để sau" 3 ngày; quay về bản trước và ghim; lần mở dở dang thì
  hỏi thử lại hay dùng bản kia; tuỳ chọn tự cập nhật.
- **Màn cảm ứng**: mọi chỗ bấm từ 44 px; thẻ gói thu gọn (iPad 521 → 360 px, iPhone 842 → 470 px), 20 gói một
  trang, nút "Chi tiết"; giờ đóng thầu ghi trên thẻ; chú thích rê chuột thành chạm để mở. Mọi kiểu nằm sau
  `html[data-touch]` nên giao diện máy tính không đổi.
- **Tuỳ chọn**: cỡ hiển thị A−/A+ (90–145%), giao diện tối (đảo màu trên khung + bảng màu tối tính ngược), giữ
  máy thức (Wake Lock), phiên bản.
- Ẩn mục chỉ dùng được trên máy tính (Link điện thoại, cầu nối Windows, nút E-HSMT), đổi câu chữ viết cho
  Chrome, bỏ gợi ý phím tắt.
- Thẻ Kho gói và thẻ Kế hoạch dùng bộ biểu tượng nét thay emoji (emoji đổi màu lạ khi bật giao diện tối).

### Tính năng mới (Chrome và Safari)
- **Tìm bằng câu thường** (`lib/nl-query.js`): câu nói → từ khoá, giá, tỉnh, loại gói, chủ đầu tư, hạn đóng
  thầu. Làm bằng luật, không AI; chỉ điền tiêu chí, người dùng bấm mới tìm.
- **Sao lưu tự động lên Telegram** (`lib/telegram-backup.js`, `lib/runtime-backup.js`): mỗi ngày một tệp an
  toàn (không token); dữ liệu không đổi thì không gửi; nhập lại được cả `.json` và `.json.gz`.
- **Theo dõi đối thủ** (`lib/rival-watch.js`, `lib/runtime-rivals.js`): danh sách mã số thuế; báo gói mới dự /
  mới trúng; tra e-GP có hạn mức (mỗi đối thủ một lần/ngày, mỗi lượt 5), dừng khi bận, khi khoá, khi e-GP đổi
  cấu trúc.
- **Gói lặp lại hằng năm** (`lib/recurring.js`, `forecast.html`): cùng chủ đầu tư, tên chỉ khác năm; kỳ dự kiến
  suy từ các năm trước.
- **Hồ sơ quyết định** (`brief.html`): thông tin gói; **cạnh tranh theo lịch sử** (`lib/competition.js` — dưới 5
  mẫu không đưa trung vị, không gọi là xác suất); **đọc E-HSMT bằng AI qua cầu nối không cần khoá API**
  (`lib/hsmt-ai.js`: soạn câu lệnh, đọc câu trả lời JSON, bảng đối chiếu với năng lực công ty kèm câu trích).
- **In / Lưu PDF** (`lib/print.js`): Chrome mở hộp thoại in; bản Safari mở bản chụp đứng riêng ở tab mới.
- **Nhóm chat của phòng**: tin nghiệp vụ gửi thêm vào một nhóm Telegram; tin riêng tư thì không.
- **Năng lực công ty** thêm mã số thuế, doanh thu bình quân, nguồn lực tài chính.

### Chưa làm (thiếu điều kiện, ghi rõ trong hướng dẫn)
AI gọi thẳng trong phần mềm (cần khoá API trả phí); email tự động, nhiều tài khoản, app màn hình chính có đồng
bộ (cần máy chủ / token Cloudflare); chạy nền và thông báo của iPad (cần tiện ích Safari chính thức: máy Mac +
tài khoản Apple Developer); báo hợp đồng sắp hết hạn (không có dữ liệu thời hạn).

### Kiểm thử
- `npm test`: 951 bài đạt, 12 bài chỉ chạy trên Windows (thêm 9 tệp `*-422.test.mjs`).
- **Chốt mức Safari tối thiểu (16.4)**: `tools/test/cu-phap-safari.mjs` (CI) phân tích mọi tệp JS được gói, tệp
  gói và bản ổn định ở mức ES2023; `tests/safari-toi-thieu-422.test.mjs` cấm hàm và tính năng CSS chỉ có ở
  Safari mới hơn. Soát tĩnh — không thay được việc chạy trên máy 16.4 thật.
- `tests/link-dien-thoai-422.test.mjs` chạy đúng `phone.js` trong trang giả: gõ sai mã ghép nối, năm nhịp làm
  mới, dòng báo lỗi còn nguyên. `tools/test/phone-relay.mjs` 9/9, `phone-link.mjs` 7/7.
- Chạy cả 19 kịch bản Safari ở chế độ "mọi lượt đọc chậm thêm 0,35 giây" (tìm lỗi thứ tự hiển thị): 80/80; năm
  kịch bản mới nhất với mọi lệnh chậm thêm 0,25 giây: 39/39.
- `tools/test/ui-shots.mjs`: lỗi "Target crashed" lúc nạp dữ liệu là trình duyệt thử nghiệm tự sập ở một tab
  e-GP giả lập (SEGV; 8/24 vòng với 4.22.0, 5/24 với 4.21.0), không phải trang của tiện ích. Kịch bản bỏ qua
  đúng lỗi đó, đếm và ghi vào `bao-cao.json`; trang đang chụp mà sập thì vẫn hỏng như thường.
- `tools/test/safari-app.mjs`: 19 kịch bản, 80 phép kiểm trong WebKit 2.52.6 ở cỡ iPad và iPhone, e-GP giả
  lập — thêm: thao tác lùi; nâng cấp từ đúng bản 4.21.0 đã phát hành trước đó; tuỳ chọn; màn cảm ứng; các tính năng
  mới (kể cả gửi tệp sao lưu rồi nhập lại chính tệp đó, và nội dung bản in).
- Chưa kiểm được trên iPad thật và muasamcong thật: xem mục F của hướng dẫn.

## [4.21.0 · bản Safari] — 2026-11-10

**Giáo Sư Cùi Bắp chạy thẳng trên Safari của iPad / iPhone — không cần máy tính, không quét mã, không cài app.**
Tiện ích Chrome không đổi (vẫn 4.21.0, không phải cài lại gì trên máy tính). Thêm thư mục `safari/`: một dấu
trang (bookmarklet) nạp toàn bộ tiện ích vào tab muasamcong đang mở. Hướng dẫn: `HUONG-DAN-SAFARI-IPAD.md`.
Thẩm định: `BAO-CAO-THAM-DINH-SAFARI.md`. Kỹ thuật: `safari/README.md`.

### Có gì
- **`safari/dist/cuibap.js`** — một tệp duy nhất gói nguyên văn tiện ích (118 mô-đun, 23 trang, phông, biểu
  tượng) cùng lớp mô phỏng `chrome.*`. Dấu trang tải tệp này từ kho GitHub rồi chạy trong trang muasamcong:
  - `background.js` chạy trong một khung ẩn; 23 trang giao diện chạy trong khung nhìn thấy;
  - trang tra cứu và trang chi tiết **thật** của e-GP được dựng trong khung ẩn ("tab ảo"), có `page-hook.js` và
    `content.js` **nguyên văn** — mọi yêu cầu vẫn do chính trang e-GP phát đi, kèm mã reCAPTCHA của nó.
- **Dấu trang** (`safari/dist/dau-trang.txt`): một dòng, chỉ ký tự ASCII. Luôn hỏi bản mới nhất; mất mạng tới
  GitHub thì chạy bản dự phòng đã cất trong IndexedDB; nhánh phát triển không còn thì lấy ở `main`.
- **Thanh trên cùng** của bản Safari: quay lại, trạng thái nối e-GP, **chuông thông báo** (thay thông báo của hệ
  điều hành), xem trang e-GP đang điều khiển, **Chẩn đoán** (có nút chép để gửi người bảo trì), Ẩn.
- **Ba tầng dự phòng** khi e-GP tự chuyển trang: bắt lệnh chuyển trang bằng Navigation API (Safari 26.2+) →
  bám theo khung tự chuyển (Safari cũ) → chế độ hạn chế dùng chính trang đang mở.
- Chốt: một tab chạy một lúc; trang muasamcong không tự chuyển trang được khi Cùi Bắp đang hiện; e-GP trả tệp
  thì lưu tệp; địa chỉ cũ `mpi` được đổi về tên miền của tab.

### Kiểm thử
- `tools/test/safari-app.mjs`: chạy **đúng mã dấu trang** trong WebKit (nhân Safari) cỡ iPad 1024×1366 và iPhone
  390×844 — 14 kịch bản, 41 phép kiểm. Số liệu tìm gói trùng **từng mã TBMT** với tiện ích Chrome thật.
- `tests/safari-ban-dung.test.mjs`: 24 bài — tệp dựng khớp mã nguồn, `content.js`/`page-hook.js` nguyên văn,
  mã dấu trang an toàn và chạy đúng trong 10 tình huống, hàm phân loại địa chỉ không nhận tên miền giả.
- CI: job Linux kiểm `safari/dist` khớp mã nguồn; job app chạy bài WebKit (bắt buộc có WebKit).

### Giới hạn — nói thẳng
- **Chưa chạy trên iPad thật và chưa chạy với trang muasamcong thật.** Mọi kết quả ở trên là với nhân Safari
  trên Linux và trang e-GP giả lập.
- Không có: Tải E-HSMT bằng một nút và Link điện thoại (cần cầu nối trên Windows); chạy nền khi đóng tab;
  thông báo đẩy của hệ điều hành.
- Phải chạm dấu trang sau mỗi lần tải lại trang. Dữ liệu nằm trong Safari, cùng nguồn với trang e-GP; Safari có
  thể dọn dữ liệu của trang lâu không mở.

## [4.21.0] — 2026-11-09

**App "Cùi Bắp" trên iPhone và iPad, địa chỉ cố định.** Biểu tượng trên màn hình chính, quét mã một lần cho
mỗi máy; máy tính công ty khởi động lại thì app tự tìm lại máy tính. Hướng dẫn: `HUONG-DAN-4.21.0.md`. Giao
thức: mục "Địa chỉ cố định" trong `native-agent/DIEN-THOAI-GIAO-THUC.md`. Triển khai: `relay/README.md`.

### Có gì
- **Địa chỉ cố định** `https://thau.<tên>.workers.dev`: một Cloudflare Worker (`relay/src/worker.js`) chạy
  trên tài khoản Cloudflare miễn phí của chủ phần mềm.
  - Phát giao diện iPhone/iPad, nên app mở được cả khi máy tính công ty đang tắt.
  - Giữ "con trỏ" tới đường hầm `….trycloudflare.com` hiện tại của máy tính, chuyển `/api/*` tới đúng đường
    hầm đó.
  - Máy tính hay Chrome khởi động lại thì đường hầm đổi; tiện ích tự đăng ký đường hầm mới, thử lại sau 1, 2,
    5, 10, 30 phút nếu lỗi. Điện thoại không phải quét lại mã.
- **Ghép nối một lần** ở **Hệ thống › Link điện thoại**, mục "Địa chỉ cố định — không phải quét lại mã":
  nhập địa chỉ và mã ghép nối 8 ký tự, bấm Ghép nối. Mã QR trên trang chuyển sang địa chỉ cố định. Có nút Bỏ
  ghép.
- **App trên màn hình chính** (ứng dụng web cài được):
  - Tab Thông tin có mục "Cài thành app trên màn hình chính", hướng dẫn từng bước cho iPhone và iPad. Khoá
    được gắn tạm vào địa chỉ trong lúc "Thêm vào MH chính", rồi gỡ ra.
  - Mục "Dán link kết nối" cho biểu tượng đã cài mà chưa có khoá.
  - `sw.js` giữ vỏ app và tệp tĩnh. Mất mạng vẫn mở được, xem được kết quả gần nhất và gói theo dõi. Lệnh
    `/api/` và `/_gscb/` không bao giờ lưu đệm.
- **iPad**: bố cục 2 cột (tiêu chí bên trái, danh sách bên phải) khi màn hình rộng từ 900 điểm; trang chi
  tiết và các tab căn giữa trên máy tính bảng. **iPhone**: tìm xong tự cuộn tới kết quả.
- Báo trạng thái rõ: máy tính tắt (kèm "lần cuối thấy máy tính" theo giờ Việt Nam), khoá đã cũ, máy tính
  chưa báo địa chỉ, mất mạng. Mở lại app từ nền thì tự kiểm lại kết nối.
- `relay/trien-khai.mjs`: dựng giao diện, tạo kho KV, đăng ký tên workers.dev, triển khai Worker, sinh mã
  ghép nối và in ra **một lần**.

### Sửa lỗi (thấy trên ảnh chụp iPhone thật với e-GP thật, bản 4.20.0)
- Thẻ kết quả hiện **"0 đ – 0 đ"** khi không nhập khoảng giá. Nguyên nhân: bản lưu lượt tra đổi ô giá trống
  thành chuỗi `"0"`. Nay giá chỉ hiện khi lớn hơn 0, sửa ở cả tiện ích lẫn app.
- Địa điểm lặp **"Tỉnh Lâm Đồng; Tỉnh Lâm Đồng"**: gộp trùng, giữ thứ tự.
- Tab Thông tin trên Safari luôn ghi **"bản 1.0.0"**, vì bản web không có `Constants.expoConfig` nên rơi về số
  dự phòng. Nay lấy từ một hằng số (`src/core/version.js`); bài kiểm thử chặn lệch với `app.json`.
- Trang Link điện thoại ghi "khoá … không gửi lên máy chủ nào", rồi "không gửi lên Cloudflare". Câu này **chưa
  đúng**: điện thoại gửi khoá kèm mỗi lệnh, đi ngang Cloudflare tới máy tính. Đã sửa câu chữ cho đúng.
- Đã ghép địa chỉ cố định mà trang vẫn hướng dẫn "link đổi khi khởi động lại" và "không cần Thêm vào MH chính".
  Nay hướng dẫn đổi theo chế độ, mục Telegram ghi rõ không cần nữa. Bài đầu-cuối kiểm cả hai chế độ.

### An toàn
- Mã ghép nối 8 ký tự (bảng chữ Crockford: chữ O và số 0 như nhau). Worker chỉ giữ SHA-256 của mã, dưới
  dạng bí mật. Sai 20 lần trong một giờ thì khoá ghép nối một giờ.
- Lúc ghép, tiện ích sinh cặp khoá ECDSA P-256. Khoá riêng nằm trong `chrome.storage.local`, không rời máy
  tính; trang Link điện thoại không bao giờ nhận khoá riêng.
- Đăng ký đường hầm phải có chữ ký ECDSA của máy tính đã ghép, đồng hồ lệch không quá ±15 phút, không nhận
  bản cũ hơn con trỏ hiện tại (chống phát lại). Chỉ nhận `https://<tên>.trycloudflare.com`, trừ
  `api.trycloudflare.com`.
- Con trỏ còn mang `keySig` = HMAC-SHA256 (khoá điện thoại, địa chỉ đường hầm, thời điểm), do máy tính ký.
  Điện thoại tự kiểm `keySig`, rồi gửi lệnh kèm `X-GSCB-Target`. Worker chỉ chuyển tiếp khi đích trùng con
  trỏ hiện tại, nên không thành máy chuyển tiếp mở. Kẻ sửa được kho KV cũng không lừa được điện thoại gửi
  lệnh tới máy lạ, vì không có khoá điện thoại để ký con trỏ.
- Nói thẳng: Worker chạy trên tài khoản của chủ phần mềm và thấy lệnh đi qua, gồm cả tiêu đề `X-GSCB-Key`.
  Ở 4.20.0, đường hầm trycloudflare cũng kết thúc TLS tại Cloudflare. Giữ kín mật khẩu tài khoản Cloudflare
  như giữ kín khoá.
- Trang tĩnh có CSP `script-src 'self'`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`. Thân lệnh tối đa
  64 KB.

### Kiểm thử
- `tests/relay-421.test.mjs`, 7 bài. Chạy chính mã Worker trong Node với kho KV giả:
  - trang tĩnh và CSP;
  - ghép nối: mã sai, khoá sau 20 lần;
  - đăng ký: chữ ký sai, đồng hồ lệch, phát lại, địa chỉ lạ;
  - chuyển tiếp chỉ tới đường hầm hiện tại; báo máy tính tắt;
  - **runtime thật của tiện ích** ghép và đăng ký qua Worker, điện thoại tự kiểm chữ ký;
  - nhận diện link trực tiếp và mất mạng.
- `tools/test/phone-relay.mjs`, đầu-cuối, 9/9. Chrome thật nạp tiện ích, native messaging thật khởi động cầu
  nối, Worker chạy giả lập trên https, e-GP giả lập:
  - ghép nối, từ chối mã sai;
  - điện thoại tra qua địa chỉ cố định (115 gói), chỉ nói chuyện với địa chỉ cố định;
  - máy tính "khởi động lại" sang đường hầm mới: điện thoại tự nối lại, không quét mã;
  - máy tính tắt rồi bật lại; đổi khoá thì khoá cũ hết hiệu lực;
  - **WebKit 2.52.6, nhân của Safari**, cỡ iPhone 390×844 và iPad Pro 1024×1366: tìm gói, tự cuộn tới kết
    quả trên iPhone, 2 cột trên iPad;
  - không trang nào ra e-GP thật.
- CI Linux chạy thêm bài đầu-cuối này, cài `webkit2gtk-driver`, lưu ảnh chụp iPhone/iPad.

### Giới hạn
- **Chưa chạy trên iPhone hay iPad thật qua địa chỉ cố định.** Phần link trực tiếp 4.20.0 đã chạy thật trên
  iPhone với e-GP thật (Lâm Đồng, xây lắp, 124 gói).
- Vỏ Safari thật (nút Chia sẻ, "Thêm vào MH chính", vuốt cuộn) không giả lập được.
- Cần tài khoản Cloudflare miễn phí và một lần triển khai. Gói miễn phí: 100.000 lượt gọi mỗi ngày.
- Máy tính công ty vẫn là máy tra e-GP. Tắt hẳn thì không tra mới được.
- Chưa có thông báo đẩy; gói mới vẫn báo qua Telegram. Chưa lên App Store.

## [4.20.0] — 2026-11-08

**Link điện thoại.** iPhone tra gói thầu bằng Safari, không cài gì: máy tính công ty (Chrome + tiện ích)
làm máy tra e-GP. Hướng dẫn: `HUONG-DAN-4.20.0.md`. Giao thức: `native-agent/DIEN-THOAI-GIAO-THUC.md`.

### Có gì
- Trang mới **Hệ thống › Link điện thoại**: bật/tắt, mã QR (quét bằng Camera iPhone), đổi khoá, và tuỳ
  chọn **gửi link mới qua Telegram** khi link đổi.
- Cầu nối mới `GiaoSuCuiBap.DienThoai.exe` (C# 5, .NET Framework có sẵn trong Windows, không thư viện ngoài):
  - Chrome khởi động tệp này qua native messaging `vn.giaosucuibap.dienthoai`.
  - Phục vụ giao diện iPhone và API ở `127.0.0.1`, cổng ngẫu nhiên; ra Internet qua **cloudflared**
    (đường hầm `https://….trycloudflare.com` của Cloudflare).
  - Tắt link hoặc tắt Chrome thì tệp thoát, cloudflared thoát theo. Kể cả khi tệp bị tắt ngang, job tự huỷ
    của Windows vẫn đóng cloudflared.
- Lệnh tìm từ điện thoại chạy **đúng luồng Tìm gói thầu** của tiện ích (`startTbmtSearch`):
  - cùng hàng đợi, cùng khoá chống chạy chồng;
  - bị chặn khi đang khoá chỉnh sửa hoặc khi e-GP đổi cấu trúc;
  - mỗi lúc một lượt điện thoại, tối đa 15 phút, bấm Dừng từ điện thoại được.
- Giao diện iPhone là bản web của `mobile-app` ở chế độ máy tính công ty (`EXPO_PUBLIC_GSCB_MODE=remote`):
  - Tìm gói, kết quả, chi tiết, theo dõi.
  - **Thêm vào Lịch iPhone**: tệp `.ics` có 3 lời nhắc, trước 72 giờ, 24 giờ và 3 giờ.
  - Mở lại link là thấy lượt tra gần nhất.
- Tệp cài một lần `native-agent/BAT-LINK-DIEN-THOAI.bat` (gỡ: `GO-LINK-DIEN-THOAI.bat`), không cần quyền
  Administrator. Tệp tự làm ba việc:
  - chép cầu nối và giao diện vào `%LOCALAPPDATA%\GiaoSuCuiBap\DienThoai`;
  - tải cloudflared **2026.10.7**, chỉ nhận đúng 55.390.512 byte và SHA-256 `2493dbc1…1343`, rồi in chữ ký
    số Cloudflare, Inc.;
  - đăng ký với Chrome (HKCU).

### An toàn
- Khoá ngẫu nhiên 192 bit, chỉ nằm sau dấu `#` của link, nên không gửi lên máy chủ nào.
- Mọi lệnh API đòi tiêu đề `X-GSCB-Key`, so khớp trong thời gian không đổi. API không mở CORS.
- Trang HTML có CSP `script-src 'self'` và `frame-ancestors 'none'`.
- Chặn đường dẫn `..`, `\`, `:`, `//`. Giới hạn phần đầu 16 KB, thân 64 KB.
- Tiêu chí từ điện thoại chỉ giữ 9 trường đã biết, mỗi trường tối đa 500 ký tự (lọc ở cả cầu nối lẫn tiện ích).
- Link qua Telegram chỉ gửi vào **chat riêng** (Chat ID số dương), tắt xem trước link. Gửi lỗi thì tự thử lại
  sau 10 phút, không thành tin rác mỗi phút.

### Kiểm thử
- `tests/dien-thoai-host-420.test.mjs`: 7 bài cho máy phục vụ, đóng vai Chrome (khung native messaging) và
  vai điện thoại (HTTP). Chạy trên .NET Framework thật ở CI Windows và dưới Mono ở CI Linux. Các bài kiểm:
  - từ chối mã tiện ích lạ, khoá sai dạng;
  - lọc tiêu chí, lượt chồng trả BUSY, tiến độ, kết quả, Dừng;
  - CSP, ứng dụng một trang, chặn leo thư mục;
  - tệp `.ics`, yêu cầu quá cỡ, thân chunked.
- `tests/phone-link-420.test.mjs`: 14 bài.
  - Phần thuần: khoá, link, lọc tiêu chí, kết quả gửi điện thoại, tin Telegram.
  - Runtime với cổng native và kho giả: tìm, chặn, PC_BUSY, quá giờ, đổi khoá, nối lại, Telegram đúng một lần.
  - Hợp đồng ba phía: mã tiện ích suy từ khoá manifest, tên cầu nối, tiêu đề khoá, danh sách tiêu chí C#.
  - Tệp cài: chỉ chữ ASCII, ghim cloudflared khớp tài liệu, `.bat` xuống dòng CRLF.
  - Trên Windows của CI: **cài thật** (tải cloudflared, kiểm mã băm và chữ ký số, HKCU, tệp kê khai, cài
    lại, từ chối tệp bị sửa, gỡ sạch).
- `tools/test/phone-link.mjs` (đầu-cuối, 7/7): Chrome thật nạp tiện ích, native messaging thật khởi động cầu
  nối, tiện ích tra e-GP giả lập, rồi trang điện thoại cỡ iPhone:
  - tìm ra 115 gói khớp;
  - Lịch `.ics`;
  - đổi khoá thì link cũ hết hiệu lực;
  - tắt link thì cầu nối dừng;
  - không trang nào ra e-GP thật.
  Bài đầu-cuối bắt được và đã sửa một lỗi thật: quét mã QR mới (chỉ khác phần `#k=`) thì Safari không tải
  lại trang, nên điện thoại vẫn giữ khoá cũ.
- `tools/test/phone-tunnel-live.mjs`, mạng thật trên CI Windows:
  - cloudflared mở đường hầm `trycloudflare.com`;
  - gọi từ Internet: có khoá và thiếu khoá, lệnh tìm đi vòng về qua đường hầm;
  - giết ngang cầu nối thì cloudflared chết theo.
  Bài này phụ thuộc dịch vụ miễn phí của Cloudflare nên không chặn CI.

### Giới hạn
- **Chưa chạy trên iPhone thật và e-GP thật.**
- TryCloudflare là dịch vụ thử nghiệm miễn phí, không cam kết thời gian hoạt động.
- Link đổi khi máy tính hoặc Chrome khởi động lại.
- Mạng chặn cổng 7844 của Cloudflare thì đường hầm không lên.

## [App di động 1.0.0 — thử nghiệm] — 2026-11-08

App iPhone/Android đầu tiên, thư mục `mobile-app/` (Expo SDK 58, React Native). Hướng dẫn: `HUONG-DAN-APP-IPHONE.md`.

### Có gì
- **Tìm gói thầu (TBMT)** theo tỉnh, loại gói, từ khoá, khoảng giá, chủ đầu tư (nhiều CĐT), bắt buộc/loại trừ.
- **Chi tiết gói**: điểm phù hợp kèm lý do, đối chiếu từng tiêu chí, mở trang e-GP, chia sẻ (Zalo…).
- **Theo dõi & nhắc hạn**: 3 lời nhắc hẹn sẵn trên điện thoại (còn 3 ngày / 24 giờ / 3 giờ), kêu cả khi app
  đóng; tra lại thấy gói gia hạn thì tự hẹn lại theo hạn mới.
- Lịch sử 10 lượt tra, dùng lại tiêu chí một chạm. Dữ liệu chỉ lưu trên điện thoại.

### Cách làm — không viết lại lõi
- App dùng **nguyên văn** các tệp đã kiểm thử của tiện ích: 13 tệp `lib/` (dựng truy vấn e-GP, chuẩn hoá,
  chấm điểm, lọc tiêu chí cứng, đối soát độ phủ) và `page-hook.js` + `content.js` (tiêm vào trang e-GP mở
  trong khung trình duyệt nhúng của app, qua một lớp đệm thay `chrome.runtime`). `scripts/sync-core.mjs`
  chép lại; bài kiểm thử chặn hai bên lệch nhau.
- Mọi yêu cầu tìm kiếm do chính trang e-GP phát đi; app không tự gọi máy chủ e-GP.

### Kiểm thử
- 29 bài đơn vị (giao thức, đối soát, đường hỏng, lưu trữ, nhắc hạn, định dạng giờ VN).
- 7 kịch bản cầu nối trên Chromium thật với e-GP giả lập (gồm chế độ "khó tính": mạng rớt 25%, trang tự
  tải danh sách, bỏ qua thao tác lúc bận; bấm Dừng giữa chừng; nhiều chủ đầu tư).
- Đóng gói thử cho iOS (Hermes) và web; chụp 7 màn hình cỡ iPhone, 0 lỗi console.
- **Chưa** chạy trên iPhone thật và **chưa** chạy với e-GP thật — xem `HUONG-DAN-APP-IPHONE.md`.
- `expo install --check`: mọi thư viện khớp SDK 58. `expo-doctor` 19/20 — mục còn lại cần mạng tới danh bạ
  thư viện React Native. Đã sửa lỗi cấu hình doctor bắt được: SDK 58 bỏ khóa `splash` cấp trên cùng → chuyển
  sang plugin `expo-splash-screen`.

### Bản thử cho iPhone qua Expo Go
- Quy trình GitHub `app-ban-thu.yml`: khi kho có bí mật `EXPO_TOKEN` (mã tài khoản Expo do chủ phần mềm tự
  thêm), mỗi lần mã app đổi sẽ kiểm thử, đăng bản thử (EAS Update, nhánh `thu-nghiem`, iOS) rồi in mã QR mở
  bằng Expo Go. Chưa có bí mật thì bỏ qua, không báo lỗi.
- `runtimeVersion` theo chính sách `sdkVersion` (= `exposdk:58.0.0`), vì Expo Go chỉ nạp bản cập nhật cùng SDK.

### Sửa an toàn cho bộ kiểm thử tiện ích
- 24 kịch bản `tools/test/*.mjs` dùng `--no-proxy-server` để chặn proxy. Trên máy có proxy hệ thống (đã
  gặp ở môi trường phát triển), Chromium bỏ qua cờ này cùng lệnh trỏ tên miền về e-GP giả lập — trang mở
  ra là **e-GP thật**. Đổi sang `--proxy-server=direct:// --proxy-bypass-list=*` (đã kiểm: trỏ tên miền
  hoạt động trở lại). Kịch bản cầu nối của app còn chặn cứng ở tầng trình duyệt: yêu cầu tới e-GP chỉ được
  phục vụ từ máy giả lập, mọi tên miền khác bị huỷ, và bài thử tự dừng nếu trang đầu tiên không phải bản
  giả lập.

## [4.19.0] — 2026-11-06

Khắc phục các điểm yếu nêu trong báo cáo thẩm định 4.18.0. Báo cáo mới: `BAO-CAO-THAM-DINH-4.19.0.md`.

### Trạm săn — chạy cả khi đóng Chrome, lượt lỡ giờ được chạy bù
- **Sửa lỗi thật:** trang Bộ săn ghi "máy tắt thì chạy bù khi mở lại", nhưng mỗi lần Chrome khởi động
  `ensureHuntAlarms()` xoá báo thức và đặt lại vào lần tới — lượt 06:05 lỡ khi máy tắt mất hẳn. Nay
  lượt lỡ giờ được chạy bù khoảng 2 phút sau khi Chrome chạy lại (mỗi bộ cách nhau 1 phút), không chạy
  bù cho giờ chưa từng hẹn (bộ săn mới tạo / vừa bật lại / vừa đổi giờ), không chạy trùng khi lượt đúng
  giờ đã chạy (`lib/station.js`, kiểm thử ở 4 múi giờ).
- Nhịp tim 30 phút ghi các khoảng máy/Chrome không chạy; Telegram báo "máy tắt từ … đến …, đang chạy bù
  bộ săn …" đúng một lần.
- Quyền `background` là **tuỳ chọn**: người dùng tự bật ở trang Bộ săn để Chrome chạy tiếp khi đóng cửa sổ.
- `native-agent/BAT-TRAM-SAN.bat` + `tram-san.ps1`: tác vụ Task Scheduler cho tài khoản đang dùng — mở
  Chrome chạy nền khi đăng nhập Windows và đánh thức máy (WakeToRun) trước giờ săn 3 phút. Đăng ký/gỡ thật
  trên Windows trong CI.

### Không để hỏng âm thầm (phụ thuộc giao diện e-GP)
- Bộ săn lỗi → Telegram ngay lần đầu; hồi phục → Telegram; không nhắn lặp.
- Dải cảnh báo trên các trang tra cứu khi tiện ích đã tự dừng vì e-GP đổi cấu trúc, hoặc bộ săn đang lỗi.
- **Chẩn đoán › Kiểm chứng toàn trình trên e-GP thật** (một chạm, chạy trên máy người dùng): Tìm gói →
  Kế hoạch (danh sách + trang chi tiết) → Mở thầu (đọc biên bản) → kiểm tra cấu trúc 25 mã; xuất tệp
  bằng chứng có SHA-256, không chứa tên gói/nhà thầu/giá. Chỉ ĐẠT khi dữ liệu về thật.

### Kho lịch sử biên bản mở thầu
- Phân tích › **Kho lịch sử**: nạp dần biên bản của các gói đã có kết quả — từng tháng của tỉnh + lĩnh
  vực, rồi toàn bộ lịch sử 4 năm của các chủ đầu tư đang theo dõi. Chạy ban đêm, tiếp tục được khi tắt
  máy, luôn nhường lượt tra cứu của người dùng, giờ bộ săn và giờ canary; chờ 2 giờ sau lượt soi biên bản
  của người dùng để không thay mất kết quả đang xem. Bảng độ phủ ghi rõ biên bản đọc đủ / thiếu / chưa đọc
  được và tháng chạm giới hạn 2.000 dòng của e-GP.

### Gói cài có lại cầu nối E-HSMT
- CI Windows biên dịch `NativeHost.cs`, chạy bộ kiểm thử trên đúng tệp đó, rồi giữ tệp (artifact + nhật ký
  base64 kèm SHA-256). `tools/release/lay-cau-noi-tu-ci.mjs` chỉ nhận tệp khớp mã băm, độ dài, chữ ký MZ.

### Kiến trúc
- `lib/runtime-telegram.js` (gửi tin, dò Chat ID, đẩy gói mới) tách khỏi `background.js`.
- `lib/message-registry.js` — mỗi lệnh đúng một chủ; `lib/handlers/` (tự động hoá 15 lệnh, điều hướng 13,
  tra cứu kho 4). `background.js` 4.394 → 4.120 dòng; khối switch 126 → 94 nhánh.

### Kiểm thử
- 836 bài đơn vị (825 đạt trên Linux, 11 chỉ chạy trên Windows), 4 múi giờ; CI Chromium thêm 3 kịch bản
  (trạm săn, nút kiểm chứng, kho lịch sử).
- Tự rà trước phát hành, đã sửa: lượt kiểm chứng lấy từ bộ nhớ đệm 2 phút không còn được tính là đã hỏi e-GP
  (chờ đệm hết hạn rồi hỏi lại); kho lịch sử tự tạm dừng khi người dùng bấm Dừng lượt của kho.

## [4.18.0] — 2026-11-06

### Giao diện mới — đo được, không cảm tính
Đo bằng `tools/test/ui-shots.mjs` trên 23 trang ở 1366×768 (có dữ liệu thật từ e-GP giả lập):

| Chỉ số | 4.17.3 | 4.18.0 |
|---|---|---|
| Khối chữ nhỏ hơn 12px | 57,9% (cửa sổ bật lên: cỡ giữa 9px) | 0% trên mọi trang tiện ích |
| Khối chữ không đạt tương phản WCAG 2.1 AA | 14,3% | 0,1% (6/5.738) |
| Kiểu khung trang | 2 (thanh trái / đầu trang tối) | 1 |
| Tràn ngang, ô vượt khung, lỗi trang | 0 | 0 |

- `theme.css` — hệ thống thiết kế nạp sau cùng trên mọi trang: bảng màu xanh ngọc đậm, 4 tầng chữ đều
  ≥ 4,5:1, thang cỡ chữ (chữ thân 15px), nút, ô nhập, bảng, thẻ gói, thông báo thống nhất.
- Phông **Be Vietnam Pro** đủ 400/500/600/700 (SIL OFL 1.1, tách bảng mã tiếng Việt / Latin / Latin mở rộng,
  woff2) thay 2 tệp TTF — gói nhẹ hơn 68 KB.
- Toàn bộ 320 khai báo cỡ chữ cũ được quy đổi theo một bảng duy nhất (7–8px→12, 9→12,5, 10→13, 11→13,5,
  12→14, 13→14,5, 14–20px +1); có bài kiểm thử chặn cỡ chữ dưới 12px quay lại.
- `shell.js`: **một khung cho mọi trang** — 13 trang đầu trang tối được tự chuyển vào khung có thanh trái.
  Điều hướng nhóm theo công việc (Tra cứu e-GP · Theo dõi · Phân tích thị trường · Năng lực công ty · Hệ thống);
  ba trang tra cứu e-GP trước đây nằm trong "Nâng cao" nay ở ngay đầu. Bỏ thanh 4 bước trùng lặp. Màn hình
  hẹp: thanh trái thành ngăn kéo.
- Cửa sổ bật lên: không còn bị chèn thanh 4 bước (bị bóp chữ) và dòng "Đến nội dung chính" lộ ra.
- Emoji trên nút, thẻ chuyển tab, tiêu đề → bộ biểu tượng SVG chung. Đoạn giải thích dài thu vào
  "Cách tra cứu và phạm vi dữ liệu".

### Kỹ năng mới — Tìm nhanh (Ctrl K)
- `lib/quick-find-core.js` + `lib/quick-find.js`: gõ mã TBMT/KHLCNT → khớp chính xác trong kho trên máy
  và lệnh tra mã đó trên e-GP; gõ chữ (không dấu) → gói trong kho có đủ mọi từ, gói còn hạn trước;
  gõ tên trang → chuyển trang. Nền: thông điệp `QUICK_FIND` chỉ đọc kho, trả ≤ 8 gói, không có trong
  danh sách thông điệp trang e-GP được gửi.
- `search.html?q=IB…&run=1` (từ Tìm nhanh): chỉ giữ đúng mã làm tiêu chí rồi tìm ngay.

### Tăng tốc — kết quả tức thì từ kho
- Bấm *Tìm gói thầu* với tiêu chí mới: trong lúc e-GP chưa trả trang nào, hiện ngay các gói đã lưu
  khớp tiêu chí — lọc bằng **đúng cổng tiêu chí** của lượt mới (`passesHardFilter`). Dải xanh ghi rõ là
  dữ liệu đã lưu, có thể cũ; **khoá Xuất Excel và Lịch đóng thầu** cho tới khi dữ liệu e-GP về.
- Đo trên Chromium, e-GP giả lập chậm (`tools/test/instant-results.mjs`, 3 lần mỗi bản):
  thẻ gói đầu tiên **8,26 giây → 0,22 giây** (trung vị; từng lần 8,25/8,28/8,26 và 0,22/0,22/0,20);
  thời gian e-GP trả đủ dữ liệu không đổi (16,6 giây so với 16,7 giây).

### Sửa lỗi
- *Mở thầu · Chờ kết quả*: ô "Số gói tối đa sẽ đọc" hiện **trống** khi mở lại lượt có số gói ngoài danh sách
  chọn (bộ săn, bản cũ, kịch bản), và lượt sau âm thầm dùng 150. Nay thêm đúng giá trị đó vào ô chọn.
- Thanh trái: nhóm tự mở vì chứa trang đang xem không còn bị ghi nhớ sang mọi trang khác.
- *Tìm gói thầu*: lượt **đang chạy** chưa có kết quả bị ô phạm vi gọi là "bản lưu cũ chưa lưu riêng giá"
  (có từ trước); trong lúc hiện danh sách tạm, dòng đếm và dòng chất lượng dữ liệu mô tả kho chứ không phải
  lượt đang tìm. Nay mỗi dòng ghi đúng nguồn của nó.

### Kiểm thử
- 16 bài mới (`tests/giao-dien-418.test.mjs`, `tests/tim-nhanh-418.test.mjs`) — đỏ toàn bộ trên 4.17.3.
- Kịch bản Chromium mới: `ui-shots.mjs` (chặn khi chữ < 12px hoặc tương phản kém vượt 1%),
  `instant-results.mjs`; CI chạy cả hai.

**Chưa xác nhận được:** chưa chạy trên e-GP thật (môi trường phát triển bị chặn truy cập).

## [4.17.3] — 2026-10-20

### Sửa lại cho đúng nguyên nhân thật — dựa trên bản tác giả 4.17.1 đã chạy trên e-GP thật
Người dùng gửi bản tác giả 4.17.1 (cùng ngày). page-hook của bản đó **chỉ nhận mảng
một phần tử** — y như 4.17.1 của nhánh này — mà vẫn đọc đủ 156/156 bản ghi trên
`muasamcong.mof.gov.vn` (theo báo cáo kèm bản đó). Vậy yêu cầu tìm kiếm CHÍNH của e-GP
mới **không đổi dạng**; chẩn đoán "e-GP đổi dạng yêu cầu" ở 4.17.2 không trúng nguyên nhân.
Khác biệt thật nằm ở hai chỗ:

- **Yêu cầu phụ của trang** (không mang `query`) bị tính là "e-GP đổi cấu trúc" và làm
  dừng cả lượt. Nay page-hook gắn nhãn `side`, content.js bỏ qua hoàn toàn — như bản tác giả.
- **Thời gian chờ quá ngắn** cho trang e-GP mới (luồng chính bận): chờ xác nhận giao tiêu
  chí ~2 → ~5 giây (bản tác giả: 5 giây); chờ trang phát yêu cầu sau thao tác 5 → 8 giây
  (bản tác giả: 20 giây cho một thao tác — nhánh này thao tác lại tối đa 4 lần).
- **Bỏ** việc gắn tiêu chí vào mảng NHIỀU truy vấn (thêm ở 4.17.2): đó thường là yêu cầu đếm
  của trang. Trên máy giả lập có yêu cầu đếm gộp, 4.17.2 hỏng "trang trả về không đúng thứ tự";
  4.17.3 đạt.
- Không còn dừng giữa chừng khi gặp yêu cầu có `query` mà không gắn được: thử đủ các cách thao
  tác, không lần nào được mới kết luận (vẫn kèm "dạng yêu cầu").
- Giữ các dạng phòng xa của 4.17.2 (đối tượng có `query`, JSON lồng, Blob/ArrayBuffer, phản hồi
  bọc `data`) — chúng không chạm yêu cầu phụ.
- Máy giả lập thêm `sidemulti` (yêu cầu đếm gộp) và `slowfire=N` (trang phát yêu cầu chậm);
  CI chạy 8 tổ hợp.

**Vẫn chưa xác nhận trên e-GP thật** từ môi trường này; bằng chứng trang thật là của bản tác giả
(tệp bằng chứng không có trong gói nhận được nên không đối chiếu được mã băm).

## [4.17.2] — 2026-10-20

### Sửa lỗi "e-GP đã gửi yêu cầu tìm kiếm theo một cấu trúc tiện ích không nhận ra"
Người dùng gặp ở "Gói đang chờ kết quả" (Tỉnh Lâm Đồng, 15 ngày) ngay sau khi e-GP
chuyển sang `muasamcong.mof.gov.vn`. Nguyên nhân: `page-hook.js` chỉ gắn được tiêu
chí vào **đúng một dạng** thân yêu cầu tìm kiếm — chuỗi JSON của mảng một phần tử —
và `content.js` dừng cả lượt ngay lần đầu thấy một yêu cầu khác dạng.

- `page-hook.js` nhận thêm: đối tượng không bọc mảng; mảng nhiều truy vấn (gắn vào
  tất cả, phản hồi dạng mảng lấy phần tử đầu); JSON mã hoá hai lần; thân **Blob /
  ArrayBuffer / Uint8Array** gửi bằng XHR hoặc fetch (bản cũ biến Blob thành `"{}"`);
  phản hồi bọc thêm lớp `{data:{page}}`. Dạng mới **bắt buộc** đã có sẵn `query`
  dạng mảng — yêu cầu phụ (đếm, gợi ý) không bị nhét tiêu chí, tránh đọc nhầm danh
  sách mặc định thành kết quả.
- `content.js`: một yêu cầu khác dạng (có thể là yêu cầu phụ của trang) không còn
  làm hỏng cả lượt — thử lại bằng thao tác khác; lặp lại lần thứ hai mới kết luận.
- Khi vẫn không gắn được, câu báo lỗi ghi **dạng yêu cầu** (chỉ tên trường và kiểu,
  không có giá trị), ví dụ `dạng yêu cầu: Blob → đối tượng {pageSize,query[1]}`,
  và nói rõ đây không phải kết quả rỗng — một ảnh chụp đủ để sửa đúng chỗ.
- Máy e-GP giả lập thêm chế độ `shape=obj|multi|double|blob|form`, `side`, `wrap`;
  CI chạy "Gói đang chờ kết quả" với 7 dạng. Bản 4.17.1 hỏng 6/7 (đúng câu lỗi
  người dùng gặp), bản 4.17.2 đạt 7/7.
- 12 bài kiểm thử mới (`tests/cau-truc-moi-4172.test.mjs`), đỏ 11/12 trên 4.17.1.

**Chưa xác nhận được:** chưa thấy tận mắt yêu cầu của trang e-GP mới (môi trường
phát triển bị chặn truy cập). Nếu e-GP dùng một dạng ngoài các dạng trên, lỗi sẽ
hiện kèm "dạng yêu cầu: …" để sửa trong một lần.

## [4.17.1] — 2026-10-19

### e-GP đổi địa chỉ sang Bộ Tài chính
Hệ thống mạng đấu thầu quốc gia chuyển từ `muasamcong.mpi.gov.vn` sang
**`muasamcong.mof.gov.vn`** (cùng phần mềm EGP_v2.0, cùng cấu trúc đường dẫn —
xác minh qua chỉ mục tìm kiếm công khai; môi trường phát triển không truy cập
trực tiếp được trang này).

- `lib/egp-host.js`: một nơi duy nhất giữ hai địa chỉ. Đường dẫn phần mềm **tự
  tạo** (mở trang tra cứu, trang chi tiết, danh mục địa bàn, tab mở sẵn) dùng
  địa chỉ **mới**; mọi chỗ **kiểm tra** nhận **cả hai** địa chỉ, nên tab đang mở
  ở địa chỉ cũ, kho gói đã lưu và dữ liệu tham chiếu cũ vẫn dùng được. Liên kết cũ
  khi đưa ra cho người dùng bấm được đổi sang địa chỉ mới. Không nhận tên miền
  giả/lồng (`…mof.gov.vn.evil.com`), http, cổng lạ.
- `manifest.json`: thêm đúng `https://muasamcong.mof.gov.vn/*` vào quyền và chỗ
  chạy tiện ích, cùng phạm vi như địa chỉ cũ. Không thêm quyền nào khác.
- Kịch bản thử trình duyệt chặn cả hai tên miền về máy giả lập; các kịch bản kiểm
  tra trực tiếp trên e-GP thật (`tests/live-*`…) chuyển sang địa chỉ mới.
- 8 bài kiểm thử mới (`tests/dia-chi-moi-4171.test.mjs`), đỏ 7/8 trên 4.17.0.

**Chưa xác nhận được:** chưa chạy trên trang `muasamcong.mof.gov.vn` thật. Nếu
địa chỉ mới đổi cả đường dẫn dịch vụ (`/o/egp-portal-contractor-selection-v2/…`),
kiểm tra cấu trúc e-GP ở Chẩn đoán sẽ báo ĐỎ và phần mềm tự dừng quét.

## [4.17.0] — 2026-10-08

Mười hạng mục nâng cấp theo kế hoạch sau 4.16.1. Mỗi hạng mục có bài kiểm thử
đỏ trên mã cũ / xanh trên mã mới, và — khi đo được — số đo trước/sau trên
Chromium thật với máy chủ e-GP giả lập. **Không chạm e-GP thật** khi kiểm thử.

### Nhanh hơn
1. **Tab e-GP mở sẵn** (`lib/runtime-query.js` · `prewarm`). Mở màn hình tra cứu
   là mở sẵn trang tra cứu e-GP ở tab nền; không gửi tiêu chí, không bấm gì, không
   bao giờ điều hướng tab của người dùng; chỉ một tab; chống Chrome cho tab ngủ.
   Tắt được ở Cấu hình. Đo (trang tải chậm 4 s, chờ nhập 6 s): lượt đầu
   **11,8 s → 5,9 s**, luôn đúng 1 tab e-GP. Mức lợi trên e-GP thật phụ thuộc thời
   gian tải trang thật — chưa đo được.
3. **Quét nhanh phần mới cho Bộ săn TBMT** (`lib/delta-scan.js`). Chỉ hỏi gói đăng
   từ lần trước (lùi 1 ngày). Người dùng chủ động bật. Vì bộ lọc ngày đăng **chưa
   được đo trên e-GP thật cho TBMT**: mỗi 24 giờ vẫn quét đầy đủ; e-GP bỏ qua bộ lọc
   hoặc lọc sai thì **tự tắt** và nói lý do; lượt nhanh trả 0 gói khi chưa kiểm
   chứng thì quét đầy đủ ngay. Đo: 1 trang thay vì 3; hai tình huống e-GP bỏ qua /
   lọc sai đều bị phát hiện.
4. **Hiện ngay kết quả lượt trước, nhãn Mới/Đổi** (`lib/run-baseline.js`). Tìm lại
   cùng tiêu chí: hiện ngay kết quả lượt trước (ghi rõ "có thể đã cũ") trong lúc
   chờ e-GP. Xong thì gắn "Mới" (chỉ khi cả hai lượt đã tải đủ) / "Đổi" (kèm trường
   đổi), so bằng ảnh chụp dữ liệu từng lượt.

### Ổn định và đo được
2. **Sổ giai đoạn + bảng "Độ ổn định tra cứu e-GP"** ở Chẩn đoán (`lib/run-trace.js`):
   tỉ lệ lỗi, trung vị/p95, hỏng ở giai đoạn nào, theo chức năng. Chỉ số và nhãn,
   không lưu tiêu chí hay dữ liệu gói.
5. **Tự chạy lại khi hỏng trước trang đầu** (`lib/run-retry.js`): rớt kết nối ở
   trang đầu → gửi lại có giãn cách (0,8 s, 1,6 s); vẫn hỏng trước khi có dữ liệu →
   tải lại trang e-GP, chạy lại đúng tiêu chí một lần. Không chạy lại khi đã có dữ
   liệu, sai cấu trúc, HTTP 4xx/429, người dùng dừng. Đo (e-GP cắt 6 yêu cầu đầu):
   4.16.1 **hỏng sau 0,7 s**; 4.17.0 **thành công 137/137 sau 9,5 s**.
6. **CI GitHub Actions** (`.github/workflows/kiem-thu.yml`): Linux (bộ kiểm thử, 4
   múi giờ, bản CRLF), Windows (biên dịch cầu nối E-HSMT từ mã nguồn, chạy cả các
   bài chỉ chạy được trên Windows — 0 bài bỏ qua), Chromium + e-GP giả lập khó tính
   (mọi kịch bản ở trên).
7. **Kiểm tra cấu trúc e-GP hằng đêm** (tùy chọn) và **nhắn Telegram khi chuyển
   ĐỎ / hồi phục** (`lib/live-canary.js`). Không nhắn lặp; "chưa xác định" không
   báo động.

### Hiểu thị trường
8. **Chỉ số minh bạch tham khảo** (`lib/transparency.js`): hình thức lựa chọn, qua
   mạng, thời gian mời thầu so với mốc tham chiếu, số nhà thầu dự, giảm giá. Trên
   thẻ gói, danh sách nhà thầu trúng thầu và Excel. Thiếu dữ liệu không bị trừ
   điểm. Không phải kết luận vi phạm. Mốc 18/9 ngày là mốc tham chiếu — người viết
   không chắc tuyệt đối điều kiện áp dụng, cần đối chiếu Luật Đấu thầu 2023.
9. **Soi quan hệ chủ đầu tư – nhà thầu** (`lib/relations.js`): ít cạnh tranh, chỉ
   1 nhà thầu, nhãn "Cần xem", đối tác liên danh thường xuyên. Tỉ trọng chỉ tính
   theo đúng phạm vi dữ liệu đã tải.
10. **Bản tin sáng qua Telegram** (`lib/morning-bulletin.js`): một tin mỗi ngày (mặc
    định 07:00 giờ VN, tắt sẵn): gói mới 24 giờ, gói theo dõi sắp đóng ≤3 ngày, tình
    trạng hệ thống. Kiểm đầu cuối với Telegram giả.

### Sửa lỗi phát hiện trong quá trình làm
- 8 kịch bản thử trình duyệt trong `tools/test` **không chặn tên miền e-GP** — với
  tab mở sẵn, chúng sẽ gọi e-GP thật. Đã chặn hết, có bài canh gác.
- Ô "Giờ" của lịch kiểm tra nhận 0–23 nhưng lõi âm thầm đổi giờ ngoài 0–4 thành
  2 giờ sáng. Nay ô chỉ nhận 0–4 và nói rõ.
- Bộ lọc tín hiệu từ trang e-GP làm rơi trường mới; "không đo được" bị ghi 0 ms;
  bản tin bị cắt nhiều tin do đường dẫn dài; lưu Cấu hình gửi bù trùng "Gửi thử";
  một bài kiểm thử phụ thuộc kiểu xuống dòng (đỏ trên Windows). Tất cả đã sửa kèm
  bài kiểm thử.

### Chưa làm được / cần biết
- **Cổng phát hành của tác giả** (`tools/check-live-evidence.py`) vẫn chặn vì bằng
  chứng kiểm tra trực tiếp trên e-GP thật là của mã nguồn cũ. Tôi không được chạy
  trên e-GP thật và **không làm giả** bằng chứng đó. Cần chạy `tests/live-*.mjs`
  trên máy có mạng tới e-GP trước khi coi là phát hành chính thức.
- Lợi ích tốc độ thật trên e-GP (tab mở sẵn, quét nhanh) chưa đo được trên e-GP thật.

## [4.16.1] — 2026-10-07

Nhận bản **4.16.0 của tác giả** làm nền (các bản 4.13–4.16 do tác giả phát hành
riêng; xem `BAO-CAO-SUA-LOI-4.16.0.md` và các tệp `HUONG-DAN-*`). Kho mã chuyển
sang đúng bố cục của tác giả: tiện ích nằm trong `GiaoSuCuiBap/`, kiểm thử và
công cụ ở ngoài.

### Sửa lỗi chập chờn "e-GP chưa trả dữ liệu cho lượt tra cứu"

Người dùng gặp ở màn hình *Gói đang chờ kết quả*, lúc được lúc mất. Nguyên nhân:
trang tra cứu e-GP tự tải danh sách mặc định khi mở; tiện ích đổi ô số bản ghi
đúng lúc trang còn bận, giao diện e-GP bỏ qua, không yêu cầu nào được gửi, tiện ích
chờ 25 giây rồi đổ lỗi cho e-GP.

Tái hiện trên máy chủ giả lập có chế độ "e-GP khó tính" (`MOCK_CHAOS`): bản gốc
0/6 (Gói đang chờ kết quả) và 0/4 (Tìm gói thầu), lượt nào cũng đúng câu lỗi.
Bản sửa 10/10, 8/8, 7/7 (Kế hoạch), và 24/24 khi thêm 20% kết nối bị cắt. Mọi
lượt đạt đều được tự kiểm là thật sự hỏi e-GP, không trúng bộ nhớ đệm.

- `page-hook.js` báo `EGP_SEARCH_ACTIVITY` (số yêu cầu e-GP đang bay, gồm cả yêu
  cầu e-GP tự phát), `KQLCNT_REQUEST_SENT` (yêu cầu mang tiêu chí đã rời trình
  duyệt) và `KQLCNT_REQUEST_REJECTED` (e-GP gửi yêu cầu dạng lạ, không gắn được
  tiêu chí).
- `content.js`: khởi động trang đầu và sang trang sau đều **bắt tay có xác nhận**
  — chờ trang rảnh, thao tác, thấy yêu cầu đi rồi mới tính hạn chờ phản hồi (45
  giây); bị bỏ qua thì làm lại (tối đa 4 lần, luân phiên ba cách).
- Rớt kết nối / hết hạn / 5xx ở một trang: tự đọc lại tối đa 3 lần, đi thẳng tới
  đúng trang đích theo trang e-GP đang mở (cách cũ "lùi rồi tiến" lệch trang khi
  chính bước lùi cũng rớt).
- Phản hồi XHR không còn bị khối `catch` rỗng nuốt khi đọc nội dung ném lỗi.
- Mỗi kiểu thất bại có câu báo riêng; câu lỗi không còn hiện hai lần ở màn hình
  Gói đang chờ kết quả.

### Khác

- Chốt hoà theo mã gói khi sắp xếp: kết quả lặp lại được bất kể thứ tự dữ liệu về.
- Bỏ mặc định phiên bản ghim cứng `'4.15.0'` trong `lib/live-canary.js`.
- Bài kiểm phiên bản đổi từ ghim `'4.16.0'` sang bất biến manifest = version_name
  = package.json.
- 10 bài cầu nối Windows bỏ qua kèm lý do trên hệ điều hành khác thay vì báo đỏ giả.

### Kiểm thử

666 bài: 656 đạt, 0 đỏ, 10 bỏ qua (cần Windows). 108 ca múi giờ đạt. Chromium: 23
trang nạp 0 lỗi; kịch bản mới `tools/test/bidopen-scan.mjs`, `tbmt-search.mjs`,
`plan-lookup.mjs`.

**Chưa chạy trên e-GP thật.** Cổng `tools/check-live-evidence.py` của tác giả chặn
bản này ("Unit source mismatch") cho tới khi chạy lại bộ kiểm trực tiếp — đúng như
thiết kế. Không đóng gói `evidence/` của 4.16.0.

## [4.12.0] — 2026-09-24

Nhận bản **4.11.0 của tác giả** làm nền (bản này khác hẳn bản 4.11.0 của nhánh:
tác giả đã tự làm cả nhóm B2 — tách service worker, chỉ mục, cache truy vấn,
một tab e-GP dùng lại — và cả B3 — cầu nối E-HSMT qua native messaging). Bản
4.12.0 giữ nguyên những phần đó và bổ sung bốn việc.

Bộ kiểm thử: **474 bài, xanh trên cả 4 múi giờ.** Mỗi thay đổi dưới đây đều đã
kiểm bằng cách hoàn tác mã nguồn và xác nhận bài thử báo đỏ.

### Nhanh hơn 4,2–4,7 lần ở mọi cỡ kho

Đo có mốc đối chiếu (trung vị 7 lượt, bỏ lượt khởi động), trên chính bản của
tác giả và bản này:

| Thao tác | Kho | Bản tác giả | Bản này | Nhanh gấp |
|---|---|---|---|---|
| Gõ một phím vào ô tìm | 3.000 | 322 ms | **77 ms** | 4,2× |
| Đổi bộ lọc điểm | 3.000 | 85 ms | **19 ms** | 4,5× |
| Gõ một phím vào ô tìm | 20.000 | 2.374 ms | **506 ms** | 4,7× |
| Đổi bộ lọc điểm | 20.000 | 649 ms | **137 ms** | 4,7× |

Nút thắt **không** nằm ở chỗ ai cũng đoán. Tách từng phần trên kho 20.000 gói:
lọc theo chữ chỉ tốn **1 ms**, chọn qua chỉ mục **0–2 ms**, chấm cổng lọc
186 ms — còn **phép sắp xếp tốn 2.198 ms**.

Nguyên nhân: `compareTenders` gọi `decisionRank`, mà hàm này gọi `statusOf` và
`daysToClose` — cả hai phân tích chuỗi ngày. Sắp n phần tử cần ~n·log₂n phép so
sánh, mỗi phép chạy chúng hai lần: ~570.000 lần phân tích ngày cho **một** lần
sắp, và nó chạy lại mỗi lần gõ phím.

Sửa: tính khoá sắp xếp một lần cho mỗi dòng rồi so sánh trên số đã tính. Kèm
theo, chuỗi tìm kiếm đã chuẩn hoá được nhớ lại trên bản ghi bằng thuộc tính
**không liệt kê được** — nên nó vô hình với `JSON.stringify`, với bản sao lưu,
với tệp Excel và với mốc phiên bản kết quả.

`tests/toc-do-sap-xep.test.js` khoá lại điều quan trọng nhất: **thứ tự phải
trùng khớp hoàn toàn** thứ tự cũ, trên cả 4 kiểu sắp. Tối ưu kiểu này chỉ đúng
khi mọi khoá chỉ phụ thuộc vào chính dòng đó; sai một chỗ là thứ tự đổi âm thầm.

### Kết quả tra cứu nay LẶP LẠI ĐƯỢC

Hai gói bằng điểm, bằng hạng, bằng giá thì trước đây đứng theo thứ tự chúng
tình cờ nằm trong kho — hai lần tra cùng tiêu chí có thể cho hai bảng khác thứ
tự. In ra hai lần, so hai tờ, thấy lệch, và không có cách nào biết bên nào
đúng. Nay chốt hoà bằng khoá gói, thứ tự cố định.

### Bảng Excel: kẻ ô, đậm, nghiêng, màu theo kết luận

`lib/xlsx.js` trước đây khai `<borders count="1">` với một khung **rỗng**,
không có font nghiêng, không có màu nền. Nay:

- **Kẻ khung từng ô** bằng nét xám nhạt — bảng 24 cột không kẻ thì in ra không
  dò được hàng. Ô thiếu giá vẫn có khung và vẫn **trống**, không thành "0 đ".
- **Màu nền mang đúng ba kết luận** của cổng lọc: xanh nhạt *Khớp*, vàng nhạt
  *Chưa đủ dữ liệu*, đỏ nhạt *Ngoài tiêu chí*. Không có kết luận thì chỉ kẻ dải
  chẵn/lẻ — tô màu khi không có căn cứ là nói một kết luận không tồn tại.
- **Đậm** tên gói, giá gói, cột đối chiếu; **nghiêng xám** lý do đối chiếu.
- **Dải đầu bảng** hai dòng gộp ô: tên báo cáo, phạm vi lọc, mạch đối soát
  e-GP, thời điểm xuất. Người nhận file không ngồi cạnh người xuất file.

Quan trọng hơn cách hiển thị: **bảng kiểu nay sinh ra bằng mã từ một danh sách
duy nhất**. Trước đây chỉ số kiểu và các `<xf>` được gõ tay ở hai chỗ cách nhau
150 dòng; lệch một ô là cả bảng sai kiểu — tiền thành ngày, chữ thành phần trăm
— mà tệp vẫn mở được nên không ai thấy ngay.

### Bộ icon: một dáng duy nhất ở mọi cỡ

Bộ cũ là **ba cái dấu khác nhau**: 16/32px vòng tròn + dấu tích; 48px thêm vạch
ngắm và khung tài liệu chen chúc; 128px một cảnh radar khác hẳn. Người dùng
nhận ra phần mềm bằng cái dấu trên thanh công cụ.

`tools/make-icons.mjs` sinh cả bộ từ một nguồn, giản lược dần mà **không đổi
dáng**: vòng radar + dấu tích giữ nguyên ở mọi cỡ; vạch ngắm thêm từ 48px; khung
tài liệu, vòng ngoài và chấm quét chỉ ở 128px. Nét khai riêng theo từng cỡ, vì ở
16px một nét 4/128 chỉ còn nửa điểm ảnh và biến thành vệt xám.

### Sửa lỗi

- **`Failed to fetch` hiện thẳng ra màn hình.** Chụp màn hình bản 4.11.0 thì
  dưới ô *Xã / Phường* hiện đúng hai chữ đó: tiếng Anh, không nói cái gì hỏng,
  không nói phải làm sao. Tệ hơn: ô chọn xã im lặng ngừng hoạt động, nên người
  dùng vẫn bấm tìm và vẫn nhận kết quả — chỉ là kết quả **không hề lọc theo
  xã**, mà trông vẫn bình thường. Nay mỗi câu lỗi nói đủ ba điều: hỏng ở đâu,
  tiêu chí xã đang **chưa được áp dụng**, và phải làm gì tiếp.
- **Mã loại gói không tồn tại bị hiểu là "không lọc gì".** Một mã gõ sai
  (`TV_DESING`), một bộ săn lưu từ bản cũ, hay một hằng số đổi tên đều rơi về
  chuỗi rỗng, và người dùng thấy bộ lọc đang bật mà nhận về toàn bộ gói thầu.
  Nay `isUnknownCategory()` phân biệt "không chọn" với "mã không hiểu".
- **Màn hình kế hoạch không được truyền danh mục địa bàn**, nên mọi tiêu chí xã
  đều rơi vào "Chưa đủ dữ liệu" — bộ lọc xã ở đó chưa bao giờ dùng được.
- **Gói con của kế hoạch mượn được tên xã của kế hoạch mẹ.** `wards` bị bỏ sót
  trong danh sách xoá khi gói con đã khai địa bàn riêng.
- **Câu "chính xác tuyệt đối" quay lại `winners.js`.** Xem mục 4.11.0 của nhánh
  về lý do đây là chuyện có hại thật, không phải chuyện câu chữ.
- **Giá lẻ và giá chẵn khác độ đậm** trong cùng một cột Excel.
- **Phiên bản ghim cứng `'4.11.0'`** làm mặc định trong `lib/live-canary.js`.
  Bằng chứng canary chỉ có nghĩa khi gắn đúng phiên bản đã chạy nó; một số ghim
  cứng sẽ lặng lẽ cũ đi sau mỗi lần nâng bản.

### Khớp xã: nhận lại chứng cứ bằng chữ, nhưng có điều kiện

Bản 4.11.0 bỏ hẳn chuỗi địa điểm, chỉ tính mã. Đúng về nguyên tắc, nhưng rất
nhiều hồ sơ e-GP ghi địa bàn bằng chữ mà không kèm mã — chọn xã xong là gần như
toàn bộ rơi vào "Chưa đủ dữ liệu", và bộ lọc xã hoá ra vô dụng.

Nay chứng cứ chữ được nhận lại, với điều kiện chặt: chuỗi phải nêu tên xã, **và**
hồ sơ phải có thêm chứng cứ tỉnh thuộc phạm vi đã chọn — mã tỉnh (chắc chắn) hoặc
tên tỉnh trong chuỗi. Nêu mỗi tên xã trần thì không đủ, vì "Đức Trọng" có ở nhiều
tỉnh. Kết luận này mang lý do riêng `ward-text` để phân biệt với `ward-code`.

Chữ chỉ đủ để **công nhận**, không đủ để **loại bỏ**: chuỗi nêu một xã khác
trong cùng tỉnh vẫn là "Chưa đủ dữ liệu", vì địa chỉ chủ đầu tư không phải địa
điểm thi công.

### Phép thử của nhánh phải cập nhật theo

21 bài đỏ khi hợp nhất. Không bài nào là lỗi sản phẩm — tác giả đã đổi hợp đồng
theo hướng chặt hơn, và bài thử đang khoá hành vi cũ:

- **Tên gói không còn quyết định lĩnh vực gói thầu.** Chỉ trường e-GP khai mới
  tính; viết tắt trong tên (TVGS, TVTK) vẫn phân nhánh tư vấn nhưng không tự
  nâng một gói chưa khai lên thành "Tư vấn". Đã kiểm: gói đó **không biến mất**,
  nó vào nhóm "Chưa đủ dữ liệu".
- **Xã nhận dạng bằng CẶP (mã xã, mã tỉnh cha)**, không phải mã trần.
- **`host_permissions` thu hẹp**: bỏ `http://localhost:1234/*`, chuyển sang
  `nativeMessaging`. Bài thử ghim cứng danh sách cũ nay đổi thành "không được
  **nới rộng**" — ghim cứng thì một lần thu hẹp hợp lệ cũng báo đỏ, và người sửa
  sẽ quen tay cập nhật fixture cho xong, để lần nới rộng thật sau đó lọt luôn.
- Bài kiểm Excel ghim `s="2"` đổi thành đọc ngược `styles.xml` và kiểm **ý
  nghĩa** kiểu ô.

## [4.11.0] — 2026-09-14

Nhận bản **4.10.1** của tác giả làm nền, rồi làm tiếp nhóm **B1 — Chính xác hơn nữa**.

Bộ kiểm thử: **453 bài, xanh trên cả 4 múi giờ** (UTC, Asia/Ho_Chi_Minh,
America/New_York, Pacific/Auckland). Mỗi mục dưới đây đều đã được kiểm bằng cách
hoàn tác mã nguồn và xác nhận bài thử báo đỏ — một bài thử chưa từng đỏ thì chưa
chứng minh được điều gì.

### Khớp xã theo MÃ, không chỉ theo chữ *(B1.3)*

`lib/area-match.js` thêm lớp đối chiếu theo `parentCode`. Trước đây tiêu chí
"Đức Trọng" khớp bằng cụm chữ, nên một xã trùng tên ở tỉnh khác cũng lọt vào —
và người dùng không có cách nào biết. Nay:

1. Hai bên đều có mã → kết luận dứt khoát theo mã.
2. Chỉ một bên có mã → đối chiếu tên, có giới hạn theo mã tỉnh.
3. Không đủ căn cứ → **`Chưa đủ dữ liệu`**, giữ lại cho người dùng tự xét, chứ
   không âm thầm vứt đi.

`tests/ward-code.test.js` — 14 bài. Hoàn tác về khớp chữ làm đỏ 2 bài.

### Canary sống — đối chứng với e-GP thật *(B1.1)*

Toàn bộ 453 bài hiện chạy trên dữ liệu tự dựng. Chúng chứng minh phần mềm không
tự hỏng, và **chỉ vậy**. Chúng không biết e-GP vừa đổi tên một trường hay vừa bỏ
một mã tỉnh — đúng những thứ làm phần mềm trả kết quả thiếu mà vẫn xanh hết.

`lib/canary-live.js` lấp chỗ đó, canh ba thứ: **trường biến mất**, **mã biến
mất**, và **mã địa bàn trôi** (Lâm Đồng phải giữ cả `68` lẫn `703` — mất `703`
là bỏ sót lặng lẽ toàn bộ hồ sơ trước 1/7/2025).

Node không có token của trang e-GP nên không gọi được endpoint tìm kiếm. Vì vậy
chia đôi: chạy thật trong tiện ích (**Chẩn đoán → "Chạy canary sống"**, sau 22h),
ghi ra `canary-result.json`; `npm test` đọc tệp đó và **chặn bản dựng** nếu đỏ
hoặc quá 10 ngày. Chưa chạy lần nào thì chỉ cảnh báo to — chặn ở đó thì không ai
cài được lần đầu và người ta sẽ học cách bỏ qua bài thử.

`tests/canary-live.test.js` (17 bài) + `tests/canary-gate.test.js` (2 bài).

**Còn dở, nói rõ:** danh sách mới có 9 mã, trong đó 4 mã đã đọc được trên e-GP
thật (`source:'observed'`), 5 mã mới lấy từ kết quả tìm kiếm chưa mở chi tiết
(`source:'candidate'`). Yêu cầu là 20–30 mã. Phần tra từng mã **chưa tự động**;
màn hình Chẩn đoán ghi thẳng `0/9 — chưa tự động` chứ không báo đạt.

### Một cửa duy nhất cho lọc, thống kê và xuất *(B1.4)*

Bản 4.10.1 đã gom về một cửa: `passesHardFilter()` chấm từng bản ghi trước khi
lưu. `tests/mot-cua-duy-nhat.test.js` (11 bài) khoá lại điều đó, và bài quan
trọng nhất **cắt đúng hàm `exportCsv` trong `background.js` ra chạy thật** với
danh sách khoá y hệt cái màn hình gửi sang, trên 7 tổ hợp bộ lọc. Chèn thử một
bộ lọc điểm riêng vào đường xuất → bài này đỏ ngay.

Kèm theo: mọi lý do loại trừ phát ra đều phải có nhãn tiếng Việt; cổng phải
thuần (đảo thứ tự chấm vẫn ra cùng kết quả, không sửa dữ liệu gốc); gói thiếu
giá vẫn phải có trong tệp với ô giá **trống**, không phải "0 đ".

### Bỏ chữ "tuyệt đối" khỏi giao diện *(B1.5)*

Dữ liệu nằm ở một hệ thống bên ngoài mà phần mềm này không kiểm soát. Hứa "chính
xác tuyệt đối" với người đi đấu thầu là có hại thật: họ sẽ thôi đối chiếu lại
với e-GP, và một lần bỏ sót sẽ không ai phát hiện. Đã bỏ lời hứa còn sót trong
`winners.js`. `tests/khong-hua-tuyet-doi.test.js` quét chuỗi người-dùng-đọc và
chặn 5 mẫu hứa hẹn, kèm phép tự kiểm để bộ mẫu không xanh một cách vô nghĩa.

### Loại gói theo `investField` *(B1.2)* — đã đúng sẵn

Kiểm lại `matchesTenderCategory`: nó đã đọc `tenderFieldOf(record)` trước, tên
gói chỉ dùng phụ để phân nhánh tư vấn. Không sửa gì.

## [4.10.1] — 2026-09-14 · của tác giả

Hợp nhất nguyên trạng. Những thay đổi đáng kể nhất, đã kiểm chứng lại:

- **Cổng ba trạng thái** `Khớp / Chưa đủ dữ liệu / Ngoài tiêu chí` cùng 26 lý do
  loại trừ đặt tên rõ ràng (`lib/hard-filter.js`, `lib/match-gate.js`).
- **Đối soát số lượng trên thông báo kết thúc**: *"e-GP báo 137 · đã tải 137 ·
  khớp 123 · ngoài tiêu chí 14 · trang 3/3"*.
- **Bỏ hẳn bộ lọc ngày gửi lên máy chủ ở màn hình kế hoạch.** Máy chủ chỉ lọc
  được ngày ĐĂNG TẢI còn người dùng chọn ngày PHÊ DUYỆT; nới biên 30 ngày chỉ
  che được phần lớn độ lệch, kế hoạch phê duyệt tháng 6 mà tháng 8 mới đăng vẫn
  bị mất. Bỏ hẳn thì chậm hơn, đổi lại không bỏ sót.
- **Thiếu ngày phê duyệt thì GIỮ LẠI**, không lấy ngày đăng tải thay thế — lấy
  mốc khác thay vào là trả lời một câu hỏi khác rồi dán nhãn câu hỏi đã hỏi.
- **Từ chối chạy khi chưa tra được danh mục địa bàn**, thay vì âm thầm bỏ tiêu
  chí tỉnh rồi tìm toàn quốc.
- Bộ kiểm thử `node:vm` nạp thẳng `background.js` với `chrome` API giả lập.

### Phép thử của nhánh này phải cập nhật theo

Bốn bài về bộ lọc ngày KHLCNT đang khoá lại hành vi CŨ (nới biên máy chủ, lùi về
ngày đăng tải). Hành vi mới đúng hơn, nên sửa bài chứ không sửa mã.

Hai bài an toàn neo vào chuỗi mã nguồn cũng vỡ, **không phải vì mất điều kiện an
toàn nào** mà vì mốc cắt đoạn và danh sách khoá đã đổi hợp lệ. Đã viết lại theo
hướng kiểm *tính chất*: `PLAN_KEYS` nay được kiểm là danh sách trắng đóng không
chứa `url`/`method`/`headers`/`token`, thay cho việc ghim cứng đúng ba phần tử —
cách cũ khiến một bổ sung hợp lệ cũng báo đỏ, và người sửa sẽ học cách nới nó ra
cho xong, mất luôn tác dụng bảo vệ.

## [4.9.2] — 2026-09-11

Sửa cửa sổ popup bị bóp hẹp và nội dung nhảy loạn.

### Sửa lỗi

- **Bấm vào biểu tượng tiện ích thì popup hiện ra hẹp như sợi chỉ**, chữ vỡ
  dòng từng từ, nội dung nhảy loạn *"như tự động chạy"*.

  Thủ phạm là một khai báo CSS duy nhất: `body{max-width:100vw}`.

  Cửa sổ popup của Chrome **tự co theo nội dung**, nên `100vw` tạo ra một vòng
  lặp tự bóp:

  > thân co lại → cửa sổ co theo → `100vw` nhỏ đi → thân co tiếp

  Đo được trước khi sửa: cửa sổ 320px → thân 320px; 240px → 240px; 200px →
  200px. Sau khi sửa, thân giữ nguyên **420px** ở mọi bề rộng cửa sổ.

  Thêm một cái bẫy nữa của `100vw`: nó **tính cả thanh cuộn dọc**. Ở cửa sổ
  420px, thân là 420px trong khi vùng nhìn thấy chỉ 405px — dư đúng 15px, đủ
  để đẻ ra một thanh cuộn **ngang** mà không ai cần. Đúng thanh cuộn thấy trong
  ảnh người dùng gửi.

  Popup của Chrome cho phép tới 800px nên 420px luôn vừa; nay chốt cứng bằng số
  và chặn tràn ngang, không dùng đơn vị nào phụ thuộc khung nhìn.

- **"Nhảy loạn như tự động chạy" không phải lỗi riêng.** Đã đo: nạp sẵn 3000
  gói — đúng lượng dữ liệu trên máy người dùng — rồi theo dõi kích thước mỗi
  180ms trong 2,5 giây. Kết quả `420x821`, **không đổi lần nào**. Cảm giác
  "đang tự chạy" chính là trình duyệt đo đi đo lại trong lúc vòng lặp co bóp
  chạy; hết vòng lặp thì hết nhảy.

### Kiểm thử

- `tools/test/popup-size.mjs` — khoá hai mặt: thân **không được co** theo cửa
  sổ dù hẹp đến đâu, và ở bề rộng Chrome thật sự cấp cho popup thì **không
  sinh thanh cuộn ngang**. Đã thử khôi phục `max-width:100vw`: ba dòng đầu báo
  `✗ BỊ BÓP` ngay.
- `tools/test/popup-jump.mjs` — nạp 3000 gói rồi đo kích thước liên tục.

### Ghi chú

Các chỗ `calc(100vw - N)` còn lại trong `workspace.css` nằm trên hộp thoại và
khay nổi của **trang lớn**, không phải trên `body` của một cửa sổ tự co, nên
không dính vòng lặp này. Đã rà và giữ nguyên.

## [4.9.1] — 2026-09-11

Sửa lỗi gói **chỉ định thầu** bấm vào ra trang trắng, và mở đường về kế hoạch.

### Sửa lỗi

- **Mã gói hiển thị sai: `IB2600501375-null` thay vì `IB2600501375-00`.**

  e-GP trả về nguyên văn **chuỗi ký tự `'null'`** cho `notifyVersion` của gói
  chỉ định thầu — loại không đi qua bước mở thầu nên thiếu hẳn nhiều trường.
  `cleanText('null')` trả lại `'null'`, một chuỗi *có nội dung*, nên phép chống
  đỡ `|| '00'` không bao giờ chạy.

  Từ một chỗ nhận nhầm "không có dữ liệu" thành "dữ liệu", hỏng theo dây chuyền:
  mã hiển thị sai → khoá chống trùng sai → **tham số link tra cứu mang chữ
  `null`** → bấm vào thì e-GP mở ra trang trắng trơn, mọi ô đều rỗng.

  Nay `cleanText()` coi `'null'` / `'undefined'` / `'NaN'` là **rỗng**. Không
  trường nào của e-GP có giá trị thật đúng bằng mấy chữ đó.

- **Nút "Tải hồ sơ" cũng hỏng theo, cùng một gốc.** Nó mở chính link đó rồi chờ
  trang tự gọi endpoint tệp đính kèm; trang trắng thì không có gì để chờ.

- **Tham số thiếu trong link để rỗng thay vì ghi `undefined`.** Link do chính
  e-GP sinh ra ghi `bidOpenId=undefined`, không phải `bidOpenId=`. Gói chỉ định
  thầu thiếu cả loạt trường như vậy, nên đây đúng là ca hay gặp. Đã thống nhất
  theo quy ước của e-GP.

- **Một bản ghi mang hai giá trị phiên bản khác nhau** — trường `version` ghi
  `'1'` trong khi mã đầy đủ ghi `-01`, nên khoá chống trùng có thể lệch giữa
  hai lần đọc cùng một gói. Ba màn hình nay dùng chung `normalizeVersion()`.

### Tính năng mới

- **Nút "📋 Xem KHLCNT" trên mỗi gói đã trúng thầu.** Mở thẳng Kế hoạch lựa
  chọn nhà thầu sinh ra gói đó, điền sẵn mã kế hoạch và **bỏ giới hạn thời
  gian** (kế hoạch có thể duyệt từ lâu, mốc mặc định 3 tháng sẽ cắt mất).

  Đây là đường vòng **có chủ ý**. Bản ghi KQLCNT chỉ có `planNo`, không có id
  nội bộ của kế hoạch, mà thiếu id thì trang chi tiết e-GP lại trắng — đúng thứ
  đang phải chữa. Nên đi qua luồng tìm kiếm KHLCNT đã chạy được, chắc ăn hơn.

- **Báo lỗi tải hồ sơ nói rõ ba khả năng** thay vì một câu chung chung, và với
  gói không qua mạng thì chỉ thẳng sang nút "Xem KHLCNT".

### Kiểm thử

- `tests/chi-dinh-thau.test.js` — 7 bài dựng lại đúng bản ghi trong ảnh người
  dùng gửi (`IB2600501375`, `notifyVersion: 'null'`), chốt rằng mã ra đúng
  `IB2600501375-00`, link không còn chữ `null`, và **gói qua mạng bình thường
  không bị đụng tới**. Đã thử khôi phục `cleanText` cũ: 5/7 bài báo đỏ.
- `tools/test/plan-link.mjs` — chạy toàn trình trong Chromium: từ thẻ gói trúng
  thầu bấm "Xem KHLCNT" → mở đúng `plans.html?planNo=…`, ô từ khoá điền sẵn mã
  kế hoạch, mốc thời gian về "không giới hạn". `LỖI (0)`.
- Tổng: **144 → 151 bài**, đạt hết ở bốn múi giờ.

### Còn chưa xác nhận được

- Đã sửa **nguyên nhân làm hỏng link** (kiểm chứng được: mã khớp đúng e-GP,
  link sạch chữ `null`). Nhưng **chưa xác nhận được** trang chi tiết KQLCNT của
  e-GP có dựng ra nội dung cho gói chỉ định thầu hay không — việc đó cần máy
  chủ thật. Nếu e-GP vẫn trả trang trắng thì đó là phía e-GP, và nút
  "Xem KHLCNT" là đường đi vòng đã chuẩn bị sẵn cho tình huống đó.

## [4.9.0] — 2026-09-11

Hợp nhất bản 4.8.0 của tác giả vào nhánh này, và sửa hai lỗi lọc ngày mà bản
4.8.0 mang theo — cả hai đều **vô hình trên máy đặt giờ Việt Nam**.

### Nhận từ 4.8.0

Bản 4.8.0 được xây trên chính mã 4.2.0 của nhánh này và là một bản mở rộng
thật, không phải nhánh song song. Đã chạy lại toàn bộ kịch bản hồi quy của
nhánh này trên nó: **đạt hết**. Những chỗ 4.8.0 làm tốt hơn, giữ nguyên:

- **Đọc biên bản mở thầu** viết lại tốt hơn bản 4.2.0 ở bốn điểm:
  ba đồng hồ độc lập (tải trang 45 giây / chờ dữ liệu 25 giây, tự gia hạn mỗi
  lần e-GP trả lời / trần tuyệt đối 90 giây không gia hạn được); đọc hai gói
  song song thay vì tuần tự; **chứng thực bảng trước khi nhận** — phải biết
  loại biên bản, đã xác minh mốc giá, và số nhà thầu đọc được khớp số e-GP công
  bố, nếu không thì ghi rõ là chưa đủ; và quan trọng nhất, dùng `chrome.alarms`
  làm chốt canh. Bản 4.2.0 chỉ dùng `setTimeout`, thứ **chết theo service
  worker** khi Chrome cho worker ngủ — một lỗi MV3 thật của bản 4.2.0.
- **Bỏ bộ lọc ngày gửi lên máy chủ ở màn hình mở thầu.** Bản 4.2.0 gửi range
  trên `publicDateKqmt`. Nhưng đó là ngày ĐĂNG biên bản: gói IB2600486024 đăng
  26/8/2026 mà mở thật 5/9/2026. Lọc máy chủ bằng ngày đăng là cắt mất gói vừa
  mở — bỏ sót, thứ tệ nhất. 4.8.0 bỏ hẳn lớp đó và đối chiếu
  `bidRealityOpenDate` tại chỗ. Một lớp đúng hơn hai lớp có một lớp nói sai.
- **`statusOf()` tính lại vòng đời mỗi lần đọc** thay vì tin trường `status` đã
  lưu. Trường đó không bao giờ là tín hiệu riêng từ e-GP — chính phần mềm gán
  nó lúc quét — nên "ưu tiên giá trị đã lưu" chỉ có tác dụng đóng băng một kết
  quả cũ: gói quét tuần trước vẫn hiện ĐANG MỞ dù đã hết hạn từ lâu.
- **Nhãn độ đầy đủ dữ liệu nói đúng việc hơn**: "Đủ trường chính" thay cho "Dữ
  liệu tốt". Phần mềm đếm được trường nào có nguồn, nó không phán xét được dữ
  liệu tốt hay xấu.
- Mười vòng tính năng 4.3–4.8: chọn loại gói thầu, bộ săn tự động theo giờ,
  theo dõi chủ đầu tư, năng lực công ty, checklist HSDT, hợp đồng tương tự,
  ma trận HĐ×HSMT, đối thủ địa bàn, bản đồ Leaflet, nhật ký điều chỉnh, duyệt
  Go nhiều bước, đồng bộ JSON qua USB có HMAC, và chế độ chỉ xem.

### Sửa lỗi

- **Bộ lọc ngày loại oan bản ghi, không báo gì.** `parseDate()` neo mốc e-GP
  vào giờ Việt Nam (đúng), nhưng `parseDayMs()` lại dựng biên khoảng bằng **giờ
  máy**. Hai cách neo khác nhau cho cùng khái niệm "ngày", lệch nhau đúng 7
  tiếng:

  > Kế hoạch phê duyệt 01/06/2026 lúc 05:00 giờ Việt Nam → `2026-05-31T22:00Z`.
  > Biên dưới của "từ ngày 01/06" trên máy UTC → `2026-06-01T00:00Z`.
  > 22:00 ngày 31/05 < 00:00 ngày 01/06 → **kế hoạch biến mất khỏi kết quả.**

- **`firstStampMs()` ném đi toàn bộ việc neo giờ** — nó dùng thẳng
  `new Date(raw)` thay vì `parseDate()`, đúng tại chỗ mọi bộ lọc khoảng ngày so
  sánh. e-GP thường trả chuỗi không kèm múi giờ (`'2026-03-31T23:59:00'`), mà
  `new Date()` hiểu chuỗi đó theo giờ máy. Gói mở thầu tối muộn ngày cuối khoảng
  rơi ra ngoài.

  Cả hai nay dùng chung hằng số `VN_UTC_OFFSET_HOURS` khai báo một chỗ duy nhất.

- **Cảnh báo "Đã quá hạn" không đời nào chạy được.** Điều kiện sinh ra nó đòi
  gói đang MỞ và số ngày còn lại < 0 — nhưng ngày còn lại < 0 thì vòng đời đã
  là ĐÃ ĐÓNG. Bỏ hẳn nhánh chết thay vì để đó.
- **Bản ghi rỗng được cộng 16 điểm tin cậy.** `bidStatus()` trả `PLAN` cho mọi
  bản ghi thiếu mã TBMT, kể cả bản ghi trống trơn, rồi `dataConfidence()` miễn
  cho "kế hoạch" khoản thiếu hạn nộp. Nay phải **có mã kế hoạch** mới được miễn.
- Bỏ ba tham chiếu ảnh trong `vendor/leaflet.css` trỏ tới tệp không có trong
  gói. Bản đồ chỉ dùng `circleMarker`, không dùng `L.marker` hay
  `control.layers`, nên ba ảnh đó vĩnh viễn không hiển thị — giữ lại chỉ là
  ship sẵn ba yêu cầu tải hỏng.

### Kiểm thử

Bản 4.8.0 gửi kèm 3 tệp kiểm thử và **không có** bộ chạy trong trình duyệt.
Nhánh này khôi phục lại toàn bộ: **144 bài**, gồm cả 21 bài của 4.8.0 và bộ
kịch bản Chromium + máy chủ e-GP giả lập ở `tools/`.

- `tests/timezone.test.js` — chạy lại đúng kịch bản đã làm lộ hai lỗi trên.
- `npm run test:tz` chạy toàn bộ ở **bốn múi giờ**. Đây không phải cẩn thận
  thừa: bản lỗi **đạt hết 5/5** khi chạy ở giờ Việt Nam. Chạy một múi giờ là tự
  bịt mắt trước cả một lớp lỗi im lặng.
- Bài kiểm thử múi giờ đầu tiên tôi viết **cũng bỏ sót** lỗi `firstStampMs`, vì
  nó dựng dữ liệu mẫu bằng `parseDate()` nên chuỗi nào cũng có hậu tố `Z` — mà
  `Z` thì `new Date()` cũng hiểu đúng. Đã viết lại bằng nguyên dạng chuỗi e-GP
  trả về.
- Mọi bài sửa đều đã thử phá lại mã nguồn để chắc chắn nó báo đỏ thật.

### Còn chưa xác nhận được

- Mọi phép đo vẫn trên **e-GP giả lập**. Chưa có lượt canary trên máy chủ thật.
- Không kiểm chứng được con số "161/161 đạt" trong báo cáo 4.8.0: gói không kèm
  bộ kiểm thử tương ứng.
- `market.html` tải ảnh bản đồ từ `tile.openstreetmap.org`. Mỗi lần mở **Soi
  địa bàn**, trình duyệt để lộ cho bên thứ ba biết đang xem vùng bản đồ nào.
  Không nghiêm trọng, nhưng ngược với tinh thần "dữ liệu nằm tại máy" của phần
  còn lại, và người dùng nên biết.

## [4.2.0] — 2026-09-03

Lọc theo ngày cho màn hình **Kế hoạch lựa chọn nhà thầu**.

### Tính năng mới

- **Chọn khoảng thời gian khi tra KHLCNT.** Trước đây màn hình này tra không
  giới hạn thời gian, nên kế hoạch phê duyệt từ **2025** nằm lẫn với kế hoạch
  2026 — người dùng phải tự nhặt bằng mắt. Nay có ô *"Kế hoạch phê duyệt
  trong"*: 30 ngày / **3 tháng (mặc định)** / 6 tháng / 12 tháng / không giới
  hạn / **tự chọn Từ ngày – Đến ngày**.

  Mốc đối chiếu là **ngày phê duyệt** (`decisionDate`), đúng ngày in trên mỗi
  thẻ kết quả, chứ không phải ngày đăng tải. Kế hoạch không có ngày phê duyệt
  thì lùi về ngày đăng tải; kế hoạch **không có mốc nào thì được giữ lại** —
  loại bỏ là bịa ra kết luận từ chỗ không có dữ liệu.

  Lọc theo ngày còn thu hẹp phạm vi rất nhiều: cùng một lần tra Lâm Đồng, mốc
  3 tháng cắt bớt một nửa số kế hoạch phải xét, nên ít chạm trần 40 trang hơn.

### Chi tiết kỹ thuật

- Lọc **hai lớp**, đúng cách đã dùng ở màn hình mở thầu:
  1. **Máy chủ** — filter `range` trên `publicDate`, **đã nới biên 30 ngày**.
     Nới biên là bắt buộc: máy chủ soi ngày *đăng tải*, lớp tại chỗ soi ngày
     *phê duyệt*, hai mốc lệch nhau vài ngày. Không nới thì máy chủ cắt mất
     kế hoạch mà lớp tại chỗ lẽ ra giữ — tức là **bỏ sót**.
  2. **Tại chỗ** — `khlcntInDateRange()`. Đây mới là thứ quyết định. Chưa có
     phép đo nào chứng minh e-GP lọc được `range` trên bản ghi
     `es-plan-project-p`; nếu nó bỏ qua lặng lẽ như vẫn thường thế, kết quả
     vẫn đúng.
- Gom `parseDayMs` / `dateRangeFrom` / `firstStampMs` / `padRange` về
  `lib/core.js` để hai màn hình dùng chung một chỗ, không lệch nhau được nữa.

### Sửa lỗi

- **`fromDate is not defined` — bộ lọc ngày làm chết cả lượt tra.**
  `startPlanLookup()` đọc `fromDate`/`toDate` mà quên khai báo. Bắt được nhờ
  chạy thật trên Chromium; phép thử đơn vị không đụng tới `background.js` nên
  không thấy.
- **Mốc sẵn (30/90/180/365 ngày) không lọc gì cả.** Giao diện gửi `days` lên
  nhưng tầng nền không nhận, không một lời báo lỗi — chọn "3 tháng gần đây"
  mà vẫn ra kế hoạch 2025.

### Kiểm thử

- `tests/khlcnt-date-range.test.js` — 15 bài, dùng đúng hai kế hoạch trong ảnh
  người dùng gửi (`PL2500319720` phải bị loại, `PL2600286616` phải được giữ),
  cùng các bài cho nới biên máy chủ và cho `parseDayMs` từ chối ngày không tồn
  tại thay vì để JavaScript cuộn sang ngày khác.
- `tests/ui-payload-contract.test.js` — 5 bài đối chiếu **trang giao diện gửi
  gì** với **tầng nền đọc gì**. Chặn đúng hai lỗi ở trên mà không cần Chromium.
  Đã thử bỏ `days` đi để chắc chắn phép thử báo đỏ thật.
- `tools/test/plans-e2e.mjs` — chạy toàn trình trên e-GP giả lập. Máy chủ giả
  lập **cố tình bỏ qua** bộ lọc thời gian, đúng như e-GP thật bỏ qua lặng lẽ
  filter nó không hiểu; nhờ vậy phép thử chứng minh được công đầu thuộc về lớp
  lọc tại chỗ. Kết quả: không lọc → 5 kế hoạch 2025 lẫn vào; lọc → **0**.
- `tools/test/plans-ui.mjs` — kiểm khối ngày trên `plans.html` bằng Chromium.
- Tổng: **93 → 113 bài, đạt hết**.

### Còn chưa làm được

- Chưa xác nhận được trên e-GP **thật** rằng máy chủ có lọc `range` trên
  `es-plan-project-p` hay không. Chỉ ảnh hưởng tốc độ, không ảnh hưởng kết quả.

## [4.1.1] — 2026-09-02

Tăng tốc đọc biên bản mở thầu và sửa nhãn trạng thái nói sai.

### Sửa lỗi

- **Đọc biên bản rất chậm.** Vòng lặp chờ MỘT hạn duy nhất 20 giây cho mỗi gói.
  Gói có dữ liệu trả lời sau 2–3 giây nên không sao; nhưng gói mà e-GP **không
  phát request nhà thầu** thì vòng lặp nằm chết đủ 20 giây rồi mới sang gói kế.
  Với 150 gói mà 30 gói không có dữ liệu, riêng phần nằm chờ vô ích đã là 10 phút.

  Nay tách làm hai mốc: `BBMT_SETTLE_MS` bắt đầu đếm **sau khi trang đã tải
  xong** (request nhà thầu luôn phát trong hoặc ngay sau lúc tải), còn hạn 20
  giây chỉ còn là trần tuyệt đối phòng trang không bao giờ tải xong. Nghỉ giữa
  hai gói giảm 700 → 450 ms.

  Đo trên e-GP giả lập, 8 gói với 4 gói không trả dữ liệu:

  | | Trước | Sau |
  |---|---|---|
  | Tổng thời gian | 86,1 giây | **19,7 giây** |
  | Trung bình | 10,8 giây/gói | **2,5 giây/gói** |

  Nhanh gấp **4,4 lần**. Ước tính 150 gói: khoảng 27 phút → khoảng 6 phút.

- **Gói đã đọc xong vẫn hiện "Chưa đọc".** Một lần đọc có **ba** kết cục nhưng
  giao diện chỉ có hai nhãn, và cả hai đều nói sai:
  - e-GP trả bảng **rỗng** → hiện *"Chưa đọc biên bản gói này"*, y hệt gói còn
    chưa tới lượt. Đây là lý do người dùng thấy gói số 1 ghi "chưa đọc" trong
    khi gói số 3 đã có bảng, và tưởng phần mềm trả kết quả lộn xộn — thực ra
    thứ tự đọc vẫn đúng, chỉ là nhãn nói sai.
  - **hết hạn chờ** → hiện *"e-GP không trả dữ liệu"*, một kết luận về e-GP mà
    ta không có cơ sở đưa ra. Hết hạn chờ chỉ có nghĩa là chưa biết.

  Nay tách rõ bốn trạng thái `PENDING` / `OK` / `EMPTY` / `TIMEOUT`, mỗi trạng
  thái một câu nói đúng việc đã xảy ra. Thông báo kết thúc cũng đếm riêng gói
  chưa có nhà thầu dự và gói hết hạn chờ, kèm gợi ý quét lại.

### Kiểm thử

- Bổ sung 5 bài cho bốn trạng thái đọc, gồm bài chốt rằng **bảng rỗng không bao
  giờ bị coi là chưa đọc**, và bài đọc được dữ liệu lưu từ bản cũ chưa có
  `readState`.
- `tools/test/speed.mjs` đo thời gian đọc trên e-GP giả lập; máy chủ giả lập
  nay dựng cả trang chi tiết biên bản, trong đó **một phần gói cố tình không
  phát request nhà thầu** — đúng tình huống làm bản cũ nằm chết.

### Kết quả

`npm test`: 89/89 → **93/93 đạt**.

### Ghi chú

Không tăng tốc bằng cách mở nhiều tab song song. Toàn bộ thiết kế là chạy bằng
chính giao diện e-GP ở nhịp một người dùng bấm chuột; bắn song song đổi lấy vài
phút bằng rủi ro bị khoá truy cập, một cái giá không đáng.

### Hạn chế còn lại

- Lượt quét sau vẫn đọc lại các gói mà lần trước e-GP trả bảng rỗng. Kho quan
  sát chỉ ghi gói đọc được nhà thầu, nên chưa phân biệt được "đã hỏi rồi, không
  có ai dự" với "chưa hỏi". Sửa đúng cần thêm một khoá lưu trữ riêng.

## [4.1.0] — 2026-09-02

Sửa lỗi bộ lọc thời gian ở màn hình **Gói đang chờ kết quả**, và bổ sung chọn
khoảng ngày theo yêu cầu người dùng.

### Sửa lỗi

- **Bộ lọc thời gian không có tác dụng.** Người dùng chọn "Mở thầu trong vòng
  15 ngày" (tháng 9/2026) nhưng nhận về gói mở thầu tháng 4–5 năm **2023**.

  Nguyên nhân: truy vấn lọc bằng `searchType:'greater_equal'` với chuỗi ISO
  trong `fieldValues`. e-GP **không hiểu dạng này và bỏ qua lặng lẽ** — không
  báo lỗi, chỉ trả về mọi gói từ trước tới nay. Dạng đã được đo là chạy đúng
  (ghi trong `lib/kqlcnt.js`) là `searchType:'range'` với `from`/`to` là **số
  epoch mili-giây**.

  Ngoài ra `days` và `fromYear/toYear` cùng đẩy filter lên một trường, nên máy
  chủ nhận hai điều kiện chồng nhau.

  Sửa ở hai lớp, vì máy chủ nuốt lỗi thay vì báo nên lớp máy chủ không đủ tin:
  1. truy vấn gửi lên đúng định dạng, gộp về **một** filter `range`;
  2. dữ liệu tải về được **lọc lại tại chỗ** — đây mới là thứ bảo đảm kết quả
     nằm đúng khoảng, bất kể máy chủ làm gì. Cùng cách `lib/khlcnt.js` đã dùng
     cho xã/phường. Số gói bị loại được báo ngay trên thanh tiến trình.
- **Khoảng giá gói thầu cũng dính đúng lỗi đó** trên cùng màn hình: hai filter
  `greater_equal`/`less_equal` chồng lên `bidPrice`. Gộp về một filter `range`
  với `from`/`to` là số, đúng dạng bắt được từ request do chính e-GP dựng.
- **Ngày không tồn tại bị JavaScript cuộn sang ngày khác.** `2026-13-45` thành
  14/02/2027, `31/02` thành 03/03 — người dùng sẽ nhận kết quả của một khoảng
  họ không hề chọn. Nay đối chiếu lại cả ba thành phần sau khi dựng `Date`.

### Thêm mới

- Ô **Từ ngày / Đến ngày** ở màn hình Gói đang chờ kết quả. Chọn
  "Tự chọn khoảng ngày…" trong ô *Mở thầu trong khoảng* để hiện, và hai ô được
  gợi ý sẵn 30 ngày gần đây. Bỏ trống một đầu thì đầu đó không giới hạn; chọn
  ngược từ/đến thì tự hoán đổi.
- Thêm hai mốc nhanh **6 tháng** và **1 năm gần đây**.
- Thứ tự ưu tiên khi có nhiều cách chọn: khoảng ngày → khoảng năm → N ngày gần
  đây.

### Kiểm thử

- Thêm `tests/bbmt-date-range.test.js` (19 bài): định dạng filter gửi lên, quy
  đổi lựa chọn thành khoảng, biên của khoảng, ngày không hợp lệ, khoảng giá, và
  lớp lọc tại chỗ — trong đó có bài dùng **đúng bốn gói năm 2023 từ ảnh chụp
  màn hình người dùng gửi** làm dữ liệu kiểm tra.
- Gói thiếu mốc thời gian được **giữ lại** kèm ghi chú, không loại — loại bỏ sẽ
  là bịa ra kết luận từ chỗ không có dữ liệu.

### Kết quả

`npm test`: 70/70 → **89/89 đạt**. Khối chọn ngày đã chạy thử trong Chromium: 0 lỗi.

### Hạn chế còn lại

- Trường đã đo được là lọc `range` chắc chắn đúng là `publicDate`. Chưa có phép
  đo nào chứng minh `publicDateKqmt` cũng vậy. Vì thế lớp lọc tại chỗ là bắt
  buộc, không phải phòng xa. Cần canary trên e-GP thật để biết máy chủ có lọc
  sẵn hay không — nếu không, lượt quét sẽ chậm hơn nhưng **kết quả vẫn đúng**.

## [4.0.3] — 2026-09-02

Dọn tài liệu và chặn một lớp sai sót lặp lại. Không thay đổi hành vi phần mềm.

### Sửa lỗi

- README công bố số phiên bản lệch với `manifest.json`. Đã xảy ra **hai lần**
  liên tiếp khi bump phiên bản, và lần trước còn kéo theo hai câu sai sự thật
  nằm cạnh số hiệu cũ. Nay README nói đúng phiên bản đang cài.
- Các bước cài đặt trong README không còn gắn cứng số phiên bản, nên lần bump
  sau không phải sửa lại.

### Kiểm thử

- Thêm `tests/version-consistency.test.js` (6 bài): `manifest.json`,
  `package.json` và tiêu đề README phải cùng một số hiệu; CHANGELOG phải có mục
  cho phiên bản hiện tại và đặt nó lên đầu; các bước cài đặt không được nhắc số
  phiên bản cụ thể.

### Kết quả

`npm test`: 64/64 → **70/70 đạt**.

## [4.0.2] — 2026-09-02

Bản vá sau khi chạy 4.0.1 **thật trong Chromium**. 4.0.1 đạt 57/57 kiểm thử tự
động nhưng vẫn còn một lỗi cùng gốc với lỗi nó vừa sửa, vì lỗi này chỉ lộ ra
khi nạp tiện ích vào trình duyệt.

### Sửa lỗi

- **Đang mở sẵn một trang e-GP khác thì không quét được gói nào.** 4.0.1 đã
  sửa route mặc định (`EGP_DEFAULT_URL`), nhưng `prepareScanTabFor()` vẫn tái
  dùng tab e-GP đang mở **nguyên trạng** khi chưa có bộ lọc. Người dùng đang
  xem trang chủ e-GP rồi bấm "Quét e-GP ngay" sẽ nhận nguyên văn
  `Could not establish connection. Receiving end does not exist.` và 0 gói.
  Đo trong Chromium: 4.0.1 = `ERROR`, 0 gói; sau khi sửa = `SUCCESS`, 137 gói.
  - `lib/core.js` thêm `EGP_SCAN_PAGE`, `hasContentScript()`, `scanTargetUrl()`
    làm nguồn sự thật duy nhất về phạm vi content script.
  - `prepareScanTabFor()` điều hướng tab về trang tìm kiếm khi tab hiện tại
    nằm ngoài phạm vi đó, thay vì dùng lại.

### Kiểm thử

- Thêm `tests/content-script-scope.test.js` (7 bài): dịch chính
  `content_scripts.matches` trong `manifest.json` sang RegExp rồi đối chiếu với
  `hasContentScript()`, nên manifest và phần nền không thể lệch nhau lần nữa.
  Có bài chốt riêng rằng `background.js` không được viết tay URL trang chủ e-GP.
- `tests/background-security.test.js` kiểm thêm cả đường thứ hai, không chỉ
  route mặc định.
- `tests/structure.test.js` bỏ qua `tools/`, `scripts/`, `test/`, `dist/` khi
  soi tài nguyên và script inline — các thư mục này không được đóng gói.
- Thêm `tools/test/`: máy chủ e-GP giả lập trả đúng hình dạng dữ liệu thật,
  cùng bốn kịch bản chạy trong Chromium — nạp tiện ích, người dùng mới, đang mở
  sẵn trang e-GP khác, và toàn trình. Chạy được **mà không đụng vào máy chủ
  e-GP thật**.
- Thêm `tools/pack.mjs` đóng gói `.zip` cài được, dùng chung danh sách loại trừ
  với `tests/structure.test.js`.

### Kết quả đo được

| | 4.0.1 | 4.0.2 |
|---|---|---|
| `npm test` | 57/57 đạt | **64/64 đạt** |
| Nạp 16 trang trong Chromium | 0 lỗi | 0 lỗi |
| Người dùng mới bấm Quét | `SUCCESS`, 137 gói | `SUCCESS`, 137 gói |
| Đang mở trang chủ e-GP rồi bấm Quét | `ERROR`, **0 gói** | **`SUCCESS`, 137 gói** |

### Hạn chế còn lại

- Bản giả lập dựng lại đúng hình dạng dữ liệu e-GP nhưng **không** dựng lại
  reCAPTCHA v3, trạng thái phiên hay thay đổi giao diện tương lai. Vẫn cần
  canary trên e-GP thật trước khi triển khai rộng.

## [4.0.1] — 2026-09-02

4.0.1 là bản hợp nhất chọn lọc sau khi đối chiếu 4.0.0 với 3.9.2. Mục tiêu là giữ lớp quyết định, bảo mật và độ tin cậy của 4.0, đồng thời phục hồi các thao tác nghiệp vụ mà 3.9.2 làm tốt hơn. Bản này **không** đưa trở lại cơ chế phát lại nguyên request/header/body cũ có thể chứa token, CAPTCHA, CSRF hoặc dữ liệu phiên.

### Khôi phục và hoàn thiện nghiệp vụ

- Khôi phục liên kết bấm được thật trong báo cáo XLSX bằng phần tử hyperlink và tệp quan hệ OOXML; chỉ tạo liên kết cho URL HTTP(S) hợp lệ.
- Khôi phục mặc định **20 trang mỗi lượt quét**, cho phép chọn 1–40 trang và giải thích rõ rằng hạ giới hạn có thể bỏ sót cơ hội.
- Khi nâng từ cấu hình mặc định 5 trang của nhánh 4.0.0, tự chuyển về 20 trang; các giá trị tuỳ chỉnh khác của người dùng được giữ nguyên.
- Khôi phục bộ lọc **Chỉ gói đạt ngưỡng** trên Dashboard đầy đủ.
- Khôi phục nút xoá từng gói khỏi dữ liệu cục bộ, kèm xác nhận trước khi xoá.

### Dữ liệu một phần và thông báo

- Lượt quét `PARTIAL` được chốt là **Hoàn tất một phần**, không bị nâng sai thành `SUCCESS`.
- Lượt `PARTIAL` vẫn chạy thông báo Desktop, cảnh báo gói điểm cao, Telegram và xuất báo cáo di động nếu người dùng đã bật các đầu ra tương ứng.
- Thông báo Desktop/Telegram của lượt `PARTIAL` ghi rõ dữ liệu chưa đầy đủ và yêu cầu kiểm tra phạm vi còn thiếu.
- Sau một lượt `PARTIAL`, quét khi khởi động có thời gian chờ hai giờ để tránh lặp request mỗi lần mở Chrome; lượt `SUCCESS` vẫn dùng cửa sổ 18 giờ.

### An toàn và độ tin cậy

- Sao lưu an toàn chuyển sang danh sách trắng dữ liệu được phép xuất, loại queue/request lồng, cache và log tích hợp không cần thiết.
- Loại bỏ đường xuất full backup chứa bí mật tích hợp; người dùng phải cấu hình lại Telegram thủ công sau khi nhập.
- Backup an toàn giữ năm mốc Radar gần nhất mỗi gói và bỏ các trường dẫn xuất có thể tính lại để tệp kho tối đa nằm trong giới hạn nhập 30 MB; dữ liệu đang dùng vẫn giữ tối đa 20 mốc.
- Template/request e-GP được scrub cả khi nâng cấp, xuất và nhập; token, CAPTCHA, cookie, header xác thực và dữ liệu phiên không được dùng lại.
- Nhập backup giữ đúng các trạng thái kết thúc như `PARTIAL` và `TIMEOUT`; trạng thái không hợp lệ được xử lý fail-closed thay vì giả thành công.
- Giữ các lớp bảo vệ của 4.0.0: URL/endpoint allowlist, request sanitization, cô lập job/tab, timeout/reconcile, CSP, import không tự bật Telegram hoặc lịch tự động, chuẩn hoá tiền/ngày/từ khoá và sửa tổng hợp liên danh/HHI.
- Nhận active run/lookup bằng claim nguyên tử trong storage để hai thao tác khởi chạy gần nhau không cùng chiếm một job.
- Phân trang chỉ chuyển tiếp sau ACK; trang chưa được xác nhận sẽ retry, còn trang lặp theo `jobId + pageIndex` được xử lý idempotent.
- Timeout chuyển thành lease theo `lastProgressAt` và chỉ gia hạn sau khi trang đã được ghi nhận bền vững.
- Đối soát khi service worker khởi động lạnh; coordinator BBMT chi tiết mất khỏi RAM được chốt an toàn thay vì treo giả.
- Sửa route e-GP mặc định để luôn mở đúng trang tìm kiếm lựa chọn nhà thầu có content bridge.

### Kiểm thử phát hành

- Kiểm tra workbook có quan hệ hyperlink ngoài đúng chuẩn, không chỉ tô xanh/gạch chân chuỗi URL.
- Kiểm tra mặc định/migration 20 trang, lọc đạt ngưỡng, xoá từng gói và hành vi `PARTIAL` trong các đường thông báo/startup.
- Kiểm tra claim nguyên tử, ACK/retry, chống ghi trùng trang, gia hạn lease, cold-start reconcile và route e-GP mặc định.
- Kết quả QA cuối: **57/57 kiểm thử tự động đạt, 0 lỗi, 0 bỏ qua**.

### Hạn chế đã biết

- Chưa chạy E2E bằng Chrome/Chromium thật hoặc đối chiếu trực tiếp phiên e-GP đang vận hành trong môi trường đóng gói; cần pilot/canary trước khi triển khai rộng.
- Luồng quét chi tiết BBMT kết thúc an toàn nếu service worker bị dọn, nhưng chưa tự tiếp tục từ đúng cursor; người dùng cần chạy lại.
- Không có OpenAI/AI tạo sinh trong phiên bản này. Nếu bổ sung, API key phải nằm ở backend có kiểm soát quyền, redaction, quota/chi phí và audit; không đặt key trong extension trình duyệt.

## [4.0.0] — 2026-09-02

Phiên bản 4.0.0 là đợt nâng cấp về quy trình ra quyết định, độ tin cậy dữ liệu, an toàn tích hợp và khả năng kiểm thử. Phần mềm vẫn cần canary trực tiếp trên e-GP trước khi triển khai rộng.

### Thêm mới

- Dashboard điều hành gồm:
  - số cơ hội đang mở;
  - số cơ hội phù hợp;
  - số cơ hội khẩn cấp còn tối đa 3 ngày và đạt ngưỡng điểm;
  - số cơ hội đang ở pipeline hoạt động;
  - thẻ cơ hội ưu tiên số 1;
  - bộ lọc, sắp xếp và phân trang 80 kết quả/lần.
- Pipeline Go/No-Go với sáu trạng thái:
  - `NEW` — Mới phát hiện;
  - `REVIEW` — Đang sàng lọc;
  - `GO` — Quyết định dự thầu;
  - `BID` — Đang lập HSDT;
  - `SUBMITTED` — Đã nộp;
  - `NO_GO` — Không tham gia.
- Lưu người phụ trách, ghi chú nội bộ, thời điểm cập nhật và giữ lại dữ liệu quyết định qua các lần quét.
- Radar thay đổi cho giá gói thầu, hạn đóng thầu, tên gói, địa điểm và chủ đầu tư; giữ tối đa 20 thay đổi gần nhất cho mỗi cơ hội.
- Chỉ số độ đầy đủ dữ liệu dựa trên các trường có thể kiểm tra: mã, tên, giá, hạn/trạng thái kế hoạch, địa điểm, đơn vị và liên kết chính thức.
- Nhãn dữ liệu: **Dữ liệu tốt**, **Dữ liệu khá**, **Cần xác minh**.
- Cảnh báo có thể kiểm chứng: gần hạn, thiếu trường, trúng từ khoá loại trừ và thiếu liên kết chính thức.
- Khuyến nghị hành động tiếp theo theo loại dữ liệu, thời hạn và điểm sàng lọc.
- Các cột quyết định, người phụ trách, ghi chú và lịch sử thay đổi trong báo cáo Excel.
- Bộ nhận diện mới gồm logo SVG/PNG và icon Chrome ở các kích thước tiêu chuẩn.
- Màn hình onboarding giải thích giới hạn của điểm số, độ đầy đủ dữ liệu và yêu cầu kiểm tra nguồn trước quyết định GO.
- Bộ kiểm thử tự động bằng Node.js cho logic nghiệp vụ, manifest/CSP, import/cú pháp, tài nguyên, Excel và liên danh.

### Thay đổi

- Thu hẹp phạm vi content script từ mọi trang e-GP xuống đúng các trang lựa chọn nhà thầu.
- Thay cơ chế phát lại nguyên request cũ bằng quy trình:
  1. trích xuất truy vấn công khai;
  2. loại bỏ token/CAPTCHA/CSRF/phiên và header nhạy cảm;
  3. mở trang e-GP;
  4. để chính trang tạo phiên bảo mật hiện hành;
  5. chỉ chấp nhận endpoint nằm trong allowlist chính xác.
- Chỉ chấp nhận URL nguồn HTTPS thuộc chính xác miền `muasamcong.mpi.gov.vn`.
- Xếp mọi TBMT đang mở (`OPEN`) trước KHLCNT (`PLAN`) trong thứ tự ưu tiên.
- Watchlist tự động theo các trạng thái pipeline đang hoạt động.
- Radar chỉ tạo thay đổi khi cả giá trị cũ và mới đều tồn tại, giảm báo nhầm khi một lần lấy DOM bị thiếu trường.
- Mỗi tác vụ được gắn mã công việc và tab riêng; đóng/huỷ một tab không dừng tác vụ ở tab khác.
- Đánh dấu rõ kết quả phân trang chưa đầy đủ do giới hạn, timeout hoặc huỷ.
- Tệp nhập được giới hạn 15 MB, chuẩn hoá dữ liệu, giới hạn độ dài/số lượng mảng và vô hiệu tích hợp ngoài sau khôi phục.
- Thêm Content Security Policy chặt hơn: chỉ chạy script nội bộ, chặn object, base URI và nhúng frame.
- Khi Chrome hỗ trợ, `chrome.storage.local` chỉ cho trusted contexts truy cập.
- Cập nhật giao diện desktop/mobile, khả năng đọc, trạng thái nút và hiển thị tiến trình.

### Sửa lỗi

- Sửa đếm trùng từ khoá lồng nhau, ví dụ cụm “kênh mương” không còn đồng thời cộng thêm “kênh” nếu cùng một vị trí khớp.
- Sửa phân tách tiền Việt/Anh và số thập phân, gồm các dạng như `3,5 tỷ` và `1.234,56 tỷ`.
- Từ chối ngày không tồn tại như `31/02/2026` thay vì âm thầm chuẩn hoá sang ngày khác.
- Tránh nhận URL HTTP, miền giả mạo gần giống hoặc `javascript:` làm liên kết nguồn.
- Cải thiện nhận diện kết quả trúng thầu theo trạng thái ba giá trị `true/false/null`; không còn coi các từ chung như “đạt” hoặc chỉ có con số là bằng chứng thắng thầu.
- Sửa phân tích liên danh:
  - đếm mỗi gói thầu một lần;
  - không ánh xạ mảng mã số thuế và mảng tên theo vị trí;
  - chỉ dùng tên đã xác minh từ gói độc lập có đúng một mã số thuế;
  - tách giá trị độc lập và liên danh;
  - chỉ tính HHI trên giá trị độc lập, không nhân toàn bộ giá gói cho từng thành viên liên danh.
- Áp dụng cùng cách xử lý liên danh cho hồ sơ chủ đầu tư.
- Giữ cấu trúc dòng tốt hơn khi đọc DOM và kiểm tra đúng trạng thái hiển thị/disabled của nút.
- Tự đối soát và dọn tác vụ mồ côi sau timeout hoặc khi tab đã đóng.

### An toàn và quyền riêng tư

- Allowlist endpoint chỉ cho phép đúng đường dẫn tìm kiếm lựa chọn nhà thầu và đúng phương thức/body dự kiến.
- Loại sâu các trường có tên liên quan đến token, CAPTCHA, CSRF/XSRF, JWT, session, authorization, signature, secret, cookie và password.
- Chỉ chuyển tiếp các header an toàn cần thiết.
- **Sao lưu an toàn** loại Bot Token và Chat ID Telegram.
- **Sao lưu đầy đủ** hiển thị cảnh báo vì có thể chứa bí mật.
- Tệp chẩn đoán che thông tin nhạy cảm và chỉ lưu hình dạng endpoint, không lưu giá trị nghiệp vụ chi tiết.
- Nhập bản sao lưu luôn xoá bí mật Telegram và tắt Telegram, quét tự động, quét lúc khởi động, xuất tự động.
- Khôi phục cài đặt gốc yêu cầu xác nhận hai lần và xoá storage/lịch.

### Kiểm thử

- Bổ sung `npm test` với Node.js 20+.
- Kiểm tra chuẩn hoá văn bản, tiền, ngày, URL, ID và request template.
- Kiểm tra redaction, pipeline, xếp hạng, độ đầy đủ, cảnh báo, Radar, hành động tiếp theo và lọc dữ liệu.
- Kiểm tra manifest, CSP, public key, kích thước icon, cú pháp/import JavaScript, tài nguyên, ID HTML trùng và inline script.
- Kiểm tra xuất XLSX.
- Kiểm tra riêng logic liên danh, chống ánh xạ tên theo vị trí và chống nhân trùng giá trị/HHI.
- Kết quả tại thời điểm bàn giao: **44/44 kiểm thử tự động đạt**, gồm kiểm tra hồi quy đường xuất/nhập/migration backup.

### Hạn chế đã biết

- Bộ kiểm thử tự động không chứng minh tương thích trực tiếp với mọi trạng thái phiên, CAPTCHA hoặc thay đổi tương lai của e-GP.
- Chưa có kiểm thử end-to-end được duy trì trên môi trường e-GP thật.
- Môi trường bàn giao không có Chromium/Chrome nhị phân; chưa chạy được E2E giao diện thật trong lần đóng gói này.
- Quét chi tiết BBMT có timeout bền để không treo, nhưng chưa resume cursor sau khi service worker bị dọn; cần chạy lại tác vụ.
- Chưa có đồng bộ đội nhóm, phân quyền hay mã hoá đầu-cuối cho dữ liệu cục bộ.
- Chưa có parser E-HSMT sinh ma trận tuân thủ kèm trích dẫn tệp/trang.
- Không có OpenAI/AI tạo sinh trong phiên bản này; điểm số là logic xác định cục bộ.
- Phân tích thị trường phụ thuộc vào phạm vi và độ đầy đủ của dữ liệu đã thu thập.
- Telegram và Agent localhost là tích hợp ngoài tuỳ chọn, cần người dùng tự đánh giá rủi ro.

## [3.9.2] — Mốc đối chiếu cho 4.0.1

### Điểm được giữ lại trong 4.0.1

- Báo cáo XLSX có liên kết nguồn bấm được.
- Giới hạn quét mặc định 20 trang, phù hợp hơn cho lượt rà soát rộng.
- Dashboard có bộ lọc chỉ hiển thị gói đạt ngưỡng và thao tác xoá từng gói.
- Bộ nghiệp vụ rộng gồm TBMT, KHLCNT, kết quả, mở thầu, địa bàn, nhà thầu, chủ đầu tư, lịch quét, Telegram và xuất báo cáo.

### Điểm không được hợp nhất nguyên trạng

- Không giữ cơ chế phát lại nguyên request đã bắt vì có thể mang token/CAPTCHA/CSRF/header phiên hết hạn và mở rộng bề mặt rò rỉ.
- Không đánh đổi pipeline Go/No-Go, Radar, độ đầy đủ dữ liệu, trạng thái `PARTIAL`, cô lập job/tab, sửa liên danh/HHI hoặc quy trình backup/import an toàn của nhánh 4.0.

## [3.9.1] — Mốc nền trước 4.0

### Điểm mạnh

- Có bộ tính năng rộng cho nghiệp vụ Việt Nam: TBMT, KHLCNT, kết quả theo mã số thuế, mở thầu/giảm giá và quét địa bàn.
- Có hồ sơ nhà thầu 360, chủ đầu tư, phân tích, bộ lọc lưu, lịch chạy, thông báo Desktop/Telegram và xuất Excel.
- Lấy dữ liệu từ e-GP chính thức và lưu cục bộ, không phụ thuộc máy chủ của nhà phát triển.
- Hữu ích cho doanh nghiệp xây dựng cần gom nhiều công đoạn tra cứu vào một công cụ.

### Vấn đề được xác định

- Dashboard thiên về danh sách hơn là buồng lái ra quyết định.
- Chưa có pipeline Go/No-Go, người phụ trách, ghi chú nội bộ và lịch sử thay đổi có cấu trúc.
- Chưa phân biệt rõ độ đầy đủ dữ liệu với điểm phù hợp; chưa có cảnh báo nguồn/thiếu trường minh bạch.
- Chuẩn hoá tiền/ngày/từ khoá còn trường hợp biên dễ sai.
- Cơ chế phát lại URL/body/header đã bắt có thể hỏng khi token/CAPTCHA/CSRF hết hạn và làm tăng bề mặt tin cậy.
- Content script chạy trên phạm vi e-GP rộng hơn nhu cầu.
- Tác vụ song song và huỷ/đóng tab chưa được cô lập chắc chắn.
- Sao lưu/nhập có thể mang theo bí mật và tự động hoá ngoài ý muốn.
- Phân tích liên danh có nguy cơ nhân trùng giá trị và ghép tên/mã theo vị trí.
- Chưa có bộ kiểm thử hồi quy tự động đủ để chặn lỗi trước phát hành.

Các điểm trên là cơ sở của thiết kế 4.0.0; không phải tuyên bố rằng toàn bộ rủi ro đã được loại bỏ.
