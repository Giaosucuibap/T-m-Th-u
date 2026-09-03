/* Máy chủ e-GP giả lập — dựng lại đúng hình dạng dữ liệu của
 * muasamcong.mpi.gov.vn để chạy thử tiện ích mà không đụng vào máy chủ thật. */
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MOCK_PORT || 8443);

const SEARCH = '/o/egp-portal-contractor-selection-v2/services/smart/search';
const LOT_OPEN = '/services/expose/ldtkqmt/bid-notification-p/lotOpenDetail';

const PROVINCES = ['Lâm Đồng', 'Đồng Nai', 'Khánh Hòa', 'Đắk Lắk', 'Gia Lai', 'Quảng Ngãi'];
const NAMES = [
  'Thi công xây lắp kênh mương nội đồng N1, N2 xã Đơn Dương',
  'Sửa chữa nâng cấp hồ chứa nước Đạ Tẻh giai đoạn 2',
  'Xây dựng trạm bơm tưới Hàm Đức và hệ thống kênh dẫn',
  'Khoan phụt chống thấm thân đập hồ Sông Quao',
  'Thi công đường giao thông nông thôn kết hợp kênh tiêu',
  'Mua sắm thiết bị văn phòng cho khối cơ quan',
  'Cải tạo cống lấy nước đầu mối hồ Cà Giây',
  'Nâng cấp kè chống sạt lở bờ sông Cái Nha Trang'
];
const INVESTORS = [
  'Ban Quản lý dự án đầu tư xây dựng huyện Đơn Dương',
  'UBND xã Hàm Đức',
  'Sở Nông nghiệp và Phát triển nông thôn tỉnh Lâm Đồng',
  'Ban QLDA đầu tư xây dựng công trình NN&PTNT tỉnh Khánh Hòa'
];

/** Một bản ghi TBMT đúng hình dạng chỉ mục Elasticsearch của e-GP. */
function record(i) {
  const n = 2600455000 + i;
  const days = (i % 20) - 4;                       // có gói đã đóng, có gói còn mở
  const close = new Date(Date.now() + days * 86400000);
  const pub = new Date(Date.now() - (30 - (i % 30)) * 86400000);
  return {
    id: String(500000 + i),
    notifyId: String(500000 + i),
    notifyNo: `IB${n}`,
    bidNo: `BP${2600643000 + i}`,
    planNo: `PL${2600259000 + i}`,
    notifyVersion: String(i % 3),
    bidName: NAMES[i % NAMES.length] + ` (gói số ${(i % 9) + 1})`,
    projectName: 'Dự án ' + NAMES[(i + 2) % NAMES.length],
    investorName: INVESTORS[i % INVESTORS.length],
    procuringEntityName: INVESTORS[(i + 1) % INVESTORS.length],
    investFieldName: i % 6 === 5 ? 'Hàng hóa' : 'Xây lắp',
    bidField: i % 6 === 5 ? 'HH' : 'XL',
    bidForm: 'DTRR',
    bidMode: 'MTQM',
    processApply: 'MTQM',
    stepCode: i % 3 === 0 ? 'notify-contractor-step-2-kqmt' : 'notify-contractor-step-1-tbmt',
    publicDateKqmt: pub.toISOString(),
    contractTypeName: 'Trọn gói',
    bidPrice: 1_000_000_000 + (i % 40) * 1_750_000_000,
    publicDate: pub.toISOString(),
    bidCloseDate: close.toISOString(),
    locations: [{ provName: PROVINCES[i % PROVINCES.length], districtName: 'Xã Đơn Dương', provCode: '68' }],
    isInternet: true,
    caseKHKQ: 1
  };
}

const ALL = Array.from({ length: 137 }, (_, i) => record(i));

/** Một bản ghi KHLCNT (`es-plan-project-p`). Một nửa là kế hoạch năm cũ —
 *  đúng thứ người dùng than phiền là bị lẫn vào kết quả. */
function plan(i) {
  // "Cũ hay mới" phải ĐỘC LẬP với tỉnh, nếu không thì bộ lọc địa bàn đã loại
  // sạch kế hoạch năm cũ trước khi bộ lọc ngày kịp làm gì — phép thử sẽ xanh
  // mà chẳng chứng minh được điều gì.
  const cu = Math.floor(i / PROVINCES.length) % 2 === 1;
  const duyet = cu
    ? new Date(2025, 10, 20, 10, 0, 0)             // 20/11/2025
    : new Date(Date.now() - (i % 60) * 86400000);  // trong vòng 60 ngày
  return {
    id: String(900000 + i),
    planNo: cu ? `PL${2500319000 + i}` : `PL${2600286000 + i}`,
    planName: 'Kế hoạch lựa chọn nhà thầu ' + NAMES[i % NAMES.length],
    projectName: 'Dự án ' + NAMES[(i + 3) % NAMES.length],
    investorName: INVESTORS[i % INVESTORS.length],
    decisionNo: `${100 + i}/QĐ-UBND`,
    decisionDate: duyet.toISOString(),
    publicDate: new Date(duyet.getTime() + 3 * 86400000).toISOString(),
    bidName: [NAMES[i % NAMES.length] + ' (gói 1)', NAMES[(i + 1) % NAMES.length] + ' (gói 2)'],
    bidPrice: [1_200_000_000 + (i % 20) * 450_000_000, 800_000_000 + (i % 15) * 320_000_000],
    totalPlanPrice: 2_000_000_000 + (i % 25) * 900_000_000,
    locations: [{ provName: PROVINCES[i % PROVINCES.length], districtName: 'Xã Đơn Dương', provCode: '68' }]
  };
}

