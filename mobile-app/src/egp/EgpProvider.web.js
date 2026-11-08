/* ============================================================================
 *  BẢN WEB — HAI CHẾ ĐỘ (chọn lúc đóng gói bằng EXPO_PUBLIC_GSCB_MODE):
 *
 *  remote : LINK ĐIỆN THOẠI (4.20.0). Trang này do máy phục vụ trên MÁY TÍNH CÔNG
 *           TY phát qua đường hầm https. Lệnh tìm được gửi tới máy tính
 *           (/api/search); tiện ích Chrome trên máy tính tra e-GP rồi trả kết quả.
 *           Khoá nằm sau dấu # của link trong mã QR, lưu trong Safari.
 *  demo   : BẢN XEM TRƯỚC GIAO DIỆN — dữ liệu mẫu (ghi rõ trên màn hình), để chụp
 *           và duyệt giao diện. Không gọi mạng.
 * ========================================================================== */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { EXTENSION_VERSION } from './inject.js';
import { createPageChannel } from '../core/page-channel.js';
import { createTbmtSearch, prepareSearch } from '../core/search.js';
import { sampleRecords } from './sample-data.js';
import { useApp } from '../state/AppState';
import { T } from '../ui/kit.js';
import { color, size } from '../ui/theme.js';

const EgpContext = createContext(null);
export const useEgp = () => useContext(EgpContext);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const MODE = process.env.EXPO_PUBLIC_GSCB_MODE === 'remote' ? 'remote' : 'demo';

