import { parseDate, VN_UTC_OFFSET_HOURS } from './core.js';

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
    .toWellFormed()
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
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
 *  Chỉ số kiểu phải khớp ĐÚNG thứ tự các <xf> trong <cellXfs> ở styles.xml.
 * ------------------------------------------------------------------------ */
const CELL_TYPES = ['text','money','percent','number','url','moneyFraction','date','datetime','note','decimal','integer'];
// Normal = 0, header = 1. Unused worksheet cells must retain a plain default style.
const BODY_FILLS=[0,3,4,5,6];
const EMPHASIS=['','bold','italic'];
const STYLE_SPECS=CELL_TYPES.flatMap(type=>BODY_FILLS.flatMap(fill=>EMPHASIS.map(emphasis=>({type,fill,emphasis}))));
const STYLE_INDEX=new Map(STYLE_SPECS.map((spec,index)=>[`${spec.type}:${spec.fill}:${spec.emphasis}`,index+2]));
const GATE_FILLS=new Map([['MATCH',4],['INSUFFICIENT',5],['OUT_OF_RANGE',6]]);
function styleOf(type,row,index,emphasis=''){
  const fill=GATE_FILLS.get(row.__gate)??(index%2?3:0);
  return STYLE_INDEX.get(`${CELL_TYPES.includes(type)?type:'text'}:${fill}:${EMPHASIS.includes(emphasis)?emphasis:''}`);
}
const NUMERIC_TYPES = new Set(['money','percent','number','decimal','integer']);
const isNum = v => (typeof v === 'number' && Number.isFinite(v)) ||
  (typeof v === 'string' && /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(v.trim()) && Number.isFinite(Number(v)));

/** Excel stores no time zone. Export the Vietnamese wall clock, not the PC clock. */
export function excelDate(value) {
  if (!(value instanceof Date) && typeof value !== 'number' &&
      !(typeof value === 'string' && /^(?:\d{4}-\d{2}-\d{2}(?:[T ].*)?|\d{1,2}[/-]\d{1,2}[/-]\d{4}(?: .*)?)$/.test(value.trim()))) return null;
  const iso=parseDate(value);
  if (!iso) return null;
  const localMs=Date.parse(iso)+VN_UTC_OFFSET_HOURS*3600000;
  const year=new Date(localMs).getUTCFullYear();
  if (year<1900 || year>9999) return null;
  const serial=(localMs-Date.UTC(1899,11,31))/86400000;
  return serial+(serial>=60?1:0); // Excel's historical fictitious leap day.
}

function isHttpUrl(value) {
  const text=String(value??'').trim();
  if (!text || text.length>4096) return false;
  try { const u=new URL(text);return ['https:','http:'].includes(u.protocol)&&Boolean(u.hostname)&&!u.username&&!u.password; }
  catch { return false; }
}

function bodyType(column,row) {
  const type=(column.typeKey&&row[column.typeKey])||column.type||'text';
  return type==='auto' ? (typeof row[column.key]==='number'?(Number.isInteger(row[column.key])?'number':'decimal'):'text') : type;
}

function visibleValue(column,row) {
  const value=row[column.key];
  return column.type==='url'&&column.urlLabel&&isHttpUrl(value)?String(column.urlLabel):value;
}

