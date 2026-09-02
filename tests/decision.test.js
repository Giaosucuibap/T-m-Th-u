import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import {
  DECISION_STATES,
  DECISION_STATE_LABEL,
  actionFor,
  changeSignal,
  compareTenders,
  dataConfidence,
  deadlineIcon,
  deadlineRank,
  decisionRank,
  decisionSignals,
  filterAndSort,
  fold,
  missingFields,
  normalizeDecisionState,
  riskSignals,
  searchableText,
  statusOf
} from '../lib/decision.js';

const DAY = 86_400_000;
const FIXED_NOW = Date.parse('2026-01-10T00:00:00.000Z');
const originalDateNow = Date.now;

function dateAt(dayOffset) {
  return new Date(FIXED_NOW + dayOffset * DAY).toISOString();
}

function tender(overrides = {}) {
  return {
    notifyNo: 'IB2600000001',
    bidName: 'Xây dựng kênh thủy lợi',
    price: 5_000_000_000,
    closeDate: dateAt(10),
    location: 'Đắk Lắk',
    investorName: 'Ban quản lý dự án',
    detailUrl: 'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?x=1',
    status: 'OPEN',
    score: 0,
    matched: false,
    reasons: [],
    negHits: [],
    ...overrides
  };
}

before(() => {
  Date.now = () => FIXED_NOW;
});

after(() => {
  Date.now = originalDateNow;
});

test('decision states expose the workflow and normalize stored values safely', () => {
  assert.deepEqual(
    DECISION_STATES.map(({ value }) => value),
    ['NEW', 'REVIEW', 'GO', 'BID', 'SUBMITTED', 'NO_GO']
  );
  assert.equal(DECISION_STATE_LABEL.GO, 'Quyết định dự thầu');
  assert.equal(Object.isFrozen(DECISION_STATES), true);
  assert.equal(Object.isFrozen(DECISION_STATE_LABEL), true);
  assert.equal(normalizeDecisionState('go'), 'GO');
  assert.equal(normalizeDecisionState('NO_GO'), 'NO_GO');
  assert.equal(normalizeDecisionState('not-a-state'), 'NEW');
  assert.equal(normalizeDecisionState(null), 'NEW');
});

test('statusOf prefers an explicit status and otherwise derives the lifecycle', () => {
  assert.equal(statusOf(tender({ status: 'CLOSED', closeDate: dateAt(10) })), 'CLOSED');
  assert.equal(statusOf({ bidNo: 'BP2600000001', closeDate: dateAt(10) }), 'PLAN');
  assert.equal(statusOf({ notifyNo: 'IB2600000001', closeDate: null }), 'UNKNOWN');
  assert.equal(statusOf({ notifyNo: 'IB2600000001', closeDate: dateAt(0) }), 'OPEN');
  assert.equal(statusOf({ notifyNo: 'IB2600000001', closeDate: dateAt(-1) }), 'CLOSED');
});

test('decisionRank keeps every open tender ahead of the documented plan maximum', () => {
  const lowestOpen = tender({ score: 0, matched: false, closeDate: null });
  const highestPlan = tender({ status: 'PLAN', score: 100, matched: true, closeDate: null });

  assert.equal(decisionRank(lowestOpen), 400);
  assert.equal(decisionRank(highestPlan), 375);
  assert.ok(decisionRank(lowestOpen) > decisionRank(highestPlan));
});

test('decisionRank adds urgency only to open tenders and caps it at 45 points', () => {
  assert.equal(decisionRank(tender({ closeDate: dateAt(0) })), 445);
  assert.equal(decisionRank(tender({ closeDate: dateAt(30) })), 415);
  assert.equal(decisionRank(tender({ closeDate: dateAt(60) })), 400);
  assert.equal(decisionRank(tender({ status: 'PLAN', closeDate: dateAt(0) })), 240);
  assert.equal(decisionRank(tender({ status: 'OPEN', score: '70', matched: true, closeDate: dateAt(3) })), 547);
});

test('deadlineRank orders actionable groups and recent closed tenders as specified', () => {
  assert.equal(deadlineRank(tender({ closeDate: dateAt(2) })), 2);
  assert.equal(deadlineRank(tender({ closeDate: null })), 9999);
  assert.equal(deadlineRank(tender({ status: 'UNKNOWN' })), 10000);
  assert.equal(deadlineRank(tender({ status: 'PLAN' })), 20000);
  assert.equal(deadlineRank(tender({ status: 'CLOSED', closeDate: dateAt(-2) })), 30002);
  assert.ok(
    deadlineRank(tender({ status: 'CLOSED', closeDate: dateAt(-2) })) <
      deadlineRank(tender({ status: 'CLOSED', closeDate: dateAt(-20) }))
  );
});

