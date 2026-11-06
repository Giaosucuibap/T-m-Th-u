/* ============================================================================
 *  KỊCH BẢN: nút "Kiểm chứng toàn trình trên e-GP" ở trang Chẩn đoán (4.19.0)
 *
 *  Bấm đúng nút trên giao diện, e-GP GIẢ LẬP (không chạm e-GP thật). Kiểm:
 *    - chạy đủ các luồng, bảng kết quả hiện trên trang, tệp bằng chứng được lưu
 *      và niêm mã băm;
 *    - Tìm gói thầu ĐẠT trên giả lập;
 *    - Kế hoạch và Mở thầu: giả lập KHÔNG dựng trang chi tiết kế hoạch và bảng
 *      biên bản thật, nên hai luồng này phải báo CHƯA ĐẠT kèm lý do — không được
 *      báo đạt khi một bước chưa chạy được (đúng điều nút này phải làm trên e-GP thật).
 *
 *  node tools/test/self-check.mjs <thư-mục-tiện-ích>
 * ========================================================================== */
import { chromium } from 'playwright';
import fs from 'node:fs';

/* Trang tiện ích có CSP script-src 'self': page.waitForFunction của Playwright 1.48 (bản CI dùng)
   phải eval chuỗi trong trang và bị chặn. Hỏi lặp bằng page.evaluate (đi qua CDP, không bị CSP chặn). */
async function waitUntil(page, fn, { timeout = 15000, interval = 250 } = {}) {
  const t = Date.now();
  while (Date.now() - t < timeout) {
    if (await page.evaluate(fn).catch(() => false)) return;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Quá ${timeout} ms chờ điều kiện trên trang`);
}

const EXT = process.argv[2], PORT = process.env.MOCK_PORT || 9443;
const UD = fs.mkdtempSync('/tmp/ud-');
const ctx = await chromium.launchPersistentContext(UD, { headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run',
    '--no-proxy-server', '--ignore-certificate-errors', `--host-resolver-rules=MAP muasamcong.mof.gov.vn 127.0.0.1:${PORT}, MAP muasamcong.mpi.gov.vn 127.0.0.1:${PORT}`] });
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const ID = new URL(sw.url()).host;
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
await page.goto(`chrome-extension://${ID}/diagnostics.html`);
await page.waitForSelector('#sc-run');
await page.uncheck('#sc-canary');
const t0 = Date.now();
await page.click('#sc-run');
await waitUntil(page, () => !document.getElementById('sc-run').disabled && document.getElementById('sc-table').querySelectorAll('tbody tr').length > 0, { timeout: 25 * 60 * 1000, interval: 1000 });
const report = await page.evaluate(() => chrome.storage.local.get('selfCheckLast').then((d) => d.selfCheckLast));
const rows = await page.evaluate(() => [...document.querySelectorAll('#sc-table tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()));
const status = await page.evaluate(() => document.getElementById('sc-status').innerText);
console.log(`Xong sau ${((Date.now() - t0) / 1000).toFixed(1)} giây — ${status}`);
for (const r of rows) console.log(`  ${r}`);
const by = Object.fromEntries((report?.flows || []).map((f) => [f.id, f]));
const loi = [];
if (!report || !/^[0-9a-f]{64}$/.test(report.digest || '')) loi.push('không có tệp bằng chứng đã niêm mã băm');
if (report?.flows?.length !== 3) loi.push(`số luồng ${report?.flows?.length} ≠ 3`);
if (!by.tbmt?.ok) loi.push(`Tìm gói thầu chưa đạt: ${by.tbmt?.summary}`);
if (by.bidopen?.ok && !by.bidopen?.details?.openingsRead) loi.push('Mở thầu báo ĐẠT dù không đọc được biên bản nào');
if (!by.bidopen?.ok && !/KHÔNG đọc được biên bản|không có gói/.test(by.bidopen?.summary || '')) loi.push(`Mở thầu chưa đạt nhưng không rõ lý do: ${by.bidopen?.summary}`);
if (by.plan?.ok) loi.push('Kế hoạch báo ĐẠT dù giả lập không có trang chi tiết');
else if (!/chi tiết|LISTED|Đã lấy đủ danh sách|SUCCESS|PARTIAL/.test(by.plan?.summary || '')) loi.push(`Kế hoạch chưa đạt nhưng không rõ lý do: ${by.plan?.summary}`);
if (rows.length !== 3) loi.push(`bảng trên trang có ${rows.length} dòng`);
if (errors.length) loi.push(`lỗi trang: ${errors.join(' | ')}`);
await ctx.close();
if (loi.length) { console.log(`\nKHÔNG ĐẠT:\n- ${loi.join('\n- ')}`); process.exit(1); }
console.log('\nĐẠT: nút kiểm chứng chạy đủ luồng, kết luận trung thực, lưu tệp bằng chứng có mã băm.');
