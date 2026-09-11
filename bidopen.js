import { formatDate } from './lib/core.js';
import { formatOpeningMoney as formatMoney } from './lib/bbmt.js';
import { formatDiscount, priceFacts } from './lib/kqlcnt.js';
import { FIELD_OPTIONS, findBidder, bbmtReadStateOf, summarizeBidOpenings } from './lib/bbmt.js';
import { safeSource } from './lib/workspace.js';
import { openingTimeNotes } from './lib/bbmt-labels.js';

const $ = id => document.getElementById(id);
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const show = (el, on) => el.classList.toggle('hidden', !on);
let SCAN=null, POLL=null, loading=false, refreshAgain=false, starting=false, listHtml='',formRestored=false;
const running = () => ['LISTING','SCANNING','RUNNING'].includes(SCAN?.status);
function alertBox(text, error=false) {
  $('alert').textContent=text; $('alert').className='notice'+(error?' error':''); show($('alert'),Boolean(text));
}
$('field').innerHTML=FIELD_OPTIONS.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
function syncDateRange(){
  const custom=$('days').value==='custom';show($('dateRange'),custom);
  if(custom&&!$('fromDate').value&&!$('toDate').value){
    const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
    $('toDate').value=iso(new Date());$('fromDate').value=iso(new Date(Date.now()-30*86400000));
  }
}
$('days').addEventListener('change',syncDateRange);
async function start(){
  if(starting||running())return;
  if(!$('minPrice').checkValidity()||!$('maxPrice').checkValidity())return alertBox('Nhập giá không âm bằng đồng.',true);
  const custom=$('days').value==='custom';
  if(custom&&$('fromDate').value&&$('toDate').value&&$('fromDate').value>$('toDate').value)return alertBox('Ngày kết thúc phải từ ngày bắt đầu trở đi.',true);
  const payload={query:$('q').value.trim(),taxCode:$('q').value.trim(),days:custom?0:Number($('days').value),
    fromDate:custom?$('fromDate').value:'',toDate:custom?$('toDate').value:'',field:$('field').value,
    province:$('province').value.trim(),investor:$('investor').value.trim(),keyword:$('keyword').value.trim(),
    minPrice:Number($('minPrice').value)||0,maxPrice:Number($('maxPrice').value)||0,
    maxPackages:Number($('maxPackages').value),focusTab:false};
  if(payload.maxPrice&&payload.minPrice>payload.maxPrice)return alertBox('Giá đến phải lớn hơn hoặc bằng giá từ.',true);
  starting=true;$('go').disabled=true;alertBox('Đang lấy danh sách gói và chuẩn bị đọc biên bản…');
  try {const r=await send('BID_OPEN_SCAN',payload);if(!r?.ok)alertBox(r?.message||'Không bắt đầu được lượt quét.',true);else alertBox('');}
  catch(e){alertBox(e.message,true);}finally{starting=false;await refresh();}
}
// Storage events publish each completed package. Polling is a fallback and is
// restarted when the page is reopened in the middle of an active scan.
async function refresh(){
  if(loading){refreshAgain=true;return;}loading=true;
  try{
    const r=await send('GET_BID_OPEN_STATE');if(!r?.ok)return;SCAN=r.scan;
    if(running()&&!POLL)POLL=setInterval(refresh,1500);
    if(!running()&&POLL){clearInterval(POLL);POLL=null;}
    $('go').disabled=starting||running();show($('progress'),running());
    if(!SCAN){show($('summary'),false);show($('list-title'),false);$('list').innerHTML='';listHtml='';return;}
    if(!formRestored){
      formRestored=true;const c=SCAN.scope||{};
      for(const key of ['field','province','investor','keyword','minPrice','maxPrice'])$(key).value=c[key]||'';
      $('q').value=SCAN.contractorQuery||'';$('maxPackages').value=String(SCAN.maxPackages||150);
      $('days').value=c.fromDate||c.toDate?'custom':String(c.days||30);
      $('fromDate').value=c.fromDate||'';$('toDate').value=c.toDate||'';syncDateRange();
    }
    $('progress-text').textContent=SCAN.message||'Đang đọc…';
    const pkgs=SCAN.packages||[];
    const attempted=pkgs.filter(p=>['OK','EMPTY','PARTIAL','TIMEOUT'].includes(bbmtReadStateOf(p))).length;
    $('barfill').style.width=`${pkgs.length?Math.max(2,attempted/pkgs.length*100):2}%`;
    $('stop').disabled=false;
    render();
  }catch(e){alertBox('Không cập nhật được tiến độ: '+e.message,true);}
  finally{loading=false;if(refreshAgain){refreshAgain=false;void refresh();}}
}
const notes={PENDING:'Đang chờ đến lượt đọc biên bản.',READING:'Đang lấy bảng nhà thầu từ e-GP…',
  EMPTY:'Biên bản đã trả bảng rỗng; chưa ghi nhận nhà thầu trong dữ liệu này.',
  TIMEOUT:'Chưa nhận được bảng nhà thầu trong thời gian chờ. Có thể đọc lại riêng gói này.',
  PARTIAL:'Số nhà thầu đọc được còn ít hơn số e-GP công bố. Bảng dưới đây chưa đầy đủ.'};
