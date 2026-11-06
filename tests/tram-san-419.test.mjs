/* ============================================================================
 *  TRẠM SĂN — 4.19.0
 *
 *  Lỗi thật được sửa: trang Bộ săn ghi "máy tắt thì chạy bù khi mở lại", nhưng
 *  ensureHuntAlarms() (chạy mỗi lần Chrome khởi động) xoá báo thức và đặt lại
 *  vào LẦN TỚI — lượt 06:05 lỡ khi máy tắt mất hẳn, không ai biết.
 *
 *  Bài này khoá: tính đúng lượt lỡ giờ (giờ trên máy, chạy ở 4 múi giờ), không
 *  chạy bù cho giờ chưa từng hẹn, không chạy trùng khi lượt đúng giờ đã chạy,
 *  nhắn Telegram đúng một lần, quyền chạy nền là TUỲ CHỌN, và kịch bản Windows
 *  đăng ký đúng tác vụ (chỉ chạy trên Windows).
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { latestSlotAtOrBefore, missedHuntSlots, catchupSchedule, noteAlive, notePending, takePending, takeUnnotified,
  stationSummary, wakeTimes, catchupNotice, safeStation, slotLabel, OFFLINE_GAP_MS, CATCHUP_DELAY_MS, CATCHUP_GAP_MS, STATION_KEY } from '../GiaoSuCuiBap/lib/station.js';
import { createHuntRuntime } from '../GiaoSuCuiBap/lib/runtime-hunt.js';
import { validateHunt, safeHunts } from '../GiaoSuCuiBap/lib/hunts.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
// Giờ TRÊN MÁY (như báo thức Chrome): dựng bằng hàm tạo giờ địa phương để đúng ở mọi múi giờ.
const at = (d, h, m, s = 0) => new Date(2026, 10, d, h, m, s).getTime();
const iso = (ms) => new Date(ms).toISOString();
const hunt = (id, o = {}) => ({ id, name: `Bộ ${id}`, enabled: true, times: ['06:05'], telegram: true, criteria: { province: 'Lâm Đồng', keyword: 'kênh' }, ...o });

test('giờ hẹn gần nhất ≤ bây giờ, theo giờ trên máy', () => {
  const now = at(6, 9, 0);
  assert.equal(latestSlotAtOrBefore('06:05', now), at(6, 6, 5));
  assert.equal(latestSlotAtOrBefore('10:00', now), at(5, 10, 0), 'giờ chưa tới hôm nay → hôm qua');
  assert.equal(latestSlotAtOrBefore('09:00', now), at(6, 9, 0), 'đúng phút này vẫn tính là đã tới');
  assert.equal(latestSlotAtOrBefore('24:00', now), null);
  assert.equal(latestSlotAtOrBefore('', now), null);
});

test('lượt lỡ giờ: chỉ bộ săn đang bật, đã có mốc hiệu lực, và mốc đó trước giờ hẹn', () => {
  const now = at(6, 9, 0);
  const hunts = [
    hunt('A', { times: ['06:05', '16:00'], lastRunAt: iso(at(5, 16, 0, 30)) }),   // máy tắt đêm qua → lỡ 06:05
    hunt('B', { lastRunAt: iso(at(6, 6, 5, 10)) }),                                // đã chạy đúng giờ
    hunt('C', { enabled: false, lastRunAt: iso(at(1, 6, 5)) }),                    // đang tắt
    hunt('D'),                                                                      // chưa từng chạy, không rõ ngày tạo
    hunt('E', { createdAt: iso(at(6, 8, 0)) }),                                    // tạo sau giờ hẹn hôm nay
    hunt('F', { activeSince: iso(at(5, 7, 0)) })                                   // bật lại hôm qua, chưa chạy lần nào
  ];
  const missed = missedHuntSlots(hunts, now);
  assert.deepEqual(missed.map((m) => [m.huntId, m.time, m.slot]), [['A', '06:05', at(6, 6, 5)], ['F', '06:05', at(6, 6, 5)]]);
  // Chạy bù cách nhau, chờ Chrome khởi động xong.
  assert.deepEqual(catchupSchedule(missed, now).map((m) => m.when), [now + CATCHUP_DELAY_MS, now + CATCHUP_DELAY_MS + CATCHUP_GAP_MS]);
});

test('SAVE_HUNT giữ mốc hiệu lực qua chuẩn hoá; bộ săn hỏng không làm hỏng sổ trạm', () => {
  const v = validateHunt({ name: 'Thủy lợi', criteria: { province: 'Lâm Đồng' }, createdAt: '2026-11-01T00:00:00Z', activeSince: 'rác',
    lastCatchup: { slot: '2026-11-06T06:05:00Z', time: '06:05', at: '2026-11-06T07:44:00Z' } });
  assert.equal(v.ok, true);
  assert.equal(v.hunt.createdAt, '2026-11-01T00:00:00.000Z');
  assert.equal(v.hunt.activeSince, '');
  assert.equal(safeHunts([v.hunt])[0].lastCatchup.time, '06:05');
  assert.deepEqual(safeStation({ pending: { '../x': { slot: 1 } }, log: [null, 7], offline: [{ from: 'x' }] }).pending, {});
});

test('nhịp tim: im lặng quá ngưỡng là một khoảng máy/Chrome không chạy', () => {
  let { station, gap } = noteAlive(null, at(5, 22, 0));
  assert.equal(gap, null, 'lần đầu chưa có gì để so');
  ({ station, gap } = noteAlive(station, at(5, 22, 30)));
  assert.equal(gap, null, '30 phút một nhịp là bình thường');
  ({ station, gap } = noteAlive(station, at(6, 7, 42), { startup: true }));
  assert.deepEqual(gap, { from: iso(at(5, 22, 30)), to: iso(at(6, 7, 42)), startup: true });
  assert.ok(at(6, 7, 42) - at(5, 22, 30) > OFFLINE_GAP_MS);
  const sum = stationSummary(station, at(6, 8, 0));
  assert.equal(sum.offlineCount, 1);
  assert.equal(sum.offlineMs, at(6, 7, 42) - at(5, 22, 30));
  assert.equal(sum.lastStartupAt, iso(at(6, 7, 42)));
});

test('sổ chờ: ghi "lỡ giờ" một lần; chạy bù hoặc bỏ nếu lượt đúng giờ đã chạy; nhắn Telegram một lần', () => {
  const now = at(6, 7, 42);
  const missed = [{ huntId: 'A', name: 'Thủy lợi LĐ', time: '06:05', slot: at(6, 6, 5) }];
  let { station, fresh } = notePending(null, missed, now);
  assert.equal(fresh.length, 1);
  ({ station, fresh } = notePending(station, missed, now + 60_000));
  assert.equal(fresh.length, 0, 'lưu cấu hình lần nữa không ghi lặp');
  assert.equal(station.log.filter((e) => e.kind === 'missed').length, 1);
  let items;
  ({ station, items } = takeUnnotified(station, now, () => true));
  assert.deepEqual(items.map((i) => i.huntId), ['A']);
  ({ items } = takeUnnotified(station, now, () => true));
  assert.deepEqual(items, [], 'đã nhắn rồi thì thôi');
  // Lượt đúng giờ đã chạy trong lúc chờ → bỏ, không chạy trùng.
  const ran = takePending(station, { id: 'A', name: 'Thủy lợi LĐ', lastRunAt: iso(at(6, 6, 6)) }, now);
  assert.equal(ran.skip, true);
  const late = takePending(station, { id: 'A', name: 'Thủy lợi LĐ', lastRunAt: iso(at(5, 16, 0)) }, now);
  assert.equal(late.skip, false);
  assert.equal(late.catchup.time, '06:05');
  assert.equal(late.station.pending.A, undefined);
  assert.equal(stationSummary(late.station, now).caughtUp, 1);
});

test('giờ đánh thức máy: sớm 3 phút, qua nửa đêm, không trùng, chỉ bộ săn đang bật', () => {
  const hunts = [hunt('A', { times: ['06:05', '00:01'] }), hunt('B', { times: ['06:05'] }), hunt('C', { enabled: false, times: ['12:00'] })];
  assert.deepEqual(wakeTimes(hunts, 3), ['06:02', '23:58']);
  assert.deepEqual(wakeTimes(hunts, 0), ['00:01', '06:05']);
});

test('tin Telegram nói rõ máy tắt từ khi nào và bộ săn nào được chạy bù', () => {
  const text = catchupNotice({ from: iso(at(5, 22, 30)), to: iso(at(6, 7, 42)) }, [{ huntId: 'A', name: 'Thủy lợi LĐ', time: '06:05', slot: at(6, 6, 5) }]);
  assert.match(text, /Thủy lợi LĐ — giờ 06:05/);
  assert.match(text, new RegExp(`từ ${slotLabel(at(5, 22, 30))} đến ${slotLabel(at(6, 7, 42))} \\(9 giờ 12 phút\\)`));
  assert.equal(catchupNotice(null, []), null);
});

function fakeChrome(initialStation) {
  const alarms = new Map();
  const store = { [STATION_KEY]: initialStation || null };
  return {
    alarms, store,
    chrome: {
      alarms: { getAll: async () => [...alarms.keys()].map((name) => ({ name })), clear: async (name) => alarms.delete(name), create: async (name, info) => { alarms.set(name, info); } },
      storage: { local: { get: async (d) => ({ ...d, ...store }), set: async (o) => { Object.assign(store, o); } } }
    }
  };
}

test('chạy thật trong runtime: Chrome mở lại sau đêm tắt máy → xếp chạy bù, nhắn một lần, chạy bù ghi rõ', async () => {
  let now = at(6, 7, 42);
  const f = fakeChrome(noteAlive(null, at(5, 22, 30)).station);
  let state = { settings: { telegramEnabled: true }, hunts: [hunt('A', { name: 'Thủy lợi LĐ', lastRunAt: iso(at(5, 16, 0)) })], activeRun: null };
  const sent = [], started = [];
  const rt = createHuntRuntime({ getState: async () => state, save: async (v) => { state = { ...state, ...v }; }, escapeHtml: String,
    sendTelegram: async (_s, text, o) => { sent.push({ text, o }); return { ok: true }; }, nextDailyTime: () => at(7, 6, 5),
    startPlanLookup: async () => ({ ok: true }), startTbmtSearch: async (p) => { started.push(p); return { ok: true }; },
    KEYS: { hunts: 'hunts' }, HUNT_RETRY_PREFIX: 'gscb-hunt-wait:', withLock: async (fn) => fn(), chrome: f.chrome, now: () => now });

  const hb = await rt.heartbeat({ startup: true });
  assert.ok(hb.gap, 'phải ghi khoảng tắt máy');
  assert.equal(f.alarms.get('gscb-hunt-wait:A')?.when, now + CATCHUP_DELAY_MS, 'đã xếp chạy bù');
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /Thủy lợi LĐ — giờ 06:05/);
  assert.equal(sent[0].o.kind, 'station');

  await rt.heartbeat({ startup: true });
  assert.equal(sent.length, 1, 'khởi động lại lần nữa không nhắn trùng');

  // Lưu cấu hình (ensureHuntAlarms) trong lúc chờ: báo thức đúng giờ đặt lại, chạy bù vẫn còn.
  await rt.ensureHuntAlarms(state.hunts);
  assert.ok(f.alarms.has('gscb-hunt:A:06:05'));
  assert.ok(f.alarms.has('gscb-hunt-wait:A'));

  now = at(6, 7, 44);
  const r = await rt.runHuntById('A');
  assert.equal(r.ok, true);
  assert.equal(started.length, 1);
  assert.match(state.hunts[0].lastMessage, /^Chạy bù lượt 06:05 06\/11/);
  assert.equal(f.alarms.has('gscb-hunt-wait:A'), false);
  const sum = await rt.stationStatus();
  assert.equal(sum.missed, 1);
  assert.equal(sum.caughtUp, 1);
  assert.deepEqual(sum.pending, []);

  // Đã chạy rồi: đặt lịch lại không xếp chạy bù nữa.
  state.hunts = safeHunts(state.hunts);
  await rt.ensureHuntAlarms(state.hunts);
  assert.equal(f.alarms.has('gscb-hunt-wait:A'), false);

  // Kết quả lượt chạy bù vẫn ghi "Chạy bù" trước thông điệp của lượt.
  await rt.recordHuntOutcome({ id: 'job-1', huntId: 'A', status: 'SUCCESS', message: '3 gói mới.' });
  assert.match(state.hunts[0].lastMessage, /^Chạy bù lượt 06:05 06\/11 · 3 gói mới\.$/);
});

test('không bật Telegram hoặc đang khoá tự động hoá: không nhắn, không chạy bù', async () => {
  const now = at(6, 7, 42);
  const f = fakeChrome(noteAlive(null, at(5, 22, 30)).station);
  let state = { settings: { telegramEnabled: false }, hunts: [hunt('A', { lastRunAt: iso(at(5, 16, 0)) })] };
  const sent = [];
  const make = () => createHuntRuntime({ getState: async () => state, save: async (v) => { state = { ...state, ...v }; }, escapeHtml: String,
    sendTelegram: async (...a) => { sent.push(a); return { ok: true }; }, nextDailyTime: () => 0, startPlanLookup: async () => ({ ok: true }), startTbmtSearch: async () => ({ ok: true }),
    KEYS: { hunts: 'hunts' }, HUNT_RETRY_PREFIX: 'w:', withLock: async (fn) => fn(), chrome: f.chrome, now: () => now });
  await make().heartbeat({ startup: true });
  assert.equal(sent.length, 0);
  assert.ok(f.alarms.has('w:A'), 'không Telegram vẫn chạy bù');
  const g = fakeChrome(noteAlive(null, at(5, 22, 30)).station);
  state = { settings: { telegramEnabled: true, readOnlyMode: true }, hunts: [hunt('A', { lastRunAt: iso(at(5, 16, 0)) })] };
  const rt = createHuntRuntime({ getState: async () => state, save: async () => {}, escapeHtml: String, sendTelegram: async (...a) => { sent.push(a); },
    nextDailyTime: () => 0, startPlanLookup: async () => ({}), startTbmtSearch: async () => ({}), KEYS: { hunts: 'hunts' }, HUNT_RETRY_PREFIX: 'w:', withLock: async (fn) => fn(), chrome: g.chrome, now: () => now });
  await rt.heartbeat({ startup: true });
  assert.equal(sent.length, 0);
  assert.equal(g.alarms.size, 0);
});

test('nền: nhịp tim khi Chrome khởi động và mỗi 30 phút; trạng thái trạm không mở cho content script', () => {
  const bg = read('GiaoSuCuiBap/background.js');
  const startup = bg.slice(bg.indexOf('chrome.runtime.onStartup.addListener'), bg.indexOf('chrome.alarms.onAlarm.addListener'));
  assert.match(startup, /huntRuntime\.heartbeat\(\{startup:true\}\)/);
  assert.match(bg, /alarm\.name===DEADLINE_ALARM\)\{await huntRuntime\.heartbeat\(\)/);
  assert.match(bg, /case 'STATION_STATUS'/);
  const set = bg.slice(bg.indexOf('const CONTENT_MESSAGE_TYPES=new Set(['), bg.indexOf(']);', bg.indexOf('const CONTENT_MESSAGE_TYPES')));
  assert.doesNotMatch(set, /STATION_STATUS/);
  // Mốc hiệu lực: tạo mới, bật lại hoặc đổi giờ.
  assert.match(bg, /if\(!old\)hunt\.createdAt=nowIso;/);
  assert.match(bg, /if\(!old\|\|\(!old\.enabled&&hunt\.enabled\)\|\|\(old\.times\|\|\[\]\)\.join\(','\)!==\(hunt\.times\|\|\[\]\)\.join\(','\)\)hunt\.activeSince=nowIso;/);
});

test('quyền chạy nền là TUỲ CHỌN — người dùng tự bật ở trang Bộ săn; trang không còn hứa sai', () => {
  const m = JSON.parse(read('GiaoSuCuiBap/manifest.json'));
  assert.deepEqual(m.optional_permissions, ['background']);
  assert.ok(!m.permissions.includes('background'), 'không ép Chrome chạy nền cho mọi người');
  const html = read('GiaoSuCuiBap/hunts.html');
  assert.match(html, /id="bg-toggle"/);
  assert.match(html, /BAT-TRAM-SAN\.bat/);
  assert.match(html, /máy <b>tắt hẳn<\/b> \(Shut down\) thì không phần mềm nào trên máy chạy được/);
  assert.doesNotMatch(html, /Chrome phải đang mở/);
  const js = read('GiaoSuCuiBap/hunts.js');
  assert.match(js, /chrome\.permissions\.request\(\{ permissions: \['background'\] \}\)/);
});

test('kịch bản Windows: chỉ chữ ASCII, có đánh thức máy, mở Chrome chạy nền qua cmd /c start; tệp .bat xuống dòng CRLF', () => {
  const raw = fs.readFileSync(path.join(root, 'native-agent/tram-san.ps1'));
  assert.equal([...raw].filter((b) => b > 127).length, 0, 'PowerShell 5.1 đọc tệp không BOM theo bảng mã máy — chữ có dấu sẽ hỏng');
  const ps = raw.toString('utf8');
  assert.match(ps, /<WakeToRun>true<\/WakeToRun>/);
  assert.match(ps, /<LogonTrigger>/);
  assert.match(ps, /--no-startup-window/);
  assert.match(ps, /'\/c start "" "' \+ \$Chrome/);
  assert.match(ps, /<RunLevel>LeastPrivilege<\/RunLevel>/);
  for (const bat of ['BAT-TRAM-SAN.bat', 'GO-TRAM-SAN.bat']) {
    const b = fs.readFileSync(path.join(root, 'native-agent', bat), 'latin1');
    assert.equal(b.split('\n').length - 1, b.split('\r\n').length - 1, `${bat} phải xuống dòng CRLF`);
    assert.match(b, /tram-san\.ps1/);
  }
});

const WIN = process.platform === 'win32';
test('Windows: đăng ký tác vụ đúng giờ đánh thức, gỡ sạch; giờ sai bị từ chối', WIN ? {} : { skip: 'cần Windows Task Scheduler' }, () => {
  const name = `GSCB KiemThu ${process.pid}`;
  const ps = (args) => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args], { encoding: 'utf8', windowsHide: true });
  const script = path.join(root, 'native-agent', 'tram-san.ps1');
  const fakeChrome = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'notepad.exe');
  try {
    const bad = ps(['-File', script, '-Gio', '25:00', '-ChromePath', fakeChrome, '-TenTacVu', name]);
    assert.notEqual(bad.status, 0, 'giờ 25:00 phải bị từ chối');
    const ok = ps(['-File', script, '-Gio', '06:05,13:05', '-ChromePath', fakeChrome, '-TenTacVu', name]);
    assert.equal(ok.status, 0, ok.stderr + ok.stdout);
    assert.match(ok.stdout, /DA CAI TRAM SAN/);
    const xml = ps(['-Command', `Export-ScheduledTask -TaskName '${name}'`]);
    assert.equal(xml.status, 0, xml.stderr);
    assert.match(xml.stdout, /<WakeToRun>true<\/WakeToRun>/);
    assert.match(xml.stdout, /<LogonTrigger>/);
    assert.match(xml.stdout, /T06:02:00<\/StartBoundary>/);
    assert.match(xml.stdout, /T13:02:00<\/StartBoundary>/);
    assert.match(xml.stdout, /notepad\.exe/i);
    assert.match(xml.stdout, /--no-startup-window/);
    assert.match(xml.stdout, /<LogonType>InteractiveToken<\/LogonType>/);
    // Khớp với giờ trang Bộ săn hiển thị.
    assert.deepEqual(wakeTimes([hunt('x', { times: ['06:05', '13:05'] })], 3), ['06:02', '13:02']);
    const status = ps(['-File', script, '-KiemTra', '-TenTacVu', name]);
    assert.match(status.stdout, /06:02, 13:02/);
  } finally {
    const go = ps(['-File', script, '-Go', '-TenTacVu', name]);
    assert.equal(go.status, 0, go.stderr);
  }
  const gone = ps(['-Command', `if (Get-ScheduledTask -TaskName '${name}' -ErrorAction SilentlyContinue) { exit 3 } else { exit 0 }`]);
  assert.equal(gone.status, 0, 'tác vụ phải được gỡ');
  void os;
});
