/* ============================================================================
 *  SOI QUAN HỆ CHỦ ĐẦU TƯ – NHÀ THẦU (4.17.0)
 *
 *  Từ các gói KQLCNT đã tải về máy (hồ sơ chủ đầu tư, tra nhà thầu trúng
 *  thầu), mô tả từng CẶP chủ đầu tư – nhà thầu: bao nhiêu gói, bao nhiêu gói
 *  là hình thức ít cạnh tranh, bao nhiêu gói chỉ 1 nhà thầu dự, giảm giá trung
 *  vị. Và với một nhà thầu: đối tác liên danh thường xuyên.
 *
 *  Nguyên tắc trung thực:
 *    • Tỉ trọng chỉ tính theo ĐÚNG phạm vi dữ liệu. Dữ liệu là hồ sơ một chủ
 *      đầu tư → "% số gói của chủ đầu tư". Dữ liệu là các gói trúng của một nhà
 *      thầu → "% số gói trúng của nhà thầu". Không bao giờ suy ra tỉ trọng ở
 *      phía mình KHÔNG có đủ dữ liệu.
 *    • numBidderJoin = 0 là "không có số liệu", không phải "0 người dự".
 *    • Cỡ mẫu nhỏ được đánh dấu (stats.js MIN_SAMPLE).
 *    • "Cần xem" chỉ là gợi ý đọc kỹ hồ sơ — KHÔNG phải bằng chứng vi phạm. Ở
 *      địa bàn nhỏ, một nhà thầu trúng nhiều gói của một chủ đầu tư là bình
 *      thường (xem INVESTOR_DISCLAIMER của tác giả).
 * ========================================================================== */
import { describe, rate, numbers } from './stats.js';

const LESS_COMPETITIVE=new Set(['CDT','CDTRG','MSTT','TTH','DBDT']);
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const investorKeyOf=p=>clean(p.investorCode)||clean(p.investorName).toLocaleLowerCase('vi');
const codesOf=p=>[...new Set((p.winningTaxCodes||[]).filter(Boolean))];
const yearOf=p=>String(p.decisionDate||p.publicDateKqlcnt||'').slice(0,4);

export const RELATION_NOTE='Mô tả dữ liệu e-GP đã công bố và đã tải về máy. "Cần xem" chỉ gợi ý đọc kỹ hồ sơ trước khi dự thầu — KHÔNG phải bằng chứng vi phạm. Ở địa bàn nhỏ, một nhà thầu trúng nhiều gói của cùng chủ đầu tư là bình thường.';

/**
 * @param packages  gói KQLCNT đã chuẩn hoá (normalizeKqlcntRecord)
 * @param scope     'investor' (hồ sơ một chủ đầu tư) | 'contractor' (gói trúng của một nhà thầu)
 */
export function pairStats(packages=[],{scope='investor'}={}){
  const list=(Array.isArray(packages)?packages:[]).filter(p=>p&&typeof p==='object');
  const pairs=new Map(),names=new Map();
  for(const p of list){
    const inv=investorKeyOf(p);if(!inv)continue;
    for(const code of codesOf(p)){
      const key=`${inv}|${code}`;
      if(!pairs.has(key))pairs.set(key,{investorKey:inv,investorName:clean(p.investorName),taxCode:code,packages:[]});
      pairs.get(key).packages.push(p);
      // Tên theo MST chỉ lấy từ gói trúng độc lập có đúng 1 MST (liên danh không ghép được theo thứ tự).
      if(!p.isVenture&&codesOf(p).length===1){const n=clean((p.memberNames||[])[0])||clean(p.winnerName);if(n.length>(names.get(code)||'').length)names.set(code,n);}
    }
  }
  const totalBy=new Map();
  for(const p of list){
    const k=scope==='contractor'?'*':investorKeyOf(p);
    totalBy.set(k,(totalBy.get(k)||0)+1);
  }
  return [...pairs.values()].map(r=>{
    const n=r.packages.length;
    const formKnown=r.packages.filter(p=>clean(p.bidForm));
    const less=formKnown.filter(p=>LESS_COMPETITIVE.has(clean(p.bidForm).toUpperCase()));
    const bidKnown=r.packages.filter(p=>Number(p.numBidderJoin)>0);
    const single=bidKnown.filter(p=>Number(p.numBidderJoin)===1);
    const share=scope==='contractor'?rate(n,totalBy.get('*')):rate(n,totalBy.get(r.investorKey));
    const lessShare=rate(less.length,formKnown.length);
    const singleShare=rate(single.length,bidKnown.length);
    const value=numbers(r.packages.map(p=>p.winningPrice)).reduce((s,x)=>s+x,0);
    const flags=[];
    // Gợi ý "cần xem": nhiều gói (≥3) VÀ phần lớn là ít cạnh tranh hoặc chỉ 1 nhà thầu.
    if(n>=3&&lessShare.value!==null&&lessShare.value>=60)flags.push(`${lessShare.text} số gói (đã biết hình thức) là chỉ định thầu/hình thức ít cạnh tranh`);
    if(n>=3&&singleShare.value!==null&&singleShare.value>=60)flags.push(`${singleShare.text} số gói (đã biết số nhà thầu) chỉ có 1 nhà thầu dự`);
    if(share.reliable&&share.value>=50&&n>=3)flags.push(`chiếm ${share.text} ${scope==='contractor'?'số gói trúng của nhà thầu':'số gói của chủ đầu tư'} trong dữ liệu đã tải`);
    return {investorKey:r.investorKey,investorName:r.investorName,taxCode:r.taxCode,contractorName:names.get(r.taxCode)||'',
      packages:n,value,share,shareScope:scope,
      lessCompetitive:{count:less.length,known:formKnown.length,share:lessShare},
      singleBidder:{count:single.length,known:bidKnown.length,share:singleShare},
      discount:describe(r.packages.map(p=>p.discountRate)),
      years:[...new Set(r.packages.map(yearOf).filter(Boolean))].sort(),
      flags,review:flags.length>0};
  }).sort((a,b)=>Number(b.review)-Number(a.review)||b.packages-a.packages||b.value-a.value);
}

/** Đối tác liên danh thường xuyên của một nhà thầu (theo MST). */
export function venturePartners(packages=[],taxCode=''){
  const me=clean(taxCode);if(!me)return [];
  const rows=new Map();
  for(const p of Array.isArray(packages)?packages:[]){
    const codes=codesOf(p);
    if(codes.length<2||!codes.includes(me))continue;
    for(const other of codes.filter(c=>c!==me)){
      if(!rows.has(other))rows.set(other,{taxCode:other,packages:0,value:0,investors:new Set(),years:new Set()});
      const r=rows.get(other);r.packages++;
      const v=Number(p.winningPrice);if(Number.isFinite(v))r.value+=v;   // giá cả gói liên danh, không chia được phần góp
      if(clean(p.investorName))r.investors.add(clean(p.investorName));
      if(yearOf(p))r.years.add(yearOf(p));
    }
  }
  return [...rows.values()].map(r=>({taxCode:r.taxCode,packages:r.packages,ventureValue:r.value,investors:[...r.investors].slice(0,5),years:[...r.years].sort()}))
    .sort((a,b)=>b.packages-a.packages||b.ventureValue-a.ventureValue);
}
