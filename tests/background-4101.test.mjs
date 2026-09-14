import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { DEFAULT_SETTINGS, normalizeCandidate } from '../lib/core.js';

const extension = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('background.js', extension), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', extension), 'utf8'));
const bindings = {};
const imports = [...source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/gm)];
for (const match of imports) {
  const exports = await import(new URL(match[2], extension));
  for (const spec of match[1].split(',')) {
    const [name, local = name] = spec.trim().split(/\s+as\s+/);
    assert.ok(name in exports, `actual import ${name}`);
    bindings[local] = exports[name];
  }
}
const executable = source.replace(/^import\s*\{[^}]+\}\s*from\s*['"][^'"]+['"];?/gm, '');
assert.doesNotMatch(executable, /^import\b/m);

function event() {
  const listeners = [];
  return { listeners, addListener(fn) { listeners.push(fn); }, removeListener(fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); } };
}

/** Execute the complete background source and its real imported rule modules.
 * Only Chrome I/O and network/catalog boundaries are fakes. No browser opens,
 * no notification is delivered, and every network attempt fails locally. */
async function harness(initial = {}, fixtures = {}) {
  let state = structuredClone(initial);
  const calls = { writes: [], downloads: [], notifications: [], fetch: [], queries: [], tabs: [], catalogs: [] };
  const alarms = new Map();
  const clone = value => structuredClone(value);
  const runtime = { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', getURL: p => `chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${p}`,
    getManifest: () => clone(manifest), onMessage: event(), onInstalled: event(), onStartup: event() };
  const chrome = { runtime, storage: { local: {
    async get(keys) {
      if (keys === undefined || keys === null) return clone(state);
      if (typeof keys === 'string') return clone({ [keys]: state[keys] });
      if (Array.isArray(keys)) return clone(Object.fromEntries(keys.map(k => [k, state[k]])));
      return clone(Object.fromEntries(Object.entries(keys).map(([k, fallback]) => [k, Object.hasOwn(state, k) ? state[k] : fallback])));
    },
    async set(patch) { calls.writes.push(clone(patch)); state = { ...state, ...clone(patch) }; },
    async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) delete state[k]; },
    async clear() { state = {}; }, async setAccessLevel() {}
  } },
  alarms: { onAlarm: event(), async get(name) { return clone(alarms.get(name)); }, async getAll() { return clone([...alarms.values()]); },
    async create(name, value) { alarms.set(name, { name, ...clone(value) }); }, async clear(name) { return alarms.delete(name); }, async clearAll() { alarms.clear(); } },
  notifications: { onClicked: event(), onButtonClicked: event(), async create(...args) { calls.notifications.push(clone(args)); return 'blocked-notification'; } },
  downloads: { async download(args) { calls.downloads.push(clone(args)); return calls.downloads.length; } },
  tabs: { onRemoved: event(), onUpdated: event(), async query() { return []; }, async get(id) { return { id, status: 'complete', url: 'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection' }; },
    async create(args) { calls.tabs.push(clone(args)); return { id: 77, ...args, status: 'complete' }; }, async update(id, args) { calls.tabs.push(clone(args)); return { id, ...args }; },
    async remove() {}, async sendMessage() { return { ok: true }; } }, commands: { onCommand: event() } };
  const failCatalog = async () => { calls.catalogs.push('blocked'); throw new Error('fixture catalog connection reset'); };
  const context = vm.createContext({ ...bindings, chrome, console, Date, URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, Blob,
    setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, crypto: webcrypto,
    btoa: value => Buffer.from(value, 'binary').toString('base64'), atob: value => Buffer.from(value, 'base64').toString('binary'),
    fetch: async (...args) => { calls.fetch.push(args.map(String)); throw new Error('All network disabled in integration tests'); },
    fetchAllAreas: failCatalog, fetchProvinces: failCatalog,
    fetchWards: async code=>{calls.catalogs.push(code);if(!Object.hasOwn(fixtures.wards||{},code))throw new Error('fixture ward unavailable');await new Promise(resolve=>setImmediate(resolve));return clone(fixtures.wards[code]);},
    __egress: async (tabId, payload) => { calls.queries.push(clone({ tabId, payload })); return { ok: true }; }
  });
  vm.runInContext(executable + '\nensureEgpSearchTab = async () => ({id:77,status:"complete"});\ndispatchLookupToTab = __egress;\nglobalThis.__flush = async () => { await storageQueue; };', context);
  await new Promise(resolve => setImmediate(resolve));
  await context.__flush();
  assert.equal(runtime.onMessage.listeners.length, 1);
  async function send(type, payload = {}, page = 'options.html', content = false) {
    const sender = content ? { id: runtime.id, url: 'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection', tab: { id: 77, url: 'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection' } }
      : { id: runtime.id, url: runtime.getURL(page) };
    let timer;
    try {
      return await Promise.race([new Promise(resolve => runtime.onMessage.listeners[0]({ type, payload: clone(payload) }, sender, value => resolve(clone(value)))),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`No reply to ${type}`)), 2500); })]);
    } finally { clearTimeout(timer); }
  }
  return { send, calls, alarms, context, get state() { return clone(state); },
    async alarm(name) { for (const fn of chrome.alarms.onAlarm.listeners) await fn({ name }); await context.__flush(); } };
}

