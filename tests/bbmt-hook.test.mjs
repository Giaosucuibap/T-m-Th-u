import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { normalizeBidder } from '../GiaoSuCuiBap/lib/bbmt.js';

const source = await fs.readFile(new URL('../GiaoSuCuiBap/page-hook.js', import.meta.url), 'utf8');
const pageUrl = 'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?render=detail-v2&notifyNo=IB2600486024&step=bbmt';
const endpoint = 'https://muasamcong.mpi.gov.vn/o/egp-portal-contractor-selection-v2/services/expose/ldtkqmt/bid-notification-p/bid-open';
// Values were read from the public native e-GP table on 2026-09-05. Envelope
// and field names are documented in the official inline detail-v2 template.
const row = {contractorCode:'vn5801400520', contractorName:'CÔNG TY TRÁCH NHIỆM HỮU HẠN TƯ VẤN XÂY DỰNG VÀ THƯƠNG MẠI PHÚ HOÀNG NAM', bidPrice:2609041591.923, saleNumber:0, bidFinalPrice:2609041591.923};
const payload = rows => ({bidSubmissionByContractorViewResponse:{bidSubmissionDTOList:rows}});

async function capture(data, {transport='fetch', url=endpoint, status=200, type='BBMT_BIDDERS', followups=[]}={}) {
  const messages=[];
  let current={data,url,status};
  const responseForCurrent=()=>{
    const {data,url,status}=current;
    const response={url,status,ok:status>=200 && status<300,headers:{get:()=> 'application/json'},json:async()=>data};
    response.clone=()=>response;
    return response;
  };
  class XHR {
    constructor(){this.listeners={};}
    open(){}
    setRequestHeader(){}
    addEventListener(type, listener){this.listeners[type]=listener;}
    send(){this.responseType='json';this.response=current.data;this.status=current.status;this.responseURL=current.url;this.listeners.load?.();}
  }
  const window={fetch:async()=>responseForCurrent(),postMessage:message=>messages.push(message),addEventListener(){}};
  const location={href:pageUrl};
  vm.runInNewContext(source,{window,location,XMLHttpRequest:XHR,URL,URLSearchParams,Headers,Request,console});
  for(const step of [{data,url,status},...followups]){
    current={status:200,...step};
    if(step.pageUrl) location.href=step.pageUrl;
    if(transport==='fetch') await window.fetch(current.url,{method:'POST',body:'{}'});
    else {const request=new XHR();request.open('POST',current.url);request.send('{}');}
    await new Promise(resolve=>setImmediate(resolve));
  }
  return messages.filter(message=>message.type===type).map(message=>JSON.parse(JSON.stringify(message.payload)));
}

for(const transport of ['fetch','xhr']){
  test(`Official single-package bid-open reaches bidder pipeline via ${transport}`,async()=>{
    const messages=await capture(payload([{...row, confidentialUnrelated:'must not cross bridge'}]),{transport});
    assert.equal(messages.length,1);
    assert.equal(messages[0].url,pageUrl);
    assert.equal(messages[0].kind,'package');
    assert.equal(messages[0].rows[0].lotPrice,2609041591.923);
    assert.equal(messages[0].rows[0].lotFinalPrice,2609041591.923);
    assert.equal(messages[0].rows[0].discountPercent,0);
    assert.equal(messages[0].rows[0].confidentialUnrelated,undefined);
    const result=normalizeBidder(messages[0].rows[0],2646341557);
    assert.equal(result.taxCode,'5801400520');
    assert.equal(result.bidPrice,2609041591.923);
    assert.equal(result.finalPrice,2609041591.923);
    assert.equal(result.vsPackageAmount,37299965.077);
    assert.equal(result.vsPackageRate,1.41);
  });
}

