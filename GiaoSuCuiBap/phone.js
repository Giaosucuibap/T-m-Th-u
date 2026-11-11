/* Trang "Link điện thoại" (4.20.0): bật/tắt, mã QR, đổi khoá, gửi link qua Telegram. Mọi việc thật do
   service worker làm (lib/runtime-phone.js); trang chỉ hiển thị trạng thái. */
import { PHONE_CODE_TEXT } from './lib/phone-link.js';

const $ = (id) => document.getElementById(id);
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });
let current = null;
let shownLink = '';
/* Lỗi của lần bấm "Ghép nối" gần nhất. Trang tự làm mới 2 giây một lần và trước 4.22.0 nhịp làm mới đó ghi đè
   luôn dòng báo lỗi: "Mã ghép nối không đúng" hiện chưa tới 2 giây rồi biến mất (đo: 1,78 giây; có lúc chỉ vài
   mili giây). Nay giữ tới lần bấm "Ghép nối" kế tiếp hoặc tới khi ghép xong — người dùng vừa sửa mã vừa còn
   đọc được lời nhắc "8 ký tự, ví dụ 7KQ2-M9XD". Lỗi chỉ nằm trong trang đang mở, không ghi vào kho. */
let pairError = '';
/* Chỉ ghi khi nội dung đổi: hai dòng trạng thái là vùng role="status" — ghi lại chữ y hệt mỗi 2 giây làm trình
   đọc màn hình có thể đọc lại, và bắt trình duyệt vẽ lại không cần thiết. */
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
const setClass = (el, name) => { if (el.className !== name) el.className = name; };

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

function relayText(r) {
  if (!r?.claimed) return { tone: '', text: 'Chưa ghép địa chỉ cố định: link đổi mỗi khi máy tính hoặc Chrome khởi động lại.' };
  if (r.current) {
    const at = r.registeredAt ? new Date(r.registeredAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
    return { tone: 'ok', text: `Đã ghép ${r.url} — điện thoại tự tìm thấy máy tính này (báo đường hầm mới lúc ${at}).` };
  }
  if (r.error) return { tone: 'warn', text: `Đã ghép ${r.url}, nhưng chưa báo được đường hầm hiện tại: ${r.errorText} ` };
  return { tone: 'warn', text: `Đã ghép ${r.url} — đang chờ đường hầm của máy tính mở xong để báo địa chỉ mới…` };
}

function render(s) {
  current = s;
  const st = statusText(s);
  const box = $('pl-status');
  setText(box, st.text);
  setClass(box, `notice${st.tone ? ` ${st.tone}` : ''}`);
  setText($('pl-toggle'), s?.enabled ? 'Tắt link điện thoại' : 'Bật link điện thoại');
  setClass($('pl-toggle'), s?.enabled ? 'btn light' : 'btn');
  $('pl-rotate').disabled = !s?.enabled;
  $('pl-install').classList.toggle('hidden', Boolean(s?.host?.connected));
  const link = s?.link || '';
  $('pl-qr-card').classList.toggle('hidden', !link);
  $('pl-tg-card').classList.toggle('hidden', !s?.enabled);
  $('pl-relay-card').classList.toggle('hidden', !s?.enabled);
  if (s?.relay?.claimed) pairError = '';
  const rt = pairError ? { tone: 'error', text: pairError } : relayText(s?.relay);
  setText($('pl-relay-status'), rt.text);
  setClass($('pl-relay-status'), `notice${rt.tone ? ` ${rt.tone}` : ''}`);
  $('pl-relay-form').classList.toggle('hidden', Boolean(s?.relay?.claimed));
  $('pl-relay-paired').classList.toggle('hidden', !s?.relay?.claimed);
  setText($('pl-qr-title'), s?.relay?.claimed ? 'Địa chỉ cố định — quét MỘT LẦN bằng camera iPhone / iPad' : 'Quét mã này bằng camera iPhone');
  // Hướng dẫn theo đúng chế độ: link trực tiếp (đổi khi khởi động lại) hay địa chỉ cố định (cài biểu tượng được).
  $('pl-steps-direct').classList.toggle('hidden', Boolean(s?.relay?.claimed));
  $('pl-steps-relay').classList.toggle('hidden', !s?.relay?.claimed);
  $('pl-tg-relay-note').classList.toggle('hidden', !s?.relay?.claimed);
  $('pl-tg').checked = s?.telegram === true;
  setText($('pl-tg-status'), telegramText(s));
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
$('pl-relay-pair').addEventListener('click', async () => {
  const btn = $('pl-relay-pair');
  btn.disabled = true;
  btn.textContent = 'Đang ghép…';
  pairError = '';
  try {
    const r = await send('SET_PHONE_RELAY', { url: $('pl-relay-url').value, code: $('pl-relay-code').value });
    if (r?.ok === false) { pairError = r.message || 'Không ghép được.'; render(current); return; }
    shownLink = '';
    render(r);
  } catch (error) {
    // Tiện ích không trả lời (đang khởi động lại…): nói rõ, không để nút lặng lẽ quay về "Ghép nối".
    pairError = `Không ghép được: ${String(error?.message || error).slice(0, 160)}`;
    render(current);
  } finally { btn.disabled = false; btn.textContent = 'Ghép nối'; }
});
$('pl-relay-unpair').addEventListener('click', async () => {
  if (!confirm('Bỏ ghép địa chỉ cố định? Mã QR quay về link đổi theo đường hầm; iPhone/iPad đã cài biểu tượng sẽ không tìm thấy máy tính này nữa.')) return;
  shownLink = '';
  render(await send('CLEAR_PHONE_RELAY'));
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
