// Real Chrome extension pages; directory responses are fixtures, not live legal evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const extension=path.join(process.cwd(),'GiaoSuCuiBap');
const out=path.join(process.cwd(),'test-results/directory-ui');
const profile=path.join(out,`.profile-${Date.now()}`);
await fs.mkdir(out,{recursive:true});
const screens=['search','plans','bidopen','winners','market','hunts','investor','rivals','analytics'];
const testedFiles=['investor-input.js','ward-picker.js','workspace.css',...screens.flatMap(name=>[`${name}.js`,`${name}.html`])];
async function hashes(files=testedFiles){const result={};for(const file of files)result[file]=crypto.createHash('sha256').update(await fs.readFile(path.join(extension,file))).digest('hex');return result;}
async function inventory(directory=extension,prefix=''){let files=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){const relative=prefix?`${prefix}/${entry.name}`:entry.name;files=files.concat(entry.isDirectory()?await inventory(path.join(directory,entry.name),relative):[relative]);}return files.sort();}
const sourceFiles=await inventory();
const report={startedAt:new Date().toISOString(),fixture:true,liveEndToEnd:false,externalNetworkBlocked:true,profile,checks:[],errors:[],sourceHashes:await hashes(sourceFiles),testedUIHashes:await hashes(),version:JSON.parse(await fs.readFile(path.join(extension,'manifest.json'),'utf8')).version};
const boardName='Ban Quản lý dự án đầu tư xây dựng số 1 tỉnh Lâm Đồng (kiểm thử)';
const code='vn0012345678';
let ctx,page;
async function check(name,fn){const start=Date.now();await fn();report.checks.push({name,ok:true,elapsedMs:Date.now()-start});console.log('PASS',name);}
try{
  ctx=await chromium.launchPersistentContext(profile,{headless:true,channel:'chrome',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',ignoreDefaultArgs:['--disable-extensions'],viewport:{width:1440,height:1000}});
  report.browser=ctx.browser().version();
  await ctx.route(/^https?:\/\//,route=>route.abort());
  const cdp=await ctx.browser().newBrowserCDPSession();
  const {id}=await cdp.send('Extensions.loadUnpacked',{path:extension});
  report.extensionId=id;
  await ctx.addInitScript(({boardName,code})=>{
    if(location.protocol!=='chrome-extension:')return;
    const original=chrome.runtime.sendMessage.bind(chrome.runtime);
    globalThis.__directoryRequests=[];
    globalThis.__scanRequests=[];
    globalThis.__lateDirectory=false;
    const board={id:'fixture-board-1',name:boardName,provinceName:'Tỉnh Lâm Đồng',provinceAliases:['Lâm Đồng','703','68'],queryValue:code,eGpCode:code,aliases:['ban 1 tỉnh lâm đồng'],status:'active',sourceUrl:'https://lamdong.gov.vn/',sourceDate:'2026-09-30',checkedAt:'2026-10-05',kind:'organization',evidenceLabel:'Nguồn chính thức (kiểm thử)'};
    const observed={id:'fixture-observed',name:'Đơn vị quan sát <script> (kiểm thử)',provinceName:'Tỉnh Lâm Đồng',queryValue:'Đơn vị quan sát kiểm thử',eGpCode:null,status:'observed',kind:'organization',sourceUrl:'javascript:alert(1)',evidenceLabel:'Đã thấy trên e-GP; chưa xác minh hoạt động'};
    const other={...board,id:'fixture-hue',name:'Ban Quản lý dự án số 1 tại Huế (kiểm thử)',provinceName:'Thành phố Huế',provinceAliases:['Huế'],queryValue:'vn0098765432',eGpCode:'vn0098765432'};
    chrome.runtime.sendMessage=async(message,...args)=>{
      if(message.type==='INVESTOR_DIRECTORY'){
        __directoryRequests.push(structuredClone(message));
        if(__lateDirectory)await new Promise(resolve=>setTimeout(resolve,350));
        return {ok:true,entries:[board,observed,other],total:3,coverage:{text:'Danh mục kiểm thử; không dùng làm bằng chứng hoạt động.'}};
      }
      if(message.type==='AREA_OPTIONS')return {ok:true,provinces:['Tỉnh Lâm Đồng','Thành phố Huế'],wardIdentities:message.payload?.province?[{code:'fixture-ward-1',parentCode:'703',name:'Xã Đức Trọng',current:true}]:[],organizationOptions:message.payload?.province?[board]:[],organizationCoverage:{text:'Danh mục kiểm thử.'}};
      if(['TBMT_SEARCH','PLAN_LOOKUP','BID_OPEN_SCAN','WINNER_LOOKUP','AREA_SCAN','INVESTOR_SCAN','SAVE_HUNT'].includes(message.type)){
        __scanRequests.push(structuredClone(message));return {ok:false,message:'TEST: external scan intercepted'};
      }
      return original(message,...args);
    };
  },{boardName,code});
  page=await ctx.newPage();
  page.on('pageerror',error=>report.errors.push({path:new URL(page.url()).pathname,message:error.message}));
  const nav=async name=>{
    await page.goto(`chrome-extension://${id}/${name}.html`,{waitUntil:'domcontentloaded'});
    if(name==='analytics')await page.locator('[data-t="relations"]').click();
    await page.locator('.investor-multi-hint').waitFor();
  };
  const ownerSelector=name=>name==='investor'?'#keyword':name==='analytics'?'#rInv':'#investor';
  const choose=async name=>{
    const input=page.locator(ownerSelector(name));
    if(name!=='analytics')await page.locator('#province').fill('Tỉnh Lâm Đồng');
    await input.fill('Đức Trọng; ban 1 tỉnh lâm đồng');
    await page.locator('.investor-directory-list [role="option"]').first().waitFor();
    await input.press('ArrowDown');
    await input.press('Enter');
    assert.equal(await input.inputValue(),`Đức Trọng; ${code}`);
    assert.equal(await input.getAttribute('aria-expanded'),'false');
    assert.match(await page.locator('.investor-directory-chip').innerText(),/Mã e-GP vn0012345678/);
    assert.equal(await page.evaluate(()=>__scanRequests.length),0,'Enter selects a suggestion without dispatching a scan');
    return input;
  };
  await check('All nine owner controls share source-labelled keyboard selection and preserve OR terms',async()=>{
    for(const name of screens){
      await nav(name);
      await choose(name);
      const requests=await page.evaluate(()=>__directoryRequests);
      assert.ok(requests.some(request=>request.payload.query==='ban 1 tỉnh lâm đồng'),name);
      assert.ok(requests.every(request=>request.payload.limit===20),name);
      if(name!=='analytics')assert.ok(requests.some(request=>request.payload.province==='Tỉnh Lâm Đồng'),name);
      else assert.ok(requests.every(request=>request.payload.province===''),name);
    }
  });
  await check('Directory filters wrong-province suggestions and renders untrusted names as text',async()=>{
    await nav('search');await page.locator('#province').fill('Tỉnh Lâm Đồng');await page.locator('#investor').fill('ban');
    const options=page.locator('.investor-directory-list [role="option"]');await options.first().waitFor();
    assert.equal(await options.count(),2);
    assert.doesNotMatch(await page.locator('.investor-directory-list').innerText(),/tại Huế/);
    assert.equal(await page.locator('.investor-directory-list script').count(),0);
    assert.equal(await page.locator('.investor-directory-source').count(),1);
    assert.equal(await page.locator('.investor-directory-source').getAttribute('href'),'https://lamdong.gov.vn/');
    assert.match(await options.nth(1).innerText(),/chưa xác minh hoạt động/);
    assert.match(await options.nth(1).innerText(),/Tìm theo tên; chưa có mã e-GP/);
    await page.screenshot({path:path.join(out,'directory-desktop.png')});
  });
  await check('Cross-province change keeps the selected text, warns, and blocks dispatch until removed',async()=>{
    await nav('plans');const input=await choose('plans');
    await page.locator('#province').fill('Thành phố Huế');await page.locator('#go').click();
    assert.equal(await input.inputValue(),`Đức Trọng; ${code}`);
    assert.equal(await input.getAttribute('aria-invalid'),'true');
    assert.match(await page.locator('.investor-directory-message').innerText(),/gắn với tỉnh khác/);
    assert.equal(await page.evaluate(()=>__scanRequests.length),0);
    await page.locator('.investor-directory-remove').click();
    assert.equal(await input.inputValue(),'Đức Trọng');
    assert.equal(await input.getAttribute('aria-invalid'),'false');
    await page.locator('#go').click();
    assert.equal(await page.evaluate(()=>__scanRequests[0]?.payload.investor),'Đức Trọng');
  });
  await check('AREA_OPTIONS board choice routes into owner criteria without any organization ward identity',async()=>{
    for(const [name,type] of [['search','TBMT_SEARCH'],['plans','PLAN_LOOKUP'],['market','AREA_SCAN'],['hunts','SAVE_HUNT']]){
      await nav(name);await page.locator('#investor').fill('Đơn Dương');await page.locator('#province').fill('Tỉnh Lâm Đồng');
      await page.locator('#province').press('Tab');
      await page.waitForFunction(()=>[...document.querySelectorAll('#ward-list option')].some(option=>option.value.startsWith('Ban QLDA')));
      const label=await page.locator('#ward-list option').evaluateAll(options=>options.find(option=>option.value.startsWith('Ban QLDA')).value);
      await page.locator('#ward').fill(label);
      assert.equal(await page.locator('#investor').inputValue(),`Đơn Dương; ${code}`,name);
      assert.equal(await page.locator('#ward').inputValue(),'',name);
      assert.match(await page.locator('#ward-hint').innerText(),/không dùng như mã xã/);
      if(name==='hunts'){await page.locator('#name').fill('Danh mục kiểm thử');await page.locator('#hunt-form button[type="submit"]').click();}
      else await page.locator('#go').click();
      const captured=await page.evaluate(type=>__scanRequests.find(request=>request.type===type)?.payload,type);
      assert.ok(captured,name);
      const criteria=name==='hunts'?captured.criteria:captured;
      assert.equal(criteria.investor,`Đơn Dương; ${code}`,name);
      assert.equal(criteria.ward,'',name);
      assert.ok(!criteria.wardIdentities?.length,name);
    }
  });
  await check('Administrative ward selection continues to send the exact ward and parent code',async()=>{
    await nav('plans');await page.locator('#investor').fill('');await page.locator('#province').fill('Tỉnh Lâm Đồng');await page.locator('#province').press('Tab');
    await page.waitForFunction(()=>document.querySelector('#ward-list option[value^="Xã Đức Trọng"]'));
    const label=await page.locator('#ward-list option[value^="Xã Đức Trọng"]').getAttribute('value');
    await page.locator('#ward').fill(label);await page.locator('#go').click();
    const captured=await page.evaluate(()=>__scanRequests.find(request=>request.type==='PLAN_LOOKUP').payload);
    assert.equal(captured.ward,'Xã Đức Trọng');
    assert.deepEqual(captured.wardIdentities,[{code:'fixture-ward-1',parentCode:'703',name:'Xã Đức Trọng'}]);
    assert.equal(captured.investor,'');
  });
  await check('Late directory responses cannot reopen suggestions after Escape or province change',async()=>{
    await nav('search');await page.locator('#province').fill('Tỉnh Lâm Đồng');
    await page.evaluate(()=>__lateDirectory=true);await page.locator('#investor').fill('late lookup');
    await page.waitForTimeout(230);await page.locator('#investor').press('Escape');await page.waitForTimeout(450);
    assert.equal(await page.locator('#investor').getAttribute('aria-expanded'),'false');
    await page.locator('#investor').fill('another lookup');await page.waitForTimeout(230);await page.locator('#province').fill('Thành phố Huế');await page.waitForTimeout(450);
    assert.equal(await page.locator('#investor').getAttribute('aria-expanded'),'false');
  });
  await check('Mobile suggestions and selected owner chips stay inside the viewport on all nine screens',async()=>{
    await page.setViewportSize({width:390,height:844});
    for(const name of screens){await nav(name);await choose(name);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name);}
    await nav('search');await page.locator('#province').fill('Tỉnh Lâm Đồng');await page.locator('#investor').fill('ban');await page.locator('.investor-directory-list [role="option"]').first().waitFor();await page.locator('#investor').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'directory-mobile.png')});
  });
  assert.deepEqual(report.errors,[]);
  assert.deepEqual(await inventory(),sourceFiles,'Production file inventory changed during browser test');
  assert.deepEqual(await hashes(sourceFiles),report.sourceHashes,'Production sources changed during browser test');
  report.testedSourcesUnchanged=true;
  report.sourceUnchanged=true;
  report.ok=true;
}catch(error){report.ok=false;report.fatal=error.stack;console.error(error.stack);if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});}
finally{if(ctx){await ctx.close();report.closed=true;}report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:report.ok,checks:report.checks.length,errors:report.errors}));process.exitCode=report.ok?0:1;}
