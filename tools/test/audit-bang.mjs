/* ============================================================================
 *  PHÉP ĐO "BẢNG ĐỌC ĐƯỢC" — chạy NGAY TRONG TRANG, dùng chung cho nhân Safari và Chromium
 *
 *  AUDIT_BODY là thân một hàm JavaScript nhận hai biến có sẵn: W (cửa sổ của trang) và D (tài
 *  liệu). Nó đo mọi bảng đang hiện và trả về số liệu cùng các VI PHẠM:
 *
 *   tran-trang   trang bị đẩy rộng hơn màn hình (phải cuộn ngang CẢ TRANG);
 *   tran-khung   bảng rộng hơn khung chứa mà không nằm trong khung cuộn riêng;
 *   bop-chu      một ô có từ 20 ký tự mà trung bình dưới 10 ký tự mỗi dòng — đúng lỗi trong ảnh
 *                iPad thật ngày 21/11/2026 (tên nhà thầu 39 ký tự thành 13 dòng = 3 ký tự/dòng);
 *   phinh-cot    một cột toàn nội dung một dòng mà thừa hơn 80 px, trong khi bảng đang phải cuộn
 *                hoặc có ô phải xuống từ 4 dòng — đúng vế còn lại của lỗi đó ("16 / 0" chiếm 157 px);
 *   ghim-hong    bảng cuộn ngang có cột đầu ghim, nhưng cuộn rồi cột đầu không đứng yên.
 *
 *  Số đo lấy bằng getBoundingClientRect nên đúng với mọi mức phóng (zoom) của trang.
 * ========================================================================== */
