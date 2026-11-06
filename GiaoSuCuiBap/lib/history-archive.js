/* ============================================================================
 *  KHO LỊCH SỬ BIÊN BẢN MỞ THẦU — nạp dần, tiếp tục được (4.19.0)
 *
 *  Điểm yếu cần khắc phục: dịch vụ máy chủ có sẵn nhiều năm lịch sử giá dự thầu;
 *  tiện ích chỉ có những gì người dùng tự tra. Kho lịch sử dùng ĐÚNG luồng đọc
 *  biên bản mở thầu đã kiểm thử (chế độ gói ĐÃ CÓ KẾT QUẢ) và chạy thành một
 *  hàng đợi: từng tháng của tỉnh + lĩnh vực đã chọn, rồi toàn bộ lịch sử của
 *  các chủ đầu tư đang theo dõi. Mỗi lượt đọc tối đa N biên bản; biên bản đã đọc
 *  nằm trong bộ nhớ đệm nên chạy lại không hỏi lại e-GP.
 *
 *  Nói thẳng giới hạn (hiện trên trang): khi tra theo TỈNH, e-GP không lọc ngày
 *  ở máy chủ — tiện ích đọc tối đa 2.000 dòng mới nhất rồi lọc ngày trên máy, nên
 *  tháng càng xa càng dễ thiếu (bảng độ phủ ghi rõ). Tra theo CHỦ ĐẦU TƯ thì đọc
 *  được toàn bộ lịch sử của đơn vị đó.
 *
 *  Tệp này là hàm thuần; Chrome/e-GP được truyền vào ở runtime-history.js.
 * ========================================================================== */
export const HISTORY_KEY = 'historyArchive';
export const HISTORY_ALARM = 'gscb-history';
const VN = 7 * 3600000;
const BUSY = ['STARTING', 'OPENING', 'RUNNING', 'LISTING', 'SCANNING'];
const MAX_ATTEMPTS = 3;
const two = (n) => String(n).padStart(2, '0');
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export function safeHistoryConfig(raw = {}) {
  const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  return {
    province: String(raw.province || 'Lâm Đồng').trim().slice(0, 80) || 'Lâm Đồng',
    field: ['XL', 'HH', 'TV', 'PTV', 'HON_HOP', ''].includes(raw.field) ? raw.field : 'XL',
    months: int(raw.months, 1, 36, 12),
    perJob: int(raw.perJob, 20, 300, 120),
    includeWatched: raw.includeWatched !== false,
    schedule: raw.schedule === 'now' ? 'now' : 'night'
  };
}

/** Tháng theo lịch Việt Nam, từ tháng hiện tại lùi về. */
export function monthWindows(now, months) {
  const d = new Date(now + VN);
  let y = d.getUTCFullYear(), m = d.getUTCMonth();
  const out = [];
  for (let i = 0; i < months; i++) {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    out.push({ key: `${y}-${two(m + 1)}`, label: `Tháng ${two(m + 1)}/${y}`, fromDate: `${y}-${two(m + 1)}-01`, toDate: `${y}-${two(m + 1)}-${two(last)}` });
    m -= 1; if (m < 0) { m = 11; y -= 1; }
  }
  return out;
}

/** Hàng đợi: các tháng của tỉnh + lĩnh vực, rồi từng chủ đầu tư đang theo dõi (đủ lịch sử). */
export function buildHistoryQueue(rawConfig, { now, watchedInvestors = [] } = {}) {
  const c = safeHistoryConfig(rawConfig);
  const province = /^(tỉnh|thành phố)\s/i.test(c.province) ? c.province : `Tỉnh ${c.province}`;
  const base = { mode: 'loss', query: '', taxCode: '', days: 0, keyword: '', minPrice: 0, maxPrice: 0, maxPackages: c.perJob };
  const items = monthWindows(now, c.months).map((w) => ({ id: `m-${w.key}`, kind: 'month', label: w.label,
    payload: { ...base, province, field: c.field, investor: '', fromDate: w.fromDate, toDate: w.toDate, fromYear: 0, toYear: 0 },
    status: 'pending', attempts: 0, outcome: null }));
  if (c.includeWatched) {
    const fromYear = new Date(now + VN).getUTCFullYear() - 4;
    const seen = new Set();
    for (const w of Array.isArray(watchedInvestors) ? watchedInvestors.slice(0, 20) : []) {
      const name = String(w?.name || '').trim(), tax = String(w?.taxCode || '').replace(/\D/g, '');
      const id = `i-${tax || fold(name)}`;
      if ((!name && !tax) || seen.has(id)) continue;
      seen.add(id);
      items.push({ id, kind: 'investor', label: name || tax,
        payload: { ...base, province: '', field: c.field, investor: tax || name, fromDate: '', toDate: '', fromYear, toYear: 0 },
        status: 'pending', attempts: 0, outcome: null });
    }
  }
  return { config: c, items };
}

export function emptyHistory() { return { enabled: false, paused: false, config: safeHistoryConfig(), items: [], current: null, createdAt: null, finishedAt: null, lastTickAt: null, lastSkip: '' }; }

export function nextItem(state) {
  return (state?.items || []).find((i) => i.status === 'pending' || (i.status === 'interrupted' && i.attempts < MAX_ATTEMPTS)) || null;
}

/** Giờ đêm theo giờ Việt Nam: 23:00–05:59. */
export function isNight(now) { const h = new Date(now + VN).getUTCHours(); return h >= 23 || h < 6; }

