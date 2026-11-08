/* Lưu trên máy, nhắc hạn nộp và định dạng hiển thị. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryStorage, compactTender, LIMITS } from '../../src/core/store.js';
import { planReminders, createReminders, IOS_PENDING_LIMIT } from '../../src/core/reminders.js';
import { formatVndShort, formatVndFull, formatDateTimeVn, timeLeft, criteriaSummary } from '../../src/core/format.js';

const NOW = Date.parse('2026-11-08T03:00:00.000Z'); // 10:00 giờ Việt Nam
const tender = (key, closeIso, extra = {}) => ({ key, notifyNo: key.split('::')[0], displayCode: `${key.split('::')[0]}-00`, bidName: `Gói ${key}`, closeDate: closeIso, price: 5e9, rawText: 'x'.repeat(4000), ...extra });

test('compactTender bỏ văn bản thô, giữ trường cần hiển thị', () => {
  const c = compactTender(tender('IB1::00', '2026-12-01T03:00:00.000Z'));
  assert.equal(c.rawText, undefined);
  assert.equal(c.displayCode, 'IB1-00');
  assert.equal(c.price, 5e9);
});

test('saveResult lưu kết quả gọn + lịch sử tối đa 10 dòng, mới nhất trước', async () => {
  const store = createStore(memoryStorage());
  for (let i = 0; i < 12; i++) {
    await store.saveResult({ id: `r${i}`, finishedAt: new Date(NOW + i).toISOString(), status: 'SUCCESS', label: 'L', criteria: { province: 'Lâm Đồng' }, counts: { match: i }, coverage: { text: 't' }, tenders: [tender(`IB${i}::00`, null)] });
  }
  const h = await store.getHistory();
  assert.equal(h.length, LIMITS.history);
  assert.equal(h[0].id, 'r11');
  const last = await store.getLast();
  assert.equal(last.id, 'r11');
  assert.equal(last.tenders[0].rawText, undefined);
});

test('theo dõi / bỏ theo dõi / ghi chú; giữ ngày bắt đầu theo dõi khi cập nhật', async () => {
  const store = createStore(memoryStorage());
  const t = tender('IB7::00', '2026-12-01T03:00:00.000Z');
  const first = await store.watch(t, { reminderIds: ['a'], now: NOW });
  const again = await store.watch({ ...t, price: 6e9 }, { reminderIds: ['b'], now: NOW + 1e6 });
  assert.equal(again.watchedAt, first.watchedAt);
  assert.equal(again.price, 6e9);
  assert.deepEqual(again.reminderIds, ['b']);
  await store.setNote(t.key, 'Đi khảo sát hiện trường');
  assert.equal((await store.getWatch())[t.key].note, 'Đi khảo sát hiện trường');
  assert.ok(await store.unwatch(t.key));
  assert.deepEqual(await store.getWatch(), {});
});

test('bộ lưu hỏng/rỗng không làm app sập', async () => {
  const store = createStore(memoryStorage({ 'gscb.watch': '{hỏng', 'gscb.history': 'null' }));
  assert.deepEqual(await store.getWatch(), {});
  assert.deepEqual(await store.getHistory(), []);
});

test('planReminders: ba mốc 72h/24h/3h như tiện ích, bỏ mốc đã qua', () => {
  const close = new Date(NOW + 5 * 86400000).toISOString();
  const r = planReminders(tender('IB8::00', close), NOW);
  assert.deepEqual(r.map((x) => x.key), ['h72', 'h24', 'h3']);
  assert.deepEqual(r.map((x) => (Date.parse(close) - x.at) / 3600000), [72, 24, 3]);
  assert.match(r[0].title, /Còn khoảng 3 ngày/);
  const soon = planReminders(tender('IB9::00', new Date(NOW + 10 * 3600000).toISOString()), NOW);
  assert.deepEqual(soon.map((x) => x.key), ['h3']);
  assert.deepEqual(planReminders(tender('IB10::00', new Date(NOW - 1000).toISOString()), NOW), []);
  assert.deepEqual(planReminders(tender('IB11::00', null), NOW), []);
});

test('createReminders: tôn trọng giới hạn 64 lời nhắc của iOS, ưu tiên mốc sát hạn', async () => {
  const scheduled = [];
  const api = { schedule: async (x) => { scheduled.push(x.key); return `id-${scheduled.length}`; }, cancel: async () => {}, pendingCount: async () => IOS_PENDING_LIMIT - 2 };
  const r = await createReminders(api).scheduleFor(tender('IB12::00', new Date(Date.now() + 5 * 86400000).toISOString()));
  assert.deepEqual(scheduled, ['h24', 'h3']);
  assert.equal(r.skipped, 'ios-limit');
});

test('định dạng tiền và giờ Việt Nam không phụ thuộc múi giờ máy', () => {
  assert.equal(formatVndShort(12_500_000_000), '12,5 tỷ');
  assert.equal(formatVndShort(850_000_000), '850 triệu');
  assert.equal(formatVndShort(null), 'Chưa rõ giá');
  assert.equal(formatVndFull(12_500_000_000), '12.500.000.000 đ');
  assert.equal(formatDateTimeVn('2026-11-19T16:35:00.000Z'), '23:35 19/11/2026');
  assert.equal(timeLeft(new Date(NOW + 5 * 3600000).toISOString(), NOW).text, 'Còn 5 giờ');
  assert.equal(timeLeft(new Date(NOW + 10 * 86400000).toISOString(), NOW).text, 'Còn 10 ngày');
  assert.equal(timeLeft(new Date(NOW - 1).toISOString(), NOW).state, 'closed');
  assert.equal(criteriaSummary({ province: 'Lâm Đồng', category: 'XL', minPrice: 3e9 }), 'Lâm Đồng · Xây lắp · 3 tỷ – ∞');
});
