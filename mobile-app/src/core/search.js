/* ============================================================================
 *  BỘ ĐIỀU PHỐI TRA CỨU THÔNG BÁO MỜI THẦU (TBMT) CỦA APP
 *
 *  Ở tiện ích Chrome, service worker (background.js) giữ vai trò này. Trong app,
 *  tệp này làm đúng phần việc đó cho MỘT trang e-GP nhúng trong app:
 *    1. kiểm tiêu chí bằng lõi tiện ích (validateCriteria), quy tên tỉnh ra MỌI mã
 *       cùng tên (Lâm Đồng = 68 + 703), tự dựng truy vấn e-GP (buildTbmtQuery);
 *    2. chờ trang e-GP sẵn sàng (KQLCNT_PROBE), giao lượt (KQLCNT_START);
 *    3. nhận từng trang kết quả (KQLCNT_RESULTS — phải xác nhận {ok:true}),
 *       chống trùng trang, chờ chốt lượt (KQLCNT_DONE);
 *    4. chuẩn hoá, chấm điểm, đối chiếu tiêu chí cứng và đối soát độ phủ bằng
 *       ĐÚNG các hàm của tiện ích (normalizeCandidate, scoreTender,
 *       passesHardFilter, coverageOf).
 *  Không có số liệu nào do app tự đoán: thiếu là ghi "chưa đủ dữ liệu".
 * ========================================================================== */
import { validateCriteria, splitProvinceNames } from './egp/workspace.js';
import { codesForProvinceName } from './egp/area-match.js';
import { buildTbmtQueries, PAGE_SIZE, EGP_SEARCH_PAGE } from './egp/kqlcnt.js';
import { normalizeCandidate, scoreTender, DEFAULT_SETTINGS, parseDate } from './egp/core.js';
import { passesHardFilter, hardFilterReason } from './egp/hard-filter.js';
import { coverageOf, GATE_MATCH, GATE_INSUFFICIENT, GATE_OUT } from './egp/match-gate.js';
import { categoryLabel } from './egp/tender-categories.js';

export const SEARCH_LIMITS = Object.freeze({
  readyMs: 75_000,          // chờ trang e-GP vẽ xong ô tìm kiếm
  reloadAfterMs: 20_000,    // không thấy trang trả lời thì tải lại một lần
  idleMs: 150_000,          // không nhận thêm trang nào trong chừng này: dừng, giữ phần đã có
  runMs: 12 * 60_000,       // trần cho cả lượt (mọi chủ đầu tư)
  maxPages: DEFAULT_SETTINGS.maxPagesHint
});

const GATE_ORDER = { [GATE_MATCH]: 0, [GATE_INSUFFICIENT]: 1, [GATE_OUT]: 2 };
const STATUS_ORDER = { OPEN: 0, UNKNOWN: 1, PLAN: 2, CLOSED: 3 };

/** Chỉ giữ các trường tiêu chí công khai, như publicFilterCriteria() của tiện ích. */
export function publicCriteria(criteria = {}) {
  const out = {};
  for (const key of ['investor', 'province', 'keyword', 'mustKeywords', 'excludeKeywords', 'minPrice', 'maxPrice', 'category']) {
    if (Object.hasOwn(criteria, key)) out[key] = criteria[key];
  }
  if (Array.isArray(criteria.provinces)) out.provinces = criteria.provinces.slice(0, 100);
  return out;
}

export function searchLabel(criteria = {}) {
  return [
    criteria.category && categoryLabel(criteria.category),
    criteria.investor && `CĐT "${criteria.investor}"`,
    criteria.province && `tỉnh "${criteria.province}"`,
    criteria.mustKeywords && `bắt buộc "${criteria.mustKeywords}"`,
    criteria.excludeKeywords && `loại "${criteria.excludeKeywords}"`,
    criteria.keyword && `từ khoá "${criteria.keyword}"`
  ].filter(Boolean).join(' · ') || 'theo khoảng giá';
}

/** Quy TÊN tỉnh ra MỌI MÃ cùng tên; tên không nhận ra thì báo, không tìm rộng ra cả nước. */
export function resolveProvinces(text) {
  const names = splitProvinceNames(text);
  const codes = [];
  const unknown = [];
  for (const name of names) {
    const found = codesForProvinceName(name);
    if (found.length) codes.push(...found); else unknown.push(name);
  }
  return { ok: unknown.length === 0, names, codes: [...new Set(codes)], unknown };
}

