/* ============================================================================
 *  DỮ LIỆU "GIỐNG THẬT" CHO e-GP GIẢ LẬP — MOCK_CHAOS=real (4.23.0)
 *
 *  VÌ SAO CÓ TỆP NÀY. Hai lỗi người dùng chụp được trên iPad thật ngày 21/11/2026 đã lọt qua
 *  cả 80 phép kiểm của bản 4.22.0, vì dữ liệu giả lập quá "sạch":
 *    - tên nhà thầu ngắn ("CÔNG TY TNHH XÂY DỰNG A") nên không bảng nào bị ép cột;
 *    - danh mục chỉ 7 tỉnh, ghi trần "Lâm Đồng", "Đồng Nai" — trong khi e-GP thật ghi
 *      "Tỉnh Lâm Đồng", "Thành phố Đồng Nai" và có 34 đơn vị cùng hàng chục tên cũ.
 *  Chế độ `real` trả dữ liệu có HÌNH DẠNG như e-GP thật: tên pháp nhân 40–75 ký tự viết hoa,
 *  tên gói 90–160 ký tự, số tiền chục tỷ, liên danh, danh mục 34 tỉnh/thành kèm tên cũ, mỗi
 *  tỉnh hàng chục xã/phường. Chế độ mặc định của mock-egp.mjs KHÔNG đổi một byte nào (các con
 *  số 137 · 115 mà những bài khác đang canh vẫn nguyên).
 *
 *  TÊN TRONG TỆP NÀY LÀ TÊN MINH HOẠ: tên pháp nhân và mã số thuế (bắt đầu bằng 99) là bịa;
 *  tên tỉnh/thành theo danh mục hiện hành; mã tỉnh chỉ những mã đã quan sát được trên e-GP
 *  (01/101, 68/703, 75/713, 707, 92/815) là thật, số còn lại đặt cho đủ bộ.
 * ========================================================================== */

/** 34 đơn vị hiện hành (9 thành phố từ 20/9/2026) — [mã, tên như e-GP ghi]. */
const CURRENT = [
  ['01', 'Thành phố Hà Nội'], ['04', 'Tỉnh Cao Bằng'], ['08', 'Tỉnh Tuyên Quang'], ['11', 'Tỉnh Điện Biên'], ['12', 'Tỉnh Lai Châu'], ['14', 'Tỉnh Sơn La'],
  ['15', 'Tỉnh Lào Cai'], ['19', 'Tỉnh Thái Nguyên'], ['20', 'Tỉnh Lạng Sơn'], ['22', 'Thành phố Quảng Ninh'], ['24', 'Thành phố Bắc Ninh'], ['25', 'Tỉnh Phú Thọ'],
  ['31', 'Thành phố Hải Phòng'], ['33', 'Tỉnh Hưng Yên'], ['37', 'Tỉnh Ninh Bình'], ['38', 'Tỉnh Thanh Hóa'], ['40', 'Tỉnh Nghệ An'], ['42', 'Tỉnh Hà Tĩnh'],
  ['44', 'Tỉnh Quảng Trị'], ['46', 'Thành phố Huế'], ['48', 'Thành phố Đà Nẵng'], ['51', 'Tỉnh Quảng Ngãi'], ['64', 'Tỉnh Gia Lai'], ['56', 'Tỉnh Khánh Hòa'],
  ['66', 'Tỉnh Đắk Lắk'], ['68', 'Tỉnh Lâm Đồng'], ['75', 'Thành phố Đồng Nai'], ['79', 'Thành phố Hồ Chí Minh'], ['80', 'Tỉnh Tây Ninh'], ['82', 'Tỉnh Đồng Tháp'],
  ['86', 'Tỉnh Vĩnh Long'], ['91', 'Tỉnh An Giang'], ['92', 'Thành phố Cần Thơ'], ['96', 'Tỉnh Cà Mau']
];
/** Tên cũ còn trong danh mục (status 0): trùng tên đơn vị hiện hành, và 29 tỉnh đã nhập vào tỉnh khác. */
const LEGACY = [
  ['101', 'Thành phố Hà Nội'], ['703', 'Tỉnh Lâm Đồng'], ['713', 'Tỉnh Đồng Nai'], ['815', 'Thành phố Cần Thơ'], ['707', 'Tỉnh Bình Phước'],
  ['702', 'Tỉnh Hà Giang'], ['704', 'Tỉnh Yên Bái'], ['705', 'Tỉnh Bắc Kạn'], ['706', 'Tỉnh Vĩnh Phúc'], ['708', 'Tỉnh Hòa Bình'], ['709', 'Tỉnh Bắc Giang'],
  ['710', 'Tỉnh Thái Bình'], ['711', 'Tỉnh Hải Dương'], ['712', 'Tỉnh Hà Nam'], ['714', 'Tỉnh Nam Định'], ['715', 'Tỉnh Quảng Bình'], ['716', 'Tỉnh Quảng Nam'],
  ['717', 'Tỉnh Kon Tum'], ['718', 'Tỉnh Bình Định'], ['719', 'Tỉnh Ninh Thuận'], ['720', 'Tỉnh Đắk Nông'], ['721', 'Tỉnh Bình Thuận'], ['722', 'Tỉnh Phú Yên'],
  ['723', 'Tỉnh Bình Dương'], ['724', 'Tỉnh Bà Rịa - Vũng Tàu'], ['725', 'Tỉnh Long An'], ['726', 'Tỉnh Sóc Trăng'], ['727', 'Tỉnh Hậu Giang'], ['728', 'Tỉnh Bến Tre'],
  ['729', 'Tỉnh Trà Vinh'], ['730', 'Tỉnh Tiền Giang'], ['731', 'Tỉnh Bạc Liêu'], ['732', 'Tỉnh Kiên Giang'], ['733', 'Tỉnh Thừa Thiên Huế']
];
export const REAL_PROVINCES = [
  ...CURRENT.map(([code, name]) => ({ code, name, parentCode: '', status: 1 })),
  ...LEGACY.map(([code, name]) => ({ code, name, parentCode: '', status: 0 }))
];

