/* ============================================================================
 *  lib/analytics.js — PHÂN TÍCH DỮ LIỆU ĐẤU THẦU
 *
 *  Ba nhóm phân tích:
 *    1. Hồ sơ nhà thầu        — contractorProfile()
 *    2. Chân dung giảm giá    — discountProfile(), winThreshold()
 *    3. Quan hệ CĐT–nhà thầu  — investorMatrix(), competitionStats()
 *
 *  ---------------------------------------------------------------------------
 *  NGUỒN DỮ LIỆU: "QUAN SÁT" (observation)
 *  ---------------------------------------------------------------------------
 *  Một quan sát = một dòng "nhà thầu X dự gói Y với giá Z, giảm N%".
 *  Có hai nguồn, độ đầy đủ khác nhau:
 *
 *    • Biên bản mở thầu (chức năng 3) — có ĐỦ mọi nhà thầu dự gói, kèm giá dự
 *      thầu và % giảm giá của từng bên. Đây là nguồn quý nhất; chỉ nguồn này
 *      mới cho biết một gói có mấy nhà thầu tham gia.
 *
 *    • Kết quả LCNT (chức năng 2) — chỉ có NGƯỜI THẮNG. Dùng để tính tỷ lệ
 *      trúng và giá trị, nhưng KHÔNG dùng để đếm số đối thủ, vì sẽ ra kết luận
 *      sai là "gói nào cũng chỉ có 1 nhà thầu".
 *
 *  ---------------------------------------------------------------------------
 *  BA RÀNG BUỘC KHÔNG ĐƯỢC PHÁ
 *  ---------------------------------------------------------------------------
 *  • Gói LIÊN DANH không quy giá trị cho một thành viên (e-GP không công bố
 *    tỷ lệ góp). Luôn tách `soloValue` và `ventureValue`.
 *  • Quan sát khớp gần đúng theo tên KHÔNG vào số liệu chính thức.
 *  • Mẫu nhỏ hơn ngưỡng thì đánh dấu `reliable:false`, không đưa ra kết luận.
 * ========================================================================== */

import { cleanText, foldText } from './core.js';
import { normalizeTaxCodeForEgp } from './kqlcnt.js';
import { isOfficial } from './provenance.js';
import {
  describe, rate, hhi, countBy, sumBy, sum, median, round2,
  priceBand, PRICE_BANDS, MIN_SAMPLE, MIN_SAMPLE_COMPARE
} from './stats.js';

/* --------------------------------------------------------------------------
 *  DỰNG QUAN SÁT TỪ DỮ LIỆU ĐÃ THU
 * ------------------------------------------------------------------------ */

/**
 * Từ một gói Biên bản mở thầu (đã đọc được bảng nhà thầu) → nhiều quan sát.
 * Mỗi nhà thầu dự gói là một dòng.
 */
export function observationsFromBidOpen(pkg) {
  const bidders = (pkg && pkg.bidders) || [];
  if (!bidders.length) return [];
  const total = bidders.length;
  return bidders.map((b) => ({
    source: 'bbmt',
    notifyNo: cleanText(pkg.notifyNo),
    packageKey: cleanText(pkg.key),
    bidName: cleanText(pkg.bidName),
    investorName: cleanText(pkg.investorName),
    investorFold: foldText(pkg.investorName),
    field: cleanText(pkg.field),
    location: cleanText(pkg.location),
    packageBasis: pkg.bidPrice ?? null,
    taxCode: cleanText(b.taxCode),
    contractorName: cleanText(b.name),
    isVenture: Boolean(b.isVenture),
    bidPrice: b.bidPrice ?? null,
    finalPrice: b.finalPrice ?? null,
    discountPercent: b.discountPercent ?? null,
    vsPackageRate: b.vsPackageRate ?? null,
    priceRank: b.priceRank ?? null,
    // Chỉ nguồn biên bản mở thầu mới biết chắc số nhà thầu tham dự.
    bidderCount: total,
    won: null,                       // giai đoạn này chưa có kết quả
    at: pkg.bidRealityOpenDate || pkg.publicDateKqmt || null,
    sourceUrl: cleanText(pkg.detailUrl),
    confidence: b.taxCode ? 'exact' : 'derived'
  }));
}

