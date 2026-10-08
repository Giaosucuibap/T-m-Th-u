/* ============================================================================
 *  SỔ GIAI ĐOẠN TRA CỨU (4.17.0)
 *
 *  Mỗi lượt hỏi e-GP để lại MỘT dòng: chế độ, kết quả, hỏng ở giai đoạn nào,
 *  thời gian mở tab / giao tiêu chí / chờ trang đầu / tổng, số trang, số lần
 *  phải đọc lại. Chỉ giữ trên máy, tối đa TRACE_LIMIT dòng, không có tiêu chí,
 *  tên gói, tên doanh nghiệp hay mã số thuế — chỉ là con số và nhãn.
 *
 *  Mục đích: khi người dùng nói "lúc được lúc mất", ta có số đo thật: hỏng
 *  bao nhiêu phần trăm, ở bước nào, chậm ở bước nào — thay vì đoán.
 * ========================================================================== */
export const TRACE_LIMIT=200;

/** Giai đoạn hợp lệ, theo thứ tự một lượt đi qua. */
export const STAGES=Object.freeze({
  ok:'Thành công',
  page:'Trang e-GP lỗi / không có ô tìm kiếm',
  hook:'Không giao được tiêu chí cho trang',
  controls:'Trang chưa sẵn sàng nhận thao tác',
  trigger:'Trang bỏ qua thao tác tra cứu',
  response:'e-GP không trả lời',
  http:'e-GP trả mã lỗi HTTP',
  schema:'Dữ liệu e-GP sai cấu trúc',
  harvest:'Dừng giữa chừng khi đọc các trang sau',
  delivery:'Mất kết nối với tiện ích khi chuyển dữ liệu',
  cancelled:'Người dùng dừng'
});
/** Các chế độ tra cứu thật sự gửi tới tab e-GP (xem lookupKind trong background.js). */
export const MODE_LABELS=Object.freeze({
  tbmt:'Tìm gói thầu (TBMT)',exact:'Nhà thầu trúng thầu — tra đúng',discover:'Nhà thầu trúng thầu — dò rộng',
  'bbmt-list':'Gói đang chờ kết quả',khlcnt:'Kế hoạch lựa chọn nhà thầu',area:'Phân tích địa bàn',investor:'Hồ sơ chủ đầu tư'
});
const MODES=new Set(Object.keys(MODE_LABELS));
// null/rỗng là "không đo được", KHÔNG phải 0 ms (Number(null) === 0).
const ms=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<36e5?Math.round(Number(v)):null;
const n=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):0;

/** Dựng một dòng sổ từ tín hiệu KQLCNT_DONE. Chỉ lấy các trường số/nhãn đã biết. */
export function traceEntry(done={},{at=Date.now(),openMs=null,warm=null}={}){
  const t=done.trace&&typeof done.trace==='object'?done.trace:{};
  let stage=String(t.stage||'');
  if(!(stage in STAGES))stage=done.cancelled?'cancelled':done.ok===false?'response':'ok';
  if(done.ok!==false&&!done.cancelled)stage='ok';
  return {
    id:`${String(done.planId||'').slice(0,80)}:${Number(done.queryIndex)||0}`,
    at:new Date(at).toISOString(),
    mode:MODES.has(done.mode)?done.mode:'khac',
    ok:stage==='ok',
    stage,
    cached:Boolean(done.fromCache),
    openMs:ms(openMs),
    warm:typeof warm==='boolean'?warm:null,
    hookMs:ms(t.hookMs),
    firstPageMs:ms(t.firstPageMs),
    totalMs:ms(t.totalMs),
    pages:n(t.pages),
    reReads:n(t.reReads),
    status:Number.isInteger(t.status)&&t.status>=100&&t.status<600?t.status:null
  };
}

/** Thêm một dòng. KQLCNT_DONE được gửi lại tối đa 3 lần cho chắc ăn, nên cùng
 *  một lượt có thể tới hai lần — chỉ ghi lần đầu. */
export function appendTrace(list,entry,limit=TRACE_LIMIT){
  const rows=Array.isArray(list)?list:[];
  if(entry.id&&entry.id!==':0'&&rows.slice(-50).some(r=>r.id===entry.id))return rows;
  return [...rows,entry].slice(-limit);
}

/** Phân vị theo phương pháp "nearest-rank": giá trị thật đã đo, không nội suy. */
export function percentile(values,p){
  const v=values.filter(x=>Number.isFinite(x)).sort((a,b)=>a-b);
  if(!v.length)return null;
  return v[Math.min(v.length-1,Math.max(0,Math.ceil(p/100*v.length)-1))];
}

/** Thống kê cho trang Chẩn đoán. Lượt lấy từ bộ nhớ đệm và lượt người dùng
 *  dừng KHÔNG tính vào tỉ lệ lỗi/độ trễ — chúng không phản ánh e-GP. */
export function summarizeTrace(list,{sinceMs=null,now=Date.now()}={}){
  const rows=(Array.isArray(list)?list:[]).filter(r=>sinceMs===null||now-Date.parse(r.at)<=sinceMs);
  const real=rows.filter(r=>!r.cached&&r.stage!=='cancelled');
  const failures={};
  for(const r of real)if(!r.ok)failures[r.stage]=(failures[r.stage]||0)+1;
  const pick=(set,key)=>set.map(r=>r[key]).filter(x=>x!==null);
  const timing=set=>({
    p50:percentile(pick(set,'totalMs'),50),p95:percentile(pick(set,'totalMs'),95),
    firstPageP50:percentile(pick(set,'firstPageMs'),50),firstPageP95:percentile(pick(set,'firstPageMs'),95),
    openP50:percentile(pick(set,'openMs'),50),openP95:percentile(pick(set,'openMs'),95)
  });
  const ok=real.filter(r=>r.ok);
  const byMode={};
  for(const mode of new Set(real.map(r=>r.mode))){
    const m=real.filter(r=>r.mode===mode),mok=m.filter(r=>r.ok);
    byMode[mode]={runs:m.length,ok:mok.length,errorRate:m.length?(m.length-mok.length)/m.length:null,...timing(mok)};
  }
  return {
    runs:real.length,ok:ok.length,
    errorRate:real.length?(real.length-ok.length)/real.length:null,
    cached:rows.filter(r=>r.cached).length,
    cancelled:rows.filter(r=>r.stage==='cancelled').length,
    reReads:real.reduce((s,r)=>s+r.reReads,0),
    failures,byMode,...timing(ok)
  };
}
