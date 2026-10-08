import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createQueryRuntime} from '../GiaoSuCuiBap/lib/runtime-query.js';
import {EGP_SEARCH_PAGE} from '../GiaoSuCuiBap/lib/kqlcnt.js';

const source=fs.readFileSync(new URL('../GiaoSuCuiBap/content.js',import.meta.url),'utf8');
function sourceFunction(name){
  const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start>=0,name);const tail=source.slice(start),end=tail.search(/\r?\n  }\r?\n/);
  assert.ok(end>0,name);return tail.slice(0,end)+'\n  }';
}
function control(overrides={}){
  return {offsetParent:{},disabled:false,readOnly:false,visibility:'visible',placeholder:'',innerText:'',clicks:0,
    getAttribute(name){return this[name]??null;},matches(selector){assert.equal(selector,':disabled');return Boolean(this.fieldsetDisabled);},
    click(){this.clicks++;},...overrides};
}
function nativePage({inputs=[control({placeholder:'Nhập số TBMT/Tên gói thầu (ví dụ: IB0123456789 hoặc Mua sắm thiết bị)'})],
  buttons=[control({innerText:'Tìm kiếm'})],resultsView=false,url=EGP_SEARCH_PAGE}={}){
  const context=vm.createContext({URL,location:{href:url},kqPlan:null,clean:value=>String(value).replace(/\s+/g,' ').trim(),
    getComputedStyle:el=>({visibility:el.visibility}),kqIsResultsView:()=>resultsView,
    document:{readyState:'complete',title:'Lựa chọn nhà thầu - EGP',body:{innerText:'Tìm kiếm nâng cao'},
      querySelectorAll(selector){if(selector==='input')return inputs;if(selector==='button,a,[role="button"],input[type="submit"]')return buttons;throw Error('Unexpected selector '+selector);}}});
  for(const name of ['bbmtPageError','kqNativePageError','kqUsableSearchControl','kqSearchButton','kqClickSearch','kqNativeSearchRoute','kqProbeState'])vm.runInContext(sourceFunction(name),context);
  return {context,inputs,buttons,probe:()=>context.kqProbeState()};
}
const readyForm={ok:true,busy:false,pageError:null,searchView:true,resultsView:false,ready:true};
function runtimeHarness({state={},known=[{id:7,url:EGP_SEARCH_PAGE}],probes={7:readyForm}}={}){
  const calls={query:0,probe:[],updates:[],created:[],waited:[],starts:[]};
  const runtime=createQueryRuntime({getState:async()=>({settings:{},...state}),cryptoApi:webcrypto,
    tabs:{query:async()=>{calls.query++;return known;},update:async(id,args)=>{calls.updates.push({id,args});return {id,...args};},
      create:async(args)=>{calls.created.push(args);return {id:99,...args};}},
    sendToTab:async(id,message)=>{if(message.type==='KQLCNT_PROBE'){calls.probe.push(id);return probes[id]??null;}calls.starts.push({id,message});return {ok:true};},
    waitForTab:async(...args)=>calls.waited.push(args),routeResults:async()=>({ok:true}),routeDone:async()=>({ok:true}),markCacheHit:async()=>{}});
  return {runtime,calls};
}

test('412 probe recognizes both observed native search placeholders without clicking or changing criteria',()=>{
  for(const placeholder of ['Áp dụng cho tất cả các trường thông tin','Nhập số TBMT/Tên gói thầu (ví dụ: IB0123456789 hoặc Mua sắm thiết bị)']){
    const input=control({placeholder,value:'Giữ nguyên'}),h=nativePage({inputs:[input]});
    assert.deepEqual({...h.probe()},readyForm);assert.equal(input.value,'Giữ nguyên');assert.equal(h.buttons[0].clicks,0);
  }
});

test('412 probe requires a native input and its visible usable search button, not header search alone',()=>{
  for(const change of [{inputs:[]},{inputs:[control({placeholder:'Tìm kiếm nhanh'})]},{buttons:[]}])assert.equal(nativePage(change).probe().ready,false);
  for(const property of [{offsetParent:null},{disabled:true},{fieldsetDisabled:true},{readOnly:true},{'aria-disabled':'true'},{visibility:'hidden'}]){
    assert.equal(nativePage({inputs:[control({placeholder:'Nhập số TBMT',...property})]}).probe().ready,false,JSON.stringify(property));
    assert.equal(nativePage({buttons:[control({innerText:'Tìm kiếm'}),control({innerText:'Tìm kiếm',...property})]}).probe().ready,false,JSON.stringify(property));
  }
  const hidden=control({innerText:'Tìm kiếm',offsetParent:null}),header=control({innerText:'Search'}),main=control({innerText:'Tìm kiếm'});
  const h=nativePage({buttons:[header,hidden,main]});assert.equal(h.probe().ready,true);assert.equal(h.context.kqClickSearch(),true);
  assert.equal(main.clicks,1);assert.equal(header.clicks,0);assert.equal(hidden.clicks,0);
});

test('412 a disabled main search never falls back to clicking the earlier header search',()=>{
  const header=control({innerText:'Tìm kiếm'}),main=control({innerText:'Tìm kiếm',disabled:true});
  const h=nativePage({buttons:[header,main]});assert.equal(h.probe().searchView,false);assert.equal(h.context.kqClickSearch(),false);
  assert.equal(header.clicks,0);assert.equal(main.clicks,0);
});

