# Báo cáo thẩm định — Giáo Sư Cùi Bắp chạy thẳng trên Safari (iPad / iPhone)

Ngày 10/11/2026 · dựng từ tiện ích 4.21.0 · mã nguồn `safari/` · hướng dẫn dùng: `HUONG-DAN-SAFARI-IPAD.md`

> **Cập nhật 11/11/2026 — bản 4.22.0.** Mục 1 đến 8 là bản thẩm định đầu tiên (4.21.0), giữ nguyên để đối
> chiếu. Phần làm theo bản thẩm định đó, số đo trước/sau, lỗi tự tìm ra ở vòng hai và điểm chấm lại nằm ở
> **mục 9**.

> **Về "tổ thẩm định".** Anh yêu cầu em đóng vai một tổ chuyên gia xét duyệt lại phần mềm. Em đã làm đúng việc
> của một tổ như vậy — soát lại kiến trúc, đọc lại từng tệp, dựng thêm tình huống xấu, đo bằng nhân Safari —
> và tìm ra 14 lỗi của chính bản em viết; máy kiểm thử tự động (CI) bắt thêm lỗi thứ 15 (mục 5). Nhưng nói cho đúng: đây vẫn là **người viết tự soát bài của
> mình**, không thay được một bên thứ ba độc lập, và không thay được **một lần chạy trên iPad thật**.

## 1. Kết luận

**ĐẠT TRONG PHÒNG THÍ NGHIỆM — CHƯA ĐƯỢC KIỂM CHỨNG NGOÀI THỰC ĐỊA.**

- Trên **nhân của Safari (WebKit 2.52.6)**, cỡ màn hình iPad 1024×1366 và iPhone 390×844, với trang muasamcong
  giả lập: **14 kịch bản, 41 phép kiểm, đạt 41/41**. Cả 23 màn hình của tiện ích mở được, không lỗi script.
- Số liệu tìm gói thầu **trùng tuyệt đối** với tiện ích Chrome thật chạy trên cùng dữ liệu: cùng 137 gói e-GP
  báo, cùng 115 gói khớp, cùng **từng mã TBMT**.
- **Chưa chạy trên iPad thật. Chưa chạy với trang muasamcong thật.** Môi trường làm việc không vào được
  muasamcong (trang chặn địa chỉ nước ngoài) và không có thiết bị Apple. Hai điều này quyết định phần mềm có
  dùng được hay không, và em **không biết** kết quả cho tới khi anh chạm dấu trang lần đầu.
- Vì vậy: **đừng coi đây là bản đã sẵn sàng thay máy tính** cho tới khi anh làm xong 5 bước kiểm ở mục F của
  hướng dẫn (khoảng 2 phút). Nếu bước nào không qua, bảng Chẩn đoán cho em đủ thông tin để sửa.

## 2. Yêu cầu của anh và mức đáp ứng

| Anh yêu cầu | Kết quả | Căn cứ |
|---|---|---|
| Chạy **trực tiếp trên Safari** của iPad / iPhone | Đạt (phòng thí nghiệm) | Chạy đúng mã dấu trang trong WebKit ở hai cỡ màn hình. |
| **Không phụ thuộc máy tính**, không quét mã | Đạt | Không có thành phần nào ngoài tab Safari. Bài kiểm thử chặn mọi tên miền khác muasamcong / GitHub / Telegram. |
| **Không qua ứng dụng thứ hai, thứ ba** | Đạt | Chỉ cần Safari có sẵn. Không Expo Go, không App Store, không tài khoản nào. |
| **Đầy đủ nội dung, chức năng** | Đạt 23/23 màn hình, 36/36 hàm `chrome.*`; **3 thứ không thể có trên iPad** (xem dưới) | Bài "mở cả 23 trang" và bài quét hàm `chrome.*` từ mã nguồn. |
| Dữ liệu muasamcong **chính xác tuyệt đối** | Đạt trên dữ liệu thử; **chưa kiểm trên trang thật** | Phần đọc e-GP (`content.js`, `page-hook.js`) được gói **nguyên văn từng ký tự** — có bài kiểm chặn. Đối chiếu từng mã TBMT với Chrome. |
| Kết quả **thật nhanh** | Đạt trên máy chủ thử | Khởi động khoảng 0,5 giây; lượt tìm 3 trang × 50 gói: Safari khoảng 1 giây, Chrome khoảng 4 giây (Safari dùng lại trang e-GP đã dựng sẵn; Chrome mở tab mới). Máy chủ thử trả lời tức thì — trên e-GP thật, thời gian do mạng và e-GP quyết định. |

