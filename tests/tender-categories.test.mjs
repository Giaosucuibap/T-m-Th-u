import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TENDER_CATEGORIES, normalizeCategory, categoryLabel, categoryField,
  inferTenderFieldFromName, tenderFieldOf, matchesTenderCategory
} from '../GiaoSuCuiBap/lib/tender-categories.js';

test('shared choices have stable IDs and consulting subtypes map only to TV', () => {
  assert.deepEqual(TENDER_CATEGORIES.map((c) => c.value), ['', 'XL', 'TV', 'TV_DESIGN', 'TV_SUPERVISION', 'TV_SURVEY', 'TV_APPRAISAL', 'TV_PROJECT_MANAGEMENT', 'HH', 'PTV', 'HON_HOP']);
  assert.equal(normalizeCategory(' tv_design '), 'TV_DESIGN');
  assert.equal(normalizeCategory('<script>'), '');
  assert.equal(normalizeCategory(null), '');
  assert.equal(categoryField('TV_SUPERVISION'), 'TV');
  assert.equal(categoryField('HON_HOP'), 'HON_HOP');
  assert.equal(categoryField(''), '');
  assert.equal(categoryLabel('XL'), 'Xây lắp');
  assert.equal(new Set(TENDER_CATEGORIES.map((c) => c.label)).size, TENDER_CATEGORIES.length);
});

test('exact source codes override both misleading names and conflicting display labels', () => {
  const supply = { investField: 'HH', fieldRaw: 'Tư vấn', bidName: 'Mua sắm camera giám sát, thiết kế theo yêu cầu' };
  assert.equal(matchesTenderCategory(supply, 'HH'), true);
  for (const category of ['TV', 'TV_DESIGN', 'TV_SUPERVISION', 'XL']) assert.equal(matchesTenderCategory(supply, category), false, category);
  assert.equal(matchesTenderCategory({ fieldRaw: 'TV', bidName: 'Sửa chữa trường học' }, 'TV'), true);
  assert.equal(matchesTenderCategory({ fieldRaw: 'TV', bidName: 'Sửa chữa trường học' }, 'XL'), false);
  assert.equal(matchesTenderCategory({ investFieldName: 'Tư vấn', bidField: 'XL', name: 'Thi công theo thiết kế' }, 'XL'), true);
  assert.equal(matchesTenderCategory({ field: 'HON_HOP', name: 'Thiết kế, cung cấp thiết bị và xây lắp' }, 'TV_DESIGN'), false);
});

test('precise Vietnamese field labels work with raw and normalized package aliases', () => {
  for (const key of ['bidName', 'notifyName', 'packageName', 'name', 'bidPackageName']) {
    assert.equal(matchesTenderCategory({ [key]: 'Tư vấn THIẾT KẾ bản vẽ thi công', fieldRaw: 'Tư vấn' }, 'TV_DESIGN'), true, key);
  }
  for (const label of ['Hàng hóa', 'Hàng hoá', 'HANG HOA']) assert.equal(matchesTenderCategory({ fieldRaw: label, name: 'Thiết bị trường học' }, 'HH'), true);
  assert.equal(matchesTenderCategory({ fieldLabel: 'Phi tư vấn', name: 'Dịch vụ hỗ trợ' }, 'PTV'), true);
  assert.equal(matchesTenderCategory({ fieldLabel: 'Phi tư vấn', name: 'Dịch vụ hỗ trợ' }, 'TV'), false);
});

test('name inference remains separate, conservative and limited to package names', () => {
  for (const [name, field] of [
    ['Gói số 01: Xây lắp tuyến đường', 'XL'],
    ['Tư vấn giám sát thi công xây dựng', 'TV'],
    ['Gói thầu số 02: Khảo sát địa hình', 'TV'],
    ['Mua sắm camera giám sát', 'HH'],
    ['Dịch vụ phi tư vấn', 'PTV'],
    ['Dịch vụ bảo hiểm công trình', 'PTV'],
    ['Thiết kế, mua sắm và xây dựng (EPC)', 'HON_HOP'],
    ['Gói thầu số 05', ''], ['Thuê hệ thống camera giám sát', '']
  ]) assert.equal(inferTenderFieldFromName(name), field, name);
  const unknown = { name: 'Gói thầu số 05', investorName: 'Ban Quản lý dự án', projectName: 'Xây dựng trường học', rawText: 'Lĩnh vực tư vấn thiết kế' };
  for (const category of TENDER_CATEGORIES.filter((c) => c.value)) assert.equal(matchesTenderCategory(unknown, category.value), false, category.value);
  assert.equal(matchesTenderCategory(unknown, ''), true);
  assert.equal(matchesTenderCategory(null, 'XL'), false);
});

