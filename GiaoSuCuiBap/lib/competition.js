/* ============================================================================
 *  BỐI CẢNH CẠNH TRANH CỦA MỘT GÓI (4.22.0)
 *
 *  Trả lời bằng SỐ ĐÃ CÓ TRÊN MÁY cho câu hỏi trước khi quyết định dự thầu:
 *    - Chủ đầu tư này thường có mấy nhà thầu dự một gói?
 *    - Ai hay dự, ai hay trúng ở đây?
 *    - Người trúng thường giảm bao nhiêu phần trăm so với giá gói?
 *    - Công ty mình đã dự / trúng bao nhiêu gói của chủ đầu tư này?
 *
 *  KHÔNG tính "xác suất trúng thầu": dữ liệu chỉ gồm các gói đã đọc biên bản mở thầu hoặc
 *  kết quả, không phải toàn bộ thị trường, và kết quả một gói phụ thuộc hồ sơ cụ thể. Mỗi
 *  con số đi kèm cỡ mẫu; dưới 5 mẫu thì ghi rõ là chưa đủ để kết luận (cùng ngưỡng với
 *  lib/stats.js).
 *
 *  Hàm thuần; nguồn là kho quan sát (lib/analytics.js).
 * ========================================================================== */
import { MIN_SAMPLE, median, quantile, round2 } from './stats.js';

const fold = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tax10 = (value) => { const d = String(value ?? '').trim().replace(/^vn/i, '').replace(/[^0-9]/g, ''); return d.length === 10 || d.length === 13 ? d.slice(0, 10) : ''; };
const packOf = (o) => { const raw = String(o.notifyNo || o.packageKey || '').trim(); const code = raw.match(/IB\d+/i)?.[0] || raw.split('::')[0]; return code.replace(/-\d{2}$/, '').toUpperCase(); };

/** Cùng chủ đầu tư: trùng mã định danh, hoặc trùng tên (không dấu), hoặc tên này chứa trọn tên kia (từ 12 ký tự). */
export function sameInvestor(observation = {}, tender = {}) {
  const codeA = String(observation.investorCode || '').trim().toLowerCase(), codeB = String(tender.investorCode || '').trim().toLowerCase();
  if (codeA && codeB) return codeA === codeB;
  const a = fold(observation.investorName), b = fold(tender.investorName || tender.procuringEntityName);
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 12 && (` ${long} `).includes(` ${short} `);
}

function describe(values) {
  const list = values.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!list.length) return { n: 0, median: null, p25: null, p75: null, reliable: false };
  return { n: list.length, median: round2(median(list)), p25: round2(quantile(list, 0.25)), p75: round2(quantile(list, 0.75)), reliable: list.length >= MIN_SAMPLE };
}

/**
 * @param {{tender: object, observations: object[], ownTaxCode?: string}} input
 */
