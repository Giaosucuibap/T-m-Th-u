/* ============================================================================
 *  4.22.0 — TRANG "LINK ĐIỆN THOẠI": lỗi ghép địa chỉ cố định không bị nhịp làm mới ghi đè
 *
 *  Lỗi có từ 4.21.0, CI bắt được ngày 11/11/2026: trang tự làm mới 2 giây một lần và render()
 *  luôn ghi lại dòng trạng thái ghép nối theo trạng thái của tiện ích, nên dòng "Mã ghép nối
 *  không đúng" do nút "Ghép nối" ghi vào chỉ sống tới nhịp làm mới kế tiếp (đo: 1,78 giây; có
 *  lượt mất gần như ngay).
 *
 *  Bài này chạy ĐÚNG tệp phone.js trong một trang giả (DOM tối thiểu, chrome.runtime giả) và
 *  tự bấm nút, tự gõ nhịp làm mới — không cần trình duyệt, nên chạy ở mọi máy CI.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { PHONE_CODE_TEXT } from '../GiaoSuCuiBap/lib/phone-link.js';
import { RELAY_CODE_TEXT } from '../GiaoSuCuiBap/lib/phone-relay.js';

const SOURCE = fs.readFileSync(new URL('../GiaoSuCuiBap/phone.js', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const settle = () => new Promise((resolve) => setImmediate(resolve));

const UNPAIRED = { ok: true, enabled: true, host: { connected: true }, tunnel: { state: 'up' }, link: '', telegram: false, relay: { claimed: false } };
const PAIRED = { ...UNPAIRED, relay: { claimed: true, current: true, url: 'https://thau.vi-du.workers.dev', registeredAt: '2026-11-11T03:00:00.000Z' } };

/** Trang giả: mỗi phần tử ghi lại số lần bị ghi chữ / ghi lớp để soát việc "chỉ ghi khi đổi". */
async function openPage(initial = UNPAIRED) {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) {
      const classes = new Set();
      let text = '', cls = '';
      const el = {
        id, writes: { text: 0, cls: 0 }, listeners: {}, disabled: false, checked: false, value: '', src: '', href: '',
        get textContent() { return text; }, set textContent(v) { text = String(v); el.writes.text++; },
        get className() { return cls; }, set className(v) { cls = String(v); el.writes.cls++; },
        classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains: (name) => classes.has(name) },
        addEventListener(type, fn) { el.listeners[type] = fn; }
      };
      nodes.set(id, el);
    }
    return nodes.get(id);
  };
  const page = { state: initial, sent: [], onPair: null, tick: null, node };
  const chrome = { runtime: { sendMessage: async ({ type, payload }) => {
    page.sent.push({ type, payload });
    if (type === 'PHONE_LINK_STATE') return page.state;
    if (type === 'SET_PHONE_RELAY') return page.onPair(payload);
    throw new Error(`lệnh không mong đợi: ${type}`);
  } } };
  const context = vm.createContext({ document: { getElementById: node }, chrome, console, window: {}, navigator: {}, confirm: () => true,
    setTimeout, setInterval: (fn, ms) => { page.tick = fn; page.tickMs = ms; return 1; }, PHONE_CODE_TEXT });
  vm.runInContext(SOURCE, context);
  await settle();
  page.clickPair = async () => { await node('pl-relay-pair').listeners.click(); await settle(); };
  page.status = () => ({ text: node('pl-relay-status').textContent, cls: node('pl-relay-status').className });
  return page;
}

test('Trang tự làm mới theo nhịp 2 giây; chưa ghép thì ghi rõ là chưa ghép', async () => {
  const page = await openPage();
  assert.equal(typeof page.tick, 'function');
  assert.equal(page.tickMs, 2000);
  assert.match(page.status().text, /^Chưa ghép địa chỉ cố định/);
  assert.equal(page.status().cls, 'notice');
});

test('Gõ sai mã: dòng "Mã ghép nối không đúng" CÒN NGUYÊN sau nhiều nhịp làm mới (trước 4.22.0 mất sau một nhịp)', async () => {
  const page = await openPage();
  page.node('pl-relay-url').value = 'thau.vi-du.workers.dev';
  page.node('pl-relay-code').value = 'AAAA-AAAA';
  page.onPair = async () => ({ ok: false, code: 'BAD_CODE', message: RELAY_CODE_TEXT.BAD_CODE });
  await page.clickPair();
  // (So bằng JSON: đối tượng tạo trong ngữ cảnh vm mang nguyên mẫu Object của ngữ cảnh đó.)
  assert.equal(JSON.stringify(page.sent.at(-1)), JSON.stringify({ type: 'SET_PHONE_RELAY', payload: { url: 'thau.vi-du.workers.dev', code: 'AAAA-AAAA' } }));
  assert.match(page.status().text, /Mã ghép nối không đúng/);
  assert.equal(page.status().cls, 'notice error');
  assert.equal(page.node('pl-relay-pair').disabled, false, 'nút bấm lại được');
  assert.equal(page.node('pl-relay-pair').textContent, 'Ghép nối');
  for (let i = 0; i < 5; i++) { await page.tick(); await settle(); }
  assert.match(page.status().text, /Mã ghép nối không đúng/, 'lỗi còn hiện sau 5 nhịp làm mới');
  assert.equal(page.status().cls, 'notice error');
  // Biểu mẫu ghép nối vẫn mở để gõ lại mã.
  assert.equal(page.node('pl-relay-form').classList.contains('hidden'), false);
});

