import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeKhlcntPlan, classifyPlansByCriteria } from '../GiaoSuCuiBap/lib/khlcnt.js';

test('Multi-package search aggregates never attach an unrelated indexed price to a package name', () => {
  // The public PL2600333000 search shape captured on 05/10/2026 contains
  // independent aggregates. This is a regression fixture, not a live check.
  const row = { planNo: 'PL2600333000', planVersion: '00', id: 'f87391ba-3d03-4330-b623-2e817fe296c6',
    decisionDate: '2026-10-02T23:59:59', investField: ['TV','XL','PTV'],
    bidName: ['Số 14 - Lập phương án rà phá bom mìn, vật nổ', 'Số 15 - Thi công Rà phá bom mìn, vật nổ',
      'Số 17 - Thi công xây dựng công trình', 'Số 18 - Tư vấn giám sát thi công xây dựng công trình',
      'Số 19 - Bảo hiểm công trình', 'Số 16 - Giám sát thi công rà phá bom mìn, vật nổ'],
    bidPrice: [2223659215,6494920366,51197946,71728323,1788792936,744649682068] };
  const plan = normalizeKhlcntPlan(row);
  assert.equal(plan.sourceId, row.id);
  assert.ok(plan.packages.every(pkg => pkg.price === null && pkg.priceBindingPending));
  assert.equal(plan.packages[2].fieldCode, '');
  assert.equal(plan.totalPackagePrice, 0);
  const selected = classifyPlansByCriteria([plan], { category: 'XL' });
  assert.equal(selected.match.length, 0);
  assert.equal(selected.insufficient[0].packages.length, 6);
  assert.ok(selected.insufficient[0].packages.every(pkg => pkg.filterReasons.some(issue => issue.field === 'price')));
  assert.equal(classifyPlansByCriteria([plan], {}).match.length, 0);
});

test('An explicit package object owns its own price and sector regardless of aggregate order', () => {
  const plan = normalizeKhlcntPlan({ planNo: 'PL2600000001', investField: ['TV','XL'],
    bidName: ['Thi công','Giám sát'], bidPrice: [17,99],
    bidNamePlanNew: [{ name: 'Giám sát', investField: 'TV', bidPrice: 99 }, { name: 'Thi công', investField: 'XL', bidPrice: 17 }] });
  assert.deepEqual(plan.packages.map(pkg => [pkg.name,pkg.price,pkg.investField]), [['Giám sát',99,'TV'], ['Thi công',17,'XL']]);
  assert.ok(plan.packages.every(pkg => pkg.priceBindingPending === false));
  const selected = classifyPlansByCriteria([plan], { category: 'XL' });
  assert.equal(selected.match[0].packages[0].price, 17);
  assert.equal(selected.match[0].totalPackagePrice, 17);
});

test('A single package and single price remain uniquely bound; blanks do not shift multi-package prices', () => {
  const singleton = normalizeKhlcntPlan({ planNo: 'PL2600000001', investField: ['XL'], bidName: ['Gói số 1'], bidPrice: [123] });
  assert.equal(singleton.packages[0].price, 123);
  assert.equal(classifyPlansByCriteria([singleton], { category: 'XL' }).match.length, 1);
  const multi = normalizeKhlcntPlan({ planNo: 'PL2600000002', bidName: ['','Thi công'], bidPrice: [999,123] });
  assert.equal(multi.packages[0].price, null);
  assert.equal(multi.packages[0].priceBindingPending, true);
  const ownMissing = normalizeKhlcntPlan({ planNo: 'PL2600000003', bidNamePlanNew: [{name:'Gói số 1',bidPrice:null}], bidPrice:[123] });
  assert.equal(ownMissing.packages[0].price, null, 'An explicit missing child price must not be replaced with the aggregate');
});

test('An ambiguous package price never hides a definite date or owner mismatch', () => {
  const plan = normalizeKhlcntPlan({ planNo:'PL2600000001', decisionDate:'2023-06-14',
    investorName:'Khác chủ đầu tư', bidName:['Thi công A','Thi công B'], bidPrice:[1,2] });
  const selected = classifyPlansByCriteria([plan], { fromDate:'2026-07-07', toDate:'2026-10-05', investor:'Ban số 1' });
  assert.equal(selected.match.length, 0);
  assert.equal(selected.insufficient.length, 0);
  assert.equal(selected.outOfRange.length, 1);
});
