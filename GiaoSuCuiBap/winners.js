import { transparencyIndex, transparencyChip } from './lib/transparency.js';
import { renderInsufficientRecords } from './insufficient-records.js';
import { initInvestorInput, readInvestorInput } from './investor-input.js';
/* Giáo Sư Cùi Bắp — winners.js
 * Giao diện tra cứu KẾT QUẢ LỰA CHỌN NHÀ THẦU theo tên công ty / mã số thuế.
 *
 * Luồng:
 *   1. Người dùng nhập.
 *   2. Nếu là mã số thuế  -> tra chính xác ngay (lọc theo winningCode).
 *      Nếu là tên công ty -> dò tên để lấy danh sách pháp nhân + MST, cho
 *      người dùng chọn, rồi mới tra chính xác. Bước này cần thiết vì e-GP chỉ
 *      ghi tên liên danh ở gói trúng theo liên danh, nên chỉ tra theo mã số
 *      thuế mới không bỏ sót gói nào.
 *   3. Nền (background.js) điều khiển tab e-GP; trang này chỉ hỏi trạng thái.
 */

import { formatMoney, formatDate } from './lib/core.js';
import { looksLikeTaxCode, normalizeTaxCodeForEgp, formatDiscount } from './lib/kqlcnt.js';

const $ = (id) => document.getElementById(id);
initInvestorInput($('investor'));
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });

let POLL = null;
let LAST_STATUS = '';
let LOOKUP = null, scopeRestored = false;
const dirtyScope = new Set();
for(const key of ['investor','province'])$(key).addEventListener('input',()=>dirtyScope.add(key));

