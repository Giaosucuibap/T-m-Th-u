# Phân chia module và build

| Module | Hợp đồng chức năng đề xuất |
|---|---|
| modEntry | Nhận lệnh Ribbon; xác định project workbook; điều phối và phục hồi trạng thái Excel. |
| modCatalog | LoadCatalog(path), FindNorms(query, filters), GetNorm(norm_id); trả dữ liệu bất biến. |
| modImport | PreviewImport, MapColumns, ValidateIncomingRows; đọc có kiểu và không thực thi công thức lạ. |
| modWorkbook | CreateProject, ValidateSchema, MigrateProjectWithBackup; tất cả Range có workbook rõ ràng. |
| modEstimate | InsertItem, BuildAnalysis, RefreshItem; tạo native formulas từ snapshot và item_id. |
| modCostRules | ValidateDependencyGraph, ApplyCostProfile; chỉ toán tử được cho phép. |
| modValidation | ValidateForDraft, ValidateForIssue; lỗi trả code, item_id, location, message. |
| modSnapshot | PinNorm, CompareCatalogRevisions, ApplyReviewedUpdate; không tự update công trình. |
| modExport | ExportWorkbook, SetupPrint, ExportPDF; loại bỏ dependency ngoài một cách minh bạch. |
| modLog | LogChange, SaveBackup; log hỗ trợ giải trình, không chống sửa tuyệt đối. |
| modTests | TA_SelfTest; kết quả ghi vào workbook test riêng. |

Đây là hợp đồng để hiện thực, không phải API đã có. Tách chức năng truy xuất dữ liệu, công thức và UI để test được riêng.

Build tối thiểu phải tái tạo từ nguồn .bas/.cls/.frm/.frx và Ribbon XML trên Windows có Excel. Nguồn tiếng Việt phải có chiến lược encoding rõ: giữ tên thủ tục ASCII, captions từ tài nguyên Unicode; kiểm nhập/xuất lại trên VBE thực. Bản phát hành chứa hash của code/template/catalog và danh sách phiên bản tương thích.

Không bắt người dùng cuối cài Python, Node, SQL Server, web server hoặc SDK để lập dự toán hằng ngày. Công cụ build/kiểm dữ liệu có thể dùng các runtime này ở máy phát triển nếu có lý do và được ghi trong README. Tất cả thao tác thường dùng của bản phát hành chạy trong Excel và ngoại tuyến.