**Ba thứ không thể có trên iPad, dù làm cách nào bằng dấu trang:**

1. **Tải E-HSMT bằng một nút** và **Link điện thoại** — cần phần mềm cầu nối chạy trên Windows.
2. **Chạy nền 24/7** (bộ săn theo lịch, bản tin 7 giờ sáng khi không mở máy) — Safari dừng mọi thứ khi đóng tab
   hoặc khoá màn hình. Lượt lỡ được chạy bù khi mở lại.
3. **Thông báo đẩy của hệ điều hành** — thay bằng chuông trong thanh của Cùi Bắp.

Phần mềm báo rõ từng thứ này ngay tại màn hình liên quan, không để anh bấm rồi mới biết.

## 3. Cách làm, và vì sao không có cách đơn giản hơn

Lệnh tìm kiếm của e-GP đòi mã reCAPTCHA do **chính trang e-GP** sinh ra; thiếu mã, e-GP trả lỗi 400. Một trang
web riêng hay một app gọi thẳng e-GP đều không có mã đó. Vì vậy mã đọc dữ liệu **phải chạy bên trong trang
muasamcong**. Trên iPad chỉ có ba cách đưa mã vào: **dấu trang** (dùng được ngay, không tốn gì), **tiện ích
Safari** (cần tài khoản Apple Developer 99 USD/năm + máy Mac), **app riêng** (như trên, thêm duyệt App Store).

Bản này dùng dấu trang, và thay vì viết lại phần mềm cho iPad, em dựng một **"trình duyệt tiện ích" thu nhỏ**
ngay trong tab muasamcong — để toàn bộ tiện ích Chrome chạy **nguyên văn**:

```
tab Safari: trang muasamcong
 └─ lớp vỏ (khoảng 1.800 dòng, safari/src)
     ├─ khung NỀN        background.js nguyên văn + chrome.* mô phỏng
     ├─ khung GIAO DIỆN  23 trang của tiện ích, nguyên văn
     └─ khung e-GP ẩn    trang tra cứu / chi tiết THẬT của muasamcong, có content script nguyên văn
```

Lợi ích của cách này: mọi lần tiện ích Chrome được sửa hay thêm tính năng, bản Safari **tự có theo** sau một
lệnh dựng; không có hai bộ mã phải giữ cho khớp. CI chặn mọi lần tệp dựng lệch mã nguồn.

## 4. Bằng chứng kiểm thử

**Môi trường.** WebKitGTK 2.52.6 + WebKitWebDriver (cùng nhân WebKit + JavaScriptCore với Safari; khác phần
vỏ iOS — xem mục 6). Tiện ích Chrome thật chạy trong Chromium làm đối chứng. Máy chủ giả lập e-GP 137 gói.
Proxy ánh xạ tên miền: mọi yêu cầu tới tên miền ngoài danh sách bị từ chối và ghi lại.

**Điểm quan trọng nhất của bộ kiểm thử:** nó chạy **đúng mã dấu trang** anh sẽ cài — dấu trang tự tải tệp từ
"raw.githubusercontent.com" (ánh xạ về máy thử) — chứ không nạp tắt.

