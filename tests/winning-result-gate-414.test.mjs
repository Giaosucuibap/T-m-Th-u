import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyWinningResult, normalizeKqlcntRecord, summarizeWinner} from '../GiaoSuCuiBap/lib/kqlcnt.js';
import {PRICE_BASIS_SOURCE} from '../GiaoSuCuiBap/lib/provenance.js';

// Reduced, unmodified scalar/identity fields captured by the live 4.14.0 run
// from IB2600425566::00. The prior owner/province gate had marked it MATCH.
const capturedMissingWinner = {
  key: 'IB2600425566::00', notifyNo: 'IB2600425566', version: '00',
  statusCode: 'DHT', statusLabel: 'DHT', winnerName: '', winningTaxCodes: [],
  winningPrice: null, priceBasis: 17879456000,
  investorName: 'Văn phòng HĐND và UBND xã Đức Trọng', provinceCodes: ['68'],
  provinces: [], filterState: 'MATCH'
};

test('414 live notice with matching owner/province but missing winner is insufficient', () => {
  const before = structuredClone(capturedMissingWinner);
  assert.deepEqual(classifyWinningResult(capturedMissingWinner),
    {ok: false, state: 'INSUFFICIENT', reason: 'insufficient-winner'});
  assert.deepEqual(capturedMissingWinner, before);
});

test('414 known cancelled/no-award statuses override even contradictory winner identity', () => {
  for (const statusCode of ['HUY', 'KCNTTT', ' huy ', 'kcnttt']) {
    assert.deepEqual(classifyWinningResult({...capturedMissingWinner, statusCode,
      winnerName: 'Công ty được ghi trong bản ghi mâu thuẫn', winningTaxCodes: ['0012345678'], winningPrice: 100}),
    {ok: false, state: 'OUT_OF_RANGE', reason: 'no-award'});
  }
});

test('414 declared positive or unknown statuses cannot substitute for a winner identity', () => {
  for (const statusCode of ['CNTTT', 'DHT', 'NEW_STATUS', '', undefined]) {
    assert.equal(classifyWinningResult({...capturedMissingWinner, statusCode, winningPrice: 100}).state, 'INSUFFICIENT');
    assert.equal(classifyWinningResult({...capturedMissingWinner, statusCode, winningPrice: 0}).state, 'INSUFFICIENT');
  }
});

test('414 winner name or exact normalized tax-code list supplies positive identity independently of price', () => {
  for (const statusCode of ['CNTTT', 'DHT', 'NEW_STATUS', '']) {
    for (const winningPrice of [null, 0, 100]) {
      assert.deepEqual(classifyWinningResult({...capturedMissingWinner, statusCode, winningPrice,
        winnerName: 'Công ty xây dựng A'}), {ok: true, state: 'MATCH', reason: 'match'});
      assert.deepEqual(classifyWinningResult({...capturedMissingWinner, statusCode, winningPrice,
        winningTaxCodes: ['0012345678']}), {ok: true, state: 'MATCH', reason: 'match'});
    }
  }
});

test('414 missing/malformed normalized identity does not turn into a winner string', () => {
  for (const row of [null, undefined, {}, {winnerName: '  ', winningTaxCodes: [' ', '']},
    {winnerName: {}, winningTaxCodes: [null, {}, 123]}, {winnerName: 1, winningTaxCodes: '0012345678'}]) {
    assert.deepEqual(classifyWinningResult(row), {ok: false, state: 'INSUFFICIENT', reason: 'insufficient-winner'});
  }
});

test('414 raw KQLCNT normalization feeds the winner gate including valid zero award', () => {
  const base = {notifyNo: 'IB2600425566', notifyVersion: '00', statusForNotify: 'DHT',
    investorName: 'Văn phòng HĐND và UBND xã Đức Trọng', locations: [{provCode: '68'}], bidPrice: 17879456000};
  assert.equal(classifyWinningResult(normalizeKqlcntRecord(base)).state, 'INSUFFICIENT');
  const zero = normalizeKqlcntRecord({...base, contractorName: ['Công ty A'], bidWinningPrice: 0});
  assert.equal(zero.winningPrice, 0);
  assert.equal(classifyWinningResult(zero).state, 'MATCH');
  assert.equal(classifyWinningResult(normalizeKqlcntRecord({...base, winningCode: ['vn0012345678']})).state, 'MATCH');
  assert.equal(classifyWinningResult(normalizeKqlcntRecord({...base, statusForNotify: 'KCNTTT',
    contractorName: ['Tên mâu thuẫn'], winningCode: ['vn0012345678']})).state, 'OUT_OF_RANGE');
});

