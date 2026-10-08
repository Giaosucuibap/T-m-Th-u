import { initInvestorInput, readInvestorInput } from './investor-input.js';
import { TENDER_CATEGORIES, categoryLabel } from './lib/tender-categories.js';
import { escapeHtml } from './lib/html.js';
import { huntLabel } from './lib/hunts.js';
import { createWardPicker } from './ward-picker.js';

const $ = (id) => document.getElementById(id);
initInvestorInput($('investor'));
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });
const esc = escapeHtml;

/** Trạng thái quét nhanh — nói thật: đang bật, đã kiểm chứng, hay đã tự tắt vì sao. */
export function deltaLine(h) {
  if (!h || h.kind !== 'tbmt' || !h.delta) return '';
  const st = h.deltaState || {};
  const t = (v) => v ? new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'chưa có';
  if (st.broken) return `<p class="small" style="color:var(--danger,#b42318)"><b>Quét nhanh đã TỰ TẮT:</b> ${esc(st.brokenReason || '')}</p>`;
  return `<p class="muted small">Quét nhanh: ${st.proven ? 'bộ lọc ngày đăng đã được kiểm chứng trên máy này' : 'chưa kiểm chứng — lượt nhanh trả 0 gói sẽ được quét đầy đủ lại ngay'} · quét đầy đủ gần nhất: ${esc(t(st.lastFullAt))} · ${st.fullRuns || 0} lượt đầy đủ, ${st.deltaRuns || 0} lượt nhanh</p>`;
}
const wardPicker=createWardPicker({send,province:$('province'),ward:$('ward'),list:$('ward-list'),hint:$('ward-hint'),investor:$('investor')});
$('province').addEventListener('change',()=>{wardPicker.clear();wardPicker.load();});

$('category').innerHTML = TENDER_CATEGORIES.map((c) => `<option value="${esc(c.value)}">${esc(c.label)}</option>`).join('');

function setNotice(id, message, kind = '') {
  const el = $(id);
  el.textContent = message || '';
  el.className = `notice ${kind}${message ? '' : ' hidden'}`;
}

function formCriteria() {
  const areaCriteria=wardPicker.read();
  return {
    investor: $('investor').value,
    province: $('province').value,
    ...areaCriteria,
    keyword: $('keyword').value,
    mustKeywords: $('mustKeywords').value,
    excludeKeywords: $('excludeKeywords').value,
    minPrice: $('minPrice').value,
    maxPrice: $('maxPrice').value,
    category: $('category').value
  };
}

function fillHunt(h) {
  $('hunt-id').value = h?.id || '';
  $('name').value = h?.name || '';
  $('kind').value = h?.kind || 'tbmt';
  $('enabled').checked = h ? h.enabled !== false : true;
  $('telegram').checked = Boolean(h?.telegram);
  $('delta').checked = Boolean(h?.delta);
  if ($('telegramChatId')) $('telegramChatId').value = h?.telegramChatId || '';
  $('times').value = (h?.times || ['06:05']).join(', ');
  const c = h?.criteria || {};
  wardPicker.set(c.wardIdentities);
  for (const key of ['investor', 'province', 'ward', 'keyword', 'mustKeywords', 'excludeKeywords', 'minPrice', 'maxPrice', 'category']) {
    if ($(key)) $(key).value = c[key] ?? '';
  }
  wardPicker.load();
}

async function refresh() {
  const s = await send('GET_STATE');
  if (!s?.ok) { setNotice('alert', s?.message || 'Không đọc được trạng thái.', 'error'); return; }
  if (s.schemaHealth && s.schemaHealth.ok === false) {
    setNotice('schema', 'Schema e-GP vừa qua thiếu trường quen thuộc. Kết quả săn có thể thiếu; đối chiếu trực tiếp trên cổng.', 'error');
  } else setNotice('schema', '');
  $('hunt-list').innerHTML = (s.hunts || []).map((h) => `<article class="ws-result">
    <div class="ws-result-top"><b>${esc(h.name)}</b><span class="code">${esc(h.kind === 'plan' ? 'KHLCNT' : 'TBMT')}</span></div>
    <p class="muted small">${esc(huntLabel(h))}${h.criteria?.investor?`<br>Chủ đầu tư: ${esc(h.criteria.investor)}`:''}<br>Giờ: ${esc((h.times || []).join(', '))} · ${h.enabled ? 'Đang bật' : 'Đang tắt'} · ${h.telegram ? 'Có Telegram' : 'Không Telegram'}</p>
    ${deltaLine(h)}
    <p class="muted small">${h.lastRunAt ? `Lần chạy gần nhất: ${esc(h.lastRunAt)} · ${esc(h.lastStatus || '')} ${esc(h.lastMessage || '')}` : 'Chưa chạy'}</p>
    <div class="result-links">
      <button type="button" data-edit="${esc(h.id)}">Sửa</button>
      <button type="button" data-run="${esc(h.id)}">Chạy ngay</button>
      ${h.delta && h.deltaState?.broken ? `<button type="button" data-delta-reset="${esc(h.id)}" title="Xóa kết luận cũ và kiểm chứng lại từ đầu">Thử lại quét nhanh</button>` : ''}
      <button type="button" data-del="${esc(h.id)}">Xóa</button>
    </div>
  </article>`).join('') || '<p class="muted">Chưa có bộ săn.</p>';
  $('watch-list').innerHTML = (s.watchedInvestors || []).map((w) => `<div class="ws-result" style="margin-top:8px">
    <b>${esc(w.name)}</b> ${w.taxCode ? `<span class="code">${esc(w.taxCode)}</span>` : ''}
    <button type="button" data-unwatch="${esc(w.id)}" class="btn light" style="margin-left:8px">Bỏ theo dõi</button>
  </div>`).join('') || '<p class="muted">Chưa theo dõi đơn vị nào.</p>';
  window.__hunts = s.hunts || [];
}