| # | Kịch bản | Kết quả |
|---|---|---|
| 1 | **Đầy đủ trên iPad** (17 phép kiểm): đối chứng bằng tiện ích Chrome thật; dấu trang tải + cất bản dự phòng; đủ 36 hàm `chrome.*`; mở 23 trang; tìm bằng giao diện; **trùng từng mã TBMT với Chrome**; tốc độ; mở gói trên e-GP; điều hướng không rời tab; Kế hoạch LCNT; Nhà thầu trúng thầu; Mở thầu (mở trang chi tiết biên bản trong khung ẩn); xuất CSV + e-GP trả tệp PDF; Telegram; chuông thông báo; dữ liệu còn sau khi tải lại; không yêu cầu lạc | 17/17 |
| 2 | e-GP **cấm nhúng khung** (X-Frame-Options: DENY) **và tải lại trang** khi bấm "Tìm kiếm" — Safari 26.2+ | Đạt; bắt đúng địa chỉ đích, không phải đoán |
| 3 | Như trên — **Safari đời cũ** (không có Navigation API) | Đạt; phải nạp địa chỉ suy đoán |
| 4 | e-GP cho nhúng khung + tải lại trang — Safari đời cũ | Đạt; tiêm lại mã vào trang mới |
| 5 | **Chế độ hạn chế** (dùng trang cấp cao nhất) | Đạt |
| 6 | Trang e-GP có **mã chống nhúng khung** — Safari 26.2+ | Đạt; chặn được, phần mềm không bị đóng |
| 7 | e-GP **cấm eval** (Content-Security-Policy) | Đạt; tự chuyển sang script nội tuyến |
| 8 | Nhánh phát triển trên GitHub **bị xoá** | Đạt; tự lấy ở `main` |
| 9 | Người dùng ở **địa chỉ cũ** `muasamcong.mpi.gov.vn` | Đạt; có lời nhắc sang địa chỉ mới |
| 10 | Chạm dấu trang ở **trang chủ** muasamcong | Đạt |
| 11 | Mã chống nhúng khung — **Safari đời cũ** | Đạt; lần chạm thứ hai tự vào chế độ hạn chế |
| 12 | **Mất mạng tới GitHub**: đã từng nạp / chưa từng nạp / có mạng lại | Đạt 3/3 |
| 13 | Mở Cùi Bắp ở **tab thứ hai** | Đạt; tab trước tự dừng, báo rõ |
| 14 | **iPhone 390×844** + cấm nhúng khung + tải lại trang | Đạt; không tràn ngang |

Ngoài ra: **24 bài kiểm thử đơn vị** mới cho bộ dựng, mã dấu trang (chạy thử trong 10 tình huống) và các hàm
phân loại địa chỉ; toàn bộ bộ kiểm thử của kho **890 bài, 0 hỏng** (12 bài chỉ chạy trên Windows), kể cả khi
mã nguồn được lấy về kiểu Windows (CRLF).

## 5. Lỗi tìm ra trong bản đầu — đã sửa hết

Phần này em ghi đủ, vì nó cho anh biết bản đầu **chưa** đạt và soát lại đã có ích thế nào.

| # | Lỗi | Hậu quả nếu không sửa | Sửa |
|---|---|---|---|
| 1 | **Tệp dựng bị `.gitignore` bỏ qua** (`dist/`) | Tệp không bao giờ lên GitHub → dấu trang báo lỗi 404 → **không ai dùng được gì** | Thêm ngoại lệ + bài kiểm chặn |
| 2 | Khung dựng trang e-GP bị WebKit tắt Navigation API | Không bắt được lệnh chuyển trang của e-GP, phải **đoán** địa chỉ trang kết quả | Cho khung đi qua một trang `about:blank` thật trước (đo 4 cách, chọn cách đúng) |
| 3 | Bộ kiểm thử **không thật sự diễn** tình huống "e-GP tải lại trang" | Báo đạt mà chưa hề thử | Sửa trang giả lập cho giống e-GP thật |
| 4 | Bản dự phòng cất bằng Cache API **mất sau khi tải lại trang** | Mất mạng tới GitHub là không chạy được | Chuyển sang IndexedDB |
| 5 | `window.open(…, 'noopener')` luôn trả `null` | Mở trang e-GP thành công vẫn hiện "bị chặn" | Bỏ `noopener`, tự cắt liên hệ sau khi mở |
| 6 | e-GP trả **tệp** (PDF, zip) cho một lệnh chuyển trang | Tệp bị dựng thành "trang" rác, hỏng tab | Nhận biết kiểu nội dung → lưu tệp, giữ trang |
| 7 | Thông báo của tiện ích hiện thành 4 ô **che gần hết màn hình iPhone** | Không dùng nổi trên điện thoại | Gom vào chuông; tối đa 2 ô nổi trên màn hình nhỏ |
| 8 | Số tiền dài làm trang Tìm gói thầu **tràn ngang 24 px** trên iPhone | Phải cuộn ngang | Chỉnh riêng cho bản Safari |
| 9 | **Hai tab** cùng chạy dùng chung một kho | Ghi đè dữ liệu của nhau, mất gói đã lưu | Khoá một-tab (Web Locks) |
| 10 | Tiện ích luôn mở địa chỉ mới (`mof`); người ở địa chỉ cũ (`mpi`) | Mọi trang e-GP bị chặn vì khác nguồn | Đổi địa chỉ về tên miền của tab + lời nhắc |
| 11 | Telegram: Safari phải "hỏi trước" máy chủ khi gửi JSON | Có thể không gửi được | Gửi cùng nội dung dạng biểu mẫu (không cần hỏi trước) |
| 12 | Mã dấu trang có ký tự `#` và chữ có dấu | Safari có thể cắt cụt hoặc làm hỏng khi lưu dấu trang | Chỉ ASCII, không `%` `#` `"` + bài kiểm |
| 13 | Dựng trên Windows và Linux ra **hai tệp khác nhau** (23 tệp của tác giả lưu CRLF) | CI Windows hỏng; không biết tệp nào là đúng | Chuẩn hoá ký tự xuống dòng |
| 14 | Sự kiện "tải xong" đến muộn của trang cũ; tài nguyên phụ treo; tệp rất lớn | Lượt tra cứu chạy sớm hoặc chờ hết hạn; iPad hết bộ nhớ | Ba chốt riêng |
| 15 | **Do CI bắt được sau lần đẩy đầu**, không phải do em soát ra: tab đã nhường quyền cho tab khác mà còn một lượt nạp trang e-GP đang dở thì lượt đó chạy tiếp và **dựng lại một khung** | Tab "đã dừng" vẫn còn một trang e-GP sống ngầm | Dừng là dừng hẳn: huỷ mọi lượt nạp dở, bỏ hẹn giờ, từ chối mở thêm; bài kiểm nay diễn đúng cuộc đua đó (lớp vỏ cũ hỏng 100%, bản sửa đạt 5/5 lần) |

