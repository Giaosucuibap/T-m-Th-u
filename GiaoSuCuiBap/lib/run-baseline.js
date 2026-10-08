/* ============================================================================
 *  KẾT QUẢ LƯỢT TRƯỚC + NHÃN MỚI / ĐỔI (4.17.0)
 *
 *  Bấm tìm với tiêu chí đã từng tìm: hiện NGAY kết quả lượt trước (ghi rõ là
 *  của lượt nào, lúc nào), trong khi lượt mới chạy ngầm. Lượt mới xong thì so
 *  với lượt trước bằng ẢNH CHỤP dữ liệu tại thời điểm tìm của từng lượt
 *  (compareSearchRuns của lib/warehouse-maintenance.js) — không lấy dữ liệu
 *  hôm nay điền vào lượt cũ — và gắn nhãn:
 *    • "Mới"  — có ở lượt này, không có ở lượt trước, KHI CẢ HAI lượt đã xác
 *               nhận tải đủ. Nếu một lượt chưa đủ, chỉ được nói "Chưa thấy ở
 *               lượt trước" — không khẳng định là gói mới đăng.
 *    • "Đổi"  — có ở cả hai, khác thông tin (kèm danh sách trường đổi).
 * ========================================================================== */

/** Các trường tiêu chí NGƯỜI DÙNG nhập. Mã tỉnh do máy suy ra thì bỏ qua. */
const CRITERIA_FIELDS=['category','keyword','investor','province','ward','mustKeywords','excludeKeywords','minPrice','maxPrice'];
const norm=v=>v===null||v===undefined?'':String(v).normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi');

export function criteriaKey(c={}){
  const out=CRITERIA_FIELDS.map(k=>[k,norm(c?.[k])]);
  const wards=(Array.isArray(c?.wardIdentities)?c.wardIdentities:[]).map(w=>`${norm(w?.code)}@${norm(w?.parentCode)}`).sort();
  return JSON.stringify([...out,['wardIdentities',wards]]);
}

/** Lượt trước gần nhất, cùng tiêu chí, đã HOÀN TẤT (SUCCESS) — lượt dở dang
 *  làm mốc thì nhãn "Mới" sẽ sai. */
export function findBaseline(runs=[],current){
  if(!current?.criteria)return null;
  const key=criteriaKey(current.criteria),started=Date.parse(current.startedAt)||Infinity;
  return (Array.isArray(runs)?runs:[])
    .filter(r=>r&&r.id!==current.id&&r.mode==='form'&&r.status==='SUCCESS'&&!r.partial&&r.criteria
      &&(Date.parse(r.startedAt)||0)<started&&criteriaKey(r.criteria)===key)
    .sort((a,b)=>(Date.parse(b.startedAt)||0)-(Date.parse(a.startedAt)||0))[0]||null;
}

/** Từ kết quả compareSearchRuns(lượtTrước, lượtNày) → nhãn cho từng gói. */
export function diffBadges(cmp){
  const badges=new Map();
  if(!cmp?.ok||!Array.isArray(cmp.rows))return {badges,summary:null};
  const sure=Boolean(cmp.left?.coverage?.complete&&cmp.right?.coverage?.complete);
  let fresh=0,changed=0,gone=0,unavailable=0;
  for(const row of cmp.rows){
    if(row.kind==='rightOnly'){
      fresh++;
      badges.set(row.key,sure?{kind:'new',label:'Mới',title:'Không có trong lượt trước cùng tiêu chí; cả hai lượt đã tải đủ.'}
        :{kind:'unseen',label:'Chưa thấy ở lượt trước',title:'Một trong hai lượt chưa xác nhận tải đủ — không khẳng định đây là gói mới đăng.'});
    }else if(row.kind==='changed'){
      changed++;
      const fields=[...new Set((row.changes||[]).map(c=>c.label||c.field))];
      badges.set(row.key,{kind:'changed',label:'Đổi',title:`Khác lượt trước: ${fields.join(', ')}`,fields});
    }else if(row.kind==='leftOnly')gone++;
    else if(row.kind==='unavailable')unavailable++;
  }
  return {badges,summary:{sure,fresh,changed,gone,unavailable,warnings:Array.isArray(cmp.warnings)?cmp.warnings:[]}};
}

export function diffSummaryText(summary,baselineLabel){
  if(!summary)return '';
  const parts=[summary.sure?`${summary.fresh} gói mới`:`${summary.fresh} gói chưa thấy ở lượt trước`,`${summary.changed} gói đổi thông tin`];
  if(summary.sure)parts.push(`${summary.gone} gói không còn trong kết quả`);
  return `So với lượt trước cùng tiêu chí (${baselineLabel}): ${parts.join(' · ')}.`
    +(summary.unavailable?` ${summary.unavailable} gói thiếu ảnh chụp cũ để đối chiếu.`:'')
    +(summary.sure?'':' Một trong hai lượt chưa xác nhận tải đủ nên không khẳng định gói nào là mới đăng.');
}
