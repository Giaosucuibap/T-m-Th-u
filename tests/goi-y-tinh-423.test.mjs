/* ============================================================================
 *  4.23.0 — Ô GỢI Ý TỈNH / THÀNH PHỐ, XÃ / PHƯỜNG (lib/province-names.js)
 *
 *  Lỗi thấy trên iPad thật ngày 21/11/2026: gõ "thành phố đồng" để tìm Đồng Nai mà không có
 *  gợi ý. Danh mục không cũ (e-GP đã ghi "Thành phố Đồng Nai", ghi lại ngày 10/11/2026: mã 75
 *  hiện hành, mã 713 "Tỉnh Đồng Nai" là tên cũ); lỗi ở danh sách gợi ý có sẵn của trình duyệt.
 *  Bài này kiểm phần xếp hạng của danh sách riêng: hàm thuần, chạy ở mọi máy CI.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { foldName, provinceCore, provinceKind, MERGED_2025, mergedInto, buildProvinceOptions, rankProvinces, rankPlain, wardCore,
  tokenAt, applyPick, highlightParts, editDistance, scoreCore } from '../GiaoSuCuiBap/lib/province-names.js';
import { ORGANIZATION_DIRECTORY } from '../GiaoSuCuiBap/lib/organization-directory-data.js';
import { legacyProvinceNames, currentProvinceNames, provinceCodesByName } from '../GiaoSuCuiBap/lib/areas.js';
import { splitProvinceNames } from '../GiaoSuCuiBap/lib/workspace.js';

/* 34 tên hiện hành đúng như phần mềm đang hiển thị (danh bạ đã rà ngày 5/10/2026), cộng vài tên cũ. */
const CURRENT = ORGANIZATION_DIRECTORY.provinces;
const LEGACY = ['Tỉnh Bình Phước', 'Tỉnh Bình Thuận', 'Tỉnh Đắk Nông', 'Tỉnh Thừa Thiên Huế'];
const OPTIONS = buildProvinceOptions(CURRENT, LEGACY);
const top = (text, n = 1) => rankProvinces(OPTIONS, text).slice(0, n).map((r) => r.option.value);
const first = (text) => rankProvinces(OPTIONS, text)[0];

test('Danh mục thử có đủ 34 đơn vị hiện hành, trong đó 9 thành phố (Đồng Nai từ 30/4/2026, Quảng Ninh 1/9/2026, Bắc Ninh 20/9/2026)', () => {
  assert.equal(CURRENT.length, 34);
  const cities = OPTIONS.filter((o) => !o.legacy && o.kind === 'city').map((o) => o.value).sort();
  assert.deepEqual(cities, ['Thành phố Bắc Ninh', 'Thành phố Cần Thơ', 'Thành phố Huế', 'Thành phố Hà Nội', 'Thành phố Hải Phòng', 'Thành phố Hồ Chí Minh', 'Thành phố Quảng Ninh', 'Thành phố Đà Nẵng', 'Thành phố Đồng Nai'].sort());
  assert.equal(OPTIONS.filter((o) => !o.legacy && o.kind === 'province').length, 25);
});

test('ĐÚNG CHUỖI TRONG ẢNH iPad: gõ "thành phố đồng" (chữ thường) ra Thành phố Đồng Nai đứng đầu', () => {
  const list = top('thành phố đồng', 3);
  assert.equal(list[0], 'Thành phố Đồng Nai');
  assert.ok(list.includes('Tỉnh Đồng Tháp'), 'Đồng Tháp cũng khớp chữ "đồng" — dù gõ "thành phố", tên riêng mới là thứ được so');
  // Danh sách có sẵn của trình duyệt trên iPad lúc đó vẫn hiện ba tên này; ở đây chúng không được lọt vào đầu.
  for (const wrong of ['Thành phố Bắc Ninh', 'Thành phố Cần Thơ', 'Thành phố Đà Nẵng']) assert.ok(!list.includes(wrong), `${wrong} không khớp "đồng"`);
});

