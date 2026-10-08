const ORIGIN='https://muasamcong.mpi.gov.vn';
export function samePlanDetailUrl(plan,url){
  try{
    const page=new URL(url);
    return page.origin===ORIGIN&&page.pathname.endsWith('/contractor-selection')&&
      page.searchParams.get('id')===plan.sourceId&&page.searchParams.get('planNo')===plan.planNo&&
      page.searchParams.get('type')==='es-plan-project-p';
  }catch{return false;}
}

/** Read the site's own detail response by normal navigation. No HTTP replay.
 * Two owned tabs, a bounded wait and identity-bound cache keep the native list
 * tab intact. A timeout gets one retry after the other queued plans;
 * cancellation never affects a tab opened by the user. */
export function createPlanDetailReader({tabs,timeoutMs=30000,now=Date.now}={}){
  const waiters=new Map(),cache=new Map();let active=null;
  const keyOf=plan=>`${plan.sourceId}:${plan.key}`;
  function cancel(id){
    if(!active||id&&id!==active.id)return false;
    active.cancelled=true;
    for(const waiter of waiters.values())waiter.finish({ok:false,cancelled:true,message:'Đã dừng đọc chi tiết kế hoạch.'});
    return true;
  }
  function accept(payload,tabId,senderUrl){
    const waiter=waiters.get(tabId);
    if(!waiter||active!==waiter.job||active.cancelled)return {ok:true,ignored:true};
    if(!samePlanDetailUrl(waiter.plan,payload.url)||!samePlanDetailUrl(waiter.plan,senderUrl))return {ok:false,ignored:true};
    if(payload.status!==200||payload.header?.id!==waiter.plan.sourceId||payload.header?.planNo!==waiter.plan.planNo||String(payload.header?.planVersion).padStart(2,'0')!==waiter.plan.version)return {ok:false,ignored:true};
    waiter.finish({ok:true,receipt:payload});return {ok:true};
  }
  async function read(job,tabId,plan){
    const cached=cache.get(keyOf(plan));
    if(cached&&now()-cached.at<30*60*1000)return {ok:true,receipt:cached.receipt,fromCache:true};
    if(!samePlanDetailUrl(plan,plan.detailUrl))return {ok:false,message:'Thiếu liên kết chi tiết đúng mã kế hoạch.'};
    return new Promise(resolve=>{
      const waiter={job,plan,finish(result){
        if(waiters.get(tabId)!==waiter)return;
        clearTimeout(timer);waiters.delete(tabId);resolve(result);
      }};
      const timer=setTimeout(()=>waiter.finish({ok:false,retryable:true,message:'Chưa nhận được chi tiết kế hoạch trong 30 giây.'}),timeoutMs);
      waiters.set(tabId,waiter);
      Promise.resolve().then(()=>tabs.update(tabId,{url:plan.detailUrl,active:false})).catch(error=>waiter.finish({ok:false,message:String(error?.message||error)}));
    });
  }
  async function run(id,plans,onResult){
    if(active)return {ok:false,message:'Đang đọc chi tiết của lượt kế hoạch khác.'};
    const job={id,cancelled:false,tabIds:[]},queue=plans.map(plan=>({plan,attempt:0}));
    active=job;let cursor=0,readCount=0,failedCount=0;
    try{
      const workers=Array.from({length:Math.min(2,plans.length)},async()=>{
        const tab=await tabs.create({url:'about:blank',active:false});job.tabIds.push(tab.id);
        while(active===job&&!job.cancelled&&cursor<queue.length){
          const {plan,attempt}=queue[cursor++],result=await read(job,tab.id,plan);
          if(job.cancelled||active!==job)break;
          if(!result.ok&&result.retryable===true&&attempt===0){
            queue.push({plan,attempt:1});
            continue;
          }
          const applied=await onResult(plan,result);
          if(result.ok&&applied?.ok!==false){
            readCount++;
            cache.set(keyOf(plan),{receipt:result.receipt,at:now()});
            if(cache.size>500)cache.delete(cache.keys().next().value);
          }else failedCount++;
        }
      }).map(worker=>worker.catch(error=>{cancel(id);throw error;}));
      const outcomes=await Promise.allSettled(workers);
      const failure=outcomes.find(result=>result.status==='rejected');
      if(failure)throw failure.reason;
      return {ok:!job.cancelled,cancelled:job.cancelled,readCount,failedCount};
    }catch(error){cancel(id);return {ok:false,cancelled:job.cancelled,readCount,failedCount,message:String(error?.message||error)};}
    finally{
      for(const tabId of job.tabIds)await tabs.remove(tabId).catch(()=>{});
      if(active===job)active=null;
    }
  }
  return {run,accept,cancel,ownsTab:id=>active?.tabIds.includes(id)||false,isRunning:()=>Boolean(active)};
}
