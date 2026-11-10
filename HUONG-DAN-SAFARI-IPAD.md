# Cùi Bắp chạy thẳng trên Safari của iPad / iPhone — không cần máy tính

**Điểm mới.** Toàn bộ phần mềm Giáo Sư Cùi Bắp (đủ 23 màn hình: Tìm gói thầu, Kế hoạch LCNT, Mở thầu, Nhà
thầu trúng thầu, Kho gói đã lưu, Bộ săn, Phân tích, Cấu hình…) chạy **ngay trong Safari** trên iPad và iPhone.

- Không cần máy tính công ty đang bật. Không quét mã QR. Không cài thêm app nào.
- Dữ liệu vẫn do **chính trang muasamcong** trả về cho máy của anh, đúng cơ chế của tiện ích trên Chrome —
  không đi qua máy chủ trung gian nào.
- Cài **một lần** khoảng 3 phút: thêm một dấu trang vào Safari. Từ đó mỗi lần dùng là **một chạm**.

```
Safari trên iPad ── tab muasamcong.mof.gov.vn ── chạm dấu trang "Cùi Bắp" ──▶ phần mềm hiện ra ngay trong tab đó
```

> **Nói thẳng trước khi anh cài.** Bản này **chưa chạy thử trên iPad thật**, và **chưa thử với trang
> muasamcong thật** — môi trường làm việc của em không vào được muasamcong (trang chặn địa chỉ nước ngoài) và
> em không có iPad. Em đã thử kỹ bằng **nhân của Safari (WebKit)** ở đúng cỡ màn hình iPad và iPhone với một
> trang muasamcong giả lập: 14 kịch bản, 41 phép kiểm, đạt hết (chi tiết ở `BAO-CAO-THAM-DINH-SAFARI.md`).
> Lần chạy đầu tiên trên iPad của anh chính là lần kiểm chứng thật đầu tiên — mục **F** chỉ cách kiểm trong
> 2 phút và gửi lại cho em nếu có gì không ổn.

## A. Cài một lần (khoảng 3 phút)

### Bước 1 — Chép mã dấu trang

Chạm nút **chép** ở góc khối mã dưới đây (hoặc nhấn giữ → Chọn tất cả → Sao chép). Mã dài một dòng, bắt đầu
bằng `javascript:` — phải chép **đủ từ đầu đến cuối**.

```
javascript:void(function(){var w=window,d=document,U=['https://raw.githubusercontent.com/Giaosucuibap/T-m-Th-u/claude/procurement-search-extension-au3o5u/safari/dist/cuibap.js','https://raw.githubusercontent.com/Giaosucuibap/T-m-Th-u/main/safari/dist/cuibap.js'];if(w.__GSCB_SAFARI__){w.__GSCB_SAFARI__.show();return}if(!/^muasamcong\.(mof|mpi)\.gov\.vn$/.test(location.hostname)){if(confirm('C\u00f9i B\u1eafp ch\u1ea1y tr\u00ean trang muasamcong. B\u1ea5m OK \u0111\u1ec3 m\u1edf trang \u0111\u00f3; m\u1edf xong th\u00ec ch\u1ea1m l\u1ea1i d\u1ea5u trang n\u00e0y.'))location.href='https://muasamcong.mof.gov.vn/vi/web/guest/contractor-selection?render=search';return}if(w.__GSCB_LOADING__)return;w.__GSCB_LOADING__=1;var b=d.createElement('div');b.style.cssText='position:fixed;left:0;right:0;top:0;z-index:2147483647;background:rgb(15,118,110);color:white;font:600 16px -apple-system,system-ui,sans-serif;padding:14px 16px;text-align:center';b.textContent='\u0110ang n\u1ea1p Gi\u00e1o S\u01b0 C\u00f9i B\u1eafp\u2026';d.documentElement.appendChild(b);function bad(e){w.__GSCB_LOADING__=0;b.style.background='rgb(185,28,28)';b.textContent='Kh\u00f4ng n\u1ea1p \u0111\u01b0\u1ee3c C\u00f9i B\u1eafp ('+(e&&e.message||e)+'). Ki\u1ec3m tra m\u1ea1ng r\u1ed3i ch\u1ea1m l\u1ea1i d\u1ea5u trang.';setTimeout(function(){b.remove()},9000)}function run(t,u,c){b.remove();w.__GSCB_LOADING__=0;w.__GSCB_SRC__={ref:u,cached:!!c,text:c?null:t};try{(0,eval)(t)}catch(e){if(w.__GSCB_SAFARI__)throw e;var s=d.createElement('script');s.textContent=t;d.documentElement.appendChild(s);s.remove();if(!w.__GSCB_SAFARI__)alert('Trang n\u00e0y kh\u00f4ng cho ch\u1ea1y C\u00f9i B\u1eafp: '+e.message)}}function old(){return new Promise(function(y,n){try{var q=indexedDB.open('gscb-safari');q.onupgradeneeded=function(){q.transaction.abort()};q.onerror=function(){n(q.error)};q.onsuccess=function(){try{var g=q.result.transaction('goi').objectStore('goi').get('js');g.onsuccess=function(){y(g.result||null)};g.onerror=function(){n(g.error)}}catch(e){n(e)}}}catch(e){n(e)}})}function net(i){return fetch(U[i],{cache:'no-cache'}).then(function(r){if(!r.ok){if(i+1<U.length)return net(i+1);throw new Error('HTTP '+r.status)}return r.text().then(function(t){if(t.indexOf('__GSCB_SAFARI__')<0)throw new Error('tep hong');return[t,U[i]]})})}net(0).then(function(x){run(x[0],x[1])},function(e){old().then(function(t){if(t)run(t,'ban luu san',1);else bad(e)},function(){bad(e)})})})()
```

