/* ============================================================================
 *  HỒ SƠ QUYẾT ĐỊNH GÓI THẦU (4.22.0)
 *
 *  Một trang cho một gói: thông tin gói · bối cảnh cạnh tranh theo lịch sử của chủ đầu tư
 *  (lib/competition.js) · yêu cầu E-HSMT do trợ lý AI của người dùng đọc, đối chiếu với năng
 *  lực công ty (lib/hsmt-ai.js) · quyết định hiện tại. Nút "In / Lưu PDF" trên thanh tiêu đề
 *  biến trang này thành tờ trình dự thầu.
 *
 *  Trang chỉ đọc kho và hiển thị; hai thao tác ghi là lưu / xoá bản đọc E-HSMT và thêm một
 *  nhà thầu vào danh sách theo dõi.
 * ========================================================================== */
import { escapeHtml } from './lib/html.js';
import { formatMoney, formatDate, BID_STATUS_LABEL } from './lib/core.js';
import { statusOf, normalizeDecisionState, DECISION_STATE_LABEL, fold as foldText } from './lib/decision.js';
import { deadlineInfo } from './lib/workspace.js';
import { competitionBrief, competitionLines, COMPETITION_NOTE } from './lib/competition.js';
import { buildHsmtPrompt, matchRequirements, HSMT_GROUPS, HSMT_TERM_LABEL, MATCH_STATUS, HSMT_AI_NOTE } from './lib/hsmt-ai.js';
import { rivalTax } from './lib/rival-watch.js';

