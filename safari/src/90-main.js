/* ============================================================================
 *  KHỞI ĐỘNG
 * ========================================================================== */
function startBackground() {
  return new Promise((resolve, reject) => {
    const frame = TOP.document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
    // 1×1 điểm ảnh, trong suốt, vẫn nằm trong vùng nhìn: Safari hãm hẹn giờ của khung "không được vẽ"
    // (display:none, cỡ 0), mà phần nền sống bằng hẹn giờ.
    frame.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    hub.ui.shadow.querySelector('.root').appendChild(frame);
    const win = frame.contentWindow, doc = frame.contentDocument;
    doc.open();
    win.history.replaceState(null, '', `${VIRT}_nen.html`);
    const ctx = newContext('background', win, { url: () => `${EXT_ORIGIN}/background.js` });
    win.chrome = makeChrome(ctx);
    patchFetch(win);
    win.addEventListener('error', (event) => note('error', 'nền', `${event.message || 'Lỗi script'}${event.lineno ? ` (dòng ${event.lineno})` : ''}`));
    win.addEventListener('unhandledrejection', (event) => note('error', 'nền', `Promise bị từ chối: ${event.reason?.message || event.reason}`));
    const timer = setTimeout(() => reject(new Error('Phần nền của tiện ích không khởi động được trong 30 giây.')), 30_000);
    win.__gscbFailed = () => { clearTimeout(timer); reject(new Error('Không nạp được mã nền của tiện ích.')); };
    win.__gscbReady = () => {
      clearTimeout(timer);
      if (!ctx.onMessage.hasListeners()) { reject(new Error('Phần nền chạy xong nhưng không đăng ký nhận tin nhắn (lỗi khi nạp mô-đun).')); return; }
      resolve(ctx);
    };
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><script type="importmap">${importMap()}</script></head><body>`
      + `<script type="module" src="${assetUrl('background.js')}" onerror="window.__gscbFailed()"></script>`
      + '<script type="module">window.__gscbReady();</script></body></html>');
    doc.close();
  });
}

/* Dấu "đang thử dựng khung": nếu lần thử trước làm cả trang muasamcong bị tải lại (trang e-GP
   tự "nhảy ra" khỏi khung), lần này không thử nữa mà vào chế độ hạn chế. Chỉ dùng trên Safari
   đời cũ: Safari có Navigation API đã có chốt chặn trang tự chuyển (guardTopNavigation), mà
   dấu này có thể nhận nhầm khi người dùng tự tải lại trang giữa lúc khởi động. */
const BOOT_FLAG = 'gscb.dang-thu-khung';
function previousAttemptKilledPage() {
  if (NAV_API) return false;
  try { const at = Number(TOP.sessionStorage.getItem(BOOT_FLAG)); return at > 0 && Date.now() - at < 180_000; } catch { return false; }
}
const setBootFlag = (on) => { try { if (on && !NAV_API) TOP.sessionStorage.setItem(BOOT_FLAG, String(Date.now())); else TOP.sessionStorage.removeItem(BOOT_FLAG); } catch { /* sessionStorage bị khoá */ } };

/**
 * Khi Cùi Bắp đang hiện, không cho trang muasamcong bên dưới TỰ chuyển trang (script của
 * e-GP tự tải lại, hoặc trang trong khung tìm cách "nhảy ra" cấp cao nhất): chuyển trang là
 * cả phần mềm biến mất giữa chừng. Người dùng tự bấm thì không chặn; đang "Ẩn" cũng không chặn.
 */
function guardTopNavigation() {
  if (!NAV_API) return;
  try {
    TOP.navigation.addEventListener('navigate', (event) => {
      if (!hub.ui.visible() || event.userInitiated || !event.cancelable) return;
      if (event.hashChange || event.destination?.sameDocument || event.downloadRequest != null) return;
      event.preventDefault();
      hub.guard.blocked++;
      note('info', 'trang chính', `Đã chặn trang muasamcong tự chuyển sang ${clampText(String(event.destination?.url || '').split('?')[1] || event.destination?.url, 120)} để Cùi Bắp không bị đóng.`);
    });
  } catch (error) { note('info', 'trang chính', `Không gắn được chốt chuyển trang: ${error.message}`); }
}

/**
 * MỘT TAB MỘT LÚC. Trên Chrome tiện ích chỉ có một phần nền; ở đây mỗi tab Safari chạm dấu
 * trang là một phần nền riêng nhưng dùng CHUNG một kho IndexedDB — hai tab cùng chạy sẽ ghi
 * đè dữ liệu của nhau. Tab mở sau giành quyền (Web Locks, steal); tab trước tự dừng hẳn và
 * báo rõ. Safari quá cũ không có Web Locks thì không có chốt này.
 */
function claimSingleInstance() {
  const locks = TOP.navigator.locks;
  if (!locks || typeof locks.request !== 'function') return;
  try {
    locks.request('gscb-safari-dang-chay', { steal: true }, () => new Promise(() => {})).catch(() => retire());
  } catch { /* Safari không nhận tuỳ chọn steal */ }
}
function retire() {
  if (hub.retired) return;
  hub.retired = true;
  hub.store?.freeze();
  for (const ctx of [...hub.contexts]) dropContext(ctx);
  for (const frame of [...hub.ui.shadow.querySelectorAll('iframe')]) { try { frame.remove(); } catch { /* đã gỡ */ } }
  hub.ui.halt('Cùi Bắp đang chạy ở một tab Safari khác', 'Mỗi lúc chỉ một tab được chạy để dữ liệu không ghi đè nhau. Về tab kia để dùng tiếp; muốn dùng ở tab này thì tải lại trang rồi chạm dấu trang Cùi Bắp.');
}

/** Thử dựng trang tra cứu e-GP trong khung ẩn. Được → chế độ đầy đủ; không → chế độ hạn chế. */
async function chooseMode(background) {
  if (OPTS.forceTop) return { ok: false, reason: 'ép chế độ hạn chế (kiểm thử)' };
  if (previousAttemptKilledPage()) {
    setBootFlag(false);
    return { ok: false, reason: 'lần mở trước, trang e-GP dựng trong khung đã làm cả trang muasamcong tải lại' };
  }
  setBootFlag(true);
  let tab;
  try { tab = await hub.tabs.create({ url: SEARCH_PAGE, active: false }); }
  catch (error) { setBootFlag(false); return { ok: false, reason: String(error?.message || error) }; }
  const deadline = Date.now() + (OPTS.probeMs || 30_000);
  let last = 'trang e-GP chưa sẵn sàng';
  while (Date.now() < deadline) {
    const rec = hub.tabs.list().find((entry) => entry.id === tab.id);
    if (rec?.error) { last = rec.error; break; }                       // không tải / không dựng được: chờ thêm cũng vô ích
    const content = [...hub.contexts].find((ctx) => ctx.kind === 'content' && ctx.tabId === tab.id);
    if (content) {
      try {
        const probe = await routeMessage(background, { type: 'KQLCNT_PROBE' }, [content]);
        if (probe?.pageError) { last = `trang e-GP báo lỗi ${probe.pageError}`; break; }
        if (probe?.ok && (probe.searchView || probe.resultsView)) { setBootFlag(false); return { ok: true, tabId: tab.id }; }
        last = 'trang e-GP đã tải nhưng chưa hiện ô tìm kiếm';
      } catch (error) { last = String(error?.message || error); }
    }
    await sleep(300);
  }
  await hub.tabs.remove(tab.id);
  setBootFlag(false);
  return { ok: false, reason: last };
}

async function boot() {
  if (!EGP_ORIGINS.includes(HERE)) {
    TOP.alert('Giáo Sư Cùi Bắp chỉ chạy trên trang muasamcong.mof.gov.vn. Hãy mở trang đó rồi chạm lại dấu trang.');
    return;
  }
  sweepOldSessionKeys();
  const started = Date.now();
  hub.ui = createUi();
  hub.ui.show();
  guardTopNavigation();
  claimSingleInstance();
  TOP.__GSCB_SAFARI__ = {
    version: PACK.version, build: PACK.build,
    show: () => hub.ui.show(), hide: () => hub.ui.hide(),
    diagnostics: () => hub.ui.diagnosticsText(),
    _hub: hub, _journal: journal, _timing: hub.timing
  };
  try {
    hub.store = createStore();
    await hub.store.init();
    if (hub.retired) return;
    // Dấu trang vừa tải được tệp từ GitHub: cất một bản vào máy để lần sau mất mạng vẫn chạy được.
    const source = TOP.__GSCB_SRC__;
    if (source && typeof source.text === 'string') { const text = source.text; source.text = null; void hub.store.keepBundle(text, `${PACK.version}/${PACK.build}`); }
    hub.alarms = createAlarms(hub.store);
    hub.alarms.load();
    hub.notifications = createNotifications();
    hub.tabs = createTabs(hub.ui.egpLayer);

    hub.ui.splash('Đang khởi động phần lõi của tiện ích…');
    const background = await startBackground();
    if (hub.retired) return;
    hub.timing.background = Date.now() - started;

    const installed = hub.store.getMeta('installedVersion');
    if (!installed) broadcast('installed', { reason: 'install' });
    else if (installed !== PACK.version) broadcast('installed', { reason: 'update', previousVersion: installed });
    await hub.store.setMeta('installedVersion', PACK.version);
    broadcast('startup');
    hub.alarms.start();

    // Lần đầu: nền tự mở trang "Bắt đầu sử dụng". Các lần sau: vào thẳng Tìm gói thầu.
    await sleep(60);
    if (!hub.ui.hasPage()) hub.ui.navigate('search.html');
    hub.timing.ui = Date.now() - started;
    // Lần đầu trên máy này: các trang của tiện ích viết cho Chrome, nói rõ một lần cho khỏi hiểu lầm.
    if (!installed) hub.ui.toast({ id: 'chao', title: 'Cùi Bắp đang chạy ngay trên Safari', sticky: true,
      message: 'Chỗ nào trong phần mềm ghi "Chrome" thì ở đây là Safari trên máy này: dữ liệu lưu trong Safari, không gửi đi đâu. Mỗi lần mở lại trang muasamcong, chạm dấu trang Cùi Bắp một lần.' });
    if (!hub.store.isPersistent()) hub.ui.toast({ title: 'Dữ liệu chưa lưu được xuống máy', message: 'Safari đang chặn lưu trữ (duyệt riêng tư?). Kết quả vẫn xem được nhưng sẽ mất khi đóng tab.', sticky: true });
    if (TOP.__GSCB_SRC__?.cached) hub.ui.toast({ title: 'Đang dùng bản lưu sẵn trên máy', message: 'Không tải được bản mới nhất (mạng yếu hoặc GitHub không vào được). Phần mềm vẫn chạy bằng bản lần trước.' });
    if (TOP.location.hostname !== EGP_HOSTS[0]) hub.ui.toast({ title: 'Anh đang ở địa chỉ cũ của e-GP', sticky: true, link: `https://${EGP_HOSTS[0]}/vi/web/guest/contractor-selection?render=search`,
      message: `Phần mềm chạy đúng nhất ở ${EGP_HOSTS[0]}. Chạm "Mở" để sang địa chỉ mới, rồi chạm lại dấu trang Cùi Bắp.` });

    const mode = await chooseMode(background);
    if (hub.retired) return;
    hub.timing.egp = Date.now() - started;
    if (!mode.ok) {
      note('error', 'khởi động', `Không dựng được trang e-GP trong khung ẩn: ${mode.reason}`);
      if (hasContentScript(TOP.location.href)) {
        hub.tabs.adoptTop();
        hub.ui.toast({ title: 'Đang chạy ở chế độ hạn chế', sticky: true,
          message: 'Safari này không dựng được trang e-GP trong khung ẩn. Vẫn tìm được gói, nhưng trước mỗi phiên hãy bấm "Tìm kiếm" một lần trên trang e-GP rồi chạm lại dấu trang; không đọc được biên bản mở thầu. Bấm Chẩn đoán và gửi ảnh cho người bảo trì.' });
      } else {
        hub.ui.toast({ title: 'Chưa nối được e-GP', sticky: true,
          message: 'Hãy mở trang Tra cứu › Lựa chọn nhà thầu của muasamcong, bấm "Tìm kiếm" một lần, rồi chạm lại dấu trang Cùi Bắp.' });
      }
    }
    hub.ui.refreshStatus();
  } catch (error) {
    if (hub.retired) return;
    note('error', 'khởi động', error);
    hub.ui.halt('Không khởi động được', `${error?.message || error}. Bấm "Chẩn đoán" rồi gửi ảnh cho người bảo trì.`);
    hub.ui.refreshStatus();
  }
}

if (TOP.__GSCB_SAFARI__) TOP.__GSCB_SAFARI__.show();
else void boot();
