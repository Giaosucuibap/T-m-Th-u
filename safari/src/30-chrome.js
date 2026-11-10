/* ============================================================================
 *  chrome.* MÔ PHỎNG
 *
 *  Mỗi khung (nền, trang giao diện, trang e-GP) nhận một đối tượng `chrome` riêng,
 *  chỉ gồm những gì tiện ích thật sự dùng. Tin nhắn giữa các khung đi qua JSON và
 *  được dựng lại trong realm của bên nhận — đúng như Chrome làm giữa các tiến trình.
 * ========================================================================== */
const hub = {
  store: null,            // createStore()
  contexts: new Set(),    // mọi khung đang sống: {kind, win, tabId, url(), onMessage, events}
  tabs: null,             // bộ quản lý tab ảo (40-egp.js)
  ui: null,               // khung giao diện + thanh trên cùng (50-ui.js)
  alarms: null,
  notifications: null,
  guard: { blocked: 0 },  // số lần chặn trang muasamcong tự chuyển trang (90-main.js)
  timing: {},             // mốc khởi động (ms): nền, giao diện, nối e-GP
  retired: false          // tab này đã nhường quyền chạy cho một tab Safari khác
};

/**
 * fetch của khung nền và khung giao diện. Giữ nguyên mọi thứ, trừ hai chỗ một TRANG WEB
 * khác một tiện ích Chrome (tiện ích có host_permissions nên không chịu luật CORS):
 *   1. đường dẫn e-GP ở tên miền kia → tên miền của tab đang mở (cùng nguồn, không CORS);
 *   2. Telegram: thân JSON buộc trình duyệt "hỏi trước" (preflight). Gửi cùng nội dung
 *      dưới dạng biểu mẫu — Telegram nhận cả hai dạng — thì không phải hỏi trước.
 */
function patchFetch(win) {
  const real = win.fetch.bind(win);
  const headerOf = (headers, name) => {
    if (!headers) return '';
    if (typeof headers.get === 'function') return headers.get(name) || '';
    for (const key of Object.keys(headers)) if (key.toLowerCase() === name) return String(headers[key]);
    return '';
  };
  win.fetch = (input, init) => {
    try {
      if (typeof input === 'string' || (input && typeof input.href === 'string')) {
        const url = sameOriginEgp(String(input));
        if (/^https:\/\/api\.telegram\.org\//i.test(url) && init && typeof init.body === 'string' && /json/i.test(headerOf(init.headers, 'content-type'))) {
          const data = JSON.parse(init.body);
          const form = new win.URLSearchParams();
          for (const key of Object.keys(data || {})) {
            const value = data[key];
            if (value !== undefined && value !== null) form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
          }
          const { headers, ...rest } = init;
          void headers;
          return real(url, { ...rest, body: form });
        }
        return real(url, init);
      }
    } catch (error) { note('info', 'fetch', error); }
    return real(input, init);
  };
}

const EVENT_NAMES = ['alarm', 'tabUpdated', 'tabRemoved', 'tabCreated', 'notificationClicked', 'notificationButton', 'notificationClosed', 'installed', 'startup'];
function newContext(kind, win, extra = {}) {
  const ctx = { kind, win, tabId: null, url: () => '', onMessage: makeEvent(), events: {}, storageWatcher: null, ...extra };
  for (const name of EVENT_NAMES) ctx.events[name] = makeEvent();
  hub.contexts.add(ctx);
  return ctx;
}
function dropContext(ctx) {
  if (!ctx) return;
  hub.contexts.delete(ctx);
  if (ctx.storageWatcher) hub.store.watchers.delete(ctx.storageWatcher);
  ctx.dead = true;
}
/** Phát một sự kiện chrome.* tới mọi khung đang nghe (đối số được sao chép sang realm của khung đó). */
function broadcast(name, ...args) {
  for (const ctx of [...hub.contexts]) {
    const event = ctx.events[name];
    if (!event || !event.hasListeners()) continue;
    let copies;
    try { copies = args.map((arg) => cloneInto(ctx.win, arg)); } catch { dropContext(ctx); continue; }
    event._fire(...copies);
  }
}

function senderOf(ctx) {
  if (ctx.kind === 'content') {
    const tab = hub.tabs.info(ctx.tabId);
    const url = ctx.url();
    let origin = ''; try { origin = new URL(url).origin; } catch { /* trang lỗi */ }
    return { id: EXT_ID, url, origin, frameId: 0, tab: tab || { id: ctx.tabId, url } };
  }
  if (ctx.kind === 'page') {
    const url = ctx.url();
    return { id: EXT_ID, url, origin: EXT_ORIGIN, frameId: 0, tab: { id: hub.ui.tabId, index: 0, windowId: 1, active: true, status: 'complete', url } };
  }
  return { id: EXT_ID, url: `${EXT_ORIGIN}/background.js`, origin: EXT_ORIGIN };
}

