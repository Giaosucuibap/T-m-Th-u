/* Bộ điều phối tra cứu: kiểm tiêu chí, dựng truy vấn, giao thức với trang e-GP
 * (mô phỏng đúng cách content.js trả lời), đối soát và các đường hỏng. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSearch, resolveProvinces, evaluateRecord, sortTenders, createTbmtSearch } from '../../src/core/search.js';
import { createPageChannel } from '../../src/core/page-channel.js';

const record = (i, extra = {}) => ({
  notifyId: String(500000 + i), notifyNo: `IB${2600455000 + i}`, notifyVersion: '00',
  bidName: i % 5 === 4 ? `Mua sắm thiết bị văn phòng ${i}` : `Thi công kênh mương thủy lợi số ${i}`,
  investorName: 'Ban QLDA huyện Đơn Dương', bidField: i % 5 === 4 ? 'HH' : 'XL', investField: i % 5 === 4 ? 'HH' : 'XL',
  bidPrice: 5_000_000_000 + i * 1_000_000, publicDate: '2026-11-01T02:00:00.000Z', bidCloseDate: '2026-12-20T03:00:00.000Z',
  locations: [{ provName: 'Lâm Đồng', provCode: '68' }], ...extra
});

/** Trang e-GP giả: nói đúng giao thức content.js, qua đúng kênh nhắn tin của app. */
function fakePage({ total = 120, pageSize = 50, busyFirst = false, notReadyFor = 0, duplicateAck = false, stallAfterPage = null, pageError = null, dropFinal = false } = {}) {
  let channel; let seq = 0; let probes = 0; let busy = busyFirst; const log = [];
  const rows = Array.from({ length: total }, (_, i) => record(i));
  const pageSend = (message) => new Promise((resolve) => {
    const id = `p.${++seq}`;
    waiters.set(id, resolve);
    channel.receive(JSON.stringify({ kind: 'send', id, message }));
  });
  const waiters = new Map();
  const inject = (js) => {
    const m = /__gscbFromApp\(("[\s\S]*")\); true;$/.exec(js);
    const msg = JSON.parse(JSON.parse(m[1]));
    if (msg.kind === 'reply') { const w = waiters.get(msg.id); waiters.delete(msg.id); w?.(msg.response); return; }
    const reply = (response) => setTimeout(() => channel.receive(JSON.stringify({ kind: 'commandReply', id: msg.id, response })), 1);
    const { type, payload = {} } = msg.message;
    log.push(type);
    if (type === 'KQLCNT_PROBE') {
      probes += 1;
      return reply({ ok: true, busy, pageError, searchView: probes > notReadyFor, resultsView: false, ready: !busy && probes > notReadyFor && !pageError });
    }
    if (type === 'KQLCNT_CANCEL') { busy = false; return reply({ ok: true }); }
    if (type === 'KQLCNT_START') {
      reply({ ok: true });
      (async () => {
        const pages = Math.ceil(rows.length / pageSize);
        const base = { planId: payload.id, queryIndex: payload.queryIndex, mode: 'tbmt', totalElements: rows.length, totalPages: pages };
        for (let p = 0; p < pages; p++) {
          if (stallAfterPage !== null && p > stallAfterPage) return;
          const body = { ...base, records: rows.slice(p * pageSize, (p + 1) * pageSize), pageIndex: p, done: false };
          const ack = await pageSend({ type: 'KQLCNT_RESULTS', payload: body });
          assert.equal(ack?.ok, true, 'app phải xác nhận {ok:true} mỗi trang');
          if (duplicateAck && p === 0) await pageSend({ type: 'KQLCNT_RESULTS', payload: body }); // gửi lại vì ACK lỡ
        }
        if (dropFinal) return;
        await pageSend({ type: 'KQLCNT_RESULTS', payload: { ...base, records: [], pageIndex: pages, done: true, capped: false, partial: false } });
        await pageSend({ type: 'KQLCNT_DONE', payload: { planId: payload.id, queryIndex: payload.queryIndex, mode: 'tbmt', ok: true, message: 'Xong' } });
      })();
    }
  };
  channel = createPageChannel({ inject });
  return { channel, log, pageSend };
}

