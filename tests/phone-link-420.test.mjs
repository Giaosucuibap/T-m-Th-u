/* ============================================================================
 *  4.20.0 — LINK ĐIỆN THOẠI: phần tiện ích và tệp cài.
 *
 *  - lib/phone-link.js (thuần): khoá, link, lọc tiêu chí, kết quả gửi điện thoại,
 *    tin Telegram;
 *  - lib/runtime-phone.js: chạy với cổng native + kho GIẢ — lệnh tìm từ điện thoại
 *    đi đúng luồng Tìm gói thầu, chặn khi khoá chỉnh sửa, quá giờ thì dừng, gửi
 *    link mới qua Telegram đúng một lần (và không thành tin rác khi lỗi);
 *  - hợp đồng giữa ba phía (tiện ích ↔ DienThoai.exe ↔ trang trên iPhone) và tệp
 *    cài native-agent/link-dien-thoai.ps1 (cài thật chỉ chạy trên Windows của CI).
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  PHONE_HOST, PHONE_STORE_KEY, PHONE_MAX_TENDERS, PHONE_CRITERIA_FIELDS, newPhoneKey, phoneLinkUrl, cleanPhoneCriteria,
  phoneProgress, buildPhoneResult, phoneLinkMessage, isPrivateTelegramChat
} from '../GiaoSuCuiBap/lib/phone-link.js';
import { createPhoneRuntime, TELEGRAM_RETRY_MS } from '../GiaoSuCuiBap/lib/runtime-phone.js';
import { phoneHandlers } from '../GiaoSuCuiBap/lib/handlers/phone.js';
import { extractExe, CI_EXES } from '../tools/release/lay-cau-noi-tu-ci.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const KEY = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const URL_UP = 'https://ba-chu-ngau-nhien.trycloudflare.com';
const ORIGIN = 'chrome-extension://injgpddgeaedalfgbnnbobdidghjncoj/';
const WIN = process.platform === 'win32';

test('khoá 32 ký tự base64url; link chỉ nhận đường hầm trycloudflare thật, hoặc 127.0.0.1 ở chế độ thử', () => {
  const k = newPhoneKey();
  assert.match(k, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(newPhoneKey(), k);
  assert.equal(newPhoneKey(() => new Uint8Array(24).fill(255)), '_'.repeat(32));
  assert.equal(phoneLinkUrl({ state: 'up', url: URL_UP }, KEY), `${URL_UP}/#k=${KEY}`);
  assert.equal(phoneLinkUrl({ state: 'off', url: 'http://127.0.0.1:51234' }, KEY), `http://127.0.0.1:51234/#k=${KEY}`);
  for (const t of [
    { state: 'up', url: 'https://api.trycloudflare.com' },
    { state: 'up', url: 'https://evil.example.com' },
    { state: 'up', url: 'http://x.trycloudflare.com' },
    { state: 'up', url: 'https://x.trycloudflare.com.evil.com' },
    { state: 'up', url: `${URL_UP}/duong-dan` },
    { state: 'starting', url: URL_UP },
    { state: 'down', url: URL_UP },
    { state: 'off', url: 'http://192.168.1.5:8080' },
    { state: 'up', url: 'http://127.0.0.1:5000' }
  ]) assert.equal(phoneLinkUrl(t, KEY), '', JSON.stringify(t));
  assert.equal(phoneLinkUrl({ state: 'up', url: URL_UP }, 'ngan'), '');
  assert.equal(phoneLinkUrl({ state: 'up', url: URL_UP }, `${'a'.repeat(31)}!`), '');
});

test('tiêu chí từ điện thoại: chỉ trường đã biết, dạng chuỗi/số, tối đa 500 ký tự — khớp danh sách của DienThoai.cs', () => {
  assert.deepEqual(
    cleanPhoneCriteria({ province: '  Lâm Đồng ', keyword: 'x'.repeat(900), minPrice: 1000000000, evil: 'rm -rf', category: ['a'], investor: { a: 1 }, ward: null }),
    { province: 'Lâm Đồng', keyword: 'x'.repeat(500), minPrice: '1000000000' });
  assert.deepEqual(cleanPhoneCriteria(null), {});
  assert.deepEqual(cleanPhoneCriteria(['province']), {});
  const m = read('native-agent/DienThoai.cs').match(/AllowedCriteria = \{([^}]*)\}/);
  assert.ok(m, 'DienThoai.cs có danh sách AllowedCriteria');
  assert.deepEqual(m[1].split(',').map((s) => s.trim().replace(/"/g, '')), [...PHONE_CRITERIA_FIELDS]);
});

const NOW = Date.parse('2026-11-08T03:00:00Z');
const egp = 'https://muasamcong.mof.gov.vn/web/guest/contractor-selection?p_p_id=x&id=';
function tender(i, { open = true, notify = true } = {}) {
  return {
    key: `IB26000${i}-00`, notifyNo: notify ? `IB26000${i}` : '', bidNo: `BP${i}`, bidName: `Gói ${i}: nạo vét kênh`,
    investorName: 'Ban QLDA', location: 'Lâm Đồng', price: 1000000000 + i,
    closeDate: new Date(NOW + (open ? 1 : -1) * 86400000 * (i + 1)).toISOString(),
    detailUrl: i % 2 ? `${egp}${i}` : `https://evil.example.com/${i}`, score: 50 + i
  };
}

test('kết quả gửi điện thoại: khớp tiêu chí và gói còn nhận hồ sơ lên đầu, link lạ bị bỏ, đếm đúng, cắt ở 1.000 gói', () => {
  const tenders = [tender(1, { open: false }), tender(2), tender(3), tender(4, { notify: false })];
  const run = {
    id: 'run-1', status: 'SUCCESS', criteria: { province: 'Lâm Đồng', keyword: '', evil: 'x' }, coverage: { complete: true, fetched: 4, pagesRead: 1, totalPages: 1, serverTotal: 4, text: 'Đã đọc 1/1 trang' },
    resultStates: {
      [tenders[0].key]: { filterState: 'MATCH', matched: true, score: 90 },
      [tenders[1].key]: { filterState: 'MATCH', matched: true, score: 70 },
      [tenders[2].key]: { filterState: 'OUT_OF_RANGE', filterReason: 'price' },
      [tenders[3].key]: { filterState: 'INSUFFICIENT' }
    }
  };
  const r = buildPhoneResult(run, tenders, NOW);
  assert.equal(r.status, 'SUCCESS');
  assert.equal(r.ok, true);
  assert.deepEqual(r.criteria, { province: 'Lâm Đồng' });
  assert.deepEqual(r.counts, { fetched: 4, unique: 4, match: 2, insufficient: 1, outOfRange: 1 });
  assert.deepEqual(r.tenders.map((t) => t.key), [tenders[1].key, tenders[0].key, tenders[3].key, tenders[2].key], 'MATCH (còn hạn trước) → INSUFFICIENT → OUT_OF_RANGE');
  assert.equal(r.tenders[0].bidState, 'OPEN');
  assert.equal(r.tenders[1].bidState, 'CLOSED');
  assert.equal(r.tenders[2].bidState, 'PLAN');
  assert.equal(r.tenders.find((t) => t.key === tenders[1].key).detailUrl, '', 'đường dẫn ngoài e-GP bị bỏ');
  assert.match(r.tenders.find((t) => t.key === tenders[0].key).detailUrl, /^https:\/\/muasamcong\.mof\.gov\.vn\//);
  assert.equal(r.truncated, false);

  assert.equal(buildPhoneResult({ status: 'TIMEOUT' }, [tender(1)], NOW).status, 'PARTIAL');
  assert.equal(buildPhoneResult({ status: 'TIMEOUT' }, [], NOW).status, 'ERROR');
  assert.equal(buildPhoneResult({ status: 'LẠ' }, [], NOW).ok, false);

  const many = Array.from({ length: PHONE_MAX_TENDERS + 5 }, (_, i) => ({ ...tender(1), key: `K${i}` }));
  const big = buildPhoneResult({ status: 'SUCCESS' }, many, NOW);
  assert.equal(big.tenders.length, PHONE_MAX_TENDERS);
  assert.equal(big.truncated, true);
  assert.equal(big.counts.unique, PHONE_MAX_TENDERS + 5);
  assert.match(big.notes[0], /1000 gói đầu/);
  assert.ok(JSON.stringify(big).length < 32 * 1024 * 1024, 'vừa khung native messaging 32 MB của DienThoai.exe');

  assert.deepEqual(phoneProgress({ status: 'RUNNING', message: 'Đang đọc trang 2', coverage: { pagesRead: 2, totalPages: 5, serverTotal: 240 }, sourceCount: 100 }),
    { status: 'RUNNING', message: 'Đang đọc trang 2', fetched: 100, pagesRead: 2, totalPages: 5, serverTotal: 240 });
});

test('tin Telegram: link nằm trong thẻ <a> đã thoát ký tự; chỉ chat riêng (Chat ID số dương) được nhận link có khoá', () => {
  const msg = phoneLinkMessage(`${URL_UP}/#k=${KEY}`, NOW);
  assert.ok(msg.includes(`<a href="${URL_UP}/#k=${KEY}">`));
  assert.match(msg, /10:00:00 8\/11\/2026|8\/11\/2026,? 10:00:00/, 'giờ Việt Nam, không phụ thuộc múi giờ máy');
  assert.match(phoneLinkMessage('https://a.trycloudflare.com/#k="><b>', NOW), /href="https:\/\/a\.trycloudflare\.com\/#k=&quot;&gt;&lt;b&gt;"/);
  for (const ok of ['123456789', ' 42 ']) assert.equal(isPrivateTelegramChat(ok), true, ok);
  for (const bad of ['-1001234567890', '-42', '@kenh_cong_ty', '', null, '12a']) assert.equal(isPrivateTelegramChat(bad), false, String(bad));
});

/* ---------------------------------------------------------------- runtime giả */
function fakeWorld({ blocked = null, start = null, runs = null } = {}) {
  const store = {};
  const storage = {
    async get(defaults) { const out = {}; for (const [k, v] of Object.entries(defaults)) out[k] = k in store ? structuredClone(store[k]) : v; return out; },
    async set(obj) { for (const [k, v] of Object.entries(obj)) store[k] = structuredClone(v); }
  };
  const ports = [];
  const runtime = {
    lastError: null,
    connectNative(host) {
      const listeners = { msg: [], disc: [] };
      const port = {
        host, sent: [], disconnected: false,
        onMessage: { addListener: (f) => listeners.msg.push(f) },
        onDisconnect: { addListener: (f) => listeners.disc.push(f) },
        postMessage(m) { if (port.disconnected) throw new Error('đóng rồi'); port.sent.push(structuredClone(m)); },
        disconnect() { port.disconnected = true; },
        emit(m) { for (const f of listeners.msg) f(m); },
        drop(message) { port.disconnected = true; runtime.lastError = message ? { message } : null; for (const f of listeners.disc) f(); runtime.lastError = null; }
      };
      ports.push(port);
      return port;
    }
  };
  let clock = NOW;
  const calls = { start: [], cancel: [], enabled: [], telegram: [] };
  let activeReads = 0;
  const world = {
    store, ports, calls, telegramReply: { ok: true, message: 'Đã gửi.' },
    advance(ms) { clock += ms; },
    runtime: createPhoneRuntime({
      storage, runtime, version: '4.20.0',
      startSearch: async (payload) => { calls.start.push(payload); return start ? start(payload) : { ok: true, runId: 'run-7' }; },
      cancelSearch: async (runId) => { calls.cancel.push(runId); },
      readActiveRun: async () => { activeReads++; return runs ? runs(activeReads) : (activeReads < 3 ? { id: 'run-7', status: 'RUNNING', coverage: { pagesRead: activeReads, totalPages: 2 } } : null); },
      readFinishedRun: async (runId) => ({ run: { id: runId, status: 'SUCCESS', coverage: { complete: true } }, tenders: [tender(2)] }),
      blockedReason: async () => blocked,
      onEnabledChange: async (on) => { calls.enabled.push(on); },
      sendLinkMessage: async (text) => { calls.telegram.push(text); return world.telegramReply; },
      now: () => clock,
      sleep: async (ms) => { clock += ms; await new Promise((r) => setImmediate(r)); },
      pollMs: 1000, jobTimeoutMs: 60 * 1000
    })
  };
  return world;
}
const settle = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

