/* ============================================================================
 *  TRẠM SĂN (4.19.0) — biết lúc nào máy/Chrome không chạy, bộ săn nào lỡ giờ,
 *  và chạy bù đúng một lần.
 *
 *  Vì sao cần: lịch bộ săn dùng báo thức Chrome. Khi Chrome khởi động lại,
 *  ensureHuntAlarms() xoá báo thức cũ và đặt lại vào LẦN TỚI — lượt 06:05 bị lỡ
 *  khi máy tắt sẽ mất hẳn, trong khi trang Bộ săn lại ghi "chạy bù khi mở lại".
 *
 *  Toàn bộ tệp này là hàm thuần (không gọi Chrome), kiểm thử ở 4 múi giờ.
 *  Giờ chạy là giờ đồng hồ TRÊN MÁY — giống nextDailyTime() của báo thức.
 * ========================================================================== */
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const STATION_KEY = 'huntStation';
/** Báo thức "nhịp tim" (DEADLINE_ALARM) chạy 30 phút một lần. Im lặng lâu hơn
 *  mức này nghĩa là Chrome không chạy hoặc máy ngủ. */
export const OFFLINE_GAP_MS = 50 * 60 * 1000;
/** Chờ Chrome và tab e-GP khởi động xong rồi mới chạy bù; các bộ săn cách nhau. */
export const CATCHUP_DELAY_MS = 90 * 1000;
export const CATCHUP_GAP_MS = 60 * 1000;
const MAX_OFFLINE = 30, MAX_LOG = 60;