function engineWith(page, limits = {}) {
  const search = createTbmtSearch({ channel: page.channel, sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))), limits: { readyMs: 3000, reloadAfterMs: 1000, idleMs: 400, runMs: 5000, ...limits } });
  page.channel.setHandler(search.handlePageMessage);
  return search;
}

test('prepareSearch: Lâm Đồng → đủ hai mã 68 và 703, lọc loại gói và giá ở máy chủ', () => {
  const r = prepareSearch({ province: 'Lâm Đồng', category: 'XL', minPrice: '3 tỷ' });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.criteria.provinces, ['68', '703']);
  assert.equal(r.queries.length, 1);
  const f = Object.fromEntries(r.queries[0].filters.map((x) => [x.fieldName, x]));
  assert.deepEqual(f['locations.provCode'].fieldValues, ['68', '703']);
  assert.deepEqual(f.investField.fieldValues, ['XL']);
  assert.equal(f.bidPrice.from, 3_000_000_000);
  assert.equal(r.criteria.minPrice, 3_000_000_000);
});

test('prepareSearch: chặn tỉnh lạ, tiêu chí rỗng, giá ngược; bỏ tiêu chí xã/phường thay vì lọc sai', () => {
  assert.equal(prepareSearch({ province: 'Tỉnh Không Có' }).field, 'province');
  assert.equal(prepareSearch({}).ok, false);
  assert.equal(prepareSearch({ minPrice: '10 tỷ', maxPrice: '2 tỷ' }).field, 'maxPrice');
  const ward = prepareSearch({ province: 'Lâm Đồng', ward: 'Xã Đức Trọng' });
  assert.equal(ward.ok, true);
  assert.equal(ward.criteria.ward, undefined);
});

test('resolveProvinces: nhiều tỉnh, chống trùng mã', () => {
  const r = resolveProvinces('Lâm Đồng; Khánh Hòa; lam dong');
  assert.equal(r.ok, true);
  assert.deepEqual(r.codes, ['68', '703', '56']);
});

test('nhiều chủ đầu tư → mỗi CĐT một truy vấn (e-GP chỉ nhận một khối từ khoá)', () => {
  const r = prepareSearch({ investor: 'UBND xã A; Ban QLDA huyện B' });
  assert.equal(r.queries.length, 2);
  assert.deepEqual(r.queries.map((q) => q.keyWord), ['UBND xã A', 'Ban QLDA huyện B']);
});

test('evaluateRecord dùng lõi tiện ích: chấm điểm + đối chiếu tiêu chí cứng', () => {
  const p = prepareSearch({ province: 'Lâm Đồng', category: 'XL' });
  const ok = evaluateRecord(record(1), p.criteria);
  assert.equal(ok.filterState, 'MATCH');
  assert.ok(ok.score >= 55, `điểm ${ok.score}`);
  const hh = evaluateRecord(record(4), p.criteria);
  assert.equal(hh.filterState, 'OUT_OF_RANGE');
  assert.match(hh.filterReasonLabel, /loại gói/i);
  assert.equal(evaluateRecord({ bidName: 'không mã' }, p.criteria), null, 'không có mã TBMT/KHLCNT thì không nhận');
});

test('sortTenders: khớp tiêu chí trước, rồi gói còn mở, rồi điểm cao', () => {
  const list = sortTenders([
    { key: 'a', filterState: 'OUT_OF_RANGE', bidState: 'OPEN', score: 99 },
    { key: 'b', filterState: 'MATCH', bidState: 'CLOSED', score: 90 },
    { key: 'c', filterState: 'MATCH', bidState: 'OPEN', score: 60 },
    { key: 'd', filterState: 'MATCH', bidState: 'OPEN', score: 80 }
  ]);
  assert.deepEqual(list.map((t) => t.key), ['d', 'c', 'b', 'a']);
});

test('lượt chuẩn: 120 gói / 3 trang → SUCCESS, đối soát khớp, gói Hàng hóa ngoài tiêu chí', async () => {
  const page = fakePage({ total: 120 });
  const search = engineWith(page);
  const phases = [];
  const r = await search.run({ province: 'Lâm Đồng', category: 'XL' }, { onProgress: (p) => phases.push(p.phase) });
  assert.equal(r.status, 'SUCCESS', r.message);
  assert.equal(r.counts.fetched, 120);
  assert.equal(r.counts.match, 96);
  assert.equal(r.counts.outOfRange, 24);
  assert.equal(r.coverage.complete, true, r.coverage.text);
  assert.ok(phases.includes('search') && phases.at(-1) === 'done');
  assert.deepEqual(page.log.filter((t) => t !== 'KQLCNT_PROBE'), ['KQLCNT_START']);
});