test('414 explicit approved estimate drives both numerical and explained discount', () => {
  const row = normalizeKqlcntRecord({notifyNo: 'IB-ESTIMATE', bidPrice: 100000000,
    bidEstimatePrice: [120000000], bidWinningPrice: 90000000, contractorName: 'Nhà thầu A'});
  assert.equal(row.priceBasis, 120000000);
  assert.equal(row.priceBasisSource, 'bidEstimatePrice');
  assert.equal(row.priceBasisLabel, PRICE_BASIS_SOURCE.ESTIMATE);
  assert.equal(row.savedAmount, 30000000);
  assert.equal(row.discountRate, 25);
  assert.equal(row.discount.rate, 25);
  assert.equal(row.discount.basisSource, PRICE_BASIS_SOURCE.ESTIMATE);
  assert.match(row.discount.formula, /120\.000\.000/);
});

test('414 absent or invalid estimate uses package value with package provenance', () => {
  for (const bidEstimatePrice of [undefined, null, '', 'không công bố', NaN, Infinity, -1, [], [null], false]) {
    const row = normalizeKqlcntRecord({notifyNo: 'IB-FALLBACK', bidPrice: 100000000,
      bidEstimatePrice, bidWinningPrice: 90000000});
    assert.equal(row.priceBasis, 100000000);
    assert.equal(row.priceBasisSource, 'bidPrice');
    assert.equal(row.priceBasisLabel, PRICE_BASIS_SOURCE.PACKAGE);
    assert.equal(row.savedAmount, 10000000);
    assert.equal(row.discountRate, 10);
    assert.equal(row.discount.rate, 10);
    assert.equal(row.discount.basisSource, PRICE_BASIS_SOURCE.PACKAGE);
  }
});

test('414 explicit zero estimate stays zero and missing award is not 100 percent reduction', () => {
  const zero = normalizeKqlcntRecord({notifyNo: 'IB-ZERO', bidPrice: 100000000,
    bidEstimatePrice: 0, bidWinningPrice: 0, contractorName: 'Nhà thầu A'});
  assert.equal(zero.priceBasis, 0);
  assert.equal(zero.priceBasisSource, 'bidEstimatePrice');
  assert.equal(zero.winningPrice, 0);
  assert.equal(zero.discountRate, null);
  assert.equal(zero.discount.rate, null);
  const missing = normalizeKqlcntRecord({notifyNo: 'IB-MISSING', bidEstimatePrice: 100000000,
    bidWinningPrice: null, contractorName: 'Nhà thầu A'});
  assert.equal(missing.winningPrice, null);
  assert.equal(missing.savedAmount, null);
  assert.equal(missing.discountRate, null);
  assert.equal(missing.discount.rate, null);
});

test('414 winner summary exposes known and missing prices and retains true zero as largest', () => {
  const row = (key, winningPrice, isVenture = false) => ({key, winningPrice, isVenture, discountRate: null});
  const source = [row('missing-solo', null), row('zero-solo', 0), row('known-solo', 50),
    row('known-venture', 90, true), row('missing-venture', undefined, true), row('invalid', Infinity)];
  const summary = summarizeWinner(source);
  assert.deepEqual([summary.knownPriceCount, summary.missingPriceCount, summary.soloKnownPriceCount,
    summary.soloMissingPriceCount, summary.ventureKnownPriceCount, summary.ventureMissingPriceCount], [3, 3, 2, 2, 1, 1]);
  assert.equal(summary.soloValue, 50);
  assert.equal(summary.ventureValue, 90);
  assert.equal(summary.largest.key, 'known-venture');
  assert.equal(summarizeWinner([row('missing', null), row('zero', 0)]).largest.key, 'zero');
  assert.equal(summarizeWinner([row('missing', null)]).largest, null);
  assert.equal(summarizeWinner([]).knownPriceCount, 0);
});
