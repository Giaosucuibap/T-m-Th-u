/* ============================================================================
 *  HỒ SƠ QUYẾT ĐỊNH GÓI THẦU (4.22.0)
 *  lib/competition.js · lib/hsmt-ai.js · lib/runtime-hsmt.js · lib/print.js
 *
 *  Khoá: số liệu cạnh tranh chỉ lấy đúng chủ đầu tư của gói, không tính chính gói đang
 *  xét, mỗi gói một lần, dưới 5 mẫu thì KHÔNG đưa trung vị; không có chữ "xác suất" ngoài
 *  câu phủ định. Câu lệnh cho AI ép trích nguyên văn; đọc câu trả lời chịu được rào ```json,
 *  dấu phẩy thừa, số viết có dấu chấm; bảng đối chiếu so đúng số đã khai và không tự cho
 *  "đạt" khi thiếu dữ liệu. Bản in không còn nút, ô nhập, script.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { competitionBrief, competitionLines, sameInvestor, COMPETITION_NOTE } from '../GiaoSuCuiBap/lib/competition.js';
import { buildHsmtPrompt, parseHsmtAnswer, normalizeHsmtRead, denormalize, matchRequirements, safeHsmtReads, MATCH_STATUS, HSMT_GROUPS, HSMT_AI_NOTE, HSMT_MAX_READS } from '../GiaoSuCuiBap/lib/hsmt-ai.js';
import { createHsmtRuntime } from '../GiaoSuCuiBap/lib/runtime-hsmt.js';
import { normalizeCapability } from '../GiaoSuCuiBap/lib/capability.js';
import { sanitizeBackupFeatures } from '../GiaoSuCuiBap/lib/backup.js';
import { printStamp } from '../GiaoSuCuiBap/lib/print.js';

const read = (f) => fs.readFileSync(new URL(`../GiaoSuCuiBap/${f}`, import.meta.url), 'utf8');
const CDT = 'Ban QLDA đầu tư xây dựng huyện Đức Trọng';
const TENDER = { key: 'IB2600455010-00', notifyNo: 'IB2600455010', bidName: 'Thi công kênh N1 hồ Đạ Tẻh', investorName: CDT, price: 5e9 };
const OWN = '5800000999', R1 = '5800000111', R2 = '5800000222';
function pack(no, bidders, winner, discount, at = '2026-05-01T02:00:00Z', investor = CDT) {
  const rows = bidders.map((tax) => ({ source: 'bbmt', notifyNo: no, bidName: `Gói ${no}`, investorName: investor, taxCode: tax, contractorName: `Cty ${tax}`, bidderCount: bidders.length, won: null, at }));
  if (winner) rows.push({ source: 'kqlcnt', notifyNo: no, bidName: `Gói ${no}`, investorName: investor, taxCode: `vn${winner}`, contractorName: `Công ty TNHH ${winner}`, won: true, discountPercent: discount, at });
  return rows;
}

test('cùng chủ đầu tư: trùng mã, trùng tên không dấu, tên chứa trọn tên kia; tên ngắn không ghép bừa', () => {
  assert.equal(sameInvestor({ investorCode: 'vnz001' }, { investorCode: 'VNZ001' }), true);
  assert.equal(sameInvestor({ investorCode: 'a', investorName: CDT }, { investorCode: 'b', investorName: CDT }), false, 'có mã thì tin mã');
  assert.equal(sameInvestor({ investorName: 'BAN QLDA ĐẦU TƯ XÂY DỰNG HUYỆN ĐỨC TRỌNG' }, { investorName: CDT }), true);
  assert.equal(sameInvestor({ investorName: `${CDT} tỉnh Lâm Đồng` }, { investorName: CDT }), true);
  assert.equal(sameInvestor({ investorName: 'UBND xã' }, { investorName: 'UBND xã Tà Nung' }), false);
  assert.equal(sameInvestor({ investorName: '' }, { investorName: CDT }), false);
});

test('đủ mẫu: trung vị số nhà thầu, tỷ lệ một nhà thầu, mức giảm của người trúng, nhà thầu hay gặp, lịch sử của công ty', () => {
  const observations = [
    ...pack('IB2600000001', [R1, R2, OWN], R1, 4.2), ...pack('IB2600000002', [R1], R1, 0.5), ...pack('IB2600000003', [R1, R2], R2, 6.0),
    ...pack('IB2500000004', [R1, R2, OWN], OWN, 5.1, '2025-06-01T02:00:00Z'), ...pack('IB2500000005', [R2, OWN], R2, 3.3, '2025-08-01T02:00:00Z'),
    ...pack('IB2600455010', [R1, R2], null, null),                                  // chính gói đang xét: không tính
    ...pack('IB2600000099', [R1], R1, 9.9, '2026-05-01T02:00:00Z', 'UBND xã Tà Nung')  // chủ đầu tư khác: không tính
  ];
  const b = competitionBrief({ tender: TENDER, observations, ownTaxCode: `vn${OWN}` });
  assert.equal(b.level, 'du');
  assert.equal(b.packages, 5);
  assert.deepEqual(b.period, { from: 2025, to: 2026 });
  assert.equal(b.bidders.n, 5); assert.equal(b.bidders.median, 2); assert.equal(b.bidders.single, 1); assert.equal(b.bidders.singleShare, 20);
  assert.equal(b.discount.n, 5); assert.equal(b.discount.median, 4.2);
  assert.deepEqual(b.frequent.map((f) => [f.taxCode, f.packages, f.wins]), [[R1, 4, 2], [R2, 4, 2]]);
  assert.equal(b.frequent[0].name, `Công ty TNHH ${R1}`, 'lấy tên đầy đủ nhất');
  assert.deepEqual(b.own, { taxCode: OWN, packages: 3, wins: 1 });
  assert.ok(!b.frequent.some((f) => f.taxCode === OWN), 'công ty mình không nằm trong bảng đối thủ');
  const lines = competitionLines(b).join(' ');
  assert.match(lines, /Trung vị 2 nhà thầu dự một gói \(5 gói/);
  assert.match(lines, /giảm trung vị 4,2%/);
  assert.match(lines, /có trong 3 gói của chủ đầu tư này trong kho, trong đó 1 gói ghi là trúng/);
});

test('ít mẫu hoặc không có: không đưa trung vị, nói rõ là chưa đủ; không bao giờ gọi là xác suất', () => {
  const few = competitionBrief({ tender: TENDER, observations: [...pack('IB2600000001', [R1, R2], R1, 4.2), ...pack('IB2600000002', [R1], R1, 0.5)] });
  assert.equal(few.level, 'it');
  assert.equal(few.bidders.reliable, false); assert.equal(few.bidders.singleShare, null); assert.equal(few.discount.reliable, false);
  const text = competitionLines(few).join(' ');
  assert.match(text, /dưới 5 gói thì chỉ nên coi là tham khảo/);
  assert.doesNotMatch(text, /Trung vị \d/);
  assert.equal(few.own, null);
  const none = competitionBrief({ tender: TENDER, observations: [] });
  assert.equal(none.level, 'khong');
  assert.match(competitionLines(none)[0], /Chưa có gói nào của chủ đầu tư này trong kho/);
  assert.match(COMPETITION_NOTE, /KHÔNG phải xác suất trúng thầu/);
  assert.doesNotMatch(read('lib/competition.js').replace(/KHÔNG (tính|phải) "?xác suất[^\n]*/g, ''), /xác suất/i, 'chỉ nhắc "xác suất" trong câu phủ định');
  // Mức giảm giá vô lý (dữ liệu lỗi) không được tính.
  const odd = competitionBrief({ tender: TENDER, observations: pack('IB2600000007', [R1], R1, 250) });
  assert.equal(odd.discount.n, 0);
});