/** Giao một tin nhắn tới các bộ nghe onMessage của những khung đích; trả lời về realm người gửi. */
function routeMessage(from, message, targets) {
  const replyWin = from.win;
  let text;
  try { text = JSON.stringify(message); } catch (error) { return Promise.reject(new replyWin.Error(`Tin nhắn không chuyển được: ${error.message}`)); }
  if (text === undefined) text = 'null';
  const live = targets.filter((ctx) => !ctx.dead && ctx.onMessage.hasListeners());
  if (!live.length) return Promise.reject(new replyWin.Error('Could not establish connection. Receiving end does not exist.'));
  const senderText = JSON.stringify(senderOf(from));
  return new Promise((resolve, reject) => {
    let settled = false, waiting = false;
    const respond = (value) => {
      if (settled) return;
      settled = true;
      try { resolve(cloneInto(replyWin, value)); } catch (error) { reject(new replyWin.Error(`Phản hồi không chuyển được: ${error.message}`)); }
    };
    Promise.resolve().then(() => {
      for (const ctx of live) {
        for (const listener of [...ctx.onMessage._listeners]) {
          let result;
          try { result = listener(ctx.win.JSON.parse(text), ctx.win.JSON.parse(senderText), respond); }
          catch (error) { note('error', `tin nhắn → ${ctx.kind}`, error); continue; }
          if (result === true) waiting = true;
          else if (result && typeof result.then === 'function') { waiting = true; result.then(respond, (error) => note('error', `tin nhắn → ${ctx.kind}`, error)); }
        }
      }
      if (!waiting) respond(undefined);
    });
  });
}

/* --------------------------------------------------------------------- báo thức */
function createAlarms(store) {
  const alarms = new Map(), timers = new Map();
  let started = false;
  const save = () => store.setMeta('alarms', JSON.stringify([...alarms.values()]));
  function arm(name) {
    clearTimeout(timers.get(name));
    const alarm = alarms.get(name);
    if (!alarm || !started) return;
    timers.set(name, setTimeout(() => due(name), Math.min(Math.max(0, alarm.scheduledTime - Date.now()), 0x7fffffff)));
  }
  function due(name) {
    const alarm = alarms.get(name);
    if (!alarm) return;
    if (alarm.scheduledTime > Date.now() + 20) { arm(name); return; }
    const fired = { ...alarm };
    if (alarm.periodInMinutes) {
      const period = alarm.periodInMinutes * 60_000;
      alarm.scheduledTime = Math.max(alarm.scheduledTime + period, Date.now() + Math.min(period, 1000));
      arm(name);
    } else { alarms.delete(name); timers.delete(name); }
    save();
    broadcast('alarm', fired);
  }
  function load() {
    try { for (const alarm of JSON.parse(store.getMeta('alarms') || '[]')) if (alarm && typeof alarm.name === 'string' && Number.isFinite(alarm.scheduledTime)) alarms.set(alarm.name, alarm); }
    catch (error) { note('error', 'báo thức', error); }
  }
  /** Gọi sau khi nền đã đăng ký onAlarm: báo thức quá hạn (tab đóng qua đêm) nổ lần lượt, như Chrome khi mở lại. */
  function start() {
    started = true;
    let stagger = 0;
    for (const alarm of alarms.values()) {
      if (alarm.scheduledTime <= Date.now()) { alarm.scheduledTime = Date.now() + 1500 + stagger; stagger += 400; }
      arm(alarm.name);
    }
    // iPad ngủ / chuyển app: hẹn giờ bị treo. Quay lại thì dò lại mọi báo thức.
    TOP.document.addEventListener('visibilitychange', () => { if (!TOP.document.hidden) for (const name of alarms.keys()) arm(name); });
  }
  function create(name, info) {
    if (typeof name === 'object' && name) { info = name; name = ''; }
    name = String(name ?? '');
    info = info || {};
    const now = Date.now();
    const period = Number(info.periodInMinutes) > 0 ? Number(info.periodInMinutes) : undefined;
    let when = Number.isFinite(Number(info.when)) && info.when != null ? Number(info.when)
      : Number.isFinite(Number(info.delayInMinutes)) && info.delayInMinutes != null ? now + Number(info.delayInMinutes) * 60_000
        : period ? now + period * 60_000 : now;
    const alarm = { name, scheduledTime: when };
    if (period) alarm.periodInMinutes = period;
    alarms.set(name, alarm);
    arm(name);
    save();
  }
  function clear(name) {
    name = String(name ?? '');
    const had = alarms.delete(name);
    clearTimeout(timers.get(name)); timers.delete(name);
    if (had) save();
    return had;
  }
  function clearAll() { for (const name of [...alarms.keys()]) clear(name); return true; }
  return { load, start, create, clear, clearAll, get: (name) => alarms.get(String(name ?? '')), all: () => [...alarms.values()] };
}

