/* Báo trước gói lặp lại hằng năm (4.22.0). Luật ở lib/recurring.js; trang này chỉ đọc kho và hiển thị. */
import { collectPackages, findRecurring, filterRecurring, RECURRING_STATUS_LABEL, RECURRING_NOTE } from './lib/recurring.js';
import { escapeHtml } from './lib/html.js';
import { formatMoney } from './lib/core.js';

const $ = (id) => document.getElementById(id);
const esc = escapeHtml;
const vn = (value) => { const t = Date.parse(value || ''); if (!Number.isFinite(t)) return ''; const d = new Date(t + 7 * 3600_000); return { d: String(d.getUTCDate()).padStart(2, '0'), m: String(d.getUTCMonth() + 1).padStart(2, '0'), y: d.getUTCFullYear() }; };
const monthYear = (value) => { const x = vn(value); return x ? `${x.m}/${x.y}` : ''; };
const fullDate = (value) => { const x = vn(value); return x ? `${x.d}/${x.m}/${x.y}` : ''; };

let all = null, counts = { packages: 0, years: [] };

async function load() {
  const s = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  const packages = collectPackages({ observations: s?.observations || [], tenders: s?.tenders || [] });
  const years = [...new Set(packages.map((p) => new Date(p.at + 7 * 3600_000).getUTCFullYear()))].sort();
  counts = { packages: packages.length, years };
  all = findRecurring(packages);
}

function when(row) {
  if (row.status === 'sap-toi') return row.daysUntil <= 1 ? 'trong hôm nay hoặc ngày mai' : `còn khoảng ${row.daysUntil} ngày`;
  if (row.status === 'da-toi-ky') return `đã qua kỳ thường lệ ${Math.abs(row.daysUntil)} ngày`;
  if (row.status === 'ngung') return `kỳ gần nhất đã qua ${Math.abs(row.daysUntil)} ngày`;
  return `còn khoảng ${row.daysUntil} ngày`;
}

function card(row) {
  const tone = row.status === 'sap-toi' ? 'warn' : row.status === 'da-toi-ky' ? 'info' : '';
  const history = row.occurrences.map((o) => `<li><span class="forecast-date">${esc(fullDate(o.at))}</span> <span class="code">${esc(o.code)}</span> ${o.url && /^https:\/\/muasamcong\.(?:mof|mpi)\.gov\.vn\//.test(o.url) ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.name)}</a>` : esc(o.name)}${o.price ? ` — ${esc(formatMoney(o.price))}` : ''}</li>`).join('');
  return `<article class="card forecast-card ${row.status}">
    <div class="forecast-head">
      <span class="tag ${tone || ''}">${esc(RECURRING_STATUS_LABEL[row.status])}</span>
      <span class="tag">${row.years.length} năm: ${esc(row.years.join(', '))}</span>
      ${row.annualHint ? '<span class="tag good">Loại việc thường niên</span>' : ''}
    </div>
    <h3 class="forecast-title">${esc(row.name)}</h3>
    <div class="muted small">${esc(row.investorName)}${row.location ? ` · ${esc(row.location)}` : ''}</div>
    <div class="forecast-meta">
      <div><span>Kỳ dự kiến</span><b>khoảng tháng ${esc(monthYear(row.expectedAt))}</b><small>${esc(when(row))} · các năm trước rơi vào ${esc(fullDate(row.windowFrom))} – ${esc(fullDate(row.windowTo))}</small></div>
      <div><span>Giá gói lần gần nhất</span><b>${row.lastPrice ? esc(formatMoney(row.lastPrice)) : 'Chưa có giá trong kho'}</b></div>
    </div>
    <details class="forecast-history"><summary>Các lần đã gặp (${row.occurrences.length})</summary><ul>${history}</ul></details>
  </article>`;
}

async function run() {
  $('go').disabled = true; $('summary').textContent = 'Đang đọc kho…';
  try {
    if (!all) await load();
    const rows = filterRecurring(all, { province: $('province').value, investor: $('investor').value, keyword: $('keyword').value, upcomingOnly: $('upcoming').checked });
    const span = counts.years.length ? `từ năm ${counts.years[0]} đến ${counts.years[counts.years.length - 1]}` : '';
    $('summary').textContent = `Kho có ${counts.packages.toLocaleString('vi-VN')} gói ${span}. Tìm thấy ${all.length} nhóm gói lặp lại; đang hiện ${Math.min(rows.length, 80)}${rows.length > 80 ? ` trên ${rows.length}` : ''}.`;
    $('list').innerHTML = rows.slice(0, 80).map(card).join('') || `<p class="muted">${all.length ? 'Không có nhóm nào khớp bộ lọc. Bỏ dấu “Chỉ hiện gói sắp tới kỳ” để xem tất cả.' : counts.years.length < 2
      ? 'Kho mới có dữ liệu của một năm nên chưa thấy được gói lặp lại. Hãy nạp thêm lịch sử ở màn hình Bộ săn tự động (Kho lịch sử) hoặc đọc biên bản mở thầu / kết quả của các năm trước.'
      : 'Chưa thấy gói nào lặp lại qua các năm trong kho hiện có.'}</p>`;
  } catch (error) { $('summary').textContent = `Chưa đọc được kho: ${String(error?.message || error)}`; }
  finally { $('go').disabled = false; }
}

$('note').textContent = `${RECURRING_NOTE} Phần mềm không đọc được thời hạn hợp đồng nên không báo “hợp đồng sắp hết hạn”.`;
$('go').addEventListener('click', run);
$('upcoming').addEventListener('change', run);
$('form').addEventListener('submit', (e) => { e.preventDefault(); run(); });
run();
