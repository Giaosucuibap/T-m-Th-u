/* ============================================================================
 *  BẢN CHẠY THẲNG TRÊN SAFARI (iPad / iPhone) — bộ dựng, dấu trang, lớp vỏ
 *
 *  Dấu trang trên iPad tải safari/dist/cuibap.js THẲNG TỪ KHO GIT, nên những điều sau
 *  phải luôn đúng, và các bài ở đây chặn mọi lần chúng sai:
 *   - tệp trong safari/dist là BẢN ỔN ĐỊNH đã phát hành, còn nguyên vẹn (đúng mã băm đã ghi);
 *     mã nguồn được phép đi trước nó — chỉ `node safari/build.mjs --phat-hanh` mới đổi nó;
 *   - content.js và page-hook.js được gói nguyên văn — phần đọc e-GP không bị đụng tới;
 *   - mọi import của 118 mô-đun trỏ tới tệp có trong gói;
 *   - mã dấu trang an toàn cho địa chỉ javascript:, và CHẠY ĐÚNG trong mọi tình huống
 *     (đã chạy rồi, sai trang, tải được, nhánh mất, mất mạng có/không có bản dự phòng,
 *     trang cấm eval);
 *   - các hàm phân loại địa chỉ của lớp vỏ không nhận nhầm tên miền giả;
 *   - hướng dẫn in đúng mã dấu trang đang phát hành; CI có chạy bài WebKit.
 *  Bài đầu-cuối bằng WebKit thật nằm ở tools/test/safari-app.mjs (job app-di-dong).
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { buildPack, bookmarklet, bundleUrl, bundleInfo, distFiles, stableStatus, releaseNotes, lf, walk, REFS, REPO, extensionIdFromKey } from '../safari/build.mjs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'GiaoSuCuiBap');
const read = (...parts) => lf(fs.readFileSync(path.join(ROOT, ...parts), 'utf8'));
const { pack, code } = buildPack();

test('bản ổn định trong safari/dist còn nguyên vẹn: đúng mã băm đã ghi, đúng là tệp của Cùi Bắp, dấu trang không lệch', () => {
  const status = stableStatus();
  assert.deepEqual(status.problems, [], 'bản ổn định chỉ được đổi bằng: node safari/build.mjs --phat-hanh');
  const meta = JSON.parse(read('safari', 'dist', 'phien-ban.json'));
  const stable = read('safari', 'dist', 'cuibap.js');
  assert.equal(createHash('sha256').update(stable).digest('hex'), meta.sha256);
  assert.deepEqual(bundleInfo(stable), { version: meta.version, build: meta.build });
  assert.match(meta.build, /^[0-9a-f]{12}$/);
  assert.doesNotThrow(() => new vm.Script(stable), 'bản ổn định phải là JavaScript hợp lệ');
  assert.equal(pack.version, JSON.parse(read('GiaoSuCuiBap', 'manifest.json')).version);
});

test('mã nguồn được phép đi trước bản ổn định; khi trùng mã băm thì hai tệp trùng từng ký tự', () => {
  const status = stableStatus();
  assert.equal(status.source.build, pack.build);
  if (status.inSync) assert.equal(read('safari', 'dist', 'cuibap.js'), code);
  else assert.notEqual(status.stable.sha256, status.source.sha256);
  // Phiên bản của bản ổn định không bao giờ MỚI hơn mã nguồn (không ai phát hành từ tương lai).
  const num = (v) => v.split('.').map(Number).reduce((a, n) => a * 1000 + n, 0);
  assert.ok(num(status.stable.version) <= num(status.source.version), `${status.stable.version} > ${status.source.version}`);
});

test('ghi chú phát hành: vài dòng ngắn cho người dùng đọc, nằm trong gói và trong mã băm bản dựng', () => {
  const notes = releaseNotes();
  assert.ok(notes.length >= 1 && notes.length <= 8, `${notes.length} dòng`);
  for (const line of notes) { assert.ok(line.length <= 160, line); assert.doesNotMatch(line, /^#/); }
  assert.deepEqual(pack.notes, notes);
  assert.deepEqual(bundleInfo(code), { version: pack.version, build: pack.build });
  assert.equal(bundleInfo('/* tệp khác */'), null);
});

