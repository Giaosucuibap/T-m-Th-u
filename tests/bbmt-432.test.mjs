import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {normalizeBbmtPackage,normalizeBidder,normalizeBidderTable,parseOpeningMoney,formatOpeningMoney,sameBbmtDetailPage,bbmtReadStateOf,bbmtReadState} from '../GiaoSuCuiBap/lib/bbmt.js';
import {openingFingerprint,cacheOpening,restoreOpening,trimOpeningCache} from '../GiaoSuCuiBap/lib/bbmt-cache.js';

const raw={notifyNo:'IB2699990001',notifyId:'notice-1',id:'notice-1',bidOpenId:'opening-1',notifyVersion:'00',bidPrice:3000000000,numBidderJoin:1,publicDateKqmt:'2026-09-05T03:00:00Z'};
const pkg=normalizeBbmtPackage(raw);
const bidder=(n=1,price=2470000000)=>({contractorCode:'vn012345678'+n,contractorName:'Fixture bidder '+n,lotPrice:2600000000,lotFinalPrice:price,discountPercent:5});
test('Detail identity accepts optional placeholders while rejecting another notice, opening or host',()=>{
  const expected=new URL(pkg.detailUrl),actual=new URL(pkg.detailUrl);
  for(const key of ['inputResultId','techReqId','bidPreOpenId','bidPreNotifyResultId'])actual.searchParams.delete(key);
  actual.searchParams.delete('notifyId'); // native routes can use the id alias
  assert.equal(sameBbmtDetailPage(expected.href,actual.href),true);
  for(const [key,value] of [['notifyNo','IB2699990002'],['id','notice-2'],['bidOpenId','opening-2']]){
    const other=new URL(actual);other.searchParams.set(key,value);
    assert.equal(sameBbmtDetailPage(expected.href,other.href),false,key);
  }
  for(const value of ['https://example.invalid/contractor-selection','https://muasamcong.mpi.gov.vn/web/guest/home','javascript:alert(1)','not a URL'])assert.equal(sameBbmtDetailPage(expected.href,value),false);
  const noOpening=new URL(actual);noOpening.searchParams.delete('bidOpenId');
  assert.equal(sameBbmtDetailPage(expected.href,noOpening.href),true);
});
test('Fractional VND from public BBMT JSON remains exact through normalization and display',()=>{
  assert.equal(parseOpeningMoney(2609041591.923),2609041591.923);
  assert.equal(parseOpeningMoney('2609041591.923'),2609041591.923);
  for(const value of [null,undefined,Infinity,NaN,''])assert.equal(parseOpeningMoney(value),null);
  const b=normalizeBidder({...bidder(),lotPrice:2609041591.923,lotFinalPrice:2609041591.923,discountPercent:0},2646341557);
  assert.equal(b.bidPrice,2609041591.923);assert.equal(b.finalPrice,2609041591.923);
  assert.ok(Math.abs(b.vsPackageAmount-37299965.077)<0.001);assert.equal(b.vsPackageRate,1.41);
  assert.equal(formatOpeningMoney(b.finalPrice),'2.609.041.591,923 đ');
});
test('Approved estimate learned only from detail survives cache restore against an unchanged listing',()=>{
  const completed={...pkg,listingFingerprint:openingFingerprint(pkg),priceBasis:2800000000,priceBasisLabel:'Dự toán được duyệt (e-GP)',priceBasisSource:'bidEstimatePrice',
    bidders:normalizeBidderTable([bidder()],2800000000),readState:'OK',scannedAt:new Date().toISOString(),openingMetadataVerified:true,isMultiLot:false,openingKind:'package'};
  const entry=cacheOpening(completed),restored=restoreOpening(normalizeBbmtPackage(raw),entry);
  assert.equal(restored.fromCache,true);assert.equal(restored.priceBasis,2800000000);
  assert.equal(restored.priceBasisSource,'bidEstimatePrice');assert.equal(restored.bidders[0].vsPackageAmount,330000000);
  assert.equal(restored.openingMetadataVerified,true);
  for(const change of [{notifyVersion:'01'},{bidOpenId:'opening-2'},{bidPrice:3100000000},{numBidderJoin:2}])assert.equal(restoreOpening(normalizeBbmtPackage({...raw,...change}),entry).fromCache,undefined);
  assert.equal(restoreOpening(pkg,{...entry,schemaVersion:undefined}).fromCache,undefined);
});

