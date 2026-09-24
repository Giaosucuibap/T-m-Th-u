import { touchLifecycle, inferLifecycleEvent, investorWatchHit, schemaHealthOf, findPriorTenderVersion, newTenderChanges } from './lifecycle.js';
import { normalizeCandidate, mergeTender, extractParticipations, mergeParticipation } from './core.js';

/** ingest operations execute here; Chrome/storage boundaries are injected for replay tests. */
export function createIngestRuntime({getState,save,scoredWithGate,publicFilterCriteria,KEYS,withLock}) {
async function ingest(records,meta={}){
  return withLock(async()=>{
    const s=await getState();
    const existing=new Map(s.tenders.map(t=>[t.key,t]));
    const ingestedKeys=[];
    const run=meta.runId?s.runs.find(r=>r.id===meta.runId):null;
    const criteria=publicFilterCriteria(run?.criteria||s.settings);
    const resultStates={...(run?.resultStates||{})};
    const alertMin=Number(s.settings.alertMinScore||85);
    const teleMin=Number(s.settings.telegramMinScore||70);
    const freshAlerts=[],freshMatches=[];
    let newCount=0,updatedCount=0,matchedCount=0,valid=0;
    const health=schemaHealthOf(records);
    const watches=s.watchedInvestors||[];
    const amendmentEvents=[];
    for(const raw of records.slice(0,1000)){
      const normalized=normalizeCandidate(raw,meta);if(!normalized)continue;valid++;ingestedKeys.push(normalized.key);
      const before=existing.get(normalized.key)||findPriorTenderVersion([...existing.values()],normalized);
      let merged=mergeTender(before||{},normalized,s.settings);
      const scored=scoredWithGate({...raw,...normalized},s.settings,criteria);
      merged={...merged,...scored,filterCriteria:criteria};
      // This is a result from this query at this time, independent of later runs.
      resultStates[merged.key]={filterState:scored.filterState,filterReason:scored.filterReason,
        score:scored.score,matched:scored.matched,checkedAt:merged.lastSeenAt,
        bidName:normalized.bidName,price:normalized.price,publicDate:normalized.publicDate,closeDate:normalized.closeDate,
        investorName:normalized.investorName,location:normalized.location,fieldRaw:normalized.fieldRaw,detailUrl:normalized.detailUrl,
        investField:normalized.investField,fieldCode:normalized.fieldCode,provinceCode:normalized.provinceCode,
        provinceCodes:normalized.provinceCodes,locations:normalized.locations,wardIdentities:normalized.wardIdentities,
        wardCode:normalized.wardCode,wardParentCode:normalized.wardParentCode,parentCode:normalized.parentCode};
      if(before&&before.key!==normalized.key){
        // A new notice version retains history and tracking, but requires
        // a fresh decision on the changed requirements.
        merged.decisionState=before.decisionState&&before.decisionState!=='NEW'?'REVIEW':'NEW';
        for(const key of Object.keys(merged))if(/^decision(Proposed|Tech|Confirmed|Approval|Director)/.test(key))delete merged[key];
      }
      const event=inferLifecycleEvent(merged);
      merged={...merged,lifecycle:touchLifecycle(before||merged,event,merged.lastSeenAt)};
      const watch=investorWatchHit(merged,watches);
      if(watch){
        merged.watchlisted=true;
        merged.watchedInvestorId=watch.id;
      }
      if(before){
        updatedCount++;
        const fresh=newTenderChanges(before,merged);
        if(before.version!==merged.version&&!fresh.some(ch=>ch.field==='version'))fresh.push({field:'version',before:before.version,after:merged.version,at:merged.lastSeenAt});
        if((merged.watchlisted||watch)&&fresh.some(ch=>ch.field==='closeDate'||ch.field==='version'||ch.field==='bidName')){
          merged.amendment = true;
          if(scored.filterState==='MATCH'){
            freshAlerts.push({...merged,alertKind:'amendment'});
            freshMatches.push({...merged,alertKind:'amendment'});
          }
          for(const ch of fresh){
            amendmentEvents.push({at:ch.at||new Date().toISOString(),key:merged.key,notifyNo:merged.notifyNo,bidName:merged.bidName,field:ch.field,before:ch.before,after:ch.after});
          }
        }
      }else{
        newCount++;
        if(scored.filterState==='MATCH'&&(merged.score>=alertMin||watch))freshAlerts.push(merged);
        if(scored.filterState==='MATCH'&&((merged.matched&&merged.score>=teleMin)||watch))freshMatches.push(merged);
      }
      if(merged.matched)matchedCount++;
      existing.set(merged.key,merged);
    }
    const tenders=[...existing.values()].sort((a,b)=>new Date(b.lastSeenAt)-new Date(a.lastSeenAt)).slice(0,Number(s.settings.maxStoredTenders||3000));
    const patch={[KEYS.tenders]:tenders,[KEYS.schemaHealth]:{...health,at:new Date().toISOString(),source:meta.captureType||'',runId:meta.runId||null}};
    if(amendmentEvents.length){
      patch[KEYS.amendmentLog]=[...amendmentEvents,...(s.amendmentLog||[])].slice(0,500);
    }
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
      if(run){
        const foundKeys=[...new Set([...(run.foundKeys||[]),...ingestedKeys])];
        const captured=foundKeys.length;
        const values=Object.values(resultStates);
        const matchCount=values.filter(r=>r.filterState==='MATCH').length;
        const insufficientCount=values.filter(r=>r.filterState==='INSUFFICIENT').length;
        const outOfRangeCount=values.filter(r=>r.filterState==='OUT_OF_RANGE').length;
        const progress=meta.total?`Đã lấy ${captured} bản ghi${meta.page?` (trang ${meta.page}`:''}${meta.page&&meta.total?` · tổng ~${meta.total} gói)`:meta.page?')':''}; đang chấm điểm...`:`Đã nhận ${captured} bản ghi; đang chống trùng và chấm điểm...`;
        const updatedRun={...run,foundKeys,resultStates,matchCount,insufficientCount,outOfRangeCount,status:'RUNNING',message:progress,captured,newCount:Number(run.newCount||0)+newCount,updatedCount:Number(run.updatedCount||0)+updatedCount,matchedCount:values.filter(r=>r.matched).length,pendingAlerts:[...new Map([...(run.pendingAlerts||[]),...freshAlerts].filter(t=>resultStates[t.key]?.filterState==='MATCH').map(t=>[t.key,t])).values()].slice(0,50),pendingMatches:[...new Map([...(run.pendingMatches||[]),...freshMatches].filter(t=>resultStates[t.key]?.filterState==='MATCH').map(t=>[t.key,t])).values()].slice(0,50)};
        patch[KEYS.runs]=s.runs.map(r=>r.id===meta.runId?updatedRun:r).slice(0,100);
        if(s.activeRun?.id===meta.runId)patch[KEYS.activeRun]={...s.activeRun,...updatedRun};
      }
    }
    await save(patch);
    return {valid,newCount,updatedCount,matchedCount,total:tenders.length,participations:partCount};
  });
}
return {ingest};
}
