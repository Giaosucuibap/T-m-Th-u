/* Giáo Sư Cùi Bắp — bidopen.js
 * Giao diện "Gói đang chờ kết quả": xem nhà thầu nào đang dự thầu và
 * tỷ lệ giảm giá của từng nhà thầu, ở những gói ĐÃ MỞ THẦU nhưng CHƯA có KQLCNT.
 *
 * Vì e-GP không lập chỉ mục nhà thầu tham dự (xem lib/bbmt.js), tính năng chạy
 * theo kiểu quét có trần: lọc trước trên máy chủ, rồi đọc lần lượt từng biên bản.
 */

import { formatMoney, formatDate } from './lib/core.js';
import { formatDiscount } from './lib/kqlcnt.js';
import { FIELD_OPTIONS, findBidder, bbmtReadStateOf } from './lib/bbmt.js';

const $ = (id) => document.getElementById(id);
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });

let POLL = null;
let SCAN = null;

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

$('field').innerHTML = FIELD_OPTIONS.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');

/* Khối "Từ ngày / Đến ngày" chỉ hiện khi người dùng chọn "Tự chọn khoảng ngày".
   Mặc định gợi ý 30 ngày gần đây để không phải gõ từ số không. */
function syncDateRange() {
  const custom = $('days').value === 'custom';
  show($('dateRange'), custom);
  if (custom && !$('fromDate').value && !$('toDate').value) {
    const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const now = new Date();
    $('toDate').value = iso(now);
    $('fromDate').value = iso(new Date(now.getTime() - 30 * 86400000));
  }
}
$('days').addEventListener('change', syncDateRange);
syncDateRange();

/* ------------------------------------------------------------------ */

async function start() {
  const payload = {
    query: $('q').value.trim(),
    taxCode: $('q').value.trim(),
    // 'custom' = người dùng tự chọn khoảng ngày; khi đó bỏ hẳn "N ngày gần đây"
    // để hai cách chọn không chồng nhau (bbmtDateRange ưu tiên khoảng ngày).
    days: $('days').value === 'custom' ? 0 : Number($('days').value),
    fromDate: $('days').value === 'custom' ? $('fromDate').value : '',
    toDate: $('days').value === 'custom' ? $('toDate').value : '',
    field: $('field').value,
    province: $('province') ? $('province').value.trim() : '',
    investor: $('investor') ? $('investor').value.trim() : '',
    keyword: $('keyword').value.trim(),
    minPrice: Number($('minPrice').value) || 0,
    maxPrice: Number($('maxPrice').value) || 0,
    maxPackages: Number($('maxPackages').value)
  };
  alertBox('', null);
  show($('summary'), false);
  $('list').innerHTML = '';
  show($('progress'), true);
  $('progress-text').textContent = 'Đang mở e-GP và lấy danh sách…';

  const res = await send('BID_OPEN_SCAN', payload);
  if (!res || res.ok === false) {
    show($('progress'), false);
    alertBox(esc((res && res.message) || 'Không bắt đầu được lượt quét.'), 'error');
    return;
  }
  startPolling();
}

function startPolling() { if (POLL) clearInterval(POLL); POLL = setInterval(refresh, 1000); refresh(); }
function stopPolling() { if (POLL) clearInterval(POLL); POLL = null; }

async function refresh() {
  const state = await send('GET_BID_OPEN_STATE');
  if (!state || !state.ok) return;
  SCAN = state.scan;
  if (!SCAN) { show($('progress'), false); return; }

  const running = SCAN.status === 'LISTING' || SCAN.status === 'SCANNING';
  show($('progress'), running);
  if (running) {
    $('progress-text').textContent = SCAN.message || 'Đang quét…';
    const total = (SCAN.packages || []).length || 1;
    const pct = SCAN.status === 'LISTING' ? 0 : Math.round((Number(SCAN.scannedCount || 0) / total) * 100);
    $('barfill').style.width = `${Math.max(2, Math.min(100, pct))}%`;
  } else {
    stopPolling();
    $('stop').disabled = false;
    $('stop').textContent = '⏹ Dừng';
  }

  if (SCAN.status === 'ERROR') {
    alertBox(`<b>Không quét được.</b> ${esc(SCAN.message || '')}`, 'error');
    return;
  }
  render();
}

/* ------------------------------------------------------------------ */

