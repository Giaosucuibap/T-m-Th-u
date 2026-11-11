import { EGP_SELECTORS, htmlSignals } from './egp-selectors.js';

export function missingSelectors(html = '') {
  const text = String(html);
  const miss = [];
  const present = [];
  const groups = {
    paginationNext: EGP_SELECTORS.paginationNext,
    paginationBar: EGP_SELECTORS.paginationBar,
    bbmtPane: EGP_SELECTORS.bbmtPane,
    bbmtCards: EGP_SELECTORS.bbmtCards
  };
  for (const [group, list] of Object.entries(groups)) {
    const hit = list.filter((sel) => {
      const token = sel.replace(/^\./, '').replace(/^#/, '').split(/[\s\[]/)[0];
      return token && text.includes(token);
    });
    if (hit.length) present.push({ group, hit });
    else miss.push({ group, expected: list });
  }
  const signals = htmlSignals(text);
  return { miss, present, signals, ok: miss.length === 0 };
}