const WARD_NAMES = {
  68: ['Phường Xuân Hương - Đà Lạt', 'Phường Cam Ly - Đà Lạt', 'Phường Lâm Viên - Đà Lạt', 'Phường Xuân Trường - Đà Lạt', 'Phường Lang Biang - Đà Lạt', 'Xã Lạc Dương', 'Xã Đơn Dương', 'Xã Ka Đô',
    'Xã Quảng Lập', "Xã D'Ran", 'Xã Hiệp Thạnh', 'Xã Đức Trọng', 'Xã Tân Hội', 'Xã Tà Hine', 'Xã Tà Năng', 'Xã Đinh Văn Lâm Hà', 'Xã Phú Sơn Lâm Hà', 'Xã Nam Hà Lâm Hà', 'Xã Nam Ban Lâm Hà',
    'Xã Tân Hà Lâm Hà', 'Xã Phúc Thọ Lâm Hà', 'Xã Đam Rông 1', 'Xã Đam Rông 2', 'Xã Đam Rông 3', 'Xã Đam Rông 4', 'Xã Di Linh', 'Xã Hòa Ninh', 'Xã Hòa Bắc', 'Xã Đinh Trang Thượng', 'Xã Bảo Thuận',
    'Xã Sơn Điền', 'Xã Gia Hiệp', 'Phường 1 Bảo Lộc', 'Phường 2 Bảo Lộc', 'Phường 3 Bảo Lộc', "Phường B'Lao", 'Xã Bảo Lâm 1', 'Xã Bảo Lâm 2', 'Xã Bảo Lâm 3', 'Xã Đạ Huoai', 'Xã Đạ Tẻh', 'Xã Cát Tiên',
    'Phường Phan Thiết', 'Phường Mũi Né', 'Phường Phú Thủy', 'Phường Hàm Thắng', 'Xã Hàm Thuận', 'Xã Hàm Thạnh', 'Xã Tuy Phong', 'Xã Bắc Bình', 'Phường Bắc Gia Nghĩa', 'Phường Nam Gia Nghĩa',
    'Xã Đắk Mil', 'Xã Krông Nô', 'Đặc khu Phú Quý'],
  75: ['Phường Biên Hòa', 'Phường Trấn Biên', 'Phường Tam Hiệp', 'Phường Long Bình', 'Phường Trảng Dài', 'Phường Hố Nai', 'Phường Long Hưng', 'Xã Đại Phước', 'Xã Nhơn Trạch', 'Xã Phước An',
    'Xã Long Thành', 'Xã Bình An', 'Xã An Phước', 'Xã Trảng Bom', 'Xã Thống Nhất', 'Phường Long Khánh', 'Phường Bình Lộc', 'Xã Xuân Lộc', 'Xã Định Quán', 'Xã Tân Phú', 'Phường Bình Phước',
    'Phường Đồng Xoài', 'Xã Bù Đăng', 'Xã Lộc Ninh', 'Phường Chơn Thành', 'Xã Đồng Phú', 'Xã Phú Riềng', 'Phường Phước Long', 'Xã Bù Gia Mập', 'Xã Hớn Quản'],
  56: ['Phường Nha Trang', 'Phường Bắc Nha Trang', 'Phường Tây Nha Trang', 'Phường Nam Nha Trang', 'Phường Cam Ranh', 'Xã Diên Khánh', 'Xã Vạn Ninh', 'Phường Phan Rang', 'Xã Ninh Phước', 'Đặc khu Trường Sa'],
  66: ['Phường Buôn Ma Thuột', 'Phường Tân Lập', 'Xã Ea Kar', 'Xã Krông Pắc', 'Phường Tuy Hòa', 'Xã Sông Hinh'],
  64: ['Phường Pleiku', 'Xã Chư Sê', 'Phường Quy Nhơn', 'Xã Tây Sơn', 'Xã An Khê'],
  51: ['Phường Cẩm Thành', 'Xã Bình Sơn', 'Phường Kon Tum', 'Xã Đăk Tô', 'Đặc khu Lý Sơn'],
  92: ['Phường Ninh Kiều', 'Phường Cái Răng', 'Phường Sóc Trăng', 'Phường Vị Thanh'],
  703: ['Huyện Đức Trọng', 'Huyện Đơn Dương', 'Huyện Lâm Hà', 'Thành phố Đà Lạt', 'Thành phố Bảo Lộc'],
  713: ['Thành phố Biên Hòa', 'Huyện Long Thành', 'Huyện Trảng Bom'],
  707: ['Thành phố Đồng Xoài', 'Huyện Bù Đăng'],
  721: ['Thành phố Phan Thiết', 'Huyện Hàm Thuận Bắc', 'Huyện Tuy Phong']
};
const LEGACY_CODES = new Set(LEGACY.map(([code]) => code));
/** Trả đúng nhóm địa bàn mà tiện ích hỏi: areaType 1 = tỉnh, 2 = xã/phường của một mã tỉnh. */
export function realAreaList(spec = {}) {
  if (String(spec.areaType) === '1') return REAL_PROVINCES;
  if (String(spec.areaType) === '2') {
    const parent = String(spec.parentCode || '').trim();
    const base = Number(parent) * 1000;
    return (WARD_NAMES[parent] || []).map((name, i) => ({ code: String(base + 101 + i * 3), name, parentCode: parent, status: LEGACY_CODES.has(parent) ? 0 : 1 }));
  }
  return [];
}

