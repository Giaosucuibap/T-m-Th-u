import {DEFAULT_SETTINGS,extractCandidateObjects,normalizeCandidate,mergeTender,scoreTender,sanitizeRequestTemplate,extractParticipations,dedupeParticipations,mergeParticipation,formatMoney,formatDate,safeFilename,migrateTenderCodes,canonicalEgpUrl,EGP_SCAN_PAGE,hasContentScript,scanTargetUrl} from './lib/core.js';
import {buildSafeBackupState,safeRunForBackup} from './lib/backup.js';
import {EGP_SEARCH_PAGE,PAGE_SIZE,normalizeTaxCodeForEgp,normalizeKqlcntRecord,extractContractorCandidates,dedupeKqlcnt,summarizeWinner,buildKqlcntQuery,buildWardMarketQuery,buildTbmtQuery,tbmtMatchesWard} from './lib/kqlcnt.js';
import {buildBbmtQuery,bbmtDateRange,bbmtInDateRange,normalizeBbmtPackage,normalizeBidderTable,notifyNoFromUrl,summarizeBidOpenings,STEPS_DECIDED} from './lib/bbmt.js';
import {normalizeKhlcntPlan,dedupeKhlcnt,summarizeKhlcnt,auditPlans,buildKhlcntQuery,filterPlansByArea} from './lib/khlcnt.js';
import {fetchAllAreas,currentProvinceNames,wardNamesForProvince,provinceCodesByName,wardCodesByName} from './lib/areas.js';
import {buildXlsx,xlsxDataUrl,XLSX_MIME} from './lib/xlsx.js';
import {summarizeArea,AREA_DISCLAIMER,AREA_SCOPE_NOTE} from './lib/localmarket.js';
import {summarizePricing,priceReference,PRICING_DISCLAIMER,PRICING_METHOD_NOTE} from './lib/pricing.js';
import {extractAttachments,mergeAttachments,agentDownloadUrl,safeDownloadName,AGENT_ORIGIN,AGENT_MISSING_MESSAGE} from './lib/attachments.js';
import {buildProfile360,PROFILE_COMPLETE_NOTE,PROFILE_PARTIAL_NOTE,PROFILE_USE_NOTE} from './lib/profile360.js';
import {buildInvestorDiscoveryQuery,buildInvestorProfileQuery,discoverInvestors,summarizeInvestor,INVESTOR_COMPLETE_NOTE,INVESTOR_JOIN_NOTE,INVESTOR_PARTIAL_NOTE,INVESTOR_DISCLAIMER} from './lib/investor.js';
import {observationsFromBidOpen,observationsFromWinner,mergeObservations,contractorProfile,discountProfile,winThreshold,investorMatrix,competitionStats} from './lib/analytics.js';
import {BRAND} from './lib/brand.js';
import {DECISION_STATE_LABEL,normalizeDecisionState} from './lib/decision.js';

const KEYS={settings:'settings',tenders:'tenders',runs:'runs',template:'searchTemplate',templates:'searchTemplates',lastTemplate:'lastObservedTemplate',activeRun:'activeRun',participations:'participations',winnerLookup:'winnerLookup',winnerCache:'winnerCache',bidOpenScan:'bidOpenScan',planLookup:'planLookup',telegramLog:'telegramLog',observations:'observations',areas:'areas',areaScan:'areaScan',attachments:'attachments',investorScan:'investorScan',endpointMap:'endpointMap'};
const DAILY_ALARM='gscb-daily';
const TIMEOUT_PREFIX='gscb-timeout:';
// Mọi tác vụ cần content script, vì vậy URL mặc định phải nằm đúng route mà
// manifest cho phép. Trang home không nạp bridge và làm lượt quét thủ công treo.
// Lấy từ lib/core.js để phạm vi content script chỉ có MỘT nguồn sự thật,
// đối chiếu được với manifest bằng kiểm thử.
const EGP_DEFAULT_URL=EGP_SCAN_PAGE;
const notifUrls=new Map();
const pendingKqlcntDoneByTab=new Map();
let storageQueue=Promise.resolve();
const withLock=fn=>{storageQueue=storageQueue.then(fn,fn);return storageQueue;};

// Không cho script trên website đọc trực tiếp kho cục bộ (đặc biệt Bot Token).
// Content script không dùng chrome.storage nên có thể khóa về trusted contexts.
if(chrome.storage.local.setAccessLevel){
  chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}).catch(()=>{});
}

async function getState(){
  const data=await chrome.storage.local.get({
    [KEYS.settings]:DEFAULT_SETTINGS,[KEYS.tenders]:[],[KEYS.runs]:[],[KEYS.template]:null,[KEYS.templates]:[],[KEYS.lastTemplate]:null,[KEYS.activeRun]:null,[KEYS.participations]:[],[KEYS.winnerLookup]:null,[KEYS.winnerCache]:{},[KEYS.bidOpenScan]:null,[KEYS.planLookup]:null,[KEYS.telegramLog]:[],[KEYS.observations]:[],[KEYS.areaScan]:null,[KEYS.attachments]:{},[KEYS.investorScan]:null,[KEYS.endpointMap]:[]
  });
  return {settings:{...DEFAULT_SETTINGS,...data[KEYS.settings]},tenders:data[KEYS.tenders]||[],runs:data[KEYS.runs]||[],template:data[KEYS.template]||null,templates:data[KEYS.templates]||[],lastTemplate:data[KEYS.lastTemplate]||null,activeRun:data[KEYS.activeRun]||null,participations:data[KEYS.participations]||[],winnerLookup:data[KEYS.winnerLookup]||null,winnerCache:data[KEYS.winnerCache]||{},bidOpenScan:data[KEYS.bidOpenScan]||null,planLookup:data[KEYS.planLookup]||null,telegramLog:data[KEYS.telegramLog]||[],observations:data[KEYS.observations]||[],areaScan:data[KEYS.areaScan]||null,attachments:data[KEYS.attachments]||{},investorScan:data[KEYS.investorScan]||null,endpointMap:data[KEYS.endpointMap]||[]};
}
async function save(partial){await chrome.storage.local.set(partial);}

function newRun(mode){return {id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,mode,status:'STARTING',startedAt:new Date().toISOString(),finishedAt:null,captured:0,newCount:0,updatedCount:0,matchedCount:0,message:'Đang mở Hệ thống mạng đấu thầu quốc gia...',tabId:null,queue:[],qi:0,pendingAlerts:[],pendingMatches:[]};}
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
      ...scoreTender(t,settings)
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
  const run=await updateRun(runId,{status,message,finishedAt:new Date().toISOString()});
  await chrome.alarms.clear(TIMEOUT_PREFIX+runId);
  const s=await getState();
  if(s.activeRun?.id===runId)await save({[KEYS.activeRun]:null});
  if(status==='SUCCESS'||status==='PARTIAL'){
    const partial=status==='PARTIAL';
    chrome.notifications.create({type:'basic',iconUrl:'icons/icon128.png',
      title:partial?'Giáo Sư Cùi Bắp — dữ liệu chưa đầy đủ':'Giáo Sư Cùi Bắp',
      message:`${partial?'Quét một phần':'Quét xong'}: ${run?.newCount||0} gói mới, ${run?.matchedCount||0} gói đạt ngưỡng.${partial?' Hãy mở tiện ích để xem phạm vi còn thiếu.':''}`}).catch(()=>{});
    await notifyHighScore(run?.pendingAlerts||[]);
    await pushTelegramMatches(s.settings,run?.pendingMatches||[],run);
    if(s.settings.autoExportMobileReport)await exportMobileReport(false);
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
    chrome.notifications.create(nid,{type:'basic',iconUrl:'icons/icon128.png',title:`⭐ ${t.score}đ · ${t.notifyNo}`,message:(t.bidName||'').slice(0,150),buttons:[{title:'Mở gói thầu trên e-GP'}]}).catch(()=>{});
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
  const chatId=String(settings.telegramChatId||'').trim();
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

async function pushTelegramMatches(settings,matches,run){
  if(!settings.telegramEnabled)return;
  const list=matches||[];
  const partial=run?.status==='PARTIAL'||Boolean(run?.partial);
  const scopeNote=partial?'\n⚠️ <b>DỮ LIỆU CHƯA ĐẦY ĐỦ</b>: lượt quét bị giới hạn hoặc gián đoạn.':' ';

  // Không có gói mới: chỉ nhắn khi người dùng bật "báo cả khi không có gì mới",
  // để biết hệ thống vẫn sống chứ không phải đã chết âm thầm.
  if(!list.length){
    if(!settings.telegramDailySummary)return;
    await sendTelegram(settings,
      `📡 <b>Giáo Sư Cùi Bắp</b> — ${new Date().toLocaleString('vi-VN')}\n`
      +`${partial?'Đã quét một phần':'Đã quét xong'}, <b>không có gói mới</b> đạt ngưỡng.${scopeNote}\n`
      +`Tổng cộng đã nhận ${Number(run?.captured||0)} bản ghi từ e-GP.`,
      {kind:'summary'});
    return;
  }

  const head=`📡 <b>Giáo Sư Cùi Bắp</b>: ${list.length} gói mới đạt ngưỡng\n`
    +`<i>${new Date().toLocaleString('vi-VN')}</i>${scopeNote}`;
  // Sắp theo điểm giảm dần để gói đáng chú ý nhất nằm ngay đầu tin nhắn.
  const body=[...list].sort((a,b)=>Number(b.score||0)-Number(a.score||0))
    .slice(0,25).map(telegramTenderLine).join('\n\n');
  const tail=list.length>25?`\n\n… và ${list.length-25} gói nữa, xem trong tiện ích.`:'';
  await sendTelegram(settings,`${head}\n\n${body}${tail}`,{kind:'matches'});
}

function makeTemplateId(){return 't'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function templateName(tpl){try{const u=new URL(tpl.sourcePageUrl||tpl.url);const seg=u.pathname.split('/').filter(Boolean).pop()||'e-GP';return `${seg} · ${new Date(tpl.capturedAt||Date.now()).toLocaleDateString('vi-VN')}`;}catch{return 'Bộ lọc '+new Date().toLocaleDateString('vi-VN');}}

async function ingest(records,meta={}){
  return withLock(async()=>{
    const s=await getState();
    const existing=new Map(s.tenders.map(t=>[t.key,t]));
    const alertMin=Number(s.settings.alertMinScore||85);
    const teleMin=Number(s.settings.telegramMinScore||70);
    const freshAlerts=[],freshMatches=[];
    let newCount=0,updatedCount=0,matchedCount=0,valid=0;
    for(const raw of records.slice(0,1000)){
      const normalized=normalizeCandidate(raw,meta);if(!normalized)continue;valid++;
      const before=existing.get(normalized.key);
      const merged=mergeTender(before||{},normalized,s.settings);
      if(before)updatedCount++;else{
        newCount++;
        if(merged.score>=alertMin)freshAlerts.push(merged);
        if(merged.matched&&merged.score>=teleMin)freshMatches.push(merged);
      }
      if(merged.matched)matchedCount++;
      existing.set(merged.key,merged);
    }
    const tenders=[...existing.values()].sort((a,b)=>new Date(b.lastSeenAt)-new Date(a.lastSeenAt)).slice(0,Number(s.settings.maxStoredTenders||3000));
    const patch={[KEYS.tenders]:tenders};
    // Nhà thầu: trích nhà thầu tham dự/trúng thầu từ chính dữ liệu vừa bắt.
    // Bọc an toàn tuyệt đối: lỗi ở đây KHÔNG được phép làm hỏng việc lưu gói thầu.
    let partCount=0;
    try{
      const foundParts=extractParticipations(records.slice(0,1000),meta)||[];
      if(foundParts.length){
        const pmap=new Map((s.participations||[]).map(p=>[p.key,p]));
        for(const np of foundParts){ if(!np?.key)continue; pmap.set(np.key, pmap.has(np.key)?mergeParticipation(pmap.get(np.key),np):np); }
        patch[KEYS.participations]=[...pmap.values()].slice(0,30000);
        partCount=foundParts.length;
      }
    }catch(e){ /* bỏ qua để không ảnh hưởng luồng chính */ }
    if(meta.runId){
      const run=s.runs.find(r=>r.id===meta.runId);
      if(run){
        const captured=Number(run.captured||0)+valid;
        const progress=meta.total?`Đã lấy ${captured} bản ghi${meta.page?` (trang ${meta.page}`:''}${meta.page&&meta.total?` · tổng ~${meta.total} gói)`:meta.page?')':''}; đang chấm điểm...`:`Đã nhận ${captured} bản ghi; đang chống trùng và chấm điểm...`;
        const updatedRun={...run,status:'RUNNING',message:progress,captured,newCount:Number(run.newCount||0)+newCount,updatedCount:Number(run.updatedCount||0)+updatedCount,matchedCount:Number(run.matchedCount||0)+matchedCount,pendingAlerts:[...(run.pendingAlerts||[]),...freshAlerts].slice(0,50),pendingMatches:[...(run.pendingMatches||[]),...freshMatches].slice(0,50)};
        patch[KEYS.runs]=s.runs.map(r=>r.id===meta.runId?updatedRun:r).slice(0,100);
        if(s.activeRun?.id===meta.runId)patch[KEYS.activeRun]={...s.activeRun,...updatedRun};
      }
    }
    await save(patch);
    return {valid,newCount,updatedCount,matchedCount,total:tenders.length,participations:partCount};
  });
}

async function waitForTab(tabId,timeout=30000){
  const tab=await chrome.tabs.get(tabId);if(tab.status==='complete')return tab;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(listener);reject(new Error('Quá thời gian mở trang e-GP.'));},timeout);
    function listener(id,info,tab){if(id===tabId&&info.status==='complete'){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);resolve(tab);}}
    chrome.tabs.onUpdated.addListener(listener);
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
    id:run.id,mode:'tbmt',label:total>1?`${label} (${index+1}/${total})`:label,
    query:nativeTbmtQueryFromTemplate(template),pageSize:PAGE_SIZE,
    maxPages:Math.max(1,Number(settings.maxPagesHint)||DEFAULT_SETTINGS.maxPagesHint)
  });
}

