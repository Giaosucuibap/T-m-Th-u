/* ============================================================================
 *  4.20.0 — LINK ĐIỆN THOẠI, ĐẦU-CUỐI (Chromium thật + tiện ích + cầu nối C# thật)
 *
 *  node tools/test/phone-link.mjs <thư-mục-tiện-ích> <thư-mục-web-điện-thoại>
 *  (cần xvfb-run trên Linux, Mono để chạy GiaoSuCuiBap.DienThoai.exe, chứng
 *   chỉ tools/test/certs cho e-GP giả lập; MOCK_PORT mặc định 9471)
 *
 *  1. Chrome khởi động cầu nối qua native messaging (đúng cơ chế trên Windows),
 *     chế độ thử --no-tunnel: link là http://127.0.0.1:<cổng>, không ra Internet.
 *  2. Trang "Link điện thoại" của tiện ích: bật → có link + mã QR.
 *  3. Một trang cỡ iPhone mở link → bấm "Tìm trên e-GP" → tiện ích tra e-GP
 *     GIẢ LẬP bằng đúng luồng Tìm gói thầu → kết quả hiện trên "điện thoại".
 *  4. Khoá: thiếu/sai khoá bị chặn; Đổi khoá làm link cũ hết hiệu lực;
 *     Thêm vào Lịch trả tệp .ics; Tắt link thì cầu nối dừng.
 *  Mọi tên miền ngoài e-GP giả lập và 127.0.0.1 bị trỏ vào hố đen.
 * ========================================================================== */
import { chromium } from 'playwright';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXT = path.resolve(process.argv[2] || path.join(ROOT, 'GiaoSuCuiBap'));
const WEB = path.resolve(process.argv[3] || '');
if (!fs.existsSync(path.join(WEB, 'index.html'))) { console.error('Thiếu thư mục web điện thoại (expo export chế độ remote).'); process.exit(2); }
const PORT = Number(process.env.MOCK_PORT || 9471);
const ORIGIN = 'chrome-extension://injgpddgeaedalfgbnnbobdidghjncoj/';
const OUT = path.join(ROOT, 'test-results', 'phone-link');
fs.mkdirSync(OUT, { recursive: true });
const UD = fs.mkdtempSync(path.join(os.tmpdir(), 'gscb-phone-'));

// --- cầu nối C#: dựng bằng mcs, chạy bằng mono qua một tệp bọc -------------
const exe = path.join(OUT, 'GiaoSuCuiBap.DienThoai.exe');
const built = spawnSync('mcs', ['-langversion:5', '-target:exe', '-optimize+', '-r:System.Web.Extensions.dll', `-out:${exe}`, path.join(ROOT, 'native-agent', 'DienThoai.cs')], { encoding: 'utf8' });
if (built.status !== 0) { console.error(built.stdout + built.stderr); process.exit(1); }
const hostLog = path.join(OUT, 'host.log');
fs.rmSync(hostLog, { force: true });
const wrapper = path.join(OUT, 'dien-thoai-host.sh');
fs.writeFileSync(wrapper, `#!/bin/sh\nexec mono "${exe}" "$@" --no-tunnel --web "${WEB}" --log "${hostLog}"\n`);
fs.chmodSync(wrapper, 0o755);
fs.mkdirSync(path.join(UD, 'NativeMessagingHosts'), { recursive: true });
fs.writeFileSync(path.join(UD, 'NativeMessagingHosts', 'vn.giaosucuibap.dienthoai.json'), JSON.stringify({
  name: 'vn.giaosucuibap.dienthoai', description: 'Giao Su Cui Bap phone link (test)', path: wrapper, type: 'stdio', allowed_origins: [ORIGIN]
}));

// --- e-GP giả lập ---------------------------------------------------------
const mock = spawn(process.execPath, [path.join(ROOT, 'tools/test/mock-egp.mjs')], { env: { ...process.env, MOCK_PORT: String(PORT), MOCK_CHAOS: process.env.MOCK_CHAOS || 'autoload' }, stdio: ['ignore', 'pipe', 'pipe'] });
const mockLog = [];
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('e-GP giả lập không khởi động')), 15000);
  mock.stdout.on('data', (c) => { const s = String(c); mockLog.push(s); if (/giả lập chạy/.test(s)) { clearTimeout(t); resolve(); } });
});

