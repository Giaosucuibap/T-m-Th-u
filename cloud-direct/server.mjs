/** Bounded, authenticated source-acceptance service. Not the full application. */
import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProbeReport } from './source-probe.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', ...headers }
});
const secretMatches = (actual, expected) => {
  const a = Buffer.from(actual || '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};
const receiptPassed = evidence => validateProbeReport(evidence, {
  expectedBrowser: 'chromium', expectedProvinceKeys: ['lam_dong', 'dong_nai', 'ha_noi']
}).ok;

/** A normal browser runs the source's own UI. No CAPTCHA/token API is called here. */
export function makeBrowserRunner({ deadlineMs = 360000, spawnImpl = spawn } = {}) {
  return async ({ signal }) => {
    const work = await mkdtemp(join(tmpdir(), 'gscb-source-acceptance-'));
    const output = join(work, 'receipt.json');
    const env = { ...process.env };
    delete env.PROBE_API_KEY;
    let child;
    let killed = false;
    let timeout;
    let forceKill;
    const separateGroup = process.platform !== 'win32';
    const killOwnedGroup = signalName => {
      if (!child?.pid) return;
      try {
        if (separateGroup) process.kill(-child.pid, signalName);
        else child.kill(signalName);
      } catch (error) { if (error?.code !== 'ESRCH') throw error; }
    };
    const stop = () => {
      killed = true;
      killOwnedGroup('SIGTERM');
      forceKill = setTimeout(() => killOwnedGroup('SIGKILL'), 5000);
      forceKill.unref?.();
    };
    try {
      if (signal.aborted) return { state: 'cancelled', code: 'CANCELLED', evidence: null };
      // Fixed executable, script, engine and output path; never accept shell or target URL input.
      child = spawnImpl(process.execPath, [join(here, 'source-probe.mjs'), '--browser', 'chromium', '--output', output], {
        cwd: here, env, shell: false, detached: separateGroup, stdio: ['ignore', 'ignore', 'ignore']
      });
      signal.addEventListener('abort', stop, { once: true });
      timeout = setTimeout(stop, deadlineMs);
      timeout.unref?.();
      const exitCode = await new Promise((done, reject) => {
        child.once('error', reject);
        child.once('exit', code => done(code));
      });
      if (signal.aborted) return { state: 'cancelled', code: 'CANCELLED', evidence: null };
      if (killed) return { state: 'failed', code: 'SOURCE_TIMEOUT', evidence: null };
      let evidence = null;
      try {
        const text = await readFile(output, 'utf8');
        if (Buffer.byteLength(text) <= 1024 * 1024) evidence = JSON.parse(text);
      } catch { /* Missing evidence is a failure, never an empty-success result. */ }
      const passed = exitCode === 0 && receiptPassed(evidence);
      return { state: passed ? 'finished' : 'failed',
        code: passed ? 'PROBE_FINISHED' : 'SOURCE_GATE_NOT_PASSED', evidence };
    } finally {
      clearTimeout(timeout);
      clearTimeout(forceKill);
      signal.removeEventListener('abort', stop);
      // The source CLI normally closes its browser. Reap remaining descendants
      // after an abnormal exit, using only this job's independently created group.
      if (separateGroup) killOwnedGroup('SIGKILL');
      await rm(work, { recursive: true, force: true });
    }
  };
}

export function createProbeService({ apiKey, runner = makeBrowserRunner(), now = Date.now,
  uuid = randomUUID, maxRunsPerHour = 2, receiptTtlMs = 3600000 } = {}) {
  if (typeof apiKey !== 'string' || apiKey.length < 32) throw new Error('PROBE_API_KEY must contain at least 32 characters.');
  const jobs = new Map();
  let started = [];
  let active = null;
  let closing = false;

  const prune = () => {
    started = started.filter(t => now() - t < 3600000);
    for (const [id, job] of jobs) if (job.endedAt && now() - job.endedAt >= receiptTtlMs) jobs.delete(id);
  };
  const publicJob = job => ({ id: job.id, state: job.state, code: job.code,
    createdAt: new Date(job.createdAt).toISOString(),
    endedAt: job.endedAt ? new Date(job.endedAt).toISOString() : null,
    evidence: job.evidence, fullApplication: false, physicalSafariTested: false,
    storage: 'ephemeral_acceptance_receipt' });

  const handler = async request => {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/healthz' && request.method === 'GET') {
      return json(closing ? 503 : 200, { processReady: !closing, fullApplication: false,
        sourceReadiness: 'must_be_determined_from_each_live_receipt', physicalSafariTested: false });
    }
    if (!secretMatches(request.headers.get('authorization'), `Bearer ${apiKey}`)) {
      return json(401, { code: 'AUTH_REQUIRED' });
    }
    prune();
    if (path === '/api/probes' && request.method === 'POST') {
      if (closing) return json(503, { code: 'SERVICE_STOPPING' });
      if (active) return json(409, { code: 'PROBE_ALREADY_RUNNING', jobId: active });
      if (started.length >= maxRunsPerHour) return json(429, { code: 'PROBE_RATE_LIMIT' }, { 'retry-after': '3600' });
      if (!(request.headers.get('content-type') || '').startsWith('application/json')) return json(415, { code: 'JSON_REQUIRED' });
      const text = await request.text();
      if (Buffer.byteLength(text) > 2048) return json(413, { code: 'BODY_TOO_LARGE' });
      let body;
      try { body = JSON.parse(text); } catch { return json(400, { code: 'INVALID_JSON' }); }
      if (!body || Array.isArray(body) || body.confirm !== 'RUN_BOUNDED_SOURCE_ACCEPTANCE'
        || Object.keys(body).some(key => key !== 'confirm')) return json(400, { code: 'INVALID_PROBE_REQUEST' });
      // request.text() yielded. Reserve the slot only after rechecking atomically.
      if (closing) return json(503, { code: 'SERVICE_STOPPING' });
      if (active) return json(409, { code: 'PROBE_ALREADY_RUNNING', jobId: active });
      if (started.length >= maxRunsPerHour) return json(429, { code: 'PROBE_RATE_LIMIT' }, { 'retry-after': '3600' });
      const job = { id: uuid(), createdAt: now(), endedAt: null, state: 'running',
        code: 'PROBE_RUNNING', evidence: null, controller: new AbortController() };
      jobs.set(job.id, job);
      active = job.id;
      started.push(now());
      Promise.resolve().then(() => runner({ signal: job.controller.signal })).then(result => {
        if (job.controller.signal.aborted) {
          job.state = 'cancelled'; job.code = 'CANCELLED'; job.evidence = null;
        } else {
          job.state = ['finished', 'failed', 'cancelled'].includes(result?.state) ? result.state : 'failed';
          job.code = typeof result?.code === 'string' && /^[A-Z_]{1,60}$/.test(result.code) ? result.code : 'INVALID_RUNNER_RECEIPT';
          job.evidence = result?.evidence ?? null;
          if (job.state === 'finished' && !receiptPassed(job.evidence)) {
            job.state = 'failed'; job.code = 'INVALID_SOURCE_EVIDENCE';
          }
        }
      }).catch(() => { job.state = job.controller.signal.aborted ? 'cancelled' : 'failed';
        job.code = job.controller.signal.aborted ? 'CANCELLED' : 'SOURCE_RUNTIME_FAILURE'; job.evidence = null; })
        .finally(() => { job.endedAt = now(); if (active === job.id) active = null; });
      return json(202, publicJob(job), { location: `/api/probes/${job.id}` });
    }
    const match = path.match(/^\/api\/probes\/([0-9a-f-]{36})(\/cancel)?$/);
    if (match) {
      const job = jobs.get(match[1]);
      if (!job) return json(404, { code: 'PROBE_NOT_FOUND_OR_EXPIRED' });
      if (!match[2] && request.method === 'GET') return json(200, publicJob(job));
      if (match[2] && request.method === 'POST') {
        if (job.state === 'running') { job.controller.abort(); job.code = 'CANCELLATION_REQUESTED'; }
        return json(200, publicJob(job));
      }
    }
    return json(404, { code: 'NOT_FOUND' });
  };
  return { handler, shutdown() { closing = true; for (const job of jobs.values()) if (job.state === 'running') job.controller.abort(); } };
}

export function createHttpServer(service) {
  return createServer(async (incoming, outgoing) => {
    try {
      const chunks = []; let bytes = 0;
      for await (const chunk of incoming) {
        bytes += chunk.length;
        if (bytes > 2048) {
          outgoing.writeHead(413, { 'content-type': 'application/json', 'connection': 'close' });
          outgoing.end('{"code":"BODY_TOO_LARGE"}'); return;
        }
        chunks.push(chunk);
      }
      const method = incoming.method || 'GET';
      // The origin is only a parser base, not an outbound destination.
      const request = new Request(new URL(incoming.url || '/', 'http://source-service.invalid'), {
        method, headers: incoming.headers,
        ...(method === 'GET' || method === 'HEAD' ? {} : { body: Buffer.concat(chunks) })
      });
      const response = await service.handler(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(await response.text());
    } catch { outgoing.writeHead(500, { 'content-type': 'application/json' }); outgoing.end('{"code":"INTERNAL_ERROR"}'); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const service = createProbeService({ apiKey: process.env.PROBE_API_KEY });
    const server = createHttpServer(service);
    const port = Number(process.env.PORT || 10000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
    server.requestTimeout = 15000;
    server.headersTimeout = 10000;
    server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ service: 'source-acceptance-only', port })));
    const stop = () => { service.shutdown(); server.close(); };
    process.on('SIGTERM', stop); process.on('SIGINT', stop);
  } catch {
    console.error('Source acceptance service not started: check required key and port configuration.');
    process.exitCode = 1;
  }
}
