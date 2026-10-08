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
const AREA_LIST = '/o/egp-portal-contractor-selection-v2/services/get/area-api-list';

/* --------------------------------------------------------------------------
 *  DANH MỤC ĐỊA BÀN
 *
 *  Từ 4.10.1, tiện ích TỪ CHỐI CHẠY khi chưa tra được danh mục này — thà không
 *  chạy còn hơn âm thầm bỏ tiêu chí tỉnh rồi tìm toàn quốc. Nên bản giả lập
 *  phải phục vụ endpoint này, nếu không mọi kịch bản trình duyệt đều dừng ở
 *  cửa đó và chẳng kiểm được gì phía sau.
 *
 *  `status`: 1 = địa bàn hiện hành, 0 = địa bàn CŨ giữ lại để tra hồ sơ đăng
 *  trước sáp nhập 1/7/2025. Lâm Đồng có cả `68` (hiện hành) lẫn `703` (cũ) —
 *  giữ đúng cặp này vì đó là bất biến canary sống đang canh.
 * ------------------------------------------------------------------------ */
const AREA_PROVINCES = [
  { code: '68', name: 'Lâm Đồng', parentCode: '', status: 1 },
  { code: '703', name: 'Tỉnh Lâm Đồng', parentCode: '', status: 0 },
  { code: '75', name: 'Đồng Nai', parentCode: '', status: 1 },
  { code: '56', name: 'Khánh Hòa', parentCode: '', status: 1 },
  { code: '66', name: 'Đắk Lắk', parentCode: '', status: 1 },
  { code: '64', name: 'Gia Lai', parentCode: '', status: 1 },
  { code: '51', name: 'Quảng Ngãi', parentCode: '', status: 1 },
  { code: '92', name: 'Cần Thơ', parentCode: '', status: 1 },
  { code: '815', name: 'TP Cần Thơ', parentCode: '', status: 0 }
];

/** Xã/phường theo mã tỉnh. Đủ để bộ lọc xã có cái mà đối chiếu. */
const AREA_WARDS = {
  68: [
    { code: '23122', name: 'Xã Đức Trọng', status: 1 },
    { code: '23125', name: 'Xã Đơn Dương', status: 1 },
    { code: '23128', name: 'Xã Đạ Tẻh', status: 1 },
    { code: '23131', name: 'Phường Bảo Lộc', status: 1 }
  ],
  703: [{ code: '70301', name: 'Xã Đức Trọng ma cu', status: 0 }],
  75: [{ code: '24101', name: 'Xã Tân Minh', status: 1 }],
  56: [{ code: '22101', name: 'Phường Nha Trang', status: 1 }],
  66: [{ code: '24501', name: 'Xã Ea Kar', status: 1 }],
  64: [{ code: '24601', name: 'Xã Chư Sê', status: 1 }],
  51: [{ code: '21101', name: 'Xã Bình Sơn', status: 1 }],
  92: [{ code: '31101', name: 'Phường Ninh Kiều', status: 1 }],
  815: [{ code: '81501', name: 'Phường Ninh Kiều ma cu', status: 0 }]
};

/** Trả đúng nhóm địa bàn mà tiện ích hỏi: areaType 1 = tỉnh, 2 = xã/phường. */
function areaListFor(body) {
  const spec = (body && body.areas && body.areas[0]) || {};
  if (String(spec.areaType) === '1') return AREA_PROVINCES;
  if (String(spec.areaType) === '2') {
    const parent = String(spec.parentCode || '').trim();
    return (AREA_WARDS[parent] || []).map((w) => ({ ...w, parentCode: parent }));
  }
  return [];
}

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

/* MOCK_CHAOS="early,busy,slow=1500,flaky=0.3,firstslow=3000" — xem mock-page.html.
 *   slow=N      : mọi phản hồi tìm kiếm chậm N ms.
 *   firstslow=N : RIÊNG yêu cầu tìm kiếm đầu tiên chậm N ms (trang vừa mở, e-GP
 *                 còn đang khởi động).
 *   nativeslow=N: danh sách mặc định (không bộ lọc) chậm N ms MỖI LẦN mở trang.
 *   autoload    : trang TỰ TẢI danh sách mặc định khi mở, như e-GP thật.
 *   flaky=p     : cắt ngang kết nối với xác suất p — như mạng chập chờn.
 *   seed=k      : hạt giống cho flaky, để lần chạy lặp lại được.
 *   cutfirst=N  : cắt N yêu cầu tìm kiếm CÓ TIÊU CHÍ đầu tiên của cả phiên máy
 *                 chủ — e-GP chập chờn đúng lúc bắt đầu; dùng để thử tự chạy lại.
 *   pageslow=N  : bản thân TRANG e-GP tải chậm N ms (e-GP thật mất vài giây để
 *                 tải trang); dùng để đo lợi ích của tab mở sẵn. */
