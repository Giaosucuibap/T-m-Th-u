import { createDirectoryRuntime } from './lib/runtime-directory.js';
import { createPlanDetailReader } from './lib/plan-detail-reader.js';
import { parseInvestorFilter } from './lib/investor-filter.js';
import { explainDiscount, PRICE_BASIS_SOURCE } from './lib/provenance.js';
import { investorScopes, lookupBatch, batchTask, batchHasNext, provinceEvidence, enrichProvince, batchCoverage } from './lib/investor-query-plan.js';
import { buildTbmtQueries, buildKqlcntQueries, buildWardMarketQueries, classifyWinningResult } from './lib/kqlcnt.js';
import { buildKhlcntQueries } from './lib/khlcnt.js';
import { buildInvestorDiscoveryQueries } from './lib/investor.js';
import { createLiveCanaryRuntime, canarySourceDigest } from './lib/live-canary.js';
import { createNativeAgent } from './lib/native-agent.js';
import { decideAutoRetry, retryNotice, AUTO_RETRY_DELAY_MS } from './lib/run-retry.js';
import { traceEntry, appendTrace, summarizeTrace, MODE_LABELS, STAGES } from './lib/run-trace.js';
import { createQueryRuntime, readQueryControlState, schemaIsRed, activeListJob, SCHEMA_STOP_MESSAGE } from './lib/runtime-query.js';
import { resolveWardSelection } from './lib/area-match.js';
import { wardIdentitiesForProvince } from './lib/areas.js';
import { createSearchStateRuntime } from './lib/runtime-search-state.js';
import { getAppStorage } from './lib/warehouse-storage.js';
import { compareSearchRuns, warehouseCleanupPlan, warehouseStatus } from './lib/warehouse-maintenance.js';
import { createExportRuntime } from './lib/runtime-export.js';
import { createHuntRuntime } from './lib/runtime-hunt.js';
import { createIngestRuntime } from './lib/runtime-ingest.js';
import { passesHardFilter, hardFilterReason } from './lib/hard-filter.js';
import { dateGate, coverageOf, GATE_LABEL } from './lib/match-gate.js';
import { openingFingerprint, restoreOpening, cacheOpening, trimOpeningCache } from './lib/bbmt-cache.js';
import { validateCriteria, safeSavedSearches, matchesAdditionalKeyword, matchesLocalFilters, splitProvinceNames } from './lib/workspace.js';
import { safeHunts, validateHunt, huntAlarmName, parseHuntAlarm, MAX_HUNTS_ALLOWED, safeWatches } from './lib/hunts.js';
import { touchLifecycle, inferLifecycleEvent, shouldRemindDeadline, investorWatchHit, schemaHealthOf, findPriorTenderVersion, newTenderChanges, deadlineReminderState } from './lib/lifecycle.js';
import { normalizeCapability, checklistProgress, emptyChecklist, checklistItemsFor } from './lib/capability.js';
import { safeHttpsWebhook, safeEmail, safeChatId, channelPayload } from './lib/channels.js';
import { webhookHeaders } from './lib/hmac.js';
import { safeContracts, normalizeContract } from './lib/contracts.js';
import { missingSelectors } from './lib/dom-regression.js';
import { checklistDueItems, contractExpiryAlert } from './lib/checklist-due.js';
import { tokenDiff, highlightDiff, snapshotRecord } from './lib/html-diff.js';
import { applyApproval, approvalSignature } from './lib/approval.js';
import { methodOutline } from './lib/method-outline.js';
import { buildChecklistPack, mergeChecklistPack, auditEntry } from './lib/sync-pack.js';
import { inferGatesFromHsmt, extractPdfStrings } from './lib/hsmt-read.js';
import { buildOutlineDocx, docxDataUrl } from './lib/docx-lite.js';
import { filterAuditLog, guaranteeReminder } from './lib/audit-filter.js';
import {DEFAULT_SETTINGS,dateRangeFrom,extractCandidateObjects,normalizeCandidate,mergeTender,scoreTender,sanitizeRequestTemplate,extractParticipations,dedupeParticipations,mergeParticipation,formatMoney,formatDate,safeFilename,migrateTenderCodes,canonicalEgpUrl,EGP_SCAN_PAGE,hasContentScript,scanTargetUrl,BID_STATUS_LABEL} from './lib/core.js';
import {buildSafeBackupState,safeRunForBackup,sanitizeBackupFeatures,sanitizeBackupTenderMetadata} from './lib/backup.js';
import {EGP_SEARCH_PAGE,PAGE_SIZE,normalizeTaxCodeForEgp,normalizeKqlcntRecord,extractContractorCandidates,dedupeKqlcnt,summarizeWinner,priceFacts,buildKqlcntQuery,buildWardMarketQuery,buildTbmtQuery,tbmtMatchesWard} from './lib/kqlcnt.js';
import {buildBbmtQuery,bbmtDateRange,bbmtInDateRange,bbmtStamp,bbmtReadState,bbmtReadStateOf,READ_STATE,normalizeBbmtPackage,normalizeBidderTable,findBidder,notifyNoFromUrl,summarizeBidOpenings,STEPS_DECIDED,sameBbmtDetailPage} from './lib/bbmt.js';
import {normalizeKhlcntPlan,restoreLegacyKhlcntView,applyKhlcntPackageDetail,needsKhlcntPackageDetails,dedupeKhlcnt,summarizeKhlcnt,auditPlans,buildKhlcntQuery,filterPlansByArea,filterPlansByCategory,filterPlansByLocalCriteria,khlcntDateRange,khlcntInDateRange,khlcntStamp,classifyPlansByCriteria} from './lib/khlcnt.js';
import {normalizeCategory,categoryLabel,matchesTenderCategory,isUnknownCategory} from './lib/tender-categories.js';
import {fetchProvinces,fetchWards,fetchAllAreas,currentProvinceNames,wardNamesForProvince,provinceCodesByName,wardCodesByName} from './lib/areas.js';
import {buildXlsx,xlsxDataUrl,XLSX_MIME} from './lib/xlsx.js';
import {summarizeArea,AREA_DISCLAIMER,AREA_SCOPE_NOTE} from './lib/localmarket.js';
import {summarizePricing,priceReference,PRICING_DISCLAIMER,PRICING_METHOD_NOTE} from './lib/pricing.js';
import {extractAttachments,mergeAttachments,safeDownloadName,AGENT_MISSING_MESSAGE} from './lib/attachments.js';
import {buildProfile360,PROFILE_COMPLETE_NOTE,PROFILE_PARTIAL_NOTE,PROFILE_USE_NOTE} from './lib/profile360.js';
import {buildInvestorDiscoveryQuery,buildInvestorProfileQuery,discoverInvestors,summarizeInvestor,INVESTOR_COMPLETE_NOTE,INVESTOR_JOIN_NOTE,INVESTOR_PARTIAL_NOTE,INVESTOR_DISCLAIMER} from './lib/investor.js';
import {observationsFromBidOpen,observationsFromWinner,mergeObservations,contractorProfile,discountProfile,winThreshold,investorMatrix,competitionStats} from './lib/analytics.js';
import {BRAND} from './lib/brand.js';
import {DECISION_STATE_LABEL,normalizeDecisionState,statusOf} from './lib/decision.js';

const KEYS={settings:'settings',tenders:'tenders',runs:'runs',template:'searchTemplate',templates:'searchTemplates',lastTemplate:'lastObservedTemplate',activeRun:'activeRun',participations:'participations',winnerLookup:'winnerLookup',winnerCache:'winnerCache',bidOpenScan:'bidOpenScan',planLookup:'planLookup',telegramLog:'telegramLog',observations:'observations',areas:'areas',areaScan:'areaScan',attachments:'attachments',investorScan:'investorScan',endpointMap:'endpointMap',hunts:'hunts',watchedInvestors:'watchedInvestors',deadlineAlerts:'deadlineAlerts',schemaHealth:'schemaHealth',checklists:'checklists',pastContracts:'pastContracts',amendmentLog:'amendmentLog',domRegression:'domRegression',auditLog:'auditLog',domSnapshots:'domSnapshots'};
const SAVED_SEARCHES = 'savedSearches';
const DAILY_ALARM='gscb-daily';
const DEADLINE_ALARM='gscb-deadlines';
const HUNT_RETRY_PREFIX='gscb-hunt-wait:';
const TIMEOUT_PREFIX='gscb-timeout:';
// Mọi tác vụ cần content script, vì vậy URL mặc định phải nằm đúng route mà
// manifest cho phép. Trang home không nạp bridge và làm lượt quét thủ công treo.
// Lấy từ lib/core.js để phạm vi content script chỉ có MỘT nguồn sự thật,
// đối chiếu được với manifest bằng kiểm thử.
const EGP_DEFAULT_URL=EGP_SCAN_PAGE;
const notifUrls=new Map();
const pendingKqlcntDoneByTab=new Map();
const resultDeliveries=new Map();
let storageQueue=Promise.resolve();
const LOOKUP_AWARD_GATE_VERSION=1;
const withLock=fn=>{storageQueue=storageQueue.then(fn,fn);return storageQueue;};
const appStorage=getAppStorage(chrome.storage.local);
const directoryRuntime=createDirectoryRuntime({local:chrome.storage.local,storage:appStorage,getCatalog:async()=>{const d=await chrome.storage.local.get({provinceCatalog:null,areas:null});return d.provinceCatalog||d.areas||{};}});
const planDetailReader=createPlanDetailReader({tabs:chrome.tabs});
async function directoryOwners(value,province){return directoryRuntime.resolve(value,province);}
async function resolveDirectoryPayload(payload,field='investor'){const resolved=await directoryOwners(payload[field],payload.province);return resolved.ok?{ok:true,payload:{...payload,[field]:resolved.value},resolution:resolved}:{...resolved};}

// Không cho script trên website đọc trực tiếp kho cục bộ (đặc biệt Bot Token).
// Content script không dùng chrome.storage nên có thể khóa về trusted contexts.
if(chrome.storage.local.setAccessLevel){
  chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}).catch(()=>{});
}

async function getState(){
  const data=await appStorage.get({
    [SAVED_SEARCHES]:[],[KEYS.settings]:DEFAULT_SETTINGS,[KEYS.tenders]:[],[KEYS.runs]:[],[KEYS.template]:null,[KEYS.templates]:[],[KEYS.lastTemplate]:null,[KEYS.activeRun]:null,[KEYS.participations]:[],[KEYS.winnerLookup]:null,[KEYS.winnerCache]:{},[KEYS.bidOpenScan]:null,[KEYS.planLookup]:null,[KEYS.telegramLog]:[],[KEYS.observations]:[],[KEYS.areaScan]:null,[KEYS.attachments]:{},[KEYS.investorScan]:null,[KEYS.endpointMap]:[],[KEYS.hunts]:[],[KEYS.watchedInvestors]:[],[KEYS.deadlineAlerts]:{},[KEYS.schemaHealth]:null,[KEYS.checklists]:{},[KEYS.pastContracts]:[],[KEYS.amendmentLog]:[],[KEYS.domRegression]:null,[KEYS.auditLog]:[],[KEYS.domSnapshots]:[],[KEYS.areas]:null,liveCanary:null,canaryConfig:null
  });
  const state={liveCanary:data.liveCanary||null,canaryConfig:data.canaryConfig||{},savedSearches:safeSavedSearches(data[SAVED_SEARCHES]),settings:{...DEFAULT_SETTINGS,...data[KEYS.settings]},tenders:data[KEYS.tenders]||[],runs:data[KEYS.runs]||[],template:data[KEYS.template]||null,templates:data[KEYS.templates]||[],lastTemplate:data[KEYS.lastTemplate]||null,activeRun:data[KEYS.activeRun]||null,participations:data[KEYS.participations]||[],winnerLookup:data[KEYS.winnerLookup]||null,winnerCache:data[KEYS.winnerCache]||{},bidOpenScan:data[KEYS.bidOpenScan]||null,planLookup:data[KEYS.planLookup]||null,telegramLog:data[KEYS.telegramLog]||[],observations:data[KEYS.observations]||[],areaScan:data[KEYS.areaScan]||null,attachments:data[KEYS.attachments]||{},investorScan:data[KEYS.investorScan]||null,endpointMap:data[KEYS.endpointMap]||[],hunts:safeHunts(data[KEYS.hunts]),watchedInvestors:safeWatches(data[KEYS.watchedInvestors]),deadlineAlerts:data[KEYS.deadlineAlerts]&&typeof data[KEYS.deadlineAlerts]==='object'?data[KEYS.deadlineAlerts]:{},schemaHealth:data[KEYS.schemaHealth]||null,checklists:data[KEYS.checklists]&&typeof data[KEYS.checklists]==='object'?data[KEYS.checklists]:{},pastContracts:safeContracts(data[KEYS.pastContracts]),amendmentLog:Array.isArray(data[KEYS.amendmentLog])?data[KEYS.amendmentLog].slice(0,500):[],domRegression:data[KEYS.domRegression]||null,auditLog:Array.isArray(data[KEYS.auditLog])?data[KEYS.auditLog].slice(0,800):[],domSnapshots:Array.isArray(data[KEYS.domSnapshots])?data[KEYS.domSnapshots].slice(0,8):[],areas:data[KEYS.areas]||null};
  for(const key of ['winnerLookup','areaScan','investorScan'])state[key]=restoreLookupAwardView(state[key],key,state.areas);
  state.planLookup=restoreLegacyKhlcntView(state.planLookup,state.areas);
  return state;
}

// A lookup's control and ingest path must not deserialize the tender vault.
// Only activeRun transactions need run snapshots; the other lookup stores are
// separate, small chrome.storage values. Safety checks read no result arrays.
async function readSafetyState(){
  const state=await chrome.storage.local.get({settings:DEFAULT_SETTINGS,schemaHealth:null,liveCanary:null});
  return {...state,settings:{...DEFAULT_SETTINGS,...state.settings}};
}
async function readJobState(key,extras={}){
  return appStorage.get({[key]:null,...(key==='activeRun'?{runs:[]}:{}),...extras});
}
async function readLookupView(key){
  const state=await readJobState(key,{areas:null});
  return restoreLookupAwardView(state[key],key,state.areas);
}
async function planStateReply(payload={}){
  const revisionKey='planLookupViewRevision';
  const stored=await chrome.storage.local.get({[revisionKey]:null});
  if(stored[revisionKey]&&payload.revision===stored[revisionKey])return {ok:true,unchanged:true,revision:stored[revisionKey]};
  const state=await readJobState('planLookup',{areas:null});
  const lookup=restoreLegacyKhlcntView(state.planLookup,state.areas);
  const revision=lookup?lookup._viewRevision||JSON.stringify([lookup.id,lookup.status,lookup.serverCount,lookup.pagesRead,lookup.finishedAt]):stored[revisionKey]||'empty';
  return {ok:true,lookup,revision};
}

/** Repair old lookup views without a write from getState that could race an
 * ingest transaction. New jobs carry a marker and do not repeat this work. */
function restoreLookupAwardView(job,key,areas){
  if(!job||job.awardGateVersion===LOOKUP_AWARD_GATE_VERSION)return job;
  const arrays=value=>Array.isArray(value)?value:[];
  const rawCandidates=key==='winnerLookup'&&job.mode==='discover'?arrays(job.candidateSourceRows):[];
  const source=[...arrays(job.packages),...arrays(job.insufficientPackages),...arrays(job.excludedPackages),...rawCandidates];
  const focus=key==='winnerLookup'?normalizeTaxCodeForEgp(job.focusTaxCode):'';
  let legacyEstimateCount=0;
  const rows=dedupeKqlcnt(source.filter(row=>row&&typeof row==='object').map((item,index)=>{
    // Some older snapshots retain raw source rows. Those still have the
    // original estimate value and can use the corrected current normalizer.
    if(Object.hasOwn(item,'winningCode')||Object.hasOwn(item,'bidWinningPrice')){
      const normalized=normalizeKqlcntRecord(item,focus);if(normalized)return normalized;
    }
    const row={...item,key:item.key||`legacy-record-${index}`};
    const uncertainEstimate=row.discount?.basisSource===PRICE_BASIS_SOURCE.ESTIMATE;
    const prices=priceFacts(uncertainEstimate?null:row.priceBasis,row.winningPrice);
    const discount=explainDiscount(prices.priceBasis,prices.winningPrice,
      uncertainEstimate?null:(row.discount?.basisSource||PRICE_BASIS_SOURCE.PACKAGE),row.discount?.sourceUrl||row.detailUrl||'');
    if(uncertainEstimate){
      legacyEstimateCount++;
      discount.note='Bản lưu cũ chưa đủ căn cứ xác nhận mốc dự toán; cần tra cứu lại để tính chênh lệch.';
    }
    return {...row,...prices,discount,...(uncertainEstimate?{priceBasisReviewRequired:true,
      legacyPriceFacts:{priceBasis:row.priceBasis,savedAmount:row.savedAmount,discountRate:row.discountRate,discount:row.discount}}:{})};
  }));
  const classified=classifyLookupRows(rows,job,areas);
  // Recheck a contractor-specific lookup as well as the common scope gate.
  if(focus)for(const row of rows){
    if(classified.states[row.key]?.filterState!=='OUT_OF_RANGE'&&!(row.winningTaxCodes||[]).includes(focus))classified.states[row.key]={filterState:'OUT_OF_RANGE',filterReason:'contractor'};
  }
  const packages=classified.matched.filter(row=>classified.states[row.key]?.filterState==='MATCH');
  const insufficientPackages=classified.unknown.filter(row=>classified.states[row.key]?.filterState==='INSUFFICIENT');
  const excludedPackages=rows.filter(row=>classified.states[row.key]?.filterState==='OUT_OF_RANGE')
    .map(row=>({...row,...classified.states[row.key]}));
  const states=Object.values(classified.states),counts={match:states.filter(row=>row.filterState==='MATCH').length,
    insufficient:states.filter(row=>row.filterState==='INSUFFICIENT').length+(Number(job.invalidCount)||0),
    outOfRange:states.filter(row=>row.filterState==='OUT_OF_RANGE').length};
  const coverage=job.queryBatch?.length?batchCoverage(job,job.batchReceipts||{},counts)
    :coverageOf({...job.coverage,...counts});
  const migrationNote=`Đã đối chiếu lại bản lưu cũ: ${packages.length} gói có nhà thầu trúng, ${insufficientPackages.length} gói chưa đủ dữ liệu, ${excludedPackages.length} gói bị loại khỏi thống kê.${legacyEstimateCount?' Mốc dự toán của bản lưu cũ cần tra cứu lại; chưa tính chênh lệch cho các gói đó.':''}`;
  const next={...job,awardGateVersion:LOOKUP_AWARD_GATE_VERSION,packages,insufficientPackages,excludedPackages,
    resultStates:classified.states,coverage,matchCount:counts.match,insufficientCount:counts.insufficient,outOfRangeCount:counts.outOfRange,migrationNote,message:migrationNote};
  if(key==='winnerLookup'){
    next.summary=summarizeWinner(packages);
    if(job.mode==='discover'){
      const selectedKeys=new Set(packages.map(row=>row.key));
      next.candidateSourceRows=rawCandidates.filter(row=>selectedKeys.has(normalizeKqlcntRecord(row)?.key));
      next.candidates=extractContractorCandidates(next.candidateSourceRows,job.query);
    }
  }else if(key==='areaScan'){
    next.summary=summarizeArea(packages,job.criteria||{});next.pricing=summarizePricing(packages,{});
  }else if(job.mode==='discover')next.candidates=discoverInvestors(packages);
  else next.summary=summarizeInvestor(packages,{codes:job.criteria?.codes||[],name:job.criteria?.name||''});
  return next;
}

async function appendAudit(kind,detail,operator){
  const s=await getState();
  if(s.settings.readOnlyMode)return;
  const auditLog=[auditEntry(kind,detail,operator||s.settings.operatorName),[...(s.auditLog||[])]].flat().slice(0,800);
  await save({[KEYS.auditLog]:auditLog});
}
async function save(partial){
  partial={...partial};
  for(const key of ['winnerLookup','planLookup','areaScan','investorScan','bidOpenScan'])if(Object.hasOwn(partial,key)){
    const revision=crypto.randomUUID();
    if(partial[key])partial[key]={...partial[key],_viewRevision:revision};
    partial[key+'ViewRevision']=revision;
  }
  await appStorage.set(partial);
  // Directory failure cannot roll back a successfully saved procurement result.
  await directoryRuntime.observe(partial).catch(error=>console.warn('Không cập nhật được gợi ý chủ đầu tư:',error.message));
  // Do not acquire storageQueue recursively from an ingest/save transaction.
  if((partial.liveCanary?.status==='RED'||partial.schemaHealth?.status==='RED'))void Promise.resolve().then(()=>stopScansForSchema()).catch(()=>{});
}

async function stopScansForSchema(){
  queryRuntime.stop({keepProbes:true});
  await cancelActiveRun();
  await cancelLookups(null,SCHEMA_STOP_MESSAGE);
}

async function markCacheHit(id,queryCache){
  await withLock(async()=>{
    const state=await getState();
    const run=state.runs.find(r=>r.id===id);
    if(run){await save({runs:state.runs.map(r=>r.id===id?{...r,queryCache}:r),...(state.activeRun?.id===id?{activeRun:{...state.activeRun,queryCache}}:{})});return;}
    const kind=LOOKUP_KINDS.find(k=>state[k.key]?.id===id);
    if(kind)await save({[kind.key]:{...state[kind.key],queryCache}});
  });
}

function publicSettings(settings={}){
  const out={...DEFAULT_SETTINGS,...settings};
  out.telegramBotToken=settings.telegramBotToken?'••••':'';
  out.telegramChatId=settings.telegramChatId?'••••':'';
  out.hasTelegramToken=Boolean(String(settings.telegramBotToken||'').trim());
  out.hasTelegramChat=Boolean(String(settings.telegramChatId||'').trim());
  out.notifyWebhook=settings.notifyWebhook?'••••':'';
  out.webhookSecret=settings.webhookSecret?'••••':'';
  out.notifyEmail=settings.notifyEmail||'';
  out.operatorName=settings.operatorName||'';
  out.readOnlyMode=Boolean(settings.readOnlyMode);
  out.approvalSteps=[1,2,3].includes(Number(settings.approvalSteps))?Number(settings.approvalSteps):1;
  out.hasWebhook=Boolean(safeHttpsWebhook(settings.notifyWebhook));
  out.capability=normalizeCapability(settings.capability||{});
  return out;
}

function senderIsOptions(sender){
  try{const url=new URL(sender?.url||'');const options=new URL(chrome.runtime.getURL('options.html'));return url.origin===options.origin&&url.pathname===options.pathname;}catch{return false;}
}

async function resolveProvinceCodes(provinceText){
  const names=splitProvinceNames(provinceText);
  if(!names.length)return {ok:true,names:[],codes:[],unknown:[]};
  const areas=(await getProvincesOnly()).areas;
  if(!areas)return {ok:false,names,codes:[],unknown:names,unavailable:true};
  const codes=[],unknown=[];
  for(const name of names){
    const found=provinceCodesByName(areas.provinces,name);
    if(found.length)codes.push(...found);
    else unknown.push(name);
  }
  return {ok:unknown.length===0,names,codes:[...new Set(codes)],unknown};
}

function newRun(mode){return {foundKeys:[],id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,mode,status:'STARTING',startedAt:new Date().toISOString(),finishedAt:null,captured:0,newCount:0,updatedCount:0,matchedCount:0,message:'Đang mở Hệ thống mạng đấu thầu quốc gia...',tabId:null,queue:[],qi:0,pendingAlerts:[],pendingMatches:[]};}
function isEgpUrl(url){
  try{const u=new URL(url);return u.protocol==='https:'&&u.origin==='https://muasamcong.mpi.gov.vn';}catch{return false;}
}
function samePageContext(currentUrl,sourcePageUrl=''){
  if(!isEgpUrl(currentUrl))return false;
  if(!sourcePageUrl)return true;
  try{
    const current=new URL(currentUrl);
    const source=new URL(sourcePageUrl);
    return current.origin===source.origin&&current.pathname===source.pathname;
  }catch{return true;}
}
/**
 * Chuẩn bị tab e-GP cho một lượt quét.
 *
 * BẤT BIẾN: tab trả về LUÔN nằm trên trang có content script.
 *
 * 4.0.1 đã sửa đường hỏng thứ nhất (route mặc định trỏ về /web/guest/home),
 * nhưng đường thứ hai vẫn còn: khi người dùng đang mở sẵn MỘT trang e-GP bất
 * kỳ — trang chủ chẳng hạn — và chưa lưu bộ lọc, hàm này tái dùng tab đó
 * nguyên trạng. Không có content script ở đó, nên lượt quét chết với nguyên
 * văn "Could not establish connection. Receiving end does not exist." và 0 gói.
 * Đã tái hiện trong Chromium trước khi sửa.
 *
 * Nay mọi đường đều đi qua scanTargetUrl()/hasContentScript() của lib/core.js.
 */
async function prepareScanTabFor(mode,template,s){
  const targetUrl=scanTargetUrl(template?.sourcePageUrl);
  const active=mode==='manual'||Boolean(s.settings.openScheduledTabActive);
  let tab=null;

  if(mode==='manual'){
    const [current]=await chrome.tabs.query({active:true,currentWindow:true});
    // Chỉ tái dùng tab đang mở khi nó vừa có content script, vừa đúng ngữ cảnh
    // trang của bộ lọc đã lưu.
    if(hasContentScript(current?.url)
       &&(!template||samePageContext(current.url,template.sourcePageUrl)))tab=current;
    else if(current?.url&&isEgpUrl(current.url))tab=await chrome.tabs.update(current.id,{url:targetUrl,active:true});
  }

  if(!tab)tab=await chrome.tabs.create({url:targetUrl,active});
  else if(!hasContentScript(tab.url))tab=await chrome.tabs.update(tab.id,{url:targetUrl,active});
  return tab;
}
function rescoreStoredTenders(tenders,settings){
  const migrated=(tenders||[]).map(migrateTenderCodes);
  // Việc sửa mã có thể làm hai bản ghi trùng khoá — gộp lại, giữ bản mới nhất.
  const map=new Map();
  for(const t of migrated){
    const old=map.get(t.key);
    map.set(t.key,!old||new Date(t.lastSeenAt||0)>=new Date(old.lastSeenAt||0)?t:old);
  }
  return [...map.values()]
    .map(t=>({
      ...t,
      decisionState:normalizeDecisionState(t.decisionState),
      decisionOwner:String(t.decisionOwner||'').slice(0,120),
      decisionNote:String(t.decisionNote||'').slice(0,1000),
      decisionUpdatedAt:t.decisionUpdatedAt||null,
      changeLog:Array.isArray(t.changeLog)?t.changeLog.slice(-20):[],
      ...scoredWithGate(t,settings,t.filterCriteria||settings)
    }))
    .sort((a,b)=>new Date(b.lastSeenAt)-new Date(a.lastSeenAt));
}
async function updateRun(runId,patch){
  return withLock(async()=>{
    const s=await getState();
    const runs=s.runs.map(r=>r.id===runId?{...r,...patch}:r);
    const active=s.activeRun?.id===runId?{...s.activeRun,...patch}:s.activeRun;
    await save({[KEYS.runs]:runs.slice(0,100),[KEYS.activeRun]:active});
    return runs.find(r=>r.id===runId);
  });
}
async function finishRun(runId,status,message){
  const pending=(await getState()).runs.find(r=>r.id===runId);
  if(status==='SUCCESS'&&(pending?.partial||pending?.schemaIssue||pending?.coverage?.complete===false)){
    status='PARTIAL';message=pending.partialMessage||pending.coverage?.text||'Dữ liệu chưa đầy đủ.';
  }
  const run=await updateRun(runId,{status,message,finishedAt:new Date().toISOString()});
  await chrome.alarms.clear(TIMEOUT_PREFIX+runId);
  const s=await getState();
  if(s.activeRun?.id===runId)await save({[KEYS.activeRun]:null});
  await recordHuntOutcome(run);
  if(!s.settings.readOnlyMode&&(status==='SUCCESS'||status==='PARTIAL')){
    const partial=status==='PARTIAL';
    chrome.notifications.create({type:'basic',iconUrl:'icons/icon128.png',
      title:partial?'Giáo Sư Cùi Bắp — dữ liệu chưa đầy đủ':'Giáo Sư Cùi Bắp',
      message:`${partial?'Quét một phần':'Quét xong'}: ${run?.newCount||0} gói mới, ${run?.matchedCount||0} gói đạt ngưỡng.${partial?' Hãy mở tiện ích để xem phạm vi còn thiếu.':''}`}).catch(()=>{});
    await notifyHighScore(run?.pendingAlerts||[]);
    await pushTelegramMatches(s.settings,run?.pendingMatches||[],run);
    if(s.settings.autoExportMobileReport)await exportMobileReport(false);
    await reviewDeadlines();
    if(s.schemaHealth?.runId===runId&&s.schemaHealth.ok===false){
      chrome.notifications.create({type:'basic',iconUrl:'icons/icon128.png',title:'Giáo Sư Cùi Bắp — schema e-GP lạ',
        message:'Lượt vừa rồi thiếu trường notifyNo/bidName quen thuộc. Đừng tin đây là toàn bộ dữ liệu; mở Chẩn đoán để xem.'}).catch(()=>{});
      compareOpenEgpDom().catch(()=>{});
    }
  }else if(status==='ERROR'||status==='TIMEOUT'){
    chrome.notifications.create({type:'basic',iconUrl:'icons/icon128.png',title:'Giáo Sư Cùi Bắp cần kiểm tra',message}).catch(()=>{});
  }
  // Tab nền do lịch/startup tự mở chỉ là tài nguyên của job. Đóng sau khi đã
  // chốt activeRun; tab người dùng mở hoặc lượt manual tuyệt đối không đụng.
  if(run?.ownedTab&&Number.isInteger(run.tabId)){
    await chrome.tabs.remove(run.tabId).catch(()=>{});
  }
}

function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function notifyHighScore(alerts){
  for(const t of (alerts||[]).slice(0,5)){
    const nid='gscb-alert:'+t.key;
    if(t.detailUrl)notifUrls.set(nid,t.detailUrl);
    chrome.notifications.create(nid,{type:'basic',iconUrl:'icons/icon128.png',title:t.alertKind==='amendment'?`✏️ Điều chỉnh · ${t.notifyNo}`:`⭐ ${t.score}đ · ${t.notifyNo}`,message:(t.bidName||'').slice(0,150),buttons:[{title:'Mở gói thầu trên e-GP'}]}).catch(()=>{});
  }
}
/* ==========================================================================
 *  TELEGRAM — đẩy gói thầu mới về điện thoại
 *
 *  Đã đối chiếu trực tiếp với API Telegram:
 *    • Token sai   -> HTTP 401 {"ok":false,"error_code":401,"description":"Unauthorized"}
 *    • Dấu ":" trong token mã hoá thành %3A vẫn được Telegram chấp nhận.
 *    • Một tin nhắn tối đa 4096 ký tự — vượt quá là lỗi 400, nên phải cắt khúc.
 * ======================================================================== */

const TELEGRAM_LIMIT=3800;          // chừa biên an toàn dưới mức 4096 của Telegram
const TELEGRAM_LOG_MAX=20;

/** Dịch lỗi Telegram sang tiếng Việt kèm hướng khắc phục. */
function telegramError(status,description){
  const d=String(description||'');
  if(status===401||/unauthorized/i.test(d))
    return 'Bot Token sai hoặc đã bị thu hồi. Mở @BotFather → /mytoken để lấy lại.';
  if(/chat not found/i.test(d))
    return 'Chat ID sai, hoặc bạn chưa bấm Start với bot. Mở Telegram, tìm bot của bạn và bấm START trước.';
  if(/bot was blocked/i.test(d))
    return 'Bạn đã chặn bot này trong Telegram. Bỏ chặn rồi thử lại.';
  if(/too many requests/i.test(d))
    return 'Telegram đang chặn tạm vì gửi quá nhiều. Chờ vài phút rồi thử lại.';
  if(/can.t parse entities/i.test(d))
    return 'Nội dung tin nhắn có ký tự làm Telegram hiểu nhầm định dạng. Đã ghi nhận để sửa.';
  return d||(status?`Telegram trả lỗi HTTP ${status}.`:'Không gọi được Telegram.');
}

/** Ghi nhật ký gửi để người dùng biết hệ thống có chạy hay không. */
async function logTelegram(entry){
  return withLock(async()=>{
    const s=await getState();
    const log=[{at:new Date().toISOString(),...entry},...(s.telegramLog||[])].slice(0,TELEGRAM_LOG_MAX);
    await save({[KEYS.telegramLog]:log});
  });
}

/** Cắt văn bản thành nhiều khúc, không cắt giữa dòng. */
function chunkForTelegram(text,limit=TELEGRAM_LIMIT){
  const lines=String(text||'').split('\n');
  const out=[];let cur='';
  for(const line of lines){
    const piece=line.length>limit?line.slice(0,limit):line;
    if((cur+'\n'+piece).length>limit&&cur){out.push(cur);cur=piece;}
    else cur=cur?`${cur}\n${piece}`:piece;
  }
  if(cur)out.push(cur);
  return out.length?out:[''];
}

async function callTelegram(token,method,payload){
  const res=await fetch(`https://api.telegram.org/bot${encodeURIComponent(String(token||'').trim())}/${method}`,
    {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload||{})});
  const data=await res.json().catch(()=>({}));
  return {httpOk:res.ok,status:res.status,data};
}

async function sendTelegram(settings,text,opts={}){
  if(!opts.force&&!settings.telegramEnabled)return {ok:false,message:'Chưa bật gửi Telegram trong Cấu hình.'};
  const token=String(settings.telegramBotToken||'').trim();
  const chatId=String(opts.chatId||settings.telegramChatId||'').trim();
  if(!token||!chatId)return {ok:false,message:'Thiếu Bot Token hoặc Chat ID.'};

  const parts=chunkForTelegram(text);
  try{
    for(let i=0;i<parts.length;i++){
      const {httpOk,status,data}=await callTelegram(token,'sendMessage',{
        chat_id:chatId,text:parts[i],parse_mode:'HTML',disable_web_page_preview:true
      });
      if(!httpOk||data.ok===false){
        const message=telegramError(status,data.description);
        await logTelegram({ok:false,message,kind:opts.kind||'send'});
        return {ok:false,message};
      }
      if(i+1<parts.length)await new Promise(r=>setTimeout(r,400));
    }
    const message=parts.length>1?`Đã gửi (${parts.length} tin nhắn).`:'Đã gửi.';
    await logTelegram({ok:true,message,kind:opts.kind||'send'});
    return {ok:true,message};
  }catch(e){
    const message=`Không kết nối được Telegram: ${String(e?.message||e)}`;
    await logTelegram({ok:false,message,kind:opts.kind||'send'});
    return {ok:false,message};
  }
}

/**
 * Dò Chat ID tự động: đọc các tin nhắn gần đây mà bot nhận được.
 * Người dùng chỉ cần nhắn một câu bất kỳ cho bot rồi bấm nút — đỡ phải đi
 * tìm @userinfobot và chép tay con số.
 */
async function telegramDetectChatId(token){
  const t=String(token||'').trim();
  if(!t)return {ok:false,message:'Nhập Bot Token trước đã.'};
  try{
    const me=await callTelegram(t,'getMe',{});
    if(!me.httpOk||me.data.ok===false)return {ok:false,message:telegramError(me.status,me.data.description)};
    const botName=me.data.result&&me.data.result.username?`@${me.data.result.username}`:'bot của bạn';

    const upd=await callTelegram(t,'getUpdates',{limit:50});
    if(!upd.httpOk||upd.data.ok===false)return {ok:false,message:telegramError(upd.status,upd.data.description)};

    const seen=new Map();
    for(const u of (upd.data.result||[])){
      const msg=u.message||u.channel_post||u.edited_message;
      const chat=msg&&msg.chat;
      if(!chat||seen.has(String(chat.id)))continue;
      seen.set(String(chat.id),{
        id:String(chat.id),
        name:[chat.title,chat.first_name,chat.last_name].filter(Boolean).join(' ')||chat.username||'(không tên)',
        type:chat.type
      });
    }
    const chats=[...seen.values()];
    if(!chats.length){
      return {ok:false,botName,
        message:`Chưa thấy tin nhắn nào. Mở Telegram, tìm ${botName}, bấm START và nhắn một câu bất kỳ, rồi bấm lại nút này.`};
    }
    return {ok:true,botName,chats};
  }catch(e){
    return {ok:false,message:`Không kết nối được Telegram: ${String(e?.message||e)}`};
  }
}