/**
 * Từ một gói KQLCNT (đã chuẩn hoá) → quan sát của NGƯỜI THẮNG.
 * `bidderCount` để null vì kết quả không cho biết có bao nhiêu người dự.
 */
export function observationsFromWinner(pkg) {
  if (!pkg || !pkg.notifyNo) return [];
  const codes = (pkg.winningTaxCodes || []).filter(Boolean);
  if (!codes.length) return [];
  return codes.map((code) => ({
    source: 'kqlcnt',
    notifyNo: cleanText(pkg.notifyNo),
    packageKey: cleanText(pkg.key),
    bidName: cleanText(pkg.bidName),
    investorName: cleanText(pkg.investorName),
    investorFold: foldText(pkg.investorName),
    field: cleanText(pkg.field),
    location: cleanText(pkg.location),
    packageBasis: pkg.priceBasis ?? null,
    taxCode: cleanText(code),
    contractorName: cleanText(pkg.isVenture ? (pkg.ventureName || pkg.winnerName) : pkg.winnerName),
    isVenture: Boolean(pkg.isVenture),
    bidPrice: null,
    finalPrice: pkg.winningPrice ?? null,
    discountPercent: pkg.discountRate ?? null,
    vsPackageRate: pkg.discountRate ?? null,
    priceRank: null,
    bidderCount: null,
    won: true,
    at: pkg.decisionDate || pkg.publicDateKqlcnt || null,
    sourceUrl: cleanText(pkg.detailUrl || pkg.sourceUrl),
    confidence: pkg.confidence || 'server'
  }));
}

/** Khoá chống trùng một quan sát: một nhà thầu trong một gói chỉ tính một lần. */
export function observationKey(o) {
  return `${o.notifyNo}::${o.taxCode || foldText(o.contractorName)}::${o.source}`;
}

/** Gộp nhiều đợt quan sát, bản mới ghi đè bản cũ cùng khoá. */
export function mergeObservations(existing, incoming) {
  const map = new Map((existing || []).map((o) => [observationKey(o), o]));
  for (const o of incoming || []) {
    if (!o || !o.notifyNo) continue;
    map.set(observationKey(o), { ...(map.get(observationKey(o)) || {}), ...o });
  }
  return [...map.values()];
}

/** Chỉ giữ quan sát đủ tin cậy để vào số liệu chính thức. */
function official(list) {
  return (list || []).filter((o) => isOfficial(o.confidence) || o.confidence === 'derived');
}

/* ==========================================================================
 *  1. HỒ SƠ NHÀ THẦU
 * ======================================================================== */

/**
 * Dựng hồ sơ năng lực đầy đủ của một nhà thầu theo mã số thuế.
 *
 * @param {Array} observations  toàn bộ quan sát đã tích luỹ
 * @param {string} taxCode      mã số thuế 10 số
 */
