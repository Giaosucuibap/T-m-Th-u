/* ============================================================================
 *  lib/xlsx.js — TẠO TỆP EXCEL (.xlsx) THẬT, KHÔNG DÙNG THƯ VIỆN NGOÀI
 *
 *  VÌ SAO BỎ CSV
 *
 *  Bản trước xuất CSV ngăn bằng DẤU PHẨY. Excel bản tiếng Việt (và mọi máy đặt
 *  vùng Việt Nam) lấy DẤU CHẤM PHẨY làm dấu ngăn danh sách, nên nó không tách
 *  cột: toàn bộ một dòng dồn vào ô A. Đây đúng là lỗi người dùng gặp.
 *
 *  Có thể vá bằng cách đổi sang dấu chấm phẩy và thêm dòng `sep=;`, nhưng CSV
 *  vẫn không có: tiêu đề in đậm, độ rộng cột, định dạng số tiền, cố định dòng
 *  tiêu đề, bộ lọc, hay liên kết bấm được. Số tiền trong CSV còn hay bị Excel
 *  đọc nhầm thành chữ hoặc thành ngày.
 *
 *  Nên tệp này dựng .xlsx thật. Định dạng .xlsx chỉ là một tệp ZIP chứa vài
 *  tệp XML, và cả hai thứ đó đều dựng được bằng JavaScript thuần.
 *
 *  ---------------------------------------------------------------------------
 *  GHI CHÚ KỸ THUẬT
 *
 *  ZIP ghi theo phương thức "store" (không nén). Đổi lại tệp to hơn, nhưng
 *  không phải kéo thêm thư viện nén nào, và vài nghìn dòng thì cỡ tệp vẫn nhỏ.
 *
 *  Chuỗi ghi thẳng dạng inline (t="inlineStr") thay vì bảng sharedStrings —
 *  ít tệp XML hơn, ít chỗ sai hơn.
 * ========================================================================== */

/* --------------------------------------------------------------------------
 *  ZIP
 * ------------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const utf8 = (s) => new TextEncoder().encode(s);

/**
 * Gói các tệp thành một ZIP (phương thức store, không nén).
 * @param {{name:string, data:Uint8Array}[]} files
 */
function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;

  const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

  for (const f of files) {
    const nameBytes = utf8(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;

    // Local file header. Cờ 0x0800 báo tên tệp mã hoá UTF-8.
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(size), ...u32(size), ...u16(nameBytes.length), ...u16(0)
    ]);
    parts.push(local, nameBytes, f.data);

    central.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(size), ...u32(size), ...u16(nameBytes.length),
      ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)
    ]));
    central.push(nameBytes);
    offset += local.length + nameBytes.length + size;
  }

  let dirSize = 0;
  for (const c of central) dirSize += c.length;

  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length), ...u32(dirSize), ...u32(offset), ...u16(0)
  ]);

  let total = end.length + dirSize;
  for (const c of parts) total += c.length;

  const out = new Uint8Array(total);
  let p = 0;
  for (const c of parts) { out.set(c, p); p += c.length; }
  for (const c of central) { out.set(c, p); p += c.length; }
  out.set(end, p);
  return out;
}

/* --------------------------------------------------------------------------
 *  XML
 * ------------------------------------------------------------------------ */

/**
 * Thoát ký tự cho XML, đồng thời BỎ các ký tự điều khiển.
 *
 * Bỏ ký tự điều khiển là bắt buộc: chỉ một ký tự nằm ngoài phạm vi hợp lệ của
 * XML là Excel báo "tệp hỏng" và từ chối mở cả sổ tính. Dữ liệu e-GP thỉnh
 * thoảng có ký tự lạ lẫn trong tên gói thầu.
 */
