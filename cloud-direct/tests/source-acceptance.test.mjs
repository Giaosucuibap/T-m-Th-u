// Controlled fixtures for pure acceptance logic. These are NOT live e-GP rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVINCES, PROBE_VERSION, validateSourceQuery, sanitizeSourcePage, validateProbeReport, describeSourceShape, createSourceRequestGate, sanitizeProvinceOptionLabels, describeRequestPagination, describeSourceResponseMetadata, describeSourceFilters } from '../source-probe.mjs';

const clone = value => structuredClone(value);

test('filter diagnostics retain only allowed province codes, enums and dates without relaxing the source gate', () => {
  const body = requestFor();
  const filters = body[0].query[0].filters;
  filters.find(filter => filter.fieldName === 'locations.provCode').fieldValues = ['68', '703', 606, 715, 'SECRET_FIXTURE_CODE'];
  filters.push({ fieldName: 'bidCloseDate', searchType: 'range', from: '2026-11-10T12:10:00.000Z', to: 1_800_000_000_000 });
  filters.push({ fieldName: 'investorName', searchType: 'in', fieldValues: ['SECRET_FIXTURE_OWNER'] });
  filters.push({ fieldName: 'SECRET_FIXTURE_FIELD', searchType: 'SECRET_FIXTURE_OPERATION', fieldValues: ['SECRET_FIXTURE_VALUE'] });
  filters.push({ fieldName: 'statusForNotify', searchType: 'SECRET_FIXTURE_OPERATION', fieldValues: ['DHT', 'SECRET_FIXTURE_STATUS'], from: 'SECRET_FIXTURE_DATE' });
  body[0].query[0].keyWord = 'SECRET_FIXTURE_KEYWORD';
  const diagnostic = describeSourceFilters(body);
  const province = diagnostic.filters.find(filter => filter.fieldName === 'locations.provCode');
  assert.deepEqual(province.fieldValues, ['68', '703', 606, 715]);
  assert.equal(province.omittedValueCount, 1);
  assert.equal(diagnostic.filters.filter(filter => filter.fieldName === 'bidCloseDate').length, 2);
  assert.equal(diagnostic.omittedFilterCount, 2);
  const status = diagnostic.filters.find(filter => filter.fieldName === 'statusForNotify');
  assert.equal(status.searchType, 'UNRECOGNIZED');
  assert.deepEqual(status.fieldValues, ['DHT']);
  assert.equal(JSON.stringify(diagnostic).includes('SECRET_FIXTURE'), false);
  assert.equal(JSON.stringify(diagnostic).includes('investorName'), false);
  body[0].query[0].keyWord = '';
  assert.equal(validateSourceQuery(body, 'lam_dong').code, 'SOURCE_PROVINCE_MISMATCH');
});

test('canonical source pagination strings normalize without a zero-to-one index shift', () => {
  const body = requestFor();
  body[0].pageNumber = '0'; body[0].pageSize = '10';
  const query = validateSourceQuery(body, 'lam_dong');
  assert.equal(query.ok, true);
  assert.equal(query.pageNumber, 0);
  assert.equal(query.pageSize, 10);
  for (const invalid of ['', '00', ' 0', '+0', '-0', '0.0', '0e0', '2x', null, {}, 0.5]) {
    body[0].pageNumber = invalid;
    assert.equal(validateSourceQuery(body, 'lam_dong').ok, false);
  }
  body[0].pageNumber = '1';
  assert.equal(validateSourceQuery(body, 'lam_dong').code, 'SOURCE_PAGE_MISMATCH');
  body[0].pageNumber = '2';
  assert.equal(validateSourceQuery(body, 'lam_dong', { expectedPage: 2 }).pageNumber, 2);
});

