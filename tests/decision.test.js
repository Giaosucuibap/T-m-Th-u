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

/**
 * Vòng đời KHÔNG còn đọc từ trường `status` — `statusOf()` tính lại từ dữ liệu
 * mỗi lần đọc, vì trạng thái lưu lúc quét có thể đã cũ (xem bài "statusOf tính
 * lại từ hạn thực tế"). Nên muốn dựng một gói ở vòng đời nào thì phải dựng ĐÚNG
 * hình dạng dữ liệu sinh ra vòng đời đó, chứ không phải dán nhãn lên.
 *
 * Viết `tender({ status: 'PLAN' })` vẫn đọc được như cũ; hàm này quy nhãn ra
 * hình dạng, để tám bài kiểm thử phía dưới không phải sửa từng cái.
 */
function shapeFor(status) {
  switch (status) {
    // Chưa có mã TBMT = chưa mời thầu, bất kể ngày tháng.
    case 'PLAN':    return { notifyNo: '', bidNo: 'BP2600000001', closeDate: dateAt(10) };
    // Có mã TBMT nhưng không có hạn = chưa biết, không đoán.
    case 'UNKNOWN': return { notifyNo: 'IB2600000001', bidNo: '', closeDate: null };
    case 'CLOSED':  return { notifyNo: 'IB2600000001', bidNo: '', closeDate: dateAt(-1) };
    default:        return { notifyNo: 'IB2600000001', bidNo: '', closeDate: dateAt(10) };
  }
}

