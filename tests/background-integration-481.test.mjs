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
async function harness(initial = {}) {
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
  return { send, calls, alarms, get state() { return clone(state); },
    async alarm(name) { for (const fn of chrome.alarms.onAlarm.listeners) await fn({ name }); await context.__flush(); } };
}

const tender = () => ({ ...normalizeCandidate({ notifyNo:'IB2600000001',notifyVersion:'00',bidName:'Thi công kênh mương',bidPrice:3e9,investorName:'Ban QLDA',bidCloseDate:'2099-01-01T00:00:00Z' }), watchlisted:true });
const settings = extra => ({ ...structuredClone(DEFAULT_SETTINGS), ...extra });

test('4.8.1 runtime settings retain omitted or masked secrets, clear explicit blanks, and return only masked settings', async () => {
  const h = await harness({settings:settings({telegramBotToken:'TOKEN_X',telegramChatId:'CHAT_X',webhookSecret:'SIGN_X'})});
  const saved = await h.send('UPDATE_SETTINGS',{operatorName:'An'});
  assert.equal(saved.ok,true);
  assert.equal(h.state.settings.telegramBotToken,'TOKEN_X');
  assert.equal(h.state.settings.webhookSecret,'SIGN_X');
  assert.doesNotMatch(JSON.stringify(saved),/TOKEN_X|CHAT_X|SIGN_X/);
  await h.send('UPDATE_SETTINGS',{telegramBotToken:'••••',telegramChatId:'••••',webhookSecret:'••••'});
  assert.equal(h.state.settings.telegramChatId,'CHAT_X');
  const denied = await h.send('GET_PRIVATE_SETTINGS',{},'search.html');
  assert.equal(denied.ok,false);
  const state = await h.send('GET_STATE',{},'search.html');
  assert.doesNotMatch(JSON.stringify(state),/TOKEN_X|CHAT_X|SIGN_X/);
  const privateSettings = await h.send('GET_PRIVATE_SETTINGS');
  assert.equal(privateSettings.settings.telegramBotToken,'TOKEN_X');
  await h.send('UPDATE_SETTINGS',{telegramBotToken:'',telegramChatId:'',webhookSecret:''});
  assert.equal(h.state.settings.telegramBotToken,'');
  assert.equal(h.state.settings.telegramChatId,'');
  assert.equal(h.state.settings.webhookSecret,'');
  assert.equal(h.calls.fetch.length,0);
});

test('4.8.1 real EXPORT_BACKUP and IMPORT_BACKUP round-trip the extended workspace with automation disabled', async () => {
  const row = {...tender(),decisionState:'GO',decisionProposedBy:'An',decisionTechBy:'Bình',decisionConfirmedBy:'Chi',
    decisionProposedAt:'2026-09-01T00:00:00Z',lifecycle:{noticeSeenAt:'2026-09-01T00:00:00Z',revisions:1}};
  const h = await harness({settings:settings({autoScan:true,telegramEnabled:true,telegramBotToken:'TOKEN_X',telegramChatId:'CHAT_X',webhookSecret:'SIGN_X',
      capability:{trades:['kênh mương'],staff:[],equipment:[],avoidProvinces:[],maxComfortPrice:4e9,notes:'Năng lực đã khai'}}),
    tenders:[row],savedSearches:[{id:'s',name:'Lọc kênh',criteria:{mustKeywords:'kênh',category:'XL'}}],
    hunts:[{id:'h',name:'Lâm Đồng',enabled:true,telegram:true,telegramChatId:'CHAT_X',criteria:{province:'Lâm Đồng'}}],
    watchedInvestors:[{id:'w',name:'Ban QLDA'}],checklists:{[row.key]:{items:{hsmt:true},owner:'An',updatedAt:'2026-09-01T00:00:00Z'}},
    pastContracts:[{id:'c',name:'Thi công kênh tương tự',price:2e9,year:2025,gates:{similar:'dat'}}],
    amendmentLog:[{key:row.key,field:'version',before:'00',after:'01'}],auditLog:[{kind:'checklist',operator:'An',detail:'Đã đọc hồ sơ'}]});
  assert.equal((await h.send('EXPORT_BACKUP')).ok,true);
  assert.equal(h.calls.downloads.length,1);
  const data = JSON.parse(decodeURIComponent(h.calls.downloads[0].url.split(',').slice(1).join(',')));
  assert.doesNotMatch(JSON.stringify(data),/TOKEN_X|CHAT_X|SIGN_X/);
  const restored = await harness({settings:settings({})});
  const result = await restored.send('IMPORT_BACKUP',{data});
  assert.equal(result.ok,true);
  const s = restored.state;
  assert.equal(s.tenders[0].decisionTechBy,'Bình');
  assert.equal(s.tenders[0].lifecycle.revisions,1);
  assert.equal(s.checklists[row.key].items.hsmt,true);
  assert.equal(s.pastContracts.length,1);
  assert.equal(s.watchedInvestors.length,1);
  assert.equal(s.amendmentLog[0].field,'version');
  assert.equal(s.auditLog[0].operator,'An');
  assert.equal(s.savedSearches[0].criteria.mustKeywords,'kênh');
  assert.equal(s.hunts[0].enabled,false);
  assert.equal(s.hunts[0].telegram,false);
  assert.equal(s.settings.autoScan,false);
  assert.equal(s.settings.telegramEnabled,false);
  assert.deepEqual(s.settings.capability.trades,['kênh mương']);
  assert.equal(restored.calls.queries.length,0);
  assert.equal(restored.calls.fetch.length,0);
});

