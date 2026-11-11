/* ============================================================================
 *  IN / LƯU PDF MỘT CHẠM (4.22.0)
 *
 *  Trang nào có <main data-print="Tên báo cáo"> thì thanh tiêu đề có nút "In / Lưu PDF".
 *    - Trên Chrome (máy tính): mở hộp thoại in của trình duyệt; chọn "Lưu dưới dạng PDF".
 *      Kiểu in (theme.css, @media print) bỏ thanh trái, nút, ô nhập; mở hết các khối thu gọn.
 *    - Trong bản Safari (iPad/iPhone): phần mềm chạy trong một khung của trang muasamcong
 *      nên không in riêng khung được. Lớp vỏ cung cấp __GSCB_PRINT__: ta đưa cho nó một
 *      BẢN CHỤP ĐỨNG RIÊNG của báo cáo (HTML + toàn bộ kiểu), nó mở ở tab mới để người dùng
 *      bấm Chia sẻ → In hoặc lưu PDF bằng chính Safari.
 *
 *  snapshotHtml là hàm gần như thuần (chỉ đọc DOM được truyền vào) để kiểm thử được.
 * ========================================================================== */

const two = (n) => String(n).padStart(2, '0');
export function printStamp(now = Date.now()) {
  const d = new Date(now + 7 * 3600_000);
  return `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Toàn bộ kiểu đang áp dụng cho trang, thành một chuỗi CSS. Bảng kiểu không đọc được thì bỏ qua. */
export function collectCss(doc) {
  let css = '';
  for (const sheet of Array.from(doc.styleSheets || [])) {
    try { css += Array.from(sheet.cssRules || []).map((rule) => rule.cssText).join('\n') + '\n'; } catch { /* bảng kiểu khác nguồn */ }
  }
  return css;
}

/* Những thứ không có nghĩa trên giấy. */
const DROP = 'script, style, link, button, .btn, input, select, textarea, form, dialog, .no-print, .ws-topbar, .touch-tip, .card-more, [hidden], .hidden';

/**
 * Bản chụp đứng riêng của phần <main>: một tài liệu HTML hoàn chỉnh, không script.
 * @param {Document} doc @param {{title?: string, now?: number, version?: string}} options
 */
export function snapshotHtml(doc, { title = '', now = Date.now(), version = '' } = {}) {
  const main = doc.querySelector('main');
  const clone = main ? main.cloneNode(true) : doc.createElement('main');
  // Hình vẽ (canvas) không sao chép được nội dung: đổi thành ảnh.
  const canvases = main ? Array.from(main.querySelectorAll('canvas')) : [];
  Array.from(clone.querySelectorAll('canvas')).forEach((node, i) => {
    try { const img = doc.createElement('img'); img.src = canvases[i].toDataURL('image/png'); img.style.maxWidth = '100%'; node.replaceWith(img); } catch { node.remove(); }
  });
  for (const node of Array.from(clone.querySelectorAll(DROP))) node.remove();
  for (const d of Array.from(clone.querySelectorAll('details'))) d.setAttribute('open', '');
  // Liên kết nội bộ của phần mềm không mở được từ bản in: giữ chữ, bỏ liên kết. Liên kết e-GP giữ nguyên.
  for (const a of Array.from(clone.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href') || '';
    if (/^https:\/\//i.test(href)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); continue; }
    const span = doc.createElement('span'); span.innerHTML = a.innerHTML; a.replaceWith(span);
  }
  const name = title || (main && main.getAttribute('data-print')) || doc.title || 'Báo cáo';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(name)} — Giáo Sư Cùi Bắp</title><style>${collectCss(doc).replace(/<\/style/gi, '<\\/style')}</style>`
    + `<style>html,body{background:#fff!important}body{margin:0;padding:16px 18px 40px;max-width:900px;margin-inline:auto}main{margin:0!important;padding:0!important;max-width:none!important}`
    + `.print-bar{position:sticky;top:0;z-index:5;margin:-16px -18px 16px;padding:12px 18px;background:#0a2f2b;color:#fff;font:500 15px/1.45 system-ui,sans-serif}`
    + `.print-bar b{display:block;font-size:16px}.print-bar button{display:inline-block!important;margin-top:8px;padding:11px 18px;min-height:44px;border:0;border-radius:8px;background:#fff;color:#0a2f2b;font:600 15px system-ui,sans-serif}`
    + `.print-head{display:flex;justify-content:space-between;gap:12px;align-items:baseline;border-bottom:2px solid #0f766e;padding-bottom:8px;margin-bottom:14px;font:500 13px/1.4 system-ui,sans-serif;color:#334155}`
    + `.print-head b{font-size:15px;color:#0b1626}@media print{.print-bar{display:none!important}body{padding:0;max-width:none}}</style></head>`
    + `<body class="workspace print-snapshot"><div class="print-bar"><b>Bản in: ${esc(name)}</b>Bấm nút Chia sẻ của Safari rồi chọn “In” để in hoặc lưu PDF. Xong thì đóng tab này để quay lại Cùi Bắp.<br><button type="button" id="gscb-print">In / Lưu PDF</button></div>`
    + `<div class="print-head"><b>${esc(name)}</b><span>Giáo Sư Cùi Bắp${version ? ` ${esc(version)}` : ''} · in lúc ${esc(printStamp(now))} (giờ VN)</span></div>`
    + `${clone.outerHTML}</body></html>`;
}

/** In trang hiện tại. Trả về 'tab' (bản Safari mở tab mới), 'print' (hộp thoại in) hoặc 'blocked'. */
export async function printPage({ title = '', doc = globalThis.document, win = globalThis } = {}) {
  const version = (() => { try { return win.chrome.runtime.getManifest().version; } catch { return ''; } })();
  if (typeof win.__GSCB_PRINT__ === 'function') {
    return (await win.__GSCB_PRINT__(snapshotHtml(doc, { title, version }), title)) ? 'tab' : 'blocked';
  }
  const closed = Array.from(doc.querySelectorAll('main details:not([open])'));
  for (const d of closed) d.open = true;
  doc.documentElement.setAttribute('data-print-title', `${title || doc.title} · Giáo Sư Cùi Bắp${version ? ` ${version}` : ''} · in lúc ${printStamp()} (giờ VN)`);
  try { win.print(); } finally { for (const d of closed) d.open = false; }
  return 'print';
}
