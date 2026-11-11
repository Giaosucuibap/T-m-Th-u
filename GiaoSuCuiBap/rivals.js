import { initInvestorInput, readInvestorInput } from './investor-input.js';
import { localRivals, marketBidPercentiles } from './lib/rivals.js';
import { escapeHtml } from './lib/html.js';
import { rivalTax } from './lib/rival-watch.js';

const $ = (id) => document.getElementById(id);
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });
initInvestorInput($('investor'));
const esc = escapeHtml;
const money = (n) => (Number(n) > 0 ? `${Number(n).toLocaleString('vi-VN')} đ` : '');
const vnDate = (value) => { const t = Date.parse(value || ''); if (!Number.isFinite(t)) return ''; const d = new Date(t + 7 * 3600_000); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };
const vnDateTime = (value) => { const t = Date.parse(value || ''); if (!Number.isFinite(t)) return ''; const d = new Date(t + 7 * 3600_000); return `${vnDate(value)} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };

/* ---------------------------------------------------------- ĐỐI THỦ ĐANG THEO DÕI (4.22.0) --- */
let watched = new Set();

function say(text, level = '') {
  const box = $('watch-msg');
  box.textContent = text || '';
  box.className = `small ${level === 'ok' ? 'ok-text' : level === 'bad' ? 'danger-text' : 'muted'}`;
}

function eventRow(e) {
  const won = e.kind === 'won';
  const title = e.sourceUrl ? `<a href="${esc(e.sourceUrl)}" target="_blank" rel="noopener">${esc(e.bidName || e.notifyNo)}</a>` : esc(e.bidName || e.notifyNo);
  const bits = [esc(e.notifyNo), e.investorName ? esc(e.investorName) : '', e.price ? `${won ? 'giá trúng' : 'giá dự'} ${money(e.price)}` : '',
    !won && e.bidderCount ? `${e.bidderCount} nhà thầu dự` : '', e.at ? vnDate(e.at) : ''].filter(Boolean);
  return `<article class="watch-event ${won ? 'won' : 'bid'}">
    <div class="watch-event-head"><span class="tag ${won ? 'good' : 'info'}">${won ? (e.isVenture ? 'Trúng · liên danh' : 'Trúng thầu') : 'Dự thầu'}</span><b>${esc(e.name || `MST ${e.taxCode}`)}</b></div>
    <div class="watch-event-title">${title}</div>
    <div class="muted small">${bits.join(' · ')}</div>
  </article>`;
}

function renderWatch(r) {
  const rivals = r.rivals || [];
  watched = new Set(rivals.map((x) => x.taxCode));
  $('watch-count').textContent = String(rivals.length);
  $('watch-auto').checked = r.auto !== false;
  $('watch-list').innerHTML = rivals.map((x) => `<div class="watch-row" data-tax="${esc(x.taxCode)}">
      <div class="watch-row-main"><b>${esc(x.name || 'Chưa rõ tên')}</b> <span class="code">${esc(x.taxCode)}</span>
        <div class="muted small">${x.packages ? `${x.packages} gói trong kho · ${x.wins} trúng${x.bidsOnly ? ` · ${x.bidsOnly} dự (chưa có kết quả hoặc không trúng)` : ''}` : 'Chưa có gói nào trong kho'}${x.checkedAt ? ` · tra e-GP lần cuối ${vnDateTime(x.checkedAt)}` : ' · chưa tra e-GP'}</div></div>
      <div class="watch-row-actions"><button class="btn light sm" type="button" data-check="${esc(x.taxCode)}">Tra e-GP</button><button class="btn light sm" type="button" data-unwatch="${esc(x.taxCode)}" aria-label="Bỏ theo dõi ${esc(x.name || x.taxCode)}">Bỏ theo dõi</button></div>
    </div>`).join('') || '<p class="muted">Chưa theo dõi nhà thầu nào. Nhập mã số thuế ở trên, hoặc bấm “Theo dõi” cạnh một nhà thầu trong bảng thống kê bên dưới.</p>';
  const events = r.events || [];
  $('watch-events').innerHTML = events.map(eventRow).join('') || `<p class="muted">${rivals.length ? 'Chưa có gói mới kể từ khi bắt đầu theo dõi.' : 'Chưa có gì để báo.'}</p>`;
  $('watch-unread').textContent = String(r.unread || 0);
  $('watch-unread').classList.toggle('hidden', !r.unread);
  $('watch-sweep-note').textContent = [r.lastSweepAt ? `Lượt kiểm tra gần nhất: ${vnDateTime(r.lastSweepAt)}.` : '', r.lastSweepNote || '',
    r.telegram ? '' : 'Telegram chưa bật gửi tự động nên tin chỉ hiện trong phần mềm.'].filter(Boolean).join(' ');
  $('watch-sweep').disabled = Boolean(r.sweeping) || !rivals.length;
  if (r.sweeping) $('watch-sweep-note').textContent = 'Đang tra e-GP cho các đối thủ…';
}

async function loadWatch({ markRead = true } = {}) {
  const r = await send('GET_RIVAL_WATCH').catch(() => null);
  if (!r?.ok) { say(r?.message || 'Chưa đọc được danh sách theo dõi.', 'bad'); return false; }
  renderWatch(r);
  // Người dùng đã thấy danh sách: xoá số "chưa xem" cho lần sau (số vừa hiện vẫn giữ trên màn hình).
  if (markRead && r.unread) send('SET_RIVAL_READ').catch(() => {});
  return true;
}

async function addWatch(taxCode, name) {
  if (!rivalTax(taxCode)) { say('Mã số thuế phải có 10 chữ số (ví dụ 5800000111).', 'bad'); $('watch-tax').focus(); return; }
  const r = await send('SAVE_RIVAL_WATCH', { taxCode, name });
  if (!r?.ok) { say(r?.message || 'Chưa lưu được.', 'bad'); return; }
  say(r.added ? 'Đã thêm vào danh sách theo dõi. Các gói đã có trong kho không tính là tin mới.' : 'Đã cập nhật.', 'ok');
  $('watch-tax').value = ''; $('watch-name').value = '';
  renderWatch(r); run();
}

async function sweep(taxCode = '') {
  $('watch-sweep').disabled = true;
  $('watch-sweep-note').textContent = 'Đang tra e-GP cho các đối thủ… Có thể mất vài phút; bạn vẫn dùng được các màn hình khác.';
  const r = await send('RIVAL_SWEEP_NOW', taxCode ? { taxCode } : {}).catch((e) => ({ ok: false, message: String(e?.message || e) }));
  /* Danh sách TRƯỚC, lời báo SAU, trong cùng một nhịp vẽ. Trước đây lời báo "7 gói mới" hiện ngay còn danh sách
     "Động thái mới" phải chờ thêm một lượt hỏi tiện ích — có lúc người dùng (và bài kiểm trên CI) đọc thấy
     "7 gói mới" mà bên dưới chưa có gói nào. */
  const listed = await loadWatch({ markRead: false });
  const message = r?.message || (r?.ok ? 'Đã kiểm tra.' : 'Chưa kiểm tra được.');
  say(listed ? message : `${message} Chưa đọc lại được danh sách — tải lại trang để xem.`, r?.ok && listed ? 'ok' : 'bad');
  run();
}

$('watch-form').addEventListener('submit', (e) => { e.preventDefault(); addWatch($('watch-tax').value, $('watch-name').value); });
$('watch-sweep').addEventListener('click', () => sweep());
$('watch-auto').addEventListener('change', async () => { const r = await send('SET_RIVAL_AUTO', { auto: $('watch-auto').checked }); if (r?.ok) renderWatch(r); });
$('watch-list').addEventListener('click', async (e) => {
  const off = e.target.closest('[data-unwatch]'), check = e.target.closest('[data-check]');
  if (check) { sweep(check.dataset.check); return; }
  if (!off) return;
  if (!confirm('Bỏ theo dõi nhà thầu này? Các tin đã báo về họ cũng được xoá khỏi danh sách.')) return;
  const r = await send('DELETE_RIVAL_WATCH', { taxCode: off.dataset.unwatch });
  if (r?.ok) { renderWatch(r); say('Đã bỏ theo dõi.', 'ok'); run(); }
});

/* ------------------------------------------------------------- THỐNG KÊ TRONG KHO THEO ĐỊA BÀN --- */
async function run() {
  if(!readInvestorInput($('investor')))return;
  const s = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  const rows = localRivals(s.participations || [], s.tenders || [], {
    province: $('province').value,
    investor: $('investor').value,
    field: $('field').value
  });
  const pct = marketBidPercentiles(s.participations || [], s.tenders || [], {
    province: $('province').value, investor: $('investor').value, field: $('field').value
  });
  const head = pct.n ? `<p class="muted">Mặt bằng giá bỏ cùng lọc: P25 ${Number(pct.p25).toLocaleString('vi-VN')} · P50 ${Number(pct.p50).toLocaleString('vi-VN')} · P75 ${Number(pct.p75).toLocaleString('vi-VN')} đ (${pct.n} mẫu)</p>` : '';
  $('list').innerHTML = head + rows.map((r) => {
    const tax = rivalTax(r.taxCode);
    const action = !tax ? '' : watched.has(tax) ? '<span class="tag good">Đang theo dõi</span>'
      : `<button class="btn light sm" type="button" data-watch-tax="${esc(tax)}" data-watch-name="${esc(r.name)}">Theo dõi</button>`;
    return `<article class="ws-result rival-row">
    <div><b>${esc(r.name)}</b> ${r.taxCode ? `<span class="code">${esc(r.taxCode)}</span>` : ''}
    <p class="muted small">${r.bids} lượt · ${r.wins} lần ghi là trúng · ${r.winRate}%${r.medianBid ? ` · giá bỏ trung vị ${Number(r.medianBid).toLocaleString('vi-VN')} đ (${r.priceSamples} mẫu)` : ''}</p></div>
    ${action}
  </article>`; }).join('') || '<p class="muted">Chưa có dữ liệu tham dự trong kho. Hãy đọc BBMT / KQLCNT trước.</p>';
}

$('list').addEventListener('click', (e) => { const b = e.target.closest('[data-watch-tax]'); if (b) addWatch(b.dataset.watchTax, b.dataset.watchName); });
$('go').onclick = run;
$('form').onsubmit = e => { e.preventDefault(); run(); };
loadWatch().then(run);
