/**
 * Public-source acceptance probe, authored independently of the user's ZIP.
 * Uses only visible UI interactions and observes the source-generated response.
 * No extension, request interception, token collection/replay, or CAPTCHA solver.
 * Public HTML inspected 2026-11-10: render=index -> .egp-hero__advbtn -> form;
 * form uses Ant Select and .content__footer__btn; results use .el-pagination.
 * Linux WebKit/Chromium success is not proof of Safari on a physical iPad.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOURCE_URL = 'https://muasamcong.mof.gov.vn/vi/web/guest/contractor-selection?render=index';
export const PROBE_VERSION = '0.1.0';
const SOURCE_ORIGIN = 'https://muasamcong.mof.gov.vn';
const SEARCH_PATH = '/o/egp-portal-contractor-selection-v2/services/smart/search';

// Same-name IDs returned by the public get/area catalog and used by the
// source's own selectedNames -> locationProvCodeConvert algorithm.
// These are NOT a declaration that every historic predecessor is included.
export const PROVINCES = Object.freeze({
  lam_dong: Object.freeze({ name: 'Lâm Đồng', label: 'Tỉnh Lâm Đồng', currentCode: '68', sourceCodes: ['68', '703'] }),
  dong_nai: Object.freeze({ name: 'Đồng Nai', label: 'Thành phố Đồng Nai', currentCode: '75', sourceCodes: ['75'] }),
  ha_noi: Object.freeze({ name: 'Hà Nội', label: 'Thành phố Hà Nội', currentCode: '01', sourceCodes: ['01', '101'] })
});

const safeInt = (value, max = 1_000_000_000) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unique = values => [...new Set(values)];
const fail = code => ({ ok: false, code });
const empty = value => value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
const sameSet = (a, b) => a.length === b.length && a.every(item => b.includes(item));
const sourceInteger = (value, max = 1_000_000_000) => {
  // The source restores currentPage with localStorage.getItem, preserving "0".
  // Accept that canonical decimal representation without changing index base.
  const parsed = typeof value === 'string' && /^(?:0|[1-9]\d*)$/.test(value) ? Number(value) : value;
  return safeInt(parsed, max) ? parsed : null;
};
const valueType = value => value === undefined ? 'missing' : value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const numericMetadata = value => ({ type: valueType(value), numericValue: sourceInteger(value) });

export function describeRequestPagination(body) {
  const payload = Array.isArray(body) && isObject(body[0]) ? body[0] : undefined;
  return { payloadType: valueType(body), pageNumber: numericMetadata(payload?.pageNumber), pageSize: numericMetadata(payload?.pageSize) };
}

/** Diagnostic whitelist only. This does not broaden query acceptance. */
export function describeSourceFilters(body) {
  const query = Array.isArray(body) && isObject(body[0]) && Array.isArray(body[0].query) ? body[0].query[0] : undefined;
  const filters = isObject(query) && Array.isArray(query.filters) ? query.filters : [];
  const knownFields = new Set(['type', 'caseKHKQ', 'locations.provCode', 'locations.districtCode', 'locations.wardCode',
    'bidCloseDate', 'publicDate', 'publicDateKqlcnt', 'stepCode', 'statusForNotify']);
  const knownOperations = new Set(['in', 'not_in', 'range']);
  const knownValues = new Set(['es-notify-contractor', 'es-plan-project', 'es-contractor-selection-result',
    '0', '1', 'DHT', 'DHTBMT', 'DHKQLCNT', 'DXT', 'CNTTT', 'KCNTTT', 'VHH', 'KCN', 'DC']);
  const date = value => {
    const result = { type: valueType(value), empty: empty(value) };
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
        && Number.isFinite(Date.parse(value))) result.isoValue = value;
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= Date.UTC(2200, 0, 1)) result.epochValue = value;
    return result;
  };
  const selected = filters.filter(filter => isObject(filter) && knownFields.has(filter.fieldName));
  return {
    queryType: valueType(query), filtersType: valueType(isObject(query) ? query.filters : undefined),
    filterCount: filters.length, knownFilterCount: selected.length, omittedFilterCount: filters.length - selected.length,
    filters: selected.slice(0, 20).map(filter => {
      const values = Array.isArray(filter.fieldValues) ? filter.fieldValues : [];
      const retained = values.slice(0, 100).filter(value => {
        if (typeof value === 'string' && /^\d{2,3}$/.test(value)) return true;
        if (typeof value === 'number' && Number.isInteger(value) && value >= 10 && value <= 999) return true;
        if (filter.fieldName.startsWith('locations.')) return false;
        return (typeof value === 'string' && knownValues.has(value)) || value === 0 || value === 1;
      });
      return { fieldName: filter.fieldName, searchType: knownOperations.has(filter.searchType) ? filter.searchType : 'UNRECOGNIZED',
        fieldValuesType: valueType(filter.fieldValues), fieldValuesCount: Array.isArray(filter.fieldValues) ? values.length : null,
        fieldValues: retained, omittedValueCount: values.length - retained.length, from: date(filter.from), to: date(filter.to) };
    })
  };
}

/** Bounded metadata only; malformed strings and arbitrary keys are omitted. */
export function describeSourceResponseMetadata(data) {
  const page = isObject(data) && isObject(data.page) ? data.page : undefined;
  const content = page?.content;
  const identities = Array.isArray(content) ? content.slice(0, 3).map(row => {
    const item = {};
    if (!isObject(row)) return item;
    if (typeof row.notifyNo === 'string' && /^(?:IB|DC)\d{6,24}(?:-\d{1,5})?$/.test(row.notifyNo)) item.notifyNo = row.notifyNo;
    if ((typeof row.notifyVersion === 'string' && /^\d{1,5}$/.test(row.notifyVersion))
        || (typeof row.notifyVersion === 'number' && safeInt(row.notifyVersion, 99999))) item.notifyVersion = row.notifyVersion;
    if (['es-notify-contractor', 'es-plan-project', 'es-contractor-selection-result'].includes(row.type)) item.type = row.type;
    if (Array.isArray(row.locations)) item.provinceCodes = unique(row.locations.map(location => isObject(location) ? location.provCode : null)
      .filter(code => typeof code === 'string' && /^\d{2,3}$/.test(code))).slice(0, 10);
    return item;
  }) : [];
  return { rootType: valueType(data), pageType: valueType(page),
    currentPage: numericMetadata(page?.currentPage), pageSize: numericMetadata(page?.pageSize),
    totalElements: numericMetadata(page?.totalElements), totalPages: numericMetadata(page?.totalPages),
    contentType: valueType(content), contentLength: Array.isArray(content) ? content.length : null, publicIdentities: identities };
}

