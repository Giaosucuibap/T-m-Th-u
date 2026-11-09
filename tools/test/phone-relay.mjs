/* ============================================================================
 *  4.21.0 — ĐỊA CHỈ CỐ ĐỊNH, ĐẦU-CUỐI: Chrome thật + tiện ích + cầu nối C# thật +
 *  e-GP giả lập + Worker địa chỉ cố định (chạy đúng mã relay/src/worker.js) +
 *  trang iPhone/iPad (Chromium, rồi WEBKIT — nhân của Safari).
 *
 *  node tools/test/phone-relay.mjs <thư-mục-tiện-ích> <thư-mục-web-remote>
 *  (cần xvfb-run, Mono, chứng chỉ tools/test/certs; WebKit: gói webkit2gtk-driver)
 *
 *  Tình huống anh Thắng gặp: đi công trường, máy tính ở công ty khởi động lại
 *  → link cũ chết, phải về quét mã. Bài này chứng minh với địa chỉ cố định:
 *   1. Ghép nối máy tính với địa chỉ cố định (sai mã bị từ chối) → mã QR không đổi.
 *   2. iPhone mở địa chỉ cố định → tìm gói → kết quả (mọi lệnh đi qua địa chỉ cố định).
 *   3. Máy tính "khởi động lại" (đường hầm MỚI, cổng mới) → iPhone vẫn đang mở, KHÔNG
 *      quét lại mã: tự tìm lại máy tính và tra tiếp được.
 *   4. Máy tính tắt → iPhone báo rõ, kết quả cũ vẫn xem được; bật lại → tự nối lại.
 *   5. Đổi khoá trên máy tính → iPhone cầm khoá cũ bị từ chối (con trỏ không khớp khoá).
 *   6. Trợ giúp "Cài lên màn hình chính": khoá chỉ tạm nằm trên thanh địa chỉ lúc cài.
 *   7. WebKit cỡ iPhone và iPad (2 cột): kết nối, tìm, kết quả, chụp màn hình.
 * ========================================================================== */
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startRelaySim } from './relay-sim.mjs';
import { openWebKit, webkitAvailable } from './webkit-driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXT = path.resolve(process.argv[2] || path.join(ROOT, 'GiaoSuCuiBap'));
const WEB = path.resolve(process.argv[3] || '');
if (!fs.existsSync(path.join(WEB, 'index.html'))) { console.error('Thiếu thư mục web điện thoại (expo export chế độ remote).'); process.exit(2); }
const PORT = Number(process.env.MOCK_PORT || 9472);
const ORIGIN = 'chrome-extension://injgpddgeaedalfgbnnbobdidghjncoj/';
const OUT = path.join(ROOT, 'test-results', 'phone-relay');
fs.mkdirSync(OUT, { recursive: true });
const UD = fs.mkdtempSync(path.join(os.tmpdir(), 'gscb-relay-'));
const CODE = '7KQ2M9XD';
const certs = path.join(ROOT, 'tools', 'test', 'certs');
const tls = { key: fs.readFileSync(path.join(certs, 'key.pem')), cert: fs.readFileSync(path.join(certs, 'cert.pem')) };

// --- cầu nối C# chạy bằng mono; "đường hầm" giả đọc từ tệp (đổi tệp = máy tính khởi động lại) ----
const exe = path.join(OUT, 'GiaoSuCuiBap.DienThoai.exe');
const built = spawnSync('mcs', ['-langversion:5', '-target:exe', '-optimize+', '-r:System.Web.Extensions.dll', `-out:${exe}`, path.join(ROOT, 'native-agent', 'DienThoai.cs')], { encoding: 'utf8' });
if (built.status !== 0) { console.error(built.stdout + built.stderr); process.exit(1); }
const hostLog = path.join(OUT, 'host.log');
fs.rmSync(hostLog, { force: true });
const tunnelFile = path.join(OUT, 'duong-ham.txt');
const wrapper = path.join(OUT, 'dien-thoai-host.sh');
fs.writeFileSync(wrapper, `#!/bin/sh\nset -- "$@" $(cat "${tunnelFile}")\nexec mono "${exe}" "$@" --web "${WEB}" --log "${hostLog}"\n`);
fs.chmodSync(wrapper, 0o755);
fs.mkdirSync(path.join(UD, 'NativeMessagingHosts'), { recursive: true });
fs.writeFileSync(path.join(UD, 'NativeMessagingHosts', 'vn.giaosucuibap.dienthoai.json'), JSON.stringify({ name: 'vn.giaosucuibap.dienthoai', description: 'test', path: wrapper, type: 'stdio', allowed_origins: [ORIGIN] }));
let tunnelSeq = 0;
function newTunnel() {
  tunnelSeq++;
  const host = `may-tinh-lan-${tunnelSeq}.trycloudflare.com`;
  const port = 47400 + tunnelSeq;
  fs.writeFileSync(tunnelFile, `--fake-tunnel https://${host} --port ${port}`);
  return { host, url: `https://${host}`, base: `http://127.0.0.1:${port}` };
}

