/* ============================================================================
 *  lib/localmarket.js — SOI ĐỊA BÀN
 *
 *  Trả lời câu hỏi: "ở xã/phường này, những công ty nào hay trúng thầu, và họ
 *  trúng của chủ đầu tư nào?"
 *
 *  ---------------------------------------------------------------------------
 *  DỮ LIỆU LẤY TỪ ĐÂU
 *
 *  Bản ghi KQLCNT của e-GP KHÔNG có trường địa bàn nào — đã kiểm chứng bằng
 *  cách liệt kê toàn bộ 43 khoá của một bản ghi thật: không `locations`, không
 *  `provName`, không `districtName`. Chỉ có `investorName` và `investorCode`.
 *
 *  Nên "địa bàn" ở đây được xác định qua TÊN CHỦ ĐẦU TƯ (xem
 *  `buildWardMarketQuery` trong lib/kqlcnt.js). Với câu hỏi trên thì cách này
 *  còn đúng hơn lọc theo địa bàn: tiền của một xã do "UBND xã <tên>" hoặc
 *  "Ban QLDA huyện <tên>" chi, nên tên đơn vị chính là thứ ràng buộc quan hệ.
 *
 *  ---------------------------------------------------------------------------
 *  ĐÂY LÀ THỐNG KÊ MÔ TẢ, KHÔNG PHẢI KẾT LUẬN
 *
 *  Một nhà thầu trúng nhiều gói của một chủ đầu tư là chuyện BÌNH THƯỜNG ở địa
 *  bàn nhỏ: số doanh nghiệp đủ năng lực vốn đã ít, và nhà thầu địa phương có
 *  lợi thế chi phí thật. Các con số dưới đây chỉ mô tả những gì e-GP đã công
 *  bố. Chúng KHÔNG chứng minh thông thầu, dàn xếp, hay bất kỳ vi phạm nào.
 *
 *  Vì vậy module này:
 *    • luôn trả kèm CỠ MẪU, và đánh dấu `reliable:false` khi mẫu quá nhỏ;
 *    • gọi các chỉ số là "dấu hiệu cần xem thêm", không phải "vi phạm";
 *    • không chấm điểm rủi ro tổng hợp — một con số duy nhất rất dễ bị đọc
 *      thành lời buộc tội.
 * ========================================================================== */

import { cleanText, foldText } from './core.js';
import { describe, rate, hhi, round2, MIN_SAMPLE, MIN_SAMPLE_COMPARE } from './stats.js';

/** Ngưỡng tỷ lệ giảm giá coi là "sát giá" — gần chạm trần giá gói thầu. */
export const NEAR_CEILING_RATE = 1.0;

/**
 * Trích các quan sát từ danh sách KQLCNT đã chuẩn hoá.
 *
 * Mỗi gói có thể có NHIỀU nhà thầu trúng (liên danh). Mỗi thành viên sinh một
 * quan sát riêng, nhưng `isVenture` được giữ lại để KHÔNG quy toàn bộ giá trị
 * gói cho một thành viên khi thiếu tỷ lệ góp vốn.
 */
