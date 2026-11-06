/* ============================================================================
 *  lib/profile360.js — HỒ SƠ PHÂN TÍCH 360° CỦA MỘT NHÀ THẦU
 *
 *  ---------------------------------------------------------------------------
 *  ĐỌC KỸ PHẦN NÀY TRƯỚC KHI TIN CÁC CON SỐ
 *
 *  Mười chỉ tiêu người dùng muốn KHÔNG có cùng độ tin cậy, vì e-GP không công
 *  bố chúng như nhau. Module này tách làm hai nhóm và KHÔNG trộn lẫn:
 *
 *  NHÓM A — ĐẦY ĐỦ. Hỏi thẳng e-GP theo mã số thuế (`winningCode`) là ra hết,
 *  không bỏ sót gói nào, kể cả gói trúng theo liên danh:
 *      • số gói TRÚNG            • tổng giá trị trúng thầu
 *      • tỉnh/thành đã trúng     • bên mời thầu đã trúng
 *      • lịch sử theo năm        • lĩnh vực, hình thức
 *      • danh sách chi tiết từng gói kèm link gốc
 *
 *  NHÓM B — CHỈ TRONG PHẠM VI ĐÃ QUÉT. Bốn chỉ tiêu sau đòi hỏi biết nhà thầu
 *  ĐÃ DỰ những gói nào, mà chỉ mục tìm kiếm của e-GP KHÔNG chứa danh tính nhà
 *  thầu ở giai đoạn mở thầu:
 *      • tổng số gói đã tham gia • số gói TRƯỢT
 *      • số gói chưa có kết quả  • số gói bị hủy
 *
 *  Đã kiểm chứng bằng đối chứng có kiểm soát (xem đầu tệp lib/bbmt.js):
 *      BBMT không lọc nhà thầu                      -> 10.000 kết quả  ✔
 *      BBMT + winningCode của nhà thầu CHẮC CHẮN dự ->      0 kết quả  ✘
 *      BBMT + tìm theo tên nhà thầu                 ->      0 kết quả  ✘
 *
 *  Danh tính người dự chỉ có trong BẢNG NHÀ THẦU của từng biên bản mở thầu, đọc
 *  được từng gói một. Nên nhóm B chỉ tính trên các gói mà người dùng ĐÃ QUÉT
 *  bằng chức năng "Gói đang chờ kết quả", và luôn kèm `coverage` nói rõ đã quét
 *  bao nhiêu gói. Trình bày nhóm B như thể đầy đủ là nói dối: một nhà thầu
 *  "tỷ lệ trúng 100%" chỉ vì mới quét đúng 3 gói họ thắng.
 *
 *  Các trang thương mại làm được nhóm B vì họ đã bò dữ liệu nhiều năm và lưu
 *  lại. Tiện ích này tích luỹ dần theo mức bạn dùng.
 * ========================================================================== */

import { cleanText } from './core.js';
import { describe, rate, numbers, MIN_SAMPLE } from './stats.js';

/** Gộp theo khoá, trả về danh sách đã xếp giảm dần theo số lượng. */
function tally(items, keyFn) {
  const m = new Map();
  for (const it of items || []) {
    for (const k of [].concat(keyFn(it) || [])) {
      const key = cleanText(k);
      if (!key) continue;
      if (!m.has(key)) m.set(key, { name: key, count: 0, value: 0 });
      const row = m.get(key);
      row.count += 1;
      row.value += Number(it.winningPrice) || 0;
    }
  }
  return [...m.values()].sort((a, b) => b.count - a.count || b.value - a.value);
}

/** Tỉnh/thành của một gói. Bản ghi e-GP để ở `locations[].provName`. */
function provincesOf(pkg) {
  const list = Array.isArray(pkg.locations) ? pkg.locations : [];
  const names = list.map((l) => cleanText(l && l.provName)).filter(Boolean);
  if (names.length) return [...new Set(names)];
  // Bản ghi đã chuẩn hoá giữ chuỗi "Xã X - Tỉnh Y; ..." ở `location`.
  const text = cleanText(pkg.location);
  if (!text) return [];
  return [...new Set(text.split(';').map((s) => {
    const parts = s.split(' - ').map((x) => x.trim());
    return parts[parts.length - 1];
  }).filter(Boolean))];
}

