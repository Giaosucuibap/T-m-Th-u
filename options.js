/* Giáo Sư Cùi Bắp — options.js : trang Cấu hình. */

const ids = ['minPrice', 'maxPrice', 'minDaysToClose', 'reportMinScore', 'maxPagesHint', 'dailyTime',
  'maxStoredTenders', 'scanTimeoutSeconds', 'alertMinScore', 'telegramMinScore'];
const checks = ['requireConstruction', 'autoScan', 'scanOnStartup', 'openScheduledTabActive',
  'autoExportMobileReport', 'telegramEnabled', 'telegramDailySummary'];
const lines = ['provinces', 'positiveKeywords', 'requiredKeywords', 'negativeKeywords'];
const texts = ['requirementText', 'telegramBotToken', 'telegramChatId'];

const $ = (id) => document.getElementById(id);
const msg = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });

function esc(x) {
  return String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function load() {
  const s = (await msg('GET_STATE')).settings;
  ids.forEach((id) => { $(id).value = s[id] ?? ''; });
  checks.forEach((id) => { $(id).checked = Boolean(s[id]); });
  lines.forEach((id) => { $(id).value = (s[id] || []).join('\n'); });
  texts.forEach((id) => { $(id).value = s[id] || ''; });
  loadLog();
}

$('form').onsubmit = async (e) => {
  e.preventDefault();
  const p = {};
  ids.forEach((id) => { p[id] = id === 'dailyTime' ? $(id).value : Number($(id).value); });
  checks.forEach((id) => { p[id] = $(id).checked; });
  lines.forEach((id) => { p[id] = $(id).value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean); });
  texts.forEach((id) => { p[id] = $(id).value.trim(); });
  await msg('UPDATE_SETTINGS', p);
  $('saved').classList.remove('hidden');
  setTimeout(() => $('saved').classList.add('hidden'), 2500);
};

$('import').onclick = async () => {
  const f = $('backupFile').files[0];
  if (!f) return alert('Chọn file JSON backup.');
  try {
    const data = JSON.parse(await f.text());
    const r = await msg('IMPORT_BACKUP', { data });
    alert(r.ok ? 'Đã nhập backup.' : r.message);
    load();
  } catch (e) { alert('File không hợp lệ: ' + e.message); }
};

$('clear').onclick = async () => {
  if (confirm('Xóa toàn bộ gói thầu và lịch sử quét cục bộ?')) {
    await msg('CLEAR_DATA');
    alert('Đã xóa.');
  }
};

/* ------------------------------------------------------------------ *
 *  Telegram
 * ------------------------------------------------------------------ */

function tgSay(html, kind) {
  const box = $('tgMsg');
  box.innerHTML = html;
  box.style.color = kind === 'error' ? '#b91c1c' : kind === 'ok' ? '#166534' : 'inherit';
}

/**
 * Dò Chat ID: gọi getUpdates của bot rồi lấy các cuộc trò chuyện gần đây.
 * Nếu chỉ có một, điền luôn; nhiều hơn thì cho người dùng chọn.
 */
$('telegramDetect').onclick = async () => {
  const token = $('telegramBotToken').value.trim();
  if (!token) return tgSay('Nhập <b>Bot Token</b> trước đã.', 'error');
  tgSay('⏳ Đang hỏi Telegram…');
  const r = await msg('TELEGRAM_DETECT_CHAT', { token });

  if (!r || !r.ok) return tgSay(`❌ ${esc((r && r.message) || 'Không dò được.')}`, 'error');

  if (r.chats.length === 1) {
    $('telegramChatId').value = r.chats[0].id;
    tgSay(`✅ Đã điền Chat ID <b>${esc(r.chats[0].id)}</b> (${esc(r.chats[0].name)}).
      Bấm <b>Gửi thử</b> để kiểm tra, rồi nhớ <b>Lưu cấu hình</b>.`, 'ok');
    return;
  }
  tgSay(`Bot ${esc(r.botName)} thấy ${r.chats.length} cuộc trò chuyện — bấm vào cái bạn muốn nhận tin:<br>`
    + r.chats.map((c) => `<button type="button" class="btn light pick" data-id="${esc(c.id)}"
        style="width:auto;margin:6px 6px 0 0">${esc(c.name)} · ${esc(c.id)}</button>`).join(''));
  $('tgMsg').querySelectorAll('.pick').forEach((b) => {
    b.addEventListener('click', () => {
      $('telegramChatId').value = b.dataset.id;
      tgSay(`✅ Đã chọn Chat ID <b>${esc(b.dataset.id)}</b>. Bấm <b>Gửi thử</b> rồi <b>Lưu cấu hình</b>.`, 'ok');
    });
  });
};

$('telegramTest').onclick = async () => {
  const cfg = {
    telegramBotToken: $('telegramBotToken').value.trim(),
    telegramChatId: $('telegramChatId').value.trim()
  };
  if (!cfg.telegramBotToken || !cfg.telegramChatId) {
    return tgSay('Cần có cả <b>Bot Token</b> và <b>Chat ID</b> trước khi gửi thử.', 'error');
  }
  tgSay('⏳ Đang gửi…');
  const r = await msg('TELEGRAM_TEST', cfg);
  tgSay(r.ok
    ? '✅ Đã gửi. Mở Telegram xem thử. Nếu thấy tin nhắn, nhớ tick <b>Bật gửi tự động</b> rồi <b>Lưu cấu hình</b>.'
    : `❌ ${esc(r.message || 'Không gửi được.')}`, r.ok ? 'ok' : 'error');
  loadLog();
};