export function observationsFromPackages(packages) {
  const out = [];
  for (const p of packages || []) {
    const investorName = cleanText(p.investorName);
    if (!investorName) continue;
    /* TÊN TRƯỜNG PHẢI KHỚP `normalizeKqlcntRecord`: nó trả về `winningTaxCodes`,
       KHÔNG phải `winningCodes`. Đọc sai tên khiến danh sách mã số thuế luôn
       rỗng, mọi gói bị bỏ qua, và trang Soi địa bàn hiện 0 nhà thầu / 0 chủ
       đầu tư dù đã tải về hàng trăm gói. Giữ `winningCodes` làm phương án dự
       phòng phòng khi có nguồn dữ liệu khác. */
    const codes = (p.winningTaxCodes || p.winningCodes || []).filter(Boolean);
    const names = p.memberNames || [];
    if (!codes.length) continue;

    for (let i = 0; i < codes.length; i++) {
      out.push({
        notifyNo: p.notifyNo,
        notifyNoStand: p.notifyNoStand,
        bidName: p.bidName,
        investorName,
        investorCode: cleanText(p.investorCode),
        investorFold: foldText(investorName),
        taxCode: codes[i],
        // Tên có thể rỗng dù có mã: e-GP đôi khi để trống
        // `winningContractorName`. Mã số thuế mới là khoá định danh.
        contractorName: cleanText(names[i]) || cleanText(p.winnerName) || '',
        isVenture: Boolean(p.isVenture) || codes.length > 1,
        memberCount: codes.length,
        priceBasis: p.priceBasis,
        winningPrice: p.winningPrice,
        discountRate: p.discountRate,
        bidFormLabel: p.bidFormLabel,
        fieldLabel: p.fieldLabel,
        decisionDate: p.decisionDate,
        year: p.decisionDate ? Number(String(p.decisionDate).slice(0, 4)) : null,
        detailUrl: p.detailUrl
      });
    }
  }
  return out;
}

/** Gộp theo khoá, giữ nguyên danh sách quan sát để tính tiếp. */
function groupBy(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  return m;
}

/**
 * Tổng giá trị trúng thầu, tách phần ĐỘC LẬP khỏi phần LIÊN DANH.
 *
 * Không cộng dồn hai phần vào một con số: khi thiếu tỷ lệ góp vốn thì quy cả
 * giá trị gói liên danh cho một thành viên là sai — đây là quy tắc bắt buộc
 * trong CLAUDE.md.
 */
function valueSplit(list) {
  let solo = 0;
  let venture = 0;
  let ventureUnknownShare = 0;
  for (const o of list) {
    const v = Number(o.winningPrice);
    if (!Number.isFinite(v)) continue;
    if (o.isVenture) { venture += v; ventureUnknownShare += 1; }
    else solo += v;
  }
  return { soloValue: solo, ventureValue: venture, ventureShareUnknown: ventureUnknownShare > 0 };
}

/**
 * Hồ sơ từng NHÀ THẦU trên địa bàn.
 * Sắp theo số gói trúng giảm dần.
 */
export function contractorsInArea(observations) {
  const groups = groupBy(observations, (o) => o.taxCode);
  const out = [];
  for (const [taxCode, list] of groups) {
    const investors = [...new Set(list.map((o) => o.investorName))];
    const years = [...new Set(list.map((o) => o.year).filter(Boolean))].sort();
    const discounts = list.map((o) => o.discountRate);
    out.push({
      taxCode,
      // Lấy tên dài nhất trong các lần xuất hiện — bản ghi rỗng tên không đè
      // mất bản ghi có tên.
      name: list.map((o) => o.contractorName).filter(Boolean).sort((a, b) => b.length - a.length)[0] || '',
      packages: list.length,
      soloCount: list.filter((o) => !o.isVenture).length,
      ventureCount: list.filter((o) => o.isVenture).length,
      ...valueSplit(list),
      discount: describe(discounts),
      nearCeiling: list.filter((o) => Number.isFinite(Number(o.discountRate)) && Number(o.discountRate) < NEAR_CEILING_RATE).length,
      investors,
      investorCount: investors.length,
      years,
      firstYear: years[0] || null,
      lastYear: years[years.length - 1] || null,
      packagesList: list
    });
  }
  return out.sort((a, b) => b.packages - a.packages || (b.soloValue + b.ventureValue) - (a.soloValue + a.ventureValue));
}

/**
 * Hồ sơ từng CHỦ ĐẦU TƯ trên địa bàn, kèm mức tập trung.
 *
 * `hhi` là chỉ số Herfindahl–Hirschman tính trên GIÁ TRỊ mà mỗi nhà thầu nhận
 * được từ chủ đầu tư đó. Chỉ số cao nghĩa là giá trị dồn vào ít nhà thầu — một
 * dấu hiệu đáng xem thêm, KHÔNG phải bằng chứng vi phạm.
 */
