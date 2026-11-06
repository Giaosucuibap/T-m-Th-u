import test from 'node:test';
import assert from 'node:assert/strict';
import { coordsForCode, normalizeAreaCode, provinceCodeOf, lookupAreaCode } from '../GiaoSuCuiBap/lib/province-codes.js';
import { placeOf, parentCodeOf, districtHeat } from '../GiaoSuCuiBap/lib/heatmap.js';

test('unknown locations have no invented coordinates', () => {
  for (const tender of [{}, { location: 'Chưa xác định' }, { provinceCode: '999' }, { wardCode: '68012' }]) {
    const place = placeOf(tender);
    assert.equal(place.lat, null);
    assert.equal(place.lng, null);
    assert.equal(place.mapped, false);
  }
});

test('only exact province codes resolve, ward prefixes do not geocode', () => {
  assert.equal(coordsForCode('68012'), null);
  assert.equal(coordsForCode('999'), null);
  assert.equal(provinceCodeOf({ areaCode: '68012' }), '');
  assert.equal(normalizeAreaCode('VN68'), '');
  assert.equal(normalizeAreaCode('1'), '01');
  assert.equal(normalizeAreaCode('01234'), '01234');
});

test('legacy and current province codes use the exact reference point, with no jitter', () => {
  const old = coordsForCode('703'), current = coordsForCode('68');
  assert.equal(old.lat, current.lat);
  assert.equal(old.lng, current.lng);
  assert.equal(old.approximate, true);
  const one = placeOf({ location: 'Huyện Đức Trọng, Lâm Đồng' });
  const two = placeOf({ location: 'Huyện Lạc Dương, Lâm Đồng' });
  assert.equal(one.lat, current.lat);
  assert.equal(two.lat, current.lat);
  assert.equal(one.lng, two.lng);
});

test('ward resolves through actual cached parent relationship, not its digits', () => {
  const areas = { provinces: [{ code: '68', name: 'Tỉnh Lâm Đồng' }], wardsByProvince: { '68': [{ code: '12345', name: 'Xã A', parentCode: '68' }] } };
  assert.equal(parentCodeOf({ wardCode: '12345' }, areas), '68');
  assert.equal(placeOf({ wardCode: '12345' }, areas).code, '68');
  assert.equal(placeOf({ wardCode: '12345' }, areas).lat, coordsForCode('68').lat);
});

test('parent chains terminate and cyclic/unknown codes remain unplotted', () => {
  const areas = [{ code: '12345', parentCode: '777' }, { code: '777', parentCode: '68' }, { code: '68', name: 'Lâm Đồng' }];
  assert.equal(parentCodeOf({ wardCode: '12345' }, areas), '68');
  const cyclic = [{ code: '12345', parentCode: '54321' }, { code: '54321', parentCode: '12345' }];
  assert.equal(placeOf({ wardCode: '12345' }, cyclic).mapped, false);
});

test('name fallback accepts folded complete province names and rejects ambiguous locations', () => {
  assert.equal(lookupAreaCode({ location: 'Xã A - Tỉnh Lâm Đồng' }), '68');
  assert.equal(lookupAreaCode({ location: 'dak lak' }), '66');
  assert.equal(lookupAreaCode({ location: 'Đồng Nai và Lâm Đồng' }), '');
  assert.equal(lookupAreaCode({ location: 'Khánh Hòa Bình' }), '');
  assert.equal(lookupAreaCode({ location: 'Lam Dongx' }), '');
});

test('province aggregation retains unknown count and does not sum missing/negative prices', () => {
  const rows = districtHeat([
    { key: 'A', provinceCode: '68', price: 10 },
    { key: 'B', provinceCode: '703', price: 20 },
    { key: 'C', location: 'Chưa xác định', price: null },
    { key: 'D', provinceCode: '999', price: -50 }
  ]);
  assert.equal(rows.length, 2);
  const known = rows.find((r) => r.mapped), unknown = rows.find((r) => !r.mapped);
  assert.equal(known.count, 2);
  assert.equal(known.value, 30);
  assert.equal(unknown.count, 2);
  assert.equal(unknown.value, 0);
  assert.equal(unknown.knownPrices, 0);
  assert.equal(unknown.lat, null);
});

test('duplicate stored package does not inflate map count; distinct revisions remain separate', () => {
  const rows = districtHeat([
    { key: 'IB1::00', provinceCode: '68', price: 10 },
    { key: 'IB1::00', provinceCode: '68', price: 10 },
    { key: 'IB1::01', provinceCode: '68', price: 20 }
  ]);
  assert.equal(rows[0].count, 2);
  assert.equal(rows[0].value, 30);
});
