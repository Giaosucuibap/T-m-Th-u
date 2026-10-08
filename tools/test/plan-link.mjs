/* Từ một gói TRÚNG THẦU đi sang Kế hoạch lựa chọn nhà thầu bằng nút "Xem KHLCNT". */
import { chromium } from 'playwright';
import fs from 'node:fs';
const EXT = process.argv[2];
const UD = fs.mkdtempSync('/tmp/ud-');
const errors = [];
const ctx = await chromium.launchPersistentContext(UD, { headless:false,
  args:[`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`,'--no-sandbox','--disable-dev-shm-usage','--no-first-run','--no-proxy-server',
    // Không bao giờ để kịch bản thử chạm e-GP THẬT (màn hình tra cứu tự mở sẵn trang e-GP).
    `--host-resolver-rules=MAP muasamcong.mpi.gov.vn 127.0.0.1:${process.env.MOCK_PORT||9443}`] });
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker',{timeout:15000});
const ID = new URL(sw.url()).host;

// Chuẩn hoá bằng chính thư viện của tiện ích (chạy trong Node), rồi nạp vào
// kho dữ liệu dưới dạng số liệu thuần — service worker không import() được.
const { normalizeKqlcntRecord, summarizeWinner } = await import(`${EXT}/lib/kqlcnt.js`);
const raw = {
  id:'700123', notifyId:'700123', notifyNo:'IB2600501375',
  notifyVersion:'null', notifyNoStand:'IB2600501375-null', planNo:'PL2600298877',
  bidName:'Thi công Cải tạo, nâng cấp hệ thống điện chiếu sáng trung tâm xã Tà Hine',
  investorName:'Văn phòng HĐND và UBND xã Tà Hine', bidForm:'CDTRG',
  bidPrice:1748076757, bidWinningPrice:1660672000,
  contractorName:'Công ty TNHH XD TM DV Trí Khôi', winningCode:'vn5801521187',
  decisionDate:'25/08/2026 23:59',
  inputResultId:'null', bidOpenId:'null', techReqId:'null',
  processApply:'null', bidMode:'null', isInternet:0
};
const packages = [normalizeKqlcntRecord(raw, '5801521187')];
const lookup = {
  id:'t1', status:'SUCCESS', query:'5801521187', taxCode:'5801521187',
  contractorName:'Công ty TNHH XD TM DV Trí Khôi',
  packages, summary: summarizeWinner(packages),
  startedAt:new Date().toISOString(), finishedAt:new Date().toISOString(), message:'xong'
};
await sw.evaluate((l) => chrome.storage.local.set({ winnerLookup: l }), lookup);

const p = await ctx.newPage();
p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: ' + m.text()); });
await p.goto(`chrome-extension://${ID}/winners.html`);
await p.waitForTimeout(2000);

const ma = (await p.textContent('.tbmt'))?.trim();
console.log('Mã hiển thị        :', ma);
console.log('  e-GP thật là     : IB2600501375-00 ↗');
const href = await p.getAttribute('.tbmt', 'href');
console.log('Link có chữ "null" :', href.includes('null'));
console.log('Nút Xem KHLCNT     :', await p.locator('[data-plan]').count() ? 'CÓ' : 'KHÔNG');

await p.click('[data-plan]');
await p.waitForTimeout(3000);
const opened = ctx.pages().find((x) => x.url().includes('plans.html'));
console.log('Tab KHLCNT mở ra   :', opened ? 'CÓ' : 'KHÔNG — ' + ctx.pages().map(x=>x.url()).join(' | '));
if (!opened) { await ctx.close(); fs.rmSync(UD,{recursive:true,force:true}); process.exit(1); }
await opened.waitForTimeout(1500);
console.log('  URL              :', new URL(opened.url()).pathname + new URL(opened.url()).search);
console.log('  ô Từ khoá        :', await opened.inputValue('#keyword').catch(()=>'(lỗi)'));
console.log('  ô Thời gian      :', await opened.inputValue('#period').catch(()=>'(lỗi)'), '  ("" = không giới hạn)');

await p.screenshot({ path:'/tmp/shot-winners.png' });
console.log('\nLỖI (' + [...new Set(errors)].length + ')');
for (const e of [...new Set(errors)]) console.log(' ', e);
await ctx.close(); fs.rmSync(UD,{recursive:true,force:true});
