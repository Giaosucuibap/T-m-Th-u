import { isSensitiveFieldName, stripSecretsDeep } from './redact.js';

/** Chỉ xuất những khóa cài đặt mà phiên bản hiện tại thực sự hỗ trợ. */
export function safeSettingsForBackup(settings = {}, defaults = {}) {
  const out = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    if (isSensitiveFieldName(key)) continue;
    const value = Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback;
    const clean = stripSecretsDeep(value);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}

/** Lịch sử lượt quét chỉ cần số liệu/trạng thái; tuyệt đối không xuất queue. */
export function safeRunForBackup(run = {}, { terminalize = false } = {}) {
  const out = {};
  const keys = [
    'id', 'mode', 'status', 'startedAt', 'finishedAt', 'captured', 'newCount',
    'updatedCount', 'matchedCount', 'message', 'partial', 'partialMessage',
    'missed', 'swapped'
  ];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(run, key)) out[key] = run[key];
  }
  if (terminalize) {
    const active = new Set(['STARTING', 'OPENING', 'RUNNING', 'LISTING', 'SCANNING']);
    const rawStatus = String(out.status || '').toUpperCase();
    if (active.has(rawStatus)) {
      const keptData = Math.max(0, Number(out.captured) || 0) > 0;
      out.status = keptData ? 'PARTIAL' : 'CANCELLED';
      out.partial = keptData;
      out.finishedAt = out.finishedAt || new Date().toISOString();
      out.message = keptData
        ? 'Lượt đang chạy đã được đóng an toàn khi sao lưu hoặc nâng cấp; dữ liệu đã nhận được giữ ở trạng thái chưa đầy đủ.'
        : 'Lượt đang chạy đã được đóng an toàn khi sao lưu hoặc nâng cấp.';
    }
  }
  return stripSecretsDeep(out) || {};
}

/** Bỏ các trường dẫn xuất/nặng; chúng sẽ được tính lại khi nhập backup. */
export function safeTenderForBackup(tender = {}) {
  const out = {};
  const keys = [
    'key','notifyNo','bidNo','version','bidName','projectName','fieldRaw','location',
    'price','publicDate','closeDate','investorName','procuringEntityName','contractType',
    'planNo','noticeId','detailUrl','firstSeenAt','lastSeenAt',
    'watchlisted','decisionState','decisionOwner','decisionNote','decisionUpdatedAt'
  ];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(tender, key)) out[key] = tender[key];
  }
  // Giữ năm mốc Radar gần nhất: đủ để hiểu thay đổi hiện hành mà vẫn bảo đảm
  // backup của kho tối đa 10.000 gói có thể nhập lại qua runtime messaging.
  const allowedChanges = new Set(['price', 'closeDate', 'bidName', 'location', 'investorName']);
  out.changeLog = (Array.isArray(tender.changeLog) ? tender.changeLog : []).slice(-5).flatMap((item) => {
    if (!item || !allowedChanges.has(String(item.field || ''))) return [];
    return [{
      field: String(item.field),
      label: String(item.label || item.field).slice(0, 80),
      before: String(item.before ?? '').slice(0, 300),
      after: String(item.after ?? '').slice(0, 300),
      at: String(item.at || '').slice(0, 40)
    }];
  });
  return stripSecretsDeep(out) || {};
}

export function safeParticipationForBackup(item = {}) {
  const out = {};
  const keys = [
    'key','taxCode','contractorName','notifyNo','bidName','province',
    'investorName','role','isWinner','bidValue','detailUrl'
  ];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(item, key)) out[key] = item[key];
  }
  return stripSecretsDeep(out) || {};
}

/** Làm sạch cả JSON nằm bên trong chuỗi body của bộ lọc e-GP. */
export function safeTemplateForBackup(template) {
  if (!template || typeof template !== 'object') return null;
  let body;
  try {
    const parsed = typeof template.body === 'string' ? JSON.parse(template.body) : template.body;
    body = JSON.stringify(stripSecretsDeep(parsed));
  } catch {
    return null;
  }
  const clean = stripSecretsDeep({ ...template, body: undefined }) || {};
  clean.body = body;
  return clean;
}

/**
 * Dựng phần dữ liệu khôi phục được bằng danh sách trắng. Không xuất tác vụ
 * đang chạy, cache tạm, Telegram log, request queue hoặc endpoint diagnostics.
 */
export function buildSafeBackupState(state = {}, cleanTemplates = {}, defaults = {}) {
  const payload = {
    settings: safeSettingsForBackup(state.settings || {}, defaults),
    tenders: (Array.isArray(state.tenders) ? state.tenders : [])
      .slice(0, 10000).map(safeTenderForBackup),
    runs: Array.isArray(state.runs) ? state.runs.slice(0, 100)
      .map((run) => safeRunForBackup(run, { terminalize: true })) : [],
    template: safeTemplateForBackup(cleanTemplates.template),
    templates: (Array.isArray(cleanTemplates.templates) ? cleanTemplates.templates : [])
      .slice(0, 30).map(safeTemplateForBackup).filter(Boolean),
    lastTemplate: safeTemplateForBackup(cleanTemplates.lastTemplate),
    participations: (Array.isArray(state.participations) ? state.participations : [])
      .slice(0, 30000).map(safeParticipationForBackup)
  };
  return payload;
}