const tender = () => ({ ...normalizeCandidate({ notifyNo:'IB2600000001',notifyVersion:'00',bidName:'Thi công kênh mương',bidPrice:3e9,investorName:'Ban QLDA',bidCloseDate:'2099-01-01T00:00:00Z' }), watchlisted:true });
const settings = extra => ({ ...structuredClone(DEFAULT_SETTINGS), ...extra });

const catalog={fetchedAt:new Date().toISOString(),provinces:[
 {code:'68',name:'Tỉnh Lâm Đồng',fold:'tinh lam dong'},
 {code:'703',name:'Tỉnh Lâm Đồng',fold:'tinh lam dong'},
 {code:'66',name:'Tỉnh Đắk Lắk',fold:'tinh dak lak'},
 {code:'38',name:'Tỉnh Thanh Hóa',fold:'tinh thanh hoa'},
 {code:'75',name:'Tỉnh Đồng Nai',fold:'tinh dong nai'}],wardsByProvince:{}};
const permissive=settings({minPrice:0,maxPrice:0,alertMinScore:1,telegramMinScore:1,requiredKeywords:[],requireConstruction:false,provinces:[],minScore:0});
const plan=(id,extra={})=>({planNo:`PL26000000${id}`,decisionDate:'2026-09-14T05:00:00Z',locations:[{provName:'Tỉnh Lâm Đồng',provCode:'68'}],investField:['XL'],bidName:['Thi công kênh mương'],bidPrice:[3e9],...extra});
const notice=(id,extra={})=>({notifyNo:`IB26000000${id}`,notifyVersion:'00',bidName:'Thi công kênh mương',bidPrice:3e9,investField:'XL',locations:[{provName:'Tỉnh Lâm Đồng',provCode:'68'}],bidCloseDate:'2099-01-01T00:00:00Z',...extra});
async function page(h,id,mode,records,index,total,totalPages,done=false,extra={}){
 const reply=await h.send('KQLCNT_RESULTS',{planId:id,mode,pageIndex:index,totalElements:total,totalPages,records,done,queryIndex:mode==='tbmt'?Number(h.state.activeRun?.qi||0):0,...extra},'',true);
 assert.equal(reply.ok,true,reply.message);return reply;
}
async function done(h,id,mode='tbmt') {return h.send('KQLCNT_DONE',{planId:id,mode,queryIndex:mode==='tbmt'?Number(h.state.activeRun?.qi||0):0,ok:true},'',true);}

test('4101 runtime rejects an unknown province catalog without broadening the search; cached provinces do not load wards',async()=>{
 for(const type of ['TBMT_SEARCH','PLAN_LOOKUP']){
  const bad=await harness({settings:permissive});
  assert.equal((await bad.send(type,{province:'Lâm Đồng'})).ok,false);
  assert.equal(bad.calls.queries.length,0);
  const good=await harness({settings:permissive,provinceCatalog:catalog});
  assert.equal((await good.send(type,{province:'Lâm Đồng'})).ok,true);
  assert.equal(good.calls.catalogs.length,0);
  assert.deepEqual(good.calls.queries[0].payload.query.filters.find(f=>f.fieldName==='locations.provCode').fieldValues,['68','703']);
 }
});

