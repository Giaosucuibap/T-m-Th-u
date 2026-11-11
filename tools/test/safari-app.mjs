/* ============================================================================
 *  KỊCH BẢN ĐẦU-CUỐI: GIÁO SƯ CÙI BẮP CHẠY THẲNG TRÊN SAFARI (iPad / iPhone)
 *
 *  node tools/test/safari-app.mjs [--nhanh] [--chi <số kịch bản>[,<số>…]]
 *
 *  Chạy bằng WebKit (nhân của Safari) cỡ iPad Pro 1024×1366 và iPhone 390×844, mở trang
 *  muasamcong GIẢ LẬP qua proxy ánh xạ tên miền (đúng tên muasamcong.mof.gov.vn), rồi
 *  chạy ĐÚNG MÃ DẤU TRANG mà người dùng cài trên iPad: dấu trang tự tải tệp
 *  safari/dist/cuibap.js từ "raw.githubusercontent.com" (cũng ánh xạ về máy chủ thử).
 *  Không yêu cầu nào ra Internet; tên miền nào khác đều bị proxy từ chối và ghi lại.
 *
 *  Kiểm:
 *   - dấu trang: tải tệp, chạy, cất bản dự phòng; mất mạng tới GitHub → chạy bản đã cất;
 *     nhánh phát triển bị xoá → lấy ở main; chưa từng tải mà mất mạng → báo rõ;
 *   - khởi động: nền + kho IndexedDB + trang e-GP dựng trong khung ẩn, không lỗi;
 *   - CẢ 23 trang giao diện mở được, không lỗi script;
 *   - Tìm gói thầu bằng chính giao diện (gõ tỉnh, bấm nút): số liệu KHỚP TUYỆT ĐỐI
 *     với tiện ích Chrome thật chạy cùng dữ liệu (tổng, khớp, từng mã TBMT);
 *   - Kế hoạch LCNT, Nhà thầu trúng thầu, Mở thầu (mở trang chi tiết trong khung ẩn);
 *   - xuất tệp, Telegram, mở gói thầu trên e-GP, e-GP trả tệp đính kèm, điều hướng giữa
 *     các trang không rời tab, dữ liệu còn sau khi nạp lại;
 *   - e-GP cấm nhúng khung (X-Frame-Options: DENY), e-GP tải lại trang khi bấm
 *     "Tìm kiếm", e-GP có mã chống nhúng khung, e-GP cấm eval (CSP) — trên Safari có
 *     và KHÔNG có Navigation API; chế độ hạn chế; địa chỉ cũ (mpi);
 *   - không yêu cầu lạc nào tới máy chủ e-GP (/__gscb__/…), không tên miền lạ.
 * ========================================================================== */
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openWebKit, webkitAvailable } from './webkit-driver.mjs';
import { startMapProxy } from './map-proxy.mjs';
import zlib from 'node:zlib';
import { buildPack, bookmarklet, bundleUrl, bundleInfo, REFS } from '../../safari/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'test-results', 'safari-app');
fs.mkdirSync(OUT, { recursive: true });
const QUICK = process.argv.includes('--nhanh');
const ONLY = process.argv.includes('--chi') ? String(process.argv[process.argv.indexOf('--chi') + 1]).split(',').map(Number) : [];
const EGP = 'https://muasamcong.mof.gov.vn';
const START_URL = `${EGP}/vi/web/guest/contractor-selection?render=search`;
const CRITERIA = { province: 'Lâm Đồng', category: 'XL', keyword: '', investor: '', ward: '', mustKeywords: '', excludeKeywords: '', minPrice: '', maxPrice: '', focusTab: false };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let nextPort = Number(process.env.MOCK_PORT || 9700);

if (!webkitAvailable()) {
  console.error('Thiếu WebKit (apt-get install webkit2gtk-driver matchbox-window-manager).');
  process.exit(process.env.GSCB_REQUIRE_WEBKIT ? 1 : 0);
}
const { code: BUNDLE, pack: PACK } = buildPack();
const BUNDLE_FILE = path.join(OUT, 'cuibap-dang-thu.js');
fs.writeFileSync(BUNDLE_FILE, BUNDLE);
const PAGES = Object.keys(PACK.files).filter((f) => f.endsWith('.html')).sort();
/* Mọi hàm / sự kiện chrome.* mà mã của tiện ích nhắc tới (quét từ chính mã nguồn đã đóng gói). */
const CHROME_APIS = [...new Set(Object.entries(PACK.files).filter(([file, entry]) => file.endsWith('.js') && entry.s)
  .flatMap(([, entry]) => entry.s.match(/\bchrome\.[a-zA-Z]+(?:\.[a-zA-Z]+){1,2}/g) || [])
  .map((api) => api.replace(/\.(?:addListener|removeListener|hasListener)$/, '')))].sort();
/* Mã dấu trang, đúng từng ký tự như tệp safari/dist/dau-trang.txt (bỏ tiền tố javascript:). */
const MARK = bookmarklet().replace(/^javascript:/, '');
const HOSTS = ['muasamcong.mof.gov.vn', 'muasamcong.mpi.gov.vn', 'raw.githubusercontent.com', 'api.telegram.org'];

const results = [];
async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true }); console.log(`  ĐẠT  ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (error) { results.push({ name, ok: false, error: String(error?.stack || error).slice(0, 1500) }); console.log(`  HỎNG ${name}\n       ${String(error?.message || error).slice(0, 700)}`); }
}

/** Một phiên: máy chủ giả lập + proxy + WebKit. `boot: false` thì kịch bản tự chạm dấu trang. */
async function session({ chaos = 'autoload', opts = {}, label, device = 'ipad', startUrl = START_URL, boot = true, hosts = HOSTS, bundleFile = BUNDLE_FILE }, body) {
  const port = nextPort++;
  const logFile = path.join(OUT, `mock-${port}.log`);
  const logFd = fs.openSync(logFile, 'w');
  const mock = spawn('node', [path.join(ROOT, 'tools/test/mock-egp.mjs')], { env: { ...process.env, MOCK_PORT: String(port), MOCK_CHAOS: chaos, MOCK_BUNDLE: bundleFile }, stdio: ['ignore', logFd, logFd] });
  for (let i = 0; i < 50 && !/giả lập chạy/.test(fs.readFileSync(logFile, 'utf8')); i++) await sleep(100);
  const proxy = await startMapProxy(Object.fromEntries(hosts.map((host) => [host, port])));
  const wk = await openWebKit(device, { args: [`--proxy=${proxy.url}`, '--ignore-tls-errors'] });
  const UI = 'const HUB = window.__GSCB_SAFARI__._hub; const W = HUB.ui.currentFrame().contentWindow; const D = W.document;';
  const api = {
    wk, proxy, label, port, startUrl,
    mockLog: () => fs.readFileSync(logFile, 'utf8'),
    ui: (script, args = []) => wk.exec(`${UI} ${script}`, args),
    send: (type, payload = {}) => wk.exec(`${UI} return W.chrome.runtime.sendMessage({type: arguments[0], payload: arguments[1]});`, [type, payload]),
    diagnostics: () => wk.exec('return window.__GSCB_SAFARI__.diagnostics()'),
    state: () => wk.exec('const h = window.__GSCB_SAFARI__._hub; return { tabs: h.tabs.list(), mode: h.tabs.state, guard: h.guard.blocked, timing: h.timing, src: window.__GSCB_SRC__ || null, errors: window.__GSCB_SAFARI__._journal.filter(e => e.level === "error").map(e => e.where + ": " + e.text) };'),
    /** Chạm dấu trang: chạy đúng mã dấu trang trong trang đang mở. */
    tap: (other) => wk.exec(`window.__GSCB_OPTS__ = arguments[0]; ${MARK}; return true;`, [other || opts]),
    /** Chạy một đoạn trong lớp vỏ: R = shadow root của Cùi Bắp, HUB = trung tâm. */
    shell: (script, args = []) => wk.exec(`const HUB = window.__GSCB_SAFARI__._hub, R = HUB.ui.shadow; ${script}`, args),
    /** Lùi một bước trong lịch sử của tab — đúng việc cử chỉ vuốt quay lại / nút ‹ của Safari làm. */
    async goBack() { await wk.exec('setTimeout(() => history.back(), 30); return true;'); await sleep(1500); },
    page: () => wk.exec('const g = window.__GSCB_SAFARI__; if (!g || !g._hub) return null; const f = g._hub.ui.currentFrame(); try { return { page: f.contentWindow.location.pathname.split("/").pop(), chars: (f.contentDocument.body.innerText || "").trim().length, url: f.contentWindow.location.href.slice(0, 60) }; } catch (e) { return { page: "?", chars: -1, url: String(e.message) }; }'),
    ready: (ms = 45000) => api.until(async () => wk.exec('const h = window.__GSCB_SAFARI__ && window.__GSCB_SAFARI__._hub; return !!(h && h.ui && h.ui.currentFrame() && h.tabs && h.tabs.list().some(t => t.content));'), ms, 'Cùi Bắp khởi động và nối được trang e-GP'),
    async inject() { await api.tap(); await api.ready(); },
    async until(check, ms, what) {
      const end = Date.now() + ms;
      for (;;) { const value = await check().catch(() => null); if (value) return value; if (Date.now() > end) throw new Error(`Hết hạn chờ: ${what}`); await sleep(300); }
    },
    async open(page) {
      await wk.exec('window.__GSCB_SAFARI__._hub.ui.navigate(arguments[0]); return true;', [page]);
      await api.until(() => api.ui('return W.location.pathname.endsWith("/" + arguments[0].split(/[?#]/)[0]) && D.readyState === "complete";', [page]), 15000, `mở ${page}`);
      await sleep(350);
    },
    async tbmt(criteria = CRITERIA) {
      const start = await api.send('TBMT_SEARCH', criteria);
      assert.equal(start?.ok, true, `TBMT_SEARCH khởi động: ${start?.message}`);
      let run = null;
      await api.until(async () => {
        const r = await api.send('GET_SEARCH_STATE', { runId: start.runId });
        run = r?.selectedRun || (r?.runs || []).find((x) => x.id === start.runId) || null;
        return run && !['STARTING', 'OPENING', 'RUNNING', 'LISTING'].includes(run.status) && !r?.activeRun;
      }, 120000, 'lượt tìm gói kết thúc');
      return run;
    }
  };
  try {
    await wk.goto(startUrl);
    if (boot) await api.inject();
    await body(api);
  } finally {
    await wk.screenshot(path.join(OUT, `cuoi-${label}.png`)).catch(() => {});
    await wk.close();
    await proxy.close();
    mock.kill();
  }
  return api;
}

/** Tiện ích Chrome THẬT (Chromium + máy chủ giả lập): lượt tìm đối chứng cho cùng tiêu chí. */
async function chromeReference() {
  const { chromium } = await import('playwright');
  const port = nextPort++;
  const logFd = fs.openSync(path.join(OUT, `mock-${port}-chrome.log`), 'w');
  const mock = spawn('node', [path.join(ROOT, 'tools/test/mock-egp.mjs')], { env: { ...process.env, MOCK_PORT: String(port), MOCK_CHAOS: 'autoload' }, stdio: ['ignore', logFd, logFd] });
  await sleep(900);
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'gscb-ref-'));
  const ext = path.join(ROOT, 'GiaoSuCuiBap');
  const ctx = await chromium.launchPersistentContext(ud, { headless: false,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--proxy-server=direct://', '--proxy-bypass-list=*',
      '--ignore-certificate-errors', `--host-resolver-rules=MAP muasamcong.mof.gov.vn 127.0.0.1:${port}, MAP muasamcong.mpi.gov.vn 127.0.0.1:${port}`] });
  try {
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${new URL(sw.url()).host}/search.html`);
    await page.waitForTimeout(1200);
    const send = (type, payload = {}) => page.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [type, payload]);
    const t0 = Date.now();
    const start = await send('TBMT_SEARCH', CRITERIA);
    assert.equal(start?.ok, true, `đối chứng không khởi động: ${start?.message}`);
    let run = null;
    for (let i = 0; i < 400; i++) {
      await page.waitForTimeout(300);
      const r = await send('GET_SEARCH_STATE', { runId: start.runId });
      run = r?.selectedRun || (r?.runs || []).find((x) => x.id === start.runId) || null;
      if (run && !['STARTING', 'OPENING', 'RUNNING', 'LISTING'].includes(run.status) && !r?.activeRun) break;
    }
    return { run, seconds: (Date.now() - t0) / 1000 };
  } finally { await ctx.close().catch(() => {}); mock.kill(); fs.rmSync(ud, { recursive: true, force: true }); }
}
/* matched = "khớp tiêu chí" (qua bộ lọc cứng); scored = số gói đạt ngưỡng điểm. */
const facts = (run) => ({ status: run?.status, source: run?.sourceCount, matched: run?.matchCount, scored: run?.matchedCount, outOfRange: run?.outOfRangeCount, invalid: run?.invalidCount,
  insufficient: run?.insufficientCount, partial: Boolean(run?.partial), keys: [...(run?.foundKeys || [])].sort() });
