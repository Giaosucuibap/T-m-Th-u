// One native portal health probe in an isolated Chrome profile. No extension
// jobs, interception, certificate/proxy overrides or personal Chrome access.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const extension=path.resolve('GiaoSuCuiBap'),out=path.resolve('../../test-results/4.15.0/browser/live'),profile=path.join(out,`.profile-directory-health-${Date.now()}`);
await fs.mkdir(out,{recursive:true});
async function inventory(){const entries={};async function walk(dir,prefix=''){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const relative=prefix+entry.name,full=path.join(dir,entry.name);if(entry.isDirectory())await walk(full,relative+'/');else entries[relative]=crypto.createHash('sha256').update(await fs.readFile(full)).digest('hex');}}await walk(extension);return Object.fromEntries(Object.entries(entries).sort(([a],[b])=>a.localeCompare(b)));}
const report={startedAt:new Date().toISOString(),version:JSON.parse(await fs.readFile(path.join(extension,'manifest.json'),'utf8')).version,fixture:false,interception:false,liveFeatureTest:false,attempts:1,limits:{commitMs:30000,nativeInputMs:45000},profile,sourceHashes:await inventory(),failures:[],documentResponses:[],ok:false};
let context,page;const at=Date.now();
try{
  context=await chromium.launchPersistentContext(profile,{headless:false,channel:'chrome',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',viewport:{width:1440,height:1000}});
  report.browser=context.browser().version();
  context.on('requestfailed',request=>{if(request.url().startsWith('https://muasamcong.mpi.gov.vn/'))report.failures.push({path:new URL(request.url()).pathname,error:request.failure()?.errorText});});
  context.on('response',response=>{if(response.request().resourceType()==='document'&&response.url().startsWith('https://muasamcong.mpi.gov.vn/'))report.documentResponses.push({path:new URL(response.url()).pathname,status:response.status()});});
  page=await context.newPage();
  await page.goto('https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?render=search',{waitUntil:'commit',timeout:30000});
  await page.locator('input[placeholder*="TBMT"]:visible, input[placeholder*="Nhập từ khoá"]:visible').first().waitFor({state:'visible',timeout:45000});
  report.ok=true;
}catch(error){report.error=error.message.split('\n')[0];}
finally{
  report.elapsedMs=Date.now()-at;
  if(page)await page.screenshot({path:path.join(out,'native-health-final.png'),fullPage:true}).catch(()=>{});
  if(context)report.closed=await context.close().then(()=>true).catch(()=>false);
  try{assert.deepEqual(await inventory(),report.sourceHashes);report.sourceUnchanged=true;}catch(error){report.sourceUnchanged=false;report.sourceGateError=error.message;report.ok=false;}
  report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'native-health-final.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({ok:report.ok,elapsedMs:report.elapsedMs,error:report.error,failures:report.failures,sourceUnchanged:report.sourceUnchanged,closed:report.closed,profile}));
  process.exitCode=report.ok?0:1;
}