export function contractorProfile(observations, taxCode) {
  const mst = normalizeTaxCodeForEgp(taxCode);
  if (!mst) return null;

  const all = official(observations).filter((o) => o.taxCode === mst);
  if (!all.length) {
    return { taxCode: mst, name: '', n: 0, empty: true,
      note: 'Chưa có dữ liệu nào về mã số thuế này. Hãy chạy tra cứu trúng thầu hoặc soi biên bản mở thầu trước.' };
  }

  // Tên hay gặp nhất, ưu tiên bản ghi không phải liên danh (tên liên danh
  // không phải tên pháp nhân).
  const names = countBy(all.filter((o) => !o.isVenture), (o) => o.contractorName);
  const name = names.length ? names[0].key : cleanText(all[0].contractorName);

  // Gói đã dự: chỉ đếm được từ biên bản mở thầu.
  const joined = all.filter((o) => o.source === 'bbmt');
  const wins = all.filter((o) => o.won === true);
  const soloWins = wins.filter((o) => !o.isVenture);
  const ventureWins = wins.filter((o) => o.isVenture);

  // Tỷ lệ trúng chỉ tính trên các gói VỪA thấy dự VỪA biết kết quả — nếu lấy
  // tổng số gói trúng chia tổng số gói dự từ hai nguồn rời nhau thì sai.
  const joinedNos = new Set(joined.map((o) => o.notifyNo));
  const winNos = new Set(wins.map((o) => o.notifyNo));
  const decided = [...joinedNos].filter((no) => winNos.has(no));
  const winRate = rate(decided.length, joinedNos.size, MIN_SAMPLE);

  const discountAll = describe(all.map((o) => o.discountPercent));
  const ranks = joined.map((o) => o.priceRank).filter((r) => Number.isFinite(r));
  const cheapest = joined.filter((o) => o.priceRank === 1).length;

  return {
    taxCode: mst,
    name,
    empty: false,
    n: all.length,

    // Quy mô
    joinedCount: joinedNos.size,
    winCount: winNos.size,
    soloWinCount: new Set(soloWins.map((o) => o.notifyNo)).size,
    ventureWinCount: new Set(ventureWins.map((o) => o.notifyNo)).size,
    winRate,

    // Giá trị — TÁCH BẠCH độc lập và liên danh
    soloValue: sum(soloWins.map((o) => o.finalPrice)),
    ventureValue: sum(ventureWins.map((o) => o.finalPrice)),
    ventureShareUnknown: ventureWins.length > 0,

    // Hành vi giá
    discount: discountAll,
    cheapestCount: cheapest,
    cheapestRate: rate(cheapest, joined.length, MIN_SAMPLE),
    avgRank: ranks.length ? round2(ranks.reduce((s, r) => s + r, 0) / ranks.length) : null,

    // Địa bàn & lĩnh vực
    byField: countBy(all, (o) => o.field).slice(0, 8),
    byLocation: countBy(all, (o) => (o.location || '').split(';')[0].trim()).slice(0, 8),
    byInvestor: countBy(all, (o) => o.investorName).slice(0, 10),
    byYear: countBy(all, (o) => (o.at ? new Date(o.at).getFullYear() : null))
      .sort((a, b) => Number(b.key) - Number(a.key)),

    // Bạn liên danh: các MST khác cùng xuất hiện ở gói liên danh
    partners: partnersOf(observations, mst),

    sampleNote: all.length < MIN_SAMPLE
      ? `Chỉ có ${all.length} bản ghi — số liệu dưới đây chưa đủ tin cậy để kết luận.`
      : ''
  };
}

/** Các nhà thầu từng liên danh cùng MST này. */
export function partnersOf(observations, taxCode) {
  const mst = normalizeTaxCodeForEgp(taxCode);
  if (!mst) return [];
  const all = official(observations);
  const myVenturePkgs = new Set(
    all.filter((o) => o.taxCode === mst && o.isVenture).map((o) => o.notifyNo));
  if (!myVenturePkgs.size) return [];
  const partners = all.filter((o) => myVenturePkgs.has(o.notifyNo) && o.taxCode && o.taxCode !== mst);
  const grouped = new Map();
  for (const p of partners) {
    const cur = grouped.get(p.taxCode) || { taxCode: p.taxCode, name: p.contractorName, count: 0 };
    cur.count += 1;
    if (!cur.name && p.contractorName) cur.name = p.contractorName;
    grouped.set(p.taxCode, cur);
  }
  return [...grouped.values()].sort((a, b) => b.count - a.count);
}

/* ==========================================================================
 *  2. CHÂN DUNG GIẢM GIÁ & NGƯỠNG THẮNG
 * ======================================================================== */

/**
 * Phân bố mức giảm giá theo lĩnh vực và khoảng giá.
 *
 * Trả về từng ô (lĩnh vực × khoảng giá) kèm cỡ mẫu, để giao diện chỉ hiện ô
 * nào đủ dữ liệu. Mức giảm của gói 500 triệu và gói 500 tỷ không so trực tiếp
 * được nên bắt buộc phải chia khoảng.
 */
