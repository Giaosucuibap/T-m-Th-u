/* ============================================================================
 *  TỆP CỦA TIỆN ÍCH → blob URL
 *
 *  Các khung giao diện không có "thư mục" thật để tải app.css hay lib/core.js, nên
 *  mỗi tệp trong gói được phát qua một blob URL; import map trong từng khung ánh xạ
 *  tên trần `gscb/lib/core.js` tới blob tương ứng. Không tệp nào tải từ máy chủ e-GP.
 * ========================================================================== */
const FILES = PACK.files;
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const extOf = (file) => (file.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
const blobUrls = new Map();

function resolvePath(from, relative) {
  const out = from.split('/').slice(0, -1);
  for (const part of relative.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop(); else out.push(part);
  }
  return out.join('/');
}
const isAbsoluteRef = (value) => /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value);

function cssWithAssets(file, text) {
  return text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote, ref) => {
    if (isAbsoluteRef(ref)) return match;
    const target = resolvePath(file, ref.split(/[?#]/)[0]);
    return FILES[target] ? `url("${assetUrl(target)}")` : match;
  });
}

/** blob URL của một tệp trong gói (tạo khi cần, dùng lại về sau). */
function assetUrl(file) {
  if (blobUrls.has(file)) return blobUrls.get(file);
  const entry = FILES[file];
  if (!entry) return '';
  const type = MIME[extOf(file)] || 'application/octet-stream';
  let blob;
  if (entry.b !== undefined) {
    const raw = atob(entry.b), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    blob = new Blob([bytes], { type });
  } else {
    const text = extOf(file) === '.css' ? cssWithAssets(file, entry.s) : entry.s;
    blob = new Blob([text], { type: `${type};charset=utf-8` });
  }
  const url = URL.createObjectURL(blob);
  blobUrls.set(file, url);
  return url;
}

let importMapText = '';
function importMap() {
  if (!importMapText) {
    const imports = {};
    for (const file of Object.keys(FILES)) if (FILES[file].m) imports[`gscb/${file}`] = assetUrl(file);
    importMapText = JSON.stringify({ imports });
  }
  return importMapText;
}

/** HTML của một trang tiện ích, đã trỏ mọi script / css / ảnh sang blob và gắn import map. */
function pageHtml(page) {
  const entry = FILES[page];
  if (!entry || extOf(page) !== '.html') return null;
  let html = entry.s.replace(/<(script|link|img|source)\b[^>]*>/gi, (tag) => tag.replace(/\b(src|href)="([^"]+)"/i, (match, attr, value) => {
    if (isAbsoluteRef(value)) return match;
    const target = resolvePath(page, value.split(/[?#]/)[0]);
    return FILES[target] ? `${attr}="${assetUrl(target)}"` : match;
  }));
  const map = `<script type="importmap">${importMap()}</script>`;
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + map) : map + html;
  html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, (m) => SAFARI_TOUCH_CSS + m) : html + SAFARI_TOUCH_CSS;
  return html;
}
/* Chỉnh nhỏ cho màn hình chạm, chỉ có trong bản Safari (tệp của tiện ích không đổi):
   - chữ không tự phóng khi xoay ngang iPhone;
   - điện thoại: số tiền dài được xuống hàng, ô chọn lịch sử không đẩy trang rộng ra
     (đo trên WebKit 390 px: hai chỗ này làm trang Tìm gói thầu tràn ngang 24 px);
   - trang popup của tiện ích rộng cố định 420 px: cho co theo màn hình. */
const SAFARI_TOUCH_CSS = '<style data-gscb-safari>html{-webkit-text-size-adjust:100%;text-size-adjust:100%}'
  + '@media (max-width:540px){.ws-metric .value.money{white-space:normal;overflow-wrap:anywhere}.history-label{flex-wrap:wrap;overflow:hidden}.history-label select{flex:1 1 100%;min-width:0;max-width:100%}'
  + 'body:has(.popup-launch){width:auto;max-width:100%}}</style>';

/** Ảnh chèn sau (innerHTML): `gscb-asset:icons/x.svg` hoặc đường dẫn tương đối → blob. */
function fixAssetAttribute(el, pageDir) {
  const raw = el.getAttribute('src');
  if (!raw || raw.startsWith('blob:') || raw.startsWith('data:')) return;
  let file = '';
  if (raw.startsWith('gscb-asset:')) file = raw.slice(11);
  else if (!isAbsoluteRef(raw)) file = resolvePath(`${pageDir}x`, raw.split(/[?#]/)[0]);
  if (file && FILES[file]) el.setAttribute('src', assetUrl(file));
}
function watchAssets(doc, page) {
  const pageDir = page.includes('/') ? page.slice(0, page.lastIndexOf('/') + 1) : '';
  const scan = (root) => {
    if (root.nodeType !== 1) return;
    if (root.tagName === 'IMG') fixAssetAttribute(root, pageDir);
    for (const img of root.querySelectorAll ? root.querySelectorAll('img[src]') : []) fixAssetAttribute(img, pageDir);
  };
  const Observer = doc.defaultView.MutationObserver;
  new Observer((records) => {
    for (const record of records) {
      if (record.type === 'attributes') scan(record.target);
      else for (const node of record.addedNodes) scan(node);
    }
  }).observe(doc, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
}
