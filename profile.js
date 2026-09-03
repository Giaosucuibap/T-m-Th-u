/* ============================================================================
 *  profile.js — giao diện "Hồ sơ 360° nhà thầu"
 *
 *  Nguyên tắc trình bày quan trọng nhất: KHÔNG trộn hai nhóm số liệu.
 *  Nhóm đầy đủ (gói đã trúng, hỏi thẳng e-GP theo MST) nằm trong khung xanh.
 *  Nhóm một phần (đã dự / trượt / chưa có kết quả / hủy — chỉ có trong dữ liệu
 *  đã quét) nằm trong khung vàng, kèm cảnh báo. Trộn hai nhóm sẽ tạo ra con số
 *  trông như tỷ lệ trúng thật của nhà thầu mà thực ra không phải.
 *  Lý do kỹ thuật nằm ở đầu tệp lib/profile360.js.
 * ========================================================================== */

const $ = (id) => document.getElementById(id);
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });

let PROFILE = null;
let TAB = 'years';

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

/** Các mã số thuế đã tra gần đây — bấm là dựng hồ sơ ngay. */
/* Lượt tra e-GP đang chạy khi status là RUNNING (theo winners.js — trang
   đang chạy tốt). Kết thúc bằng SUCCESS hoặc ERROR. */
const TRA_DANG_CHAY = 'RUNNING';

async function traMoiTheoMst(taxCode) {
  const r = await send('WINNER_LOOKUP', { taxCode, focusTab: false });
  if (r && r.ok === false) return { ok: false, message: r.message };

  /* Chờ lượt tra xong. Bám đúng tên trạng thái thật; đoán bừa một tên không
     tồn tại thì vòng chờ không bao giờ thoát (đã dính lỗi đó ở nút Dò gói
     trượt). Có trần thời gian để không treo im lặng. */
  const HET_GIO = 180000;
  const t0 = Date.now();
  let lang = 0;
  for (;;) {
    await new Promise((res) => setTimeout(res, 900));
    const st = await send('GET_WINNER_STATE');
    const lk = st && st.lookup;
    if (!lk || lk.focusTaxCode !== taxCode) return { ok: false, message: 'Lượt tra bị thay thế bởi lượt khác.' };
    if (lk.status !== TRA_DANG_CHAY) {
      if (lk.status === 'ERROR') return { ok: false, message: lk.message || 'e-GP không trả kết quả.' };
      return { ok: true };
    }
    const n = (lk.packages || []).length;
    if (n !== lang) { lang = n; }
    $('build-progress').innerHTML =
      `<span class="spin"></span> Đang hỏi e-GP theo mã số thuế… ${n ? `đã lấy ${n} gói` : ''}`;
    if (Date.now() - t0 > HET_GIO) {
      return { ok: false, message: 'Quá 3 phút chưa xong. Hãy mở tab e-GP rồi thử lại.' };
    }
  }
}

async function build() {
  const taxCode = $('mst').value.trim();
  alertBox('', null);
  show($('result'), false);
  show($('xlsx'), false);

  if (!/^\d{10}$/.test(taxCode)) {
    alertBox('Mã số thuế nhà thầu phải đúng 10 chữ số.', 'error');
    return;
  }

  /* LUÔN HỎI LẠI e-GP.
   *
   * Không dùng lại số liệu của lần tra trước, kể cả vừa tra xong một phút.
   * Kết quả lựa chọn nhà thầu được công bố hằng ngày; một hồ sơ dựng từ kho
   * cũ trông y hệt hồ sơ thật nhưng thiếu đúng những gói vừa có kết quả —
   * và người dùng không có cách nào biết. */
  $('go').disabled = true;
  show($('build-progress'), true);
  $('build-progress').innerHTML = '<span class="spin"></span> Đang hỏi e-GP theo mã số thuế…';

  const tra = await traMoiTheoMst(taxCode);
  $('go').disabled = false;
  show($('build-progress'), false);

  if (!tra.ok) {
    alertBox(`<b>Không lấy được dữ liệu mới từ e-GP.</b> ${esc(tra.message || '')}
      <div class="small" style="margin-top:6px">Hồ sơ bên dưới (nếu có) là <b>dữ liệu cũ đã lưu</b>,
      không phải số liệu hôm nay.</div>`, 'error');
  }

  const res = await send('CONTRACTOR_PROFILE', { taxCode });
  if (!res || res.ok === false) {
    alertBox(esc((res && res.message) || 'Không dựng được hồ sơ.'), 'error');
    return;
  }
  PROFILE = res;
  render(res);
  show($('xlsx'), true);
}
/**
 * Nói rõ số liệu này lấy lúc nào.
 *
 * Không có dòng này thì hồ sơ dựng từ kho cũ trông hệt hồ sơ vừa lấy về —
 * đúng chỗ người dùng đã bị đánh lừa: đấu gói hôm qua, mở ra vẫn thấy số của
 * nhiều tuần trước mà không hề biết.
 */
