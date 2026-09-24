import test from 'node:test';
import assert from 'node:assert/strict';

import { buildXlsx, colName, XLSX_MIME, xlsxDataUrl } from '../lib/xlsx.js';

function storedZipEntries(bytes) {
  const buffer = Buffer.from(bytes);
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    assert.equal(method, 0, 'the built-in writer should use ZIP store mode');
    assert.equal(compressedSize, uncompressedSize);

    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.set(name, data);
    offset = dataStart + compressedSize;
  }
  return entries;
}

test('Excel column names cover single- and multi-letter columns', () => {
  assert.equal(colName(1), 'A');
  assert.equal(colName(26), 'Z');
  assert.equal(colName(27), 'AA');
  assert.equal(colName(52), 'AZ');
  assert.equal(colName(703), 'AAA');
});

test('buildXlsx creates a complete, escaped OOXML workbook', () => {
  const bytes = buildXlsx({
    sheetName: 'Gói/[thầu]:2026?*',
    columns: [
      { header: 'Tên & mã', key: 'name' },
      { header: 'Giá', key: 'price', type: 'money' },
      { header: 'Giảm giá', key: 'discount', type: 'percent' },
      { header: 'Nguồn', key: 'url', type: 'url' }
    ],
    rows: [{
      name: 'Kênh <mương> & đập\u0007',
      price: 1_234_567_890,
      discount: 2.76,
      url: 'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?x=1&y=2'
    }]
  });

  assert.ok(bytes instanceof Uint8Array);
  assert.equal(Buffer.from(bytes).readUInt32LE(0), 0x04034b50);

  const entries = storedZipEntries(bytes);
  const required = [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/worksheets/sheet1.xml',
    'xl/worksheets/_rels/sheet1.xml.rels'
  ];
  for (const name of required) assert.ok(entries.has(name), `missing ${name}`);

  const workbook = entries.get('xl/workbook.xml').toString('utf8');
  const sheet = entries.get('xl/worksheets/sheet1.xml').toString('utf8');
  const sheetRels = entries.get('xl/worksheets/_rels/sheet1.xml.rels').toString('utf8');
  const styles = entries.get('xl/styles.xml').toString('utf8');

  assert.match(workbook, /<sheet name="Gói  thầu  2026  "/);
  assert.match(sheet, /<pane ySplit="1"[^>]+state="frozen"/);
  assert.match(sheet, /<autoFilter ref="A1:D2"\/>/);
  assert.match(sheet, /Kênh &lt;mương&gt; &amp; đập/);
  assert.doesNotMatch(sheet, /\u0007/);
  /* Kiểm Ý NGHĨA của kiểu ô, không ghim chỉ số.
     Ghim `s="2"` từng làm bài này đỏ mỗi lần thêm một kiểu hợp lệ, trong khi
     thứ thật sự cần bảo đảm là: ô tiền phải mang định dạng tiền, ô phần trăm
     mang định dạng phần trăm. Đọc ngược từ styles.xml thì bài thử đúng cả khi
     bảng kiểu được sắp lại. */
  const styleXml = entries.get('xl/styles.xml').toString('utf8');
  const cellXfs = [...styleXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf [^>]*numFmtId="(\d+)"[^>]*/g)]
    .map((m) => Number(m[1]));
  const numFmtOf = (ref) => cellXfs[Number(new RegExp(`<c r="${ref}" s="(\\d+)"`).exec(sheet)[1])];

  assert.match(sheet, /<c r="B2" s="\d+"><v>1234567890<\/v><\/c>/, 'ô tiền phải là SỐ, không phải chuỗi');
  assert.equal(numFmtOf('B2'), 164, 'ô tiền không mang định dạng "#,##0 đ"');
  assert.match(sheet, /<c r="C2" s="\d+"><v>0\.0276<\/v><\/c>/, 'phần trăm phải lưu dạng phân số');
  assert.equal(numFmtOf('C2'), 165, 'ô phần trăm không mang định dạng phần trăm');
  assert.match(sheet, /x=1&amp;y=2/);
  assert.match(sheet, /xmlns:r="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships"/);
  assert.match(sheet, /<hyperlinks><hyperlink ref="D2" r:id="rId1"\/><\/hyperlinks>/);
  assert.match(
    sheetRels,
    /Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/hyperlink"/
  );
  assert.match(sheetRels, /Target="https:\/\/muasamcong\.mpi\.gov\.vn\/vi\/web\/guest\/contractor-selection\?x=1&amp;y=2"/);
  assert.match(sheetRels, /TargetMode="External"/);
  assert.match(styles, /numFmtId="164"/);
  assert.match(styles, /numFmtId="165"/);
});

