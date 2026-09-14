import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../content.js',import.meta.url),'utf8');
const begin=source.indexOf('  function bbmtAdaptDomSnapshot('),end=source.indexOf('  /* BBMT_DOM_ADAPTER_END */',begin);
assert.ok(begin>0&&end>begin,'Content-script adapter must remain directly testable');
const adapt=vm.runInNewContext(source.slice(begin,end)+'\nbbmtAdaptDomSnapshot;',{URL});
const errorBegin=source.indexOf('  function bbmtPageError('),errorEnd=source.indexOf('  /* BBMT_PAGE_ERROR_END */',errorBegin);
assert.ok(errorBegin>0&&errorEnd>errorBegin);
const pageError=vm.runInNewContext(source.slice(errorBegin,errorEnd)+'\nbbmtPageError;');
const url='https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?notifyNo=IB2699990001&notifyId=fixture-1&step=bbmt';
const headers=['Mã định danh','Tên nhà thầu','Giá dự thầu (VND)','Tỷ lệ giảm giá (%)','Giá dự thầu sau giảm giá (nếu có) (VND)'];
const row=(values)=>({cells:values.map(text=>({text,colSpan:1,rowSpan:1}))});
function snapshot(){return {url,cardId:'ttnt-card-bbmt-ldt',
  fields:{'Mã TBMT':'IB2699990001','Giá gói thầu':'2.646.341.557 VND','Dự toán gói thầu':'2.700.000.000 VND'},
  headers:[...headers],groups:[[row(['vn0123456789','CÔNG TY KIỂM THỬ','2.609.041.591,923','0','2.609.041.591,923'])]],hasLotViewSelector:false};}
const plain=value=>JSON.parse(JSON.stringify(value));