test('Hoa hay thường, có dấu hay không dấu, có "tỉnh" / "tp" / "thành phố" hay không: cùng một kết quả', () => {
  for (const text of ['Đồng Nai', 'đồng nai', 'ĐỒNG NAI', 'dong nai', 'Dong Nai', 'tp đồng nai', 'TP. Đồng Nai', 'thành phố đồng nai', 'thanh pho dong nai', 'tỉnh đồng nai', '  đồng   nai ']) {
    assert.equal(top(text)[0], 'Thành phố Đồng Nai', `gõ ${JSON.stringify(text)}`);
    assert.equal(first(text).score, 1000, `gõ ${JSON.stringify(text)} là khớp trọn tên`);
  }
  assert.equal(top('lam dong')[0], 'Tỉnh Lâm Đồng');
  assert.equal(top('đà nẵ')[0], 'Thành phố Đà Nẵng');
  assert.equal(top('da n')[0], 'Thành phố Đà Nẵng');
});

test('Gõ dở: vài chữ đầu của tên, hoặc một từ giữa tên, đều ra', () => {
  assert.deepEqual(top('đồng', 2), ['Thành phố Đồng Nai', 'Tỉnh Đồng Tháp']);
  assert.ok(top('ninh', 6).includes('Tỉnh Ninh Bình'));
  assert.ok(top('ninh', 6).includes('Thành phố Quảng Ninh'), 'từ "Ninh" đứng giữa tên vẫn khớp');
  assert.equal(top('quang')[0].replace(/^(Tỉnh|Thành phố) /, '').split(' ')[0], 'Quảng');
  // "quang": ba tên bắt đầu bằng Quảng, Tuyên Quang (từ thứ hai), và Đà Nẵng vì đã nhận tỉnh Quảng Nam cũ.
  assert.deepEqual(rankProvinces(OPTIONS, 'quang').map((r) => r.option.value).sort(), ['Thành phố Quảng Ninh', 'Thành phố Đà Nẵng', 'Tỉnh Quảng Ngãi', 'Tỉnh Quảng Trị', 'Tỉnh Tuyên Quang'].sort());
  assert.deepEqual(rankProvinces(OPTIONS, 'quang').slice(0, 3).map((r) => r.option.value).sort(), ['Thành phố Quảng Ninh', 'Tỉnh Quảng Ngãi', 'Tỉnh Quảng Trị'].sort(), 'ba tên bắt đầu bằng Quảng đứng trước');
});

test('Chỉ gõ "thành phố" / "tp" thì liệt kê đủ 9 thành phố; chỉ gõ "tỉnh" thì đủ 25 tỉnh; gõ dở chữ "thành ph" cũng vậy', () => {
  for (const text of ['thành phố', 'tp', 'TP.', 'thanh pho']) {
    const list = rankProvinces(OPTIONS, text);
    assert.equal(list.length, 9, text);
    assert.ok(list.every((r) => r.option.kind === 'city'), text);
  }
  assert.equal(rankProvinces(OPTIONS, 'tỉnh').length, 25);
  const partial = rankProvinces(OPTIONS, 'thành ph');
  assert.equal(partial.length, 9);
  // "thanh" vừa là đầu của Thanh Hóa vừa là đầu chữ "thành phố": tên riêng đứng trước, rồi tới cả nhóm.
  const thanh = rankProvinces(OPTIONS, 'thanh').map((r) => r.option.value);
  assert.equal(thanh[0], 'Tỉnh Thanh Hóa');
  assert.equal(thanh.length, 10);
});

test('Để trống thì hiện đủ 34 đơn vị hiện hành theo đúng thứ tự danh mục, không lẫn tên cũ', () => {
  const all = rankProvinces(OPTIONS, '');
  assert.equal(all.length, 34);
  assert.deepEqual(all.map((r) => r.option.value), CURRENT);
  assert.ok(all.every((r) => !r.option.legacy));
});

