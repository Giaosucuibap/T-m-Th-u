/* ============================================================================
 *  NHÓM CHAT CỦA PHÒNG ĐẤU THẦU (4.22.0) — lib/runtime-telegram.js
 *
 *  Khoá: chỉ tin NGHIỆP VỤ được gửi thêm vào nhóm; tin riêng tư, tin thử và tin của bộ
 *  săn có nơi nhận riêng thì không; nhóm lỗi không làm hỏng tin chính; Chat ID nhóm không
 *  lọt vào bản sao lưu và bị che khi gửi cho các trang khác.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTelegramRuntime, GROUP_KINDS } from '../GiaoSuCuiBap/lib/runtime-telegram.js';
import { safeSettingsForBackup } from '../GiaoSuCuiBap/lib/backup.js';
import { DEFAULT_SETTINGS } from '../GiaoSuCuiBap/lib/core.js';

function harness({ settings = {}, replies = [] } = {}) {
  let s = { settings: { telegramEnabled: true, telegramBotToken: '123:abc', telegramChatId: '555', telegramGroupChatId: '-1001234567890', ...settings }, telegramLog: [], hunts: [] };
  const calls = [];
  const rt = createTelegramRuntime({ getState: async () => s, save: async (v) => { s = { ...s, ...v }; }, withLock: async (fn) => fn(), KEYS: { telegramLog: 'telegramLog' }, sleep: async () => {},
    fetchImpl: async (url, init) => { const body = JSON.parse(init.body); calls.push(body.chat_id); const r = replies.shift() || { status: 200, body: { ok: true } }; return { ok: r.status < 300, status: r.status, json: async () => r.body }; } });
  return { rt, calls, state: () => s };
}

test('tin nghiệp vụ: gửi chat riêng rồi gửi thêm một bản vào nhóm; nhật ký ghi cả hai', async () => {
  for (const kind of GROUP_KINDS) {
    const h = harness();
    const r = await h.rt.sendTelegram(h.state().settings, 'Gói mới', { kind });
    assert.deepEqual(h.calls, ['555', '-1001234567890'], kind);
    assert.equal(r.ok, true); assert.equal(r.group, true);
    assert.deepEqual(h.state().telegramLog.map((x) => x.kind), [`${kind}-nhom`, kind]);
  }
  assert.deepEqual([...GROUP_KINDS].sort(), ['bulletin', 'deadline', 'matches', 'plan-hunt', 'rival']);
});

test('không gửi vào nhóm: tin riêng tư và hệ thống, tin thử (force), tin đã có nơi nhận riêng, nhóm trùng chat riêng, Chat ID nhóm sai', async () => {
  for (const kind of ['phone-link', 'test', 'canary', 'station', 'hunt-health', 'backup', 'summary', undefined]) {
    const h = harness();
    await h.rt.sendTelegram(h.state().settings, 'x', { kind, force: kind === 'test' });
    assert.deepEqual(h.calls, ['555'], String(kind));
  }
  const forced = harness(); await forced.rt.sendTelegram(forced.state().settings, 'thử bản tin', { kind: 'bulletin', force: true });
  assert.deepEqual(forced.calls, ['555'], 'nút "Gửi thử" không làm phiền cả nhóm');
  const own = harness(); await own.rt.sendTelegram(own.state().settings, 'x', { kind: 'matches', chatId: '-100999' });
  assert.deepEqual(own.calls, ['-100999'], 'bộ săn có nơi nhận riêng');
  const same = harness({ settings: { telegramGroupChatId: '555' } }); await same.rt.sendTelegram(same.state().settings, 'x', { kind: 'matches' });
  assert.deepEqual(same.calls, ['555']);
  const bad = harness({ settings: { telegramGroupChatId: 'không phải id' } }); await bad.rt.sendTelegram(bad.state().settings, 'x', { kind: 'matches' });
  assert.deepEqual(bad.calls, ['555']);
});

test('nhóm lỗi (bot chưa được thêm vào nhóm): tin chính vẫn tính là đã gửi, nhật ký ghi lý do', async () => {
  const h = harness({ replies: [{ status: 200, body: { ok: true } }, { status: 400, body: { ok: false, description: 'Bad Request: chat not found' } }] });
  const r = await h.rt.sendTelegram(h.state().settings, 'Gói mới', { kind: 'matches' });
  assert.equal(r.ok, true); assert.equal(r.group, false);
  assert.match(h.state().telegramLog[0].message, /^Nhóm: /);
  assert.equal(h.state().telegramLog[0].ok, false);
  // Chat riêng lỗi thì không thử nhóm.
  const fail = harness({ replies: [{ status: 401, body: { ok: false, description: 'Unauthorized' } }] });
  assert.equal((await fail.rt.sendTelegram(fail.state().settings, 'x', { kind: 'matches' })).ok, false);
  assert.deepEqual(fail.calls, ['555']);
});

test('Chat ID nhóm là nơi nhận: không vào bản sao lưu, bị che ở trạng thái công khai, nhập bản sao lưu thì xoá', () => {
  assert.equal(DEFAULT_SETTINGS.telegramGroupChatId, '');
  const out = safeSettingsForBackup({ ...DEFAULT_SETTINGS, telegramGroupChatId: '-1001234567890', telegramChatId: '555' }, DEFAULT_SETTINGS);
  assert.equal('telegramGroupChatId' in out, false);
  assert.equal('telegramChatId' in out, false);
  const bg = fs.readFileSync(new URL('../GiaoSuCuiBap/background.js', import.meta.url), 'utf8');
  assert.match(bg, /out\.telegramGroupChatId=settings\.telegramGroupChatId\?'••••':'';/);
  assert.match(bg, /out\.telegramChatId='';out\.telegramGroupChatId='';/);
  assert.match(bg, /for\(const k of \['telegramBotToken','telegramChatId','telegramGroupChatId'\]\)/);
  assert.match(fs.readFileSync(new URL('../GiaoSuCuiBap/options.html', import.meta.url), 'utf8'), /id="telegramGroupChatId"/);
});
