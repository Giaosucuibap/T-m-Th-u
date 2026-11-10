/* ============================================================================
 *  GIAO DIỆN: lớp phủ toàn màn hình trên trang muasamcong
 *
 *  Một thanh mỏng trên cùng + khung hiện trang tiện ích. Tất cả nằm trong shadow DOM
 *  để CSS của trang e-GP và của lớp vỏ không đụng nhau. Các khung e-GP ảo nằm NGAY
 *  DƯỚI khung giao diện (vẫn được trình duyệt vẽ nên script trong đó chạy bình thường,
 *  chỉ là bị che); bấm "Trang e-GP" để xem tận mắt trang thật đang được điều khiển.
 * ========================================================================== */
const UI_TAB_ID = 1;

const SHELL_CSS = `
:host{all:initial}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.root{position:fixed;inset:0;display:flex;flex-direction:column;background:#f1f5f9;color:#0f172a;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
.bar{flex:none;height:42px;display:flex;align-items:center;gap:8px;padding:0 10px;background:#0b3b36;color:#e6fffa}
.brand{font-weight:700;font-size:15px;white-space:nowrap}
.brand small{font-weight:500;opacity:.75;margin-left:6px}
.chip{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,.12);font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46vw}
.chip i{width:8px;height:8px;border-radius:50%;background:#34d399;flex:none}
.chip.busy i{background:#fbbf24}.chip.warn i{background:#fb923c}.chip.bad i{background:#f87171}
.grow{flex:1;min-width:4px}
button{font:inherit;font-weight:600;font-size:13px;color:#e6fffa;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);border-radius:8px;padding:6px 11px;min-height:32px;cursor:pointer;white-space:nowrap}
button:active{background:rgba(255,255,255,.25)}
button[disabled]{opacity:.4}
button.on{background:#f59e0b;border-color:#f59e0b;color:#1c1917}
.stage{flex:1;position:relative;min-height:0;background:#fff}
.layer{position:absolute;inset:0}
.egp{z-index:1}.ui{z-index:2;background:#fff}
.stage.peek .egp{z-index:3}
.peekbar{display:none;position:absolute;left:0;right:0;bottom:0;z-index:4;padding:10px 14px;background:#fef3c7;color:#78350f;font-weight:600;font-size:13.5px;border-top:1px solid #f59e0b;text-align:center}
.stage.peek .peekbar{display:block}
.ui iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}
.toasts{position:absolute;right:12px;bottom:12px;z-index:6;display:flex;flex-direction:column;gap:8px;max-width:min(420px,calc(100vw - 24px));pointer-events:none}
.toast{pointer-events:auto;background:#0f172a;color:#f8fafc;border-radius:12px;padding:11px 13px;box-shadow:0 10px 30px rgba(15,23,42,.35);font-size:13.5px;display:flex;gap:10px;align-items:flex-start}
.toast .txt{flex:1;min-width:0}
.toast b{display:block;margin-bottom:2px}
.toast .msg{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}
.toast .row{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
.toast .row:empty{display:none}
.toast button,.toast a{font:inherit;font-weight:600;font-size:13px;color:#0f172a;background:#e2e8f0;border:0;border-radius:8px;padding:6px 10px;text-decoration:none;min-height:30px}
.toast .x{flex:none;background:transparent;color:#cbd5e1;border:0;font-size:18px;line-height:1;padding:2px 6px;min-height:28px}
.bell{display:none;align-items:center;gap:5px}
.bell.has{display:inline-flex}
.bell svg{width:15px;height:15px;fill:currentColor}
.bell b{background:#f59e0b;color:#1c1917;border-radius:999px;padding:0 6px;font-size:12px;line-height:18px}
.short{display:none}
.list{overflow:auto;flex:1;padding:6px 16px;-webkit-overflow-scrolling:touch}
.item{padding:11px 0;border-bottom:1px solid #e2e8f0}
.item:last-child{border-bottom:0}
.item b{display:block}
.item small{color:#64748b}
.item .row{padding:8px 0 0;border:0}
.none{padding:22px 16px;color:#64748b;text-align:center}
.modal{position:absolute;inset:0;z-index:8;background:rgba(15,23,42,.55);display:none;align-items:center;justify-content:center;padding:16px}
.modal.open{display:flex}
.sheet{background:#fff;color:#0f172a;border-radius:14px;width:min(760px,100%);max-height:100%;display:flex;flex-direction:column;overflow:hidden}
.sheet h2{margin:0;padding:14px 16px;font-size:17px;border-bottom:1px solid #e2e8f0}
.sheet pre{margin:0;padding:14px 16px;overflow:auto;font:12.5px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-word;flex:1;-webkit-overflow-scrolling:touch}
.sheet .row{display:flex;gap:8px;padding:12px 16px;border-top:1px solid #e2e8f0;flex-wrap:wrap}
.sheet button{color:#0f172a;background:#e2e8f0;border-color:#cbd5e1}
.sheet button.main{background:#0f766e;border-color:#0f766e;color:#fff}
.splash{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:#f8fafc;text-align:center;padding:24px}
.splash b{font-size:20px;color:#0b3b36}.splash span{color:#475569;max-width:520px}
.splash.gone{display:none}
@media (max-width:700px){
  .bar{gap:6px;padding:0 6px}
  .brand small{display:none}
  .chip{max-width:30vw;padding:3px 8px}
  button{padding:6px 8px;font-size:12.5px}
  .toasts{left:8px;right:8px;bottom:8px;max-width:none}
  .toast{font-size:13px;padding:9px 10px}
  .toast .msg{-webkit-line-clamp:3}
}
@media (max-width:480px){
  .brand{display:none}
  .chip{max-width:none;flex:0 1 auto;min-width:0}
  .peek-btn{display:none}
  .long{display:none}.short{display:inline}
}
`;

