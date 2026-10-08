/* ============================================================================
 *  PAGE-HOOK: BẮT TAY CÓ XÁC NHẬN — chặn lỗi chập chờn "e-GP chưa trả dữ liệu"
 *
 *  LỖI NGƯỜI DÙNG CHỤP MÀN HÌNH GỬI VỀ (bản 4.16.0, màn hình "Gói đang chờ kết
 *  quả"): "e-GP chưa trả dữ liệu cho lượt tra cứu. Hãy thử lại sau ít phút."
 *  Lúc được lúc mất.
 *
 *  NGUYÊN NHÂN đã tái hiện y hệt trên máy chủ giả lập: trang tra cứu e-GP tự
 *  tải danh sách mặc định khi mở. Tiện ích đổi ô "số bản ghi/trang" đúng lúc
 *  trang còn bận → giao diện e-GP bỏ qua → không yêu cầu nào được gửi → tiện
 *  ích chờ hết 25 giây rồi đổ lỗi cho e-GP. Bản gốc: 0/6 lượt đạt. Bản sửa:
 *  10/10, và cả 10 lượt đều thật sự hỏi e-GP (không trúng bộ nhớ đệm).
 *
 *  Bài này chạy NGUYÊN page-hook.js trong môi trường trình duyệt giả lập và
 *  kiểm các tín hiệu mà cách sửa dựa vào. Kịch bản trình duyệt đầy đủ ở
 *  tools/test/bidopen-scan.mjs với MOCK_CHAOS.
 * ========================================================================== */
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { canaryQuery } from '../GiaoSuCuiBap/lib/live-canary.js';

const SOURCE = fs.readFileSync(new URL('../GiaoSuCuiBap/page-hook.js', import.meta.url), 'utf8');
const SEARCH_URL = 'https://muasamcong.mpi.gov.vn/o/egp-portal-contractor-selection-v2/services/smart/search';
const NATIVE_BODY = JSON.stringify([{ pageSize: 10, pageNumber: 0, query: [{ index: 'es-contractor-selection', keyWord: '', filters: [] }] }]);
const PLAN = { id: 'plan-1', query: canaryQuery({ id: 'IB2600534292', type: 'IB' }), pageSize: 50, queryIndex: 0 };

/** Dựng một trình duyệt tối giản đủ cho page-hook chạy, và ghi lại mọi thông điệp. */
function trinhDuyet() {
  const posted = [];
  const listeners = [];
  const win = {
    addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); },
    postMessage(data) {
      posted.push(data);
      for (const fn of listeners) fn({ source: win, data });
    },
    fetch: async () => { throw new Error('fetch giả chưa được cấu hình'); }
  };

  class FakeXHR {
    constructor() { this._l = {}; this.status = 0; this.responseType = ''; this._text = ''; this.responseURL = ''; this.throwOnText = false; }
    open() {}
    send() {}
    setRequestHeader() {}
    addEventListener(type, fn) { (this._l[type] ||= []).push(fn); }
    removeEventListener(type, fn) { this._l[type] = (this._l[type] || []).filter((f) => f !== fn); }
    getResponseHeader() { return ''; }
    get responseText() {
      // Trình duyệt thật NÉM LỖI khi đọc responseText của yêu cầu có
      // responseType 'blob' / 'arraybuffer'.
      if (this.throwOnText) throw new Error('InvalidStateError');
      return this._text;
    }
    get response() { return this._text; }
    fire(type) { for (const fn of [...(this._l[type] || [])]) fn.call(this); }
    tra(status, body, opts = {}) {
      this.status = status; this._text = JSON.stringify(body); this.responseURL = SEARCH_URL;
      this.throwOnText = Boolean(opts.throwOnText);
      this.fire('load'); this.fire('loadend');
    }
    rot() { this.status = 0; this.fire('error'); this.fire('loadend'); }
  }
  // Ghi lại thân yêu cầu THẬT SỰ được gửi đi (sau khi page-hook ghi đè).
  const sentBodies = [];
  FakeXHR.prototype.send = function (body) { sentBodies.push(body); };

  class FakeRequest { constructor(input, init = {}) { this.url = String(input?.url || input); this.method = init.method || input?.method || 'GET'; this._body = init.body ?? input?._body ?? ''; this.headers = new Map(); } clone() { return this; } async text() { return this._body; } }
  const ctx = vm.createContext({
    window: win, location: { href: 'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?render=search',
      origin: 'https://muasamcong.mpi.gov.vn', pathname: '/vi/web/guest/contractor-selection' },
    XMLHttpRequest: FakeXHR, Request: FakeRequest, Headers: Map, URL, setTimeout, clearTimeout, console
  });
  vm.runInContext(SOURCE, ctx);

  const tuNoiDung = (type, payload) => win.postMessage({ source: 'BID_RADAR_ONE_CONTENT', type, payload });
  const goiXHR = (body) => {
    const x = new ctx.XMLHttpRequest();
    x.open('POST', SEARCH_URL);
    x.send(body);
    return x;
  };
  // Đối tượng sinh trong vm mang prototype của realm khác; chuẩn hoá qua JSON
  // để so sánh theo GIÁ TRỊ.
  const cua = (type) => posted.filter((m) => m.type === type).map((m) => JSON.parse(JSON.stringify(m.payload ?? null)));
  return { win, posted, cua, tuNoiDung, goiXHR, sentBodies };
}

