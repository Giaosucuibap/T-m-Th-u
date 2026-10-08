import {formatDate,formatMoney} from './lib/core.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={leftOnly:'Chỉ lượt A',rightOnly:'Chỉ lượt B',changed:'Khác thông tin',unchanged:'Giống thông tin',unavailable:'Thiếu bản ghi cũ'};
const PAGE_SIZE=60;
const statusLabels={SUCCESS:'Đã hoàn tất',PARTIAL:'Kết quả một phần',ERROR:'Lượt tìm có lỗi',CANCELLED:'Đã dừng',TIMEOUT:'Quá thời gian',STARTING:'Đang chuẩn bị',RUNNING:'Đang tìm'};
function display(value,field=''){
  if(value===null||value===undefined||value==='')return 'Chưa có dữ liệu';
  if(/price|amount|budget/i.test(field)&&typeof value==='number')return formatMoney(value);
  if(/Date|At$/.test(field)&&typeof value==='string')return formatDate(value);
  return typeof value==='object'?JSON.stringify(value):String(value);
}

export function createRunComparison({send,getRuns,getRunId}){
  const $=id=>document.getElementById(id),dialog=$('run-compare-dialog');
  let result=null,page=1,request=0,busy=false;
  const runs=()=>getRuns().filter(run=>run.mode==='form');
  function refresh(){const count=runs().length;$('compare-runs').disabled=count<2;$('compare-runs').title=count<2?'Cần ít nhất hai lượt tìm đã lưu':'Đối chiếu bản ghi của hai lượt, không đổi bộ lọc đang xem';}
  function setBusy(value){busy=value;$('run-compare-go').disabled=value;$('run-compare-left').disabled=value;$('run-compare-right').disabled=value;}
  function resetResult(){result=null;page=1;$('run-compare-results').textContent='';$('run-compare-summary').textContent='';$('run-compare-warning').textContent='';$('run-compare-warning').classList.add('hidden');$('run-compare-pages').classList.add('hidden');}
  function option(run,index){const label=[`#${index+1}`,formatDate(run.startedAt),run.criteria?.keyword||run.criteria?.province||run.criteria?.investor||'Theo tiêu chí',statusLabels[run.status]||run.status||''].filter(Boolean).join(' · ');return `<option value="${esc(run.id)}">${esc(label)}</option>`;}
  function open(){
    refresh();const available=runs();if(available.length<2)return;resetResult();setBusy(false);
    for(const id of ['run-compare-left','run-compare-right'])$(id).innerHTML=available.map(option).join('');
    const current=getRunId();$('run-compare-right').value=available.some(run=>run.id===current)?current:available[0].id;
    $('run-compare-left').value=available.find(run=>run.id!==$('run-compare-right').value).id;
    $('run-compare-kind').value='differences';$('run-compare-status').textContent='Chọn hai lượt khác nhau rồi bấm Đối chiếu.';dialog.showModal();$('run-compare-left').focus();
  }
  function render(){
    if(!result)return;
    const kind=$('run-compare-kind').value,all=Array.isArray(result.rows)?result.rows:[];
    const filtered=all.filter(row=>kind==='differences'?row.kind!=='unchanged':!kind||row.kind===kind);
    const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));page=Math.min(page,pages);const offset=(page-1)*PAGE_SIZE;
    $('run-compare-results').innerHTML=filtered.length?`<table class="run-comparison-table"><thead><tr><th>Mã / tên gói</th><th>Đối chiếu</th><th>Lượt A</th><th>Lượt B</th></tr></thead><tbody>${filtered.slice(offset,offset+PAGE_SIZE).map(row=>{
      const changes=Array.isArray(row.changes)?row.changes:[];
      const detail=(side)=>row.kind==='unavailable'?'Chưa đủ bản ghi tại thời điểm tìm':changes.length?changes.map(change=>`<div><b>${esc(change.label||change.field||'Trường dữ liệu')}</b><br>${esc(display(side==='left'?change.before:change.after,change.field))}</div>`).join(''):row[side]?esc(display(row[side].price,'price')):'Không có trong phạm vi lượt này';
      return `<tr><td><b>${esc(row.code||row.key)}</b><div>${esc(row.name||row.left?.bidName||row.right?.bidName)}</div></td><td><span class="pill">${esc(labels[row.kind]||'Chưa xác định')}</span></td><td>${detail('left')}</td><td>${detail('right')}</td></tr>`;
    }).join('')}</tbody></table>`:'<p>Không có dòng thuộc nhóm đang chọn.</p>';
    $('run-compare-pages').classList.toggle('hidden',pages<=1);$('run-compare-page').textContent=`Trang ${page}/${pages} · ${filtered.length?offset+1:0}–${Math.min(offset+PAGE_SIZE,filtered.length)}/${filtered.length} dòng`;
    $('run-compare-prev').disabled=page<=1;$('run-compare-next').disabled=page>=pages;
  }
  async function compare(){
    if(busy)return;const leftRunId=$('run-compare-left').value,rightRunId=$('run-compare-right').value;
    if(!leftRunId||!rightRunId||leftRunId===rightRunId){$('run-compare-status').textContent='Chọn hai lượt khác nhau để đối chiếu.';return;}
    const id=++request;resetResult();setBusy(true);$('run-compare-status').textContent='Đang đọc hai bản ghi đã lưu…';
    try{const response=await send('COMPARE_SEARCH_RUNS',{leftRunId,rightRunId});if(id!==request||!dialog.open)return;
      if(!response?.ok)throw new Error(response?.message||'Chưa đối chiếu được hai lượt.');result=response;
      $('run-compare-status').textContent=`Lượt A: ${$('run-compare-left').selectedOptions[0].textContent} · Lượt B: ${$('run-compare-right').selectedOptions[0].textContent}.`;
      $('run-compare-summary').innerHTML=Object.entries(labels).map(([key,label])=>`<div><strong>${Number(response.counts?.[key]||0).toLocaleString('vi-VN')}</strong><span>${label}</span></div>`).join('');
      const warnings=Array.isArray(response.warnings)?response.warnings:[];$('run-compare-warning').textContent=warnings.join(' ');$('run-compare-warning').classList.toggle('hidden',!warnings.length);render();
    }catch(error){if(id===request&&dialog.open)$('run-compare-status').textContent=error.message||'Chưa đối chiếu được hai lượt.';}finally{if(id===request)setBusy(false);}
  }
  $('compare-runs').addEventListener('click',open);$('run-compare-go').addEventListener('click',compare);
  $('run-compare-kind').addEventListener('change',()=>{page=1;render();});
  for(const id of ['run-compare-left','run-compare-right'])$(id).addEventListener('change',()=>{resetResult();$('run-compare-status').textContent='Bấm Đối chiếu để đọc cặp lượt vừa chọn.';});
  $('run-compare-prev').addEventListener('click',()=>{page--;render();});$('run-compare-next').addEventListener('click',()=>{page++;render();});
  dialog.addEventListener('close',()=>{request++;setBusy(false);resetResult();});
  return {refresh};
}