test('4.8.1 read-only runtime blocks writes, imports and a non-options unlock without altering storage', async () => {
  const h = await harness({settings:settings({readOnlyMode:true}),tenders:[tender()]});
  const before = JSON.stringify(h.state);
  for (const [type,payload] of [['SET_WATCH',{key:tender().key,value:false}],['SET_DECISION',{key:tender().key,state:'GO'}],
    ['IMPORT_BACKUP',{data:{tenders:[]}}],['IMPORT_SYNC_PACK',{pack:{}}],['SAVE_CHECKLIST',{key:tender().key,items:{hsmt:true}}],
    ['RUN_HUNT',{id:'x'}],['TBMT_SEARCH',{category:'XL'}],['PLAN_LOOKUP',{category:'TV'}],['CLEAR_DATA',{}]]) {
    const reply = await h.send(type,payload,'search.html');
    assert.equal(reply.ok,false,type);
  }
  assert.equal((await h.send('UPDATE_SETTINGS',{readOnlyMode:false},'search.html')).ok,false);
  assert.equal(JSON.stringify(h.state),before);
  assert.equal((await h.send('GET_SEARCH_STATE',{},'search.html')).ok,true);
  assert.equal((await h.send('UPDATE_SETTINGS',{readOnlyMode:false},'options.html')).ok,true);
  assert.equal(h.state.settings.readOnlyMode,false);
});

test('4.8.1 read-only daily, hunt and deadline alarms cannot scan, send or mutate the workspace', async () => {
  const h = await harness({settings:settings({readOnlyMode:true,autoScan:true,telegramEnabled:true}),tenders:[tender()],
    searchTemplate:{id:'template',url:'https://muasamcong.mpi.gov.vn/fixture',body:'[]'},
    hunts:[{id:'h',name:'Giám sát',enabled:true,criteria:{category:'TV_SUPERVISION'}}]});
  const before = JSON.stringify(h.state), writeCount = h.calls.writes.length;
  await h.alarm('gscb-daily');
  await h.alarm('gscb-hunt:h:06:05');
  await h.alarm('gscb-deadlines');
  assert.equal(JSON.stringify(h.state),before);
  assert.equal(h.calls.writes.length,writeCount);
  assert.equal(h.calls.notifications.length,0);
  assert.equal(h.calls.queries.length,0);
  assert.equal(h.calls.tabs.length,0);
  assert.equal(h.calls.fetch.length,0);
});

