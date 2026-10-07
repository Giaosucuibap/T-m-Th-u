import { hardFilterReason } from './hard-filter.js';
import { GATE_LABEL } from './match-gate.js';
import { DEFAULT_SETTINGS, safeFilename, BID_STATUS_LABEL, VN_UTC_OFFSET_HOURS } from './core.js';
import { buildSafeBackupState } from './backup.js';
import { bbmtReadStateOf, findBidder, openingFinancialPricePending } from './bbmt.js';
import { DECISION_STATE_LABEL, normalizeDecisionState, statusOf, filterAndSort } from './decision.js';
import { createResultView, verifyExportKeys } from './result-view.js';
import { categoryLabel, normalizeCategory } from './tender-categories.js';

const countValue=value=>value!==null&&value!==undefined&&value!==''&&typeof value!=='boolean'&&Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
const HHI_SCOPE_NOTE='Chỉ tính trên giá trúng độc lập đã biết trong dữ liệu đã thu thập; không phân bổ giá gói liên danh vì thiếu tỷ lệ từng thành viên. Không suy ra toàn bộ thị trường.';
const hhiAssessment=concentration=>concentration?.reliable===true?(concentration.level||''):'Chưa đủ mẫu kết luận';
const CRITERIA_LABELS={investor:'Chủ đầu tư',province:'Tỉnh/thành phố',provinces:'Mã tỉnh/thành phố',ward:'Xã/phường',wards:'Mã xã/phường',wardCode:'Mã xã/phường đã chọn',wardParentCode:'Mã tỉnh cha',wardIdentities:'Cặp mã xã/phường và tỉnh cha',keyword:'Từ khóa',mustKeywords:'Từ khóa bắt buộc',excludeKeywords:'Từ khóa loại trừ',category:'Loại gói thầu',field:'Lĩnh vực',minPrice:'Giá từ (đồng)',maxPrice:'Giá đến (đồng)',fromDate:'Từ ngày',toDate:'Đến ngày',fromYear:'Từ năm',toYear:'Đến năm',days:'Số ngày gần đây',maxPackages:'Giới hạn gói đọc biên bản',focusTaxCode:'MST theo dõi',contractorQuery:'Nhà thầu theo dõi'};
const VIEW_LABELS={criteriaState:'Nhóm đối chiếu',text:'Tìm trong kết quả',status:'Trạng thái gói',minScore:'Điểm tối thiểu',onlyMatched:'Chỉ gói đạt ngưỡng điểm',onlyWatch:'Chỉ gói theo dõi',provinceCode:'Mã tỉnh lọc nhanh',closeFrom:'Đóng thầu từ ngày',closeTo:'Đóng thầu đến ngày',sortBy:'Sắp xếp',pipeline:'Quyết định dự thầu',onlyUnannounced:'Chỉ kế hoạch còn gói chưa mời thầu',onlyFollowed:'Chỉ gói có nhà thầu theo dõi'};
// These values come from the saved job. Never recompute a relative window at
// export time, or display a newly calculated range as if it were the query's.
function frozenTimeScope(criteria,timeBasis=''){
  if(!criteria||typeof criteria!=='object')return null;
  const range=criteria.dateRange;
  if(range&&Number.isFinite(range.from)&&Number.isFinite(range.to)&&range.from<=range.to){
    const clock=value=>{
      if(Math.abs(value)>=8640000000000000)return 'Không giới hạn';
      const d=new Date(value+VN_UTC_OFFSET_HOURS*3600000),pad=(n,width=2)=>String(n).padStart(width,'0');
      if(Number.isNaN(d.getTime()))return 'Chưa ghi nhận';
      return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)}/${pad(d.getUTCFullYear(),4)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(),3)} (UTC+07:00)`;
    };
    return{from:clock(range.from),to:clock(range.to),basis:timeBasis||'Chưa lưu trường ngày đối chiếu',frozen:true};
  }
  const requested=Boolean(criteria.fromDate||criteria.toDate||Number(criteria.fromYear)||Number(criteria.toYear)||Number(criteria.days)>0);
  if(requested)return{note:'Chưa lưu khoảng thời gian cố định cho lượt này; không tính lại theo ngày xuất.',basis:timeBasis};
  if(Object.hasOwn(criteria,'dateRange'))return{note:'Không giới hạn thời gian',basis:timeBasis};
  return null;
}
function criterionText(key,value){
  if(value===null||value===undefined||value==='')return 'Không đặt';
  if(['fromYear','toYear'].includes(key)&&Number(value)===0)return 'Không đặt';
  if(typeof value==='boolean')return value?'Có':'Không';
  if(key==='wardIdentities'&&Array.isArray(value))return value.map(entry=>`${entry.code} / tỉnh cha ${entry.parentCode}${entry.name?' · '+entry.name:''}`).join('\n')||'Không đặt';
  if(Array.isArray(value))return value.map(item=>String(item)).join(', ')||'Không đặt';
  if(key==='category'||key==='field')return normalizeCategory(String(value))?`${categoryLabel(String(value))} (${value})`:String(value);
  if(key==='criteriaState')return GATE_LABEL[value]||String(value);
  if(key==='status')return BID_STATUS_LABEL[value]||String(value);
  if(key==='pipeline')return DECISION_STATE_LABEL[value]||String(value);
  if(key==='maxPrice'&&Number(value)===0)return 'Không giới hạn';
  return typeof value==='number'?value:String(value);
}

/** Retrieval totals and exported rows are different scopes; never fill missing evidence with 0. */
function reconciliationSheet({source=null,criteria=null,view=null,unit='bản ghi',timeBasis='',exportedRecords=0,exportedRows=0,rows=[],extras=[]}={}){
  const coverage=source?.coverage||{};
  const read=key=>own(coverage,key)?countValue(coverage[key]):null;
  const values={total:read('serverTotal'),fetched:read('fetched'),match:read('match'),insufficient:read('insufficient'),outside:read('outOfRange')};
  const data=[];
  const add=(label,value,note='',valueType='auto')=>data.push({label,value:value===null||value===undefined?'Chưa ghi nhận':value,note,valueType});
  add('Đơn vị đối soát',unit,'Số dòng nhà thầu/gói con có thể khác số bản ghi e-GP.');
  add('Mã lượt tra cứu',source?.id||null,'Dùng để đối chiếu lại đúng lượt đã xuất.');
  add('e-GP công bố',values.total,'Tổng bản ghi máy chủ báo cho phạm vi truy vấn; nhiều truy vấn có thể có bản ghi giao nhau.');
  add('Đã tải từ e-GP',values.fetched,'Số bản ghi nguồn đã tiếp nhận trong lượt; chưa áp dụng bộ lọc nhanh khi xuất.');
  add('Khớp tiêu chí gốc',values.match,'Theo cổng đối chiếu của lượt thu thập, không phải điểm khuyến nghị.');
  add('Chưa đủ dữ liệu',values.insufficient,'Chưa thể kết luận khớp hay ngoài tiêu chí.');
  add('Ngoài tiêu chí gốc',values.outside,'Đã có căn cứ xác định ngoài tiêu chí.');
  const classified=[values.match,values.insufficient,values.outside].every(v=>v!==null)?values.match+values.insufficient+values.outside:null;
  const gap=values.fetched!==null&&classified!==null?values.fetched-classified:null;
  add('Chênh lệch tải và ba nhóm',gap,gap===null?'Thiếu số đếm để đối soát.':gap===0?'Đã tải = khớp + chưa đủ dữ liệu + ngoài tiêu chí.':'Các số đếm chưa cân bằng; có thể còn bản ghi trùng hoặc chưa phân loại, cần kiểm tra lượt nguồn.');
  add('Còn lại theo tổng e-GP',values.total!==null&&values.fetched!==null?values.total-values.fetched:null,'Chỉ tính khi cả tổng nguồn và số đã tải đều được ghi nhận. Không dùng để suy ra số gói khớp.');
  add('Bản ghi không hợp lệ',countValue(source?.invalidCount),'Số do lượt thu thập ghi nhận; không tự xem thiếu thông tin là 0.');
  add('Bản ghi trùng',countValue(source?.duplicateCount),'Bản ghi trùng giữa các trang trong cùng phạm vi thu thập.');
  add('Số trang đã tải',read('pagesRead'));
  add('Tổng số trang e-GP',read('totalPages'));
  add('Độ đầy đủ của lượt',typeof coverage.complete==='boolean'?(coverage.complete?'Đã xác nhận lấy đủ phạm vi truy vấn':'Chưa xác nhận lấy đủ phạm vi truy vấn'):null,coverage.text||'Không suy ra toàn bộ thị trường từ số dòng trong tệp.');
  add('Số bản ghi sau bộ lọc xuất',exportedRecords,'Số '+unit+' thuộc phạm vi được xuất, sau bộ lọc nhanh hoặc tùy chọn xuất.');
  add('Số dòng dữ liệu xuất',exportedRows,'Đếm một lần danh sách chi tiết; trang Xem nhanh lặp cùng dữ liệu, không cộng hai trang.');
  if(rows.length){
    for(const [state,label] of [['MATCH','Khớp trong dòng xuất'],['INSUFFICIENT','Chưa đủ dữ liệu trong dòng xuất'],['OUT_OF_RANGE','Ngoài tiêu chí trong dòng xuất']])add(label,rows.filter(row=>row.__gate===state).length,'Đếm các dòng xuất có trạng thái được lưu rõ ràng.');
    add('Dòng xuất chưa lưu trạng thái',rows.filter(row=>!own(GATE_LABEL,row.__gate)).length,'Không tự gán màu hoặc kết luận cho dữ liệu cũ thiếu trạng thái.');
  }
  for(const item of extras)add(item.label,item.value,item.note||'');
  const criteriaRows=(object,labels,prefix)=>{
    let present=0;
    for(const [key,label] of Object.entries(labels))if(own(object,key)){add(`${prefix} · ${label}`,criterionText(key,object[key]),'',['fromYear','toYear'].includes(key)?'integer':key==='minPrice'||key==='maxPrice'&&Number(object[key])>0?'money':'auto');present++;}
    if(!present)add(prefix,'Chưa ghi nhận','Tệp không suy đoán tiêu chí từ tên gói hoặc kết quả.');
  };
  criteriaRows(criteria,CRITERIA_LABELS,'Tiêu chí gốc');
  const time=frozenTimeScope(criteria,timeBasis);
  if(time?.frozen){
    add('Tiêu chí gốc · Từ thời điểm đã cố định',time.from,'Biên gồm cả thời điểm này; giờ Việt Nam.');
    add('Tiêu chí gốc · Đến thời điểm đã cố định',time.to,'Biên gồm cả thời điểm này; giờ Việt Nam.');
    add('Tiêu chí gốc · Mốc thời gian đối chiếu',time.basis,'Khoảng này được lưu khi bắt đầu lượt tra cứu, giữ nguyên khi phân loại và xuất.');
  }else if(time){
    add('Tiêu chí gốc · Khoảng thời gian cố định',time.note);
    if(time.basis)add('Tiêu chí gốc · Mốc thời gian đối chiếu',time.basis);
  }
  criteriaRows(view,VIEW_LABELS,'Bộ lọc khi xuất');
  add('Quy ước màu','Xanh nhạt: khớp; vàng nhạt: chưa đủ dữ liệu; xám nhạt: ngoài tiêu chí.','Màu phản ánh trạng thái đối chiếu được lưu, không thể hiện khả năng trúng thầu hay độ ưu tiên.');
  return {sheetName:'Đối soát',freezeColumns:1,orientation:'landscape',columns:[{header:'Chỉ tiêu',key:'label',width:38,emphasis:'bold'},{header:'Giá trị',key:'value',typeKey:'valueType',width:45},{header:'Diễn giải',key:'note',type:'note',width:66}],rows:data};
}

/** export operations execute here; Chrome/storage boundaries are injected for replay tests. */
export function createExportRuntime({getState,readSearchState,downloadData,downloadXlsx,mobileHtml,getContractorProfile,priceRow,sanitizedTemplateState,stamp,numOrNull,chrome}) {
// Keep complete detail columns stable; add a compact reading sheet for wide operational exports.
function exportWorkbook(filename,spec,saveAs=true){
  if(spec.scopeSource&&Array.isArray(spec.scopeSource.packages)){
    const rows=spec.scopeSource.packages,known=rows.filter(row=>typeof row.winningPrice==='number'&&Number.isFinite(row.winningPrice)).length;
    const note=`Tổng tiền chỉ cộng giá trúng đã biết: ${known}/${rows.length} gói có giá. Ô giá trống không phải giá 0.`;
    spec={...spec,exportInfo:{...spec.exportInfo,scope:[spec.exportInfo?.scope,note].filter(Boolean).join(' ')}};
  }
  if(spec.scopeSource?.insufficientPackages?.length){
    const unknown=spec.scopeSource.insufficientPackages;
    const sheet={sheetName:'Chưa đủ dữ liệu',columns:[
      {header:'Mã TBMT',key:'notifyNoStand',width:20},{header:'Gói thầu',key:'bidName',width:48},
      {header:'Chủ đầu tư',key:'investorName',width:40},{header:'Lý do',key:'reason',type:'note',width:48},
      {header:'Nguồn e-GP',key:'detailUrl',type:'url',urlLabel:'Mở e-GP',width:16}],
      rows:unknown.map(row=>({...row,__gate:'INSUFFICIENT',reason:hardFilterReason({state:'INSUFFICIENT',reason:row.filterReason})}))};
    spec={...spec,sheets:[...(spec.sheets||[{sheetName:spec.sheetName,columns:spec.columns,rows:spec.rows}]),sheet]};
  }
  const quickColumns={
    'Gói thầu':['notifyNo','bidName','investorName','price','closeDate','statusLabel','filterState','detailUrl'],
    'Biên bản mở thầu':['notifyNoStand','bidName','name','bidderPrice','finalPrice','priceBasis','vsPackageAmount','vsPackageRate'],
    'Kế hoạch LCNT':['planNoStand','name','investorName','packageName','packagePrice','decisionDate','note','detailUrl']
  };
  const keys=quickColumns[spec.sheetName];
  if(keys){
    const columns=keys.map(key=>spec.columns.find(c=>c.key===key)).filter(Boolean).map(c=>({...c,...(c.type==='url'?{urlLabel:'Mở e-GP'}:{}),width:c.type==='url'?16:Math.min(c.width||24,['bidName','name','packageName'].includes(c.key)?36:30)}));
    const detail={sheetName:spec.sheetName,columns:spec.columns,rows:spec.rows};
    const quickRows=spec.sheetName==='Biên bản mở thầu'?spec.rows.map(row=>({...row,name:[row.name,
      row.lotLabel?`Phần/lô: ${row.lotLabel}`:'',
      row.finalPriceDerived?'Giá sau giảm: tính từ tỷ lệ giảm':'',
      row.comparisonPending?row.comparisonNote:''].filter(Boolean).join('\n')})):spec.rows;
    spec={...spec,sheets:[{sheetName:'Xem nhanh',columns,rows:quickRows},detail,...(spec.sheets||[])]};
  }
  if(spec.reconciliation){
    spec.sheets=[...(spec.sheets||[{sheetName:spec.sheetName,columns:spec.columns,rows:spec.rows}]),reconciliationSheet(spec.reconciliation)];
    const time=frozenTimeScope(spec.reconciliation.criteria,spec.reconciliation.timeBasis);
    if(time){const note=time.frozen?`${time.basis}: từ ${time.from} đến ${time.to}. Khoảng đã cố định khi bắt đầu lượt tra cứu.`:time.note;
      spec.exportInfo={...spec.exportInfo,notes:[...(spec.exportInfo?.notes||[]),note]};}
  }
  const styleColumns=columns=>(columns||[]).map(column=>({...column,emphasis:column.emphasis||(['notifyNo','notifyNoStand','planNoStand','bidName','packageName','finalPrice','winningPrice','price','packagePrice','filterState','lotLabel'].includes(column.key)?'bold':['filterReason','decisionNote','comparisonNote','note'].includes(column.key)?'italic':'')}));
  spec={...spec,...(spec.sheets?{sheets:spec.sheets.map(sheet=>({...sheet,columns:styleColumns(sheet.columns)}))}:{columns:styleColumns(spec.columns)})};
  return downloadXlsx(filename,spec,saveAs);
}
const READ_LABEL={OK:'Đã đọc đủ',EMPTY:'Biên bản chưa ghi nhận nhà thầu',TIMEOUT:'Chưa đọc được',PARTIAL:'Mới đọc một phần',PENDING:'Chưa đọc',READING:'Đang đọc'};
async function exportCsv(saveAs=true,keys=null,runId='',view={},revision='',scope=''){
  const s=await getState();
  if(scope&&scope!=='warehouse')throw new Error('Phạm vi xuất không hợp lệ.');
  if(scope==='warehouse'&&runId)throw new Error('Không trộn phạm vi kho với một lượt tra cứu riêng.');
  let selectedRun=null;
  let exportView=view;
  if(runId){
    selectedRun=s.runs.find(r=>r.id===runId);
    if(!selectedRun)throw new Error('Không tìm thấy lượt tra cứu cần xuất.');
    if(revision){
      const current=await readSearchState({runId});
      if(current.revision!==revision)throw new Error('Kết quả đã thay đổi. Hãy tải lại trước khi xuất Excel.');
    }
    const selectedView=createResultView(s.tenders,selectedRun,view);
    s.tenders=verifyExportKeys(selectedView.rows,keys);
    exportView=selectedView.filters;
    keys=null;
  }
  if(scope==='warehouse'){
    if(!Array.isArray(keys))throw new Error('Thiếu danh sách gói sau bộ lọc trong kho. Hãy tải lại rồi xuất.');
    const filtered=filterAndSort(s.tenders,view)
      .filter(t=>!view.onlyWatch||t.watchlisted)
      .filter(t=>!view.pipeline||normalizeDecisionState(t.decisionState)===view.pipeline);
    s.tenders=verifyExportKeys(filtered,keys);
    keys=null;
  }
  if(keys!==null){
    if(!Array.isArray(keys)||keys.length>10000||keys.some(k=>typeof k!=='string'))throw new Error('Phạm vi xuất không hợp lệ.');
    const selected=new Set(keys);
    s.tenders=s.tenders.filter(t=>selected.has(t.key));
  }
  if(!s.tenders.length)throw new Error('Không có gói trong phạm vi xuất.');
  return exportWorkbook(`GiaoSuCuiBap/DS-goi-thau-${stamp()}.xlsx`,{
    sheetName:'Gói thầu',
    reconciliation:{source:selectedRun,criteria:selectedRun?.criteria,view:exportView,unit:'thông báo mời thầu',timeBasis:'Ngày đăng tải thông báo mời thầu (publicDate)',exportedRecords:s.tenders.length,exportedRows:s.tenders.length,rows:s.tenders.map(t=>({__gate:t.filterState}))},
    exportInfo:{scope:`${s.tenders.length} gói sau bộ lọc trên mọi trang${selectedRun?' của lượt tra cứu đã chọn':scope==='warehouse'?' trong kho hiện tại':''}.`,coverage:selectedRun?.coverage?.text,notes:['Trang Xem nhanh và Gói thầu chứa cùng danh sách. Điểm và khuyến nghị dựa trên cấu hình, không phải kết quả xét thầu.',...(scope==='warehouse'?['Kho có thể chứa nhiều lượt tra cứu. Không cộng tổng nguồn của các lượt để coi là số gói duy nhất trên e-GP.']:[])]},
    columns:[
      {header:'Điểm',key:'score',type:'number',width:8},
      {header:'Khuyến nghị',key:'recommendation',width:30},
      {header:'Đối chiếu tiêu chí',key:'filterState',width:28},
      {header:'Lý do đối chiếu',key:'filterReason',width:38},
      {header:'Thời điểm ghi nhận',key:'checkedAt',type:'datetime',width:22},
      {header:'Phạm vi dữ liệu',key:'coverage',width:60},
      {header:'Trạng thái',key:'statusLabel',width:16},
      {header:'Mã TBMT',key:'notifyNo',width:16},
      {header:'Mã gói thầu (KHLCNT)',key:'bidNo',width:18},
      {header:'Phiên bản',key:'version',width:10},
      {header:'Tên gói thầu',key:'bidName',width:50},
      {header:'Dự án',key:'projectName',width:38},
      {header:'Địa điểm',key:'location',width:26},
      {header:'Giá gói thầu',key:'price',type:'money',width:20},
      {header:'Ngày đăng',key:'publicDate',type:'datetime',width:18},
      {header:'Đóng thầu',key:'closeDate',type:'datetime',width:18},
      {header:'Chủ đầu tư',key:'investorName',width:34},
      {header:'Bên mời thầu',key:'procuringEntityName',width:34},
      {header:'Quyết định',key:'decisionState',width:22},
      {header:'Người phụ trách',key:'decisionOwner',width:22},
      {header:'Ghi chú nội bộ',key:'decisionNote',width:42},
      {header:'Số thay đổi đã ghi nhận',key:'changeCount',type:'number',width:20},
      {header:'Thay đổi gần nhất',key:'lastChange',width:38},
      {header:'Link e-GP',key:'detailUrl',type:'url',urlLabel:'Mở e-GP',width:16}
    ],
    rows:s.tenders.map(t=>({
      __gate:t.filterState||'',
      score:numOrNull(t.score),recommendation:t.recommendation,statusLabel:BID_STATUS_LABEL[statusOf(t)],
      filterState:GATE_LABEL[t.filterState]||'Chưa kiểm tra',filterReason:hardFilterReason({reason:t.filterReason,state:t.filterState}),
      checkedAt:t.checkedAt||t.lastSeenAt||'',coverage:selectedRun?.coverage?.text||'',
      notifyNo:t.notifyNo||'',bidNo:t.bidNo||'',version:t.version,
      bidName:t.bidName,projectName:t.projectName,location:t.location,
      price:numOrNull(t.price),publicDate:t.publicDate,closeDate:t.closeDate,
      investorName:t.investorName,procuringEntityName:t.procuringEntityName,
      decisionState:DECISION_STATE_LABEL[normalizeDecisionState(t.decisionState)],
      decisionOwner:t.decisionOwner||'',decisionNote:t.decisionNote||'',
      changeCount:Array.isArray(t.changeLog)?t.changeLog.length:0,
      lastChange:Array.isArray(t.changeLog)&&t.changeLog.length
        ?`${t.changeLog[t.changeLog.length-1].label}: ${t.changeLog[t.changeLog.length-1].before} → ${t.changeLog[t.changeLog.length-1].after}`:'',
      detailUrl:t.detailUrl
    }))
  },saveAs);
}

async function exportMobileReport(saveAs=true){const s=await getState();return downloadData(`GiaoSuCuiBap/Bao-cao-dien-thoai-${new Date().toISOString().slice(0,10)}.html`,'text/html',mobileHtml(s.tenders),saveAs);}

async function exportBackup(){
  const s=await getState();
  const cleanTemplates=sanitizedTemplateState(s);
  // Danh sách trắng: không xuất activeRun, runs[].queue, cache, log Telegram,
  // request lồng hoặc bất kỳ khóa nào có dấu hiệu bí mật.
  const exportState=buildSafeBackupState(s,cleanTemplates,DEFAULT_SETTINGS);
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  return downloadData(`GiaoSuCuiBap/backup-du-lieu-an-toan-${stamp}.json`,
    'application/json',
    JSON.stringify({version:chrome.runtime.getManifest().version,
      exportedAt:new Date().toISOString(),
      backupMode:'SAFE',
      _LUU_Y:'Ban sao an toan: queue request, token, CAPTCHA, cookie, Bot Token va Chat ID da duoc loai bo.',
      ...exportState}),true);
}

async function exportWinnersCsv(){
  const s=await getState();
  const lookup=s.winnerLookup;
  const list=(lookup&&lookup.packages)||[];
  if(!list.length)throw new Error('Chưa có kết quả tra cứu để xuất.');
  const name=safeFilename(lookup.contractorName||lookup.focusTaxCode||'nha-thau');
  return exportWorkbook(`GiaoSuCuiBap/KQLCNT-${name}-${stamp()}.xlsx`,{
    sheetName:'Gói đã trúng',
    scopeSource:lookup,
    reconciliation:{source:lookup,criteria:lookup.criteria,unit:'gói trúng thầu',exportedRecords:list.length,exportedRows:list.length},
    exportInfo:{scope:`${list.length} gói trong kết quả tra cứu nhà thầu.`,coverage:lookup?.coverage?.text},
    columns:[
      {header:'Mã TBMT',key:'notifyNoStand',width:18},
      {header:'Vai trò',key:'focusRole',width:12},
      {header:'Tên gói thầu',key:'bidName',width:52},
      {header:'Nhà thầu trúng thầu',key:'winnerName',width:38},
      {header:'MST nhà thầu trúng',key:'winningTaxCodes',width:22},
      {header:'Thành viên liên danh',key:'memberNames',width:38},
      {header:'Giá gói thầu/dự toán',key:'priceBasis',type:'money',width:20},
      {header:'Giá trúng thầu',key:'winningPrice',type:'money',width:20},
      {header:'Chênh lệch',key:'savedAmount',type:'money',width:18},
      {header:'Tỷ lệ giảm giá',key:'discountRate',type:'percent',width:14},
      {header:'Chủ đầu tư',key:'investorName',width:36},
      {header:'Địa điểm',key:'location',width:26},
      {header:'Nguồn đối chiếu tỉnh',key:'areaProof',type:'note',width:36},
      {header:'Lĩnh vực',key:'fieldLabel',width:14},
      {header:'Hình thức',key:'bidFormLabel',width:22},
      {header:'Ngày phê duyệt',key:'decisionDate',type:'datetime',width:16},
      {header:'Ngày đăng KQLCNT',key:'publicDateKqlcnt',type:'datetime',width:18},
      {header:'Link e-GP',key:'detailUrl',type:'url',urlLabel:'Mở e-GP',width:16}
    ],
    rows:list.map(p=>({
      notifyNoStand:p.notifyNoStand,focusRole:p.focusRole||'Trúng thầu',bidName:p.bidName,
      winnerName:p.winnerName,winningTaxCodes:(p.winningTaxCodes||[]).join(' | '),memberNames:(p.memberNames||[]).join(' | '),
      priceBasis:numOrNull(p.priceBasis),winningPrice:numOrNull(p.winningPrice),
      savedAmount:numOrNull(p.savedAmount),discountRate:numOrNull(p.discountRate),
      investorName:p.investorName,location:p.location,fieldLabel:p.fieldLabel,
      areaProof:p.areaEvidence?`TBMT ${p.areaEvidence.notifyNo}, phiên bản ${p.areaEvidence.version}`:'Địa bàn trong bản ghi e-GP nguồn; tiêu chí tỉnh ở trang Đối soát',
      bidFormLabel:p.bidFormLabel,decisionDate:p.decisionDate,
      publicDateKqlcnt:p.publicDateKqlcnt,detailUrl:p.detailUrl
    }))
  });
}

async function exportBidOpenCsv(payload={}){
  const s=await getState();
  const scan=s.bidOpenScan;
  const list=(scan?.packages||[]).filter(p=>!payload.onlyFollowed||findBidder(p.bidders||[],scan.focusTaxCode,scan.contractorQuery));
  const rows=[];
  for(const p of list){
    for(const b of (p.bidders||[])){
      const financialPending=openingFinancialPricePending(b);
      const pending=Boolean(financialPending||b.multiLot||b.comparisonPending||p.comparisonPending);
      const lotLabel=[b.lotCode,b.lotName].filter(Boolean).filter((value,index,array)=>array.indexOf(value)===index).join(' · ');
      const finalPrice=numOrNull(b.finalPrice);
      const finalPriceSource=financialPending?'e-GP trả giá 0; chưa đủ căn cứ đối chiếu tài chính':finalPrice===null?'Chưa có giá sau giảm':b.finalPriceDerived===true?'Tính từ giá dự thầu và tỷ lệ giảm'
        :b.finalPriceDerived===false?'e-GP công bố':'Chưa lưu thông tin cách xác định giá';
      const comparisonNote=financialPending?'e-GP trả cả hai giá bằng 0; chưa tính mức giảm hoặc xếp hạng giá':b.multiLot?'Chưa đối chiếu: gói có nhiều phần/lô; chưa có mốc giá riêng của lô'
        :pending?'Chưa đủ căn cứ đối chiếu mốc giá'
        :b.vsPackageAmount==null||b.vsPackageRate==null?'Chưa đủ giá để tính chênh lệch':'Đối chiếu theo mốc giá ghi trong bảng';
      rows.push({
        __gate:p.filterState||'',
        notifyNoStand:p.notifyNoStand,bidName:p.bidName,investorName:p.investorName,
        location:p.location,stageLabel:p.stageLabel,
        openDate:p.bidRealityOpenDate||p.publicDateKqmt,
        bidPrice:numOrNull(p.bidPrice),priceRank:pending?null:numOrNull(b.priceRank),
        name:b.name,taxCode:b.taxCode,ventureName:b.ventureName,
        bidderPrice:numOrNull(b.bidPrice),discountPercent:numOrNull(b.discountPercent),
        finalPrice,finalPriceSource,finalPriceDerived:Boolean(b.finalPriceDerived),lotCode:b.lotCode||'',lotName:b.lotName||'',lotLabel,
        comparisonPending:pending,comparisonNote,vsPackageRate:pending?null:numOrNull(b.vsPackageRate),
        vsPackageAmount:pending?null:numOrNull(b.vsPackageAmount),priceBasis:numOrNull(p.priceBasis??p.bidPrice),
        priceBasisLabel:p.priceBasisLabel||'Giá gói thầu (e-GP)',readState:READ_LABEL[bbmtReadStateOf(p)]||bbmtReadStateOf(p),scannedAt:p.scannedAt,
        detailUrl:p.detailUrl
      });
    }
  }
  const unread=list.filter(p=>!['OK','EMPTY'].includes(bbmtReadStateOf(p))).map(p=>({...p,state:READ_LABEL[bbmtReadStateOf(p)]||bbmtReadStateOf(p),readCount:p.bidders?.length||0}));
  if(!rows.length&&!unread.length)throw new Error('Chưa có dữ liệu nhà thầu để xuất.');
  return exportWorkbook(`GiaoSuCuiBap/Bien-ban-mo-thau-${stamp()}.xlsx`,{
    sheetName:'Biên bản mở thầu',
    reconciliation:{source:scan,criteria:scan?{...scan.scope,maxPackages:scan.maxPackages,focusTaxCode:scan.focusTaxCode,contractorQuery:scan.contractorQuery}:null,view:{onlyFollowed:Boolean(payload.onlyFollowed)},unit:'gói thầu có biên bản',timeBasis:'Thời điểm mở thầu thực tế (bidRealityOpenDate)',exportedRecords:list.length,exportedRows:rows.length,rows,extras:[{label:'Gói chưa đọc đủ trong phạm vi xuất',value:unread.length,note:'Danh sách ở trang Chưa đọc đủ nếu có; không hiểu là không có nhà thầu.'}]},
    exportInfo:{scope:`${list.length} gói trong phạm vi đã chọn; ${rows.length} lượt nhà thầu đã đọc.`,coverage:scan?.coverage?.text,notes:[`Có ${unread.length} gói chưa đọc đủ. Xem trang Chưa đọc đủ nếu có; không hiểu các gói này là không có nhà thầu.`,...(payload.onlyFollowed?['Đang lọc các gói đã xác nhận có nhà thầu theo dõi. Gói chưa đọc được chưa thể xác định thuộc nhóm này.']:[]),'Hạng giá chỉ so sánh giá đã công bố, chưa phải kết quả trúng thầu. Mốc đối chiếu nằm trong cột Nguồn mốc giá ở trang chi tiết.']},
    sheets:unread.length?[{sheetName:'Chưa đọc đủ',columns:[{header:'Mã TBMT',key:'notifyNoStand',width:20},{header:'Tên gói thầu',key:'bidName',width:52},{header:'Trạng thái đọc',key:'state',width:25},{header:'Số nhà thầu đã đọc',key:'readCount',type:'number',width:18},{header:'Số nhà thầu e-GP công bố',key:'numBidderJoin',type:'number',width:20},{header:'Link e-GP',key:'detailUrl',type:'url',urlLabel:'Mở e-GP',width:16}],rows:unread}]:[],
    columns:[
      {header:'Mã TBMT',key:'notifyNoStand',width:18},
      {header:'Tên gói thầu',key:'bidName',width:52},
      {header:'Chủ đầu tư',key:'investorName',width:36},
      {header:'Địa điểm',key:'location',width:26},
      {header:'Trạng thái',key:'stageLabel',width:20},
      {header:'Ngày mở thầu',key:'openDate',type:'datetime',width:16},
      {header:'Giá gói thầu',key:'bidPrice',type:'money',width:20},
      {header:'Hạng giá',key:'priceRank',type:'number',width:10},
      {header:'Nhà thầu',key:'name',width:38},
      {header:'Mã số thuế',key:'taxCode',width:14},
      {header:'Liên danh',key:'ventureName',width:30},
      {header:'Giá dự thầu',key:'bidderPrice',type:'money',width:20},
      {header:'Giảm giá tự khai',key:'discountPercent',type:'percent',width:16},
      {header:'Giá sau giảm giá',key:'finalPrice',type:'money',width:20},
      {header:'Mốc giá đối chiếu',key:'priceBasis',type:'money',width:22},
      {header:'Nguồn mốc giá',key:'priceBasisLabel',width:30},
      {header:'Giảm so mốc giá (%)',key:'vsPackageRate',type:'percent',width:22},
      {header:'Giảm so mốc giá (đồng)',key:'vsPackageAmount',type:'money',width:24},
      {header:'Trạng thái đọc',key:'readState',width:16},
      {header:'Đọc lúc',key:'scannedAt',type:'datetime',width:20},
      {header:'Link e-GP',key:'detailUrl',type:'url',urlLabel:'Mở e-GP',width:16},
      {header:'Phần/lô',key:'lotLabel',width:32},
      {header:'Nguồn giá sau giảm',key:'finalPriceSource',type:'note',width:34},
      {header:'Đối chiếu',key:'comparisonNote',type:'note',width:46}
    ],
    rows
  });
}

async function exportProfileXlsx(payload={}){
  const res=await getContractorProfile(payload);
  if(!res.ok)throw new Error(res.message);
  const p=res.profile;
  const w=p.won;
  const nm=safeFilename(p.contractorName||p.taxCode);

  const overview=[
    {k:'Nhà thầu',v:p.contractorName,note:''},
    {k:'Mã số thuế',v:p.taxCode,note:''},
    {k:'Số gói đã TRÚNG',v:w.wonCount,note:'Trong kết quả truy vấn e-GP theo MST; xem phạm vi ở trang Thông tin xuất'},
    {k:'  trong đó trúng độc lập',v:w.soloCount,note:''},
    {k:'  trong đó trúng liên danh',v:w.ventureCount,note:''},
    {k:'Giá trị trúng độc lập',v:w.soloValue,note:'Chỉ cộng giá trúng đã biết trong dữ liệu đã thu thập; giá thiếu không phải 0'},
    {k:'Giá trị gói liên danh',v:w.ventureValue,note:'Để riêng — e-GP không công bố tỷ lệ góp vốn'},
    {k:'Giảm giá trung vị (%)',v:w.discount.median,note:`trên ${w.discount.n} gói có đủ giá`},
    {k:'Số gói ĐÃ QUÉT thấy dự thầu',v:p.participation.scannedCount,note:'Một phần — chỉ trong dữ liệu đã quét'},
    {k:'  đã trúng',v:p.participation.won,note:'Một phần'},
    {k:'  đã trượt',v:p.participation.lost,note:'Một phần'},
    {k:'  chưa có kết quả',v:p.participation.pending,note:'Một phần'},
    {k:'  bị hủy',v:p.participation.cancelled,note:'Một phần'},
    {k:'Tỷ lệ trúng trong phạm vi đã quét',v:p.participation.winRate.text,
     note:`trên ${p.participation.decidedCount} gói đã có kết quả — KHÔNG phải tỷ lệ trúng thật`}
  ].map(r=>({k:r.k,v:typeof r.v==='number'?r.v:String(r.v===null||r.v===undefined?'':r.v),note:r.note}));

  return exportWorkbook(`GiaoSuCuiBap/Ho-so-360-${nm}-${stamp()}.xlsx`,{exportInfo:{scope:'Tổng hợp trong các gói đã thu thập của hồ sơ này; không suy ra toàn thị trường.'},sheets:[
    {sheetName:'Tổng quan',
     columns:[{header:'Chỉ tiêu',key:'k',width:38},{header:'Giá trị',key:'v',type:'auto',width:30},
              {header:'Độ đầy đủ',key:'note',type:'note',width:46}],
     rows:overview},

    {sheetName:'Theo năm',
     columns:[{header:'Năm',key:'year',width:10},{header:'Số gói trúng',key:'won',type:'number',width:14},
              {header:'Giá trị trúng',key:'value',type:'money',width:22},
              {header:'Giảm giá trung vị',key:'median',type:'percent',width:18}],
     rows:w.years.map(y=>({year:y.year,won:y.won,value:numOrNull(y.value),median:y.discount.median}))},

    {sheetName:'Tỉnh - Thành phố',
     columns:[{header:'Tỉnh/Thành phố',key:'name',width:34},{header:'Số gói',key:'count',type:'number',width:11},
              {header:'Giá trị',key:'value',type:'money',width:22}],
     rows:w.provinces.map(x=>({name:x.name,count:x.count,value:numOrNull(x.value)}))},

    {sheetName:'Bên mời thầu',
     columns:[{header:'Bên mời thầu',key:'name',width:48},{header:'Số gói',key:'count',type:'number',width:11},
              {header:'Giá trị',key:'value',type:'money',width:22}],
     rows:w.entities.map(x=>({name:x.name,count:x.count,value:numOrNull(x.value)}))},

    {sheetName:'Danh sách gói đã trúng',
     columns:[
       {header:'Mã TBMT',key:'notifyNoStand',width:18},
       {header:'Vai trò',key:'role',width:12},
       {header:'Tên gói thầu',key:'bidName',width:52},
       {header:'Bên mời thầu',key:'entity',width:38},
       {header:'Địa điểm',key:'location',width:30},
       {header:'Giá gói thầu/dự toán',key:'priceBasis',type:'money',width:21},
       {header:'Giá trúng thầu',key:'winningPrice',type:'money',width:20},
       {header:'Tỷ lệ giảm giá',key:'discountRate',type:'percent',width:15},
       {header:'Lĩnh vực',key:'fieldLabel',width:14},
       {header:'Hình thức',key:'bidFormLabel',width:22},
       {header:'Ngày phê duyệt',key:'decisionDate',type:'datetime',width:16},
       {header:'Link e-GP',key:'detailUrl',type:'url',urlLabel:'Mở e-GP',width:16}],
     rows:w.packages.map(x=>({
       notifyNoStand:x.notifyNoStand,role:x.isVenture?'Liên danh':'Độc lập',
       bidName:x.bidName,entity:x.procuringEntityName||x.investorName,location:x.location,
       priceBasis:numOrNull(x.priceBasis),winningPrice:numOrNull(x.winningPrice),
       discountRate:numOrNull(x.discountRate),fieldLabel:x.fieldLabel,bidFormLabel:x.bidFormLabel,
       decisionDate:x.decisionDate,detailUrl:x.detailUrl}))}
  ]});
}

async function exportInvestorXlsx(){
  const s=await getState();
  const scan=s.investorScan;
  const sum=scan&&scan.summary;
  if(!sum)throw new Error('Chưa có hồ sơ chủ đầu tư để xuất. Hãy chọn một đơn vị rồi chạy hồ sơ trước.');
  const nm=safeFilename(scan.criteria.name||scan.criteria.codes.join('-')||'chu-dau-tu');

  const overview=[
    {k:'Chủ đầu tư',v:scan.criteria.name||'',note:''},
    {k:'Mã định danh',v:(scan.criteria.codes||[]).join(', '),note:''},
    {k:'Số gói đã tổ chức (có kết quả)',v:sum.packageCount,note:'Trong dữ liệu đã thu thập'},
    {k:'Số nhà thầu đã TRÚNG',v:sum.contractorCount,note:'Trong dữ liệu đã thu thập — đếm theo mã số thuế'},
    {k:'Tổng lượt nhà thầu tham dự',v:sum.joinTotal,note:'e-GP ghi sẵn từng gói'},
    {k:'  số gói e-GP ghi 0 người dự',v:sum.joinZeroCount,note:'thường là chỉ định thầu rút gọn'},
    {k:'  số gói có từ 2 nhà thầu trở lên',v:sum.competitiveCount,note:''},
    {k:'Trung bình nhà thầu/gói',v:sum.joinAverage,note:''},
    {k:'Giá trị trúng độc lập',v:sum.soloValue,note:'Chỉ cộng giá trúng đã biết trong dữ liệu đã thu thập; giá thiếu không phải 0'},
    {k:'Giá trị gói liên danh',v:sum.ventureValue,note:'Để riêng — e-GP không công bố tỷ lệ góp vốn'},
    {k:'Giảm giá trung vị (%)',v:sum.discount.median,note:`trên ${sum.discount.n} gói có đủ giá`},
    {k:'HHI giá trúng độc lập',v:sum.concentration.value,note:`${hhiAssessment(sum.concentration)}. ${HHI_SCOPE_NOTE}`},
    {k:'Số nhà thầu có giá tính HHI',v:sum.concentration.n,note:'Đếm nhà thầu có tổng giá trúng độc lập dương; không phải số gói.'},
    {k:'Nhà thầu trúng nhiều nhất',v:sum.topContractor?(sum.topContractor.name||sum.topContractor.taxCode):'',note:''},
    {k:'  tỷ trọng số gói',v:sum.topShare.text,note:`trên ${sum.topShare.n} gói`}
  ].map(r=>({k:r.k,v:typeof r.v==='number'?r.v:String(r.v===null||r.v===undefined?'':r.v),note:r.note}));

  return exportWorkbook(`GiaoSuCuiBap/Ho-so-chu-dau-tu-${nm}-${stamp()}.xlsx`,{scopeSource:scan,reconciliation:{source:scan,criteria:scan.criteria,unit:'gói thầu',exportedRecords:sum.packages.length,exportedRows:sum.packages.length},exportInfo:{scope:'Tổng hợp trong các gói đã thu thập của hồ sơ này; không suy ra toàn thị trường.'},sheets:[
    {sheetName:'Tổng quan',
     columns:[{header:'Chỉ tiêu',key:'k',width:36},{header:'Giá trị',key:'v',type:'auto',width:34},
              {header:'Ghi chú',key:'note',type:'note',width:44}],
     rows:overview},

    {sheetName:'Nhà thầu đã trúng',
     columns:[
       {header:'Nhà thầu',key:'name',width:44},
       {header:'Mã số thuế',key:'taxCode',width:14},
       {header:'Số gói trúng',key:'packages',type:'number',width:13},
       {header:'Tỷ trọng số gói',key:'share',type:'percent',width:16},
       {header:'Độc lập',key:'soloCount',type:'number',width:10},
       {header:'Liên danh',key:'ventureCount',type:'number',width:11},
       {header:'Giá trị độc lập',key:'soloValue',type:'money',width:20},
       {header:'Giá trị liên danh',key:'ventureValue',type:'money',width:20},
       {header:'Giảm giá trung vị',key:'discountMedian',type:'percent',width:17},
       {header:'Năm',key:'years',width:20}],
     rows:sum.contractors.map(c=>({
       name:c.name,taxCode:c.taxCode,packages:c.packages,share:c.share.value,
       soloCount:c.soloCount,ventureCount:c.ventureCount,
       soloValue:numOrNull(c.soloValue),ventureValue:numOrNull(c.ventureValue),
       discountMedian:c.discount.median,years:(c.years||[]).join(', ')}))},

    {sheetName:'Theo năm',
     columns:[{header:'Năm',key:'key',width:10},{header:'Số gói',key:'packages',type:'number',width:11},
              {header:'Giá trị trúng',key:'value',type:'money',width:22},
              {header:'Giảm giá trung vị',key:'median',type:'percent',width:18}],
     rows:sum.byYear.map(x=>({key:x.key,packages:x.packages,value:numOrNull(x.value),median:x.discount.median}))},

    {sheetName:'Theo hình thức',
     columns:[{header:'Hình thức LCNT',key:'key',width:26},{header:'Số gói',key:'packages',type:'number',width:11},
              {header:'Giá trị trúng',key:'value',type:'money',width:22},
              {header:'Giảm giá trung vị',key:'median',type:'percent',width:18}],
     rows:sum.byForm.map(x=>({key:x.key,packages:x.packages,value:numOrNull(x.value),median:x.discount.median}))},

    {sheetName:'Danh sách gói thầu',
     columns:[
       {header:'Mã TBMT',key:'notifyNoStand',width:18},
       {header:'Tên gói thầu',key:'bidName',width:52},
       {header:'Nhà thầu trúng',key:'winnerName',width:38},
       {header:'Số nhà thầu dự',key:'numBidderJoin',type:'number',width:14},
       {header:'Giá gói thầu/dự toán',key:'priceBasis',type:'money',width:21},
       {header:'Giá trúng thầu',key:'winningPrice',type:'money',width:20},
       {header:'Tỷ lệ giảm giá',key:'discountRate',type:'percent',width:15},
       {header:'Lĩnh vực',key:'fieldLabel',width:14},
       {header:'Hình thức',key:'bidFormLabel',width:22},
       {header:'Địa điểm',key:'location',width:30},
       {header:'Ngày phê duyệt',key:'decisionDate',type:'datetime',width:16},
       {header:'Link e-GP',key:'detailUrl',type:'url',urlLabel:'Mở e-GP',width:16}],
     rows:sum.packages.map(p=>({
       notifyNoStand:p.notifyNoStand,bidName:p.bidName,winnerName:p.winnerName,
       numBidderJoin:numOrNull(p.numBidderJoin),
       priceBasis:numOrNull(p.priceBasis),winningPrice:numOrNull(p.winningPrice),
       discountRate:numOrNull(p.discountRate),fieldLabel:p.fieldLabel,bidFormLabel:p.bidFormLabel,
       location:p.location,decisionDate:p.decisionDate,detailUrl:p.detailUrl}))}
  ]});
}

async function exportAreaXlsx(){
  const s=await getState();
  const scan=s.areaScan;
  const sum=scan&&scan.summary;
  if(!sum||!sum.pairs.length)throw new Error('Chưa có kết quả soi địa bàn để xuất.');
  const pr=scan.pricing||null;
  const name=safeFilename(scan.criteria.ward||'dia-ban');

  // Một sổ NHIỀU TRANG thay vì nhiều tệp rời: mở một lần là thấy đủ các góc
  // nhìn, và các trang tham chiếu chéo được nhau ngay trong Excel.
  const sheets=[];

  sheets.push({
    sheetName:'Quan hệ CĐT - Nhà thầu',
    columns:[
      {header:'Chủ đầu tư',key:'investorName',width:40},
      {header:'Nhà thầu',key:'contractorName',width:40},
      {header:'Mã số thuế',key:'taxCode',width:14},
      {header:'Số gói trúng',key:'packages',type:'number',width:13},
      {header:'Tỷ trọng gói của CĐT',key:'share',type:'percent',width:19},
      {header:'Giá trị trúng độc lập',key:'soloValue',type:'money',width:21},
      {header:'Giá trị gói liên danh',key:'ventureValue',type:'money',width:21},
      {header:'Giảm giá trung vị',key:'discountMedian',type:'percent',width:17},
      {header:'Số gói có giá',key:'discountN',type:'number',width:13},
      {header:'Năm hoạt động',key:'years',width:22}
    ],
    rows:sum.pairs.map(p=>({
      investorName:p.investorName,contractorName:p.contractorName,taxCode:p.taxCode,
      packages:p.packages,share:p.shareOfInvestor.value,
      soloValue:numOrNull(p.soloValue),ventureValue:numOrNull(p.ventureValue),
      discountMedian:p.discount.median,discountN:p.discount.n,
      years:(p.years||[]).join(', ')
    }))
  });

  sheets.push({
    sheetName:'Theo nhà thầu',
    columns:[
      {header:'Nhà thầu',key:'name',width:42},
      {header:'Mã số thuế',key:'taxCode',width:14},
      {header:'Số gói trúng',key:'packages',type:'number',width:13},
      {header:'Trúng độc lập',key:'soloCount',type:'number',width:13},
      {header:'Trúng liên danh',key:'ventureCount',type:'number',width:15},
      {header:'Giá trị độc lập',key:'soloValue',type:'money',width:20},
      {header:'Giá trị liên danh',key:'ventureValue',type:'money',width:20},
      {header:'Giảm giá trung vị',key:'discountMedian',type:'percent',width:17},
      {header:'Số chủ đầu tư',key:'investorCount',type:'number',width:14},
      {header:'Từ năm',key:'firstYear',type:'integer',width:10},
      {header:'Đến năm',key:'lastYear',type:'integer',width:10}
    ],
    rows:sum.contractors.map(c=>({
      name:c.name,taxCode:c.taxCode,packages:c.packages,
      soloCount:c.soloCount,ventureCount:c.ventureCount,
      soloValue:numOrNull(c.soloValue),ventureValue:numOrNull(c.ventureValue),
      discountMedian:c.discount.median,investorCount:c.investorCount,
      firstYear:c.firstYear,lastYear:c.lastYear
    }))
  });

  sheets.push({
    sheetName:'Theo chủ đầu tư',
    columns:[
      {header:'Chủ đầu tư',key:'investorName',width:44},
      {header:'Số gói',key:'packages',type:'number',width:10},
      {header:'Số nhà thầu',key:'contractorCount',type:'number',width:13},
      {header:'Tổng giá trị',key:'totalValue',type:'money',width:20},
      {header:'Nhà thầu trúng nhiều nhất',key:'topName',width:38},
      {header:'Tỷ trọng',key:'topShare',type:'percent',width:12},
      {header:'HHI giá trúng độc lập',key:'hhi',type:'number',width:20},
      {header:'Số nhà thầu có giá tính HHI',key:'hhiN',type:'number',width:22},
      {header:'Đánh giá mẫu HHI',key:'level',width:28},
      {header:'Phạm vi tính HHI',key:'hhiScope',type:'note',width:50}
    ],
    rows:sum.investors.map(i=>({
      investorName:i.investorName,packages:i.packages,contractorCount:i.contractorCount,
      totalValue:numOrNull(i.totalValue),
      topName:i.topContractor?(i.topContractor.name||i.topContractor.taxCode):'',
      topShare:i.topShare.value,hhi:i.concentration.value,hhiN:i.concentration.n,level:hhiAssessment(i.concentration),hhiScope:HHI_SCOPE_NOTE
    }))
  });

  if(pr){
    sheets.push({
      sheetName:'Giá thị trường',
      columns:[
        {header:'Nhóm',key:'group',width:22},
        {header:'Phân theo',key:'label',width:26},
        {header:'Số gói',key:'n',type:'number',width:10},
        {header:'Giảm ít nhất',key:'min',type:'percent',width:14},
        {header:'Tứ phân vị 1',key:'q1',type:'percent',width:14},
        {header:'Trung vị',key:'median',type:'percent',width:12},
        {header:'Tứ phân vị 3',key:'q3',type:'percent',width:14},
        {header:'Giảm nhiều nhất',key:'max',type:'percent',width:16},
        {header:'Tổng giá trị trúng',key:'totalValue',type:'money',width:20},
        {header:'Đủ mẫu tin cậy',key:'reliable',width:18}
      ],
      rows:[
        ...pr.byBand.map(x=>({group:'Khoảng giá',...priceRow(x)})),
        ...pr.byField.map(x=>({group:'Lĩnh vực',...priceRow(x)})),
        ...pr.byForm.map(x=>({group:'Hình thức LCNT',...priceRow(x)})),
        ...pr.byYear.map(x=>({group:'Năm phê duyệt',...priceRow(x)}))
      ]
    });
  }

  sheets.push({
    sheetName:'Danh sách gói thầu',
    columns:[
      {header:'Mã TBMT',key:'notifyNoStand',width:18},
      {header:'Tên gói thầu',key:'bidName',width:52},
      {header:'Chủ đầu tư',key:'investorName',width:38},
      {header:'Nhà thầu trúng',key:'winnerName',width:38},
      {header:'Giá gói thầu/dự toán',key:'priceBasis',type:'money',width:21},
      {header:'Giá trúng thầu',key:'winningPrice',type:'money',width:20},
      {header:'Tỷ lệ giảm giá',key:'discountRate',type:'percent',width:15},
      {header:'Lĩnh vực',key:'fieldLabel',width:14},
      {header:'Hình thức',key:'bidFormLabel',width:22},
      {header:'Ngày phê duyệt',key:'decisionDate',type:'datetime',width:16},
      {header:'Link e-GP',key:'detailUrl',type:'url',urlLabel:'Mở e-GP',width:16}
    ],
    rows:(scan.packages||[]).map(p=>({
      notifyNoStand:p.notifyNoStand,bidName:p.bidName,investorName:p.investorName,
      winnerName:p.winnerName,priceBasis:numOrNull(p.priceBasis),
      winningPrice:numOrNull(p.winningPrice),discountRate:numOrNull(p.discountRate),
      fieldLabel:p.fieldLabel,bidFormLabel:p.bidFormLabel,
      decisionDate:p.decisionDate,detailUrl:p.detailUrl
    }))
  });

  return exportWorkbook(`GiaoSuCuiBap/Soi-dia-ban-${name}-${stamp()}.xlsx`,{scopeSource:scan,reconciliation:{source:scan,criteria:scan.criteria,unit:'gói thầu',exportedRecords:scan.packages.length,exportedRows:scan.packages.length},exportInfo:{scope:'Trong các gói đã thu thập theo tiêu chí địa bàn.',coverage:scan?.coverage?.text,notes:[HHI_SCOPE_NOTE]},sheets});
}

async function exportPlansCsv(payload={}){
  const s=await getState();
  const list=((s.planLookup&&s.planLookup.plans)||[]).filter(p=>!payload.onlyUnannounced||p.hasUnannounced);
  const rows=[];
  for(const p of list){
    const base={
      __gate:p.filterState||'',
      planNoStand:p.planNoStand,name:p.name,projectName:p.projectName,
      investorName:p.investorName,investorCode:p.investorCode,location:p.location,
      planTypeLabel:p.planTypeLabel,decisionDate:p.decisionDate,
      publicDate:p.publicDate,
      note:p.hasUnannounced?'Còn gói chưa có TBMT':'',
      investTotal:numOrNull(p.investTotal),detailUrl:p.detailUrl
    };
    if(!p.packages.length){ rows.push({...base,packageName:'',packagePrice:null}); continue; }
    for(const g of p.packages)rows.push({...base,__gate:g.filterState||base.__gate,packageName:g.name,packagePrice:numOrNull(g.price)});
  }
  if(!rows.length)throw new Error('Chưa có kế hoạch nào để xuất.');
  return exportWorkbook(`GiaoSuCuiBap/KHLCNT-${stamp()}.xlsx`,{
    sheetName:'Kế hoạch LCNT',
    reconciliation:{source:s.planLookup,criteria:s.planLookup?.criteria,view:{onlyUnannounced:Boolean(payload.onlyUnannounced)},unit:'kế hoạch lựa chọn nhà thầu',timeBasis:'Ngày phê duyệt kế hoạch (decisionDate)',exportedRecords:list.length,exportedRows:rows.length,rows},
    exportInfo:{scope:`${list.length} kế hoạch, ${rows.length} dòng gói thầu${payload.onlyUnannounced?' trong kế hoạch còn gói chưa mời thầu':''}.`,coverage:s.planLookup?.coverage?.text,notes:['Mỗi dòng tương ứng một gói trong kế hoạch. Tổng mức đầu tư của kế hoạch lặp lại theo gói: không cộng cột này để tính tổng danh mục.']},
    columns:[
      {header:'Mã KHLCNT',key:'planNoStand',width:20},
      {header:'Tên kế hoạch',key:'name',width:46},
      {header:'Dự án',key:'projectName',width:40},
      {header:'Chủ đầu tư',key:'investorName',width:40},
      {header:'Mã CĐT',key:'investorCode',width:16},
      {header:'Địa điểm',key:'location',width:30},
      {header:'Loại kế hoạch',key:'planTypeLabel',width:18},
      {header:'Ngày phê duyệt',key:'decisionDate',type:'datetime',width:16},
      {header:'Ngày đăng tải',key:'publicDate',type:'datetime',width:16},
      {header:'Ghi chú',key:'note',type:'note',width:22},
      {header:'Tên gói thầu',key:'packageName',width:50},
      {header:'Giá gói thầu',key:'packagePrice',type:'money',width:20},
      {header:'Tổng mức đầu tư',key:'investTotal',type:'money',width:20},
      {header:'Link e-GP',key:'detailUrl',type:'url',urlLabel:'Mở e-GP',width:16}
    ],
    rows
  });
}
return {exportCsv,exportMobileReport,exportBackup,exportWinnersCsv,exportBidOpenCsv,exportProfileXlsx,exportInvestorXlsx,exportAreaXlsx,exportPlansCsv};
}
