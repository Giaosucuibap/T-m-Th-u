/* ============================================================================
 *  BẢNG ĐỌC ĐƯỢC TRÊN MỌI CỠ MÀN HÌNH (4.23.0)
 *
 *  LỖI THẤY TRÊN iPad THẬT (ảnh ngày 21/11/2026, trang Hồ sơ chủ đầu tư, bản 4.22.0):
 *  cột "Nhà thầu" chỉ rộng bằng chữ "thầu" ở tiêu đề (59 px) nên tên công ty bị bẻ thành
 *  từng khúc 2–3 chữ cái, 13 dòng cho một tên 39 ký tự; trong khi cột "Giá trị trúng" rộng
 *  222 px cho một con số 110 px và cột "Độc lập / Liên danh" rộng 157 px cho "16 / 0".
 *
 *  NGUYÊN NHÂN: trình duyệt tự chia cột theo bề rộng TỐI THIỂU của nội dung. Bản 4.22.0 thêm
 *  `overflow-wrap:anywhere` cho mọi ô bảng trên máy cảm ứng (để chuỗi dài không đẩy trang
 *  rộng ra) — nghĩa là cho phép bẻ chữ ở bất kỳ ký tự nào, nên bề rộng tối thiểu của ô chữ
 *  thành MỘT ký tự. Bảng 9 cột không vừa 705 px, trình duyệt ép cột nào ép được: chỉ còn cột
 *  tên. Các cột số mang `white-space:nowrap` (kể cả tiêu đề và dòng phụ) nên giữ nguyên bề
 *  rộng lớn nhất của chúng.
 *
 *  CÁCH SỬA — một bộ dàn cột dùng chung cho MỌI bảng của phần mềm, không sửa tay từng bảng:
 *    1. ĐO bề rộng thật của nội dung từng cột (một dòng, không tính dòng phụ) và của tiêu đề.
 *    2. CHIA: cột ngắn (số, ngày, mã) rộng đúng bằng nội dung; tiêu đề dài được xuống hai
 *       dòng; cột chữ dài (tên nhà thầu, tên gói) được tối đa hai dòng, không quá ~42% khung.
 *    3. Còn thừa chỗ thì dồn cho cột chữ trước. Không đủ chỗ thì bảng CUỘN NGANG trong khung
 *       của chính nó (trang không bị đẩy rộng), cột đầu được GHIM lại, mép phải mờ dần và có
 *       một dòng nhắc "vuốt ngang".
 *  Trình duyệt vẫn dàn bảng theo kiểu tự động; bề rộng ta đặt chỉ là mức tối thiểu của từng
 *  cột, nên nội dung không bao giờ bị cắt hay đè lên nhau dù phép đo có lệch.
 *
 *  `planColumns` là hàm thuần (kiểm thử trong tests/bang-doc-duoc-423.test.mjs). Phần còn lại
 *  cần DOM; bài đo trên trình duyệt thật là tools/test/bang-doc-duoc.mjs.
 * ========================================================================== */
import { TOUCH } from './device.js';
import { enableSort } from './table-sort.js';

/** Chữ rộng tới mức này (px CSS, KHÔNG tính lề ô — khoảng 13 ký tự) thì nằm trên một dòng. */
export const ONE_LINE = 104;
/** Cột chữ xuống hai dòng thì phần chữ không hẹp hơn mức này. */
const TWO_LINE_MIN = 96;
/** Tiêu đề ngắn tới mức này (không tính lề) thì không ngắt dòng ("Số gói", "Giảm giá", "Năm"). */
const SHORT_HEAD = 64;
/** Khi ép cho vừa màn hình: cột chữ chính không hẹp hơn mức này (gồm lề ô), cột chữ khác không hẹp hơn TEXT_FLOOR. */
const PRIMARY_FLOOR = 176, TEXT_FLOOR = 140;
/** Khung hẹp hơn mức này (px CSS — điện thoại cầm dọc) thì bảng danh sách không vừa sẽ thành THẺ thay vì cuộn ngang. */
export const CARD_BELOW = 430;
/** Bảng tự lo bố cục riêng thì đứng ngoài: bảng đối chiếu hồ sơ (xếp chồng trên điện thoại), bảng tự đánh dấu. */
const SKIP = 'table.brief-table, table[data-fit="off"], [data-fit="off"] table';