test('bật link: mở đúng cầu nối, gửi khoá hợp lệ; đường hầm lên thì có link; trạng thái không bao giờ lộ khoá', async () => {
  const w = fakeWorld();
  let s = await w.runtime.setEnabled(true);
  assert.deepEqual(w.calls.enabled, [true]);
  assert.equal(w.ports.length, 1);
  assert.equal(w.ports[0].host, PHONE_HOST);
  const config = w.ports[0].sent[0];
  assert.equal(config.type, 'config');
  assert.match(config.key, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(w.store[PHONE_STORE_KEY].key, config.key);
  assert.equal(s.link, '');
  w.ports[0].emit({ type: 'ready', version: '1.0.0', port: 50123, tunnel: { state: 'starting', url: '', code: '' } });
  w.ports[0].emit({ type: 'tunnel', state: 'up', url: URL_UP, code: '' });
  await settle();
  s = await w.runtime.state();
  assert.equal(s.host.connected, true);
  assert.equal(s.link, `${URL_UP}/#k=${config.key}`);
  assert.equal('key' in s, false);
  assert.equal(JSON.stringify(s).split(config.key).length - 1, 1, 'khoá chỉ xuất hiện trong link, không ở trường nào khác');

  await w.runtime.ensure();
  assert.equal(w.ports.length, 1, 'đang nối thì không mở cổng thứ hai');
  w.ports[0].drop('Native host has exited.');
  await settle();
  s = await w.runtime.state();
  assert.equal(s.host.connected, false);
  assert.match(s.host.error, /exited/);
  assert.equal(s.link, '');
  await w.runtime.ensure();
  assert.equal(w.ports.length, 2, 'báo thức mỗi phút nối lại');
  assert.equal(w.ports[1].sent[0].key, config.key, 'nối lại vẫn giữ khoá cũ — mã QR cũ còn dùng được');

  s = await w.runtime.setEnabled(false);
  assert.deepEqual(w.calls.enabled, [true, false]);
  assert.equal(w.ports[1].disconnected, true);
  assert.equal(s.enabled, false);
  assert.equal(s.link, '');
});

test('lệnh tìm từ điện thoại: tiêu chí được lọc, chạy đúng luồng Tìm gói thầu (không giật tab), có tiến độ rồi kết quả', async () => {
  const w = fakeWorld();
  await w.runtime.setEnabled(true);
  const port = w.ports[0];
  port.emit({ type: 'job', id: 'abcdef1234', op: 'search', criteria: { province: 'Lâm Đồng', keyword: 'kênh', evil: 'x', focusTab: true } });
  await settle(60);
  assert.deepEqual(w.calls.start, [{ province: 'Lâm Đồng', keyword: 'kênh', focusTab: false }]);
  const sent = port.sent.slice(1);
  const progress = sent.filter((m) => m.type === 'job-progress');
  assert.ok(progress.length >= 1);
  assert.equal(progress[0].id, 'abcdef1234');
  const done = sent.find((m) => m.type === 'job-result');
  assert.ok(done, JSON.stringify(sent));
  const result = JSON.parse(done.resultJson);
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.tenders.length, 1);
  assert.equal(w.store[PHONE_STORE_KEY].lastJobStatus, 'SUCCESS');

  port.emit({ type: 'job', id: 'KHONG-HOP-LE', op: 'search', criteria: {} });
  port.emit({ type: 'job', id: '../../x', op: 'search', criteria: {} });
  await settle();
  assert.equal(w.calls.start.length, 1, 'mã lệnh sai dạng bị bỏ qua');
});

