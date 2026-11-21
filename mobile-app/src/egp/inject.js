/* ============================================================================
 *  MÃ TIÊM VÀO TRANG e-GP TRONG APP (WebView)
 *
 *  Ở tiện ích Chrome: page-hook.js chạy trong trang (MAIN world), content.js chạy
 *  ở vùng riêng (ISOLATED world) và nói chuyện với service worker qua
 *  chrome.runtime. Trong app không có Chrome: cả hai tệp được tiêm ngay khi
 *  trang bắt đầu tải (injectedJavaScriptBeforeContentLoaded), và một LỚP ĐỆM
 *  nhỏ thay chrome.runtime bằng kênh nhắn tin của WebView
 *  (window.ReactNativeWebView.postMessage ↔ window.__gscbFromApp).
 *
 *  - content.js được bọc trong function(chrome){…}: biến `chrome` chỉ là lớp đệm,
 *    trang e-GP KHÔNG thấy window.chrome giả nào.
 *  - page-hook.js tiêm nguyên văn (nó không dùng API trình duyệt nào ngoài trang).
 *  - Hai tệp chỉ chạy ở trang Tra cứu Lựa chọn nhà thầu — đúng phạm vi
 *    content_scripts trong manifest.json của tiện ích.
 *  - Trang được ép bố cục máy tính (viewport 1280): content.js được viết và
 *    kiểm thử trên giao diện máy tính của e-GP; bố cục điện thoại có thể ẩn ô
 *    tìm kiếm nâng cao.
 *  - Mỗi lỗi tiêm được bắt riêng và báo về app, không làm hỏng trang e-GP.
 * ========================================================================== */
import { PAGE_HOOK_SOURCE, CONTENT_SOURCE, EXTENSION_VERSION } from './injected.generated.js';

export { EXTENSION_VERSION };

/** Lớp đệm chrome.runtime ↔ WebView. Chuỗi mã thuần ES5, chạy trên WebKit (iPhone) và Chromium (Android). */
export const SHIM_SOURCE = String.raw`(function () {
  if (window.__gscbChrome) return;
  // Mã lượt gửi mang dấu riêng của TỪNG lần tải trang: trang e-GP tự tải lại giữa
  // lượt tra cứu, câu trả lời muộn cho trang cũ không được khớp nhầm yêu cầu mới.
  var page = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  var queue = [], pending = {}, listeners = [], seq = 0;
  function flush() {
    var rn = window.ReactNativeWebView;
    if (!rn || typeof rn.postMessage !== 'function') return false;
    while (queue.length) rn.postMessage(queue.shift());
    return true;
  }
  // Kênh nhắn tin của WebView có thể chưa gắn xong ở mili-giây đầu: xếp hàng, gửi khi có.
  function post(obj) {
    queue.push(JSON.stringify(obj));
    if (!flush()) { var tries = 0; var t = setInterval(function () { if (flush() || ++tries > 200) clearInterval(t); }, 50); }
  }
  var runtime = {
    id: 'gscb-mobile',
    sendMessage: function (message) {
      return new Promise(function (resolve) {
        var id = page + '.' + (++seq);
        pending[id] = resolve;
        post({ kind: 'send', id: id, message: message });
        setTimeout(function () { if (pending[id]) { delete pending[id]; resolve(undefined); } }, 30000);
      });
    },
    onMessage: { addListener: function (fn) { listeners.push(fn); } },
    getURL: function (p) { return String(p || ''); }
  };
  window.__gscbChrome = { runtime: runtime };
  // App → trang: trả lời một lần gửi, hoặc giao một lệnh (KQLCNT_PROBE, KQLCNT_START…).
  window.__gscbFromApp = function (raw) {
    var msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!msg) return;
    if (msg.kind === 'reply') {
      var resolve = pending[msg.id];
      if (resolve) { delete pending[msg.id]; resolve(msg.response); }
      return;
    }
    if (msg.kind === 'command') {
      var answered = false;
      var sendResponse = function (response) {
        if (answered) return;
        answered = true;
        post({ kind: 'commandReply', id: msg.id, response: response === undefined ? null : response });
      };
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](msg.message, { id: 'gscb-mobile' }, sendResponse); }
        catch (e) { sendResponse({ ok: false, message: String((e && e.message) || e) }); }
      }
      // Không ai nhận lệnh: trả lời để app không chờ vô ích.
      setTimeout(function () { sendResponse({ ok: false, unhandled: true }); }, 15000);
    }
  };
  window.__gscbPostError = function (where, e) { post({ kind: 'injectError', where: where, message: String((e && e.message) || e) }); };
})();`;

/** Ép bố cục máy tính: sửa thẻ viewport ngay khi trình duyệt đọc tới nó. */
export const VIEWPORT_SOURCE = String.raw`(function () {
  var WANT = 'width=1280';
  function fix(node) { if (node && node.tagName === 'META' && String(node.getAttribute('name') || '').toLowerCase() === 'viewport' && node.getAttribute('content') !== WANT) node.setAttribute('content', WANT); }
  function scan() { var list = document.getElementsByTagName('meta'); for (var i = 0; i < list.length; i++) fix(list[i]); }
  var mo = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) { var added = records[i].addedNodes; for (var j = 0; j < added.length; j++) fix(added[j]); }
  });
  mo.observe(document.documentElement || document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', function () {
    scan();
    if (!document.querySelector('meta[name="viewport"]') && document.head) {
      var m = document.createElement('meta'); m.setAttribute('name', 'viewport'); m.setAttribute('content', WANT); document.head.appendChild(m);
    }
    setTimeout(function () { mo.disconnect(); }, 4000);
  });
})();`;

/** Chỉ trang Tra cứu Lựa chọn nhà thầu trên hai tên miền e-GP — như manifest.json. */
export const SEARCH_PAGE_TEST = String.raw`/^muasamcong\.(?:mof|mpi)\.gov\.vn$/.test(location.hostname) && /\/web\/guest\/contractor-selection/.test(location.pathname)`;

/** Ghép mã tiêm: lớp đệm → viewport → page-hook.js → content.js (bọc), mỗi phần một khối try/catch. */
export function buildInjectedScript() {
  const guard = (where, code) => `try {\n${code}\n} catch (e) { window.__gscbPostError && window.__gscbPostError(${JSON.stringify(where)}, e); }\n`;
  return [
    `/* Giáo Sư Cùi Bắp — lõi tra cứu e-GP ${EXTENSION_VERSION} (app) */`,
    guard('shim', SHIM_SOURCE),
    guard('viewport', VIEWPORT_SOURCE),
    guard('page-hook', `if (${SEARCH_PAGE_TEST}) {\n${PAGE_HOOK_SOURCE}\n}`),
    guard('content', `if (${SEARCH_PAGE_TEST}) (function (chrome) {\n${CONTENT_SOURCE}\n})(window.__gscbChrome);`),
    'true;'
  ].join('\n');
}

/** Câu lệnh app chạy trong trang để giao một tin nhắn (dùng với webview.injectJavaScript). */
export function deliverScript(message) {
  // U+2028/U+2029 hợp lệ trong JSON nhưng là dấu xuống dòng với bộ chạy JS cũ: thoát chúng.
  const literal = JSON.stringify(JSON.stringify(message))
    .split(String.fromCharCode(0x2028)).join('\\u2028')
    .split(String.fromCharCode(0x2029)).join('\\u2029');
  return `window.__gscbFromApp && window.__gscbFromApp(${literal}); true;`;
}