test('4101 plan gates enforce exact resolved provinces and per-child terms/prices, then export only matching children',async()=>{
 const h=await harness({settings:permissive,provinceCatalog:catalog});
 assert.equal((await h.send('PLAN_LOOKUP',{province:'Lâm Đồng, Đắk Lắk',mustKeywords:'"kênh mương"',excludeKeywords:'"phần mềm"',minPrice:1e8,maxPrice:4e8})).ok,true);
 const id=h.state.planLookup.id;
 await page(h,id,'khlcnt',[plan('01',{investField:['XL','TV'],bidName:['Thi công kênh mương','Tư vấn thiết kế kênh mương','Tư vấn giám sát kênh mương','Phần mềm kênh mương'],bidPrice:[8e9,2e8,3e8,2e8]})],0,1,1);
 await page(h,id,'khlcnt',[],1,1,1,true);
 assert.equal(h.state.planLookup.status,'SUCCESS');
 assert.equal(h.state.planLookup.plans[0].packages.length,2);
 assert.equal(h.state.planLookup.summary.totalValue,5e8);
 assert.equal((await h.send('EXPORT_PLANS_CSV')).ok,true);
 assert.equal(h.calls.downloads.length,1);
 const other=await harness({settings:permissive,provinceCatalog:catalog});
 await other.send('PLAN_LOOKUP',{province:'Tỉnh Thanh Hóa'});
 const oid=other.state.planLookup.id;
 await page(other,oid,'khlcnt',[plan('01'),plan('02',{locations:[{provName:'Tỉnh Thanh Hóa',provCode:'38'}]})],0,2,1);
 await page(other,oid,'khlcnt',[],1,2,1,true);
 assert.deepEqual(other.state.planLookup.plans.map(p=>p.planNo),['PL2600000002']);
 assert.equal(other.state.planLookup.coverage.outOfRange,1);
});

test('4101 plan pages are counted uniquely and missing dates are retained without contaminating summaries',async()=>{
 const h=await harness({settings:permissive,areas:catalog});
 await h.send('PLAN_LOOKUP',{province:'Lâm Đồng',fromDate:'2026-09-01',toDate:'2026-09-30'});
 const id=h.state.planLookup.id;
 await page(h,id,'khlcnt',[plan('01')],0,3,3);
 assert.equal((await page(h,id,'khlcnt',[plan('01')],0,3,3)).duplicate,true);
 await page(h,id,'khlcnt',[plan('02',{decisionDate:null,publicDate:null})],1,3,3);
 await page(h,id,'khlcnt',[plan('03')],2,3,3);
 await page(h,id,'khlcnt',[],3,3,3,true);
 const lookup=h.state.planLookup;
 assert.equal(lookup.status,'SUCCESS');assert.equal(lookup.coverage.complete,true);
 assert.equal(lookup.coverage.pagesRead,3);assert.equal(lookup.coverage.fetched,3);
 assert.equal(lookup.coverage.match,2);assert.equal(lookup.coverage.insufficient,1);
 assert.equal(lookup.dateUnknown,1);assert.equal(lookup.insufficientPlans[0].planNo,'PL2600000002');
 assert.equal(lookup.summary.packageCount,2);assert.equal(lookup.summary.totalValue,6e9);
});

test('4101 mixed child data states have disjoint plan coverage and separate retained missing-price packages',async()=>{
 const h=await harness({settings:permissive,areas:catalog});
 await h.send('PLAN_LOOKUP',{province:'Lâm Đồng',maxPrice:4e9});const id=h.state.planLookup.id;
 await page(h,id,'khlcnt',[plan('01',{bidName:['Thi công kênh A','Thi công kênh B'],bidPrice:[3e9,null]})],0,1,1);
 await page(h,id,'khlcnt',[],1,1,1,true);
 const lookup=h.state.planLookup;
 assert.equal(lookup.coverage.match,1);assert.equal(lookup.coverage.insufficient,0);
 assert.equal(lookup.insufficientPlans.length,1);assert.equal(lookup.unknownPrices,1);
 assert.equal(lookup.plans[0].packages.length,1);assert.equal(lookup.summary.totalValue,3e9);
});

