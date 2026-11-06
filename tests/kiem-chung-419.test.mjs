/* ============================================================================
 *  KIỂM CHỨNG TOÀN TRÌNH TRÊN e-GP THẬT — 4.19.0
 *
 *  Máy phát triển không vào được e-GP (tường lửa e-GP chặn trình duyệt tự động
 *  từ máy chủ). Nên bằng chứng chạy thật phải sinh ra trên máy người dùng: trang
 *  Chẩn đoán có nút "Chạy kiểm chứng". Bài này khoá:
 *    - chạy đúng bốn luồng bằng đúng lệnh các trang tra cứu dùng;
 *    - kết luận ĐẠT chỉ khi dữ liệu về thật (không coi "không khởi động" hay
 *      "quá giờ" là đạt; kế hoạch phải đọc được cả trang chi tiết);
 *    - tệp bằng chứng KHÔNG chứa tên gói, chủ đầu tư, nhà thầu hay giá;
 *    - mã băm phát hiện tệp bị sửa tay.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import { runSelfCheck, sealReport, selfCheckPlan, readFlow, judgeFlow } from '../GiaoSuCuiBap/lib/self-check.js';

const BI_MAT = ['Xây dựng kênh Đạ Tẻh', 'Công ty TNHH Bí Mật', '0312345678', '12345678900'];

/** e-GP giả trên máy: mỗi luồng chạy vài nhịp rồi xong. */
function fakeExtension({ startFails = {}, stuck = {}, planDetails = { total: 12, read: 3, failed: 0 } } = {}) {
  const calls = [];
  let polls = {};
  const tick = (k) => (polls[k] = (polls[k] || 0) + 1);
  const send = async (type, payload) => {
    calls.push(type);
    if (startFails[type]) return { ok: false, message: startFails[type] };
    switch (type) {
      case 'TBMT_SEARCH': return { ok: true, runId: 'run-1' };
      case 'GET_SEARCH_STATE': {
        assert.equal(payload.runId, 'run-1', 'phải hỏi đúng lượt vừa chạy');
        const done = tick('tbmt') >= 3 && !stuck.tbmt;
        return { ok: true, selectedRun: { id: 'run-1', status: done ? 'SUCCESS' : 'RUNNING', message: `Gói ${BI_MAT[0]}`,
          coverage: { serverTotal: 137, fetched: 137, match: 42, pagesRead: 3, totalPages: 3, complete: true, consistent: true, text: 'e-GP báo 137 · đã tải 137 · khớp 42' } } };
      }
      case 'PLAN_LOOKUP': return { ok: true };
      case 'GET_PLAN_STATE': {
        const n = tick('plan');
        const listed = n >= 2;
        return { ok: true, lookup: { status: 'RUNNING', serverCount: 40, plans: Array(12).fill({ name: BI_MAT[0] }), listFinished: listed,
          detailTotal: listed ? planDetails.total : 0, detailRead: listed && n >= 3 ? planDetails.read : 0, detailFailed: listed && n >= 3 ? planDetails.failed : 0 } };
      }
      case 'BID_OPEN_SCAN': return { ok: true };
      case 'GET_BID_OPEN_STATE': {
        const done = tick('bid') >= 2;
        return { ok: true, scan: { status: done ? 'SUCCESS' : 'SCANNING', message: `${BI_MAT[1]} giá ${BI_MAT[3]}`,
          packages: [{ bidName: BI_MAT[0], bidders: [{ name: BI_MAT[1], taxCode: BI_MAT[2], bidPrice: 12345678900 }, { name: 'B' }] }, { bidName: 'x', bidders: [] }] } };
      }
      case 'CANARY_RUN': return { ok: true, started: true };
      case 'CANARY_STATUS': {
        const done = tick('canary') >= 2;
        return { ok: true, liveCanary: { status: done ? 'GREEN' : 'RUNNING', provinceCheck: { status: 'GREEN' }, cases: Array.from({ length: 25 }, (_, i) => ({ id: `IB26000000${String(i).padStart(2, '0')}`, status: 'GREEN', bidders: [{ name: BI_MAT[1] }] })) } };
      }
      case 'CANCEL_PLAN_LOOKUP': case 'CANCEL_ACTIVE_RUN': case 'CANCEL_BID_OPEN_SCAN': return { ok: true };
      default: throw new Error(`lệnh lạ ${type}`);
    }
  };
  return { send, calls };
}
const clock = () => { let t = Date.parse('2026-11-06T02:00:00Z'); return { now: () => t, sleep: async (ms) => { t += ms; } }; };

