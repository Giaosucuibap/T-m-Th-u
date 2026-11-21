/** Fixed, independent schema examples. This is an offline regression check,
 * not evidence that the live e-GP schema or connection is currently healthy. */
export const CANARY_RECORDS = Object.freeze([
  { notifyNo: 'IB2600486024', notifyVersion: 'null', bidName: 'Nạo vét kênh thủy lợi Lâm Đồng', provinceCode: '68', bidCloseDate: '2026-09-05 17:00:00', bidPrice: 12000000000, investField: 'XL' },
  { notifyNo: 'IB2600000001', bidName: 'Đường giao thông nông thôn Đồng Nai', provinceCode: '75', bidCloseDate: '05/10/2026 10:00', bidPrice: 8000000000, investField: 'XL' },
  { planNo: 'PL2300148182', planVersion: 'null', name: 'KHLCNT thủy lợi', decisionDate: '01/06/2026 05:00:00', provinceCode: '703', procuringEntityName: 'Ban QLDA', bidName: ['Sửa chữa kênh'], bidPrice: [450000000] },
  { notifyNo: 'IB2600000999', bidName: 'Tư vấn giám sát', provinceCode: '56', bidCloseDate: '2026-09-05 22:30:00', investField: 'TV' }
].map(Object.freeze));

const EXPECTED = Object.freeze([
  { type:'tbmt', id:'IB2600486024', name:'Nạo vét kênh thủy lợi Lâm Đồng', date:'2026-09-05T10:00:00.000Z', area:'68', price:12000000000 },
  { type:'tbmt', id:'IB2600000001', name:'Đường giao thông nông thôn Đồng Nai', date:'2026-10-05T03:00:00.000Z', area:'75', price:8000000000 },
  { type:'khlcnt', id:'PL2300148182', name:'KHLCNT thủy lợi', date:'2026-05-31T22:00:00.000Z', area:'703', price:450000000 },
  { type:'tbmt', id:'IB2600000999', name:'Tư vấn giám sát', date:'2026-09-05T15:30:00.000Z', area:'56', price:null }
]);

export function canaryCheck(normalizers, parseDateFn) {
  const rows = CANARY_RECORDS.map((raw,index) => {
    const expected = EXPECTED[index];
    const normalize = typeof normalizers === 'function' ? normalizers : normalizers?.[expected.type];
    let rec = null, error = '';
    try { rec = typeof normalize === 'function' ? normalize(structuredClone(raw)) : null; }
    catch (e) { error = String(e?.message || e); }
    const output = rec && typeof rec === 'object' && !Array.isArray(rec);
    const hasId = Boolean(output && (expected.type === 'khlcnt' ? rec.planNo : rec.notifyNo) === expected.id);
    const hasName = Boolean(output && (expected.type === 'khlcnt' ? rec.name : rec.bidName) === expected.name);
    const dateRaw = output && (expected.type === 'khlcnt' ? rec.decisionDate : rec.closeDate);
    let hasDate = false;
    try { hasDate = Boolean(dateRaw && typeof parseDateFn === 'function' && parseDateFn(dateRaw) === expected.date); }
    catch (e) { error ||= String(e?.message || e); }
    const hasArea = Boolean(output && [rec.provinceCode, ...(Array.isArray(rec.provinceCodes) ? rec.provinceCodes : [])].includes(expected.area));
    const price = expected.type === 'khlcnt' ? rec?.packages?.[0]?.price : rec?.price;
    const hasPrice = Boolean(output && price === expected.price);
    const hasVersion = Boolean(output && rec.version === '00');
    return { id: expected.id, type:expected.type, hasId, hasName, hasDate, hasArea, hasPrice, hasVersion, error,
      ok: hasId && hasName && hasDate && hasArea && hasPrice && hasVersion };
  });
  return { ok: rows.every(r => r.ok), pass: rows.filter(r => r.ok).length, total: rows.length,
    need: ['id','name','Vietnam-date','province-code','price-or-null','version'], rows, offline: true };
}
