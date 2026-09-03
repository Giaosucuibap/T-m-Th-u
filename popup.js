/* Giáo Sư Cùi Bắp — popup.js : bảng điều khiển một-cú-click.
 * Hiển thị kết quả đã chấm điểm, lọc chi tiết ngay tại chỗ, kèm link mở từng gói
 * và theo dõi tiến độ lượt quét theo thời gian thực. */

const $ = (id) => document.getElementById(id);
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });

let STATE = { tenders: [], template: null, activeRun: null, runs: [] };
const filters = { text: '', minScore: 0, matched: false, construction: false, open: false, watch: false };
let pollTimer = null;

// ---------- Tiện ích hiển thị ----------
function esc(x) {
  return String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(v) {
  return v === null || v === undefined || v === '' ? 'Chưa xác định' : `${Math.round(Number(v)).toLocaleString('vi-VN')} đ`;
}
function daysToClose(iso) {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return Math.floor((d - Date.now()) / 86400000);
}

/* Trạng thái mở/đóng thầu — bản sao rút gọn của bidStatus() trong lib/core.js.
 * popup.js là script thường (không phải module) nên không import được.
 * Gói đã quét từ bản cũ có thể chưa có sẵn trường `status`, nên tính lại ở đây. */
const STATUS_ORDER = ['OPEN', 'PLAN', 'UNKNOWN', 'CLOSED'];
const STATUS_TEXT = {
  OPEN: 'Đang mở thầu',
  PLAN: 'Chưa có TBMT · mới trong KHLCNT',
  UNKNOWN: 'Chưa rõ thời điểm đóng thầu',
  CLOSED: 'Đã đóng thầu'
};
const RUN_TEXT = {
  SUCCESS: 'Hoàn tất',
  ERROR: 'Có lỗi',
  TIMEOUT: 'Quá thời gian',
  RUNNING: 'Đang chạy',
  CANCELLED: 'Đã dừng',
  PARTIAL: 'Hoàn tất một phần'
};
function statusOf(t) {
  if (t && t.status && STATUS_TEXT[t.status]) return t.status;
  if (!t || !String(t.notifyNo || '').trim()) return 'PLAN';
  const d = daysToClose(t.closeDate);
  if (d === null) return 'UNKNOWN';
  return d >= 0 ? 'OPEN' : 'CLOSED';
}
// Mã hiển thị: gói chưa có TBMT thì mã là BP…, phải ghi rõ kẻo nhầm với mã TBMT.
function codeOf(t) {
  if (t.displayCode) return { code: t.displayCode, label: t.codeLabel || 'Mã TBMT' };
  if (t.notifyNo) return { code: `${t.notifyNo}${t.version ? `-${t.version}` : ''}`, label: 'Mã TBMT' };
  return { code: t.bidNo || '—', label: 'Mã gói thầu (KHLCNT)' };
}
function fold(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}
function scoreClass(s) { return s >= 85 ? 's-hi' : s >= 55 ? 's-mid' : 's-lo'; }

// ---------- Lấy trạng thái từ service worker ----------
async function refresh() {
  const s = await send('GET_STATE');
  if (!s || !s.ok) return;
  STATE = s;
  const ver = $('ver');
  if (ver && s.manifest) ver.textContent = `· phiên bản ${s.manifest.version}`;
  renderStatus();
  renderTemplates();
  render();
  managePolling();
}

function renderTemplates() {
  const box = $('templates');
  const list = STATE.templates || [];
  const activeId = STATE.template && STATE.template.id;
  const scanAll = $('scanAll');
  scanAll.style.display = list.length > 1 ? 'block' : 'none';
  if (list.length > 1) scanAll.textContent = `🔁 Quét tất cả ${list.length} bộ lọc`;
  if (!list.length) { box.innerHTML = ''; return; }
  box.innerHTML = list.map((t) => `<span class="tpl-item">
    <button class="tpl ${t.id === activeId ? 'active' : ''}" type="button" data-id="${esc(t.id)}"
      aria-pressed="${t.id === activeId}" title="Chọn ${esc(t.name || 'bộ lọc')}">
      <span class="nm">${esc(t.name || 'Bộ lọc')}</span>
    </button>
    <button class="tpl-delete" type="button" data-del="${esc(t.id)}"
      aria-label="Xóa bộ lọc ${esc(t.name || 'Bộ lọc')}">✕</button>
  </span>`).join('');
  box.querySelectorAll('.tpl').forEach((el) => {
    el.addEventListener('click', async () => {
      await send('SET_ACTIVE_TEMPLATE', { id: el.dataset.id });
      refresh();
    });
  });
  box.querySelectorAll('.tpl-delete').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Xóa bộ lọc đã lưu này?')) return;
      await send('DELETE_TEMPLATE', { id: button.dataset.del });
      refresh();
    });
  });
}

