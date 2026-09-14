/** Statistics of recorded bids in the selected, locally stored market only. */
function fold(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}
const text = (value) => String(value ?? '').trim();
const split = (value) => text(value).split(/[;,\n]/).map((x) => x.trim()).filter(Boolean);

export function sameMarket(tender, scope = {}) {
  if (!tender) return false;
  if (scope.province && !split(scope.province).some((p) => fold(tender.location || tender.province).includes(fold(p)))) return false;
  if (scope.investor && !fold([tender.investorName, tender.procuringEntityName].filter(Boolean).join(' ')).includes(fold(scope.investor))) return false;
  if (scope.field && fold(tender.fieldRaw || tender.field) !== fold(scope.field)
    && !fold(tender.bidName).includes(fold(scope.field))) return false;
  return true;
}

function packageKey(row = {}) {
  const raw = text(row.notifyNo || row.key);
  const code = raw.match(/IB\d+(?:-\d{2})?/i)?.[0] || raw.split('::')[0];
  return code.replace(/-\d{2}$/, '').toUpperCase();
}
const hasWon = (row) => row.won === true || row.isWinner === true || ['winner', 'trung thau'].includes(fold(row.role));
const priceOf = (row) => {
  for (const value of [row.bidValue, row.bidPrice, row.price, row.offerPrice]) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
};

function scopedBids(participations, tenders, scope) {
  const keys = new Set((tenders || []).filter((row) => sameMarket(row, scope)).map(packageKey).filter(Boolean));
  if (!keys.size) return [];
  const bids = new Map();
  for (const row of participations || []) {
    if (!row || typeof row !== 'object') continue;
    const pack = packageKey(row);
    if (!pack || !keys.has(pack)) continue;
    const tax = text(row.taxCode || row.contractorCode).replace(/^vn/i, '');
    const name = text(row.contractorName || row.winnerName || row.name);
    const id = tax || fold(name);
    if (!id) continue;
    const key = `${id}::${pack}`;
    const previous = bids.get(key);
    const at = Date.parse(row.lastSeenAt || row.capturedAt || row.updatedAt) || 0;
    const record = { id, tax, name, pack, at, price: priceOf(row), won: hasWon(row) };
    if (!previous) bids.set(key, record);
    else if (at >= previous.at) bids.set(key, { ...record, price: record.price ?? previous.price, won: record.won || previous.won });
    else if (record.won) previous.won = true;
  }
  return [...bids.values()];
}

function percentile(sorted, q) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

export function localRivals(participations = [], tenders = [], scope = {}) {
  const groups = new Map();
  for (const bid of scopedBids(participations, tenders, scope)) {
    const row = groups.get(bid.id) || { taxCode: bid.tax, name: bid.name, bids: 0, wins: 0, prices: [] };
    row.bids += 1;
    row.wins += Number(bid.won);
    if (bid.price !== null) row.prices.push(bid.price);
    if (bid.name.length > row.name.length) row.name = bid.name;
    groups.set(bid.id, row);
  }
  return [...groups.values()].map(({ prices, ...row }) => ({
    ...row,
    winRate: row.bids ? Math.round(row.wins / row.bids * 1000) / 10 : 0,
    medianBid: percentile(prices.sort((a, b) => a - b), 0.5),
    priceSamples: prices.length
  })).sort((a, b) => b.bids - a.bids || b.wins - a.wins).slice(0, 40);
}

export function marketBidPercentiles(participations = [], tenders = [], scope = {}) {
  const prices = scopedBids(participations, tenders, scope).map((row) => row.price).filter((n) => n !== null).sort((a, b) => a - b);
  return { n: prices.length, p25: percentile(prices, 0.25), p50: percentile(prices, 0.5), p75: percentile(prices, 0.75) };
}
