/* ============================================================================
 *  SỨC KHOẺ e-GP VÀ BỘ SĂN — 4.19.0
 *
 *  Phụ thuộc giao diện e-GP không xoá được (không có API chính thức). Điều làm
 *  được là KHÔNG ĐỂ HỎNG ÂM THẦM:
 *    - bộ săn lỗi → nhắn Telegram ngay lần đầu, hồi phục → nhắn; không nhắn lặp;
 *    - các trang tra cứu hiện dải cảnh báo khi tiện ích đã tự dừng vì e-GP đổi
 *      cấu trúc, hoặc khi bộ săn đang lỗi.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHuntRuntime } from '../GiaoSuCuiBap/lib/runtime-hunt.js';
import { safeHunts } from '../GiaoSuCuiBap/lib/hunts.js';

const read = (f) => fs.readFileSync(new URL(`../GiaoSuCuiBap/${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function harness(hunt) {
  let state = { settings: { telegramEnabled: true }, hunts: safeHunts([hunt]) };
  const sent = [];
  const rt = createHuntRuntime({ getState: async () => state, save: async (v) => { state = { ...state, ...v, hunts: safeHunts(v.hunts || state.hunts) }; }, escapeHtml: (v) => String(v),
    sendTelegram: async (_s, text, o) => { sent.push({ text, o }); return { ok: true }; }, nextDailyTime: () => 0, startPlanLookup: async () => ({ ok: true }), startTbmtSearch: async () => ({ ok: true }),
    KEYS: { hunts: 'hunts' }, HUNT_RETRY_PREFIX: 'w:', withLock: async (fn) => fn(), chrome: { alarms: { getAll: async () => [], clear: async () => {}, create: async () => {} } } });
  return { rt, sent, get: () => state.hunts[0] };
}
const base = { id: 'h1', name: 'Thủy lợi Lâm Đồng', enabled: true, telegram: true, times: ['06:05'], criteria: { province: 'Lâm Đồng', keyword: 'kênh' } };

test('bộ săn lỗi: nhắn MỘT lần khi bắt đầu lỗi, nhắn khi hồi phục, không nhắn lặp mỗi lượt', async () => {
  const h = harness(base);
  await h.rt.recordHuntOutcome({ id: 'j1', huntId: 'h1', status: 'ERROR', message: 'Không tìm thấy điều khiển phân trang.' });
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].text, /Bộ săn lỗi: Thủy lợi Lâm Đồng/);
  assert.match(h.sent[0].text, /Không tìm thấy điều khiển phân trang/);
  assert.equal(h.sent[0].o.kind, 'hunt-health');
  assert.ok(h.get().failAlertedAt);
  await h.rt.recordHuntOutcome({ id: 'j2', huntId: 'h1', status: 'TIMEOUT', message: 'quá giờ' });
  assert.equal(h.sent.length, 1, 'lỗi tiếp không nhắn lại');
  await h.rt.recordHuntOutcome({ id: 'j3', huntId: 'h1', status: 'CANCELLED', message: 'người dùng dừng' });
  assert.equal(h.sent.length, 1, 'tự dừng không phải lỗi hay hồi phục');
  await h.rt.recordHuntOutcome({ id: 'j4', huntId: 'h1', status: 'SUCCESS', message: '3 gói mới.' });
  assert.equal(h.sent.length, 2);
  assert.match(h.sent[1].text, /chạy lại bình thường: Thủy lợi Lâm Đồng/);
  assert.equal(h.get().failAlertedAt, '');
  await h.rt.recordHuntOutcome({ id: 'j4', huntId: 'h1', status: 'SUCCESS', message: '3 gói mới.' });
  assert.equal(h.sent.length, 2, 'cùng một lượt báo về hai lần không nhắn trùng');
});

test('bộ săn không bật Telegram: vẫn ghi trạng thái lỗi để trang hiện cảnh báo, nhưng không nhắn', async () => {
  const h = harness({ ...base, telegram: false });
  await h.rt.recordHuntOutcome({ id: 'j1', huntId: 'h1', status: 'ERROR', message: 'x' });
  assert.equal(h.sent.length, 0);
  assert.equal(h.get().lastStatus, 'ERROR');
});

test('dải cảnh báo: đỏ khi tiện ích đã tự dừng vì e-GP đổi cấu trúc; vàng khi bộ săn lỗi; im khi khoẻ', async () => {
  const src = read('shell.js');
  const fn = src.slice(src.indexOf('export function healthBannerHtml'), src.indexOf('\nif (!IS_POPUP && HEALTH_PAGES.has(file))'));
  const healthBannerHtml = new Function(`${fn.replace('export function', 'function')}; return healthBannerHtml;`)();
  const esc = (v) => String(v).replace(/</g, '&lt;');
  assert.match(healthBannerHtml({ ok: true, red: true, canaryReason: 'Mất trường bidPrice', failingHunts: [] }, esc), /e-GP vừa đổi cấu trúc dữ liệu.*Mất trường bidPrice.*diagnostics\.html/);
  assert.match(healthBannerHtml({ ok: true, red: false, failingHunts: [{ name: '<b>x</b>' }] }, esc), /Bộ săn đang lỗi:<\/b> &lt;b>x&lt;\/b>/);
  assert.equal(healthBannerHtml({ ok: true, red: false, failingHunts: [] }, esc), '');
  assert.equal(healthBannerHtml(null, esc), '');
  assert.match(src, /HEALTH_PAGES = new Set\(\['search\.html', 'plans\.html', 'bidopen\.html', 'winners\.html'/);
});

test('nền: EGP_HEALTH chỉ đọc, không mở cho content script', () => {
  const bg = read('background.js');
  const h = read('lib/handlers/automation.js');
  const a = h.indexOf('EGP_HEALTH: async () =>');
  assert.ok(a > 0);
  const block = h.slice(a, h.indexOf('\n    },', a));
  assert.doesNotMatch(block, /save\(|chrome\.tabs|fetch\(|sendTelegram/);
  const set = bg.slice(bg.indexOf('const CONTENT_MESSAGE_TYPES=new Set(['), bg.indexOf(']);', bg.indexOf('const CONTENT_MESSAGE_TYPES')));
  assert.doesNotMatch(set, /EGP_HEALTH/);
});
