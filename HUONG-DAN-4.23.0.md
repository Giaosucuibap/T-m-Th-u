# Hướng dẫn bản 4.23.0 — Bảng đọc được, ô chọn tỉnh/thành mới

Bản này sửa đúng **hai lỗi anh chụp trên iPad ngày 21/11/2026** và sửa ở **mọi màn hình** chứ không riêng hai
màn hình trong ảnh. Trong lúc rà lại bằng dữ liệu giống thật, em thấy thêm vài chỗ trình bày xấu trên iPad cầm
dọc và trên iPhone, đã sửa luôn — ghi ở mục C.

**Điểm mới, nói ngắn:**

- **Bảng không còn bóp cột tên.** Tên nhà thầu, tên gói nằm gọn trên 2–3 dòng; cột số chỉ rộng bằng con số.
- Bảng nhiều cột **cuộn ngang trong khung riêng**, **cột tên đứng yên** khi cuộn; **chạm tiêu đề cột để sắp xếp**.
- **Ô Tỉnh/thành phố có danh sách riêng**: gõ `dong nai`, `tp`, `hcm`, hay tên tỉnh cũ đều ra, không cần dấu.
- Ô **Xã/phường / Ban QLDA** cũng vậy.
- iPad cầm dọc: biểu mẫu xếp lại hai cột, không còn ô bị cắt chữ. iPhone: bảng thành **thẻ**, không vuốt ngang.

---

## A. Cập nhật trên iPad (30 giây)

Anh **không phải cài lại dấu trang**.

1. Mở Safari vào muasamcong, chạm dấu trang **Cùi Bắp** như mọi ngày.
2. Hộp **"Có bản mới 4.23.0"** hiện ra, kèm vài dòng ghi chú. Bấm **Cập nhật ngay**.
   - Bấm **Để sau** thì bản 4.22.0 chạy tiếp như cũ; 3 ngày sau mới hỏi lại.
3. Muốn quay về bản cũ: **Tuỳ chọn → Phiên bản → Quay về bản 4.22.0**. Dữ liệu giữ nguyên.

Dữ liệu của anh (kho gói, bộ săn, cấu hình, lịch sử) **không đổi** khi cập nhật: bài kiểm thử nâng cấp chạy từ
đúng bản 4.22.0 đang nằm trên iPad của anh lên bản mới và đối chiếu lại lịch sử lượt tìm.

---

## B. Hai lỗi anh báo — nguyên nhân và cách đã sửa

### 1. Cột tên nhà thầu bị bóp, cột số bị phình

**Nguyên nhân (lỗi của em ở bản 4.22.0).** Để chuỗi dài không đẩy trang rộng ra trên máy cảm ứng, bản 4.22.0
cho phép ô bảng **bẻ chữ ở bất kỳ ký tự nào**. Khi bảng 9 cột không vừa màn hình, Safari ép cột nào ép được —
và chỉ còn cột tên ép được, vì các cột số đều cấm xuống dòng. Kết quả đúng như ảnh của anh: cột "Nhà thầu" chỉ
rộng bằng chữ "thầu" ở tiêu đề (59 px), tên 39 ký tự thành 13 dòng; còn "16 / 0" chiếm 157 px.

**Cách sửa.** Không vá riêng bảng đó. Em viết một **bộ dàn cột dùng chung cho mọi bảng** của phần mềm:

| | 4.22.0 (ảnh của anh) | 4.23.0 (đo trong phòng thử, đúng cỡ iPad của anh) |
|---|---|---|
| Cột "Nhà thầu" | 59 điểm | **288 điểm** |
| Tên công ty | 39 ký tự thành 13 dòng, 2–3 chữ cái mỗi dòng | tên 41 ký tự: **2 dòng**; tên 67 ký tự: **3 dòng** |
| Cột "Độc lập / Liên danh" | 157 điểm cho "16 / 0" | **110 điểm** (bằng tiêu đề xuống hai dòng) |
| Bảng không vừa màn hình | cả trang bị đẩy, phải kéo cả trang | **bảng cuộn trong khung riêng, cột tên đứng yên** |

