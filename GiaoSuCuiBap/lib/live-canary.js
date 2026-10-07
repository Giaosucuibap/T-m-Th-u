import { normalizeBbmtPackage, normalizeBidderTable } from './bbmt.js';
import { parseDate } from './core.js';

export const CANARY_ALARM = 'gscb-live-canary';
export const CANARY_DEFAULT = Object.freeze({ enabled: true, weekday: 1, hour: 2, timezone: 'Asia/Ho_Chi_Minh' });
const OFFSET = 7 * 3600000, DAY = 86400000;
export function canaryConfig(value = {}) {
  return { enabled: value.enabled !== false, weekday: Number.isInteger(value.weekday) && value.weekday >= 0 && value.weekday <= 6 ? value.weekday : 1,
    hour: Number.isInteger(value.hour) && value.hour >= 0 && value.hour <= 4 ? value.hour : 2, timezone: CANARY_DEFAULT.timezone };
}
export function offPeak(now) { const h = new Date(now + OFFSET).getUTCHours(); return h < 5; }
export function nextCanaryTime(now, config = CANARY_DEFAULT, catchUp = false) {
  const c = canaryConfig(config), local = new Date(now + OFFSET);
  let date = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), c.hour);
  if (!catchUp) date += ((c.weekday - local.getUTCDay() + 7) % 7) * DAY;
  if (date - OFFSET <= now) date += catchUp ? DAY : 7 * DAY;
  return date - OFFSET;
}
const first = value => Array.isArray(value) ? value[0] : value;
const present = value => Array.isArray(value) ? value.length > 0 && value.every(present) : value !== undefined && value !== null && typeof value !== 'boolean' && (typeof value !== 'string' || !/^(?:null|undefined)?$/i.test(value.trim()));
const provinceName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/^(tinh|thanh pho)\s+/, '').trim();

export function canaryQuery(item) {
  return { index: 'es-contractor-selection', keyWord: item.id, matchType: 'exact', matchFields: [item.type === 'PL' ? 'planNo' : 'notifyNo'], filters: [
    // A known code can move to another public workflow (e.g. online quotation).
    // Probe the exact identity, without assuming it stays in steps 1–4.
    { fieldName: 'type', searchType: 'in', fieldValues: [item.type === 'PL' ? 'es-plan-project-p' : 'es-notify-contractor'] }
  ] };
}

export function checkCanaryRecord(item, result) {
  if (result?.status === 'SCHEMA_ERROR') return { status: 'RED', reason: result.failureReason || 'Cấu trúc phản hồi đã thay đổi.' };
  if (result?.status !== 'OK' || !result?.complete) return { status: 'UNKNOWN', reason: result?.failureReason || 'Chưa nhận đủ phản hồi trực tiếp để kiểm tra.' };
  const identity = item.type === 'PL' ? 'planNo' : 'notifyNo';
  const matches = (result.records || []).filter(r => r?.[identity] === item.id);
  if (!matches.length) return { status: 'RED', reason: `e-GP không trả lại mã đối chứng ${item.id}. Cần kiểm tra mã và tiêu chí tìm kiếm.` };
  const record = matches.sort((a, b) => Number(b.notifyVersion ?? b.planVersion ?? 0) - Number(a.notifyVersion ?? a.planVersion ?? 0))[0];
  const required = item.type === 'PL' ? ['planNo', 'name', 'investField', 'decisionDate'] : ['notifyNo', 'bidName', 'investField', 'bidPrice'];
  const missing = required.filter(key => !present(record[key]));
  if (missing.length) return { status: 'RED', reason: `Mất trường đối chứng: ${missing.join(', ')}.`, missing };
  if (item.expectedField && ![].concat(record.investField).includes(item.expectedField)) return { status: 'RED', reason: `Mã investField khác mốc đã kiểm chứng (${item.expectedField}).` };
  if (![].concat(record.investField).every(field => ['XL', 'HH', 'TV', 'PTV', 'HON_HOP'].includes(field))) return { status: 'RED', reason: 'Mã lĩnh vực e-GP không hợp lệ.' };
  if (item.type === 'PL' && !parseDate(record.decisionDate)) return { status: 'RED', reason: 'Ngày phê duyệt kế hoạch không hợp lệ.' };
  if (item.type !== 'PL' && (!Number.isFinite(Number(first(record.bidPrice))) || Number(first(record.bidPrice)) < 0)) return { status: 'RED', reason: 'Giá gói thầu không còn là số hợp lệ.' };
  return { status: 'GREEN', reason: 'Đã đối chiếu mã và các trường bắt buộc.', record, fields: Object.keys(record).sort() };
}

