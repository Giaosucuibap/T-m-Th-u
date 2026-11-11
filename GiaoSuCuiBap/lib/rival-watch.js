/* ============================================================================
 *  THEO DÕI ĐỐI THỦ (4.22.0)
 *
 *  Người dùng ghi mã số thuế vài nhà thầu muốn để mắt. Mỗi khi kho có thêm dữ liệu —
 *  biên bản mở thầu (biết ai DỰ) hoặc kết quả lựa chọn nhà thầu (biết ai TRÚNG) — phần
 *  mềm so với lần xem trước và báo các gói MỚI của những nhà thầu đó.
 *
 *  Giới hạn phải nói thẳng với người dùng (giao diện cũng ghi):
 *    - "Trúng" chỉ biết khi e-GP đã đăng kết quả và phần mềm đã tra mã số thuế đó.
 *    - "Dự thầu" chỉ biết với những gói đã đọc biên bản mở thầu.
 *    - Đây là dữ liệu công khai trên e-GP; không suy diễn gì thêm về quan hệ hay ý định.
 *
 *  Mô-đun thuần: không mạng, không kho. Nguồn duy nhất là kho quan sát (lib/analytics.js).
 * ========================================================================== */

export const MAX_RIVALS = 30;
export const MAX_RIVAL_EVENTS = 200;
export const RIVAL_STALE_MS = 20 * 3600_000;   // mỗi đối thủ tra e-GP tối đa một lần mỗi ngày
export const RIVAL_SWEEP_LIMIT = 5;            // mỗi lượt tự kiểm tra tối đa 5 đối thủ, để không dồn truy vấn lên e-GP

const text = (value, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const iso = (value) => { const n = Date.parse(String(value || '')); return Number.isFinite(n) ? new Date(n).toISOString() : ''; };

/** Mã số thuế 10 số (bỏ "vn", bỏ mã chi nhánh -001). Sai định dạng → ''. */
export function rivalTax(value) {
  const digits = String(value ?? '').trim().replace(/^vn/i, '').replace(/[^0-9]/g, '');
  return digits.length === 10 || digits.length === 13 ? digits.slice(0, 10) : '';
}

export function safeRivalWatches(raw) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== 'object') continue;
    const taxCode = rivalTax(item.taxCode);
    if (!taxCode || seen.has(taxCode)) continue;
    seen.add(taxCode);
    out.push({ taxCode, name: text(item.name, 200), note: text(item.note, 300), addedAt: iso(item.addedAt) });
    if (out.length >= MAX_RIVALS) break;
  }
  return out;
}

/** Mã gói không kèm số phiên bản: IB2600455010-01 → IB2600455010. */
export function packageOf(observation = {}) {
  const raw = text(observation.notifyNo || observation.packageKey, 80);
  const code = raw.match(/IB\d+/i)?.[0] || raw.split('::')[0];
  return code.replace(/-\d{2}$/, '').toUpperCase();
}

const kindOf = (o) => (o.won === true || o.source === 'kqlcnt' ? 'won' : 'bid');
const moneyOf = (o) => { for (const v of [o.finalPrice, o.bidPrice]) { const n = Number(v); if (Number.isFinite(n) && n > 0) return n; } return null; };

function eventOf(o, watch, kind) {
  return { id: `${watch.taxCode}|${packageOf(o)}|${kind}`, taxCode: watch.taxCode, name: watch.name || text(o.contractorName, 200), kind,
    notifyNo: packageOf(o), bidName: text(o.bidName, 300), investorName: text(o.investorName, 200), location: text(o.location, 120),
    price: moneyOf(o), packagePrice: Number(o.packageBasis) > 0 ? Number(o.packageBasis) : null, bidderCount: Number(o.bidderCount) > 0 ? Number(o.bidderCount) : null,
    isVenture: Boolean(o.isVenture), at: iso(o.at), sourceUrl: /^https:\/\/muasamcong\.(?:mof|mpi)\.gov\.vn\//i.test(String(o.sourceUrl || '')) ? String(o.sourceUrl).slice(0, 500) : '' };
}

/** Gom quan sát theo đối thủ đang theo dõi: mỗi gói một dòng, "trúng" đè lên "dự". */
function byRival(watches, observations) {
  const index = new Map(watches.map((w) => [w.taxCode, { watch: w, packs: new Map() }]));
  for (const o of Array.isArray(observations) ? observations : []) {
    if (!o || typeof o !== 'object') continue;
    const entry = index.get(rivalTax(o.taxCode));
    const pack = entry && packageOf(o);
    if (!pack) continue;
    const kind = kindOf(o), prev = entry.packs.get(pack);
    if (!prev || (kind === 'won' && prev.kind !== 'won') || (kind === prev.kind && (Date.parse(o.at) || 0) > (Date.parse(prev.o.at) || 0))) entry.packs.set(pack, { kind, o });
    else if (prev.kind === 'won' && kind === 'bid' && !prev.o.bidderCount && o.bidderCount) prev.o = { ...prev.o, bidderCount: o.bidderCount };
  }
  return index;
}

/**
 * Sự kiện MỚI so với lần xem trước.
 * `seen`: {"<mst>|<mã gói>": 'bid'|'won'}; `baseline`: {<mst>: thời điểm bắt đầu theo dõi}.
 * Lần đầu gặp một đối thủ (chưa có baseline): ghi nhận mọi gói đã có, KHÔNG báo — nếu
 * không, vừa thêm đối thủ là nhận cả trăm "tin mới" về những gói đã cũ.
 */
export function newRivalEvents({ watches = [], observations = [], seen = {}, baseline = {}, now = Date.now() } = {}) {
  const list = safeRivalWatches(watches);
  const nextSeen = {}, nextBaseline = {}, events = [];
  const stamp = new Date(now).toISOString();
  // Giữ dấu "đã xem" của đối thủ còn theo dõi kể cả khi quan sát cũ bị dọn khỏi kho (kho có trần):
  // nạp lại sau này không thành "tin mới" lần nữa. Bỏ theo dõi thì dấu của đối thủ đó được xoá.
  const watched = new Set(list.map((w) => w.taxCode));
  for (const [key, value] of Object.entries(seen && typeof seen === 'object' ? seen : {})) {
    if (watched.has(key.split('|')[0]) && (value === 'bid' || value === 'won')) nextSeen[key] = value;
  }
  for (const { watch, packs } of byRival(list, observations).values()) {
    const first = !baseline || !baseline[watch.taxCode];
    nextBaseline[watch.taxCode] = first ? stamp : baseline[watch.taxCode];
    for (const [pack, { kind, o }] of packs) {
      const key = `${watch.taxCode}|${pack}`;
      const before = nextSeen[key];
      if (before === 'won') continue;                 // đã báo "trúng": không lùi về "dự"
      nextSeen[key] = kind;
      if (first || before === kind) continue;
      events.push({ ...eventOf(o, watch, kind), foundAt: stamp, upgraded: before === 'bid' && kind === 'won' });
    }
  }
  // Mới nhất trước; cùng ngày thì "trúng" trước.
  events.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0) || (a.kind === 'won' ? -1 : 1));
  return { events, seen: nextSeen, baseline: nextBaseline };
}

