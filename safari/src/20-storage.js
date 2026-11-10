/* ============================================================================
 *  KHO CỦA TIỆN ÍCH (chrome.storage.local) TRÊN IndexedDB CỦA SAFARI
 *
 *  Giữ đúng ngữ nghĩa của Chrome: giá trị đi qua JSON, đọc ra là bản sao, mỗi lần ghi
 *  phát onChanged cho mọi khung. Dữ liệu nằm trong IndexedDB của trang muasamcong
 *  trên chính máy này — không gửi đi đâu. Không mở được IndexedDB (duyệt riêng tư
 *  đời cũ) thì chạy tạm trong bộ nhớ và báo rõ là dữ liệu sẽ mất khi đóng tab.
 *
 *  Ba ngăn: `local` (chrome.storage.local của tiện ích), `meta` (việc riêng của lớp vỏ:
 *  báo thức, bản đã cài) và `goi` — BẢN DỰ PHÒNG của chính tệp cuibap.js đang chạy.
 *  Dấu trang đọc ngăn `goi` (khoá `js`) khi không tải được tệp từ GitHub; tên kho, tên
 *  ngăn và tên khoá vì thế phải khớp với mã dấu trang trong safari/build.mjs.
 * ========================================================================== */
const DB_NAME = 'gscb-safari';

function idbOpen() {
  return new Promise((resolve) => {
    let request;
    try { request = TOP.indexedDB.open(DB_NAME, 1); } catch { resolve(null); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of ['local', 'meta', 'goi']) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}
function idbReadAll(db, store) {
  return new Promise((resolve, reject) => {
    const out = new Map();
    const cursor = db.transaction(store, 'readonly').objectStore(store).openCursor();
    cursor.onsuccess = () => { const c = cursor.result; if (!c) { resolve(out); return; } out.set(String(c.key), c.value); c.continue(); };
    cursor.onerror = () => reject(cursor.error);
  });
}
function idbWrite(db, store, { puts = [], dels = [], clear = false }) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    if (clear) os.clear();
    for (const key of dels) os.delete(key);
    for (const [key, value] of puts) os.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Giao dịch IndexedDB bị huỷ.'));
  });
}