function moTaDoTuoi(f) {
  if (!f) return '';
  const luc = f.at ? new Date(f.at).toLocaleString('vi-VN') : '';
  return f.fresh
    ? ` · <span style="color:#166534;font-weight:800">🟢 Số liệu vừa lấy từ e-GP${luc ? ' lúc ' + esc(luc) : ''}</span>`
    : ` · <span style="color:#b45309;font-weight:800">🟠 DỮ LIỆU CŨ đã lưu${luc ? ' từ ' + esc(luc) : ''} — chưa cập nhật hôm nay</span>`;
}

function render(res) {
  const p = res.profile;
  const w = p.won;
  const s = p.participation;
  show($('result'), true);

  $('p-name').textContent = p.contractorName || '(e-GP không ghi tên)';
  $('p-mst').textContent = p.taxCode;
  $('p-years').innerHTML = (w.years.length
    ? `Hoạt động ${w.years[0].year} – ${w.years[w.years.length - 1].year}` : '')
    + moTaDoTuoi(res.freshness);

  $('note-complete').textContent = res.completeNote || '';
  $('note-partial').textContent = res.partialNote || '';
  $('note-use').textContent = res.useNote || '';

  $('m-won').textContent = w.wonCount;
  $('m-won-sub').textContent = `${w.soloCount} độc lập · ${w.ventureCount} liên danh`;
  $('m-solo').textContent = money(w.soloValue);
  $('m-venture').textContent = w.ventureValue > 0
    ? `Thêm ${money(w.ventureValue)} ở gói liên danh (giá trị cả nhóm)`
    : 'Không có gói liên danh';
  $('m-disc').textContent = pct(w.discount.median);
  $('m-disc-sub').textContent = w.discount.n
    ? `trên ${w.discount.n} gói có đủ giá${w.discount.reliable ? '' : ' — mẫu nhỏ'}`
    : 'chưa đủ dữ liệu giá';
  $('m-scope').textContent = `${w.provinces.length} tỉnh · ${w.entities.length} bên mời thầu`;
  $('m-scope-sub').textContent = w.provinces.length
    ? `Nhiều nhất: ${w.provinces[0].name}` : '—';

  $('s-total').textContent = s.scannedCount;
  $('s-won').textContent = s.won;
  /* CHUA DO thi so 0 khong co nghia. Bao cu hien "Truot: 0" khien nguoi dung
     hieu la nha thau chua tung truot goi nao — trong khi that ra phan mem chua
     bao gio di tim. Hien dau gach cho tot hon mot con so bia. */
  const daDo = Boolean(s.lossScanDone);
  $('s-lost').textContent = daDo ? s.lost : '—';
  $('s-lost').title = daDo ? '' : 'Chưa dò gói trượt — bấm nút bên dưới';
  $('s-pend').textContent = s.unresolved ?? s.pending;
  $('s-cancel').textContent = s.cancelled;
  $('s-rate').innerHTML = s.decidedCount
    ? `Tỷ lệ trúng trong phạm vi đã quét: <b>${esc(s.winRate.text)}</b>
       (${s.won}/${s.decidedCount} gói đã có kết quả)${s.winRate.reliable ? ''
        : ' — <b>cỡ mẫu quá nhỏ, chưa nói lên điều gì</b>'}`
    : 'Chưa quét được gói nào có nhà thầu này dự thầu, nên chưa tính được tỷ lệ trúng.';

  renderLossBox(s);

  drawPanel();
}

const LOSS_LABEL = {
  WON: ['✅ Trúng', 'won'],
  LOST: ['❌ Trượt', 'lost'],
  UNRESOLVED: ['❔ Chưa xác định', 'pend'],
  CANCELLED: ['🚫 Bị hủy', 'cancel']
};

/**
 * Bảng mọi gói đã THẤY nhà thầu dự — trúng lẫn trượt.
 * Đây là thứ người dùng hỏi: không chỉ gói thắng, mà cả gói thua và ai thắng.
 */
