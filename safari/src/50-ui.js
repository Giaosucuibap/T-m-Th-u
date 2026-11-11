/* ============================================================================
 *  GIAO DIỆN: lớp phủ toàn màn hình trên trang muasamcong
 *
 *  Một thanh trên cùng + khung hiện trang tiện ích. Tất cả nằm trong shadow DOM
 *  để CSS của trang e-GP và của lớp vỏ không đụng nhau. Các khung e-GP ảo nằm NGAY
 *  DƯỚI khung giao diện (vẫn được trình duyệt vẽ nên script trong đó chạy bình thường,
 *  chỉ là bị che); "Xem trang e-GP thật" trong Tuỳ chọn cho xem tận mắt trang đang được
 *  điều khiển.
 *
 *  Làm cho ngón tay (4.22.0): mọi chỗ bấm của lớp vỏ cao từ 44 px (chuẩn của Apple); cỡ
 *  hiển thị, giao diện tối, giữ máy thức nằm ở nút Tuỳ chọn; thao tác lùi của Safari (vuốt
 *  từ mép trái, nút ‹) được đổi thành "về màn hình trước của Cùi Bắp".
 * ========================================================================== */
const UI_TAB_ID = 1;
/* Giao diện tối: đảo sáng–tối rồi xoay màu nửa vòng (màu giữ đúng tông: xanh vẫn xanh, đỏ vẫn
   đỏ). Áp lên chính thẻ <iframe> nên phần tử ghim (position:fixed) bên trong không bị lệch.
   Ảnh, bản đồ và các khối vốn đã tối được đảo thêm một lần trong trang (xem 10-assets.js). */
const DARK_FILTER = 'invert(1) hue-rotate(180deg)';
const ZOOM_STEPS = [0.9, 1, 1.1, 1.2, 1.3, 1.45];

const SHELL_CSS = `
:host{all:initial}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.root{--paper:#fff;--paper-2:#f1f5f9;--ink:#0f172a;--ink-2:#475569;--rule:#e2e8f0;--soft:#e2e8f0;--accent:#0f766e;--on-accent:#fff;
  position:fixed;inset:0;display:flex;flex-direction:column;background:var(--paper-2);color:var(--ink);font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
  padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) 0 env(safe-area-inset-left,0px)}
.root.dark{--paper:#151b23;--paper-2:#0d1117;--ink:#e6edf3;--ink-2:#9fb0c0;--rule:#2a3441;--soft:#232c38;--accent:#2dd4bf;--on-accent:#04201c}
.bar{flex:none;min-height:52px;display:flex;align-items:center;gap:8px;padding:4px 10px;background:#0b3b36;color:#e6fffa}
.brand{font-weight:700;font-size:15px;white-space:nowrap}
.brand small{font-weight:500;opacity:.75;margin-left:6px}
.grow{flex:1;min-width:4px}
button{font:inherit;cursor:pointer}
.bar button{font-weight:600;font-size:14px;color:#e6fffa;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);border-radius:10px;padding:0 12px;min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap}
.bar button svg{width:20px;height:20px;flex:none}
.bar button:active{background:rgba(255,255,255,.25)}
.bar button[disabled]{opacity:.4}
.bar button.on{background:#f59e0b;border-color:#f59e0b;color:#1c1917}
.bar .chip{border-radius:999px;font-size:13px;padding:0 12px;min-width:0;overflow:hidden;max-width:46vw}
.chip i{width:9px;height:9px;border-radius:50%;background:#34d399;flex:none}
.chip span{overflow:hidden;text-overflow:ellipsis}
.chip.busy i{background:#fbbf24}.chip.warn i{background:#fb923c}.chip.bad i{background:#f87171}
.bell{display:none!important}
.bell.has{display:inline-flex!important}
.bell b{background:#f59e0b;color:#1c1917;border-radius:999px;padding:0 6px;font-size:12px;line-height:18px}
.stage{flex:1;position:relative;min-height:0;background:var(--paper)}
.layer{position:absolute;inset:0}
.egp{z-index:1}.ui{z-index:2;background:var(--paper)}
.stage.peek .egp{z-index:3}
.peekbar{display:none;position:absolute;left:0;right:0;bottom:0;z-index:4;padding:14px 16px calc(14px + env(safe-area-inset-bottom,0px));background:#fef3c7;color:#78350f;font-weight:600;font-size:14px;border-top:1px solid #f59e0b;text-align:center;cursor:pointer}
.stage.peek .peekbar{display:block}
.ui iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}
.toasts{position:absolute;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:6;display:flex;flex-direction:column;gap:8px;max-width:min(420px,calc(100vw - 24px));pointer-events:none}
.toast{pointer-events:auto;background:#0f172a;color:#f8fafc;border-radius:14px;padding:12px 6px 12px 14px;box-shadow:0 10px 30px rgba(15,23,42,.35);font-size:14px;display:flex;gap:6px;align-items:flex-start}
.root.dark .toast{background:#232c38;border:1px solid #3a4654}
.toast .txt{flex:1;min-width:0}
.toast b{display:block;margin-bottom:2px}
.toast .msg{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:5;overflow:hidden}
.toast .row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.toast .row:empty{display:none}
.toast button,.toast a{font:inherit;font-weight:600;font-size:14px;color:#0f172a;background:#e2e8f0;border:0;border-radius:10px;padding:0 14px;text-decoration:none;min-height:44px;display:inline-flex;align-items:center}
.toast .x{flex:none;background:transparent;color:#cbd5e1;font-size:22px;line-height:1;padding:0;min-width:44px;min-height:44px;justify-content:center;margin:-8px 0}
.short{display:none}
.list{overflow:auto;flex:1;padding:6px 16px;-webkit-overflow-scrolling:touch}
.item{padding:12px 0;border-bottom:1px solid var(--rule)}
.item:last-child{border-bottom:0}
.item b{display:block}
.item small{color:var(--ink-2)}
.item .row{padding:10px 0 0;border:0}
.none{padding:22px 16px;color:var(--ink-2);text-align:center}
.modal{position:absolute;inset:0;z-index:8;background:rgba(15,23,42,.55);display:none;align-items:center;justify-content:center;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px))}
.modal.open{display:flex}
.sheet{background:var(--paper);color:var(--ink);border-radius:16px;width:min(760px,100%);max-height:100%;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.3)}
.sheet.narrow{width:min(520px,100%)}
.sheet h2{margin:0;padding:15px 18px;font-size:18px;border-bottom:1px solid var(--rule)}
.sheet pre{margin:0;padding:14px 16px;overflow:auto;font:13px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-word;flex:1;-webkit-overflow-scrolling:touch}
.sheet .row{display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--rule);flex-wrap:wrap}
.sheet button{font-weight:600;font-size:15px;color:var(--ink);background:var(--soft);border:1px solid var(--rule);border-radius:10px;padding:0 16px;min-height:44px;white-space:nowrap}
.sheet button:active{filter:brightness(.92)}
.sheet button.main,.sheet button[aria-checked="true"]{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.sheet button[hidden]{display:none}
.opts{overflow:auto;-webkit-overflow-scrolling:touch;padding:4px 18px 10px}
.opts section{padding:14px 0;border-bottom:1px solid var(--rule)}
.opts section:last-child{border-bottom:0}
.opts h3{margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)}
.opts p{margin:8px 0 0;font-size:14px;color:var(--ink-2)}
.seg{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.seg button{flex:1 1 0;min-width:72px}
.seg output{flex:0 0 76px;text-align:center;font-weight:700;font-size:17px;font-variant-numeric:tabular-nums}
.sw{display:flex;align-items:center;gap:12px;min-height:44px;font-weight:600;cursor:pointer}
.sw input{width:24px;height:24px;flex:none;accent-color:var(--accent)}
.splash{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:var(--paper-2);text-align:center;padding:24px}
.splash b{font-size:20px;color:var(--accent)}.splash span{color:var(--ink-2);max-width:520px}
.splash .row{display:none;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:8px}
.splash.halted .row{display:flex}
.splash .row button{font-weight:600;font-size:15px;min-height:44px;padding:0 16px;border-radius:10px;border:1px solid var(--rule);background:var(--paper);color:var(--ink)}
.splash.gone{display:none}
@media (max-width:700px){
  .bar{gap:6px;padding:4px 6px}
  .brand small{display:none}
  .bar .chip{max-width:34vw}
  .wide{display:none!important}
  .long{display:none}.short{display:inline}
  .toasts{left:8px;right:8px;max-width:none}
}
@media (max-width:480px){
  .brand{display:none}
  .bar .chip{max-width:none;flex:0 1 auto}
}
`;

