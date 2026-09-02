/* analytics.js — ba màn hình phân tích dữ liệu đấu thầu.
 *
 * Nguyên tắc trình bày, áp cho MỌI con số trên trang này:
 *   • Luôn hiện CỠ MẪU cạnh chỉ số.
 *   • Mẫu chưa đủ thì làm mờ và gắn nhãn "mẫu nhỏ", không giấu đi cũng không
 *     trình bày như thể chắc chắn.
 *   • Phân tích quan hệ luôn kèm cảnh báo đây là tín hiệu, không phải kết luận.
 */

import { formatMoney } from './lib/core.js';
import { PRICE_BANDS, MIN_SAMPLE } from './lib/stats.js';
import { RELATIONSHIP_DISCLAIMER } from './lib/analytics.js';

const $ = (id) => document.getElementById(id);
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });

function esc(x) {
  return String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const FIELD_LABEL = { HH: 'Hàng hóa', XL: 'Xây lắp', TV: 'Tư vấn', PTV: 'Phi tư vấn', HON_HOP: 'Hỗn hợp' };
const fieldName = (f) => FIELD_LABEL[f] || f || 'Khác';

/** Số phần trăm, kèm dấu phẩy thập phân kiểu Việt Nam. */
function pct(v) {
  return v === null || v === undefined || !Number.isFinite(v)
    ? '—' : `${v.toFixed(2).replace('.', ',')}%`;
}
/** Nhãn cỡ mẫu + cảnh báo khi mẫu nhỏ. */
function sample(n, reliable) {
  return `<span class="sample">n=${n}</span>`
    + (reliable ? '' : '<span class="weak-tag">mẫu nhỏ</span>');
}
/** Ô chỉ số. Mẫu nhỏ thì làm mờ để mắt tự bỏ qua. */
function metric(label, value, sub, reliable = true) {
  return `<div class="card ${reliable ? '' : 'weak'}">
    <div class="muted small">${esc(label)}</div>
    <div class="metric num" style="font-size:24px">${value}</div>
    <div class="muted small">${sub || ''}</div></div>`;
}

/**
 * Biểu đồ hộp thu nhỏ cho một phân bố: râu min–max, hộp Q1–Q3, vạch trung vị.
 * Đọc nhanh hơn nhiều so với bảng 5 con số.
 */
function boxPlot(d, lo, hi) {
  if (d.n === 0 || d.min === null) return '<span class="muted small">—</span>';
  const span = (hi - lo) || 1;
  const at = (v) => Math.max(0, Math.min(100, ((v - lo) / span) * 100));
  const l = at(d.min), r = at(d.max), a = at(d.q1), b = at(d.q3), m = at(d.median);
  return `<div class="box" title="min ${pct(d.min)} · Q1 ${pct(d.q1)} · trung vị ${pct(d.median)} · Q3 ${pct(d.q3)} · max ${pct(d.max)}">
    <div style="width:${l}%"></div>
    <div class="rng" style="width:${Math.max(0, a - l)}%"></div>
    <div class="iqr" style="width:${Math.max(2, b - a)}%">
      <div class="med" style="left:${b - a > 0 ? ((m - a) / (b - a)) * 100 : 50}%"></div>
    </div>
    <div class="rng" style="width:${Math.max(0, r - b)}%"></div>
  </div>`;
}

/* ------------------------------------------------------------------ */

async function loadStore() {
  const r = await send('GET_ANALYTICS', { kind: 'summary' });
  if (!r || !r.ok) return;
  const box = $('store');
  if (!r.total) {
    box.className = 'notice error';
    box.innerHTML = `<b>Kho dữ liệu còn trống.</b> Phân tích cần dữ liệu tích luỹ trước:
      chạy <a class="link" href="winners.html">🏆 Tra cứu trúng thầu</a> theo mã số thuế,
      và <a class="link" href="bidopen.html">⏳ Soi biên bản mở thầu</a> — nguồn thứ hai quan trọng hơn
      vì nó cho biết mỗi gói có bao nhiêu nhà thầu dự và họ giảm giá bao nhiêu.`;
    return;
  }
  box.className = 'notice';
  box.innerHTML = `<b>Kho dữ liệu:</b> ${r.total.toLocaleString('vi-VN')} lượt quan sát ·
    ${r.packages.toLocaleString('vi-VN')} gói thầu · ${r.contractors.toLocaleString('vi-VN')} nhà thầu ·
    ${r.investors.toLocaleString('vi-VN')} chủ đầu tư.
    <span class="muted small">Trong đó ${r.withBidders.toLocaleString('vi-VN')} lượt có đủ bảng nhà thầu
    (từ biên bản mở thầu) — chỉ phần này tính được số đối thủ và mức giảm của mọi bên.</span>`;
}

/* ============ TAB 1 — HỒ SƠ NHÀ THẦU ============ */

async function showProfile() {
  const taxCode = $('mst').value.trim();
  if (!taxCode) { $('profileOut').innerHTML = '<div class="notice error" style="margin-top:14px">Nhập mã số thuế đã.</div>'; return; }
  $('profileOut').innerHTML = '<div class="notice" style="margin-top:14px">Đang tính…</div>';
  const r = await send('GET_ANALYTICS', { kind: 'profile', taxCode });
  const p = r && r.profile;
  if (!p) { $('profileOut').innerHTML = '<div class="notice error" style="margin-top:14px">Mã số thuế phải là 10 chữ số.</div>'; return; }
  if (p.empty) { $('profileOut').innerHTML = `<div class="notice error" style="margin-top:14px">${esc(p.note)}</div>`; return; }

  const wr = p.winRate;
  const cr = p.cheapestRate;
  const d = p.discount;

  $('profileOut').innerHTML = `
    ${p.sampleNote ? `<div class="notice error" style="margin-top:14px">⚠️ ${esc(p.sampleNote)}</div>` : ''}
    <div class="card" style="margin-top:14px">
      <div style="font-size:19px;font-weight:850">${esc(p.name || '(chưa rõ tên)')}</div>
      <div class="muted small">Mã số thuế <span class="pill-tax">${esc(p.taxCode)}</span> ·
        ${p.n} lượt quan sát trong kho</div>
    </div>

    <div class="metrics">
      ${metric('Gói đã dự', p.joinedCount, 'thấy trong biên bản mở thầu')}
      ${metric('Gói đã trúng', p.winCount, `${p.soloWinCount} độc lập · ${p.ventureWinCount} liên danh`)}
      ${metric('Tỷ lệ trúng', wr.text, `trên ${wr.n} gói vừa dự vừa biết kết quả`, wr.reliable)}
      ${metric('Giá trị trúng độc lập', formatMoney(p.soloValue),
        p.ventureShareUnknown
          ? `Thêm ${formatMoney(p.ventureValue)} ở gói liên danh (của cả nhóm)`
          : 'toàn bộ là gói độc lập')}
    </div>

    <div class="card">
      <b>Hành vi bỏ giá</b>
      <div class="metrics" style="margin-top:10px">
        ${metric('Mức giảm trung vị', pct(d.median), sample(d.n, d.reliable), d.reliable)}
        ${metric('Giảm ít nhất – nhiều nhất', `${pct(d.min)} – ${pct(d.max)}`, 'khoảng dao động', d.reliable)}
        ${metric('Độ ổn định', d.stdev === null ? '—' : `±${pct(d.stdev)}`,
          d.stdev === null ? 'chưa đủ dữ liệu' : (d.stdev < 3 ? 'giảm giá rất đều' : d.stdev < 8 ? 'dao động vừa' : 'dao động mạnh'), d.reliable)}
        ${metric('Số lần bỏ giá thấp nhất', p.cheapestCount, cr ? `${cr.text} số gói đã dự` : '', cr && cr.reliable)}
      </div>
      ${d.n ? `<div style="margin-top:10px">${boxPlot(d, Math.min(0, d.min), Math.max(d.max, 1))}
        <div class="muted small">Hộp là khoảng giữa (Q1–Q3), vạch đậm là trung vị.</div></div>` : ''}
    </div>

    <div class="card" style="margin-top:14px">
      <div class="fx">
        <div><b class="small">Lĩnh vực</b>${chips(p.byField, fieldName)}</div>
        <div><b class="small">Địa bàn</b>${chips(p.byLocation)}</div>
        <div><b class="small">Theo năm</b>${chips(p.byYear)}</div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <b>Chủ đầu tư thường gặp</b>
      ${p.byInvestor.length ? `<table style="margin-top:8px"><thead><tr><th>Chủ đầu tư</th><th style="width:90px">Số lượt</th></tr></thead>
        <tbody>${p.byInvestor.map((x) => `<tr><td>${esc(x.key)}</td><td class="num">${x.count}</td></tr>`).join('')}</tbody></table>`
        : '<div class="muted small">Chưa có dữ liệu.</div>'}
    </div>

    <div class="card" style="margin-top:14px">
      <b>Đối tác liên danh</b>
      <div class="muted small">Các nhà thầu từng cùng đứng tên liên danh với công ty này.</div>
      ${p.partners.length ? `<table style="margin-top:8px"><thead><tr><th>Nhà thầu</th><th style="width:130px">Mã số thuế</th><th style="width:90px">Số gói</th></tr></thead>
        <tbody>${p.partners.map((x) => `<tr><td>${esc(x.name || '—')}</td>
          <td><span class="pill-tax">${esc(x.taxCode)}</span></td><td class="num">${x.count}</td></tr>`).join('')}</tbody></table>`
        : '<div class="muted small" style="margin-top:6px">Chưa thấy gói liên danh nào.</div>'}
    </div>`;
}

function chips(items, fmt) {
  if (!items || !items.length) return '<div class="muted small">—</div>';
  return `<div class="chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">`
    + items.map((x) => `<span class="pill">${esc(fmt ? fmt(x.key) : x.key)} (${x.count})</span>`).join('')
    + '</div>';
}

/* ============ TAB 2 — CHÂN DUNG GIẢM GIÁ ============ */

async function showDiscount() {
  $('discountOut').innerHTML = '<div class="notice" style="margin-top:14px">Đang tính…</div>';
  const r = await send('GET_ANALYTICS', {
    kind: 'discount', field: $('dField').value, taxCode: $('dTax').value.trim()
  });
  if (!r || !r.ok) return;
  const d = r.discount;
  const t = r.threshold;

  const bandRows = d.bands.map((b) => `
    <tr class="${b.reliable ? '' : 'weak'}">
      <td>${esc(b.band)}</td>
      <td class="num">${b.n}${b.reliable ? '' : '<span class="weak-tag">nhỏ</span>'}</td>
      <td class="num">${pct(b.median)}</td>
      <td class="num">${pct(b.q1)} – ${pct(b.q3)}</td>
      <td class="num">${pct(b.max)}</td>
      <td style="min-width:120px">${boxPlot(b, 0, Math.max(30, b.max || 30))}</td>
    </tr>`).join('');

  const thRows = t.bands.map((b) => `
    <tr class="${b.reliable ? '' : 'weak'}">
      <td>${esc(b.band)}</td>
      <td class="num">${b.n}${b.reliable ? '' : '<span class="weak-tag">nhỏ</span>'}</td>
      <td class="num" style="font-weight:800;color:#166534">${pct(b.suggestedMin)}</td>
      <td class="num">${pct(b.median)}</td>
      <td class="num">${pct(b.aggressive)}</td>
      <td class="num">${pct(b.max)}</td>
    </tr>`).join('');

  $('discountOut').innerHTML = `
    ${d.note ? `<div class="notice error" style="margin-top:14px">⚠️ ${esc(d.note)}</div>` : ''}
    <div class="metrics">
      ${metric('Mức giảm trung vị', pct(d.overall.median), sample(d.overall.n, d.overall.reliable), d.overall.reliable)}
      ${metric('Nửa giữa dao động', `${pct(d.overall.q1)} – ${pct(d.overall.q3)}`, 'khoảng Q1–Q3', d.overall.reliable)}
      ${metric('Giảm sâu nhất', pct(d.overall.max), 'trong dữ liệu đã có', d.overall.reliable)}
      ${metric('Độ phân tán', d.overall.stdev === null ? '—' : `±${pct(d.overall.stdev)}`, 'độ lệch chuẩn', d.overall.reliable)}
    </div>

    <div class="card">
      <b>Phân bố mức giảm theo khoảng giá</b>
      <div class="muted small">Gói 500 triệu và gói 500 tỷ không so trực tiếp được, nên phải tách khoảng.</div>
      ${bandRows ? `<div style="overflow:auto"><table style="margin-top:8px">
        <thead><tr><th>Khoảng giá</th><th>Số lượt</th><th>Trung vị</th><th>Nửa giữa</th><th>Cao nhất</th><th>Phân bố</th></tr></thead>
        <tbody>${bandRows}</tbody></table></div>` : '<div class="muted small" style="margin-top:8px">Chưa có dữ liệu.</div>'}
    </div>

    <div class="card" style="margin-top:14px">
      <b>Ngưỡng giảm giá để thắng</b>
      <div class="muted small">Tính trên các gói ĐÃ có kết quả: người thắng đã giảm bao nhiêu.
        Cột <b>Nên cân nhắc từ</b> là phân vị 25 — thấp hơn mức này thì 3/4 người thắng đã giảm sâu hơn bạn.</div>
      ${t.note ? `<div class="notice error" style="margin-top:10px">⚠️ ${esc(t.note)}</div>` : ''}
      ${thRows ? `<div style="overflow:auto"><table style="margin-top:8px">
        <thead><tr><th>Khoảng giá</th><th>Số gói</th><th>Nên cân nhắc từ</th><th>Trung vị</th><th>Mạnh tay</th><th>Cao nhất</th></tr></thead>
        <tbody>${thRows}</tbody></table></div>` : ''}
      <div class="muted small" style="margin-top:10px">
        Đây là thống kê mô tả từ lịch sử, <b>không phải dự đoán</b>. Giá thắng còn phụ thuộc
        năng lực kỹ thuật, hồ sơ và bối cảnh từng gói.
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <b>Theo lĩnh vực</b>
      ${d.fields.length ? `<div style="overflow:auto"><table style="margin-top:8px">
        <thead><tr><th>Lĩnh vực</th><th>Số lượt</th><th>Trung vị</th><th>Nửa giữa</th></tr></thead>
        <tbody>${d.fields.map((f) => `<tr class="${f.reliable ? '' : 'weak'}">
          <td>${esc(fieldName(f.field))}</td><td class="num">${f.n}${f.reliable ? '' : '<span class="weak-tag">nhỏ</span>'}</td>
          <td class="num">${pct(f.median)}</td><td class="num">${pct(f.q1)} – ${pct(f.q3)}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="muted small">Chưa có dữ liệu.</div>'}
    </div>`;
}

/* ============ TAB 3 — QUAN HỆ CĐT – NHÀ THẦU ============ */

async function showRelations() {
  $('relOut').innerHTML = '<div class="notice" style="margin-top:14px">Đang tính…</div>';
  const r = await send('GET_ANALYTICS', {
    kind: 'relations', minPackages: $('rMin').value, investor: $('rInv').value.trim()
  });
  if (!r || !r.ok) return;
  const c = r.competition;
  const q = $('rInv').value.trim().toLowerCase();
  const matrix = q ? r.matrix.filter((m) => m.investorName.toLowerCase().includes(q)) : r.matrix;

  const hhClass = (lv) => lv === 'Tập trung cao' ? 'hh-high' : lv === 'Tập trung vừa' ? 'hh-mid' : 'hh-low';

  $('relOut').innerHTML = `
    <div class="disclaimer">⚠️ <b>Đọc kỹ trước khi dùng.</b> ${esc(RELATIONSHIP_DISCLAIMER)}</div>

    <div class="metrics">
      ${metric('Gói đọc được biên bản', c.packageCount, 'nguồn duy nhất biết số nhà thầu dự')}
      ${metric('Số nhà thầu bình quân', c.bidders.mean === null ? '—' : c.bidders.mean.toFixed(1).replace('.', ','),
        `trung vị ${c.bidders.median === null ? '—' : c.bidders.median}`, c.bidders.reliable)}
      ${metric('Gói chỉ 1 nhà thầu', c.singleBidderCount, c.singleBidderRate.text + ' số gói', c.singleBidderRate.reliable)}
      ${metric('Nhiều nhất', c.bidders.max === null ? '—' : c.bidders.max, 'nhà thầu trong một gói', c.bidders.reliable)}
    </div>
    ${c.note ? `<div class="notice error">⚠️ ${esc(c.note)}</div>` : ''}

    <div class="card">
      <b>Số nhà thầu tham dự mỗi gói</b>
      <div class="muted small">Gói chỉ có một nhà thầu là chỉ báo cạnh tranh yếu được nhiều tổ chức quốc tế dùng.</div>
      ${c.distribution.length ? `<table style="margin-top:8px"><thead><tr><th style="width:130px">Số nhà thầu</th><th>Số gói</th><th></th></tr></thead>
        <tbody>${c.distribution.map((x) => {
          const w = c.packageCount ? Math.round((x.count / c.packageCount) * 100) : 0;
          return `<tr><td>${esc(x.key)} nhà thầu</td><td class="num">${x.count} <span class="muted">(${w}%)</span></td>
            <td><div class="bar"><i style="width:${w}%"></i></div></td></tr>`;
        }).join('')}</tbody></table>` : '<div class="muted small" style="margin-top:8px">Chưa có dữ liệu.</div>'}
    </div>

    <div class="card" style="margin-top:14px">
      <b>Ma trận Chủ đầu tư × Nhà thầu</b>
      <div class="muted small">Bấm từng chủ đầu tư để xem các nhà thầu và tỷ lệ trúng.
        <b>Mức tập trung</b> chỉ đo giá trị trúng độc lập rơi vào tay bao nhiêu nhà thầu
        (chỉ số Herfindahl); gói liên danh bị loại vì không biết tỷ lệ góp của từng thành viên.</div>
      ${matrix.length ? matrix.map((m) => `
        <details>
          <summary>
            <span style="font-weight:800">${esc(m.investorName)}</span>
            <span class="muted small"> · ${m.packageCount} gói · ${m.contractorCount} nhà thầu</span>
            ${m.concentration.value !== null
              ? ` · <span class="${hhClass(m.concentration.level)}">${esc(m.concentration.level)}</span>
                  <span class="sample">HHI ${m.concentration.value} · chỉ gói độc lập</span>` : ''}
            ${m.topWinner && m.topWinnerShare && m.topWinnerShare.value !== null
              ? `<div class="muted small" style="margin-top:3px">Trúng nhiều nhất:
                 ${esc(m.topWinner.name || m.topWinner.taxCode)} — ${m.topWinner.won}/${m.packageCount} gói
                 (${m.topWinnerShare.text} số gói đã có kết quả)</div>` : ''}
          </summary>
          <div style="overflow:auto"><table>
            <thead><tr><th>Nhà thầu</th><th style="width:120px">Mã số thuế</th><th style="width:70px">Dự</th>
            <th style="width:70px">Trúng</th><th style="width:110px">Tỷ lệ</th><th style="width:150px">Giá trị độc lập</th></tr></thead>
            <tbody>${m.contractors.map((x) => `<tr class="${x.winRate.reliable ? '' : 'weak'}">
              <td>${esc(x.name || '—')}</td>
              <td><span class="pill-tax">${esc(x.taxCode)}</span></td>
              <td class="num">${x.joined}</td>
              <td class="num" style="font-weight:800;color:#166534">${x.won}</td>
              <td class="num">${x.winRate.text}${x.winRate.reliable ? '' : '<span class="weak-tag">nhỏ</span>'}</td>
              <td class="num">${esc(formatMoney(x.soloValue))}</td></tr>`).join('')}
            </tbody></table></div>
        </details>`).join('')
        : '<div class="muted small" style="margin-top:8px">Chưa đủ dữ liệu. Hạ ngưỡng số gói, hoặc chạy thêm tra cứu để tích luỹ.</div>'}
    </div>`;
}

/* ------------------------------------------------------------------ */

$('dField').innerHTML = '<option value="">Tất cả lĩnh vực</option>'
  + Object.entries(FIELD_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('on'));
    t.classList.add('on');
    ['profile', 'discount', 'relations'].forEach((k) => {
      $(`p-${k}`).classList.toggle('hidden', k !== t.dataset.t);
    });
  });
});

$('goProfile').addEventListener('click', showProfile);
$('mst').addEventListener('keydown', (e) => { if (e.key === 'Enter') showProfile(); });
$('goDiscount').addEventListener('click', showDiscount);
$('goRel').addEventListener('click', showRelations);

loadStore();
