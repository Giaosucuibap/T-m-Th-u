/** Đối thủ trên đúng thị trường đã lưu — không suy ra toàn quốc. */

function fold(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

function text(value) {
  return String(value ?? '').trim();
}

export function sameMarket(tender, scope = {}) {
  if (!tender) return false;
  if (scope.province) {
    const loc = fold(tender.location || '');
    if (!split(scope.province).some((p) => loc.includes(fold(p)))) return false;
  }
  if (scope.investor) {
    const inv = fold([tender.investorName, tender.procuringEntityName].filter(Boolean).join(' '));
    if (!inv.includes(fold(scope.investor))) return false;
  }
  if (scope.field) {
    if (fold(tender.fieldRaw || tender.field || '') !== fold(scope.field)
      && !fold(tender.bidName || '').includes(fold(scope.field))) return false;
  }
  return true;
}

function split(value) {
  return String(value || '').split(/[;,]|\n/).map((x) => x.trim()).filter(Boolean);
}

/**
 * @param {object[]} participations bản ghi nhà thầu đã trích từ e-GP
 * @param {object[]} tenders kho gói local
 * @param {object} scope province / investor / field
 */
export function localRivals(participations = [], tenders = [], scope = {}) {
  const marketKeys = new Set((tenders || []).filter((t) => sameMarket(t, scope)).map((t) => t.key || t.notifyNo));
  const useKeys = marketKeys.size > 0;
  const map = new Map();
  for (const row of participations || []) {
    const key = row.notifyNo ? `${row.notifyNo}::${row.version || '00'}` : row.key;
    if (useKeys && key && !marketKeys.has(key) && !marketKeys.has(row.notifyNo)) continue;
    const tax = text(row.taxCode || row.winningCode || row.contractorCode);
    const name = text(row.contractorName || row.winnerName || row.name);
    if (!tax && !name) continue;
    const id = tax || fold(name);
    const cur = map.get(id) || { taxCode: tax, name, bids: 0, wins: 0, keys: new Set(), prices: [] };
    cur.name = name.length > cur.name.length ? name : cur.name;
    cur.taxCode = cur.taxCode || tax;
    const pack = key || `${name}:${row.bidName || ''}`;
    const price = Number(row.bidPrice || row.price || row.offerPrice);
    if (Number.isFinite(price) && price > 0) cur.prices.push(price);
    if (!cur.keys.has(pack)) {
      cur.keys.add(pack);
      cur.bids += 1;
      if (row.won || row.isWinner || row.role === 'winner') cur.wins += 1;
    }
    map.set(id, cur);
  }
  return [...map.values()]
    .map((row) => {
      const sorted = [...row.prices].sort((a, b) => a - b);
      const mid = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
      return {
        taxCode: row.taxCode,
        name: row.name,
        bids: row.bids,
        wins: row.wins,
        winRate: row.bids ? Math.round((row.wins / row.bids) * 1000) / 10 : 0,
        medianBid: mid,
        priceSamples: sorted.length
      };
    })
    .sort((a, b) => b.bids - a.bids || b.wins - a.wins)
    .slice(0, 40);
}

function percentile(sorted, q) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}

/** Phân vị giá bỏ cùng CĐT + cùng loại việc trên kho đã lưu. */
export function marketBidPercentiles(participations = [], tenders = [], scope = {}) {
  const marketKeys = new Set((tenders || []).filter((t) => sameMarket(t, scope)).map((t) => t.key || t.notifyNo));
  const prices = [];
  for (const row of participations || []) {
    const key = row.notifyNo ? `${row.notifyNo}::${row.version || '00'}` : row.key;
    if (marketKeys.size && key && !marketKeys.has(key) && !marketKeys.has(row.notifyNo)) continue;
    const price = Number(row.bidPrice || row.price || row.offerPrice);
    if (Number.isFinite(price) && price > 0) prices.push(price);
  }
  const sorted = prices.sort((a, b) => a - b);
  return {
    n: sorted.length,
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75)
  };
}
