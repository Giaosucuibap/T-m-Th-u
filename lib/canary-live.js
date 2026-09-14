/* ============================================================================
 *  CANARY SỐNG — đối chứng định kỳ với e-GP THẬT
 *
 *  VÌ SAO CẦN, khi đã có lib/canary.js:
 *
 *  `lib/canary.js` là phép thử NGOẠI TUYẾN trên dữ liệu tự dựng. Nó chứng minh
 *  bộ chuẩn hoá không tự hỏng, và chỉ vậy. Nó KHÔNG biết e-GP vừa đổi tên một
 *  trường, vừa bỏ một mã tỉnh, hay vừa đổi kiểu ghi ngày — tức là đúng những
 *  thứ làm phần mềm trả kết quả sai mà vẫn xanh toàn bộ phép thử.
 *
 *  Canary sống lấp đúng chỗ đó: mở một danh sách mã CÓ THẬT trên e-GP, đọc về,
 *  và đối chiếu với những gì lần trước đọc được.
 *
 *  BA ĐIỀU NÓ CANH
 *  ---------------
 *    1. TRƯỜNG BIẾN MẤT — một mã từng trả `bidPrice` mà nay không còn.
 *    2. MÃ ĐỊA BÀN TRÔI — Lâm Đồng có hai mã 68 và 703 (mã trước sáp nhập).
 *       Nếu 703 thôi khớp Lâm Đồng, mọi lượt tra Lâm Đồng sẽ bỏ sót lặng lẽ
 *       một nửa dữ liệu cũ. Đây là kiểu hỏng không ai phát hiện bằng mắt.
 *    3. MÃ BIẾN MẤT — mã từng tra được nay e-GP không trả nữa.
 *
 *  VÌ SAO KHÔNG CHẠY ĐƯỢC TRONG `npm test`
 *  ---------------------------------------
 *  Node không có token của trang e-GP, nên không gọi được endpoint tìm kiếm.
 *  Canary sống PHẢI chạy trong tiện ích, trên chính trang e-GP. Vì vậy chia đôi:
 *
 *      Trong tiện ích   →  chạy thật, ghi kết quả ra `canary-result.json`
 *      Trong `npm test` →  ĐỌC tệp kết quả đó và chặn bản dựng nếu nó đỏ
 *
 *  Tệp này là phần THUẦN của cả hai vế: mô tả cần đọc gì, và chấm kết quả.
 *  Không có lệnh mạng nào ở đây, nên nó tự kiểm thử được.
 *
 *  GIỜ CHẠY: sau giờ thấp điểm. e-GP là hệ thống công, đừng thêm tải vào giờ
 *  hành chính khi các đơn vị đang nộp hồ sơ.
 * ========================================================================== */

/** Giờ Việt Nam nên chạy canary: 22h–5h. */
export const CANARY_HOURS = Object.freeze({ from: 22, to: 5 });

/** Canary quá hạn bao lâu thì coi là không còn giá trị. */
export const CANARY_MAX_AGE_DAYS = 10;

/**
 * Danh sách mã đối chứng.
 *
 * `source` ghi rõ mã này lấy từ đâu, để người sau biết tin được tới đâu:
 *   'observed'  — đã đọc được trên e-GP thật, có biên bản kèm.
 *   'candidate' — lấy từ kết quả tìm kiếm, CHƯA mở chi tiết xác nhận.
 *
 * Danh sách này cần được bổ sung dần tới 20–30 mã. Mỗi lần chạy canary thật,
 * thêm mã vừa xác nhận vào đây kèm `source:'observed'`.
 */