/** Read-only correlation: accept only the requested public UI scope and page. */
export function validateSourceQuery(body, provinceKey, { mode = 'open', expectedPage = 0, nowMs = Date.now() } = {}) {
  const province = PROVINCES[provinceKey];
  if (!province || !['open', 'all'].includes(mode) || !safeInt(expectedPage, 2)) return fail('INVALID_PROBE_SCOPE');
  if (!Array.isArray(body) || body.length !== 1 || !isObject(body[0])) return fail('SOURCE_QUERY_SCHEMA');
  const payload = body[0];
  const pageNumber = sourceInteger(payload.pageNumber, 2), pageSize = sourceInteger(payload.pageSize, 50);
  if (pageNumber === null || pageNumber !== expectedPage) return fail('SOURCE_PAGE_MISMATCH');
  if (pageSize === null || pageSize < 1) return fail('SOURCE_PAGE_SIZE_UNEXPECTED');
  if (!Array.isArray(payload.query) || payload.query.length !== 1) return fail('SOURCE_QUERY_SCHEMA');
  const query = payload.query[0];
  if (!isObject(query) || query.index !== 'es-contractor-selection' || !Array.isArray(query.filters)) return fail('SOURCE_QUERY_SCHEMA');
  if (!empty(query.keyWord) || !empty(query.keyWordNotMatch) || !empty(query.keyWordNotMatchSub)) return fail('SOURCE_KEYWORD_NOT_EMPTY');
  if (!Array.isArray(query.matchFields) || !query.matchFields.includes('notifyNo') || !query.matchFields.includes('bidName')) return fail('SOURCE_CATEGORY_MISMATCH');
  const filters = query.filters;
  if (!filters.every(isObject)) return fail('SOURCE_QUERY_SCHEMA');
  const named = name => filters.filter(filter => filter.fieldName === name);
  const types = named('type');
  if (types.length !== 1 || types[0].searchType !== 'in' || !Array.isArray(types[0].fieldValues)
      || !sameSet(types[0].fieldValues, ['es-notify-contractor'])) return fail('SOURCE_CATEGORY_MISMATCH');
  const provinces = named('locations.provCode');
  if (provinces.length !== 1 || provinces[0].searchType !== 'in' || !Array.isArray(provinces[0].fieldValues)) return fail('SOURCE_PROVINCE_MISMATCH');
  const provinceCodes = provinces[0].fieldValues;
  if (!provinceCodes.every(code => typeof code === 'string' && /^\d{2,3}$/.test(code))
      || unique(provinceCodes).length !== provinceCodes.length
      || !provinceCodes.includes(province.currentCode)
      || provinceCodes.some(code => !province.sourceCodes.includes(code))) return fail('SOURCE_PROVINCE_MISMATCH');
  if (filters.some(filter => /district|ward|commune/i.test(String(filter.fieldName)) && !empty(filter.fieldValues))) return fail('SOURCE_WARD_NOT_EMPTY');
  if (filters.some(filter => /investor|procuring|buyer|organization|orgCode/i.test(String(filter.fieldName))
      && (!empty(filter.fieldValues) || !empty(filter.from) || !empty(filter.to)))) return fail('SOURCE_INVESTOR_NOT_EMPTY');
  if (named('stepCode').length || named('statusForNotify').length) return fail('SOURCE_STATUS_UNEXPECTED');
  const caseFilter = named('caseKHKQ');
  if (caseFilter.length !== 1 || caseFilter[0].searchType !== 'not_in'
      || !Array.isArray(caseFilter[0].fieldValues) || !sameSet(caseFilter[0].fieldValues, ['1'])
      || !empty(caseFilter[0].from) || !empty(caseFilter[0].to)) return fail('SOURCE_CASE_FILTER_UNEXPECTED');
  const closeDate = named('bidCloseDate');
  if (mode === 'open') {
    if (closeDate.length !== 1 || closeDate[0].searchType !== 'range'
        || typeof closeDate[0].from !== 'string' || !Number.isFinite(Date.parse(closeDate[0].from))
        || !empty(closeDate[0].to)) return fail('SOURCE_STATUS_MISMATCH');
    // The public source explicitly adds seven hours before serializing to ISO.
    if (!Number.isFinite(nowMs) || Math.abs(Date.parse(closeDate[0].from) - (nowMs + 7 * 60 * 60 * 1000)) > 5 * 60 * 1000) {
      return fail('SOURCE_STALE_QUERY');
    }
  } else if (closeDate.length) return fail('SOURCE_STATUS_MISMATCH');
  // Other nonempty advanced criteria would narrow a province-only probe.
  const allowed = new Set(['type', 'caseKHKQ', 'locations.provCode', 'bidCloseDate']);
  if (filters.some(filter => !allowed.has(filter.fieldName)
      && (!empty(filter.fieldValues) || !empty(filter.from) || !empty(filter.to)))) return fail('SOURCE_EXTRA_FILTER');
  return { ok: true, code: 'QUERY_VERIFIED', provinceCodes: [...provinceCodes].sort(),
    pageSize, pageNumber, mode,
    scope: 'official_ui_selected_province', historicalPredecessorCoverage: 'not_established' };
}

function publicIdentity(row) {
  if (!isObject(row) || typeof row.notifyNo !== 'string' || !/^(?:IB|DC)\d{6,24}$/.test(row.notifyNo)) return null;
  const version = typeof row.notifyVersion === 'number' && safeInt(row.notifyVersion, 99999)
    ? String(row.notifyVersion) : row.notifyVersion;
  if (typeof version !== 'string' || !/^\d{1,5}$/.test(version)) return null;
  return `${row.notifyNo}-${version}`;
}