test('4.8.1 province catalogue failure prevents both TBMT and plan searches from broadening nationwide', async () => {
  for (const type of ['TBMT_SEARCH','PLAN_LOOKUP']) {
    const h = await harness({settings:settings({})});
    const reply = await h.send(type,{province:'Lâm Đồng, Đắk Lắk',category:'TV'});
    assert.equal(reply.ok,false,type);
    assert.ok(h.calls.catalogs.length>0,type);
    assert.equal(h.calls.queries.length,0,type);
    assert.equal(h.state.activeRun ?? null,null,type);
    assert.equal(h.state.planLookup ?? null,null,type);
  }
});

test('4.8.1 plan runtime applies saved local terms and per-package prices through the actual content-message router', async () => {
  const h = await harness({settings:settings({}),areas:{fetchedAt:new Date().toISOString(),provinces:[
    {code:'68',name:'Tỉnh Lâm Đồng',fold:'tinh lam dong'},{code:'66',name:'Tỉnh Đắk Lắk',fold:'tinh dak lak'}],wardsByProvince:{}}});
  const started = await h.send('PLAN_LOOKUP',{province:'Lâm Đồng, Đắk Lắk',mustKeywords:'"kênh mương"',excludeKeywords:'"phần mềm"',minPrice:1e8,maxPrice:4e8});
  assert.equal(started.ok,true,started.message);
  const job = h.state.planLookup;
  assert.equal(job.criteria.mustKeywords,'"kênh mương"');
  assert.equal(job.criteria.maxPrice,4e8);
  assert.deepEqual(h.calls.queries[0].payload.query.filters.find(f=>f.fieldName==='locations.provCode').fieldValues,['68','66']);
  const record = {planNo:'PL2600000001',locations:[{provName:'Tỉnh Lâm Đồng'}],investField:['XL','TV'],
    bidName:['Thi công kênh mương','Tư vấn thiết kế kênh mương','Tư vấn giám sát kênh mương','Phần mềm kênh mương'],bidPrice:[8e9,2e8,3e8,2e8]};
  const page = await h.send('KQLCNT_RESULTS',{planId:job.id,mode:'khlcnt',pageIndex:0,totalElements:1,totalPages:1,records:[record]},'',true);
  assert.equal(page.ok,true,page.message);
  const done = await h.send('KQLCNT_RESULTS',{planId:job.id,mode:'khlcnt',pageIndex:1,totalElements:1,totalPages:1,records:[],done:true},'',true);
  assert.equal(done.ok,true,done.message);
  const lookup = h.state.planLookup;
  assert.equal(lookup.status,'SUCCESS');
  assert.equal(lookup.plans.length,1);
  assert.equal(lookup.plans[0].packages.length,2);
  assert.equal(lookup.plans[0].totalPackagePrice,5e8);
  assert.equal(lookup.plans[0].originalTotalPackagePrice,8.7e9);
  assert.equal(lookup.summary.packageCount,2);
  assert.equal(lookup.summary.totalValue,5e8);
  assert.equal(lookup.mismatched.length,0);
});

test('4.8.1 decision replies match stored state across approval and subsequent non-Go changes', async () => {
  const row=tender(), h=await harness({settings:settings({approvalSteps:3,operatorName:'An'}),tenders:[row]});
  for (const operator of ['An','Bình','Chi']) {
    assert.equal((await h.send('UPDATE_SETTINGS',{operatorName:operator})).ok,true);
    const reply=await h.send('SET_DECISION',{key:row.key,state:'GO'});
    assert.equal(reply.ok,true,reply.message);
    assert.equal(reply.state,h.state.tenders[0].decisionState);
  }
  assert.equal(h.state.tenders[0].decisionConfirmedBy,'Chi');
  const reply=await h.send('SET_DECISION',{key:row.key,state:'REVIEW',force:true});
  assert.equal(reply.ok,true,reply.message);
  assert.equal(reply.state,'REVIEW');
  assert.equal(h.state.tenders[0].decisionState,'REVIEW');
  assert.equal(h.state.tenders[0].decisionConfirmedBy,'');
});