const background=fs.readFileSync(new URL('../GiaoSuCuiBap/background.js',import.meta.url),'utf8');
function sourceFunction(name){
  const start=background.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start>=0,name);
  const tail=background.slice(start),end=tail.search(/\r?\n}\r?\n/);
  assert.ok(end>0,name);return tail.slice(0,end)+'\n}';
}
function acquisitionHarness(selected=pkg){
  let clock=0,nextTimer=1,result,settled=false;
  const timers=new Map(),job={scanId:'fixture-scan',waiters:new Map()},leases=[],observations=[];
  let storage={bidOpenScan:{id:job.scanId,status:'SCANNING',packages:[selected]},bidOpenCache:{}};
  const context=vm.createContext({BBMT_DETAIL_TIMEOUT:25000,BBMT_NAVIGATION_TIMEOUT:45000,BBMT_TOTAL_TIMEOUT:90000,
    BBMT_DETAIL_ALARM_MS:60000,TIMEOUT_PREFIX:'fixture:',normalizeBidderTable,sameBbmtDetailPage,bbmtWaiter:job,
    openingFingerprint,bbmtReadState,cacheOpening,trimOpeningCache,obsQueue:observations,observationsFromBidOpen:p=>[{key:p.key}],
    withLock:async fn=>fn(),getBidScan:async()=>storage.bidOpenScan,save:async patch=>{storage={...storage,...patch};},
    chrome:{tabs:{update:async()=>({id:7})},alarms:{create:async(name,alarm)=>leases.push({name,...alarm})},storage:{local:{get:async()=>storage}}},
    setTimeout(fn,delay){const id=nextTimer++;timers.set(id,{at:clock+delay,fn});return id;},clearTimeout:id=>timers.delete(id)});
  for(const name of ['applyOpeningResult','publishOpeningProgress','recordBidders','openBbmtDetail','setOpeningRows','onBbmtBidders','onBbmtPriceBasis','onBbmtDomResult','onBbmtContentReady'])vm.runInContext(sourceFunction(name),context);
  const completion=context.openBbmtDetail(7,selected,job).then(value=>{result=value;settled=true;return value;});
  return {job,completion,leases,observations,get storage(){return storage;},get settled(){return settled;},get result(){return result;},
    ready:async(payload={})=>context.onBbmtContentReady({url:selected.detailUrl,phase:'dom-ready',...payload},7),
    cancel(){job.cancelled=true;job.waiters.get(7)?.resolve(null);},
    commitFinal:async()=>context.recordBidders(job.scanId,selected.key,await completion),
    rows:async(rows,kind='package',payload={},tabId=7)=>context.onBbmtBidders({rows,kind,url:selected.detailUrl,status:200,...payload},tabId),
    dom:async(payload={},tabId=7)=>context.onBbmtDomResult({url:selected.detailUrl,notifyNo:selected.notifyNo,source:'visible-dom',
      cardId:'ttnt-card-bbmt-ldt',kind:'package',classificationKnown:true,isMultiLot:false,
      bidPrice:3000000000,bidEstimatePrice:2800000000,rows:[bidder()],...payload},tabId),
    metadata:async(metadata)=>{
      const payload={url:selected.detailUrl,status:200,...metadata};
      if(metadata.source)return context.onBbmtPriceBasis(payload,7);
      await context.onBbmtPriceBasis({...payload,source:'notify'},7);
      return context.onBbmtPriceBasis({...payload,source:'round'},7);
    },
    async advance(ms){const end=clock+ms;for(;;){const found=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at).find(([,timer])=>timer.at<=end);if(!found)break;clock=found[1].at;timers.delete(found[0]);found[1].fn();await Promise.resolve();}clock=end;await Promise.resolve();}
  };
}
test('A bidder table waits beyond the old 2-second grace for metadata',async()=>{
  const h=acquisitionHarness();await h.rows([bidder()]);await h.advance(2500);
  assert.equal(h.settled,false);assert.equal(h.job.waiters.size,1);
  await h.metadata({bidPrice:3000000000,bidEstimatePrice:2800000000,isMultiLot:false});
  const result=await h.completion;assert.equal(result.incomplete,false);assert.equal(result.metadata.bidEstimatePrice,2800000000);assert.equal(result.kind,'package');
});
test('Document start at 1 second keeps navigation alive until DOM-ready at 35 seconds, then starts the API window',async()=>{
  const h=acquisitionHarness();await h.advance(1000);
  assert.equal((await h.ready({phase:'document-start'})).ignored,true);
  assert.equal(h.leases.length,0);
  await h.advance(34000);assert.equal(h.settled,false);
  await h.ready();await h.advance(24000);assert.equal(h.settled,false);
  await h.advance(1000);const result=await h.completion;
  assert.equal(result.rows,null);assert.ok(result.incompleteReason.includes('sau lần phản hồi gần nhất'));
  const noDocument=acquisitionHarness();await noDocument.advance(45000);
  assert.ok((await noDocument.completion).incompleteReason.includes('chưa tải được'));
});

