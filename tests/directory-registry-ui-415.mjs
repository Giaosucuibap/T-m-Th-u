// Production registry and service-worker routing, real Chrome UI. The area
// catalog cache is a fixture with no ward identities; no portal scan runs.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ORGANIZATION_DIRECTORY} from '../GiaoSuCuiBap/lib/organization-directory-data.js';
import {officialDirectoryEntries,provinceIdentity} from '../GiaoSuCuiBap/lib/organization-directory.js';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const extension=path.join(process.cwd(),'GiaoSuCuiBap'),out=path.join(process.cwd(),'test-results/directory-registry-ui'),profile=path.join(out,`.profile-${Date.now()}`);
await fs.mkdir(out,{recursive:true});
async function inventory(){const result={};async function walk(at){for(const entry of await fs.readdir(at,{withFileTypes:true})){const file=path.join(at,entry.name);if(entry.isDirectory())await walk(file);else result[path.relative(extension,file).replaceAll('\\','/')]=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');}}await walk(extension);return Object.fromEntries(Object.entries(result).sort(([a],[b])=>a.localeCompare(b)));}
const expected=officialDirectoryEntries(ORGANIZATION_DIRECTORY),lam=expected.filter(entry=>provinceIdentity(entry.provinceName)==='lam dong');
const report={startedAt:new Date().toISOString(),registryProduction:true,areaCatalogFixture:true,liveEndToEnd:false,externalNetworkBlocked:true,profile,checks:[],errors:[],sourceHashes:await inventory(),version:JSON.parse(await fs.readFile(path.join(extension,'manifest.json'),'utf8')).version,registryCount:expected.length,lamDongCount:lam.length};
let ctx,page;
async function check(name,fn){const start=Date.now();await fn();report.checks.push({name,ok:true,elapsedMs:Date.now()-start});console.log('PASS',name);}
try{
  assert.ok(lam.length>=3,'Compile the primary-source registry before running this integration check');
  const namedProvinces=[...new Set(expected.map(entry=>entry.provinceName))];
  const provinceRecords=namedProvinces.flatMap(name=>{
    const entry=expected.find(row=>row.provinceName===name),codes=(entry.provinceAliases||[]).filter(code=>/^\d{1,3}$/.test(code));
    return codes.map((code,index)=>({code,name,current:index===0,fold:provinceIdentity(name)}));
  });
  const catalog={provinces:provinceRecords,wardsByProvince:Object.fromEntries(provinceRecords.map(entry=>[entry.code,[]])),fetchedAt:new Date().toISOString()};
  ctx=await chromium.launchPersistentContext(profile,{headless:true,channel:'chrome',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',ignoreDefaultArgs:['--disable-extensions'],viewport:{width:1440,height:1000}});
  report.browser=ctx.browser().version();await ctx.route(/^https?:\/\//,route=>route.abort());
  const cdp=await ctx.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:extension});report.extensionId=id;
  await ctx.addInitScript(()=>{
    if(location.protocol!=='chrome-extension:')return;
    const original=chrome.runtime.sendMessage.bind(chrome.runtime);globalThis.__realSend=original;globalThis.__requests=[];
    chrome.runtime.sendMessage=(message,...args)=>{
      if(['TBMT_SEARCH','PLAN_LOOKUP','BID_OPEN_SCAN','WINNER_LOOKUP','AREA_SCAN','INVESTOR_SCAN','SAVE_HUNT'].includes(message.type)){__requests.push(structuredClone(message));return Promise.resolve({ok:false,message:'TEST: live scan intercepted'});}
      return original(message,...args);
    };
  });
  page=await ctx.newPage();page.on('pageerror',error=>report.errors.push({path:new URL(page.url()).pathname,message:error.message}));
  const nav=async name=>{await page.goto(`chrome-extension://${id}/${name}.html`,{waitUntil:'domcontentloaded'});if(name==='analytics')await page.locator('[data-t="relations"]').click();await page.locator('.investor-multi-hint').waitFor();};
  await nav('search');await page.evaluate(catalog=>chrome.storage.local.set({areas:catalog,provinceCatalog:catalog,organizationDirectoryObservations:{schema:1,entries:[]}}),catalog);
  await check('Production directory API returns each sourced Lâm Đồng entry and excludes all other provinces',async()=>{
    const result=await page.evaluate(()=>__realSend({type:'INVESTOR_DIRECTORY',payload:{province:'Tỉnh Lâm Đồng',query:'',limit:500,officialOnly:true}}));
    assert.equal(result.ok,true);assert.equal(result.total,lam.length);assert.equal(result.entries.length,lam.length);
    assert.deepEqual(result.entries.map(entry=>entry.id).sort(),lam.map(entry=>entry.id).sort());
    assert.ok(result.entries.every(entry=>provinceIdentity(entry.provinceName)==='lam dong'));
    report.directoryResponse={total:result.total,coverage:result.coverage};
  });
  const alias=await page.evaluate(()=>__realSend({type:'INVESTOR_DIRECTORY',payload:{province:'Tỉnh Lâm Đồng',query:'ban 1 tỉnh lâm đồng',limit:20}}));
  assert.equal(alias.ok,true);assert.ok(alias.entries.length);const board=alias.entries.find(entry=>/\bsố 1\b/i.test(entry.name))||alias.entries[0];report.selectedBoard={id:board.id,name:board.name,queryValue:board.queryValue,eGpCode:board.eGpCode,sourceUrl:board.sourceUrl,sourceDate:board.sourceDate};
  await check('Every owner control renders and selects the same production board, query identity and source',async()=>{
    for(const name of ['search','plans','bidopen','winners','market','hunts','investor','rivals','analytics']){
      await nav(name);if(name!=='analytics')await page.locator('#province').fill('Tỉnh Lâm Đồng');
      const input=page.locator(name==='investor'?'#keyword':name==='analytics'?'#rInv':'#investor');await input.fill('ban 1 tỉnh lâm đồng');
      const option=page.locator('.investor-directory-list [role="option"]').filter({has:page.locator('strong',{hasText:board.name})}).first();await option.waitFor();
      const link=option.locator('.investor-directory-source');assert.equal(await link.getAttribute('href'),board.sourceUrl,name);
      if(board.sourceDate){const text=await option.innerText();assert.equal(text.split(board.sourceDate).length-1,1,'Evidence date appears once');}
      await option.click();assert.equal(await input.inputValue(),board.queryValue,name);assert.equal(await page.evaluate(()=>__requests.length),0,name);
    }
  });
  await check('All four combined area selectors expose the same complete official board directory',async()=>{
    for(const name of ['search','plans','market','hunts']){
      await nav(name);await page.locator('#investor').fill('Đơn Dương');await page.locator('#province').fill('Tỉnh Lâm Đồng');await page.locator('#province').press('Tab');
      await page.waitForFunction(count=>document.querySelectorAll('#ward-list option[value^="Ban QLDA"] ').length===count,lam.length);
      const values=await page.locator('#ward-list option').evaluateAll(options=>options.map(option=>option.value));
      for(const entry of lam)assert.ok(values.some(value=>value.includes(entry.name)),entry.name);
      assert.ok(values.every(value=>value.startsWith('Ban QLDA')),'Fixture provides no administrative wards');
      const selected=values.find(value=>value.includes(board.name));await page.locator('#ward').fill(selected);
      assert.equal(await page.locator('#ward').inputValue(),'');assert.equal(await page.locator('#investor').inputValue(),`Đơn Dương; ${board.queryValue}`);
      await page.screenshot({path:path.join(out,`${name}-directory.png`)});
    }
  });
  await check('A different province has its own sourced owner suggestions and never carries Lâm Đồng boards',async()=>{
    const other=expected.find(entry=>provinceIdentity(entry.provinceName)!=='lam dong');assert.ok(other);
    await nav('plans');await page.locator('#province').fill(other.provinceName);await page.locator('#investor').fill(other.name.slice(0,20));
    await page.locator('.investor-directory-list [role="option"]').first().waitFor();
    const text=await page.locator('.investor-directory-list').innerText();assert.doesNotMatch(text,/Tỉnh Lâm Đồng/);
    const result=await page.evaluate(province=>__realSend({type:'INVESTOR_DIRECTORY',payload:{province,query:'',limit:500,officialOnly:true}}),other.provinceName);
    assert.equal(result.total,expected.filter(entry=>provinceIdentity(entry.provinceName)===provinceIdentity(other.provinceName)).length);
    assert.ok(result.entries.every(entry=>provinceIdentity(entry.provinceName)===provinceIdentity(other.provinceName)));
    report.otherProvince={name:other.provinceName,total:result.total};
  });
  assert.deepEqual(report.errors,[]);assert.deepEqual(await inventory(),report.sourceHashes,'Production changed while the integration test ran');report.sourceUnchanged=true;report.ok=true;
}catch(error){report.ok=false;report.fatal=error.stack;console.error(error.stack);if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});}
finally{if(ctx){await ctx.close();report.closed=true;}report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:report.ok,checks:report.checks.length,errors:report.errors}));process.exitCode=report.ok?0:1;}
