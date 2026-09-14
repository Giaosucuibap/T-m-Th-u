import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../content.js',import.meta.url),'utf8');
function sourceFunction(name){
  const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start>=0,name);const tail=source.slice(start),end=tail.search(/\r?\n  }\r?\n/);
  assert.ok(end>0,name);return tail.slice(0,end)+'\n  }';
}
function resumedWaitHarness(){
  const callbacks={},finishes=[],cleared=[];let resultsView=false,harvests=0;
  const context=vm.createContext({document:{readyState:'loading',title:'',body:{innerText:''}},kqPlan:{id:'restored-harvest-plan'},
    setInterval:fn=>{callbacks.tick=fn;return 1;},clearInterval:id=>cleared.push(id),setTimeout:fn=>{callbacks.deadline=fn;return 2;},
    kqIsResultsView:()=>resultsView,kqRunHarvest:()=>harvests++});
  context.kqFinish=(ok,message)=>{finishes.push({ok,message});context.kqPlan=null;};
  for(const name of ['bbmtPageError','kqNativePageError','kqPageErrorMessage','kqWaitForResultsView'])vm.runInContext(sourceFunction(name),context);
  context.kqWaitForResultsView();
  return {context,callbacks,finishes,cleared,get harvests(){return harvests;},set resultsView(value){resultsView=value;}};
}
const waf="Error. This page can't be displayed. The incident ID is N/A.";
test('A resumed harvest recognizes the actual short Error fixture after navigation instead of waiting 40 seconds',()=>{
  const h=resumedWaitHarness();h.callbacks.tick();assert.equal(h.finishes.length,0);
  Object.assign(h.context.document,{readyState:'interactive',title:'Error',body:{innerText:waf}});
  h.callbacks.tick();assert.equal(h.finishes.length,1);assert.equal(h.finishes[0].ok,false);
  assert.ok(h.finishes[0].message.includes('từ chối truy cập'));
  assert.ok(!h.finishes[0].message.includes('40 giây'));assert.ok(h.cleared.includes(1));assert.equal(h.harvests,0);
});
test('A loading document cannot be classified prematurely even when its partial body already contains an error signature',()=>{
  const h=resumedWaitHarness();Object.assign(h.context.document,{title:'Error',body:{innerText:waf}});
  h.callbacks.tick();assert.equal(h.finishes.length,0);
  h.context.document.readyState='complete';h.callbacks.tick();assert.equal(h.finishes[0].ok,false);
});
test('An ordinary listing mentioning error text is not mistaken for the native WAF page',()=>{
  const h=resumedWaitHarness();Object.assign(h.context.document,{readyState:'complete',title:'Lựa chọn nhà thầu - EGP',body:{innerText:'Gói bảo trì hệ thống: '+waf}});
  h.callbacks.tick();assert.equal(h.finishes.length,0);
  h.resultsView=true;h.callbacks.tick();assert.equal(h.harvests,1);assert.equal(h.finishes.length,0);
});
test('A resumed unavailable portlet stops with its real cause rather than a no-results conclusion',()=>{
  const h=resumedWaitHarness();Object.assign(h.context.document,{readyState:'complete',title:'Lựa chọn nhà thầu - EGP',body:{innerText:'egp-portal-contractor-selection-v2 tạm thời không có.'}});
  h.callbacks.tick();assert.equal(h.finishes[0].ok,false);assert.ok(h.finishes[0].message.includes('tạm thời không khả dụng'));
});
test('The deadline also recognizes a late native error, while a normal missing result keeps the timeout explanation',()=>{
  const error=resumedWaitHarness();Object.assign(error.context.document,{readyState:'complete',title:'Error',body:{innerText:waf}});
  error.callbacks.deadline();assert.ok(error.finishes[0].message.includes('từ chối truy cập'));
  const normal=resumedWaitHarness();Object.assign(normal.context.document,{readyState:'complete',title:'Lựa chọn nhà thầu',body:{innerText:'Đang tải dữ liệu'}});
  normal.callbacks.deadline();assert.ok(normal.finishes[0].message.includes('40 giây'));
});
test('A timer from an older restored plan cannot fail a newer plan',()=>{
  const h=resumedWaitHarness();h.context.kqPlan={id:'new-plan'};
  Object.assign(h.context.document,{readyState:'complete',title:'Error',body:{innerText:waf}});
  h.callbacks.tick();h.callbacks.deadline();assert.equal(h.finishes.length,0);
});