test('đủ bốn luồng, đúng lệnh, đạt 4/4; kế hoạch dừng sau khi đọc được vài trang chi tiết', async () => {
  const fx = fakeExtension(); const c = clock();
  const progress = [];
  const r = await runSelfCheck({ send: fx.send, ...c, version: '4.19.0', userAgent: 'Chrome/131', onProgress: (p) => progress.push(p.phase) });
  assert.deepEqual(r.flows.map((f) => [f.id, f.ok]), [['tbmt', true], ['plan', true], ['bidopen', true], ['canary', true]]);
  assert.equal(r.passed, 4); assert.equal(r.total, 4);
  assert.equal(r.flows[0].summary, 'SUCCESS · e-GP báo 137 · đã tải 137 · khớp 42');
  assert.match(r.flows[1].summary, /Đã lấy đủ danh sách · đã xét 40 kế hoạch · 12 kế hoạch khớp · chi tiết đọc được 3\/3/);
  assert.ok(fx.calls.includes('CANCEL_PLAN_LOOKUP'), 'đủ bằng chứng thì dừng phần đọc chi tiết còn lại');
  assert.ok(!fx.calls.includes('CANCEL_ACTIVE_RUN'), 'lượt tìm xong bình thường thì không huỷ');
  assert.match(r.flows[2].summary, /SUCCESS · 2 gói · đọc 1 biên bản \(2 dòng nhà thầu\)/);
  assert.match(r.flows[3].summary, /GREEN · GREEN 25/);
  assert.ok(progress.includes('poll') && progress.filter((p) => p === 'done').length === 4);
});

test('tệp bằng chứng không chứa tên gói, doanh nghiệp, mã số thuế hay giá; có mã băm phát hiện sửa tay', async () => {
  const fx = fakeExtension(); const c = clock();
  const sealed = await sealReport(await runSelfCheck({ send: fx.send, ...c, version: '4.19.0' }), webcrypto);
  const json = JSON.stringify(sealed);
  for (const s of BI_MAT) assert.ok(!json.includes(s), `lộ "${s}"`);
  assert.match(sealed.digest, /^[0-9a-f]{64}$/);
  assert.equal((await sealReport(sealed, webcrypto)).digest, sealed.digest, 'niêm lại cùng nội dung → cùng mã');
  const tampered = { ...sealed, passed: 99 };
  assert.notEqual((await sealReport(tampered, webcrypto)).digest, sealed.digest);
});

test('không khởi động được, quá giờ, hay không đọc được trang chi tiết kế hoạch đều là CHƯA ĐẠT — kèm lý do', async () => {
  const c = clock();
  const r = await runSelfCheck({ send: fakeExtension({ startFails: { TBMT_SEARCH: 'Một lượt quét khác đang chạy.' }, planDetails: { total: 12, read: 0, failed: 3 } }).send, ...c, canary: false });
  assert.deepEqual(r.flows.map((f) => [f.id, f.ok, f.status]), [['tbmt', false, 'NOT_STARTED'], ['plan', false, 'LISTED'], ['bidopen', true, 'SUCCESS']]);
  assert.match(r.flows[0].summary, /Không bắt đầu được: Một lượt quét khác đang chạy\./);
  assert.match(r.flows[1].summary, /KHÔNG đọc được trang chi tiết/);
  const c2 = clock(); const fx = fakeExtension({ stuck: { tbmt: true } });
  const r2 = await runSelfCheck({ send: fx.send, ...c2, canary: false });
  assert.equal(r2.flows[0].status, 'TIMEOUT');
  assert.equal(r2.flows[0].ok, false);
  assert.ok(fx.calls.includes('CANCEL_ACTIVE_RUN'), 'quá giờ thì huỷ lượt để luồng sau có e-GP rảnh');
});