test('bản 4.21.0 mà người dùng đang chạy được lưu làm mẫu thử để kiểm đường nâng cấp', () => {
  const file = path.join(ROOT, 'tools', 'test', 'fixtures', 'cuibap-4.21.0-5663e848c26b.js.gz');
  const text = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
  assert.deepEqual(bundleInfo(text), { version: '4.21.0', build: '5663e848c26b' });
  assert.equal(createHash('sha256').update(text).digest('hex'), '8833aab5b4e0b485cd70f5998eb7272a3c4d32f1ad83e0b60d010ef0bfb88d38');
});

test('hai lần dựng cùng mã nguồn cho cùng một tệp (không có ngày giờ, không phụ thuộc thứ tự đọc thư mục)', () => {
  const again = buildPack();
  assert.equal(again.code, code);
  assert.equal(again.pack.build, pack.build);
  assert.match(pack.build, /^[0-9a-f]{12}$/);
});

test('content.js và page-hook.js — phần đọc dữ liệu e-GP — được gói nguyên văn từng ký tự', () => {
  for (const file of ['content.js', 'page-hook.js']) {
    assert.equal(pack.files[file].s, read('GiaoSuCuiBap', file), `${file} bị sửa khi đóng gói`);
    assert.equal(pack.files[file].m, undefined, `${file} phải là script thường`);
    // Trên kho (LF) thì đúng từng byte.
    const raw = fs.readFileSync(path.join(EXT, file), 'utf8');
    if (!raw.includes('\r')) assert.equal(pack.files[file].s, raw);
  }
});

test('gói có đủ mọi trang và mọi tệp của tiện ích; không kèm tài liệu và bản bookmarklet cũ', () => {
  const all = walk(EXT);
  const pages = all.filter((f) => f.endsWith('.html') && !f.startsWith('mobile/'));
  assert.equal(pages.length, 25);   // 4.22.0 thêm brief.html (Hồ sơ quyết định) và forecast.html (Gói lặp lại hằng năm)
  for (const page of pages) assert.ok(pack.files[page]?.s, `thiếu trang ${page}`);
  for (const file of all) {
    const skipped = file.endsWith('.md') || file.endsWith('.txt') || file.startsWith('mobile/');
    assert.equal(Boolean(pack.files[file]), !skipped, `${file}: ${skipped ? 'không được có trong gói' : 'thiếu trong gói'}`);
  }
  assert.equal(pack.files['background.js'].m, 1);
  assert.deepEqual(pack.manifest, JSON.parse(read('GiaoSuCuiBap', 'manifest.json')));
  assert.equal(pack.id, extensionIdFromKey(pack.manifest.key));
  assert.match(pack.id, /^[a-p]{32}$/);
});

