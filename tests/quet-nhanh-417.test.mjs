/* ============================================================================
 *  QUÉT NHANH PHẦN MỚI CHO BỘ SĂN TBMT  (lib/delta-scan.js + nối dây)
 *  Trọng tâm: KHÔNG BAO GIỜ được kết luận "không có gói mới" khi chưa chắc.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planScan, addPublicDateFloor, evaluateScan, safeDeltaState, DELTA_OVERLAP_MS, FULL_EVERY_MS, MAX_AUDIT_KEYS} from '../GiaoSuCuiBap/lib/delta-scan.js';
import {validateHunt} from '../GiaoSuCuiBap/lib/hunts.js';

const NOW=Date.parse('2026-10-08T03:00:00Z');
const H=36e5;
const iso=t=>new Date(t).toISOString();
const hunt=(o={})=>({kind:'tbmt',delta:true,deltaState:{},...o});
const job=(keys,o={})=>({status:'SUCCESS',partial:false,capped:false,foundKeys:keys,startedAt:iso(NOW),...o});

test('lượt đầu tiên, sau 24 giờ, khi tắt, khi đã tự tắt, khi KHLCNT → quét ĐẦY ĐỦ', ()=>{
  assert.equal(planScan(hunt(),NOW).mode,'full');
  assert.equal(planScan(hunt({deltaState:{lastFullAt:iso(NOW-FULL_EVERY_MS)}}),NOW).reason,'daily-full');
  assert.equal(planScan(hunt({delta:false,deltaState:{lastFullAt:iso(NOW-H)}}),NOW).mode,'full');
  assert.equal(planScan(hunt({deltaState:{lastFullAt:iso(NOW-H),broken:true}}),NOW).reason,'broken');
  assert.equal(planScan(hunt({kind:'plan',deltaState:{lastFullAt:iso(NOW-H)}}),NOW).mode,'full');
  assert.equal(planScan(hunt({deltaState:{lastFullAt:iso(NOW-H)}}),NOW,{forceFull:true}).reason,'forced');
});

test('quét nhanh lùi 1 ngày so với lần thành công gần nhất', ()=>{
  const p=planScan(hunt({deltaState:{lastFullAt:iso(NOW-5*H),lastOkAt:iso(NOW-2*H)}}),NOW);
  assert.equal(p.mode,'delta');
  assert.equal(p.since,NOW-2*H-DELTA_OVERLAP_MS);
});

test('sàn ngày đăng: epoch mili-giây (định dạng đã đo được), thay thế sàn cũ, không đụng bộ lọc khác', ()=>{
  const q={index:'es',filters:[{fieldName:'type',searchType:'in',fieldValues:['x']},{fieldName:'publicDate',searchType:'range',from:1,to:2}]};
  const r=addPublicDateFloor(q,NOW-DELTA_OVERLAP_MS,NOW);
  assert.deepEqual(r.filters,[{fieldName:'type',searchType:'in',fieldValues:['x']},{fieldName:'publicDate',searchType:'range',from:NOW-DELTA_OVERLAP_MS,to:NOW+DELTA_OVERLAP_MS}]);
  assert.equal(q.filters.length,2,'không sửa truy vấn gốc');
});

const st0={lastFullAt:iso(NOW-5*H),lastOkAt:iso(NOW-5*H)};
const deltaPlan={mode:'delta',since:NOW-5*H-DELTA_OVERLAP_MS};

test('lượt nhanh trả gói CŨ hơn mốc → e-GP bỏ qua bộ lọc → TỰ TẮT quét nhanh, nói rõ lý do', ()=>{
  const pubs={a:iso(NOW-H),b:iso(NOW-10*24*H)};
  const r=evaluateScan({plan:deltaPlan,job:job(['a','b']),pubOf:k=>pubs[k],state:st0,now:NOW});
  assert.equal(r.state.broken,true);
  assert.match(r.state.brokenReason,/không lọc theo ngày đăng/);
  assert.equal(planScan(hunt({deltaState:r.state}),NOW+H).mode,'full');
});

test('lượt nhanh trả 0 gói khi bộ lọc CHƯA kiểm chứng → quét đầy đủ NGAY, không dời mốc', ()=>{
  /* Chính là ca e-GP nhận bộ lọc ngày rồi trả 0 SAI (đã gặp với decisionDate). */
  const r=evaluateScan({plan:deltaPlan,job:job([]),pubOf:()=>null,state:st0,now:NOW});
  assert.equal(r.followUpFull,true);
  assert.equal(r.state.lastOkAt,st0.lastOkAt);
  assert.match(r.note,/CHƯA được kiểm chứng/);
});