async function startScan(mode='manual',opts={}){
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
  const run={...newRun(mode),queue,qi:0,nativeQuery:true,ownedTab:mode!=='manual'};
  const claimed=await claimActiveRun(run);
  if(!claimed.ok)return {ok:false,message:'Một lượt quét khác vừa được bắt đầu.',run:claimed.current};
  try{
    const tab=await prepareScanTabFor(mode,queue[0],s);
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
    await updateRun(runId,{qi:nextQi,status:'RUNNING',pageDone:false,completionMessage:null,message:runningMessage(queue,nextQi)});
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
async function ensureDailyAlarm(){const s=await getState();await chrome.alarms.clear(DAILY_ALARM);if(s.settings.autoScan)await chrome.alarms.create(DAILY_ALARM,{when:nextDailyTime(s.settings.dailyTime),periodInMinutes:1440});}

async function saveObservedTemplate(payload){
  const template=sanitizeRequestTemplate(payload.request,payload.sourcePageUrl,payload.candidateCount||0);if(!template)return {ok:false};
  const s=await getState();const old=s.lastTemplate;
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
    url:xlsxDataUrl(bytes),filename,saveAs,conflictAction:'overwrite'
  });
}

/** Ngày tháng cho tên tệp. */
const stamp=()=>new Date().toISOString().slice(0,10);

