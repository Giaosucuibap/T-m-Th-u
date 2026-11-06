# BÁO CÁO THẨM ĐỊNH PHẦN MỀM "GIÁO SƯ CÙI BẮP"

**Đối tượng thẩm định:** tiện ích Chrome Giáo Sư Cùi Bắp, bản **4.17.3** (hiện trạng) và bản nâng cấp **4.18.0**
**Ngày:** 06/11/2026 · **Người đặt hàng:** Công ty TNHH xây lắp Trường An
**Cách làm:** đọc toàn bộ mã nguồn, chạy kiểm thử tự động, đo trên trình duyệt Chromium thật với máy chủ e-GP giả lập,
so sánh với thông tin công khai của các phần mềm cùng loại ở Việt Nam.

> **Giới hạn phải nói trước.** (1) Môi trường thẩm định **không vào được e-GP thật** (muasamcong.mof.gov.vn bị chặn),
> nên mọi số đo tốc độ là trên e-GP giả lập. (2) Các phần mềm đối thủ **không được dùng thử trực tiếp**; thông tin về
> chúng lấy từ trang của chính nhà cung cấp, chỉ có giá trị tham khảo. (3) Điểm số dưới đây là **đánh giá chuyên môn
> có neo vào số đo**, không phải chứng nhận của tổ chức nào.

---

## 1. Kết luận cho Ban Giám đốc

| | 4.17.3 (hiện trạng) | 4.18.0 (sau nâng cấp) |
|---|---|---|
| **Điểm tổng (thang 10)** | **7,2** | **7,9** |
| Khối chữ nhỏ hơn 12px (23 trang) | 57,9% | 0 trên 22 trang tiện ích (còn 1 ở trang iPhone) |
| Khối chữ không đạt tương phản WCAG 2.1 AA | 14,3% | 0,1% (6/5.738) |
| Thời gian tới khi thấy gói đầu tiên (tiêu chí mới, e-GP chậm) | 8,3 giây | 0,2 giây |
| Bài kiểm thử tự động | 769 (759 đạt, 10 chỉ chạy trên Windows) | 785 |

**Một câu:** phần mềm **mạnh ở độ đúng dữ liệu và chiều sâu nghiệp vụ** — điều hiếm có ở công cụ tìm thầu — nhưng
**yếu ở giao diện, ở sự phụ thuộc vào giao diện e-GP, và ở việc đang tồn tại hai nhánh song song**. Bản 4.18.0 sửa
dứt điểm phần giao diện và tốc độ cảm nhận; hai điểm yếu còn lại cần quyết định của chủ đầu tư phần mềm (mục 7).

---

## 2. Phạm vi đã thẩm định

| Hạng mục | Số liệu |
|---|---|
| Mã nguồn JavaScript (không tính thư viện ngoài) | 32.303 dòng, 76 mô-đun nghiệp vụ |
| Tệp xử lý nền `background.js` | 4.343 dòng, 118 loại thông điệp |
| Màn hình | 22 trang + cửa sổ bật lên |
| Kiểm thử | 77 tệp, 769 bài; chạy ở 4 múi giờ, trên Windows và Chromium với "e-GP khó tính" |
| Chức năng nghiệp vụ | Tìm TBMT, kế hoạch LCNT, biên bản mở thầu (giá dự thầu từng nhà thầu), trúng thầu theo MST (gồm liên danh), hồ sơ nhà thầu 360°, hồ sơ chủ đầu tư, đối thủ địa bàn, phân tích thị trường, chỉ số minh bạch, quan hệ CĐT–nhà thầu, bộ săn tự động, bản tin sáng Telegram, checklist HSDT, năng lực công ty, hợp đồng tương tự, khung BPTC |

---

## 3. Bảng điểm chi tiết