export const CANARY_SOURCE_FILES = ['manifest.json', 'background.js', 'content.js', 'page-hook.js', 'lib/live-canary.js', 'lib/runtime-query.js', 'lib/runtime-ingest.js', 'lib/runtime-hunt.js', 'lib/runtime-export.js', 'lib/runtime-search-state.js', 'lib/warehouse-storage.js', 'lib/warehouse-maintenance.js', 'lib/contracts.js', 'lib/query-cache.js', 'lib/core.js', 'lib/hard-filter.js', 'lib/tender-categories.js', 'lib/area-match.js', 'lib/areas.js', 'lib/bbmt.js', 'lib/khlcnt.js', 'lib/result-view.js', 'lib/decision.js', 'lib/xlsx.js', 'lib/search-index.js', 'lib/backup.js', 'lib/workspace.js', 'lib/hunts.js', 'lib/match-gate.js', 'lib/kqlcnt.js', 'lib/investor-filter.js', 'lib/investor-query-plan.js', 'lib/investor.js', 'lib/localmarket.js', 'lib/rivals.js', 'lib/analytics.js', 'lib/provenance.js', 'data/live-canary-cases.json', 'lib/organization-directory.js', 'lib/organization-directory-data.js', 'lib/runtime-directory.js'];
export async function canarySourceDigest(readFile, cryptoApi = globalThis.crypto) {
  const hashes = [];
  for (const file of CANARY_SOURCE_FILES) {
    const bytes = await readFile(file);
    const hash = await cryptoApi.subtle.digest('SHA-256', bytes);
    hashes.push(`${file}:${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')}`);
  }
  const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(hashes.join('\n')));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function createLiveCanaryRuntime({ getState, save, runProbe, readOpening, fetchProvinces, stopScans, alarms,
  /* `version` KHÔNG có giá trị mặc định là cố ý. Bằng chứng canary chỉ có
     nghĩa khi gắn với đúng phiên bản đã chạy nó. Mặc định ghim cứng ở đây đã
     cũ đi sau mỗi lần nâng bản (bản 4.16.0 vẫn ghi '4.15.0'), và nếu một chỗ
     gọi quên truyền thì bằng chứng của bản cũ sẽ được coi là còn hiệu lực cho
     bản mới. Người gọi phải truyền chrome.runtime.getManifest().version. */
  loadCases, sourceDigest, now = Date.now, version }) {
  if (!version) throw new Error('createLiveCanaryRuntime cần phiên bản thật của tiện ích.');
  let running = null, digestPromise = null;
  const currentDigest = () => digestPromise || (digestPromise = Promise.resolve().then(sourceDigest).catch(error => { digestPromise = null; throw error; }));
  async function currentEvidence(evidence) {
    if (evidence?.status !== 'GREEN') return evidence;
    const at = Date.parse(evidence.checkedAt);
    let matches = false;
    try { matches = evidence.version === version && evidence.sourceDigest === await currentDigest(); } catch { }
    const registry = await loadCases().catch(() => ({ cases: [] }));
    const expected = registry.cases || [], receipts = evidence.cases || [];
    const receiptValid = evidence.live === true && evidence.lastStructuralStatus !== 'RED' && expected.length >= 20 && expected.length <= 30 && receipts.length === expected.length
      && new Set(receipts.map(c => c.id)).size === receipts.length
      && expected.every(item => receipts.some(c => c.id === item.id && c.type === item.type && c.status === 'GREEN' && !c.skipped))
      && evidence.provinceCheck?.status === 'GREEN' && evidence.provinceCheck?.code === '703' && provinceName(evidence.provinceCheck.name) === 'lam dong';
    matches = matches && receiptValid;
    if (!matches || !Number.isFinite(at) || at > now() + 60000 || now() - at > 8 * DAY) return { ...evidence, status: 'UNKNOWN', reason: 'Kết quả kiểm tra cũ không còn xác nhận mã nguồn hiện tại hoặc đã quá hạn; cần chạy canary lại.' };
    return evidence;
  }
  async function status() {
    const state = await getState();
    return { ok: true, config: canaryConfig(state.canaryConfig), liveCanary: await currentEvidence(state.liveCanary) || { status: 'UNKNOWN', reason: 'Chưa chạy kiểm tra trực tiếp.', cases: [] } };
  }
  async function schedule({ catchUp = false } = {}) {
    const state = await getState(), config = canaryConfig(state.canaryConfig);
    if (!config.enabled || state.settings?.readOnlyMode) { await alarms.clear(CANARY_ALARM); return; }
    const next = nextCanaryTime(now(), config, catchUp);
    await alarms.create(CANARY_ALARM, { when: next });
    await save({ liveCanary: { ...(state.liveCanary || { status: 'UNKNOWN', cases: [] }), nextRunAt: new Date(next).toISOString() } });
  }
  async function configure(value) {
    const state = await getState();
    if (running) return { ok: false, message: 'Một lượt canary đang chạy.' };
    if (state.settings?.readOnlyMode) return { ok: false, message: 'Đang khóa chỉnh sửa.' };
    const config = canaryConfig({ ...canaryConfig(state.canaryConfig), ...value });
    await save({ canaryConfig: config }); await schedule(); return status();
  }
  async function execute(trigger) {
    const initial = await getState();
    if (initial.settings?.readOnlyMode) return { ok: false, message: 'Đang khóa chỉnh sửa và tự động hóa.' };
    const registry = await loadCases();
    const cases = registry.cases || [];
    if (cases.length < 20 || cases.length > 30 || new Set(cases.map(c => c.id)).size !== cases.length || cases.some(c => !['IB', 'PL', 'BBMT'].includes(c.type) || !(c.type === 'PL' ? /^PL\d{10}$/ : /^IB\d{10}$/).test(c.id)) || !['IB', 'PL', 'BBMT'].every(type => cases.some(c => c.type === type))) throw Error('Danh mục đối chứng phải có 20–30 mã hợp lệ, không trùng, gồm IB / PL / BBMT.');
    let evidence = { status: 'RUNNING', lastStructuralStatus: initial.liveCanary?.lastStructuralStatus || (initial.liveCanary?.status === 'RED' ? 'RED' : null), version,
      live: true, trigger, startedAt: new Date(now()).toISOString(), checkedAt: null, sourceDigest: await currentDigest(), cases: [], reason: 'Đang kiểm tra trực tiếp trên e-GP.' };
    await save({ liveCanary: evidence });
    try {
      const provinces = await fetchProvinces();
      const entry = provinces.find(p => String(p.code) === '703');
      evidence.provinceCheck = { code: '703', name: entry?.name || '', status: entry && provinceName(entry.name) === 'lam dong' ? 'GREEN' : 'RED' };
      if (evidence.provinceCheck.status === 'RED') {
        evidence.reason = 'Danh mục e-GP không còn khớp mã 703 với Lâm Đồng.';
        evidence.status = 'RED'; evidence.lastStructuralStatus = 'RED'; await save({ liveCanary: evidence }); await stopScans();
      }
    } catch { evidence.provinceCheck = { code: '703', status: 'UNKNOWN', reason: 'Chưa lấy được danh mục tỉnh trực tiếp từ e-GP.' }; }
    let unavailableInRow = 0;
    for (const item of cases) {
      if ((await getState()).settings?.readOnlyMode) {
        for (const remaining of cases.slice(evidence.cases.length)) evidence.cases.push({ id: remaining.id, type: remaining.type, status: 'UNKNOWN', skipped: true, reason: 'Đã dừng vì bật khóa chỉnh sửa và tự động hóa.' });
        break;
      }
      const at = now(); let outcome;
      try {
        const result = await runProbe(canaryQuery(item), { mode: 'canary', schema: item.type === 'PL' ? 'khlcnt' : 'tbmt', timeoutMs: 60000, maxPages: 1 });
        outcome = checkCanaryRecord(item, result);
        if (outcome.status === 'GREEN' && item.type === 'BBMT') {
          const pkg = normalizeBbmtPackage(outcome.record);
          const opening = await readOpening(pkg, { timeoutMs: 60000 });
          if (!opening || opening.status !== 'OK' || opening.incomplete || opening.comparisonPending) outcome = { status: 'UNKNOWN', reason: opening?.incompleteReason || 'Chưa đọc đủ biên bản để đối chiếu.' };
          else {
            const sourceRows = opening.rows || [];
            const bidders = normalizeBidderTable(sourceRows, pkg.priceBasis);
            const missingName = !Array.isArray(sourceRows) || sourceRows.some(row => !row || !present(row.contractorName || row.name || row.ventureName));
            if (missingName || !bidders.length || bidders.some(b => !b.name || !Number.isFinite(b.bidPrice) || !Number.isFinite(b.finalPrice))) outcome = { status: 'RED', reason: 'Bảng biên bản thiếu tên nhà thầu hoặc giá dự thầu / giá sau giảm.' };
            else outcome = { ...outcome, bidderCount: bidders.length, bidders: bidders.map(b => ({ name: b.name, taxCode: b.taxCode, bidPrice: b.bidPrice, finalPrice: b.finalPrice })), priceBasis: pkg.priceBasis, priceBasisSource: pkg.priceBasisSource };
          }
        }
      } catch (error) { outcome = { status: 'UNKNOWN', reason: String(error?.message || error) }; }
      const { record, ...publicOutcome } = outcome;
      evidence.cases.push({ id: item.id, type: item.type, ...publicOutcome, elapsedMs: now() - at, checkedAt: new Date(now()).toISOString() });
      if (outcome.status === 'RED') { evidence.lastStructuralStatus = 'RED'; await stopScans(); }
      evidence.reason = `Đã kiểm tra ${evidence.cases.length}/${cases.length} mã đối chứng.`;
      // Remain RUNNING while preserving the red latch for regular scans.
      evidence.status = 'RUNNING'; await save({ liveCanary: evidence });
      unavailableInRow = outcome.status === 'UNKNOWN' ? unavailableInRow + 1 : 0;
      if (unavailableInRow >= 3) {
        for (const remaining of cases.slice(evidence.cases.length)) evidence.cases.push({ id: remaining.id, type: remaining.type, status: 'UNKNOWN', skipped: true, reason: 'Dừng sau ba ca không kiểm tra được liên tiếp để tránh tiếp tục dồn truy vấn lên e-GP.' });
        break;
      }
    }
    const statuses = [evidence.provinceCheck.status, ...evidence.cases.map(c => c.status)];
    evidence.status = statuses.includes('RED') ? 'RED' : statuses.includes('UNKNOWN') || evidence.cases.length !== cases.length ? 'UNKNOWN' : 'GREEN';
    if (evidence.status !== 'UNKNOWN') evidence.lastStructuralStatus = evidence.status;
    evidence.checkedAt = new Date(now()).toISOString();
    evidence.reason = evidence.status === 'GREEN' ? `${cases.length}/${cases.length} mã và tỉnh 703 đã khớp trực tiếp.` : evidence.status === 'RED' ? 'Có sai khác dữ liệu đối chứng; đã dừng truy vấn tự động để kiểm tra.' : 'Có ca chưa kiểm tra được; chưa xác nhận cấu trúc đạt.';
    await save({ liveCanary: evidence });
    await schedule({ catchUp: evidence.status === 'UNKNOWN' });
    return { ok: evidence.status === 'GREEN', liveCanary: evidence };
  }
  async function run({ trigger = 'manual', wait = false } = {}) {
    if (running) return { ok: false, message: 'Một lượt canary đang chạy.' };
    const state = await getState();
    if (running) return { ok: false, message: 'Một lượt canary đang chạy.' };
    if (state.settings?.readOnlyMode) return { ok: false, message: 'Đang khóa chỉnh sửa.' };
    const jobs = [state.activeRun, state.winnerLookup, state.planLookup, state.areaScan, state.investorScan, state.bidOpenScan];
    if (jobs.some(job => job && ['STARTING', 'OPENING', 'RUNNING', 'LISTING', 'SCANNING'].includes(job.status))) return { ok: false, message: 'Hãy chờ lượt tra cứu đang chạy hoàn tất trước khi kiểm tra canary.' };
    running = execute(trigger).catch(async error => {
      const previous = (await getState()).liveCanary;
      const evidence = { ...previous, status: 'UNKNOWN', lastStructuralStatus: previous?.lastStructuralStatus || (previous?.status === 'RED' ? 'RED' : null), checkedAt: new Date(now()).toISOString(), reason: String(error?.message || error) };
      await save({ liveCanary: evidence }); await schedule({ catchUp: true }); return { ok: false, liveCanary: evidence };
    }).finally(() => { running = null; });
    return wait ? running : { ok: true, started: true };
  }
  async function onAlarm(alarm) {
    if (alarm.name !== CANARY_ALARM) return false;
    const state = await getState();
    if (!canaryConfig(state.canaryConfig).enabled || state.settings?.readOnlyMode) { await alarms.clear(CANARY_ALARM); return true; }
    if (!offPeak(now())) await schedule({ catchUp: true });
    else if (!(await run({ trigger: 'weekly' })).ok) await schedule({ catchUp: true });
    return true;
  }
  async function hydrate() {
    const state = await getState();
    const fresh = await currentEvidence(state.liveCanary);
    if (fresh?.status !== state.liveCanary?.status) await save({ liveCanary: fresh });
    if (state.liveCanary?.status === 'RUNNING' && !running) await save({ liveCanary: { ...state.liveCanary, status: 'UNKNOWN', reason: 'Lượt kiểm tra bị gián đoạn khi Chrome hoặc service worker đóng; sẽ chạy lại trong giờ thấp điểm.' } });
    const due = Date.parse(state.liveCanary?.nextRunAt || '');
    if (Number.isFinite(due) && due <= now()) {
      if (offPeak(now()) && canaryConfig(state.canaryConfig).enabled && !state.settings?.readOnlyMode) { if (!(await run({ trigger: 'catch-up' })).ok) await schedule({ catchUp: true }); }
      else await schedule({ catchUp: true });
    } else if (Number.isFinite(due) && canaryConfig(state.canaryConfig).enabled && !state.settings?.readOnlyMode) await alarms.create(CANARY_ALARM, { when: due });
    else await schedule();
  }
  return { status, configure, run, onAlarm, hydrate, isRunning: () => Boolean(running) };
}