/* ------------------------------------------------------------------ remote */
const KEY_STORE = 'gscb.key';
function readKey() {
  try {
    const m = /[#&]k=([A-Za-z0-9_-]{24,128})/.exec(window.location.hash || '');
    if (m) {
      localStorage.setItem(KEY_STORE, m[1]);
      // Xoá khoá khỏi thanh địa chỉ: không lộ khi chụp màn hình hay chia sẻ trang.
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return m[1];
    }
    return localStorage.getItem(KEY_STORE) || '';
  } catch { return ''; }
}

const JOB_ERRORS = {
  PC_BUSY: 'Máy tính công ty đang chạy một lượt tra khác (bộ săn hoặc người dùng trên máy). Chờ ít phút rồi thử lại.',
  BUSY: 'Máy tính công ty đang tra một lượt khác từ điện thoại. Chờ lượt đó xong rồi thử lại.',
  READ_ONLY: 'Tiện ích trên máy tính đang khoá chỉnh sửa (chế độ chỉ xem). Mở Cấu hình trên máy tính để tắt.',
  SCHEMA_RED: 'e-GP vừa đổi cấu trúc; tiện ích đã tạm dừng tra cứu để tránh kết quả sai. Mở tiện ích trên máy tính (Kiểm tra dữ liệu) để xem.',
  TIMEOUT: 'Lượt tra quá 15 phút nên đã dừng. Thử thu hẹp tiêu chí.',
  RUN_MISSING: 'Không đọc được kết quả lượt tra trên máy tính. Thử lại.',
  START_FAILED: 'Máy tính chưa bắt đầu được lượt tra.',
  EXTENSION_ERROR: 'Tiện ích trên máy tính gặp lỗi khi tra.'
};

function createRemote(key) {
  async function api(path, { method = 'GET', body } = {}) {
    try {
      const res = await fetch(path, {
        method, cache: 'no-store',
        headers: { 'X-GSCB-Key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined
      });
      let json = null;
      try { json = await res.json(); } catch { /* không phải JSON */ }
      return { status: res.status, json };
    } catch { return { status: 0, json: null }; }
  }
  return { api };
}

function pageFromStatus(key, r) {
  if (!key) return { state: 'error', message: 'Chưa có khoá truy cập. Trên máy tính công ty mở tiện ích › Link điện thoại và quét lại mã QR.' };
  if (r.status === 401) return { state: 'error', message: 'Khoá không đúng hoặc đã được đổi. Quét lại mã QR mới trên máy tính công ty.' };
  if (r.status !== 200 || !r.json?.ok) return { state: 'error', message: 'Không kết nối được máy tính công ty. Máy tính và Chrome phải đang bật; link có thể đã đổi — quét lại mã QR.' };
  return { state: 'ready', message: r.json.busy ? 'Máy tính đang tra một lượt khác…' : 'Đã kết nối máy tính công ty — máy tính tra e-GP thay điện thoại.' };
}

function RemoteProvider({ children }) {
  const app = useApp();
  const keyRef = useRef(null);
  if (keyRef.current === null) keyRef.current = readKey();
  const key = keyRef.current;
  const remote = useMemo(() => createRemote(key), [key]);
  const [page, setPage] = useState(key ? { state: 'loading', message: 'Đang kết nối máy tính công ty…' } : pageFromStatus('', {}));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const cancelled = useRef(false);

  const refresh = useCallback(async () => {
    if (!key) return null;
    const r = await remote.api('/api/status');
    setPage(pageFromStatus(key, r));
    return r;
  }, [key, remote]);

  // Quét mã QR mới khi trang đang mở: Safari chỉ đổi phần sau dấu # (không tải lại trang)
  // → lưu khoá mới rồi tải lại để mọi lệnh dùng khoá mới.
  useEffect(() => {
    const onHash = () => {
      const m = /[#&]k=([A-Za-z0-9_-]{24,128})/.exec(window.location.hash || '');
      if (!m) return;
      try { localStorage.setItem(KEY_STORE, m[1]); } catch { /* chế độ riêng tư */ }
      window.location.replace(window.location.pathname);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!key) return undefined;
    void refresh();
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') void refresh(); }, 8000);
    return () => clearInterval(t);
  }, [key, refresh]);

  // Safari tải lại trang sau khi để nền lâu: lấy lượt gần nhất máy tính đã tra xong.
  useEffect(() => {
    if (!key || !app?.ready) return;
    (async () => {
      const r = await remote.api('/api/last');
      const last = r.json?.result;
      if (last && Array.isArray(last.tenders) && (!app.last || String(last.finishedAt || '') > String(app.last.finishedAt || ''))) await app.saveResult(last);
    })();
  }, [key, app?.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(async (criteria) => {
    const prepared = prepareSearch(criteria);
    if (!prepared.ok) return { ok: false, status: 'INVALID', field: prepared.field, message: prepared.message };
    if (!key) return { ok: false, status: 'ERROR', message: pageFromStatus('', {}).message, counts: {}, tenders: [] };
    cancelled.current = false;
    setRunning(true);
    setProgress({ phase: 'start', message: 'Đang gửi lệnh tới máy tính công ty…' });
    const fail = (message) => ({ ok: false, status: 'ERROR', message, criteria: prepared.criteria, finishedAt: new Date().toISOString(), coverage: { text: '' }, counts: { fetched: 0, unique: 0, match: 0, insufficient: 0, outOfRange: 0 }, tenders: [] });
    try {
      const start = await remote.api('/api/search', { method: 'POST', body: { criteria } });
      if (start.status === 409) return { ok: false, status: 'BUSY', message: JOB_ERRORS.BUSY };
      if (start.status === 401) return fail(pageFromStatus(key, start).message);
      if (start.status !== 202 || !start.json?.jobId) return fail(pageFromStatus(key, { status: 0 }).message);
      const jobId = start.json.jobId;
      let misses = 0;
      for (;;) {
        await wait(1000);
        const j = await remote.api(`/api/job?id=${encodeURIComponent(jobId)}`);
        if (j.status === 0) { if (++misses > 45) return fail('Mất kết nối với máy tính công ty giữa chừng. Mở lại trang sau ít phút — kết quả vẫn được giữ trên máy tính.'); continue; }
        misses = 0;
        if (j.status === 404) return fail('Cầu nối trên máy tính vừa khởi động lại. Quét lại mã QR rồi tra lại.');
        const s = j.json || {};
        if (s.state === 'done' && s.result) return { ...s.result, source: 'pc' };
        if (s.state === 'error') {
          const p = s.progress;
          return fail(JOB_ERRORS[s.code] ? `${JOB_ERRORS[s.code]}${s.code === 'START_FAILED' && typeof p === 'string' && p ? ` ${p}` : ''}` : (typeof p === 'string' && p ? p : 'Lượt tra không thành công.'));
        }
        const p = s.progress || {};
        setProgress({ phase: 'search', message: cancelled.current ? 'Đang dừng…' : (p.message || 'Máy tính đang hỏi e-GP…'), fetched: p.fetched || 0,
          pagesRead: p.pagesRead ?? 0, totalPages: p.totalPages ?? null, totalElements: p.serverTotal ?? null });
      }
    } finally { setRunning(false); }
  }, [key, remote]);

  const cancel = useCallback(async () => { cancelled.current = true; await remote.api('/api/cancel', { method: 'POST', body: {} }); }, [remote]);

  /** Thêm hạn nộp vào Lịch iPhone: form POST → máy tính trả tệp .ics → Safari hỏi "Thêm vào Lịch". */
  const calendar = useCallback((t) => {
    if (!key || !t?.closeDate) return false;
    const fields = {
      k: key,
      summary: `Hạn nộp: ${String(t.bidName || t.displayCode || 'Gói thầu').slice(0, 240)}`,
      close: t.closeDate,
      description: [t.displayCode, t.investorName ? `Chủ đầu tư: ${t.investorName}` : '', t.price ? `Giá gói thầu: ${Number(t.price).toLocaleString('vi-VN')} đ` : ''].filter(Boolean).join('\n'),
      url: t.detailUrl || ''
    };
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/api/ics';
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = name; input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    return true;
  }, [key]);

  const value = useMemo(() => ({
    mode: 'remote', sourceLabel: 'Máy tính công ty', coreVersion: EXTENSION_VERSION,
    page, running, progress, run, cancel, calendar,
    reloadPage: () => { void refresh(); }, showPage: () => {}, pageVisible: false
  }), [page, running, progress, run, cancel, calendar, refresh]);
  return <EgpContext.Provider value={value}><View style={styles.root}>{children}</View></EgpContext.Provider>;
}

/* -------------------------------------------------------------------- demo */
/** Trang e-GP giả trong bộ nhớ: trả lời đúng giao thức content.js (PROBE/START → RESULTS → DONE). */
function createDemoPage() {
  let seq = 0;
  let channel = null;
  const pageSend = (message) => channel.receive(JSON.stringify({ kind: 'send', id: `demo.${++seq}`, message }));
  const inject = (js) => {
    const m = /^window\.__gscbFromApp && window\.__gscbFromApp\(("[\s\S]*")\); true;$/.exec(js);
    if (!m) return;
    const msg = JSON.parse(JSON.parse(m[1]));
    if (msg.kind !== 'command') return;
    const reply = (response) => setTimeout(() => channel.receive(JSON.stringify({ kind: 'commandReply', id: msg.id, response })), 30);
    const { type, payload = {} } = msg.message || {};
    if (type === 'KQLCNT_PROBE') return reply({ ok: true, busy: false, pageError: null, searchView: true, resultsView: false, ready: true });
    if (type === 'KQLCNT_CANCEL') return reply({ ok: true });
    if (type !== 'KQLCNT_START') return reply({ ok: false, unhandled: true });
    reply({ ok: true });
    const rows = sampleRecords(48);
    const pages = [rows.slice(0, 25), rows.slice(25)];
    const base = { planId: payload.id, queryIndex: payload.queryIndex ?? 0, mode: 'tbmt', totalElements: rows.length, totalPages: pages.length };
    (async () => {
      for (let i = 0; i < pages.length; i++) {
        await wait(700);
        pageSend({ type: 'KQLCNT_RESULTS', payload: { ...base, records: pages[i], pageIndex: i, done: false } });
      }
      await wait(200);
      pageSend({ type: 'KQLCNT_RESULTS', payload: { ...base, records: [], pageIndex: pages.length, done: true, capped: false, partial: false } });
      pageSend({ type: 'KQLCNT_DONE', payload: { planId: base.planId, queryIndex: base.queryIndex, mode: 'tbmt', ok: true, message: 'Xong (dữ liệu mẫu).' } });
    })();
  };
  channel = createPageChannel({ inject });
  return channel;
}

function DemoProvider({ children }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const engine = useMemo(() => {
    const channel = createDemoPage();
    const search = createTbmtSearch({ channel, limits: { readyMs: 5000 } });
    channel.setHandler(search.handlePageMessage);
    return search;
  }, []);
  const run = useCallback(async (criteria) => {
    setRunning(true);
    setProgress({ phase: 'start', message: 'Đang chuẩn bị...' });
    try { return await engine.run(criteria, { onProgress: setProgress }); } finally { setRunning(false); }
  }, [engine]);
  const value = useMemo(() => ({
    mode: 'demo', sourceLabel: 'e-GP', coreVersion: EXTENSION_VERSION,
    page: { state: 'ready', message: 'Bản xem trước: dữ liệu mẫu, không kết nối e-GP.' },
    running, progress, run, cancel: () => engine.cancel(), calendar: null, reloadPage: () => {}, showPage: () => {}, pageVisible: false
  }), [running, progress, run, engine]);
  return (
    <EgpContext.Provider value={value}>
      <View style={styles.root}>
        <View style={styles.banner}><T weight="semibold" style={styles.bannerText}>BẢN XEM TRƯỚC GIAO DIỆN — dữ liệu mẫu, không phải e-GP thật</T></View>
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </EgpContext.Provider>
  );
}

export function EgpProvider({ children }) {
  return MODE === 'remote' ? <RemoteProvider>{children}</RemoteProvider> : <DemoProvider>{children}</DemoProvider>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  banner: { backgroundColor: color.warnBg, borderBottomWidth: 1, borderBottomColor: color.warnLine, paddingVertical: 6, paddingHorizontal: 12 },
  bannerText: { color: color.warn, fontSize: size.xs, textAlign: 'center' }
});

export const PLATFORM_NOTE = MODE === 'remote'
  ? 'Máy tính công ty đang tra e-GP. Có thể tắt màn hình điện thoại; mở lại trang này để xem kết quả.'
  : 'Bản xem trước trên web chỉ để duyệt giao diện.';