const results = [];
const step = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true }); console.log(`  ĐẠT  ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (e) { results.push({ name, ok: false, error: String(e?.stack || e) }); console.log(`  HỎNG ${name}: ${String(e?.message || e).split('\n')[0]}`); }
};

/* Chụp màn hình một tab Chromium: LUÔN đưa tab ra phía trước đã. Tiện ích vừa cài tự mở trang
   "Bắt đầu sử dụng" ở một tab mới, vào lúc không đoán trước được; tab cần chụp mà bị đẩy ra sau
   thì Chromium không vẽ khung hình cho nó và lệnh chụp treo tới hết hạn (đã gặp trên CI:
   "page.screenshot: Timeout 30000ms exceeded"; đo lại: tab bị che chụp chậm hơn ~30 lần). */
const shot = async (page, options) => { await page.bringToFront(); await page.screenshot(options); };

const ctx = await chromium.launchPersistentContext(UD, {
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run',
    '--proxy-server=direct://', '--proxy-bypass-list=*', '--ignore-certificate-errors',
    `--host-resolver-rules=MAP muasamcong.mof.gov.vn 127.0.0.1:${PORT}, MAP muasamcong.mpi.gov.vn 127.0.0.1:${PORT}, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost`]
});
// Chốt an toàn: mọi trang e-GP tiện ích mở PHẢI là bản giả lập.
const realEgp = [];
ctx.on('page', (p) => p.on('domcontentloaded', async () => {
  try { if (/muasamcong/.test(p.url()) && !/giả lập/.test(await p.title())) realEgp.push(p.url()); } catch { /* trang đã đóng */ }
}));
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 });
const ID = new URL(sw.url()).host;
const ext = await ctx.newPage();
await ext.goto(`chrome-extension://${ID}/phone.html`);
const send = (type, payload = {}) => ext.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [type, payload]);
const until = async (fn, ms = 30000, what = 'điều kiện') => {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error(`Hết hạn chờ: ${what}`); await new Promise((r) => setTimeout(r, 300)); }
};
let link = '';
let phone;

