import { bidStatus, foldText, cleanText, parseDate } from './core.js';

export const LIFE_STAGES = Object.freeze([
  { key: 'plan', label: 'Kế hoạch' },
  { key: 'notice', label: 'Mời thầu' },
  { key: 'opening', label: 'Mở thầu' },
  { key: 'result', label: 'Kết quả' }
]);

export const DEADLINE_WINDOWS = Object.freeze([
  { key: 'h72', hours: 72, label: 'Còn khoảng 3 ngày' },
  { key: 'h24', hours: 24, label: 'Còn khoảng 24 giờ' },
  { key: 'h3', hours: 3, label: 'Còn khoảng 3 giờ' }
]);

export function touchLifecycle(tender = {}, event = 'notice', at = new Date().toISOString()) {
  const life = tender.lifecycle && typeof tender.lifecycle === 'object' ? { ...tender.lifecycle } : {};
  if (event === 'plan') life.planSeenAt = life.planSeenAt || at;
  if (event === 'notice') life.noticeSeenAt = life.noticeSeenAt || at;
  if (event === 'opening') life.openingSeenAt = life.openingSeenAt || at;
  if (event === 'result') life.resultSeenAt = life.resultSeenAt || at;
  if (event === 'revision') life.revisions = Number(life.revisions || 0) + 1;
  life.updatedAt = at;
  return life;
}

export function inferLifecycleEvent(tender = {}) {
  if (tender.resultAt || tender.winnerName || tender.selectionResult) return 'result';
  if (tender.openingAt || tender.bidOpenId) return 'opening';
  if (tender.notifyNo) return 'notice';
  if (tender.planNo || tender.bidNo) return 'plan';
  return 'notice';
}

export function lifecycleLabel(tender, now = Date.now()) {
  const life = tender?.lifecycle || {};
  if (life.resultSeenAt) return 'Đã có kết quả';
  if (life.openingSeenAt) return 'Đã mở thầu';
  if (life.noticeSeenAt || tender?.notifyNo) return bidStatus(tender, now) === 'CLOSED' ? 'Đã đóng thầu · chưa xác nhận mở thầu' : 'Đã đăng mời thầu';
  if (life.planSeenAt || tender?.planNo) return 'Mới ở kế hoạch';
  return 'Chưa rõ giai đoạn';
}

export function dueDeadlineWindow(tender, now = Date.now()) {
  if (bidStatus(tender, now) !== 'OPEN') return null;
  const close = parseDate(tender.closeDate);
  if (!close) return null;
  const hours = (Date.parse(close) - now) / 3600000;
  if (hours <= 0) return null;
  if (hours <= 3) return DEADLINE_WINDOWS[2];
  if (hours <= 24) return DEADLINE_WINDOWS[1];
  if (hours <= 72) return DEADLINE_WINDOWS[0];
  return null;
}

export function shouldRemindDeadline(tender, sent = {}, now = Date.now()) {
  const window = dueDeadlineWindow(tender, now);
  if (!window) return null;
  const stamp = deadlineReminderState(tender, sent[tender.key]);
  if (stamp && stamp[window.key]) return null;
  return window;
}

/** A changed closing date starts a new reminder cycle, including old stores
 * that never recorded the date. Callers persist this row when marking a send. */
export function deadlineReminderState(tender, stamp = {}) {
  const closeDate = parseDate(tender?.closeDate) || '';
  return stamp?.closeDate === closeDate ? { ...stamp, closeDate } : { closeDate };
}

/** Locate only an older revision of the same public notice. Never join
 * unrelated packages by title or roll a newer stored revision backwards. */
export function findPriorTenderVersion(tenders = [], incoming = {}) {
  const number = cleanText(incoming.notifyNo).toUpperCase();
  const version = Number(incoming.version);
  if (!/^IB\d{6,}$/.test(number) || !Number.isInteger(version) || version < 0) return null;
  return (Array.isArray(tenders) ? tenders : []).filter(t =>
    cleanText(t?.notifyNo).toUpperCase() === number && /^\d+$/.test(String(t.version)) && Number(t.version) < version)
    .sort((a, b) => Number(b.version) - Number(a.version))[0] || null;
}

/** Compare actual retained entries, not array lengths: the radar log is capped
 * at 20 rows, so length-based slicing loses all subsequent amendments. */
export function newTenderChanges(before = {}, after = {}) {
  const signature = item => JSON.stringify([item?.field, item?.before, item?.after, item?.at]);
  const old = new Set((Array.isArray(before.changeLog) ? before.changeLog : []).map(signature));
  return (Array.isArray(after.changeLog) ? after.changeLog : []).filter(item => !old.has(signature(item)));
}

export function foldName(value) {
  return foldText(cleanText(value));
}

export function investorWatchHit(tender, watches = []) {
  const hay = foldName([tender.investorName, tender.procuringEntityName].filter(Boolean).join(' '));
  if (!hay) return null;
  return (watches || []).find((w) => {
    const name = foldName(w.name);
    const code = foldName(w.taxCode || w.code);
    return (name && hay.includes(name)) || (code && hay.includes(code));
  }) || null;
}

export function expectedTbmtFields(record) {
  if (!record || typeof record !== 'object') return [];
  const keys = Object.keys(record);
  return ['notifyNo', 'notify_no', 'bidName', 'notifyName', 'investField', 'bidPrice', 'investorName']
    .filter((key) => keys.includes(key));
}

export function schemaHealthOf(records = []) {
  const rows = (Array.isArray(records) ? records : []).filter((row) => row && typeof row === 'object');
  if (!rows.length) return { ok: true, empty: true, ratio: 1, missing: [], sample: 0 };
  const scored = rows.slice(0, 40).map((row) => expectedTbmtFields(row).length);
  const good = scored.filter((n) => n >= 2).length;
  const ratio = good / scored.length;
  return {
    ok: ratio >= 0.5,
    empty: false,
    ratio,
    sample: scored.length,
    missing: ratio >= 0.5 ? [] : ['notifyNo/bidName/investField']
  };
}