function tender(overrides = {}) {
  const { status, ...rest } = overrides;
  return {
    bidName: 'Xây dựng kênh thủy lợi',
    price: 5_000_000_000,
    location: 'Đắk Lắk',
    investorName: 'Ban quản lý dự án',
    detailUrl: 'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?x=1',
    score: 0,
    matched: false,
    reasons: [],
    negHits: [],
    ...shapeFor(status),
    ...rest
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

test('statusOf tính lại từ hạn thực tế, KHÔNG tin trạng thái đã lưu', () => {
  /* Bài này trước đây đòi ngược lại: `status` lưu sẵn phải thắng. Đã đổi, và
     đây là sửa lỗi chứ không phải nhượng bộ.

     `t.status` không bao giờ là tín hiệu riêng từ e-GP — chính normalizeTender()
     gán nó bằng bidStatus() lúc quét. Nên "ưu tiên trạng thái đã lưu" chỉ có
     một tác dụng duy nhất: ĐÓNG BĂNG một kết quả đã cũ. Gói quét tuần trước
     còn OPEN thì tuần này vẫn hiện OPEN, nằm nguyên ở đầu danh sách ưu tiên
     dù đã hết hạn nộp từ lâu. Tính lại mỗi lần đọc mới là đúng. */
  assert.equal(statusOf({ notifyNo: 'IB2600000001', status: 'CLOSED', closeDate: dateAt(10) }), 'OPEN',
    'hạn còn 10 ngày thì là ĐANG MỞ, bất kể nhãn cũ ghi gì');
  assert.equal(statusOf({ notifyNo: 'IB2600000001', status: 'OPEN', closeDate: dateAt(-1) }), 'CLOSED',
    'nhãn OPEN cũ không được giữ gói đã quá hạn ở lại');

  assert.equal(statusOf({ bidNo: 'BP2600000001', closeDate: dateAt(10) }), 'PLAN',
    'chưa có mã TBMT thì vẫn là kế hoạch, dù có ngày tháng gì');
  assert.equal(statusOf({ notifyNo: 'IB2600000001', closeDate: null }), 'UNKNOWN',
    'không có hạn thì nói CHƯA BIẾT, không đoán');

  // Biên: ĐÚNG khoảnh khắc hết hạn được tính là ĐÃ ĐÓNG. Hết giờ là hết giờ —
  // để nó còn "đang mở" thì phần mềm đang mời người ta nộp một hồ sơ vô hiệu.
  assert.equal(statusOf({ notifyNo: 'IB2600000001', closeDate: dateAt(0) }), 'CLOSED');
  assert.equal(statusOf({ notifyNo: 'IB2600000001', closeDate: dateAt(0.001) }), 'OPEN',
    'còn một chút thời gian thì vẫn là đang mở');
});

test('decisionRank giữ mọi gói đang mở trên mọi gói kế hoạch', () => {
  // Bất biến: gói ĐANG MỞ chấm 0 điểm vẫn phải đứng trên gói KẾ HOẠCH hoàn hảo.
  // Gói kế hoạch chưa nộp được; xếp nó lên đầu là mời người ta phí thời gian.
  const lowestOpen = { notifyNo: 'IB2600000001', closeDate: dateAt(60), score: 0, matched: false };
  const highestPlan = { bidNo: 'BP2600000001', closeDate: null, score: 100, matched: true };

  assert.equal(decisionRank(lowestOpen), 400);
  assert.equal(decisionRank(highestPlan), 375);
  assert.ok(decisionRank(lowestOpen) > decisionRank(highestPlan),
    'bất biến gãy: một gói kế hoạch đã vượt được gói đang mở');
});

test('decisionRank chỉ cộng điểm gấp cho gói đang mở, trần 45 điểm', () => {
  const open = (days, extra = {}) => ({ notifyNo: 'IB2600000001', closeDate: dateAt(days), score: 0, matched: false, ...extra });
  assert.equal(decisionRank(open(0.001)), 445, 'sắp hết hạn = gấp nhất');
  assert.equal(decisionRank(open(30)), 415);
  assert.equal(decisionRank(open(60)), 400, 'quá 45 ngày thì không cộng thêm nữa');
  assert.equal(decisionRank(open(3, { score: '70', matched: true })), 547);

  // Kế hoạch có "hạn" cũng không được cộng điểm gấp — chưa nộp được thì không gấp.
  assert.equal(decisionRank({ bidNo: 'BP2600000001', closeDate: dateAt(0), score: 0, matched: false }), 240);
});

test('deadlineRank orders actionable groups and recent closed tenders as specified', () => {
  assert.equal(deadlineRank(tender({ closeDate: dateAt(2) })), 2);
  // Không có hạn nộp CHÍNH LÀ vòng đời "chưa biết" — trước đây hai trường hợp
  // này xếp hai bậc khác nhau (9999 và 10000), nhưng từ khi vòng đời được tính
  // lại từ dữ liệu thì chúng là một. Hai bậc cho cùng một tình trạng là thừa.
  assert.equal(deadlineRank(tender({ closeDate: null })), 10000);
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
    missingFields(tender({ price: null, closeDate: null, location: '', investorName: '' })),
    ['Thiếu giá', 'Thiếu hạn nộp', 'Thiếu địa điểm', 'Thiếu chủ đầu tư']
  );

  // Giá BẰNG 0 khác với KHÔNG CÓ GIÁ. parseMoney() trả null khi e-GP không công
  // bố giá, và trả 0 chỉ khi e-GP thực sự gửi số 0. Báo "thiếu giá" cho một giá
  // trị e-GP có công bố là nói sai về dữ liệu nguồn.
  assert.equal(missingFields(tender({ price: 0 })).includes('Thiếu giá'), false);
  assert.equal(missingFields(tender({ price: null })).includes('Thiếu giá'), true);
});

test('dataConfidence scores only sourced fields and assigns boundary labels', () => {
  assert.deepEqual(dataConfidence(tender()), {
    value: 100,
    level: 'GOOD',
    label: 'Đủ trường chính'
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
    { value: 74, level: 'FAIR', label: 'Thiếu một số trường' }
  );

  assert.deepEqual(dataConfidence({ status: 'UNKNOWN' }), {
    value: 0,
    level: 'CHECK',
    label: 'Cần bổ sung dữ liệu'
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
  // Gói đã quá hạn KHÔNG sinh cảnh báo hạn nữa: nó không còn là rủi ro, nó đã
  // đóng, và vòng đời đã nói điều đó. Trước đây có nhãn 'Đã quá hạn' nhưng
  // nhánh sinh ra nó không đời nào chạy được — đã bỏ hẳn thay vì để code chết.
  assert.equal(riskSignals(tender({ closeDate: dateAt(-1) })).some((r) => r.code === 'DEADLINE'),
    false, 'gói đã đóng không được gắn cảnh báo hạn nộp');

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
