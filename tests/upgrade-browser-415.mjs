// Actual isolated Chrome upgrade, synthetic user data; no public-site traffic.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const current=path.resolve('GiaoSuCuiBap'),prior=path.resolve('test-results/upgrade/prior-4.14.0/GiaoSuCuiBap'),out=path.resolve('test-results/upgrade'),stamp=Date.now();
const scratch=path.join(out,`.extension-${stamp}`),profile=path.join(out,`.profile-${stamp}`),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const report={fixture:true,network:false,priorVersion:'4.14.0',currentVersion:'4.15.0',startedAt:new Date().toISOString(),scratch,profile,checks:[],blockedRequests:[],pageErrors:[],sources:{}};let ctx;
async function inventory(dir){const found={};async function visit(at){for(const entry of await fs.readdir(at,{withFileTypes:true})){const file=path.join(at,entry.name);if(entry.isDirectory())await visit(file);else if(entry.isFile())found[path.relative(dir,file).replaceAll('\\','/')]=sha(await fs.readFile(file));}}await visit(dir);return Object.fromEntries(Object.entries(found).sort(([a],[b])=>a.localeCompare(b)));}
function inside(file){const absolute=path.resolve(file);assert.ok(absolute.startsWith(out+path.sep)&&absolute!==out,'Only own upgrade scratch files are writable');return absolute;}
async function copyTree(from){await fs.mkdir(inside(scratch),{recursive:true});const wanted=await inventory(from);const existing=await inventory(scratch);for(const file of Object.keys(existing))if(!(file in wanted))await fs.unlink(inside(path.join(scratch,file)));await fs.cp(from,inside(scratch),{recursive:true,force:true});assert.deepEqual(await inventory(scratch),wanted);return wanted;}
function check(name,value){assert.ok(value,name);report.checks.push({name,ok:true});}
async function launch(){
  ctx=await chromium.launchPersistentContext(profile,{headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',ignoreDefaultArgs:['--disable-extensions'],permissions:[]});
  await ctx.route(/^https?:\/\//,async route=>{const u=new URL(route.request().url());report.blockedRequests.push({host:u.hostname,path:u.pathname});await route.abort('blockedbyclient');});
  const cdp=await ctx.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:scratch});report.browser=ctx.browser().version();
  // CDP can attach an unpacked extension while Developer mode is off, but
  // Chrome disables it on an ordinary reload. Match the documented user setup.
  const manager=await ctx.newPage();await manager.goto('chrome://extensions/',{waitUntil:'domcontentloaded'});
  // Independently observed on Chrome 154: Developer mode is a cr-toggle
  // switch using aria-checked, not the older button/aria-pressed contract.
  const dev=manager.locator('cr-toggle#devMode');
  if((await dev.getAttribute('aria-checked'))!=='true')await dev.click();
  assert.equal(await dev.getAttribute('aria-checked'),'true');await manager.close();report.developerMode=true;
  const page=await ctx.newPage();page.on('pageerror',e=>report.pageErrors.push(String(e.message).slice(0,300)));
  await page.goto(`chrome-extension://${id}/onboarding.html`,{waitUntil:'domcontentloaded',timeout:15000});
  await page.waitForFunction(async()=>Boolean((await chrome.storage.local.get('settings')).settings),null,{timeout:15000});
  return {page,id};
}
const send=(page,type,payload={})=>page.evaluate(({type,payload})=>chrome.runtime.sendMessage({type,payload}),{type,payload});
try{
  await fs.mkdir(out,{recursive:true});report.priorRelease=JSON.parse(await fs.readFile(path.join(out,'prior-release.json'),'utf8'));
  report.actualPriorArchiveSha256=sha(await fs.readFile(report.priorRelease.archive));assert.equal(report.actualPriorArchiveSha256,report.priorRelease.archiveSha256);
  report.sources.prior=await inventory(prior);assert.deepEqual(report.sources.prior,report.priorRelease.files);report.sources.current=await inventory(current);
  report.sourceTreeHashes={prior:sha(Buffer.from(JSON.stringify(report.sources.prior))),current:sha(Buffer.from(JSON.stringify(report.sources.current)))};
  await copyTree(prior);
  let {page,id}=await launch();report.priorId=id;check('Scratch version initially 4.14.0',(await page.evaluate(()=>chrome.runtime.getManifest().version))==='4.14.0');
  // Wait for the actual installed worker to acknowledge its initial state,
  // then seed only our scratch profile. No test source is injected into it.
  await send(page,'GET_STATE');
  const seeded=await page.evaluate(async()=>{
    const {normalizeCandidate,DEFAULT_SETTINGS}=await import('./lib/core.js'),{safeRunForBackup}=await import('./lib/backup.js'),{getAppStorage}=await import('./lib/warehouse-storage.js');
    const tenders=[normalizeCandidate({notifyNo:'IB2699999991',notifyVersion:'00',bidName:'Gói kiểm thử nâng cấp một',bidPrice:1234567,investField:'XL',bidCloseDate:'2099-10-01T10:00:00Z',locations:[{provCode:'703',districtCode:'TESTWARD'}],investorName:'Ban QLDA kiểm thử nâng cấp',investorCode:'vn0099999911',detailUrl:'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?notifyNo=IB2699999991'}),
      normalizeCandidate({notifyNo:'IB2699999992',notifyVersion:'00',bidName:'Gói kiểm thử nâng cấp hai',bidPrice:0,investField:'TV',bidCloseDate:'2099-10-02T10:00:00Z',locations:[{provCode:'703',districtCode:'TESTWARD'}]})];
    const criteria={province:'Lâm Đồng',category:'XL',ward:'Xã thử nâng cấp',wardIdentities:[{code:'TESTWARD',parentCode:'703',name:'Xã thử nâng cấp'}],minPrice:0,maxPrice:0};
    const run=safeRunForBackup({id:'upgrade-fixture-run',mode:'form',status:'SUCCESS',startedAt:'2026-09-20T01:00:00Z',finishedAt:'2026-09-20T01:01:00Z',criteria,
      foundKeys:tenders.map(t=>t.key),resultStates:Object.fromEntries(tenders.map((t,i)=>[t.key,{bidName:`Ảnh lịch sử nâng cấp ${i+1}`,price:i?0:7654321,publicDate:'2026-09-20T01:00:00Z',closeDate:t.closeDate,investorName:'Chủ đầu tư thử nghiệm',location:'Lâm Đồng',investField:t.investField,provinceCode:'703',filterState:'MATCH',filterReason:'match',matched:true,score:90,checkedAt:'2026-09-20T01:01:00Z'}])),coverage:{complete:true,done:true,serverTotal:2,fetched:2,match:2,insufficient:0,outOfRange:0,pagesRead:1,totalPages:1}});
    const settings={...DEFAULT_SETTINGS,operatorName:'Kiểm thử nâng cấp riêng',autoScan:false,scanOnStartup:false,telegramEnabled:false,telegramDailySummary:false,telegramBotToken:'',telegramChatId:'',notifyEmail:'',notifyWebhook:'',webhookSecret:'',maxPagesHint:2,requireConstruction:false,minPrice:17};
    const areas={fetchedAt:new Date().toISOString(),provinces:[{code:'703',name:'Tỉnh Lâm Đồng',fold:'tinh lam dong'}],wardsByProvince:{703:[{code:'TESTWARD',parentCode:'703',name:'Xã thử nâng cấp',current:true}]}};
    await getAppStorage().set({settings,tenders,runs:[run],activeRun:null,participations:[{id:'upgrade-participation',tenderKey:tenders[0].key,notifyNo:tenders[0].notifyNo,contractorName:'Nhà thầu thử nâng cấp',taxCode:'0012345678',contractorCode:'vn0012345678',bidValue:1200000}],savedSearches:[{id:'upgrade-search',name:'Tiêu chí thử nâng cấp',criteria:{...criteria,investor:'Đức Trọng'}}],areas,provinceCatalog:areas,canaryConfig:{enabled:true,weekday:1,hour:2,timezone:'Asia/Ho_Chi_Minh'},liveCanary:{status:'UNKNOWN',cases:[],nextRunAt:'2099-01-05T19:00:00Z'}});
    await chrome.alarms.clearAll();localStorage.setItem('gscb_search_run',JSON.stringify(run.id));
    return {keys:tenders.map(t=>t.key),runId:run.id};
  });
  const beforeScope=await send(page,'GET_SEARCH_STATE',{runId:seeded.runId}),beforeState=await send(page,'GET_STATE');
  check('4.14 worker sees two seeded tenders and their exact history',beforeScope.ok&&beforeScope.tenders.length===2&&beforeScope.selectedRun?.resultStates[seeded.keys[0]].price===7654321);
  check('Prior 4.14 data uses IndexedDB with no legacy arrays',await page.evaluate(async()=>{const x=await chrome.storage.local.get(null);return x.warehouseStorage?.engine==='indexeddb'&&['tenders','runs','participations'].every(k=>!Object.hasOwn(x,k))&&(await indexedDB.databases()).some(d=>d.name==='gscb-warehouse-v1');}));
  await ctx.close();ctx=null;report.firstProfileClosed=true;
  await copyTree(current);
  ({page,id}=await launch());report.currentId=id;
  // Click the real Chrome Reload control for this ID. No uninstall, origin
  // clearing or direct IndexedDB seeding occurs during the update.
  const manager=await ctx.newPage();await manager.goto('chrome://extensions/',{waitUntil:'domcontentloaded'});
  await manager.locator(`extensions-item[id="${id}"]`).locator('#dev-reload-button').click();report.explicitReload=true;report.reloadMethod='chrome://extensions #dev-reload-button';
  await manager.getByRole('alert').waitFor({timeout:15000});report.reloadToast=await manager.getByRole('alert').innerText();
  const reloadCdp=await ctx.browser().newBrowserCDPSession(),registry=await reloadCdp.send('Extensions.getExtensions');
  report.reloadRegistry=(registry.extensions||[]).filter(item=>item.id===id).map(item=>({id:item.id,version:item.version,enabled:item.enabled}));assert.equal(report.reloadRegistry[0]?.enabled,true);await manager.close();
  page=await ctx.newPage();page.on('pageerror',e=>report.pageErrors.push(String(e.message).slice(0,300)));
  const navigationUntil=Date.now()+20000;
  for(;;){try{await page.goto(`chrome-extension://${id}/onboarding.html`,{waitUntil:'domcontentloaded',timeout:15000});break;}catch(error){if(!String(error.message).includes('ERR_BLOCKED_BY_CLIENT')||Date.now()>=navigationUntil)throw error;await new Promise(resolve=>setTimeout(resolve,250));}}
  // Reloaded extension workers are lazy; opening a view and sending a real
  // protocol message wakes the worker. A serviceworker event alone can be late.
  await page.waitForFunction(async()=>{const response=await Promise.race([chrome.runtime.sendMessage({type:'GET_WAREHOUSE_STATUS'}).catch(()=>null),new Promise(resolve=>setTimeout(()=>resolve(null),750))]);return response?.ok&&response.engine==='indexeddb';},null,{timeout:20000,polling:500});
  check('Stable key and same scratch path retain extension ID',id===report.priorId);
  check('Same profile now loads 4.15.0',(await page.evaluate(()=>chrome.runtime.getManifest().version))==='4.15.0');
  const engine=await send(page,'GET_WAREHOUSE_STATUS');report.engine=engine.engine;check('Reloaded worker serves the new IndexedDB protocol',engine.ok&&engine.engine==='indexeddb');
  const afterScope=await send(page,'GET_SEARCH_STATE',{runId:seeded.runId}),afterState=await send(page,'GET_STATE'),canary=await send(page,'CANARY_STATUS');
  assert.deepEqual(afterScope.selectedRun,beforeScope.selectedRun);check('Exact saved run snapshot survives actual browser upgrade',true);
  // onInstalled already rescores/sorts stored notices in both versions. The
  // upgrade contract preserves every value by identity, not raw seeded order.
  const keyed=rows=>rows.map(t=>({key:t.key,bidName:t.bidName,price:t.price,closeDate:t.closeDate,investField:t.investField})).sort((a,b)=>a.key.localeCompare(b.key));
  assert.deepEqual(keyed(afterState.tenders),keyed(beforeState.tenders));check('Both warehouse rows retain identity, names, prices and dates',true);
  assert.deepEqual(afterState.settings,beforeState.settings);check('User settings and disabled outbound automation preserved',true);
  assert.deepEqual(afterState.participations,beforeState.participations);check('Participation and leading-zero tax ID survive',afterState.participations[0].taxCode==='0012345678');
  assert.deepEqual(afterState.savedSearches,beforeState.savedSearches);check('Saved criteria retain single owner and exact ward code/parent',afterState.savedSearches[0].criteria.wardIdentities[0].parentCode==='703'&&afterState.savedSearches[0].criteria.investor==='Đức Trọng');
  check('Canary schedule remains Monday 02:00 Vietnam',canary.config.enabled&&canary.config.weekday===1&&canary.config.hour===2&&canary.config.timezone==='Asia/Ho_Chi_Minh');
  const directory=await send(page,'INVESTOR_DIRECTORY',{province:'Lâm Đồng',query:'kiểm thử nâng cấp'});
  const observed=directory.entries?.find(e=>e.eGpCode==='vn0099999911');
  check('New organization directory migrates the own name/code/source pair from prior IndexedDB',directory.ok&&observed?.status==='observed'&&observed.name==='Ban QLDA kiểm thử nâng cấp'&&observed.queryValue==='vn0099999911'&&observed.egpProof?.reference==='IB2699999991'&&observed.egpProof?.nameAtSource===observed.name&&observed.egpProof?.codeAtSource===observed.eGpCode);
  report.directoryMigration={id:observed.id,name:observed.name,eGpCode:observed.eGpCode,status:observed.status,reference:observed.egpProof.reference};
  const directoryCache=await page.evaluate(async()=>{const x=(await chrome.storage.local.get('organizationDirectoryObservations')).organizationDirectoryObservations;return {schema:x?.schema,entries:x?.entries?.map(e=>({name:e.name,eGpCode:e.eGpCode}))};});
  check('Migrated directory is persisted separately from the warehouse',directoryCache.schema===1&&directoryCache.entries.some(e=>e.name===observed.name&&e.eGpCode===observed.eGpCode));
  const storage=await page.evaluate(async()=>{const x=await chrome.storage.local.get(null);return {legacy:['tenders','runs','participations'].filter(k=>Object.hasOwn(x,k)),marker:x.warehouseStorage,revision:typeof x.warehouseRevision,databases:(await indexedDB.databases()).map(d=>d.name)};});
  report.storage=storage;
  check('Upgrade retains existing IndexedDB and no legacy arrays',storage.legacy.length===0&&storage.marker?.engine==='indexeddb'&&storage.marker.schema===1&&storage.databases.includes('gscb-warehouse-v1'));
  await page.goto(`chrome-extension://${id}/search.html`,{waitUntil:'domcontentloaded',timeout:15000});
  await page.waitForFunction(()=>document.querySelectorAll('#list article').length===2,null,{timeout:15000});
  const view=await page.locator('#list').innerText();check('Search UI renders the exact historical snapshot names',view.includes('Ảnh lịch sử nâng cấp 1')&&view.includes('Ảnh lịch sử nâng cấp 2'));
  await page.screenshot({path:path.join(out,'upgrade-search.png'),fullPage:true});
  check('Extension UI has no JavaScript page errors',report.pageErrors.length===0);
  check('No public HTTP requests were attempted during local upgrade smoke',report.blockedRequests.length===0);
  assert.deepEqual(await inventory(prior),report.sources.prior);assert.deepEqual(await inventory(current),report.sources.current);report.sourceUnchanged=true;report.sourceHashes=report.sources.current;check('Both actual source trees remained byte-for-byte unchanged',true);
  report.ok=true;
}catch(error){report.fatal=String(error.stack||error);process.exitCode=1;}
finally{
  if(ctx){report.closed=await ctx.close().then(()=>true).catch(()=>false);ctx=null;}else report.closed=true;
  report.finishedAt=new Date().toISOString();await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'upgrade.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({ok:report.ok,checks:report.checks,fatal:report.fatal,closed:report.closed,profile,scratch,output:path.join(out,'upgrade.json')},null,2));
}
