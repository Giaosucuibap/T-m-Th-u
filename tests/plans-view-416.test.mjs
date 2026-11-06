import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { dedupeKhlcnt, summarizeKhlcnt, khlcntDateRange, classifyPlansByCriteria } from '../GiaoSuCuiBap/lib/khlcnt.js';
import { coverageText } from '../GiaoSuCuiBap/lib/match-gate.js';
import { hardFilterReason } from '../GiaoSuCuiBap/lib/hard-filter.js';
import { safeSource } from '../GiaoSuCuiBap/lib/workspace.js';
import { formatDate, formatMoney } from '../GiaoSuCuiBap/lib/core.js';
import { TENDER_CATEGORIES, normalizeCategory, categoryLabel } from '../GiaoSuCuiBap/lib/tender-categories.js';

test('Approval order defeats late publication and puts undated plans after every dated plan', () => {
  const rows = [
    { key: 'old-late-published', decisionDate: '2024-01-29', publicDate: '2026-10-04' },
    { key: 'latest-approved', decisionDate: '2026-10-02', publicDate: '2026-10-02' },
    { key: 'unknown', decisionDate: null, publicDate: '2099-01-01' },
    { key: 'summer', decisionDate: '2026-08-15', publicDate: '2026-08-17' },
    { key: 'pre-epoch', decisionDate: '1960-01-01', publicDate: '1960-01-01' }
  ];
  const before = JSON.stringify(rows);
  assert.deepEqual(dedupeKhlcnt(rows).map(p => p.key), ['latest-approved', 'summer', 'old-late-published', 'pre-epoch', 'unknown']);
  assert.equal(JSON.stringify(rows), before);
});

test('Equal approvals use publication then a deterministic key; latest duplicate keeps source fields', () => {
  const rows = [
    { key: 'B', decisionDate: '02/10/2026 08:00:00', publicDate: '2026-10-03T08:00:00' },
    { key: 'A', decisionDate: '2026-10-02T08:00:00', publicDate: '2026-10-03T08:00:00' },
    { key: 'C', decisionDate: '2026-10-02T08:00:00', publicDate: null },
    { key: 'D', decisionDate: '2026-10-02T08:00:00', publicDate: '2026-10-04T08:00:00' },
    { key: 'A', name: 'New source revision', decisionDate: '2026-10-02T08:00:00', publicDate: '2026-10-03T08:00:00' }
  ];
  assert.deepEqual(dedupeKhlcnt(rows).map(p => p.key), ['D', 'A', 'B', 'C']);
  assert.equal(dedupeKhlcnt(rows).find(p => p.key === 'A').name, 'New source revision');
  assert.deepEqual(dedupeKhlcnt([...rows].reverse()).map(p => p.key), ['D', 'A', 'B', 'C']);
});

test('Sorting does not replace the approval gate with publication or turn missing approval into a match', () => {
  const plan = (key, decisionDate, publicDate) => ({ key, decisionDate, publicDate, packages: [{ name: 'Thi công trường học', price: 10, investField: 'XL' }] });
  const criteria = { fromDate: '2026-07-07', toDate: '2026-10-05', category: 'XL' };
  const result = classifyPlansByCriteria([
    plan('late-publication', '2026-08-01', '2026-12-01'),
    plan('old-approval', '2023-06-14', '2026-10-02'),
    plan('missing-approval', null, '2026-10-02')
  ], criteria);
  assert.deepEqual(result.match.map(p => p.key), ['late-publication']);
  assert.deepEqual(result.outOfRange.map(p => p.key), ['old-approval']);
  assert.deepEqual(result.insufficient.map(p => p.key), ['missing-approval']);
});

