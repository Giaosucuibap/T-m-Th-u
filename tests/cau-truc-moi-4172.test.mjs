/* ============================================================================
 *  4.17.2 — e-GP MỚI (muasamcong.mof.gov.vn) GỬI YÊU CẦU TÌM KIẾM KHÁC DẠNG
 *
 *  LỖI NGƯỜI DÙNG CHỤP MÀN HÌNH (20/10/2026, "Gói đang chờ kết quả", Lâm Đồng):
 *    "e-GP đã gửi yêu cầu tìm kiếm theo một cấu trúc tiện ích không nhận ra,
 *     nên không gắn được tiêu chí."
 *  page-hook 4.17.1 CHỈ nhận đúng một dạng thân yêu cầu: chuỗi JSON của mảng
 *  MỘT phần tử. Môi trường phát triển không vào được e-GP thật, nên không biết
 *  chắc e-GP mới dùng dạng nào. Bài này khoá các dạng hợp lý mà bản mới nhận:
 *  đối tượng không bọc mảng, mảng nhiều truy vấn, chuỗi JSON lồng, thân Blob /
 *  ArrayBuffer (gửi bằng XHR hoặc fetch) — và dạng KHÔNG nhận thì phải nói rõ
 *  hình dạng (chỉ tên trường, không giá trị) để sửa đúng trong một lần.
 * ========================================================================== */
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { canaryQuery } from '../GiaoSuCuiBap/lib/live-canary.js';

const SOURCE = fs.readFileSync(new URL('../GiaoSuCuiBap/page-hook.js', import.meta.url), 'utf8');
const SEARCH_URL = 'https://muasamcong.mof.gov.vn/o/egp-portal-contractor-selection-v2/services/smart/search';
const NATIVE = { pageSize: 20, pageNumber: 0, query: [{ index: 'es-contractor-selection', keyWord: 'Lâm Đồng', filters: [] }] };
const PLAN = { id: 'plan-1', query: canaryQuery({ id: 'IB2600534292', type: 'IB' }), pageSize: 50, queryIndex: 0 };
const PAGE = { page: { content: [{ notifyNo: 'IB2600000001' }], totalPages: 1, totalElements: 1 } };
const nghi = () => new Promise((r) => setTimeout(r, 10));

function trinhDuyet() {
  const posted = [];
  const listeners = [];
  const fetched = [];
  const win = {
    addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); },
    postMessage(data) { posted.push(data); for (const fn of listeners) fn({ source: win, data }); },
    fetch: async (input, init) => {
      fetched.push({ input, init });
      return new Response(JSON.stringify(PAGE), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  };
  const sent = [];
  class FakeXHR {
    constructor() { this._l = {}; this.status = 0; this.responseType = ''; this._text = ''; this.responseURL = ''; this.headers = {}; }
    open() {}
    setRequestHeader(name, value) { this.headers[name] = value; }
    addEventListener(type, fn) { (this._l[type] ||= []).push(fn); }
    removeEventListener(type, fn) { this._l[type] = (this._l[type] || []).filter((f) => f !== fn); }
    getResponseHeader() { return ''; }
    get responseText() { return this._text; }
    get response() { return this._text; }
    fire(type) { for (const fn of [...(this._l[type] || [])]) fn.call(this); }
    tra(status, body) { this.status = status; this._text = JSON.stringify(body); this.responseURL = SEARCH_URL; this.fire('load'); this.fire('loadend'); }
  }
  FakeXHR.prototype.send = function (body) { sent.push({ body, headers: { ...this.headers } }); };
  const ctx = vm.createContext({
    window: win, location: { href: 'https://muasamcong.mof.gov.vn/vi/web/guest/contractor-selection?render=index',
      origin: 'https://muasamcong.mof.gov.vn', pathname: '/vi/web/guest/contractor-selection' },
    XMLHttpRequest: FakeXHR, Request, Response, Blob, TextDecoder, Headers, URL, URLSearchParams, setTimeout, clearTimeout, console
  });
  vm.runInContext(SOURCE, ctx);
  const tuNoiDung = (type, payload) => win.postMessage({ source: 'BID_RADAR_ONE_CONTENT', type, payload });
  tuNoiDung('KQLCNT_PLAN', PLAN);
  assert.equal(posted.find((m) => m.type === 'KQLCNT_PLAN_ACK')?.payload?.accepted, true);
  const goiXHR = (body) => { const x = new ctx.XMLHttpRequest(); x.open('POST', SEARCH_URL); x.send(body); return x; };
  const cua = (type) => posted.filter((m) => m.type === type).map((m) => JSON.parse(JSON.stringify(m.payload ?? null)));
  return { ctx, win, cua, goiXHR, sent, fetched };
}