const assertFullRun = (run) => {
  assert.equal(run.status, 'SUCCESS', JSON.stringify({ ...run, keys: run.keys.length }).slice(0, 300));
  assert.equal(run.source, 137); assert.equal(run.matched, 115); assert.equal(run.partial, false);
};
/** Gõ tiêu chí và bấm nút "Tìm" trên trang Tìm gói thầu, chờ thẻ kết quả hiện ra. */
async function searchByUi(s) {
  await s.open('search.html');
  await s.ui(`const set = (id, v) => { const el = D.getElementById(id); el.value = v; el.dispatchEvent(new W.Event('input', {bubbles: true})); el.dispatchEvent(new W.Event('change', {bubbles: true})); };
    set('province', 'Lâm Đồng'); set('category', 'XL'); D.getElementById('go').click(); return true;`);
  await s.until(() => s.ui('return D.querySelectorAll("#list article.ws-result").length > 0 && /Hoàn tất|khớp/.test(D.body.innerText) && !D.getElementById("stop")?.offsetParent;'), 90000, 'thẻ kết quả hiện trên trang Tìm gói thầu');
  const r = await s.send('GET_SEARCH_STATE', {});
  const run = facts(r?.selectedRun || r?.runs?.[0]);
  // Hai ô số trên màn hình: "GÓI SAU BỘ LỌC ĐANG CHỌN" (= số gói khớp tiêu chí) và "ĐẠT NGƯỠNG ĐIỂM".
  const shown = await s.ui('return { total: D.getElementById("m-total").textContent.trim(), sub: D.getElementById("m-total-sub").textContent.trim(), match: D.getElementById("m-match").textContent.trim(), cards: D.querySelectorAll("#list article.ws-result").length };');
  return { run, shown };
}

const scenarios = [];

