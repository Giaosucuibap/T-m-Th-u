import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesTenderCategory } from '../lib/tender-categories.js';
import { validateCriteria, safeSavedSearches, matchesLocalFilters } from '../lib/workspace.js';
import { normalizeKhlcntPlan, filterPlansByArea, filterPlansByCategory, filterPlansByLocalCriteria, auditPlans } from '../lib/khlcnt.js';
import { DEFAULT_SETTINGS, normalizeCandidate, mergeTender } from '../lib/core.js';
import { sanitizeBackupFeatures, sanitizeBackupTenderMetadata, buildSafeBackupState } from '../lib/backup.js';
import { findPriorTenderVersion, newTenderChanges, deadlineReminderState, shouldRemindDeadline, lifecycleLabel } from '../lib/lifecycle.js';

test('4.8.1 acronyms classify unlabeled consulting tasks without overriding source field or Ban QLDA', () => {
  for (const [acronym, category] of [['TVTK','TV_DESIGN'],['TVGS','TV_SUPERVISION'],['GSXL','TV_SUPERVISION'],['TVKS','TV_SURVEY'],['TVTT','TV_APPRAISAL'],['TVTĐ','TV_APPRAISAL'],['TVQLDA','TV_PROJECT_MANAGEMENT'],['QLDA','TV_PROJECT_MANAGEMENT']]) {
    assert.equal(matchesTenderCategory({bidName:`Gói thầu số 02: ${acronym} công trình`}, category), true, acronym);
    assert.equal(matchesTenderCategory({bidName:`${acronym} công trình`,investField:'HH'}, category), false);
  }
  assert.equal(matchesTenderCategory({bidName:'Tư vấn khảo sát trụ sở Ban QLDA',investField:'TV'},'TV_PROJECT_MANAGEMENT'),false);
  assert.equal(matchesTenderCategory({bidName:'Tư vấn khảo sát trụ sở Ban quản lý dự án',investField:'TV'},'TV_PROJECT_MANAGEMENT'),false);
});

test('4.8.1 local mandatory/excluded terms persist and stay tied to package titles', () => {
  const c = validateCriteria({province:'Lâm Đồng, Đắk Lắk',mustKeywords:'"kênh mương"',excludeKeywords:'"phần mềm"',category:'XL'});
  assert.equal(c.ok,true);
  assert.deepEqual(safeSavedSearches([{id:'one',name:'Bộ lọc',criteria:c.criteria}])[0].criteria,c.criteria);
  assert.equal(matchesLocalFilters({bidName:'Thi công kênh mương'},c.criteria),true);
  assert.equal(matchesLocalFilters({bidName:'Phần mềm quản lý kênh mương'},c.criteria),false);
  assert.equal(matchesLocalFilters({bidName:'Mua sắm bàn ghế',projectName:'Xây dựng kênh mương'},c.criteria),false);
});

const mixedPlan = () => normalizeKhlcntPlan({planNo:'PL2600000001',investField:['XL','TV'],
  bidName:['Thi công kênh mương','Tư vấn thiết kế kênh mương','Tư vấn giám sát kênh mương','Tư vấn giám sát phần mềm'],
  bidPrice:[8e9,2e8,3e8,5e7]});

test('4.8.1 multi-province KHLCNT retains either requested province and audits the same scope', () => {
  const plans = [{provinces:['Tỉnh Lâm Đồng']},{provinces:['Tỉnh Đắk Lắk']},{provinces:['Hà Nội']}];
  const c = {province:'Lâm Đồng, Đắk Lắk'};
  assert.deepEqual(filterPlansByArea(plans,c).kept,plans.slice(0,2));
  assert.deepEqual(auditPlans(plans,c),[plans[2]]);
  assert.equal(filterPlansByArea(plans,{province:'x'}).kept.length,0);
});

test('4.8.1 plan local terms and price constrain individual packages even without category', () => {
  const p = mixedPlan(), snapshot = JSON.stringify(p);
  const result = filterPlansByLocalCriteria([p],{mustKeywords:'"kênh mương"',minPrice:1e8,maxPrice:4e8});
  assert.equal(result.kept[0].packageCount,2);
  assert.equal(result.kept[0].totalPackagePrice,5e8);
  assert.equal(result.kept[0].originalPackageCount,4);
  assert.equal(result.kept[0].originalTotalPackagePrice,8.55e9);
  assert.equal(result.kept[0].categoryFiltered,true);
  assert.equal(JSON.stringify(p),snapshot);
  assert.equal(filterPlansByLocalCriteria([p],{}).kept[0],p);
});

test('4.8.1 plan category plus local filters preserve the original full-plan totals', () => {
  const categorized = filterPlansByCategory([mixedPlan()],'TV_SUPERVISION').kept;
  const result = filterPlansByLocalCriteria(categorized,{excludeKeywords:'"phần mềm"'});
  assert.equal(result.kept[0].packages.length,1);
  assert.equal(result.kept[0].packages[0].price,3e8);
  assert.equal(result.kept[0].originalPackageCount,4);
  assert.equal(result.kept[0].originalTotalPackagePrice,8.55e9);
  assert.equal(filterPlansByLocalCriteria(categorized,{minPrice:1e9}).kept.length,0);
});

test('4.8.1 a price-bound hunt omits unknown prices and reports them instead of using zero', () => {
  const result = filterPlansByLocalCriteria([{packages:[{name:'A',price:null},{name:'B',price:0},{name:'C',price:200}],packageCount:3,totalPackagePrice:200}],{maxPrice:100});
  assert.equal(result.unknownPrices,1);
  assert.equal(result.packageDropped,2);
  assert.equal(result.kept[0].packages[0].name,'B');
});