export const LIVE_CANARY_CODES = Object.freeze([
  { code: 'IB2600509787-01', kind: 'tbmt',   need: ['bidName', 'bidPrice'],    source: 'observed',  note: 'Có bảng nhà thầu; giá dự thầu 8.768.657.616 đ' },
  { code: 'IB2600501375-00', kind: 'tbmt',   need: ['bidName', 'investorName'], source: 'observed', note: 'Chỉ định thầu rút gọn — notifyVersion trả chuỗi "null"' },
  { code: 'IB2600486024-00', kind: 'tbmt',   need: ['bidName'],                source: 'observed',  note: 'Đăng 26/8 nhưng mở thầu thật 5/9 — mốc ngày lệch' },
  { code: 'IB2600308584-00', kind: 'tbmt',   need: ['bidName', 'bidPrice'],    source: 'candidate', note: 'Chỉ định thầu rút gọn, xã Tân Minh' },
  { code: 'IB2600242483-00', kind: 'tbmt',   need: ['bidName', 'bidPrice'],    source: 'candidate', note: 'Nhà văn hóa xã Cát Tiên 3' },
  { code: 'IB2600072790-00', kind: 'tbmt',   need: ['bidName', 'bidPrice'],    source: 'candidate', note: 'Gói trúng theo LIÊN DANH — canh cách tính giá nhóm' },
  { code: 'PL2600085770-00', kind: 'khlcnt', need: ['planName', 'decisionDate'], source: 'observed', note: 'Tư vấn lập phương án bảo trì hồ Bảo Lộc' },
  { code: 'PL2500319720-00', kind: 'khlcnt', need: ['planName', 'decisionDate'], source: 'candidate', note: 'Kế hoạch năm 2025 — canh bộ lọc ngày' },
  { code: 'PL2600286616-00', kind: 'khlcnt', need: ['planName', 'decisionDate'], source: 'candidate', note: 'Phê duyệt 28/8/26' }
].map(Object.freeze));

/**
 * Bất biến về mã địa bàn.
 *
 * Đây là thứ dễ trôi nhất và khó thấy nhất. Sau đợt sáp nhập 1/7/2025, e-GP
 * giữ song song mã cũ và mã mới. Hồ sơ đăng trước mốc đó mang mã cũ.
 */
export const AREA_INVARIANTS = Object.freeze([
  { name: 'Lâm Đồng', codes: Object.freeze(['68', '703']), why: 'Hồ sơ trước 1/7/2025 mang mã 703; mất mã này là bỏ sót lặng lẽ toàn bộ dữ liệu cũ' },
  { name: 'Cần Thơ',  codes: Object.freeze(['92', '815']), why: 'Cùng kiểu hai mã như Lâm Đồng' }
].map(Object.freeze));

/** Canary có nên chạy vào giờ này không (giờ Việt Nam 0–23)? */
export function inCanaryWindow(hourVn) {
  // `Number(null)` ra 0, `Number('')` cũng ra 0 — nhận bừa thì "không biết mấy
  // giờ" biến thành "0 giờ", tức là canary tự cho phép mình chạy.
  if (typeof hourVn !== 'number') return false;
  const h = hourVn;
  if (!Number.isInteger(h) || h < 0 || h > 23) return false;
  // Khung vắt qua nửa đêm.
  return h >= CANARY_HOURS.from || h < CANARY_HOURS.to;
}

const txt = v => String(v ?? '').trim();
const has = (rec, field) => {
  const v = rec?.[field];
  if (v === null || v === undefined) return false;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.length > 0;
  return txt(v) !== '' && !['null', 'undefined', 'nan'].includes(txt(v).toLowerCase());
};

/**
 * Chấm một lượt canary.
 *
 * @param {object[]} observations  Mỗi phần tử: { code, record } — record là bản
 *                                 ghi e-GP đã chuẩn hoá, hoặc null nếu không tra được.
 * @param {object}   areas         Danh mục địa bàn vừa tải từ e-GP.
 * @param {object[]} codes         Danh sách mã cần đối chứng.
 */