try {
  await step('Trang "Link điện thoại": bật → cầu nối khởi động qua native messaging, có link + mã QR', async () => {
    assert.equal(ID, 'injgpddgeaedalfgbnnbobdidghjncoj');
    await ext.click('#pl-toggle');
    const state = await until(async () => { const s = await send('PHONE_LINK_STATE'); return s?.link ? s : null; }, 30000, 'link điện thoại');
    link = state.link;
    assert.match(link, /^http:\/\/127\.0\.0\.1:\d+\/#k=[A-Za-z0-9_-]{32}$/);
    assert.equal(state.host.connected, true);
    assert.equal(state.key, undefined, 'trang không được nhận khoá trần ngoài link');
    await ext.waitForSelector('#pl-qr-card:not(.hidden)');
    const qr = await ext.$eval('#pl-qr', (img) => ({ src: img.src.slice(0, 22), w: img.naturalWidth }));
    assert.equal(qr.src, 'data:image/gif;base64,');
    assert.ok(qr.w > 100);
    assert.doesNotMatch(await ext.textContent('#pl-link'), /#k=[A-Za-z0-9]/, 'link hiển thị phải che khoá');
    // Mục "Nhận link mới qua Telegram" hiện khi link đang bật, mặc định tắt (link có khoá).
    await ext.waitForSelector('#pl-tg-card:not(.hidden)');
    assert.equal(await ext.isChecked('#pl-tg'), false, 'gửi Telegram mặc định tắt');
    await shot(ext, { path: path.join(OUT, '1-trang-link-dien-thoai.png'), fullPage: true });
  });

  const base = () => link.replace(/\/#k=.*$/, '');
  /* Gọi thẳng từ tiến trình thử (không qua trang tiện ích: trang khác nguồn KHÔNG đọc được
     phản hồi API — máy phục vụ không mở CORS, đó cũng là một lớp bảo vệ). */
  const raw = (u, opts = {}) => new Promise((resolve, reject) => {
    const req = http.request(u, { method: opts.method || 'GET', headers: opts.headers || {} }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject); if (opts.body) req.write(opts.body); req.end();
  });
  await step('Thiếu khoá / sai khoá bị chặn ở mọi lệnh; API không mở CORS cho trang khác nguồn', async () => {
    const a = await raw(`${base()}/api/status`);
    const b = await raw(`${base()}/api/status`, { headers: { 'X-GSCB-Key': 'x'.repeat(32) } });
    const c = await raw(`${base()}/api/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"criteria":{"province":"Lâm Đồng"}}' });
    assert.deepEqual([a.status, b.status, c.status], [401, 401, 401]);
    assert.equal(a.headers['access-control-allow-origin'], undefined);
    const fromOtherOrigin = await ext.evaluate(async (u) => { try { await fetch(`${u}/api/status`); return 'đọc được'; } catch { return 'bị chặn'; } }, base());
    assert.equal(fromOtherOrigin, 'bị chặn');
  });

  await step('iPhone mở link → bấm Tìm → tiện ích tra e-GP giả lập → kết quả đúng trên điện thoại', async () => {
    phone = await ctx.newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.goto(link);
    await phone.getByText('Máy tính công ty: Đã kết nối').waitFor({ timeout: 20000 });
    assert.doesNotMatch(phone.url(), /#k=/, 'khoá phải được xoá khỏi thanh địa chỉ');
    await shot(phone, { path: path.join(OUT, '2-dien-thoai-ket-noi.png') });
    await phone.getByText('Tìm trên e-GP', { exact: true }).click();
    await phone.getByText(/^Khớp tiêu chí \(\d+\)$/).waitFor({ timeout: 180000 });
    const label = await phone.getByText(/^Khớp tiêu chí \(\d+\)$/).textContent();
    assert.equal(label, 'Khớp tiêu chí (115)', 'e-GP giả lập: 137 gói, 22 gói Hàng hóa ngoài tiêu chí Xây lắp');
    await phone.getByText('Đã lấy đủ').waitFor({ timeout: 5000 });
    await shot(phone, { path: path.join(OUT, '3-dien-thoai-ket-qua.png') });
    assert.ok(mockLog.join('').includes('locations.provCode'), 'tiện ích phải gửi bộ lọc tỉnh lên e-GP');
  });

  await step('Chi tiết gói → Thêm vào Lịch iPhone trả tệp .ics có 3 lời nhắc', async () => {
    await phone.locator('text=/\\(gói số \\d\\)$/').first().click();
    await phone.getByText('Thêm vào Lịch iPhone (nhắc 3 lần)').waitFor({ timeout: 10000 });
    await shot(phone, { path: path.join(OUT, '4-dien-thoai-chi-tiet.png') });
    // Bắt phản hồi trước khi trang chuyển đi (Safari mở tệp .ics thành màn "Thêm vào Lịch").
    let captured = null;
    await phone.route('**/api/ics', async (route) => {
      const r = await route.fetch();
      captured = { status: r.status(), type: r.headers()['content-type'], body: await r.text(), post: route.request().postData() || '' };
      await route.fulfill({ response: r });
    });
    await phone.getByText('Thêm vào Lịch iPhone (nhắc 3 lần)').click();
    await until(async () => captured, 10000, 'tệp .ics');
    assert.equal(captured.status, 200);
    assert.match(captured.type, /text\/calendar/);
    assert.equal((captured.body.match(/BEGIN:VALARM/g) || []).length, 3);
    assert.match(captured.body.replace(/\r\n /g, ''), /SUMMARY:Hạn nộp: /);
    assert.match(captured.post, /(^|&)k=[A-Za-z0-9_-]{32}(&|$)/, 'khoá gửi trong thân form POST, không trên đường dẫn');
  });

  await step('Đổi khoá trên máy tính → link cũ hết hiệu lực, điện thoại báo quét lại mã', async () => {
    const old = link;
    await send('SET_PHONE_LINK_KEY');
    const s = await until(async () => { const x = await send('PHONE_LINK_STATE'); return x.link && x.link !== old ? x : null; }, 10000, 'link mới');
    link = s.link;
    await phone.goto(base() + '/');
    await phone.getByText(/Khoá không đúng hoặc đã được đổi/).waitFor({ timeout: 15000 });
    await phone.goto(link);
    await phone.getByText('Máy tính công ty: Đã kết nối').waitFor({ timeout: 15000 });
  });

  await step('Tắt link → cầu nối dừng, điện thoại báo không kết nối được', async () => {
    await ext.click('#pl-toggle');
    await until(async () => { const s = await send('PHONE_LINK_STATE'); return !s.enabled && !s.link; }, 10000, 'tắt link');
    await until(async () => phone.evaluate(async (u) => { try { await fetch(`${u}/api/status`, { cache: 'no-store' }); return false; } catch { return true; } }, base()), 15000, 'cầu nối dừng');
  });

  await step('Chốt an toàn: không trang nào mở ra e-GP thật', async () => { assert.deepEqual(realEgp, []); });
} finally {
  await ctx.close().catch(() => {});
  mock.kill();
  fs.rmSync(UD, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\nLink điện thoại đầu-cuối: ĐẠT ${results.length - failed.length}/${results.length}`);
for (const f of failed) console.log(`\n✗ ${f.name}\n${f.error}`);
if (failed.length && fs.existsSync(hostLog)) console.log(`\nNhật ký cầu nối:\n${fs.readFileSync(hostLog, 'utf8').slice(-3000)}`);
process.exit(failed.length ? 1 : 0);