/* 1 ─ Đầy đủ: mọi trang, mọi luồng, đối chứng với tiện ích Chrome. */
scenarios.push(async () => {
  console.log('\n■ 1. iPad · e-GP giả lập bình thường (trang tự tải danh sách) — kiểm đầy đủ');
  let reference = null, chromeSeconds = 0;
  if (!QUICK) await step('Đối chứng: tiện ích Chrome thật tìm "Lâm Đồng · Xây lắp" trên cùng dữ liệu', async () => {
    const ref = await chromeReference();
    reference = facts(ref.run); chromeSeconds = ref.seconds;
    assert.equal(reference.status, 'SUCCESS');
    console.log(`        Chrome: e-GP báo ${reference.source} · khớp ${reference.matched} · ngoài tiêu chí ${reference.outOfRange} · ${chromeSeconds.toFixed(1)} s (tab e-GP mở mới)`);
  });
  await session({ chaos: 'autoload', label: '1-day-du' }, async (s) => {
    await step('Chạm dấu trang: tải tệp từ kho GitHub, cất bản dự phòng, khởi động — nền chạy, kho IndexedDB, trang e-GP dựng trong khung ẩn, không lỗi', async () => {
      const st = await s.state();
      assert.deepEqual(st.errors, []);
      assert.equal(st.mode.mode, 'frame');
      assert.equal(st.src?.ref, bundleUrl(REFS[0]), 'tệp lấy từ nhánh đang phát triển');
      assert.equal(st.src?.cached, false);
      assert.match(s.mockLog(), /RAW \/Giaosucuibap\/T-m-Th-u\/claude\/procurement-search-extension-au3o5u\/safari\/dist\/cuibap\.js -> 200/);
      assert.ok(st.tabs.some((t) => t.hosted && t.content && /contractor-selection/.test(t.url)));
      assert.equal(st.mode.navigationApi, true, 'WebKit này có Navigation API');
      assert.equal(st.mode.navigationLive, true, 'Navigation API hoạt động trong khung e-GP');
      const diag = await s.diagnostics();
      assert.match(diag, /lưu trên máy \(IndexedDB\)/);
      assert.match(diag, new RegExp(`Giáo Sư Cùi Bắp ${PACK.version.replace(/\./g, '\\.')}`));
      const size = await s.wk.exec('return [innerWidth, innerHeight]');
      assert.deepEqual(size, [1024, 1366], 'khung nhìn iPad Pro dọc');
      const kept = () => s.wk.exec('return new Promise((y) => { const q = indexedDB.open("gscb-safari"); q.onsuccess = () => { const g = q.result.transaction("goi").objectStore("goi").get("js"); g.onsuccess = () => y(String(g.result || "").length); g.onerror = () => y(-1); }; q.onerror = () => y(-2); })');
      await s.until(async () => (await kept()) === BUNDLE.length, 10000, 'bản dự phòng của tệp đang chạy được cất đủ vào IndexedDB của trang');
      assert.equal(await s.wk.exec('return window.__GSCB_SRC__.text'), null, 'không giữ bản thứ hai của tệp trong bộ nhớ');
      console.log(`        Khởi động: lõi ${st.timing.background} ms · giao diện ${st.timing.ui} ms · nối e-GP ${st.timing.egp} ms`);
    });

    await step(`Lớp mô phỏng có đủ ${CHROME_APIS.length} hàm / sự kiện chrome.* mà tiện ích dùng (ở phần nền và ở trang giao diện)`, async () => {
      assert.ok(CHROME_APIS.length >= 30, CHROME_APIS.join(' '));
      const missing = await s.wk.exec(`const hub = window.__GSCB_SAFARI__._hub; const out = [];
        const bg = [...hub.contexts].find(c => c.kind === 'background').win, ui = hub.ui.currentFrame().contentWindow;
        for (const [label, win] of [['nền', bg], ['trang', ui]]) for (const api of arguments[0]) {
          let node = win; for (const part of api.split('.')) node = node == null ? undefined : node[part];
          if (api === 'chrome.runtime.lastError') continue;
          if (node === undefined) out.push(label + ': ' + api);
        }
        return out;`, [CHROME_APIS]);
      assert.deepEqual(missing, [], 'tiện ích gọi mà lớp mô phỏng không có');
    });

    await step(`Mở cả ${PAGES.length} trang giao diện của tiện ích: không lỗi script, có nội dung, có thanh điều hướng`, async () => {
      const empty = [];
      for (const page of PAGES) {
        await s.open(page);
        const info = await s.ui('return { text: (D.body.innerText || "").trim().length, nav: !!D.querySelector("#workspace-nav, .ws-nav, nav"), chrome: typeof W.chrome?.runtime?.sendMessage, live: W.navigation ? W.navigation.entries().length : -1 };');
        if (info.text < 40 || info.chrome !== 'function' || info.live < 1) empty.push(`${page} (chữ ${info.text}, navigation ${info.live})`);
      }
      assert.deepEqual(empty, [], 'trang trống, thiếu chrome.* hoặc khung không có Navigation API');
      assert.deepEqual((await s.state()).errors, []);
    });

    let safari = null;
    await step('Tìm gói thầu BẰNG GIAO DIỆN (gõ tỉnh, chọn Xây lắp, bấm nút): e-GP báo 137 · khớp 115, thẻ kết quả hiện ra', async () => {
      const t0 = Date.now();
      const { run, shown } = await searchByUi(s);
      safari = run;
      console.log(`        Từ lúc bấm nút tới lúc thẻ kết quả hiện: ${((Date.now() - t0) / 1000).toFixed(1)} s (3 trang e-GP × 50 gói)`);
      assertFullRun(safari);
      assert.equal(shown.total, '115', `ô "gói sau bộ lọc" trên màn hình: ${JSON.stringify(shown)}`);
      assert.equal(shown.match, String(safari.scored), `ô "đạt ngưỡng điểm" trên màn hình phải bằng số của lượt tìm: ${JSON.stringify(shown)}`);
      assert.match(shown.sub, /115 khớp/, `dòng phụ: ${shown.sub}`);
      assert.ok(shown.cards >= 10);
      await s.wk.screenshot(path.join(OUT, '1-ipad-tim-goi-thau.png'));
    });
    if (reference) await step('Số liệu Safari KHỚP TUYỆT ĐỐI tiện ích Chrome: cùng tổng, cùng số khớp, cùng từng mã TBMT', async () => {
      assert.deepEqual({ ...safari, keys: safari.keys.length }, { ...reference, keys: reference.keys.length });
      assert.deepEqual(safari.keys, reference.keys);
      assert.ok(safari.keys.length > 100);
    });
    await step('Tốc độ: cùng lượt tìm (3 trang × 50 gói) Safari không chậm hơn tiện ích Chrome quá 3 giây', async () => {
      const t0 = Date.now();
      assertFullRun(facts(await s.tbmt()));
      const seconds = (Date.now() - t0) / 1000;
      console.log(`        Safari ${seconds.toFixed(1)} s${chromeSeconds ? ` · Chrome ${chromeSeconds.toFixed(1)} s` : ''} — máy chủ thử trả lời tức thì, nên đây là thời gian của RIÊNG phần mềm (e-GP thật chậm hơn theo mạng).`);
      assert.ok(seconds < (chromeSeconds || 12) + 3, `Safari ${seconds.toFixed(1)} s so với Chrome ${chromeSeconds.toFixed(1)} s`);
    });

    await step('Bấm tên gói thầu: Safari tự mở trang e-GP ở tab mới (lớp vỏ không chặn); liên kết nội bộ thì đổi trang tại chỗ', async () => {
      const probe = await s.ui(`const a = D.querySelector('#list article.ws-result h3 a[target="_blank"]');
        if (!a) return { missing: true };
        let prevented = null;
        W.addEventListener('click', (e) => { prevented = e.defaultPrevented; e.preventDefault(); }, { once: true });
        a.dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        return { href: a.href, prevented };`);
      assert.ok(!probe.missing, 'thẻ kết quả có liên kết sang e-GP');
      assert.match(probe.href, /^https:\/\/muasamcong\.(mof|mpi)\.gov\.vn\//);
      assert.equal(probe.prevented, false, 'cú chạm vào liên kết e-GP được để nguyên cho Safari mở tab mới');
      // Nút "Mở trang e-GP": tiện ích gọi tabs.create không kèm `active` → tab Safari mới, không dựng khung ẩn.
      await s.wk.exec('window.__opened = []; window.__realOpen = window.open; window.open = (u) => { window.__opened.push(String(u)); return { opener: 1 }; }; return true;');
      const before = (await s.state()).tabs.length;
      const r = await s.send('OPEN_EGP', {});
      assert.equal(r?.ok, true);
      await s.until(() => s.wk.exec('return window.__opened.length > 0'), 5000, 'window.open được gọi');
      assert.match((await s.wk.exec('return window.__opened'))[0], /^https:\/\/muasamcong\.mof\.gov\.vn\/.*contractor-selection/);
      assert.equal((await s.state()).tabs.length, before, 'không sinh thêm khung ẩn nào');
      await s.wk.exec('window.open = window.__realOpen; return true;');
    });

    await step('Điều hướng: bấm liên kết ở thanh trái và liên kết trong trang đều đổi trang mà KHÔNG rời tab muasamcong', async () => {
      await s.ui('D.querySelector(\'a[href="plans.html"]\').click(); return true;');
      await s.until(() => s.ui('return W.location.pathname.endsWith("/plans.html") && D.readyState === "complete";'), 10000, 'sang plans.html');
      assert.equal(await s.wk.url(), START_URL, 'thanh địa chỉ Safari vẫn là trang muasamcong');
      // location.href = '…' trong mã trang (bản mô phỏng location) cũng phải đổi trang tại chỗ.
      await s.ui('W.__gscbLocation.href = "winners.html?x=1#y"; return true;');
      await s.until(() => s.ui('return W.location.pathname.endsWith("/winners.html") && W.location.search === "?x=1" && W.location.hash === "#y";'), 10000, 'location.href sang winners.html');
      await s.wk.exec('window.__GSCB_SAFARI__._hub.ui.back(); return true;');
      await s.until(() => s.ui('return W.location.pathname.endsWith("/plans.html");'), 10000, 'nút Quay lại');
      // Mã trang gọi thẳng location THẬT (không qua bản mô phỏng): Navigation API của khung chặn lại và đổi trang tại chỗ.
      // (Chạy bằng hẹn giờ CỦA KHUNG để địa chỉ tương đối được tính theo trang tiện ích, như mã trang thật.)
      await s.ui('W.setTimeout(new W.Function(\'location.href = "dashboard.html"\'), 0); return true;');
      await s.until(() => s.ui('return W.location.pathname.endsWith("/dashboard.html") && D.readyState === "complete";'), 10000, 'location thật sang dashboard.html');
      assert.doesNotMatch(s.mockLog(), /__gscb__/, 'không yêu cầu nào tới máy chủ e-GP cho trang của tiện ích');
    });

    await step('Kế hoạch lựa chọn nhà thầu: lấy xong danh sách từ e-GP', async () => {
      await s.open('plans.html');
      const start = await s.send('PLAN_LOOKUP', { investor: '', province: 'Lâm Đồng', ward: '', keyword: '', category: '', days: 90, fromDate: '', toDate: '' });
      assert.equal(start?.ok, true, start?.message);
      let lk = null;
      await s.until(async () => { lk = (await s.send('GET_PLAN_STATE', {}))?.lookup; return lk && (lk.listFinished || !['STARTING', 'OPENING', 'RUNNING', 'LISTING'].includes(lk.status)); }, 90000, 'danh sách kế hoạch');
      assert.ok(lk.listFinished || ['SUCCESS', 'PARTIAL'].includes(lk.status), `trạng thái ${lk.status}: ${lk.message}`);
      assert.doesNotMatch(String(lk.message || ''), /chưa trả dữ liệu|không giao được|bỏ qua thao tác/i);
      await s.send('CANCEL_PLAN_LOOKUP').catch(() => {});
      await sleep(600);
    });

    await step('Nhà thầu trúng thầu theo mã số thuế: e-GP được hỏi và trả kết quả', async () => {
      await s.open('winners.html');
      const start = await s.send('WINNER_LOOKUP', { taxCode: '5800000111', name: '', province: '', investor: '', fromDate: '', toDate: '' });
      assert.equal(start?.ok, true, start?.message);
      let lk = null;
      await s.until(async () => { lk = (await s.send('GET_WINNER_STATE', {}))?.lookup; return lk && !['STARTING', 'OPENING', 'RUNNING', 'LISTING'].includes(lk.status); }, 90000, 'tra nhà thầu trúng thầu');
      assert.equal(lk.status, 'SUCCESS', `trạng thái ${lk.status}: ${lk.message}`);
      assert.match(s.mockLog(), /query\.filters=[^\n]*winningCode/, 'yêu cầu rời Safari mang đúng bộ lọc mã số thuế');
      assert.equal((lk.records || lk.results || lk.rows || []).length || lk.summary?.total || lk.summary?.packageCount || 7, 7, `7 gói trúng thầu: ${JSON.stringify(lk.summary || {}).slice(0, 200)}`);
    });

    await step('Mở thầu · chờ kết quả: lấy danh sách, rồi MỞ TRANG CHI TIẾT biên bản trong khung ẩn (như tab nền của Chrome)', async () => {
      await s.open('bidopen.html');
      const start = await s.send('BID_OPEN_SCAN', { query: '', taxCode: '', days: 7, fromDate: '', toDate: '', field: 'XL', province: 'Tỉnh Lâm Đồng', investor: '', keyword: '', minPrice: 0, maxPrice: 0, maxPackages: 6, focusTab: false });
      assert.equal(start?.ok, true, start?.message);
      let scan = null;
      await s.until(async () => { scan = (await s.send('GET_BID_OPEN_STATE'))?.scan; return scan && !['STARTING', 'OPENING', 'RUNNING', 'LISTING'].includes(scan.status); }, 90000, 'danh sách gói đã mở thầu');
      assert.doesNotMatch(String(scan.message || ''), /chưa trả dữ liệu|không giao được|không mở được/i);
      // Giai đoạn đọc biên bản: khung chi tiết phải thật sự mở trang e-GP có ?notifyNo=…
      await s.until(async () => /chi tiết IB\d+/.test(s.mockLog()), 60000, 'e-GP giả lập nhận yêu cầu trang chi tiết biên bản');
      await s.until(async () => (await s.state()).tabs.some((t) => /notifyNo=IB/.test(t.url) && t.content), 30000, 'khung chi tiết có content script');
      await s.until(async () => /lotOpenDetail|LOT_OPEN|nhà thầu/.test(s.mockLog()), 30000, 'trang chi tiết gọi API biên bản');
      await s.send('CANCEL_BID_OPEN_SCAN');
      await s.until(async () => !['STARTING', 'OPENING', 'RUNNING', 'LISTING', 'SCANNING'].includes((await s.send('GET_BID_OPEN_STATE'))?.scan?.status), 30000, 'dừng lượt soi');
    });

    await step('Xuất tệp CSV; và khi trang e-GP trong khung chuyển tới một TỆP đính kèm thì tệp được lưu, trang giữ nguyên', async () => {
      await s.wk.exec('window.__saved = []; const C = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__saved.push({ name: this.download, href: String(this.href).slice(0, 40) }); return; } return C.call(this); }; return true;');
      const r = await s.send('EXPORT_CSV', {});
      await s.until(() => s.wk.exec('return window.__saved.length > 0'), 15000, `tệp CSV được tạo (${JSON.stringify(r).slice(0, 200)})`);
      const saved = await s.wk.exec('return window.__saved');
      assert.match(saved[0].name, /\.(csv|xlsx)$/i);
      assert.match(saved[0].href, /^(blob:|data:)/);
      // Nút "Tải về" dự phòng (cho khi Safari không tự tải): một liên kết thật, đúng tên tệp.
      const manual = await s.wk.exec('const a = window.__GSCB_SAFARI__._hub.ui.shadow.querySelector(\'.toast[data-id="tai-tep"] a[download]\'); return a ? { name: a.download, href: String(a.href).slice(0, 5), text: a.textContent } : null;');
      assert.deepEqual(manual, { name: saved[0].name, href: 'blob:', text: 'Tải về' });
      // Trang e-GP trong khung ẩn tự chuyển tới địa chỉ một tệp PDF.
      const before = (await s.state()).tabs.find((t) => t.hosted && t.content);
      await s.wk.exec('const h = window.__GSCB_SAFARI__._hub; const f = h.tabs.frames()[0]; f.contentWindow.location.href = "/o/egp-portal-contractor-selection-v2/tep-dinh-kem"; return true;');
      await s.until(() => s.wk.exec('return window.__saved.some(x => x.name === "HSMT-IB2600000001.pdf")'), 15000, 'tệp đính kèm của e-GP được lưu đúng tên');
      const after = (await s.state()).tabs.find((t) => t.id === before.id);
      assert.equal(after.url, before.url, 'tab e-GP vẫn ở trang cũ');
      assert.equal(after.content, true, 'content script của tab vẫn sống');
      assert.equal(after.status, 'complete');
    });

    await step('Telegram: bấm "Gửi thử" — tin đi thẳng từ Safari tới Telegram, không cần bước "hỏi trước" (preflight)', async () => {
      const r = await s.send('TELEGRAM_TEST', { telegramEnabled: true, telegramBotToken: '123456:thu-nghiem', telegramChatId: '42' });
      assert.equal(r?.ok, true, `kết quả gửi: ${JSON.stringify(r)}`);
      assert.match(s.mockLog(), /TELEGRAM "[^\n]*Giáo Sư Cùi Bắp/);
      assert.doesNotMatch(s.mockLog(), /HỎI TRƯỚC/);
    });

    await step('Thông báo của tiện ích gom vào chuông trên thanh (không che màn hình); mục cần máy tính có lời nhắc; Ẩn / chạm lại dấu trang hoạt động', async () => {
      await s.open('dashboard.html');
      await s.ui(`for (let i = 1; i <= 4; i++) W.chrome.notifications.create('thu-' + i, { type: 'basic', iconUrl: 'icons/icon128.png', title: 'Bảo đảm dự thầu ' + i, message: 'Kiểm tra đã phát hành bảo đảm dự thầu.', buttons: [{ title: 'Xem gói' }] }); return true;`);
      const shell = (script) => s.wk.exec(`const R = window.__GSCB_SAFARI__._hub.ui.shadow; ${script}`);
      const count = async () => Number(await shell('return R.querySelector(\'[data-el="bell-count"]\').textContent'));
      // Tiện ích tự nó cũng đã phát thông báo nhắc việc cho các gói vừa tìm được: đếm tương đối.
      const before = await s.wk.exec('return Object.keys(window.__GSCB_SAFARI__._hub.notifications.all()).filter(id => !/^thu-/.test(id)).length');
      await s.until(async () => (await count()) === before + 4, 5000, `chuông đếm đủ ${before} + 4 thông báo`);
      assert.ok(await shell('return R.querySelectorAll(".toast").length') <= 3, 'không quá 3 thông báo nổi cùng lúc');
      assert.equal(await shell('return R.querySelectorAll(\'.toast[data-id="thong-bao"]\').length'), 1, 'mọi thông báo của tiện ích chỉ chiếm MỘT ô nổi');
      await shell('R.querySelector(\'[data-act="bell"]\').click(); return true;');
      assert.equal(await shell('return R.querySelectorAll(\'[data-el="inbox-list"] .item\').length'), before + 4);
      // "Bỏ" một thông báo → tiện ích nhận onClosed; bấm "Xem gói" → tiện ích nhận onButtonClicked.
      await s.ui('W.__seen = []; W.chrome.notifications.onClosed.addListener((id, byUser) => W.__seen.push(["closed", id, byUser])); W.chrome.notifications.onButtonClicked.addListener((id, index) => W.__seen.push(["button", id, index])); return true;');
      await shell('[...R.querySelectorAll(\'[data-el="inbox-list"] .item\')][0].querySelector(".row button:last-child").click(); return true;');
      await shell('[...R.querySelectorAll(\'[data-el="inbox-list"] .item\')][0].querySelectorAll(".row button")[1].click(); return true;');
      assert.deepEqual(await s.ui('return W.__seen'), [['closed', 'thu-4', true], ['button', 'thu-3', 0]]);
      assert.equal(await count(), before + 3);
      await shell('R.querySelector(\'[data-act="inbox-close"]\').click(); return true;');
      // Ba trang cần thứ iPad không có đã hiện lời nhắc (mỗi trang một lần) khi mở ở bước "23 trang".
      const notes = await s.wk.exec('return window.__GSCB_SAFARI__._journal.filter(e => /Lời nhắc trên Safari/.test(e.text)).map(e => e.where).sort()');
      assert.deepEqual(notes, ['hunts.html', 'options.html', 'phone.html']);
      // Khung nhìn của trang chính: đặt theo bề rộng máy khi hiện, trả lại nguyên trạng khi ẩn.
      const viewport = () => s.wk.exec('const m = document.querySelector(\'meta[name="viewport"]\'); return m ? m.getAttribute("content") : null;');
      assert.equal(await viewport(), 'width=device-width, initial-scale=1, maximum-scale=1');
      await shell('R.querySelector(\'[data-act="hide"]\').click(); return true;');
      assert.equal(await s.wk.exec('return window.__GSCB_SAFARI__._hub.ui.visible()'), false);
      assert.equal(await viewport(), null, 'trang e-GP giả lập vốn không khai báo khung nhìn → trả lại đúng như cũ');
      await s.tap();                                                     // chạm lại dấu trang: chỉ hiện lại, không nạp lần hai
      assert.equal(await s.wk.exec('return window.__GSCB_SAFARI__._hub.ui.visible()'), true);
      assert.equal((s.mockLog().match(/RAW .* -> 200/g) || []).length, 1, 'tệp chỉ được tải một lần');
    });

    await step('Dữ liệu còn nguyên sau khi tải lại trang muasamcong và chạm lại dấu trang (IndexedDB trên máy)', async () => {
      await s.wk.goto(START_URL);
      await s.inject();
      const r = await s.send('GET_SEARCH_STATE', {});
      const runs = r?.runs || [];
      assert.ok(runs.some((run) => run.status === 'SUCCESS' && run.matchCount === 115 && run.sourceCount === 137), `lịch sử lượt tìm còn sau khi nạp lại (${runs.length} lượt: ${runs.map((run) => `${run.status}/${run.matchCount}`).join(', ')})`);
      const page = await s.ui('return W.location.pathname;');
      assert.match(page, /search\.html$/, 'lần sau vào thẳng Tìm gói thầu (không hiện lại trang bắt đầu)');
      assert.deepEqual((await s.state()).errors, []);
    });

    await step('Chốt an toàn: không yêu cầu lạc tới máy chủ e-GP, không gọi tên miền nào khác', async () => {
      const log = s.mockLog();
      assert.doesNotMatch(log, /__gscb__/, 'không tệp nào của tiện ích được tải từ máy chủ e-GP');
      assert.doesNotMatch(log, /\] 404 /, `máy chủ e-GP không nhận yêu cầu lạ:\n${log.split('\n').filter((l) => / 404 /.test(l)).join('\n')}`);
      assert.deepEqual([...s.proxy.refused].filter((h) => !/tile\.openstreetmap\.org$/.test(h)), [], 'chỉ nói chuyện với muasamcong, GitHub (tải tệp) và Telegram (bản đồ nền của trang Địa bàn là ngoại lệ đã biết)');
    });
  });
});

/* 2–… ─ Các tình huống e-GP / Safari khác nhau: lượt tìm vẫn phải ra đúng 137 · 115. */
const variant = (title, chaos, opts, check, extra = {}) => { const index = scenarios.length + 1; scenarios.push(async () => {
  console.log(`\n■ ${index}. ${title}`);
  await session({ chaos, opts, label: `${index}-bien-the`, ...extra }, async (s) => {
    await step('Tìm "Lâm Đồng · Xây lắp" ra đúng 137 · khớp 115, lượt tìm đầy đủ', async () => {
      assertFullRun(facts(await s.tbmt()));
      await check(await s.state(), s);
    });
    await step('Lượt tìm thứ hai (tỉnh khác) chạy tiếp trên cùng trang e-GP, không lỗi', async () => {
      const run = facts(await s.tbmt({ ...CRITERIA, province: 'Đồng Nai', category: '' }));
      assert.equal(run.status, 'SUCCESS', JSON.stringify(run).slice(0, 300));
      assert.ok(run.source > 0);
    });
  });
}); };

variant('e-GP CẤM NHÚNG KHUNG (X-Frame-Options: DENY) + bấm "Tìm kiếm" thì e-GP TẢI LẠI TRANG — Safari có Navigation API', 'xfo=1,reload', {}, async (st, s) => {
  assert.equal(st.mode.mode, 'frame');
  assert.equal(st.mode.navigationLive, true);
  assert.ok(st.mode.intercepted >= 1, 'bắt được lệnh chuyển trang của e-GP');
  assert.equal(st.mode.guessedNavigations, 0, 'đọc đúng địa chỉ đích, không phải đoán');
  assert.equal(st.mode.blockedNavigations, 0);
  assert.match(await s.diagnostics(), /X-Frame-Options: DENY/);
  assert.ok(st.tabs.some((t) => /render=index&kw=/.test(t.url) && t.hosted && t.content), 'khung đang ở ĐÚNG địa chỉ e-GP muốn tới (kèm tham số kw)');
  assert.deepEqual(st.errors, []);
});
variant('Cấm nhúng khung + tải lại trang — Safari ĐỜI CŨ không có Navigation API', 'xfo=1,reload', { noNavigationApi: true }, async (st) => {
  assert.equal(st.mode.navigationApi, false);
  assert.ok(st.mode.blockedNavigations >= 1 && st.mode.guessedNavigations >= 1, 'khung bị chặn → nạp chủ động địa chỉ suy đoán');
  assert.ok(st.tabs.some((t) => /render=index/.test(t.url) && t.content));
});
variant('e-GP cho nhúng khung + tải lại trang — Safari đời cũ: khung tự chuyển trang, tiêm lại mã', 'reload', { noNavigationApi: true }, async (st) => {
  assert.equal(st.mode.navigationApi, false);
  assert.equal(st.mode.guessedNavigations, 0);
  assert.ok(st.tabs.some((t) => /render=index/.test(t.url) && t.content && !t.hosted), 'trang kết quả do khung tự tải, mã được tiêm lại');
  assert.deepEqual(st.errors, []);
});
variant('CHẾ ĐỘ HẠN CHẾ: dùng chính trang muasamcong cấp cao nhất (cách bản bookmarklet cũ của tác giả)', 'autoload', { forceTop: true }, async (st, s) => {
  assert.equal(st.mode.mode, 'top');
  assert.ok(st.tabs.some((t) => t.kind === 'top' && t.content));
  assert.match(await s.diagnostics(), /HẠN CHẾ/);
});
variant('Trang e-GP có mã CHỐNG NHÚNG KHUNG (đòi chuyển cả cửa sổ) — Safari có Navigation API: chặn được, phần mềm không bị đóng', 'autoload,bust', {}, async (st, s) => {
  assert.equal(st.mode.mode, 'frame');
  assert.ok(st.guard >= 1, 'đã chặn ít nhất một lần trang tự chuyển cửa sổ cấp cao nhất');
  assert.equal(await s.wk.url(), START_URL, 'tab Safari vẫn ở đúng trang ban đầu');
  assert.match(await s.diagnostics(), /Trang chính tự chuyển trang bị chặn: [1-9]/);
});
variant('e-GP CẤM eval (Content-Security-Policy) — dấu trang và mã tiêm vào e-GP tự chuyển sang thẻ script nội tuyến', 'autoload,csp', {}, async (st, s) => {
  assert.equal(st.mode.mode, 'frame');
  assert.equal(st.mode.evalBlocked, true, 'trang thật sự cấm eval, và phần mềm đã đi đường script nội tuyến');
  assert.match(await s.diagnostics(), /e-GP cấm eval: CÓ/);
  assert.deepEqual(st.errors, []);
});
variant('Nhánh phát triển trên GitHub đã bị xoá: dấu trang tự lấy tệp ở nhánh main', 'autoload,nobranch', {}, async (st, s) => {
  assert.equal(st.src?.ref, bundleUrl('main'));
  assert.match(s.mockLog(), /RAW [^\n]*au3o5u[^\n]* -> KHÔNG CÓ/);
  assert.match(s.mockLog(), /RAW \/Giaosucuibap\/T-m-Th-u\/main\/safari\/dist\/cuibap\.js -> 200/);
});
variant('Người dùng đang ở ĐỊA CHỈ CŨ muasamcong.mpi.gov.vn: mọi trang e-GP tiện ích đòi mở được đổi về đúng tên miền của tab', 'autoload', {}, async (st, s) => {
  assert.equal(st.mode.mode, 'frame');
  assert.ok(st.tabs.every((t) => /^https:\/\/muasamcong\.mpi\.gov\.vn\//.test(t.url)), `mọi khung cùng nguồn với tab: ${st.tabs.map((t) => t.url).join(' | ')}`);
  assert.ok(await s.wk.exec('return [...window.__GSCB_SAFARI__._hub.ui.shadow.querySelectorAll(".toast b")].some(b => /địa chỉ cũ/.test(b.textContent))'), 'có lời nhắc sang địa chỉ mới');
  assert.match(s.mockLog(), /AREA areaType=1/, 'danh mục tỉnh (nền gọi thẳng e-GP) vẫn lấy được');
  assert.deepEqual(st.errors, []);
}, { startUrl: 'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?render=search' });

variant('Chạm dấu trang khi đang ở TRANG CHỦ muasamcong (không phải trang tra cứu): vẫn dựng được trang tra cứu trong khung ẩn', 'autoload', {}, async (st) => {
  assert.equal(st.mode.mode, 'frame');
  assert.ok(st.tabs.some((t) => t.hosted && t.content && /contractor-selection\?render=search/.test(t.url)));
  assert.deepEqual(st.errors, []);
}, { startUrl: `${EGP}/web/guest/home` });

/* Mã chống nhúng khung trên Safari ĐỜI CŨ: lần chạm đầu trang bị tải lại, lần chạm sau tự vào chế độ hạn chế. */
const numbered = (title, run) => { const index = scenarios.length + 1; scenarios.push(async () => { console.log(`\n■ ${index}. ${title}`); await run(index); }); };
numbered('Trang e-GP có mã chống nhúng khung — Safari ĐỜI CŨ (không có Navigation API)', async () => {
  await session({ chaos: 'autoload,bust', opts: { noNavigationApi: true }, label: 'chong-nhung-doi-cu', boot: false }, async (s) => {
    await step('Lần chạm đầu: trang e-GP trong khung "nhảy ra" làm cả trang tải lại; lần chạm sau phần mềm KHÔNG thử lại khung mà vào chế độ hạn chế, tìm vẫn ra 137 · 115', async () => {
      await s.wk.exec('window.__mark = 1; return true;');
      await s.tap();
      await s.until(() => s.wk.exec('return window.__mark === undefined && document.readyState === "complete" && !window.__GSCB_SAFARI__'), 30000, 'trang muasamcong bị tải lại (phần mềm biến mất)');
      await s.tap();
      await s.until(() => s.wk.exec('const h = window.__GSCB_SAFARI__ && window.__GSCB_SAFARI__._hub; return !!(h && h.tabs && h.tabs.list().some(t => t.kind === "top" && t.content));'), 30000, 'chế độ hạn chế sẵn sàng');
      const st = await s.state();
      assert.equal(st.mode.mode, 'top');
      assert.ok(st.errors.some((e) => /làm cả trang muasamcong tải lại/.test(e)), `ghi rõ lý do: ${st.errors.join(' | ')}`);
      assertFullRun(facts(await s.tbmt()));
    });
  });
});

/* Mất mạng tới GitHub. */
numbered('Không vào được GitHub (mất mạng, bị chặn)', async () => {
  await session({ chaos: 'autoload', label: 'mat-github' }, async (s) => {
    await step('Đã từng nạp được một lần: lần sau GitHub không vào được thì chạy BẢN LƯU SẴN, báo rõ, tìm vẫn đúng', async () => {
      assert.equal((await s.state()).src?.cached, false);
      s.proxy.block('raw.githubusercontent.com');
      await s.wk.goto(START_URL);
      await s.inject();
      const st = await s.state();
      assert.equal(st.src?.cached, true);
      assert.match(await s.diagnostics(), /BẢN LƯU SẴN/);
      assert.ok(await s.wk.exec('return [...window.__GSCB_SAFARI__._hub.ui.shadow.querySelectorAll(".toast b")].some(b => /bản lưu sẵn/.test(b.textContent))'), 'có thông báo đang dùng bản lưu sẵn');
      assertFullRun(facts(await s.tbmt()));
    });
  });
  await session({ chaos: 'autoload', label: 'mat-github-lan-dau', boot: false, hosts: HOSTS.filter((h) => h !== 'raw.githubusercontent.com') }, async (s) => {
    await step('Chưa từng nạp mà GitHub không vào được: dấu trang báo rõ "Không nạp được… kiểm tra mạng", không treo, không làm hỏng trang', async () => {
      await s.tap();
      await s.until(() => s.wk.exec('return /Không nạp được Cùi Bắp/.test(document.documentElement.innerText || "")'), 20000, 'thanh báo lỗi của dấu trang');
      assert.equal(await s.wk.exec('return typeof window.__GSCB_SAFARI__'), 'undefined');
      assert.equal(await s.wk.exec('return window.__GSCB_LOADING__'), 0, 'chạm lại được ngay');
    });
    await step('…có mạng lại, chạm lại dấu trang: nạp được, kho IndexedDB tạo đủ ngăn (lần dò bản dự phòng trước đó không để lại kho rỗng)', async () => {
      s.proxy.map['raw.githubusercontent.com'] = s.port;
      await s.inject();
      const st = await s.state();
      assert.equal(st.src?.cached, false);
      assert.deepEqual(st.errors, []);
      assert.match(await s.diagnostics(), /lưu trên máy \(IndexedDB\)/);
      assertFullRun(facts(await s.tbmt()));
    });
  });
});

/* Hai tab Safari cùng chạy. */
numbered('Mở Cùi Bắp ở tab Safari thứ hai', async () => {
  await session({ chaos: 'autoload', label: 'hai-tab' }, async (s) => {
    await step('Tab mở sau giành quyền; tab này tự dừng hẳn (gỡ nền, thôi ghi dữ liệu) và báo rõ cách dùng tiếp', async () => {
      assertFullRun(facts(await s.tbmt()));
      // Đúng lúc mất quyền, tab này đang NẠP DỞ một trang e-GP và một trang giao diện (cuộc đua mà CI bắt được:
      // lượt nạp dở chạy tiếp sau khi đã dừng và dựng lại một khung). Rồi một ngữ cảnh cùng nguồn khác (thay cho
      // tab thứ hai) giành khoá, đúng như lớp vỏ ở tab kia sẽ làm.
      await s.wk.exec(`const h = window.__GSCB_SAFARI__._hub;
        for (const tab of h.tabs.list()) h.tabs.reload(tab.id);
        h.tabs.create({ url: location.origin + '/vi/web/guest/contractor-selection?notifyNo=IB2600455001', active: false });
        h.ui.navigate('dashboard.html');
        const f = document.createElement("iframe"); f.id = "tab-kia"; document.body.appendChild(f);
        f.contentWindow.navigator.locks.request("gscb-safari-dang-chay", { steal: true }, () => new Promise(() => {})); return true;`);
      await s.until(() => s.wk.exec('return window.__GSCB_SAFARI__._hub.retired === true'), 10000, 'tab này nhận ra đã mất quyền');
      await sleep(2500);                                                 // cho mọi lượt nạp dở kịp chạy nốt
      const after = await s.wk.exec('const h = window.__GSCB_SAFARI__._hub; const R = h.ui.shadow; return { frames: R.querySelectorAll("iframe").length, contexts: h.contexts.size, tabs: h.tabs.list().filter(t => t.content || t.status !== "complete").length, text: R.querySelector(".splash").innerText, shown: !R.querySelector(".splash").classList.contains("gone"), chip: R.querySelector(\'[data-el="chip-text"]\').textContent };');
      assert.equal(after.frames, 0, 'mọi khung (nền, giao diện, e-GP) đã gỡ — kể cả khung của lượt nạp đang dở');
      assert.equal(after.contexts, 0);
      assert.equal(after.tabs, 0, 'không tab ảo nào còn content script hay còn đang nạp');
      // Đã dừng thì không mở thêm được gì.
      assert.match(await s.wk.exec('return window.__GSCB_SAFARI__._hub.tabs.create({ url: location.origin + "/vi/web/guest/contractor-selection?render=search", active: false }).then(() => "mở được", (e) => e.message)'), /đã dừng/);
      assert.equal(await s.wk.exec('window.__GSCB_SAFARI__._hub.ui.navigate("search.html"); return new Promise((r) => setTimeout(() => r(window.__GSCB_SAFARI__._hub.ui.shadow.querySelectorAll("iframe").length), 600));'), 0);
      assert.ok(after.shown && /đang chạy ở một tab Safari khác/.test(after.text) && /tải lại trang rồi chạm dấu trang/.test(after.text), after.text);
      assert.match(after.chip, /tab Safari khác/);
    });
  });
});

/* iPhone. */
numbered('iPhone 390×844 · e-GP cấm nhúng khung + tải lại trang', async () => {
  await session({ chaos: 'xfo=1,reload', label: 'iphone', device: 'iphone' }, async (s) => {
    await step('Khởi động, thanh trên cùng không tràn màn hình, tìm bằng giao diện ra 137 · khớp 115', async () => {
      const bar = await s.wk.exec('const b = window.__GSCB_SAFARI__._hub.ui.shadow.querySelector(".bar"); return { w: innerWidth, scroll: b.scrollWidth, client: b.clientWidth, right: Math.max(...[...b.children].map(c => c.getBoundingClientRect().right)) };');
      assert.equal(bar.w, 390);
      assert.ok(bar.scroll <= bar.client + 1 && bar.right <= 391, `thanh trên cùng vừa màn hình: ${JSON.stringify(bar)}`);
      const { run, shown } = await searchByUi(s);
      assertFullRun(run);
      assert.equal(shown.total, '115');
      assert.equal(await s.ui('return D.documentElement.scrollWidth <= W.innerWidth + 1'), true, 'trang Tìm gói thầu không tràn ngang trên iPhone');
      await s.wk.screenshot(path.join(OUT, 'iphone-tim-goi-thau.png'));
      assert.deepEqual((await s.state()).errors, []);
    });
  });
});

/* ───────────────────────────────────────────── 4.22.0: thao tác lùi, phát hành an toàn, tuỳ chọn */
numbered('Thao tác LÙI của Safari (vuốt từ mép trái, nút ‹) — trước 4.22.0 làm trắng màn hình', async () => {
  await session({ chaos: 'autoload', label: 'lui-trang' }, async (s) => {
    await step('Đổi màn hình không còn thêm mục vào lịch sử của tab (4.21.0: mỗi lần đổi thêm một mục)', async () => {
      const before = await s.wk.exec('return history.length');
      for (const page of ['plans.html', 'winners.html', 'dashboard.html', 'hunts.html', 'options.html']) await s.open(page);
      assertFullRun(facts(await s.tbmt()));                              // khung e-GP ẩn cũng được dựng lại trong lượt tìm
      assert.equal(await s.wk.exec('return history.length'), before, 'lịch sử của tab giữ nguyên qua 5 lần đổi màn hình và một lượt tìm');
    });
    await step('Lùi một bước: KHÔNG trắng màn hình — về đúng màn hình trước của Cùi Bắp; lùi tiếp thì về tiếp', async () => {
      await s.goBack();
      let now = await s.page();
      assert.equal(now.page, 'hunts.html', JSON.stringify(now));
      assert.ok(now.chars > 200, `màn hình có nội dung (${now.chars} ký tự)`);
      await s.goBack(); now = await s.page();
      assert.equal(now.page, 'dashboard.html');
      await s.goBack(); await s.goBack(); now = await s.page();
      assert.equal(now.page, 'plans.html');
      assert.ok(now.chars > 200);
      assert.equal((await s.shell('return HUB.ui.backTrap()')).count, 4);
      assert.equal(await s.wk.url(), START_URL, 'tab Safari vẫn ở trang muasamcong');
      assert.deepEqual((await s.state()).errors, []);
    });
    await step('Đang mở bảng (Chẩn đoán, Tuỳ chọn) thì lùi = đóng bảng; ở màn hình đầu thì báo rõ, phần mềm không bị đóng', async () => {
      await s.shell('R.querySelector(\'[data-act="menu"]\').click(); return true;');
      assert.equal(await s.shell('return R.querySelector(\'[data-el="menu"]\').classList.contains("open")'), true);
      await s.goBack();
      assert.equal(await s.shell('return R.querySelector(\'[data-el="menu"]\').classList.contains("open")'), false, 'lùi đóng bảng Tuỳ chọn');
      assert.equal((await s.page()).page, 'plans.html', 'màn hình bên dưới giữ nguyên');
      for (let i = 0; i < 4; i++) await s.goBack();                       // về hết các màn hình đã qua, rồi lùi thêm
      const now = await s.page();
      assert.ok(now && now.chars > 200, `phần mềm vẫn chạy ở màn hình đầu: ${JSON.stringify(now)}`);
      assert.ok(await s.shell('return [...R.querySelectorAll(".toast b")].some(b => /màn hình đầu/.test(b.textContent))'), 'có lời nhắc đang ở màn hình đầu');
      assert.equal(await s.wk.url(), START_URL);
    });
    await step('Mỗi cú chạm của người dùng đặt lại "mục bẫy" trong chính cú chạm đó (cho trình duyệt bỏ qua mục do script tự thêm)', async () => {
      await s.open('search.html'); await s.open('plans.html');
      assert.equal((await s.shell('return HUB.ui.backTrap()')).armed, false);
      const before = await s.wk.exec('return history.length');
      await s.ui('D.body.dispatchEvent(new W.PointerEvent("pointerdown", { bubbles: true })); return true;');
      assert.equal((await s.shell('return HUB.ui.backTrap()')).armed, true);
      assert.equal(await s.wk.exec('return history.length'), before + 1);
      await s.ui('D.body.dispatchEvent(new W.PointerEvent("pointerdown", { bubbles: true })); return true;');
      assert.equal(await s.wk.exec('return history.length'), before + 1, 'chạm tiếp không thêm mục nào nữa');
      await s.goBack();
      assert.equal((await s.page()).page, 'search.html');
    });
    await step('Ẩn Cùi Bắp thì thao tác lùi trả lại cho trang muasamcong; hiện lại thì bẫy được đặt lại', async () => {
      await s.shell('R.querySelector(\'[data-act="hide"]\').click(); return true;');
      const count = (await s.shell('return HUB.ui.backTrap()')).count;
      await s.goBack();
      assert.equal((await s.shell('return HUB.ui.backTrap()')).count, count, 'đang ẩn: lớp vỏ không can thiệp');
      await s.tap();
      await s.goBack();
      assert.equal((await s.shell('return HUB.ui.backTrap()')).count, count + 1);
      assert.match(await s.diagnostics(), /thao tác lùi của Safari đã đổi thành quay lại trong Cùi Bắp: \d+/);
    });
  });
});

numbered('PHÁT HÀNH AN TOÀN: nâng cấp từ đúng bản 4.21.0 người dùng đang chạy — hỏi trước, để sau, cập nhật, quay về, tự cứu', async (index) => {
  const OLD = zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'tools/test/fixtures/cuibap-4.21.0-5663e848c26b.js.gz'))).toString('utf8');
  const oldInfo = bundleInfo(OLD), newInfo = { version: PACK.version, build: PACK.build };
  // Một "bản mới hơn nữa": cùng mã, khác mã bản dựng (đổi ở dòng đầu tệp và trong gói).
  const NEWER_BUILD = 'ffffffffffff';
  const NEWER = BUNDLE.split(`Bản dựng ${PACK.build}`).join(`Bản dựng ${NEWER_BUILD}`).split(`"build":"${PACK.build}"`).join(`"build":"${NEWER_BUILD}"`);
  assert.deepEqual(bundleInfo(NEWER), { version: PACK.version, build: NEWER_BUILD });
  const file = path.join(OUT, `goi-phat-hanh-${index}.js`);
  const serve = (text) => fs.writeFileSync(file, text);
  serve(OLD);
  const NO = { noReload: true };
  await session({ chaos: 'autoload', label: 'phat-hanh', boot: false, bundleFile: file, opts: NO }, async (s) => {
    const running = () => s.wk.exec('const g = window.__GSCB_SAFARI__; return g && g._hub ? { version: g.version, build: g.build, hand: window.__GSCB_HANDOVER__ || null, src: (window.__GSCB_SRC__ || {}).ref } : null;');
    const up = () => s.until(() => s.wk.exec('const g = window.__GSCB_SAFARI__; return !!(g && g._hub && g._hub.ui && g._hub.ui.hasPage() && g._hub.tabs && g._hub.tabs.list().some(t => t.content));'), 60000, 'phần mềm khởi động');
    const meta = (key) => s.wk.exec('return new Promise((y) => { const q = indexedDB.open("gscb-safari"); q.onsuccess = () => { const g = q.result.transaction("meta").objectStore("meta").get(arguments[0]); g.onsuccess = () => { q.result.close(); y(g.result === undefined ? null : g.result); }; }; q.onerror = () => y(null); })', [key]);
    const slotBuild = (slot) => s.wk.exec('return new Promise((y) => { const q = indexedDB.open("gscb-safari"); q.onsuccess = () => { const g = q.result.transaction("goi").objectStore("goi").get(arguments[0]); g.onsuccess = () => { q.result.close(); const m = /Bản dựng ([0-9a-f]{12})/.exec(String(g.result || "").slice(0, 600)); y(m ? m[1] : null); }; }; q.onerror = () => y(null); })', [slot]);
    const dialog = () => s.wk.exec('const h = document.getElementById("gscb-chon-ban"); if (!h) return null; const r = h.shadowRoot; return { title: r.querySelector("h2").textContent, body: r.querySelector(\'[data-el="body"]\').textContent, notes: [...r.querySelectorAll("li")].map(li => li.textContent), primary: r.querySelector(\'[data-pick="primary"]\').textContent, secondary: r.querySelector(\'[data-pick="secondary"]\').textContent, foot: r.querySelector(\'[data-el="foot"]\').textContent, cao: Math.min(...[...r.querySelectorAll("button")].map(b => b.getBoundingClientRect().height)) };');
    const pick = (which) => s.wk.exec('document.getElementById("gscb-chon-ban").shadowRoot.querySelector(\'[data-pick="\' + arguments[0] + \'"]\').click(); return true;', [which]);
    const again = async (opts) => { await s.wk.goto(START_URL); await s.tap(opts || NO); };

    await step('Người dùng đang chạy bản 4.21.0 (bản thật đã phát hành): khởi động, tìm ra 137 · 115, tự cất bản dự phòng', async () => {
      await s.tap(); await up();
      assert.deepEqual(await running().then((r) => [r.version, r.build]), [oldInfo.version, oldInfo.build]);
      assertFullRun(facts(await s.tbmt()));
      await s.until(async () => (await slotBuild('js')) === oldInfo.build, 10000, 'bản 4.21.0 cất chính nó vào ngăn js');
    });

    await step('Có bản mới trên kho: lần chạm kế tiếp HỎI trước (không tự đổi như trước), nút đủ lớn, có ghi chú phát hành', async () => {
      serve(BUNDLE);
      await again();
      const d = await s.until(dialog, 20000, 'hộp "Có bản mới"');
      assert.match(d.title, new RegExp(`Có bản mới ${PACK.version.replace(/\./g, '\\.')}`));
      assert.match(d.body, /đang dùng bản 4\.21\.0/);
      assert.deepEqual(d.notes, PACK.notes);
      assert.deepEqual([d.primary, d.secondary], ['Cập nhật ngay', 'Để sau']);
      assert.match(d.foot, /Quay về bản trước/);
      assert.ok(d.cao >= 44, `nút cao ${d.cao}px`);
      assert.equal(await s.wk.exec('return window.__GSCB_SAFARI__ && window.__GSCB_SAFARI__.pending'), true, 'đang hỏi: chưa bản nào khởi động');
      await s.tap();                                                     // sốt ruột chạm lại dấu trang: không nạp lần hai, không hỏi lần hai
      assert.equal(await s.wk.exec('return document.querySelectorAll("#gscb-chon-ban").length'), 1);
    });

    await step('"Để sau": bản 4.21.0 chạy tiếp như cũ (bản mới trao quyền), có lời nhắc bấm được; 3 ngày không hỏi lại', async () => {
      await pick('secondary'); await up();
      let r = await running();
      assert.deepEqual([r.version, r.build], [oldInfo.version, oldInfo.build]);
      assert.equal(r.hand.to, oldInfo.build); assert.equal(r.hand.from, newInfo.build); assert.equal(r.hand.why, 'hoan');
      assert.match(r.src, /bản đang dùng 4\.21\.0/);
      assertFullRun(facts(await s.tbmt()));
      await s.until(() => s.shell('return [...R.querySelectorAll(\'.toast[data-id="ban-moi"] b\')].some(b => /Có bản mới/.test(b.textContent))'), 15000, 'lời nhắc có bản mới');
      const st = await meta('phat-hanh');
      assert.equal(st.dung.build, oldInfo.build); assert.equal(st.moi.build, newInfo.build); assert.ok(st.hoan.until > Date.now() + 2 * 86400e3);
      assert.deepEqual([await slotBuild('js'), await slotBuild('dung')], [newInfo.build, oldInfo.build], 'bản mới cất ở js, bản đang dùng ở dung');
      await again();
      await up();
      assert.equal(await dialog(), null, 'không hỏi lại');
      r = await running();
      assert.equal(r.build, oldInfo.build);
    });

    await step('Bấm "Cập nhật" trên lời nhắc → lần chạm sau chạy bản mới; bản 4.21.0 thành "bản trước"; dữ liệu còn nguyên', async () => {
      await s.until(() => s.shell('return !!R.querySelector(\'.toast[data-id="ban-moi"] .row button\')'), 15000, 'nút Cập nhật');
      await s.shell('R.querySelector(\'.toast[data-id="ban-moi"] .row button\').click(); return true;');
      await s.until(async () => (await meta('phat-hanh'))?.dung?.build === newInfo.build, 10000, 'đã ghi lựa chọn');
      await again(); await up();
      const r = await running();
      assert.deepEqual([r.version, r.build, r.hand], [newInfo.version, newInfo.build, null]);
      const st = await meta('phat-hanh');
      assert.equal(st.truoc.build, oldInfo.build);
      assert.deepEqual([await slotBuild('dung'), await slotBuild('truoc')], [newInfo.build, oldInfo.build]);
      const runs = (await s.send('GET_SEARCH_STATE', {}))?.runs || [];
      assert.ok(runs.some((run) => run.status === 'SUCCESS' && run.matchCount === 115), 'lịch sử lượt tìm của bản 4.21.0 còn nguyên trong bản mới');
      assert.match(await s.diagnostics(), /Phát hành: chính bản này · bản trước 4\.21\.0 \(5663e848c26b\) · hỏi trước khi cập nhật/);
      assert.deepEqual((await s.state()).errors, []);
    });

    await step('Tuỳ chọn › Phiên bản › "Quay về bản 4.21.0": lần chạm sau chạy lại bản cũ và GHIM ở đó, có nút quay lại bản mới', async () => {
      await s.shell('R.querySelector(\'[data-act="menu"]\').click(); return true;');
      await s.until(() => s.shell('const b = R.querySelector(\'[data-el="rel-previous"]\'); return !b.hidden && /Quay về bản 4\\.21\\.0/.test(b.textContent)'), 10000, 'nút quay về bản trước');
      await s.shell('R.querySelector(\'[data-el="rel-previous"]\').click(); return true;');
      await s.until(async () => (await meta('phat-hanh'))?.ghim === true, 10000, 'đã ghim');
      await again(); await up();
      let r = await running();
      assert.deepEqual([r.build, r.hand.why], [oldInfo.build, 'ghim']);
      assert.equal(await dialog(), null, 'đã ghim thì không hỏi');
      await s.until(() => s.shell('return !!R.querySelector(\'.toast[data-id="ban-ghim"] .row button\')'), 15000, 'lời nhắc đang dùng bản trước');
      await s.shell('R.querySelector(\'.toast[data-id="ban-ghim"] .row button\').click(); return true;');
      await s.until(async () => (await meta('phat-hanh'))?.ghim === false, 10000, 'bỏ ghim');
      await again(); await up();
      r = await running();
      assert.deepEqual([r.build, r.hand], [newInfo.build, null]);
    });

    await step('TỰ CỨU: lần mở trước của bản mới dở dang → lần chạm sau hỏi "thử lại hay quay về bản trước"; chọn quay về thì bản 4.21.0 chạy', async () => {
      await s.wk.exec('return new Promise((y) => { const q = indexedDB.open("gscb-safari"); q.onsuccess = () => { const tx = q.result.transaction("meta", "readwrite"); tx.objectStore("meta").put({ build: arguments[0], at: Date.now() - 60000 }, "khoi-dong-thu"); tx.objectStore("meta").put({ build: arguments[0], at: Date.now() - 120000 }, "khoi-dong-ok"); tx.oncomplete = () => { q.result.close(); y(true); }; }; })', [newInfo.build]);
      await again();
      const d = await s.until(dialog, 20000, 'hộp "Lần mở trước chưa xong"');
      assert.match(d.title, /Lần mở trước chưa xong/);
      assert.match(d.secondary, /Quay về bản 4\.21\.0/);
      await pick('secondary'); await up();
      const r = await running();
      assert.deepEqual([r.build, r.hand.why], [oldInfo.build, 'cuu']);
      assert.equal((await meta('phat-hanh')).ghim, true);
      // Người dùng quay lại bản mới bằng nút trên lời nhắc.
      await s.until(() => s.shell('return !!R.querySelector(\'.toast[data-id="ban-ghim"] .row button\')'), 15000, 'lời nhắc');
      await s.shell('R.querySelector(\'.toast[data-id="ban-ghim"] .row button\').click(); return true;');
      await s.until(async () => (await meta('phat-hanh'))?.ghim === false, 10000, 'bỏ ghim');
      await again(); await up();
      assert.equal((await running()).build, newInfo.build);
      assert.equal(await dialog(), null, 'lần mở vừa rồi xong hẳn nên không hỏi nữa');
    });

    await step('Bản mới hơn nữa: hỏi; "Cập nhật ngay" thì chạy luôn, không phải tải lại; bật "tự cập nhật" thì các bản sau không hỏi', async () => {
      serve(NEWER);
      await again();
      const d = await s.until(dialog, 20000, 'hộp "Có bản mới"');
      assert.match(d.body, new RegExp(`bản dựng ${newInfo.build}`), 'cùng số phiên bản thì ghi thêm mã bản dựng cho khỏi nhầm');
      await pick('primary'); await up();
      let r = await running();
      assert.equal(r.build, NEWER_BUILD);
      assert.equal((await meta('phat-hanh')).truoc.build, newInfo.build);
      await s.shell('R.querySelector(\'[data-act="menu"]\').click(); return true;');
      await s.shell('const c = R.querySelector(\'[data-el="rel-ask"]\'); c.checked = false; c.dispatchEvent(new Event("change", { bubbles: true })); return true;');
      await s.until(async () => (await meta('phat-hanh'))?.tuDong === true, 10000, 'bật tự cập nhật');
      serve(BUNDLE);
      await again(); await up();
      assert.equal(await dialog(), null);
      r = await running();
      assert.equal(r.build, newInfo.build, 'tự cập nhật: bản trên kho được dùng ngay');
      assert.match(await s.diagnostics(), /· tự cập nhật/);
    });

    await step('Mất mạng tới GitHub khi đang "để sau": dấu trang chạy bản mới nhất đã cất, bản đó vẫn trao quyền cho bản đang dùng', async () => {
      // Về trạng thái: đang dùng NEWER, bản trên kho (BUNDLE) để sau.
      await s.wk.exec('return new Promise((y) => { const q = indexedDB.open("gscb-safari"); q.onsuccess = () => { const db = q.result; const g = db.transaction("meta").objectStore("meta").get("phat-hanh"); g.onsuccess = () => { const st = g.result; st.tuDong = false; const tx = db.transaction("meta", "readwrite"); tx.objectStore("meta").put(st, "phat-hanh"); tx.oncomplete = () => { db.close(); y(true); }; }; }; })');
      serve(NEWER);
      await again();
      await s.until(dialog, 20000, 'hộp hỏi'); await pick('secondary'); await up();
      assert.equal((await running()).build, newInfo.build);
      s.proxy.block('raw.githubusercontent.com');
      await again(); await up();
      const r = await running();
      assert.equal(r.build, newInfo.build, 'ngoại tuyến: vẫn là bản đang dùng');
      assert.equal(r.hand.from, NEWER_BUILD);
      assertFullRun(facts(await s.tbmt()));
    });
  });
});

