import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {normalizeBidder,normalizeBidderTable,openingFinancialPricePending,summarizeBidOpenings,formatOpeningMoney} from '../GiaoSuCuiBap/lib/bbmt.js';
import {observationsFromBidOpen,contractorProfile,discountProfile,winThreshold} from '../GiaoSuCuiBap/lib/analytics.js';
import {formatDiscount,priceFacts} from '../GiaoSuCuiBap/lib/kqlcnt.js';

const mst='0123456789';
const raw={contractorCode:'vn'+mst,contractorName:'Nhà thầu kiểm thử giá',lotPrice:0,lotFinalPrice:0,discountPercent:0};
const legacy={taxCode:mst,name:raw.contractorName,bidPrice:0,finalPrice:0,discountPercent:0,vsPackageRate:100,vsPackageAmount:1000000,priceRank:1};
const pkg=(bidders,notifyNo='IB2699999901')=>({key:notifyNo+'::00',notifyNo,bidName:'Kiểm thử BBMT',bidPrice:1000000,field:'XL',investorName:'Chủ đầu tư kiểm thử',bidders,detailUrl:'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?notifyNo='+notifyNo});
const valid={...legacy,bidPrice:1000000,finalPrice:900000,discountPercent:10,vsPackageRate:10,vsPackageAmount:100000,priceRank:1};
const oldObservation=(b,notifyNo)=>({source:'bbmt',notifyNo,taxCode:mst,contractorName:raw.contractorName,confidence:'exact',packageBasis:1000000,field:'XL',...b});

test('Both zero prices from a technical-stage public BBMT keep literal values without implying 100% saving',()=>{
  // IB2600443979's actual native response exposed this 0/0/0 financial pair.
  // Identity is synthetic; this reproduces its numeric shape, not a fresh network run.
  const b=normalizeBidder(raw,1000000);
  assert.equal(b.bidPrice,0);assert.equal(b.finalPrice,0);assert.equal(b.discountPercent,0);
  assert.equal(b.financialPricePending,true);assert.equal(b.vsPackageRate,null);assert.equal(b.vsPackageAmount,null);
  assert.equal(b.finalPriceDerived,false);
  const strings=normalizeBidder({...raw,lotPrice:'0',lotFinalPrice:'0',discountPercent:'0'},1000000);
  assert.equal(strings.financialPricePending,true);assert.equal(strings.bidPrice,0);assert.equal(strings.finalPrice,0);
});

test('Pending predicate guards old numeric cache pairs without interpreting missing or blank prices as zero',()=>{
  assert.equal(openingFinancialPricePending(legacy),true);
  assert.equal(openingFinancialPricePending({...legacy,financialPricePending:false}),true);
  assert.equal(openingFinancialPricePending({financialPricePending:true}),true);
  for(const row of [null,{}, {bidPrice:null,finalPrice:null}, {bidPrice:'',finalPrice:''}, {bidPrice:0,finalPrice:null}, {bidPrice:null,finalPrice:0}, {bidPrice:1,finalPrice:0}, {bidPrice:0,finalPrice:1}, {bidPrice:NaN,finalPrice:NaN}])assert.equal(openingFinancialPricePending(row),false);
});

test('Known financial quotes sort and tie normally while both-zero and missing pairs never receive price ranks',()=>{
  const row=(code,bid,final)=>({...raw,contractorCode:code,lotPrice:bid,lotFinalPrice:final,discountPercent:null});
  const table=normalizeBidderTable([raw,row('vn0222222222',100,90),row('vn0333333333',200,90),row('vn0444444444',200,180),row('vn0555555555',null,null)],1000);
  assert.deepEqual(table.map(b=>b.priceRank),[1,1,3,null,null]);
  const pending=table.find(b=>b.taxCode===mst);
  assert.equal(pending.finalPrice,0);assert.equal(pending.vsPackageRate,null);assert.equal(pending.vsPackageAmount,null);
});

test('A positive bid followed by an explicit zero final price retains the existing 100% comparison',()=>{
  const table=normalizeBidderTable([{...raw,lotPrice:1000000,lotFinalPrice:0,discountPercent:100}],1000000);
  const b=table[0];assert.equal(b.financialPricePending,false);assert.equal(b.finalPrice,0);
  assert.equal(b.priceRank,1);assert.equal(b.vsPackageRate,100);assert.equal(b.vsPackageAmount,1000000);
});