export const AUDIT_BODY = `
  const vis = (el) => el.getClientRects().length > 0;
  const page = W.location.pathname.split('/').pop();
  const root = D.documentElement;
  const out = { page, view: root.clientWidth, overflow: Math.max(0, root.scrollWidth - root.clientWidth), tables: [], problems: [] };
  if (out.overflow > 2) out.problems.push({ kind: 'tran-trang', page, px: out.overflow });
  const textNodes = (cell) => { const w = D.createTreeWalker(cell, 4); const list = []; for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.parentElement.closest('.sub, .sr-only, [hidden]')) continue; if (n.textContent.trim()) list.push(n); } return list; };
  let index = 0;
  for (const t of D.querySelectorAll('main table, dialog[open] table')) {
    if (!vis(t)) continue;
    index++;
    const box = t.closest('.table-scroll');
    const holder = box || t.parentElement;
    const rows = Array.from(t.rows).filter(vis);
    if (!rows.length) continue;
    const count = Math.max.apply(null, rows.map((r) => Array.from(r.cells).reduce((n, c) => n + (c.colSpan || 1), 0)));
    const head = rows.find((r) => r.cells.length === count && Array.from(r.cells).every((c) => c.tagName === 'TH'));
    const labels = head ? Array.from(head.cells, (c) => c.textContent.replace(/\\s+/g, ' ').trim().slice(0, 30)) : [];
    const tr = t.getBoundingClientRect(), hr = holder.getBoundingClientRect();
    const info = { n: index, cols: count, rows: rows.length, width: Math.round(tr.width), holder: Math.round(hr.width), fit: t.classList.contains('fit-on'),
      scroll: !!(box && box.classList.contains('can-scroll')), sticky: t.classList.contains('fit-sticky'), tight: t.classList.contains('fit-tight'), cards: t.classList.contains('fit-cards'), skip: t.matches('.brief-table, [data-fit="off"]'), labels, worstLines: 0, colWidths: [],
      plan: Array.from(t.querySelectorAll(':scope > * > tr > .fit-w'), (c) => Math.round(parseFloat(c.style.getPropertyValue('--fit-w')) || 0)), unit: Math.round(tr.width / (parseFloat(W.getComputedStyle(t).width) || tr.width) * 100) / 100 };
    if (!box && tr.width - hr.width > 2 && tr.right - hr.right > 2) out.problems.push({ kind: 'tran-khung', page, table: index, labels: labels.slice(0, 3), px: Math.round(tr.width - hr.width) });
    const width = new Array(count).fill(0), content = new Array(count).fill(0), oneLine = new Array(count).fill(true), seen = new Array(count).fill(false);
    let squeezed = 0;
    for (const row of rows) {
      if (row.cells.length !== count) continue;
      Array.from(row.cells).forEach((cell, i) => {
        const rect = cell.getBoundingClientRect();
        width[i] = rect.width;
        const nodes = textNodes(cell);
        if (!nodes.length) return;
        seen[i] = true;
        let left = Infinity, right = -Infinity; const tops = [];
        let text = '';
        for (const node of nodes) {
          text += (text ? ' ' : '') + node.textContent.replace(/\\s+/g, ' ').trim();
          const r = D.createRange(); r.selectNodeContents(node);
          for (const q of r.getClientRects()) { if (q.width < 1) continue; left = Math.min(left, q.left); right = Math.max(right, q.right); if (!tops.some((y) => Math.abs(y - q.top) < 4)) tops.push(q.top); }
        }
        if (right > left) content[i] = Math.max(content[i], right - left);
        const lines = Math.max(1, tops.length);
        if (lines > 1 && row !== head) oneLine[i] = false;
        if (row === head) return;
        if (text.length >= 20) {
          info.worstLines = Math.max(info.worstLines, lines);
          if (text.length / lines < 10) { squeezed++; if (squeezed <= 3) out.problems.push({ kind: 'bop-chu', page, table: index, col: labels[i] || cell.dataset.fitLabel || String(i + 1), text: text.slice(0, 60), chars: text.length, lines, colWidth: Math.round(rect.width) }); }
        }
      });
    }
    info.colWidths = width.map((w) => Math.round(w));
    info.squeezed = squeezed;
    const pressure = !info.cards && (info.scroll || info.worstLines >= 4);   // dạng thẻ (điện thoại): ô nửa thẻ rộng cố định, không xét phình
    if (pressure) width.forEach((w, i) => {
      const slack = w - content[i] - 30;
      if (seen[i] && oneLine[i] && slack > 80) out.problems.push({ kind: 'phinh-cot', page, table: index, col: labels[i] || String(i + 1), colWidth: Math.round(w), content: Math.round(content[i]), slack: Math.round(slack) });
    });
    if (info.scroll && info.sticky) {
      // Cột được ghim (data-fit-pin, đếm từ 1): cuộn quá vị trí gốc của nó rồi xem nó có đứng ở mép trái khung không.
      info.pin = Number(t.dataset.fitPin || 1);
      info.pinLabel = labels[info.pin - 1] || '';
      const cell = rows[rows.length - 1].cells[info.pin - 1];
      // Quãng phải cuộn (px CSS) để cột ghim chạm mép trái khung; bộ dàn cột chỉ ghim cột nào chạm tới được.
      const need = (cell.getBoundingClientRect().left - rows[rows.length - 1].cells[0].getBoundingClientRect().left) / (info.unit || 1);
      const before = box.scrollLeft; box.scrollLeft = need + 140;
      const moved = box.scrollLeft;
      const drift = Math.abs(cell.getBoundingClientRect().left - box.getBoundingClientRect().left);
      box.scrollLeft = before;
      info.stickyDrift = Math.round(drift);
      if (moved + 1 < need) out.problems.push({ kind: 'ghim-hong', page, table: index, drift: Math.round(drift), unreachable: true });
      else if (moved > 20 && drift > 2) out.problems.push({ kind: 'ghim-hong', page, table: index, drift: Math.round(drift) });
    }
    out.tables.push(info);
  }
  return out;
`;

/** Tên gọn của một vi phạm, để in báo cáo. */
export function describeProblem(p) {
  if (p.kind === 'tran-trang') return `${p.page}: trang tràn ngang ${p.px} px`;
  if (p.kind === 'tran-khung') return `${p.page}: bảng ${p.table} (${(p.labels || []).join(' | ')}) rộng hơn khung ${p.px} px mà không có khung cuộn`;
  if (p.kind === 'bop-chu') return `${p.page}: bảng ${p.table}, cột "${p.col}" rộng ${p.colWidth} px — "${p.text}" (${p.chars} ký tự) thành ${p.lines} dòng`;
  if (p.kind === 'phinh-cot') return `${p.page}: bảng ${p.table}, cột "${p.col}" rộng ${p.colWidth} px cho nội dung ${p.content} px (thừa ${p.slack} px)`;
  if (p.kind === 'ghim-hong') return p.unreachable ? `${p.page}: bảng ${p.table}, cột ghim không bao giờ chạm được mép trái (bảng cuộn không đủ xa)` : `${p.page}: bảng ${p.table}, cột ghim trôi ${p.drift} px khi cuộn`;
  return JSON.stringify(p);
}
