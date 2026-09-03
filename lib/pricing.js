/* ============================================================================
 *  lib/pricing.js — PHÂN TÍCH GIÁ THỊ TRƯỜNG
 *
 *  Mục đích: từ giá trúng của các gói thầu TƯƠNG TỰ đã công bố, dựng ra mặt
 *  bằng tham khảo để người dùng có thêm cơ sở xây dựng phương án giá.
 *
 *  ---------------------------------------------------------------------------
 *  PHÂN TÍCH TRÊN TỶ LỆ GIẢM GIÁ, KHÔNG PHẢI TRÊN SỐ TIỀN
 *
 *  So số tiền tuyệt đối giữa các gói là vô nghĩa: gói 500 triệu và gói 50 tỷ
 *  không nằm cùng thang. Thứ SO ĐƯỢC là tỷ lệ giảm giá — giá trúng thấp hơn
 *  giá gói thầu (hoặc dự toán) bao nhiêu phần trăm.
 *
 *  Từ tỷ lệ đó, khi người dùng nhập giá gói thầu của mình, suy ra khoảng giá
 *  tham khảo:  giá × (1 − tỷ lệ/100).
 *
 *  ---------------------------------------------------------------------------
 *  BỐN ĐIỀU MODULE NÀY TỪ CHỐI LÀM
 *
 *  1. KHÔNG đưa ra "giá nên bỏ". Đây là dữ liệu tham khảo, không phải lời
 *     khuyên. Giá bỏ thầu phụ thuộc năng lực, biện pháp thi công, và giá thành
 *     thực của từng nhà thầu — những thứ e-GP không công bố và phần mềm không
 *     nhìn thấy.
 *
 *  2. KHÔNG kết luận từ mẫu nhỏ. Dưới MIN_SAMPLE gói thì chỉ hiện số liệu thô
 *     kèm cảnh báo, không dựng khoảng tham khảo.
 *
 *  3. KHÔNG trộn gói khác loại. Mặt bằng giá của xây lắp khác tư vấn, của đấu
 *     thầu rộng rãi khác chỉ định thầu (chỉ định thầu gần như không giảm giá).
 *     Vì vậy luôn tách theo lĩnh vực, hình thức và khoảng giá.
 *
 *  4. KHÔNG tính gói thiếu giá. Không có `priceBasis` hoặc `winningPrice` thì
 *     bỏ qua, không quy về 0 — quy về 0 sẽ kéo tụt toàn bộ mặt bằng.
 * ========================================================================== */

import { describe, numbers, round2, PRICE_BANDS, priceBand, MIN_SAMPLE, MIN_SAMPLE_COMPARE } from './stats.js';
import { cleanText } from './core.js';

/** Số gói tối thiểu để dựng khoảng giá tham khảo. */
export const MIN_SAMPLE_PRICE = MIN_SAMPLE;

/** Số gói tối thiểu để so sánh giữa các nhóm (theo lĩnh vực, hình thức...). */
export const MIN_SAMPLE_GROUP = MIN_SAMPLE_COMPARE;

/** Gói có đủ hai đầu giá để tính được tỷ lệ giảm? */
function usable(p) {
  return Number.isFinite(Number(p.priceBasis)) && Number(p.priceBasis) > 0
    && Number.isFinite(Number(p.winningPrice)) && Number(p.winningPrice) > 0
    && Number.isFinite(Number(p.discountRate));
}

/**
 * Lọc ra các gói TƯƠNG TỰ với gói người dùng đang quan tâm.
 *
 * @param {object[]} packages  danh sách KQLCNT đã chuẩn hoá
 * @param {object} target
 * @param {number} [target.price]      giá gói thầu của người dùng
 * @param {string} [target.field]      mã lĩnh vực: XL | HH | TV | PTV | HON_HOP
 * @param {string} [target.form]       mã hình thức: DTRR | CHCT | CDT ...
 * @param {boolean} [target.sameBand]  chỉ lấy gói cùng khoảng giá với `price`
 */
export function similarPackages(packages, target = {}) {
  const band = target.price ? priceBand(target.price) : null;
  return (packages || []).filter((p) => {
    if (!usable(p)) return false;
    if (target.field && cleanText(p.field) !== target.field) return false;
    if (target.form && cleanText(p.bidForm) !== target.form) return false;
    if (target.sameBand && band) {
      const b = priceBand(p.priceBasis);
      if (!b || b.key !== band.key) return false;
    }
    return true;
  });
}

/**
 * Mặt bằng tỷ lệ giảm giá của một nhóm gói, kèm khoảng giá tham khảo nếu
 * người dùng cho biết giá gói thầu của mình.
 *
 * Khoảng tham khảo lấy từ TỨ PHÂN VỊ, không phải min–max: min–max bị một gói
 * cá biệt kéo lệch, còn q1–q3 mô tả nửa giữa của thị trường.
 */