const ANSWER = `Dưới đây là kết quả trích xuất:
\`\`\`json
{
  "phien_ban": 1,
  "goi_thau": { "ten": "Thi công kênh N1", "ma_tbmt": "IB2600455010-00", "chu_dau_tu": "Ban QLDA" },
  "tom_tat": "Thi công 3 km kênh bê tông N1 thuộc hồ Đạ Tẻh.",
  "moc_thoi_gian": { "thoi_gian_thuc_hien_ngay": 240, "hieu_luc_hsdt_ngay": 90 },
  "bao_dam_du_thau": { "gia_tri_dong": "75.000.000", "hinh_thuc": "Thư bảo lãnh", "hieu_luc_ngay": 120, "trich": "Giá trị bảo đảm dự thầu: 75.000.000 VND", "muc": "BDL 19.1" },
  "yeu_cau": [
    { "nhom": "tai_chinh", "noi_dung": "Doanh thu bình quân hằng năm của 3 năm gần nhất", "gia_tri_dong": 12000000000, "so_nam": 3, "trich": "tối thiểu 12.000.000.000 VND", "muc": "Chương III, 2.1" },
    { "nhom": "tai_chinh", "noi_dung": "Nguồn lực tài chính cho gói thầu", "gia_tri_dong": 9000000000, "trich": "tối thiểu 9 tỷ đồng", "muc": "Chương III, 2.2" },
    { "nhom": "tai_chinh", "noi_dung": "Giá trị tài sản ròng năm gần nhất phải dương", "trich": "phải dương", "muc": "Chương III, 2.3" },
    { "nhom": "kinh_nghiem", "noi_dung": "Hợp đồng tương tự đã hoàn thành", "gia_tri_dong": 3500000000, "so_luong": 2, "so_nam": 5, "trich": "02 hợp đồng tương tự", "muc": "Chương III, 3" },
    { "nhom": "nhan_su", "noi_dung": "Chỉ huy trưởng công trường: kỹ sư thủy lợi, 5 năm kinh nghiệm", "so_luong": 1, "trich": "01 chỉ huy trưởng", "muc": "Mẫu 06A" },
    { "nhom": "nhan_su", "noi_dung": "Cán bộ an toàn lao động", "so_luong": 1 },
    { "nhom": "thiet_bi", "noi_dung": "Máy đào dung tích gầu ≥ 0,8 m3", "so_luong": 2, "trich": "02 máy đào ≥ 0,8 m3", "muc": "Mẫu 06D" },
    { "nhom": "khong_co_nhom_nay", "noi_dung": "Cam kết bảo vệ môi trường", "trich": "nhà thầu phải cam kết" },
  ],
  "dieu_khoan_hop_dong": [ { "loai": "tam_ung", "noi_dung": "Tạm ứng 20% giá hợp đồng", "trich": "tạm ứng 20%", "muc": "ĐKCT 35.1" }, { "loai": "la", "noi_dung": "Điều khoản khác" } ],
  "tieu_chi_danh_gia": [ { "noi_dung": "Đánh giá kỹ thuật theo đạt / không đạt", "trich": "đạt, không đạt", "muc": "Chương III, 4" } ],
  "rui_ro": [ "Tiến độ 240 ngày qua mùa mưa" ],
  "chua_ro": [ "Không thấy điều khoản phạt chậm tiến độ" ]
}
\`\`\`
Bạn cần tôi giải thích thêm không?`;