test('Tên tỉnh CŨ đã sáp nhập (NQ 202/2025/QH15): ra đơn vị mới kèm ghi chú; tên cũ còn trong danh mục e-GP xếp sau, ghi rõ chỉ có hồ sơ trước 1/7/2025', () => {
  const list = rankProvinces(OPTIONS, 'bình phước');
  assert.equal(list[0].option.value, 'Thành phố Đồng Nai');
  assert.equal(list[0].via, 'merged');
  assert.match(list[0].note, /gồm tỉnh Bình Phước cũ \(sáp nhập 1\/7\/2025\)/);
  assert.equal(list[1].option.value, 'Tỉnh Bình Phước');
  assert.equal(list[1].option.legacy, true);
  assert.match(list[1].note, /tên cũ, chỉ có hồ sơ đăng trước 1\/7\/2025 · nay thuộc Thành phố Đồng Nai/);
  assert.equal(top('binh thuan')[0], 'Tỉnh Lâm Đồng');
  assert.equal(top('dak nong')[0], 'Tỉnh Lâm Đồng');
  assert.equal(top('ninh thuận')[0], 'Tỉnh Khánh Hòa');
  assert.equal(top('quảng nam')[0], 'Thành phố Đà Nẵng');
  assert.equal(top('hải dương')[0], 'Thành phố Hải Phòng');
  assert.equal(top('long an')[0], 'Tỉnh Tây Ninh');
  assert.equal(top('vũng tàu')[0], 'Thành phố Hồ Chí Minh');
  assert.equal(top('bình dương')[0], 'Thành phố Hồ Chí Minh');
  // Tên cũ không có trong danh mục e-GP đang dùng thì chỉ ra đơn vị mới, không bịa thêm lựa chọn.
  assert.deepEqual(rankProvinces(OPTIONS, 'hà giang').map((r) => r.option.value), ['Tỉnh Tuyên Quang']);
  // Đang gõ dở "ha gi" thì chưa biết Hà Giang hay Hậu Giang: cả hai đơn vị nhận sáp nhập đều được gợi ý.
  assert.deepEqual(rankProvinces(OPTIONS, 'ha gi').map((r) => r.option.value).sort(), ['Thành phố Cần Thơ', 'Tỉnh Tuyên Quang'].sort());
});

test('Bảng sáp nhập 2025 đủ 29 tỉnh cũ, đích đến đều là đơn vị hiện hành, không tên nào vừa cũ vừa mới', () => {
  assert.equal(Object.keys(MERGED_2025).length, 29);
  const current = new Set(CURRENT.map(provinceCore));
  for (const [old, into] of Object.entries(MERGED_2025)) {
    assert.ok(current.has(foldName(into)), `${old} → ${into}: đích phải có trong danh mục hiện hành`);
    assert.ok(!current.has(foldName(old)), `${old} không còn là đơn vị cấp tỉnh`);
  }
  // 63 tỉnh thành trước sáp nhập = 34 hiện hành + 29 đã nhập vào tỉnh khác.
  assert.equal(current.size + Object.keys(MERGED_2025).length, 63);
  assert.deepEqual(mergedInto('Tỉnh Bình Thuận'), { old: 'Bình Thuận', into: 'Lâm Đồng', intoCore: 'lam dong' });
  assert.equal(mergedInto('Lâm Đồng'), null);
  assert.equal(mergedInto('Thành phố Đồng Nai'), null);
});

test('Viết tắt và tên gọi khác: hcm, tphcm, sài gòn, daklak, thừa thiên huế', () => {
  for (const text of ['hcm', 'HCM', 'tp hcm', 'tp.hcm', 'tphcm', 'sài gòn', 'sai gon', 'ho chi minh', 'hồ chí m']) assert.equal(top(text)[0], 'Thành phố Hồ Chí Minh', text);
  for (const text of ['daklak', 'dak lak', 'đắc lắc', 'đắk lắk', 'Đăk Lăk']) assert.equal(top(text)[0], 'Tỉnh Đắk Lắk', text);
  assert.equal(top('thừa thiên huế')[0], 'Thành phố Huế');
  assert.equal(top('hue')[0], 'Thành phố Huế');
  assert.equal(top('hn')[0], 'Thành phố Hà Nội');
  // Chữ cái đầu của từng từ: "dn" ra cả Đồng Nai lẫn Đà Nẵng, không đoán thay người dùng.
  assert.deepEqual(top('dn', 2).sort(), ['Thành phố Đà Nẵng', 'Thành phố Đồng Nai'].sort());
});