export function discountProfile(observations, filter = {}) {
  let rows = official(observations)
    .filter((o) => o.discountPercent !== null && o.discountPercent !== undefined);

  if (filter.field) rows = rows.filter((o) => o.field === filter.field);
  if (filter.taxCode) {
    const mst = normalizeTaxCodeForEgp(filter.taxCode);
    rows = rows.filter((o) => o.taxCode === mst);
  }
  if (filter.investor) {
    const q = foldText(filter.investor);
    rows = rows.filter((o) => (o.investorFold || foldText(o.investorName)).includes(q));
  }

  const overall = describe(rows.map((o) => o.discountPercent));

  const bands = PRICE_BANDS.map((band) => {
    const inBand = rows.filter((o) => {
      const b = priceBand(o.packageBasis);
      return b && b.key === band.key;
    });
    return {
      band: band.label,
      key: band.key,
      ...describe(inBand.map((o) => o.discountPercent)),
      winners: inBand.filter((o) => o.won === true).length
    };
  }).filter((b) => b.n > 0);

  const fields = countBy(rows, (o) => o.field).map((f) => {
    const inField = rows.filter((o) => o.field === f.key);
    return { field: f.key, ...describe(inField.map((o) => o.discountPercent)) };
  });

  return {
    overall,
    bands,
    fields,
    total: rows.length,
    reliable: overall.reliable,
    note: overall.reliable ? '' : `Mới có ${rows.length} bản ghi có mức giảm giá — cần ít nhất ${MIN_SAMPLE} để nói được gì.`
  };
}

/**
 * Ngưỡng giảm giá để THẮNG — câu hỏi "giảm bao nhiêu thì đủ".
 *
 * Chỉ tính trên gói ĐÃ CÓ KẾT QUẢ. So mức giảm của người thắng với mức giảm
 * của toàn bộ người dự trong cùng gói, theo từng khoảng giá.
 */
export function winThreshold(observations, filter = {}) {
  let rows = official(observations);
  if (filter.field) rows = rows.filter((o) => o.field === filter.field);

  // Gom theo gói để biết trong mỗi gói ai thắng, mức giảm bao nhiêu.
  const byPackage = new Map();
  for (const o of rows) {
    if (!byPackage.has(o.notifyNo)) byPackage.set(o.notifyNo, []);
    byPackage.get(o.notifyNo).push(o);
  }

  const decided = [];
  for (const [notifyNo, list] of byPackage) {
    const winner = list.find((o) => o.won === true);
    if (!winner || winner.discountPercent === null || winner.discountPercent === undefined) continue;
    decided.push({
      notifyNo,
      basis: winner.packageBasis,
      winnerDiscount: winner.discountPercent,
      bidderCount: Math.max(...list.map((o) => o.bidderCount || 0)) || null,
      field: winner.field
    });
  }

  const bands = PRICE_BANDS.map((band) => {
    const inBand = decided.filter((d) => {
      const b = priceBand(d.basis);
      return b && b.key === band.key;
    });
    const d = describe(inBand.map((x) => x.winnerDiscount), MIN_SAMPLE_COMPARE);
    return {
      band: band.label,
      key: band.key,
      n: d.n,
      reliable: d.reliable,
      // "Giảm tối thiểu nên cân nhắc" = phân vị 25 của người thắng: dưới mức
      // này thì 3/4 người thắng đã giảm sâu hơn bạn.
      suggestedMin: d.q1,
      median: d.median,
      aggressive: d.q3,
      max: d.max
    };
  }).filter((b) => b.n > 0);

  return {
    bands,
    total: decided.length,
    reliable: decided.length >= MIN_SAMPLE_COMPARE,
    note: decided.length >= MIN_SAMPLE_COMPARE
      ? ''
      : `Mới có ${decided.length} gói vừa biết người thắng vừa biết mức giảm. `
        + `Cần ít nhất ${MIN_SAMPLE_COMPARE} gói thì ngưỡng mới có ý nghĩa. `
        + 'Chạy thêm "Soi biên bản mở thầu" để tích luỹ.'
  };
}

/* ==========================================================================
 *  3. QUAN HỆ CHỦ ĐẦU TƯ ↔ NHÀ THẦU
 * ======================================================================== */

/**
 * Ma trận CĐT × Nhà thầu.
 *
 * ⚠️ CẢNH BÁO BẮT BUỘC HIỂN THỊ: đây là TÍN HIỆU THỐNG KÊ, không phải bằng
 * chứng vi phạm. Một nhà thầu trúng nhiều gói của cùng chủ đầu tư có thể chỉ
 * vì họ mạnh ở địa bàn đó. Không được dùng để cáo buộc.
 */
