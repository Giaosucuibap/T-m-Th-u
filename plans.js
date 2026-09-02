/* Giáo Sư Cùi Bắp — plans.js
 * Tra cứu KẾ HOẠCH LỰA CHỌN NHÀ THẦU theo chủ đầu tư / tỉnh / xã · phường.
 *
 * Tiện ích TỰ DỰNG truy vấn (xem lib/khlcnt.js). Cả bốn tiêu chí — chủ đầu tư,
 * từ khoá, tỉnh và xã/phường — đều được e-GP lọc ở phía máy chủ, nên chỉ chọn
 * tỉnh cũng tra được và kết quả về rất nhanh.
 */

import { formatMoney, formatDate } from './lib/core.js';

const $ = (id) => document.getElementById(id);
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });

let POLL = null;
let LOOKUP = null;

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
  const province = $('province').value.trim();
  if (!province) {
    fillDatalist('ward-list', []);
    $('ward-hint').textContent = 'Chọn tỉnh trước để hiện danh sách xã/phường.';
    return;
  }
  $('ward-hint').textContent = 'Đang lấy danh sách xã/phường…';
  const res = await send('AREA_OPTIONS', { province });
  if (!res || res.ok === false) {
    $('ward-hint').textContent = (res && res.message) || 'Chưa lấy được danh sách xã/phường.';
    return;
  }
  fillDatalist('ward-list', res.wards);
  $('ward-hint').textContent = res.wards.length
    ? `${res.wards.length} xã/phường của ${province} (gồm cả tên huyện/xã trước sáp nhập).`
    : `Không thấy xã/phường nào cho "${province}". Kiểm tra lại tên tỉnh.`;
}

$('province').addEventListener('change', loadWardOptions);
$('province').addEventListener('blur', loadWardOptions);
loadProvinceOptions();

/* ------------------------------------------------------------------ */