/* --------------------------------------------------------------------------
 *  1. "e-GP có đang bận không" — đếm tận mắt, gồm cả yêu cầu e-GP tự phát
 * ------------------------------------------------------------------------ */

test('danh sách mặc định e-GP TỰ TẢI khi mở trang được đếm là "đang bận"', () => {
  const b = trinhDuyet();
  const macDinh = b.goiXHR(NATIVE_BODY);       // chưa có kế hoạch nào
  assert.deepEqual(b.cua('EGP_SEARCH_ACTIVITY').at(-1), { inFlight: 1 }, 'trang đang bận mà hook không báo');
  assert.equal(b.cua('KQLCNT_REQUEST_SENT').length, 0, 'yêu cầu mặc định không mang tiêu chí, không được báo là đã gửi');
  macDinh.tra(200, { page: { content: [], totalPages: 1, totalElements: 0 } });
  assert.deepEqual(b.cua('EGP_SEARCH_ACTIVITY').at(-1), { inFlight: 0 }, 'xong rồi mà vẫn báo bận');
});

test('rớt kết nối cũng trả trang về trạng thái rảnh — không kẹt "đang bận" mãi', () => {
  const b = trinhDuyet();
  b.goiXHR(NATIVE_BODY).rot();
  assert.deepEqual(b.cua('EGP_SEARCH_ACTIVITY').at(-1), { inFlight: 0 });
});

test('content.js hỏi thì hook trả lời ngay trạng thái bận hiện tại', () => {
  const b = trinhDuyet();
  b.goiXHR(NATIVE_BODY);
  b.goiXHR(NATIVE_BODY);
  const truoc = b.cua('EGP_SEARCH_ACTIVITY').length;
  b.tuNoiDung('EGP_ACTIVITY_PROBE', {});
  const sau = b.cua('EGP_SEARCH_ACTIVITY');
  assert.equal(sau.length, truoc + 1, 'không trả lời câu hỏi trạng thái');
  assert.deepEqual(sau.at(-1), { inFlight: 2 });
});

/* --------------------------------------------------------------------------
 *  2. "Yêu cầu mang tiêu chí đã rời trình duyệt chưa"
 * ------------------------------------------------------------------------ */

