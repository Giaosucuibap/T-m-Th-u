/* ============================================================================
 *  KIỂM CHỨNG TOÀN TRÌNH TRÊN e-GP THẬT (4.19.0) — chạy trên máy người dùng
 *
 *  Môi trường phát triển không vào được e-GP (tường lửa của e-GP chặn trình
 *  duyệt tự động từ máy chủ), nên bằng chứng "chạy được trên trang thật" phải
 *  sinh ra ở chính máy công ty. Trang Chẩn đoán gọi runSelfCheck(): lần lượt chạy
 *  bốn luồng chính bằng ĐÚNG các lệnh mà các trang tra cứu dùng, ít truy vấn,
 *  rồi xuất một tệp bằng chứng.
 *
 *  Tệp bằng chứng chỉ có trạng thái, thời gian và con số đối soát. KHÔNG có tên
 *  gói, chủ đầu tư, nhà thầu, giá, cookie hay mã reCAPTCHA.
 * ========================================================================== */
export const BUSY = Object.freeze(['STARTING', 'OPENING', 'RUNNING', 'LISTING', 'SCANNING', 'QUEUED']);
export const SELF_CHECK_KEY = 'selfCheckLast';
const SEC = 1000;

const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
const short = (v, n = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
/** Thông báo lỗi giữ lại để chẩn đoán, nhưng xoá dãy số dài (giá, mã số thuế, mã gói)
 *  và chữ trong ngoặc kép (thường là tên gói / đơn vị). */
export function scrub(v, n = 240) {
  return short(String(v ?? '').replace(/["“”'‘’][^"“”'‘’]{2,}["“”'‘’]/g, '"…"').replace(/\d[\d.,\s]{5,}\d/g, '…'), n);
}

/** Định nghĩa bốn luồng. Tiêu chí cố định (Lâm Đồng — mã 703 cũng là mốc của canary) để
 *  hai lần kiểm chứng so được với nhau. */
export function selfCheckPlan({ canary = true } = {}) {
  const flows = [
    { id: 'tbmt', name: 'Tìm gói thầu — Lâm Đồng, xây lắp', start: ['TBMT_SEARCH', { investor: '', province: 'Lâm Đồng', ward: '', keyword: '', mustKeywords: '', excludeKeywords: '', minPrice: '', maxPrice: '', category: 'XL', focusTab: false }], cleanup: ['CANCEL_ACTIVE_RUN', {}], timeoutMs: 8 * 60 * SEC },
    // Kế hoạch: đọc đủ DANH SÁCH và vài trang chi tiết đầu (chứng minh cả hai bước chạy được
    // trên e-GP thật), rồi dừng phần chi tiết còn lại — đọc đủ 200 kế hoạch không cần cho kiểm chứng.
    { id: 'plan', name: 'Kế hoạch LCNT — Lâm Đồng 30 ngày, xây lắp', start: ['PLAN_LOOKUP', { investor: '', province: 'Lâm Đồng', ward: '', keyword: '', category: 'XL', days: 30, fromDate: '', toDate: '', focusTab: false }], cleanup: ['CANCEL_PLAN_LOOKUP', {}], timeoutMs: 10 * 60 * SEC },
    { id: 'bidopen', name: 'Mở thầu · chờ kết quả — Lâm Đồng 7 ngày, đọc tối đa 3 biên bản', start: ['BID_OPEN_SCAN', { query: '', taxCode: '', days: 7, fromDate: '', toDate: '', field: '', province: 'Tỉnh Lâm Đồng', investor: '', keyword: '', minPrice: 0, maxPrice: 0, maxPackages: 3, focusTab: false }], cleanup: ['CANCEL_BID_OPEN_SCAN', {}], timeoutMs: 12 * 60 * SEC }
  ];
  if (canary) flows.push({ id: 'canary', name: 'Kiểm tra cấu trúc e-GP — 25 mã đã biết', start: ['CANARY_RUN', { wait: false }], timeoutMs: 20 * 60 * SEC });
  return flows;
}

/** Đọc trạng thái hiện tại của một luồng → { done, status, details }. */
export function readFlow(id, reply, ctx = {}) {
  if (id === 'tbmt') {
    const run = reply?.selectedRun || (reply?.runs || []).find((r) => r.id === ctx.runId) || null;
    if (!run || (ctx.runId && run.id !== ctx.runId)) return { done: false, status: 'STARTING' };
    const c = run.coverage || {};
    return { done: !BUSY.includes(run.status), status: run.status, details: { fromCache: run.queryCache?.hit === true,
      serverTotal: num(c.serverTotal), fetched: num(c.fetched), match: num(c.match), pagesRead: num(c.pagesRead), totalPages: num(c.totalPages),
      complete: c.complete === true, consistent: c.consistent !== false, coverage: short(c.text, 200), message: short(run.message) } };
  }
  if (id === 'plan') {
    const s = reply?.lookup || null;
    if (!s?.status) return { done: false, status: 'STARTING' };
    const plans = Array.isArray(s.plans) ? s.plans.length : Array.isArray(s.results) ? s.results.length : null;
    const detailTotal = num(s.detailTotal) || 0, detailRead = num(s.detailRead) || 0, detailFailed = num(s.detailFailed) || 0;
    const enoughDetails = s.listFinished === true && (detailTotal === 0 || detailRead + detailFailed >= Math.min(3, detailTotal));
    const terminal = !BUSY.includes(s.status);
    return { done: terminal || enoughDetails, stillRunning: !terminal, status: terminal ? s.status : 'LISTED', details: { fromCache: s.queryCache?.hit === true, serverCount: num(s.serverCount), plans,
      listFinished: s.listFinished === true, detailTotal, detailRead, detailFailed, message: short(s.message) } };
  }
  if (id === 'bidopen') {
    const s = reply?.scan || null;
    if (!s?.status) return { done: false, status: 'STARTING' };
    const pkgs = Array.isArray(s.packages) ? s.packages : [];
    const read = pkgs.filter((p) => Array.isArray(p.bidders) && p.bidders.length);
    const readStates = {};
    for (const p of pkgs) { const k = String(p.readState || 'CHƯA ĐỌC').slice(0, 20); readStates[k] = (readStates[k] || 0) + 1; }
    return { done: !BUSY.includes(s.status), status: s.status, details: { fromCache: s.queryCache?.hit === true, packages: pkgs.length, openingsRead: read.length,
      bidderRows: read.reduce((n, p) => n + p.bidders.length, 0), readStates, message: short(s.message) } };
  }
  if (id === 'canary') {
    const c = reply?.liveCanary || null;
    if (!c?.status) return { done: false, status: 'STARTING' };
    const counts = {};
    for (const x of c.cases || []) counts[x.status] = (counts[x.status] || 0) + 1;
    return { done: c.status !== 'RUNNING', status: c.status, details: { counts, provinceCheck: c.provinceCheck?.status || null,
      notGreen: (c.cases || []).filter((x) => x.status !== 'GREEN').slice(0, 10).map((x) => ({ id: x.id, status: x.status, reason: short(x.reason, 160) })), reason: short(c.reason) } };
  }
  return { done: true, status: 'UNKNOWN' };
}

/** Đạt / không đạt và một dòng tóm tắt dễ đọc. Không đạt phải nói rõ vì sao. */
export function judgeFlow(id, status, d = {}) {
  // Lấy từ bộ nhớ đệm 2 phút: e-GP CHƯA được hỏi — không phải bằng chứng chạy trên trang thật.
  if (d.fromCache) return { ok: false, summary: `${status} · lấy từ bộ nhớ đệm (≤ 2 phút), e-GP chưa được hỏi — chưa tính là kiểm chứng` };
  if (id === 'tbmt') {
    const ok = status === 'SUCCESS' || (status === 'PARTIAL' && (d.fetched || 0) > 0 && d.consistent);
    return { ok, summary: `${status} · ${d.coverage || 'chưa có số đối soát'}${status === 'PARTIAL' && ok ? ' (đọc được dữ liệu; lượt dừng ở giới hạn số trang)' : ''}` };
  }
  if (id === 'plan') {
    const detailsOk = !d.detailTotal || d.detailRead > 0;
    const ok = (status === 'SUCCESS' && detailsOk) || (status === 'LISTED' && d.listFinished && detailsOk) || (status === 'PARTIAL' && (d.plans || 0) > 0 && detailsOk);
    const detail = d.detailTotal ? ` · chi tiết đọc được ${d.detailRead}/${d.detailRead + d.detailFailed} kế hoạch đầu${d.detailRead ? '' : ' — KHÔNG đọc được trang chi tiết'}` : '';
    return { ok, summary: `${status === 'LISTED' ? 'Đã lấy đủ danh sách' : status} · đã xét ${d.serverCount ?? 'chưa rõ'} kế hoạch · ${d.plans ?? 0} kế hoạch khớp${detail}` };
  }
  if (id === 'bidopen') {
    // Giá trị của luồng này là ĐỌC ĐƯỢC biên bản (giá từng nhà thầu). Có gói mà không đọc được
    // biên bản nào là CHƯA ĐẠT. 7 ngày không có gói mở thầu nào vẫn là chạy đúng — ghi rõ.
    const pkgs = d.packages || 0, read = d.openingsRead || 0;
    const ok = ['SUCCESS', 'PARTIAL'].includes(status) && (pkgs === 0 ? status === 'SUCCESS' : read > 0);
    const why = pkgs > 0 && !read ? ' — KHÔNG đọc được biên bản nào' : pkgs === 0 ? ' (7 ngày qua không có gói mở thầu khớp)' : '';
    return { ok, summary: `${status} · ${pkgs} gói · đọc ${read} biên bản (${d.bidderRows ?? 0} dòng nhà thầu)${why}` };
  }
  if (id === 'canary') {
    return { ok: status === 'GREEN', summary: `${status} · ${Object.entries(d.counts || {}).map(([k, v]) => `${k} ${v}`).join(' · ') || 'chưa có ca nào'}` };
  }
  return { ok: false, summary: status };
}

const pollType = { tbmt: 'GET_SEARCH_STATE', plan: 'GET_PLAN_STATE', bidopen: 'GET_BID_OPEN_STATE', canary: 'CANARY_STATUS' };

/** Chạy lần lượt các luồng. `send` là chrome.runtime.sendMessage đã bọc; mọi phụ thuộc
 *  thời gian được truyền vào để kiểm thử không phải chờ thật. */
export async function runSelfCheck({ send, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, onProgress = () => {},
  canary = true, version = '', userAgent = '', pollMs = 1500, isCancelled = () => false } = {}) {
  const report = { kind: 'gscb-kiem-chung-e-gp', format: 1, version, userAgent: short(userAgent, 200), site: 'muasamcong.mof.gov.vn',
    startedAt: new Date(now()).toISOString(), finishedAt: null, flows: [], passed: 0, total: 0 };
  for (const flow of selfCheckPlan({ canary })) {
    if (isCancelled()) break;
    let item = await runFlow(flow);
    // Trùng một lượt người dùng vừa chạy (< 2 phút) nên lấy từ bộ nhớ đệm: chờ đệm hết hạn rồi hỏi lại e-GP một lần.
    if (item.details?.fromCache && !isCancelled()) {
      onProgress({ ...item, status: 'STARTING', phase: 'poll', summary: 'Lấy từ bộ nhớ đệm — chờ 130 giây rồi hỏi lại e-GP' });
      await sleep(130_000);
      item = await runFlow(flow);
      item.retriedAfterCache = true;
    }
    report.flows.push(item);
    onProgress({ ...item, phase: 'done' });
    // Nghỉ giữa các luồng — nhịp người dùng, không dồn truy vấn lên e-GP.
    if (!isCancelled()) await sleep(3000);
  }
  report.finishedAt = new Date(now()).toISOString();
  report.total = report.flows.length;
  report.passed = report.flows.filter((f) => f.ok).length;
  return report;

  async function runFlow(flow) {
    const t0 = now();
    const item = { id: flow.id, name: flow.name, ok: false, status: 'STARTING', elapsedSeconds: 0, summary: '', details: {} };
    onProgress({ ...item, phase: 'start' });
    try {
      const started = await send(flow.start[0], flow.start[1]);
      if (!started?.ok) { item.status = 'NOT_STARTED'; item.summary = `Không bắt đầu được: ${scrub(started?.message || 'không rõ lý do')}`; }
      else {
        const ctx = { runId: started.runId || '' };
        let state = { done: false, status: 'STARTING' };
        while (!state.done && now() - t0 < flow.timeoutMs && !isCancelled()) {
          await sleep(pollMs);
          state = readFlow(flow.id, await send(pollType[flow.id], flow.id === 'tbmt' ? { runId: ctx.runId } : {}), ctx);
          onProgress({ ...item, status: state.status, phase: 'poll', elapsedSeconds: Math.round((now() - t0) / SEC) });
        }
        item.status = state.done ? state.status : isCancelled() ? 'CANCELLED' : 'TIMEOUT';
        // Việc còn chạy dở (ví dụ đọc chi tiết kế hoạch) hoặc quá giờ: dừng để luồng sau có e-GP rảnh.
        if (flow.cleanup && (state.stillRunning || !state.done)) await send(flow.cleanup[0], flow.cleanup[1]).catch(() => null);
        item.details = state.details || {};
        const verdict = state.done ? judgeFlow(flow.id, state.status, item.details) : { ok: false, summary: item.status === 'TIMEOUT' ? `Quá ${Math.round(flow.timeoutMs / 60000)} phút chưa xong` : 'Đã dừng' };
        item.ok = verdict.ok; item.summary = verdict.summary;
        // Luồng ĐẠT: không giữ chữ tự do nào. Luồng CHƯA ĐẠT: giữ thông báo lỗi đã lọc để biết vì sao.
        const { message, reason, notGreen, ...numbers } = item.details;
        item.details = item.ok ? numbers : { ...numbers, ...(message || reason ? { message: scrub(message || reason) } : {}),
          ...(Array.isArray(notGreen) ? { notGreen: notGreen.map((x) => ({ id: x.id, status: x.status, reason: scrub(x.reason, 160) })) } : {}) };
      }
    } catch (error) { item.status = 'ERROR'; item.summary = scrub(error?.message || error); }
    item.elapsedSeconds = Number(((now() - t0) / SEC).toFixed(1));
    return item;
  }
}

/** Mã băm SHA-256 của nội dung báo cáo (trừ chính trường mã băm) — phát hiện tệp bị sửa tay. */
export async function sealReport(report, cryptoApi = globalThis.crypto) {
  const { digest, ...body } = report || {};
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  const hash = await cryptoApi.subtle.digest('SHA-256', bytes);
  return { ...body, digest: Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('') };
}
