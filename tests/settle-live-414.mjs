// Read the final persisted receipt of the same real-network run after the
// export has completed. Do not start another query or replace source data.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.resolve('../../test-results/4.14.0/browser/live'),reportPath=path.join(out,'multi-investor-live.json');
const report=JSON.parse(await fs.readFile(reportPath,'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const extension=path.resolve('GiaoSuCuiBap');
const manifest=JSON.parse(await fs.readFile(path.join(extension,'manifest.json'),'utf8'));
const id=hash(Buffer.from(manifest.key,'base64')).slice(0,32).replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));
for(const [file,digest] of Object.entries(report.sourceHashes))assert.equal(hash(await fs.readFile(path.join(extension,file))),digest);
for(const file of report.exports)assert.equal(hash(await fs.readFile(path.join(out,file.file))),file.sha256);
await fs.copyFile(reportPath,path.join(out,'diagnostic-finalization-snapshot.json'));
let ctx;
try{
  ctx=await chromium.launchPersistentContext(report.profile,{headless:false,channel:'chrome',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',ignoreDefaultArgs:['--disable-extensions'],viewport:{width:1440,height:1000}});
  await ctx.route(/^https?:\/\//,route=>route.abort());
  const cdp=await ctx.browser().newBrowserCDPSession();
  assert.equal((await cdp.send('Extensions.loadUnpacked',{path:extension})).id,id);await cdp.detach();
  const page=await ctx.newPage();await page.goto(`chrome-extension://${id}/winners.html`,{waitUntil:'domcontentloaded'});
  const reply=await page.evaluate(()=>chrome.runtime.sendMessage({type:'GET_WINNER_STATE'}));
  assert.equal(reply.ok,true);const final=reply.lookup,prior=report.winner;
  assert.equal(final.id,prior.id,'Same real-network lookup');assert.equal(final.status,'SUCCESS');
  assert.equal(final.coverage.complete,true);assert.equal(final.coverage.done,true);
  assert.equal(final.coverage.fetched,final.coverage.serverTotal);assert.equal(final.coverage.pagesRead,final.coverage.totalPages);
  const resultTasks=final.queryBatch.map((task,index)=>({task,index})).filter(x=>x.task.purpose==='results');
  assert.equal(resultTasks.length,3);for(const {index} of resultTasks)assert.equal(final.batchReceipts[index]?.done,true);
  assert.deepEqual(final.packages,prior.packages,'Final receipt cannot change matched rows');
  assert.deepEqual(final.insufficientPackages,prior.insufficientPackages,'Final receipt cannot change unknown rows');
  assert.deepEqual(final.resultStates,prior.resultStates,'Final receipt cannot change classifications');
  for(const field of ['fetched','serverTotal','pagesRead','totalPages','match','insufficient','outOfRange'])assert.equal(final.coverage[field],prior.coverage[field],field);
  report.finalizationReadback={at:new Date().toISOString(),sameProfile:true,networkDisabled:true,sameRunId:final.id,
    matchedRowsUnchanged:true,unknownRowsUnchanged:true,classificationsUnchanged:true,allResultBranchesDone:true,
    priorCoverage:prior.coverage,finalCoverage:final.coverage,note:'Initial QA snapshot raced the final receipt; XLSX was exported after that receipt. Read back persisted final state without fetching or altering data.'};
  report.winner=final;
  await page.screenshot({path:path.join(out,'multi-winners-final-receipt.png'),fullPage:false});
  await ctx.close();ctx=null;report.finalizationReadback.closed=true;
  for(const [file,digest] of Object.entries(report.sourceHashes))assert.equal(hash(await fs.readFile(path.join(extension,file))),digest);
  for(const file of report.exports)assert.equal(hash(await fs.readFile(path.join(out,file.file))),file.sha256);
  await fs.writeFile(reportPath,JSON.stringify(report,null,2));
  console.log(JSON.stringify({ok:true,id:final.id,coverage:final.coverage,workbookBytesUnchanged:true}));
}finally{if(ctx)await ctx.close();}