test('dạng cũ — mảng MỘT phần tử — vẫn y như trước', () => {
  const b = trinhDuyet();
  b.goiXHR(JSON.stringify([NATIVE]));
  const gui = JSON.parse(b.sent.at(-1).body);
  assert.equal(gui.length, 1);
  assert.deepEqual(gui[0].query, [PLAN.query]);
  assert.equal(gui[0].pageSize, '50');
  assert.equal(b.cua('KQLCNT_REQUEST_REJECTED').length, 0);
});

test('đối tượng KHÔNG bọc mảng → gắn được tiêu chí, giữ nguyên dạng đối tượng', () => {
  const b = trinhDuyet();
  const x = b.goiXHR(JSON.stringify(NATIVE));
  const gui = JSON.parse(b.sent.at(-1).body);
  assert.ok(!Array.isArray(gui), 'không được tự ý bọc mảng — máy chủ mới có thể không nhận');
  assert.deepEqual(gui.query, [PLAN.query]);
  assert.equal(gui.pageNumber, 0);
  assert.deepEqual(b.cua('KQLCNT_REQUEST_SENT').at(-1), { planId: 'plan-1', queryIndex: 0, pageNumber: 0 });
  x.tra(200, PAGE);
  assert.equal(b.cua('KQLCNT_PAGE').at(-1).data.page.totalElements, 1);
});

test('mảng NHIỀU truy vấn gộp → gắn vào tất cả; phản hồi dạng mảng lấy phần tử đầu', () => {
  const b = trinhDuyet();
  const x = b.goiXHR(JSON.stringify([NATIVE, { ...NATIVE, pageSize: 1 }]));
  const gui = JSON.parse(b.sent.at(-1).body);
  assert.equal(gui.length, 2);
  for (const env of gui) assert.deepEqual(env.query, [PLAN.query]);
  x.tra(200, [PAGE, { page: { content: [], totalPages: 0, totalElements: 0 } }]);
  assert.deepEqual(b.cua('KQLCNT_PAGE').at(-1).data, PAGE);
});

test('chuỗi JSON lồng (mã hoá hai lần) → gắn được, gửi lại đúng hai lần mã hoá', () => {
  const b = trinhDuyet();
  b.goiXHR(JSON.stringify(JSON.stringify([NATIVE])));
  const gui = JSON.parse(JSON.parse(b.sent.at(-1).body));
  assert.deepEqual(gui[0].query, [PLAN.query]);
  assert.equal(b.cua('KQLCNT_REQUEST_SENT').length, 1);
});

test('XHR gửi thân dạng Blob → đọc ra chữ, gắn tiêu chí, giữ kiểu nội dung (4.17.1: JSON.stringify(Blob) = "{}")', async () => {
  const b = trinhDuyet();
  b.goiXHR(new Blob([JSON.stringify([NATIVE])], { type: 'application/json' }));
  await nghi();
  const last = b.sent.at(-1);
  assert.equal(typeof last.body, 'string');
  assert.deepEqual(JSON.parse(last.body)[0].query, [PLAN.query]);
  assert.equal(last.headers['Content-Type'], 'application/json');
  assert.equal(b.cua('KQLCNT_REQUEST_REJECTED').length, 0);
});

test('Blob không gắn được tiêu chí → gửi NGUYÊN Blob gốc, không đụng vào', async () => {
  const b = trinhDuyet();
  const blob = new Blob(['{"goiY":"kenh"}'], { type: 'application/json' });
  b.goiXHR(blob);
  await nghi();
  assert.equal(b.sent.at(-1).body, blob);
  assert.match(b.cua('KQLCNT_REQUEST_REJECTED').at(-1).shape, /^Blob → đối tượng \{goiY\}$/);
});

