/* Giáo Sư Cùi Bắp — plans.js
 * Tra cứu KẾ HOẠCH LỰA CHỌN NHÀ THẦU theo chủ đầu tư / tỉnh / xã · phường.
 *
 * Tiêu chí địa bàn/chủ đầu tư gửi đến e-GP; loại gói thầu đối chiếu từng
 * gói trong kế hoạch. Nhóm tư vấn chuyên môn được nhận diện từ tên gói.
 */

import { coverageText } from './lib/match-gate.js';
import { hardFilterReason } from './lib/hard-filter.js';
import { safeSource } from './lib/workspace.js';
import { formatMoney, formatDate } from './lib/core.js';
import { TENDER_CATEGORIES, normalizeCategory, categoryLabel } from './lib/tender-categories.js';
import { createWardPicker } from './ward-picker.js';

const $ = (id) => document.getElementById(id);
const send = async (type, payload = {}) => { try { return await chrome.runtime.sendMessage({ type, payload }); } catch(e) { return {ok:false,message:'Không kết nối được tiện ích: '+e.message}; } };
const wardPicker=createWardPicker({send,province:$('province'),ward:$('ward'),list:$('ward-list'),hint:$('ward-hint')});

let POLL = null;
let LOOKUP = null;
let criteriaRestored = false, starting = false, refreshing = false;
const dirtyCriteria = new Set();
const planCriteriaFields = ['investor', 'province', 'ward', 'keyword', 'category', 'period', 'fromDate', 'toDate'];

function esc(x) {
  return String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function show(el, on) { el.classList.toggle('hidden', !on); }
$('category').innerHTML = TENDER_CATEGORIES.map((c) => `<option value="${esc(c.value)}">${esc(c.label)}</option>`).join('');
for (const key of planCriteriaFields) {
  for (const event of ['input', 'change']) $(key).addEventListener(event, () => dirtyCriteria.add(key));
}
function alertBox(html, kind) {
  const box = $('alert');
  box.className = `notice ${kind === 'error' ? 'error' : kind === 'ok' ? 'ok' : ''}`;
  box.textContent = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  show(box, Boolean(html));
}

function isCapped(lookup) {
  const seen = Number(lookup && lookup.serverCount) || 0;
  const total = Number(lookup && lookup.totalElements) || 0;
  return Boolean(lookup && (lookup.capped || (total > 0 && seen > 0 && seen < total)));
}

function isIncomplete(lookup) {
  return Boolean(lookup && (lookup.status === 'PARTIAL' || lookup.partial || lookup.cancelled || isCapped(lookup)));
}

/* --------------------------------------------------------------------------
 *  Ô CHỌN TỈNH VÀ XÃ/PHƯỜNG
 *
 *  Danh sách lấy từ chính e-GP rồi ghi nhớ (xem lib/areas.js), thay cho bảng
 *  chép cứng trước đây: cả nước có 4.055 xã/phường, chép tay vào mã nguồn thì
 *  vừa phình vừa lạc hậu ngay lần điều chỉnh địa giới kế tiếp.
 *
 *  Danh sách xã/phường của một tỉnh gồm CẢ tên mới và tên huyện/xã cũ, vì hồ
 *  sơ đăng trước 1/7/2025 vẫn ghi tên cũ.
 * ------------------------------------------------------------------------ */

function fillDatalist(id, names) {
  $(id).innerHTML = (names || []).map((n) => `<option value="${esc(n)}">`).join('');
}

async function loadProvinceOptions() {
  const res = await send('AREA_OPTIONS', {});
  if (!res || res.ok === false) {
    $('ward-hint').textContent = (res && res.message) || 'Chưa lấy được danh sách địa bàn từ e-GP.';
    return;
  }
  fillDatalist('province-list', res.provinces);
  $('ward-hint').textContent = `${res.provinces.length} tỉnh/thành. Chọn tỉnh để hiện danh sách xã/phường.`;
}

async function loadWardOptions() {
  return wardPicker.load();
}

$('province').addEventListener('change',()=>{wardPicker.clear();loadWardOptions();});
$('province').addEventListener('blur', loadWardOptions);
loadProvinceOptions();

/* ------------------------------------------------------------------ */

/* ---------------------------------------------------------------------------
 *  KHOẢNG THỜI GIAN
 *
 *  Người dùng chọn địa bàn rồi vẫn nhận kế hoạch của năm cũ lẫn vào, và mỗi
 *  lượt tra phải xét hàng trăm kế hoạch mới lấy được phần đầu. Khoanh theo
 *  ngày vừa cắt đúng thứ cần, vừa giảm hẳn khối lượng phải tải.
 *
 *  Mốc đối chiếu là NGÀY PHÊ DUYỆT — đúng ngày hiển thị trên mỗi thẻ kết quả.
 * ------------------------------------------------------------------------- */

/** Quy lựa chọn trên giao diện thành tiêu chí gửi xuống tầng nền. */
function dateCriteria() {
  const v = $('period').value;
  if (v === 'custom') {
    return { fromDate: $('fromDate').value, toDate: $('toDate').value, days: 0 };
  }
  return { fromDate: '', toDate: '', days: Number(v) || 0 };
}

/** Hai ô ngày chỉ hiện khi chọn "Tự chọn khoảng ngày". */
function syncDateRange() {
  const custom = $('period').value === 'custom';
  show($('dateRange'), custom);
  show($('dateRange2'), custom);
  if (custom && !$('fromDate').value && !$('toDate').value) {
    const iso = (d) => new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10);
    const now = new Date();
    $('toDate').value = iso(now);
    $('fromDate').value = iso(new Date(now.getTime() - 90 * 86400000));
  }
}
$('period').addEventListener('change', syncDateRange);
syncDateRange();

