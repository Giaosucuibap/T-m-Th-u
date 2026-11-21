/* Kết quả tra cứu phải LẶP LẠI ĐƯỢC: cùng dữ liệu, cùng tiêu chí, cùng thứ tự —
   bất kể dữ liệu về kho theo thứ tự nào. Thiếu chốt hoà thì hai gói bằng điểm
   đứng theo thứ tự tình cờ, và hai lần in ra hai bảng khác nhau. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAndSort } from '../GiaoSuCuiBap/lib/decision.js';

const kho = Array.from({ length: 300 }, (_, i) => ({
  key: `IB26${String(1000 + ((i * 37) % 300)).padStart(6, '0')}::00`, notifyNo: `IB26${i}`,
  score: [50, 50, 70][i % 3], price: [1e9, 1e9, null][i % 3], matched: i % 2 === 0,
  closeDate: ['2026-12-01T09:00:00', '2026-12-01T09:00:00', ''][i % 3]
}));

test('thứ tự KHÔNG phụ thuộc thứ tự dữ liệu về kho, ở cả 4 kiểu sắp', () => {
  for (const sortBy of ['', 'score', 'price', 'deadline']) {
    const xuoi = filterAndSort(kho, { sortBy }).map((t) => t.key);
    const nguoc = filterAndSort([...kho].reverse(), { sortBy }).map((t) => t.key);
    const tron = filterAndSort([...kho].sort((a, b) => (a.notifyNo.length * 7 + a.score) % 5 - (b.notifyNo.length * 7 + b.score) % 5), { sortBy }).map((t) => t.key);
    assert.deepEqual(nguoc, xuoi, `sortBy="${sortBy || '(mặc định)'}" đổi thứ tự khi đảo dữ liệu`);
    assert.deepEqual(tron, xuoi, `sortBy="${sortBy || '(mặc định)'}" đổi thứ tự khi xáo dữ liệu`);
  }
});

test('chốt hoà không làm đổi thứ tự của các gói KHÁC điểm', () => {
  const r = filterAndSort(kho, { sortBy: 'score' });
  for (let i = 1; i < r.length; i++) assert.ok(Number(r[i - 1].score) >= Number(r[i].score), 'điểm cao phải đứng trước');
});