test('lượt nhanh trả 0 gói khi bộ lọc ĐÃ kiểm chứng → tin, dời mốc', ()=>{
  const r=evaluateScan({plan:deltaPlan,job:job([]),pubOf:()=>null,state:{...st0,proven:true},now:NOW});
  assert.equal(r.followUpFull,false);
  assert.equal(r.state.lastOkAt,iso(NOW));
});

test('lượt nhanh có gói mới đúng khoảng → bộ lọc được kiểm chứng; lưu dấu để lượt đầy đủ đối soát', ()=>{
  const r=evaluateScan({plan:deltaPlan,job:job(['a','b']),pubOf:()=>iso(NOW-H),state:st0,now:NOW});
  assert.equal(r.state.proven,true);
  assert.deepEqual(r.state.lastDelta.keys,['a','b']);
  assert.equal(r.state.lastDelta.since,iso(deltaPlan.since));
  assert.equal(r.state.deltaRuns,1);
});

test('gói không có ngày đăng → chưa coi là kiểm chứng', ()=>{
  const r=evaluateScan({plan:deltaPlan,job:job(['a']),pubOf:()=>undefined,state:st0,now:NOW});
  assert.equal(r.state.proven,false);
});

test('lượt chưa đầy đủ (PARTIAL/ERROR/bị cắt trang) KHÔNG dời mốc, không đánh giá', ()=>{
  for(const j of [job(['a'],{status:'PARTIAL'}),job(['a'],{status:'ERROR'}),job(['a'],{partial:true}),job(['a'],{capped:true})]){
    const r=evaluateScan({plan:deltaPlan,job:j,pubOf:()=>iso(NOW-H),state:st0,now:NOW});
    assert.deepEqual(r.state,safeDeltaState(st0));
    assert.equal(r.followUpFull,false);
  }
});

test('ĐỐI SOÁT: lượt đầy đủ thấy gói đăng trong khoảng quét nhanh mà quét nhanh bỏ sót → TỰ TẮT', ()=>{
  const s1=evaluateScan({plan:deltaPlan,job:job(['a'],{startedAt:iso(NOW-H)}),pubOf:()=>iso(NOW-2*H),state:st0,now:NOW}).state;
  const pubs={a:iso(NOW-2*H),b:iso(NOW-3*H),cu:iso(NOW-30*24*H),moi:iso(NOW-30*60_000)};
  const r=evaluateScan({plan:{mode:'full'},job:job(['a','b','cu','moi']),pubOf:k=>pubs[k],state:s1,now:NOW});
  assert.equal(r.state.broken,true,'b đăng trong khoảng mà quét nhanh không trả về');
  assert.match(r.state.brokenReason,/1 gói.*KHÔNG trả về.*b/);
});

test('ĐỐI SOÁT khớp → giữ quét nhanh; gói đăng SAU lượt nhanh không bị tính là sót', ()=>{
  const s1=evaluateScan({plan:deltaPlan,job:job(['a'],{startedAt:iso(NOW-H)}),pubOf:()=>iso(NOW-2*H),state:st0,now:NOW}).state;
  const pubs={a:iso(NOW-2*H),sau:iso(NOW-H+60_000),satGio:iso(NOW-H-5*60_000),cu:iso(NOW-30*24*H)};
  const r=evaluateScan({plan:{mode:'full'},job:job(['a','sau','satGio','cu']),pubOf:k=>pubs[k],state:s1,now:NOW});
  assert.equal(r.state.broken,false);
  assert.match(r.note,/khớp/);
  assert.equal(r.state.lastFullAt,iso(NOW));
  assert.equal(r.state.lastDelta,null,'đối soát xong thì bắt đầu cửa sổ mới');
});