const NO_CARDS = '.comparison, .run-comparison-table, [data-cards="off"]';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const px = (value) => Number.parseFloat(value) || 0;
const sum = (list) => list.reduce((a, b) => a + b, 0);

/**
 * Bố cục THẺ cho điện thoại: mỗi dòng của bảng thành một thẻ hai cột nhỏ. Ô nào nội dung không vừa nửa thẻ trên
 * một dòng (tên nhà thầu, tên gói, số tiền rất dài) thì chiếm cả hàng; cột tên chính lên đầu thẻ làm tiêu đề.
 * @param {Array<{body:number, pad:number, wraps:boolean, bar?:boolean}>} columns như planColumns
 * @param {number} avail bề rộng khung (px CSS)
 * @returns {{main:number, wide:boolean[]}}
 */
export function cardLayout(columns, avail) {
  const half = (Math.max(0, Number(avail) || 0) - 24 - 12) / 2;   // thẻ: lề 12 px mỗi bên, khe 12 px giữa hai cột
  const first = columns.findIndex((c) => c.wraps && c.body - c.pad > ONE_LINE);
  const main = first >= 0 && first <= 2 ? first : 0;
  return { main, wide: columns.map((c, i) => i === main || Boolean(c.bar) || c.body - c.pad > half) };
}

/**
 * Cột nên GHIM khi bảng cuộn ngang: cột tên (cột chữ dài đầu tiên) nếu nó nằm trong BA cột đầu và bảng cuộn đủ xa
 * để nó chạm được mép trái; không thì cột đầu tiên (mã số thuế, số thứ tự, tiêu chí — thứ định danh dòng).
 */
export function pinColumn(plan, avail, columns = []) {
  if (columns[0] && columns[0].rowHead) return 0;      // bảng có tiêu đề dòng (bảng so sánh): cột tiêu chí luôn là cột ghim
  if (!(plan.primary >= 1 && plan.primary <= 2)) return 0;
  const before = sum(plan.widths.slice(0, plan.primary));
  return before <= plan.total - avail ? plan.primary : 0;
}

/**
 * Chia bề rộng cho các cột.
 * @param {Array<{body:number, headMin:number, headMax:number, pad:number, wraps:boolean, fixed?:number, bar?:boolean}>} columns
 *   body     bề rộng nội dung dài nhất của cột khi nằm trên MỘT dòng (gồm lề ô, không tính dòng phụ)
 *   headMin  bề rộng từ dài nhất của tiêu đề; headMax: tiêu đề nằm trên một dòng (đều gồm lề ô)
 *   pad      lề ngang của một ô;  wraps: ô được phép xuống dòng (cột chữ)
 *   fixed    bề rộng tác giả đã ghi cứng (px);  bar: cột vẽ thanh, không có chữ
 * @param {number} avail bề rộng khung chứa bảng (px CSS)
 * @returns {{widths:number[], total:number, scroll:boolean, primary:number}}
 *   widths  bề rộng tối thiểu của từng cột;  scroll: bảng rộng hơn khung, phải cuộn ngang
 *   primary cột chữ dài đầu tiên (tên nhà thầu, tên gói) — được phần rộng nhất;  −1 nếu không có
 */
