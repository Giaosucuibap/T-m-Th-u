/* ============================================================================
 *  KHỞI ĐỘNG TRANG ĐẦU — BẮT TAY CÓ XÁC NHẬN  (content.js)
 *
 *  Đi kèm tests/ban-tay-xac-nhan-416x.test.mjs (phía page-hook). Bài này kiểm
 *  phía điều khiển: thao tác bị trang bỏ qua thì làm lại; chỉ khi yêu cầu đã
 *  thật sự rời trình duyệt mới tính hạn chờ phản hồi; và mỗi kiểu thất bại có
 *  câu báo RIÊNG — không gộp hết vào "e-GP chưa trả dữ liệu cho lượt tra cứu",
 *  câu đã khiến người dùng tưởng e-GP hỏng trong khi e-GP chưa từng được hỏi.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const content = fs.readFileSync(new URL('../GiaoSuCuiBap/content.js', import.meta.url), 'utf8');
const a = content.indexOf('  function kqFirstPageMechanisms(){');
const b = content.indexOf('\n  /**', content.indexOf('  async function kqTriggerFirstPage(){', a));
assert.ok(a > 0 && b > a, 'không tìm thấy khối khởi động trang đầu');
const SRC = content.slice(a, b);

/**
 * Dựng hàm khởi động với các phụ thuộc giả.
 * @param sentSeq   chuỗi kết quả "yêu cầu đã gửi chưa" cho từng lần thao tác
 * @param pageSeq   chuỗi phản hồi trang cho các lần đã gửi (null = hết hạn chờ)
 */
function dung({ sentSeq = [true], pageSeq = [{ ok: true, sourcePageIndex: 0 }], inFlight = 0, rejected = null } = {}) {
  const log = { thaoTac: 0, choRanh: 0, bao: [] };
  const select = { value: '50', options: [{ value: '10' }, { value: '50' }], dispatchEvent: () => { log.thaoTac++; } };
  const ctx = vm.createContext({
    document: { querySelectorAll: () => [] }, clean: (s) => String(s).trim(), Event: class {},
    kqPageSizeSelect: () => select, kqClickSearch: () => { log.thaoTac++; return true; },
    kqPlan: { id: 'p' }, kqCancelled: false, kqRejected: null, kqPageWaiter: null, kqSentWaiter: null,
    egpInFlight: inFlight, KQ_TRIGGER_ATTEMPTS: 4, Date,
    setTimeout: (fn) => fn(), // không thật sự ngủ
    kqWaitEgpIdle: async () => { log.choRanh++; ctx.egpInFlight = 0; return true; },
    kqReport: (m) => log.bao.push(m),
    kqAwaitSent: () => {
      const ok = sentSeq.length ? sentSeq.shift() : false;
      if (!ok && rejected) ctx.kqRejected = rejected;
      return Promise.resolve(ok);
    },
    // Như mã thật: chờ phản hồi chỉ "tiêu" một phản hồi khi thật sự được chờ.
    // Lần thao tác bị bỏ qua thì lời chờ đó bị bỏ, không ăn mất phản hồi nào.
    kqAwaitPage: () => ({ then: (res) => res(pageSeq.length ? pageSeq.shift() : null) })
  });
  const trigger = vm.runInContext(SRC + '\nkqTriggerFirstPage', ctx);
  return { trigger, log, ctx };
}

test('thao tác bị trang BỎ QUA thì làm lại, và lần sau thành công', async () => {
  const { trigger, log } = dung({ sentSeq: [false, true] });
  const page = await trigger();
  assert.equal(page.ok, true);
  assert.equal(log.thaoTac, 2, 'phải thao tác lại sau khi lần đầu bị bỏ qua');
  assert.ok(log.bao.some((m) => /chưa nhận thao tác/.test(m)), 'phải báo đang thử lại');
});

test('trang ĐANG BẬN thì chờ rảnh TRƯỚC khi thao tác', async () => {
  const { trigger, log } = dung({ inFlight: 1 });
  await trigger();
  assert.equal(log.choRanh, 1, 'thao tác lúc trang bận là đúng nguyên nhân của lỗi chập chờn');
  assert.ok(log.bao.some((m) => /danh sách mặc định/.test(m)));
});

test('bị bỏ qua MỌI lần → câu báo nói rõ e-GP CHƯA được hỏi, không phải "e-GP chưa trả dữ liệu"', async () => {
  const { trigger, log } = dung({ sentSeq: [false, false, false, false] });
  const page = await trigger();
  assert.equal(page.ok, false);
  assert.equal(page.stage, 'trigger');
  assert.equal(log.thaoTac, 4, 'phải thử đủ 4 lần');
  assert.match(page.failureReason, /CHƯA được hỏi/);
  assert.match(page.failureReason, /không phải kết quả rỗng/);
  assert.doesNotMatch(page.failureReason, /chưa trả dữ liệu cho lượt tra cứu/);
});

test('yêu cầu ĐÃ GỬI nhưng e-GP không trả lời → gửi lại đúng MỘT lần rồi báo riêng', async () => {
  const { trigger, log } = dung({ sentSeq: [true, true, true], pageSeq: [null, null] });
  const page = await trigger();
  assert.equal(page.stage, 'response');
  assert.equal(log.thaoTac, 2, 'hết hạn chờ phản hồi thì gửi lại một lần, không hơn');
  assert.match(page.failureReason, /không trả lời/);
});

test('hết hạn chờ lần đầu, lần gửi lại có phản hồi → dùng phản hồi đó', async () => {
  const { trigger } = dung({ sentSeq: [true, true], pageSeq: [null, { ok: true, sourcePageIndex: 0, data: 1 }] });
  const page = await trigger();
  assert.equal(page.ok, true);
  assert.equal(page.data, 1);
});

test('rớt kết nối ở trang đầu → gửi lại một lần', async () => {
  const { trigger, log } = dung({ sentSeq: [true, true], pageSeq: [{ ok: false, status: 0 }, { ok: true, sourcePageIndex: 0 }] });
  const page = await trigger();
  assert.equal(page.ok, true);
  assert.equal(log.thaoTac, 2);
});

test('e-GP trả lỗi HTTP (4xx/429) thì KHÔNG tự gửi lại ở đây — để tầng trên xử lý đúng kiểu', async () => {
  for (const status of [403, 429]) {
    const { trigger, log } = dung({ sentSeq: [true, true], pageSeq: [{ ok: false, status }, { ok: true }] });
    const page = await trigger();
    assert.equal(page.status, status);
    assert.equal(log.thaoTac, 1, `HTTP ${status} không được gửi lại mù quáng`);
  }
});

test('e-GP gửi yêu cầu theo cấu trúc lạ → dừng NGAY với lý do cấu trúc, không thử lại vô ích', async () => {
  const { trigger, log } = dung({ sentSeq: [false, true], rejected: 'shape' });
  const page = await trigger();
  assert.equal(page.stage, 'schema');
  assert.equal(page.schemaIssue, true);
  assert.equal(log.thaoTac, 1);
  assert.match(page.failureReason, /cấu trúc/);
});

test('người dùng bấm Dừng giữa chừng → dừng, không thao tác thêm', async () => {
  const { trigger, log, ctx } = dung({ sentSeq: [false, true] });
  ctx.kqAwaitSent = () => { ctx.kqCancelled = true; return Promise.resolve(false); };
  const page = await trigger();
  assert.equal(page.cancelled, true);
  assert.equal(log.thaoTac, 1);
});
