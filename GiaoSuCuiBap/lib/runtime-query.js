import { createQueryCache, queryHash } from './query-cache.js';
import { EGP_SEARCH_PAGE } from './kqlcnt.js';
import { DEFAULT_SETTINGS } from './core.js';

/** Fresh safety/job state for native queries. Never deserialize the warehouse,
 * every historical scan snapshot or attachment data just to check a lock. */
export async function readQueryControlState(storage) {
  const state=await storage.get({settings:DEFAULT_SETTINGS,schemaHealth:null,liveCanary:null,
    activeRun:null,winnerLookup:null,planLookup:null,areaScan:null,investorScan:null,bidOpenScan:null});
  return {...state,settings:{...DEFAULT_SETTINGS,...state.settings}};
}

export const SCHEMA_STOP_MESSAGE='Đã dừng truy vấn: kiểm tra cấu trúc e-GP đang ĐỎ. Mở Chẩn đoán và chạy kiểm tra lại.';
export function schemaIsRed(state={}){
  const canary=state.liveCanary||{};
  return canary.status==='RED'||canary.lastStructuralStatus==='RED'||state.schemaHealth?.status==='RED';
}
export function activeListJob(state={},exceptId=''){
  return [state.activeRun,state.winnerLookup,state.planLookup,state.areaScan,state.investorScan,
    state.bidOpenScan?.status==='LISTING'?state.bidOpenScan:null].find(job=>job&&job.id!==exceptId&&['STARTING','OPENING','RUNNING','LISTING'].includes(job.status));
}

/** Owns one reusable native list tab. BBMT details use their own two-tab pool.
 * Native queries remain page-owned; this module owns lifecycle, cache replay
 * and isolated canary receipts, never an HTTP or CAPTCHA request. */
