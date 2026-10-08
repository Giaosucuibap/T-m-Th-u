import { safeDeltaState } from './delta-scan.js';
import { validateCriteria, splitProvinceNames } from './workspace.js';

export const HUNT_KINDS = Object.freeze([
  { value: 'tbmt', label: 'Thông báo mời thầu' },
  { value: 'plan', label: 'Kế hoạch lựa chọn nhà thầu' }
]);

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_HUNTS = 12;
const MAX_TIMES = 4;

export function normalizeTime(value) {
  const raw = String(value ?? '').trim();
  return TIME.test(raw) ? raw : '';
}

export function validateHunt(raw = {}) {
  const name = String(raw.name ?? '').trim().slice(0, 70);
  if (!name) return { ok: false, field: 'name', message: 'Đặt tên bộ săn (ví dụ: Thủy lợi Lâm Đồng).' };
  const kind = raw.kind === 'plan' ? 'plan' : 'tbmt';
  const criteriaResult = validateCriteria(raw.criteria || raw);
  if (!criteriaResult.ok) return criteriaResult;
  const times = [...new Set((Array.isArray(raw.times) ? raw.times : String(raw.times || '').split(/[,\n;]/))
    .map(normalizeTime).filter(Boolean))].slice(0, MAX_TIMES);
  if ((raw.times && String(raw.times).trim()) && !times.length) {
    return { ok: false, field: 'times', message: 'Giờ chạy phải dạng 06:05, cách nhau bằng dấu phẩy.' };
  }
  const id = String(raw.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || '';
  return {
    ok: true,
    hunt: {
      id,
      name,
      kind,
      enabled: raw.enabled !== false,
      telegram: Boolean(raw.telegram),
      telegramChatId: String(raw.telegramChatId || '').trim().slice(0, 80),
      times: times.length ? times : ['06:05'],
      criteria: criteriaResult.criteria,
      lastRunAt: String(raw.lastRunAt || '').slice(0, 40),
      lastStatus: String(raw.lastStatus || '').slice(0, 40),
      lastCompletedJobId: String(raw.lastCompletedJobId || '').slice(0, 100),
      lastMessage: String(raw.lastMessage || '').slice(0, 300),
      // Quét nhanh phần mới — chỉ cho TBMT, người dùng chủ động bật (lib/delta-scan.js).
      delta: kind === 'tbmt' && raw.delta === true,
      deltaState: safeDeltaState(raw.deltaState)
    }
  };
}

export function safeHunts(raw) {
  const ids = new Set();
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_HUNTS).flatMap((item) => {
    const result = validateHunt(item);
    if (!result.ok) return [];
    const hunt = result.hunt;
    if (!hunt.id || ids.has(hunt.id)) hunt.id = `hunt-${ids.size + 1}-${Math.abs(hash(hunt.name)).toString(36)}`;
    if (ids.has(hunt.id)) return [];
    ids.add(hunt.id);
    return [hunt];
  });
}

function hash(text) {
  let n = 0;
  for (const ch of String(text)) n = ((n << 5) - n + ch.charCodeAt(0)) | 0;
  return n || 1;
}

export function huntAlarmName(huntId, time) {
  return `gscb-hunt:${String(huntId).slice(0, 80)}:${normalizeTime(time) || '06:05'}`;
}

export function parseHuntAlarm(name) {
  const m = String(name || '').match(/^gscb-hunt:([^:]+):(\d{2}:\d{2})$/);
  return m ? { huntId: m[1], time: m[2] } : null;
}

export function huntLabel(hunt) {
  if (!hunt) return '';
  const c = hunt.criteria || {};
  const places = splitProvinceNames(c.province).join(', ');
  return [hunt.name, hunt.kind === 'plan' ? 'KHLCNT' : 'TBMT', places, c.category, c.keyword || c.mustKeywords]
    .filter(Boolean).join(' · ');
}

export const MAX_HUNTS_ALLOWED = MAX_HUNTS;

export function safeWatches(raw) {
  const ids = new Set();
  return (Array.isArray(raw) ? raw : []).slice(0, 40).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const name = String(item.name || '').trim().slice(0, 180);
    if (name.length < 3) return [];
    const id = String(item.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || `w-${ids.size + 1}`;
    if (ids.has(id)) return [];
    ids.add(id);
    return [{
      id,
      name,
      taxCode: String(item.taxCode || item.code || '').replace(/[^\d]/g, '').slice(0, 14),
      createdAt: String(item.createdAt || '').slice(0, 40),
      lastHitAt: String(item.lastHitAt || '').slice(0, 40)
    }];
  });
}
