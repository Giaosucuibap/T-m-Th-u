/* ============================================================================
 *  investor.js — giao diện "Hồ sơ chủ đầu tư"
 *
 *  Hai bước: DÒ (gõ vài chữ → chọn đúng đơn vị theo MÃ) rồi HỒ SƠ (thống kê
 *  đầy đủ). Lý do phải tách hai bước — tên đơn vị trùng nhau rất nhiều — nằm ở
 *  đầu tệp lib/investor.js.
 *
 *  Mọi phép tính ở lib/investor.js; tệp này chỉ vẽ.
 * ========================================================================== */

const $ = (id) => document.getElementById(id);
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });

let POLL = null;
let SCAN = null;
let TAB = 'contractors';

function esc(x) {
  return String(x ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function show(el, on) { el.classList.toggle('hidden', !on); }
function money(v) {
  return Number.isFinite(Number(v)) && Number(v) > 0
    ? Number(v).toLocaleString('vi-VN') + ' đ' : '—';
}
function pct(v) {
  return v === null || v === undefined ? '—' : String(v).replace('.', ',') + '%';
}
function alertBox(html, kind) {
  const box = $('alert');
  box.className = `notice ${kind === 'error' ? 'error' : kind === 'ok' ? 'ok' : ''}`;
  box.innerHTML = html;
  show(box, Boolean(html));
}

async function loadProvinces() {
  const res = await send('AREA_OPTIONS', {});
  if (!res || res.ok === false) return;
  $('province-list').innerHTML = (res.provinces || [])
    .map((n) => `<option value="${esc(n)}">`).join('');
}

/* --------------------------------------------------------------------------
 *  CHẠY
 * ------------------------------------------------------------------------ */

async function discover() {
  alertBox('', null);
  show($('picker'), false);
  show($('result'), false);
  show($('progress'), true);
  $('progress-text').textContent = 'Đang dò các chủ đầu tư khớp từ khoá…';

  const res = await send('INVESTOR_SCAN', {
    keyword: $('keyword').value.trim(),
    province: $('province').value.trim()
  });
  if (!res || res.ok === false) {
    show($('progress'), false);
    alertBox(esc((res && res.message) || 'Không bắt đầu được lượt dò.'), 'error');
    return;
  }
  startPolling();
}

async function openProfile(code, name) {
  alertBox('', null);
  show($('picker'), false);
  show($('result'), false);
  show($('progress'), true);
  $('progress-text').textContent = `Đang lấy toàn bộ gói thầu của ${name}…`;

  const res = await send('INVESTOR_SCAN', { codes: [code], name });
  if (!res || res.ok === false) {
    show($('progress'), false);
    alertBox(esc((res && res.message) || 'Không mở được hồ sơ.'), 'error');
    return;
  }
  startPolling();
}

function startPolling() {
  clearInterval(POLL);
  POLL = setInterval(refresh, 900);
}

async function refresh() {
  const state = await chrome.storage.local.get({ investorScan: null });
  const scan = state.investorScan;
  if (!scan) { show($('progress'), false); return; }
  SCAN = scan;

  if (scan.status === 'RUNNING') {
    show($('progress'), true);
    $('progress-text').textContent = scan.message || 'Đang tra cứu…';
    if (!POLL) startPolling();
    return;
  }

  clearInterval(POLL);
  POLL = null;
  show($('progress'), false);

  if (scan.status === 'ERROR') { alertBox(esc(scan.message), 'error'); return; }

  if (scan.mode === 'discover') {
    if (!scan.candidates || !scan.candidates.length) { alertBox(esc(scan.message), null); return; }
    alertBox('', null);
    renderPicker(scan);
    return;
  }
  if (!scan.summary) { alertBox(esc(scan.message), null); return; }
  alertBox('', null);
  renderProfile(scan);
}

/* --------------------------------------------------------------------------
 *  BƯỚC 1 — chọn đúng đơn vị
 * ------------------------------------------------------------------------ */

function renderPicker(scan) {
  show($('picker'), true);
  $('pick-note').textContent = scan.message || '';
  $('pick-list').innerHTML = scan.candidates.map((c) => `
    <div class="pick" data-code="${esc(c.code)}" data-name="${esc(c.name)}" style="cursor:pointer">
      <div>
        <b>${esc(c.name)}</b>
        <div class="muted small" style="margin-top:2px">
          Mã <span class="code">${esc(c.code || '—')}</span>
          ${c.provinces.length ? ` · ${esc(c.provinces.slice(0, 3).join(', '))}` : ''}
        </div>
        ${c.names.length > 1
          ? `<div class="muted small" style="margin-top:3px">Tên khác từng dùng:
             ${esc(c.names.slice(1).join(' · '))}</div>`
          : ''}
      </div>
      <div style="text-align:right;white-space:nowrap">
        <div class="num" style="font-weight:850">${c.packages} gói</div>
        <div class="muted small">trong mẫu đã dò</div>
      </div>
    </div>`).join('');
}

/* --------------------------------------------------------------------------
 *  BƯỚC 2 — hồ sơ đầy đủ
 * ------------------------------------------------------------------------ */

function renderProfile(scan) {
  const s = scan.summary;
  show($('result'), true);

  $('p-name').textContent = scan.criteria.name || '(không rõ tên)';
  $('p-code').textContent = (scan.criteria.codes || []).join(', ') || '—';
  $('p-years').textContent = s.years.length
    ? `Hoạt động ${s.years[0]} – ${s.years[s.years.length - 1]}` : '';

  $('m-pkg').textContent = s.packageCount;
  $('m-pkg-sub').textContent = `Giá trị ${money(s.soloValue + s.ventureValue)}`;
  $('m-con').textContent = s.contractorCount;
  $('m-con-sub').textContent = s.topContractor
    ? `Nhiều nhất: ${s.topContractor.name || s.topContractor.taxCode} (${s.topShare.text})`
    : '—';
  $('m-join').textContent = s.joinTotal;
  $('m-join-sub').innerHTML = `TB ${s.joinAverage ?? '—'} nhà thầu/gói ·
    <b>${s.joinZeroCount}</b> gói e-GP ghi 0`;

  const c = s.concentration;
  $('m-hhi').textContent = c.value === null ? '—' : c.level;
  $('m-hhi-sub').textContent = c.value === null
    ? 'chưa đủ dữ liệu' : `HHI ${c.value.toLocaleString('vi-VN')} trên ${c.n} nhà thầu`;

  $('note-complete').textContent = scan.completeNote || '';
  $('note-join').textContent = scan.joinNote || '';
  $('note-partial').textContent = scan.partialNote || '';
  $('note-disclaimer').textContent = scan.disclaimer || '';

  drawPanel();
}

function drawPanel() {
  const s = SCAN && SCAN.summary;
  if (!s) return;
  if (TAB === 'contractors') return drawContractors(s);
  if (TAB === 'years') return drawTally(s.byYear, 'Năm');
  if (TAB === 'forms') return drawTally(s.byForm, 'Hình thức lựa chọn nhà thầu');
  return drawPackages(s);
}

/** Cỡ mẫu nhỏ thì làm mờ — 100% từ 2 gói không được trông như 100% từ 40 gói. */
const weak = (reliable) => (reliable ? '' : ' class="weak" title="Cỡ mẫu nhỏ, chưa đủ tin"');

function drawContractors(s) {
  $('panel').innerHTML = `
    <div class="muted small" style="margin-bottom:10px">
      Đây là các nhà thầu <b>đã TRÚNG</b> của chủ đầu tư này — đầy đủ, đếm theo mã số thuế.
      Cột "Tỷ trọng" là phần trăm số gói của chủ đầu tư rơi vào nhà thầu đó.
    </div>
    <table>
      <thead><tr>
        <th>Nhà thầu</th><th class="num">Số gói</th><th class="num">Tỷ trọng</th>
        <th class="num">Độc lập / Liên danh</th><th class="num">Giá trị trúng</th>
        <th class="num">Giảm giá</th><th>Năm</th>
      </tr></thead>
      <tbody>${s.contractors.map((c) => `
        <tr>
          <td>${esc(c.name || '(e-GP không ghi tên)')}
            <span class="sub code">${esc(c.taxCode)}</span></td>
          <td class="num"><b>${c.packages}</b></td>
          <td class="num"${weak(c.share.reliable)}>${esc(c.share.text)}</td>
          <td class="num">${c.soloCount} / ${c.ventureCount}</td>
          <td class="num">${money(c.soloValue)}
            ${c.ventureValue > 0 ? `<span class="sub">+ ${money(c.ventureValue)} liên danh</span>` : ''}</td>
          <td class="num"${weak(c.discount.reliable)}>${pct(c.discount.median)}
            <span class="sub">n=${c.discount.n}</span></td>
          <td>${esc((c.years || []).join(', '))}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="muted small" style="margin-top:10px">
      Giá trị gói <b>liên danh</b> để riêng, không cộng vào giá trị trúng độc lập:
      e-GP không công bố tỷ lệ góp vốn nên không thể quy giá trị cả gói cho một thành viên.
    </div>`;
}

function drawTally(rows, title) {
  if (!rows.length) { $('panel').innerHTML = '<div class="muted">Chưa có dữ liệu.</div>'; return; }
  const max = Math.max(...rows.map((r) => r.packages));
  $('panel').innerHTML = `
    <table>
      <thead><tr><th>${esc(title)}</th><th class="num">Số gói</th><th></th>
        <th class="num">Giá trị trúng</th><th class="num">Giảm giá trung vị</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td><b>${esc(r.key)}</b></td>
          <td class="num">${r.packages}</td>
          <td style="width:34%">
            <div style="height:9px;border-radius:999px;background:#e2e8f0">
              <i style="display:block;height:100%;border-radius:999px;background:var(--accent);
                        width:${Math.round((r.packages / max) * 100)}%"></i>
            </div>
          </td>
          <td class="num">${money(r.value)}</td>
          <td class="num"${weak(r.discount.reliable)}>${pct(r.discount.median)}
            <span class="sub">n=${r.discount.n}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function drawPackages(s) {
  $('panel').innerHTML = `
    <table>
      <thead><tr>
        <th>Mã TBMT</th><th>Gói thầu</th><th>Nhà thầu trúng</th>
        <th class="num">Số dự</th><th class="num">Giá gói thầu</th>
        <th class="num">Giá trúng</th><th class="num">Giảm</th><th>Duyệt</th>
      </tr></thead>
      <tbody>${s.packages.map((p) => `
        <tr>
          <td class="num"><a class="link" href="${esc(p.detailUrl)}" target="_blank" rel="noopener"
            >${esc(p.notifyNoStand)} ↗</a>
            ${p.isVenture ? '<span class="sub"><span class="tag tag-v">Liên danh</span></span>' : ''}</td>
          <td>${esc(p.bidName)}
            <span class="sub">${esc([p.fieldLabel, p.bidFormLabel, p.location].filter(Boolean).join(' · '))}</span></td>
          <td>${esc(p.winnerName || '')}</td>
          <td class="num">${Number.isFinite(Number(p.numBidderJoin)) ? p.numBidderJoin : '—'}</td>
          <td class="num">${money(p.priceBasis)}</td>
          <td class="num">${money(p.winningPrice)}</td>
          <td class="num">${pct(p.discountRate)}</td>
          <td>${esc(String(p.decisionDate || '').slice(0, 10))}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

/* --------------------------------------------------------------------------
 *  SỰ KIỆN
 * ------------------------------------------------------------------------ */

$('go').addEventListener('click', discover);
$('keyword').addEventListener('keydown', (e) => { if (e.key === 'Enter') discover(); });
$('pick-list').addEventListener('click', (e) => {
  const el = e.target.closest('[data-code]');
  if (!el) return;
  openProfile(el.dataset.code, el.dataset.name);
});
$('back').addEventListener('click', () => {
  show($('result'), false);
  discover();
});
$('stop').addEventListener('click', async () => {
  $('stop').disabled = true;
  $('stop').textContent = '⏳ Đang dừng…';
  clearInterval(POLL);
  POLL = null;
  await send('CANCEL_INVESTOR_SCAN');
  await refresh();
  $('stop').disabled = false;
  $('stop').textContent = '⏹ Dừng';
});
$('xlsx').addEventListener('click', async () => {
  const res = await send('EXPORT_INVESTOR_XLSX', {});
  if (res && res.ok === false) alertBox(esc(res.message || 'Không xuất được tệp.'), 'error');
});
for (const b of document.querySelectorAll('.tabs button')) {
  b.addEventListener('click', () => {
    TAB = b.dataset.tab;
    for (const x of document.querySelectorAll('.tabs button')) x.classList.toggle('on', x === b);
    drawPanel();
  });
}

/* Dọn lượt còn kẹt "đang chạy" từ phiên trước rồi mới vẽ trạng thái. */
(async () => {
  loadProvinces();
  await send('RECONCILE_LOOKUPS');
  await refresh();
})();
