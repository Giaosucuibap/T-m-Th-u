/* ============================================================================
 *  Ô CHỌN XÃ/PHƯỜNG — hiện đúng cặp mã xã + mã tỉnh, không đoán theo tên.
 * ========================================================================== */

/**
 * Đổi lỗi kỹ thuật thành câu người dùng đọc được VÀ BIẾT PHẢI LÀM GÌ.
 *
 * Trước đây chỗ này nhả thẳng `e.message` ra màn hình, nên người dùng nhìn
 * thấy đúng hai chữ "Failed to fetch" nằm dưới ô Xã/Phường: tiếng Anh, không
 * nói cái gì hỏng, không nói phải làm sao, và ô chọn xã thì im lặng ngừng hoạt
 * động. Người dùng chỉ biết là "nó không chạy".
 *
 * Câu thay thế phải trả lời được ba điều: hỏng ở đâu, hậu quả là gì, làm gì
 * tiếp. Và phải nói rõ tiêu chí xã ĐANG KHÔNG ĐƯỢC ÁP DỤNG — im lặng bỏ tiêu
 * chí là kiểu hỏng tệ nhất, vì kết quả trả về trông vẫn bình thường.
 */
function loiNguoiDungDoc(error){
  const raw=String(error?.message||error||'');
  if(/failed to fetch|networkerror|load failed|err_(internet|network|connection)/i.test(raw)){
    return 'Không kết nối được tới e-GP để lấy danh mục xã/phường. '
      + 'Kiểm tra mạng rồi bấm lại; trong lúc đó tiêu chí xã/phường CHƯA được áp dụng.';
  }
  if(/\b(40[013]|429|5\d\d)\b|HTTP/i.test(raw)){
    return `e-GP đang không trả danh mục xã/phường (${raw}). `
      + 'Thử lại sau ít phút; trong lúc đó hãy lọc theo Tỉnh/Thành phố.';
  }
  if(/timeout|quá thời gian|aborted/i.test(raw)){
    return 'Lấy danh mục xã/phường quá lâu nên đã dừng, tiêu chí xã/phường CHƯA được áp dụng. '
      + 'Bấm chọn lại tỉnh để thử lần nữa.';
  }
  return `Chưa lấy được danh mục xã/phường: ${raw || 'không rõ nguyên nhân'}. `
    + 'Tiêu chí xã/phường chưa được áp dụng — hãy lọc theo Tỉnh/Thành phố rồi thử lại.';
}

export function createWardPicker({send,province,ward,list,hint}){
  let options=[],saved=[],request=0;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read=()=>{
    const value=ward.value.trim(),picked=options.find(o=>o.label===value);
    if(picked)return {ward:picked.name,wardIdentities:[{code:picked.code,parentCode:picked.parentCode,name:picked.name}]};
    if(saved.length&&value===saved[0].name)return {ward:value,wardIdentities:saved};
    return {ward:value};
  };
  async function load(){
    const id=++request,selectedProvince=province.value.trim();options=[];list.innerHTML='';
    if(!selectedProvince){hint.textContent='Chọn tỉnh trước, rồi chọn xã/phường kèm mã.';return;}
    hint.textContent='Đang lấy danh mục xã/phường kèm mã tỉnh…';
    try{
      const result=await send('AREA_OPTIONS',{province:selectedProvince});
      if(id!==request||province.value.trim()!==selectedProvince)return;
      if(!result?.ok)throw new Error(result?.message||'Chưa lấy được danh mục xã/phường.');
      options=(result.wardIdentities||[]).map(o=>({...o,label:`${o.name} · mã ${o.code} · tỉnh ${o.parentCode}${o.current?' · hiện hành':' · mã cũ'}`}));
      list.innerHTML=options.map(o=>`<option value="${esc(o.label)}"></option>`).join('');
      hint.textContent=options.length?'Chọn mã xã/phường và mã tỉnh đi kèm; tên trùng được hiển thị thành các lựa chọn riêng.':'Chưa có danh mục kèm mã để xác nhận xã/phường.';
      const first=saved[0],picked=first&&options.find(o=>o.code===first.code&&o.parentCode===first.parentCode);
      if(picked&&ward.value.trim()===first.name)ward.value=picked.label;
    }catch(e){if(id===request)hint.textContent=loiNguoiDungDoc(e);}
  }
  return {read,load,set(identities=[]){saved=Array.isArray(identities)?identities:[];},clear(){saved=[];options=[];ward.value='';list.innerHTML='';request++;}};
}