test('chặn: khoá chỉnh sửa / e-GP đổi cấu trúc → báo lỗi, không tra; lượt chồng → PC_BUSY; quá giờ → dừng lượt và báo TIMEOUT', async () => {
  const ro = fakeWorld({ blocked: 'READ_ONLY' });
  await ro.runtime.setEnabled(true);
  ro.ports[0].emit({ type: 'job', id: 'aaaaaaaa01', op: 'search', criteria: { province: 'Lâm Đồng' } });
  await settle();
  assert.equal(ro.calls.start.length, 0);
  assert.deepEqual(ro.ports[0].sent.at(-1), { type: 'job-error', id: 'aaaaaaaa01', code: 'READ_ONLY', message: '' });

  const busy = fakeWorld({ start: () => ({ ok: false, run: { id: 'khac' }, message: 'Đang có lượt khác.' }) });
  await busy.runtime.setEnabled(true);
  busy.ports[0].emit({ type: 'job', id: 'bbbbbbbb01', op: 'search', criteria: {} });
  await settle();
  assert.equal(busy.ports[0].sent.at(-1).code, 'PC_BUSY');

  const slow = fakeWorld({ runs: () => ({ id: 'run-7', status: 'RUNNING', coverage: {} }) });
  await slow.runtime.setEnabled(true);
  slow.ports[0].emit({ type: 'job', id: 'cccccccc01', op: 'search', criteria: {} });
  await settle(5);
  slow.ports[0].emit({ type: 'job', id: 'dddddddd01', op: 'search', criteria: {} });
  await settle(5);
  const second = slow.ports[0].sent.find((m) => m.id === 'dddddddd01');
  assert.equal(second?.code, 'PC_BUSY', 'một lượt điện thoại một lúc');
  slow.ports[0].emit({ type: 'job', id: 'eeeeeeee01', op: 'cancel', target: 'cccccccc01' });
  await settle(200);
  assert.ok(slow.calls.cancel.includes('run-7'), 'Dừng từ điện thoại huỷ đúng lượt');
  const timeout = slow.ports[0].sent.find((m) => m.id === 'cccccccc01' && m.type === 'job-error');
  assert.equal(timeout?.code, 'TIMEOUT');
});

