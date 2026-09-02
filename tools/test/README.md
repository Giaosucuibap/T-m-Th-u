# Bộ kiểm thử

Ba bài kiểm tra, chạy được trên máy thường mà **không đụng vào máy chủ e-GP thật**.

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

## 2. Chạy toàn trình với e-GP giả lập

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

## 3. Kiểm tra tệp Excel xuất ra

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
