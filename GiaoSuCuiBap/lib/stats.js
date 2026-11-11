/* ============================================================================
 *  lib/stats.js — CÁC PHÉP THỐNG KÊ DÙNG CHUNG
 *
 *  Tách riêng vì mọi con số phân tích đều dựa vào đây. Ba nguyên tắc:
 *
 *  1. KHÔNG BỊA SỐ. Thiếu dữ liệu thì trả `null`, không trả 0. Con số 0 trông
 *     giống một kết quả thật và người đọc sẽ tin nhầm.
 *
 *  2. LUÔN KÈM CỠ MẪU. Tỷ lệ thắng 100% từ 1 gói khác hẳn 100% từ 50 gói.
 *     Mọi hàm đều trả `n` để giao diện hiện kèm.
 *
 *  3. CHẶN KẾT LUẬN TỪ MẪU QUÁ NHỎ. Dưới ngưỡng thì đánh dấu `reliable:false`
 *     để giao diện ẩn hoặc ghi rõ "chưa đủ dữ liệu".
 * ========================================================================== */

/** Cỡ mẫu tối thiểu để một chỉ số được coi là đáng tin. */
export const MIN_SAMPLE = 5;

/** Cỡ mẫu tối thiểu để so sánh giữa các nhóm (chặt hơn). */
export const MIN_SAMPLE_COMPARE = 10;

/**
 * Ép về số, hoặc null nếu không phải số.
 *
 * Phải loại null/undefined/chuỗi rỗng TRƯỚC khi gọi Number(), vì
 * `Number(null) === 0` và `Number('') === 0`. Nếu bỏ qua bước này thì mọi giá
 * trị THIẾU sẽ bị tính thành 0 — trung vị mức giảm giá bị kéo tụt xuống, và
 * gói không có giá bị xếp vào khoảng "dưới 1 tỷ". Đây đúng là kiểu bịa số mà
 * tệp này tồn tại để ngăn.
 */
const num = (v) => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Lọc lấy các số hợp lệ, bỏ null/undefined/NaN. */
export function numbers(list) {
  return (list || []).map(num).filter((n) => n !== null);
}

export function round2(v) {
  return v === null || v === undefined || !Number.isFinite(v)
    ? null
    : Math.round((v + Number.EPSILON) * 100) / 100;
}

export function mean(list) {
  const a = numbers(list);
  return a.length ? round2(a.reduce((s, x) => s + x, 0) / a.length) : null;
}

/**
 * Phân vị theo phép nội suy tuyến tính (kiểu R type-7, cũng là kiểu Excel dùng).
 * q trong khoảng 0..1.
 */
