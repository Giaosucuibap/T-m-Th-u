/* DỮ LIỆU MẪU — chỉ dùng cho bản xem trước giao diện trên web (không có WebView).
 * Hình dạng bản ghi giống chỉ mục e-GP để đi qua ĐÚNG lõi chuẩn hoá và chấm điểm,
 * nhưng mọi tên, mã, giá đều là giả và được ghi rõ "mẫu". */
const NAMES = [
  'Thi công xây lắp kênh mương nội đồng N1, N2',
  'Sửa chữa, nâng cấp hồ chứa nước giai đoạn 2',
  'Xây dựng trạm bơm tưới và hệ thống kênh dẫn',
  'Khoan phụt chống thấm thân đập hồ chứa',
  'Thi công đường giao thông nông thôn kết hợp kênh tiêu',
  'Cải tạo cống lấy nước đầu mối hồ chứa',
  'Nâng cấp kè chống sạt lở bờ sông',
  'Mua sắm thiết bị văn phòng cho khối cơ quan',
  'Nạo vét kênh tiêu thoát nước khu dân cư',
  'Tư vấn giám sát thi công công trình thủy lợi'
];
const INVESTORS = ['Ban QLDA đầu tư xây dựng khu vực (mẫu)', 'UBND xã (mẫu)', 'Sở Nông nghiệp và Môi trường (mẫu)', 'Công ty TNHH MTV Khai thác thủy lợi (mẫu)'];
const PROVINCES = [['Lâm Đồng', '68'], ['Lâm Đồng', '68'], ['Đồng Nai', '75'], ['Khánh Hòa', '56'], ['Lâm Đồng', '703']];

export function sampleRecords(count = 48, now = Date.now()) {
  return Array.from({ length: count }, (_, i) => {
    const [provName, provCode] = PROVINCES[i % PROVINCES.length];
    const name = NAMES[i % NAMES.length];
    const field = /thiết bị/.test(name) ? 'HH' : /Tư vấn/.test(name) ? 'TV' : 'XL';
    const closeDays = (i % 17) - 3;
    return {
      notifyId: String(910000 + i),
      notifyNo: `IB99000${String(10000 + i)}`,
      notifyVersion: '00',
      bidName: `${name} (mẫu ${i + 1})`,
      investorName: INVESTORS[i % INVESTORS.length],
      procuringEntityName: INVESTORS[(i + 1) % INVESTORS.length],
      investField: field,
      bidField: field,
      bidPrice: 800_000_000 + ((i * 7919) % 40) * 950_000_000,
      publicDate: new Date(now - ((i % 20) + 1) * 86400000).toISOString(),
      bidCloseDate: new Date(now + closeDays * 86400000 + (i % 5) * 3600000).toISOString(),
      locations: [{ provName, provCode, districtName: 'Xã mẫu' }],
      contractTypeName: 'Trọn gói',
      bidForm: 'DTRR',
      isInternet: true
    };
  });
}