const khacEndpoint='https://muasamcong.mpi.gov.vn/o/egp-portal-contractor-selection-v2/services/expose/kqmt/bid-notify-contractor-out/get-by-id';
const khacPayload=(flag,rows=[row],lots=[])=>({
  bidoNotifyContractorP:{isMultiLot:flag,bidPrice:3000000000,bidEstimatePrice:2800000000},
  bidSubmissionByContractorViewResponse:{bidSubmissionDTOList:rows,bidoLotOpenDetailDTOS:lots}
});
for(const transport of ['fetch','xhr']){
  test(`Verified KHAC whole-package DTO includes authoritative metadata via ${transport}`,async()=>{
    const value=khacPayload(0);
    const options={url:khacEndpoint,transport};
    const messages=await capture(value,options);
    assert.equal(messages.length,1);assert.equal(messages[0].kind,'package');
    assert.equal(messages[0].rows[0].lotPrice,row.bidPrice);
    assert.equal(messages[0].rows[0].lotFinalPrice,row.bidFinalPrice);
    assert.equal(messages[0].rows[0].discountPercent,0);
    const metadata=await capture(value,{...options,type:'BBMT_PRICE_BASIS'});
    assert.deepEqual(metadata.map(item=>item.source),['notify','round']);
    for(const item of metadata){assert.equal(item.isMultiLot,false);assert.equal(item.bidPrice,3000000000);assert.equal(item.bidEstimatePrice,2800000000);}
    const shortPath=khacEndpoint.replace('/o/egp-portal-contractor-selection-v2','');
    assert.equal((await capture(value,{...options,url:shortPath}))[0].kind,'package');
  });

  test(`KHAC lot response uses lot prices and never treats package roster as lots via ${transport}`,async()=>{
    const lots=[{contractorCode:row.contractorCode,contractorName:row.contractorName,lotNo:'L1',lotName:'Phần kiểm thử',lotPrice:100.123,lotFinalPrice:90.111,discountPercent:10,privateOther:'discard'}];
    const value=khacPayload(1,[{...row,ventureName:'Liên danh kiểm thử'}],lots);
    const options={url:khacEndpoint,transport};
    const result=await capture(value,options);
    assert.equal(result[0].kind,'lot');assert.equal(result[0].rows.length,1);
    const actual=result[0].rows[0];
    assert.equal(actual.lotNo,'L1');assert.equal(actual.lotPrice,100.123);assert.equal(actual.lotFinalPrice,90.111);
    assert.equal(actual.ventureName,'Liên danh kiểm thử');assert.equal(actual.privateOther,undefined);
    const metadata=await capture(value,{...options,type:'BBMT_PRICE_BASIS'});
    assert.ok(metadata.every(item=>item.isMultiLot===true));
    assert.deepEqual((await capture(khacPayload(1,[row],[]),options))[0].rows,[]);
    const missingLots=khacPayload(1);delete missingLots.bidSubmissionByContractorViewResponse.bidoLotOpenDetailDTOS;
    assert.equal((await capture(missingLots,options)).length,0);
  });

  test(`KHAC missing prices remain unknown and unclassified/invalid arrays are not accepted via ${transport}`,async()=>{
    const options={url:khacEndpoint,transport};
    const value={bidoNotifyContractorP:{isMultiLot:false},bidSubmissionByContractorViewResponse:{bidSubmissionDTOList:[{contractorCode:'vn0123456789',contractorName:'Fixture missing prices'}]}};
    const result=await capture(value,options),bidder=normalizeBidder(result[0].rows[0],1000000);
    assert.equal(bidder.bidPrice,null);assert.equal(bidder.finalPrice,null);assert.equal(bidder.discountPercent,null);
    const metadata=await capture(value,{...options,type:'BBMT_PRICE_BASIS'});
    assert.deepEqual(metadata.map(item=>item.source),['notify','round']);
    assert.ok(metadata.every(item=>item.bidPrice===null&&item.bidEstimatePrice===null&&item.isMultiLot===false));
    assert.deepEqual((await capture(khacPayload(false,[]),options))[0].rows,[]);
    for(const invalid of [{},0,khacPayload(false,null),khacPayload(false,[{}]),khacPayload(true,[],[{}]),{success:false,...khacPayload(false)}]){
      assert.equal((await capture(invalid,options)).length,0);
    }
    for(const flag of [undefined,null,'1','0','unknown',2]){
      assert.equal((await capture(khacPayload(flag),options)).length,0);
      const unknownMeta=await capture(khacPayload(flag),{...options,type:'BBMT_PRICE_BASIS'});
      assert.equal(unknownMeta.length,1);assert.equal(unknownMeta[0].source,'notify');assert.equal(unknownMeta[0].isMultiLot,null);
    }
  });

  test(`KHAC adapter refuses ADB/WB, unrelated endpoints and non-success HTTP via ${transport}`,async()=>{
    const value=khacPayload(false);
    for(const url of [khacEndpoint+'/other',khacEndpoint.replace('bid-notify-contractor-out/','bid-notify-contractor-out-adb-wb/'),khacEndpoint.replace('muasamcong.mpi.gov.vn','example.invalid')]){
      assert.equal((await capture(value,{url,transport})).length,0);
      assert.equal((await capture(value,{url,transport,type:'BBMT_PRICE_BASIS'})).length,0);
    }
    for(const status of [400,403,500]){
      assert.equal((await capture(value,{url:khacEndpoint,transport,status})).length,0);
      assert.equal((await capture(value,{url:khacEndpoint,transport,status,type:'BBMT_PRICE_BASIS'})).length,0);
    }
  });
}

test('Verified schema preserves missing price and discount as unknown',async()=>{
  const messages=await capture(payload([{contractorCode:'vn0123456789',contractorName:'Fixture missing prices'}]));
  const bidder=normalizeBidder(messages[0].rows[0],1000000);
  assert.equal(bidder.finalPrice,null);
  assert.equal(bidder.discountPercent,null);
  assert.equal(bidder.vsPackageRate,null);
});

