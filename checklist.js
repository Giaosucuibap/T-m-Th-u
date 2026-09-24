import { checklistItemsFor, checklistProgress } from './lib/capability.js';
import { tenderFieldOf, matchesTenderCategory } from './lib/tender-categories.js';
import { matchesQuery } from './lib/workspace.js';
import { formatDate } from './lib/core.js';
import { createSearchIndex } from './lib/search-index.js';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const msg=(type,payload={})=>chrome.runtime.sendMessage({type,payload});
const key=new URL(location.href).searchParams.get('key');
const PAGE_SIZE=30;
let state={tenders:[],settings:{},checklists:{}},index=createSearchIndex([]),page=1,refreshing=false;
const drafts=new Map(),saving=new Set();
function alert(message){$('alert').textContent=message||'';$('alert').classList.toggle('hidden',!message);}
const category=t=>matchesTenderCategory(t,'TV_SUPERVISION')?'TV_SUPERVISION':tenderFieldOf(t);
function current(key){return drafts.get(key)||state.checklists?.[key]||{};}
function render(){
  const scope=$('checklist-filter').value;
  const rows=index.rows.filter(t=>matchesQuery(`${t.bidName||''} ${t.notifyNo||''} ${t.bidNo||''}`,$('checklist-q').value))
    .filter(t=>key||scope==='all'||t.watchlisted||(scope==='working'&&['REVIEW','GO','BID'].includes(t.decisionState)));
  $('scope-note').innerHTML=key?`Đang xem checklist của gói được chọn trong kho. <a href="checklist.html">Xem các gói khác trong kho</a>`:`Phạm vi: kho gói đã lưu trên máy · ${state.tenders.length} gói. ${state.settings?.readOnlyMode?'Chế độ chỉ xem đang bật.':'Các thay đổi checklist được lưu trên máy.'}`;
  $('checklist-filter').disabled=Boolean(key);
  const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));page=Math.min(page,pages);
  $('checklist-count').textContent=`${rows.length} gói trong phạm vi đang chọn · Trang ${page}/${pages}`;
  $('checklist-list').innerHTML=rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE).map(t=>{
    const cat=category(t),progress=checklistProgress(current(t.key),cat),readOnly=state.settings?.readOnlyMode;
    return `<article class="card checklist-card" data-key="${esc(t.key)}"><span class="code">${esc(t.displayCode||t.notifyNo||t.bidNo)}</span><h2>${esc(t.bidName)}</h2><p class="muted small">${esc(t.investorName||t.procuringEntityName||'Chưa rõ chủ đầu tư')} · Hạn đóng thầu: ${esc(formatDate(t.closeDate))}</p><p class="checklist-status" data-check-summary="${esc(t.key)}">${progress.done}/${progress.total} việc đã ghi nhận${saving.has(t.key)?' · đang lưu…':''}</p><div class="checklist-items">${checklistItemsFor(cat).map(item=>`<label><input type="checkbox" data-check="${esc(t.key)}" data-item="${esc(item.id)}" data-cat="${esc(cat)}" ${progress.items[item.id]?'checked':''} ${readOnly?'disabled':''}>${esc(item.label)}</label>`).join('')}</div><label class="checklist-owner">Người phụ trách<input data-owner="${esc(t.key)}" data-cat="${esc(cat)}" maxlength="80" value="${esc(progress.owner||'')}" placeholder="Tên người phụ trách" ${readOnly?'disabled':''}></label><p class="muted small">Đánh dấu thể hiện tiến độ tự ghi nhận. Kiểm tra hồ sơ gốc trước khi xác nhận hoàn thành.</p><a class="btn light" href="dashboard.html">Mở kho và quyết định dự thầu</a></article>`;
  }).join('')||`<div class="empty-state"><h3>${key?'Gói được chọn không còn trong kho.':'Chưa có gói trong phạm vi này.'}</h3><p>${key?'Quay lại kho để chọn gói còn lưu.':'Chọn “Mọi gói trong kho” hoặc đánh dấu theo dõi gói ở bước Tìm/Kho.'}</p><a href="dashboard.html" class="btn light">Mở kho gói</a></div>`;
  $('pagination').classList.toggle('hidden',pages<2);$('page-label').textContent=`Trang ${page}/${pages}`;$('prev').disabled=page<=1;$('next').disabled=page>=pages;
}
function reflect(key,cat){
  const progress=checklistProgress(current(key),cat);
  document.querySelectorAll('[data-check-summary]').forEach(el=>{if(el.dataset.checkSummary===key)el.textContent=`${progress.done}/${progress.total} việc đã ghi nhận${saving.has(key)?' · đang lưu…':''}`;});
  document.querySelectorAll('[data-check]').forEach(el=>{if(el.dataset.check===key)el.checked=Boolean(progress.items[el.dataset.item]);});
  document.querySelectorAll('[data-owner]').forEach(el=>{if(el.dataset.owner===key&&(!saving.has(key)||document.activeElement!==el))el.value=progress.owner||'';});
}
async function flush(key,cat){
  if(saving.has(key))return;saving.add(key);reflect(key,cat);
  try{while(drafts.has(key)){
    const draft=drafts.get(key);let reply;
    try{reply=await msg('SAVE_CHECKLIST',{key,...draft});}catch(e){reply={ok:false,message:String(e.message||e)};}
    if(reply?.ok){state.checklists={...state.checklists,[key]:reply.checklist};alert('');}
    else{alert(reply?.message||'Chưa lưu được. Đã khôi phục checklist đã lưu.');}
    if(drafts.get(key)===draft)drafts.delete(key);
  }}finally{saving.delete(key);reflect(key,cat);}
}
$('checklist-list').addEventListener('change',e=>{
  const checkbox=e.target.closest('[data-check]'),owner=e.target.closest('[data-owner]');
  if(!checkbox&&!owner)return;
  const node=checkbox||owner,key=node.dataset.check||node.dataset.owner,cat=node.dataset.cat||'';
  if(state.settings?.readOnlyMode){reflect(key,cat);return;}
  const progress=checklistProgress(current(key),cat),items={...progress.items};
  if(checkbox)items[node.dataset.item]=node.checked;
  const ownerName=owner?node.value.trim():progress.owner||state.settings?.operatorName||'';
  drafts.set(key,{items,category:cat,owner:ownerName});reflect(key,cat);void flush(key,cat);
});
async function refresh(){
  if(refreshing||saving.size)return;refreshing=true;
  try{
    const reply=await msg('GET_SEARCH_STATE',{scope:'warehouse',keys:key?[key]:undefined,revision:state.revision});
    if(!reply?.ok){alert(reply?.message||'Không đọc được kho gói.');return;}
    if(reply.unchanged)return;
    state=reply;index=createSearchIndex(state.tenders||[]);render();
  }catch(e){alert(String(e.message||e));}finally{refreshing=false;}
}
for(const id of ['checklist-q','checklist-filter'])$(id).addEventListener(id==='checklist-q'?'input':'change',()=>{page=1;render();});
$('refresh-checklists').addEventListener('click',refresh);$('prev').addEventListener('click',()=>{page--;render();});$('next').addEventListener('click',()=>{page++;render();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
refresh();
