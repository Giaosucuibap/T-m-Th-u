/* ============================================================================
 *  ĐỌC LẠI ĐÚNG TRANG — kể cả khi bước trung gian cũng hỏng  (content.js)
 *
 *  Gặp thật trên máy chủ giả lập với 20% kết nối bị cắt: một trang giữa rớt,
 *  cách cũ "lùi một trang rồi tiến lại" — nhưng chính bước lùi cũng rớt. Giao
 *  diện e-GP đổi trang hiện hành NGAY khi bấm, kể cả khi yêu cầu sau đó hỏng,
 *  nên lần thử sau lùi thêm một nấc nữa và trang đọc lại bị lệch. Lượt dừng với
 *  "e-GP chưa khôi phục được trang liền trước".
 *
 *  Nay content.js biết e-GP đang ở trang nào (từ yêu cầu thật sự đã gửi) và
 *  bấm theo hướng tới đích. Bài này dựng một thanh phân trang giả hành xử như
 *  Element UI — đổi trang ngay khi bấm, bất kể phản hồi — và kiểm từng ca.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const content = fs.readFileSync(new URL('../GiaoSuCuiBap/content.js', import.meta.url), 'utf8');
const a = content.indexOf('  async function kqNavigateTo(target){');
const b = content.indexOf('  async function kqRecoverTransient(', a);
assert.ok(a > 0 && b > a, 'không tìm thấy kqNavigateTo / kqReReadPage');
const SRC = content.slice(a, b);

/**
 * @param start        trang e-GP đang mở khi bắt đầu đọc lại
 * @param hongTrungGian số phản hồi trung gian bị rớt (không phải trang đích)
 */
function dung({ start, hongTrungGian = 0, bamBiBoQua = 0 } = {}) {
  const clicks = [];
  let hong = hongTrungGian, boQua = bamBiBoQua, lastSent = true;
  const ctx = vm.createContext({
    kqUiPage: start, kqCancelled: false, kqPlan: {}, egpInFlight: 0, kqPageWaiter: null,
    kqWaitEgpIdle: async () => true, setTimeout: (fn) => fn(),
    kqTriggerFirstPage: async () => { clicks.push('trang1'); return { ok: true, sourcePageIndex: 0 }; }
  });
  const nut = (huong) => ({ disabled: false, click: () => {
    clicks.push(huong);
    if (boQua > 0) { boQua--; lastSent = false; return; }   // trang bận: bỏ qua cú bấm
    lastSent = true;
    ctx.kqUiPage += huong === 'next' ? 1 : -1;             // Element UI đổi trang NGAY
  } });
  ctx.document = { querySelector: (sel) => nut(sel.includes('next') ? 'next' : 'prev') };
  // Như mã thật: lời chờ chỉ có kết quả khi thật sự được chờ (sau cú bấm).
  ctx.kqAwaitSent = () => ({ then: (res) => res(lastSent) });
  ctx.kqAwaitPage = () => ({ then: (res) => {
    const n = ctx.kqUiPage;
    res(n !== ctx.__target && hong > 0 ? (hong--, { ok: false, status: 0 }) : { ok: true, sourcePageIndex: n });
  } });
  vm.runInContext(SRC, ctx);
  return { ctx, clicks, doc: (target) => { ctx.__target = target; return ctx.kqReReadPage(target); } };
}

test('đang đứng ở trang lỗi → bước ra một trang rồi quay lại đúng trang đó', async () => {
  const { doc, clicks } = dung({ start: 2 });
  const page = await doc(2);
  assert.equal(page.sourcePageIndex, 2);
  assert.deepEqual(clicks, ['prev', 'next']);
});

test('bước trung gian RỚT MẠNG vẫn tới đúng trang đích', async () => {
  const { doc, clicks } = dung({ start: 2, hongTrungGian: 1 });
  const page = await doc(2);
  assert.equal(page.ok, true);
  assert.equal(page.sourcePageIndex, 2);
  assert.deepEqual(clicks, ['prev', 'next']);
});

test('giao diện ĐÃ LỆCH (đang ở trang trước) → chỉ tiến, không lùi thêm nấc nữa', async () => {
  /* Đây đúng là ca làm hỏng lượt 12 trên máy chủ giả lập. Cách cũ lùi thêm từ
     trang 2 về trang 1 rồi tiến lên 2 — lệch đúng một trang so với trang 3 cần
     đọc, và dừng với "e-GP chưa khôi phục được trang liền trước". */
  const { doc, clicks } = dung({ start: 1 });
  const page = await doc(2);
  assert.equal(page.sourcePageIndex, 2);
  assert.deepEqual(clicks, ['next']);
});

test('lệch xa → đi đủ số bước tới đích', async () => {
  const { doc, clicks } = dung({ start: 0 });
  assert.equal((await doc(3)).sourcePageIndex, 3);
  assert.deepEqual(clicks, ['next', 'next', 'next']);
});

test('cú bấm bị trang bỏ qua thì bấm lại, không tính là đã tới', async () => {
  const { doc, clicks } = dung({ start: 2, bamBiBoQua: 1 });
  assert.equal((await doc(2)).sourcePageIndex, 2);
  assert.deepEqual(clicks, ['prev', 'prev', 'next']);
});

test('không biết e-GP đang ở trang nào → dừng có lý do, không bấm mò', async () => {
  const { doc, clicks } = dung({ start: null });
  const page = await doc(2);
  assert.equal(page.ok, false);
  assert.equal(page.stage, 'trigger');
  assert.deepEqual(clicks, []);
});

test('đọc lại trang đầu khi đang ở trang 1 → dùng cơ chế khởi động trang đầu', async () => {
  const { doc, clicks } = dung({ start: 0 });
  assert.equal((await doc(0)).sourcePageIndex, 0);
  assert.deepEqual(clicks, ['trang1']);
});

test('đọc lại trang đầu khi đang ở trang khác → lùi về đúng trang đầu', async () => {
  const { doc, clicks } = dung({ start: 2 });
  assert.equal((await doc(0)).sourcePageIndex, 0);
  assert.deepEqual(clicks, ['prev', 'prev']);
});
