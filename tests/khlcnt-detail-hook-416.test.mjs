import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../GiaoSuCuiBap/page-hook.js',import.meta.url),'utf8');
const content=fs.readFileSync(new URL('../GiaoSuCuiBap/content.js',import.meta.url),'utf8');
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/khlcnt-detail-416.json',import.meta.url),'utf8'));
const endpoint='https://muasamcong.mpi.gov.vn'+fixture.provenance.path;
const pageUrl='https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?render=detail-v2&step=khlcnt&id='+fixture.data.bidPoBidpPlanProjectDetailView.id+'&planNo=PL2600333000';
async function capture(data,{transport='fetch',url=endpoint,status=200,page=pageUrl}={}){
  const messages=[],requests=[];
  const response={url,status,ok:status>=200&&status<300,headers:{get:()=> 'application/json'},json:async()=>data};
  response.clone=()=>response;
  class XHR{
    constructor(){this.listeners={};}
    open(method,url){requests.push({method,url});}setRequestHeader(){}
    addEventListener(type,listener){this.listeners[type]=listener;}
    send(){this.responseType='json';this.response=data;this.status=status;this.responseURL=url;this.listeners.load?.();}
  }
  const window={fetch:async(input,init)=>{requests.push({input,init});return response;},postMessage:m=>messages.push(m),addEventListener(){}};
  const location={href:page,origin:'https://muasamcong.mpi.gov.vn'};
  vm.runInNewContext(source,{window,location,XMLHttpRequest:XHR,URL,URLSearchParams,Headers,Request,console});
  if(transport==='fetch')await window.fetch(url,{method:'POST',body:'{}'});
  else{const xhr=new XHR();xhr.open('POST',url);xhr.send('{}');}
  await new Promise(resolve=>setImmediate(resolve));
  return {messages:structuredClone(messages),details:structuredClone(messages.filter(m=>m.type==='KHLCNT_DETAIL').map(m=>m.payload)),requests};
}

for(const transport of ['fetch','xhr']){
  test(`416 native witnessed PL detail binds its six own child fields and prices via ${transport}`,async()=>{
    const data=structuredClone(fixture.data);
    Object.assign(data,{token:'must not cross',cookie:'must not cross',arbitraryEnvelope:{secret:'must not cross'}});
    data.bidPoBidpPlanProjectDetailView.password='must not cross';
    data.bidpPlanDetailToProjectList[0].secret='must not cross';
    data.bidpPlanDetailToProjectList[0].locations=[{provCode:'703',districtCode:'23122',parentCode:'703',token:'must not cross'}];
    const h=await capture(data,{transport});assert.equal(h.details.length,1);assert.equal(h.requests.length,1,'observer must not generate another request');
    const detail=h.details[0];assert.equal(detail.url,pageUrl);assert.equal(detail.status,200);
    assert.equal(detail.header.planNo,'PL2600333000');assert.equal(detail.header.planVersion,'00');assert.equal(detail.header.bidPack,6);
    assert.equal(detail.packages.length,6);
    for(let i=0;i<detail.packages.length;i++){
      const original=fixture.data.bidpPlanDetailToProjectList[i],child=detail.packages[i];
      assert.equal(child.id,original.id);assert.equal(child.idPlan,detail.header.id);
      assert.equal(child.bidNo,original.bidNo);assert.equal(child.bidName,original.bidName);
      assert.equal(child.bidField,original.bidField);assert.equal(child.bidPrice,original.bidPrice);
      assert.equal(child.bidPriceUnit,'VND');
    }
    assert.deepEqual(detail.packages[0].locations,[{provCode:'703',districtCode:'23122',parentCode:'703'}]);
    assert.doesNotMatch(JSON.stringify(detail),/must not cross|password|arbitraryEnvelope|cookie|secret/);
    assert.equal(h.messages.filter(m=>m.type==='NETWORK_CAPTURE').length,0,'detail envelope must not spill into unrelated tender ingestion');
  });

  test(`416 verified alternate child DTO is accepted while incomplete empty detail is withheld via ${transport}`,async()=>{
    const data=structuredClone(fixture.data);
    data.lsBidpPlanDetailDTO=data.bidpPlanDetailToProjectList;delete data.bidpPlanDetailToProjectList;
    assert.equal((await capture(data,{transport})).details[0].packages.length,6);
    data.lsBidpPlanDetailDTO=[];
    assert.equal((await capture(data,{transport})).details.length,0);
    data.bidPoBidpPlanProjectDetailView.bidPack=0;
    assert.deepEqual((await capture(data,{transport})).details[0].packages,[]);
  });

  test(`416 plan adapter rejects unrelated origins/endpoints and failed or malformed native details via ${transport}`,async()=>{
    for(const url of [endpoint+'/other',endpoint.replace('muasamcong.mpi.gov.vn','example.invalid'),endpoint.replace('get-by-id','get-version-list')]){
      assert.equal((await capture(fixture.data,{transport,url})).details.length,0);
    }
    for(const status of [403,429,500])assert.equal((await capture(fixture.data,{transport,status})).details.length,0);
    for(const data of [{},null,{success:false,...fixture.data}, {...fixture.data,bidpPlanDetailToProjectList:[null]},
      {...fixture.data,bidpPlanDetailToProjectList:Array.from({length:501},()=>fixture.data.bidpPlanDetailToProjectList[0])},
      {...fixture.data,bidPoBidpPlanProjectDetailView:{...fixture.data.bidPoBidpPlanProjectDetailView,planNo:'IB2600333000'}},
      {...fixture.data,bidpPlanDetailToProjectList:[{...fixture.data.bidpPlanDetailToProjectList[0],locations:[null]}]}]){
      assert.equal((await capture(data,{transport})).details.length,0);
    }
  });
}

test('416 isolated content bridge forwards only the canonical detail projection from the page hook',()=>{
  const start=content.indexOf('  // Nhận trang kết quả đã lọc'),end=content.indexOf('  // Chạy tiếp lượt tra cứu',start);
  assert.ok(start>=0&&end>start);
  let listener;const calls=[],window={addEventListener:(_,fn)=>{listener=fn;}};
  vm.runInNewContext(content.slice(start,end),{window,PAGE_SOURCE:'BID_RADAR_ONE_PAGE',location:{href:pageUrl},
    kqSend:(type,payload)=>calls.push({type,payload:structuredClone(payload)})});
  const canonical={url:pageUrl,status:200,header:fixture.data.bidPoBidpPlanProjectDetailView,packages:fixture.data.bidpPlanDetailToProjectList};
  listener({source:{},data:{source:'BID_RADAR_ONE_PAGE',type:'KHLCNT_DETAIL',payload:canonical}});
  listener({source:window,data:{source:'UNTRUSTED',type:'KHLCNT_DETAIL',payload:canonical}});
  assert.equal(calls.length,0);
  listener({source:window,data:{source:'BID_RADAR_ONE_PAGE',type:'KHLCNT_DETAIL',payload:{...canonical,privateExtra:'discard'}}});
  assert.equal(calls.length,1);assert.equal(calls[0].type,'KHLCNT_DETAIL');assert.deepEqual(calls[0].payload,canonical);
});
