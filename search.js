import { passesHardFilter, hardFilterReason } from './lib/hard-filter.js';
import { GATE_LABEL, coverageText } from './lib/match-gate.js';
import { formatMoney, formatDate, BID_STATUS_LABEL } from './lib/core.js';
import { statusOf, filterAndSort, missingFields, dataConfidence, actionFor } from './lib/decision.js';
import { validateCriteria, CRITERIA_FIELDS, runTenders, safeSource, deadlineInfo, freshness, buildDeadlineCalendar, splitProvinceNames } from './lib/workspace.js';
import { icon } from './lib/icons.js';
import { TENDER_CATEGORIES, normalizeCategory, categoryLabel, tenderFieldOf, matchesTenderCategory } from './lib/tender-categories.js';
import { lifecycleLabel } from './lib/lifecycle.js';
import { checklistItemsFor, checklistProgress } from './lib/capability.js';
import { bestContractMatch, MATCH_LABEL } from './lib/contracts.js';
import { checklistDueItems } from './lib/checklist-due.js';
import { approvalLabel } from './lib/approval.js';
import { contractMatrix, matrixSummary } from './lib/hsmt-matrix.js';
import { marketBidPercentiles } from './lib/rivals.js';
import { guaranteeReminder } from './lib/audit-filter.js';

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const show=(id,on)=>$(id).classList.toggle('hidden',!on);
const LAST='gscb_last_search', RUN='gscb_search_run';
let STATE={tenders:[],runs:[],savedSearches:[]}, runId='', page=1, timer=null, refreshing=false, starting=false;
let filtered=[], selected=new Set(), toastTimer=null, wardRequest=0, pendingCriteria=null;
const checklistDrafts=new Map(), checklistSaving=new Set();
const PAGE_SIZE=30;
const readLocal=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k))??fallback;}catch{return fallback;}};
const writeLocal=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}}
const criteria=()=>Object.fromEntries(CRITERIA_FIELDS.map(k=>[k,$(k).value.trim()]));
$('category').innerHTML=TENDER_CATEGORIES.map(c=>`<option value="${esc(c.value)}">${esc(c.label)}</option>`).join('');
function fillCriteria(c){for(const k of CRITERIA_FIELDS)$(k).value=k==='category'?normalizeCategory(c?.[k]):(c?.[k]??'');writeLocal(LAST,criteria());loadWards();}
async function send(type,payload={}){
  try {const r=await chrome.runtime.sendMessage({type,payload});return r||{ok:false,message:'Tiện ích chưa trả lời. Thử tải lại trang.'};}
  catch(e){return {ok:false,message:'Không kết nối được tiện ích. Tải lại trang sau khi cập nhật. '+String(e.message||'').slice(0,160)};}
}
function notify(message,error=false){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').className=`toast${error?' error':''}`;toastTimer=setTimeout(()=>show('toast',false),5500);}
function alertMessage(message){$('alert').textContent=message;$('alert').className='notice error'+(message?'':' hidden');}
function chosenRun(){return STATE.runs.find(r=>r.id===runId)||(STATE.activeRun?.id===runId?STATE.activeRun:null);}
function currentRows(){
  const run=chosenRun();
  return runTenders(STATE.tenders,run).map(t=>{
    const saved=run?.resultStates?.[t.key];
    const gate=saved?.filterState?null:run?.criteria?passesHardFilter(t,run.criteria):{state:'INSUFFICIENT',reason:'Bản lưu cũ chưa ghi tiêu chí để đối chiếu'};
    return {...t,...(saved||{}),filterState:saved?.filterState||gate.state,filterReason:hardFilterReason(saved?.filterState?{reason:saved.filterReason,state:saved.filterState}:gate),matched:(saved?.matched??t.matched) && (saved?.filterState||gate.state)==='MATCH'};
  });
}
function selectedRows(){return currentRows().filter(t=>selected.has(t.key));}

async function loadProvinces(){
  const r=await send('AREA_OPTIONS');
  if(!r.ok){$('ward-hint').textContent='Danh mục địa bàn chưa tải được; vẫn có thể tìm theo từ khóa.';return;}
  $('province-list').innerHTML=(r.provinces||[]).map(n=>`<option value="${esc(n)}"></option>`).join('');
}
async function loadWards(){
  const request=++wardRequest, province=$('province').value.trim();
  $('ward-list').innerHTML='';
  if(!province)return;
  if(splitProvinceNames(province).length>1){$('ward-hint').textContent='Đang chọn nhiều tỉnh; nhập tên xã/phường để lọc tiếp nếu cần.';return;}
  const r=await send('AREA_OPTIONS',{province});
  if(request!==wardRequest)return;
  $('ward-hint').textContent='';
  if(r.ok)$('ward-list').innerHTML=(r.wards||[]).map(n=>`<option value="${esc(n)}"></option>`).join('');
}
async function start(){
  if(starting)return;
  const v=validateCriteria(criteria());
  if(!v.ok){alertMessage(v.message);$(v.field).focus();return;}
  starting=true;$('go').disabled=true;alertMessage('');
  writeLocal(LAST,criteria());
  $('progress-text').textContent='Đang chuẩn bị lượt tìm trên e-GP…';show('progress',true);
  const r=await send('TBMT_SEARCH',{...v.criteria,focusTab:true});
  starting=false;
  if(!r.ok){alertMessage(r.message||'Chưa bắt đầu được lượt tìm.');show('progress',false);$('go').disabled=false;return;}
  runId=r.runId;writeLocal(RUN,runId);selected.clear();page=1;
  await refresh();
}
function schedule(){clearTimeout(timer);if(STATE.activeRun)timer=setTimeout(refresh,2000);}
async function refresh(){
  if(refreshing)return;refreshing=true;
  try{
    const r=await send('GET_SEARCH_STATE');
    if(!r.ok){alertMessage(r.message);return;}
    STATE=r;
    if(!runId)runId=(STATE.activeRun?.mode==='form'?STATE.activeRun:null)?.id||STATE.runs.find(x=>x.mode==='form')?.id||'';
    // An absent remembered run must never silently display another run's records.
    renderPresets();render();schedule();
  }finally{refreshing=false;}
}

function renderPresets(){
  $('saved-searches').innerHTML=(STATE.savedSearches||[]).map(s=>`<span class="saved-search"><button data-preset="${esc(s.id)}" type="button" title="Điền tiêu chí: ${esc(s.name)}">${esc(s.name)}</button><button data-delete-preset="${esc(s.id)}" type="button" aria-label="Xóa bộ tìm kiếm ${esc(s.name)}">${icon('close',12)}</button></span>`).join('');
}
const RUN_LABEL={SUCCESS:'Đã hoàn tất',PARTIAL:'Kết quả một phần',ERROR:'Lượt tìm có lỗi',CANCELLED:'Đã dừng',TIMEOUT:'Quá thời gian',STARTING:'Đang chuẩn bị',RUNNING:'Đang tìm'};
function renderScope(run,all){
  show('run-scope',Boolean(run)||Boolean(runId));
  if(!run){
    if(runId)$('run-scope').innerHTML=`${icon('info')}<div>Lượt tìm đã chọn không còn trong lịch sử. Nhập tiêu chí để tìm lại hoặc chọn một lượt khác.<br>${historySelect()}</div>`;
    return;
  }
  const incomplete=['PARTIAL','ERROR','TIMEOUT','CANCELLED'].includes(run.status)||run.partial;
  const hasKeys=Array.isArray(run.foundKeys);
  const lost=hasKeys?Math.max(0,new Set(run.foundKeys).size-all.length):0;
  $('run-scope').className=`run-strip${incomplete||lost||!hasKeys?' warn':''}`;
  const localKeyword=Boolean(run.criteria?.investor&&run.criteria?.keyword);
  const category=normalizeCategory(run.criteria?.category);
  const description=run.criteria?[category?categoryLabel(category):'',run.criteria.keyword,run.criteria.investor,run.criteria.province,run.criteria.ward].filter(Boolean).join(' · '):'';
  $('run-scope').innerHTML=`${icon(incomplete?'info':'check',18)}<div><b>${esc(RUN_LABEL[run.status]||run.status)}</b>${description?` · ${esc(description)}`:''}<span class="run-date">${esc(formatDate(run.finishedAt||run.startedAt))} · Giờ Việt Nam · Chỉ dữ liệu của lượt này</span>${incomplete?`<div>${esc(run.message||'Lượt bị gián đoạn.')} Không xem đây là toàn bộ kết quả thị trường.</div>`:''}${!run.resultStates?'<div>Bản lưu cũ chưa lưu riêng giá và kết quả đối chiếu tại thời điểm tìm. Các nhãn dưới đây được kiểm tra lại trên dữ liệu hiện có; nên chạy lại để xác nhận.</div>':''}${localKeyword?'<div>Từ khóa tên gói lọc tại máy trên các trang đã tải theo chủ đầu tư.</div>':''}${category.startsWith('TV_')?'<div>Chuyên môn tư vấn nhận diện theo tên gói trong các trang đã tải.</div>':''}${lost?`<div>${lost} gói của lượt này không còn trong kho (đã xóa hoặc vượt giới hạn lưu).</div>`:''}${!hasKeys?'<div>Bản lưu cũ không có liên kết kết quả. Cần chạy lại để xác định đúng phạm vi.</div>':''}${run.coverage?`<div>${esc(run.coverage.text||coverageText(run.coverage))}</div>`:''}<div>Điểm phù hợp dùng để ưu tiên các gói khớp tiêu chí; không phải xác suất trúng thầu.</div>${historySelect()}</div>`;
}
function historySelect(){
  const runs=STATE.runs.filter(x=>x.mode==='form');
  if(runs.length<2&&!runId)return '';
  return `<label class="history-label">Lịch sử tra cứu <select id="run-history" aria-label="Chọn lượt tìm trong lịch sử"><option value="" disabled ${!runs.some(r=>r.id===runId)?'selected':''}>Chọn lượt tìm</option>${runs.slice(0,30).map(r=>`<option value="${esc(r.id)}" ${r.id===runId?'selected':''}>${esc(formatDate(r.startedAt))} · ${esc([normalizeCategory(r.criteria?.category)?categoryLabel(r.criteria.category):'',r.criteria?.keyword||r.criteria?.province||r.criteria?.investor].filter(Boolean).join(' · ')||'Theo tiêu chí')} · ${esc(RUN_LABEL[r.status]||r.status)}</option>`).join('')}</select></label>`;
}
function packCategory(t){
  return matchesTenderCategory(t,'TV_SUPERVISION')?'TV_SUPERVISION':tenderFieldOf(t);
}
function card(t){
  const st=statusOf(t), dl=deadlineInfo(t), fresh=freshness(t), score=Math.max(0,Math.min(100,Number(t.score)||0));
  const url=safeSource(t.detailUrl), miss=missingFields(t), confidence=dataConfidence(t), action=actionFor(t);
  const reason=t.reasons?.[0]||'Xem cấu hình chấm điểm';
  const cat=packCategory(t);
  const list=checklistItemsFor(cat);
  const checklist=checklistDrafts.get(t.key)||(STATE.checklists||{})[t.key]||{};
  const progress=checklistProgress(checklist,cat);
  const match=bestContractMatch(t,STATE.pastContracts||[]);
  const matchLabel=MATCH_LABEL[match.status]||MATCH_LABEL.thieu;
  const due=checklistDueItems(t,checklist,cat);
  const approve=approvalLabel(t);
  const mx=match.contract?matrixSummary(contractMatrix(match.contract,{workType:match.tenderType})):null;
  const pct=marketBidPercentiles(STATE.participations||[],STATE.tenders||[],{investor:t.investorName||'',field:tenderFieldOf(t)});
  const priceHint=pct.n>=3&&t.investorName&&tenderFieldOf(t)?`Giá dự thầu đã ghi nhận cùng CĐT/lĩnh vực: P25 ${formatMoney(pct.p25)} · P75 ${formatMoney(pct.p75)} (${pct.n} mẫu, chưa hiệu chỉnh quy mô)`:'';
  const gua=guaranteeReminder(t);
  return `<article class="ws-result ${st==='CLOSED'?'closed':''} ${selected.has(t.key)?'selected':''}" data-key="${esc(t.key)}">
    <div class="ws-result-top"><span class="status-tag ${st==='CLOSED'?'closed':st!=='OPEN'?'warn':''}"><i></i>${esc(BID_STATUS_LABEL[st])}</span><span class="code">${esc(t.displayCode||t.notifyNo||t.bidNo||'')}</span><label class="select-check"><input type="checkbox" data-select="${esc(t.key)}" aria-label="Chọn so sánh ${esc(t.bidName)}" ${selected.has(t.key)?'checked':''}>So sánh</label></div>
    <div class="ws-result-body"><div><h3>${url?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(t.bidName)}</a>`:esc(t.bidName)}</h3><div class="ws-result-meta"><div>${icon('chart',14)}<strong>${esc(formatMoney(t.price))}</strong></div><div>${icon('clock',14)}<span class="${dl.level}" title="${esc(formatDate(t.closeDate))} · Giờ Việt Nam">${esc(dl.label)}</span></div><div>${icon('building',14)}<span>${esc(t.investorName||t.procuringEntityName||'Chưa rõ chủ đầu tư')}</span></div><div>${icon('pin',14)}<span>${esc(t.location||'Chưa rõ địa điểm')}</span></div></div></div><div class="ws-score" title="Điểm phù hợp theo cấu hình; không phải xác suất trúng thầu"><div class="score-number">${score}</div><small>ĐIỂM PHÙ HỢP</small><div class="score-bar"><i style="width:${score}%"></i></div><small>/ 100</small></div></div>
    <div class="ws-result-bottom"><div class="reason-chips"><span class="reason-chip ${t.filterState==='MATCH'?'':'warn'}" title="${esc(t.filterReason)}">${esc(GATE_LABEL[t.filterState]||'Chưa kiểm tra tiêu chí')}</span><span class="reason-chip">${esc(action.label)}</span><span class="reason-chip">${esc(lifecycleLabel(t))}</span><span class="reason-chip ${match.status!=='dat'?'warn':''}">${esc(matchLabel)}</span>${mx?`<span class="reason-chip">${esc(mx.text)}</span>`:''}${due.length?`<span class="reason-chip warn">Đến hạn tick: ${esc(due[0].label)}</span>`:''}${approve?`<span class="reason-chip">${esc(approve)}</span>`:''}${priceHint?`<span class="reason-chip">${esc(priceHint)}</span>`:''}${gua[0]?`<span class="reason-chip warn">${esc(gua[0].text)}</span>`:''}<span class="reason-chip ${miss.length?'warn':''}">${miss.length?`${miss.length} mục cần kiểm tra`:'Đủ trường chính'}</span>${t.watchlisted?'<span class="reason-chip">Đang theo dõi</span>':''}${t.watchedInvestorId?'<span class="reason-chip">CĐT đang theo dõi</span>':''}</div><div class="result-links"><button type="button" data-watch="${esc(t.key)}" class="${t.watchlisted?'on':''}" aria-pressed="${Boolean(t.watchlisted)}">${icon('bookmark',14)}${t.watchlisted?'Đã lưu':'Theo dõi'}</button>${t.notifyNo&&url?`<button type="button" data-download="${esc(t.key)}">${icon('download',14)}E-HSMT</button>`:''}${url?`<a href="${esc(url)}" target="_blank" rel="noopener">Xem e-GP ${icon('external',14)}</a>`:''}<button type="button" data-outline="${esc(t.key)}">Khung BPTC</button></div></div>
    <details class="explain"><summary data-check-summary="${esc(t.key)}">Hồ sơ dự thầu ${progress.done}/${progress.total}${progress.owner?` · ${esc(progress.owner)}`:''}${checklistSaving.has(t.key)?' · đang lưu…':''}</summary><div>${list.map(item=>`<label><input type="checkbox" data-check="${esc(t.key)}" data-item="${esc(item.id)}" data-cat="${esc(cat)}" ${progress.items[item.id]?'checked':''} ${STATE.settings?.readOnlyMode?'disabled':''}> ${esc(item.label)}</label>`).join('<br>')}</div></details>
    <details class="explain"><summary>Vì sao có điểm này? · ${esc(reason)}</summary><ul>${(t.reasons||[]).map(r=>`<li>${esc(r)}</li>`).join('')}<li>Mức đầy đủ trường: ${confidence.value}/100. Đây không phải độ chính xác được bảo đảm.</li>${miss.map(r=>`<li>${esc(r)}</li>`).join('')}</ul><p>Hạn đã ghi nhận: ${esc(formatDate(t.closeDate))} · Giờ Việt Nam. ${esc(action.note)}</p></details><div class="fresh-stamp ${fresh.stale?'stale':''}">${esc(fresh.label)}${fresh.stale?' · Nên kiểm tra lại dữ liệu trên e-GP':''}</div>
  </article>`;
}
function render(){
  const run=chosenRun(), all=currentRows(), running=STATE.activeRun?.id===runId;
  show('progress',running||starting);$('go').disabled=starting||Boolean(STATE.activeRun);
  if(running)$('progress-text').textContent=STATE.activeRun.message||'Đang tìm trên e-GP…';
  $('stop').disabled=!running;
  if(STATE.activeRun&&!running&&!starting){alertMessage('Một lượt quét khác đang chạy. Có thể xem kết quả đã lưu; chờ lượt hiện tại hoàn tất trước khi tìm mới.');}
  else if($('alert').textContent.startsWith('Một lượt quét khác'))alertMessage('');
  renderScope(run,all);
  const valid=new Set(all.map(t=>t.key));selected=new Set([...selected].filter(k=>valid.has(k)));
  show('summary',Boolean(run));show('results-section',all.length>0);show('empty-state',!all.length);
  const matching=all.filter(t=>t.filterState==='MATCH');
  $('m-total').textContent=matching.length.toLocaleString('vi-VN');$('m-total-sub').textContent=`${all.length} gói đã nhận · ${all.filter(t=>t.filterState==='INSUFFICIENT').length} chưa đủ dữ liệu · ${all.filter(t=>t.filterState==='OUT_OF_RANGE').length} ngoài tiêu chí`;
  $('m-match').textContent=matching.filter(t=>t.matched).length;
  $('m-open').textContent=matching.filter(t=>statusOf(t)==='OPEN').length;
  const withPrice=matching.filter(t=>t.price!==null&&t.price!==undefined&&t.price!==''&&Number.isFinite(Number(t.price)));
  $('m-val').textContent=withPrice.length?formatMoney(withPrice.reduce((sum,t)=>sum+Number(t.price),0)):'Chưa xác định';
  $('m-val-sub').textContent=`${withPrice.length}/${matching.length} gói khớp có giá · Không ước đoán giá thiếu`;
  filtered=filterAndSort(all.filter(t=>!$('criteria-state').value||t.filterState===$('criteria-state').value),{text:$('result-q').value,status:$('statusFilter').value,minScore:$('minScoreFilter').value,sortBy:$('sortBy').value,onlyMatched:$('only').checked}).filter(t=>!$('only-watch').checked||t.watchlisted);
  $('result-count').textContent=filtered.length;
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));page=Math.min(page,pages);
  const offset=(page-1)*PAGE_SIZE, rows=filtered.slice(offset,offset+PAGE_SIZE);
  $('list-count').textContent=`${filtered.length?`${offset+1}–${offset+rows.length}`:'0'} / ${filtered.length} gói sau lọc · ${all.length} gói trong lượt tìm`;
  $('list').innerHTML=rows.map(card).join('')||'<div class="empty-state"><h3>Chưa có gói khớp bộ lọc nhanh.</h3><p>Thử xóa từ khóa, giảm ngưỡng điểm hoặc chọn mọi trạng thái.</p></div>';
  show('pagination',pages>1);$('page-label').textContent=`Trang ${page} / ${pages}`;$('prev-page').disabled=page<=1;$('next-page').disabled=page>=pages;
  $('csv').disabled=!filtered.length;$('calendar').disabled=!filtered.some(t=>statusOf(t)==='OPEN');
  $('csv').title=`Xuất ${filtered.length} gói sau lọc, bao gồm mọi trang`;
  $('calendar').title='Xuất lịch cho các gói còn hạn trong kết quả sau lọc';
  if(!all.length){
    const title=running?'Đang tìm cơ hội trên e-GP…':run?(['ERROR','TIMEOUT'].includes(run.status)?'Chưa nhận được kết quả.':run.status==='CANCELLED'?'Lượt tìm đã dừng.':'Chưa có gói trong lượt tìm này.'):'Cơ hội tiếp theo bắt đầu từ đây.';
    $('empty-state').innerHTML=`<img src="icons/radar-scene.svg" alt=""><h3>${esc(title)}</h3><p>${running?'Kết quả sẽ xuất hiện khi e-GP gửi dữ liệu về.':run?'Kiểm tra phạm vi phía trên hoặc nới rộng tiêu chí và tìm lại.':'Nhập địa bàn, lĩnh vực hoặc chủ đầu tư bạn quan tâm.<br>Nhấn <kbd>/</kbd> để nhập · <kbd>Ctrl Enter</kbd> để tìm.'}</p>`;
  }
  renderSelection();
}
function renderSelection(){show('compare-tray',selected.size>0);$('selected-count').textContent=selected.size;$('compare').disabled=selected.size<2;}
function compare(){
  const rows=selectedRows();if(rows.length<2)return;
  const fields=[['Giá gói thầu',t=>formatMoney(t.price)],['Trạng thái',t=>BID_STATUS_LABEL[statusOf(t)]],['Hạn đóng thầu · VN',t=>formatDate(t.closeDate)],['Thời gian còn lại',t=>deadlineInfo(t).label],['Địa điểm',t=>t.location],['Chủ đầu tư',t=>t.investorName||t.procuringEntityName],['Điểm phù hợp',t=>`${Number(t.score)||0}/100`],['Việc nên làm',t=>actionFor(t).label],['Cần xác minh',t=>missingFields(t).join(' · ')||'Đủ trường chính'],['Đã ghi nhận',t=>freshness(t).label]];
  $('compare-content').innerHTML=`<table class="comparison"><thead><tr><th scope="col">Tiêu chí</th>${rows.map(t=>`<th scope="col">${esc(t.bidName)}<br><span class="small muted">${esc(t.displayCode||t.notifyNo)}</span></th>`).join('')}</tr></thead><tbody>${fields.map(([label,fn])=>`<tr><th scope="row">${esc(label)}</th>${rows.map(t=>`<td>${esc(fn(t)||'Chưa xác định')}</td>`).join('')}</tr>`).join('')}<tr><th scope="row">Nguồn chính thức</th>${rows.map(t=>`<td>${safeSource(t.detailUrl)?`<a class="btn light" href="${esc(safeSource(t.detailUrl))}" target="_blank" rel="noopener">Mở e-GP ${icon('external',14)}</a>`:'Thiếu liên kết nguồn'}</td>`).join('')}</tr></tbody></table>`;
  $('compare-dialog').showModal();
}

$('search-form').addEventListener('submit',e=>{e.preventDefault();start();});
$('province').addEventListener('change',()=>{$('ward').value='';loadWards();});
CRITERIA_FIELDS.forEach(k=>$(k).addEventListener('change',()=>writeLocal(LAST,criteria())));
$('reset').addEventListener('click',()=>{fillCriteria({});alertMessage('');$('keyword').focus();});
$('useSettings').addEventListener('click',()=>{const s=STATE.settings||{};fillCriteria({...criteria(),province:s.provinces?.[0]||'',ward:'',minPrice:s.minPrice||'',maxPrice:s.maxPrice||''});notify('Đã lấy tỉnh và khoảng giá từ cấu hình.');});
document.querySelectorAll('.quick button').forEach(b=>b.addEventListener('click',()=>{$('minPrice').value=b.dataset.min||'';$('maxPrice').value=b.dataset.max||'';writeLocal(LAST,criteria());}));
$('save-search').addEventListener('click',()=>{const v=validateCriteria(criteria());if(!v.ok){alertMessage(v.message);$(v.field).focus();return;}pendingCriteria=v.criteria;$('saved-name').value=[v.criteria.category?categoryLabel(v.criteria.category):'',v.criteria.keyword,v.criteria.province].filter(Boolean).join(' · ').slice(0,70);$('save-dialog').showModal();$('saved-name').focus();});
$('save-form').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;const r=await send('SAVE_NAMED_SEARCH',{name:$('saved-name').value,criteria:pendingCriteria});b.disabled=false;if(!r.ok){notify(r.message,true);return;}STATE.savedSearches=r.savedSearches;renderPresets();$('save-dialog').close();notify('Đã lưu bộ tìm kiếm trên máy.');});
$('saved-searches').addEventListener('click',async e=>{const p=e.target.closest('[data-preset]'),d=e.target.closest('[data-delete-preset]');if(p){const item=STATE.savedSearches.find(x=>x.id===p.dataset.preset);if(item){fillCriteria(item.criteria);notify(`Đã điền “${item.name}”. Bấm Tìm gói thầu để chạy.`);}}if(d){const item=STATE.savedSearches.find(x=>x.id===d.dataset.deletePreset);if(!item||!confirm(`Xóa bộ tìm kiếm “${item.name}”?`))return;const r=await send('DELETE_NAMED_SEARCH',{id:item.id});if(r.ok){STATE.savedSearches=r.savedSearches;renderPresets();}else notify(r.message,true);}});
$('run-scope').addEventListener('change',e=>{if(e.target.id==='run-history'){runId=e.target.value;writeLocal(RUN,runId);page=1;selected.clear();alertMessage('');render();}});
$('stop').addEventListener('click',async()=>{$('stop').disabled=true;const r=await send('CANCEL_ACTIVE_RUN',{runId});if(!r.ok)notify(r.message,true);await refresh();});
for(const id of ['result-q','statusFilter','sortBy','minScoreFilter','only','only-watch','criteria-state'])$(id).addEventListener(id==='result-q'?'input':'change',()=>{page=1;render();});
$('prev-page').addEventListener('click',()=>{page--;render();$('results-title').scrollIntoView({block:'start'});});
$('next-page').addEventListener('click',()=>{page++;render();$('results-title').scrollIntoView({block:'start'});});
$('list').addEventListener('change',e=>{if(!e.target.matches('[data-select]'))return;const key=e.target.dataset.select;if(e.target.checked){if(selected.size>=4){e.target.checked=false;notify('So sánh tối đa 4 gói. Bỏ chọn một gói để thêm gói khác.',true);return;}selected.add(key);}else selected.delete(key);e.target.closest('article').classList.toggle('selected',selected.has(key));renderSelection();});
$('list').addEventListener('click',async e=>{
  const watch=e.target.closest('[data-watch]'),download=e.target.closest('[data-download]'),outline=e.target.closest('[data-outline]');
  if(outline){location.href=`outline.html?key=${encodeURIComponent(outline.dataset.outline)}`;return;}
  if(watch){const t=STATE.tenders.find(x=>x.key===watch.dataset.watch);if(!t)return;watch.disabled=true;const r=await send('SET_WATCH',{key:t.key,value:!t.watchlisted});if(r.ok){t.watchlisted=!t.watchlisted;render();}else{watch.disabled=false;notify(r.message,true);}}
  if(download){const t=STATE.tenders.find(x=>x.key===download.dataset.download);if(!t)return;download.disabled=true;download.textContent='Đang lấy tệp…';const r=await send('FETCH_AND_DOWNLOAD',{notifyNo:t.notifyNo,detailUrl:safeSource(t.detailUrl)});notify(r.ok?`Đã gửi tải ${r.downloaded||0} tệp.`:r.message,!r.ok);render();}
});
function reflectChecklist(key,cat){
  const progress=checklistProgress(checklistDrafts.get(key)||(STATE.checklists||{})[key]||{},cat);
  document.querySelectorAll('[data-check-summary]').forEach(el=>{if(el.dataset.checkSummary===key)el.textContent=`Hồ sơ dự thầu ${progress.done}/${progress.total}${progress.owner?` · ${progress.owner}`:''}${checklistSaving.has(key)?' · đang lưu…':''}`;});
  document.querySelectorAll('[data-check]').forEach(el=>{if(el.dataset.check===key)el.checked=Boolean(progress.items[el.dataset.item]);});
}
async function flushChecklist(key,cat){
  if(checklistSaving.has(key))return;
  checklistSaving.add(key);
  reflectChecklist(key,cat);
  try{
    while(checklistDrafts.has(key)){
      const draft=checklistDrafts.get(key);
      const r=await send('SAVE_CHECKLIST',{key,...draft});
      if(r.ok){STATE.checklists=STATE.checklists||{};STATE.checklists[key]=r.checklist;}
      else notify(r.message||'Chưa lưu được checklist; đã khôi phục trạng thái đã lưu.',true);
      if(checklistDrafts.get(key)===draft)checklistDrafts.delete(key);
    }
  }finally{checklistSaving.delete(key);reflectChecklist(key,cat);}
}
$('list').addEventListener('change',e=>{
  const box=e.target.closest('[data-check]');
  if(!box)return;
  const key=box.dataset.check;
  const cat=box.dataset.cat||'';
  const current=checklistProgress(checklistDrafts.get(key)||(STATE.checklists||{})[key]||{},cat).items;
  current[box.dataset.item]=box.checked;
  checklistDrafts.set(key,{items:current,category:cat,owner:STATE.settings?.operatorName||''});
  reflectChecklist(key,cat);
  flushChecklist(key,cat);
});
$('compare').addEventListener('click',compare);$('clear-selection').addEventListener('click',()=>{selected.clear();render();});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
$('csv').addEventListener('click',async()=>{const count=filtered.length,keys=filtered.map(t=>t.key);if(!count)return;$('csv').disabled=true;const r=await send('EXPORT_CSV',{saveAs:true,keys,runId});notify(r.ok?`Đã tạo Excel cho ${count} gói sau lọc.`:r.message,!r.ok);render();});
$('calendar').addEventListener('click',async()=>{
  const result=buildDeadlineCalendar(filtered);if(!result.count){notify('Không có gói còn hạn để tạo lịch.',true);return;}
  const url=URL.createObjectURL(new Blob([result.text],{type:'text/calendar;charset=utf-8'}));
  try{await chrome.downloads.download({url,filename:`GiaoSuCuiBap/Lich-dong-thau-${new Date().toISOString().slice(0,10)}.ics`,saveAs:true});notify(`Đã tạo ${result.count} mốc lịch. Nhập file vào ứng dụng lịch; lịch không tự cập nhật khi gia hạn.`);}catch(e){notify(`Chưa lưu được lịch: ${e.message}`,true);}finally{setTimeout(()=>URL.revokeObjectURL(url),60000);}
});
document.addEventListener('keydown',e=>{
  if(document.querySelector('dialog[open]'))return;
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();start();}
  else if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)){e.preventDefault();$(currentRows().length?'result-q':'keyword').focus();}
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
const clockTick=setInterval(()=>{if(!document.hidden&&currentRows().length)render();},60000);
window.addEventListener('pagehide',()=>{clearTimeout(timer);clearInterval(clockTick);});
fillCriteria(readLocal(LAST,{}));runId=readLocal(RUN,'');refresh();loadProvinces();
