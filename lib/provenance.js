/* ============================================================================
 *  lib/provenance.js — NGUỒN GỐC & ĐỘ TIN CẬY CỦA TỪNG BẢN GHI
 *
 *  Mọi bản ghi phải trả lời được hai câu:
 *    "Số này lấy ở đâu ra?"      -> sourceUrl
 *    "Tin được tới mức nào?"     -> confidence
 *
 *  Vì sao cần: phần mềm trộn nhiều nguồn có độ chắc chắn rất khác nhau —
 *  lọc chính xác theo mã số thuế thì chắc chắn, còn dò theo tên công ty thì
 *  chỉ là phỏng đoán. Nếu không phân biệt, một con số phỏng đoán sẽ nằm lẫn
 *  trong báo cáo như thể là sự thật.
 *
 *  QUY TẮC: chỉ bản ghi `exact` mới được vào SỐ LIỆU CHÍNH THỨC.
 *  Bản ghi `fuzzy` chỉ dùng làm gợi ý, phải hiện riêng và có nhãn.
 * ========================================================================== */

/** Mức độ tin cậy, từ chắc chắn nhất tới yếu nhất. */
export const CONFIDENCE = {
  /** Khớp bằng khoá định danh duy nhất (mã số thuế, mã TBMT). */
  EXACT: 'exact',
  /** e-GP tự lọc bằng biểu mẫu của nó — đúng theo định nghĩa của hệ thống. */
  SERVER: 'server',
  /** Suy ra từ dữ liệu khác, không có khoá định danh trực tiếp. */
  DERIVED: 'derived',
  /** Khớp gần đúng theo tên. CHỈ LÀ GỢI Ý. */
  FUZZY: 'fuzzy'
};

const RANK = { exact: 4, server: 3, derived: 2, fuzzy: 1 };

const LABEL = {
  exact: 'Khớp chính xác theo mã định danh',
  server: 'e-GP lọc sẵn theo tiêu chí',
  derived: 'Suy ra từ dữ liệu liên quan',
  fuzzy: 'Khớp gần đúng theo tên — chỉ là gợi ý'
};

export function confidenceLabel(c) {
  return LABEL[c] || 'Không rõ nguồn';
}

/** Bản ghi này có được phép vào số liệu chính thức không? */
export function isOfficial(confidence) {
  return confidence === CONFIDENCE.EXACT || confidence === CONFIDENCE.SERVER;
}

/** Khi gộp nhiều nguồn, giữ mức tin cậy THẤP nhất — không tự nâng cấp. */
export function weakest(...list) {
  const valid = list.filter((c) => RANK[c]);
  if (!valid.length) return CONFIDENCE.DERIVED;
  return valid.reduce((a, b) => (RANK[a] <= RANK[b] ? a : b));
}

/**
 * Gắn nguồn gốc vào một bản ghi đã chuẩn hoá.
 *
 * @param {object} record
 * @param {string} confidence  một giá trị của CONFIDENCE
 * @param {string} sourceUrl   link tới đúng trang công khai chứa số liệu này
 * @param {object} [extra]     ví dụ {matchedBy:'taxCode'}
 */
export function withProvenance(record, confidence, sourceUrl, extra = {}) {
  if (!record) return record;
  return {
    ...record,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    official: isOfficial(confidence),
    sourceUrl: String(sourceUrl || record.detailUrl || ''),
    capturedAt: record.capturedAt || new Date().toISOString(),
    ...extra
  };
}

/**
 * Tách một tập bản ghi thành phần dùng được cho số liệu và phần chỉ gợi ý.
 *
 * Trả `ambiguity: true` khi có bản ghi gợi ý — giao diện phải nói rõ thay vì
 * lặng lẽ trộn chung.
 */
export function splitByConfidence(records) {
  const list = records || [];
  const official = list.filter((r) => isOfficial(r && r.confidence));
  const suggested = list.filter((r) => r && !isOfficial(r.confidence));
  return {
    official,
    suggested,
    ambiguity: suggested.length > 0,
    ambiguityNote: suggested.length
      ? `${suggested.length} bản ghi chỉ khớp gần đúng theo tên nên không được tính vào số liệu chính thức.`
      : ''
  };
}

/**
 * Nhiều pháp nhân cùng khớp một cái tên → mơ hồ, phải để người dùng chọn.
 * KHÔNG được tự gộp thành một công ty.
 *
 * @param {Array<{taxCode:string,name:string}>} candidates
 */
export function resolveIdentity(candidates) {
  const list = (candidates || []).filter((c) => c && c.taxCode);
  const unique = [...new Map(list.map((c) => [c.taxCode, c])).values()];
  if (unique.length === 1) {
    return { resolved: unique[0], ambiguity: false, candidates: unique };
  }
  return {
    resolved: null,
    ambiguity: true,
    candidates: unique,
    ambiguityNote: unique.length
      ? `Có ${unique.length} pháp nhân cùng khớp tên này. Hãy chọn đúng mã số thuế trước khi xem số liệu.`
      : 'Không tìm thấy mã số thuế nào khớp tên này.'
  };
}

/* --------------------------------------------------------------------------
 *  CÔNG THỨC TỶ LỆ GIẢM GIÁ
 *
 *  Quy tắc: tỷ lệ giảm phải trả kèm CÔNG THỨC và NGUỒN GIÁ, để người đọc kiểm
 *  chứng được thay vì phải tin một con số trần trụi.
 * ------------------------------------------------------------------------ */

/** Nguồn của mốc trần dùng làm mẫu số. */
export const PRICE_BASIS_SOURCE = {
  ESTIMATE: 'Dự toán được duyệt sau KHLCNT',
  PACKAGE: 'Giá gói thầu',
  BID: 'Giá dự thầu của nhà thầu'
};

/**
 * Diễn giải một tỷ lệ giảm giá thành dạng kiểm chứng được.
 *
 * @param {number|null} basis    mốc trần (mẫu số)
 * @param {number|null} final    giá sau cùng (tử số so sánh)
 * @param {string} basisSource   một giá trị của PRICE_BASIS_SOURCE
 * @param {string} sourceUrl     trang công khai chứa hai con số trên
 */
export function explainDiscount(basis, final, basisSource, sourceUrl) {
  const b = Number(basis);
  const f = Number(final);
  if (!Number.isFinite(b) || !Number.isFinite(f) || b <= 0) {
    return {
      rate: null,
      formula: null,
      basisSource: basisSource || null,
      sourceUrl: sourceUrl || '',
      note: 'Thiếu mốc trần hoặc giá sau cùng nên không tính tỷ lệ giảm.'
    };
  }
  const rate = Math.round(((b - f) / b) * 10000) / 100;
  const fmt = (n) => Math.round(n).toLocaleString('vi-VN');
  return {
    rate,
    formula: `(${fmt(b)} − ${fmt(f)}) ÷ ${fmt(b)} × 100 = ${rate.toFixed(2).replace('.', ',')}%`,
    basisSource: basisSource || null,
    sourceUrl: sourceUrl || '',
    note: ''
  };
}