test('nhiều lượt nhanh liên tiếp được gộp để đối soát cả khoảng', ()=>{
  let st=st0;
  st=evaluateScan({plan:deltaPlan,job:job(['a'],{startedAt:iso(NOW-3*H)}),pubOf:()=>iso(NOW-4*H),state:st,now:NOW}).state;
  const p2=planScan(hunt({deltaState:st}),NOW-H);
  st=evaluateScan({plan:p2,job:job(['b'],{startedAt:iso(NOW-H)}),pubOf:()=>iso(NOW-2*H),state:st,now:NOW}).state;
  assert.deepEqual(st.lastDelta.keys.sort(),['a','b']);
  assert.equal(st.lastDelta.since,iso(deltaPlan.since));
});

test('danh sách đối soát quá dài → đánh dấu bị cắt, KHÔNG kết luận sót (tránh báo động giả)', ()=>{
  const keys=Array.from({length:MAX_AUDIT_KEYS+5},(_,i)=>`k${i}`);
  const s1=evaluateScan({plan:deltaPlan,job:job(keys,{startedAt:iso(NOW-H)}),pubOf:()=>iso(NOW-2*H),state:st0,now:NOW}).state;
  assert.equal(s1.lastDelta.truncated,true);
  const r=evaluateScan({plan:{mode:'full'},job:job(['khac']),pubOf:()=>iso(NOW-2*H),state:s1,now:NOW});
  assert.equal(r.state.broken,false);
});

test('bộ săn: chỉ TBMT được bật quét nhanh; trạng thái được làm sạch', ()=>{
  const v=validateHunt({name:'Thủy lợi',kind:'tbmt',delta:true,criteria:{province:'Lâm Đồng'},deltaState:{lastFullAt:'rác',proven:'yes',lastDelta:{since:iso(NOW),at:iso(NOW),keys:['a','a',7]}}});
  assert.equal(v.ok,true);
  assert.equal(v.hunt.delta,true);
  assert.equal(v.hunt.deltaState.lastFullAt,null);
  assert.equal(v.hunt.deltaState.proven,false);
  assert.deepEqual(v.hunt.deltaState.lastDelta.keys,['a','7']);
  assert.equal(validateHunt({name:'KH',kind:'plan',delta:true,criteria:{province:'Lâm Đồng'}}).hunt.delta,false);
});

test('nối dây: mọi truy vấn của lượt nhanh đều có sàn ngày; lưu bộ săn đổi tiêu chí thì xóa trạng thái cũ', ()=>{
  const bg=fs.readFileSync(new URL('../GiaoSuCuiBap/background.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  assert.match(bg,/query:deltaQuery\(run,nativeTbmtQueryFromTemplate\(template\)\)/,'truy vấn thứ 2+ của lượt');
  assert.match(bg,/query:deltaQuery\(run,buildTbmtQuery\(queue\[0\]\.criteria\)\)/,'truy vấn đầu');
  assert.match(bg,/hunt\.deltaState=sameCriteria&&!message\.payload\?\.resetDelta\?old\.deltaState:/);
  const rt=fs.readFileSync(new URL('../GiaoSuCuiBap/lib/runtime-hunt.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  assert.match(rt,/if\(result\?\.followUpFull\)setTimeout\(\(\)=>\{void runHuntById\(job\.huntId,\{forceFull:true\}\)/);
  assert.match(rt,/if\(!duplicate&&hunt\.kind==='tbmt'&&hunt\.delta&&job\.huntPlan\)/,'đánh giá đúng một lần mỗi lượt');
});