/** Một dòng mô tả gói thầu trong tin nhắn Telegram. */
function telegramTenderLine(t){
  const code=t.displayCode||t.notifyNo||t.bidNo||'';
  const label=t.codeLabel||'Mã TBMT';
  const status=t.statusLabel?` · ${t.statusLabel}`:'';
  const days=(t.status==='OPEN'&&Number.isFinite(t.daysLeft))?` (còn ${t.daysLeft} ngày)`:'';
  const url=t.detailUrl||t.sourcePageUrl||'';
  const name=escapeHtml(t.bidName||code);
  return `• <b>${t.score}đ</b> — ${url?`<a href="${escapeHtml(url)}">${name}</a>`:name}\n`
    +`  ${escapeHtml(label)}: ${escapeHtml(code)}${status}${days}\n`
    +`  💰 ${escapeHtml(formatMoney(t.price))} · 📍 ${escapeHtml(t.location||'Chưa rõ địa điểm')}`
    +(t.investorName?`\n  🏛 ${escapeHtml(t.investorName)}`:'');
}

async function dispatchOutbound(settings,text,opts={}){
  // External webhook delivery is not enabled in this release: arbitrary hosts
  // need separate permission and a verified receiving service. Keep the
  // existing user-configured Telegram channel; JSON signing stays local.
  if((await getState()).settings.readOnlyMode)return {ok:false,message:'Đang khóa chỉnh sửa và tự động hóa.'};
  return sendTelegram(settings,text,opts);
}

async function pushTelegramMatches(settings,matches,run){
  if(!settings.telegramEnabled||settings.readOnlyMode)return;
  const list=matches||[];
  const partial=run?.status==='PARTIAL'||Boolean(run?.partial);
  const scopeNote=partial?'\n⚠️ <b>DỮ LIỆU CHƯA ĐẦY ĐỦ</b>: lượt quét bị giới hạn hoặc gián đoạn.':' ';

  // Không có gói mới: chỉ nhắn khi người dùng bật "báo cả khi không có gì mới",
  // để biết hệ thống vẫn sống chứ không phải đã chết âm thầm.
  const hunt=(run?.huntId?((await getState()).hunts||[]).find(h=>h.id===run.huntId):null);
  if(hunt&&!hunt.telegram)return;
  const chatId=safeChatId(hunt?.telegramChatId);
  if(!list.length){
    if(!settings.telegramDailySummary)return;
    await dispatchOutbound(settings,
      `📡 <b>Giáo Sư Cùi Bắp</b> — ${new Date().toLocaleString('vi-VN')}\n`
      +`${partial?'Đã quét một phần':'Đã quét xong'}, <b>không có gói mới</b> đạt ngưỡng.${scopeNote}\n`
      +`Tổng cộng đã nhận ${Number(run?.captured||0)} bản ghi từ e-GP.`,
      {kind:'summary',chatId});
    return;
  }

  const amended=list.filter(t=>t.alertKind==='amendment').length;
  const head=`📡 <b>Giáo Sư Cùi Bắp</b>: ${list.length} gói mới đạt ngưỡng`
    +(amended?` · ${amended} gói theo dõi vừa điều chỉnh/gia hạn`:'')
    +`\n<i>${new Date().toLocaleString('vi-VN')}</i>${scopeNote}`;
  const body=[...list].sort((a,b)=>Number(b.score||0)-Number(a.score||0))
    .slice(0,25).map(t=> (t.alertKind==='amendment'?'✏️ <b>Điều chỉnh / gia hạn</b>\n':'')+telegramTenderLine(t)).join('\n\n');
  const tail=list.length>25?`\n\n… và ${list.length-25} gói nữa, xem trong tiện ích.`:'';
  await dispatchOutbound(settings,`${head}\n\n${body}${tail}`,{kind:'matches',chatId});
}

function makeTemplateId(){return 't'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function templateName(tpl){try{const u=new URL(tpl.sourcePageUrl||tpl.url);const seg=u.pathname.split('/').filter(Boolean).pop()||'e-GP';return `${seg} · ${new Date(tpl.capturedAt||Date.now()).toLocaleDateString('vi-VN')}`;}catch{return 'Bộ lọc '+new Date().toLocaleDateString('vi-VN');}}

/** One rule evaluation feeds storage, per-run counters and alerts. Scores never
 * authorize a record that fails a requested criterion. */
function scoredWithGate(record,settings,criteria){
  const score=scoreTender(record,settings);
  const gate=passesHardFilter(record,criteria||{});
  return {...score,matched:gate.ok&&score.matched,filterState:gate.state,
    filterReason:gate.reason||'',filterReasons:gate.reasons||[]};
}
function publicFilterCriteria(criteria={}){
  const out={};
  for(const key of ['investor','province','ward','keyword','mustKeywords','excludeKeywords','minPrice','maxPrice','category','fromDate','toDate','fromYear','toYear','requireConstruction'])
    if(Object.hasOwn(criteria,key))out[key]=criteria[key];
  for(const key of ['provinces','requiredKeywords','dateFields'])if(Array.isArray(criteria[key]))out[key]=criteria[key].slice(0,100);
  for(const key of ['wardCode','wardParentCode'])if(criteria[key])out[key]=String(criteria[key]).slice(0,120);
  if(Array.isArray(criteria.wardIdentities))out.wardIdentities=criteria.wardIdentities.slice(0,100).map(row=>({code:String(row.code||'').slice(0,120),parentCode:String(row.parentCode||'').slice(0,120),name:String(row.name||'').slice(0,200)}));
  return out;
}
function extendSourceKeys(previous,keys){
  const seen=new Set(previous||[]);let duplicates=0;
  for(const key of keys){if(seen.has(key))duplicates++;else seen.add(key);}
  return {keys:[...seen],duplicates};
}
function pageCoverage(job,payload,{fetched,match=0,insufficient=0,outOfRange=0,invalid=0}={}){
  const pages=receivedPageIndexes(job);
  if(!payload.done&&Number.isInteger(payload.pageIndex))pages.add(payload.pageIndex);
  const serverTotal=payload.totalElements??job.totalElements??job.totalCandidates??null;
  const totalPages=payload.totalPages??job.totalPages??null;
  const empty=serverTotal===0&&totalPages===0&&fetched===0;
  return coverageOf({serverTotal,totalPages,fetched,match,insufficient,outOfRange,
    pageIndexes:empty?[]:[...pages],pagesRead:empty?0:pages.size,done:payload.done===true,
    partial:Boolean(job.partial||payload.partial||payload.capped||payload.cancelled||payload.schemaIssue||invalid)});
}

async function ingest(...args){return ingestRuntime.ingest(...args);}

async function waitForTab(tabId,timeout=30000){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(error,tab)=>{
      if(settled)return;settled=true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(updated);
      chrome.tabs.onRemoved.removeListener(removed);
      if(error)reject(error);else resolve(tab);
    };
    function updated(id,info,tab){if(id===tabId&&info.status==='complete')finish(null,tab);}
    function removed(id){if(id===tabId)finish(new Error('Tab e-GP đã bị đóng trước khi tải xong.'));}
    const timer=setTimeout(()=>finish(new Error('Quá thời gian mở trang e-GP.')),timeout);
    // Subscribe before reading: completion may occur between Chrome's snapshot
    // and delivery of tabs.get(). A later loading snapshot must not lose it.
    chrome.tabs.onUpdated.addListener(updated);
    chrome.tabs.onRemoved.addListener(removed);
    try{
      Promise.resolve(chrome.tabs.get(tabId)).then(tab=>{if(tab.status==='complete')finish(null,tab);},error=>finish(error));
    }catch(error){finish(error);}
  });
}

async function sendToTab(tabId,message,retries=8){
  let last;
  for(let i=0;i<retries;i++){
    try{return await chrome.tabs.sendMessage(tabId,message);}catch(e){last=e;await new Promise(r=>setTimeout(r,500+i*250));}
  }
  throw last||new Error('Không kết nối được tiện ích với trang e-GP.');
}
function scanTimeoutMs(s){return Math.max(45,Number(s.settings.scanTimeoutSeconds||75))*1000;}
function runningMessage(queue,i){return queue.length>1?`Bộ lọc ${i+1}/${queue.length}: đang chạy truy vấn an toàn...`:(queue[i]?'Đang chạy bộ lọc e-GP bằng truy vấn mới...':'Đang lấy các TBMT công khai gần nhất...');}

/**
 * Chuyển bộ lọc cũ thành đúng một query của bộ máy KQLCNT/TBMT.
 *
 * Bản cũ gửi lại nguyên URL/body/header đã bắt được. Body đó nhanh chóng lỗi
 * thời (đặc biệt reCAPTCHA/CSRF) và dễ trả HTTP 400. Bản mới chỉ lấy khối
 * `query` công khai đã được sanitize khi lưu; request thật luôn do trang e-GP
 * hiện tại tạo, còn page-hook chỉ thay query và giữ pageSize hợp lệ.
 */
function nativeTbmtQueryFromTemplate(template){
  const criteria=template?.criteria||template?.searchCriteria;
  if(criteria&&typeof criteria==='object')return buildTbmtQuery(criteria);
  if(!template)return buildTbmtQuery({});
  try{
    const parsed=JSON.parse(String(template.body||''));
    const envelope=Array.isArray(parsed)&&parsed.length===1?parsed[0]:null;
    const queries=envelope&&Array.isArray(envelope.query)?envelope.query:[];
    const query=queries.find(q=>q&&typeof q==='object'&&!Array.isArray(q));
    if(!query)throw new Error('Bộ lọc không có query hợp lệ.');
    // Tạo bản sao tách khỏi object lưu trong storage; không mang URL/header/body
    // hay bất kỳ token phiên nào sang tab e-GP. Đồng thời ép lại hai filter
    // bất biến để template cũ không thể vô tình chuyển sang KQLCNT/loại chỉ mục khác.
    const safe=JSON.parse(JSON.stringify(query));
    safe.index='es-contractor-selection';
    safe.filters=(Array.isArray(safe.filters)?safe.filters:[])
      .filter(f=>f&&f.fieldName!=='type'&&f.fieldName!=='stepCode');
    safe.filters.unshift(
      {fieldName:'type',searchType:'in',fieldValues:['es-notify-contractor']},
      {fieldName:'stepCode',searchType:'in',fieldValues:['notify-contractor-step-1-tbmt']}
    );
    return safe;
  }catch(error){
    throw new Error(`Không chuyển được bộ lọc cũ sang truy vấn an toàn: ${String(error?.message||error)}`);
  }
}

async function dispatchRunQueryToTab(tabId,run,template,settings){
  const index=Math.max(0,Number(run.qi)||0);
  const total=Math.max(1,(run.queue||[]).length);
  const label=template?.name||templateName(template||{})||'TBMT công khai';
  return dispatchLookupToTab(tabId,{
    id:run.id,mode:'tbmt',queryIndex:index,label:total>1?`${label} (${index+1}/${total})`:label,
    query:nativeTbmtQueryFromTemplate(template),pageSize:PAGE_SIZE,
    maxPages:Math.max(1,Number(settings.maxPagesHint)||DEFAULT_SETTINGS.maxPagesHint)
  });
}

async function startScan(mode='manual',opts={}){
  if((await getState()).settings.readOnlyMode)return {ok:false,message:'Đang khóa chỉnh sửa và tự động hóa.'};
  const s=await getState();
  if(s.activeRun) return {ok:false,message:'Một lượt quét khác đang chạy.',run:s.activeRun};
  const templates=s.templates||[];
  let queue;
  if(opts.all) queue=templates.length?templates:(s.template?[s.template]:[]);
  else if(opts.templateId) {const t=templates.find(x=>x.id===opts.templateId);queue=t?[t]:(s.template?[s.template]:[]);}
  else queue=s.template?[s.template]:[];
  if(!queue.length){
    if(mode!=='manual'){
      chrome.notifications.create({type:'basic',iconUrl:'icons/icon128.png',title:'Giáo Sư Cùi Bắp chưa có bộ lọc',message:'Mở e-GP, thực hiện một lần tìm kiếm nâng cao rồi lưu bộ lọc trong tiện ích.'}).catch(()=>{});
      return {ok:false,message:'Chưa có bộ lọc e-GP đã ghi nhớ.'};
    }
    queue=[null];
  }
  const run={...newRun(mode),queue,qi:0,nativeQuery:true,ownedTab:false};
  const claimed=await claimActiveRun(run);
  if(!claimed.ok)return {ok:false,message:'Một lượt quét khác vừa được bắt đầu.',run:claimed.current};
  try{
    const tab=await ensureEgpSearchTab(mode==='manual'||Boolean(s.settings.openScheduledTabActive));
    await updateRun(run.id,{tabId:tab.id,status:'OPENING',message:'Đang mở trang tra cứu nhà thầu...'});
    await waitForTab(tab.id,35000);
    await updateRun(run.id,{status:'RUNNING',message:runningMessage(queue,0)});
    await dispatchRunQueryToTab(tab.id,run,queue[0],s.settings);
    await chrome.alarms.create(TIMEOUT_PREFIX+run.id,{when:Date.now()+scanTimeoutMs(s)});
    return {ok:true,runId:run.id,tabId:tab.id,count:queue.length,hasTemplate:Boolean(queue[0])};
  }catch(error){await finishRun(run.id,'ERROR',String(error?.message||error));return {ok:false,message:String(error?.message||error)};}
}

async function advanceOrFinish(runId,ok,message){
  const s=await getState();
  const run=s.activeRun;
  if(!run||run.id!==runId)return;
  const queue=run.queue||[];const qi=Number(run.qi||0);
  if(qi<queue.length-1){
    const nextQi=qi+1;const tpl=queue[nextQi];
    await chrome.alarms.clear(TIMEOUT_PREFIX+runId);
    await updateRun(runId,{qi:nextQi,status:'RUNNING',pageDone:false,completionMessage:null,receivedPages:[],querySourceCount:0,queryInvalidCount:0,queryKeys:[],queryDuplicateCount:0,queryTotalElements:null,queryTotalPages:null,message:runningMessage(queue,nextQi)});
    try{
      await chrome.tabs.get(run.tabId);
      await dispatchRunQueryToTab(run.tabId,{...run,qi:nextQi},tpl,s.settings);
      await chrome.alarms.create(TIMEOUT_PREFIX+runId,{when:Date.now()+scanTimeoutMs(s)});
    }catch(e){await finishRun(runId,Number(run.captured||0)>0?'PARTIAL':'ERROR',String(e?.message||e));}
  }else{
    const status=run.partial?'PARTIAL':(ok===false?(Number(run.captured||0)>0?'PARTIAL':'ERROR'):'SUCCESS');
    await finishRun(runId,status,run.partialMessage||message||'Hoàn tất.');
  }
}

function nextDailyTime(hhmm){const [h,m]=String(hhmm||'06:05').split(':').map(Number);const now=new Date();const next=new Date(now);next.setHours(h||0,m||0,0,0);if(next<=now)next.setDate(next.getDate()+1);return next.getTime();}
async function ensureDailyAlarm(){
  await liveCanaryRuntime.hydrate();
  const s=await getState();
  await chrome.alarms.clear(DAILY_ALARM);
  if(s.settings.readOnlyMode){await chrome.alarms.clear(DEADLINE_ALARM);await ensureHuntAlarms([]);return;}
  if(s.settings.autoScan)await chrome.alarms.create(DAILY_ALARM,{when:nextDailyTime(s.settings.dailyTime),periodInMinutes:1440});
  await chrome.alarms.create(DEADLINE_ALARM,{periodInMinutes:30});
  await ensureHuntAlarms(s.hunts);
}

async function ensureHuntAlarms(...args){return huntRuntime.ensureHuntAlarms(...args);}

async function reviewDeadlines(){
  const s=await getState();
  if(s.settings.readOnlyMode)return;
  const sent={...s.deadlineAlerts};
  const now=Date.now();
  const targets=(s.tenders||[]).filter(t=>t.watchlisted||t.decisionState&&t.decisionState!=='NEW'||Number(t.score||0)>=Number(s.settings.alertMinScore||85));
  let changed=false;
  for(const tender of targets.slice(0,80)){
    sent[tender.key]=deadlineReminderState(tender,sent[tender.key]);
    const window=shouldRemindDeadline(tender,sent,now);
    if(!window)continue;
    const nid=`gscb-deadline:${tender.key}:${window.key}`;
    if(tender.detailUrl)notifUrls.set(nid,tender.detailUrl);
    chrome.notifications.create(nid,{type:'basic',iconUrl:'icons/icon128.png',
      title:`Hạn nộp · ${window.label}`,
      message:String(tender.bidName||tender.notifyNo||'').slice(0,160)}).catch(()=>{});
    if(s.settings.telegramEnabled){
      await sendTelegram(s.settings,`⏰ <b>${escapeHtml(window.label)}</b>\n${escapeHtml(tender.bidName||tender.notifyNo)}\n${escapeHtml(tender.displayCode||tender.notifyNo||'')}`,{force:false,kind:'deadline'});
    }
    sent[tender.key]={...(sent[tender.key]||{}),[window.key]:new Date().toISOString()};
    changed=true;
    if(window.key==='h24'){
      const list=checklistItemsFor(tender.category || '');
      const progress=checklistProgress(s.checklists?.[tender.key]||{}, tender.category||'');
      if(progress.done<list.length && !sent[tender.key]?.checklist){
        chrome.notifications.create(`gscb-check:${tender.key}`,{type:'basic',iconUrl:'icons/icon128.png',
          title:'Sát hạn mà checklist chưa đủ',
          message:`${progress.done}/${progress.total} mục · ${String(tender.bidName||'').slice(0,120)}`}).catch(()=>{});
        sent[tender.key]={...sent[tender.key],checklist:new Date().toISOString()};
      }
    }
    const due=checklistDueItems(tender,s.checklists?.[tender.key]||{},tender.category||'');
    if(due.length && !sent[tender.key]?.dueItem){
      chrome.notifications.create(`gscb-due:${tender.key}`,{type:'basic',iconUrl:'icons/icon128.png',
        title:`Checklist sát hạn: ${due[0].label}`,
        message:`Còn ~${due[0].hoursLeft}h · ${String(tender.bidName||'').slice(0,100)}`}).catch(()=>{});
      sent[tender.key]={...sent[tender.key],dueItem:new Date().toISOString()};
      changed=true;
    }
  }
  for(const hd of (s.pastContracts||[]).slice(0,20)){
    const alert=contractExpiryAlert(hd);
    if(alert.ok || sent[`hd:${hd.id}`]) continue;
    chrome.notifications.create(`gscb-hd:${hd.id}`,{type:'basic',iconUrl:'icons/icon128.png',
      title:`HĐ tương tự gần hết cửa sổ ${alert.years||5} năm`,
      message:String(hd.name||'').slice(0,140)+' · '+alert.text}).catch(()=>{});
    sent[`hd:${hd.id}`]=new Date().toISOString();
    changed=true;
  }
  for(const tender of targets.slice(0,80)){
    const notes=guaranteeReminder(tender);
    if(!notes.length || sent[tender.key]?.guarantee) continue;
    chrome.notifications.create(`gscb-bh:${tender.key}`,{type:'basic',iconUrl:'icons/icon128.png',
      title:'Bảo đảm dự thầu',message:notes[0].text}).catch(()=>{});
    sent[tender.key]={...(sent[tender.key]||{}),guarantee:new Date().toISOString()};
    changed=true;
  }
  if(changed)await save({[KEYS.deadlineAlerts]:sent});
}

async function compareOpenEgpDom(){
  const tabs=await chrome.tabs.query({url:'https://muasamcong.mpi.gov.vn/*contractor-selection*'});
  const tab=tabs.find(t=>t.id)&&tabs[0];
  if(!tab?.id){
    await save({[KEYS.domRegression]:{ok:false,at:new Date().toISOString(),message:'Không có tab e-GP đang mở để đối chiếu DOM.'}});
    return {ok:false,message:'Không có tab e-GP đang mở.'};
  }
  let html='';
  try{
    const res=await chrome.tabs.sendMessage(tab.id,{type:'SNAPSHOT_DOM'});
    html=res?.html||'';
  }catch(e){
    return {ok:false,message:String(e?.message||e)};
  }
  const s=await getState();
  const prev=(s.domSnapshots||[])[0]?.html||'';
  const diff=tokenDiff(prev,html);
  const snap=snapshotRecord(html,{url:tab.url});
  const result={...missingSelectors(html),at:new Date().toISOString(),url:tab.url||'',length:html.length,diff,highlight:highlightDiff(diff)};
  await save({[KEYS.domRegression]:result,[KEYS.domSnapshots]:[snap,...(s.domSnapshots||[])].slice(0,8)});
  if(result.miss?.length){
    chrome.notifications.create({type:'basic',iconUrl:'icons/icon128.png',title:'DOM e-GP lệch fixture',
      message:`Thiếu nhóm: ${result.miss.map(m=>m.group).join(', ')}`}).catch(()=>{});
  }
  return {ok:true,...result};
}

async function runHuntById(...args){return huntRuntime.runHuntById(...args);}

async function recordHuntOutcome(...args){return huntRuntime.recordHuntOutcome(...args);}

async function saveObservedTemplate(payload){
  const template=sanitizeRequestTemplate(payload.request,payload.sourcePageUrl,payload.candidateCount||0);if(!template)return {ok:false};
  const {lastObservedTemplate:old}=await appStorage.get({lastObservedTemplate:null});
  if(!old||Number(template.candidateCount)>=Number(old.candidateCount||0)||new Date(template.capturedAt)>new Date(old.capturedAt))await save({[KEYS.lastTemplate]:template});
  return {ok:true,template};
}
async function commitLastTemplate(name){
  const s=await getState();
  if(!s.lastTemplate)return {ok:false,message:'Chưa quan sát thấy yêu cầu tìm kiếm có dữ liệu TBMT. Hãy thực hiện một lần tìm kiếm trên e-GP.'};
  const tpl={...s.lastTemplate,id:makeTemplateId(),name:(name&&String(name).trim())||templateName(s.lastTemplate)};
  const rest=(s.templates||[]).filter(t=>!(t.url===tpl.url&&t.body===tpl.body));
  const templates=[tpl,...rest].slice(0,20);
  await save({[KEYS.template]:tpl,[KEYS.templates]:templates});
  return {ok:true,template:tpl,templates};
}
async function deleteTemplate(id){
  const s=await getState();
  const templates=(s.templates||[]).filter(t=>t.id!==id);
  const patch={[KEYS.templates]:templates};
  if(s.template?.id===id)patch[KEYS.template]=templates[0]||null;
  await save(patch);
  return {ok:true,templates,template:patch[KEYS.template]!==undefined?patch[KEYS.template]:s.template};
}
async function setActiveTemplate(id){
  const s=await getState();
  const tpl=(s.templates||[]).find(t=>t.id===id);
  if(!tpl)return {ok:false,message:'Không tìm thấy bộ lọc.'};
  await save({[KEYS.template]:tpl});
  return {ok:true,template:tpl};
}