test('Unknown or stale document-start readiness cannot refresh either navigation or an active API deadline',async()=>{
  const navigating=acquisitionHarness();await navigating.advance(40000);
  for(const phase of ['document-start','loading','ready',undefined])assert.equal((await navigating.ready({phase})).ignored,true);
  assert.equal(navigating.leases.length,0);await navigating.advance(5000);
  assert.ok((await navigating.completion).incompleteReason.includes('chưa tải được'));
  const reading=acquisitionHarness();await reading.ready();await reading.advance(20000);
  for(const phase of ['document-start','loading','ready',undefined])assert.equal((await reading.ready({phase})).ignored,true);
  assert.equal(reading.leases.length,1);await reading.advance(4999);assert.equal(reading.settled,false);
  await reading.advance(1);assert.ok((await reading.completion).incompleteReason.includes('sau lần phản hồi gần nhất'));
});
test('Progress refreshes the API window and alarm lease but cannot extend the 90-second total cap',async()=>{
  const h=acquisitionHarness();await h.ready();
  for(let i=0;i<4;i++){await h.advance(20000);assert.equal(h.settled,false);await h.ready({phase:'dom-ready'});}
  assert.equal(h.leases.length,5);await h.advance(10000);
  assert.equal(h.settled,true);assert.ok(h.result.incompleteReason.includes('giới hạn thời gian'));
});
test('CONTENT_READY from another notice cannot release the navigation guard; native errors stop clearly',async()=>{
  const h=acquisitionHarness(),other=new URL(pkg.detailUrl);other.searchParams.set('notifyNo','IB2699990002');
  assert.equal((await h.ready({url:other.href})).ignored,true);assert.equal(h.leases.length,0);
  await h.advance(45000);assert.ok((await h.completion).incompleteReason.includes('chưa tải được'));
  const failed=acquisitionHarness();await failed.ready({phase:'dom-ready',pageError:'ACCESS_DENIED'});
  const result=await failed.completion;assert.equal(result.retryable,false);assert.ok(result.incompleteReason.includes('từ chối truy cập'));
});
test('Provisional bidder rows appear immediately without caching or observations, then metadata finalizes them',async()=>{
  const h=acquisitionHarness();await h.rows([bidder()]);
  let visible=h.storage.bidOpenScan.packages[0];
  assert.equal(h.settled,false);assert.equal(visible.readState,'READING');assert.equal(visible.bidders.length,1);
  assert.equal(visible.comparisonPending,true);assert.equal(visible.bidders[0].vsPackageAmount,null);
  assert.equal(Object.keys(h.storage.bidOpenCache).length,0);assert.equal(h.observations.length,0);
  await h.metadata({bidPrice:3000000000,bidEstimatePrice:2800000000,isMultiLot:false});await h.commitFinal();
  visible=h.storage.bidOpenScan.packages[0];assert.equal(visible.readState,'OK');assert.equal(visible.openingProvisional,false);
  assert.equal(visible.bidders[0].vsPackageAmount,330000000);assert.equal(Object.keys(h.storage.bidOpenCache).length,1);assert.equal(h.observations.length,1);
});
test('Cancellation prevents late metadata or bidder events from changing a published provisional table',async()=>{
  const h=acquisitionHarness();await h.rows([bidder()]);h.cancel();await h.completion;
  const before=JSON.stringify(h.storage);
  await h.metadata({bidPrice:3000000000,bidEstimatePrice:2800000000,isMultiLot:false});await h.rows([bidder(),bidder(2)]);
  assert.equal(JSON.stringify(h.storage),before);assert.equal(Object.keys(h.storage.bidOpenCache).length,0);assert.equal(h.observations.length,0);
});
test('DOM fallback rejects cross-notice, cross-tab and mismatched package/lot claims',async()=>{
  const h=acquisitionHarness(),other=new URL(pkg.detailUrl);other.searchParams.set('notifyNo','IB2699990002');
  const before=JSON.stringify(h.storage);
  for(const [payload,tabId] of [[{url:other.href},7],[{notifyNo:'IB2699990002'},7],[{},8],[{isMultiLot:true,kind:'package'},7],[{cardId:'unrelated-card'},7]]){
    assert.equal((await h.dom(payload,tabId)).ignored,true);
  }
  assert.equal(JSON.stringify(h.storage),before);assert.equal(h.leases.length,0);h.cancel();await h.completion;
});
test('Unclassified ADB DOM rows remain provisional without comparisons or cache',async()=>{
  const h=acquisitionHarness();
  await h.dom({cardId:'ttnt-card-bbmt-adbwb',classificationKnown:false,isMultiLot:null});
  const visible=h.storage.bidOpenScan.packages[0];
  assert.equal(h.settled,false);assert.equal(visible.readState,'READING');assert.equal(visible.bidders.length,1);
  assert.equal(visible.comparisonPending,true);assert.equal(visible.bidders[0].vsPackageAmount,null);
  assert.equal(Object.keys(h.storage.bidOpenCache).length,0);assert.equal(h.observations.length,0);
  await h.advance(25000);await h.commitFinal();
  assert.equal(h.storage.bidOpenScan.packages[0].readState,'PARTIAL');assert.equal(Object.keys(h.storage.bidOpenCache).length,0);
});
test('Pending DOM estimate and same-count prices update, then actual API fields and rows take precedence',async()=>{
  const h=acquisitionHarness({...pkg,numBidderJoin:2});
  await h.dom({bidEstimatePrice:2700000000});
  await h.dom({bidEstimatePrice:2800000000,rows:[bidder(1,2460000000)]});
  let visible=h.storage.bidOpenScan.packages[0];
  assert.equal(visible.priceBasis,2800000000);assert.equal(visible.bidders[0].finalPrice,2460000000);
  assert.equal(h.job.waiters.get(7).metadata.nativeNotifyReceived,undefined);
  await h.metadata({source:'notify',bidPrice:3100000000,bidEstimatePrice:2900000000,isMultiLot:null});
  await h.rows([bidder(1,2450000000)]);
  await h.metadata({source:'round',bidPrice:null,bidEstimatePrice:null,isMultiLot:false});
  await h.dom({bidPrice:3300000000,bidEstimatePrice:2600000000,rows:[bidder(1,2400000000)]});
  visible=h.storage.bidOpenScan.packages[0];
  assert.equal(visible.priceBasis,2900000000);assert.equal(visible.bidPrice,3100000000);assert.equal(visible.bidders[0].finalPrice,2450000000);
  const waiter=h.job.waiters.get(7);
  assert.equal(waiter.metadata.nativeNotifyReceived,true);assert.equal(waiter.metadata.nativeRoundReceived,true);
  assert.equal(waiter.packageDomRows[0].lotFinalPrice,2400000000);assert.equal(waiter.packageRowsSource,'native');
  await h.rows([bidder(1,2450000000),bidder(2,2440000000)]);await h.commitFinal();
  assert.equal(h.storage.bidOpenScan.packages[0].readState,'OK');assert.equal(h.storage.bidOpenScan.packages[0].priceBasis,2900000000);
});
test('A smaller DOM table cannot replace a richer native table while classification is pending',async()=>{
  const h=acquisitionHarness({...pkg,numBidderJoin:3});
  await h.rows([bidder(1,2450000000),bidder(2,2440000000)]);
  await h.dom({rows:[bidder(1,2000000000)],cardId:'ttnt-card-bbmt-adbwb',classificationKnown:false,isMultiLot:null});
  const waiter=h.job.waiters.get(7),visible=h.storage.bidOpenScan.packages[0];
  assert.equal(waiter.packageRowsSource,'native');assert.equal(visible.bidders.length,2);
  assert.equal(visible.bidders.find(b=>b.taxCode==='0123456781').finalPrice,2450000000);
  h.cancel();await h.completion;
});
test('Both row sources arriving before classification select the correct lot table',async()=>{
  const h=acquisitionHarness();await h.rows([bidder()]);await h.rows([{...bidder(),lotNo:'L1',lotFinalPrice:500000000}],'lot');
  await h.advance(2500);assert.equal(h.settled,false);
  await h.metadata({bidPrice:3000000000,isMultiLot:true});
  const result=await h.completion;assert.equal(result.kind,'lot');assert.equal(result.rows[0].lotFinalPrice,500000000);assert.equal(result.incomplete,false);
});
test('Round-only metadata waits for notify; null round prices do not overwrite approved estimate',async()=>{
  for(const first of ['notify','round']){
    const h=acquisitionHarness();await h.rows([bidder()]);
    const notify={source:'notify',bidPrice:3000000000,bidEstimatePrice:2800000000,isMultiLot:null};
    const round={source:'round',bidPrice:null,bidEstimatePrice:null,isMultiLot:false};
    await h.metadata(first==='notify'?notify:round);await h.advance(2500);assert.equal(h.settled,false);
    await h.metadata(first==='notify'?round:notify);
    const result=await h.completion;assert.equal(result.incomplete,false);assert.equal(result.metadata.bidEstimatePrice,2800000000);
    assert.equal(result.metadata.isMultiLot,false);assert.equal(result.metadata.notifyReceived,true);assert.equal(result.metadata.roundReceived,true);
  }
});
test('Missing metadata or only the wrong row source reaches the deadline as PARTIAL',async()=>{
  for(const flag of [undefined,true,false]){
    const h=acquisitionHarness();
    if(flag!==undefined)await h.metadata({bidPrice:3000000000,isMultiLot:flag});
    await h.rows([bidder()],flag===false?'lot':'package');await h.advance(25000);
    const result=await h.completion;
    assert.equal(result.incomplete,true);assert.equal(result.comparisonPending,true);assert.equal(result.rows.length,1);
  }
});
test('A partial bidder response stays pending until all expected participants arrive',async()=>{
  const h=acquisitionHarness({...pkg,numBidderJoin:2});await h.metadata({bidPrice:3000000000,isMultiLot:false});
  await h.rows([bidder()]);await h.advance(1000);assert.equal(h.settled,false);
  await h.rows([bidder(),bidder(2)]);
  const result=await h.completion;assert.equal(result.rows.length,2);assert.equal(result.incomplete,false);
});
test('A newly owned tab whose pending URL is about:blank can start a detail read',async()=>{
  const scan={id:'scan-owned-blank',status:'SCANNING',ownedDetailTab:7,tabId:7,packages:[pkg]},reads=[],closed=[];
  const context=vm.createContext({getBidScan:async()=>scan,isLookupActive:()=>true,lookupKind:()=>({}),bbmtReadStateOf,
    bbmtWaiter:null,BBMT_DETAIL_ALARM_MS:60000,TIMEOUT_PREFIX:'fixture:',isEgpUrl:url=>String(url||'').startsWith('https://muasamcong.mpi.gov.vn/'),
    setScan:async()=>true,markOpeningReading:async()=>true,recordBidders:async()=>{},finalizeBidOpenScan:async()=>{},
    openBbmtDetail:async(tab,p)=>{reads.push(p.key);return {rows:[bidder()],incomplete:false};},
    chrome:{tabs:{get:async()=>({id:7,pendingUrl:'about:blank'}),remove:async id=>closed.push(id)},alarms:{create:async()=>{}}},
    setTimeout:fn=>{queueMicrotask(fn);return 1;}});
  vm.runInContext(sourceFunction('startBidOpenDetailPhase'),context);
  await context.startBidOpenDetailPhase(scan.id);
  assert.deepEqual(reads,[pkg.key]);assert.deepEqual(closed,[7]);
});