| # | Tiêu chí | Trọng số | 4.17.3 | 4.18.0 | Căn cứ |
|---|---|---|---|---|---|
| 1 | Độ đúng dữ liệu & đối soát | 20% | 8,5 | 8,5 | Phân loại khớp / thiếu dữ liệu / ngoài tiêu chí; đối soát "e-GP báo – đã tải"; không đoán giá thiếu |
| 2 | Chịu được thay đổi của e-GP | 15% | 6,5 | 6,5 | Lái giao diện e-GP; tháng 10/2026 hỏng 2 lần (đổi tên miền, yêu cầu phụ); có canary phát hiện |
| 3 | Tốc độ cảm nhận | 10% | 6,0 | 8,0 | Tab mở sẵn (4.17.0); kết quả tức thì từ kho (4.18.0): 8,3 → 0,2 giây |
| 4 | Phạm vi nghiệp vụ | 15% | 8,0 | 8,3 | Rộng hơn mọi công cụ miễn phí; thêm Tìm nhanh |
| 5 | Giao diện & dễ đọc | 15% | 5,0 | 8,0 | Đo trên 23 trang (mục 5) |
| 6 | Bảo mật & riêng tư | 10% | 8,5 | 8,5 | Dữ liệu trên máy; không lưu mật khẩu e-GP; quyền tối thiểu |
| 7 | Kiểm thử & phát hành | 10% | 8,5 | 8,7 | Kiểm thử đỏ-trên-mã-cũ, CI 3 môi trường; nay thêm đo giao diện |
| 8 | Kiến trúc & bảo trì | 5% | 5,5 | 5,5 | Tệp nền 4.343 dòng; hai nhánh song song chưa hợp nhất |
| | **Tổng có trọng số** | | **7,2** | **7,9** | |

---

## 4. Ưu điểm

1. **Kỷ luật dữ liệu hiếm thấy.** Mỗi kết quả được xếp vào "khớp tiêu chí", "thiếu dữ liệu" hoặc "ngoài tiêu chí";
   gói thiếu giá **không** bị tính là 0 đồng; mọi lượt ghi "e-GP báo N · đã tải N". Với người làm thầu, điều này quan
   trọng hơn tốc độ: một con số sai về giá gói hay hạn nộp có thể làm mất cả gói thầu.
2. **Lấy dữ liệu đúng nguồn, đúng cách.** Tiện ích không "cào" máy chủ e-GP mà để chính giao diện e-GP gửi yêu cầu
   (giữ mã reCAPTCHA hợp lệ) rồi chỉ gắn tiêu chí. Vì vậy không bị chặn kiểu công cụ cào dữ liệu, và dữ liệu là của
   **chính thời điểm bấm tìm**.
3. **Chiều sâu nghiệp vụ dành cho nhà thầu xây lắp.** Giá dự thầu từng nhà thầu ở biên bản mở thầu, tra trúng thầu
   theo mã số thuế (lấy cả gói liên danh), đối thủ trên địa bàn, quan hệ chủ đầu tư – nhà thầu: đây là những phân tích
   mà các gói trả phí thường mới có.
4. **Riêng tư.** Toàn bộ dữ liệu nằm trong Chrome trên máy công ty; không tài khoản, không máy chủ trung gian.
5. **Chi phí.** Không phí thuê bao.
6. **Quy trình chất lượng.** Lỗi nào sửa cũng kèm bài kiểm thử đỏ trên mã cũ; có máy chủ e-GP giả lập mô phỏng mạng
   chập chờn, trang bận, đổi cấu trúc.

## 5. Nhược điểm (nói thẳng)

1. **Phụ thuộc giao diện e-GP.** Không có API chính thức; e-GP đổi gì là có thể hỏng. Tháng 10/2026 đã hỏng hai lần
   (đổi tên miền sang mof.gov.vn; trang mới phát thêm yêu cầu phụ). Đây là rủi ro cấu trúc, không xoá được hẳn — chỉ
   giảm được bằng canary hằng đêm và kiểm chứng trên trang thật sau mỗi bản.
2. **Hai nhánh song song.** Bản tác giả 4.17.1 (có đọc HSMT bằng PDF/OCR, nhật ký lưu bền vững, bằng chứng chạy trên
   e-GP thật) và nhánh này (tab mở sẵn, quét nhanh phần mới, quan hệ CĐT–NT, bản tin sáng, giao diện mới). Hai nhánh
   khác nhau 92 tệp. Hệ quả đã thấy: cài nhầm bản, lỗi `COLLECTOR_NOT_READY` của nhánh kia. **Đây là rủi ro lớn nhất
   hiện nay.**
3. **Giao diện trước 4.18.0 khó đọc — có số đo.** 57,9% khối chữ nhỏ hơn 12px (cửa sổ bật lên: cỡ giữa **9px**);
   14,3% khối chữ không đủ tương phản; hai kiểu khung trang khác nhau; ba trang tra cứu e-GP quan trọng (kế hoạch,
   mở thầu, trúng thầu) bị giấu trong mục "Nâng cao"; emoji lẫn biểu tượng; cửa sổ bật lên bị chèn thanh 4 bước bóp
   chữ và lộ dòng "Đến nội dung chính".