test('Vietnamese accents, punctuation and combined consulting tasks match independently', () => {
  const combined = { investField: 'TV', bidName: 'Khảo sát; tư vấn thiết kế và giám sát thi công công trình' };
  for (const category of ['TV', 'TV_DESIGN', 'TV_SUPERVISION', 'TV_SURVEY']) assert.equal(matchesTenderCategory(combined, category), true, category);
  assert.equal(matchesTenderCategory(combined, 'TV_APPRAISAL'), false);
  assert.equal(matchesTenderCategory({ investField: 'TV', name: 'TU VAN THAM-DINH du toan' }, 'TV_APPRAISAL'), true);
  assert.equal(matchesTenderCategory({ field: 'TV', name: 'Tư vấn quản lý dự án đầu tư' }, 'TV_PROJECT_MANAGEMENT'), true);
  assert.equal(matchesTenderCategory({ field: 'TV', name: 'Tu van GIAM\u0020SA\u0301T thi cong' }, 'TV_SUPERVISION'), true);
});

test('word boundaries and object names do not turn unrelated tasks into consulting subtypes', () => {
  for (const [name, category] of [
    ['Tư vấn thiết kế trụ sở Ban quản lý dự án', 'TV_PROJECT_MANAGEMENT'],
    ['Tư vấn thiết kế hệ thống camera giám sát', 'TV_SUPERVISION'],
    ['Tư vấn thẩm tra thiết kế bản vẽ thi công', 'TV_DESIGN'],
    ['Tư vấn thẩm định hồ sơ thiết kế', 'TV_DESIGN'],
    ['Tư vấn phát triển phần mềm giamsat', 'TV_SUPERVISION'],
    ['Tư vấn tiền khảosát', 'TV_SURVEY'],
    ['Tư vấn bộ công cụ thiet keto', 'TV_DESIGN']
  ]) assert.equal(matchesTenderCategory({ field: 'TV', name }, category), false, name);
  assert.equal(matchesTenderCategory({ field: 'TV', name: 'Thẩm tra thiết kế hạng mục A và thiết kế hạng mục B' }, 'TV_DESIGN'), true);
  assert.equal(matchesTenderCategory({ name: 'Thi công lắp đặt hệ thống giám sát giao thông' }, 'TV_SUPERVISION'), false);
});

test('mixed plans are evaluated per child without borrowing plan-wide fields', () => {
  const plan = { name: 'Xây dựng trường học', fields: ['Xây lắp', 'Tư vấn'], investField: ['XL', 'TV'], packages: [
    { name: 'Xây lắp trường học', investField: 'XL' }, { name: 'Tư vấn giám sát thi công', investField: 'TV' }, { name: 'Gói thầu số 3' }
  ] };
  assert.equal(matchesTenderCategory(plan, 'XL'), false);
  assert.equal(matchesTenderCategory(plan, 'TV_SUPERVISION'), false);
  assert.deepEqual(plan.packages.filter((p) => matchesTenderCategory(p, 'XL')).map((p) => p.name), ['Xây lắp trường học']);
  assert.deepEqual(plan.packages.filter((p) => matchesTenderCategory(p, 'TV_SUPERVISION')).map((p) => p.name), ['Tư vấn giám sát thi công']);
  assert.equal(matchesTenderCategory({ ...plan.packages[2], fields: plan.fields }, 'XL'), false);
  assert.equal(matchesTenderCategory({ ...plan.packages[2], investField: plan.investField }, 'TV'), false);
  assert.equal(matchesTenderCategory({ bidName: ['Xây lắp trường học'], investField: ['XL'] }, 'XL'), false);
  assert.equal(matchesTenderCategory({ name: 'Gói thầu số 3', investField: ['TV'] }, 'TV'), true);
});

