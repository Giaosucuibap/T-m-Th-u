# TA Estimate

Đọc và tuân thủ AGENTS.md như hợp đồng kỹ thuật của dự án. Đọc docs/, contracts/, tests/ và STATUS.md. Thực hiện prompt được người dùng giao trong prompts/.

Mỗi lượt chỉ sở hữu một chặng, dùng dữ liệu DEMO khi thiếu nguồn thật. Ghi rõ phần đã tạo, phần đã chạy trên Excel và phần chưa xác minh. Sau khi xong, cập nhật STATUS để Codex hoặc người lập trình tiếp tục.

## Lệnh thường dùng

- Sửa cấu trúc bảng/công thức/chữ tiếng Việt: sửa `contracts/workbook_tables.json`, `src/resources/*.json` rồi `python3 scripts/gen_vba.py` (không sửa tay module VBA sinh tự động).
- Kiểm tra: `python3 -m unittest discover -s tests -t .` (cần LibreOffice + python3-uno cho phần công thức và biên dịch thử VBA), `python3 scripts/lint_vba.py`.
- File DEMO: `python3 scripts/build_demo.py --out samples/demo`.
- Mã VBA chỉ ký tự ASCII, dòng CRLF; chuỗi tiếng Việt đi qua `TR("khoa")` hoặc `U("\uXXXX")`.