/* Những mục của tiện ích cần thứ mà Safari trên iPad/iPhone không có. Nhắc một lần mỗi phiên. */
const SAFARI_NOTES = {
  'phone.html': ['Mục này dành cho máy tính', 'Link điện thoại là cách cho iPhone mượn máy tính Windows. Anh đang chạy Cùi Bắp ngay trên Safari nên không cần bật mục này.'],
  'hunts.html': ['Lịch tự động trên Safari', 'Safari chỉ chạy lịch khi tab muasamcong này đang mở và Cùi Bắp đang bật. Khoá máy hay đóng tab thì lượt lỡ sẽ chạy bù khi anh mở lại. Bật "Giữ máy thức" trong Tuỳ chọn để màn hình không tự tắt.'],
  'options.html': ['Quét tự động và bản tin sáng', 'Trên Safari, quét tự động và bản tin Telegram chỉ chạy khi Cùi Bắp đang mở.']
};

const ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const ICON_OPTS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.4"/><circle cx="8" cy="17" r="2.4"/></svg>';
const ICON_BELL = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 22a2.4 2.4 0 0 0 2.4-2.4H9.6A2.4 2.4 0 0 0 12 22zm7.2-6V11a7.2 7.2 0 0 0-5.4-7V3.2a1.8 1.8 0 0 0-3.6 0V4a7.2 7.2 0 0 0-5.4 7v5L2.4 18.4v1.2h19.2v-1.2z"/></svg>';