test('pagination and response diagnostics expose only approved numeric metadata and public identity fields', () => {
  const request = describeRequestPagination([{ pageNumber: '0', pageSize: '10', token: 'SECRET_FIXTURE_QUERY' }]);
  assert.deepEqual(request.pageNumber, { type: 'string', numericValue: 0 });
  assert.deepEqual(request.pageSize, { type: 'string', numericValue: 10 });
  const raw = pageFor([{ ...rowFor(1), notifyNo: 'IB2600000001-00', bidName: 'SECRET_FIXTURE_NAME',
    token: 'SECRET_FIXTURE_ROW', locations: [{ provCode: '68' }, { provCode: 'SECRET_FIXTURE_PROVINCE' }] }]);
  raw.page.currentPage = '0';
  raw.page.extra = 'SECRET_FIXTURE_PAGE';
  const response = describeSourceResponseMetadata(raw);
  assert.deepEqual(response.currentPage, { type: 'string', numericValue: 0 });
  assert.equal(response.publicIdentities[0].notifyNo, 'IB2600000001-00');
  assert.deepEqual(response.publicIdentities[0].provinceCodes, ['68']);
  assert.equal(JSON.stringify({ request, response }).includes('SECRET_FIXTURE'), false);
  assert.equal(sanitizeSourcePage(raw, { provinceKey: 'lam_dong', query: validateSourceQuery(requestFor(), 'lam_dong') }).ok, false);
});

function sourceRequest(body, { startTime = 0, url = 'https://muasamcong.mof.gov.vn/o/egp-portal-contractor-selection-v2/services/smart/search?token=SECRET_FIXTURE_QUERY' } = {}) {
  return { url: () => url, method: () => 'POST', timing: () => ({ startTime }), postDataJSON: () => body };
}
const sourceResponse = (request, status = 200) => ({ request: () => request, status: () => status });

test('a new source request with Playwright initial startTime zero is accepted; a pre-action request remains excluded', () => {
  const gate = createSourceRequestGate('lam_dong');
  const old = sourceRequest(requestFor());
  gate.observeRequest(old);
  gate.beginAction();
  assert.equal(gate.acceptsResponse(sourceResponse(old)), false);
  const delayedOld = sourceRequest(requestFor(), { startTime: 1 });
  gate.observeRequest(delayedOld);
  assert.equal(gate.acceptsResponse(sourceResponse(delayedOld)), false);
  const fresh = sourceRequest(requestFor());
  gate.observeRequest(fresh);
  gate.completeAction();
  const response = sourceResponse(fresh);
  gate.observeResponse(response);
  assert.equal(gate.acceptsResponse(response), true);
  assert.equal(gate.acceptsResponse(sourceResponse(old)), false);
  const diagnostic = gate.snapshot();
  assert.equal(diagnostic.requestEventsBeforeAction, 1);
  assert.equal(diagnostic.requestEventsAfterAction, 2);
  assert.equal(diagnostic.timingUnavailableEvents, 1);
  assert.equal(diagnostic.initializedTimingBeforeActionEvents, 1);
  assert.equal(diagnostic.payloadAcceptedEvents, 1);
  assert.equal(diagnostic.matchedResponseEvents, 1);
  assert.deepEqual(diagnostic.responseStatuses, [200]);
  assert.equal(JSON.stringify(diagnostic).includes('SECRET_FIXTURE'), false);
});

test('request-event correlation still rejects a wrong province, page, payload or origin without copying the request', () => {
  const gate = createSourceRequestGate('lam_dong');
  gate.beginAction();
  const requests = [sourceRequest(requestFor('ha_noi')), sourceRequest(requestFor('lam_dong', { pageNumber: 1 })),
    sourceRequest({ token: 'SECRET_FIXTURE_PAYLOAD' }),
    sourceRequest(requestFor(), { url: 'https://example.invalid/o/egp-portal-contractor-selection-v2/services/smart/search?token=SECRET_FIXTURE_OTHER' })];
  for (const request of requests) {
    gate.observeRequest(request);
    assert.equal(gate.acceptsResponse(sourceResponse(request)), false);
  }
  const diagnostic = gate.snapshot();
  assert.equal(diagnostic.payloadAcceptedEvents, 0);
  assert.equal(diagnostic.payloadRejectedEvents, 3);
  assert.deepEqual(diagnostic.payloadRejectionCodes, ['SOURCE_PROVINCE_MISMATCH', 'SOURCE_PAGE_MISMATCH', 'SOURCE_QUERY_SCHEMA']);
  assert.equal(JSON.stringify(diagnostic).includes('SECRET_FIXTURE'), false);
  assert.equal(JSON.stringify(diagnostic).includes('example.invalid'), false);
});