const PLANS = Array.from({ length: 60 }, (_, i) => plan(i));

/** e-GP thật BỎ QUA LẶNG LẼ bộ lọc nó không hiểu — không báo lỗi, trả về tất.
 *  Máy chủ giả lập cố tình cư xử y hệt: chỉ tách theo `type`, mặc kệ khoảng
 *  thời gian. Nhờ vậy phép thử chứng minh được rằng thứ bảo đảm kết quả là
 *  lớp lọc lại TẠI CHỖ, chứ không phải bộ lọc gửi lên máy chủ. */
function datasetFor(env) {
  const filters = env?.query?.[0]?.filters || [];
  const type = filters.find((f) => f.fieldName === 'type');
  const values = [].concat(type?.fieldValues || []).join(',');
  return values.includes('es-plan-project-p') ? PLANS : ALL;
}

const PAGE_HTML = fs.readFileSync(path.join(HERE, 'mock-page.html'), 'utf8');

const server = https.createServer(
  {
    key: fs.readFileSync(path.join(HERE, 'certs/key.pem')),
    cert: fs.readFileSync(path.join(HERE, 'certs/cert.pem'))
  },
  (req, res) => {
    const url = new URL(req.url, 'https://muasamcong.mpi.gov.vn');

    if (url.pathname === SEARCH) {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let env = {};
        try { env = JSON.parse(body)[0] || {}; } catch {}
        const size = Number(env.pageSize || 10);
        const page = Number(env.pageNumber ?? env.pageNo ?? env.page ?? 0);
        const start = page * size;
        const data = datasetFor(env);
        const content = data.slice(start, start + size);
        console.log(`[mock] SEARCH page=${page} size=${size} -> ${content.length}/${data.length} bản ghi` +
          (env.query ? ` | query.filters=${(env.query[0]?.filters || []).map((f) => f.fieldName).join(',')}` : ''));
        res.writeHead(200, { 'content-type': 'application/json;charset=UTF-8' });
        res.end(JSON.stringify({
          page: {
            content,
            totalPages: Math.ceil(data.length / size),
            totalElements: data.length,
            currentPage: page,
            pageSize: size
          }
        }));
      });
      return;
    }

    if (url.pathname === LOT_OPEN) {
      res.writeHead(200, { 'content-type': 'application/json;charset=UTF-8' });
      res.end(JSON.stringify([
        { contractorName: 'CÔNG TY TNHH XÂY DỰNG A', taxCode: '3401122219', bidValue: 4683763268 },
        { contractorName: 'CÔNG TY TNHH XÂY DỰNG B', taxCode: '3401080939', bidValue: 4701963066 }
      ]));
      return;
    }

    if (url.pathname.startsWith('/vi/web/guest/') || url.pathname === '/web/guest/home' || url.pathname === '/') {
      // Trang chi tiết một biên bản. Cứ 2 gói thì 1 gói KHÔNG gọi lotOpenDetail
      // — đúng tình huống thật, và là chỗ trước đây vòng lặp nằm chết 20 giây.
      if (url.searchParams.get('step') === 'bbmt' || url.searchParams.get('notifyNo')) {
        const no = url.searchParams.get('notifyNo') || '';
        const coDuLieu = (Number(no.replace(/\D/g, '').slice(-1)) % 2) === 0;
        console.log(`[mock] chi tiết ${no} — ${coDuLieu ? 'CÓ' : 'KHÔNG'} trả nhà thầu`);
        res.writeHead(200, { 'content-type': 'text/html;charset=UTF-8' });
        res.end(`<!doctype html><meta charset=utf-8><title>Biên bản ${no}</title>
          <body><h1>Biên bản mở thầu ${no}</h1>
          <script>${coDuLieu ? `
            const x = new XMLHttpRequest();
            x.open('POST', '${LOT_OPEN}'); x.send('{}');` : ''}</script></body>`);
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html;charset=UTF-8' });
      res.end(PAGE_HTML);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
);

server.listen(PORT, '127.0.0.1', () => console.log(`[mock] e-GP giả lập chạy ở https://127.0.0.1:${PORT} (${ALL.length} gói thầu)`));
