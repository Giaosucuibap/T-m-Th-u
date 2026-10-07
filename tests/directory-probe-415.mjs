// An isolated Chrome profile; actual public e-GP queries, no fixtures/replay.
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {DEFAULT_SETTINGS} from '../GiaoSuCuiBap/lib/core.js';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const areaMode=process.argv.includes('--areas'),nationalMode=process.argv.includes('--national'),keyword=process.argv.find(a=>a.startsWith('--keyword='))?.slice(10);
const out=path.resolve(nationalMode?'../../test-results/4.15.0/live-national-probe':keyword?'../../test-results/4.15.0/live-keyword-probe':areaMode?'../../test-results/4.15.0/live-area-probe':'../../test-results/4.15.0/live-probe'),extension=path.resolve('GiaoSuCuiBap');await fs.mkdir(out,{recursive:true});
const profile=path.join(out,`.profile-${Date.now()}`),manifest=JSON.parse(await fs.readFile(path.join(extension,'manifest.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex'),id=hash(Buffer.from(manifest.key,'base64')).slice(0,32).replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));
const report={version:manifest.version,fixture:false,startedAt:new Date().toISOString(),profile,requests:[],responses:[],checks:[],jobs:[],errors:[]};
const write=()=>fs.writeFile(path.join(out,'probe.json'),JSON.stringify(report,null,2));const pause=ms=>new Promise(r=>setTimeout(r,ms));let context,page;const pending=[];
try{
 context=await chromium.launchPersistentContext(profile,{headless:false,channel:'chrome',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',ignoreDefaultArgs:['--disable-extensions'],viewport:{width:1440,height:1000}});
 context.on('request',r=>{if(new URL(r.url()).pathname.replace(/\/$/,'').endsWith('/smart/search')){try{const body=JSON.parse(r.postData());report.requests.push({at:new Date().toISOString(),queries:body[0].query.map(q=>({keyWord:q.keyWord,filters:q.filters})),pageNumber:body[0].pageNumber});}catch{}}});
 context.on('response',r=>{if(new URL(r.url()).pathname.replace(/\/$/,'').endsWith('/smart/search'))pending.push((async()=>{try{const data=await r.json();report.responses.push({at:new Date().toISOString(),status:r.status(),page:data.page||data.data?.page||data[0]?.page,keys:Object.keys(data)});}catch(e){report.errors.push(e.message);}})());});
 const cdp=await context.browser().newBrowserCDPSession();assert.equal((await cdp.send('Extensions.loadUnpacked',{path:extension})).id,id);await cdp.detach();
 page=await context.newPage();await page.goto(`chrome-extension://${id}/search.html`,{waitUntil:'domcontentloaded'});await page.waitForFunction(async()=>Boolean((await chrome.storage.local.get('settings')).settings));
 await page.evaluate(async settings=>(await import(chrome.runtime.getURL('lib/warehouse-storage.js'))).getAppStorage().set({settings,tenders:[],runs:[],activeRun:null,planLookup:null,bidOpenScan:null,hunts:[],watchedInvestors:[]}),{...DEFAULT_SETTINGS,autoScan:false,scanOnStartup:false,telegramEnabled:false,telegramBotToken:'',telegramChatId:'',notifyWebhook:'',webhookSecret:'',maxPagesHint:2});
 const seed=await context.newPage();await seed.goto('https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?render=search',{waitUntil:'domcontentloaded',timeout:60000});await seed.locator('input[placeholder*="TBMT"]:visible, input[placeholder*="Nhập từ khoá"]:visible').first().waitFor({state:'visible',timeout:60000});
 const send=(type,payload={})=>page.evaluate(({type,payload})=>chrome.runtime.sendMessage({type,payload}),{type,payload});
 const research=JSON.parse(await fs.readFile(path.resolve('../../test-results/4.15.0/research/lamdong/lamdong-boards-2026-10-05.json'),'utf8'));
 const names=keyword?[keyword]:areaMode?(research.entries||research.records).filter(r=>r.scope!=='province').map(r=>r.name):[1,2,3].map(n=>`Ban Quản lý dự án đầu tư xây dựng số ${n}`);
 const national=JSON.parse(await fs.readFile(path.resolve('../../test-results/4.15.0/research/national/national-boards-verified.json'),'utf8'));
 const scopes=nationalMode?[...new Map(national.records.map(r=>[r.provinceName,r])).values()].map(r=>({investor:r.legalName,province:r.provinceName})):names.map(investor=>({investor,province:'Tỉnh Lâm Đồng'}));
 for(const {investor,province} of scopes){
  const at=Date.now(),start=await send('PLAN_LOOKUP',{investor,province,days:nationalMode?90:365,focusTab:false});assert.equal(start.ok,true,start.message);
  let job;for(let i=0;i<180;i++){job=(await send('GET_PLAN_STATE')).lookup;if(job?.id===start.lookup.id&&!['RUNNING','STARTING'].includes(job.status)&&(!['SUCCESS','PARTIAL'].includes(job.status)||job.coverage?.done))break;await pause(1200);}
  assert.ok(['SUCCESS','PARTIAL'].includes(job?.status),job?.message);const rows=[...(job.plans||[]),...(job.insufficientPlans||[]),...(job.excludedPlans||[])];
  const identities=[...new Map(rows.filter(p=>p.investorCode&&p.investorName).map(p=>[p.investorCode,{name:p.investorName,code:p.investorCode,reference:p.planNo||p.notifyNo,url:p.detailUrl,locations:p.locations}])).values()];
  report.jobs.push({investor,province,elapsedMs:Date.now()-at,job,identities});report.checks.push({name:investor,ok:true});console.log(JSON.stringify({investor,province,elapsedMs:Date.now()-at,identities:identities.map(i=>({name:i.name,code:i.code,reference:i.reference})),coverage:job.coverage}));await Promise.allSettled(pending);await write();
 }
 report.directory=(await send('INVESTOR_DIRECTORY',{province:'Tỉnh Lâm Đồng',query:'ban',limit:500}));report.completedAt=new Date().toISOString();report.passed=true;
}catch(e){report.passed=false;report.errors.push(e.stack);console.error(e.stack);process.exitCode=1;}
finally{await Promise.allSettled(pending);await context?.close();await write();}