test('URL cells create relationships only for bounded HTTP(S) URLs', () => {
  const bytes = buildXlsx({
    sheetName: 'Liên kết',
    columns: [{ header: 'Nguồn', key: 'url', type: 'url' }],
    rows: [
      { url: 'https://example.com/a?x=1&y=2' },
      { url: 'http://example.org/public' },
      { url: 'javascript:alert(1)' },
      { url: 'ftp://example.com/file' },
      { url: 'không phải URL' },
      { url: 'https://' },
      { url: `https://example.com/${'x'.repeat(4097)}` }
    ]
  });

  const entries = storedZipEntries(bytes);
  const sheet = entries.get('xl/worksheets/sheet1.xml').toString('utf8');
  const rels = entries.get('xl/worksheets/_rels/sheet1.xml.rels').toString('utf8');

  assert.match(sheet, /<hyperlink ref="A2" r:id="rId1"\/>/);
  assert.match(sheet, /<hyperlink ref="A3" r:id="rId2"\/>/);
  for (const ref of ['A4', 'A5', 'A6', 'A7', 'A8']) {
    assert.doesNotMatch(sheet, new RegExp(`<hyperlink ref="${ref}"`));
  }
  assert.equal((rels.match(/<Relationship Id=/g) || []).length, 2);
  assert.match(rels, /Target="https:\/\/example\.com\/a\?x=1&amp;y=2"/);
  assert.match(rels, /Target="http:\/\/example\.org\/public"/);
  assert.doesNotMatch(rels, /javascript:|ftp:|không phải URL/);
});

test('a sheet with no valid URL does not emit hyperlink metadata', () => {
  const bytes = buildXlsx({
    columns: [{ header: 'Nguồn', key: 'url', type: 'url' }],
    rows: [{ url: 'javascript:alert(1)' }, { url: 'not-a-url' }]
  });
  const entries = storedZipEntries(bytes);
  const sheet = entries.get('xl/worksheets/sheet1.xml').toString('utf8');

  assert.equal(entries.has('xl/worksheets/_rels/sheet1.xml.rels'), false);
  assert.doesNotMatch(sheet, /<hyperlinks>/);
});

test('buildXlsx supports multiple sheets and xlsxDataUrl round-trips bytes', () => {
  const bytes = buildXlsx({
    sheets: [
      { sheetName: 'Tổng quan', columns: [{ header: 'Mã', key: 'id' }], rows: [{ id: 'IB1' }] },
      { sheetName: 'Rủi ro', columns: [{ header: 'Mức', key: 'level' }], rows: [{ level: 'Cao' }] }
    ]
  });
  const entries = storedZipEntries(bytes);
  assert.ok(entries.has('xl/worksheets/sheet1.xml'));
  assert.ok(entries.has('xl/worksheets/sheet2.xml'));
  assert.match(entries.get('xl/workbook.xml').toString('utf8'), /sheetId="2" r:id="rId2"/);

  const url = xlsxDataUrl(bytes);
  assert.ok(url.startsWith(`data:${XLSX_MIME};base64,`));
  const encoded = url.slice(url.indexOf(',') + 1);
  assert.deepEqual(Buffer.from(encoded, 'base64'), Buffer.from(bytes));
});

/* ============================================================================
 *  ĐỊNH DẠNG BẢNG: kẻ ô, đậm, nghiêng, màu theo kết luận
 *
 *  Đây không phải chuyện trang trí. Người dùng in bảng ra mang đi họp; màu nền
 *  mang đúng ba kết luận của cổng lọc, nên nhìn là thấy nhóm nào cần mở e-GP
 *  kiểm lại. Nếu màu tô sai nhóm thì còn tệ hơn không tô: nó nói một điều
 *  chắc chắn mà sai.
 * ========================================================================== */

function sheetOf(bytes) {
  const entries = storedZipEntries(bytes);
  return { sheet: entries.get('xl/worksheets/sheet1.xml').toString('utf8'),
    styles: entries.get('xl/styles.xml').toString('utf8') };
}

