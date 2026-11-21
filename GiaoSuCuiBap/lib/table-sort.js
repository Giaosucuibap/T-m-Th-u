/* ============================================================================
 *  BẤM TIÊU ĐỀ CỘT ĐỂ SẮP XẾP (4.23.0)
 *
 *  Các bảng phân tích (nhà thầu đã trúng, gói đã trúng, chủ đầu tư trong địa bàn…) trước đây
 *  chỉ có một thứ tự do phần mềm chọn. Muốn biết ai trúng giá trị lớn nhất, ai giảm giá sâu
 *  nhất phải dò bằng mắt hoặc xuất Excel. Các phần mềm tra thầu trả phí đều cho sắp xếp theo
 *  cột; ở đây làm một lần cho MỌI bảng dạng danh sách: chạm tiêu đề cột → sắp xếp theo cột đó,
 *  chạm lần nữa → đảo chiều. Chỉ đổi THỨ TỰ HIỂN THỊ các dòng đang có; không tra lại, không
 *  lọc, không đổi số liệu — trang dựng lại bảng thì thứ tự gốc trở về.
 *
 *  sortValue / compareValues là hàm thuần (tests/sap-xep-bang-423.test.mjs).
 * ========================================================================== */

/**
 * Giá trị để so của một ô, đọc từ chữ đang hiển thị (kiểu Việt Nam: 12.480.335.000 đ, 13,8%).
 * @returns {{kind: 'empty'}|{kind: 'number', n: number}|{kind: 'text', s: string}}
 */
export function sortValue(text) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s || /^[—–\-?]+$/.test(s) || /^(chưa (có|rõ|xác định|công bố)|không (có|rõ))/i.test(s)) return { kind: 'empty' };
  // Ngày: 2026-11-21 hoặc 21/11/2026 (có thể kèm giờ) → số để so theo thời gian.
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return { kind: 'number', n: Date.UTC(+m[1], +m[2] - 1, +m[3]) };
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?/.exec(s);
  if (m) return { kind: 'number', n: Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) };
  // Số đứng đầu ô: "12.480.335.000 đ", "13,8%", "16 / 0", "1,25 tỷ", "-3,5%". Chữ đứng trước số thì là chữ.
  m = /^([+\-−]?)\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s*(tỷ|triệu|nghìn)?/i.exec(s);
  if (m) {
    let n = Number(m[2].replace(/\./g, '') + (m[3] ? `.${m[3]}` : ''));
    const unit = (m[4] || '').toLowerCase();
    if (unit === 'tỷ') n *= 1e9; else if (unit === 'triệu') n *= 1e6; else if (unit === 'nghìn') n *= 1e3;
    if (m[1] === '-' || m[1] === '−') n = -n;
    return { kind: 'number', n };
  }
  return { kind: 'text', s };
}

const collator = typeof Intl === 'object' && Intl.Collator ? new Intl.Collator('vi', { numeric: true, sensitivity: 'base' }) : null;
/** So hai giá trị; ô trống luôn nằm cuối, bất kể chiều sắp xếp. `direction`: 1 tăng dần, −1 giảm dần. */
export function compareValues(a, b, direction = 1) {
  if (a.kind === 'empty' || b.kind === 'empty') return a.kind === b.kind ? 0 : a.kind === 'empty' ? 1 : -1;
  if (a.kind === 'number' && b.kind === 'number') return (a.n - b.n) * direction;
  if (a.kind !== b.kind) return (a.kind === 'number' ? -1 : 1) * direction;
  return (collator ? collator.compare(a.s, b.s) : a.s.localeCompare(b.s)) * direction;
}

/** Chữ chính của một ô: bỏ dòng phụ (.sub), nút bấm và phần chỉ dành cho máy đọc màn hình. */
function cellText(cell) {
  let out = '';
  const walker = cell.ownerDocument.createTreeWalker(cell, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement.closest('.sub, button, .sr-only, [hidden]')) continue;
    out += ` ${node.textContent}`;
  }
  return out;
}

const SKIP = '.brief-table, .comparison, .run-comparison-table, [data-sort="off"]';
const bound = new WeakSet();

/**
 * Cho phép sắp xếp một bảng nếu nó là bảng DANH SÁCH: một hàng tiêu đề, từ 4 dòng dữ liệu cùng số ô,
 * không có ô gộp, không có tiêu đề dòng. Gọi lại nhiều lần không sao.
 */
export function enableSort(table) {
  if (!table || bound.has(table) || table.matches(SKIP)) return false;
  const rows = Array.from(table.rows);
  const head = rows.find((row) => row.cells.length > 1 && Array.from(row.cells).every((cell) => cell.tagName === 'TH'));
  if (!head) return false;
  const count = head.cells.length;
  const body = rows.filter((row) => row !== head && row.parentElement.tagName !== 'THEAD' && row.parentElement.tagName !== 'TFOOT');
  if (body.length < 4 || body.some((row) => row.cells.length !== count || Array.from(row.cells).some((cell) => cell.colSpan > 1 || cell.rowSpan > 1 || cell.tagName === 'TH'))) return false;
  if (new Set(body.map((row) => row.parentElement)).size !== 1) return false;
  bound.add(table);
  let active = -1, direction = 1;
  Array.from(head.cells).forEach((th, index) => {
    if (!th.textContent.trim()) return;                       // cột vẽ thanh, cột nút bấm
    th.classList.add('fit-sort'); th.tabIndex = 0; th.setAttribute('role', 'columnheader'); th.setAttribute('aria-sort', 'none');
    const go = () => {
      const live = Array.from(table.rows).filter((row) => row !== head && row.parentElement.tagName !== 'THEAD' && row.cells.length === count);
      if (live.length < 2) return;
      const values = new Map(live.map((row) => [row, sortValue(cellText(row.cells[index]))]));
      const numeric = Array.from(values.values()).filter((v) => v.kind === 'number').length >= Array.from(values.values()).filter((v) => v.kind !== 'empty').length * 0.7;
      // Lần chạm đầu: cột số xếp lớn → nhỏ (thứ người ta muốn xem trước), cột chữ xếp A → Z.
      direction = active === index ? -direction : numeric ? -1 : 1;
      active = index;
      const parent = live[0].parentElement;
      live.map((row, order) => ({ row, order })).sort((a, b) => compareValues(values.get(a.row), values.get(b.row), direction) || a.order - b.order)
        .forEach(({ row }) => parent.appendChild(row));
      Array.from(head.cells).forEach((cell, i) => { if (cell.classList.contains('fit-sort')) cell.setAttribute('aria-sort', i === index ? (direction === 1 ? 'ascending' : 'descending') : 'none'); });
    };
    th.addEventListener('click', go);
    th.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); go(); } });
  });
  return true;
}