function csvEscape(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
async function downloadData(filename,mime,text,saveAs=true){const url=`data:${mime};charset=utf-8,${encodeURIComponent(text)}`;return chrome.downloads.download({url,filename,saveAs,conflictAction:'overwrite'});}

/* --------------------------------------------------------------------------
 *  XUẤT EXCEL
 *
 *  Trước đây mọi bản xuất đều là CSV ngăn bằng dấu phẩy. Excel bản tiếng Việt
 *  lấy dấu CHẤM PHẨY làm dấu ngăn danh sách nên không tách cột — cả dòng dồn
 *  vào ô A. Nay xuất .xlsx thật: đúng cột, tiêu đề in đậm, cố định dòng đầu,
 *  có bộ lọc, số tiền là SỐ THẬT nên cộng và sắp xếp được.
 *  Chi tiết cách dựng tệp nằm ở lib/xlsx.js.
 * ------------------------------------------------------------------------ */
async function downloadXlsx(filename,spec,saveAs=true){
  const bytes=buildXlsx(spec);
  return chrome.downloads.download({
    url:xlsxDataUrl(bytes),filename,saveAs,conflictAction:'uniquify'
  });
}

/** Ngày tháng cho tên tệp. */
const stamp=()=>new Date().toISOString().slice(0,10);

/** Số hoặc null — để ô thiếu giá là ô TRỐNG, không phải "0 đ". */
const numOrNull=v=>(v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v)))?null:Number(v);
async function exportCsv(...args){return exportRuntime.exportCsv(...args);}
function mobileHtml(tenders){
  const data=JSON.stringify(tenders).replace(/</g,'\\u003c');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Giáo Sư Cùi Bắp - Báo cáo điện thoại</title><style>body{font-family:system-ui;margin:0;background:#f5f7fb;color:#0f172a}header{background:#0f172a;color:#fff;padding:16px;position:sticky;top:0}main{max-width:900px;margin:auto;padding:14px}.card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin:10px 0}.score{font-size:24px;font-weight:900}.muted{color:#64748b;font-size:13px}input,select{padding:10px;border:1px solid #cbd5e1;border-radius:9px;width:100%;box-sizing:border-box;margin:5px 0}a{color:#0f766e;font-weight:700}</style></head><body><header><b>📡 Giáo Sư Cùi Bắp</b><div style="font-size:12px">Xuất lúc ${new Date().toLocaleString('vi-VN')}</div></header><main><input id="q" placeholder="Tìm tên gói, tỉnh, chủ đầu tư..."><select id="score"><option value="0">Tất cả điểm</option><option value="55">≥55</option><option value="70">≥70</option><option value="85">≥85</option></select><div id="list"></div></main><script>const D=${data};const q=document.getElementById('q'),s=document.getElementById('score'),l=document.getElementById('list');function esc(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function money(v){return v?Number(v).toLocaleString('vi-VN')+' đ':'Chưa xác định'}function draw(){const k=q.value.toLowerCase(),m=Number(s.value);const a=D.filter(x=>x.score>=m&&JSON.stringify(x).toLowerCase().includes(k)).sort((a,b)=>b.score-a.score);l.innerHTML='<p>'+a.length+' gói thầu</p>'+a.map(x=>'<div class="card"><div class="score">'+x.score+'/100</div><b>'+esc(x.bidName)+'</b><p class="muted">'+esc(x.codeLabel||'Mã TBMT')+': '+esc(x.displayCode||x.notifyNo||x.bidNo||'')+' · '+esc(x.location||'Chưa xác định')+'</p><p>'+esc(x.statusLabel||'')+'</p><p>💰 '+money(x.price)+'</p><p>'+esc(x.recommendation)+'</p><a href="'+esc(x.detailUrl)+'" target="_blank">Mở nguồn e-GP</a></div>').join('')}q.oninput=s.onchange=draw;draw();<\/script></body></html>`;
}
async function exportMobileReport(...args){return exportRuntime.exportMobileReport(...args);}
async function exportBackup(...args){return exportRuntime.exportBackup(...args);}

/* ==========================================================================
 *  TRA CỨU KẾT QUẢ LỰA CHỌN NHÀ THẦU (KQLCNT)
 *
 *  Hai chế độ:
 *    • 'discover' — người dùng nhập TÊN công ty. Dò theo tên để tìm ra các
 *      pháp nhân khớp kèm MÃ SỐ THUẾ của họ, rồi để người dùng chọn đúng
 *      công ty mình cần.
 *    • 'exact'    — đã biết mã số thuế. Lọc thẳng theo `winningCode` nên
 *      không bỏ sót gói nào, kể cả gói trúng theo LIÊN DANH (trường hợp mà
 *      tìm theo tên luôn bỏ sót vì e-GP chỉ ghi tên liên danh).
 * ======================================================================== */

/**
 * Trần số trang cho mỗi chế độ. 0 = KHÔNG giới hạn.
 *
 *   exact    — lấy BẰNG HẾT mọi gói nhà thầu đã trúng, không bỏ sót trang nào.
 *              Mỗi trang 50 bản ghi, nghỉ ~0,9 giây giữa các trang, và người
 *              dùng có thể bấm "Dừng" bất cứ lúc nào.
 *   discover — chỉ là bước phụ để suy ra mã số thuế từ tên công ty nên vẫn
 *              chặn trần; e-GP sắp xếp mới nhất trước nên 10 trang (500 gói)
 *              là quá đủ để lộ diện pháp nhân. Nếu vẫn không thấy, giao diện
 *              hướng dẫn người dùng nhập thẳng mã số thuế.
 */
const WINNER_MAX_PAGES={discover:10,exact:0};

function newLookupId(){return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;}

async function setLookup(patch){
  return withLock(async()=>{
    const s=await getState();
    const next={...(s.winnerLookup||{}),...patch};
    await save({[KEYS.winnerLookup]:next});
    return next;
  });
}

/**
 * Chọn tab e-GP để chạy lượt tra cứu.
 *
 * Ưu tiên DÙNG LẠI một tab đang đứng ở màn hình kết quả và KHÔNG tải lại trang.
 * Lý do: cả bốn tính năng nay đều tự dựng truy vấn, nên chỉ cần một màn hình
 * kết quả bất kỳ có thanh phân trang là đủ — không cần biểu mẫu sạch.
 *
 * Việc luôn tải lại trang như trước bắt mọi lượt tra cứu phải đi qua chuỗi
 * điều-hướng → ghi sessionStorage → khôi phục sau khi tải lại. Chuỗi đó đứt ở
 * bất kỳ mắt nào là ra 0 kết quả mà không có thông báo lỗi.
 */
/**
 * Giao một lượt tra cứu cho tab e-GP, và NÉM LỖI nếu tab từ chối vì đang bận.
 *
 * Phải kiểm tra phản hồi. Bỏ qua nó thì lượt tra cứu bị tab chối từ đầu vẫn được
 * báo là "đã bắt đầu", rồi treo ở trạng thái đang chạy tới khi hết hạn 8 phút —
 * đúng kiểu hỏng im lặng mà cả bản này đang dọn.
 */
async function dispatchLookupToTab(tabId,payload){return queryRuntime.dispatch(tabId,payload);}
async function ensureEgpSearchTab(active){return queryRuntime.acquire(active);}

const ACTIVE_JOB_STATUSES=new Set(['STARTING','OPENING','RUNNING','LISTING','SCANNING']);

/** Giữ chỗ nguyên tử cho một tính năng; chặn double-click tạo job/tab mồ côi. */
async function claimLookupJob(key,job){
  if(['winnerLookup','areaScan','investorScan'].includes(key))job={...job,awardGateVersion:LOOKUP_AWARD_GATE_VERSION};
  return withLock(async()=>{
    const s=await readQueryControlState(chrome.storage.local);
    if(schemaIsRed(s))throw Error(SCHEMA_STOP_MESSAGE);
    const listBusy=activeListJob(s);if(listBusy||queryRuntime.isBusy()||planDetailReader.isRunning()||liveCanaryRuntime.isRunning())return {ok:false,current:listBusy};
    const current=s[key];
    if(current&&ACTIVE_JOB_STATUSES.has(String(current.status||''))){
      return {ok:false,current};
    }
    await save({[KEYS[key]]:job});
    return {ok:true,job};
  });
}

/** Giữ chỗ nguyên tử cho lượt quét TBMT dùng kho activeRun. */
async function claimActiveRun(run){
  return withLock(async()=>{
    const s=await appStorage.get({settings:DEFAULT_SETTINGS,schemaHealth:null,liveCanary:null,activeRun:null,winnerLookup:null,planLookup:null,areaScan:null,investorScan:null,bidOpenScan:null,runs:[]});
    if(schemaIsRed(s))throw Error(SCHEMA_STOP_MESSAGE);
    const listBusy=activeListJob(s);if(listBusy||queryRuntime.isBusy()||planDetailReader.isRunning()||liveCanaryRuntime.isRunning())return {ok:false,current:listBusy};
    if(s.activeRun&&ACTIVE_JOB_STATUSES.has(String(s.activeRun.status||''))){
      return {ok:false,current:s.activeRun};
    }
    await save({[KEYS.runs]:[run,...s.runs].slice(0,100),[KEYS.activeRun]:run});
    return {ok:true,run};
  });
}

/**
 * Bắt đầu một lượt tra cứu. `query` là tên công ty hoặc mã số thuế.
 * Nếu truyền sẵn `taxCode` thì luôn chạy chế độ chính xác.
 */
async function dispatchBatchTask(key,id){
  const s=await readJobState(key),job=s[key];
  if(job?.id!==id||job.cancelled||!isLookupActive(lookupKind(key),job))return;
  const task=batchTask(job);if(!task)throw Error('Thiếu truy vấn trong danh sách chủ đầu tư.');
  await chrome.alarms.create(TIMEOUT_PREFIX+id,{when:Date.now()+RUN_STALE_MS});
  return dispatchLookupToTab(job.tabId,{id,mode:task.mode,queryIndex:Number(job.qi)||0,
    label:`${task.purpose==='province'?'Đối chiếu tỉnh từ TBMT':'Tra chủ đầu tư'} ${Number(job.qi||0)+1}/${job.queryBatch.length} · ${job.label||''}`,
    query:task.query,pageSize:PAGE_SIZE,maxPages:task.maxPages,focusTaxCode:job.focusTaxCode||''});
}

async function advanceLookupBatch(key,id){
  const next=await withLock(async()=>{
    const s=await readJobState(key),job=s[key];
    if(job?.id!==id||job.cancelled||!batchHasNext(job))return null;
    const qi=Number(job.qi||0)+1;
    const row={...job,qi,status:key==='bidOpenScan'?'LISTING':'RUNNING',receivedPages:[],
      queryKeys:[],pageDone:false,finalPageReceipt:null,finishedAt:null,listingDone:false,
      message:`Đang tra mục ${qi+1}/${job.queryBatch.length} trong danh sách chủ đầu tư...`};
    await save({[key]:row});return row;
  });
  if(!next)return false;
  try{await dispatchBatchTask(key,id);}catch(error){await failLookupJob(key,id,String(error?.message||error), 'PARTIAL');}
  return true;
}

async function recordBatchPage(key,id,payload){
  return withLock(async()=>{
    const s=await readJobState(key),job=s[key];if(job?.id!==id||!job.queryBatch)return;
    const index=Number(job.qi)||0,old=job.batchReceipts?.[index]||{};
    const pages=new Set(old.pageIndexes||[]);
    if(!payload.done)pages.add(payload.pageIndex);
    const fetched=Number(old.fetched||0)+(payload.records||[]).length;
    const empty=payload.totalElements===0&&payload.totalPages===0&&fetched===0;
    const receipt=coverageOf({serverTotal:payload.totalElements,totalPages:payload.totalPages,
      pageIndexes:empty?[]:[...pages],fetched,done:payload.done,
      partial:Boolean(old.partial||payload.partial||payload.capped||payload.cancelled||payload.schemaIssue)});
    await save({[key]:{...job,batchReceipts:{...(job.batchReceipts||{}),[index]:receipt}}});
  });
}

async function ingestProvinceEvidence(key,id,payload){
  return withLock(async()=>{
    const s=await readJobState(key,{areas:null}),job=s[key];if(job?.id!==id)return {ok:false};
    const evidence={...(job.provinceEvidence||{})},criteria=job.criteria||{};
    for(const raw of payload.records||[]){
      const row=normalizeCandidate(raw),proof=row&&provinceEvidence(row);
      if(proof&&passesHardFilter(row,{investor:criteria.investor,province:criteria.province,provinces:criteria.provinces},s.areas).ok)evidence[proof.key]=proof;
    }
    await save({[key]:{...job,provinceEvidence:evidence,
      message:`Đang đối chiếu tỉnh: đã ghi nhận ${Object.keys(evidence).length} mã TBMT đúng chủ đầu tư và tỉnh đã chọn...`}});
    return {ok:true};
  });
}

async function finalizeBatchPage(key,id,payload){
  return withLock(async()=>{
    const s=await readJobState(key),job=s[key];if(job?.id!==id||!job.queryBatch)return;
    const states=Object.values(job.resultStates||{}),invalid=Number(job.invalidCount)||0;
    const counts={match:states.filter(r=>r.filterState==='MATCH').length,
      insufficient:states.filter(r=>r.filterState==='INSUFFICIENT').length+invalid,
      outOfRange:states.filter(r=>r.filterState==='OUT_OF_RANGE').length};
    const coverage=batchCoverage(job,job.batchReceipts||{},counts);
    const partial=Boolean(invalid||job.duplicateCount||Object.values(job.batchReceipts||{}).some(c=>c.done&&!c.complete));
    if(partial){coverage.complete=false;coverage.partial=true;}
    const final=payload.done&&!batchHasNext(job)&&batchTask(job)?.purpose==='results';
    const patch={coverage,partial,matchCount:counts.match,insufficientCount:counts.insufficient,outOfRangeCount:counts.outOfRange,
      totalElements:coverage.serverTotal,totalPages:coverage.totalPages,pagesRead:coverage.pagesRead};
    if(key==='bidOpenScan')patch.totalCandidates=coverage.serverTotal;
    if(!final){patch.status=key==='bidOpenScan'?'LISTING':'RUNNING';patch.finishedAt=null;}
    else if(['SUCCESS','PARTIAL'].includes(job.status))patch.status=partial?'PARTIAL':'SUCCESS';
    patch.message=`${job.status==='ERROR' ? `${job.message || 'Lượt tra cứu gặp lỗi.'} ` : ''}${batchTask(job)?.purpose==='province'?'Đang lấy dữ liệu đối chiếu tỉnh. ':''}${coverage.text}`;
    await save({[key]:{...job,...patch}});
  });
}

function classifyLookupRows(rows,job,areas){
  const criteria=job.criteria||{},states={...(job.resultStates||{})};
  const matched=[],unknown=[];
  for(const item of rows){
    const row=enrichProvince(item,job,areas);
    if(job.mode==='profile'&&Array.isArray(criteria.codes)&&criteria.codes.length){
      const canonical=value=>String(value||'').trim().toLowerCase().replace(/^vn/,'');
      const actual=canonical(row.investorCode);
      if(!actual||!criteria.codes.some(code=>canonical(code)===actual)){
        const award=classifyWinningResult(row);
        const state=actual||award.state==='OUT_OF_RANGE'?'OUT_OF_RANGE':'INSUFFICIENT';
        const reason=actual?'investor':award.state==='OUT_OF_RANGE'?award.reason:'insufficient-investor';
        states[row.key]={filterState:state,filterReason:reason};
        if(state==='INSUFFICIENT')unknown.push({...row,filterState:state,filterReason:reason});
        continue;
      }
    }
    let gate=passesHardFilter(row,
      {investor:criteria.investor||criteria.legacyInvestor,province:criteria.province,provinces:criteria.provinces,
        ...(criteria.investor&&criteria.ward?{ward:criteria.ward,wardIdentities:criteria.wardIdentities}:{}),dateFields:false},areas);
    // A published result can be cancelled or omit the winning party. Those
    // records must not become a "winning package" merely by matching its owner.
    const awardGate=classifyWinningResult(row);
    if(gate.state!=='OUT_OF_RANGE'&&(awardGate.state==='OUT_OF_RANGE'||gate.ok))gate=awardGate;
    const next={...row,filterState:gate.state,filterReason:gate.reason};states[row.key]={filterState:gate.state,filterReason:gate.reason};
    if(gate.ok)matched.push(next);else if(gate.state==='INSUFFICIENT')unknown.push(next);
  }
  return {matched,unknown,states};
}

async function startWinnerLookup(payload={}){
  const directoryResolved=await resolveDirectoryPayload(payload);if(!directoryResolved.ok)return directoryResolved;payload=directoryResolved.payload;
  const owners=parseInvestorFilter(payload.investor);if(!owners.ok)return owners;
  const province=String(payload.province||'').trim();
  const resolved=province?await resolveProvinceCodes(province):{ok:true,codes:[]};
  if(!resolved.ok)return {ok:false,message:'Chưa xác định được tỉnh đã chọn; không bỏ qua tiêu chí tỉnh.'};
  const criteria={investor:owners.value,province,provinces:resolved.codes};
  const raw=String(payload.query||'').trim();
  const forcedTax=normalizeTaxCodeForEgp(payload.taxCode||'');
  const taxCode=forcedTax||normalizeTaxCodeForEgp(raw);
  if(!taxCode&&!raw&&!owners.terms.length)return {ok:false,message:'Hãy nhập tên công ty hoặc mã số thuế.'};

  const scopeOnly=!taxCode&&!raw&&owners.terms.length>0;
  const mode=taxCode||scopeOnly?'exact':'discover';
  const label=scopeOnly?`Nhà thầu trúng thầu theo chủ đầu tư: ${owners.value}`:taxCode?`MST ${taxCode}`:`"${raw}"`;
  const queries=mode==='discover'?[buildKqlcntQuery({keyword:raw,matchType:'all-0'})]:buildKqlcntQueries({taxCodes:taxCode?[taxCode]:[],investor:owners.value});
  const queryBatch=lookupBatch(criteria,queries,mode,WINNER_MAX_PAGES[mode],true);
  const id=newLookupId();

  const lookup={
    id,mode,query:raw,focusTaxCode:taxCode,scopeOnly,criteria,queryBatch,qi:0,
    contractorName:String(payload.contractorName||'').trim(),
    label,status:'RUNNING',
    message:mode==='exact'
      ?'Đang hỏi e-GP các gói thầu đã trúng của mã số thuế này...'
      :'Đang dò trên e-GP các nhà thầu khớp tên bạn nhập...',
    startedAt:new Date().toISOString(),finishedAt:null,
    totalElements:0,totalPages:0,capped:false,
    packages:[],candidates:[]
  };
  const claimed=await claimLookupJob('winnerLookup',lookup);
  if(!claimed.ok)return {ok:false,message:'Một lượt tra cứu nhà thầu đang chạy. Hãy chờ hoặc bấm Dừng trước khi tra lại.',lookup:claimed.current};

  try{
    const tab=await ensureEgpSearchTab(payload.focusTab!==false);
    const bound=await bindLookupTab('winnerLookup',id,tab.id);
    await dispatchBatchTask('winnerLookup',id);
    await chrome.alarms.create(TIMEOUT_PREFIX+id,{when:Date.now()+RUN_STALE_MS});
    return {ok:true,lookup:bound};
  }catch(error){
    const message=String(error?.message||error);
    await failLookupJob('winnerLookup',id,message);
    return {ok:false,message};
  }
}

/** Nhận từng trang kết quả do content script gửi về và tổng hợp dần. */
async function ingestWinnerPage(payload={}){
  return withLock(async()=>{
    const s=await readJobState('winnerLookup',{areas:null,winnerCache:{}});
    const lookup=s.winnerLookup;
    if(!lookup||lookup.id!==payload.planId)return {ok:false};

    const rows=Array.isArray(payload.records)?payload.records:[];
    const next={
      ...lookup,
      totalElements:Number(payload.totalElements||lookup.totalElements||0),
      totalPages:Number(payload.totalPages||lookup.totalPages||0),
      capped:Boolean(payload.capped||lookup.capped)
    };

    // Đếm SỐ DÒNG THÔ e-GP trả về, tách khỏi số gói khớp mã số thuế.
    // Hai số này khác nhau là dấu hiệu chẩn đoán quan trọng: nếu e-GP trả về
    // hàng nghìn dòng mà không dòng nào khớp MST, tức truy vấn đã KHÔNG được
    // ghi đè và phần mềm đang đọc kết quả của từ khoá gieo tạm. Trước đây cả
    // hai trường hợp đều ra cùng một câu "không ghi nhận gói nào", nên lỗi bị
    // che mất và người dùng tưởng công ty chưa từng trúng thầu.
    next.rowsSeen=Number(lookup.rowsSeen||0)+rows.length;

    if(lookup.mode==='exact'){
      const all=rows.map(r=>normalizeKqlcntRecord(r,lookup.focusTaxCode)).filter(Boolean);
      const replacedKeys=new Set(all.map(row=>row.key));
      next.invalidCount=Number(lookup.invalidCount||0)+rows.length-all.length;
      const identity=all.filter(row=>!lookup.focusTaxCode||row.matchedFocus);
      const wrongIdentity=Object.fromEntries(all.filter(row=>lookup.focusTaxCode&&!row.matchedFocus).map(row=>[row.key,{filterState:'OUT_OF_RANGE',filterReason:'contractor'}]));
      const classified=classifyLookupRows(identity,{...lookup,resultStates:{...(lookup.resultStates||{}),...wrongIdentity}},s.areas),normalized=classified.matched;
      next.resultStates=classified.states;next.insufficientPackages=dedupeKqlcnt([...(lookup.insufficientPackages||[]).filter(row=>!replacedKeys.has(row.key)),...classified.unknown]);
      next.identityRows=Number(lookup.identityRows||0)+identity.length;
      next.packages=dedupeKqlcnt([...(lookup.packages||[]).filter(row=>!replacedKeys.has(row.key)),...normalized]);
      for(const p of normalized)obsQueue.push(...observationsFromWinner(p));
      next.message=`Đã lấy ${next.packages.length}/${next.totalElements||next.packages.length} gói trúng thầu...`;
    }else{
      const eligibleMap=new Map((lookup.candidateSourceRows||[]).map(raw=>[normalizeKqlcntRecord(raw)?.key,raw]).filter(([key])=>key));
      next.invalidCount=Number(lookup.invalidCount||0);
      rows.forEach(raw=>{
        const normalized=normalizeKqlcntRecord(raw);if(!normalized)return false;
        eligibleMap.delete(normalized.key);
        next.insufficientPackages=(next.insufficientPackages||[]).filter(row=>row.key!==normalized.key);
        const classified=classifyLookupRows([normalized],{...lookup,resultStates:next.resultStates||lookup.resultStates},s.areas);
        next.resultStates=classified.states;
        next.insufficientPackages=dedupeKqlcnt([...(next.insufficientPackages||[]),...classified.unknown]);
        if(classified.matched.length)eligibleMap.set(normalized.key,raw);
      });
      next.invalidCount+=rows.filter(raw=>!normalizeKqlcntRecord(raw)).length;
      next.candidateSourceRows=[...eligibleMap.values()];
      const found=extractContractorCandidates(next.candidateSourceRows,lookup.query);
      const map=new Map();
      for(const c of found){
        const old=map.get(c.taxCode);
        map.set(c.taxCode,old?{...old,hits:old.hits+c.hits}:c);
      }
      next.candidates=[...map.values()].sort((a,b)=>b.hits-a.hits);
      next.message=`Đã tìm thấy ${next.candidates.length} nhà thầu khớp tên...`;
    }

    const patch={[KEYS.winnerLookup]:next};

    if(payload.done){
      next.status='SUCCESS';
      next.finishedAt=new Date().toISOString();
      next.cancelled=Boolean(payload.cancelled);
      if(lookup.mode==='exact'){
        setTimeout(flushObservations,0);
        next.summary=summarizeWinner(next.packages);
        next.contractorName=next.contractorName
          ||(next.packages.find(p=>!p.isVenture)?.winnerName)
          ||(next.packages[0]?.winnerName)||'';
        if(next.packages.length){
          next.message=`${next.packages.length} gói đã trúng thầu${next.cancelled?' (đã dừng giữa chừng, chưa lấy hết)':''}.`;
        }else if(next.identityRows>0||lookup.scopeOnly){
          next.message=`Không có gói trúng thầu khớp phạm vi đã chọn; ${(next.insufficientPackages||[]).length} gói chưa đủ dữ liệu đối chiếu.`;
        }else if(next.rowsSeen>0){
          // e-GP CÓ trả dữ liệu nhưng không dòng nào mang mã số thuế này: truy
          // vấn của phần mềm đã không tới được e-GP. Nói thẳng ra thay vì kết
          // luận sai rằng nhà thầu chưa từng trúng thầu.
          next.status='ERROR';
          next.diagnosis='QUERY_NOT_APPLIED';
          next.message=`Lỗi kỹ thuật, KHÔNG phải "chưa trúng thầu": e-GP trả về ${next.rowsSeen} dòng `
            +`nhưng không dòng nào mang MST ${next.focusTaxCode} — truy vấn của phần mềm chưa được áp lên trang e-GP. `
            +'Hãy đóng hết tab muasamcong, mở lại một tab Tra cứu › Lựa chọn nhà thầu, rồi tra lại.';
        }else{
          next.message=`e-GP không trả về dòng nào cho MST ${next.focusTaxCode}. `
            +'Kiểm tra lại mã số thuế, hoặc công ty này chưa từng được công bố trúng thầu.';
        }
        // Lưu vào danh bạ để lần sau xem lại ngay không cần tra lại.
        // CHỈ lưu khi lượt tra thành công: ghi lại một lượt lỗi thành "0 gói"
        // sẽ đóng đinh kết quả sai vào danh bạ, và lần sau người dùng thấy ngay
        // con số 0 đó mà tưởng là thật.
        if(next.focusTaxCode&&next.status==='SUCCESS'&&next.packages.length&&!lookup.criteria?.investor&&!lookup.criteria?.province){
          const cache={...(s.winnerCache||{})};
          cache[next.focusTaxCode]={
            taxCode:next.focusTaxCode,
            name:next.contractorName,
            total:next.packages.length,
            totalValue:next.summary.totalValue,
            updatedAt:next.finishedAt,
            packages:next.packages
          };
          patch[KEYS.winnerCache]=cache;
        }
      }else{
        next.message=next.candidates.length
          ?`Tìm thấy ${next.candidates.length} nhà thầu khớp tên. Hãy chọn đúng công ty để xem toàn bộ gói đã trúng.`
          :'Không thấy nhà thầu nào khớp tên. Hãy thử nhập ngắn gọn hơn, hoặc nhập thẳng mã số thuế.';
      }
    }

    patch[KEYS.winnerLookup]=next;
    await save(patch);
    return {ok:true};
  });
}

/** Yêu cầu tab e-GP dừng lượt tra cứu đang chạy. */
async function cancelWinnerLookup(){
  return cancelLookups('winnerLookup');
}

async function finishWinnerLookup(payload={}){
  const s=await getState();
  const id=String(payload.planId||'');
  if(!id||s.winnerLookup?.id!==id)return {ok:true,ignored:true};
  if(payload.ok===false)await failLookupJob('winnerLookup',id,payload.message||'Lượt tra cứu bị gián đoạn.');
  return {ok:true};
}

async function exportWinnersCsv(...args){return exportRuntime.exportWinnersCsv(...args);}

/* ==========================================================================
 *  SOI BIÊN BẢN MỞ THẦU — gói ĐÃ MỞ THẦU, CHƯA CÓ KẾT QUẢ
 *
 *  Khác hẳn tra cứu KQLCNT: e-GP KHÔNG lập chỉ mục nhà thầu tham dự ở giai
 *  đoạn mở thầu (xem phần kiểm chứng đầu tệp lib/bbmt.js), nên không thể hỏi
 *  thẳng "công ty X đang dự gói nào". Bắt buộc phải làm hai giai đoạn:
 *
 *    1. Lấy danh sách gói đang chờ kết quả theo bộ lọc người dùng (rẻ, máy chủ
 *       lọc sẵn, 50 gói mỗi request).
 *    2. Mở lần lượt trang Biên bản mở thầu của từng gói để đọc bảng nhà thầu
 *       (đắt, ~3 giây mỗi gói) — nên LUÔN có trần và nút dừng.
 * ======================================================================== */

// Wait for actual data, not the document load event. Two bounded readers let
// a slow detail page coexist with a fast one. No API request replay.
const BBMT_DETAIL_TIMEOUT=25000;
const BBMT_NAVIGATION_TIMEOUT=45000;
const BBMT_TOTAL_TIMEOUT=90000;
const BBMT_DETAIL_ALARM_MS=60000;
let bbmtWaiter=null; // coordinator: scanId, waiters, resolve (cancel all)
let bbmtCancelled=false;
const getBidScan=async()=> (await chrome.storage.local.get('bidOpenScan')).bidOpenScan;
async function setScan(patch,id){
  return withLock(async()=>{
    const current=await getBidScan();
    if(!current||(id&&current.id!==id)||!isLookupActive(lookupKind('bidOpenScan'),current))return null;
    const next={...current,...patch,lastProgressAt:new Date().toISOString()};
    await save({bidOpenScan:next});return next;
  });
}

/** Bắt đầu giai đoạn 1: lấy danh sách gói đang chờ kết quả. */
async function startBidOpenScan(payload={}){
  const directoryResolved=await resolveDirectoryPayload(payload);if(!directoryResolved.ok)return directoryResolved;payload=directoryResolved.payload;
  const owners=parseInvestorFilter(payload.investor);if(!owners.ok)return owners;
  const raw=String(payload.query||'').trim();
  const taxCode=normalizeTaxCodeForEgp(payload.taxCode||raw);
  /* Quy TÊN tỉnh ra MỌI MÃ cùng tên. Sau sáp nhập 1/7/2025 một tỉnh mang hai
     mã (Lâm Đồng = 68 hiện hành + 703 cũ), gửi thiếu mã là bỏ sót hồ sơ cũ. */
  const provinceName=String(payload.province||'').trim();
  let provinces=[];
  if(provinceName){
    const areas=(await getProvincesOnly()).areas;
    if(areas)provinces=provinceCodesByName(areas.provinces,provinceName);
    if(!provinces.length)return {ok:false,message:'Chưa xác định được mã tỉnh. Hãy chọn tên trong danh sách gợi ý rồi thử lại.'};
  }

  /* CHE DO DO GOI TRUOT
   *  Mac dinh (mode khac 'loss') giu nguyen hanh vi cu: quet goi DANG CHO ket qua.
   *  Che do 'loss' nham vao goi DA CO ket qua (buoc 4) roi doc bang nha thau tung
   *  goi — do la cach duy nhat thay duoc goi ma nha thau CO du nhung nguoi khac
   *  thang. Xem chu thich STEPS_DECIDED trong lib/bbmt.js. */
  const lossMode=String(payload.mode||'')==='loss';

  const scope={
    steps:lossMode?STEPS_DECIDED:undefined,
    // Khoảng ngày do người dùng tự chọn được ưu tiên hơn khoảng năm và "N ngày
    // gần đây"; thứ tự ưu tiên nằm trong bbmtDateRange() của lib/bbmt.js.
    fromDate:String(payload.fromDate||'').trim(),
    toDate:String(payload.toDate||'').trim(),
    fromYear:Number(payload.fromYear)||0,
    toYear:Number(payload.toYear)||0,
    days:lossMode?0:(Number(payload.days)||30),
    field:String(payload.field||''),
    keyword:String(payload.keyword||'').trim(),
    investor:owners.value,
    province:provinceName,
    provinces,
    minPrice:Number(payload.minPrice)||0,
    maxPrice:Number(payload.maxPrice)||0
  };
  const validation=validateCriteria({...scope,keyword:scope.keyword||'Biên bản mở thầu'});
  if(!validation.ok)return {ok:false,message:validation.message};
  if(scope.fromDate&&scope.toDate&&scope.fromDate>scope.toDate)return {ok:false,message:'Ngày kết thúc phải từ ngày bắt đầu trở đi.'};
  scope.dateRange=dateRangeFrom(scope);
  const maxPackages=Math.max(1,Math.min(Number(payload.maxPackages)||150,600));
  const id=newLookupId();

  // The detail-reading limit is not a source-page limit: source pages can mix
  // opening years. Owner searches read their full history; broad provincial
  // searches have an independent 2,000-row budget and explicit partial scope.
  const queryBatch=lookupBatch(scope,investorScopes(scope).map(buildBbmtQuery),'bbmt-list',scope.investor||scope.keyword?0:40);
  const scan={
    id,status:'LISTING',queryBatch,qi:0,
    contractorQuery:raw,focusTaxCode:taxCode,
    contractorName:String(payload.contractorName||'').trim(),
    scope,maxPackages,mode:lossMode?'loss':'pending',
    message:lossMode
      ?'Đang lấy danh sách gói ĐÃ CÓ KẾT QUẢ để dò gói bạn dự mà không trúng...'
      :'Đang lấy danh sách gói đã mở thầu nhưng chưa có kết quả...',
    startedAt:new Date().toISOString(),finishedAt:null,
    totalCandidates:0,totalPages:0,pagesRead:0,listedRows:0,listingCapped:false,
    packages:[],scannedCount:0,cancelled:false
  };
  const claimed=await claimLookupJob('bidOpenScan',scan);
  if(!claimed.ok)return {ok:false,message:'Một lượt soi biên bản mở thầu đang chạy. Hãy chờ hoặc bấm Dừng trước khi chạy lại.',scan:claimed.current};
  bbmtCancelled=false;

  try{
    const tab=await ensureEgpSearchTab(payload.focusTab!==false);
    const bound=await bindLookupTab('bidOpenScan',id,tab.id);
    await dispatchBatchTask('bidOpenScan',id);
    await chrome.alarms.create(TIMEOUT_PREFIX+id,{when:Date.now()+RUN_STALE_MS});
    return {ok:true,scan:bound};
  }catch(error){
    const message=String(error?.message||error);
    await failLookupJob('bidOpenScan',id,message);
    return {ok:false,message};
  }
}

/** Nhận từng trang danh sách của giai đoạn 1. */
async function ingestBidOpenList(payload={}){
  const done=await withLock(async()=>{
    const s=await readJobState('bidOpenScan'),scan=s.bidOpenScan;
    if(!scan||scan.id!==payload.planId)return false;
    const rows=Array.isArray(payload.records)?payload.records:[];
    const all=rows.map(normalizeBbmtPackage).filter(Boolean);
    const sourceKeys=extendSourceKeys(scan.queryBatch?scan.queryKeys:Object.keys(scan.resultStates||{}),all.map(p=>p.key));
    const duplicateCount=Number(scan.duplicateCount||0)+sourceKeys.duplicates;
    const range=bbmtDateRange(scan.scope||{});
    const criteria={...(scan.scope||{}),category:scan.scope?.field||'',fromDate:'',toDate:'',fromYear:0,toYear:0,days:0,dateRange:null};
    const cache=(await chrome.storage.local.get('bidOpenCache')).bidOpenCache||{};
    const matched=[],unknown=[],resultStates={...(scan.resultStates||{})};
    for(const p of all){
      const hard=passesHardFilter(p,criteria),date=dateGate(bbmtStamp(p),range);
      const state=hard.state==='OUT_OF_RANGE'||date==='OUT_OF_RANGE'?'OUT_OF_RANGE':hard.state==='INSUFFICIENT'||date==='INSUFFICIENT'?'INSUFFICIENT':'MATCH';
      const reason=hard.state!=='MATCH'?hard.reason:date==='INSUFFICIENT'?'insufficient-date':date==='OUT_OF_RANGE'?'date':'';
      const row={...p,filterState:state,filterReason:reason};
      resultStates[p.key]={filterState:state,filterReason:reason};
      if(state==='MATCH')matched.push(restoreOpening(row,cache[p.key]));
      if(state==='INSUFFICIENT')unknown.push(row);
    }
    const pageKeys=new Set(all.map(p=>p.key));
    const map=new Map((scan.sourceMatchedPackages||scan.packages||[]).filter(p=>!pageKeys.has(p.key)).map(p=>[p.key,p]));
    for(const p of matched)map.set(p.key,p);
    const sourceMatchedPackages=[...map.values()].sort((a,b)=>(bbmtStamp(b)??-Infinity)-(bbmtStamp(a)??-Infinity)||String(a.key).localeCompare(String(b.key)));
    const packages=sourceMatchedPackages.slice(0,scan.maxPackages);
    const insufficientPackages=[...new Map([...(scan.insufficientPackages||[]).filter(p=>!pageKeys.has(p.key)),...unknown].map(p=>[p.key,p])).values()];
    const states=Object.values(resultStates);
    const outOfRangeCount=states.filter(p=>p.filterState==='OUT_OF_RANGE').length;
    const dateUnknown=insufficientPackages.filter(p=>dateGate(bbmtStamp(p),range)==='INSUFFICIENT').length;
    const listedRows=Number(scan.listedRows||0)+rows.length;
    const invalidCount=Number(scan.invalidCount||0)+rows.length-all.length;
    const listingCapped=Boolean(scan.listingCapped||payload.capped||map.size>packages.length);
    const coverage=pageCoverage(scan,{...payload,capped:listingCapped,partial:Boolean(payload.partial||duplicateCount)},{fetched:listedRows,
      match:states.filter(p=>p.filterState==='MATCH').length,
      insufficient:states.filter(p=>p.filterState==='INSUFFICIENT').length+invalidCount,
      outOfRange:outOfRangeCount,invalid:invalidCount});
    const partial=Boolean(scan.partial||payload.partial||listingCapped||payload.schemaIssue||invalidCount||duplicateCount||(payload.done&&!coverage.complete));
    const next={...scan,queryKeys:sourceKeys.keys,packages,sourceMatchedPackages,detailSelectionCount:packages.length,matchedCandidateCount:sourceMatchedPackages.length,insufficientPackages,resultStates,outOfRangeCount,dateUnknown,invalidCount,duplicateCount,coverage,
      totalCandidates:coverage.serverTotal,totalPages:coverage.totalPages,pagesRead:coverage.pagesRead,
      listedRows,listingCapped,partial,schemaIssue:Boolean(scan.schemaIssue||payload.schemaIssue||invalidCount),
      message:`Đã tìm ${packages.length} gói chờ kết quả; ${insufficientPackages.length} gói chưa đủ dữ liệu đối chiếu. ${coverage.text}`};
    if(payload.done)next.listingDone=true;
    await save({[KEYS.bidOpenScan]:next});return Boolean(payload.done&&!scan.listingDone);
  });
  if(done)void startBidOpenDetailPhase(payload.planId).catch(e=>failLookupJob('bidOpenScan',payload.planId,String(e.message||e)));
  return {ok:true};
}

/** Read at most two official detail pages concurrently; publish each result. */
async function startBidOpenDetailPhase(scanId,selectedKeys=null){
  const scan=await getBidScan();
  if(!scan||scan.id!==scanId||!isLookupActive(lookupKind('bidOpenScan'),scan))return;
  const list=scan.packages||[];
  const queue=list.filter(p=>selectedKeys?selectedKeys.includes(p.key):!['OK','EMPTY'].includes(bbmtReadStateOf(p)));
  const job={scanId,waiters:new Map(),cancelled:false,blocked:false,failures:0,extraTabs:scan.ownedDetailTab?[scan.ownedDetailTab]:[],
    resolve(){this.cancelled=true;for(const w of [...this.waiters.values()])w.resolve(null);}};
  bbmtWaiter=job;
  if(!await setScan({status:'SCANNING',cachedCount:list.filter(p=>p.fromCache).length,
    message:'Đang đọc bảng nhà thầu; kết quả hiện ngay khi từng gói trả về.'},scanId))return;
  let cursor=0;
  try{
    if(!queue.length){await finalizeBidOpenScan(scanId);return;}
    // Keep the reusable list tab on its search page. Only these owned detail
    // tabs are navigated and closed by the BBMT reader (at most two).
    const tab=scan.ownedDetailTab?await chrome.tabs.get(scan.ownedDetailTab):await chrome.tabs.create({url:'about:blank',active:false});
    if(!job.extraTabs.includes(tab.id))job.extraTabs.push(tab.id);
    const tabIds=[tab.id];
    if(queue.length>1){
      const extra=await chrome.tabs.create({url:'about:blank',active:false});
      job.extraTabs.push(extra.id);tabIds.push(extra.id);
    }
    if(!await setScan({detailTabIds:tabIds},scanId))return;
    async function reader(tabId){
      while(!job.cancelled&&!job.blocked){
        const index=cursor++;if(index>=queue.length)return;
        const pkg=queue[index];
        let result=null;
        for(let attempt=1;attempt<=2&&!job.cancelled;attempt++){
          if(!await markOpeningReading(scanId,pkg.key,attempt))return;
          await chrome.alarms.create(TIMEOUT_PREFIX+scanId,{when:Date.now()+BBMT_DETAIL_ALARM_MS});
          result=await openBbmtDetail(tabId,pkg,job);
          if(job.cancelled)return;
          await recordBidders(scanId,pkg.key,result);
          if(result!==null&&(!result.incomplete||result.retryable===false))break;
          if(attempt===1)await new Promise(r=>setTimeout(r,800));
        }
        job.failures=result===null||result.rows===null?job.failures+1:0;
        if(job.failures>=4)job.blocked=true;
        if(!job.cancelled)await new Promise(r=>setTimeout(r,250));
      }
    }
    await Promise.all(tabIds.map(reader));
    if(!job.cancelled)await finalizeBidOpenScan(scanId);
  }finally{
    job.resolve();
    if(bbmtWaiter===job)bbmtWaiter=null;
    // Only tabs created by this coordinator are closed.
    await Promise.all(job.extraTabs.map(id=>chrome.tabs.remove(id).catch(()=>{})));
  }
}

async function markOpeningReading(id,key,attempt){
  return withLock(async()=>{
    const scan=await getBidScan();
    if(!scan||scan.id!==id||scan.cancelled||scan.status!=='SCANNING')return false;
      await save({bidOpenScan:{...scan,lastProgressAt:new Date().toISOString(),
      packages:scan.packages.map(p=>p.key===key?{...p,readState:'READING',attempt,fromCache:false}:p),
      message:'Đang đọc '+scan.packages.filter(p=>['OK','EMPTY'].includes(p.readState)).length+'/'+scan.packages.length+' biên bản · tối đa 2 gói cùng lúc'}});
    return true;
  });
}

function openBbmtDetail(tabId,pkg,job){
  return new Promise(resolve=>{
    let finished=false;
    let dataTimer=null;
    const waiter={scanId:job.scanId,private:Boolean(job.private),tabId,pkg,resolve:finish,packageRows:null,lotRows:null,
      packageNativeRows:null,lotNativeRows:null,packageDomRows:null,lotDomRows:null,metadata:null,consider,progress,publish,
      pageFailure(code){
        const message=code==='ACCESS_DENIED'?'Trang e-GP đang từ chối truy cập; hãy kiểm tra tab nguồn trước khi đọc lại.'
          :'Trang chi tiết e-GP báo thành phần tạm thời không khả dụng; chưa thể đọc biên bản.';
        finish({...deadlineResult(message),incomplete:true,incompleteReason:message,retryable:false});
      }};
    const navigationTimer=setTimeout(()=>finish(deadlineResult('Trang chi tiết e-GP chưa tải được trong thời gian chờ.')),BBMT_NAVIGATION_TIMEOUT);
    const totalTimer=setTimeout(()=>finish(deadlineResult('Lượt đọc đã đạt giới hạn thời gian; giữ lại dữ liệu đã nhận.')),BBMT_TOTAL_TIMEOUT);
    function deadlineResult(message){
      return selectResult(true)||{rows:null,metadata:waiter.metadata,incomplete:true,incompleteReason:message,retryable:true};
    }
    function finish(result){
      if(finished)return;finished=true;clearTimeout(navigationTimer);clearTimeout(dataTimer);clearTimeout(totalTimer);
      if(job.waiters.get(tabId)?.resolve===finish)job.waiters.delete(tabId);
      resolve(result);
    }
    function progress(){
      if(finished||job.cancelled||job.waiters.get(tabId)!==waiter)return;
      clearTimeout(navigationTimer);clearTimeout(dataTimer);
      // Start/rearm the data window only after a usable DOM or an actual
      // data response arrives. First-byte/document-start is still navigation.
      // The independent total timer cannot be extended.
      dataTimer=setTimeout(()=>finish(deadlineResult('Chưa nhận đủ dữ liệu từ e-GP sau lần phản hồi gần nhất.')),BBMT_DETAIL_TIMEOUT);
      if(!job.private)void chrome.alarms.create(TIMEOUT_PREFIX+job.scanId,{when:Date.now()+BBMT_DETAIL_ALARM_MS}).catch(()=>{});
    }
    function selectResult(fallback=false){
      const m=waiter.metadata;
      const metadataKnown=m?.roundReceived===true&&typeof m?.isMultiLot==='boolean';
      const priceReceived=m?.notifyReceived===true;
      const expectedKind=m?.isMultiLot===true?'lot':'package';
      let kind=expectedKind,rows=metadataKnown?(expectedKind==='lot'?waiter.lotRows:waiter.packageRows):null;
      if(fallback&&rows===null){rows=waiter.lotRows??waiter.packageRows;kind=waiter.lotRows!==null?'lot':'package';}
      if(rows===null)return null;
      const sourceMatches=metadataKnown&&kind===expectedKind;
      const count=new Set(normalizeBidderTable(rows,null).map(b=>b.taxCode||b.nameFold)).size;
      const incomplete=!sourceMatches||!priceReceived||count<Number(pkg.numBidderJoin||0);
      if(!fallback&&incomplete)return null;
      const incompleteReason=!metadataKnown?'Chưa nhận được thông tin xác định loại biên bản; bảng tạm chưa dùng để đối chiếu giá toàn gói.'
        :!priceReceived?'Chưa nhận được phản hồi xác minh giá mốc của biên bản; bảng tạm chưa dùng để đối chiếu giá toàn gói.'
        :!sourceMatches?'Chưa nhận được bảng đúng loại biên bản; dữ liệu tạm chưa dùng để đối chiếu giá toàn gói.'
        :incomplete?'Số nhà thầu đọc được còn ít hơn số e-GP công bố; bảng này chưa đầy đủ.':'';
      return {rows,metadata:m,kind,incomplete,incompleteReason,comparisonPending:!sourceMatches||!priceReceived};
    }
    function consider(){
      // Notify metadata and bidder tables arrive independently. Do not certify
      // an opening before its package/lot classification has actually arrived.
      const result=selectResult();if(result)finish(result);
    }
    function publish(){
      if(finished||job.cancelled||job.private)return Promise.resolve();
      const snapshot=selectResult(true);
      return snapshot?publishOpeningProgress(waiter,snapshot):Promise.resolve();
    }
    job.waiters.set(tabId,waiter);
    chrome.tabs.update(tabId,{url:pkg.detailUrl}).catch(()=>finish({...deadlineResult('Không mở được tab chi tiết e-GP.'),retryable:false}));
  });
}

async function onBbmtContentReady(payload={},senderTabId=null){
  const waiter=bbmtWaiter?.waiters.get(senderTabId);
  if(!waiter||bbmtWaiter.cancelled||!sameBbmtDetailPage(waiter.pkg.detailUrl,payload.url))return {ok:true,ignored:true};
  // Receiving the first byte does not mean the document and its scripts are
  // ready. Keep the navigation deadline until DOMContentLoaded; stale or
  // unknown readiness phases must not shorten or refresh the API window.
  if(payload.phase!=='dom-ready')return {ok:true,ignored:true};
  if(payload.pageError){waiter.pageFailure(payload.pageError);return {ok:true};}
  waiter.progress();return {ok:true};
}

/** Private canary detail read: uses the same identity/metadata receipt rules,
 * with no bidder persistence, observations, cache, timeout alarm or alerts. */
async function readOpening(pkg,{timeoutMs=45_000}={}){
  await queryRuntime.assertAllowed({probe:true});
  if(bbmtWaiter)return {status:'BUSY',rows:null,incomplete:true,incompleteReason:'Đang có lượt đọc BBMT khác.'};
  if(!pkg?.notifyNo||!isEgpUrl(pkg.detailUrl))return {status:'ERROR',rows:null,incomplete:true,incompleteReason:'Thiếu mã hoặc liên kết BBMT chính thức.'};
  const tab=await chrome.tabs.create({url:'about:blank',active:false});
  const job={private:true,scanId:`canary-bbmt-${crypto.randomUUID()}`,waiters:new Map(),cancelled:false,
    resolve(){this.cancelled=true;for(const waiter of [...this.waiters.values()])waiter.resolve(null);}};
  bbmtWaiter=job;
  let timer;
  try{
    timer=setTimeout(()=>job.resolve(),Math.max(100,timeoutMs));
    const result=await openBbmtDetail(tab.id,pkg,job);
    return {...(result||{rows:null,incomplete:true,incompleteReason:'Kiểm tra biên bản quá thời gian.'}),status:result?'OK':'TIMEOUT'};
  }finally{clearTimeout(timer);job.resolve();if(bbmtWaiter===job)bbmtWaiter=null;await chrome.tabs.remove(tab.id).catch(()=>{});}
}

async function publishOpeningProgress(waiter,result){
  return withLock(async()=>{
    const scan=await getBidScan();
    if(!scan||scan.id!==waiter.scanId||scan.status!=='SCANNING'||scan.cancelled||bbmtWaiter?.cancelled||
      bbmtWaiter?.waiters.get(waiter.tabId)!==waiter)return;
    const packages=scan.packages.map(p=>p.key===waiter.pkg.key?applyOpeningResult(p,result,true):p);
    // Provisional rows are visible, but never enter the completed cache or
    // observations. Final completion later replaces this same package.
    await save({bidOpenScan:{...scan,packages,lastProgressAt:new Date().toISOString()}});
  });
}

/** Resume only selected/unread packages; no repeat of the listing phase. */
async function retryBidOpen(payload={}){
  const previous=await getBidScan();
  if(!previous)return {ok:false,message:'Chưa có danh sách để đọc lại.'};
  if(isLookupActive(lookupKind('bidOpenScan'),previous))return {ok:false,message:'Hãy chờ lượt hiện tại hoàn tất hoặc bấm Dừng.'};
  const keys=payload.key?previous.packages.filter(p=>p.key===payload.key).map(p=>p.key)
    :previous.packages.filter(p=>!['OK','EMPTY'].includes(bbmtReadStateOf(p))).map(p=>p.key);
  if(!keys.length)return {ok:false,message:'Không còn gói chưa đọc trong danh sách.'};
  const id=newLookupId();
  const claimed=await claimLookupJob('bidOpenScan',{...previous,id,status:'LISTING',cancelled:false,
    partial:Boolean(previous.listPartial||previous.listingCapped),startedAt:new Date().toISOString(),finishedAt:null,
    detailTabIds:[],ownedDetailTab:null,message:'Đang mở lại các biên bản được chọn…'});
  if(!claimed.ok)return {ok:false,message:'Một lượt đọc khác vừa bắt đầu.'};
  try{
    const state=await getState();
    const reserved=new Set([state.activeRun,...LOOKUP_KINDS.filter(k=>k.key!=='bidOpenScan').map(k=>state[k.key])]
      .filter(j=>j&&ACTIVE_JOB_STATUSES.has(j.status)).map(j=>j.tabId));
    let tab=null;
    if(Number.isInteger(previous.tabId)&&!reserved.has(previous.tabId)){
      try{const old=await chrome.tabs.get(previous.tabId);if(isEgpUrl(old.url))tab=old;}catch{}
    }
    if(!tab){tab=await chrome.tabs.create({url:'about:blank',active:false});await setScan({ownedDetailTab:tab.id},id);}
    await bindLookupTab('bidOpenScan',id,tab.id);
    void startBidOpenDetailPhase(id,keys).catch(e=>failLookupJob('bidOpenScan',id,String(e.message||e)));
    return {ok:true};
  }catch(e){await failLookupJob('bidOpenScan',id,String(e.message||e));return {ok:false,message:String(e.message||e)};}
}

/** content script báo về bảng nhà thầu của trang biên bản đang mở. */
/**
 * Ghi lại e-GP đã gọi endpoint nào, kèm hình dạng phản hồi.
 *
 * CHỈ hình dạng: đường dẫn, phương thức, mã HTTP, tên trường cấp một, số bản
 * ghi. Không lưu giá trị nào — không tên công ty, không mã số thuế, không giá.
 * Mục đích duy nhất là để biết trang nào của e-GP lấy dữ liệu từ đâu, thay vì
 * đoán mò như mấy lần vừa rồi.
 */
async function recordEndpointSeen(payload={}){
  const path=String(payload.path||'').slice(0,300);
  if(!path)return {ok:false};
  const method=String(payload.method||'GET').toUpperCase();
  return withLock(async()=>{
    const s=await appStorage.get({endpointMap:[],schemaHealth:null});
    const list=s.endpointMap||[];
    const key=method+' '+path;
    const previous=list.find(x=>x.key===key);
    const row={key,path,method,
      status:Number(payload.status)||0,
      kieu:String(payload.kieu||''),
      soBanGhi:payload.soBanGhi==null?null:Number(payload.soBanGhi),
      truong:(payload.truong||[]).slice(0,40).map(x=>String(x).slice(0,60)),
      trang:String(payload.trang||'').slice(0,200),
      luc:payload.luc||new Date().toISOString(),
      firstSeenAt:previous?.firstSeenAt||previous?.luc||payload.luc||new Date().toISOString(),
      observedCount:Math.min(1_000_000,Math.max(1,Number(previous?.observedCount)||1)+(previous?1:0))};
    // Giữ 80 endpoint gần nhất là quá đủ để dựng bản đồ một cổng thông tin.
    await save({[KEYS.endpointMap]:[row,...list.filter(x=>x.key!==key)].slice(0,80)});
    return {ok:true};
  });
}

function setOpeningRows(waiter,kind,rows,source){
  const prefix=kind==='package'?'package':'lot';
  const bucket=prefix+(source==='native'?'NativeRows':'DomRows');
  const count=items=>items===null||items===undefined?-1:normalizeBidderTable(items,null).length;
  // A visible table can fill in asynchronously without changing its row count.
  // Retain both sources so such updates never erase equally complete API rows.
  if(count(rows)>=count(waiter[bucket]))waiter[bucket]=rows;
  const native=waiter[prefix+'NativeRows'],dom=waiter[prefix+'DomRows'];
  const nativeWins=count(native)>=count(dom)&&native!==null&&native!==undefined;
  waiter[prefix+'Rows']=nativeWins?native:dom??null;
  waiter[prefix+'RowsSource']=nativeWins?'native':dom?'visible-dom':null;
}

async function onBbmtBidders(payload={},senderTabId=null){
  const waiter=bbmtWaiter?.waiters.get(senderTabId);
  if(!waiter||bbmtWaiter.cancelled)return {ok:false,ignored:true};
  if(!sameBbmtDetailPage(waiter.pkg.detailUrl,payload.url))return {ok:false,ignored:true};
  if(payload.status<200||payload.status>=300)return {ok:false,ignored:true};
  const rows=normalizeBidderTable(payload.rows,waiter.pkg.priceBasis??waiter.pkg.bidPrice);
  // Malformed or unexpectedly empty responses must not certify zero bidders.
  if((payload.rows.length&&!rows.length)||(!rows.length&&waiter.pkg.numBidderJoin>0))return {ok:false,ignored:true};
  setOpeningRows(waiter,payload.kind,payload.rows,'native');
  waiter.progress();waiter.consider();await waiter.publish();return {ok:true};
}

async function onBbmtPriceBasis(payload={},senderTabId=null){
  const waiter=bbmtWaiter?.waiters.get(senderTabId);
  if(!waiter||bbmtWaiter.cancelled||!sameBbmtDetailPage(waiter.pkg.detailUrl,payload.url))return {ok:false,ignored:true};
  if(payload.status<200||payload.status>=300)return {ok:false,ignored:true};
  const previous=waiter.metadata||{bidPrice:null,bidEstimatePrice:null,isMultiLot:null};
  const round=payload.source==='round',notify=payload.source==='notify';
  const hasFlag=typeof payload.isMultiLot==='boolean';
  waiter.metadata={...previous,
    bidPrice:payload.bidPrice>0?payload.bidPrice:previous.bidPrice,
    bidEstimatePrice:payload.bidEstimatePrice>0?payload.bidEstimatePrice:previous.bidEstimatePrice,
    // Round management is the native UI's authoritative package/lot flag.
    isMultiLot:hasFlag&&(round||!previous.nativeRoundReceived)?payload.isMultiLot:previous.isMultiLot,
    nativeRoundReceived:Boolean(previous.nativeRoundReceived||(round&&hasFlag)),
    nativeNotifyReceived:Boolean(previous.nativeNotifyReceived||notify),
    roundReceived:Boolean(previous.roundReceived||(round&&hasFlag)),
    notifyReceived:Boolean(previous.notifyReceived||notify)};
  waiter.progress();waiter.consider();await waiter.publish();return {ok:true};
}

/** Visible public table fallback, sent directly by our isolated content script. */
async function onBbmtDomResult(payload={},senderTabId=null){
  const waiter=bbmtWaiter?.waiters.get(senderTabId);
  if(!waiter||bbmtWaiter.cancelled||payload.source!=='visible-dom'||
    !sameBbmtDetailPage(waiter.pkg.detailUrl,payload.url)||payload.notifyNo!==waiter.pkg.notifyNo)return {ok:false,ignored:true};
  const cards=['ttnt-card-bbmt-ldt','ttnt-card-bbmt-khac','ttnt-card-bbmt-adbwb'];
  if(!cards.includes(payload.cardId)||!['package','lot'].includes(payload.kind))return {ok:false,ignored:true};
  if(!(payload.bidPrice>0||payload.bidEstimatePrice>0))return {ok:false,ignored:true};
  const known=payload.classificationKnown&&typeof payload.isMultiLot==='boolean';
  if(known&&(payload.isMultiLot!==(payload.kind==='lot')))return {ok:false,ignored:true};
  const rows=normalizeBidderTable(payload.rows,null);
  if(!rows.length||rows.length!==payload.rows.length)return {ok:false,ignored:true};
  const previous=waiter.metadata||{};
  // Keep network prices/classification when already received. ADB/WB's DOM
  // table cannot establish its package/lot classification by itself.
  const domClassification=known&&payload.cardId!=='ttnt-card-bbmt-adbwb';
  waiter.metadata={...previous,
    bidPrice:previous.nativeNotifyReceived?previous.bidPrice:payload.bidPrice,
    bidEstimatePrice:previous.nativeNotifyReceived?previous.bidEstimatePrice:payload.bidEstimatePrice,
    isMultiLot:previous.nativeRoundReceived?previous.isMultiLot:domClassification?payload.isMultiLot:previous.isMultiLot??null,
    roundReceived:Boolean(previous.roundReceived||domClassification),notifyReceived:true,
    source:previous.source||'visible-dom'};
  setOpeningRows(waiter,payload.kind,payload.rows,'visible-dom');
  waiter.progress();waiter.consider();await waiter.publish();return {ok:true};
}

/**
 * Ghi kết quả đọc một biên bản.
 *
 * BA KẾT CỤC KHÁC NHAU, trước đây bị gộp thành hai nhãn và cả hai đều sai:
 *
 *   rows = [x,y]  OK       đọc được bảng nhà thầu
 *   rows = []     EMPTY    e-GP trả bảng RỖNG — gói này không có nhà thầu nào
 *   rows = null   TIMEOUT  hết hạn chờ, KHÔNG biết gói này thế nào
 *
 * Lỗi cũ: EMPTY rơi vào nhánh mặc định nên hiện "Chưa đọc biên bản gói này" —
 * y hệt gói còn chưa tới lượt. Người dùng thấy gói số 1 ghi "chưa đọc" trong
 * khi gói số 3 đã có bảng, nên tưởng phần mềm trả kết quả lộn xộn. Thực ra
 * đọc đúng thứ tự, chỉ là nhãn nói sai.
 *
 * Còn TIMEOUT thì bị ghi thành "e-GP không trả dữ liệu" — một kết luận về
 * e-GP mà ta không có cơ sở để đưa ra.
 */
function applyOpeningResult(p,result,provisional=false){
      const rows=result?.rows??null,metadata=result?.metadata;
      const attemptedAt=new Date().toISOString();
      if(rows===null&&p.bidders?.length)return {...p,readState:provisional?'READING':'TIMEOUT',attemptedAt,staleTable:true,fromCache:false,
        openingProvisional:provisional,readIssue:result?.incompleteReason||''};
      if(result?.incomplete&&p.bidders?.length>normalizeBidderTable(rows,null).length){
        return {...p,readState:provisional?'READING':'PARTIAL',attemptedAt,staleTable:true,fromCache:false,openingProvisional:provisional,
          readIssue:'Lần thử gần nhất trả ít dữ liệu hơn; giữ lại bảng của lần đọc trước để đối chiếu.'};
      }
      // Cache validation uses the listing as received, before detail metadata
      // supplies a more precise approved estimate.
      p={...p,listingFingerprint:openingFingerprint(p)};
      if(metadata){
        const estimate=metadata.bidEstimatePrice;
        const price=metadata.bidPrice;
        if(price>0)p={...p,bidPrice:price};
        if(estimate>0)p={...p,priceBasis:estimate,priceBasisLabel:'Dự toán được duyệt (e-GP)',priceBasisSource:'bidEstimatePrice'};
        else if(price>0&&p.priceBasisSource!=='bidEstimatePrice')p={...p,priceBasis:price,priceBasisLabel:'Giá gói thầu (e-GP)',priceBasisSource:'bidPrice'};
      }
      const bidders=rows===null?null:normalizeBidderTable(rows,p.priceBasis??p.bidPrice);
      if(metadata?.isMultiLot===true||(result?.kind==='lot'&&bidders?.some(b=>b.lotCode)))for(const b of bidders||[]){b.multiLot=true;b.vsPackageAmount=null;b.vsPackageRate=null;b.priceRank=null;}
      if(result?.comparisonPending)for(const b of bidders||[]){b.comparisonPending=true;b.vsPackageAmount=null;b.vsPackageRate=null;b.priceRank=null;}
      const participantCount=new Set((bidders||[]).map(b=>b.taxCode||b.nameFold)).size;
      const readState=provisional?'READING':rows===null?'TIMEOUT':result?.incomplete||(bidders&&participantCount<Number(p.numBidderJoin||0))?'PARTIAL':bbmtReadState(bidders);
      return {...p,bidders,readState,attemptedAt,scannedAt:rows===null?null:attemptedAt,fromCache:false,staleTable:false,openingProvisional:provisional,
        openingMetadataVerified:metadata?.notifyReceived===true&&metadata?.roundReceived===true&&typeof metadata?.isMultiLot==='boolean',isMultiLot:metadata?.isMultiLot??null,
        openingKind:result?.kind||null,readIssue:result?.incompleteReason||'',comparisonPending:Boolean(result?.comparisonPending)};
}

async function recordBidders(scanId,key,result){
  return withLock(async()=>{
    const scan=await getBidScan();
    if(!scan||scan.id!==scanId||scan.cancelled||scan.status!=='SCANNING')return;
    const packages=scan.packages.map(p=>p.key===key?applyOpeningResult(p,result):p);
    const done=packages.find(p=>p.key===key);
    const cache=(await chrome.storage.local.get('bidOpenCache')).bidOpenCache||{};
    const entry=cacheOpening(done);
    if(entry)cache[key]=entry;else delete cache[key];
    await save({bidOpenScan:{...scan,packages,lastProgressAt:new Date().toISOString(),
      scannedCount:packages.filter(p=>['OK','EMPTY'].includes(p.readState)).length},
      bidOpenCache:trimOpeningCache(cache)});
    if(done?.bidders?.length)obsQueue.push(...observationsFromBidOpen(done));
  });
}

async function finalizeBidOpenScan(scanId){
  await flushObservations();
  await withLock(async()=>{
    const scan=await getBidScan();
    if(!scan||scan.id!==scanId||!isLookupActive(lookupKind('bidOpenScan'),scan))return;
    const summary=summarizeBidOpenings(scan.packages,scan.focusTaxCode,scan.contractorQuery);
    const failed=scan.packages.filter(p=>!['OK','EMPTY'].includes(bbmtReadStateOf(p))).length;
    const complete=scan.packages.length-failed;
    const partial=Boolean(scan.partial||scan.listingCapped||scan.coverage?.complete===false||scan.insufficientPackages?.length);
    const scopeNote=scan.listingCapped
      ?` Danh sách chưa đầy đủ: đã lấy ${scan.pagesRead||0}/${scan.totalPages||'?'} trang (${scan.listedRows||0}/${scan.totalCandidates||'?'} bản ghi), đạt giới hạn quét. Có thể thu hẹp bộ lọc hoặc tăng số gói tối đa.`
      :partial?' Danh sách tìm kiếm chưa đầy đủ.':'';
    const message=scan.packages.length
      ?'Đã đọc đủ biên bản của '+complete+'/'+scan.packages.length+' gói trong danh sách đã thu thập.'
      :Number(scan.listedRows||0)>0
        ?`Đã đối chiếu ${scan.listedRows} bản ghi; chưa thấy gói phù hợp trong danh sách đã thu thập.`
        :partial?'Chưa thu thập được gói phù hợp; chưa thể kết luận không có kết quả.'
          :'e-GP không trả gói nào theo bộ lọc đã chọn.';
    await save({bidOpenScan:{...scan,status:partial||failed?'PARTIAL':'SUCCESS',partial,
      finishedAt:new Date().toISOString(),summary,failedCount:failed,scannedCount:complete,
      message:message+
        (failed?' Còn '+failed+' gói chưa đủ dữ liệu; có thể đọc lại riêng các gói này.':'')+
        scopeNote}});
  });
  await chrome.alarms.clear(TIMEOUT_PREFIX+scanId).catch(()=>{});
}

async function exportBidOpenCsv(...args){return exportRuntime.exportBidOpenCsv(...args);}

/* ==========================================================================
 *  TRA CỨU KẾ HOẠCH LỰA CHỌN NHÀ THẦU (KHLCNT) theo CHỦ ĐẦU TƯ / XÃ · PHƯỜNG
 *
 *  Khác ba tính năng trên: tiện ích KHÔNG tự dựng truy vấn mà đặt tiêu chí lên
 *  chính biểu mẫu của e-GP rồi để nó tự dựng. Lý do nằm ở đầu tệp lib/khlcnt.js
 *  — một tỉnh sau sáp nhập mang nhiều mã địa bàn, tự đoán mã là bỏ sót hồ sơ cũ.
 * ======================================================================== */

/* ==========================================================================
 *  DANH SÁCH TỈNH VÀ XÃ/PHƯỜNG — cho ô chọn của giao diện
 *
 *  Hỏi e-GP một lần rồi nhớ trong `chrome.storage`. Lý do không chép cứng
 *  4.055 xã/phường vào mã nguồn, và ghi chú về quy tắc "không replay API nội
 *  bộ", nằm ở đầu tệp lib/areas.js.
 * ======================================================================== */

/** Nhớ lại 30 ngày; quá hạn thì hỏi e-GP lần nữa cho khớp thay đổi địa giới. */
const AREAS_TTL_MS=30*24*60*60*1000;

let provincesInFlight=null;
async function getProvincesOnly(){
  const store=await chrome.storage.local.get(['areas','provinceCatalog']);
  const cached=store.provinceCatalog||store.areas;
  if(cached?.provinces?.length&&Date.now()-Date.parse(cached.fetchedAt)<AREAS_TTL_MS)return {ok:true,areas:cached};
  if(provincesInFlight)return provincesInFlight;
  provincesInFlight=(async()=>{
    try{const areas={provinces:await fetchProvinces(),fetchedAt:new Date().toISOString()};
      await save({provinceCatalog:areas});return {ok:true,areas};
    }catch(e){return cached?{ok:true,areas:cached,stale:true}:{ok:false,message:String(e.message||e)};}
    finally{provincesInFlight=null;}
  })();return provincesInFlight;
}

const wardsInFlight=new Map();
/** Load only the current/legacy codes of the selected province. A partial
 * ward catalogue must never masquerade as the complete national catalogue. */
async function getWardAreas(province,{refresh=false}={}){
  const resolved=await resolveProvinceCodes(province);
  if(!resolved.ok||!resolved.codes.length)return {ok:false,message:'Hãy chọn đầy đủ tên tỉnh/thành trong danh sách trước khi lấy xã/phường.'};
  const catalog=(await getProvincesOnly()).areas;
  const stored=await chrome.storage.local.get({wardCatalog:{},areas:null});
  const results=await Promise.allSettled(resolved.codes.map(async code=>{
    const full=stored.areas;
    const cached=stored.wardCatalog?.[code]||(Object.hasOwn(full?.wardsByProvince||{},code)?{rows:full.wardsByProvince[code],fetchedAt:full.fetchedAt}:null);
    const fresh=cached&&Array.isArray(cached.rows)&&Date.now()-Date.parse(cached.fetchedAt)<AREAS_TTL_MS;
    if(fresh&&!refresh)return {code,rows:cached.rows};
    if(wardsInFlight.has(code))return wardsInFlight.get(code);
    const promise=(async()=>{
      try{
        const rows=await fetchWards(code);
        const entry={rows,fetchedAt:new Date().toISOString()};
        await withLock(async()=>{
          const current=(await chrome.storage.local.get({wardCatalog:{}})).wardCatalog;
          await save({wardCatalog:{...current,[code]:entry}});
        });
        return {code,rows};
      }catch(error){
        if(cached&&Array.isArray(cached.rows))return {code,rows:cached.rows,stale:true};
        throw error;
      }finally{wardsInFlight.delete(code);}
    })();
    wardsInFlight.set(code,promise);return promise;
  }));
  const failed=results.find(r=>r.status==='rejected');
  if(failed)return {ok:false,message:'Chưa lấy đủ danh mục xã/phường của tỉnh đã chọn: '+String(failed.reason?.message||failed.reason)};
  const values=results.map(r=>r.value);
  return {ok:true,stale:values.some(r=>r.stale),areas:{provinces:catalog.provinces,
    wardsByProvince:Object.fromEntries(values.map(r=>[r.code,r.rows])),fetchedAt:catalog.fetchedAt}};
}

async function getAreas({refresh=false}={}){
  const store=await chrome.storage.local.get({[KEYS.areas]:null,liveCanary:null,canaryConfig:null});
  const cached=store[KEYS.areas];
  const fresh=cached&&cached.fetchedAt&&(Date.now()-new Date(cached.fetchedAt).getTime()<AREAS_TTL_MS);
  if(cached&&fresh&&!refresh){
    return {ok:true,areas:cached,fromCache:true};
  }
  try{
    const areas=await fetchAllAreas();
    await save({[KEYS.areas]:areas});
    return {ok:true,areas,fromCache:false};
  }catch(error){
    // Không lấy được thì vẫn dùng bản đã nhớ (dù cũ) — có gợi ý cũ vẫn hơn
    // không có gì. Chỉ khi chưa từng nhớ được mới báo lỗi.
    if(cached)return {ok:true,areas:cached,fromCache:true,stale:true,message:String(error?.message||error)};
    return {ok:false,message:`Không lấy được danh sách xã/phường từ e-GP: ${String(error?.message||error)}`};
  }
}

/** Trả về danh sách tên cho ô chọn: tỉnh hiện hành, và xã/phường theo tỉnh. */
async function getAreaOptions(payload={}){
  if(payload.provincesOnly||!String(payload.province||'').trim()){const r=await getProvincesOnly();return {...r,provinces:r.areas?directoryRuntime.provinceNames(currentProvinceNames(r.areas)):[]};}
  const res=await getWardAreas(payload.province,{refresh:Boolean(payload.refresh)});
  if(!res.ok)return res;
  const organizations=await directoryRuntime.search({province:payload.province,officialOnly:true,limit:500});
  return {
    ok:true,
    fromCache:res.fromCache,
    stale:Boolean(res.stale),
    fetchedAt:res.areas.fetchedAt,
    provinces:directoryRuntime.provinceNames(currentProvinceNames(res.areas)),
    wards:[...new Set(splitProvinceNames(payload.province).flatMap(name=>wardNamesForProvince(res.areas,name)))],
    organizationOptions:organizations.entries,
    organizationCoverage:organizations.coverage,
    wardIdentities:splitProvinceNames(payload.province).flatMap(name=>wardIdentitiesForProvince(res.areas,name))
  };
}

/* ==========================================================================
 *  SOI ĐỊA BÀN — xã/phường này hay có công ty nào trúng thầu
 *
 *  Dùng chung bộ máy phân trang với ba tính năng kia (mode 'area'). Truy vấn
 *  do lib/kqlcnt.js `buildWardMarketQuery` dựng: lọc theo TÊN CHỦ ĐẦU TƯ chứa
 *  tên địa danh, vì bản ghi KQLCNT của e-GP không có trường địa bàn nào.
 *  Phần tổng hợp quan hệ nằm ở lib/localmarket.js.
 * ======================================================================== */

async function setAreaScan(patch){
  return withLock(async()=>{
    const s=await getState();
    if(!s.areaScan)return null;
    const next={...s.areaScan,...patch};
    await save({[KEYS.areaScan]:next});
    return next;
  });
}

/* ==========================================================================
 *  TỆP ĐÍNH KÈM — hồ sơ mời thầu, quyết định phê duyệt, báo cáo chấm thầu
 *
 *  Danh sách tệp thu THỤ ĐỘNG từ phản hồi mà chính trang e-GP tự gọi khi người
 *  dùng mở một gói (xem ATTACHMENT_ENDPOINTS trong page-hook.js).
 *
 *  Tệp thì tải qua PHẦN MỀM HỖ TRỢ e-GP cài trên máy người dùng — e-GP không
 *  phát tệp qua máy chủ web, đã kiểm chứng 6 đường dẫn đều trả 404. Chi tiết ở
 *  đầu tệp lib/attachments.js.
 * ======================================================================== */

/** Lấy mã TBMT từ URL trang chi tiết mà tệp đính kèm thuộc về. */
function attachmentNotifyNo(url){
  try{
    const u=new URL(url);
    const direct=u.searchParams.get('notifyNo');
    if(direct&&/^IB\d{6,}$/i.test(direct))return direct.toUpperCase();
  }catch{}
  const m=String(url||'').match(/\bIB\d{6,}\b/i);
  return m?m[0].toUpperCase():'';
}

async function ingestAttachments(payload={}){
  const notifyNo=attachmentNotifyNo(payload.url);
  if(!notifyNo)return {ok:false,message:'Không xác định được mã TBMT của trang.'};
  const found=extractAttachments(payload.payload);
  if(!found.length)return {ok:true,added:0};

  return withLock(async()=>{
    const s=await getState();
    const store={...(s.attachments||{})};
    store[notifyNo]={
      notifyNo,
      updatedAt:new Date().toISOString(),
      sourceUrl:payload.url||'',
      files:mergeAttachments((store[notifyNo]||{}).files,found)
    };
    await save({[KEYS.attachments]:store});
    return {ok:true,notifyNo,added:found.length,total:store[notifyNo].files.length};
  });
}

/** Danh sách tệp đã biết của một hoặc nhiều gói. */
async function getAttachments(payload={}){
  const s=await getState();
  const store=s.attachments||{};
  if(payload.notifyNo){
    const no=String(payload.notifyNo).toUpperCase();
    return {ok:true,entry:store[no]||null};
  }
  return {ok:true,store};
}

/**
 * Phần mềm hỗ trợ e-GP có đang chạy không?
 *
 * Hỏi trước khi tải để báo lỗi cho ra lẽ, thay vì để lượt tải thất bại im lặng.
 */
/**
 * Phần mềm hỗ trợ e-GP có chạy không — CHỈ ĐỂ THAM KHẢO, không dùng để chặn.
 *
 * VÌ SAO KHÔNG DÙNG ĐỂ CHẶN NỮA: `fetch` từ service worker của tiện ích tới
 * localhost:1234 bị CORS chặn, vì phần mềm hỗ trợ chỉ cho phép gốc
 * `https://muasamcong.mpi.gov.vn`, không cho phép `chrome-extension://`.
 * Nên phép dò này BÁO SAI là "không chạy" ngay cả khi phần mềm đang chạy tốt
 * — đúng lỗi người dùng gặp: bấm trên e-GP tải được, bấm trong tiện ích lại
 * báo không liên lạc được.
 *
 * `chrome.downloads` thì KHÔNG bị CORS: nó tải ở cấp trình duyệt, y hệt bấm
 * vào một liên kết. Vì vậy nay cứ tải thẳng, rồi `confirmDownload()` cho biết
 * thật sự có vấn đề gì.
 */
async function agentStatus(...args){return nativeAgent.agentStatus(...args);}

/**
 * Soát lại một lượt tải đã thật sự xong chưa.
 *
 * `chrome.downloads.download()` trả về mã ngay lập tức, kể cả khi phần mềm hỗ
 * trợ trả lỗi. Không soát lại thì tiện ích báo "đã tải xong" trong khi trên đĩa
 * là tệp rỗng hoặc trang lỗi.
 */
async function confirmDownload(id,timeoutMs=20000){
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    const [item]=await chrome.downloads.search({id});
    if(!item)return {ok:false,message:'Chrome không tìm thấy lượt tải.'};
    if(item.state==='complete'){
      if(Number(item.fileSize)===0)return {ok:false,message:'Tệp tải về rỗng (0 byte).'};
      return {ok:true,bytes:item.fileSize};
    }
    if(item.state==='interrupted'){
      // Mã lỗi của Chrome cho biết hỏng ở đâu — nói đúng nguyên nhân thay vì
      // đổ hết cho "phần mềm hỗ trợ chưa chạy".
      const e=String(item.error||'');
      if(/NETWORK_FAILED|NETWORK_INVALID_REQUEST|NETWORK_DISCONNECTED|CONNECTION/i.test(e)){
        return {ok:false,message:AGENT_MISSING_MESSAGE};
      }
      if(/SERVER_FORBIDDEN|SERVER_UNAUTHORIZED/i.test(e)){
        return {ok:false,message:'Phần mềm hỗ trợ từ chối tệp này. Gói có thể yêu cầu đăng nhập e-GP mới tải được.'};
      }
      if(/SERVER_BAD_CONTENT|SERVER_NO_RANGE|SERVER_FAILED/i.test(e)){
        return {ok:false,message:'Phần mềm hỗ trợ không trả được tệp (mã tệp có thể đã cũ). Thử mở trang gói trên e-GP rồi tải lại.'};
      }
      if(/USER_CANCELED|USER_SHUTDOWN/i.test(e)){
        return {ok:false,message:'Lượt tải bị hủy.'};
      }
      if(/FILE_/i.test(e)){
        return {ok:false,message:`Không ghi được tệp xuống đĩa (${e}). Kiểm tra thư mục Tải xuống.`};
      }
      return {ok:false,message:`Tải bị ngắt (${e||'không rõ lý do'}).`};
    }
    await new Promise(r=>setTimeout(r,400));
  }
  // Chưa xong nhưng cũng chưa lỗi: để Chrome tải tiếp, không coi là thất bại.
  return {ok:true,pending:true};
}

