import { firstStampMs } from './core.js';
import { safeRunForBackup } from './backup.js';
import { resultRevision } from './result-view.js';

const fields={bidName:'Tên gói',price:'Giá gói thầu',closeDate:'Hạn đóng thầu',publicDate:'Ngày đăng',investorName:'Chủ đầu tư',location:'Địa điểm',investField:'Lĩnh vực e-GP',filterState:'Đối chiếu tiêu chí'};
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
function runMeta(run){return {id:run.id,label:run.label||run.startedAt||run.id,startedAt:run.startedAt,coverage:run.coverage||null,criteria:run.criteria||{}};}
/** Compare captured facts, never substitute today's warehouse into old runs. */
export function compareSearchRuns(a,b) {
  if(!a||!b)throw Error('Không tìm thấy đủ hai lượt tra cứu đã lưu.');
  if(a.id===b.id)throw Error('Hãy chọn hai lượt tra cứu khác nhau.');
  const left=safeRunForBackup(a),right=safeRunForBackup(b);
  const ak=new Set(left.foundKeys||[]),bk=new Set(right.foundKeys||[]);
  const rows=[],counts={leftOnly:0,rightOnly:0,changed:0,unchanged:0,unavailable:0},warnings=[];
  let partiallyCompared=0;
  for(const key of new Set([...ak,...bk])){
    const l=left.resultStates?.[key],r=right.resultStates?.[key];
    let kind,changes=[],incomplete=false;
    if((ak.has(key)&&(!l||!has(l,'bidName')))||(bk.has(key)&&(!r||!has(r,'bidName'))))kind='unavailable';
    else if(!bk.has(key))kind='leftOnly';
    else if(!ak.has(key))kind='rightOnly';
    else {
      for(const [field,label] of Object.entries(fields)){
        if(!has(l,field)||!has(r,field)){incomplete=true;continue;}
        if(JSON.stringify(l[field])!==JSON.stringify(r[field]))changes.push({field,label,before:l[field],after:r[field]});
      }
      kind=changes.length?'changed':incomplete?'unavailable':'unchanged';
      if(changes.length&&incomplete)partiallyCompared++;
    }
    counts[kind]++;rows.push({key,code:key,name:r?.bidName||l?.bidName||key,kind,left:l||null,right:r||null,changes,incomplete});
  }
  if(!left.coverage?.complete||!right.coverage?.complete)warnings.push('Có lượt chưa xác nhận tải đủ. Chỉ lượt A/B nghĩa là không thấy trong phần dữ liệu của lượt còn lại, không khẳng định gói mới xuất hiện hoặc đã bị gỡ khỏi e-GP.');
  if(JSON.stringify(left.criteria||{})!==JSON.stringify(right.criteria||{}))warnings.push('Hai lượt dùng tiêu chí khác nhau; chênh lệch có thể do bộ lọc.');
  if(counts.unavailable)warnings.push(`${counts.unavailable} gói thiếu ảnh chụp dữ liệu cũ hoặc thiếu trường để đối chiếu. Không dùng giá trị hiện tại để điền bù.`);
  if(partiallyCompared)warnings.push(`${partiallyCompared} gói có thay đổi đã xác định nhưng vẫn thiếu một số trường để so sánh đầy đủ.`);
  return {ok:true,left:runMeta(left),right:runMeta(right),counts,rows,warnings,partiallyCompared};
}
/** Six calendar months in Vietnam time, clamped to the last day of that month. */
export function cleanupCutoff(now=Date.now()){
  const d=new Date(now+7*3600000),day=d.getUTCDate();
  d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-6);
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  d.setUTCDate(Math.min(day,last));return d.getTime()-7*3600000;
}
export function warehouseCleanupPlan(state,now=Date.now()) {
  const cutoff=cleanupCutoff(now),protectedKeys=new Set();
  for(const run of [...(state.runs||[]),state.activeRun].filter(Boolean))for(const key of run.foundKeys||[])protectedKeys.add(key);
  for(const [key,value] of Object.entries(state.checklists||{}))if(value&&Object.keys(value).length)protectedKeys.add(key);
  for(const c of state.pastContracts||[])if(c.tenderKey)protectedKeys.add(c.tenderKey);
  const all=state.tenders||[];
  const eligible=t=>{
    const close=firstStampMs(t,['closeDate']);
    return typeof t.key==='string'&&Boolean(t.key.trim())&&close!==null&&close<cutoff&&!t.watchlisted&&(!t.decisionState||t.decisionState==='NEW')&&!protectedKeys.has(t.key);
  };
  // Imported legacy data may contain duplicate keys. Deletion is by key, so
  // every occurrence must qualify; one protected/recent occurrence protects all.
  for(const t of all)if(!eligible(t))protectedKeys.add(t.key);
  const rows=all.filter(eligible);
  return {cutoff:new Date(cutoff).toISOString(),count:rows.length,retainedCount:(state.tenders||[]).length-rows.length,keys:rows.map(t=>t.key),
    preview:rows.slice(0,20).map(t=>({key:t.key,code:t.notifyNo||t.key,name:t.bidName||'',closeDate:t.closeDate})),
    signature:resultRevision({tenders:state.tenders,checklists:state.checklists,runs:(state.runs||[]).map(r=>({id:r.id,foundKeys:r.foundKeys})),activeRun:state.activeRun,pastContracts:state.pastContracts}),
    message:'Chỉ dọn gói đã đóng quá 6 tháng; giữ gói đang theo dõi, có quyết định/checklist/hợp đồng hoặc còn trong lịch sử tra cứu. Không tự động dọn.'};
}
export function warehouseStatus(state){
  const rows=state.tenders||[],bytes=new TextEncoder().encode(JSON.stringify(rows)).byteLength;
  return {ok:true,count:rows.length,bytes,bytesEstimated:true,warning:rows.length>=10000||bytes>=20*1024*1024,retentionMonths:6};
}
