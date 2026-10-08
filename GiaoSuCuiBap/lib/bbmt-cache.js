// Cache only complete tables tied to an exact notice version and opening.
export const BBMT_CACHE_TTL = 30 * 60 * 1000;
export function openingFingerprint(p) {
  if(p.listingFingerprint)return p.listingFingerprint;
  let opening = '';
  try { opening = new URL(p.detailUrl).searchParams.get('bidOpenId') || ''; } catch {}
  return JSON.stringify([p.key, opening, p.publicDateKqmt, p.bidPrice, p.priceBasis,
    p.numBidderJoin]);
}
export function restoreOpening(p, entry, now = Date.now()) {
  const age = now - Date.parse(entry?.scannedAt || '');
  if (!entry || entry.schemaVersion!==2 || !Number.isFinite(age) || age < 0 || age > BBMT_CACHE_TTL ||
      entry.fingerprint !== openingFingerprint(p) || !['OK', 'EMPTY'].includes(entry.readState) ||
      !Array.isArray(entry.bidders) || entry.bidders.length < Number(p.numBidderJoin || 0)) return p;
  return { ...p, bidders: entry.bidders, readState: entry.readState,
    bidPrice:entry.bidPrice??p.bidPrice,priceBasis:entry.priceBasis??p.priceBasis,
    priceBasisLabel:entry.priceBasisLabel||p.priceBasisLabel,priceBasisSource:entry.priceBasisSource||p.priceBasisSource,
    listingFingerprint:entry.fingerprint,openingMetadataVerified:entry.openingMetadataVerified===true,
    isMultiLot:entry.isMultiLot??null,openingKind:entry.openingKind||null,
    scannedAt: entry.scannedAt, fromCache: true };
}
export function cacheOpening(p) {
  if (!['OK', 'EMPTY'].includes(p.readState) || !Array.isArray(p.bidders)) return null;
  return { schemaVersion:2,fingerprint: openingFingerprint(p), bidders: p.bidders,
    bidPrice:p.bidPrice,priceBasis:p.priceBasis,priceBasisLabel:p.priceBasisLabel,priceBasisSource:p.priceBasisSource,
    openingMetadataVerified:p.openingMetadataVerified===true,isMultiLot:p.isMultiLot??null,openingKind:p.openingKind||null,
    readState: p.readState, scannedAt: p.scannedAt };
}
export function trimOpeningCache(cache, now = Date.now()) {
  return Object.fromEntries(Object.entries(cache).filter(([, e]) => {
    const age = now - Date.parse(e?.scannedAt || '');
    return Number.isFinite(age) && age >= 0 && age <= BBMT_CACHE_TTL;
  }).sort((a, b) => Date.parse(b[1].scannedAt) - Date.parse(a[1].scannedAt)).slice(0, 1000));
}
