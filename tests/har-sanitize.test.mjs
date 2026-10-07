import test from 'node:test'; import assert from 'node:assert/strict';
import { sanitizedHarEntry } from './har-sanitize.mjs';
test('HAR allowlist removes credentials, URL parameters, arbitrary bodies, cookies and token fields', () => {
  const entry = sanitizedHarEntry({ url: 'https://muasamcong.mpi.gov.vn/x/smart/search?token=DO_NOT_LEAK', method: 'POST', status: 200,
    requestHeaders: { authorization: 'DO_NOT_LEAK', cookie: 'DO_NOT_LEAK', 'content-type': 'application/json' }, responseHeaders: { 'set-cookie': 'DO_NOT_LEAK' },
    requestBody: JSON.stringify([{ token: 'DO_NOT_LEAK', query: [{ index: 'es-contractor-selection', keyWord: 'IB2600509787', filters: [{ fieldName: 'sessionToken', fieldValues: ['DO_NOT_LEAK'] }, { fieldName: 'type', fieldValues: ['es-notify-contractor'] }] }] }]),
    data: { token: 'DO_NOT_LEAK', page: { totalElements: 1, content: [{ notifyNo: 'IB2600509787', authToken: 'DO_NOT_LEAK', password: 'DO_NOT_LEAK' }] } } });
  assert.ok(entry); assert.ok(!JSON.stringify(entry).includes('DO_NOT_LEAK')); assert.ok(!JSON.stringify(entry).includes('authToken'));
  assert.deepEqual(entry._egpSummary.identifiers, ['IB2600509787']); assert.equal(entry.request.queryString.length, 0); assert.ok(!entry.response.content.text);
});
test('HAR excludes third-party origins and unknown endpoint paths', () => {
  for (const url of ['https://evil.test/smart/search', 'https://muasamcong.mpi.gov.vn/token/secret', 'http://muasamcong.mpi.gov.vn/smart/search']) assert.equal(sanitizedHarEntry({ url }), null);
});