// --- e-GP giả lập + địa chỉ cố định giả lập (đúng mã Worker) -------------------------
const mock = spawn(process.execPath, [path.join(ROOT, 'tools/test/mock-egp.mjs')], { env: { ...process.env, MOCK_PORT: String(PORT), MOCK_CHAOS: process.env.MOCK_CHAOS || 'autoload' }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('e-GP giả lập không khởi động')), 15000);
  mock.stdout.on('data', (c) => { if (/giả lập chạy/.test(String(c))) { clearTimeout(t); resolve(); } });
});
const relay = await startRelaySim({ webDir: WEB, claimCode: CODE, tls });
let tunnel = newTunnel();
relay.setTunnel(tunnel.host, tunnel.base);

const results = [];
const step = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true }); console.log(`  ĐẠT  ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (e) { results.push({ name, ok: false, error: String(e?.stack || e) }); console.log(`  HỎNG ${name}: ${String(e?.message || e).split('\n')[0]}`); }
};
const until = async (fn, ms = 30000, what = 'điều kiện') => {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error(`Hết hạn chờ: ${what}`); await new Promise((r) => setTimeout(r, 300)); }
};

const ctx = await chromium.launchPersistentContext(UD, {
  headless: false, ignoreHTTPSErrors: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run',
    '--proxy-server=direct://', '--proxy-bypass-list=*', '--ignore-certificate-errors',
    `--host-resolver-rules=MAP muasamcong.mof.gov.vn 127.0.0.1:${PORT}, MAP muasamcong.mpi.gov.vn 127.0.0.1:${PORT}, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost`]
});
const realEgp = [];
ctx.on('page', (p) => p.on('domcontentloaded', async () => { try { if (/muasamcong/.test(p.url()) && !/giả lập/.test(await p.title())) realEgp.push(p.url()); } catch { /* đóng */ } }));
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 });
const ID = new URL(sw.url()).host;
const ext = await ctx.newPage();
await ext.goto(`chrome-extension://${ID}/phone.html`);
const send = (type, payload = {}) => ext.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [type, payload]);
let link = '';
let phone;
const phoneHosts = new Set();