test('Gõ sai một chữ vẫn có gợi ý gần đúng (chỉ khi không còn kết quả nào khác); gõ vô nghĩa thì không bịa', () => {
  const near = rankProvinces(OPTIONS, 'dong nia');
  assert.ok(near.length >= 1 && near[0].via === 'near');
  assert.ok(near.some((r) => r.option.value === 'Thành phố Đồng Nai'));
  assert.equal(top('khanh hoà')[0], 'Tỉnh Khánh Hòa');           // hai cách bỏ dấu "oà" / "òa" cho cùng kết quả
  assert.equal(top('lam dog')[0], 'Tỉnh Lâm Đồng');
  assert.deepEqual(rankProvinces(OPTIONS, 'xyzq'), []);
  assert.deepEqual(rankProvinces(OPTIONS, 'kênh mương'), []);
  assert.equal(editDistance('dong nai', 'dong nia', 2), 2);
  assert.equal(editDistance('lam dong', 'lam dog', 1), 1);
  assert.equal(editDistance('ha noi', 'quang ngai', 2), 3, 'dừng sớm: vượt ngưỡng thì trả ngưỡng + 1');
});

test('Thứ tự ưu tiên của điểm khớp: trọn tên > đầu tên > đầu một từ > chữ cái đầu > nằm trong tên', () => {
  assert.equal(scoreCore('dong nai', 'dong nai'), 1000);
  assert.ok(scoreCore('dong nai', 'dong') > scoreCore('lam dong', 'dong'));
  assert.ok(scoreCore('lam dong', 'dong') > scoreCore('ho chi minh', 'hcm'));
  assert.ok(scoreCore('ho chi minh', 'hcm') > scoreCore('quang ngai', 'uang'));
  assert.equal(scoreCore('dong nai', 'binh'), 0);
  assert.equal(scoreCore('', 'dong'), 0);
});

test('Tên riêng, loại đơn vị, bỏ dấu', () => {
  assert.equal(foldName('  Thành phố   Đồng Nai '), 'thanh pho dong nai');
  assert.equal(foldName('Bà Rịa - Vũng Tàu'), 'ba ria vung tau');
  assert.equal(provinceCore('Thành phố Đồng Nai'), 'dong nai');
  assert.equal(provinceCore('TP. Hồ Chí Minh'), 'ho chi minh');
  assert.equal(provinceCore('Tỉnh Lâm Đồng (mã cũ)'), 'lam dong');
  assert.equal(provinceCore('Đồng Nai'), 'dong nai');
  assert.equal(provinceKind('Thành phố Huế'), 'city');
  assert.equal(provinceKind('TP Cần Thơ'), 'city');
  assert.equal(provinceKind('Tỉnh Gia Lai'), 'province');
  assert.equal(provinceKind('Lâm Đồng'), '');
  // Chữ đã tách dấu (NFD) do bộ gõ nào đó gửi lên cũng khớp như chữ dựng sẵn.
  assert.equal(foldName('Đồng Nai'.normalize('NFD')), 'dong nai');
  assert.equal(top('đồng nai'.normalize('NFD'))[0], 'Thành phố Đồng Nai');
});

test('Danh mục e-GP ghi lại ngày 10/11/2026: tên hiện hành, tên cũ, và mã gửi đi khi chọn Đồng Nai', () => {
  const P = (code, name, status) => ({ code, name, current: status === 1, fold: name });
  const areas = { provinces: [P('01', 'Thành phố Hà Nội', 1), P('101', 'Thành phố Hà Nội', 0), P('68', 'Tỉnh Lâm Đồng', 1), P('703', 'Tỉnh Lâm Đồng', 0),
    P('707', 'Tỉnh Bình Phước', 0), P('713', 'Tỉnh Đồng Nai', 0), P('75', 'Thành phố Đồng Nai', 1)] };
  assert.deepEqual(currentProvinceNames(areas), ['Thành phố Đồng Nai', 'Thành phố Hà Nội', 'Tỉnh Lâm Đồng']);
  // "Tỉnh Đồng Nai" (713) trùng tên riêng với đơn vị hiện hành nên không phải một lựa chọn riêng; Bình Phước thì có.
  assert.deepEqual(legacyProvinceNames(areas), ['Tỉnh Bình Phước']);
  // Chọn gợi ý "Thành phố Đồng Nai" → tìm cả mã hiện hành 75 lẫn mã cũ cùng tên 713 (hồ sơ trước 30/4/2026).
  assert.deepEqual(provinceCodesByName(areas.provinces, 'Thành phố Đồng Nai').sort(), ['713', '75']);
  assert.deepEqual(provinceCodesByName(areas.provinces, 'dong nai').sort(), ['713', '75']);
  assert.deepEqual(provinceCodesByName(areas.provinces, 'Tỉnh Bình Phước'), ['707']);
  const options = buildProvinceOptions(currentProvinceNames(areas), legacyProvinceNames(areas));
  assert.deepEqual(rankProvinces(options, 'thành phố đồng').map((r) => r.option.value), ['Thành phố Đồng Nai', 'Tỉnh Lâm Đồng']);
  assert.deepEqual(rankProvinces(options, 'thành phố đồng nai').map((r) => r.option.value), ['Thành phố Đồng Nai']);
  assert.deepEqual(rankProvinces(options, 'binh phuoc').map((r) => [r.option.value, r.via]), [['Thành phố Đồng Nai', 'merged'], ['Tỉnh Bình Phước', 'legacy']]);
  assert.deepEqual(legacyProvinceNames(null), []);
});

