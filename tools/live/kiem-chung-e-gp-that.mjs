/* ============================================================================
 *  KIỂM CHỨNG TRÊN e-GP THẬT — muasamcong.mof.gov.vn
 *
 *  CỐ Ý chạy trên trang thật (khác tools/test/*, nơi mọi kịch bản bị chặn về
 *  máy giả lập). Ít truy vấn, đúng nhịp người dùng: tiện ích để chính giao diện
 *  e-GP gửi yêu cầu, không tự gọi API, không vượt reCAPTCHA.
 *
 *  node tools/live/kiem-chung-e-gp-that.mjs <thư-mục-tiện-ích> <thư-mục-kết-quả> [--khong-canary]
 *
 *  1. Tìm gói thầu Lâm Đồng trên giao diện thật (đo: thẻ đầu tiên, hoàn tất,
 *     đối soát "e-GP báo N · đã tải N").
 *  2. Tìm lần hai, tiêu chí khác: đo kết quả tức thì từ kho trên trang thật.
 *  3. Gói chờ kết quả (biên bản mở thầu) Lâm Đồng 7 ngày, đọc tối đa 5 gói.
 *  4. Kế hoạch lựa chọn nhà thầu Lâm Đồng 30 ngày.
 *  5. Kiểm tra cấu trúc e-GP (25 mã đã biết) — trừ khi --khong-canary.
 *  6. Tìm nhanh (Ctrl K) theo một mã vừa lấy được.
 *  Ghi kết quả vào <thư-mục-kết-quả>/kiem-chung-<thời-điểm>.json và ảnh chụp.
 *  Không ghi nội dung yêu cầu/phản hồi e-GP, không ghi cookie hay mã reCAPTCHA.
 * ========================================================================== */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EXT = path.resolve(process.argv[2] || 'GiaoSuCuiBap');
const OUT = path.resolve(process.argv[3] || 'ket-qua-that');
const CANARY = !process.argv.includes('--khong-canary');
fs.mkdirSync(OUT, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const report = { version: JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')).version, startedAt: new Date().toISOString(),
  site: 'https://muasamcong.mof.gov.vn', flows: [], pageErrors: [], egpFailures: [] };
const save = () => fs.writeFileSync(path.join(OUT, `kiem-chung-${stamp}.json`), JSON.stringify(report, null, 2));
const UD = fs.mkdtempSync(path.join(OUT, '.ho-so-'));
const ctx = await chromium.launchPersistentContext(UD, {
  headless: false, viewport: { width: 1366, height: 900 }, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run']
});
ctx.on('requestfailed', (r) => { if (/muasamcong\./.test(r.url())) report.egpFailures.push({ path: new URL(r.url()).pathname, error: r.failure()?.errorText }); });
ctx.on('page', (p) => p.on('pageerror', (e) => report.pageErrors.push({ page: p.url().split('?')[0].slice(0, 120), message: e.message.slice(0, 300) })));
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 });
const ID = new URL(sw.url()).host;
const page = await ctx.newPage();
page.on('pageerror', (e) => report.pageErrors.push({ page: 'search.html', message: e.message.slice(0, 300) }));
await page.goto(`chrome-extension://${ID}/search.html`);
await page.waitForTimeout(2500);
const send = (type, payload = {}) => page.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [type, payload]);
const BUSY = ['STARTING', 'OPENING', 'RUNNING', 'LISTING', 'SCANNING'];
const nghi = (ms) => page.waitForTimeout(ms);
const egpTabs = () => ctx.pages().filter((p) => /muasamcong\./.test(p.url()));
async function flow(name, fn) {
  const t0 = Date.now(); const item = { name, ok: false };
  console.log(`▶ ${name}`);
  try { Object.assign(item, await fn()); } catch (e) { item.error = String(e.message || e).slice(0, 500); }
  item.elapsedSeconds = Number(((Date.now() - t0) / 1000).toFixed(2));
  report.flows.push(item); save();
  console.log(`  ${item.ok ? '✓' : '✗'} ${name} — ${item.elapsedSeconds}s — ${item.summary || item.error || ''}`);
  return item;
}
async function datTieuChi({ keyword = '', province = 'Lâm Đồng', category = '' }) {
  await page.bringToFront();
  for (const id of ['investor', 'ward', 'mustKeywords', 'excludeKeywords', 'minPrice', 'maxPrice']) await page.fill(`#${id}`, '').catch(() => {});
  await page.fill('#keyword', keyword); await page.fill('#province', province); await page.selectOption('#category', category);
}
async function choLuotTim(ms = 240000) {
  const t = Date.now(); let tDau = null, tuKho = false;
  while (Date.now() - t < ms) {
    await nghi(200);
    const s = await page.evaluate(() => ({ cards: document.querySelectorAll('#list .ws-result').length,
      store: document.getElementById('list').classList.contains('from-store'),
      running: !document.getElementById('progress').classList.contains('hidden') || document.getElementById('go').disabled }));
    if (tDau === null && s.cards > 0 && (s.store || !s.running)) { tDau = Date.now() - t; tuKho = s.store; }
    if (!s.running) return { tDau, tuKho, xong: Date.now() - t };
  }
  return { tDau, tuKho, xong: null };
}