/** Số hoặc null — để ô thiếu giá là ô TRỐNG, không phải "0 đ". */
const numOrNull=v=>(v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v)))?null:Number(v);
async function exportCsv(saveAs=true){
  const s=await getState();
  return downloadXlsx(`GiaoSuCuiBap/DS-goi-thau-${stamp()}.xlsx`,{
    sheetName:'Gói thầu',
    columns:[
      {header:'Điểm',key:'score',type:'number',width:8},
      {header:'Khuyến nghị',key:'recommendation',width:30},
      {header:'Trạng thái',key:'statusLabel',width:16},
      {header:'Mã TBMT',key:'notifyNo',width:16},
      {header:'Mã gói thầu (KHLCNT)',key:'bidNo',width:18},
      {header:'Phiên bản',key:'version',width:10},
      {header:'Tên gói thầu',key:'bidName',width:50},
      {header:'Dự án',key:'projectName',width:38},
      {header:'Địa điểm',key:'location',width:26},
      {header:'Giá gói thầu',key:'price',type:'money',width:20},
      {header:'Ngày đăng',key:'publicDate',width:18},
      {header:'Đóng thầu',key:'closeDate',width:18},
      {header:'Chủ đầu tư',key:'investorName',width:34},
      {header:'Bên mời thầu',key:'procuringEntityName',width:34},
      {header:'Quyết định',key:'decisionState',width:22},
      {header:'Người phụ trách',key:'decisionOwner',width:22},
      {header:'Ghi chú nội bộ',key:'decisionNote',width:42},
      {header:'Số thay đổi đã ghi nhận',key:'changeCount',type:'number',width:20},
      {header:'Thay đổi gần nhất',key:'lastChange',width:38},
      {header:'Link e-GP',key:'detailUrl',type:'url',width:44}
    ],
    rows:s.tenders.map(t=>({
      score:numOrNull(t.score),recommendation:t.recommendation,statusLabel:t.statusLabel||'',
      notifyNo:t.notifyNo||'',bidNo:t.bidNo||'',version:t.version,
      bidName:t.bidName,projectName:t.projectName,location:t.location,
      price:numOrNull(t.price),publicDate:t.publicDate,closeDate:t.closeDate,
      investorName:t.investorName,procuringEntityName:t.procuringEntityName,
      decisionState:DECISION_STATE_LABEL[normalizeDecisionState(t.decisionState)],
      decisionOwner:t.decisionOwner||'',decisionNote:t.decisionNote||'',
      changeCount:Array.isArray(t.changeLog)?t.changeLog.length:0,
      lastChange:Array.isArray(t.changeLog)&&t.changeLog.length
        ?`${t.changeLog[t.changeLog.length-1].label}: ${t.changeLog[t.changeLog.length-1].before} → ${t.changeLog[t.changeLog.length-1].after}`:'',
      detailUrl:t.detailUrl
    }))
  },saveAs);
}
function mobileHtml(tenders){
  const data=JSON.stringify(tenders).replace(/</g,'\\u003c');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Giáo Sư Cùi Bắp - Báo cáo điện thoại</title><style>body{font-family:system-ui;margin:0;background:#f5f7fb;color:#0f172a}header{background:#0f172a;color:#fff;padding:16px;position:sticky;top:0}main{max-width:900px;margin:auto;padding:14px}.card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin:10px 0}.score{font-size:24px;font-weight:900}.muted{color:#64748b;font-size:13px}input,select{padding:10px;border:1px solid #cbd5e1;border-radius:9px;width:100%;box-sizing:border-box;margin:5px 0}a{color:#0f766e;font-weight:700}</style></head><body><header><b>📡 Giáo Sư Cùi Bắp</b><div style="font-size:12px">Xuất lúc ${new Date().toLocaleString('vi-VN')}</div></header><main><input id="q" placeholder="Tìm tên gói, tỉnh, chủ đầu tư..."><select id="score"><option value="0">Tất cả điểm</option><option value="55">≥55</option><option value="70">≥70</option><option value="85">≥85</option></select><div id="list"></div></main><script>const D=${data};const q=document.getElementById('q'),s=document.getElementById('score'),l=document.getElementById('list');function esc(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function money(v){return v?Number(v).toLocaleString('vi-VN')+' đ':'Chưa xác định'}function draw(){const k=q.value.toLowerCase(),m=Number(s.value);const a=D.filter(x=>x.score>=m&&JSON.stringify(x).toLowerCase().includes(k)).sort((a,b)=>b.score-a.score);l.innerHTML='<p>'+a.length+' gói thầu</p>'+a.map(x=>'<div class="card"><div class="score">'+x.score+'/100</div><b>'+esc(x.bidName)+'</b><p class="muted">'+esc(x.codeLabel||'Mã TBMT')+': '+esc(x.displayCode||x.notifyNo||x.bidNo||'')+' · '+esc(x.location||'Chưa xác định')+'</p><p>'+esc(x.statusLabel||'')+'</p><p>💰 '+money(x.price)+'</p><p>'+esc(x.recommendation)+'</p><a href="'+esc(x.detailUrl)+'" target="_blank">Mở nguồn e-GP</a></div>').join('')}q.oninput=s.onchange=draw;draw();<\/script></body></html>`;
}
async function exportMobileReport(saveAs=true){const s=await getState();return downloadData(`GiaoSuCuiBap/Bao-cao-dien-thoai-${new Date().toISOString().slice(0,10)}.html`,'text/html',mobileHtml(s.tenders),saveAs);}
async function exportBackup(){
  const s=await getState();
  const cleanTemplates=sanitizedTemplateState(s);
  // Danh sách trắng: không xuất activeRun, runs[].queue, cache, log Telegram,
  // request lồng hoặc bất kỳ khóa nào có dấu hiệu bí mật.
  const exportState=buildSafeBackupState(s,cleanTemplates,DEFAULT_SETTINGS);
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  return downloadData(`GiaoSuCuiBap/backup-du-lieu-an-toan-${stamp}.json`,
    'application/json',
    JSON.stringify({version:chrome.runtime.getManifest().version,
      exportedAt:new Date().toISOString(),
      backupMode:'SAFE',
      _LUU_Y:'Ban sao an toan: queue request, token, CAPTCHA, cookie, Bot Token va Chat ID da duoc loai bo.',
      ...exportState}),true);
}

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
async function dispatchLookupToTab(tabId,payload){
  const res=await sendToTab(tabId,{type:'KQLCNT_START',payload});
  if(res&&res.ok===false){
    throw new Error(res.message||'Tab e-GP đang chạy một lượt tra cứu khác.');
  }
  return res;
}

async function ensureEgpSearchTab(active){
  const tabs=await chrome.tabs.query({url:'https://muasamcong.mpi.gov.vn/*'});
  const candidates=tabs.filter(t=>/contractor-selection/i.test(t.url||''));

  // Hỏi từng tab: đang ở màn hình kết quả chưa, và có đang chạy việc khác không.
  // Trạng thái "bận" đọc trực tiếp từ tab nên luôn đúng, không cần sổ ghi riêng
  // ở đây — service worker có thể bị Chrome dọn bất cứ lúc nào, sổ ghi trong bộ
  // nhớ sẽ mất còn câu trả lời của tab thì không.
  const probed=[];
  for(const t of candidates){
    const probe=await sendToTab(t.id,{type:'KQLCNT_PROBE'}).catch(()=>null);
    probed.push({tab:t,resultsView:Boolean(probe&&probe.resultsView),busy:Boolean(probe&&probe.busy)});
  }

  // 1. Tab rỗi và đã có sẵn danh sách kết quả: dùng luôn, không tải lại.
  const ready=probed.find(p=>p.resultsView&&!p.busy);
  if(ready){
    if(active)await chrome.tabs.update(ready.tab.id,{active:true}).catch(()=>{});
    return ready.tab;
  }

  // 2. Tab rỗi nhưng chưa ở màn hình kết quả: tải lại tab đó.
  const idle=probed.find(p=>!p.busy);
  if(idle){
    const tab=await chrome.tabs.update(idle.tab.id,{url:EGP_SEARCH_PAGE,active:Boolean(active)});
    await waitForTab(tab.id,40000);
    return tab;
  }

  // 3. MỌI tab e-GP đều đang chạy việc khác → MỞ TAB MỚI.
  //
  //    Đây là chỗ sửa để bốn chức năng chạy song song được. Trước đây nhánh này
  //    lấy lại chính tab đang bận rồi tải lại trang, tức là XOÁ SỔ lượt tra cứu
  //    đang chạy trên đó: người dùng bấm tra "trúng thầu" là lượt tìm "gói thầu"
  //    lặng lẽ chết. Biến giữ tiêu chí nằm riêng theo từng tab, nên mỗi lượt tra
  //    cứu có tab riêng là chạy độc lập được thật.
  //
  //    Tab mới luôn mở ở chế độ nền: lượt tra cứu thứ hai không được giật màn
  //    hình khỏi việc người dùng đang làm.
  const tab=await chrome.tabs.create({url:EGP_SEARCH_PAGE,active:candidates.length?false:Boolean(active)});
  await waitForTab(tab.id,40000);
  return tab;
}

const ACTIVE_JOB_STATUSES=new Set(['STARTING','OPENING','RUNNING','LISTING','SCANNING']);

/** Giữ chỗ nguyên tử cho một tính năng; chặn double-click tạo job/tab mồ côi. */
async function claimLookupJob(key,job){
  return withLock(async()=>{
    const s=await getState();
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
    const s=await getState();
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
async function startWinnerLookup(payload={}){
  const raw=String(payload.query||'').trim();
  const forcedTax=normalizeTaxCodeForEgp(payload.taxCode||'');
  const taxCode=forcedTax||normalizeTaxCodeForEgp(raw);
  if(!taxCode&&!raw)return {ok:false,message:'Hãy nhập tên công ty hoặc mã số thuế.'};

  const mode=taxCode?'exact':'discover';
  const label=taxCode?`MST ${taxCode}`:`"${raw}"`;
  const id=newLookupId();

  const lookup={
    id,mode,query:raw,focusTaxCode:taxCode,
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
    await dispatchLookupToTab(tab.id,{
      id,mode,label,
      // Truy vấn dựng sẵn ở đây (nơi import được lib) rồi truyền xuống page-hook.
      query:buildKqlcntQuery(taxCode?{taxCodes:[taxCode]}:{keyword:raw,matchType:'all-0'}),
      pageSize:PAGE_SIZE,
      focusTaxCode:taxCode,
      maxPages:WINNER_MAX_PAGES[mode]
    });
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
    const s=await getState();
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
      const normalized=rows.map(r=>normalizeKqlcntRecord(r,lookup.focusTaxCode)).filter(Boolean);
      next.packages=dedupeKqlcnt([...(lookup.packages||[]),...normalized]);
      for(const p of normalized)obsQueue.push(...observationsFromWinner(p));
      next.message=`Đã lấy ${next.packages.length}/${next.totalElements||next.packages.length} gói trúng thầu...`;
    }else{
      const found=extractContractorCandidates(rows,lookup.query);
      const map=new Map((lookup.candidates||[]).map(c=>[c.taxCode,c]));
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
        if(next.focusTaxCode&&next.status==='SUCCESS'&&next.packages.length){
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

async function exportWinnersCsv(){
  const s=await getState();
  const lookup=s.winnerLookup;
  const list=(lookup&&lookup.packages)||[];
  if(!list.length)throw new Error('Chưa có kết quả tra cứu để xuất.');
  const name=safeFilename(lookup.contractorName||lookup.focusTaxCode||'nha-thau');
  return downloadXlsx(`GiaoSuCuiBap/KQLCNT-${name}-${stamp()}.xlsx`,{
    sheetName:'Gói đã trúng',
    columns:[
      {header:'Mã TBMT',key:'notifyNoStand',width:18},
      {header:'Vai trò',key:'focusRole',width:12},
      {header:'Tên gói thầu',key:'bidName',width:52},
      {header:'Nhà thầu trúng thầu',key:'winnerName',width:38},
      {header:'Thành viên liên danh',key:'memberNames',width:38},
      {header:'Giá gói thầu/dự toán',key:'priceBasis',type:'money',width:20},
      {header:'Giá trúng thầu',key:'winningPrice',type:'money',width:20},
      {header:'Chênh lệch',key:'savedAmount',type:'money',width:18},
      {header:'Tỷ lệ giảm giá',key:'discountRate',type:'percent',width:14},
      {header:'Chủ đầu tư',key:'investorName',width:36},
      {header:'Địa điểm',key:'location',width:26},
      {header:'Lĩnh vực',key:'fieldLabel',width:14},
      {header:'Hình thức',key:'bidFormLabel',width:22},
      {header:'Ngày phê duyệt',key:'decisionDate',width:16},
      {header:'Ngày đăng KQLCNT',key:'publicDateKqlcnt',width:18},
      {header:'Link e-GP',key:'detailUrl',type:'url',width:44}
    ],
    rows:list.map(p=>({
      notifyNoStand:p.notifyNoStand,focusRole:p.focusRole||'Trúng thầu',bidName:p.bidName,
      winnerName:p.winnerName,memberNames:(p.memberNames||[]).join(' | '),
      priceBasis:numOrNull(p.priceBasis),winningPrice:numOrNull(p.winningPrice),
      savedAmount:numOrNull(p.savedAmount),discountRate:numOrNull(p.discountRate),
      investorName:p.investorName,location:p.location,fieldLabel:p.fieldLabel,
      bidFormLabel:p.bidFormLabel,decisionDate:formatDate(p.decisionDate),
      publicDateKqlcnt:formatDate(p.publicDateKqlcnt),detailUrl:p.detailUrl
    }))
  });
}

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

const BBMT_DETAIL_TIMEOUT=20000;   // hạn chờ một trang biên bản trả bảng nhà thầu
const BBMT_DETAIL_PAUSE=700;       // nghỉ giữa hai gói
const BBMT_DETAIL_ALARM_MS=BBMT_DETAIL_TIMEOUT+30000;

// Hàng đợi giai đoạn 2 sống trong bộ nhớ service worker; tiến độ ghi vào storage.
let bbmtWaiter=null;               // {notifyNo, resolve}
let bbmtCancelled=false;

async function setScan(patch){
  return withLock(async()=>{
    const s=await getState();
    const next={...(s.bidOpenScan||{}),...patch};
    await save({[KEYS.bidOpenScan]:next});
    return next;
  });
}

/** Bắt đầu giai đoạn 1: lấy danh sách gói đang chờ kết quả. */
async function startBidOpenScan(payload={}){
  const raw=String(payload.query||'').trim();
  const taxCode=normalizeTaxCodeForEgp(payload.taxCode||raw);
  /* Quy TÊN tỉnh ra MỌI MÃ cùng tên. Sau sáp nhập 1/7/2025 một tỉnh mang hai
     mã (Lâm Đồng = 68 hiện hành + 703 cũ), gửi thiếu mã là bỏ sót hồ sơ cũ. */
  const provinceName=String(payload.province||'').trim();
  let provinces=[];
  if(provinceName){
    const areas=(await getAreas({})).areas;
    if(areas)provinces=provinceCodesByName(areas.provinces,provinceName);
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
    investor:String(payload.investor||'').trim(),
    province:provinceName,
    provinces,
    minPrice:Number(payload.minPrice)||0,
    maxPrice:Number(payload.maxPrice)||0
  };
  const maxPackages=Math.max(1,Math.min(Number(payload.maxPackages)||150,600));
  const id=newLookupId();

  const scan={
    id,status:'LISTING',
    contractorQuery:raw,focusTaxCode:taxCode,
    contractorName:String(payload.contractorName||'').trim(),
    scope,maxPackages,mode:lossMode?'loss':'pending',
    message:lossMode
      ?'Đang lấy danh sách gói ĐÃ CÓ KẾT QUẢ để dò gói bạn dự mà không trúng...'
      :'Đang lấy danh sách gói đã mở thầu nhưng chưa có kết quả...',
    startedAt:new Date().toISOString(),finishedAt:null,
    totalCandidates:0,packages:[],scannedCount:0,cancelled:false
  };
  const claimed=await claimLookupJob('bidOpenScan',scan);
  if(!claimed.ok)return {ok:false,message:'Một lượt soi biên bản mở thầu đang chạy. Hãy chờ hoặc bấm Dừng trước khi chạy lại.',scan:claimed.current};
  bbmtCancelled=false;

  try{
    const tab=await ensureEgpSearchTab(payload.focusTab!==false);
    const bound=await bindLookupTab('bidOpenScan',id,tab.id);
    await dispatchLookupToTab(tab.id,{
      id,mode:'bbmt-list',label:'gói đang chờ kết quả',
      query:buildBbmtQuery(scope),
      pageSize:PAGE_SIZE,
      // Chỉ cần đủ trang để lấp đầy trần số gói.
      maxPages:Math.ceil(maxPackages/PAGE_SIZE)
    });
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
    const s=await getState();
    const scan=s.bidOpenScan;
    if(!scan||scan.id!==payload.planId)return false;

    const rows=Array.isArray(payload.records)?payload.records:[];
    /* LỌC THỜI GIAN TẠI CHỖ.
     *
     * Bộ lọc gửi lên máy chủ chỉ là tối ưu tốc độ: trường publicDateKqmt chưa
     * được đo là có lập chỉ mục range hay không, và e-GP thì BỎ QUA lặng lẽ bộ
     * lọc nó không hiểu thay vì báo lỗi. Đúng chỗ này từng làm người dùng chọn
     * "15 ngày" mà nhận về gói mở thầu năm 2023.
     *
     * Vì vậy khoảng thời gian được áp lại một lần nữa trên dữ liệu đã tải về.
     * Đây mới là thứ bảo đảm kết quả nằm đúng khoảng, bất kể máy chủ làm gì. */
    const range=bbmtDateRange(scan.scope||{});
    const all=rows.map(normalizeBbmtPackage).filter(Boolean);
    const found=all.filter(p=>bbmtInDateRange(p,range));
    const dropped=Number(scan.outOfRangeCount||0)+(all.length-found.length);

    const map=new Map((scan.packages||[]).map(p=>[p.key,p]));
    for(const p of found)if(!map.has(p.key))map.set(p.key,p);

    const packages=[...map.values()].slice(0,scan.maxPackages);
    const next={...scan,packages,outOfRangeCount:dropped,
      totalCandidates:Number(payload.totalElements||scan.totalCandidates||0),
      message:`Đã tìm được ${packages.length} gói đang chờ kết quả`
        +(dropped?` (đã bỏ ${dropped} gói ngoài khoảng thời gian đã chọn)`:'')+'...'};
    if(payload.done)next.listingDone=true;
    await save({[KEYS.bidOpenScan]:next});
    return Boolean(payload.done&&!scan.listingDone);
  });
  if(done)startBidOpenDetailPhase();
  return {ok:true};
}

/** Giai đoạn 2: mở lần lượt từng trang biên bản để đọc bảng nhà thầu. */
async function startBidOpenDetailPhase(){
  const s=await getState();
  const scan=s.bidOpenScan;
  if(!scan)return;
  const list=scan.packages||[];
  if(!list.length){
    await setScan({status:'SUCCESS',finishedAt:new Date().toISOString(),
      message:'Không có gói nào khớp bộ lọc. Hãy nới rộng số ngày hoặc bỏ bớt điều kiện.'});
    await chrome.alarms.clear(TIMEOUT_PREFIX+scan.id).catch(()=>{});
    return;
  }

  let tab=null;
  if(Number.isInteger(scan.tabId)){
    try{const own=await chrome.tabs.get(scan.tabId);if(isEgpUrl(own.url))tab=own;}catch{}
  }
  if(!tab)[tab]=await chrome.tabs.query({url:'https://muasamcong.mpi.gov.vn/*'});
  if(!tab){
    await setScan({status:'ERROR',finishedAt:new Date().toISOString(),
      message:'Không còn tab e-GP nào đang mở để đọc biên bản.'});
    await chrome.alarms.clear(TIMEOUT_PREFIX+scan.id).catch(()=>{});
    return;
  }

  /* BỎ QUA GÓI ĐÃ ĐỌC RỒI.
   *
   * Mỗi gói phải mở riêng một trang rồi chờ bảng nhà thầu tải xong — đây là
   * toàn bộ chi phí thời gian của chức năng này. Dò lần hai trên cùng địa bàn
   * mà đọc lại từ đầu là lãng phí thẳng vào mặt người dùng: họ ngồi chờ lại
   * đúng những gói đã biết kết quả.
   *
   * Kho quan sát đã ghi gói nào từng đọc được bảng nhà thầu (nguồn 'bbmt'),
   * nên chỉ cần đối chiếu là bỏ qua được.
   */
  const daDoc=new Set();
  {
    const st0=await getState();
    for(const o of (st0.observations||[])){
      if(o&&o.source==='bbmt'&&o.notifyNo)daDoc.add(String(o.notifyNo));
    }
  }
  /* Khi ĐI DÒ GÓI TRƯỢT: gói mà chính nhà thầu này đã trúng thì không cần mở
     ra đọc — kết quả đã biết chắc từ KQLCNT, đọc thêm không đổi được gì mà
     vẫn tốn đúng ngần ấy thời gian chờ trang tải. */
  if(scan.mode==='loss'&&scan.focusTaxCode){
    const st1=await getState();
    for(const o of (st1.observations||[])){
      if(o&&o.won===true&&String(o.taxCode||'')===scan.focusTaxCode&&o.notifyNo){
        daDoc.add(String(o.notifyNo));
      }
    }
  }

  const canDoc=list.filter(p=>!daDoc.has(String(p.notifyNo)));
  const boQua=list.length-canDoc.length;

  const activated=await withLock(async()=>{
    const current=(await getState()).bidOpenScan;
    const kind=lookupKind('bidOpenScan');
    if(!current||current.id!==scan.id||current.cancelled||!isLookupActive(kind,current))return false;
    await save({[KEYS.bidOpenScan]:{...current,status:'SCANNING',totalCandidates:canDoc.length,
      message:canDoc.length
        ?`Đang đọc biên bản mở thầu của ${canDoc.length} gói`
          +(boQua?` (bỏ qua ${boQua} gói đã đọc lần trước)`:'')+'...'
        :`Cả ${list.length} gói đều đã đọc ở lượt trước, không phải đọc lại.`}});
    return true;
  });
  if(!activated)return;
  await chrome.alarms.create(TIMEOUT_PREFIX+scan.id,{when:Date.now()+BBMT_DETAIL_ALARM_MS});

  if(!canDoc.length){ await finalizeBidOpenScan(); return; }

  for(let i=0;i<canDoc.length;i++){
    if(bbmtCancelled)break;
    const pkg=canDoc[i];
    await setScan({scannedCount:i,expectedNotifyNo:pkg.notifyNo,
      message:`Đang đọc biên bản ${i+1}/${canDoc.length}: ${pkg.notifyNo}...`});
    // Alarm bền qua vòng đời service worker. Nếu waiter RAM mất do worker bị
    // dọn, alarm sẽ chốt ERROR/PARTIAL thay vì để SCANNING treo vô hạn.
    await chrome.alarms.create(TIMEOUT_PREFIX+scan.id,{when:Date.now()+BBMT_DETAIL_ALARM_MS});
    let rows=null;
    try{
      rows=await openBbmtDetail(tab.id,pkg,scan.id);
    }catch{ rows=null; }
    await recordBidders(scan.id,pkg.key,rows,pkg.bidPrice);
    if(i+1<canDoc.length&&!bbmtCancelled)await new Promise(r=>setTimeout(r,BBMT_DETAIL_PAUSE));
  }

  await finalizeBidOpenScan();
}

/** Mở một trang biên bản và chờ content script gửi về bảng nhà thầu. */
function openBbmtDetail(tabId,pkg,scanId){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{bbmtWaiter=null;resolve(null);},BBMT_DETAIL_TIMEOUT);
    bbmtWaiter={scanId,tabId,notifyNo:pkg.notifyNo,resolve:rows=>{clearTimeout(timer);bbmtWaiter=null;resolve(rows);}};
    chrome.tabs.update(tabId,{url:pkg.detailUrl}).catch(e=>{
      clearTimeout(timer);bbmtWaiter=null;reject(e);
    });
  });
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
    const s=await getState();
    const list=s.endpointMap||[];
    const key=method+' '+path;
    if(list.some(x=>x.key===key))return {ok:true,duplicate:true};
    const row={key,path,method,
      status:Number(payload.status)||0,
      kieu:String(payload.kieu||''),
      soBanGhi:payload.soBanGhi==null?null:Number(payload.soBanGhi),
      truong:(payload.truong||[]).slice(0,40).map(x=>String(x).slice(0,60)),
      trang:String(payload.trang||'').slice(0,200),
      luc:payload.luc||new Date().toISOString()};
    // Giữ 80 endpoint gần nhất là quá đủ để dựng bản đồ một cổng thông tin.
    await save({[KEYS.endpointMap]:[row,...list].slice(0,80)});
    return {ok:true};
  });
}

async function onBbmtBidders(payload={},senderTabId=null){
  if(!bbmtWaiter||bbmtWaiter.tabId!==senderTabId)return {ok:false,ignored:true};
  const notifyNo=notifyNoFromUrl(payload.url||'');
  if(bbmtWaiter&&(!notifyNo||notifyNo===bbmtWaiter.notifyNo)){
    bbmtWaiter.resolve(payload.rows||[]);
  }
  return {ok:true};
}

async function recordBidders(scanId,key,rows,packageBidPrice){
  return withLock(async()=>{
    const s=await getState();
    const scan=s.bidOpenScan;
    if(!scan||scan.id!==scanId)return;
    const packages=(scan.packages||[]).map(p=>p.key!==key?p:({
      ...p,
      bidders:rows===null?null:normalizeBidderTable(rows,packageBidPrice),
      scannedAt:new Date().toISOString()
    }));
    await save({[KEYS.bidOpenScan]:{...scan,packages}});
    // Tich luy vao kho quan sat de phan tich lau dai.
    const done=packages.find(p=>p.key===key);
    if(done&&done.bidders&&done.bidders.length)obsQueue.push(...observationsFromBidOpen(done));
  });
}

async function finalizeBidOpenScan(){
  await flushObservations();
  let finishedId=null;
  const result=await withLock(async()=>{
    const s=await getState();
    const scan=s.bidOpenScan;
    if(!isLookupActive(lookupKind('bidOpenScan'),scan))return;
    finishedId=scan.id;
    const summary=summarizeBidOpenings(scan.packages,scan.focusTaxCode,scan.contractorQuery);
    const failed=(scan.packages||[]).filter(p=>p.bidders===null&&p.scannedAt).length;
    await save({[KEYS.bidOpenScan]:{...scan,
      status:scan.partial?'PARTIAL':'SUCCESS',finishedAt:new Date().toISOString(),
      cancelled:bbmtCancelled,summary,failedCount:failed,
      scannedCount:summary.scanned,
      message:bbmtCancelled
        ?`Đã dừng: đọc được ${summary.scanned}/${(scan.packages||[]).length} gói.`
        :scan.partial
          ?`Hoàn tất một phần: danh sách e-GP bị gián đoạn; đã đọc ${summary.scanned} biên bản trong phần dữ liệu nhận được.`
        :`Xong: đọc ${summary.scanned} biên bản${failed?`, ${failed} gói e-GP không trả dữ liệu`:''}.`
    }});
  });
  if(finishedId)await chrome.alarms.clear(TIMEOUT_PREFIX+finishedId).catch(()=>{});
  return result;
}

async function cancelBidOpenScan(){
  bbmtCancelled=true;
  if(bbmtWaiter)bbmtWaiter.resolve(null);
  await setScan({message:'Đang dừng sau khi đọc nốt gói hiện tại...'});
  return {ok:true};
}

async function exportBidOpenCsv(){
  const s=await getState();
  const list=(s.bidOpenScan&&s.bidOpenScan.packages)||[];
  const rows=[];
  for(const p of list){
    for(const b of (p.bidders||[])){
      rows.push({
        notifyNoStand:p.notifyNoStand,bidName:p.bidName,investorName:p.investorName,
        location:p.location,stageLabel:p.stageLabel,
        openDate:formatDate(p.bidRealityOpenDate||p.publicDateKqmt),
        bidPrice:numOrNull(p.bidPrice),priceRank:numOrNull(b.priceRank),
        name:b.name,taxCode:b.taxCode,ventureName:b.ventureName,
        bidderPrice:numOrNull(b.bidPrice),discountPercent:numOrNull(b.discountPercent),
        finalPrice:numOrNull(b.finalPrice),vsPackageRate:numOrNull(b.vsPackageRate),
        detailUrl:p.detailUrl
      });
    }
  }
  if(!rows.length)throw new Error('Chưa có dữ liệu nhà thầu để xuất.');
  return downloadXlsx(`GiaoSuCuiBap/Bien-ban-mo-thau-${stamp()}.xlsx`,{
    sheetName:'Biên bản mở thầu',
    columns:[
      {header:'Mã TBMT',key:'notifyNoStand',width:18},
      {header:'Tên gói thầu',key:'bidName',width:52},
      {header:'Chủ đầu tư',key:'investorName',width:36},
      {header:'Địa điểm',key:'location',width:26},
      {header:'Trạng thái',key:'stageLabel',width:20},
      {header:'Ngày mở thầu',key:'openDate',width:16},
      {header:'Giá gói thầu',key:'bidPrice',type:'money',width:20},
      {header:'Hạng giá',key:'priceRank',type:'number',width:10},
      {header:'Nhà thầu',key:'name',width:38},
      {header:'Mã số thuế',key:'taxCode',width:14},
      {header:'Liên danh',key:'ventureName',width:30},
      {header:'Giá dự thầu',key:'bidderPrice',type:'money',width:20},
      {header:'Giảm giá tự khai',key:'discountPercent',type:'percent',width:16},
      {header:'Giá sau giảm giá',key:'finalPrice',type:'money',width:20},
      {header:'So với giá gói thầu',key:'vsPackageRate',type:'percent',width:18},
      {header:'Link e-GP',key:'detailUrl',type:'url',width:44}
    ],
    rows
  });
}

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

async function getAreas({refresh=false}={}){
  const store=await chrome.storage.local.get({[KEYS.areas]:null});
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
  const res=await getAreas({refresh:Boolean(payload.refresh)});
  if(!res.ok)return res;
  return {
    ok:true,
    fromCache:res.fromCache,
    stale:Boolean(res.stale),
    fetchedAt:res.areas.fetchedAt,
    provinces:currentProvinceNames(res.areas),
    wards:wardNamesForProvince(res.areas,payload.province||'')
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
async function agentStatus(){
  try{
    await fetch(AGENT_ORIGIN,{method:'GET',mode:'no-cors'});
    return {ok:true,running:true};
  }catch(error){
    return {ok:true,running:false,uncertain:true,message:AGENT_MISSING_MESSAGE};
  }
}

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
async function downloadAttachments(payload={}){
  const files=Array.isArray(payload.files)?payload.files:[];
  if(!files.length)return {ok:false,message:'Chưa chọn tệp nào để tải.'};

  // KHÔNG dò phần mềm hỗ trợ trước nữa — phép dò đó báo sai vì CORS (xem ghi
  // chú ở agentStatus). Cứ tải thẳng; nếu hỏng thì confirmDownload nói rõ.
  const done=[];
  const failed=[];
  for(const f of files){
    if(!f||!f.fileId){failed.push({file:f,message:'Thiếu mã tệp.'});continue;}
    try{
      const id=await chrome.downloads.download({
        url:agentDownloadUrl(f.fileId),
        filename:`GiaoSuCuiBap/HoSo/${safeDownloadName(f.notifyNo||payload.notifyNo,f)}`,
        saveAs:false,
        conflictAction:'uniquify'
      });
      // Chrome trả mã tải ngay cả khi phần mềm hỗ trợ từ chối. Phải soát lại
      // trạng thái, nếu không sẽ báo "đã tải xong" trong khi tệp hỏng —
      // đúng kiểu thất bại im lặng mà cả bản này đang dọn.
      const state=await confirmDownload(id);
      if(state.ok)done.push(f.fileName||f.fileId);
      else failed.push({file:f.fileName||f.fileId,message:state.message});
    }catch(error){
      failed.push({file:f.fileName||f.fileId,message:String(error?.message||error)});
    }
    // Nghỉ ngắn giữa các tệp để không dồn phần mềm hỗ trợ.
    await new Promise(r=>setTimeout(r,250));
  }
  if(!failed.length){
    return {ok:true,downloaded:done.length,failed:[],
      message:`Đã tải ${done.length} tệp vào thư mục Tải xuống › GiaoSuCuiBap/HoSo.`};
  }
  // Nêu ĐÚNG lý do của tệp hỏng đầu tiên. Chỉ đếm số tệp lỗi thì người dùng
  // không biết phải làm gì tiếp.
  return {ok:false,downloaded:done.length,failed,
    message:done.length
      ?`Đã tải ${done.length} tệp; ${failed.length} tệp lỗi — ${failed[0].message}`
      :failed[0].message};
}

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
  if(live&&live.focusTaxCode===taxCode&&(live.packages||[]).length){
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
async function exportProfileXlsx(payload={}){
  const res=await getContractorProfile(payload);
  if(!res.ok)throw new Error(res.message);
  const p=res.profile;
  const w=p.won;
  const nm=safeFilename(p.contractorName||p.taxCode);

  const overview=[
    {k:'Nhà thầu',v:p.contractorName,note:''},
    {k:'Mã số thuế',v:p.taxCode,note:''},
    {k:'Số gói đã TRÚNG',v:w.wonCount,note:'Đầy đủ — hỏi e-GP theo MST'},
    {k:'  trong đó trúng độc lập',v:w.soloCount,note:''},
    {k:'  trong đó trúng liên danh',v:w.ventureCount,note:''},
    {k:'Giá trị trúng độc lập',v:w.soloValue,note:'Đầy đủ'},
    {k:'Giá trị gói liên danh',v:w.ventureValue,note:'Để riêng — e-GP không công bố tỷ lệ góp vốn'},
    {k:'Giảm giá trung vị (%)',v:w.discount.median,note:`trên ${w.discount.n} gói có đủ giá`},
    {k:'Số gói ĐÃ QUÉT thấy dự thầu',v:p.participation.scannedCount,note:'Một phần — chỉ trong dữ liệu đã quét'},
    {k:'  đã trúng',v:p.participation.won,note:'Một phần'},
    {k:'  đã trượt',v:p.participation.lost,note:'Một phần'},
    {k:'  chưa có kết quả',v:p.participation.pending,note:'Một phần'},
    {k:'  bị hủy',v:p.participation.cancelled,note:'Một phần'},
    {k:'Tỷ lệ trúng trong phạm vi đã quét',v:p.participation.winRate.text,
     note:`trên ${p.participation.decidedCount} gói đã có kết quả — KHÔNG phải tỷ lệ trúng thật`}
  ].map(r=>({k:r.k,v:typeof r.v==='number'?r.v:String(r.v===null||r.v===undefined?'':r.v),note:r.note}));

  return downloadXlsx(`GiaoSuCuiBap/Ho-so-360-${nm}-${stamp()}.xlsx`,{sheets:[
    {sheetName:'Tổng quan',
     columns:[{header:'Chỉ tiêu',key:'k',width:38},{header:'Giá trị',key:'v',width:30},
              {header:'Độ đầy đủ',key:'note',width:46}],
     rows:overview},

    {sheetName:'Theo năm',
     columns:[{header:'Năm',key:'year',width:10},{header:'Số gói trúng',key:'won',type:'number',width:14},
              {header:'Giá trị trúng',key:'value',type:'money',width:22},
              {header:'Giảm giá trung vị',key:'median',type:'percent',width:18}],
     rows:w.years.map(y=>({year:y.year,won:y.won,value:numOrNull(y.value),median:y.discount.median}))},

    {sheetName:'Tỉnh - Thành phố',
     columns:[{header:'Tỉnh/Thành phố',key:'name',width:34},{header:'Số gói',key:'count',type:'number',width:11},
              {header:'Giá trị',key:'value',type:'money',width:22}],
     rows:w.provinces.map(x=>({name:x.name,count:x.count,value:numOrNull(x.value)}))},

    {sheetName:'Bên mời thầu',
     columns:[{header:'Bên mời thầu',key:'name',width:48},{header:'Số gói',key:'count',type:'number',width:11},
              {header:'Giá trị',key:'value',type:'money',width:22}],
     rows:w.entities.map(x=>({name:x.name,count:x.count,value:numOrNull(x.value)}))},

    {sheetName:'Danh sách gói đã trúng',
     columns:[
       {header:'Mã TBMT',key:'notifyNoStand',width:18},
       {header:'Vai trò',key:'role',width:12},
       {header:'Tên gói thầu',key:'bidName',width:52},
       {header:'Bên mời thầu',key:'entity',width:38},
       {header:'Địa điểm',key:'location',width:30},
       {header:'Giá gói thầu/dự toán',key:'priceBasis',type:'money',width:21},
       {header:'Giá trúng thầu',key:'winningPrice',type:'money',width:20},
       {header:'Tỷ lệ giảm giá',key:'discountRate',type:'percent',width:15},
       {header:'Lĩnh vực',key:'fieldLabel',width:14},
       {header:'Hình thức',key:'bidFormLabel',width:22},
       {header:'Ngày phê duyệt',key:'decisionDate',width:16},
       {header:'Link e-GP',key:'detailUrl',type:'url',width:44}],
     rows:w.packages.map(x=>({
       notifyNoStand:x.notifyNoStand,role:x.isVenture?'Liên danh':'Độc lập',
       bidName:x.bidName,entity:x.procuringEntityName||x.investorName,location:x.location,
       priceBasis:numOrNull(x.priceBasis),winningPrice:numOrNull(x.winningPrice),
       discountRate:numOrNull(x.discountRate),fieldLabel:x.fieldLabel,bidFormLabel:x.bidFormLabel,
       decisionDate:formatDate(x.decisionDate),detailUrl:x.detailUrl}))}
  ]});
}

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
    const s=await getState();
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
  const mode=payload.codes&&payload.codes.length?'profile':'discover';
  const keyword=String(payload.keyword||'').trim();
  const province=String(payload.province||'').trim();
  const codes=(payload.codes||[]).map(c=>String(c||'').trim()).filter(Boolean);

  if(mode==='discover'&&!keyword){
    return {ok:false,message:'Hãy gõ vài chữ trong tên chủ đầu tư — ví dụ "Đức Linh", "chi cục thủy lợi".'};
  }

  const provinces=await provinceCodesFor(province);
  if(province&&!provinces.length){
    return {ok:false,message:`Không nhận ra tỉnh/thành "${province}". Hãy chọn từ danh sách gợi ý.`};
  }

  const query=mode==='profile'
    ? buildInvestorProfileQuery({codes})
    : buildInvestorDiscoveryQuery({keyword,provinces});
  if(!query)return {ok:false,message:'Chưa đủ tiêu chí để dựng truy vấn.'};

  const id=newLookupId();
  const label=mode==='profile'
    ? `chủ đầu tư ${payload.name||codes.join(', ')}`
    : `dò chủ đầu tư "${keyword}"`;

  const scan={
    id,mode,
    criteria:{keyword,province,provinces,codes,name:String(payload.name||'')},
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
    await dispatchLookupToTab(tab.id,{
      id,mode:'investor',label,
      query,pageSize:PAGE_SIZE,
      /* Bước DÒ chỉ cần đủ mẫu để liệt kê các đơn vị khớp — lấy 6 trang (300
         bản ghi) là đã đủ nhận diện, mà không bắt người dùng chờ hàng nghìn
         gói chỉ để chọn tên. Bước HỒ SƠ thì lấy hết. */
      maxPages:mode==='profile'?0:6
    });
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
    const s=await getState();
    const scan=s.investorScan;
    if(!scan||scan.id!==payload.planId)return {ok:false};

    const rows=Array.isArray(payload.records)?payload.records:[];
    const found=rows.map(r=>normalizeKqlcntRecord(r)).filter(Boolean);
    const next={...scan,
      packages:dedupeKqlcnt([...(scan.packages||[]),...found]),
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
        next.status=next.rowsSeen>0?'ERROR':'SUCCESS';
        next.message=next.rowsSeen>0
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
async function exportInvestorXlsx(){
  const s=await getState();
  const scan=s.investorScan;
  const sum=scan&&scan.summary;
  if(!sum)throw new Error('Chưa có hồ sơ chủ đầu tư để xuất. Hãy chọn một đơn vị rồi chạy hồ sơ trước.');
  const nm=safeFilename(scan.criteria.name||scan.criteria.codes.join('-')||'chu-dau-tu');

  const overview=[
    {k:'Chủ đầu tư',v:scan.criteria.name||'',note:''},
    {k:'Mã định danh',v:(scan.criteria.codes||[]).join(', '),note:''},
    {k:'Số gói đã tổ chức (có kết quả)',v:sum.packageCount,note:'Đầy đủ'},
    {k:'Số nhà thầu đã TRÚNG',v:sum.contractorCount,note:'Đầy đủ — đếm theo mã số thuế'},
    {k:'Tổng lượt nhà thầu tham dự',v:sum.joinTotal,note:'e-GP ghi sẵn từng gói'},
    {k:'  số gói e-GP ghi 0 người dự',v:sum.joinZeroCount,note:'thường là chỉ định thầu rút gọn'},
    {k:'  số gói có từ 2 nhà thầu trở lên',v:sum.competitiveCount,note:''},
    {k:'Trung bình nhà thầu/gói',v:sum.joinAverage,note:''},
    {k:'Giá trị trúng độc lập',v:sum.soloValue,note:'Đầy đủ'},
    {k:'Giá trị gói liên danh',v:sum.ventureValue,note:'Để riêng — e-GP không công bố tỷ lệ góp vốn'},
    {k:'Giảm giá trung vị (%)',v:sum.discount.median,note:`trên ${sum.discount.n} gói có đủ giá`},
    {k:'Mức tập trung (HHI)',v:sum.concentration.value,note:sum.concentration.level||''},
    {k:'Nhà thầu trúng nhiều nhất',v:sum.topContractor?(sum.topContractor.name||sum.topContractor.taxCode):'',note:''},
    {k:'  tỷ trọng số gói',v:sum.topShare.text,note:`trên ${sum.topShare.n} gói`}
  ].map(r=>({k:r.k,v:typeof r.v==='number'?r.v:String(r.v===null||r.v===undefined?'':r.v),note:r.note}));

  return downloadXlsx(`GiaoSuCuiBap/Ho-so-chu-dau-tu-${nm}-${stamp()}.xlsx`,{sheets:[
    {sheetName:'Tổng quan',
     columns:[{header:'Chỉ tiêu',key:'k',width:36},{header:'Giá trị',key:'v',width:34},
              {header:'Ghi chú',key:'note',width:44}],
     rows:overview},

    {sheetName:'Nhà thầu đã trúng',
     columns:[
       {header:'Nhà thầu',key:'name',width:44},
       {header:'Mã số thuế',key:'taxCode',width:14},
       {header:'Số gói trúng',key:'packages',type:'number',width:13},
       {header:'Tỷ trọng số gói',key:'share',type:'percent',width:16},
       {header:'Độc lập',key:'soloCount',type:'number',width:10},
       {header:'Liên danh',key:'ventureCount',type:'number',width:11},
       {header:'Giá trị độc lập',key:'soloValue',type:'money',width:20},
       {header:'Giá trị liên danh',key:'ventureValue',type:'money',width:20},
       {header:'Giảm giá trung vị',key:'discountMedian',type:'percent',width:17},
       {header:'Năm',key:'years',width:20}],
     rows:sum.contractors.map(c=>({
       name:c.name,taxCode:c.taxCode,packages:c.packages,share:c.share.value,
       soloCount:c.soloCount,ventureCount:c.ventureCount,
       soloValue:numOrNull(c.soloValue),ventureValue:numOrNull(c.ventureValue),
       discountMedian:c.discount.median,years:(c.years||[]).join(', ')}))},

    {sheetName:'Theo năm',
     columns:[{header:'Năm',key:'key',width:10},{header:'Số gói',key:'packages',type:'number',width:11},
              {header:'Giá trị trúng',key:'value',type:'money',width:22},
              {header:'Giảm giá trung vị',key:'median',type:'percent',width:18}],
     rows:sum.byYear.map(x=>({key:x.key,packages:x.packages,value:numOrNull(x.value),median:x.discount.median}))},

    {sheetName:'Theo hình thức',
     columns:[{header:'Hình thức LCNT',key:'key',width:26},{header:'Số gói',key:'packages',type:'number',width:11},
              {header:'Giá trị trúng',key:'value',type:'money',width:22},
              {header:'Giảm giá trung vị',key:'median',type:'percent',width:18}],
     rows:sum.byForm.map(x=>({key:x.key,packages:x.packages,value:numOrNull(x.value),median:x.discount.median}))},

    {sheetName:'Danh sách gói thầu',
     columns:[
       {header:'Mã TBMT',key:'notifyNoStand',width:18},
       {header:'Tên gói thầu',key:'bidName',width:52},
       {header:'Nhà thầu trúng',key:'winnerName',width:38},
       {header:'Số nhà thầu dự',key:'numBidderJoin',type:'number',width:14},
       {header:'Giá gói thầu/dự toán',key:'priceBasis',type:'money',width:21},
       {header:'Giá trúng thầu',key:'winningPrice',type:'money',width:20},
       {header:'Tỷ lệ giảm giá',key:'discountRate',type:'percent',width:15},
       {header:'Lĩnh vực',key:'fieldLabel',width:14},
       {header:'Hình thức',key:'bidFormLabel',width:22},
       {header:'Địa điểm',key:'location',width:30},
       {header:'Ngày phê duyệt',key:'decisionDate',width:16},
       {header:'Link e-GP',key:'detailUrl',type:'url',width:44}],
     rows:sum.packages.map(p=>({
       notifyNoStand:p.notifyNoStand,bidName:p.bidName,winnerName:p.winnerName,
       numBidderJoin:numOrNull(p.numBidderJoin),
       priceBasis:numOrNull(p.priceBasis),winningPrice:numOrNull(p.winningPrice),
       discountRate:numOrNull(p.discountRate),fieldLabel:p.fieldLabel,bidFormLabel:p.bidFormLabel,
       location:p.location,decisionDate:formatDate(p.decisionDate),detailUrl:p.detailUrl}))}
  ]});
}

async function startAreaScan(payload={}){
  const ward=String(payload.ward||'').trim();
  const province=String(payload.province||'').trim();
  if(!ward)return {ok:false,message:'Hãy chọn hoặc nhập tên Xã/Phường (hoặc tên huyện cũ).'};

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

  const query=buildWardMarketQuery({ward,...filters});
  if(!query)return {ok:false,message:`Không đọc được tên địa danh từ "${ward}".`};

  const id=newLookupId();
  const scan={
    id,criteria:{ward,province,...filters},
    label:`địa bàn "${ward}"`,
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
    await dispatchLookupToTab(tab.id,{
      id,mode:'area',label:scan.label,
      query,pageSize:PAGE_SIZE,
      maxPages:0   // lấy hết
    });
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
    const s=await getState();
    const scan=s.areaScan;
    if(!scan||scan.id!==payload.planId)return {ok:false};

    const rows=Array.isArray(payload.records)?payload.records:[];
    const found=rows.map(r=>normalizeKqlcntRecord(r)).filter(Boolean);
    const next={...scan,
      packages:dedupeKqlcnt([...(scan.packages||[]),...found]),
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

async function exportAreaXlsx(){
  const s=await getState();
  const scan=s.areaScan;
  const sum=scan&&scan.summary;
  if(!sum||!sum.pairs.length)throw new Error('Chưa có kết quả soi địa bàn để xuất.');
  const pr=scan.pricing||null;
  const name=safeFilename(scan.criteria.ward||'dia-ban');

  // Một sổ NHIỀU TRANG thay vì nhiều tệp rời: mở một lần là thấy đủ các góc
  // nhìn, và các trang tham chiếu chéo được nhau ngay trong Excel.
  const sheets=[];

  sheets.push({
    sheetName:'Quan hệ CĐT - Nhà thầu',
    columns:[
      {header:'Chủ đầu tư',key:'investorName',width:40},
      {header:'Nhà thầu',key:'contractorName',width:40},
      {header:'Mã số thuế',key:'taxCode',width:14},
      {header:'Số gói trúng',key:'packages',type:'number',width:13},
      {header:'Tỷ trọng gói của CĐT',key:'share',type:'percent',width:19},
      {header:'Giá trị trúng độc lập',key:'soloValue',type:'money',width:21},
      {header:'Giá trị gói liên danh',key:'ventureValue',type:'money',width:21},
      {header:'Giảm giá trung vị',key:'discountMedian',type:'percent',width:17},
      {header:'Số gói có giá',key:'discountN',type:'number',width:13},
      {header:'Năm hoạt động',key:'years',width:22}
    ],
    rows:sum.pairs.map(p=>({
      investorName:p.investorName,contractorName:p.contractorName,taxCode:p.taxCode,
      packages:p.packages,share:p.shareOfInvestor.value,
      soloValue:numOrNull(p.soloValue),ventureValue:numOrNull(p.ventureValue),
      discountMedian:p.discount.median,discountN:p.discount.n,
      years:(p.years||[]).join(', ')
    }))
  });

  sheets.push({
    sheetName:'Theo nhà thầu',
    columns:[
      {header:'Nhà thầu',key:'name',width:42},
      {header:'Mã số thuế',key:'taxCode',width:14},
      {header:'Số gói trúng',key:'packages',type:'number',width:13},
      {header:'Trúng độc lập',key:'soloCount',type:'number',width:13},
      {header:'Trúng liên danh',key:'ventureCount',type:'number',width:15},
      {header:'Giá trị độc lập',key:'soloValue',type:'money',width:20},
      {header:'Giá trị liên danh',key:'ventureValue',type:'money',width:20},
      {header:'Giảm giá trung vị',key:'discountMedian',type:'percent',width:17},
      {header:'Số chủ đầu tư',key:'investorCount',type:'number',width:14},
      {header:'Từ năm',key:'firstYear',type:'number',width:10},
      {header:'Đến năm',key:'lastYear',type:'number',width:10}
    ],
    rows:sum.contractors.map(c=>({
      name:c.name,taxCode:c.taxCode,packages:c.packages,
      soloCount:c.soloCount,ventureCount:c.ventureCount,
      soloValue:numOrNull(c.soloValue),ventureValue:numOrNull(c.ventureValue),
      discountMedian:c.discount.median,investorCount:c.investorCount,
      firstYear:c.firstYear,lastYear:c.lastYear
    }))
  });

  sheets.push({
    sheetName:'Theo chủ đầu tư',
    columns:[
      {header:'Chủ đầu tư',key:'investorName',width:44},
      {header:'Số gói',key:'packages',type:'number',width:10},
      {header:'Số nhà thầu',key:'contractorCount',type:'number',width:13},
      {header:'Tổng giá trị',key:'totalValue',type:'money',width:20},
      {header:'Nhà thầu trúng nhiều nhất',key:'topName',width:38},
      {header:'Tỷ trọng',key:'topShare',type:'percent',width:12},
      {header:'Mức tập trung (HHI)',key:'hhi',type:'number',width:18},
      {header:'Đánh giá',key:'level',width:16}
    ],
    rows:sum.investors.map(i=>({
      investorName:i.investorName,packages:i.packages,contractorCount:i.contractorCount,
      totalValue:numOrNull(i.totalValue),
      topName:i.topContractor?(i.topContractor.name||i.topContractor.taxCode):'',
      topShare:i.topShare.value,hhi:i.concentration.value,level:i.concentration.level||''
    }))
  });

  if(pr){
    sheets.push({
      sheetName:'Giá thị trường',
      columns:[
        {header:'Nhóm',key:'group',width:22},
        {header:'Phân theo',key:'label',width:26},
        {header:'Số gói',key:'n',type:'number',width:10},
        {header:'Giảm ít nhất',key:'min',type:'percent',width:14},
        {header:'Tứ phân vị 1',key:'q1',type:'percent',width:14},
        {header:'Trung vị',key:'median',type:'percent',width:12},
        {header:'Tứ phân vị 3',key:'q3',type:'percent',width:14},
        {header:'Giảm nhiều nhất',key:'max',type:'percent',width:16},
        {header:'Tổng giá trị trúng',key:'totalValue',type:'money',width:20},
        {header:'Đủ mẫu tin cậy',key:'reliable',width:18}
      ],
      rows:[
        ...pr.byBand.map(x=>({group:'Khoảng giá',...priceRow(x)})),
        ...pr.byField.map(x=>({group:'Lĩnh vực',...priceRow(x)})),
        ...pr.byForm.map(x=>({group:'Hình thức LCNT',...priceRow(x)})),
        ...pr.byYear.map(x=>({group:'Năm phê duyệt',...priceRow(x)}))
      ]
    });
  }

  sheets.push({
    sheetName:'Danh sách gói thầu',
    columns:[
      {header:'Mã TBMT',key:'notifyNoStand',width:18},
      {header:'Tên gói thầu',key:'bidName',width:52},
      {header:'Chủ đầu tư',key:'investorName',width:38},
      {header:'Nhà thầu trúng',key:'winnerName',width:38},
      {header:'Giá gói thầu/dự toán',key:'priceBasis',type:'money',width:21},
      {header:'Giá trúng thầu',key:'winningPrice',type:'money',width:20},
      {header:'Tỷ lệ giảm giá',key:'discountRate',type:'percent',width:15},
      {header:'Lĩnh vực',key:'fieldLabel',width:14},
      {header:'Hình thức',key:'bidFormLabel',width:22},
      {header:'Ngày phê duyệt',key:'decisionDate',width:16},
      {header:'Link e-GP',key:'detailUrl',type:'url',width:44}
    ],
    rows:(scan.packages||[]).map(p=>({
      notifyNoStand:p.notifyNoStand,bidName:p.bidName,investorName:p.investorName,
      winnerName:p.winnerName,priceBasis:numOrNull(p.priceBasis),
      winningPrice:numOrNull(p.winningPrice),discountRate:numOrNull(p.discountRate),
      fieldLabel:p.fieldLabel,bidFormLabel:p.bidFormLabel,
      decisionDate:formatDate(p.decisionDate),detailUrl:p.detailUrl
    }))
  });

  return downloadXlsx(`GiaoSuCuiBap/Soi-dia-ban-${name}-${stamp()}.xlsx`,{sheets});
}

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
  const investor=String(payload.investor||'').trim();
  const province=String(payload.province||'').trim();
  const ward=String(payload.ward||'').trim();
  const keyword=String(payload.keyword||'').trim();
  /* Với bản ghi KHLCNT, e-GP lọc được CẢ địa bàn ở phía máy chủ — đã đo:
     locations.provCode cho đúng Lâm Đồng, locations.districtCode cho 108 kế
     hoạch của Xã Hàm Thạnh. Nên chỉ chọn tỉnh cũng tra được, không còn bắt
     buộc nhập chủ đầu tư như bản trước. */
  if(!investor&&!keyword&&!province&&!ward){
    return {ok:false,message:'Hãy nhập ít nhất một tiêu chí: Chủ đầu tư, Tỉnh/Thành phố, Xã/Phường hoặc từ khoá.'};
  }

  // Quy TÊN địa bàn ra MÃ. Tỉnh phải lấy đủ mọi mã cùng tên (68 + 703).
  let provinces=[],wards=[];
  if(province||ward){
    const areas=(await getAreas({})).areas;
    if(areas){
      if(province){
        provinces=provinceCodesByName(areas.provinces,province);
        if(!provinces.length){
          return {ok:false,message:`Không nhận ra tỉnh/thành "${province}". Hãy chọn từ danh sách gợi ý.`};
        }
      }
      if(ward){
        wards=wardCodesByName(areas,province,ward);
        if(!wards.length&&!investor&&!keyword&&!provinces.length){
          return {ok:false,message:`Không nhận ra xã/phường "${ward}". Hãy chọn tỉnh trước rồi chọn từ danh sách gợi ý.`};
        }
      }
    }
  }

  const id=newLookupId();
  const label=[investor&&`CĐT "${investor}"`,ward&&`xã/phường "${ward}"`,province&&!ward&&`tỉnh "${province}"`]
    .filter(Boolean).join(' · ')||`từ khoá "${keyword}"`;

  const lookup={
    id,criteria:{investor,province,ward,keyword,provinces,wards},label,
    status:'RUNNING',message:'Đang hỏi e-GP các kế hoạch của chủ đầu tư này...',
    startedAt:new Date().toISOString(),finishedAt:null,
    plans:[],totalElements:0,serverCount:0,areaDropped:0,
    cancelled:false,applied:null,mismatched:[]
  };
  const claimed=await claimLookupJob('planLookup',lookup);
  if(!claimed.ok)return {ok:false,message:'Một lượt tra kế hoạch đang chạy. Hãy chờ hoặc bấm Dừng trước khi tra lại.',lookup:claimed.current};

  try{
    const tab=await ensureEgpSearchTab(payload.focusTab!==false);
    const bound=await bindLookupTab('planLookup',id,tab.id);
    await dispatchLookupToTab(tab.id,{
      id,mode:'khlcnt',label,
      // Tự dựng truy vấn, KHÔNG chạm vào biểu mẫu e-GP nữa. Tỉnh và xã/phường
      // được lọc tại chỗ ở ingestPlanPage.
      query:buildKhlcntQuery({investor,keyword,provinces,wards}),
      pageSize:PAGE_SIZE,
      /* Có chủ đầu tư / từ khoá / xã thì phạm vi đã hẹp -> lấy hết.
         CHỈ lọc tỉnh thì có thể hơn 10.000 kế hoạch, tải hết sẽ rất lâu, nên
         chặn ở 40 trang (2.000 kế hoạch) và nói rõ với người dùng. */
      maxPages:(investor||keyword||wards.length)?0:40
    });
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
    const s=await getState();
    const lookup=s.planLookup;
    if(!lookup||lookup.id!==payload.planId)return {ok:false};

    const rows=Array.isArray(payload.records)?payload.records:[];
    const all=rows.map(normalizeKhlcntPlan).filter(Boolean);
    // Lọc tỉnh/xã ngay tại đây thay vì nhờ biểu mẫu e-GP. `dropped` được đếm
    // để giao diện nói rõ đã bỏ bao nhiêu bản ghi lệch địa bàn.
    const {kept,dropped}=filterPlansByArea(all,lookup.criteria||{});
    const next={...lookup,
      plans:dedupeKhlcnt([...(lookup.plans||[]),...kept]),
      serverCount:Number(lookup.serverCount||0)+all.length,
      areaDropped:Number(lookup.areaDropped||0)+dropped.length,
      totalElements:Number(payload.totalElements||lookup.totalElements||0)};
    next.message=`Đã xét ${next.serverCount}/${next.totalElements||next.serverCount} kế hoạch, khớp địa bàn ${next.plans.length}...`;

    if(payload.done){
      next.status='SUCCESS';
      next.finishedAt=new Date().toISOString();
      next.cancelled=Boolean(payload.cancelled);
      next.applied=payload.applied||null;
      next.summary=summarizeKhlcnt(next.plans);
      // Soát lại: bản ghi nào e-GP trả về mà lệch tiêu chí thì nêu rõ.
      next.mismatched=auditPlans(next.plans,lookup.criteria).map(p=>p.planNoStand);
      const dropNote=next.areaDropped?` (đã bỏ ${next.areaDropped} kế hoạch lệch địa bàn)`:'';
      const c2=next.criteria||{};
      const broad=!c2.investor&&!c2.keyword&&!(c2.wards&&c2.wards.length);
      const capNote=(broad&&next.serverCount>=2000)
        ? ' Phạm vi rộng nên mới lấy 2.000 kế hoạch đầu — thêm Xã/Phường, Chủ đầu tư hoặc từ khoá để lấy đủ.'
        : '';
      next.message=next.plans.length
        ?`${next.plans.length} kế hoạch · ${next.summary.packageCount} gói thầu${dropNote}.${capNote}`
        // Nói rõ e-GP CÓ trả dữ liệu nhưng bộ lọc địa bàn loại hết — khác hẳn
        // với việc chủ đầu tư không có kế hoạch nào.
        : next.serverCount
          ?`e-GP có ${next.serverCount} kế hoạch cho tiêu chí này, nhưng không kế hoạch nào thuộc địa bàn đã chọn. Thử bỏ ô Tỉnh/Xã phường.`
          :'e-GP không trả kế hoạch nào cho chủ đầu tư/từ khoá này.';
    }
    await save({[KEYS.planLookup]:next});
    return {ok:true};
  });
}

async function exportPlansCsv(){
  const s=await getState();
  const list=(s.planLookup&&s.planLookup.plans)||[];
  const rows=[];
  for(const p of list){
    const base={
      planNoStand:p.planNoStand,name:p.name,projectName:p.projectName,
      investorName:p.investorName,investorCode:p.investorCode,location:p.location,
      planTypeLabel:p.planTypeLabel,decisionDate:formatDate(p.decisionDate),
      publicDate:formatDate(p.publicDate),
      note:p.hasUnannounced?'Còn gói chưa có TBMT':'',
      investTotal:numOrNull(p.investTotal),detailUrl:p.detailUrl
    };
    if(!p.packages.length){ rows.push({...base,packageName:'',packagePrice:null}); continue; }
    for(const g of p.packages)rows.push({...base,packageName:g.name,packagePrice:numOrNull(g.price)});
  }
  if(!rows.length)throw new Error('Chưa có kế hoạch nào để xuất.');
  return downloadXlsx(`GiaoSuCuiBap/KHLCNT-${stamp()}.xlsx`,{
    sheetName:'Kế hoạch LCNT',
    columns:[
      {header:'Mã KHLCNT',key:'planNoStand',width:20},
      {header:'Tên kế hoạch',key:'name',width:46},
      {header:'Dự án',key:'projectName',width:40},
      {header:'Chủ đầu tư',key:'investorName',width:40},
      {header:'Mã CĐT',key:'investorCode',width:16},
      {header:'Địa điểm',key:'location',width:30},
      {header:'Loại kế hoạch',key:'planTypeLabel',width:18},
      {header:'Ngày phê duyệt',key:'decisionDate',width:16},
      {header:'Ngày đăng tải',key:'publicDate',width:16},
      {header:'Ghi chú',key:'note',width:22},
      {header:'Tên gói thầu',key:'packageName',width:50},
      {header:'Giá gói thầu',key:'packagePrice',type:'money',width:20},
      {header:'Tổng mức đầu tư',key:'investTotal',type:'money',width:20},
      {header:'Link e-GP',key:'detailUrl',type:'url',width:44}
    ],
    rows
  });
}

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
    const s=await getState();
    if(s.activeRun?.id===id&&s.activeRun.status==='RUNNING'){
      timeoutMs=scanTimeoutMs(s);
      await updateRun(id,{lastProgressAt:at});
      touched=true;
    }
  }else{
    touched=await withLock(async()=>{
      const s=await getState();
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
    const s=await getState();
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
    const s=await getState();
    const cur=s[key];
    if(!cur||cur.id!==id)throw new Error('Lượt tra cứu đã được thay thế bởi một lượt mới.');
    const next={...cur,tabId};
    await save({[KEYS[key]]:next});
    return next;
  });
}

/** Chỉ chốt lỗi nếu id vẫn là job hiện tại của đúng loại. */
async function failLookupJob(key,id,message,status='ERROR'){
  const kind=lookupKind(key);
  if(!kind)return false;
  if(key==='bidOpenScan'){
    bbmtCancelled=true;
    if(bbmtWaiter?.scanId===id)bbmtWaiter.resolve(null);
  }
  const changed=await withLock(async()=>{
    const s=await getState();
    const cur=s[key];
    if(!cur||cur.id!==id||!isLookupActive(kind,cur))return false;
    await save({[KEYS[key]]:{...cur,status,partial:status==='PARTIAL'||Boolean(cur.partial),
      finishedAt:new Date().toISOString(),message:String(message||'Lượt tra cứu bị gián đoạn.').slice(0,1000)}});
    return true;
  });
  if(changed)await chrome.alarms.clear(TIMEOUT_PREFIX+id).catch(()=>{});
  return changed;
}

/** DONE lỗi đến sau RESULTS(done): vẫn phải sửa đúng bản ghi đã chốt SUCCESS. */
async function markLookupDoneFailure(key,id,message,partial=false){
  const outcome=await withLock(async()=>{
    const s=await getState();
    const cur=s[key];
    if(!cur||cur.id!==id)return {changed:false,stopBid:false};
    const got=lookupResultCount(key,cur);
    const isPartial=Boolean(partial||cur.partial||got);
    // Danh sách BBMT có thể thiếu một phần nhưng các gói đã nhận vẫn đáng để
    // đọc biên bản. Giữ phase LISTING/SCANNING chạy tiếp, rồi finalize PARTIAL.
    const keepBidDetails=key==='bidOpenScan'&&isPartial&&isLookupActive(lookupKind(key),cur);
    const next={...cur,status:keepBidDetails?cur.status:(isPartial?'PARTIAL':'ERROR'),
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
    const s=await getState();
    const cur=s[key];
    if(!cur||cur.id!==id)return false;
    const keepBidDetails=key==='bidOpenScan'&&isLookupActive(lookupKind(key),cur);
    await save({[KEYS[key]]:{...cur,status:keepBidDetails?cur.status:'PARTIAL',partial:true,
      finishedAt:keepBidDetails?cur.finishedAt:(cur.finishedAt||new Date().toISOString()),
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
  const before=await getState();
  const selected=[];
  for(const kind of LOOKUP_KINDS){
    if(which&&kind.key!==which)continue;
    const cur=before[kind.key];
    if(isLookupActive(kind,cur)&&(!expectedId||cur.id===expectedId))selected.push({key:kind.key,id:cur.id,tabId:cur.tabId});
  }
  await tellJobsToStop(selected);
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
      }else if(kind.key==='planLookup'&&got){
        next.status='PARTIAL';
        next.summary=summarizeKhlcnt(cur.plans||[]);
        next.mismatched=auditPlans(cur.plans||[],cur.criteria||{}).map(p=>p.planNoStand);
        next.message=`Đã dừng: giữ lại ${got} kế hoạch · ${next.summary.packageCount} gói thầu.`;
      }else if(kind.key==='bidOpenScan'&&got){
        next.status='PARTIAL';
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
  const s=await getState();
  if(s.activeRun?.tabId===tabId){
    await finishRun(s.activeRun.id,'TIMEOUT','Tab e-GP của lượt quét đã bị đóng.');
  }
  // Mỗi job có tab riêng: đóng tab A không được dừng các job ở tab B/C.
  for(const kind of LOOKUP_KINDS){
    const cur=s[kind.key];
    if(isLookupActive(kind,cur)&&cur.tabId===tabId){
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
    const ownTabGone=Number.isInteger(cur.tabId)?!tabIds.has(cur.tabId):noTab;
    // Giai đoạn đọc từng BBMT được điều phối trong service worker (waiter và
    // cursor nằm trong RAM). Nếu worker vừa bị Chrome dọn, không giả vờ tiếp
    // tục: chốt ngay PARTIAL và giữ mọi gói đã đọc. Các job phân trang khác
    // do content script điều phối nên vẫn có thể tiếp tục sau khi worker thức.
    const coordinatorLost=coldStart&&kind.key==='bidOpenScan'&&cur.status==='SCANNING';
    if(ownTabGone||age>RUN_STALE_MS||coordinatorLost){
      stale.push({key:kind.key,coordinatorLost});
    }
  }
  if(!stale.length)return {ok:true,cleared};
  for(const item of stale){
    await cancelLookups(item.key,item.coordinatorLost
      ?'Service worker đã khởi động lại giữa lúc đọc biên bản; dữ liệu đã nhận được giữ ở trạng thái chưa đầy đủ.'
      :'Lượt tra cứu của phiên trước đã dừng — không còn tab e-GP nào đang chạy.',s[item.key]?.id);
  }
  return {ok:true,cleared:[...cleared,...stale.map(item=>item.key)]};
}

// Mỗi lần service worker được nạp lại, dọn coordinator BBMT mất trong RAM.
// onStartup bên dưới vẫn xử lý riêng lịch quét theo cấu hình người dùng.
reconcileStaleLookups({coldStart:true}).catch(()=>{});

/** Dừng hẳn lượt quét đang chạy theo yêu cầu người dùng. */
async function cancelActiveRun(){
  const s=await getState();
  if(!s.activeRun)return {ok:true,message:'Không có lượt nào đang chạy.'};
  const run=s.activeRun;
  if(run.tabId){
    try{ await chrome.tabs.sendMessage(run.tabId,{type:'KQLCNT_CANCEL',payload:{planId:run.id}}); }catch{}
  }
  await finishRun(run.id,'ERROR','Đã dừng theo yêu cầu.');
  await save({[KEYS.activeRun]:null});
  await chrome.alarms.clear(TIMEOUT_PREFIX+run.id).catch(()=>{});
  return {ok:true,message:'Đã dừng lượt quét.'};
}

async function startTbmtSearch(payload={}){
  const criteria={
    investor:String(payload.investor||'').trim(),
    province:String(payload.province||'').trim(),
    ward:String(payload.ward||'').trim(),
    keyword:String(payload.keyword||'').trim(),
    minPrice:Number(payload.minPrice)||0,
    maxPrice:Number(payload.maxPrice)||0
  };
  if(!criteria.investor&&!criteria.province&&!criteria.ward&&!criteria.keyword
     &&!criteria.minPrice&&!criteria.maxPrice){
    return {ok:false,message:'Hãy nhập ít nhất một tiêu chí trước khi tra cứu.'};
  }
  // Bỏ ràng buộc cũ "muốn lọc Xã thì phải chọn Tỉnh". Ràng buộc đó là của
  // BIỂU MẪU e-GP; nay tiện ích tự dựng truy vấn nên không còn cần.
  if(criteria.minPrice&&criteria.maxPrice&&criteria.minPrice>criteria.maxPrice){
    return {ok:false,message:'Giá "từ" đang lớn hơn giá "đến". Kiểm tra lại giúp mình.'};
  }

  const s=await getState();
  // Lượt cũ còn kẹt thì dọn rồi chạy tiếp, thay vì chặn người dùng vô thời hạn.
  const blocking=await clearStaleRun(s.activeRun);
  if(blocking){
    return {ok:false,message:'Một lượt quét khác đang chạy. Bấm "Dừng lượt đang chạy" rồi thử lại.',
      run:{id:blocking.id,message:blocking.message,startedAt:blocking.startedAt}};
  }

  const label=[criteria.investor&&`CĐT "${criteria.investor}"`,
    criteria.ward&&`xã/phường "${criteria.ward}"`,
    criteria.province&&!criteria.ward&&`tỉnh "${criteria.province}"`,
    criteria.keyword&&`từ khoá "${criteria.keyword}"`].filter(Boolean).join(' · ')||'theo khoảng giá';

  /* Quy TÊN tỉnh ra MỌI MÃ cùng tên (Lâm Đồng = 68 hiện hành + 703 cũ). */
  let provinces=[];
  if(criteria.province){
    const areas=(await getAreas({})).areas;
    if(areas)provinces=provinceCodesByName(areas.provinces,criteria.province);
    if(!provinces.length){
      return {ok:false,message:`Không nhận ra tỉnh/thành "${criteria.province}". `
        +'Hãy chọn từ danh sách gợi ý (tên phải đúng như e-GP ghi, có chữ "Tỉnh" hoặc "Thành phố").'};
    }
  }

  const run={...newRun('form'),queue:[],qi:0,criteria:{...criteria,provinces},
    message:'Đang hỏi e-GP các gói thầu khớp tiêu chí...'};
  const claimed=await claimActiveRun(run);
  if(!claimed.ok)return {ok:false,message:'Một lượt quét khác vừa được bắt đầu.',run:claimed.current};

  try{
    const tab=await ensureEgpSearchTab(payload.focusTab!==false);
    await updateRun(run.id,{tabId:tab.id,status:'RUNNING'});
    await dispatchLookupToTab(tab.id,{
      id:run.id,mode:'tbmt',label,
      /* TỰ DỰNG truy vấn, không chạm biểu mẫu e-GP nữa. Cách cũ không lọc được
         khi người dùng CHỈ chọn tỉnh mà bỏ trống chủ đầu tư và xã/phường.
         Đã đo thật: chỉ lọc tỉnh Lâm Đồng -> 579 gói; thêm giá ≥3 tỷ -> 186. */
      query:buildTbmtQuery({...criteria,provinces}),
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
  const all=Array.isArray(payload.records)?payload.records:[];

  /* Lọc XÃ/PHƯỜNG tại chỗ. e-GP không lọc được theo mã xã — đã đo:
     locations.districtCode in ["23122"] trả về 0 dù mã đúng dạng và có thật.
     Tỉnh thì đã lọc ở phía máy chủ nên tới đây chỉ còn thu hẹp theo xã. */
  const st=await getState();
  const ward=String(((st.activeRun&&st.activeRun.id===payload.planId
    ? st.activeRun.criteria : null)||{}).ward||'').trim();
  const rows=ward?all.filter(r=>tbmtMatchesWard(r,ward)):all;
  if(ward&&all.length>rows.length){
    await withLock(async()=>{
      const cur=await getState();
      const add=all.length-rows.length;
      const runs=cur.runs.map(r=>r.id===payload.planId
        ?{...r,wardDropped:Number(r.wardDropped||0)+add}:r);
      const patch={[KEYS.runs]:runs.slice(0,100)};
      if(cur.activeRun?.id===payload.planId){
        patch[KEYS.activeRun]={...cur.activeRun,wardDropped:Number(cur.activeRun.wardDropped||0)+add};
      }
      await save(patch);
    });
  }

  if(rows.length){
    await ingest(rows,{runId:payload.planId,captureType:'form',
      total:payload.totalElements,page:(Number(payload.pageIndex)||0)+1});

    // Ghi lại ĐÚNG những gói của lượt tra này. Kho gói thầu là nơi tích luỹ
    // qua nhiều lượt, nên nếu không ghi thì màn hình kết quả sẽ hiện cả những
    // gói của các lần tra trước — trông như tra sai tiêu chí.
    await withLock(async()=>{
      const s=await getState();
      const run=s.runs.find(r=>r.id===payload.planId);
      if(!run)return;
      const keys=rows.map(r=>normalizeCandidate(r,{})).filter(Boolean).map(r=>r.key);
      const found=[...new Set([...(run.foundKeys||[]),...keys])];
      const runs=s.runs.map(r=>r.id===payload.planId?{...r,foundKeys:found}:r);
      const patch={[KEYS.runs]:runs.slice(0,100)};
      if(s.activeRun?.id===payload.planId)patch[KEYS.activeRun]={...s.activeRun,foundKeys:found};
      await save(patch);
    });
  }
  if(payload.done){
    const s=await getState();
    if(s.activeRun&&s.activeRun.id===payload.planId){
      const ap=payload.applied||{};
      const c=(s.activeRun.criteria)||{};
      const dropped=Number((await getState()).activeRun?.wardDropped||s.activeRun.wardDropped||0);
      const wardNote=dropped
        ? ` Đã bỏ ${dropped} gói không thuộc xã/phường "${c.ward}".`
        : '';
      const receivedPages=Math.max(0,Number(payload.pageIndex)||0);
      const totalPages=Math.max(receivedPages,Number(payload.totalPages)||0);
      const isPartial=Boolean(payload.partial||payload.capped||s.activeRun.partial);
      const partialMessage=payload.capped
        ?`Phạm vi lớn: mới lấy ${receivedPages}/${totalPages||receivedPages} trang đầu theo giới hạn cấu hình.${wardNote}`
        :payload.partial
          ?`e-GP dừng sớm sau ${receivedPages}/${totalPages||receivedPages} trang; kết quả chưa đầy đủ.${wardNote}`
          :s.activeRun.partialMessage||'';
      // Chưa finish ở đây: content script sẽ xoá kqPlan rồi mới gửi
      // KQLCNT_DONE. Chỉ lúc đó mới an toàn giao bộ lọc kế tiếp cho cùng tab.
      await updateRun(payload.planId,{applied:ap,pageDone:true,capped:Boolean(payload.capped),partial:isPartial,
        partialMessage:partialMessage||s.activeRun.partialMessage||'',
        completionMessage:isPartial?(partialMessage||'Hoàn tất một phần.'):'Hoàn tất.'+wardNote,
        message:'Đã nhận trang cuối; đang chốt lượt tra cứu...'});
    }
  }
  return {ok:true};
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
      threshold:winThreshold(obs,{field:payload.field})};
  }
  if(kind==='relations'){
    return {ok:true,total:obs.length,
      matrix:investorMatrix(obs,{minPackages:Number(payload.minPackages)||2}).slice(0,60),
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
  const allowedChanges=new Set(['price','closeDate','bidName','location','investorName']);
  const changeLog=(Array.isArray(raw.changeLog)?raw.changeLog:[]).slice(-20).flatMap(c=>{
    if(!c||!allowedChanges.has(String(c.field||'')))return [];
    return [{field:String(c.field),label:String(c.label||c.field).slice(0,80),
      before:String(c.before??'').slice(0,500),after:String(c.after??'').slice(0,500),
      at:Number.isFinite(Date.parse(c.at))?new Date(c.at).toISOString():new Date().toISOString()}];
  });
  const merged={...base,
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
  return {settings,tenders:rescoreStoredTenders(tenders,settings),runs,templates,
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
  'INGEST_CAPTURE','OBSERVED_TEMPLATE','SCAN_DONE','KQLCNT_RESULTS','KQLCNT_DONE',
  'BBMT_BIDDERS','EGP_ENDPOINT_SEEN','EGP_ATTACHMENTS','CONTENT_READY'
]);

const CONTENT_MAX_CHARS={
  INGEST_CAPTURE:4_000_000,OBSERVED_TEMPLATE:180_000,SCAN_DONE:8_000,
  KQLCNT_RESULTS:2_000_000,KQLCNT_DONE:8_000,BBMT_BIDDERS:1_000_000,
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
  if(type==='KQLCNT_RESULTS')return {
    planId:shortString(p.planId,120),mode:shortString(p.mode,30),focusTaxCode:shortString(p.focusTaxCode,20),
    records:assertObjectRows(p.records||[],200),totalElements:safeCount(p.totalElements,10_000_000),
    totalPages:safeCount(p.totalPages,200_000),pageIndex:safeCount(p.pageIndex,200_000),
    capped:Boolean(p.capped),cancelled:Boolean(p.cancelled),partial:Boolean(p.partial),done:Boolean(p.done),
    applied:p.applied&&typeof p.applied==='object'&&!Array.isArray(p.applied)?p.applied:null
  };
  if(type==='KQLCNT_DONE')return {planId:shortString(p.planId,120),mode:shortString(p.mode,30),
    ok:p.ok!==false,partial:Boolean(p.partial),message:shortString(p.message,1000)};
  if(type==='BBMT_BIDDERS')return {url:isEgpUrl(p.url)?shortString(p.url,2000):'',
    rows:assertObjectRows(p.rows||[],500,'rows')};
  if(type==='EGP_ENDPOINT_SEEN')return {path:shortString(p.path,300),method:shortString(p.method,12),
    status:safeCount(p.status,999),kieu:shortString(p.kieu,80),soBanGhi:safeCount(p.soBanGhi,10_000_000),
    truong:Array.isArray(p.truong)?p.truong.slice(0,40).map(x=>shortString(x,60)):[],
    trang:shortString(p.trang,200),luc:shortString(p.luc,40)};
  if(type==='EGP_ATTACHMENTS')return {url:isEgpUrl(p.url)?shortString(p.url,2000):'',payload:p.payload};
  if(type==='CONTENT_READY')return {url:isEgpUrl(p.url)?shortString(p.url,2000):''};
  return {};
}

function kqlcntModeForJob(key,job){
  if(key==='activeRun')return 'tbmt';
  if(key==='winnerLookup')return job.mode;
  return lookupKind(key)?.modes[0]||'';
}
function jobAcceptsPaginator(key,job){
  if(key==='activeRun')return job?.status==='RUNNING';
  if(key==='bidOpenScan')return job?.status==='LISTING'&&!job.listingDone;
  return isLookupActive(lookupKind(key),job);
}

/** Tìm duy nhất job sở hữu message theo mode/id/tab; không đoán khi mơ hồ. */
async function resolveKqlcntJob(payload,sender){
  const tabId=sender.tab?.id;
  if(!Number.isInteger(tabId))return null;
  const s=await getState();
  const rows=[{key:'activeRun',job:s.activeRun},...LOOKUP_KINDS.map(k=>({key:k.key,job:s[k.key]}))];
  const matches=rows.filter(({key,job})=>{
    if(!job||job.tabId!==tabId||!jobAcceptsPaginator(key,job))return false;
    if(payload.planId&&job.id!==payload.planId)return false;
    const mode=kqlcntModeForJob(key,job);
    if(payload.mode&&mode!==payload.mode)return false;
    return true;
  });
  return matches.length===1?matches[0]:null;
}

async function routeKqlcntResults(payload,sender){
  if(!payload.planId||!payload.mode)return {ok:false,message:'Thiếu mode hoặc mã job KQLCNT.'};
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
    if(missing.length){
      effective={...payload,partial:true,
        deliveryMessage:`Thiếu ${missing.length} trang dữ liệu khi chuyển từ tab e-GP (${missing.slice(0,8).join(', ')}${missing.length>8?', …':''}).`};
    }
  }
  let result;
  if(target.key==='activeRun')result=await ingestTbmtPage(effective);
  else if(target.key==='bidOpenScan')result=await ingestBidOpenList(effective);
  else if(target.key==='planLookup')result=await ingestPlanPage(effective);
  else if(target.key==='areaScan')result=await ingestAreaPage(effective);
  else if(target.key==='investorScan')result=await ingestInvestorPage(effective);
  else result=await ingestWinnerPage(effective);
  if(!effective.done&&result?.ok!==false){
    if(!await recordReceivedPage(target.key,target.job.id,effective.pageIndex)){
      return {ok:false,retryable:true,message:'Chưa ghi nhận được trang dữ liệu; tiện ích sẽ thử lại.'};
    }
    await renewProgressLease(target.key,target.job.id);
  }
  if(effective.done){
    pendingKqlcntDoneByTab.set(sender.tab.id,{key:target.key,id:target.job.id,
      mode:kqlcntModeForJob(target.key,target.job),at:Date.now()});
    if(target.key!=='activeRun'&&target.key!=='bidOpenScan'){
      await chrome.alarms.clear(TIMEOUT_PREFIX+target.job.id).catch(()=>{});
    }
    if(effective.partial||(target.key==='activeRun'&&effective.capped)){
      if(target.key==='activeRun')await updateRun(target.job.id,{partial:true,
        partialMessage:effective.deliveryMessage||target.job.partialMessage||''});
      else await markLookupPartial(target.key,target.job.id,effective.deliveryMessage||'');
    }
  }
  return {...(result||{}),ok:result?.ok!==false,pageIndex:effective.pageIndex};
}

async function routeKqlcntDone(payload,sender){
  const tabId=sender.tab?.id;
  const pending=pendingKqlcntDoneByTab.get(tabId);
  if(pending&&(Date.now()-pending.at)<=60_000&&
     (!payload.planId||payload.planId===pending.id)&&(!payload.mode||payload.mode===pending.mode)){
    pendingKqlcntDoneByTab.delete(tabId);
    const s=await getState();
    const job=pending.key==='activeRun'?s.activeRun:s[pending.key];
    if(job?.id===pending.id&&payload.ok===false){
      if(pending.key==='activeRun')await finishRun(job.id,
        (payload.partial||job.partial||Number(job.captured||0)>0)?'PARTIAL':'ERROR',
        payload.message||'Lượt tra cứu e-GP bị gián đoạn.');
      else await markLookupDoneFailure(pending.key,job.id,payload.message||'Lượt tra cứu e-GP bị gián đoạn.',payload.partial);
    }else if(pending.key==='activeRun'&&job?.id===pending.id){
      if(payload.partial)await updateRun(job.id,{partial:true});
      await advanceOrFinish(job.id,true,job.completionMessage||payload.message||'Hoàn tất.');
    }else if(job?.id===pending.id&&payload.partial){
      await markLookupPartial(pending.key,job.id,payload.message);
    }
    // Các lookup khác đã chốt bằng KQLCNT_RESULTS(done). Riêng bbmt-list có
    // thể đang SCANNING chi tiết; DONE của giai đoạn liệt kê chỉ là ACK và
    // tuyệt đối không được đổi phase đó thành ERROR.
    return {ok:true,acknowledged:true};
  }
  if(pending&&(Date.now()-pending.at)>60_000)pendingKqlcntDoneByTab.delete(tabId);

  const target=await resolveKqlcntJob(payload,sender);
  // KQLCNT_RESULTS(done) thường đã chốt lookup trước KQLCNT_DONE; message cuối
  // khi đó là bản sao vô hại và không được phép rơi sang job khác.
  if(!target)return {ok:true,ignored:true};
  const {key,job}=target;
  if(payload.ok===false){
    if(key==='activeRun')await finishRun(job.id,
      (payload.partial||job.partial||Number(job.captured||0)>0)?'PARTIAL':'ERROR',
      payload.message||'Lượt tra cứu e-GP bị gián đoạn.');
    else await markLookupDoneFailure(key,job.id,payload.message||'Lượt tra cứu e-GP bị gián đoạn.',payload.partial);
    return {ok:true};
  }
  if(key==='activeRun'){
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
  const s=await getState();
  return Boolean(s.activeRun?.id===runId&&s.activeRun.tabId===sender.tab?.id);
}

async function handleJobTimeout(id){
  const s=await getState();
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
  if(alarm.name===DAILY_ALARM)await startScan('scheduled');
  else if(alarm.name.startsWith(TIMEOUT_PREFIX)){
    await handleJobTimeout(alarm.name.slice(TIMEOUT_PREFIX.length));
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
    switch(message.type){
      case 'GET_STATE': {const s=await getState();sendResponse({ok:true,...s,manifest:chrome.runtime.getManifest(),extensionId:chrome.runtime.id,alarm:await chrome.alarms.get(DAILY_ALARM)});break;}
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
      case 'UPDATE_SETTINGS': {const s=await getState();const settings={...s.settings,...message.payload};const tenders=rescoreStoredTenders(s.tenders,settings);await save({[KEYS.settings]:settings,[KEYS.tenders]:tenders});await ensureDailyAlarm();sendResponse({ok:true,settings});break;}
      case 'SET_WATCH': {const s=await getState();const tenders=s.tenders.map(t=>t.key===message.payload.key?{...t,watchlisted:Boolean(message.payload.value)}:t);await save({[KEYS.tenders]:tenders});sendResponse({ok:true});break;}
      case 'SET_DECISION': {
        const p=message.payload||{};
        const key=String(p.key||'');
        if(!key){sendResponse({ok:false,message:'Thiếu mã gói thầu.'});break;}
        const state=normalizeDecisionState(p.state);
        const s=await getState();
        let found=false;
        const tenders=s.tenders.map(t=>{
          if(t.key!==key)return t;
          found=true;
          const next={...t,decisionState:state,decisionUpdatedAt:new Date().toISOString()};
          if(Object.prototype.hasOwnProperty.call(p,'owner'))next.decisionOwner=String(p.owner||'').trim().slice(0,120);
          if(Object.prototype.hasOwnProperty.call(p,'note'))next.decisionNote=String(p.note||'').trim().slice(0,1000);
          // Các gói đã vào quy trình phải luôn xuất hiện trong danh sách theo dõi.
          if(['REVIEW','GO','BID','SUBMITTED'].includes(state))next.watchlisted=true;
          return next;
        });
        if(!found){sendResponse({ok:false,message:'Không tìm thấy gói thầu trong kho dữ liệu.'});break;}
        await save({[KEYS.tenders]:tenders});
        sendResponse({ok:true,state,label:DECISION_STATE_LABEL[state]});
        break;
      }
      case 'DELETE_TENDER': {const s=await getState();await save({[KEYS.tenders]:s.tenders.filter(t=>t.key!==message.payload.key)});sendResponse({ok:true});break;}
      case 'CLEAR_DATA': await save({[KEYS.tenders]:[],[KEYS.runs]:[],[KEYS.activeRun]:null,[KEYS.participations]:[],[KEYS.winnerLookup]:null,[KEYS.winnerCache]:{}});sendResponse({ok:true});break;
      case 'FACTORY_RESET': {
        obsQueue=[];notifUrls.clear();
        await chrome.alarms.clearAll();
        await chrome.storage.local.clear();
        await chrome.storage.local.set({[KEYS.settings]:{...DEFAULT_SETTINGS}});
        sendResponse({ok:true});
        break;
      }
      case 'EXPORT_CSV': await exportCsv(message.payload?.saveAs!==false);sendResponse({ok:true});break;
      case 'EXPORT_MOBILE': await exportMobileReport(message.payload?.saveAs!==false);sendResponse({ok:true});break;
      case 'EXPORT_BACKUP_SAFE': await exportBackup();sendResponse({ok:true});break;
      // Tương thích lệnh cũ nhưng luôn xuất định dạng an toàn.
      case 'EXPORT_BACKUP': await exportBackup();sendResponse({ok:true});break;
      case 'IMPORT_BACKUP': {
        const data=message.payload?.data;
        // Chốt phụ ở service worker; phía giao diện đã chặn theo kích thước tệp.
        if(JSON.stringify(data||{}).length>30_000_000)throw new Error('File backup vượt quá 30 MB.');
        const clean=sanitizeBackupImport(data);
        // Chỉ dừng tác vụ sau khi file đã qua kiểm tra. Không để tab/alarm cũ
        // tiếp tục gửi dữ liệu vào state vừa được khôi phục.
        await cancelActiveRun();
        await cancelLookups(null,'Đã dừng để nhập bản sao dữ liệu.');
        await save({[KEYS.settings]:clean.settings,[KEYS.tenders]:clean.tenders,[KEYS.runs]:clean.runs,
          [KEYS.template]:clean.template,[KEYS.templates]:clean.templates,[KEYS.lastTemplate]:clean.lastTemplate,
          [KEYS.activeRun]:null,[KEYS.participations]:clean.participations,[KEYS.winnerLookup]:null,
          [KEYS.winnerCache]:{},[KEYS.bidOpenScan]:null,[KEYS.planLookup]:null,[KEYS.areaScan]:null,
          [KEYS.investorScan]:null});
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
      case 'CANCEL_ACTIVE_RUN': sendResponse(await cancelActiveRun());break;
      case 'OPEN_SEARCH': await chrome.tabs.create({url:chrome.runtime.getURL('search.html')});sendResponse({ok:true});break;
      case 'GET_PLAN_STATE': {const s=await getState();sendResponse({ok:true,lookup:s.planLookup});break;}
      case 'CANCEL_PLAN_LOOKUP': sendResponse(await cancelLookups('planLookup'));break;
      case 'CLEAR_PLAN_LOOKUP': await save({[KEYS.planLookup]:null});sendResponse({ok:true});break;
      case 'EXPORT_PLANS_CSV': await exportPlansCsv();sendResponse({ok:true});break;
      case 'OPEN_PLANS': await chrome.tabs.create({url:chrome.runtime.getURL('plans.html')});sendResponse({ok:true});break;
      case 'OPEN_IPHONE': await chrome.tabs.create({url:chrome.runtime.getURL('mobile/iphone.html')});sendResponse({ok:true});break;
      case 'EGP_ENDPOINT_SEEN': sendResponse(await recordEndpointSeen(message.payload||{}));break;
      case 'CLEAR_ENDPOINT_MAP': await save({[KEYS.endpointMap]:[]});sendResponse({ok:true});break;
      case 'BBMT_BIDDERS': sendResponse(await onBbmtBidders(message.payload||{},sender.tab?.id));break;
      case 'BID_OPEN_SCAN': sendResponse(await startBidOpenScan(message.payload||{}));break;
      case 'CANCEL_BID_OPEN_SCAN': sendResponse(await cancelLookups('bidOpenScan'));break;
      case 'GET_ANALYTICS': await flushObservations();sendResponse(await getAnalytics(message.payload||{}));break;
      case 'OPEN_ANALYTICS': await chrome.tabs.create({url:chrome.runtime.getURL('analytics.html')});sendResponse({ok:true});break;
      case 'CLEAR_OBSERVATIONS': obsQueue=[];await save({[KEYS.observations]:[]});sendResponse({ok:true});break;
      case 'GET_BID_OPEN_STATE': {const s=await getState();sendResponse({ok:true,scan:s.bidOpenScan});break;}
      case 'CLEAR_BID_OPEN_SCAN': await save({[KEYS.bidOpenScan]:null});sendResponse({ok:true});break;
      case 'EXPORT_BID_OPEN_CSV': await exportBidOpenCsv();sendResponse({ok:true});break;
      case 'OPEN_BID_OPEN': await chrome.tabs.create({url:chrome.runtime.getURL('bidopen.html')});sendResponse({ok:true});break;
      case 'KQLCNT_DONE': sendResponse(await routeKqlcntDone(message.payload||{},sender));break;
      case 'CONTENT_READY': sendResponse({ok:true});break;
      case 'GET_WINNER_STATE': {const s=await getState();sendResponse({ok:true,lookup:s.winnerLookup,cache:s.winnerCache});break;}
      case 'CANCEL_WINNER_LOOKUP': sendResponse(await cancelLookups('winnerLookup'));break;
      case 'CLEAR_WINNER_LOOKUP': await save({[KEYS.winnerLookup]:null});sendResponse({ok:true});break;
      case 'CLEAR_WINNER_CACHE': await save({[KEYS.winnerCache]:{}});sendResponse({ok:true});break;
      case 'EXPORT_WINNERS_CSV': await exportWinnersCsv();sendResponse({ok:true});break;
      case 'OPEN_OPTIONS': await chrome.runtime.openOptionsPage();sendResponse({ok:true});break;
      case 'OPEN_EGP': {const s=await getState();await chrome.tabs.create({url:s.template?.sourcePageUrl||EGP_DEFAULT_URL});sendResponse({ok:true});break;}
      case 'SCAN_CURRENT_TAB': {const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.url?.startsWith('https://muasamcong.mpi.gov.vn/'))throw new Error('Tab hiện tại không phải e-GP.');sendResponse(await sendToTab(tab.id,{type:'SCAN_CURRENT_PAGE'}));break;}
      default: sendResponse({ok:false,message:'Lệnh không được hỗ trợ.'});
    }
  })().catch(error=>sendResponse({ok:false,message:String(error?.message||error)}));
  return true;
});
