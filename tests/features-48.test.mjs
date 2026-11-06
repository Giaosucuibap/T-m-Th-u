import test from 'node:test';
import assert from 'node:assert/strict';
import { inferGatesFromHsmt, extractPdfStrings } from '../GiaoSuCuiBap/lib/hsmt-read.js';
import { contractWindowYears, contractExpiryAlert } from '../GiaoSuCuiBap/lib/checklist-due.js';
import { applyApproval, approvalLabel, approvalSignature } from '../GiaoSuCuiBap/lib/approval.js';
import { marketBidPercentiles } from '../GiaoSuCuiBap/lib/rivals.js';
import { buildChecklistPack, mergeChecklistPack, verifyChecklistPack } from '../GiaoSuCuiBap/lib/sync-pack.js';
import { parentCodeOf, placeOf } from '../GiaoSuCuiBap/lib/heatmap.js';
import { buildOutlineDocx } from '../GiaoSuCuiBap/lib/docx-lite.js';
import { methodOutline } from '../GiaoSuCuiBap/lib/method-outline.js';
import { filterAuditLog, guaranteeReminder } from '../GiaoSuCuiBap/lib/audit-filter.js';
import { coordsForCode } from '../GiaoSuCuiBap/lib/province-codes.js';

test('HSMT chỉ nhận diện từ khóa; không tự xác nhận năng lực', () => {
  const g = inferGatesFromHsmt('Yêu cầu hợp đồng tương tự và nhân sự chủ chốt, thiết bị thi công, năng lực tài chính.');
  assert.equal(g.similar, 'chua');
  assert.equal(g.staff, 'chua');
  assert.equal(g.hits.similar, true);
  assert.equal(g.hits.staff, true);
  assert.equal(g.needsConfirm, true);
  const pdf = extractPdfStrings('%PDF (Hop dong tuong tu) Tj BT /F1 12 Tf ET');
  assert.equal(pdf, '');
});

test('không suy ra mốc hợp đồng từ lĩnh vực', () => {
  assert.equal(contractWindowYears('thuy-loi'), null);
  assert.equal(contractWindowYears('tv'), null);
  assert.equal(contractExpiryAlert({ year: 2023, workType: 'tv', windowYears: 3 }).years, 3);
});

test('duyệt 3 bước không trùng người', () => {
  let t = applyApproval({}, 'An', 'GO', 3).tender;
  t = applyApproval(t, 'Bình', 'GO', 3).tender;
  assert.equal(t.decisionTechBy, 'Bình');
  const deny = applyApproval(t, 'Bình', 'GO', 3);
  assert.equal(deny.ok, false);
  const done = applyApproval(t, 'Chi', 'GO', 3);
  assert.equal(done.tender.decisionConfirmedBy, 'Chi');
  assert.ok(approvalLabel(done.tender).includes('3 bước'));
  assert.ok(approvalSignature('Chi').startsWith('GSCB-'));
});

test('P25 P75 cùng CĐT', () => {
  const tenders = [{ key: 'IB1::00', notifyNo: 'IB1', investorName: 'Ban QLDA', location: 'Lâm Đồng', price: 10e9 }];
  const parts = [7, 9, 10, 15].map((n) => ({ notifyNo: 'IB1', version: '00', bidPrice: n * 1e9, contractorName: 'A', taxCode: '1' }));
  const pct = marketBidPercentiles(parts, tenders, { investor: 'Ban QLDA' });
  assert.ok(pct.p25 <= pct.p75);
});

test('gói JSON HMAC chống sửa', () => {
  const pack = buildChecklistPack({ settings: {}, checklists: {}, tenders: [] }, 'secret');
  assert.ok(pack.signature.startsWith('sha256='));
  assert.equal(verifyChecklistPack(pack, 'secret').ok, true);
  assert.equal(verifyChecklistPack({ ...pack, signature: 'sha256=00' }, 'secret').ok, false);
  assert.equal(mergeChecklistPack({}, pack, 'A', 'wrong').ok, false);
});

test('bản đồ theo parentCode xã trong cache e-GP', () => {
  const areas = { provinces: [{ code: '68', name: 'Lâm Đồng' }], wardsByProvince: { '68': [{ code: '68012', name: 'Xã A', parentCode: '68' }] } };
  assert.equal(parentCodeOf({ wardCode: '68012' }, areas), '68');
  const p = placeOf({ wardCode: '68012', location: '' }, areas);
  assert.ok(p.lat > 11);
  assert.ok(coordsForCode('703').name.includes('Lâm Đồng'));
});

test('DOCX khung BPTC là tệp ZIP OOXML', () => {
  const bytes = buildOutlineDocx(methodOutline({ bidName: 'Kênh mương thủy lợi' }));
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.ok(bytes.length > 200);
});

test('lọc audit và nhắc bảo đảm dự thầu', () => {
  const rows = filterAuditLog([
    { at: '2026-09-01T00:00:00Z', operator: 'An', kind: 'checklist', key: 'IB1', detail: 'x' },
    { at: '2026-09-08T00:00:00Z', operator: 'Bình', kind: 'decision', key: 'IB2', detail: 'y' }
  ], { operator: 'An' });
  assert.equal(rows.length, 1);
  const g = guaranteeReminder({ publicDate: new Date().toISOString(), closeDate: new Date(Date.now() + 2 * 86400000).toISOString() });
  assert.ok(g.length >= 1);
});
