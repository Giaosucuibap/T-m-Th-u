import { safeHunts, huntAlarmName, parseHuntAlarm } from './hunts.js';
import { safeChatId } from './channels.js';
import { activeListJob, schemaIsRed, SCHEMA_STOP_MESSAGE } from './runtime-query.js';

/** hunt operations execute here; Chrome/storage boundaries are injected for replay tests. */
export function createHuntRuntime({getState,save,escapeHtml,sendTelegram,nextDailyTime,startPlanLookup,startTbmtSearch,KEYS,HUNT_RETRY_PREFIX,withLock,chrome}) {
async function ensureHuntAlarms(hunts){
  const all=await chrome.alarms.getAll();
  for(const alarm of all){
    if(parseHuntAlarm(alarm.name)||alarm.name.startsWith(HUNT_RETRY_PREFIX))await chrome.alarms.clear(alarm.name);
  }
  for(const hunt of safeHunts(hunts)){
    if(!hunt.enabled)continue;
    for(const time of hunt.times){
      await chrome.alarms.create(huntAlarmName(hunt.id,time),{when:nextDailyTime(time),periodInMinutes:1440});
    }
  }
}

async function runHuntById(huntId){
  const s=await getState();
  if(s.settings.readOnlyMode)return {ok:false,message:'Đang khóa chỉnh sửa và tự động hóa.'};
  if(schemaIsRed(s))return {ok:false,message:SCHEMA_STOP_MESSAGE};
  const hunt=(s.hunts||[]).find(h=>h.id===huntId);
  if(!hunt||!hunt.enabled)return {ok:false,message:'Bộ săn không tồn tại hoặc đang tắt.'};
  const busy=Boolean(activeListJob(s));
  if(busy){
    await withLock(async()=>{const latest=await getState();await save({[KEYS.hunts]:latest.hunts.map(h=>h.id===huntId?{...h,lastStatus:'QUEUED',lastMessage:'Đang chờ lượt cùng chức năng hoàn tất.'}:h)});});
    await chrome.alarms.create(HUNT_RETRY_PREFIX+huntId,{when:Date.now()+60_000});
    return {ok:true,queued:true,message:'Đã xếp hàng; sẽ thử lại khi chức năng rảnh.'};
  }
  await chrome.alarms.clear(HUNT_RETRY_PREFIX+huntId);
  await withLock(async()=>{const latest=await getState();await save({[KEYS.hunts]:latest.hunts.map(h=>h.id===huntId?{...h,lastRunAt:new Date().toISOString(),lastStatus:'RUNNING',lastMessage:'Đang tra cứu...'}:h)});});
  const payload={...hunt.criteria,focusTab:false,huntId:hunt.id};
  const result=hunt.kind==='plan'?await startPlanLookup(payload):await startTbmtSearch(payload);
  if(!result.ok)await withLock(async()=>{const latest=await getState();await save({[KEYS.hunts]:latest.hunts.map(h=>h.id===huntId?{...h,lastStatus:'ERROR',lastMessage:result.message||'Không bắt đầu được.'}:h)});});
  return result;
}

async function recordHuntOutcome(job){
  if(!job?.huntId||!['SUCCESS','PARTIAL','ERROR','TIMEOUT','CANCELLED'].includes(job.status))return;
  const result=await withLock(async()=>{
    const latest=await getState();const hunt=latest.hunts.find(h=>h.id===job.huntId);
    if(!hunt)return null;
    const duplicate=hunt.lastCompletedJobId===job.id&&hunt.lastStatus===job.status;
    await save({[KEYS.hunts]:latest.hunts.map(h=>h.id===job.huntId?{...h,lastCompletedJobId:job.id,lastStatus:job.status,lastMessage:String(job.message||'').slice(0,300)}:h)});
    return {hunt,settings:latest.settings,duplicate};
  });
  if(result&&!result.duplicate&&result.hunt.kind==='plan'&&result.hunt.telegram&&result.settings.telegramEnabled&&!result.settings.readOnlyMode){
    await sendTelegram(result.settings,`📋 <b>${escapeHtml(result.hunt.name)}</b>\n${escapeHtml(job.message||job.status)}`,{kind:'plan-hunt',chatId:safeChatId(result.hunt.telegramChatId)});
  }
}
return {ensureHuntAlarms,runHuntById,recordHuntOutcome};
}
