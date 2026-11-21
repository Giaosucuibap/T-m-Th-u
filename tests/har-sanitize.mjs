const ORIGIN = 'https://muasamcong.mpi.gov.vn';
const SECRET = /token|captcha|auth|cookie|secret|password|session|csrf|xsrf|signature|jwt/i;
const PATHS = /\/(?:smart\/search|area-api-list|bid-open|lotOpenDetail|notify|roundmng)$/;
const HEADERS = new Set(['content-type', 'content-length', 'date', 'retry-after']);
const cleanHeaders = headers => Object.entries(headers || {}).filter(([key]) => HEADERS.has(key.toLowerCase())).map(([name, value]) => ({ name, value: String(value).slice(0, 150) }));
function safeQuery(body) {
  try {
    const data = JSON.parse(body || 'null');
    if (!Array.isArray(data)) return null;
    return data.slice(0, 1).map(page => ({ pageSize: Number(page.pageSize) || null, pageNumber: Number(page.pageNumber) || 0,
      query: (page.query || []).slice(0, 1).map(q => ({ index: q.index === 'es-contractor-selection' ? q.index : '[removed]',
        keyWord: /^(IB|PL)\d{10}$/.test(q.keyWord || '') ? q.keyWord : '[removed]',
        filters: (q.filters || []).filter(f => ['type', 'stepCode', 'investField', 'locations.provCode'].includes(f.fieldName)).map(f => ({ fieldName: f.fieldName, searchType: 'in', fieldValues: (f.fieldValues || []).filter(v => /^[a-zA-Z0-9_-]{1,60}$/.test(String(v)) && !SECRET.test(String(v))) })) })) }));
  } catch { return null; }
}
export function sanitizedHarEntry({ url, method, requestBody, requestHeaders, responseHeaders, status, startedAt, elapsedMs, data }) {
  let parsed; try { parsed = new URL(url); } catch { return null; }
  if (parsed.origin !== ORIGIN || parsed.username || parsed.password || !PATHS.test(parsed.pathname)) return null;
  const page = data?.page, query = safeQuery(requestBody);
  const fields = value => value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).filter(key => /^[\w.-]{1,100}$/.test(key) && !SECRET.test(key)).sort() : [];
  const rows = Array.isArray(page?.content) ? page.content : [];
  const summary = { fields: fields(data), pageFields: fields(page), recordFields: fields(rows[0]),
    totalElements: Number.isFinite(page?.totalElements) ? page.totalElements : null,
    identifiers: rows.map(r => r.notifyNo || r.planNo).filter(id => /^(IB|PL)\d{10}$/.test(id || '')) };
  return { startedDateTime: startedAt, time: Math.max(0, elapsedMs || 0), request: { method, url: parsed.origin + parsed.pathname, httpVersion: 'HTTP/1.1', headers: cleanHeaders(requestHeaders), queryString: [], cookies: [], headersSize: -1, bodySize: -1,
    ...(query ? { postData: { mimeType: 'application/json', text: JSON.stringify(query), comment: 'Only public criteria retained; CAPTCHA/authentication values removed.' } } : {}) },
    response: { status, statusText: '', httpVersion: 'HTTP/1.1', headers: cleanHeaders(responseHeaders), cookies: [], content: { size: -1, mimeType: 'application/json', comment: 'Response body omitted; public schema and record IDs are in _egpSummary.' }, redirectURL: '', headersSize: -1, bodySize: -1 },
    cache: {}, timings: { send: 0, wait: Math.max(0, elapsedMs || 0), receive: 0 }, _sanitized: true, _egpSummary: summary };
}