/** Strict source page schema, bounded public fields only; never serializes raw data. */
export function sanitizeSourcePage(data, { provinceKey, query, maxSamples = 5 } = {}) {
  if (!PROVINCES[provinceKey] || !query?.ok || !Array.isArray(query.provinceCodes)) return fail('QUERY_NOT_VERIFIED');
  if (!isObject(data) || !isObject(data.page) || !Array.isArray(data.page.content)) return fail('SOURCE_RESPONSE_SCHEMA');
  const page = data.page;
  if (!safeInt(page.totalElements) || !safeInt(page.totalPages) || !safeInt(page.currentPage)
      || !safeInt(page.pageSize, 50) || page.pageSize < 1) return fail('SOURCE_RESPONSE_SCHEMA');
  if (page.currentPage !== query.pageNumber || page.pageSize !== query.pageSize) return fail('SOURCE_PAGE_MISMATCH');
  if (page.totalPages !== Math.ceil(page.totalElements / page.pageSize)
      || (page.totalElements > 0 && page.currentPage >= page.totalPages)
      || (page.totalElements === 0 && page.currentPage !== 0)) return fail('SOURCE_PAGINATION_SCHEMA');
  const expected = Math.min(page.pageSize, Math.max(0, page.totalElements - page.currentPage * page.pageSize));
  if (page.content.length !== expected) return fail('SOURCE_INCOMPLETE_PAGE');
  const samples = [], identities = new Set();
  for (const row of page.content) {
    const noticeNo = publicIdentity(row);
    if (!noticeNo) return fail('SOURCE_MISSING_IDENTITY');
    if (identities.has(noticeNo)) return fail('SOURCE_DUPLICATE_RECORD');
    identities.add(noticeNo);
    if (row.type !== 'es-notify-contractor') return fail('SOURCE_CATEGORY_MISMATCH');
    if (!Array.isArray(row.locations) || !row.locations.length) return fail('SOURCE_MISSING_PROVINCE');
    const provinceCodes = unique(row.locations.map(location => isObject(location) ? location.provCode : null)
      .filter(code => typeof code === 'string' && /^\d{2,3}$/.test(code))).sort();
    if (!provinceCodes.length) return fail('SOURCE_MISSING_PROVINCE');
    if (!provinceCodes.some(code => query.provinceCodes.includes(code))) return fail('SOURCE_RECORD_OUT_OF_SCOPE');
    if (samples.length < Math.max(0, Math.min(5, Number.isInteger(maxSamples) ? maxSamples : 5))) {
      samples.push({ noticeNo, provinceCodes });
    }
  }
  return { ok: true, code: 'PAGE_VERIFIED', receipt: {
    pageNumber: page.currentPage, pageSize: page.pageSize,
    sourceTotal: page.totalElements, sourceTotalPages: page.totalPages,
    receivedCount: page.content.length, sourceProvinceCodes: [...query.provinceCodes], samples,
    scope: 'official_ui_selected_province', historicalPredecessorCoverage: 'not_established',
    rowStatusVerified: false, rowPriceVerified: false,
    verificationScope: 'source-query, page-metadata, public-identity-and-province-only'
  } };
}

/** Schema diagnostics contain known field names and types, never source values. */
export function describeSourceShape(data) {
  const type = value => value === undefined ? 'missing' : value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const fields = (value, names) => Object.fromEntries(names.map(name => [name, type(isObject(value) ? value[name] : undefined)]));
  const page = isObject(data) ? data.page : undefined;
  const row = isObject(page) && Array.isArray(page.content) ? page.content[0] : undefined;
  return {
    rootType: type(data),
    rootFields: fields(data, ['page', 'data', 'result', 'error', 'status']),
    pageFields: fields(page, ['content', 'totalElements', 'totalPages', 'currentPage', 'pageSize']),
    firstRowFields: fields(row, ['type', 'notifyNo', 'notifyVersion', 'locations', 'bidCloseDate']),
    firstLocationFields: fields(isObject(row) && Array.isArray(row.locations) ? row.locations[0] : undefined, ['provCode', 'provName'])
  };
}

