/* ============================================================================
 *  CHỤP GIAO DIỆN — mọi trang của tiện ích, có dữ liệu thật từ e-GP giả lập
 *
 *  Dùng để so TRƯỚC / SAU khi đổi thiết kế, và để soát lỗi bố cục bằng mắt:
 *  tràn ngang, chữ chồng, ô nhập vượt khung.
 *
 *  MOCK_CHAOS=autoload node tools/test/ui-shots.mjs <thư-mục-tiện-ích> <thư-mục-ảnh> [rộng×cao,…]
 *  Mặc định chụp 1366×768 (máy văn phòng phổ biến) và 1920×1080.
 *  Kết quả: <thư-mục-ảnh>/<rộng>/<trang>.png và bao-cao.json (tràn ngang, lỗi trang,
 *  cỡ chữ, tương phản WCAG). Trả mã lỗi khi vượt ngưỡng — xem cuối tệp.
 * ========================================================================== */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EXT = process.argv[2];
const OUT = process.argv[3] || 'ui-shots';
const SIZES = (process.argv[4] || '1366x768,1920x1080').split(',').map((s) => s.split('x').map(Number));
const PORT = process.env.MOCK_PORT || 9443;
const UD = fs.mkdtempSync('/tmp/ud-');
const ctx = await chromium.launchPersistentContext(UD, {
  headless: false, viewport: { width: SIZES[0][0], height: SIZES[0][1] },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--disable-dev-shm-usage',
    '--no-first-run', '--no-proxy-server', '--ignore-certificate-errors',
    `--host-resolver-rules=MAP muasamcong.mof.gov.vn 127.0.0.1:${PORT}, MAP muasamcong.mpi.gov.vn 127.0.0.1:${PORT}`]
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const ID = new URL(sw.url()).host;
const ctl = await ctx.newPage();
await ctl.goto(`chrome-extension://${ID}/options.html`);
await ctl.waitForTimeout(800);
const send = (type, payload = {}) => ctl.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [type, payload]);
const cho = async (fn, ms = 90000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await ctl.waitForTimeout(500); } return false; };
const BUSY = ['STARTING', 'OPENING', 'RUNNING', 'LISTING'];

// 1. Nạp dữ liệu: tìm gói thầu, kế hoạch LCNT, gói chờ kết quả — đều ở Lâm Đồng.
const tim = await send('TBMT_SEARCH', { province: 'Lâm Đồng', category: '', keyword: '', investor: '', ward: '',
  mustKeywords: '', excludeKeywords: '', minPrice: '', maxPrice: '', focusTab: false });
await cho(async () => { const r = await send('GET_SEARCH_STATE', { runId: tim?.runId }); const run = r?.selectedRun || (r?.runs || [])[0];
  return run && !BUSY.includes(run.status) && !r?.activeRun; });
console.log('  nạp: tìm gói thầu xong');
for (const p of ctx.pages()) if (/muasamcong/.test(p.url())) await p.close().catch(() => {});
await send('PLAN_LOOKUP', { investor: '', province: 'Lâm Đồng', ward: '', keyword: '', category: '', days: 90, fromDate: '', toDate: '' });
await cho(async () => { const r = await send('GET_PLAN_STATE', {}); const s = r?.lookup || r?.state || r; return s && s.status && !BUSY.includes(s.status); });
console.log('  nạp: kế hoạch LCNT xong');
for (const p of ctx.pages()) if (/muasamcong/.test(p.url())) await p.close().catch(() => {});
await send('BID_OPEN_SCAN', { query: '', taxCode: '', days: 15, fromDate: '', toDate: '', field: '', province: 'Tỉnh Lâm Đồng',
  investor: '', keyword: '', minPrice: 0, maxPrice: 0, maxPackages: 20, focusTab: false });
await cho(async () => { const r = await send('GET_BID_OPEN_STATE'); return r?.scan && !BUSY.includes(r.scan.status); });
await send('CANCEL_BID_OPEN_SCAN').catch(() => {});
await ctl.waitForTimeout(1500);
console.log('  nạp: gói chờ kết quả xong');
for (const p of ctx.pages()) if (/muasamcong/.test(p.url())) await p.close().catch(() => {});

