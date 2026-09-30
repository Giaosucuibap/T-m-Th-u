# 6 Quy tắc tính và trường hợp dễ sai

Bước đầu quy đổi khối lượng nhập về đơn vị cơ sở. Sau đó chia cho quy mô một đơn vị định mức. Ví dụ định mức tính cho 100 m³, khối lượng công tác 250 m³ thì hệ số số lượng là 2,5; không nhân trực tiếp 250 với hao phí của 100 m³.

```text
So_don_vi_DM = Khoi_luong_nhap × He_so_doi_don_vi / Norm_basis_qty
Hao_phi_ap_dung = Hao_phi_goc × He_so_duoc_phep
Luong_tai_nguyen = So_don_vi_DM × Hao_phi_ap_dung
Thanh_tien_tai_nguyen = Luong_tai_nguyen × Gia_ap_dung
```

Chỉ quy đổi tự động khi cùng đại lượng và cùng trạng thái vật lý. Đất nguyên thổ, đất rời và đất đầm chặt không tự coi là cùng m³. Hệ số áp dụng phải chỉ rõ tác động vào vật liệu, nhân công, máy hoặc một nhóm hao phí, kèm căn cứ.

Ví dụ kiểm thử giả lập cho 250 m³, định mức theo 100 m³: vật liệu 10 kg × 20.000 đ/kg; nhân công 2 công × 400.000 đ/công; máy 1 ca × 1.000.000 đ/ca. Chi phí trực tiếp là 5.000.000 đ. Nếu giả định vật liệu khác bằng 2% tiền vật liệu chính thì thêm 10.000 đ; tổng 5.010.000 đ. Các giá và hao phí này chỉ dùng thử phép tính.

- Chi phí khác theo %: lấy đúng tập dòng làm cơ sở; không tự lấy toàn bộ chi phí trực tiếp. Phát hiện vòng lặp khi khoản % lấy chính nó làm cơ sở.
- Cấp phối: bê tông thương phẩm hoặc tự trộn là lựa chọn có kiểm soát; không vừa tính tiền bê tông mua vừa cộng xi măng, cát, đá của cấp phối.
- Ca máy: chọn dùng giá ca máy đã xác định hoặc tự tính từ thành phần; không cộng lại nhiên liệu và thợ điều khiển đã nằm trong ca máy.
- Giá hiện trường: thể hiện giá gốc, chi phí vận chuyển và bốc xếp; ghi rõ giá nguồn đã gồm khoản nào để tránh cộng trùng.
- Thuế và chi phí gián tiếp: cấu hình theo hồ sơ, loại công trình, thời điểm và căn cứ. Không ghi cứng một thuế suất hoặc một tỷ lệ cho mọi công trình.

Chốt quy tắc làm tròn: lượng tài nguyên giữ độ chính xác tính toán; đơn giá, thành tiền và tổng hợp làm tròn tại các cấp đã khai báo. Dùng cùng quy tắc trong Excel và bộ kiểm thử; tránh khác biệt giữa VBA Round và Excel ROUND.
