import { icon, hydrateIcons } from './lib/icons.js';
hydrateIcons();
const nav = [
  ['search.html','search','Tìm gói thầu'],
  ['dashboard.html','grid','Kho gói đã lưu'],
  ['hunts.html','radar','Bộ săn tự động'],
  ['checklist.html','check','Checklist hồ sơ'],
  ['plans.html','plan','Kế hoạch lựa chọn NT'],
  ['winners.html','trophy','Nhà thầu trúng thầu'],
  ['bidopen.html','clock','Mở thầu · Chờ kết quả'],
  ['market.html','map','Phân tích địa bàn'],
  ['profile.html','building','Hồ sơ nhà thầu 360°'],
  ['capability.html','check','Năng lực công ty'],
  ['contracts.html','plan','Hợp đồng tương tự'],
  ['outline.html','plan','Khung BPTC'],
  ['timeline.html','clock','Nhật ký điều chỉnh'],
  ['rivals.html','compare','Đối thủ địa bàn'],
  ['investor.html','building','Hồ sơ chủ đầu tư'],
  ['analytics.html','chart','Phân tích thị trường'],
  ['options.html','settings','Cấu hình']
];
const file=location.pathname.split('/').pop();
const shell=document.getElementById('workspace-nav');
const navLink=([href,i,label])=>`<a href="${href}" ${file===href?'aria-current="page"':''}>${icon(i,19)}<span>${label}</span>${file===href?'<i></i>':''}</a>`;
if(shell) shell.innerHTML=`<a class="ws-brand" href="search.html"><img src="icons/brand-mark.svg" width="42" height="42" alt=""><span>Giáo Sư Cùi Bắp<small>KHÔNG GIAN TÌM THẦU</small></span></a><div class="nav-caption">QUY TRÌNH LÀM VIỆC</div><nav aria-label="Chức năng chính">${nav.slice(0,4).map(navLink).join('')}<details class="advanced-nav" ${nav.slice(4).some(n=>n[0]===file)?'open':''}><summary>Nâng cao</summary><div>${nav.slice(4).map(navLink).join('')}<a href="diagnostics.html">${icon('shield',19)}<span>Kiểm tra dữ liệu</span></a></div></details></nav><div class="ws-side-bottom">${icon('shield',19)}<div>Dữ liệu trên máy bạn<small>Không lưu mật khẩu e-GP</small></div></div><div class="ws-version">PHIÊN BẢN ${chrome.runtime.getManifest().version}<span>VN / UTC+7</span></div>`;
const main=document.querySelector('main');
if(main){
  const flow=document.createElement('nav');flow.className='workflow-strip';flow.setAttribute('aria-label','Các bước xử lý gói thầu');
  flow.innerHTML=nav.slice(0,4).map(([href,i,label],index)=>`<a href="${href}" ${href===file?'aria-current="step"':''}><span class="workflow-number">${index+1}</span><span>${label}</span>${icon(i,16)}</a>`).join('');
  const top=main.querySelector('.ws-topbar');if(top)top.after(flow);else main.prepend(flow);
}
// Only the document's top-level navigation header is grouped. Package/result
// headers and their original source links are never rewritten by the shell.
document.querySelectorAll('body > header').forEach(header=>{
  const links=[...header.querySelectorAll(':scope > a[href]')];
  if(!links.length)return;
  header.classList.add('legacy-page-header');
  const advanced=document.createElement('details');advanced.className='legacy-advanced';
  const summary=document.createElement('summary');summary.textContent='Nâng cao';
  const tools=document.createElement('nav');tools.className='legacy-tools';tools.setAttribute('aria-label','Chức năng nâng cao');
  for(const a of links){
    const item=nav.find(x=>x[0]===a.getAttribute('href'));
    if(item){a.textContent='';a.insertAdjacentHTML('beforeend',icon(item[1],16));a.append(' '+item[2]);if(item[0]===file)a.setAttribute('aria-current','page');}
    tools.append(a);
  }
  // Every legacy page exposes the same advanced tools; retain additional
  // original header links as well, including their attributes and listeners.
  const present=new Set(links.map(a=>a.getAttribute('href')));
  for(const item of [...nav.slice(4),['diagnostics.html','shield','Kiểm tra dữ liệu']]){
    if(!present.has(item[0]))tools.insertAdjacentHTML('beforeend',navLink(item));
  }
  advanced.append(summary,tools);header.append(advanced);
  advanced.addEventListener('keydown',event=>{if(event.key==='Escape'&&advanced.open){advanced.open=false;summary.focus();event.stopPropagation();}});
  document.addEventListener('click',event=>{if(advanced.open&&!advanced.contains(event.target))advanced.open=false;});
});
document.querySelectorAll('[data-version]').forEach(el=>{el.textContent=chrome.runtime.getManifest().version;});
