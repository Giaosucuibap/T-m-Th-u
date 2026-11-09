/* ============================================================================
 *  SERVICE WORKER — app "Cùi Bắp" trên màn hình chính iPhone/iPad (4.21.0)
 *
 *  - Tệp mã/phông có băm trong tên (/_expo/static/, /assets/): lưu lần đầu, sau đó
 *    lấy từ máy → app mở tức thì kể cả mạng 3G yếu ở công trường.
 *  - Trang (index.html): hỏi mạng trước (luôn lấy bản mới nhất), mất mạng thì dùng
 *    bản đã lưu → app vẫn mở, xem được kết quả/gói theo dõi đã lưu trên máy.
 *  - KHÔNG BAO GIỜ lưu /api/ (dữ liệu và khoá) hay /_gscb/ (con trỏ tới máy tính).
 *  Đổi phiên bản dưới đây là xoá bộ nhớ cũ.
 * ========================================================================== */
const VERSION = 'gscb-4.21.0';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(['/', '/apple-touch-icon.png'])).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== VERSION) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_gscb/') || url.pathname === '/sw.js') return;
  if (url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await fetch(req);
        // Ứng dụng một trang: mọi đường dẫn đều là index.html → lưu chung một bản.
        if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) cache.put('/', res.clone());
        return res;
      } catch {
        return (await cache.match('/')) || Response.error();
      }
    })());
  }
});
