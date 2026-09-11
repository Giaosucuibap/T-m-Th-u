import { icon, hydrateIcons } from './lib/icons.js';
hydrateIcons();
const nav = [
  ['search.html','search','Tìm thông báo mời thầu'],
  ['hunts.html','radar','Bộ săn tự động'],
  ['dashboard.html','grid','Bàn điều hành'],
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
if(shell) shell.innerHTML=`<a class="ws-brand" href="search.html"><img src="icons/brand-mark.svg" width="42" height="42" alt=""><span>Giáo Sư Cùi Bắp<small>KHÔNG GIAN TÌM THẦU</small></span></a><div class="nav-caption">KHÁM PHÁ CƠ HỘI</div><nav aria-label="Chức năng chính">${nav.map(([href,i,label])=>`<a href="${href}" ${file===href?'aria-current="page"':''}>${icon(i,19)}<span>${label}</span>${file===href?'<i></i>':''}</a>`).join('')}</nav><div class="ws-side-bottom">${icon('shield',19)}<div>Dữ liệu trên máy bạn<small>Không lưu mật khẩu e-GP</small></div></div><div class="ws-version">PHIÊN BẢN ${chrome.runtime.getManifest().version}<span>VN / UTC+7</span></div>`;
// Keep all legacy tools reachable while giving their headers the same icon family.
document.querySelectorAll('header a[href]').forEach(a=>{
  const item=nav.find(x=>x[0]===a.getAttribute('href'));
  if(item){a.textContent='';a.insertAdjacentHTML('beforeend',icon(item[1],16));a.append(' '+item[2]);if(item[0]===file)a.setAttribute('aria-current','page');}
});
document.querySelectorAll('[data-version]').forEach(el=>{el.textContent=chrome.runtime.getManifest().version;});
