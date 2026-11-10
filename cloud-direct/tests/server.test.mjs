import test from 'node:test';
import assert from 'node:assert/strict';
import { createProbeService } from '../server.mjs';

const key = 'unit-test-key-only-not-production-000000000000';
const uuid = () => '12345678-1234-1234-1234-123456789abc';
const req = (path, method = 'GET', body, auth = key) => new Request(`https://example.invalid${path}`, {
  method, headers: { 'authorization': `Bearer ${auth}`, 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) })
});
const input = { confirm: 'RUN_BOUNDED_SOURCE_ACCEPTANCE' };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('no default credential; health is not a live-source or Safari claim', async () => {
  assert.throws(() => createProbeService());
  const service = createProbeService({ apiKey: key });
  const r = await service.handler(req('/healthz', 'GET', undefined, 'bad'));
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.fullApplication, false); assert.equal(body.physicalSafariTested, false);
  assert.notEqual(body.sourceReadiness, true);
});

test('unauthenticated callers cannot launch or read a probe', async () => {
  let calls = 0;
  const s = createProbeService({ apiKey: key, runner: async () => { calls++; } });
  assert.equal((await s.handler(req('/api/probes', 'POST', input, 'wrong'))).status, 401);
  assert.equal((await s.handler(req('/api/probes/'+uuid(), 'GET', undefined, 'wrong'))).status, 401);
  assert.equal(calls, 0);
});

test('reject arbitrary URLs, unapproved options, bad JSON and oversized input', async () => {
  const s = createProbeService({ apiKey: key });
  for (const body of [{ ...input, url: 'http://127.0.0.1/admin' }, { ...input, browser: 'arbitrary' }, [], {}, '{']) {
    assert.equal((await s.handler(req('/api/probes', 'POST', body))).status, 400);
  }
  assert.equal((await s.handler(req('/api/probes', 'POST', 'x'.repeat(2049)))).status, 413);
});

test('one running probe at a time; failed source is never an empty success', async () => {
  let finish;
  const s = createProbeService({ apiKey: key, uuid, runner: () => new Promise(resolve => { finish = resolve; }) });
  const r = await s.handler(req('/api/probes', 'POST', input));
  assert.equal(r.status, 202); await tick();
  assert.equal((await s.handler(req('/api/probes', 'POST', input))).status, 409);
  finish({ state: 'failed', code: 'SOURCE_VERIFICATION_REQUIRED', evidence: { status: 'blocked', records: null } });
  await tick();
  const job = await (await s.handler(req('/api/probes/'+uuid()))).json();
  assert.equal(job.state, 'failed'); assert.equal(job.code, 'SOURCE_VERIFICATION_REQUIRED');
  assert.equal(job.evidence.records, null);
});

test('simultaneous requests cannot race across body parsing to start two browsers', async () => {
  let calls = 0;
  let finish;
  const s = createProbeService({ apiKey: key, uuid, runner: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  const results = await Promise.all([s.handler(req('/api/probes', 'POST', input)), s.handler(req('/api/probes', 'POST', input))]);
  assert.deepEqual(results.map(r => r.status).sort(), [202, 409]);
  await tick(); assert.equal(calls, 1);
  finish({ state: 'failed', code: 'TEST_FINISHED', evidence: null }); await tick();
});

test('cancellation ignores a later successful response', async () => {
  let finish; let signal;
  const s = createProbeService({ apiKey: key, uuid, runner: options => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); } });
  await s.handler(req('/api/probes', 'POST', input)); await tick();
  await s.handler(req('/api/probes/'+uuid()+'/cancel', 'POST', {}));
  assert.equal(signal.aborted, true);
  finish({ state: 'finished', code: 'PROBE_FINISHED', evidence: { fixture: true } }); await tick();
  const j = await (await s.handler(req('/api/probes/'+uuid()))).json();
  assert.equal(j.state, 'cancelled'); assert.equal(j.evidence, null);
});

test('source exception details never expose tokens or internal messages', async () => {
  const s = createProbeService({ apiKey: key, uuid, runner: async () => { throw new Error('secret=do-not-print'); } });
  await s.handler(req('/api/probes', 'POST', input)); await tick();
  const text = await (await s.handler(req('/api/probes/'+uuid()))).text();
  assert.equal(text.includes('do-not-print'), false);
  assert.equal(JSON.parse(text).code, 'SOURCE_RUNTIME_FAILURE');
});

test('runner rejection after requested cancellation remains a cancelled job', async () => {
  let reject;
  const s = createProbeService({ apiKey: key, uuid, runner: () => new Promise((_, fail) => { reject = fail; }) });
  await s.handler(req('/api/probes', 'POST', input)); await tick();
  await s.handler(req('/api/probes/'+uuid()+'/cancel', 'POST', {}));
  reject(new Error('aborted browser')); await tick();
  const body = await (await s.handler(req('/api/probes/'+uuid()))).json();
  assert.equal(body.state, 'cancelled'); assert.equal(body.code, 'CANCELLED');
});

test('a finished process without evidence cannot pass; hourly limit is enforced', async () => {
  let n = 0;
  const s = createProbeService({ apiKey: key, uuid: () => `12345678-1234-1234-1234-${String(++n).padStart(12,'0')}`,
    runner: async () => ({ state: 'finished', code: 'PROBE_FINISHED', evidence: null }) });
  const a = await (await s.handler(req('/api/probes', 'POST', input))).json(); await tick();
  assert.equal((await (await s.handler(req('/api/probes/'+a.id))).json()).state, 'failed');
  await s.handler(req('/api/probes', 'POST', input)); await tick();
  assert.equal((await s.handler(req('/api/probes', 'POST', input))).status, 429);
});

test('a runner cannot promote JSON existence or claimed success into source acceptance', async () => {
  for (const evidence of [{}, { status: 'SOURCE_ACCEPTANCE_SAMPLE_PASSED', sourceGatePassed: true },
    { appReadyForProduction: true, realSafariTested: true }]) {
    const s = createProbeService({ apiKey: key, uuid,
      runner: async () => ({ state: 'finished', code: 'PROBE_FINISHED', evidence }) });
    await s.handler(req('/api/probes', 'POST', input)); await tick();
    const body = await (await s.handler(req('/api/probes/'+uuid()))).json();
    assert.equal(body.state, 'failed'); assert.equal(body.code, 'INVALID_SOURCE_EVIDENCE');
  }
});

test('expired receipts and service shutdown are explicit', async () => {
  let at = 100000;
  const s = createProbeService({ apiKey: key, uuid, now: () => at,
    runner: async () => ({ state: 'failed', code: 'SOURCE_GATE_NOT_PASSED', evidence: {} }), receiptTtlMs: 100 });
  await s.handler(req('/api/probes', 'POST', input)); await tick();
  at += 101;
  assert.equal((await s.handler(req('/api/probes/'+uuid()))).status, 404);
  s.shutdown(); assert.equal((await s.handler(req('/healthz'))).status, 503);
  assert.equal((await s.handler(req('/api/probes', 'POST', input))).status, 503);
});
