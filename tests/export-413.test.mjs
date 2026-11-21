import test from 'node:test';
import assert from 'node:assert/strict';
import {buildXlsx} from '../GiaoSuCuiBap/lib/xlsx.js';
import {createExportRuntime} from '../GiaoSuCuiBap/lib/runtime-export.js';
import {hardFilterReason} from '../GiaoSuCuiBap/lib/hard-filter.js';
function unpack(bytes){const b=Buffer.from(bytes),files={};let p=0;while(b.readUInt32LE(p)===0x04034b50){const size=b.readUInt32LE(p+18),n=b.readUInt16LE(p+26),extra=b.readUInt16LE(p+28),start=p+30+n+extra;files[b.subarray(p+30,p+30+n).toString()]=b.subarray(start,start+size).toString();p=start+size;}return files;}
function makeRuntime(state){const output=[];return {output,runtime:createExportRuntime({getState:async()=>structuredClone(state),readSearchState:async()=>({revision:'same'}),stamp:()=> '2026-09-28',numOrNull:value=>value==null||value===''?null:Number(value),downloadXlsx:async(name,spec)=>{output.push({name,spec,bytes:buildXlsx(spec)});return output.length;}})};}
const tender=(key,more={})=>({key,notifyNo:key,bidName:'Trường học',price:2e9,score:90,matched:true,watchlisted:true,closeDate:'2099-01-01T00:00:00Z',decisionState:'GO',filterState:'MATCH',...more});
const reconciliation=output=>output.spec.sheets.find(sheet=>sheet.sheetName==='Đối soát');
const value=(sheet,label)=>sheet.rows.find(row=>row.label===label)?.value;
const coverage={serverTotal:100,fetched:10,match:6,insufficient:2,outOfRange:2,pagesRead:1,totalPages:10,complete:false,text:'Đã tải 10/100; chưa đầy đủ.'};

test('413 legacy saved gates without reasons remain truthful through result view and actual export',async()=>{
  const tenders=[tender('IB1'),tender('IB2',{filterState:'INSUFFICIENT'}),tender('IB3',{filterState:'OUT_OF_RANGE'})];
  const run={id:'legacy',foundKeys:tenders.map(t=>t.key),resultStates:Object.fromEntries(tenders.map(t=>[t.key,{filterState:t.filterState}]))};
  const {runtime,output}=makeRuntime({tenders,runs:[run]});
  await runtime.exportCsv(false,tenders.map(t=>t.key),'legacy',{criteriaState:''});
  const rows=output[0].spec.sheets.find(sheet=>sheet.sheetName==='Gói thầu').rows;
  assert.equal(rows.find(row=>row.notifyNo==='IB1').filterReason,'Khớp các tiêu chí đã chọn');
  assert.match(rows.find(row=>row.notifyNo==='IB2').filterReason,/^Chưa đủ dữ liệu/);
  assert.match(rows.find(row=>row.notifyNo==='IB3').filterReason,/^Ngoài tiêu chí/);
  assert.equal(hardFilterReason({state:'OUT_OF_RANGE',reason:'area'}),'Khác tỉnh/thành đã chọn');
  assert.equal(hardFilterReason({state:'INSUFFICIENT',reason:'Thông tin nguồn thiếu mã xã'}),'Thông tin nguồn thiếu mã xã');
  assert.equal(hardFilterReason({state:'UNKNOWN'}),'Chưa ghi nhận lý do đối chiếu');
  for(const reason of ['__proto__','constructor','toString']) assert.equal(hardFilterReason({reason}),reason);
});

