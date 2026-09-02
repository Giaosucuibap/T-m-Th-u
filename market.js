/* ============================================================================
 *  market.js — giao diện "Soi địa bàn"
 *
 *  Hiển thị quan hệ CHỦ ĐẦU TƯ ↔ NHÀ THẦU trên một xã/phường. Toàn bộ phép
 *  tính nằm ở lib/localmarket.js; tệp này chỉ vẽ.
 *
 *  Nguyên tắc trình bày: mọi tỷ lệ đều đi kèm CỠ MẪU, và chỉ số từ mẫu quá nhỏ
 *  bị làm mờ. Một tỷ lệ 100% từ 2 gói không được trông giống 100% từ 40 gói.
 * ========================================================================== */

const $ = (id) => document.getElementById(id);
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });

let POLL = null;
let SCAN = null;
let TAB = 'pairs';

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

function isIncomplete(scan) {
  return Boolean(scan && (scan.status === 'PARTIAL' || scan.partial || scan.cancelled || scan.capped));
}

function incompleteBanner(scan) {
  if (!isIncomplete(scan)) return '';
  const reason = scan.capped
    ? 'Lượt tra cứu đã chạm giới hạn số trang.'
    : scan.cancelled
      ? 'Lượt tra cứu đã dừng giữa chừng.'
      : 'e-GP ngừng trả dữ liệu trước khi lấy hết các trang.';
  return `<b>Dữ liệu chưa đầy đủ.</b> ${reason} Các tỷ lệ và tín hiệu chỉ phản ánh phần dữ liệu đã nhận.`;
}

/* --------------------------------------------------------------------------
 *  Ô CHỌN ĐỊA BÀN — dùng chung nguồn với trang Kế hoạch LCNT
 * ------------------------------------------------------------------------ */

function fillDatalist(id, names) {
  $(id).innerHTML = (names || []).map((n) => `<option value="${esc(n)}">`).join('');
}

async function loadProvinces() {
  const res = await send('AREA_OPTIONS', {});
  if (!res || res.ok === false) {
    $('ward-hint').textContent = (res && res.message) || 'Chưa lấy được danh sách địa bàn từ e-GP.';
    return;
  }
  fillDatalist('province-list', res.provinces);
  $('ward-hint').textContent = `${res.provinces.length} tỉnh/thành. Chọn tỉnh để hiện danh sách xã/phường.`;
}

async function loadWards() {
  const province = $('province').value.trim();
  if (!province) { fillDatalist('ward-list', []); return; }
  $('ward-hint').textContent = 'Đang lấy danh sách xã/phường…';
  const res = await send('AREA_OPTIONS', { province });
  if (!res || res.ok === false) {
    $('ward-hint').textContent = (res && res.message) || 'Chưa lấy được danh sách xã/phường.';
    return;
  }
  fillDatalist('ward-list', res.wards);
  $('ward-hint').textContent = res.wards.length
    ? `${res.wards.length} địa danh của ${province} (gồm cả tên huyện/xã trước sáp nhập).`
    : `Không thấy xã/phường nào cho "${province}".`;
}


/* --------------------------------------------------------------------------
 *  BỘ LỌC — tất cả đều do e-GP lọc phía máy chủ
 *
 *  Điểm quan trọng: mọi tiêu chí dưới đây đi thẳng vào truy vấn gửi lên e-GP,
 *  không phải lọc sau khi tải về. Nhờ vậy thu hẹp phạm vi làm lượt tra cứu
 *  NHANH THẬT chứ không chỉ hiện ít dòng hơn.
 * ------------------------------------------------------------------------ */

/** Năm sớm nhất còn dữ liệu trên e-GP. Trước mốc này gần như không có KQLCNT. */
const FIRST_YEAR = 2018;

function fillYears() {
  const now = new Date().getFullYear();
  const opts = ['<option value="">Không giới hạn</option>'];
  for (let y = now; y >= FIRST_YEAR; y--) opts.push(`<option value="${y}">${y}</option>`);
  $('fromYear').innerHTML = opts.join('');
  $('toYear').innerHTML = opts.join('');
}

const checked = (id) =>
  [...document.querySelectorAll(`#${id} input:checked`)].map((x) => x.value);