test('DOM adapter uses the exact official single-package labels and preserves fractional VND',()=>{
  const result=adapt(snapshot());
  assert.equal(result.kind,'package');assert.equal(result.source,'visible-dom');
  assert.equal(result.bidEstimatePrice,2700000000);assert.equal(result.bidPrice,2646341557);
  assert.equal(result.rows[0].lotPrice,2609041591.923);assert.equal(result.rows[0].lotFinalPrice,2609041591.923);
  assert.equal(result.rows[0].discountPercent,0);assert.equal(result.isMultiLot,false);
});
test('KHAC and ADB/WB share visible columns but ADB/WB does not certify a package-versus-lot comparison',()=>{
  for(const cardId of ['ttnt-card-bbmt-khac','ttnt-card-bbmt-adbwb']){
    const input=snapshot();input.cardId=cardId;
    input.headers[4]='Giá dự thầu sau giảm giá (VND)';
    const result=adapt(input);
    assert.equal(result.rows[0].contractorName,'CÔNG TY KIỂM THỬ');
    assert.equal(result.isMultiLot,cardId==='ttnt-card-bbmt-adbwb'?null:false);
    assert.equal(result.classificationKnown,cardId!=='ttnt-card-bbmt-adbwb');
  }
});
test('Single-package quote without discount columns retains unknown final price',()=>{
  const input=snapshot();input.headers=input.headers.slice(0,3);input.groups[0][0].cells=input.groups[0][0].cells.slice(0,3);
  const result=adapt(input);assert.equal(result.rows[0].lotFinalPrice,null);assert.equal(result.rows[0].discountPercent,null);
});
test('Undisclosed amount and attachment-only discount never become zero',()=>{
  const input=snapshot();input.groups[0][0]=row(['vn0123456789','CÔNG TY KIỂM THỬ','2.600.000.000','Chi tiết tệp đính kèm e-HSDT','-']);
  const result=adapt(input);assert.equal(result.rows[0].lotFinalPrice,null);assert.equal(result.rows[0].discountPercent,null);
});
test('Vietnamese decimal percent is read without integer rounding',()=>{
  const input=snapshot();input.groups[0][0].cells[3].text='1,25';assert.equal(adapt(input).rows[0].discountPercent,1.25);
});
test('Lot group headings carry lot identity to every bidder without whole-package semantics',()=>{
  const input=snapshot();input.headers=['Mã phần/lô','Tên phần/lô',...headers];input.hasLotViewSelector=true;
  input.groups=['LOT-1','LOT-2'].map((lot,i)=>[
    {cells:[{text:lot,colSpan:1,rowSpan:1},{text:'Phần '+(i+1),colSpan:5,rowSpan:1}]},
    row(['','','vn0123456789','CÔNG TY KIỂM THỬ','1.000.000','-','990.000'])
  ]);
  const result=adapt(input);assert.equal(result.kind,'lot');assert.equal(result.isMultiLot,true);
  assert.deepEqual(plain(result.rows.map(r=>r.lotNo)),['LOT-1','LOT-2']);
  assert.equal(result.rows[1].lotName,'Phần 2');assert.equal(result.rows[0].discountPercent,null);
});
test('Per-contractor lot aggregate cannot be mistaken for a whole package',()=>{
  const input=snapshot();input.headers.splice(2,0,'Số phần của gói thầu đã tham dự');
  input.groups[0][0].cells.splice(2,0,{text:'2',colSpan:1,rowSpan:1});
  assert.equal(adapt(input),null);
  const hiddenLotHeaders=snapshot();hiddenLotHeaders.hasLotViewSelector=true;assert.equal(adapt(hiddenLotHeaders),null);
});
test('Lot bidders without a visible lot identity are not accepted',()=>{
  const input=snapshot();input.headers=['Mã phần/lô','Tên phần/lô',...headers];
  input.groups=[[row(['','','vn0123456789','CÔNG TY KIỂM THỬ','1.000.000','0','1.000.000'])]];
  assert.equal(adapt(input),null);
});
test('Displayed notice and expected URL must agree; only optional two-digit version is accepted',()=>{
  const input=snapshot();input.fields['Mã TBMT']='IB2699990002';assert.equal(adapt(input),null);
  input.fields['Mã TBMT']='IB2699990001-00';assert.ok(adapt(input));
  input.fields['Mã TBMT']='IB2699990001 + IB2699990002';assert.equal(adapt(input),null);
});
test('Untrusted or missing notice URL identity is rejected',()=>{
  for(const replacement of [url.replace('muasamcong.mpi.gov.vn','example.com'),url.replace('contractor-selection','other'),url.replace('notifyId=fixture-1','notifyId=undefined')]){
    const input=snapshot();input.url=replacement;assert.equal(adapt(input),null);
  }
});
test('Unhydrated Vue text, unknown cards and skeleton tables are rejected',()=>{
  const input=snapshot();input.groups[0][0].cells[1].text='{{bidder.contractorName}}';assert.equal(adapt(input),null);
  input.groups=[];assert.equal(adapt(input),null);
  const wrongCard=snapshot();wrongCard.cardId='winning-contractor-table';assert.equal(adapt(wrongCard),null);
  const skeleton=snapshot();skeleton.groups[0][0]=row(['vn0123456789','CÔNG TY KIỂM THỬ','','','']);assert.equal(adapt(skeleton),null);
});
test('Missing price basis waits for metadata instead of comparing to an invented basis',()=>{
  const input=snapshot();input.fields['Giá gói thầu']='';input.fields['Dự toán gói thầu']='';assert.equal(adapt(input),null);
  input.fields['Dự toán gói thầu']='2.700.000.000 VND';assert.equal(adapt(input).bidPrice,null);
});
test('Foreign-currency price headers cannot enter VND comparison',()=>{
  const input=snapshot();input.headers[2]='Giá dự thầu (USD)';assert.equal(adapt(input),null);
  const unit=snapshot();unit.fields['Giá gói thầu']='2.646.341.557 USD';unit.fields['Dự toán gói thầu']='';assert.equal(adapt(unit),null);
});
test('Unexpected merged cells and incomplete bidder rows are rejected without shifting columns',()=>{
  const merged=snapshot();merged.groups[0][0].cells[1].rowSpan=2;assert.equal(adapt(merged),null);
  const missing=snapshot();missing.groups[0][0].cells.pop();assert.equal(adapt(missing),null);
});
test('Observed WAF Error page reports only ACCESS_DENIED, never support incident details',()=>{
  const observed="This page can't be displayed. Contact support for additional information. The incident ID is: N/A.";
  assert.equal(pageError('Error',observed),'ACCESS_DENIED');
  assert.equal(pageError(' Error ','This page can’t be displayed.\nContact support. Incident ID 123456'),'ACCESS_DENIED');
  assert.equal(pageError('Error','This page cannot be displayed. Contact support.'),'ACCESS_DENIED');
});
test('Error recognition preserves known native errors and does not flag normal tender text',()=>{
  assert.equal(pageError('Lựa chọn nhà thầu','egp-portal-contractor-selection-v2 tạm thời không có.'),'PORTLET_UNAVAILABLE');
  assert.equal(pageError('403 Forbidden',''),'ACCESS_DENIED');
  assert.equal(pageError('Error','A different application error.'),null);
  assert.equal(pageError('Lựa chọn nhà thầu',"Bid description: This page can't be displayed. Contact support."),null);
  assert.equal(pageError('Error',"This page can't be displayed."),null);
});
