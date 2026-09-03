import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeKqlcntRecord } from '../lib/kqlcnt.js';
import { observationsFromPackages, summarizeArea } from '../lib/localmarket.js';
import { contractorsOfInvestor, summarizeInvestor } from '../lib/investor.js';

const TAX_A = '0100000001';
const TAX_B = '0200000002';

test('nhiều winningCode luôn được nhận diện là liên danh', () => {
  const result = normalizeKqlcntRecord({
    notifyNo: 'IB-CONSORTIUM',
    winningCode: [`vn${TAX_A}`, `vn${TAX_B}`],
    winningContractorName: [],
    contractorName: ['Liên danh A-B']
  }, TAX_A);

  assert.equal(result.isVenture, true);
  assert.deepEqual(result.winningTaxCodes, [TAX_A, TAX_B]);
  assert.equal(result.focusRole, 'Trúng thầu (thành viên liên danh)');
});

test('không ghép MST liên danh với tên thành viên theo chỉ số mảng', () => {
  const consortium = {
    key: 'IB-CONSORTIUM::00',
    notifyNo: 'IB-CONSORTIUM',
    investorName: 'Chủ đầu tư',
    winningTaxCodes: [TAX_A, TAX_B],
    // Cố ý đảo thứ tự: e-GP không bảo đảm mảng tên khớp mảng MST.
    memberNames: ['Công ty B', 'Công ty A'],
    winnerName: 'Liên danh A-B',
    isVenture: true,
    winningPrice: 600
  };

  const observations = observationsFromPackages([consortium]);
  assert.deepEqual(
    observations.map(({ taxCode, contractorName }) => ({ taxCode, contractorName })),
    [
      { taxCode: TAX_A, contractorName: '' },
      { taxCode: TAX_B, contractorName: '' }
    ]
  );

  const contractors = contractorsOfInvestor([consortium]);
  assert.deepEqual(
    contractors.map(({ taxCode, name }) => ({ taxCode, name })),
    [
      { taxCode: TAX_A, name: '' },
      { taxCode: TAX_B, name: '' }
    ]
  );

  const area = summarizeArea([consortium]);
  assert.equal(area.totalValue, 600);
  assert.equal(area.investors[0].totalValue, 600);
  assert.equal(area.concentration.value, null);
  assert.equal(area.investors[0].concentration.value, null);
});

test('giá trị gói liên danh chỉ cộng một lần và không làm sai HHI nhà thầu', () => {
  const packages = [
    {
      key: 'IB-SOLO-A::00',
      notifyNo: 'IB-SOLO-A',
      investorName: 'Chủ đầu tư',
      winningTaxCodes: [TAX_A],
      memberNames: ['Công ty A'],
      winnerName: 'Công ty A',
      isVenture: false,
      winningPrice: 100,
      discountRate: 1
    },
    {
      key: 'IB-SOLO-B::00',
      notifyNo: 'IB-SOLO-B',
      investorName: 'Chủ đầu tư',
      winningTaxCodes: [TAX_B],
      memberNames: ['Công ty B'],
      winnerName: 'Công ty B',
      isVenture: false,
      winningPrice: 300,
      discountRate: 1
    },
    {
      key: 'IB-CONSORTIUM::00',
      notifyNo: 'IB-CONSORTIUM',
      investorName: 'Chủ đầu tư',
      winningTaxCodes: [TAX_A, TAX_B],
      memberNames: ['Công ty B', 'Công ty A'],
      winnerName: 'Liên danh A-B',
      isVenture: true,
      winningPrice: 600,
      discountRate: 1
    }
  ];

  const area = summarizeArea(packages);
  assert.equal(area.packageCount, 3);
  assert.equal(area.observationCount, 4);
  assert.equal(area.totalValue, 1_000);
  assert.equal(area.investors[0].packages, 3);
  assert.equal(area.investors[0].totalValue, 1_000);

  const consortiumRows = observationsFromPackages(packages)
    .filter((row) => row.notifyNo === 'IB-CONSORTIUM');
  assert.deepEqual(
    consortiumRows.map(({ taxCode, contractorName }) => ({ taxCode, contractorName })),
    [
      { taxCode: TAX_A, contractorName: 'Công ty A' },
      { taxCode: TAX_B, contractorName: 'Công ty B' }
    ]
  );

  // HHI chỉ dùng giá trị độc lập có thể quy chắc chắn: [100, 300].
  assert.equal(area.concentration.value, 6_250);
  assert.equal(area.investors[0].concentration.value, 6_250);

  const investor = summarizeInvestor(packages);
  assert.equal(investor.soloValue, 400);
  assert.equal(investor.ventureValue, 600);
  assert.equal(investor.concentration.value, 6_250);
});