## 6. Rủi ro còn lại — xếp theo mức nghiêm trọng

### R1 · Trang muasamcong thật có thể khác trang giả lập — **CHƯA BIẾT, mức cao**

Trang giả lập do em viết theo hiểu biết của tiện ích về e-GP. Trang thật có thể:

| Khả năng | Triệu chứng anh sẽ thấy | Phần mềm đã có gì |
|---|---|---|
| Cấm chạy mã nạp thêm (CSP chặt) | Hộp "Trang này không cho chạy Cùi Bắp" | Thử đường script nội tuyến. Nếu trang cấm cả `blob:` thì **dấu trang không làm được** — chỉ còn tiện ích Safari. |
| Cấm nhúng khung | Không thấy gì khác | Đã xử lý — cách nạp không phụ thuộc tiêu đề này. |
| Có mã chống nhúng khung | Trang tự tải lại (Safari cũ) | Chặn được trên Safari 26.2+; Safari cũ tự vào chế độ hạn chế. |
| Tường lửa của e-GP chặn yêu cầu lấy trang bằng `fetch` | "Không tải được trang e-GP" → chế độ hạn chế | Chế độ hạn chế. |
| reCAPTCHA chấm điểm thấp cho khung ẩn trên Safari | Lượt tìm báo lỗi 400 / "e-GP từ chối" | **Chưa có cách khắc phục.** Tiện ích Chrome cũng chạy trong tab nền nên em cho là ổn, nhưng **không chắc**. |
| Tên màn hình kết quả khác `render=index` | Chỉ ảnh hưởng Safari cũ + e-GP cấm nhúng: "không mở được màn hình kết quả trong 40 giây" | Thông báo lỗi rõ; không ra số liệu sai. |

**Điểm trấn an duy nhất em dám nói:** trong mọi nhánh hỏng, phần mềm **báo lỗi chứ không trả số liệu sai** —
vì phần đọc và kiểm dữ liệu là mã của tiện ích, không đổi.

### R2 · Safari trên iPad thật khác WebKit trên Linux — **CHƯA BIẾT, mức trung bình**

Cùng nhân, khác vỏ. Chưa kiểm được: dán mã vào dấu trang; Safari chặn cửa sổ bật lên; hộp thoại tải tệp; bàn
phím ảo che ô nhập; bộ nhớ (tệp 2,7 MB + 118 mô-đun + 2–3 trang e-GP cùng mở — iPad đời mới dư sức, iPhone
đời cũ có thể bị Safari đóng tab); cử chỉ vuốt-quay-lại làm rời trang.

### R3 · Dữ liệu nằm chung "nhà" với trang e-GP — **ĐÃ BIẾT, chấp nhận có điều kiện**

