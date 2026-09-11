/** Diff DOM nông: token id/class + vài dòng text, không parse HTML đầy đủ. */

function tokens(html = '') {
  const ids = [...String(html).matchAll(/id="([^"]+)"/g)].map((m) => `#${m[1]}`);
  const cls = [...String(html).matchAll(/class="([^"]+)"/g)]
    .flatMap((m) => m[1].split(/\s+/)).filter((x) => x.length > 2).map((x) => `.${x}`);
  return new Set([...ids, ...cls].slice(0, 400));
}

export function tokenDiff(prevHtml = '', nextHtml = '') {
  const a = tokens(prevHtml);
  const b = tokens(nextHtml);
  const added = [...b].filter((x) => !a.has(x)).slice(0, 40);
  const removed = [...a].filter((x) => !b.has(x)).slice(0, 40);
  return { added, removed, changed: added.length + removed.length };
}

export function highlightDiff(diff = {}) {
  const add = (diff.added || []).map((x) => `<ins>${escape(x)}</ins>`).join(' ');
  const rem = (diff.removed || []).map((x) => `<del>${escape(x)}</del>`).join(' ');
  return { html: `Thêm: ${add || '—'}<br>Mất: ${rem || '—'}`, text: `+${(diff.added || []).length} / -${(diff.removed || []).length}` };
}

function escape(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function snapshotRecord(html, extra = {}) {
  return {
    at: extra.at || new Date().toISOString(),
    url: String(extra.url || '').slice(0, 300),
    length: String(html || '').length,
    tokens: [...tokens(html)].slice(0, 80),
    html: String(html || '').slice(0, 80000)
  };
}