test('412 detail routes cannot masquerade as reusable forms or results even with matching header controls',()=>{
  const base='https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection';
  for(const url of [base+'?render=detail-v2',base+'?_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=detail-v2',
    base+'?render=search&id=undefined',base+'?render=search&notifyId=123',base+'?planId=PL1',base+'?bidOpenId=BB1',base+'?inputResultId=1',base+'?techReqId=2',
    base+'?_portlet_notifyId=1',base+'/detail',base.replace('muasamcong.mpi.gov.vn','example.test')]){
    const result=nativePage({url,resultsView:true}).probe();assert.equal(result.ready,false,url);assert.equal(result.searchView,false,url);assert.equal(result.resultsView,false,url);
  }
});

test('412 Liferay p_p_id identifies a reusable native results portlet rather than a procurement detail',()=>{
  const url='https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=search';
  const result=nativePage({url,inputs:[],buttons:[],resultsView:true}).probe();
  assert.equal(result.ready,true);assert.equal(result.resultsView,true);assert.equal(result.searchView,false);
  for(const suffix of ['&id=IB1','&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_notifyId=IB1'])assert.equal(nativePage({url:url+suffix,resultsView:true}).probe().ready,false);
});

test('412 probe refuses loading, busy and native-error pages while recognizing a normal results list',()=>{
  const results=nativePage({inputs:[],buttons:[],resultsView:true});assert.equal(results.probe().ready,true);assert.equal(results.probe().resultsView,true);assert.equal(results.probe().searchView,false);
  const loading=nativePage();loading.context.document.readyState='loading';assert.equal(loading.probe().ready,false);
  const busy=nativePage({resultsView:true});busy.context.kqPlan={id:'running'};assert.equal(busy.probe().busy,true);assert.equal(busy.probe().ready,false);
  for(const [title,body,code] of [['Error',"This page can't be displayed. The incident ID is N/A.",'ACCESS_DENIED'],['Lựa chọn nhà thầu','egp-portal-contractor-selection-v2 tạm thời không có.','PORTLET_UNAVAILABLE']]){
    const h=nativePage({resultsView:true});h.context.document.title=title;h.context.document.body.innerText=body;
    assert.equal(h.probe().ready,false);assert.equal(h.probe().pageError,code);
  }
});

test('412 acquire reuses a ready native form and dispatches the query without another navigation or document wait',async()=>{
  const {runtime,calls}=runtimeHarness();const tab=await runtime.acquire();assert.equal(tab.id,7);
  await runtime.dispatch(tab.id,{id:'form-ready',mode:'tbmt',queryIndex:0,pageSize:50,maxPages:2,query:{index:'es-contractor-selection',filters:[]}});
  assert.deepEqual(calls.updates,[]);assert.deepEqual(calls.waited,[]);assert.deepEqual(calls.created,[]);
  assert.equal(calls.starts.length,1);assert.equal(calls.starts[0].message.type,'KQLCNT_START');assert.equal(calls.starts[0].message.payload.maxPages,2);
});

test('412 acquire focuses an existing ready form or results tab only when requested, without URL update',async()=>{
  for(const response of [readyForm,{...readyForm,searchView:false,resultsView:true}]){
    const {runtime,calls}=runtimeHarness({probes:{7:response}});assert.equal((await runtime.acquire(true)).id,7);
    assert.deepEqual(calls.updates,[{id:7,args:{active:true}}]);assert.deepEqual(calls.waited,[]);assert.deepEqual(calls.created,[]);
  }
});

test('412 unready, error and old-protocol probes retain the canonical navigation and bounded wait fallback',async()=>{
  for(const response of [{ok:true,busy:false,resultsView:true},{...readyForm,ready:false},{...readyForm,ok:false},
    {...readyForm,searchView:false,resultsView:false},{...readyForm,pageError:'ACCESS_DENIED'}]){
    const {runtime,calls}=runtimeHarness({probes:{7:response}});assert.equal((await runtime.acquire()).id,7);
    assert.deepEqual(calls.updates,[{id:7,args:{url:EGP_SEARCH_PAGE,active:false}}]);assert.deepEqual(calls.waited,[[7,40000]]);
  }
});

test('412 busy and reserved tabs are not navigated or reused even when form-ready flags are present',async()=>{
  const known=[{id:7,url:EGP_SEARCH_PAGE},{id:8,url:EGP_SEARCH_PAGE},{id:9,url:EGP_SEARCH_PAGE}];
  for(const state of [{activeRun:{tabId:7,status:'RUNNING'}},{bidOpenScan:{status:'SCANNING',detailTabIds:[7]}}]){
    const {runtime,calls}=runtimeHarness({known,state,probes:{7:readyForm,8:{...readyForm,busy:true},9:readyForm}});
    assert.equal((await runtime.acquire()).id,9);assert.deepEqual(calls.probe,[8,9]);assert.deepEqual(calls.updates,[]);assert.deepEqual(calls.waited,[]);
  }
});

test('412 ready forms do not bypass a fresh read-only or structural RED gate',async()=>{
  for(const state of [{settings:{readOnlyMode:true}},{liveCanary:{status:'RED'}},{liveCanary:{status:'RUNNING',lastStructuralStatus:'RED'}},{schemaHealth:{status:'RED'}}]){
    const {runtime,calls}=runtimeHarness({state});await assert.rejects(runtime.acquire(),/khóa|ĐỎ/);
    assert.equal(calls.query,0);assert.deepEqual(calls.probe,[]);assert.deepEqual(calls.updates,[]);assert.deepEqual(calls.waited,[]);
  }
});
