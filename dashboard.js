import {formatMoney,formatDate,foldText} from './lib/core.js';
let state=null;
const $=id=>document.getElementById(id);
async function msg(type,payload={}){return chrome.runtime.sendMessage({type,payload});}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderBanner(){
  const b=$('banner');
  if(state.activeRun){b.className='notice';b.innerHTML=`<span class="status-dot running"></span> <b>${esc(state.activeRun.status)}</b> — ${esc(state.activeRun.message||'Đang chạy...')}`;return;}
  const last=state.runs[0];
  if(!last){b.className='notice';b.innerHTML='Chưa có lượt quét. Thực hiện hướng dẫn ghi bộ lọc một lần, sau đó bấm <b>Quét e-GP ngay</b>.';return;}
  b.className='notice '+(last.status==='SUCCESS'?'ok':last.status==='ERROR'||last.status==='TIMEOUT'?'error':'');
  b.innerHTML=`<span class="status-dot ${last.status==='SUCCESS'?'ok':last.status==='RUNNING'?'running':'error'}"></span> <b>${esc(last.status)}</b> — ${esc(last.message||'')} <span class="muted small">${formatDate(last.startedAt)}</span>`;
}
function filtered(){const q=foldText($('q').value),min=Number($('minScore').value),matched=$('onlyMatched').checked,watch=$('onlyWatch').checked;return state.tenders.filter(t=>t.score>=min&&(!matched||t.matched)&&(!watch||t.watchlisted)&&(!q||foldText(JSON.stringify(t)).includes(q))).sort((a,b)=>b.score-a.score||new Date(b.lastSeenAt)-new Date(a.lastSeenAt));}
function renderList(){const items=filtered();$('count').textContent=`${items.length} gói`;$('list').innerHTML=items.map(t=>`<div class="card tender"><div class="row space"><div><div class="score ${t.score>=85?'high':t.score>=70?'mid':''}">${t.score}/100</div><h3>${esc(t.bidName)}</h3></div><button class="btn light watch" data-key="${esc(t.key)}">${t.watchlisted?'★ Đang theo dõi':'☆ Theo dõi'}</button></div><div class="muted small">${esc(t.notifyNo)}-${esc(t.version)} · 📍 ${esc(t.location||'Chưa xác định')} · 🕒 ${esc(formatDate(t.closeDate))}</div><p><b>Giá:</b> ${esc(formatMoney(t.price))} &nbsp; <b>Chủ đầu tư:</b> ${esc(t.investorName||'Chưa xác định')}</p><p>${(t.reasons||[]).slice(0,4).map(r=>`<span class="pill">${esc(r)}</span>`).join(' ')}</p><div class="row"><a class="btn" target="_blank" rel="noopener" href="${esc(t.detailUrl)}">Mở nguồn e-GP</a><button class="btn light delete" data-key="${esc(t.key)}">Xóa</button></div></div>`).join('')||'<div class="card muted">Chưa có gói thầu phù hợp bộ lọc đang hiển thị.</div>';
  document.querySelectorAll('.watch').forEach(btn=>btn.onclick=async()=>{const t=state.tenders.find(x=>x.key===btn.dataset.key);await msg('SET_WATCH',{key:t.key,value:!t.watchlisted});await load();});
  document.querySelectorAll('.delete').forEach(btn=>btn.onclick=async()=>{if(confirm('Xóa gói này khỏi dữ liệu cục bộ?')){await msg('DELETE_TENDER',{key:btn.dataset.key});await load();}});
}
function render(){const matched=state.tenders.filter(t=>t.matched).length;$('total').textContent=state.tenders.length;$('matched').textContent=matched;$('urgent').textContent=state.tenders.filter(t=>t.score>=85).length;$('watch').textContent=state.tenders.filter(t=>t.watchlisted).length;renderBanner();const requirement=state.settings.requirementText||'Đang dùng danh sách từ khóa thế mạnh để đo độ tương tự.';$('requirementInfo').textContent=requirement.length>260?requirement.slice(0,260)+'...':requirement;const t=state.template,last=state.lastTemplate;$('templateInfo').textContent=t?`Đã lưu lúc ${formatDate(t.capturedAt)} · ${t.method} · nhận diện ${t.candidateCount||0} bản ghi`:(last?'Đã quan sát một tìm kiếm mới nhưng chưa lưu.':'Chưa ghi nhớ bộ lọc tìm kiếm.');renderList();}
async function load(){state=await msg('GET_STATE');render();}
$('scan').onclick=async()=>{const r=await msg('START_SCAN',{mode:'manual'});if(!r.ok)alert(r.message);await load();};
$('openEgp').onclick=()=>msg('OPEN_EGP');$('saveTemplate').onclick=async()=>{const r=await msg('SAVE_LAST_TEMPLATE');alert(r.ok?'Đã lưu bộ lọc. Từ lần sau phần mềm có thể phát lại yêu cầu tìm kiếm này.':r.message);await load();};$('openGuide').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('onboarding.html#filter')});
$('csv').onclick=()=>msg('EXPORT_CSV');$('mobile').onclick=()=>msg('EXPORT_MOBILE');$('backup').onclick=()=>msg('EXPORT_BACKUP');['q','minScore','onlyMatched','onlyWatch'].forEach(id=>$(id).addEventListener(id==='q'?'input':'change',renderList));
chrome.storage.onChanged.addListener(()=>load());load();setInterval(()=>{if(state?.activeRun)load();},3000);
