/* ============================================================================
 *  TELEGRAM — tách khỏi background.js (4.19.0), hành vi không đổi
 *
 *  Khoá các điều trước đây chỉ kiểm được bằng trình duyệt: cắt khúc dưới 4096
 *  ký tự không cắt giữa dòng, lỗi dịch sang tiếng Việt có hướng khắc phục, ghi
 *  nhật ký mỗi lần gửi, dò Chat ID, không nhắn cho bộ săn đã tắt Telegram, và
 *  không gửi gì khi đang khoá tự động hoá.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTelegramRuntime, chunkForTelegram, telegramError, telegramTenderLine, TELEGRAM_LIMIT } from '../GiaoSuCuiBap/lib/runtime-telegram.js';

function harness({ replies = [], state = {} } = {}) {
  let s = { settings: { telegramEnabled: true, telegramBotToken: '123:abc', telegramChatId: '-100', ...state.settings }, telegramLog: [], hunts: state.hunts || [] };
  const calls = [];
  const rt = createTelegramRuntime({ getState: async () => s, save: async (v) => { s = { ...s, ...v }; }, withLock: async (fn) => fn(), KEYS: { telegramLog: 'telegramLog' },
    fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); const r = replies.shift() || { status: 200, body: { ok: true, result: {} } }; return { ok: r.status < 300, status: r.status, json: async () => r.body }; },
    sleep: async () => {} });
  return { rt, calls, state: () => s };
}

test('cắt khúc: mỗi khúc ≤ 3.800 ký tự, không cắt giữa dòng; dòng quá dài bị rút gọn', () => {
  const lines = Array.from({ length: 300 }, (_, i) => `Dòng ${i} ${'x'.repeat(40)}`);
  const parts = chunkForTelegram(lines.join('\n'));
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= TELEGRAM_LIMIT));
  assert.equal(parts.join('\n'), lines.join('\n'), 'ghép lại đúng nguyên văn');
  assert.equal(chunkForTelegram('a'.repeat(5000))[0].length, TELEGRAM_LIMIT);
  assert.deepEqual(chunkForTelegram(''), ['']);
});

test('lỗi Telegram dịch sang tiếng Việt kèm cách sửa', () => {
  assert.match(telegramError(401, 'Unauthorized'), /Bot Token sai/);
  assert.match(telegramError(400, 'Bad Request: chat not found'), /bấm START/);
  assert.match(telegramError(429, 'Too Many Requests: retry after 5'), /quá nhiều/);
  assert.equal(telegramError(500, ''), 'Telegram trả lỗi HTTP 500.');
});

test('gửi tin dài: nhiều khúc theo thứ tự, ghi nhật ký; lỗi thì dừng và báo lý do', async () => {
  const h = harness();
  const r = await h.rt.sendTelegram(h.state().settings, Array.from({ length: 300 }, (_, i) => `Dòng ${i} ${'y'.repeat(40)}`).join('\n'), { kind: 'test' });
  assert.equal(r.ok, true);
  assert.match(r.message, /Đã gửi \(\d+ tin nhắn\)/);
  assert.ok(h.calls.length > 1 && h.calls.every((c) => c.url === 'https://api.telegram.org/bot123%3Aabc/sendMessage' && c.body.parse_mode === 'HTML' && c.body.chat_id === '-100'));
  assert.equal(h.state().telegramLog[0].kind, 'test');
  const bad = harness({ replies: [{ status: 401, body: { ok: false, description: 'Unauthorized' } }] });
  const r2 = await bad.rt.sendTelegram(bad.state().settings, 'x');
  assert.equal(r2.ok, false); assert.match(r2.message, /Bot Token sai/);
  assert.equal(bad.state().telegramLog[0].ok, false);
  assert.match((await harness().rt.sendTelegram({ telegramEnabled: false }, 'x')).message, /Chưa bật gửi Telegram/);
});

test('dò Chat ID: liệt kê các cuộc trò chuyện đã nhắn cho bot, không trùng', async () => {
  const h = harness({ replies: [{ status: 200, body: { ok: true, result: { username: 'gscb_bot' } } },
    { status: 200, body: { ok: true, result: [{ message: { chat: { id: 1, first_name: 'Thắng', type: 'private' } } }, { message: { chat: { id: 1, first_name: 'Thắng' } } }, { channel_post: { chat: { id: -100, title: 'Phòng thầu', type: 'channel' } } }] } }] });
  const r = await h.rt.telegramDetectChatId('123:abc');
  assert.equal(r.ok, true); assert.equal(r.botName, '@gscb_bot');
  assert.deepEqual(r.chats.map((c) => [c.id, c.name]), [['1', 'Thắng'], ['-100', 'Phòng thầu']]);
});

test('đẩy gói mới: bộ săn tắt Telegram thì im; đang khoá tự động hoá thì không gửi; tên gói được thoát HTML', async () => {
  const pkg = { score: 91, displayCode: 'IB2600455130-00', bidName: 'Kênh <b>N1</b>', price: 5e9, location: 'Lâm Đồng', status: 'OPEN', daysLeft: 6, detailUrl: 'https://muasamcong.mof.gov.vn/x?a=1&b=2' };
  assert.match(telegramTenderLine(pkg), /Kênh &lt;b&gt;N1&lt;\/b&gt;/);
  assert.match(telegramTenderLine(pkg), /a=1&amp;b=2/);
  const quiet = harness({ state: { hunts: [{ id: 'h', telegram: false }] } });
  await quiet.rt.pushTelegramMatches(quiet.state().settings, [pkg], { huntId: 'h' });
  assert.equal(quiet.calls.length, 0);
  const locked = harness({ state: { settings: { readOnlyMode: true } } });
  assert.match((await locked.rt.dispatchOutbound(locked.state().settings, 'x')).message, /khóa/);
  const h = harness();
  await h.rt.pushTelegramMatches(h.state().settings, [pkg], { status: 'PARTIAL' });
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].body.text, /1 gói mới đạt ngưỡng/);
  assert.match(h.calls[0].body.text, /DỮ LIỆU CHƯA ĐẦY ĐỦ/);
});

test('background.js chỉ còn hàm chuyển tiếp — không còn bản sao thứ hai của mã Telegram', () => {
  const bg = fs.readFileSync(new URL('../GiaoSuCuiBap/background.js', import.meta.url), 'utf8');
  assert.match(bg, /const telegramRuntime=createTelegramRuntime\(/);
  assert.doesNotMatch(bg, /function chunkForTelegram|function telegramError|api\.telegram\.org\/bot/);
});