async function start() {
  const payload = {
    investor: $('investor').value.trim(),
    province: $('province').value.trim(),
    ward: $('ward').value.trim(),
    keyword: $('keyword').value.trim()
  };
  alertBox('', null);
  show($('summary'), false);
  $('list').innerHTML = '';
  show($('only-wrap'), false);
  show($('progress'), true);
  $('progress-text').textContent = 'Đang hỏi e-GP các kế hoạch của chủ đầu tư này…';

  const res = await send('PLAN_LOOKUP', payload);
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
  const state = await send('GET_PLAN_STATE');
  if (!state || !state.ok) return;
  LOOKUP = state.lookup;
  if (!LOOKUP) { show($('progress'), false); return; }
  // Mo lai trang thi dien lai tieu chi da tra — neu khong nguoi dung thay o trong
  // ma ket qua van hien, rat de hieu nham la da tra voi tieu chi rong.
  const c = LOOKUP.criteria || {};
  ['investor', 'province', 'ward', 'keyword'].forEach((k) => { if (c[k] && !$(k).value) $(k).value = c[k]; });

  const running = LOOKUP.status === 'RUNNING';
  show($('progress'), running);
  if (running) {
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
}

/* ------------------------------------------------------------------ */

function planCard(p) {
  const pkgs = p.packages || [];
  const table = pkgs.length
    ? `<table>
        <thead><tr><th style="width:44px">STT</th><th>Gói thầu trong kế hoạch</th><th style="width:170px">Giá gói thầu</th></tr></thead>
        <tbody>${pkgs.map((g, i) => `
          <tr><td class="num">${i + 1}</td><td>${esc(g.name)}</td>
          <td class="num">${esc(formatMoney(g.price))}</td></tr>`).join('')}</tbody>
       </table>`
    : '<div class="muted small" style="padding:10px 13px">Kế hoạch này chưa liệt kê gói thầu trong dữ liệu công khai.</div>';

  return `
    <div class="plan">
      <header>
        <h3><a class="link" href="${esc(p.detailUrl)}" target="_blank" rel="noopener">${esc(p.name)} ↗</a></h3>
        <div class="muted small">
          <span class="code">${esc(p.planNoStand)}</span>
          ${p.hasUnannounced ? ' · <span class="tag tag-new">Còn gói chưa mời thầu</span>' : ''}
          ${p.planTypeLabel ? ` · ${esc(p.planTypeLabel)}` : ''}
          ${p.fields.length ? ` · ${esc(p.fields.join(', '))}` : ''}
        </div>
        <div class="muted small" style="margin-top:3px">
          🏛 ${esc(p.investorName || '—')}${p.investorCode ? ` (${esc(p.investorCode)})` : ''}
        </div>
        <div class="muted small">📍 ${esc(p.location || '—')}</div>
        ${p.projectName ? `<div class="muted small">📁 Dự án: ${esc(p.projectName)}</div>` : ''}
        <div class="muted small" style="margin-top:3px">
          ${p.packageCount} gói · tổng ${esc(formatMoney(p.totalPackagePrice))}
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

  if (LOOKUP.status === 'SUCCESS' && !plans.length) {
    show($('summary'), false);
    alertBox(
      `Không có kế hoạch nào khớp <b>${esc(LOOKUP.label)}</b>.<br>
       <span class="small">Kiểm tra lại tên tỉnh/xã có đúng như e-GP ghi không (có chữ "Tỉnh", "Xã", "Phường"),
       hoặc thử rút ngắn tên chủ đầu tư.</span>`, 'error');
    return;
  }
  if (!plans.length) {
    if (incomplete) {
      alertBox(`<b>Dữ liệu chưa đầy đủ.</b> ${esc(LOOKUP.message || 'e-GP ngừng trả dữ liệu trước khi lấy hết các trang.')}`, 'error');
    }
    return;
  }

  /* Bỏ hẳn cảnh báo "không đặt được tiêu chí". Cảnh báo đó có từ thời tiện ích
     điều khiển biểu mẫu e-GP; nay mọi tiêu chí đều đi thẳng vào truy vấn nên
     `applied` luôn rỗng — giữ lại sẽ báo lỗi giả với MỌI lượt tra cứu. */
  const warnings = [];
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
    $('m-plan-sub').textContent = LOOKUP.totalElements ? `e-GP báo ${LOOKUP.totalElements} kết quả` : '';
    $('m-pkg').textContent = s.packageCount;
    $('m-pkg-sub').textContent = s.planCount ? `trung bình ${(s.packageCount / s.planCount).toFixed(1)} gói/kế hoạch` : '';
    $('m-val').textContent = formatMoney(s.totalValue);
    $('m-invest').textContent = s.investTotal ? `Tổng mức đầu tư ${formatMoney(s.investTotal)}` : '';
    $('m-new').textContent = s.withUnannounced;

    const chips = (items) => (items || []).map((x) => `<span class="pill">${esc(x.name)} (${x.count})</span>`).join('') || '<span class="muted small">—</span>';
    $('by-investor').innerHTML = chips(s.byInvestor);
    $('by-ward').innerHTML = chips(s.byWard);
  }

  show($('only-wrap'), true);
  const list = $('only').checked ? plans.filter((p) => p.hasUnannounced) : plans;
  $('list').innerHTML = list.length
    ? list.map(planCard).join('')
    : '<div class="notice" style="margin-top:12px">Không có kế hoạch nào còn gói chưa đăng thông báo mời thầu.</div>';
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
  ['investor', 'province', 'ward', 'keyword'].forEach((id) => { $(id).value = ''; });
  stopPolling();
  await send('CANCEL_PLAN_LOOKUP');
  await send('CLEAR_PLAN_LOOKUP');
  show($('progress'), false);
  show($('summary'), false);
  show($('only-wrap'), false);
  $('list').innerHTML = '';
  alertBox('', null);
});
$('csv').addEventListener('click', async () => {
  const r = await send('EXPORT_PLANS_CSV');
  if (r && r.ok === false) alertBox(esc(r.message || 'Không xuất được CSV.'), 'error');
});
['investor', 'province', 'ward', 'keyword'].forEach((id) => {
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
});

/* Dọn các lượt còn kẹt "đang chạy" từ phiên trước trước khi vẽ trạng thái.
   Không dọn thì trang hiện thanh tiến trình của một lượt đã chết —
   trông như phần mềm tự động chạy (xem reconcileStaleLookups). */
send('RECONCILE_LOOKUPS').then(() => refresh()).catch(() => refresh());