test('trang gửi lại vì xác nhận bị lỡ: xác nhận nhưng không đếm hai lần', async () => {
  const page = fakePage({ total: 120, duplicateAck: true });
  const r = await engineWith(page).run({ province: 'Lâm Đồng' });
  assert.equal(r.status, 'SUCCESS', r.message);
  assert.equal(r.counts.fetched, 120);
});

test('trang còn kẹt lượt cũ (app bị đóng giữa chừng): tự dừng lượt cũ rồi chạy', async () => {
  const page = fakePage({ total: 10, busyFirst: true });
  const r = await engineWith(page).run({ province: 'Lâm Đồng' });
  assert.equal(r.status, 'SUCCESS', r.message);
  assert.ok(page.log.includes('KQLCNT_CANCEL'));
});

test('trang báo lỗi truy cập: dừng ngay với lời giải thích, không giao lượt', async () => {
  const page = fakePage({ pageError: 'ACCESS_DENIED' });
  const r = await engineWith(page).run({ province: 'Lâm Đồng' });
  assert.equal(r.status, 'ERROR');
  assert.match(r.message, /từ chối truy cập/);
  assert.ok(!page.log.includes('KQLCNT_START'));
});

test('e-GP ngừng trả giữa chừng: dừng sau hạn chờ, giữ phần đã có, ghi CHƯA ĐẦY ĐỦ', async () => {
  const page = fakePage({ total: 150, stallAfterPage: 0 });
  const r = await engineWith(page, { idleMs: 300 }).run({ province: 'Lâm Đồng' });
  assert.equal(r.status, 'PARTIAL', r.message);
  assert.equal(r.counts.fetched, 50);
  assert.equal(r.coverage.complete, false);
  assert.match(r.coverage.text, /CHƯA XÁC NHẬN LẤY ĐỦ/);
  assert.ok(page.log.includes('KQLCNT_CANCEL'));
});

test('thiếu trang chốt: không bao giờ báo "đã lấy đủ"', async () => {
  const page = fakePage({ total: 60, dropFinal: true });
  const r = await engineWith(page, { idleMs: 300 }).run({ province: 'Lâm Đồng' });
  assert.notEqual(r.status, 'SUCCESS');
  assert.equal(r.coverage.complete, false);
});

test('tin nhắn của lượt khác bị từ chối; lượt đang chạy thì chặn lượt thứ hai', async () => {
  const page = fakePage({ total: 120 });
  const search = engineWith(page);
  const stale = search.handlePageMessage({ type: 'KQLCNT_RESULTS', payload: { planId: 'cu', queryIndex: 0, mode: 'tbmt', records: [record(1)], pageIndex: 0 } });
  assert.equal(stale.ok, false);
  const first = search.run({ province: 'Lâm Đồng' });
  const second = await search.run({ province: 'Lâm Đồng' });
  assert.equal(second.status, 'BUSY');
  assert.equal((await first).status, 'SUCCESS');
});

test('bấm Dừng: trạng thái CANCELLED, gửi KQLCNT_CANCEL đúng lượt', async () => {
  const page = fakePage({ total: 150, stallAfterPage: 0 });
  const search = engineWith(page, { idleMs: 5000 });
  let asked = false;
  const r = await search.run({ province: 'Lâm Đồng' }, { onProgress: (p) => { if (!asked && p.fetched >= 50) { asked = true; search.cancel(); } } });
  assert.equal(r.status, 'CANCELLED');
  assert.equal(r.counts.fetched, 50);
});

test('nhiều chủ đầu tư: hai lượt nối tiếp, gộp và chống trùng theo mã', async () => {
  const page = fakePage({ total: 40 });
  const r = await engineWith(page).run({ investor: 'Ban QLDA huyện Đơn Dương; UBND xã B' });
  assert.equal(r.status, 'SUCCESS', r.message);
  assert.equal(r.counts.fetched, 80);
  assert.equal(r.counts.unique, 40);
  assert.equal(page.log.filter((t) => t === 'KQLCNT_START').length, 2);
});
