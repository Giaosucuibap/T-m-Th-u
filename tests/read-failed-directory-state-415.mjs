// Read a copy of an isolated QA profile. No portal requests or product writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=path.resolve('../..'), out=path.join(base,'test-results/4.15.0/research/lamdong');
const original=JSON.parse(await fs.readFile(path.join(base,'test-results/4.15.0/live-directory-plans/attempt-2-network-interrupted.json')));
const profile=path.join(out,`.readonly-failed-state-profile-${Date.now()}`);
await fs.cp(original.profile,profile,{recursive:true});
const extension=path.resolve('GiaoSuCuiBap'), id='injgpddgeaedalfgbnnbobdidghjncoj';
let context;
const report={fixture:false,readOnlyProduct:true,originalProfile:original.profile,profile,startedAt:new Date().toISOString(),networkAttempts:[]};
try{
 context=await chromium.launchPersistentContext(profile,{headless:false,channel:'chrome',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',ignoreDefaultArgs:['--disable-extensions'],viewport:{width:1200,height:850}});
 await context.route(/^https?:\/\//,async route=>{report.networkAttempts.push(route.request().url());await route.abort('blockedbyclient');});
 const cdp=await context.browser().newBrowserCDPSession();await cdp.send('Extensions.loadUnpacked',{path:extension});await cdp.detach();
 const page=await context.newPage();await page.goto(`chrome-extension://${id}/diagnostics.html`,{waitUntil:'domcontentloaded'});
 report.state=await page.evaluate(async()=>{const store=(await import(chrome.runtime.getURL('lib/warehouse-storage.js'))).getAppStorage();return await store.get(['planLookup','settings','activeRun','areas']);});
 report.completedAt=new Date().toISOString();
}catch(e){report.error=e.stack;process.exitCode=1;}
finally{report.closed=await context?.close().then(()=>true).catch(()=>false);await fs.writeFile(path.join(out,'failed-profile-state.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({profile,closed:report.closed,error:report.error,job:report.state?.planLookup},null,2));