test('Ô nhiều tỉnh: chỉ thay đoạn đang gõ; dấu ngăn cách khớp với lib/workspace.js', () => {
  const text = 'Tỉnh Lâm Đồng, dong';
  const range = tokenAt(text, text.length);
  assert.deepEqual(range, { start: 14, end: 19, query: 'dong' });
  const picked = applyPick(text, range, 'Thành phố Đồng Nai');
  assert.equal(picked.value, 'Tỉnh Lâm Đồng, Thành phố Đồng Nai');
  assert.equal(picked.caret, picked.value.length);
  assert.deepEqual(splitProvinceNames(picked.value), ['Tỉnh Lâm Đồng', 'Thành phố Đồng Nai']);
  // Con trỏ ở giữa: thay đúng tên đang đứng, giữ nguyên tên sau.
  const mid = 'lam, Tỉnh Gia Lai';
  assert.equal(applyPick(mid, tokenAt(mid, 2), 'Tỉnh Lâm Đồng').value, 'Tỉnh Lâm Đồng, Tỉnh Gia Lai');
  // Vừa gõ dấu phẩy: đoạn mới rỗng → danh sách hiện đủ để chọn tiếp.
  assert.equal(tokenAt('Tỉnh Lâm Đồng, ', 15).query, '');
  assert.equal(tokenAt('Tỉnh Lâm Đồng; đắk', 18).query, 'đắk');
  // Ô một tỉnh: thay toàn bộ.
  assert.deepEqual(tokenAt('  dong ', 3, false), { start: 0, end: 7, query: 'dong' });
  assert.deepEqual(applyPick('dong', tokenAt('dong', 4, false), 'Thành phố Đồng Nai', false), { value: 'Thành phố Đồng Nai', caret: 18 });
});

test('In đậm đúng phần khớp trên tên có dấu, dù người dùng gõ không dấu và có chữ "thành phố" ở đầu', () => {
  assert.deepEqual(highlightParts('Thành phố Đồng Nai', 'thành phố đồng'), ['Thành phố ', 'Đồng', ' Nai']);
  assert.deepEqual(highlightParts('Thành phố Đồng Nai', 'dong na'), ['Thành phố ', 'Đồng Na', 'i']);
  assert.deepEqual(highlightParts('Tỉnh Lâm Đồng', 'dong'), ['Tỉnh Lâm ', 'Đồng', '']);
  assert.deepEqual(highlightParts('Xã Đức Trọng', 'xã duc'), ['Xã ', 'Đức', ' Trọng']);
  assert.deepEqual(highlightParts('Tỉnh Gia Lai', 'xyz'), ['Tỉnh Gia Lai', '', '']);
  assert.deepEqual(highlightParts('Tỉnh Gia Lai', ''), ['Tỉnh Gia Lai', '', '']);
});