/** Tải một hoặc nhiều tệp qua phần mềm hỗ trợ trên máy người dùng. */
async function downloadAttachments(...args){return nativeAgent.downloadAttachments(...args);}

/**
 * Một thao tác: mở trang gói ở tab NỀN, chờ e-GP nạp danh sách tệp, tải hết,
 * rồi đóng tab.
 *
 * Vì sao phải mở trang: danh sách tệp KHÔNG có trong kết quả tìm kiếm. Chỉ khi
 * mở trang chi tiết thì e-GP mới gọi hai endpoint kèm mã tệp. Tiện ích chỉ đọc
 * thụ động phản hồi đó, không tự gọi API nào của e-GP.
 *
 * Tab mở ở chế độ nền để không giật màn hình khỏi việc người dùng đang làm.
 */
async function fetchAndDownloadAttachments(payload={}){
  const notifyNo=String(payload.notifyNo||'').toUpperCase();
  const url=String(payload.detailUrl||'');
  if(!url)return {ok:false,message:'Thiếu đường dẫn trang chi tiết của gói.'};

  // Đã thu được danh sách tệp từ trước thì tải luôn, khỏi mở lại trang.
  const known=(await getAttachments({notifyNo})).entry;
  if(known&&known.files&&known.files.length){
    return downloadAttachments({notifyNo,files:known.files.map(f=>({...f,notifyNo}))});
  }

  const tab=await chrome.tabs.create({url,active:false});
  try{
    await waitForTab(tab.id,40000);
    // Chờ trang tự gọi hai endpoint kèm danh sách tệp.
    let entry=null;
    for(let i=0;i<24;i++){
      await new Promise(r=>setTimeout(r,700));
      entry=(await getAttachments({notifyNo})).entry;
      if(entry&&entry.files&&entry.files.length)break;
    }
    if(!entry||!entry.files.length){
      return {ok:false,message:`Không thấy tệp đính kèm nào cho ${notifyNo||'gói này'}. `
        +'Có thể gói chưa đăng tệp, hoặc e-GP yêu cầu đăng nhập mới xem được.'};
    }
    return downloadAttachments({notifyNo,files:entry.files.map(f=>({...f,notifyNo}))});
  }finally{
    try{ await chrome.tabs.remove(tab.id); }catch{}
  }
}

/* ==========================================================================
 *  HỒ SƠ 360° CỦA MỘT NHÀ THẦU
 *
 *  Dựng từ HAI nguồn, KHÔNG trộn lẫn:
 *    A. Gói đã trúng — hỏi thẳng e-GP theo MST, đầy đủ.
 *    B. Gói đã dự    — chỉ từ kho quan sát đã tích luỹ, một phần.
 *  Lý do vì sao nhóm B không thể đầy đủ nằm ở đầu tệp lib/profile360.js.
 * ======================================================================== */

async function getContractorProfile(payload={}){
  const taxCode=normalizeTaxCodeForEgp(payload.taxCode||'');
  if(!taxCode)return {ok:false,message:'Hãy nhập mã số thuế 10 chữ số của nhà thầu.'};

  const s=await getState();

  /* NGUỒN DỮ LIỆU — ĐỌC KỸ TRƯỚC KHI SỬA
   *
   * Bản cũ CHỈ đọc kho đã lưu (`winnerCache`) và KHÔNG BAO GIỜ hỏi lại e-GP.
   * Kho đó không có hạn dùng. Hậu quả người dùng gặp thật: đấu gói ngày
   * 27/8/2026, mở hồ sơ ra vẫn thấy số liệu của lần tra nhiều tuần trước,
   * không có gói mới nào — và không có một dòng nào nói rằng đây là dữ liệu cũ.
   *
   * Nay trang hồ sơ tự chạy một lượt tra MỚI theo MST trước khi gọi vào đây,
   * nên `winnerLookup` là dữ liệu vừa lấy về. Kho cũ chỉ còn là phương án dự
   * phòng khi lượt tra thất bại, và khi dùng nó thì PHẢI nói rõ là dữ liệu cũ
   * kèm thời điểm — im lặng đưa số cũ là nói dối.
   */
  let won=[];
  let name='';
  let freshness=null;

  const live=s.winnerLookup;
  if(live&&live.focusTaxCode===taxCode&&!live.criteria?.investor&&!live.criteria?.province&&(live.packages||[]).length){
    won=live.packages;
    name=live.contractorName||'';
    freshness={fresh:true,at:live.finishedAt||live.startedAt||null};
  }else{
    const cached=(s.winnerCache||{})[taxCode];
    if(cached&&(cached.packages||[]).length){
      won=cached.packages;
      name=cached.name||'';
      freshness={fresh:false,at:cached.updatedAt||null};
    }
  }

  if(!won.length){
    return {ok:false,needLookup:true,taxCode,
      message:`e-GP không trả gói trúng thầu nào cho MST ${taxCode}. `
        +'Kiểm tra lại mã số thuế, hoặc nhà thầu này chưa từng trúng gói nào được công bố.'};
  }

  const profile=buildProfile360({
    taxCode,contractorName:name,
    wonPackages:won,
    observations:s.observations||[],
    scannedPackageCount:((s.bidOpenScan&&s.bidOpenScan.packages)||[]).length
  });

  return {ok:true,profile,freshness,
    completeNote:PROFILE_COMPLETE_NOTE,
    partialNote:PROFILE_PARTIAL_NOTE,
    useNote:PROFILE_USE_NOTE};
}

/** Xuất hồ sơ 360° ra sổ Excel nhiều trang. */
async function exportProfileXlsx(...args){return exportRuntime.exportProfileXlsx(...args);}

/* ==========================================================================
 *  HỒ SƠ CHỦ ĐẦU TƯ — hai bước
 *
 *    Bước 1 DÒ    : gõ vài chữ -> liệt kê các chủ đầu tư khớp, GOM THEO MÃ.
 *    Bước 2 HỒ SƠ : chọn mã -> lấy toàn bộ gói của mã đó.
 *
 *  Vì sao phải hai bước, và vì sao lọc chính xác bắt buộc dùng `investorCode`
 *  chứ không phải `procuringEntityCode`: xem đầu tệp lib/investor.js.
 * ======================================================================== */

async function setInvestorScan(patch){
  return withLock(async()=>{
    const s=await readJobState('investorScan');
    if(!s.investorScan)return null;
    const next={...s.investorScan,...patch};
    await save({[KEYS.investorScan]:next});
    return next;
  });
}