/* --------------------------------------------------------------------------
 *  PHÁP NHÂN, CHỦ ĐẦU TƯ, TÊN GÓI — độ dài như trên e-GP thật
 * ------------------------------------------------------------------------ */
export const REAL_CONTRACTORS = [
  ['9900000011', 'CÔNG TY TNHH THIẾT KẾ XÂY DỰNG TỔ ẤM XANH'],
  ['9900000029', 'CÔNG TY TNHH ĐẦU TƯ XÂY DỰNG VÀ THƯƠNG MẠI HOÀNG PHÚC LÂM ĐỒNG'],
  ['9900000037', 'CÔNG TY CỔ PHẦN TƯ VẤN XÂY DỰNG THỦY LỢI NAM TÂY NGUYÊN'],
  ['9900000045', 'CÔNG TY TNHH MỘT THÀNH VIÊN KHAI THÁC CÔNG TRÌNH THỦY LỢI HỒ ĐA TẺH'],
  ['9900000053', 'CÔNG TY TNHH XÂY LẮP VÀ CƠ ĐIỆN SÔNG ĐA NHIM'],
  ['9900000061', 'CÔNG TY CỔ PHẦN XÂY DỰNG CÔNG TRÌNH GIAO THÔNG VÀ HẠ TẦNG KỸ THUẬT BẢO LỘC'],
  ['9900000079', 'DOANH NGHIỆP TƯ NHÂN XÂY DỰNG HÒA BÌNH'],
  ['9900000087', 'CÔNG TY TNHH KHOAN PHỤT CHỐNG THẤM VÀ XỬ LÝ NỀN MÓNG ĐẠI NGÀN'],
  ['9900000095', 'CÔNG TY CỔ PHẦN ĐẦU TƯ PHÁT TRIỂN HẠ TẦNG NÔNG NGHIỆP VÀ NÔNG THÔN ĐỒNG NAI'],
  ['9900000102', 'CÔNG TY TNHH XÂY DỰNG TRƯỜNG THỊNH'],
  ['9900000110', 'CÔNG TY TNHH TƯ VẤN THIẾT KẾ VÀ GIÁM SÁT CÔNG TRÌNH THỦY LỢI, THỦY ĐIỆN LANG BIANG'],
  ['9900000128', 'CÔNG TY CỔ PHẦN CƠ KHÍ VÀ XÂY LẮP TRẠM BƠM MIỀN ĐÔNG'],
  ['9900000136', 'HỢP TÁC XÃ DỊCH VỤ NÔNG NGHIỆP VÀ THI CÔNG KÊNH MƯƠNG NỘI ĐỒNG TÂN HÀ'],
  ['9900000144', 'CÔNG TY TNHH THƯƠNG MẠI DỊCH VỤ XÂY DỰNG AN PHÚ GIA'],
  ['9900000152', 'CHI NHÁNH TỔNG CÔNG TY XÂY DỰNG THỦY LỢI 4 - CÔNG TY CỔ PHẦN TẠI LÂM ĐỒNG'],
  ['9900000160', 'CÔNG TY TNHH NAM SƠN']
].map(([taxCode, name]) => ({ taxCode, name }));

