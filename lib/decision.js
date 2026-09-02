/* ============================================================================
 *  lib/decision.js — BIẾN DANH SÁCH TÌM THẤY THÀNH BẢNG RA QUYẾT ĐỊNH
 *
 *  Xếp hạng ưu tiên xử lý, gợi ý hành động tiếp theo, và chỉ ra gói nào thiếu
 *  dữ liệu cần kiểm tra lại trên e-GP.
 *
 *  VÌ SAO NẰM Ở lib/ CHỨ KHÔNG PHẢI TRONG search.js
 *  ------------------------------------------------
 *  Đây là logic NGHIỆP VỤ: nó quyết định gói nào hiện lên đầu, gói nào bị đẩy
 *  xuống. Sai ở đây thì người dùng bỏ lỡ gói đáng làm mà không hề biết — không
 *  có thông báo lỗi nào cả. Loại logic đó phải kiểm thử được, mà hàm nằm trong
 *  tệp của trang thì không nạp ra để kiểm thử được.
 *
 *  Toàn bộ hàm ở đây là hàm thuần: vào dữ liệu, ra kết quả, không đụng DOM.
 * ========================================================================== */

import { daysToClose, bidStatus } from './core.js';

/** Trạng thái gói, ưu tiên trường có sẵn rồi mới suy ra từ ngày đóng thầu. */
export function statusOf(t) {
  return (t && t.status) || bidStatus(t);
}

/**
 * Điểm ưu tiên xử lý.
 *
 * Điểm trạng thái áp đảo mọi thành phần khác, vì một gói ĐANG MỞ dù chấm thấp
 * vẫn đáng nhìn trước một gói còn nằm trong kế hoạch chấm cao — gói kế hoạch
 * chưa nộp được, xếp nó lên đầu là mời người ta phí thời gian.
 *
 * Thang điểm bảo đảm điều đó luôn đúng, không phải "thường đúng":
 *
 *     PLAN cao nhất  = 240 + 100 (điểm) +  0 (không gấp) + 35 (đạt ngưỡng) = 375
 *     OPEN thấp nhất = 400 +   0         +  0            +  0              = 400
 *
 * 400 > 375 nên KHÔNG có gói kế hoạch nào vượt được gói đang mở. Mấu chốt là
 * điểm gấp gáp (tối đa 45) CHỈ cộng cho gói đang mở; nếu ai đó bỏ điều kiện
 * `st === 'OPEN'` đi thì bất biến này gãy. Có kiểm thử khoá lại.
 */
export function decisionRank(t) {
  const st = statusOf(t);
  const d = daysToClose(t.closeDate);
  const statusPoints = { OPEN: 400, PLAN: 240, UNKNOWN: 180, CLOSED: 0 }[st] ?? 100;
  // Càng sát hạn càng gấp, nhưng chỉ với gói còn nộp được.
  const urgency = st === 'OPEN' && d !== null ? Math.max(0, 45 - Math.min(d, 45)) : 0;
  return statusPoints + Number(t.score || 0) + urgency + (t.matched ? 35 : 0);
}

/**
 * Thứ tự khi người dùng chọn sắp theo hạn nộp. Số nhỏ đứng trước.
 *
 * Gói đã đóng xếp cuối và trong nhóm đó thì mới đóng đứng trước — người ta tra
 * gói vừa đóng để soi giá và đối thủ, chứ ít khi cần gói đóng từ hai năm trước.
 */
export function deadlineRank(t) {
  const st = statusOf(t);
  const d = daysToClose(t.closeDate);
  if (st === 'OPEN') return d === null ? 9999 : d;
  if (st === 'UNKNOWN') return 10000;
  if (st === 'PLAN') return 20000;
  return 30000 + Math.abs(Number(d) || 0);
}

/** So sánh hai gói theo kiểu sắp xếp người dùng chọn. */
export function compareTenders(a, b, sortBy) {
  const byScore = Number(b.score || 0) - Number(a.score || 0);
  if (sortBy === 'score') return byScore || decisionRank(b) - decisionRank(a);
  if (sortBy === 'deadline') return deadlineRank(a) - deadlineRank(b) || byScore;
  if (sortBy === 'price') return (Number(b.price) || 0) - (Number(a.price) || 0) || byScore;
  return decisionRank(b) - decisionRank(a);
}

/**
 * Gói thiếu trường nào cần kiểm tra lại trên e-GP.
 *
 * Gói ở kế hoạch (PLAN) chưa có hạn nộp là chuyện bình thường, không phải
 * thiếu dữ liệu — báo "thiếu hạn nộp" cho mọi gói KHLCNT là báo động giả.
 */
export function missingFields(t) {
  const miss = [];
  if (!t.price) miss.push('Thiếu giá');
  if (!t.closeDate && statusOf(t) !== 'PLAN') miss.push('Thiếu hạn nộp');
  if (!t.location) miss.push('Thiếu địa điểm');
  if (!t.investorName) miss.push('Thiếu chủ đầu tư');
  return miss;
}