function esc(x) {
  return String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function show(el, on) { el.classList.toggle('hidden', !on); }

function alertBox(message, kind) {
  const box = $('alert');
  box.className = `notice ${kind === 'error' ? 'error' : kind === 'ok' ? 'ok' : ''}`;
  box.textContent = String(message || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  show(box, Boolean(message));
}

function isIncomplete(lk) {
  return Boolean(lk && (lk.status === 'PARTIAL' || lk.partial || lk.cancelled || lk.capped));
}

function incompleteBanner(lk, count) {
  if (!isIncomplete(lk)) return '';
  const total = Number(lk.totalElements) || Number(count) || 0;
  const progress = total ? ` Mới nhận ${Number(count) || 0}/${total} bản ghi.` : '';
  const reason = lk.capped
    ? 'Lượt dò đã chạm giới hạn số trang.'
    : lk.cancelled
      ? 'Lượt tra cứu đã dừng giữa chừng.'
      : 'e-GP ngừng trả dữ liệu trước khi lấy hết các trang.';
  return `<b>Dữ liệu chưa đầy đủ.</b> ${reason}${progress} Không dùng các số dưới đây như toàn bộ lịch sử.`;
}

/* ------------------------------------------------------------------ *
 *  Bắt đầu tra cứu
 * ------------------------------------------------------------------ */

async function lookup(payload, fixedScope = null) {
  const owner=fixedScope ? null : readInvestorInput($('investor'));
  if(!fixedScope&&!owner)return;
  const scope=fixedScope || {investor:owner.value,province:$('province').value.trim()};
  payload={...payload,...scope};
  alertBox('', null);
  renderInsufficientRecords($('insufficient-records'),null);
  show($('pick'), false);
  show($('summary'), false);
  show($('results'), false);
  show($('progress'), true);
  $('progress-text').textContent = 'Đang mở e-GP và gửi yêu cầu tra cứu…';

  const res = await send('WINNER_LOOKUP', payload);
  if (!res || res.ok === false) {
    show($('progress'), false);
    alertBox(esc((res && res.message) || 'Không bắt đầu được lượt tra cứu.'), 'error');
    return;
  }
  startPolling();
}

function startPolling() {
  if (POLL) clearInterval(POLL);
  POLL = setInterval(refresh, 1000);
  refresh();
}
function stopPolling() {
  if (POLL) clearInterval(POLL);
  POLL = null;
}

/* ------------------------------------------------------------------ *
 *  Đọc & vẽ trạng thái
 * ------------------------------------------------------------------ */

async function refresh() {
  const state = await send('GET_WINNER_STATE');
  if (!state || !state.ok) return;
  renderHistory(state.cache || {});
  const lk = state.lookup;
  renderInsufficientRecords($('insufficient-records'),lk);
  LOOKUP = lk;
  if(lk){
    const c=lk.criteria || lk.scope || {};
    if(!scopeRestored){scopeRestored=true;for(const key of ['investor','province'])if(!dirtyScope.has(key))$(key).value=c[key]||'';}
    $('result-scope').textContent='Phạm vi kết quả: '+[c.investor?`Chủ đầu tư: ${c.investor}`:'Mọi chủ đầu tư',c.province||'Mọi tỉnh'].join(' · ');
    show($('result-scope'),true);
  }
  if (!lk) { show($('progress'), false); return; }

  const running = lk.status === 'RUNNING';
  show($('progress'), running);
  if (running) {
    $('progress-text').textContent = lk.message || 'Đang tra cứu…';
  } else {
    stopPolling();
    $('stop').disabled = false;
    $('stop').textContent = '⏹ Dừng';
  }

  if (lk.status === 'ERROR') {
    alertBox(
      `<b>Chưa lấy được kết quả.</b> ${esc(lk.message || '')}<br>
       <span class="small">Hãy mở lại trang tra cứu e-GP rồi thử lần nữa. Nếu e-GP đang quá tải, chờ ít phút.</span>`,
      'error'
    );
    return;
  }

  if (lk.mode === 'discover') renderCandidates(lk);
  else renderPackages(lk);

  LAST_STATUS = lk.status;
}

function renderCandidates(lk) {
  const list = lk.candidates || [];
  show($('summary'), false);
  show($('results'), false);

  if (lk.status !== 'SUCCESS' && lk.status !== 'PARTIAL') { show($('pick'), false); return; }

  if (!list.length) {
    show($('pick'), false);
    if (isIncomplete(lk)) {
      alertBox(incompleteBanner(lk, 0), 'error');
      return;
    }
    alertBox(
      `Không thấy nhà thầu nào khớp <b>${esc(lk.query)}</b>.<br>
       <span class="small">Gợi ý: nhập ngắn gọn phần tên riêng (ví dụ “An Khang” thay vì tên đầy đủ),
       hoặc nhập <b>mã số thuế</b> để đối chiếu đúng định danh nhà thầu.</span>`,
      'error'
    );
    return;
  }

  alertBox(incompleteBanner(lk, list.length), isIncomplete(lk) ? 'error' : null);
  show($('pick'), true);
  $('cands').innerHTML = list.map((c) => `
    <div class="cand" data-tax="${esc(c.taxCode)}" data-name="${esc(c.name)}">
      <div class="grow">
        <div style="font-weight:800">${esc(c.name)}</div>
        <div class="small muted">Mã số thuế: <span class="mst">${esc(c.taxCode)}</span></div>
      </div>
      <span class="pill">${c.hits} gói khớp</span>
      <span class="link">Xem trong phạm vi ↗</span>
    </div>`).join('');

  $('cands').querySelectorAll('.cand').forEach((row) => {
    row.addEventListener('click', () => {
      $('q').value = row.dataset.tax;
      lookup({ query: row.dataset.tax, taxCode: row.dataset.tax, contractorName: row.dataset.name }, {investor:(lk.criteria||lk.scope)?.investor||'',province:(lk.criteria||lk.scope)?.province||''});
    });
  });
}

function roleBadge(p) {
  return p.isVenture
    ? '<span class="pill badge-venture">Liên danh</span>'
    : '<span class="pill badge-solo">Độc lập</span>';
}

/** Tô màu theo hướng chênh lệch: giảm = xanh, cao hơn mốc trần = đỏ. */
function discountCell(p) {
  const r = p.discountRate;
  if (r === null || r === undefined) return '<span class="disc-flat">—</span>';
  const cls = r > 0 ? 'disc-down' : r < 0 ? 'disc-up' : 'disc-flat';
  const saved = p.savedAmount === null || p.savedAmount === undefined
    ? ''
    : `<div class="muted small">${esc(formatMoney(Math.abs(p.savedAmount)))}</div>`;
  return `<span class="${cls}">${esc(formatDiscount(r))}</span>${saved}`;
}

function renderPackages(lk) {
  show($('pick'), false);
  const list = lk.packages || [];

  if (lk.status === 'SUCCESS' && !list.length) {
    show($('summary'), false);
    show($('results'), false);
    show($('pricenote'), false);
    alertBox(
      `e-GP không ghi nhận gói thầu nào mà <b>${esc(lk.label)}</b> trúng thầu trong phạm vi đã chọn.<br>
       <span class="small">Kiểm tra lại mã số thuế, hoặc mở rộng phạm vi chủ đầu tư / tỉnh rồi tra lại.</span>`,
      'error'
    );
    return;
  }
  if (!list.length) return;

  alertBox(incompleteBanner(lk, list.length), isIncomplete(lk) ? 'error' : null);

  const s = lk.summary || {};
  // Khi người dùng dừng trước trang cuối, background có thể chưa kịp chốt phần
  // tổng hợp. Vẫn cho xem các dòng đã nhận nhưng không vẽ các số 0 giả.
  show($('summary'), Boolean(lk.summary));
  show($('results'), true);
  show($('pricenote'), true);

  $('m-name').textContent = lk.scopeOnly ? (lk.label || 'Nhà thầu trúng thầu theo chủ đầu tư') : (lk.contractorName || '—');
  $('m-name').previousElementSibling.textContent = lk.scopeOnly ? 'Phạm vi tra cứu' : 'Nhà thầu';
  $('m-tax').textContent = lk.focusTaxCode ? `Mã số thuế: ${lk.focusTaxCode}` : (lk.criteria?.investor || '—');
  $('m-total').textContent = list.length;
  $('m-split').textContent = `${s.solo || 0} độc lập · ${s.venture || 0} liên danh`;
  // Giá trị gói LIÊN DANH thuộc về cả nhóm, e-GP không công bố tỷ lệ góp nên
  // KHÔNG được cộng chung với gói trúng độc lập — sẽ thổi phồng năng lực.
  // Missing award prices stay unknown. Counts also support older cached summaries.
  const hasAwardPrice = p => typeof p.winningPrice === 'number' && Number.isFinite(p.winningPrice) && p.winningPrice >= 0;
  const soloRows = list.filter(p => !p.isVenture), ventureRows = list.filter(p => p.isVenture);
  const soloKnown = Number.isInteger(s.soloKnownPriceCount) ? s.soloKnownPriceCount : soloRows.filter(hasAwardPrice).length;
  const ventureKnown = Number.isInteger(s.ventureKnownPriceCount) ? s.ventureKnownPriceCount : ventureRows.filter(hasAwardPrice).length;
  $('m-value').textContent = !soloRows.length ? '—' : soloKnown ? formatMoney(s.soloValue || 0) : 'Chưa có giá';
  $('m-basis').innerHTML = `${soloKnown}/${soloRows.length} gói độc lập đã có giá.${soloKnown < soloRows.length ? ' Tổng chỉ gồm giá đã công bố.' : ''}`
    + (ventureRows.length ? `<br>Liên danh: <b>${ventureKnown ? esc(formatMoney(s.ventureValue || 0)) : 'chưa có giá'}</b> · ${ventureKnown}/${ventureRows.length} gói đã có giá
       <span title="e-GP không công bố tỷ lệ góp của từng thành viên">(giá trị của cả nhóm)</span>` : '');

  const disc = $('m-disc');
  if (s.overallDiscountRate === null || s.overallDiscountRate === undefined) {
    disc.textContent = '—';
    disc.className = 'metric num disc-flat';
    $('m-disc-sub').textContent = 'Không đủ dữ liệu giá để tính';
  } else {
    disc.textContent = formatDiscount(s.overallDiscountRate);
    disc.className = `metric num ${s.overallDiscountRate > 0 ? 'disc-down' : s.overallDiscountRate < 0 ? 'disc-up' : 'disc-flat'}`;
    $('m-disc-sub').textContent =
      `Tổng chênh lệch ${formatMoney(Math.abs(s.savedTotal))} · trung vị ${formatDiscount(s.medianDiscountRate)} · trên ${s.pricedCount}/${list.length} gói có đủ giá`;
  }

  $('m-max').textContent = s.largest ? formatMoney(s.largest.winningPrice) : '—';
  $('m-max-name').textContent = s.largest ? s.largest.bidName : '';

  const chips = (items, fmt) => (items || []).map((x) => `<span class="pill">${esc(fmt(x))}</span>`).join('') || '<span class="muted small">—</span>';
  $('by-field').innerHTML = chips(s.byField, (x) => `${x.name}: ${x.count}`);
  $('by-year').innerHTML = chips(s.byYear, (x) => `${x.year}: ${x.count}`);
  $('by-investor').innerHTML = chips(s.byInvestor, (x) => `${x.name} (${x.count})`);

  // Cả mã TBMT lẫn tên gói đều là link mở thẳng trang KQLCNT gốc trên e-GP.
  $('rows').innerHTML = list.map((p) => `
    <tr>
      <td>${roleBadge(p)}</td>
      <td class="num">
        <a class="link tbmt" href="${esc(p.detailUrl)}" target="_blank" rel="noopener"
           title="Mở kết quả lựa chọn nhà thầu trên e-GP">${esc(p.notifyNoStand)} ↗</a>
        <button class="btn light" style="width:auto;margin-top:6px;padding:4px 8px;font-size:12px"
                data-dl data-no="${esc(p.notifyNo)}" data-url="${esc(p.detailUrl)}"
                data-net="${p.isInternet ? '1' : '0'}"
                title="Tải quyết định phê duyệt và báo cáo đánh giá (chấm thầu) qua phần mềm hỗ trợ e-GP"
        >📎 Tải hồ sơ</button>
        ${p.planNo ? `
        <button class="btn light" style="width:auto;margin-top:6px;padding:4px 8px;font-size:12px"
                data-plan="${esc(p.planNo)}"
                title="Mở Kế hoạch lựa chọn nhà thầu ${esc(p.planNo)} — đường chắc ăn khi trang chi tiết KQLCNT của e-GP trắng trơn, hay gặp với gói chỉ định thầu"
        >📋 Xem KHLCNT</button>` : ''}
      </td>
      <td class="wrap">
        <a class="link" href="${esc(p.detailUrl)}" target="_blank" rel="noopener"
           style="font-weight:700;color:inherit">${esc(p.bidName)}</a>
        <div class="muted small">${esc([p.fieldLabel, p.bidFormLabel, p.location].filter(Boolean).join(' · '))}</div>
        <div style="margin-top:4px">${transparencyChip(transparencyIndex(p))}</div>
        ${p.isVenture && p.memberNames.length
          ? `<div class="muted small" style="margin-top:3px">Liên danh: ${esc(p.memberNames.join(' · '))}</div>`
          : ''}
      </td>
      <td class="wrap">${esc(p.winnerName || 'Chưa công bố tên')}<div class="small muted mst">${esc((p.winningTaxCodes || []).join(' · '))}</div></td>
      <td class="wrap">${esc(p.investorName || '—')}</td>
      <td class="num">${esc(formatMoney(p.priceBasis))}</td>
      <td class="num" style="font-weight:800;color:#166534">${esc(formatMoney(p.winningPrice))}</td>
      <td class="num">${discountCell(p)}</td>
      <td class="num">${esc(formatDate(p.decisionDate))}</td>
    </tr>`).join('');
}

/* ------------------------------------------------------------------ *
 *  Danh bạ các lần tra trước (xem lại không cần tra lại)
 * ------------------------------------------------------------------ */

function renderHistory(cache) {
  const list = Object.values(cache || {}).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 12);
  $('hist').innerHTML = list.length
    ? `<span class="muted small" style="align-self:center">Đã tra gần đây:</span>` +
      list.map((c) => `<span class="hist" data-tax="${esc(c.taxCode)}" title="${esc(c.name)}">${esc((c.name || c.taxCode).slice(0, 34))} · ${c.total}</span>`).join('')
    : '';
  $('hist').querySelectorAll('.hist').forEach((el) => {
    el.addEventListener('click', () => {
      $('q').value = el.dataset.tax;
      lookup({ query: el.dataset.tax, taxCode: el.dataset.tax });
    });
  });
}

/* ------------------------------------------------------------------ *
 *  Sự kiện
 * ------------------------------------------------------------------ */

function submit() {
  const raw = $('q').value.trim();
  if (!raw && !$('investor').value.trim()) { alertBox('Nhập tên / mã số thuế nhà thầu, hoặc chọn ít nhất một chủ đầu tư để xem các nhà thầu đã trúng.', 'error'); return; }
  const tax = normalizeTaxCodeForEgp(raw);
  lookup(tax ? { query: raw, taxCode: tax } : { query: raw });
}

$('go').addEventListener('click', submit);
for(const key of ['q','investor','province'])$(key).addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
$('stop').addEventListener('click', async () => {
  $('stop').disabled = true;
  $('stop').textContent = '⏳ Đang dừng…';
  await send('CANCEL_WINNER_LOOKUP');
});
$('reset').addEventListener('click', async () => {
  $('q').value = '';
  for(const key of ['investor','province']){$(key).value='';dirtyScope.add(key);}
  show($('result-scope'),false);
  renderInsufficientRecords($('insufficient-records'),null);
  stopPolling();
  await send('CANCEL_WINNER_LOOKUP');
  await send('CLEAR_WINNER_LOOKUP');
  show($('progress'), false);
  show($('pick'), false);
  show($('summary'), false);
  show($('results'), false);
  show($('pricenote'), false);
  alertBox('', null);
});
$('csv').addEventListener('click', async () => {
  const r = await send('EXPORT_WINNERS_CSV');
  if (r && r.ok === false) alertBox(esc(r.message || 'Không xuất được CSV.'), 'error');
});

// Gợi ý ngay khi gõ: cho biết sẽ tra chính xác hay dò theo tên.
$('q').addEventListener('input', () => {
  const raw = $('q').value.trim();
  if (!raw) { $('go').textContent = '🔎 Tra cứu trên e-GP'; return; }
  $('go').textContent = looksLikeTaxCode(raw) ? '🎯 Tra chính xác theo MST' : '🔎 Dò theo tên công ty';
});

refresh();

/* --------------------------------------------------------------------------
 *  TẢI HỒ SƠ QUA PHẦN MỀM HỖ TRỢ e-GP
 *
 *  e-GP KHÔNG phát tệp qua máy chủ web — bấm vào tên tệp trên trang e-GP cũng
 *  là gọi phần mềm hỗ trợ cài trên máy. Nút này làm hộ đúng cú bấm đó, nhưng
 *  tự mở trang gói ở tab nền, lấy hết tệp rồi tải một lượt.
 * ------------------------------------------------------------------------ */
async function downloadDocs(btn, notifyNo, detailUrl, isInternet) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Đang lấy…';
  const res = await send('FETCH_AND_DOWNLOAD', { notifyNo, detailUrl, isInternet });
  btn.disabled = false;
  if (res && res.ok) {
    btn.textContent = `✅ ${res.downloaded} tệp`;
    setTimeout(() => { btn.textContent = old; }, 4000);
  } else {
    btn.textContent = '⚠️ Lỗi';
    alertBox(esc((res && res.message) || 'Không tải được hồ sơ.'), 'error');
    setTimeout(() => { btn.textContent = old; }, 4000);
  }
}