// 1 + 2. Tìm gói thầu trên giao diện thật.
let maMau = '';
for (const [ten, tieuChi] of [['Tìm gói thầu — Lâm Đồng, xây lắp', { category: 'XL' }], ['Tìm lần hai — Lâm Đồng, từ khóa "kênh" (kết quả tức thì)', { keyword: 'kênh' }]]) {
  await flow(ten, async () => {
    await datTieuChi(tieuChi);
    const t0 = Date.now();
    await page.click('#go');
    await nghi(300);
    const r = await choLuotTim();
    const st = await send('GET_SEARCH_STATE', {});
    const run = st?.selectedRun || st?.runs?.[0];
    const scope = await page.evaluate(() => document.getElementById('run-scope')?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 400));
    const cards = await page.evaluate(() => document.querySelectorAll('#list .ws-result').length);
    if (!maMau) maMau = await page.evaluate(() => (document.querySelector('#list .ws-result .code')?.textContent || '').trim().split('-')[0]);
    await page.screenshot({ path: path.join(OUT, `tim-${report.flows.length + 1}-${stamp}.png`) });
    return { ok: run?.status === 'SUCCESS', status: run?.status, firstCardSeconds: r.tDau === null ? null : r.tDau / 1000, firstCardFromStore: r.tuKho,
      doneSeconds: r.xong === null ? null : r.xong / 1000, cardsOnFirstPage: cards, scope, startToClick: Date.now() - t0,
      summary: `${run?.status} · thẻ đầu tiên ${r.tDau === null ? '—' : (r.tDau / 1000).toFixed(1) + 's'}${r.tuKho ? ' (từ kho)' : ''} · xong ${r.xong === null ? '—' : (r.xong / 1000).toFixed(1) + 's'} · ${scope}` };
  });
  for (const p of egpTabs()) await p.close().catch(() => {});
  await nghi(1500);
}

// 3. Gói chờ kết quả: biên bản mở thầu.
await flow('Gói chờ kết quả — Lâm Đồng 7 ngày, đọc tối đa 5 biên bản', async () => {
  const start = await send('BID_OPEN_SCAN', { query: '', taxCode: '', days: 7, fromDate: '', toDate: '', field: '', province: 'Tỉnh Lâm Đồng',
    investor: '', keyword: '', minPrice: 0, maxPrice: 0, maxPackages: 5, focusTab: false });
  if (!start?.ok) return { ok: false, summary: `không khởi động: ${start?.message}` };
  let scan = null;
  for (let i = 0; i < 900; i++) { await nghi(1000); scan = (await send('GET_BID_OPEN_STATE'))?.scan; if (scan && !BUSY.includes(scan.status)) break; }
  const pkgs = scan?.packages || [];
  const bidders = pkgs.reduce((s, p) => s + (Array.isArray(p.bidders) ? p.bidders.length : 0), 0);
  return { ok: ['SUCCESS', 'PARTIAL'].includes(scan?.status) && pkgs.length > 0, status: scan?.status, packages: pkgs.length, bidders,
    message: String(scan?.message || '').slice(0, 400), summary: `${scan?.status} · ${pkgs.length} gói · ${bidders} lượt nhà thầu · ${String(scan?.message || '').slice(0, 200)}` };
});
for (const p of egpTabs()) await p.close().catch(() => {});
await nghi(1500);

