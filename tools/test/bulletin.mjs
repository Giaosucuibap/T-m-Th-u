/* ============================================================================
 *  KỊCH BẢN: Bản tin sáng qua Telegram — đầu cuối, KHÔNG nhắn ra ngoài
 *
 *  api.telegram.org được trỏ về máy chủ giả lập (tools/test/mock-egp.mjs ghi
 *  lại nguyên văn tin nhận được). Các bước:
 *    1. Tìm gói thầu Lâm Đồng (nạp kho), đánh dấu theo dõi 1 gói sắp đóng.
 *    2. Cấu hình Telegram giả + bật bản tin sáng trên trang Cấu hình thật.
 *    3. Bấm "Gửi thử bản tin ngay" → đọc tin "Telegram" nhận được.
 *  MOCK_LOG=<nhật ký> node tools/test/bulletin.mjs <ext>
 * ========================================================================== */
import { chromium } from 'playwright';
import fs from 'node:fs';

const EXT = process.argv[2];
const PORT = process.env.MOCK_PORT || 9443;
const LOG = process.env.MOCK_LOG;
const UD = fs.mkdtempSync('/tmp/ud-');
const ctx = await chromium.launchPersistentContext(UD, {
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--disable-dev-shm-usage',
    '--no-first-run', '--no-proxy-server', '--ignore-certificate-errors',
    `--host-resolver-rules=MAP muasamcong.mpi.gov.vn 127.0.0.1:${PORT}, MAP api.telegram.org 127.0.0.1:${PORT}`]
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const ID = new URL(sw.url()).host;
const page = await ctx.newPage();
await page.goto(`chrome-extension://${ID}/options.html`);
await page.waitForTimeout(1000);
const send = (type, payload = {}) => page.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [type, payload]);
const loi = [];
const can = (dk, msg) => { if (!dk) loi.push(msg); console.log(`  ${dk ? '✓' : '✗'} ${msg}`); };

// 1. Nạp kho bằng một lượt tìm thật trên e-GP giả lập.
const start = await send('TBMT_SEARCH', { province: 'Lâm Đồng', category: '', keyword: '', investor: '', ward: '', mustKeywords: '', excludeKeywords: '', minPrice: '', maxPrice: '', focusTab: false });
let run = null;
for (let i = 0; i < 200; i++) {
  await page.waitForTimeout(400);
  const r = await send('GET_SEARCH_STATE', { runId: start.runId });
  run = r?.selectedRun;
  if (run && !['STARTING', 'OPENING', 'RUNNING'].includes(run.status) && !r.activeRun) { break; }
}
can(run?.status === 'SUCCESS', `nạp kho: lượt tìm ${run?.status}`);
const st = await send('GET_SEARCH_STATE', { runId: start.runId });
const sap = (st.tenders || []).filter((t) => Date.parse(t.closeDate) > Date.now()).sort((a, b) => Date.parse(a.closeDate) - Date.parse(b.closeDate))[0];
await send('SET_WATCH', { key: sap.key, value: true });
console.log(`  theo dõi: ${sap.bidName} (đóng ${sap.closeDate})`);

// 2. Cấu hình Telegram giả + bật bản tin trên giao diện thật.
await page.reload(); await page.waitForTimeout(1200);
await page.fill('#telegramBotToken', '123456:TEST-ONLY');
await page.fill('#telegramChatId', '99999');
await page.check('#telegramEnabled');
await page.check('#telegramMorningBulletin');
await page.fill('#morningBulletinTime', '07:00');
await page.click('button[type=submit]:has-text("Lưu cấu hình")');
await page.waitForTimeout(1200);

// 3. Gửi thử.
const truoc = LOG ? fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).length : 0;
await page.click('#bulletin-test');
let msgText = '';
for (let i = 0; i < 40; i++) { await page.waitForTimeout(300); msgText = await page.textContent('#bulletin-msg'); if (/Đã gửi|Chưa gửi|Kiểm tra/.test(msgText)) break; }
console.log(`  trang Cấu hình: ${msgText}`);
can(/Đã gửi bản tin thử/.test(msgText), 'trang Cấu hình báo đã gửi');
const tin = (LOG ? fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).slice(truoc) : []).filter((l) => /\[mock\] TELEGRAM /.test(l))
  .map((l) => JSON.parse(l.replace(/^.*\[mock\] TELEGRAM /, ''))).join('\n');
console.log('  ---- tin Telegram nhận được ----\n' + tin.split('\n').map((l) => '  | ' + l).join('\n'));
const soTin = (LOG ? fs.readFileSync(LOG, 'utf8').split('\n') : []).filter((l) => /\[mock\] TELEGRAM /.test(l)).length;
can(soTin === 1, `đúng MỘT tin Telegram (nhận ${soTin}) — lưu Cấu hình không được gửi bù trùng với "Gửi thử"`);
can(/Bản tin sáng/.test(tin), 'Telegram (giả) nhận đúng bản tin');
can(/1\. Gói mới khớp tiêu chí \(24 giờ qua\): [1-9]/.test(tin), 'mục 1 có gói mới vừa quét');
can(/2\. Gói đang theo dõi/.test(tin), 'mục 2 có mặt');
can(/3\. Tình trạng/.test(tin) && /Lượt quét gần nhất: 0 giờ trước/.test(tin), 'mục 3 nêu lượt quét vừa xong');
await ctx.close();
fs.rmSync(UD, { recursive: true, force: true });
console.log(loi.length ? `\nHỎNG: ${loi.length}` : '\nĐẠT');
process.exit(loi.length ? 1 : 0);