test('compareTenders implements score, deadline, price, and decision ordering', () => {
  const highScore = tender({ score: 90, price: 10, closeDate: dateAt(8) });
  const lowScore = tender({ score: 60, price: 20, closeDate: dateAt(2) });

  assert.ok(compareTenders(highScore, lowScore, 'score') < 0);
  assert.ok(compareTenders(lowScore, highScore, 'deadline') < 0);
  assert.ok(compareTenders(lowScore, highScore, 'price') < 0);
  assert.ok(compareTenders(lowScore, highScore) > 0);

  const sameDeadlineLowScore = tender({ score: 50, closeDate: dateAt(2) });
  const sameDeadlineHighScore = tender({ score: 80, closeDate: dateAt(2) });
  assert.ok(compareTenders(sameDeadlineHighScore, sameDeadlineLowScore, 'deadline') < 0);
});

test('missingFields exempts plan deadlines but reports other absent decision data', () => {
  assert.deepEqual(
    missingFields(tender({ status: 'PLAN', closeDate: null })),
    []
  );
  assert.deepEqual(
    missingFields(tender({ price: 0, closeDate: null, location: '', investorName: '' })),
    ['Thiếu giá', 'Thiếu hạn nộp', 'Thiếu địa điểm', 'Thiếu chủ đầu tư']
  );
});

test('dataConfidence scores only sourced fields and assigns boundary labels', () => {
  assert.deepEqual(dataConfidence(tender()), {
    value: 100,
    level: 'GOOD',
    label: 'Dữ liệu tốt'
  });

  assert.deepEqual(
    dataConfidence(tender({
      status: 'PLAN',
      notifyNo: '',
      bidNo: 'BP2600000001',
      closeDate: null,
      investorName: '',
      detailUrl: ''
    })),
    { value: 74, level: 'FAIR', label: 'Dữ liệu khá' }
  );

  assert.deepEqual(dataConfidence({ status: 'UNKNOWN' }), {
    value: 0,
    level: 'CHECK',
    label: 'Cần xác minh'
  });

  assert.equal(dataConfidence(tender({ price: 0 })).value, 100, 'zero is present data even if unusable for missingFields');
  assert.equal(
    dataConfidence(tender({ detailUrl: 'https://evil.example/muasamcong.mpi.gov.vn/' })).value,
    86,
    'only the official e-GP origin earns source points'
  );
});

test('riskSignals reports verifiable deadline, missing-data, exclusion, and source risks', () => {
  const high = riskSignals(tender({ closeDate: dateAt(1) }));
  assert.deepEqual(high, [
    { code: 'DEADLINE', level: 'HIGH', label: 'Hạn nộp rất sát' }
  ]);

  assert.deepEqual(riskSignals(tender({ closeDate: dateAt(3) }))[0], {
    code: 'DEADLINE', level: 'MEDIUM', label: 'Còn không quá 3 ngày'
  });
  assert.deepEqual(riskSignals(tender({ closeDate: dateAt(-1) }))[0], {
    code: 'DEADLINE', level: 'HIGH', label: 'Đã quá hạn'
  });

  const risks = riskSignals(tender({
    price: null,
    closeDate: null,
    location: '',
    investorName: '',
    negHits: ['nội thất', 'phần mềm', 'văn phòng'],
    detailUrl: 'http://muasamcong.mpi.gov.vn/not-secure'
  }));
  assert.deepEqual(risks.map(({ code, level }) => [code, level]), [
    ['MISSING', 'HIGH'],
    ['EXCLUDED', 'MEDIUM'],
    ['SOURCE', 'HIGH']
  ]);
  assert.match(risks[1].label, /nội thất, phần mềm$/);
  assert.doesNotMatch(risks[1].label, /văn phòng/);
});

test('changeSignal tolerates absent logs and returns the latest recorded change', () => {
  assert.deepEqual(changeSignal({}), { count: 0, last: null, changed: false });
  assert.deepEqual(changeSignal({ changeLog: 'invalid' }), { count: 0, last: null, changed: false });

  const rows = [{ field: 'price' }, { field: 'closeDate' }];
  assert.deepEqual(changeSignal({ changeLog: rows }), {
    count: 2,
    last: rows[1],
    changed: true
  });
});