const CHAOS = Object.fromEntries(String(process.env.MOCK_CHAOS || '').split(',').filter(Boolean)
  .map((part) => { const [k, v] = part.split('='); return [k.trim(), v === undefined ? true : Number(v)]; }));
let chaosSeed = Number(CHAOS.seed || 1), searchCount = 0, cutCount = 0;
const chaosRandom = () => { chaosSeed = (chaosSeed * 1103515245 + 12345) % 2147483648; return chaosSeed / 2147483648; };
if (Object.keys(CHAOS).length) console.log('[mock] CHẾ ĐỘ KHÓ TÍNH:', JSON.stringify(CHAOS));
const PAGE_HTML = fs.readFileSync(path.join(HERE, 'mock-page.html'), 'utf8')
  .replace('<script>', `<script>window.__CHAOS=${JSON.stringify({ early: Boolean(CHAOS.early), busy: Boolean(CHAOS.busy), autoload: Boolean(CHAOS.autoload) })};</script>\n<script>`);

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
        searchCount += 1;
        if (CHAOS.cutfirst && (env.query?.[0]?.filters || []).length && cutCount < CHAOS.cutfirst) {
          cutCount += 1;
          console.log(`[mock] SEARCH page=${page} -> CẮT KẾT NỐI (cutfirst ${cutCount}/${CHAOS.cutfirst})`);
          req.socket.destroy();
          return;
        }
        if (CHAOS.flaky && chaosRandom() < CHAOS.flaky) {
          console.log(`[mock] SEARCH page=${page} -> CẮT KẾT NỐI (flaky)`);
          req.socket.destroy();
          return;
        }
        // Yêu cầu KHÔNG mang bộ lọc nào là danh sách mặc định trang tự tải khi mở.
        const macDinh = !(env.query?.[0]?.filters || []).length;
        const delay = (searchCount === 1 && CHAOS.firstslow ? CHAOS.firstslow : 0)
          + (macDinh && CHAOS.nativeslow ? CHAOS.nativeslow : 0) + (CHAOS.slow || 0);
        console.log(`[mock] SEARCH page=${page} size=${size} -> ${content.length}/${data.length} bản ghi` +
          (delay ? ` (chậm ${delay} ms)` : '') +
          (env.query ? ` | query.filters=${(env.query[0]?.filters || []).map((f) => f.fieldName).join(',')}` : ''));
        setTimeout(() => {
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
        }, delay);
      });
      return;
    }

    // Trình duyệt tự xin favicon. Nếu để 404 thì kịch bản đếm nó thành LỖI, và
    // một lỗi 404 THẬT sẽ núp ngay sau nó mà không ai để ý.
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === AREA_LIST) {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(body) || {}; } catch {}
        const data = areaListFor(parsed);
        console.log(`[mock] AREA areaType=${parsed?.areas?.[0]?.areaType} `
          + `parentCode=${parsed?.areas?.[0]?.parentCode || '-'} -> ${data.length} bản ghi`);
        res.writeHead(200, { 'content-type': 'application/json;charset=UTF-8' });
        res.end(JSON.stringify({ data }));
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
      const gui = () => { res.writeHead(200, { 'content-type': 'text/html;charset=UTF-8' }); res.end(PAGE_HTML); };
      console.log(`[mock] PAGE ${url.pathname}${CHAOS.pageslow ? ` (chậm ${CHAOS.pageslow} ms)` : ''}`);
      if (CHAOS.pageslow) setTimeout(gui, CHAOS.pageslow); else gui();
      return;
    }

    // GHI RA đường dẫn không khớp. Trước đây im lặng, nên một lỗi 404 trong
    // kịch bản không truy được về đâu — mất cả buổi mới biết nó là gì.
    console.log(`[mock] 404 ${req.method} ${url.pathname}`);
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
);

server.listen(PORT, '127.0.0.1', () => console.log(`[mock] e-GP giả lập chạy ở https://127.0.0.1:${PORT} (${ALL.length} gói thầu)`));