/** Quy tên tỉnh ra mọi mã cùng tên (Lâm Đồng = 68 hiện hành + 703 cũ). */
async function provinceCodesFor(name){
  const province=String(name||'').trim();
  if(!province)return [];
  const areas=(await getAreas({})).areas;
  return areas?provinceCodesByName(areas.provinces,province):[];
}

async function startInvestorScan(payload={}){
  const directoryResolved=await resolveDirectoryPayload(payload,'keyword');if(!directoryResolved.ok)return directoryResolved;payload=directoryResolved.payload;
  const mode=payload.codes&&payload.codes.length?'profile':'discover';
  const owners=parseInvestorFilter(payload.keyword);if(!owners.ok)return owners;
  const keyword=owners.value;
  // Khoảng ngày do người dùng chọn. Bộ lọc gửi lên máy chủ được nới biên; ranh
  // giới chính xác do khlcntInDateRange() quyết định lúc nhận dữ liệu về.
  const fromDate=String(payload.fromDate||'').trim();
  const toDate=String(payload.toDate||'').trim();
  const province=String(payload.province||'').trim();
  const codes=(payload.codes||[]).map(c=>String(c||'').trim()).filter(Boolean);

  if(mode==='discover'&&!keyword){
    return {ok:false,message:'Hãy gõ vài chữ trong tên chủ đầu tư — ví dụ "Đức Linh", "chi cục thủy lợi".'};
  }

  const provinces=await provinceCodesFor(province);
  if(province&&!provinces.length){
    return {ok:false,message:`Không nhận ra tỉnh/thành "${province}". Hãy chọn từ danh sách gợi ý.`};
  }

  const criteria={keyword,investor:mode==='discover'?keyword:'',province,provinces,codes,name:String(payload.name||'')};
  const queries=mode==='profile'?[buildInvestorProfileQuery({codes})]:buildInvestorDiscoveryQueries({keyword,provinces:[]});
  if(!queries.length||queries.some(q=>!q))return {ok:false,message:'Chưa đủ tiêu chí để dựng truy vấn.'};
  const queryBatch=lookupBatch({...criteria,investor:mode==='profile'?codes.join('; '):criteria.investor},queries,'investor',mode==='profile'?0:6,true);
  const id=newLookupId();
  const label=mode==='profile'
    ? `chủ đầu tư ${payload.name||codes.join(', ')}`
    : `dò chủ đầu tư "${keyword}"`;

  const scan={
    id,mode,queryBatch,qi:0,criteria,
    label,status:'RUNNING',
    message:mode==='profile'
      ?'Đang lấy toàn bộ gói thầu của chủ đầu tư này...'
      :'Đang dò các chủ đầu tư khớp từ khoá...',
    startedAt:new Date().toISOString(),finishedAt:null,
    packages:[],rowsSeen:0,totalElements:0,cancelled:false,
    candidates:null,summary:null,
    completeNote:INVESTOR_COMPLETE_NOTE,joinNote:INVESTOR_JOIN_NOTE,
    partialNote:INVESTOR_PARTIAL_NOTE,disclaimer:INVESTOR_DISCLAIMER
  };
  const claimed=await claimLookupJob('investorScan',scan);
  if(!claimed.ok)return {ok:false,message:'Một lượt hồ sơ chủ đầu tư đang chạy. Hãy chờ hoặc bấm Dừng trước khi chạy lại.',scan:claimed.current};

  try{
    const tab=await ensureEgpSearchTab(payload.focusTab!==false);
    const bound=await bindLookupTab('investorScan',id,tab.id);
    await dispatchBatchTask('investorScan',id);
    await chrome.alarms.create(TIMEOUT_PREFIX+id,{when:Date.now()+RUN_STALE_MS});
    return {ok:true,scan:bound};
  }catch(error){
    const message=String(error?.message||error);
    await failLookupJob('investorScan',id,message);
    return {ok:false,message};
  }
}

async function ingestInvestorPage(payload={}){
  return withLock(async()=>{
    const s=await readJobState('investorScan',{areas:null});
    const scan=s.investorScan;
    if(!scan||scan.id!==payload.planId)return {ok:false};

    const rows=Array.isArray(payload.records)?payload.records:[];
    const all=rows.map(r=>normalizeKqlcntRecord(r)).filter(Boolean);
    const classified=classifyLookupRows(all,scan,s.areas),found=classified.matched;
    const replacedKeys=new Set(all.map(row=>row.key));
    const next={...scan,resultStates:classified.states,
      insufficientPackages:dedupeKqlcnt([...(scan.insufficientPackages||[]).filter(row=>!replacedKeys.has(row.key)),...classified.unknown]),
      normalizedCount:Number(scan.normalizedCount||0)+all.length,
      invalidCount:Number(scan.invalidCount||0)+rows.length-all.length,
      packages:dedupeKqlcnt([...(scan.packages||[]).filter(row=>!replacedKeys.has(row.key)),...found]),
      rowsSeen:Number(scan.rowsSeen||0)+rows.length,
      totalElements:Number(payload.totalElements||scan.totalElements||0)};
    next.message=scan.mode==='profile'
      ?`Đã lấy ${next.packages.length}/${next.totalElements||next.packages.length} gói...`
      :`Đã xét ${next.rowsSeen} gói để dò chủ đầu tư...`;

    if(payload.done){
      next.finishedAt=new Date().toISOString();
      next.cancelled=Boolean(payload.cancelled);

      if(!next.packages.length){
        // Phân biệt "e-GP không trả gì" với "trả về nhưng không đọc được" —
        // hai chuyện khác nhau, đừng gộp thành một câu.
        next.status=next.rowsSeen>0&&!next.normalizedCount?'ERROR':'SUCCESS';
        next.message=next.rowsSeen>0&&!next.normalizedCount
          ?`Lỗi kỹ thuật: e-GP trả ${next.rowsSeen} dòng nhưng không đọc được gói nào. Hãy tải lại trang e-GP rồi thử lại.`
          :(scan.mode==='profile'
            ?'Chủ đầu tư này chưa có gói thầu nào được công bố kết quả.'
            :`Không thấy chủ đầu tư nào khớp "${scan.criteria.keyword}". Thử gõ ngắn hơn, hoặc bỏ ô Tỉnh.`);
      }else if(scan.mode==='discover'){
        next.status='SUCCESS';
        next.candidates=discoverInvestors(next.packages);
        next.message=`Tìm thấy ${next.candidates.length} chủ đầu tư khớp `
          +`(dò trên ${next.rowsSeen} gói gần nhất). Chọn đúng đơn vị để xem hồ sơ đầy đủ.`;
      }else{
        next.status='SUCCESS';
        next.summary=summarizeInvestor(next.packages,{
          codes:scan.criteria.codes,name:scan.criteria.name});
        next.message=`${next.packages.length} gói · ${next.summary.contractorCount} nhà thầu đã trúng`
          +`${next.cancelled?' (đã dừng giữa chừng)':''}.`;
      }
    }
    await save({[KEYS.investorScan]:next});
    return {ok:true};
  });
}

/** Xuất hồ sơ chủ đầu tư ra sổ Excel nhiều trang. */
async function exportInvestorXlsx(...args){return exportRuntime.exportInvestorXlsx(...args);}

async function startAreaScan(payload={}){
  const directoryResolved=await resolveDirectoryPayload(payload);if(!directoryResolved.ok)return directoryResolved;payload=directoryResolved.payload;
  const owners=parseInvestorFilter(payload.investor);if(!owners.ok)return owners;
  const investor=owners.value;
  const ward=String(payload.ward||'').trim();
  const province=String(payload.province||'').trim();
  if(!ward&&!investor)return {ok:false,message:'Hãy chọn hoặc nhập tên Xã/Phường (hoặc tên huyện cũ).'};

  // Mọi bộ lọc dưới đây đi THẲNG vào truy vấn gửi lên e-GP, không phải lọc sau
  // khi tải về — nhờ vậy thu hẹp phạm vi làm lượt tra cứu nhanh thật.
  // Đã đo trên e-GP với địa bàn "Đơn Dương": 477 gói → 12 gói khi thêm ba
  // tiêu chí (năm 2025 + giá từ 1 tỷ + lĩnh vực xây lắp).
  const filters={
    fromYear:Number(payload.fromYear)||0,
    toYear:Number(payload.toYear)||0,
    minPrice:Number(payload.minPrice)||0,
    maxPrice:Number(payload.maxPrice)||0,
    fields:Array.isArray(payload.fields)?payload.fields:[],
    forms:Array.isArray(payload.forms)?payload.forms:[],
    online:String(payload.online||'')
  };
  if(filters.fromYear&&filters.toYear&&filters.fromYear>filters.toYear){
    return {ok:false,message:'"Từ năm" phải nhỏ hơn hoặc bằng "Đến năm".'};
  }
  if(filters.minPrice&&filters.maxPrice&&filters.minPrice>filters.maxPrice){
    return {ok:false,message:'Giá "từ" phải nhỏ hơn hoặc bằng giá "đến".'};
  }

  const resolved=province?await resolveProvinceCodes(province):{ok:true,codes:[]};
  if(!resolved.ok)return {ok:false,message:'Chưa xác định được tỉnh đã chọn; không bỏ qua tiêu chí tỉnh.'};
  const criteria={ward,province,provinces:resolved.codes,investor,legacyInvestor:investor?'':ward.replace(/^(Xã|Phường|Huyện|Quận|Thị trấn)\s+/i,''),...filters};
  const queries=buildWardMarketQueries({ward,investor,...filters});
  if(!queries.length)return {ok:false,message:'Chưa đủ tên chủ đầu tư hoặc địa bàn để tìm.'};
  // Legacy ward is an owner-name query; when combined with explicit owners it
  // becomes an additional ward constraint, verified against the linked TBMT.
  const queryBatch=lookupBatch({...criteria,investor:investor||ward.replace(/^(Xã|Phường|Huyện|Quận|Thị trấn)\s+/i,'')},queries,'area',0,true);
  if(investor&&ward){
    const response=province?await getWardAreas(province):await getAreas({});
    const selection=response.areas&&resolveWardSelection({...criteria,...payload,provinces:resolved.codes},response.areas);
    if(!selection?.ok||!selection.selected)return {ok:false,message:'Hãy chọn xã/phường từ danh sách đúng tỉnh, hoặc để trống ô xã/phường khi chỉ lọc tên chủ đầu tư.'};
    criteria.wardIdentities=selection.identities;
  }
  const id=newLookupId();
  const scan={
    id,criteria,queryBatch,qi:0,
    label:investor?`chủ đầu tư "${investor}"`:`địa bàn "${ward}"`,
    status:'RUNNING',
    message:'Đang hỏi e-GP các gói thầu của chủ đầu tư trên địa bàn này...',
    startedAt:new Date().toISOString(),finishedAt:null,
    packages:[],totalElements:0,rowsSeen:0,cancelled:false,
    summary:null,pricing:null,
    disclaimer:AREA_DISCLAIMER,scopeNote:AREA_SCOPE_NOTE,
    pricingDisclaimer:PRICING_DISCLAIMER,pricingMethod:PRICING_METHOD_NOTE
  };
  const claimed=await claimLookupJob('areaScan',scan);
  if(!claimed.ok)return {ok:false,message:'Một lượt soi địa bàn đang chạy. Hãy chờ hoặc bấm Dừng trước khi chạy lại.',scan:claimed.current};

  try{
    const tab=await ensureEgpSearchTab(payload.focusTab!==false);
    const bound=await bindLookupTab('areaScan',id,tab.id);
    await dispatchBatchTask('areaScan',id);
    await chrome.alarms.create(TIMEOUT_PREFIX+id,{when:Date.now()+RUN_STALE_MS});
    return {ok:true,scan:bound};
  }catch(error){
    const message=String(error?.message||error);
    await failLookupJob('areaScan',id,message);
    return {ok:false,message};
  }
}

async function ingestAreaPage(payload={}){
  return withLock(async()=>{
    const s=await readJobState('areaScan',{areas:null});
    const scan=s.areaScan;
    if(!scan||scan.id!==payload.planId)return {ok:false};

    const rows=Array.isArray(payload.records)?payload.records:[];
    const all=rows.map(r=>normalizeKqlcntRecord(r)).filter(Boolean);
    const classified=classifyLookupRows(all,scan,s.areas),found=classified.matched;
    const replacedKeys=new Set(all.map(row=>row.key));
    const next={...scan,resultStates:classified.states,
      insufficientPackages:dedupeKqlcnt([...(scan.insufficientPackages||[]).filter(row=>!replacedKeys.has(row.key)),...classified.unknown]),
      normalizedCount:Number(scan.normalizedCount||0)+all.length,
      invalidCount:Number(scan.invalidCount||0)+rows.length-all.length,
      packages:dedupeKqlcnt([...(scan.packages||[]).filter(row=>!replacedKeys.has(row.key)),...found]),
      rowsSeen:Number(scan.rowsSeen||0)+rows.length,
      totalElements:Number(payload.totalElements||scan.totalElements||0)};
    next.message=`Đã lấy ${next.packages.length}/${next.totalElements||next.packages.length} gói...`;

    if(payload.done){
      next.finishedAt=new Date().toISOString();
      next.cancelled=Boolean(payload.cancelled);
      if(next.packages.length){
        next.status='SUCCESS';
        next.summary=summarizeArea(next.packages,next.criteria);
        // Phân tích giá dùng LẠI đúng tập gói vừa tải, không tốn thêm lượt hỏi nào.
        next.pricing=summarizePricing(next.packages,{});
        next.message=`${next.summary.contractorCount} nhà thầu · ${next.summary.investorCount} chủ đầu tư · `
          +`${next.packages.length} gói${next.cancelled?' (đã dừng giữa chừng)':''}.`;
      }else if(next.normalizedCount>0){
        next.status='SUCCESS';next.message=`Không có gói nào khớp phạm vi đã chọn; ${(next.insufficientPackages||[]).length} gói chưa đủ dữ liệu đối chiếu.`;
      }else if(next.rowsSeen>0){
        // Giống chẩn đoán ở tra cứu MST: e-GP CÓ trả dữ liệu mà không dòng nào
        // dùng được, tức truy vấn chưa được áp lên trang.
        next.status='ERROR';
        next.message=`Lỗi kỹ thuật: e-GP trả về ${next.rowsSeen} dòng nhưng không đọc được gói nào. `
          +'Hãy tải lại trang e-GP (F5) rồi thử lại.';
      }else{
        next.status='SUCCESS';
        next.summary=null;
        const c=next.criteria||{};
        const hasFilter=c.fromYear||c.toYear||c.minPrice||c.maxPrice
          ||(c.fields&&c.fields.length)||(c.forms&&c.forms.length)||c.online;
        next.message=`Không có gói nào khớp với địa bàn "${c.ward}"`
          +(hasFilter
            ? ' và bộ lọc đang đặt. Thử nới bộ lọc (bỏ khoảng năm, khoảng giá, lĩnh vực) rồi tra lại.'
            : '. Thử bỏ tiền tố (gõ "Hàm Đức" thay vì "Xã Hàm Đức"), hoặc thử tên huyện cũ.');
      }
    }
    await save({[KEYS.areaScan]:next});
    return {ok:true};
  });
}

/**
 * Tính lại khoảng giá tham khảo cho một giá gói thầu cụ thể.
 *
 * Chạy trên tập gói ĐÃ TẢI của lượt soi địa bàn nên trả về tức thì, không cần
 * hỏi e-GP thêm lần nào.
 */
async function getPriceReference(payload={}){
  const s=await getState();
  const scan=s.areaScan;
  const list=(scan&&scan.packages)||[];
  if(!list.length)return {ok:false,message:'Chưa có dữ liệu. Hãy chạy một lượt soi địa bàn trước.'};
  const target={
    price:Number(payload.price)||0,
    field:String(payload.field||''),
    form:String(payload.form||''),
    sameBand:Boolean(payload.sameBand)
  };
  return {ok:true,target,reference:priceReference(list,target),
          disclaimer:PRICING_DISCLAIMER,method:PRICING_METHOD_NOTE};
}

async function exportAreaXlsx(...args){return exportRuntime.exportAreaXlsx(...args);}

/** Một dòng thống kê giảm giá cho trang "Giá thị trường". */
function priceRow(x){
  return {
    label:x.label,n:x.n,
    min:x.discount.min,q1:x.discount.q1,median:x.discount.median,
    q3:x.discount.q3,max:x.discount.max,
    totalValue:numOrNull(x.totalValue),
    reliable:x.discount.reliable?'Đủ mẫu':`Chỉ ${x.n} gói — tham khảo`
  };
}

async function startPlanLookup(payload={}){
  const directoryResolved=await resolveDirectoryPayload(payload);if(!directoryResolved.ok)return directoryResolved;payload=directoryResolved.payload;
  const validation=validateCriteria(payload);
  if(!validation.ok)return validation;
  const localCriteria=validation.criteria;
  const investor=localCriteria.investor;
  const province=String(payload.province||'').trim();
  const ward=String(payload.ward||'').trim();
  const keyword=String(payload.keyword||'').trim();
  const category=normalizeCategory(payload.category);
  if(isUnknownCategory(payload.category))return {ok:false,message:'Loại gói thầu không hợp lệ. Hãy chọn lại trong danh sách.'};
  const fromDate=String(payload.fromDate||'').trim();
  const toDate=String(payload.toDate||'').trim();
  const days=Number(payload.days)||0;
  /* Với bản ghi KHLCNT, e-GP lọc được CẢ địa bàn ở phía máy chủ — đã đo:
     locations.provCode cho đúng Lâm Đồng, locations.districtCode cho 108 kế
     hoạch của Xã Hàm Thạnh. Nên chỉ chọn tỉnh cũng tra được, không còn bắt
     buộc nhập chủ đầu tư như bản trước. */
  if(!investor&&!keyword&&!province&&!ward&&!category&&!String(payload.mustKeywords||'').trim()){
    return {ok:false,message:'Hãy chọn loại gói thầu hoặc nhập Chủ đầu tư, Tỉnh/Thành phố, Xã/Phường, từ khoá.'};
  }

  // Quy TÊN địa bàn ra MÃ. Tỉnh phải lấy đủ mọi mã cùng tên (68 + 703).
  let provinces=[],wards=[];
  if(province||ward){
    const areas=(await (ward&&province?getWardAreas(province):ward?getAreas({}):getProvincesOnly())).areas;
    if(!areas)return {ok:false,message:'Chưa tải được danh mục địa bàn e-GP. Hãy thử lại; tiêu chí tỉnh/xã chưa được bỏ qua.'};
    if(areas){
      if(province){
        const resolved=await resolveProvinceCodes(province);
        if(!resolved.ok){
          return {ok:false,message:`Không nhận ra tỉnh/thành "${resolved.unknown.join(', ')}". Hãy chọn từ danh sách gợi ý; nhiều tỉnh cách nhau bằng dấu phẩy.`};
        }
        provinces=resolved.codes;
      }
      if(ward){
        const selected=resolveWardSelection({...localCriteria,province,provinces},areas);
        wards=selected.ok?selected.codes:[...new Set((splitProvinceNames(province).length?splitProvinceNames(province):['']).flatMap(name=>wardCodesByName(areas,name,ward)))];
        if(selected.ok&&selected.selected)localCriteria.wardIdentities=selected.identities;
        if(!wards.length&&!investor&&!keyword&&!provinces.length){
          return {ok:false,message:`Không nhận ra xã/phường "${ward}". Hãy chọn tỉnh trước rồi chọn từ danh sách gợi ý.`};
        }
      }
    }
  }

  const id=newLookupId();
  const label=[category&&categoryLabel(category),investor&&`CĐT "${investor}"`,ward&&`xã/phường "${ward}"`,province&&!ward&&`tỉnh "${province}"`]
    .filter(Boolean).join(' · ')||`từ khoá "${keyword}"`;

  const criteria={...localCriteria,investor,province,ward,keyword,category,provinces,wards,fromDate,toDate,days};
  criteria.dateRange=dateRangeFrom(criteria);
  const queryBatch=lookupBatch(criteria,buildKhlcntQueries(criteria),'khlcnt',(investor||keyword||wards.length)?0:40);
  const lookup={
    id,huntId:String(payload.huntId||''),criteria,queryBatch,qi:0,label,planDataVersion:2,
    status:'RUNNING',message:'Đang hỏi e-GP các kế hoạch theo tiêu chí đã chọn...',
    startedAt:new Date().toISOString(),finishedAt:null,
    plans:[],totalElements:0,serverCount:0,areaDropped:0,dateDropped:0,categoryDropped:0,categoryUnknownPackages:0,
    cancelled:false,applied:null,mismatched:[]
  };
  const claimed=await claimLookupJob('planLookup',lookup);
  if(!claimed.ok)return {ok:false,message:'Một lượt tra kế hoạch đang chạy. Hãy chờ hoặc bấm Dừng trước khi tra lại.',lookup:claimed.current};

  try{
    const tab=await ensureEgpSearchTab(payload.focusTab!==false);
    const bound=await bindLookupTab('planLookup',id,tab.id);
    await dispatchBatchTask('planLookup',id);
    await chrome.alarms.create(TIMEOUT_PREFIX+id,{when:Date.now()+RUN_STALE_MS});
    return {ok:true,lookup:bound};
  }catch(error){
    const message=String(error?.message||error);
    await failLookupJob('planLookup',id,message);
    return {ok:false,message};
  }
}

async function ingestPlanPage(payload={}){
  return withLock(async()=>{
    const s=await readJobState('planLookup',{areas:null}),lookup=s.planLookup;
    if(!lookup||lookup.id!==payload.planId)return {ok:false};
    const rows=Array.isArray(payload.records)?payload.records:[];
    const all=rows.map(normalizeKhlcntPlan).filter(Boolean);
    const sourceKeys=extendSourceKeys(lookup.queryBatch?lookup.queryKeys:Object.keys(lookup.resultStates||{}),all.map(p=>p.key));
    const duplicateCount=Number(lookup.duplicateCount||0)+sourceKeys.duplicates;
    const classified=classifyPlansByCriteria(all,lookup.criteria||{},s.areas);
    const pageKeys=new Set(all.map(p=>p.key));
    const plans=dedupeKhlcnt([...(lookup.plans||[]).filter(p=>!pageKeys.has(p.key)),...classified.match]);
    const insufficientPlans=dedupeKhlcnt([...(lookup.insufficientPlans||[]).filter(p=>!pageKeys.has(p.key)),...classified.insufficient]);
    const resultStates={...(lookup.resultStates||{})};
    // Plan-level totals are disjoint, even if a plan contains both a matching
    // child and a child that cannot yet be assessed. Child counts stay separate.
    for(const state of ['outOfRange','insufficient','match'])for(const plan of classified[state])
      resultStates[plan.key]={filterState:plan.filterState,filterReason:plan.filterReason};
    const states=Object.values(resultStates);
    const matchCount=states.filter(r=>r.filterState==='MATCH').length;
    const insufficientCount=states.filter(r=>r.filterState==='INSUFFICIENT').length;
    const outOfRangeCount=states.filter(r=>r.filterState==='OUT_OF_RANGE').length;
    const invalidCount=Number(lookup.invalidCount||0)+rows.length-all.length;
    const serverCount=Number(lookup.serverCount||0)+rows.length;
    const dateUnknown=insufficientPlans.filter(p=>dateGate(khlcntStamp(p),khlcntDateRange(lookup.criteria||{}))==='INSUFFICIENT').length;
    const coverage=pageCoverage(lookup,{...payload,partial:Boolean(payload.partial||duplicateCount)},{fetched:serverCount,match:matchCount,
      insufficient:insufficientCount+invalidCount,outOfRange:outOfRangeCount,invalid:invalidCount});
    const partial=Boolean(lookup.partial||payload.partial||payload.capped||payload.schemaIssue||invalidCount||duplicateCount||(payload.done&&!coverage.complete));
    const unknownPrices=insufficientPlans.reduce((n,p)=>n+(p.packages||[]).filter(pkg=>(pkg.filterReasons||[]).some(r=>r.field==='price')).length,0);
    const next={...lookup,queryKeys:sourceKeys.keys,plans,insufficientPlans,resultStates,serverCount,invalidCount,duplicateCount,dateUnknown,unknownPrices,
      matchCount,insufficientCount,outOfRangeCount,coverage,partial,summary:summarizeKhlcnt(plans),
      totalElements:coverage.serverTotal,totalPages:coverage.totalPages,pagesRead:coverage.pagesRead,
      schemaIssue:Boolean(lookup.schemaIssue||payload.schemaIssue||invalidCount),
      areaDropped:states.filter(r=>['area','ward','investor'].includes(r.filterReason)).length,
      dateDropped:states.filter(r=>r.filterReason==='date').length,
      categoryDropped:states.filter(r=>r.filterReason==='category').length,
      categoryUnknownPackages:insufficientPlans.reduce((n,p)=>n+(p.packages||[]).filter(pkg=>(pkg.filterReasons||[]).some(r=>r.field==='category')).length,0),
      localDropped:outOfRangeCount,
      message:`Đã xét ${serverCount}/${coverage.serverTotal??'?'} kế hoạch; khớp ${matchCount}, chưa đủ dữ liệu ${insufficientCount}.`};
    if(payload.done){
      next.status=payload.cancelled?'CANCELLED':partial?'PARTIAL':'SUCCESS';
      next.finishedAt=new Date().toISOString();next.cancelled=Boolean(payload.cancelled);
      next.applied=payload.applied||null;next.summary=summarizeKhlcnt(plans);
      next.mismatched=[];
      next.message=`${matchCount} kế hoạch khớp · ${next.summary.packageCount} gói thầu. ${coverage.text}`;
      if(payload.failureReason||payload.deliveryMessage)next.message+=' '+(payload.failureReason||payload.deliveryMessage);
      if(duplicateCount)next.message+=` Có ${duplicateCount} bản ghi trùng giữa các trang; cần tra lại để xác nhận đầy đủ.`;
      next.listFinished=true;
      const details=plansNeedingDetails(next);
      if(!next.cancelled&&details.length){
        next.status='RUNNING';next.finishedAt=null;next.detailStatus='PENDING';
        next.detailTotal=Math.min(200,details.length);next.detailRead=0;next.detailFailed=0;
        next.detailCapped=details.length>200;
        next.message=`Đã lấy danh sách. Đang đọc tên, lĩnh vực và giá từng gói trên ${next.detailTotal} kế hoạch gần đây...`;
      }
    }
    if(insufficientPlans.length)next.message+=` Giữ ${insufficientPlans.length} kế hoạch có gói thiếu dữ liệu để kiểm tra riêng; không cộng các gói này vào giá trị khớp.`;
    await save({[KEYS.planLookup]:next});return {ok:true};
  });
}

function plansNeedingDetails(job){
  const map=new Map();
  for(const plan of [...(job.plans||[]),...(job.insufficientPlans||[])]){
    if(plan.sourceId&&needsKhlcntPackageDetails(plan))map.set(plan.key,plan);
  }
  return dedupeKhlcnt([...map.values()]);
}

async function applyPlanDetailResult(id,base,result){
  return withLock(async()=>{
    const state=await readJobState('planLookup',{areas:null}),job=state.planLookup;
    if(job?.id!==id||job.cancelled||job.status!=='RUNNING')return {ok:false};
    const detail=result.ok?applyKhlcntPackageDetail(base,result.receipt):result;
    let plans=job.plans||[],insufficientPlans=job.insufficientPlans||[],states={...(job.resultStates||{})};
    if(detail.ok){
      const classified=classifyPlansByCriteria([detail.plan],job.criteria||{},state.areas);
      plans=dedupeKhlcnt([...plans.filter(p=>p.key!==base.key),...classified.match]);
      insufficientPlans=dedupeKhlcnt([...insufficientPlans.filter(p=>p.key!==base.key),...classified.insufficient]);
      const row=classified.match[0]||classified.insufficient[0]||classified.outOfRange[0];
      if(row)states[base.key]={filterState:row.filterState,filterReason:row.filterReason};
    }else{
      insufficientPlans=insufficientPlans.map(p=>p.key===base.key?{...p,detailReadError:detail.message||detail.reason||'Chưa đọc được chi tiết kế hoạch.'}:p);
    }
    const counts={match:Object.values(states).filter(s=>s.filterState==='MATCH').length,
      insufficient:Object.values(states).filter(s=>s.filterState==='INSUFFICIENT').length+(Number(job.invalidCount)||0),
      outOfRange:Object.values(states).filter(s=>s.filterState==='OUT_OF_RANGE').length};
    const coverage=job.queryBatch?.length?batchCoverage(job,job.batchReceipts||{},counts):coverageOf({...job.coverage,...counts});
    const read=Number(job.detailRead||0)+(detail.ok?1:0),failed=Number(job.detailFailed||0)+(detail.ok?0:1);
    const allStates=Object.values(states);
    await save({planLookup:{...job,plans,insufficientPlans,resultStates:states,coverage,
      matchCount:counts.match,insufficientCount:counts.insufficient,outOfRangeCount:counts.outOfRange,
      detailRead:read,detailFailed:failed,summary:summarizeKhlcnt(plans),
      dateUnknown:insufficientPlans.filter(p=>dateGate(khlcntStamp(p),khlcntDateRange(job.criteria||{}))==='INSUFFICIENT').length,
      categoryUnknownPackages:insufficientPlans.reduce((n,p)=>n+(p.packages||[]).filter(pkg=>(pkg.filterReasons||[]).some(r=>r.field==='category')).length,0),
      unknownPrices:insufficientPlans.reduce((n,p)=>n+(p.packages||[]).filter(pkg=>(pkg.filterReasons||[]).some(r=>r.field==='price')).length,0),
      dateDropped:allStates.filter(s=>s.filterReason==='date').length,
      categoryDropped:allStates.filter(s=>s.filterReason==='category').length,
      areaDropped:allStates.filter(s=>['area','ward','investor'].includes(s.filterReason)).length,
      localDropped:counts.outOfRange,
      message:`Đã đối chiếu ${read+failed}/${job.detailTotal} chi tiết kế hoạch · ${plans.length} kế hoạch khớp${failed?` · ${failed} kế hoạch chưa đọc được chi tiết`:''}.`}});
    await chrome.alarms.create(TIMEOUT_PREFIX+id,{when:Date.now()+RUN_STALE_MS});
    return {ok:Boolean(detail.ok)};
  });
}

async function startPlanDetailPhase(id){
  const {planLookup:job}=await readJobState('planLookup');
  if(job?.id!==id||job.cancelled||job.detailStatus!=='PENDING')return;
  const plans=plansNeedingDetails(job).slice(0,200);
  const started=await withLock(async()=>{
    const {planLookup:current}=await readJobState('planLookup');
    if(current?.id!==id||current.cancelled||current.detailStatus!=='PENDING')return false;
    await save({planLookup:{...current,detailStatus:'READING'}});return true;
  });
  if(!started)return;
  const result=await planDetailReader.run(id,plans,(plan,receipt)=>applyPlanDetailResult(id,plan,receipt));
  await withLock(async()=>{
    const {planLookup:current}=await readJobState('planLookup');
    if(current?.id!==id||current.cancelled||current.status!=='RUNNING')return;
    const partial=Boolean(current.partial||current.detailCapped||current.detailFailed||!result.ok);
    const summary=summarizeKhlcnt(current.plans||[]);
    const coverage=coverageOf({...current.coverage,partial});
    await save({planLookup:{...current,detailStatus:'DONE',status:partial?'PARTIAL':'SUCCESS',partial,
      finishedAt:new Date().toISOString(),summary,coverage,
      message:`${current.plans?.length||0} kế hoạch khớp · ${summary.packageCount} gói thầu. ${coverage.text}${current.detailFailed?` Có ${current.detailFailed} kế hoạch chưa đọc được chi tiết; không cộng giá chưa xác minh.`:''}${current.detailCapped?' Đã chạm giới hạn 200 chi tiết; hãy thu hẹp tiêu chí để đọc phần còn lại.':''}`}});
  });
  await chrome.alarms.clear(TIMEOUT_PREFIX+id).catch(()=>{});
  await recordHuntOutcome((await readJobState('planLookup')).planLookup);
}

async function exportPlansCsv(...args){return exportRuntime.exportPlansCsv(...args);}

/* ==========================================================================
 *  CHỨC NĂNG 1 — TÌM THÔNG BÁO MỜI THẦU THEO BIỂU MẪU
 *
 *  Trước đây chức năng này chỉ phát lại "bộ lọc đã lưu" — muốn đổi tiêu chí thì
 *  phải sang e-GP tìm lại rồi lưu bộ lọc mới. Nay có biểu mẫu riêng: người dùng
 *  nhập chủ đầu tư / tỉnh / xã / từ khoá / khoảng giá, tiện ích đặt thẳng lên
 *  biểu mẫu của e-GP rồi để e-GP tự dựng truy vấn.
 *
 *  Vì sao lại để e-GP dựng: một tỉnh sau sáp nhập mang nhiều mã địa bàn
 *  (xem lib/khlcnt.js). Đặt qua biểu mẫu thì e-GP tự lo, không bỏ sót hồ sơ cũ.
 *
 *  Kết quả đi thẳng vào kho gói thầu chung nên vẫn được chấm điểm, chống trùng,
 *  và hiện ở màn hình chính như mọi lượt quét khác.
 * ======================================================================== */

const TBMT_NOTICE_LABEL='Thông báo mời thầu';

/** Lượt quét quá hạn này coi như đã chết, dù chưa ai báo kết thúc. */
const RUN_STALE_MS=8*60*1000;

/** Gia hạn timeout theo tiến độ hợp lệ, thay vì cắt job dài đúng phút thứ 8. */
async function renewProgressLease(key,id){
  const at=new Date().toISOString();
  let timeoutMs=RUN_STALE_MS;
  let touched=false;
  if(key==='activeRun'){
    const s=await readJobState(key,{settings:DEFAULT_SETTINGS});
    if(s.activeRun?.id===id&&s.activeRun.status==='RUNNING'){
      timeoutMs=scanTimeoutMs(s);
      await updateRun(id,{lastProgressAt:at});
      touched=true;
    }
  }else{
    touched=await withLock(async()=>{
      const s=await readJobState(key,{settings:DEFAULT_SETTINGS});
      const cur=s[key];
      if(!cur||cur.id!==id||!isLookupActive(lookupKind(key),cur))return false;
      await save({[KEYS[key]]:{...cur,lastProgressAt:at}});
      return true;
    });
  }
  if(touched)await chrome.alarms.create(TIMEOUT_PREFIX+id,{when:Date.now()+timeoutMs});
  return touched;
}

function receivedPageIndexes(job={}){
  return new Set((Array.isArray(job.receivedPages)?job.receivedPages:[])
    .map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<200000));
}

async function recordReceivedPage(key,id,pageIndex){
  if(!Number.isInteger(pageIndex)||pageIndex<0)return false;
  return withLock(async()=>{
    const s=await readJobState(key);
    const job=key==='activeRun'?s.activeRun:s[key];
    if(!job||job.id!==id)return false;
    const pages=receivedPageIndexes(job);
    pages.add(pageIndex);
    const next={...job,receivedPages:[...pages].sort((a,b)=>a-b)};
    if(key==='activeRun'){
      const runs=s.runs.map(r=>r.id===id?{...r,receivedPages:next.receivedPages}:r);
      await save({[KEYS.runs]:runs.slice(0,100),[KEYS.activeRun]:next});
    }else await save({[KEYS[key]]:next});
    return true;
  });
}

/**
 * Dọn lượt quét kẹt.
 *
 * Một lượt có thể chết mà không ai báo: người dùng đóng tab e-GP, tắt máy giữa
 * chừng, hoặc biểu mẫu e-GP đổi khiến content script không chạy tiếp. Trước đây
 * `activeRun` nằm lại vĩnh viễn và MỌI lần tra cứu sau đều bị chặn bằng câu
 * "Một lượt quét khác đang chạy" — không có cách nào thoát ra từ giao diện.
 *
 * Nay tự dọn khi: quá hạn, hoặc tab e-GP của lượt đó không còn.
 * Trả về lượt vẫn đang chạy thật (nếu có), null nếu đã dọn xong.
 */
async function clearStaleRun(activeRun){
  if(!activeRun)return null;

  const age=Date.now()-new Date(activeRun.lastProgressAt||activeRun.startedAt||0).getTime();
  let tabGone=false;
  if(activeRun.tabId){
    try{ await chrome.tabs.get(activeRun.tabId); }catch{ tabGone=true; }
  }

  if(age>RUN_STALE_MS||tabGone){
    await finishRun(activeRun.id,'TIMEOUT',
      tabGone?'Tab e-GP đã đóng nên lượt quét dừng giữa chừng.'
             :'Lượt quét quá hạn nên đã tự dừng.');
    await save({[KEYS.activeRun]:null});
    return null;
  }
  return activeRun;
}

