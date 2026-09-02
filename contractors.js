import { findContractorPackages, summarizeContractors, formatMoney, normalizeTaxCode } from './lib/core.js';

const $ = (id) => document.getElementById(id);
const msg = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });
let PARTS = [];

function esc(x) {
  return String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function load() {
  const s = await msg('GET_STATE');
  PARTS = (s && s.participations) || [];
  renderDirectory();
  const params = new URLSearchParams(location.search);
  const preset = params.get('q');
  if (preset) { $('q').value = preset; runSearch(); }
}

function renderDirectory() {
  const dir = summarizeContractors(PARTS);
  $('dir-count').textContent = `${dir.length} nhà thầu · ${PARTS.length} lượt tham dự`;
  $('empty').classList.toggle('hidden', PARTS.length > 0);
  $('dir').innerHTML = dir.slice(0, 300).map((g) => `
    <tr class="contractor-row" data-q="${esc(g.taxCode || g.contractorName)}">
      <td class="cname">${esc(g.contractorName)}</td>
      <td>${esc(g.taxCode || '—')}</td>
      <td>${g.joined}</td>
      <td style="color:#166534;font-weight:800">${g.won}</td>
      <td>${g.winRate}%</td>
    </tr>`).join('');
  $('dir').querySelectorAll('.contractor-row').forEach((tr) => {
    tr.addEventListener('click', () => { $('q').value = tr.dataset.q; runSearch(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  });
}

function runSearch() {
  const q = $('q').value.trim();
  const list = findContractorPackages(PARTS, q);
  const has = list.length > 0;
  $('summary').classList.toggle('hidden', !has);
  $('results').classList.toggle('hidden', !has);
  if (!has) {
    if (q) $('rows').innerHTML = '';
    return;
  }
  const won = list.filter((p) => p.isWinner);
  const totalWonValue = won.reduce((a, p) => a + (Number(p.bidValue) || 0), 0);
  $('m-name').textContent = list[0].contractorName || '—';
  $('m-tax').textContent = list[0].taxCode ? `MST: ${list[0].taxCode}` : 'Chưa rõ MST';
  $('m-join').textContent = list.length;
  $('m-won').textContent = won.length;
  $('m-rate').textContent = `${Math.round((won.length / list.length) * 100)}%${totalWonValue ? ` · ${formatMoney(totalWonValue)}` : ''}`;
  $('rows').innerHTML = list.map((p) => `
    <tr>
      <td><span class="pill ${p.isWinner ? 'badge-win' : 'badge-join'}">${p.isWinner ? 'Trúng thầu' : 'Tham dự'}</span></td>
      <td>${esc(p.notifyNo || '—')}</td>
      <td>${esc(p.bidName || '—')}</td>
      <td>${esc(p.province || '—')}</td>
      <td>${esc(formatMoney(p.bidValue))}</td>
      <td><a class="link" href="${esc(p.detailUrl)}" target="_blank" rel="noopener">Mở trên e-GP ↗</a></td>
    </tr>`).join('');
}

$('btn').addEventListener('click', runSearch);
$('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });
$('clear').addEventListener('click', () => { $('q').value = ''; $('summary').classList.add('hidden'); $('results').classList.add('hidden'); });

document.addEventListener('DOMContentLoaded', load);
load();