$('hunt-form').onsubmit = async (e) => {
  e.preventDefault();
  const criteria=formCriteria();
  if(!$('ward').checkValidity()){$('ward').reportValidity();return;}
  if(!readInvestorInput($('investor')))return;
  criteria.investor=$('investor').value;
  const r = await send('SAVE_HUNT', {
    id: $('hunt-id').value,
    name: $('name').value,
    kind: $('kind').value,
    enabled: $('enabled').checked,
    telegram: $('telegram').checked,
    delta: $('delta').checked && $('kind').value === 'tbmt',
    telegramChatId: $('telegramChatId') ? $('telegramChatId').value : '',
    times: $('times').value,
    criteria
  });
  if (!r?.ok) { setNotice('alert', r?.message || 'Chưa lưu được bộ săn.', 'error'); return; }
  setNotice('alert', 'Đã lưu bộ săn và đăng ký lịch Chrome.', 'ok');
  fillHunt(null);
  await refresh();
};

$('reset-hunt').onclick = () => fillHunt(null);

$('hunt-list').onclick = async (e) => {
  const edit = e.target.closest('[data-edit]');
  const run = e.target.closest('[data-run]');
  const del = e.target.closest('[data-del]');
  const resetDelta = e.target.closest('[data-delta-reset]');
  if (resetDelta) {
    const hunt = (window.__hunts || []).find((h) => h.id === resetDelta.dataset.deltaReset);
    if (hunt) {
      const r = await send('SAVE_HUNT', { ...hunt, resetDelta: true });
      setNotice('alert', r?.ok ? 'Đã xóa kết luận cũ. Lượt tới sẽ quét đầy đủ rồi kiểm chứng lại quét nhanh.' : (r?.message || 'Không lưu được.'), r?.ok ? 'ok' : 'error');
      await refresh();
    }
  }
  if (edit) {
    const hunt = (window.__hunts || []).find((h) => h.id === edit.dataset.edit);
    if (hunt) fillHunt(hunt);
  }
  if (run) {
    const r = await send('RUN_HUNT', { id: run.dataset.run });
    setNotice('alert', r?.ok ? 'Đã bắt đầu lượt săn. Giữ Chrome và tab e-GP.' : (r?.message || 'Không chạy được.'), r?.ok ? 'ok' : 'error');
    await refresh();
  }
  if (del && confirm('Xóa bộ săn này?')) {
    await send('DELETE_HUNT', { id: del.dataset.del });
    await refresh();
  }
};

$('save-watch').onclick = async () => {
  const r = await send('SAVE_WATCH', { name: $('watch-name').value, taxCode: $('watch-tax').value });
  if (!r?.ok) { setNotice('alert', r?.message || 'Không lưu được đơn vị.', 'error'); return; }
  $('watch-name').value = '';
  $('watch-tax').value = '';
  await refresh();
};

$('watch-list').onclick = async (e) => {
  const btn = e.target.closest('[data-unwatch]');
  if (!btn) return;
  await send('DELETE_WATCH', { id: btn.dataset.unwatch });
  await refresh();
};

send('AREA_OPTIONS').then((r) => {
  if (r?.ok) $('province-list').innerHTML = (r.provinces || []).map((n) => `<option value="${esc(n)}">`).join('');
}).catch(() => {});

const incomingCriteria=new URL(location.href).searchParams.get('criteria');
if(incomingCriteria){
  try{const c=JSON.parse(incomingCriteria);if(c&&typeof c==='object'&&!Array.isArray(c)){
    fillHunt({name:[c.keyword,c.province,c.category].filter(Boolean).join(' · ').slice(0,70)||'Bộ săn từ lượt tìm',kind:'tbmt',enabled:false,telegram:false,criteria:c});
    setNotice('alert','Đã điền tiêu chí từ bước Tìm. Kiểm tra thời gian chạy, bật bộ săn khi cần và bấm Lưu để tạo lịch.');
  }}catch{setNotice('alert','Không đọc được tiêu chí chuyển sang. Hãy nhập lại trước khi lưu.','error');}
}
refresh();