test('đổi khoá: gửi khoá mới cho cầu nối, link đổi theo; khoá cũ không còn trong kho', async () => {
  const w = fakeWorld();
  await w.runtime.setEnabled(true);
  w.ports[0].emit({ type: 'tunnel', state: 'up', url: URL_UP, code: '' });
  await settle();
  const old = (await w.runtime.state()).link;
  const s = await w.runtime.rotateKey();
  const cfg = w.ports[0].sent.filter((m) => m.type === 'config');
  assert.equal(cfg.length, 2);
  assert.notEqual(cfg[1].key, cfg[0].key);
  assert.notEqual(s.link, old);
  assert.equal(s.link, `${URL_UP}/#k=${cfg[1].key}`);
  assert.ok(!JSON.stringify(w.store).includes(cfg[0].key));
});

test('Telegram: tắt mặc định; bật thì gửi link hiện tại MỘT lần; link đổi thì gửi lại; lỗi thì thử lại sau 10 phút, không gửi rác mỗi phút', async () => {
  const w = fakeWorld();
  await w.runtime.setEnabled(true);
  const port = w.ports[0];
  port.emit({ type: 'tunnel', state: 'up', url: URL_UP, code: '' });
  await settle();
  assert.equal(w.calls.telegram.length, 0, 'mặc định không gửi');

  let s = await w.runtime.setTelegram(true);
  assert.equal(w.calls.telegram.length, 1);
  assert.ok(w.calls.telegram[0].includes(s.link));
  assert.equal(s.telegramSentCurrent, true);
  port.emit({ type: 'tunnel', state: 'up', url: URL_UP, code: '' });
  await w.runtime.ensure();
  await settle();
  assert.equal(w.calls.telegram.length, 1, 'cùng link không gửi lại');

  port.emit({ type: 'tunnel', state: 'down', url: '', code: 'TUNNEL_RESTARTING' });
  port.emit({ type: 'tunnel', state: 'up', url: 'https://link-moi-sau-khoi-dong.trycloudflare.com', code: '' });
  await settle(40);
  assert.equal(w.calls.telegram.length, 2, 'đường hầm mở lại → gửi link mới');
  assert.match(w.calls.telegram[1], /link-moi-sau-khoi-dong/);

  w.telegramReply = { ok: false, message: 'Bot Token sai hoặc đã bị thu hồi.' };
  s = await w.runtime.rotateKey();
  assert.equal(w.calls.telegram.length, 3);
  assert.equal(s.telegramSentCurrent, false);
  assert.equal(s.telegramLast.ok, false);
  assert.match(s.telegramLast.message, /Bot Token sai/);
  for (let i = 0; i < 5; i++) { w.advance(60 * 1000); await w.runtime.ensure(); }
  assert.equal(w.calls.telegram.length, 3, 'lỗi: báo thức mỗi phút KHÔNG gửi lại ngay');
  w.telegramReply = { ok: true, message: 'Đã gửi.' };
  w.advance(TELEGRAM_RETRY_MS);
  s = await w.runtime.ensure();
  assert.equal(w.calls.telegram.length, 4, 'sau 10 phút thử lại');
  assert.equal((await w.runtime.state()).telegramSentCurrent, true);

  await w.runtime.setTelegram(false);
  await w.runtime.rotateKey();
  assert.equal(w.calls.telegram.length, 4, 'tắt rồi thì không gửi');

  const t = fakeWorld();
  await t.runtime.setEnabled(true);
  t.ports[0].emit({ type: 'ready', version: '1.0.0', port: 50000, tunnel: { state: 'off', url: 'http://127.0.0.1:50000', code: 'NO_TUNNEL' } });
  await settle();
  await t.runtime.setTelegram(true);
  assert.equal(t.calls.telegram.length, 0, 'link 127.0.0.1 (chế độ thử) không bao giờ gửi đi');
});

