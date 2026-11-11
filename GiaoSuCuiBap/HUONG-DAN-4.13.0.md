# Giáo Sư Cùi Bắp 4.13.0 — bản kết hợp có chọn lọc

Bản này lấy 4.12.0 đã kiểm thử làm nền, đối chiếu bản Claude 4.12.0 và tích hợp những thay đổi có chứng cứ. Không sao chép toàn bộ vì một số thay đổi làm mất sửa lỗi đã có hoặc tạo khớp địa bàn sai.

## Sử dụng và cập nhật

1. Sao lưu dữ liệu bằng chức năng sao lưu của phiên bản đang dùng trước khi nâng cấp.
2. Giải nén gói phát hành mới vào một thư mục riêng. Trong `chrome://extensions`, chọn **Tải tiện ích đã giải nén** và trỏ đúng thư mục `GiaoSuCuiBap`, hoặc thay nguồn của tiện ích đã cài rồi bấm **Tải lại**.
3. Giữ cùng mã tiện ích và cùng hồ sơ Chrome để dùng lại dữ liệu cũ. Mã ổn định: `injgpddgeaedalfgbnnbobdidghjncoj`.
4. Lần mở đầu chuyển kho và lịch sử sang IndexedDB. Kho lớn có thể cần vài giây. Chỉ loại bản lưu cũ sau khi giao dịch chuyển đã ghi thành công; khi lỗi, thao tác dừng và báo lỗi thay vì tạo kho rỗng.
5. Khi quay về bản trước 4.13, phải dùng tệp sao lưu để nhập dữ liệu; bản cũ chỉ biết kho trong chrome.storage.local. Không tự hạ phiên bản để xử lý lỗi kho.

## Mười góp ý đã xử lý như thế nào

1. **Kho IndexedDB:** chuyển gói, lịch sử tra cứu và nhà thầu sang các kho bản ghi. Mở một lượt tìm đọc theo mã của lượt đó; chỉ đọc ảnh chụp của lượt đang chọn. Cấu hình nhỏ vẫn dùng chrome.storage. Đọc toàn kho phục vụ màn hình kho, sao lưu và một số nghiệp vụ vẫn cần đọc toàn bộ dữ liệu; không tuyên bố mọi thao tác đã thành truy vấn một trang.
2. **Giới hạn phần dựng giao diện:** kho phân trang tối đa 60 thẻ, tìm TBMT giữ 30 thẻ/trang. Không cộng dồn hàng nghìn thẻ khi bấm xem thêm. Xuất Excel bao gồm toàn bộ kết quả sau lọc, không chỉ trang đang xem.
3. **Đo e-GP thật:** bản phát hành có chứng cứ tách riêng ca mô phỏng, đo cục bộ và truy vấn e-GP trực tiếp. Thời gian mạng tùy phản hồi e-GP; không lấy thời gian lọc trong máy làm tốc độ truy cập web.
4. **Bàn điều hành gọn:** thanh giới thiệu thu gọn, ưu tiên bộ lọc và kết quả.
5. **Điều hướng:** một nhóm đích chính rõ ràng; các công cụ bổ sung nằm trong Nâng cao. Giữ đường dẫn thao tác bàn phím và bố cục điện thoại.
6. **Excel Đối soát:** thêm trang riêng ghi tổng nguồn, đã tải, ba nhóm đối chiếu, chênh lệch, tiêu chí gốc và bộ lọc khi xuất. Số chưa có được ghi “Chưa ghi nhận”, không thay bằng 0. Số nhà thầu/gói con được phân biệt với số bản ghi nguồn.
7. **Thiếu lĩnh vực nguồn:** hiện số lượng và tỷ lệ thiếu investField trong phạm vi đã tải; trường sai kiểu được tách riêng. Không suy đoán tỷ lệ của toàn thị trường từ dữ liệu chưa tải đủ.
8. **So sánh hai lượt:** chọn hai lượt trong lịch sử để xem chỉ có ở A/B, khác thông tin, không đổi hoặc chưa đủ ảnh chụp cũ. Khác tiêu chí hoặc tải chưa đủ có cảnh báo. “Chỉ lượt A” không có nghĩa gói đã bị gỡ khỏi e-GP.
9. **Dọn kho:** có cảnh báo dung lượng/số lượng và bước xem trước. Chỉ xóa sau khi xác nhận các gói đóng hơn sáu tháng; giữ gói đang theo dõi, có quyết định, checklist, tham chiếu hợp đồng hoặc thuộc lịch sử tra cứu. Xác nhận hết hạn sau 10 phút; kho thay đổi thì phải xem trước lại. Không tự dọn trong nền.
10. **Canary:** giữ bộ 25 mã đối chứng IB/PL/BBMT đang có, kiểm tra mã tỉnh 703 và dữ liệu nhà thầu. Lịch mặc định **02:00 thứ Hai, giờ Việt Nam**, khi Chrome hoạt động; cơ chế đã tồn tại ở bản nền và được giữ lại, không ghi nhận là tính năng mới của Claude. Dữ liệu/schema không đạt không được coi là xác nhận thành công.

## Những điểm kết hợp và sửa thêm

- Dùng bộ biểu trưng Claude đồng nhất ở các kích thước nhỏ; giữ font cục bộ, độ tương phản và lựa chọn khoảng cách Gọn/Thoáng.
- Excel có màu theo trạng thái đối chiếu được lưu, tên/giá được nhấn đậm và diễn giải in nghiêng. Giữ tiền/ngày có kiểu dữ liệu, đường dẫn gọn và các cột phần/lô, nguồn giá sau giảm, tình trạng chưa đọc đủ.
- Chặn loại gói không hợp lệ ở cả hàm lọc trực tiếp; không biến lỗi nhập thành mọi lĩnh vực. investField hợp lệ được ưu tiên; tên chỉ hỗ trợ phân nhánh tư vấn.
- Gói con có địa bàn riêng không kế thừa các trường địa bàn mâu thuẫn của kế hoạch cha. Giữ xác nhận xã theo cặp mã xã–mã tỉnh; không ghép tên xã ở địa điểm này với tỉnh ở địa điểm khác.
- Giữ sửa lỗi tái sử dụng biểu mẫu e-GP đã sẵn sàng, cache truy vấn có hạn, so sánh giá biên bản theo đúng nguồn và bộ lọc dùng chung cho danh sách/xuất Excel.

## Giới hạn cần hiểu đúng

Không có cơ sở cam kết phần mềm tìm kiếm trên dịch vụ ngoài luôn không sai hoặc luôn trả đủ. Phiên đăng nhập, reCAPTCHA, mạng và cấu trúc e-GP có thể thay đổi. Phần mềm phải thể hiện thiếu dữ liệu, lỗi và phạm vi đã tải; không thay số thiếu bằng giá dự đoán hay nhà thầu giả. Báo cáo kiểm thử trong gói phát hành ghi rõ phiên bản, hash nguồn, thời điểm và ca thực tế đã xác nhận.

E-HSMT vẫn phụ thuộc trình trợ giúp chính thức của e-GP trên máy. Việc Chrome giao tiếp được với native host của tiện ích không đồng nghĩa đã kiểm thử tải một hồ sơ thật qua trình trợ giúp đó.