function renderStatus() {
  const { activeRun, tenders, template, runs } = STATE;
  const bar = $('bar');
  const scanBtn = $('scan');
  if (activeRun) {
    $('status').innerHTML = `<b>⏳ Đang quét…</b><br><span style="color:var(--muted)">${esc(activeRun.message || activeRun.status)}</span>`;
    bar.classList.add('on');
    scanBtn.disabled = true;
    scanBtn.textContent = '⏳ Đang quét dữ liệu…';
  } else {
    const last = runs && runs[0];
    const tmpl = template ? '✅ Radar đã có bộ lọc' : '⚠️ Chưa lưu bộ lọc — hãy tìm một lần trên e-GP rồi bấm “Lưu bộ lọc”';
    const lastTxt = last ? ` · Lần gần nhất: ${esc(RUN_TEXT[last.status] || last.status)}${last.newCount ? ` (+${last.newCount} mới)` : ''}` : '';
    $('status').innerHTML = `<b>${tenders.length}</b> gói thầu đã lưu<br><span style="color:var(--muted)">${tmpl}${lastTxt}</span>`;
    bar.classList.remove('on');
    scanBtn.disabled = false;
    scanBtn.textContent = '🔍 Quét theo bộ lọc đang chọn';
  }
}

// ---------- Lọc + vẽ danh sách ----------
function applyFilters(list) {
  const q = fold(filters.text.trim());
  return list.filter((t) => {
    if (Number(t.score || 0) < filters.minScore) return false;
    if (filters.matched && !t.matched) return false;
    if (filters.construction && !t.construction) return false;
    if (filters.watch && !t.watchlisted) return false;
    if (filters.open && statusOf(t) !== 'OPEN') return false;
    if (q) {
      const hay = fold([t.bidName, t.notifyNo, t.bidNo, t.location, t.investorName, t.procuringEntityName, t.projectName, t.fieldRaw].join(' '));
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    // Xếp theo trạng thái trước: gói còn nộp được lên đầu, gói đã đóng xuống cuối.
    const d = STATUS_ORDER.indexOf(statusOf(a)) - STATUS_ORDER.indexOf(statusOf(b));
    if (d !== 0) return d;
    return Number(b.score || 0) - Number(a.score || 0);
  });
}

function tenderCard(t) {
  const st = statusOf(t);
  const d = daysToClose(t.closeDate);
  const closeTxt = st === 'OPEN'
    ? (d === 0 ? '🔥 đóng thầu hôm nay' : `⏳ còn ${d} ngày`)
    : st === 'CLOSED' ? '⛔ đã đóng thầu'
    : st === 'PLAN' ? '📋 chưa mời thầu'
    : '❔ chưa rõ hạn nộp';
  const loc = t.location || 'Chưa xác định địa điểm';
  const link = t.detailUrl || t.sourcePageUrl || 'https://muasamcong.mpi.gov.vn/';
  const { code, label } = codeOf(t);
  return `
  <div class="tender" data-key="${esc(t.key)}">
    <div class="top">
      <div class="score ${scoreClass(t.score)}">${Number(t.score || 0)}<small>/100</small></div>
      <div class="grow">
        <h3>${esc(t.bidName || code)}</h3>
        <div class="meta">
          <span title="${esc(label)}">🆔 ${esc(label)}: <b>${esc(code)}</b></span>
          <span>📍 ${esc(loc)}</span>
          <span>${closeTxt}</span>
        </div>
      </div>
      <button class="star ${t.watchlisted ? 'on' : ''}" type="button" title="Theo dõi"
        aria-pressed="${Boolean(t.watchlisted)}" aria-label="${t.watchlisted ? 'Bỏ theo dõi' : 'Theo dõi'} ${esc(t.bidName || code)}">${t.watchlisted ? '★' : '☆'}</button>
    </div>
    <div class="line">
      <span>💰 <b>${money(t.price)}</b></span>
      ${t.investorName ? `<span>🏛 ${esc(t.investorName)}</span>` : ''}
    </div>
    <div class="actions">
      <span class="rec">${esc(t.recommendation || 'THAM KHẢO')}</span>
      <a class="open" href="${esc(link)}" target="_blank" rel="noopener">↗ Mở gói thầu trên e-GP</a>
    </div>
  </div>`;
}

function render() {
  const list = applyFilters(STATE.tenders || []);
  const total = (STATE.tenders || []).length;
  $('count').textContent = total
    ? `Hiển thị ${list.length}/${total} gói` + (list.length !== total ? ' (đang lọc)' : '')
    : '';
  const box = $('list');
  if (!total) {
    box.innerHTML = `<div class="empty">Chưa có dữ liệu. Bấm <b>Quét theo bộ lọc</b> để lấy gói thầu từ e-GP.${STATE.template ? '' : '<br>Trước tiên hãy tìm một lần trên e-GP rồi bấm <b>Lưu bộ lọc</b>.'}</div>`;
    return;
  }
  if (!list.length) {
    box.innerHTML = `<div class="empty">Không có gói nào khớp bộ lọc hiện tại.</div>`;
    return;
  }
  // Chèn tiêu đề mỗi khi chuyển nhóm trạng thái, để thấy rõ ranh giới
  // giữa gói còn nộp được và gói đã đóng.
  let current = null;
  box.innerHTML = list.map((t) => {
    const st = statusOf(t);
    let head = '';
    if (st !== current) {
      current = st;
      const n = list.filter((x) => statusOf(x) === st).length;
      head = `<div class="group g-${st.toLowerCase()}">${esc(STATUS_TEXT[st])} · ${n} gói</div>`;
    }
    return head + tenderCard(t);
  }).join('');
  box.querySelectorAll('.star').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const key = btn.closest('.tender').dataset.key;
      const t = STATE.tenders.find((x) => x.key === key);
      if (!t) return;
      const value = !t.watchlisted;
      t.watchlisted = value;
      btn.classList.toggle('on', value);
      btn.textContent = value ? '★' : '☆';
      btn.setAttribute('aria-pressed', String(value));
      btn.setAttribute('aria-label', `${value ? 'Bỏ theo dõi' : 'Theo dõi'} ${t.bidName || codeOf(t).code}`);
      await send('SET_WATCH', { key, value });
    });
  });
}

