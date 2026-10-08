/* ============================================================================
 *  KỊCH BẢN: Bộ săn TBMT với "Quét nhanh phần mới"
 *
 *  node tools/test/hunt-delta.mjs <ext> <A|B|C>
 *    A  (MOCK_CHAOS=honordate,fresh=5)          e-GP lọc ĐÚNG theo ngày đăng:
 *       đầy đủ → nhanh (ít trang hơn, kiểm chứng được) → đầy đủ (đối soát khớp).
 *    B  (MOCK_CHAOS=fresh=5)                    e-GP BỎ QUA bộ lọc ngày:
 *       lượt nhanh phải phát hiện và TỰ TẮT quét nhanh.
 *    C  (MOCK_CHAOS=honordate,datelie,fresh=5)  e-GP lọc SAI, bỏ sót 1 gói:
 *       lượt đầy đủ đối soát phải phát hiện và TỰ TẮT quét nhanh.
 *  Cần MOCK_LOG để đếm số trang e-GP thật sự trả.
 * ========================================================================== */
import { chromium } from 'playwright';
import fs from 'node:fs';

const EXT = process.argv[2];
const CA = process.argv[3] || 'A';
const PORT = process.env.MOCK_PORT || 9443;
const LOG = process.env.MOCK_LOG;
const UD = fs.mkdtempSync('/tmp/ud-');
const ctx = await chromium.launchPersistentContext(UD, {
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--disable-dev-shm-usage',
    '--no-first-run', '--no-proxy-server', '--ignore-certificate-errors', `--host-resolver-rules=MAP muasamcong.mpi.gov.vn 127.0.0.1:${PORT}`]
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const ID = new URL(sw.url()).host;
const page = await ctx.newPage();
await page.goto(`chrome-extension://${ID}/options.html`);
const send = (type, payload = {}) => page.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [type, payload]);
// Bỏ dòng trống: tệp kết thúc bằng '\n' nên split() có phần tử rỗng cuối — đếm lệch 1 dòng.
const logLines = () => (LOG && fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean) : []);

const saved = await send('SAVE_HUNT', { name: 'Thử quét nhanh', kind: 'tbmt', delta: true, enabled: true, times: '23:59',
  criteria: { province: 'Lâm Đồng', keyword: '', investor: '', ward: '', mustKeywords: '', excludeKeywords: '', minPrice: '', maxPrice: '' } });
if (!saved?.ok) { console.log('Không lưu được bộ săn:', saved?.message); process.exit(1); }
const HID = saved.hunts[0].id;
const hunt = async () => ((await send('GET_STATE'))?.hunts || []).find((h) => h.id === HID);

async function chay(nhan, opts = {}) {
  const truoc = logLines().length;
  const before = (await hunt())?.lastCompletedJobId || '';
  const r = await send('RUN_HUNT', { id: HID, ...opts });
  if (!r?.ok) throw new Error(`${nhan}: không chạy được — ${r?.message}`);
  let h = null;
  for (let i = 0; i < 300; i++) {
    await page.waitForTimeout(400);
    h = await hunt();
    if (h?.lastCompletedJobId && h.lastCompletedJobId !== before && h.lastStatus !== 'RUNNING') break;
  }
  await page.waitForTimeout(600);
  h = await hunt();
  const moi = logLines().slice(truoc).filter((l) => /\[mock\] SEARCH page=/.test(l) && /filters=type/.test(l));
  const trang = moi.length, coSan = moi.some((l) => /publicDate/.test(l));
  const tuCache = trang === 0 && h.lastStatus === 'SUCCESS';
  console.log(`  ${nhan}: ${h.lastStatus} · ${tuCache ? 'lấy từ bộ nhớ đệm (≤2 phút), không hỏi e-GP' : `e-GP trả ${trang} trang${coSan ? ' (có sàn ngày đăng)' : ''}`} · ${String(h.lastMessage).slice(0, 150)}`);
  return { h, trang, coSan };
}

const loi = [];
const can = (dk, msg) => { if (!dk) loi.push(msg); };
const r1 = await chay('Lượt 1');
can(r1.h.lastStatus === 'SUCCESS' && !r1.coSan && r1.h.deltaState.lastFullAt, 'lượt 1 phải quét ĐẦY ĐỦ và ghi mốc');
const r2 = await chay('Lượt 2');
can(r2.coSan, 'lượt 2 phải là quét nhanh (gửi sàn ngày đăng)');
if (CA === 'A') {
  can(r2.h.lastStatus === 'SUCCESS' && r2.trang < r1.trang, `quét nhanh phải ít trang hơn (${r2.trang} so với ${r1.trang})`);
  can(r2.h.deltaState.proven && !r2.h.deltaState.broken, 'bộ lọc phải được kiểm chứng');
  const r3 = await chay('Lượt 3 (đầy đủ, đối soát)', { full: true });
  can(!r3.coSan && !r3.h.deltaState.broken && /khớp/.test(r3.h.lastMessage), 'đối soát phải khớp');
} else if (CA === 'B') {
  can(r2.h.deltaState.broken && /không lọc theo ngày đăng/.test(r2.h.deltaState.brokenReason), 'phải phát hiện e-GP bỏ qua bộ lọc');
  const r3 = await chay('Lượt 3');
  can(!r3.coSan, 'sau khi tự tắt, lượt sau phải quét đầy đủ');
} else {
  can(r2.h.deltaState.proven && !r2.h.deltaState.broken, 'lượt nhanh (đã sót 1 gói) chưa thể tự biết');
  const r3 = await chay('Lượt 3 (đầy đủ, đối soát)', { full: true });
  can(r3.h.deltaState.broken && /KHÔNG trả về/.test(r3.h.deltaState.brokenReason), 'đối soát phải phát hiện gói bị sót');
  const r4 = await chay('Lượt 4');
  can(!r4.coSan, 'sau khi tự tắt, lượt sau phải quét đầy đủ');
}
console.log(loi.length ? `\nHỎNG ca ${CA}:\n  ✗ ${loi.join('\n  ✗ ')}` : `\nĐẠT ca ${CA}`);
await ctx.close();
fs.rmSync(UD, { recursive: true, force: true });
process.exit(loi.length ? 1 : 0);
