import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalEgpUrl,
  cleanText,
  foldText,
  normalizeCandidate,
  parseDate,
  parseMoney,
  sanitizeRequestTemplate,
  tokenizeText
} from '../lib/core.js';
import {
  countSecrets,
  maskPartial,
  maskSecret,
  redactSettings
} from '../lib/redact.js';

const SEARCH_ENDPOINT =
  'https://muasamcong.mpi.gov.vn/o/egp-portal-contractor-selection-v2/services/smart/search';

test('Vietnamese text normalization is deterministic', () => {
  assert.equal(cleanText('  Kênh\n  mương\tĐắk Lắk  '), 'Kênh mương Đắk Lắk');
  assert.equal(foldText('Đường thủy lợi'), 'duong thuy loi');
  assert.deepEqual(
    tokenizeText('Gói thầu thi công KÊNH mương tại Đắk Lắk'),
    ['thi', 'cong', 'kenh', 'muong', 'dak', 'lak']
  );
});

test('parseMoney supports raw numbers and Vietnamese display formats', () => {
  assert.equal(parseMoney(3_000_000_000.4), 3_000_000_000);
  assert.equal(parseMoney('1.234.567.890 đ'), 1_234_567_890);
  assert.equal(parseMoney('3,5 tỷ'), 3_500_000_000);
  assert.equal(parseMoney('1.234,56 tỷ'), 1_234_560_000_000);
  assert.equal(parseMoney('12,75 triệu'), 12_750_000);
  assert.equal(parseMoney('không xác định'), null);
});

test('parseDate parses valid Vietnamese dates and rejects impossible dates', () => {
  const parsed = parseDate('02/09/2026 06:05:07');
  assert.ok(parsed, 'a valid date should be parsed');
  const date = new Date(parsed);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 8);
  assert.equal(date.getDate(), 2);
  assert.equal(date.getHours(), 6);
  assert.equal(date.getMinutes(), 5);
  assert.equal(date.getSeconds(), 7);

  assert.equal(parseDate('31/02/2026'), null);
  assert.equal(parseDate('29/02/2025'), null);
  assert.equal(parseDate('32/13/2026'), null);
  assert.equal(parseDate('29/02/2024'), new Date(2024, 1, 29).toISOString());
});

test('canonicalEgpUrl only permits the official HTTPS origin', () => {
  const valid = 'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?render=search';
  assert.equal(canonicalEgpUrl(valid), valid);
  assert.equal(canonicalEgpUrl('http://muasamcong.mpi.gov.vn/'), '');
  assert.equal(canonicalEgpUrl('https://muasamcong.mpi.gov.vn.evil.example/'), '');
  assert.equal(canonicalEgpUrl('javascript:alert(1)', 'fallback'), 'fallback');
});

