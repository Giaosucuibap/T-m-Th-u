import { safeHunts, huntAlarmName, parseHuntAlarm } from './hunts.js';
import { planScan, evaluateScan } from './delta-scan.js';
import { safeChatId } from './channels.js';
import { activeListJob, schemaIsRed, SCHEMA_STOP_MESSAGE } from './runtime-query.js';
import { STATION_KEY, missedHuntSlots, catchupSchedule, notePending, takePending, takeUnnotified, noteAlive, catchupNotice, safeStation, stationSummary, slotLabel } from './station.js';

/** hunt operations execute here; Chrome/storage boundaries are injected for replay tests. */
export function createHuntRuntime({getState,save,escapeHtml,sendTelegram,nextDailyTime,startPlanLookup,startTbmtSearch,KEYS,HUNT_RETRY_PREFIX,withLock,chrome,now=Date.now}) {
/* Sổ trạm săn nằm ở chrome.storage.local, có hàng đợi RIÊNG: ensureHuntAlarms
   được gọi cả bên trong withLock (SAVE_HUNT) — dùng withLock ở đây sẽ tự khoá. */
let stationQueue=Promise.resolve();
const memory={};
const stationStore=chrome?.storage?.local||{get:async d=>({...d,...memory}),set:async o=>{Object.assign(memory,o);}};
function withStation(fn){
  const run=stationQueue.then(async()=>{
    const raw=(await stationStore.get({[STATION_KEY]:null}))[STATION_KEY];
    const out=await fn(safeStation(raw));
    if(out?.station)await stationStore.set({[STATION_KEY]:out.station});
    return out;
  });
  stationQueue=run.catch(()=>{});
  return run;
}

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
  // Báo thức vừa đặt lại chỉ tính từ LẦN TỚI. Lượt đã lỡ (máy tắt, Chrome đóng,
  // đang chờ hàng) được xếp chạy bù ngay tại đây — trước 4.19.0 nó mất hẳn.
  return scheduleCatchups(hunts);
}

/** Xếp chạy bù mọi bộ săn đang bật đã lỡ giờ gần nhất. Gọi lại nhiều lần vẫn an toàn. */
async function scheduleCatchups(hunts){
  const at=now();
  const missed=missedHuntSlots(safeHunts(hunts),at);
  const out=await withStation(station=>notePending(station,missed,at));
  for(const item of catchupSchedule(missed,at))await chrome.alarms.create(HUNT_RETRY_PREFIX+item.huntId,{when:item.when});
  return {missed,fresh:out?.fresh||[]};
}

/** Nhịp tim: gọi khi Chrome khởi động và mỗi báo thức 30 phút. Phát hiện khoảng
 *  máy/Chrome không chạy; nếu có lượt săn lỡ giờ thì xếp chạy bù và nhắn Telegram. */
async function heartbeat({startup=false}={}){
  const at=now();
  const {gap}=await withStation(station=>noteAlive(station,at,{startup}));
  if(!gap&&!startup)return {gap:null,notified:[]};
  const s=await getState();
  if(s.settings?.readOnlyMode)return {gap,notified:[]};
  await scheduleCatchups(s.hunts);
  if(!s.settings?.telegramEnabled)return {gap,notified:[]};
  // Chỉ nhắn cho bộ săn có bật Telegram; mỗi lượt lỡ giờ nhắn đúng một lần.
  const wants=new Set((s.hunts||[]).filter(h=>h.telegram).map(h=>h.id));
  const {items}=await withStation(station=>takeUnnotified(station,at,id=>wants.has(id)));
  const text=catchupNotice(gap,items);
  if(text)await Promise.resolve(sendTelegram(s.settings,text,{kind:'station'})).catch(()=>null);
  return {gap,notified:items};
}

async function stationStatus(){
  const raw=(await stationStore.get({[STATION_KEY]:null}))[STATION_KEY];
  return stationSummary(raw,now());
}