"Cỡ iPad của anh" em lấy từ chính hai ảnh: 2064×2752 điểm ảnh, tức màn hình 1032×1376 điểm (iPad Pro 13 inch), trừ
132 điểm thanh công cụ của Safari. Ảnh đối chiếu trước/sau em gửi kèm.

Cách nó làm việc, để anh biết khi nhìn:

- Cột **ngắn** (số, ngày, mã) rộng đúng bằng nội dung. Tiêu đề dài thì xuống hai dòng chứ không kéo cột rộng ra.
- Cột **chữ dài** (tên nhà thầu, tên gói, chủ đầu tư) được phần rộng nhất, khoảng 40% khung.
- Bảng **vừa** màn hình thì nằm yên như bảng thường. Bảng **không vừa** thì có dòng nhắc nhỏ phía trên:
  *"Bảng 9 cột · vuốt ngang để xem hết · cột "Nhà thầu" luôn hiện"*. Mép phải mờ dần là dấu hiệu còn cột.
- **Chạm tiêu đề cột** để sắp xếp theo cột đó (số: lớn trước; chữ: A → Z); chạm lần nữa để đảo chiều. Ô không
  có số liệu ("—") luôn nằm cuối. Việc này chỉ đổi thứ tự đang hiển thị, không tra lại e-GP.

### 2. Gõ tỉnh Đồng Nai không ra gợi ý

**Danh mục không cũ.** Phần mềm không tự giữ danh sách tỉnh; nó **lấy thẳng từ e-GP**. Trước đây
nhớ lại 30 ngày; từ bản này chỉ nhớ **7 ngày** rồi lấy mới, để tên tỉnh thành đổi thì về máy trong tuần. Danh mục đó đã có **Thành phố Đồng Nai** — trong chính ảnh của anh, thanh trên bàn phím hiện "Thành phố
Bắc Ninh", tức tên mới đã về máy. Đồng Nai thành thành phố trực thuộc trung ương từ 30/4/2026; từ 20/9/2026 cả
nước có 9 thành phố và 25 tỉnh, tổng 34 đơn vị.

**Lỗi thật** nằm ở chỗ các ô này dùng danh sách gợi ý **có sẵn của trình duyệt**. Trên iPad, danh sách đó chỉ
hiện **3 tên** trên thanh bàn phím, không cuộn được, và không hiểu gõ không dấu. Trong ảnh của anh, thanh đó hiện
Bắc Ninh · Cần Thơ · Đà Nẵng — đúng ba thành phố đầu theo thứ tự chữ cái. Tức là Safari mới lọc tới chữ "thành
phố" và **không thu hẹp tiếp** khi anh gõ thêm "đồng"; mỗi lần chỉ có ba chỗ nên Đồng Nai (đứng ngay sau ba tên
đó) không bao giờ tới lượt.

> Em **chưa chắc** một chi tiết: vì sao Safari không thu hẹp tiếp khi anh đã gõ tới chữ "đồng". Em phỏng đoán nó
> không coi "đ" thường và "Đ" hoa là một, nhưng không đọc được mã nguồn Safari để khẳng định. Cách sửa không phụ
> thuộc vào điều này vì đã bỏ hẳn danh sách của trình duyệt.

**Cách sửa.** Mọi ô tỉnh/thành trong phần mềm (11 màn hình) nay dùng **danh sách của chính phần mềm**:

| Anh gõ | Ra |
|---|---|
| `thành phố đồng` (đúng như trong ảnh) | **Thành phố Đồng Nai** đứng đầu, rồi Đồng Tháp, Lâm Đồng |
| `dong nai`, `đồng nai`, `DONG NAI` | Thành phố Đồng Nai |
| `tp` hoặc `thành phố` | đủ 9 thành phố |
| `hcm`, `sg`, `sài gòn` | Thành phố Hồ Chí Minh |
| `bình thuận`, `đắk nông` (tỉnh đã sáp nhập) | **Tỉnh Lâm Đồng**, kèm ghi chú "gồm tỉnh … cũ (sáp nhập 1/7/2025)" |
| `binh phuoc` | Thành phố Đồng Nai (Bình Phước đã nhập vào Đồng Nai) |
| để trống rồi chạm vào ô | cả 34 đơn vị, cuộn được |