test('province option diagnostics contain only bounded public labels for the requested province', () => {
  const labels = ['\n Tỉnh Lâm Đồng\n ', 'Thành phố Hà Nội', 'Tỉnh Lâm Đồng (mới)',
    'Tỉnh Lâm Đồng https://example.invalid/?token=SECRET_FIXTURE', 'Không có dữ liệu', 'Tỉnh Lâm Đồng'];
  assert.deepEqual(sanitizeProvinceOptionLabels(labels, 'lam_dong'), ['Tỉnh Lâm Đồng', 'Tỉnh Lâm Đồng (mới)']);
  assert.deepEqual(sanitizeProvinceOptionLabels(labels, 'unknown'), []);
  assert.deepEqual(sanitizeProvinceOptionLabels(null, 'lam_dong'), []);
});
function requestFor(key = 'lam_dong', { mode = 'open', pageNumber = 0, pageSize = 10 } = {}) {
  const filters = [
    { fieldName: 'type', searchType: 'in', fieldValues: ['es-notify-contractor'] },
    { fieldName: 'caseKHKQ', searchType: 'not_in', fieldValues: ['1'] },
    { fieldName: 'locations.provCode', searchType: 'in', fieldValues: [...PROVINCES[key].sourceCodes] }
  ];
  // Observed public source helper push7HoursToDate shifts this query boundary.
  // Matching that request representation does not establish each row's status.
  if (mode === 'open') filters.push({ fieldName: 'bidCloseDate', searchType: 'range', from: new Date(Date.now() + 7 * 3_600_000).toISOString(), to: null });
  return [{ pageSize, pageNumber, query: [{ index: 'es-contractor-selection', keyWord: '', matchFields: ['notifyNo', 'bidName'], filters }] }];
}
function rowFor(n, code = '68') {
  return { type: 'es-notify-contractor', notifyNo: `IB2600${String(n).padStart(6, '0')}`, notifyVersion: '00',
    locations: [{ provCode: code }], bidCloseDate: new Date(Date.now() + 86_400_000).toISOString() };
}
function pageFor(rows, { pageSize = 10, currentPage = 0, totalElements = rows.length } = {}) {
  return { page: { content: rows, pageSize, currentPage, totalElements, totalPages: Math.ceil(totalElements / pageSize) } };
}

test('province-only source request validates independently for all three configured probe scopes', () => {
  for (const key of Object.keys(PROVINCES)) {
    const receipt = validateSourceQuery(requestFor(key), key);
    assert.equal(receipt.ok, true, key);
    assert.deepEqual(receipt.provinceCodes, [...PROVINCES[key].sourceCodes].sort());
    assert.equal(receipt.historicalPredecessorCoverage, 'not_established');
    assert.equal(receipt.pageNumber, 0);
  }
});

test('wrong province, duplicate province and hidden ward/investor filters cannot pass the province-only gate', () => {
  const wrong = requestFor('ha_noi');
  assert.equal(validateSourceQuery(wrong, 'lam_dong').ok, false);
  const duplicate = requestFor();
  duplicate[0].query[0].filters.find(f => f.fieldName === 'locations.provCode').fieldValues.push('68');
  assert.equal(validateSourceQuery(duplicate, 'lam_dong').ok, false);
  for (const fieldName of ['locations.wardCode', 'investorCode', 'investField']) {
    const hidden = requestFor();
    hidden[0].query[0].filters.push({ fieldName, searchType: 'in', fieldValues: ['FIXTURE_EXTRA_FILTER'] });
    assert.equal(validateSourceQuery(hidden, 'lam_dong').ok, false, fieldName);
  }
});

