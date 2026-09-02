/* ============================================================================
 *  lib/investor.js — HỒ SƠ CHỦ ĐẦU TƯ
 *
 *  Trả lời: "Chủ đầu tư này đã tổ chức bao nhiêu gói, và những nhà thầu nào
 *  hay trúng của họ?"
 *
 *  ---------------------------------------------------------------------------
 *  HAI BƯỚC, VÌ TÊN CHỦ ĐẦU TƯ RẤT RỐI
 *
 *  Người dùng thường chỉ nhớ vài chữ ("Đức Linh", "chi cục thủy lợi"), trong
 *  khi tên đầy đủ trên e-GP dài và không thống nhất. Tệ hơn, đã đo thật:
 *
 *    • "chi cục thủy lợi" -> 4.784 gói, và có ÍT NHẤT 5 MÃ KHÁC NHAU cùng mang
 *      đúng tên "Chi cục Thủy lợi" (vnz000004297, vn0301466411, vnz000013042,
 *      vn1201172138, vnz000013215). Tên một mình KHÔNG phân biệt được ai.
 *
 *    • Ngược lại, MỘT mã có thể mang HAI tên: vn3400599721 xuất hiện vừa là
 *      "Trung Tâm Y tế Huyện Đức Linh" vừa là "Trung tâm Y tế khu vực Đức Linh"
 *      — cùng một đơn vị, đổi tên sau sáp nhập.
 *
 *  Vì vậy:
 *    Bước 1 — DÒ: gõ vài chữ, phần mềm liệt kê các chủ đầu tư khớp, GOM THEO
 *             MÃ (không theo tên) và hiện đủ mọi tên mà mã đó từng dùng.
 *    Bước 2 — HỒ SƠ: chọn đúng mã, phần mềm lấy toàn bộ gói của mã đó.
 *
 *  ---------------------------------------------------------------------------
 *  LỌC CHÍNH XÁC PHẢI DÙNG `investorCode`
 *
 *  Đã đo trên e-GP với cùng một mã vn3401273345:
 *      procuringEntityCode in [...]  ->    0 kết quả  ✘
 *      investorCode in [...]         ->  168 kết quả  ✔
 *
 *  Hai trường này cùng có trong bản ghi và thường cùng giá trị, nhưng chỉ
 *  `investorCode` lọc được. Đừng đổi sang trường kia.
 *
 *  ---------------------------------------------------------------------------
 *  "BAO NHIÊU NHÀ THẦU ĐÃ THAM GIA" — BA CON SỐ KHÁC NHAU
 *
 *  1. Số nhà thầu ĐÃ TRÚNG (đếm mã số thuế khác nhau) — ĐẦY ĐỦ, lấy từ
 *     `winningTaxCodes` của từng gói.
 *
 *  2. Tổng LƯỢT nhà thầu tham dự — cộng trường `numBidderJoin` mà e-GP ghi sẵn
 *     cho mỗi gói. Đầy đủ, nhưng RẤT NHIỀU GÓI GHI 0 (thường là chỉ định thầu
 *     rút gọn, không có cạnh tranh). Nên luôn kèm số gói ghi 0 để người đọc
 *     không hiểu nhầm là "không ai dự".
 *
 *  3. DANH TÍNH từng nhà thầu đã dự nhưng KHÔNG trúng — e-GP KHÔNG công bố ở
 *     chỉ mục tìm kiếm (đã kiểm chứng bằng đối chứng có kiểm soát, xem đầu tệp
 *     lib/bbmt.js). Chỉ có trong bảng nhà thầu của từng biên bản mở thầu, phải
 *     đọc từng gói một. Module này KHÔNG bịa ra con số đó.
 * ========================================================================== */

import { cleanText, foldText } from './core.js';
import { describe, rate, hhi, numbers, MIN_SAMPLE } from './stats.js';

const ES_INDEX = 'es-contractor-selection';
const ES_TYPE_NOTIFY = 'es-notify-contractor';
const ES_STEP_KQLCNT = 'notify-contractor-step-4-kqlcnt';

function baseFilters() {
  return [
    { fieldName: 'type', searchType: 'in', fieldValues: [ES_TYPE_NOTIFY] },
    { fieldName: 'stepCode', searchType: 'in', fieldValues: [ES_STEP_KQLCNT] }
  ];
}

/**
 * BƯỚC 1 — dò chủ đầu tư theo vài chữ người dùng nhớ.
 *
 * @param {object} scope
 * @param {string}   scope.keyword     vài chữ bất kỳ trong tên đơn vị
 * @param {string[]} [scope.provinces] mã tỉnh, để thu hẹp (tên trùng rất nhiều)
 */
