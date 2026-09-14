import test from 'node:test';import assert from 'node:assert/strict';
import {buildBbmtQuery,bbmtDateRange,bbmtInDateRange,normalizeBbmtPackage,normalizeBidder,normalizeBidderTable,bbmtReadState} from '../lib/bbmt.js';
import {cacheOpening,restoreOpening,trimOpeningCache,BBMT_CACHE_TTL} from '../lib/bbmt-cache.js';
const raw={notifyNo:'IB2600000001',notifyVersion:'01',bidName:'Gói kiểm thử',bidPrice:3000000000,bidEstimatePrice:2800000000,bidOpenId:'opening-1',numBidderJoin:1};
const row={contractorCode:'vn0123456789',contractorName:'Nhà thầu kiểm thử',lotPrice:2600000000,discountPercent:5,lotFinalPrice:2470000000};
test('Opening search uses the official investField filter for the sector control',()=>{
  // Primary source: saved official index.html, convertFilterAdvanceSearch,
  // lines 4754–4759: advancedSearchPayload.investField -> fieldName: investField.
  const query=buildBbmtQuery({field:' XL ',keyword:'IB2600486024'});
  assert.deepEqual(query.filters.find(f=>f.fieldName==='investField'),{fieldName:'investField',searchType:'in',fieldValues:['XL']});
  assert.equal(query.filters.some(f=>f.fieldName==='bidField'),false);
  assert.equal(query.keyWord,'IB2600486024');assert.ok(query.matchFields.includes('notifyNo'));
  assert.equal(buildBbmtQuery({field:''}).filters.some(f=>f.fieldName==='investField'),false);
});
test('A recent actual opening is retained even when e-GP publication date is older',()=>{
  // Live e-GP listing IB2600486024: publication 26/8, actual opening 5/9.
  const previousNow=Date.now;
  try{
    Date.now=()=>Date.parse('2026-09-06T12:00:00+07:00');
    const range=bbmtDateRange({days:7});
    const liveDates={...raw,notifyNo:'IB2600486024',publicDateKqmt:'2026-08-26T14:26:04.597',bidRealityOpenDate:'2026-09-05T09:44:06'};
    assert.equal(bbmtInDateRange(normalizeBbmtPackage(liveDates),range),true);
    assert.equal(bbmtInDateRange(normalizeBbmtPackage({...liveDates,bidRealityOpenDate:'2026-08-26T09:00:00',publicDateKqmt:'2026-09-05T14:00:00'}),range),false);
    assert.equal(bbmtInDateRange(normalizeBbmtPackage({...liveDates,bidRealityOpenDate:null,bidOpenDate:'2026-09-05T09:00:00'}),range),true);
    assert.equal(bbmtInDateRange(normalizeBbmtPackage({...liveDates,bidRealityOpenDate:null,bidOpenDate:null}),range),false);
  }finally{Date.now=previousNow;}
});
test('Date selections never send an unverified publication-date range to the opening search',()=>{
  for(const scope of [{days:7},{fromDate:'2026-09-01',toDate:'2026-09-06'},{fromYear:2026,toYear:2026}]){
    const query=buildBbmtQuery({...scope,field:'XL'});
    assert.deepEqual(query.filters.filter(f=>f.fieldName==='publicDateKqmt'),[{fieldName:'publicDateKqmt',searchType:'not_null',fieldValues:['']}]);
    assert.equal(query.filters.some(f=>['publicDate','bidRealityOpenDate','bidOpenDate'].includes(f.fieldName)),false);
    assert.deepEqual(query.filters.find(f=>f.fieldName==='investField').fieldValues,['XL']);
  }
});
test('Exact notice codes put notifyNo first as proven by the fresh native e-GP controls',()=>{
  // test-results/4.3.3-live/live-query-controls.json: identical current filters
  // give 1 with native field order; bidName-first still gives 0 with all stages.
  for(const keyword of ['IB2600486024','ib2600486024',' IB2600486024 ','IB2600486024-00']){
    const query=buildBbmtQuery({keyword,field:'XL'});
    assert.deepEqual(query.matchFields,['notifyNo','bidName']);
    assert.equal(query.keyWord,keyword.trim());assert.equal(query.matchType,'all-0');
  }
  for(const keyword of ['Thi công đường giao thông','IB2600486024 cầu đường']){
    assert.deepEqual(buildBbmtQuery({keyword}).matchFields,['bidName','notifyNo']);
  }
  const investor=buildBbmtQuery({keyword:'IB2600486024',investor:'Phường 1 Bảo Lộc'});
  assert.equal(investor.keyWord,'Phường 1 Bảo Lộc');
  assert.deepEqual(investor.matchFields,['investorName','investorCode','procuringEntityName','procuringEntityCode']);
});
test('Approved estimate is the comparison basis; package fallback retains its correct label',()=>{const p=normalizeBbmtPackage(raw);assert.equal(p.priceBasis,2800000000);assert.equal(p.priceBasisSource,'bidEstimatePrice');assert.equal(normalizeBbmtPackage({...raw,bidEstimatePrice:null}).priceBasisLabel,'Giá gói thầu (e-GP)');});
test('Tender discount and saving against approved estimate are separate amounts',()=>{const b=normalizeBidder(row,2800000000);assert.equal(b.discountPercent,5);assert.equal(b.finalPrice,2470000000);assert.equal(b.vsPackageAmount,330000000);assert.equal(b.vsPackageRate,11.79);});
test('Derive final price if explicit percentage exists but final price is absent',()=>{const b=normalizeBidder({...row,lotFinalPrice:null,discountPercent:'5,5'},2800000000);assert.equal(b.finalPrice,2457000000);assert.equal(b.finalPriceDerived,true);});
test('Missing values are unknown; zero price is preserved; over-estimate is negative saving',()=>{assert.equal(normalizeBidder({...row,lotPrice:null,lotFinalPrice:null,discountPercent:null},0).vsPackageRate,null);assert.equal(normalizeBidder({...row,lotPrice:null,lotFinalPrice:null,discountPercent:null},0).discountPercent,null);assert.equal(normalizeBidder({...row,lotFinalPrice:0},2800000000).vsPackageRate,100);assert.equal(normalizeBidder({...row,lotFinalPrice:3000000000},2800000000).vsPackageAmount,-200000000);assert.equal(bbmtReadState({error:true}),'TIMEOUT');});
test('Equal prices tie and missing prices do not receive a rank',()=>{const b=normalizeBidderTable([row,{...row,contractorCode:'vn9876543210'},{contractorName:'Chưa công bố giá'}],2800000000);assert.deepEqual(b.map(x=>x.priceRank),[1,1,null]);});
test('Known bid price without final price or discount cannot imply zero discount',()=>{const b=normalizeBidder({...row,lotFinalPrice:null,discountPercent:null},2800000000);assert.equal(b.finalPrice,null);assert.equal(b.vsPackageRate,null);assert.equal(b.vsPackageAmount,null);});
test('Do not erase multiple lots or compare their prices with the whole package',()=>{const b=normalizeBidderTable([{...row,lotCode:'L1'},{...row,lotCode:'L2'}],2800000000);assert.equal(b.length,2);assert.equal(b[0].vsPackageRate,null);assert.equal(b[1].priceRank,null);});
test('Fresh cache restores the actual full table; not merely an already-seen marker',()=>{const p={...normalizeBbmtPackage(raw),bidders:[normalizeBidder(row,2800000000)],readState:'OK',scannedAt:new Date().toISOString()};const restored=restoreOpening(normalizeBbmtPackage(raw),cacheOpening(p));assert.deepEqual(restored.bidders,p.bidders);assert.equal(restored.fromCache,true);});
test('Version, opening ID, approved estimate, expected count and TTL invalidate cached tables',()=>{const p={...normalizeBbmtPackage(raw),bidders:[row],readState:'OK',scannedAt:new Date().toISOString()};const entry=cacheOpening(p);for(const change of [{notifyVersion:'02'},{bidOpenId:'opening-2'},{bidEstimatePrice:1},{numBidderJoin:2}])assert.equal(restoreOpening(normalizeBbmtPackage({...raw,...change}),entry).bidders,null);assert.equal(restoreOpening(normalizeBbmtPackage(raw),entry,Date.now()+BBMT_CACHE_TTL+100).bidders,null);assert.equal(cacheOpening({...p,readState:'TIMEOUT'}),null);assert.equal(cacheOpening({...p,readState:'PARTIAL'}),null);assert.equal(Object.keys(trimOpeningCache({old:{...entry,scannedAt:'2000-01-01'}})).length,0);});