/* --------------------------------------------------------------------------
 *  NHÓM A — TỪ CÁC GÓI ĐÃ TRÚNG (đầy đủ)
 * ------------------------------------------------------------------------ */

export function wonProfile(packages) {
  const list = packages || [];
  let soloValue = 0;
  let ventureValue = 0;
  for (const p of list) {
    const v = Number(p.winningPrice);
    if (!Number.isFinite(v)) continue;
    if (p.isVenture) ventureValue += v; else soloValue += v;
  }

  const byYear = new Map();
  for (const p of list) {
    const y = p.decisionDate ? String(p.decisionDate).slice(0, 4)
      : (p.publicDateKqlcnt ? String(p.publicDateKqlcnt).slice(0, 4) : '');
    if (!y) continue;
    if (!byYear.has(y)) byYear.set(y, { year: y, won: 0, value: 0, discounts: [] });
    const row = byYear.get(y);
    row.won += 1;
    row.value += Number(p.winningPrice) || 0;
    row.discounts.push(p.discountRate);
  }

  return {
    wonCount: list.length,
    soloCount: list.filter((p) => !p.isVenture).length,
    ventureCount: list.filter((p) => p.isVenture).length,
    soloValue,
    ventureValue,
    // KHÔNG cộng hai phần: thiếu tỷ lệ góp vốn thì quy cả gói liên danh cho một
    // thành viên là sai (quy tắc bắt buộc trong CLAUDE.md).
    ventureShareUnknown: list.some((p) => p.isVenture),
    discount: describe(list.map((p) => p.discountRate)),
    provinces: tally(list, provincesOf),
    entities: tally(list, (p) => cleanText(p.procuringEntityName) || cleanText(p.investorName)),
    fields: tally(list, (p) => p.fieldLabel),
    forms: tally(list, (p) => p.bidFormLabel),
    years: [...byYear.values()]
      .map((r) => ({ ...r, discount: describe(r.discounts) }))
      .sort((a, b) => a.year.localeCompare(b.year)),
    packages: list
  };
}

/* --------------------------------------------------------------------------
 *  NHÓM B — TỪ DỮ LIỆU ĐÃ QUÉT (một phần)
 * ------------------------------------------------------------------------ */

/**
 * Phân loại các gói đã biết nhà thầu này DỰ, dựa trên kho quan sát tích luỹ.
 *
 * @param {object[]} observations  quan sát từ các lượt quét biên bản mở thầu
 * @param {string} taxCode
 * @param {Set<string>} wonKeys    mã TBMT nhà thầu đã trúng (từ nhóm A)
 */