export const REAL_INVESTORS = [
  ['vnz000030101', 'Ban Quản lý dự án đầu tư xây dựng và Phát triển quỹ đất khu vực Đức Trọng'],
  ['vnz000030102', 'Ban Quản lý dự án đầu tư xây dựng công trình Nông nghiệp và Phát triển nông thôn tỉnh Lâm Đồng'],
  ['vnz000030103', 'Sở Nông nghiệp và Môi trường tỉnh Lâm Đồng'],
  ['vnz000030104', 'Công ty TNHH Một thành viên Khai thác công trình thủy lợi Lâm Đồng'],
  ['vnz000030105', 'Ủy ban nhân dân xã Đơn Dương'],
  ['vnz000030106', 'Ban Quản lý dự án đầu tư xây dựng khu vực Biên Hòa'],
  ['vnz000030107', 'Chi cục Thủy lợi và Phòng chống thiên tai thành phố Đồng Nai'],
  ['vnz000030108', 'Ban Quản lý dự án đầu tư xây dựng các công trình giao thông và nông nghiệp tỉnh Khánh Hòa'],
  ['vnz000030109', 'Ủy ban nhân dân phường Bình Phước'],
  ['vnz000030110', 'Trung tâm Phát triển hạ tầng kỹ thuật và Quản lý công trình công cộng thành phố Đồng Nai']
].map(([code, name]) => ({ code, name }));

