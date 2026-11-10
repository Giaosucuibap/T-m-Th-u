# Kết quả kiểm chứng nguồn trực tiếp — 10/11/2026

Đây là kết quả của **bộ kiểm chứng nguồn**, chưa phải một ứng dụng tìm thầu đã phát hành.

- Mã được thử: `d4ebc6b4fc6e166bb81896787f76cf1ea20ba27a`.
- Workflow: https://github.com/Giaosucuibap/T-m-Th-u/actions/runs/42762149584
- Nguồn: https://muasamcong.mof.gov.vn/vi/web/guest/contractor-selection?render=index
- Phạm vi: chọn tỉnh qua giao diện nguồn, chủ đầu tư/xã/từ khóa trống, chưa đóng thầu, mọi lĩnh vực; tối đa ba trang mỗi tỉnh.
- Không sử dụng PC công ty, extension hoặc Userscripts.

## Kết quả mới nhất

| Engine Linux | Tỉnh | Tổng nguồn báo | Số đã đọc | Kết quả |
|---|---|---:|---:|---|
| Chromium | Lâm Đồng | 97 | 30 / 3 trang | Mẫu một phần đạt đối chiếu query, phân trang, định danh và mã tỉnh |
| Chromium | Đồng Nai | 114 | 30 / 3 trang | Mẫu một phần đạt cùng phạm vi đối chiếu |
| Chromium | Hà Nội | Chưa xác định | Chưa có trang hợp lệ | Quá hạn chờ mở biểu mẫu nâng cao |
| WebKit | Lâm Đồng | Chưa xác định | Chưa có trang hợp lệ | Quá hạn chờ danh mục tỉnh |
| WebKit | Đồng Nai | Chưa xác định | Chưa có trang hợp lệ | Quá hạn chờ mở biểu mẫu |
| WebKit | Hà Nội | Chưa xác định | Chưa có trang hợp lệ | Quá hạn chờ mở biểu mẫu |

Chromium lấy dữ liệu khoảng **12:33–12:34, giờ Việt Nam**. Trang đầu được xác minh sau 15,382 giây với Lâm Đồng và 14,381 giây với Đồng Nai, tính từ lúc khởi tạo trường hợp thử. Đây là một mẫu cho mỗi tỉnh, không phải SLA hoặc benchmark sản phẩm.

Hai lượt thành công một phần không đủ làm cả workflow đạt; trạng thái tổng vẫn là `SOURCE_ACCEPTANCE_NOT_PASSED`. Lỗi không được ghi thành kết quả thành công có 0 gói.

## Giới hạn phải giữ

- Chưa lấy toàn bộ 97 hoặc 114 bản ghi; chưa chứng minh độ phủ mọi địa bàn tiền thân.
- Query đã có điều kiện đang mở; trạng thái từng dòng và giá từng gói chưa được đối chiếu riêng (`rowStatusVerified: false`, `rowPriceVerified: false`).
- Mẫu Lâm Đồng dùng mã nguồn `68,703`; mẫu Đồng Nai dùng `75`. Không tự diễn giải thành phạm vi mọi mã tỉnh trước sắp xếp.
- Chưa nghiệm thu KHLCNT, BBMT, KQLCNT, tải E-HSMT hoặc đầy đủ các chức năng ứng dụng.
- **Chưa thử Safari trên iPad/iPhone thật; WebKit trên Linux không phải thiết bị Apple thật.**
- Chưa triển khai web/backend vận hành; `appReadyForProduction` vẫn false.

## Kiểm tra logic

34/34 bài kiểm tra logic cục bộ đạt, dùng dữ liệu kiểm thử có kiểm soát. Chúng kiểm tra điều kiện chấp nhận, phân trang, tương quan request, phân biệt lỗi body/JSON, xác thực và vòng đời HTTP job; không thay cho thử nguồn thật.

Các tài liệu trong `cloud-direct/` được soạn trước các lượt CI và mô tả thiết kế. Biên bản workflow trên là bằng chứng thực thi mới nhất cho commit nêu trên.
