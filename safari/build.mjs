/* ============================================================================
 *  DỰNG BẢN CHẠY THẲNG TRÊN SAFARI (iPad / iPhone)
 *
 *  node safari/build.mjs [--out <thư-mục>] [--check]
 *
 *  Gói NGUYÊN VĂN tiện ích (thư mục GiaoSuCuiBap) cùng lớp mô phỏng trong safari/src
 *  thành MỘT tệp safari/dist/cuibap.js. Dấu trang (bookmarklet) trên Safari nạp tệp
 *  này vào trang muasamcong đang mở; từ đó toàn bộ tiện ích chạy ngay trong tab đó:
 *    - background.js chạy trong một khung ẩn với `chrome.*` mô phỏng;
 *    - 23 trang giao diện chạy trong khung nhìn thấy;
 *    - page-hook.js + content.js (KHÔNG sửa một ký tự) tiêm vào trang e-GP thật.
 *
 *  Những gì bộ dựng làm với mã nguồn:
 *    1. Mô-đun ES: đổi `import … from './x.js'` thành tên trần `gscb/x.js`, để import
 *       map trong từng khung trỏ tới blob URL (khung không có địa chỉ thư mục thật).
 *    2. Mô-đun giao diện có điều hướng bằng `location.…`: thêm một dòng cho `location`
 *       trỏ tới bản mô phỏng (`__gscbLocation`) — điều hướng giữa các trang tiện ích
 *       không được rời khỏi tab e-GP.
 *    3. Ảnh chèn bằng innerHTML (`src="icons/…"`): đổi sang `gscb-asset:` để trình
 *       duyệt KHÔNG gửi yêu cầu lạc sang máy chủ e-GP; lớp mô phỏng đổi tiếp sang blob.
 *  content.js và page-hook.js được đóng gói đúng từng ký tự.
 *
 *  Ký tự xuống dòng: mọi tệp văn bản được đưa về LF trước khi gói. Kho có 23 tệp của tác
 *  giả lưu kiểu Windows (CRLF), và máy Windows khi lấy mã về còn đổi cả phần còn lại sang
 *  CRLF — không chuẩn hoá thì cùng một mã nguồn mà dựng ở hai máy ra hai tệp khác nhau.
 *
 *  --check: dựng vào bộ nhớ và so với safari/dist — khác thì thoát mã 1 (dùng cho CI,
 *  để tệp trong kho không bao giờ lệch mã nguồn).
 * ========================================================================== */
import { createHash, createPublicKey } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'GiaoSuCuiBap');
const SRC = path.join(ROOT, 'safari', 'src');
const args = process.argv.slice(2);
const opt = (name, def = '') => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const OUT = path.resolve(opt('--out', path.join(ROOT, 'safari', 'dist')));
const CHECK = args.includes('--check');

const TEXT = new Set(['.js', '.html', '.css', '.json', '.svg']);
const BINARY = new Set(['.png', '.woff2', '.jpg', '.jpeg', '.gif', '.ico']);
const VERBATIM = new Set(['content.js', 'page-hook.js']);
/* Không đưa vào gói: tài liệu, bản bookmarklet cũ của tác giả (đã được bản này thay). */
const SKIP = (rel) => rel.endsWith('.md') || rel.endsWith('.txt') || rel.startsWith('mobile/');

