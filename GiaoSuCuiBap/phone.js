/* Trang "Link điện thoại" (4.20.0): bật/tắt, mã QR, đổi khoá, gửi link qua Telegram. Mọi việc thật do
   service worker làm (lib/runtime-phone.js); trang chỉ hiển thị trạng thái. */
import { PHONE_CODE_TEXT } from './lib/phone-link.js';

const $ = (id) => document.getElementById(id);
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });
let current = null;
let shownLink = '';

function statusText(s) {
  if (!s?.ok) return { tone: 'error', text: s?.message || 'Không đọc được trạng thái.' };
  if (!s.enabled) return { tone: '', text: 'Đang tắt. Bấm "Bật link điện thoại" để điện thoại tra được bằng máy tính này.' };
  if (!s.host?.connected) {
    const e = String(s.host?.error || '');
    if (/not found|không tìm|forbidden|access/i.test(e)) return { tone: 'error', text: PHONE_CODE_TEXT.HOST_MISSING };
    return { tone: 'warn', text: e ? `Chưa nối được cầu nối điện thoại: ${e} — tiện ích tự thử lại mỗi phút.` : 'Đang nối cầu nối điện thoại…' };
  }
  const t = s.tunnel || {};
  if (t.state === 'up' || (t.state === 'off' && s.link)) return { tone: 'ok', text: `Sẵn sàng. Quét mã QR bên dưới bằng camera iPhone.${s.busy ? ' Đang có một lượt tra từ điện thoại.' : ''}` };
  if (t.state === 'missing') return { tone: 'error', text: PHONE_CODE_TEXT.CLOUDFLARED_MISSING };
  if (t.state === 'down') return { tone: 'warn', text: PHONE_CODE_TEXT.TUNNEL_RESTARTING };
  return { tone: 'warn', text: 'Đang mở đường hầm Cloudflare (thường 5–30 giây)…' };
}

function telegramText(s) {
  if (!s?.telegram) return '';
  const last = s.telegramLast;
  const at = last?.at ? new Date(last.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
  if (s.telegramSentCurrent) return `✓ Đã gửi link hiện tại qua Telegram lúc ${at}.`;
  if (last && last.ok === false) return `Chưa gửi được (${at}): ${last.message} — tự thử lại sau 10 phút.`;
  return 'Sẽ gửi ngay khi link sẵn sàng.';
}

function render(s) {
  current = s;
  const st = statusText(s);
  const box = $('pl-status');
  box.textContent = st.text;
  box.className = `notice${st.tone ? ` ${st.tone}` : ''}`;
  $('pl-toggle').textContent = s?.enabled ? 'Tắt link điện thoại' : 'Bật link điện thoại';
  $('pl-toggle').className = s?.enabled ? 'btn light' : 'btn';
  $('pl-rotate').disabled = !s?.enabled;
  $('pl-install').classList.toggle('hidden', Boolean(s?.host?.connected));
  const link = s?.link || '';
  $('pl-qr-card').classList.toggle('hidden', !link);
  $('pl-tg-card').classList.toggle('hidden', !s?.enabled);
  $('pl-tg').checked = s?.telegram === true;
  $('pl-tg-status').textContent = telegramText(s);
  if (link && link !== shownLink && typeof window.qrcode === 'function') {
    const qr = window.qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    $('pl-qr').src = qr.createDataURL(8, 4);
    $('pl-link').href = link;
    $('pl-link').textContent = link.replace(/#k=.*/, '#k=••••');
    shownLink = link;
  }
}

async function refresh() {
  try { render(await send('PHONE_LINK_STATE')); } catch (error) { render({ ok: false, message: String(error?.message || error) }); }
}

$('pl-toggle').addEventListener('click', async () => {
  $('pl-toggle').disabled = true;
  try { render(await send('SET_PHONE_LINK', { enabled: !current?.enabled })); } finally { $('pl-toggle').disabled = false; }
});
$('pl-rotate').addEventListener('click', async () => {
  if (!confirm('Đổi khoá: mọi link và mã QR cũ hết hiệu lực ngay. Điện thoại phải quét mã mới. Tiếp tục?')) return;
  shownLink = '';
  render(await send('SET_PHONE_LINK_KEY'));
});
$('pl-tg').addEventListener('change', async () => {
  $('pl-tg').disabled = true;
  try { render(await send('SET_PHONE_LINK_TELEGRAM', { enabled: $('pl-tg').checked })); } finally { $('pl-tg').disabled = false; }
});
$('pl-copy').addEventListener('click', async () => {
  if (!current?.link) return;
  try { await navigator.clipboard.writeText(current.link); $('pl-copy').textContent = 'Đã chép'; setTimeout(() => { $('pl-copy').textContent = 'Chép link'; }, 1500); } catch { /* trình duyệt chặn chép */ }
});

void refresh();
setInterval(refresh, 2000);