function xmlEscape(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Số thứ tự cột → tên cột Excel: 1→A, 27→AA. */
export function colName(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/* --------------------------------------------------------------------------
 *  KIỂU Ô
 *
 *  Chỉ số kiểu phải khớp ĐÚNG thứ tự các <xf> trong <cellXfs>. Trước đây hai
 *  danh sách đó được gõ tay ở hai chỗ cách nhau 150 dòng, và lệch một ô là cả
 *  bảng hiển thị sai kiểu — tiền thành ngày, chữ thành phần trăm — mà tệp vẫn
 *  mở được nên không ai thấy ngay.
 *
 *  Nay CẢ HAI sinh ra từ một danh sách duy nhất bên dưới. Muốn thêm kiểu thì
 *  thêm vào `XF`, không phải đếm lại chỉ số.
 * ------------------------------------------------------------------------ */

/** Nền của một dòng, theo kết luận đối chiếu tiêu chí. */
const FILL = { none: 0, gray125: 1, header: 2, zebra: 3, match: 4, insufficient: 5, out: 6, title: 7 };
const FONT = { body: 0, header: 1, link: 2, bold: 3, muted: 4, title: 5, subtitle: 6 };
const BORDER = { none: 0, grid: 1, headerBottom: 2 };

const NUMFMT = { text: 0, money: 164, percent: 165, integer: 3, moneyFraction: 166, string: 49 };

/** Một dòng = một <xf>. Thứ tự ở đây CHÍNH LÀ chỉ số kiểu. */
const XF = [];
const styleIndex = new Map();
function defineStyle(name, xf) {
  styleIndex.set(name, XF.length);
  XF.push(xf);
  return styleIndex.get(name);
}

// Ô đặc biệt của phần đầu bảng.
defineStyle('title',    { numFmt: NUMFMT.text, font: FONT.title,    fill: FILL.title, border: BORDER.none, align: 'left-center' });
defineStyle('subtitle', { numFmt: NUMFMT.text, font: FONT.subtitle, fill: FILL.title, border: BORDER.none, align: 'left-center' });
defineStyle('header',   { numFmt: NUMFMT.text, font: FONT.header,   fill: FILL.header, border: BORDER.headerBottom, align: 'center' });

/* Thân bảng: (kiểu dữ liệu) × (nền dòng). Sinh vòng lặp nên không thể lệch. */
const BODY_KINDS = [
  ['text',          NUMFMT.text,          FONT.body],
  ['bold',          NUMFMT.text,          FONT.bold],
  ['muted',         NUMFMT.text,          FONT.muted],   // in nghiêng, xám
  ['money',         NUMFMT.money,         FONT.body],
  ['moneyBold',     NUMFMT.money,         FONT.bold],
  ['moneyFraction', NUMFMT.moneyFraction, FONT.body],
  ['moneyFractionBold', NUMFMT.moneyFraction, FONT.bold],
  ['percent',       NUMFMT.percent,       FONT.body],
  ['integer',       NUMFMT.integer,       FONT.body],
  ['link',          NUMFMT.string,        FONT.link]
];
const BANDS = ['plain', 'zebra', 'match', 'insufficient', 'out'];
const BAND_FILL = { plain: FILL.none, zebra: FILL.zebra, match: FILL.match, insufficient: FILL.insufficient, out: FILL.out };

for (const band of BANDS) {
  for (const [kind, numFmt, font] of BODY_KINDS) {
    defineStyle(`${kind}:${band}`, {
      numFmt, font, fill: BAND_FILL[band], border: BORDER.grid,
      align: numFmt === NUMFMT.text || numFmt === NUMFMT.string ? 'top-wrap' : 'top-right'
    });
  }
}

const ALIGNMENT = {
  'left-center': '<alignment horizontal="left" vertical="center"/>',
  center: '<alignment horizontal="center" vertical="center" wrapText="1"/>',
  'top-wrap': '<alignment vertical="top" wrapText="1"/>',
  'top-right': '<alignment horizontal="right" vertical="top"/>'
};

/** Chỉ số kiểu theo tên. Tên không có là lỗi lập trình, không im lặng bỏ qua. */
function styleOf(kind, band = 'plain') {
  const key = BANDS.includes(band) ? `${kind}:${band}` : kind;
  const index = styleIndex.get(key) ?? styleIndex.get(kind);
  if (index === undefined) throw new Error(`Kiểu ô không có trong bảng: ${key}`);
  return index;
}

const STYLE = { text: styleOf('text'), header: styleOf('header') };

/** Kiểu dữ liệu cột → tên kiểu ô của thân bảng. */
const TYPE_KIND = { text: 'text', money: 'money', percent: 'percent', number: 'integer', url: 'link' };

const NUMERIC_TYPES = new Set(['money', 'percent', 'number']);

const isNum = (v) =>
  v !== null && v !== undefined && v !== '' && typeof v !== 'boolean' && Number.isFinite(Number(v));

/** Chỉ tạo hyperlink cho URL HTTP(S) hợp lệ, có hostname và độ dài hữu hạn. */
function isHttpUrl(value) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (!text || text.length > 4096) return false;
  try {
    const parsed = new URL(text);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Dựng một sổ tính Excel.
 *
 * @param {object} spec
 * @param {string} [spec.sheetName]  tên trang tính
 * @param {{header:string,key:string,type?:string,width?:number}[]} spec.columns
 * @param {object[]} spec.rows
 * @returns {Uint8Array} nội dung tệp .xlsx
 */
/**
 * Nền của một dòng.
 *
 * Màu ở đây KHÔNG phải trang trí — nó mang đúng ba kết luận của cổng lọc, nên
 * người cầm bảng in không cần đọc cột chữ vẫn thấy ngay nhóm nào là nhóm nào:
 *
 *   xanh nhạt  — Khớp tiêu chí
 *   vàng nhạt  — CHƯA ĐỦ DỮ LIỆU, nhóm phải mở e-GP kiểm lại
 *   đỏ nhạt    — Ngoài tiêu chí
 *
 * Không có kết luận thì kẻ dải chẵn/lẻ cho dễ dò hàng. Ai bỏ cột đối chiếu ra
 * khỏi bản xuất thì màu cũng mất theo, đúng như vậy: không có căn cứ thì không
 * tô màu gợi ý một kết luận không tồn tại.
 */
const GATE_BAND = { MATCH: 'match', INSUFFICIENT: 'insufficient', OUT_OF_RANGE: 'out' };
function bandOf(row, rowIndex) {
  const band = GATE_BAND[String(row?.__gate ?? row?.filterStateCode ?? '').toUpperCase()];
  if (band) return band;
  return rowIndex % 2 === 1 ? 'zebra' : 'plain';
}

function buildSheetXml({ columns = [], rows = [], title = '', subtitle = '' }) {
  const cols = (columns || []).filter(Boolean);
  const data = rows || [];
  const lastCol = colName(cols.length || 1);
  // Dải tiêu đề chiếm 2 dòng đầu khi có, nên mọi mốc dòng phải dịch theo.
  const bandRows = title ? 2 : 0;
  const headerRow = bandRows + 1;
  const lastRow = data.length + headerRow;

  // Excel cần cả phần tử <hyperlinks> lẫn tệp quan hệ của worksheet. Chỉ tô
  // xanh/gạch chân không biến nội dung thành liên kết bấm được.
  const links = [];

  /* Độ rộng cột theo nội dung dài nhất, có chặn trên để một tên gói thầu dài
     không kéo cột rộng ra hết màn hình. */
  const widths = cols.map((c) => {
    let max = String(c.header || '').length;
    for (const r of data) {
      const len = String(r[c.key] === null || r[c.key] === undefined ? '' : r[c.key]).length;
      if (len > max) max = len;
    }
    return Math.min(c.width || Math.max(10, Math.min(max + 3, 55)), 80);
  });

  const cell = (ref, style, value, type) => {
    if (value === null || value === undefined || value === '') return `<c r="${ref}" s="${style}"/>`;
    if (NUMERIC_TYPES.has(type) && isNum(value)) {
      // Excel lưu phần trăm dưới dạng phân số, nên 2,76% phải ghi là 0.0276.
      const n = type === 'percent' ? Number(value) / 100 : Number(value);
      return `<c r="${ref}" s="${style}"><v>${n}</v></c>`;
    }
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
  };

  const headerCells = cols
    .map((c, i) => cell(`${colName(i + 1)}${headerRow}`, STYLE.header, c.header, 'text'))
    .join('');

  /* Dải đầu bảng: tên báo cáo + phạm vi dữ liệu. Mở file ra là biết ngay đang
     cầm bảng gì, lọc theo cái gì, xuất lúc nào — thay vì một biển 24 cột không
     đầu không đuôi mà người nhận phải hỏi lại mới hiểu. */
  const titleRows = title
    ? `<row r="1" ht="26" customHeight="1">`
      + cols.map((_, i) => cell(`${colName(i + 1)}1`, styleOf('title'), i === 0 ? title : '', 'text')).join('')
      + `</row><row r="2" ht="17" customHeight="1">`
      + cols.map((_, i) => cell(`${colName(i + 1)}2`, styleOf('subtitle'), i === 0 ? subtitle : '', 'text')).join('')
      + `</row>`
    : '';

  const bodyRows = data.map((r, ri) => {
    const n = ri + headerRow + 1;
    const band = bandOf(r, ri);
    const cells = cols.map((c, i) => {
      const type = c.type || 'text';
      const value = r[c.key];
      // Giá trị không phải số thì hạ về kiểu chữ. KHÔNG ép thành 0: ô thiếu giá
      // phải trông là trống, chứ không phải "0 đ" — đó là bịa số.
      let kind;
      if (NUMERIC_TYPES.has(type) && !isNum(value)) kind = 'text';
      else if (type === 'money') {
        // Giá lẻ và giá chẵn phải cùng độ đậm: cùng một cột mà chỗ đậm chỗ
        // không thì trông như lỗi in, và mắt hiểu nhầm là hai loại dữ liệu.
        const dam = c.emphasis === 'bold';
        kind = !Number.isInteger(Number(value))
          ? (dam ? 'moneyFractionBold' : 'moneyFraction')
          : (dam ? 'moneyBold' : 'money');
      } else if (type === 'text' || !TYPE_KIND[type]) {
        kind = c.emphasis === 'bold' ? 'bold' : c.emphasis === 'italic' ? 'muted' : 'text';
      } else kind = TYPE_KIND[type];

      const ref = `${colName(i + 1)}${n}`;
      if (type === 'url' && isHttpUrl(value)) links.push({ ref, target: String(value).trim() });
      return cell(ref, styleOf(kind, band), value, type);
    }).join('');
    return `<row r="${n}">${cells}</row>`;
  }).join('');

  const sheet =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<dimension ref="A1:${lastCol}${lastRow}"/>` +
    // Cố định dòng tiêu đề để cuộn xuống vẫn thấy tên cột.
    '<sheetViews><sheetView workbookViewId="0" showGridLines="0">' +
    `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>` +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols.length
      ? '<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>'
      : '') +
    `<sheetData>${titleRows}<row r="${headerRow}" ht="30" customHeight="1">${headerCells}</row>${bodyRows}</sheetData>` +
    (data.length ? `<autoFilter ref="A${headerRow}:${lastCol}${lastRow}"/>` : '') +
    // Thứ tự phần tử trong OOXML là bắt buộc: autoFilter → mergeCells →
    // hyperlinks. Sai thứ tự thì Excel báo tệp hỏng và đòi sửa chữa.
    (title ? `<mergeCells count="2"><mergeCell ref="A1:${lastCol}1"/><mergeCell ref="A2:${lastCol}2"/></mergeCells>` : '') +
    // OOXML yêu cầu <hyperlinks> nằm sau <autoFilter>.
    (links.length
      ? '<hyperlinks>' + links.map((link, i) =>
        `<hyperlink ref="${link.ref}" r:id="rId${i + 1}"/>`).join('') + '</hyperlinks>'
      : '') +
    '</worksheet>';

  return { xml: sheet, links };
}

/** Excel cấm \ / ? * [ ] : trong tên trang tính, và giới hạn 31 ký tự. */
function safeSheetName(name, i) {
  return String(name || '').replace(/[\/?*[\]:]/g, ' ').slice(0, 31) || ('Trang ' + (i + 1));
}

/**
 * Dựng sổ tính Excel gồm MỘT hoặc NHIỀU trang tính.
 *
 *   một trang  : buildXlsx({ sheetName, columns, rows })
 *   nhiều trang: buildXlsx({ sheets: [{ sheetName, columns, rows }, ...] })
 *
 * Nhiều trang tiện hơn nhiều tệp rời: mở một lần thấy đủ các góc nhìn, và các
 * trang tham chiếu chéo được nhau ngay trong Excel.
 */
export function buildXlsx(spec = {}) {
  const sheets = (Array.isArray(spec.sheets) && spec.sheets.length)
    ? spec.sheets
    : [{ sheetName: spec.sheetName || 'Dữ liệu', columns: spec.columns || [], rows: spec.rows || [],
         title: spec.title || '', subtitle: spec.subtitle || '' }];

  const styles =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3">' +
    '<numFmt numFmtId="164" formatCode="#,##0&quot; đ&quot;"/>' +
    '<numFmt numFmtId="165" formatCode="0.00%"/>' +
    '<numFmt numFmtId="166" formatCode="#,##0.###&quot; đ&quot;"/>' +
    '</numFmts>' +
    // Calibri là font mặc định của Excel, có đủ dấu tiếng Việt trên cả Windows
    // lẫn macOS. Đừng đổi sang font chỉ cài sẵn ở một hệ — máy thiếu font thì
    // Excel thay bừa và bảng vỡ khung.
    '<fonts count="7">' +
    '<font><sz val="11"/><color rgb="FF1F2933"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FF1F2933"/><name val="Calibri"/></font>' +
    '<font><i/><sz val="11"/><color rgb="FF6B7280"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="15"/><color rgb="FF0F766E"/><name val="Calibri"/></font>' +
    '<font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="8">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill>' +
    // Dải kẻ dòng chẵn/lẻ. Rất nhạt, chỉ đủ để mắt bám hàng khi bảng rộng 24
    // cột — đậm hơn thì in ra đen sì và tốn mực.
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF7F9FA"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE7F5EC"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF6E3"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFCECEA"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="3">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +
    // Lưới kẻ quanh từng ô — đây là thứ khiến bảng in ra đọc được. Màu xám nhạt
    // chứ không đen: 24 cột kẻ đen thì rối hơn là không kẻ.
    '<border>' +
    '<left style="thin"><color rgb="FFD9DEE3"/></left>' +
    '<right style="thin"><color rgb="FFD9DEE3"/></right>' +
    '<top style="thin"><color rgb="FFD9DEE3"/></top>' +
    '<bottom style="thin"><color rgb="FFD9DEE3"/></bottom>' +
    '<diagonal/></border>' +
    '<border><left/><right/><top/>' +
    '<bottom style="medium"><color rgb="FF0B5D57"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${XF.length}">` +
    XF.map((xf) =>
      `<xf numFmtId="${xf.numFmt}" fontId="${xf.font}" fillId="${xf.fill}" borderId="${xf.border}" xfId="0"`
      + ' applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">'
      + ALIGNMENT[xf.align] + '</xf>').join('') +
    '</cellXfs>' +
    // Bắt buộc với các bộ đọc chặt (openpyxl cảnh báo "no default style" nếu
    // thiếu). Excel vẫn mở được khi không có, nhưng khai đủ thì an toàn hơn.
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  const parts = sheets.map((sh, i) => {
    const built = buildSheetXml(sh);
    return { name: safeSheetName(sh.sheetName, i), xml: built.xml, links: built.links };
  });

  const files = [
    { name: '[Content_Types].xml', data: utf8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      parts.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>') },
    { name: '_rels/.rels', data: utf8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>') },
    { name: 'xl/workbook.xml', data: utf8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' +
      parts.map((sh, i) => `<sheet name="${xmlEscape(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets></workbook>') },
    { name: 'xl/_rels/workbook.xml.rels', data: utf8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      parts.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${parts.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      '</Relationships>') },
    { name: 'xl/styles.xml', data: utf8(styles) },
    ...parts.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: utf8(sh.xml) })),
    ...parts.flatMap((sh, i) => (sh.links.length
      ? [{
          name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
          data: utf8(
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            sh.links.map((link, k) =>
              `<Relationship Id="rId${k + 1}" ` +
              'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" ' +
              `Target="${xmlEscape(link.target)}" TargetMode="External"/>`).join('') +
            '</Relationships>')
        }]
      : []))
  ];

  return zip(files);
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Chuyển nội dung .xlsx thành data: URL cho `chrome.downloads`. */
export function xlsxDataUrl(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return `data:${XLSX_MIME};base64,${btoa(bin)}`;
}