async function loadLog() {
  const r = await msg('TELEGRAM_LOG');
  const log = (r && r.log) || [];
  if (!log.length) { $('tgLog').textContent = 'Chưa gửi lần nào.'; return; }
  const kind = { test: 'Gửi thử', matches: 'Gói mới', summary: 'Báo định kỳ', send: 'Gửi' };
  $('tgLog').innerHTML = log.slice(0, 8).map((e) => {
    const t = new Date(e.at);
    return `<div>${e.ok ? '✅' : '❌'} ${esc(t.toLocaleString('vi-VN'))} · ${esc(kind[e.kind] || e.kind || '')}
      — ${esc(e.message || '')}</div>`;
  }).join('');
}
$('tgRefresh').onclick = loadLog;

load();

/* ==========================================================================
 *  LOGO CHÌM
 *  Người dùng chọn tệp → thu nhỏ, xoá nền trắng → lưu vào chrome.storage.
 *  Lưu trong storage chứ không phải một tệp trong thư mục, để logo SỐNG QUA
 *  MỌI LẦN CẬP NHẬT (giải nén bản mới đè lên thư mục cũ sẽ xoá mất tệp).
 * ======================================================================== */

const LOGO_KEY = 'brandLogo';
let logoPending = null;   // ảnh vừa xử lý, chờ bấm "Dùng logo này"

function logoSay(html, cls = '') {
  const el = $('logoMsg');
  el.className = `small ${cls}`;
  el.innerHTML = html;
}

function logoShow(dataUrl, caption) {
  const box = $('logoPreview');
  if (!dataUrl) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  box.innerHTML =
    `<div style="display:flex;gap:12px;align-items:center">
       <div style="background:
            linear-gradient(45deg,#e2e8f0 25%,transparent 25%,transparent 75%,#e2e8f0 75%) 0 0/16px 16px,
            linear-gradient(45deg,#e2e8f0 25%,#fff 25%,#fff 75%,#e2e8f0 75%) 8px 8px/16px 16px;
            padding:8px;border-radius:8px;border:1px solid var(--line)">
         <img src="${dataUrl}" style="max-width:160px;max-height:110px;display:block">
       </div>
       <div class="muted small" style="line-height:1.6">${caption}</div>
     </div>`;
}

function logoSliders() {
  $('logoOpacityVal').textContent = `${$('logoOpacity').value}%`;
  $('logoSizeVal').textContent = `${$('logoSize').value} px`;
  // Xem trực tiếp trên chính trang này.
  document.documentElement.style.setProperty('--watermark-opacity', String(Number($('logoOpacity').value) / 100));
  document.documentElement.style.setProperty('--watermark-size', `min(70vmin, ${$('logoSize').value}px)`);
}
$('logoOpacity').oninput = logoSliders;
$('logoSize').oninput = logoSliders;
logoSliders();

$('logoFile').onchange = async (ev) => {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  logoSay('⏳ Đang xử lý ảnh…');
  try {
    const { prepareLogo } = await import('./lib/brandlogo.js');
    const out = await prepareLogo(file, { removeWhite: $('logoStripWhite').checked });
    logoPending = out;

    const bits = [];
    if (out.scaled) bits.push(`đã thu nhỏ về ${out.width}×${out.height}`);
    else bits.push(`${out.width}×${out.height}`);
    bits.push(`${Math.round(out.bytes / 1024)} KB`);
    if ($('logoStripWhite').checked) {
      const pct = Math.round(out.clearedRatio * 100);
      bits.push(pct >= 5
        ? `đã xoá ${pct}% nền trắng`
        : '<b>gần như không có nền trắng để xoá</b> — nếu logo vẫn hiện ô vuông, ảnh có thể có nền xám/màu');
    }
    logoShow(out.dataUrl, bits.join(' · ') + '<br>Ô ca-rô phía sau là <b>vùng trong suốt</b>.');
    logoSay('Xem thử ở trên. Ưng thì bấm <b>Dùng logo này</b>.', 'ok');
  } catch (e) {
    logoPending = null;
    logoShow(null);
    logoSay(`❌ ${esc(e.message || e)}`, 'error');
  }
};

$('logoSave').onclick = async () => {
  if (!logoPending) return logoSay('Chọn tệp ảnh trước đã.', 'error');
  const entry = {
    dataUrl: logoPending.dataUrl,
    opacity: Number($('logoOpacity').value) / 100,
    size: Number($('logoSize').value),
    savedAt: Date.now()
  };
  try {
    await chrome.storage.local.set({ [LOGO_KEY]: entry });
    logoSay('✅ Đã lưu. Logo hiện trên mọi trang ngay bây giờ, và <b>không mất khi cập nhật phần mềm</b>.', 'ok');
  } catch (e) {
    logoSay(`❌ Không lưu được: ${esc(e.message || e)}`, 'error');
  }
};

$('logoRemove').onclick = async () => {
  await chrome.storage.local.remove(LOGO_KEY);
  logoPending = null;
  $('logoFile').value = '';
  logoShow(null);
  logoSay('Đã gỡ logo.', '');
};

(async () => {
  const s = await chrome.storage.local.get({ [LOGO_KEY]: null });
  const cur = s[LOGO_KEY];
  if (!cur || !cur.dataUrl) { logoSay('Chưa có logo. Chọn tệp để bắt đầu.'); return; }
  if (Number(cur.opacity) > 0) $('logoOpacity').value = String(Math.round(cur.opacity * 100));
  if (Number(cur.size) > 0) $('logoSize').value = String(cur.size);
  logoSliders();
  logoShow(cur.dataUrl, 'Logo đang dùng.');
  logoSay('Đang dùng logo này. Chọn tệp khác để thay, hoặc kéo hai thanh trượt rồi bấm <b>Dùng logo này</b>.');
})();