function readFilters() {
  return {
    fromYear: $('fromYear').value,
    toYear: $('toYear').value,
    minPrice: $('minPrice').value,
    maxPrice: $('maxPrice').value,
    online: $('online').value,
    fields: checked('fields'),
    forms: checked('forms')
  };
}

/** Mô tả bộ lọc đang bật, để người dùng thấy phạm vi mình vừa chọn. */
function describeFilters(f) {
  const bits = [];
  if (f.fromYear || f.toYear) bits.push(`năm ${f.fromYear || FIRST_YEAR}–${f.toYear || new Date().getFullYear()}`);
  if (f.minPrice || f.maxPrice) {
    const m = (v) => (v ? Number(v).toLocaleString('vi-VN') + ' đ' : '∞');
    bits.push(`giá ${m(f.minPrice)} – ${m(f.maxPrice)}`);
  }
  if (f.fields.length) bits.push(`${f.fields.length} lĩnh vực`);
  if (f.forms.length) bits.push(`${f.forms.length} hình thức`);
  if (f.online === '1') bits.push('qua mạng');
  if (f.online === '0') bits.push('không qua mạng');
  return bits.length ? `Đang lọc: ${bits.join(' · ')}` : 'Chưa đặt bộ lọc nào — sẽ lấy toàn bộ.';
}

function refreshFilterNote() {
  $('filter-note').textContent = describeFilters(readFilters());
}

function clearFilters() {
  for (const id of ['fromYear', 'toYear', 'minPrice', 'maxPrice', 'online']) $(id).value = '';
  for (const x of document.querySelectorAll('.checks input')) x.checked = false;
  refreshFilterNote();
}

/* --------------------------------------------------------------------------
 *  CHẠY
 * ------------------------------------------------------------------------ */

async function start() {
  const payload = { ward: $('ward').value.trim(), province: $('province').value.trim(), ...readFilters() };
  alertBox('', null);
  show($('result'), false);
  show($('progress'), true);
  $('progress-text').textContent = 'Đang hỏi e-GP các gói thầu trên địa bàn này…';

  const res = await send('AREA_SCAN', payload);
  if (!res || res.ok === false) {
    show($('progress'), false);
    alertBox(esc((res && res.message) || 'Không bắt đầu được lượt soi.'), 'error');
    return;
  }
  startPolling();
}

function startPolling() {
  clearInterval(POLL);
  POLL = setInterval(refresh, 900);
}

async function refresh() {
  const state = await chrome.storage.local.get({ areaScan: null });
  const scan = state.areaScan;
  if (!scan) { show($('progress'), false); return; }
  SCAN = scan;

  if (scan.status === 'RUNNING') {
    show($('progress'), true);
    $('progress-text').textContent = scan.message || 'Đang tra cứu…';
    // Nếu chưa theo dõi thì bật ngay. Thiếu bước này, một lượt đang chạy thật
    // sẽ hiện thanh tiến trình ĐỨNG YÊN mãi, vì trang chỉ đọc trạng thái đúng
    // một lần lúc mở.
    if (!POLL) startPolling();
    return;
  }

  clearInterval(POLL);
  show($('progress'), false);

  if (scan.status === 'ERROR') { alertBox(esc(scan.message), 'error'); return; }
  if (!scan.summary) {
    alertBox(isIncomplete(scan) ? incompleteBanner(scan) : esc(scan.message), isIncomplete(scan) ? 'error' : null);
    return;
  }

  alertBox(incompleteBanner(scan), isIncomplete(scan) ? 'error' : null);
  render(scan);
}

/* --------------------------------------------------------------------------
 *  VẼ
 * ------------------------------------------------------------------------ */