test('normalizeCandidate keeps IB, BP and PL identifiers distinct', () => {
  const tender = normalizeCandidate({
    notifyNo: 'IB2600455310',
    bidNo: 'BP2600643669',
    planNo: 'PL2600259406',
    notifyVersion: 2,
    bidName: 'Thi công kênh mương',
    bidPrice: '12,75 tỷ',
    bidCloseDate: '29/02/2024 09:00',
    notifyId: 'official-id'
  }, { capturedAt: '2026-09-02T00:00:00.000Z' });

  assert.ok(tender);
  assert.equal(tender.notifyNo, 'IB2600455310');
  assert.equal(tender.bidNo, 'BP2600643669');
  assert.equal(tender.planNo, 'PL2600259406');
  assert.equal(tender.key, 'IB2600455310::02');
  assert.equal(tender.displayCode, 'IB2600455310-02');
  assert.equal(tender.price, 12_750_000_000);
  assert.match(tender.detailUrl, /^https:\/\/muasamcong\.mpi\.gov\.vn\//);

  const planOnly = normalizeCandidate({
    bidNo: 'BP2600643669',
    bidName: 'Gói trong kế hoạch'
  });
  assert.equal(planOnly?.notifyNo, '');
  assert.equal(planOnly?.key, 'BP:BP2600643669');
  assert.equal(planOnly?.codeLabel, 'Mã gói thầu (KHLCNT)');
});

test('sanitizeRequestTemplate accepts only the smart-search contract and removes secrets deeply', () => {
  const request = {
    url: `${SEARCH_ENDPOINT}?page=1&token=URL_TOKEN&sessionId=URL_SESSION`,
    method: 'post',
    headers: {
      authorization: 'Bearer HEADER_SECRET',
      cookie: 'SESSION=HEADER_COOKIE',
      'x-debug': 'must-not-be-copied'
    },
    body: JSON.stringify([{
      pageSize: 20,
      query: [{ index: 'es-contractor-selection', keyWord: 'kênh mương' }],
      recaptchaToken: 'BODY_CAPTCHA',
      nested: {
        csrf: 'BODY_CSRF',
        keep: 'safe value',
        rows: [{ authorization: 'BODY_AUTH', publicValue: 7 }]
      }
    }])
  };

  const safe = sanitizeRequestTemplate(
    request,
    'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?render=search',
    99_999
  );

  assert.ok(safe);
  assert.equal(safe.method, 'POST');
  assert.deepEqual(safe.headers, {
    accept: 'application/json',
    'content-type': 'application/json'
  });
  assert.equal(new URL(safe.url).searchParams.get('page'), '1');
  assert.equal(new URL(safe.url).searchParams.has('token'), false);
  assert.equal(new URL(safe.url).searchParams.has('sessionId'), false);
  assert.equal(safe.candidateCount, 5000);

  const parsed = JSON.parse(safe.body);
  assert.equal(parsed[0].nested.keep, 'safe value');
  assert.equal(parsed[0].nested.rows[0].publicValue, 7);
  assert.equal('recaptchaToken' in parsed[0], false);
  assert.equal('csrf' in parsed[0].nested, false);
  assert.equal('authorization' in parsed[0].nested.rows[0], false);
  assert.doesNotMatch(safe.body, /BODY_|HEADER_|URL_TOKEN|URL_SESSION/);
  assert.match(safe.capturedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('sanitizeRequestTemplate rejects requests outside its allowlist', () => {
  const validBody = JSON.stringify([{ query: [{ keyWord: 'cầu đường' }] }]);
  const cases = [
    { url: SEARCH_ENDPOINT.replace('https://', 'http://'), method: 'POST', body: validBody },
    { url: 'https://example.com/o/egp-portal-contractor-selection-v2/services/smart/search', method: 'POST', body: validBody },
    { url: `${SEARCH_ENDPOINT}/detail`, method: 'POST', body: validBody },
    { url: SEARCH_ENDPOINT, method: 'GET', body: validBody },
    { url: SEARCH_ENDPOINT, method: 'POST', body: '{bad json' },
    { url: SEARCH_ENDPOINT, method: 'POST', body: JSON.stringify({ query: [{}] }) },
    { url: SEARCH_ENDPOINT, method: 'POST', body: JSON.stringify([{ query: [] }]) },
    { url: SEARCH_ENDPOINT, method: 'POST', body: 'x'.repeat(100_001) }
  ];
  for (const request of cases) {
    assert.equal(sanitizeRequestTemplate(request), null, request.url);
  }
});

test('diagnostic settings redaction does not mutate the source object', () => {
  const source = {
    telegramBotToken: '123456:very-secret-token',
    telegramChatId: '1234567890',
    futureApiKey: 'NEW_SECRET',
    reportMinScore: 70
  };
  const before = structuredClone(source);
  const result = redactSettings(source);

  assert.deepEqual(source, before);
  assert.equal(result.settings.telegramBotToken, maskSecret(source.telegramBotToken));
  assert.equal(result.settings.telegramChatId, maskPartial(source.telegramChatId));
  assert.equal(result.settings.futureApiKey, maskSecret(source.futureApiKey));
  assert.equal(result.settings.reportMinScore, 70);
  assert.deepEqual(new Set(result.redacted), new Set([
    'telegramBotToken',
    'telegramChatId',
    'futureApiKey'
  ]));
  assert.equal(countSecrets(source), 2);
});
