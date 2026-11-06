import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.resolve('test-results/upgrade');
const profile=path.join(out,'.dom-profile-'+Date.now());
let ctx;
try{
 await fs.mkdir(out,{recursive:true});
 ctx=await chromium.launchPersistentContext(profile,{headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',ignoreDefaultArgs:['--disable-extensions'],permissions:[]});
 await ctx.route(/^https?:\/\//,route=>route.abort('blockedbyclient'));
 const cdp=await ctx.browser().newBrowserCDPSession();
 const {id}=await cdp.send('Extensions.loadUnpacked',{path:path.resolve('test-results/upgrade/prior-4.14.0/GiaoSuCuiBap')});
 const page=await ctx.newPage();await page.goto('chrome://extensions/',{waitUntil:'domcontentloaded'});
 await page.locator('extensions-manager').waitFor();
 const snapshot=await page.locator('body').ariaSnapshot();
 const controls=await page.evaluate(()=>{
  const found=[];
  function visit(root){
   for(const el of root.querySelectorAll('*')){
    if(el.matches('button,cr-icon-button,cr-toggle,cr-button,[role=button],[role=switch]')){
     found.push({tag:el.tagName,id:el.id,role:el.getAttribute('role'),label:el.getAttribute('aria-label'),pressed:el.getAttribute('aria-pressed'),checked:el.getAttribute('aria-checked'),title:el.getAttribute('title'),text:el.textContent.trim().slice(0,180),outer:el.outerHTML.slice(0,500)});
    }
    if(el.shadowRoot)visit(el.shadowRoot);
   }
  }visit(document);return found;
 });
 const dev=page.locator('cr-toggle#devMode');
 if(await dev.getAttribute('aria-checked')!=='true')await dev.click();
 await page.locator(`extensions-item[id="${id}"]`).locator('#dev-reload-button').click();
 await page.getByRole('alert').waitFor({timeout:10000});
 const afterReload=await page.locator('body').ariaSnapshot();
 const report={browser:ctx.browser().version(),profile,id,snapshot,controls,afterReload};
 await fs.writeFile(path.join(out,'chrome-manager-dom.json'),JSON.stringify(report,null,2));
 await page.screenshot({path:path.join(out,'chrome-manager-dom.png'),fullPage:true});
 console.log(JSON.stringify(report,null,2));
}finally{if(ctx)await ctx.close();}