(Mã này cũng nằm trong kho, tệp `safari/dist/dau-trang.txt`.)

### Bước 2 — Tạo một dấu trang tên "Cùi Bắp"

1. Mở **Safari**, vào trang bất kỳ, ví dụ `muasamcong.mof.gov.vn`.
2. Chạm nút **Chia sẻ** (ô vuông có mũi tên lên) → **Thêm dấu trang** (Add Bookmark).
3. Đặt tên **Cùi Bắp**. Ở mục **Vị trí**, chọn **Mục ưa thích** (Favorites). Chạm **Lưu**.

### Bước 3 — Thay địa chỉ của dấu trang bằng mã vừa chép

**Trên iPad:**

1. Chạm nút **thanh bên** (góc trên bên trái) → **Dấu trang** → **Mục ưa thích**.
2. Chạm **Sửa** (Edit) ở góc dưới → chạm dòng **Cùi Bắp**.
3. Ô thứ hai là **địa chỉ**: xoá hết, rồi nhấn giữ → **Dán**. Chạm **Xong**.

**Trên iPhone:**

1. Chạm biểu tượng **quyển sách** ở thanh dưới → thẻ **Dấu trang** → **Mục ưa thích**.
2. Chạm **Sửa** → chạm dòng **Cùi Bắp** → xoá hết ô địa chỉ → **Dán** → **Xong**.

### Bước 4 (iPad, nên làm) — Hiện dấu trang ngay dưới thanh địa chỉ

**Cài đặt → Ứng dụng → Safari → Hiển thị thanh mục ưa thích**: bật. Từ giờ chữ **Cùi Bắp** luôn nằm ngay dưới
thanh địa chỉ của Safari. (Trên iPhone: chạm vào thanh địa chỉ, **Cùi Bắp** hiện trong lưới Mục ưa thích.)

## B. Dùng hằng ngày

1. Mở Safari, vào **muasamcong.mof.gov.vn** (trang nào của muasamcong cũng được; anh có thể lưu luôn trang đó
   làm một dấu trang thứ hai, đặt cạnh "Cùi Bắp").
2. Chạm **Cùi Bắp**. Dòng xanh "Đang nạp Giáo Sư Cùi Bắp…" hiện ra một, hai giây rồi phần mềm phủ lên trang.
3. Dùng như trên máy tính: **Tìm gói thầu**, chọn tỉnh, lĩnh vực, bấm **Tìm gói thầu**…

Nếu anh chạm **Cùi Bắp** khi đang ở trang khác (báo, Google…), nó hỏi "mở trang muasamcong?". Bấm **OK**, chờ
trang mở xong rồi **chạm lại** dấu trang.

**Mỗi lần mở lại Safari hoặc tải lại trang thì chạm dấu trang một lần** — Safari không cho trang web tự khởi
động phần mềm. Dữ liệu đã lưu (kết quả, gói theo dõi, cấu hình) vẫn còn nguyên.

### Thanh trên cùng của Cùi Bắp

| Nút | Để làm gì |
|---|---|
| **◀** | Quay lại màn hình trước của Cùi Bắp. |
| Ô trạng thái | **Đã nối e-GP** (xanh) là sẵn sàng. Vàng: đang mở trang e-GP. Cam: có ghi chú lỗi — bấm Chẩn đoán. |
| **Chuông + số** | Các thông báo của phần mềm (nhắc hạn bảo đảm dự thầu, gói mới…). Trên Chrome chúng là thông báo của Windows; ở đây gom vào một chỗ để không che màn hình. |
| **Trang e-GP** | Xem tận mắt trang muasamcong thật mà phần mềm đang điều khiển. Chỉ để xem. (iPhone: nút này nằm trong bảng Chẩn đoán.) |
| **Chẩn đoán** | Bảng tình trạng kỹ thuật. Có nút **Chép chẩn đoán** để gửi cho em khi cần. |
| **Ẩn** | Tạm ẩn Cùi Bắp để dùng trang muasamcong như thường. Chạm lại dấu trang để hiện lại — không phải nạp lại. |

