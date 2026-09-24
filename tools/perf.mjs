/* Đo tốc độ LỌC + CHẤM trên kho lớn: đây là đường người dùng gặp mỗi lần gõ
   vào ô tìm hoặc đổi bộ lọc. Đo trung vị 7 lượt, bỏ lượt đầu (khởi động JIT). */
import { createResultView } from '../lib/result-view.js';
import { createSearchIndex, selectIndexedRows } from '../lib/search-index.js';

const N = Number(process.argv[2] || 20000);
const P = ['68','75','56','66','64','51'];
const kho = Array.from({length:N},(_,i)=>({
  key:'k'+i, notifyNo:'IB26'+String(1000000+i), bidName:'Thi công xây lắp công trình thủy lợi số '+i,
  price: 1e9 + (i%997)*1e6, score: i%101, closeDate:`2026-1${i%2?1:2}-${String(1+i%28).padStart(2,'0')}T09:00:00`,
  locations:[{provCode:P[i%P.length]}], watchlisted:i%17===0, investField:'XL'
}));
const luot = { id:'r1', foundKeys:kho.map(t=>t.key), criteria:{province:'Lâm Đồng'}, resultStates:{} };

const do_ = (ten, fn, lan=7) => {
  const t=[]; for(let i=0;i<lan;i++){const a=performance.now();fn();t.push(performance.now()-a);}
  t.shift(); t.sort((x,y)=>x-y);
  console.log(`  ${ten.padEnd(46)} trung vị ${t[t.length>>1].toFixed(0).padStart(6)} ms`);
};
console.log(`KHO ${N.toLocaleString('vi-VN')} GÓI`);
do_('dựng chỉ mục (1 lần mỗi lượt tra)', ()=>createSearchIndex(kho));
const idx = createSearchIndex(kho);
do_('chọn theo mã tỉnh qua chỉ mục', ()=>selectIndexedRows(idx,{provinceCodes:['68']}));
do_('chọn theo khoảng ngày đóng thầu', ()=>selectIndexedRows(idx,{closeFrom:Date.UTC(2026,10,1),closeTo:Date.UTC(2026,10,30)}));
import { resultRows } from '../lib/result-view.js';
do_('KHÔNG tái dùng chỉ mục (chấm lại cả kho)', ()=>createResultView(kho,luot,{criteriaState:'',text:'thủy lợi'}));
const idxDaCham = createSearchIndex(resultRows(kho,luot));
do_('CÓ tái dùng chỉ mục — đúng cách search.js làm', ()=>createResultView(kho,luot,{criteriaState:'',text:'thủy lợi'},{index:idxDaCham}));
do_('  ... đổi bộ lọc điểm', ()=>createResultView(kho,luot,{criteriaState:'',minScore:70},{index:idxDaCham}));
do_('  ... đổi mã tỉnh', ()=>createResultView(kho,luot,{criteriaState:'',provinceCode:'68'},{index:idxDaCham}));