/** Có được bắt đầu một lượt nạp ngay bây giờ không — luôn nhường người dùng, bộ săn và canary. */
export function canStartNow(state, { now, activeJob = null, canaryNextRunAt = null, huntDueSoon = false } = {}) {
  if (!state?.enabled) return { ok: false, reason: 'Chưa bật nạp lịch sử.' };
  if (state.paused) return { ok: false, reason: 'Đang tạm dừng.' };
  if (activeJob) return { ok: false, reason: 'Đang có lượt tra cứu khác — nhường trước.' };
  if (state.config?.schedule !== 'now' && !isNight(now)) return { ok: false, reason: 'Chờ tới giờ đêm (23:00–06:00).' };
  const canary = Date.parse(canaryNextRunAt || '');
  if (Number.isFinite(canary) && canary - now >= -60_000 && canary - now <= 20 * 60_000) return { ok: false, reason: 'Sắp tới giờ kiểm tra cấu trúc e-GP — nhường trước.' };
  if (huntDueSoon) return { ok: false, reason: 'Sắp tới giờ bộ săn — nhường trước.' };
  return { ok: true, reason: '' };
}

/** Bộ săn nào tới giờ trong `withinMs` tới (giờ trên máy, như báo thức Chrome). */
export function huntDueWithin(hunts, now, withinMs = 15 * 60_000) {
  for (const h of Array.isArray(hunts) ? hunts : []) {
    if (!h?.enabled) continue;
    for (const t of h.times || []) {
      const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(t || ''));
      if (!m) continue;
      const d = new Date(now); d.setHours(Number(m[1]), Number(m[2]), 0, 0);
      if (d.getTime() < now - 60_000) d.setDate(d.getDate() + 1);
      if (d.getTime() - now <= withinMs) return true;
    }
  }
  return false;
}

/** Tóm tắt một lượt soi biên bản đã xong thành một dòng độ phủ. */
export function outcomeFromScan(scan) {
  const pkgs = Array.isArray(scan?.packages) ? scan.packages : [];
  const read = pkgs.filter((p) => Array.isArray(p.bidders) && p.bidders.length);
  // "Đủ" = bảng nhà thầu đọc trọn (readState OK); có nhà thầu nhưng thiếu so với số người dự là đọc thiếu.
  const complete = read.filter((p) => !p.readState || p.readState === 'OK').length;
  const cached = read.filter((p) => p.fromCache).length;
  const failed = pkgs.filter((p) => ['TIMEOUT', 'ERROR'].includes(p.readState)).length;
  const capped = Boolean(scan?.listingCapped);
  const notes = [];
  if (capped) notes.push('danh sách e-GP dừng ở giới hạn dòng — tháng này có thể thiếu gói');
  if (read.length > complete) notes.push(`${read.length - complete} biên bản đọc thiếu nhà thầu`);
  if (failed) notes.push(`${failed} biên bản chưa đọc được`);
  if (scan?.status === 'CANCELLED') notes.push('đã bị dừng');
  return { status: scan?.status || 'UNKNOWN', packages: pkgs.length, read: read.length, complete, cached, failed, bidderRows: read.reduce((n, p) => n + p.bidders.length, 0),
    listedRows: Number(scan?.listedRows || 0), listingCapped: capped, note: notes.join('; ') };
}

/** Ghi kết quả một lượt vào hàng đợi. Bị dừng/thay giữa chừng thì thử lại (tối đa 3 lần). */
export function recordOutcome(state, itemId, outcome, now) {
  const items = (state.items || []).map((i) => {
    if (i.id !== itemId) return i;
    const interrupted = outcome.status === 'INTERRUPTED' || outcome.status === 'CANCELLED' || outcome.status === 'TIMEOUT';
    const status = interrupted ? (i.attempts >= MAX_ATTEMPTS ? 'error' : 'interrupted') : ['SUCCESS', 'PARTIAL'].includes(outcome.status) ? 'done' : 'error';
    return { ...i, status, outcome: { ...outcome, at: new Date(now).toISOString() } };
  });
  return { ...state, items, current: null };
}

export function isBusyScan(scan) { return Boolean(scan && BUSY.includes(scan.status)); }

/** Độ phủ của kho quan sát (biên bản đã đọc) — số thật, không suy diễn. */
export function archiveSummary(observations = []) {
  const pk = new Set(), byField = {}, byYear = {};
  let min = null, max = null;
  for (const o of Array.isArray(observations) ? observations : []) {
    if (!o || o.source !== 'bbmt' && o.source !== 'kqlcnt' && !o.notifyNo) continue;
    if (o.notifyNo) pk.add(o.notifyNo);
    const f = o.field || 'khác'; byField[f] = (byField[f] || 0) + 1;
    const t = Date.parse(o.at || '');
    if (Number.isFinite(t)) {
      if (min === null || t < min) min = t; if (max === null || t > max) max = t;
      const y = new Date(t + VN).getUTCFullYear(); byYear[y] = (byYear[y] || 0) + 1;
    }
  }
  return { observations: (observations || []).length, packages: pk.size, from: min === null ? null : new Date(min).toISOString(), to: max === null ? null : new Date(max).toISOString(), byField, byYear };
}

export function queueProgress(state) {
  const items = state?.items || [];
  const count = (s) => items.filter((i) => i.status === s).length;
  return { total: items.length, done: count('done'), error: count('error'), pending: count('pending') + count('interrupted'), running: count('running'),
    read: items.reduce((n, i) => n + (i.outcome?.read || 0), 0) };
}
