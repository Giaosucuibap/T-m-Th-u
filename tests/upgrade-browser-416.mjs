// Actual isolated Chrome 4.15 -> 4.16 upgrade, synthetic user warehouse and a
// frozen public plan row. No public-site traffic or request replay.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const workspace=path.resolve(import.meta.dirname,'../../..');
const prior=path.join(workspace,'candidate/4.15.0/GiaoSuCuiBap'),current=path.join(workspace,'candidate/4.16.0/GiaoSuCuiBap');
const out=path.join(workspace,'test-results/4.16.0/upgrade'),stamp=Date.now();
const scratch=path.join(out,`.extension-${stamp}`),profile=path.join(out,`.profile-${stamp}`);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const report={fixture:true,network:false,priorVersion:'4.15.0',currentVersion:'4.16.0',startedAt:new Date().toISOString(),
  profile,scratch,checks:[],blockedRequests:[],pageErrors:[],sources:{}};let ctx;
const check=(name,value)=>{assert.ok(value,name);report.checks.push({name,ok:true});};
async function inventory(dir){const found={};async function visit(at){for(const entry of await fs.readdir(at,{withFileTypes:true})){
  const file=path.join(at,entry.name);if(entry.isDirectory())await visit(file);else if(entry.isFile())found[path.relative(dir,file).replaceAll('\\','/')]=sha(await fs.readFile(file));
}}await visit(dir);return Object.fromEntries(Object.entries(found).sort(([a],[b])=>a.localeCompare(b)));}
function ownScratch(file){const absolute=path.resolve(file);assert.ok(absolute.startsWith(scratch+path.sep),'Only this test scratch content may change');return absolute;}
async function copyTree(from){await fs.mkdir(scratch,{recursive:true});const wanted=await inventory(from),existing=await inventory(scratch);
  for(const file of Object.keys(existing))if(!(file in wanted))await fs.unlink(ownScratch(path.join(scratch,file)));
  await fs.cp(from,scratch,{recursive:true,force:true});assert.deepEqual(await inventory(scratch),wanted);
}
const send=(page,type,payload={})=>page.evaluate(({type,payload})=>chrome.runtime.sendMessage({type,payload}),{type,payload});
async function launch(){
  ctx=await chromium.launchPersistentContext(profile,{headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',ignoreDefaultArgs:['--disable-extensions'],permissions:[]});
  await ctx.route(/^https?:\/\//,async route=>{const url=new URL(route.request().url());report.blockedRequests.push({host:url.hostname,path:url.pathname});await route.abort('blockedbyclient');});
  const cdp=await ctx.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:scratch});report.browser=ctx.browser().version();
  const manager=await ctx.newPage();await manager.goto('chrome://extensions/',{waitUntil:'domcontentloaded'});
  const dev=manager.locator('cr-toggle#devMode');if(await dev.getAttribute('aria-checked')!=='true')await dev.click();
  assert.equal(await dev.getAttribute('aria-checked'),'true');await manager.close();
  const page=await ctx.newPage();page.on('pageerror',error=>report.pageErrors.push(String(error.message)));
  await page.goto(`chrome-extension://${id}/onboarding.html`,{waitUntil:'domcontentloaded',timeout:15000});
  await page.waitForFunction(async()=>Boolean((await chrome.storage.local.get('settings')).settings),null,{timeout:15000});
  await send(page,'GET_STATE');return {page,id};
}
try{
  await fs.mkdir(out,{recursive:true});report.sources.prior=await inventory(prior);report.sources.current=await inventory(current);
  report.sourceTreeHashes={prior:sha(Buffer.from(JSON.stringify(report.sources.prior))),current:sha(Buffer.from(JSON.stringify(report.sources.current)))};
  const fixture=JSON.parse((await fs.readFile(new URL('./fixtures/egp-plan-detail-PL2600333000-20261005.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
  await copyTree(prior);let {page,id}=await launch();report.priorId=id;
  check('Actual prior manifest is 4.15.0',await page.evaluate(()=>chrome.runtime.getManifest().version)==='4.15.0');
  const seeded=await page.evaluate(async row=>{
    const {normalizeCandidate,DEFAULT_SETTINGS}=await import('./lib/core.js');
    const {normalizeKhlcntPlan}=await import('./lib/khlcnt.js'),{getAppStorage}=await import('./lib/warehouse-storage.js');
    const tender={...normalizeCandidate({notifyNo:'IB2699999991',notifyVersion:'00',bidName:'Gói thử nâng cấp và theo dõi',bidPrice:1234567,
      investField:'XL',bidCloseDate:'2099-10-01T10:00:00Z',locations:[{provCode:'68',provName:'Tỉnh Lâm Đồng'}],
      investorName:'Ban thử nâng cấp',investorCode:'vn0099999911'}),watchlisted:true,userNote:'Giữ ghi chú của người dùng'};
    const legacyPlan=normalizeKhlcntPlan(row),planLookup={id:'upgrade-legacy-plan',status:'SUCCESS',startedAt:'2026-10-05T04:00:00Z',
      finishedAt:'2026-10-05T04:01:00Z',criteria:{category:'',fromDate:'2026-07-07',toDate:'2026-10-05'},plans:[legacyPlan],insufficientPlans:[],
      resultStates:{[legacyPlan.key]:{filterState:'MATCH',filterReason:'match'}},serverCount:1,totalElements:1,totalPages:1,pagesRead:1,
      coverage:{serverTotal:1,fetched:1,match:1,insufficient:0,outOfRange:0,pagesRead:1,totalPages:1,done:true,complete:true},
      userNote:'Giữ bản đối soát cũ để kiểm tra'};
    const settings={...DEFAULT_SETTINGS,operatorName:'Hồ sơ QA nâng cấp riêng',autoScan:false,scanOnStartup:false,telegramEnabled:false,
      telegramDailySummary:false,telegramBotToken:'',telegramChatId:'',notifyEmail:'',notifyWebhook:'',webhookSecret:'',minPrice:17};
    const catalog={fetchedAt:new Date().toISOString(),provinces:[{code:'68',name:'Tỉnh Lâm Đồng',fold:'tinh lam dong'},
      {code:'703',name:'Tỉnh Lâm Đồng',fold:'tinh lam dong'}],wardsByProvince:{}};
    await getAppStorage().set({settings,tenders:[tender],runs:[],participations:[{id:'upgrade-participation',tenderKey:tender.key,
      notifyNo:tender.notifyNo,contractorName:'Nhà thầu QA',taxCode:'0012345678',bidValue:1200000}],activeRun:null,planLookup,
      savedSearches:[{id:'upgrade-search',name:'Tiêu chí lưu của người dùng',criteria:{investor:'Đức Trọng; Đơn Dương',province:'Lâm Đồng',category:'XL'}}],
      provinceCatalog:catalog,areas:catalog,canaryConfig:{enabled:false,weekday:1,hour:2,timezone:'Asia/Ho_Chi_Minh'},
      checklists:{[tender.key]:{userNote:'Hồ sơ đang chuẩn bị'}}});
    await chrome.alarms.clearAll();return {key:tender.key,legacyPrices:legacyPlan.packages.map(pkg=>pkg.price),planKey:legacyPlan.key};
  },fixture.searchRow);
  const before=await send(page,'GET_STATE'),rawBefore=await page.evaluate(async()=>{
    const {getAppStorage}=await import('./lib/warehouse-storage.js');return (await getAppStorage().get({planLookup:null})).planLookup;
  });
  check('4.15 actual IndexedDB has seeded watchlisted row and saved state',before.tenders.length===1&&before.tenders[0].watchlisted&&before.participations[0].taxCode==='0012345678');
  check('Prior plan contains the old unverified aggregate prices',rawBefore.plans[0].packages.length===6&&rawBefore.plans[0].packages[2].price===51197946);
  report.auditBefore={key:seeded.planKey,savedPrices:seeded.legacyPrices};
  await ctx.close();ctx=null;await copyTree(current);({page,id}=await launch());report.currentId=id;
  const manager=await ctx.newPage();await manager.goto('chrome://extensions/',{waitUntil:'domcontentloaded'});
  await manager.locator(`extensions-item[id="${id}"]`).locator('#dev-reload-button').click();
  await manager.getByRole('alert').waitFor({timeout:15000});report.reloadToast=await manager.getByRole('alert').innerText();await manager.close();
  page=await ctx.newPage();page.on('pageerror',error=>report.pageErrors.push(String(error.message)));
  const navigationUntil=Date.now()+20000;for(;;){try{await page.goto(`chrome-extension://${id}/onboarding.html`,{waitUntil:'domcontentloaded',timeout:15000});break;}
    catch(error){if(!String(error.message).includes('ERR_BLOCKED_BY_CLIENT')||Date.now()>=navigationUntil)throw error;await new Promise(resolve=>setTimeout(resolve,250));}}
  await page.waitForFunction(async()=>{const result=await chrome.runtime.sendMessage({type:'GET_WAREHOUSE_STATUS'}).catch(()=>null);return result?.ok&&result.engine==='indexeddb';},null,{timeout:20000,polling:500});
  check('Same key/path/profile keep the exact extension ID',id===report.priorId);
  check('Actual upgraded manifest is 4.16.0',await page.evaluate(()=>chrome.runtime.getManifest().version)==='4.16.0');
  const after=await send(page,'GET_STATE'),planReply=await send(page,'GET_PLAN_STATE');
  const selected=before.tenders.find(t=>t.key===seeded.key),preserved=after.tenders.find(t=>t.key===seeded.key);
  for(const key of ['key','bidName','price','closeDate','watchlisted','userNote'])assert.deepEqual(preserved[key],selected[key]);
  check('Warehouse row identity, dates, price, watch and user note survive',true);
  assert.deepEqual(after.settings,before.settings);assert.deepEqual(after.savedSearches,before.savedSearches);
  assert.deepEqual(after.participations,before.participations);assert.deepEqual(after.checklists,before.checklists);
  check('Settings, saved multi-owner criteria, participations and checklist survive',true);
  check('Legacy view has no exportable price-matched plans',planReply.ok&&planReply.lookup.plans.length===0&&planReply.lookup.insufficientPlans.length===1);
  const review=planReply.lookup.insufficientPlans[0];
  check('Legacy review keeps every old price separately and displays unknown prices',review.packages.every((pkg,index)=>pkg.price===null&&pkg.legacySavedPrice===seeded.legacyPrices[index]));
  check('Legacy review notice is returned by the actual worker',planReply.lookup.legacyPlanDataNotice==='Bản lưu cũ cần tra lại để đối chiếu giá từng gói.');
  const rawAfter=await page.evaluate(async()=>{const {getAppStorage}=await import('./lib/warehouse-storage.js');return (await getAppStorage().get({planLookup:null})).planLookup;});
  assert.deepEqual(rawAfter,rawBefore);check('Upgrade view repair never overwrites the stored historical plan audit values',true);
  const exported=await send(page,'EXPORT_PLANS_CSV');check('Actual export refuses an unverified legacy match list',exported.ok===false&&/Chưa có kế hoạch/.test(exported.message));
  const storage=await page.evaluate(async()=>{const data=await chrome.storage.local.get(null);return {engine:data.warehouseStorage?.engine,
    legacy:['tenders','runs','participations'].filter(key=>Object.hasOwn(data,key)),databases:(await indexedDB.databases()).map(db=>db.name)};});
  report.storage=storage;check('Existing IndexedDB remains in place without legacy full arrays',storage.engine==='indexeddb'&&storage.legacy.length===0&&storage.databases.includes('gscb-warehouse-v1'));
  await page.goto(`chrome-extension://${id}/plans.html`,{waitUntil:'domcontentloaded',timeout:15000});
  await page.waitForFunction(()=>document.querySelector('#alert')?.textContent.includes('Bản lưu cũ cần tra lại'),null,{timeout:15000});
  await page.locator('#insufficient-wrap > summary').click();
  const html=await page.locator('#insufficient-list').innerText();
  report.planUiText=html;
  report.planUiAlert=await page.locator('#alert').innerText();
  await page.screenshot({path:path.join(out,'upgrade-plans.png'),fullPage:true});
  check('Actual plan UI displays the review notice and unknown per-package prices',html.includes('chưa đủ dữ liệu giá')&&!html.includes('51.197.946'));
  check('No JavaScript page errors',report.pageErrors.length===0);
  check('No public HTTP request attempted during isolated upgrade',report.blockedRequests.length===0);
  assert.deepEqual(await inventory(prior),report.sources.prior);assert.deepEqual(await inventory(current),report.sources.current);
  report.sourceUnchanged=true;check('Both actual product trees remain byte-for-byte unchanged',true);report.ok=true;
}catch(error){report.fatal=String(error.stack||error);process.exitCode=1;}
finally{
  report.closed=ctx?await ctx.close().then(()=>true).catch(()=>false):true;ctx=null;
  report.finishedAt=new Date().toISOString();await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'upgrade.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({ok:report.ok,checks:report.checks,fatal:report.fatal,closed:report.closed,profile,scratch,output:path.join(out,'upgrade.json')},null,2));
}
