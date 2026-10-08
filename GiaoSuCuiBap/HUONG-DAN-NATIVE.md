# Cầu nối tải E-HSMT — 4.11.0

Tiện ích trao đổi với cầu nối bằng Native Messaging của Chrome. Cầu nối không mở cổng HTTP; chỉ extension có mã `injgpddgeaedalfgbnnbobdidghjncoj` được khai báo trong danh sách cho phép. Mã nguồn C# và file EXE đi kèm trong thư mục `native-agent` của ZIP.

## Cài đặt trên Windows

1. Giải nén toàn bộ ZIP và mở thư mục `native-agent`.
2. Mở PowerShell tại thư mục đó, chạy `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1`.
3. Mở lại tiện ích → Nâng cao → Chẩn đoán → **Kiểm tra cầu nối**.
4. Mở phần mềm hỗ trợ e-GP chính thức đã cài trên máy để tải hồ sơ.

Script chỉ cài cho tài khoản Windows hiện tại, không cần quyền quản trị. Script sao chép cầu nối vào `%LOCALAPPDATA%\GiaoSuCuiBap\NativeHost` và đăng ký tên `vn.giaosucuibap.hsmt` trong HKCU của Chrome. Thư mục tải mặc định là `%USERPROFILE%\Downloads\GiaoSuCuiBap\HoSo`; có thể chọn thư mục khác khi cài bằng tham số `-DownloadDirectory 'D:\HoSoDauThau'`. Tệp trùng tên được đánh số, không ghi đè.

## Hai thành phần riêng

- **Cầu nối chưa cài:** chạy bộ cài trên rồi kiểm tra lại.
- **Cầu nối đã cài, phần mềm e-GP chưa phản hồi:** mở phần mềm hỗ trợ e-GP chính thức. Kết nối phía cầu nối chỉ gọi địa chỉ cố định `127.0.0.1:1234` với mã tệp UUID; không nhận URL hoặc thư mục tải từ trang web.
- **Tệp bị từ chối hoặc tải lỗi:** kiểm tra gói trên e-GP. Cầu nối không thay thế đăng nhập hoặc quyền truy cập của hệ thống.

Việc chuyển sang Native Messaging bảo vệ đường giao tiếp của tiện ích. Phần mềm hỗ trợ e-GP là sản phẩm riêng; bộ cài này không thay đổi cấu hình cổng hoặc cơ chế xác thực của phần mềm đó.

Trước khi báo hoàn tất, cầu nối kiểm tra chữ ký định dạng tệp, số byte nhận được và thời hạn tải. Đây không phải phép kiểm định mọi nội dung bên trong PDF/Word. Mỗi tệp tối đa 2 GiB, thời hạn tổng 5 phút; tệp tải dở được xóa và báo lỗi. Kết quả tải thật phụ thuộc phần mềm e-GP và quyền truy cập tệp.

Để gỡ đăng ký, chạy `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1`. Tệp hồ sơ đã tải được giữ lại.

Thiết kế giao tiếp theo tài liệu [Native Messaging của Chrome](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).
