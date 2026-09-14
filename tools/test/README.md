# Bộ kiểm thử

Các bài kiểm tra chạy bằng Chromium thật, trên máy thường, mà **không đụng vào
máy chủ e-GP thật**. Chúng bù cho chỗ `npm test` không với tới: `npm test` chỉ
chạy logic thuần trong `lib/`, không nạp `background.js`, nên những lỗi kiểu
"biến chưa khai báo" hay "giao diện gửi thứ tầng nền không nhận" chỉ lộ ra ở đây.

## Chuẩn bị (làm một lần)

```bash
npm install -D playwright
npx playwright install chromium
```

## 1. Nạp tiện ích, kiểm tra mọi trang

```bash
node tools/test/load-test.mjs
```

Nạp tiện ích vào Chromium, mở lần lượt 16 trang giao diện, gom mọi lỗi console
và lỗi tải tài nguyên. Kết quả mong đợi: `LỖI (0)`.

## 2. Kịch bản người dùng mới (chưa lưu bộ lọc)

```bash
# cửa sổ 1
node tools/test/mock-egp.mjs
# cửa sổ 2
node tools/test/no-template.mjs
```

Mô phỏng đúng việc đầu tiên một người dùng mới làm: cài xong, bấm ngay
**Quét e-GP ngay** khi chưa lưu bộ lọc nào. Kết quả mong đợi: `SUCCESS`, lấy
được **137 gói**, và tab e-GP dừng ở trang `contractor-selection`.

Đây là bài bắt được lỗi hồi quy của 4.0.0: tab mở `/web/guest/home`, nơi
content script không còn chạy, nên lượt quét chết với thông báo tiếng Anh
`Could not establish connection. Receiving end does not exist.`

## 3. Kịch bản đang mở sẵn một trang e-GP khác

```bash
# cửa sổ 1
node tools/test/mock-egp.mjs
# cửa sổ 2
node tools/test/open-tab.mjs
```

Người dùng đang xem **trang chủ e-GP** — chuyện rất bình thường — rồi bấm
**Quét e-GP ngay**. Kết quả mong đợi: `SUCCESS`, **137 gói**.

Đây là đường hỏng THỨ HAI, cùng gốc với bài số 2 nhưng không được sửa cùng
lúc: 4.0.1 sửa route mặc định nhưng `prepareScanTabFor()` vẫn tái dùng tab
e-GP đang mở nguyên trạng, kể cả khi trang đó không có content script.

## 4. Chạy toàn trình với e-GP giả lập

```bash
# cửa sổ 1
node tools/test/mock-egp.mjs

# cửa sổ 2
node tools/test/e2e.mjs
```

`mock-egp.mjs` dựng một máy chủ HTTPS trả về **đúng hình dạng dữ liệu** của
`muasamcong.mpi.gov.vn` (137 gói thầu mẫu, phân trang kiểu `page.content` /
`totalPages` / `totalElements`). `e2e.mjs` trỏ tên miền e-GP về máy chủ đó bằng
`--host-resolver-rules`, rồi chạy nguyên luồng thật:

```
trang e-GP → page-hook.js → content.js → background.js → kho dữ liệu → popup
```

Kết quả mong đợi: lấy đủ **137/137 gói**, popup hiển thị 137 thẻ, `LỖI (0)`.

Thử cảnh báo cắt cụt:

```bash
CAP=3 node tools/test/e2e.mjs
```

Phải thấy thông báo `CHƯA LẤY HẾT: mới quét 3/14 trang…` chứ không phải
"Đã quét xong".

### Chứng thư số cho máy chủ giả lập

`mock-egp.mjs` cần `tools/test/certs/{key,cert}.pem`. Tự tạo:

```bash
mkdir -p tools/test/certs
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout tools/test/certs/key.pem -out tools/test/certs/cert.pem \
  -days 365 -subj "/CN=muasamcong.mpi.gov.vn" \
  -addext "subjectAltName=DNS:muasamcong.mpi.gov.vn"
```

Chứng thư tự ký này chỉ dùng cho máy chủ giả lập trên `127.0.0.1`, và trình
duyệt kiểm thử được chạy riêng với `--ignore-certificate-errors`. **Không**
commit thư mục `certs/`.

