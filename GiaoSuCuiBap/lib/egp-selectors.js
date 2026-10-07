/** Bộ chọn DOM e-GP — nhiều tầng, để phát hiện theme đổi. */

export const EGP_SELECTORS = Object.freeze({
  paginationNext: ['.el-pagination .btn-next', '.ant-pagination-next', 'button[aria-label="Next"]'],
  paginationBar: ['.el-pagination', '.ant-pagination'],
  bbmtPane: ['#bidOpeningMinutes'],
  bbmtCards: ['#ttnt-card-bbmt-ldt', '#ttnt-card-bbmt-khac', '#ttnt-card-bbmt-adbwb'],
  resultCards: ['[class*="card"]', 'article', 'tr'],
  noticeCode: String.raw`\bIB\d{6,}\b`
});

export function htmlSignals(html = '') {
  const text = String(html);
  const hit = (list) => list.filter((sel) => text.includes(sel.replace(/^\./, '').split('[')[0].replace(/^#/, '')));
  return {
    hasPagination: /el-pagination|ant-pagination|btn-next/.test(text),
    hasBbmt: /bidOpeningMinutes|ttnt-card-bbmt/.test(text),
    hasNotice: /IB\d{6,}/.test(text),
    paginationHits: hit(EGP_SELECTORS.paginationNext),
    bbmtHits: hit(EGP_SELECTORS.bbmtCards)
  };
}
