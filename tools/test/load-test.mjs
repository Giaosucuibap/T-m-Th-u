import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const EXT = process.argv[2] || new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const UD  = fs.mkdtempSync('/tmp/ud-');
const errors = [];
const logs = [];

const ctx = await chromium.launchPersistentContext(UD, {
  
  headless: false,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--no-sandbox','--disable-dev-shm-usage','--no-first-run'
  ]
});

function hook(target, label){
  target.on('console', m => {
    const t = m.type();
    const line = `[${label}] ${t}: ${m.text()}`;
    logs.push(line);
    if (t === 'error') errors.push(line);
  });
  target.on('pageerror', e => { errors.push(`[${label}] PAGEERROR: ${e.message}`); });
}

// wait for service worker
let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 }).catch(()=>null);
if (!sw) { console.log('!! SERVICE WORKER KHÔNG KHỞI ĐỘNG'); }
else {
  hook(sw, 'SW');
  console.log('SW url:', sw.url());
}
const extId = sw ? new URL(sw.url()).host : null;
console.log('Extension ID:', extId);

await new Promise(r=>setTimeout(r,2500));

const pages = ['popup.html','dashboard.html','options.html','search.html','winners.html','bidopen.html','plans.html','market.html','investor.html','profile.html','contractors.html','analytics.html','diagnostics.html','onboarding.html','privacy.html','mobile/iphone.html'];

for (const p of pages) {
  const page = await ctx.newPage();
  hook(page, p);
  const url = `chrome-extension://${extId}/${p}`;
  try {
    const resp = await page.goto(url, { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(1800);
    const title = await page.title();
    const bodyLen = (await page.evaluate(()=>document.body.innerText.length));
    console.log(`OK  ${p.padEnd(20)} status=${resp?resp.status():'?'} title="${title}" text=${bodyLen}`);
  } catch(e) {
    console.log(`ERR ${p.padEnd(20)} ${e.message.split('\n')[0]}`);
    errors.push(`[${p}] NAV: ${e.message.split('\n')[0]}`);
  }
  await page.close();
}

await new Promise(r=>setTimeout(r,1500));

console.log('\n================ LỖI (' + errors.length + ') ================');
for (const e of [...new Set(errors)]) console.log(e);
await ctx.close();
fs.rmSync(UD,{recursive:true,force:true});