- Mỗi dòng cao 48 px cho ngón tay. Chạm một cái là chọn, bàn phím tự hạ xuống.
- Ô nhận **nhiều tỉnh** (Tìm gói thầu): gõ dấu phẩy rồi gõ tên tiếp theo.
- Nếu anh vẫn muốn gõ **tên tỉnh cũ** để tìm hồ sơ đăng trước 1/7/2025, danh sách có mục "Tên cũ trước sáp nhập"
  ở cuối; chọn nó thì phần mềm nhắc rõ là chỉ ra hồ sơ cũ và có nút đổi sang tên mới.
- Ô **Tìm bằng câu thường** cũng hiểu: "kênh mương ở Bình Thuận" → điền *Tỉnh Lâm Đồng* và ghi chú lý do.

---

## C. Những chỗ khác em sửa trong lúc rà lại

Em dựng một bộ dữ liệu thử **giống thật** (tên công ty 40–70 ký tự, số tiền 13 chữ số, 34 tỉnh thành đúng danh
mục) rồi đo từng bảng trên từng màn hình. Ngoài hai lỗi anh báo, thấy và đã sửa:

1. **iPad 12,9" cầm dọc — biểu mẫu bốn cột bị chật** ở Mở thầu, Kế hoạch, Hồ sơ chủ đầu tư, Phân tích địa bàn:
   ô nhập bị cắt chữ, nút bấm xuống ba dòng. Nay biểu mẫu tự xếp **hai cột** theo chỗ thật còn lại, bốn ô số
   liệu tổng hợp xếp 2×2.
2. **Bảng "Gói đã trúng"**: cột "Mã TBMT" rộng 487 px vì mã, nút "Tải hồ sơ" và "Xem KHLCNT" nằm ngang một
   hàng. Nay xếp dọc trong ô, cột còn khoảng 180 px.
3. **iPhone**: bảng nhiều cột thành **thẻ** — mỗi dòng một thẻ, tên ở đầu, các con số có nhãn ngay phía trên,
   không phải vuốt ngang. Muốn sắp xếp thì dùng ô **"Sắp xếp theo"** phía trên chồng thẻ. Các ô số liệu tổng hợp
   không còn đẩy trang rộng hơn màn hình khi con số dài.
4. **Dấu sắp xếp ở tiêu đề cột** vẽ bằng nét riêng, không chiếm bề rộng cột.

---

## D. Điều em chưa kiểm được trên máy thật

Nói thẳng để anh biết chỗ nào cần nhìn kỹ khi dùng:

- **Bàn phím ảo của iPad.** Phòng thử của em là nhân Safari chạy trên Linux, **không có bàn phím ảo**. Theo ảnh
  của anh, bàn phím cao khoảng 400 điểm và chỉ còn chừng 113 điểm dưới ô Tỉnh/thành phố — không đủ cho danh sách.
  Vì vậy khi bàn phím trượt lên, phần mềm **tự đưa ô nhập lên đầu màn hình** để danh sách nằm trọn phía trên bàn
  phím. Em đã tính theo đúng số đo trong ảnh, nhưng chưa thấy nó chạy với bàn phím thật. Nếu danh sách bị che hoặc
  màn hình nhảy khó chịu, anh chụp giúp em một ảnh.
- **Thanh gợi ý của chính bàn phím** (ba chữ gợi ý của iOS) vẫn có thể hiện; nó không còn là danh sách tỉnh.
- **Vuốt ngang trong bảng** bằng ngón tay và việc cột tên đứng yên: đo bằng máy đạt, chưa có ngón tay thật.
- Các bảng trong phòng thử dùng dữ liệu **giả lập**. Tên công ty hay tên gói ngoài đời có thể dài hơn nữa.

---

## E. Đã kiểm thử thế nào

Mọi thứ dưới đây chạy trong **phòng thử** (nhân Safari WebKit 2.52.6 trên Linux, trang muasamcong giả lập), không
phải trên iPad thật.