test('open, all, category and pagination cannot be silently substituted', () => {
  assert.equal(validateSourceQuery(requestFor('lam_dong', { mode: 'all' }), 'lam_dong').ok, false);
  assert.equal(validateSourceQuery(requestFor(), 'lam_dong', { mode: 'all' }).ok, false);
  assert.equal(validateSourceQuery(requestFor('lam_dong', { pageNumber: 1 }), 'lam_dong', { expectedPage: 0 }).ok, false);
  const resultCategory = requestFor();
  resultCategory[0].query[0].filters[0].fieldValues = ['es-contractor-selection-result'];
  assert.equal(validateSourceQuery(resultCategory, 'lam_dong').ok, false);
  const narrowedDate = requestFor();
  narrowedDate[0].query[0].filters.at(-1).to = new Date(Date.now() + 86_400_000).toISOString();
  assert.equal(validateSourceQuery(narrowedDate, 'lam_dong').ok, false);
  const keyword = requestFor();
  keyword[0].query[0].keyWord = 'FIXTURE_NARROWING_KEYWORD';
  assert.equal(validateSourceQuery(keyword, 'lam_dong').ok, false);
});

test('a stale open boundary or changed source case filter is rejected', () => {
  const nowMs = Date.UTC(2026, 10, 10, 3);
  const valid = requestFor();
  valid[0].query[0].filters.find(f => f.fieldName === 'bidCloseDate').from = new Date(nowMs + 7 * 3_600_000).toISOString();
  assert.equal(validateSourceQuery(valid, 'lam_dong', { nowMs }).ok, true);
  for (const delta of [-86_400_000, 86_400_000]) {
    const stale = clone(valid);
    stale[0].query[0].filters.find(f => f.fieldName === 'bidCloseDate').from = new Date(nowMs + 7 * 3_600_000 + delta).toISOString();
    assert.equal(validateSourceQuery(stale, 'lam_dong', { nowMs }).ok, false);
  }
  const wrongCase = clone(valid);
  wrongCase[0].query[0].filters.find(f => f.fieldName === 'caseKHKQ').fieldValues = ['99'];
  assert.equal(validateSourceQuery(wrongCase, 'lam_dong', { nowMs }).ok, false);
  const missingCase = clone(valid);
  missingCase[0].query[0].filters = missingCase[0].query[0].filters.filter(f => f.fieldName !== 'caseKHKQ');
  assert.equal(validateSourceQuery(missingCase, 'lam_dong', { nowMs }).ok, false);
});

test('a valid first page preserves total versus received count without claiming historic coverage', () => {
  const query = validateSourceQuery(requestFor(), 'lam_dong');
  const raw = pageFor(Array.from({ length: 10 }, (_, i) => rowFor(i + 1)), { totalElements: 23 });
  const output = sanitizeSourcePage(raw, { provinceKey: 'lam_dong', query });
  assert.equal(output.ok, true);
  assert.equal(output.receipt.sourceTotal, 23);
  assert.equal(output.receipt.sourceTotalPages, 3);
  assert.equal(output.receipt.receivedCount, 10);
  assert.equal(output.receipt.historicalPredecessorCoverage, 'not_established');
  assert.equal(output.receipt.rowStatusVerified, false);
  assert.equal(output.receipt.rowPriceVerified, false);
  assert.equal(output.receipt.samples.length, 5);
  assert.deepEqual(output.receipt.sourceProvinceCodes, query.provinceCodes);
});

test('HTML, error envelope and wrong page are not a successful empty province', () => {
  const query = validateSourceQuery(requestFor(), 'lam_dong');
  for (const raw of ['<html>Sign in</html>', { error: 'ACCESS_DENIED' }, { page: { content: [] } }, null]) {
    assert.equal(sanitizeSourcePage(raw, { provinceKey: 'lam_dong', query }).ok, false);
  }
  const wrongPage = pageFor([rowFor(1)], { currentPage: 1, totalElements: 11 });
  assert.equal(sanitizeSourcePage(wrongPage, { provinceKey: 'lam_dong', query }).ok, false);
  assert.equal(sanitizeSourcePage(pageFor([]), { provinceKey: 'lam_dong', query: { ok: false } }).ok, false);
});

