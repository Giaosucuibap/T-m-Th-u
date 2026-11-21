/* ============================================================================
 *  KIỂM THỬ CẦU NỐI APP ↔ e-GP TRÊN TRÌNH DUYỆT THẬT (e-GP GIẢ LẬP)
 *
 *  Dựng lại đúng cách app chạy trong WebView, nhưng trên Chromium:
 *    - mã tiêm của app (buildInjectedScript: lớp đệm + page-hook.js + content.js
 *      NGUYÊN VĂN) chạy trước mọi script của trang — như
 *      injectedJavaScriptBeforeContentLoaded;
 *    - window.ReactNativeWebView.postMessage được nối về node — như kênh WebView;
 *    - node đóng vai app: createPageChannel + createTbmtSearch (mã thật của app).
 *  Máy chủ e-GP giả lập là tools/test/mock-egp.mjs của tiện ích; hai tên miền
 *  e-GP được trỏ về nó, KHÔNG có yêu cầu nào tới e-GP thật.
 *
 *  node tests/browser/connector.mjs
 * ========================================================================== */
import { spawn } from 'node:child_process';
import https from 'node:https';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { buildInjectedScript } from '../../src/egp/inject.js';
import { createPageChannel } from '../../src/core/page-channel.js';
import { createTbmtSearch } from '../../src/core/search.js';
import { EGP_SEARCH_PAGE } from '../../src/core/egp/kqlcnt.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MOCK = path.resolve(APP, '../tools/test/mock-egp.mjs');
const BASE_PORT = Number(process.env.MOCK_PORT || 9561);

function startMock(port, chaos = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MOCK], { env: { ...process.env, MOCK_PORT: String(port), MOCK_CHAOS: chaos }, stdio: ['ignore', 'pipe', 'pipe'] });
    const log = [];
    let ready = false;
    const timer = setTimeout(() => { if (!ready) reject(new Error('Máy chủ e-GP giả lập không khởi động.')); }, 15000);
    child.stdout.on('data', (chunk) => {
      for (const line of String(chunk).split('\n').filter(Boolean)) {
        log.push(line);
        if (!ready && /giả lập chạy/.test(line)) { ready = true; clearTimeout(timer); resolve({ child, log, port }); }
      }
    });
    child.stderr.on('data', (chunk) => log.push(`[stderr] ${String(chunk).trim()}`));
    child.on('exit', (code) => { if (!ready) reject(new Error(`Máy chủ giả lập thoát sớm (mã ${code}).`)); });
  });
}

const EGP_URL = /^https:\/\/muasamcong\.(?:mof|mpi)\.gov\.vn\//;

/* CHẶN CỨNG ở tầng trình duyệt: yêu cầu tới hai tên miền e-GP được chuyển thẳng
   sang máy giả lập trong tiến trình này; MỌI tên miền khác bị huỷ. Không dựa vào
   --host-resolver-rules: ở máy có proxy hệ thống, Chromium bỏ qua lệnh trỏ đó và
   đi thẳng tới e-GP thật (đã gặp, xem CHANGELOG). */
function forwardToMock(route, port, blocked) {
  const req = route.request();
  const url = new URL(req.url());
  if (!EGP_URL.test(req.url())) {
    if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    blocked.push(req.url());
    return route.abort('blockedbyclient');
  }
  const body = req.postDataBuffer();
  const headers = { ...req.headers(), host: url.host };
  return new Promise((resolve) => {
    const out = https.request({ host: '127.0.0.1', port, method: req.method(), path: url.pathname + url.search, headers, rejectUnauthorized: false, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(route.fulfill({ status: res.statusCode, headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)])), body: Buffer.concat(chunks) }).catch(() => {})));
      res.on('error', () => resolve(route.abort('connectionreset').catch(() => {})));
    });
    // Máy giả lập cắt kết nối (chế độ "mạng rớt") → trang thấy đúng một lỗi mạng.
    out.on('error', () => resolve(route.abort('connectionreset').catch(() => {})));
    if (body) out.write(body);
    out.end();
  });
}