function buildSheetXml({columns=[],rows=[],sheetName='Dữ liệu',freezeColumns=1,orientation=''}) {
  const cols=columns.filter(Boolean), data=rows||[], lastCol=colName(cols.length||1),lastRow=data.length+1,links=[];
  if(cols.length>16384 || lastRow>1048576)throw new Error('Dữ liệu vượt giới hạn hàng/cột của Excel. Hãy thu hẹp phạm vi xuất.');
  const widths=cols.map(c=>{
    let max=String(c.header||'').length;
    if(!c.width)for(const row of data)max=Math.max(max,String(row[c.key]??'').length);
    const minWidth=c.type==='datetime'?22:c.type==='date'?14:c.type==='money'?20:c.type==='percent'?14:8;
    return Math.max(minWidth,Math.min(Number(c.width)||Math.max(10,Math.min(max+3,55)),80));
  });
  const cell=(ref,style,value,type)=>{
    if(value===null||value===undefined||value==='')return `<c r="${ref}" s="${style}"/>`;
    if(type==='date'||type==='datetime'){
      const serial=excelDate(value);
      if(serial!==null)return `<c r="${ref}" s="${style}"><v>${type==='date'?Math.floor(serial):serial}</v></c>`;
    }
    if(NUMERIC_TYPES.has(type)&&isNum(value))return `<c r="${ref}" s="${style}"><v>${type==='percent'?Number(value)/100:Number(value)}</v></c>`;
    // Inline strings keep identifiers/leading zeroes and formula-like text inert.
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value).slice(0,32767))}</t></is></c>`;
  };
  const headerCells=cols.map((c,i)=>cell(`${colName(i+1)}1`,1,c.header,'text')).join('');
  const bodyRows=data.map((row,ri)=>{
    const n=ri+2;
    const cells=cols.map((c,i)=>{
      const type=bodyType(c,row),value=row[c.key];
      const styleType=type==='money'&&isNum(value)&&!Number.isInteger(Number(value))?'moneyFraction'
        :(NUMERIC_TYPES.has(type)&&!isNum(value))||(['date','datetime'].includes(type)&&excelDate(value)===null)?'text':type;
      const ref=`${colName(i+1)}${n}`;
      if(type==='url'&&isHttpUrl(value))links.push({ref,target:String(value).trim()});
      return cell(ref,styleOf(styleType,row,ri,c.emphasis),visibleValue(c,row),type);
    }).join('');
    // Date/money formatting is compact. Long names and notes wrap with an adequate row height.
    const lines=Math.max(1,...cols.map((c,i)=>{
      if([...NUMERIC_TYPES,'date','datetime'].includes(bodyType(c,row)))return 1;
      return String(visibleValue(c,row)??'').split(/\r?\n/).reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/Math.max(4,widths[i]-3))),0);
    }));
    return `<row r="${n}" ht="${Math.min(409,Math.max(30,lines*15+10))}" customHeight="1">${cells}</row>`;
  }).join('');
  const frozen=Math.min(Math.max(0,Number(freezeColumns)||0),Math.max(0,cols.length-1));
  const headerLines=Math.max(2,...cols.map((c,i)=>Math.ceil(String(c.header||'').length/Math.max(4,widths[i]-3))));
  return {links,xml:
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
    '<sheetPr><tabColor rgb="FF0F766E"/><pageSetUpPr fitToPage="1"/></sheetPr>'+
    `<dimension ref="A1:${lastCol}${lastRow}"/>`+
    '<sheetViews><sheetView workbookViewId="0" showGridLines="0">'+
    `<pane ${frozen?`xSplit="${frozen}" `:''}ySplit="1" topLeftCell="${colName(frozen+1)}2" activePane="${frozen?'bottomRight':'bottomLeft'}" state="frozen"/>`+
    '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="30"/>'+
    (cols.length?'<cols>'+widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')+'</cols>':'')+
    `<sheetData><row r="1" ht="${headerLines*15+12}" customHeight="1">${headerCells}</row>${bodyRows}</sheetData>`+
    (data.length?`<autoFilter ref="A1:${lastCol}${lastRow}"/>`:'')+
    (links.length?'<hyperlinks>'+links.map((link,i)=>`<hyperlink ref="${link.ref}" r:id="rId${i+1}"/>`).join('')+'</hyperlinks>':'')+
    '<printOptions horizontalCentered="1"/>'+
    '<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>'+
    `<pageSetup paperSize="${cols.length>7?8:9}" orientation="${orientation==='landscape'||cols.length>5?'landscape':'portrait'}" fitToWidth="${cols.length>16?2:1}" fitToHeight="0"/>`+
    `<headerFooter><oddHeader>${xmlEscape('&L'+sheetName+'&RGiáo Sư Cùi Bắp')}</oddHeader><oddFooter>${xmlEscape('&LĐơn vị tiền: VND · Giờ Việt Nam (UTC+7)&RTrang &P / &N')}</oddFooter></headerFooter>`+
    '</worksheet>'};
}

function safeSheetName(name,index,used) {
  const base=String(name||'').toWellFormed().replace(/[\\/?*[\]:\u0000-\u001F\uFFFE\uFFFF]/g,' ').replace(/^'+|'+$/g,'').trim().slice(0,31)||`Trang ${index+1}`;
  let safe=base,n=1;
  while(used.has(safe.toLocaleLowerCase('vi'))){const tail=` (${++n})`;safe=base.slice(0,31-tail.length)+tail;}
  used.add(safe.toLocaleLowerCase('vi'));
  return safe;
}

function stylesXml() {
  const formats=[[164,'#,##0" đ";[Red]-#,##0" đ"'],[165,'0.00%;[Red]-0.00%'],[166,'#,##0.###" đ";[Red]-#,##0.###" đ"'],[167,'dd/mm/yyyy'],[168,'dd/mm/yyyy hh:mm'],[169,'#,##0.###']];
  const typeFormats={text:49,money:164,percent:165,number:3,url:49,moneyFraction:166,date:167,datetime:168,note:49,decimal:169,integer:1};
  const body=STYLE_SPECS.map(({type,fill,emphasis})=>{
    const font=type==='url'?2:emphasis==='bold'?4:emphasis==='italic'||type==='note'?3:0;
    const align=NUMERIC_TYPES.has(type)||type==='moneyFraction'?'right':['date','datetime'].includes(type)?'center':'left';
    return `<xf numFmtId="${typeFormats[type]}" fontId="${font}" fillId="${fill}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="${align}" vertical="top" wrapText="1"/></xf>`;
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    `<numFmts count="${formats.length}">`+formats.map(([id,code])=>`<numFmt numFmtId="${id}" formatCode="${xmlEscape(code)}"/>`).join('')+'</numFmts>'+
    '<fonts count="5">'+
    '<font><sz val="11"/><color rgb="FF17324D"/><name val="Arial"/></font>'+
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>'+
    '<font><u/><sz val="11"/><color rgb="FF0F766E"/><name val="Arial"/></font>'+
    '<font><i/><sz val="11"/><color rgb="FF526477"/><name val="Arial"/></font>'+
    '<font><b/><sz val="11"/><color rgb="FF17324D"/><name val="Arial"/></font></fonts>'+
    '<fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'+
    '<fill><patternFill patternType="solid"><fgColor rgb="FF17324D"/><bgColor indexed="64"/></patternFill></fill>'+
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF0F7F6"/><bgColor indexed="64"/></patternFill></fill>'+
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE8F5EC"/><bgColor indexed="64"/></patternFill></fill>'+
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF3D6"/><bgColor indexed="64"/></patternFill></fill>'+
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF0F3F7"/><bgColor indexed="64"/></patternFill></fill></fills>'+
    '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>'+
    '<border><left style="thin"><color rgb="FFDCE5EA"/></left><right style="thin"><color rgb="FFDCE5EA"/></right><top style="thin"><color rgb="FFDCE5EA"/></top><bottom style="thin"><color rgb="FFDCE5EA"/></bottom><diagonal/></border>'+
    '<border><left style="thin"><color rgb="FFFFFFFF"/></left><right style="thin"><color rgb="FFFFFFFF"/></right><top/><bottom style="medium"><color rgb="FF0F766E"/></bottom><diagonal/></border></borders>'+
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
    `<cellXfs count="${2+STYLE_SPECS.length}">`+
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'+
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'+body+'</cellXfs>'+
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}