document.addEventListener('click', (e) => {
  const dl = e.target.closest('[data-dl]');
  if (dl) { downloadDocs(dl, dl.dataset.no || '', dl.dataset.url || '', dl.dataset.net === '1'); return; }

  /* Mở Kế hoạch lựa chọn nhà thầu sinh ra gói này.
     Đi qua màn hình KHLCNT của chính tiện ích, KHÔNG dựng link chi tiết e-GP:
     bản ghi KQLCNT chỉ có `planNo`, không có id nội bộ của kế hoạch, mà thiếu
     id thì trang chi tiết e-GP mở ra trắng trơn — đúng thứ đang phải chữa. */
  const plan = e.target.closest('[data-plan]');
  if (plan) {
    const code = String(plan.dataset.plan || '').trim().toUpperCase();
    if (code) chrome.tabs.create({ url: chrome.runtime.getURL(`plans.html?planNo=${encodeURIComponent(code)}`) });
  }
});

/* Dọn các lượt còn kẹt "đang chạy" từ phiên trước trước khi vẽ trạng thái.
   Không dọn thì trang hiện thanh tiến trình của một lượt đã chết —
   trông như phần mềm tự động chạy (xem reconcileStaleLookups). */
send('RECONCILE_LOOKUPS').then(() => refresh()).catch(() => refresh());

send('AREA_OPTIONS',{provincesOnly:true}).then(r=>{if(r?.ok)$('province-list').innerHTML=(r.provinces||[]).map(n=>`<option value="${esc(n)}">`).join('');}).catch(()=>{});