Bấm vào **tên gói thầu** thì Safari mở trang gói đó trên e-GP ở **tab mới**; đóng tab đó là về lại Cùi Bắp.

## C. Cái gì dùng được, cái gì không

| Việc | Trên Safari |
|---|---|
| Tìm gói thầu, lọc, chấm điểm, so sánh, lưu gói, ghi chú | **Có**, như trên Chrome. |
| Kế hoạch lựa chọn nhà thầu, Nhà thầu trúng thầu, Mở thầu · chờ kết quả (đọc biên bản) | **Có.** |
| Kho gói đã lưu, Checklist hồ sơ, Phân tích thị trường, Năng lực công ty, Cấu hình | **Có.** |
| Xuất CSV / Excel, sao lưu dữ liệu | **Có.** Safari hỏi thì chọn Tải về; tệp nằm trong app **Tệp › Tải về**. |
| Gửi Telegram (gửi thử, bản tin, cảnh báo) | **Có**, nhưng chỉ khi Cùi Bắp đang mở (xem dòng dưới). |
| Bộ săn tự động, quét theo lịch, bản tin 7 giờ sáng | **Chỉ chạy khi tab muasamcong đang mở và Cùi Bắp đang bật.** iPad khoá màn hình hoặc anh đóng tab thì dừng; lượt lỡ chạy bù khi anh mở lại. Muốn chạy 24/7 vẫn phải dùng máy tính (trạm săn 4.19.0). |
| Thông báo đẩy của hệ điều hành | **Không.** Thay bằng chuông trên thanh của Cùi Bắp. |
| **Tải E-HSMT** bằng một nút | **Không** — nút này cần phần mềm cầu nối chạy trên máy tính Windows. Trên iPad: bấm tên gói để mở trang e-GP rồi tải hồ sơ bằng tay. |
| Link điện thoại (4.20.0 / 4.21.0) | **Không cần nữa** trên máy này — đó là cách cho iPhone mượn máy tính. |

## D. Dữ liệu của anh nằm ở đâu

- Trong **bộ nhớ của Safari trên chính máy này** (IndexedDB của trang muasamcong). Không gửi lên máy chủ nào.
- iPad và máy tính **không tự đồng bộ** với nhau. Muốn chuyển dữ liệu: **Cấu hình → Sao lưu** ở máy này, rồi
  khôi phục ở máy kia.
- **Safari tự dọn dữ liệu của trang web mà lâu ngày anh không mở.** Theo tài liệu của Apple, mốc là 7 ngày
  không dùng trang; em **không chắc** Safari trên máy anh áp dụng chính xác thế nào. Vì vậy: tuần nào cũng dùng
  thì yên tâm; còn trước khi đi công tác dài ngày, hãy **Sao lưu** một lần.
- **Duyệt riêng tư**: dữ liệu mất khi đóng tab. Phần mềm sẽ báo "Dữ liệu chưa lưu được xuống máy".
- **Mỗi lúc chỉ một tab.** Mở Cùi Bắp ở tab thứ hai thì tab trước tự dừng và báo rõ — để hai tab không ghi đè
  dữ liệu của nhau.

## E. Cập nhật

Không phải làm gì. Mỗi lần anh chạm dấu trang, nó tải **bản mới nhất** từ kho GitHub của anh
(`Giaosucuibap/T-m-Th-u`). Mất mạng tới GitHub thì nó chạy **bản đã lưu sẵn trên máy** từ lần trước và báo
"Đang dùng bản lưu sẵn". Mã dấu trang ở Bước 1 không phải cài lại khi có bản mới.

## F. Lần chạy đầu tiên — kiểm trong 2 phút

Đây là lần đầu phần mềm gặp trang muasamcong thật trên iPad thật, nên anh kiểm giúp 5 việc:

1. Chạm dấu trang → phần mềm hiện ra, ô trạng thái chuyển sang **Đã nối e-GP** (thường dưới 10 giây).
2. **Tìm gói thầu** → Tỉnh **Lâm Đồng**, Loại gói **Xây lắp** → **Tìm gói thầu**. Có dòng "e-GP báo … · khớp …"
   và các thẻ gói hiện ra.
3. So nhanh với Chrome trên máy tính, cùng tiêu chí: con số "e-GP báo" và "khớp" phải **bằng nhau** (lệch vài
   gói nếu hai lần tìm cách nhau lâu là do e-GP có gói mới).
4. Bấm tên một gói → mở đúng trang gói đó trên e-GP ở tab mới.
5. Tải lại trang muasamcong, chạm lại dấu trang → lượt tìm vừa rồi vẫn còn trong **Lịch sử tra cứu**.

