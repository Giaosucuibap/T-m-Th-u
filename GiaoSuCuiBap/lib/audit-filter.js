export function filterAuditLog(rows = [], query = {}) {
  const who = String(query.operator || '').trim().toLowerCase();
  const key = String(query.key || query.notifyNo || '').trim().toLowerCase();
  const from = query.from ? Date.parse(query.from) : NaN;
  const to = query.to ? Date.parse(query.to) : NaN;
  return (rows || []).filter((row) => {
    if (who && !String(row.operator || '').toLowerCase().includes(who)) return false;
    if (key && !`${row.key || ''} ${row.detail || ''}`.toLowerCase().includes(key)) return false;
    const at = Date.parse(row.at || '');
    if (Number.isFinite(from) && !(at >= from)) return false;
    if (Number.isFinite(to) && !(at <= to + 86400000 - 1)) return false;
    return true;
  });
}

export function guaranteeReminder(tender = {}, now = Date.now()) {
  const close = Date.parse(tender.closeDate || '');
  const pub = Date.parse(tender.publicDate || tender.guaranteeIssuedAt || '');
  const exp = Date.parse(tender.guaranteeExpire || tender.bidGuaranteeExpire || '');
  const out = [];
  if (Number.isFinite(pub)) {
    const due = pub + 20 * 86400000;
    if (now >= pub && now <= due + 3 * 86400000) {
      out.push({ kind: 'issue', text: 'Kiểm tra đã phát hành bảo đảm dự thầu (mốc ~20 ngày sau đăng tải).' });
    }
  }
  if (Number.isFinite(exp) && exp - now <= 3 * 86400000 && exp >= now) {
    out.push({ kind: 'expire', text: 'Bảo đảm dự thầu sắp hết hạn — xem gia hạn.' });
  }
  if (Number.isFinite(close) && close - now <= 3 * 86400000 && close >= now && !Number.isFinite(exp)) {
    out.push({ kind: 'close', text: 'Sát đóng thầu: xác nhận bảo đảm dự thầu còn hiệu lực.' });
  }
  return out;
}
