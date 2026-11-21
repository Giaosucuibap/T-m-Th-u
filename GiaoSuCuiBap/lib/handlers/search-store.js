/* LỆNH TRA CỨU KHO (tách khỏi background.js ở 4.19.0): đọc trạng thái trang Tìm
   gói thầu, Tìm nhanh (Ctrl K), lưu/xoá bộ tìm kiếm có tên. Chỉ đọc/ghi kho trên
   máy — không mở tab, không gọi mạng. */
import { quickFindPackages } from '../quick-find-core.js';

export function searchStoreHandlers({ getState, save, withLock, appStorage, searchStateRuntime, KEYS, SAVED_SEARCHES, safeSavedSearches, isEgpUrl, uuid = () => crypto.randomUUID() }) {
  return {
    GET_SEARCH_STATE: (p) => searchStateRuntime.read(p || {}),
    /* Tìm nhanh: chỉ đọc kho trên máy, trả tối đa 8 gói với vài trường cần hiện. Không có
       trong CONTENT_MESSAGE_TYPES nên trang e-GP không gọi được. */
    QUICK_FIND: async (p) => {
      const {tenders=[]}=await appStorage.get({[KEYS.tenders]:[]});
      const found=quickFindPackages(tenders,String(p?.q??'').slice(0,200));
      const pick=t=>({key:t.key,notifyNo:t.notifyNo||'',bidNo:t.bidNo||'',displayCode:t.displayCode||'',bidName:t.bidName||'',
        investorName:t.investorName||'',location:t.location||'',price:t.price??null,closeDate:t.closeDate||'',detailUrl:isEgpUrl(t.detailUrl)?t.detailUrl:''});
      return {ok:true,query:found.query,exact:found.exact.map(pick),hits:found.hits.map(pick),total:found.total};
    },
    SAVE_NAMED_SEARCH: async (p) => {
      const item=safeSavedSearches([{id:p?.id||uuid(),name:p?.name,criteria:p?.criteria}])[0];
      if(!item)throw new Error('Tên hoặc tiêu chí tìm kiếm không hợp lệ.');
      const rows=await withLock(async()=>{
        const s=await getState();
        const rest=s.savedSearches.filter(x=>x.id!==item.id);
        if(rest.length>=30)throw new Error('Đã lưu 30 bộ tìm kiếm. Hãy xóa một bộ trước.');
        const rows=[item,...rest];await save({[SAVED_SEARCHES]:rows});return rows;
      });
      return {ok:true,savedSearches:rows};
    },
    DELETE_NAMED_SEARCH: async (p) => {
      const rows=await withLock(async()=>{const s=await getState();const rows=s.savedSearches.filter(x=>x.id!==p?.id);await save({[SAVED_SEARCHES]:rows});return rows;});
      return {ok:true,savedSearches:rows};
    }
  };
}