test('413 reconciliation separates source retrieval counts, classification and the actually exported view',async()=>{
  const tenders=[tender('IB1'),tender('IB2',{filterState:'INSUFFICIENT'}),tender('IB3',{filterState:'OUT_OF_RANGE'})];
  const run={id:'run',foundKeys:tenders.map(t=>t.key),resultStates:Object.fromEntries(tenders.map(t=>[t.key,{filterState:t.filterState}])),coverage,criteria:{province:'Lâm Đồng',provinces:['68','703'],wardIdentities:[{code:'001',parentCode:'703',name:'Xã A'}],category:'TV_SUPERVISION',minPrice:1e9,maxPrice:0,token:'DO_NOT_EXPORT'},invalidCount:0,duplicateCount:0};
  const {runtime,output}=makeRuntime({tenders,runs:[run]});await runtime.exportCsv(false,['IB1'],'run',{criteriaState:'MATCH',text:'truong'},'same');
  const sheet=reconciliation(output[0]);
  assert.equal(value(sheet,'e-GP công bố'),100);assert.equal(value(sheet,'Đã tải từ e-GP'),10);assert.equal(value(sheet,'Khớp tiêu chí gốc'),6);
  assert.equal(value(sheet,'Chưa đủ dữ liệu'),2);assert.equal(value(sheet,'Ngoài tiêu chí gốc'),2);assert.equal(value(sheet,'Chênh lệch tải và ba nhóm'),0);assert.equal(value(sheet,'Còn lại theo tổng e-GP'),90);
  assert.equal(value(sheet,'Số bản ghi sau bộ lọc xuất'),1);assert.equal(value(sheet,'Số dòng dữ liệu xuất'),1);
  assert.equal(value(sheet,'Tiêu chí gốc · Mã tỉnh/thành phố'),'68, 703');assert.match(value(sheet,'Tiêu chí gốc · Cặp mã xã/phường và tỉnh cha'),/001 \/ tỉnh cha 703/);
  assert.match(value(sheet,'Tiêu chí gốc · Loại gói thầu'),/Tư vấn giám sát/);assert.equal(value(sheet,'Tiêu chí gốc · Giá từ (đồng)'),1e9);
  assert.equal(value(sheet,'Tiêu chí gốc · Giá đến (đồng)'),'Không giới hạn');assert.equal(value(sheet,'Bộ lọc khi xuất · Nhóm đối chiếu'),'Khớp tiêu chí');
  assert.equal(JSON.stringify(sheet).includes('DO_NOT_EXPORT'),false);
  const files=unpack(output[0].bytes);assert.match(files['xl/workbook.xml'],/name="Đối soát"/);assert.match(files['xl/worksheets/sheet3.xml'],/<v>100<\/v>/);
});

test('413 unknown source counts stay unknown, real zero stays zero and inconsistent counts remain visible',async()=>{
  for(const sourceCoverage of [{text:'Legacy only'},{serverTotal:null,fetched:null,match:null,insufficient:null,outOfRange:null},{serverTotal:0,fetched:0,match:0,insufficient:0,outOfRange:0},{serverTotal:5,fetched:6,match:5,insufficient:1,outOfRange:1}]){
    const t=tender('IB1'),run={id:'r',foundKeys:['IB1'],resultStates:{IB1:{filterState:'MATCH'}},coverage:sourceCoverage};
    const {runtime,output}=makeRuntime({tenders:[t],runs:[run]});await runtime.exportCsv(false,['IB1'],'r');
    const sheet=reconciliation(output[0]);
    if(sourceCoverage.fetched==null){assert.equal(value(sheet,'Đã tải từ e-GP'),'Chưa ghi nhận');assert.equal(value(sheet,'Khớp tiêu chí gốc'),'Chưa ghi nhận');assert.equal(value(sheet,'Chênh lệch tải và ba nhóm'),'Chưa ghi nhận');}
    else if(sourceCoverage.fetched===0){assert.equal(value(sheet,'e-GP công bố'),0);assert.equal(value(sheet,'Chênh lệch tải và ba nhóm'),0);}
    else{assert.equal(value(sheet,'Chênh lệch tải và ba nhóm'),-1);assert.equal(value(sheet,'Còn lại theo tổng e-GP'),-1);assert.match(sheet.rows.find(row=>row.label==='Chênh lệch tải và ba nhóm').note,/chưa cân bằng/);}
  }
});

test('413 plan reconciliation counts plans separately from child rows and records the export toggle',async()=>{
  const {runtime,output}=makeRuntime({planLookup:{id:'plans',coverage,criteria:{province:'Lâm Đồng',category:'XL',fromDate:'2026-09-01',toDate:'2026-09-28'},plans:[
    {planNoStand:'PL1',name:'Kế hoạch',filterState:'MATCH',hasUnannounced:true,packages:[{name:'Gói 1',price:1,filterState:'MATCH'},{name:'Gói 2',price:2,filterState:'MATCH'}]},
    {planNoStand:'PL2',name:'Không chọn',hasUnannounced:false,packages:[]}]}});
  await runtime.exportPlansCsv({onlyUnannounced:true});const sheet=reconciliation(output[0]);
  assert.equal(value(sheet,'Số bản ghi sau bộ lọc xuất'),1);assert.equal(value(sheet,'Số dòng dữ liệu xuất'),2);
  assert.equal(value(sheet,'Bộ lọc khi xuất · Chỉ kế hoạch còn gói chưa mời thầu'),'Có');assert.equal(value(sheet,'Đã tải từ e-GP'),10);
  assert.equal(output[0].spec.sheets[1].rows[0].__gate,'MATCH');
});