/**
 * Biểu tượng đi kèm dòng hạn nộp.
 *
 * Trước đây mọi gói đều mang đồng hồ cát, kể cả gói ĐÃ ĐÓNG THẦU — đọc thành
 * "⏳ Đã đóng 18/8" nghĩa là đang chờ một việc đã xong. Biểu tượng phải nói
 * đúng trạng thái, không thì nó là nhiễu.
 */
export function deadlineIcon(t) {
  const st = statusOf(t);
  if (st === 'CLOSED') return '🔒';
  if (st === 'PLAN') return '📋';
  if (st === 'UNKNOWN') return '❓';
  return '⏳';
}

/**
 * Hành động tiếp theo nên làm với gói này.
 *
 * Trả về nhãn ngắn để hiện trên thẻ, kèm một câu giải thích vì sao — người
 * dùng không tin một chữ "Xử lý ngay" trống không.
 */
export function actionFor(t) {
  const st = statusOf(t);
  const score = Number(t.score || 0);
  const d = daysToClose(t.closeDate);
  const soon = d !== null && d <= 3;

  if (st === 'CLOSED') {
    return { label: 'Lưu tham khảo', className: 'stop',
      note: 'Hết cơ hội nộp; dùng để soi giá, chủ đầu tư hoặc đối thủ.' };
  }
  if (st === 'PLAN') {
    return { label: score >= 55 ? 'Theo dõi KHLCNT' : 'Chờ thêm tín hiệu', className: 'watch',
      note: 'Gói mới ở kế hoạch, cần bám để biết khi nào ra TBMT.' };
  }
  if (st === 'UNKNOWN') {
    return { label: 'Kiểm tra hạn nộp', className: 'watch',
      note: 'Dữ liệu công khai chưa đủ hạn đóng thầu; mở e-GP để xác minh.' };
  }
  if (score >= 85) {
    return { label: soon ? 'Xử lý ngay' : 'Nghiên cứu ngay', className: 'go',
      note: soon ? 'Điểm cao và thời gian còn ít, nên tải HSMT trước.'
                 : 'Điểm cao, còn thời gian để phân công đọc HSMT.' };
  }
  if (score >= 70) {
    return { label: 'Rất đáng xem', className: 'go',
      note: 'Nên đọc nhanh phạm vi công việc và điều kiện năng lực.' };
  }
  if (score >= 55) {
    return { label: 'Sàng lọc thêm', className: 'watch',
      note: 'Đạt ngưỡng tối thiểu nhưng cần kiểm tra kỹ lý do chấm điểm.' };
  }
  return { label: 'Tham khảo', className: '',
    note: 'Chưa vượt ngưỡng ưu tiên của cấu hình hiện tại.' };
}

/** Bỏ dấu tiếng Việt để lọc nhanh không phụ thuộc dấu. */
export function fold(x) {
  return String(x ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/** Gộp mọi trường đáng tìm của một gói thành một chuỗi đã bỏ dấu. */
export function searchableText(t) {
  return fold([
    t.bidName, t.projectName, t.displayCode, t.notifyNo, t.bidNo, t.planNo,
    t.location, t.investorName, t.procuringEntityName, t.fieldRaw,
    t.recommendation, ...(t.reasons || [])
  ].filter(Boolean).join(' '));
}

/**
 * Lọc rồi sắp xếp danh sách theo lựa chọn trên thanh công cụ.
 * Không sửa mảng gốc — trang còn dùng lại mảng đó cho các bộ lọc khác.
 */
export function filterAndSort(all, view) {
  const v = view || {};
  return (all || [])
    .filter((t) => !v.onlyMatched || t.matched)
    .filter((t) => !v.status || statusOf(t) === v.status)
    .filter((t) => Number(t.score || 0) >= Number(v.minScore || 0))
    .filter((t) => !v.text || searchableText(t).includes(v.text))
    .slice()
    .sort((a, b) => compareTenders(a, b, v.sortBy));
}

/**
 * Ba con số tóm tắt đặt ở đầu kết quả.
 *
 * `missing` CHỈ đếm gói còn cơ hội xử lý. Gói đã đóng thầu mà thiếu giá thì
 * kiểm tra lại cũng không để làm gì — đếm cả vào là thổi phồng con số và biến
 * cảnh báo thành tiếng ồn người dùng học cách bỏ qua.
 */
export function decisionSignals(all) {
  const list = all || [];
  const live = list.filter((t) => statusOf(t) !== 'CLOSED');
  const best = live.slice().sort((a, b) => decisionRank(b) - decisionRank(a))[0] || null;
  const urgent = list.filter((t) => {
    const d = daysToClose(t.closeDate);
    return statusOf(t) === 'OPEN' && Number(t.score || 0) >= 70 && d !== null && d <= 3;
  }).length;
  const missing = live.filter((t) => missingFields(t).length > 0).length;
  const plan = list.filter((t) => statusOf(t) === 'PLAN').length;
  return { best, urgent, missing, plan, live: live.length, total: list.length };
}