const BID_NAMES = [
  'Gói thầu số 03: Thi công xây dựng công trình Sửa chữa, nâng cấp hệ thống kênh tưới hồ chứa nước Đa Tẻh, đoạn từ K2+350 đến K7+900 (giai đoạn 2)',
  'Thi công xây dựng và cung cấp, lắp đặt thiết bị công trình Trạm bơm tưới Hàm Thạnh và hệ thống kênh dẫn nội đồng',
  'Gói thầu xây lắp số 01: Khoan phụt chống thấm thân đập và xử lý thấm vai trái hồ chứa nước Ka Đô',
  'Sửa chữa, nâng cấp hồ chứa nước Tà Hine, xã Tà Hine',
  'Gói thầu số 05: Nạo vét, kiên cố hóa kênh tiêu T3 kết hợp đường giao thông nội đồng khu vực Tân Hội',
  'Xây dựng kè chống sạt lở bờ sông Đa Nhim đoạn qua xã Đơn Dương (bao gồm chi phí hạng mục chung và đảm bảo an toàn giao thông đường thủy)',
  'Thi công xây dựng hệ thống cấp nước sinh hoạt tập trung liên xã Hiệp Thạnh, Tân Hội',
  'Gói thầu số 02: Tư vấn giám sát thi công xây dựng và lắp đặt thiết bị công trình Hồ chứa nước Đạ Sị',
  'Cải tạo, nâng cấp cống lấy nước đầu mối và tràn xả lũ hồ Đạ Tẻh',
  'Duy tu, bảo dưỡng thường xuyên hệ thống kênh mương thủy lợi năm 2026 trên địa bàn các xã phía Nam',
  'Mua sắm vật tư, thiết bị phục vụ công tác quản lý, vận hành công trình thủy lợi năm 2026',
  'Gói thầu số 07: Xây dựng hạ tầng kỹ thuật khu tái định cư phục vụ dự án đường cao tốc Tân Phú - Bảo Lộc'
];
const FORMS = ['DTRR', 'CHCT', 'CDTRG', 'CDT', 'DTRR', 'DTRR', 'CHCT'];
const iso = (ms) => new Date(ms).toISOString();
const DAY = 86400000;
const NOW = Date.now();

/** Tỉnh của bản ghi i: nửa Lâm Đồng, một phần tư Đồng Nai, còn lại rải các tỉnh khác. */
function placeOf(i) {
  const pick = i % 8 < 4 ? '68' : i % 8 < 6 ? '75' : ['56', '66', '64', '51'][i % 4];
  const province = CURRENT.find(([code]) => code === pick);
  const wards = WARD_NAMES[pick] || [];
  const ward = wards[i % (wards.length || 1)] || '';
  return { provCode: pick, provName: province[1], districtName: ward, wardCode: ward ? String(Number(pick) * 1000 + 101 + (i % wards.length) * 3) : '' };
}

/** Một TBMT (đang mời thầu / đã mở thầu). */
function tender(i) {
  const place = placeOf(i);
  const investor = REAL_INVESTORS[(place.provCode === '75' ? 5 : place.provCode === '56' ? 7 : 0) + (i % (place.provCode === '68' ? 5 : place.provCode === '75' ? 2 : 1))];
  const days = (i % 20) - 4;
  const hh = i % 6 === 5;
  return {
    id: String(600000 + i), notifyId: String(600000 + i), notifyNo: `IB${2600460000 + i}`, bidNo: `BP${2600650000 + i}`, planNo: `PL${2600270000 + i}`,
    notifyVersion: String(i % 3), bidName: BID_NAMES[i % BID_NAMES.length], projectName: `Dự án ${BID_NAMES[(i + 5) % BID_NAMES.length].replace(/^Gói thầu[^:]*:\s*/, '')}`,
    investorName: investor.name, investorCode: investor.code, procuringEntityName: investor.name, procuringEntityCode: investor.code,
    investFieldName: hh ? 'Hàng hóa' : 'Xây lắp', bidField: hh ? 'HH' : 'XL', investField: [hh ? 'HH' : 'XL'], bidForm: FORMS[i % FORMS.length], bidMode: 'MTQM', processApply: 'MTQM',
    stepCode: i % 3 === 0 ? 'notify-contractor-step-2-kqmt' : 'notify-contractor-step-1-tbmt', contractTypeName: 'Trọn gói',
    bidPrice: 1_850_000_000 + (i % 37) * 2_317_450_000, publicDate: iso(NOW - (30 - (i % 30)) * DAY), publicDateKqmt: iso(NOW - (30 - (i % 30)) * DAY), bidCloseDate: iso(NOW + days * DAY),
    bidOpenDate: iso(NOW + days * DAY + 3600000), locations: [{ provName: place.provName, provCode: place.provCode, districtName: place.districtName, wardName: place.districtName, wardCode: place.wardCode }], isInternet: 1, caseKHKQ: 1
  };
}
export const REAL_TENDERS = Array.from({ length: 168 }, (_, i) => tender(i));

