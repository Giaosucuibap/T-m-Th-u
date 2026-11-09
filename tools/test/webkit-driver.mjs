/* ============================================================================
 *  ĐIỀU KHIỂN WEBKIT (NHÂN CỦA SAFARI) QUA WEBDRIVER — cho bài thử cỡ iPhone / iPad
 *
 *  Dùng WebKitWebDriver + MiniBrowser của WebKitGTK (gói webkit2gtk-driver): cùng
 *  nhân WebKit + JavaScriptCore với Safari trên iPhone/iPad. KHÁC Safari thật ở phần
 *  vỏ (không có nút Chia sẻ / "Thêm vào MH chính", phông chữ, cuộn bằng ngón tay).
 *  Mỗi thiết bị một màn hình Xvfb đúng kích thước, MiniBrowser toàn màn hình.
 * ========================================================================== */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';

const MINIBROWSER = ['/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser', '/usr/lib/aarch64-linux-gnu/webkit2gtk-4.1/MiniBrowser'].find((p) => fs.existsSync(p)) || '';
export const DEVICES = Object.freeze({
  iphone: { name: 'iPhone (390×844)', width: 390, height: 844, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1' },
  // iPadOS mặc định xin "trang cho máy tính" nên Safari iPad dùng chuỗi nhận dạng của Mac.
  ipad: { name: 'iPad Pro 12.9" dọc (1024×1366)', width: 1024, height: 1366, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15' }
});

export function webkitAvailable() {
  // WebKitWebDriver không có --version (in hướng dẫn, mã thoát 1): chỉ cần chạy được.
  const runs = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' }).error == null;
  return Boolean(MINIBROWSER) && runs('WebKitWebDriver', ['--help']) && runs('Xvfb', ['-help']) && runs('matchbox-window-manager', ['-help']);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

async function freeDisplay() {
  for (let n = 91; n < 140; n++) if (!fs.existsSync(`/tmp/.X11-unix/X${n}`) && !fs.existsSync(`/tmp/.X${n}-lock`)) return n;
  throw new Error('Không còn số màn hình Xvfb trống');
}

export async function openWebKit(device) {
  const d = typeof device === 'string' ? DEVICES[device] : device;
  const display = await freeDisplay();
  const xvfb = spawn('Xvfb', [`:${display}`, '-screen', '0', `${d.width}x${d.height}x24`, '-nolisten', 'tcp'], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !fs.existsSync(`/tmp/.X11-unix/X${display}`); i++) await sleep(100);
  // Trình quản lý cửa sổ kiểu "kiosk" (như điện thoại): cửa sổ trình duyệt phủ đúng cả màn hình
  // thiết bị → khung nhìn đúng 390 px (iPhone) / 1024 px (iPad), không có thanh công cụ.
  const wm = spawn('matchbox-window-manager', ['-use_titlebar', 'no', '-use_cursor', 'no'], { env: { ...process.env, DISPLAY: `:${display}` }, stdio: 'ignore' });
  await sleep(300);
  const port = await freePort();
  const driver = spawn('WebKitWebDriver', [`--port=${port}`], { env: { ...process.env, DISPLAY: `:${display}`, GDK_BACKEND: 'x11' }, stdio: ['ignore', 'ignore', 'pipe'] });
  const wd = async (method, p, body) => {
    const res = await fetch(`http://127.0.0.1:${port}${p}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`WebDriver ${method} ${p}: ${JSON.stringify(j).slice(0, 300)}`);
    return j.value;
  };
  for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${port}/status`); break; } catch { await sleep(150); } }
  const s = await wd('POST', '/session', { capabilities: { alwaysMatch: {
    browserName: 'MiniBrowser', acceptInsecureCerts: true,
    'webkitgtk:browserOptions': { binary: MINIBROWSER, args: ['--automation', '--full-screen', `--user-agent=${d.ua}`] }
  } } });
  const id = s.sessionId;
  const api = {
    device: d, version: s.capabilities.browserVersion,
    goto: (url) => wd('POST', `/session/${id}/url`, { url }),
    url: () => wd('GET', `/session/${id}/url`),
    exec: (script, args = []) => wd('POST', `/session/${id}/execute/sync`, { script, args }),
    text: () => api.exec('return document.body ? document.body.innerText : ""'),
    async waitText(re, ms = 30000) {
      const end = Date.now() + ms;
      for (;;) {
        const t = await api.text().catch(() => '');
        if (re.test(t)) return t;
        if (Date.now() > end) throw new Error(`WebKit (${d.name}): hết hạn chờ ${re} — trang có: ${t.slice(0, 400).replace(/\s+/g, ' ')}`);
        await sleep(300);
      }
    },
    async clickText(text) {
      const lit = text.includes("'") ? `concat('${text.split("'").join(`', "'", '`)}')` : `'${text}'`;
      const el = await wd('POST', `/session/${id}/element`, { using: 'xpath', value: `//*[normalize-space(text())=${lit}]` });
      const eid = el[Object.keys(el)[0]];
      // Nút nằm dưới màn hình iPhone, trong khung cuộn của trang: cuộn tới như ngón tay vuốt rồi mới bấm.
      await wd('POST', `/session/${id}/execute/sync`, { script: 'arguments[0].scrollIntoView({block:"center"});', args: [el] });
      await sleep(250);
      await wd('POST', `/session/${id}/element/${eid}/click`, {});
    },
    async type(selector, value) {
      const el = await wd('POST', `/session/${id}/element`, { using: 'css selector', value: selector });
      const eid = el[Object.keys(el)[0]];
      await wd('POST', `/session/${id}/element/${eid}/value`, { text: value });
    },
    async screenshot(file) { fs.writeFileSync(file, Buffer.from(await wd('GET', `/session/${id}/screenshot`), 'base64')); },
    async close() {
      try { await wd('DELETE', `/session/${id}`); } catch { /* đã đóng */ }
      driver.kill(); wm.kill(); xvfb.kill();
    }
  };
  return api;
}