test('4.8.1 actual capture carries tracking to a new version while requiring a fresh decision and checklist review', async () => {
  const old={...tender(),decisionState:'GO',decisionOwner:'An',decisionNote:'Theo dõi',decisionProposedBy:'An',decisionTechBy:'Bình',decisionConfirmedBy:'Chi',
    decisionDirectorBy:'Chi',decisionDirectorAt:'2026-09-01T00:00:00Z',lifecycle:{noticeSeenAt:'2026-09-01T00:00:00Z'},
    changeLog:Array.from({length:20},(_,i)=>({field:'price',before:i,after:i+1,at:`2026-08-${String(i+1).padStart(2,'0')}T00:00:00Z`}))};
  const h=await harness({settings:settings({}),tenders:[old],checklists:{[old.key]:{owner:'An',items:{hsmt:true,nop:true}}}});
  const reply=await h.send('INGEST_CAPTURE',{records:[{notifyNo:old.notifyNo,notifyVersion:'01',bidName:'Thi công kênh mương điều chỉnh',bidPrice:3e9}],
    meta:{sourcePageUrl:'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection',capturedAt:'2026-09-11T10:00:00Z',captureType:'fixture'}},'',true);
  assert.equal(reply.ok,true,reply.message);
  const latest=h.state.tenders.find(t=>t.version==='01');
  assert.ok(latest);
  assert.equal(latest.watchlisted,true);
  assert.equal(latest.decisionState,'REVIEW');
  assert.equal(latest.decisionOwner,'An');
  assert.equal(latest.decisionNote,'Theo dõi');
  for(const field of ['decisionProposedBy','decisionTechBy','decisionConfirmedBy','decisionDirectorBy','decisionDirectorAt'])assert.equal(latest[field]||'','',field);
  assert.equal(latest.lifecycle.noticeSeenAt,old.lifecycle.noticeSeenAt);
  assert.equal(h.state.checklists[latest.key],undefined);
  assert.equal(h.state.checklists[old.key].items.hsmt,true);
  const changes=h.state.amendmentLog.filter(c=>c.key===latest.key);
  assert.equal(changes.filter(c=>c.field==='version').length,1);
  assert.ok(changes.some(c=>c.field==='bidName'));
});

test('4.8.1 a queued plan hunt resumes from its retry alarm and records the terminal outcome', async () => {
  const h=await harness({settings:settings({}),hunts:[{id:'plan-hunt',name:'Giám sát',kind:'plan',enabled:true,telegram:false,criteria:{category:'TV_SUPERVISION'}}]});
  assert.equal((await h.send('PLAN_LOOKUP',{category:'XL'})).ok,true);
  const busy=h.state.planLookup;
  const queued=await h.send('RUN_HUNT',{id:'plan-hunt'});
  assert.equal(queued.ok,true);
  assert.equal(queued.queued,true);
  assert.equal(h.state.hunts[0].lastStatus,'QUEUED');
  assert.ok(h.alarms.has('gscb-hunt-wait:plan-hunt'));
  assert.equal(h.calls.queries.length,1);
  async function finish(job) {
    const end=await h.send('KQLCNT_RESULTS',{planId:job.id,mode:'khlcnt',pageIndex:0,totalElements:0,totalPages:0,records:[],done:true},'',true);
    assert.equal(end.ok,true,end.message);
    const ack=await h.send('KQLCNT_DONE',{planId:job.id,mode:'khlcnt',ok:true},'',true);
    assert.equal(ack.ok,true,ack.message);
  }
  await finish(busy);
  await h.alarm('gscb-hunt-wait:plan-hunt');
  const resumed=h.state.planLookup;
  assert.notEqual(resumed.id,busy.id);
  assert.equal(resumed.huntId,'plan-hunt');
  assert.equal(h.state.hunts[0].lastStatus,'RUNNING');
  assert.equal(h.calls.queries.length,2);
  assert.equal(h.alarms.has('gscb-hunt-wait:plan-hunt'),false);
  await finish(resumed);
  assert.equal(h.state.hunts[0].lastStatus,'SUCCESS');
  assert.equal(h.state.hunts[0].lastCompletedJobId,resumed.id);
  assert.equal(h.calls.fetch.length,0);
  assert.equal(h.calls.notifications.length,0);
});