## 5. Đo tốc độ đọc biên bản

```bash
# cửa sổ 1
node tools/test/mock-egp.mjs
# cửa sổ 2
node tools/test/speed.mjs
```

Máy chủ giả lập dựng cả trang chi tiết biên bản, trong đó **một phần gói cố ý
không phát request nhà thầu** — đúng tình huống làm bản trước nằm chết 20 giây
mỗi gói. Kết quả mong đợi: khoảng **2,5 giây/gói**. Nếu thấy khoảng 10 giây/gói
nghĩa là mốc "trang đã tải xong" đã hỏng.

## 6. Kiểm tra tệp Excel xuất ra

```bash
node tools/test/xlsx-test.mjs      # ghi /tmp/t1.xlsx và /tmp/t2.xlsx
```

Đối chiếu bằng Python (nếu có):

```bash
python3 -c "
import openpyxl
wb = openpyxl.load_workbook('/tmp/t1.xlsx'); ws = wb.active
print('sheets', wb.sheetnames)
print('hyperlinks', [(c.coordinate, c.hyperlink.target) for r in ws.iter_rows() for c in r if c.hyperlink])
"
```

Kết quả mong đợi: mở được, số tiền là **số thật** (không phải chữ), phần trăm
lưu dạng phân số (2,76% → `0.0276`), và cột *Link e-GP* có **siêu liên kết
bấm được**.

## 7. Lọc theo ngày ở màn hình Kế hoạch lựa chọn nhà thầu

```bash
# cửa sổ 1
node tools/test/mock-egp.mjs
# cửa sổ 2
node tools/test/plans-e2e.mjs
```

Máy chủ giả lập trả 60 kế hoạch `es-plan-project-p`, một nửa phê duyệt
**20/11/2025** — đúng thứ lẫn vào kết quả mà người dùng than phiền. Quan trọng:
máy chủ giả lập **cố tình bỏ qua** bộ lọc thời gian, đúng như e-GP thật bỏ qua
lặng lẽ filter nó không hiểu. Nhờ vậy bài này chứng minh được thứ bảo đảm kết
quả là lớp lọc lại **tại chỗ**, chứ không phải bộ lọc gửi lên máy chủ.

Kết quả mong đợi: cả 5 dòng soát lại đều `ĐẠT` — không lọc thì có kế hoạch
2025 lẫn vào, lọc rồi thì `theo năm` chỉ còn `2026`, và có đếm số kế hoạch bị
loại vì ngày.

Đây là bài bắt được `fromDate is not defined` (bộ lọc làm chết cả lượt tra) và
lỗi `days` bị rơi lặng lẽ khiến mốc "3 tháng gần đây" không lọc gì cả.

## 8. Khối chọn ngày trên giao diện

```bash
node tools/test/bidopen-ui.mjs   # trang Gói đang chờ kết quả
node tools/test/plans-ui.mjs     # trang Kế hoạch lựa chọn nhà thầu
```

Không cần máy chủ giả lập. Kiểm rằng hai ô *Từ ngày / Đến ngày* chỉ hiện khi
chọn *"Tự chọn khoảng ngày"*, tự điền sẵn giá trị hợp lý, và payload gửi đi
đúng khoá. Kết quả mong đợi: `LỖI (0)`.

## 9. Kích thước cửa sổ popup

```bash
node tools/test/popup-size.mjs    # chiều rộng
node tools/test/popup-jump.mjs    # có nhảy khi nạp dữ liệu không
```

Không cần máy chủ giả lập.

Người dùng báo: bấm vào biểu tượng tiện ích thì popup hiện ra **hẹp như sợi
chỉ**, chữ vỡ dòng từng từ, nội dung nhảy loạn *"như tự động chạy"*.

Nguyên nhân là `body{max-width:100vw}`. Cửa sổ popup của Chrome **tự co theo nội
dung**, nên `100vw` tạo ra vòng lặp tự bóp: thân co lại → cửa sổ co theo →
`100vw` nhỏ đi → thân co tiếp. Thêm một bẫy nữa: `100vw` **tính cả thanh cuộn
dọc**, nên body luôn thừa ra đúng bề rộng thanh cuộn và đẻ thêm một thanh cuộn
ngang không ai cần.