/* ==========================================================================
 *  DỪNG LƯỢT TRA CỨU — dứt điểm, không chờ tab
 *
 *  LỖI CŨ: nút Dừng chỉ nhắn `KQLCNT_CANCEL` cho tab rồi đặt lời nhắn "đang
 *  dừng...", và TRÔNG CHỜ chính tab đó báo về là đã xong. Nếu người dùng đóng
 *  tab e-GP, chuyển trang, hoặc content script đã chết thì không còn ai báo
 *  về — trạng thái kẹt ở RUNNING cho tới khi hết hạn 8 phút. Người dùng thấy
 *  "Đang dừng..." quay mãi và tưởng phần mềm vẫn đang chạy.
 *
 *  NAY: nhắn cho tab để nó ngừng sớm (nếu còn sống), rồi CHỐT NGAY trạng thái
 *  trong kho. Dữ liệu đã thu được vẫn giữ nguyên và vẫn tổng hợp bình thường.
 * ======================================================================== */

/** Các lượt tra cứu dùng chung bộ máy phân trang, kèm cách chốt sổ của từng loại. */
const LOOKUP_KINDS=[
  {key:'winnerLookup',label:'tra cứu nhà thầu trúng thầu',modes:['exact','discover'],statuses:['RUNNING']},
  {key:'bidOpenScan',label:'quét gói đang chờ kết quả',modes:['bbmt-list'],statuses:['LISTING','SCANNING','RUNNING']},
  {key:'planLookup',label:'tra cứu kế hoạch LCNT',modes:['khlcnt'],statuses:['RUNNING']},
  {key:'areaScan',label:'soi địa bàn',modes:['area'],statuses:['RUNNING']},
  {key:'investorScan',label:'hồ sơ chủ đầu tư',modes:['investor'],statuses:['RUNNING']}
];

function lookupKind(key){return LOOKUP_KINDS.find(k=>k.key===key)||null;}
function isLookupActive(kind,value){return Boolean(value&&kind&&kind.statuses.includes(value.status));}
function lookupResultCount(key,job={}){
  if(key==='planLookup')return Array.isArray(job.plans)?job.plans.length:0;
  if(key==='winnerLookup'&&job.mode==='discover')return Array.isArray(job.candidates)?job.candidates.length:0;
  if(key==='investorScan'&&job.mode==='discover'&&Array.isArray(job.candidates)&&job.candidates.length){
    return job.candidates.length;
  }
  return Array.isArray(job.packages)?job.packages.length:0;
}

/** Gắn job vào tab trước khi giao việc; chặn một start cũ ghi đè job mới. */
async function bindLookupTab(key,id,tabId){
  if(!Number.isInteger(tabId))throw new Error('Không xác định được tab e-GP cho lượt tra cứu.');
  return withLock(async()=>{
    const s=await readJobState(key);
    const cur=s[key];
    if(!cur||cur.id!==id)throw new Error('Lượt tra cứu đã được thay thế bởi một lượt mới.');
    const next={...cur,tabId};
    await save({[KEYS[key]]:next});
    return next;
  });
}

/** Chỉ chốt lỗi nếu id vẫn là job hiện tại của đúng loại. */
async function failLookupJob(key,id,message,status='ERROR'){
  if(key==='planLookup')planDetailReader.cancel(id);
  const kind=lookupKind(key);
  if(!kind)return false;
  if(key==='bidOpenScan'){
    bbmtCancelled=true;
    if(bbmtWaiter?.scanId===id)bbmtWaiter.resolve(null);
  }
  const changed=await withLock(async()=>{
    const s=await readJobState(key);
    const cur=s[key];
    if(!cur||cur.id!==id||!isLookupActive(kind,cur))return false;
    await save({[KEYS[key]]:{...cur,status,partial:status==='PARTIAL'||Boolean(cur.partial),
      finishedAt:new Date().toISOString(),message:String(message||'Lượt tra cứu bị gián đoạn.').slice(0,1000)}});
    return true;
  });
  if(changed)await chrome.alarms.clear(TIMEOUT_PREFIX+id).catch(()=>{});
  if(changed&&key==='planLookup')await recordHuntOutcome((await readJobState('planLookup')).planLookup);
  return changed;
}

/** DONE lỗi đến sau RESULTS(done): vẫn phải sửa đúng bản ghi đã chốt SUCCESS. */
async function markLookupDoneFailure(key,id,message,partial=false){
  const outcome=await withLock(async()=>{
    const s=await readJobState(key);
    const cur=s[key];
    if(!cur||cur.id!==id)return {changed:false,stopBid:false};
    const got=lookupResultCount(key,cur);
    const isPartial=key==='bidOpenScan'?got>0:Boolean(partial||cur.partial||got);
    // Danh sách BBMT có thể thiếu một phần nhưng các gói đã nhận vẫn đáng để
    // đọc biên bản. Giữ phase LISTING/SCANNING chạy tiếp, rồi finalize PARTIAL.
    const keepBidDetails=key==='bidOpenScan'&&isPartial&&(cur.listingDone||cur.status==='SCANNING')&&isLookupActive(lookupKind(key),cur);
    const next={...cur,listPartial:key==='bidOpenScan'?isPartial:cur.listPartial,status:keepBidDetails?cur.status:(isPartial?'PARTIAL':'ERROR'),
      partial:isPartial,finishedAt:keepBidDetails?cur.finishedAt:new Date().toISOString(),
      message:String(message||'Lượt tra cứu e-GP bị gián đoạn.').slice(0,1000)};
    await save({[KEYS[key]]:next});
    return {changed:true,stopBid:key==='bidOpenScan'&&!keepBidDetails};
  });
  if(outcome.stopBid){
    bbmtCancelled=true;
    if(bbmtWaiter?.scanId===id)bbmtWaiter.resolve(null);
  }
  if(outcome.changed)await chrome.alarms.clear(TIMEOUT_PREFIX+id).catch(()=>{});
  return outcome.changed;
}

async function markLookupPartial(key,id,message=''){
  return withLock(async()=>{
    const s=await readJobState(key);
    const cur=s[key];
    if(!cur||cur.id!==id)return false;
    const keepDetails=(key==='bidOpenScan'||key==='planLookup'&&['PENDING','READING'].includes(cur.detailStatus))&&isLookupActive(lookupKind(key),cur);
    await save({[KEYS[key]]:{...cur,status:keepDetails?cur.status:'PARTIAL',partial:true,
      finishedAt:keepDetails?cur.finishedAt:(cur.finishedAt||new Date().toISOString()),
      message:message?String(message).slice(0,1000):cur.message}});
    return true;
  });
}

/** Chỉ nhắn đúng tab sở hữu job; payload id dành cho content script mới. */
async function tellJobsToStop(jobs){
  const sent=new Set();
  for(const job of jobs||[]){
    if(!Number.isInteger(job?.tabId)||sent.has(job.tabId))continue;
    sent.add(job.tabId);
    try{
      await chrome.tabs.sendMessage(job.tabId,{type:'KQLCNT_CANCEL',payload:{planId:job.id}});
    }catch{}
  }
  return sent.size;
}

/**
 * Chốt sổ một lượt đang chạy ngay lập tức.
 * `which` = tên khoá cụ thể, hoặc bỏ trống để chốt mọi lượt đang chạy.
 */
async function cancelLookups(which,reason='Đã dừng theo yêu cầu.',expectedId=null){
  const before=await readQueryControlState(chrome.storage.local);
  const selected=[];
  for(const kind of LOOKUP_KINDS){
    if(which&&kind.key!==which)continue;
    const cur=before[kind.key];
    if(isLookupActive(kind,cur)&&(!expectedId||cur.id===expectedId))selected.push({key:kind.key,id:cur.id,tabId:cur.tabId});
  }
  await tellJobsToStop(selected);
  for(const row of selected)if(row.key==='planLookup')planDetailReader.cancel(row.id);
  if(selected.some(x=>x.key==='bidOpenScan')){
    bbmtCancelled=true;
    const id=selected.find(x=>x.key==='bidOpenScan')?.id;
    if(bbmtWaiter?.scanId===id)bbmtWaiter.resolve(null);
  }
  const ids=new Map(selected.map(x=>[x.key,x.id]));
  return withLock(async()=>{
    const s=await getState();
    const patch={};
    const stopped=[];
    for(const kind of LOOKUP_KINDS){
      if(which&&kind.key!==which)continue;
      const cur=s[kind.key];
      if(!isLookupActive(kind,cur)||ids.get(kind.key)!==cur.id)continue;

      const next={...cur,cancelled:true,partial:true,finishedAt:new Date().toISOString()};
      // Đã thu được dữ liệu thì vẫn tổng hợp và coi là thành công một phần —
      // bỏ đi thì phí công chờ của người dùng.
      const got=lookupResultCount(kind.key,cur);
      if(kind.key==='areaScan'&&got){
        next.status='PARTIAL';
        next.summary=summarizeArea(cur.packages,cur.criteria);
        next.pricing=summarizePricing(cur.packages,{});
        next.message=`Đã dừng: giữ lại ${got} gói đã lấy được `
          +`(${next.summary.contractorCount} nhà thầu · ${next.summary.investorCount} chủ đầu tư).`;
      }else if(kind.key==='winnerLookup'&&got){
        next.status='PARTIAL';
        if(cur.mode==='exact'){
          next.summary=summarizeWinner(cur.packages||[]);
          next.contractorName=cur.contractorName
            ||cur.packages?.find(p=>!p.isVenture)?.winnerName||cur.packages?.[0]?.winnerName||'';
        }
        next.message=cur.mode==='discover'
          ?`Đã dừng: giữ lại ${got} nhà thầu khớp tên đã tìm thấy.`
          :`Đã dừng: giữ lại ${got} gói trúng thầu đã lấy được.`;
      }else if(kind.key==='investorScan'&&got){
        next.status='PARTIAL';
        if(cur.mode==='discover')next.candidates=discoverInvestors(cur.packages||[]);
        else next.summary=summarizeInvestor(cur.packages||[],{
          codes:cur.criteria?.codes||[],name:cur.criteria?.name||''});
        next.message=cur.mode==='discover'
          ?`Đã dừng: giữ lại ${next.candidates?.length||0} chủ đầu tư nhận diện từ ${got} gói.`
          :`Đã dừng: hồ sơ một phần gồm ${got} gói đã lấy được.`;
      }else if(kind.key==='planLookup'&&(got||cur.insufficientPlans?.length||cur.serverCount)){
        next.status='PARTIAL';
        next.summary=summarizeKhlcnt(cur.plans||[]);
        next.mismatched=auditPlans(cur.plans||[],cur.criteria||{}).map(p=>p.planNoStand);
        next.message=`Đã dừng: giữ lại ${got} kế hoạch · ${next.summary.packageCount} gói thầu.`;
      }else if(kind.key==='bidOpenScan'&&got){
        next.status='PARTIAL';
        next.packages=(cur.packages||[]).map(p=>p.readState==='READING'?{...p,readState:'PENDING'}:p);
        next.summary=summarizeBidOpenings(cur.packages||[],cur.focusTaxCode,cur.contractorQuery);
        next.scannedCount=next.summary.scanned;
        next.message=`Đã dừng: giữ lại ${got} gói, đã đọc ${next.summary.scanned} biên bản.`;
      }else if(got){
        next.status='PARTIAL';
        next.message=`Đã dừng: giữ lại ${got} bản ghi đã lấy được.`;
      }else{
        next.status='ERROR';
        next.partial=false;
        next.message=reason;
      }
      patch[KEYS[kind.key]]=next;
      stopped.push(kind.label);
      await chrome.alarms.clear(TIMEOUT_PREFIX+cur.id).catch(()=>{});
    }
    if(Object.keys(patch).length)await save(patch);
    return {ok:true,stopped,
      message:stopped.length?`Đã dừng: ${stopped.join(', ')}.`:'Không có lượt nào đang chạy.'};
  });
}

/**
 * Tab e-GP bị đóng thì chốt sổ mọi lượt đang chạy.
 *
 * Không còn tab nào của e-GP nghĩa là không còn ai chạy vòng lặp phân trang,
 * nên để trạng thái RUNNING lại là nói dối người dùng.
 */
chrome.tabs.onRemoved.addListener(async tabId=>{
  bbmtWaiter?.waiters.get(tabId)?.resolve(null);
  const s=await getState();
  if(s.activeRun?.tabId===tabId){
    await finishRun(s.activeRun.id,'TIMEOUT','Tab e-GP của lượt quét đã bị đóng.');
  }
  // Mỗi job có tab riêng: đóng tab A không được dừng các job ở tab B/C.
  for(const kind of LOOKUP_KINDS){
    const cur=s[kind.key];
    const ownsTab=kind.key==='bidOpenScan'&&cur?.status==='SCANNING'?(cur.detailTabIds||[]).includes(tabId):cur?.tabId===tabId;
    if(isLookupActive(kind,cur)&&ownsTab){
      await cancelLookups(kind.key,'Tab e-GP của lượt tra cứu đã bị đóng.',cur.id);
    }
  }
});

/**
 * Dọn các lượt còn kẹt trạng thái "đang chạy" từ phiên trước.
 *
 * VÌ SAO CẦN: trạng thái nằm trong `chrome.storage`, còn vòng lặp phân trang
 * nằm trong tab e-GP. Đóng trình duyệt, tắt máy, hay nạp lại tiện ích thì tab
 * chết mà bản ghi vẫn ghi RUNNING. Lần sau mở trang, giao diện đọc bản ghi đó
 * rồi vẽ thanh tiến trình — trông y như phần mềm TỰ ĐỘNG CHẠY, dù không có gì
 * đang chạy cả. Đúng lỗi người dùng gặp ở trang Soi địa bàn.
 *
 * Coi là kẹt khi: quá hạn RUN_STALE_MS, HOẶC không còn tab e-GP nào mở.
 */
async function reconcileStaleLookups({coldStart=false}={}){
  const tabs=await chrome.tabs.query({url:'https://muasamcong.mpi.gov.vn/*'});
  const tabIds=new Set(tabs.map(t=>t.id));
  const noTab=tabs.length===0;
  const s=await getState();
  const cleared=[];
  if(s.activeRun?.status==='RUNNING'){
    const age=Date.now()-new Date(s.activeRun.lastProgressAt||s.activeRun.startedAt||0).getTime();
    const ownTabGone=Number.isInteger(s.activeRun.tabId)
      ?!tabIds.has(s.activeRun.tabId):noTab;
    if(ownTabGone||age>RUN_STALE_MS){
      await finishRun(s.activeRun.id,'TIMEOUT',ownTabGone
        ?'Lượt quét của phiên trước đã dừng vì tab e-GP không còn mở.'
        :'Lượt quét của phiên trước đã dừng vì không có tiến triển trong thời gian cho phép.');
      cleared.push('activeRun');
    }
  }
  const stale=[];
  for(const kind of LOOKUP_KINDS){
    const cur=s[kind.key];
    if(!isLookupActive(kind,cur))continue;
    const age=Date.now()-new Date(cur.lastProgressAt||cur.startedAt||0).getTime();
    const ownTabGone=kind.key==='bidOpenScan'&&cur.status==='SCANNING'
      ?!(cur.detailTabIds||[]).some(id=>tabIds.has(id))
      :Number.isInteger(cur.tabId)?!tabIds.has(cur.tabId):noTab;
    // Giai đoạn đọc từng BBMT được điều phối trong service worker (waiter và
    // cursor nằm trong RAM). Nếu worker vừa bị Chrome dọn, không giả vờ tiếp
    // tục: chốt ngay PARTIAL và giữ mọi gói đã đọc. Các job phân trang khác
    // do content script điều phối nên vẫn có thể tiếp tục sau khi worker thức.
    const coordinatorLost=coldStart&&(kind.key==='bidOpenScan'&&cur.status==='SCANNING'||kind.key==='planLookup'&&cur.detailStatus==='READING');
    if(ownTabGone||age>RUN_STALE_MS||coordinatorLost){
      stale.push({key:kind.key,coordinatorLost});
    }
  }
  if(!stale.length)return {ok:true,cleared};
  for(const item of stale){
    await cancelLookups(item.key,item.coordinatorLost
      ?'Service worker đã khởi động lại giữa lúc đọc chi tiết; dữ liệu đã nhận được giữ ở trạng thái chưa đầy đủ.'
      :'Lượt tra cứu của phiên trước đã dừng — không còn tab e-GP nào đang chạy.',s[item.key]?.id);
  }
  return {ok:true,cleared:[...cleared,...stale.map(item=>item.key)]};
}

// Mỗi lần service worker được nạp lại, dọn coordinator BBMT mất trong RAM.
// onStartup bên dưới vẫn xử lý riêng lịch quét theo cấu hình người dùng.
reconcileStaleLookups({coldStart:true}).catch(()=>{});

/** Dừng hẳn lượt quét đang chạy theo yêu cầu người dùng. */
async function cancelActiveRun(expectedId=null){
  const s=await getState();
  if(!s.activeRun)return {ok:true,message:'Không có lượt nào đang chạy.'};
  if(expectedId&&s.activeRun.id!==expectedId)return {ok:false,message:'Lượt đã thay đổi. Tải lại trạng thái trước khi dừng.'};
  const run=s.activeRun;
  if(run.tabId){
    try{ await chrome.tabs.sendMessage(run.tabId,{type:'KQLCNT_CANCEL',payload:{planId:run.id}}); }catch{}
  }
  await finishRun(run.id,'CANCELLED','Đã dừng theo yêu cầu; dữ liệu đã nhận được giữ lại.');
  await save({[KEYS.activeRun]:null});
  await chrome.alarms.clear(TIMEOUT_PREFIX+run.id).catch(()=>{});
  return {ok:true,message:'Đã dừng lượt quét.'};
}

async function startTbmtSearch(payload={}){
  const directoryResolved=await resolveDirectoryPayload(payload);if(!directoryResolved.ok)return directoryResolved;payload=directoryResolved.payload;
  const validation=validateCriteria(payload);
  if(!validation.ok)return validation;
  const criteria=validation.criteria;

  const s=await getState();
  // Lượt cũ còn kẹt thì dọn rồi chạy tiếp, thay vì chặn người dùng vô thời hạn.
  const blocking=await clearStaleRun(s.activeRun);
  if(blocking){
    return {ok:false,message:'Một lượt quét khác đang chạy. Bấm "Dừng lượt đang chạy" rồi thử lại.',
      run:{id:blocking.id,message:blocking.message,startedAt:blocking.startedAt}};
  }

  const label=[criteria.category&&categoryLabel(criteria.category),criteria.investor&&`CĐT "${criteria.investor}"`,
    criteria.ward&&`xã/phường "${criteria.ward}"`,
    criteria.province&&!criteria.ward&&`tỉnh "${criteria.province}"`,
    criteria.mustKeywords&&`bắt buộc "${criteria.mustKeywords}"`,
    criteria.excludeKeywords&&`loại "${criteria.excludeKeywords}"`,
    criteria.keyword&&`từ khoá "${criteria.keyword}"`].filter(Boolean).join(' · ')||'theo khoảng giá';

  /* Quy TÊN tỉnh ra MỌI MÃ cùng tên (Lâm Đồng = 68 hiện hành + 703 cũ). */
  let provinces=[];
  if(criteria.province){
    const resolved=await resolveProvinceCodes(criteria.province);
    if(!resolved.ok){
      return {ok:false,message:`Không nhận ra tỉnh/thành "${resolved.unknown.join(', ')}". `
        +'Hãy chọn từ danh sách gợi ý; nhiều tỉnh cách nhau bằng dấu phẩy hoặc chấm phẩy.'};
    }
    provinces=resolved.codes;
  }

  if(criteria.ward||criteria.wardCode||criteria.wardIdentities?.length){
    const response=criteria.province?await getWardAreas(criteria.province):await getAreas({});
    if(!response.areas)return {ok:false,message:'Chưa tải được danh mục xã/phường e-GP. Hãy thử lại; tiêu chí địa bàn chưa được bỏ qua.'};
    const selected=resolveWardSelection({...criteria,provinces},response.areas);
    if(selected.ok&&selected.selected)criteria.wardIdentities=selected.identities;
  }

  const queue=investorScopes({...criteria,provinces}).map(item=>({name:label,criteria:item}));
  const run={...newRun('form'),queue,qi:0,criteria:{...criteria,provinces},huntId:payload.huntId||'',
    message:'Đang hỏi e-GP các gói thầu khớp tiêu chí...'};
  const claimed=await claimActiveRun(run);
  if(!claimed.ok)return {ok:false,message:'Một lượt quét khác vừa được bắt đầu.',run:claimed.current};

  try{
    const tab=await ensureEgpSearchTab(payload.focusTab!==false);
    await updateRun(run.id,{tabId:tab.id,status:'RUNNING'});
    await dispatchLookupToTab(tab.id,{
      id:run.id,mode:'tbmt',queryIndex:0,label,
      /* TỰ DỰNG truy vấn, không chạm biểu mẫu e-GP nữa. Cách cũ không lọc được
         khi người dùng CHỈ chọn tỉnh mà bỏ trống chủ đầu tư và xã/phường.
         Đã đo thật: chỉ lọc tỉnh Lâm Đồng -> 579 gói; thêm giá ≥3 tỷ -> 186. */
      query:buildTbmtQuery(queue[0].criteria),
      pageSize:PAGE_SIZE,
      maxPages:Math.max(1,Number(s.settings.maxPagesHint)||DEFAULT_SETTINGS.maxPagesHint)
    });
    // Hen gio tu ket thuc — khong co cai nay thi luot treo se ket cung mai mai.
    await chrome.alarms.create(TIMEOUT_PREFIX+run.id,{when:Date.now()+RUN_STALE_MS});
    return {ok:true,runId:run.id};
  }catch(error){
    const message=String(error?.message||error);
    await finishRun(run.id,'ERROR',message);
    return {ok:false,message};
  }
}

/** Nhận từng trang TBMT: đưa thẳng vào kho gói thầu để chấm điểm như thường. */
async function ingestTbmtPage(payload={}){
  const st=await getState();
  if(st.activeRun?.id!==payload.planId)return {ok:false};
  const all=Array.isArray(payload.records)?payload.records:[];
  const invalid=all.filter(raw=>!normalizeCandidate(raw,{captureType:'form'})).length;
  if(all.length)await ingest(all,{runId:payload.planId,captureType:'form',
    total:payload.totalElements,page:(Number(payload.pageIndex)||0)+1});
  return withLock(async()=>{
    const s=await getState(),run=s.activeRun;
    if(run?.id!==payload.planId)return {ok:false};
    const sourceKeys=extendSourceKeys(run.queryKeys,all.map(raw=>normalizeCandidate(raw,{captureType:'form'})?.key).filter(Boolean));
    const queryKeys=sourceKeys.keys;
    const queryDuplicateCount=Number(run.queryDuplicateCount||0)+sourceKeys.duplicates;
    const duplicateCount=Number(run.duplicateCount||0)+sourceKeys.duplicates;
    const querySourceCount=Number(run.querySourceCount||0)+all.length;
    const queryInvalidCount=Number(run.queryInvalidCount||0)+invalid;
    const sourceCount=Number(run.sourceCount||0)+all.length;
    const invalidCount=Number(run.invalidCount||0)+invalid;
    const queryJob={...run,totalElements:run.queryTotalElements??null,totalPages:run.queryTotalPages??null};
    const current=pageCoverage(queryJob,{...payload,partial:Boolean(payload.partial||queryDuplicateCount)},{fetched:querySourceCount,invalid:queryInvalidCount});
    const queryCoverage={...(run.queryCoverage||{}),[Number(run.qi)||0]:current};
    const parts=Object.values(queryCoverage);
    const summed=key=>parts.every(c=>c[key]!==null)?parts.reduce((n,c)=>n+c[key],0):null;
    const coverage=coverageOf({serverTotal:summed('serverTotal'),totalPages:summed('totalPages'),
      pagesRead:parts.reduce((n,c)=>n+c.pagesRead,0),fetched:sourceCount,
      match:run.matchCount||0,insufficient:(run.insufficientCount||0)+invalidCount,outOfRange:run.outOfRangeCount||0,
      done:payload.done===true&&Number(run.qi||0)>=Math.max(0,(run.queue||[]).length-1),
      partial:Boolean(run.partial||payload.partial||payload.capped||payload.schemaIssue||invalidCount||duplicateCount||parts.some(c=>c.done&&c.complete===false))});
    const partial=Boolean(run.partial||payload.partial||payload.capped||payload.schemaIssue||invalidCount||duplicateCount||(payload.done&&!current.complete));
    const note=payload.failureReason||payload.deliveryMessage||(duplicateCount?`Có ${duplicateCount} bản ghi trùng giữa các trang của cùng truy vấn; chưa xác nhận lấy đủ. `:'')+coverage.text;
    const patch={sourceCount,invalidCount,duplicateCount,queryKeys,queryDuplicateCount,querySourceCount,queryInvalidCount,queryCoverage,coverage,
      queryTotalElements:current.serverTotal,queryTotalPages:current.totalPages,
      partial,schemaIssue:Boolean(run.schemaIssue||payload.schemaIssue||invalidCount),
      message:payload.done?'Đã nhận trang cuối; đang chốt lượt tra cứu...':coverage.text};
    if(payload.done)Object.assign(patch,{applied:payload.applied||{},pageDone:true,capped:Boolean(payload.capped),
      partialMessage:partial?note:'',completionMessage:partial?note:'Hoàn tất. '+coverage.text});
    const next={...run,...patch};
    await save({[KEYS.activeRun]:next,[KEYS.runs]:s.runs.map(r=>r.id===payload.planId?{...r,...patch}:r)});
    return {ok:true};
  });
}

/* ==========================================================================
 *  KHO QUAN SÁT — nền của mọi phân tích
 *
 *  Mỗi lần tra cứu trúng thầu hoặc soi biên bản mở thầu, dữ liệu được rút thành
 *  "quan sát" (một nhà thầu dự một gói) và tích luỹ lại. Càng dùng lâu, phân
 *  tích càng chính xác — vì vậy kho này KHÔNG bị xoá khi tra cứu lượt mới.
 * ======================================================================== */

const OBSERVATIONS_MAX=60000;

/* Gom quan sat trong luc dang chay roi ghi mot lan, tranh ghi storage lien tuc. */
let obsQueue=[];
async function flushObservations(){
  if(!obsQueue.length)return;
  const rows=obsQueue;obsQueue=[];
  await addObservations(rows);
}

async function addObservations(rows){
  if(!rows||!rows.length)return;
  return withLock(async()=>{
    const s=await getState();
    const merged=mergeObservations(s.observations,rows);
    // Đầy kho thì bỏ quan sát cũ nhất, giữ lại phần mới có giá trị phân tích hơn.
    const kept=merged.length>OBSERVATIONS_MAX
      ? merged.sort((a,b)=>new Date(b.at||0)-new Date(a.at||0)).slice(0,OBSERVATIONS_MAX)
      : merged;
    await save({[KEYS.observations]:kept});
  });
}

/** Trả về đúng phần phân tích mà giao diện hỏi, tránh gửi cả kho qua message. */
async function getAnalytics(payload={}){
  const s=await getState();
  const obs=s.observations||[];
  const kind=payload.kind||'summary';

  if(kind==='profile'){
    return {ok:true,profile:contractorProfile(obs,payload.taxCode),total:obs.length};
  }
  if(kind==='discount'){
    return {ok:true,total:obs.length,
      discount:discountProfile(obs,{field:payload.field,taxCode:payload.taxCode,investor:payload.investor}),
      threshold:winThreshold(obs,{field:payload.field,investor:payload.investor})};
  }
  if(kind==='relations'){
    return {ok:true,total:obs.length,
      matrix:investorMatrix(obs,{minPackages:Number(payload.minPackages)||2,investor:payload.investor}).slice(0,60),
      competition:competitionStats(obs,{investor:payload.investor,field:payload.field})};
  }
  // Tóm tắt cho màn hình mở đầu.
  const bbmt=obs.filter(o=>o.source==='bbmt');
  return {ok:true,total:obs.length,
    withBidders:bbmt.length,
    packages:new Set(obs.map(o=>o.notifyNo)).size,
    contractors:new Set(obs.map(o=>o.taxCode).filter(Boolean)).size,
    investors:new Set(obs.map(o=>o.investorName).filter(Boolean)).size};
}

/* --------------------------------------------------------------------------
 * NHẬP BACKUP AN TOÀN
 * Chỉ khôi phục dữ liệu nghiệp vụ. Tích hợp, bí mật và tự động hóa luôn tắt để
 * một tệp JSON không thể âm thầm đổi nơi nhận Telegram hoặc tự chạy truy vấn.
 * ------------------------------------------------------------------------ */
function importedSettings(raw={}){
  const out={...DEFAULT_SETTINGS};
  for(const [key,base] of Object.entries(DEFAULT_SETTINGS)){
    const value=raw[key];
    if(Array.isArray(base)){
      out[key]=Array.isArray(value)
        ?value.slice(0,120).map(x=>String(x||'').trim().slice(0,160)).filter(Boolean)
        :base;
    }else if(typeof base==='boolean')out[key]=typeof value==='boolean'?value:base;
    else if(typeof base==='number'&&Number.isFinite(Number(value)))out[key]=Number(value);
    else if(typeof base==='string')out[key]=typeof value==='string'?value.slice(0,4000):base;
  }
  out.reportMinScore=Math.max(0,Math.min(100,Number(out.reportMinScore)||0));
  out.alertMinScore=Math.max(0,Math.min(100,Number(out.alertMinScore)||0));
  out.telegramMinScore=Math.max(0,Math.min(100,Number(out.telegramMinScore)||0));
  out.maxStoredTenders=Math.max(100,Math.min(10000,Number(out.maxStoredTenders)||3000));
  out.maxPagesHint=Math.max(1,Math.min(40,Number(out.maxPagesHint)||DEFAULT_SETTINGS.maxPagesHint));
  out.scanTimeoutSeconds=Math.max(45,Math.min(600,Number(out.scanTimeoutSeconds)||75));
  out.minPrice=Math.max(0,Math.min(1e15,Number(out.minPrice)||0));
  out.maxPrice=Math.max(out.minPrice,Math.min(1e15,Number(out.maxPrice)||Number.MAX_SAFE_INTEGER));
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(out.dailyTime)))out.dailyTime=DEFAULT_SETTINGS.dailyTime;
  out.telegramBotToken='';out.telegramChatId='';out.telegramEnabled=false;
  out.notifyWebhook='';out.notifyEmail='';out.webhookSecret='';
  out.capability=normalizeCapability(raw.capability||{});
  out.approvalSteps=[1,2,3].includes(Number(raw.approvalSteps))?Number(raw.approvalSteps):1;
  out.autoScan=false;out.scanOnStartup=false;out.autoExportMobileReport=false;
  return out;
}

function importedTemplate(raw){
  if(!raw||typeof raw!=='object')return null;
  const safe=sanitizeRequestTemplate(raw,raw.sourcePageUrl,raw.candidateCount);
  if(!safe)return null;
  return {...safe,
    id:String(raw.id||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80)||`t${Date.now().toString(36)}`,
    name:String(raw.name||'Bộ lọc đã nhập').trim().slice(0,120)};
}

function sanitizedTemplateState(state={}){
  const templates=(Array.isArray(state.templates)?state.templates:[])
    .slice(0,30).map(importedTemplate).filter(Boolean);
  const active=importedTemplate(state.template);
  const last=importedTemplate(state.lastTemplate);
  return {templates,template:active||templates[0]||null,lastTemplate:last};
}

function importedTender(raw,settings){
  if(!raw||typeof raw!=='object')return null;
  const sourcePageUrl=canonicalEgpUrl(raw.sourcePageUrl,EGP_DEFAULT_URL);
  const base=normalizeCandidate(raw,{sourcePageUrl,capturedAt:raw.capturedAt||new Date().toISOString()});
  if(!base)return null;
  const allowedChanges=new Set(['price','closeDate','bidName','location','investorName','version']);
  const changeLog=(Array.isArray(raw.changeLog)?raw.changeLog:[]).slice(-20).flatMap(c=>{
    if(!c||!allowedChanges.has(String(c.field||'')))return [];
    return [{field:String(c.field),label:String(c.label||c.field).slice(0,80),
      before:String(c.before??'').slice(0,500),after:String(c.after??'').slice(0,500),
      at:Number.isFinite(Date.parse(c.at))?new Date(c.at).toISOString():new Date().toISOString()}];
  });
  const merged={...base,
    ...sanitizeBackupTenderMetadata(raw),
    detailUrl:canonicalEgpUrl(raw.detailUrl,base.detailUrl),
    capturedAt:Number.isFinite(Date.parse(raw.capturedAt))?new Date(raw.capturedAt).toISOString():base.capturedAt,
    firstSeenAt:Number.isFinite(Date.parse(raw.firstSeenAt))?new Date(raw.firstSeenAt).toISOString():base.firstSeenAt,
    lastSeenAt:Number.isFinite(Date.parse(raw.lastSeenAt))?new Date(raw.lastSeenAt).toISOString():base.lastSeenAt,
    watchlisted:Boolean(raw.watchlisted),
    decisionState:normalizeDecisionState(raw.decisionState),
    decisionOwner:String(raw.decisionOwner||'').slice(0,120),
    decisionNote:String(raw.decisionNote||'').slice(0,1000),
    decisionUpdatedAt:Number.isFinite(Date.parse(raw.decisionUpdatedAt))?new Date(raw.decisionUpdatedAt).toISOString():null,
    changeLog};
  return {...merged,...scoreTender(merged,settings)};
}

function sanitizeBackupImport(data){
  if(!data||typeof data!=='object'||!Array.isArray(data.tenders))throw new Error('File backup không hợp lệ.');
  const settings=importedSettings(data.settings||{});
  const tenders=data.tenders.slice(0,10000).map(t=>importedTender(t,settings)).filter(Boolean);
  const templates=(Array.isArray(data.templates)?data.templates:[]).slice(0,30).map(importedTemplate).filter(Boolean);
  const active=importedTemplate(data.template);
  const last=importedTemplate(data.lastTemplate);
  const terminalStatuses=new Set(['SUCCESS','PARTIAL','ERROR','CANCELLED','TIMEOUT']);
  const nonterminalStatuses=new Set(['STARTING','OPENING','RUNNING','LISTING','SCANNING']);
  const runs=(Array.isArray(data.runs)?data.runs:[]).slice(0,100).map(r=>{
    const rawStatus=String(r&&r.status||'').toUpperCase();
    const status=terminalStatuses.has(rawStatus)?rawStatus:(nonterminalStatuses.has(rawStatus)?'CANCELLED':'ERROR');
    const changed=status!==rawStatus;
    return {
      ...safeRunForBackup(r||{},{terminalize:true}),
      id:String(r&&r.id||'').slice(0,100),mode:String(r&&r.mode||'import').slice(0,30),status,
      startedAt:r&&r.startedAt||null,finishedAt:r&&r.finishedAt||new Date().toISOString(),
      captured:Math.max(0,Number(r&&r.captured)||0),newCount:Math.max(0,Number(r&&r.newCount)||0),
      matchedCount:Math.max(0,Number(r&&r.matchedCount)||0),
      message:String(changed
        ?(nonterminalStatuses.has(rawStatus)?'Lượt đang chạy trong backup đã được đóng an toàn khi nhập.':'Trạng thái backup không hợp lệ; đã chuyển sang lỗi an toàn.')
        :(r&&r.message||'Đã nhập từ backup')).slice(0,500)
    };
  });
  const participations=(Array.isArray(data.participations)?data.participations:[]).slice(0,30000)
    .filter(p=>p&&typeof p==='object'&&p.key).map(p=>({...p,
      key:String(p.key).slice(0,220),contractorName:String(p.contractorName||'').slice(0,300),
      taxCode:String(p.taxCode||'').replace(/\D/g,'').slice(0,14),detailUrl:canonicalEgpUrl(p.detailUrl,'')}));
  return {...sanitizeBackupFeatures(data,{disableHunts:true}),settings,tenders:rescoreStoredTenders(tenders,settings),runs,templates,
    template:active||templates[0]||null,lastTemplate:last,participations};
}

