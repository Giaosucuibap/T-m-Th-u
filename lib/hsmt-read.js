/** Đọc chữ từ HSMT (PDF text-layer hoặc văn bản dán) rồi gợi ý cửa ma trận. */

function fold(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd').toLowerCase();
}

export function extractPdfStrings(bytes) {
  const raw = typeof bytes === 'string' ? bytes : new TextDecoder('latin1').decode(bytes || new Uint8Array());
  const out = [];
  for (const m of raw.matchAll(/\((?:\\.|[^\\)]){3,240}\)/g)) {
    out.push(m[0].slice(1, -1).replace(/\\n/g, ' ').replace(/\\[()]/g, '$&').replace(/\\/g, ''));
  }
  for (const m of raw.matchAll(/BT([\s\S]{0,800}?)ET/g)) {
    const chunk = m[1].replace(/[^\x20-\x7E\u00C0-\u024F]+/g, ' ');
    if (chunk.trim().length > 8) out.push(chunk);
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

export function inferGatesFromHsmt(text = '') {
  const hay = fold(text);
  const hit = (words) => words.some((w) => hay.includes(w));
  const similar = hit(['hop dong tuong tu', 'nang luc kinh nghiem', 'goi thau tuong tu']);
  const staff = hit(['nhan su chu chot', 'chi huy truong', 'chu nhiem', 'giay phep hanh nghe']);
  const equip = hit(['thiet bi thi cong', 'may thi cong', 'danh muc thiet bi']);
  const finance = hit(['nang luc tai chinh', 'doanh thu', 'bao cao tai chinh', 'so du']);
  const toGate = (ok) => (ok ? 'dat' : (hay.length > 40 ? 'thieu' : 'chua'));
  return {
    similar: toGate(similar),
    staff: toGate(staff),
    equip: toGate(equip),
    finance: toGate(finance),
    hits: { similar, staff, equip, finance },
    excerpt: String(text).slice(0, 400),
    needsConfirm: true
  };
}