test('missing identity, duplicate row, wrong category and province are rejected', () => {
  const query = validateSourceQuery(requestFor(), 'lam_dong');
  const noVersion = rowFor(1); delete noVersion.notifyVersion;
  const noProvince = rowFor(2); noProvince.locations = [];
  const wrongCategory = rowFor(3); wrongCategory.type = 'es-plan-project';
  for (const rows of [[noVersion], [noProvince], [wrongCategory], [rowFor(4, '01')], [rowFor(5), rowFor(5)]]) {
    assert.equal(sanitizeSourcePage(pageFor(rows), { provinceKey: 'lam_dong', query }).ok, false);
  }
});

test('short pages and inconsistent total-page counts cannot pass full-page validation', () => {
  const query = validateSourceQuery(requestFor(), 'lam_dong');
  assert.equal(sanitizeSourcePage(pageFor([rowFor(1)], { totalElements: 23 }), { provinceKey: 'lam_dong', query }).ok, false);
  const corrupt = pageFor([rowFor(1)]); corrupt.page.totalPages = 5;
  assert.equal(sanitizeSourcePage(corrupt, { provinceKey: 'lam_dong', query }).ok, false);
  const emptyButNonzero = pageFor([], { totalElements: 1 });
  assert.equal(sanitizeSourcePage(emptyButNonzero, { provinceKey: 'lam_dong', query }).ok, false);
});

test('receipt does not copy tokens, headers, source URLs, names or raw data and does not mutate input', () => {
  const query = validateSourceQuery(requestFor(), 'lam_dong');
  const raw = pageFor([{
    ...rowFor(1), bidName: 'PRIVATE_FIXTURE_NAME', investorName: 'PRIVATE_FIXTURE_INVESTOR',
    token: 'SECRET_FIXTURE_TOKEN', cookie: 'SECRET_FIXTURE_COOKIE',
    url: 'https://example.invalid/?token=SECRET_FIXTURE_QUERY',
    headers: { Authorization: 'Bearer SECRET_FIXTURE_BEARER' }
  }]);
  raw.token = 'SECRET_FIXTURE_ENVELOPE';
  const before = clone(raw);
  const output = sanitizeSourcePage(raw, { provinceKey: 'lam_dong', query, maxSamples: 99 });
  assert.equal(output.ok, true);
  const serialized = JSON.stringify(output);
  for (const needle of ['PRIVATE_FIXTURE', 'SECRET_FIXTURE', 'example.invalid', 'Authorization']) assert.equal(serialized.includes(needle), false, needle);
  assert.deepEqual(raw, before);
  assert.equal(output.receipt.samples.length, 1);
  assert.deepEqual(Object.keys(output.receipt.samples[0]).sort(), ['noticeNo', 'provinceCodes']);
});

function reportFixture() {
  const query = validateSourceQuery(requestFor(), 'lam_dong');
  const { receipt } = sanitizeSourcePage(pageFor(Array.from({ length: 10 }, (_, i) => rowFor(i + 1)), { totalElements: 23 }), { provinceKey: 'lam_dong', query });
  const page = { ...receipt, httpStatus: 200, receivedAt: '2026-11-10T03:00:00.000Z' };
  return {
    schemaVersion: 1, probeVersion: PROBE_VERSION,
    purpose: 'normal-cloud-browser-source-acceptance-only',
    status: 'SOURCE_ACCEPTANCE_SAMPLE_PASSED', sourceGatePassed: true, appReadyForProduction: false,
    sourceOrigin: 'https://muasamcong.mof.gov.vn', sourcePath: '/vi/web/guest/contractor-selection',
    browserEngine: 'chromium', requestedMode: 'open', liveSourceResponseObserved: true,
    nonEmptyPublicRecordsObserved: true, requestedProvinceCount: 1, maxPagesPerProvince: 3,
    realSafariTested: false, realAppleDeviceTested: false, extensionUsed: false, userscriptUsed: false,
    officePcUsed: false, tokenCollectedOrReplayed: false, rawHeadersOrCookiesRecorded: false, rowStatusVerified: false,
    provinces: [{
      provinceKey: 'lam_dong', mode: 'open', ok: true, uiProvinceSelected: true, investorAndWardBlank: true,
      scope: 'official_ui_selected_province', historicalPredecessorCoverage: 'not_established',
      rowStatusVerified: false, rowPriceVerified: false,
      sourceTotal: receipt.sourceTotal, receivedCount: receipt.receivedCount,
      sourceProvinceCodes: receipt.sourceProvinceCodes, samples: receipt.samples,
      completeSourcePagination: false, status: 'LIVE_PARTIAL_RESPONSE_VERIFIED', pages: [page]
    }]
  };
}