test('luồng chưa đạt giữ thông báo lỗi để chẩn đoán nhưng xoá số tiền, mã số thuế và tên trong ngoặc kép', async () => {
  const c = clock();
  const send = async (type) => type === 'TBMT_SEARCH' ? { ok: true, runId: 'r' } : type === 'GET_SEARCH_STATE'
    ? { selectedRun: { id: 'r', status: 'ERROR', message: 'Gói "Xây dựng kênh Đạ Tẻh" giá 12.345.678.900 đ, MST 0312345678: e-GP không trả lời trong 45 giây.', coverage: {} } }
    : { ok: false, message: 'bỏ qua' };
  const r = await runSelfCheck({ send, ...c, canary: false });
  const msg = r.flows[0].details.message;
  assert.match(msg, /e-GP không trả lời trong 45 giây/);
  for (const s of ['Xây dựng kênh', '12.345.678.900', '0312345678']) assert.ok(!msg.includes(s), `lộ ${s}`);
});

test('dừng giữa chừng: không chạy luồng tiếp theo', async () => {
  const fx = fakeExtension(); const c = clock(); let stop = false;
  const r = await runSelfCheck({ send: fx.send, ...c, isCancelled: () => stop, onProgress: (p) => { if (p.phase === 'done') stop = true; } });
  assert.equal(r.flows.length, 1);
  assert.ok(!fx.calls.includes('PLAN_LOOKUP'));
});

test('quy tắc đọc/kết luận: lượt PARTIAL chỉ đạt khi đã đọc được dữ liệu nhất quán; canary phải XANH', () => {
  assert.equal(judgeFlow('tbmt', 'PARTIAL', { fetched: 1000, consistent: true, coverage: 'x' }).ok, true);
  assert.equal(judgeFlow('tbmt', 'PARTIAL', { fetched: 0, consistent: true }).ok, false);
  assert.equal(judgeFlow('tbmt', 'ERROR', { fetched: 10, consistent: true }).ok, false);
  assert.equal(judgeFlow('canary', 'UNKNOWN', { counts: { GREEN: 20, UNKNOWN: 5 } }).ok, false);
  assert.equal(judgeFlow('bidopen', 'SUCCESS', { packages: 0 }).ok, true, '7 ngày không có gói mở thầu vẫn là chạy đúng');
  assert.equal(judgeFlow('bidopen', 'PARTIAL', { packages: 3, openingsRead: 0 }).ok, false, 'có gói mà không đọc được biên bản nào là CHƯA ĐẠT');
  assert.match(judgeFlow('bidopen', 'PARTIAL', { packages: 3, openingsRead: 0 }).summary, /KHÔNG đọc được biên bản nào/);
  assert.equal(judgeFlow('bidopen', 'PARTIAL', { packages: 3, openingsRead: 2, bidderRows: 9 }).ok, true);
  assert.equal(readFlow('tbmt', { selectedRun: { id: 'khác', status: 'SUCCESS' } }, { runId: 'run-1' }).done, false, 'không lấy nhầm lượt cũ');
  assert.deepEqual(selfCheckPlan({ canary: false }).map((f) => f.start[0]), ['TBMT_SEARCH', 'PLAN_LOOKUP', 'BID_OPEN_SCAN']);
});

test('trang Chẩn đoán có nút kiểm chứng, lưu và tải tệp bằng chứng; tệp chẩn đoán kèm kết quả này', () => {
  const html = fs.readFileSync(new URL('../GiaoSuCuiBap/diagnostics.html', import.meta.url), 'utf8');
  assert.match(html, /id="sc-run"/);
  assert.match(html, /id="sc-download"/);
  const js = fs.readFileSync(new URL('../GiaoSuCuiBap/diagnostics.js', import.meta.url), 'utf8');
  assert.match(js, /runSelfCheck\(\{ send: msg/);
  assert.match(js, /await sealReport\(report\)/);
  assert.match(js, /selfCheck: scReport \|\| null/);
});