export function createQueryRuntime({getState,tabs,sendToTab,waitForTab,routeResults,routeDone,markCacheHit,cryptoApi=globalThis.crypto}){
  const cache=createQueryCache(), captures=new Map(), probes=new Map(),privateTabs=new Set();
  let idleTabId=null, acquiring=null,probePending=false;
  const tuple=(id,index=0)=>`${id}:${index}`;
  async function assertAllowed({probe=false}={}){
    const s=await getState();
    if(s.settings?.readOnlyMode)throw Error('Đang khóa chỉnh sửa và tự động hóa.');
    if(!probe&&schemaIsRed(s))throw Error(SCHEMA_STOP_MESSAGE);
    return s;
  }
  async function acquire(active=false,{probe=false}={}){
    await assertAllowed({probe});
    if(probes.size&&!probe)throw Error('Đang kiểm tra cấu trúc e-GP. Hãy chờ kiểm tra hoàn tất.');
    if(acquiring)return acquiring;
    acquiring=(async()=>{
      const s=await getState();
      const reserved=new Set([s.activeRun,s.winnerLookup,s.planLookup,s.areaScan,s.investorScan].filter(j=>j&&['STARTING','OPENING','RUNNING','LISTING'].includes(j.status)).map(j=>j.tabId).filter(Number.isInteger));
      if(s.bidOpenScan?.status==='LISTING'&&Number.isInteger(s.bidOpenScan.tabId))reserved.add(s.bidOpenScan.tabId);
      if(s.bidOpenScan?.status==='SCANNING')for(const id of s.bidOpenScan.detailTabIds||[])reserved.add(id);
      const known=await tabs.query({url:'https://muasamcong.mpi.gov.vn/*'});
      const candidates=known.filter(t=>!reserved.has(t.id)&&/contractor-selection/i.test(t.url||''));
      candidates.sort((a,b)=>(b.id===idleTabId?1:0)-(a.id===idleTabId?1:0));
      for(const tab of candidates){
        const probeResult=await sendToTab(tab.id,{type:'KQLCNT_PROBE'}).catch(()=>null);
        if(!probeResult||probeResult.busy)continue;
        idleTabId=tab.id;
        if(probe)privateTabs.add(tab.id);
        // A usable native form is already sufficient for kqStart's official
        // search click. Reloading it adds a redundant, failure-prone navigation.
        if(probeResult.ok===true&&probeResult.busy===false&&probeResult.ready===true&&!probeResult.pageError
          &&(probeResult.resultsView===true||probeResult.searchView===true)){
          if(active)await tabs.update(tab.id,{active:true});return tab;
        }
        const updated=await tabs.update(tab.id,{url:EGP_SEARCH_PAGE,active:Boolean(active)});await waitForTab(tab.id,40000);return updated;
      }
      // No available known tab: a busy canonical tab must finish first.
      if(idleTabId!==null&&reserved.has(idleTabId))throw Error('Tab danh sách e-GP đang bận. Hãy chờ lượt hiện tại hoàn tất.');
      const tab=await tabs.create({url:EGP_SEARCH_PAGE,active:Boolean(active)});idleTabId=tab.id;if(probe)privateTabs.add(tab.id);await waitForTab(tab.id,40000);return tab;
    })();
    try{return await acquiring;}finally{acquiring=null;}
  }
  async function dispatch(tabId,payload){
    await assertAllowed();
    if(probePending||probes.size)throw Error('Đang kiểm tra cấu trúc e-GP. Hãy chờ kiểm tra hoàn tất.');
    const key=await queryHash(payload,cryptoApi), hit=cache.get(key), id=tuple(payload.id,payload.queryIndex||0);
    if(hit){
      await markCacheHit(payload.id,{hit:true,hash:key,fetchedAt:new Date(hit.fetchedAt).toISOString(),expiresAt:new Date(hit.expiresAt).toISOString(),ageMs:hit.ageMs});
      const sender={tab:{id:tabId}};
      for(const page of hit.pages){
        await assertAllowed();
        const reply=await routeResults({...page,planId:payload.id,mode:payload.mode,queryIndex:payload.queryIndex||0},sender);
        if(reply?.ok===false)throw Error(reply.message||'Không khôi phục được trang cache.');
      }
      await routeDone({...hit.done,planId:payload.id,mode:payload.mode,queryIndex:payload.queryIndex||0},sender);
      return {ok:true,cached:true};
    }
    captures.set(id,{key,tabId,mode:payload.mode,pages:[],bytes:0,fetchedAt:Date.now()});
    while(captures.size>8)captures.delete(captures.keys().next().value);
    try{
      const res=await sendToTab(tabId,{type:'KQLCNT_START',payload});
      if(res?.ok===false)throw Error(res.message||'Tab e-GP đang chạy một lượt tra cứu khác.');
      return res;
    }catch(error){captures.delete(id);throw error;}
  }
  function captureResult(payload,sender){
    const cap=captures.get(tuple(payload.planId,payload.queryIndex||0));
    if(!cap||cap.tabId!==sender.tab?.id||cap.mode!==payload.mode)return;
    if(cap.pages.some(p=>p.pageIndex===payload.pageIndex&&p.done===payload.done))return;
    cap.bytes+=JSON.stringify(payload).length;
    if(cap.bytes>4_000_000){captures.delete(tuple(payload.planId,payload.queryIndex||0));return;}
    cap.pages.push(structuredClone(payload));
  }
  function captureDone(payload,sender){
    const id=tuple(payload.planId,payload.queryIndex||0),cap=captures.get(id);
    if(!cap||cap.tabId!==sender.tab?.id||cap.mode!==payload.mode)return;
    cache.put(cap.key,cap.pages,payload,{fetchedAt:cap.fetchedAt});captures.delete(id);
  }
  function stop({keepProbes=false}={}){captures.clear();cache.clear();if(!keepProbes)for(const probe of probes.values())probe.finish({status:'CANCELLED',complete:false,records:[],failureReason:SCHEMA_STOP_MESSAGE});}
  async function runProbe(query,{schema='tbmt',timeoutMs=45_000,maxPages=1}={}){
    const s=await assertAllowed({probe:true});
    if(activeListJob(s)||probes.size||probePending)return {status:'BUSY',records:[],complete:false,failureReason:'Đang có lượt truy vấn danh sách khác.'};
    probePending=true;
    let tab;
    try{tab=await acquire(false,{probe:true});}catch(error){privateTabs.clear();throw error;}finally{probePending=false;}
    const id=`canary-${cryptoApi.randomUUID()}`;
    return new Promise(resolve=>{
      const probe={id,tabId:tab.id,mode:schema==='khlcnt'?'khlcnt':'tbmt',pages:new Map(),totalElements:null,totalPages:null,terminal:null,
        finish(result){clearTimeout(probe.timer);probes.delete(id);privateTabs.delete(tab.id);resolve(result);}};
      probe.timer=setTimeout(()=>{void sendToTab(tab.id,{type:'KQLCNT_CANCEL',payload:{planId:id}}).catch(()=>{});probe.finish({status:'TIMEOUT',records:[...probe.pages.values()].flat(),complete:false,totalElements:probe.totalElements,totalPages:probe.totalPages,failureReason:'Kiểm tra e-GP quá thời gian.'});},Math.max(100,timeoutMs));
      probes.set(id,probe);
      void sendToTab(tab.id,{type:'KQLCNT_START',payload:{id,mode:probe.mode,query,queryIndex:0,pageSize:50,maxPages:Math.max(1,maxPages),label:'Kiểm tra cấu trúc e-GP'}}).then(r=>{if(r?.ok===false)throw Error(r.message);}).catch(e=>probe.finish({status:'ERROR',records:[],complete:false,failureReason:String(e.message||e)}));
    });
  }
  function routeProbe(type,payload,sender){
    if(!String(payload.planId||'').startsWith('canary-'))return null;
    const probe=probes.get(payload.planId);
    if(!probe||probe.tabId!==sender.tab?.id||probe.mode!==payload.mode||(payload.queryIndex??0)!==0)return {ok:false,message:'Không khớp lần kiểm tra e-GP.'};
    if(type==='KQLCNT_RESULTS'){
      if(payload.done)probe.terminal=payload;else probe.pages.set(payload.pageIndex,payload.records||[]);
      probe.totalElements=payload.totalElements;probe.totalPages=payload.totalPages;
    }else{
      const terminal=probe.terminal,records=[...probe.pages.values()].flat();
      const complete=Boolean(terminal&&!terminal.partial&&!terminal.capped&&!terminal.schemaIssue&&!terminal.cancelled&&payload.ok!==false&&probe.totalPages!==null&&probe.totalElements!==null&&probe.pages.size===Math.max(1,probe.totalPages)&&records.length===probe.totalElements);
      probe.finish({records,totalPages:probe.totalPages,totalElements:probe.totalElements,complete,status:terminal?.schemaIssue?'SCHEMA_ERROR':payload.ok===false?'ERROR':'OK',failureReason:payload.message||terminal?.failureReason||'',partial:!complete});
    }
    return {ok:true,probe:true};
  }
  return {acquire,dispatch,assertAllowed,runProbe,routeProbe,captureResult,captureDone,stop,cache,isBusy:()=>probePending||privateTabs.size>0,isProbeTab:id=>privateTabs.has(id)};
}