// ---------- Tự làm mới khi đang quét ----------
function managePolling() {
  if (STATE.activeRun && !pollTimer) {
    pollTimer = setInterval(refresh, 1400);
  } else if (!STATE.activeRun && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ---------- Sự kiện ----------
function bindFilterChip(chip) {
  chip.addEventListener('click', () => {
    const f = chip.dataset.f;
    filters[f] = !filters[f];
    chip.classList.toggle('active', filters[f]);
    chip.setAttribute('aria-pressed', String(filters[f]));
    render();
  });
}

function init() {
  $('scan').addEventListener('click', async () => {
    const r = await send('START_SCAN', { mode: 'manual' });
    if (r && r.ok === false) alert(r.message || 'Không bắt đầu được lượt quét.');
    refresh();
  });
  $('save').addEventListener('click', async () => {
    const r = await send('SAVE_LAST_TEMPLATE');
    alert(r && r.ok ? '✅ Đã lưu bộ lọc vừa dùng trên e-GP.' : (r?.message || 'Chưa quan sát được yêu cầu tìm kiếm.'));
    refresh();
  });
  $('scanAll').addEventListener('click', async () => {
    const r = await send('SCAN_ALL');
    if (r && r.ok === false) alert(r.message || 'Không bắt đầu được lượt quét.');
    refresh();
  });
  $('open').addEventListener('click', () => send('OPEN_EGP'));
  $('egp2').addEventListener('click', refresh);
  $('dashboard').addEventListener('click', () => send('OPEN_DASHBOARD'));
  $('winners').addEventListener('click', () => send('OPEN_WINNERS'));
  $('bidopen').addEventListener('click', () => send('OPEN_BID_OPEN'));
  $('plans').addEventListener('click', () => send('OPEN_PLANS'));
  $('market').addEventListener('click', () => send('OPEN_AREA'));
  $('profile').addEventListener('click', () => send('OPEN_PROFILE'));
  $('investor').addEventListener('click', () => send('OPEN_INVESTOR'));
  $('analytics').addEventListener('click', () => send('OPEN_ANALYTICS'));
  $('iphone').addEventListener('click', () => send('OPEN_IPHONE'));
  $('scanTop').addEventListener('click', () => send('OPEN_SEARCH'));
  $('contractors').addEventListener('click', () => send('OPEN_CONTRACTORS'));
  $('settings').addEventListener('click', () => send('OPEN_OPTIONS'));
  $('csv').addEventListener('click', () => send('EXPORT_CSV', { saveAs: true }));
  $('mobile').addEventListener('click', () => send('EXPORT_MOBILE', { saveAs: true }));

  $('q').addEventListener('input', (e) => { filters.text = e.target.value; render(); });
  $('minScore').addEventListener('change', (e) => { filters.minScore = Number(e.target.value); render(); });
  document.querySelectorAll('.chip[data-f]').forEach(bindFilterChip);

  refresh();
}

document.addEventListener('DOMContentLoaded', init);