export function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/** Mã tiện ích Chrome suy từ khoá công khai trong manifest (32 chữ a–p). */
export function extensionIdFromKey(keyBase64) {
  const der = createPublicKey({ key: Buffer.from(keyBase64, 'base64'), format: 'der', type: 'spki' }).export({ format: 'der', type: 'spki' });
  const hex = createHash('sha256').update(der).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

const resolveFrom = (file, spec) => path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
/** Đưa ký tự xuống dòng về LF (xem phần đầu tệp): bỏ CR đứng trước LF, và CR sót ở cuối tệp. */
export const lf = (text) => text.replace(/\r(?=\n|$)/g, '');

/** Đổi import tương đối thành tên trần `gscb/<đường dẫn>`; trả về {code, deps}. */
export function rewriteImports(file, code, exists) {
  const deps = [];
  const swap = (spec) => {
    const target = resolveFrom(file, spec);
    if (!exists(target)) throw new Error(`${file}: import "${spec}" → không có tệp ${target}`);
    deps.push(target);
    return `gscb/${target}`;
  };
  const out = code
    .replace(/(\bfrom\s*)(['"])(\.{1,2}\/[^'"\n]+)\2/g, (m, a, q, spec) => `${a}${q}${swap(spec)}${q}`)
    .replace(/(\bimport\s*)(['"])(\.{1,2}\/[^'"\n]+)\2/g, (m, a, q, spec) => `${a}${q}${swap(spec)}${q}`)
    .replace(/(\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"\n]+)\2(\s*\))/g, (m, a, q, spec, z) => `${a}${q}${swap(spec)}${q}${z}`);
  return { code: out, deps };
}

const USES_LOCATION = /(?<![.\w$])location\.(?:href|assign|replace|reload|search|hash|pathname)\b/;
const DECLARES_LOCATION = /(?:^|[;{}\n])\s*(?:export\s+)?(?:const|let|var|function|class)\s+location\b|import\s*\{[^}]*\blocation\b[^}]*\}/;
const LOCATION_SHIM = 'const location=globalThis.__gscbLocation||globalThis.location;';

export function buildPack() {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const all = walk(EXT).filter((rel) => !SKIP(rel) && (TEXT.has(path.extname(rel)) || BINARY.has(path.extname(rel))));
  const have = new Set(all);
  const read = (rel) => lf(fs.readFileSync(path.join(EXT, rel), 'utf8'));

  // Tệp nào là mô-đun ES: được thẻ <script type="module"> gọi, hoặc tự có import/export.
  const modules = new Set(['background.js']);
  const classic = new Set();
  for (const rel of all.filter((f) => f.endsWith('.html'))) {
    for (const tag of read(rel).match(/<script\b[^>]*>/gi) || []) {
      const src = (tag.match(/\bsrc="([^"]+)"/i) || [])[1];
      if (!src || /^[a-z]+:/i.test(src)) continue;
      const target = resolveFrom(rel, src);
      if (!have.has(target)) throw new Error(`${rel}: <script src="${src}"> → không có tệp ${target}`);
      (/\btype="module"/i.test(tag) ? modules : classic).add(target);
    }
  }
  for (const rel of all.filter((f) => f.endsWith('.js') && !VERBATIM.has(f))) {
    if (/^\s*(?:import\b[^(]|export\b)/m.test(read(rel))) modules.add(rel);
  }
  for (const rel of classic) if (modules.has(rel)) throw new Error(`${rel} vừa là mô-đun vừa là script thường.`);

  const files = {};
  const stats = { modules: 0, classic: 0, html: 0, css: 0, binary: 0, locationShim: [], assetRefs: 0 };
  for (const rel of all) {
    const ext = path.extname(rel);
    if (BINARY.has(ext)) { files[rel] = { b: fs.readFileSync(path.join(EXT, rel)).toString('base64') }; stats.binary++; continue; }
    let text = read(rel);
    if (ext === '.js' && VERBATIM.has(rel)) { files[rel] = { s: text }; continue; }
    if (ext === '.js') {
      // Ảnh chèn bằng innerHTML: không để trình duyệt gửi yêu cầu sang máy chủ e-GP.
      text = text.replace(/(\bsrc=)(["'])((?:icons|vendor|fonts)\/[^"'$\s]+)\2/g, (m, a, q, p) => {
        if (!have.has(p)) return m;
        stats.assetRefs++;
        return `${a}${q}gscb-asset:${p}${q}`;
      });
      if (modules.has(rel)) {
        text = rewriteImports(rel, text, (p) => have.has(p)).code;
        if (USES_LOCATION.test(text)) {
          if (DECLARES_LOCATION.test(text)) throw new Error(`${rel} tự khai báo "location" ở cấp cao nhất — không gắn được bản mô phỏng.`);
          text = LOCATION_SHIM + text;
          stats.locationShim.push(rel);
        }
        files[rel] = { s: text, m: 1 };
        stats.modules++;
      } else { files[rel] = { s: text }; stats.classic++; }
      continue;
    }
    if (ext === '.html') stats.html++;
    if (ext === '.css') stats.css++;
    files[rel] = { s: text };
  }

  const id = extensionIdFromKey(manifest.key);
  const shell = fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort().map((f) => `/* ---- safari/src/${f} ---- */\n${lf(fs.readFileSync(path.join(SRC, f), 'utf8'))}`).join('\n');
  // Dấu vân tay của NỘI DUNG (không có ngày giờ): hai lần dựng cùng mã nguồn cho cùng một tệp.
  const digest = createHash('sha256').update(JSON.stringify(files)).update(shell).digest('hex');
  const pack = { version: manifest.version, build: digest.slice(0, 12), id, manifest, files };
  const banner = `/* Giáo Sư Cùi Bắp ${manifest.version} — bản chạy thẳng trên Safari (iPad/iPhone). Bản dựng ${pack.build}.\n`
    + ' * TỆP SINH TỰ ĐỘNG bởi safari/build.mjs — đừng sửa tay. Mã nguồn: thư mục GiaoSuCuiBap và safari/src. */\n';
  const code = `${banner};(function(PACK){\n"use strict";\n${shell}\n})(${JSON.stringify(pack)});\n`;
  return { code, pack, stats, digest };
}

/* Kho và nhánh mà dấu trang tải tệp về. Thử lần lượt: nhánh đang phát triển trước (bản mới
   nhất), không còn nhánh đó (đã gộp rồi xoá) thì lấy ở `main`. */
export const REPO = 'Giaosucuibap/T-m-Th-u';
export const REFS = ['claude/procurement-search-extension-au3o5u', 'main'];
export const bundleUrl = (ref, repo = REPO) => `https://raw.githubusercontent.com/${repo}/${ref}/safari/dist/cuibap.js`;

/** Chuỗi JS chỉ gồm ký tự ASCII (chữ có dấu thành \uXXXX) — Safari lưu dấu trang không làm hỏng được. */
const ascii = (text) => `'${[...text].map((ch) => (ch === "'" || ch === '\\' ? `\\${ch}` : ch.charCodeAt(0) > 126 ? `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}` : ch)).join('')}'`;

/**
 * Mã của dấu trang (bookmarklet). Việc nó làm, theo thứ tự:
 *   1. Cùi Bắp đang chạy trong tab này rồi → chỉ hiện lại.
 *   2. Không phải trang muasamcong → hỏi rồi mở trang đó (mở xong chạm lại dấu trang).
 *   3. Tải safari/dist/cuibap.js từ kho GitHub (luôn hỏi bản mới). Không tải được (mất mạng,
 *      GitHub không vào được) thì chạy BẢN DỰ PHÒNG mà lần chạy trước đã cất vào IndexedDB
 *      của trang muasamcong (kho gscb-safari, ngăn goi, khoá js — xem safari/src/20-storage.js).
 *   4. Chạy tệp đó ngay trong trang muasamcong.
 * RÀNG BUỘC: một dòng, chỉ ASCII, không có ký tự %, # và dấu nháy kép — ba ký tự đó có
 * nghĩa riêng trong một địa chỉ javascript: và có thể bị Safari đổi khi lưu dấu trang.
 */
export function bookmarklet(urls = REFS.map((ref) => bundleUrl(ref))) {
  const loading = ascii('Đang nạp Giáo Sư Cùi Bắp…');
  const ask = ascii('Cùi Bắp chạy trên trang muasamcong. Bấm OK để mở trang đó; mở xong thì chạm lại dấu trang này.');
  const failed = ascii('Không nạp được Cùi Bắp (');
  const retry = ascii('). Kiểm tra mạng rồi chạm lại dấu trang.');
  const blocked = ascii('Trang này không cho chạy Cùi Bắp: ');
  const code = `(function(){var w=window,d=document,U=[${urls.map((u) => `'${u}'`).join(',')}];`
    + 'if(w.__GSCB_SAFARI__){w.__GSCB_SAFARI__.show();return}'
    + `if(!/^muasamcong\\.(mof|mpi)\\.gov\\.vn$/.test(location.hostname)){if(confirm(${ask}))location.href='https://muasamcong.mof.gov.vn/vi/web/guest/contractor-selection?render=search';return}`
    + 'if(w.__GSCB_LOADING__)return;w.__GSCB_LOADING__=1;'
    + `var b=d.createElement('div');b.style.cssText='position:fixed;left:0;right:0;top:0;z-index:2147483647;background:rgb(15,118,110);color:white;font:600 16px -apple-system,system-ui,sans-serif;padding:14px 16px;text-align:center';b.textContent=${loading};d.documentElement.appendChild(b);`
    + `function bad(e){w.__GSCB_LOADING__=0;b.style.background='rgb(185,28,28)';b.textContent=${failed}+(e&&e.message||e)+${retry};setTimeout(function(){b.remove()},9000)}`
    // Chạy tệp: eval trước; trang cấm eval (CSP) thì thử thẻ script nội tuyến.
    + 'function run(t,u,c){b.remove();w.__GSCB_LOADING__=0;w.__GSCB_SRC__={ref:u,cached:!!c,text:c?null:t};'
    + `try{(0,eval)(t)}catch(e){if(w.__GSCB_SAFARI__)throw e;var s=d.createElement('script');s.textContent=t;d.documentElement.appendChild(s);s.remove();if(!w.__GSCB_SAFARI__)alert(${blocked}+e.message)}}`
    // Bản dự phòng: mở kho mà KHÔNG tạo mới (kho chưa có thì huỷ ngay, để lớp vỏ tự tạo đủ ngăn sau).
    + "function old(){return new Promise(function(y,n){try{var q=indexedDB.open('gscb-safari');q.onupgradeneeded=function(){q.transaction.abort()};q.onerror=function(){n(q.error)};"
    + "q.onsuccess=function(){try{var g=q.result.transaction('goi').objectStore('goi').get('js');g.onsuccess=function(){y(g.result||null)};g.onerror=function(){n(g.error)}}catch(e){n(e)}}}catch(e){n(e)}})}"
    + "function net(i){return fetch(U[i],{cache:'no-cache'}).then(function(r){if(!r.ok){if(i+1<U.length)return net(i+1);throw new Error('HTTP '+r.status)}"
    + "return r.text().then(function(t){if(t.indexOf('__GSCB_SAFARI__')<0)throw new Error('tep hong');return[t,U[i]]})})}"
    + "net(0).then(function(x){run(x[0],x[1])},function(e){old().then(function(t){if(t)run(t,'ban luu san',1);else bad(e)},function(){bad(e)})})"
    + '})()';
  if (/[%#"\n]/.test(code) || /[^\x20-\x7e]/.test(code)) throw new Error('Mã dấu trang chứa ký tự không an toàn cho địa chỉ javascript:.');
  return `javascript:void${code}`;
}

/** Ba tệp của safari/dist, dựng từ mã nguồn hiện tại: [tên, nội dung]. */
export function distFiles() {
  const { code, pack, stats } = buildPack();
  const meta = `${JSON.stringify({ version: pack.version, build: pack.build, bytes: Buffer.byteLength(code), sha256: createHash('sha256').update(code).digest('hex') }, null, 2)}\n`;
  return { pack, stats, files: [['cuibap.js', code], ['phien-ban.json', meta], ['dau-trang.txt', `${bookmarklet()}\n`]] };
}
/** Tên các tệp trong `dir` đang lệch so với mã nguồn (so sau khi đưa xuống dòng về LF). */
export function staleDist(dir = path.join(ROOT, 'safari', 'dist')) {
  return distFiles().files.filter(([name, text]) => !fs.existsSync(path.join(dir, name)) || lf(fs.readFileSync(path.join(dir, name), 'utf8')) !== text).map(([name]) => name);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (CHECK) {
    const stale = staleDist(OUT);
    if (stale.length) { console.error(`safari/dist LỆCH mã nguồn (${stale.join(', ')}) — chạy: node safari/build.mjs`); process.exit(1); }
    console.log('safari/dist khớp mã nguồn.');
  } else {
    const { pack, stats, files } = distFiles();
    fs.mkdirSync(OUT, { recursive: true });
    for (const [name, text] of files) fs.writeFileSync(path.join(OUT, name), text);
    const code = files[0][1];
    console.log(`Đã dựng ${path.relative(ROOT, path.join(OUT, 'cuibap.js'))} — ${(Buffer.byteLength(code) / 1024 / 1024).toFixed(2)} MB, bản dựng ${pack.build}, mã tiện ích ${pack.id}`);
    console.log(`  ${stats.modules} mô-đun · ${stats.classic} script thường · ${stats.html} trang · ${stats.css} css · ${stats.binary} tệp nhị phân · ${stats.assetRefs} ảnh chèn động · location mô phỏng: ${stats.locationShim.join(', ') || '(không)'}`);
  }
}
