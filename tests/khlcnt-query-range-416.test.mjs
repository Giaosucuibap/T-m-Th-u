import test from 'node:test';
import assert from 'node:assert/strict';
import {dateRangeFrom,parseDate} from '../GiaoSuCuiBap/lib/core.js';
import {buildKhlcntQuery,buildKhlcntQueries,classifyPlansByCriteria,normalizeKhlcntPlan} from '../GiaoSuCuiBap/lib/khlcnt.js';
import {buildTbmtQuery,buildWardMarketQuery} from '../GiaoSuCuiBap/lib/kqlcnt.js';
import {buildBbmtQuery} from '../GiaoSuCuiBap/lib/bbmt.js';
import {queryHash} from '../GiaoSuCuiBap/lib/query-cache.js';
import {webcrypto} from 'node:crypto';

const frozen=dateRangeFrom({fromDate:'2026-07-07',toDate:'2026-10-05'});
const criteria={investor:'vn5800939408',category:'XL',provinces:['68','703'],dateRange:frozen,days:90};
const rangeOf=query=>query.filters.find(filter=>filter.searchType==='range'&&filter.fieldName==='bidCloseDate');
const make=(number,decisionDate,publicDate='2026-10-03T09:00:00')=>normalizeKhlcntPlan({id:'public-plan-'+number,planNo:'PL26000000'+String(number).padStart(2,'0'),
  name:'Kế hoạch kiểm thử biên ngày',planVersion:'00',procuringEntityName:'Ban Quản lý dự án đầu tư xây dựng số 1',
  procuringEntityCode:'vn5800939408',decisionDate,publicDate,locations:[{provCode:'703',provName:'Tỉnh Lâm Đồng'}],
  bidNamePlanNew:[{name:'Thi công kênh mương',bidPrice:1000000000,bidField:'XL'}],bidName:['Thi công kênh mương'],bidPrice:[1000000000]});

test('416 KHLCNT uses the native witnessed bidCloseDate alias and a conservative wall-clock window',()=>{
  const query=buildKhlcntQuery(criteria),range=rangeOf(query);
  assert.deepEqual(range,{fieldName:'bidCloseDate',searchType:'range',from:'2026-07-06T00:00:00Z',to:'2026-10-06T23:59:59.999Z'});
  assert.equal(query.filters.some(filter=>['decisionDate','publicDate'].includes(filter.fieldName)),false);
  assert.deepEqual(query.filters.find(filter=>filter.fieldName==='type').fieldValues,['es-plan-project-p']);
  assert.deepEqual(query.filters.find(filter=>filter.fieldName==='locations.provCode').fieldValues,['68','703']);
});

test('416 strict local approval gate removes calendar padding and preserves naive-VN and explicit-zone boundary approvals',()=>{
  const rows=[make(1,'2026-07-07T00:00:00'),make(2,'2026-07-06T17:00:00Z'),
    make(3,'2026-10-05T23:59:59.999'),make(4,'2026-10-05T16:59:59.999Z'),
    make(5,'2026-07-06T23:59:59.999'),make(6,'2026-10-06T00:00:00'),make(7,null)];
  const groups=classifyPlansByCriteria(rows,criteria);
  assert.deepEqual(groups.match.map(row=>row.planNo),rows.slice(0,4).map(row=>row.planNo));
  assert.deepEqual(groups.outOfRange.map(row=>row.planNo),rows.slice(4,6).map(row=>row.planNo));
  assert.equal(groups.insufficient.length,1);assert.equal(groups.insufficient[0].filterReason,'insufficient-date');
  assert.equal(parseDate('2026-07-07T00:00:00'),parseDate('2026-07-06T17:00:00Z'));
});

test('416 publication time never substitutes for approval time, including late publication in another year',()=>{
  const rows=[make(10,'2026-09-20T23:59:59','2027-02-01T09:00:00'),make(11,'2024-01-29T23:59:59','2026-09-20T09:00:00')];
  const groups=classifyPlansByCriteria(rows,criteria);
  assert.deepEqual(groups.match.map(row=>row.planNo),[rows[0].planNo]);assert.deepEqual(groups.outOfRange.map(row=>row.planNo),[rows[1].planNo]);
});

test('416 open date bounds stay open, reversed dates are normalized, and no time criterion emits no date filter',()=>{
  assert.equal(rangeOf(buildKhlcntQuery({})),undefined);
  assert.equal(rangeOf(buildKhlcntQuery({fromDate:'2026-07-07'})).to,null);
  assert.equal(rangeOf(buildKhlcntQuery({toDate:'2026-10-05'})).from,null);
  assert.deepEqual(rangeOf(buildKhlcntQuery({fromDate:'2026-10-05',toDate:'2026-07-07'})),rangeOf(buildKhlcntQuery({fromDate:'2026-07-07',toDate:'2026-10-05'})));
});

test('416 OR owners retain identical frozen calendar bounds, and the plan-only alias is never copied to notice modes',()=>{
  const queries=buildKhlcntQueries({...criteria,investor:'vn5800939408; vn3400456032'});
  assert.equal(queries.length,2);assert.deepEqual(rangeOf(queries[0]),rangeOf(queries[1]));
  for(const query of [buildTbmtQuery(criteria),buildBbmtQuery(criteria),buildWardMarketQuery(criteria)]){
    assert.equal(query.filters.some(filter=>filter.fieldName==='bidCloseDate'),false);
  }
});

test('416 cache identity includes the server date window and never replays a differently bounded query',async()=>{
  const base={mode:'khlcnt',pageSize:50,maxPages:0},one=buildKhlcntQuery(criteria);
  const two=buildKhlcntQuery({...criteria,dateRange:dateRangeFrom({fromDate:'2026-08-01',toDate:'2026-10-05'})});
  assert.notEqual(await queryHash({...base,query:one},webcrypto),await queryHash({...base,query:two},webcrypto));
});