/** Kiểm tiêu chí và dựng sẵn mọi truy vấn của lượt. Không chạm mạng. */
export function prepareSearch(raw = {}) {
  // App không có danh mục xã/phường của e-GP: không nhận tiêu chí xã/phường thay vì lọc sai.
  const input = { ...raw };
  delete input.ward; delete input.wardCode; delete input.wardParentCode; delete input.wardIdentities; delete input.wards;
  const validation = validateCriteria(input);
  if (!validation.ok) return { ok: false, field: validation.field, message: validation.message };
  const criteria = validation.criteria;
  let provinces = [];
  if (criteria.province) {
    const resolved = resolveProvinces(criteria.province);
    if (!resolved.ok) {
      return { ok: false, field: 'province', message: `Không nhận ra tỉnh/thành "${resolved.unknown.join(', ')}". Gõ đúng tên tỉnh, nhiều tỉnh cách nhau bằng dấu chấm phẩy.` };
    }
    provinces = resolved.codes;
  }
  const full = { ...criteria, provinces };
  let queries;
  try { queries = buildTbmtQueries(full); } catch (error) {
    return { ok: false, field: 'investor', message: String(error?.message || error) };
  }
  return { ok: true, criteria: publicCriteria(full), queries, label: searchLabel(criteria) };
}

/** Một bản ghi e-GP → gói thầu đã chấm điểm và đối chiếu tiêu chí cứng (như scoredWithGate). */
export function evaluateRecord(raw, criteria, { settings = DEFAULT_SETTINGS, capturedAt } = {}) {
  const normalized = normalizeCandidate(raw, { captureType: 'form', capturedAt, sourcePageUrl: EGP_SEARCH_PAGE });
  if (!normalized) return null;
  const record = { ...raw, ...normalized };
  const score = scoreTender(record, settings);
  const gate = passesHardFilter(record, criteria || {});
  return {
    ...normalized,
    score: score.score,
    recommendation: score.recommendation,
    reasons: score.reasons,
    construction: score.construction,
    bidState: score.status,
    bidStateLabel: score.statusLabel,
    matched: gate.ok && score.matched,
    filterState: gate.state,
    filterReason: gate.reason || '',
    filterReasonLabel: hardFilterReason(gate),
    filterReasons: (gate.reasons || []).map((r) => ({ field: r.field, reason: r.reason, state: r.state, label: hardFilterReason(r) }))
  };
}

export function sortTenders(list = []) {
  const closeMs = (t) => { const iso = parseDate(t.closeDate); const ms = iso ? Date.parse(iso) : NaN; return Number.isFinite(ms) ? ms : Infinity; };
  return [...list].sort((a, b) =>
    (GATE_ORDER[a.filterState] ?? 9) - (GATE_ORDER[b.filterState] ?? 9)
    || (STATUS_ORDER[a.bidState] ?? 9) - (STATUS_ORDER[b.bidState] ?? 9)
    || (b.score || 0) - (a.score || 0)
    || closeMs(a) - closeMs(b));
}

const finite = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Gộp độ phủ nhiều truy vấn: tổng chỉ biết khi MỌI truy vấn đều biết. */
export function combineCoverage(parts, { fetched, match, insufficient, outOfRange, done, partial }) {
  const sum = (key) => (parts.length && parts.every((p) => p[key] !== null) ? parts.reduce((n, p) => n + p[key], 0) : null);
  return coverageOf({
    serverTotal: sum('serverTotal'), totalPages: sum('totalPages'),
    pagesRead: parts.reduce((n, p) => n + p.pagesRead, 0),
    fetched, match, insufficient, outOfRange, done, partial
  });
}

const pageErrorText = (code) => (code === 'PORTLET_UNAVAILABLE'
  ? 'Trang e-GP báo thành phần tra cứu tạm thời không khả dụng. Thử lại sau ít phút.'
  : 'Trang e-GP đang từ chối truy cập hoặc báo lỗi hệ thống. Bấm "Xem trang e-GP" để kiểm tra, rồi thử lại.');

/**
 * @param {object} deps
 * @param {{command:Function}} deps.channel  kênh tạo bởi createPageChannel()
 * @param {Function} [deps.reload]          tải lại trang tra cứu e-GP trong WebView
 * @param {Function} [deps.now]
 * @param {Function} [deps.sleep]
 * @param {object}   [deps.settings]        cấu hình chấm điểm (mặc định của tiện ích)
 * @param {object}   [deps.limits]
 */