test('matching is pure and ignores inherited field metadata', () => {
  const item = Object.freeze({ name: 'Tư vấn khảo sát địa hình', field: 'TV' });
  assert.equal(matchesTenderCategory(item, 'TV_SURVEY'), true);
  assert.deepEqual(item, { name: 'Tư vấn khảo sát địa hình', field: 'TV' });
  const inherited = Object.assign(Object.create({ investField: 'XL' }), { name: 'Tư vấn khảo sát địa hình' });
  assert.equal(matchesTenderCategory(inherited, 'TV_SURVEY'), false);
});

test('field resolution exposes unclassified packages without inventing metadata', () => {
  assert.equal(tenderFieldOf({ name: 'Gói thầu số 3' }), '');
  assert.equal(tenderFieldOf(null), '');
  assert.equal(tenderFieldOf({ name: 'Tư vấn thiết kế', fieldCode: 'HH' }), 'HH');
  assert.equal(tenderFieldOf({ name: 'Tư vấn thiết kế' }), '');
  assert.equal(tenderFieldOf({ name: 'Thi công trường học', packages: [{ name: 'Thi công' }], investField: 'XL' }), '');
});

test('observed native singleton-array notice remains classifiable before normalization', () => {
  // Public record observed in the fixture-free Chrome run, 2026-09-07.
  const record = {planNo: 'PL2600271824', bidName: ['Gói thầu số 01: Toàn bộ chi phí xây dựng'],
    bidPrice: [2646341557], investField: ['XL'], bidField: 'XL', notifyNo: 'IB2600486024',
    notifyVersion: '00', stepCode: 'notify-contractor-step-2-kqmt'};
  assert.equal(tenderFieldOf(record), 'XL');
  assert.equal(matchesTenderCategory(record, 'XL'), true);
  assert.equal(matchesTenderCategory(record, 'TV'), false);
  assert.deepEqual(record.bidName, ['Gói thầu số 01: Toàn bộ chi phí xây dựng']);
});

test('array-shaped notice names match consulting specialties with source-field precedence', () => {
  const record = {notifyNo: 'IB2699980001', bidName: ['Tư vấn thiết kế và giám sát thi công'], investField: ['TV']};
  for (const category of ['TV', 'TV_DESIGN', 'TV_SUPERVISION']) assert.equal(matchesTenderCategory(record, category), true, category);
  assert.equal(matchesTenderCategory({...record, investField: ['HH']}, 'TV_SUPERVISION'), false);
  assert.equal(matchesTenderCategory({notifyId: '593d55c5-27d5-44bf-b3d1-47665fca4e7a', bidName: ['Tư vấn khảo sát'], investField: ['TV']}, 'TV_SURVEY'), true);
  assert.equal(matchesTenderCategory({type: 'es-notify-contractor', bidName: ['Tư vấn khảo sát'], investField: ['TV']}, 'TV_SURVEY'), true);
});

test('notice-array support never turns a whole plan or multiple names into one classified package', () => {
  const record = {notifyNo: 'IB2699980001', bidName: ['Tư vấn giám sát'], investField: ['TV']};
  for (const plan of [
    {...record, packages: [{name: 'Tư vấn giám sát'}]},
    {...record, type: 'es-plan-project-p'},
    {...record, stepCode: 'plan-step-1'},
    {...record, bidName: ['Tư vấn giám sát', 'Thi công xây dựng']},
    {planNo: 'PL2600085770', bidName: ['Tư vấn giám sát'], investField: ['TV']},
    {notifyNo: 'undefined', notifyId: 'undefined', bidName: ['Tư vấn giám sát'], investField: ['TV']}
  ]) {
    assert.equal(tenderFieldOf(plan), '', JSON.stringify(plan));
    assert.equal(matchesTenderCategory(plan, 'TV_SUPERVISION'), false, JSON.stringify(plan));
  }
});
