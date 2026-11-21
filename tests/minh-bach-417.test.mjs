/* ============================================================================
 *  CHỈ SỐ MINH BẠCH THAM KHẢO  (lib/transparency.js)
 *  Trọng tâm: thiếu dữ liệu KHÔNG bị coi là xấu; không bao giờ nói "vi phạm".
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transparencyIndex, transparencyFacts, TRANSPARENCY_REFS} from '../GiaoSuCuiBap/lib/transparency.js';
import {normalizeKqlcntRecord as normalizeKqlcnt} from '../GiaoSuCuiBap/lib/kqlcnt.js';
import {normalizeCandidate} from '../GiaoSuCuiBap/lib/core.js';

const D=864e5,T0=Date.parse('2026-09-01T02:00:00Z');
const tbmt=(o={})=>({bidForm:'DTRR',isInternet:true,publicDate:new Date(T0).toISOString(),closeDate:new Date(T0+20*D).toISOString(),price:50e9,field:'XL',...o});

test('gói đấu thầu rộng rãi, qua mạng, đủ ngày → ít tín hiệu, điểm 100', ()=>{
  const r=transparencyIndex(tbmt());
  assert.equal(r.score,100);assert.equal(r.level,'low');assert.equal(r.warnings,0);
});

test('chỉ định thầu + không qua mạng → nhiều tín hiệu; lời lẽ không kết luận vi phạm', ()=>{
  const r=transparencyIndex(tbmt({bidForm:'CDT',isInternet:false}));
  assert.equal(r.score,60);assert.equal(r.level,'medium');
  assert.match(r.note,/không phải kết luận vi phạm/);
  assert.doesNotMatch(r.signals.map(s=>s.detail).join(' '),/vi phạm|gian lận|thông thầu/i);
});

test('thời gian mời thầu: dưới mốc tham chiếu → tín hiệu; gói quy mô nhỏ dùng mốc nhỏ; chỉ áp cho rộng rãi/hạn chế', ()=>{
  assert.equal(transparencyIndex(tbmt({closeDate:new Date(T0+12*D).toISOString()})).signals.find(s=>s.id==='days').state,'warn');
  const nho=transparencyIndex(tbmt({price:15e9,closeDate:new Date(T0+12*D).toISOString()})).signals.find(s=>s.id==='days');
  assert.equal(nho.state,'ok');assert.match(nho.detail,/mốc tham chiếu 9 ngày \(gói quy mô nhỏ\)/);
  assert.equal(transparencyIndex(tbmt({field:'HH',price:12e9,closeDate:new Date(T0+12*D).toISOString()})).signals.find(s=>s.id==='days').state,'warn','hàng hoá >10 tỷ không phải quy mô nhỏ');
  assert.equal(transparencyIndex(tbmt({bidForm:'CHCT',closeDate:new Date(T0+4*D).toISOString()})).signals.find(s=>s.id==='days').state,'unknown');
  assert.match(transparencyIndex(tbmt()).signals.find(s=>s.id==='days').detail,/cần đối chiếu văn bản hiện hành/);
  assert.equal(transparencyIndex(tbmt({closeDate:new Date(T0+17.6*D).toISOString()})).signals.find(s=>s.id==='days').state,'ok','sát mốc (lệch < nửa ngày) không bị gắn cờ');
});

test('mốc tham chiếu chỉnh được', ()=>{
  const r=transparencyIndex(tbmt({closeDate:new Date(T0+12*D).toISOString()}),{openDays:10});
  assert.equal(r.signals.find(s=>s.id==='days').state,'ok');
  assert.equal(TRANSPARENCY_REFS.openDays,18);
});

test('kết quả: 1 nhà thầu + giảm giá rất thấp → nhiều tín hiệu cần xem kỹ', ()=>{
  const r=transparencyIndex({bidForm:'DTRR',isInternet:true,numBidderJoin:1,discountRate:0.2});
  assert.equal(r.score,55);assert.equal(r.warnings,2);
  const r2=transparencyIndex({bidForm:'CDT',isInternet:false,numBidderJoin:1,discountRate:0.1});
  assert.equal(r2.level,'high');
  const nhieu=transparencyIndex({bidForm:'DTRR',isInternet:true,numBidderJoin:6,discountRate:0.2});
  assert.equal(nhieu.signals.find(s=>s.id==='discount').state,'ok','giảm ít nhưng nhiều nhà thầu thì không phải tín hiệu');
});

test('THIẾU dữ liệu không bị trừ điểm; dưới 2 tín hiệu đọc được thì không chấm', ()=>{
  const r=transparencyIndex({});
  assert.equal(r.score,null);assert.equal(r.label,'Chưa đủ dữ liệu');
  assert.ok(r.signals.every(s=>s.state==='unknown'&&s.weight===0));
  assert.equal(transparencyIndex({bidForm:'DTRR'}).score,null);
  assert.equal(transparencyFacts({numBidderJoin:0}).bidders,null,'0 nhà thầu = không có số liệu (bộ chuẩn hoá ghi 0 khi thiếu)');
  assert.equal(transparencyFacts({isInternet:undefined}).online,null);
});

test('chạy được trên dữ liệu THẬT đã chuẩn hoá: KQLCNT và TBMT trong kho', ()=>{
  const k=normalizeKqlcnt({notifyNo:'IB2600000001',notifyVersion:'00',bidName:'Gói',bidForm:'CHCT',isInternet:1,numBidderJoin:2,
    bidPrice:[1e9],bidWinningPrice:[995e6],winningCode:'0101234567',bidWinnerName:'Cty A'});
  const r=transparencyIndex(k);
  assert.equal(r.signals.find(s=>s.id==='form').state,'warn');
  assert.equal(r.signals.find(s=>s.id==='bidders').state,'warn');
  assert.equal(r.signals.find(s=>s.id==='discount').state,'warn');
  const t=normalizeCandidate({notifyNo:'IB2600000002',notifyVersion:'00',bidName:'Kênh',bidForm:'DTRR',isInternet:1,
    publicDate:'2026-09-01T09:00:00',bidCloseDate:'2026-09-21T09:00:00',bidPrice:3e9,investField:'XL'});
  assert.equal(t.bidForm,'DTRR');assert.equal(t.isInternet,true);
  assert.equal(transparencyIndex(t).score,100);
});

test('file Excel xuất thật có cột chỉ số minh bạch, kèm lời nhắc không phải kết luận vi phạm', async()=>{
  const {createExportRuntime}=await import('../GiaoSuCuiBap/lib/runtime-export.js');
  const {buildXlsx}=await import('../GiaoSuCuiBap/lib/xlsx.js');
  const t=(key,more)=>({key,notifyNo:key,bidName:'Kênh mương',price:50e9,score:80,closeDate:'2099-01-01T00:00:00Z',filterState:'MATCH',
    publicDate:'2026-09-01T02:00:00Z',bidForm:'DTRR',isInternet:true,fieldCode:'XL',...more});
  const tenders=[t('IB1',{closeDate:'2026-09-21T02:00:00Z'}),t('IB2',{bidForm:'CDT',isInternet:false}),t('IB3',{bidForm:'',isInternet:null,publicDate:''})];
  const run={id:'r',foundKeys:tenders.map(x=>x.key),resultStates:Object.fromEntries(tenders.map(x=>[x.key,{filterState:'MATCH'}]))};
  const out=[];
  const rt=createExportRuntime({getState:async()=>structuredClone({tenders,runs:[run]}),readSearchState:async()=>({revision:'same'}),stamp:()=>'2026-10-08',
    numOrNull:v=>v==null||v===''?null:Number(v),downloadXlsx:async(name,spec)=>{out.push({spec,bytes:buildXlsx(spec)});return 1;}});
  await rt.exportCsv(false,tenders.map(x=>x.key),'r',{criteriaState:''});
  const sheet=out[0].spec.sheets.find(s=>s.sheetName==='Gói thầu');
  assert.ok(sheet.columns.some(c=>c.header==='Chỉ số minh bạch (tham khảo)'));
  assert.ok(sheet.columns.some(c=>/không phải kết luận vi phạm/.test(c.header)));
  const row=k=>sheet.rows.find(r=>r.notifyNo===k);
  assert.equal(row('IB1').transparencyScore,100);
  assert.equal(row('IB2').transparencyScore,60);
  assert.match(row('IB2').transparencySignals,/Chỉ định thầu.*KHÔNG qua mạng/);
  assert.equal(row('IB3').transparencyScore,null);
  assert.equal(row('IB3').transparencySignals,'Chưa đủ dữ liệu');
  assert.ok(out[0].bytes.length>1000,'tạo được tệp .xlsx');
});
