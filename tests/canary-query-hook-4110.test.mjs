import fs from 'node:fs'; import vm from 'node:vm'; import test from 'node:test'; import assert from 'node:assert/strict';
import { canaryQuery } from '../GiaoSuCuiBap/lib/live-canary.js';
const source = fs.readFileSync(new URL('../GiaoSuCuiBap/page-hook.js', import.meta.url), 'utf8');
const start = source.indexOf('  const PLAN_KEYS ='), end = source.indexOf('  // Tên trường phân trang', start);
assert.ok(start > 0 && end > start);
const c = vm.createContext({}); vm.runInContext(source.slice(start, end) + '\nthis.validate = validatedPlan;', c);
test('known IB canary follows its identity into online quotation without assuming steps1–4', () => {
  const query = canaryQuery({ id: 'IB2600534292', type: 'IB' });
  assert.ok(!query.filters.some(f => f.fieldName === 'stepCode'));
  assert.ok(c.validate({ id: 'canary-id', query, pageSize: 50, queryIndex: 0 }));
});
test('stage-independent hook permission is confined to one complete exact IB identity', () => {
  for (const patch of [{ keyWord: 'IB2600' }, { keyWord: 'IB2600534292*' }, { keyWord: 'gói thầu' }, { matchType: 'all-1' }, { matchFields: ['bidName'] }, { matchFields: ['notifyNo', 'bidName'] }, { keyWord: 'PL2600085770' }]) {
    assert.equal(c.validate({ id: 'canary-id', query: { ...canaryQuery({ id: 'IB2600534292', type: 'IB' }), ...patch }, pageSize: 50 }), null, JSON.stringify(patch));
  }
});
test('query allowlist still rejects arbitrary step filters, headers and secret fields', () => {
  const query = canaryQuery({ id: 'IB2600534292', type: 'IB' });
  for (const invalid of [{ ...query, headers: { authorization: 'secret' } }, { ...query, filters: [...query.filters, { fieldName: 'stepCode', searchType: 'in', fieldValues: ['unverified-stage'] }] }, { ...query, filters: [...query.filters, { fieldName: 'sessionToken', searchType: 'in', fieldValues: ['secret'] }] }]) assert.equal(c.validate({ id: 'canary-id', query: invalid, pageSize: 50 }), null);
});