export function participationProfile(observations, taxCode, wonKeys) {
  const mst = cleanText(taxCode);
  const all = observations || [];

  /* Gói nào ĐÃ CÓ KẾT QUẢ?
   *
   * Đây là chỗ bản cũ hỏng. Nó đọc `o.hasResult` — một trường KHÔNG TỒN TẠI
   * trên bất kỳ quan sát nào (xem observationsFromBidOpen / observationsFromWinner
   * trong lib/analytics.js: cả hai đều ghi `won`, không ghi `hasResult`). Nhánh
   * LOST vì thế là mã chết: mọi gói không trúng đều rơi xuống "chưa có kết quả",
   * và số gói TRƯỢT luôn bằng 0 bất kể dữ liệu ra sao.
   *
   * Cách đúng: một gói coi là đã có kết quả khi trong kho quan sát có ít nhất
   * một dòng `won === true` cho gói đó — dòng đó chính là người thắng, dù là
   * nhà thầu nào. Suy ra từ dữ liệu thật thay vì một cờ không ai đặt.
   */
  const decidedNotifyNos = new Set();
  for (const o of all) {
    const no = cleanText(o.notifyNo);
    if (no && o.won === true) decidedNotifyNos.add(no);
  }

  const mine = all.filter((o) => cleanText(o.taxCode) === mst);
  const seen = new Map();
  for (const o of mine) {
    const no = cleanText(o.notifyNo);
    if (!no) continue;
    // Ưu tiên giữ dòng từ biên bản mở thầu: nó có giá bỏ thầu và thứ hạng giá.
    const prev = seen.get(no);
    if (!prev || (prev.source !== 'bbmt' && o.source === 'bbmt')) seen.set(no, o);
  }

  const rows = [];
  for (const [notifyNo, o] of seen) {
    let status;
    if (wonKeys.has(notifyNo) || o.won === true) {
      status = 'WON';
    } else if (o.cancelled || /huy|hủy/i.test(cleanText(o.statusLabel))) {
      status = 'CANCELLED';
    } else if (decidedNotifyNos.has(notifyNo)) {
      // Gói đã có người thắng, mà người đó không phải nhà thầu này.
      status = 'LOST';
    } else {
      /* CHƯA BIẾT, không phải "đang chờ".
       *
       * Hai trường hợp khác hẳn nhau bị gộp vào đây, và phải nói rõ là chưa
       * phân biệt được: (1) gói thật sự chưa công bố kết quả; (2) gói đã có
       * kết quả nhưng phần mềm chưa đọc kết quả đó nên không biết ai thắng.
       * Gọi cả hai là "đang chờ kết quả" là bịa ra một sự thật.
       */
      status = 'UNRESOLVED';
    }
    rows.push({ ...o, notifyNo, status });
  }

  const count = (st) => rows.filter((r) => r.status === st).length;
  const won = count('WON');
  const lost = count('LOST');
  const decided = won + lost;

  return {
    scannedCount: rows.length,
    won,
    lost,
    // Giữ tên cũ cho phần giao diện đang dùng, nhưng ý nghĩa nay là CHƯA XÁC ĐỊNH.
    pending: count('UNRESOLVED'),
    unresolved: count('UNRESOLVED'),
    cancelled: count('CANCELLED'),
    // Tỷ lệ trúng chỉ tính trên các gói ĐÃ CÓ KẾT QUẢ trong phạm vi đã quét.
    winRate: rate(won, decided, MIN_SAMPLE),
    decidedCount: decided,
    /* CÓ ĐỦ CĂN CỨ ĐỂ NÓI VỀ GÓI TRƯỢT CHƯA?
     *
     * Bản sửa đầu của tôi suy "đã dò" từ `decidedNotifyNos.size > 0`. Sai:
     * tập đó được lấp đầy bởi chính các gói nhà thầu ĐÃ TRÚNG, nên nhà thầu
     * nào từng trúng một gói cũng bị coi là "đã dò" — và ô Trượt lại hiện
     * số 0 như một kết luận, đúng cái lỗi đang đi sửa. Chạy thử trên dữ liệu
     * mô phỏng mới lộ ra.
     *
     * Căn cứ đúng: đã đọc được BẢNG NHÀ THẦU (nguồn bbmt) của ít nhất một gói
     * ĐÃ CÓ KẾT QUẢ mà nhà thầu này có tên. Chỉ khi đó "0 gói trượt" mới là
     * một quan sát chứ không phải chỗ trống.
     */
    bbmtSeen: rows.filter((r) => r.source === 'bbmt').length,
    decidedSeen: rows.filter((r) => r.source === 'bbmt' && decidedNotifyNos.has(r.notifyNo)).length,
    lossScanDone: rows.some((r) => r.source === 'bbmt' && decidedNotifyNos.has(r.notifyNo)),
    rows
  };
}

/* --------------------------------------------------------------------------
 *  DẤU CHÂN HOẠT ĐỘNG — dùng để khoanh vùng khi đi dò gói trượt
 * ------------------------------------------------------------------------ */

/**
 * Từ các gói ĐÃ TRÚNG, suy ra nhà thầu này hoạt động ở đâu, với ai, trong
 * những năm nào.
 *
 * Không lọc được theo nhà thầu trên e-GP, nên muốn tìm gói họ trượt thì phải
 * quét theo địa bàn và bên mời thầu rồi đọc bảng nhà thầu từng gói. Quét cả
 * nước là vô vọng; quét đúng dấu chân của họ thì khả thi — nhà thầu địa phương
 * dự đi dự lại của cùng vài chủ đầu tư.
 *
 * Đây là GỢI Ý PHẠM VI, không phải giới hạn sự thật: nhà thầu vẫn có thể trượt
 * ở một tỉnh họ chưa từng thắng, và phạm vi này sẽ không thấy gói đó.
 */