async function start() {
  if(starting || LOOKUP?.status==='RUNNING')return;
  starting=true;$('go').disabled=true;
  const payload = {
    investor: $('investor').value.trim(),
    province: $('province').value.trim(),
    ...wardPicker.read(),
    keyword: $('keyword').value.trim(),
    category: normalizeCategory($('category').value),
    ...dateCriteria()
  };
  alertBox('', null);
  show($('summary'), false);
  $('list').innerHTML = '';
  show($('only-wrap'), false);
  show($('progress'), true);
  $('progress-text').textContent = 'Đang tra cứu kế hoạch trên e-GP theo tiêu chí đã chọn…';

  const res = await send('PLAN_LOOKUP', payload);
  starting=false;$('go').disabled=Boolean(res?.ok);
  if (!res || res.ok === false) {
    show($('progress'), false);
    alertBox(esc((res && res.message) || 'Không bắt đầu được lượt tra cứu.'), 'error');
    return;
  }
  startPolling();
}

function startPolling() { if (POLL) clearInterval(POLL); POLL = setInterval(refresh, 1000); refresh(); }
function stopPolling() { if (POLL) clearInterval(POLL); POLL = null; }

async function refresh() {
  if(refreshing)return;
  refreshing=true;
  try {
  const state = await send('GET_PLAN_STATE');
  if (!state || !state.ok) return;
  LOOKUP = state.lookup;
  if (!LOOKUP) { show($('progress'), false); return; }
  // Restore once on reopening. Polling must not undo edits or refill a cleared selector.
  if (!criteriaRestored) {
    criteriaRestored = true;
    const c = LOOKUP.criteria || {};
    if(!dirtyCriteria.has('ward')&&!dirtyCriteria.has('province'))wardPicker.set(c.wardIdentities);
    for (const key of ['investor', 'province', 'ward', 'keyword', 'category']) {
      if (!dirtyCriteria.has(key)) $(key).value = key === 'category' ? normalizeCategory(c[key]) : (c[key] || '');
    }
    if (!['period', 'fromDate', 'toDate'].some((key) => dirtyCriteria.has(key))) {
      $('period').value = c.fromDate || c.toDate ? 'custom' : String(c.days || '');
      $('fromDate').value = c.fromDate || '';
      $('toDate').value = c.toDate || '';
      syncDateRange();
    }
    if ($('province').value) loadWardOptions();
  }

  const running = LOOKUP.status === 'RUNNING';
  $('go').disabled=starting||running;
  show($('progress'), running);
  if (running) {
    if(!POLL)POLL=setInterval(refresh,1000);
    $('progress-text').textContent = LOOKUP.message || 'Đang tra cứu…';
  } else {
    stopPolling();
    $('stop').disabled = false;
    $('stop').textContent = '⏹ Dừng';
  }

  if (LOOKUP.status === 'ERROR') {
    alertBox(`<b>Không tra cứu được.</b> ${esc(LOOKUP.message || '')}`, 'error');
    return;
  }
  render();
  } finally { refreshing=false; }
}