test('deadlineIcon maps each lifecycle to an unambiguous symbol', () => {
  assert.equal(deadlineIcon(tender({ status: 'OPEN' })), '⏳');
  assert.equal(deadlineIcon(tender({ status: 'CLOSED' })), '🔒');
  assert.equal(deadlineIcon(tender({ status: 'PLAN' })), '📋');
  assert.equal(deadlineIcon(tender({ status: 'UNKNOWN' })), '❓');
});

test('actionFor covers lifecycle overrides and every open-score threshold', () => {
  assert.deepEqual(actionFor(tender({ status: 'CLOSED', score: 100 })).label, 'Lưu tham khảo');
  assert.equal(actionFor(tender({ status: 'PLAN', score: 55 })).label, 'Theo dõi KHLCNT');
  assert.equal(actionFor(tender({ status: 'PLAN', score: 54 })).label, 'Chờ thêm tín hiệu');
  assert.equal(actionFor(tender({ status: 'UNKNOWN', score: 100 })).label, 'Kiểm tra hạn nộp');

  assert.equal(actionFor(tender({ score: 85, closeDate: dateAt(3) })).label, 'Xử lý ngay');
  assert.equal(actionFor(tender({ score: 85, closeDate: dateAt(4) })).label, 'Nghiên cứu ngay');
  assert.equal(actionFor(tender({ score: 70 })).label, 'Rất đáng xem');
  assert.equal(actionFor(tender({ score: 55 })).label, 'Sàng lọc thêm');
  assert.equal(actionFor(tender({ score: 54 })).label, 'Tham khảo');
});

test('fold and searchableText make Vietnamese tender metadata accent-insensitive', () => {
  assert.equal(fold('Đắk Lắk – CẦU CỐNG'), 'dak lak – cau cong');
  assert.equal(fold(null), '');

  const text = searchableText(tender({
    bidName: 'Kè chống sạt lở',
    projectName: 'Dự án Sông Bé',
    displayCode: 'IB-42',
    recommendation: 'Rất đáng xem',
    reasons: ['Đúng địa bàn']
  }));
  assert.match(text, /ke chong sat lo/);
  assert.match(text, /du an song be/);
  assert.match(text, /rat dang xem/);
  assert.match(text, /dung dia ban/);
});

test('filterAndSort combines filters, supports folded search, and does not mutate input', () => {
  const openMatch = tender({ bidName: 'Kè Đắk Lắk', score: 80, matched: true });
  const openUnmatched = tender({ bidName: 'Kè Đắk Lắk', score: 95, matched: false });
  const planMatch = tender({ bidName: 'Kè Đắk Lắk', status: 'PLAN', score: 100, matched: true });
  const lowMatch = tender({ bidName: 'Kè Đắk Lắk', score: 50, matched: true });
  const input = [planMatch, lowMatch, openUnmatched, openMatch];
  const originalOrder = input.slice();

  const result = filterAndSort(input, {
    onlyMatched: true,
    status: 'OPEN',
    minScore: 70,
    text: fold('Đắk Lắk'),
    sortBy: 'score'
  });

  assert.deepEqual(result, [openMatch]);
  assert.deepEqual(input, originalOrder);
  assert.notStrictEqual(result, input);
  assert.deepEqual(filterAndSort(null, {}), []);
});

test('decisionSignals summarizes only live opportunities where appropriate', () => {
  const best = tender({ bidName: 'Best', score: 80, closeDate: dateAt(2) });
  const urgent = tender({ bidName: 'Urgent', score: 70, closeDate: dateAt(3) });
  const plan = tender({ bidName: 'Plan', status: 'PLAN', score: 100, closeDate: null });
  const incomplete = tender({ bidName: 'Incomplete', status: 'UNKNOWN', location: '' });
  const closedIncomplete = tender({
    bidName: 'Closed', status: 'CLOSED', score: 100, price: null, location: ''
  });

  const signals = decisionSignals([plan, closedIncomplete, incomplete, urgent, best]);
  assert.equal(signals.best, best);
  assert.deepEqual(
    { urgent: signals.urgent, missing: signals.missing, plan: signals.plan, live: signals.live, total: signals.total },
    { urgent: 2, missing: 1, plan: 1, live: 4, total: 5 }
  );
  assert.deepEqual(decisionSignals([]), {
    best: null, urgent: 0, missing: 0, plan: 0, live: 0, total: 0
  });
});
