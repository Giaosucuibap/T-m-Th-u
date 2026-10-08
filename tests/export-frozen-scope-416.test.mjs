import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createExportRuntime} from '../GiaoSuCuiBap/lib/runtime-export.js';
import {buildXlsx} from '../GiaoSuCuiBap/lib/xlsx.js';
import {dedupeKhlcnt,summarizeKhlcnt,khlcntDateRange,normalizeKhlcntPlan,classifyPlansByCriteria} from '../GiaoSuCuiBap/lib/khlcnt.js';
import {coverageText} from '../GiaoSuCuiBap/lib/match-gate.js';
import {hardFilterReason} from '../GiaoSuCuiBap/lib/hard-filter.js';
import {safeSource} from '../GiaoSuCuiBap/lib/workspace.js';
import {formatMoney,formatDate} from '../GiaoSuCuiBap/lib/core.js';
import {TENDER_CATEGORIES,normalizeCategory,categoryLabel} from '../GiaoSuCuiBap/lib/tender-categories.js';
import {workbookSheetXml} from './fixtures/multi-investor-export-414.mjs';

const range={from:Date.parse('2026-07-07T05:00:00Z'),to:Date.parse('2026-10-05T05:00:00Z')};
const criteria={days:90,dateRange:range,category:'XL'};
const fromText='07/07/2026 12:00:00.000 (UTC+07:00)',toText='05/10/2026 12:00:00.000 (UTC+07:00)';
function exporter(state){
  const outputs=[];
  return{outputs,runtime:createExportRuntime({getState:async()=>structuredClone(state),stamp:()=> '2027-01-05',numOrNull:value=>value==null||value===''?null:Number(value),
    downloadXlsx:async(name,spec)=>{outputs.push({name,spec,bytes:buildXlsx(spec)});return outputs.length;}})};
}
const recon=output=>output.spec.sheets.find(sheet=>sheet.sheetName==='Đối soát');
const value=(output,label)=>recon(output).rows.find(row=>row.label===label)?.value;
function ui(lookup){
  const nodes=new Map();
  const node=id=>{
    if(!nodes.has(id)){const hidden=new Set();nodes.set(id,{value:id==='period'?'90':'',checked:false,disabled:false,textContent:'',innerHTML:'',className:'',classList:{toggle:(key,on)=>on?hidden.add(key):hidden.delete(key),contains:key=>hidden.has(key)},addEventListener(){},checkValidity:()=>true,reportValidity(){}});}
    return nodes.get(id);
  };
  const context=vm.createContext({document:{getElementById:node},console,URLSearchParams,Date,Intl,location:{search:''},initInvestorInput(){},readInvestorInput:()=>({ok:true}),
    coverageText,hardFilterReason,safeSource,formatDate,formatMoney,TENDER_CATEGORIES,normalizeCategory,categoryLabel,dedupeKhlcnt,summarizeKhlcnt,khlcntDateRange,
    createWardPicker:()=>({load:async()=>{},clear(){},read:()=>({ward:''}),set(){}}),setInterval:()=>1,clearInterval(){},
    chrome:{runtime:{sendMessage:async message=>message.type==='GET_PLAN_STATE'?{ok:true,lookup:structuredClone(lookup),revision:'frozen-view'}:message.type==='AREA_OPTIONS'?{ok:true,provinces:[]}:{ok:true}}}});
  const source=fs.readFileSync(new URL('../GiaoSuCuiBap/plans.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');
  vm.runInContext(source+'\nglobalThis.__refresh=refresh;globalThis.__render=render;',context);
  return{node,context,refresh:()=>context.__refresh(),render:()=>context.__render()};
}
function plan(number,packages){return normalizeKhlcntPlan({planNo:`PL260000000${number}`,planVersion:'00',name:'Kế hoạch '+number,
  decisionDate:'2026-09-20T23:59:59',publicDate:'2026-10-03T09:00:00',bidNamePlanNew:packages,investField:['XL'],haveBidNotNotify:number===1?1:0});}

test('416 real plans UI and Excel share the same only-unannounced scope and display saved VN approval bounds',async()=>{
  const groups=classifyPlansByCriteria([
    plan(1,[{name:'Gói A',bidPrice:1e9,bidField:'XL'},{name:'Gói B',bidPrice:2e9,bidField:'XL'}]),
    plan(2,[{name:'Gói C',bidPrice:3e9,bidField:'XL',notifyNo:'IB2600000002'}])
  ],criteria);
  assert.equal(groups.match.length,2);
  const lookup={id:'frozen',status:'SUCCESS',criteria,plans:dedupeKhlcnt(groups.match),insufficientPlans:[],summary:summarizeKhlcnt(groups.match),coverage:{serverTotal:2,fetched:2,match:2,insufficient:0,outOfRange:0,complete:true},message:'Đã đọc đủ.'};
  const h=ui(lookup);await new Promise(resolve=>setImmediate(resolve));await h.refresh();
  const {runtime,outputs}=exporter({planLookup:lookup});
  for(const only of [false,true]){
    h.node('only').checked=only;h.render();await runtime.exportPlansCsv({onlyUnannounced:only});
    const output=outputs.at(-1),detail=output.spec.sheets.find(sheet=>sheet.sheetName==='Kế hoạch LCNT');
    const cards=[...h.node('list').innerHTML.matchAll(/<div class="plan">/g)].length;
    const children=[...h.node('list').innerHTML.matchAll(/<tr><td class="num">/g)].length;
    assert.equal(value(output,'Số bản ghi sau bộ lọc xuất'),cards);
    assert.equal(value(output,'Số dòng dữ liệu xuất'),children);
    assert.equal(detail.rows.length,children);
    const shown=lookup.plans.filter(row=>!only||row.hasUnannounced);
    for(const row of shown)assert.ok(h.node('list').innerHTML.includes(row.planNoStand));
    assert.deepEqual([...new Set(detail.rows.map(row=>row.planNoStand))],shown.map(row=>row.planNoStand));
    assert.equal(value(output,'Tiêu chí gốc · Từ thời điểm đã cố định'),fromText);
    assert.equal(value(output,'Tiêu chí gốc · Đến thời điểm đã cố định'),toText);
    assert.equal(value(output,'Tiêu chí gốc · Mốc thời gian đối chiếu'),'Ngày phê duyệt kế hoạch (decisionDate)');
    assert.ok(output.spec.exportInfo.notes.some(note=>note.includes(fromText)&&note.includes(toText)));
    const sheet=workbookSheetXml(output,'Đối soát');assert.ok(sheet.includes(fromText)&&sheet.includes(toText));
    assert.match(workbookSheetXml(output,'Kế hoạch LCNT'),/<v>1000000000<\/v>/);
  }
  assert.equal(outputs[0].spec.sheets[1].rows.length,3);assert.equal(outputs[1].spec.sheets[1].rows.length,2);
});

test('416 BBMT uses actual opening time and never relabels frozen bounds as approval',async()=>{
  const {runtime,outputs}=exporter({bidOpenScan:{id:'opening',scope:{days:90,dateRange:range},packages:[{notifyNoStand:'IB1',readState:'OK',bidders:[{name:'A',finalPrice:1}]}]}});
  await runtime.exportBidOpenCsv();const output=outputs[0];
  assert.equal(value(output,'Tiêu chí gốc · Từ thời điểm đã cố định'),fromText);
  assert.equal(value(output,'Tiêu chí gốc · Đến thời điểm đã cố định'),toText);
  assert.equal(value(output,'Tiêu chí gốc · Mốc thời gian đối chiếu'),'Thời điểm mở thầu thực tế (bidRealityOpenDate)');
  assert.ok(output.spec.exportInfo.notes.some(note=>note.includes('Thời điểm mở thầu thực tế')&&note.includes(fromText)));
});

test('416 legacy relative criteria remain unrecorded, and open bounds remain open in the exported scope',async()=>{
  const base={id:'legacy',plans:[{planNoStand:'PL1',name:'A',packages:[{name:'Gói A',price:1}]}]};
  for(const saved of [{days:90},{fromDate:'2026-07-07',dateRange:{from:range.from,to:8640000000000000}}]){
    const {runtime,outputs}=exporter({planLookup:{...base,criteria:saved}});await runtime.exportPlansCsv();const output=outputs[0];
    if(saved.dateRange){assert.equal(value(output,'Tiêu chí gốc · Đến thời điểm đã cố định'),'Không giới hạn');}
    else{assert.match(value(output,'Tiêu chí gốc · Khoảng thời gian cố định'),/Chưa lưu.*không tính lại/);assert.equal(value(output,'Tiêu chí gốc · Từ thời điểm đã cố định'),undefined);}
  }
});