function harness() {
  const nodes = new Map(), intervals = new Map(), requests = [];
  let nextTimer = 0, reply = { ok: true, revision: 'empty', lookup: null };
  const node = id => {
    if (!nodes.has(id)) {
      let html = '';
      const hidden = new Set(), listeners = new Map();
      nodes.set(id, { id, value: id === 'period' ? '90' : '', checked: false, disabled: false, textContent: '', title: '', writes: 0,
        className: '', classList: { toggle: (name, on) => on ? hidden.add(name) : hidden.delete(name), contains: name => hidden.has(name) },
        get innerHTML() { return html; }, set innerHTML(value) { html = value; this.writes++; },
        addEventListener(type, handler) { listeners.set(type, [...(listeners.get(type) || []), handler]); },
        emit(type, event = {}) { for (const handler of listeners.get(type) || []) handler(event); },
        checkValidity: () => true, reportValidity() {} });
    }
    return nodes.get(id);
  };
  const context = vm.createContext({ document: { getElementById: node }, console, URLSearchParams,
    Date, Intl, location: { search: '' }, initInvestorInput() {}, readInvestorInput: () => ({ ok: true }),
    coverageText, hardFilterReason, safeSource, formatDate, formatMoney, TENDER_CATEGORIES, normalizeCategory, categoryLabel,
    dedupeKhlcnt, summarizeKhlcnt, khlcntDateRange,
    createWardPicker: () => ({ load: async () => {}, clear() {}, read: () => ({ ward: '' }), set() {} }),
    setInterval: fn => { const id = ++nextTimer; intervals.set(id, fn); return id; }, clearInterval: id => intervals.delete(id),
    chrome: { runtime: { async sendMessage(message) {
      requests.push(message);
      if (message.type === 'GET_PLAN_STATE') return structuredClone(reply);
      if (message.type === 'AREA_OPTIONS') return { ok: true, provinces: [] };
      return { ok: true };
    } } } });
  const source = fs.readFileSync(new URL('../GiaoSuCuiBap/plans.js', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
  vm.runInContext(source + '\nglobalThis.__refresh = refresh;', context);
  return { node, requests, intervals, context, setReply: value => { reply = value; }, refresh: () => context.__refresh() };
}

const plan = (key, decisionDate, publicDate, extra = {}) => ({ key, planNoStand: key, name: key, decisionDate, publicDate,
  investorName: 'Ban số 1', wards: [], fields: ['Xây lắp'], packageCount: 1, totalPackagePrice: 100, packages: [{ name: 'Thi công trường học', price: 100 }], ...extra });
const running = () => ({ id: 'running-1', status: 'RUNNING', serverCount: 2, totalElements: 10, pagesRead: 1,
  criteria: { fromDate: '2026-07-07', toDate: '2026-10-05', category: 'XL' },
  plans: [plan('early', '2026-08-15', '2026-10-04'), plan('recent', '2026-10-02', '2026-10-02')],
  insufficientPlans: [], message: 'Đã nhận trang đầu', coverage: { text: 'Đã nhận 2/10 kế hoạch; chưa đủ dữ liệu.', complete: false } });

test('Real plan page code shows gated first-page cards and totals before the last page arrives', async () => {
  const h = harness(); await new Promise(resolve => setImmediate(resolve));
  h.setReply({ ok: true, revision: 'page-1', lookup: running() }); await h.refresh();
  assert.equal(h.node('summary').classList.contains('hidden'), false);
  assert.equal(h.node('progress').classList.contains('hidden'), false);
  assert.equal(h.node('m-plan').textContent, 2);
  assert.equal(h.node('m-pkg').textContent, 2);
  assert.match(h.node('m-plan-sub').textContent, /Đang cập nhật từng trang/);
  assert.ok(h.node('list').innerHTML.indexOf('recent') < h.node('list').innerHTML.indexOf('early'));
  assert.match(h.node('alert').textContent, /7\/7\/2026.*5\/10\/2026.*Mới nhất trước/);
  assert.match(h.node('alert').textContent, /chưa đủ dữ liệu/);
  assert.equal(h.node('csv').disabled, false);
});

test('Unchanged worker revision preserves the existing result DOM and user criterion edits', async () => {
  const h = harness(); await new Promise(resolve => setImmediate(resolve));
  h.setReply({ ok: true, revision: 'page-1', lookup: running() }); await h.refresh();
  const writes = h.node('list').writes;
  h.node('investor').value = 'Tên đang sửa'; h.node('investor').emit('input');
  h.setReply({ ok: true, revision: 'page-1', unchanged: true }); await h.refresh();
  assert.equal(h.node('list').writes, writes);
  assert.equal(h.node('investor').value, 'Tên đang sửa');
  assert.equal(h.requests.at(-1).payload.revision, 'page-1');
  h.setReply({ ok: true, revision: 'page-2', lookup: { ...running(), status: 'SUCCESS', finishedAt: '2026-10-05T04:00:00Z',
    summary: summarizeKhlcnt(running().plans), coverage: { text: 'Đã đọc đủ.', complete: true } } }); await h.refresh();
  assert.equal(h.node('progress').classList.contains('hidden'), true);
  assert.equal(h.node('investor').value, 'Tên đang sửa');
  assert.doesNotMatch(h.node('m-plan-sub').textContent, /Đang cập nhật/);
  assert.equal(h.intervals.size, 0);
});

test('Workers without revision support remain compatible without rebuilding identical cards', async () => {
  const h = harness(); await new Promise(resolve => setImmediate(resolve));
  h.setReply({ ok: true, lookup: running() }); await h.refresh();
  const writes = h.node('list').writes; await h.refresh();
  assert.equal(h.node('list').writes, writes);
  const next = running(); next.plans[0].name = 'Tên nguồn đã cập nhật';
  h.setReply({ ok: true, lookup: next }); await h.refresh();
  assert.match(h.node('list').innerHTML, /Tên nguồn đã cập nhật/);
});

test('The real plan page explains a failed detail table without claiming that complete list pages are missing', async () => {
  const h = harness(); await new Promise(resolve => setImmediate(resolve));
  const unknown = plan('unknown-detail', '2026-10-02', '2026-10-02', {
    packages:[{name:'Thi công',price:null,priceBindingPending:true}], totalPackagePrice:0,
    filterState:'INSUFFICIENT',filterReason:'insufficient-price',detailReadError:'Bảng gói chưa đủ. <script>bad</script>'});
  h.setReply({ok:true,revision:'detail-failed',lookup:{...running(),status:'PARTIAL',partial:true,
    serverCount:1,totalElements:1,pagesRead:1,detailStatus:'DONE',detailFailed:1,
    plans:[],insufficientPlans:[unknown],summary:summarizeKhlcnt([])}});
  await h.refresh();
  assert.match(h.node('alert').textContent, /1 kế hoạch chưa đối chiếu được bảng gói thầu/);
  assert.doesNotMatch(h.node('alert').textContent, /trước khi lấy hết các trang/);
  assert.match(h.node('insufficient-list').innerHTML, /Chi tiết chưa đọc được/);
  assert.match(h.node('insufficient-list').innerHTML, /chưa đủ dữ liệu giá/);
  assert.match(h.node('insufficient-list').innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(h.node('insufficient-list').innerHTML, /<script>/);
});