/** Positive gate for this bounded acceptance receipt, never a production gate. */
export function validateProbeReport(report, { expectedBrowser, expectedProvinceKeys } = {}) {
  if (!isObject(report) || report.schemaVersion !== 1 || report.probeVersion !== PROBE_VERSION
      || report.purpose !== 'normal-cloud-browser-source-acceptance-only'
      || report.status !== 'SOURCE_ACCEPTANCE_SAMPLE_PASSED' || report.sourceGatePassed !== true
      || report.appReadyForProduction !== false || report.sourceOrigin !== SOURCE_ORIGIN
      || report.sourcePath !== '/vi/web/guest/contractor-selection'
      || !['chromium', 'webkit'].includes(report.browserEngine)
      || (expectedBrowser && report.browserEngine !== expectedBrowser)
      || !['open', 'all'].includes(report.requestedMode)
      || report.liveSourceResponseObserved !== true
      || !Array.isArray(report.provinces) || report.provinces.length < 1 || report.provinces.length > 3
      || report.requestedProvinceCount !== report.provinces.length
      || !safeInt(report.maxPagesPerProvince, 3) || report.maxPagesPerProvince < 1) return fail('PROBE_REPORT_NOT_VERIFIED');
  for (const flag of ['realSafariTested', 'realAppleDeviceTested', 'extensionUsed', 'userscriptUsed', 'officePcUsed', 'tokenCollectedOrReplayed', 'rawHeadersOrCookiesRecorded', 'rowStatusVerified']) {
    if (report[flag] !== false) return fail('PROBE_REPORT_NOT_VERIFIED');
  }
  const keys = report.provinces.map(province => province?.provinceKey);
  if (unique(keys).length !== keys.length || keys.some(key => !PROVINCES[key])
      || (expectedProvinceKeys && !sameSet(keys, expectedProvinceKeys))) return fail('PROBE_REPORT_SCOPE_MISMATCH');
  for (const province of report.provinces) {
    const definition = PROVINCES[province.provinceKey];
    if (province.ok !== true || province.mode !== report.requestedMode
        || province.uiProvinceSelected !== true || province.investorAndWardBlank !== true
        || province.scope !== 'official_ui_selected_province' || province.historicalPredecessorCoverage !== 'not_established'
        || province.rowStatusVerified !== false || province.rowPriceVerified !== false
        || !safeInt(province.sourceTotal) || !safeInt(province.receivedCount)
        || !Array.isArray(province.pages) || province.pages.length < 1 || province.pages.length > report.maxPagesPerProvince
        || !Array.isArray(province.sourceProvinceCodes) || !province.sourceProvinceCodes.includes(definition.currentCode)
        || province.sourceProvinceCodes.some(code => !definition.sourceCodes.includes(code))
        || unique(province.sourceProvinceCodes).length !== province.sourceProvinceCodes.length
        || !Array.isArray(province.samples) || province.samples.length !== Math.min(5, province.receivedCount)) return fail('PROBE_REPORT_NOT_VERIFIED');
    let received = 0;
    for (let index = 0; index < province.pages.length; index++) {
      const page = province.pages[index];
      if (!isObject(page) || page.pageNumber !== index || !safeInt(page.pageSize, 50) || page.pageSize < 1
          || page.sourceTotal !== province.sourceTotal || page.sourceTotalPages !== Math.ceil(province.sourceTotal / page.pageSize)
          || page.receivedCount !== Math.min(page.pageSize, Math.max(0, province.sourceTotal - index * page.pageSize))
          || !Array.isArray(page.sourceProvinceCodes) || !sameSet(page.sourceProvinceCodes, province.sourceProvinceCodes)
          || !Number.isInteger(page.httpStatus) || page.httpStatus < 200 || page.httpStatus > 299
          || !Number.isFinite(Date.parse(page.receivedAt)) || page.rowStatusVerified !== false || page.rowPriceVerified !== false) return fail('PROBE_REPORT_NOT_VERIFIED');
      received += page.receivedCount;
    }
    const complete = received === province.sourceTotal;
    const expectedStatus = province.sourceTotal === 0 ? 'LIVE_EMPTY_RESPONSE_VERIFIED'
      : complete ? 'LIVE_RESPONSE_VERIFIED' : 'LIVE_PARTIAL_RESPONSE_VERIFIED';
    if (received !== province.receivedCount || province.completeSourcePagination !== complete || province.status !== expectedStatus) return fail('PROBE_REPORT_NOT_VERIFIED');
    for (const sample of province.samples) {
      if (!isObject(sample) || typeof sample.noticeNo !== 'string' || !/^(?:IB|DC)\d{6,24}-\d{1,5}$/.test(sample.noticeNo)
          || !Array.isArray(sample.provinceCodes) || !sample.provinceCodes.length
          || sample.provinceCodes.some(code => typeof code !== 'string' || !/^\d{2,3}$/.test(code))
          || !sample.provinceCodes.some(code => province.sourceProvinceCodes.includes(code))) return fail('PROBE_REPORT_NOT_VERIFIED');
    }
  }
  if (report.nonEmptyPublicRecordsObserved !== report.provinces.some(province => province.receivedCount > 0)) return fail('PROBE_REPORT_NOT_VERIFIED');
  return { ok: true, code: 'SOURCE_SAMPLE_RECEIPT_VERIFIED', sourceGatePassed: true, appReadyForProduction: false,
    scope: 'bounded-source-query-and-response-only' };
}

class ProbeError extends Error {
  constructor(code, diagnostic) { super(code); this.name = 'ProbeError'; this.code = code; this.diagnostic = diagnostic; }
}
const raise = (code, diagnostic) => { throw new ProbeError(code, diagnostic); };

function isSearchRequest(request) {
  try {
    // Only origin/path/method are inspected. Never persist, print or inspect
    // query parameters: the official request URL may contain a source token.
    const url = new URL(request.url());
    return url.origin === SOURCE_ORIGIN && url.pathname === SEARCH_PATH
      && request.method() === 'POST';
  } catch { return false; }
}

/** Correlate by a new request event and validated payload, across navigation.
 * Playwright 1.65 initializes Request.timing().startTime to 0; the Response
 * constructor populates it later. That value cannot gate the request event.
 */
export function createSourceRequestGate(provinceKey, { mode = 'open', expectedPage = 0 } = {}) {
  const eligible = new WeakSet();
  let actionStartedAt = null;
  const diagnostic = {
    endpointPath: SEARCH_PATH, actionStarted: false, actionCompleted: false,
    requestEventsBeforeAction: 0, requestEventsAfterAction: 0,
    timingUnavailableEvents: 0, initializedTimingBeforeActionEvents: 0,
    payloadAcceptedEvents: 0, payloadRejectedEvents: 0, payloadRejectionCodes: [], requestPagination: [], requestFilters: [],
    responseEventsAfterAction: 0, matchedResponseEvents: 0,
    responseStatuses: [], requestFailedEvents: 0
  };
  return {
    beginAction() { actionStartedAt = Date.now(); diagnostic.actionStarted = true; },
    completeAction() { diagnostic.actionCompleted = true; },
    observeRequest(request) {
      if (!isSearchRequest(request)) return;
      if (actionStartedAt === null) { diagnostic.requestEventsBeforeAction++; return; }
      diagnostic.requestEventsAfterAction++;
      let startTime;
      try { startTime = request.timing().startTime; } catch { /* Timing is diagnostic only. */ }
      if (!Number.isFinite(startTime) || startTime <= 0) diagnostic.timingUnavailableEvents++;
      else if (startTime < actionStartedAt) {
        // A late event with an already-known pre-action initiation is stale.
        diagnostic.initializedTimingBeforeActionEvents++;
        return;
      }
      let query;
      try {
        const body = request.postDataJSON();
        if (diagnostic.requestPagination.length < 3) diagnostic.requestPagination.push(describeRequestPagination(body));
        if (diagnostic.requestFilters.length < 3) diagnostic.requestFilters.push(describeSourceFilters(body));
        query = validateSourceQuery(body, provinceKey, { mode, expectedPage });
      }
      catch { query = fail('SOURCE_QUERY_SCHEMA'); }
      if (query.ok) { eligible.add(request); diagnostic.payloadAcceptedEvents++; }
      else {
        diagnostic.payloadRejectedEvents++;
        if (diagnostic.payloadRejectionCodes.length < 5 && !diagnostic.payloadRejectionCodes.includes(query.code)) diagnostic.payloadRejectionCodes.push(query.code);
      }
    },
    acceptsResponse(response) { return eligible.has(response.request()); },
    observeResponse(response) {
      if (actionStartedAt === null || !isSearchRequest(response.request())) return;
      diagnostic.responseEventsAfterAction++;
      if (eligible.has(response.request())) diagnostic.matchedResponseEvents++;
      const status = response.status();
      if (Number.isInteger(status) && status >= 100 && status <= 599 && diagnostic.responseStatuses.length < 5) diagnostic.responseStatuses.push(status);
    },
    observeFailure(request) {
      if (actionStartedAt !== null && isSearchRequest(request)) diagnostic.requestFailedEvents++;
    },
    snapshot() { return { ...diagnostic, payloadRejectionCodes: [...diagnostic.payloadRejectionCodes], responseStatuses: [...diagnostic.responseStatuses],
      requestPagination: structuredClone(diagnostic.requestPagination), requestFilters: structuredClone(diagnostic.requestFilters) }; }
  };
}