export function evaluateLiveCanary(observations = [], areas = null, codes = LIVE_CANARY_CODES) {
  const seen = new Map((observations || []).filter(o => o && o.code).map(o => [txt(o.code), o]));

  const rows = codes.map(spec => {
    const got = seen.get(spec.code);
    if (!got) return { code: spec.code, kind: spec.kind, status: 'NOT_RUN', missing: [], note: spec.note };
    if (!got.record) {
      return { code: spec.code, kind: spec.kind, status: 'GONE', missing: [],
        detail: txt(got.error) || 'e-GP không trả bản ghi nào cho mã này', note: spec.note };
    }
    const missing = spec.need.filter(f => !has(got.record, f));
    return { code: spec.code, kind: spec.kind, status: missing.length ? 'FIELD_LOST' : 'OK', missing, note: spec.note };
  });

  // Bất biến địa bàn. Không có danh mục thì nói CHƯA KIỂM, không nói đạt.
  const areaRows = AREA_INVARIANTS.map(inv => {
    const list = Array.isArray(areas?.provinces) ? areas.provinces : null;
    if (!list) return { name: inv.name, status: 'NOT_RUN', missing: [], why: inv.why };
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      .replace(/^(?:tinh|thanh pho|tp)\s+/, '');
    const want = fold(inv.name);
    const have = list.filter(p => fold(p?.name) === want).map(p => txt(p?.code));
    const missing = inv.codes.filter(c => !have.includes(c));
    return { name: inv.name, status: missing.length ? 'AREA_DRIFT' : 'OK', missing, have, why: inv.why };
  });

  const failed = [...rows, ...areaRows].filter(r => r.status === 'FIELD_LOST' || r.status === 'GONE' || r.status === 'AREA_DRIFT');
  const notRun = [...rows, ...areaRows].filter(r => r.status === 'NOT_RUN');

  return {
    ok: failed.length === 0 && notRun.length === 0,
    ranAt: new Date().toISOString(),
    checked: rows.length - rows.filter(r => r.status === 'NOT_RUN').length,
    total: rows.length,
    rows, areaRows,
    failures: failed.map(r => r.code || r.name),
    live: true
  };
}

/**
 * Cổng chặn bản dựng.
 *
 * Quy tắc, theo đúng thứ tự nghiêm khắc giảm dần:
 *   BLOCK — có trường biến mất, mã biến mất, hoặc mã địa bàn trôi. Đây là
 *           những thứ khiến phần mềm trả kết quả sai mà vẫn xanh mọi phép thử.
 *   BLOCK — kết quả cũ quá `CANARY_MAX_AGE_DAYS`. Một canary đã cũ thì không
 *           nói được gì về e-GP hôm nay, và tin vào nó còn tệ hơn không có.
 *   WARN  — chưa chạy lần nào. Không chặn, vì chặn thì không ai cài được phần
 *           mềm lần đầu; nhưng phải nói to.
 */
export function canaryGate(result, now = Date.now(), maxAgeDays = CANARY_MAX_AGE_DAYS) {
  if (!result || typeof result !== 'object') {
    return { verdict: 'WARN', block: false, reason: 'chưa chạy canary sống lần nào' };
  }
  const failures = Array.isArray(result.failures) ? result.failures : [];
  if (failures.length) {
    return { verdict: 'BLOCK', block: true, failures,
      reason: `e-GP đã đổi: ${failures.join(', ')}` };
  }
  const ranAt = Date.parse(result.ranAt || '');
  if (!Number.isFinite(ranAt)) {
    return { verdict: 'BLOCK', block: true, reason: 'kết quả canary không ghi thời điểm chạy' };
  }
  const ageDays = (now - ranAt) / 86400000;
  if (ageDays > maxAgeDays) {
    return { verdict: 'BLOCK', block: true, ageDays,
      reason: `canary chạy cách đây ${Math.floor(ageDays)} ngày, quá hạn ${maxAgeDays} ngày` };
  }
  if (result.ok !== true) {
    return { verdict: 'BLOCK', block: true, reason: 'lượt canary chưa đối chứng đủ danh sách mã' };
  }
  return { verdict: 'PASS', block: false, ageDays };
}