function metadataSheet(spec,sheets) {
  const info=spec.exportInfo||{};
  const rows=[
    {label:'Nguồn dữ liệu',value:info.source||'Hệ thống mạng đấu thầu quốc gia (e-GP); bản dữ liệu tiện ích đã nhận.',kind:'note'},
    {label:'Trang nguồn',value:'https://muasamcong.mpi.gov.vn',kind:'url'},
    {label:'Thời điểm xuất (giờ Việt Nam)',value:info.exportedAt||new Date().toISOString(),kind:'datetime'},
    {label:'Phạm vi',value:info.scope||'Chỉ các bản ghi được chọn để xuất từ dữ liệu đã thu thập.',kind:'note'},
    {label:'Độ đầy đủ',value:info.coverage||'Không suy ra toàn bộ dữ liệu trên e-GP từ số dòng trong tệp.',kind:'note'},
    {label:'Quy ước',value:'Tiền: đồng Việt Nam (VND). Ngày giờ: UTC+7. Ô trống là chưa có dữ liệu, không phải 0.',kind:'note'},
    ...sheets.map(sh=>({label:`Số dòng · ${sh.sheetName||'Dữ liệu'}`,value:sh.rows?.length||0,kind:'number'})),
    ...(Array.isArray(info.notes)?info.notes:[]).map((value,i)=>({label:`Ghi chú ${i+1}`,value,kind:'note'}))
  ];
  return {sheetName:'Thông tin xuất',freezeColumns:0,columns:[{header:'Nội dung',key:'label',width:38},{header:'Thông tin',key:'value',typeKey:'kind',width:80}],rows};
}