/** Only bounded public labels for the requested province may be reported. */
export function sanitizeProvinceOptionLabels(labels, provinceKey) {
  const province = PROVINCES[provinceKey];
  if (!province || !Array.isArray(labels)) return [];
  return unique(labels.slice(0, 40).filter(value => typeof value === 'string').map(value => value.normalize('NFC').replace(/\s+/g, ' ').trim())
    .filter(value => value.length <= 100 && /^[\p{L}\p{M}\d\s.,()/-]+$/u.test(value)
      && value.toLocaleLowerCase('vi').includes(province.name.toLocaleLowerCase('vi')))).slice(0, 5);
}

async function visibleCount(locator) {
  try { return await locator.count(); } catch { return 0; }
}

/** Detection only. The probe never clicks inside a verification challenge. */
async function sourceStopReason(page) {
  if (page.isClosed()) return null;
  const url = new URL(page.url());
  if (url.protocol === 'about:') return null;
  if (/\/(?:login|signin|sign-in)(?:\/|$)/i.test(url.pathname)
      || url.pathname === '/c/portal/login'
      || await visibleCount(page.locator('input[type="password"]:visible'))) return 'SOURCE_VERIFICATION_REQUIRED';
  if (url.origin !== SOURCE_ORIGIN) return 'SOURCE_NAVIGATION_UNEXPECTED';
  if (await visibleCount(page.locator('#challenge-running:visible, #challenge-form:visible'))) return 'SOURCE_VERIFICATION_REQUIRED';
  const challenges = page.locator('iframe[src*="recaptcha"][src*="bframe"]:visible');
  for (let i = 0; i < await challenges.count(); i++) {
    const box = await challenges.nth(i).boundingBox();
    const viewport = page.viewportSize();
    if (box && viewport && box.width > 30 && box.height > 30
        && box.x < viewport.width && box.y < viewport.height && box.x + box.width > 0 && box.y + box.height > 0) {
      return 'SOURCE_VERIFICATION_REQUIRED';
    }
  }
  for (const frame of page.frames()) {
    let path;
    try { path = new URL(frame.url()).pathname; } catch { continue; }
    if (path.includes('/recaptcha/') && await visibleCount(frame.locator('#recaptcha-anchor:visible'))) return 'SOURCE_VERIFICATION_REQUIRED';
  }
  const text = await page.locator('body').innerText({ timeout: 700 }).catch(() => '');
  if (/verify (?:that )?you are (?:a )?human|complete the captcha|vui lòng xác minh (?:rằng )?bạn|xác nhận bạn không phải (?:là )?(?:người máy|robot)|unusual traffic|automated queries/i.test(text)) return 'SOURCE_VERIFICATION_REQUIRED';
  if (/access denied|you have been blocked|truy cập bị từ chối/i.test(text)) return 'SOURCE_ACCESS_DENIED';
  return null;
}

async function setSourceCheckbox(page, id, labelText, desired) {
  const input = page.locator(`#${id}`);
  if (await input.count() !== 1) raise('SOURCE_SELECTOR_CHANGED');
  if (await input.isChecked() !== desired) {
    if (await input.isVisible()) await input.setChecked(desired);
    else {
      // Hidden styled inputs are operated through their actual visible label.
      await page.locator(`label[for="${id}"]:visible`).filter({ hasText: labelText }).click();
    }
    // Vue can apply the label-triggered checked state on its next render.
    // Observe the DOM state after this single click; never toggle it twice.
    await page.waitForFunction(({ id, desired }) => document.getElementById(id)?.checked === desired,
      { id, desired }, { timeout: 3000 }).catch(() => raise('SOURCE_CONTROL_NOT_SET'));
  }
  if (await input.isChecked() !== desired) raise('SOURCE_CONTROL_NOT_SET');
}

// Official vue.antd.min.css fetched 2026-11-10 uses the legacy Ant Vue
// selection__placeholder/search__field/dropdown-menu-item/choice__content
// classes. Do not substitute modern Ant classes without source evidence.
async function chooseProvinceThroughUI(page, provinceKey, mode, markStep = () => {}) {
  const province = PROVINCES[provinceKey];
  const label = new RegExp(`^\\s*${province.label.replace(/\s+/g, '\\s+')}\\s*$`);
  markStep('open_advanced_form');
  await page.locator('.egp-hero__advbtn:visible').first().click();
  markStep('wait_advanced_form');
  await page.locator('.content__footer__btn:visible').filter({ hasText: /^Tìm kiếm$/ }).waitFor();
  // The footer is present in raw HTML. Wait for an actual Vue-rendered control
  // before changing a v-model checkbox, so initial mounting cannot reset it.
  markStep('wait_rendered_advanced_form');
  await page.locator('.ant-select-selection__placeholder').filter({ hasText: /^\s*Tỉnh\/\s*Thành phố\s*$/ }).waitFor();
  markStep('set_current_locations');
  await setSourceCheckbox(page, 'is_old_locations', /Địa bàn hành chính/, false);
  markStep('set_requested_notice_status');
  await setSourceCheckbox(page, 'is_not_publish_tbmt', /Chỉ tìm kiếm/, mode === 'open');
  markStep('check_blank_investor');
  const owner = page.getByPlaceholder(/Nhập tên\/mã định danh của CĐT/);
  if (await owner.count() !== 1 || await owner.inputValue() !== '') raise('SOURCE_INVESTOR_NOT_EMPTY');
  const procurer = page.getByPlaceholder(/Nhập tên\/mã định danh của BMT/);
  if (await procurer.count() && await procurer.inputValue() !== '') raise('SOURCE_INVESTOR_NOT_EMPTY');
  markStep('locate_province_control');
  const place = page.locator('.ant-select-selection__placeholder').filter({ hasText: /^\s*Tỉnh\/\s*Thành phố\s*$/ });
  const control = page.locator('.ant-select:visible').filter({ has: place });
  if (await control.count() !== 1) raise('SOURCE_SELECTOR_CHANGED');
  markStep('open_province_control');
  await control.click();
  const option = page.locator('.ant-select-dropdown:visible .ant-select-dropdown-menu-item')
    .filter({ hasText: label });
  markStep('wait_province_catalog');
  await option.waitFor();
  markStep('locate_province_search');
  const search = control.locator('input.ant-select-search__field');
  if (await search.count() !== 1) raise('SOURCE_SELECTOR_CHANGED');
  markStep('type_province_search');
  await search.fill(province.name);
  markStep('locate_province_option');
  await option.waitFor();
  if (await option.count() !== 1) raise('SOURCE_PROVINCE_AMBIGUOUS');
  markStep('select_province_option');
  await option.click();
  await page.keyboard.press('Escape');
  markStep('verify_province_selection');
  // Keep a stable selected control, because its empty placeholder has disappeared.
  const selection = page.locator('.ant-select:visible').filter({
    has: page.locator('.ant-select-selection__choice__content').filter({ hasText: label })
  });
  if (await selection.count() !== 1) raise('SOURCE_CONTROL_NOT_SET');
  markStep('verify_blank_ward');
  const ward = page.locator('.ant-select-selection__placeholder').filter({ hasText: /^\s*Xã\/\s*Phường\s*$/ });
  if (await ward.count() !== 1) raise('SOURCE_WARD_NOT_EMPTY');
  markStep('source_form_ready');
}

