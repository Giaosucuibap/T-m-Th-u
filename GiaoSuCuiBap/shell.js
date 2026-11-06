import { icon, hydrateIcons } from './lib/icons.js';
hydrateIcons();

/* Điều hướng nhóm theo CÔNG VIỆC của người làm thầu, không theo lịch sử tính
   năng. Bốn trang tra cứu e-GP đứng đầu — trước đây ba trong số đó nằm lẫn
   trong mục "Nâng cao" thu gọn. Nhóm có `fold` thu gọn được để thanh trái vừa
   màn hình 1366×768 mà không phải cuộn. */
export const NAV_GROUPS = [
  { id: 'tra-cuu', label: 'Tra cứu e-GP', items: [
    ['search.html', 'search', 'Tìm gói thầu'],
    ['plans.html', 'plan', 'Kế hoạch lựa chọn NT'],
    ['bidopen.html', 'clock', 'Mở thầu · Chờ kết quả'],
    ['winners.html', 'trophy', 'Nhà thầu trúng thầu']] },
  { id: 'theo-doi', label: 'Theo dõi', items: [
    ['dashboard.html', 'archive', 'Kho gói đã lưu'],
    ['hunts.html', 'radar', 'Bộ săn tự động'],
    ['checklist.html', 'checklist', 'Checklist hồ sơ']] },
  { id: 'phan-tich', label: 'Phân tích thị trường', fold: true, items: [
    ['market.html', 'map', 'Phân tích địa bàn'],
    ['analytics.html', 'chart', 'Phân tích thị trường'],
    ['rivals.html', 'compare', 'Đối thủ địa bàn'],
    ['investor.html', 'building', 'Hồ sơ chủ đầu tư'],
    ['profile.html', 'building', 'Hồ sơ nhà thầu 360°'],
    ['contractors.html', 'grid', 'Nhà thầu đã quét']] },
  { id: 'nang-luc', label: 'Năng lực công ty', fold: true, items: [
    ['capability.html', 'check', 'Năng lực công ty'],
    ['contracts.html', 'contract', 'Hợp đồng tương tự'],
    ['outline.html', 'plan', 'Khung BPTC'],
    ['timeline.html', 'clock', 'Nhật ký điều chỉnh']] },
  { id: 'he-thong', label: 'Hệ thống', items: [
    ['options.html', 'settings', 'Cấu hình'],
    ['diagnostics.html', 'shield', 'Kiểm tra dữ liệu']] }
];
export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items.map((item) => [...item, g.label]));
/* Trang không nằm trong thanh trái nhưng vẫn dùng khung chung. */
const EXTRA_TITLES = { 'onboarding.html': ['check', 'Bắt đầu sử dụng'], 'privacy.html': ['shield', 'Chính sách bảo mật'] };

const file = location.pathname.split('/').pop();
// Màn hình nào sẽ hỏi e-GP thì mở sẵn trang tra cứu e-GP ở tab nền ngay khi mở
// (người dùng còn đang nhập tiêu chí). Tắt được ở Cấu hình. Hỏng thì bỏ qua —
// lượt tra cứu vẫn tự mở tab như cũ.
export const PREWARM_PAGES = ['search.html', 'bidopen.html', 'plans.html', 'winners.html', 'market.html', 'investor.html'];
if (PREWARM_PAGES.includes(file)) Promise.resolve().then(() => chrome.runtime.sendMessage({ type: 'EGP_PREWARM' })).catch(() => {});

/* Cửa sổ bật lên 420px có bố cục riêng: không dựng thanh trái, không chèn gì. */
const IS_POPUP = file === 'popup.html';

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} }
};

/* Đầu trang tối của các trang đời cũ → thanh tiêu đề sáng trong khung chung.
   Liên kết trên đầu trang đã có ở thanh trái nên bỏ; phần tử có id (vd.
   #version mà dashboard.js ghi vào) được giữ lại, chỉ ẩn đi. */
