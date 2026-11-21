/* ============================================================================
 *  PROXY ÁNH XẠ TÊN MIỀN — cho bài thử WebKit (nhân Safari)
 *
 *  MiniBrowser của WebKitGTK không có cờ đổi DNS như Chromium, nhưng có --proxy.
 *  Proxy này nhận lệnh CONNECT và nối các tên miền e-GP về máy chủ giả lập trên
 *  127.0.0.1. MỌI tên miền khác bị từ chối và ghi lại — bài thử không bao giờ ra
 *  Internet thật, và ta kiểm được phần mềm có gọi tới nơi nào ngoài e-GP không.
 * ========================================================================== */
import http from 'node:http';
import net from 'node:net';

/** map: { 'muasamcong.mof.gov.vn': 9443, … } → { port, url, refused:Set, map, close() }.
 *  block(tên miền): giữa bài thử, giả lập "tên miền đó không vào được nữa" (mất mạng tới
 *  GitHub chẳng hạn). */
export function startMapProxy(map) {
  map = { ...map };
  const refused = new Set();
  const server = http.createServer((req, res) => {
    try { refused.add(new URL(req.url).host); } catch { refused.add(String(req.url).slice(0, 80)); }
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('map-proxy: chỉ phục vụ CONNECT tới máy chủ giả lập');
  });
  const sockets = new Set();
  server.on('connect', (req, client, head) => {
    const [host, port = '443'] = String(req.url).split(':');
    const target = port === '443' ? map[host.toLowerCase()] : undefined;
    if (!target) {
      refused.add(host.toLowerCase());
      client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      return;
    }
    const upstream = net.connect(target, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length) upstream.write(head);
      upstream.pipe(client); client.pipe(upstream);
    });
    for (const s of [client, upstream]) { s.gscbHost = host.toLowerCase(); sockets.add(s); s.on('close', () => sockets.delete(s)); s.on('error', () => s.destroy()); }
  });
  /** Tên miền này "không vào được nữa": bỏ ánh xạ VÀ cắt các kết nối đang mở tới nó
   *  (trình duyệt hay giữ kết nối để dùng lại — không cắt thì yêu cầu sau vẫn lọt). */
  const block = (host) => { delete map[host]; for (const s of sockets) if (s.gscbHost === host) s.destroy(); };
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    port: server.address().port,
    url: `http://127.0.0.1:${server.address().port}`,
    refused, map, block,
    close: () => new Promise((done) => { for (const s of sockets) s.destroy(); server.close(() => done()); })
  })));
}