/** Bounded diagnostics: counts of known controls only, no DOM/values/HTML. */
async function safeUiDiagnostics(page, provinceKey, uiStep) {
  if (!page || page.isClosed()) return { uiStep, available: false };
  const province = PROVINCES[provinceKey];
  const known = {
    advancedEntryLinks: page.locator('.egp-hero__advbtn'),
    visibleAdvancedEntryLinks: page.locator('.egp-hero__advbtn:visible'),
    oldLocationsCheckbox: page.locator('#is_old_locations'),
    visibleOldLocationsCheckbox: page.locator('#is_old_locations:visible'),
    openNoticeCheckbox: page.locator('#is_not_publish_tbmt'),
    visibleOpenNoticeCheckbox: page.locator('#is_not_publish_tbmt:visible'),
    visibleAdvancedSearchButtons: page.locator('.content__footer__btn:visible').filter({ hasText: /^Tìm kiếm$/ }),
    visibleAntSelects: page.locator('.ant-select:visible'),
    legacyProvincePlaceholder: page.locator('.ant-select-selection__placeholder').filter({ hasText: /^\s*Tỉnh\/\s*Thành phố\s*$/ }),
    modernProvincePlaceholder: page.locator('.ant-select-selection-placeholder').filter({ hasText: /^\s*Tỉnh\/\s*Thành phố\s*$/ }),
    legacyWardPlaceholder: page.locator('.ant-select-selection__placeholder').filter({ hasText: /^\s*Xã\/\s*Phường\s*$/ }),
    modernWardPlaceholder: page.locator('.ant-select-selection-placeholder').filter({ hasText: /^\s*Xã\/\s*Phường\s*$/ }),
    legacyVisibleSearchInputs: page.locator('input.ant-select-search__field:visible'),
    visibleComboboxInputs: page.locator('input[role="combobox"]:visible'),
    visibleLegacyOptions: page.locator('.ant-select-dropdown:visible .ant-select-dropdown-menu-item'),
    visibleDisabledLegacyOptions: page.locator('.ant-select-dropdown:visible .ant-select-dropdown-menu-item-disabled'),
    visibleModernOptions: page.locator('.ant-select-dropdown:visible .ant-select-item-option'),
    provinceOptionKnownLabel: page.locator('.ant-select-dropdown:visible').getByText(province.label, { exact: true }),
    unrenderedProvinceTemplate: page.locator('a-select[placeholder="Tỉnh/ Thành phố"]'),
    ownerInputs: page.getByPlaceholder(/Nhập tên\/mã định danh của CĐT/),
    procurerInputs: page.getByPlaceholder(/Nhập tên\/mã định danh của BMT/)
  };
  let timer;
  try {
    const read = Promise.all([
      Promise.all(Object.entries(known).map(async ([name, locator]) => [name, Math.min(1000, await locator.count())])),
      page.locator('.ant-select-dropdown:visible .ant-select-dropdown-menu-item').filter({ hasText: province.name })
        .allTextContents().then(labels => sanitizeProvinceOptionLabels(labels, provinceKey))
    ]);
    const values = await Promise.race([read, new Promise(resolve => { timer = setTimeout(() => resolve(null), 1000); })]);
    return values ? { uiStep, available: true, counts: Object.fromEntries(values[0]), requestedProvinceOptionLabels: values[1] } : { uiStep, available: false };
  } catch { return { uiStep, available: false }; }
  finally { clearTimeout(timer); }
}

function codeForHttp(status) {
  if (status === 401) return 'SOURCE_VERIFICATION_REQUIRED';
  if (status === 403) return 'SOURCE_ACCESS_DENIED';
  if (status === 429) return 'SOURCE_RATE_LIMITED';
  return 'SOURCE_HTTP_ERROR';
}

async function captureUiSearch(page, action, provinceKey, mode, expectedPage, remaining) {
  const gate = createSourceRequestGate(provinceKey, { mode, expectedPage });
  const onRequest = request => gate.observeRequest(request);
  const onResponse = response => gate.observeResponse(response);
  const onFailure = request => gate.observeFailure(request);
  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfailed', onFailure);
  let response;
  try {
    const pending = page.waitForResponse(item => gate.acceptsResponse(item), { timeout: Math.min(30_000, remaining()) });
    // Attach a rejection handler immediately in case the click itself fails.
    pending.catch(() => {});
    gate.beginAction();
    await action();
    gate.completeAction();
    response = await pending;
  } catch (error) {
    const diagnostic = gate.snapshot();
    const code = error instanceof ProbeError ? error.code : error?.name === 'TimeoutError' ? 'SOURCE_UI_TIMEOUT' : 'PROBE_RUNTIME_ERROR';
    raise(diagnostic.payloadAcceptedEvents === 0 && diagnostic.payloadRejectedEvents > 0
      ? diagnostic.payloadRejectionCodes[0] : code, { search: diagnostic });
  } finally {
    page.off('request', onRequest); page.off('response', onResponse); page.off('requestfailed', onFailure);
  }
  const query = validateSourceQuery(response.request().postDataJSON(), provinceKey, { mode, expectedPage });
  if (!query.ok) raise(query.code, { search: gate.snapshot() });
  if (!response.ok()) raise(codeForHttp(response.status()), { httpStatus: response.status(), search: gate.snapshot() });
  const data = await response.json().catch(() => null);
  // Numeric responses trigger a source "try again" overlay. They are not a
  // list with zero records and do not prove a successful CAPTCHA validation.
  if (typeof data === 'number') raise('SOURCE_REJECTED', { search: gate.snapshot() });
  const safe = sanitizeSourcePage(data, { provinceKey, query });
  if (!safe.ok) raise(safe.code, { sourceShape: describeSourceShape(data), sourceMetadata: describeSourceResponseMetadata(data), search: gate.snapshot() });
  const stop = await sourceStopReason(page);
  if (stop) raise(stop);
  return { query, data, receipt: { ...safe.receipt, httpStatus: response.status(), receivedAt: new Date().toISOString(),
    requestCorrelation: gate.snapshot(), sourceMetadata: describeSourceResponseMetadata(data) } };
}

