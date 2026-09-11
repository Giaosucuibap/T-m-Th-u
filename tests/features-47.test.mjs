import test from 'node:test';
import assert from 'node:assert/strict';
import { contractMatrix, matrixSummary, HSMT_GATES } from '../lib/hsmt-matrix.js';
import { checklistDueItems, contractExpiryAlert } from '../lib/checklist-due.js';
import { coordsForCode, provinceCodeOf } from '../lib/province-codes.js';
import { tokenDiff, highlightDiff } from '../lib/html-diff.js';
import { applyApproval, approvalLabel } from '../lib/approval.js';
import { marketBidPercentiles } from '../lib/rivals.js';
import { buildChecklistPack, mergeChecklistPack } from '../lib/sync-pack.js';
import { methodOutline } from '../lib/method-outline.js';
import { placeOf } from '../lib/heatmap.js';

test('ma trận HĐ × cửa HSMT', () => {
  assert.equal(HSMT_GATES.length, 4);
  const rows = contractMatrix({ workType: 'thuy-loi', gates: { similar: 'dat', staff: 'thieu' } }, { workType: 'thuy-loi' });
  assert.equal(rows.find((r) => r.id === 'staff').status, 'thieu');
  assert.equal(matrixSummary(rows).level, 'thieu');
});

test('checklist đến hạn theo giờ còn lại', () => {
  const close = new Date(Date.now() + 20 * 36e5).toISOString();
  const due = checklistDueItems({ closeDate: close, bidName: 'A' }, { items: { hsmt: true } }, '');
  assert.ok(due.some((x) => x.id === 'baodam'));
  assert.ok(!due.some((x) => x.id === 'hsmt'));
});

test('HĐ tương tự cửa sổ 5 năm', () => {
  assert.equal(contractExpiryAlert({ year: 2018 }).level, 'het');
  assert.equal(contractExpiryAlert({ year: new Date().getFullYear() }).level, 'con');
});

test('bản đồ ưu tiên mã tỉnh e-GP 68', () => {
  assert.equal(provinceCodeOf({ provinceCode: '68' }), '68');
  const xy = coordsForCode('68');
  assert.ok(xy.lat > 11 && xy.lng > 108);
  const p = placeOf({ provinceCode: '68', location: '' });
  assert.equal(p.code, '68');
});

test('diff DOM highlight token thêm/bớt', () => {
  const d = tokenDiff('<div id="a" class="old">', '<div id="a" class="new el-pagination">');
  assert.ok(d.added.some((x) => x.includes('new') || x.includes('el-pagination')));
  assert.ok(highlightDiff(d).html.includes('ins') || highlightDiff(d).text.includes('+'));
});

test('duyệt Go hai người', () => {
  const a = applyApproval({ decisionState: 'REVIEW' }, 'An', 'GO');
  assert.equal(a.tender.decisionProposedBy, 'An');
  const same = applyApproval(a.tender, 'An', 'GO', 2);
  assert.equal(same.ok, false);
  const b = applyApproval(a.tender, 'Bình', 'GO', 2);
  assert.equal(b.ok, true);
  assert.equal(b.tender.decisionConfirmedBy, 'Bình');
  assert.ok(approvalLabel(b.tender).includes('duyệt'));
});

test('phân vị giá bỏ cùng CĐT', () => {
  const tenders = [{ key: 'IB1::00', notifyNo: 'IB1', investorName: 'Ban QLDA Lâm Đồng', location: 'Lâm Đồng' }];
  const parts = [8, 10, 12, 20].map((p) => ({ notifyNo: 'IB1', version: '00', bidPrice: p * 1e9, contractorName: 'X', taxCode: '1' }));
  const pct = marketBidPercentiles(parts, tenders, { investor: 'Ban QLDA Lâm Đồng' });
  assert.equal(pct.n, 4);
  assert.ok(pct.p25 <= pct.p50 && pct.p50 <= pct.p75);
});

test('gói JSON đồng bộ không nhận tệp lạ', () => {
  assert.equal(mergeChecklistPack({}, { foo: 1 }).ok, false);
  const pack = buildChecklistPack({
    settings: { operatorName: 'An' },
    checklists: { k1: { items: { hsmt: true }, owner: 'An', updatedAt: '2026-01-01' } },
    tenders: [{ key: 'k1', decisionState: 'GO', decisionOwner: 'An' }]
  });
  const m = mergeChecklistPack({ checklists: {}, tenders: [{ key: 'k1', decisionState: 'NEW' }] }, pack, 'Bình');
  assert.equal(m.ok, true);
  assert.equal(m.checklistCount, 1);
});

test('khung BPTC thủy lợi không bịa khối lượng', () => {
  const o = methodOutline({ bidName: 'Nạo vét kênh mương thủy lợi Lâm Đồng' }, { trades: ['thủy lợi'] });
  assert.ok(o.sections.length >= 8);
  assert.ok(/không điền khối lượng|không bịa/i.test(o.disclaimer));
  assert.equal(o.workType, 'thuy-loi');
});
