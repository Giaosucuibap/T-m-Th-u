import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildXlsx,excelDate} from '../GiaoSuCuiBap/lib/xlsx.js';
import {createExportRuntime} from '../GiaoSuCuiBap/lib/runtime-export.js';
import {normalizeBidderTable} from '../GiaoSuCuiBap/lib/bbmt.js';

export function unzipStore(bytes){
  const b=Buffer.from(bytes),files={};let p=0;
  while(b.readUInt32LE(p)===0x04034b50){
    assert.equal(b.readUInt16LE(p+8),0);
    const size=b.readUInt32LE(p+18),nameLength=b.readUInt16LE(p+26),extra=b.readUInt16LE(p+28);
    const name=b.subarray(p+30,p+30+nameLength).toString('utf8');
    const dataAt=p+30+nameLength+extra;files[name]=b.subarray(dataAt,dataAt+size).toString('utf8');p=dataAt+size;
  }
  return files;
}
function namedSheet(files,name){
  const names=[...files['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map(match=>match[1]);
  const index=names.indexOf(name);assert.ok(index>=0,`Missing sheet ${name}`);
  return files[`xl/worksheets/sheet${index+1}.xml`];
}
const rowCell=(xml,ref)=>xml.match(new RegExp(`<c r="${ref}"[^>]*/>`))?.[0]||xml.match(new RegExp(`<c r="${ref}"[^>]*>([\\s\\S]*?)<\\/c>`))?.[0];
const now='2026-09-24T03:00:00.000Z';
export function makeRuntime(state,profile){
  const outputs=[];
  const runtime=createExportRuntime({getState:async()=>structuredClone(state),readSearchState:async()=>({revision:'r1'}),
    stamp:()=> '2026-09-24',numOrNull:v=>v===null||v===undefined||v===''?null:Number(v),
    getContractorProfile:async()=>({ok:true,profile}),
    downloadXlsx:async(filename,spec)=>{outputs.push({filename,spec,bytes:buildXlsx(spec)});return outputs.length;}});
  return {runtime,outputs};
}

test('412 native XLSX keeps IDs/formula-like text inert, currency and percent numeric, zero distinct from missing',()=>{
  const files=unzipStore(buildXlsx({sheetName:'Kiểm tra',exportInfo:{exportedAt:now},columns:[
    {header:'MST',key:'tax'},{header:'Tên',key:'name'},{header:'Giá',key:'money',type:'money'},
    {header:'Giảm',key:'rate',type:'percent'},{header:'Ngày',key:'date',type:'datetime'},{header:'Nguồn',key:'url',type:'url'}],rows:[
    {tax:'0012345678',name:'=HYPERLINK("https://example.invalid")',money:8768657616,rate:0.52,date:now,url:'https://muasamcong.mpi.gov.vn/test?a=1&b=2'},
    {tax:'002',name:'Không có giá',money:null,rate:0,date:'31/02/2026',url:'javascript:alert(1)'},
    {tax:'003',name:'Giá lẻ',money:2609041591.923,rate:-1,date:'2026-09-24 10:00:00',url:'https://user:secret@example.invalid/'},
    {tax:'004',name:'Khoảng trắng không phải 0',money:' ',rate:null,date:null}]}));
  const sheet=files['xl/worksheets/sheet1.xml'];
  assert.match(rowCell(sheet,'A2'),/t="inlineStr".*0012345678/);
  assert.match(rowCell(sheet,'B2'),/t="inlineStr"/);assert.equal(sheet.includes('<f>'),false);
  assert.match(rowCell(sheet,'C2'),/<v>8768657616<\/v>/);assert.match(rowCell(sheet,'D2'),/<v>0.0052<\/v>/);
  assert.match(rowCell(sheet,'C3'),/\/>$/);assert.match(rowCell(sheet,'D3'),/<v>0<\/v>/);
  assert.match(rowCell(sheet,'C4'),/<v>2609041591.923<\/v>/);
  assert.match(rowCell(sheet,'E2'),new RegExp(`<v>${excelDate(now)}<`));assert.match(rowCell(sheet,'E3'),/t="inlineStr"/);
  assert.match(rowCell(sheet,'C5'),/t="inlineStr"/);
  const rel=files['xl/worksheets/_rels/sheet1.xml.rels'];assert.match(rel,/a=1&amp;b=2/);assert.equal(rel.includes('secret'),false);assert.equal(rel.includes('javascript'),false);
});

test('412 Excel dates are Vietnam wall-clock values in every host zone and reject invalid dates',()=>{
  assert.equal(excelDate(now),excelDate('2026-09-24 10:00:00'));
  assert.equal(excelDate(now),excelDate('24/09/2026 10:00:00'));
  assert.equal(excelDate('1900-01-01'),1);assert.equal(excelDate('1900-02-28'),59);assert.equal(excelDate('1900-03-01'),61);
  for(const v of ['31/02/2026','bad','10:00 24/9/26','2026-13-02',null,''])assert.equal(excelDate(v),null);
});

test('412 XLSX has deliberate typography, banded bordered rows, print titles/margins, freeze and filters',()=>{
  const files=unzipStore(buildXlsx({sheetName:'Bảng giá',columns:[{header:'Nhà thầu và liên danh',key:'name',width:18},{header:'Giá',key:'price',type:'money'},{header:'Ghi chú',key:'note',type:'note'}],rows:[{name:'Tên nhà thầu dài cần xuống dòng để đọc rõ',price:1,note:'Chưa có kết quả'},{name:'B',price:2}]}));
  const sheet=files['xl/worksheets/sheet1.xml'],styles=files['xl/styles.xml'];
  assert.match(sheet,/xSplit="1" ySplit="1"/);assert.match(sheet,/<autoFilter ref="A1:C3"/);
  assert.match(sheet,/<pageMargins left="0.3"/);assert.match(sheet,/fitToHeight="0"/);assert.match(sheet,/showGridLines="0"/);
  assert.notEqual(rowCell(sheet,'A2').match(/s="(\d+)"/)[1],rowCell(sheet,'A3').match(/s="(\d+)"/)[1]);
  assert.match(styles,/<name val="Arial"/);assert.match(styles,/<b\/>/);assert.match(styles,/<i\/>/);assert.match(styles,/FF17324D/);assert.match(styles,/FF0F766E/);
  assert.match(styles,/<cellXfs count="\d+"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"\/>/);
  assert.match(styles,/style="thin"/);assert.match(styles,/dd\/mm\/yyyy hh:mm/);
  assert.match(files['xl/workbook.xml'],/_xlnm.Print_Titles/);assert.match(files['xl/worksheets/sheet2.xml'],/Ô trống là chưa có dữ liệu/);
});

test('412 workbook sanitizes names, deduplicates case-insensitively and keeps malformed text XML-safe',()=>{
  const files=unzipStore(buildXlsx({sheets:[{sheetName:'A/B',columns:[{header:'Tên',key:'v'}],rows:[{v:'A\u0000B\ud800C\uffffD'}]},{sheetName:'a b',columns:[],rows:[]},{sheetName:'Thông tin xuất',columns:[],rows:[]}]}));
  const wb=files['xl/workbook.xml'];assert.match(wb,/name="A B"/);assert.match(wb,/name="a b \(2\)"/);assert.match(wb,/name="Thông tin xuất \(2\)"/);
  const sheet=files['xl/worksheets/sheet1.xml'];assert.equal(/[\u0000\ud800\uffff]/.test(sheet),false);assert.match(sheet,/AB�CD/);
});

test('412 e-GP captions keep exact deep links clickable and both quick/detail rows compact',async()=>{
  const detailUrl='https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?detail='+ 'x'.repeat(1600);
  const t={key:'a',notifyNo:'IB2600000001',bidName:'Gói thử',closeDate:'2099-01-01T03:00:00Z',detailUrl};
  const {runtime,outputs}=makeRuntime({tenders:[t],runs:[]});await runtime.exportCsv(false,['a']);
  const files=unzipStore(outputs[0].bytes);
  for(const number of [1,2]){
    const sheet=files[`xl/worksheets/sheet${number}.xml`];
    assert.match(sheet,/Mở e-GP/);assert.ok(Number(sheet.match(/<row r="2" ht="(\d+)"/)[1])<=60);assert.equal(sheet.includes(detailUrl),false);
    assert.equal(files[`xl/worksheets/_rels/sheet${number}.xml.rels`].includes(`Target="${detailUrl}"`),true);
    assert.equal(outputs[0].spec.sheets[number-1].rows[0].detailUrl,detailUrl);
  }
});

test('412 actual TBMT exporter preserves identical compact/detail filtered rows and blocks incomplete keys/revision',async()=>{
  const tenders=Array.from({length:86},(_,i)=>({key:`key-${i}`,notifyNo:`IB${String(i).padStart(10,'0')}`,bidName:`Gói ${i}`,score:90,price:100+i,closeDate:'2099-01-01T03:00:00Z',filterState:i<80?'MATCH':'OUT_OF_RANGE'}));
  const run={id:'run',foundKeys:tenders.map(t=>t.key),resultStates:Object.fromEntries(tenders.map(t=>[t.key,{filterState:t.filterState,price:t.price}])),coverage:{text:'Đã thu thập 86/100 gói; chưa đầy đủ.'}};
  const {runtime,outputs}=makeRuntime({tenders,runs:[run]});
  const keys=tenders.slice(0,80).map(t=>t.key);
  await runtime.exportCsv(false,keys,'run',{criteriaState:'MATCH'},'r1');
  const result=outputs[0],files=unzipStore(result.bytes);assert.equal(result.spec.sheets[0].sheetName,'Xem nhanh');assert.equal(result.spec.sheets[1].sheetName,'Gói thầu');
  for(const sheet of [files['xl/worksheets/sheet1.xml'],files['xl/worksheets/sheet2.xml']]){
    assert.equal((sheet.match(/<row r=/g)||[]).length,81);assert.match(sheet,/IB0000000079/);assert.equal(sheet.includes('IB0000000080'),false);
  }
  assert.match(namedSheet(files,'Thông tin xuất'),/86\/100/);assert.match(namedSheet(files,'Thông tin xuất'),/80 gói sau bộ lọc/);
  await assert.rejects(runtime.exportCsv(false,keys.slice(0,30),'run',{criteriaState:'MATCH'},'r1'),/mọi trang/);
  await assert.rejects(runtime.exportCsv(false,keys,'run',{criteriaState:'MATCH'},'stale'),/thay đổi/);
});

test('412 actual BBMT exporter shows unread packages and precise price basis without treating missing bidders as zero',async()=>{
  const state={bidOpenScan:{packages:[{notifyNoStand:'IB2600509787-01',bidName:'Thi công công trình',readState:'OK',scannedAt:now,bidPrice:8814271253,priceBasis:8814271253,priceBasisLabel:'Giá gói thầu (e-GP)',bidders:[{name:'CÔNG TY TNHH TOÀN PHÁT YB99',taxCode:'05200657680',bidPrice:8768657616,finalPrice:8768657616,vsPackageAmount:45613637,vsPackageRate:0.52}]},{notifyNoStand:'IB2600000002-00',bidName:'Biên bản đang chờ',readState:'TIMEOUT',numBidderJoin:2,bidders:null}]}};
  const {runtime,outputs}=makeRuntime(state);await runtime.exportBidOpenCsv();
  const {spec,bytes}=outputs[0],files=unzipStore(bytes);assert.equal(spec.sheets[0].columns.length,8);assert.equal(spec.sheets[1].columns.length,24);
  assert.equal(spec.sheets[2].sheetName,'Chưa đọc đủ');assert.equal(spec.sheets[2].rows[0].notifyNoStand,'IB2600000002-00');
  assert.match(files['xl/worksheets/sheet2.xml'],/Giá gói thầu \(e-GP\)/);assert.match(files['xl/worksheets/sheet3.xml'],/Chưa đọc được/);assert.match(namedSheet(files,'Thông tin xuất'),/1 gói chưa đọc đủ/);
  assert.equal(spec.sheets[0].rows[0].finalPrice,8768657616);assert.equal(spec.sheets[0].rows[0].vsPackageAmount,45613637);
  const pending=makeRuntime({bidOpenScan:{packages:[state.bidOpenScan.packages[1]]}});await pending.runtime.exportBidOpenCsv();assert.equal(pending.outputs[0].spec.sheets[2].rows.length,1);
});

test('412 BBMT multi-lot provenance distinguishes the same bidder and never exports unsupported package comparisons',async()=>{
  const bidders=normalizeBidderTable([
    {contractorCode:'vn0012345678',contractorName:'Công ty A',lotCode:'LOT-1',lotName:'Xây trường',lotPrice:100,discountPercent:5},
    {contractorCode:'vn0012345678',contractorName:'Công ty A',lotCode:'LOT-2',lotName:'Giám sát',lotPrice:20,lotFinalPrice:18}
  ],1000);
  const p={notifyNoStand:'IB2600000001-00',bidName:'Gói nhiều lô',readState:'OK',priceBasis:1000,priceBasisLabel:'Dự toán được duyệt (e-GP)',bidders};
  const {runtime,outputs}=makeRuntime({bidOpenScan:{packages:[p,{...p,notifyNoStand:'IB2600000002-00',comparisonPending:true,bidders:[{name:'B',finalPrice:90,finalPriceDerived:false,vsPackageAmount:10,vsPackageRate:10}]}]}});
  await runtime.exportBidOpenCsv();
  const {spec,bytes}=outputs[0],quick=spec.sheets[0],detail=spec.sheets[1],files=unzipStore(bytes);
  assert.equal(quick.columns.length,8);assert.equal(detail.rows.length,3);
  const one=detail.rows.find(r=>r.lotCode==='LOT-1'),two=detail.rows.find(r=>r.lotCode==='LOT-2');
  assert.equal(one.finalPrice,95);assert.equal(two.finalPrice,18);assert.equal(one.name,two.name);
  assert.equal(one.lotLabel,'LOT-1 · Xây trường');assert.equal(two.lotLabel,'LOT-2 · Giám sát');
  assert.equal(one.finalPriceSource,'Tính từ giá dự thầu và tỷ lệ giảm');assert.equal(two.finalPriceSource,'e-GP công bố');
  for(const row of detail.rows){assert.equal(row.vsPackageAmount,null);assert.equal(row.vsPackageRate,null);assert.match(row.comparisonNote,/Chưa/);}
  const q1=quick.rows.find(r=>r.lotCode==='LOT-1'),q2=quick.rows.find(r=>r.lotCode==='LOT-2');
  assert.notEqual(q1.name,q2.name);assert.match(q1.name,/LOT-1/);assert.match(q1.name,/tính từ tỷ lệ giảm/);assert.match(q1.name,/Chưa đối chiếu/);
  assert.match(files['xl/worksheets/sheet2.xml'],/Nguồn giá sau giảm/);assert.match(files['xl/worksheets/sheet2.xml'],/LOT-2 · Giám sát/);
});

test('412 mixed overview values keep numeric counts integer-formatted and identifiers as text',()=>{
  const files=unzipStore(buildXlsx({columns:[{header:'Chỉ tiêu',key:'label'},{header:'Giá trị',key:'value',type:'auto'}],rows:[{label:'Số gói',value:1},{label:'Trung vị',value:0.517},{label:'MST',value:'0012345678'}]}));
  const sheet=files['xl/worksheets/sheet1.xml'],styles=files['xl/styles.xml'];
  const xfs=styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g);
  const countStyle=Number(rowCell(sheet,'B2').match(/s="(\d+)"/)[1]);
  assert.match(xfs[countStyle],/numFmtId="3"/);assert.match(rowCell(sheet,'B2'),/<v>1<\/v>/);assert.match(rowCell(sheet,'B3'),/<v>0.517<\/v>/);assert.match(rowCell(sheet,'B4'),/t="inlineStr".*0012345678/);
});

test('412 actual plan export preserves only-unannounced scope, numeric prices and warns against repeated investment totals',async()=>{
  const {runtime,outputs}=makeRuntime({planLookup:{coverage:{text:'10/25 kế hoạch đã nhận.'},plans:[{planNoStand:'PL2600000001-00',name:'Kế hoạch A',hasUnannounced:true,decisionDate:now,investTotal:9000000000,packages:[{name:'Xây lắp',price:4e9},{name:'Giám sát',price:1e8}]},{planNoStand:'PL2600000002-00',name:'Kế hoạch B',hasUnannounced:false,packages:[]}]}});
  await runtime.exportPlansCsv({onlyUnannounced:true});
  const {spec,bytes}=outputs[0],files=unzipStore(bytes);assert.equal(spec.sheets[0].rows.length,2);assert.equal(spec.sheets[1].rows.length,2);assert.equal(spec.sheets[1].columns.length,14);
  assert.equal(files['xl/worksheets/sheet1.xml'].includes('PL2600000002-00'),false);assert.match(namedSheet(files,'Thông tin xuất'),/không cộng cột này/);assert.match(namedSheet(files,'Thông tin xuất'),/10\/25/);
});

test('412 same-day XLSX downloads preserve previous files rather than overwriting',()=>{
  const source=fs.readFileSync(new URL('../GiaoSuCuiBap/background.js',import.meta.url),'utf8');
  const download=source.slice(source.indexOf('async function downloadXlsx'),source.indexOf('async function downloadXlsx')+650);
  assert.match(download,/conflictAction:'uniquify'/);
});
