import { normalizeCapability } from './lib/capability.js';

const $ = (id) => document.getElementById(id);
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });

function fill(cap) {
  const c = normalizeCapability(cap || {});
  $('trades').value = c.trades.join('\n');
  $('equipment').value = c.equipment.join('\n');
  $('staff').value = c.staff.join('\n');
  $('avoidProvinces').value = c.avoidProvinces.join('\n');
  $('maxComfortPrice').value = c.maxComfortPrice || '';
  $('notes').value = c.notes || '';
}

async function load() {
  const s = await send('GET_STATE');
  fill(s?.settings?.capability);
}

$('form').onsubmit = async (e) => {
  e.preventDefault();
  const capability = normalizeCapability({
    trades: $('trades').value,
    equipment: $('equipment').value,
    staff: $('staff').value,
    avoidProvinces: $('avoidProvinces').value,
    maxComfortPrice: $('maxComfortPrice').value,
    notes: $('notes').value
  });
  const r = await send('UPDATE_SETTINGS', { capability });
  $('alert').textContent = r?.ok ? 'Đã lưu hồ sơ năng lực và chấm lại các gói đang lưu.' : (r?.message || 'Chưa lưu được.');
  $('alert').className = `notice ${r?.ok ? 'ok' : 'error'}`;
};

load();