| Bài kiểm | Kết quả |
|---|---|
| Bảng đọc được + ô tỉnh/thành, dữ liệu giống thật (`tools/test/bang-doc-duoc.mjs`) | **46 phép kiểm, 150 lượt đo bảng, 0 vi phạm** ở ba cỡ máy — iPad Pro 13" trong Safari cầm dọc (1032×1244, đúng máy của anh), xoay ngang (1376×900) và iPhone (390×844); mỗi cỡ 35 màn hình, 50 bảng |
| — cùng bài đo chạy trên **bản 4.22.0** (tệp đang nằm trên iPad của anh), cỡ iPad của anh | **61 vi phạm**: cột "Nhà thầu" 61 px, tên 67 ký tự thành 25 dòng — đúng lỗi trong ảnh |
| — iPad cầm dọc | 34 bảng vừa màn hình, 16 bảng cuộn ngang có ghim cột tên |
| — iPad xoay ngang | 44 bảng vừa màn hình, 6 bảng cuộn ngang |
| — iPhone | 47 bảng thành thẻ, 2 bảng vừa, 1 bảng cuộn (bảng so sánh gói, ghim cột "Tiêu chí") |
| — bàn phím ảo (mô phỏng theo số đo trong ảnh của anh: vùng nhìn còn 841 điểm) | danh sách gợi ý nằm trọn phía trên bàn phím, đủ 3 dòng, Đồng Nai đứng đầu |
| Đầu-cuối bản Safari (`tools/test/safari-app.mjs`) | **20 kịch bản, 89 phép kiểm, đạt hết** — gồm nâng cấp từ đúng tệp 4.22.0 đang nằm trên iPad của anh: hỏi trước, để sau, cập nhật, **quay về 4.22.0**, tự cứu |
| Bài kiểm thử đơn vị (`npm test`) | 995 đạt / 1007 (12 bài chỉ chạy trên Windows được bỏ qua) |
| Tiện ích Chrome trên máy tính với e-GP giả lập khó tính | 21/21 kịch bản đạt |
| Cú pháp cho Safari 16.4 | 143 tệp trong gói đều đọc được |

Ba điều cần nói rõ về các con số này:

- Lần chạy đầu-cuối đầy đủ ở máy em báo **1 bước hỏng** trong 89: bước "Quay về bản 4.22.0". Nguyên nhân là **bài
  kiểm** còn ghi cứng chữ "4.21.0" khi tìm nút, không phải phần mềm. Em sửa bài kiểm rồi chạy lại hai kịch bản nâng
  cấp: 16/16 đạt. Lần chạy đầy đủ sạch là lần của máy kiểm thử tự động (CI) trước khi phát hành.
- Lần đẩy mã đầu tiên lên máy kiểm thử tự động (CI) **đỏ hai việc ngay phút đầu**, đều do em chuẩn bị thiếu chứ
  không phải lỗi phần mềm: quên đồng bộ số phiên bản sang phần app di động, và một bài kiểm thử mới không chịu
  được kiểu xuống dòng của Windows. Em sửa, chạy lại, rồi mới phát hành.
- Bài đo "bảng đọc được" được viết **sau** khi anh báo lỗi. Nó bắt đúng loại lỗi anh thấy, nhưng không chứng minh
  được rằng không còn loại lỗi trình bày nào khác.

---

## F. Việc cần anh

1. Chạm dấu trang, bấm **Cập nhật ngay**.
2. Mở lại đúng hai màn hình trong ảnh: **Hồ sơ chủ đầu tư → Nhà thầu đã trúng**, và **Tìm gói thầu → ô Tỉnh /
   thành phố**, gõ "thành phố đồng".
3. Thử thêm: chạm tiêu đề "Giá trị trúng" để sắp xếp; vuốt ngang một bảng nhiều cột; gõ `tp` ở ô tỉnh.
4. Còn chỗ nào xấu hoặc khó đọc, anh chụp ảnh gửi em như lần này — ảnh thật giúp em tìm ra nguyên nhân nhanh
   hơn mọi phép đo trong phòng thử.

## G. Trên máy tính (Chrome)

Mọi thay đổi ở trên cũng có trên tiện ích Chrome: bảng tự chia cột, sắp xếp theo cột, ô tỉnh/thành mới. Trên
máy tính, bảng không vừa cửa sổ thì cuộn ngang bằng thanh cuộn hoặc giữ Shift và lăn chuột.
