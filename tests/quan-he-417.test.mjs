/* ============================================================================
 *  SOI QUAN HỆ CHỦ ĐẦU TƯ – NHÀ THẦU  (lib/relations.js)
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pairStats, venturePartners, RELATION_NOTE} from '../GiaoSuCuiBap/lib/relations.js';
import {normalizeKqlcntRecord} from '../GiaoSuCuiBap/lib/kqlcnt.js';

let n=0;
const goi=(o={})=>normalizeKqlcntRecord({notifyNo:`IB26000${String(++n).padStart(5,'0')}`,notifyVersion:'00',bidName:'Gói',
  investorName:'Ban QLDA huyện A',investorCode:'QLDA-A',bidForm:'DTRR',isInternet:1,numBidderJoin:3,
  bidPrice:[1e9],bidWinningPrice:[9e8],winningCode:'0101111111',contractorName:'Cty Một',decisionDate:'2025-05-01T00:00:00',...o});

test('hồ sơ chủ đầu tư: tỉ trọng là % số gói CỦA CHỦ ĐẦU TƯ; ít cạnh tranh và 1 nhà thầu đếm đúng mẫu số đã biết', ()=>{
  const list=[
    goi({bidForm:'CDT',numBidderJoin:1}),goi({bidForm:'CDTRG',numBidderJoin:0}),goi({bidForm:'CDT',numBidderJoin:1}),goi({bidForm:'',numBidderJoin:1}),
    goi({winningCode:'0102222222',contractorName:'Cty Hai'}),goi({winningCode:'0102222222',contractorName:'Cty Hai'})
  ];
  const rows=pairStats(list,{scope:'investor'});
  const mot=rows.find(r=>r.taxCode==='0101111111');
  assert.equal(mot.packages,4);
  assert.equal(mot.share.value,66.67,'4/6 gói của chủ đầu tư');
  assert.deepEqual([mot.lessCompetitive.count,mot.lessCompetitive.known],[3,3],'gói không ghi hình thức bị loại khỏi mẫu số');
  assert.deepEqual([mot.singleBidder.count,mot.singleBidder.known],[3,3],'gói ghi 0 nhà thầu = không có số liệu');
  assert.equal(mot.review,true);
  assert.ok(mot.flags.some(f=>/chỉ định thầu/.test(f)));
  assert.equal(rows[0].taxCode,'0101111111','cặp "cần xem" lên đầu');
  const hai=rows.find(r=>r.taxCode==='0102222222');
  assert.equal(hai.review,false);
  assert.equal(hai.contractorName,'Cty Hai');
});

test('ít gói (<3) thì không gắn "Cần xem" dù tỉ lệ cao', ()=>{
  const rows=pairStats([goi({bidForm:'CDT',numBidderJoin:1}),goi({bidForm:'CDT',numBidderJoin:1})]);
  assert.equal(rows[0].review,false);
});

test('tra theo nhà thầu: tỉ trọng là % số gói trúng CỦA NHÀ THẦU, không suy ra phía chủ đầu tư', ()=>{
  const list=[goi(),goi(),goi(),goi({investorName:'UBND xã B',investorCode:'XA-B'})];
  const rows=pairStats(list,{scope:'contractor'});
  const a=rows.find(r=>r.investorKey==='QLDA-A');
  assert.equal(a.shareScope,'contractor');
  assert.equal(a.share.value,75);
  assert.equal(rows.find(r=>r.investorKey==='XA-B').share.value,25);
});

test('cỡ mẫu nhỏ được đánh dấu chưa đủ tin', ()=>{
  const r=pairStats([goi(),goi()])[0];
  assert.equal(r.share.reliable,false);
  assert.equal(r.lessCompetitive.share.reliable,false);
});

test('đối tác liên danh thường xuyên: đếm theo MST, giữ giá trị cả gói (không chia phần góp)', ()=>{
  const lien=(codes,o={})=>goi({winningCode:codes,ventureName:'Liên danh X',...o});
  const list=[lien(['0101111111','0103333333']),lien(['0101111111','0103333333'],{investorName:'UBND xã B',investorCode:'XA-B'}),
    lien(['0101111111','0104444444']),lien(['0105555555','0103333333']),goi()];
  const p=venturePartners(list,'0101111111');
  assert.deepEqual(p.map(x=>[x.taxCode,x.packages]),[['0103333333',2],['0104444444',1]]);
  assert.equal(p[0].ventureValue,18e8);
  assert.deepEqual(p[0].investors.sort(),['Ban QLDA huyện A','UBND xã B']);
  assert.deepEqual(venturePartners(list,''),[]);
});

test('dữ liệu bẩn không làm hỏng; lời nhắc không phải bằng chứng vi phạm có mặt trên cả hai màn hình', ()=>{
  assert.deepEqual(pairStats([null,1,{},{investorName:'X'}]),[]);
  assert.match(RELATION_NOTE,/KHÔNG phải bằng chứng vi phạm/);
  for(const f of ['lib/relations-view.js','investor.js'])assert.match(fs.readFileSync(new URL(`../GiaoSuCuiBap/${f}`,import.meta.url),'utf8'),/RELATION_NOTE/);
});

test('bảng quan hệ trên màn hình Nhà thầu trúng thầu: đúng số liệu, chống chèn mã HTML', async()=>{
  const {contractorRelationsHtml}=await import('../GiaoSuCuiBap/lib/relations-view.js');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const list=[goi({bidForm:'CDT',numBidderJoin:1,investorName:'<img src=x onerror=alert(1)>',investorCode:'XSS'}),
    goi({bidForm:'CDT',numBidderJoin:1,investorName:'<img src=x onerror=alert(1)>',investorCode:'XSS'}),
    goi({bidForm:'CDT',numBidderJoin:1,investorName:'<img src=x onerror=alert(1)>',investorCode:'XSS'}),
    goi({winningCode:['0101111111','0103333333'],ventureName:'LD'})];
  const html=contractorRelationsHtml(list,'0101111111',{esc,formatMoney:v=>String(v)});
  assert.doesNotMatch(html,/<img/);
  assert.match(html,/&lt;img src=x/);
  assert.match(html,/Cần xem/);
  assert.match(html,/% gói trúng của NT/);
  assert.match(html,/0103333333/);
  assert.match(html,/KHÔNG phải bằng chứng vi phạm/);
  assert.equal(contractorRelationsHtml(list,'',{esc,formatMoney:String}),'','tra theo chủ đầu tư (không có MST) thì không vẽ bảng phía nhà thầu');
});