/** Một KQLCNT (đã có nhà thầu trúng). Phân bổ lệch: vài nhà thầu trúng nhiều, có liên danh, có chỉ định thầu. */
function award(i) {
  const base = tender(1000 + i);
  const a = REAL_CONTRACTORS[(i * i + i) % 7 < 3 ? i % 4 : i % REAL_CONTRACTORS.length];
  const venture = i % 9 === 4;
  const b = REAL_CONTRACTORS[(i + 5) % REAL_CONTRACTORS.length];
  const year = 2023 + (i % 4);
  const decided = Date.UTC(year, (i * 5) % 12, 1 + (i % 27), 3);
  const win = Math.round(base.bidPrice * (1 - [0, 0.0031, 0.0125, 0, 0.047, 0.0008, 0.118, 0.021][i % 8]));
  return {
    ...base, notifyNo: `IB${String(year).slice(2)}00${String(300000 + i)}`, stepCode: 'notify-contractor-step-4-kqlcnt', statusForNotify: 'CNTTT',
    winningCode: venture ? [`vn${a.taxCode}`, `vn${b.taxCode}`] : [`vn${a.taxCode}`],
    winningContractorName: venture ? [a.name, b.name] : [a.name], contractorName: venture ? [`Liên danh ${a.name.replace(/^CÔNG TY (TNHH|CỔ PHẦN) /, '')} - ${b.name.replace(/^CÔNG TY (TNHH|CỔ PHẦN) /, '')}`] : [a.name],
    ventureName: venture ? `Liên danh gói thầu số ${(i % 9) + 1}` : '', bidWinningPrice: [win], bidEstimatePrice: i % 5 === 0 ? [base.bidPrice] : undefined,
    numBidderJoin: [1, 3, 0, 2, 5, 1, 4, 1][i % 8], decisionDate: iso(decided), publicDateKqlcnt: iso(decided + 2 * DAY), publicDate: iso(decided - 40 * DAY), bidCloseDate: iso(decided - 15 * DAY)
  };
}
export const REAL_AWARDS = Array.from({ length: 150 }, (_, i) => award(i));