Trên Chrome, tiện ích có ngăn dữ liệu riêng mà trang web không đọc được. Bằng dấu trang, phần mềm chạy **như
một phần của trang muasamcong**: mã của trang đó (hoặc kẻ chèn được mã vào trang đó) về lý thuyết đọc được
kết quả tìm, cấu hình và **Bot Token Telegram**. Khuyến nghị: dùng bot Telegram riêng; không đăng nhập tài
khoản nhà thầu khi không cần. Chỉ tiện ích Safari mới gỡ được rủi ro này tận gốc.

### R4 · Phần mềm được tải từ kho GitHub mỗi lần chạm — **ĐÃ BIẾT**

Ưu: tự cập nhật, không phải cài lại. Nhược: ai chiếm được tài khoản GitHub của anh thì chạy được mã trong
tab muasamcong của anh. Khuyến nghị bắt buộc: **bật xác thực 2 bước** cho GitHub.

### R5 · Safari tự dọn dữ liệu — **ĐÃ BIẾT, em không chắc mức độ**

Apple công bố Safari xoá dữ liệu do script lưu của trang web không được dùng trong 7 ngày. Dùng hằng tuần thì
không sao. Em **không chắc** quy tắc này áp dụng chính xác thế nào trên máy anh → nên Sao lưu định kỳ.

### R6 · Không chạy nền — **ĐÃ BIẾT, không khắc phục được bằng dấu trang**

Cần "trạm săn 24/7" thì vẫn phải có máy tính (4.19.0). Hai cách bổ sung cho nhau chứ không thay nhau.

### R7 · e-GP đổi giao diện — **như tiện ích Chrome**

Bản Safari chịu đúng rủi ro của tiện ích, cộng thêm giả định về cách dựng trang trong khung.

## 7. Chấm điểm (thang 10)

| Tiêu chí | Điểm | Lý do |
|---|---|---|
| Kiến trúc | 8,5 | Chạy nguyên văn tiện ích, một nguồn mã; có ba tầng dự phòng. Trừ điểm vì phụ thuộc kỹ thuật dựng trang ít người dùng. |
| Đầy đủ chức năng | 8 | 23/23 màn hình. Thiếu ba thứ iPad không cho phép. |
| Chính xác dữ liệu — phòng thí nghiệm | 9,5 | Trùng từng mã với Chrome; phần đọc không đổi một ký tự. |
| Tốc độ — phòng thí nghiệm | 9 | Khởi động khoảng 0,5 giây; tìm nhanh hơn Chrome nhờ trang dựng sẵn. Chưa đo trên mạng thật. |
| Độ bền trước tình huống xấu | 8 | 13 tình huống xấu được diễn và qua. |
| Bảo mật | 6,5 | Chung nguồn với e-GP; tải mã từ GitHub. Đã chốt phần làm được. |
| Giao diện iPad / iPhone | 7,5 | Vừa màn hình, đã soát ảnh; **chưa có ngón tay thật chạm vào**. |
| Khả năng bảo trì | 8 | CI chặn lệch; 24 bài đơn vị; tài liệu kỹ thuật. |
| **Kiểm chứng thực địa** | **0** | **Chưa chạy trên iPad thật, chưa chạy với muasamcong thật.** |

**Điểm phòng thí nghiệm: 8,1.** Em **không cho điểm tổng**, vì một điểm tổng đẹp sẽ che mất dòng cuối cùng —
dòng quyết định phần mềm có dùng được hay không.

## 8. Việc tiếp theo

1. **Anh:** cài dấu trang (3 phút) và làm 5 bước kiểm ở mục F của hướng dẫn. Không qua bước nào thì gửi em
   bảng Chẩn đoán.
2. **Nếu qua:** một, hai tuần đầu, thỉnh thoảng tìm cùng một tiêu chí trên cả iPad và Chrome để đối chiếu
   con số. Trùng nhau đều thì yên tâm dùng iPad khi đi công trường.
3. **Nếu trang muasamcong không cho dấu trang chạy** (R1, dòng đầu): con đường còn lại là **tiện ích Safari**.
   Phần mã dùng lại được gần hết; cần tài khoản Apple Developer và một máy Mac.
4. **Về lâu dài**, kể cả khi dấu trang chạy tốt, tiện ích Safari vẫn đáng làm: tự chạy khi mở muasamcong, ngăn
   dữ liệu riêng (gỡ R3), không phụ thuộc GitHub lúc chạy (gỡ R4).

