/* ============================================================================
 *  GIẢ LẬP ĐỊA CHỈ CỐ ĐỊNH (4.21.0): chạy ĐÚNG mã Worker relay/src/worker.js
 *  trong Node, thay Cloudflare bằng: kho KV trong bộ nhớ, tệp tĩnh từ thư mục web,
 *  và "fetch" đổi https://<x>.trycloudflare.com → máy phục vụ cục bộ của bài thử.
 *
 *  import { startRelaySim } from './relay-sim.mjs'
 *  const sim = await startRelaySim({ webDir, claimCode, tunnels: { 'abc.trycloudflare.com': 'http://127.0.0.1:5000' }, tls })
 *  sim.url · sim.kv · sim.setTunnel(host, base) · sim.close()
 * ========================================================================== */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import worker, { resetCacheForTests } from '../../relay/src/worker.js';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

export function memoryKv() {
  const data = new Map();
  return {
    data,
    async get(key, type) {
      const row = data.get(key);
      if (!row || (row.exp && Date.now() > row.exp)) return null;
      return type === 'json' ? JSON.parse(row.value) : row.value;
    },
    async put(key, value, opts = {}) { data.set(key, { value: String(value), exp: opts.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : 0 }); },
    async delete(key) { data.delete(key); }
  };
}

/** Như Workers Static Assets với not_found_handling = "single-page-application". */
export function directoryAssets(dir) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname);
      if (rel.includes('\0') || rel.includes('..')) return new Response('Bad path', { status: 400 });
      if (rel.endsWith('/')) rel += 'index.html';
      let file = path.join(dir, rel);
      if (!file.startsWith(path.resolve(dir)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        if (path.extname(rel)) return new Response('Not found', { status: 404 });
        file = path.join(dir, 'index.html');
      }
      return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' } });
    }
  };
}

export async function startRelaySim({ webDir, claimCode = '7KQ2M9XD', tunnels = {}, tls = null, port = 0 } = {}) {
  resetCacheForTests();
  const map = new Map(Object.entries(tunnels));
  const forwarded = [];
  const env = {
    GSCB: memoryKv(),
    ASSETS: webDir ? directoryAssets(webDir) : { fetch: async () => new Response('Not found', { status: 404 }) },
    CLAIM_CODE_HASH: createHash('sha256').update(claimCode).digest('hex'),
    async FETCH(target, init) {
      const u = new URL(target);
      forwarded.push({ url: target, method: init.method, headers: { ...init.headers } });
      const base = map.get(u.host);
      // Đường hầm đã đóng: Cloudflare trả 530 (lỗi 1033).
      if (!base) return new Response('error code: 1033', { status: 530 });
      return fetch(base + u.pathname + u.search, init);
    }
  };
  const handler = async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const origin = `${tls ? 'https' : 'http'}://${req.headers.host}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (!['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'content-length', 'host'].includes(k)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const request = new Request(origin + req.url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
    try {
      const response = await worker.fetch(request, env);
      const out = {};
      response.headers.forEach((v, k) => { out[k] = v; });
      res.writeHead(response.status, out);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(e?.stack || e));
    }
  };
  const server = tls ? https.createServer(tls, handler) : http.createServer(handler);
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const url = `${tls ? 'https' : 'http'}://127.0.0.1:${server.address().port}`;
  return {
    url, env, kv: env.GSCB, forwarded,
    setTunnel(host, base) { if (base) map.set(host, base); else map.delete(host); },
    close: () => new Promise((r) => server.close(r))
  };
}
