/* Kho bản đọc E-HSMT (4.22.0): mỗi gói một bản, do người dùng dán câu trả lời của trợ lý AI. Luật ở lib/hsmt-ai.js. */
import { parseHsmtAnswer, safeHsmtReads, HSMT_MAX_READS } from './hsmt-ai.js';

const safeKey = (value) => { const key = String(value || '').slice(0, 220); return /^[a-zA-Z0-9:_-]{1,220}$/.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key) ? key : ''; };

export function createHsmtRuntime({ getState, save, withLock, KEYS, now = () => Date.now() }) {
  async function get(payload = {}) {
    const key = safeKey(payload.key);
    if (!key) return { ok: false, message: 'Thiếu mã gói.' };
    const s = await getState();
    return { ok: true, entry: safeHsmtReads(s.hsmtReads)[key] || null };
  }

  async function saveAnswer(payload = {}) {
    const key = safeKey(payload.key);
    if (!key) return { ok: false, message: 'Thiếu mã gói.' };
    return withLock(async () => {
      const s = await getState();
      const tender = (s.tenders || []).find((t) => t.key === key) || {};
      const parsed = parseHsmtAnswer(payload.answer, tender);
      if (!parsed.ok) return parsed;
      const entry = { savedAt: new Date(now()).toISOString(), source: String(payload.source || '').replace(/\s+/g, ' ').trim().slice(0, 60), read: parsed.read };
      const store = { ...safeHsmtReads(s.hsmtReads), [key]: entry };
      await save({ [KEYS.hsmtReads]: safeHsmtReads(store) });
      return { ok: true, entry, warnings: parsed.warnings, kept: Math.min(HSMT_MAX_READS, Object.keys(store).length) };
    });
  }

  async function remove(payload = {}) {
    const key = safeKey(payload.key);
    if (!key) return { ok: false, message: 'Thiếu mã gói.' };
    return withLock(async () => {
      const s = await getState();
      const { [key]: dropped, ...rest } = safeHsmtReads(s.hsmtReads);
      await save({ [KEYS.hsmtReads]: rest });
      return { ok: true, removed: Boolean(dropped) };
    });
  }

  return { get, saveAnswer, remove };
}
