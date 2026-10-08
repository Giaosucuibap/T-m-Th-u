import { formatMoney, formatDate, daysToClose } from './lib/core.js';
import { summarizeTenderFields } from './lib/tender-categories.js';
import {
  DECISION_STATES,
  DECISION_STATE_LABEL,
  normalizeDecisionState,
  statusOf,
  actionFor,
  decisionSignals,
  dataConfidence,
  riskSignals,
  changeSignal,
  filterAndSort,
  fold,
  deadlineIcon
} from './lib/decision.js';

const $ = (id) => document.getElementById(id);
const msg = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });

const STATUS_LABEL = Object.freeze({
  OPEN: 'Đang mở thầu',
  PLAN: 'Chưa có TBMT',
  UNKNOWN: 'Chưa rõ hạn nộp',
  CLOSED: 'Đã đóng thầu'
});
const RUN_LABEL = Object.freeze({
  SUCCESS: 'Hoàn tất',
  ERROR: 'Có lỗi',
  TIMEOUT: 'Quá thời gian',
  RUNNING: 'Đang chạy',
  CANCELLED: 'Đã dừng',
  PARTIAL: 'Hoàn tất một phần'
});
const PAGE_SIZE = 60;

let state = { tenders: [], runs: [], settings: {}, templates: [], template: null, activeRun: null };
let pipelineFilter = '';
let currentPage = 1;
let cleanupPreview = null;
let cleanupBusy = false;
let cleanupApplying = false;
let healthRequest = 0;
let pollTimer = null;
let reloadTimer = null;
let toastTimer = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function codeOf(tender) {
  if (tender.displayCode) return { code: tender.displayCode, label: tender.codeLabel || 'Mã TBMT' };
  if (tender.notifyNo) {
    return {
      code: `${tender.notifyNo}${tender.version ? `-${tender.version}` : ''}`,
      label: 'Mã TBMT'
    };
  }
  return { code: tender.bidNo || tender.planNo || '—', label: 'Mã gói thầu (KHLCNT)' };
}

function compactText(value, max = 260) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function deadlineText(tender) {
  const status = statusOf(tender);
  const days = daysToClose(tender.closeDate);
  if (status === 'PLAN') return 'Theo dõi thời điểm phát hành TBMT';
  if (status === 'UNKNOWN') return 'Chưa xác định hạn nộp';
  if (status === 'CLOSED') return tender.closeDate ? `Đã đóng ${formatDate(tender.closeDate)}` : 'Đã đóng thầu';
  if (days === null) return 'Chưa xác định hạn nộp';
  if (days <= 0) return 'Đóng thầu hôm nay';
  return `Còn ${days} ngày`;
}

function scoreClass(score) {
  return Number(score || 0) >= 85 ? 'high' : Number(score || 0) >= 55 ? 'mid' : '';
}

function riskClass(level) {
  return level === 'HIGH' ? 'danger' : level === 'MEDIUM' ? 'warn' : 'info';
}

function showToast(message, kind = 'ok') {
  const toast = $('toast');
  clearTimeout(toastTimer);
  toast.className = `notice ${kind === 'error' ? 'error' : kind === 'ok' ? 'ok' : ''}`;
  toast.textContent = message;
  toast.classList.remove('hidden');
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3600);
}

function renderBanner() {
  const box = $('banner');
  const scanButton = $('scan');
  if (state.activeRun) {
    box.className = 'notice command-banner';
    box.innerHTML = `<span class="status-dot running"></span> <b>Đang quét e-GP</b> — ${esc(state.activeRun.message || RUN_LABEL[state.activeRun.status] || state.activeRun.status || 'Đang xử lý…')}`;
    scanButton.disabled = true;
    scanButton.textContent = 'Đang quét…';
    return;
  }

  scanButton.disabled = false;
  scanButton.textContent = 'Quét theo bộ lọc';
  const last = (state.runs || [])[0];
  if (!last) {
    box.className = 'notice command-banner';
    box.innerHTML = state.template
      ? 'Radar đã sẵn sàng. Bấm <b>Quét theo bộ lọc</b> để lấy dữ liệu mới nhất.'
      : 'Chưa có lượt quét. Hãy mở e-GP, tìm một lần và lưu bộ lọc trước khi chạy radar.';
    return;
  }

  const failed = ['ERROR', 'TIMEOUT'].includes(last.status);
  box.className = `notice command-banner ${last.status === 'SUCCESS' ? 'ok' : failed ? 'error' : ''}`;
  const next = state.alarm && state.alarm.scheduledTime
    ? ` · Lịch kế tiếp ${new Date(state.alarm.scheduledTime).toLocaleString('vi-VN')}` : '';
  box.innerHTML = `<span class="status-dot ${last.status === 'SUCCESS' ? 'ok' : failed ? 'error' : ''}"></span> `
    + `<b>${esc(RUN_LABEL[last.status] || last.status || 'Lượt quét gần nhất')}</b> — ${esc(last.message || '')} `
    + `<span class="muted small">${esc(formatDate(last.finishedAt || last.startedAt))}${esc(next)}</span>`;
}