export function investorsInArea(observations) {
  const groups = groupBy(observations, (o) => o.investorName);
  const out = [];
  for (const [investorName, list] of groups) {
    const byContractor = groupBy(list, (o) => o.taxCode);
    const shares = [];
    for (const [taxCode, items] of byContractor) {
      const value = items.reduce((s, o) => s + (Number(o.winningPrice) || 0), 0);
      shares.push({
        taxCode,
        name: items.map((o) => o.contractorName).filter(Boolean)[0] || '',
        packages: items.length,
        value
      });
    }
    shares.sort((a, b) => b.packages - a.packages || b.value - a.value);

    const totalValue = shares.reduce((s, x) => s + x.value, 0);
    const top = shares[0] || null;

    out.push({
      investorName,
      investorCode: cleanText(list[0] && list[0].investorCode),
      packages: list.length,
      contractorCount: shares.length,
      totalValue,
      // Tỷ lệ SỐ GÓI mà nhà thầu đứng đầu nhận được. Dùng số gói thay vì giá
      // trị vì một gói lớn bất thường có thể đẩy tỷ lệ theo giá trị lên cao mà
      // không phản ánh mức độ lặp lại của quan hệ.
      topShare: top ? rate(top.packages, list.length, MIN_SAMPLE) : rate(0, 0),
      topContractor: top,
      concentration: hhi(shares.map((x) => x.value)),
      discount: describe(list.map((o) => o.discountRate)),
      contractors: shares
    });
  }
  return out.sort((a, b) => b.packages - a.packages || b.totalValue - a.totalValue);
}

/**
 * Ma trận CHỦ ĐẦU TƯ × NHÀ THẦU — chính là "mối quan hệ" người dùng muốn thấy.
 * Sắp theo số gói của từng cặp, giảm dần.
 */
export function relationshipPairs(observations) {
  // Không ghép khoá thành chuỗi rồi tách lại: tên chủ đầu tư chứa dấu cách,
  // và mọi dấu ngăn 'chắc chắn không trùng' đều là một giả định chờ sai. Ở đây
  // giữ thẳng hai trường trong giá trị của Map.
  const groups = new Map();
  const byInvestor = groupBy(observations, (o) => o.investorName);
  for (const o of observations) {
    if (!o.investorName || !o.taxCode) continue;
    const k = JSON.stringify([o.investorName, o.taxCode]);
    if (!groups.has(k)) groups.set(k, { investorName: o.investorName, taxCode: o.taxCode, list: [] });
    groups.get(k).list.push(o);
  }
  const out = [];
  for (const { investorName, taxCode, list } of groups.values()) {
    const investorTotal = (byInvestor.get(investorName) || []).length;
    out.push({
      investorName,
      taxCode,
      contractorName: list.map((o) => o.contractorName).filter(Boolean)[0] || '',
      packages: list.length,
      // Cặp này chiếm bao nhiêu phần trăm số gói của chủ đầu tư đó.
      shareOfInvestor: rate(list.length, investorTotal, MIN_SAMPLE),
      ...valueSplit(list),
      discount: describe(list.map((o) => o.discountRate)),
      years: [...new Set(list.map((o) => o.year).filter(Boolean))].sort(),
      packagesList: list
    });
  }
  return out.sort((a, b) => b.packages - a.packages || (b.soloValue + b.ventureValue) - (a.soloValue + a.ventureValue));
}

/**
 * Các dấu hiệu ĐÁNG XEM THÊM.
 *
 * Mỗi dấu hiệu đều kèm cỡ mẫu và câu giải thích. Không có điểm tổng hợp: một
 * con số duy nhất rất dễ bị đọc thành lời buộc tội.
 */
