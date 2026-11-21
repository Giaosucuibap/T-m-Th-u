/* Mã tiêm và kênh nhắn tin: hợp lệ, đúng phạm vi, chống khớp nhầm, an toàn với dữ liệu lạ. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildInjectedScript, deliverScript, SHIM_SOURCE, SEARCH_PAGE_TEST } from '../../src/egp/inject.js';
import { PAGE_HOOK_SOURCE, CONTENT_SOURCE, EXTENSION_VERSION } from '../../src/egp/injected.generated.js';
import { createPageChannel } from '../../src/core/page-channel.js';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('lõi app khớp nguyên văn tiện ích (sync-core --check)', () => {
  const out = execFileSync(process.execPath, [path.join(APP, 'scripts/sync-core.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(out, /khớp tiện ích/);
  const manifest = JSON.parse(fs.readFileSync(path.join(APP, '../GiaoSuCuiBap/manifest.json'), 'utf8'));
  assert.equal(EXTENSION_VERSION, manifest.version);
  assert.equal(PAGE_HOOK_SOURCE, fs.readFileSync(path.join(APP, '../GiaoSuCuiBap/page-hook.js'), 'utf8'));
  assert.equal(CONTENT_SOURCE, fs.readFileSync(path.join(APP, '../GiaoSuCuiBap/content.js'), 'utf8'));
});

test('mã tiêm là JavaScript hợp lệ, chứa nguyên văn hai tệp, chỉ chạy ở trang tra cứu', () => {
  const script = buildInjectedScript();
  assert.doesNotThrow(() => new vm.Script(script));
  assert.ok(script.includes(PAGE_HOOK_SOURCE) && script.includes(CONTENT_SOURCE));
  assert.equal(script.split(`if (${SEARCH_PAGE_TEST})`).length - 1, 2, 'page-hook và content đều có điều kiện phạm vi');
  // Điều kiện phạm vi khớp đúng các địa chỉ trong manifest.json của tiện ích.
  const scope = (href) => { const u = new URL(href); return vm.runInNewContext(SEARCH_PAGE_TEST, { location: u }); };
  assert.equal(scope('https://muasamcong.mof.gov.vn/vi/web/guest/contractor-selection?render=search'), true);
  assert.equal(scope('https://muasamcong.mpi.gov.vn/web/guest/contractor-selection'), true);
  assert.equal(scope('https://muasamcong.mof.gov.vn/web/guest/home'), false);
  assert.equal(scope('https://evil.example/web/guest/contractor-selection'), false);
  assert.match(script, /\(function \(chrome\) \{/);
  assert.ok(!/window\.chrome\s*=/.test(SHIM_SOURCE), 'lớp đệm không được gán window.chrome');
});

test('deliverScript: chuỗi lạ (dấu nháy, </script>, U+2028) đi qua nguyên vẹn', () => {
  const tricky = { kind: 'command', id: 'x.1', message: { type: 'T', payload: { s: 'a"b\'c</script>  \\n' } } };
  const js = deliverScript(tricky);
  assert.ok(!js.includes(' ') && !js.includes(' '));
  let got = null;
  vm.runInNewContext(js, { window: { __gscbFromApp: (raw) => { got = JSON.parse(raw); } } });
  assert.deepEqual(got, tricky);
});

/** Chạy lớp đệm trong một "trang" giả để kiểm hành vi thật của nó. */
function shimPage() {
  const posted = [];
  const timers = [];
  const window = { ReactNativeWebView: { postMessage: (s) => posted.push(JSON.parse(s)) } };
  const ctx = { window, Promise, JSON, String, Math, Date, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, setInterval: () => 0, clearInterval: () => {} };
  vm.runInNewContext(SHIM_SOURCE, ctx);
  return { window, posted, timers };
}

test('lớp đệm: sendMessage ↔ reply, mã lượt gửi khác nhau giữa hai lần tải trang', async () => {
  const a = shimPage();
  const b = shimPage();
  const p = a.window.__gscbChrome.runtime.sendMessage({ type: 'KQLCNT_RESULTS', payload: { n: 1 } });
  b.window.__gscbChrome.runtime.sendMessage({ type: 'X' });
  const sentA = a.posted[0], sentB = b.posted[0];
  assert.equal(sentA.kind, 'send');
  assert.notEqual(sentA.id, sentB.id, 'trang tải lại không được dùng lại mã cũ');
  a.window.__gscbFromApp(JSON.stringify({ kind: 'reply', id: sentB.id, response: { ok: false } }));
  a.window.__gscbFromApp(JSON.stringify({ kind: 'reply', id: sentA.id, response: { ok: true } }));
  assert.deepEqual(await p, { ok: true });
});

test('lớp đệm: lệnh từ app tới listener của content.js, trả lời đúng một lần', () => {
  const page = shimPage();
  page.window.__gscbChrome.runtime.onMessage.addListener((msg, sender, sendResponse) => { if (msg.type === 'KQLCNT_PROBE') { sendResponse({ ok: true, ready: true }); sendResponse({ ok: false }); } });
  page.window.__gscbFromApp(JSON.stringify({ kind: 'command', id: 'c.1', message: { type: 'KQLCNT_PROBE' } }));
  const replies = page.posted.filter((m) => m.kind === 'commandReply');
  assert.deepEqual(replies, [{ kind: 'commandReply', id: 'c.1', response: { ok: true, ready: true } }]);
  page.timers.find((t) => t.ms === 15000).fn();
  assert.equal(page.posted.filter((m) => m.kind === 'commandReply').length, 1, 'hạn chờ không được trả lời lần hai');
});

test('kênh app: bỏ qua dữ liệu rác, trả lời mọi lần gửi, hết hạn chờ lệnh', async () => {
  const injected = [];
  const ch = createPageChannel({ inject: (js) => injected.push(js) });
  ch.setHandler((m) => ({ ok: true, echo: m.type }));
  assert.equal(ch.receive('không phải json'), false);
  assert.equal(ch.receive(JSON.stringify([1, 2])), false);
  assert.equal(ch.receive(JSON.stringify({ kind: 'lạ' })), false);
  assert.equal(ch.receive(JSON.stringify({ kind: 'send', id: 'p.1', message: { type: 'CONTENT_READY' } })), true);
  await new Promise((r) => setTimeout(r, 5));
  let reply = null;
  vm.runInNewContext(injected.at(-1), { window: { __gscbFromApp: (raw) => { reply = JSON.parse(raw); } } });
  assert.deepEqual(reply, { kind: 'reply', id: 'p.1', response: { ok: true, echo: 'CONTENT_READY' } });
  await assert.rejects(ch.command({ type: 'KQLCNT_PROBE' }, 20), /chưa phản hồi/);
  assert.equal(ch.pendingCount, 0);
});

test('kênh app: handler lỗi vẫn trả lời (trang không treo chờ)', async () => {
  const injected = [];
  const ch = createPageChannel({ inject: (js) => injected.push(js) });
  ch.setHandler(() => { throw new Error('hỏng'); });
  ch.receive(JSON.stringify({ kind: 'send', id: 'p.9', message: { type: 'X' } }));
  await new Promise((r) => setTimeout(r, 5));
  let reply = null;
  vm.runInNewContext(injected.at(-1), { window: { __gscbFromApp: (raw) => { reply = JSON.parse(raw); } } });
  assert.equal(reply.response.ok, false);
  assert.match(reply.response.message, /hỏng/);
});
