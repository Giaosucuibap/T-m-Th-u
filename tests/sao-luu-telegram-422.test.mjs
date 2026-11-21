/* ============================================================================
 *  SAO LƯU TỰ ĐỘNG LÊN TELEGRAM (4.22.0)
 *
 *  Khoá: mỗi ngày tối đa một tệp; dữ liệu không đổi thì không gửi lại (nhưng sau 7 ngày
 *  vẫn gửi để biết còn chạy); gửi hỏng thì 60 phút sau mới thử lại; tệp không chứa
 *  Bot Token / Chat ID; tệp lớn được nén và NHẬP LẠI ĐƯỢC; lượt chạy trùng không gửi
 *  hai tệp; đang khoá tự động hoá thì không gửi.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { backupDecision, backupFingerprint, backupCaption, backupReasonText, packBackup, readBackupBytes, isGzip, vnStamp,
  BACKUP_GAP_MS, BACKUP_RETRY_MS, BACKUP_FORCE_AFTER_MS, BACKUP_STATE_KEY } from '../GiaoSuCuiBap/lib/telegram-backup.js';
import { createBackupRuntime } from '../GiaoSuCuiBap/lib/runtime-backup.js';
import { createTelegramRuntime } from '../GiaoSuCuiBap/lib/runtime-telegram.js';
import { safekeepingHandlers } from '../GiaoSuCuiBap/lib/handlers/safekeeping.js';
import { buildSafeBackupState } from '../GiaoSuCuiBap/lib/backup.js';
import { DEFAULT_SETTINGS } from '../GiaoSuCuiBap/lib/core.js';

const T0 = Date.parse('2026-11-11T00:05:00Z'); // 07:05 giờ Việt Nam
const iso = (t) => new Date(t).toISOString();
const read = (f) => fs.readFileSync(new URL(`../GiaoSuCuiBap/${f}`, import.meta.url), 'utf8');

test('quyết định gửi: tắt, khoá, thiếu Telegram, vừa gửi, chờ thử lại, không đổi, tới hạn', () => {
  const on = { enabled: true, configured: true, now: T0 };
  assert.deepEqual(backupDecision({ ...on, enabled: false }), { send: false, reason: 'off' });
  assert.deepEqual(backupDecision({ ...on, readOnly: true }), { send: false, reason: 'read-only' });
  assert.deepEqual(backupDecision({ ...on, configured: false }), { send: false, reason: 'no-telegram' });
  assert.deepEqual(backupDecision(on), { send: true, reason: 'first' });
  assert.equal(backupDecision({ ...on, last: { okAt: iso(T0 - BACKUP_GAP_MS + 60_000) } }).reason, 'recent');
  assert.deepEqual(backupDecision({ ...on, last: { okAt: iso(T0 - BACKUP_GAP_MS - 1) } }), { send: true, reason: 'due' });
  assert.equal(backupDecision({ ...on, last: { attemptAt: iso(T0 - BACKUP_RETRY_MS + 1000) } }).reason, 'retry-wait');
  assert.equal(backupDecision({ ...on, last: { attemptAt: iso(T0 - BACKUP_RETRY_MS - 1000) } }).send, true);
  const same = { okAt: iso(T0 - 2 * 86_400_000), fingerprint: 'abc' };
  assert.equal(backupDecision({ ...on, last: same, fingerprint: 'abc' }).reason, 'unchanged');
  assert.equal(backupDecision({ ...on, last: same, fingerprint: 'khac' }).send, true);
  assert.equal(backupDecision({ ...on, last: { ...same, okAt: iso(T0 - BACKUP_FORCE_AFTER_MS - 1) }, fingerprint: 'abc' }).send, true, 'không đổi quá 7 ngày vẫn gửi');
  // Bấm nút: gửi ngay kể cả khi chưa bật, vừa gửi hay đang ở chế độ chỉ xem do cửa vào chung chặn; thiếu Telegram thì không.
  assert.deepEqual(backupDecision({ force: true, configured: true, last: { okAt: iso(T0) }, now: T0 }), { send: true, reason: 'manual' });
  assert.equal(backupDecision({ force: true, configured: false }).reason, 'no-telegram');
  for (const r of ['off', 'read-only', 'no-telegram', 'recent', 'retry-wait', 'unchanged', 'too-big']) assert.ok(backupReasonText(r).length > 10, r);
});

test('dấu vân: đổi dữ liệu thì đổi, chỉ đổi giờ xuất thì không', () => {
  const a = { version: '4.22.0', exportedAt: '2026-11-11T00:00:00Z', tenders: [{ key: 'IB1', price: 5 }] };
  assert.equal(backupFingerprint(a), backupFingerprint({ ...a, exportedAt: '2026-11-12T09:00:00Z' }));
  assert.notEqual(backupFingerprint(a), backupFingerprint({ ...a, tenders: [{ key: 'IB1', price: 6 }] }));
  assert.match(backupFingerprint(a), /^[0-9a-f]{16}$/);
});

test('tên tệp và lời nhắn theo giờ Việt Nam, không phụ thuộc múi giờ của máy', () => {
  assert.equal(vnStamp(T0), '2026-11-11_07-05');
  assert.equal(vnStamp(Date.parse('2026-12-31T18:30:00Z')), '2027-01-01_01-30');
  const cap = backupCaption({ version: '4.22.0', tenders: [1, 2, 3], hunts: [1], checklists: { a: 1, b: 2 }, pastContracts: [] }, T0);
  assert.match(cap, /11\/11\/2026 07:05/);
  assert.match(cap, /3 gói · 1 bộ săn · 2 checklist · 0 hợp đồng tương tự/);
  assert.match(cap, /Nhập backup/);
  assert.match(cap, /không chứa Bot Token/);
  assert.ok(cap.length < 1000, 'lời nhắn kèm tệp của Telegram tối đa 1024 ký tự');
});

test('đóng tệp: nhỏ thì JSON thường, lớn thì nén gzip; cả hai đều đọc lại đúng', async () => {
  const payload = { version: '4.22.0', tenders: Array.from({ length: 400 }, (_, i) => ({ key: `IB26${i}`, bidName: `Nạo vét kênh mương thủy lợi số ${i}`, price: 1e9 + i })) };
  const plain = await packBackup(payload, { now: T0 });
  assert.equal(plain.gz, false);
  assert.equal(plain.filename, 'GiaoSuCuiBap-sao-luu-2026-11-11_07-05.json');
  assert.deepEqual(await readBackupBytes(plain.bytes), payload);
  const packed = await packBackup(payload, { now: T0, gzipFrom: 1000 });
  assert.equal(packed.gz, true);
  assert.ok(packed.filename.endsWith('.json.gz'));
  assert.ok(isGzip(packed.bytes) && packed.bytes.byteLength < plain.bytes.byteLength / 3, 'nén phải nhỏ hơn rõ rệt');
  assert.deepEqual(await readBackupBytes(packed.bytes), payload);
  // Trình duyệt không nén được: vẫn gửi JSON thường.
  const noGz = await packBackup(payload, { now: T0, gzipFrom: 1000, scope: {} });
  assert.equal(noGz.gz, false);
  await assert.rejects(() => readBackupBytes(new TextEncoder().encode('khong phai json')), /không đọc được JSON/);
  await assert.rejects(() => readBackupBytes(new TextEncoder().encode('[1,2]')), /không phải bản sao lưu/);
});

function harness({ settings = {}, last, send } = {}) {
  let store = { [BACKUP_STATE_KEY]: last || {} };
  const sent = [];
  let clock = T0;
  const state = { settings: { ...DEFAULT_SETTINGS, telegramBotToken: '123:abc', telegramChatId: '555666', telegramBackupDaily: true, ...settings },
    tenders: [{ key: 'IB2600000001-00', notifyNo: 'IB2600000001', bidName: 'Kênh N1', price: 5e9 }], hunts: [], checklists: {}, pastContracts: [] };
  const rt = createBackupRuntime({ getState: async () => state, local: { get: async (d) => ({ ...d, ...store }), set: async (v) => { store = { ...store, ...v }; } },
    backupObject: async () => ({ version: '4.22.0', exportedAt: iso(clock), backupMode: 'SAFE', ...buildSafeBackupState(state, {}, DEFAULT_SETTINGS) }),
    sendDocument: send || (async (s, file) => { sent.push(file); return { ok: true, message: 'Đã gửi.' }; }), now: () => clock });
  return { rt, sent, state, last: () => store[BACKUP_STATE_KEY], tick: (ms) => { clock += ms; } };
}

test('lượt đầu gửi một tệp không có Bot Token/Chat ID; trong ngày không gửi lại; hôm sau dữ liệu không đổi thì bỏ qua', async () => {
  const h = harness();
  const r = await h.rt.run();
  assert.equal(r.ok, true);
  assert.equal(h.sent.length, 1);
  const text = new TextDecoder().decode(h.sent[0].bytes);
  assert.doesNotMatch(text, /123:abc|555666/, 'tệp không được chứa Bot Token hay Chat ID');
  const data = JSON.parse(text);
  assert.equal(data.tenders.length, 1);
  assert.equal(data.settings.telegramBotToken, undefined);
  assert.match(h.last().message, /Đã gửi GiaoSuCuiBap-sao-luu-2026-11-11_07-05\.json/);
  assert.equal((await h.rt.run()).reason, 'recent');
  h.tick(BACKUP_GAP_MS + 60_000);
  const again = await h.rt.run();
  assert.equal(again.reason, 'unchanged');
  assert.equal(h.sent.length, 1);
  // Có gói mới: gửi tệp thứ hai.
  h.tick(BACKUP_RETRY_MS + 60_000);
  h.state.tenders.push({ key: 'IB2600000002-00', notifyNo: 'IB2600000002', bidName: 'Đập dâng', price: 7e9 });
  assert.equal((await h.rt.run()).ok, true);
  assert.equal(h.sent.length, 2);
});

test('tắt, thiếu Telegram hoặc đang khoá: không dựng tệp, không gửi; bấm nút thì gửi kể cả khi chưa bật lịch', async () => {
  for (const settings of [{ telegramBackupDaily: false }, { telegramChatId: '' }, { readOnlyMode: true }]) {
    const h = harness({ settings });
    const r = await h.rt.run();
    assert.equal(r.skipped, true);
    assert.equal(h.sent.length, 0);
  }
  const manual = harness({ settings: { telegramBackupDaily: false } });
  assert.equal((await manual.rt.run({ force: true })).ok, true);
  assert.equal(manual.sent.length, 1);
  assert.equal((await harness({ settings: { telegramChatId: '' } }).rt.run({ force: true })).reason, 'no-telegram');
});

test('gửi hỏng: ghi lý do, giữ mốc lần gửi được trước đó, 60 phút sau mới thử lại', async () => {
  let fail = true;
  const h = harness({ last: { okAt: iso(T0 - 3 * 86_400_000), fingerprint: 'cu' }, send: async () => (fail ? { ok: false, message: 'Bot Token sai.' } : { ok: true }) });
  const r = await h.rt.run();
  assert.equal(r.ok, false);
  assert.equal(h.last().result, 'error');
  assert.equal(h.last().okAt, iso(T0 - 3 * 86_400_000));
  assert.match(h.last().message, /Bot Token sai/);
  assert.equal((await h.rt.run()).reason, 'retry-wait');
  h.tick(BACKUP_RETRY_MS + 1000); fail = false;
  assert.equal((await h.rt.run()).ok, true);
});

test('hai lượt gọi cùng lúc chỉ gửi một tệp', async () => {
  const h = harness();
  const [a, b] = await Promise.all([h.rt.run(), h.rt.run()]);
  assert.equal(h.sent.length, 1);
  assert.equal(a, b);
});

test('gửi tệp: biểu mẫu nhiều phần (không thân JSON), đúng bot và chat, ghi nhật ký; lỗi được dịch', async () => {
  let s = { settings: { telegramBotToken: '123:abc', telegramChatId: '555666' }, telegramLog: [] };
  const calls = [];
  const replies = [{ status: 200, body: { ok: true } }, { status: 400, body: { ok: false, description: 'Bad Request: chat not found' } }];
  const rt = createTelegramRuntime({ getState: async () => s, save: async (v) => { s = { ...s, ...v }; }, withLock: async (fn) => fn(), KEYS: { telegramLog: 'telegramLog' },
    fetchImpl: async (url, init) => { calls.push({ url, init }); const r = replies.shift(); return { ok: r.status < 300, status: r.status, json: async () => r.body }; } });
  const file = { bytes: new TextEncoder().encode('{"a":1}'), filename: 'sao-luu.json', mime: 'application/json', caption: 'Sao lưu' };
  assert.equal((await rt.sendTelegramDocument(s.settings, file, { kind: 'backup' })).ok, true);
  assert.equal(calls[0].url, 'https://api.telegram.org/bot123%3Aabc/sendDocument');
  assert.ok(calls[0].init.body instanceof FormData, 'thân phải là biểu mẫu nhiều phần để trình duyệt không hỏi trước');
  assert.equal(calls[0].init.headers, undefined, 'không tự đặt content-type: trình duyệt phải tự ghi ranh giới');
  assert.equal(calls[0].init.body.get('chat_id'), '555666');
  assert.equal(calls[0].init.body.get('caption'), 'Sao lưu');
  const doc = calls[0].init.body.get('document');
  assert.equal(doc.name, 'sao-luu.json');
  assert.equal(await doc.text(), '{"a":1}');
  assert.equal(s.telegramLog[0].kind, 'backup');
  const bad = await rt.sendTelegramDocument(s.settings, file, { kind: 'backup' });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /START/);
  assert.equal((await rt.sendTelegramDocument({ telegramBotToken: '', telegramChatId: '' }, file)).message, 'Thiếu Bot Token hoặc Chat ID.');
});

test('nối dây: lệnh đã đăng ký, bấm nút bị chặn khi khoá chỉnh sửa, lịch chạy theo nhịp 30 phút và lúc khởi động', async () => {
  const bg = read('background.js');
  const h = safekeepingHandlers({ backupRuntime: { status: async () => ({ ok: true, enabled: true }), run: async (o) => ({ ok: true, o }) } });
  assert.deepEqual(Object.keys(h).sort(), ['TELEGRAM_BACKUP_NOW', 'TELEGRAM_BACKUP_STATUS']);
  assert.deepEqual(await h.TELEGRAM_BACKUP_NOW(), { ok: true, o: { force: true } });
  assert.match(bg, /register\('giu-du-lieu',safekeepingHandlers\(\{backupRuntime\}\)\)/);
  assert.match(bg, /const WRITE_TYPES=new Set\(\[[^\]]*'TELEGRAM_BACKUP_NOW'/, 'bấm nút phải bị chặn ở chế độ chỉ xem');
  assert.match(bg, /alarm\.name===DEADLINE_ALARM\)\{.{0,200}backupRuntime\.run\(\)/);
  assert.match(bg, /onStartup\.addListener\(async\(\)=>\{[\s\S]{0,700}backupRuntime\.run\(\)/);
  // Nhập bản sao lưu luôn tắt lịch gửi; lưu Cấu hình thì giữ đúng lựa chọn của người dùng.
  assert.match(bg, /out\.telegramEnabled=false;out\.telegramBackupDaily=false;/);
  assert.match(bg, /for\(const k of \[[^\]]*'telegramBackupDaily'\]\)clean\[k\]=Boolean\(raw\[k\]\)/);
  assert.equal(DEFAULT_SETTINGS.telegramBackupDaily, false, 'mặc định tắt: người dùng tự bật');
  const html = read('options.html'), js = read('options.js');
  assert.match(html, /id="telegramBackupDaily"/);
  assert.match(html, /id="backup-now"/);
  assert.match(html, /accept="\.json,\.gz,application\/json,application\/gzip"/);
  assert.match(js, /'telegramBackupDaily'/);
  assert.match(js, /readBackupBytes\(new Uint8Array\(await f\.arrayBuffer\(\)\)\)/);
});