test('XHR gửi ArrayBuffer / Uint8Array → gắn được tiêu chí', () => {
  const b = trinhDuyet();
  b.goiXHR(new TextEncoder().encode(JSON.stringify([NATIVE])));
  assert.deepEqual(JSON.parse(b.sent.at(-1).body)[0].query, [PLAN.query]);
  b.goiXHR(new TextEncoder().encode(JSON.stringify([NATIVE])).buffer);
  assert.deepEqual(JSON.parse(b.sent.at(-1).body)[0].query, [PLAN.query]);
});

test('fetch gửi thân Blob → gắn được tiêu chí', async () => {
  const b = trinhDuyet();
  await b.ctx.window.fetch(SEARCH_URL, { method: 'POST', body: new Blob([JSON.stringify(NATIVE)]), headers: { 'content-type': 'application/json' } });
  const init = b.fetched.at(-1).init;
  assert.deepEqual(JSON.parse(init.body).query, [PLAN.query]);
  await nghi();
  assert.equal(b.cua('KQLCNT_PAGE').at(-1).data.page.totalElements, 1);
});

test('phản hồi bọc thêm lớp {data:{page}} → mở đúng một lớp', () => {
  const b = trinhDuyet();
  const x = b.goiXHR(JSON.stringify([NATIVE]));
  x.tra(200, { success: true, data: PAGE });
  assert.deepEqual(b.cua('KQLCNT_PAGE').at(-1).data, PAGE);
});

test('yêu cầu KHÔNG có `query` (đếm, gợi ý…) → KHÔNG nhét tiêu chí vào; báo hình dạng, không lộ giá trị', () => {
  /* Nhét tiêu chí vào một yêu cầu khác loại thì máy chủ bỏ qua và trả danh
     sách mặc định — tiện ích sẽ đọc nhầm dữ liệu không phải của mình. */
  const b = trinhDuyet();
  const body = JSON.stringify({ keyWord: 'Lâm Đồng', token: 'bi-mat-123', loai: ['a', 'b'] });
  b.goiXHR(body);
  assert.equal(b.sent.at(-1).body, body, 'phải gửi nguyên văn');
  assert.equal(b.cua('KQLCNT_REQUEST_SENT').length, 0);
  const shape = b.cua('KQLCNT_REQUEST_REJECTED').at(-1).shape;
  assert.equal(shape, 'đối tượng {keyWord,token,loai[2]}');
  assert.doesNotMatch(shape, /Lâm|bi-mat/);
  // Mảng nhiều phần tử mà có phần tử không phải truy vấn → không đụng.
  const tron = JSON.stringify([NATIVE, { dem: true }]);
  b.goiXHR(tron);
  assert.equal(b.sent.at(-1).body, tron);
  assert.match(b.cua('KQLCNT_REQUEST_REJECTED').at(-1).shape, /^mảng\[2\] \{pageSize,pageNumber,query\[1\]\}$/);
});

test('hình dạng các thân yêu cầu lạ khác đều mô tả được và bị cắt ngắn', () => {
  const b = trinhDuyet();
  b.goiXHR('a=1&b=2');
  assert.match(b.cua('KQLCNT_REQUEST_REJECTED').at(-1).shape, /^không phải JSON \(7 ký tự\)$/);
  b.goiXHR('');
  assert.equal(b.cua('KQLCNT_REQUEST_REJECTED').at(-1).shape, 'rỗng');
  b.goiXHR(new URLSearchParams({ q: 'x' }));
  assert.equal(b.cua('KQLCNT_REQUEST_REJECTED').at(-1).shape, 'URLSearchParams → không phải JSON (3 ký tự)');
  const nhieu = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`truong${i}`, i]));
  b.goiXHR(JSON.stringify(nhieu));
  const s = b.cua('KQLCNT_REQUEST_REJECTED').at(-1).shape;
  assert.ok(s.length <= 300 && /,…\}$/.test(s));
});

test('content.js đưa hình dạng vào câu báo lỗi; không còn câu "cấu trúc tiện ích không nhận ra"', () => {
  const src = fs.readFileSync(new URL('../GiaoSuCuiBap/content.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.doesNotMatch(src, /cấu trúc tiện ích không nhận ra/);
  assert.match(src, /dạng yêu cầu: \$\{shape\}/);
  assert.match(src, /kqRejected=\{reason:/);
});
