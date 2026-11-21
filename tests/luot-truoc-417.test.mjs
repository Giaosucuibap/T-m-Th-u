/* ============================================================================
 *  KẾT QUẢ LƯỢT TRƯỚC + NHÃN MỚI/ĐỔI  (lib/run-baseline.js + search.js)
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {criteriaKey, findBaseline, diffBadges, diffSummaryText} from '../GiaoSuCuiBap/lib/run-baseline.js';
import {compareSearchRuns} from '../GiaoSuCuiBap/lib/warehouse-maintenance.js';

const C={province:'Lâm Đồng',category:'XL',keyword:'kênh mương'};
const run=(id,startedAt,o={})=>({id,mode:'form',status:'SUCCESS',startedAt,criteria:C,...o});

test('cùng tiêu chí: bỏ qua hoa/thường, khoảng trắng, dạng Unicode và mã tỉnh máy tự suy ra', ()=>{
  assert.equal(criteriaKey({...C,provinces:['68','703']}),criteriaKey({province:' lâm  đồng ',category:'XL',keyword:'Kênh Mương'.normalize('NFD')}));
  assert.notEqual(criteriaKey(C),criteriaKey({...C,keyword:'kênh'}));
  assert.notEqual(criteriaKey(C),criteriaKey({...C,minPrice:3e9}));
  assert.notEqual(criteriaKey({...C,wardIdentities:[{code:'1',parentCode:'68'}]}),criteriaKey({...C,wardIdentities:[{code:'2',parentCode:'68'}]}));
});

test('mốc so sánh = lượt TRƯỚC gần nhất, cùng tiêu chí, đã HOÀN TẤT', ()=>{
  const runs=[run('moi','2026-10-08T03:00:00Z',{status:'RUNNING'}),run('dangdo','2026-10-08T02:00:00Z',{status:'PARTIAL'}),
    run('loi','2026-10-08T01:30:00Z',{status:'ERROR'}),run('khac','2026-10-08T01:20:00Z',{criteria:{...C,keyword:'trạm bơm'}}),
    run('dung','2026-10-08T01:00:00Z'),run('cu','2026-10-07T01:00:00Z'),run('sau','2026-10-08T04:00:00Z'),
    run('thieu','2026-10-08T01:10:00Z',{partial:true})];
  assert.equal(findBaseline(runs,runs[0]).id,'dung');
  assert.equal(findBaseline([runs[0]],runs[0]),null);
  assert.equal(findBaseline(runs,{id:'x'}),null);
});

function snap(price,closeDate='2026-10-20T03:00:00.000Z'){return {bidName:'Kênh mương',price,closeDate,publicDate:'2026-10-01T03:00:00.000Z',investorName:'Ban QLDA',location:'Lâm Đồng',investField:'XL',filterState:'MATCH'};}
const done={complete:true};
test('nhãn: Mới khi cả hai lượt tải đủ; Đổi kèm trường đổi; không nhãn cho gói giống', ()=>{
  const a={id:'a',foundKeys:['k1','k2','k3'],resultStates:{k1:snap(1e9),k2:snap(2e9),k3:snap(3e9)},coverage:done};
  const b={id:'b',foundKeys:['k1','k2','k4'],resultStates:{k1:snap(1e9),k2:snap(2.5e9,'2026-10-25T03:00:00.000Z'),k4:snap(4e9)},coverage:done};
  const {badges,summary}=diffBadges(compareSearchRuns(a,b));
  assert.equal(badges.get('k4').label,'Mới');
  assert.equal(badges.get('k2').label,'Đổi');
  assert.deepEqual(badges.get('k2').fields,['Giá gói thầu','Hạn đóng thầu']);
  assert.equal(badges.has('k1'),false);
  assert.deepEqual({fresh:summary.fresh,changed:summary.changed,gone:summary.gone,sure:summary.sure},{fresh:1,changed:1,gone:1,sure:true});
  assert.match(diffSummaryText(summary,'08/10 09:00'),/1 gói mới · 1 gói đổi thông tin · 1 gói không còn trong kết quả/);
});

test('một lượt CHƯA tải đủ → không được nói "Mới", không nói "không còn"', ()=>{
  const a={id:'a',foundKeys:['k1'],resultStates:{k1:snap(1e9)},coverage:{complete:false}};
  const b={id:'b',foundKeys:['k1','k4'],resultStates:{k1:snap(1e9),k4:snap(4e9)},coverage:done};
  const {badges,summary}=diffBadges(compareSearchRuns(a,b));
  assert.equal(badges.get('k4').label,'Chưa thấy ở lượt trước');
  assert.equal(summary.sure,false);
  const text=diffSummaryText(summary,'x');
  assert.doesNotMatch(text,/gói mới ·|không còn trong kết quả/);
  assert.match(text,/không khẳng định gói nào là mới đăng/);
});

test('kết quả so sánh hỏng/rỗng → không nhãn nào, không lỗi', ()=>{
  for(const bad of [null,{ok:false},{ok:true}])assert.equal(diffBadges(bad).badges.size,0);
});

test('trang tìm: chỉ hiện lượt trước khi lượt MỚI chưa có dữ liệu, ghi rõ là cũ; đổi lượt là bỏ mốc', ()=>{
  const src=fs.readFileSync(new URL('../GiaoSuCuiBap/search.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  assert.match(src,/const showingOld=running&&!view\.all\.length&&Boolean\(baseline\.state&&baseline\.runId===runId\);/);
  assert.match(src,/có thể đã cũ/);
  assert.match(src,/if\(baseline\.runId!==run\.id\)\{/);
  assert.match(src,/r\?\.ok&&r\.selectedRun\?\.id===baseline\.run\.id/,'chỉ nhận đúng lượt mốc đã hỏi');
  assert.match(src,/<div class="ws-result-top">\$\{badgeFor\(t\.key\)\}/);
});