/** Reusable bounded browser job. Caller supplies a normal Playwright Browser. */
export async function probeProvince(browser, provinceKey, { mode = 'open', maxPages = 3, timeoutMs = 90_000, signal } = {}) {
  if (!PROVINCES[provinceKey] || !['open', 'all'].includes(mode)
      || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 3
      || !Number.isInteger(timeoutMs) || timeoutMs < 5_000 || timeoutMs > 90_000) throw new ProbeError('INVALID_PROBE_SCOPE');
  const started = Date.now(), deadline = started + timeoutMs;
  const remaining = () => Math.max(1, deadline - Date.now());
  const result = {
    provinceKey, province: PROVINCES[provinceKey].name, mode, status: 'NOT_COMPLETED', ok: false,
    scope: 'official_ui_selected_province', historicalPredecessorCoverage: 'not_established',
    rowStatusVerified: false, rowPriceVerified: false, realSafariTested: false,
    startedAt: new Date(started).toISOString(), stage: 'create_browser_context', pages: [], samples: [],
    sourceTotal: null, receivedCount: 0, completeSourcePagination: false
  };
  let context, page, timer, watcher, watchBusy = false, stopCode = null;
  const cancel = () => { stopCode = 'PROBE_CANCELLED'; if (context) void context.close().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    if (signal?.aborted) raise('PROBE_CANCELLED');
    context = await browser.newContext({ locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', viewport: { width: 1440, height: 960 } });
    if (signal?.aborted) raise('PROBE_CANCELLED');
    page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(30_000);
    timer = setTimeout(() => { stopCode = 'SOURCE_TIMEOUT'; void context.close().catch(() => {}); }, remaining());
    watcher = setInterval(async () => {
      if (watchBusy || stopCode || page.isClosed()) return;
      watchBusy = true;
      try {
        const code = await sourceStopReason(page);
        if (code) { stopCode = code; await context.close().catch(() => {}); }
      } catch { /* Navigation can temporarily destroy the old document. */ }
      finally { watchBusy = false; }
    }, 750);
    result.stage = 'open_source_index';
    const navigation = await page.goto(SOURCE_URL, { waitUntil: 'domcontentloaded', timeout: Math.min(30_000, remaining()) });
    if (navigation && !navigation.ok()) raise(codeForHttp(navigation.status()));
    result.stage = 'choose_province_in_source_ui';
    await chooseProvinceThroughUI(page, provinceKey, mode, step => { result.uiStep = step; });
    result.uiProvinceSelected = true;
    result.investorAndWardBlank = true;
    const seen = new Set();
    let firstQuery = null;
    for (let index = 0; index < maxPages; index++) {
      if (stopCode) raise(stopCode);
      result.stage = index === 0 ? 'source_ui_search' : 'source_ui_next_page';
      const action = index === 0
        ? () => page.locator('.content__footer__btn:visible').filter({ hasText: /^Tìm kiếm$/ }).click()
        : async () => {
            const next = page.locator('.el-pagination .btn-next:visible').first();
            await next.waitFor();
            if (await next.isDisabled()) raise('SOURCE_PAGINATION_STOPPED_EARLY');
            await next.click();
          };
      const read = await captureUiSearch(page, action, provinceKey, mode, index, remaining);
      if (firstQuery && (!sameSet(firstQuery.provinceCodes, read.query.provinceCodes) || firstQuery.pageSize !== read.query.pageSize)) raise('SOURCE_SCOPE_CHANGED');
      firstQuery ||= read.query;
      if (result.sourceTotal !== null && result.sourceTotal !== read.receipt.sourceTotal) raise('SOURCE_TOTAL_CHANGED');
      for (const row of read.data.page.content) {
        const id = publicIdentity(row);
        if (seen.has(id)) raise('SOURCE_DUPLICATE_PAGE');
        seen.add(id);
      }
      result.sourceTotal = read.receipt.sourceTotal;
      result.sourceProvinceCodes = read.query.provinceCodes;
      result.receivedCount += read.receipt.receivedCount;
      result.pages.push({ ...read.receipt, samples: undefined });
      for (const sample of read.receipt.samples) if (result.samples.length < 5) result.samples.push(sample);
      if (index === 0) result.firstResponseMs = Date.now() - started;
      if (result.receivedCount === result.sourceTotal && (index + 1 >= read.receipt.sourceTotalPages)) {
        result.completeSourcePagination = true;
        break;
      }
    }
    result.ok = true;
    result.status = result.sourceTotal === 0 ? 'LIVE_EMPTY_RESPONSE_VERIFIED'
      : result.completeSourcePagination ? 'LIVE_RESPONSE_VERIFIED' : 'LIVE_PARTIAL_RESPONSE_VERIFIED';
    result.stage = 'finished';
  } catch (error) {
    // Never copy Playwright error messages: they may include full request URLs.
    result.status = stopCode || (error instanceof ProbeError ? error.code
      : error?.name === 'TimeoutError' ? 'SOURCE_UI_TIMEOUT' : 'PROBE_RUNTIME_ERROR');
    if (error instanceof ProbeError && error.diagnostic) result.diagnostic = error.diagnostic;
    if (result.stage === 'choose_province_in_source_ui') {
      result.diagnostic = { ...result.diagnostic, ui: await safeUiDiagnostics(page, provinceKey, result.uiStep) };
    }
    result.partialDataRetained = result.receivedCount > 0;
  } finally {
    clearTimeout(timer); clearInterval(watcher);
    signal?.removeEventListener('abort', cancel);
    if (context) await context.close().catch(() => {});
    result.elapsedMs = Date.now() - started;
    result.finishedAt = new Date().toISOString();
  }
  return result;
}

export async function runSourceProbe({ browserName = 'chromium', provinceKeys = Object.keys(PROVINCES), mode = 'open', maxPages = 3, timeoutMs = 90_000, signal } = {}) {
  if (!['chromium', 'webkit'].includes(browserName) || !Array.isArray(provinceKeys)
      || provinceKeys.length < 1 || provinceKeys.length > 3
      || unique(provinceKeys).length !== provinceKeys.length || provinceKeys.some(key => !PROVINCES[key])
      || !['open', 'all'].includes(mode) || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 3
      || !Number.isInteger(timeoutMs) || timeoutMs < 5_000 || timeoutMs > 90_000) throw new ProbeError('INVALID_PROBE_SCOPE');
  const started = Date.now();
  const report = {
    schemaVersion: 1, probeVersion: PROBE_VERSION, purpose: 'normal-cloud-browser-source-acceptance-only', browserEngine: browserName,
    sourceOrigin: SOURCE_ORIGIN, sourcePath: '/vi/web/guest/contractor-selection',
    status: 'NOT_RUN', sourceGatePassed: false, appReadyForProduction: false, realSafariTested: false, realAppleDeviceTested: false,
    extensionUsed: false, userscriptUsed: false, officePcUsed: false, tokenCollectedOrReplayed: false,
    rawHeadersOrCookiesRecorded: false, requestedProvinceCount: provinceKeys.length,
    requestedMode: mode, maxPagesPerProvince: maxPages, provinceTimeoutMs: timeoutMs,
    historicalPredecessorCoverage: 'not_established', rowStatusVerified: false,
    startedAt: new Date(started).toISOString(), provinces: []
  };
  let browser;
  const cancel = () => { if (browser) void browser.close().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    if (signal?.aborted) raise('PROBE_CANCELLED');
    const playwright = await import('playwright');
    browser = await playwright[browserName].launch({ headless: true, timeout: 20_000 });
    if (signal?.aborted) raise('PROBE_CANCELLED');
    let hardStop = null;
    for (const provinceKey of provinceKeys) {
      if (signal?.aborted) hardStop = 'PROBE_CANCELLED';
      if (hardStop) {
        report.provinces.push({ provinceKey, province: PROVINCES[provinceKey].name, ok: false, status: 'NOT_RUN_AFTER_SOURCE_STOP', reason: hardStop });
        continue;
      }
      const result = await probeProvince(browser, provinceKey, { mode, maxPages, timeoutMs, signal });
      report.provinces.push(result);
      if (['SOURCE_VERIFICATION_REQUIRED', 'SOURCE_ACCESS_DENIED', 'SOURCE_RATE_LIMITED', 'SOURCE_NAVIGATION_UNEXPECTED', 'PROBE_CANCELLED'].includes(result.status)) hardStop = result.status;
    }
    report.liveSourceResponseObserved = report.provinces.some(province => province.pages?.length > 0);
    report.nonEmptyPublicRecordsObserved = report.provinces.some(province => province.receivedCount > 0);
    report.status = report.provinces.every(province => province.ok) ? 'SOURCE_ACCEPTANCE_SAMPLE_PASSED' : 'SOURCE_ACCEPTANCE_NOT_PASSED';
    report.sourceGatePassed = report.status === 'SOURCE_ACCEPTANCE_SAMPLE_PASSED';
    report.acceptanceScope = 'requested UI query and bounded source response schema/identity/province; not full feature or iPad acceptance';
    if (report.sourceGatePassed && !validateProbeReport(report, { expectedBrowser: browserName, expectedProvinceKeys: provinceKeys }).ok) {
      report.sourceGatePassed = false; report.status = 'PROBE_REPORT_NOT_VERIFIED';
    }
    if (signal?.aborted) { report.sourceGatePassed = false; report.status = 'PROBE_CANCELLED'; }
  } catch (error) {
    report.status = error instanceof ProbeError ? error.code : 'BROWSER_RUNTIME_UNAVAILABLE';
    report.liveSourceResponseObserved = false;
  } finally {
    signal?.removeEventListener('abort', cancel);
    if (browser) await browser.close().catch(() => {});
    report.elapsedMs = Date.now() - started;
    report.finishedAt = new Date().toISOString();
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2), values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--browser', '--output', '--provinces', '--mode', '--max-pages', '--timeout-ms'].includes(args[i]) || !args[i + 1]) raise('INVALID_ARGUMENT');
    values[args[i]] = args[i + 1];
  }
  const browserName = values['--browser'] || process.env.PROBE_BROWSER || 'chromium';
  const controller = new AbortController();
  let interruptedSignal = null;
  const term = () => { interruptedSignal = 'SIGTERM'; controller.abort(); };
  const interrupt = () => { interruptedSignal = 'SIGINT'; controller.abort(); };
  process.once('SIGTERM', term); process.once('SIGINT', interrupt);
  let report;
  try {
    report = await runSourceProbe({ browserName, signal: controller.signal,
      provinceKeys: (values['--provinces'] || process.env.PROBE_PROVINCES || 'lam_dong,dong_nai,ha_noi').split(',').map(key => key.trim()),
      mode: values['--mode'] || 'open', maxPages: Number(values['--max-pages'] || 3), timeoutMs: Number(values['--timeout-ms'] || 90_000) });
  } finally { process.off('SIGTERM', term); process.off('SIGINT', interrupt); }
  const output = resolve(values['--output'] || process.env.PROBE_OUTPUT || `artifacts/source-${browserName}.json`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  // Only the sanitized report is printed. No trace, HAR, screenshot, console or storage-state dump.
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (interruptedSignal) process.exitCode = interruptedSignal === 'SIGTERM' ? 143 : 130;
  else if (!validateProbeReport(report).ok) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { process.stderr.write('{"status":"PROBE_CONFIGURATION_ERROR","rawErrorSuppressed":true}\n'); process.exitCode = 2; });
}