const STRIP_EMOJI = /^[\s☀-➿⬀-⯿⌚-⏿️‍]+|^[\s\uD83C-􏰀-\uDFFF️‍]+/u;
function adoptLegacyHeader() {
  const header = document.querySelector('body > header');
  if (!header || document.body.classList.contains('workspace')) return;
  document.body.classList.add('workspace', 'ws-legacy');
  const aside = document.createElement('aside');
  aside.id = 'workspace-nav'; aside.className = 'ws-sidebar';
  document.body.prepend(aside);
  header.querySelectorAll(':scope > a[href]').forEach((a) => a.remove());
  const b = header.querySelector(':scope > b');
  const item = NAV_ITEMS.find((n) => n[0] === file);
  const extra = EXTRA_TITLES[file];
  const glyph = item?.[1] || extra?.[0] || 'grid';
  const keep = b ? [...b.querySelectorAll('[id]')] : [];
  let text = b ? b.textContent.replace(/\s+/g, ' ').trim() : '';
  if (!b || b.querySelector('.brand-icon') || !text) text = item?.[2] || extra?.[1] || text;
  text = text.replace(STRIP_EMOJI, '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
  const title = document.createElement('div');
  title.className = 'ws-pagetitle';
  title.innerHTML = `${icon(glyph, 24)}<span><span class="ws-crumb">${item ? item[3] : 'Giáo Sư Cùi Bắp'}</span></span>`;
  title.querySelector('span > span').after(document.createTextNode(text));
  if (keep.length) { const hidden = document.createElement('span'); hidden.hidden = true; hidden.append(...keep); title.append(hidden); }
  if (b) b.replaceWith(title); else header.prepend(title);
}

function renderSidebar(shell) {
  const link = ([href, glyph, label]) => `<a href="${href}" ${file === href ? 'aria-current="page"' : ''}>${icon(glyph, 19)}<span>${label}</span></a>`;
  const groups = NAV_GROUPS.map((g) => {
    const links = g.items.map(link).join('');
    if (!g.fold) return `<div class="nav-caption">${g.label}</div>${links}`;
    const here = g.items.some((n) => n[0] === file);
    const open = here || store.get(`gscb_nav_${g.id}`) === 'open';
    return `<details class="nav-group" data-group="${g.id}" ${open ? 'open' : ''}><summary>${g.label}</summary>${links}</details>`;
  }).join('');
  shell.innerHTML = `<a class="ws-brand" href="search.html"><img src="icons/brand-mark.svg" width="40" height="40" alt=""><span>Giáo Sư Cùi Bắp<small>KHÔNG GIAN TÌM THẦU</small></span></a>`
    + `<button type="button" class="ws-quick" aria-keyshortcuts="Control+K" title="Tìm trang, mã TBMT/KHLCNT, gói trong kho">${icon('search', 17)}<span>Tìm nhanh…</span><kbd>Ctrl K</kbd></button>`
    + `<div class="ws-nav"><nav aria-label="Chức năng">${groups}</nav></div>`
    + `<div class="ws-side-bottom">${icon('shield', 18)}<div>Dữ liệu trên máy bạn<small>Không lưu mật khẩu e-GP</small></div></div>`
    + `<div class="ws-version">PHIÊN BẢN ${chrome.runtime.getManifest().version}<span>VN / UTC+7</span></div>`;
  // Chỉ nhớ khi NGƯỜI DÙNG bấm mở/đóng. Nhóm tự mở vì chứa trang đang xem thì
  // không ghi — trước đây ghi luôn, nên vào một trang phân tích là nhóm đó mở
  // trên mọi trang khác và đẩy mục Cấu hình khuất khỏi màn hình.
  shell.querySelectorAll('details.nav-group > summary').forEach((sum) => sum.addEventListener('click', () => {
    const d = sum.parentElement;
    queueMicrotask(() => store.set(`gscb_nav_${d.dataset.group}`, d.open ? 'open' : 'closed'));
  }));
  shell.querySelector('.ws-quick').addEventListener('click', () => openQuickFind());
  shell.addEventListener('keydown', (event) => { if (event.key === 'Escape' && document.body.classList.contains('nav-open')) closeMenu(); });
}

/* Màn hình hẹp: thanh trái thành ngăn kéo, mở bằng nút ☰. */
function closeMenu() { document.body.classList.remove('nav-open'); }
function addMenuButton(host) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'ws-menu-btn'; btn.setAttribute('aria-label', 'Mở danh mục chức năng');
  btn.innerHTML = icon('grid', 20);
  btn.addEventListener('click', (event) => { event.stopPropagation(); document.body.classList.toggle('nav-open'); });
  host.prepend(btn);
  document.addEventListener('click', (event) => {
    if (document.body.classList.contains('nav-open') && !event.target.closest('.ws-sidebar')) closeMenu();
  });
}