/** Lần gần nhất (≤ now) đồng hồ trên máy chỉ đúng hh:mm. */
export function latestSlotAtOrBefore(hhmm, now) {
  const m = TIME.exec(String(hhmm ?? '').trim());
  if (!m || !Number.isFinite(now)) return null;
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

/** Mốc "bộ săn bắt đầu có hiệu lực": lần chạy gần nhất, hoặc lúc tạo / bật lại /
 *  đổi giờ. Không có mốc nào thì không đoán — bộ săn chưa từng chạy không tự
 *  chạy bù (người dùng bấm "Chạy ngay" nếu muốn). */
export function huntReference(hunt) {
  const t = (v) => { const n = Date.parse(String(v || '')); return Number.isFinite(n) ? n : 0; };
  return Math.max(t(hunt?.lastRunAt), t(hunt?.activeSince), t(hunt?.createdAt));
}

/** Các bộ săn đang bật đã lỡ giờ chạy gần nhất (máy tắt, Chrome đóng, đang bận…). */
export function missedHuntSlots(hunts, now) {
  const out = [];
  for (const h of Array.isArray(hunts) ? hunts : []) {
    if (!h || !h.enabled || !h.id) continue;
    const ref = huntReference(h);
    if (!ref || ref > now + 60_000) continue;
    let slot = null, time = '';
    for (const t of Array.isArray(h.times) ? h.times : []) {
      const s = latestSlotAtOrBefore(t, now);
      if (s != null && (slot == null || s > slot)) { slot = s; time = t; }
    }
    if (slot == null || slot <= ref) continue;
    out.push({ huntId: String(h.id), name: String(h.name || ''), time, slot });
  }
  return out.sort((a, b) => a.slot - b.slot || a.huntId.localeCompare(b.huntId));
}

/** Giờ chạy bù cho từng bộ săn lỡ giờ: chờ khởi động xong, mỗi bộ cách nhau. */
export function catchupSchedule(missed, now, { delayMs = CATCHUP_DELAY_MS, gapMs = CATCHUP_GAP_MS } = {}) {
  return (missed || []).map((m, i) => ({ ...m, when: now + delayMs + i * gapMs }));
}

export function emptyStation() {
  return { heartbeat: { lastAliveAt: null, lastStartupAt: null }, offline: [], pending: {}, log: [] };
}

export function safeStation(raw) {
  const base = emptyStation();
  if (!raw || typeof raw !== 'object') return base;
  const iso = (v) => { const n = Date.parse(String(v || '')); return Number.isFinite(n) ? new Date(n).toISOString() : null; };
  const hb = raw.heartbeat || {};
  base.heartbeat = { lastAliveAt: iso(hb.lastAliveAt), lastStartupAt: iso(hb.lastStartupAt) };
  base.offline = (Array.isArray(raw.offline) ? raw.offline : []).map((w) => ({ from: iso(w?.from), to: iso(w?.to), startup: Boolean(w?.startup) }))
    .filter((w) => w.from && w.to && Date.parse(w.to) > Date.parse(w.from)).slice(0, MAX_OFFLINE);
  const pending = raw.pending && typeof raw.pending === 'object' ? raw.pending : {};
  for (const [id, p] of Object.entries(pending).slice(0, 12)) {
    const slot = Number(p?.slot);
    if (/^[A-Za-z0-9_-]{1,80}$/.test(id) && Number.isFinite(slot)) base.pending[id] = { slot, time: String(p.time || '').slice(0, 5), name: String(p.name || '').slice(0, 70), detectedAt: iso(p.detectedAt), notifiedAt: iso(p.notifiedAt) };
  }
  base.log = (Array.isArray(raw.log) ? raw.log : []).filter((e) => e && typeof e === 'object').map((e) => ({
    at: iso(e.at), kind: ['missed', 'catchup', 'skipped', 'offline'].includes(e.kind) ? e.kind : 'missed',
    huntId: String(e.huntId || '').slice(0, 80), name: String(e.name || '').slice(0, 70),
    slot: Number.isFinite(Number(e.slot)) ? Number(e.slot) : null, note: String(e.note || '').slice(0, 200)
  })).filter((e) => e.at).slice(0, MAX_LOG);
  return base;
}

/** Ghi "còn sống". Im lặng quá OFFLINE_GAP_MS → ghi một khoảng máy/Chrome không chạy. */
export function noteAlive(raw, now, { startup = false } = {}) {
  const s = safeStation(raw);
  const last = Date.parse(s.heartbeat.lastAliveAt || '');
  let gap = null;
  if (Number.isFinite(last) && now - last > OFFLINE_GAP_MS) {
    gap = { from: new Date(last).toISOString(), to: new Date(now).toISOString(), startup };
    s.offline = [gap, ...s.offline].slice(0, MAX_OFFLINE);
  }
  s.heartbeat = { lastAliveAt: new Date(now).toISOString(), lastStartupAt: startup ? new Date(now).toISOString() : s.heartbeat.lastStartupAt };
  return { station: s, gap };
}

/** Đặt danh sách chờ chạy bù (thay toàn bộ — tính lại mỗi lần đặt lịch). Chỉ
 *  ghi sổ "lỡ giờ" cho lượt mới phát hiện, không ghi lặp mỗi lần lưu cấu hình. */
export function notePending(raw, missed, now) {
  const s = safeStation(raw);
  const next = {};
  const fresh = [];
  for (const m of missed || []) {
    const old = s.pending[m.huntId];
    const same = old && old.slot === m.slot;
    next[m.huntId] = { slot: m.slot, time: m.time, name: m.name, detectedAt: same ? old.detectedAt : new Date(now).toISOString(), notifiedAt: same ? old.notifiedAt : null };
    if (!old || old.slot !== m.slot) fresh.push(m);
  }
  s.pending = next;
  s.log = [...fresh.map((m) => ({ at: new Date(now).toISOString(), kind: 'missed', huntId: m.huntId, name: m.name, slot: m.slot, note: `Lỡ giờ ${m.time}` })), ...s.log].slice(0, MAX_LOG);
  return { station: s, fresh };
}

/** Bộ săn được gọi từ báo thức chờ: có phải lượt chạy bù không, và còn cần chạy không. */
export function takePending(raw, hunt, now) {
  const s = safeStation(raw);
  const p = hunt?.id ? s.pending[hunt.id] : null;
  if (!p) return { station: s, catchup: null, skip: false };
  delete s.pending[hunt.id];
  // Lượt đúng giờ đã chạy trong lúc chờ (ví dụ máy thức dậy, Chrome tự bắn báo thức): không chạy trùng.
  if (huntReference(hunt) >= p.slot) {
    s.log = [{ at: new Date(now).toISOString(), kind: 'skipped', huntId: hunt.id, name: hunt.name || p.name, slot: p.slot, note: 'Đã chạy đúng giờ, không cần chạy bù' }, ...s.log].slice(0, MAX_LOG);
    return { station: s, catchup: null, skip: true };
  }
  s.log = [{ at: new Date(now).toISOString(), kind: 'catchup', huntId: hunt.id, name: hunt.name || p.name, slot: p.slot, note: `Chạy bù lượt ${p.time}` }, ...s.log].slice(0, MAX_LOG);
  return { station: s, catchup: p, skip: false };
}

/** Lượt chờ chạy bù chưa được nhắn Telegram (lọc theo bộ săn có bật Telegram); đánh dấu đã nhắn. */
export function takeUnnotified(raw, now, wants = () => true) {
  const s = safeStation(raw);
  const items = [];
  for (const [huntId, p] of Object.entries(s.pending)) {
    if (p.notifiedAt || !wants(huntId)) continue;
    p.notifiedAt = new Date(now).toISOString();
    items.push({ huntId, name: p.name, time: p.time, slot: p.slot });
  }
  items.sort((a, b) => a.slot - b.slot);
  return { station: s, items };
}

const two = (n) => String(n).padStart(2, '0');
/** "06:05 06/11" theo giờ trên máy. */
export function slotLabel(ms) {
  const d = new Date(ms);
  return `${two(d.getHours())}:${two(d.getMinutes())} ${two(d.getDate())}/${two(d.getMonth() + 1)}`;
}

export function durationLabel(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} giờ ${r} phút` : `${h} giờ`;
}

/** Tin Telegram khi Chrome mở lại sau khoảng tắt có lượt săn bị lỡ. null = không nhắn. */
export function catchupNotice(gap, fresh) {
  if (!fresh?.length) return null;
  const lines = fresh.slice(0, 8).map((m) => `• ${m.name || m.huntId} — giờ ${m.time}`);
  const off = gap ? `Máy/Chrome không chạy từ ${slotLabel(Date.parse(gap.from))} đến ${slotLabel(Date.parse(gap.to))} (${durationLabel(Date.parse(gap.to) - Date.parse(gap.from))}).\n` : '';
  return `⏰ <b>Trạm săn — có lượt bị lỡ giờ</b>\n${off}Đang chạy bù ${fresh.length} bộ săn:\n${lines.join('\n')}${fresh.length > 8 ? `\n… và ${fresh.length - 8} bộ khác` : ''}\n\nGói mới (nếu có) sẽ được báo như thường sau khi chạy bù xong.`;
}

/** Tóm tắt cho trang Bộ săn — chỉ số liệu, không suy diễn. */
export function stationSummary(raw, now, { days = 7 } = {}) {
  const s = safeStation(raw);
  const since = now - days * 864e5;
  const offline = s.offline.filter((w) => Date.parse(w.to) >= since);
  const offMs = offline.reduce((sum, w) => sum + Math.min(Date.parse(w.to), now) - Math.max(Date.parse(w.from), since), 0);
  const recent = s.log.filter((e) => Date.parse(e.at) >= since);
  return {
    lastAliveAt: s.heartbeat.lastAliveAt,
    lastStartupAt: s.heartbeat.lastStartupAt,
    offlineCount: offline.length,
    offlineMs: Math.max(0, offMs),
    lastOffline: s.offline[0] || null,
    missed: recent.filter((e) => e.kind === 'missed').length,
    caughtUp: recent.filter((e) => e.kind === 'catchup').length,
    skipped: recent.filter((e) => e.kind === 'skipped').length,
    pending: Object.entries(s.pending).map(([huntId, p]) => ({ huntId, ...p })),
    log: s.log.slice(0, 20)
  };
}

/** Các giờ cần đánh thức máy cho Windows Task Scheduler: sớm hơn giờ săn 3 phút. */
export function wakeTimes(hunts, leadMinutes = 3) {
  const set = new Set();
  for (const h of Array.isArray(hunts) ? hunts : []) {
    if (!h?.enabled) continue;
    for (const t of h.times || []) {
      const m = TIME.exec(String(t || ''));
      if (!m) continue;
      let mins = Number(m[1]) * 60 + Number(m[2]) - leadMinutes;
      if (mins < 0) mins += 1440;
      set.add(`${two(Math.floor(mins / 60))}:${two(mins % 60)}`);
    }
  }
  return [...set].sort();
}
