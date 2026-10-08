(() => {
  const PAGE_SOURCE='BID_RADAR_ONE_PAGE';
  const CONTENT_SOURCE='BID_RADAR_ONE_CONTENT';
  // Navigation arrival is distinct from a usable DOM. The reader can now
  // distinguish a slow download from an e-GP page that loaded an error portlet.
  chrome.runtime.sendMessage({type:'CONTENT_READY',payload:{url:location.href,phase:'document-start',pageError:null}}).catch(()=>{});
  function postPage(type,payload){ window.postMessage({source:CONTENT_SOURCE,type,payload,v:440},location.origin); }
  function clean(v){ return String(v ?? '').replace(/\s+/g,' ').trim(); }
  function extractObjects(value,max=750){
    const keys=new Set(['notifyNo','notify_no','tbmtNo','bidNo','bidName','notifyName','packageName','publicDate','investorName','procuringEntityName','bidPrice','notifyVersion','investField','closeDate','bidCloseDate','projectName']);
    const ids=new Set(['notifyNo','notify_no','tbmtNo','bidNo','bidName','notifyName','packageName']);
    const out=[]; const seen=new WeakSet(); let nodes=0;
    function walk(v,d){
      if(out.length>=max||nodes>15000||d>12||v==null)return; nodes++;
      if(Array.isArray(v)){for(const x of v)walk(x,d+1);return;}
      if(typeof v!=='object')return;if(seen.has(v))return;seen.add(v);
      const ks=Object.keys(v);if(ks.some(k=>keys.has(k))&&ks.some(k=>ids.has(k)))out.push(v);
      for(const x of Object.values(v))walk(x,d+1);
    }
    walk(value,0);return out;
  }
  function scanDom(){
    const out=[]; const seen=new Set();
    const nodes=[...document.querySelectorAll('a[href],tr,article,li,[class*="card"],[class*="item"]')];
    for(const node of nodes.slice(0,4000)){
      const href=node.tagName==='A'?node.href:(node.querySelector?.('a[href*="notifyNo="],a[href*="tbmt"],a[href*="web/guest"]')?.href||'');
      const rawText=String(node.innerText||node.textContent||'').slice(0,12000);
      const text=clean(rawText).slice(0,5000);
      const source=`${href} ${text}`;
      const m=source.match(/\bIB\d{6,}\b/i); if(!m)continue;
      const notifyNo=m[0].toUpperCase(); if(seen.has(notifyNo+href))continue; seen.add(notifyNo+href);
      const lines=rawText.split(/\n|\r/).map(clean).filter(Boolean);
      const bidName=lines.find(x=>x.length>12&&!/^(IB\d+|Mã TBMT|Ngày đăng|Chi tiết)$/i.test(x))||notifyNo;
      out.push({notifyNo,bidName,detailUrl:href||location.href,rawText:text});
    }
    return out;
  }
  function collectDomLinks(){
    const map={};
    for(const a of document.querySelectorAll('a[href]')){
      let h=''; try{h=a.href;}catch{}
      if(!/^https?:\/\/muasamcong\.mpi\.gov\.vn\//i.test(h))continue;
      if(/\/web\/guest(\/home)?\/?$/i.test(h))continue;
      const m=clean((a.textContent||'')+' '+h).match(/\bIB\d{6,}\b/i);
      if(m){const no=m[0].toUpperCase(); if(!map[no])map[no]=h;}
    }
    return map;
  }
  function showOverlay(text,kind='info'){
    let el=document.getElementById('__bid_radar_overlay');
    if(!el){el=document.createElement('div');el.id='__bid_radar_overlay';Object.assign(el.style,{position:'fixed',right:'16px',bottom:'16px',zIndex:'2147483647',maxWidth:'420px',padding:'12px 14px',borderRadius:'12px',font:'600 14px system-ui',boxShadow:'0 8px 30px rgba(0,0,0,.25)'});document.documentElement.appendChild(el);}
    el.style.background=kind==='error'?'#fee2e2':kind==='success'?'#dcfce7':'#e0f2fe';el.style.color='#0f172a';el.textContent=text;
    if(kind==='success')setTimeout(()=>el.remove(),5000);
  }
  async function sendRecords(records,meta={}){
    if(!records?.length)return {newCount:0};
    return chrome.runtime.sendMessage({type:'INGEST_CAPTURE',payload:{records,meta:{sourcePageUrl:location.href,capturedAt:new Date().toISOString(),...meta}}});
  }

  window.addEventListener('message',async event=>{
    if(event.source!==window||event.data?.source!==PAGE_SOURCE)return;
    const {type,payload}=event.data;
    if(type==='NETWORK_CAPTURE'){
      const records=extractObjects(payload.data);
      if(records.length){
        const meta={requestUrl:payload.request?.url||payload.responseUrl||'',captureType:'network',request:payload.request,status:payload.status,page:payload.page,total:payload.total,totalPages:payload.totalPages,domLinks:collectDomLinks()};
        await sendRecords(records,meta);
        chrome.runtime.sendMessage({type:'OBSERVED_TEMPLATE',payload:{request:payload.request,sourcePageUrl:location.href,candidateCount:records.length}}).catch(()=>{});
      }
    }
  });

  chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
    if(message.type==='PING'){sendResponse({ok:true,url:location.href});return;}
    if(message.type==='SCAN_CURRENT_PAGE'){
      (async()=>{const dom=scanDom();const result=await sendRecords(dom,{captureType:'dom-manual'});sendResponse({ok:true,found:dom.length,result});})();return true;
    }
  });

  // --- Tự tìm gói thầu theo mã TBMT khi mở link "Mở nguồn e-GP" (?brFind=IB...) ---
  function findSearchInput(){
    const inputs=[...document.querySelectorAll('input')];
    return inputs.find(i=>/kh(o|ó)a|tbmt|ib0|g(o|ó)i th(a|ầ)u/i.test(`${i.placeholder||''} ${i.getAttribute('aria-label')||''} ${i.name||''}`) && i.offsetParent!==null)
      || inputs.find(i=>((i.type||'text').toLowerCase()==='text'||(i.type||'').toLowerCase()==='search') && i.offsetParent!==null);
  }
  function findSearchButton(){
    const els=[...document.querySelectorAll('button,a,[role="button"],input[type="submit"]')];
    return els.find(el=>/^\s*(t(ì|i)m ki(ế|e)m|search)\s*$/i.test(clean(el.innerText||el.value||el.getAttribute('aria-label')||'')));
  }
  function setNativeValue(el,value){
    try{
      const proto=Object.getPrototypeOf(el);
      const desc=Object.getOwnPropertyDescriptor(proto,'value')||Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
      if(desc&&desc.set)desc.set.call(el,value); else el.value=value;
    }catch{ el.value=value; }
  }
  function autoSearchFromUrl(){
    let code='';
    try{ code=new URL(location.href).searchParams.get('brFind')||''; }catch{}
    if(!code) return;
    let tries=0, done=false;
    const timer=setInterval(()=>{
      tries++;
      const input=findSearchInput();
      if(input){
        setNativeValue(input,code);
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
        input.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'Enter'}));
        const btn=findSearchButton();
        if(btn){ try{btn.click();}catch{} done=true; clearInterval(timer); showOverlay(`Giáo Sư Cùi Bắp đang mở gói ${code} trên e-GP...`,'success'); }
      }
      if(tries>40){ clearInterval(timer); if(!done)showOverlay(`Đã mở e-GP. Bấm "Tìm kiếm" để hiện gói ${code}.`); }
    },500);
  }
  if(/[?&]brFind=/.test(location.search)) setTimeout(autoSearchFromUrl,1200);

  /* ======================================================================
   *  TRA CỨU KẾT QUẢ LỰA CHỌN NHÀ THẦU (KQLCNT)
   *
   *  Toàn bộ lượt tra cứu chạy BẰNG CHÍNH GIAO DIỆN e-GP: tiện ích bấm nút
   *  "Tìm kiếm" và các nút chuyển trang thật của e-GP, để mỗi truy vấn đều
   *  do trang tự phát kèm token hợp lệ của nó. page-hook.js chỉ thay phần
   *  TIÊU CHÍ trong thân request để máy chủ lọc sẵn theo mã số thuế.
   *
   *  Nút "Tìm kiếm" của e-GP làm trang điều hướng lại, nên tiến trình được
   *  ghi vào sessionStorage để chạy tiếp sau khi trang tải xong.
   * ==================================================================== */
  const KQ_STATE_KEY='__bidRadarKqlcntPlan';
  const KQ_PAGE_PAUSE=900;          // nghỉ giữa hai lần chuyển trang (ms)
  /* Hạn chờ e-GP trả một trang SAU KHI yêu cầu đã chắc chắn rời trình duyệt.
     Trước đây 25 giây tính từ lúc thao tác — gồm cả thời gian e-GP bận với
     danh sách mặc định, nên hết hạn trong khi yêu cầu thật còn chưa được gửi. */
  const KQ_RESPONSE_TIMEOUT=45000;
  /* Sau một thao tác, chờ tối đa chừng này để thấy yêu cầu MANG TIÊU CHÍ rời
     trình duyệt. Không thấy là thao tác đã bị trang bỏ qua — làm lại ngay. */
  const KQ_SENT_TIMEOUT=5000;
  /* Chờ trang e-GP xong yêu cầu nó tự phát (danh sách mặc định khi mở trang). */
  const KQ_IDLE_TIMEOUT=40000;
  const KQ_TRIGGER_ATTEMPTS=4;
  // Rớt kết nối ở trang đầu: gửi lại tối đa 2 lần, chờ 0,8 s rồi 1,6 s.
  const KQ_NET_RESENDS=2, KQ_NET_BACKOFF=800;
  const KQ_ACK_TIMEOUT=15000;      // hạn chờ worker xác nhận một lần giao dữ liệu

  let kqPlan=null;
  let kqPageWaiter=null;
  let kqSentWaiter=null;      // chờ tín hiệu "yêu cầu đã rời trình duyệt"
  let kqRejected=null;        // lý do e-GP gửi yêu cầu mà không gắn được tiêu chí
  let egpInFlight=0;          // số yêu cầu tìm kiếm e-GP đang chờ phản hồi
  /* Trang e-GP ĐANG MỞ theo yêu cầu mang tiêu chí gần nhất. Giao diện e-GP đổi
     trang hiện hành ngay khi bấm, kể cả khi yêu cầu sau đó rớt — nên không suy
     ra được từ dữ liệu đã nhận, phải lấy từ yêu cầu thật sự đã gửi. */
  let kqUiPage=null;
  const egpIdleWaiters=new Set();
  let kqCancelled=false;   // người dùng bấm "Dừng" giữa chừng

  const KQ_STATE_TTL=10*60*1000;   // tiến trình cũ hơn 10 phút coi như đã bỏ dở

  function kqLoadState(){
    try{
      const saved=JSON.parse(sessionStorage.getItem(KQ_STATE_KEY)||'null');
      if(!saved)return null;
      // Người dùng có thể đã đóng tiện ích giữa chừng; đừng hồi sinh lượt tra cũ.
      if(Date.now()-Number(saved.savedAt||0)>KQ_STATE_TTL){ kqSaveState(null); return null; }
      return saved;
    }catch{ return null; }
  }
  function kqSaveState(state){
    try{
      if(state)sessionStorage.setItem(KQ_STATE_KEY,JSON.stringify({...state,savedAt:Date.now()}));
      else sessionStorage.removeItem(KQ_STATE_KEY);
    }catch{}
  }
  function kqReport(message,kind='info'){ showOverlay(`🏢 ${message}`,kind); }
  async function kqSend(type,payload,{requireAck=false,attempts=3}={}){
    let lastMessage='Không liên lạc được service worker.';
    const deliveryPlan=payload?.planId&&kqPlan?.id===payload.planId?kqPlan:null;
    for(let attempt=1;attempt<=attempts;attempt++){
      if(type==='KQLCNT_RESULTS'&&(!deliveryPlan||(payload.queryIndex??0)!==(deliveryPlan.queryIndex??0))){
        return {ok:false,cancelled:true,message:'Trang dữ liệu không thuộc lượt tra cứu đang chạy.'};
      }
      if(deliveryPlan&&(kqPlan!==deliveryPlan||(kqCancelled&&type==='KQLCNT_RESULTS'&&!payload.done))){
        return {ok:false,cancelled:true,message:'Lượt tra cứu đã dừng hoặc được thay thế; không gửi lại trang dữ liệu cũ.'};
      }
      let timer;
      try{
        // A message port can stay open while its worker handler never replies.
        // Bound each attempt; background coalesces repeated page transactions
        // so retrying an uncertain acknowledgement cannot count a page twice.
        const response=await Promise.race([
          Promise.resolve().then(()=>chrome.runtime.sendMessage({type,payload})),
          new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Hết thời gian chờ tiện ích xác nhận dữ liệu.')),KQ_ACK_TIMEOUT);})
        ]);
        if(!requireAck||response?.ok===true)return response||{ok:true};
        lastMessage=response?.message||'Service worker chưa xác nhận dữ liệu.';
      }catch(error){ lastMessage=String(error?.message||error||lastMessage); }
      finally{clearTimeout(timer);}
      if(attempt<attempts)await new Promise(r=>setTimeout(r,250*attempt));
    }
    return {ok:false,message:lastMessage};
  }

  /* --- Điều khiển biểu mẫu tìm kiếm nâng cao của e-GP -------------------- */

  const fire=(el,types)=>types.forEach(t=>el.dispatchEvent(new MouseEvent(t,{bubbles:true})));

  /** Ô ant-select đang hiển thị nội dung khớp `probe`. */
  function kqFindSelect(probe){
    return [...document.querySelectorAll('.ant-select')].find(el=>probe.test(el.textContent||''))||null;
  }

  /** Bỏ dấu để so khớp tên địa bàn không phụ thuộc cách gõ. */
  function fold(v){
    return clean(v).normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
  }

  /**
   * Chọn một mục trong ô ant-select. Trả về NHÃN THẬT đã chọn, hoặc null.
   *
   * Người dùng thường gõ thiếu tiền tố hoặc sai dấu — "Đức trọng" thay vì
   * "Xã Đức Trọng". Nếu chỉ so khớp tuyệt đối thì tiêu chí bị bỏ qua và kết
   * quả trả về rộng hơn hẳn mong đợi. Nên dò theo bốn mức, chặt trước lỏng sau,
   * và luôn trả về nhãn thật để giao diện nói rõ đã chọn cái gì.
   */
  async function kqPickOption(box,label){
    if(!box)return null;
    const want=clean(label);
    if(!want)return '';
    const trigger=box.querySelector('.ant-select-selection');
    if(!trigger)return null;
    fire(trigger,['mousedown','mouseup','click']);
    await new Promise(r=>setTimeout(r,900));

    // e-GP đẩy mọi dropdown ra cuối <body>; chỉ xét cái đang mở.
    const menus=[...document.querySelectorAll('.ant-select-dropdown')].filter(d=>d.style.display!=='none');
    const scope=menus.length?menus[menus.length-1]:document;
    const items=[...scope.querySelectorAll('.ant-select-dropdown-menu-item,li')]
      .filter(li=>clean(li.textContent));
    const w=fold(want);
    // Bỏ tiền tố hành chính để "Đức Trọng" khớp được "Xã Đức Trọng".
    const bare=s=>fold(s).replace(/^(xa|phuong|thi tran|tinh|thanh pho|quan|huyen)\s+/,'');
    const wb=bare(want);

    const item=items.find(li=>clean(li.textContent)===want)
      ||items.find(li=>fold(li.textContent)===w)
      ||items.find(li=>bare(li.textContent)===wb)
      ||items.find(li=>bare(li.textContent).startsWith(wb));
    if(!item){ fire(trigger,['mousedown','mouseup','click']); return null; }
    const picked=clean(item.textContent);
    fire(item,['mousedown','mouseup','click']);
    await new Promise(r=>setTimeout(r,700));
    return picked;
  }

  /** Chọn loại thông báo (TBMT / KQLCNT / KHLCNT / Biên bản mở thầu…). */
  async function kqSelectNoticeType(label='Kết quả lựa chọn nhà thầu'){
    const box=kqFindSelect(/Thông báo mời thầu|Kết quả lựa chọn nhà thầu|Kế hoạch lựa chọn nhà thầu|Biên bản mở thầu/);
    if(!box)return false;
    if(clean(box.textContent).includes(clean(label)))return true;
    return kqPickOption(box,label);
  }

  /** Điền một ô input theo placeholder, đúng cách Vue nhận giá trị. */
  function kqFillInput(probe,value){
    const el=[...document.querySelectorAll('input')].find(i=>probe.test(i.placeholder||'')&&i.offsetParent!==null);
    if(!el)return null;
    setNativeValue(el,value);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return el;
  }

  /**
   * Áp dụng bộ tiêu chí lên biểu mẫu e-GP rồi để CHÍNH e-GP dựng truy vấn.
   * Cách này giữ nguyên mọi quy tắc của hệ thống — quan trọng nhất là việc
   * một tỉnh sau sáp nhập có nhiều mã địa bàn (mã mới + mã cũ).
   */
  async function kqApplyForm(form){
    const done={};
    if(form.noticeType)done.noticeType=await kqSelectNoticeType(form.noticeType);

    if(form.investor){
      const el=kqFillInput(/CĐT|chủ đầu tư/i,form.investor);
      if(el){
        // Nút "+" bên cạnh biến ô nhập thành tiêu chí thực sự.
        const plus=el.closest('.content__body__session__desc__select');
        const btn=plus&&plus.querySelector('button.filter__modal__keyword__btn');
        if(btn){ btn.click(); await new Promise(r=>setTimeout(r,500)); }
        done.investor=true;
      }
    }

    if(form.keyword)done.keyword=Boolean(kqFillInput(/Áp dụng cho tất cả các trường/i,form.keyword));

    // Khoảng giá gói thầu. e-GP dựng thành bộ lọc
    // {fieldName:'bidPrice',searchType:'range',from,to} — đã đối chiếu request thật.
    // Biểu mẫu KHLCNT có HAI cặp Từ/Đến (giá gói thầu và tổng mức đầu tư);
    // cặp ĐẦU luôn là giá gói thầu nên chỉ lấy hai ô đầu tiên.
    if(form.minPrice||form.maxPrice){
      const pair=[...document.querySelectorAll('input')]
        .filter(i=>/^(Từ|Đến)$/.test(clean(i.placeholder))&&i.offsetParent!==null).slice(0,2);
      if(pair.length===2){
        if(form.minPrice){setNativeValue(pair[0],String(form.minPrice));
          pair[0].dispatchEvent(new Event('input',{bubbles:true}));pair[0].dispatchEvent(new Event('change',{bubbles:true}));}
        if(form.maxPrice){setNativeValue(pair[1],String(form.maxPrice));
          pair[1].dispatchEvent(new Event('input',{bubbles:true}));pair[1].dispatchEvent(new Event('change',{bubbles:true}));}
        done.price=true;
        await new Promise(r=>setTimeout(r,300));
      }else done.price=false;
    }

    // Tỉnh phải chọn trước thì ô Xã/Phường mới được bật.
    if(form.province){
      done.province=await kqPickOption(kqFindSelect(/Tỉnh\/ Thành phố/),form.province);
      await new Promise(r=>setTimeout(r,600));
    }
    if(form.ward)done.ward=await kqPickOption(kqFindSelect(/Xã\/ Phường/),form.ward);

    return done;
  }

  /**
   * Từ khoá gieo tạm vào biểu mẫu trước khi bấm "Tìm kiếm".
   *
   * VÌ SAO CẦN: đã kiểm chứng trên e-GP thật — bấm "Tìm kiếm" khi biểu mẫu
   * TRỐNG thì e-GP nạp lại đúng biểu mẫu đó và KHÔNG mở màn hình kết quả (không
   * có `.el-pagination`). Nhập một tiêu chí bất kỳ rồi bấm thì màn hình kết quả
   * hiện ra bình thường.
   *
   * Đây chính là lỗi làm ba tính năng tra cứu trả về rỗng: chúng tự dựng truy
   * vấn nên cố tình không điền biểu mẫu, thành ra bấm "Tìm kiếm" trên biểu mẫu
   * trống rồi chờ mãi một màn hình kết quả không bao giờ tới.
   *
   * Từ khoá này KHÔNG ảnh hưởng số liệu: page-hook.js thay TOÀN BỘ khối `query`
   * trước khi request rời trình duyệt, nên kết quả thu được luôn là của truy vấn
   * do phần mềm dựng.
   */
  const KQ_SEED_KEYWORD='gói thầu';

  function kqSeedCriterion(){
    return Boolean(
      kqFillInput(/Áp dụng cho tất cả các trường/i,KQ_SEED_KEYWORD)||
      kqFillInput(/Nhập số TBMT/i,KQ_SEED_KEYWORD));
  }

  /** Nhãn thật e-GP đã chọn khác với chữ người dùng gõ? */
  function kqPickedDiffers(typed,picked){
    return Boolean(typed)&&typeof picked==='string'&&picked&&clean(typed)!==picked;
  }

  /**
   * Bấm nút "Tìm kiếm" của biểu mẫu tìm kiếm nâng cao.
   * Trang e-GP có nhiều nút cùng nhãn (ô tìm nhanh ở đầu trang và nút gửi của
   * biểu mẫu nâng cao); nút của biểu mẫu là nút CUỐI trong DOM.
   */
  function kqUsableSearchControl(el){
    return Boolean(el&&el.offsetParent!==null&&!el.disabled&&!el.readOnly
      &&el.getAttribute('aria-disabled')!=='true'&&!el.matches(':disabled')
      &&getComputedStyle(el).visibility!=='hidden');
  }
  function kqSearchButton(){
    const buttons=[...document.querySelectorAll('button,a,[role="button"],input[type="submit"]')]
      .filter(el=>/^\s*(t(ì|i)m ki(ế|e)m|search)\s*$/i.test(clean(el.innerText||el.value||el.getAttribute('aria-label')||'')));
    const target=buttons[buttons.length-1];
    return kqUsableSearchControl(target)?target:null;
  }
  function kqClickSearch(){
    const target=kqSearchButton();
    if(!target)return false;
    try{ target.click(); return true; }catch{ return false; }
  }

  /** Reuse only the native list/form, never a detail page with a header search. */
  function kqNativeSearchRoute(){
    try{
      const url=new URL(location.href);
      if(url.origin!=='https://muasamcong.mpi.gov.vn'||!/^\/vi\/web\/guest\/contractor-selection\/?$/i.test(url.pathname))return false;
      for(const [key,value] of url.searchParams){
        if(/(?:^|_)render$/i.test(key)&&/detail/i.test(value))return false;
        // p_p_id selects the Liferay portlet, not an individual procurement.
        if(!/^p_p_id$/i.test(key)&&/(?:^|_)(?:id|notifyId|planId|bidOpenId|inputResultId|techReqId)$/i.test(key))return false;
      }
      return true;
    }catch{return false;}
  }
  function kqProbeState(){
    const busy=Boolean(kqPlan);
    const pageError=kqNativePageError(document.readyState,document.title,document.body?.innerText);
    const available=!busy&&document.readyState!=='loading'&&!pageError&&kqNativeSearchRoute();
    // Match the same placeholder priority and visible input used by kqSeedCriterion.
    const inputs=[...document.querySelectorAll('input')];
    const input=inputs.find(el=>el.offsetParent!==null&&/Áp dụng cho tất cả các trường/i.test(el.placeholder||''))
      ||inputs.find(el=>el.offsetParent!==null&&/Nhập số TBMT/i.test(el.placeholder||''));
    const searchView=Boolean(available&&kqUsableSearchControl(input)&&kqSearchButton());
    const resultsView=Boolean(available&&kqIsResultsView());
    return {ok:true,busy,pageError,searchView,resultsView,ready:searchView||resultsView};
  }

  /** Ô chọn số bản ghi/trang của e-GP (10 / 20 / 50). */
  function kqPageSizeSelect(){
    return [...document.querySelectorAll('select')]
      .find(s=>[...s.options].some(o=>o.value==='50')&&[...s.options].some(o=>o.value==='10'))||null;
  }
  function kqIsResultsView(){ return Boolean(kqPageSizeSelect()&&document.querySelector('.el-pagination')); }

  /** Chờ page-hook báo về một trang kết quả đã lọc. */
  function kqAwaitPage(timeoutMs=KQ_RESPONSE_TIMEOUT){
    // Settle a superseded wait without leaving its timer able to erase the
    // waiter of a later request or a different job.
    if(kqPageWaiter)kqPageWaiter({ok:false,cancelled:true,status:0});
    const waitingPlan=kqPlan;
    return new Promise(resolve=>{
      let settled=false,timer;
      const waiter=payload=>{
        if(settled)return;
        settled=true;clearTimeout(timer);
        if(kqPageWaiter===waiter)kqPageWaiter=null;
        resolve(kqPlan===waitingPlan?payload:null);
      };
      kqPageWaiter=waiter;
      timer=setTimeout(()=>waiter(null),timeoutMs);
    });
  }

  /* ======================================================================
   *  KHỞI ĐỘNG TRANG ĐẦU — BẮT TAY CÓ XÁC NHẬN
   *
   *  NGUYÊN NHÂN LỖI "lúc được lúc mất": trang tra cứu e-GP TỰ TẢI danh sách
   *  mặc định ngay khi mở. Bản cũ đổi ô "số bản ghi/trang" một lần rồi ngồi chờ
   *  25 giây. Nếu lúc đổi ô mà yêu cầu mặc định chưa xong, giao diện e-GP coi
   *  trang đang bận và BỎ QUA thao tác: không yêu cầu nào được gửi, phản hồi
   *  không bao giờ tới, và người dùng nhận câu "e-GP chưa trả dữ liệu cho lượt
   *  tra cứu" — trong khi e-GP không hề được hỏi. Bấm lại thì tab đã rảnh nên
   *  chạy được. Đã tái hiện y hệt trên máy chủ giả lập: lượt 1 lỗi sau 25,6 giây,
   *  lượt 2 chạy trong 3,8 giây.
   *
   *  CÁCH LÀM MỚI, mỗi lần thử:
   *    1. Chờ e-GP xong các yêu cầu nó tự phát (page-hook đếm tận mắt).
   *    2. Thao tác, rồi chờ tối đa 5 giây để thấy yêu cầu MANG TIÊU CHÍ rời
   *       trình duyệt. Không thấy → thao tác bị bỏ qua → đổi cách, làm lại.
   *    3. Chỉ khi yêu cầu đã đi, mới tính hạn chờ phản hồi (45 giây).
   *    4. Hết hạn chờ phản hồi thì gửi lại đúng một lần.
   *
   *  Ba cách thao tác, dùng luân phiên: bấm trang "1" (khi đang ở trang khác),
   *  đổi ô số bản ghi, và cuối cùng bấm nút "Tìm kiếm" của biểu mẫu.
   *  Chọn giá trị nào cho ô số bản ghi không quan trọng: page-hook ghi đè
   *  `pageSize` bằng `plan.pageSize` trước khi yêu cầu rời trình duyệt.
   * ==================================================================== */
  function kqAwaitSent(timeoutMs=KQ_SENT_TIMEOUT){
    if(kqSentWaiter)kqSentWaiter(false);
    const waitingPlan=kqPlan;
    return new Promise(resolve=>{
      let settled=false,timer;
      const waiter=ok=>{
        if(settled)return;
        settled=true;clearTimeout(timer);
        if(kqSentWaiter===waiter)kqSentWaiter=null;
        resolve(Boolean(ok)&&kqPlan===waitingPlan);
      };
      kqSentWaiter=waiter;
      timer=setTimeout(()=>waiter(false),timeoutMs);
    });
  }

  /** Chờ e-GP xong các yêu cầu tìm kiếm đang bay. Hết hạn vẫn đi tiếp. */
  function kqWaitEgpIdle(timeoutMs=KQ_IDLE_TIMEOUT){
    postPage('EGP_ACTIVITY_PROBE',{});
    return new Promise(resolve=>{
      const started=Date.now();
      const check=()=>{
        if(egpInFlight<=0){egpIdleWaiters.delete(check);clearTimeout(timer);resolve(true);return;}
        if(Date.now()-started>=timeoutMs){egpIdleWaiters.delete(check);resolve(false);}
      };
      const timer=setTimeout(check,timeoutMs);
      egpIdleWaiters.add(check);
      // Hỏi hook trước rồi mới kết luận: tín hiệu "đang bận" có thể tới sau
      // lời gọi này một nhịp.
      setTimeout(check,60);
    });
  }

  /** Các cách bắt e-GP phát yêu cầu trang đầu. Trả về true nếu đã thao tác. */
  function kqFirstPageMechanisms(){
    return [
      ()=>{
        const first=[...document.querySelectorAll('.el-pagination .el-pager li.number')]
          .find(el=>el.offsetParent!==null&&clean(el.textContent)==='1');
        if(!first||first.classList.contains('active'))return false;
        first.click();return true;
      },
      ()=>{
        const sel=kqPageSizeSelect();
        if(!sel)return false;
        const values=[...sel.options].map(o=>o.value);
        const next=values.find(v=>v!==sel.value)||values[0];
        if(!next)return false;
        sel.value=next;
        sel.dispatchEvent(new Event('change',{bubbles:true}));
        return true;
      },
      ()=>kqClickSearch()
    ];
  }

  async function kqTriggerFirstPage(){
    const plan=kqPlan;
    const mechanisms=kqFirstPageMechanisms();
    let fired=0,ignored=0,timeouts=0,netCuts=0,lastPage=null;
    const startedAt=Date.now();
    for(let attempt=0;attempt<KQ_TRIGGER_ATTEMPTS;attempt++){
      if(kqCancelled||kqPlan!==plan)return {ok:false,cancelled:true,status:0};

      const idle=egpInFlight<=0||await (async()=>{
        kqReport('e-GP đang tải danh sách mặc định của trang; chờ trang rảnh rồi mới gửi tiêu chí…');
        return kqWaitEgpIdle();
      })();
      if(kqCancelled||kqPlan!==plan)return {ok:false,cancelled:true,status:0};
      void idle;

      // Cách bấm: lượt đầu thử bấm trang "1" rồi tới ô số bản ghi; lượt cuối
      // mới dùng nút Tìm kiếm vì nó có thể làm e-GP tải lại cả trang.
      const order=attempt<KQ_TRIGGER_ATTEMPTS-1?[0,1]:[1,2];
      kqRejected=null;
      const sentWait=kqAwaitSent();
      const pageWait=kqAwaitPage();
      let did=false;
      for(const i of order){if(mechanisms[i]()){did=true;break;}}
      if(!did){
        if(kqPageWaiter)kqPageWaiter({ok:false,cancelled:true,status:0,superseded:true});
        if(kqSentWaiter)kqSentWaiter(false);
        return {ok:false,status:0,stage:'controls',
          failureReason:'Không tìm thấy điều khiển phân trang hoặc nút Tìm kiếm trên trang e-GP. '
            +'Hãy mở trang Tra cứu › Lựa chọn nhà thầu, bấm "Tìm kiếm" một lần cho ra danh sách, rồi chạy lại.'};
      }
      fired++;
      const sent=await sentWait;
      if(!sent){
        if(kqPageWaiter)kqPageWaiter({ok:false,cancelled:true,status:0,superseded:true});
        if(kqCancelled||kqPlan!==plan)return {ok:false,cancelled:true,status:0};
        if(kqRejected){
          return {ok:false,status:0,stage:'schema',schemaIssue:true,
            failureReason:'e-GP đã gửi yêu cầu tìm kiếm theo một cấu trúc tiện ích không nhận ra, nên không gắn được tiêu chí. '
              +'Chưa có dữ liệu để kết luận. Hãy mở Chẩn đoán → chạy kiểm tra cấu trúc e-GP.'};
        }
        ignored++;
        kqReport(`Trang e-GP chưa nhận thao tác tra cứu (lần ${attempt+1}/${KQ_TRIGGER_ATTEMPTS}); thử lại…`);
        await new Promise(r=>setTimeout(r,600+attempt*700));
        continue;
      }
      const page=await pageWait;
      if(page&&!page.superseded){
        if(!page.ok&&!page.cancelled&&page.status===0&&!page.schemaIssue&&netCuts<KQ_NET_RESENDS&&attempt<KQ_TRIGGER_ATTEMPTS-1){
          // Rớt kết nối: gửi lại, có giãn cách. Mạng chập chờn hay rớt THEO CỤM —
          // gửi lại ngay lập tức (như 4.16.1) thường rớt luôn lần nữa.
          netCuts++;timeouts++;lastPage=page;if(kqTr)kqTr.reReads++;
          kqReport(`Kết nối tới e-GP bị gián đoạn; gửi lại yêu cầu trang đầu sau ${(KQ_NET_BACKOFF*netCuts/1000).toFixed(1)} giây (lần ${netCuts}/${KQ_NET_RESENDS})…`);
          await new Promise(r=>setTimeout(r,KQ_NET_BACKOFF*netCuts));
          if(kqCancelled||kqPlan!==plan)return {ok:false,cancelled:true,status:0};
          continue;
        }
        return page;
      }
      if(kqCancelled||kqPlan!==plan)return {ok:false,cancelled:true,status:0};
      // Yêu cầu đã đi nhưng quá hạn không có phản hồi.
      timeouts++;
      if(timeouts>1)break;
      kqReport('e-GP đã nhận yêu cầu nhưng chưa trả lời sau 45 giây; đang gửi lại một lần…');
    }
    const giay=Math.round((Date.now()-startedAt)/1000);
    if(lastPage&&timeouts&&!ignored)return lastPage;
    if(timeouts){
      return {ok:false,status:0,stage:'response',
        failureReason:`Đã gửi tiêu chí tới e-GP ${fired} lần nhưng e-GP không trả lời trong ${giay} giây. `
          +'e-GP có thể đang quá tải; dữ liệu chưa đủ để kết luận. Hãy thử lại sau ít phút.'};
    }
    return {ok:false,status:0,stage:'trigger',
      failureReason:`Trang e-GP bận và bỏ qua thao tác tra cứu ${ignored} lần liền trong ${giay} giây — e-GP CHƯA được hỏi, `
        +'nên đây không phải kết quả rỗng. Thường do trang vừa mở còn đang tải. Hãy bấm quét lại; nếu lặp lại, tải lại trang e-GP (F5).'};
  }

  /**
   * Giao truy vấn cho page-hook.js và CHỜ nó xác nhận đã nhận.
   *
   * Bắt buộc phải chờ xác nhận. page-hook chạy ở thế giới MAIN, content.js ở
   * thế giới ISOLATED, hai bên nói chuyện qua window.postMessage — nếu page-hook
   * chưa gắn bộ lắng nghe vào lúc gửi thì truy vấn RƠI MẤT KHÔNG DẤU VẾT. Khi đó
   * e-GP vẫn trả kết quả (của từ khoá gieo tạm), phần mềm vẫn thu bình thường,
   * lọc theo mã số thuế ra 0, rồi kết luận sai là nhà thầu chưa từng trúng thầu.
   *
   * Gửi lại tối đa 5 lần, mỗi lần chờ 400ms.
   */
  function kqSameQuery(payload,plan){
    return Boolean(plan)&&payload?.planId===plan.id&&(payload.queryIndex??0)===(plan.queryIndex??0);
  }

  function kqSendPlanToHook(plan){
    return new Promise(resolve=>{
      let tries=0,settled=false;
      const onAck=event=>{
        if(event.source!==window||event.data?.source!==PAGE_SOURCE)return;
        if(event.data.type!=='KQLCNT_PLAN_ACK')return;
        if(!kqSameQuery(event.data.payload,plan)||event.data.payload.accepted===false)return;
        settled=true;
        window.removeEventListener('message',onAck);
        clearInterval(timer);
        resolve(true);
      };
      window.addEventListener('message',onAck);
      const attempt=()=>{
        if(settled)return;
        if(tries++>=5){
          window.removeEventListener('message',onAck);
          clearInterval(timer);
          resolve(false);
          return;
        }
        postPage('KQLCNT_PLAN',{id:plan.id,queryIndex:plan.queryIndex??0,query:plan.query,pageSize:plan.pageSize||50});
      };
      const timer=setInterval(attempt,400);
      attempt();
    });
  }

  /**
   * Bấm nút "trang sau" thật của e-GP — cũng có xác nhận như trang đầu.
   * Nút bị bỏ qua (trang đang bận) thì bấm lại, chứ không chờ 45 giây phản hồi
   * của một yêu cầu không được gửi.
   */
  async function kqGoNextPage(){
    for(let attempt=0;attempt<3;attempt++){
      const next=document.querySelector('.el-pagination .btn-next');
      if(!next||next.disabled)return null;
      if(egpInFlight>0)await kqWaitEgpIdle(15000);
      const plan=kqPlan;
      const sentWait=kqAwaitSent();
      const wait=kqAwaitPage();
      next.click();
      if(await sentWait)return wait;
      if(kqPageWaiter)kqPageWaiter({ok:false,cancelled:true,status:0,superseded:true});
      if(kqCancelled||kqPlan!==plan)return {ok:false,cancelled:true,status:0};
      await new Promise(r=>setTimeout(r,500+attempt*500));
    }
    return {ok:false,status:0,stage:'trigger',failureReason:'Trang e-GP không nhận thao tác sang trang sau (đã bấm 3 lần).'};
  }

  /* Lỗi THOÁNG QUA: rớt kết nối (status 0), hết hạn chờ, hoặc e-GP lỗi 5xx.
     Một cú chập mạng không được làm hỏng cả lượt tra cứu — đọc lại đúng trang
     đó. Lỗi cấu trúc, 4xx hay người dùng bấm Dừng thì KHÔNG đọc lại. */
  function kqTransientFailure(page){
    if(page===undefined)return false;
    if(page===null)return true;
    return !page.ok&&!page.cancelled&&!page.schemaIssue&&page.stage!=='trigger'
      &&(page.status===0||page.status>=500);
  }
  /**
   * Đi tới ĐÚNG trang `target` trên e-GP và trả phản hồi của trang đó.
   *
   * Cách cũ "lùi một trang rồi tiến lại" hỏng khi chính bước lùi rớt mạng: giao
   * diện e-GP đã lùi nhưng dữ liệu không về, lần thử sau lùi thêm một nấc nữa,
   * và trang đọc lại bị lệch. Nay mỗi bước đều biết e-GP đang ở trang nào (từ
   * yêu cầu thật sự đã gửi) và bấm theo hướng tới đích; phản hồi của các bước
   * trung gian được chờ cho xong để không lẫn vào trang đích, nhưng hỏng cũng
   * không sao.
   */
  async function kqNavigateTo(target){
    for(let step=0;step<8;step++){
      if(kqCancelled)return {ok:false,cancelled:true,status:0};
      const here=kqUiPage;
      if(here===null)return {ok:false,status:0,stage:'trigger',
        failureReason:'Không xác định được trang e-GP đang mở để đọc lại; dữ liệu đã đọc được giữ lại.'};
      // Đang đứng ở trang đích thì Element UI bỏ qua cú bấm vào chính nó:
      // bước ra một trang rồi quay lại.
      const selector=here<target?'.el-pagination .btn-next':'.el-pagination .btn-prev';
      if(here===target&&target===0)return kqTriggerFirstPage();
      const button=document.querySelector(selector);
      if(!button||button.disabled)return {ok:false,status:0,stage:'trigger',
        failureReason:'Không tìm được điều khiển phân trang để đọc lại trang bị lỗi.'};
      if(egpInFlight>0)await kqWaitEgpIdle(15000);
      const plan=kqPlan;
      const sentWait=kqAwaitSent();
      const wait=kqAwaitPage();
      button.click();
      if(!(await sentWait)){
        if(kqPageWaiter)kqPageWaiter({ok:false,cancelled:true,status:0,superseded:true});
        if(kqCancelled||kqPlan!==plan)return {ok:false,cancelled:true,status:0};
        await new Promise(r=>setTimeout(r,500));
        continue;
      }
      const page=await wait;
      if(kqUiPage===target)return page;
    }
    return {ok:false,status:0,stage:'trigger',
      failureReason:'Không quay lại được đúng trang cần đọc lại sau nhiều lần thử; dữ liệu đã đọc được giữ lại.'};
  }
  async function kqReReadPage(expectedIndex){
    if(expectedIndex===0&&kqUiPage!==null&&kqUiPage>0)return kqNavigateTo(0);
    if(expectedIndex===0)return kqTriggerFirstPage();
    return kqNavigateTo(expectedIndex);
  }
  async function kqRecoverTransient(page,expectedIndex,plan){
    for(let attempt=0;attempt<3&&kqTransientFailure(page);attempt++){
      kqReport(`Kết nối tới e-GP chập chờn ở trang ${expectedIndex+1}; đọc lại (lần ${attempt+1}/3)…`);
      const until=Date.now()+1500*(attempt+1);
      while(Date.now()<until){
        if(kqCancelled||kqPlan!==plan)return {ok:false,cancelled:true,status:0};
        await new Promise(r=>setTimeout(r,200));
      }
      page=await kqReReadPage(expectedIndex);
      if(page?.status===429)page=await kqRecoverRateLimit(page,expectedIndex,plan);
    }
    return page;
  }

  /* KQ_BACKOFF_START */
  function kqBackoffDelay(retryAfter, attempt, now = Date.now(), random = Math.random()) {
    const raw = String(retryAfter || '').trim();
    let requested = /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw) - now;
    if (!Number.isFinite(requested)) requested = 0;
    // Never retry before Retry-After. A delay above our budget ends this run.
    return Math.max(2000 * 2 ** attempt, requested, 0) + Math.floor(Math.max(0, Math.min(1, random)) * 500);
  }
  async function kqRecoverRateLimit(page, expectedIndex, plan) {
    for (let attempt = 0; page?.status === 429 && attempt < 3; attempt++) {
      const delay = kqBackoffDelay(page.retryAfter, attempt);
      if (delay > 60000) return { ...page, failureReason: 'e-GP yêu cầu nghỉ quá một phút. Đã giữ dữ liệu; hãy chạy lại sau thời gian e-GP cho phép.' };
      kqReport(`e-GP đang giới hạn truy cập (429). Chờ ${Math.ceil(delay / 1000)} giây trước khi thử lại trang ${expectedIndex + 1}...`);
      const until = Date.now() + delay;
      while (Date.now() < until) {
        if (kqCancelled || kqPlan !== plan) return { ok: false, status: 429, cancelled: true };
        await new Promise(resolve => setTimeout(resolve, Math.min(250, until - Date.now())));
      }
      if (kqCancelled || kqPlan !== plan) return { ok: false, status: 429, cancelled: true };
      // Đi tới đúng trang bị giới hạn, kể cả khi bước trung gian cũng bị 429.
      page = await kqReReadPage(expectedIndex);
    }
    return page;
  }
  /* KQ_BACKOFF_END */

  async function kqRunHarvest(){
    const plan=kqPlan;
    if(!plan)return;
    if(!kqTr)kqTraceReset(plan);   // tiếp tục sau khi e-GP tải lại trang

    // `plan.query` do background.js dựng sẵn bằng lib/kqlcnt.js hoặc lib/bbmt.js.
    // Không chạy tiếp khi chưa có xác nhận: thu dữ liệu bằng truy vấn của e-GP
    // thay vì của phần mềm sẽ cho ra con số 0 trông y như một câu trả lời thật.
    const hookAccepted=await kqSendPlanToHook(plan);
    if(kqPlan!==plan)return;
    if(kqCancelled){kqFinish(false,'Đã dừng lượt tra cứu theo yêu cầu.','cancelled');return;}
    if(!hookAccepted){
      kqFinish(false,'Phần mềm không giao được tiêu chí cho trang e-GP (không có phản hồi từ trang). '
        +'Hãy tải lại trang e-GP (F5) rồi tra lại. Nếu vẫn vậy, vào chrome://extensions bấm ↻ Reload cho tiện ích.','hook');
      return;
    }

    if(kqTr)kqTr.hookMs=Date.now()-kqTr.t0;
    kqReport(`Đang hỏi e-GP về ${plan.label}...`);
    let page=await kqTriggerFirstPage();
    if(page?.status===429){if(kqTr)kqTr.reReads++;page=await kqRecoverRateLimit(page,0,plan);}
    if(kqPlan!==plan)return;
    if(page&&!page.ok&&page.status>=500&&kqTransientFailure(page)){
      if(kqTr)kqTr.reReads++;
      page=await kqRecoverTransient(page,0,plan);
      if(kqPlan!==plan)return;
    }
    if(kqCancelled||page?.cancelled){kqFinish(false,'Đã dừng lượt tra cứu theo yêu cầu.','cancelled');return;}
    if(!page||!page.ok){
      if(kqTr&&page?.status)kqTr.status=page.status;
      kqFinish(false,page?.failureReason||`e-GP chưa trả dữ liệu cho lượt tra cứu${page&&page.status?` (HTTP ${page.status})`:''}. Hãy thử lại sau ít phút.`,
        page?.stage||(page?.status>=400?'http':'response'));
      return;
    }
    if(kqTr)kqTr.firstPageMs=Date.now()-kqTr.t0;

    let collected=0,pageIndex=0,totalPages=null,totalElements=null,deliveryFailed=false;
    let schemaIssue=false,failureReason='';
    const signatures=new Set();
    const count=value=>value!==null&&value!==undefined&&value!==''
      &&Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;
    // maxPages = 0 nghĩa là KHÔNG giới hạn: lấy hết mọi trang e-GP trả về.
    const maxPages=Math.max(0,Number(plan.maxPages)||0);
    const pageLimit=maxPages||Infinity;

    while(page&&page.ok&&!kqCancelled&&kqPlan===plan){
      const envelope=page.data&&page.data.page;
      if(!envelope||!Array.isArray(envelope.content)){
        schemaIssue=true;failureReason='Phản hồi e-GP không có bảng kết quả hợp lệ.';break;
      }
      const rows=envelope.content;
      const nextPages=count(envelope.totalPages),nextTotal=count(envelope.totalElements);
      if(nextPages===null||nextTotal===null){
        schemaIssue=true;failureReason='e-GP chưa cung cấp đủ số trang hoặc tổng số bản ghi để đối soát.';
      }else if((totalPages!==null&&nextPages!==totalPages)||(totalElements!==null&&nextTotal!==totalElements)){
        schemaIssue=true;failureReason='Tổng kết quả e-GP đã thay đổi trong khi đọc; cần quét lại để đối soát.';
      }
      totalPages=nextPages??totalPages;totalElements=nextTotal??totalElements;
      if(page.sourcePageIndex!=null&&page.sourcePageIndex!==pageIndex){
        schemaIssue=true;failureReason=`Trang e-GP trả về không đúng thứ tự (cần trang ${pageIndex+1}, nhận trang ${page.sourcePageIndex+1}). Hãy chạy lại để đối soát.`;break;
      }
      if(!rows.length&&!(pageIndex===0&&totalElements===0&&(totalPages===0||totalPages===1))){
        schemaIssue=true;failureReason='e-GP trả trang rỗng trước khi lấy đủ số bản ghi đã công bố.';break;
      }
      if(rows.some(row=>!row||typeof row!=='object'||Array.isArray(row))){
        schemaIssue=true;failureReason='Bảng kết quả chứa bản ghi sai cấu trúc.';break;
      }
      const signature=JSON.stringify(rows);
      if(rows.length&&signatures.has(signature)){
        schemaIssue=true;failureReason='e-GP trả lặp lại một trang; chưa thể xác nhận đã lấy đủ dữ liệu.';break;
      }

      // Gửi cả trang rỗng để service worker kiểm chứng chuỗi pageIndex đầy đủ.
      // Chỉ chuyển trang sau khi nhận ACK; retry là an toàn vì background chống
      // trùng theo job + pageIndex.
      const ack=await kqSend('KQLCNT_RESULTS',{
        planId:plan.id,queryIndex:plan.queryIndex??0,mode:plan.mode,focusTaxCode:plan.focusTaxCode||'',
        records:rows,totalElements,totalPages,pageIndex,done:false,schemaIssue,failureReason
      },{requireAck:true,attempts:3});
      if(kqPlan!==plan)return;
      if(!ack?.ok){ deliveryFailed=true; break; }
      collected+=rows.length;
      if(rows.length)signatures.add(signature);

      pageIndex+=1;
      if(schemaIssue||pageIndex>=totalPages||pageIndex>=pageLimit||!rows.length)break;

      const of=maxPages?Math.min(totalPages,maxPages):totalPages;
      kqReport(`Đã lấy ${collected}/${totalElements} kết quả (trang ${pageIndex}/${of})...`);
      await new Promise(r=>setTimeout(r,KQ_PAGE_PAUSE));
      if(kqPlan!==plan)return;
      if(kqCancelled)break;
      page=await kqGoNextPage();
      if(page?.status===429){if(kqTr)kqTr.reReads++;page=await kqRecoverRateLimit(page,pageIndex,plan);}
      if(kqPlan!==plan)return;
      // `null` ở đây có hai nghĩa: hết hạn chờ phản hồi (thoáng qua) hoặc nút
      // "trang sau" đã tắt. Chỉ đọc lại khi còn trang để đọc.
      if((page!==null||pageIndex<(totalPages??Infinity))&&kqTransientFailure(page)){
        if(kqTr)kqTr.reReads++;
        page=await kqRecoverTransient(page,pageIndex,plan);
        if(kqPlan!==plan)return;
      }
      if(page&&!page.ok&&page.failureReason)failureReason=page.failureReason;
    }

    const capped=Boolean(maxPages)&&totalPages!==null&&totalPages>maxPages&&pageIndex>=maxPages;
    const expectedPages=totalPages===null?null:Math.min(totalPages,pageLimit);
    const countMismatch=!capped&&totalElements!==null&&collected!==totalElements;
    const incomplete=deliveryFailed||schemaIssue||(!kqCancelled&&!capped&&(
      expectedPages===null||totalElements===null||pageIndex<expectedPages||countMismatch));
    if(countMismatch&&!failureReason)failureReason='Số bản ghi nhận được khác tổng e-GP công bố.';
    const finalAck=await kqSend('KQLCNT_RESULTS',{
      planId:plan.id,queryIndex:plan.queryIndex??0,mode:plan.mode,focusTaxCode:plan.focusTaxCode||'',
      records:[],totalElements,totalPages,pageIndex,capped,
      // Báo lên tiêu chí nào đặt được, tiêu chí nào không — để giao diện nói
      // thật với người dùng thay vì trình bày kết quả thiếu như thể đủ.
      applied:plan.applied||null,
      cancelled:kqCancelled,partial:incomplete,schemaIssue,failureReason,done:true
    },{requireAck:true,attempts:3});
    if(kqPlan!==plan)return;
    const transferFailed=!finalAck?.ok;
    if(kqTr)kqTr.pages=pageIndex;
    kqFinish(!incomplete&&!transferFailed,kqCancelled
      ?`Đã dừng theo yêu cầu: lấy được ${collected} kết quả của ${plan.label}.`
      :transferFailed
        ?`Không xác nhận được trang kết thúc với tiện ích. Dữ liệu đã nhận được sẽ được giữ và đánh dấu chưa đầy đủ.`
      :deliveryFailed
        ?`Mất kết nối khi chuyển một trang dữ liệu. Đã giữ ${collected} kết quả và đánh dấu chưa đầy đủ.`
      :incomplete
        ?`${failureReason||'e-GP ngừng trả dữ liệu.'} Đã giữ ${collected} kết quả (${pageIndex}/${totalPages??'?'} trang) và đánh dấu chưa đầy đủ.`
        :`Xong: ${collected} kết quả của ${plan.label}${capped?` (mới lấy ${maxPages} trang đầu)`:''}.`,
      transferFailed||deliveryFailed?'delivery':schemaIssue?'schema':'harvest');
  }

  /* Sổ giai đoạn (4.17.0): chỉ là con số và nhãn — không tiêu chí, không dữ liệu.
     Mốc bắt đầu nằm trong plan nên vẫn đúng khi e-GP tải lại trang giữa lượt. */
  let kqTr=null;
  function kqTraceReset(plan){
    kqTr={t0:Number(plan?.traceStart)||Date.now(),hookMs:null,firstPageMs:null,reReads:0,pages:0,stage:null,status:null};
  }
  function kqTraceSummary(ok,cancelled,stage){
    const tr=kqTr||{t0:Date.now(),reReads:0,pages:0};
    return {stage:cancelled?'cancelled':ok?'ok':(stage||tr.stage||'response'),t0:tr.t0,attempt:kqPlan?.autoRetry?2:1,hookMs:tr.hookMs??null,
      firstPageMs:tr.firstPageMs??null,totalMs:Date.now()-tr.t0,pages:tr.pages||0,reReads:tr.reReads||0,status:tr.status??null};
  }
  function kqFinish(ok,message,stage){
    const trace=kqTraceSummary(ok,kqCancelled,stage);
    kqTr=null;
    const donePlan=kqPlan?{planId:kqPlan.id,queryIndex:kqPlan.queryIndex??0,mode:kqPlan.mode||'',focusTaxCode:kqPlan.focusTaxCode||''}:{};
    const cancelled=kqCancelled;
    if(kqPageWaiter)kqPageWaiter({ok:false,cancelled:true,status:0});
    if(kqSentWaiter)kqSentWaiter(false);
    kqRejected=null;
    postPage('KQLCNT_PLAN',null);
    kqSaveState(null);
    kqPlan=null;
    kqCancelled=false;
    kqReport(message,ok?'success':'error');
    // KQLCNT_DONE là chốt cuối của job. Gửi có ACK/retry để service worker
    // vừa được Chrome khởi động lại vẫn có cơ hội nhận tín hiệu hoàn tất.
    void kqSend('KQLCNT_DONE',{...donePlan,ok,cancelled,partial:!ok,message,trace},
      {requireAck:true,attempts:3});
  }

  /** Điểm vào: bắt đầu một lượt tra cứu KQLCNT. */
  function kqNativePageError(readyState,title,body){
    // At document-start even the error page has no body yet. Wait for the
    // document, then distinguish native error pages from normal listing text.
    if(readyState==='loading')return null;
    const known=bbmtPageError(title,body);
    if(known)return known;
    const heading=String(title??'').replace(/\s+/g,' ').trim();
    const text=String(body??'').replace(/\s+/g,' ').trim();
    // e-GP also serves a shorter Error page without "Contact support".
    if(/^error$/i.test(heading)&&/\bthis page can(?:not|['’]t) be displayed\b/i.test(text)
      &&/\bincident id\b/i.test(text))return 'ACCESS_DENIED';
    return null;
  }
  function kqPageErrorMessage(code){
    return code==='PORTLET_UNAVAILABLE'
      ?'Trang e-GP báo thành phần tra cứu tạm thời không khả dụng; chưa có dữ liệu để kết luận kết quả tìm kiếm.'
      :'Trang e-GP đang từ chối truy cập hoặc báo lỗi hệ thống. Mở e-GP để kiểm tra và thử lại khi trang hoạt động; chưa có dữ liệu để kết luận kết quả tìm kiếm.';
  }
  async function kqStart(plan){
    if(!plan.traceStart)plan.traceStart=Date.now();
    kqTraceReset(plan);
    kqPlan=plan;
    kqCancelled=false;
    kqUiPage=null;
    kqSaveState(plan);
    const pageError=kqNativePageError(document.readyState,document.title,document.body?.innerText);
    if(pageError){
      kqFinish(false,kqPageErrorMessage(pageError),'page');
      return;
    }
    if(kqIsResultsView()){ await kqRunHarvest(); return; }

    // Chưa ở màn hình kết quả: đặt đúng loại thông báo rồi bấm "Tìm kiếm" của
    // e-GP. Thao tác này làm trang tải lại, phần còn lại chạy tiếp nhờ
    // sessionStorage ở khối kqResume() bên dưới.
    // Khi đã có `plan.query` (cả bốn tính năng nay đều có) thì KHÔNG chạm vào
    // biểu mẫu e-GP: truy vấn sẽ bị ghi đè toàn bộ ở page-hook, nên loại thông
    // báo và mọi tiêu chí trên biểu mẫu đều vô nghĩa. Chỉ cần một lần bấm
    // "Tìm kiếm" để e-GP mở ra màn hình kết quả có thanh phân trang.
    //
    // Bỏ bước đặt tiêu chí ở đây xoá hẳn nguyên nhân hỏng thường gặp nhất:
    // chọn sai/không chọn được ô Tỉnh hay Xã/phường rồi vẫn chạy tiếp.
    let applied=null;
    if(plan.query){
      kqReport(`Đang mở màn hình kết quả trên e-GP cho ${plan.label}...`);
      if(!kqSeedCriterion()){
        kqFinish(false,'Không thấy ô tìm kiếm trên trang e-GP. Hãy mở trang Tra cứu › Lựa chọn nhà thầu rồi chạy lại.','page');
        return;
      }
      await new Promise(r=>setTimeout(r,300));
    }else{
      kqReport(`Đang đặt tiêu chí trên e-GP cho ${plan.label}...`);
      applied=plan.form
        ? await kqApplyForm(plan.form)
        : {noticeType:await kqSelectNoticeType(plan.noticeType||'Kết quả lựa chọn nhà thầu')};
    }
    kqSaveState({...plan,stage:'harvest',applied});
    if(!kqClickSearch()){
      kqFinish(false,'Không thấy nút "Tìm kiếm" trên trang e-GP. Hãy mở lại trang tra cứu rồi thử lại.','page');
      return;
    }
    // e-GP thường tải lại trang sau khi bấm "Tìm kiếm" — khi đó khối
    // kqResume() ở dưới sẽ chạy tiếp. Nhưng nếu e-GP chỉ đổi khung nhìn mà
    // không tải lại, ngữ cảnh này vẫn sống, nên phải tự chạy tiếp ở đây.
    kqWaitForResultsView();
  }

  /**
   * Chờ màn hình kết quả xuất hiện rồi bắt đầu thu thập.
   *
   * Hết thời gian chờ thì PHẢI báo lỗi. Trước đây chỗ này chỉ lặng lẽ dừng bộ
   * đếm: lượt tra cứu treo ở trạng thái "đang chạy" cho tới khi hết hạn 8 phút
   * ở background, và người dùng chỉ thấy màn hình trắng không kết quả. Đó
   * chính là triệu chứng "tìm mã số thuế mà không ra gì".
   */
  function kqWaitForResultsView(){
    const waitingPlan=kqPlan;
    if(!waitingPlan)return;
    const boot=setInterval(()=>{
      if(kqPlan!==waitingPlan){clearInterval(boot);return;}
      const pageError=kqNativePageError(document.readyState,document.title,document.body?.innerText);
      if(pageError){clearInterval(boot);kqFinish(false,kqPageErrorMessage(pageError),'page');return;}
      if(!kqIsResultsView())return;
      clearInterval(boot);
      kqRunHarvest();
    },700);
    setTimeout(()=>{
      clearInterval(boot);
      if(kqPlan===waitingPlan&&!kqIsResultsView()){
        const pageError=kqNativePageError(document.readyState,document.title,document.body?.innerText);
        kqFinish(false,pageError?kqPageErrorMessage(pageError):'Trang e-GP không mở được màn hình kết quả trong 40 giây. '
          +'Hãy mở trang Tra cứu Lựa chọn nhà thầu, bấm "Tìm kiếm" một lần cho ra danh sách, rồi chạy lại.','page');
      }
    },40000);
  }

  // Nhận trang kết quả đã lọc, và bảng nhà thầu của biên bản mở thầu.
  window.addEventListener('message',event=>{
    if(event.source!==window||event.data?.source!==PAGE_SOURCE)return;
    const payload=event.data.payload||{};

    if(event.data.type==='KQLCNT_PAGE'){
      if(!kqSameQuery(payload,kqPlan))return;
      if(kqPageWaiter)kqPageWaiter(payload);
      return;
    }
    // e-GP đang có bao nhiêu yêu cầu tìm kiếm chưa xong — gồm cả yêu cầu nó tự
    // phát khi mở trang. Xem kqTriggerFirstPage.
    if(event.data.type==='EGP_SEARCH_ACTIVITY'){
      const n=Number(payload.inFlight);
      egpInFlight=Number.isSafeInteger(n)&&n>=0?n:0;
      for(const check of [...egpIdleWaiters])check();
      return;
    }
    // Yêu cầu mang tiêu chí của lượt tra cứu đã thật sự rời trình duyệt.
    if(event.data.type==='KQLCNT_REQUEST_SENT'){
      if(!kqSameQuery(payload,kqPlan))return;
      const n=Number(payload.pageNumber);
      kqUiPage=payload.pageNumber!==null&&payload.pageNumber!==undefined&&Number.isSafeInteger(n)&&n>=0?n:null;
      if(kqSentWaiter)kqSentWaiter(true);
      return;
    }
    if(event.data.type==='KQLCNT_REQUEST_REJECTED'){
      if(kqSameQuery(payload,kqPlan))kqRejected=String(payload.reason||'shape');
      return;
    }

    // Trang Biên bản mở thầu vừa tải xong bảng nhà thầu tham dự. Gửi thẳng về
    // nền — kể cả khi người dùng tự mở trang, không cần đang quét.
    if(event.data.type==='BBMT_BIDDERS'){
      kqSend('BBMT_BIDDERS',{url:payload.url||location.href,rows:payload.rows||[],status:payload.status,kind:payload.kind});
    }
    if(event.data.type==='BBMT_PRICE_BASIS')kqSend('BBMT_PRICE_BASIS',{url:payload.url||location.href,status:payload.status,
      bidPrice:payload.bidPrice,bidEstimatePrice:payload.bidEstimatePrice,isMultiLot:payload.isMultiLot,source:payload.source});
    if(event.data.type==='KHLCNT_DETAIL'){
      kqSend('KHLCNT_DETAIL',{url:payload.url,status:payload.status,header:payload.header,packages:payload.packages});
      return;
    }

    // Danh sách tệp đính kèm — gửi kèm URL để tầng nền biết đang xem gói nào.
    if(event.data.type==='EGP_ENDPOINT_SEEN'){
      kqSend('EGP_ENDPOINT_SEEN',payload);
      return;
    }
    if(event.data.type==='EGP_ATTACHMENTS'){
      kqSend('EGP_ATTACHMENTS',{url:payload.url||location.href,payload:payload.payload});
    }
  });

  // Chạy tiếp lượt tra cứu còn dở sau khi e-GP điều hướng lại trang.
  (function kqResume(){
    const saved=kqLoadState();
    if(!saved||saved.stage!=='harvest')return;
    kqPlan=saved;
    kqWaitForResultsView();
  })();

  chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
    // Tab này đã đứng sẵn ở màn hình kết quả chưa? Nếu rồi thì background
    // không tải lại trang, và lượt tra cứu chạy luôn mà không qua chuỗi
    // điều-hướng → sessionStorage → khôi phục (chuỗi này là chỗ hay đứt nhất).
    if(message.type==='SNAPSHOT_DOM'){
      const html=[...document.querySelectorAll('[id],[class]')].slice(0,1500).map(node=>{
        const safe=document.createElement('div');
        if(node.id)safe.id=String(node.id).slice(0,180);
        const cls=node.getAttribute('class');if(cls)safe.setAttribute('class',cls.slice(0,300));
        return safe.outerHTML;
      }).join('');
      sendResponse({ok:true,html:html.slice(0,250000),url:location.origin+location.pathname,structuralOnly:true});
      return true;
    }
    if(message.type==='KQLCNT_PROBE'){
      sendResponse(kqProbeState());
      return true;
    }
    if(message.type==='KQLCNT_START'){
      // Chốt cuối: một tab chỉ chạy MỘT lượt tra cứu. `kqPlan` và `kqlcntPlan`
      // là biến đơn của tab, nên nhận việc thứ hai sẽ ghi đè tiêu chí và lượt
      // đang chạy chết lặng lẽ. Background đã tránh gửi vào tab đang bận; chốt
      // này chặn nốt trường hợp thông điệp tới trước khi nó kịp biết.
      if(kqPlan){
        if(kqSameQuery({planId:message.payload?.id,queryIndex:message.payload?.queryIndex??0},kqPlan)){
          sendResponse({ok:true,duplicate:true});return true;
        }
        sendResponse({ok:false,busy:true,message:'Tab e-GP này đang chạy một lượt tra cứu khác.'});
        return true;
      }
      kqStart(message.payload||{});
      sendResponse({ok:true});
      return true;
    }
    if(message.type==='KQLCNT_CANCEL'){
      const requestedId=String(message.payload?.planId||'');
      if(requestedId&&kqPlan&&requestedId!==String(kqPlan.id)){
        sendResponse({ok:false,ignored:true,message:'Yêu cầu dừng không thuộc tác vụ của tab này.'});
        return true;
      }
      // Release an outstanding native wait immediately. Background has already
      // preserved accepted pages; a late response must not resume this reader.
      kqCancelled=true;
      if(kqPageWaiter)kqPageWaiter({ok:false,cancelled:true,status:0});
      if(kqPlan)kqReport('Đã yêu cầu dừng; giữ các trang đã được tiện ích xác nhận.');
      sendResponse({ok:true});
      return true;
    }
  });

  /* BBMT_DOM_ADAPTER_START
   * Pure adapter for a snapshot of the public, rendered BBMT table. Exact
   * labels/cards come from the official detail-v2 template saved in
   * test-results/4.3.2-research/IB2600486024.html (lines 7020-7890).
   * It deliberately rejects other tables and the per-contractor lot aggregate.
   */
  function bbmtAdaptDomSnapshot(snapshot){
    const text=v=>String(v??'').replace(/\s+/g,' ').trim();
    const fold=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
    const number=v=>{
      const s=text(v).replace(/\s*(VND|đ)\s*$/i,'');
      // The official currency filter uses vi-VN and up to four decimal places.
      // A dash, attachment link or undisclosed amount is not a numeric zero.
      if(!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,4})?$/.test(s))return null;
      const n=Number(s.replace(/\./g,'').replace(',','.'));
      return Number.isFinite(n)&&n>=0?n:null;
    };
    if(!snapshot||!['ttnt-card-bbmt-ldt','ttnt-card-bbmt-khac','ttnt-card-bbmt-adbwb'].includes(snapshot.cardId))return null;
    let url;
    try{url=new URL(snapshot.url);}catch{return null;}
    if(url.origin!=='https://muasamcong.mpi.gov.vn'||!url.pathname.endsWith('/contractor-selection'))return null;
    const expected=text(url.searchParams.get('notifyNo')).toUpperCase();
    const actual=text(snapshot.fields?.['Mã TBMT']).toUpperCase();
    if(!/^IB\d{6,}$/.test(expected)||!new RegExp('^'+expected+'(?:-\\d{2})?$').test(actual))return null;
    const noticeId=url.searchParams.get('notifyId')||url.searchParams.get('id');
    if(!noticeId||noticeId==='undefined'||noticeId==='null')return null;
    const bidPrice=number(snapshot.fields?.['Giá gói thầu']);
    const bidEstimatePrice=number(snapshot.fields?.['Dự toán gói thầu']);
    if(!(bidPrice>0)&&!(bidEstimatePrice>0))return null;
    const headers=(snapshot.headers||[]).map(fold);
    const index=label=>headers.indexOf(label);
    const code=index('ma dinh danh'),name=index('ten nha thau');
    const price=index('gia du thau (vnd)'),discount=index('ty le giam gia (%)');
    const final=headers.findIndex(h=>/^gia du thau sau giam gia(?: \(neu co\))? \(vnd\)$/.test(h));
    const lot=index('ma phan/lo'),lotName=headers.findIndex(h=>h==='ten phan/lo');
    if(code<0||name<0||price<0||headers.some(h=>h.includes('so phan cua goi thau')))return null;
    // A multi-lot table must expose its lot identity, never only an aggregate.
    const multiLot=lot>=0;
    if(snapshot.hasLotViewSelector&&!multiLot)return null;
    const rows=[];
    for(const group of snapshot.groups||[]){
      let currentLot='',currentLotName='';
      for(const raw of group){
        const cells=(raw.cells||[]).map(c=>({text:text(c.text),colSpan:Number(c.colSpan||1),rowSpan:Number(c.rowSpan||1)}));
        if(!cells.some(c=>c.text))continue;
        if(cells.some(c=>/\{\{|\}\}/.test(c.text)||c.rowSpan!==1))return null;
        // In the official lot view each tbody starts with a two-cell lot
        // heading followed by bidder rows whose first two cells are blank.
        if(multiLot&&lot===0&&cells.length===2&&cells[0].colSpan===1&&cells[1].colSpan>1){
          currentLot=cells[0].text;currentLotName=cells[1].text;
          if(!currentLot)return null;
          continue;
        }
        if(cells.length!==headers.length||cells.some(c=>c.colSpan!==1))return null;
        const value=i=>i>=0?cells[i].text:'';
        if(!value(name))return null;
        const row={contractorCode:value(code),contractorName:value(name),
          lotPrice:number(value(price)),lotFinalPrice:number(value(final)),
          discountPercent:discount<0?null:number(value(discount).replace(/\s*%$/,''))};
        if(row.discountPercent!==null&&row.discountPercent>100)row.discountPercent=null;
        if(multiLot){
          row.lotNo=value(lot)||currentLot;
          row.lotName=value(lotName)||currentLotName;
          if(!row.lotNo)return null;
        }
        rows.push(row);
        if(rows.length>500)return null;
      }
    }
    // Do not finish a scan on a skeleton table while prices are still loading.
    if(!rows.length||!rows.some(r=>r.lotPrice!==null||r.lotFinalPrice!==null))return null;
    // Unlike LDT/KHAC, the ADB/WB template does not condition this table on
    // isMultiLot. Its headers cannot certify a whole-package comparison.
    const isMultiLot=snapshot.cardId==='ttnt-card-bbmt-adbwb'?null:multiLot;
    return {url:snapshot.url,notifyNo:expected,kind:multiLot?'lot':'package',rows,
      bidPrice:bidPrice>0?bidPrice:null,bidEstimatePrice:bidEstimatePrice>0?bidEstimatePrice:null,
      isMultiLot,classificationKnown:isMultiLot!==null,source:'visible-dom',cardId:snapshot.cardId};
  }
  /* BBMT_DOM_ADAPTER_END */

  function bbmtVisible(el){
    if(!el||!el.getClientRects().length)return false;
    for(let node=el;node&&node.nodeType===1;node=node.parentElement){
      if(node.hidden||node.getAttribute('aria-hidden')==='true')return false;
      const style=getComputedStyle(node);
      if(style.display==='none'||style.visibility==='hidden'||style.opacity==='0')return false;
    }
    return true;
  }
  function bbmtSnapshotVisibleDom(){
    const pane=document.getElementById('bidOpeningMinutes');
    if(!pane?.classList.contains('active')||!bbmtVisible(pane))return null;
    const cards=[...pane.querySelectorAll('#ttnt-card-bbmt-ldt,#ttnt-card-bbmt-khac,#ttnt-card-bbmt-adbwb')].filter(bbmtVisible);
    if(cards.length!==1)return null;
    const card=cards[0],tables=[...card.querySelectorAll('table')].filter(bbmtVisible);
    if(tables.length!==1)return null;
    const table=tables[0];
    if(table.tHead?.rows.length!==1)return null;
    const fields={};
    for(const label of pane.querySelectorAll('.infomation__content__title')){
      if(card.contains(label)||!bbmtVisible(label)||!bbmtVisible(label.nextElementSibling))continue;
      const key=clean(label.innerText),value=clean(label.nextElementSibling.innerText);
      if(['Mã TBMT','Giá gói thầu','Dự toán gói thầu'].includes(key)){
        if(fields[key]&&fields[key]!==value)return null;
        fields[key]=value;
      }
    }
    return {url:location.href,cardId:card.id,fields,
      headers:[...table.tHead.rows[0].cells].map(c=>clean(c.innerText)),
      groups:[...table.tBodies].map(body=>[...body.rows].filter(bbmtVisible).map(row=>({
        cells:[...row.cells].map(c=>({text:clean(c.innerText),colSpan:c.colSpan,rowSpan:c.rowSpan}))
      }))),
      hasLotViewSelector:[...card.querySelectorAll('select')].some(select=>bbmtVisible(select)&&[...select.options].some(o=>clean(o.textContent)==='Xem theo lô'))};
  }
  function bbmtStartDomFallback(){
    if(!/[?&]notifyNo=IB\d+/i.test(location.search))return;
    let fingerprint='',stableSince=0,samples=0,sent='',sending=false;
    const startedAt=Date.now();
    const timer=setInterval(async()=>{
      if(Date.now()-startedAt>120000){clearInterval(timer);return;}
      let payload;
      try{payload=bbmtAdaptDomSnapshot(bbmtSnapshotVisibleDom());}catch{return;}
      if(!payload){fingerprint='';samples=0;return;}
      const next=JSON.stringify(payload);
      if(next!==fingerprint){fingerprint=next;stableSince=Date.now();samples=1;return;}
      samples++;
      // Let native fetch/XHR finish first. Require multiple stable snapshots
      // so a late estimate or partially rendered row is not accepted early.
      if(samples<3||Date.now()-stableSince<2100||next===sent||sending)return;
      sending=true;
      try{
        const result=await kqSend('BBMT_DOM_RESULT',payload,{requireAck:true,attempts:1});
        if(result?.ok)sent=next;
      }finally{sending=false;}
    },700);
    window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  }
  /* BBMT_PAGE_ERROR_START */
  function bbmtPageError(title,body){
    const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
    const heading=clean(title),text=clean(body);
    if(/egp-portal-contractor-selection-v2\s+tạm thời không có/i.test(text))return 'PORTLET_UNAVAILABLE';
    if(/^(?:access denied|403 forbidden|request rejected)\b/i.test(heading))return 'ACCESS_DENIED';
    // Observed public e-GP WAF page: title "Error", a display failure and
    // support/incident instructions. Recognize only this fixed signature;
    // never forward its body, request IDs or other page data to diagnostics.
    if(/^error$/i.test(heading)&&/\bthis page can(?:not|['’]t) be displayed\b/i.test(text)
      &&/\bcontact support\b/i.test(text))return 'ACCESS_DENIED';
    return null;
  }
  /* BBMT_PAGE_ERROR_END */
  function contentDomReady(){
    const pageError=bbmtPageError(document.title,document.body?.innerText);
    chrome.runtime.sendMessage({type:'CONTENT_READY',payload:{url:location.href,phase:'dom-ready',pageError}}).catch(()=>{});
    bbmtStartDomFallback();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',contentDomReady,{once:true});
  else contentDomReady();
})();