export function buildInvestorDiscoveryQuery(scope = {}) {
  const keyword = cleanText(scope.keyword);
  if (!keyword) return null;

  const filters = baseFilters();
  const provinces = (scope.provinces || []).map(cleanText).filter(Boolean);
  if (provinces.length) {
    filters.push({ fieldName: 'locations.provCode', searchType: 'in', fieldValues: provinces });
  }
  return {
    index: ES_INDEX,
    keyWord: keyword,
    matchType: 'all-0',
    // Dò trên CẢ hai cặp trường: đơn vị có thể nằm ở vai bên mời thầu hoặc
    // vai chủ đầu tư tuỳ gói.
    matchFields: ['procuringEntityName', 'investorName', 'procuringEntityCode', 'investorCode'],
    filters
  };
}

/**
 * BƯỚC 2 — lấy toàn bộ gói của một hoặc nhiều MÃ chủ đầu tư.
 *
 * Nhận nhiều mã vì người dùng có thể muốn gộp các ban của cùng một huyện cũ.
 */
export function buildInvestorProfileQuery(scope = {}) {
  const codes = (scope.codes || []).map(cleanText).filter(Boolean);
  if (!codes.length) return null;
  return {
    index: ES_INDEX,
    filters: [
      ...baseFilters(),
      // BẮT BUỘC là `investorCode` — `procuringEntityCode` trả 0. Xem đầu tệp.
      { fieldName: 'investorCode', searchType: 'in', fieldValues: codes }
    ]
  };
}

/**
 * Gom kết quả dò thành danh sách chủ đầu tư, THEO MÃ.
 *
 * Một mã có thể có nhiều tên (đổi tên sau sáp nhập) nên giữ hết trong `names`
 * và lấy tên dài nhất làm nhãn chính — tên dài thường là tên đầy đủ.
 */
export function discoverInvestors(packages) {
  const map = new Map();
  for (const p of packages || []) {
    const code = cleanText(p.investorCode);
    const name = cleanText(p.investorName) || cleanText(p.procuringEntityName);
    if (!code && !name) continue;
    const key = code || `name:${foldText(name)}`;
    if (!map.has(key)) map.set(key, { code, names: new Set(), packages: 0, value: 0, provinces: new Set() });
    const row = map.get(key);
    if (name) row.names.add(name);
    row.packages += 1;
    row.value += Number(p.winningPrice) || 0;
    for (const prov of provincesOf(p)) row.provinces.add(prov);
  }
  return [...map.values()]
    .map((r) => ({
      code: r.code,
      names: [...r.names].sort((a, b) => b.length - a.length),
      name: [...r.names].sort((a, b) => b.length - a.length)[0] || '(không rõ tên)',
      packages: r.packages,
      value: r.value,
      provinces: [...r.provinces]
    }))
    .sort((a, b) => b.packages - a.packages || b.value - a.value);
}

/** Tỉnh/thành của một gói — đọc `locations`, dự phòng chuỗi `location`. */
function provincesOf(pkg) {
  const list = Array.isArray(pkg.locations) ? pkg.locations : [];
  const names = list.map((l) => cleanText(l && l.provName)).filter(Boolean);
  if (names.length) return [...new Set(names)];
  const text = cleanText(pkg.location);
  if (!text) return [];
  return [...new Set(text.split(';').map((s) => {
    const parts = s.split(' - ').map((x) => x.trim());
    return parts[parts.length - 1];
  }).filter(Boolean))];
}

/** Gộp theo khoá, giữ nguyên danh sách để tính tiếp. */
function groupBy(items, keyFn) {
  const m = new Map();
  for (const it of items || []) {
    for (const k of [].concat(keyFn(it) || [])) {
      const key = cleanText(k);
      if (!key) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(it);
    }
  }
  return m;
}

/**
 * Bảng nhà thầu ĐÃ TRÚNG của chủ đầu tư này.
 *
 * Một gói liên danh có nhiều mã số thuế nên tính là một lượt trúng cho MỖI
 * thành viên; `ventureCount` giữ riêng để không đọc nhầm thành trúng độc lập.
 */
export function contractorsOfInvestor(packages) {
  const list = packages || [];
  const rows = new Map();

  for (const p of list) {
    const codes = (p.winningTaxCodes || []).filter(Boolean);
    const names = p.memberNames || [];
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (!rows.has(code)) {
        rows.set(code, { taxCode: code, names: new Set(), packages: [], soloCount: 0, ventureCount: 0 });
      }
      const row = rows.get(code);
      const nm = cleanText(names[i]) || cleanText(p.winnerName);
      if (nm) row.names.add(nm);
      row.packages.push(p);
      if (p.isVenture) row.ventureCount += 1; else row.soloCount += 1;
    }
  }

  const total = list.length;
  return [...rows.values()]
    .map((r) => {
      let soloValue = 0;
      let ventureValue = 0;
      for (const p of r.packages) {
        const v = Number(p.winningPrice);
        if (!Number.isFinite(v)) continue;
        if (p.isVenture) ventureValue += v; else soloValue += v;
      }
      return {
        taxCode: r.taxCode,
        name: [...r.names].sort((a, b) => b.length - a.length)[0] || '',
        packages: r.packages.length,
        soloCount: r.soloCount,
        ventureCount: r.ventureCount,
        soloValue,
        ventureValue,
        // Tỷ trọng SỐ GÓI của chủ đầu tư này rơi vào nhà thầu đó.
        share: rate(r.packages.length, total, MIN_SAMPLE),
        discount: describe(r.packages.map((p) => p.discountRate)),
        years: [...new Set(r.packages.map((p) => yearOf(p)).filter(Boolean))].sort()
      };
    })
    .sort((a, b) => b.packages - a.packages || (b.soloValue + b.ventureValue) - (a.soloValue + a.ventureValue));
}