function drawJoined(part) {
  const rows = (part && part.rows) || [];
  if (!rows.length) {
    $('panel').innerHTML = '<div class="muted">Chưa quét được gói nào có nhà thầu này dự thầu. '
      + 'Bấm <b>Dò gói đã trượt</b> ở khung vàng phía trên.</div>';
    return;
  }

  /* Ghép thêm dữ liệu của gói ĐÃ TRÚNG: giá trúng, ngày, tỷ lệ giảm.
     Trước đây mọi dòng "Trúng" đều để trống cột giá — trong khi số đó nằm
     ngay trong nhóm dữ liệu đầy đủ ở trên. Bảng trông rỗng một cách vô cớ. */
  const wonBy = new Map();
  for (const p of (PROFILE.profile.won.packages || [])) {
    if (p.notifyNo) wonBy.set(String(p.notifyNo), p);
  }

  const order = { LOST: 0, UNRESOLVED: 1, WON: 2, CANCELLED: 3 };
  const list = rows.slice().sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)
    || String(b.at || '').localeCompare(String(a.at || '')));

  const dem = (st) => rows.filter((r) => r.status === st).length;
  const tongTruot = rows.filter((r) => r.status === 'LOST')
    .reduce((t, r) => t + (Number(r.bidPrice) || 0), 0);

  $('panel').innerHTML = `
    <div class="row space" style="margin-bottom:11px;flex-wrap:wrap;gap:10px">
      <div class="muted small">
        <b>${rows.length}</b> gói đã thấy dự thầu ·
        <span style="color:#166534;font-weight:800">${dem('WON')} trúng</span> ·
        <span style="color:#991b1b;font-weight:800">${dem('LOST')} trượt</span> ·
        ${dem('UNRESOLVED')} chưa xác định · ${dem('CANCELLED')} bị hủy
      </div>
      ${tongTruot ? `<div class="muted small">Tổng giá đã bỏ ở các gói trượt:
        <b>${money(tongTruot)}</b></div>` : ''}
    </div>
    <div style="overflow-x:auto">
    <table>
      <thead><tr>
        <th>Kết quả</th><th>Gói thầu</th><th>Bên mời thầu</th>
        <th class="num">Giá gói thầu</th><th class="num">Giá bỏ / giá trúng</th>
        <th class="num">Hạng</th><th class="num">Năm</th><th>Nguồn</th>
      </tr></thead>
      <tbody>${list.map((r) => {
        const [label, cls] = LOSS_LABEL[r.status] || ['—', ''];
        const w = wonBy.get(String(r.notifyNo));
        const goc = r.packageBasis ?? (w ? w.priceBasis : null);
        const gia = r.status === 'WON'
          ? (w ? w.winningPrice : r.finalPrice)
          : (r.bidPrice ?? r.finalPrice);
        const nam = String(r.at || (w ? (w.decisionDate || '') : '')).slice(0, 4);
        const giam = r.status === 'WON' && w && Number.isFinite(Number(w.discountRate))
          ? `<span class="sub">giảm ${pct(w.discountRate)}</span>` : '';
        return `<tr>
          <td><span class="tag ${cls}">${label}</span></td>
          <td>${esc(r.bidName || (w ? w.bidName : '') || r.notifyNo || '')}
            <span class="sub">${esc(r.notifyNo || '')}</span></td>
          <td>${esc(r.investorName || (w ? w.investorName : '') || '—')}</td>
          <td class="num">${goc ? money(goc) : '—'}</td>
          <td class="num">${gia ? money(gia) : '—'}${giam}</td>
          <td class="num">${r.priceRank ?? '—'}</td>
          <td class="num">${nam || '—'}</td>
          <td>${(r.sourceUrl || (w ? w.detailUrl : ''))
            ? `<a class="link" href="${esc(r.sourceUrl || w.detailUrl)}" target="_blank" rel="noopener">e-GP ↗</a>`
            : '—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
    </div>
    <div class="muted small" style="margin-top:9px;line-height:1.6">
      Chỉ gồm gói phần mềm ĐÃ đọc được bảng nhà thầu, cộng với các gói đã trúng.
      Gói trượt ngoài phạm vi đã dò không có ở đây — xem phần khoanh vùng ở khung vàng.
    </div>`;
}
/** Khung "Dò gói đã trượt": nói rõ đã dò chưa, và sẽ dò ở đâu. */
function renderLossBox(s) {
  const fp = PROFILE.profile.footprint || { provinces: [], entities: [] };
  const daDo = Boolean(s.lossScanDone);
  /* Ba trạng thái khác hẳn nhau, không được nói gộp. */
  if (daDo) {
    $('loss-note').innerHTML =
      `Đã đọc bảng nhà thầu của <b>${s.decidedSeen} gói đã có kết quả</b> có tên nhà thầu này,
       trong đó <b>${s.lost} gói trượt</b>. Dò thêm địa bàn khác sẽ ra thêm.`;
  } else if (s.bbmtSeen) {
    $('loss-note').innerHTML =
      `Đã đọc bảng nhà thầu của <b>${s.bbmtSeen} gói</b>, nhưng <b>chưa gói nào có kết quả</b>
       nên chưa kết luận được gói nào trượt. Bấm dò để tìm trong các gói đã có kết quả.`;
  } else {
    $('loss-note').innerHTML =
      `<b>Chưa dò gói trượt lần nào</b> — ô "Trượt" để trống chứ <b>không phải bằng 0</b>.
       e-GP không cho tìm theo mã số thuế nhà thầu ở giai đoạn mở thầu, nên phải quét
       từng gói <b>đã có kết quả</b> rồi đọc bảng nhà thầu dự.`;
  }
  const provs = fp.provinces.slice(0, 5).map((x) => x.name).join(' · ');
  const coThe = fp.provinces.length;
  $('loss-scope').innerHTML = coThe
    ? `Sẽ dò <b>${fp.provinces.length} tỉnh</b> mà nhà thầu này từng trúng
       (${esc(provs)}${fp.provinces.length > 5 ? `, và ${fp.provinces.length - 5} tỉnh nữa` : ''}),
       năm ${fp.fromYear}–${fp.toYear}, <b>không giới hạn chủ đầu tư</b> — vì gói trượt
       thường là của chủ đầu tư nhà thầu chưa từng trúng.
       Gói trượt ở tỉnh khác thì tick ô <b>Dò toàn quốc</b>.
       Mỗi gói phải mở riêng một lượt đọc bảng nhà thầu nên sẽ mất khá lâu; đừng đóng tab e-GP.`
    : 'Chưa có gói trúng nào để suy ra địa bàn. Tick <b>Dò toàn quốc</b> để dò không cần dấu chân.';
  $('loss-scan').disabled = false;
}

function drawPanel() {
  if (!PROFILE) return;
  const w = PROFILE.profile.won;
  if (TAB === 'years') return drawYears(w);
  if (TAB === 'provinces') return drawTally(w.provinces, 'Tỉnh / Thành phố');
  if (TAB === 'entities') return drawTally(w.entities, 'Bên mời thầu');
  if (TAB === 'joined') return drawJoined(PROFILE.profile.participation);
  return drawPackages(w);
}

function drawYears(w) {
  if (!w.years.length) { $('panel').innerHTML = '<div class="muted">Chưa có dữ liệu theo năm.</div>'; return; }
  const max = Math.max(...w.years.map((y) => y.won));
  $('panel').innerHTML = `
    <table>
      <thead><tr><th>Năm</th><th class="num">Số gói trúng</th><th></th>
        <th class="num">Giá trị trúng</th><th class="num">Giảm giá trung vị</th></tr></thead>
      <tbody>${w.years.map((y) => `
        <tr>
          <td><b>${esc(y.year)}</b></td>
          <td class="num">${y.won}</td>
          <td style="width:38%">
            <div style="height:9px;border-radius:999px;background:#e2e8f0">
              <i style="display:block;height:100%;border-radius:999px;background:var(--accent);
                        width:${Math.round((y.won / max) * 100)}%"></i>
            </div>
          </td>
          <td class="num">${money(y.value)}</td>
          <td class="num">${pct(y.discount.median)}
            <span class="sub">n=${y.discount.n}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function drawTally(rows, title) {
  if (!rows.length) { $('panel').innerHTML = `<div class="muted">Chưa có dữ liệu ${esc(title)}.</div>`; return; }
  $('panel').innerHTML = `
    <table>
      <thead><tr><th>${esc(title)}</th><th class="num">Số gói trúng</th>
        <th class="num">Tổng giá trị</th></tr></thead>
      <tbody>${rows.map((x) => `
        <tr><td>${esc(x.name)}</td><td class="num"><b>${x.count}</b></td>
        <td class="num">${money(x.value)}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="muted small" style="margin-top:10px">
      Giá trị ở đây gồm cả gói liên danh (tính giá trị cả nhóm), nên tổng theo cột này
      có thể lớn hơn "Giá trị trúng độc lập" ở trên.
    </div>`;
}

function drawPackages(w) {
  $('panel').innerHTML = `
    <table>
      <thead><tr>
        <th>Mã TBMT</th><th>Gói thầu</th><th>Bên mời thầu</th>
        <th class="num">Giá gói thầu</th><th class="num">Giá trúng</th><th class="num">Giảm</th><th>Duyệt</th>
      </tr></thead>
      <tbody>${w.packages.map((p) => `
        <tr>
          <td class="num"><a class="link" href="${esc(p.detailUrl)}" target="_blank" rel="noopener"
              >${esc(p.notifyNoStand)} ↗</a>
            ${p.isVenture ? '<span class="sub"><span class="tag tag-v">Liên danh</span></span>' : ''}</td>
          <td>${esc(p.bidName)}
            <span class="sub">${esc([p.fieldLabel, p.bidFormLabel, p.location].filter(Boolean).join(' · '))}</span></td>
          <td>${esc(p.procuringEntityName || p.investorName || '')}</td>
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

$('go').addEventListener('click', build);
$('mst').addEventListener('keydown', (e) => { if (e.key === 'Enter') build(); });
$('xlsx').addEventListener('click', async () => {
  const res = await send('EXPORT_PROFILE_XLSX', { taxCode: $('mst').value.trim() });
  if (res && res.ok === false) alertBox(esc(res.message || 'Không xuất được tệp.'), 'error');
});
for (const b of document.querySelectorAll('.tabs button')) {
  b.addEventListener('click', () => {
    TAB = b.dataset.tab;
    for (const x of document.querySelectorAll('.tabs button')) x.classList.toggle('on', x === b);
    drawPanel();
  });
}



/* ==========================================================================
 *  DÒ GÓI TRƯỢT
 *
 *  Dùng lại đúng bộ máy quét biên bản mở thầu của mục "Gói đang chờ kết quả",
 *  chỉ khác một điểm quyết định: nhắm vào gói ĐÃ CÓ KẾT QUẢ (bước 4) thay vì
 *  gói đang chờ. Gói đang chờ thì theo định nghĩa chưa ai trượt cả — quét ở đó
 *  bao nhiêu lần cũng không ra gói trượt nào.
 *
 *  Quét lần lượt từng tỉnh trong dấu chân, vì e-GP chặn 10.000 kết quả mỗi
 *  truy vấn; gộp cả nước vào một lượt là mất phần đuôi mà không hề báo.
 * ======================================================================== */

let LOSS_QUEUE = [];
let LOSS_RUNNING = false;
let LOSS_STALL = 0;
let LOSS_SCOPE_ALL = false;

/** Toàn bộ tỉnh/thành hiện hành, lấy từ e-GP (đã cache 30 ngày). */
async function tatCaTinh() {
  const r = await send('AREA_OPTIONS', {});
  const list = (r && r.provinces) || [];
  return list.map((x) => (typeof x === 'string' ? x : x.name)).filter(Boolean);
}

async function pollLossScan() {
  const st = await send('GET_STATE');
  return (st && st.bidOpenScan) || null;
}

async function runLossScan() {
  const fp = PROFILE && PROFILE.profile.footprint;
  if (!fp || !fp.provinces.length) return;
  const taxCode = $('mst').value.trim();
  LOSS_SCOPE_ALL = $('loss-all').checked;

  /* QUÉT THEO ĐỊA BÀN, KHÔNG PHẢI THEO DANH SÁCH BÊN MỜI THẦU ĐÃ TRÚNG.
   *
   * Bản trước tôi khoanh vùng theo 16 bên mời thầu mà nhà thầu ĐÃ TỪNG TRÚNG.
   * Sai ở chỗ căn bản: nhà thầu dự thầu của rất nhiều chủ đầu tư khác nhau,
   * và những gói họ TRƯỢT thường là của chủ đầu tư họ CHƯA từng trúng — tức
   * là đúng phần mà cách khoanh vùng đó loại ra. Càng dò càng chỉ khẳng định
   * lại những gì đã biết.
   *
   * Quét theo tỉnh thì bao được mọi chủ đầu tư trong tỉnh đó. Chậm hơn, nhưng
   * chậm mà đúng còn hơn nhanh mà không thể tìm ra thứ cần tìm.
   */
  LOSS_QUEUE = (LOSS_SCOPE_ALL ? (await tatCaTinh()) : fp.provinces.map((x) => x.name));
  const theoBenMoiThau = false;
  LOSS_RUNNING = true;
  $('loss-scan').classList.add('hidden');
  $('loss-stop').classList.remove('hidden');
  show($('loss-progress'), true);

  let done = 0;
  let thatBai = 0;
  for (const muc of LOSS_QUEUE) {
    if (!LOSS_RUNNING) break;
    done += 1;
    LOSS_STALL = 0;
    $('loss-progress').innerHTML =
      `Đang dò <b>${esc(muc)}</b> (${done}/${LOSS_QUEUE.length})…`;

    const r = await send('BID_OPEN_SCAN', {
      mode: 'loss',
      taxCode,
      investor: theoBenMoiThau ? muc : '',
      province: theoBenMoiThau ? '' : muc,
      fromYear: fp.fromYear,
      toYear: fp.toYear,
      maxPackages: 200,
      focusTab: false
    });
    if (r && r.ok === false) {
      /* Một bên mời thầu hỏng thì bỏ qua, đừng dừng cả lượt — người dùng chờ
         nãy giờ mà mất trắng vì một lỗi lẻ là tệ nhất. */
      thatBai += 1;
      $('loss-progress').innerHTML =
        `⚠️ Bỏ qua <b>${esc(muc)}</b>: ${esc(r.message || 'không dò được')}`;
      if (thatBai >= 3) {
        $('loss-progress').innerHTML =
          '⚠️ Ba lượt liên tiếp không dò được. Hãy mở e-GP rồi thử lại.';
        break;
      }
      continue;
    }
    thatBai = 0;
    /* Chờ lượt quét tỉnh này xong rồi mới sang tỉnh kế.
     *
     * "Đang chạy" là LISTING hoặc SCANNING — lấy đúng theo bidopen.js, trang
     * đang chạy tốt. Bản đầu tôi chờ status === 'DONE', một trạng thái KHÔNG
     * TỒN TẠI (lượt quét kết thúc bằng 'SUCCESS'), nên vòng chờ không bao giờ
     * thoát: trang treo vĩnh viễn ở tỉnh đầu tiên và người dùng thấy "bấm dò
     * không được".
     */
    const DANG_CHAY = new Set(['LISTING', 'SCANNING']);
    let lang = 0;
    for (;;) {
      if (!LOSS_RUNNING) break;
      await new Promise((res) => setTimeout(res, 1200));
      const scan = await pollLossScan();
      if (!scan) break;
      if (!DANG_CHAY.has(scan.status) || scan.cancelled) break;

      const tong = Number(scan.totalCandidates || 0);
      const xong = Number(scan.scannedCount || 0);
      $('loss-progress').innerHTML =
        `Đang dò <b>${esc(muc)}</b> (${done}/${LOSS_QUEUE.length})`
        + (tong ? ` — đọc bảng nhà thầu ${xong}/${tong} gói` : ' — đang lấy danh sách gói…');

      /* Lưới an toàn: nếu số gói đã đọc đứng yên quá lâu thì bỏ tỉnh này chứ
         không đứng chờ mãi. Thà báo "bỏ qua" còn hơn treo im lặng. */
      if (xong === lang) {
        if (++LOSS_STALL > 150) {                 // ~3 phút không nhúc nhích
          $('loss-progress').innerHTML =
            `⚠️ ${esc(muc)} không tiến triển, bỏ qua để sang mục kế.`;
          await send('CANCEL_BID_OPEN_SCAN');
          break;
        }
      } else { LOSS_STALL = 0; lang = xong; }
    }
  }

  LOSS_RUNNING = false;
  $('loss-scan').classList.remove('hidden');
  $('loss-stop').classList.add('hidden');
  $('loss-progress').innerHTML = 'Đã dò xong. Đang dựng lại hồ sơ…';
  await build();                        // dựng lại hồ sơ với dữ liệu vừa thu
  show($('loss-progress'), false);
}

$('loss-scan').addEventListener('click', runLossScan);
$('loss-stop').addEventListener('click', async () => {
  LOSS_RUNNING = false;
  await send('CANCEL_BID_OPEN_SCAN');
  $('loss-progress').innerHTML = 'Đã dừng theo yêu cầu.';
});