const $ = (id) => document.getElementById(id);
const esc = escapeHtml;
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });
const show = (id, on) => $(id).classList.toggle('hidden', !on);
const key = new URL(location.href).searchParams.get('key') || '';
const vnDate = (value) => { const t = Date.parse(value || ''); if (!Number.isFinite(t)) return ''; const d = new Date(t + 7 * 3600_000); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };
const vnDateTime = (value) => { const t = Date.parse(value || ''); if (!Number.isFinite(t)) return ''; const d = new Date(t + 7 * 3600_000); return `${vnDate(value)} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const num = (n) => String(n).replace('.', ',');
const egpUrl = (t) => { const u = String(t.detailUrl || t.sourcePageUrl || ''); return /^https:\/\/muasamcong\.(?:mof|mpi)\.gov\.vn\//i.test(u) ? u : ''; };

let state = null, tender = null, entry = null, watched = new Set();

function fail(message) { $('alert').textContent = message; $('alert').className = 'notice error'; }

/* --------------------------------------------------------------------- CHỌN GÓI --- */
function renderPicker() {
  const q = foldText($('picker-q').value || '');
  const rows = (state.tenders || []).filter((t) => t && t.key && (!q || foldText(`${t.bidName} ${t.notifyNo} ${t.investorName}`).includes(q)))
    .sort((a, b) => Number(Boolean(b.watchlisted)) - Number(Boolean(a.watchlisted)) || Number(b.score || 0) - Number(a.score || 0)).slice(0, 40);
  $('picker-list').innerHTML = rows.map((t) => `<a class="brief-pick" href="brief.html?key=${encodeURIComponent(t.key)}">
      <b>${esc(t.bidName || t.notifyNo)}</b>
      <span class="muted small">${esc(t.displayCode || t.notifyNo || '')} · ${esc(t.investorName || 'Chưa rõ chủ đầu tư')} · ${esc(formatMoney(t.price))}${t.watchlisted ? ' · ★ đang theo dõi' : ''}</span>
    </a>`).join('') || '<p class="muted">Kho chưa có gói nào khớp. Tìm gói ở màn hình Tìm gói thầu trước.</p>';
}

/* ------------------------------------------------------------------- THÔNG TIN GÓI --- */
function renderHead() {
  const status = statusOf(tender);
  const dl = deadlineInfo(tender);
  const decision = normalizeDecisionState(tender.decisionState);
  const url = egpUrl(tender);
  $('head').innerHTML = `
    <div class="brief-kicker">${esc(tender.displayCode || tender.notifyNo || '')} · ${esc(BID_STATUS_LABEL[status] || status)}</div>
    <h1 class="brief-title">${esc(tender.bidName || tender.notifyNo)}</h1>
    <dl class="brief-facts">
      <div><dt>Chủ đầu tư</dt><dd>${esc(tender.investorName || tender.procuringEntityName || 'Chưa xác định')}</dd></div>
      <div><dt>Giá gói thầu</dt><dd>${esc(formatMoney(tender.price))}</dd></div>
      <div><dt>Đóng thầu</dt><dd>${tender.closeDate ? `${esc(formatDate(tender.closeDate))}${dl?.label ? ` <span class="muted">(${esc(dl.label)})</span>` : ''}` : 'Chưa có ngày'}</dd></div>
      <div><dt>Địa điểm</dt><dd>${esc(tender.location || 'Chưa xác định')}</dd></div>
      <div><dt>Điểm phù hợp</dt><dd>${Number(tender.score || 0)}/100 <span class="muted">(không phải xác suất trúng thầu)</span></dd></div>
      <div><dt>Quyết định hiện tại</dt><dd>${esc(DECISION_STATE_LABEL[decision] || decision)}${tender.decisionOwner ? ` · phụ trách: ${esc(tender.decisionOwner)}` : ''}</dd></div>
    </dl>
    ${tender.decisionNote ? `<p class="brief-note"><b>Ghi chú nội bộ:</b> ${esc(tender.decisionNote)}</p>` : ''}
    <div class="brief-actions no-print">
      ${url ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Mở gói trên e-GP</a>` : ''}
      <a class="btn light" href="checklist.html?key=${encodeURIComponent(tender.key)}">Checklist hồ sơ</a>
      <a class="btn light" href="dashboard.html">Đổi quyết định ở Kho gói</a>
    </div>`;
  show('head', true);
}

/* ------------------------------------------------------------------- CẠNH TRANH --- */
function renderCompetition() {
  const cap = state.settings?.capability || {};
  const brief = competitionBrief({ tender, observations: state.observations || [], ownTaxCode: cap.taxCode });
  const tile = (label, value, sub) => `<div class="brief-tile"><span>${esc(label)}</span><b>${value}</b><small>${esc(sub)}</small></div>`;
  const tiles = brief.level === 'khong' ? '' : `<div class="brief-tiles">
      ${tile('Gói của chủ đầu tư này trong kho', brief.packages, brief.period ? `năm ${brief.period.from}${brief.period.to !== brief.period.from ? `–${brief.period.to}` : ''}` : '')}
      ${tile('Nhà thầu dự một gói (trung vị)', brief.bidders.reliable ? num(brief.bidders.median) : '—', brief.bidders.n ? `${brief.bidders.n} gói có biên bản mở thầu${brief.bidders.reliable ? '' : ' · chưa đủ mẫu'}` : 'chưa đọc biên bản mở thầu nào')}
      ${tile('Gói chỉ một nhà thầu dự', brief.bidders.singleShare !== null ? `${num(brief.bidders.singleShare)}%` : '—', brief.bidders.n ? `${brief.bidders.single}/${brief.bidders.n} gói` : '')}
      ${tile('Người trúng giảm giá (trung vị)', brief.discount.reliable ? `${num(brief.discount.median)}%` : '—', brief.discount.n ? `${brief.discount.n} gói có kết quả${brief.discount.reliable ? '' : ' · chưa đủ mẫu'}` : 'chưa có kết quả nào')}
    </div>`;
  const firms = brief.frequent.length ? `<h3>Nhà thầu hay gặp ở chủ đầu tư này</h3>
    <div class="brief-table-wrap"><table class="brief-table"><thead><tr><th>Nhà thầu</th><th>Số gói có mặt</th><th>Số gói trúng</th><th>Lần gần nhất</th><th class="no-print"></th></tr></thead><tbody>
    ${brief.frequent.map((f) => { const tax = rivalTax(f.taxCode); return `<tr><td data-label="Nhà thầu"><b>${esc(f.name)}</b>${f.taxCode ? ` <span class="code">${esc(f.taxCode)}</span>` : ''}</td><td data-label="Số gói có mặt">${f.packages}</td><td data-label="Số gói trúng">${f.wins}</td><td data-label="Lần gần nhất">${esc(vnDate(f.lastAt) || '—')}</td>
      <td class="no-print">${!tax ? '' : watched.has(tax) ? '<span class="tag good">Đang theo dõi</span>' : `<button class="btn light sm" type="button" data-watch-tax="${esc(tax)}" data-watch-name="${esc(f.name)}">Theo dõi</button>`}</td></tr>`; }).join('')}
    </tbody></table></div>` : '';
  $('competition').innerHTML = `<h2 id="comp-title">Cạnh tranh theo lịch sử</h2>
    ${tiles}
    <ul class="brief-lines">${competitionLines(brief).map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
    ${firms}
    ${cap.taxCode ? '' : '<p class="muted small no-print">Muốn có dòng “công ty mình đã dự / trúng bao nhiêu gói của chủ đầu tư này”, ghi mã số thuế công ty ở màn hình <a href="capability.html">Năng lực công ty</a>.</p>'}
    <p class="muted small brief-foot">${esc(COMPETITION_NOTE)}</p>`;
  show('competition', true);
}

/* ------------------------------------------------------------- E-HSMT ↔ NĂNG LỰC --- */
function matrixHtml(read) {
  const result = matchRequirements(read, { capability: state.settings?.capability || {}, contracts: state.pastContracts || [], tender });
  const s = result.summary;
  const groups = HSMT_GROUPS.map((g) => {
    const rows = result.rows.filter((r) => r.group === g.id);
    if (!rows.length) return '';
    return `<h4 class="brief-group">${esc(g.label)} <span class="count-pill">${rows.length}</span></h4>
      <div class="brief-table-wrap"><table class="brief-table matrix"><thead><tr><th>Yêu cầu trong E-HSMT</th><th>Công ty (theo số đã khai)</th><th>Kết quả</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="st-${esc(r.status)}">
        <td data-label="Yêu cầu"><b>${esc(r.text)}</b>${r.quote ? `<blockquote>“${esc(r.quote)}”</blockquote>` : '<div class="muted small">AI không đưa câu trích.</div>'}${r.ref ? `<div class="muted small">Vị trí: ${esc(r.ref)}</div>` : ''}</td>
        <td data-label="Công ty">${esc(r.company)}</td>
        <td data-label="Kết quả"><span class="tag ${MATCH_STATUS[r.status].tone}">${esc(MATCH_STATUS[r.status].label)}</span>${r.note ? `<div class="small">${esc(r.note)}</div>` : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
  }).join('');
  return `<div class="brief-tiles">
      <div class="brief-tile good"><span>Đủ theo số đã khai</span><b>${s.dat}</b><small>trên ${s.total} yêu cầu</small></div>
      <div class="brief-tile bad"><span>Thiếu so với yêu cầu</span><b>${s.thieu}</b><small>cần bổ sung hoặc liên danh</small></div>
      <div class="brief-tile info"><span>Tự đối chiếu chi tiết</span><b>${s.tu}</b><small>có dữ liệu, cần người đọc</small></div>
      <div class="brief-tile warn"><span>Chưa có dữ liệu để so</span><b>${s.chua}</b><small>khai thêm ở Năng lực công ty</small></div>
    </div>${groups || '<p class="muted">Bản đọc không có yêu cầu năng lực nào.</p>'}`;
}

function quoteList(title, rows, label = (r) => '') {
  if (!rows?.length) return '';
  return `<h4 class="brief-group">${esc(title)}</h4><ul class="brief-quotes">${rows.map((r) => `<li>${label(r)}<b>${esc(r.text)}</b>${r.quote ? `<blockquote>“${esc(r.quote)}”</blockquote>` : ''}${r.ref ? `<div class="muted small">Vị trí: ${esc(r.ref)}</div>` : ''}</li>`).join('')}</ul>`;
}

function readHtml() {
  const read = entry.read;
  const facts = [
    read.durationDays ? `<div><dt>Thời gian thực hiện</dt><dd>${read.durationDays} ngày</dd></div>` : '',
    read.validityDays ? `<div><dt>Hiệu lực hồ sơ dự thầu</dt><dd>${read.validityDays} ngày</dd></div>` : '',
    read.bond.value ? `<div><dt>Bảo đảm dự thầu</dt><dd>${esc(formatMoney(read.bond.value))}${read.bond.form ? ` · ${esc(read.bond.form)}` : ''}${read.bond.validityDays ? ` · hiệu lực ${read.bond.validityDays} ngày` : ''}${read.bond.quote ? `<blockquote>“${esc(read.bond.quote)}”</blockquote>` : ''}${read.bond.ref ? `<div class="muted small">Vị trí: ${esc(read.bond.ref)}</div>` : ''}</dd></div>` : ''
  ].filter(Boolean).join('');
  return `<p class="muted small">Bản đọc lưu lúc ${esc(vnDateTime(entry.savedAt))} (giờ VN)${entry.source ? ` · trợ lý: ${esc(entry.source)}` : ''}.</p>
    ${read.summary ? `<p class="brief-summary">${esc(read.summary)}</p>` : ''}
    ${facts ? `<dl class="brief-facts">${facts}</dl>` : ''}
    <h3>Yêu cầu E-HSMT ↔ năng lực công ty</h3>
    ${matrixHtml(read)}
    ${quoteList('Điều khoản hợp đồng đáng chú ý', read.terms, (r) => `<span class="tag">${esc(HSMT_TERM_LABEL[r.kind] || 'Khác')}</span> `)}
    ${quoteList('Tiêu chí đánh giá', read.criteria)}
    ${read.risks.length ? `<h4 class="brief-group">Điểm cần lưu ý (theo AI)</h4><ul class="brief-lines">${read.risks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${read.unclear.length ? `<h4 class="brief-group">Chưa rõ — AI không tìm thấy trong hồ sơ</h4><ul class="brief-lines">${read.unclear.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <p class="notice brief-foot">${esc(HSMT_AI_NOTE)}</p>`;
}

function renderHsmt(message = '', warnings = []) {
  const url = egpUrl(tender);
  const steps = `<ol class="brief-steps no-print">
      <li><b>Tải E-HSMT về máy.</b> ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">Mở gói trên e-GP</a> rồi tải các tệp hồ sơ mời thầu (trên iPad: tệp nằm trong ứng dụng Tệp).` : 'Mở gói trên e-GP rồi tải các tệp hồ sơ mời thầu.'}</li>
      <li><b>Chép câu lệnh</b> rồi dán vào ChatGPT, Gemini hoặc Claude của bạn, <b>đính kèm các tệp E-HSMT</b> vừa tải.
        <div class="brief-row"><button class="btn" type="button" id="copy-prompt">Chép câu lệnh</button><span id="copy-msg" class="small" role="status"></span></div>
        <details class="brief-prompt"><summary>Xem câu lệnh</summary><textarea id="prompt-text" rows="10" readonly></textarea></details></li>
      <li><b>Dán câu trả lời của AI</b> vào đây rồi bấm lập bảng.
        <textarea id="answer" rows="7" placeholder="Dán toàn bộ câu trả lời của trợ lý AI (khối json)…" aria-label="Câu trả lời của trợ lý AI"></textarea>
        <div class="brief-row"><label for="source" class="small">Trợ lý đã dùng</label><select id="source"><option>ChatGPT</option><option>Gemini</option><option>Claude</option><option>Khác</option></select>
          <button class="btn" type="button" id="save-read">Lập bảng đối chiếu</button>${entry ? '<button class="btn light" type="button" id="delete-read">Xoá bản đọc</button>' : ''}</div>
        <div id="read-msg" class="small" role="status"></div></li>
    </ol>`;
  $('hsmt').innerHTML = `<h2 id="hsmt-title">Đọc E-HSMT bằng AI · đối chiếu năng lực</h2>
    <p class="muted small no-print">Phần mềm không tự gửi hồ sơ đi đâu và không cần khoá API: bạn dùng chính trợ lý AI của mình, phần mềm chỉ soạn câu lệnh, đọc câu trả lời và so với số liệu công ty đã khai.</p>
    ${entry ? readHtml() : '<p class="muted print-only-note">Chưa có bản đọc E-HSMT cho gói này.</p>'}
    ${entry ? `<details class="brief-redo no-print"><summary>Đọc lại bằng câu trả lời khác</summary>${steps}</details>` : steps}`;
  $('prompt-text').value = buildHsmtPrompt(tender);
  if (message) { $('read-msg').textContent = message; $('read-msg').className = 'small danger-text'; }
  if (warnings.length) {
    const box = document.createElement('div'); box.className = 'notice warn no-print';
    box.innerHTML = `<b>Lưu ý khi dùng bản đọc này</b><ul class="brief-lines">${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`;
    ($('hsmt').querySelector('h2 + p') || $('hsmt').querySelector('h2')).after(box);
  }
  $('copy-prompt').addEventListener('click', copyPrompt);
  $('save-read').addEventListener('click', saveRead);
  $('delete-read')?.addEventListener('click', deleteRead);
  show('hsmt', true);
}

async function copyPrompt() {
  const text = buildHsmtPrompt(tender), msg = $('copy-msg');
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch { /* thử cách cũ */ }
  if (!ok) {
    try { $('prompt-text').closest('details').open = true; $('prompt-text').focus(); $('prompt-text').select(); ok = document.execCommand('copy'); } catch { ok = false; }
  }
  msg.textContent = ok ? 'Đã chép. Mở trợ lý AI, dán câu lệnh và đính kèm các tệp E-HSMT.' : 'Chưa chép tự động được — câu lệnh đã mở bên dưới, hãy chạm giữ để chọn tất cả rồi chép.';
  msg.className = `small ${ok ? 'ok-text' : 'danger-text'}`;
}

async function saveRead() {
  const answer = $('answer').value;
  $('save-read').disabled = true;
  const r = await send('SAVE_HSMT_READ', { key: tender.key, answer, source: $('source').value }).catch((e) => ({ ok: false, message: String(e?.message || e) }));
  if (!r?.ok) { $('save-read').disabled = false; $('read-msg').textContent = r?.message || 'Chưa đọc được câu trả lời.'; $('read-msg').className = 'small danger-text'; return; }
  entry = r.entry;
  renderHsmt('', r.warnings || []);
  $('hsmt').scrollIntoView({ block: 'start' });
}

async function deleteRead() {
  if (!confirm('Xoá bản đọc E-HSMT của gói này? Bảng đối chiếu sẽ mất; dán lại câu trả lời của AI là có lại.')) return;
  const r = await send('DELETE_HSMT_READ', { key: tender.key });
  if (r?.ok) { entry = null; renderHsmt(); }
}

/* ------------------------------------------------------------------------- KHỞI ĐỘNG --- */
async function init() {
  state = await send('GET_STATE').catch(() => null);
  if (!state?.ok) { fail('Chưa đọc được kho. Thử tải lại trang.'); return; }
  if (!key) {
    show('picker', true); renderPicker();
    $('picker-q').addEventListener('input', renderPicker);
    return;
  }
  tender = (state.tenders || []).find((t) => t.key === key) || null;
  if (!tender) { fail('Không tìm thấy gói này trong kho (có thể đã bị xoá). Chọn gói khác bên dưới.'); show('picker', true); renderPicker(); $('picker-q').addEventListener('input', renderPicker); return; }
  document.title = `${tender.bidName || tender.notifyNo} — Hồ sơ quyết định`;
  const [read, watch] = await Promise.all([send('GET_HSMT_READ', { key }).catch(() => null), send('GET_RIVAL_WATCH').catch(() => null)]);
  entry = read?.ok ? read.entry : null;
  watched = new Set((watch?.rivals || []).map((r) => r.taxCode));
  renderHead(); renderCompetition(); renderHsmt();
}

$('competition').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-watch-tax]');
  if (!button) return;
  button.disabled = true;
  const r = await send('SAVE_RIVAL_WATCH', { taxCode: button.dataset.watchTax, name: button.dataset.watchName });
  if (r?.ok) { watched.add(button.dataset.watchTax); renderCompetition(); } else { button.disabled = false; alert(r?.message || 'Chưa thêm được vào danh sách theo dõi.'); }
});

init();
