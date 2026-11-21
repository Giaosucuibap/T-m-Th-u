import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {compileQuery, matchesQuery} from '../GiaoSuCuiBap/lib/workspace.js';
import {filterAndSort, decisionRank, deadlineRank} from '../GiaoSuCuiBap/lib/decision.js';
import {createSearchIndex,selectIndexedRows} from '../GiaoSuCuiBap/lib/search-index.js';
import {createSearchStateRuntime} from '../GiaoSuCuiBap/lib/runtime-search-state.js';
import {createQueryRuntime,readQueryControlState} from '../GiaoSuCuiBap/lib/runtime-query.js';
import {createQueryCache} from '../GiaoSuCuiBap/lib/query-cache.js';

test('412 compiled local queries preserve Vietnamese, quoted AND terms, exclusions and numeric identifiers',()=>{
  const rows=['Xây dựng trường học Lâm Đồng IB2600534292','Tư vấn giám sát bệnh viện Lâm Đồng','Đường tỉnh 703 – Công ty 5801234567','Đức Trọng 7031'];
  for(const [query,expected] of [['"truong hoc" lam -benh',[0]],['-"bệnh viện"',[0,2,3]],['GIÁM SÁT',[1]],['5801234567',[2]],['703',[2,3]],['"Đức Trọng" -7031',[]],['', [0,1,2,3]],['-',[]]]) {
    const compiled=compileQuery(query);
    assert.deepEqual(rows.flatMap((text,i)=>compiled(text)?[i]:[]),expected,query);
    rows.forEach(text=>assert.equal(compiled(text),matchesQuery(text,query)));
  }
});

test('412 sort evaluates each closing date once, retains stable ties and refreshes across the exact deadline',t=>{
  let now=Date.parse('2026-09-24T03:00:00Z'), reads=0;
  t.mock.method(Date,'now',()=>now);
  const make=(key,closeDate,score=70,notifyNo=key)=>({key,notifyNo,score,matched:false,get closeDate(){reads++;return closeDate;}});
  const rows=[make('late','2026-09-25T03:00:00Z'),make('early','2026-09-24T03:00:00.001Z'),make('tie','2026-09-24T03:00:00.001Z'),make('unknown',null),make('plan','2026-09-24T03:00:00.001Z',100,''),make('closed','2026-09-24T03:00:00Z')];
  assert.deepEqual(filterAndSort(rows,{sortBy:'deadline'}).map(r=>r.key),['early','tie','late','unknown','plan','closed']);
  assert.equal(reads,rows.length);
  assert.equal(decisionRank(rows[4]),340);assert.equal(deadlineRank(rows[4]),20000);
  now++;
  assert.deepEqual(filterAndSort(rows,{status:'OPEN',sortBy:'deadline'}).map(r=>r.key),['late']);
  assert.deepEqual(filterAndSort(rows,{status:'CLOSED',sortBy:'deadline'}).map(r=>r.key),['early','tie','closed']);
});

test('412 filter reflects text, score and date edits without a stale record cache',()=>{
  const row={key:'a',notifyNo:'IB1',bidName:'Xây trường',score:80,closeDate:'2099-01-01'};
  assert.equal(filterAndSort([row],{text:'truong',status:'OPEN'}).length,1);
  row.bidName='Xây bệnh viện';assert.equal(filterAndSort([row],{text:'truong'}).length,0);
  row.closeDate='2020-01-01';assert.equal(filterAndSort([row],{text:'benh',status:'OPEN'}).length,0);
  row.score=20;assert.equal(filterAndSort([row],{minScore:50}).length,0);
});

test('412 sparse indexed selections preserve original order and latest duplicate without scanning every row',()=>{
  const rows=Array.from({length:1000},(_,i)=>({key:`k${i}`,provinceCode:i%2?'703':'68',closeDate:i%3?'2026-09-24':'2026-09-25'}));
  rows.push({...rows[7],price:999,provinceCode:'68'});
  const index=createSearchIndex(rows);let reads=0;
  index.rows=new Proxy(index.rows,{get(target,key,receiver){if(/^\d+$/.test(String(key)))reads++;return Reflect.get(target,key,receiver);}});
  assert.deepEqual(selectIndexedRows(index,{keys:['k999','k7','missing','k1','k7'],provinceCodes:['68']}).map(r=>[r.key,r.price]),[['k7',999]]);
  assert.equal(reads,0);
  const from=Date.parse('2026-09-23T17:00:00Z'),to=Date.parse('2026-09-24T16:59:59Z');
  for(const keys of [undefined,[],['k9','k7','k2','k501'],rows.slice(0,800).map(r=>r.key)]){
    const actual=selectIndexedRows(index,{keys,provinceCodes:['68'],closeFrom:from,closeTo:to});
    const expected=[...new Map(rows.map(r=>[r.key,r])).values()].filter(r=>(!keys||keys.includes(r.key))&&r.provinceCode==='68'&&r.closeDate==='2026-09-24');
    assert.deepEqual(actual,expected);
  }
});

