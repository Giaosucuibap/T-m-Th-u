/* ============================================================================
 *  TÌM NHANH (Ctrl K) — hộp lệnh dùng chung cho mọi trang (shell.js nạp khi cần).
 *
 *  Gõ mã IB…/PL… → mở gói có sẵn trong kho NGAY, hoặc tra mã đó trên e-GP.
 *  Gõ chữ → gói trong kho khớp mọi từ (không dấu) + trang chức năng khớp tên.
 *  Bàn phím: ↑ ↓ chọn · Enter mở · Esc đóng. Không gửi gì ra ngoài máy: gói
 *  trong kho đọc qua background (QUICK_FIND); tra e-GP chỉ khi người dùng chọn.
 * ========================================================================== */
import { icon } from './icons.js';
import { classifyQuery, quickFindPages, egpLookupAction } from './quick-find-core.js';
import { isEgpUrl, currentEgpUrl } from './egp-host.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v) => { const n = Number(v); return v === null || v === undefined || v === '' || !Number.isFinite(n) ? '' : `${Math.round(n).toLocaleString('vi-VN')} đ`; };
const dateVi = (v) => { const ms = Date.parse(v || ''); return Number.isFinite(ms) ? new Date(ms).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : ''; };

let root = null, items = [], active = 0, seq = 0, opts = { navItems: [], current: '' }, lastFocus = null;

function close() {
  if (!root) return;
  root.remove(); root = null; items = [];
  document.removeEventListener('keydown', onKey, true);
  lastFocus?.focus?.();
}

function activate(item) {
  if (!item) return;
  close();
  if (item.external) window.open(item.href, '_blank', 'noopener');
  else location.href = item.href;
}

function onKey(event) {
  if (!root) return;
  if (event.key === 'Escape') { event.preventDefault(); close(); return; }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!items.length) return;
    active = (active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    paintActive(); return;
  }
  if (event.key === 'Enter' && event.target?.classList?.contains('qf-q')) { event.preventDefault(); activate(items[active]); }
}

function paintActive() {
  root?.querySelectorAll('.qf-item').forEach((el, i) => {
    el.setAttribute('aria-selected', String(i === active));
    if (i === active) el.scrollIntoView({ block: 'nearest' });
  });
  const input = root?.querySelector('.qf-q');
  if (input) input.setAttribute('aria-activedescendant', items.length ? `qf-item-${active}` : '');
}

function packageItem(t) {
  const code = t.displayCode || t.notifyNo || t.bidNo || '';
  const href = isEgpUrl(t.detailUrl) ? currentEgpUrl(t.detailUrl) : `search.html?q=${encodeURIComponent(t.notifyNo || code)}&run=1`;
  const sub = [code, t.investorName, t.location, money(t.price), t.closeDate ? `đóng thầu ${dateVi(t.closeDate)}` : ''].filter(Boolean).join(' · ');
  return { glyph: 'archive', title: t.bidName || code, sub, hint: isEgpUrl(t.detailUrl) ? 'Mở e-GP' : 'Tra e-GP', href, external: isEgpUrl(t.detailUrl) };
}

async function search(raw) {
  const mine = ++seq;
  const query = classifyQuery(raw);
  const groups = [];
  const lookup = egpLookupAction(query);
  let found = { exact: [], hits: [], total: 0 };
  if (query.kind !== 'empty') {
    try { const r = await chrome.runtime.sendMessage({ type: 'QUICK_FIND', payload: { q: query.q } }); if (r?.ok) found = r; } catch {}
  }
  if (mine !== seq || !root) return;
  if (found.exact.length) groups.push(['Đúng mã — trong kho trên máy', found.exact.map(packageItem)]);
  if (lookup) groups.push(['Tra trực tiếp trên e-GP', [{ glyph: lookup.glyph, title: lookup.label, sub: 'Hỏi e-GP ngay; kết quả mới nhất', hint: 'Enter', href: lookup.href }]]);
  if (found.hits.length) groups.push([`Gói trong kho (${found.total - found.exact.length} gói khớp)`, found.hits.map(packageItem)]);
  const pages = quickFindPages(opts.navItems, query.kind === 'text' || query.kind === 'empty' ? query.q : '')
    .filter((n) => n[0] !== opts.current)
    .map(([href, glyph, label, group]) => ({ glyph, title: label, sub: group, hint: 'Trang', href }));
  if (pages.length && (query.kind === 'text' || query.kind === 'empty')) groups.push(['Trang chức năng', pages]);
  render(groups, query);
}

function render(groups, query) {
  items = groups.flatMap(([, list]) => list);
  active = 0;
  const list = root.querySelector('.qf-list');
  let n = 0;
  list.innerHTML = groups.length ? groups.map(([label, entries]) => `<div class="qf-group" role="presentation">${esc(label)}</div>`
    + entries.map((it) => `<button type="button" class="qf-item" role="option" id="qf-item-${n++}" aria-selected="false">${icon(it.glyph, 18)}<span class="qf-main"><span class="qf-title">${esc(it.title)}</span>${it.sub ? `<span class="qf-sub">${esc(it.sub)}</span>` : ''}</span><span class="qf-hint">${esc(it.hint || '')}</span></button>`).join('')).join('')
    : `<div class="qf-empty">Không thấy trong kho trên máy hay trong tên trang.${query.kind === 'text' ? ' Thử từ khác, hoặc vào <b>Tìm gói thầu</b> để hỏi e-GP.' : ''}</div>`;
  list.querySelectorAll('.qf-item').forEach((el, i) => {
    el.addEventListener('click', () => activate(items[i]));
    el.addEventListener('mousemove', () => { if (active !== i) { active = i; paintActive(); } });
  });
  paintActive();
}

export function openQuickFind(options = {}) {
  opts = { ...opts, ...options };
  if (root) { root.querySelector('.qf-q')?.focus(); return; }
  lastFocus = document.activeElement;
  root = document.createElement('div');
  root.className = 'qf-backdrop';
  root.innerHTML = `<div class="qf-panel" role="dialog" aria-modal="true" aria-label="Tìm nhanh">
    <div class="qf-input-row">${icon('search', 20)}<input class="qf-q" type="search" role="combobox" aria-expanded="true" aria-controls="qf-list" aria-autocomplete="list" placeholder="Gõ mã TBMT (IB…), mã KHLCNT (PL…), tên gói, chủ đầu tư hoặc tên trang" autocomplete="off" spellcheck="false"><kbd>Esc</kbd><button type="button" class="qf-close" aria-label="Đóng tìm nhanh">Đóng</button></div>
    <div class="qf-list" id="qf-list" role="listbox"></div>
    <div class="qf-foot"><span class="key-hint">↑ ↓ chọn</span><span class="key-hint">Enter mở</span><span class="key-hint">Esc đóng</span><span>Gói trong kho là dữ liệu đã lưu — có thể đã cũ; tra e-GP để có bản mới nhất.</span></div></div>`;
  root.addEventListener('mousedown', (event) => { if (event.target === root) close(); });
  root.querySelector('.qf-close').addEventListener('click', () => close());
  document.body.append(root);
  document.addEventListener('keydown', onKey, true);
  const input = root.querySelector('.qf-q');
  let timer = null;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => search(input.value), 90); });
  input.focus();
  search('');
}