/* ========================================================================
 *  RANH GIỚI RUNTIME MESSAGE
 *
 *  Extension page là phía điều khiển (được phép đổi cấu hình/xuất/xoá).
 *  Content script e-GP chỉ là phía cung cấp dữ liệu công khai, nên chỉ được
 *  gửi một whitelist hẹp và phải khớp đúng tab + id của job đang chạy.
 * ====================================================================== */

const CONTENT_MESSAGE_TYPES=new Set([
  'KHLCNT_DETAIL',
  'INGEST_CAPTURE','OBSERVED_TEMPLATE','SCAN_DONE','KQLCNT_RESULTS','KQLCNT_DONE',
  'BBMT_BIDDERS','BBMT_PRICE_BASIS','BBMT_DOM_RESULT','EGP_ENDPOINT_SEEN','EGP_ATTACHMENTS','CONTENT_READY'
]);

const CONTENT_MAX_CHARS={
  KHLCNT_DETAIL:2_000_000,
  INGEST_CAPTURE:4_000_000,OBSERVED_TEMPLATE:180_000,SCAN_DONE:8_000,
  KQLCNT_RESULTS:2_000_000,KQLCNT_DONE:8_000,BBMT_BIDDERS:1_000_000,BBMT_PRICE_BASIS:8_000,BBMT_DOM_RESULT:1_000_000,
  EGP_ENDPOINT_SEEN:64_000,EGP_ATTACHMENTS:2_000_000,CONTENT_READY:4_000
};

function runtimeSenderKind(sender){
  if(!sender||sender.id!==chrome.runtime.id)return null;
  const url=String(sender.url||sender.tab?.url||'');
  if(url.startsWith(chrome.runtime.getURL('')))return 'extension';
  if(Number.isInteger(sender.tab?.id)&&isEgpUrl(url)&&
     (!sender.tab.url||isEgpUrl(sender.tab.url)))return 'content';
  return null;
}

