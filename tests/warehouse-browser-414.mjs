// Real IndexedDB in an isolated Chrome profile; synthetic local records only.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const extension=path.resolve('GiaoSuCuiBap'),out=path.resolve('test-results/warehouse');await fs.mkdir(out,{recursive:true});
const profile=path.join(out,`.profile-${Date.now()}`),report={fixture:true,startedAt:new Date().toISOString(),profile,checks:[],sourceHashes:{}};
for(const f of ['lib/warehouse-storage.js','lib/runtime-search-state.js','lib/warehouse-maintenance.js'])report.sourceHashes[f]=crypto.createHash('sha256').update(await fs.readFile(path.join(extension,f))).digest('hex');
let ctx;
try {
 ctx=await chromium.launchPersistentContext(profile,{headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',ignoreDefaultArgs:['--disable-extensions']});
 const cdp=await ctx.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:extension});report.browser=ctx.browser().version();
 const page=await ctx.newPage();await page.goto(`chrome-extension://${id}/onboarding.html`);
 const result=await page.evaluate(async()=>{
  const {createWarehouseStorage}=await import('./lib/warehouse-storage.js'),{createSearchStateRuntime}=await import('./lib/runtime-search-state.js');
  const checks=[];const ok=(name,condition)=>{if(!condition)throw Error(name);checks.push({name,ok:true});};
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function mem(initial={}){let data=structuredClone(initial);return {getData:()=>data,failSet:false,failRemove:false,async get(q){if(q==null)return structuredClone(data);if(typeof q==='string')return {[q]:data[q]};if(Array.isArray(q))return Object.fromEntries(q.map(k=>[k,data[k]]));return structuredClone(Object.fromEntries(Object.entries(q).map(([k,v])=>[k,k in data?data[k]:v])));},async set(p){if(this.failSet){this.failSet=false;throw Error('INJECT local.set failure');}Object.assign(data,structuredClone(p));},async remove(ks){if(this.failRemove){this.failRemove=false;throw Error('INJECT remove failure');}ks.forEach(k=>delete data[k]);},async clear(){data={};}};}
  const initial={settings:{name:'giữ'},tenders:[{key:'IB1',price:null,provinceCode:'703',closeDate:'2026-10-01'},{key:'IB2',price:0,provinceCode:'101'},{key:'IB1',price:123.5}],runs:[{id:'r1',foundKeys:['IB1'],resultStates:{IB1:{bidName:'Tại thời điểm cũ',price:3}}}],participations:[{notifyNo:'',contractorName:'Sai'},{tenderKey:'IB1',contractorName:'Đúng',taxCode:'00123'}]};
  const local=mem(initial),name=`gscb-test-${crypto.randomUUID()}`;let storage=createWarehouseStorage({local,name});
  const first=await storage.get(null);ok('Migration keeps exact rows, duplicate order, null/zero and leading tax zeros',equal(first.tenders,initial.tenders)&&equal(first.runs,initial.runs)&&equal(first.participations,initial.participations));
  ok('Legacy arrays removed only after successful committed migration',!('tenders'in local.getData())&&local.getData().warehouseStorage.engine==='indexeddb');
  ok('Indexed key lookup preserves all source occurrences and ordinal order',equal(await storage.lookup('tenders','key',['IB1']),[initial.tenders[0],initial.tenders[2]]));
  ok('Province lookup uses exact indexed codes',equal(await storage.lookup('tenders','provinceCodes',['703']),[initial.tenders[0]]));
  ok('Participation lookup never joins empty notice numbers',equal(await storage.participationsFor(['IB1'],[]),[initial.participations[1]]));
  ok('History headers omit other result snapshots',equal(await storage.runHeaders(),[{id:'r1'}]));
  await storage.close();storage=createWarehouseStorage({local,name});ok('Reopen after worker-like restart preserves warehouse',equal((await storage.get('tenders')).tenders,initial.tenders));
  let rejected=false;try{await storage.set({tenders:[{key:'bad',bad:()=>{}}],settings:{name:'must not commit'}});}catch{rejected=true;}
  ok('Failed clone aborts the entire record transaction without changing control settings',rejected&&equal((await storage.get('tenders')).tenders,initial.tenders)&&(await storage.get('settings')).settings.name==='giữ');
  local.failSet=true;rejected=false;try{await storage.set({tenders:[{key:'recover',price:7}],settings:{name:'new'}});}catch{rejected=true;}
  await storage.close();storage=createWarehouseStorage({local,name});const recovered=await storage.get(null);
  ok('Committed IDB transaction recovers pending local patch after interrupted flush',rejected&&recovered.tenders[0].key==='recover'&&recovered.settings.name==='new');
  await Promise.all([storage.set({tenders:[{key:'first'}]}),storage.set({tenders:[{key:'last'}],settings:{name:'last'}})]);
  ok('Concurrent writes serialize with matching small control state',(await storage.get('tenders')).tenders[0].key==='last'&&(await storage.get('settings')).settings.name==='last');
  await storage.clear();await storage.close();storage=createWarehouseStorage({local,name});const cleared=await storage.get(null);ok('Factory reset stays empty after reopening without reviving legacy arrays',cleared.tenders.length===0&&cleared.runs.length===0&&cleared.participations.length===0);
  await storage.close();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(name);r.onsuccess=resolve;r.onerror=()=>reject(r.error);});
  rejected=false;try{await createWarehouseStorage({local,name}).get(null);}catch(e){rejected=/khôi phục/.test(e.message);}
  ok('Missing migrated database is reported, never silently recreated as empty',rejected&&local.getData().warehouseStorage.engine==='indexeddb');indexedDB.deleteDatabase(name);
  const brokenLocal=mem({...initial,tenders:{bad:true}}),brokenName=`gscb-test-${crypto.randomUUID()}`,broken=createWarehouseStorage({local:brokenLocal,name:brokenName});
  rejected=false;try{await broken.get(null);}catch{rejected=true;}ok('Invalid legacy migration fails closed and preserves original source',rejected&&equal(brokenLocal.getData().tenders,{bad:true})&&equal(brokenLocal.getData().runs,initial.runs));indexedDB.deleteDatabase(brokenName);
  const failLocal=mem(initial),failName=`gscb-test-${crypto.randomUUID()}`;failLocal.failRemove=true;
  rejected=false;try{await createWarehouseStorage({local:failLocal,name:failName}).get(null);}catch{rejected=true;}
  const restored=createWarehouseStorage({local:failLocal,name:failName});ok('Interrupted migration cleanup resumes without duplicate records',rejected&&equal((await restored.get('tenders')).tenders,initial.tenders)&&!('tenders'in failLocal.getData()));await restored.close();indexedDB.deleteDatabase(failName);
  const rows=Array.from({length:20000},(_,i)=>({key:`IB${String(i).padStart(10,'0')}`,notifyNo:`IB${String(i).padStart(10,'0')}`,price:100000+i,bidName:`Gói ${i}`,provinceCode:i%2?'703':'101',closeDate:'2026-10-01',investField:'XL'}));
  const run={id:'bench',mode:'form',foundKeys:rows.slice(0,60).map(r=>r.key),resultStates:Object.fromEntries(rows.slice(0,60).map(r=>[r.key,{...r,filterState:'MATCH'}]))};
  const benchLocal=mem({tenders:rows,runs:[run],participations:[]}),benchName=`gscb-test-${crypto.randomUUID()}`,bench=createWarehouseStorage({local:benchLocal,name:benchName});
  let start=performance.now();await bench.get({settings:{}});const migrationMs=performance.now()-start;
  const samples=[];for(let i=0;i<7;i++){start=performance.now();const r=await createSearchStateRuntime({storage:bench}).read({runId:'bench'});samples.push(performance.now()-start);if(r.tenders.length!==60)throw Error('Scoped fixture count');}
  const readAll=[];for(let i=0;i<7;i++){start=performance.now();const r=await bench.get('tenders');readAll.push(performance.now()-start);if(r.tenders.length!==20000)throw Error('Warehouse count');}
  ok('20,000-row warehouse returns exactly 60 scoped result rows using actual IndexedDB',true);
  await bench.close();indexedDB.deleteDatabase(benchName);
  return {checks,benchmark:{fixture:true,warehouseRows:20000,scopeRows:60,migrationMs,scopedMs:samples,fullWarehouseMs:readAll,scopedMedianMs:[...samples].sort((a,b)=>a-b)[3],fullWarehouseMedianMs:[...readAll].sort((a,b)=>a-b)[3]}};
 });Object.assign(report,result);assert.ok(result.checks.length>=14);report.ok=true;
}catch(e){report.fatal=e.stack;process.exitCode=1;}finally{if(ctx)report.closed=await ctx.close().then(()=>true).catch(()=>false);report.sourceUnchanged=true;for(const [file,hash]of Object.entries(report.sourceHashes)){const actual=crypto.createHash('sha256').update(await fs.readFile(path.join(extension,file))).digest('hex');if(actual!==hash)report.sourceUnchanged=false;}if(!report.sourceUnchanged){report.ok=false;process.exitCode=1;}report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