/** Bóc thuộc tính của kiểu ô tại một ô, đọc ngược qua styles.xml. */
function styleAt(bytes, ref) {
  const { sheet, styles } = sheetOf(bytes);
  const index = Number(new RegExp(`<c r="${ref}" s="(\\d+)"`).exec(sheet)[1]);
  const xfs = [...styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf [^>]*?\/?>(?:<alignment[^>]*\/>)?<\/xf>|<xf [^>]*?\/>/g)]
    .map((m) => m[0]);
  const xf = xfs[index];
  const attr = (name) => Number(new RegExp(`${name}="(\\d+)"`).exec(xf)?.[1] ?? -1);
  const fonts = [...styles.match(/<fonts[^>]*>([\s\S]*?)<\/fonts>/)[1].matchAll(/<font>[\s\S]*?<\/font>/g)].map((m) => m[0]);
  const fills = [...styles.match(/<fills[^>]*>([\s\S]*?)<\/fills>/)[1].matchAll(/<fill>[\s\S]*?<\/fill>/g)].map((m) => m[0]);
  const borders = [...styles.match(/<borders[^>]*>([\s\S]*?)<\/borders>/)[1].matchAll(/<border>[\s\S]*?<\/border>/g)].map((m) => m[0]);
  const font = fonts[attr('fontId')] || '';
  return { numFmt: attr('numFmtId'), bold: font.includes('<b/>'), italic: font.includes('<i/>'),
    fill: /fgColor rgb="(\w+)"/.exec(fills[attr('fillId')] || '')?.[1] || '',
    ke: (borders[attr('borderId')] || '').includes('style="thin"') };
}

const COT = [
  { header: 'Tên gói thầu', key: 'ten', width: 40, emphasis: 'bold' },
  { header: 'Giá', key: 'gia', type: 'money', width: 18 },
  { header: 'Lý do', key: 'ly', width: 30, emphasis: 'italic' }
];
const DONG = [
  { __gate: 'MATCH',        ten: 'Kênh mương N1',   gia: 2e9,  ly: 'Khớp tiêu chí' },
  { __gate: 'INSUFFICIENT', ten: 'Gói thầu số 05',  gia: null, ly: 'Chưa xác định loại gói thầu' },
  { __gate: 'OUT_OF_RANGE', ten: 'Mua sắm bàn ghế', gia: 4.8e8, ly: 'Khác loại gói thầu đã chọn' }
];

test('MỌI Ô trong thân bảng đều được kẻ khung', () => {
  // Bảng 24 cột không kẻ khung thì in ra không dò được hàng nào sang hàng nào.
  const bytes = buildXlsx({ sheetName: 'T', columns: COT, rows: DONG });
  for (const ref of ['A2', 'B2', 'C2', 'A3', 'B3', 'C3', 'A4', 'B4', 'C4']) {
    assert.equal(styleAt(bytes, ref).ke, true, `ô ${ref} không có khung`);
  }
});

test('MÀU NỀN mang đúng kết luận đối chiếu, không tô bừa', () => {
  const bytes = buildXlsx({ sheetName: 'T', columns: COT, rows: DONG });
  assert.equal(styleAt(bytes, 'A2').fill, 'FFE7F5EC', 'dòng KHỚP phải nền xanh nhạt');
  assert.equal(styleAt(bytes, 'A3').fill, 'FFFFF6E3', 'dòng CHƯA ĐỦ DỮ LIỆU phải nền vàng nhạt');
  assert.equal(styleAt(bytes, 'A4').fill, 'FFFCECEA', 'dòng NGOÀI TIÊU CHÍ phải nền đỏ nhạt');
  // Cả dòng cùng màu, không chỉ ô đầu.
  for (const ref of ['B3', 'C3']) assert.equal(styleAt(bytes, ref).fill, 'FFFFF6E3', `ô ${ref} lệch màu dòng`);
});

test('KHÔNG có kết luận thì KHÔNG tô màu kết luận — chỉ kẻ dải chẵn lẻ', () => {
  /* Tô màu khi không có căn cứ là nói một kết luận không tồn tại. Người đọc
     bảng in sẽ tin vào màu đó. */
  const bytes = buildXlsx({ sheetName: 'T', columns: COT,
    rows: [{ ten: 'A', gia: 1e9, ly: '' }, { ten: 'B', gia: 2e9, ly: '' }] });
  const mau = [styleAt(bytes, 'A2').fill, styleAt(bytes, 'A3').fill];
  for (const m of mau) assert.ok(!['FFE7F5EC', 'FFFFF6E3', 'FFCECEA'].includes(m), `đã tô màu kết luận: ${m}`);
  assert.notEqual(mau[0], mau[1], 'dải chẵn/lẻ phải phân biệt được để dò hàng');
});

