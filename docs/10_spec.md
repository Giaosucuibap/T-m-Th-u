# 10 Chuẩn bị máy và bắt đầu với Claude Code hoặc Codex

- Bước 1. Trên máy dự định sử dụng, mở Excel → File → Account → About Excel. Ghi phiên bản và 32/64 bit. Đề xuất máy Windows với Excel 365/2024 64 bit.
- Bước 2. Giải nén TA_Estimate_Starter.zip vào thư mục làm việc, ví dụ C:\TA_Estimate. Thư mục mở trong công cụ lập trình phải là thư mục chứa README.md, AGENTS.md và CLAUDE.md.
- Bước 3. Cài Git for Windows, VS Code nếu muốn dùng trình soạn thảo, và công cụ AI từ nguồn chính thức. Không bắt buộc cài cả Claude Code lẫn Codex để bắt đầu.
- Bước 4. Claude Code: theo trang quickstart [S10], chọn bộ cài Windows; mở terminal trong thư mục dự án, gõ claude và đăng nhập theo hướng dẫn. Có thể dùng winget install Anthropic.ClaudeCode theo tài liệu chính thức.
- Bước 5. Codex: theo trang cài đặt [S11], chọn phương án Windows hoặc IDE; mở thư mục dự án. Nếu dùng CLI đã cài, gõ codex và chọn đăng nhập bằng ChatGPT hoặc phương án được tài khoản hỗ trợ.
- Bước 6. Đưa prompt 00 vào công cụ được chọn. Chỉ chuyển sang prompt tiếp theo khi đầu ra và điều kiện đạt của chặng trước đã được kiểm.

```text
cd C:\TA_Estimate
git init
git add .
git commit -m "Initial TA Estimate specification"
```

Chỉ chạy git init nếu đây là thư mục mới chưa quản lý Git. Nếu Git yêu cầu tên/email, khai báo danh tính của chính người dùng. Commit là mốc lưu cục bộ; chưa cần đưa mã hoặc hồ sơ doanh nghiệp lên kho công khai.

Cách dùng hai AI: một công cụ triển khai một chặng; công cụ kia đọc đặc tả, phần thay đổi và kiểm lỗi. Hai công cụ lần lượt làm việc, tránh cùng sửa một file. Sau kiểm tra, ghi kết quả vào STATUS.md và tạo một commit.

Claude Code và Codex có thể tạo mã, chạy công cụ kiểm tra và sửa file trong thư mục được cấp quyền. Việc nghiệm thu add-in phải chạy bằng Excel desktop trên Windows; kiểm thử trong môi trường Linux không chứng minh Ribbon, UserForm hoặc VBA đã hoạt động trên Excel thật.