export function activityFootprint(won) {
  /* NHẬN KẾT QUẢ CỦA wonProfile(), KHÔNG NHẬN DANH SÁCH GÓI THÔ.
   *
   * Bản đầu tôi viết một bộ trích xuất tỉnh RIÊNG, chỉ đọc `p.locations[]`.
   * Bản ghi KQLCNT đã chuẩn hoá KHÔNG giữ mảng đó — nó giữ chuỗi
   * "Xã X - Tỉnh Y; ..." ở `p.location`. Hậu quả: dấu chân ra RỖNG, nút
   * "Dò gói đã trượt" bị khoá, trong khi ngay phía trên màn hình vẫn ghi
   * "5 tỉnh · 16 bên mời thầu" — vì phần đó dùng provincesOf() xử lý được
   * cả hai dạng. Tên bên mời thầu cũng lấy ngược thứ tự ưu tiên so với
   * wonProfile, nên có thể ra một tên khác hẳn cái đang hiển thị.
   *
   * Sửa tận gốc là BỎ bộ trích xuất thứ hai đi. Dấu chân nay lấy thẳng từ
   * các bảng mà wonProfile đã tính, nên không thể lệch với màn hình nữa —
   * một nguồn duy nhất, không có chỗ cho hai cách hiểu.
   */
  const w = won || {};
  const years = (w.years || [])
    .map((r) => Number(r.year))
    .filter((y) => y > 2000);

  return {
    provinces: (w.provinces || []).map((x) => ({ name: x.name, count: x.count })),
    entities: (w.entities || []).map((x) => ({ name: x.name, count: x.count })),
    fromYear: years.length ? Math.min(...years) : null,
    toYear: years.length ? Math.max(...years) : null
  };
}

/* --------------------------------------------------------------------------
 *  TỔNG HỢP
 * ------------------------------------------------------------------------ */

export function buildProfile360({ taxCode, contractorName, wonPackages, observations, scannedPackageCount = 0 }) {
  const won = wonProfile(wonPackages);
  const wonKeys = new Set((wonPackages || []).map((p) => cleanText(p.notifyNo)).filter(Boolean));
  const participation = participationProfile(observations, taxCode, wonKeys);

  return {
    taxCode: cleanText(taxCode),
    contractorName: cleanText(contractorName)
      || cleanText((wonPackages || []).find((p) => !p.isVenture)?.winnerName)
      || cleanText((wonPackages || [])[0]?.winnerName),
    builtAt: new Date().toISOString(),
    won,
    participation,
    // Dấu chân hoạt động — giao diện dùng để khoanh vùng khi đi dò gói trượt.
    footprint: activityFootprint(won),
    coverage: {
      scannedPackageCount,
      // Bao nhiêu gói đã trúng cũng nằm trong phần đã quét — càng cao thì
      // nhóm B càng đáng tin.
      overlap: [...wonKeys].filter((no) => participation.rows.some((r) => r.notifyNo === no)).length,
      complete: false
    }
  };
}

export const PROFILE_COMPLETE_NOTE =
  'Các số ở nhóm này lấy trực tiếp từ e-GP theo MÃ SỐ THUẾ nên ĐẦY ĐỦ — không bỏ sót gói nào, '
  + 'kể cả gói trúng theo liên danh (tìm theo tên công ty thì sẽ bỏ sót).';

export const PROFILE_PARTIAL_NOTE =
  'Các số ở nhóm này CHỈ TÍNH TRÊN CÁC GÓI BẠN ĐÃ QUÉT, không phải toàn bộ lịch sử nhà thầu. '
  + 'Lý do: chỉ mục tìm kiếm của e-GP không chứa danh tính nhà thầu dự thầu — đã kiểm chứng bằng '
  + 'đối chứng có kiểm soát. Danh tính người dự chỉ có trong bảng nhà thầu của từng biên bản mở '
  + 'thầu, phải đọc từng gói một. Càng dùng chức năng "Gói đang chờ kết quả" nhiều thì phần này '
  + 'càng đầy đủ. ĐỪNG đọc tỷ lệ trúng ở đây như tỷ lệ trúng thật của nhà thầu.';

export const PROFILE_USE_NOTE =
  'Dùng để: soi đối thủ (họ mạnh ở địa bàn nào, quen bên mời thầu nào, thường đánh gói cỡ bao '
  + 'nhiêu tiền), tự soi mình, và thẩm định đối tác liên danh bằng số gói đã thực trúng thay vì '
  + 'bằng hồ sơ năng lực họ tự khai.';