/** Native XLSX: typed cells, safe links, consistent readable tables and source metadata. */
export function buildXlsx(spec={}) {
  const sheets=Array.isArray(spec.sheets)&&spec.sheets.length?[...spec.sheets]:[{...spec,sheetName:spec.sheetName||'Dữ liệu'}];
  sheets.push(metadataSheet(spec,sheets));
  const used=new Set();
  const parts=sheets.map((sh,i)=>{const name=safeSheetName(sh.sheetName,i,used);return {name,...buildSheetXml({...sh,sheetName:name})};});
  const head='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const relNs='http://schemas.openxmlformats.org/package/2006/relationships';
  const docRel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files=[
    {name:'[Content_Types].xml',data:utf8(head+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
      parts.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>')},
    {name:'_rels/.rels',data:utf8(head+`<Relationships xmlns="${relNs}"><Relationship Id="rId1" Type="${docRel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`)},
    {name:'xl/workbook.xml',data:utf8(head+`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${docRel}"><sheets>`+
      parts.map((sh,i)=>`<sheet name="${xmlEscape(sh.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+'</sheets><definedNames>'+
      parts.map((sh,i)=>`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${xmlEscape("'"+sh.name.replace(/'/g,"''")+"'!$1:$1")}</definedName>`).join('')+
      '</definedNames></workbook>')},
    {name:'xl/_rels/workbook.xml.rels',data:utf8(head+`<Relationships xmlns="${relNs}">`+
      parts.map((_,i)=>`<Relationship Id="rId${i+1}" Type="${docRel}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+
      `<Relationship Id="rId${parts.length+1}" Type="${docRel}/styles" Target="styles.xml"/></Relationships>`)},
    {name:'xl/styles.xml',data:utf8(stylesXml())},
    ...parts.map((sh,i)=>({name:`xl/worksheets/sheet${i+1}.xml`,data:utf8(sh.xml)})),
    ...parts.flatMap((sh,i)=>sh.links.length?[{name:`xl/worksheets/_rels/sheet${i+1}.xml.rels`,data:utf8(head+`<Relationships xmlns="${relNs}">`+
      sh.links.map((link,k)=>`<Relationship Id="rId${k+1}" Type="${docRel}/hyperlink" Target="${xmlEscape(link.target)}" TargetMode="External"/>`).join('')+'</Relationships>')}]:[])
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