// 4. Kế hoạch lựa chọn nhà thầu.
await flow('Kế hoạch LCNT — Lâm Đồng 30 ngày, xây lắp', async () => {
  const start = await send('PLAN_LOOKUP', { investor: '', province: 'Lâm Đồng', ward: '', keyword: '', category: 'XL', days: 30, fromDate: '', toDate: '' });
  if (!start?.ok) return { ok: false, summary: `không khởi động: ${start?.message}` };
  let s = null;
  for (let i = 0; i < 600; i++) { await nghi(1000); const r = await send('GET_PLAN_STATE', {}); s = r?.lookup || r?.state || r; if (s?.status && !BUSY.includes(s.status)) break; }
  const plans = s?.plans || s?.results || [];
  return { ok: ['SUCCESS', 'PARTIAL'].includes(s?.status), status: s?.status, plans: Array.isArray(plans) ? plans.length : null,
    message: String(s?.message || '').slice(0, 400), summary: `${s?.status} · ${Array.isArray(plans) ? plans.length : '?'} kế hoạch · ${String(s?.message || '').slice(0, 200)}` };
});
for (const p of egpTabs()) await p.close().catch(() => {});
await nghi(1500);

// 5. Kiểm tra cấu trúc e-GP (25 mã).
if (CANARY) {
  await flow('Kiểm tra cấu trúc e-GP — 25 mã đã biết', async () => {
    const r = await send('CANARY_RUN', { wait: true });
    const c = r?.liveCanary || {};
    const cases = Array.isArray(c.cases) ? c.cases : [];
    const dem = cases.reduce((m, x) => { m[x.status] = (m[x.status] || 0) + 1; return m; }, {});
    return { ok: c.status === 'GREEN', status: c.status, counts: dem, notGreen: cases.filter((x) => x.status !== 'GREEN').map((x) => ({ id: x.id, status: x.status, reason: String(x.reason || x.message || '').slice(0, 160) })).slice(0, 25),
      summary: `${c.status} · ${JSON.stringify(dem)}` };
  });
  for (const p of egpTabs()) await p.close().catch(() => {});
}

// 6. Tìm nhanh theo mã thật vừa lấy.
await flow(`Tìm nhanh (Ctrl K) — mã ${maMau || '(không có)'}`, async () => {
  if (!/^IB\d{10}$/.test(maMau)) return { ok: false, summary: 'không lấy được mã mẫu từ lượt tìm' };
  await page.bringToFront();
  await page.keyboard.press('Control+k'); await page.waitForSelector('.qf-panel', { timeout: 5000 });
  await page.fill('.qf-q', maMau); await nghi(800);
  const groups = await page.evaluate(() => [...document.querySelectorAll('.qf-group')].map((g) => g.textContent));
  await page.screenshot({ path: path.join(OUT, `tim-nhanh-${stamp}.png`) });
  await page.keyboard.press('Escape');
  return { ok: groups.some((g) => /Đúng mã/.test(g)), groups, summary: groups.join(' | ') };
});

report.finishedAt = new Date().toISOString();
report.passed = report.flows.filter((f) => f.ok).length;
report.total = report.flows.length;
save();
console.log(`\nKẾT QUẢ: ${report.passed}/${report.total} luồng đạt trên e-GP thật · lỗi trang ${report.pageErrors.length} · yêu cầu e-GP hỏng ${report.egpFailures.length}`);
await ctx.close();
fs.rmSync(UD, { recursive: true, force: true });
process.exit(report.passed === report.total ? 0 : 1);