**Nếu bất kỳ bước nào không đúng:** bấm **Chẩn đoán → Chép chẩn đoán** rồi dán cho em (hoặc chụp màn hình bảng
đó). Bảng ghi đúng những thứ em cần: phiên bản Safari, trang e-GP trả lời thế nào, phần mềm đang ở chế độ nào,
lỗi gì — **không có** mật khẩu hay dữ liệu gói thầu của anh.

## G. Khi gặp trục trặc

| Anh thấy | Nghĩa là | Làm gì |
|---|---|---|
| Thanh đỏ "Không nạp được Cùi Bắp… kiểm tra mạng" | Lần đầu cài mà chưa tải được tệp từ GitHub. | Kiểm tra mạng, chạm lại. Vẫn không được: thử Wi-Fi khác hoặc 4G (có mạng công ty chặn GitHub). |
| Chạm dấu trang mà **không có gì xảy ra** | Mã dấu trang bị chép thiếu, hoặc Safari đã bỏ chữ `javascript:` ở đầu. | Làm lại Bước 1 và 3; kiểm tra ô địa chỉ của dấu trang **bắt đầu bằng** `javascript:void(`. |
| Hộp thoại "Trang này không cho chạy Cùi Bắp" | Trang muasamcong cấm chạy mã nạp thêm. | Gửi em ảnh chụp. Khi đó cách duy nhất là làm **tiện ích Safari** (cần tài khoản Apple Developer). |
| Thông báo **"Đang chạy ở chế độ hạn chế"** | Safari này không dựng được trang e-GP trong khung ẩn. Vẫn tìm được gói, nhưng không đọc được biên bản mở thầu. | Bấm **Ẩn**, bấm **Tìm kiếm** một lần trên trang e-GP cho ra danh sách, chạm lại dấu trang. Và gửi em bảng Chẩn đoán — ở chế độ hạn chế là em cần sửa. |
| "Trang e-GP không mở được màn hình kết quả trong 40 giây" | e-GP chậm hoặc đang lỗi. | Bấm **Trang e-GP** xem trang thật có báo lỗi không; thử lại sau ít phút. |
| "Cùi Bắp đang chạy ở một tab Safari khác" | Anh đã mở Cùi Bắp ở tab khác. | Về tab kia; hoặc tải lại trang này rồi chạm dấu trang để dùng ở đây. |
| "Anh đang ở địa chỉ cũ của e-GP" | Tab đang ở `muasamcong.mpi.gov.vn`. | Chạm **Mở** để sang `muasamcong.mof.gov.vn`, rồi chạm lại dấu trang. |
| Chữ nhỏ / phải cuộn ngang trên iPhone | Vài bảng nhiều cột của phần mềm vốn làm cho màn hình rộng. | Xoay ngang iPhone, hoặc dùng iPad. |

## H. Về an toàn — ba điều anh nên biết

1. **Dấu trang chạy mã lấy từ kho GitHub của anh.** Ai sửa được kho đó thì sửa được phần mềm chạy trong tab
   muasamcong của anh. Hãy bật **xác thực 2 bước** cho tài khoản GitHub và đừng cấp quyền ghi cho người lạ.
2. **Trên Safari, phần mềm nằm chung "nhà" với trang muasamcong** (trên Chrome, tiện ích có ngăn riêng). Nghĩa
   là mã của chính trang muasamcong về lý thuyết đọc được dữ liệu Cùi Bắp lưu trên máy — gồm cả Bot Token
   Telegram nếu anh nhập. Nên dùng **một bot Telegram riêng** cho việc này, và **không đăng nhập tài khoản nhà
   thầu** trong lúc dùng nếu không cần (phần tra cứu không cần đăng nhập).
3. Phần mềm chỉ nói chuyện với: `muasamcong` (dữ liệu), `raw.githubusercontent.com` (tải chính nó),
   `api.telegram.org` (khi anh bật Telegram) và bản đồ nền OpenStreetMap ở trang Địa bàn. Bài kiểm thử chặn mọi
   tên miền khác và xác nhận không có yêu cầu nào đi nơi lạ.

## I. Con đường lâu dài

Dấu trang là cách **duy nhất không cần tài khoản trả phí, không cần máy Mac, dùng được ngay hôm nay**. Hạn chế
gốc của nó: phải chạm mỗi lần mở trang, không chạy nền, chung nhà với trang e-GP. Bản "chính thống" là **tiện
ích Safari** (Safari Web Extension) phát hành qua App Store: tự chạy mỗi khi mở muasamcong, có ngăn dữ liệu
riêng. Việc đó cần tài khoản Apple Developer (99 USD/năm) và một máy Mac để đóng gói — phần mã thì dùng lại
được gần hết từ bản này. Khi nào anh muốn, em làm tiếp.
