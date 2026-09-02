/* search.js — Chức năng 1: tìm thông báo mời thầu theo biểu mẫu.
 *
 * Tiêu chí được đặt lên chính biểu mẫu tìm kiếm nâng cao của e-GP rồi để e-GP
 * tự dựng truy vấn — cách này xử lý đúng việc một tỉnh sau sáp nhập mang nhiều
 * mã địa bàn (xem lib/khlcnt.js). Kết quả đi vào kho gói thầu chung nên vẫn
 * được chấm điểm và chống trùng như mọi lượt quét khác.
 */

import { formatMoney, formatDate, BID_STATUS_LABEL, daysToClose } from './lib/core.js';
import {
  statusOf, missingFields, actionFor, fold, filterAndSort, decisionSignals, deadlineIcon
} from './lib/decision.js';

const $ = (id) => document.getElementById(id);
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });

let POLL = null;
let STATE = null;

function esc(x) {
  return String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function show(el, on) { el.classList.toggle('hidden', !on); }
function alertBox(html, kind) {
  const box = $('alert');
  box.className = `notice ${kind === 'error' ? 'error' : kind === 'ok' ? 'ok' : ''}`;
  box.innerHTML = html;
  show(box, Boolean(html));
}

/* --------------------------------------------------------------------------
 *  Ô CHỌN TỈNH VÀ XÃ/PHƯỜNG
 *
 *  Danh sách lấy TỪ CHÍNH e-GP rồi ghi nhớ (xem lib/areas.js), thay cho bảng
 *  chép cứng trước đây. Lý do bắt buộc: tiện ích phải quy TÊN tỉnh ra MÃ để
 *  gửi lên e-GP, mà bảng chép tay có tên lệch so với e-GP (ví dụ e-GP ghi
 *  "Thành phố Đồng Nai" chứ không phải "Tỉnh Đồng Nai") — lệch một chữ là quy
 *  ra mã trượt và lượt tra trả về rỗng.
 * ------------------------------------------------------------------------ */

function fillDatalist(id, names) {
  const el = $(id);
  if (el) el.innerHTML = (names || []).map((n) => `<option value="${esc(n)}">`).join('');
}

async function loadProvinceOptions() {
  const res = await send('AREA_OPTIONS', {});
  if (!res || res.ok === false) return;
  fillDatalist('province-list', res.provinces);
  if ($('ward-hint')) {
    $('ward-hint').textContent = `${res.provinces.length} tỉnh/thành. Chọn tỉnh để hiện danh sách xã/phường.`;
  }
}

async function loadWardOptions() {
  const province = $('province').value.trim();
  if (!province) { fillDatalist('ward-list', []); return; }
  const res = await send('AREA_OPTIONS', { province });
  if (!res || res.ok === false) return;
  fillDatalist('ward-list', res.wards);
  if ($('ward-hint')) {
    $('ward-hint').textContent = res.wards.length
      ? `${res.wards.length} địa danh của ${province} (gồm cả tên trước sáp nhập).`
      : `Không thấy xã/phường nào cho "${province}".`;
  }
}

$('province').addEventListener('change', loadWardOptions);
$('province').addEventListener('blur', loadWardOptions);
loadProvinceOptions();


const FIELDS = ['investor', 'province', 'ward', 'keyword', 'minPrice', 'maxPrice'];
const LAST_KEY = 'gscb_last_search';

/* Nhớ tiêu chí lần trước — người dùng thường tra đi tra lại quanh một địa bàn. */
function saveCriteria() {
  const c = {};
  FIELDS.forEach((f) => { c[f] = $(f).value.trim(); });
  try { localStorage.setItem(LAST_KEY, JSON.stringify(c)); } catch {}
}
function loadCriteria() {
  try {
    const c = JSON.parse(localStorage.getItem(LAST_KEY) || '{}');
    FIELDS.forEach((f) => { if (c[f]) $(f).value = c[f]; });
  } catch {}
}

/* ------------------------------------------------------------------ */

async function start() {
  const payload = {};
  FIELDS.forEach((f) => { payload[f] = $(f).value.trim(); });
  payload.minPrice = Number(String(payload.minPrice).replace(/[^0-9]/g, '')) || 0;
  payload.maxPrice = Number(String(payload.maxPrice).replace(/[^0-9]/g, '')) || 0;
  saveCriteria();

  alertBox('', null);
  show($('summary'), false);
  show($('list-title'), false);
  show($('only-wrap'), false);
  show($('result-tools'), false);
  show($('list-count'), false);
  $('list').innerHTML = '';
  show($('progress'), true);
  $('progress-text').textContent = 'Đang mở e-GP và đặt tiêu chí…';

  const r = await send('TBMT_SEARCH', payload);
  if (!r || r.ok === false) {
    show($('progress'), false);
    // Bị chặn vì còn lượt đang chạy: cho nút thoát ngay tại chỗ, đừng bắt
    // người dùng tự mò cách gỡ.
    const stuck = r && r.run
      ? `<div class="small" style="margin-top:8px">
           Lượt đang chạy bắt đầu lúc <b>${esc(new Date(r.run.startedAt).toLocaleString('vi-VN'))}</b>
           — ${esc(r.run.message || '')}
         </div>
         <button id="forceStop" class="btn warn" style="width:auto;margin-top:10px">⏹ Dừng lượt đang chạy</button>`
      : '';
    alertBox(
      esc((r && r.message) || 'Không bắt đầu được lượt tra cứu.')
      + stuck,
      'error');
    const fs = document.getElementById('forceStop');
    if (fs) {
      fs.addEventListener('click', async () => {
        fs.disabled = true;
        fs.textContent = '⏳ Đang dừng…';
        await send('CANCEL_ACTIVE_RUN');
        alertBox('Đã dừng lượt cũ. Bấm <b>Tra cứu trên e-GP</b> lần nữa.', 'ok');
      });
    }
    return;
  }
  startPolling();
}

function startPolling() { if (POLL) clearInterval(POLL); POLL = setInterval(refresh, 1200); refresh(); }
function stopPolling() { if (POLL) clearInterval(POLL); POLL = null; }

async function refresh() {
  const s = await send('GET_STATE');
  if (!s || !s.ok) return;
  STATE = s;
  const run = s.activeRun || (s.runs || [])[0];
  const running = Boolean(s.activeRun);

  show($('progress'), running);
  if (running) {
    $('progress-text').textContent = (s.activeRun.message || 'Đang tra cứu…');
  } else {
    stopPolling();
    $('stop').disabled = false;
    $('stop').textContent = '⏹ Dừng';
    if (run && run.status === 'ERROR') {
      alertBox(`<b>Không tra cứu được.</b> ${esc(run.message || '')}`, 'error');
    } else {
      const notes = [];
      if (run && run.status === 'PARTIAL') {
        notes.push(`<b>Dữ liệu chưa đầy đủ.</b> ${esc(run.message || 'Lượt tra cứu bị giới hạn hoặc gián đoạn.')} Không dùng số liệu này như tổng số toàn bộ thị trường.`);
      }
      if (run && (run.missed || []).length) {
        notes.push(`<b>Không đặt được tiêu chí:</b> ${esc(run.missed.join(', '))}.
          Kết quả dưới đây <b>chưa lọc theo tiêu chí đó</b> — kiểm tra lại cách viết tên cho đúng với e-GP.`);
      }
      // Gõ "Đức Trọng" mà e-GP ghi "Xã Đức Trọng" thì vẫn chọn được, nhưng
      // phải nói rõ đã chọn cái gì để bạn biết mình đang lọc theo đúng địa bàn.
      if (run && (run.swapped || []).length) {
        notes.push(`<b>e-GP dùng tên chuẩn:</b> ${esc(run.swapped.join(' · '))}.`);
      }
      alertBox(notes.join('<br><br>'), (run && (run.status === 'PARTIAL' || (run.missed || []).length)) ? 'error' : null);
    }
  }
  render();
}

/* ------------------------------------------------------------------ */

const STATUS_ORDER = ['OPEN', 'PLAN', 'UNKNOWN', 'CLOSED'];

function scoreClass(n) { return n >= 85 ? 's-hi' : n >= 55 ? 's-mid' : 's-lo'; }

function deadlineText(t) {
  const st = statusOf(t);
  const d = daysToClose(t.closeDate);
  if (st === 'PLAN') return 'Chờ phát hành TBMT';
  if (st === 'UNKNOWN') return 'Chưa rõ hạn nộp';
  if (st === 'CLOSED') return t.closeDate ? `Đã đóng ${formatDate(t.closeDate)}` : 'Đã đóng thầu';
  if (d === 0) return 'Đóng thầu hôm nay';
  if (d === 1) return 'Còn 1 ngày';
  return `Còn ${d} ngày`;
}

function card(t) {
  const st = statusOf(t);
  const score = Number(t.score || 0);
  const action = actionFor(t);
  const code = t.displayCode || t.notifyNo || t.bidNo || '';
  const label = t.codeLabel || 'Mã TBMT';
  const reasons = (t.reasons || []).slice(0, 4)
    .map((r) => `<span class="tag good">${esc(r)}</span>`);
  const missing = missingFields(t).map((r) => `<span class="tag warn">${esc(r)}</span>`);
  const scoreTag = t.matched
    ? '<span class="tag good">Đạt ngưỡng</span>'
    : '<span class="tag">Chưa đạt ngưỡng</span>';
  const cls = [
    'result-card',
    st === 'CLOSED' ? 'closed' : '',
    st === 'PLAN' ? 'watch' : '',
    score >= 85 && st !== 'CLOSED' ? 'priority' : ''
  ].filter(Boolean).join(' ');
  return `
    <article class="${cls}">
      <div class="result-main">
        <div class="scorebox ${scoreClass(score)}">${score}<small>/100</small></div>
        <div class="result-body">
          <h3><a class="link" href="${esc(t.detailUrl || '#')}" target="_blank" rel="noopener">${esc(t.bidName || code)} ↗</a></h3>
          <div class="muted small"><span class="code">${esc(label)}: ${esc(code)}</span> · ${esc(BID_STATUS_LABEL[st] || st)}
            ${t.recommendation ? ` · <b>${esc(t.recommendation)}</b>` : ''}</div>
          <div class="result-meta small">
            <div>💰 <b>${esc(formatMoney(t.price))}</b></div>
            <div>${deadlineIcon(t)} ${esc(deadlineText(t))}</div>
            <div>📍 ${esc(t.location || 'Chưa xác định địa điểm')}</div>
            <div>🏛 ${esc(t.investorName || t.procuringEntityName || 'Chưa xác định chủ đầu tư')}</div>
          </div>
          <div class="reasons">${[scoreTag, ...reasons, ...missing].join('') || '<span class="tag warn">Chưa đủ dữ liệu giải thích điểm</span>'}</div>
        </div>
        <div class="result-action">
          <span class="action-pill ${esc(action.className)}">${esc(action.label)}</span>
          <div class="muted small">${esc(action.note)}</div>
          <div class="result-actions">
            <a class="btn" target="_blank" rel="noopener" href="${esc(t.detailUrl || '#')}">Mở e-GP</a>
            ${t.notifyNo ? `<button class="btn light" data-dl data-no="${esc(t.notifyNo)}" data-url="${esc(t.detailUrl || '')}"
              title="Tải hồ sơ mời thầu (E-HSMT) qua phần mềm hỗ trợ e-GP">Tải E-HSMT</button>` : ''}
          </div>
        </div>
      </div>
    </article>`;
}

function viewOptions() {
  return {
    text: fold($('result-q').value),
    status: $('statusFilter').value,
    minScore: Number($('minScoreFilter').value || 0),
    sortBy: $('sortBy').value || 'decision',
    onlyMatched: $('only').checked
  };
}

function renderInsights(all) {
  /* Ba con so nay do lib/decision.js tinh — co kiem thu, khong tinh tai cho. */
  const sig = decisionSignals(all);
  const best = sig.best;
  $('result-insights').innerHTML = [
    `<div class="insight ${best && Number(best.score || 0) >= 85 ? '' : 'warn'}">
       <b>Ưu tiên số 1</b>
       <div class="small">${best ? `${esc(best.bidName || best.displayCode || 'Gói thầu')} · ${Number(best.score || 0)}/100 · ${esc(deadlineText(best))}` : 'Chưa có gói còn cơ hội xử lý.'}</div>
     </div>`,
    `<div class="insight ${sig.urgent ? 'danger' : ''}">
       <b>${sig.urgent} gói sát hạn điểm cao</b>
       <div class="small">${sig.urgent ? 'Nên tải HSMT và phân công đọc trước.' : 'Không có gói điểm cao đóng trong 3 ngày tới.'}</div>
     </div>`,
    `<div class="insight ${sig.missing ? 'warn' : ''}">
       <b>${sig.missing} gói còn xử lý được nhưng thiếu dữ liệu</b>
       <div class="small">${sig.plan ? `${sig.plan} gói mới ở KHLCNT. ` : ''}${sig.missing ? 'Mở e-GP để kiểm tra giá, hạn nộp hoặc chủ đầu tư.' : 'Dữ liệu chính đã đủ để sàng lọc.'}</div>
     </div>`
  ].join('');
}

function render() {
  if (!STATE) return;
  const run = STATE.activeRun || (STATE.runs || [])[0];

  // CHỈ hiện gói của lượt tra vừa rồi. Kho gói thầu tích luỹ qua nhiều lượt,
  // nếu hiện tất cả thì trông như tra sai tiêu chí (đúng lỗi đã gặp).
  const keys = run && Array.isArray(run.foundKeys) ? new Set(run.foundKeys) : null;
  const store = STATE.tenders || [];
  const all = keys ? store.filter((t) => keys.has(t.key)) : [];

  if (!all.length) {
    if (run && run.status === 'SUCCESS' && keys && !keys.size) {
      alertBox('e-GP không trả gói nào khớp tiêu chí bạn nhập. Thử nới rộng điều kiện.', 'error');
      show($('summary'), false);
      show($('list-title'), false);
      show($('only-wrap'), false);
      show($('result-tools'), false);
      show($('list-count'), false);
      $('list').innerHTML = '';
    }
    return;
  }

  const view = viewOptions();
  const list = filterAndSort(all, view);

  const matched = all.filter((t) => t.matched).length;
  const open = all.filter((t) => statusOf(t) === 'OPEN').length;
  const total = all.reduce((s, t) => s + (Number(t.price) || 0), 0);

  show($('summary'), true);
  $('m-total').textContent = all.length;
  $('m-total-sub').textContent = `của lượt tra này · kho có ${store.length} gói`;
  $('m-match').textContent = matched;
  $('m-match-sub').textContent = all.length ? `${Math.round((matched / all.length) * 100)}% số gói` : '';
  $('m-open').textContent = open;
  $('m-val').textContent = formatMoney(total);
  renderInsights(all);

  show($('list-title'), true);
  show($('only-wrap'), true);
  show($('result-tools'), true);
  show($('list-count'), true);
  $('list-count').textContent = `${list.length}/${all.length} gói đang hiển thị`;

  const body = view.sortBy === 'decision'
    ? STATUS_ORDER.map((st) => {
      const rows = list.filter((x) => statusOf(x) === st);
      if (!rows.length) return '';
      return `<div class="grp g-${st.toLowerCase()}">${esc(BID_STATUS_LABEL[st] || st)} · ${rows.length} gói</div>`
        + rows.map(card).join('');
    }).join('')
    : list.map(card).join('');

  $('list').innerHTML = body || '<div class="notice" style="margin-top:12px">Không có gói nào khớp bộ lọc đang chọn. Nới điểm, trạng thái hoặc ô lọc nhanh để xem thêm.</div>';
}

/* ------------------------------------------------------------------ */

$('go').addEventListener('click', start);
$('only').addEventListener('change', render);
['result-q', 'statusFilter', 'minScoreFilter', 'sortBy'].forEach((id) => {
  $(id).addEventListener(id === 'result-q' ? 'input' : 'change', render);
});
$('stop').addEventListener('click', async () => {
  $('stop').disabled = true;
  $('stop').textContent = '⏳ Đang dừng…';
  await send('CANCEL_ACTIVE_RUN');
  refresh();
});
$('reset').addEventListener('click', () => {
  FIELDS.forEach((f) => { $(f).value = ''; });
  saveCriteria();
  alertBox('', null);
});
$('csv').addEventListener('click', () => send('EXPORT_CSV', { saveAs: true }));

/* Lấy tỉnh và khoảng giá đã đặt trong Cấu hình — đỡ phải gõ lại. */
$('useSettings').addEventListener('click', async () => {
  const s = await send('GET_STATE');
  if (!s || !s.ok) return;
  const st = s.settings || {};
  if ((st.provinces || []).length) {
    const p = st.provinces[0];
    $('province').value = /^(Tỉnh|Thành phố)/i.test(p) ? p : `Tỉnh ${p}`;
  }
  if (st.minPrice) $('minPrice').value = st.minPrice;
  if (st.maxPrice) $('maxPrice').value = st.maxPrice;
  saveCriteria();
  alertBox('Đã lấy tỉnh ưu tiên và khoảng giá từ Cấu hình. Sửa lại nếu cần rồi bấm Tra cứu.', 'ok');
});

document.querySelectorAll('.quick button').forEach((b) => {
  b.addEventListener('click', () => {
    $('minPrice').value = b.dataset.min || '';
    $('maxPrice').value = b.dataset.max || '';
    saveCriteria();
  });
});

FIELDS.forEach((f) => {
  $(f).addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
});

loadCriteria();
refresh();

/* --------------------------------------------------------------------------
 *  TẢI HỒ SƠ QUA PHẦN MỀM HỖ TRỢ e-GP
 *
 *  e-GP KHÔNG phát tệp qua máy chủ web — bấm vào tên tệp trên trang e-GP cũng
 *  là gọi phần mềm hỗ trợ cài trên máy. Nút này làm hộ đúng cú bấm đó, nhưng
 *  tự mở trang gói ở tab nền, lấy hết tệp rồi tải một lượt.
 * ------------------------------------------------------------------------ */
async function downloadDocs(btn, notifyNo, detailUrl) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Đang lấy…';
  const res = await send('FETCH_AND_DOWNLOAD', { notifyNo, detailUrl });
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
  const b = e.target.closest('[data-dl]');
  if (!b) return;
  downloadDocs(b, b.dataset.no || '', b.dataset.url || '');
});
