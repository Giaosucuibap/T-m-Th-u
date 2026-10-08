// Keep receipt times distinct from failed attempts, including saved 4.3.1 data.
export function openingTimeNotes(pkg, state = pkg?.readState) {
  if (!pkg) return [];
  const hasRows = Array.isArray(pkg.bidders) && pkg.bidders.length > 0;
  const confirmedEmpty = Array.isArray(pkg.bidders) && state === 'EMPTY';
  const notes = [];
  if ((hasRows || confirmedEmpty) && pkg.scannedAt) {
    const stale = pkg.staleTable || state === 'TIMEOUT';
    notes.push({ label: stale ? 'Bảng của lần đọc trước'
      : pkg.fromCache ? 'Bản lưu gần đây'
      : confirmedEmpty ? 'Đã nhận bảng rỗng' : 'Đã đọc', at: pkg.scannedAt });
  }
  // Before 4.3.2, scannedAt was also written for a TIMEOUT without any table.
  const attemptedAt = pkg.attemptedAt || (!hasRows && !confirmedEmpty ? pkg.scannedAt : null);
  if (attemptedAt && (!notes.length || pkg.staleTable || state === 'TIMEOUT')) {
    notes.push({ label: 'Lần thử gần nhất', at: attemptedAt });
  }
  return notes;
}