export function competitionBrief({ tender = {}, observations = [], ownTaxCode = '' } = {}) {
  const own = tax10(ownTaxCode);
  const thisPack = packOf({ notifyNo: tender.notifyNo || tender.key });
  const rows = (Array.isArray(observations) ? observations : []).filter((o) => o && typeof o === 'object' && sameInvestor(o, tender) && packOf(o) && packOf(o) !== thisPack);
  const packs = new Map();         // mã gói → {bidders, winner(s), discount, at, field}
  const firms = new Map();         // mst → {name, bids:Set, wins:Set, lastAt}
  for (const o of rows) {
    const pack = packOf(o);
    const p = packs.get(pack) || { code: pack, bidderCount: null, hasWinner: false, discount: null, at: 0 };
    const at = Date.parse(o.at) || 0;
    if (at > p.at) p.at = at;
    if (o.source === 'bbmt' && Number(o.bidderCount) > 0) p.bidderCount = Number(o.bidderCount);
    const won = o.won === true || o.source === 'kqlcnt';
    if (won) {
      p.hasWinner = true;
      const d = Number(o.discountPercent);
      if (o.discountPercent !== null && o.discountPercent !== undefined && Number.isFinite(d) && d > -50 && d < 90) p.discount = d;
    }
    packs.set(pack, p);
    const tax = tax10(o.taxCode);
    const id = tax || fold(o.contractorName);
    if (!id) continue;
    const f = firms.get(id) || { taxCode: tax, name: '', bids: new Set(), wins: new Set(), lastAt: 0 };
    const name = String(o.contractorName || '').trim();
    if (name.length > f.name.length) f.name = name.slice(0, 200);
    f.bids.add(pack);
    if (won) f.wins.add(pack);
    if (at > f.lastAt) f.lastAt = at;
    firms.set(id, f);
  }
  const list = [...packs.values()];
  const counts = list.map((p) => p.bidderCount).filter((n) => Number.isFinite(n) && n > 0);
  const single = counts.filter((n) => n === 1).length;
  const firmRows = [...firms.values()].map((f) => ({ taxCode: f.taxCode, name: f.name || (f.taxCode ? `MST ${f.taxCode}` : 'Chưa rõ tên'), packages: f.bids.size, wins: f.wins.size,
    lastAt: f.lastAt ? new Date(f.lastAt).toISOString() : '', own: Boolean(own && f.taxCode === own) }));
  const ownRow = firmRows.find((f) => f.own) || null;
  const frequent = firmRows.filter((f) => !f.own).sort((a, b) => b.packages - a.packages || b.wins - a.wins || a.name.localeCompare(b.name, 'vi')).slice(0, 6);
  const years = list.map((p) => (p.at ? new Date(p.at + 7 * 3600_000).getUTCFullYear() : 0)).filter(Boolean);
  const total = list.length;
  return {
    investorName: String(tender.investorName || tender.procuringEntityName || '').trim(),
    packages: total,
    withBidders: counts.length,
    withWinner: list.filter((p) => p.hasWinner).length,
    period: years.length ? { from: Math.min(...years), to: Math.max(...years) } : null,
    bidders: { ...describe(counts), single, singleShare: counts.length >= MIN_SAMPLE ? round2(single / counts.length * 100) : null },
    discount: describe(list.map((p) => p.discount).filter((d) => d !== null)),
    frequent,
    own: own ? { taxCode: own, packages: ownRow ? ownRow.packages : 0, wins: ownRow ? ownRow.wins : 0 } : null,
    level: total === 0 ? 'khong' : total < MIN_SAMPLE ? 'it' : 'du',
    minSample: MIN_SAMPLE
  };
}

export const COMPETITION_NOTE = 'Số liệu chỉ gồm các gói của chủ đầu tư này đã có trong kho trên máy (đã đọc biên bản mở thầu hoặc kết quả), không phải toàn bộ lịch sử trên e-GP. '
  + 'Đây là mô tả quá khứ để tham khảo, KHÔNG phải xác suất trúng thầu của gói đang xét.';

/** Các câu nhận xét rút từ số liệu — chỉ nói điều số liệu đủ để nói. */
export function competitionLines(brief = {}) {
  const lines = [];
  if (!brief || brief.level === 'khong') return ['Chưa có gói nào của chủ đầu tư này trong kho. Đọc biên bản mở thầu hoặc tra kết quả các gói trước của họ để có số liệu.'];
  if (brief.level === 'it') lines.push(`Mới có ${brief.packages} gói của chủ đầu tư này trong kho — dưới ${brief.minSample} gói thì chỉ nên coi là tham khảo.`);
  if (brief.bidders.n) {
    lines.push(brief.bidders.reliable
      ? `Trung vị ${String(brief.bidders.median).replace('.', ',')} nhà thầu dự một gói (${brief.bidders.n} gói đọc được biên bản mở thầu)${brief.bidders.singleShare !== null ? `; ${String(brief.bidders.singleShare).replace('.', ',')}% số gói chỉ có một nhà thầu dự` : ''}.`
      : `Có ${brief.bidders.n} gói đọc được số nhà thầu dự — chưa đủ ${brief.minSample} gói để nói mức cạnh tranh thường gặp.`);
  }
  if (brief.discount.n) {
    lines.push(brief.discount.reliable
      ? `Người trúng giảm trung vị ${String(brief.discount.median).replace('.', ',')}% so với giá gói (phần lớn trong khoảng ${String(brief.discount.p25).replace('.', ',')}% – ${String(brief.discount.p75).replace('.', ',')}%, ${brief.discount.n} gói có kết quả).`
      : `Có ${brief.discount.n} gói biết mức giảm giá của người trúng — chưa đủ ${brief.minSample} gói để nói mức giảm thường gặp.`);
  }
  if (brief.own) {
    lines.push(brief.own.packages
      ? `Công ty (MST ${brief.own.taxCode}) có trong ${brief.own.packages} gói của chủ đầu tư này trong kho, trong đó ${brief.own.wins} gói ghi là trúng.`
      : `Trong kho chưa thấy công ty (MST ${brief.own.taxCode}) dự gói nào của chủ đầu tư này.`);
  }
  return lines;
}