/* ------------------------------------------------------------------ */

function planCard(p) {
  const pkgs = p.packages || [];
  const source=safeSource(p.detailUrl);
  const matchedOnly = Boolean(p.categoryFiltered || p.localCriteriaFiltered);
  const totalPackages = Number(p.originalPackageCount ?? p.packageCount ?? pkgs.length);
  const packageSummary = matchedOnly
    ? `${pkgs.length}/${totalPackages} gói khớp · giá các gói khớp ${esc(formatMoney(p.totalPackagePrice))}`
    : `${p.packageCount} gói · tổng ${esc(formatMoney(p.totalPackagePrice))}`;
  const table = pkgs.length
    ? `<table>
        <thead><tr><th style="width:44px">STT</th><th>${matchedOnly ? 'Gói thầu khớp tiêu chí đã chọn' : 'Gói thầu trong kế hoạch'}</th><th style="width:170px">Giá gói thầu</th></tr></thead>
        <tbody>${pkgs.map((g, i) => `
          <tr><td class="num">${i + 1}</td><td>${esc(g.name)}</td>
          <td class="num">${esc(formatMoney(g.price))}</td></tr>`).join('')}</tbody>
       </table>`
    : '<div class="muted small" style="padding:10px 13px">Kế hoạch này chưa liệt kê gói thầu trong dữ liệu công khai.</div>';

  return `
    <div class="plan">
      <header>
        <h3>${source?`<a class="link" href="${esc(source)}" target="_blank" rel="noopener">${esc(p.name)} ↗</a>`:esc(p.name)}</h3>
        <div class="muted small">
          <span class="code">${esc(p.planNoStand)}</span>${p.filterState==='INSUFFICIENT'?` · <span class="tag tag-wait">Chưa đủ dữ liệu: ${esc(hardFilterReason({reason:p.filterReason,state:p.filterState}))}</span>`:''}
          ${p.hasUnannounced ? ' · <span class="tag tag-new">Còn gói chưa mời thầu</span>' : ''}
          ${p.planTypeLabel ? ` · ${esc(p.planTypeLabel)}` : ''}
          ${p.fields?.length ? ` · ${esc(p.fields.join(', '))}` : ''}
        </div>
        <div class="muted small" style="margin-top:3px">
          🏛 ${esc(p.investorName || '—')}${p.investorCode ? ` (${esc(p.investorCode)})` : ''}
        </div>
        <div class="muted small">📍 ${esc(p.location || '—')}</div>
        ${p.projectName ? `<div class="muted small">📁 Dự án: ${esc(p.projectName)}</div>` : ''}
        <div class="muted small" style="margin-top:3px">
          ${packageSummary}
          ${p.investTotal ? ` · TMĐT ${esc(formatMoney(p.investTotal))}` : ''}
          · phê duyệt ${esc(formatDate(p.decisionDate))}
        </div>
      </header>
      ${table}
    </div>`;
}

