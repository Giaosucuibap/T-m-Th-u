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
/* TAB E-GP MỞ SẴN (4.17.0)
 * Lượt tra cứu đầu tiên trong phiên mất thời gian chủ yếu ở việc MỞ trang e-GP:
 * tải trang, chạy ứng dụng, tự tải danh sách mặc định. Khi người dùng mở một
 * màn hình tra cứu, ta mở sẵn trang đó ở một tab nền trong lúc họ còn đang nhập
 * tiêu chí. Không gửi tiêu chí, không bấm gì — chỉ là trang e-GP người dùng vẫn
 * mở tay. Tab của người dùng KHÔNG bao giờ bị điều hướng ở bước này. */
export const WARM_MAX_AGE_MS=30*60_000;
export const WARM_READY_WAIT_MS=15_000;
export function createQueryRuntime({getState,tabs,sendToTab,waitForTab,routeResults,routeDone,markCacheHit,cryptoApi=globalThis.crypto,
  now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
  const cache=createQueryCache(), captures=new Map(), probes=new Map(),privateTabs=new Set();
  let idleTabId=null, acquiring=null,probePending=false,warm=null,warming=null;
  const tuple=(id,index=0)=>`${id}:${index}`;
  async function assertAllowed({probe=false}={}){
    const s=await getState();
    if(s.settings?.readOnlyMode)throw Error('Đang khóa chỉnh sửa và tự động hóa.');
    if(!probe&&schemaIsRed(s))throw Error(SCHEMA_STOP_MESSAGE);
    return s;
  }
  // Thời gian mở/chuẩn bị tab cho lượt gần nhất của mỗi tab — cho sổ giai đoạn.
  const openTimes=new Map();
  async function acquire(active=false,opts={}){
    const t0=now(),wasWarm=warm!==null;
    const tab=await acquireTab(active,opts);
    if(tab&&Number.isInteger(tab.id)){openTimes.set(tab.id,{ms:now()-t0,warm:wasWarm&&warm?.tabId===tab.id});while(openTimes.size>20)openTimes.delete(openTimes.keys().next().value);}
    return tab;
  }
  function takeOpenTime(tabId){const v=openTimes.get(tabId)||null;openTimes.delete(tabId);return v;}
  async function acquireTab(active=false,{probe=false}={}){
    await assertAllowed({probe});
    if(probes.size&&!probe)throw Error('Đang kiểm tra cấu trúc e-GP. Hãy chờ kiểm tra hoàn tất.');
    if(acquiring)return acquiring;
    acquiring=(async()=>{
      // Tab mở sẵn đang được tạo/đang tải: chờ nó, đừng mở thêm tab thứ hai.
      if(warming)await warming.catch(()=>{});
      if(warm?.loading)await warm.loading;
      const s=await getState();
      const reserved=new Set([s.activeRun,s.winnerLookup,s.planLookup,s.areaScan,s.investorScan].filter(j=>j&&['STARTING','OPENING','RUNNING','LISTING'].includes(j.status)).map(j=>j.tabId).filter(Number.isInteger));
      if(s.bidOpenScan?.status==='LISTING'&&Number.isInteger(s.bidOpenScan.tabId))reserved.add(s.bidOpenScan.tabId);
      if(s.bidOpenScan?.status==='SCANNING')for(const id of s.bidOpenScan.detailTabIds||[])reserved.add(id);
      const known=await tabs.query({url:'https://muasamcong.mpi.gov.vn/*'});
      const candidates=known.filter(t=>!reserved.has(t.id)&&/contractor-selection/i.test(t.url||''));
      candidates.sort((a,b)=>(b.id===idleTabId?1:0)-(a.id===idleTabId?1:0));
      for(const tab of candidates){
        let probeResult=await sendToTab(tab.id,{type:'KQLCNT_PROBE'}).catch(()=>null);
        // Tab mở sẵn có thể vừa tải xong mà ứng dụng e-GP chưa vẽ xong ô tìm kiếm.
        // Chờ nó sẵn sàng thay vì tải lại — tải lại là bỏ phí đúng thứ ta mở sẵn.
        if(warm?.tabId===tab.id)for(const until=now()+WARM_READY_WAIT_MS;now()<until&&!probeResult?.busy&&!probeResult?.ready&&!probeResult?.pageError;){
          await sleep(400);probeResult=await sendToTab(tab.id,{type:'KQLCNT_PROBE'}).catch(()=>null);
        }
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
  /** Mở sẵn trang tra cứu e-GP ở tab nền. Không bao giờ ném lỗi: đây chỉ là
   * tăng tốc, hỏng thì lượt tra cứu tự mở tab như cũ. */
  async function prewarm(){
    if(warming)return {ok:true,warmed:false,reason:'warming'};
    warming=(async()=>{
      let s;
      try{s=await assertAllowed();}catch(error){return {ok:true,warmed:false,reason:'blocked',message:String(error?.message||error)};}
      if(s.settings?.keepEgpTabWarm===false)return {ok:true,warmed:false,reason:'off'};
      if(acquiring||probePending||probes.size||activeListJob(s))return {ok:true,warmed:false,reason:'busy'};
      const known=(await tabs.query({url:'https://muasamcong.mpi.gov.vn/*'})).filter(t=>/contractor-selection/i.test(t.url||''));
      const own=warm&&known.find(t=>t.id===warm.tabId);
      if(own){
        // Trang để quá lâu có thể đã cũ; làm mới khi KHÔNG ai đang xem/dùng nó.
        if(now()-warm.openedAt<WARM_MAX_AGE_MS||own.active)return {ok:true,warmed:false,reason:'warm',tabId:own.id};
        const probe=await sendToTab(own.id,{type:'KQLCNT_PROBE'}).catch(()=>null);
        if(probe?.busy)return {ok:true,warmed:false,reason:'busy',tabId:own.id};
        await tabs.update(own.id,{url:EGP_SEARCH_PAGE});
        warm={tabId:own.id,openedAt:now(),loading:waitForTab(own.id,40000).catch(()=>null)};
        return {ok:true,warmed:true,refreshed:true,tabId:own.id};
      }
      warm=null;
      // Người dùng đã có trang tra cứu e-GP: lượt tra cứu sẽ dùng lại nó.
      if(known.length)return {ok:true,warmed:false,reason:'user-tab',tabId:known[0].id};
      const tab=await tabs.create({url:EGP_SEARCH_PAGE,active:false});
      // Chrome hay "ngủ" tab nền khi thiếu RAM — tab ngủ thì mở sẵn cũng vô ích.
      await Promise.resolve(tabs.update(tab.id,{autoDiscardable:false})).catch(()=>{});
      idleTabId=tab.id;
      warm={tabId:tab.id,openedAt:now(),loading:waitForTab(tab.id,40000).catch(()=>null)};
      return {ok:true,warmed:true,tabId:tab.id};
    })();
    try{return await warming;}
    catch(error){return {ok:true,warmed:false,reason:'error',message:String(error?.message||error)};}
    finally{warming=null;}
  }
  /** Tự chạy lại MỘT truy vấn vừa hỏng trước trang đầu: tải lại trang tra cứu
   * trong đúng tab đó, chờ e-GP sẵn sàng, rồi gửi lại ĐÚNG tiêu chí cũ. */
  const dispatched=new Map();
  async function redispatch(planId,queryIndex=0){
    const entry=dispatched.get(tuple(planId,queryIndex));
    if(!entry)throw Error('Không còn tiêu chí của lượt vừa rồi để tự chạy lại.');
    await assertAllowed();
    if(probePending||probes.size)throw Error('Đang kiểm tra cấu trúc e-GP. Hãy chờ kiểm tra hoàn tất.');
    await tabs.update(entry.tabId,{url:EGP_SEARCH_PAGE});
    await waitForTab(entry.tabId,40000);
    let probe=null;
    for(const until=now()+WARM_READY_WAIT_MS;now()<until;){
      probe=await sendToTab(entry.tabId,{type:'KQLCNT_PROBE'}).catch(()=>null);
      if(probe?.ready||probe?.busy||probe?.pageError)break;
      await sleep(400);
    }
    if(probe?.pageError)throw Error('Trang e-GP báo lỗi khi tải lại; chưa có dữ liệu để kết luận.');
    if(probe?.busy)throw Error('Tab e-GP đang bận một lượt khác.');
    return dispatch(entry.tabId,{...entry.payload,autoRetry:1});
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
      await routeDone({...hit.done,planId:payload.id,mode:payload.mode,queryIndex:payload.queryIndex||0,fromCache:true},sender);
      return {ok:true,cached:true};
    }
    dispatched.set(id,{tabId,payload:structuredClone(payload)});
    while(dispatched.size>8)dispatched.delete(dispatched.keys().next().value);
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
  return {acquire,takeOpenTime,prewarm,redispatch,warmTabId:()=>warm?.tabId??null,dispatch,assertAllowed,runProbe,routeProbe,captureResult,captureDone,stop,cache,isBusy:()=>probePending||privateTabs.size>0,isProbeTab:id=>privateTabs.has(id)};
}