function bidderRow(b, isMe) {
  const disc = b.discountPercent
    ? `<span class="disc">${esc(formatDiscount(b.discountPercent))}</span>`
    : '<span class="disc0">không giảm</span>';
  return `
    <tr class="${isMe ? 'me' : ''}">
      <td class="num ${b.priceRank === 1 ? 'rank1' : ''}">${b.priceRank}</td>
      <td>${isMe ? '👉 ' : ''}${esc(b.name)}${b.ventureName ? `<div class="muted small">Liên danh: ${esc(b.ventureName)}</div>` : ''}</td>
      <td class="num">${esc(b.taxCode || '—')}</td>
      <td class="num">${esc(formatMoney(b.bidPrice))}</td>
      <td class="num">${disc}</td>
      <td class="num" style="font-weight:800">${esc(formatMoney(b.finalPrice))}</td>
      <td class="num">${b.vsPackageRate === null || b.vsPackageRate === undefined ? '—' : esc(formatDiscount(b.vsPackageRate))}</td>
    </tr>`;
}

/* Bốn kết cục của một lần đọc biên bản. Trước đây chỉ có hai nhãn, nên gói đã
   đọc xong mà e-GP trả bảng rỗng lại hiện "Chưa đọc" — giống hệt gói còn chưa
   tới lượt, khiến người dùng tưởng kết quả trả về lộn xộn. */
const READ_STATE_NOTE = {
  PENDING: 'Chưa đọc biên bản gói này.',
  EMPTY: 'Đã đọc xong — biên bản chưa ghi nhận nhà thầu nào dự.',
  TIMEOUT: 'Hết hạn chờ e-GP trả dữ liệu. Bấm quét lại để đọc nốt gói này.'
};

function packageCard(p, me) {
  const bidders = p.bidders || [];
  const body = bidders.length
    ? `<table>
        <thead><tr><th>Hạng</th><th>Nhà thầu</th><th>MST</th><th>Giá dự thầu</th>
        <th>Giảm giá</th><th>Sau giảm giá</th><th>So giá gói</th></tr></thead>
        <tbody>${bidders.map((b) => bidderRow(b, me && b === me)).join('')}</tbody>
       </table>`
    : `<div class="empty-note">${READ_STATE_NOTE[bbmtReadStateOf(p)]}</div>`;

  return `
    <div class="pkg">
      <header>
        <h3><a class="link" href="${esc(p.detailUrl)}" target="_blank" rel="noopener">${esc(p.bidName)} ↗</a></h3>
        <div class="muted small">
          <span class="tbmt">${esc(p.notifyNoStand)}</span> ·
          <span class="tag tag-wait">${esc(p.stageLabel)}</span> ·
          Giá gói thầu <b>${esc(formatMoney(p.bidPrice))}</b> ·
          Mở thầu ${esc(formatDate(p.bidRealityOpenDate || p.publicDateKqmt))} ·
          ${bidders.length || p.numBidderJoin} nhà thầu
        </div>
        <div class="muted small">${esc(p.investorName || '')}${p.location ? ` · ${esc(p.location)}` : ''}</div>
      </header>
      ${body}
    </div>`;
}

