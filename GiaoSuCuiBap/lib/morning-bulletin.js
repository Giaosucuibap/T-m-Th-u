/* ============================================================================
 *  BẢN TIN BUỔI SÁNG QUA TELEGRAM (4.17.0)
 *
 *  Một tin duy nhất mỗi sáng (mặc định 07:00 giờ Việt Nam), thay vì để người
 *  dùng tự mở phần mềm:
 *    1. Gói MỚI khớp tiêu chí ghi nhận trong 24 giờ qua (còn hạn).
 *    2. Gói đang theo dõi / đã ra quyết định sắp đóng thầu trong ≤3 ngày —
 *       ≤1 ngày được đưa lên đầu.
 *    3. Tình trạng: lượt quét gần nhất, kiểm tra cấu trúc e-GP, độ ổn định.
 *  Chỉ dùng dữ liệu đã có trên máy — bản tin KHÔNG tự hỏi e-GP. Mỗi ngày tối đa
 *  một tin (chống gửi lặp khi Chrome khởi động lại).
 * ========================================================================== */
export const BULLETIN_ALARM='gscb-morning-bulletin';
const VN=7*36e5,DAY=864e5,H=36e5;

export function vnDate(now=Date.now()){return new Date(now+VN).toISOString().slice(0,10);}

/** Lần gửi kế tiếp theo GIỜ VIỆT NAM, không phụ thuộc múi giờ của máy. */
export function nextBulletinTime(now=Date.now(),hhmm='07:00'){
  const [h,m]=String(hhmm).match(/^([01]\d|2[0-3]):([0-5]\d)$/)?String(hhmm).split(':').map(Number):[7,0];
  const local=new Date(now+VN);
  let at=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate(),h,m)-VN;
  if(at<=now)at+=DAY;
  return at;
}

/** Có nên gửi bây giờ không? Lỡ giờ (máy tắt) thì gửi bù trong buổi sáng, trước 12:00 VN. */
export function shouldSendBulletin({enabled,lastSentOn,now=Date.now(),hhmm='07:00',force=false}={}){
  if(force)return {send:true,reason:'force'};
  if(!enabled)return {send:false,reason:'off'};
  if(lastSentOn===vnDate(now))return {send:false,reason:'already'};
  const local=new Date(now+VN),mins=local.getUTCHours()*60+local.getUTCMinutes();
  const [h,m]=/^([01]\d|2[0-3]):([0-5]\d)$/.test(hhmm)?hhmm.split(':').map(Number):[7,0];
  if(mins<h*60+m)return {send:false,reason:'early'};
  if(local.getUTCHours()>=12)return {send:false,reason:'missed'};
  return {send:true,reason:'due'};
}

