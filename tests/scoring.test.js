import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, isConstructionTender, normalizeParticipation, scoreTender } from '../lib/core.js';

function tender(overrides = {}) {
  return {
    notifyNo: 'IB260000001',
    bidName: 'Thi công kênh mương nội đồng',
    fieldRaw: 'XL',
    location: 'Lâm Đồng',
    price: 10_000_000_000,
    investorName: 'Ban quản lý dự án',
    closeDate: new Date(Date.now() + 5 * 86400000).toISOString(),
    ...overrides
  };
}

test('construction classification recognizes the official XL field code', () => {
  assert.equal(isConstructionTender(tender({ bidName: 'Gói số 01', fieldRaw: 'XL' })), true);
});

test('keyword scoring uses phrase boundaries and does not double-count nested terms', () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    provinces: [],
    positiveKeywords: ['kênh', 'kênh mương', 'cầu'],
    requiredKeywords: [],
    negativeKeywords: []
  };
  const result = scoreTender(tender({ bidName: 'Thi công kênh mương; yêu cầu hoàn thành đúng hạn' }), settings);
  assert.deepEqual(result.posHits, ['kênh mương']);
});

test('zero-day minimum remains a real setting instead of reverting to the default', () => {
  const result = scoreTender(tender({ closeDate: new Date(Date.now() + 2 * 3600000).toISOString() }), {
    ...DEFAULT_SETTINGS,
    minDaysToClose: 0
  });
  assert.equal(result.parts.time, 4);
});

test('contractor outcome stays unknown when an unrelated number appears in text', () => {
  const unknown = normalizeParticipation(
    { taxCode: '0101234567', contractorName: 'Công ty A', resultStatus: 'Gói số 10' },
    { notifyNo: 'IB260000001', bidName: 'Gói số 01' }
  );
  const winner = normalizeParticipation(
    { taxCode: '0101234567', contractorName: 'Công ty A', resultStatus: 1 },
    { notifyNo: 'IB260000001', bidName: 'Gói số 01' }
  );
  assert.equal(unknown.isWinner, null);
  assert.equal(unknown.role, 'Chưa xác định');
  assert.equal(winner.isWinner, true);
});
