import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { openingTimeNotes } from '../lib/bbmt-labels.js';

const receipt = '2026-09-05T04:00:00Z', attempt = '2026-09-05T04:30:00Z';
test('Legacy timeout timestamps are attempts, never successful receipt labels', () => {
  assert.deepEqual(openingTimeNotes({ readState:'TIMEOUT', bidders:null, scannedAt:receipt }),
    [{label:'Lần thử gần nhất',at:receipt}]);
  assert.deepEqual(openingTimeNotes({ readState:'TIMEOUT', bidders:null, attemptedAt:attempt }),
    [{label:'Lần thử gần nhất',at:attempt}]);
  assert.deepEqual(openingTimeNotes({ readState:'PENDING', bidders:null }), []);
});
test('A failed refresh preserves the old table date and identifies the latest attempt', () => {
  assert.deepEqual(openingTimeNotes({ readState:'TIMEOUT', bidders:[{}], scannedAt:receipt, attemptedAt:attempt, staleTable:true }),
    [{label:'Bảng của lần đọc trước',at:receipt},{label:'Lần thử gần nhất',at:attempt}]);
  assert.deepEqual(openingTimeNotes({ readState:'OK', bidders:[{}], scannedAt:receipt }), [{label:'Đã đọc',at:receipt}]);
  assert.deepEqual(openingTimeNotes({ readState:'EMPTY', bidders:[], scannedAt:receipt }), [{label:'Đã nhận bảng rỗng',at:receipt}]);
  assert.deepEqual(openingTimeNotes({ readState:'OK', bidders:[{}], scannedAt:receipt, fromCache:true }), [{label:'Bản lưu gần đây',at:receipt}]);
});

const background = fs.readFileSync(new URL('../background.js', import.meta.url), 'utf8');
function sourceFunction(name) {
  const start = background.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `Function ${name} exists`);
  const tail = background.slice(start);
  const end = tail.search(/\r?\n}\r?\n/);
  assert.ok(end > 0, `Function ${name} ends`);
  return tail.slice(0, end) + '\n}';
}
test('Endpoint map replaces failure with latest success and keeps one entry per method/path', async () => {
  let state = {endpointMap:[]};
  const context = vm.createContext({
    KEYS:{endpointMap:'endpointMap'}, Date,
    withLock:fn=>fn(), getState:async()=>state,
    save:async patch=>{state={...state,...patch};}
  });
  vm.runInContext(sourceFunction('recordEndpointSeen'), context);
  const endpoint={path:'/o/test/public-table',method:'GET',status:403,kieu:'doi-tuong',soBanGhi:null,truong:['error'],luc:receipt};
  await context.recordEndpointSeen(endpoint);
  await context.recordEndpointSeen({...endpoint,status:200,kieu:'mang',soBanGhi:2,truong:['contractorName'],luc:attempt});
  assert.equal(state.endpointMap.length,1);
  assert.equal(state.endpointMap[0].status,200);
  assert.equal(state.endpointMap[0].soBanGhi,2);
  assert.equal(state.endpointMap[0].observedCount,2);
  assert.equal(state.endpointMap[0].firstSeenAt,receipt);
  assert.equal(state.endpointMap[0].luc,attempt);
  await context.recordEndpointSeen({...endpoint,method:'POST'});
  assert.equal(state.endpointMap.length,2);
  for(let n=0;n<100;n++) await context.recordEndpointSeen({...endpoint,path:'/o/test/'+n});
  assert.equal(state.endpointMap.length,80);
});
test('Unknown response row count survives the content boundary as unknown, not zero', () => {
  const context=vm.createContext({CONTENT_MAX_CHARS:{EGP_ENDPOINT_SEEN:64000}});
  for(const name of ['shortString','safeCount','assertObject','sanitizeContentPayload']) {
    vm.runInContext(sourceFunction(name),context);
  }
  assert.equal(context.sanitizeContentPayload('EGP_ENDPOINT_SEEN',{path:'/o/test',soBanGhi:null}).soBanGhi,null);
  assert.equal(context.sanitizeContentPayload('EGP_ENDPOINT_SEEN',{path:'/o/test',soBanGhi:0}).soBanGhi,0);
});
test('Real page hook reports repeated endpoint responses including changed status and shape', async () => {
  const messages=[],responses=[{status:403,data:{error:'fixture'}},{status:200,data:[{contractorName:'fixture'}]}];
  class FakeXHR { open(){} send(){} setRequestHeader(){} }
  const url='https://muasamcong.mpi.gov.vn/o/test/public-table';
  const window={postMessage:message=>messages.push(message),addEventListener(){},fetch:async()=>{
    const item=responses.shift();
    return {url,status:item.status,ok:item.status===200,clone:()=>({headers:new Headers({'content-type':'application/json'}),json:async()=>item.data})};
  }};
  const context=vm.createContext({window,location:{href:'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection',pathname:'/vi/web/guest/contractor-selection'},
    URL,URLSearchParams,Headers,Request,XMLHttpRequest:FakeXHR});
  vm.runInContext(fs.readFileSync(new URL('../page-hook.js',import.meta.url),'utf8'),context);
  await window.fetch(url);
  await new Promise(resolve=>setImmediate(resolve));
  await window.fetch(url);
  await new Promise(resolve=>setImmediate(resolve));
  const seen=messages.filter(m=>m.type==='EGP_ENDPOINT_SEEN');
  assert.equal(seen.length,2);
  assert.equal(seen[0].payload.status,403);
  assert.equal(seen[0].payload.soBanGhi,null);
  assert.equal(seen[1].payload.status,200);
  assert.equal(seen[1].payload.soBanGhi,1);
});
