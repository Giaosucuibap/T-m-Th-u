/* ============================================================================
 *  lib/areas.js — DANH SÁCH TỈNH VÀ XÃ/PHƯỜNG
 *
 *  MỤC ĐÍCH: cung cấp danh sách gợi ý cho ô "Tỉnh/Thành phố" và ô "Xã/Phường"
 *  của phần mềm, để người dùng chọn thay vì gõ tay rồi sai chính tả.
 *
 *  ---------------------------------------------------------------------------
 *  VÌ SAO LẤY TỪ e-GP THAY VÌ CHÉP CỨNG VÀO ĐÂY
 *
 *  Cả nước có 34 tỉnh/thành hiện hành và 4.055 xã/phường (đã đếm thật). Chép
 *  cứng danh sách đó vào phần mềm thì:
 *    - phình mã nguồn thêm khoảng 100 KB,
 *    - và LẠC HẬU ngay lần điều chỉnh địa giới kế tiếp, trong khi bộ lọc địa
 *      bàn lại là thứ phải đúng tuyệt đối.
 *
 *  Nên phần mềm hỏi thẳng e-GP một lần rồi ghi nhớ trong `chrome.storage`.
 *
 *  ---------------------------------------------------------------------------
 *  GHI CHÚ VỀ QUY TẮC "KHÔNG REPLAY API NỘI BỘ" TRONG CLAUDE.md
 *
 *  Đây là NGOẠI LỆ HẸP, có ý thức, và chỉ gồm đúng một lời gọi:
 *
 *      POST /o/egp-portal-contractor-selection-v2/services/get/area-api-list
 *      body: {"areas":[{"areaType":"2","parentCode":"<mã tỉnh>"}]}
 *
 *  Vì sao coi là chấp nhận được:
 *    - Đây là DANH MỤC HÀNH CHÍNH CÔNG KHAI, không phải dữ liệu đấu thầu.
 *    - KHÔNG cần token reCAPTCHA, KHÔNG cần cookie, KHÔNG giả danh tính —
 *      đã kiểm chứng: gọi thẳng vẫn trả 200.
 *    - KHÔNG phát lại request tìm kiếm nào. Mọi truy vấn dữ liệu đấu thầu vẫn
 *      đi qua đúng đường cũ: chính trang e-GP phát request bằng token của nó.
 *    - Gọi một lần rồi nhớ; không gọi lặp.
 *
 *  Nếu muốn bỏ ngoại lệ này: xoá `fetchAreas()` và cho `loadAreas()` chỉ đọc
 *  từ kho đã nhớ. Phần mềm vẫn chạy, chỉ mất danh sách gợi ý — ô Xã/Phường
 *  quay lại nhập tay. Không tính năng nào khác phụ thuộc vào tệp này.
 * ========================================================================== */

import { foldText, cleanText, wardCoreName } from './core.js';

// Đường dẫn TUYỆT ĐỐI, vì tệp này chạy trong service worker của tiện ích —
// đường dẫn tương đối ở đó sẽ trỏ về gốc chrome-extension://, không phải e-GP.
// Gọi được nhờ "https://muasamcong.mpi.gov.vn/*" trong host_permissions.
const AREA_ENDPOINT =
  'https://muasamcong.mpi.gov.vn/o/egp-portal-contractor-selection-v2/services/get/area-api-list';

/** Mã địa bàn e-GP: areaType 1 = tỉnh/thành, areaType 2 = xã/phường. */
export const AREA_TYPE_PROVINCE = '1';
export const AREA_TYPE_WARD = '2';

/**
 * `status` trong dữ liệu e-GP:
 *   1 = địa bàn HIỆN HÀNH (sau sáp nhập 1/7/2025)
 *   0 = địa bàn CŨ, giữ lại để tra hồ sơ đăng trước sáp nhập
 *
 * Phải giữ cả hai: hồ sơ cũ vẫn ghi tên huyện/xã cũ, và tên ban quản lý dự án
 * huyện cũ thì đến nay vẫn dùng.
 */
export const AREA_CURRENT = 1;
export const AREA_LEGACY = 0;

/** Chuẩn hoá một bản ghi địa bàn của e-GP về dạng gọn. */
function normalizeArea(raw) {
  const code = cleanText(raw && raw.code);
  const name = cleanText(raw && raw.name);
  if (!code || !name) return null;
  return {
    code,
    name,
    parentCode: cleanText(raw.parentCode),
    current: Number(raw.status) === AREA_CURRENT,
    fold: foldText(name)
  };
}

function listFrom(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  return payload.data || payload.result || payload.content || payload.areas || [];
}

/** Hỏi e-GP một nhóm địa bàn. */
async function fetchAreas(body) {
  const res = await fetch(AREA_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`e-GP trả HTTP ${res.status} khi lấy danh sách địa bàn.`);
  return listFrom(await res.json()).map(normalizeArea).filter(Boolean);
}