const esc=v=>String(v??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const money=v=>Number.isFinite(Number(v))&&Number(v)>0?`${(Number(v)/1e9).toLocaleString('vi-VN',{maximumFractionDigits:2})} tỷ`:'chưa rõ giá';
function left(close,now){
  const ms=Date.parse(close)-now;
  if(!Number.isFinite(ms))return '';
  if(ms<=0)return 'đã đóng';
  const h=Math.floor(ms/H);
  return h<24?`còn ${h} giờ`:`còn ${Math.floor(h/24)} ngày ${h%24} giờ`;
}

/**
 * @param tenders    kho gói (đã chấm điểm, có filterState, firstSeenAt, closeDate, watchlisted, decisionState)
 * @param minScore   ngưỡng điểm cho mục "gói mới"
 */
/** Chỉ đường dẫn https tới e-GP mới được đưa vào tin. */
function safeLink(u){try{const x=new URL(String(u||''));return x.protocol==='https:'&&x.hostname==='muasamcong.mpi.gov.vn'?x.href:'';}catch{return '';}}

export function buildBulletin({tenders=[],minScore=70,now=Date.now(),lastRun=null,liveCanary=null,trace=null,limit=10,maxRaw=3800}={}){
  const open=t=>{const c=Date.parse(t.closeDate);return Number.isFinite(c)&&c>now;};
  const fresh=tenders.filter(t=>t&&t.filterState==='MATCH'&&open(t)&&Number(t.score||0)>=minScore
      &&Number.isFinite(Date.parse(t.firstSeenAt))&&now-Date.parse(t.firstSeenAt)<=DAY)
    .sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  const tracked=t=>t.watchlisted||(t.decisionState&&t.decisionState!=='NEW');
  const soon=tenders.filter(t=>t&&tracked(t)&&open(t)&&Date.parse(t.closeDate)-now<=3*DAY)
    .sort((a,b)=>Date.parse(a.closeDate)-Date.parse(b.closeDate));
  const urgent=soon.filter(t=>Date.parse(t.closeDate)-now<=DAY);
  const day=new Date(now+VN);
  const lines=[`☀️ <b>Bản tin sáng ${day.getUTCDate()}/${day.getUTCMonth()+1} — Giáo Sư Cùi Bắp</b>`];
  lines.push('',`<b>1. Gói mới khớp tiêu chí (24 giờ qua): ${fresh.length}</b>`);
  if(!fresh.length)lines.push('Không có gói mới đạt ngưỡng trong dữ liệu đã quét.');
  // Liên kết gọn: đường dẫn e-GP dài ~700 ký tự, in thẳng ra sẽ làm bản tin dài gấp
  // nhiều lần và bị Telegram cắt thành nhiều tin.
  const freshAt=lines.length;
  for(const t of fresh.slice(0,limit))lines.push(`• ${esc(t.bidName)} — ${money(t.price)} · ${esc(t.investorName||'')} · ${left(t.closeDate,now)} · điểm ${Number(t.score||0)}`);
  if(fresh.length>limit)lines.push(`… và ${fresh.length-limit} gói nữa trong tiện ích.`);
  lines.push('',`<b>2. Gói đang theo dõi sắp đóng thầu (≤3 ngày): ${soon.length}</b>${urgent.length?` · <b>${urgent.length} gói ≤1 ngày</b>`:''}`);
  if(!soon.length)lines.push('Không có gói theo dõi nào sắp đóng thầu.');
  for(const t of soon.slice(0,limit))lines.push(`${Date.parse(t.closeDate)-now<=DAY?'🔴':'🟡'} ${esc(t.bidName)} — ${left(t.closeDate,now)} (${esc(t.displayCode||t.notifyNo||'')})`);
  lines.push('','<b>3. Tình trạng</b>');
  if(lastRun?.startedAt){
    const ago=Math.round((now-Date.parse(lastRun.finishedAt||lastRun.startedAt))/H);
    lines.push(`Lượt quét gần nhất: ${Number.isFinite(ago)?`${ago} giờ trước`:'không rõ'} · ${esc(lastRun.status||'')}${lastRun.partial?' (chưa đầy đủ)':''}`);
    if(Number.isFinite(ago)&&ago>=24)lines.push('⚠️ Hơn 24 giờ chưa quét — mục 1 có thể thiếu gói mới.');
  }else lines.push('⚠️ Chưa có lượt quét nào — mục 1 chưa có dữ liệu.');
  if(liveCanary?.status==='RED')lines.push('🔴 Kiểm tra cấu trúc e-GP đang ĐỎ — quét tự động đang dừng.');
  else if(liveCanary?.status==='GREEN')lines.push('🟢 Kiểm tra cấu trúc e-GP: khớp.');
  if(trace&&trace.runs)lines.push(`Độ ổn định 7 ngày: ${trace.ok}/${trace.runs} lượt hỏi e-GP thành công.`);
  lines.push('','<i>Bản tin chỉ dùng dữ liệu đã quét trên máy; không tự hỏi e-GP.</i>');
  /* Gắn liên kết "Mở e-GP" cho các gói đầu bảng khi CÒN CHỖ: hàm gửi Telegram cắt tin
     theo độ dài thô (gồm cả đường dẫn ẩn), và một đường dẫn e-GP dài ~700 ký tự. */
  let linked=0;
  fresh.slice(0,limit).forEach((t,i)=>{
    const href=safeLink(t.detailUrl);if(!href)return;
    const add=` · <a href="${esc(href).replace(/"/g,'&quot;')}">Mở e-GP</a>`;
    if(lines.join('\n').length+add.length<=maxRaw){lines[freshAt+i]+=add;linked++;}
  });
  return {text:lines.join('\n'),counts:{fresh:fresh.length,soon:soon.length,urgent:urgent.length,linked}};
}