export function planColumns(columns, avail) {
  const room = Math.max(0, Number(avail) || 0);
  const long = (c) => c.wraps && c.body - c.pad > ONE_LINE;
  const primary = columns.findIndex(long);
  // MỨC GỌN NHẤT CÒN ĐỌC TỐT: số và chữ ngắn một dòng; chữ dài hai dòng (không quá phần được chia);
  // tiêu đề dài hai dòng.
  const target = columns.map((c, i) => {
    const headText = c.headMax - c.pad;
    const cap = i === primary ? clamp(room * 0.42, 150, 340) : clamp(room * 0.34, 168, 300);
    // Tiêu đề dài xuống hai dòng — nhưng tiêu đề RẤT dài (bảng so sánh gói: tiêu đề cột là cả tên gói, 100 ký tự)
    // thì được xuống nhiều dòng hơn: nó không được đòi rộng hơn phần chia cho một cột chữ (đo 21/11/2026 ở cỡ
    // iPhone: ba cột 473 · 473 · 605 px trong khung 302 px).
    const twoLines = c.headMax <= 0 ? 0 : headText <= SHORT_HEAD ? c.headMax : Math.max(c.headMin, Math.min(c.headMax, headText / 2 * 1.12 + c.pad + 2));
    const head = Math.min(twoLines, Math.max(c.headMin, cap));
    let width = c.body;
    if (long(c)) {
      // Chữ ngắn (hai, ba, bốn từ) không chia đôi đều được — dòng dài hơn thường chiếm gần hai phần ba.
      const text = c.body - c.pad;
      width = Math.min(c.body, cap, Math.max(text <= 240 ? text * 0.7 : text / 2 * 1.12, TWO_LINE_MIN) + c.pad);
    }
    return Math.max(width, head, c.fixed || 0, c.bar ? 96 : 0, 28);
  });
  const total = sum(target);
  if (total > room) {
    // Chưa vừa. Thử ÉP các cột chữ dài xuống mức sàn (vẫn trọn từ, khoảng 17 ký tự mỗi dòng ở cột chính):
    // vừa thì KHÔNG phải cuộn ngang — iPad xoay ngang rơi vào trường hợp này. Không vừa thì cuộn, và khi
    // đã cuộn thì cột chữ giữ mức rộng rãi ở trên.
    const floors = target.map((t, i) => (long(columns[i]) ? Math.min(t, Math.max(columns[i].headMin, columns[i].fixed || 0, i === primary ? PRIMARY_FLOOR : TEXT_FLOOR)) : t));
    const least = sum(floors);
    if (least > room) return { widths: target, total, scroll: true, primary };
    const want = target.map((t, i) => t - floors[i]), wantTotal = sum(want) || 1, spare = room - least;
    return { widths: floors.map((f, i) => f + spare * want[i] / wantTotal), total: room, scroll: false, primary };
  }
  // CÒN THỪA CHỖ thì nới dần: (1) cột chữ tới khi vừa một dòng; (2) tiêu đề nào đủ chỗ thì cho nằm một
  // dòng, tiêu đề cần ít chỗ nhất được trước; (3) phần còn lại cho cột vẽ thanh, không có thì chia theo
  // tỉ lệ, cột chữ nặng gấp đôi cột số.
  const widths = target.slice();
  let extra = room - total;
  const need = columns.map((c, i) => (c.wraps ? Math.max(0, c.body - widths[i]) : 0));
  const needTotal = sum(need);
  if (needTotal > 0) {
    const give = Math.min(extra, needTotal);
    need.forEach((n, i) => { widths[i] += give * n / needTotal; });
    extra -= give;
  }
  const heads = columns.map((c, i) => ({ i, gap: c.headMax - widths[i] })).filter((h) => h.gap > 0).sort((a, b) => a.gap - b.gap);
  for (const h of heads) { if (h.gap > extra) break; widths[h.i] += h.gap; extra -= h.gap; }
  if (extra > 0.5) {
    const weight = columns.some((c) => c.bar) ? columns.map((c) => (c.bar ? 1 : 0)) : columns.map((c, i) => widths[i] * (c.wraps ? 2 : 1));
    const weightTotal = sum(weight) || 1;
    weight.forEach((w, i) => { widths[i] += extra * w / weightTotal; });
  }
  return { widths, total: room, scroll: false, primary };
}

/* --------------------------------------------------------------------------
 *  PHẦN CẦN DOM
 * ------------------------------------------------------------------------ */
const seen = new WeakMap();     // bảng → chữ ký của lần dàn gần nhất
const watched = new WeakSet();  // khung đã được theo dõi kích thước
let epoch = 0;                  // tăng khi phông chữ nạp xong: mọi bảng đo lại
let working = false;
let resizeWatch = null, changeWatch = null;

const isHeadRow = (row) => row.cells.length > 0 && Array.from(row.cells).every((cell) => cell.tagName === 'TH') && (row.parentElement.tagName === 'THEAD' || !row.previousElementSibling || row.previousElementSibling.classList.contains('fit-h'));
const spanOf = (row) => Array.from(row.cells).reduce((n, cell) => n + (cell.colSpan || 1), 0);
const shown = (node) => node.getClientRects().length > 0;

