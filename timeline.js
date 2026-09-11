import { escapeHtml } from './lib/html.js';
const $ = (id) => document.getElementById(id);
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });
const esc = escapeHtml;

async function refresh() {
  const s = await send('GET_STATE');
  $('list').innerHTML = (s.amendmentLog || []).map((r) => `<article class="ws-result">
    <span class="code">${esc(r.notifyNo || r.key)}</span>
    <b>${esc(r.bidName || '')}</b>
    <p class="muted small">${esc(r.at)} · ${esc(r.field)}: ${esc(r.before)} → ${esc(r.after)}</p>
  </article>`).join('') || '<p class="muted">Chưa ghi nhận điều chỉnh.</p>';
  if (s.domRegression) {
    $('dom-box').textContent = s.domRegression.ok === false && s.domRegression.message
      ? s.domRegression.message
      : `DOM: thiếu ${(s.domRegression.miss || []).map((m) => m.group).join(', ') || 'không'} · ${s.domRegression.at || ''}`;
    if (s.domRegression.highlight && $('diff-box')) $('diff-box').innerHTML = s.domRegression.highlight.html || '';
  }
}

async function refreshAudit() {
  const r = await send('FILTER_AUDIT', {
    operator: $('audit-who')?.value,
    from: $('audit-from')?.value,
    to: $('audit-to')?.value,
    key: $('audit-key')?.value
  });
  if ($('audit-list')) {
    $('audit-list').innerHTML = (r.rows || []).slice(0, 80).map((row) =>
      `<p class="muted small">${esc(row.at)} · ${esc(row.operator)} · ${esc(row.kind)} · ${esc(row.key)} · ${esc(row.detail)}</p>`
    ).join('') || '<p class="muted small">Chưa có nhật ký.</p>';
  }
}

$('xlsx').onclick = async () => {
  const r = await send('EXPORT_AMENDMENTS');
  $('alert').textContent = r.ok ? `Đã xuất ${r.count} dòng.` : (r.message || 'Không xuất được.');
  $('alert').className = `notice ${r.ok ? 'ok' : 'error'}`;
};

$('dom').onclick = async () => {
  const r = await send('COMPARE_EGP_DOM');
  $('alert').textContent = r.ok
    ? (r.miss?.length ? `Thiếu: ${r.miss.map((m) => m.group).join(', ')}` : 'Tab e-GP khớp các neo DOM đã biết.')
    : (r.message || 'Không đối chiếu được.');
  $('alert').className = `notice ${r.ok && !r.miss?.length ? 'ok' : 'error'}`;
  refresh();
};

$('audit').onclick = async () => {
  const r = await send('EXPORT_AUDIT');
  $('alert').textContent = r.ok ? `Đã xuất ${r.count} dòng nhật ký.` : (r.message || 'Lỗi');
  $('alert').className = `notice ${r.ok ? 'ok' : 'error'}`;
};
$('pack').onclick = () => send('EXPORT_SYNC_PACK');
$('pack-file').onchange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const pack = JSON.parse(await file.text());
    const r = await send('IMPORT_SYNC_PACK', { pack });
    $('alert').textContent = r.ok ? `Đã nhập ${r.checklistCount} checklist, ${r.decisionCount} quyết định.` : (r.message || 'Lỗi');
    $('alert').className = `notice ${r.ok ? 'ok' : 'error'}`;
  } catch {
    $('alert').textContent = 'Tệp JSON không đọc được.';
    $('alert').className = 'notice error';
  }
};

['audit-who', 'audit-from', 'audit-to', 'audit-key'].forEach((id) => $(id)?.addEventListener('change', refreshAudit));
refresh();
refreshAudit();