function yearOf(p) {
  const d = p.decisionDate || p.publicDateKqlcnt;
  return d ? String(d).slice(0, 4) : '';
}

/** Thống kê theo một thuộc tính (năm, lĩnh vực, hình thức). */
function tally(packages, keyFn) {
  const groups = groupBy(packages, keyFn);
  return [...groups.entries()]
    .map(([key, list]) => ({
      key,
      packages: list.length,
      value: numbers(list.map((p) => p.winningPrice)).reduce((s, x) => s + x, 0),
      discount: describe(list.map((p) => p.discountRate))
    }))
    .sort((a, b) => b.packages - a.packages);
}

/** Tổng hợp toàn bộ hồ sơ một chủ đầu tư. */
export function summarizeInvestor(packages, meta = {}) {
  const list = packages || [];
  const contractors = contractorsOfInvestor(list);

  /* Số LƯỢT nhà thầu tham dự do e-GP ghi sẵn ở `numBidderJoin`.
     Rất nhiều gói ghi 0 (thường là chỉ định thầu rút gọn), nên phải đếm riêng
     số gói ghi 0 — nếu không, số trung bình sẽ bị hiểu nhầm là "ít người dự". */
  const joins = list.map((p) => Number(p.numBidderJoin)).filter((v) => Number.isFinite(v));
  const joinTotal = joins.reduce((s, x) => s + x, 0);
  const zeroJoin = joins.filter((v) => v === 0).length;
  const competitive = list.filter((p) => Number(p.numBidderJoin) > 1);

  let soloValue = 0;
  let ventureValue = 0;
  for (const p of list) {
    const v = Number(p.winningPrice);
    if (!Number.isFinite(v)) continue;
    if (p.isVenture) ventureValue += v; else soloValue += v;
  }

  const top = contractors[0] || null;
  const years = [...new Set(list.map(yearOf).filter(Boolean))].sort();

  return {
    meta,
    packageCount: list.length,
    soloValue,
    ventureValue,
    contractorCount: contractors.length,

    // Lượt tham dự — đầy đủ nhưng nhiều gói ghi 0.
    joinTotal,
    joinAverage: joins.length ? Math.round((joinTotal / joins.length) * 100) / 100 : null,
    joinZeroCount: zeroJoin,
    competitiveCount: competitive.length,

    discount: describe(list.map((p) => p.discountRate)),
    // Mức tập trung: giá trị gói dồn vào bao nhiêu nhà thầu.
    concentration: hhi(contractors.map((c) => c.soloValue + c.ventureValue)),
    topContractor: top,
    topShare: top ? top.share : rate(0, 0),

    years,
    byYear: tally(list, yearOf).sort((a, b) => a.key.localeCompare(b.key)),
    byField: tally(list, (p) => p.fieldLabel),
    byForm: tally(list, (p) => p.bidFormLabel),
    provinces: tally(list, provincesOf),

    contractors,
    packages: list
  };
}

export const INVESTOR_COMPLETE_NOTE =
  'Số gói, giá trị, danh sách nhà thầu ĐÃ TRÚNG và số lượt nhà thầu tham dự đều lấy trực tiếp '
  + 'từ e-GP theo MÃ chủ đầu tư nên đầy đủ, không bỏ sót gói nào.';

export const INVESTOR_JOIN_NOTE =
  'Số lượt nhà thầu tham dự là trường e-GP ghi sẵn cho mỗi gói. Nhiều gói ghi 0 — thường là '
  + 'chỉ định thầu rút gọn, không qua cạnh tranh — nên phần mềm tách riêng số gói ghi 0 để bạn '
  + 'không đọc nhầm thành "không ai dự".';

export const INVESTOR_PARTIAL_NOTE =
  'DANH TÍNH từng nhà thầu đã dự nhưng KHÔNG trúng thì e-GP không công bố ở chỉ mục tìm kiếm — '
  + 'chỉ có trong bảng nhà thầu của từng biên bản mở thầu, phải đọc từng gói một. Dùng chức năng '
  + '"Gói đang chờ kết quả" để tích luỹ dần phần đó.';

export const INVESTOR_DISCLAIMER =
  'Ở địa bàn nhỏ, việc một nhà thầu trúng nhiều gói của cùng một chủ đầu tư là bình thường: số '
  + 'doanh nghiệp đủ năng lực vốn đã ít. Các con số ở đây mô tả dữ liệu e-GP đã công bố, KHÔNG '
  + 'phải bằng chứng vi phạm.';