/* Những mục của tiện ích cần thứ mà Safari trên iPad/iPhone không có. Nhắc một lần mỗi phiên. */
const SAFARI_NOTES = {
  'phone.html': ['Mục này dành cho máy tính', 'Link điện thoại là cách cho iPhone mượn máy tính Windows. Anh đang chạy Cùi Bắp ngay trên Safari nên không cần bật mục này.'],
  'hunts.html': ['Lịch tự động trên Safari', 'Safari chỉ chạy lịch khi tab muasamcong này đang mở và Cùi Bắp đang bật. Khoá máy hay đóng tab thì lượt lỡ sẽ chạy bù khi anh mở lại.'],
  'options.html': ['Quét tự động và bản tin sáng', 'Trên Safari, quét tự động và bản tin Telegram chỉ chạy khi Cùi Bắp đang mở. Tải E-HSMT cần cầu nối trên máy tính Windows nên không dùng được ở đây.']
};

function createUi() {
  const doc = TOP.document;
  const host = doc.createElement('div');
  host.id = 'gscb-safari';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:block';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${SHELL_CSS}</style>
<div class="root" part="root">
  <div class="bar">
    <button data-act="back" aria-label="Quay lại trang trước" disabled>◀</button>
    <span class="brand">Giáo Sư Cùi Bắp<small>${PACK.version} · Safari</small></span>
    <span class="chip busy" data-el="chip" role="status"><i></i><span data-el="chip-text">Đang khởi động…</span></span>
    <span class="grow"></span>
    <button class="bell" data-act="bell" data-el="bell" aria-label="Thông báo của Cùi Bắp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.4 2.4 0 0 0 2.4-2.4H9.6A2.4 2.4 0 0 0 12 22zm7.2-6V11a7.2 7.2 0 0 0-5.4-7V3.2a1.8 1.8 0 0 0-3.6 0V4a7.2 7.2 0 0 0-5.4 7v5L2.4 18.4v1.2h19.2v-1.2z"/></svg><b data-el="bell-count">0</b></button>
    <button class="peek-btn" data-act="peek" aria-pressed="false">Trang e-GP</button>
    <button data-act="diag">Chẩn đoán</button>
    <button data-act="hide" aria-label="Ẩn Cùi Bắp, về trang muasamcong">Ẩn</button>
  </div>
  <div class="stage" data-el="stage">
    <div class="layer egp" data-el="egp"></div>
    <div class="layer ui" data-el="ui"></div>
    <div class="splash" data-el="splash"><b>Giáo Sư Cùi Bắp</b><span data-el="splash-text">Đang chuẩn bị không gian tìm thầu trên Safari…</span></div>
    <div class="peekbar" data-act="diag-peek">Đây là trang muasamcong thật mà phần mềm đang điều khiển. Chỉ để xem — đừng bấm khi đang tra cứu. Chạm vào dòng này để quay về Cùi Bắp.</div>
    <div class="toasts" data-el="toasts" aria-live="polite"></div>
    <div class="modal" data-el="modal" role="dialog" aria-modal="true" aria-label="Chẩn đoán"><div class="sheet"><h2>Chẩn đoán — Cùi Bắp trên Safari</h2><pre data-el="diag-text"></pre><div class="row"><button class="main" data-act="diag-copy">Chép chẩn đoán</button><button data-act="diag-refresh">Làm mới</button><button data-act="diag-peek">Xem trang e-GP</button><button data-act="diag-close">Đóng</button></div></div></div>
    <div class="modal" data-el="inbox" role="dialog" aria-modal="true" aria-label="Thông báo"><div class="sheet"><h2>Thông báo</h2><div class="list" data-el="inbox-list"></div><div class="row"><button data-act="inbox-clear">Xoá hết</button><button class="main" data-act="inbox-close">Đóng</button></div></div></div>
  </div>
</div>`;
  const el = (name) => shadow.querySelector(`[data-el="${name}"]`);
  const stage = el('stage'), uiLayer = el('ui'), egpLayer = el('egp');

  /* ---------------------------------------------------------------- trang tiện ích */
  const history = [];
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
    win.open = (url) => { if (url) navigateFrom(String(url)); return null; };
    win.close = () => back();
    win.addEventListener('error', (event) => note('error', entry.page, `${event.message || 'Lỗi script'}${event.lineno ? ` (dòng ${event.lineno})` : ''}`));
    win.addEventListener('unhandledrejection', (event) => note('error', entry.page, `Promise bị từ chối: ${event.reason?.message || event.reason}`));
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
    d.write(html);
    d.close();
    frame.style.visibility = '';
    if (old) old.remove();
    el('splash').classList.add('gone');
    shadow.querySelector('[data-act="back"]').disabled = history.length < 2;
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
      try { frame.contentWindow.location.hash = parsed.hash; current = { ...current, hash: parsed.hash }; history[history.length - 1] = current; return true; } catch { /* dựng lại */ }
    }
    history.push(parsed);
    if (history.length > 40) history.shift();
    current = parsed;
    void render(parsed);
    return true;
  }
  function back() {
    if (history.length < 2) return;
    history.pop();
    current = history[history.length - 1];
    void render(current);
  }

  /* -------------------------------------------------------------------- thông báo */
  function toast({ id, title, message, buttons = [], link, download, sticky, onClick, onButton, onClose }) {
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
    if (!sticky) setTimeout(() => { if (box.isConnected) close(false); }, 9000);
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
    const lines = [
      `Giáo Sư Cùi Bắp ${PACK.version} · bản dựng ${PACK.build} · Safari`,
      `Lúc: ${new Date().toLocaleString('vi-VN')}`,
      `Trang: ${TOP.location.origin}${TOP.location.pathname}`,
      `Trình duyệt: ${TOP.navigator.userAgent}`,
      `Màn hình: ${TOP.innerWidth}×${TOP.innerHeight}`,
      `Chế độ: ${t.mode === 'top' ? 'HẠN CHẾ (dùng trang cấp cao nhất)' : 'đầy đủ (khung ẩn)'}`,
      `Nạp từ: ${source.ref || '(không rõ)'}${source.cached ? ' — BẢN LƯU SẴN TRÊN MÁY (không tải được bản mới)' : ''}`,
      `Navigation API: ${t.navigationApi ? `có · trong khung e-GP: ${t.navigationLive === null ? 'chưa dùng' : t.navigationLive ? 'hoạt động' : 'KHÔNG hoạt động'}` : 'không (Safari đời cũ)'}`,
      `e-GP trả về: ${t.lastHeaders ? `HTTP ${t.lastHeaders.status} · X-Frame-Options: ${t.lastHeaders.xfo || '(không)'} · CSP: ${t.lastHeaders.csp || '(không)'}` : '(chưa tải trang nào)'}`,
      `Chuyển trang trong khung e-GP: bắt được ${t.intercepted || 0} · phải đoán ${t.guessedNavigations || 0} · bị chặn nhúng ${t.blockedNavigations || 0} · e-GP cấm eval: ${t.evalBlocked ? 'CÓ (đã chạy bằng script nội tuyến)' : 'không'}`,
      `Trang chính tự chuyển trang bị chặn: ${hub.guard?.blocked || 0} · tệp e-GP đã lưu: ${t.downloads || 0}`,
      `Khởi động: lõi ${hub.timing.background ?? '?'} ms · giao diện ${hub.timing.ui ?? '?'} ms · nối e-GP ${hub.timing.egp ?? '?'} ms`,
      `Kho dữ liệu: ${hub.store.isPersistent() ? 'lưu trên máy (IndexedDB)' : 'CHỈ TRONG BỘ NHỚ'} · ${hub.store.keyCount()} khoá · ${(hub.store.totalBytes() / 1024).toFixed(0)} KB`,
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
  function openDiagnostics() { el('diag-text').textContent = diagnosticsText(); el('modal').classList.add('open'); }

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

  shadow.addEventListener('click', (event) => {
    const act = event.target?.closest?.('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'back') back();
    else if (act === 'peek') { const on = stage.classList.toggle('peek'); event.target.closest('button').classList.toggle('on', on); event.target.closest('button').setAttribute('aria-pressed', String(on)); }
    else if (act === 'diag' || act === 'diag-refresh') openDiagnostics();
    else if (act === 'diag-close') el('modal').classList.remove('open');
    else if (act === 'diag-peek') { el('modal').classList.remove('open'); const on = stage.classList.toggle('peek'); const bt = shadow.querySelector('[data-act="peek"]'); bt.classList.toggle('on', on); bt.setAttribute('aria-pressed', String(on)); }
    else if (act === 'bell') { renderInbox(); el('inbox').classList.add('open'); }
    else if (act === 'inbox-close') el('inbox').classList.remove('open');
    else if (act === 'inbox-clear') { for (const id of [...inboxItems.keys()]) inboxHandlers.close(id); }
    else if (act === 'diag-copy') {
      const text = diagnosticsText();
      Promise.resolve().then(() => TOP.navigator.clipboard.writeText(text)).then(() => toast({ title: 'Đã chép chẩn đoán', message: 'Dán vào tin nhắn gửi người bảo trì.' }),
        () => toast({ title: 'Chưa chép được', message: 'Hãy chụp màn hình bảng chẩn đoán.' }));
    } else if (act === 'hide') hide();
  });

  /* Khi Cùi Bắp hiện: trang nền không cuộn, và khung nhìn của Safari đặt theo bề rộng máy
     (trang e-GP có thể khai báo khác; iPhone còn tự phóng to khi chạm vào ô nhập chữ nhỏ —
     maximum-scale=1 chặn việc đó, hai ngón tay vẫn phóng to được). Khi ẩn: trả lại như cũ. */
  const VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1';
  let savedOverflow = null, savedViewport = null;
  function show() {
    if (!host.isConnected) doc.documentElement.appendChild(host);
    host.style.display = 'block';
    if (savedOverflow === null) { savedOverflow = doc.documentElement.style.overflow; doc.documentElement.style.overflow = 'hidden'; }
    if (savedViewport === null) {
      let meta = doc.querySelector('meta[name="viewport"]');
      savedViewport = { had: Boolean(meta), content: meta ? meta.getAttribute('content') || '' : '' };
      if (!meta) { meta = doc.createElement('meta'); meta.setAttribute('name', 'viewport'); (doc.head || doc.documentElement).appendChild(meta); }
      meta.setAttribute('content', VIEWPORT);
    }
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
    tip.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483646;background:#0b3b36;color:#fff;font:600 14px -apple-system,system-ui,sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.3)';
    tip.textContent = 'Cùi Bắp đang ẩn — chạm lại dấu trang để mở.';
    doc.documentElement.appendChild(tip);
    setTimeout(() => tip.remove(), 5000);
  }

  setInterval(refreshStatus, 1000);
  onJournalError = refreshStatus;

  return {
    tabId: UI_TAB_ID, host, shadow, egpLayer,
    show, hide, navigate, back, toast, setInbox, refreshStatus, diagnosticsText,
    splash(text) { el('splash-text').textContent = text; },
    /** Dừng hẳn: phủ một thông báo lên toàn bộ vùng làm việc (thanh trên cùng vẫn bấm được). */
    halt(title, text) { const box = el('splash'); box.querySelector('b').textContent = title; el('splash-text').textContent = text; box.classList.remove('gone'); box.style.zIndex = '7'; setStatus('bad', title); halted = true; },
    currentUrl: () => (current ? extensionUrl(current.page, current.search, current.hash) : extensionUrl('search.html')),
    currentFrame: () => frame,
    hasPage: () => history.length > 0,
    visible: () => host.isConnected && host.style.display !== 'none'
  };
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