test('Bấm "Ghép nối" lần nữa thì lỗi cũ được dọn; ghép xong thì hiện "Đã ghép" và ở yên qua các nhịp làm mới', async () => {
  const page = await openPage();
  page.onPair = async () => ({ ok: false, code: 'BAD_CODE', message: RELAY_CODE_TEXT.BAD_CODE });
  await page.clickPair();
  assert.match(page.status().text, /Mã ghép nối không đúng/);

  // Trong lúc lần ghép thứ hai đang chờ, một nhịp làm mới KHÔNG được đưa lỗi cũ quay lại.
  let release;
  page.onPair = () => new Promise((resolve) => { release = resolve; });
  const pending = page.node('pl-relay-pair').listeners.click();
  await settle();
  assert.equal(page.node('pl-relay-pair').disabled, true);
  assert.equal(page.node('pl-relay-pair').textContent, 'Đang ghép…');
  await page.tick(); await settle();
  assert.match(page.status().text, /^Chưa ghép địa chỉ cố định/, 'đang ghép lại: không còn lỗi của lần trước');
  page.state = PAIRED;
  release(PAIRED);
  await pending; await settle();
  assert.match(page.status().text, /^Đã ghép https:\/\/thau\.vi-du\.workers\.dev — điện thoại tự tìm thấy máy tính này/);
  assert.equal(page.status().cls, 'notice ok');
  assert.equal(page.node('pl-relay-form').classList.contains('hidden'), true);
  await page.tick(); await settle();
  assert.match(page.status().text, /^Đã ghép /);
});

test('Đang báo lỗi mà máy đã được ghép từ cửa sổ khác: nhịp làm mới hiện "Đã ghép", lỗi không quay lại khi bỏ ghép', async () => {
  const page = await openPage();
  page.onPair = async () => ({ ok: false, code: 'NETWORK', message: RELAY_CODE_TEXT.NETWORK || 'Không kết nối được.' });
  await page.clickPair();
  assert.equal(page.status().cls, 'notice error');
  page.state = PAIRED;
  await page.tick(); await settle();
  assert.match(page.status().text, /^Đã ghép /);
  page.state = UNPAIRED;
  await page.tick(); await settle();
  assert.match(page.status().text, /^Chưa ghép địa chỉ cố định/, 'lỗi cũ đã được dọn khi ghép xong');
});

test('Tiện ích không trả lời lúc ghép: báo rõ, nút trở lại "Ghép nối" (trước đây nút lặng lẽ trở lại, không báo gì)', async () => {
  const page = await openPage();
  page.onPair = async () => { throw new Error('Extension context invalidated.'); };
  await page.clickPair();
  assert.match(page.status().text, /^Không ghép được: Extension context invalidated\./);
  assert.equal(page.status().cls, 'notice error');
  assert.equal(page.node('pl-relay-pair').disabled, false);
  assert.equal(page.node('pl-relay-pair').textContent, 'Ghép nối');
  await page.tick(); await settle();
  assert.match(page.status().text, /^Không ghép được: /);
});

test('Nhịp làm mới không ghi lại chữ y hệt vào các dòng trạng thái (vùng role="status" không bị đọc lặp)', async () => {
  const page = await openPage();
  const ids = ['pl-status', 'pl-relay-status', 'pl-toggle', 'pl-qr-title', 'pl-tg-status'];
  const before = Object.fromEntries(ids.map((id) => [id, { ...page.node(id).writes }]));
  for (let i = 0; i < 4; i++) { await page.tick(); await settle(); }
  for (const id of ids) assert.deepEqual(page.node(id).writes, before[id], `${id}: không ghi lại khi trạng thái không đổi`);
  // Trạng thái đổi thì vẫn ghi.
  page.state = { ...UNPAIRED, enabled: false };
  await page.tick(); await settle();
  assert.match(page.node('pl-status').textContent, /^Đang tắt\./);
  assert.equal(page.node('pl-toggle').textContent, 'Bật link điện thoại');
});