4. **Chỉ chạy khi Chrome trên máy đang mở.** Máy tắt thì không quét, không báo. Các dịch vụ trên máy chủ gửi email 24/7.
5. **Không có kho lịch sử sẵn.** Dữ liệu phải tự tích lũy qua các lượt tra cứu; dịch vụ thương mại có sẵn nhiều năm.
6. **Tốc độ trần do e-GP quyết định.** Mỗi trang kết quả phụ thuộc thời gian e-GP trả lời và phải đi đúng nhịp người
   dùng bấm; tiện ích không thể "ép" e-GP nhanh hơn.
7. **Kiến trúc nặng ở một chỗ.** `background.js` 4.343 dòng ôm 118 loại thông điệp — sửa một chỗ dễ ảnh hưởng chỗ khác.

---

## 6. So sánh với phần mềm cùng loại ở Việt Nam

| Tiêu chí | Giáo Sư Cùi Bắp 4.18.0 | DauThau.info (VINADES)¹ | Bidwinner.info¹ | Tra trực tiếp e-GP |
|---|---|---|---|---|
| Nguồn dữ liệu | e-GP, ngay lúc bấm tìm | Kho tổng hợp trên máy chủ | Kho tổng hợp trên máy chủ | Gốc |
| Cảnh báo gói mới | Bộ săn + Telegram (máy phải bật) | Email theo bộ lọc, 24/7 | Email hằng ngày theo từ khóa | Không |
| Giá dự thầu từng nhà thầu | Có (biên bản mở thầu) | Có ở gói trả phí | Chưa rõ | Xem từng gói |
| Trúng thầu theo MST, gồm liên danh | Có | Có ở gói trả phí | Chưa rõ | Thủ công |
| Đối thủ, quan hệ CĐT–NT | Có | Có một phần (ví dụ "nhà thầu bị soi nhiều") | Chưa rõ | Không |
| Phân loại "thiếu dữ liệu" minh bạch | Có, bắt buộc | Không thấy công bố | Không thấy công bố | — |
| Lịch sử nhiều năm | Tự tích lũy | Có (theo nhà cung cấp) | Có (theo nhà cung cấp) | Có |
| Dữ liệu doanh nghiệp | Trên máy công ty | Tài khoản trên máy chủ | Tài khoản trên máy chủ | — |
| Chi phí | 0 đ | Theo gói VIP | Theo gói | 0 đ |

¹ Theo thông tin nhà cung cấp tự công bố, **chưa kiểm chứng độc lập**; nguồn ở cuối báo cáo.

**Nhận định:** về **độ tin cậy và phân tích đối thủ**, Giáo Sư Cùi Bắp ngang hoặc hơn các gói trả phí. Về **cảnh báo
24/7 và kho lịch sử**, các dịch vụ trên máy chủ hơn hẳn. Cách dùng hợp lý cho Trường An: dùng Giáo Sư Cùi Bắp làm
**công cụ phân tích và ra quyết định**, và nếu cần không bỏ lỡ gói nào khi máy tắt thì cân nhắc thêm một gói nhận email
giá thấp của dịch vụ máy chủ.

---

## 7. Đã làm ở 4.18.0 (kèm số đo)

### 7.1 Giao diện — thiết kế lại toàn bộ
- **Một khung cho mọi trang**: thanh điều hướng trái cố định, nhóm theo công việc
  (Tra cứu e-GP · Theo dõi · Phân tích thị trường · Năng lực công ty · Hệ thống).
- **Chữ**: phông Be Vietnam Pro đủ 4 độ đậm, chữ thân 15px, không chữ nào dưới 12px; 4 tầng màu chữ đều đạt ≥ 4,5:1.
- **Thứ bậc rõ**: tiêu đề trang 21–30px, số liệu 30px đậm canh cột, nội dung 15px, ghi chú 13,5px.
- Đoạn giải thích dài được thu gọn; emoji thay bằng bộ biểu tượng chung; sửa cửa sổ bật lên.

| Trang | Cỡ chữ giữa (trước → sau) | Chữ < 12px | Tương phản kém |
|---|---|---|---|
| Cửa sổ bật lên | 9px → 12,5px | 703 → 0 | 378 → 1 |
| Tìm gói thầu | 11px → 13,5px | 1.168 → 0 | 131 → 2 |
| Kho gói đã lưu | 11,5px → 13,5px | 759 → 0 | 14 → 3 |
| Kế hoạch LCNT | 11px → 13,5px | 318 → 0 | 153 → 0 |
| Mở thầu · Chờ kết quả | 12,5px → 14px | 38 → 0 | 83 → 0 |

### 7.2 Tốc độ — kết quả tức thì từ kho
Bấm tìm với tiêu chí mới: hiện ngay các gói đã lưu **khớp đúng tiêu chí** trong lúc e-GP trả lời, rồi tự thay bằng dữ
liệu mới. Đo 3 lần mỗi bản trên Chromium, e-GP giả lập chậm:

