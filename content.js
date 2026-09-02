(() => {
  const PAGE_SOURCE='BID_RADAR_ONE_PAGE';
  const CONTENT_SOURCE='BID_RADAR_ONE_CONTENT';
  function postPage(type,payload){ window.postMessage({source:CONTENT_SOURCE,type,payload},'*'); }
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
  const KQ_RESPONSE_TIMEOUT=25000;  // hạn chờ e-GP trả một trang kết quả

  let kqPlan=null;
  let kqPageWaiter=null;
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
    for(let attempt=1;attempt<=attempts;attempt++){
      try{
        const response=await chrome.runtime.sendMessage({type,payload});
        if(!requireAck||response?.ok===true)return response||{ok:true};
        lastMessage=response?.message||'Service worker chưa xác nhận dữ liệu.';
      }catch(error){ lastMessage=String(error?.message||error||lastMessage); }
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
  function kqClickSearch(){
    const buttons=[...document.querySelectorAll('button,a,[role="button"],input[type="submit"]')]
      .filter(el=>/^\s*(t(ì|i)m ki(ế|e)m|search)\s*$/i.test(clean(el.innerText||el.value||el.getAttribute('aria-label')||'')));
    const target=buttons[buttons.length-1];
    if(!target)return false;
    try{ target.click(); return true; }catch{ return false; }
  }

  /** Ô chọn số bản ghi/trang của e-GP (10 / 20 / 50). */
  function kqPageSizeSelect(){
    return [...document.querySelectorAll('select')]
      .find(s=>[...s.options].some(o=>o.value==='50')&&[...s.options].some(o=>o.value==='10'))||null;
  }
  function kqIsResultsView(){ return Boolean(kqPageSizeSelect()&&document.querySelector('.el-pagination')); }

  /** Chờ page-hook báo về một trang kết quả đã lọc. */
  function kqAwaitPage(){
    return new Promise(resolve=>{
      const timer=setTimeout(()=>{kqPageWaiter=null;resolve(null);},KQ_RESPONSE_TIMEOUT);
      kqPageWaiter=payload=>{clearTimeout(timer);kqPageWaiter=null;resolve(payload);};
    });
  }

  /**
   * Bắt e-GP phát lại truy vấn trang đầu bằng chính ô "số bản ghi/trang".
   *
   * Phải chọn một giá trị KHÁC giá trị đang hiển thị. Trước đây luôn đặt '50':
   * nếu ô đã là 50 — đúng tình huống lượt tra cứu thứ hai trên cùng một tab —
   * thì giá trị không đổi, e-GP bỏ qua sự kiện, không request nào được phát, và
   * lượt tra cứu chờ vô ích cho tới khi hết thời gian.
   *
   * Chọn giá trị nào không quan trọng: page-hook.js ghi đè `pageSize` bằng
   * `plan.pageSize` trước khi request rời trình duyệt.
   */
  function kqTriggerFirstPage(){
    const sel=kqPageSizeSelect();
    if(!sel)return Promise.resolve(null);
    const values=[...sel.options].map(o=>o.value);
    const next=values.find(v=>v!==sel.value)||values[0];
    if(!next)return Promise.resolve(null);
    const wait=kqAwaitPage();
    sel.value=next;
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    return wait;
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
  function kqSendPlanToHook(plan){
    return new Promise(resolve=>{
      let tries=0,settled=false;
      const onAck=event=>{
        if(event.source!==window||event.data?.source!==PAGE_SOURCE)return;
        if(event.data.type!=='KQLCNT_PLAN_ACK')return;
        if(event.data.payload?.planId!==plan.id)return;
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
        postPage('KQLCNT_PLAN',{id:plan.id,query:plan.query,pageSize:plan.pageSize||50});
      };
      const timer=setInterval(attempt,400);
      attempt();
    });
  }

  /** Bấm nút "trang sau" thật của e-GP. */
  function kqGoNextPage(){
    const next=document.querySelector('.el-pagination .btn-next');
    if(!next||next.disabled)return Promise.resolve(null);
    const wait=kqAwaitPage();
    next.click();
    return wait;
  }

  async function kqRunHarvest(){
    const plan=kqPlan;
    if(!plan)return;

    // `plan.query` do background.js dựng sẵn bằng lib/kqlcnt.js hoặc lib/bbmt.js.
    // Không chạy tiếp khi chưa có xác nhận: thu dữ liệu bằng truy vấn của e-GP
    // thay vì của phần mềm sẽ cho ra con số 0 trông y như một câu trả lời thật.
    if(!await kqSendPlanToHook(plan)){
      kqFinish(false,'Phần mềm không giao được tiêu chí cho trang e-GP (không có phản hồi từ trang). '
        +'Hãy tải lại trang e-GP (F5) rồi tra lại. Nếu vẫn vậy, vào chrome://extensions bấm ↻ Reload cho tiện ích.');
      return;
    }

    kqReport(`Đang hỏi e-GP về ${plan.label}...`);
    let page=await kqTriggerFirstPage();
    if(!page||!page.ok){
      kqFinish(false,`e-GP chưa trả dữ liệu cho lượt tra cứu${page&&page.status?` (HTTP ${page.status})`:''}. Hãy thử lại sau ít phút.`);
      return;
    }

    let collected=0,pageIndex=0,totalPages=1,totalElements=0,deliveryFailed=false;
    // maxPages = 0 nghĩa là KHÔNG giới hạn: lấy hết mọi trang e-GP trả về.
    const maxPages=Math.max(0,Number(plan.maxPages)||0);
    const pageLimit=maxPages||Infinity;

    while(page&&page.ok&&!kqCancelled){
      const envelope=page.data&&page.data.page;
      const rows=envelope&&Array.isArray(envelope.content)?envelope.content:[];
      totalPages=Number(envelope&&envelope.totalPages)||totalPages;
      totalElements=Number(envelope&&envelope.totalElements)||totalElements;

      // Gửi cả trang rỗng để service worker kiểm chứng chuỗi pageIndex đầy đủ.
      // Chỉ chuyển trang sau khi nhận ACK; retry là an toàn vì background chống
      // trùng theo job + pageIndex.
      const ack=await kqSend('KQLCNT_RESULTS',{
        planId:plan.id,mode:plan.mode,focusTaxCode:plan.focusTaxCode||'',
        records:rows,totalElements,totalPages,pageIndex,done:false
      },{requireAck:true,attempts:3});
      if(!ack?.ok){ deliveryFailed=true; break; }
      collected+=rows.length;

      pageIndex+=1;
      // Dừng khi hết trang, chạm trần (nếu có), hoặc trang rỗng — điều kiện
      // cuối là chốt an toàn phòng khi e-GP báo totalPages sai.
      if(pageIndex>=totalPages||pageIndex>=pageLimit||!rows.length)break;

      const of=maxPages?Math.min(totalPages,maxPages):totalPages;
      kqReport(`Đã lấy ${collected}/${totalElements} kết quả (trang ${pageIndex}/${of})...`);
      await new Promise(r=>setTimeout(r,KQ_PAGE_PAUSE));
      if(kqCancelled)break;
      page=await kqGoNextPage();
    }

    const capped=Boolean(maxPages)&&totalPages>maxPages;
    const expectedPages=Math.min(totalPages,pageLimit);
    const incomplete=deliveryFailed||(!kqCancelled&&!capped&&pageIndex<expectedPages&&(!page||!page.ok));
    const finalAck=await kqSend('KQLCNT_RESULTS',{
      planId:plan.id,mode:plan.mode,focusTaxCode:plan.focusTaxCode||'',
      records:[],totalElements,totalPages,pageIndex,capped,
      // Báo lên tiêu chí nào đặt được, tiêu chí nào không — để giao diện nói
      // thật với người dùng thay vì trình bày kết quả thiếu như thể đủ.
      applied:plan.applied||null,
      cancelled:kqCancelled,partial:incomplete,done:true
    },{requireAck:true,attempts:3});
    const transferFailed=!finalAck?.ok;
    kqFinish(!incomplete&&!transferFailed,kqCancelled
      ?`Đã dừng theo yêu cầu: lấy được ${collected} kết quả của ${plan.label}.`
      :transferFailed
        ?`Không xác nhận được trang kết thúc với tiện ích. Dữ liệu đã nhận được sẽ được giữ và đánh dấu chưa đầy đủ.`
      :deliveryFailed
        ?`Mất kết nối khi chuyển một trang dữ liệu. Đã giữ ${collected} kết quả và đánh dấu chưa đầy đủ.`
      :incomplete
        ?`e-GP ngừng trả dữ liệu sau ${pageIndex}/${totalPages} trang. Đã giữ ${collected} kết quả và đánh dấu là chưa đầy đủ.`
        :`Xong: ${collected} kết quả của ${plan.label}${capped?` (mới lấy ${maxPages} trang đầu)`:''}.`);
  }

  function kqFinish(ok,message){
    const donePlan=kqPlan?{planId:kqPlan.id,mode:kqPlan.mode||'',focusTaxCode:kqPlan.focusTaxCode||''}:{};
    const cancelled=kqCancelled;
    postPage('KQLCNT_PLAN',null);
    kqSaveState(null);
    kqPlan=null;
    kqCancelled=false;
    kqReport(message,ok?'success':'error');
    // KQLCNT_DONE là chốt cuối của job. Gửi có ACK/retry để service worker
    // vừa được Chrome khởi động lại vẫn có cơ hội nhận tín hiệu hoàn tất.
    void kqSend('KQLCNT_DONE',{...donePlan,ok,cancelled,partial:!ok,message},
      {requireAck:true,attempts:3});
  }

  /** Điểm vào: bắt đầu một lượt tra cứu KQLCNT. */
  async function kqStart(plan){
    kqPlan=plan;
    kqCancelled=false;
    kqSaveState(plan);
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
        kqFinish(false,'Không thấy ô tìm kiếm trên trang e-GP. Hãy mở trang Tra cứu › Lựa chọn nhà thầu rồi chạy lại.');
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
      kqFinish(false,'Không thấy nút "Tìm kiếm" trên trang e-GP. Hãy mở lại trang tra cứu rồi thử lại.');
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
    const planId=kqPlan&&kqPlan.id;
    if(!planId)return;
    const boot=setInterval(()=>{
      if(!kqPlan||kqPlan.id!==planId){clearInterval(boot);return;}
      if(!kqIsResultsView())return;
      clearInterval(boot);
      kqRunHarvest();
    },700);
    setTimeout(()=>{
      clearInterval(boot);
      if(kqPlan&&kqPlan.id===planId&&!kqIsResultsView()){
        kqFinish(false,'Trang e-GP không mở được màn hình kết quả trong 40 giây. '
          +'Hãy mở trang Tra cứu Lựa chọn nhà thầu, bấm "Tìm kiếm" một lần cho ra danh sách, rồi chạy lại.');
      }
    },40000);
  }

  // Nhận trang kết quả đã lọc, và bảng nhà thầu của biên bản mở thầu.
  window.addEventListener('message',event=>{
    if(event.source!==window||event.data?.source!==PAGE_SOURCE)return;
    const payload=event.data.payload||{};

    if(event.data.type==='KQLCNT_PAGE'){
      if(!kqPlan||payload.planId!==kqPlan.id)return;
      if(kqPageWaiter)kqPageWaiter(payload);
      return;
    }

    // Trang Biên bản mở thầu vừa tải xong bảng nhà thầu tham dự. Gửi thẳng về
    // nền — kể cả khi người dùng tự mở trang, không cần đang quét.
    if(event.data.type==='BBMT_BIDDERS'){
      kqSend('BBMT_BIDDERS',{url:payload.url||location.href,rows:payload.rows||[]});
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
    if(message.type==='KQLCNT_PROBE'){
      sendResponse({ok:true,resultsView:kqIsResultsView(),busy:Boolean(kqPlan)});
      return true;
    }
    if(message.type==='KQLCNT_START'){
      // Chốt cuối: một tab chỉ chạy MỘT lượt tra cứu. `kqPlan` và `kqlcntPlan`
      // là biến đơn của tab, nên nhận việc thứ hai sẽ ghi đè tiêu chí và lượt
      // đang chạy chết lặng lẽ. Background đã tránh gửi vào tab đang bận; chốt
      // này chặn nốt trường hợp thông điệp tới trước khi nó kịp biết.
      if(kqPlan&&message.payload&&message.payload.id!==kqPlan.id){
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
      // Dừng sau khi trang đang chờ trả về, không cắt ngang giữa chừng để
      // dữ liệu đã lấy vẫn toàn vẹn.
      kqCancelled=true;
      if(kqPlan)kqReport('Đang dừng sau khi nhận nốt trang hiện tại...');
      sendResponse({ok:true});
      return true;
    }
  });

  chrome.runtime.sendMessage({type:'CONTENT_READY',payload:{url:location.href}}).catch(()=>{});
})();