test('4101 hard gates control stored match, counters, queued alerts, API coverage and per-run price snapshots',async()=>{
 const h=await harness({settings:permissive,areas:catalog});
 await h.send('TBMT_SEARCH',{province:'Lâm Đồng',maxPrice:5e9,category:'XL'});const id=h.state.activeRun.id;
 await page(h,id,'tbmt',[notice('11'),notice('12',{bidPrice:9e9,locations:[{provCode:'75',provName:'Tỉnh Đồng Nai'}]}),notice('13',{bidPrice:null})],0,3,1);
 let run=h.state.activeRun;
 assert.equal(run.matchCount,1);assert.equal(run.insufficientCount,1);assert.equal(run.outOfRangeCount,1);
 assert.equal(run.pendingAlerts.length,1);assert.equal(run.pendingMatches.length,1);
 assert.equal(h.state.tenders.filter(t=>t.matched).length,1);
 const originalKey=h.state.tenders.find(t=>t.notifyNo==='IB2600000011').key;
 await page(h,id,'tbmt',[],1,3,1,true);await done(h,id);
 assert.equal(h.state.runs[0].status,'SUCCESS');
 const publicState=await h.send('GET_SEARCH_STATE',{},'search.html');
 assert.equal(publicState.runs[0].coverage.complete,true);assert.equal(publicState.runs[0].coverage.insufficient,1);
 assert.equal(publicState.runs[0].resultStates[originalKey].price,3e9);
 await h.send('TBMT_SEARCH',{maxPrice:10e9,category:'XL'});const second=h.state.activeRun.id;
 await page(h,second,'tbmt',[notice('11',{bidPrice:8e9})],0,1,1);
 assert.equal(h.state.runs.find(r=>r.id===id).resultStates[originalKey].price,3e9);
 assert.equal(h.state.runs.find(r=>r.id===second).resultStates[originalKey].price,8e9);
 assert.equal((await h.send('EXPORT_CSV',{runId:id,keys:[originalKey]})).ok,true);
 assert.equal((await h.send('EXPORT_CSV',{runId:id,keys:['not-in-this-run']})).ok,false);
});

test('4101 overlapping pages cannot double-count matches or retain obsolete queued alerts',async()=>{
 const h=await harness({settings:permissive,areas:catalog});
 await h.send('TBMT_SEARCH',{maxPrice:5e9,category:'XL'});const id=h.state.activeRun.id;
 await page(h,id,'tbmt',[notice('11')],0,2,2);
 await page(h,id,'tbmt',[notice('11',{bidPrice:9e9})],1,2,2);
 const run=h.state.activeRun;
 assert.equal(run.captured,1);assert.equal(run.matchedCount,0);
 assert.equal(run.outOfRangeCount,1);assert.equal(run.pendingAlerts.length,0);assert.equal(run.pendingMatches.length,0);
});

test('4101 explicit missing pages, invalid schema, unknown totals, and invalid records can never finish SUCCESS',async()=>{
 for(const example of [
  {total:150,pages:3,records:[notice('11')]},
  {total:1,pages:1,records:[notice('11')],schemaIssue:true},
  {total:null,pages:null,records:[notice('11')]},
  {total:1,pages:1,records:[{id:'no-tender-code'}]}
 ]){
  const h=await harness({settings:permissive});await h.send('TBMT_SEARCH',{category:'XL'});const id=h.state.activeRun.id;
  await page(h,id,'tbmt',example.records,0,example.total,example.pages);
  await page(h,id,'tbmt',[],1,example.total,example.pages,true,{schemaIssue:example.schemaIssue});await done(h,id);
  assert.equal(h.state.runs[0].status,'PARTIAL',JSON.stringify(example));
  assert.equal(h.state.runs[0].coverage.complete,false);
 }
});

test('4101 explicit empty source is a valid completed result, distinct from an unavailable total',async()=>{
 const h=await harness({settings:permissive});await h.send('TBMT_SEARCH',{category:'XL'});const id=h.state.activeRun.id;
 await page(h,id,'tbmt',[],0,0,0);await page(h,id,'tbmt',[],1,0,0,true);await done(h,id);
 assert.equal(h.state.runs[0].status,'SUCCESS');assert.equal(h.state.runs[0].coverage.complete,true);
 assert.equal(h.state.runs[0].coverage.serverTotal,0);
});

test('4101 opening date absent is retained as insufficient and never enters the detail queue or matched count',async()=>{
 const h=await harness({settings:permissive});await h.send('BID_OPEN_SCAN',{fromDate:'2026-09-01',toDate:'2026-09-30',maxPackages:20});const id=h.state.bidOpenScan.id;
 await page(h,id,'bbmt-list',[notice('41')],0,1,1);
 const scan=h.state.bidOpenScan;
 assert.equal(scan.packages.length,0);assert.equal(scan.insufficientPackages.length,1);
 assert.equal(scan.dateUnknown,1);assert.equal(scan.coverage.match,0);assert.equal(scan.coverage.insufficient,1);
});