function shortString(value,max=500){return String(value??'').slice(0,max);}
/** Sổ giai đoạn từ trang e-GP: chỉ nhận nhãn ngắn và số, bỏ mọi thứ khác. */
function safeTrace(t){
  if(!t||typeof t!=='object'||Array.isArray(t))return null;
  const num=v=>v===null||v===undefined?null:Number.isFinite(Number(v))?Number(v):null;
  return {stage:shortString(t.stage,20),t0:num(t.t0),attempt:num(t.attempt),hookMs:num(t.hookMs),firstPageMs:num(t.firstPageMs),totalMs:num(t.totalMs),
    pages:num(t.pages),reReads:num(t.reReads),status:num(t.status)};
}
function nullableCount(value,max=1_000_000){
  return typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=max?value:null;
}
function safeCount(value,max=1_000_000){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(0,Math.min(max,Math.trunc(n))):0;
}
function assertObject(value,label='payload'){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label} không hợp lệ.`);
  return value;
}
function assertObjectRows(value,max,label='records'){
  if(!Array.isArray(value)||value.length>max||value.some(x=>!x||typeof x!=='object'||Array.isArray(x))){
    throw new Error(`${label} vượt giới hạn hoặc sai định dạng.`);
  }
  return value;
}

/** Giữ đúng các trường mà background sử dụng, đồng thời đặt trần kích thước. */
function sanitizeContentPayload(type,input){
  const p=assertObject(input||{});
  let encoded='';
  try{encoded=JSON.stringify(p);}catch{throw new Error('Payload không tuần tự hoá được.');}
  if(encoded.length>(CONTENT_MAX_CHARS[type]||64_000))throw new Error('Payload từ trang e-GP vượt giới hạn an toàn.');

  if(type==='INGEST_CAPTURE'){
    const records=assertObjectRows(p.records||[],1000);
    const m=assertObject(p.meta||{},'meta');
    const sourcePageUrl=isEgpUrl(m.sourcePageUrl)?shortString(m.sourcePageUrl,2000):'';
    const domLinks={};
    if(m.domLinks&&typeof m.domLinks==='object'&&!Array.isArray(m.domLinks)){
      for(const [key,url] of Object.entries(m.domLinks).slice(0,1000)){
        if(isEgpUrl(url))domLinks[shortString(key,40)]=shortString(url,2000);
      }
    }
    return {records,meta:{sourcePageUrl,domLinks,
      capturedAt:shortString(m.capturedAt,40),runId:shortString(m.runId,120),
      captureType:shortString(m.captureType,40),requestUrl:isEgpUrl(m.requestUrl)?shortString(m.requestUrl,2000):'',
      status:safeCount(m.status,999),page:safeCount(m.page,100_000),
      total:safeCount(m.total,10_000_000),totalPages:safeCount(m.totalPages,100_000)}};
  }
  if(type==='OBSERVED_TEMPLATE'){
    const r=assertObject(p.request||{},'request');
    return {request:{url:shortString(r.url,2000),method:shortString(r.method,12),body:shortString(r.body,100_000)},
      sourcePageUrl:isEgpUrl(p.sourcePageUrl)?shortString(p.sourcePageUrl,2000):'',
      candidateCount:safeCount(p.candidateCount,5000)};
  }
  if(type==='SCAN_DONE')return {runId:shortString(p.runId,120),ok:p.ok!==false,
    message:shortString(p.message,1000),captured:safeCount(p.captured,100_000)};
  if(type==='KHLCNT_DETAIL'){
    const header=assertObject(p.header||{},'header');
    const pick=(row,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]]));
    const children=assertObjectRows(p.packages||[],500,'packages');
    return {url:isEgpUrl(p.url)?shortString(p.url,2000):'',status:safeCount(p.status,999),
      header:pick(header,['id','planNo','planVersion','name','decisionDate','publicDate','bidPack']),
      packages:children.map(row=>pick(row,['id','idPlan','planNo','bidNo','bidName','bidField','bidPrice','bidPriceUnit','investField','notifyNo','notifyVersion','locations','investorCode','investorName'])),
      capturedAt:new Date().toISOString()};
  }
  if(type==='KQLCNT_RESULTS')return {
    planId:shortString(p.planId,120),mode:shortString(p.mode,30),queryIndex:nullableCount(p.queryIndex,100),focusTaxCode:shortString(p.focusTaxCode,20),
    records:assertObjectRows(p.records||[],200),totalElements:nullableCount(p.totalElements,10_000_000),
    totalPages:nullableCount(p.totalPages,200_000),pageIndex:safeCount(p.pageIndex,200_000),
    capped:Boolean(p.capped),cancelled:Boolean(p.cancelled),partial:Boolean(p.partial),done:Boolean(p.done),
    schemaIssue:Boolean(p.schemaIssue),failureReason:shortString(p.failureReason,1000),
    applied:p.applied&&typeof p.applied==='object'&&!Array.isArray(p.applied)?p.applied:null
  };
  if(type==='KQLCNT_DONE')return {planId:shortString(p.planId,120),mode:shortString(p.mode,30),queryIndex:nullableCount(p.queryIndex,100),
    ok:p.ok!==false,partial:Boolean(p.partial),message:shortString(p.message,1000),trace:safeTrace(p.trace)};
  if(type==='BBMT_BIDDERS')return {url:isEgpUrl(p.url)?shortString(p.url,2000):'',
    rows:assertObjectRows(p.rows||[],500,'rows'),status:safeCount(p.status,999),kind:p.kind==='package'?'package':'lot'};
  if(type==='BBMT_PRICE_BASIS')return {url:isEgpUrl(p.url)?shortString(p.url,2000):'',status:safeCount(p.status,999),
    source:p.source==='round'?'round':'notify',
    bidPrice:Number.isFinite(p.bidPrice)&&p.bidPrice>0?p.bidPrice:null,
    bidEstimatePrice:Number.isFinite(p.bidEstimatePrice)&&p.bidEstimatePrice>0?p.bidEstimatePrice:null,
    isMultiLot:typeof p.isMultiLot==='boolean'?p.isMultiLot:null};
  if(type==='BBMT_DOM_RESULT')return {url:isEgpUrl(p.url)?shortString(p.url,2000):'',
    source:p.source==='visible-dom'?'visible-dom':'',cardId:shortString(p.cardId,60),notifyNo:shortString(p.notifyNo,40),
    kind:p.kind==='package'?'package':p.kind==='lot'?'lot':'',rows:assertObjectRows(p.rows||[],500,'rows'),
    bidPrice:Number.isFinite(p.bidPrice)&&p.bidPrice>0?p.bidPrice:null,
    bidEstimatePrice:Number.isFinite(p.bidEstimatePrice)&&p.bidEstimatePrice>0?p.bidEstimatePrice:null,
    isMultiLot:typeof p.isMultiLot==='boolean'?p.isMultiLot:null,classificationKnown:p.classificationKnown===true};
  if(type==='EGP_ENDPOINT_SEEN')return {path:shortString(p.path,300),method:shortString(p.method,12),
    status:safeCount(p.status,999),kieu:shortString(p.kieu,80),soBanGhi:p.soBanGhi==null?null:safeCount(p.soBanGhi,10_000_000),
    truong:Array.isArray(p.truong)?p.truong.slice(0,40).map(x=>shortString(x,60)):[],
    trang:shortString(p.trang,200),luc:shortString(p.luc,40)};
  if(type==='EGP_ATTACHMENTS')return {url:isEgpUrl(p.url)?shortString(p.url,2000):'',payload:p.payload};
  if(type==='CONTENT_READY')return {url:isEgpUrl(p.url)?shortString(p.url,2000):'',
    phase:p.phase==='dom-ready'?'dom-ready':'document-start',
    pageError:['PORTLET_UNAVAILABLE','ACCESS_DENIED'].includes(p.pageError)?p.pageError:null};
  return {};
}

function kqlcntModeForJob(key,job){
  if(batchTask(job))return batchTask(job).mode;
  if(key==='activeRun')return 'tbmt';
  if(key==='winnerLookup')return job.mode;
  return lookupKind(key)?.modes[0]||'';
}
function jobAcceptsPaginator(key,job){
  if(key==='planLookup'&&job?.listFinished)return false;
  if(key==='activeRun')return job?.status==='RUNNING';
  if(key==='bidOpenScan')return job?.status==='LISTING'&&!job.listingDone;
  return isLookupActive(lookupKind(key),job);
}

/** Tìm duy nhất job sở hữu message theo mode/id/tab; không đoán khi mơ hồ. */
async function resolveKqlcntJob(payload,sender){
  const tabId=sender.tab?.id;
  if(!Number.isInteger(tabId))return null;
  const s=await readQueryControlState(chrome.storage.local);
  const rows=[{key:'activeRun',job:s.activeRun},...LOOKUP_KINDS.map(k=>({key:k.key,job:s[k.key]}))];
  const matches=rows.filter(({key,job})=>{
    if(!job||job.tabId!==tabId||!jobAcceptsPaginator(key,job))return false;
    if(payload.planId&&job.id!==payload.planId)return false;
    const mode=kqlcntModeForJob(key,job);
    if(payload.mode&&mode!==payload.mode)return false;
    if((payload.queryIndex??0)!==Number(job.qi||0))return false;
    return true;
  });
  return matches.length===1?matches[0]:null;
}

function finalPageFingerprint(payload){
  return JSON.stringify([payload.planId,payload.mode,payload.pageIndex,payload.totalElements,payload.totalPages,
    Boolean(payload.capped),Boolean(payload.cancelled),Boolean(payload.partial),Boolean(payload.schemaIssue)]);
}
async function finalPageReplay(payload,sender){
  if(!payload.done||(payload.records||[]).length)return null;
  const s=await readQueryControlState(chrome.storage.local);
  const jobs=[{key:'activeRun',job:s.activeRun},...LOOKUP_KINDS.map(k=>({key:k.key,job:s[k.key]}))];
  for(const {key,job} of jobs){
    const receipt=job?.finalPageReceipt;
    if(!receipt||job.cancelled||job.status==='CANCELLED'||receipt.id!==payload.planId||receipt.mode!==payload.mode||receipt.tabId!==sender.tab?.id)continue;
    if(receipt.queryIndex!==Number(job.qi||0)||receipt.queryIndex!==(payload.queryIndex??0))continue;
    if(receipt.fingerprint!==finalPageFingerprint(payload))continue;
    if(!receipt.doneAcknowledged)pendingKqlcntDoneByTab.set(sender.tab.id,{key,id:job.id,mode:receipt.mode,queryIndex:receipt.queryIndex,at:Date.now()});
    return {ok:true,duplicate:true,done:true,pageIndex:payload.pageIndex};
  }
  return null;
}
async function saveFinalPageReceipt(key,id,payload,tabId){
  return withLock(async()=>{
    const s=await readJobState(key),job=key==='activeRun'?s.activeRun:s[key];
    if(job?.id!==id||job.cancelled)return false;
    const finalPageReceipt={id,mode:kqlcntModeForJob(key,job),tabId,queryIndex:Number(job.qi||0),
      fingerprint:finalPageFingerprint(payload),receivedAt:new Date().toISOString(),doneAcknowledged:false};
    if(key==='activeRun')await save({activeRun:{...job,finalPageReceipt},runs:s.runs.map(r=>r.id===id?{...r,finalPageReceipt}:r)});
    else await save({[key]:{...job,finalPageReceipt}});
    return true;
  });
}
async function acknowledgeFinalPage(key,id,queryIndex){
  return withLock(async()=>{
    const s=await readJobState(key),job=key==='activeRun'?s.activeRun:s[key];
    if(job?.id!==id||job.finalPageReceipt?.queryIndex!==queryIndex||job.finalPageReceipt.doneAcknowledged)return;
    const finalPageReceipt={...job.finalPageReceipt,doneAcknowledged:true};
    if(key==='activeRun')await save({activeRun:{...job,finalPageReceipt},runs:s.runs.map(r=>r.id===id?{...r,finalPageReceipt}:r)});
    else await save({[key]:{...job,finalPageReceipt}});
  });
}

async function routeKqlcntResults(payload,sender){
  const identity=JSON.stringify([sender.tab?.id,payload.planId,payload.mode,payload.queryIndex??0,payload.pageIndex,Boolean(payload.done)]);
  const fingerprint=JSON.stringify(payload);
  const active=resultDeliveries.get(identity);
  if(active)return active.fingerprint===fingerprint?active.promise:{ok:false,message:'Hai lần chuyển cùng trang có nội dung khác nhau; cần tra lại để đối soát.'};
  const promise=routeKqlcntResultsOnce(payload,sender);
  const delivery={promise,fingerprint};resultDeliveries.set(identity,delivery);
  try{return await promise;}finally{if(resultDeliveries.get(identity)===delivery)resultDeliveries.delete(identity);}
}
async function routeKqlcntResultsOnce(payload,sender){
  if(!payload.planId||!payload.mode)return {ok:false,message:'Thiếu mode hoặc mã job KQLCNT.'};
  const privateReply=queryRuntime.routeProbe('KQLCNT_RESULTS',payload,sender);if(privateReply)return privateReply;
  const replay=await finalPageReplay(payload,sender);if(replay)return replay;
  const target=await resolveKqlcntJob(payload,sender);
  if(!target)return {ok:false,message:'Kết quả không khớp job/tab đang chạy.'};
  if(!payload.done&&receivedPageIndexes(target.job).has(payload.pageIndex)){
    return {ok:true,duplicate:true,pageIndex:payload.pageIndex};
  }
  let effective=payload;
  if(payload.done){
    const received=receivedPageIndexes(target.job);
    const expected=Math.max(0,Number(payload.pageIndex)||0);
    const missing=[];
    for(let i=0;i<expected;i++)if(!received.has(i))missing.push(i+1);
    const unknownTotals=payload.totalElements===null||payload.totalPages===null;
    const stoppedEarly=payload.totalPages!==null&&received.size<payload.totalPages;
    if(missing.length||unknownTotals||stoppedEarly||payload.schemaIssue){
      effective={...payload,partial:true,
        deliveryMessage:payload.failureReason||(missing.length?`Thiếu ${missing.length} trang dữ liệu khi chuyển từ tab e-GP (${missing.slice(0,8).join(', ')}${missing.length>8?', …':''}).`:unknownTotals?'e-GP chưa cung cấp đủ tổng số trang/bản ghi để xác nhận hoàn tất.':`Mới nhận ${received.size}/${payload.totalPages} trang e-GP.`)};
    }
  }
  let result;
  const task=batchTask(target.job),intermediate=task&&batchHasNext(target.job);
  if(task)await recordBatchPage(target.key,target.job.id,effective);
  const ingestPayload=intermediate&&effective.done?{...effective,done:false}:effective;
  if(task?.purpose==='province')result=await ingestProvinceEvidence(target.key,target.job.id,effective);
  else if(target.key==='activeRun')result=await ingestTbmtPage(effective);
  else if(target.key==='bidOpenScan')result=await ingestBidOpenList(ingestPayload);
  else if(target.key==='planLookup')result=await ingestPlanPage(ingestPayload);
  else if(target.key==='areaScan')result=await ingestAreaPage(ingestPayload);
  else if(target.key==='investorScan')result=await ingestInvestorPage(ingestPayload);
  else result=await ingestWinnerPage(ingestPayload);
  if(task)await finalizeBatchPage(target.key,target.job.id,effective);
  if(!effective.done&&result?.ok!==false){
    if(!await recordReceivedPage(target.key,target.job.id,effective.pageIndex)){
      return {ok:false,retryable:true,message:'Chưa ghi nhận được trang dữ liệu; tiện ích sẽ thử lại.'};
    }
    await renewProgressLease(target.key,target.job.id);
  }
  if(effective.done){
    await saveFinalPageReceipt(target.key,target.job.id,payload,sender.tab.id);
    pendingKqlcntDoneByTab.set(sender.tab.id,{key:target.key,id:target.job.id,
      mode:kqlcntModeForJob(target.key,target.job),queryIndex:Number(target.job.qi||0),at:Date.now()});
    if(target.key!=='activeRun'&&target.key!=='bidOpenScan'&&!intermediate){
      await chrome.alarms.clear(TIMEOUT_PREFIX+target.job.id).catch(()=>{});
    }
    if((effective.partial||effective.capped||effective.schemaIssue)&&!intermediate){
      if(target.key==='activeRun')await updateRun(target.job.id,{partial:true,
        partialMessage:effective.deliveryMessage||target.job.partialMessage||''});
      else await markLookupPartial(target.key,target.job.id,effective.deliveryMessage||'');
    }
  }
  if(result?.ok!==false)queryRuntime.captureResult(effective,sender);
  return {...(result||{}),ok:result?.ok!==false,pageIndex:effective.pageIndex};
}

/* Sổ giai đoạn: ghi nối tiếp qua một hàng đợi để hai lượt kết thúc cùng lúc
   không ghi đè mất dòng của nhau. Hỏng ghi sổ không bao giờ làm hỏng lượt. */
let runTraceChain=Promise.resolve();
function recordRunTrace(payload,sender){
  const open=payload.fromCache?null:queryRuntime.takeOpenTime(sender.tab?.id);
  const entry=traceEntry(payload,{openMs:open?.ms??null,warm:open?open.warm:null});
  runTraceChain=runTraceChain.then(async()=>{
    const {runTrace=[]}=await chrome.storage.local.get({runTrace:[]});
    const next=appendTrace(runTrace,entry);
    if(next!==runTrace)await chrome.storage.local.set({runTrace:next});
  }).catch(()=>{});
  return runTraceChain;
}
/* TỰ CHẠY LẠI (4.17.0): hỏng TRƯỚC trang đầu vì trang/mạng → tải lại trang e-GP
   và chạy lại đúng tiêu chí đó một lần. Điều kiện chi tiết ở lib/run-retry.js.
   Ghi dấu vào lượt TRƯỚC khi chạy lại, nên tín hiệu lặp hay worker khởi động
   lại cũng không thể chạy lại lần thứ hai. */
async function scheduleAutoRetry(key,job,payload){
  const decision=decideAutoRetry({payload,job});
  if(!decision.retry)return false;
  const marked=await withLock(async()=>{
    const s=await readJobState(key);
    const cur=key==='activeRun'?s.activeRun:s[key];
    if(!cur||cur.id!==job.id||!decideAutoRetry({payload,job:cur}).retry)return false;
    const next={...cur,autoRetries:[...(cur.autoRetries||[]),decision.qi],message:retryNotice(decision.stage)};
    if(key==='activeRun'){
      const runs=(await getState()).runs.map(r=>r.id===cur.id?{...r,autoRetries:next.autoRetries,message:next.message}:r);
      await save({[KEYS.activeRun]:next,[KEYS.runs]:runs.slice(0,100)});
    }else await save({[KEYS[key]]:next});
    return true;
  });
  if(!marked)return false;
  // Lượt chạy lại cần trọn một hạn chờ mới, không phải phần thừa của lần hỏng.
  const s=await readQueryControlState(chrome.storage.local);
  await chrome.alarms.create(TIMEOUT_PREFIX+job.id,{when:Date.now()+AUTO_RETRY_DELAY_MS+(key==='activeRun'?scanTimeoutMs(s)+40_000:RUN_STALE_MS)});
  void (async()=>{
    await new Promise(r=>setTimeout(r,AUTO_RETRY_DELAY_MS));
    const now=await readJobState(key);
    const cur=key==='activeRun'?now.activeRun:now[key];
    // Người dùng bấm Dừng trong lúc chờ: tôn trọng, không chạy lại.
    if(!cur||cur.id!==job.id||cur.cancelled||!['STARTING','OPENING','RUNNING','LISTING'].includes(cur.status))return;
    try{await queryRuntime.redispatch(payload.planId,decision.qi);}
    catch(error){
      const why=`${payload.message||'Lượt tra cứu e-GP bị gián đoạn.'} Đã tự chạy lại một lần nhưng không được: ${String(error?.message||error)}`;
      if(key==='activeRun')await finishRun(job.id,Number(cur.captured||0)>0?'PARTIAL':'ERROR',why);
      else await markLookupDoneFailure(key,job.id,why,payload.partial);
    }
  })();
  return true;
}
async function routeKqlcntDone(payload,sender){
  const privateReply=queryRuntime.routeProbe('KQLCNT_DONE',payload,sender);if(privateReply)return privateReply;
  queryRuntime.captureDone(payload,sender);
  void recordRunTrace(payload,sender);
  const tabId=sender.tab?.id;
  const pending=pendingKqlcntDoneByTab.get(tabId);
  if(pending&&(Date.now()-pending.at)<=60_000&&
     (!payload.planId||payload.planId===pending.id)&&(!payload.mode||payload.mode===pending.mode)&&
     (payload.queryIndex??0)===pending.queryIndex){
    pendingKqlcntDoneByTab.delete(tabId);
    const s=await readJobState(pending.key);
    const job=pending.key==='activeRun'?s.activeRun:s[pending.key];
    if(!job||job.id!==pending.id||job.cancelled||job.status==='CANCELLED'||Number(job.qi||0)!==pending.queryIndex)return {ok:true,ignored:true};
    await acknowledgeFinalPage(pending.key,job.id,pending.queryIndex);
    if(job?.id===pending.id&&payload.ok===false){
      if(pending.key==='activeRun')await finishRun(job.id,
        Number(job.captured||0)>0?'PARTIAL':'ERROR',
        payload.message||'Lượt tra cứu e-GP bị gián đoạn.');
      else await markLookupDoneFailure(pending.key,job.id,payload.message||'Lượt tra cứu e-GP bị gián đoạn.',payload.partial);
    }else if(pending.key!=='activeRun'&&batchHasNext(job)){
      await advanceLookupBatch(pending.key,job.id);
    }else if(pending.key==='activeRun'&&job?.id===pending.id){
      if(payload.partial)await updateRun(job.id,{partial:true});
      await advanceOrFinish(job.id,true,job.completionMessage||payload.message||'Hoàn tất.');
    }else if(job?.id===pending.id&&payload.partial){
      await markLookupPartial(pending.key,job.id,payload.message);
    }
    // Các lookup khác đã chốt bằng KQLCNT_RESULTS(done). Riêng bbmt-list có
    // thể đang SCANNING chi tiết; DONE của giai đoạn liệt kê chỉ là ACK và
    // tuyệt đối không được đổi phase đó thành ERROR.
    if(pending.key==='planLookup'){
      const {planLookup:plan}=await readJobState('planLookup');
      if(plan?.detailStatus==='PENDING')void startPlanDetailPhase(plan.id).catch(error=>failLookupJob('planLookup',plan.id,String(error?.message||error),'PARTIAL'));
      else await recordHuntOutcome(plan);
    }
    return {ok:true,acknowledged:true};
  }
  if(pending&&(Date.now()-pending.at)>60_000)pendingKqlcntDoneByTab.delete(tabId);

  // A worker restart can lose the in-memory DONE mailbox after the final
  // page receipt is durable. That receipt, not an active paginator match,
  // authorizes the pending detail phase and makes repeated DONE harmless.
  const {planLookup:finishedList}=await readJobState('planLookup');
  const receipt=finishedList?.finalPageReceipt;
  if(finishedList?.listFinished&&!finishedList.cancelled&&receipt&&receipt.tabId===tabId&&
     receipt.id===payload.planId&&receipt.mode===payload.mode&&receipt.queryIndex===(payload.queryIndex??0)){
    await acknowledgeFinalPage('planLookup',finishedList.id,receipt.queryIndex);
    if(payload.ok===false)await markLookupDoneFailure('planLookup',finishedList.id,payload.message||'Chưa xác nhận hoàn tất lượt lấy danh sách.',true);
    else if(finishedList.detailStatus==='PENDING')void startPlanDetailPhase(finishedList.id).catch(error=>failLookupJob('planLookup',finishedList.id,String(error?.message||error),'PARTIAL'));
    return {ok:true,acknowledged:true};
  }

  const target=await resolveKqlcntJob(payload,sender);
  // KQLCNT_RESULTS(done) thường đã chốt lookup trước KQLCNT_DONE; message cuối
  // khi đó là bản sao vô hại và không được phép rơi sang job khác.
  if(!target)return {ok:true,ignored:true};
  const {key,job}=target;
  if(payload.ok===false&&await scheduleAutoRetry(key,job,payload))return {ok:true,retrying:true};
  if(payload.ok===false){
    if(key==='activeRun')await finishRun(job.id,
      Number(job.captured||0)>0?'PARTIAL':'ERROR',
      payload.message||'Lượt tra cứu e-GP bị gián đoạn.');
    else await markLookupDoneFailure(key,job.id,payload.message||'Lượt tra cứu e-GP bị gián đoạn.',payload.partial);
    return {ok:true};
  }
  if(key!=='activeRun'&&job.finalPageReceipt?.queryIndex===Number(job.qi||0)&&batchHasNext(job)){
    await acknowledgeFinalPage(key,job.id,Number(job.qi||0));
    await advanceLookupBatch(key,job.id);return {ok:true,acknowledged:true};
  }
  if(key==='activeRun'){
    if(!job.pageDone)return {ok:true,ignored:true,message:'Chưa nhận trang kết thúc của truy vấn hiện tại.'};
    await acknowledgeFinalPage(key,job.id,Number(job.qi||0));
    if(payload.partial)await updateRun(job.id,{partial:true});
    await advanceOrFinish(job.id,true,job.completionMessage||payload.message||'Hoàn tất.');
    return {ok:true};
  }
  if(key==='bidOpenScan'){
    if(payload.partial)await markLookupPartial(key,job.id,payload.message);
    return {ok:true,acknowledged:true};
  }
  // Nếu vẫn còn active thì trang KQLCNT_RESULTS(done) đã không được nhận.
  // Không biến lỗi truyền dữ liệu này thành kết quả rỗng "thành công".
  await failLookupJob(key,job.id,'e-GP báo hoàn tất nhưng thiếu trang kết quả cuối. Hãy thử lại.');
  return {ok:false,message:'Thiếu trang kết quả cuối.'};
}

async function contentRunMatches(runId,sender){
  if(!runId)return true; // bắt dữ liệu thụ động khi người dùng tự duyệt e-GP
  const s=await readJobState('activeRun');
  return Boolean(s.activeRun?.id===runId&&s.activeRun.tabId===sender.tab?.id);
}

async function handleJobTimeout(id){
  const s=await readQueryControlState(chrome.storage.local);
  if(s.activeRun?.id===id){
    await tellJobsToStop([{id,tabId:s.activeRun.tabId}]);
    await finishRun(id,'TIMEOUT','Quá thời gian chờ e-GP; lượt quét đã tự dừng.');
    return;
  }
  for(const kind of LOOKUP_KINDS){
    const job=s[kind.key];
    if(job?.id!==id||!isLookupActive(kind,job))continue;
    await tellJobsToStop([{id,tabId:job.tabId}]);
    const got=lookupResultCount(kind.key,job);
    await failLookupJob(kind.key,id,'Quá thời gian chờ e-GP. Dữ liệu đã nhận (nếu có) được giữ lại.',got?'PARTIAL':'ERROR');
    return;
  }
}

const nativeAgent=createNativeAgent({runtime:chrome.runtime});
const queryRuntime=createQueryRuntime({getState:()=>readQueryControlState(chrome.storage.local),tabs:chrome.tabs,sendToTab:(...args)=>sendToTab(...args),waitForTab,routeResults:(...args)=>routeKqlcntResults(...args),routeDone:(...args)=>routeKqlcntDone(...args),markCacheHit});
const liveCanaryRuntime=createLiveCanaryRuntime({getState,save,runProbe:(...args)=>queryRuntime.runProbe(...args),readOpening,fetchProvinces,stopScans:stopScansForSchema,alarms:chrome.alarms,loadCases:async()=>(await fetch(chrome.runtime.getURL('data/live-canary-cases.json'))).json(),sourceDigest:()=>canarySourceDigest(async file=>(await fetch(chrome.runtime.getURL(file))).arrayBuffer(),crypto),version:chrome.runtime.getManifest().version});
const ingestRuntime=createIngestRuntime({getState:(...args)=>getState(...args),save:(...args)=>save(...args),scoredWithGate:(...args)=>scoredWithGate(...args),publicFilterCriteria:(...args)=>publicFilterCriteria(...args),KEYS,withLock});
const huntRuntime=createHuntRuntime({getState:(...args)=>getState(...args),save:(...args)=>save(...args),escapeHtml:(...args)=>escapeHtml(...args),sendTelegram:(...args)=>sendTelegram(...args),nextDailyTime:(...args)=>nextDailyTime(...args),startPlanLookup:(...args)=>startPlanLookup(...args),startTbmtSearch:(...args)=>startTbmtSearch(...args),KEYS,HUNT_RETRY_PREFIX,withLock,chrome});
const searchStateRuntime=createSearchStateRuntime({storage:appStorage});
const exportRuntime=createExportRuntime({readSearchState:(...args)=>searchStateRuntime.read(...args),getState:(...args)=>getState(...args),downloadData:(...args)=>downloadData(...args),downloadXlsx:(...args)=>downloadXlsx(...args),mobileHtml:(...args)=>mobileHtml(...args),getContractorProfile:(...args)=>getContractorProfile(...args),priceRow:(...args)=>priceRow(...args),sanitizedTemplateState:(...args)=>sanitizedTemplateState(...args),stamp,numOrNull,chrome});

void liveCanaryRuntime.hydrate().catch(()=>{});

chrome.runtime.onInstalled.addListener(async details=>{
  const s0=await getState();
  if(s0.activeRun)await cancelActiveRun();
  await cancelLookups(null,'Tiện ích vừa được cập nhật; hãy chạy lại tác vụ.');
  const cleanTemplates=sanitizedTemplateState(s0);
  const settings={...DEFAULT_SETTINGS,...s0.settings};
  // 3.9.1 và 4.0.0 từng dùng 5 trang làm mặc định. Khi nâng cấp, chỉ đổi đúng
  // giá trị mặc định cũ sang 20; mọi giá trị khác do người dùng chọn được giữ.
  if(details.reason==='update'&&Number(settings.maxPagesHint)===5){
    settings.maxPagesHint=DEFAULT_SETTINGS.maxPagesHint;
  }
  const patch={
    [KEYS.settings]:settings,
    [KEYS.runs]:(s0.runs||[]).slice(0,100)
      .map(run=>safeRunForBackup(run,{terminalize:true})),
    [KEYS.activeRun]:null,
    [KEYS.template]:cleanTemplates.template,
    [KEYS.templates]:cleanTemplates.templates,
    [KEYS.lastTemplate]:cleanTemplates.lastTemplate
  };
  // Nâng cấp từ bản cũ: trả mã BP… về đúng trường mã gói thầu, đồng thời
  // scrub/xoá template 3.9.x không còn vượt qua allowlist hiện hành.
  if(s0.tenders.length)patch[KEYS.tenders]=rescoreStoredTenders(s0.tenders,s0.settings);
  await save(patch);
  await ensureDailyAlarm();
  if(details.reason==='install')chrome.tabs.create({url:chrome.runtime.getURL('onboarding.html')});
});
chrome.runtime.onStartup.addListener(async()=>{
  await ensureDailyAlarm();
  const s=await getState();
  if(!s.settings.scanOnStartup||!s.template)return;
  const now=Date.now();
  const lastSuccess=s.runs.find(r=>r.status==='SUCCESS');
  const lastPartial=s.runs.find(r=>r.status==='PARTIAL');
  const successFresh=lastSuccess&&now-new Date(lastSuccess.finishedAt||lastSuccess.startedAt).getTime()<=18*3600000;
  // PARTIAL không phải thành công đầy đủ, nhưng tránh chạy lặp mỗi lần mở
  // Chrome: nghỉ hai giờ rồi mới quét bù lại phần còn thiếu.
  const partialCooling=lastPartial&&now-new Date(lastPartial.finishedAt||lastPartial.startedAt).getTime()<=2*3600000;
  if(!successFresh&&!partialCooling)startScan('startup');
});
chrome.alarms.onAlarm.addListener(async alarm=>{
  if(await liveCanaryRuntime.onAlarm(alarm))return;
  if((await getState()).settings.readOnlyMode&&!alarm.name.startsWith(TIMEOUT_PREFIX))return;
  if(alarm.name===DAILY_ALARM)await startScan('scheduled');
  else if(alarm.name===DEADLINE_ALARM)await reviewDeadlines();
  else if(alarm.name.startsWith(HUNT_RETRY_PREFIX))await runHuntById(alarm.name.slice(HUNT_RETRY_PREFIX.length));
  else if(alarm.name.startsWith(TIMEOUT_PREFIX)){
    await handleJobTimeout(alarm.name.slice(TIMEOUT_PREFIX.length));
  }else{
    const huntRef=parseHuntAlarm(alarm.name);
    if(huntRef)await runHuntById(huntRef.huntId);
  }
});
chrome.notifications.onClicked.addListener(id=>{const u=notifUrls.get(id);if(u)chrome.tabs.create({url:u});});
chrome.notifications.onButtonClicked.addListener(id=>{const u=notifUrls.get(id);if(u)chrome.tabs.create({url:u});});

chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  (async()=>{
    const source=runtimeSenderKind(sender);
    if(!source){sendResponse({ok:false,message:'Nguồn gửi message không được phép.'});return;}
    const type=shortString(message?.type,80);
    if(!type){sendResponse({ok:false,message:'Message thiếu type.'});return;}
    if(source==='content'){
      if(!CONTENT_MESSAGE_TYPES.has(type)){
        sendResponse({ok:false,message:'Content script không được phép gọi lệnh này.'});return;
      }
      message={type,payload:sanitizeContentPayload(type,message?.payload||{})};
    }else if(CONTENT_MESSAGE_TYPES.has(type)){
      sendResponse({ok:false,message:'Message dữ liệu chỉ được nhận từ content script e-GP.'});return;
    }
    // Native bootstrap can emit its default search before the private plan is
    // bound to the reused tab. Keep those incidental records out of the vault.
    if(source==='content'&&liveCanaryRuntime.isRunning()&&['INGEST_CAPTURE','OBSERVED_TEMPLATE'].includes(type)){sendResponse({ok:true,ignored:true});return;}
    if(source==='content'&&planDetailReader.ownsTab(sender.tab?.id)&&type!=='KHLCNT_DETAIL'){sendResponse({ok:true,ignored:true});return;}
    if(source==='content'&&bbmtWaiter?.private&&bbmtWaiter.waiters.has(sender.tab?.id)&&!['CONTENT_READY','BBMT_BIDDERS','BBMT_PRICE_BASIS','BBMT_DOM_RESULT'].includes(type)){sendResponse({ok:true,ignored:true});return;}
    if(source==='content'&&queryRuntime.isProbeTab(sender.tab?.id)&&!['KQLCNT_RESULTS','KQLCNT_DONE','CONTENT_READY'].includes(type)){sendResponse({ok:true,ignored:true});return;}
    if(source==='content'&&!queryRuntime.isProbeTab(sender.tab?.id)&&!(bbmtWaiter?.private&&bbmtWaiter.waiters.has(sender.tab?.id))&&schemaIsRed(await readSafetyState())){sendResponse({ok:false,message:SCHEMA_STOP_MESSAGE});return;}
    if(source!=='content'&&['START_SCAN','SCAN_ALL','SCAN_CURRENT_TAB','RUN_HUNT','TBMT_SEARCH','PLAN_LOOKUP','WINNER_LOOKUP','BID_OPEN_SCAN','RETRY_BID_OPEN','AREA_SCAN','INVESTOR_SCAN'].includes(type)&&(schemaIsRed(await readSafetyState()))){await stopScansForSchema();sendResponse({ok:false,message:SCHEMA_STOP_MESSAGE});return;}
    const WRITE_TYPES=new Set(['FACTORY_RESET','START_SCAN','SCAN_ALL','SCAN_CURRENT_TAB','RUN_HUNT','TBMT_SEARCH','PLAN_LOOKUP','WINNER_LOOKUP','BID_OPEN_SCAN','RETRY_BID_OPEN','AREA_SCAN','INVESTOR_SCAN','COMPARE_EGP_DOM','TELEGRAM_TEST','TELEGRAM_DETECT_CHAT','FETCH_AND_DOWNLOAD']);
    const mutating=/^(SAVE_|DELETE_|CLEAR_|SET_|IMPORT_)/.test(type)||WRITE_TYPES.has(type)||CONTENT_MESSAGE_TYPES.has(type)||type==='UPDATE_SETTINGS'||type==='APPLY_WAREHOUSE_CLEANUP'||type==='PREVIEW_WAREHOUSE_CLEANUP';
    if(mutating&&(await readSafetyState()).settings.readOnlyMode){
      const unlock=type==='UPDATE_SETTINGS'&&senderIsOptions(sender)&&message.payload?.readOnlyMode===false;
      if(!unlock){sendResponse({ok:false,message:'Đang khóa chỉnh sửa và tự động hóa. Mở Cấu hình để tắt chế độ chỉ xem.'});return;}
    }
    switch(message.type){
      case 'CANARY_STATUS': sendResponse(await liveCanaryRuntime.status());break;
      case 'CANARY_CONFIG': sendResponse(await liveCanaryRuntime.configure(message.payload||{}));break;
      case 'CANARY_RUN': {
        if(activeListJob(await readQueryControlState(chrome.storage.local))||bbmtWaiter){sendResponse({ok:false,message:'Hãy chờ lượt tra cứu đang chạy hoàn tất trước khi kiểm tra cấu trúc.'});break;}
        sendResponse(await liveCanaryRuntime.run({trigger:'manual',wait:message.payload?.wait===true}));break;
      }
      case 'SAVE_NAMED_SEARCH': {
        const p=message.payload||{};
        const item=safeSavedSearches([{id:p.id||crypto.randomUUID(),name:p.name,criteria:p.criteria}])[0];
        if(!item)throw new Error('Tên hoặc tiêu chí tìm kiếm không hợp lệ.');
        const rows=await withLock(async()=>{
          const s=await getState();
          const rest=s.savedSearches.filter(x=>x.id!==item.id);
          if(rest.length>=30)throw new Error('Đã lưu 30 bộ tìm kiếm. Hãy xóa một bộ trước.');
          const rows=[item,...rest];await save({[SAVED_SEARCHES]:rows});return rows;
        });
        sendResponse({ok:true,savedSearches:rows});break;
      }
      case 'DELETE_NAMED_SEARCH': {
        const rows=await withLock(async()=>{const s=await getState();const rows=s.savedSearches.filter(x=>x.id!==message.payload?.id);await save({[SAVED_SEARCHES]:rows});return rows;});
        sendResponse({ok:true,savedSearches:rows});break;
      }
      case 'SAVE_HUNT': {
        const parsed=validateHunt(message.payload||{});
        if(!parsed.ok){sendResponse(parsed);break;}
        const rows=await withLock(async()=>{
          const s=await getState();
          const hunt={...parsed.hunt,id:parsed.hunt.id||crypto.randomUUID()};
          const rest=(s.hunts||[]).filter(x=>x.id!==hunt.id);
          if(rest.length>=MAX_HUNTS_ALLOWED)throw new Error(`Đã đủ ${MAX_HUNTS_ALLOWED} bộ săn. Hãy xóa một bộ trước.`);
          const hunts=[hunt,...rest];
          await save({[KEYS.hunts]:hunts});
          await ensureHuntAlarms(hunts);
          return hunts;
        });
        sendResponse({ok:true,hunts:rows});break;
      }
      case 'DELETE_HUNT': {
        const rows=await withLock(async()=>{
          const s=await getState();
          const hunts=(s.hunts||[]).filter(x=>x.id!==message.payload?.id);
          await save({[KEYS.hunts]:hunts});
          await ensureHuntAlarms(hunts);
          return hunts;
        });
        sendResponse({ok:true,hunts:rows});break;
      }
      case 'RUN_HUNT': sendResponse(await runHuntById(message.payload?.id));break;
      case 'SAVE_WATCH': {
        const rows=await withLock(async()=>{
          const s=await getState();
          const next=safeWatches([{id:message.payload?.id||crypto.randomUUID(),name:message.payload?.name,taxCode:message.payload?.taxCode,createdAt:new Date().toISOString()},...s.watchedInvestors]);
          await save({[KEYS.watchedInvestors]:next});
          return next;
        });
        sendResponse({ok:true,watchedInvestors:rows});break;
      }
      case 'DELETE_WATCH': {
        const rows=await withLock(async()=>{
          const s=await getState();
          const next=(s.watchedInvestors||[]).filter(x=>x.id!==message.payload?.id);
          await save({[KEYS.watchedInvestors]:next});
          return next;
        });
        sendResponse({ok:true,watchedInvestors:rows});break;
      }
      case 'SAVE_CHECKLIST': {
        const key=String(message.payload?.key||'').slice(0,220);
        if(!key){sendResponse({ok:false,message:'Thiếu mã gói.'});break;}
        try{
          const store=await withLock(async()=>{
            const s=await getState();
            const owner=String(s.settings.operatorName||message.payload?.owner||'').trim().slice(0,80);
            const prev=s.checklists?.[key];
            if(prev?.owner&&owner&&prev.owner!==owner&&!message.payload?.force){
              throw new Error(`Checklist đang do “${prev.owner}” giữ. Đổi tên người dùng trong Cấu hình hoặc bấm ghi đè.`);
            }
            const progress=checklistProgress(message.payload||{}, message.payload?.category||'');
            const row={items:progress.items,updatedAt:new Date().toISOString(),owner:owner||prev?.owner||''};
            const checklists={...s.checklists,[key]:row};
            await save({[KEYS.checklists]:checklists});
            return {row,owner};
          });
          await appendAudit('checklist',{key,text:`Tick checklist ${key}`},store.owner);
          sendResponse({ok:true,checklist:store.row});
        }catch(e){sendResponse({ok:false,message:String(e.message||e)});}
        break;
      }
      case 'SAVE_CONTRACT': {
        const row=normalizeContract({...message.payload,id:message.payload?.id||crypto.randomUUID(),updatedAt:new Date().toISOString()});
        if(!row){sendResponse({ok:false,message:'Nhập tên hợp đồng tương tự (ít nhất 4 ký tự).'});break;}
        const rows=await withLock(async()=>{
          const s=await getState();
          const next=safeContracts([row,...(s.pastContracts||[]).filter(x=>x.id!==row.id)]);
          await save({[KEYS.pastContracts]:next});
          return next;
        });
        sendResponse({ok:true,pastContracts:rows});break;
      }
      case 'DELETE_CONTRACT': {
        const rows=await withLock(async()=>{
          const s=await getState();
          const next=(s.pastContracts||[]).filter(x=>x.id!==message.payload?.id);
          await save({[KEYS.pastContracts]:next});
          return next;
        });
        sendResponse({ok:true,pastContracts:rows});break;
      }
      case 'EXPORT_AMENDMENTS': {
        const s=await getState();
        const rows=s.amendmentLog||[];
        const id=await downloadXlsx(`GiaoSuCuiBap/Dieu-chinh-${new Date().toISOString().slice(0,10)}.xlsx`,{
          sheetName:'Điều chỉnh',
          exportInfo:{source:'Nhật ký nội bộ của tiện ích; dữ liệu do người dùng ghi nhận hoặc do lần quét lưu lại.',scope:'Chỉ các dòng đang được xuất; không phải toàn bộ lịch sử trên e-GP.'},
          columns:[
            {header:'Thời điểm',key:'at',width:22,type:'datetime'},
            {header:'Mã',key:'notifyNo',width:18},
            {header:'Tên gói',key:'bidName',width:48},
            {header:'Trường',key:'field',width:16},
            {header:'Trước',key:'before',width:28},
            {header:'Sau',key:'after',width:28}
          ],
          rows:rows.map(r=>({at:r.at,notifyNo:r.notifyNo||r.key,bidName:r.bidName,field:r.field,before:String(r.before??''),after:String(r.after??'')}))
        },true);
        sendResponse({ok:true,id,count:rows.length});break;
      }
      case 'COMPARE_EGP_DOM': sendResponse(await compareOpenEgpDom());break;
      case 'EXPORT_AUDIT': {
        const s=await getState();
        const filtered=filterAuditLog(s.auditLog||[],message.payload||{});
        const id=await downloadXlsx(`GiaoSuCuiBap/Nhat-ky-noi-bo-${new Date().toISOString().slice(0,10)}.xlsx`,{
          sheetName:'Nhật ký nội bộ',
          exportInfo:{source:'Nhật ký nội bộ của tiện ích; dữ liệu do người dùng ghi nhận hoặc do lần quét lưu lại.',scope:'Chỉ các dòng đang được xuất; không phải toàn bộ lịch sử trên e-GP.'},
          columns:[
            {header:'Thời điểm',key:'at',width:22,type:'datetime'},
            {header:'Người',key:'operator',width:22},
            {header:'Loại',key:'kind',width:14},
            {header:'Mã gói',key:'key',width:22},
            {header:'Nội dung',key:'detail',width:60}
          ],
          rows:filtered
        },true);
        await appendAudit('export',{text:'Xuất nhật ký nội bộ'});
        sendResponse({ok:true,id,count:filtered.length});break;
      }
      case 'EXPORT_SYNC_PACK': {
        const s=await getState();
        const pack=buildChecklistPack(s,s.settings.webhookSecret||'');
        const filename=`GiaoSuCuiBap/dong-bo-checklist-${new Date().toISOString().slice(0,10)}.json`;
        await downloadData(filename,'application/json',JSON.stringify(pack,null,2),true);
        await appendAudit('export',{text:'Xuất gói đồng bộ JSON'});
        sendResponse({ok:true});break;
      }
      case 'IMPORT_SYNC_PACK': {
        if(JSON.stringify(message.payload?.pack||{}).length>30_000_000)throw new Error('Gói đồng bộ vượt quá 30 MB.');
        const merged=await withLock(async()=>{
          const s=await getState();
          const result=mergeChecklistPack(s,message.payload?.pack||{},s.settings.operatorName||'',s.settings.webhookSecret||'');
          if(!result.ok)return result;
          const contracts=safeContracts(result.pastContracts);
          await save({[KEYS.checklists]:result.checklists,[KEYS.tenders]:result.tenders,[KEYS.pastContracts]:contracts});
          return result;
        });
        if(merged.ok)await appendAudit('import',{text:`Nhập JSON ${merged.checklistCount} checklist, ${merged.decisionCount} quyết định`});
        sendResponse(merged);break;
      }
      case 'METHOD_OUTLINE': {
        const s=await getState();
        const tender=(s.tenders||[]).find(t=>t.key===message.payload?.key)||message.payload?.tender||{};
        sendResponse({ok:true,outline:methodOutline(tender,s.settings.capability||{})});break;
      }
      case 'EXPORT_OUTLINE_DOCX': {
        const s=await getState();
        const tender=(s.tenders||[]).find(t=>t.key===message.payload?.key)||{};
        const outline=methodOutline(tender,s.settings.capability||{});
        const bytes=buildOutlineDocx(outline);
        const filename=`GiaoSuCuiBap/Khung-BPTC-${(tender.notifyNo||'goi').slice(0,20)}.docx`;
        const id=await chrome.downloads.download({url:docxDataUrl(bytes),filename,saveAs:true,conflictAction:'overwrite'});
        await appendAudit('export',{key:tender.key,text:'Xuất khung BPTC DOCX'});
        sendResponse({ok:true,id});break;
      }
      case 'PARSE_HSMT': {
        const text=String(message.payload?.text||'');
        if(text.length>1_000_000)throw new Error('Văn bản HSMT vượt quá một triệu ký tự; hãy chọn phần yêu cầu cần đối chiếu.');
        if(message.payload?.latin1&&!text){sendResponse({ok:false,message:'Hãy trích văn bản từ PDF hoặc OCR rồi dán vào. Chưa hỗ trợ đọc trực tiếp PDF.'});break;}
        const guess=inferGatesFromHsmt(text);
        sendResponse({ok:true,...guess,text:text.slice(0,2000)});break;
      }
      case 'FILTER_AUDIT': {
        const s=await getState();
        sendResponse({ok:true,rows:filterAuditLog(s.auditLog||[],message.payload||{})});break;
      }
      case 'GET_SEARCH_STATE': {sendResponse(await searchStateRuntime.read(message.payload||{}));break;}
      case 'COMPARE_SEARCH_RUNS': {
        const p=message.payload||{};
        const rows=await appStorage.lookup('runs','id',[String(p.leftRunId||''),String(p.rightRunId||'')]);
        sendResponse(compareSearchRuns(rows.find(r=>r.id===p.leftRunId),rows.find(r=>r.id===p.rightRunId)));break;
      }
      case 'GET_WAREHOUSE_STATUS': {sendResponse({...warehouseStatus(await getState()),engine:appStorage.engine});break;}
      case 'PREVIEW_WAREHOUSE_CLEANUP': {
        if(message.payload?.months!==6){sendResponse({ok:false,message:'Chỉ hỗ trợ mốc dọn kho 6 tháng.'});break;}
        const response=await withLock(async()=>{
          const state=await getState(),createdAt=Date.now(),plan=warehouseCleanupPlan(state,createdAt),token=crypto.randomUUID();
          await appStorage.set({warehouseCleanupPreview:{token,createdAt,expiresAt:createdAt+10*60000,signature:plan.signature}});
          const {keys,signature,...publicPlan}=plan;return {ok:true,token,...publicPlan};
        });sendResponse(response);break;
      }
      case 'APPLY_WAREHOUSE_CLEANUP': {
        const response=await withLock(async()=>{
          const state=await getState(),{warehouseCleanupPreview:p}=await appStorage.get({warehouseCleanupPreview:null});
          if(state.settings.readOnlyMode)return {ok:false,message:'Đang khóa chỉnh sửa.'};
          if(activeListJob(state)||bbmtWaiter)return {ok:false,message:'Chờ lượt tra cứu hoàn tất trước khi dọn kho.'};
          if(message.payload?.confirmed!==true||!p||message.payload?.token!==p.token||Date.now()>p.expiresAt)return {ok:false,message:'Xác nhận dọn kho đã hết hạn hoặc không hợp lệ. Hãy xem trước lại.'};
          const plan=warehouseCleanupPlan(state,p.createdAt);
          if(plan.signature!==p.signature)return {ok:false,message:'Kho đã thay đổi sau khi xem trước. Hãy xem trước lại để tránh xóa nhầm.'};
          const keys=new Set(plan.keys),tenders=state.tenders.filter(t=>!keys.has(t.key));
          await save({tenders,warehouseCleanupPreview:null,auditLog:[auditEntry('warehouse_cleanup',{text:`Dọn ${keys.size} gói đã đóng trước ${plan.cutoff}`},state.settings.operatorName),...(state.auditLog||[])].slice(0,800)});
          return {ok:true,removed:state.tenders.length-tenders.length,count:tenders.length,message:'Đã dọn phần đã xác nhận; giữ nguyên lịch sử và gói đang theo dõi.'};
        });sendResponse(response);break;
      }
      case 'GET_STATE': {
        const s=await getState();
        sendResponse({ok:true,...s,settings:publicSettings(s.settings),hunts:s.hunts,watchedInvestors:s.watchedInvestors,schemaHealth:s.schemaHealth,
          manifest:chrome.runtime.getManifest(),extensionId:chrome.runtime.id,alarm:await chrome.alarms.get(DAILY_ALARM)});
        break;
      }
      case 'GET_PRIVATE_SETTINGS': {
        if(!senderIsOptions(sender)){sendResponse({ok:false,message:'Chỉ trang Cấu hình được đọc token.'});break;}
        const s=await getState();
        sendResponse({ok:true,settings:s.settings});
        break;
      }
      case 'START_SCAN': sendResponse(await startScan(message.payload?.mode||'manual',message.payload||{}));break;
      case 'SCAN_ALL': sendResponse(await startScan('manual',{all:true}));break;
      case 'INGEST_CAPTURE': {
        if(!await contentRunMatches(message.payload.meta?.runId,sender)){
          sendResponse({ok:false,message:'Dữ liệu không khớp lượt quét/tab đang chạy.'});break;
        }
        sendResponse({ok:true,...await ingest(message.payload.records||[],message.payload.meta||{})});break;
      }
      case 'OBSERVED_TEMPLATE': sendResponse(await saveObservedTemplate(message.payload||{}));break;
      case 'SAVE_LAST_TEMPLATE': sendResponse(await commitLastTemplate(message.payload?.name));break;
      case 'DELETE_TEMPLATE': sendResponse(await deleteTemplate(message.payload?.id));break;
      case 'SET_ACTIVE_TEMPLATE': sendResponse(await setActiveTemplate(message.payload?.id));break;
      case 'TELEGRAM_TEST': {const s=await getState();const cfg={...s.settings,...(message.payload||{})};sendResponse(await sendTelegram(cfg,'✅ <b>Giáo Sư Cùi Bắp</b> đã kết nối Telegram.\n\nTừ nay mỗi lượt quét tự động, gói thầu mới đạt ngưỡng sẽ được gửi vào đây.',{force:true,kind:'test'}));break;}
      case 'TELEGRAM_DETECT_CHAT': sendResponse(await telegramDetectChatId(message.payload?.token));break;
      case 'TELEGRAM_LOG': {const s=await getState();sendResponse({ok:true,log:s.telegramLog,settings:{telegramEnabled:s.settings.telegramEnabled,telegramDailySummary:s.settings.telegramDailySummary}});break;}
      case 'CLEAR_TEMPLATE': await save({[KEYS.template]:null});sendResponse({ok:true});break;
      case 'SCAN_DONE': {
        const p=message.payload||{};
        if(!p.runId||!await contentRunMatches(p.runId,sender)){
          sendResponse({ok:false,message:'Tín hiệu hoàn tất không khớp lượt quét/tab đang chạy.'});break;
        }
        await advanceOrFinish(p.runId,p.ok!==false,p.message||'Hoàn tất.');sendResponse({ok:true});break;
      }
      case 'UPDATE_SETTINGS': {
        const settings=await withLock(async()=>{
          const s=await getState(),raw={...s.settings,...message.payload};
          const prices=validateCriteria({keyword:'settings',minPrice:raw.minPrice,maxPrice:raw.maxPrice});
          if(!prices.ok)throw new Error(prices.message);
          const clean=importedSettings(raw);
          // Backup imports disable integrations; ordinary settings preserve intent.
          for(const k of ['telegramBotToken','telegramChatId']){
            const next=String(raw[k]||'').trim().slice(0,500);
            clean[k]=/^•+$/.test(next)?String(s.settings[k]||''):next;
          }
          for(const k of ['telegramEnabled','autoScan','scanOnStartup','autoExportMobileReport'])clean[k]=Boolean(raw[k]);
          clean.capability=normalizeCapability(raw.capability||s.settings.capability||{});
          clean.notifyEmail=safeEmail(raw.notifyEmail);
          clean.notifyWebhook='';
          const secret=String(raw.webhookSecret||'').trim().slice(0,200);
          clean.webhookSecret=/^•+$/.test(secret)?String(s.settings.webhookSecret||''):secret;
          clean.operatorName=String(raw.operatorName||'').trim().slice(0,80);
          clean.readOnlyMode=Boolean(raw.readOnlyMode);
          clean.approvalSteps=[1,2,3].includes(Number(raw.approvalSteps))?Number(raw.approvalSteps):1;
          clean.minPrice=prices.criteria.minPrice;clean.maxPrice=prices.criteria.maxPrice||Number.MAX_SAFE_INTEGER;
          const tenders=rescoreStoredTenders(s.tenders,clean);
          await save({[KEYS.settings]:clean,[KEYS.tenders]:tenders});return clean;
        });
        if(settings.readOnlyMode){await cancelActiveRun();await cancelLookups(null,'Đã dừng khi bật khóa chỉnh sửa.');}
        await ensureDailyAlarm();sendResponse({ok:true,settings:publicSettings(settings)});break;
      }
      case 'SET_WATCH': {await withLock(async()=>{const s=await getState();const tenders=s.tenders.map(t=>t.key===message.payload.key?{...t,watchlisted:Boolean(message.payload.value)}:t);await save({[KEYS.tenders]:tenders});});sendResponse({ok:true});break;}
      case 'SET_DECISION': {await withLock(async()=>{
        const p=message.payload||{};
        const key=String(p.key||'');
        if(!key){sendResponse({ok:false,message:'Thiếu mã gói thầu.'});return;}
        const state=normalizeDecisionState(p.state);
        const s=await getState();
        const operator=String(s.settings.operatorName||p.owner||'').trim().slice(0,120);
        const current=s.tenders.find(t=>t.key===key);
        const confirming=state==='GO'&&current?.decisionProposedBy&&current.decisionProposedBy!==operator;
        if(current?.decisionOwner&&operator&&current.decisionOwner!==operator&&!p.force&&!confirming){
          sendResponse({ok:false,message:`Quyết định đang do “${current.decisionOwner}” giữ. Đổi tên người dùng hoặc ghi đè.`});return;
        }
        let found=false;let approvalNote='';
        const tenders=s.tenders.map(t=>{
          if(t.key!==key)return t;
          found=true;
          const applied=applyApproval(t,operator,state,s.settings.approvalSteps||1);
          const next={...applied.tender,decisionState:applied.tender.decisionState||state,decisionUpdatedAt:new Date().toISOString()};
          approvalNote=applied.message||'';
          if(!applied.ok){found='blocked';return t;}
          if(Object.prototype.hasOwnProperty.call(p,'owner'))next.decisionOwner=String(p.owner||operator||'').trim().slice(0,120);
          else if(operator)next.decisionOwner=next.decisionOwner||operator;
          if(Object.prototype.hasOwnProperty.call(p,'note'))next.decisionNote=String(p.note||'').trim().slice(0,1000);
          if(['REVIEW','GO','BID','SUBMITTED'].includes(next.decisionState))next.watchlisted=true;
          return next;
        });
        if(found==='blocked'){sendResponse({ok:false,message:approvalNote||'Không tự xác nhận đề xuất của chính mình.'});return;}
        if(!found){sendResponse({ok:false,message:'Không tìm thấy gói thầu trong kho dữ liệu.'});return;}
        await save({[KEYS.tenders]:tenders});
        const auditLog=[auditEntry('decision',{key,text:`${state} ${approvalNote}`.trim()},operator),...(s.auditLog||[])].slice(0,800);
        await save({[KEYS.auditLog]:auditLog});
        const stored=tenders.find(t=>t.key===key)?.decisionState||state;
        sendResponse({ok:true,state:stored,label:DECISION_STATE_LABEL[stored],message:approvalNote});
        });break;
      }
      case 'DELETE_TENDER': {const s=await getState();await save({[KEYS.tenders]:s.tenders.filter(t=>t.key!==message.payload.key)});sendResponse({ok:true});break;}
      case 'CLEAR_DATA': await directoryRuntime.clear();await save({[KEYS.tenders]:[],[KEYS.runs]:[],[KEYS.activeRun]:null,[KEYS.participations]:[],[KEYS.winnerLookup]:null,[KEYS.winnerCache]:{}});sendResponse({ok:true});break;
      case 'FACTORY_RESET': {
        obsQueue=[];notifUrls.clear();
        await chrome.alarms.clearAll();
        await appStorage.clear();
        await appStorage.set({[KEYS.settings]:{...DEFAULT_SETTINGS}});
        sendResponse({ok:true});
        break;
      }
      case 'EXPORT_CSV': await exportCsv(message.payload?.saveAs!==false,message.payload?.keys??null,message.payload?.runId||'',message.payload?.view||{},message.payload?.revision||'',message.payload?.scope||'');sendResponse({ok:true});break;
      case 'EXPORT_MOBILE': await exportMobileReport(message.payload?.saveAs!==false);sendResponse({ok:true});break;
      case 'EXPORT_BACKUP_SAFE': await exportBackup();sendResponse({ok:true});break;
      // Tương thích lệnh cũ nhưng luôn xuất định dạng an toàn.
      case 'EXPORT_BACKUP': await exportBackup();sendResponse({ok:true});break;
      case 'IMPORT_BACKUP': {
        const data=message.payload?.data;
        // Chốt phụ ở service worker; phía giao diện đã chặn theo kích thước tệp.
        if(JSON.stringify(data||{}).length>30_000_000)throw new Error('File backup vượt quá 30 MB.');
        const clean=sanitizeBackupImport(data);
        const savedSearches=safeSavedSearches(data.savedSearches);
        // Chỉ dừng tác vụ sau khi file đã qua kiểm tra. Không để tab/alarm cũ
        // tiếp tục gửi dữ liệu vào state vừa được khôi phục.
        await cancelActiveRun();
        await cancelLookups(null,'Đã dừng để nhập bản sao dữ liệu.');
        await save({[SAVED_SEARCHES]:savedSearches,[KEYS.settings]:clean.settings,[KEYS.tenders]:clean.tenders,[KEYS.runs]:clean.runs,
          [KEYS.template]:clean.template,[KEYS.templates]:clean.templates,[KEYS.lastTemplate]:clean.lastTemplate,
          [KEYS.activeRun]:null,[KEYS.participations]:clean.participations,[KEYS.winnerLookup]:null,
          [KEYS.winnerCache]:{},[KEYS.bidOpenScan]:null,[KEYS.planLookup]:null,[KEYS.areaScan]:null,
          [KEYS.investorScan]:null,[KEYS.hunts]:clean.hunts,[KEYS.watchedInvestors]:clean.watchedInvestors,
          [KEYS.checklists]:clean.checklists,[KEYS.pastContracts]:clean.pastContracts,[KEYS.amendmentLog]:clean.amendmentLog,
          [KEYS.auditLog]:clean.auditLog,[KEYS.deadlineAlerts]:{},[KEYS.domSnapshots]:[]});
        await ensureDailyAlarm();
        sendResponse({ok:true,imported:clean.tenders.length,
          message:`Đã nhập ${clean.tenders.length} gói. Telegram và lịch tự động đang tắt để bảo đảm an toàn.`});
        break;
      }
      case 'OPEN_DASHBOARD': await chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html')});sendResponse({ok:true});break;
      case 'OPEN_CONTRACTORS': await chrome.tabs.create({url:chrome.runtime.getURL('contractors.html')});sendResponse({ok:true});break;
      case 'OPEN_WINNERS': await chrome.tabs.create({url:chrome.runtime.getURL('winners.html')});sendResponse({ok:true});break;
      case 'WINNER_LOOKUP': sendResponse(await startWinnerLookup(message.payload||{}));break;
      // Cả hai tính năng dùng chung bộ máy phân trang trên tab e-GP; tách theo mode.
      case 'KQLCNT_RESULTS': {
        const p=message.payload||{};
        sendResponse(await routeKqlcntResults(p,sender));
        break;
      }
      case 'PLAN_LOOKUP': sendResponse(await startPlanLookup(message.payload||{}));break;
      case 'INVESTOR_DIRECTORY': sendResponse(await directoryRuntime.search(message.payload||{}));break;
      case 'AREA_OPTIONS': sendResponse(await getAreaOptions(message.payload||{}));break;
      case 'AREA_SCAN': sendResponse(await startAreaScan(message.payload||{}));break;
      case 'CANCEL_AREA_SCAN': sendResponse(await cancelLookups('areaScan'));break;
      case 'PRICE_REFERENCE': sendResponse(await getPriceReference(message.payload||{}));break;
      case 'EGP_ATTACHMENTS': sendResponse(await ingestAttachments(message.payload||{}));break;
      case 'GET_ATTACHMENTS': sendResponse(await getAttachments(message.payload||{}));break;
      case 'AGENT_STATUS': sendResponse(await agentStatus());break;
      case 'DOWNLOAD_ATTACHMENTS': sendResponse(await downloadAttachments(message.payload||{}));break;
      case 'FETCH_AND_DOWNLOAD': sendResponse(await fetchAndDownloadAttachments(message.payload||{}));break;
      case 'CONTRACTOR_PROFILE': sendResponse(await getContractorProfile(message.payload||{}));break;
      case 'EXPORT_PROFILE_XLSX': await exportProfileXlsx(message.payload||{});sendResponse({ok:true});break;
      case 'OPEN_PROFILE': await chrome.tabs.create({url:chrome.runtime.getURL('profile.html')});sendResponse({ok:true});break;
      case 'INVESTOR_SCAN': sendResponse(await startInvestorScan(message.payload||{}));break;
      case 'CANCEL_INVESTOR_SCAN': sendResponse(await cancelLookups('investorScan'));break;
      case 'EXPORT_INVESTOR_XLSX': await exportInvestorXlsx();sendResponse({ok:true});break;
      case 'OPEN_INVESTOR': await chrome.tabs.create({url:chrome.runtime.getURL('investor.html')});sendResponse({ok:true});break;
      case 'CANCEL_ALL_LOOKUPS': sendResponse(await cancelLookups(null));break;
      case 'RECONCILE_LOOKUPS': sendResponse(await reconcileStaleLookups());break;
      case 'EXPORT_AREA_XLSX': await exportAreaXlsx();sendResponse({ok:true});break;
      case 'OPEN_AREA': await chrome.tabs.create({url:chrome.runtime.getURL('market.html')});sendResponse({ok:true});break;
      case 'TBMT_SEARCH': sendResponse(await startTbmtSearch(message.payload||{}));break;
      case 'CANCEL_ACTIVE_RUN': sendResponse(await cancelActiveRun(message.payload?.runId||null));break;
      case 'OPEN_SEARCH': await chrome.tabs.create({url:chrome.runtime.getURL('search.html')});sendResponse({ok:true});break;
      case 'GET_PLAN_STATE': sendResponse(await planStateReply(message.payload||{}));break;
      case 'CANCEL_PLAN_LOOKUP': sendResponse(await cancelLookups('planLookup'));break;
      case 'CLEAR_PLAN_LOOKUP': await save({[KEYS.planLookup]:null});sendResponse({ok:true});break;
      case 'EXPORT_PLANS_CSV': await exportPlansCsv(message.payload||{});sendResponse({ok:true});break;
      case 'OPEN_PLANS': await chrome.tabs.create({url:chrome.runtime.getURL('plans.html')});sendResponse({ok:true});break;
      case 'OPEN_IPHONE': await chrome.tabs.create({url:chrome.runtime.getURL('mobile/iphone.html')});sendResponse({ok:true});break;
      case 'EGP_ENDPOINT_SEEN': sendResponse(await recordEndpointSeen(message.payload||{}));break;
      case 'CLEAR_ENDPOINT_MAP': await save({[KEYS.endpointMap]:[]});sendResponse({ok:true});break;
      case 'BBMT_BIDDERS': sendResponse(await onBbmtBidders(message.payload||{},sender.tab?.id));break;
      case 'BBMT_PRICE_BASIS': sendResponse(await onBbmtPriceBasis(message.payload||{},sender.tab?.id));break;
      case 'BBMT_DOM_RESULT': sendResponse(await onBbmtDomResult(message.payload||{},sender.tab?.id));break;
      case 'BID_OPEN_SCAN': sendResponse(await startBidOpenScan(message.payload||{}));break;
      case 'CANCEL_BID_OPEN_SCAN': sendResponse(await cancelLookups('bidOpenScan'));break;
      case 'GET_ANALYTICS': await flushObservations();sendResponse(await getAnalytics(message.payload||{}));break;
      case 'OPEN_ANALYTICS': await chrome.tabs.create({url:chrome.runtime.getURL('analytics.html')});sendResponse({ok:true});break;
      case 'CLEAR_OBSERVATIONS': obsQueue=[];await save({[KEYS.observations]:[]});sendResponse({ok:true});break;
      case 'GET_BID_OPEN_STATE': sendResponse({ok:true,scan:await getBidScan()});break;
      case 'RETRY_BID_OPEN': sendResponse(await retryBidOpen(message.payload||{}));break;
      case 'CLEAR_BID_OPEN_SCAN': await save({[KEYS.bidOpenScan]:null});sendResponse({ok:true});break;
      case 'EXPORT_BID_OPEN_CSV': await exportBidOpenCsv(message.payload||{});sendResponse({ok:true});break;
      case 'OPEN_BID_OPEN': await chrome.tabs.create({url:chrome.runtime.getURL('bidopen.html')});sendResponse({ok:true});break;
      case 'KQLCNT_DONE': sendResponse(await routeKqlcntDone(message.payload||{},sender));break;
      case 'KHLCNT_DETAIL': sendResponse(planDetailReader.accept(message.payload||{},sender.tab?.id,sender.url||sender.tab?.url||''));break;
      case 'CONTENT_READY': sendResponse(await onBbmtContentReady(message.payload||{},sender.tab?.id));break;
      case 'GET_WINNER_STATE': {const {winnerCache:cache}=await appStorage.get({winnerCache:{}});sendResponse({ok:true,lookup:await readLookupView('winnerLookup'),cache});break;}
      case 'CANCEL_WINNER_LOOKUP': sendResponse(await cancelLookups('winnerLookup'));break;
      case 'CLEAR_WINNER_LOOKUP': await save({[KEYS.winnerLookup]:null});sendResponse({ok:true});break;
      case 'CLEAR_WINNER_CACHE': await save({[KEYS.winnerCache]:{}});sendResponse({ok:true});break;
      case 'EXPORT_WINNERS_CSV': await exportWinnersCsv();sendResponse({ok:true});break;
      case 'OPEN_OPTIONS': await chrome.runtime.openOptionsPage();sendResponse({ok:true});break;
      case 'RUN_TRACE_SUMMARY': {const {runTrace=[]}=await chrome.storage.local.get({runTrace:[]});
        sendResponse({ok:true,summary:summarizeTrace(runTrace),last7d:summarizeTrace(runTrace,{sinceMs:7*864e5}),recent:runTrace.slice(-30).reverse(),modes:MODE_LABELS,stages:STAGES});break;}
      case 'CLEAR_RUN_TRACE': await chrome.storage.local.set({runTrace:[]});sendResponse({ok:true});break;
      case 'EGP_PREWARM': sendResponse(await queryRuntime.prewarm());break;
      case 'OPEN_EGP': {const s=await getState();await chrome.tabs.create({url:s.template?.sourcePageUrl||EGP_DEFAULT_URL});sendResponse({ok:true});break;}
      case 'SCAN_CURRENT_TAB': {const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.url?.startsWith('https://muasamcong.mpi.gov.vn/'))throw new Error('Tab hiện tại không phải e-GP.');sendResponse(await sendToTab(tab.id,{type:'SCAN_CURRENT_PAGE'}));break;}
      default: sendResponse({ok:false,message:'Lệnh không được hỗ trợ.'});
    }
  })().catch(error=>sendResponse({ok:false,message:String(error?.message||error)}));
  return true;
});

chrome.commands.onCommand.addListener(command=>{if(command==='open-search')chrome.tabs.create({url:chrome.runtime.getURL('search.html')});});