test('mọi import của các mô-đun đã đổi sang tên trần gscb/… và trỏ tới mô-đun có trong gói', () => {
  let modules = 0, imports = 0;
  for (const [file, entry] of Object.entries(pack.files)) {
    if (!entry.m) continue;
    modules++;
    assert.doesNotMatch(entry.s, /\bfrom\s*['"]\.{1,2}\//, `${file} còn import tương đối`);
    assert.doesNotMatch(entry.s, /\bimport\s*\(?\s*['"]\.{1,2}\//, `${file} còn import tương đối`);
    for (const match of entry.s.matchAll(/\b(?:from|import)\s*\(?\s*['"]gscb\/([^'"]+)['"]/g)) {
      imports++;
      assert.equal(pack.files[match[1]]?.m, 1, `${file} import ${match[1]} không có trong gói`);
    }
  }
  assert.ok(modules >= 100 && imports >= 200, `${modules} mô-đun, ${imports} import`);
});

test('mô-đun giao diện có điều hướng nhận bản mô phỏng location; mã nền và lib không bị thêm gì', () => {
  const shim = 'const location=globalThis.__gscbLocation||globalThis.location;';
  const shimmed = Object.keys(pack.files).filter((f) => pack.files[f].s?.startsWith(shim));
  for (const file of ['search.js', 'plans.js', 'shell.js', 'options.js']) assert.ok(shimmed.includes(file), `${file} thiếu location mô phỏng`);
  assert.ok(!shimmed.includes('background.js'));
  for (const file of shimmed) assert.equal(pack.files[file].m, 1);
  // Ảnh chèn bằng innerHTML không được để trình duyệt hỏi máy chủ e-GP.
  for (const [file, entry] of Object.entries(pack.files)) {
    if (!file.endsWith('.js') || ['content.js', 'page-hook.js'].includes(file)) continue;
    assert.doesNotMatch(entry.s, /\bsrc=["'](?:icons|vendor|fonts)\//, `${file} còn đường dẫn ảnh tương đối trong chuỗi HTML`);
  }
});

test('lớp vỏ: các tệp nguồn ghép theo thứ tự tên, không import/export, không còn mã gỡ lỗi', () => {
  const files = fs.readdirSync(path.join(ROOT, 'safari', 'src')).filter((f) => f.endsWith('.js')).sort();
  assert.deepEqual(files, ['00-core.js', '10-assets.js', '20-storage.js', '30-chrome.js', '40-egp.js', '50-ui.js', '80-phat-hanh.js', '90-main.js']);
  for (const file of files) {
    const text = read('safari', 'src', file);
    assert.doesNotMatch(text, /^\s*(?:import|export)\s/m, `${file} là script ghép, không phải mô-đun`);
    assert.doesNotMatch(text, /\bdebugger\b|console\.log\(/, `${file} còn mã gỡ lỗi`);
    assert.ok(code.includes(`/* ---- safari/src/${file} ---- */`));
  }
  assert.ok(code.startsWith('/* Giáo Sư Cùi Bắp '));
  assert.doesNotThrow(() => new vm.Script(code), 'tệp dựng phải là JavaScript hợp lệ');
});

/* ------------------------------------------------------------------ dấu trang */
const MARK = bookmarklet();
const URLS = REFS.map((ref) => bundleUrl(ref));

test('mã dấu trang: một dòng, chỉ ASCII, không có % # " — an toàn cho ô địa chỉ dấu trang của Safari', () => {
  assert.ok(MARK.startsWith('javascript:void(function(){'));
  assert.doesNotMatch(MARK, /[^\x20-\x7e]/, 'có ký tự ngoài ASCII');
  assert.doesNotMatch(MARK, /[%#"\n\r]/, 'có ký tự mang nghĩa riêng trong địa chỉ');
  assert.ok(MARK.length < 4000, `dài ${MARK.length} ký tự`);
  assert.doesNotThrow(() => new vm.Script(MARK.slice('javascript:'.length)));
  assert.equal(REPO, 'Giaosucuibap/T-m-Th-u');
  assert.deepEqual(REFS.slice(-1), ['main'], 'main luôn là chỗ lấy cuối cùng');
  assert.ok(MARK.indexOf(URLS[0]) > 0 && MARK.indexOf(URLS[0]) < MARK.indexOf(URLS.at(-1)), 'thử nhánh đang phát triển trước, rồi mới tới main');
  for (const url of URLS) assert.match(url, /^https:\/\/raw\.githubusercontent\.com\/Giaosucuibap\/T-m-Th-u\/[\w./-]+\/safari\/dist\/cuibap\.js$/);
  assert.equal(read('safari', 'dist', 'dau-trang.txt'), `${MARK}\n`);
});

test('dấu trang và lớp vỏ dùng CÙNG tên kho / ngăn / khoá cho bản dự phòng', () => {
  const storage = read('safari', 'src', '20-storage.js');
  assert.match(storage, /const DB_NAME = 'gscb-safari';/);
  assert.match(storage, /\['local', 'meta', 'goi'\]/);
  // Bản tải về mới nhất được cất ở khoá `js` (80-phat-hanh.js) — đúng khoá mà dấu trang đọc khi mất mạng.
  const release = read('safari', 'src', '80-phat-hanh.js');
  assert.match(release, /newest: 'js'/);
  assert.match(release, /await put\(REL\.newest, myText\)/);
  assert.match(release, /idbWrite\(db, 'goi', \{ puts: \[\[slot, text\]\] \}\)/);
  assert.ok(MARK.includes("indexedDB.open('gscb-safari')"));
  assert.ok(MARK.includes("transaction('goi').objectStore('goi').get('js')"));
  // Dấu trang KHÔNG được tạo kho rỗng (lớp vỏ sẽ không còn dịp tạo đủ ngăn).
  assert.ok(MARK.includes('q.onupgradeneeded=function(){q.transaction.abort()}'));
});

/** Chạy mã dấu trang trong một "trang" giả. Trả về những gì nó đã làm. */
async function tap({ host = 'muasamcong.mof.gov.vn', running = false, net = {}, kept = null, dbMissing = false, evalBlocked = false, confirmAnswer = true } = {}) {
  const log = { fetched: [], evaluated: [], inline: [], confirms: [], alerts: [], shown: 0, bar: [], navigated: null, removed: 0 };
  const makeEl = (tag) => ({ tag, style: {}, textContent: '', remove() { log.removed++; if (tag === 'div') log.bar.push(`(gỡ) ${this.textContent}`); },
    set _t(v) { this.textContent = v; } });
  const window = { __GSCB_OPTS__: undefined };
  if (running) window.__GSCB_SAFARI__ = { show() { log.shown++; } };
  const document = {
    createElement: makeEl,
    documentElement: { appendChild(el) { if (el.tag === 'script') { log.inline.push(el.textContent); if (!el.textContent.includes('KHONG-CHAY')) window.__GSCB_SAFARI__ = { show() {} }; } else log.bar.push(el); } }
  };
  const location = { hostname: host, set href(v) { log.navigated = v; } };
  const fetch = async (url, init) => {
    log.fetched.push([url, init?.cache]);
    const answer = net[url];
    if (answer === undefined || answer === 'down') throw new TypeError('Load failed');
    if (typeof answer === 'number') return { ok: false, status: answer, text: async () => 'lỗi' };
    return { ok: true, status: 200, text: async () => answer };
  };
  const indexedDB = { open(name) {
    const request = { result: null, error: null, transaction: { abort() { request.aborted = true; } } };
    setTimeout(() => {
      if (dbMissing) { request.onupgradeneeded?.(); request.error = new Error('AbortError'); request.onerror?.(); return; }
      request.result = { transaction(store) { assert.equal(name, 'gscb-safari'); assert.equal(store, 'goi'); return { objectStore: () => ({ get(key) { assert.equal(key, 'js'); const g = { result: kept ?? undefined }; setTimeout(() => g.onsuccess?.(), 0); return g; } }) }; } };
      request.onsuccess?.();
    }, 0);
    return request;
  } };
  const sandbox = { window, document, location, fetch, indexedDB, Promise, Error, setTimeout,
    confirm: (text) => { log.confirms.push(text); return confirmAnswer; }, alert: (text) => log.alerts.push(text),
    // (0,eval)(t) trong dấu trang = eval của trang; ở đây ghi lại và mô phỏng "Cùi Bắp đã chạy".
    eval: (text) => { if (evalBlocked) { const e = new Error('Refused to evaluate a string as JavaScript because unsafe-eval is not allowed'); e.name = 'EvalError'; throw e; } log.evaluated.push(text); window.__GSCB_SAFARI__ = { show() {} }; } };
  vm.runInNewContext(MARK.slice('javascript:'.length), sandbox);
  await new Promise((resolve) => setTimeout(resolve, 30));
  log.window = window;
  log.barText = log.bar.filter((b) => typeof b === 'object').map((b) => b.textContent).join(' | ');
  return log;
}
const BUNDLE = '/* tệp thử */ window.__GSCB_SAFARI__ = {};';

test('dấu trang · Cùi Bắp đang chạy trong tab này: chỉ hiện lại, không tải gì', async () => {
  const r = await tap({ running: true, net: { [URLS[0]]: BUNDLE } });
  assert.equal(r.shown, 1);
  assert.deepEqual(r.fetched, []);
});

test('dấu trang · đang ở trang khác: hỏi rồi mở trang tra cứu muasamcong; tên miền giả không được coi là muasamcong', async () => {
  for (const host of ['vnexpress.net', 'muasamcong.mof.gov.vn.evil.example', 'xmuasamcong.mof.gov.vn', 'muasamcong.gov.vn']) {
    const r = await tap({ host, net: { [URLS[0]]: BUNDLE } });
    assert.equal(r.confirms.length, 1, host);
    assert.equal(r.navigated, 'https://muasamcong.mof.gov.vn/vi/web/guest/contractor-selection?render=search', host);
    assert.deepEqual(r.fetched, [], `${host}: không tải mã vào trang lạ`);
    assert.deepEqual(r.evaluated, []);
  }
  const no = await tap({ host: 'vnexpress.net', confirmAnswer: false });
  assert.equal(no.navigated, null, 'bấm Huỷ thì ở yên');
  for (const host of ['muasamcong.mof.gov.vn', 'muasamcong.mpi.gov.vn']) assert.equal((await tap({ host, net: { [URLS[0]]: BUNDLE } })).evaluated.length, 1, host);
});

test('dấu trang · tải được: luôn hỏi bản mới (no-cache), chạy tệp, trao bản đó cho lớp vỏ cất làm dự phòng', async () => {
  const r = await tap({ net: { [URLS[0]]: BUNDLE } });
  assert.deepEqual(r.fetched, [[URLS[0], 'no-cache']]);
  assert.deepEqual(r.evaluated, [BUNDLE]);
  assert.deepEqual({ ...r.window.__GSCB_SRC__ }, { ref: URLS[0], cached: false, text: BUNDLE });
  assert.equal(r.window.__GSCB_LOADING__, 0);
  assert.ok(r.removed >= 1, 'thanh "Đang nạp…" được gỡ');
});

test('dấu trang · nhánh phát triển không còn (404): lấy ở main', async () => {
  const r = await tap({ net: { [URLS[0]]: 404, [URLS.at(-1)]: BUNDLE } });
  assert.deepEqual(r.fetched.map((f) => f[0]), [URLS[0], URLS.at(-1)]);
  assert.equal(r.window.__GSCB_SRC__.ref, URLS.at(-1));
  assert.deepEqual(r.evaluated, [BUNDLE]);
});

test('dấu trang · GitHub trả thứ không phải tệp của Cùi Bắp (trang lỗi của mạng công ty…): KHÔNG chạy', async () => {
  const r = await tap({ net: { [URLS[0]]: '<html>Đăng nhập Wi-Fi</html>' } });
  assert.deepEqual(r.evaluated, []);
  assert.match(r.barText, /Không nạp được Cùi Bắp \(tep hong\)/);
});

test('dấu trang · mất mạng tới GitHub: chạy bản dự phòng đã cất trong IndexedDB và đánh dấu là bản lưu sẵn', async () => {
  const r = await tap({ net: { [URLS[0]]: 'down' }, kept: BUNDLE });
  assert.deepEqual(r.evaluated, [BUNDLE]);
  assert.deepEqual({ ...r.window.__GSCB_SRC__ }, { ref: 'ban luu san', cached: true, text: null });
});

test('dấu trang · mất mạng mà chưa từng nạp (kho chưa có / kho rỗng): báo rõ, cho chạm lại, không tạo kho rỗng', async () => {
  for (const state of [{ dbMissing: true }, { kept: null }]) {
    const r = await tap({ net: {}, ...state });
    assert.deepEqual(r.evaluated, []);
    assert.match(r.barText, /Không nạp được Cùi Bắp \(Load failed\)\. Kiểm tra mạng/);
    assert.equal(r.window.__GSCB_LOADING__, 0);
  }
});

test('dấu trang · chạm hai lần liền nhau khi đang tải: chỉ tải một lần', async () => {
  const log = { fetched: 0 };
  const window = { __GSCB_LOADING__: 1 };
  vm.runInNewContext(MARK.slice('javascript:'.length), { window, document: {}, location: { hostname: 'muasamcong.mof.gov.vn' }, fetch: () => { log.fetched++; return new Promise(() => {}); } });
  assert.equal(log.fetched, 0);
});

test('dấu trang · trang cấm eval (CSP): chạy bằng thẻ script nội tuyến; cấm cả hai thì báo rõ', async () => {
  const ok = await tap({ net: { [URLS[0]]: BUNDLE }, evalBlocked: true });
  assert.deepEqual(ok.inline, [BUNDLE]);
  assert.deepEqual(ok.alerts, []);
  const blocked = await tap({ net: { [URLS[0]]: '/* __GSCB_SAFARI__ KHONG-CHAY */' }, evalBlocked: true });
  assert.equal(blocked.alerts.length, 1);
  assert.match(blocked.alerts[0], /unsafe-eval/);
});

/* --------------------------------------------- hàm phân loại địa chỉ của lớp vỏ */
function core(href = 'https://muasamcong.mof.gov.vn/vi/web/guest/contractor-selection?render=search') {
  const u = new URL(href);
  const sandbox = { URL, RegExp, JSON, Set, String, Boolean, Date, Promise, setTimeout, decodeURIComponent,
    PACK: { id: pack.id, manifest: pack.manifest }, window: { location: { origin: u.origin, host: u.host, hostname: u.hostname, href }, console } };
  vm.runInNewContext(`${read('safari', 'src', '00-core.js')}\n;globalThis.__api = { isEgpUrl, hasContentScript, parseExtensionUrl, sameOriginEgp, patternToRegExp };`, sandbox);
  return sandbox.__api;
}

test('lớp vỏ · chỉ đúng hai tên miền e-GP, https, không cổng lạ, không tài khoản', () => {
  const { isEgpUrl } = core();
  for (const ok of ['https://muasamcong.mof.gov.vn/', 'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?x=1', 'https://MUASAMCONG.MOF.GOV.VN/a']) assert.equal(isEgpUrl(ok), true, ok);
  for (const bad of ['http://muasamcong.mof.gov.vn/', 'https://muasamcong.mof.gov.vn.evil.example/', 'https://evil.example/muasamcong.mof.gov.vn', 'https://a.muasamcong.mof.gov.vn/',
    'https://muasamcong.mof.gov.vn:8443/', 'https://user:pass@muasamcong.mof.gov.vn/', 'javascript:alert(1)', 'about:blank', '', null, 'muasamcong.mof.gov.vn']) assert.equal(isEgpUrl(bad), false, String(bad));
});

test('lớp vỏ · content script chỉ vào đúng các trang manifest khai báo', () => {
  const { hasContentScript } = core();
  assert.equal(hasContentScript('https://muasamcong.mof.gov.vn/vi/web/guest/contractor-selection?render=search'), true);
  assert.equal(hasContentScript('https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?p_p_id=x&_render=detail-v2'), true);
  assert.equal(hasContentScript('https://muasamcong.mof.gov.vn/web/guest/home'), false);
  assert.equal(hasContentScript('https://muasamcong.mof.gov.vn/__gscb__/search.html'), false, 'trang của tiện ích không phải trang e-GP');
  assert.equal(hasContentScript('https://evil.example/vi/web/guest/contractor-selection'), false);
  assert.equal(hasContentScript('không phải địa chỉ'), false);
});

test('lớp vỏ · nhận đúng địa chỉ trang tiện ích; địa chỉ nguồn khác không bao giờ được coi là trang tiện ích', () => {
  const { parseExtensionUrl } = core();
  assert.deepEqual({ ...parseExtensionUrl(`chrome-extension://${pack.id}/plans.html?planNo=PL1#a`) }, { page: 'plans.html', search: '?planNo=PL1', hash: '#a' });
  assert.deepEqual({ ...parseExtensionUrl('https://muasamcong.mof.gov.vn/__gscb__/search.html?x=1') }, { page: 'search.html', search: '?x=1', hash: '' });
  assert.deepEqual({ ...parseExtensionUrl('winners.html#y', 'search.html') }, { page: 'winners.html', search: '', hash: '#y' });
  assert.deepEqual({ ...parseExtensionUrl('?tab=2', 'search.html') }, { page: 'search.html', search: '?tab=2', hash: '' });
  assert.equal(parseExtensionUrl('https://evil.example/__gscb__/search.html'), null);
  assert.equal(parseExtensionUrl('https://muasamcong.mof.gov.vn/vi/web/guest/contractor-selection'), null);
  assert.equal(parseExtensionUrl('chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/search.html'), null, 'tiện ích khác');
  assert.equal(parseExtensionUrl('https://muasamcong.mpi.gov.vn/__gscb__/search.html'), null, 'tên miền e-GP kia là nguồn khác');
});

test('lớp vỏ · địa chỉ e-GP ở tên miền kia được đổi về tên miền của tab đang mở; địa chỉ khác giữ nguyên', () => {
  const onMof = core().sameOriginEgp;
  assert.equal(onMof('https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?render=search#x'), 'https://muasamcong.mof.gov.vn/vi/web/guest/contractor-selection?render=search#x');
  assert.equal(onMof('https://muasamcong.mof.gov.vn/a?b=1'), 'https://muasamcong.mof.gov.vn/a?b=1');
  assert.equal(onMof('https://api.telegram.org/bot1/sendMessage'), 'https://api.telegram.org/bot1/sendMessage');
  assert.equal(onMof('https://muasamcong.mpi.gov.vn.evil.example/a'), 'https://muasamcong.mpi.gov.vn.evil.example/a');
  assert.equal(onMof('about:blank'), 'about:blank');
  const onMpi = core('https://muasamcong.mpi.gov.vn/web/guest/home').sameOriginEgp;
  assert.equal(onMpi('https://muasamcong.mof.gov.vn/o/egp-portal-contractor-selection-v2/services/get/area-api-list'), 'https://muasamcong.mpi.gov.vn/o/egp-portal-contractor-selection-v2/services/get/area-api-list');
});

/* ------------------------------------------------------------- tài liệu và CI */
test('hướng dẫn cài trên iPad in đúng mã dấu trang đang phát hành, và nói rõ giới hạn', () => {
  const guide = read('HUONG-DAN-SAFARI-IPAD.md');
  const blocks = [...guide.matchAll(/```[a-z]*\n([\s\S]*?)\n```/g)].map((m) => m[1].trim());
  assert.ok(blocks.includes(MARK), 'khối mã trong hướng dẫn phải đúng từng ký tự với safari/dist/dau-trang.txt');
  // Hai điều phải nói thẳng với người dùng, không được biến mất khi sửa hướng dẫn về sau.
  const flat = guide.replace(/\s*\n>?\s*/g, ' ');
  for (const must of [/chưa chạy thử trên iPad thật/i, /chưa thử với trang muasamcong thật/i, /Chẩn đoán → Chép chẩn đoán/, /chế độ hạn chế/i, /Tải E-HSMT/, /xác thực 2 bước/])
    assert.match(flat, must, `hướng dẫn thiếu: ${must}`);
});

test('kho và CI: safari/dist không bị .gitignore bỏ qua; job WebKit chạy bài đầu-cuối của bản Safari', () => {
  const ignore = read('.gitignore');
  assert.ok(ignore.indexOf('!/safari/dist/') > ignore.indexOf('\ndist/'), 'ngoại lệ phải đứng SAU dòng dist/');
  const ci = read('.github', 'workflows', 'kiem-thu.yml');
  assert.match(ci, /node safari\/build\.mjs --check/);
  const step = ci.slice(ci.indexOf('tools/test/safari-app.mjs') - 600, ci.indexOf('tools/test/safari-app.mjs') + 100);
  assert.match(step, /GSCB_REQUIRE_WEBKIT: '1'/, 'thiếu WebKit thì bài phải HỎNG chứ không được lặng lẽ bỏ qua');
  assert.match(step, /xvfb-run -a node tools\/test\/safari-app\.mjs/);
  assert.ok(ci.indexOf('webkit2gtk-driver') < ci.indexOf('tools/test/safari-app.mjs'), 'cài WebKit trước khi chạy');
  assert.match(ci, /test-results\/safari-app\/\*\.png/);
});