function bidderRow(b,me,basis){
  const facts=b.multiLot||b.comparisonPending?{}:priceFacts(basis,b.finalPrice);
  const amount=facts.savedAmount,rate=facts.discountRate;
  const comparison=amount==null?'Chưa đủ dữ liệu':`${amount<0?'Vượt':amount>0?'Giảm':'Bằng mốc'} ${esc(formatMoney(Math.abs(amount)))}`;
  const percentage=rate==null?'—':`${Math.abs(rate).toLocaleString('vi-VN',{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
  return `<tr class="${me?'me':''}"><td class="num">${b.priceRank??'—'}</td>
    <td class="bidder-name"><strong>${esc(b.name)}</strong>${me?'<span class="tag">Theo dõi</span>':''}
    <div class="muted small">MST: ${esc(b.taxCode||'Chưa có')}</div>
    ${b.ventureName?`<div class="muted small">Liên danh: ${esc(b.ventureName)}</div>`:''}
    ${b.lotName||b.lotCode?`<div class="small">Phần/lô: ${esc(b.lotName||b.lotCode)}</div>`:''}</td>
    <td class="num">${esc(formatMoney(b.bidPrice))}</td>
    <td class="num muted">${b.discountPercent==null?'Chưa công bố':esc(formatDiscount(b.discountPercent))}</td>
    <td class="num final-price">${esc(formatMoney(b.finalPrice))}${b.finalPriceDerived?'<div class="small muted">Tính từ tỷ lệ giảm</div>':''}</td>
    <td class="num ${amount<0?'over-price':'saving'}">${comparison}<div>${percentage}</div>${b.multiLot?'<div class="small muted">Gói có nhiều phần/lô</div>':''}</td></tr>`;
}
function packageCard(p,me){
  const bidders=p.bidders||[], state=bbmtReadStateOf(p), basis=p.priceBasis??p.bidPrice;
  const bidderCount=new Set(bidders.map(b=>b.taxCode||b.nameFold||b.name)).size;
  const basisLabel=(p.priceBasisLabel||'Giá gói thầu (e-GP)')+(p.comparisonPending?' · Chưa đủ căn cứ đối chiếu':'');
  const source=safeSource(p.detailUrl);
  const timeNotes=openingTimeNotes(p,state);
  return `<article class="pkg" data-key="${esc(p.key)}">
    <div class="pkg-heading"><div class="pkg-topline"><span class="tbmt">${esc(p.notifyNoStand)}</span><span class="tag tag-wait">${esc(p.stageLabel||'Đang xét thầu')}</span></div>
    <h3>${source?`<a class="link" href="${esc(source)}" target="_blank" rel="noopener">${esc(p.bidName)} ↗</a>`:esc(p.bidName)}</h3>
    <div class="small muted">${esc(p.investorName)}${p.location?` · ${esc(p.location)}`:''}</div>
    <div class="pkg-facts"><div><span>${esc(basisLabel)}</span><b>${esc(formatMoney(basis))}</b></div>
      <div><span>Mở thầu</span><b>${esc(formatDate(p.bidRealityOpenDate||p.publicDateKqmt))}</b></div>
      <div><span>Nhà thầu đã đọc / e-GP công bố</span><b>${bidderCount} / ${p.numBidderJoin??'—'}</b></div></div></div>
    ${notes[state]?`<div class="empty-note ${state==='READING'?'reading':''}">${state==='READING'?'<span class="spin"></span>':''}${esc(state==='READING'?notes[state]:p.readIssue||notes[state])}${p.attempt>1&&state==='READING'?' (thử lại lần 2)':''}</div>`:''}
    ${bidders.length?`<div class="bidder-scroll" tabindex="0" role="region" aria-label="Bảng nhà thầu ${esc(p.notifyNoStand)}">
      <table><thead><tr><th>Hạng giá</th><th>Nhà thầu tham dự</th><th>Giá dự thầu</th><th>Giảm trên giá dự thầu</th><th>Giá sau giảm</th><th>Chênh lệch so mốc giá</th></tr></thead>
      <tbody>${bidders.map(b=>bidderRow(b,b===me,basis)).join('')}</tbody></table></div>`:''}
    <div class="pkg-footer"><span class="small muted">${timeNotes.length?timeNotes.map(n=>`${esc(n.label)} · ${esc(formatDate(n.at))}`).join('<br>'):'Bảng sẽ hiện ngay khi nhận được dữ liệu.'}</span>
      <button class="btn light retry-one" data-retry="${esc(p.key)}" ${running()?'disabled':''}>${bidders.length?'Cập nhật biên bản':'Đọc lại gói này'}</button></div></article>`;
}
function render(){
  if(!SCAN)return;
  const packages=SCAN.packages||[],s=summarizeBidOpenings(packages,SCAN.focusTaxCode,SCAN.contractorQuery);
  const complete=packages.filter(p=>['OK','EMPTY'].includes(bbmtReadStateOf(p))).length;
  const missing=packages.length-complete,watching=Boolean(SCAN.focusTaxCode||SCAN.contractorQuery);
  show($('summary'),packages.length>0);show($('list-title'),packages.length>0);show($('only-wrap'),watching);
  $('m-scan').textContent=complete;
  $('m-scan-sub').textContent=`trên ${packages.length} gói · ${missing} gói chưa đủ dữ liệu`+(SCAN.cachedCount?` · ${SCAN.cachedCount} bản lưu`:'');
  $('m-join-label').textContent=watching?'Gói khớp MST theo dõi':'Lượt nhà thầu đã đọc';
  $('m-join').textContent=watching?s.joinedCount:packages.reduce((n,p)=>n+(p.bidders?.length||0),0);
  $('m-join-sub').textContent=watching?`${s.cheapestCount} gói có giá thấp nhất trong bảng đã đọc`:'Hiển thị trực tiếp dưới từng gói';
  $('m-disc').textContent=watching?formatDiscount(s.avgDiscount):'—';
  $('m-disc-sub').textContent=watching?'Tỷ lệ giảm trên giá dự thầu của nhà thầu':'Mức giảm so mốc giá ở bảng từng gói';
  $('m-val').textContent=watching?formatMoney(s.totalBidValue):'—';
  $('csv').disabled=!packages.some(p=>p.bidders?.length);
  show($('retry-missing'),!running()&&missing>0);
  $('retry-missing').textContent=`Đọc tiếp ${missing} gói chưa đủ dữ liệu`;
  $('result-status').textContent=running()?`Đang cập nhật từng gói · ${complete}/${packages.length} bảng đã đọc đủ`:SCAN.message||'';
  const only=watching&&$('only').checked;
  const cards=packages.flatMap(p=>{const me=watching?findBidder(p.bidders,SCAN.focusTaxCode,SCAN.contractorQuery):null;return only&&!me?[]:[packageCard(p,me)];});
  const html=cards.join('')||(packages.length?'<div class="notice">Chưa thấy nhà thầu theo dõi trong các bảng đã đọc. Bỏ chọn bộ lọc để xem tiến độ của toàn bộ gói.</div>':'');
  if(html!==listHtml){$('list').innerHTML=html;listHtml=html;}
  if(!running())alertBox([['ERROR','PARTIAL'].includes(SCAN.status)?SCAN.message:'',s.ambiguityNote].filter(Boolean).join(' '),SCAN.status==='ERROR');
}
async function retry(key){
  if(starting||running())return;starting=true;$('retry-missing').disabled=true;
  try{const r=await send('RETRY_BID_OPEN',key?{key}:{});if(!r?.ok)alertBox(r?.message||'Không đọc lại được.',true);else alertBox('');}
  catch(e){alertBox(e.message,true);}finally{starting=false;$('retry-missing').disabled=false;await refresh();}
}
$('go').addEventListener('click',start);
$('only').addEventListener('change',render);
$('retry-missing').addEventListener('click',()=>retry());
$('list').addEventListener('click',e=>{const b=e.target.closest('[data-retry]');if(b)void retry(b.dataset.retry);});
$('stop').addEventListener('click',async()=>{$('stop').disabled=true;await send('CANCEL_BID_OPEN_SCAN');await refresh();});
$('csv').addEventListener('click',async()=>{try{const r=await send('EXPORT_BID_OPEN_CSV');if(!r?.ok)alertBox(r?.message||'Không xuất được Excel.',true);}catch(e){alertBox(e.message,true);}});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.bidOpenScan)void refresh();});
window.addEventListener('pagehide',()=>{if(POLL)clearInterval(POLL);});
void send('RECONCILE_LOOKUPS').then(refresh).catch(refresh);
void send('AREA_OPTIONS',{provincesOnly:true}).then(r=>{if(r?.ok)$('province-list').innerHTML=(r.provinces||[]).map(n=>`<option value="${esc(n)}">`).join('');}).catch(()=>{});