/** Bề rộng phần nội dung của khung chứa (px CSS). */
function contentWidth(node) {
  const cs = getComputedStyle(node);
  const width = px(cs.width);
  return cs.boxSizing === 'border-box' ? width - px(cs.paddingLeft) - px(cs.paddingRight) - px(cs.borderLeftWidth) - px(cs.borderRightWidth) : width;
}

/** Gom những gì cần biết về một bảng trước khi đo. Trả null nếu bảng chưa đo được. */
function prepare(table) {
  if (!table.isConnected || table.matches(SKIP) || !shown(table)) return null;
  if (table.querySelector(':scope > colgroup')) return null;   // tác giả đã tự chia cột bằng <col>
  const holder = table.parentElement;
  if (!holder) return null;
  const rows = Array.from(table.rows);
  if (!rows.length) return null;
  for (const row of rows) row.classList.toggle('fit-h', false);
  const heads = [];
  for (const row of rows) { if (isHeadRow(row)) { row.classList.add('fit-h'); heads.push(row); } else if (row.parentElement.tagName !== 'THEAD') break; }
  const bodies = rows.filter((row) => !row.classList.contains('fit-h'));
  const count = Math.max(...rows.map(spanOf));
  for (const row of rows) row.classList.toggle('fit-x', row.cells.length !== count);
  const body = bodies.find((row) => row.cells.length === count && shown(row));
  const head = heads.find((row) => row.cells.length === count) || null;
  if (!body || count < 2) return null;
  try { enableSort(table); } catch { /* bảng không sắp xếp được thì vẫn dàn cột như thường */ }
  // Tỉ lệ giữa số đo của getBoundingClientRect và px của CSS (khác 1 khi <html> đang phóng bằng `zoom`).
  const cssWidth = px(getComputedStyle(table).width), realWidth = table.getBoundingClientRect().width;
  const scale = cssWidth > 0 && realWidth > 0 ? realWidth / cssWidth : 1;
  const scroller = holder.classList.contains('table-scroll') ? holder : null;
  const frame = scroller ? scroller.parentElement : holder;
  let avail = scroller ? contentWidth(scroller) : contentWidth(holder);
  // Khung chứa không được coi là rộng hơn phần màn hình còn lại bên phải nó (khung co giãn theo nội dung).
  const view = document.documentElement.getBoundingClientRect().width / scale, left = (scroller || holder).getBoundingClientRect().left / scale;
  if (view > 0) avail = Math.min(avail, view - Math.max(0, left) - 4);
  if (!(avail > 40)) return null;
  // Chỗ dành cho CÁC CỘT = bề rộng khung trừ hai viền dọc của chính bảng. Chia cột theo cả bề rộng khung thì bảng
  // "vừa khung" lại rộng hơn khung đúng bằng hai viền (đo 21/11/2026: bảng so sánh gói thừa 2 px).
  const tableCs = getComputedStyle(table);
  const inner = avail - px(tableCs.borderLeftWidth) - px(tableCs.borderRightWidth);
  const signature = [count, rows.length, Math.round(avail), table.textContent.length, epoch, document.documentElement.dataset.density || ''].join('|');
  if (seen.get(table) === signature && table.classList.contains('fit-on')) return null;
  // Đo ở dạng bảng thường: gỡ chế độ gọn và chế độ thẻ của lần trước rồi mới đọc lề, kiểu xuống dòng của ô.
  table.classList.remove('fit-tight', 'fit-cards');
  // Bảng DANH SÁCH đơn giản (một hàng tiêu đề, mọi dòng đủ ô, không ô gộp, không tiêu đề dòng) mới thành thẻ được.
  const simple = Boolean(head) && heads.length === 1 && count >= 3 && !table.matches(NO_CARDS) && !document.body.classList.contains('print-snapshot')
    && bodies.every((row) => row.cells.length === count && Array.from(row.cells).every((cell) => cell.tagName === 'TD' && cell.rowSpan === 1));
  const sample = Array.from(body.cells);
  const styles = sample.map((cell) => getComputedStyle(cell));
  const columns = sample.map((cell, i) => {
    const cs = styles[i];
    const authored = (head && head.cells[i].style.width) || cell.style.width || '';
    return {
      wraps: !/nowrap|pre\b/.test(cs.whiteSpace),
      pad: px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.borderLeftWidth) + px(cs.borderRightWidth),
      fixed: /px$/.test(authored) ? px(authored) : 0,
      bar: /%$/.test(authored) && !cell.textContent.trim(),
      hidden: cs.display === 'none',
      rowHead: cell.tagName === 'TH',
      body: 0, headMin: 0, headMax: 0
    };
  });
  clearWidths(table);
  return { table, holder, scroller, frame, body, head, bodies, count, avail, inner, scale, signature, columns, simple };
}

