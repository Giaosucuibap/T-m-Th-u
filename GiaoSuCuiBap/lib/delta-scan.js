/* ============================================================================
 *  QUÉT NHANH PHẦN MỚI CHO BỘ SĂN TBMT (4.17.0)
 *
 *  Bộ săn chạy lặp lại cùng tiêu chí nhiều lần mỗi ngày. Lần nào cũng đọc lại
 *  toàn bộ danh sách là phí: phần lớn gói đã thấy từ lần trước. "Quét nhanh"
 *  chỉ hỏi e-GP các gói ĐĂNG TỪ lần trước (lùi thêm 1 ngày chồng lấn).
 *
 *  VÌ SAO PHẢI CẨN THẬN: bộ lọc `publicDate` theo khoảng đã được ĐO trên e-GP
 *  thật cho hồ sơ kết quả LCNT (lib/kqlcnt.js: 262/477 gói), nhưng CHƯA được
 *  đo cho TBMT. Và e-GP từng nhận một bộ lọc ngày khác (`decisionDate`) rồi trả
 *  0 kết quả SAI. Một lượt quét nhanh trả 0 gói có thể là "không có gói mới",
 *  cũng có thể là "bộ lọc hỏng". Vì vậy:
 *    1. Mỗi ngày vẫn quét ĐẦY ĐỦ ít nhất một lần.
 *    2. Lượt nhanh có gói CŨ hơn mốc → e-GP bỏ qua bộ lọc → tắt quét nhanh.
 *    3. Lượt nhanh trả 0 gói khi bộ lọc CHƯA được chứng minh → quét đầy đủ ngay.
 *    4. Lượt đầy đủ ĐỐI SOÁT với các lượt nhanh trước: có gói đăng trong khoảng
 *       quét nhanh mà quét nhanh không trả về → tắt quét nhanh, nói rõ lý do.
 *    5. Lượt chưa đầy đủ (PARTIAL/ERROR) không bao giờ dời mốc.
 * ========================================================================== */
export const DELTA_OVERLAP_MS=864e5;          // lùi 1 ngày so với lần thành công trước
export const FULL_EVERY_MS=864e5;             // ít nhất 1 lượt đầy đủ mỗi 24 giờ
export const INDEX_LAG_MS=10*60_000;          // gói đăng sát giờ quét có thể chưa kịp vào chỉ mục
export const MAX_AUDIT_KEYS=3000;

const iso=v=>{const t=Date.parse(v);return Number.isFinite(t)?new Date(t).toISOString():null;};
const keyList=v=>Array.isArray(v)?[...new Set(v.map(k=>String(k).slice(0,120)).filter(Boolean))]:[];

export function safeDeltaState(raw){
  const r=raw&&typeof raw==='object'?raw:{};
  const d=r.lastDelta&&typeof r.lastDelta==='object'?r.lastDelta:null;
  const keys=d?keyList(d.keys):[];
  return {
    lastFullAt:iso(r.lastFullAt),lastOkAt:iso(r.lastOkAt),
    proven:r.proven===true,broken:r.broken===true,brokenReason:String(r.brokenReason||'').slice(0,300),
    lastDelta:d&&iso(d.since)&&iso(d.at)?{since:iso(d.since),at:iso(d.at),keys:keys.slice(0,MAX_AUDIT_KEYS),
      truncated:d.truncated===true||keys.length>MAX_AUDIT_KEYS}:null,
    fullRuns:Number.isSafeInteger(r.fullRuns)&&r.fullRuns>=0?r.fullRuns:0,
    deltaRuns:Number.isSafeInteger(r.deltaRuns)&&r.deltaRuns>=0?r.deltaRuns:0
  };
}

/** Lượt tới nên quét đầy đủ hay nhanh? */
export function planScan(hunt={},now=Date.now(),{forceFull=false}={}){
  if(hunt.kind!=='tbmt'||!hunt.delta)return {mode:'full',reason:'off'};
  const st=safeDeltaState(hunt.deltaState);
  if(st.broken)return {mode:'full',reason:'broken'};
  if(forceFull)return {mode:'full',reason:'forced'};
  const lastFull=Date.parse(st.lastFullAt);
  if(!Number.isFinite(lastFull)||now-lastFull>=FULL_EVERY_MS)return {mode:'full',reason:'daily-full'};
  const lastOk=Math.max(lastFull,Date.parse(st.lastOkAt)||0);
  return {mode:'delta',reason:'delta',since:lastOk-DELTA_OVERLAP_MS};
}