test('Xã/phường, Ban QLDA: gõ không dấu, có hay không chữ "xã" / "phường", nhiều từ rời đều ra', () => {
  const labels = ['Xã Đức Trọng · mã 68134 · tỉnh 68 · hiện hành', 'Xã Đơn Dương · mã 68119 · tỉnh 68 · hiện hành', 'Phường Xuân Hương - Đà Lạt · mã 68101 · tỉnh 68 · hiện hành',
    'Huyện Đức Trọng · mã 70301 · tỉnh 703 · mã cũ', 'Ban QLDA · Ban Quản lý dự án đầu tư xây dựng khu vực Đức Trọng · Tỉnh Lâm Đồng · tìm theo tên', 'Đặc khu Phú Quý · mã 68263 · tỉnh 68 · hiện hành'];
  const options = labels.map((value) => { const parts = value.split(' · '); const title = parts[0] === 'Ban QLDA' ? parts[1] : parts[0]; return { value, title, core: wardCore(title), full: foldName(value) }; });
  const titles = (text) => rankPlain(options, text).map((r) => r.option.title);
  assert.deepEqual(titles('duc trong').slice(0, 2).sort(), ['Huyện Đức Trọng', 'Xã Đức Trọng']);
  assert.ok(titles('duc trong').includes('Ban Quản lý dự án đầu tư xây dựng khu vực Đức Trọng'), 'Ban QLDA có chữ Đức Trọng trong tên cũng ra, xếp sau');
  assert.equal(titles('xã đức')[0], 'Xã Đức Trọng');
  assert.equal(titles('da lat')[0], 'Phường Xuân Hương - Đà Lạt');
  assert.equal(titles('phu quy')[0], 'Đặc khu Phú Quý');
  assert.equal(titles('ban duc trong')[0], 'Ban Quản lý dự án đầu tư xây dựng khu vực Đức Trọng');
  assert.equal(titles('68119')[0], 'Xã Đơn Dương', 'gõ mã cũng tìm được');
  assert.deepEqual(titles('khong co'), []);
  assert.equal(rankPlain(options, '').length, 6);
  assert.equal(rankPlain(options, '', 3).length, 3, 'danh sách dài được cắt bớt khi chưa gõ gì');
  assert.equal(wardCore('Thị trấn Liên Nghĩa'), 'lien nghia');
});

/* ---------------------------------------------------------------------------
 *  Hành vi của ô gợi ý rút ra từ ảnh iPad thật và từ bài đo — canh bằng mã nguồn vì cần bàn phím, con trỏ thật
 * ------------------------------------------------------------------------- */
test('ô gợi ý: đóng ngay khi con trỏ sang ô khác; chọn xong thì hạ bàn phím; cuộn tức thì; tính lại khi bàn phím ảo trượt lên', () => {
  const src = fs.readFileSync(new URL('../GiaoSuCuiBap/lib/suggest.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // Bài đo "kết quả tức thì": danh sách nán lại 160 ms sau khi rời ô, che nút Tìm, lần bấm trễ 0,85 giây.
  assert.match(src, /const next = event\.relatedTarget;\s*if \(next && next !== clear && !pop\.contains\(next\)\) \{ hide\(\); sync\(\); return; \}/);
  // Ảnh iPad thật: bàn phím che gần nửa màn hình — chọn xong phải thấy lại biểu mẫu, kể cả ô nhận nhiều tỉnh.
  assert.match(src, /if \(TOUCH\) input\.blur\(\);/);
  assert.ok(!/TOUCH && !multi\) input\.blur/.test(src));
  // Trang đặt cuộn mượt: phải tắt tạm, nếu không phép tính chỗ trống thấy vị trí cũ và danh sách nằm ngoài màn hình.
  assert.match(src, /root\.style\.scrollBehavior = 'auto';[\s\S]{0,700}input\.scrollIntoView\(\{ block: 'start' \}\); uncover\(\);[\s\S]{0,400}finally \{ root\.style\.scrollBehavior = smooth; \}/);
  // Bàn phím ảo trượt lên sau khi ô được chọn: tính lại theo visualViewport, và thêm hai nhịp phòng khi sự kiện không tới.
  assert.match(src, /if \(TOUCH\) \{ setTimeout\(again, 380\); setTimeout\(again, 900\); \}/);
  assert.match(src, /vv\.addEventListener\('resize', again\)/);
  // Ô nhập hẹp thì danh sách vẫn rộng tối thiểu 300 px khi còn chỗ.
  assert.match(src, /const POP_WIDTH = 300;/);
});