test('4.8.1 feature backup preserves user work, validates fields and disables restored schedules', () => {
  const source = {hunts:[{id:'h',name:'Săn giám sát',criteria:{category:'TV_SUPERVISION'},enabled:true,telegram:true,telegramChatId:'SECRET_RECIPIENT'}],
    watchedInvestors:[{id:'w',name:'Ban quản lý',taxCode:'123'}],
    checklists:{'IB2600000001::00':{owner:'An',items:{hsmt:true,nop:'true',injected:true},updatedAt:'2026-09-10T00:00:00Z'}},
    pastContracts:[{id:'c',name:'Thi công kênh mương',gates:{similar:'dat',staff:{html:'bad'}}}],
    amendmentLog:[{key:'IB2600000001::01',field:'version',before:'00',after:'01'}],auditLog:[{kind:'checklist',detail:'Checked',operator:'An'}],
    settings:{notifyWebhook:'https://private.invalid/path',notifyEmail:'a@private.invalid',webhookSecret:'SECRET_KEY',telegramBotToken:'SECRET_BOT'},tenders:[]};
  const copy = JSON.stringify(source);
  const backup = buildSafeBackupState(source,{},DEFAULT_SETTINGS);
  assert.equal(backup.hunts[0].enabled,false);
  assert.equal(backup.hunts[0].telegram,false);
  assert.equal(backup.hunts[0].telegramChatId,undefined);
  assert.equal(backup.checklists['IB2600000001::00'].items.hsmt,true);
  assert.equal(backup.checklists['IB2600000001::00'].items.nop,false);
  assert.equal(backup.checklists['IB2600000001::00'].items.injected,undefined);
  assert.equal(backup.pastContracts[0].gates.staff,'chua');
  assert.equal(backup.watchedInvestors.length,1);
  assert.equal(backup.amendmentLog[0].field,'version');
  assert.equal(backup.auditLog[0].operator,'An');
  assert.doesNotMatch(JSON.stringify(backup),/SECRET_|private\.invalid/);
  assert.equal(JSON.stringify(source),copy);
  assert.deepEqual(sanitizeBackupFeatures(backup),sanitizeBackupFeatures(source));
});

test('4.8.1 workflow and lifecycle metadata survive export with bounded strings and valid dates', () => {
  const row = {decisionProposedBy:'An',decisionTechBy:'Bình',decisionConfirmedBy:'Chi',decisionProposedAt:'2026-09-01T00:00:00Z',
    decisionTechAt:'bad',provinceCode:'68',guaranteeExpire:'2026-10-01T00:00:00Z',
    lifecycle:{planSeenAt:'2026-01-01T00:00:00Z',revisions:3,token:'SECRET'}};
  const meta = sanitizeBackupTenderMetadata(row);
  const backup = buildSafeBackupState({tenders:[{...row,changeLog:[{field:'version',before:'00',after:'01'}]}]}, {}, DEFAULT_SETTINGS);
  assert.equal(meta.decisionConfirmedBy,'Chi');
  assert.equal(meta.decisionTechAt,undefined);
  assert.equal(meta.lifecycle.token,undefined);
  assert.equal(backup.tenders[0].decisionProposedBy,'An');
  assert.equal(backup.tenders[0].changeLog[0].field,'version');
});

test('4.8.1 prior-revision lookup uses notice identity and only a lower revision', () => {
  const base = normalizeCandidate({notifyNo:'IB2600000001',notifyVersion:'00',bidName:'Công trình'});
  const v1 = {...base,version:'01',key:'IB2600000001::01'};
  const v2 = {...base,version:'02',key:'IB2600000001::02'};
  assert.equal(findPriorTenderVersion([base,v1],v2),v1);
  assert.equal(findPriorTenderVersion([v2],base),null);
  assert.equal(findPriorTenderVersion([base],{...v2,notifyNo:'IB2600000002'}),null);
  assert.equal(findPriorTenderVersion([base],{...v2,version:''}),null);
});

test('4.8.1 change alerts still see fresh amendments after the retained log reaches 20 rows', () => {
  const before = {...normalizeCandidate({notifyNo:'IB2600000001',bidName:'Old'}),changeLog:Array.from({length:20},(_,i)=>({field:'price',before:i,after:i+1,at:`old-${i}`}))};
  const incoming = {...before,bidName:'New',lastSeenAt:'2026-09-11T00:00:00Z'};
  const merged = mergeTender(before,incoming,DEFAULT_SETTINGS);
  assert.equal(merged.changeLog.length,20);
  assert.deepEqual(newTenderChanges(before,merged).map(x=>x.field),['bidName']);
});

test('4.8.1 deadline deduplication resets when e-GP extends the closing date', () => {
  const now = Date.parse('2026-09-11T00:00:00Z');
  const t = {key:'IB2600000001::00',notifyNo:'IB2600000001',closeDate:'2026-09-11T20:00:00Z'};
  const old = {closeDate:'2026-09-10T20:00:00Z',h24:'2026-09-10T00:00:00Z',checklist:'sent'};
  assert.equal(shouldRemindDeadline(t,{[t.key]:old},now).key,'h24');
  const renewed = {...deadlineReminderState(t,old),h24:'2026-09-11T00:00:00Z'};
  assert.equal(renewed.checklist,undefined);
  assert.equal(shouldRemindDeadline(t,{[t.key]:renewed},now),null);
  assert.match(lifecycleLabel({...t,closeDate:'2026-09-10'},now),/Đã đóng thầu/);
});

test('4.8.1 an unconfigured company profile adds no invented preferences and keeps single-user approval', () => {
  assert.deepEqual(DEFAULT_SETTINGS.capability.trades,[]);
  assert.equal(DEFAULT_SETTINGS.approvalSteps,1);
});