test('4101 backup preserves run criteria, result facts and coverage without queue/credentials',async()=>{
 const h=await harness({settings:permissive});await h.send('TBMT_SEARCH',{maxPrice:5e9,category:'XL'});const id=h.state.activeRun.id;
 await page(h,id,'tbmt',[notice('11',{bidPrice:null})],0,1,1);await page(h,id,'tbmt',[],1,1,1,true);await done(h,id);
 await h.send('EXPORT_BACKUP');const backup=JSON.parse(decodeURIComponent(h.calls.downloads.at(-1).url.split(',').slice(1).join(',')));
 assert.equal(backup.runs[0].coverage.insufficient,1);assert.equal(backup.runs[0].queue,undefined);
 const restored=await harness({settings:permissive});assert.equal((await restored.send('IMPORT_BACKUP',{data:backup})).ok,true);
 assert.equal(restored.state.tenders[0].matched,false);assert.equal(restored.state.runs[0].coverage.insufficient,1);
 assert.equal(Object.values(restored.state.runs[0].resultStates)[0].price,null);
});

test('4101 a multi-template run resets page acknowledgements and combines complete query coverage',async()=>{
 const template=id=>({id,name:id,url:'https://muasamcong.mpi.gov.vn/o/egp-portal-contractor-selection-v2/services/smart/search',method:'POST',body:JSON.stringify([{pageSize:50,pageNumber:0,query:[{filters:[]}]}])});
 const run={id:'multi-query-4101',mode:'manual',status:'RUNNING',tabId:77,startedAt:new Date().toISOString(),queue:[template('one'),template('two')],qi:0,foundKeys:[]};
 const h=await harness({settings:permissive});
 await h.context.chrome.storage.local.set({activeRun:run,runs:[run]});
 await page(h,run.id,'tbmt',[notice('51')],0,1,1);
 await page(h,run.id,'tbmt',[],1,1,1,true);await done(h,run.id);
 assert.equal(h.state.activeRun.qi,1);assert.deepEqual(h.state.activeRun.receivedPages,[]);
 const reply=await page(h,run.id,'tbmt',[notice('52')],0,1,1);
 assert.notEqual(reply.duplicate,true);
 await page(h,run.id,'tbmt',[],1,1,1,true);await done(h,run.id);
 assert.equal(h.state.activeRun,null);assert.equal(h.state.runs[0].status,'SUCCESS');
 assert.equal(h.state.runs[0].coverage.pagesRead,2);assert.equal(h.state.runs[0].coverage.totalPages,2);
 assert.equal(h.state.runs[0].coverage.fetched,2);assert.equal(h.state.runs[0].coverage.match,2);
});

test('4101 export of an earlier run contains its price snapshot and fails for unrelated keys',async()=>{
 const h=await harness({settings:permissive});
 await h.send('TBMT_SEARCH',{maxPrice:5e9,category:'XL'});const id=h.state.activeRun.id;
 await page(h,id,'tbmt',[notice('61')],0,1,1);await page(h,id,'tbmt',[],1,1,1,true);await done(h,id);
 const key=h.state.tenders[0].key;
 await h.send('TBMT_SEARCH',{maxPrice:10e9,category:'XL'});const second=h.state.activeRun.id;
 await page(h,second,'tbmt',[notice('61',{bidPrice:8e9})],0,1,1);
 await h.send('EXPORT_CSV',{runId:id,keys:[key]});
 const contents=Buffer.from(h.calls.downloads.at(-1).url.split(',')[1],'base64').toString('utf8');
 assert.match(contents,/<v>3000000000<\/v>/);assert.doesNotMatch(contents,/<v>8000000000<\/v>/);
 assert.match(contents,/Đối chiếu tiêu chí/);assert.match(contents,/Khớp tiêu chí/);
});

