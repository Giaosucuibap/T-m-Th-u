import { hardFilterReason } from './hard-filter.js';
import { GATE_LABEL } from './match-gate.js';
import { DEFAULT_SETTINGS, formatDate, safeFilename, BID_STATUS_LABEL } from './core.js';
import { buildSafeBackupState } from './backup.js';
import { bbmtReadStateOf, findBidder } from './bbmt.js';
import { DECISION_STATE_LABEL, normalizeDecisionState, statusOf } from './decision.js';
import { createResultView, verifyExportKeys } from './result-view.js';

/** export operations execute here; Chrome/storage boundaries are injected for replay tests. */
export function createExportRuntime({getState,readSearchState,downloadData,downloadXlsx,mobileHtml,getContractorProfile,priceRow,sanitizedTemplateState,stamp,numOrNull,chrome}) {
async function exportCsv(saveAs=true,keys=null,runId='',view={},revision=''){
  const s=await getState();
  let selectedRun=null;
  if(runId){
    selectedRun=s.runs.find(r=>r.id===runId);
    if(!selectedRun)throw new Error('Không tìm thấy lượt tra cứu cần xuất.');
    if(revision){
      const current=await readSearchState({runId});
      if(current.revision!==revision)throw new Error('Kết quả đã thay đổi. Hãy tải lại trước khi xuất Excel.');
    }
    s.tenders=verifyExportKeys(createResultView(s.tenders,selectedRun,view).rows,keys);
    keys=null;
  }
  if(keys!==null){
    if(!Array.isArray(keys)||keys.length>10000||keys.some(k=>typeof k!=='string'))throw new Error('Phạm vi xuất không hợp lệ.');
    const selected=new Set(keys);
    s.tenders=s.tenders.filter(t=>selected.has(t.key));
  }
  if(!s.tenders.length)throw new Error('Không có gói trong phạm vi xuất.');
  /* Dải đầu bảng nói rõ bảng này là gì và lọc theo cái gì. Người nhận file
     không ngồi cạnh người xuất file, nên bảng phải tự giải thích được. */
  const phamVi=selectedRun?.coverage?.text||'';
  const dem=s.tenders.reduce((acc,t)=>{acc[t.filterState]=(acc[t.filterState]||0)+1;return acc;},{});
  const tomTat=[`${s.tenders.length} gói`,
    dem.MATCH?`khớp ${dem.MATCH}`:'',
    dem.INSUFFICIENT?`chưa đủ dữ liệu ${dem.INSUFFICIENT}`:'',
    dem.OUT_OF_RANGE?`ngoài tiêu chí ${dem.OUT_OF_RANGE}`:''].filter(Boolean).join(' · ');

  return downloadXlsx(`GiaoSuCuiBap/DS-goi-thau-${stamp()}.xlsx`,{
    sheetName:'Gói thầu',
    title:'DANH SÁCH GÓI THẦU — Giáo Sư Cùi Bắp',
    subtitle:`${tomTat}${phamVi?' — '+phamVi:''} · xuất lúc ${new Date().toLocaleString('vi-VN')}`,
    columns:[
      {header:'Điểm',key:'score',type:'number',width:8},
      {header:'Khuyến nghị',key:'recommendation',width:30},
      {header:'Đối chiếu tiêu chí',key:'filterState',width:28,emphasis:'bold'},
      {header:'Lý do đối chiếu',key:'filterReason',width:38,emphasis:'italic'},
      {header:'Thời điểm ghi nhận',key:'checkedAt',width:22},
      {header:'Phạm vi dữ liệu',key:'coverage',width:60},
      {header:'Trạng thái',key:'statusLabel',width:16},
      {header:'Mã TBMT',key:'notifyNo',width:16},
      {header:'Mã gói thầu (KHLCNT)',key:'bidNo',width:18},
      {header:'Phiên bản',key:'version',width:10},
      {header:'Tên gói thầu',key:'bidName',width:50,emphasis:'bold'},
      {header:'Dự án',key:'projectName',width:38},
      {header:'Địa điểm',key:'location',width:26},
      {header:'Giá gói thầu',key:'price',type:'money',width:20,emphasis:'bold'},
      {header:'Ngày đăng',key:'publicDate',width:18},
      {header:'Đóng thầu',key:'closeDate',width:18},
      {header:'Chủ đầu tư',key:'investorName',width:34},
      {header:'Bên mời thầu',key:'procuringEntityName',width:34},
      {header:'Quyết định',key:'decisionState',width:22},
      {header:'Người phụ trách',key:'decisionOwner',width:22},
      {header:'Ghi chú nội bộ',key:'decisionNote',width:42},
      {header:'Số thay đổi đã ghi nhận',key:'changeCount',type:'number',width:20},
      {header:'Thay đổi gần nhất',key:'lastChange',width:38},
      {header:'Link e-GP',key:'detailUrl',type:'url',width:44}
    ],
    rows:s.tenders.map(t=>({
      // `__gate` không phải một cột — nó là căn cứ để tô nền dòng theo đúng
      // kết luận của cổng lọc, xem lib/xlsx.js. Không có kết luận thì không tô.
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
  return downloadXlsx(`GiaoSuCuiBap/KQLCNT-${name}-${stamp()}.xlsx`,{
    sheetName:'Gói đã trúng',
    columns:[
      {header:'Mã TBMT',key:'notifyNoStand',width:18},
      {header:'Vai trò',key:'focusRole',width:12},
      {header:'Tên gói thầu',key:'bidName',width:52},
      {header:'Nhà thầu trúng thầu',key:'winnerName',width:38},
      {header:'Thành viên liên danh',key:'memberNames',width:38},
      {header:'Giá gói thầu/dự toán',key:'priceBasis',type:'money',width:20},
      {header:'Giá trúng thầu',key:'winningPrice',type:'money',width:20},
      {header:'Chênh lệch',key:'savedAmount',type:'money',width:18},
      {header:'Tỷ lệ giảm giá',key:'discountRate',type:'percent',width:14},
      {header:'Chủ đầu tư',key:'investorName',width:36},
      {header:'Địa điểm',key:'location',width:26},
      {header:'Lĩnh vực',key:'fieldLabel',width:14},
      {header:'Hình thức',key:'bidFormLabel',width:22},
      {header:'Ngày phê duyệt',key:'decisionDate',width:16},
      {header:'Ngày đăng KQLCNT',key:'publicDateKqlcnt',width:18},
      {header:'Link e-GP',key:'detailUrl',type:'url',width:44}
    ],
    rows:list.map(p=>({
      notifyNoStand:p.notifyNoStand,focusRole:p.focusRole||'Trúng thầu',bidName:p.bidName,
      winnerName:p.winnerName,memberNames:(p.memberNames||[]).join(' | '),
      priceBasis:numOrNull(p.priceBasis),winningPrice:numOrNull(p.winningPrice),
      savedAmount:numOrNull(p.savedAmount),discountRate:numOrNull(p.discountRate),
      investorName:p.investorName,location:p.location,fieldLabel:p.fieldLabel,
      bidFormLabel:p.bidFormLabel,decisionDate:formatDate(p.decisionDate),
      publicDateKqlcnt:formatDate(p.publicDateKqlcnt),detailUrl:p.detailUrl
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
      rows.push({
        notifyNoStand:p.notifyNoStand,bidName:p.bidName,investorName:p.investorName,
        location:p.location,stageLabel:p.stageLabel,
        openDate:formatDate(p.bidRealityOpenDate||p.publicDateKqmt),
        bidPrice:numOrNull(p.bidPrice),priceRank:numOrNull(b.priceRank),
        name:b.name,taxCode:b.taxCode,ventureName:b.ventureName,
        bidderPrice:numOrNull(b.bidPrice),discountPercent:numOrNull(b.discountPercent),
        finalPrice:numOrNull(b.finalPrice),vsPackageRate:numOrNull(b.vsPackageRate),
        vsPackageAmount:numOrNull(b.vsPackageAmount),priceBasis:numOrNull(p.priceBasis??p.bidPrice),
        priceBasisLabel:p.priceBasisLabel||'Giá gói thầu (e-GP)',readState:bbmtReadStateOf(p),scannedAt:formatDate(p.scannedAt),
        detailUrl:p.detailUrl
      });
    }
  }
  if(!rows.length)throw new Error('Chưa có dữ liệu nhà thầu để xuất.');
  return downloadXlsx(`GiaoSuCuiBap/Bien-ban-mo-thau-${stamp()}.xlsx`,{
    sheetName:'Biên bản mở thầu',
    columns:[
      {header:'Mã TBMT',key:'notifyNoStand',width:18},
      {header:'Tên gói thầu',key:'bidName',width:52},
      {header:'Chủ đầu tư',key:'investorName',width:36},
      {header:'Địa điểm',key:'location',width:26},
      {header:'Trạng thái',key:'stageLabel',width:20},
      {header:'Ngày mở thầu',key:'openDate',width:16},
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
      {header:'Đọc lúc',key:'scannedAt',width:20},
      {header:'Link e-GP',key:'detailUrl',type:'url',width:44}
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
    {k:'Số gói đã TRÚNG',v:w.wonCount,note:'Đầy đủ — hỏi e-GP theo MST'},
    {k:'  trong đó trúng độc lập',v:w.soloCount,note:''},
    {k:'  trong đó trúng liên danh',v:w.ventureCount,note:''},
    {k:'Giá trị trúng độc lập',v:w.soloValue,note:'Đầy đủ'},
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

  return downloadXlsx(`GiaoSuCuiBap/Ho-so-360-${nm}-${stamp()}.xlsx`,{sheets:[
    {sheetName:'Tổng quan',
     columns:[{header:'Chỉ tiêu',key:'k',width:38},{header:'Giá trị',key:'v',width:30},
              {header:'Độ đầy đủ',key:'note',width:46}],
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
       {header:'Ngày phê duyệt',key:'decisionDate',width:16},
       {header:'Link e-GP',key:'detailUrl',type:'url',width:44}],
     rows:w.packages.map(x=>({
       notifyNoStand:x.notifyNoStand,role:x.isVenture?'Liên danh':'Độc lập',
       bidName:x.bidName,entity:x.procuringEntityName||x.investorName,location:x.location,
       priceBasis:numOrNull(x.priceBasis),winningPrice:numOrNull(x.winningPrice),
       discountRate:numOrNull(x.discountRate),fieldLabel:x.fieldLabel,bidFormLabel:x.bidFormLabel,
       decisionDate:formatDate(x.decisionDate),detailUrl:x.detailUrl}))}
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
    {k:'Số gói đã tổ chức (có kết quả)',v:sum.packageCount,note:'Đầy đủ'},
    {k:'Số nhà thầu đã TRÚNG',v:sum.contractorCount,note:'Đầy đủ — đếm theo mã số thuế'},
    {k:'Tổng lượt nhà thầu tham dự',v:sum.joinTotal,note:'e-GP ghi sẵn từng gói'},
    {k:'  số gói e-GP ghi 0 người dự',v:sum.joinZeroCount,note:'thường là chỉ định thầu rút gọn'},
    {k:'  số gói có từ 2 nhà thầu trở lên',v:sum.competitiveCount,note:''},
    {k:'Trung bình nhà thầu/gói',v:sum.joinAverage,note:''},
    {k:'Giá trị trúng độc lập',v:sum.soloValue,note:'Đầy đủ'},
    {k:'Giá trị gói liên danh',v:sum.ventureValue,note:'Để riêng — e-GP không công bố tỷ lệ góp vốn'},
    {k:'Giảm giá trung vị (%)',v:sum.discount.median,note:`trên ${sum.discount.n} gói có đủ giá`},
    {k:'Mức tập trung (HHI)',v:sum.concentration.value,note:sum.concentration.level||''},
    {k:'Nhà thầu trúng nhiều nhất',v:sum.topContractor?(sum.topContractor.name||sum.topContractor.taxCode):'',note:''},
    {k:'  tỷ trọng số gói',v:sum.topShare.text,note:`trên ${sum.topShare.n} gói`}
  ].map(r=>({k:r.k,v:typeof r.v==='number'?r.v:String(r.v===null||r.v===undefined?'':r.v),note:r.note}));

  return downloadXlsx(`GiaoSuCuiBap/Ho-so-chu-dau-tu-${nm}-${stamp()}.xlsx`,{sheets:[
    {sheetName:'Tổng quan',
     columns:[{header:'Chỉ tiêu',key:'k',width:36},{header:'Giá trị',key:'v',width:34},
              {header:'Ghi chú',key:'note',width:44}],
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
       {header:'Ngày phê duyệt',key:'decisionDate',width:16},
       {header:'Link e-GP',key:'detailUrl',type:'url',width:44}],
     rows:sum.packages.map(p=>({
       notifyNoStand:p.notifyNoStand,bidName:p.bidName,winnerName:p.winnerName,
       numBidderJoin:numOrNull(p.numBidderJoin),
       priceBasis:numOrNull(p.priceBasis),winningPrice:numOrNull(p.winningPrice),
       discountRate:numOrNull(p.discountRate),fieldLabel:p.fieldLabel,bidFormLabel:p.bidFormLabel,
       location:p.location,decisionDate:formatDate(p.decisionDate),detailUrl:p.detailUrl}))}
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
      {header:'Từ năm',key:'firstYear',type:'number',width:10},
      {header:'Đến năm',key:'lastYear',type:'number',width:10}
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
      {header:'Mức tập trung (HHI)',key:'hhi',type:'number',width:18},
      {header:'Đánh giá',key:'level',width:16}
    ],
    rows:sum.investors.map(i=>({
      investorName:i.investorName,packages:i.packages,contractorCount:i.contractorCount,
      totalValue:numOrNull(i.totalValue),
      topName:i.topContractor?(i.topContractor.name||i.topContractor.taxCode):'',
      topShare:i.topShare.value,hhi:i.concentration.value,level:i.concentration.level||''
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
      {header:'Ngày phê duyệt',key:'decisionDate',width:16},
      {header:'Link e-GP',key:'detailUrl',type:'url',width:44}
    ],
    rows:(scan.packages||[]).map(p=>({
      notifyNoStand:p.notifyNoStand,bidName:p.bidName,investorName:p.investorName,
      winnerName:p.winnerName,priceBasis:numOrNull(p.priceBasis),
      winningPrice:numOrNull(p.winningPrice),discountRate:numOrNull(p.discountRate),
      fieldLabel:p.fieldLabel,bidFormLabel:p.bidFormLabel,
      decisionDate:formatDate(p.decisionDate),detailUrl:p.detailUrl
    }))
  });

  return downloadXlsx(`GiaoSuCuiBap/Soi-dia-ban-${name}-${stamp()}.xlsx`,{sheets});
}

async function exportPlansCsv(payload={}){
  const s=await getState();
  const list=((s.planLookup&&s.planLookup.plans)||[]).filter(p=>!payload.onlyUnannounced||p.hasUnannounced);
  const rows=[];
  for(const p of list){
    const base={
      planNoStand:p.planNoStand,name:p.name,projectName:p.projectName,
      investorName:p.investorName,investorCode:p.investorCode,location:p.location,
      planTypeLabel:p.planTypeLabel,decisionDate:formatDate(p.decisionDate),
      publicDate:formatDate(p.publicDate),
      note:p.hasUnannounced?'Còn gói chưa có TBMT':'',
      investTotal:numOrNull(p.investTotal),detailUrl:p.detailUrl
    };
    if(!p.packages.length){ rows.push({...base,packageName:'',packagePrice:null}); continue; }
    for(const g of p.packages)rows.push({...base,packageName:g.name,packagePrice:numOrNull(g.price)});
  }
  if(!rows.length)throw new Error('Chưa có kế hoạch nào để xuất.');
  return downloadXlsx(`GiaoSuCuiBap/KHLCNT-${stamp()}.xlsx`,{
    sheetName:'Kế hoạch LCNT',
    columns:[
      {header:'Mã KHLCNT',key:'planNoStand',width:20},
      {header:'Tên kế hoạch',key:'name',width:46},
      {header:'Dự án',key:'projectName',width:40},
      {header:'Chủ đầu tư',key:'investorName',width:40},
      {header:'Mã CĐT',key:'investorCode',width:16},
      {header:'Địa điểm',key:'location',width:30},
      {header:'Loại kế hoạch',key:'planTypeLabel',width:18},
      {header:'Ngày phê duyệt',key:'decisionDate',width:16},
      {header:'Ngày đăng tải',key:'publicDate',width:16},
      {header:'Ghi chú',key:'note',width:22},
      {header:'Tên gói thầu',key:'packageName',width:50},
      {header:'Giá gói thầu',key:'packagePrice',type:'money',width:20},
      {header:'Tổng mức đầu tư',key:'investTotal',type:'money',width:20},
      {header:'Link e-GP',key:'detailUrl',type:'url',width:44}
    ],
    rows
  });
}
return {exportCsv,exportMobileReport,exportBackup,exportWinnersCsv,exportBidOpenCsv,exportProfileXlsx,exportInvestorXlsx,exportAreaXlsx,exportPlansCsv};
}
