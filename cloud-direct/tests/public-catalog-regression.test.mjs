// Seven actual public catalog entries, recorded before the CI probe.
// This witness is independent of PROVINCES; it is not a synthetic tender row.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROVINCES, validateSourceQuery } from '../source-probe.mjs';

const witness = JSON.parse(readFileSync(new URL('./fixtures/public-area-2026-11-10.json', import.meta.url), 'utf8'));

test('configured option labels and same-name IDs agree with the recorded public catalog', () => {
  assert.equal(witness.areas.length, 7);
  for (const province of Object.values(PROVINCES)) {
    const current = witness.areas.find(row => row.code === province.currentCode);
    assert.ok(current, province.name);
    assert.equal(current.status, 1);
    assert.equal(province.label, current.name);
    const sameNameCodes = witness.areas.filter(row => row.name === current.name).map(row => row.code).sort();
    assert.deepEqual([...province.sourceCodes].sort(), sameNameCodes, province.name);
  }
  assert.deepEqual(witness.areas.find(row => row.code === '707'), { code: '707', name: 'Tỉnh Bình Phước', status: 0 });
  assert.deepEqual(witness.areas.find(row => row.code === '713'), { code: '713', name: 'Tỉnh Đồng Nai', status: 0 });
  assert.deepEqual(witness.areas.find(row => row.code === '75'), { code: '75', name: 'Thành phố Đồng Nai', status: 1 });
});

test('the old incorrect 75+707 Dong Nai scope cannot pass the current source-UI query gate', () => {
  const body = [{ pageNumber: 0, pageSize: 10, query: [{ index: 'es-contractor-selection', keyWord: '',
    matchFields: ['notifyNo', 'bidName'], filters: [
      { fieldName: 'type', searchType: 'in', fieldValues: ['es-notify-contractor'] },
      { fieldName: 'caseKHKQ', searchType: 'not_in', fieldValues: ['1'] },
      { fieldName: 'locations.provCode', searchType: 'in', fieldValues: ['75', '707'] }
    ] }] }];
  assert.equal(validateSourceQuery(body, 'dong_nai', { mode: 'all' }).code, 'SOURCE_PROVINCE_MISMATCH');
  body[0].query[0].filters[2].fieldValues = ['75'];
  assert.equal(validateSourceQuery(body, 'dong_nai', { mode: 'all' }).ok, true);
});
