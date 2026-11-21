/* ============================================================================
 *  TỰ CHẠY LẠI CẢ LƯỢT KHI HỎNG TRƯỚC TRANG ĐẦU (4.17.0)
 *
 *  Chỉ chạy lại khi CHẮC CHẮN không có dữ liệu nào của truy vấn này đã vào
 *  kho, và lỗi thuộc loại "trang e-GP chưa sẵn sàng / mạng" — tải lại trang là
 *  cách chữa đúng bệnh. Không bao giờ chạy lại khi:
 *    • đã nhận được dù chỉ một trang (chạy lại có thể che giấu dữ liệu thiếu);
 *    • e-GP trả sai cấu trúc (chạy lại vẫn sai — phải báo);
 *    • e-GP trả mã HTTP 4xx/429 hoặc trang báo lỗi/từ chối truy cập (gõ cửa
 *      thêm chỉ làm tệ hơn — 429 đã có cơ chế chờ riêng);
 *    • người dùng đã dừng, hoặc lượt này đã được chạy lại một lần;
 *    • phát lại từ bộ nhớ đệm.
 * ========================================================================== */
export const RETRY_STAGES=Object.freeze(['hook','controls','trigger','response']);
export const AUTO_RETRY_DELAY_MS=2500;

/** @returns {{retry:boolean, reason:string, qi?:number, stage?:string}} */
export function decideAutoRetry({payload,job}={}){
  if(!payload||payload.ok!==false)return {retry:false,reason:'not-failure'};
  if(payload.fromCache)return {retry:false,reason:'cache'};
  const t=payload.trace&&typeof payload.trace==='object'?payload.trace:null;
  if(!t||!RETRY_STAGES.includes(t.stage))return {retry:false,reason:'stage'};
  if(Number(t.attempt)===2)return {retry:false,reason:'already'};
  if(Number(t.pages)>0)return {retry:false,reason:'has-pages'};
  if(!job||job.cancelled||!['STARTING','OPENING','RUNNING','LISTING'].includes(job.status))return {retry:false,reason:'job-ended'};
  const qi=Number(payload.queryIndex??0);
  if(!Number.isInteger(qi)||qi<0)return {retry:false,reason:'query-index'};
  if(Number(job.qi||0)!==qi)return {retry:false,reason:'query-index'};
  if((job.autoRetries||[]).includes(qi))return {retry:false,reason:'already'};
  return {retry:true,reason:'transient',qi,stage:t.stage};
}

export function retryNotice(stage){
  const why={hook:'trang e-GP chưa nhận tiêu chí',controls:'trang e-GP chưa hiện điều khiển tra cứu',
    trigger:'trang e-GP bận và bỏ qua thao tác',response:'e-GP không trả lời'}[stage]||'e-GP chưa trả dữ liệu';
  return `Lần 1: ${why}, chưa có dữ liệu nào. Đang tải lại trang e-GP và tự chạy lại một lần…`;
}