/** Thêm sàn ngày đăng vào truy vấn TBMT. `from`/`to` là epoch mili-giây —
 *  đúng định dạng đã đo được cho `publicDate` (lib/kqlcnt.js). */
export function addPublicDateFloor(query,since,now=Date.now()){
  if(!query||!Number.isFinite(since))return query;
  return {...query,filters:[...(query.filters||[]).filter(f=>f.fieldName!=='publicDate'),
    {fieldName:'publicDate',searchType:'range',from:Math.floor(since),to:Math.floor(now+DELTA_OVERLAP_MS)}]};
}

/**
 * Đánh giá một lượt bộ săn vừa xong và trả trạng thái mới.
 * @param plan    kết quả planScan() lúc bắt đầu lượt
 * @param job     lượt đã kết thúc: status, partial, capped, foundKeys, startedAt
 * @param pubOf   key → ngày đăng (ISO) của gói, đọc từ kho
 */
export function evaluateScan({plan,job,pubOf,state,now=Date.now()}){
  const st=safeDeltaState(state);
  const complete=job?.status==='SUCCESS'&&!job.partial&&!job.capped;
  if(!complete)return {state:st,followUpFull:false,note:'Lượt chưa đầy đủ — giữ nguyên mốc quét.'};
  const keys=keyList(job.foundKeys);
  const startedAt=Date.parse(job.startedAt)||now;
  const pub=k=>Date.parse(pubOf(k));

  if(plan?.mode!=='delta'){
    let note='Quét đầy đủ.';
    const next={...st,lastFullAt:new Date(startedAt).toISOString(),lastOkAt:new Date(startedAt).toISOString(),lastDelta:null,fullRuns:st.fullRuns+1};
    const d=st.lastDelta;
    if(d&&!d.truncated){
      const from=Date.parse(d.since),to=Date.parse(d.at)-INDEX_LAG_MS,seen=new Set(d.keys);
      const missed=keys.filter(k=>{const p=pub(k);return Number.isFinite(p)&&p>=from&&p<=to&&!seen.has(k);});
      if(missed.length){
        next.broken=true;next.proven=false;
        next.brokenReason=`Lượt đầy đủ thấy ${missed.length} gói đăng trong khoảng quét nhanh mà quét nhanh KHÔNG trả về (ví dụ ${missed.slice(0,3).join(', ')}). Đã tắt quét nhanh cho bộ săn này; mọi lượt sau đều quét đầy đủ.`;
        note=next.brokenReason;
      }else note=`Quét đầy đủ; đối soát với quét nhanh: khớp (${d.keys.length} gói).`;
    }
    return {state:next,followUpFull:false,note};
  }

  // ---- Lượt quét nhanh ----
  const since=Number(plan.since);
  const older=keys.filter(k=>{const p=pub(k);return Number.isFinite(p)&&p<since-DELTA_OVERLAP_MS;});
  const undated=keys.filter(k=>!Number.isFinite(pub(k)));
  if(older.length){
    return {state:{...st,broken:true,proven:false,lastDelta:null,
      brokenReason:`e-GP trả ${older.length} gói đăng TRƯỚC mốc quét nhanh — e-GP không lọc theo ngày đăng cho loại tìm kiếm này. Đã tắt quét nhanh; mọi lượt sau đều quét đầy đủ.`},
      followUpFull:false,note:'e-GP bỏ qua bộ lọc ngày đăng — đã tắt quét nhanh.'};
  }
  if(!keys.length&&!st.proven){
    return {state:st,followUpFull:true,
      note:'Quét nhanh trả 0 gói nhưng bộ lọc ngày đăng CHƯA được kiểm chứng trên máy này — chạy quét đầy đủ ngay để chắc chắn không sót.'};
  }
  const prev=st.lastDelta;
  const merged=prev&&!prev.truncated?[...new Set([...prev.keys,...keys])]:keys;
  return {state:{...st,proven:st.proven||(keys.length>0&&!undated.length),lastOkAt:new Date(startedAt).toISOString(),
    deltaRuns:st.deltaRuns+1,
    lastDelta:{since:new Date(prev?Math.min(Date.parse(prev.since),since):since).toISOString(),at:new Date(startedAt).toISOString(),
      keys:merged.slice(0,MAX_AUDIT_KEYS),truncated:Boolean(prev?.truncated)||merged.length>MAX_AUDIT_KEYS}},
    followUpFull:false,note:`Quét nhanh: ${keys.length} gói đăng từ ${new Date(since+7*36e5).toISOString().slice(0,16).replace('T',' ')} (giờ VN).`};
}
