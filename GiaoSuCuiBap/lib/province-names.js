/* ============================================================================
 *  TÊN TỈNH / THÀNH PHỐ — tên cũ, tên mới, cách gõ (4.23.0)
 *
 *  Danh mục tỉnh/thành hiện hành phần mềm vẫn lấy thẳng từ e-GP (lib/areas.js) — tệp này KHÔNG
 *  thay danh mục đó. Nó chỉ giúp người dùng TÌM ĐÚNG TÊN khi gõ:
 *    - tên tỉnh đã nhập vào tỉnh khác từ 1/7/2025 (Nghị quyết 202/2025/QH15: 63 → 34 đơn vị);
 *    - tên cũ, cách viết khác (Thừa Thiên Huế, Đắc Lắc, Sài Gòn, HCM…).
 *  Việc một tỉnh là "Tỉnh" hay "Thành phố" KHÔNG ghi ở đây: Đồng Nai lên thành phố từ 30/4/2026,
 *  Quảng Ninh từ 1/9/2026, Bắc Ninh từ 20/9/2026 — e-GP đổi tên thì phần mềm tự theo.
 *
 *  Mọi hàm đều thuần, kiểm thử trong tests/goi-y-tinh-423.test.mjs.
 * ========================================================================== */

/** Bỏ dấu, về chữ thường, mọi ký tự không phải chữ/số thành một dấu cách. */
export function foldName(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const PREFIX = /^(?:tinh|thanh pho|tp)\s+/;
/** Tên riêng của tỉnh, đã bỏ dấu và bỏ "Tỉnh" / "Thành phố" / "TP." ở đầu. */
export function provinceCore(name) {
  return foldName(name).replace(PREFIX, '').replace(/\s+ma cu$/, '');
}
/** 'city' nếu tên bắt đầu bằng Thành phố / TP, 'province' nếu bắt đầu bằng Tỉnh, '' nếu không ghi. */
export function provinceKind(name) {
  const folded = foldName(name);
  return /^(?:thanh pho|tp)\s/.test(folded) ? 'city' : /^tinh\s/.test(folded) ? 'province' : '';
}

/**
 * Tỉnh cũ → đơn vị nhận sáp nhập (tên riêng). Nghị quyết 202/2025/QH15, hiệu lực 12/6/2025,
 * chính quyền mới hoạt động từ 1/7/2025. 29 tên dưới đây không còn là đơn vị cấp tỉnh.
 */
export const MERGED_2025 = Object.freeze({
  'Hà Giang': 'Tuyên Quang', 'Yên Bái': 'Lào Cai', 'Bắc Kạn': 'Thái Nguyên', 'Vĩnh Phúc': 'Phú Thọ', 'Hòa Bình': 'Phú Thọ',
  'Bắc Giang': 'Bắc Ninh', 'Thái Bình': 'Hưng Yên', 'Hải Dương': 'Hải Phòng', 'Hà Nam': 'Ninh Bình', 'Nam Định': 'Ninh Bình',
  'Quảng Bình': 'Quảng Trị', 'Quảng Nam': 'Đà Nẵng', 'Kon Tum': 'Quảng Ngãi', 'Bình Định': 'Gia Lai', 'Ninh Thuận': 'Khánh Hòa',
  'Đắk Nông': 'Lâm Đồng', 'Bình Thuận': 'Lâm Đồng', 'Phú Yên': 'Đắk Lắk', 'Bình Dương': 'Hồ Chí Minh', 'Bà Rịa - Vũng Tàu': 'Hồ Chí Minh',
  'Bình Phước': 'Đồng Nai', 'Long An': 'Tây Ninh', 'Sóc Trăng': 'Cần Thơ', 'Hậu Giang': 'Cần Thơ', 'Bến Tre': 'Vĩnh Long',
  'Trà Vinh': 'Vĩnh Long', 'Tiền Giang': 'Đồng Tháp', 'Bạc Liêu': 'Cà Mau', 'Kiên Giang': 'An Giang'
});

/** Cách gõ khác của cùng một đơn vị (tên riêng hiện hành → các cách gõ). Không phải sáp nhập. */
export const SPELLINGS = Object.freeze({
  'Hồ Chí Minh': ['HCM', 'Sài Gòn', 'TPHCM'],
  'Huế': ['Thừa Thiên Huế', 'Thừa Thiên - Huế'],
  'Đắk Lắk': ['Đắc Lắc', 'Dak Lak', 'Daklak', 'Đăk Lăk'],
  'Hà Nội': ['HN', 'Thủ đô']
});
/** Cách gõ khác của tên tỉnh CŨ (để gõ "Vũng Tàu", "Đắc Nông" vẫn ra). */
const OLD_SPELLINGS = Object.freeze({ 'Bà Rịa - Vũng Tàu': ['Vũng Tàu', 'Bà Rịa', 'BRVT'], 'Đắk Nông': ['Đắc Nông', 'Dak Nong', 'Đăk Nông'], 'Kon Tum': ['Kontum', 'Công Tum'] });

const MERGED_BY_CORE = new Map(Object.entries(MERGED_2025).map(([old, into]) => [foldName(old), { old, into, intoCore: foldName(into) }]));

/** Tên cũ này đã nhập vào đâu? Trả {old, into, intoCore} hoặc null. Nhận cả "Tỉnh Bình Thuận". */
export function mergedInto(name) {
  return MERGED_BY_CORE.get(provinceCore(name)) || null;
}

/**
 * Danh sách lựa chọn cho ô tỉnh/thành.
 * @param {string[]} current tên hiện hành, đúng như e-GP ghi ("Thành phố Đồng Nai", "Tỉnh Lâm Đồng"…)
 * @param {string[]} [legacy] tên CŨ còn trong danh mục e-GP (chỉ dùng tra hồ sơ trước sáp nhập)
 * @returns {Array<{value:string, core:string, full:string, kind:string, aliases:Array<{name:string, core:string, merged:boolean}>, legacy:boolean, into?:string}>}
 */
export function buildProvinceOptions(current = [], legacy = []) {
  const options = [], byCore = new Map();
  for (const raw of current) {
    const value = String(raw || '').trim(), core = provinceCore(value);
    if (!value || !core || byCore.has(core)) continue;
    const option = { value, core, full: foldName(value), kind: provinceKind(value), aliases: [], legacy: false };
    byCore.set(core, option); options.push(option);
  }
  for (const [old, into] of Object.entries(MERGED_2025)) {
    const target = byCore.get(foldName(into));
    if (!target) continue;
    target.aliases.push({ name: old, core: foldName(old), merged: true });
    for (const other of OLD_SPELLINGS[old] || []) target.aliases.push({ name: old, core: foldName(other), merged: true });
  }
  for (const [name, list] of Object.entries(SPELLINGS)) {
    const target = byCore.get(foldName(name));
    if (target) for (const other of list) target.aliases.push({ name: other, core: foldName(other), merged: false });
  }
  for (const raw of legacy) {
    const value = String(raw || '').trim(), core = provinceCore(value);
    if (!value || !core || byCore.has(core) || options.some((o) => o.legacy && o.core === core)) continue;
    const merged = MERGED_BY_CORE.get(core);
    const into = merged && byCore.get(merged.intoCore);
    options.push({ value, core, full: foldName(value), kind: provinceKind(value), aliases: [], legacy: true, into: into ? into.value : '' });
  }
  return options;
}

/** Khoảng cách sửa chữ (Levenshtein), dừng sớm khi vượt `max`. */
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (row[j] < best) best = row[j];
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/** Điểm khớp của một tên riêng (đã bỏ dấu) với chữ người dùng gõ (đã bỏ dấu). 0 = không khớp. */
export function scoreCore(core, q) {
  if (!q || !core) return 0;
  if (core === q) return 1000;
  if (core.startsWith(q)) return 900 - Math.min(99, core.length - q.length);
  if (` ${core}`.includes(` ${q}`)) return 800;
  if (q.length >= 2 && !q.includes(' ') && core.includes(' ') && core.split(' ').map((w) => w[0]).join('').startsWith(q)) return 700;
  if (q.length >= 2 && core.includes(q)) return 600;
  const words = q.split(' ');
  if (words.length > 1 && words.every((w) => ` ${core}`.includes(` ${w}`))) return 550;
  return 0;
}

/**
 * Xếp hạng tỉnh/thành theo chữ đang gõ.
 *  - Không phân biệt hoa thường, có dấu hay không dấu; "tp", "tỉnh", "thành phố" ở đầu được bỏ qua.
 *  - Chỉ gõ "thành phố" (hoặc "tp", "tỉnh") thì liệt kê cả nhóm.
 *  - Gõ tên tỉnh cũ đã sáp nhập thì ra đơn vị mới, kèm ghi chú; tên cũ còn trong danh mục e-GP
 *    cũng được liệt kê (cuối danh sách) cho người cần tra hồ sơ trước 1/7/2025.
 *  - Gõ sai một, hai chữ vẫn có gợi ý gần đúng khi không còn kết quả nào khác.
 * @returns {Array<{option:object, score:number, via:string, note:string}>}
 */
export function rankProvinces(options, text) {
  const q = foldName(text);
  if (!q) return options.filter((o) => !o.legacy).map((option) => ({ option, score: 1, via: 'all', note: '' }));
  const core = q.replace(PREFIX, '');
  const groupOnly = /^(?:tinh|thanh pho|tp)$/.test(q) ? (q === 'tinh' ? 'province' : 'city') : '';
  const out = [];
  for (const option of options) {
    if (groupOnly) { if (!option.legacy && option.kind === groupOnly) out.push({ option, score: 500, via: 'group', note: '' }); continue; }
    let score = scoreCore(option.core, core), via = 'name', note = '';
    for (const alias of option.aliases) {
      const s = scoreCore(alias.core, core) - 40;
      if (s > score) { score = s; via = alias.merged ? 'merged' : 'spelling'; note = alias.merged ? `gồm tỉnh ${alias.name} cũ (sáp nhập 1/7/2025)` : `còn gọi: ${alias.name}`; }
    }
    // Đang gõ dở chính chữ "thành phố" / "tỉnh": liệt kê nhóm đó sau các tên khớp.
    if (!score && q.length >= 2 && option.full.startsWith(q) && !option.legacy) { score = 400; via = 'group'; }
    if (option.legacy) {
      if (score < 600) continue;
      score -= 300; via = 'legacy';
      note = `tên cũ, chỉ có hồ sơ đăng trước 1/7/2025${option.into ? ` · nay thuộc ${option.into}` : ''}`;
    }
    if (score > 0) out.push({ option, score, via, note });
  }
  if (!out.length && core.length >= 4) {
    const max = core.length >= 8 ? 2 : 1;
    for (const option of options) {
      if (option.legacy) continue;
      const names = [option.core, ...option.aliases.map((a) => a.core)];
      const d = Math.min(...names.map((name) => Math.min(editDistance(name, core, max), editDistance(name.slice(0, core.length), core, max))));
      if (d <= max) out.push({ option, score: 200 - d * 10, via: 'near', note: 'gần đúng với chữ đang gõ' });
    }
  }
  out.sort((a, b) => b.score - a.score);
  // Đã có tên khớp trọn (kể cả qua tên cũ) thì bỏ các tên chỉ khớp lỏng — gõ đủ "hà giang" không kéo theo Hậu Giang.
  return out.length && out[0].score >= 960 ? out.filter((r) => r.score >= 600) : out;
}

/**
 * Xếp hạng một danh sách thường (xã/phường, Ban QLDA…): mọi từ đang gõ đều phải có mặt,
 * không phân biệt dấu; khớp ở đầu tên riêng đứng trước.
 * @param {Array<{value:string, title:string, core:string, full:string, old?:boolean}>} options
 */
export function rankPlain(options, text, limit = 80) {
  const q = foldName(text);
  if (!q) return options.slice(0, limit).map((option) => ({ option, score: 1, via: 'all', note: '' }));
  const words = q.split(' ');
  const kind = (/^(ban|xa|phuong|dac khu|huyen|thi tran|thi xa)\s/.exec(q) || [])[1] || '';
  const out = [];
  for (const option of options) {
    let score = scoreCore(option.core, q);
    if (!score) {
      const stripped = q.replace(WARD_PREFIX, '');
      if (stripped && stripped !== q) score = scoreCore(option.core, stripped);
    }
    if (!score && words.every((w) => ` ${option.full}`.includes(` ${w}`))) score = 450;
    if (!score && q.length >= 2 && option.full.includes(q)) score = 350;
    // Gõ "ban …" là đang tìm Ban QLDA; gõ "xã …" / "phường …" là đang tìm đúng loại đơn vị đó.
    if (score > 0 && kind && option.full.startsWith(`${kind} `)) score += kind === 'ban' ? 300 : 50;
    // Cùng mức khớp thì địa bàn hiện hành đứng trước tên cũ ("Xã Đức Trọng" trước "Huyện Đức Trọng · mã cũ").
    if (score > 0 && option.old) score -= 30;
    if (score > 0) out.push({ option, score, via: 'name', note: '' });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

const WARD_PREFIX = /^(?:xa|phuong|thi tran|dac khu|thi xa|quan|huyen|thanh pho|tp|ban quan ly du an|ban qlda|ban)\s+/;
/** Tên riêng của một xã/phường/đơn vị: bỏ dấu, bỏ "Xã", "Phường", "Đặc khu"… ở đầu. */
export function wardCore(name) {
  return foldName(name).replace(WARD_PREFIX, '');
}

/**
 * Ô nhiều tỉnh ("Lâm Đồng, Đắk Lắk"): tìm đoạn đang gõ quanh con trỏ.
 * Dấu ngăn cách giống lib/workspace.js: ; | xuống dòng, và dấu phẩy không đứng trước chữ số.
 */
export function tokenAt(value, caret, multi = true) {
  const text = String(value ?? '');
  if (!multi) return { start: 0, end: text.length, query: text.trim() };
  const at = clamp(Number.isFinite(caret) ? caret : text.length, 0, text.length);
  const isSep = (i) => /[;|\n]/.test(text[i]) || (text[i] === ',' && !/^\s*\d/.test(text.slice(i + 1)));
  let start = 0, end = text.length;
  for (let i = at - 1; i >= 0; i--) if (isSep(i)) { start = i + 1; break; }
  for (let i = at; i < text.length; i++) if (isSep(i)) { end = i; break; }
  return { start, end, query: text.slice(start, end).trim() };
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Thay đoạn đang gõ bằng tên đã chọn. Trả về chuỗi mới và vị trí con trỏ. */
export function applyPick(value, range, picked, multi = true) {
  if (!multi) return { value: picked, caret: picked.length };
  const text = String(value ?? '');
  const before = text.slice(0, range.start).replace(/\s+$/, ''), after = text.slice(range.end).replace(/^\s+/, '');
  const head = before ? `${before} ${picked}` : picked;
  return { value: head + after, caret: head.length };
}

/**
 * Đánh dấu phần khớp trong tên hiển thị (để in đậm). Trả về [trước, khớp, sau]; không tìm thấy
 * thì [tên, '', '']. So trên bản đã bỏ dấu nhưng cắt trên bản gốc.
 */
export function highlightParts(label, text) {
  const source = String(label ?? '');
  const q = foldName(text).replace(PREFIX, '').replace(WARD_PREFIX, '');
  if (!q) return [source, '', ''];
  // Bỏ dấu từng ký tự và nhớ ký tự gốc của từng vị trí.
  let folded = ''; const origin = [];
  for (let i = 0; i < source.length; i++) {
    const f = source[i].normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]/g, ' ');
    for (const ch of f) { folded += ch; origin.push(i); }
  }
  let at = ` ${folded}`.indexOf(` ${q}`);
  if (at < 0) at = folded.indexOf(q);
  if (at < 0) return [source, '', ''];
  const from = origin[at], to = origin[Math.min(origin.length - 1, at + q.length - 1)] + 1;
  return [source.slice(0, from), source.slice(from, to), source.slice(to)];
}
