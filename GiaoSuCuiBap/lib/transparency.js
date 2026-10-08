/* ============================================================================
 *  CHỈ SỐ MINH BẠCH THAM KHẢO CHO TỪNG GÓI (4.17.0)
 *
 *  Gom các TÍN HIỆU công khai thường được dùng để soi mức cạnh tranh của một
 *  gói thầu. Đây KHÔNG phải kết luận vi phạm: mỗi tín hiệu đều có lý do hợp
 *  pháp có thể giải thích (chỉ định thầu đúng luật, gói chuyên biệt ít nhà
 *  thầu…). Mục đích: giúp người dùng biết gói nào nên đọc kỹ hồ sơ trước khi
 *  bỏ công dự thầu, và nói rõ dữ liệu nào CÓ, dữ liệu nào THIẾU.
 *
 *  Nguyên tắc:
 *    • Thiếu dữ liệu ≠ tín hiệu xấu. Trường thiếu được ghi "chưa đủ dữ liệu",
 *      không trừ điểm.
 *    • Dưới 2 tín hiệu đọc được → không chấm điểm (null), chỉ liệt kê.
 *    • Mốc thời gian mời thầu là MỐC THAM CHIẾU, chỉnh được. Mặc định theo
 *      hiểu biết về Luật Đấu thầu 2023 (Luật 22/2023/QH15), Điều 45: 18 ngày với
 *      đấu thầu trong nước; 9 ngày với gói quy mô nhỏ. Người viết KHÔNG CHẮC
 *      tuyệt đối các con số và điều kiện áp dụng — cần đối chiếu văn bản hiện
 *      hành trước khi dùng cho bất kỳ việc gì ngoài tham khảo.
 * ========================================================================== */
export const TRANSPARENCY_REFS=Object.freeze({
  openDays:18,            // đấu thầu rộng rãi/hạn chế trong nước
  smallDays:9,            // gói quy mô nhỏ
  smallWorks:20e9,        // xây lắp, hỗn hợp ≤ 20 tỷ được coi là quy mô nhỏ
  smallGoods:10e9,        // hàng hoá, phi tư vấn ≤ 10 tỷ
  lowDiscount:1           // giảm giá dưới 1% khi chỉ 1–2 nhà thầu
});
const DAY=864e5;
const FORM={CDT:['Chỉ định thầu',30],CDTRG:['Chỉ định thầu rút gọn',30],MSTT:['Mua sắm trực tiếp',25],TTH:['Tự thực hiện',25],
  DBDT:['Đàm phán giá',20],CHCT:['Chào hàng cạnh tranh',10],DTHC:['Đấu thầu hạn chế',10],DTRR:['Đấu thầu rộng rãi',0],CGTT:['Chào giá trực tuyến',0]};
const num=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const fieldOf=p=>String(p.field||p.fieldCode||p.investField||'').toUpperCase();

/** Rút các dữ kiện cần thiết từ một gói TBMT (kho) hoặc một KQLCNT đã chuẩn hoá. */
export function transparencyFacts(p={}){
  const form=String(p.bidForm||'').trim().toUpperCase()||null;
  const online=p.isInternet===true||p.isInternet===1||p.isInternet==='1'?true:p.isInternet===false||p.isInternet===0||p.isInternet==='0'?false:null;
  const pub=Date.parse(p.publicDate||''),close=Date.parse(p.closeDate||p.bidCloseDate||'');
  const days=Number.isFinite(pub)&&Number.isFinite(close)&&close>pub?(close-pub)/DAY:null;
  // numBidderJoin = 0 là cách e-GP/bộ chuẩn hoá ghi "không có số liệu": một gói có
  // người trúng thì không thể có 0 nhà thầu tham dự.
  const bidders=num(p.numBidderJoin);
  const discount=num(p.discountRate);
  return {form,online,days,bidders:bidders&&bidders>0?bidders:null,discount,price:num(p.price??p.priceBasis),field:fieldOf(p)};
}

