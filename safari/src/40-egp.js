/* ============================================================================
 *  TAB e-GP ẢO
 *
 *  Trên Chrome, tiện ích mở trang tra cứu / trang chi tiết của e-GP trong các tab nền
 *  rồi để content script điều khiển. Safari không cho tiện ích mở tab kiểu đó, nên mỗi
 *  "tab" ở đây là một khung (iframe) cùng nguồn với trang muasamcong đang mở.
 *
 *  CÁCH NẠP MỘT TRANG e-GP VÀO KHUNG ("nạp chủ động"):
 *    1. fetch() lấy HTML của đúng địa chỉ đó (cùng nguồn, kèm cookie của trang);
 *    2. document.open() khung trống, history.replaceState() cho đúng địa chỉ trang;
 *    3. cài page-hook.js + content.js TRƯỚC khi viết HTML — đúng "document_start";
 *    4. document.write(HTML): trang e-GP chạy như thường, tự tải script của nó, tự
 *       sinh mã reCAPTCHA, tự phát yêu cầu tìm kiếm.
 *  Cách này không phụ thuộc X-Frame-Options (tiêu đề đó chỉ chặn khung tải qua mạng).
 *
 *  KHI TRANG TỰ CHUYỂN TRANG (bấm "Tìm kiếm" → e-GP tải lại):
 *    - Safari có Navigation API (26.2+): chặn lệnh chuyển trang, đọc ĐÚNG địa chỉ đích
 *      rồi nạp chủ động địa chỉ đó — không phải đoán gì. (Khung phải đi qua một trang
 *      about:blank thật trước, xem openableFrame trong 00-core.js.)
 *    - Safari đời cũ: để khung tự chuyển, rồi tiêm lại mã ngay khi trang mới hiện ra;
 *      nếu e-GP cấm nhúng khung thì nạp chủ động địa chỉ suy đoán và ghi vào chẩn đoán.
 *
 *  CHẾ ĐỘ HẠN CHẾ: nếu khung không dựng nổi trang tra cứu, lớp vỏ dùng chính trang
 *  muasamcong cấp cao nhất làm tab danh sách (cách bản bookmarklet cũ của tác giả vẫn
 *  làm) — khi đó phải bấm "Tìm kiếm" trên e-GP trước và không đọc được trang chi tiết.
 * ========================================================================== */
const BOOT_ID = Math.random().toString(36).slice(2, 8);

/** sessionStorage riêng cho từng tab ảo (tab Chrome thật mỗi tab một sessionStorage). */
function tabSessionStorage(tabId, win) {
  const real = win.sessionStorage, prefix = `__gscb_${BOOT_ID}_t${tabId}:`;
  const own = () => { const keys = []; for (let i = 0; i < real.length; i++) { const k = real.key(i); if (k && k.startsWith(prefix)) keys.push(k); } return keys; };
  return {
    getItem: (key) => real.getItem(prefix + key),
    setItem: (key, value) => real.setItem(prefix + key, String(value)),
    removeItem: (key) => real.removeItem(prefix + key),
    clear() { for (const key of own()) real.removeItem(key); },
    key: (index) => { const k = own()[index]; return k === undefined ? null : k.slice(prefix.length); },
    get length() { return own().length; }
  };
}
function sweepOldSessionKeys() {
  try {
    const stale = [];
    for (let i = 0; i < TOP.sessionStorage.length; i++) { const k = TOP.sessionStorage.key(i); if (k && k.startsWith('__gscb_') && !k.startsWith(`__gscb_${BOOT_ID}_`)) stale.push(k); }
    for (const key of stale) TOP.sessionStorage.removeItem(key);
  } catch { /* sessionStorage bị khoá */ }
}

const MAX_BUFFERED_FILE = 60 * 1024 * 1024;

