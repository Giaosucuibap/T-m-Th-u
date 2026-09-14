import test from 'node:test';
import assert from 'node:assert/strict';
import { similarWorkType, checklistProgress, checklistItemsFor, normalizeCapability, applyCapability } from '../lib/capability.js';
import { normalizeContract, safeContracts, bestContractMatch, MATCH_LABEL } from '../lib/contracts.js';
import { inferGatesFromHsmt, extractPdfStrings } from '../lib/hsmt-read.js';
import { contractMatrix, matrixSummary } from '../lib/hsmt-matrix.js';
import { contractExpiryAlert, contractWindowYears, checklistDueItems } from '../lib/checklist-due.js';
import { applyApproval, approvalLabel } from '../lib/approval.js';
import { localRivals, marketBidPercentiles } from '../lib/rivals.js';
import { buildChecklistPack, mergeChecklistPack, verifyChecklistPack } from '../lib/sync-pack.js';
import { buildOutlineDocx } from '../lib/docx-lite.js';

const OLD = '2026-09-01T00:00:00.000Z', NEW = '2026-09-10T00:00:00.000Z';
const checklist = (at, owner = 'An', done = true) => ({ items: { hsmt: done }, owner, updatedAt: at });
const pack = (values = {}) => ({ source: 'GiaoSuCuiBap', checklists: {}, decisions: [], pastContracts: [], ...values });