test('4101 package comparison exports respect the visible pending/followed checkbox scope',async()=>{
 const bidder=(taxCode,name)=>({taxCode,name,bidPrice:1e9,finalPrice:1e9});
 const bidScan={status:'SUCCESS',focusTaxCode:'0101234567',contractorQuery:'',packages:[
  {key:'one',notifyNoStand:'IB2600000071-00',bidName:'Gói thấy',bidders:[bidder('0101234567','Có theo dõi'),bidder('0101234568','Đối chiếu cùng gói')]},
  {key:'two',notifyNoStand:'IB2600000072-00',bidName:'Gói ẩn',bidders:[bidder('0101234569','Không theo dõi')]}
 ]};
 const h=await harness({settings:permissive,bidOpenScan:bidScan});
 assert.equal((await h.send('EXPORT_BID_OPEN_CSV',{onlyFollowed:true})).ok,true);
 const contents=Buffer.from(h.calls.downloads[0].url.split(',')[1],'base64').toString('utf8');
 assert.match(contents,/Có theo dõi/);assert.match(contents,/Đối chiếu cùng gói/);assert.doesNotMatch(contents,/Không theo dõi/);
 const ph=await harness({settings:permissive});await ph.send('PLAN_LOOKUP',{category:'XL'});const id=ph.state.planLookup.id;
 await page(ph,id,'khlcnt',[plan('71',{haveBidNotNotify:1}),plan('72',{haveBidNotNotify:0})],0,2,1);await page(ph,id,'khlcnt',[],1,2,1,true);
 assert.equal((await ph.send('EXPORT_PLANS_CSV',{onlyUnannounced:true})).ok,true);
 const plansXml=Buffer.from(ph.calls.downloads[0].url.split(',')[1],'base64').toString('utf8');
 assert.match(plansXml,/PL2600000071/);assert.doesNotMatch(plansXml,/PL2600000072/);
});

test('4101 ward options fetch only selected province codes, share in-flight requests, and reuse cache for search',async()=>{
 const fixtures={wards:{'68':[{code:'w68',name:'Xã Bảo Lộc',fold:'xa bao loc'}],'703':[{code:'w703',name:'Phường Bảo Lộc',fold:'phuong bao loc'}]}};
 const h=await harness({settings:permissive,provinceCatalog:catalog},fixtures);
 const provinceOnly=await h.send('AREA_OPTIONS',{});assert.equal(provinceOnly.ok,true);assert.equal(h.calls.catalogs.length,0);
 const responses=await Promise.all([h.send('AREA_OPTIONS',{province:'Lâm Đồng'}),h.send('AREA_OPTIONS',{province:'Lâm Đồng'})]);
 assert.equal(responses.every(r=>r.ok),true);assert.equal(responses[0].wards.length,2);
 assert.deepEqual([...h.calls.catalogs].sort(),['68','703']);
 assert.equal(h.state.areas,undefined);assert.deepEqual(Object.keys(h.state.wardCatalog).sort(),['68','703']);
 const start=await h.send('PLAN_LOOKUP',{province:'Lâm Đồng',ward:'Bảo Lộc'});assert.equal(start.ok,true,start.message);
 assert.deepEqual(h.state.planLookup.criteria.wards.sort(),['w68','w703']);assert.equal(h.calls.catalogs.length,2);
 const noMatch=await h.send('AREA_OPTIONS',{province:'Tỉnh'});assert.equal(noMatch.ok,false);assert.equal(h.calls.catalogs.length,2);
});

test('4101 missing one historical province ward catalog prevents a silently incomplete plan query',async()=>{
 const h=await harness({settings:permissive,provinceCatalog:catalog},{wards:{'68':[{code:'w68',name:'Xã Bảo Lộc',fold:'xa bao loc'}]}});
 const result=await h.send('PLAN_LOOKUP',{province:'Lâm Đồng',ward:'Bảo Lộc'});
 assert.equal(result.ok,false);assert.equal(h.calls.queries.length,0);assert.equal(h.state.planLookup??null,null);
 assert.deepEqual([...h.calls.catalogs].sort(),['68','703']);
});

test('4101 final-page acknowledgement is idempotent across terminal plan state and worker restart',async()=>{
 const h=await harness({settings:permissive});await h.send('PLAN_LOOKUP',{category:'XL'});const id=h.state.planLookup.id;
 await page(h,id,'khlcnt',[plan('81')],0,1,1);
 const payload={planId:id,mode:'khlcnt',queryIndex:0,pageIndex:1,totalElements:1,totalPages:1,records:[],done:true};
 assert.equal((await h.send('KQLCNT_RESULTS',payload,'',true)).ok,true);
 assert.equal(h.state.planLookup.status,'SUCCESS');assert.equal(h.state.planLookup.finalPageReceipt.queryIndex,0);
 // Simulate the browser not receiving the first acknowledgement, and retrying.
 const retry=await h.send('KQLCNT_RESULTS',payload,'',true);
 assert.equal(retry.ok,true);assert.equal(retry.duplicate,true);
 assert.equal(h.state.planLookup.serverCount,1);
 const restarted=await harness(h.state);
 assert.equal((await restarted.send('KQLCNT_RESULTS',payload,'',true)).duplicate,true);
 await restarted.send('KQLCNT_DONE',{planId:id,mode:'khlcnt',queryIndex:0,ok:true},'',true);
 assert.equal(restarted.state.planLookup.status,'SUCCESS');assert.equal(restarted.state.planLookup.coverage.complete,true);
 assert.equal(restarted.state.planLookup.finalPageReceipt.doneAcknowledged,true);
 const after=JSON.stringify(restarted.state.planLookup);
 assert.equal((await restarted.send('KQLCNT_RESULTS',{...payload,totalElements:2},'',true)).ok,false);
 await restarted.send('KQLCNT_DONE',{planId:id,mode:'khlcnt',queryIndex:0,ok:true},'',true);
 assert.equal(JSON.stringify(restarted.state.planLookup),after);
});

