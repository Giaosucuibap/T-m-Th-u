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
    const matrix = contractMatrix(c);
    const sum = matrixSummary(matrix);
    return `<article class="ws-result">
      <b>${esc(c.name)}</b> <span class="code">${esc(c.workType)}</span>
      <p class="muted small">${esc(c.year || '')} · ${esc(c.province || '')} · ${c.price ? Number(c.price).toLocaleString('vi-VN') + ' đ' : ''}</p>
      <p class="${exp.ok ? 'muted small' : 'notice error'}">${esc(exp.text)}</p>
      <p class="muted small">${esc(sum.text)} · ${matrix.map((m) => esc(m.text)).join(' · ')}</p>
      <button type="button" data-del="${esc(c.id)}">Xóa</button>
    </article>`;
  }).join('') || '<p class="muted">Chưa có hợp đồng.</p>';
}

$('parse').onclick = async () => {
  const r = await send('PARSE_HSMT', { text: $('hsmt').value });
  if (!r?.ok) { $('hsmt-out').textContent = r?.message || 'Không đọc được văn bản.'; return; }
  const labels = { similar: 'HĐ tương tự', staff: 'nhân sự', equip: 'thiết bị', finance: 'tài chính' };
  const found = Object.keys(labels).filter((key) => r.hits?.[key]).map((key) => labels[key]);
  $('hsmt-out').textContent = (found.length ? `Văn bản có nhắc: ${found.join(', ')}.` : 'Chưa nhận diện được các mục bằng từ khóa.') + ' Đây chỉ là mục được nhắc, không xác nhận công ty đáp ứng. Các lựa chọn tự rà soát giữ nguyên.';
};

$('save').onclick = async () => {
  const r = await send('SAVE_CONTRACT', {
    name: $('name').value, workType: $('workType').value, price: $('price').value,
    year: $('year').value, province: $('province').value, windowYears: $('windowYears').value,
    gates: {
      similar: $('g-similar').value,
      staff: $('g-staff').value,
      equip: $('g-equip').value,
      finance: $('g-finance').value
    }
  });
  $('alert').textContent = r.ok ? 'Đã lưu.' : (r.message || 'Lỗi');
  $('alert').className = `notice ${r.ok ? 'ok' : 'error'}`;
  if (r.ok) { $('form').reset(); $('hsmt').value = ''; $('hsmt-out').textContent = ''; await refresh(); }
};

$('list').onclick = async (e) => {
  const b = e.target.closest('[data-del]');
  if (!b) return;
  await send('DELETE_CONTRACT', { id: b.dataset.del });
  refresh();
};

refresh();