export function investorMatrix(observations, options = {}) {
  const minPackages = Number(options.minPackages) || 2;
  const all = official(observations);

  const byInvestor = new Map();
  for (const o of all) {
    if (!o.investorName || !o.taxCode) continue;
    if (!byInvestor.has(o.investorName)) byInvestor.set(o.investorName, []);
    byInvestor.get(o.investorName).push(o);
  }

  const rows = [];
  for (const [investorName, list] of byInvestor) {
    const packages = new Set(list.map((o) => o.notifyNo));
    if (packages.size < minPackages) continue;

    const pairs = new Map();
    for (const o of list) {
      const cur = pairs.get(o.taxCode) || {
        taxCode: o.taxCode, name: o.contractorName,
        joined: new Set(), won: new Set(), value: 0
      };
      cur.joined.add(o.notifyNo);
      if (o.won === true) {
        cur.won.add(o.notifyNo);
        if (!o.isVenture) cur.value += Number(o.finalPrice) || 0;
      }
      if (!cur.name && o.contractorName) cur.name = o.contractorName;
      pairs.set(o.taxCode, cur);
    }

    const contractors = [...pairs.values()].map((c) => ({
      taxCode: c.taxCode,
      name: c.name,
      joined: c.joined.size,
      won: c.won.size,
      winRate: rate(c.won.size, c.joined.size, MIN_SAMPLE),
      soloValue: c.value
    })).sort((a, b) => b.won - a.won || b.joined - a.joined);

    // Mức tập trung: giá trị gói rơi vào tay bao nhiêu nhà thầu.
    const concentration = hhi(contractors.map((c) => c.soloValue));
    const topWinner = contractors.find((c) => c.won > 0) || null;
    const totalWon = contractors.reduce((s, c) => s + c.won, 0);

    rows.push({
      investorName,
      packageCount: packages.size,
      contractorCount: contractors.length,
      contractors: contractors.slice(0, 20),
      concentration,
      topWinner,
      topWinnerShare: topWinner && totalWon ? rate(topWinner.won, totalWon, MIN_SAMPLE) : null
    });
  }

  return rows.sort((a, b) => b.packageCount - a.packageCount);
}

/**
 * Thống kê mức độ cạnh tranh.
 *
 * Chỉ dùng quan sát từ BIÊN BẢN MỞ THẦU — vì chỉ nguồn đó mới biết một gói có
 * bao nhiêu nhà thầu dự. Lấy cả dữ liệu KQLCNT vào đây sẽ ra kết luận sai là
 * "gói nào cũng một mình một ngựa".
 */
export function competitionStats(observations, filter = {}) {
  let rows = official(observations).filter((o) => o.source === 'bbmt' && o.bidderCount);
  if (filter.investor) {
    const q = foldText(filter.investor);
    rows = rows.filter((o) => (o.investorFold || foldText(o.investorName)).includes(q));
  }
  if (filter.field) rows = rows.filter((o) => o.field === filter.field);

  // Mỗi gói tính một lần.
  const perPackage = new Map();
  for (const o of rows) perPackage.set(o.notifyNo, o.bidderCount);
  const counts = [...perPackage.values()];

  const single = counts.filter((c) => c === 1).length;
  const desc = describe(counts);

  return {
    packageCount: counts.length,
    bidders: desc,
    singleBidderCount: single,
    singleBidderRate: rate(single, counts.length, MIN_SAMPLE),
    distribution: countBy(counts.map((c) => ({ c })), (x) => (x.c >= 5 ? '5+' : String(x.c)))
      .sort((a, b) => (a.key === '5+' ? 1 : b.key === '5+' ? -1 : Number(a.key) - Number(b.key))),
    reliable: counts.length >= MIN_SAMPLE,
    note: counts.length >= MIN_SAMPLE
      ? ''
      : `Mới có ${counts.length} gói đọc được biên bản mở thầu. `
        + 'Chạy "Soi biên bản mở thầu" để tích luỹ thêm.'
  };
}

/** Câu cảnh báo bắt buộc kèm mọi phân tích quan hệ. */
export const RELATIONSHIP_DISCLAIMER =
  'Các chỉ số quan hệ dưới đây là TÍN HIỆU THỐNG KÊ từ dữ liệu công khai, '
  + 'KHÔNG phải bằng chứng vi phạm. Một nhà thầu trúng nhiều gói của cùng chủ đầu tư '
  + 'hoàn toàn có thể vì họ mạnh ở địa bàn hoặc lĩnh vực đó. '
  + 'Chỉ dùng để định hướng tìm hiểu, không dùng để cáo buộc bất kỳ ai.';
