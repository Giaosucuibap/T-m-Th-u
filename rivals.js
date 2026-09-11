import { localRivals, marketBidPercentiles } from './lib/rivals.js';
import { escapeHtml } from './lib/html.js';

const $ = (id) => document.getElementById(id);
const esc = escapeHtml;

async function run() {
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
  $('list').innerHTML = head + rows.map((r) => `<article class="ws-result">
    <b>${esc(r.name)}</b> ${r.taxCode ? `<span class="code">${esc(r.taxCode)}</span>` : ''}
    <p class="muted small">${r.bids} lượt · ${r.wins} lần ghi là trúng · ${r.winRate}%${r.medianBid ? ` · giá bỏ trung vị ${Number(r.medianBid).toLocaleString('vi-VN')} đ (${r.priceSamples} mẫu)` : ''}</p>
  </article>`).join('') || '<p class="muted">Chưa có dữ liệu tham dự trong kho. Hãy đọc BBMT / KQLCNT trước.</p>';
}

$('go').onclick = run;
run();
