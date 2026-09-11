import { escapeHtml } from './lib/html.js';
import { contractExpiryAlert } from './lib/checklist-due.js';
import { contractMatrix, matrixSummary } from './lib/hsmt-matrix.js';

const $ = (id) => document.getElementById(id);
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });
const esc = escapeHtml;

async function refresh() {
  const s = await send('GET_STATE');
  $('list').innerHTML = (s.pastContracts || []).map((c) => {
    const exp = contractExpiryAlert(c);
    const matrix = contractMatrix(c, { workType: c.workType });
    const sum = matrixSummary(matrix);
    return `<article class="ws-result">
      <b>${esc(c.name)}</b> <span class="code">${esc(c.workType)}</span>
      <p class="muted small">${c.year || ''} · ${c.province || ''} · ${c.price ? Number(c.price).toLocaleString('vi-VN') + ' đ' : ''}</p>
      <p class="${exp.ok ? 'muted small' : 'notice error'}">${esc(exp.text)}</p>
      <p class="muted small">${esc(sum.text)} · ${matrix.map((m) => esc(m.text)).join(' · ')}</p>
      <button type="button" data-del="${esc(c.id)}">Xóa</button>
    </article>`;
  }).join('') || '<p class="muted">Chưa có hợp đồng.</p>';
}

$('parse').onclick = async () => {
  const r = await send('PARSE_HSMT', { text: $('hsmt').value });
  if (!r?.ok) return;
  $('g-similar').checked = r.similar === 'dat';
  $('g-staff').checked = r.staff === 'dat';
  $('g-equip').checked = r.equip === 'dat';
  $('g-finance').checked = r.finance === 'dat';
  $('hsmt-out').textContent = 'Gợi ý — hãy xác nhận trước khi lưu.';
};

$('save').onclick = async () => {
  const r = await send('SAVE_CONTRACT', {
    name: $('name').value, workType: $('workType').value, price: $('price').value,
    year: $('year').value, province: $('province').value,
    gates: {
      similar: $('g-similar').checked ? 'dat' : 'thieu',
      staff: $('g-staff').checked ? 'dat' : 'thieu',
      equip: $('g-equip').checked ? 'dat' : 'thieu',
      finance: $('g-finance').checked ? 'dat' : 'thieu'
    }
  });
  $('alert').textContent = r.ok ? 'Đã lưu.' : (r.message || 'Lỗi');
  $('alert').className = `notice ${r.ok ? 'ok' : 'error'}`;
  if (r.ok) { $('name').value = ''; await refresh(); }
};

$('list').onclick = async (e) => {
  const b = e.target.closest('[data-del]');
  if (!b) return;
  await send('DELETE_CONTRACT', { id: b.dataset.del });
  refresh();
};

refresh();
