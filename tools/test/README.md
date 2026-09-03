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