/** Gỡ bề rộng đã đặt ở lần dàn trước (để đo lại từ đầu). */
function clearWidths(table) {
  for (const cell of table.querySelectorAll(':scope > * > tr > .fit-w')) { cell.classList.remove('fit-w'); cell.style.removeProperty('--fit-w'); }
}

/** Đo lại lề ô của từng cột (đổi khi bảng vào / ra chế độ gọn). */
function readPads(job) {
  Array.from(job.body.cells).forEach((cell, i) => {
    const cs = getComputedStyle(cell);
    job.columns[i].pad = px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.borderLeftWidth) + px(cs.borderRightWidth);
  });
}

/** Ba lượt đo cho một nhóm bảng: thân bảng một dòng, tiêu đề một dòng, tiêu đề hẹp hết mức. */
function measure(jobs) {
  if (!jobs.length) return;
  // Lượt 1 — thân bảng, mỗi ô một dòng, không tính dòng phụ: bề rộng thật của nội dung.
  for (const job of jobs) job.table.classList.add('fit-m', 'fit-mb');
  for (const job of jobs) widthsOf(job.body, job.scale).forEach((w, i) => { job.columns[i].body = w + SLACK; });
  // Lượt 2 — riêng tiêu đề trên một dòng; lượt 3 — tiêu đề hẹp hết mức (từ dài nhất).
  for (const job of jobs) { job.table.classList.remove('fit-mb'); job.table.classList.add('fit-mh', 'fit-max'); }
  for (const job of jobs) if (job.head) widthsOf(job.head, job.scale).forEach((w, i) => { job.columns[i].headMax = w + SLACK; });
  for (const job of jobs) { job.table.classList.remove('fit-max'); job.table.classList.add('fit-min'); }
  for (const job of jobs) if (job.head) widthsOf(job.head, job.scale).forEach((w, i) => { job.columns[i].headMin = w + SLACK; });
  for (const job of jobs) job.table.classList.remove('fit-m', 'fit-mh', 'fit-min');
}

const widthsOf = (row, scale) => Array.from(row.cells, (cell) => cell.getBoundingClientRect().width / scale);
/** Cộng thêm vào mọi số đo (px CSS): cột chia SÁT bằng nội dung thì chỉ cần hụt 0,1 px (làm tròn, viền bảng) là tiêu đề
 *  "Số gói" rớt thành hai dòng — thấy trong ảnh chụp thử ngày 21/11/2026. */
const SLACK = 0.75;