test('4101 retries from a previous query cannot finish, fail or add results to the next query',async()=>{
 const template=id=>({id,name:id,url:'https://muasamcong.mpi.gov.vn/o/egp-portal-contractor-selection-v2/services/smart/search',method:'POST',body:JSON.stringify([{pageSize:50,pageNumber:0,query:[{filters:[]}]}])});
 const run={id:'multi-final-ack-new',mode:'manual',status:'RUNNING',tabId:77,startedAt:new Date().toISOString(),queue:[template('one'),template('two')],qi:0,foundKeys:[]};
 const h=await harness({settings:permissive});await h.context.chrome.storage.local.set({activeRun:run,runs:[run]});
 await page(h,run.id,'tbmt',[notice('82')],0,1,1,false,{queryIndex:0});
 await page(h,run.id,'tbmt',[],1,1,1,true,{queryIndex:0});
 await h.send('KQLCNT_DONE',{planId:run.id,mode:'tbmt',queryIndex:0,ok:true},'',true);
 assert.equal(h.state.activeRun.qi,1);assert.equal(h.calls.queries[0].payload.queryIndex,1);
 assert.equal((await h.send('KQLCNT_RESULTS',{planId:run.id,mode:'tbmt',records:[notice('99')],pageIndex:0,totalElements:1,totalPages:1},'',true)).ok,false);
 for(const ok of [true,false])assert.equal((await h.send('KQLCNT_DONE',{planId:run.id,mode:'tbmt',queryIndex:0,ok},'',true)).ignored,true);
 assert.equal((await h.send('KQLCNT_RESULTS',{planId:run.id,mode:'tbmt',queryIndex:0,records:[],pageIndex:1,totalElements:1,totalPages:1,done:true},'',true)).ok,false);
 assert.equal(h.state.activeRun.qi,1);assert.equal(h.state.activeRun.pageDone,false);
 // Same-scope result is accepted; overlapping records in DIFFERENT queries are valid.
 await page(h,run.id,'tbmt',[notice('82')],0,1,1,false,{queryIndex:1});
 await page(h,run.id,'tbmt',[],1,1,1,true,{queryIndex:1});
 await h.send('KQLCNT_DONE',{planId:run.id,mode:'tbmt',queryIndex:1,ok:true},'',true);
 assert.equal(h.state.runs[0].status,'SUCCESS');assert.equal(h.state.runs[0].duplicateCount,0);
 assert.equal(h.state.runs[0].captured,1);assert.equal(h.state.runs[0].sourceCount,2);
});

test('4101 late query messages cannot resurrect an explicitly cancelled run',async()=>{
 const h=await harness({settings:permissive});await h.send('TBMT_SEARCH',{category:'XL'});const id=h.state.activeRun.id;
 await page(h,id,'tbmt',[notice('83')],0,1,1,false,{queryIndex:0});
 await page(h,id,'tbmt',[],1,1,1,true,{queryIndex:0});
 await h.send('CANCEL_ACTIVE_RUN',{runId:id});const saved=JSON.stringify(h.state.runs);
 await h.send('KQLCNT_DONE',{planId:id,mode:'tbmt',queryIndex:0,ok:true},'',true);
 assert.equal(h.state.activeRun,null);assert.equal(JSON.stringify(h.state.runs),saved);
 const reply=await h.send('KQLCNT_RESULTS',{planId:id,mode:'tbmt',queryIndex:0,records:[],pageIndex:1,totalElements:1,totalPages:1,done:true},'',true);
 assert.equal(reply.ok,false);assert.equal(JSON.stringify(h.state.runs),saved);
});