try {
  await step('Bật link + ghép địa chỉ cố định (mã sai bị từ chối) → mã QR là địa chỉ cố định, máy tính đã báo đường hầm', async () => {
    assert.equal(ID, 'injgpddgeaedalfgbnnbobdidghjncoj');
    await ext.click('#pl-toggle');
    await until(async () => (await send('PHONE_LINK_STATE'))?.tunnel?.state === 'up', 30000, 'đường hầm (giả) lên');
    await ext.waitForSelector('#pl-relay-card:not(.hidden)');
    await ext.fill('#pl-relay-url', relay.url);
    await ext.fill('#pl-relay-code', 'AAAA-AAAA');
    await ext.click('#pl-relay-pair');
    await ext.getByText(/Mã ghép nối không đúng/).waitFor({ timeout: 10000 });
    await ext.fill('#pl-relay-code', '7kq2-m9xd');
    await ext.click('#pl-relay-pair');
    const s = await until(async () => { const x = await send('PHONE_LINK_STATE'); return x?.relay?.current ? x : null; }, 20000, 'đăng ký đường hầm với địa chỉ cố định');
    link = s.link;
    assert.equal(link.replace(/#k=.*$/, ''), `${relay.url}/`, 'mã QR trỏ địa chỉ cố định');
    assert.equal(s.directLink.replace(/\/#k=.*$/, ''), tunnel.url);
    assert.equal(JSON.parse(await relay.kv.get('pointer')).url, tunnel.url);
    await ext.getByText(/Đã ghép .* điện thoại tự tìm thấy máy tính này/).waitFor({ timeout: 10000 });
    await ext.screenshot({ path: path.join(OUT, '1-tien-ich-dia-chi-co-dinh.png'), fullPage: true });
  });

  await step('iPhone mở địa chỉ cố định → tìm gói → kết quả; mọi lệnh chỉ đi qua địa chỉ cố định', async () => {
    phone = await ctx.newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    phone.on('request', (r) => { try { phoneHosts.add(new URL(r.url()).host); } catch { /* bỏ qua */ } });
    await phone.goto(link);
    await phone.getByText('Máy tính công ty: Đã kết nối').waitFor({ timeout: 20000 });
    assert.doesNotMatch(phone.url(), /#k=/, 'khoá được xoá khỏi thanh địa chỉ');
    await phone.getByText('Tìm trên e-GP', { exact: true }).click();
    await phone.getByText(/^Khớp tiêu chí \(\d+\)$/).waitFor({ timeout: 180000 });
    assert.equal(await phone.getByText(/^Khớp tiêu chí \(\d+\)$/).textContent(), 'Khớp tiêu chí (115)');
    await phone.getByText('Lâm Đồng · Xây lắp', { exact: true }).waitFor({ timeout: 5000 });   // không còn "0 đ – 0 đ"
    await phone.screenshot({ path: path.join(OUT, '2-iphone-ket-qua-qua-dia-chi-co-dinh.png') });
    assert.deepEqual([...phoneHosts], [new URL(relay.url).host], 'điện thoại không biết địa chỉ thật của máy tính');
    assert.ok(relay.forwarded.some((f) => f.url.startsWith(`${tunnel.url}/api/search`)), 'lệnh tìm đi qua Worker tới đúng đường hầm');
  });

  await step('Máy tính KHỞI ĐỘNG LẠI (đường hầm mới, cổng mới) → iPhone đang mở tự tìm lại máy tính, KHÔNG quét lại mã, tra tiếp được', async () => {
    const old = tunnel;
    tunnel = newTunnel();
    relay.setTunnel(tunnel.host, tunnel.base);
    relay.setTunnel(old.host, null);    // đường hầm cũ chết theo cloudflared cũ
    await ext.click('#pl-toggle');      // tắt → cầu nối cũ dừng
    await until(async () => !(await send('PHONE_LINK_STATE')).enabled, 10000, 'tắt link');
    await ext.click('#pl-toggle');      // bật → cầu nối mới, đường hầm mới
    await until(async () => JSON.parse((await relay.kv.get('pointer')) || '{}').url === tunnel.url, 30000, 'máy tính báo đường hầm mới');
    const before = relay.forwarded.length;
    await phone.getByText('Tìm trên e-GP', { exact: true }).click();
    await phone.getByText(/^Khớp tiêu chí \(115\)$/).waitFor({ timeout: 180000 });
    await phone.getByText('Máy tính công ty: Đã kết nối').waitFor({ timeout: 20000 });
    const after = relay.forwarded.slice(before);
    assert.ok(after.some((f) => f.url.startsWith(`${tunnel.url}/api/search`)), 'lệnh tìm tới đường hầm MỚI');
    assert.ok(!after.some((f) => f.url.startsWith(`${old.url}/api/search`)), 'không gửi lệnh tìm tới đường hầm cũ');
    assert.equal(phone.url().includes('#k='), false);
  });

  await step('Máy tính TẮT → iPhone báo rõ, kết quả cũ vẫn xem được; bật lại → tự nối lại', async () => {
    relay.setTunnel(tunnel.host, null);   // cloudflared tắt: Cloudflare trả 530
    await ext.click('#pl-toggle');
    await until(async () => !(await send('PHONE_LINK_STATE')).enabled, 10000, 'tắt link');
    await phone.getByText(/Máy tính công ty đang tắt, Chrome đang tắt hoặc mất mạng/).waitFor({ timeout: 20000 });
    await phone.getByText(/^Khớp tiêu chí \(115\)$/).waitFor({ timeout: 2000 });
    await phone.screenshot({ path: path.join(OUT, '3-iphone-may-tinh-tat.png') });
    tunnel = newTunnel();
    relay.setTunnel(tunnel.host, tunnel.base);
    await ext.click('#pl-toggle');
    await until(async () => JSON.parse((await relay.kv.get('pointer')) || '{}').url === tunnel.url, 30000, 'đăng ký lại');
    await phone.getByText('Máy tính công ty: Đã kết nối').waitFor({ timeout: 25000 });
  });

  await step('Trợ giúp "Cài lên màn hình chính": khoá chỉ tạm nằm trên thanh địa chỉ trong lúc cài', async () => {
    await phone.getByText('Thông tin', { exact: true }).click();
    await phone.getByText(/Kết nối qua ĐỊA CHỈ CỐ ĐỊNH/).waitFor({ timeout: 10000 });
    await phone.getByText('Bắt đầu cài', { exact: true }).click();
    await phone.getByText(/Thêm vào MH chính/).waitFor({ timeout: 5000 });
    assert.match(phone.url(), /#k=[A-Za-z0-9_-]{32}$/, 'đang cài: biểu tượng mới sẽ mang khoá');
    await phone.screenshot({ path: path.join(OUT, '4-iphone-cai-man-hinh-chinh.png'), fullPage: true });
    await phone.getByText('Xong', { exact: true }).click();
    await until(async () => !phone.url().includes('#k='), 5000, 'xoá khoá khỏi thanh địa chỉ');
    await phone.getByText('Tìm gói', { exact: true }).click();
  });

  if (webkitAvailable()) {
    for (const device of ['iphone', 'ipad']) {
      await step(`WebKit (nhân Safari) — ${device === 'iphone' ? 'iPhone 390×844' : 'iPad Pro 1024×1366 (2 cột)'}: mở địa chỉ cố định, kết nối, tìm gói, kết quả`, async () => {
        const wk = await openWebKit(device);
        try {
          await wk.goto(link);
          await wk.waitText(/Máy tính công ty: Đã kết nối/, 30000);
          const w = await wk.exec('return [innerWidth, innerHeight, navigator.userAgent]');
          assert.equal(w[0], wk.device.width, `bề ngang khung nhìn = ${wk.device.name}`);
          assert.equal(String(await wk.url()).includes('#k='), false, 'WebKit: khoá đã xoá khỏi thanh địa chỉ');
          await wk.clickText('Tìm trên e-GP');
          await wk.waitText(/Khớp tiêu chí \(115\)/, 180000);
          await wk.waitText(/Lâm Đồng · Xây lắp/, 5000);
          if (device === 'iphone') {
            // Tra xong tự cuộn tới kết quả: thẻ tóm tắt nằm trong màn hình, không phải vuốt qua tiêu chí.
            await new Promise((r) => setTimeout(r, 800));   // chờ cuộn mượt xong
            const top = await wk.exec(`const el=[...document.querySelectorAll('div')].find(d=>(d.innerText||'').trim()==='Lâm Đồng · Xây lắp'); return el?el.getBoundingClientRect().top:null;`);
            assert.ok(top !== null && top >= 0 && top < wk.device.height * 0.6, `iPhone: kết quả hiện ngay trong màn hình (top=${top})`);
          }
          if (device === 'ipad') {
            const cols = await wk.exec(`const a=[...document.querySelectorAll('div')].find(d=>d.innerText&&d.innerText.trim().startsWith('Tiêu chí')); const b=[...document.querySelectorAll('div')].find(d=>/\\(gói số \\d\\)$/.test((d.innerText||'').trim().split('\\n')[0]||'')); return a&&b?[a.getBoundingClientRect().left,b.getBoundingClientRect().left]:null;`);
            assert.ok(cols && cols[1] > cols[0] + 300, `iPad: danh sách gói nằm cột phải (${JSON.stringify(cols)})`);
          }
          await wk.screenshot(path.join(OUT, `5-webkit-${device}-ket-qua.png`));
          console.log(`        WebKit ${wk.version} · ${w[0]}×${w[1]} · ${String(w[2]).slice(0, 60)}…`);
        } finally { await wk.close(); }
      });
    }
  } else if (process.env.GSCB_REQUIRE_WEBKIT) {
    // CI đã cài WebKit: thiếu thì là hỏng, không được lặng lẽ bỏ qua phần kiểm thử nhân Safari.
    await step('WebKit (nhân Safari) có sẵn', async () => { throw new Error('GSCB_REQUIRE_WEBKIT=1 nhưng thiếu WebKitWebDriver / MiniBrowser / Xvfb / matchbox-window-manager'); });
  } else {
    console.log('  BỎ QUA WebKit: chưa cài webkit2gtk-driver (apt-get install webkit2gtk-driver matchbox-window-manager)');
  }

  await step('Đổi khoá trên máy tính → iPhone cầm khoá cũ bị từ chối; quét mã mới → dùng tiếp', async () => {
    const old = link;
    await send('SET_PHONE_LINK_KEY');
    const s = await until(async () => { const x = await send('PHONE_LINK_STATE'); return x.link !== old && x.relay.current ? x : null; }, 15000, 'khoá mới + đăng ký lại');
    link = s.link;
    await phone.reload();
    await phone.getByText(/Khoá trên máy này đã cũ/).waitFor({ timeout: 20000 });
    await phone.goto(link);
    await phone.getByText('Máy tính công ty: Đã kết nối').waitFor({ timeout: 20000 });
  });

  await step('Chốt an toàn: không trang nào mở ra e-GP thật', async () => { assert.deepEqual(realEgp, []); });
} finally {
  await ctx.close().catch(() => {});
  mock.kill();
  await relay.close();
  fs.rmSync(UD, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\nĐịa chỉ cố định đầu-cuối: ĐẠT ${results.length - failed.length}/${results.length}`);
for (const f of failed) console.log(`\n✗ ${f.name}\n${f.error}`);
if (failed.length && fs.existsSync(hostLog)) console.log(`\nNhật ký cầu nối:\n${fs.readFileSync(hostLog, 'utf8').slice(-3000)}`);
process.exit(failed.length ? 1 : 0);