`popup-size.mjs` khoá lại hai mặt: thân **không được co** theo cửa sổ dù hẹp đến
đâu, và ở bề rộng Chrome thật sự cấp cho popup thì **không sinh thanh cuộn
ngang**. Kết quả mong đợi: `KẾT LUẬN: ĐẠT`. Thử khôi phục `max-width:100vw` thì
ba dòng đầu phải báo `✗ BỊ BÓP`.

`popup-jump.mjs` nạp sẵn **3000 gói thầu** — đúng lượng dữ liệu trên máy người
dùng — rồi đo kích thước mỗi 180ms. Kết quả mong đợi: `Số lần đổi kích thước: 0`
và `Chiều rộng có đổi không: KHÔNG`.

## 10. Canary sống — đối chứng với e-GP THẬT

Đây là kịch bản **duy nhất** đụng tới dữ liệu thật, và nó **không chạy trong
Node**. Node không có token của trang e-GP nên không gọi được endpoint tìm kiếm;
canary phải chạy trong tiện ích, trên chính trang e-GP.

### Chạy

1. Mở e-GP, đăng nhập như bình thường.
2. Mở tiện ích → **Chẩn đoán** → **"Chạy canary sống"**.
3. Bấm **Lưu kết quả** → đặt `canary-result.json` vào **gốc kho mã**.
4. `npm test` đọc tệp đó (`tests/canary-gate.test.js`).

**Chạy sau 22h giờ Việt Nam.** e-GP là hệ thống công; đừng thêm tải vào giờ hành
chính khi các đơn vị đang nộp hồ sơ. `inCanaryWindow()` trong
`lib/canary-live.js` giữ khung 22h–5h.

### Nó canh gì

| Hỏng | Mã trạng thái | Vì sao nguy hiểm |
|---|---|---|
| Trường biến mất | `FIELD_LOST` | Mã từng trả `bidPrice` mà nay không còn. Phần mềm vẫn chạy, chỉ là cột giá trống. |
| Mã biến mất | `GONE` | e-GP không trả bản ghi nào cho mã từng tra được. |
| Mã địa bàn trôi | `AREA_DRIFT` | Lâm Đồng phải giữ cả `68` lẫn `703`. Mất `703` là **bỏ sót lặng lẽ** toàn bộ hồ sơ trước 1/7/2025 — không ai thấy bằng mắt. |

Chuỗi `'null'` mà e-GP gửi cho trường trống được tính là **trường mất**, không
phải trường có giá trị. Đây đúng lỗi đã gặp ở gói chỉ định thầu.

### Cổng chặn bản dựng

| Tình huống | Kết quả |
|---|---|
| Vừa chạy, sạch | `PASS` |
| Có `FIELD_LOST` / `GONE` / `AREA_DRIFT` | **`BLOCK`** |
| Kết quả quá 10 ngày | **`BLOCK`** — canary cũ không nói được gì về e-GP hôm nay |
| Không ghi thời điểm chạy | **`BLOCK`** |
| Chưa chạy lần nào | `WARN` — in to, không chặn |

Chưa chạy lần nào mà chặn thì không ai cài được phần mềm lần đầu, và người ta sẽ
học cách bỏ qua bài thử. Bài thử bị bỏ qua thì bằng không có.

### Hiện trạng, nói thẳng

Danh sách trong `lib/canary-live.js` mới có **9 mã**, yêu cầu là 20–30. Mỗi mã
ghi rõ `source`:

- `observed` (4 mã) — đã đọc được trên e-GP thật, có ghi chú kèm.
- `candidate` (5 mã) — lấy từ kết quả tìm kiếm, **chưa mở chi tiết xác nhận**.

Phần tra từng mã **chưa tự động**: màn hình Chẩn đoán hiện `0/9 — chưa tự động`
và `evaluateLiveCanary()` trả `ok:false` khi chưa đối chứng đủ danh sách. Nó
không báo đạt cho phần chưa làm. Phần bất biến mã địa bàn thì đã tự động đầy đủ.

Khi danh sách đủ 20 mã, xoá bài `'danh sách mã chưa đủ 20'` trong
`tests/canary-live.test.js` và nâng ngưỡng ở bài trên nó lên 20.
