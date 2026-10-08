import { pairStats, venturePartners, RELATION_NOTE } from './relations.js';

/* Soi quan hệ (4.17.0): tra theo MST → nhà thầu này trúng tập trung ở chủ đầu
   tư nào, và đối tác liên danh thường xuyên. Tỉ trọng tính theo số gói TRÚNG
   CỦA NHÀ THẦU trong dữ liệu đã tải — không suy ra tỉ trọng phía chủ đầu tư. */
export function contractorRelationsHtml(list, focusTaxCode, { esc, formatMoney }) {
  if (!focusTaxCode || !list.length) return '';
  const pairs = pairStats(list.filter((p) => (p.winningTaxCodes || []).includes(focusTaxCode)), { scope: 'contractor' })
    .filter((r) => r.taxCode === focusTaxCode).slice(0, 15);
  const partners = venturePartners(list, focusTaxCode).slice(0, 10);
  const weak = (x) => (x.reliable ? '' : ' class="weak" title="Cỡ mẫu nhỏ, chưa đủ tin"');
  const rows = pairs.map((r) => `<tr>
      <td>${esc(r.investorName || r.investorKey)}${r.review ? ` <span class="pill" style="background:#fffbeb;color:#92400e" title="${esc(r.flags.join(' · '))}">Cần xem</span>` : ''}</td>
      <td class="num"><b>${r.packages}</b></td><td class="num"${weak(r.share)}>${esc(r.share.text)}</td>
      <td class="num"${weak(r.lessCompetitive.share)}>${esc(r.lessCompetitive.share.text)} <span class="sub">${r.lessCompetitive.count}/${r.lessCompetitive.known}</span></td>
      <td class="num"${weak(r.singleBidder.share)}>${esc(r.singleBidder.share.text)} <span class="sub">${r.singleBidder.count}/${r.singleBidder.known}</span></td>
      <td>${esc(r.years.join(', '))}</td></tr>`).join('');
  const partnerRows = partners.map((p) => `<tr><td class="mst">${esc(p.taxCode)}</td><td class="num"><b>${p.packages}</b></td>
      <td class="num">${esc(formatMoney(p.ventureValue))}</td><td class="wrap">${esc(p.investors.join(' · '))}</td><td>${esc(p.years.join(', '))}</td></tr>`).join('');
  return `<details open><summary><b>Quan hệ với chủ đầu tư</b> — nhà thầu này trúng tập trung ở đâu</summary>
    <table style="margin-top:8px"><thead><tr><th>Chủ đầu tư</th><th class="num">Số gói</th><th class="num">% gói trúng của NT</th>
      <th class="num">Ít cạnh tranh</th><th class="num">Chỉ 1 nhà thầu dự</th><th>Năm</th></tr></thead><tbody>${rows}</tbody></table>
    ${partnerRows ? `<div class="muted small" style="margin-top:12px"><b>Đối tác liên danh thường xuyên</b> (giá trị là của cả gói liên danh — e-GP không công bố phần góp)</div>
    <table style="margin-top:6px"><thead><tr><th>MST đối tác</th><th class="num">Số gói chung</th><th class="num">Giá trị gói</th><th>Chủ đầu tư</th><th>Năm</th></tr></thead><tbody>${partnerRows}</tbody></table>` : ''}
    <p class="muted small" style="margin-top:8px">"Ít cạnh tranh" = chỉ định thầu, chỉ định rút gọn, mua sắm trực tiếp, tự thực hiện, đàm phán giá — trên số gói đã biết hình thức. "Chỉ 1 nhà thầu dự" tính trên số gói e-GP có ghi số nhà thầu (gói ghi 0 = không có số liệu). ${esc(RELATION_NOTE)}</p></details>`;
}