function createTabs(layer) {
  const tabs = new Map();
  let nextId = 100;
  const state = { mode: 'frame', navigationApi: NAV_API, navigationLive: null, lastHeaders: null, intercepted: 0, guessedNavigations: 0, blockedNavigations: 0, evalBlocked: false, downloads: 0 };

  const liveUrl = (rec) => {
    if (rec.win) { try { const href = rec.win.location.href; if (href && href !== 'about:blank') rec.url = href; } catch { /* khung bị chặn */ } }
    return rec.url;
  };
  const info = (id) => {
    const rec = tabs.get(id);
    if (!rec) return null;
    let title = ''; try { title = rec.win?.document?.title || ''; } catch { /* khung bị chặn */ }
    return { id: rec.id, index: rec.index, windowId: 1, url: liveUrl(rec), title, status: rec.status, active: false, highlighted: false, pinned: false, incognito: false, autoDiscardable: false, discarded: false };
  };
  const announce = (rec, change) => broadcast('tabUpdated', rec.id, change, info(rec.id));

  function teardown(rec) {
    if (rec.ctx) { dropContext(rec.ctx); rec.ctx = null; }
    clearInterval(rec.watch); rec.watch = null;
    // Bỏ tham chiếu TRƯỚC khi gỡ khung: gỡ khung làm trang trong đó phát "pagehide",
    // và bộ nghe của ta không được tưởng đó là trang tự chuyển trang.
    const frame = rec.frame;
    rec.frame = null;
    if (rec.kind !== 'top') rec.win = null;
    if (frame) { try { frame.remove(); } catch { /* đã gỡ */ } }
  }
  const styleFrame = (frame) => {
    frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
    frame.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;border:0;background:#fff';
  };
  function complete(rec, win) {
    // rec.pending: đang nạp trang MỚI cho tab — sự kiện "load" đến muộn của trang cũ không được tính.
    if (rec.win !== win || rec.status === 'complete' || rec.pending) return;
    rec.status = 'complete';
    announce(rec, { status: 'complete' });
  }

  /**
   * Chạy `source` trong cửa sổ `win` như một hàm nhận các tham số `names`. Bình thường dùng
   * Function của chính cửa sổ đó; trang cấm eval (CSP không có 'unsafe-eval') thì chạy bằng
   * một thẻ <script> nội tuyến — trang nào của Liferay cũng phải cho phép loại này.
   */
  let slot = 0;
  function runIn(win, names, source, args) {
    try { win.Function(...names, source).apply(win, args); return; }
    catch (error) { if (!/EvalError|unsafe-eval|Content Security Policy|call to Function/i.test(`${error?.name} ${error?.message}`)) throw error; }
    state.evalBlocked = true;
    const key = `__gscb_a${++slot}`, doc = win.document;
    win[key] = { args, done: false };
    const script = doc.createElement('script');
    script.textContent = `(function(${names.join(',')}){window.${key}.done=true;\n${source}\n}).apply(window,window.${key}.args);`;
    (doc.documentElement || doc).appendChild(script);
    script.remove();
    const ran = win[key].done;
    try { delete win[key]; } catch { win[key] = undefined; }
    if (!ran) throw new Error('trang e-GP cấm cả eval lẫn script nội tuyến (CSP)');
  }

  /** Cài page-hook.js (thế giới của trang) và content.js (nhận `chrome` riêng) vào cửa sổ `win`. */
  function inject(rec, win) {
    if (!hasContentScript(liveUrl(rec))) return;
    try {
      runIn(win, [], FILES['page-hook.js'].s, []);
      const ctx = newContext('content', win, { tabId: rec.id, url: () => { try { return win.location.href; } catch { return rec.url; } } });
      rec.ctx = ctx;
      runIn(win, ['chrome', 'sessionStorage'], FILES['content.js'].s, [makeChrome(ctx), tabSessionStorage(rec.id, win)]);
    } catch (error) {
      if (rec.ctx) { dropContext(rec.ctx); rec.ctx = null; }
      rec.error = `Không cài được mã vào trang e-GP: ${error?.message || error}`;
      note('error', `tab ${rec.id}`, rec.error);
    }
  }

  function wire(rec, win) {
    win.addEventListener('load', () => complete(rec, win));
    // Một tài nguyên phụ của trang (quảng cáo, đo lường…) treo thì "load" không bao giờ tới; trang
    // dùng được từ lúc dựng xong DOM, nên sau 8 giây coi như đã tải xong thay vì để lượt tra cứu chờ hết hạn.
    win.addEventListener('DOMContentLoaded', () => setTimeout(() => complete(rec, win), 8000));
    win.addEventListener('error', (event) => { if (event?.message) note('info', `trang e-GP ${rec.id}`, clampText(event.message, 200)); });
    if (rec.kind === 'top') return;
    const live = navigationLive(win);
    state.navigationLive = live;
    let intercepted = false;
    if (live) {
      try {
        win.navigation.addEventListener('navigate', (event) => {
          if (rec.win !== win) return;
          // Đổi dấu #, đổi khung nhìn trong cùng trang (Vue router), tải tệp bằng <a download>: để trang tự lo.
          if (event.hashChange || event.destination?.sameDocument || event.downloadRequest != null || !event.cancelable) return;
          const dest = String(event.destination?.url || '');
          if (!dest || /^(?:blob|data|javascript|about):/i.test(dest)) return;
          event.preventDefault();
          intercepted = true;
          state.intercepted++;
          if (!isEgpUrl(dest)) { openExternal(dest); return; }
          const request = event.formData ? { method: 'POST', body: event.formData } : null;
          setTimeout(() => { void load(rec, dest, request); }, 0);
        });
      } catch (error) { note('info', `tab ${rec.id}`, `Navigation API không dùng được: ${error.message}`); }
    }
    win.addEventListener('pagehide', () => { if (rec.win === win && !intercepted) followNaturalNavigation(rec, win.document); });
  }

  const fileNameOf = (response, url) => {
    const cd = response.headers.get('content-disposition') || '';
    const star = cd.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i), plain = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
    let name = '';
    try { name = star ? decodeURIComponent(star[1].trim()) : plain ? plain[1].trim() : ''; } catch { name = plain ? plain[1].trim() : ''; }
    if (!name) { try { name = decodeURIComponent(new URL(url).pathname.split('/').pop() || ''); } catch { /* giữ rỗng */ } }
    return name || 'tep-tu-e-GP';
  };

  /**
   * Nạp chủ động: fetch HTML rồi viết vào một khung mới, mã của tiện ích cài trước mọi
   * script của trang. Trang cũ của tab được giữ tới khi trang mới sẵn sàng (như Chrome
   * giữ trang cũ tới lúc trang mới bắt đầu hiện); nếu máy chủ trả một TỆP chứ không
   * phải trang thì lưu tệp và giữ nguyên trang cũ.
   */
  async function load(rec, url, request = null) {
    if (hub.retired) return;
    const seq = ++rec.seq;
    url = sameOriginEgp(url);
    clearInterval(rec.watch); rec.watch = null;
    rec.status = 'loading'; rec.error = ''; rec.pending = true;
    announce(rec, { status: 'loading', url });
    const settle = () => { rec.pending = false; rec.status = 'complete'; announce(rec, { status: 'complete' }); };
    if (url === 'about:blank') { teardown(rec); rec.url = url; rec.hosted = false; settle(); return; }
    const framePromise = openableFrame(layer, styleFrame);
    let html = null, finalUrl = url, file = null, failure = '';
    try {
      const response = await TOP.fetch(url, { method: request?.method || 'GET', body: request?.body, credentials: 'include', redirect: 'follow', cache: 'no-store',
        headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } });
      finalUrl = response.url || url;
      rec.httpStatus = response.status;
      const type = (response.headers.get('content-type') || '').toLowerCase();
      state.lastHeaders = { status: response.status, xfo: response.headers.get('x-frame-options') || '', csp: clampText(response.headers.get('content-security-policy') || '', 400), type: type.split(';')[0], url: finalUrl.split('?')[0] };
      if (type && !/html|xml/.test(type)) {
        // Tệp quá lớn thì không ôm vào bộ nhớ của iPad: đưa nút để Safari tự tải ở tab mới.
        const size = Number(response.headers.get('content-length') || 0);
        if (size > MAX_BUFFERED_FILE) { try { await response.body?.cancel(); } catch { /* đã đóng */ } file = { link: finalUrl, name: fileNameOf(response, finalUrl) }; }
        else file = { blob: await response.blob(), name: fileNameOf(response, finalUrl) };
      } else html = await response.text();
    } catch (error) { failure = `Không tải được trang e-GP: ${error?.message || error}`; }
    const frame = await framePromise;
    // Trong lúc chờ: tab đã bị đóng / được giao trang khác, hoặc cả phần mềm ở tab Safari này đã dừng.
    if (seq !== rec.seq || hub.retired) { frame.remove(); return; }
    if (!failure && !file && !isEgpUrl(finalUrl)) failure = 'Trang e-GP chuyển hướng ra ngoài; không dựng được trong khung.';
    if (!failure && !file && !finalUrl.startsWith(`${HERE}/`)) failure = `e-GP chuyển sang ${new URL(finalUrl).host}; hãy mở Cùi Bắp trên đúng địa chỉ đó.`;
    if (failure) {
      frame.remove(); teardown(rec);
      rec.url = url; rec.hosted = false; rec.error = failure;
      note('error', `tab ${rec.id}`, failure);
      settle(); return;
    }
    if (file) {                                   // e-GP trả tệp (PDF, zip…): lưu xuống máy, trang đang mở giữ nguyên
      frame.remove();
      state.downloads++;
      if (file.link) hub.ui?.toast({ id: 'tep-lon', title: `Tệp lớn: ${clampText(file.name, 60)}`, message: 'Chạm "Mở" để Safari tải tệp này ở tab mới.', link: file.link, sticky: true });
      else {
        const href = URL.createObjectURL(file.blob);
        setTimeout(() => URL.revokeObjectURL(href), 120_000);
        void saveFile({ url: href, filename: file.name });
      }
      settle(); return;
    }
    teardown(rec);
    rec.frame = frame;
    const win = frame.contentWindow, doc = frame.contentDocument;
    try {
      doc.open();
      win.history.replaceState(null, '', finalUrl);
      rec.win = win; rec.url = win.location.href; rec.hosted = true; rec.pending = false;
      wire(rec, win);
      inject(rec, win);
      doc.write(html);
      doc.close();
    } catch (error) {
      rec.error = `Không dựng được trang e-GP trong khung: ${error?.message || error}`;
      note('error', `tab ${rec.id}`, rec.error);
      settle();
    }
  }

  /** Safari không có Navigation API: khung tự chuyển trang. Bám theo và tiêm lại mã sớm nhất có thể. */
  function followNaturalNavigation(rec, oldDoc) {
    const frame = rec.frame, seq = rec.seq, started = Date.now(), fromUrl = rec.url;
    if (!frame) return;
    if (rec.ctx) { dropContext(rec.ctx); rec.ctx = null; }
    rec.status = 'loading';
    announce(rec, { status: 'loading' });
    clearInterval(rec.watch);
    rec.watch = setInterval(() => {
      if (seq !== rec.seq || rec.frame !== frame) { clearInterval(rec.watch); return; }
      let doc = null, href = '', blocked = false;
      try { doc = frame.contentDocument; href = frame.contentWindow.location.href; } catch { blocked = true; }
      if (!blocked && doc && doc !== oldDoc && href && href !== 'about:blank') {
        clearInterval(rec.watch); rec.watch = null;
        const win = frame.contentWindow;
        rec.win = win; rec.url = href; rec.hosted = false;
        wire(rec, win);
        inject(rec, win);
        if (doc.readyState === 'complete') complete(rec, win);
        return;
      }
      // Bị chặn (X-Frame-Options) hoặc quá 4 giây vẫn chưa có trang mới: nạp chủ động địa chỉ suy đoán.
      if (blocked || (!doc && Date.now() - started > 1500) || Date.now() - started > 4000) {
        clearInterval(rec.watch); rec.watch = null;
        if (blocked) state.blockedNavigations++;
        const guess = guessDestination(fromUrl);
        state.guessedNavigations++;
        note('error', `tab ${rec.id}`, `Trang e-GP tự chuyển trang nhưng khung không theo được${blocked ? ' (e-GP cấm nhúng khung)' : ''}; nạp lại ${guess.split('?')[1] || guess}.`);
        void load(rec, guess);
      }
    }, 15);
  }
  /** Từ biểu mẫu tra cứu, e-GP chuyển sang màn hình kết quả của cùng trang. */
  function guessDestination(fromUrl) {
    try {
      const u = new URL(fromUrl);
      if (u.searchParams.get('render') === 'search') { u.searchParams.set('render', 'index'); return u.href; }
      return u.href;
    } catch { return SEARCH_PAGE; }
  }

  /** Mở một trang trong tab Safari mới. Safari chặn cửa sổ bật lên thì đưa nút "Mở" để người dùng tự chạm. */
  function openExternal(url) {
    let opened = null;
    // Không truyền "noopener" vào window.open: khi có nó hàm luôn trả null, không biết đã mở được chưa.
    try { opened = TOP.open(url, '_blank'); } catch { /* Safari chặn cửa sổ bật lên */ }
    if (opened) { try { opened.opener = null; } catch { /* khác nguồn */ } return true; }
    hub.ui?.toast({ id: 'mo-ngoai', title: 'Chạm "Mở" để xem trang này ở tab mới', message: clampText(url, 120), link: url, sticky: true });
    return false;
  }

  function newRecord(kind = 'frame') {
    const rec = { id: nextId++, index: tabs.size + 1, kind, url: 'about:blank', status: 'complete', frame: null, win: null, ctx: null, seq: 0, watch: null, hosted: false, pending: false, error: '' };
    tabs.set(rec.id, rec);
    return rec;
  }

  /** Dùng chính trang muasamcong cấp cao nhất làm tab (chế độ hạn chế). */
  function adoptTop() {
    for (const rec of tabs.values()) if (rec.kind === 'top') return rec;
    const rec = newRecord('top');
    rec.win = TOP; rec.url = TOP.location.href; rec.status = 'complete';
    wire(rec, TOP);
    inject(rec, TOP);
    state.mode = 'top';
    return rec;
  }

  const isExtension = (url) => String(url).startsWith(`${EXT_ORIGIN}/`) || (String(url).startsWith(`${HERE}${VIRT}`));
  const uiInfo = () => ({ id: hub.ui.tabId, index: 0, windowId: 1, url: hub.ui.currentUrl(), title: 'Giáo Sư Cùi Bắp', status: 'complete', active: true, highlighted: true, pinned: false, incognito: false });

  const STOPPED = 'Cùi Bắp ở tab Safari này đã dừng (đang chạy ở tab khác).';
  async function create(props) {
    if (hub.retired) throw new Error(STOPPED);
    const url = String(props.url || 'about:blank');
    if (isExtension(url)) { hub.ui.navigate(url); return uiInfo(); }
    if (url === 'about:blank' || isEgpUrl(url)) {
      // Không nói rõ `active`: người dùng muốn TỰ XEM trang e-GP (nút "Mở trang e-GP", bấm vào thông báo)
      // → tab Safari mới. Có `active` (true/false): tab làm việc của tiện ích → khung ẩn có content script.
      if (url !== 'about:blank' && props.active === undefined) { openExternal(sameOriginEgp(url)); return { id: nextId++, index: 99, windowId: 1, url, status: 'complete', active: true }; }
      if (state.mode === 'top' && url !== 'about:blank') throw new Error('Chế độ hạn chế: Safari này không dựng được trang e-GP trong khung, nên không mở thêm được trang e-GP.');
      const rec = newRecord();
      broadcast('tabCreated', info(rec.id));
      if (url !== 'about:blank') void load(rec, url);
      return info(rec.id);
    }
    openExternal(url);
    return { id: nextId++, index: 99, windowId: 1, url, status: 'complete', active: true };
  }
  async function update(tabId, props) {
    if (hub.retired) throw new Error(STOPPED);
    if (tabId === hub.ui.tabId) { if (props.url) hub.ui.navigate(String(props.url)); return uiInfo(); }
    const rec = tabs.get(tabId);
    if (!rec) throw new Error(`No tab with id: ${tabId}.`);
    if (props.url) {
      const url = String(props.url);
      if (rec.kind === 'top') {
        // Trang cấp cao nhất mà chuyển trang thì cả phần mềm mất theo: chỉ chấp nhận khi đã đứng đúng trang.
        if (hasContentScript(TOP.location.href) && !/detail/i.test(TOP.location.search)) return info(rec.id);
        throw new Error('Chế độ hạn chế: hãy mở trang Tra cứu › Lựa chọn nhà thầu của e-GP, bấm "Tìm kiếm" một lần, rồi chạm lại dấu trang Cùi Bắp.');
      }
      if (isExtension(url)) hub.ui.navigate(url); else void load(rec, url);
    }
    return info(rec.id);
  }
  async function get(tabId) {
    if (tabId === hub.ui.tabId) return uiInfo();
    const tab = info(tabId);
    if (!tab) throw new Error(`No tab with id: ${tabId}.`);
    return tab;
  }
  async function query(q) {
    const patterns = q.url === undefined ? null : (Array.isArray(q.url) ? q.url : [q.url]).map(patternToRegExp);
    const out = [];
    if (!patterns && q.active !== false) out.push(uiInfo());
    if (q.active === true) return out;
    for (const rec of tabs.values()) {
      const tab = info(rec.id);
      if (patterns) { let bare = tab.url; try { const u = new URL(tab.url); bare = u.origin + u.pathname + u.search; } catch { /* about:blank */ } if (!patterns.some((re) => re.test(bare))) continue; }
      if (q.status && q.status !== tab.status) continue;
      out.push(tab);
    }
    return out;
  }
  async function remove(ids) {
    for (const id of Array.isArray(ids) ? ids : [ids]) {
      const rec = tabs.get(id);
      if (!rec || rec.kind === 'top') continue;
      rec.seq++;
      teardown(rec);
      tabs.delete(id);
      broadcast('tabRemoved', id, { windowId: 1, isWindowClosing: false });
    }
  }
  async function reload(tabId) {
    const rec = tabs.get(tabId);
    if (rec && rec.kind !== 'top') void load(rec, liveUrl(rec));
  }
  /** Dừng hẳn mọi tab ảo: gỡ khung, bỏ content script, và vô hiệu MỌI lượt nạp trang còn đang dở
   *  (lượt nạp dở thấy số thứ tự đã đổi thì tự gỡ khung nó vừa tạo). */
  function shutdown() {
    for (const rec of tabs.values()) { rec.seq++; rec.pending = false; rec.status = 'complete'; teardown(rec); }
  }

  return {
    state, create, update, get, query, remove, reload, info, adoptTop, shutdown,
    list: () => [...tabs.values()].map((rec) => ({ id: rec.id, kind: rec.kind, url: liveUrl(rec), status: rec.status, hosted: rec.hosted, content: Boolean(rec.ctx), error: rec.error })),
    frames: () => [...tabs.values()].filter((rec) => rec.frame).map((rec) => rec.frame),
    openExternal
  };
}