function render() {
  const packages = SCAN.packages || [];
  const s = SCAN.summary;
  const watching = Boolean(SCAN.focusTaxCode || SCAN.contractorQuery);

  if (SCAN.status === 'SUCCESS' && !packages.length) {
    alertBox('Không có gói nào khớp bộ lọc. Hãy nới rộng số ngày hoặc bỏ bớt điều kiện.', 'error');
    return;
  }
  if (!packages.length) return;

  if (s) {
    show($('summary'), true);
    $('m-scan').textContent = s.scanned;
    // Nói rõ ĐỘ PHỦ. Đọc 148 gói trong 3.000 gói khớp tiêu chí thì xác suất
    // gặp đúng nhà thầu mình tìm là rất thấp — người dùng phải biết điều đó,
    // nếu không họ sẽ kết luận "nhà thầu không dự gói nào".
    const total = Number(SCAN.totalCandidates) || s.candidates || 0;
    const pctRead = total ? Math.round((s.scanned / total) * 100) : 100;
    $('m-scan-sub').innerHTML = total > s.candidates
      ? `trên <b>${total.toLocaleString('vi-VN')}</b> gói khớp tiêu chí — mới đọc <b>${pctRead}%</b>`
        + `${SCAN.failedCount ? ` · ${SCAN.failedCount} gói lỗi` : ''}`
      : `trên ${s.candidates} gói ứng viên${SCAN.failedCount ? ` · ${SCAN.failedCount} gói lỗi` : ''}`;
    $('m-join-label').textContent = watching ? 'Gói nhà thầu đang dự' : 'Tổng lượt dự thầu';
    $('m-join').textContent = watching
      ? s.joinedCount
      : packages.reduce((n, p) => n + ((p.bidders || []).length), 0);
    $('m-join-sub').textContent = watching
      ? (s.joinedCount ? `${s.cheapestCount} gói đang có giá thấp nhất` : 'Không thấy nhà thầu này trong phạm vi đã quét')
      : 'trong phạm vi đã quét';
    $('m-disc').textContent = watching ? (s.avgDiscount === null ? '—' : formatDiscount(s.avgDiscount)) : '—';
    $('m-disc-sub').textContent = watching && s.bestDiscount !== null
      ? `Cao nhất ${formatDiscount(s.bestDiscount)}`
      : (watching ? 'Chưa có dữ liệu' : 'Chỉ tính khi có nhà thầu theo dõi');
    $('m-val').textContent = watching && s.totalBidValue ? formatMoney(s.totalBidValue) : '—';
  }

  show($('list-title'), true);
  show($('only-wrap'), watching);

  // Khớp gần đúng theo tên không vào số liệu — nói rõ thay vì trộn lẫn.
  if (s && s.ambiguity && s.ambiguityNote) {
    alertBox(`<b>Có kết quả chỉ là gợi ý.</b> ${esc(s.ambiguityNote)}`, null);
  }

  const onlyMine = watching && $('only').checked;
  const rows = [];
  for (const p of packages) {
    const me = watching ? findBidder(p.bidders, SCAN.focusTaxCode, SCAN.contractorQuery) : null;
    if (onlyMine && !me) continue;
    rows.push(packageCard(p, me));
  }

  $('list').innerHTML = rows.length
    ? rows.join('')
    : (() => {
        const read = SCAN.summary ? SCAN.summary.scanned : 0;
        const total = Number(SCAN.totalCandidates) || 0;
        const missed = total > read;
        return `<div class="notice" style="margin-top:12px">
          <b>Chưa thấy nhà thầu này trong ${read} biên bản đã đọc.</b>
          ${missed ? `Nhưng có <b>${total.toLocaleString('vi-VN')}</b> gói khớp tiêu chí —
            mới đọc được ${Math.round((read / total) * 100)}%, nên <b>rất có thể đã bỏ sót</b>.` : ''}
          <div style="margin-top:8px">Cách chắc ăn: điền <b>Tỉnh/Thành phố</b> nơi nhà thầu hay dự,
          hoặc điền <b>Chủ đầu tư</b> mà họ hay trúng — cả hai đều được e-GP lọc sẵn nên
          thu hẹp rất mạnh. Xem "Hồ sơ 360°" của nhà thầu để biết họ hay dự ở đâu.</div>
          <div style="margin-top:6px" class="muted small">Bỏ tick ở trên để xem toàn bộ biên bản đã đọc.</div>
        </div>`;
      })();

  if (SCAN.status === 'SUCCESS' && SCAN.cancelled) {
    alertBox(`<b>Đã dừng giữa chừng.</b> ${esc(SCAN.message || '')}`, null);
  }
}

/* ------------------------------------------------------------------ */

$('go').addEventListener('click', start);
$('only').addEventListener('change', render);
$('stop').addEventListener('click', async () => {
  $('stop').disabled = true;
  $('stop').textContent = '⏳ Đang dừng…';
  await send('CANCEL_BID_OPEN_SCAN');
});
$('csv').addEventListener('click', async () => {
  const r = await send('EXPORT_BID_OPEN_CSV');
  if (r && r.ok === false) alertBox(esc(r.message || 'Không xuất được CSV.'), 'error');
});

refresh();

/* Danh sách tỉnh cho ô chọn — lấy từ e-GP rồi ghi nhớ (xem lib/areas.js). */
(async () => {
  const el = $('province-list');
  if (!el) return;
  const res = await send('AREA_OPTIONS', {});
  if (res && res.ok !== false) {
    el.innerHTML = (res.provinces || []).map((n) => `<option value="${esc(n)}">`).join('');
  }
})();

/* Dọn các lượt còn kẹt "đang chạy" từ phiên trước trước khi vẽ trạng thái.
   Không dọn thì trang hiện thanh tiến trình của một lượt đã chết —
   trông như phần mềm tự động chạy (xem reconcileStaleLookups). */
send('RECONCILE_LOOKUPS').then(() => refresh()).catch(() => refresh());