function apply(job) {
  const { table, count, avail, columns } = job;
  const plan = job.plan || planColumns(columns, job.inner);
  /* Bề rộng đặt lên CÁC Ô của một hàng (hàng tiêu đề, không có thì hàng dữ liệu đầu), không dùng <col>: khi trang
     đang phóng bằng `zoom` (mặc định 110% trên iPad), nhân Safari KHÔNG nhân mức phóng cho bề rộng của <col> —
     đo ngày 21/11/2026: <col> 120 px hiện ra 127 px, cột chữ bên cạnh hẹp đi 16 px. Bề rộng trên ô thì đúng
     tuyệt đối ở mọi mức phóng (120 → 132 px màn hình ở 110%, 156 px ở 130%). */
  clearWidths(table);
  dropSortBar(table);
  const carrier = job.head || job.body;
  // Bảng cuộn: làm tròn LÊN (cột không bao giờ hẹp hơn phần chia). Bảng vừa khung: làm tròn XUỐNG để tổng không vượt khung.
  const tenth = plan.scroll ? Math.ceil : Math.floor;
  Array.from(carrier.cells).forEach((cell, i) => { cell.style.setProperty('--fit-w', `${tenth(plan.widths[i] * 10) / 10}px`); cell.classList.add('fit-w'); });
  table.classList.add('fit-on');
  // Bảng không vừa khung: cho nó một khung cuộn riêng. Bảng vừa thì để nguyên chỗ cũ.
  let box = job.scroller;
  if (plan.scroll && !box) {
    box = document.createElement('div'); box.className = 'table-scroll';
    const cs = getComputedStyle(table); box.style.marginTop = cs.marginTop; box.style.marginBottom = cs.marginBottom;
    job.holder.insertBefore(box, table); box.append(table);
    box.addEventListener('scroll', () => edge(box), { passive: true });
  }
  // Bề rộng bảng tính cả hai viền dọc của chính nó; thiếu phần này trình duyệt bớt đều vào các cột.
  const tableStyle = getComputedStyle(table);
  table.style.minWidth = plan.scroll ? `${Math.ceil(plan.total + px(tableStyle.borderLeftWidth) + px(tableStyle.borderRightWidth) + 1)}px` : '0';
  if (box) {
    const can = box.scrollWidth > box.clientWidth + 1;
    // Ghim CỘT TÊN (cột chữ dài đầu tiên: nhà thầu, gói thầu, chủ đầu tư) khi nó nằm trong ba cột đầu; các cột
    // đứng trước nó (vai trò, mã) trôi đi khi cuộn. Không thì ghim cột đầu — xem pinColumn.
    const pin = pinColumn(plan, avail, columns);
    const sticky = can && count >= 3 && plan.widths[pin] <= avail * 0.5;
    box.classList.toggle('can-scroll', can);
    table.classList.toggle('fit-sticky', sticky);
    if (sticky) table.dataset.fitPin = String(pin + 1); else delete table.dataset.fitPin;
    let hint = box.querySelector(':scope > .table-scroll-hint');
    if (can) {
      if (!hint) { hint = document.createElement('div'); hint.className = 'table-scroll-hint no-print'; hint.setAttribute('aria-hidden', 'true'); box.prepend(hint); }
      const label = job.head ? job.head.cells[pin].textContent.replace(/\s+/g, ' ').trim() : '';
      const text = `Bảng ${count} cột · ${TOUCH ? 'vuốt ngang' : 'cuộn ngang (giữ Shift và lăn chuột)'} để xem hết${sticky ? ` · cột ${label ? `“${label}”` : 'đầu'} luôn hiện` : ''}`;
      if (hint.textContent !== text) hint.textContent = text;
      box.tabIndex = 0; box.setAttribute('role', 'group'); box.setAttribute('aria-label', `Bảng ${count} cột, cuộn ngang được`);
    } else {
      if (hint) hint.remove();
      box.removeAttribute('tabindex'); box.removeAttribute('role'); box.removeAttribute('aria-label');
    }
    edge(box);
  }
  seen.set(table, job.signature);
  const target = box || job.holder;
  if (resizeWatch && !watched.has(target)) { watched.add(target); resizeWatch.observe(target); }
  if (box && resizeWatch && !watched.has(box.parentElement)) { watched.add(box.parentElement); resizeWatch.observe(box.parentElement); }
}

const sortBarOf = (table) => (table.previousElementSibling && table.previousElementSibling.classList.contains('fit-sortbar') ? table.previousElementSibling : null);
function dropSortBar(table) { const bar = sortBarOf(table); if (bar) bar.remove(); }

/**
 * ĐIỆN THOẠI: bảng danh sách không vừa màn hình thành một chồng THẺ — mỗi dòng một thẻ, nhãn cột nằm ngay trên
 * giá trị, không còn phải vuốt ngang. Chỉ đổi cách trình bày (lớp CSS + nhãn trên ô); dòng, ô, nút bấm vẫn là của trang.
 */
