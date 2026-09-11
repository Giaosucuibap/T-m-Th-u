/* Mở MỌI trang HTML có trong tiện ích, không chỉ danh sách cố định. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const EXT = process.argv[2];
const pages = [];
(function walk(d, rel = '') {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!['icons','fonts','vendor','lib','tools','tests','test','node_modules','dist','.git'].includes(e.name)) walk(path.join(d, e.name), r); }
    else if (e.name.endsWith('.html')) pages.push(r);
  }
})(EXT);
const UD = fs.mkdtempSync('/tmp/ud-');
const errors = [];
const ctx = await chromium.launchPersistentContext(UD, { headless: false,
  args: [`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`,'--no-sandbox','--disable-dev-shm-usage','--no-first-run','--no-proxy-server'] });
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker',{timeout:15000});
const ID = new URL(sw.url()).host;
console.log(`${pages.length} trang HTML\n`);
for (const p of pages.sort()) {
  const local = [];
  const pg = await ctx.newPage();
  pg.on('pageerror', e => local.push('PAGEERROR: ' + e.message));
  pg.on('console', m => { if (m.type()==='error') local.push('CONSOLE: ' + m.text()); });
  pg.on('requestfailed', r => local.push('TẢI HỎNG: ' + r.url().split('/').slice(-2).join('/')));
  const res = await pg.goto(`chrome-extension://${ID}/${p}`, { waitUntil:'load' }).catch(e=>({status:()=>'ERR '+e.message}));
  await pg.waitForTimeout(1400);
  const t = await pg.title();
  const uniq = [...new Set(local)];
  console.log(`${uniq.length?'LỖI':'OK '}  ${p.padEnd(22)} status=${res.status?res.status():'?'} title="${t}"`);
  for (const e of uniq) { console.log('        ' + e.slice(0,150)); errors.push(p + ' | ' + e); }
  await pg.close();
}
console.log(`\n===== TỔNG LỖI: ${errors.length} =====`);
await ctx.close(); fs.rmSync(UD,{recursive:true,force:true});