test('yêu cầu MANG TIÊU CHÍ được báo là đã gửi, kèm số trang', () => {
  const b = trinhDuyet();
  b.tuNoiDung('KQLCNT_PLAN', PLAN);
  assert.equal(b.cua('KQLCNT_PLAN_ACK').at(-1)?.accepted, true, 'kế hoạch mẫu phải hợp lệ');
  b.goiXHR(NATIVE_BODY);
  assert.deepEqual(b.cua('KQLCNT_REQUEST_SENT').at(-1), { planId: 'plan-1', queryIndex: 0, pageNumber: 0 });
  // Và thân yêu cầu thật sự gửi đi đã mang tiêu chí của tiện ích.
  const gui = JSON.parse(b.sentBodies.at(-1))[0];
  assert.equal(gui.pageSize, '50');
  assert.deepEqual(gui.query, [PLAN.query]);
});

test('e-GP gửi yêu cầu theo cấu trúc lạ khi đang có lượt tra cứu → báo NGAY, không lặng lẽ chờ', () => {
  /* Không gắn được tiêu chí mà im lặng thì tiện ích chờ phản hồi của một yêu
     cầu không mang tiêu chí — rồi hoặc hết giờ, hoặc kết luận trên dữ liệu
     không phải của mình. */
  const b = trinhDuyet();
  b.tuNoiDung('KQLCNT_PLAN', PLAN);
  b.goiXHR(JSON.stringify({ khongPhaiMang: true }));
  assert.equal(b.cua('KQLCNT_REQUEST_SENT').length, 0);
  assert.deepEqual(b.cua('KQLCNT_REQUEST_REJECTED').at(-1), { planId: 'plan-1', queryIndex: 0, reason: 'shape' });
});

test('không có lượt tra cứu nào thì không báo gì về "từ chối"', () => {
  const b = trinhDuyet();
  b.goiXHR(JSON.stringify({ khongPhaiMang: true }));
  assert.equal(b.cua('KQLCNT_REQUEST_REJECTED').length, 0);
});

/* --------------------------------------------------------------------------
 *  3. Phản hồi của lượt tra cứu KHÔNG BAO GIỜ bị nuốt
 * ------------------------------------------------------------------------ */

test('phản hồi đọc chữ bị lỗi vẫn được chuyển về — không để tiện ích chờ tới hết giờ', () => {
  /* Trình duyệt thật ném lỗi khi đọc responseText của yêu cầu dạng blob. Bản
     cũ đặt lệnh báo trang chung một khối try với khối catch RỖNG: lỗi đó nuốt
     mất phản hồi, tiện ích chờ 25 giây rồi báo "e-GP chưa trả dữ liệu". */
  const b = trinhDuyet();
  b.tuNoiDung('KQLCNT_PLAN', PLAN);
  const x = b.goiXHR(NATIVE_BODY);
  x.tra(200, { page: { content: [], totalPages: 1, totalElements: 0 } }, { throwOnText: true });
  const trang = b.cua('KQLCNT_PAGE').at(-1);
  assert.ok(trang, 'phản hồi đã bị nuốt — tiện ích sẽ chờ tới hết giờ');
  assert.equal(trang.planId, 'plan-1');
  assert.equal(trang.status, 200);
});

test('phản hồi bình thường được chuyển về đúng lượt, kèm số trang nguồn', () => {
  const b = trinhDuyet();
  b.tuNoiDung('KQLCNT_PLAN', PLAN);
  const x = b.goiXHR(NATIVE_BODY);
  x.tra(200, { page: { content: [{ notifyNo: 'IB2600534292' }], totalPages: 1, totalElements: 1 } });
  const trang = b.cua('KQLCNT_PAGE').at(-1);
  assert.equal(trang.ok, true);
  assert.equal(trang.sourcePageIndex, 0);
  assert.equal(trang.data.page.content[0].notifyNo, 'IB2600534292');
});

test('rớt kết nối giữa chừng được báo là thất bại có mã 0 — đủ để content.js đọc lại', () => {
  const b = trinhDuyet();
  b.tuNoiDung('KQLCNT_PLAN', PLAN);
  b.goiXHR(NATIVE_BODY).rot();
  const trang = b.cua('KQLCNT_PAGE').at(-1);
  assert.equal(trang.ok, false);
  assert.equal(trang.status, 0);
});
