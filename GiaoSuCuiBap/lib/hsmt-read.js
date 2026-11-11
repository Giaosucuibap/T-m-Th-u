/** Nhận diện mục được nhắc trong văn bản HSMT đã dán; không chấm năng lực. */

function fold(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd').toLowerCase();
}

export function extractPdfStrings(bytes) {
  // Kept only for compatibility with an older message handler. Raw PDF needs a
  // real PDF parser and font decoding; regex over bytes must not imply success.
  return '';
}

export function inferGatesFromHsmt(text = '') {
  const hay = fold(text);
  const hit = (words) => words.some((w) => hay.includes(w));
  const similar = hit(['hop dong tuong tu', 'nang luc kinh nghiem', 'goi thau tuong tu']);
  const staff = hit(['nhan su chu chot', 'chi huy truong', 'chu nhiem', 'giay phep hanh nghe']);
  const equip = hit(['thiet bi thi cong', 'may thi cong', 'danh muc thiet bi']);
  const finance = hit(['nang luc tai chinh', 'doanh thu', 'bao cao tai chinh', 'so du']);
  return {
    similar: 'chua',
    staff: 'chua',
    equip: 'chua',
    finance: 'chua',
    hits: { similar, staff, equip, finance },
    excerpt: String(text).slice(0, 400),
    needsConfirm: true
  };
}
