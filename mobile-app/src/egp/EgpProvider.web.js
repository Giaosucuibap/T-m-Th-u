/* BẢN XEM TRƯỚC GIAO DIỆN TRÊN WEB — không có WebView nên không tra được e-GP.
 * Giữ nguyên giao diện và lõi chấm điểm, nhưng lấy DỮ LIỆU MẪU (ghi rõ trên màn
 * hình). Chỉ dùng để chụp/duyệt giao diện; app trên iPhone dùng EgpProvider.js. */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { EXTENSION_VERSION } from './inject.js';
import { createPageChannel } from '../core/page-channel.js';
import { createTbmtSearch } from '../core/search.js';
import { sampleRecords } from './sample-data.js';
import { T } from '../ui/kit.js';
import { color, size } from '../ui/theme.js';

const EgpContext = createContext(null);
export const useEgp = () => useContext(EgpContext);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

export function EgpProvider({ children }) {
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
    mode: 'demo', coreVersion: EXTENSION_VERSION,
    page: { state: 'ready', message: 'Bản xem trước: dữ liệu mẫu, không kết nối e-GP.' },
    running, progress, run, cancel: () => engine.cancel(), reloadPage: () => {}, showPage: () => {}, pageVisible: false
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  banner: { backgroundColor: color.warnBg, borderBottomWidth: 1, borderBottomColor: color.warnLine, paddingVertical: 6, paddingHorizontal: 12 },
  bannerText: { color: color.warn, fontSize: size.xs, textAlign: 'center' }
});

export const PLATFORM_NOTE = 'Bản xem trước trên web chỉ để duyệt giao diện.';