test('câu lệnh cho AI: có thông tin gói, ép trích nguyên văn, cấm đoán, đúng mẫu JSON đọc lại được', () => {
  const prompt = buildHsmtPrompt(TENDER);
  assert.match(prompt, /Thi công kênh N1 hồ Đạ Tẻh/);
  assert.match(prompt, /IB2600455010/);
  assert.match(prompt, /5\.000\.000\.000 đồng/);
  assert.match(prompt, /NGUYÊN VĂN/);
  assert.match(prompt, /KHÔNG bịa/);
  assert.match(prompt, /DUY NHẤT một khối ```json/);
  for (const g of HSMT_GROUPS) assert.ok(prompt.includes(g.id), g.id);
  // Chính mẫu trong câu lệnh phải là JSON hợp lệ theo bộ đọc (AI sẽ bắt chước nó).
  const sample = prompt.match(/```json\n([\s\S]*?)```/)[1];
  assert.doesNotThrow(() => JSON.parse(sample));
  assert.ok(normalizeHsmtRead(JSON.parse(sample)));
  assert.ok(buildHsmtPrompt({}).length > 500, 'thiếu thông tin gói vẫn ra câu lệnh');
});

test('đọc câu trả lời: rào ```json, lời dẫn trước sau, dấu phẩy thừa, số có dấu chấm, nhóm lạ → Khác', () => {
  const r = parseHsmtAnswer(ANSWER, TENDER);
  assert.equal(r.ok, true);
  assert.equal(r.read.bond.value, 75_000_000);
  assert.equal(r.read.durationDays, 240);
  assert.equal(r.read.requirements.length, 8);
  assert.equal(r.read.requirements[7].group, 'khac');
  assert.equal(r.read.terms[1].kind, 'khac');
  assert.match(r.warnings.join(' '), /1 yêu cầu không có câu trích/);
  assert.match(r.warnings.join(' '), /1 điểm không tìm thấy/);
  assert.doesNotMatch(r.warnings.join(' '), /khác gói đang xem/);
  assert.match(parseHsmtAnswer(ANSWER, { notifyNo: 'IB2600999999' }).warnings.join(' '), /IB2600455010\) khác gói đang xem \(IB2600999999/);
  // Không có rào: lấy từ dấu { đầu tới dấu } cuối.
  assert.equal(parseHsmtAnswer('Kết quả: {"tom_tat":"Một gói thầu nhỏ ở Lâm Đồng","yeu_cau":[]} hết.').ok, true);
  for (const bad of ['', 'ngắn', 'Xin lỗi, tôi không đọc được tệp đính kèm của bạn.', '```json\n{"a":1}\n```', '{"tom_tat": ', 'x'.repeat(400_001)]) assert.equal(parseHsmtAnswer(bad).ok, false, bad.slice(0, 30));
  // Chuẩn hoá lặp lại không đổi (đường nạp từ kho / bản sao lưu).
  assert.deepEqual(normalizeHsmtRead(denormalize(r.read)), r.read);
  // Chuỗi quá dài, ký tự điều khiển, mảng quá lớn bị cắt.
  const huge = normalizeHsmtRead({ tom_tat: `a\u0000b${'x'.repeat(5000)}`, yeu_cau: Array.from({ length: 300 }, (_, i) => ({ nhom: 'khac', noi_dung: `Yêu cầu ${i}` })) });
  assert.equal(huge.summary.length, 1500); assert.ok(!huge.summary.includes('\u0000')); assert.equal(huge.requirements.length, 80);
});

test('bảng đối chiếu: so đúng số đã khai; thiếu dữ liệu thì ghi "chưa có", không tự cho đạt', () => {
  const { read: data } = parseHsmtAnswer(ANSWER, TENDER);
  const capability = normalizeCapability({ avgRevenue: 15e9, liquidAssets: 6e9, staff: ['Chỉ huy trưởng: KS thủy lợi Nguyễn Văn A, 12 năm'], equipment: ['máy đào 0,8 m3 x 3', 'lu rung 25T'], taxCode: OWN });
  const contracts = [{ name: 'Kênh chính hồ Ka La', workType: 'thuy-loi', price: 4e9, year: 2024 }, { name: 'Nạo vét kênh Đạ Tẻh', workType: 'thuy-loi', price: 3.6e9, year: 2023 },
    { name: 'Kênh cũ', workType: 'thuy-loi', price: 9e9, year: 2015 }, { name: 'Trường tiểu học', workType: 'dan-dung', price: 8e9, year: 2025 }];
  const m = matchRequirements(data, { capability, contracts, tender: TENDER, now: Date.parse('2026-11-11T03:00:00Z') });
  const by = (needle) => m.rows.find((r) => r.text.includes(needle));
  assert.equal(by('Doanh thu').status, 'dat'); assert.match(by('Doanh thu').note, /dư 3\.000\.000\.000 đ/);
  assert.equal(by('Nguồn lực').status, 'thieu'); assert.match(by('Nguồn lực').note, /thiếu 3\.000\.000\.000 đ/);
  assert.equal(by('tài sản ròng').status, 'tu-doi-chieu'); assert.match(by('tài sản ròng').company, /không giữ số liệu này/);
  assert.equal(by('Hợp đồng tương tự').status, 'dat'); assert.match(by('Hợp đồng tương tự').company, /2 hợp đồng đã khai khớp/);
  assert.doesNotMatch(by('Hợp đồng tương tự').company, /Kênh cũ|Trường tiểu học/, 'quá 5 năm hoặc khác loại việc thì không tính');
  assert.equal(by('Chỉ huy trưởng').status, 'tu-doi-chieu'); assert.match(by('Chỉ huy trưởng').company, /Nguyễn Văn A/);
  assert.equal(by('an toàn lao động').status, 'chua-co');
  assert.equal(by('Máy đào').status, 'tu-doi-chieu'); assert.match(by('Máy đào').company, /máy đào 0,8 m3 x 3/); assert.match(by('Máy đào').note, /yêu cầu 2/);
  assert.equal(by('môi trường').status, 'tu-doi-chieu');
  assert.deepEqual(m.summary, { dat: 2, thieu: 1, tu: 4, chua: 1, total: 8 });
  for (const r of m.rows) assert.ok(MATCH_STATUS[r.status]);
  // Chưa khai gì: không dòng nào được "đạt".
  const empty = matchRequirements(data, { capability: normalizeCapability({}), contracts: [], tender: TENDER });
  assert.equal(empty.summary.dat, 0);
  assert.equal(empty.rows.find((r) => r.text.includes('Doanh thu')).status, 'chua-co');
  assert.equal(empty.rows.find((r) => r.text.includes('Hợp đồng tương tự')).status, 'chua-co');
  // Thiếu hợp đồng: ghi rõ có bao nhiêu trên bao nhiêu.
  const one = matchRequirements(data, { capability, contracts: contracts.slice(0, 1), tender: TENDER, now: Date.parse('2026-11-11T03:00:00Z') });
  assert.equal(one.rows.find((r) => r.text.includes('Hợp đồng tương tự')).status, 'thieu');
  assert.match(one.rows.find((r) => r.text.includes('Hợp đồng tương tự')).company, /Mới có 1\/2 hợp đồng khớp/);
  assert.match(HSMT_AI_NOTE, /AI có thể đọc sai/);
});

test('năng lực công ty: ba số mới được chuẩn hoá; để trống là 0, không đoán', () => {
  const c = normalizeCapability({ taxCode: 'vn5800000999-001', avgRevenue: '45000000000', liquidAssets: -5 });
  assert.equal(c.taxCode, OWN); assert.equal(c.avgRevenue, 45e9); assert.equal(c.liquidAssets, 0);
  assert.deepEqual([normalizeCapability({}).taxCode, normalizeCapability({}).avgRevenue], ['', 0]);
  const html = read('capability.html');
  for (const id of ['taxCode', 'avgRevenue', 'liquidAssets']) assert.match(html, new RegExp(`id="${id}"`));
});

test('kho bản đọc: lưu theo gói, cảnh báo đi kèm, xoá được; khoá lạ bị từ chối; sao lưu giữ được bản đọc', async () => {
  let s = { tenders: [TENDER], hsmtReads: {} };
  const rt = createHsmtRuntime({ getState: async () => s, save: async (v) => { s = { ...s, ...v }; }, withLock: async (fn) => fn(), KEYS: { hsmtReads: 'hsmtReads' }, now: () => Date.parse('2026-11-11T03:00:00Z') });
  assert.equal((await rt.saveAnswer({ key: '__proto__', answer: ANSWER })).ok, false);
  assert.equal((await rt.saveAnswer({ key: TENDER.key, answer: 'không phải json' })).ok, false);
  assert.deepEqual(s.hsmtReads, {}, 'câu trả lời hỏng không ghi gì vào kho');
  const saved = await rt.saveAnswer({ key: TENDER.key, answer: ANSWER, source: ' ChatGPT ' });
  assert.equal(saved.ok, true); assert.equal(saved.entry.source, 'ChatGPT'); assert.equal(saved.warnings.length, 2);
  assert.equal((await rt.get({ key: TENDER.key })).entry.read.requirements.length, 8);
  assert.equal((await rt.get({ key: 'IB-khong-co' })).entry, null);
  const backup = sanitizeBackupFeatures(s);
  assert.equal(backup.hsmtReads[TENDER.key].read.bond.value, 75_000_000);
  assert.deepEqual(safeHsmtReads(backup.hsmtReads), backup.hsmtReads, 'nạp lại từ bản sao lưu không đổi nội dung');
  assert.equal((await rt.remove({ key: TENDER.key })).removed, true);
  assert.deepEqual(s.hsmtReads, {});
  const many = Object.fromEntries(Array.from({ length: HSMT_MAX_READS + 20 }, (_, i) => [`IB${i}`, { savedAt: new Date(Date.parse('2026-01-01') + i * 1000).toISOString(), read: saved.entry.read }]));
  assert.equal(Object.keys(safeHsmtReads(many)).length, HSMT_MAX_READS);
  assert.ok(safeHsmtReads(many)[`IB${HSMT_MAX_READS + 19}`], 'giữ bản mới nhất');
});

test('trang và nối dây: có trong Kho gói và thẻ Tìm gói; lệnh đã đăng ký; có nút in; ghi rõ phần mềm không tự gọi AI', () => {
  const html = read('brief.html'), js = read('brief.js'), bg = read('background.js'), handlers = read('lib/handlers/insight.js');
  assert.match(html, /<main id="main" data-print="Hồ sơ quyết định gói thầu">/);
  assert.match(read('dashboard.js'), /href="brief\.html\?key=\$\{encodeURIComponent\(tender\.key\)\}"/);
  assert.match(read('search.js'), /href="brief\.html\?key=\$\{encodeURIComponent\(t\.key\)\}" data-brief/);
  for (const type of ['GET_HSMT_READ', 'SAVE_HSMT_READ', 'DELETE_HSMT_READ']) assert.match(handlers, new RegExp(`${type}:`));
  assert.match(bg, /insightHandlers\(\{rivalRuntime,hsmtRuntime\}\)/);
  assert.match(bg, /\[KEYS\.hsmtReads\]:clean\.hsmtReads/);
  assert.match(js, /không tự gửi hồ sơ đi đâu và không cần khoá API/);
  assert.match(js, /không phải xác suất trúng thầu/);
  assert.doesNotMatch(js + read('lib/hsmt-ai.js') + read('lib/runtime-hsmt.js'), /fetch\(|XMLHttpRequest|api\.openai|anthropic\.com|googleapis/, 'không có lời gọi mạng tới dịch vụ AI');
  assert.match(read('shell.js'), /main\.hasAttribute\('data-print'\)/);
  assert.match(read('theme.css'), /@media print\{/);
  assert.match(printStamp(Date.parse('2026-11-11T03:05:00Z')), /^11\/11\/2026 10:05$/);
});