function render() {
  const plans = LOOKUP.plans || [];
  const s = LOOKUP.summary;
  const incomplete = isIncomplete(LOOKUP);
  const category = normalizeCategory(LOOKUP.criteria?.category);
  const matchedOnly = Boolean(category)||(LOOKUP.plans||[]).some(p=>p.localCriteriaFiltered);
  const unknownCategoryNote = matchedOnly && LOOKUP.categoryUnknownPackages
    ? `${LOOKUP.categoryUnknownPackages} gói chưa đủ thông tin để xác định loại, chưa được tính vào kết quả lọc.`
    : '';

  const insufficient=LOOKUP.insufficientPlans||[];
  show($('insufficient-wrap'),insufficient.length>0);
  $('insufficient-title').textContent=`${insufficient.length} kế hoạch chưa đủ dữ liệu đối chiếu`;
  $('insufficient-list').innerHTML=insufficient.map(planCard).join('');
  $('csv').disabled=!plans.length;

  /* Bỏ hẳn cảnh báo "không đặt được tiêu chí". Cảnh báo đó có từ thời tiện ích
     điều khiển biểu mẫu e-GP; nay mọi tiêu chí đều đi thẳng vào truy vấn nên
     `applied` luôn rỗng — giữ lại sẽ báo lỗi giả với MỌI lượt tra cứu. */
  const warnings = [];
  if(LOOKUP.coverage)warnings.push(esc(LOOKUP.coverage.text||coverageText(LOOKUP.coverage)));
  if(LOOKUP.dateUnknown)warnings.push(`${LOOKUP.dateUnknown} kế hoạch thiếu ngày phê duyệt; chưa tính là khớp khoảng ngày.`);
  if(insufficient.length)warnings.push(`Có ${insufficient.length} kế hoạch chưa đủ dữ liệu trong nhóm riêng phía dưới.`);
  if(!plans.length && LOOKUP.status!=='RUNNING')warnings.push('Không có kế hoạch khớp đầy đủ tiêu chí trong dữ liệu đã nhận. Kiểm tra phần đối soát và nhóm chưa đủ dữ liệu trước khi nới điều kiện.');
  if (unknownCategoryNote) warnings.push(esc(unknownCategoryNote));
  if (incomplete) {
    const detail = isCapped(LOOKUP)
      ? `Mới nhận ${LOOKUP.serverCount || plans.length}/${LOOKUP.totalElements || '?'} kế hoạch do đã chạm giới hạn trang.`
      : (LOOKUP.cancelled ? 'Lượt tra cứu đã dừng giữa chừng.' : 'e-GP ngừng trả dữ liệu trước khi lấy hết các trang.');
    warnings.push(`<b>Dữ liệu chưa đầy đủ.</b> ${esc(detail)} Không dùng tổng số và tổng giá trị như toàn bộ phạm vi.`);
  }
  if ((LOOKUP.mismatched || []).length) {
    warnings.push(`<b>${LOOKUP.mismatched.length} kế hoạch</b> e-GP trả về nhưng không khớp hoàn toàn tiêu chí bạn nhập
      (${esc(LOOKUP.mismatched.slice(0, 5).join(', '))}${LOOKUP.mismatched.length > 5 ? '…' : ''}).
      Thường do e-GP tính cả địa bàn trước sáp nhập.`);
  }
  if (LOOKUP.areaDropped) {
    warnings.push(`Đã bỏ <b>${LOOKUP.areaDropped}</b> kế hoạch lệch địa bàn sau khi tải về.`);
  }
  alertBox(warnings.join('<br><br>'), null);

  if (s) {
    show($('summary'), true);
    $('m-plan').textContent = s.planCount;
    $('m-plan-sub').textContent = [matchedOnly ? categoryLabel(category) : '', LOOKUP.totalElements ? `e-GP báo ${LOOKUP.totalElements} kế hoạch${matchedOnly ? ' trước lọc loại' : ''}` : ''].filter(Boolean).join(' · ');
    $('m-pkg-title').textContent = matchedOnly ? 'Số gói khớp tiêu chí' : 'Tổng số gói thầu';
    $('m-val-title').textContent = matchedOnly ? 'Tổng giá các gói khớp' : 'Tổng giá các gói';
    $('m-pkg').textContent = s.packageCount;
    $('m-pkg-sub').textContent = matchedOnly
      ? `Trong ${plans.reduce((sum, p) => sum + Number(p.originalPackageCount ?? p.packageCount ?? 0), 0)} gói của các kế hoạch đang khớp`
      : (s.planCount ? `trung bình ${(s.packageCount / s.planCount).toFixed(1)} gói/kế hoạch` : '');
    $('m-val').textContent = formatMoney(s.totalValue);
    $('m-invest').textContent = s.investTotal ? `TMĐT toàn bộ dự án trong các kế hoạch này: ${formatMoney(s.investTotal)}` : '';
    $('m-new').textContent = s.withUnannounced;

    const chips = (items) => (items || []).map((x) => `<span class="pill">${esc(x.name)} (${x.count})</span>`).join('') || '<span class="muted small">—</span>';
    $('by-investor').innerHTML = chips(s.byInvestor);
    $('by-ward').innerHTML = chips(s.byWard);
  }

  show($('only-wrap'), plans.length>0);
  const list = $('only').checked ? plans.filter((p) => p.hasUnannounced) : plans;
  $('list').innerHTML = list.length
    ? list.map(planCard).join('')
    : `<div class="notice" style="margin-top:12px">${$('only').checked?'Không có kế hoạch khớp nào còn gói chưa đăng thông báo mời thầu.':LOOKUP.status==='RUNNING'?'Đang chờ kế hoạch khớp tiêu chí…':'Chưa có kế hoạch khớp đầy đủ tiêu chí trong dữ liệu đã nhận.'}</div>`;
}