function renderMetrics() {
  const all = state.tenders || [];
  const signals = decisionSignals(all);
  const live = all.filter((tender) => statusOf(tender) !== 'CLOSED');
  const matched = live.filter((tender) => tender.matched).length;
  const activePipeline = all.filter((tender) => ['REVIEW', 'GO', 'BID'].includes(normalizeDecisionState(tender.decisionState))).length;

  $('m-live').textContent = signals.live.toLocaleString('vi-VN');
  $('m-live-sub').textContent = `${all.length.toLocaleString('vi-VN')} gói trong kho dữ liệu`;
  $('m-match').textContent = matched.toLocaleString('vi-VN');
  $('m-match-sub').textContent = live.length
    ? `${Math.round((matched / live.length) * 100)}% số gói còn xử lý` : 'Chưa có cơ hội đang mở';
  $('m-urgent').textContent = signals.urgent.toLocaleString('vi-VN');
  $('m-pipeline').textContent = activePipeline.toLocaleString('vi-VN');
}

function renderPriority() {
  const signals = decisionSignals(state.tenders || []);
  const tender = signals.best;
  const box = $('priority');
  const statePill = $('priority-state');

  if (!tender) {
    statePill.textContent = 'Chưa có cơ hội';
    box.innerHTML = '<div class="priority-empty">Chưa có gói còn cơ hội xử lý. Hãy chạy radar hoặc nới bộ lọc năng lực.</div>';
    return;
  }

  const status = statusOf(tender);
  const action = actionFor(tender);
  const decision = normalizeDecisionState(tender.decisionState);
  const { code, label } = codeOf(tender);
  const link = tender.detailUrl || tender.sourcePageUrl || 'https://muasamcong.mpi.gov.vn/';
  statePill.textContent = `${STATUS_LABEL[status] || status} · ${DECISION_STATE_LABEL[decision]}`;
  box.innerHTML = `
    <div class="priority-head">
      <div class="score-orb">${Number(tender.score || 0)}<small>/100</small></div>
      <div>
        <h3 class="priority-title">${esc(tender.bidName || code)}</h3>
        <div class="muted small">${esc(label)}: <b>${esc(code)}</b></div>
        <div class="tag-row" style="margin-top:8px">
          <span class="tag good">${esc(action.label)}</span>
          ${tender.matched ? '<span class="tag info">Đạt ngưỡng năng lực</span>' : ''}
        </div>
      </div>
    </div>
    <div class="meta-grid">
      <div class="meta-item"><span>Giá gói thầu</span><b>${esc(formatMoney(tender.price))}</b></div>
      <div class="meta-item"><span>Thời hạn</span><b>${esc(deadlineText(tender))}</b></div>
      <div class="meta-item"><span>Địa điểm</span><b>${esc(tender.location || 'Chưa xác định')}</b></div>
      <div class="meta-item"><span>Chủ đầu tư</span><b>${esc(tender.investorName || tender.procuringEntityName || 'Chưa xác định')}</b></div>
    </div>
    <div class="muted small">${esc(action.note)}</div>
    <div class="actions-row" style="margin-top:12px">
      <a class="btn" href="${esc(link)}" target="_blank" rel="noopener">Mở nguồn e-GP</a>
      ${decision === 'NEW' ? `<button class="btn light" type="button" data-priority-review data-key="${esc(tender.key)}">Đưa vào sàng lọc</button>` : ''}
    </div>`;

  const reviewButton = box.querySelector('[data-priority-review]');
  if (reviewButton) {
    reviewButton.addEventListener('click', () => saveDecision(tender.key, 'REVIEW', tender.decisionOwner || '', tender.decisionNote || '', reviewButton));
  }
}