async function runHuntById(huntId,{forceFull=false}={}){
  const s=await getState();
  if(s.settings.readOnlyMode)return {ok:false,message:'Đang khóa chỉnh sửa và tự động hóa.'};
  if(schemaIsRed(s))return {ok:false,message:SCHEMA_STOP_MESSAGE};
  const hunt=(s.hunts||[]).find(h=>h.id===huntId);
  if(!hunt||!hunt.enabled)return {ok:false,message:'Bộ săn không tồn tại hoặc đang tắt.'};
  const busy=Boolean(activeListJob(s));
  if(busy){
    await withLock(async()=>{const latest=await getState();await save({[KEYS.hunts]:latest.hunts.map(h=>h.id===huntId?{...h,lastStatus:'QUEUED',lastMessage:'Đang chờ lượt cùng chức năng hoàn tất.'}:h)});});
    await chrome.alarms.create(HUNT_RETRY_PREFIX+huntId,{when:now()+60_000});
    return {ok:true,queued:true,message:'Đã xếp hàng; sẽ thử lại khi chức năng rảnh.'};
  }
  await chrome.alarms.clear(HUNT_RETRY_PREFIX+huntId);
  // Lượt chạy bù: kiểm lại lần cuối — nếu lượt đúng giờ đã chạy trong lúc chờ thì không chạy trùng.
  const taken=await withStation(station=>takePending(station,hunt,now()));
  if(taken?.skip)return {ok:true,skipped:true,message:'Lượt đúng giờ đã chạy; không cần chạy bù.'};
  const catchup=taken?.catchup||null;
  const startedIso=new Date(now()).toISOString();
  await withLock(async()=>{const latest=await getState();await save({[KEYS.hunts]:latest.hunts.map(h=>h.id===huntId?{...h,lastRunAt:startedIso,lastStatus:'RUNNING',
    lastMessage:catchup?`Chạy bù lượt ${slotLabel(catchup.slot)} (lỡ giờ khi máy tắt hoặc Chrome đóng) — đang tra cứu...`:'Đang tra cứu...',
    lastCatchup:catchup?{slot:new Date(catchup.slot).toISOString(),time:catchup.time,at:startedIso}:null}:h)});});
  const huntPlan=planScan(hunt,Date.now(),{forceFull});
  const payload={...hunt.criteria,focusTab:false,huntId:hunt.id,huntPlan};
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
    // Quét nhanh: đánh giá lượt vừa xong (chỉ một lần cho mỗi lượt).
    let delta=null;
    if(!duplicate&&hunt.kind==='tbmt'&&hunt.delta&&job.huntPlan){
      const byKey=new Map((latest.tenders||[]).map(t=>[t.key,t.publicDate]));
      delta=evaluateScan({plan:job.huntPlan,job,pubOf:k=>byKey.get(k),state:hunt.deltaState});
    }
    // Lượt chạy bù ghi rõ là chạy bù cho giờ nào — người dùng biết vì sao tin đến muộn.
    const catchupNote=hunt.lastCatchup&&hunt.lastCatchup.at===hunt.lastRunAt?`Chạy bù lượt ${slotLabel(Date.parse(hunt.lastCatchup.slot))} · `:'';
    const lastMessage=catchupNote+(delta&&delta.note&&job.huntPlan?.mode==='delta'||delta?.state?.broken&&!hunt.deltaState?.broken?`${delta.note} `:'')+String(job.message||'');
    // Cảnh báo theo CHUYỂN trạng thái: lần đầu lỗi thì nhắn, hồi phục thì nhắn — không nhắn lại mỗi lượt.
    const failed=['ERROR','TIMEOUT'].includes(job.status), healthy=['SUCCESS','PARTIAL'].includes(job.status);
    const alert=duplicate?null:failed&&!hunt.failAlertedAt?'fail':healthy&&hunt.failAlertedAt?'recover':null;
    await save({[KEYS.hunts]:latest.hunts.map(h=>h.id===job.huntId?{...h,lastCompletedJobId:job.id,lastStatus:job.status,lastMessage:lastMessage.slice(0,300),
      ...(delta?{deltaState:delta.state}:{}),...(alert==='fail'?{failAlertedAt:new Date(now()).toISOString()}:alert==='recover'?{failAlertedAt:''}:{})}:h)});
    return {hunt,settings:latest.settings,duplicate,followUpFull:Boolean(delta?.followUpFull),alert,lastMessage};
  });
  if(result?.alert&&result.hunt.telegram&&result.settings.telegramEnabled&&!result.settings.readOnlyMode){
    const text=result.alert==='fail'
      ?`⚠️ <b>Bộ săn lỗi: ${escapeHtml(result.hunt.name)}</b>\n${escapeHtml(String(result.lastMessage||job.status).slice(0,300))}\n\nCác lượt tự động có thể đang bỏ sót gói mới. Phần mềm sẽ thử lại ở giờ hẹn tới; nếu lặp lại, mở Chẩn đoán → Kiểm chứng toàn trình trên e-GP.`
      :`✅ <b>Bộ săn chạy lại bình thường: ${escapeHtml(result.hunt.name)}</b>\n${escapeHtml(String(result.lastMessage||'').slice(0,300))}`;
    await Promise.resolve(sendTelegram(result.settings,text,{kind:'hunt-health',chatId:safeChatId(result.hunt.telegramChatId)})).catch(()=>null);
  }
  // Quét nhanh trả 0 gói khi bộ lọc chưa được kiểm chứng: quét đầy đủ ngay.
  if(result?.followUpFull)setTimeout(()=>{void runHuntById(job.huntId,{forceFull:true}).catch(()=>{});},3000);
  if(result&&!result.duplicate&&result.hunt.kind==='plan'&&result.hunt.telegram&&result.settings.telegramEnabled&&!result.settings.readOnlyMode){
    await sendTelegram(result.settings,`📋 <b>${escapeHtml(result.hunt.name)}</b>\n${escapeHtml(job.message||job.status)}`,{kind:'plan-hunt',chatId:safeChatId(result.hunt.telegramChatId)});
  }
}
return {ensureHuntAlarms,scheduleCatchups,heartbeat,stationStatus,runHuntById,recordHuntOutcome};
}
