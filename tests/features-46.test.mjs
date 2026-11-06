import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { normalizeContract, matchContract, bestContractMatch, safeContracts } from '../GiaoSuCuiBap/lib/contracts.js';
import { checklistItemsFor, checklistProgress, CHECKLIST_ITEMS } from '../GiaoSuCuiBap/lib/capability.js';
import { hmacSha256Hex, webhookHeaders } from '../GiaoSuCuiBap/lib/hmac.js';
import { localRivals } from '../GiaoSuCuiBap/lib/rivals.js';
import { districtHeat } from '../GiaoSuCuiBap/lib/heatmap.js';
import { priceReference, summarizePricing } from '../GiaoSuCuiBap/lib/pricing.js';
import { missingSelectors } from '../GiaoSuCuiBap/lib/dom-regression.js';

test('hợp đồng tương tự: đạt / lệch loại / thiếu', () => {
  const hd = normalizeContract({ name: 'Thi công kênh mương xã B', workType: 'thuy-loi', price: 8000000000, year: 2024 });
  assert.equal(matchContract({ bidName: 'Nạo vét kênh mương thủy lợi', price: 6000000000 }, hd).status, 'dat');
  assert.equal(matchContract({ bidName: 'Xây đường giao thông nông thôn', price: 6000000000 }, hd).status, 'lech-loai');
  assert.equal(bestContractMatch({ bidName: 'Gói số 05' }, []).status, 'chua');
  assert.equal(safeContracts([hd, { name: 'ab' }]).length, 1);
});

test('checklist xây lắp và giám sát thêm mục riêng, mặc định vẫn 8', () => {
  assert.equal(CHECKLIST_ITEMS.length, 8);
  assert.equal(checklistItemsFor('').length, 8);
  assert.ok(checklistItemsFor('XL').some((x) => x.id === 'bienphap'));
  assert.ok(checklistItemsFor('TV_SUPERVISION').some((x) => x.id === 'chungchi'));
  assert.equal(checklistProgress({ items: { hsmt: true } }, 'XL').total, checklistItemsFor('XL').length);
});

test('HMAC-SHA256 khớp Node crypto', () => {
  const hex = hmacSha256Hex('secret', '{"a":1}');
  const expect = crypto.createHmac('sha256', 'secret').update('{"a":1}').digest('hex');
  assert.equal(hex, expect);
  assert.ok(webhookHeaders('secret', '{}')['x-gscb-signature'].startsWith('sha256='));
});

test('đối thủ có giá bỏ trung vị khi BBMT có giá', () => {
  const tenders = [{ key: 'IB1::00', notifyNo: 'IB1', location: 'Lâm Đồng' }, { key: 'IB2::00', notifyNo: 'IB2', location: 'Lâm Đồng' }];
  const parts = [
    { notifyNo: 'IB1', version: '00', contractorName: 'A', taxCode: '1', bidPrice: 9e9, won: false },
    { notifyNo: 'IB2', version: '00', contractorName: 'A', taxCode: '1', bidPrice: 11e9, won: true }
  ];
  const rows = localRivals(parts, tenders, { province: 'Lâm Đồng' });
  assert.equal(rows[0].medianBid, 9e9);
  assert.equal(rows[0].priceSamples, 2);
});

test('bản đồ nhiệt có tọa độ tỉnh để Leaflet chấm', () => {
  const heat = districtHeat([{ location: 'Huyện Đức Trọng, Lâm Đồng', bidName: 'Kênh', price: 1e9 }]);
  assert.ok(heat[0].lat > 10 && heat[0].lng > 100);
  assert.equal(heat[0].tenders.length, 1);
});

test('giá tham chiếu tách loại việc + tỉnh', () => {
  const packs = [
    { field: 'XL', bidName: 'Kênh mương thủy lợi', priceBasis: 10e9, winningPrice: 9e9, discountRate: 10, provinceName: 'Lâm Đồng' },
    { field: 'XL', bidName: 'Đường giao thông nông thôn', priceBasis: 10e9, winningPrice: 8e9, discountRate: 20, provinceName: 'Lâm Đồng' }
  ];
  assert.equal(priceReference(packs, { workType: 'thuy-loi', price: 10e9 }).n, 1);
  const sum = summarizePricing(packs);
  assert.ok(sum.byWorkProvince.length >= 2);
});

test('so khớp DOM với fixture BBMT 4.5', () => {
  const html = fs.readFileSync(new URL('./fixtures/egp-bbmt-pagination-45.html', import.meta.url), 'utf8');
  const r = missingSelectors(html);
  assert.equal(r.ok, true);
  assert.equal(missingSelectors('<html></html>').ok, false);
});