export function quantile(list, q) {
  const a = numbers(list).sort((x, y) => x - y);
  if (!a.length) return null;
  if (a.length === 1) return round2(a[0]);
  const pos = (a.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return round2(a[lo]);
  return round2(a[lo] + (a[hi] - a[lo]) * (pos - lo));
}

export function median(list) {
  return quantile(list, 0.5);
}

/** Độ lệch chuẩn mẫu (chia n−1). Cần ít nhất 2 giá trị. */
export function stdev(list) {
  const a = numbers(list);
  if (a.length < 2) return null;
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  const v = a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
  return round2(Math.sqrt(v));
}

export function minOf(list) {
  const a = numbers(list);
  return a.length ? round2(Math.min(...a)) : null;
}
export function maxOf(list) {
  const a = numbers(list);
  return a.length ? round2(Math.max(...a)) : null;
}
export function sum(list) {
  const a = numbers(list);
  return a.reduce((s, x) => s + x, 0);
}

/**
 * Bộ mô tả đầy đủ một dãy số, kèm cỡ mẫu và cờ tin cậy.
 * Đây là thứ giao diện nên dùng thay vì gọi lẻ từng hàm.
 */
export function describe(list, minSample = MIN_SAMPLE) {
  const a = numbers(list);
  return {
    n: a.length,
    reliable: a.length >= minSample,
    min: minOf(a),
    q1: quantile(a, 0.25),
    median: median(a),
    q3: quantile(a, 0.75),
    max: maxOf(a),
    mean: mean(a),
    stdev: stdev(a)
  };
}

/**
 * Tỷ lệ phần trăm kèm cỡ mẫu. Mẫu số bằng 0 thì trả null chứ không trả 0%.
 */
export function rate(part, total, minSample = MIN_SAMPLE) {
  const p = num(part);
  const t = num(total);
  if (p === null || t === null || t <= 0) {
    return { value: null, n: t || 0, reliable: false, text: '—' };
  }
  const v = round2((p / t) * 100);
  return {
    value: v,
    n: t,
    reliable: t >= minSample,
    text: `${v.toFixed(1).replace('.', ',')}%`
  };
}

/**
 * Chỉ số tập trung Herfindahl–Hirschman.
 *
 * Tổng bình phương thị phần (theo thang 0–10.000). Cách đo mức độ tập trung
 * được cơ quan cạnh tranh nhiều nước dùng. Ở đây áp cho câu hỏi:
 * "giá trị gói thầu của một chủ đầu tư rơi vào tay bao nhiêu nhà thầu?"
 *
 *   < 1.500   phân tán
 *   1.500–2.500 tập trung vừa
 *   > 2.500   tập trung cao
 *
 * ĐÂY LÀ TÍN HIỆU THỐNG KÊ, KHÔNG PHẢI BẰNG CHỨNG VI PHẠM.
 */
export function hhi(values) {
  const a = numbers(values).filter((v) => v > 0);
  const total = a.reduce((s, x) => s + x, 0);
  if (!a.length || total <= 0) return { value: null, n: a.length, level: null, reliable: false };
  const index = a.reduce((s, x) => s + ((x / total) * 100) ** 2, 0);
  const value = Math.round(index);
  return {
    value,
    n: a.length,
    reliable: a.length >= 3,
    level: value > 2500 ? 'Tập trung cao' : value >= 1500 ? 'Tập trung vừa' : 'Phân tán'
  };
}

/** Đếm theo khoá, trả về danh sách đã xếp giảm dần. */
export function countBy(items, keyFn) {
  const m = new Map();
  for (const it of items || []) {
    const k = keyFn(it);
    if (k === null || k === undefined || k === '') continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

/** Cộng dồn theo khoá. */
export function sumBy(items, keyFn, valFn) {
  const m = new Map();
  for (const it of items || []) {
    const k = keyFn(it);
    if (k === null || k === undefined || k === '') continue;
    m.set(k, (m.get(k) || 0) + (num(valFn(it)) || 0));
  }
  return [...m.entries()]
    .map(([key, total]) => ({ key, total }))
    .sort((a, b) => b.total - a.total);
}

/* --------------------------------------------------------------------------
 *  KHOẢNG GIÁ — dùng để so sánh các gói cùng tầm với nhau
 *
 *  Mức giảm giá của gói 500 triệu và gói 500 tỷ không so trực tiếp được, nên
 *  mọi thống kê về giảm giá đều phải chia theo khoảng.
 * ------------------------------------------------------------------------ */
export const PRICE_BANDS = [
  { key: 'lt1', label: 'Dưới 1 tỷ', min: 0, max: 1e9 },
  { key: '1-5', label: '1 – 5 tỷ', min: 1e9, max: 5e9 },
  { key: '5-20', label: '5 – 20 tỷ', min: 5e9, max: 2e10 },
  { key: '20-100', label: '20 – 100 tỷ', min: 2e10, max: 1e11 },
  { key: 'gt100', label: 'Trên 100 tỷ', min: 1e11, max: Infinity }
];

export function priceBand(value) {
  const v = num(value);
  if (v === null) return null;
  return PRICE_BANDS.find((b) => v >= b.min && v < b.max) || null;
}