// 2. Chụp mọi trang HTML.
const pages = [];
(function walk(d, rel = '') {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!['icons', 'fonts', 'vendor', 'lib', 'data', 'native-agent'].includes(e.name)) walk(path.join(d, e.name), r); }
    else if (e.name.endsWith('.html')) pages.push(r);
  }
})(EXT);
const bao = { trang: [], loi: [] };
for (const [w, h] of SIZES) {
  const dir = path.join(OUT, String(w));
  fs.mkdirSync(dir, { recursive: true });
  for (const p of pages.sort()) {
    const pg = await ctx.newPage();
    await pg.setViewportSize({ width: w, height: h });
    const loi = [];
    pg.on('pageerror', (e) => loi.push(e.message));
    await pg.goto(`chrome-extension://${ID}/${p}`, { waitUntil: 'load' }).catch((e) => loi.push(e.message));
    await pg.waitForTimeout(1600);
    const do_ = await pg.evaluate(() => {
      const de = document.documentElement;
      const tran = de.scrollWidth - de.clientWidth;
      // Ô nhập / nút vượt khỏi khung cha (lỗi bố cục hay gặp nhất).
      const vuot = [...document.querySelectorAll('input,select,textarea,button')].filter((el) => {
        const r = el.getBoundingClientRect(); return r.width && r.right > de.clientWidth + 1;
      }).length;
      const font = getComputedStyle(document.body).fontFamily.split(',')[0];
      /* ĐỘ DỄ ĐỌC — đo trên mọi phần tử đang hiện có chữ của riêng nó:
         cỡ chữ (px) và độ tương phản chữ/nền theo WCAG 2.1 (AA: ≥ 4,5:1 với
         chữ thường, ≥ 3:1 với chữ lớn ≥ 24px hoặc ≥ 18,66px đậm). Nền lấy từ
         phần tử tổ tiên gần nhất có màu nền đặc; nền ảnh/chuyển màu coi là trắng. */
      const rgb = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(',').map((x) => parseFloat(x)); return { r: v[0], g: v[1], b: v[2], a: v[3] ?? 1 }; };
      const lum = ({ r, g, b }) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const nen = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && c.a >= 0.9) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
      let tong = 0, nho12 = 0, kem = 0; const co = [];
      for (const el of document.querySelectorAll('body *')) {
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        if (!el.getClientRects().length) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
        const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
        if (el.closest('[aria-hidden="true"],.sr-only,.skip-link,option,script,style')) continue;
        tong++;
        const size = parseFloat(cs.fontSize); co.push(size);
        if (size < 12) nho12++;
        const c = rgb(cs.color); if (!c) continue;
        const b = nen(el); const L1 = lum(c), L2 = lum(b);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const lon = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
        if (ratio < (lon ? 3 : 4.5)) kem++;
      }
      co.sort((a, b) => a - b);
      const trungVi = co.length ? co[Math.floor(co.length / 2)] : 0;
      // Tràn ngang: ghi lại phần tử gây tràn để sửa đúng chỗ.
      const thuPham = tran > 0 ? [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.right > de.clientWidth + 1; })
        .slice(-6).map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} (phải ${Math.round(el.getBoundingClientRect().right)}px)`) : [];
      return { tran, vuot, font, cao: de.scrollHeight, chu: { tong, nho12, kem, trungVi }, thuPham };
    });
    const ten = p.replace(/\//g, '_').replace(/\.html$/, '');
    console.log(`  chụp ${w} ${p} (cao ${do_.cao}px)`);
    // Trang rất dài (kho hàng nghìn gói) chụp tới 6000px: ảnh cả trang hàng chục
    // nghìn px làm trình duyệt thử nghiệm sập ngẫu nhiên ("Target crashed").
    await pg.screenshot({ path: path.join(dir, `${ten}.png`), fullPage: true, clip: { x: 0, y: 0, width: w, height: Math.min(do_.cao, 6000) } });
    bao.trang.push({ w, trang: p, ...do_, loi });
    if (do_.tran > 0 || do_.vuot || loi.length) bao.loi.push(`${w} ${p}: tràn ${do_.tran}px, vượt ${do_.vuot}, lỗi ${loi.length}${do_.thuPham.length ? ' — ' + do_.thuPham.join(', ') : ''}`);
    await pg.close();
  }
}
fs.writeFileSync(path.join(OUT, 'bao-cao.json'), JSON.stringify(bao, null, 2));
console.log(`Đã chụp ${bao.trang.length} ảnh vào ${OUT}`);
// Tổng hợp độ dễ đọc ở cỡ màn hình đầu tiên (mỗi trang đếm một lần).
const dau = bao.trang.filter((t) => t.w === SIZES[0][0]);
const cong = (k) => dau.reduce((s, t) => s + t.chu[k], 0);
const tongChu = cong('tong');
console.log(`Độ dễ đọc (${SIZES[0][0]}px, ${dau.length} trang, ${tongChu} khối chữ): `
  + `chữ < 12px ${cong('nho12')} (${(100 * cong('nho12') / Math.max(1, tongChu)).toFixed(1)}%), `
  + `tương phản dưới chuẩn WCAG AA ${cong('kem')} (${(100 * cong('kem') / Math.max(1, tongChu)).toFixed(1)}%), `
  + `phông chính: ${[...new Set(dau.map((t) => t.font))].join(' / ')}`);
for (const t of dau) console.log(`  ${t.trang.padEnd(22)} cỡ giữa ${String(t.chu.trungVi).padStart(5)}px · <12px ${String(t.chu.nho12).padStart(3)}/${String(t.chu.tong).padEnd(4)} · tương phản kém ${t.chu.kem} · ${t.font}`);
for (const l of bao.loi) console.log('  ✗ ' + l);
console.log(bao.loi.length ? `CÓ ${bao.loi.length} TRANG CẦN XEM` : 'ĐẠT — không tràn ngang, không vượt khung, không lỗi trang');
/* Ngưỡng của bản thiết kế 4.18.0 (4.17.3 đo được: 57,9% chữ < 12px, 14,3% tương
   phản kém). Vượt ngưỡng thì kịch bản trả mã lỗi để CI chặn. */
const tile = (k) => 100 * cong(k) / Math.max(1, tongChu);
const vuotNguong = bao.loi.length > 0 || tile('nho12') > 1 || tile('kem') > 1;
if (vuotNguong) console.log(`HỎNG ngưỡng: chữ < 12px ${tile('nho12').toFixed(1)}% (≤ 1%), tương phản kém ${tile('kem').toFixed(1)}% (≤ 1%), trang lỗi ${bao.loi.length}`);
await ctx.close();
fs.rmSync(UD, { recursive: true, force: true });
process.exit(vuotNguong ? 1 : 0);