function render(scan) {
  const s = scan.summary;
  show($('result'), true);

  $('m-contractor').textContent = s.contractorCount;
  $('m-contractor-sub').textContent = `${s.packageCount} gói đã có kết quả`;
  $('m-investor').textContent = s.investorCount;
  $('m-investor-sub').textContent = `chủ đầu tư mang tên "${scan.criteria.ward}"`;
  $('m-value').textContent = money(s.totalValue);
  $('m-years').textContent = s.years.length
    ? `Từ ${s.years[0]} đến ${s.years[s.years.length - 1]}` : '—';

  const c = s.concentration;
  $('m-hhi').textContent = c.value === null ? '—' : `${c.level}`;
  const hhiLabel = $('m-hhi').previousElementSibling;
  if (hhiLabel) hhiLabel.textContent = 'Mức tập trung · chỉ gói độc lập';
  $('m-hhi').title = c.value === null ? 'Liên danh không được tính vào HHI'
    : `HHI ${c.value.toLocaleString('vi-VN')} trên ${c.n} nhà thầu; chỉ tính giá trị trúng độc lập, loại liên danh`;

  $('signals').innerHTML = s.signals.length
    ? s.signals.map((x) => `<div class="signal">⚠️ ${esc(x.text)}
        <span class="muted small"> (cỡ mẫu ${x.n})</span></div>`).join('')
    : isIncomplete(scan)
      ? `<div class="notice" style="margin-top:10px">Chưa thể kết luận về mức tập trung vì lượt lấy dữ liệu chưa đầy đủ.</div>`
      : `<div class="notice ok" style="margin-top:10px">Không thấy dấu hiệu tập trung nào vượt ngưỡng
          trên cỡ mẫu hiện có.</div>`;

  $('disclaimer').textContent = scan.disclaimer || '';
  $('scope-note').textContent = scan.scopeNote || '';
  drawPanel();
}

function drawPanel() {
  if (TAB === 'pricing') return drawPricing();
  const s = SCAN && SCAN.summary;
  if (!s) return;
  if (TAB === 'pairs') return drawPairs(s);
  if (TAB === 'contractors') return drawContractors(s);
  return drawInvestors(s);
}

/** Cỡ mẫu nhỏ thì làm mờ, kèm chú thích — không để người đọc tin quá mức. */
const weak = (reliable) => (reliable ? '' : ' class="weak" title="Cỡ mẫu nhỏ, chưa đủ tin"');