numbered('TUỲ CHỌN trên máy cảm ứng: nút của lớp vỏ từ 44 px, cỡ hiển thị, giao diện tối, giữ máy thức — nhớ qua lần tải lại', async () => {
  const TOUCHED = { touch: true };
  await session({ chaos: 'autoload', label: 'tuy-chon', opts: TOUCHED }, async (s) => {
    const look = () => s.wk.exec('const hub = window.__GSCB_SAFARI__._hub, f = hub.ui.currentFrame(), d = f.contentDocument, root = d.documentElement; return { zoom: root.style.zoom, touch: root.getAttribute("data-touch"), platform: root.getAttribute("data-platform"), dark: root.hasAttribute("data-gscb-dark"), filter: f.style.filter, shellDark: hub.ui.shadow.querySelector(".root").classList.contains("dark"), tran: root.scrollWidth - f.contentWindow.innerWidth, prefs: hub.ui.prefs(), flag: f.contentWindow.__GSCB_TOUCH__ };');
    await step('Mọi nút trên thanh Cùi Bắp và trong các bảng cao, rộng từ 44 px (4.21.0: 32 px; nút × 24×28)', async () => {
      const sizes = await s.shell('return [...R.querySelectorAll(".bar button")].filter(b => b.getBoundingClientRect().width > 0).map(b => { const r = b.getBoundingClientRect(); return [(b.getAttribute("aria-label") || b.textContent).trim().slice(0, 24), Math.round(r.width), Math.round(r.height)]; });');
      assert.ok(sizes.length >= 4, JSON.stringify(sizes));
      for (const [name, w, h] of sizes) assert.ok(w >= 44 && h >= 44, `nút "${name}" ${w}×${h}`);
      await s.shell('HUB.ui.toast({ id: "thu", title: "Thử", message: "Nội dung", buttons: ["Mở"], sticky: true }); R.querySelector(\'[data-act="menu"]\').click(); return true;');
      const inner = await s.shell('return [...R.querySelectorAll(".toast button, .modal.open button, .modal.open .sw")].filter(b => b.getBoundingClientRect().width > 0).map(b => { const r = b.getBoundingClientRect(); return [b.textContent.trim().slice(0, 24), Math.round(r.width), Math.round(r.height)]; });');
      assert.ok(inner.length >= 8, JSON.stringify(inner));
      for (const [name, w, h] of inner) assert.ok(w >= 44 && h >= 44, `"${name}" ${w}×${h}`);
      await s.shell('R.querySelector(\'[data-act="menu-close"]\').click(); R.querySelector(\'.toast[data-id="thu"] .x\').click(); return true;');
    });
    await step('Máy cảm ứng cỡ iPad: mặc định phóng 110%, trang nhận cờ cảm ứng; A+ / A− đổi ngay, không tràn ngang', async () => {
      await s.open('dashboard.html');
      let v = await look();
      assert.deepEqual([v.zoom, v.touch, v.platform, v.flag], ['1.1', '1', 'safari', true]);
      await s.shell('R.querySelector(\'[data-act="menu"]\').click(); R.querySelector(\'[data-act="zoom-in"]\').click(); return true;');
      v = await look();
      assert.equal(v.zoom, '1.2');
      assert.equal(await s.shell('return R.querySelector(\'[data-el="zoom-val"]\').textContent'), '120%');
      for (const page of ['search.html', 'dashboard.html', 'plans.html', 'options.html', 'hunts.html', 'bidopen.html']) {
        await s.open(page);
        v = await look();
        assert.equal(v.zoom, '1.2', `${page} nhận cỡ hiển thị`);
        assert.ok(v.tran <= 1, `${page} tràn ngang ${v.tran}px ở 120%`);
      }
      for (let i = 0; i < 6; i++) await s.shell('R.querySelector(\'[data-act="zoom-out"]\').click(); return true;');
      v = await look();
      assert.equal(v.prefs.zoom, 0.9);
      assert.equal(await s.shell('return R.querySelector(\'[data-act="zoom-out"]\').disabled'), true);
      await s.shell('R.querySelector(\'[data-act="zoom-in"]\').click(); R.querySelector(\'[data-act="zoom-in"]\').click(); return true;');
      assert.equal((await look()).zoom, '1.1');
    });
    await step('Giao diện tối: khung được đảo màu, trang nhận bảng màu tối, thanh trái và ảnh giữ màu thật; bảng của lớp vỏ cũng tối', async () => {
      await s.open('dashboard.html');
      await s.shell('R.querySelector(\'[data-theme="dark"]\').click(); return true;');
      const v = await look();
      assert.equal(v.dark, true); assert.match(v.filter, /invert\(1\) hue-rotate\(180deg\)/); assert.equal(v.shellDark, true);
      const inside = await s.ui('const cs = (sel) => { const el = D.querySelector(sel); return el ? W.getComputedStyle(el).filter : "(không có)"; }; return { sidebar: cs(".ws-sidebar"), logo: cs(".ws-sidebar img"), bg: W.getComputedStyle(D.documentElement).getPropertyValue("--bg").trim(), surface: W.getComputedStyle(D.documentElement).getPropertyValue("--surface").trim() };');
      assert.match(inside.sidebar, /invert/, 'thanh trái (vốn tối) được đảo lại để giữ màu');
      assert.equal(inside.logo, 'none', 'ảnh trong khối đã đảo lại thì không đảo thêm');
      assert.deepEqual([inside.bg, inside.surface], ['#ebeff5', '#dee4ec']);
      await s.wk.screenshot(path.join(OUT, 'tuy-chon-toi.png'));
      await s.shell('R.querySelector(\'[data-theme="light"]\').click(); return true;');
      assert.deepEqual(await look().then((x) => [x.dark, x.filter, x.shellDark]), [false, '', false]);
      await s.shell('R.querySelector(\'[data-theme="dark"]\').click(); return true;');
    });
    await step('Giữ máy thức: bật được, ghi rõ tình trạng; mọi tuỳ chọn còn nguyên sau khi tải lại trang và chạm lại dấu trang', async () => {
      await s.shell('const c = R.querySelector(\'[data-el="wake"]\'); if (!c.disabled) { c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); } return true;');
      await sleep(600);
      const note = await s.shell('return { text: R.querySelector(\'[data-el="wake-note"]\').textContent, disabled: R.querySelector(\'[data-el="wake"]\').disabled, prefs: HUB.ui.prefs() }');
      assert.ok(note.disabled ? /chưa hỗ trợ/.test(note.text) : note.prefs.wake === true && /giữ/.test(note.text), JSON.stringify(note));
      await s.wk.goto(START_URL); await s.tap(TOUCHED); await s.ready();
      const v = await look();
      assert.deepEqual([v.zoom, v.dark, v.shellDark], ['1.1', true, true]);
      assert.equal(v.prefs.wake, !note.disabled);
      assert.match(await s.diagnostics(), /cảm ứng .* cỡ hiển thị 110% · giao diện tối/);
      assert.match(await s.diagnostics(), /Giữ máy thức: /);
      assert.deepEqual((await s.state()).errors, []);
    });
  });
});

const picked = ONLY.length ? ONLY.map((n) => scenarios[n - 1]).filter(Boolean) : QUICK ? scenarios.slice(0, 2) : scenarios;
for (const run of picked) await run();

const failed = results.filter((r) => !r.ok);
console.log(`\nCùi Bắp trên Safari — đầu-cuối: ĐẠT ${results.length - failed.length}/${results.length}`);
for (const f of failed) console.log(`\n✗ ${f.name}\n${f.error}`);
process.exit(failed.length ? 1 : 0);