/** Bảng tóm tắt từng đối thủ để hiện ở trang Đối thủ. */
export function rivalSummary({ watches = [], observations = [], checkedAt = {} } = {}) {
  const list = safeRivalWatches(watches);
  return [...byRival(list, observations).values()].map(({ watch, packs }) => {
    const rows = [...packs.values()];
    const latest = rows.map(({ kind, o }) => eventOf(o, watch, kind)).sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0)).slice(0, 5);
    const name = watch.name || latest.find((e) => e.name)?.name || '';
    return { ...watch, name, packages: rows.length, wins: rows.filter((r) => r.kind === 'won').length, bidsOnly: rows.filter((r) => r.kind === 'bid').length,
      latest, checkedAt: iso(checkedAt && checkedAt[watch.taxCode]) };
  });
}

/** Đối thủ đến lượt tra e-GP: chưa tra hoặc đã quá một ngày; lâu chưa tra nhất đứng trước. */
export function rivalsDue({ watches = [], checkedAt = {}, now = Date.now(), limit = RIVAL_SWEEP_LIMIT, force = false } = {}) {
  return safeRivalWatches(watches)
    .map((w) => ({ ...w, last: Date.parse(checkedAt && checkedAt[w.taxCode]) || 0 }))
    .filter((w) => force || now - w.last >= RIVAL_STALE_MS)
    .sort((a, b) => a.last - b.last)
    .slice(0, Math.max(0, limit))
    .map(({ last, ...w }) => w);
}

const money = (n) => (Number(n) > 0 ? `${(Number(n) / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ` : '');
const vnDate = (value) => { const t = Date.parse(value || ''); if (!Number.isFinite(t)) return ''; const d = new Date(t + 7 * 3600_000); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };

/** Một dòng chữ thường cho thông báo trên máy. */
export function rivalEventText(event = {}) {
  const who = event.name || `MST ${event.taxCode}`;
  const what = event.kind === 'won' ? (event.isVenture ? 'trúng (liên danh)' : 'trúng') : 'dự thầu';
  const price = money(event.price);
  return `${who} ${what}: ${event.bidName || event.notifyNo}${price ? ` — ${event.kind === 'won' ? 'giá trúng' : 'giá dự'} ${price}` : ''}${event.at ? ` (${vnDate(event.at)})` : ''}`;
}

/** Tin Telegram (HTML) gom mọi sự kiện mới của một lượt; `escape` do nơi gọi truyền vào. */
export function rivalTelegramText(events = [], escape = (s) => String(s)) {
  if (!events.length) return '';
  const lines = events.slice(0, 12).map((e) => {
    const icon = e.kind === 'won' ? '🏆' : '📝';
    const what = e.kind === 'won' ? (e.isVenture ? 'TRÚNG (liên danh)' : 'TRÚNG') : 'DỰ THẦU';
    const price = money(e.price);
    return `${icon} <b>${escape(e.name || `MST ${e.taxCode}`)}</b> — ${what}\n   ${escape(e.bidName || e.notifyNo)}`
      + `\n   ${escape(e.notifyNo)}${e.investorName ? ` · ${escape(e.investorName)}` : ''}${price ? ` · ${e.kind === 'won' ? 'giá trúng' : 'giá dự'} ${price}` : ''}${e.at ? ` · ${vnDate(e.at)}` : ''}`;
  });
  const more = events.length > 12 ? `\n… và ${events.length - 12} gói khác (xem trong phần mềm, mục Đối thủ).` : '';
  return `👀 <b>Động thái đối thủ đang theo dõi</b> (${events.length})\n\n${lines.join('\n\n')}${more}\n\n<i>Nguồn: dữ liệu công khai trên e-GP đã tải về máy.</i>`;
}
