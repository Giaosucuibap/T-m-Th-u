/* ============================================================================
 *  BÀI ĐO "BẢNG ĐỌC ĐƯỢC + Ô TỈNH/THÀNH GỢI Ý ĐÚNG" — nhân Safari, dữ liệu giống thật (4.23.0)
 *
 *  node tools/test/bang-doc-duoc.mjs [--thiet-bi ipad,ipad-ngang,iphone] [--chup <thư mục>] [--co 1.1] [--goi <tệp gói đã phát hành>]
 *
 *  Hai lỗi người dùng chụp trên iPad thật ngày 21/11/2026 đã lọt qua 80 phép kiểm của 4.22.0 vì
 *  dữ liệu thử quá sạch. Bài này chạy ĐÚNG mã dấu trang trong nhân Safari với e-GP giả lập ở chế
 *  độ `real` (tên pháp nhân 40–75 ký tự, 34 tỉnh/thành kèm tên cũ, lọc thật theo mã tỉnh), đi
 *  qua từng màn hình có bảng bằng chính giao diện (gõ, chạm), rồi ĐO từng bảng — xem các loại vi
 *  phạm ở tools/test/audit-bang.mjs. Kèm kiểm ô tỉnh/thành: gõ "thành phố đồng" (đúng chuỗi
 *  trong ảnh) phải ra Thành phố Đồng Nai, chọn rồi tìm phải chỉ ra gói của Đồng Nai.
 *
 *  Cỡ máy: iPad Pro 13" trong Safari — dọc 1032×1244 (đúng máy của người dùng), ngang 1376×900; iPhone 390×844;
 *  cờ cảm ứng bật, mức phóng mặc định của bản Safari (110% trên iPad). Không yêu cầu nào ra Internet.
 * ========================================================================== */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openWebKit, webkitAvailable, DEVICES } from './webkit-driver.mjs';
import { startMapProxy } from './map-proxy.mjs';
import zlib from 'node:zlib';
import { buildPack, bookmarklet, bundleInfo } from '../../safari/build.mjs';
import { AUDIT_BODY, describeProblem } from './audit-bang.mjs';
import { REAL_CONTRACTORS } from './mock-real.mjs';
import { sortValue } from '../../GiaoSuCuiBap/lib/table-sort.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name, fallback = '') => (process.argv.includes(name) ? String(process.argv[process.argv.indexOf(name) + 1]) : fallback);
const OUT = path.join(ROOT, 'test-results', 'bang-doc-duoc');
const SHOTS = arg('--chup');
const ZOOM = arg('--co');
fs.mkdirSync(OUT, { recursive: true });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
/* Cỡ iPad lấy đúng theo máy của người dùng: hai ảnh chụp ngày 21/11/2026 là 2064×2752 điểm ảnh = 1032×1376 điểm
   (iPad Pro 13 inch), trong đó thanh trạng thái, thanh địa chỉ và thanh tab của Safari chiếm 132 điểm phía trên. Phần
   trang web thật sự thấy được là 1032×1244 khi cầm dọc và 1376×900 khi xoay ngang — chiều cao này quyết định danh sách
   gợi ý có đủ chỗ hay không. */