test('413 BBMT reconciliation keeps packages, bidders, unread state and original scope distinct',async()=>{
  const {runtime,output}=makeRuntime({bidOpenScan:{id:'opening',coverage,scope:{days:15,field:'XL',province:'Lâm Đồng'},maxPackages:150,packages:[
    {notifyNoStand:'IB1',bidName:'Gói 1',filterState:'MATCH',readState:'OK',bidders:[{name:'A',finalPrice:1},{name:'B',finalPrice:2}]},
    {notifyNoStand:'IB2',bidName:'Chưa đọc',filterState:'MATCH',readState:'TIMEOUT',bidders:null}]}});
  await runtime.exportBidOpenCsv();const sheet=reconciliation(output[0]);
  assert.equal(value(sheet,'Số bản ghi sau bộ lọc xuất'),2);assert.equal(value(sheet,'Số dòng dữ liệu xuất'),2);
  assert.equal(value(sheet,'Gói chưa đọc đủ trong phạm vi xuất'),1);assert.equal(value(sheet,'Tiêu chí gốc · Số ngày gần đây'),15);
  assert.equal(value(sheet,'Tiêu chí gốc · Giới hạn gói đọc biên bản'),150);assert.match(value(sheet,'Tiêu chí gốc · Lĩnh vực'),/Xây lắp/);
  assert.equal(output[0].spec.sheets[2].sheetName,'Chưa đọc đủ');
});

test('413 semantic colors use explicit stored gate only; numeric bold/italic styling keeps real cell values',()=>{
  const files=unpack(buildXlsx({columns:[{header:'Tên',key:'name',emphasis:'bold'},{header:'Giá',key:'price',type:'money',emphasis:'bold'},{header:'Lý do',key:'reason',emphasis:'italic'}],rows:[
    {__gate:'MATCH',name:'A',price:1},{__gate:'INSUFFICIENT',name:'B',price:1.25},{__gate:'OUT_OF_RANGE',name:'C',price:2},{__gate:'__proto__',name:'Khớp tiêu chí',price:3},{name:'MATCH',price:4}]}));
  const sheet=files['xl/worksheets/sheet1.xml'],styles=files['xl/styles.xml'];
  const xfs=styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g);
  const style=cell=>xfs[Number(sheet.match(new RegExp(`<c r="${cell}" s="(\\d+)"`))[1])];
  assert.match(style('A2'),/fontId="4" fillId="4"/);assert.match(style('A3'),/fontId="4" fillId="5"/);assert.match(style('A4'),/fontId="4" fillId="6"/);
  assert.match(style('A5'),/fillId="3"/);assert.match(style('A6'),/fillId="0"/);assert.match(style('C2'),/fontId="3"/);
  assert.match(style('B3'),/numFmtId="166" fontId="4"/);assert.match(sheet,/<v>1.25<\/v>/);assert.equal(sheet.includes('s="undefined"'),false);
});

test('413 warehouse export reproduces every dashboard filter and all pages, rejecting hidden or stale key scope',async()=>{
  const tenders=Array.from({length:75},(_,i)=>tender(`IB${i}`));
  tenders.push(tender('hidden-watch',{watchlisted:false}),tender('hidden-pipeline',{decisionState:'REVIEW'}),tender('hidden-score',{score:10}),tender('hidden-title',{bidName:'Bệnh viện'}),tender('hidden-closed',{closeDate:'2020-01-01'}),tender('hidden-threshold',{matched:false}));
  const {runtime,output}=makeRuntime({tenders,runs:[]});const keys=tenders.slice(0,75).map(t=>t.key),view={text:'truong',status:'OPEN',minScore:80,sortBy:'price',onlyMatched:true,onlyWatch:true,pipeline:'GO'};
  await runtime.exportCsv(false,keys,'',view,'','warehouse');
  assert.equal(output[0].spec.sheets[0].rows.length,75);assert.equal(output[0].spec.sheets[1].rows.length,75);
  const sheet=reconciliation(output[0]);assert.equal(value(sheet,'Số dòng dữ liệu xuất'),75);assert.equal(value(sheet,'e-GP công bố'),'Chưa ghi nhận');assert.equal(value(sheet,'Bộ lọc khi xuất · Quyết định dự thầu'),'Quyết định dự thầu');
  await assert.rejects(runtime.exportCsv(false,keys.slice(0,60),'',view,'','warehouse'),/mọi trang/);
  await assert.rejects(runtime.exportCsv(false,[...keys.slice(1),'hidden-watch'],'',view,'','warehouse'),/mọi trang/);
  await assert.rejects(runtime.exportCsv(false,null,'',view,'','warehouse'),/Thiếu danh sách/);
});