function applyCards(job) {
  const { table, head, bodies, columns, avail } = job;
  const { main, wide } = cardLayout(columns, avail);
  const labels = Array.from(head.cells, (cell) => cell.textContent.replace(/\s+/g, ' ').trim());
  clearWidths(table);
  table.style.minWidth = '0';
  table.classList.remove('fit-sticky'); delete table.dataset.fitPin;
  for (const row of bodies) {
    Array.from(row.cells).forEach((cell, i) => {
      if (cell.dataset.fitLabel !== labels[i]) cell.dataset.fitLabel = labels[i];
      cell.classList.toggle('fit-wide', wide[i]); cell.classList.toggle('fit-main', i === main); cell.classList.toggle('fit-hide', Boolean(columns[i].hidden));
    });
  }
  table.classList.add('fit-on', 'fit-cards');
  const box = job.scroller;
  if (box) {
    box.classList.remove('can-scroll', 'scrolled'); box.removeAttribute('tabindex'); box.removeAttribute('role'); box.removeAttribute('aria-label');
    const hint = box.querySelector(':scope > .table-scroll-hint'); if (hint) hint.remove();
  }
  // Tiêu đề cột đã ẩn nên việc sắp xếp chuyển lên một ô chọn phía trên chồng thẻ.
  const sortable = Array.from(head.cells).map((th, i) => (th.classList.contains('fit-sort') ? i : -1)).filter((i) => i >= 0);
  let bar = sortBarOf(table);
  if (!sortable.length) { if (bar) bar.remove(); } else {
    if (!bar) {
      bar = document.createElement('div'); bar.className = 'fit-sortbar no-print';
      bar.innerHTML = '<label>Sắp xếp theo <select></select></label><button type="button" class="fit-flip" aria-label="Đảo chiều sắp xếp" disabled>Đảo chiều</button>';
      table.before(bar);
      const select = bar.querySelector('select'), flip = bar.querySelector('button');
      const click = () => { const th = head.cells[Number(select.value)]; if (th) th.click(); };
      select.addEventListener('change', () => { flip.disabled = select.value === ''; click(); });
      flip.addEventListener('click', click);
    }
    const select = bar.querySelector('select');
    const key = sortable.map((i) => labels[i]).join('|');
    if (select.dataset.key !== key) {
      select.dataset.key = key;
      select.innerHTML = '<option value="">— chọn cột —</option>';
      for (const i of sortable) { const option = document.createElement('option'); option.value = String(i); option.textContent = labels[i]; select.append(option); }
    }
  }
  seen.set(table, job.signature);
  const target = box || job.holder;
  if (resizeWatch && !watched.has(target)) { watched.add(target); resizeWatch.observe(target); }
}

/** Đã cuộn khỏi mép trái / đã tới mép phải: để CSS vẽ bóng cột ghim và bỏ lớp mờ. */
function edge(box) {
  box.classList.toggle('scrolled', box.scrollLeft > 2);
  box.classList.toggle('at-end', box.scrollLeft + box.clientWidth >= box.scrollWidth - 2);
}

/**
 * Dàn cột cho các bảng trong `root`. Đo gộp: cả lượt chỉ buộc trình duyệt dàn trang ba lần
 * dù có bao nhiêu bảng.
 */
