import { similarWorkType } from './capability.js';

const BLOCKS = {
  'thuy-loi': ['Phạm vi kênh/mương/hồ', 'Tổ chức dòng chảy tạm', 'Đào đắp và đầm chặt', 'Kết cấu BTCT công trình trên kênh', 'An toàn hố đào / mùa mưa'],
  'giao-thong': ['Phạm vi nền — mặt đường', 'Thi công nền đất', 'Kết cấu áo đường', 'Công thoát nước ngang', 'Tổ chức giao thông thi công'],
  'cap-thoat': ['Phạm vi tuyến ống', 'Hố đào và chống sạt', 'Lắp đặt ống và van', 'Thử áp / thông tắc', 'Hoàn trả mặt bằng'],
  'ke-bo': ['Phạm vi tuyến kè', 'Xử lý nền', 'Kết cấu thân kè', 'Thoát nước sau kè', 'An toàn bờ sông'],
  'dan-dung': ['Phần móng', 'Phần thân', 'Mái và hoàn thiện', 'Hệ thống kỹ thuật', 'An toàn lao động trên cao']
};

const COMMON = [
  'Căn cứ pháp lý và HSMT (chỉ mục lục)',
  'Hiện trạng và điều kiện thi công',
  'Tổ chức bộ máy và nhân sự chủ chốt',
  'Bố trí thiết bị (liệt kê, không bịa công suất)',
  'Biện pháp an toàn — PCCC — môi trường',
  'Tiến độ tổng (cột mốc, không bịa ngày)',
  'Nghiệm thu và bàn giao'
];

export function methodOutline(tender = {}, capability = {}) {
  const work = similarWorkType(tender.bidName || tender.projectName || '') || 'khac';
  const extra = BLOCKS[work] || ['Phạm vi công việc chính', 'Biện pháp thi công chung'];
  const trades = Array.isArray(capability.trades) ? capability.trades.slice(0, 6) : [];
  const title = String(tender.bidName || 'Gói thầu').slice(0, 180);
  return {
    title: `Khung biện pháp thi công — ${title}`,
    workType: work,
    disclaimer: 'Chỉ là MỤC LỤC khung. Không điền khối lượng, đơn giá hay tiến độ giả.',
    sections: [
      ...COMMON.slice(0, 2),
      ...extra,
      ...COMMON.slice(2),
      ...(trades.length ? [`Ghi chú nghề công ty: ${trades.join(', ')}`] : [])
    ]
  };
}