## 9. Thẩm định lại sau 4.22.0 (11/11/2026)

Anh yêu cầu: làm hết các khuyến nghị, tự chạy thử ở cỡ iPad, tự chấm, tự sửa cho tới 10/10. Mục này ghi lại
đúng những gì đã làm được, đo được, và những gì **không** đạt được.

**Cách chạy thử.** Em không có iPad và không vào được muasamcong thật. "Chạy thử trên iPad" ở đây là: chạy đúng
mã dấu trang trong **WebKit 2.52.6** (nhân của Safari) ở khung nhìn iPad 820×1180 / 1024×1366 và iPhone 390×844,
bật cờ màn cảm ứng, với trang muasamcong **giả lập**. Đó là phòng thí nghiệm, không phải thiết bị thật.

### 9.1 Chín nhược điểm — đã xử lý thế nào

| # | Nhược điểm (4.21.0) | Sau 4.22.0 (đo trong phòng thí nghiệm) | Tình trạng |
|---|---|---|---|
| 1 | Lùi trang làm trắng màn hình; lịch sử tab tăng 4 → 31 sau 27 lần đổi màn hình | Lịch sử không tăng; lùi = về màn hình trước của Cùi Bắp; đang mở bảng thì đóng bảng | Sửa xong; **chưa thử trên iPad thật** |
| 2 | Nút 32–33 px, tên gói 23 px, ô So sánh 12×12 px | **0 chỗ bấm dưới 44 px** trên 24/24 màn hình, cả iPad và iPhone, kể cả khi mở danh mục và mọi khối thu gọn; vẫn 0 ở cỡ hiển thị 145% (iPad) và 130% (iPhone) | Sửa xong |
| 3 | Thẻ gói 521 px (iPad), 842 px (iPhone); Kho gói dài 31,5 / 67,6 màn hình | Thẻ **360 px / 470 px**; Tìm gói 15,9 → 8,7 màn hình (iPad), 36,5 → 16,4 (iPhone); Kho gói **7,2 / 16,2** màn hình; 20 gói một trang | Sửa xong |
| 4 | Giờ đóng thầu chỉ có trong chú thích rê chuột | Ghi trên thẻ; chú thích khác chạm là hiện | Sửa xong |
| 5 | Nút E-HSMT, Link điện thoại, Ctrl K, chữ "investField" | Ẩn mục chỉ dùng trên máy tính; đổi câu chữ viết cho Chrome; không còn chữ "Chrome" trong phần hiển thị | Sửa xong |
| 6 | Chữ nhỏ, không có giao diện tối | Cỡ hiển thị 90–145% (iPad mặc định 110%); giao diện tối có bảng màu riêng, thẻ sáng hơn nền | Sửa xong |
| 7 | Không chạy nền, không có thông báo của iPad | Giữ máy thức; mở lên chạy bù bộ săn, bản tin, sao lưu, kiểm tra đối thủ | **Mới giảm nhẹ.** Chạy nền thật cần tiện ích Safari chính thức |
| 8 | Dữ liệu chỉ nằm trong Safari của một máy | Sao lưu tự động lên Telegram mỗi ngày; nhập lại bằng một nút (đã thử gửi rồi nhập lại chính tệp đó) | Sửa xong phần sao lưu; **chưa có đồng bộ giữa các máy** |
| 9 | Máy anh chạy thẳng mã em đang làm dở | Kênh ổn định; có bản mới thì hỏi; quay về bản trước; tự cứu khi lần mở dở dang | Sửa xong. Bật xác thực hai bước GitHub là việc của anh |

### 9.2 Mười tính năng đề xuất — đã có gì