| | 4.17.3 | 4.18.0 |
|---|---|---|
| Thấy gói đầu tiên | 8,25 / 8,28 / 8,26 giây | 0,22 / 0,22 / 0,20 giây |
| e-GP trả đủ dữ liệu | 16,6 giây | 16,7 giây (không đổi) |

### 7.3 Kỹ năng mới — Tìm nhanh (Ctrl + K)
Gõ mã TBMT/KHLCNT → mở ngay gói trong kho hoặc tra mã trên e-GP; gõ chữ không dấu → gói trong kho; gõ tên trang → chuyển trang.

### 7.4 Giữ độ chính xác khi chạy nhanh hơn
- Danh sách tức thì dùng **đúng bộ lọc tiêu chí** của lượt tìm (không phải tìm gần đúng).
- Luôn ghi "dữ liệu đã lưu, có thể cũ"; **khoá Xuất Excel/Lịch** cho tới khi dữ liệu e-GP về.
- Sửa lỗi ô "Số gói tối đa" hiện trống khiến lượt quét dùng con số khác điều người dùng thấy.

---

## 8. Về yêu cầu "nhanh nhất, chính xác tuyệt đối"

Tổ thẩm định **không cam kết** hai chữ "tuyệt đối", vì:
- **Tốc độ**: thời gian e-GP trả mỗi trang và cơ chế reCAPTCHA nằm ngoài tầm tiện ích. Điều làm được — và đã làm — là
  không bắt người dùng chờ vô ích: tab e-GP mở sẵn, bộ nhớ đệm 2 phút, quét nhanh phần mới, kết quả tức thì từ kho.
- **Độ chính xác**: không phần mềm nào chính xác hơn dữ liệu gốc. Điều làm được là **mọi sai lệch đều lộ ra**: đối soát
  số lượng, nhóm "thiếu dữ liệu", nhãn "có thể cũ", kiểm tra cấu trúc e-GP hằng đêm (canary), và không cho xuất dữ liệu tạm.

---

## 9. Lộ trình đề xuất (theo thứ tự ưu tiên)

1. **Hợp nhất hai nhánh thành một bản duy nhất** — lấy phần đọc HSMT/OCR và nhật ký lưu bền vững của bản tác giả,
   giữ giao diện, tốc độ và phân tích của nhánh này. Cần chủ đầu tư phần mềm quyết định.
2. **Kiểm chứng trên e-GP thật sau mỗi bản** (các bài `tests/live-*` đã có) và lưu bằng chứng.
3. **Tách `background.js`** thành các mô-đun theo chức năng.
4. **Cảnh báo khi máy tắt**: chạy trên một máy luôn bật, hoặc thêm gói email giá thấp của dịch vụ máy chủ.
5. **Gợi ý "gói vừa sức Trường An"** dựa trên năng lực thật (thiết bị khoan phụt, nhân sự, hợp đồng tương tự đã khai).

---

### Nguồn tham khảo về phần mềm cùng loại
- [So sánh VIP1 và VIP2 trên DauThau.info](https://dauthau.asia/news/tin-tuc/so-sanh-vip1-va-vip2-tren-dauthau-info-doanh-nghiep-nen-chon-goi-nao-1981.html)
- [Hướng dẫn dùng điểm để khai thác tính năng nâng cao trên DauThau.info](https://dauthau.asia/news/tin-tuc/huong-dan-su-dung-diem-de-dung-cac-tinh-nang-nang-cao-tren-dauthau-info-847.html)
- [So sánh "Tìm kiếm thông minh" của Hệ thống mạng đấu thầu quốc gia và DauThau.info](https://dauthau.asia/news/dau-thau/so-sanh-tinh-na-ng-tim-kie-m-thong-minh-cua-he-thong-mang-dau-thau-quoc-gia-va-phan-mem-dauthau-info-1100.html)
- [DauThau.info bổ sung tính năng hiển thị top 10 nhà thầu bị soi nhiều nhất](https://dauthau.asia/news/blog/dauthau-info-bo-sung-tinh-nang-hien-thi-top10-nha-thau-bi-cac-nha-thau-khac-soi-nhieu-nhat-130.html)
- [6 lý do doanh nghiệp nên sử dụng DauThau.info](https://dauthau.asia/news/tin-tuc/6-ly-do-doanh-nghiep-nen-su-dung-dauthau-info-1626.html)
- [Bidwinner — chi tiết gói thầu](https://bidwinner.info/4.0/chi-tiet-goi-thau/1003845)