test('Summary keeps old-cache participation while excluding ambiguous zero pairs from discount and cheapest figures',()=>{
  const s=summarizeBidOpenings([pkg([legacy])],mst);
  assert.equal(s.joinedCount,1);assert.equal(s.scanned,1);assert.equal(s.joined[0].me.finalPrice,0);
  assert.equal(s.financialPendingCount,1);assert.equal(s.cheapestCount,0);
  assert.equal(s.avgDiscount,null);assert.equal(s.bestDiscount,null);assert.equal(s.totalBidValue,null);
});

test('Mixed summaries compute mean and total using actual financial quotes without reducing participation count',()=>{
  const s=summarizeBidOpenings([pkg([legacy]),pkg([valid],'IB2699999902')],mst);
  assert.equal(s.joinedCount,2);assert.equal(s.financialPendingCount,1);
  assert.equal(s.cheapestCount,1);assert.equal(s.avgDiscount,10);assert.equal(s.bestDiscount,10);assert.equal(s.totalBidValue,900000);
});

test('New analytics observations preserve prices and declared zero but clear comparative fields from an old cached row',()=>{
  const o=observationsFromBidOpen(pkg([legacy]))[0];
  assert.equal(o.bidPrice,0);assert.equal(o.finalPrice,0);assert.equal(o.discountPercent,0);
  assert.equal(o.financialPricePending,true);assert.equal(o.vsPackageRate,null);assert.equal(o.priceRank,null);
  assert.equal(o.bidderCount,1);assert.equal(o.taxCode,mst);
});

test('Legacy analytics rows cannot skew financial averages, rank averages or cheapest-rate denominator',()=>{
  const rows=[oldObservation(legacy,'IB2699999901'),oldObservation(valid,'IB2699999902')];
  const p=contractorProfile(rows,mst);assert.equal(p.joinedCount,2);assert.equal(p.financialPendingCount,1);
  assert.equal(p.discount.n,1);assert.equal(p.discount.mean,10);assert.equal(p.avgRank,1);assert.equal(p.cheapestCount,1);
  assert.equal(p.cheapestRate.n,1);assert.equal(p.cheapestRate.value,100);
  const only=contractorProfile(rows.slice(0,1),mst);assert.equal(only.discount.n,0);assert.equal(only.avgRank,null);assert.equal(only.cheapestCount,0);assert.equal(only.cheapestRate.value,null);assert.equal(only.cheapestRate.n,0);
});

test('Discount profiles and winning thresholds reject ambiguous cached zero pairs but retain explicit positive-to-zero quotes',()=>{
  const ambiguous=oldObservation({...legacy,won:true},'IB2699999901');
  const fullDiscount=oldObservation({...valid,finalPrice:0,discountPercent:100,won:true},'IB2699999902');
  const profile=discountProfile([ambiguous,fullDiscount]);assert.equal(profile.total,1);assert.equal(profile.overall.mean,100);
  const threshold=winThreshold([ambiguous,fullDiscount]);assert.equal(threshold.total,1);
});

const ui=fs.readFileSync(new URL('../GiaoSuCuiBap/bidopen.js',import.meta.url),'utf8');
const start=ui.indexOf('function bidderRow('),end=ui.indexOf('function packageCard(',start);
assert.ok(start>=0&&end>start);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const renderRow=vm.runInNewContext(ui.slice(start,end)+'\nbidderRow;',{openingFinancialPricePending,priceFacts,formatMoney:formatOpeningMoney,formatDiscount,esc});

test('Actual UI renderer masks stale cached rank/saving, preserves both displayed zero prices and explains financial uncertainty',()=>{
  const html=renderRow(legacy,false,1000000);
  assert.match(html,/<td class="num">—<\/td>/);assert.match(html,/e-GP có giá 0; chưa đối chiếu tài chính\./);
  assert.match(html,/<td class="num">0 đ<\/td>/);assert.match(html,/<td class="num final-price">0 đ/);
  assert.match(html,/Chưa đủ dữ liệu/);assert.doesNotMatch(html,/100(?:,00)?%|Giảm 1\.000\.000/);
  const genuine=renderRow({...valid,finalPrice:0,discountPercent:100},false,1000000);
  assert.match(genuine,/<td class="num">1<\/td>/);assert.match(genuine,/100,00%/);assert.doesNotMatch(genuine,/chưa đối chiếu tài chính/);
});