/* ------------------------------------------------------------------ */

$('go').addEventListener('click', start);
$('only').addEventListener('change', render);
$('stop').addEventListener('click', async () => {
  $('stop').disabled = true;
  $('stop').textContent = '⏳ Đang dừng…';
  await send('CANCEL_PLAN_LOOKUP');
});
$('reset').addEventListener('click', async () => {
  criteriaRestored = true;
  ['investor', 'province', 'ward', 'keyword', 'category', 'fromDate', 'toDate'].forEach((id) => { $(id).value = ''; dirtyCriteria.add(id); });
  $('period').value='';dirtyCriteria.add('period');syncDateRange();
  wardPicker.clear();
  $('ward-hint').textContent = 'Chọn tỉnh trước để hiện danh sách xã/phường.';
  stopPolling();
  await send('CANCEL_PLAN_LOOKUP');
  await send('CLEAR_PLAN_LOOKUP');
  show($('progress'), false);
  show($('summary'), false);
  show($('only-wrap'), false);
  $('list').innerHTML = '';LOOKUP=null;$('go').disabled=false;show($('insufficient-wrap'),false);
  alertBox('', null);
});
$('csv').addEventListener('click', async () => {
  const r = await send('EXPORT_PLANS_CSV',{onlyUnannounced:$('only').checked});
  if (r && r.ok === false) alertBox(esc(r.message || 'Không xuất được CSV.'), 'error');
});
['investor', 'province', 'ward', 'keyword', 'category'].forEach((id) => {
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
});

/* Dọn các lượt còn kẹt "đang chạy" từ phiên trước trước khi vẽ trạng thái.
   Không dọn thì trang hiện thanh tiến trình của một lượt đã chết —
   trông như phần mềm tự động chạy (xem reconcileStaleLookups). */
function openFromQuery(){
  const raw=String(new URLSearchParams(location.search).get('planNo')||'').trim();
  if(!/^PL\d{6,}(?:-\d{2})?$/i.test(raw))return false;
  criteriaRestored=true;
  for(const key of ['investor','province','ward','category','fromDate','toDate']){$(key).value='';dirtyCriteria.add(key);}
  $('keyword').value=raw.toUpperCase();$('period').value='';dirtyCriteria.add('keyword');dirtyCriteria.add('period');syncDateRange();
  void start();return true;
}
send('RECONCILE_LOOKUPS').then(()=>{if(!openFromQuery())refresh();}).catch(()=>{if(!openFromQuery())refresh();});