| # | Tính năng | Tình trạng |
|---|---|---|
| 1 | AI đọc, tóm tắt E-HSMT | **Có, qua cầu nối**: phần mềm soạn câu lệnh, anh hỏi ChatGPT/Gemini, dán câu trả lời. **Chưa có** bản gọi AI ngay trong phần mềm (cần khoá API trả phí) |
| 2 | Bảng đối chiếu yêu cầu ↔ năng lực | **Có**: tài chính và hợp đồng tương tự so bằng số; nhân sự, thiết bị đặt cạnh dòng đã khai để người phụ trách so |
| 3 | Go/No-Go theo lịch sử | **Có**: số nhà thầu dự, tỷ lệ một nhà thầu, mức giảm của người trúng, đối thủ hay gặp, lịch sử của công ty. **Không** đưa "xác suất thắng" — dữ liệu không đủ cơ sở cho một con số như vậy |
| 4 | Báo trước gói lặp lại, hợp đồng sắp hết hạn | **Có** phần gói lặp lại. **Không có** phần hợp đồng sắp hết hạn (không đọc được thời hạn hợp đồng) |
| 5 | Cảnh báo đối thủ | **Có**: "trúng" tra thẳng e-GP theo mã số thuế; "dự thầu" chỉ biết với gói đã đọc biên bản mở thầu |
| 6 | Tìm bằng câu thường | **Có** |
| 7 | Báo cáo PDF một chạm | **Có** bốn loại báo cáo. Trên iPad là hai chạm: mở bản in rồi Chia sẻ → In |
| 8 | Email và nhóm chat | **Có** nhóm Telegram. **Không có** email tự động (cần máy chủ) |
| 9 | Nhiều tài khoản, phân quyền | **Chưa** (cần máy chủ). Có ô "Người phụ trách" từng gói |
| 10 | App màn hình chính, xem khi mất mạng | **Chưa** cho bản Safari (cần địa chỉ cố định — đang chờ token Cloudflare) |

### 9.3 Lỗi tự tìm ra ở vòng hai

Các lỗi này do chính bộ kiểm thử mới và lượt soát ảnh chụp bắt được, trước khi đưa lên kênh ổn định:

1. Câu "tìm các gói xây lắp…" để sót chữ **"các"** thành từ khoá.
2. Tên gói trong danh sách động thái đối thủ cao **43 px** — thiếu 1 px so với chuẩn chạm.
3. Giao diện tối: thẻ **đen tuyền**, tối hơn cả nền trang (màu trắng viết cứng bị đảo). Nay thẻ lấy màu của bảng
   màu tối.
4. Thẻ Kho gói dùng emoji, đổi màu lạ khi bật giao diện tối. Nay dùng bộ biểu tượng nét của phần mềm.
5. Màn cảm ứng: bấm Tìm xong **không thấy gì đổi** vì dải tiến độ nằm dưới màn hình. Nay trang tự cuộn tới.
6. Chrome 1366×768: thêm hai mục làm thanh trái **dài hơn màn hình 9 px**. Đã siết khoảng cách.
7. iPhone cỡ 130%: trang Kiểm tra dữ liệu **tràn ngang 4 px** vì một mã dài không xuống dòng.
8. Một chú thích trong mã bị bộ soát `chrome.*` hiểu nhầm là lời gọi API.
9. Phép kiểm bản in của chính em đọc nhầm bảng kiểu thành nội dung (lỗi của bài kiểm, không phải của phần mềm).
10. iPad cỡ 1024 px (có thanh trái): nút "Hồ sơ quyết định" mới thêm làm hàng nút của thẻ xuống dòng, thẻ gói
    cao lại thành **440 px** (ngưỡng đặt ra là 400). Thẻ thu gọn nay ghi nhãn ngắn "Quyết định"; đo lại 388 px.
11. **Lỗi có từ 4.21.0, bộ kiểm thử trên GitHub bắt được ngay trước khi phát hành** (bản Chrome trên máy tính,
    trang "Link điện thoại"): gõ sai mã ghép địa chỉ cố định thì dòng "Mã ghép nối không đúng" **hiện chưa tới 2
    giây rồi biến mất** — trang tự làm mới 2 giây một lần và nhịp làm mới ghi đè dòng báo lỗi (đo: 1,78 giây; trên
    GitHub có lượt mất trước khi kịp nhìn thấy, làm bài kiểm đỏ ở 2/2 lượt chạy). Nay dòng báo lỗi giữ tới lần
    bấm "Ghép nối" kế tiếp. Bài kiểm đầu-cuối được thêm đúng phép này (chờ hơn một nhịp làm mới rồi mới đọc):
    chạy với mã cũ thì hỏng, với mã mới thì đạt.

Mười một lỗi trên đã sửa và có phép kiểm giữ lại.