test('lệnh trang: đúng 4 lệnh, lệnh ghi đều có tiền tố SET_ (bị chặn khi khoá chỉnh sửa), trang e-GP không gọi được', () => {
  const types = Object.keys(phoneHandlers({ phoneRuntime: {} })).sort();
  assert.deepEqual(types, ['PHONE_LINK_STATE', 'SET_PHONE_LINK', 'SET_PHONE_LINK_KEY', 'SET_PHONE_LINK_TELEGRAM']);
  const bg = read('GiaoSuCuiBap/background.js');
  const content = bg.slice(bg.indexOf('const CONTENT_MESSAGE_TYPES=new Set(['), bg.indexOf(']);', bg.indexOf('const CONTENT_MESSAGE_TYPES=new Set([')));
  assert.ok(content.length > 40);
  for (const t of types) assert.ok(!content.includes(`'${t}'`), `${t} không thuộc lệnh của trang e-GP`);
  assert.match(bg, /mutating=\/\^\(SAVE_\|DELETE_\|CLEAR_\|SET_\|IMPORT_\)\//);
  assert.match(bg, /if\(alarm\.name===PHONE_ALARM\)\{await phoneRuntime\.ensure\(\)/);
  assert.match(bg, /isPrivateTelegramChat\(s\.settings\.telegramChatId\)/, 'nơi gửi Telegram tự kiểm chat riêng');
});

test('ba phía cùng một hợp đồng: mã tiện ích, tên cầu nối, tiêu đề khoá, khoá sau dấu #', () => {
  const manifest = JSON.parse(read('GiaoSuCuiBap/manifest.json'));
  assert.ok(manifest.permissions.includes('nativeMessaging'));
  const id = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32)
    .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
  assert.equal(`chrome-extension://${id}/`, ORIGIN, 'mã tiện ích suy từ khoá manifest');
  const cs = read('native-agent/DienThoai.cs');
  const ps = read('native-agent/link-dien-thoai.ps1');
  const web = read('mobile-app/src/egp/EgpProvider.web.js');
  assert.ok(cs.includes(`Origin = "${ORIGIN.replace(/\/$/, '')}"`));
  assert.ok(ps.includes(`$Origin = '${ORIGIN}'`));
  assert.ok(ps.includes(`$HostName = '${PHONE_HOST}'`));
  for (const src of [cs, web]) assert.ok(src.includes('X-GSCB-Key'), 'cùng tiêu đề khoá');
  assert.match(web, /#k=|k=/);
  assert.ok(phoneLinkUrl({ state: 'up', url: URL_UP }, KEY).includes('/#k='));
  assert.ok(cs.includes('"^[A-Za-z0-9_-]{24,128}$"'), 'cầu nối đòi đúng dạng khoá tiện ích sinh');
});

test('tệp cài: chỉ chữ ASCII; cloudflared ghim đúng bản/kích thước/SHA-256 như tài liệu; .bat xuống dòng CRLF', () => {
  const ps = read('native-agent/link-dien-thoai.ps1');
  assert.equal(/[^\x00-\x7f]/.test(ps), false, 'PowerShell 5.1 đọc tệp không BOM theo bảng mã máy — phải ASCII');
  const version = ps.match(/\$CfVersion = '([^']+)'/)[1];
  const size = ps.match(/\$CfSize = (\d+)/)[1];
  const sha = ps.match(/\$CfSha256 = '([0-9a-f]{64})'/)[1];
  assert.equal(version, '2026.10.7');
  const doc = read('native-agent/DIEN-THOAI-GIAO-THUC.md');
  assert.ok(doc.includes(version) && doc.includes(sha) && doc.includes(Number(size).toLocaleString('vi-VN')), 'tài liệu ghi đúng bản đã ghim');
  assert.ok(ps.includes("'https://github.com/cloudflare/cloudflared/releases/download/' + $CfVersion + '/cloudflared-windows-amd64.exe'"));
  assert.match(ps, /if \(\$why\) \{ Remove-Item -LiteralPath \$tmp -Force; throw/, 'tệp tải về sai thì xoá, không cài');
  assert.match(ps, /HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\/);
  for (const bat of ['BAT-LINK-DIEN-THOAI.bat', 'GO-LINK-DIEN-THOAI.bat']) {
    const raw = fs.readFileSync(path.join(root, 'native-agent', bat), 'latin1');
    assert.equal(/[^\x00-\x7f]/.test(raw), false);
    assert.equal(raw.split('\n').length - 1, raw.split('\r\n').length - 1, `${bat} dùng CRLF`);
    assert.ok(raw.includes('link-dien-thoai.ps1'));
  }
  const html = read('GiaoSuCuiBap/phone.html');
  assert.ok(!/<script>(?!<\/script>)/.test(html) && !/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'trang tiện ích không có script nội tuyến');
  const vendor = read('GiaoSuCuiBap/lib/vendor/qrcode-generator.js');
  assert.match(vendor, /qrcode-generator 1\.4\.4 — Kazuhiko Arase, giấy phép MIT/);
});

test('CI Windows: biên dịch CẢ HAI cầu nối trước npm test; giữ cả hai tệp; công cụ lấy tệp tách đúng từng khối có tên', () => {
  const ci = read('.github/workflows/kiem-thu.yml');
  const win = ci.slice(ci.indexOf('  windows:'), ci.indexOf('  trinh-duyet:'));
  const testAt = win.indexOf('run: npm test');
  for (const src of ['native-agent\\NativeHost.cs', 'native-agent\\DienThoai.cs']) {
    const at = win.indexOf(src);
    assert.ok(at > 0 && at < testAt, `${src} biên dịch trước bộ kiểm thử`);
  }
  for (const name of CI_EXES) assert.ok(win.includes(`native-agent/${name}.sha256`), `artifact giữ ${name}`);
  assert.match(win, /continue-on-error: true\n\s+timeout-minutes: \d+\n\s+run: node tools\/test\/phone-tunnel-live\.mjs/, 'chỉ bước mạng thật (dịch vụ ngoài) không chặn CI');
  const app = ci.slice(ci.indexOf('  app-di-dong:'), ci.indexOf('  windows:'));
  assert.ok(app.includes('EXPO_PUBLIC_GSCB_MODE: remote') && app.includes('tools/test/phone-link.mjs') && app.includes('tests/dien-thoai-host-420.test.mjs'));

  const block = (bytes, name) => {
    const h = createHash('sha256').update(bytes).digest('hex');
    const b64 = bytes.toString('base64');
    const lines = [`2026-11-08T10:00:00.0000000Z GSCB-EXE-BEGIN ${h} ${b64.length}${name ? ` ${name}` : ''}`];
    for (let i = 0; i < b64.length; i += 50) lines.push(`2026-11-08T10:00:00.0000000Z GSCB-EXE ${b64.slice(i, i + 50)}`);
    lines.push('2026-11-08T10:00:00.0000000Z GSCB-EXE-END');
    return lines.join('\r\n');
  };
  const a = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]);
  const b = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(300, 2)]);
  const log = ['noise', block(a, CI_EXES[0]), 'giữa', block(b, CI_EXES[1]), 'cuối'].join('\r\n');
  assert.ok(extractExe(log, CI_EXES[0]).bytes.equals(a));
  assert.ok(extractExe(log, CI_EXES[1]).bytes.equals(b));
  assert.ok(extractExe(block(a, ''), CI_EXES[0]).bytes.equals(a), 'khối không tên (nhật ký 4.19.0) là cầu nối E-HSMT');
  assert.throws(() => extractExe(block(a, ''), CI_EXES[1]), /cho GiaoSuCuiBap\.DienThoai\.exe/);
});

