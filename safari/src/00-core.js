/* ============================================================================
 *  GIÁO SƯ CÙI BẮP — CHẠY THẲNG TRÊN SAFARI (iPad / iPhone)
 *
 *  Tệp này chạy BÊN TRONG trang muasamcong đang mở trong Safari (do dấu trang nạp).
 *  Nó dựng một "trình duyệt tiện ích" thu nhỏ ngay trong tab đó:
 *
 *    trang muasamcong (cấp cao nhất) ── lớp vỏ (tệp này)
 *       ├─ khung NỀN      : background.js của tiện ích, nguyên văn, với chrome.* mô phỏng
 *       ├─ khung GIAO DIỆN: các trang search.html, plans.html… nguyên văn
 *       └─ khung e-GP     : trang tra cứu / trang chi tiết THẬT của muasamcong,
 *                           có page-hook.js + content.js nguyên văn (như tab Chrome)
 *
 *  Không máy tính, không máy chủ trung gian: mọi yêu cầu tới e-GP vẫn do chính trang
 *  e-GP phát đi, kèm mã reCAPTCHA của nó — đúng cơ chế của tiện ích trên Chrome.
 * ========================================================================== */
const TOP = window;
const EXT_ID = PACK.id;
const EXT_ORIGIN = `chrome-extension://${EXT_ID}`;
const VIRT = '/__gscb__/';                       // địa chỉ ảo của các trang tiện ích trong tab e-GP
const EGP_HOSTS = ['muasamcong.mof.gov.vn', 'muasamcong.mpi.gov.vn'];
const EGP_ORIGINS = EGP_HOSTS.map((h) => `https://${h}`);
const HERE = TOP.location.origin;
const SEARCH_PAGE = `${HERE}/vi/web/guest/contractor-selection?render=search`;
const OPTS = TOP.__GSCB_OPTS__ || {};            // chỉ dùng khi kiểm thử

/* ------------------------------------------------------------- nhật ký chẩn đoán */
const journal = [];
function note(level, where, message) {
  const text = String(message && message.stack ? `${message.message}` : message).slice(0, 600);
  journal.push({ t: Date.now(), level, where, text });
  if (journal.length > 400) journal.shift();
  if (level === 'error' && TOP.console) { try { TOP.console.warn(`[Cùi Bắp/${where}] ${text}`); } catch { /* im lặng */ } }
  if (level === 'error' && typeof onJournalError === 'function') onJournalError();
}
let onJournalError = null;
const errorsOf = () => journal.filter((e) => e.level === 'error');

/* --------------------------------------------------------------------- tiện ích */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clampText = (value, max = 300) => String(value == null ? '' : value).slice(0, max);

/** Sao chép giá trị sang realm của `win` theo đúng kiểu nhắn tin của tiện ích (JSON). */
function cloneInto(win, value) {
  if (value === undefined) return undefined;
  const text = JSON.stringify(value);
  return text === undefined ? undefined : win.JSON.parse(text);
}

/** Sự kiện kiểu chrome.*: addListener / removeListener / hasListener. */
function makeEvent() {
  const listeners = new Set();
  return {
    addListener(fn) { if (typeof fn === 'function') listeners.add(fn); },
    removeListener(fn) { listeners.delete(fn); },
    hasListener(fn) { return listeners.has(fn); },
    hasListeners() { return listeners.size > 0; },
    _listeners: listeners,
    _fire(...args) { for (const fn of [...listeners]) { try { fn(...args); } catch (error) { note('error', 'sự kiện', error); } } }
  };
}

function isEgpUrl(value) {
  try {
    const u = new URL(String(value || ''));
    return u.protocol === 'https:' && EGP_HOSTS.includes(u.hostname.toLowerCase()) && !u.username && !u.password && !u.port;
  } catch { return false; }
}

