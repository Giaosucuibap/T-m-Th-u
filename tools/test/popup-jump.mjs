/* Popup có "nhảy" trong lúc nạp không? Đo kích thước liên tục sau khi mở. */
import { chromium } from 'playwright';
import fs from 'node:fs';
const EXT = process.argv[2];
const UD = fs.mkdtempSync('/tmp/ud-');
const ctx = await chromium.launchPersistentContext(UD, { headless:false,
  args:[`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`,'--no-sandbox','--disable-dev-shm-usage','--no-first-run','--no-proxy-server'] });
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker',{timeout:15000});
const ID = new URL(sw.url()).host;
// Nạp sẵn 3000 gói như máy người dùng, để tái hiện đúng lúc danh sách đổ ra.
const seed = await ctx.newPage();
await seed.goto(`chrome-extension://${ID}/privacy.html`);
await seed.evaluate(async (n) => {
  const tenders = Array.from({length:n}, (_,i)=>({
    key:`IB26${String(1000000+i)}::00`, notifyNo:`IB26${String(1000000+i)}`, bidNo:'',
    bidName:'Thi công xây lắp công trình thủy lợi số '+i, price:1e9+i,
    closeDate:new Date(Date.now()+ (i%30)*86400000).toISOString(),
    location:'Lâm Đồng', investorName:'Ban QLDA huyện', score:(i%100),
    matched:i%3===0, reasons:[], negHits:[],
    detailUrl:'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?x='+i
  }));
  await chrome.storage.local.set({ tenders });
}, 3000);
await seed.close();

const p = await ctx.newPage();
await p.setViewportSize({ width: 435, height: 600 });
await p.goto(`chrome-extension://${ID}/popup.html`);
const mau = [];
for (let i = 0; i < 14; i++) {
  await p.waitForTimeout(180);
  mau.push(await p.evaluate(() => `${document.body.offsetWidth}x${document.body.scrollHeight}`));
}
console.log('Kích thước theo thời gian (mỗi 180ms):');
let truoc = null, doi = 0;
for (const [i, m] of mau.entries()) {
  const khac = m !== truoc;
  if (khac && truoc !== null) doi++;
  console.log(`  ${String(i*180).padStart(4)}ms  ${m}${khac && truoc!==null ? '   <- đổi' : ''}`);
  truoc = m;
}
console.log(`\nSố lần đổi kích thước sau khung hình đầu: ${doi}`);
console.log('Chiều rộng có đổi không:', new Set(mau.map(x=>x.split('x')[0])).size > 1 ? 'CÓ ✗' : 'KHÔNG ✓');
await ctx.close(); fs.rmSync(UD,{recursive:true,force:true});
