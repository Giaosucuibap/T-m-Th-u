/* ============================================================================
 *  LƯU TRÊN MÁY (AsyncStorage) — thuần JS, nhận bộ lưu từ ngoài để kiểm thử.
 *
 *  Chỉ lưu trên điện thoại của anh: không có máy chủ riêng, không gửi đi đâu.
 *    gscb.form       tiêu chí tìm lần cuối
 *    gscb.last       kết quả lượt tìm gần nhất (gọn: bỏ văn bản thô)
 *    gscb.history    10 lượt tìm gần nhất (chỉ tiêu chí + con số)
 *    gscb.watch      gói đang theo dõi + mã các lời nhắc đã hẹn
 * ========================================================================== */

export const KEYS = Object.freeze({ form: 'gscb.form', last: 'gscb.last', history: 'gscb.history', watch: 'gscb.watch' });
export const LIMITS = Object.freeze({ lastTenders: 1000, history: 10, watch: 200 });

const KEEP = ['key', 'notifyNo', 'bidNo', 'version', 'displayCode', 'codeLabel', 'bidName', 'projectName', 'investorName',
  'procuringEntityName', 'location', 'price', 'publicDate', 'closeDate', 'contractType', 'fieldCode', 'detailUrl',
  'score', 'recommendation', 'reasons', 'bidState', 'bidStateLabel', 'matched', 'filterState', 'filterReason',
  'filterReasonLabel', 'filterReasons', 'provinces', 'wards', 'bidForm', 'isInternet', 'planNo', 'previousCloseDate'];

/** Bản gọn của một gói thầu để lưu: bỏ văn bản thô (tới 4.000 ký tự/gói) và trường nội bộ. */
export function compactTender(t = {}) {
  const out = {};
  for (const k of KEEP) if (t[k] !== undefined) out[k] = t[k];
  if (Array.isArray(out.reasons)) out.reasons = out.reasons.slice(0, 8).map((r) => String(r).slice(0, 200));
  if (typeof out.bidName === 'string') out.bidName = out.bidName.slice(0, 500);
  return out;
}

async function readJson(storage, key, fallback) {
  try {
    const raw = await storage.getItem(key);
    if (raw == null) return fallback;
    const value = JSON.parse(raw);
    return value ?? fallback;
  } catch { return fallback; }
}

async function writeJson(storage, key, value) {
  await storage.setItem(key, JSON.stringify(value));
}

export function createStore(storage) {
  if (!storage || typeof storage.getItem !== 'function') throw new Error('Thiếu bộ lưu trên máy.');
  return {
    async getForm() { return readJson(storage, KEYS.form, null); },
    async saveForm(form) { await writeJson(storage, KEYS.form, form || {}); },

    async getLast() { return readJson(storage, KEYS.last, null); },
    /** Lưu kết quả lượt vừa xong + ghi một dòng lịch sử. Lượt bị chặn từ đầu (tiêu chí sai) không lưu. */
    async saveResult(result) {
      if (!result || !Array.isArray(result.tenders)) return null;
      const compact = { ...result, tenders: result.tenders.slice(0, LIMITS.lastTenders).map(compactTender), truncated: result.tenders.length > LIMITS.lastTenders };
      await writeJson(storage, KEYS.last, compact);
      const history = await readJson(storage, KEYS.history, []);
      const row = { id: result.id, at: result.finishedAt, status: result.status, label: result.label, criteria: result.criteria, counts: result.counts, coverageText: result.coverage?.text || '' };
      await writeJson(storage, KEYS.history, [row, ...(Array.isArray(history) ? history : []).filter((h) => h?.id !== row.id)].slice(0, LIMITS.history));
      return compact;
    },
    async getHistory() { const h = await readJson(storage, KEYS.history, []); return Array.isArray(h) ? h : []; },

    async getWatch() { const w = await readJson(storage, KEYS.watch, {}); return w && typeof w === 'object' && !Array.isArray(w) ? w : {}; },
    async isWatched(key) { return Boolean((await this.getWatch())[key]); },
    /** Thêm/cập nhật một gói theo dõi. Trả về bản ghi đã lưu. */
    async watch(tender, { reminderIds = [], now = Date.now() } = {}) {
      const all = await this.getWatch();
      const prev = all[tender.key];
      const entry = { ...compactTender(tender), watchedAt: prev?.watchedAt || new Date(now).toISOString(), reminderIds, note: prev?.note || '' };
      const next = { ...all, [tender.key]: entry };
      const keys = Object.keys(next);
      if (keys.length > LIMITS.watch) {
        // Quá giới hạn: bỏ gói đã đóng thầu theo dõi lâu nhất trước.
        const drop = keys.filter((k) => k !== tender.key).sort((a, b) => String(next[a].watchedAt).localeCompare(String(next[b].watchedAt)))[0];
        delete next[drop];
      }
      await writeJson(storage, KEYS.watch, next);
      return entry;
    },
    async unwatch(key) {
      const all = await this.getWatch();
      const entry = all[key] || null;
      if (entry) { delete all[key]; await writeJson(storage, KEYS.watch, all); }
      return entry;
    },
    async setNote(key, note) {
      const all = await this.getWatch();
      if (!all[key]) return null;
      all[key] = { ...all[key], note: String(note || '').slice(0, 1000) };
      await writeJson(storage, KEYS.watch, all);
      return all[key];
    },
    async clearAll() { for (const k of Object.values(KEYS)) await storage.removeItem(k); }
  };
}

/** Bộ lưu trong bộ nhớ — dùng cho kiểm thử và bản web xem trước giao diện. */
export function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    async getItem(k) { return map.has(k) ? map.get(k) : null; },
    async setItem(k, v) { map.set(k, String(v)); },
    async removeItem(k) { map.delete(k); },
    dump: () => Object.fromEntries(map)
  };
}