async function openAppPage(browser, port) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const blocked = [];
  await context.route('**/*', (route) => forwardToMock(route, port, blocked));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.message || e)));
  const injectErrors = [];
  const channel = createPageChannel({
    inject: (js) => page.evaluate(js).catch(() => {}),
    onInjectError: (e) => injectErrors.push(e)
  });
  await page.exposeFunction('__rnPost', (raw) => { channel.receive(raw); });
  await page.addInitScript({ content: 'window.ReactNativeWebView = { postMessage: function (s) { window.__rnPost(s); } };' });
  await page.addInitScript({ content: buildInjectedScript() });
  const reload = () => page.goto(EGP_SEARCH_PAGE, { waitUntil: 'domcontentloaded' }).catch(() => {});
  const search = createTbmtSearch({ channel, reload });
  channel.setHandler(search.handlePageMessage);
  const first = await page.goto(EGP_SEARCH_PAGE, { waitUntil: 'domcontentloaded' });
  // Chốt an toàn: trang đầu tiên PHẢI là bản giả lập, nếu không dừng hẳn bài thử.
  const title = await page.title();
  if (!/giả lập/.test(title)) {
    await context.close();
    throw new Error(`DỪNG: trang mở ra không phải e-GP giả lập (tiêu đề "${title}", mã ${first?.status()}).`);
  }
  return { context, page, channel, search, errors, injectErrors, blocked };
}

const results = [];
async function scenario(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  ĐẠT  ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - t0, error: String(error?.stack || error) });
    console.log(`  HỎNG ${name}: ${String(error?.message || error)}`);
  }
}

const mainMock = await startMock(BASE_PORT);
const slowMock = await startMock(BASE_PORT + 1, 'slow=1200');
const flakyMock = await startMock(BASE_PORT + 2, 'autoload,busy,early,flaky=0.25,seed=7');
// Lớp phòng thứ hai: không proxy, và mọi tên miền lạ trỏ vào hố đen. Lớp chính là context.route ở trên.
const launch = () => chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--proxy-server=direct://', '--proxy-bypass-list=*',
  '--ignore-certificate-errors', '--host-resolver-rules=MAP * 127.0.0.1:9, EXCLUDE localhost'] });
const browsers = [];