/* Cài THẬT: chỉ trên Windows của CI (máy ảo dùng một lần). Trên máy anh Thắng bài này
   không chạy — nó cài/gỡ đúng thư mục và khoá HKCU của Link điện thoại thật. */
const CI_WIN = WIN && process.env.CI === 'true' && fs.existsSync(path.join(root, 'native-agent', 'GiaoSuCuiBap.DienThoai.exe'));
test('Windows (CI): cài thật — tải cloudflared đúng mã, ghi tệp kê khai + HKCU, kiểm tra, cài lại, gỡ sạch', CI_WIN ? { timeout: 300000 } : { skip: 'chỉ chạy trên Windows của CI (cài/gỡ thật)' }, () => {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'gscb-link-'));
  const exe = path.join(root, 'native-agent', 'GiaoSuCuiBap.DienThoai.exe');
  fs.copyFileSync(path.join(root, 'native-agent', 'link-dien-thoai.ps1'), path.join(stage, 'link-dien-thoai.ps1'));
  fs.copyFileSync(exe, path.join(stage, 'GiaoSuCuiBap.DienThoai.exe'));
  const exeHash = createHash('sha256').update(fs.readFileSync(exe)).digest('hex');
  fs.writeFileSync(path.join(stage, 'GiaoSuCuiBap.DienThoai.exe.sha256'), `${exeHash}  GiaoSuCuiBap.DienThoai.exe\n`);
  fs.mkdirSync(path.join(stage, 'web'));
  fs.writeFileSync(path.join(stage, 'web', 'index.html'), '<!doctype html><title>GSCB</title>');
  const ps = (args) => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(stage, 'link-dien-thoai.ps1'), ...args], { encoding: 'utf8', windowsHide: true, timeout: 240000 });
  const dest = path.join(process.env.LOCALAPPDATA, 'GiaoSuCuiBap', 'DienThoai');
  const reg = () => spawnSync('reg.exe', ['query', 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\vn.giaosucuibap.dienthoai', '/ve'], { encoding: 'utf8' });
  try {
    const first = ps([]);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.match(first.stdout, /Da tai cloudflared, dung kich thuoc va ma SHA-256/);
    assert.match(first.stdout, /Chu ky so cloudflared: Valid - Cloudflare, Inc\./, 'Windows xác nhận chữ ký số Cloudflare');
    assert.match(first.stdout, /XONG/);
    const manifestPath = path.join(dest, 'vn.giaosucuibap.dienthoai.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.deepEqual(manifest, { name: PHONE_HOST, description: 'Giao Su Cui Bap - Link dien thoai', path: path.join(dest, 'GiaoSuCuiBap.DienThoai.exe'), type: 'stdio', allowed_origins: [ORIGIN] });
    assert.ok(reg().stdout.includes(manifestPath), 'HKCU trỏ đúng tệp kê khai');
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(dest, 'GiaoSuCuiBap.DienThoai.exe'))).digest('hex'), exeHash);
    assert.ok(fs.existsSync(path.join(dest, 'web', 'index.html')));
    const check = ps(['-KiemTra']);
    assert.equal(check.status, 0, check.stdout + check.stderr);
    const again = ps([]);
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.match(again.stdout, /cloudflared 2026\.10\.7 da co san va dung ma SHA-256/, 'cài lại không tải lại');
    fs.writeFileSync(path.join(stage, 'GiaoSuCuiBap.DienThoai.exe'), Buffer.concat([fs.readFileSync(exe), Buffer.from('x')]));
    const tampered = ps([]);
    assert.notEqual(tampered.status, 0, 'tệp cầu nối bị sửa thì không cài');
  } finally {
    const go = ps(['-Go']);
    assert.equal(go.status, 0, go.stdout + go.stderr);
    fs.rmSync(stage, { recursive: true, force: true });
  }
  assert.notEqual(reg().status, 0, 'khoá HKCU đã gỡ');
  assert.equal(fs.existsSync(dest), false, 'thư mục cài đã gỡ');
});