const ALL_DEVICES = {
  ipad: { ...DEVICES.ipad, name: 'iPad Pro 13" dọc trong Safari (1032×1244)', width: 1032, height: 1244 },
  'ipad-ngang': { ...DEVICES.ipad, name: 'iPad Pro 13" ngang trong Safari (1376×900)', width: 1376, height: 900 },
  iphone: DEVICES.iphone
};
const WANTED = arg('--thiet-bi', 'ipad,ipad-ngang,iphone').split(',').filter((d) => ALL_DEVICES[d]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOSTS = ['muasamcong.mof.gov.vn', 'muasamcong.mpi.gov.vn', 'raw.githubusercontent.com', 'api.telegram.org'];
const START_URL = 'https://muasamcong.mof.gov.vn/vi/web/guest/contractor-selection?render=search';
const MARK = bookmarklet().replace(/^javascript:/, '');
const TAX = REAL_CONTRACTORS[0].taxCode;

if (!webkitAvailable()) {
  console.error('Thiếu WebKit (apt-get install webkit2gtk-driver matchbox-window-manager).');
  process.exit(process.env.GSCB_REQUIRE_WEBKIT ? 1 : 0);
}
const BUNDLE_FILE = path.join(OUT, 'cuibap-dang-thu.js');
/* Mặc định đo MÃ NGUỒN hiện tại. `--goi <tệp>` đo một tệp gói đã phát hành (nhận cả .gz) — dùng để lấy mốc "trước khi
   sửa": chạy bài này trên bản 4.22.0 thật (tools/test/fixtures/cuibap-4.22.0-081028c6ffac.js.gz) phải ra vi phạm. */
const GOI = arg('--goi');
let BUNDLE, PACK;
if (GOI) {
  const raw = fs.readFileSync(path.resolve(GOI));
  BUNDLE = (GOI.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString('utf8');
  PACK = bundleInfo(BUNDLE);
} else ({ code: BUNDLE, pack: PACK } = buildPack());
fs.writeFileSync(BUNDLE_FILE, BUNDLE);

const checks = [];      // {device, name, ok, error}
const problems = [];    // vi phạm bố cục
const views = [];       // {device, view, tables}
let nextPort = Number(process.env.MOCK_PORT || 9760);

async function run(deviceKey) {
  const device = ALL_DEVICES[deviceKey];
  const port = nextPort++;
  const logFile = path.join(OUT, `mock-${deviceKey}.log`);
  const logFd = fs.openSync(logFile, 'w');
  const mock = spawn('node', [path.join(ROOT, 'tools/test/mock-egp.mjs')], { env: { ...process.env, MOCK_PORT: String(port), MOCK_CHAOS: 'autoload,real', MOCK_BUNDLE: BUNDLE_FILE }, stdio: ['ignore', logFd, logFd] });
  for (let i = 0; i < 60 && !/giả lập chạy/.test(fs.readFileSync(logFile, 'utf8')); i++) await sleep(100);
  const proxy = await startMapProxy(Object.fromEntries(HOSTS.map((host) => [host, port])));
  const wk = await openWebKit(device, { args: [`--proxy=${proxy.url}`, '--ignore-tls-errors'] });
  const UI = 'const HUB = window.__GSCB_SAFARI__._hub; const W = HUB.ui.currentFrame().contentWindow; const D = W.document;';
  const ui = (script, args = []) => wk.exec(`${UI} ${script}`, args);
  const until = async (check, ms, what) => { const end = Date.now() + ms; for (;;) { const v = await check().catch(() => null); if (v) return v; if (Date.now() > end) throw new Error(`Hết hạn chờ: ${what}`); await sleep(300); } };
  const open = async (page) => {
    await wk.exec('window.__GSCB_SAFARI__._hub.ui.navigate(arguments[0]); return true;', [page]);
    await until(() => ui('return W.location.pathname.endsWith("/" + arguments[0]) && D.readyState === "complete";', [page]), 20000, `mở ${page}`);
    await sleep(600);
    await wk.exec('const R = window.__GSCB_SAFARI__._hub.ui.shadow; for (const x of R.querySelectorAll(".toast .x")) x.click(); return true;').catch(() => {});
  };
  const SET = 'const set = (id, v) => { const el = D.getElementById(id); el.value = v; el.dispatchEvent(new W.Event("input", { bubbles: true })); el.dispatchEvent(new W.Event("change", { bubbles: true })); };';
  let shot = 0;
  /** Đo mọi bảng đang hiện ở màn hình này; ghi vi phạm; chụp ảnh nếu được yêu cầu. */
  const audit = async (view) => {
    await sleep(450);
    const r = await ui(AUDIT_BODY);
    views.push({ device: deviceKey, view, page: r.page, tables: r.tables, overflow: r.overflow });
    for (const p of r.problems) problems.push({ device: deviceKey, view, ...p });
    if (SHOTS) {
      // Ảnh để duyệt bằng mắt: một ảnh đầu trang (biểu mẫu, ô số liệu), một ảnh đưa bảng đầu tiên vào giữa màn hình.
      shot++;
      const name = `${deviceKey}-${String(shot).padStart(2, '0')}-${view.replace(/[^a-z0-9]+/gi, '-')}`;
      await wk.screenshot(path.join(SHOTS, `${name}.png`)).catch(() => {});
      const has = await ui('D.documentElement.style.scrollBehavior = "auto"; const t = Array.from(D.querySelectorAll("main .table-scroll, main table, dialog[open] table")).find((x) => x.getClientRects().length); if (!t) return false; t.scrollIntoView({ block: "start" }); W.scrollBy(0, -150); return true;');
      if (has) { await sleep(250); await wk.screenshot(path.join(SHOTS, `${name}-bang.png`)).catch(() => {}); await ui('W.scrollTo(0, 0); return true;'); }
    }
    return r;
  };
  const check = async (name, fn) => {
    const t0 = Date.now();
    try { await fn(); checks.push({ device: deviceKey, name, ok: true }); console.log(`  ĐẠT  [${deviceKey}] ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
    catch (error) {
      checks.push({ device: deviceKey, name, ok: false, error: String(error?.message || error).slice(0, 900) });
      console.log(`  HỎNG [${deviceKey}] ${name}\n       ${String(error?.message || error).slice(0, 700)}`);
      if (SHOTS) await wk.screenshot(path.join(SHOTS, `${deviceKey}-loi-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 50)}.png`)).catch(() => {});
    }
  };
  const must = (cond, message) => { if (!cond) throw new Error(message); };
  /** Bấm các thẻ trong trang (data-tab) và đo sau mỗi thẻ. */
  const tabs = async (view, names) => {
    for (const name of names) {
      const ok = await ui('const b = D.querySelector(`[data-tab="${arguments[0]}"]`); if (!b) return false; b.click(); return true;', [name]);
      if (!ok) continue;
      await audit(`${view}-${name}`);
    }
  };

  try {
    console.log(`\n=== ${device.name} · nhân Safari ${wk.version} · bản dựng ${PACK.version} · ${PACK.build}`);
    await wk.goto(START_URL);
    const opts = { touch: true, ...(ZOOM ? { zoom: Number(ZOOM) } : {}) };
    await wk.exec(`window.__GSCB_OPTS__ = arguments[0]; ${MARK}; return true;`, [opts]);
    await until(() => wk.exec('const h = window.__GSCB_SAFARI__ && window.__GSCB_SAFARI__._hub; return !!(h && h.ui && h.ui.currentFrame() && h.tabs && h.tabs.list().some(t => t.content));'), 60000, 'Cùi Bắp khởi động');
    await sleep(800);

    /* ---------------------------------------------------------------- Ô TỈNH / THÀNH --- */
    await check('Ô tỉnh/thành: không còn dùng danh sách của trình duyệt; gõ "thành phố đồng" (đúng chuỗi trong ảnh iPad) ra Thành phố Đồng Nai đứng đầu', async () => {
      await open('search.html');
      const r = await ui(`
        const el = D.getElementById('province');
        el.focus(); el.value = 'thành phố đồng'; el.dispatchEvent(new W.Event('input', { bubbles: true }));
        const pop = D.querySelector('.sg-pop');
        const rows = Array.from(pop.querySelectorAll('.sg-opt'), (o) => o.querySelector('.sg-title').textContent);
        const first = pop.querySelector('.sg-opt');
        return { list: el.getAttribute('list'), role: el.getAttribute('role'), open: !pop.hidden, rows, head: (pop.querySelector('.sg-head') || {}).textContent || '',
          rowHeight: first ? Math.round(first.getBoundingClientRect().height) : 0, popWidth: Math.round(pop.getBoundingClientRect().width), inputWidth: Math.round(el.getBoundingClientRect().width),
          below: Math.round(pop.getBoundingClientRect().top - el.getBoundingClientRect().bottom), firstBelow: first ? Math.round(first.getBoundingClientRect().top - el.getBoundingClientRect().bottom) : -1,
          unit: el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1, view: D.documentElement.clientWidth, right: Math.round(pop.getBoundingClientRect().right), left: Math.round(pop.getBoundingClientRect().left),
          // Dòng đầu có thật sự NHÌN THẤY và CHẠM được không (không bị khung khác che, không bị cắt).
          hit: (() => { if (!first) return false; const q = first.getBoundingClientRect(); const at = D.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !!(at && pop.contains(at)); })() };
      `);
      must(r.list === null && r.role === 'combobox', `ô vẫn gắn danh sách của trình duyệt: ${JSON.stringify(r)}`);
      must(r.open && r.rows[0] === 'Thành phố Đồng Nai', `gợi ý đầu không phải Đồng Nai: ${JSON.stringify(r.rows.slice(0, 5))}`);
      must(r.rows.includes('Tỉnh Đồng Tháp'), `thiếu Đồng Tháp trong ${JSON.stringify(r.rows)}`);
      must(r.rowHeight >= 44, `dòng gợi ý cao ${r.rowHeight} px (cần ≥ 44 cho ngón tay)`);
      must(r.below >= 0 && r.below <= 14, `danh sách không nằm ngay dưới ô nhập (cách ${r.below} px)`);
      must(r.firstBelow > 0 && r.firstBelow < 110, `dòng gợi ý đầu cách ô nhập ${r.firstBelow} px`);
      must(r.hit, 'dòng gợi ý đầu bị che hoặc bị cắt, không chạm được');
      must(r.left >= -1 && r.right <= r.view * r.unit + 2, `danh sách tràn khỏi màn hình (trái ${r.left}, phải ${r.right}, màn hình ${Math.round(r.view * r.unit)})`);
      must(r.popWidth >= Math.min(296 * r.unit, r.inputWidth) - 2, `danh sách hẹp ${r.popWidth} px`);
    });
    if (deviceKey === 'ipad') await check('Bàn phím ảo trượt lên (mô phỏng theo ảnh iPad thật: vùng nhìn chỉ còn 841 điểm, 113 điểm dưới ô nhập): danh sách tự nằm trọn phía trên bàn phím', async () => {
      await open('search.html');
      // Ảnh 21/11/2026: màn hình 1376 điểm, Safari chiếm 132 điểm trên, bàn phím (kèm thanh gợi ý) bắt đầu ở điểm 973.
      const KEYBOARD_TOP = 973 - 132;
      const before = await ui(`
        const el = D.getElementById('province'); W.scrollTo(0, 0);
        el.focus(); el.value = 'thành phố đồng'; el.dispatchEvent(new W.Event('input', { bubbles: true }));
        const pop = D.querySelector('.sg-pop'); const frameTop = W.frameElement.getBoundingClientRect().top;
        return { open: !pop.hidden, frameTop: Math.round(frameTop), inputBottom: Math.round(el.getBoundingClientRect().bottom), popBottom: Math.round(pop.getBoundingClientRect().bottom) };
      `);
      must(before.open, 'danh sách chưa mở');
      const fake = await ui(`
        try { Object.defineProperty(W.top, 'visualViewport', { configurable: true, get: () => ({ offsetTop: 0, offsetLeft: 0, height: arguments[0], width: W.top.innerWidth, scale: 1, addEventListener() {}, removeEventListener() {} }) }); }
        catch (error) { return { failed: String(error) }; }
        W.dispatchEvent(new W.Event('resize'));
        return { height: W.top.visualViewport.height };
      `, [KEYBOARD_TOP]);
      must(!fake.failed && fake.height === KEYBOARD_TOP, `không mô phỏng được vùng nhìn: ${JSON.stringify(fake)}`);
      await sleep(250);
      const after = await ui(`
        const el = D.getElementById('province'), pop = D.querySelector('.sg-pop'); const limit = arguments[0] - W.frameElement.getBoundingClientRect().top;
        const e = el.getBoundingClientRect(), p = pop.getBoundingClientRect();
        const rows = Array.from(pop.querySelectorAll('.sg-opt'), (o) => o.getBoundingClientRect());
        const at = D.elementFromPoint(e.left + 24, e.top + 6);
        const first = rows[0] ? D.elementFromPoint(rows[0].left + rows[0].width / 2, rows[0].top + rows[0].height / 2) : null;
        return { limit: Math.round(limit), inputTop: Math.round(e.top), inputBottom: Math.round(e.bottom), popTop: Math.round(p.top), popBottom: Math.round(p.bottom), rows: rows.length, rowsVisible: rows.filter((r) => r.top >= 0 && r.bottom <= limit + 1).length,
          inputSeen: at === el, firstSeen: !!(first && pop.contains(first)), titles: Array.from(pop.querySelectorAll('.sg-opt .sg-title'), (o) => o.textContent) };
      `, [KEYBOARD_TOP]);
      await ui('try { delete W.top.visualViewport; } catch (error) {} D.getElementById("province").blur(); return true;');
      must(before.inputBottom + 200 > KEYBOARD_TOP - before.frameTop || after.popBottom <= after.limit + 1, 'tình huống thử không tái hiện được cảnh thiếu chỗ');
      must(after.inputSeen && after.inputTop >= 0, `ô nhập bị che sau khi đưa lên: ${JSON.stringify(after)}`);
      must(after.popBottom <= after.limit + 1, `danh sách còn nằm dưới bàn phím: đáy ${after.popBottom}, bàn phím bắt đầu ở ${after.limit}`);
      must(after.rows >= 3 && after.rowsVisible === after.rows && after.firstSeen, `chỉ thấy ${after.rowsVisible}/${after.rows} dòng gợi ý: ${JSON.stringify(after)}`);
      must(after.titles[0] === 'Thành phố Đồng Nai', `gợi ý đầu: ${after.titles[0]}`);
    });
    await check('Ô tỉnh/thành: gõ không dấu, viết tắt, tên tỉnh cũ đã sáp nhập đều ra đúng; chỉ gõ "tp" thì liệt kê 9 thành phố', async () => {
      const ask = (text) => ui(`
        const el = D.getElementById('province'); el.focus(); el.value = arguments[0]; el.dispatchEvent(new W.Event('input', { bubbles: true }));
        return Array.from(D.querySelectorAll('.sg-pop .sg-opt'), (o) => ({ t: o.querySelector('.sg-title').textContent, s: (o.querySelector('.sg-sub') || {}).textContent || '' }));
      `, [text]);
      const a = await ask('dong nai'); must(a.length && a[0].t === 'Thành phố Đồng Nai', `"dong nai" → ${JSON.stringify(a.slice(0, 3))}`);
      const b = await ask('hcm'); must(b.length && b[0].t === 'Thành phố Hồ Chí Minh', `"hcm" → ${JSON.stringify(b.slice(0, 3))}`);
      const c = await ask('binh phuoc');
      must(c.length >= 2 && c[0].t === 'Thành phố Đồng Nai' && /Bình Phước cũ/.test(c[0].s), `"binh phuoc" → ${JSON.stringify(c.slice(0, 3))}`);
      must(c.some((x) => x.t === 'Tỉnh Bình Phước' && /tên cũ/.test(x.s)), `"binh phuoc" thiếu tên cũ để tra hồ sơ trước sáp nhập: ${JSON.stringify(c)}`);
      const d = await ask('tp'); must(d.length === 9 && d.every((x) => /^Thành phố /.test(x.t)), `"tp" → ${d.length} dòng: ${JSON.stringify(d.map((x) => x.t))}`);
      const e = await ask('bình thuận'); must(e.length && e[0].t === 'Tỉnh Lâm Đồng', `"bình thuận" → ${JSON.stringify(e.slice(0, 3))}`);
      const f = await ask(''); must(f.length === 34, `để trống phải hiện đủ 34 tỉnh/thành, đang hiện ${f.length}`);
    });
    await check('Chọn "Thành phố Đồng Nai" bằng một chạm rồi bấm Tìm: e-GP chỉ được hỏi đúng mã tỉnh đó và mọi gói trả về đều ở Đồng Nai', async () => {
      const picked = await ui(`
        const el = D.getElementById('province'); el.focus(); el.value = 'thành phố đồng'; el.dispatchEvent(new W.Event('input', { bubbles: true }));
        D.querySelector('.sg-pop .sg-opt').click();
        return { value: el.value, open: !D.querySelector('.sg-pop').hidden };
      `);
      must(picked.value === 'Thành phố Đồng Nai' && !picked.open, `sau khi chọn: ${JSON.stringify(picked)}`);
      await ui(`${SET} set('category', 'XL'); D.getElementById('go').click(); return true;`);
      await until(() => ui('return D.querySelectorAll("#list article.ws-result").length > 0 && !D.getElementById("stop")?.offsetParent;'), 120000, 'thẻ kết quả');
      await sleep(900);
      const r = await ui(`
        const cards = Array.from(D.querySelectorAll('#list article.ws-result'));
        return { cards: cards.length, text: (D.querySelector('.results-meta, #run-summary, .run-strip') || D.body).innerText.replace(/\\s+/g, ' ').slice(0, 260), other: cards.filter((c) => !/Đồng Nai/.test(c.innerText)).length };
      `);
      must(r.cards > 0 && r.other === 0, `có ${r.other}/${r.cards} thẻ không thuộc Đồng Nai — ${r.text}`);
      const log = fs.readFileSync(logFile, 'utf8');
      must(/query\.filters=[^\n]*locations\.provCode/.test(log), 'e-GP giả lập không nhận được bộ lọc mã tỉnh');
      await audit('tim-goi-ket-qua');
    });
    await check('Bảng so sánh gói (Tìm gói thầu → chọn 3 gói → So sánh): đo', async () => {
      const n = await ui('const boxes = Array.from(D.querySelectorAll("#list [data-select]")).slice(0, 3); for (const b of boxes) b.click(); return boxes.length;');
      must(n >= 2, `chỉ chọn được ${n} gói`);
      await sleep(400);
      await ui('D.getElementById("compare").click(); return true;');
      await until(() => ui('return !!D.querySelector("#compare-dialog[open] table");'), 8000, 'bảng so sánh');
      await audit('so-sanh-goi');
      await ui('D.getElementById("compare-dialog").close(); return true;');
    });

    /* ------------------------------------------------------------ CÁC MÀN HÌNH CÓ BẢNG --- */
    await check('Hồ sơ chủ đầu tư (màn hình trong ảnh lỗi): dò "Đức Trọng", chọn đơn vị, đo cả 4 thẻ', async () => {
      await open('investor.html');
      await ui(`${SET} set('keyword', 'Đức Trọng'); set('province', 'Tỉnh Lâm Đồng'); D.getElementById('go').click(); return true;`);
      await until(() => ui('return D.querySelectorAll("#pick-list .pick").length > 0 || !D.getElementById("result").classList.contains("hidden");'), 90000, 'danh sách chủ đầu tư');
      await ui('const p = D.querySelector("#pick-list .pick"); if (p && D.getElementById("result").classList.contains("hidden")) (p.querySelector("button, a") || p).click(); return true;');
      await until(() => ui('return !D.getElementById("result").classList.contains("hidden") && D.querySelectorAll("#panel table tbody tr").length > 0;'), 120000, 'hồ sơ chủ đầu tư');
      const r = await audit('chu-dau-tu-contractors');
      must(r.tables.length >= 1 && r.tables[0].cols === 9, `không thấy bảng 9 cột: ${JSON.stringify(r.tables.map((t) => t.cols))}`);
      await tabs('chu-dau-tu', ['years', 'forms', 'packages', 'contractors']);
    });
    await check('Chạm tiêu đề "Giá trị trúng": bảng xếp từ lớn tới nhỏ, chạm lần nữa thì đảo chiều; ô không có số liệu nằm cuối; số dòng giữ nguyên', async () => {
      const r = await ui(`
        const t = D.querySelector('#panel table'); const th = Array.from(t.querySelectorAll('thead th')).find((x) => /Giá trị trúng/.test(x.textContent));
        const read = () => Array.from(t.tBodies[t.tBodies.length - 1].rows, (row) => row.cells[th.cellIndex].firstChild.textContent.trim());
        const names = () => Array.from(t.tBodies[t.tBodies.length - 1].rows, (row) => row.cells[0].firstChild.textContent.trim()).sort().join('|');
        const before = read(), who = names();
        th.click(); const down = read(), sortDown = th.getAttribute('aria-sort');
        th.click(); const up = read(), sortUp = th.getAttribute('aria-sort');
        return { sortable: th.classList.contains('fit-sort'), before, down, up, sortDown, sortUp, same: who === names() };
      `);
      must(r.sortable && r.sortDown === 'descending' && r.sortUp === 'ascending', `tiêu đề chưa sắp xếp được: ${JSON.stringify({ sortable: r.sortable, a: r.sortDown, b: r.sortUp })}`);
      must(r.down.length === r.before.length && r.up.length === r.before.length && r.same, 'sắp xếp làm mất hoặc đổi dòng');
      const nums = (list) => list.map((x) => sortValue(x)).filter((v) => v.kind === 'number').map((v) => v.n);
      const emptiesLast = (list) => { const kinds = list.map((x) => sortValue(x).kind); return kinds.lastIndexOf('number') < (kinds.indexOf('empty') < 0 ? Infinity : kinds.indexOf('empty')); };
      const d = nums(r.down), u = nums(r.up);
      must(d.length >= 4 && d.every((x, i) => i === 0 || d[i - 1] >= x), `chưa giảm dần: ${JSON.stringify(r.down.slice(0, 6))}`);
      must(u.every((x, i) => i === 0 || u[i - 1] <= x), `chưa tăng dần: ${JSON.stringify(r.up.slice(0, 6))}`);
      must(emptiesLast(r.down) && emptiesLast(r.up), `ô trống không nằm cuối: ${JSON.stringify([r.down.slice(-3), r.up.slice(-3)])}`);
    });
    await check('Nhà thầu trúng thầu theo mã số thuế: bảng 9 cột', async () => {
      await open('winners.html');
      await ui(`${SET} set('q', arguments[0]); D.getElementById('go').click(); return true;`, [TAX]);
      await until(() => ui('return D.querySelectorAll("#rows tr").length > 0;'), 120000, 'bảng gói trúng thầu');
      await audit('trung-thau');
    });
    await check('Phân tích địa bàn: Lâm Đồng, đo cả 4 thẻ', async () => {
      await open('market.html');
      await ui(`${SET} set('province', 'Tỉnh Lâm Đồng'); set('investor', 'Đức Trọng'); D.getElementById('go').click(); return true;`);
      await until(() => ui('return !D.getElementById("result").classList.contains("hidden") && D.querySelectorAll("#panel table tbody tr").length > 0;'), 150000, 'kết quả phân tích địa bàn');
      await audit('dia-ban-mac-dinh');
      await tabs('dia-ban', ['pairs', 'contractors', 'investors', 'pricing']);
    });
    await check('Mở thầu · Chờ kết quả: quét, đọc biên bản, đo bảng nhà thầu dự', async () => {
      await open('bidopen.html');
      await ui(`${SET} set('province', 'Tỉnh Lâm Đồng'); const m = D.getElementById('maxPackages'); if (m) { m.value = '8'; m.dispatchEvent(new W.Event('change', { bubbles: true })); } D.getElementById('go').click(); return true;`);
      await until(() => ui('return D.querySelectorAll("#list table").length >= 3;'), 240000, 'bảng nhà thầu dự thầu');
      await ui('const s = D.getElementById("stop"); if (s && s.offsetParent) s.click(); return true;');
      await sleep(1200);
      await audit('mo-thau');
    });
    await check('Hồ sơ nhà thầu 360°: đo các thẻ', async () => {
      await open('profile.html');
      await ui(`${SET} set('mst', arguments[0]); D.getElementById('go').click(); return true;`, [TAX]);
      await until(() => ui('return !D.getElementById("result").classList.contains("hidden") && D.querySelectorAll("#panel table tbody tr").length > 0;'), 150000, 'hồ sơ 360°');
      await audit('ho-so-360-mac-dinh');
      await tabs('ho-so-360', ['years', 'provinces', 'entities', 'packages', 'joined']);
    });
    await check('Kế hoạch lựa chọn nhà thầu: tra Lâm Đồng, mở thẻ đầu, đo bảng gói trong kế hoạch', async () => {
      await open('plans.html');
      await ui(`${SET} set('province', 'Tỉnh Lâm Đồng'); D.getElementById('go').click(); return true;`);
      await until(() => ui('return D.querySelectorAll("main .plan").length > 0 && !D.getElementById("stop")?.offsetParent;'), 150000, 'thẻ kế hoạch');
      await sleep(800);
      await audit('ke-hoach');
    });
    await check('Các màn hình còn lại có bảng hoặc danh sách: mở và đo', async () => {
      for (const page of ['analytics.html', 'contractors.html', 'dashboard.html', 'diagnostics.html', 'hunts.html', 'rivals.html', 'forecast.html', 'brief.html', 'options.html', 'checklist.html', 'capability.html', 'contracts.html', 'timeline.html', 'outline.html']) {
        await open(page);
        if (page === 'analytics.html') await ui(`${SET} const m = D.getElementById('mst'); if (m) { set('mst', arguments[0]); D.getElementById('goProfile').click(); } const g = D.getElementById('goDiscount'); if (g) g.click(); const rel = D.getElementById('goRel'); if (rel) rel.click(); return true;`, [TAX]).then(() => sleep(1500));
        if (page === 'contractors.html') await ui(`${SET} const q = D.getElementById('q'); if (q) { set('q', arguments[0]); D.getElementById('btn').click(); } return true;`, [TAX]).then(() => sleep(1200));
        await audit(page.replace('.html', ''));
      }
    });
    await check('Bảng có một từ không ngắt được (tên tệp 70 ký tự liền): không đẩy trang rộng ra — bảng tự vào khung cuộn hoặc thành thẻ', async () => {
      await open('diagnostics.html');
      await ui(`
        const box = D.createElement('section'); box.className = 'card'; box.id = 'thu-tu-dai';
        const long = 'QD_phe_duyet_KQLCNT_goi_thau_so_03_xay_lap_kenh_chinh_ho_Da_Teh.signed.pdf';
        box.innerHTML = '<h3>Tệp đính kèm (bảng thử)</h3><table><thead><tr><th>Tên tệp</th><th>Ngày đăng</th><th>Dung lượng</th><th>Người đăng</th></tr></thead><tbody>'
          + [1, 2, 3, 4, 5].map((i) => '<tr><td>' + (i === 2 ? long : 'Thông báo mời thầu gói số 0' + i + ' — bản công bố trên e-GP') + '</td><td class="num">2' + i + '/11/2026</td><td class="num">' + (i * 318) + ' KB</td><td>Ban Quản lý dự án đầu tư xây dựng khu vực Đức Trọng</td></tr>').join('') + '</tbody></table>';
        D.querySelector('main').append(box); box.scrollIntoView({ block: 'center' }); return true;
      `);
      await sleep(500);
      const r = await ui(`
        const t = D.querySelector('#thu-tu-dai table'), box = t.closest('.table-scroll'), holder = D.getElementById('thu-tu-dai');
        const root = D.documentElement, hr = holder.getBoundingClientRect(), tr = t.getBoundingClientRect();
        return { overflow: Math.max(0, root.scrollWidth - root.clientWidth), fit: t.classList.contains('fit-on'), cards: t.classList.contains('fit-cards'), scroll: !!(box && box.classList.contains('can-scroll')),
          spill: Math.round(tr.right - hr.right), table: Math.round(tr.width), holder: Math.round(hr.width) };
      `);
      await ui('const x = D.getElementById("thu-tu-dai"); if (x) x.remove(); return true;');
      must(r.fit, `bảng chưa được dàn cột: ${JSON.stringify(r)}`);
      must(r.overflow <= 2, `trang bị đẩy rộng ${r.overflow} px: ${JSON.stringify(r)}`);
      must(r.cards || r.scroll || r.spill <= 2, `bảng tràn khỏi khung ${r.spill} px mà không có khung cuộn: ${JSON.stringify(r)}`);
    });
    await check('Ô tỉnh/thành ở MỌI màn hình có ô đó đều dùng danh sách riêng (không còn <datalist> của trình duyệt)', async () => {
      const missing = [];
      for (const page of ['search.html', 'plans.html', 'winners.html', 'market.html', 'investor.html', 'hunts.html', 'bidopen.html', 'forecast.html', 'rivals.html', 'contracts.html', 'analytics.html']) {
        await open(page);
        const r = await ui(`
          const el = D.querySelector('#province, [data-suggest="province"]'); if (!el) return { none: true };
          // Ô nằm trong một phần đang thu gọn (Phân tích thị trường › Kho lịch sử): mở phần đó ra như người dùng sẽ làm.
          for (let p = el.parentElement; p; p = p.parentElement) { if (p.tagName === 'DETAILS') p.open = true; if (p.hidden) p.hidden = false; p.classList && p.classList.remove('hidden'); }
          el.focus(); el.value = 'dong'; el.dispatchEvent(new W.Event('input', { bubbles: true }));
          const pop = el.parentElement.querySelector('.sg-pop');
          const rows = pop ? Array.from(pop.querySelectorAll('.sg-opt .sg-title'), (o) => o.textContent) : [];
          const firstRow = pop && pop.querySelector('.sg-opt');
          let hit = false;
          if (firstRow) { firstRow.scrollIntoView({ block: 'nearest' }); const q = firstRow.getBoundingClientRect(); const at = D.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); hit = !!(at && pop.contains(at)); }
          const edge = pop ? Math.round(pop.getBoundingClientRect().right - D.documentElement.getBoundingClientRect().right) : 0;
          const ward = D.getElementById('ward');
          el.value = ''; el.dispatchEvent(new W.Event('input', { bubbles: true })); el.blur();
          return { list: el.getAttribute('list'), combo: el.getAttribute('role') === 'combobox', shown: el.getClientRects().length > 0, focused: D.activeElement === el, rows, hit, edge, wardList: ward ? ward.getAttribute('list') : null, wardCombo: ward ? ward.getAttribute('role') === 'combobox' : null };
        `);
        if (r.none || r.list !== null || !r.combo || !r.rows.some((t) => /Đồng Nai/.test(t)) || !r.hit || r.edge > 2 || (r.wardCombo === false) || (r.wardList !== null && r.wardList !== undefined)) missing.push(`${page}: ${JSON.stringify(r).slice(0, 220)}`);
      }
      must(!missing.length, `còn màn hình chưa đạt:\n         ${missing.join('\n         ')}`);
    });
    await check('Ô xã/phường: chọn tỉnh xong có danh sách riêng, gõ "duc trong" (không dấu) ra Xã Đức Trọng', async () => {
      await open('search.html');
      await ui(`${SET} set('province', 'Tỉnh Lâm Đồng'); return true;`);
      await until(() => ui('return D.querySelectorAll("#ward-list option").length > 10;'), 30000, 'danh mục xã/phường');
      const r = await ui(`
        const el = D.getElementById('ward'); el.focus(); el.value = 'duc trong'; el.dispatchEvent(new W.Event('input', { bubbles: true }));
        const pop = el.parentElement.querySelector('.sg-pop');
        const rows = Array.from(pop.querySelectorAll('.sg-opt'), (o) => ({ t: o.querySelector('.sg-title').textContent, s: (o.querySelector('.sg-sub') || {}).textContent || '' }));
        if (rows.length) pop.querySelector('.sg-opt').click();
        return { rows: rows.slice(0, 4), value: el.value, total: D.querySelectorAll('#ward-list option').length };
      `);
      must(r.rows.length && r.rows[0].t === 'Xã Đức Trọng', `"duc trong" → ${JSON.stringify(r.rows)}`);
      must(/^Xã Đức Trọng · mã /.test(r.value), `giá trị sau khi chọn: ${r.value}`);
    });
  } finally {
    await wk.close().catch(() => {});
    await proxy.close();
    mock.kill();
  }
}

for (const key of WANTED) await run(key);

/* ------------------------------------------------------------------------ BÁO CÁO --- */
const tablesSeen = views.reduce((n, v) => n + v.tables.length, 0);
const byDevice = (key) => views.filter((v) => v.device === key);
console.log('\n================ KẾT QUẢ ================');
for (const key of WANTED) {
  const list = byDevice(key);
  const t = list.reduce((n, v) => n + v.tables.length, 0), scroll = list.reduce((n, v) => n + v.tables.filter((x) => x.scroll).length, 0), cards = list.reduce((n, v) => n + v.tables.filter((x) => x.cards).length, 0);
  const worst = Math.max(0, ...list.flatMap((v) => v.tables.map((x) => x.worstLines)));
  console.log(`${ALL_DEVICES[key].name}: ${list.length} màn hình, ${t} bảng đã đo, ${scroll} bảng phải cuộn ngang, ${cards} bảng hiện dạng thẻ, ô chữ dài nhất xuống ${worst} dòng, ${problems.filter((p) => p.device === key).length} vi phạm`);
}
if (problems.length) {
  console.log(`\nVI PHẠM BỐ CỤC (${problems.length}):`);
  for (const p of problems) console.log(`  ✗ [${p.device}] ${describeProblem(p)}`);
}
const failed = checks.filter((c) => !c.ok);
fs.writeFileSync(path.join(OUT, 'bao-cao.json'), JSON.stringify({ build: `${PACK.version} · ${PACK.build}`, devices: WANTED, checks, problems, views }, null, 1));
console.log(`\n${checks.length - failed.length}/${checks.length} phép kiểm đạt · ${tablesSeen} lượt đo bảng · ${problems.length} vi phạm bố cục · báo cáo: test-results/bang-doc-duoc/bao-cao.json`);
process.exit(failed.length || problems.length ? 1 : 0);