test('412 hidden history snapshots are never traversed during a scoped result refresh',async()=>{
  const hidden=new Proxy({},{ownKeys(){throw Error('Hidden snapshot was traversed');}});
  const data={tenders:[{key:'a',notifyNo:'IB1'}],runs:[{id:'current',foundKeys:['a'],resultStates:{a:{filterState:'MATCH'}}},{id:'old',status:'SUCCESS',foundKeys:['hidden'],resultStates:hidden}]};
  const runtime=createSearchStateRuntime({storage:{get:async defaults=>({...defaults,...data})}});
  const result=await runtime.read({runId:'current'});
  assert.deepEqual(result.tenders.map(t=>t.key),['a']);
  assert.deepEqual(result.runs[1],{id:'old',status:'SUCCESS'});
  assert.equal(result.selectedRun.resultStates.a.filterState,'MATCH');
});

test('412 participation scope uses real notice or tender identity and never joins two missing notice numbers',async()=>{
  const data={tenders:[{key:'plan'},{key:'a',notifyNo:'IB1'}],runs:[{id:'r',foundKeys:['plan','a']}],participations:[{id:'unrelated',notifyNo:undefined},{id:'empty',notifyNo:''},{id:'by-notice',notifyNo:'IB1'},{id:'by-key',tenderKey:'plan'},{id:'wrong',notifyNo:'IB2'}]};
  const runtime=createSearchStateRuntime({storage:{get:async defaults=>({...defaults,...data})}});
  assert.deepEqual((await runtime.read({runId:'r'})).participations.map(r=>r.id),['by-notice','by-key']);
});

test('412 query control reads omit warehouse and attachments but read fresh RED/readOnly and every active job lock',async()=>{
  const calls=[],data={settings:{readOnlyMode:false},liveCanary:{status:'GREEN'},activeRun:null,planLookup:{id:'plan',status:'RUNNING',tabId:7},bidOpenScan:{status:'SCANNING',detailTabIds:[8,9]},tenders:['PRIVATE'],attachments:{secret:true}};
  const storage={get:async defaults=>{calls.push(Object.keys(defaults));return Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,data[k]??v]));}};
  const state=await readQueryControlState(storage);
  assert.equal(state.tenders,undefined);assert.equal(state.attachments,undefined);
  assert.deepEqual(calls[0].sort(),['settings','schemaHealth','liveCanary','activeRun','winnerLookup','planLookup','areaScan','investorScan','bidOpenScan'].sort());
  assert.equal(state.planLookup.tabId,7);assert.deepEqual(state.bidOpenScan.detailTabIds,[8,9]);
  const runtime=createQueryRuntime({getState:()=>readQueryControlState(storage),cryptoApi:webcrypto});
  await runtime.assertAllowed();data.liveCanary={status:'UNKNOWN',lastStructuralStatus:'RED'};
  await assert.rejects(runtime.assertAllowed(),/ĐỎ/);
  await runtime.assertAllowed({probe:true});data.settings.readOnlyMode=true;
  await assert.rejects(runtime.assertAllowed({probe:true}),/khóa/);
  assert.equal(calls.length,5);
});

test('412 cache lifetime starts when the native query starts and never extends the oldest page freshness',()=>{
  let now=1000;const cache=createQueryCache({now:()=>now,ttlMs:100});
  const pages=[{pageIndex:0,records:[{notifyNo:'IB1'}]},{pageIndex:1,done:true,partial:true,capped:true}];
  now=1050;assert.equal(cache.put('fresh',pages,{ok:true},{fetchedAt:1000}),true);
  assert.equal(cache.get('fresh').ageMs,50);assert.equal(cache.get('fresh').expiresAt,1100);
  now=1100;assert.equal(cache.get('fresh'),null);
  assert.equal(cache.put('slow',pages,{ok:true},{fetchedAt:1000}),false);
  assert.equal(cache.put('future',pages,{ok:true},{fetchedAt:1200}),false);
  assert.equal(cache.put('invalid',pages,{ok:true},{fetchedAt:NaN}),false);
});
