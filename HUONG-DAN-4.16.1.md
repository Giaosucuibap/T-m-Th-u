# Giáo Sư Cùi Bắp 4.16.1

Bản sửa lỗi cho 4.16.0. Một việc chính: **chấm dứt lỗi chập chờn "e-GP chưa trả
dữ liệu cho lượt tra cứu. Hãy thử lại sau ít phút."** — lỗi lúc được lúc mất anh
gặp ở màn hình *Gói đang chờ kết quả*.

## Cập nhật bản đang dùng

1. Giải nén ZIP. Thư mục cài là **`GiaoSuCuiBap`** (bên trong có `manifest.json`).
2. Chép đè nội dung thư mục đó lên thư mục tiện ích Chrome đang nạp.
3. Mở `chrome://extensions`, bấm ↻ tải lại Giáo Sư Cùi Bắp. Kiểm tra phiên bản là
   **4.16.1**.
4. **Đóng hết các tab e-GP đang mở** rồi mở lại. Tab mở từ trước khi tải lại tiện
   ích vẫn chạy mã cũ.

Không gỡ tiện ích — gỡ là mất kho dữ liệu. Mã tiện ích và quyền giữ nguyên.

## Lỗi là gì, vì sao lúc được lúc mất

Trang tra cứu e-GP **tự tải danh sách mặc định** ngay khi mở. Bản 4.16.0 chỉ đổi ô
"số bản ghi/trang" **một lần** rồi ngồi chờ 25 giây. Nếu lúc đổi ô mà e-GP còn đang
tải danh sách mặc định (trang vừa mở, mạng chậm, giờ cao điểm), giao diện e-GP coi
trang đang bận và **bỏ qua** thao tác. Không yêu cầu nào được gửi đi, phản hồi
không bao giờ về, và anh nhận câu "e-GP chưa trả dữ liệu" — trong khi **e-GP chưa
hề được hỏi**. Bấm lại thì tab đã rảnh nên chạy được.

Đã tái hiện y hệt trên máy chủ e-GP giả lập trước khi sửa:

| | Bản 4.16.0 | Bản 4.16.1 |
|---|---|---|
| Gói đang chờ kết quả, tab mới mỗi lượt | **0/6** — lượt nào cũng đúng câu lỗi của anh | **10/10** |
| Tìm gói thầu, cùng điều kiện | **0/4** | **8/8** |
| Thêm 20% kết nối bị cắt ngang | — | **24/24** (hai hạt giống ngẫu nhiên, 28 lần cắt) |
| Kế hoạch lựa chọn nhà thầu, mạng rớt 15% | — | **7/7** |

Mỗi lượt "đạt" đều được tự kiểm là **thật sự hỏi e-GP**, không trúng bộ nhớ đệm.
(Lần đo đầu tôi báo 10/10 nhưng 9 lượt trúng đệm — đã sửa kịch bản để không thể lọt
kết quả rỗng kiểu đó nữa.)

## Đã sửa những gì

1. **Bắt tay có xác nhận.** Trang báo về tiện ích hai điều nó thấy tận mắt: e-GP
   đang có bao nhiêu yêu cầu chưa xong, và yêu cầu mang tiêu chí của anh **đã thật
   sự rời trình duyệt** chưa. Tiện ích chờ e-GP rảnh, thao tác, thấy yêu cầu đi rồi
   mới tính giờ chờ. Thao tác bị bỏ qua thì đổi cách và làm lại (tối đa 4 lần).
2. **Phản hồi không còn bị nuốt.** Ở 4.16.0, nếu đọc nội dung phản hồi ném lỗi, cả
   phản hồi bị một khối `catch` rỗng nuốt mất — tiện ích chờ hết giờ rồi đổ lỗi cho
   e-GP. Nay phản hồi được chuyển về trước mọi việc khác.
3. **Mạng chập chờn tự đọc lại.** Rớt kết nối, hết hạn chờ hoặc e-GP lỗi 5xx ở một
   trang giữa chừng thì tự đọc lại trang đó (tối đa 3 lần), thay vì dừng cả lượt.
4. **Đọc lại đúng trang.** Cách cũ "lùi một trang rồi tiến lại" lệch trang khi
   chính bước lùi cũng rớt mạng. Nay tiện ích biết e-GP đang ở trang nào và đi
   thẳng tới trang đích.
5. **Câu báo lỗi nói đúng sự thật.** Mỗi kiểu thất bại có câu riêng: e-GP *chưa
   được hỏi*; *đã hỏi mà không trả lời*; *e-GP đổi cấu trúc*. Câu lỗi không còn hiện
   hai lần trên màn hình *Gói đang chờ kết quả*.
6. **Thứ tự kết quả lặp lại được.** Hai gói bằng điểm trước đây đứng theo thứ tự
   tình cờ về kho; nay cố định theo mã gói.
7. Bỏ số phiên bản ghim cứng `'4.15.0'` trong bộ canary sống.

Cơ chế đọc danh sách dùng chung cho mọi màn hình tra cứu, nên bản sửa áp dụng cho
Tìm gói thầu, Kế hoạch, Gói đang chờ kết quả, Nhà thầu trúng, Chủ đầu tư.

## Kiểm thử đã chạy

- **666 bài tự động: 656 đạt, 0 đỏ, 10 bỏ qua.** 10 bài bỏ qua là bài của cầu nối
  Windows (cần `csc.exe` và chạy tệp `.exe`) — không chạy được ở môi trường Linux
  này; trước đây chúng báo đỏ giả, nay bỏ qua kèm lý do. 3 bài cầu nối viết bằng
  JavaScript vẫn chạy.
- 108 ca ngày/giá chạy ở nhiều múi giờ: đạt.
- 32 bài mới cho đúng các lỗi trên. Chạy trên mã 4.16.0: 6/9 bài phía trang đỏ
  (3 bài còn lại kiểm hành vi vốn đã đúng), bài thứ tự lặp lại đỏ, còn 17 bài phía
  điều khiển kiểm các hàm mà 4.16.0 không có.
- Chromium: 23 trang giao diện nạp 0 lỗi; ba luồng tra cứu như bảng trên.

## Giới hạn — đọc kỹ

- **Bản này CHƯA chạy trên e-GP thật.** Mọi phép thử trên máy chủ giả lập. Cổng
  phát hành `tools/check-live-evidence.py` của tác giả gắn bằng chứng e-GP với mã
  băm từng tệp nguồn, nên với 4.16.1 nó **báo chặn** ("Unit source mismatch") cho
  tới khi chạy lại bộ kiểm trực tiếp (`tests/live-*.mjs`, canary 25 mã) trên máy
  có mạng tới e-GP. Đó là cổng làm đúng việc của nó. Gói này **không** kèm thư mục
  `evidence/` của 4.16.0 vì bằng chứng đó không còn đúng cho mã mới.
- Nguyên nhân lỗi là suy luận từ mã nguồn và tái hiện trên bản giả lập mô phỏng
  hành vi e-GP; tôi **không quan sát trực tiếp** e-GP bỏ qua thao tác. Nếu sau khi
  cập nhật vẫn gặp lỗi, câu báo mới sẽ cho biết nó rơi vào nhánh nào — chụp lại câu
  đó gửi về là đủ để khoanh vùng.
- Chưa thêm lớp tự chạy lại cả lượt ở tầng nền: bộ máy trạng thái ở đó phức tạp,
  chen vào dễ sinh lỗi mới hơn là sửa. Lớp bắt tay + tự đọc lại ở trang đã chặn
  được mọi tình huống trong phép thử.
