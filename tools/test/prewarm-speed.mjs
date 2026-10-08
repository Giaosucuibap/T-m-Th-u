/* ============================================================================
 *  ĐO: tab e-GP mở sẵn có làm lượt tra cứu ĐẦU TIÊN nhanh hơn không?
 *
 *  Mỗi lượt: đóng mọi tab e-GP (trạng thái "vừa mở Chrome"), mở màn hình
 *  "Tìm gói thầu", chờ THINK giây (người dùng nhập tiêu chí), rồi bấm tra cứu.
 *  Đo từ lúc bấm tới lúc có kết quả. Chạy xen kẽ BẬT / TẮT để hai bên chịu cùng
 *  điều kiện máy, và đếm số tab e-GP sau mỗi lượt (phải đúng 1).
 *
 *  MOCK_CHAOS=pageslow=4000,... node tools/test/prewarm-speed.mjs <ext> [lượt-mỗi-bên] [think-giây]
 * ========================================================================== */
import { chromium } from 'playwright';
import fs from 'node:fs';

const EXT = process.argv[2];
const RUNS = Number(process.argv[3] || 4);
const THINK = Number(process.argv[4] || 6) * 1000;
const PORT = process.env.MOCK_PORT || 9443;
const UD = fs.mkdtempSync('/tmp/ud-');
const ctx = await chromium.launchPersistentContext(UD, {
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--disable-dev-shm-usage',
    '--no-first-run', '--no-proxy-server', '--ignore-certificate-errors', `--host-resolver-rules=MAP muasamcong.mpi.gov.vn 127.0.0.1:${PORT}`]
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const ID = new URL(sw.url()).host;
const ctl = await ctx.newPage();
await ctl.goto(`chrome-extension://${ID}/options.html`);
const send = (type, payload = {}) => ctl.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [type, payload]);
const egpTabs = () => ctx.pages().filter((p) => /muasamcong/.test(p.url()));

const TINH = ['Lâm Đồng', 'Đồng Nai', 'Khánh Hòa', 'Đắk Lắk', 'Gia Lai', 'Quảng Ngãi', 'Cần Thơ', 'Hà Tĩnh'];
const LOAI = ['XL', 'TV', 'HH', ''];
const ket = { bat: [], tat: [] };
const hong = [];
for (let lan = 0; lan < RUNS * 2; lan++) {
  const bat = lan % 2 === 0;
  await send('UPDATE_SETTINGS', { keepEgpTabWarm: bat });
  for (const p of egpTabs()) await p.close().catch(() => {});
  for (const p of ctx.pages()) if (/search\.html/.test(p.url())) await p.close().catch(() => {});
  await ctl.waitForTimeout(500);
  const man = await ctx.newPage();
  await man.goto(`chrome-extension://${ID}/search.html`);
  await man.waitForTimeout(THINK);
  const criteria = { province: TINH[lan % TINH.length], category: LOAI[Math.floor(lan / TINH.length) % LOAI.length],
    keyword: '', investor: '', ward: '', mustKeywords: '', excludeKeywords: '', minPrice: '', maxPrice: '', focusTab: false };
  const t0 = Date.now();
  const start = await send('TBMT_SEARCH', criteria);
  let run = null;
  for (let i = 0; i < 240 && start?.ok; i++) {
    await ctl.waitForTimeout(100);
    const r = await send('GET_SEARCH_STATE', { runId: start.runId });
    run = r?.selectedRun || (r?.runs || []).find((x) => x.id === start.runId) || null;
    if (run && !['STARTING', 'OPENING', 'RUNNING', 'LISTING'].includes(run.status) && !r?.activeRun) break;
  }
  const giay = (Date.now() - t0) / 1000;
  const soTab = egpTabs().length;
  const nhan = bat ? 'BẬT' : 'TẮT';
  console.log(`  ${nhan} lượt ${Math.floor(lan / 2) + 1}: ${run?.status || start?.message} sau ${giay.toFixed(1)}s, ${soTab} tab e-GP`);
  if (run?.status !== 'SUCCESS' || soTab !== 1) hong.push(`${nhan} lượt ${Math.floor(lan / 2) + 1}: ${run?.status}, ${soTab} tab`);
  else (bat ? ket.bat : ket.tat).push(giay);
  await man.close().catch(() => {});
}
const trungVi = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
console.log(`\nTrung vị thời gian từ lúc bấm tới khi có kết quả (chờ nhập ${THINK / 1000}s):`);
console.log(`  TẮT tab mở sẵn: ${trungVi(ket.tat).toFixed(1)}s  (${ket.tat.map((x) => x.toFixed(1)).join(', ')})`);
console.log(`  BẬT tab mở sẵn: ${trungVi(ket.bat).toFixed(1)}s  (${ket.bat.map((x) => x.toFixed(1)).join(', ')})`);
for (const h of hong) console.log(`  ✗ ${h}`);
await ctx.close();
fs.rmSync(UD, { recursive: true, force: true });
process.exit(hong.length || !(trungVi(ket.bat) < trungVi(ket.tat)) ? 1 : 0);