try {
  const browser = await launch(BASE_PORT);
  browsers.push(browser);
  const app = await openAppPage(browser, BASE_PORT);

  await scenario('Mã tiêm chạy trong trang, không để lộ window.chrome giả', async () => {
    const info = await app.page.evaluate(() => ({ shim: typeof window.__gscbFromApp, chromeRuntimeId: window.chrome?.runtime?.id || null, title: document.title }));
    assert.equal(info.shim, 'function');
    assert.notEqual(info.chromeRuntimeId, 'gscb-mobile');
    assert.match(info.title, /Tra cứu Lựa chọn nhà thầu/);
    assert.deepEqual(app.injectErrors, []);
  });

  await scenario('Tìm gói Lâm Đồng · Xây lắp: đủ 137 bản ghi, đối soát khớp, đúng truy vấn gửi đi', async () => {
    const before = mainMock.log.length;
    const phases = new Set();
    const r = await app.search.run({ province: 'Lâm Đồng', category: 'XL' }, { onProgress: (p) => phases.add(p.phase) });
    assert.equal(r.status, 'SUCCESS', r.message);
    assert.equal(r.counts.fetched, 137);
    assert.equal(r.counts.unique, 137);
    assert.equal(r.counts.match, 115, 'bản giả lập: 22/137 gói là Hàng hóa → ngoài tiêu chí Xây lắp');
    assert.equal(r.counts.outOfRange, 22);
    assert.equal(r.coverage.complete, true, r.coverage.text);
    assert.equal(r.coverage.serverTotal, 137);
    assert.ok(r.tenders[0].filterState === 'MATCH' && r.tenders.at(-1).filterState === 'OUT_OF_RANGE', 'gói khớp xếp trước');
    const sent = mainMock.log.slice(before).filter((l) => /SEARCH page=\d+ size=50/.test(l));
    assert.equal(sent.length, 3, `phải hỏi đúng 3 trang 50 bản ghi:\n${mainMock.log.slice(before).join('\n')}`);
    assert.ok(sent.every((l) => /query\.filters=type,stepCode,locations\.provCode,investField/.test(l)), sent.join('\n'));
    assert.ok(phases.has('search') && phases.has('done'));
  });

  await scenario('Lượt thứ hai ngay sau (trang đang ở màn kết quả): lọc tỉnh tại chỗ đúng', async () => {
    const r = await app.search.run({ province: 'Đồng Nai', keyword: 'kênh' });
    assert.equal(r.status, 'SUCCESS', r.message);
    assert.equal(r.counts.fetched, 137);
    // Bản giả lập trả mọi gói với mã tỉnh 68 (Lâm Đồng): lọc tại chỗ phải loại hết, không "tin" máy chủ.
    assert.equal(r.counts.match, 0);
    assert.equal(r.counts.outOfRange, 137);
  });

  await scenario('Nhiều chủ đầu tư: mỗi CĐT một truy vấn, gộp và chống trùng', async () => {
    const r = await app.search.run({ investor: 'UBND xã Hàm Đức; Sở Nông nghiệp và Phát triển nông thôn tỉnh Lâm Đồng' });
    assert.equal(r.status, 'SUCCESS', r.message);
    assert.equal(r.counts.fetched, 274, 'hai truy vấn, mỗi truy vấn 137 bản ghi');
    assert.equal(r.counts.unique, 137);
    assert.ok(r.counts.match > 0 && r.counts.match < 137, `khớp ${r.counts.match}`);
    assert.equal(r.coverage.serverTotal, 274);
  });

  await scenario('Tiêu chí sai bị chặn trước khi chạm e-GP', async () => {
    const before = mainMock.log.length;
    const bad = await app.search.run({ province: 'Tỉnh Không Có' });
    assert.equal(bad.status, 'INVALID');
    assert.match(bad.message, /Không nhận ra tỉnh/);
    const empty = await app.search.run({});
    assert.equal(empty.status, 'INVALID');
    assert.equal(mainMock.log.length, before, 'không được gửi yêu cầu nào');
  });

  assert.deepEqual(app.errors, [], `lỗi trang: ${app.errors.join(' | ')}`);
  await app.context.close();

  const slowBrowser = await launch(BASE_PORT + 1);
  browsers.push(slowBrowser);
  const slow = await openAppPage(slowBrowser, BASE_PORT + 1);
  await scenario('Bấm Dừng giữa chừng: giữ phần đã nhận, lượt sau vẫn chạy được', async () => {
    let cancelled = false;
    const r = await slow.search.run({ province: 'Lâm Đồng' }, {
      onProgress: (p) => { if (!cancelled && p.fetched >= 50) { cancelled = true; slow.search.cancel(); } }
    });
    assert.equal(r.status, 'CANCELLED', r.message);
    assert.ok(r.counts.fetched >= 50 && r.counts.fetched < 137, `đã nhận ${r.counts.fetched}`);
    assert.equal(r.coverage.complete, false);
    const again = await slow.search.run({ province: 'Lâm Đồng', category: 'XL' });
    assert.equal(again.status, 'SUCCESS', again.message);
    assert.equal(again.counts.fetched, 137);
  });
  await slow.context.close();

  const flakyBrowser = await launch(BASE_PORT + 2);
  browsers.push(flakyBrowser);
  const flaky = await openAppPage(flakyBrowser, BASE_PORT + 2);
  await scenario('e-GP khó tính (tự tải danh sách, bỏ qua thao tác lúc bận, mạng rớt 25%): kết quả trung thực', async () => {
    const r = await flaky.search.run({ province: 'Lâm Đồng', category: 'XL' });
    assert.ok(['SUCCESS', 'PARTIAL'].includes(r.status), `${r.status}: ${r.message}`);
    if (r.status === 'SUCCESS') { assert.equal(r.counts.fetched, 137); assert.equal(r.coverage.complete, true); }
    else assert.equal(r.coverage.complete, false, 'thiếu thì phải nói thiếu');
    console.log(`       → ${r.status}: ${r.coverage.text}`);
  });
  await flaky.context.close();
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  for (const m of [mainMock, slowMock, flakyMock]) m.child.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\nCầu nối app ↔ e-GP giả lập: ĐẠT ${results.length - failed.length}/${results.length}`);
for (const f of failed) console.log(`\n✗ ${f.name}\n${f.error}`);
process.exit(failed.length ? 1 : 0);