export function transparencyIndex(p={},refs=TRANSPARENCY_REFS){
  const f=transparencyFacts(p),r={...TRANSPARENCY_REFS,...refs},signals=[];
  const add=(id,label,state,weight,detail)=>signals.push({id,label,state,weight:state==='warn'?weight:0,detail});

  if(!f.form)add('form','Hình thức lựa chọn','unknown',0,'Chưa có dữ liệu hình thức lựa chọn nhà thầu.');
  else{const [name,w]=FORM[f.form]||[f.form,0];add('form','Hình thức lựa chọn',w?'warn':'ok',w,w?`${name} — ít cạnh tranh hơn đấu thầu rộng rãi.`:`${name}.`);}

  if(f.online===null)add('online','Qua mạng','unknown',0,'Chưa có dữ liệu qua mạng/không qua mạng.');
  else add('online','Qua mạng',f.online?'ok':'warn',10,f.online?'Lựa chọn nhà thầu qua mạng.':'KHÔNG qua mạng — khó theo dõi hơn.');

  if(f.days===null||!['DTRR','DTHC'].includes(f.form))add('days','Thời gian mời thầu','unknown',0,
    f.days===null?'Chưa đủ ngày đăng và ngày đóng thầu.':`${f.days.toFixed(1)} ngày — chỉ so mốc tham chiếu cho đấu thầu rộng rãi/hạn chế.`);
  else{
    const small=f.price!==null&&(['XL','HON_HOP'].includes(f.field)?f.price<=r.smallWorks:['HH','PTV'].includes(f.field)?f.price<=r.smallGoods:false);
    const ref=small?r.smallDays:r.openDays;
    const short=f.days<ref-0.5;
    add('days','Thời gian mời thầu',short?'warn':'ok',20,`${f.days.toFixed(1)} ngày từ khi đăng tới khi đóng thầu; mốc tham chiếu ${ref} ngày${small?' (gói quy mô nhỏ)':''} — cần đối chiếu văn bản hiện hành.`);
  }

  if(f.bidders===null)add('bidders','Số nhà thầu tham dự','unknown',0,'Chưa có số nhà thầu tham dự (chỉ có sau khi mở thầu/có kết quả).');
  else add('bidders','Số nhà thầu tham dự',f.bidders===1?'warn':f.bidders===2?'warn':'ok',f.bidders===1?30:10,
    f.bidders===1?'Chỉ 1 nhà thầu tham dự.':f.bidders===2?'Chỉ 2 nhà thầu tham dự.':`${f.bidders} nhà thầu tham dự.`);

  if(f.discount===null||f.bidders===null)add('discount','Tỉ lệ giảm giá','unknown',0,'Chưa đủ giá trúng và số nhà thầu để đánh giá.');
  else{const low=f.bidders<=2&&f.discount<r.lowDiscount;
    add('discount','Tỉ lệ giảm giá',low?'warn':'ok',15,`Giảm ${f.discount.toLocaleString('vi-VN')}% so với giá gói/dự toán${low?` khi chỉ ${f.bidders} nhà thầu — rất sát giá trần`:''}.`);}

  const known=signals.filter(s=>s.state!=='unknown');
  const score=known.length>=2?Math.max(0,100-known.reduce((s,x)=>s+x.weight,0)):null;
  const level=score===null?'unknown':score>=80?'low':score>=50?'medium':'high';
  const label={unknown:'Chưa đủ dữ liệu',low:'Ít tín hiệu cần lưu ý',medium:'Có tín hiệu cần xem',high:'Nhiều tín hiệu cần xem kỹ'}[level];
  return {score,level,label,signals,known:known.length,warnings:known.filter(s=>s.state==='warn').length,
    note:'Chỉ số tham khảo từ dữ liệu công khai e-GP; không phải kết luận vi phạm.'};
}

const escHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Nhãn gọn cho giao diện; rê chuột xem từng tín hiệu và lời nhắc "không phải kết luận vi phạm". */
export function transparencyChip(index){
  const tip=[...index.signals.map(s=>`${s.state==='warn'?'⚠':s.state==='ok'?'✓':'?'} ${s.label}: ${s.detail}`),index.note].join('\n');
  const text=index.score===null?'Minh bạch: chưa đủ dữ liệu':`Minh bạch: ${index.score}/100 · ${index.label}`;
  return `<span class="reason-chip tp tp-${escHtml(index.level)}" title="${escHtml(tip)}">${escHtml(text)}</span>`;
}
