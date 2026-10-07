import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../GiaoSuCuiBap/content.js', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('  /* KQ_BACKOFF_START */'), source.indexOf('  /* KQ_BACKOFF_END */'));
function setup(extra = {}) {
  let time = 1_000_000; const actions = [], plan = {};
  const context = vm.createContext({ Date: { now: () => time, parse: Date.parse }, Math: { ...Math, max: Math.max, min: Math.min, floor: Math.floor, ceil: Math.ceil, random: () => 0 },
    Number, String, kqPlan: plan, kqCancelled: false, kqReport: s => actions.push(s), setTimeout: (fn, ms) => { time += ms; fn(); },
    kqTriggerFirstPage: async () => { actions.push('first'); return { ok: true, sourcePageIndex: 0 }; },
    ...extra });
  /* 4.16.1: đọc lại sau 429 dùng chung kqReReadPage (đi tới ĐÚNG trang đích,
     chịu được bước trung gian hỏng — xem tests/doc-lai-dung-trang-416x.test.mjs).
     Trang 0 vẫn đi qua kqTriggerFirstPage như trước. */
  if (!('kqReReadPage' in extra)) context.kqReReadPage = async (index) => {
    if (index === 0) return context.kqTriggerFirstPage();
    actions.push(`reread:${index}`);
    return { ok: true, sourcePageIndex: index };
  };
  vm.runInContext(helper, context);
  return { context, actions, plan, read: (p, index) => context.kqRecoverRateLimit(p, index, plan), time: () => time };
}
test('backoff honors seconds and HTTP date, increases delay, never shortens Retry-After', () => {
  const { context: c } = setup();
  assert.equal(c.kqBackoffDelay('30', 0, 0, 0), 30000);
  assert.equal(c.kqBackoffDelay('Thu, 01 Jan 1970 00:01:00 GMT', 0, 0, 0), 60000);
  assert.equal(c.kqBackoffDelay('invalid', 2, 0, 0), 8000);
  assert.equal(c.kqBackoffDelay('-100', 0, 0, 0), 2000);
});
test('429 recovery waits and retriggers native first-page controls', async () => {
  const s = setup(), result = await s.read({ ok: false, status: 429, retryAfter: '7' }, 0);
  assert.equal(result.ok, true); assert.equal(s.time(), 1007000); assert.ok(s.actions.includes('first'));
});
test('long server Retry-After ends without sending an early request', async () => {
  const s = setup(), result = await s.read({ ok: false, status: 429, retryAfter: '120' }, 0);
  assert.equal(result.ok, false); assert.equal(s.time(), 1000000); assert.ok(!s.actions.includes('first'));
});
test('cancelled or replaced job sends no retry', async () => {
  for (const replace of [false, true]) {
    const s = setup(); if (replace) s.context.kqPlan = {}; else s.context.kqCancelled = true;
    assert.equal((await s.read({ status: 429 }, 0)).cancelled, true); assert.ok(!s.actions.includes('first'));
  }
});
test('later-page recovery re-reads the exact target page', async () => {
  const s = setup();
  assert.equal((await s.read({ status: 429 }, 2)).sourcePageIndex, 2);
  assert.ok(s.actions.includes('reread:2'), 'phải đọc lại đúng trang 3 (chỉ số 2)');
});
test('backoff retries at most three times', async () => {
  let count = 0; const s = setup({ kqTriggerFirstPage: async () => { count++; return { status: 429, ok: false }; } });
  assert.equal((await s.read({ status: 429 }, 0)).ok, false); assert.equal(count, 3);
});