/* Tìm nhanh (Ctrl K): nạp mô-đun khi cần lần đầu. */
let quickFind = null;
async function openQuickFind() {
  try {
    quickFind ||= await import('./lib/quick-find.js');
    quickFind.openQuickFind({ navItems: NAV_ITEMS, current: file });
  } catch (error) { console.warn('Tìm nhanh chưa mở được', error); }
}

if (!IS_POPUP) {
  adoptLegacyHeader();
  const shell = document.getElementById('workspace-nav');
  if (shell) renderSidebar(shell);
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') { event.preventDefault(); openQuickFind(); }
  });
  const main = document.querySelector('main');
  if (main) {
    if (!main.id) main.id = 'main-content';
    const skip = document.createElement('a'); skip.className = 'skip-link'; skip.href = `#${main.id}`; skip.textContent = 'Đến nội dung chính';
    document.body.prepend(skip);
    skip.addEventListener('click', () => { if (!main.hasAttribute('tabindex')) main.tabIndex = -1; main.focus({ preventScroll: true }); });
  }
  const top = document.querySelector('.ws-topbar') || document.querySelector('body > header');
  if (top && shell) addMenuButton(top);
}

// Display preferences change spacing only. They never alter filters, result
// scope, pagination, or the rows handed to the export gate.
const densityKey = 'gscb_display_density';
let density = store.get(densityKey) === 'comfortable' ? 'comfortable' : 'compact';
const densityButton = document.createElement('button'); densityButton.type = 'button'; densityButton.className = 'density-toggle';
function applyDensity(value) {
  density = value === 'comfortable' ? 'comfortable' : 'compact'; document.documentElement.dataset.density = density;
  const compact = density === 'compact'; densityButton.setAttribute('aria-pressed', String(compact));
  densityButton.setAttribute('aria-label', `Hiển thị gọn: ${compact ? 'đang bật' : 'đang tắt'}. Chuyển sang bố cục ${compact ? 'thoáng' : 'gọn'}.`);
  densityButton.title = `Chuyển sang bố cục ${compact ? 'thoáng' : 'gọn'}; giữ nguyên bộ lọc và dữ liệu`;
  densityButton.innerHTML = `${icon(compact ? 'compact' : 'comfortable', 16)}<span>${compact ? 'Gọn' : 'Thoáng'}</span>`;
}
applyDensity(density);
densityButton.addEventListener('click', () => { applyDensity(density === 'compact' ? 'comfortable' : 'compact'); store.set(densityKey, density); });
window.addEventListener('storage', (event) => { if (event.key === densityKey) applyDensity(event.newValue); });
const densityHost = document.querySelector('.ws-topbar') || document.querySelector('body > header');
if (!IS_POPUP && document.querySelector('main') && densityHost) densityHost.append(densityButton);
document.querySelectorAll('[data-version]').forEach((el) => { el.textContent = chrome.runtime.getManifest().version; });