test('4101 overlapping source records in different pages are partial even when advertised row totals match',async()=>{
 for(const mode of ['tbmt','khlcnt','bbmt-list']){
  const h=await harness({settings:permissive});
  const start=mode==='tbmt'?'TBMT_SEARCH':mode==='khlcnt'?'PLAN_LOOKUP':'BID_OPEN_SCAN';
  await h.send(start,mode==='bbmt-list'?{fromDate:'2026-09-01',toDate:'2026-09-30'}:{category:'XL'});
  const key=mode==='tbmt'?'activeRun':mode==='khlcnt'?'planLookup':'bidOpenScan';const id=h.state[key].id;
  const first=mode==='khlcnt'?plan('84'):notice('84',{bidRealityOpenDate:'2026-09-14T05:00:00Z'});
  const second={...first,bidPrice:mode==='khlcnt'?[4e9]:4e9};
  await page(h,id,mode,[first],0,2,2);
  await page(h,id,mode,[second],1,2,2);
  assert.equal(h.state[key].duplicateCount,1,mode);
  assert.equal(h.state[key].coverage.complete,false,mode);
  assert.equal(h.state[key].partial,true,mode);
  if(mode!=='bbmt-list'){
   await page(h,id,mode,[],2,2,2,true);await done(h,id,mode);
   const final=mode==='tbmt'?h.state.runs[0]:h.state.planLookup;
   assert.equal(final.status,'PARTIAL',mode);assert.equal(final.coverage.fetched,2,mode);assert.equal(final.coverage.complete,false,mode);
  }
 }
});

test('4101 BBMT investor codes and code-only province metadata survive normalization before the central gate',async()=>{
 const h=await harness({settings:permissive,provinceCatalog:catalog});
 const started=await h.send('BID_OPEN_SCAN',{province:'Lâm Đồng',investor:'vn0101234567',fromDate:'2026-09-01',toDate:'2026-09-30'});
 assert.equal(started.ok,true,started.message);const id=h.state.bidOpenScan.id;
 await page(h,id,'bbmt-list',[notice('85',{locations:[{provCode:'68'}],investorCode:'vn0101234567',investorName:'Ban dự án',bidRealityOpenDate:'2026-09-14T05:00:00Z'})],0,1,1);
 assert.equal(h.state.bidOpenScan.packages.length,1);assert.equal(h.state.bidOpenScan.insufficientPackages.length,0);
 assert.equal(h.state.bidOpenScan.coverage.match,1);
});

test('4101 waitForTab catches completion emitted before the initial tab snapshot resolves',async()=>{
 const h=await harness({settings:permissive});const tabs=h.context.chrome.tabs;
 const updatedBefore=tabs.onUpdated.listeners.length,removedBefore=tabs.onRemoved.listeners.length;
 tabs.get=async id=>{
  // Chrome captured loading, then emits complete before the get() continuation.
  queueMicrotask(()=>{for(const listener of [...tabs.onUpdated.listeners])listener(id,{status:'complete'},{id,status:'complete'});});
  return {id,status:'loading'};
 };
 const result=await h.context.waitForTab(77,60);
 assert.equal(result.status,'complete');
 assert.equal(tabs.onUpdated.listeners.length,updatedBefore);assert.equal(tabs.onRemoved.listeners.length,removedBefore);
});

test('4101 waitForTab releases both listeners after ready, close, get failure and timeout',async()=>{
 for(const scenario of ['ready','closed','failure','sync-failure','timeout']){
  const h=await harness({settings:permissive});const tabs=h.context.chrome.tabs;
  const updatedBefore=tabs.onUpdated.listeners.length,removedBefore=tabs.onRemoved.listeners.length;
  tabs.get=async id=>{
   if(scenario==='failure')throw new Error('fixture tabs.get failed');
   if(scenario==='closed')queueMicrotask(()=>{for(const listener of [...tabs.onRemoved.listeners])listener(id,{isWindowClosing:false});});
   return {id,status:scenario==='ready'?'complete':'loading'};
  };
  if(scenario==='sync-failure')tabs.get=()=>{throw new Error('fixture tabs.get failed');};
  if(scenario==='ready')assert.equal((await h.context.waitForTab(77,30)).id,77);
  else await assert.rejects(h.context.waitForTab(77,30),scenario==='closed'?/đã bị đóng/:scenario.includes('failure')?/fixture tabs.get failed/:/Quá thời gian/);
  assert.equal(tabs.onUpdated.listeners.length,updatedBefore,scenario);assert.equal(tabs.onRemoved.listeners.length,removedBefore,scenario);
 }
});
