/** Kênh báo ngoài Chrome: Telegram theo bộ săn, email, webhook (Zalo/n8n). */

export function safeHttpsWebhook(url) {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol !== 'https:') return '';
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return '';
    return u.href.slice(0, 500);
  } catch {
    return '';
  }
}

export function safeEmail(value) {
  const email = String(value || '').trim().slice(0, 200);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

export function safeChatId(value) {
  const id = String(value || '').trim();
  return /^-?\d{5,20}$/.test(id) || /^@?[A-Za-z0-9_]{5,64}$/.test(id) ? id : '';
}

export function mailtoHref(email, subject, body) {
  const to = safeEmail(email);
  if (!to) return '';
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(String(body || '').slice(0, 1800))}`;
}

export function channelPayload(kind, text, extra = {}) {
  return {
    source: 'GiaoSuCuiBap',
    version: '4.6.0',
    kind: String(kind || 'notice').slice(0, 40),
    text: String(text || '').slice(0, 4000),
    at: new Date().toISOString(),
    ...extra
  };
}
