import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {buildXlsx,colName} from '../GiaoSuCuiBap/lib/xlsx.js';
import {createExportRuntime} from '../GiaoSuCuiBap/lib/runtime-export.js';
import {summarizeArea} from '../GiaoSuCuiBap/lib/localmarket.js';
import {summarizeInvestor} from '../GiaoSuCuiBap/lib/investor.js';

// Same injected Chrome boundary as export-413, with the actual product writer.
function makeRuntime(state){
  const output=[];
  return {output,runtime:createExportRuntime({
    getState:async()=>structuredClone(state),readSearchState:async()=>({revision:'same'}),
    stamp:()=> '2026-10-05',numOrNull:value=>value==null||value===''?null:Number(value),
    downloadXlsx:async(name,spec)=>{output.push({name,spec,bytes:buildXlsx(spec)});return output.length;}
  })};
}
function unpack(bytes){
  const b=Buffer.from(bytes),files={};let p=0;
  while(p+30<=b.length&&b.readUInt32LE(p)===0x04034b50){
    const method=b.readUInt16LE(p+8),size=b.readUInt32LE(p+18),n=b.readUInt16LE(p+26),extra=b.readUInt16LE(p+28),start=p+30+n+extra,body=b.subarray(start,start+size);
    assert.ok(method===0||method===8,'OOXML ZIP compression method');
    files[b.subarray(p+30,p+30+n).toString()]=(method===8?zlib.inflateRawSync(body):body).toString();p=start+size;
  }
  assert.ok(files['xl/workbook.xml']&&files['xl/styles.xml']);return files;
}
const sheetSpec=(output,name)=>output.spec.sheets.find(s=>s.sheetName===name);
const sheetXml=(files,name)=>{
  const names=[...files['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map(m=>m[1]);
  const i=names.indexOf(name);assert.ok(i>=0,'Worksheet exists: '+name);return files[`xl/worksheets/sheet${i+1}.xml`];
};
const cellXml=(sheet,ref)=>{const found=sheet.match(new RegExp(`<c r="${ref}"[^>]*\\/>|<c r="${ref}"[^>]*>[\\s\\S]*?<\\/c>`));assert.ok(found,'Cell exists: '+ref);return found[0];};
function styleOf(files,cell){
  const style=cell.match(/\bs="(\d+)"/);assert.ok(style);
  const xfs=files['xl/styles.xml'].match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g);
  return xfs[Number(style[1])];
}
const refOf=(sheet,key,row=2)=>{const i=sheet.columns.findIndex(c=>c.key===key);assert.ok(i>=0,key);return colName(i+1)+row;};
const assertNumeric=(cell,number)=>{assert.match(cell,new RegExp(`<v>${number}<\\/v>`));assert.doesNotMatch(cell,/inlineStr|<is>/);};
const assertBlank=cell=>assert.doesNotMatch(cell,/<v>|<is>|<t[\s>]/);

const owner='Chủ đầu tư kiểm thử tỉnh Lâm Đồng';
const coverage={serverTotal:10,fetched:10,match:10,insufficient:0,outOfRange:0,pagesRead:1,totalPages:1,complete:true,text:'Đã tải đủ 10/10 trong phạm vi truy vấn.'};
const award=(id,codes,price,more={})=>({
  key:`IB2699999${id}::00`,notifyNo:`IB2699999${id}`,notifyNoStand:`IB2699999${id}-00`,
  bidName:'Gói kiểm thử '+id,investorName:owner,investorCode:'vn0099999900',
  winningTaxCodes:codes,winnerName:'Nhà thầu '+codes[0],winningPrice:price,priceBasis:2000000,
  discountRate:10,decisionDate:'2026-09-15T03:00:00Z',fieldLabel:'Xây lắp',bidFormLabel:'Đấu thầu rộng rãi',
  isVenture:codes.length>1,memberNames:codes.length>1?codes.map(c=>'Thành viên '+c):[],numBidderJoin:2,
  provinceCodes:['68'],locations:[{provCode:'68',provName:'Tỉnh Lâm Đồng'}],
  detailUrl:`https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?notifyNo=IB2699999${id}`,...more
});
const soloA='0100000001',soloB='0100000002',ventureC='0100000003',ventureD='0100000004',unknownE='0100000005';
const concentrated=[...Array.from({length:7},(_,i)=>award(String(i).padStart(3,'0'),[soloA],100000)),award('007',[soloB],200000),award('008',[ventureC,ventureD],50000000),award('009',[unknownE],null)];

test('415 actual BBMT export preserves legacy numeric zero pairs while blanking stale rank and financial comparisons',async()=>{
  const old={name:'Nhà thầu giá 0',taxCode:soloA,bidPrice:0,finalPrice:0,discountPercent:0,priceRank:1,vsPackageRate:100,vsPackageAmount:1000000};
  const state={bidOpenScan:{id:'opening-zero-pair',scope:{province:'Tỉnh Lâm Đồng'},packages:[{notifyNoStand:'IB2699999991-00',bidName:'Biên bản kiểm thử',bidPrice:1000000,priceBasis:1000000,readState:'OK',bidders:[old]}]}};
  const {runtime,output}=makeRuntime(state);await runtime.exportBidOpenCsv();
  const detail=sheetSpec(output[0],'Biên bản mở thầu'),row=detail.rows[0],files=unpack(output[0].bytes),xml=sheetXml(files,'Biên bản mở thầu');
  assert.equal(row.bidderPrice,0);assert.equal(row.finalPrice,0);assert.equal(row.discountPercent,0);
  assert.equal(row.priceRank,null);assert.equal(row.vsPackageRate,null);assert.equal(row.vsPackageAmount,null);assert.equal(row.comparisonPending,true);
  assert.match(row.comparisonNote,/e-GP.*0.*chưa tính mức giảm hoặc xếp hạng/);assert.match(row.finalPriceSource,/e-GP.*0.*chưa đủ căn cứ/);
  for(const key of ['bidderPrice','finalPrice','discountPercent'])assertNumeric(cellXml(xml,refOf(detail,key)),0);
  for(const key of ['priceRank','vsPackageRate','vsPackageAmount'])assertBlank(cellXml(xml,refOf(detail,key)));
  const quick=sheetSpec(output[0],'Xem nhanh');assert.match(quick.rows[0].name,/chưa tính mức giảm hoặc xếp hạng/);
  assert.match(sheetXml(files,'Xem nhanh'),/chưa tính mức giảm hoặc xếp hạng/);
  assert.deepEqual(state.bidOpenScan.packages[0].bidders[0],old,'Export does not rewrite source/cache values');
});

test('415 BBMT positive-to-zero quote still exports an explicit 100% comparison and rank',async()=>{
  const {runtime,output}=makeRuntime({bidOpenScan:{scope:{},packages:[{notifyNoStand:'IB2699999992-00',readState:'OK',bidPrice:1000000,bidders:[{name:'Giảm toàn bộ',bidPrice:1000000,finalPrice:0,discountPercent:100,priceRank:1,vsPackageRate:100,vsPackageAmount:1000000}]}]}});
  await runtime.exportBidOpenCsv();const detail=sheetSpec(output[0],'Biên bản mở thầu'),row=detail.rows[0],files=unpack(output[0].bytes),xml=sheetXml(files,'Biên bản mở thầu');
  assert.equal(row.comparisonPending,false);assert.equal(row.priceRank,1);assert.equal(row.vsPackageRate,100);assert.equal(row.vsPackageAmount,1000000);
  assertNumeric(cellXml(xml,refOf(detail,'finalPrice')),0);assertNumeric(cellXml(xml,refOf(detail,'vsPackageRate')),1);
  assert.doesNotMatch(row.comparisonNote,/chưa tính/);
});

test('415 area HHI export uses positive solo contractors as n, separates packages and avoids conclusions from two contractors',async()=>{
  const reliableOwner='Chủ đầu tư đối chứng';
  const balanced=Array.from({length:3},(_,i)=>award('10'+i,['011111111'+i],100000,{investorName:reliableOwner}));
  const packages=[...concentrated,...balanced],criteria={province:'Tỉnh Lâm Đồng',fromYear:2026,toYear:2026},summary=summarizeArea(packages,criteria);
  const original=summary.investors.find(r=>r.investorName===owner);
  assert.equal(original.packages,10);assert.equal(original.contractorCount,5);assert.equal(original.concentration.n,2);assert.equal(original.concentration.reliable,false);assert.equal(original.concentrationScope,'solo-only');
  const {runtime,output}=makeRuntime({areaScan:{id:'area-hhi',criteria,summary,packages,coverage}});await runtime.exportAreaXlsx();
  const sheet=sheetSpec(output[0],'Theo chủ đầu tư'),row=sheet.rows.find(r=>r.investorName===owner),other=sheet.rows.find(r=>r.investorName===reliableOwner);
  assert.equal(row.packages,10);assert.equal(row.hhiN,2);assert.equal(row.hhi,original.concentration.value);assert.equal(row.level,'Chưa đủ mẫu kết luận');
  assert.match(row.hhiScope,/giá trúng độc lập đã biết/);assert.match(row.hhiScope,/không phân bổ giá gói liên danh/);assert.match(row.hhiScope,/Không suy ra toàn bộ thị trường/);
  assert.equal(other.hhiN,3);assert.notEqual(other.level,'Chưa đủ mẫu kết luận');
  const files=unpack(output[0].bytes),xml=sheetXml(files,'Theo chủ đầu tư'),ri=sheet.rows.indexOf(row)+2;
  assertNumeric(cellXml(xml,refOf(sheet,'hhiN',ri)),2);assertNumeric(cellXml(xml,refOf(sheet,'packages',ri)),10);assert.match(xml,/Chưa đủ mẫu kết luận/);
  assert.ok(output[0].spec.exportInfo.notes.some(n=>/không phân bổ giá gói liên danh/.test(n)));
});

test('415 investor profile export labels the HHI sample as contractors and retains the small-sample caveat',async()=>{
  const summary=summarizeInvestor(concentrated),criteria={name:owner,codes:['vn0099999900'],province:'Tỉnh Lâm Đồng'};
  const {runtime,output}=makeRuntime({investorScan:{id:'investor-hhi',criteria,summary,packages:concentrated,coverage}});await runtime.exportInvestorXlsx();
  const overview=sheetSpec(output[0],'Tổng quan'),n=overview.rows.find(r=>r.k==='Số nhà thầu có giá tính HHI'),hhi=overview.rows.find(r=>r.k==='HHI giá trúng độc lập');
  assert.equal(n.v,2);assert.match(n.note,/nhà thầu.*dương.*không phải số gói/);assert.equal(hhi.v,summary.concentration.value);
  assert.match(hhi.note,/Chưa đủ mẫu kết luận/);assert.match(hhi.note,/không phân bổ giá gói liên danh/);
  assert.equal(overview.rows.find(r=>r.k==='Số gói đã tổ chức (có kết quả)').v,10);
  const files=unpack(output[0].bytes),xml=sheetXml(files,'Tổng quan');assertNumeric(cellXml(xml,refOf(overview,'v',overview.rows.indexOf(n)+2)),2);
});

test('415 winner export records the selected province and source proof instead of claiming no province filter',async()=>{
  const packages=[award('200',[soloA],1230000),award('201',[soloB],1400000,{areaEvidence:{notifyNo:'IB2699999201',version:'01'}})];
  const {runtime,output}=makeRuntime({winnerLookup:{id:'winners-province',contractorName:'Nhà thầu kiểm thử',criteria:{province:'Tỉnh Lâm Đồng',provinces:['703','68']},packages,coverage}});
  await runtime.exportWinnersCsv();const detail=sheetSpec(output[0],'Gói đã trúng'),rec=sheetSpec(output[0],'Đối soát');
  assert.match(detail.rows[0].areaProof,/Địa bàn trong bản ghi e-GP nguồn; tiêu chí tỉnh ở trang Đối soát/);
  assert.match(detail.rows[1].areaProof,/TBMT IB2699999201, phiên bản 01/);
  assert.equal(rec.rows.find(r=>r.label==='Tiêu chí gốc · Tỉnh/thành phố').value,'Tỉnh Lâm Đồng');
  assert.equal(rec.rows.find(r=>r.label==='Tiêu chí gốc · Mã tỉnh/thành phố').value,'703, 68');
  const files=unpack(output[0].bytes),text=Object.values(files).join('\n');assert.doesNotMatch(text,/chưa (?:đặt|lọc).*tỉnh|không (?:đặt|lọc).*tỉnh/i);assert.match(text,/Tỉnh Lâm Đồng/);
});

test('415 actual OOXML integer style stores year 2026 numerically without the grouped-number format',()=>{
  const files=unpack(buildXlsx({columns:[{header:'Năm',key:'year',type:'integer'},{header:'Kiểu theo dòng',key:'other',typeKey:'kind'},{header:'Số lượng',key:'quantity',type:'number'}],rows:[{year:2026,other:'2026',kind:'integer',quantity:2026}]}));
  const xml=sheetXml(files,'Dữ liệu');
  for(const ref of ['A2','B2']){const cell=cellXml(xml,ref);assertNumeric(cell,2026);assert.match(styleOf(files,cell),/numFmtId="1"/);assert.doesNotMatch(styleOf(files,cell),/numFmtId="3"/);}
  assert.match(styleOf(files,cellXml(xml,'C2')),/numFmtId="3"/,'Grouped numeric count format remains distinct from a calendar year');
});

test('415 area first/last year and reconciliation year bounds use numeric integer cells with numFmtId 1',async()=>{
  const criteria={province:'Tỉnh Lâm Đồng',fromYear:2026,toYear:2026},summary=summarizeArea(concentrated,criteria);
  const {runtime,output}=makeRuntime({areaScan:{id:'area-year',criteria,summary,packages:concentrated,coverage}});await runtime.exportAreaXlsx();
  const files=unpack(output[0].bytes),contractors=sheetSpec(output[0],'Theo nhà thầu'),contractorXml=sheetXml(files,'Theo nhà thầu');
  for(const key of ['firstYear','lastYear']){assert.equal(contractors.columns.find(c=>c.key===key).type,'integer');for(let i=0;i<contractors.rows.length;i++){assert.equal(contractors.rows[i][key],2026);const cell=cellXml(contractorXml,refOf(contractors,key,i+2));assertNumeric(cell,2026);assert.match(styleOf(files,cell),/numFmtId="1"/);}}
  const rec=sheetSpec(output[0],'Đối soát'),recXml=sheetXml(files,'Đối soát');
  for(const label of ['Tiêu chí gốc · Từ năm','Tiêu chí gốc · Đến năm']){const i=rec.rows.findIndex(r=>r.label===label);assert.ok(i>=0);assert.equal(rec.rows[i].value,2026);assert.equal(rec.rows[i].valueType,'integer');const cell=cellXml(recXml,refOf(rec,'value',i+2));assertNumeric(cell,2026);assert.match(styleOf(files,cell),/numFmtId="1"/);}
  for(const [fromYear,toYear] of [[0,'0'],['0',0]]){
    const unbounded={province:'Tỉnh Lâm Đồng',fromYear,toYear,minPrice:0};
    const exported=makeRuntime({areaScan:{id:'area-unbounded-year',criteria:unbounded,summary:summarizeArea(concentrated,unbounded),packages:concentrated,coverage}});
    await exported.runtime.exportAreaXlsx();
    const zeroFiles=unpack(exported.output[0].bytes),zeroRec=sheetSpec(exported.output[0],'Đối soát'),zeroXml=sheetXml(zeroFiles,'Đối soát');
    for(const label of ['Tiêu chí gốc · Từ năm','Tiêu chí gốc · Đến năm']){
      const i=zeroRec.rows.findIndex(r=>r.label===label);assert.ok(i>=0);assert.equal(zeroRec.rows[i].value,'Không đặt');
      const cell=cellXml(zeroXml,refOf(zeroRec,'value',i+2));assert.match(cell,/inlineStr/);assert.match(cell,/Không đặt/);assert.doesNotMatch(cell,/<v>0<\/v>/);
    }
    const priceIndex=zeroRec.rows.findIndex(r=>r.label==='Tiêu chí gốc · Giá từ (đồng)');assert.ok(priceIndex>=0);
    assert.equal(zeroRec.rows[priceIndex].value,0);assert.equal(zeroRec.rows[priceIndex].valueType,'money');assertNumeric(cellXml(zeroXml,refOf(zeroRec,'value',priceIndex+2)),0);
  }
});
