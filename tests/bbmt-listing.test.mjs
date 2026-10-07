import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {normalizeBbmtPackage,bbmtDateRange,bbmtInDateRange,bbmtReadStateOf,bbmtStamp} from '../GiaoSuCuiBap/lib/bbmt.js';
import {passesHardFilter} from '../GiaoSuCuiBap/lib/hard-filter.js';
import {dateGate,coverageOf} from '../GiaoSuCuiBap/lib/match-gate.js';
import {matchesAdditionalKeyword} from '../GiaoSuCuiBap/lib/workspace.js';

const background=fs.readFileSync(new URL('../GiaoSuCuiBap/background.js',import.meta.url),'utf8');
function sourceFunction(name){
  const start=background.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start>=0,name);
  const tail=background.slice(start),end=tail.search(/\r?\n}\r?\n/);
  assert.ok(end>0,name);return tail.slice(0,end)+'\n}';
}
function listingHarness(){
  let state={bidOpenScan:{id:'listing-1',status:'LISTING',scope:{fromDate:'2026-09-01',toDate:'2026-09-06'},maxPackages:50,packages:[],totalCandidates:0}};
  const phaseSnapshots=[];
  const context=vm.createContext({Date,Map,Number,Boolean,
    normalizeBbmtPackage,bbmtDateRange,bbmtInDateRange,bbmtReadStateOf,bbmtStamp,matchesAdditionalKeyword,passesHardFilter,dateGate,coverageOf,
    restoreOpening:p=>p,KEYS:{bidOpenScan:'bidOpenScan'},TIMEOUT_PREFIX:'fixture-',
    getState:async()=>structuredClone(state),getBidScan:async()=>structuredClone(state.bidOpenScan),withLock:async f=>f(),
    appStorage:{get:async defaults=>structuredClone(Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,Object.hasOwn(state,key)?state[key]:value])))},
    save:async patch=>{state={...state,...structuredClone(patch)};},
    chrome:{storage:{local:{get:async()=>({bidOpenCache:{}})}},alarms:{clear:async()=>true}},
    startBidOpenDetailPhase:async()=>{phaseSnapshots.push(structuredClone(state.bidOpenScan));},
    failLookupJob:async()=>{throw Error('unexpected listing failure');},
    flushObservations:async()=>{},summarizeBidOpenings:()=>({}),lookupKind:()=>({}),
    isLookupActive:(_,scan)=>['LISTING','SCANNING'].includes(scan.status)
  });
  vm.runInContext(sourceFunction('readJobState')+'\n'+sourceFunction('extendSourceKeys')+'\n'+sourceFunction('receivedPageIndexes')+'\n'+sourceFunction('pageCoverage')+'\n'+sourceFunction('ingestBidOpenList')+'\n'+sourceFunction('finalizeBidOpenScan'),context);
  return {
    get scan(){return structuredClone(state.bidOpenScan);},phaseSnapshots,
    async page(payload){
      const result=await context.ingestBidOpenList({planId:'listing-1',...payload});
      // Match the production router's acknowledgement after a successfully ingested page.
      if(!payload.done)state.bidOpenScan.receivedPages=[...new Set([...(state.bidOpenScan.receivedPages||[]),payload.pageIndex])];
      return result;
    },
    async finish(){state.bidOpenScan.status='SCANNING';await context.finalizeBidOpenScan('listing-1');},
    completeRows(){state.bidOpenScan.packages=state.bidOpenScan.packages.map(p=>({...p,bidders:[{name:'Fixture bidder'}],readState:'OK',scannedAt:new Date().toISOString()}));}
  };
}
const row=(id,opening='2026-08-26T09:00:00')=>({notifyNo:'IB269999000'+id,notifyVersion:'00',bidName:'Fixture package '+id,numBidderJoin:1,bidPrice:1000000000,publicDateKqmt:'2026-08-20T14:00:00',bidRealityOpenDate:opening});

test('Capped listing remains PARTIAL when every collected record falls outside the actual opening range',async()=>{
  const h=listingHarness();
  await h.page({records:[row(1),row(2)],pageIndex:0,totalPages:3,totalElements:150});
  assert.equal(h.scan.packages.length,0);assert.equal(h.scan.outOfRangeCount,2);
  assert.equal(h.phaseSnapshots.length,0);
  await h.page({records:[],pageIndex:1,totalPages:3,totalElements:150,done:true,capped:true});
  assert.equal(h.phaseSnapshots.length,1);
  assert.equal(h.phaseSnapshots[0].partial,true);assert.equal(h.phaseSnapshots[0].listingCapped,true);
  await h.finish();
  assert.equal(h.scan.status,'PARTIAL');assert.equal(h.scan.pagesRead,1);assert.equal(h.scan.totalPages,3);
  assert.equal(h.scan.listedRows,2);assert.equal(h.scan.totalCandidates,150);
  assert.match(h.scan.message,/chưa thấy gói phù hợp trong danh sách đã thu thập/);
  assert.match(h.scan.message,/1\/3 trang \(2\/150 bản ghi\)/);
  assert.doesNotMatch(h.scan.message,/đọc đủ.*0\/0|không trả gói nào/i);
});
test('Reading every collected package cannot turn a capped search into a complete search',async()=>{
  const h=listingHarness();
  await h.page({records:[row(1,'2026-09-05T09:44:06')],pageIndex:0,totalPages:2,totalElements:51});
  await h.page({records:[],pageIndex:1,totalPages:2,totalElements:51,done:true,capped:true});
  h.completeRows();await h.finish();
  assert.equal(h.scan.status,'PARTIAL');assert.equal(h.scan.scannedCount,1);
  assert.match(h.scan.message,/1\/1 gói trong danh sách đã thu thập/);
  assert.match(h.scan.message,/Danh sách chưa đầy đủ/);
});
test('An uncapped native empty response is distinguishable from local filtering and a capped search',async()=>{
  const h=listingHarness();
  await h.page({records:[],pageIndex:0,totalPages:0,totalElements:0});
  await h.page({records:[],pageIndex:1,totalPages:0,totalElements:0,done:true,capped:false});
  await h.finish();
  assert.equal(h.scan.status,'SUCCESS');assert.equal(h.scan.listingCapped,false);assert.equal(h.scan.listedRows,0);
  assert.match(h.scan.message,/e-GP không trả gói nào/);assert.doesNotMatch(h.scan.message,/0\/0|chưa đầy đủ/);
});
test('Uncapped pages accumulate raw row counts separately from packages retained by date filtering',async()=>{
  const h=listingHarness();
  await h.page({records:[row(1)],pageIndex:0,totalPages:2,totalElements:2});
  await h.page({records:[row(2)],pageIndex:1,totalPages:2,totalElements:2});
  await h.page({records:[],pageIndex:2,totalPages:2,totalElements:2,done:true,capped:false});
  await h.finish();
  assert.equal(h.scan.status,'SUCCESS');assert.equal(h.scan.pagesRead,2);assert.equal(h.scan.listedRows,2);
  assert.equal(h.scan.packages.length,0);assert.match(h.scan.message,/Đã đối chiếu 2 bản ghi/);
  assert.doesNotMatch(h.scan.message,/e-GP không trả gói nào|chưa đầy đủ/);
});