/** Một KHLCNT. */
function plan(i) {
  const place = placeOf(i), investor = REAL_INVESTORS[i % REAL_INVESTORS.length];
  const old = Math.floor(i / 6) % 2 === 1;
  const approved = old ? new Date(2025, 10, 20, 10) : new Date(NOW - (i % 60) * DAY);
  const names = [BID_NAMES[i % BID_NAMES.length], BID_NAMES[(i + 1) % BID_NAMES.length], BID_NAMES[(i + 7) % BID_NAMES.length]];
  const prices = [12_480_335_000 + (i % 20) * 450_000_000, 3_595_791_470 + (i % 15) * 320_000_000, 472_567_429 + (i % 11) * 97_000_000];
  return {
    id: String(910000 + i), planNo: old ? `PL${2500320000 + i}` : `PL${2600290000 + i}`,
    planName: `Kế hoạch lựa chọn nhà thầu dự án ${BID_NAMES[i % BID_NAMES.length].replace(/^Gói thầu[^:]*:\s*/, '')}`, projectName: `Dự án ${BID_NAMES[(i + 3) % BID_NAMES.length].replace(/^Gói thầu[^:]*:\s*/, '')}`,
    investorName: investor.name, investorCode: investor.code, decisionNo: `${1200 + i}/QĐ-UBND`, decisionDate: approved.toISOString(), publicDate: iso(approved.getTime() + 3 * DAY),
    bidName: names, bidPrice: prices, totalPlanPrice: prices.reduce((x, y) => x + y, 0),
    // Bản ghi mới của e-GP ghi từng gói kèm giá và lĩnh vực của chính nó, nên không phải mở trang chi tiết để ghép giá.
    bidNamePlanNew: names.map((name, k) => ({ name, bidPrice: prices[k], investField: k === 2 ? 'TV' : 'XL' })),
    locations: [{ provName: place.provName, provCode: place.provCode, districtName: place.districtName }]
  };
}
export const REAL_PLANS = Array.from({ length: 72 }, (_, i) => plan(i));

const fold = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const valuesOf = (filter) => [].concat((filter && filter.fieldValues) || []).map(String);

/**
 * Tập bản ghi cho một truy vấn tìm kiếm. Khác chế độ mặc định, ở đây máy chủ LỌC THẬT theo mã
 * tỉnh, mã nhà thầu trúng, mã chủ đầu tư và từ khoá — đủ để một lượt "chọn Thành phố Đồng Nai
 * rồi tìm" chỉ trả gói của Đồng Nai, như e-GP thật.
 */
export function realDataset(env = {}) {
  const query = (env.query && env.query[0]) || {};
  const filters = query.filters || [];
  const find = (name) => filters.find((f) => f.fieldName === name);
  const type = valuesOf(find('type')).join(',');
  let data = type.includes('es-plan-project-p') ? REAL_PLANS : valuesOf(find('stepCode')).some((v) => /kqlcnt/.test(v)) ? REAL_AWARDS : REAL_TENDERS;
  const province = find('locations.provCode');
  if (province && valuesOf(province).length) { const codes = new Set(valuesOf(province)); data = data.filter((r) => (r.locations || []).some((l) => codes.has(String(l.provCode)))); }
  const winning = find('winningCode');
  if (winning && valuesOf(winning).length) { const codes = new Set(valuesOf(winning)); data = data.filter((r) => (r.winningCode || []).some((c) => codes.has(c))); }
  const investor = find('investorCode');
  if (investor && valuesOf(investor).length) { const codes = new Set(valuesOf(investor)); data = data.filter((r) => codes.has(r.investorCode)); }
  const words = fold(query.keyWord).split(/\s+/).filter(Boolean);
  if (words.length) {
    const fields = query.matchFields && query.matchFields.length ? query.matchFields : ['bidName', 'notifyNo'];
    data = data.filter((r) => { const hay = fold(fields.map((f) => [].concat(r[f] || []).join(' ')).join(' ')); return words.every((w) => hay.includes(w)); });
  }
  return data;
}

/** Danh sách nhà thầu dự một gói (trang chi tiết biên bản mở thầu). */
export function realBidders(seed = 0) {
  const n = 3 + (seed % 3);
  return Array.from({ length: n }, (_, k) => {
    const c = REAL_CONTRACTORS[(seed * 3 + k * 5) % REAL_CONTRACTORS.length];
    const price = 12_480_335_000 + k * 318_442_915 + (seed % 7) * 51_300_000, percent = k === 1 ? 2.5 : k === 3 ? 0.75 : 0;
    return { contractorName: c.name, contractorCode: `vn${c.taxCode}`, lotPrice: price, discountPercent: percent, lotFinalPrice: Math.round(price * (1 - percent / 100)),
      ventureName: k === 2 && seed % 2 ? `Liên danh ${c.name.replace(/^CÔNG TY (TNHH|CỔ PHẦN) /, '')} và các thành viên` : '' };
  });
}