export function areaSignals({ investors, pairs }) {
  const signals = [];

  for (const inv of investors) {
    // Chỉ xét chủ đầu tư có đủ gói để nói được điều gì.
    if (inv.packages < MIN_SAMPLE) continue;

    if (inv.topShare.value !== null && inv.topShare.value >= 50 && inv.topContractor) {
      signals.push({
        kind: 'topShare',
        investorName: inv.investorName,
        taxCode: inv.topContractor.taxCode,
        contractorName: inv.topContractor.name,
        n: inv.packages,
        text: `${inv.topContractor.name || inv.topContractor.taxCode} trúng ${inv.topContractor.packages}/${inv.packages} gói `
          + `(${inv.topShare.text}) của ${inv.investorName}.`
      });
    }

    if (inv.concentration.value !== null && inv.concentration.value > 2500 && inv.concentration.reliable) {
      signals.push({
        kind: 'concentration',
        investorName: inv.investorName,
        n: inv.packages,
        text: `Giá trị gói thầu của ${inv.investorName} tập trung vào ít nhà thầu `
          + `(HHI ${inv.concentration.value.toLocaleString('vi-VN')} — ${inv.concentration.level}), `
          + `${inv.contractorCount} nhà thầu trên ${inv.packages} gói.`
      });
    }
  }

  for (const p of pairs) {
    if (p.packages < MIN_SAMPLE) continue;
    const d = p.discount;
    if (d.median !== null && d.median < NEAR_CEILING_RATE && d.n >= MIN_SAMPLE) {
      signals.push({
        kind: 'nearCeiling',
        investorName: p.investorName,
        taxCode: p.taxCode,
        contractorName: p.contractorName,
        n: d.n,
        text: `${p.contractorName || p.taxCode} trúng ${p.packages} gói của ${p.investorName} với mức giảm giá `
          + `trung vị chỉ ${String(d.median).replace('.', ',')}% — sát giá gói thầu.`
      });
    }
  }

  return signals;
}

/** Tổng hợp toàn bộ một lượt soi địa bàn. */
export function summarizeArea(packages, criteria = {}) {
  const observations = observationsFromPackages(packages);
  const contractors = contractorsInArea(observations);
  const investors = investorsInArea(observations);
  const pairs = relationshipPairs(observations);

  const totalValue = observations.reduce((s, o) => s + (Number(o.winningPrice) || 0), 0);
  const years = [...new Set(observations.map((o) => o.year).filter(Boolean))].sort();

  return {
    criteria,
    packageCount: (packages || []).length,
    observationCount: observations.length,
    contractorCount: contractors.length,
    investorCount: investors.length,
    totalValue,
    years,
    discount: describe(observations.map((o) => o.discountRate)),
    // Mức tập trung của CẢ ĐỊA BÀN: giá trị dồn vào bao nhiêu nhà thầu.
    concentration: hhi(contractors.map((c) => c.soloValue + c.ventureValue)),
    contractors,
    investors,
    pairs,
    signals: areaSignals({ investors, pairs }),
    // Đủ dữ liệu để so sánh giữa các nhóm chưa?
    comparable: observations.length >= MIN_SAMPLE_COMPARE
  };
}

export const AREA_DISCLAIMER =
  'Các con số ở đây chỉ mô tả dữ liệu e-GP đã công bố. Ở địa bàn nhỏ, việc một nhà thầu '
  + 'trúng nhiều gói của cùng một chủ đầu tư là bình thường: số doanh nghiệp đủ năng lực '
  + 'vốn đã ít, và nhà thầu tại chỗ có lợi thế chi phí thật. Đây KHÔNG phải bằng chứng '
  + 'thông thầu hay vi phạm — hãy dùng như gợi ý để tìm hiểu thêm, không phải để kết luận.';

export const AREA_SCOPE_NOTE =
  'Phạm vi tra cứu dựa trên TÊN CHỦ ĐẦU TƯ chứa tên địa danh (ví dụ "UBND xã Hàm Đức", '
  + '"Ban QLDA huyện Đơn Dương"), vì bản ghi kết quả lựa chọn nhà thầu của e-GP không có '
  + 'trường địa bàn. Do đó danh sách có thể thiếu gói do đơn vị cấp trên làm chủ đầu tư, '
  + 'và có thể thừa đơn vị trùng tên ở tỉnh khác — hãy đối chiếu cột Chủ đầu tư.';

export { round2 };
