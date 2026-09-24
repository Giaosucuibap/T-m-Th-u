import { isSensitiveFieldName, stripSecretsDeep } from './redact.js';
import { safeSavedSearches } from './workspace.js';
import { normalizeCategory } from './tender-categories.js';
import { safeHunts, safeWatches } from './hunts.js';
import { safeContracts } from './contracts.js';
import { checklistItemsFor } from './capability.js';

const bounded = (value, max = 220) => String(value ?? '').slice(0, max);
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '';
const records = value => (Array.isArray(value) ? value : []).filter(row => row && typeof row === 'object' && !Array.isArray(row));
const safeKey = value => /^[a-zA-Z0-9:_-]{1,220}$/.test(String(value || '')) && !['__proto__', 'constructor', 'prototype'].includes(value);
const DESTINATIONS = new Set(['notifyWebhook', 'notifyEmail', 'telegramChatId']);
const safeWardIdentities=value=>records(value).slice(0,100).flatMap(row=>typeof row.code==='string'&&typeof row.parentCode==='string'&&row.code&&row.parentCode
  ?[{code:bounded(row.code,120),parentCode:bounded(row.parentCode,120),name:bounded(row.name,200)}]:[]);
const safeLocations=value=>records(value).slice(0,100).map(row=>Object.fromEntries(['provCode','provName','provinceCode','provinceName','districtCode','districtName','wardCode','wardName','parentCode']
  .filter(key=>typeof row[key]==='string').map(key=>[key,bounded(row[key],200)])));

/** Durable public/user-entered metadata, shared by export and restore. */
export function sanitizeBackupTenderMetadata(tender = {}) {
  const out = {};
  for (const key of ['provinceCode','wardCode','wardParentCode','parentCode','investField','fieldCode','watchedInvestorId','investorCode','procuringEntityCode',
    'decisionProposedBy','decisionTechBy','decisionConfirmedBy','decisionDirectorBy']) {
    if (typeof tender[key] === 'string') out[key] = bounded(tender[key], 120);
  }
  for (const key of ['guaranteeExpire','decisionProposedAt','decisionTechAt','decisionConfirmedAt','decisionDirectorAt']) {
    if (iso(tender[key])) out[key] = iso(tender[key]);
  }
  for (const key of ['provinceCodes','provinces','wards']) if(Array.isArray(tender[key])) out[key]=[...new Set(tender[key].slice(0,100).map(v=>bounded(v,160)).filter(Boolean))];
  if(Array.isArray(tender.wardIdentities))out.wardIdentities=safeWardIdentities(tender.wardIdentities);
  if(Array.isArray(tender.locations))out.locations=safeLocations(tender.locations);
  const life = tender.lifecycle;
  if (life && typeof life === 'object' && !Array.isArray(life)) {
    out.lifecycle = {};
    for (const key of ['planSeenAt','noticeSeenAt','openingSeenAt','resultSeenAt','updatedAt']) {
      if (iso(life[key])) out.lifecycle[key] = iso(life[key]);
    }
    if (Number.isFinite(Number(life.revisions))) out.lifecycle.revisions = Math.max(0, Math.min(10000, Math.trunc(Number(life.revisions))));
  }
  if (tender.filterCriteria && typeof tender.filterCriteria === 'object') out.filterCriteria = safeRunForBackup({criteria:tender.filterCriteria}).criteria;
  return stripSecretsDeep(out) || {};
}

/** Preserve the new workspace data without restoring recipients or schedules
 * that can run by themselves. Diagnostics and raw DOM snapshots stay excluded. */
export function sanitizeBackupFeatures(state = {}, { disableHunts = true } = {}) {
  const hunts = safeHunts(records(state.hunts)).map(({telegramChatId, ...hunt}) => ({
    ...hunt, enabled: disableHunts ? false : hunt.enabled, telegram: false,
    lastStatus: ['RUNNING','STARTING'].includes(hunt.lastStatus) ? 'CANCELLED' : hunt.lastStatus
  }));
  const allowedItems = new Set(['', 'XL', 'TV_SUPERVISION'].flatMap(category => checklistItemsFor(category).map(item => item.id)));
  const checklists = Object.fromEntries(Object.entries(state.checklists || {}).slice(0, 10000).flatMap(([key, row]) => {
    if (!safeKey(key) || !row || typeof row !== 'object' || Array.isArray(row)) return [];
    const values = row.items && typeof row.items === 'object' && !Array.isArray(row.items) ? row.items : {};
    const items = Object.fromEntries([...allowedItems].filter(id => Object.hasOwn(values, id)).map(id => [id, values[id] === true]));
    return [[key, { items, owner: bounded(row.owner, 120), updatedAt: iso(row.updatedAt),
      category: normalizeCategory(row.category), importedBy: bounded(row.importedBy, 120), importedAt: iso(row.importedAt) }]];
  }));
  const pastContracts = safeContracts(records(state.pastContracts)).map(row => ({ ...row,
    gates: Object.fromEntries(['similar','staff','equip','finance'].map(key => [key,
      ['dat','thieu','chua','khong'].includes(row.gates?.[key]) ? row.gates[key] : 'chua'])) }));
  const allowedChanges = new Set(['price','closeDate','bidName','location','investorName','version']);
  const amendmentLog = records(state.amendmentLog).slice(0, 500).filter(row => allowedChanges.has(row.field)).map(row => ({
    at: iso(row.at), key: bounded(row.key), notifyNo: bounded(row.notifyNo, 20), bidName: bounded(row.bidName, 500),
    field: row.field, before: bounded(row.before, 500), after: bounded(row.after, 500)
  }));
  const auditLog = records(state.auditLog).slice(0, 800).map(row => ({ at: iso(row.at),
    operator: bounded(row.operator, 120), kind: bounded(row.kind, 40), key: bounded(row.key), detail: bounded(row.detail, 500) }));
  return stripSecretsDeep({hunts, watchedInvestors: safeWatches(records(state.watchedInvestors)),
    checklists, pastContracts, amendmentLog, auditLog}) || {};
}

