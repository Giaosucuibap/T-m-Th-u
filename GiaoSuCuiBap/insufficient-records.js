import { hardFilterReason } from './lib/hard-filter.js';
import { safeSource } from './lib/workspace.js';

/** Keep uncertain rows visible for source verification, outside matching totals. */
export function renderInsufficientRecords(container, scan) {
  const rows = Array.isArray(scan?.insufficientPackages) ? scan.insufficientPackages : [];
  container.replaceChildren();
  container.hidden = !rows.length;
  if (!rows.length) return;
  const details = document.createElement('details');
  details.className = 'card insufficient-records';
  const summary = document.createElement('summary');
  summary.textContent = `${rows.length} gói chưa đủ dữ liệu đối chiếu`;
  details.append(summary);
  const note = document.createElement('p');
  note.className = 'muted small';
  note.textContent = 'Chưa tính vào danh sách khớp và các số liệu tổng hợp. Mở nguồn e-GP để kiểm tra.';
  details.append(note);
  const list = document.createElement('ol');
  for (const row of rows.slice(0, 50)) {
    const item = document.createElement('li');
    const url = safeSource(row.detailUrl || row.sourceUrl);
    const title = document.createElement(url ? 'a' : 'span');
    title.textContent = [row.notifyNoStand || row.notifyNo || row.planNo, row.bidName || row.name].filter(Boolean).join(' · ') || 'Gói chưa rõ mã';
    if (url) { title.href = url; title.target = '_blank'; title.rel = 'noopener'; }
    item.append(title);
    const reason = document.createElement('div');
    reason.className = 'small muted';
    reason.textContent = hardFilterReason({state: 'INSUFFICIENT',reason:row.filterReason || row.reason});
    item.append(reason);list.append(item);
  }
  details.append(list);
  if (rows.length > 50) {
    const more = document.createElement('p');more.className = 'muted small';
    more.textContent = `Đang hiện 50/${rows.length} gói. Xuất Excel để xem danh sách đầy đủ.`;details.append(more);
  }
  container.append(details);
}