function createUi() {
  const doc = TOP.document;
  const host = doc.createElement('div');
  host.id = 'gscb-safari';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:block';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${SHELL_CSS}</style>
<div class="root" part="root">
  <div class="bar">
    <button data-act="back" aria-label="Quay lại màn hình trước" disabled>${ICON_BACK}</button>
    <span class="brand">Giáo Sư Cùi Bắp<small>${PACK.version} · Safari</small></span>
    <button class="chip busy" data-act="diag" data-el="chip" aria-label="Tình trạng — chạm để xem chẩn đoán"><i></i><span data-el="chip-text" role="status">Đang khởi động…</span></button>
    <span class="grow"></span>
    <button class="bell" data-act="bell" data-el="bell" aria-label="Thông báo của Cùi Bắp">${ICON_BELL}<b data-el="bell-count">0</b></button>
    <button data-act="menu" aria-label="Tuỳ chọn: cỡ hiển thị, giao diện tối, công cụ">${ICON_OPTS}<span class="long">Tuỳ chọn</span></button>
    <button class="wide" data-act="diag">Chẩn đoán</button>
    <button data-act="hide" aria-label="Ẩn Cùi Bắp, về trang muasamcong">Ẩn</button>
  </div>
  <div class="stage" data-el="stage">
    <div class="layer egp" data-el="egp"></div>
    <div class="layer ui" data-el="ui"></div>
    <div class="splash" data-el="splash"><b>Giáo Sư Cùi Bắp</b><span data-el="splash-text">Đang chuẩn bị không gian tìm thầu trên Safari…</span><div class="row"><button data-act="diag">Chẩn đoán</button><button data-act="reload">Tải lại trang</button></div></div>
    <div class="peekbar" data-act="peek-off">Đây là trang muasamcong thật mà phần mềm đang điều khiển. Chỉ để xem — đừng bấm khi đang tra cứu. Chạm vào dòng này để quay về Cùi Bắp.</div>
    <div class="toasts" data-el="toasts" aria-live="polite"></div>
    <div class="modal" data-el="modal" role="dialog" aria-modal="true" aria-label="Chẩn đoán"><div class="sheet"><h2>Chẩn đoán — Cùi Bắp trên Safari</h2><pre data-el="diag-text"></pre><div class="row"><button class="main" data-act="diag-copy">Chép chẩn đoán</button><button data-act="diag-refresh">Làm mới</button><button data-act="peek">Xem trang e-GP</button><button data-act="diag-close">Đóng</button></div></div></div>
    <div class="modal" data-el="inbox" role="dialog" aria-modal="true" aria-label="Thông báo"><div class="sheet"><h2>Thông báo</h2><div class="list" data-el="inbox-list"></div><div class="row"><button data-act="inbox-clear">Xoá hết</button><button class="main" data-act="inbox-close">Đóng</button></div></div></div>
    <div class="modal" data-el="menu" role="dialog" aria-modal="true" aria-label="Tuỳ chọn"><div class="sheet narrow"><h2>Tuỳ chọn</h2><div class="opts">
      <section><h3>Cỡ hiển thị</h3><div class="seg"><button data-act="zoom-out" aria-label="Thu nhỏ chữ và nút">A−</button><output data-el="zoom-val" aria-live="polite">100%</output><button data-act="zoom-in" aria-label="Phóng to chữ và nút">A+</button></div><p>Phóng cả chữ lẫn nút, áp dụng ngay cho mọi màn hình.</p></section>
      <section><h3>Giao diện</h3><div class="seg" role="radiogroup" aria-label="Giao diện sáng hay tối"><button role="radio" data-theme="auto">Theo máy</button><button role="radio" data-theme="light">Sáng</button><button role="radio" data-theme="dark">Tối</button></div></section>
      <section><h3>Giữ máy thức</h3><label class="sw"><input type="checkbox" data-el="wake"><span>Không tắt màn hình khi Cùi Bắp đang mở</span></label><p data-el="wake-note">Để bộ săn và lượt quét không dừng giữa chừng. Tốn pin hơn.</p></section>
      <section><h3>Công cụ</h3><div class="seg"><button data-act="peek">Xem trang e-GP thật</button><button data-act="diag">Chẩn đoán</button></div></section>
      <section><h3>Phiên bản</h3><p data-el="rel-text" style="margin-top:0">Bản ${PACK.version} · bản dựng ${PACK.build}</p><div class="seg" style="margin-top:10px"><button data-act="rel-previous" data-el="rel-previous" hidden>Quay về bản trước</button><button data-act="rel-newest" data-el="rel-newest" hidden>Dùng bản mới</button></div><label class="sw" style="margin-top:6px"><input type="checkbox" data-el="rel-ask" checked><span>Hỏi trước khi cập nhật</span></label></section>
    </div><div class="row"><button class="main" data-act="menu-close">Xong</button></div></div></div>
  </div>
</div>`;
  const el = (name) => shadow.querySelector(`[data-el="${name}"]`);
  const root = shadow.querySelector('.root');
  const stage = el('stage'), uiLayer = el('ui'), egpLayer = el('egp');

  /* ------------------------------------------------------ tuỳ chọn hiển thị và vận hành */
  const prefs = { zoom: TOUCH && TOP.innerWidth >= 700 ? 1.1 : 1, theme: 'auto', wake: false };
  let release = { state: {}, hand: null };          // tình trạng phát hành (80-phat-hanh.js), làm mới mỗi khi mở Tuỳ chọn / Chẩn đoán
  let darkQuery = null;
  try { darkQuery = TOP.matchMedia('(prefers-color-scheme: dark)'); } catch { /* Safari quá cũ */ }
  const isDark = () => (prefs.theme === 'auto' ? Boolean(darkQuery && darkQuery.matches) : prefs.theme === 'dark');
  /** Đưa cỡ hiển thị và giao diện sáng/tối vào một khung trang tiện ích. */
  function paint(f) {
    const dark = isDark();
    f.style.filter = dark ? DARK_FILTER : '';
    try {
      const page = f.contentDocument && f.contentDocument.documentElement;
      if (!page) return;
      page.style.zoom = prefs.zoom === 1 ? '' : String(prefs.zoom);
      page.toggleAttribute('data-gscb-dark', dark);
      page.setAttribute('data-platform', 'safari');
      if (TOUCH) page.setAttribute('data-touch', '1');
    } catch { /* khung đang chuyển trang */ }
  }
  function repaint() {
    root.classList.toggle('dark', isDark());
    for (const f of uiLayer.querySelectorAll('iframe')) paint(f);
    renderMenu();
  }
  function savePrefs() { try { void hub.store?.setMeta('tuy-chon', { ...prefs }); } catch { /* kho chưa sẵn sàng */ } }
  /** Nạp tuỳ chọn đã lưu (gọi sau khi mở được kho). */
  function applyPrefs(saved) {
    if (saved && typeof saved === 'object') {
      if (ZOOM_STEPS.includes(saved.zoom)) prefs.zoom = saved.zoom;
      if (['auto', 'light', 'dark'].includes(saved.theme)) prefs.theme = saved.theme;
      prefs.wake = Boolean(saved.wake);
    }
    if (ZOOM_STEPS.includes(OPTS.zoom)) prefs.zoom = OPTS.zoom;
    if (['auto', 'light', 'dark'].includes(OPTS.theme)) prefs.theme = OPTS.theme;
    // Tình trạng phát hành mà đoạn chọn bản vừa ghi (đọc từ kho vừa mở): để Chẩn đoán có ngay.
    release = { state: hub.store?.getMeta(REL.state) || {}, hand: TOP.__GSCB_HANDOVER__ || null };
    repaint();
    void applyWake();
  }
  if (darkQuery) { const onScheme = () => { if (prefs.theme === 'auto') repaint(); }; try { darkQuery.addEventListener('change', onScheme); } catch { try { darkQuery.addListener(onScheme); } catch { /* không nghe được: đổi tay trong Tuỳ chọn */ } } }

  /* Giữ máy thức: màn hình không tự tắt khi Cùi Bắp đang hiện, để lịch săn không dừng. Safari tự
     nhả khoá mỗi khi tab bị che; quay lại thì xin lại. */
  let wakeSentinel = null, wakeError = '';
  const wakeSupported = () => { try { return Boolean(TOP.navigator.wakeLock && TOP.navigator.wakeLock.request); } catch { return false; } };
  const wakeHeld = () => Boolean(wakeSentinel && !wakeSentinel.released);
  async function applyWake() {
    if (!prefs.wake || hub.retired) { const old = wakeSentinel; wakeSentinel = null; try { await old?.release(); } catch { /* đã nhả */ } renderMenu(); return; }
    if (wakeHeld() || !wakeSupported() || TOP.document.visibilityState !== 'visible') { renderMenu(); return; }
    try { wakeSentinel = await TOP.navigator.wakeLock.request('screen'); wakeError = ''; }
    catch (error) { wakeSentinel = null; wakeError = String(error?.message || error); }
    renderMenu();
  }
  doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') void applyWake(); });

  function renderMenu() {
    el('zoom-val').textContent = `${Math.round(prefs.zoom * 100)}%`;
    shadow.querySelector('[data-act="zoom-out"]').disabled = prefs.zoom <= ZOOM_STEPS[0];
    shadow.querySelector('[data-act="zoom-in"]').disabled = prefs.zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1];
    for (const bt of shadow.querySelectorAll('[data-theme]')) bt.setAttribute('aria-checked', String(bt.dataset.theme === prefs.theme));
    const wake = el('wake');
    wake.checked = prefs.wake; wake.disabled = !wakeSupported();
    el('wake-note').textContent = !wakeSupported() ? 'Safari trên máy này chưa hỗ trợ giữ màn hình sáng (cần iPadOS / iOS 16.4 trở lên).'
      : prefs.wake ? (wakeHeld() ? 'Đang giữ màn hình sáng. Tốn pin hơn; tắt khi không săn.' : `Chưa giữ được${wakeError ? ` (${clampText(wakeError, 80)})` : ''} — Safari chỉ cho giữ khi tab này đang hiện.`)
        : 'Để bộ săn và lượt quét không dừng giữa chừng. Tốn pin hơn.';
    const s = release.state || {}, hand = release.hand;
    const using = hand ? `Đang dùng bản ${s.dung?.version || '?'} (bản dựng ${hand.to}); bản ${hand.fromVersion} đã tải về và đang chờ.` : `Đang dùng bản ${PACK.version} · bản dựng ${PACK.build}.`;
    el('rel-text').textContent = `${using}${s.truoc ? ` Bản trước cất trong máy: ${s.truoc.version}.` : ''}`;
    el('rel-previous').hidden = !s.truoc || Boolean(hand);
    if (s.truoc) el('rel-previous').textContent = `Quay về bản ${s.truoc.version}`;
    el('rel-newest').hidden = !hand;
    if (hand) el('rel-newest').textContent = `Dùng bản ${hand.fromVersion}`;
    el('rel-ask').checked = s.tuDong !== true;
  }
  function openMenu() {
    renderMenu();
    el('menu').classList.add('open');
    readRelease().then((value) => { release = value; renderMenu(); }, () => {});
  }
  function setPeek(on) {
    stage.classList.toggle('peek', on);
    for (const m of shadow.querySelectorAll('.modal.open')) m.classList.remove('open');
  }

  /* ---------------------------------------------------------------- trang tiện ích */
  const trail = [];                       // các màn hình đã đi qua (để ◀ và thao tác lùi quay về)
  let current = null, frame = null, ctx = null, loads = 0;

  function locationFacade(win) {
    const real = win.location;
    const go = (value) => navigateFrom(String(value));
    return {
      get href() { return real.href; }, set href(value) { go(value); },
      get search() { return real.search; }, set search(value) { const q = String(value); go(`${current.page}${q.startsWith('?') || !q ? q : `?${q}`}`); },
      get hash() { return real.hash; }, set hash(value) { real.hash = value; },
      get pathname() { return real.pathname; }, get origin() { return real.origin; }, get host() { return real.host; },
      get hostname() { return real.hostname; }, get protocol() { return real.protocol; }, get port() { return real.port; },
      assign: go, replace: go, reload() { void render(current); }, toString() { return real.href; }
    };
  }
  /** Điều hướng do trang tiện ích yêu cầu: trang tiện ích khác → đổi trang; còn lại → tab Safari mới. */
  function navigateFrom(value) {
    const parsed = parseExtensionUrl(value, current?.page);
    if (parsed && FILES[parsed.page]) { navigate(extensionUrl(parsed.page, parsed.search, parsed.hash)); return; }
    let abs = value; try { abs = new URL(value, frame.contentWindow.location.href).href; } catch { /* giữ nguyên */ }
    hub.tabs.openExternal(abs);
  }

  /**
   * In / Lưu PDF. Phần mềm nằm trong một khung của trang muasamcong nên Safari không in riêng khung
   * được: mở BẢN CHỤP của báo cáo (HTML đứng riêng do trang dựng) ở tab mới, người dùng in hoặc lưu
   * PDF bằng nút Chia sẻ của Safari. Phải gọi ngay trong cú chạm, nếu không Safari chặn tab mới.
   * Trả true nếu đã mở được (hoặc đã nhờ Safari mở qua một liên kết).
   */
  function openReport(html) {
    let tab = null;
    try { tab = TOP.open('', '_blank'); } catch { tab = null; }
    if (tab && tab.document) {
      try {
        tab.document.open(); tab.document.write(String(html)); tab.document.close();
        const button = tab.document.getElementById('gscb-print');
        if (button) button.addEventListener('click', () => { try { tab.focus(); tab.print(); } catch { /* còn nút Chia sẻ → In của Safari */ } });
        note('info', 'in', 'Đã mở bản in ở tab mới.');
        return true;
      } catch { try { tab.close(); } catch { /* bỏ qua */ } }
    }
    try {
      const url = TOP.URL.createObjectURL(new TOP.Blob([String(html)], { type: 'text/html;charset=utf-8' }));
      const link = TOP.document.createElement('a');
      link.href = url; link.target = '_blank'; link.rel = 'noopener';
      TOP.document.body.append(link); link.click(); link.remove();
      TOP.setTimeout(() => { try { TOP.URL.revokeObjectURL(url); } catch { /* bỏ qua */ } }, 10 * 60_000);
      note('info', 'in', 'Đã nhờ Safari mở bản in qua liên kết (tab mới bị chặn khi mở trực tiếp).');
      return true;
    } catch (error) { note('error', 'in', `Không mở được bản in: ${error?.message || error}`); return false; }
  }

  let renderSeq = 0;
  const noted = new Set();
  /** Dựng một trang tiện ích vào khung mới; khung cũ giữ nguyên trên màn hình tới khi khung mới sẵn sàng. */
  async function render(entry) {
    if (hub.retired) return false;
    const html = pageHtml(entry.page);
    if (html === null) { toast({ title: 'Không có trang này', message: entry.page }); return false; }
    const seq = ++renderSeq;
    const next = await openableFrame(uiLayer, (f) => { f.title = 'Giáo Sư Cùi Bắp'; f.style.visibility = 'hidden'; });
    if (seq !== renderSeq || hub.retired) { next.remove(); return false; }
    if (ctx) dropContext(ctx);
    const old = frame;
    frame = next;
    loads++;
    const win = frame.contentWindow, d = frame.contentDocument;
    d.open();
    win.history.replaceState(null, '', `${VIRT}${entry.page}${entry.search}${entry.hash}`);
    ctx = newContext('page', win, { page: entry.page, url: () => { try { return extensionUrl(entry.page, win.location.search, win.location.hash); } catch { return extensionUrl(entry.page); } } });
    win.chrome = makeChrome(ctx);
    patchFetch(win);
    win.__gscbLocation = locationFacade(win);
    win.__GSCB_TOUCH__ = TOUCH;             // các trang của tiện ích đọc hai cờ này (shell.js) để chỉnh cho ngón tay
    win.__GSCB_PLATFORM__ = 'safari';
    win.open = (url) => { if (url) navigateFrom(String(url)); return null; };
    win.__GSCB_PRINT__ = openReport;        // nút "In / Lưu PDF" của các trang (lib/print.js)
    win.close = () => back();
    win.addEventListener('error', (event) => note('error', entry.page, `${event.message || 'Lỗi script'}${event.lineno ? ` (dòng ${event.lineno})` : ''}`));
    win.addEventListener('unhandledrejection', (event) => note('error', entry.page, `Promise bị từ chối: ${event.reason?.message || event.reason}`));
    win.addEventListener('pointerdown', onGesture, true);
    win.addEventListener('click', (event) => {
      if (event.defaultPrevented || (event.button !== undefined && event.button !== 0)) return;
      const anchor = event.target?.closest?.('a[href]');
      const raw = anchor?.getAttribute('href');
      if (!raw || raw.startsWith('#') || /^javascript:/i.test(raw) || anchor.hasAttribute('download')) return;
      let abs; try { abs = new URL(raw, win.location.href).href; } catch { return; }
      if (/^(?:blob|data|mailto|tel):/i.test(abs)) return;
      // Liên kết ra ngoài có target="_blank" (gói thầu trên e-GP, văn bản…): để Safari tự mở tab mới —
      // cú chạm thật của người dùng không bao giờ bị chặn cửa sổ bật lên.
      if (!parseExtensionUrl(abs, current?.page) && /^https?:/i.test(abs) && /^_blank$/i.test(anchor.getAttribute('target') || '')) return;
      event.preventDefault();
      navigateFrom(abs);
    });
    // Biểu mẫu mà mã trang quên chặn (hoặc lỗi trước khi kịp chặn): không để khung tự gửi sang máy chủ e-GP.
    win.addEventListener('submit', (event) => {
      const form = event.target;
      const method = String(form?.getAttribute?.('method') || 'get').toLowerCase();
      if (event.defaultPrevented || !form || method === 'dialog') return;
      event.preventDefault();
      note('info', entry.page, 'Biểu mẫu tự gửi (trang không tự xử lý) — đã giữ trong Cùi Bắp.');
      if (method !== 'get') return;
      // Như trình duyệt làm với biểu mẫu GET: mở lại trang kèm các ô đã nhập trên thanh địa chỉ.
      let query = '';
      try { query = new win.URLSearchParams(new win.FormData(form)).toString(); } catch { /* biểu mẫu có tệp */ }
      navigateFrom(`${(form.getAttribute('action') || entry.page).split('?')[0]}${query ? `?${query}` : ''}`);
    });
    if (navigationLive(win)) {
      try {
        win.navigation.addEventListener('navigate', (event) => {
          if (event.hashChange || event.destination?.sameDocument || event.downloadRequest != null || !event.cancelable) return;
          const dest = String(event.destination?.url || '');
          if (!dest || /^(?:blob|data|javascript|about):/i.test(dest)) return;
          event.preventDefault();
          if (event.formData) return;
          setTimeout(() => navigateFrom(dest), 0);
        });
      } catch { /* không có cũng không sao: đã có location mô phỏng và bộ bắt cú bấm */ }
    }
    watchAssets(d, entry.page);
    watchWording(d);                        // chữ viết cho Chrome → nói đúng về Safari (10-assets.js)
    d.write(html);
    d.close();
    paint(frame);                           // cỡ hiển thị + sáng/tối, TRƯỚC khi khung hiện ra
    frame.style.visibility = '';
    if (old) old.remove();
    el('splash').classList.add('gone');
    shadow.querySelector('[data-act="back"]').disabled = trail.length < 2;
    const hint = SAFARI_NOTES[entry.page];
    if (hint && !noted.has(entry.page)) { noted.add(entry.page); note('info', entry.page, `Lời nhắc trên Safari: ${hint[0]}`); toast({ id: 'luu-y', title: hint[0], message: hint[1] }); }
    return true;
  }

  function navigate(target) {
    const parsed = parseExtensionUrl(target, current?.page);
    if (!parsed) return false;
    if (parsed.page === 'mobile/iphone.html') { toast({ title: 'Anh đang dùng chính bản Safari', message: 'Cùi Bắp đang chạy ngay trên Safari — không cần bản hướng dẫn iPhone cũ nữa.' }); return false; }
    if (!FILES[parsed.page] || extOf(parsed.page) !== '.html') { toast({ title: 'Trang này không có trên Safari', message: parsed.page }); return false; }
    // Cùng trang, chỉ khác dấu #: cuộn tại chỗ như trình duyệt thường làm.
    if (current && frame && current.page === parsed.page && current.search === parsed.search && parsed.hash && parsed.hash !== current.hash) {
      try { frame.contentWindow.location.hash = parsed.hash; current = { ...current, hash: parsed.hash }; trail[trail.length - 1] = current; return true; } catch { /* dựng lại */ }
    }
    trail.push(parsed);
    if (trail.length > 40) trail.shift();
    current = parsed;
    void render(parsed);
    return true;
  }
  function back() {
    if (trail.length < 2) return false;
    trail.pop();
    current = trail[trail.length - 1];
    void render(current);
    return true;
  }

  /* ------------------------------------------------------- thao tác lùi của Safari */
  /* Vuốt từ mép trái (hay nút ‹) = lùi một mục trong lịch sử của tab. Lớp vỏ luôn giữ một mục
     "bẫy" của chính trang này ở trên cùng: lùi thì trình duyệt chỉ bỏ mục bẫy (trang không đi
     đâu), bắn `popstate`, và ta đổi nó thành "về màn hình trước của Cùi Bắp". Có trình duyệt
     bỏ qua những mục do script tự thêm khi người dùng chưa chạm gì, nên mỗi lần người dùng chạm
     vào phần mềm ta thêm lại mục bẫy trong chính cú chạm đó. */
  let trapArmed = false, trapped = 0, trapOn = false;
  function pushTrap(byGesture) {
    if (OPTS.noBackTrap) return;
    try { TOP.history.pushState({ gscb: 1 }, ''); trapArmed = Boolean(byGesture); } catch { /* trang cấm ghi lịch sử */ }
  }
  function onGesture() { if (trapOn && !trapArmed && !hub.retired && visible()) pushTrap(true); }
  function backGesture() {
    const open = shadow.querySelector('.modal.open');
    if (open) { open.classList.remove('open'); return; }
    if (stage.classList.contains('peek')) { setPeek(false); return; }
    if (back()) return;
    toast({ id: 'dau', title: 'Đang ở màn hình đầu của Cùi Bắp', message: 'Muốn về trang muasamcong thì bấm Ẩn.' });
  }
  function trapBack() {
    if (trapOn || OPTS.noBackTrap) return;
    trapOn = true;
    pushTrap(false);
    TOP.addEventListener('popstate', () => {
      if (hub.retired || !visible()) return;
      trapped++;
      pushTrap(false);
      backGesture();
    });
    shadow.addEventListener('pointerdown', onGesture, true);
  }

  /* -------------------------------------------------------------------- thông báo */
  function toast({ id, title, message, buttons = [], link, download, sticky, seconds = 9, onClick, onButton, onClose }) {
    const box = doc.createElement('div');
    box.className = 'toast';
    if (sticky) box.dataset.sticky = '1';
    if (id) { box.dataset.id = id; shadow.querySelector(`.toast[data-id="${CSS.escape(id)}"]`)?.remove(); }
    const txt = doc.createElement('div'); txt.className = 'txt';
    const b = doc.createElement('b'); b.textContent = clampText(title, 120); txt.appendChild(b);
    if (message) { const p = doc.createElement('div'); p.className = 'msg'; p.textContent = clampText(message, 400); txt.appendChild(p); }
    const row = doc.createElement('div'); row.className = 'row';
    const close = (byUser) => { box.remove(); if (onClose) onClose(byUser); };
    buttons.forEach((label, index) => { const bt = doc.createElement('button'); bt.textContent = clampText(label, 40); bt.addEventListener('click', (e) => { e.stopPropagation(); if (onButton) onButton(index); close(true); }); row.appendChild(bt); });
    if (link) {
      const a = doc.createElement('a'); a.href = link; a.rel = 'noopener';
      if (download) { a.download = download; a.textContent = 'Tải về'; } else { a.target = '_blank'; a.textContent = 'Mở'; }
      a.addEventListener('click', (e) => { e.stopPropagation(); setTimeout(() => close(true), 0); });
      row.appendChild(a);
    }
    txt.appendChild(row);
    box.appendChild(txt);
    const x = doc.createElement('button'); x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', 'Đóng thông báo'); x.addEventListener('click', (e) => { e.stopPropagation(); close(true); }); box.appendChild(x);
    if (onClick) box.addEventListener('click', () => { onClick(); close(true); });
    const holder = el('toasts');
    holder.appendChild(box);
    // Màn hình nhỏ chỉ để 2 thông báo cùng lúc (không che nội dung); bỏ cái cũ không ghim trước.
    const limit = TOP.innerWidth <= 700 ? 2 : 3;
    while (holder.children.length > limit) (holder.querySelector('.toast:not([data-sticky])') || holder.firstChild).remove();
    if (!sticky) setTimeout(() => { if (box.isConnected) close(false); }, Math.max(3, Number(seconds) || 9) * 1000);
  }

  /* ------------------------------------------------------- thông báo của tiện ích */
  /* Trên Chrome đây là thông báo của hệ điều hành. Ở đây: một cái chuông trên thanh, bấm vào
     là danh sách; thông báo mới nhất hiện thoáng qua ở góc dưới. */
  let inboxItems = new Map(), inboxHandlers = null;
  function renderInbox() {
    const count = inboxItems.size;
    el('bell').classList.toggle('has', count > 0);
    el('bell-count').textContent = String(count);
    const list = el('inbox-list');
    list.textContent = '';
    if (!count) { const none = doc.createElement('div'); none.className = 'none'; none.textContent = 'Chưa có thông báo nào.'; list.appendChild(none); return; }
    for (const [id, item] of [...inboxItems].reverse()) {
      const box = doc.createElement('div'); box.className = 'item';
      const b = doc.createElement('b'); b.textContent = clampText(item.title, 160); box.appendChild(b);
      if (item.message) { const p = doc.createElement('div'); p.textContent = clampText(item.message, 600); box.appendChild(p); }
      const when = doc.createElement('small'); when.textContent = new Date(item.at).toLocaleString('vi-VN'); box.appendChild(when);
      const row = doc.createElement('div'); row.className = 'row';
      const add = (label, main, run) => { const bt = doc.createElement('button'); if (main) bt.className = 'main'; bt.textContent = clampText(label, 40); bt.addEventListener('click', run); row.appendChild(bt); };
      add('Mở', true, () => { el('inbox').classList.remove('open'); inboxHandlers.click(id); });
      item.buttons.forEach((label, index) => add(label, false, () => { el('inbox').classList.remove('open'); inboxHandlers.button(id, index); }));
      add('Bỏ', false, () => inboxHandlers.close(id));
      box.appendChild(row);
      list.appendChild(box);
    }
  }
  function setInbox(items, handlers, fresh) {
    inboxItems = items; inboxHandlers = handlers;
    renderInbox();
    if (fresh && items.has(fresh)) {
      const item = items.get(fresh), more = items.size - 1;
      toast({ id: 'thong-bao', title: item.title, message: `${item.message}${more > 0 ? ` (+${more} thông báo khác — chạm chuông để xem)` : ''}`, onClick: () => handlers.click(fresh) });
    }
  }

  /* ------------------------------------------------------------------- chẩn đoán */
  function diagnosticsText() {
    const t = hub.tabs?.state || {};
    const source = TOP.__GSCB_SRC__ || {};
    const s = release.state || {}, hand = TOP.__GSCB_HANDOVER__;
    const lines = [
      `Giáo Sư Cùi Bắp ${PACK.version} · bản dựng ${PACK.build} · Safari`,
      `Lúc: ${new Date().toLocaleString('vi-VN')}`,
      `Trang: ${TOP.location.origin}${TOP.location.pathname}`,
      `Trình duyệt: ${TOP.navigator.userAgent}`,
      `Màn hình: ${TOP.innerWidth}×${TOP.innerHeight} · ${TOUCH ? `cảm ứng (${TOP.navigator.maxTouchPoints || 0} điểm chạm)` : 'chuột'} · cỡ hiển thị ${Math.round(prefs.zoom * 100)}% · giao diện ${isDark() ? 'tối' : 'sáng'}${prefs.theme === 'auto' ? ' (theo máy)' : ''}`,
      `Chế độ: ${t.mode === 'top' ? 'HẠN CHẾ (dùng trang cấp cao nhất)' : 'đầy đủ (khung ẩn)'}`,
      `Nạp từ: ${source.ref || '(không rõ)'}${source.cached ? ' — BẢN LƯU SẴN TRÊN MÁY (không tải được bản mới)' : ''}`,
      `Phát hành: ${hand ? `được bản ${hand.fromVersion} trao quyền (${hand.why === 'ghim' ? 'người dùng quay về bản này' : hand.why === 'cuu' ? 'bản mới mở chưa xong' : 'để sau'})` : 'chính bản này'} · bản trước ${s.truoc ? `${s.truoc.version} (${s.truoc.build})` : '(chưa có)'} · ${s.tuDong === true ? 'tự cập nhật' : 'hỏi trước khi cập nhật'}`,
      `Navigation API: ${t.navigationApi ? `có · trong khung e-GP: ${t.navigationLive === null ? 'chưa dùng' : t.navigationLive ? 'hoạt động' : 'KHÔNG hoạt động'}` : 'không (Safari đời cũ)'}`,
      `e-GP trả về: ${t.lastHeaders ? `HTTP ${t.lastHeaders.status} · X-Frame-Options: ${t.lastHeaders.xfo || '(không)'} · CSP: ${t.lastHeaders.csp || '(không)'}` : '(chưa tải trang nào)'}`,
      `Chuyển trang trong khung e-GP: bắt được ${t.intercepted || 0} · phải đoán ${t.guessedNavigations || 0} · bị chặn nhúng ${t.blockedNavigations || 0} · e-GP cấm eval: ${t.evalBlocked ? 'CÓ (đã chạy bằng script nội tuyến)' : 'không'}`,
      `Trang chính tự chuyển trang bị chặn: ${hub.guard?.blocked || 0} · tệp e-GP đã lưu: ${t.downloads || 0} · thao tác lùi của Safari đã đổi thành quay lại trong Cùi Bắp: ${trapped} (lịch sử tab: ${(() => { try { return TOP.history.length; } catch { return '?'; } })()} mục)`,
      `Khởi động: lõi ${hub.timing.background ?? '?'} ms · giao diện ${hub.timing.ui ?? '?'} ms · nối e-GP ${hub.timing.egp ?? '?'} ms`,
      `Kho dữ liệu: ${hub.store.isPersistent() ? 'lưu trên máy (IndexedDB)' : 'CHỈ TRONG BỘ NHỚ'} · ${hub.store.keyCount()} khoá · ${(hub.store.totalBytes() / 1024).toFixed(0)} KB · Safari hứa giữ lâu dài: ${hub.timing.persisted === true ? 'có' : hub.timing.persisted === false ? 'không' : 'không rõ'}`,
      `Giữ máy thức: ${prefs.wake ? (wakeHeld() ? 'đang giữ' : `bật nhưng chưa giữ được${wakeError ? ` (${clampText(wakeError, 60)})` : ''}`) : 'tắt'}${wakeSupported() ? '' : ' · Safari này không hỗ trợ'}`,
      `Trang tiện ích đang mở: ${current ? current.page + current.search : '(chưa)'} · đã mở ${loads} lượt`,
      'Tab e-GP ảo:'
    ];
    for (const tab of hub.tabs?.list() || []) lines.push(`  #${tab.id} ${tab.kind}${tab.hosted ? '/chủ động' : ''} ${tab.status}${tab.content ? ' +content' : ''} ${clampText(tab.url, 110)}${tab.error ? ` — ${tab.error}` : ''}`);
    lines.push(`Báo thức: ${hub.alarms?.all().length || 0}`);
    const errors = errorsOf();
    lines.push(`Lỗi ghi nhận: ${errors.length}`);
    for (const entry of journal.slice(-40)) lines.push(`  ${new Date(entry.t).toLocaleTimeString('vi-VN')} [${entry.level}] ${entry.where}: ${entry.text}`);
    return lines.join('\n');
  }
  function openDiagnostics() {
    for (const m of shadow.querySelectorAll('.modal.open')) m.classList.remove('open');
    el('diag-text').textContent = diagnosticsText();
    el('modal').classList.add('open');
    readRelease().then((value) => { release = value; if (el('modal').classList.contains('open')) el('diag-text').textContent = diagnosticsText(); }, () => {});
  }

  function setStatus(kind, text) {
    const chip = el('chip');
    chip.className = `chip${kind ? ` ${kind}` : ''}`;
    el('chip-text').textContent = text;
  }
  let halted = false;
  function refreshStatus() {
    if (halted) return;
    const tabs = hub.tabs?.list() || [];
    const errors = errorsOf().length;
    if (hub.tabs?.state.mode === 'top') setStatus('warn', 'Chế độ hạn chế — bấm Chẩn đoán');
    else if (tabs.some((tab) => tab.status === 'loading')) setStatus('busy', 'Đang mở trang e-GP…');
    else if (errors) setStatus('warn', `Sẵn sàng · ${errors} ghi chú lỗi`);
    else setStatus('', tabs.some((tab) => tab.content) ? 'Đã nối e-GP' : 'Sẵn sàng');
  }

  const fail = (what) => (error) => toast({ title: what, message: String(error?.message || error) });
  shadow.addEventListener('click', (event) => {
    const theme = event.target?.closest?.('[data-theme]')?.dataset.theme;
    if (theme) { prefs.theme = theme; savePrefs(); repaint(); return; }
    const act = event.target?.closest?.('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'back') back();
    else if (act === 'menu') openMenu();
    else if (act === 'menu-close') el('menu').classList.remove('open');
    else if (act === 'zoom-in' || act === 'zoom-out') {
      const at = Math.max(0, ZOOM_STEPS.indexOf(prefs.zoom)), next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, at + (act === 'zoom-in' ? 1 : -1)))];
      if (next !== prefs.zoom) { prefs.zoom = next; savePrefs(); repaint(); }
    } else if (act === 'peek') setPeek(true);
    else if (act === 'peek-off') setPeek(false);
    else if (act === 'diag' || act === 'diag-refresh') openDiagnostics();
    else if (act === 'diag-close') el('modal').classList.remove('open');
    else if (act === 'reload') TOP.location.reload();
    else if (act === 'bell') { renderInbox(); el('inbox').classList.add('open'); }
    else if (act === 'inbox-close') el('inbox').classList.remove('open');
    else if (act === 'inbox-clear') { for (const id of [...inboxItems.keys()]) inboxHandlers.close(id); }
    else if (act === 'rel-previous') { el('menu').classList.remove('open'); switchRelease('previous').then((state) => reloadForRelease(api, `Đã chọn quay về bản ${state.dung.version}`), fail('Chưa quay về được bản trước')); }
    else if (act === 'rel-newest') { el('menu').classList.remove('open'); switchRelease('newest').then((state) => reloadForRelease(api, `Đã chọn bản ${state.dung.version}`), fail('Chưa đổi được sang bản mới')); }
    else if (act === 'diag-copy') {
      const text = diagnosticsText();
      Promise.resolve().then(() => TOP.navigator.clipboard.writeText(text)).then(() => toast({ title: 'Đã chép chẩn đoán', message: 'Dán vào tin nhắn gửi người bảo trì.' }),
        () => toast({ title: 'Chưa chép được', message: 'Hãy chụp màn hình bảng chẩn đoán.' }));
    } else if (act === 'hide') hide();
  });
  shadow.addEventListener('change', (event) => {
    const name = event.target?.dataset?.el;
    if (name === 'wake') { prefs.wake = event.target.checked; savePrefs(); void applyWake(); }
    else if (name === 'rel-ask') { const ask = event.target.checked; setReleaseAsk(ask).then(() => readRelease()).then((value) => { release = value; renderMenu(); }, fail('Chưa lưu được lựa chọn')); }
  });

  /* Khi Cùi Bắp hiện: trang nền không cuộn, và khung nhìn của Safari đặt theo bề rộng máy
     (trang e-GP có thể khai báo khác; iPhone còn tự phóng to khi chạm vào ô nhập chữ nhỏ —
     maximum-scale=1 chặn việc đó, hai ngón tay vẫn phóng to được). Khi ẩn: trả lại như cũ. */
  const VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1';
  let savedOverflow = null, savedViewport = null;
  const visible = () => host.isConnected && host.style.display !== 'none';
  function show() {
    const wasHidden = !visible();
    if (!host.isConnected) doc.documentElement.appendChild(host);
    host.style.display = 'block';
    if (savedOverflow === null) { savedOverflow = doc.documentElement.style.overflow; doc.documentElement.style.overflow = 'hidden'; }
    if (savedViewport === null) {
      let meta = doc.querySelector('meta[name="viewport"]');
      savedViewport = { had: Boolean(meta), content: meta ? meta.getAttribute('content') || '' : '' };
      if (!meta) { meta = doc.createElement('meta'); meta.setAttribute('name', 'viewport'); (doc.head || doc.documentElement).appendChild(meta); }
      meta.setAttribute('content', VIEWPORT);
    }
    if (wasHidden && trapOn) pushTrap(false);                 // lúc ẩn, mục bẫy có thể đã bị lùi mất
    void applyWake();
  }
  function hide() {
    host.style.display = 'none';
    if (savedOverflow !== null) { doc.documentElement.style.overflow = savedOverflow; savedOverflow = null; }
    if (savedViewport !== null) {
      const meta = doc.querySelector('meta[name="viewport"]');
      if (meta) { if (savedViewport.had) meta.setAttribute('content', savedViewport.content); else meta.remove(); }
      savedViewport = null;
    }
    toastOutside();
  }
  /** Sau khi ẩn: một dòng nhắc nhỏ trên trang e-GP để người dùng biết cách mở lại. */
  function toastOutside() {
    const tip = doc.createElement('div');
    tip.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483646;background:#0b3b36;color:#fff;font:600 15px -apple-system,system-ui,sans-serif;padding:12px 16px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.3)';
    tip.textContent = 'Cùi Bắp đang ẩn — chạm lại dấu trang để mở.';
    doc.documentElement.appendChild(tip);
    setTimeout(() => tip.remove(), 5000);
  }

  setInterval(refreshStatus, 1000);
  onJournalError = refreshStatus;
  root.classList.toggle('dark', isDark());

  const api = {
    tabId: UI_TAB_ID, host, shadow, egpLayer,
    show, hide, navigate, back, toast, setInbox, refreshStatus, diagnosticsText, applyPrefs, trapBack, visible,
    splash(text) { el('splash-text').textContent = text; },
    /** Dừng hẳn: phủ một thông báo lên toàn bộ vùng làm việc (thanh trên cùng vẫn bấm được). */
    halt(title, text) { const box = el('splash'); box.querySelector('b').textContent = title; el('splash-text').textContent = text; box.classList.remove('gone'); box.classList.add('halted'); box.style.zIndex = '7'; setStatus('bad', title); halted = true; },
    prefs: () => ({ ...prefs, dark: isDark(), wakeHeld: wakeHeld() }),
    backTrap: () => ({ on: trapOn, armed: trapArmed, count: trapped }),
    currentUrl: () => (current ? extensionUrl(current.page, current.search, current.hash) : extensionUrl('search.html')),
    currentFrame: () => frame,
    hasPage: () => trail.length > 0
  };
  return api;
}

function createNotifications() {
  const items = new Map();
  let seq = 0;
  const publish = (fresh) => hub.ui.setInbox(items, handlers, fresh);
  const drop = (id, byUser) => { if (!items.delete(id)) return false; publish(); broadcast('notificationClosed', id, Boolean(byUser)); return true; };
  const handlers = {
    click: (id) => broadcast('notificationClicked', id),
    button: (id, index) => broadcast('notificationButton', id, index),
    close: (id) => drop(id, true)
  };
  return {
    show(id, options) {
      id = id ? String(id) : `gscb-n${++seq}`;
      items.delete(id);                                     // tạo lại cùng mã: đưa lên đầu danh sách
      items.set(id, { title: options.title || 'Giáo Sư Cùi Bắp', message: options.message || '', buttons: (options.buttons || []).map((button) => button.title || 'Mở'), at: Date.now() });
      while (items.size > 30) drop(items.keys().next().value, false);
      publish(id);
      return id;
    },
    clear(id) { return drop(String(id), false); },
    all: () => Object.fromEntries([...items.keys()].map((id) => [id, true]))
  };
}