function drawPairs(s) {
  $('panel').innerHTML = `
    <div class="muted small" style="margin-bottom:10px">
      Mỗi dòng là một cặp <b>chủ đầu tư – nhà thầu</b>, sắp theo số gói trúng.
      Cột "Tỷ trọng" cho biết cặp đó chiếm bao nhiêu phần trăm số gói của chủ đầu tư ấy.
    </div>
    <table>
      <thead><tr>
        <th>Chủ đầu tư</th><th>Nhà thầu</th><th class="num">Số gói</th>
        <th class="num">Tỷ trọng</th><th class="num">Giá trị trúng</th>
        <th class="num">Giảm giá</th><th>Năm</th>
      </tr></thead>
      <tbody>${s.pairs.map((p) => `
        <tr>
          <td>${esc(p.investorName)}</td>
          <td>${esc(p.contractorName || '(e-GP không ghi tên)')}
              <span class="sub code">${esc(p.taxCode)}</span></td>
          <td class="num"><b>${p.packages}</b></td>
          <td class="num"${weak(p.shareOfInvestor.reliable)}>${esc(p.shareOfInvestor.text)}
              <span class="sub">/${p.shareOfInvestor.n} gói</span></td>
          <td class="num">${money(p.soloValue)}
              ${p.ventureValue > 0 ? `<span class="sub">+ ${money(p.ventureValue)} liên danh</span>` : ''}</td>
          <td class="num"${weak(p.discount.reliable)}>${pct(p.discount.median)}
              <span class="sub">n=${p.discount.n}</span></td>
          <td>${esc((p.years || []).join(', '))}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="muted small" style="margin-top:10px">
      Giá trị gói <b>liên danh</b> để riêng, không cộng vào giá trị trúng độc lập:
      e-GP không công bố tỷ lệ góp vốn nên không thể quy giá trị cả gói cho một thành viên.
    </div>`;
}

function drawContractors(s) {
  $('panel').innerHTML = `
    <table>
      <thead><tr>
        <th>Nhà thầu</th><th class="num">Số gói</th><th class="num">Độc lập / Liên danh</th>
        <th class="num">Giá trị trúng</th><th class="num">Giảm giá trung vị</th>
        <th class="num">Số CĐT</th><th>Năm</th>
      </tr></thead>
      <tbody>${s.contractors.map((c) => `
        <tr>
          <td>${esc(c.name || '(e-GP không ghi tên)')}
              <span class="sub code">${esc(c.taxCode)}</span></td>
          <td class="num"><b>${c.packages}</b></td>
          <td class="num">${c.soloCount} / ${c.ventureCount}</td>
          <td class="num">${money(c.soloValue)}
              ${c.ventureValue > 0 ? `<span class="sub">+ ${money(c.ventureValue)} liên danh</span>` : ''}</td>
          <td class="num"${weak(c.discount.reliable)}>${pct(c.discount.median)}
              <span class="sub">n=${c.discount.n}</span></td>
          <td class="num">${c.investorCount}</td>
          <td>${c.firstYear ? `${c.firstYear}–${c.lastYear}` : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function drawInvestors(s) {
  $('panel').innerHTML = `
    <table>
      <thead><tr>
        <th>Chủ đầu tư</th><th class="num">Số gói</th><th class="num">Số nhà thầu</th>
        <th class="num">Tổng giá trị</th><th>Nhà thầu trúng nhiều nhất</th>
        <th class="num">Tỷ trọng</th><th>Mức tập trung</th>
      </tr></thead>
      <tbody>${s.investors.map((i) => `
        <tr>
          <td>${esc(i.investorName)}</td>
          <td class="num"><b>${i.packages}</b></td>
          <td class="num">${i.contractorCount}</td>
          <td class="num">${money(i.totalValue)}</td>
          <td>${i.topContractor ? esc(i.topContractor.name || i.topContractor.taxCode) : '—'}</td>
          <td class="num"${weak(i.topShare.reliable)}>${esc(i.topShare.text)}</td>
          <td>${i.concentration.value === null ? '—'
              : `<span class="tag ${i.concentration.value > 2500 ? 'tag-hot' : 'tag-ok'}">${esc(i.concentration.level)}</span>
                 <span class="sub">HHI ${i.concentration.value.toLocaleString('vi-VN')} · chỉ gói độc lập</span>`}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="muted small" style="margin-top:10px">
      <b>Mức tập trung (HHI)</b> chỉ đo giá trị <b>trúng độc lập</b> dồn vào bao nhiêu nhà thầu;
      toàn bộ gói liên danh bị loại vì e-GP không công bố tỷ lệ góp của từng thành viên.
      Dưới 1.500 là phân tán, trên 2.500 là tập trung cao. Đây là thước đo thống kê,
      không phải kết luận về hành vi.
    </div>`;
}

/* --------------------------------------------------------------------------
 *  TAB GIÁ THỊ TRƯỜNG
 *
 *  Mọi phép tính nằm ở lib/pricing.js. Ở đây chỉ vẽ, và giữ đúng ba nguyên tắc
 *  của module đó: không đưa ra "giá nên bỏ", luôn hiện cỡ mẫu, và không dựng
 *  khoảng tham khảo từ mẫu quá nhỏ.
 * ------------------------------------------------------------------------ */

/** Bảng thống kê giảm giá của một nhóm. */
function priceTable(title, rows, note) {
  if (!rows || !rows.length) return '';
  return `
    <h3 style="margin:18px 0 8px;font-size:15px">${esc(title)}</h3>
    ${note ? `<div class="muted small" style="margin-bottom:8px">${esc(note)}</div>` : ''}
    <table>
      <thead><tr>
        <th>Phân theo</th><th class="num">Số gói</th><th class="num">Giảm ít nhất</th>
        <th class="num">25%</th><th class="num">Trung vị</th><th class="num">75%</th>
        <th class="num">Giảm nhiều nhất</th><th class="num">Tổng giá trị trúng</th>
      </tr></thead>
      <tbody>${rows.map((x) => `
        <tr${x.discount.reliable ? '' : ' class="weak" title="Dưới 5 gói — chỉ tham khảo"'}>
          <td>${esc(x.label)}</td>
          <td class="num"><b>${x.n}</b></td>
          <td class="num">${pct(x.discount.min)}</td>
          <td class="num">${pct(x.discount.q1)}</td>
          <td class="num"><b>${pct(x.discount.median)}</b></td>
          <td class="num">${pct(x.discount.q3)}</td>
          <td class="num">${pct(x.discount.max)}</td>
          <td class="num">${money(x.totalValue)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

/** Ô nhập giá gói thầu của người dùng + khoảng tham khảo suy ra. */
function askBar(pricing) {
  const fields = pricing.byField.map((x) => `<option value="${esc(x.key)}">${esc(x.label)} (${x.n})</option>`).join('');
  const forms = pricing.byForm.map((x) => `<option value="${esc(x.key)}">${esc(x.label)} (${x.n})</option>`).join('');
  return `
    <div class="card" style="background:#f8fafc;margin-bottom:6px">
      <div class="askbar">
        <div>
          <label for="myPrice">Giá gói thầu của bạn (đồng)</label>
          <input id="myPrice" type="number" min="0" step="1000000" placeholder="VD: 5000000000">
        </div>
        <div>
          <label for="myField">Lĩnh vực</label>
          <select id="myField"><option value="">Tất cả</option>${fields}</select>
        </div>
        <div>
          <label for="myForm">Hình thức</label>
          <select id="myForm"><option value="">Tất cả</option>${forms}</select>
        </div>
        <div>
          <label style="display:flex;align-items:center;gap:6px;font-weight:600;white-space:nowrap">
            <input id="sameBand" type="checkbox" style="width:auto" checked> Cùng khoảng giá
          </label>
        </div>
      </div>
      <div id="refout" style="margin-top:12px"></div>
    </div>`;
}

function drawReference(res) {
  const box = $('refout');
  if (!box) return;
  const r = res.reference;

  if (!r.n) {
    box.innerHTML = `<div class="notice">Không có gói nào khớp tiêu chí đã chọn để đối chiếu.
      Thử bỏ dấu "Cùng khoảng giá", hoặc chọn "Tất cả" ở Lĩnh vực / Hình thức.</div>`;
    return;
  }

  if (!r.reference) {
    // Có dữ liệu nhưng chưa đủ điều kiện dựng khoảng: nói rõ thiếu gì.
    const why = !res.target.price
      ? 'Hãy nhập giá gói thầu của bạn để suy ra khoảng tham khảo.'
      : `Chỉ có ${r.n} gói khớp — dưới 5 gói thì chưa dựng được khoảng tham khảo đáng tin.`;
    box.innerHTML = `<div class="notice">
      ${esc(why)}<br>
      <span class="muted small">Mức giảm của ${r.n} gói khớp: trung vị ${pct(r.discount.median)},
      thấp nhất ${pct(r.discount.min)}, cao nhất ${pct(r.discount.max)}.</span></div>`;
    return;
  }

  box.innerHTML = `
    <div class="refbox">
      <div><div class="k">Giảm ít (25% số gói)</div>
        <div class="v">${money(r.reference.high)}</div>
        <div class="k">giảm ${pct(r.reference.highRate)}</div></div>
      <div class="refmid"><div class="k">Mặt bằng phổ biến (trung vị)</div>
        <div class="v">${money(r.reference.mid)}</div>
        <div class="k">giảm ${pct(r.reference.midRate)}</div></div>
      <div><div class="k">Giảm sâu (25% số gói)</div>
        <div class="v">${money(r.reference.low)}</div>
        <div class="k">giảm ${pct(r.reference.lowRate)}</div></div>
    </div>
    <div class="muted small">
      Dựng từ <b>${r.n} gói tương tự</b> đã công bố kết quả.
      Công thức: ${esc(r.reference.formula)}.
      Nửa giữa thị trường (25%–75%) nằm trong khoảng
      <b>${money(r.reference.low)} – ${money(r.reference.high)}</b>.
    </div>`;
}

async function refreshReference() {
  if (!$('myPrice')) return;
  const res = await send('PRICE_REFERENCE', {
    price: $('myPrice').value,
    field: $('myField').value,
    form: $('myForm').value,
    sameBand: $('sameBand').checked
  });
  if (!res || res.ok === false) {
    $('refout').innerHTML = `<div class="notice error">${esc((res && res.message) || 'Không tính được.')}</div>`;
    return;
  }
  drawReference(res);
}

function drawPricing() {
  const p = SCAN && SCAN.pricing;
  if (!p) {
    $('panel').innerHTML = '<div class="notice">Lượt soi này chưa có dữ liệu giá. Hãy chạy lại.</div>';
    return;
  }

  const skipped = p.skippedCount
    ? `<div class="muted small" style="margin-top:6px">Đã loại ${p.skippedCount} gói thiếu giá gói thầu
       hoặc giá trúng — không quy về 0 để tránh kéo tụt mặt bằng.</div>`
    : '';

  $('panel').innerHTML = `
    ${askBar(p)}
    <div class="row space" style="margin-top:14px">
      <div><b>Mặt bằng chung:</b> ${p.overall.n} gói có đủ giá,
        giảm trung vị <b>${pct(p.overall.median)}</b>
        (nửa giữa ${pct(p.overall.q1)} – ${pct(p.overall.q3)})</div>
    </div>
    ${skipped}
    ${priceTable('Theo khoảng giá gói thầu', p.byBand,
      'Gói to và gói nhỏ giảm giá khác nhau, nên phải xem theo từng khoảng.')}
    ${priceTable('Theo hình thức lựa chọn nhà thầu', p.byForm,
      'Chênh lệch giữa các hình thức thường rất rõ — chỉ định thầu gần như không giảm giá, '
      + 'còn đấu thầu rộng rãi giảm sâu hơn. Trộn chung sẽ ra con số không dùng được.')}
    ${priceTable('Theo lĩnh vực', p.byField)}
    ${priceTable('Theo năm phê duyệt', p.byYear, 'Xem mặt bằng đang siết lại hay nới ra theo thời gian.')}
    <div class="caveat" style="margin-top:16px">
      <b>Đọc bảng này thế nào cho đúng</b>
      <div style="margin-top:6px">${esc(SCAN.pricingDisclaimer || '')}</div>
      <div style="margin-top:10px">${esc(SCAN.pricingMethod || '')}</div>
    </div>`;

  for (const id of ['myPrice', 'myField', 'myForm', 'sameBand']) {
    const el = $(id);
    if (el) el.addEventListener(id === 'myPrice' ? 'input' : 'change', refreshReference);
  }
  refreshReference();
}

/* --------------------------------------------------------------------------
 *  SỰ KIỆN
 * ------------------------------------------------------------------------ */

$('go').addEventListener('click', start);
$('ward').addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
$('province').addEventListener('change', loadWards);
$('province').addEventListener('blur', loadWards);
$('stop').addEventListener('click', async () => {
  // Phải gọi ĐÚNG lệnh của tính năng này. Trước đây gọi CANCEL_ACTIVE_RUN —
  // lệnh đó chỉ dừng lượt tìm TBMT, nên bấm Dừng ở đây không có tác dụng gì.
  $('stop').disabled = true;
  $('stop').textContent = '⏳ Đang dừng…';
  clearInterval(POLL);
  POLL = null;
  await send('CANCEL_AREA_SCAN');
  // Không chờ tab báo về: đọc lại trạng thái ngay, background đã chốt sổ rồi.
  await refresh();
  $('stop').disabled = false;
  $('stop').textContent = '⏹ Dừng';
});
$('xlsx').addEventListener('click', async () => {
  const res = await send('EXPORT_AREA_XLSX', {});
  if (res && res.ok === false) alertBox(esc(res.message || 'Không xuất được tệp.'), 'error');
});
for (const b of document.querySelectorAll('.tabs button')) {
  b.addEventListener('click', () => {
    TAB = b.dataset.tab;
    for (const x of document.querySelectorAll('.tabs button')) x.classList.toggle('on', x === b);
    drawPanel();
  });
}

for (const id of ['fromYear', 'toYear', 'minPrice', 'maxPrice', 'online']) {
  $(id).addEventListener('change', refreshFilterNote);
}
for (const x of document.querySelectorAll('.checks input')) {
  x.addEventListener('change', refreshFilterNote);
}
$('clear').addEventListener('click', clearFilters);

/* Khi mở trang: DỌN các lượt còn kẹt "đang chạy" từ phiên trước rồi mới đọc
   trạng thái. Không dọn thì trang vẽ lại thanh tiến trình của một lượt đã
   chết từ đời nào — trông như phần mềm tự động chạy. */
(async () => {
  fillYears();
  refreshFilterNote();
  loadProvinces();
  await send('RECONCILE_LOOKUPS');
  await refresh();
})();
