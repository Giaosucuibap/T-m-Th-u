// Public e-GP, production extension, own Chrome profile. Never replace responses.
import fs from 'node:fs/promises'; import path from 'node:path'; import crypto from 'node:crypto'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
import { DEFAULT_SETTINGS } from '../GiaoSuCuiBap/lib/core.js';
import { sanitizedHarEntry } from './har-sanitize.mjs';
const require = createRequire(import.meta.url), { chromium } = require('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const extension = path.resolve('GiaoSuCuiBap'), out = path.resolve('../../test-results/4.15.0/live'), stamp = new Date().toISOString().replace(/[:.]/g, '-'); await fs.mkdir(out, { recursive: true });
const profile = path.join(out, `.profile-${stamp}`), manifest = JSON.parse(await fs.readFile(path.join(extension, 'manifest.json'))), hash = b => crypto.createHash('sha256').update(b).digest('hex');
const id = hash(Buffer.from(manifest.key, 'base64')).slice(0, 32).replace(/[0-9a-f]/g, c => String.fromCharCode(97 + parseInt(c, 16)));
const report = { version: manifest.version, fixture: false, startedAt: new Date().toISOString(), profile, checks: [], errors: [], failures: [], sourceHashes: {} };
async function inventory(dir, prefix = '') { for (const name of await fs.readdir(dir)) { const relative = prefix + name, full = path.join(dir, name); if ((await fs.stat(full)).isDirectory()) await inventory(full, relative + '/'); else report.sourceHashes[relative] = hash(await fs.readFile(full)); } }
await inventory(extension);
let ctx, page; const pending = [], entries = [], requestStarts = new WeakMap();
const send = (type, payload = {}) => page.evaluate(({ type, payload }) => chrome.runtime.sendMessage({ type, payload }), { type, payload });
async function save() { await fs.writeFile(path.join(out, `canary-${stamp}.json`), JSON.stringify(report, null, 2)); await fs.writeFile(path.join(out, `egp-redacted-${stamp}.har`), JSON.stringify({ log: { version: '1.2', creator: { name: 'GSCB public verification', version: manifest.version }, comment: 'Redacted at capture. Request secrets and response bodies are not retained. _egpSummary contains only field names and public IDs.', entries } }, null, 2)); }
try {
  ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false, ignoreDefaultArgs: ['--disable-extensions'], viewport: { width: 1440, height: 1000 } });
  report.browser = ctx.browser().version(); /* Fresh profile has no messaging credentials; test settings disable outbound notifications. Passive capture leaves network untouched. */
  ctx.on('request', r => requestStarts.set(r, Date.now()));
  ctx.on('response', r => { if (!r.url().startsWith('https://muasamcong.mpi.gov.vn/')) return; pending.push((async () => {
    let data; try { if (/smart\/search$|area-api-list$|\/bid-open$|\/lotOpenDetail$|\/notify$|\/roundmng$/.test(new URL(r.url()).pathname)) data = await r.json(); } catch { }
    const started = requestStarts.get(r.request()) || Date.now(), entry = sanitizedHarEntry({ url: r.url(), method: r.request().method(), requestBody: r.request().postData(), requestHeaders: await r.request().allHeaders(), responseHeaders: await r.allHeaders(), status: r.status(), startedAt: new Date(started).toISOString(), elapsedMs: Date.now() - started, data }); if (entry) entries.push(entry);
  })().catch(e => { report.errors.push({ capture: e.message }); })); });
  ctx.on('requestfailed', r => { if (r.url().startsWith('https://muasamcong.mpi.gov.vn/')) report.failures.push({ path: new URL(r.url()).pathname, error: r.failure()?.errorText }); });
  ctx.on('page', p => p.on('pageerror', e => report.errors.push({ page: p.url().split('?')[0], message: e.message })));
  const cdp = await ctx.browser().newBrowserCDPSession(); assert.equal((await cdp.send('Extensions.loadUnpacked', { path: extension })).id, id); await cdp.detach();
  const mute = w => w.evaluate(() => { chrome.notifications.create = async () => 'TEST-MUTED'; }); ctx.on('serviceworker', w => mute(w).catch(() => {})); for (const w of ctx.serviceWorkers()) await mute(w);
  page = await ctx.newPage(); await page.goto(`chrome-extension://${id}/diagnostics.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(async()=>Boolean((await chrome.storage.local.get('settings')).settings)); /* INITIAL_INSTALL_READY */
  await page.evaluate(async settings => (await import(chrome.runtime.getURL('lib/warehouse-storage.js'))).getAppStorage().set({ settings, tenders: [], runs: [], activeRun: null, hunts: [], watchedInvestors: [], canaryConfig: { enabled: true, weekday: 1, hour: 2, timezone: 'Asia/Ho_Chi_Minh' }, liveCanary: null }), { ...DEFAULT_SETTINGS, autoScan: false, scanOnStartup: false, telegramEnabled: false, notifyTelegram: false, telegramBotToken: '', telegramChatId: '', notifyWebhook: '', webhookSecret: '' });
  const seed = await ctx.newPage(); report.navigations = []; let nativeReady = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const at = Date.now();
    try {
      await seed.goto('https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?render=search', { waitUntil: 'commit', timeout: 30000 });
      await seed.locator('input[placeholder*="TBMT"]:visible, input[placeholder*="Nhập từ khoá"]:visible').first().waitFor({ state: 'visible', timeout: 45000 });
      report.navigations.push({ attempt, ok: true, elapsedMs: Date.now() - at }); nativeReady = true; break;
    } catch (error) {
      const state=await seed.evaluate(()=>({title:document.title,path:location.origin+location.pathname,text:document.body?.innerText?.slice(0,1200),inputs:[...document.querySelectorAll('input')].map(i=>({type:i.type,placeholder:i.placeholder})).slice(0,20)})).catch(()=>null);
      report.navigations.push({ attempt, ok: false, elapsedMs: Date.now() - at, error: error.message.split('\n')[0],state });
      await seed.screenshot({path:path.join(out,`navigation-${stamp}-${attempt}.png`)}).catch(()=>{});
    }
  }
  assert.ok(nativeReady, 'Native search input unavailable in both bounded navigation attempts');
  const vaultBefore = await page.evaluate(async () => (await import(chrome.runtime.getURL('lib/warehouse-storage.js'))).getAppStorage().get(['tenders', 'runs', 'bidOpenScan']));
  const progress = setInterval(() => page.evaluate(() => chrome.storage.local.get('liveCanary')).then(s => console.log(JSON.stringify({ progress: s.liveCanary?.cases?.length || 0, status: s.liveCanary?.status, last: s.liveCanary?.cases?.at(-1)?.id }))).catch(() => {}), 15000);
  let result; try { result = await send('CANARY_RUN', { wait: true }); } finally { clearInterval(progress); }
  report.canary = result.liveCanary; report.reply = { ok: result.ok, message: result.message };
  assert.equal(result.ok, true, JSON.stringify(result.liveCanary?.cases?.filter(c => c.status !== 'GREEN') || result));
  assert.equal(result.liveCanary?.status, 'GREEN'); assert.equal(result.liveCanary?.cases.length, 25);
  report.checks.push({ name: '25 public e-GP IB/PL/BBMT cases + province703', ok: true });
  const state = await page.evaluate(async () => (await import(chrome.runtime.getURL('lib/warehouse-storage.js'))).getAppStorage().get(['tenders', 'runs', 'bidOpenScan', 'canaryConfig', 'liveCanary']));
  assert.deepEqual(state.tenders, vaultBefore.tenders); assert.deepEqual(state.runs, vaultBefore.runs); assert.deepEqual(state.bidOpenScan, vaultBefore.bidOpenScan);
  assert.equal(state.canaryConfig.weekday, 1); assert.equal(state.canaryConfig.hour, 2); report.nextRunAt = state.liveCanary.nextRunAt;
  report.checks.push({ name: 'Canary leaves warehouse and user search history untouched, Monday02 schedule retained', ok: true });
  await page.bringToFront(); await page.reload(); await page.screenshot({ path: path.join(out, `canary-${stamp}.png`), fullPage: true });
} catch (error) { report.fatal = String(error.stack || error); console.error(report.fatal); }
finally {
  await Promise.allSettled(pending);
  report.sourceUnchanged = true; for (const [file, digest] of Object.entries(report.sourceHashes)) if (hash(await fs.readFile(path.join(extension, file))) !== digest) report.sourceUnchanged = false;
  if (ctx) report.closed = await ctx.close().then(() => true).catch(() => false);
  report.finishedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ report: `canary-${stamp}.json`, status: report.canary?.status, cases: report.canary?.cases?.map(c => ({ id: c.id, status: c.status, reason: c.reason })), unchanged: report.sourceUnchanged, fatal: report.fatal, profile }));
  process.exitCode = report.fatal || report.checks.length !== 2 || !report.sourceUnchanged ? 1 : 0;
}