export function priceReference(packages, target = {}) {
  const list = similarPackages(packages, target);
  const rates = list.map((p) => p.discountRate);
  const stat = describe(rates, MIN_SAMPLE_PRICE);

  const price = Number(target.price) || 0;
  const at = (rate) => (rate === null || !price ? null : Math.round(price * (1 - rate / 100)));

  return {
    n: stat.n,
    reliable: stat.reliable,
    discount: stat,
    // Giá trúng thực tế của nhóm, để đối chiếu quy mô.
    winningPrices: describe(list.map((p) => p.winningPrice), MIN_SAMPLE_PRICE),
    basisPrices: describe(list.map((p) => p.priceBasis), MIN_SAMPLE_PRICE),
    // Khoảng tham khảo — chỉ dựng khi đủ mẫu VÀ người dùng đã nhập giá.
    reference: stat.reliable && price ? {
      price,
      // q3 = giảm nhiều hơn -> giá thấp hơn. Đặt `low` theo q3 cho đúng nghĩa.
      low: at(stat.q3),
      mid: at(stat.median),
      high: at(stat.q1),
      lowRate: stat.q3,
      midRate: stat.median,
      highRate: stat.q1,
      formula: `giá tham khảo = ${price.toLocaleString('vi-VN')} × (1 − tỷ lệ giảm / 100)`
    } : null,
    packages: list
  };
}

/** Mặt bằng giảm giá theo KHOẢNG GIÁ — gói to và gói nhỏ giảm khác nhau. */
export function discountByBand(packages) {
  const usableList = (packages || []).filter(usable);
  return PRICE_BANDS.map((b) => {
    const inBand = usableList.filter((p) => {
      const x = priceBand(p.priceBasis);
      return x && x.key === b.key;
    });
    return {
      key: b.key,
      label: b.label,
      n: inBand.length,
      discount: describe(inBand.map((p) => p.discountRate), MIN_SAMPLE_PRICE),
      totalValue: numbers(inBand.map((p) => p.winningPrice)).reduce((s, x) => s + x, 0)
    };
  }).filter((x) => x.n > 0);
}

/** Gộp theo một thuộc tính rồi mô tả mức giảm giá của từng nhóm. */
function groupStat(packages, keyFn, labelFn) {
  const map = new Map();
  for (const p of (packages || []).filter(usable)) {
    const k = keyFn(p);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  }
  return [...map.entries()]
    .map(([key, list]) => ({
      key,
      label: labelFn(list[0]) || key,
      n: list.length,
      discount: describe(list.map((p) => p.discountRate), MIN_SAMPLE_PRICE),
      totalValue: numbers(list.map((p) => p.winningPrice)).reduce((s, x) => s + x, 0)
    }))
    .sort((a, b) => b.n - a.n);
}

/** Mặt bằng giảm giá theo LĨNH VỰC. */
export function discountByField(packages) {
  return groupStat(packages, (p) => cleanText(p.field), (p) => p.fieldLabel);
}

/**
 * Mặt bằng giảm giá theo HÌNH THỨC lựa chọn nhà thầu.
 *
 * Nhóm này thường chênh nhau rất rõ: chỉ định thầu gần như không giảm giá,
 * còn đấu thầu rộng rãi qua mạng thì giảm sâu hơn. Trộn chung sẽ ra một con số
 * trung bình không dùng được cho việc gì.
 */
export function discountByForm(packages) {
  return groupStat(packages, (p) => cleanText(p.bidForm), (p) => p.bidFormLabel);
}

/** Mặt bằng giảm giá theo NĂM — xem xu hướng đang siết lại hay nới ra. */
export function discountByYear(packages) {
  const rows = groupStat(
    packages,
    (p) => (p.decisionDate ? String(p.decisionDate).slice(0, 4) : ''),
    (p) => (p.decisionDate ? String(p.decisionDate).slice(0, 4) : '')
  );
  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

/** Tổng hợp toàn bộ phần phân tích giá. */
export function summarizePricing(packages, target = {}) {
  const usableList = (packages || []).filter(usable);
  return {
    usableCount: usableList.length,
    skippedCount: (packages || []).length - usableList.length,
    overall: describe(usableList.map((p) => p.discountRate), MIN_SAMPLE_PRICE),
    byBand: discountByBand(packages),
    byField: discountByField(packages),
    byForm: discountByForm(packages),
    byYear: discountByYear(packages),
    reference: priceReference(packages, target),
    target
  };
}

export const PRICING_DISCLAIMER =
  'Đây là MẶT BẰNG THAM KHẢO dựng từ giá trúng đã công bố trên e-GP, không phải lời khuyên '
  + 'về giá bỏ thầu. Giá bỏ thầu phụ thuộc năng lực, biện pháp thi công và giá thành thực của '
  + 'từng nhà thầu — những thứ e-GP không công bố. Bỏ theo mức trung vị KHÔNG bảo đảm trúng '
  + 'thầu, và bỏ thấp hơn mặt bằng có thể khiến hồ sơ bị đánh giá là giá bất thường.';

export const PRICING_METHOD_NOTE =
  'Cách tính: mỗi gói lấy tỷ lệ giảm = (giá gói thầu hoặc dự toán − giá trúng) / (giá gói thầu '
  + 'hoặc dự toán) × 100. Gói thiếu một trong hai đầu giá bị loại, không quy về 0. Khoảng tham '
  + 'khảo lấy theo tứ phân vị q1–q3 (nửa giữa của thị trường) thay vì min–max, để một gói cá '
  + 'biệt không kéo lệch kết quả.';

export { round2 };