function renderPipeline() {
  const all = state.tenders || [];
  const counts = Object.fromEntries(DECISION_STATES.map(({ value }) => [value, 0]));
  all.forEach((tender) => { counts[normalizeDecisionState(tender.decisionState)] += 1; });

  $('pipeline').innerHTML = DECISION_STATES.map(({ value, label }) => `
    <button class="pipeline-button ${pipelineFilter === value ? 'active' : ''}" type="button"
      data-pipeline="${value}" aria-pressed="${pipelineFilter === value}">
      <span>${esc(label)}</span><b>${counts[value].toLocaleString('vi-VN')}</b>
    </button>`).join('');

  $('pipeline').querySelectorAll('[data-pipeline]').forEach((button) => {
    button.addEventListener('click', () => {
      pipelineFilter = button.dataset.pipeline;
      currentPage = 1;
      renderPipeline();
      renderList();
      $('result-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  $('clearPipeline').classList.toggle('hidden', !pipelineFilter);
}

function renderContext() {
  const requirement = state.settings && state.settings.requirementText
    ? state.settings.requirementText
    : 'Đang dùng danh sách từ khóa thế mạnh để đo độ phù hợp.';
  $('requirementInfo').textContent = compactText(requirement);

  const template = state.template;
  const totalTemplates = (state.templates || []).length;
  $('templateInfo').textContent = template
    ? `Bộ lọc “${template.name || 'Mặc định'}” · lưu ${formatDate(template.capturedAt)} · ${totalTemplates || 1} bộ lọc trong radar.`
    : 'Chưa lưu bộ lọc e-GP. Radar tự động chưa thể chạy ổn định.';
}

function warehouseView() {
  return {
    text: fold($('q').value.trim()),
    status: $('statusFilter').value,
    minScore: Number($('minScore').value || 0),
    sortBy: $('sortBy').value || 'decision',
    onlyMatched: $('onlyMatched').checked,
    onlyWatch: $('onlyWatch').checked,
    pipeline: pipelineFilter
  };
}
function currentResults() {
  const view=warehouseView();
  return filterAndSort(state.tenders || [], view)
    .filter((tender) => !$('onlyWatch').checked || tender.watchlisted)
    .filter((tender) => !pipelineFilter || normalizeDecisionState(tender.decisionState) === pipelineFilter);
}

function decisionOptions(selected) {
  return DECISION_STATES.map(({ value, label }) =>
    `<option value="${value}" ${selected === value ? 'selected' : ''}>${esc(label)}</option>`).join('');
}

function resultCard(tender) {
  const status = statusOf(tender);
  const action = actionFor(tender);
  const confidence = dataConfidence(tender);
  const risks = riskSignals(tender);
  const changed = changeSignal(tender);
  const decision = normalizeDecisionState(tender.decisionState);
  const { code, label } = codeOf(tender);
  const link = tender.detailUrl || tender.sourcePageUrl || 'https://muasamcong.mpi.gov.vn/';
  const cardClass = decision === 'NO_GO' ? 'no-go'
    : ['GO', 'BID', 'SUBMITTED'].includes(decision) ? 'go'
      : Number(tender.score || 0) >= 70 && status !== 'CLOSED' ? 'priority' : '';
  const reasons = (tender.reasons || []).slice(0, 3);

  return `<article class="card result-card ${cardClass}" data-key="${esc(tender.key)}">
    <div class="result-layout">
      <div class="result-score ${scoreClass(tender.score)}">${Number(tender.score || 0)}<small>/100</small></div>
      <div>
        <h3 class="result-title"><a href="${esc(link)}" target="_blank" rel="noopener">${esc(tender.bidName || code)} ↗</a></h3>
        <div class="muted small"><b>${esc(label)}: ${esc(code)}</b> · ${esc(STATUS_LABEL[status] || status)}</div>
        <div class="result-meta">
          <div>💰 <b>${esc(formatMoney(tender.price))}</b></div>
          <div>${deadlineIcon(tender)} <b>${esc(deadlineText(tender))}</b></div>
          <div>📍 ${esc(tender.location || 'Chưa xác định địa điểm')}</div>
          <div>🏛 ${esc(tender.investorName || tender.procuringEntityName || 'Chưa xác định chủ đầu tư')}</div>
        </div>
        <div class="tag-row">
          <span class="tag ${action.className === 'go' ? 'good' : action.className === 'watch' ? 'warn' : 'info'}">${esc(action.label)}</span>
          ${tender.matched ? '<span class="tag good">Đạt ngưỡng</span>' : ''}
          ${risks.map((risk) => `<span class="tag ${riskClass(risk.level)}">${esc(risk.label)}</span>`).join('')}
          ${changed.changed ? `<span class="tag info">${changed.count} thay đổi</span>` : ''}
          ${reasons.map((reason) => `<span class="tag">${esc(reason)}</span>`).join('')}
        </div>
        <div class="confidence" style="margin-top:10px">
          <span>${esc(confidence.label)} ${confidence.value}%</span>
          <span class="confidence-bar" aria-hidden="true"><i style="width:${confidence.value}%"></i></span>
        </div>
      </div>
      <div class="result-side">
        <label class="small" style="margin:0">Trạng thái quyết định
          <select data-decision-state aria-label="Trạng thái quyết định cho ${esc(tender.bidName || code)}">
            ${decisionOptions(decision)}
          </select>
        </label>
        <input data-decision-owner value="${esc(tender.decisionOwner || '')}" maxlength="120"
          aria-label="Người phụ trách" placeholder="Người phụ trách">
        <input data-decision-note value="${esc(tender.decisionNote || '')}" maxlength="1000"
          aria-label="Ghi chú nội bộ" placeholder="Ghi chú nội bộ">
        <div class="result-note">${esc(action.note)}</div>
        <div class="actions-row">
          <button class="btn" type="button" data-save-decision>Lưu quyết định</button>
          <a class="btn light" href="checklist.html?key=${encodeURIComponent(tender.key)}">Checklist hồ sơ gói này</a>
          <button class="btn light" type="button" data-watch aria-pressed="${Boolean(tender.watchlisted)}"
            aria-label="${tender.watchlisted ? 'Bỏ theo dõi' : 'Theo dõi'} ${esc(tender.bidName || code)}">${tender.watchlisted ? '★ Theo dõi' : '☆ Theo dõi'}</button>
          <button class="btn light" type="button" data-delete
            aria-label="Xóa ${esc(tender.bidName || code)} khỏi dữ liệu cục bộ">Xóa</button>
        </div>
      </div>
    </div>
  </article>`;
}

function renderList() {
  const items = currentResults();
  const pages=Math.max(1,Math.ceil(items.length/PAGE_SIZE));
  currentPage=Math.min(currentPage,pages);
  const offset=(currentPage-1)*PAGE_SIZE;
  const visible = items.slice(offset, offset+PAGE_SIZE);
  $('count').textContent = `${items.length.toLocaleString('vi-VN')} gói`;

  const filters = [];
  if ($('statusFilter').value) filters.push(STATUS_LABEL[$('statusFilter').value]);
  if (Number($('minScore').value)) filters.push(`điểm từ ${$('minScore').value}`);
  if ($('onlyWatch').checked) filters.push('đang theo dõi');
  if ($('onlyMatched').checked) filters.push('đạt ngưỡng năng lực');
  if (pipelineFilter) filters.push(DECISION_STATE_LABEL[pipelineFilter]);
  $('result-caption').textContent = filters.length
    ? `Đang lọc: ${filters.join(' · ')}` : 'Xếp theo mức ưu tiên xử lý, sau đó đến điểm phù hợp và hạn nộp.';

  $('list').innerHTML = visible.length
    ? visible.map(resultCard).join('')
    : '<div class="card priority-empty">Không có gói nào khớp điều kiện đang chọn.</div>';

  bindResultActions();
  $('warehouse-pagination').classList.toggle('hidden',pages<=1);
  $('warehouse-page-label').textContent=`Trang ${currentPage}/${pages} · ${items.length?offset+1:0}–${offset+visible.length}/${items.length} gói sau lọc`;
  $('warehouse-prev').disabled=currentPage<=1;$('warehouse-next').disabled=currentPage>=pages;
  $('csv').title=`Xuất ${items.length} gói sau lọc, gồm mọi trang`;
}

function renderFieldQuality(){
  const quality=summarizeTenderFields(state.tenders||[]);
  $('warehouse-field-quality').textContent=`${quality.missingOfficial.toLocaleString('vi-VN')}/${quality.total.toLocaleString('vi-VN')} gói thiếu trường lĩnh vực gốc investField (${quality.missingOfficialPercent.toLocaleString('vi-VN',{maximumFractionDigits:1})}%). ${quality.invalidOfficial} gói có giá trị nguồn chưa nhận diện; ${quality.unclassified} gói chưa phân loại. Chỉ trong kho đã lưu; không đoán lĩnh vực từ tên gói.`;
}
async function loadWarehouseHealth(){
  const request=++healthRequest;
  try{const r=await msg('GET_WAREHOUSE_STATUS');if(request!==healthRequest)return;if(!r?.ok)throw new Error(r?.message||'Chưa đọc được dung lượng kho.');
    $('warehouse-size').textContent=`${Number(r.count||0).toLocaleString('vi-VN')} gói đã lưu · khoảng ${(Number(r.bytes||0)/1048576).toLocaleString('vi-VN',{maximumFractionDigits:1})} MB`;
    $('warehouse-warning').textContent=r.warning?'Kho đang lớn. Có thể xem trước các gói đã đóng lâu để dọn bớt; gói đang làm việc được giữ lại.':'';
    $('warehouse-warning').classList.toggle('hidden',!r.warning);$('warehouse-health').classList.toggle('warn',Boolean(r.warning));
  }catch(error){if(request===healthRequest)$('warehouse-size').textContent=error.message||'Chưa đọc được dung lượng kho.';}
  $('cleanup-preview').disabled=Boolean(state.settings?.readOnlyMode||state.activeRun);
}
function cleanupError(message){$('cleanup-error').textContent=message||'';$('cleanup-error').classList.toggle('hidden',!message);}
function resetCleanupPreview(){cleanupPreview=null;$('cleanup-confirm').checked=false;$('cleanup-apply').disabled=true;$('cleanup-apply').textContent='Xóa các gói đủ điều kiện';$('cleanup-confirm-label').textContent='Chờ xem trước để xác nhận số gói đủ điều kiện.';$('cleanup-preview-list').textContent='';cleanupError('');}
async function openCleanupPreview(){
  if(cleanupBusy)return;resetCleanupPreview();$('cleanup-dialog').showModal();$('cleanup-summary').textContent='Đang kiểm tra các gói đủ điều kiện…';cleanupBusy=true;$('cleanup-preview').disabled=true;
  try{const r=await msg('PREVIEW_WAREHOUSE_CLEANUP',{months:6});if(!r?.ok)throw new Error(r?.message||'Chưa tạo được bản xem trước.');
    if(!$('cleanup-dialog').open)return;cleanupPreview=r;
    $('cleanup-summary').textContent=`${Number(r.count||0).toLocaleString('vi-VN')} gói đủ điều kiện · giữ lại ${Number(r.retainedCount||0).toLocaleString('vi-VN')} gói. Mốc đóng thầu: trước ${formatDate(r.cutoff||r.cutoffISO)}. ${r.message||''}`;
    const rows=Array.isArray(r.preview)?r.preview.slice(0,20):[];
    $('cleanup-preview-list').innerHTML=rows.length?`<p>Hiển thị tối đa 20 gói mẫu trong ${Number(r.count||0)} gói đủ điều kiện.</p><table><thead><tr><th>Mã gói</th><th>Tên gói</th><th>Đóng thầu</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.code||row.key)}</td><td>${esc(row.name)}</td><td>${esc(formatDate(row.closeDate))}</td></tr>`).join('')}</tbody></table>`:'<p>Không có gói đủ điều kiện để xóa.</p>';
    $('cleanup-confirm').disabled=!r.count;
    const count=Number(r.count||0).toLocaleString('vi-VN');
    $('cleanup-confirm-label').textContent=r.count?`Tôi đồng ý xóa toàn bộ ${count} gói đủ điều kiện khỏi kho cục bộ. Bảng trên chỉ hiển thị tối đa 20 gói mẫu.`:'Không có gói đủ điều kiện để xác nhận xóa.';
    $('cleanup-apply').textContent=`Xóa ${count} gói đủ điều kiện`;
  }catch(error){if($('cleanup-dialog').open){$('cleanup-summary').textContent='Chưa có bản xem trước hợp lệ.';cleanupError(error.message);}}finally{cleanupBusy=false;$('cleanup-preview').disabled=Boolean(state.settings?.readOnlyMode||state.activeRun);}
}
async function applyCleanup(){
  if(cleanupBusy||!cleanupPreview?.token||!cleanupPreview.count||!$('cleanup-confirm').checked)return;
  cleanupBusy=true;cleanupApplying=true;$('cleanup-apply').disabled=true;$('cleanup-confirm').disabled=true;cleanupError('');
  try{const r=await msg('APPLY_WAREHOUSE_CLEANUP',{token:cleanupPreview.token,confirmed:true});if(!r?.ok)throw new Error(r?.message||'Chưa dọn được kho.');
    resetCleanupPreview();$('cleanup-dialog').close();showToast(`Đã xóa ${Number(r.removed||0).toLocaleString('vi-VN')} gói đủ điều kiện khỏi kho.`);currentPage=1;await load();
  }catch(error){cleanupPreview=null;$('cleanup-confirm').checked=false;cleanupError(`${error.message} Đóng hộp này và bấm Xem trước dọn kho để kiểm tra lại.`);}finally{cleanupBusy=false;cleanupApplying=false;$('cleanup-confirm').disabled=false;}
}

function bindResultActions() {
  $('list').querySelectorAll('[data-save-decision]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('[data-key]');
      saveDecision(
        card.dataset.key,
        card.querySelector('[data-decision-state]').value,
        card.querySelector('[data-decision-owner]').value,
        card.querySelector('[data-decision-note]').value,
        button
      );
    });
  });

  $('list').querySelectorAll('[data-decision-owner],[data-decision-note]').forEach((input) => {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.closest('[data-key]').querySelector('[data-save-decision]').click();
      }
    });
  });

  $('list').querySelectorAll('[data-watch]').forEach((button) => {
    button.addEventListener('click', async () => {
      const card = button.closest('[data-key]');
      const tender = state.tenders.find((item) => item.key === card.dataset.key);
      if (!tender) return;
      button.disabled = true;
      try {
        const response = await msg('SET_WATCH', { key: tender.key, value: !tender.watchlisted });
        if (!response || response.ok === false) throw new Error(response && response.message || 'Không cập nhật được.');
        tender.watchlisted = !tender.watchlisted;
        showToast(tender.watchlisted ? 'Đã thêm gói vào danh sách theo dõi.' : 'Đã bỏ gói khỏi danh sách theo dõi.');
        renderList();
      } catch (error) {
        button.disabled = false;
        showToast(error.message || String(error), 'error');
      }
    });
  });

  $('list').querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      const card = button.closest('[data-key]');
      const tender = state.tenders.find((item) => item.key === card.dataset.key);
      if (!tender) return;
      if (!confirm(`Xóa “${tender.bidName || tender.displayCode || 'gói thầu này'}” khỏi dữ liệu cục bộ?`)) return;
      button.disabled = true;
      try {
        const response = await msg('DELETE_TENDER', { key: tender.key });
        if (!response || response.ok === false) throw new Error(response && response.message || 'Không xóa được.');
        state.tenders = state.tenders.filter((item) => item.key !== tender.key);
        showToast('Đã xóa gói khỏi dữ liệu cục bộ.');
        renderMetrics();
        renderPriority();
        renderPipeline();
        renderList();
      } catch (error) {
        button.disabled = false;
        showToast(error.message || String(error), 'error');
      }
    });
  });
}

async function saveDecision(key, nextState, owner, note, button) {
  const tender = state.tenders.find((item) => item.key === key);
  if (!tender) return showToast('Không tìm thấy gói thầu trong kho dữ liệu.', 'error');
  const originalLabel = button ? button.textContent : '';
  if (button) {
    button.disabled = true;
    button.textContent = 'Đang lưu…';
  }
  try {
    const response = await msg('SET_DECISION', { key, state: nextState, owner, note });
    if (!response || response.ok === false) throw new Error(response && response.message || 'Không lưu được quyết định.');
    tender.decisionState = normalizeDecisionState(response.state || nextState);
    tender.decisionOwner = String(owner || '').trim();
    tender.decisionNote = String(note || '').trim();
    tender.decisionUpdatedAt = new Date().toISOString();
    if (['REVIEW', 'GO', 'BID', 'SUBMITTED'].includes(tender.decisionState)) tender.watchlisted = true;
    showToast(`Đã chuyển sang “${DECISION_STATE_LABEL[tender.decisionState]}”.`);
    renderMetrics();
    renderPriority();
    renderPipeline();
    renderList();
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
    showToast(error.message || String(error), 'error');
  }
}

function renderAll() {
  renderBanner();
  renderMetrics();
  renderPriority();
  renderPipeline();
  renderContext();
  renderFieldQuality();
  renderList();
  managePolling();
}

async function load() {
  try {
    const response = await msg('GET_STATE');
    if (!response || response.ok === false) throw new Error(response && response.message || 'Không đọc được dữ liệu.');
    state = response;
    if (response.manifest) $('version').textContent = `v${response.manifest.version}`;
    renderAll();
    loadWarehouseHealth();
  } catch (error) {
    $('banner').className = 'notice error command-banner';
    $('banner').textContent = error.message || String(error);
  }
}

function managePolling() {
  if (state.activeRun && !pollTimer) {
    pollTimer = setInterval(load, 1800);
  } else if (!state.activeRun && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function resetAndRenderList() {
  currentPage = 1;
  renderList();
}

function bindEvents() {
  $('scan').addEventListener('click', async () => {
    $('scan').disabled = true;
    try {
      const response = await msg('START_SCAN', { mode: 'manual' });
      if (!response || response.ok === false) throw new Error(response && response.message || 'Không bắt đầu được lượt quét.');
      showToast('Đã bắt đầu quét theo bộ lọc đang chọn.', 'info');
      await load();
    } catch (error) {
      $('scan').disabled = false;
      showToast(error.message || String(error), 'error');
    }
  });
  $('openEgp').addEventListener('click', () => msg('OPEN_EGP'));
  $('saveTemplate').addEventListener('click', async () => {
    const response = await msg('SAVE_LAST_TEMPLATE');
    showToast(response && response.ok
      ? 'Đã lưu bộ lọc e-GP vừa sử dụng.'
      : response && response.message || 'Chưa quan sát được yêu cầu tìm kiếm.', response && response.ok ? 'ok' : 'error');
    if (response && response.ok) load();
  });
  $('openGuide').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html#filter') }));

  $('q').addEventListener('input', resetAndRenderList);
  ['statusFilter', 'minScore', 'sortBy', 'onlyWatch', 'onlyMatched'].forEach((id) => $(id).addEventListener('change', resetAndRenderList));
  $('clearPipeline').addEventListener('click', () => {
    pipelineFilter = '';
    currentPage = 1;
    renderPipeline();
    renderList();
  });
  $('warehouse-prev').addEventListener('click',()=>{currentPage--;renderList();$('result-title').scrollIntoView({block:'start'});});
  $('warehouse-next').addEventListener('click',()=>{currentPage++;renderList();$('result-title').scrollIntoView({block:'start'});});
  $('cleanup-preview').addEventListener('click',openCleanupPreview);
  $('cleanup-close').addEventListener('click',()=>{if(!cleanupApplying)$('cleanup-dialog').close();});
  $('cleanup-dialog').addEventListener('cancel',event=>{if(cleanupApplying)event.preventDefault();});
  $('cleanup-dialog').addEventListener('close',()=>{if(!cleanupBusy)resetCleanupPreview();});
  $('cleanup-confirm').addEventListener('change',()=>{$('cleanup-apply').disabled=cleanupBusy||!cleanupPreview?.count||!$('cleanup-confirm').checked;});
  $('cleanup-apply').addEventListener('click',applyCleanup);
  $('cleanup-backup').addEventListener('click',async()=>{const r=await msg('EXPORT_BACKUP_SAFE');if(r?.ok===false)cleanupError(r.message||'Chưa tạo được bản sao lưu.');else $('cleanup-summary').textContent+=' Đã gửi yêu cầu tạo bản sao lưu.';});

  $('csv').addEventListener('click',async()=>{const keys=currentResults().map(t=>t.key);if(!keys.length){showToast('Không có gói sau lọc để xuất.','error');return;}$('csv').disabled=true;try{const r=await msg('EXPORT_CSV',{saveAs:true,scope:'warehouse',view:warehouseView(),keys});if(!r?.ok)throw new Error(r?.message||'Chưa xuất được Excel.');showToast(`Đã tạo Excel cho ${keys.length} gói sau lọc, gồm mọi trang.`);}catch(error){showToast(error.message,'error');await load();}finally{$('csv').disabled=false;}});
  $('mobile').addEventListener('click', () => msg('EXPORT_MOBILE', { saveAs: true }));
  $('backupSafe').addEventListener('click', async () => {
    await msg('EXPORT_BACKUP_SAFE');
    showToast('Đã tạo bản sao an toàn, không chứa Bot Token hoặc Chat ID.');
  });
  chrome.storage.onChanged.addListener(() => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(load, 120);
  });
}

bindEvents();
load();