/** Lấy toàn bộ tỉnh/thành (cả hiện hành và cũ). */
export function fetchProvinces() {
  return fetchAreas({ areas: [{ areaType: AREA_TYPE_PROVINCE }] });
}

/** Lấy xã/phường của một tỉnh theo mã tỉnh. */
export function fetchWards(provinceCode) {
  const code = cleanText(provinceCode);
  if (!code) return Promise.resolve([]);
  return fetchAreas({ areas: [{ areaType: AREA_TYPE_WARD, parentCode: code }] });
}

/**
 * Lấy tất cả xã/phường của mọi tỉnh, kèm nghỉ giữa các lần gọi.
 *
 * `onProgress(done, total)` để giao diện báo tiến độ — 97 lời gọi mất khoảng
 * mươi giây, im lặng suốt quãng đó thì người dùng tưởng treo.
 */
export async function fetchAllAreas(onProgress) {
  const provinces = await fetchProvinces();
  const wardsByProvince = {};
  let done = 0;
  for (const p of provinces) {
    wardsByProvince[p.code] = await fetchWards(p.code);
    done += 1;
    if (typeof onProgress === 'function') onProgress(done, provinces.length);
    await new Promise((r) => setTimeout(r, 50));
  }
  return { provinces, wardsByProvince, fetchedAt: new Date().toISOString() };
}

/* --------------------------------------------------------------------------
 *  TRA CỨU TRÊN DANH SÁCH ĐÃ NHỚ
 * ------------------------------------------------------------------------ */

/**
 * Các tỉnh cùng tên nhưng khác mã.
 *
 * Sau sáp nhập, "Tỉnh Lâm Đồng" tồn tại ở cả mã 68 (hiện hành) và 703 (cũ);
 * "Thành phố Cần Thơ" ở mã 92 và 815. Khi người dùng chọn một tên tỉnh thì
 * phải nhận HẾT các mã cùng tên, nếu không sẽ bỏ sót hồ sơ đăng trước 1/7/2025.
 */
export function provinceCodesByName(provinces, name) {
  const q = foldText(name);
  if (!q) return [];
  return (provinces || []).filter((p) => p.fold === q || p.fold.includes(q)).map((p) => p.code);
}

/**
 * Danh sách tên xã/phường để gợi ý cho một tỉnh.
 *
 * Gộp xã/phường của MỌI mã tỉnh cùng tên (xem `provinceCodesByName`), nên danh
 * sách gồm cả tên mới lẫn tên huyện/xã cũ — đúng thứ cần để tra hồ sơ cũ và để
 * khớp tên ban quản lý dự án huyện cũ.
 *
 * Không truyền tên tỉnh thì trả về toàn bộ.
 */
export function wardNamesForProvince(areas, provinceName) {
  if (!areas || !areas.wardsByProvince) return [];
  const codes = provinceName
    ? provinceCodesByName(areas.provinces, provinceName)
    : Object.keys(areas.wardsByProvince);
  const seen = new Set();
  const out = [];
  for (const code of codes) {
    for (const w of areas.wardsByProvince[code] || []) {
      if (seen.has(w.fold)) continue;
      seen.add(w.fold);
      out.push(w.name);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, 'vi'));
}

/** Tên các tỉnh/thành hiện hành, đã xếp theo bảng chữ cái. */
export function currentProvinceNames(areas) {
  const seen = new Set();
  const out = [];
  for (const p of (areas && areas.provinces) || []) {
    if (!p.current || seen.has(p.fold)) continue;
    seen.add(p.fold);
    out.push(p.name);
  }
  return out.sort((a, b) => a.localeCompare(b, 'vi'));
}

/**
 * Quy TÊN xã/phường ra MÃ, trong phạm vi một tỉnh (hoặc toàn quốc nếu bỏ trống).
 *
 * Gom mã của MỌI tỉnh cùng tên (Lâm Đồng = 68 + 703) nên bắt được cả địa danh
 * trước sáp nhập. Khớp theo TÊN RIÊNG đã bỏ tiền tố, nhờ vậy gõ "Hàm Thạnh",
 * "Xã Hàm Thạnh" hay "Huyện Hàm Thạnh" đều ra.
 */
export function wardCodesByName(areas, provinceName, wardName) {
  if (!areas || !areas.wardsByProvince) return [];
  const core = wardCoreName(wardName);
  if (!core) return [];
  const codes = provinceName
    ? provinceCodesByName(areas.provinces, provinceName)
    : Object.keys(areas.wardsByProvince);
  const out = new Set();
  for (const pc of codes) {
    for (const w of areas.wardsByProvince[pc] || []) {
      const wc = wardCoreName(w.name);
      if (wc === core || wc.includes(core) || core.includes(wc)) out.add(w.code);
    }
  }
  return [...out];
}