/** Mẫu URL kiểu Chrome (`https://host/*contractor-selection*`) → biểu thức chính quy. */
function patternToRegExp(pattern) {
  if (pattern === '<all_urls>') return /^https?:\/\//;
  return new RegExp(`^${String(pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
}
const CONTENT_PATTERNS = [...new Set(PACK.manifest.content_scripts.flatMap((entry) => entry.matches))].map(patternToRegExp);
/** Trang này có thuộc phạm vi content script của tiện ích không (như manifest khai báo). */
function hasContentScript(url) {
  try { const u = new URL(url); const bare = u.origin + u.pathname + u.search; return CONTENT_PATTERNS.some((re) => re.test(bare)); } catch { return false; }
}

/** `chrome-extension://<mã>/search.html?x#y`, `/__gscb__/search.html`, `search.html` → {page, search, hash}. */
function parseExtensionUrl(value, basePage = 'search.html') {
  const text = String(value || '');
  let u;
  try {
    if (text.startsWith(`${EXT_ORIGIN}/`)) u = new URL(text.slice(EXT_ORIGIN.length), 'https://x');
    else if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
      const abs = new URL(text);
      if (abs.origin !== HERE || !abs.pathname.startsWith(VIRT)) return null;
      u = new URL(abs.pathname.slice(VIRT.length - 1) + abs.search + abs.hash, 'https://x');
    } else u = new URL(text, `https://x/${basePage}`);
  } catch { return null; }
  const page = decodeURIComponent(u.pathname.replace(/^\/+/, '')) || basePage;
  return { page, search: u.search, hash: u.hash };
}
const extensionUrl = (page, search = '', hash = '') => `${EXT_ORIGIN}/${page}${search}${hash}`;

/**
 * Tiện ích luôn tự tạo đường dẫn e-GP theo địa chỉ MỚI (mof). Lớp vỏ chỉ đọc được trang
 * CÙNG NGUỒN với tab đang mở, nên mọi đường dẫn e-GP được đổi về đúng tên miền của tab
 * (hai tên miền chạy cùng một phần mềm, cùng cấu trúc đường dẫn).
 */
function sameOriginEgp(value) {
  try {
    const u = new URL(String(value || ''));
    if (u.protocol === 'https:' && EGP_HOSTS.includes(u.hostname.toLowerCase()) && u.origin !== HERE) { u.host = TOP.location.host; return u.href; }
  } catch { /* không phải đường dẫn tuyệt đối */ }
  return String(value || '');
}

/* ------------------------------------------------------------------- khung dựng trang */
/** Safari 26.2 trở lên có Navigation API: bắt được (và huỷ được) lệnh chuyển trang của một khung. */
const NAV_API = !OPTS.noNavigationApi && typeof TOP.navigation === 'object' && TOP.navigation !== null && typeof TOP.navigation.addEventListener === 'function';
const navigationLive = (win) => { try { return NAV_API && win.navigation.entries().length > 0; } catch { return false; } };

/**
 * Tạo một khung cùng nguồn, sẵn sàng cho document.open() → write().
 *
 * ĐÃ ĐO TRÊN WEBKIT: khung trắng BAN ĐẦU của trình duyệt bị tắt Navigation API (không có
 * mục lịch sử nào, sự kiện `navigate` không bao giờ bắn) — kể cả sau document.open().
 * Cho khung đi tới một trang about:blank THẬT trước thì `navigate` bắn đủ và huỷ được,
 * địa chỉ gốc (baseURI) và cookie vẫn đúng. Bản srcdoc cũng bắn `navigate` nhưng giữ
 * sai địa chỉ gốc, nên không dùng. Safari đời cũ không có Navigation API: dùng luôn
 * khung ban đầu, lớp vỏ có cách bám theo khác (xem 40-egp.js).
 */
async function openableFrame(parent, prepare) {
  const frame = TOP.document.createElement('iframe');
  if (prepare) prepare(frame);
  parent.appendChild(frame);
  if (!NAV_API) return frame;
  try {
    frame.contentWindow.location.href = 'about:blank?gscb';
    const deadline = Date.now() + 1500;
    while (frame.isConnected && Date.now() < deadline) {
      let ready = false;
      try { ready = frame.contentDocument.URL === 'about:blank?gscb' && navigationLive(frame.contentWindow); } catch { /* đang chuyển */ }
      if (ready) break;
      await sleep(0);
    }
  } catch { /* dùng khung ban đầu */ }
  return frame;
}
