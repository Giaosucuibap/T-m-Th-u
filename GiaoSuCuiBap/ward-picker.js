import { selectInvestorDirectoryEntry } from './investor-input.js';

/** Shared UI selector: administrative identities and organization entries stay distinct. */
export function wardCatalogErrorMessage(error){
  const raw=String(error?.message||error||'');
  const retry=' Tiêu chí đã chọn được giữ nguyên; chọn lại tỉnh để tải lại danh mục, hoặc xóa xã/phường nếu chỉ muốn lọc theo tỉnh.';
  if(/failed to fetch|networkerror|load failed|err_(internet|network|connection)|ngoại tuyến/i.test(raw))return 'Không kết nối được tới e-GP để lấy danh mục xã/phường. Kiểm tra kết nối mạng.'+retry;
  if(/timeout|quá thời gian|aborted/i.test(raw))return 'Lấy danh mục xã/phường quá thời gian.'+retry;
  const status=raw.match(/\b(?:40[013]|429|5\d\d)\b/)?.[0];
  if(status||/HTTP/i.test(raw))return `e-GP chưa trả được danh mục xã/phường${status?' (HTTP '+status+')':''}. Thử lại sau ít phút.`+retry;
  return 'Chưa lấy được danh mục xã/phường từ e-GP.'+retry;
}

export function createWardPicker({send,province,ward,list,hint,investor}){
  let options=[],organizations=[],saved=[],request=0,transferring=false;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const organizationChoice=()=>{
    if(transferring)return false;
    const picked=organizations.find(o=>o.label===ward.value.trim());
    if(!picked)return false;
    const originalValue=ward.value,originalSaved=saved;
    // Owner input listeners may synchronously read this picker to save criteria.
    // Remove the organization from the administrative field before notifying them.
    saved=[];ward.value='';transferring=true;
    let added=false;
    try{added=Boolean(investor&&selectInvestorDirectoryEntry(investor,picked,{append:true}));}
    finally{transferring=false;}
    if(!added){
      ward.value=originalValue;saved=originalSaved;
      ward.setCustomValidity?.('Chưa thêm được Ban QLDA. Kiểm tra tỉnh và giới hạn 20 chủ đầu tư / 500 ký tự.');
      ward.reportValidity?.();
      return false;
    }
    ward.setCustomValidity?.('');
    hint.textContent=`Đã thêm ${picked.name} vào Chủ đầu tư. Ban QLDA được lọc theo đơn vị, không dùng như mã xã/phường.`;
    ward.dispatchEvent?.(new Event('change',{bubbles:true}));
    return true;
  };
  for(const event of ['input','change'])ward.addEventListener?.(event,()=>{ward.setCustomValidity?.('');organizationChoice();});
  const read=()=>{
    organizationChoice();
    const value=ward.value.trim(),picked=options.find(o=>o.label===value);
    if(picked)return {ward:picked.name,wardIdentities:[{code:picked.code,parentCode:picked.parentCode,name:picked.name}]};
    if(saved.length&&value===saved[0].name)return {ward:value,wardIdentities:saved};
    return {ward:value};
  };
  async function load(){
    const id=++request,selectedProvince=province.value.trim();options=[];organizations=[];list.innerHTML='';
    if(!selectedProvince){hint.textContent='Chọn tỉnh trước để xem xã/phường và Ban QLDA có nguồn.';return;}
    hint.textContent='Đang lấy danh mục xã/phường và Ban QLDA…';
    try{
      const result=await send('AREA_OPTIONS',{province:selectedProvince});
      if(id!==request||province.value.trim()!==selectedProvince)return;
      if(!result?.ok)throw new Error(result?.message||'Chưa lấy được danh mục xã/phường.');
      options=(result.wardIdentities||[]).map(o=>({...o,label:`${o.name} · mã ${o.code} · tỉnh ${o.parentCode}${o.current?' · hiện hành':' · mã cũ'}`}));
      organizations=investor?(result.organizationOptions||[]).filter(o=>o.name&&o.queryValue).map(o=>({...o,label:`Ban QLDA · ${o.name} · ${o.provinceName}${o.eGpCode?' · mã e-GP '+o.eGpCode:' · tìm theo tên'}`})):[];
      list.innerHTML=[...organizations,...options].map(o=>`<option value="${esc(o.label)}"></option>`).join('');
      hint.textContent=[`${options.length} xã/phường · ${organizations.length} Ban QLDA. Chọn Ban sẽ thêm vào Chủ đầu tư; chọn xã dùng đúng cặp mã xã và tỉnh.`,result.organizationCoverage?.text].filter(Boolean).join(' ');
      const first=saved[0],picked=first&&options.find(o=>o.code===first.code&&o.parentCode===first.parentCode);
      if(picked&&ward.value.trim()===first.name)ward.value=picked.label;
    }catch(e){if(id===request&&province.value.trim()===selectedProvince)hint.textContent=wardCatalogErrorMessage(e);}
  }
  return {read,load,set(identities=[]){saved=Array.isArray(identities)?identities:[];},clear(){saved=[];options=[];organizations=[];ward.value='';ward.setCustomValidity?.('');list.innerHTML='';request++;}};
}