test('ĐẬM và NGHIÊNG theo khai báo cột', () => {
  const bytes = buildXlsx({ sheetName: 'T', columns: COT, rows: DONG });
  assert.equal(styleAt(bytes, 'A2').bold, true, 'tên gói thầu phải in đậm');
  assert.equal(styleAt(bytes, 'C2').italic, true, 'lý do đối chiếu phải in nghiêng');
  assert.equal(styleAt(bytes, 'C2').bold, false, 'nghiêng thì không đậm cùng lúc');
});

test('Ô THIẾU GIÁ vẫn kẻ khung và vẫn TRỐNG, không thành "0 đ"', () => {
  const bytes = buildXlsx({ sheetName: 'T', columns: COT, rows: DONG });
  const { sheet } = sheetOf(bytes);
  assert.match(sheet, /<c r="B3" s="\d+"\/>/, 'ô thiếu giá phải rỗng, không có <v>0</v>');
  assert.equal(styleAt(bytes, 'B3').ke, true, 'ô rỗng vẫn phải nằm trong khung');
});

test('DẢI ĐẦU BẢNG nói rõ bảng này là gì, và đẩy mọi mốc dòng xuống đúng chỗ', () => {
  const bytes = buildXlsx({ sheetName: 'T', columns: COT, rows: DONG,
    title: 'DANH SÁCH GÓI THẦU', subtitle: 'Lọc: Lâm Đồng · 3 gói' });
  const { sheet } = sheetOf(bytes);
  assert.match(sheet, /DANH SÁCH GÓI THẦU/);
  assert.match(sheet, /<mergeCells count="2">/, 'dải tiêu đề phải gộp ô, nếu không chữ bị cắt ở cột A');
  assert.match(sheet, /<row r="3" ht="30"/, 'dòng tiêu đề cột phải xuống dòng 3');
  assert.match(sheet, /<pane ySplit="3" topLeftCell="A4"/, 'đóng băng phải tính cả dải tiêu đề');
  assert.match(sheet, /<autoFilter ref="A3:C6"\/>/, 'bộ lọc phải bắt đầu từ dòng tiêu đề cột');
  assert.equal(styleAt(bytes, 'A4').ke, true, 'dòng dữ liệu đầu tiên vẫn phải có khung');
});

test('KHÔNG có dải tiêu đề thì bảng vẫn đúng như cũ', () => {
  const { sheet } = sheetOf(buildXlsx({ sheetName: 'T', columns: COT, rows: DONG }));
  assert.match(sheet, /<row r="1" ht="30"/);
  assert.match(sheet, /<pane ySplit="1" topLeftCell="A2"/);
  assert.doesNotMatch(sheet, /<mergeCells/);
});

test('bảng kiểu sinh ra đủ dùng và khai đúng số lượng', () => {
  /* Số khai trong <cellXfs count="N"> phải bằng số <xf> thật. Lệch nhau thì
     Excel báo tệp hỏng — và chỉ lộ ra khi người dùng mở file, không phải ở đây. */
  const { styles } = sheetOf(buildXlsx({ sheetName: 'T', columns: COT, rows: DONG }));
  for (const the of ['cellXfs', 'fonts', 'fills', 'borders']) {
    const khoi = new RegExp(`<${the} count="(\\d+)">([\\s\\S]*?)<\\/${the}>`).exec(styles);
    const khai = Number(khoi[1]);
    const that = (khoi[2].match(the === 'cellXfs' ? /<xf /g : new RegExp(`<${the.slice(0, -1)}[ >]`, 'g')) || []).length;
    assert.equal(that, khai, `<${the}> khai ${khai} nhưng có ${that}`);
  }
});

test('GIÁ LẺ và GIÁ CHẴN cùng độ đậm trong một cột', () => {
  // Chỗ đậm chỗ không trong cùng một cột trông như lỗi in, và mắt hiểu nhầm
  // là hai loại dữ liệu khác nhau.
  const cot = [{ header: 'Giá', key: 'g', type: 'money', width: 18, emphasis: 'bold' }];
  const bytes = buildXlsx({ sheetName: 'T', columns: cot, rows: [{ g: 2e9 }, { g: 9876543210.5 }] });
  assert.equal(styleAt(bytes, 'A2').bold, true, 'giá chẵn phải đậm');
  assert.equal(styleAt(bytes, 'A3').bold, true, 'giá lẻ cũng phải đậm');
  assert.equal(styleAt(bytes, 'A3').numFmt, 166, 'giá lẻ vẫn phải giữ định dạng hiện phần thập phân');
});