**Hai chốt chặn thêm trước khi phát hành.** Dấu trang nạp một tệp duy nhất: một dòng cú pháp mà Safari trên máy
anh chưa hiểu là cả tệp không chạy, kể cả phần "hỏi trước khi cập nhật". Bộ thử của em dùng nhân Safari đời mới
nên không bắt được loại lỗi này. Vì vậy em thêm: (1) `tools/test/cu-phap-safari.mjs` — phân tích 139 tệp JS
được gói, tệp gói và bản ổn định ở mức ES2023 (mức Safari 16.4 hiểu trọn), chạy trên CI; (2)
`tests/safari-toi-thieu-422.test.mjs` — danh sách cấm 22 nhóm hàm và 11 tính năng CSS chỉ có ở Safari mới hơn
16.4. Kết quả lần soát này: **không thấy chỗ nào**. Giới hạn: đây là soát tĩnh trên mã; em không có iPad đời
16.4 để chạy thật, và số phiên bản trong danh sách ghi theo hiểu biết của em. **Một việc em chưa giải thích được:** bước chụp bố cục trong
Chromium (bản Chrome trên máy tính) bị sập trình duyệt thử nghiệm ở 2 trong 6 lần chạy liên tiếp, đúng lúc đang
nạp dữ liệu mẫu, trước khi chụp trang nào; bốn lần còn lại đạt, và khi gắn thêm phần ghi nhận "trang nào sập" thì
không lặp lại được. Em coi đây là lỗi ngẫu nhiên của môi trường thử (kịch bản này vốn có ghi chú về việc trình
duyệt thử nghiệm hay sập), nhưng nói rõ là **chưa tìm ra nguyên nhân**.

### 9.4 Chấm lại (thang 10)

| Tiêu chí | 4.21.0 | 4.22.0 | Vì sao chưa phải 10 |
|---|---|---|---|
| Tính năng | 8,5 | **9,5** | Thiếu AI gọi thẳng, hợp đồng sắp hết hạn |
| Giao diện | 8,5 | **9** | Trang Kế hoạch còn vài emoji; các trang phân tích đời cũ chưa làm lại bố cục |
| Hợp với màn cảm ứng | 5,5 | **9,5** | Mọi số đo đạt; nhưng **chưa có ngón tay thật** chạm vào |
| Vận hành trên iPad | 5,5 | **7** | Vẫn không chạy nền, không có thông báo của iPad, phải chạm dấu trang mỗi lần mở |
| Bảo mật và an toàn dữ liệu | 6 | **7,5** | Có kênh ổn định và sao lưu; dữ liệu vẫn chung nguồn với trang e-GP, mã vẫn tải từ GitHub |
| Kiểm thử trong phòng thí nghiệm | 9 | **9,5** | 951 bài đơn vị, 80 phép kiểm đầu-cuối đạt hết; nhưng nhân thử là WebKit đời mới (chưa có máy Safari 16.4 thật), và còn một lần trình duyệt thử nghiệm sập chưa giải thích được |
| **Kiểm chứng trên thiết bị thật** | 0 | **3** | Anh xác nhận 4.21.0 chạy được; chưa có bảng Chẩn đoán; **chưa phần nào của 4.22.0 được thử trên iPad thật** |

**Em không chấm 10/10.** Ở những gì đo được trong phòng thí nghiệm, bản 4.22.0 đạt các ngưỡng đã đặt ra. Nhưng
ba thứ quyết định điểm 10 nằm ngoài tầm của bản này:

- **Thử trên iPad thật**: vuốt quay lại, mở tab in, gửi tệp tới Telegram thật, chép câu lệnh bằng một chạm.
- **Chạy nền và thông báo của iPad**: cần tiện ích Safari chính thức (máy Mac, tài khoản Apple Developer).
- **Nhiều người dùng chung, đồng bộ, email, AI gọi thẳng**: cần máy chủ và khoá API.

### 9.5 Việc cần anh

1. Chạm dấu trang, bấm **Cập nhật ngay**, rồi thử năm việc: vuốt quay lại; **Tuỳ chọn → Tối**; một câu ở ô
   "Tìm bằng câu thường"; **Gửi bản sao lưu ngay**; **In / Lưu PDF** ở một Hồ sơ quyết định.
2. Gửi em bảng **Chẩn đoán** (Chẩn đoán → Chép chẩn đoán) để có số đo thật.
3. Khai ba ô mới ở **Năng lực công ty** để bảng đối chiếu có số.
4. Nếu muốn các phần còn thiếu: quyết định về token Cloudflare (đồng bộ, app màn hình chính), khoá API AI, và
   tài khoản Apple Developer.