test('generic thi công never classifies water, civic or embankment work as roadwork', () => {
  for (const [name, kind] of [['Thi công cấp nước', 'cap-thoat'], ['Thi công nhà văn hóa', 'dan-dung'], ['Thi công kè bờ', 'ke-bo'], ['Thi công đường giao thông', 'giao-thong'], ['Nạo vét kênh mương', 'thuy-loi'], ['Thi công hạng mục khác', '']]) assert.equal(similarWorkType(name), kind);
});
test('missing contract price is unknown and suggestions never claim HSMT qualification', () => {
  const t = { bidName: 'Thi công cấp nước', price: 1e9 };
  assert.equal(bestContractMatch(t, [{ name: 'Cấp nước xã A', workType: 'cap-thoat', price: 0 }]).status, 'chua');
  assert.equal(bestContractMatch(t, [{ name: 'Cấp nước xã A', workType: 'cap-thoat', price: 1e9 }]).status, 'dat');
  assert.match(MATCH_LABEL.dat, /Gợi ý/);
});
test('HSMT requirements and self-declared capability are distinct', () => {
  const g = inferGatesFromHsmt('Yêu cầu hợp đồng tương tự, nhân sự chủ chốt, thiết bị thi công và doanh thu');
  assert.deepEqual(g.hits, { similar: true, staff: true, equip: true, finance: true });
  for (const key of Object.keys(g.hits)) assert.equal(g[key], 'chua');
  assert.equal(inferGatesFromHsmt('Không có các cụm từ đang nhận diện dù văn bản này rất dài.').similar, 'chua');
  assert.equal(extractPdfStrings('%PDF (Hop dong tuong tu) Tj'), '');
  assert.equal(contractMatrix({ workType: 'thuy-loi' }, { workType: 'thuy-loi' })[0].status, 'chua');
  assert.equal(matrixSummary(contractMatrix({})).level, 'chua');
});
test('contract reminders require an explicit internal year setting', () => {
  assert.equal(contractWindowYears('TV'), null);
  assert.equal(contractWindowYears('XL'), null);
  assert.equal(contractExpiryAlert({ year: 2000 }).level, '');
  const alert = contractExpiryAlert({ year: 2020, windowYears: 3 }, Date.parse(NEW));
  assert.equal(alert.level, 'het'); assert.match(alert.text, /nội bộ/); assert.doesNotMatch(alert.text, /không dùng/);
});
test('checklists keep explicit booleans and omit expired tender reminders', () => {
  const p = checklistProgress({ items: { hsmt: 'false', gia: 'true', nop: true } });
  assert.equal(p.done, 1); assert.equal(p.items.hsmt, false);
  assert.equal(checklistProgress(undefined).done, 0);
  assert.equal(checklistItemsFor('TV').some((item) => item.id === 'chungchi'), false);
  assert.deepEqual(checklistDueItems({ closeDate: OLD }, {}, '', Date.parse(NEW)), []);
});
test('empty/punctuation capabilities give no hits; excluded province uses location only', () => {
  assert.deepEqual(normalizeCapability(null).trades, []);
  assert.deepEqual(normalizeCapability({ trades: ['!!!', 'Cấp nước', 'cấp nước'] }).trades, ['cấp nước']);
  const result = applyCapability({ bidName: 'Thiết bị thương hiệu Lâm Đồng', location: 'Hà Nội' }, { avoidProvinces: ['Lâm Đồng'] });
  assert.equal(result.delta, 0);
});
test('rivals and percentiles return empty for an unmatched market', () => {
  const parts = [{ notifyNo: 'IB1', contractorName: 'A', bidValue: 123 }];
  const tenders = [{ notifyNo: 'IB1', location: 'Hà Nội' }];
  assert.deepEqual(localRivals(parts, tenders, { province: 'Lâm Đồng' }), []);
  assert.deepEqual(marketBidPercentiles(parts, tenders, { province: 'Lâm Đồng' }), { n: 0, p25: null, p50: null, p75: null });
  assert.deepEqual(localRivals(parts, [], {}), []);
});
test('rivals consumes actual bidValue, dedupes supplier/package and handles later winner records', () => {
  const tenders = [{ key: 'IB100::00', location: 'Lâm Đồng' }];
  const rows = [
    { notifyNo: 'IB100-00', taxCode: 'vn123', contractorName: 'A', bidValue: 100, isWinner: 'false', capturedAt: OLD },
    { notifyNo: 'IB100', taxCode: '123', contractorName: 'A', bidValue: 110, isWinner: true, capturedAt: NEW },
    { notifyNo: 'IB200', taxCode: '456', contractorName: 'B', bidValue: 900 },
    { contractorName: 'Orphan', bidValue: 999 }
  ];
  const [a] = localRivals(rows, tenders);
  assert.equal(a.bids, 1); assert.equal(a.wins, 1); assert.equal(a.priceSamples, 1); assert.equal(a.medianBid, 110);
  assert.equal(marketBidPercentiles(rows, tenders).n, 1);
  assert.equal(localRivals([rows[0]], tenders)[0].wins, 0);
});
test('manual Go remains possible, while 2/3-step names normalize case and spaces', () => {
  assert.equal(applyApproval({}, '', 'GO', 1).tender.decisionState, 'GO');
  assert.equal(applyApproval({}, '', 'GO', 3).ok, false);
  const first = applyApproval({}, '  Nguyễn   An ', 'GO', 3).tender;
  assert.equal(applyApproval(first, 'nguyễn an', 'GO', 3).ok, false);
  const tech = applyApproval(first, 'Bình', 'GO', 3).tender;
  assert.equal(applyApproval(tech, ' BÌNH ', 'GO', 3).ok, false);
  const final = applyApproval(tech, 'Chi', 'GO', 3).tender;
  assert.equal(final.decisionConfirmedBy, 'Chi');
  const exited = applyApproval(final, 'Chi', 'REVIEW', 3).tender;
  assert.equal(exited.decisionTechBy, ''); assert.equal(exited.decisionConfirmedBy, '');
  const two = applyApproval({}, 'An', 'GO', 2).tender;
  assert.equal(applyApproval(two, 'Bình', 'GO', 2).tender.decisionConfirmedBy, 'Bình');
});
test('signed sync pack preserves all three approval stages and timestamps', () => {
  const t = { key: 'IB1::00', decisionState: 'GO', decisionOwner: 'An', decisionProposedBy: 'An', decisionProposedAt: OLD, decisionTechBy: 'Bình', decisionTechAt: NEW, decisionConfirmedBy: 'Chi', decisionConfirmedAt: NEW, decisionDirectorBy: 'Chi', decisionDirectorAt: NEW, decisionNote: 'Rà giá' };
  const p = buildChecklistPack({ tenders: [t] }, 'secret');
  assert.equal(verifyChecklistPack(p, 'secret').ok, true);
  const merged = mergeChecklistPack({ tenders: [{ key: t.key, decisionState: 'NEW', bidName: 'Local title', price: 42 }] }, p, 'An', 'secret');
  for (const field of Object.keys(t)) assert.equal(merged.tenders[0][field], t[field]);
  assert.equal(merged.tenders[0].price, 42);
});
test('switching two-step approval to three steps needs a fresh distinct final signer', () => {
  for (const name of ['Bình', '  BÌNH  ']) {
    let t = applyApproval({}, 'An', 'GO', 2).tender;
    t = applyApproval(t, 'Bình', 'GO', 2).tender;
    assert.equal(t.decisionConfirmedBy, 'Bình');
    const upgraded = applyApproval(t, name, 'GO', 3);
    assert.equal(upgraded.ok, true);
    assert.equal(upgraded.tender.decisionTechBy.trim(), name.trim());
    assert.equal(upgraded.tender.decisionConfirmedBy, '');
    assert.equal(upgraded.tender.decisionDirectorBy, '');
    assert.doesNotMatch(approvalLabel(upgraded.tender), /3 bước|đã duyệt/);
    assert.equal(applyApproval(upgraded.tender, 'bình', 'GO', 3).ok, false);
    const complete = applyApproval(upgraded.tender, 'Chi', 'GO', 3);
    assert.equal(complete.ok, true);
    assert.equal(complete.tender.decisionConfirmedBy, 'Chi');
  }
});
test('duplicate legacy approval identities never display a complete three-step approval', () => {
  const malformed = { decisionState: 'GO', decisionProposedBy: 'An', decisionTechBy: 'Bình', decisionConfirmedBy: ' BÌNH ' };
  assert.match(approvalLabel(malformed), /trùng người/);
  const repaired = applyApproval(malformed, 'Chi', 'GO', 3);
  assert.equal(repaired.tender.decisionConfirmedBy, 'Chi');
  assert.match(approvalLabel(repaired.tender), /3 bước/);
});
test('sync will not overwrite newer, owner-conflicting or timestamp-less checklists', () => {
  const current = { checklists: { a: checklist(NEW) } };
  for (const row of [checklist(OLD), checklist(''), checklist('2026-09-11T00:00:00Z', 'Bình')]) {
    const result = mergeChecklistPack(current, pack({ checklists: { a: row } }));
    assert.equal(result.checklistCount, 0); assert.equal(result.checklists.a.updatedAt, NEW); assert.equal(result.conflicts.length, 1);
  }
  const result = mergeChecklistPack({ checklists: { a: checklist(OLD) } }, pack({ checklists: { a: checklist(NEW, 'An', false) } }));
  assert.equal(result.checklists.a.items.hsmt, false);
});
test('sync decisions ignore force and cannot replace tender data or newer decisions', () => {
  const local = { key: 'a', decisionState: 'GO', decisionOwner: 'An', decisionUpdatedAt: NEW, price: 42, bidName: 'Local' };
  const bad = { ...local, decisionOwner: 'Bình', decisionUpdatedAt: '2026-09-11T00:00:00Z', force: true, price: 0, bidName: 'Injected' };
  assert.equal(mergeChecklistPack({ tenders: [local] }, pack({ decisions: [bad] })).decisionCount, 0);
  const good = { ...bad, decisionOwner: 'An' };
  const result = mergeChecklistPack({ tenders: [local] }, pack({ decisions: [good] }));
  assert.equal(result.decisionCount, 1); assert.equal(result.tenders[0].price, 42); assert.equal(result.tenders[0].bidName, 'Local');
  assert.equal(mergeChecklistPack({ tenders: [local] }, pack({ decisions: [{ ...good, decisionUpdatedAt: OLD }] })).decisionCount, 0);
});
test('sync contract merge is idempotent and never truncates local contracts at twenty', () => {
  const existing = Array.from({ length: 25 }, (_, i) => ({ id: `h${i}`, name: `Hợp đồng số ${i}`, year: 2025, updatedAt: NEW }));
  assert.equal(safeContracts(existing).length, 25);
  const p = pack({ pastContracts: [...existing, { id: 'new', name: 'Hợp đồng mới', updatedAt: NEW }] });
  const first = mergeChecklistPack({ pastContracts: existing }, p);
  const second = mergeChecklistPack({ pastContracts: first.pastContracts }, p);
  assert.equal(first.pastContracts.length, 26); assert.equal(second.pastContracts.length, 26);
  assert.equal(first.pastContracts[0].id, 'h0');
  assert.equal(normalizeContract({ name: 'Hợp đồng A', gates: { staff: false } }).gates.staff, 'thieu');
});
test('sync never resurrects older Go after a newer explicit reset to NEW', () => {
  const reset = { key: 'a', decisionState: 'NEW', decisionOwner: 'An', decisionUpdatedAt: NEW };
  const prior = { key: 'a', decisionState: 'GO', decisionOwner: 'An', decisionUpdatedAt: OLD, decisionProposedBy: 'An', decisionConfirmedBy: 'Bình' };
  const result = mergeChecklistPack({ tenders: [reset] }, pack({ decisions: [prior] }));
  assert.equal(result.decisionCount, 0);
  assert.equal(result.tenders[0].decisionState, 'NEW');
  assert.equal(result.tenders[0].decisionUpdatedAt, NEW);
});
test('explicit NEW reset exports and clears older Go on another machine', () => {
  const reset = { key: 'a', decisionState: 'NEW', decisionOwner: 'An', decisionUpdatedAt: NEW };
  const p = buildChecklistPack({ tenders: [reset, { key: 'pristine', decisionState: 'NEW' }] }, 'secret');
  assert.equal(p.decisions.length, 1);
  assert.equal(p.decisions[0].decisionState, 'NEW');
  const prior = { key: 'a', decisionState: 'GO', decisionOwner: 'An', decisionUpdatedAt: OLD, decisionProposedBy: 'An', decisionConfirmedBy: 'Bình' };
  const result = mergeChecklistPack({ tenders: [prior] }, p, 'An', 'secret');
  assert.equal(result.decisionCount, 1);
  assert.equal(result.tenders[0].decisionState, 'NEW');
  assert.equal(result.tenders[0].decisionConfirmedBy, '');
  assert.equal(result.tenders[0].decisionProposedBy, '');
});
test('pristine NEW tender still accepts a valid imported decision', () => {
  const incoming = { key: 'a', decisionState: 'GO', decisionOwner: 'An', decisionUpdatedAt: OLD };
  const result = mergeChecklistPack({ tenders: [{ key: 'a', decisionState: 'NEW' }] }, pack({ decisions: [incoming] }));
  assert.equal(result.decisionCount, 1);
  assert.equal(result.tenders[0].decisionState, 'GO');
});
test('malformed sync groups fail before mutation, and dangerous keys do not enter store', () => {
  assert.equal(mergeChecklistPack({}, pack({ decisions: {} })).ok, false);
  const p = pack({ checklists: JSON.parse('{"__proto__":{"items":{"hsmt":true}}}') });
  const result = mergeChecklistPack({}, p);
  assert.equal(result.checklistCount, 0); assert.equal(Object.hasOwn(result.checklists, '__proto__'), false);
});
test('DOCX text strips invalid XML controls and preserves escaped Vietnamese content', () => {
  const data = new TextDecoder().decode(buildOutlineDocx({ title: 'Kè & bờ\u0001', sections: ['Thi công <an toàn>'] }));
  assert.ok(data.includes('Kè &amp; bờ')); assert.ok(data.includes('&lt;an toàn&gt;')); assert.ok(!data.includes('bờ\u0001'));
});