export function fitTables() {
  if (working || typeof document === 'undefined') return 0;
  working = true;
  try {
    const tables = Array.from(document.querySelectorAll('main table, dialog table'));
    const jobs = tables.map(prepare).filter(Boolean);
    if (!jobs.length) return 0;
    measure(jobs);
    for (const job of jobs) job.plan = planColumns(job.columns, job.inner);
    // Bảng chỉ rộng hơn khung tới 20%: thử chế độ gọn (lề ô và cỡ chữ nhỏ một nấc). Vừa thì giữ, không vừa
    // thì trả về cỡ thường — đã phải cuộn thì để chữ thoáng.
    const tight = jobs.filter((job) => job.plan.scroll && job.plan.total <= job.inner * 1.2);
    if (tight.length) {
      for (const job of tight) job.table.classList.add('fit-tight');
      for (const job of tight) readPads(job);
      measure(tight);
      const back = [];
      for (const job of tight) {
        const plan = planColumns(job.columns, job.inner);
        if (plan.scroll) { job.table.classList.remove('fit-tight'); back.push(job); } else job.plan = plan;
      }
      if (back.length) { for (const job of back) readPads(job); measure(back); for (const job of back) job.plan = planColumns(job.columns, job.inner); }
    }
    // Điện thoại: bảng danh sách vẫn phải cuộn ngang thì chuyển thành thẻ.
    for (const job of jobs) job.cards = job.simple && job.plan.scroll && job.avail < CARD_BELOW;
    for (const job of jobs) if (job.cards) applyCards(job); else apply(job);
    // TỰ SOÁT: cột nội dung một dòng mà thực tế rộng hơn phần được chia (phông chữ vừa đổi, ảnh, nút bấm…) sẽ
    // lấn chỗ cột chữ. Ghi nhận bề rộng thật rồi chia lại một lần.
    const again = [];
    for (const job of jobs) {
      if (job.cards) continue;
      const actual = widthsOf(job.body, job.scale);
      let grew = false;
      // Bảng được tính là VỪA khung mà thực tế vẫn rộng hơn khung: có cột chữ chứa một từ không ngắt được (đường dẫn,
      // tên tệp, mã dài) rộng hơn phần chia. Lấy bề rộng thật làm mức sàn của cột đó rồi chia lại — không vừa nữa
      // thì bảng vào khung cuộn, trang không bị đẩy rộng.
      const spill = !job.plan.scroll && job.table.getBoundingClientRect().width / job.scale > job.avail + 2;
      job.columns.forEach((c, i) => {
        if (actual[i] <= job.plan.widths[i] + 2) return;
        if (!c.wraps || c.body - c.pad <= ONE_LINE) { c.body = actual[i]; grew = true; }
        else if (spill) { c.fixed = Math.max(c.fixed || 0, actual[i]); grew = true; }
      });
      if (grew) { job.scroller = job.table.parentElement.classList.contains('table-scroll') ? job.table.parentElement : null; job.plan = planColumns(job.columns, job.inner); again.push(job); }
    }
    for (const job of again) apply(job);
    return jobs.length;
  } finally {
    if (changeWatch) changeWatch.takeRecords();   // thay đổi do chính ta gây ra: không tự gọi lại
    working = false;
  }
}

const touchesTable = (node) => node.nodeType === 1 && (node.tagName === 'TABLE' || node.closest('table') || node.querySelector('table'));

/** Theo dõi trang: bảng mới dựng, bảng đổi nội dung, khung đổi bề rộng, phông chữ nạp xong. */
export function watchTables() {
  if (typeof document === 'undefined' || changeWatch) return;
  // Khung đổi bề rộng (xoay máy, đổi cỡ hiển thị, mở thẻ đang ẩn): dàn lại ở khung hình kế tiếp —
  // sửa bố cục ngay trong lúc ResizeObserver đang báo thì trình duyệt ghi lỗi "loop".
  let framed = 0;
  const later = () => { if (!framed) framed = requestAnimationFrame(() => { framed = 0; fitTables(); }); };
  if (typeof ResizeObserver === 'function') resizeWatch = new ResizeObserver(later);
  changeWatch = new MutationObserver((records) => {
    for (const record of records) {
      if (touchesTable(record.target) || Array.from(record.addedNodes).some(touchesTable)) { fitTables(); return; }
    }
  });
  changeWatch.observe(document.body, { childList: true, subtree: true });
  fitTables();
  // Phông chữ nạp dần (mỗi độ đậm, mỗi bảng mã một tệp, chỉ tải khi có chữ cần tới): chữ rộng ra khoảng 7% so với
  // phông thay thế, nên mỗi đợt nạp xong phải đo lại.
  const fontsDone = () => { epoch++; later(); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fontsDone).catch(() => {});
  if (document.fonts && typeof document.fonts.addEventListener === 'function') document.fonts.addEventListener('loadingdone', fontsDone);
  // Đổi kiểu hiển thị Gọn/Thoáng làm lề ô đổi: đo lại.
  new MutationObserver(later).observe(document.documentElement, { attributes: true, attributeFilter: ['data-density', 'data-room', 'style'] });
  window.addEventListener('resize', later);
}