test('Only explicit empty DTO list is a valid empty bidder table',async()=>{
  assert.deepEqual((await capture(payload([])))[0].rows,[]);
  for(const data of [[],{},0,{error:'denied'},payload(null),payload([{}]),{success:false,...payload([row])}]){
    assert.equal((await capture(data)).length,0);
  }
});

test('Bid-opening capture requires official exact endpoint and successful HTTP',async()=>{
  for(const url of [endpoint.replace('muasamcong.mpi.gov.vn','example.invalid'),endpoint+'/extra',endpoint.replace('bid-open','submission')]){
    assert.equal((await capture(payload([row]),{url})).length,0);
  }
  for(const status of [400,403,500]) assert.equal((await capture(payload([row]),{status})).length,0);
});

test('Lot-open detail remains supported separately and never remaps lot fields',async()=>{
  const lot={contractorCode:'vn0123456789',contractorName:'Fixture lot bidder',lotNo:'L1',lotPrice:100,lotFinalPrice:90,discountPercent:10};
  const messages=await capture([lot],{url:endpoint.replace('bid-open','lotOpenDetail')});
  assert.equal(messages[0].kind,'lot');
  assert.deepEqual(messages[0].rows,[lot]);
});

for(const transport of ['fetch','xhr']){
  test(`Notify price basis uses only official explicit positive fields via ${transport}`,async()=>{
    const url=endpoint.replace('/expose/ldtkqmt/','/exposeldtkqmt/').replace('/bid-open','/notify');
    const options={url,transport,type:'BBMT_PRICE_BASIS'};
    const value={bidNoContractorResponse:{bidNotification:{bidPrice:3000000000,bidEstimatePrice:2800000000,otherSecret:'discard'}}};
    assert.deepEqual(await capture(value,options),[{url:pageUrl,status:200,bidPrice:3000000000,bidEstimatePrice:2800000000,isMultiLot:null,source:'notify'}]);
    assert.equal((await capture(value,{...options,url:url+'/extra'})).length,0);
    assert.equal((await capture(value,{...options,status:403})).length,0);
    assert.equal((await capture({unrelated:{bidPrice:10,bidEstimatePrice:9}},options)).length,0);
    for(const invalid of [0,-1,null,'','unknown',Infinity]){
      const messages=await capture({bidNoContractorResponse:{bidNotification:{bidPrice:invalid,bidEstimatePrice:invalid}}},options);
      assert.equal(messages.length,1);
      assert.equal(messages[0].source,'notify');
      assert.equal(messages[0].bidPrice,null);
      assert.equal(messages[0].bidEstimatePrice,null);
    }
    for(const flag of [false,true,0,1]){
      const message=await capture({bidNoContractorResponse:{bidNotification:{isMultiLot:flag}}},options);
      assert.equal(message[0].isMultiLot,Boolean(flag));
    }
  });

  test(`Round flag and notify price merge in either response order via ${transport}`,async()=>{
    const notifyUrl=endpoint.replace('/expose/ldtkqmt/','/exposeldtkqmt/').replace('/bid-open','/notify');
    const roundUrl=endpoint.replace('/bid-open','/roundmng');
    const notify={url:notifyUrl,data:{bidNoContractorResponse:{bidNotification:{bidPrice:3000000000,bidEstimatePrice:2800000000}}}};
    const round={url:roundUrl,data:{bidoBidroundMngViewDTO:{isMultiLot:false,unrelatedPrice:99}}};
    for(const [first,second] of [[notify,round],[round,notify]]){
      const result=await capture(first.data,{transport,url:first.url,type:'BBMT_PRICE_BASIS',followups:[second]});
      assert.equal(result.length,2);
      assert.equal(result[1].bidPrice,3000000000);
      assert.equal(result[1].bidEstimatePrice,2800000000);
      assert.equal(result[1].isMultiLot,false);
      assert.equal(result[1].source,second===notify?'notify':'round');
    }
    const badShape={unrelated:{isMultiLot:true}};
    assert.equal((await capture(badShape,{url:roundUrl,transport,type:'BBMT_PRICE_BASIS'})).length,0);
    assert.equal((await capture(round.data,{url:roundUrl+'/wrong',transport,type:'BBMT_PRICE_BASIS'})).length,0);
    assert.equal((await capture(round.data,{url:roundUrl,transport,status:500,type:'BBMT_PRICE_BASIS'})).length,0);
    const otherPage=pageUrl.replace('IB2600486024','IB2600000002');
    const isolated=await capture(notify.data,{url:notifyUrl,transport,type:'BBMT_PRICE_BASIS',followups:[{...round,pageUrl:otherPage}]});
    assert.equal(isolated[1].url,otherPage);
    assert.equal(isolated[1].bidPrice,null);
    assert.equal(isolated[1].bidEstimatePrice,null);
  });
}
