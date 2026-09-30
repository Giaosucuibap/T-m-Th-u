# Kế hoạch xây dựng phần mềm dự toán Trường An trên Excel

Bộ đặc tả triển khai và hướng dẫn dùng Claude Code cùng Codex • Ngày 30 tháng 9 năm 2026 • Phiên bản kế hoạch 1.0

Đề xuất xây dựng TA Estimate theo dạng add-in Excel. Người dùng tra định mức xây dựng và thủy lợi, chọn công tác, nhập khối lượng và giá, kiểm tra hao phí rồi lập dự toán ngay trong một file công trình. Bản đầu ưu tiên Windows và Excel Microsoft 365 hoặc Excel 2024 bản 64 bit.

Đầu ra của giai đoạn lập kế hoạch gồm tài liệu này và bộ TA_Estimate_Starter. Bộ khởi động chứa đặc tả, dữ liệu thử, tiêu chí nghiệm thu và 10 prompt giao việc; bước lập trình sẽ tạo add-in, mẫu công trình và bộ dữ liệu đã kiểm tra.

| Quyết định | Phương án đề xuất |
| --- | --- |
| Sản phẩm dùng hằng ngày | TA_Estimate.xlam và mỗi công trình một file .xlsx. |
| Công nghệ bản đầu | VBA, công thức Excel thông thường, dữ liệu danh mục .xlsx chỉ đọc. |
| Dữ liệu định mức | Tách bộ xây dựng, thủy lợi và định mức nội bộ; lưu nguồn và phiên bản. |
| Khả năng dùng ngoại tuyến | Tra cứu và tính toán từ dữ liệu đã cài trên máy. |
| Phạm vi thí điểm | Khoảng 150 mã đã kiểm tra; 3 hồ sơ: kênh bê tông, đường và khoan phụt. |
| Thời gian dự kiến | 6–8 tuần với 1 người lập trình có AI hỗ trợ và 1 kỹ sư QS kiểm tra dữ liệu. |

Mốc thời gian là ước lượng lập kế hoạch, phụ thuộc chất lượng tài liệu nguồn và thời gian kiểm tra trên Excel thật. Việc nhập toàn bộ thư viện định mức được triển khai sau khi lõi tính và một bộ dữ liệu nhỏ đạt nghiệm thu.

Trình tự đọc: các mục 1–3 để chốt phạm vi; mục 4–8 để giao kỹ thuật; mục 9–12 để cài đặt, lập trình và nghiệm thu; mục 13 để mở nguồn đối chiếu.
