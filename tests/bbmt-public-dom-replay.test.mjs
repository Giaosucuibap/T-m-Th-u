import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {normalizeBidderTable} from '../lib/bbmt.js';

// Record/replay evidence, explicitly not a fresh live extension scan.
const evidence=JSON.parse(fs.readFileSync(new URL('./fixtures/egp-public-dom-IB2600486024-20260906.json',import.meta.url),'utf8'));
const source=fs.readFileSync(new URL('../content.js',import.meta.url),'utf8');
const begin=source.indexOf('  function bbmtAdaptDomSnapshot('),end=source.indexOf('  /* BBMT_DOM_ADAPTER_END */',begin);
assert.ok(begin>=0&&end>begin);
const adapt=vm.runInNewContext(source.slice(begin,end)+'\nbbmtAdaptDomSnapshot;',{URL});

test('Recorded public DOM replay: IB2600486024 native BBMT tab reads all nine displayed columns at the unchanged step=tbmt URL',()=>{
  assert.equal(new URL(evidence.snapshot.url).searchParams.get('step'),'tbmt');
  assert.equal(evidence.snapshot.headers.length,9);
  assert.equal(Object.hasOwn(evidence.snapshot.fields,'Dự toán gói thầu'),false);
  const payload=adapt(evidence.snapshot);
  assert.ok(payload);assert.equal(payload.notifyNo,'IB2600486024');
  assert.equal(payload.kind,'package');assert.equal(payload.isMultiLot,false);assert.equal(payload.classificationKnown,true);
  assert.equal(payload.bidPrice,2646341557);assert.equal(payload.bidEstimatePrice,null);
  assert.equal(payload.rows.length,1);
  assert.equal(payload.rows[0].contractorCode,'vn5801400520');
  assert.equal(payload.rows[0].contractorName,'CÔNG TY TRÁCH NHIỆM HỮU HẠN TƯ VẤN XÂY DỰNG VÀ THƯƠNG MẠI PHÚ HOÀNG NAM');
  assert.equal(payload.rows[0].lotPrice,2609041591.923);
  assert.equal(payload.rows[0].lotFinalPrice,2609041591.923);
  assert.equal(payload.rows[0].discountPercent,0);
  const bidders=normalizeBidderTable(payload.rows,payload.bidPrice);
  assert.equal(bidders[0].taxCode,'5801400520');
  assert.equal(bidders[0].vsPackageAmount,37299965.077);
  assert.equal(bidders[0].vsPackageRate,1.41);
  assert.equal(bidders[0].finalPriceDerived,false);
  const report={evidenceType:'record-and-replay',liveEndToEnd:false,
    observedAtApprox:evidence.observedAtApprox,replayedAt:new Date().toISOString(),
    verificationScope:evidence.verificationScope,sourceUrl:evidence.snapshot.url,
    assertionsPassed:true,comparisonBasis:{source:'bidPrice',label:'Giá gói thầu (e-GP)',amount:payload.bidPrice},
    approvedEstimateObserved:false,bidders};
  const out=new URL('../test-results/4.3.3/',import.meta.url);fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(new URL('public-dom-replay-IB2600486024.json',out),JSON.stringify(report,null,2));
});