/* --------------------------------------------------------------------- tải tệp */
let downloadSeq = 0;
async function saveFile({ url, filename }) {
  const name = String(filename || 'tai-ve').split(/[\\/]/).pop() || 'tai-ve';
  let href = String(url || '');
  // data: dài dễ bị Safari từ chối; đổi sang blob cho chắc.
  if (href.startsWith('data:')) {
    try { href = URL.createObjectURL(await (await fetch(href)).blob()); setTimeout(() => URL.revokeObjectURL(href), 120_000); }
    catch (error) { note('error', 'tải tệp', error); }
  }
  const a = TOP.document.createElement('a');
  a.href = href; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
  TOP.document.documentElement.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
  // Safari có thể bỏ qua lệnh tải không xuất phát từ cú chạm của người dùng: kèm nút để tự chạm.
  hub.ui?.toast({ id: 'tai-tep', title: 'Đã tạo tệp', message: `${name} — Safari hỏi thì chọn Tải về (tệp nằm trong app Tệp › Tải về). Không thấy hỏi thì chạm nút dưới.`, link: href, download: name });
  return ++downloadSeq;
}

/* ---------------------------------------------------------- đối tượng chrome cho từng khung */
let nativeWarned = false;
function makeChrome(ctx) {
  const win = ctx.win;
  /** Trả Promise; nếu mã gọi kiểu callback thì gọi callback và đặt runtime.lastError khi lỗi. */
  const answer = (promise, callback) => {
    if (typeof callback !== 'function') return promise;
    promise.then((value) => callback(value), (error) => {
      runtime.lastError = { message: String(error?.message || error) };
      try { callback(); } finally { runtime.lastError = undefined; }
    });
    return undefined;
  };
  const lastFunction = (args) => (typeof args[args.length - 1] === 'function' ? args.pop() : undefined);

  const runtime = {
    id: EXT_ID,
    lastError: undefined,
    getManifest: () => cloneInto(win, PACK.manifest),
    getURL(path) {
      const clean = String(path || '').replace(/^\/+/, '');
      const file = clean.split(/[?#]/)[0];
      // Ảnh, phông, css: trả địa chỉ tải được. Trang và mã: trả địa chỉ chrome-extension:// để định danh.
      return FILES[file] && !['.html', '.js'].includes(extOf(file)) ? assetUrl(file) : `${EXT_ORIGIN}/${clean}`;
    },
    sendMessage(...args) {
      const callback = lastFunction(args);
      const message = typeof args[0] === 'string' && args.length > 1 ? args[1] : args[0];
      const targets = [...hub.contexts].filter((other) => other !== ctx && (other.kind === 'background' || other.kind === 'page'));
      return answer(routeMessage(ctx, message, targets), callback);
    },
    onMessage: ctx.onMessage,
    onInstalled: ctx.events.installed,
    onStartup: ctx.events.startup,
    onSuspend: makeEvent(), onConnect: makeEvent(), onMessageExternal: makeEvent(), onUpdateAvailable: makeEvent(),
    connectNative(name) {
      // Safari không có native messaging tới máy tính: báo "không tìm thấy" như Chrome khi chưa cài cầu nối.
      const port = { name: String(name || ''), onMessage: makeEvent(), onDisconnect: makeEvent(), postMessage() {}, disconnect() {} };
      if (!nativeWarned) { nativeWarned = true; hub.ui?.toast({ id: 'cau-noi', title: 'Cần máy tính cho việc này', message: 'Tải E-HSMT và Link điện thoại dùng phần mềm cầu nối trên máy tính Windows — iPad/iPhone không có. Mở gói thầu trên e-GP để tải hồ sơ bằng tay.' }); }
      setTimeout(() => {
        runtime.lastError = { message: 'Specified native messaging host not found.' };
        try { port.onDisconnect._fire(port); } finally { runtime.lastError = undefined; }
      }, 0);
      return port;
    },
    sendNativeMessage(...args) { return answer(Promise.reject(new win.Error('Specified native messaging host not found.')), lastFunction(args)); },
    openOptionsPage(callback) { return answer(Promise.resolve(hub.ui.navigate('options.html')).then(() => undefined), callback); },
    getPlatformInfo(callback) { return answer(Promise.resolve(cloneInto(win, { os: 'ios', arch: 'arm64', nacl_arch: 'arm' })), callback); },
    reload() { hub.ui?.toast({ title: 'Cần nạp lại', message: 'Tải lại trang muasamcong rồi chạm dấu trang Cùi Bắp.' }); }
  };
  if (ctx.kind === 'content') return { runtime };

  ctx.storageWatcher = { win, event: makeEvent() };
  hub.store.watchers.add(ctx.storageWatcher);
  const local = hub.store.areaFor(win);
  const storage = { local: { ...local, onChanged: makeEvent() }, onChanged: ctx.storageWatcher.event };
  // Vùng session/sync: tiện ích không dùng; có sẵn để mã dò tính năng không vấp.
  storage.session = storage.sync = storage.local;

  const tabsApi = {
    create: (props, callback) => answer(hub.tabs.create(props || {}).then((tab) => cloneInto(win, tab)), callback),
    update(...args) {
      const callback = lastFunction(args);
      const [tabId, props] = typeof args[0] === 'object' ? [hub.ui.tabId, args[0]] : args;
      return answer(hub.tabs.update(tabId, props || {}).then((tab) => cloneInto(win, tab)), callback);
    },
    get: (tabId, callback) => answer(hub.tabs.get(tabId).then((tab) => cloneInto(win, tab), (error) => { throw new win.Error(error.message); }), callback),
    query: (query, callback) => answer(hub.tabs.query(query || {}).then((list) => cloneInto(win, list)), callback),
    remove: (ids, callback) => answer(hub.tabs.remove(ids), callback),
    reload: (tabId, callback) => answer(hub.tabs.reload(tabId), callback),
    sendMessage(tabId, message, ...rest) {
      const callback = lastFunction(rest);
      const targets = [...hub.contexts].filter((other) => other.kind === 'content' && other.tabId === tabId);
      return answer(routeMessage(ctx, message, targets), callback);
    },
    onUpdated: ctx.events.tabUpdated, onRemoved: ctx.events.tabRemoved, onCreated: ctx.events.tabCreated,
    onActivated: makeEvent(), onReplaced: makeEvent()
  };

  const alarmsApi = {
    create(...args) { const callback = lastFunction(args); hub.alarms.create(args[0], args[1]); return answer(Promise.resolve(), callback); },
    clear(...args) { const callback = lastFunction(args); return answer(Promise.resolve(hub.alarms.clear(args[0])), callback); },
    clearAll(callback) { return answer(Promise.resolve(hub.alarms.clearAll()), callback); },
    get(...args) { const callback = lastFunction(args); return answer(Promise.resolve(cloneInto(win, hub.alarms.get(args[0]))), callback); },
    getAll(callback) { return answer(Promise.resolve(cloneInto(win, hub.alarms.all())), callback); },
    onAlarm: ctx.events.alarm
  };

  const notificationsApi = {
    create(...args) {
      const callback = lastFunction(args);
      const [id, options] = typeof args[0] === 'object' ? [undefined, args[0]] : args;
      return answer(Promise.resolve(hub.notifications.show(id, options || {})), callback);
    },
    update(id, options, callback) { return answer(Promise.resolve(Boolean(hub.notifications.show(id, options || {}))), callback); },
    clear(id, callback) { return answer(Promise.resolve(hub.notifications.clear(id)), callback); },
    getAll(callback) { return answer(Promise.resolve(cloneInto(win, hub.notifications.all())), callback); },
    getPermissionLevel(callback) { return answer(Promise.resolve('granted'), callback); },
    onClicked: ctx.events.notificationClicked, onButtonClicked: ctx.events.notificationButton, onClosed: ctx.events.notificationClosed
  };

  const permissions = {
    // Quyền tuỳ chọn duy nhất của tiện ích là "background" (Chrome chạy nền) — Safari không có.
    contains: (query, callback) => answer(Promise.resolve(false), callback),
    request: (query, callback) => answer(Promise.resolve(false), callback),
    remove: (query, callback) => answer(Promise.resolve(true), callback),
    getAll: (callback) => answer(Promise.resolve(cloneInto(win, { permissions: PACK.manifest.permissions, origins: PACK.manifest.host_permissions })), callback),
    onAdded: makeEvent(), onRemoved: makeEvent()
  };

  const quiet = () => Promise.resolve();
  return {
    runtime, storage, tabs: tabsApi, alarms: alarmsApi, notifications: notificationsApi, permissions,
    downloads: {
      download: (options, callback) => answer(saveFile(options || {}), callback),
      search: (query, callback) => answer(Promise.resolve(cloneInto(win, [])), callback),
      onChanged: makeEvent(), onCreated: makeEvent()
    },
    commands: { onCommand: makeEvent(), getAll: (callback) => answer(Promise.resolve(cloneInto(win, [])), callback) },
    action: { setBadgeText: quiet, setBadgeBackgroundColor: quiet, setTitle: quiet, setIcon: quiet, onClicked: makeEvent() },
    windows: { update: quiet, getCurrent: (callback) => answer(Promise.resolve(cloneInto(win, { id: 1, focused: true })), callback), WINDOW_ID_CURRENT: -2 }
  };
}