/** Chỉ xuất những khóa cài đặt mà phiên bản hiện tại thực sự hỗ trợ. */
export function safeSettingsForBackup(settings = {}, defaults = {}) {
  const out = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    if (isSensitiveFieldName(key) || DESTINATIONS.has(key)) continue;
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
    'missed', 'swapped', 'matchCount', 'insufficientCount', 'outOfRangeCount', 'sourceCount', 'invalidCount', 'duplicateCount', 'schemaIssue'
  ];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(run, key)) out[key] = run[key];
  }
  if (Array.isArray(run.foundKeys)) out.foundKeys = [...new Set(run.foundKeys.filter(k => typeof k === 'string').map(k => k.slice(0, 220)))].slice(0, 10000);
  if (run.criteria && typeof run.criteria === 'object') {
    out.criteria = Object.fromEntries(['investor', 'province', 'ward', 'keyword', 'mustKeywords', 'excludeKeywords', 'minPrice', 'maxPrice', 'fromDate', 'toDate', 'fromYear', 'toYear'].map(k => [k, String(run.criteria[k] ?? '').slice(0, 500)]));
    out.criteria.category = normalizeCategory(run.criteria.category);
    for (const key of ['provinces','requiredKeywords','dateFields']) if (Array.isArray(run.criteria[key])) out.criteria[key] = run.criteria[key].slice(0,100).map(v=>bounded(v,120));
    if (Object.hasOwn(run.criteria,'requireConstruction')) out.criteria.requireConstruction = run.criteria.requireConstruction === true;
    for(const key of ['wardCode','wardParentCode'])if(typeof run.criteria[key]==='string')out.criteria[key]=bounded(run.criteria[key],120);
    if(Array.isArray(run.criteria.wardIdentities))out.criteria.wardIdentities=safeWardIdentities(run.criteria.wardIdentities);
  }
  if (run.coverage && typeof run.coverage === 'object') {
    out.coverage = {};
    for (const key of ['serverTotal','fetched','match','insufficient','outOfRange','pagesRead','totalPages']) {
      const value = run.coverage[key];
      out.coverage[key] = typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    }
    out.coverage.complete = run.coverage.complete === true;
    out.coverage.done = run.coverage.done === true;
    out.coverage.text = bounded(run.coverage.text, 1200);
  }
  if(run.queryCache?.hit===true)out.queryCache={hit:true,hash:bounded(run.queryCache.hash,64),fetchedAt:iso(run.queryCache.fetchedAt),expiresAt:iso(run.queryCache.expiresAt),ageMs:Math.max(0,Number(run.queryCache.ageMs)||0)};
  if (run.resultStates && typeof run.resultStates === 'object') {
    const found = new Set(out.foundKeys || []);
    out.resultStates = Object.fromEntries(Object.entries(run.resultStates).filter(([key])=>found.has(key)).slice(0,10000).map(([key,row])=>{
      const value = row && typeof row === 'object' ? row : {};
      const state = ['MATCH','INSUFFICIENT','OUT_OF_RANGE'].includes(value.filterState) ? value.filterState : 'INSUFFICIENT';
      const clean = {filterState:state,filterReason:bounded(value.filterReason,220),
        score:Math.max(0,Math.min(100,Number(value.score)||0)),matched:state==='MATCH'&&value.matched===true,checkedAt:iso(value.checkedAt)};
      for (const field of ['bidName','publicDate','closeDate','investorName','location','fieldRaw','detailUrl'])
        if(Object.hasOwn(value,field)) clean[field]=value[field]===null?null:bounded(value[field],field==='detailUrl'?2400:600);
      if(Object.hasOwn(value,'price'))clean.price=typeof value.price==='number'&&Number.isFinite(value.price)&&value.price>=0?value.price:null;
      for(const field of ['investField','fieldCode','provinceCode','wardCode','wardParentCode','parentCode'])if(typeof value[field]==='string')clean[field]=bounded(value[field],120);
      if(Array.isArray(value.provinceCodes))clean.provinceCodes=value.provinceCodes.slice(0,100).map(v=>bounded(v,120));
      if(Array.isArray(value.wardIdentities))clean.wardIdentities=safeWardIdentities(value.wardIdentities);
      if(Array.isArray(value.locations))clean.locations=safeLocations(value.locations);
      return [key,clean];
    }));
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
  const out = sanitizeBackupTenderMetadata(tender);
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
  const allowedChanges = new Set(['price', 'closeDate', 'bidName', 'location', 'investorName', 'version']);
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
    ...sanitizeBackupFeatures(state),
    savedSearches: safeSavedSearches(state.savedSearches),
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