export function createTbmtSearch({ channel, reload = async () => {}, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), settings = DEFAULT_SETTINGS, limits = {} } = {}) {
  if (!channel || typeof channel.command !== 'function') throw new Error('Thiếu kênh nhắn tin với trang e-GP.');
  const L = { ...SEARCH_LIMITS, ...limits };
  let job = null;          // lượt đang chạy
  let pageState = null;    // CONTENT_READY gần nhất (chỉ để chẩn đoán)

  const isActive = (payload) => job && !job.finished && payload && String(payload.planId) === job.id
    && Number(payload.queryIndex ?? 0) === job.queryIndex;

  function progress(extra = {}) {
    if (!job) return;
    const q = job.perQuery[job.queryIndex] || {};
    const snapshot = {
      phase: job.phase, label: job.label, queryIndex: job.queryIndex, queryCount: job.queries.length,
      fetched: job.fetched, pagesRead: q.pages ? q.pages.size : 0, totalPages: q.totalPages ?? null,
      totalElements: q.totalElements ?? null, message: job.message, ...extra
    };
    try { job.onProgress?.(snapshot); } catch { /* giao diện lỗi không được làm hỏng lượt tra */ }
  }

  function acceptPage(payload) {
    const q = job.perQuery[job.queryIndex];
    job.lastActivity = now();
    const records = Array.isArray(payload.records) ? payload.records.slice(0, 1000) : [];
    if (payload.done === true) {
      Object.assign(q, {
        finalSeen: true, capped: Boolean(payload.capped), cancelled: Boolean(payload.cancelled),
        partial: Boolean(payload.partial), schemaIssue: Boolean(payload.schemaIssue),
        failureReason: payload.failureReason ? String(payload.failureReason).slice(0, 300) : q.failureReason
      });
      q.totalElements = finite(payload.totalElements) ?? q.totalElements;
      q.totalPages = finite(payload.totalPages) ?? q.totalPages;
      job.message = 'Đã nhận trang cuối; đang chốt lượt tra cứu...';
      progress();
      return { ok: true };
    }
    const pageIndex = Number(payload.pageIndex);
    if (!Number.isInteger(pageIndex) || pageIndex < 0) return { ok: false, message: 'Trang dữ liệu không có số thứ tự hợp lệ.' };
    // Trang gửi lại vì xác nhận trước bị lỡ: nhận lại thì đếm trùng. Xác nhận, không cộng.
    if (q.pages.has(pageIndex)) return { ok: true, duplicate: true };
    q.pages.add(pageIndex);
    q.totalElements = finite(payload.totalElements) ?? q.totalElements;
    q.totalPages = finite(payload.totalPages) ?? q.totalPages;
    if (payload.schemaIssue) q.schemaIssue = true;
    if (payload.failureReason) q.failureReason = String(payload.failureReason).slice(0, 300);
    const capturedAt = new Date(now()).toISOString();
    for (const raw of records) {
      job.fetched += 1;
      q.fetched += 1;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { job.invalid += 1; continue; }
      const tender = evaluateRecord(raw, job.criteria, { settings, capturedAt });
      if (!tender) { job.invalid += 1; continue; }
      if (q.keys.has(tender.key)) { q.duplicates += 1; job.duplicates += 1; continue; }
      q.keys.add(tender.key);
      if (!job.tenders.has(tender.key)) job.tenders.set(tender.key, tender);
    }
    const total = q.totalElements;
    job.message = `Đã lấy ${job.fetched}${total != null ? `/${total}` : ''} kết quả (trang ${q.pages.size}${q.totalPages != null ? `/${Math.min(q.totalPages, L.maxPages)}` : ''})...`;
    progress();
    return { ok: true };
  }

  /** Trả lời MỌI tin nhắn từ trang. Gắn vào channel.setHandler(). */
  function handlePageMessage(message = {}) {
    const type = String(message?.type || '');
    const payload = message?.payload && typeof message.payload === 'object' ? message.payload : {};
    if (type === 'CONTENT_READY') {
      pageState = { phase: String(payload.phase || ''), pageError: payload.pageError || null, at: now() };
      return { ok: true };
    }
    if (type === 'KQLCNT_RESULTS') {
      // Trang thuộc lượt cũ hoặc lượt đã dừng: từ chối để content.js không đọc tiếp.
      if (!isActive(payload) || payload.mode !== 'tbmt') return { ok: false, cancelled: true, message: 'Trang dữ liệu không thuộc lượt tra cứu đang chạy.' };
      return acceptPage(payload);
    }
    if (type === 'KQLCNT_DONE') {
      if (isActive(payload)) {
        const q = job.perQuery[job.queryIndex];
        q.done = { ok: payload.ok === true, cancelled: Boolean(payload.cancelled), message: String(payload.message || '').slice(0, 400) };
        job.lastActivity = now();
      }
      return { ok: true };
    }
    // Bắt thụ động (INGEST_CAPTURE…), mẫu truy vấn, trang chi tiết: app chưa dùng — xác nhận để trang không thử lại.
    return { ok: true, ignored: true };
  }

  async function probe() {
    try { return await channel.command({ type: 'KQLCNT_PROBE' }, 4_000); } catch { return null; }
  }

  async function waitReady() {
    const started = now();
    let reloaded = false;
    let cancelledStale = false;
    let lastAnswer = started;
    while (now() - started < L.readyMs) {
      if (job?.cancelRequested) return { ok: false, cancelled: true, message: 'Đã dừng theo yêu cầu.' };
      const state = await probe();
      if (state && state.ok) {
        lastAnswer = now();
        if (state.pageError) return { ok: false, message: pageErrorText(state.pageError) };
        if (state.busy) {
          // Lượt cũ (app bị đóng giữa chừng) được trang tự khôi phục: dừng nó một lần.
          if (!cancelledStale) { cancelledStale = true; await channel.command({ type: 'KQLCNT_CANCEL', payload: {} }, 4_000).catch(() => null); }
        } else if (state.ready) return { ok: true };
      }
      if (!reloaded && now() - lastAnswer > L.reloadAfterMs) {
        reloaded = true;
        job.message = 'Trang e-GP chưa phản hồi; đang tải lại trang tra cứu...';
        progress();
        await Promise.resolve(reload()).catch(() => {});
        lastAnswer = now();
      }
      await sleep(700);
    }
    return { ok: false, message: 'Trang e-GP chưa sẵn sàng sau 75 giây. Kiểm tra mạng, bấm "Xem trang e-GP" để xem trang có mở được không, rồi thử lại.' };
  }

  async function runQuery(index) {
    job.queryIndex = index;
    job.perQuery[index] = { pages: new Set(), keys: new Set(), fetched: 0, duplicates: 0, totalElements: null, totalPages: null, done: null, finalSeen: false };
    job.phase = 'ready';
    job.message = job.queries.length > 1 ? `Chủ đầu tư ${index + 1}/${job.queries.length}: đang chờ trang e-GP sẵn sàng...` : 'Đang chờ trang e-GP sẵn sàng...';
    progress();
    const ready = await waitReady();
    if (!ready.ok) return ready;
    job.phase = 'search';
    job.message = 'Đang hỏi e-GP các gói thầu khớp tiêu chí...';
    job.lastActivity = now();
    progress();
    let started;
    try {
      started = await channel.command({ type: 'KQLCNT_START', payload: {
        id: job.id, mode: 'tbmt', queryIndex: index,
        label: job.queries.length > 1 ? `${job.label} (${index + 1}/${job.queries.length})` : job.label,
        query: job.queries[index], pageSize: PAGE_SIZE, maxPages: L.maxPages
      } }, 15_000);
    } catch (error) {
      return { ok: false, message: `Không giao được lượt tra cứu cho trang e-GP: ${String(error?.message || error)}` };
    }
    if (!started || started.ok === false) return { ok: false, message: started?.message || 'Trang e-GP từ chối lượt tra cứu.' };
    job.lastActivity = now();
    const q = job.perQuery[index];
    while (!q.done) {
      if (job.cancelRequested) break;
      if (now() - job.lastActivity > L.idleMs) {
        await channel.command({ type: 'KQLCNT_CANCEL', payload: { planId: job.id } }, 4_000).catch(() => null);
        return { ok: false, timedOut: true, message: 'e-GP ngừng trả dữ liệu giữa chừng. Đã giữ phần nhận được và đánh dấu chưa đầy đủ.' };
      }
      if (now() - job.startedAtMs > L.runMs) {
        await channel.command({ type: 'KQLCNT_CANCEL', payload: { planId: job.id } }, 4_000).catch(() => null);
        return { ok: false, timedOut: true, message: 'Lượt tra cứu vượt quá thời gian cho phép. Đã giữ phần nhận được.' };
      }
      await sleep(250);
    }
    if (job.cancelRequested) return { ok: false, cancelled: true, message: 'Đã dừng theo yêu cầu; giữ phần đã nhận.' };
    return { ok: q.done.ok, message: q.done.message };
  }

  function finish(outcome) {
    const tenders = sortTenders([...job.tenders.values()]);
    const match = tenders.filter((t) => t.filterState === GATE_MATCH).length;
    const insufficient = tenders.filter((t) => t.filterState === GATE_INSUFFICIENT).length + job.invalid;
    const outOfRange = tenders.filter((t) => t.filterState === GATE_OUT).length;
    const parts = job.perQuery.filter(Boolean).map((q) => {
      const pageIndexes = [...q.pages].sort((a, b) => a - b);
      const empty = q.totalElements === 0 && (q.totalPages === 0 || q.totalPages === 1) && q.fetched === 0;
      const c = coverageOf({
        serverTotal: q.totalElements, totalPages: q.totalPages, fetched: q.fetched,
        pageIndexes: empty ? [] : pageIndexes, done: Boolean(q.finalSeen),
        partial: Boolean(q.partial || q.capped || q.cancelled || q.schemaIssue || q.duplicates)
      });
      return { serverTotal: c.serverTotal, totalPages: c.totalPages, pagesRead: c.pagesRead, complete: c.complete, done: Boolean(q.finalSeen), capped: Boolean(q.capped), failureReason: q.failureReason || '' };
    });
    const allQueries = job.perQuery.filter(Boolean).length === job.queries.length;
    const partial = !outcome.ok || !allQueries || job.invalid > 0 || job.duplicates > 0 || parts.some((p) => !p.complete);
    const coverage = combineCoverage(parts, { fetched: job.fetched, match, insufficient, outOfRange, done: allQueries && parts.every((p) => p.done), partial });
    const status = outcome.cancelled ? 'CANCELLED' : !outcome.ok && !job.fetched ? 'ERROR' : partial ? 'PARTIAL' : 'SUCCESS';
    const notes = [];
    if (parts.some((p) => p.capped)) notes.push(`Mới đọc tối đa ${L.maxPages} trang (${L.maxPages * PAGE_SIZE} gói) mỗi truy vấn — thu hẹp tiêu chí để xem đủ.`);
    if (job.invalid) notes.push(`${job.invalid} bản ghi e-GP thiếu mã TBMT nên chưa đưa vào danh sách.`);
    if (job.duplicates) notes.push(`${job.duplicates} bản ghi trùng giữa các trang; chưa xác nhận lấy đủ.`);
    for (const p of parts) if (p.failureReason) notes.push(p.failureReason);
    const message = status === 'SUCCESS' ? `Hoàn tất. ${coverage.text}`
      : status === 'ERROR' ? (outcome.message || 'Lượt tra cứu không thành công.')
        : `${outcome.message ? `${outcome.message} ` : ''}${coverage.text}`;
    const result = {
      id: job.id, ok: status === 'SUCCESS' || status === 'PARTIAL', status, message, notes: [...new Set(notes)],
      label: job.label, criteria: job.criteria, startedAt: new Date(job.startedAtMs).toISOString(), finishedAt: new Date(now()).toISOString(),
      coverage, counts: { fetched: job.fetched, unique: tenders.length, match, insufficient, outOfRange, invalid: job.invalid, duplicates: job.duplicates },
      tenders
    };
    job.finished = true;
    job.phase = 'done';
    job.message = message;
    progress({ status });
    return result;
  }

  async function run(raw, { onProgress } = {}) {
    if (job && !job.finished) return { ok: false, status: 'BUSY', message: 'Một lượt tra cứu khác đang chạy. Bấm Dừng rồi thử lại.' };
    const prepared = prepareSearch(raw);
    if (!prepared.ok) return { ok: false, status: 'INVALID', field: prepared.field, message: prepared.message };
    const t = now();
    job = {
      id: `app-${t}-${Math.random().toString(36).slice(2, 8)}`, label: prepared.label, criteria: prepared.criteria,
      queries: prepared.queries, perQuery: [], queryIndex: 0, tenders: new Map(), fetched: 0, invalid: 0, duplicates: 0,
      startedAtMs: t, lastActivity: t, phase: 'start', message: 'Đang chuẩn bị...', onProgress, cancelRequested: false, finished: false
    };
    let outcome = { ok: true };
    for (let i = 0; i < job.queries.length; i++) {
      outcome = await runQuery(i);
      if (!outcome.ok) break;
    }
    return finish(outcome);
  }

  async function cancel() {
    if (!job || job.finished) return { ok: true, message: 'Không có lượt nào đang chạy.' };
    job.cancelRequested = true;
    await channel.command({ type: 'KQLCNT_CANCEL', payload: { planId: job.id } }, 4_000).catch(() => null);
    return { ok: true };
  }

  return {
    run, cancel, handlePageMessage,
    isRunning: () => Boolean(job && !job.finished),
    pageState: () => pageState,
    /** App vừa trở lại màn hình: thời gian iOS tạm dừng app không tính là "e-GP ngừng trả". */
    touch() { if (job && !job.finished) job.lastActivity = now(); }
  };
}