test('bounded report gate permits a partial sample without promoting it to a production or physical Safari result', () => {
  const result = validateProbeReport(reportFixture(), { expectedBrowser: 'chromium', expectedProvinceKeys: ['lam_dong'] });
  assert.equal(result.ok, true);
  assert.equal(result.sourceGatePassed, true);
  assert.equal(result.appReadyForProduction, false);
  assert.equal(result.scope, 'bounded-source-query-and-response-only');
});

test('missing, failed, wrong-engine and wrong-province reports cannot become a completed source job', () => {
  for (const value of [{}, null, [], { status: 'SOURCE_ACCEPTANCE_SAMPLE_PASSED' }]) {
    assert.equal(validateProbeReport(value).ok, false);
  }
  const valid = reportFixture();
  assert.equal(validateProbeReport(valid, { expectedBrowser: 'webkit' }).ok, false);
  assert.equal(validateProbeReport(valid, { expectedProvinceKeys: ['lam_dong', 'ha_noi'] }).ok, false);
  for (const patch of [
    { status: 'SOURCE_ACCESS_DENIED' }, { sourceGatePassed: false },
    { appReadyForProduction: true }, { realSafariTested: true }, { realAppleDeviceTested: true },
    { officePcUsed: true }, { tokenCollectedOrReplayed: true }, { rawHeadersOrCookiesRecorded: true },
    { liveSourceResponseObserved: false }, { rowStatusVerified: true }
  ]) assert.equal(validateProbeReport({ ...valid, ...patch }).ok, false, JSON.stringify(patch));
});

test('a report cannot hide missing pages, a changed filter scope or unverified row-level claims', () => {
  const valid = reportFixture();
  for (const patch of [
    { completeSourcePagination: true }, { receivedCount: 23 }, { investorAndWardBlank: false },
    { historicalPredecessorCoverage: 'all' }, { rowPriceVerified: true },
    { sourceProvinceCodes: ['01'] }, { pages: [] }, { samples: [] }
  ]) {
    const corrupt = clone(valid); Object.assign(corrupt.provinces[0], patch);
    assert.equal(validateProbeReport(corrupt).ok, false, JSON.stringify(patch));
  }
  const forbidden = clone(valid); forbidden.provinces[0].pages[0].httpStatus = 403;
  assert.equal(validateProbeReport(forbidden).ok, false);
  const wrongPage = clone(valid); wrongPage.provinces[0].pages[0].pageNumber = 2;
  assert.equal(validateProbeReport(wrongPage).ok, false);
});

test('schema diagnostics reveal known field names and types, never arbitrary source values or keys', () => {
  const raw = { SECRET_FIXTURE_KEY: 'SECRET_FIXTURE_VALUE', error: 'SECRET_FIXTURE_ERROR',
    page: { content: [{ notifyNo: 'SECRET_FIXTURE_NOTICE', locations: [{ provCode: 'SECRET_FIXTURE_PROVINCE' }],
      unexpected: 'SECRET_FIXTURE_ROW' }], totalElements: 'SECRET_FIXTURE_TOTAL' } };
  const output = describeSourceShape(raw);
  assert.equal(output.rootFields.error, 'string');
  assert.equal(output.pageFields.content, 'array');
  assert.equal(output.pageFields.totalElements, 'string');
  assert.equal(output.firstRowFields.notifyNo, 'string');
  assert.equal(output.firstLocationFields.provCode, 'string');
  assert.equal(JSON.stringify(output).includes('SECRET_FIXTURE'), false);
  assert.equal(JSON.stringify(output).includes('unexpected'), false);
});