function createStore() {
  const memory = new Map();          // khoá → chuỗi JSON
  const meta = new Map();            // dữ liệu riêng của lớp vỏ (báo thức, bản đã cài)
  const watchers = new Set();        // {win, event} của từng khung đang nghe onChanged
  let db = null, chain = Promise.resolve(), lastWriteError = '', frozen = false;

  async function init() {
    db = await idbOpen();
    if (!db) { note('error', 'kho', 'Không mở được IndexedDB — dữ liệu chỉ nằm trong bộ nhớ của tab này.'); return; }
    try {
      for (const [key, value] of await idbReadAll(db, 'local')) if (typeof value === 'string') memory.set(key, value);
      for (const [key, value] of await idbReadAll(db, 'meta')) meta.set(key, value);
    } catch (error) { note('error', 'kho', error); }
    // Xin Safari giữ dữ liệu lâu dài (không bắt buộc được cấp).
    try { TOP.navigator.storage?.persist?.().catch(() => {}); } catch { /* không hỗ trợ */ }
  }

  function persist(store, change) {
    if (!db || frozen) return Promise.resolve();
    chain = chain.then(() => idbWrite(db, store, change)).catch((error) => {
      lastWriteError = String(error?.message || error);
      note('error', 'kho', `Không ghi được dữ liệu xuống máy: ${lastWriteError}`);
    });
    return chain;
  }

  function wantedKeys(keys) {
    if (keys === undefined || keys === null) return { names: [...memory.keys()], defaults: null };
    if (typeof keys === 'string') return { names: [keys], defaults: null };
    if (Array.isArray(keys)) return { names: keys.map(String), defaults: null };
    if (typeof keys === 'object') return { names: Object.keys(keys), defaults: keys };
    throw new TypeError('Tham số khoá của storage không hợp lệ.');
  }

  function read(win, keys) {
    const { names, defaults } = wantedKeys(keys);
    const out = new win.Object();
    for (const name of names) {
      if (memory.has(name)) out[name] = win.JSON.parse(memory.get(name));
      else if (defaults && defaults[name] !== undefined) out[name] = cloneInto(win, defaults[name]);
    }
    return out;
  }

  function announce(changes) {
    const names = Object.keys(changes);
    if (!names.length) return;
    for (const watcher of [...watchers]) {
      if (!watcher.event.hasListeners()) continue;
      let copy;
      try {
        copy = new watcher.win.Object();
        for (const name of names) {
          const change = new watcher.win.Object();
          if (changes[name].oldText !== undefined) change.oldValue = watcher.win.JSON.parse(changes[name].oldText);
          if (changes[name].newText !== undefined) change.newValue = watcher.win.JSON.parse(changes[name].newText);
          copy[name] = change;
        }
      } catch { watchers.delete(watcher); continue; }   // khung đã bị huỷ
      watcher.event._fire(copy, 'local');
    }
  }

  function write(items) {
    if (!items || typeof items !== 'object') return Promise.reject(new TypeError('storage.set cần một đối tượng.'));
    const changes = {}, puts = [];
    for (const name of Object.keys(items)) {
      const text = JSON.stringify(items[name]);
      if (text === undefined) continue;
      const old = memory.get(name);
      if (old === text) continue;
      memory.set(name, text);
      puts.push([name, text]);
      changes[name] = { oldText: old, newText: text };
    }
    return persist('local', { puts }).then(() => announce(changes));
  }

  function remove(keys) {
    const names = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys.map(String) : [];
    const changes = {}, dels = [];
    for (const name of names) {
      if (!memory.has(name)) continue;
      changes[name] = { oldText: memory.get(name), newText: undefined };
      memory.delete(name);
      dels.push(name);
    }
    return persist('local', { dels }).then(() => announce(changes));
  }

  function clear() {
    const changes = {};
    for (const [name, text] of memory) changes[name] = { oldText: text, newText: undefined };
    memory.clear();
    return persist('local', { clear: true }).then(() => announce(changes));
  }

  function bytes(keys) {
    const { names } = wantedKeys(keys);
    let total = 0;
    for (const name of names) if (memory.has(name)) total += name.length + memory.get(name).length;
    return total;
  }

  /** Vùng storage cho một khung (`win`): trả Promise, và vẫn gọi callback nếu mã cũ truyền vào. */
  function areaFor(win) {
    const done = (promise, callback) => {
      if (typeof callback === 'function') { promise.then((value) => callback(value), (error) => { note('error', 'kho', error); callback(); }); return undefined; }
      return promise;
    };
    return {
      QUOTA_BYTES: 10 * 1024 * 1024 * 1024,
      get(keys, callback) { if (typeof keys === 'function') { callback = keys; keys = null; } return done(Promise.resolve().then(() => read(win, keys)), callback); },
      set(items, callback) { return done(write(items), callback); },
      remove(keys, callback) { return done(remove(keys), callback); },
      clear(callback) { return done(clear(), callback); },
      getBytesInUse(keys, callback) { if (typeof keys === 'function') { callback = keys; keys = null; } return done(Promise.resolve().then(() => bytes(keys)), callback); },
      setAccessLevel() { return Promise.resolve(); }
    };
  }

  return {
    init, areaFor, watchers,
    isPersistent: () => Boolean(db) && !lastWriteError,
    writeError: () => lastWriteError,
    keyCount: () => memory.size,
    totalBytes: () => bytes(null),
    /** Tab này đã nhường quyền cho tab khác: thôi ghi xuống máy. */
    freeze() { frozen = true; },
    getMeta: (key) => meta.get(key),
    setMeta(key, value) { meta.set(key, value); return persist('meta', { puts: [[key, value]] }); },
    /** Cất bản dự phòng của tệp đang chạy (không giữ trong bộ nhớ; mỗi bản dựng chỉ ghi một lần). */
    keepBundle(text, build) {
      if (!db || meta.get('goi-ban') === build) return Promise.resolve(false);
      meta.set('goi-ban', build);
      return persist('goi', { puts: [['js', text]] }).then(() => persist('meta', { puts: [['goi-ban', build]] })).then(() => true);
    }
  };
}
