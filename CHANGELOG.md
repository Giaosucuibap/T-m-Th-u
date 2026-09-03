# Nhật ký thay đổi

Tài liệu này ghi lại các thay đổi quan trọng của Giáo Sư Cùi Bắp. Cấu trúc tham khảo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) và phiên bản tuân theo cách đánh số ngữ nghĩa ở mức sản phẩm.

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
