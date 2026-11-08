/* ============================================================================
 *  TRANG e-GP NHÚNG TRONG APP (iPhone/Android)
 *
 *  Một khung trình duyệt (WebView) mở sẵn trang Tra cứu Lựa chọn nhà thầu của
 *  e-GP, nằm phía sau giao diện app. Lõi tra cứu của tiện ích được tiêm vào
 *  trang; app điều khiển nó qua kênh nhắn tin. Mọi yêu cầu tìm kiếm do CHÍNH
 *  trang e-GP phát đi (kèm token hợp lệ của trang), app không tự gọi máy chủ.
 *  "Xem trang e-GP" đưa khung này ra trước để anh thấy đúng trang đang chạy.
 * ========================================================================== */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildInjectedScript, EXTENSION_VERSION } from './inject.js';
import { createPageChannel } from '../core/page-channel.js';
import { createTbmtSearch } from '../core/search.js';
import { EGP_SEARCH_PAGE } from '../core/egp/kqlcnt.js';
import { isEgpUrl } from '../core/egp/egp-host.js';
import { T } from '../ui/kit.js';
import { color, size } from '../ui/theme.js';

const INJECTED = buildInjectedScript();
const EgpContext = createContext(null);
export const useEgp = () => useContext(EgpContext);

const PAGE_ERRORS = {
  ACCESS_DENIED: 'Trang e-GP đang từ chối truy cập hoặc báo lỗi hệ thống.',
  PORTLET_UNAVAILABLE: 'Trang e-GP báo thành phần tra cứu tạm thời không khả dụng.'
};

export function EgpProvider({ children }) {
  const webRef = useRef(null);
  const insets = useSafeAreaInsets();
  const [webKey, setWebKey] = useState(0);
  const [visible, setVisible] = useState(false);
  const [page, setPage] = useState({ state: 'loading', message: 'Đang mở trang tra cứu e-GP...' });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);

  const engine = useMemo(() => {
    let reloadWaiter = null;
    const channel = createPageChannel({
      inject: (js) => webRef.current?.injectJavaScript(js),
      onInjectError: (e) => setPage({ state: 'error', message: `Không nạp được lõi tra cứu vào trang e-GP (${e.where}): ${e.message}` })
    });
    const search = createTbmtSearch({
      channel,
      // Tải lại = dựng khung trình duyệt mới ở đúng trang tra cứu.
      reload: () => new Promise((resolve) => { reloadWaiter = resolve; setWebKey((k) => k + 1); setTimeout(resolve, 8000); })
    });
    channel.setHandler((message) => {
      if (message?.type === 'CONTENT_READY' && message.payload?.phase === 'dom-ready') {
        const code = message.payload.pageError;
        setPage(code ? { state: 'error', message: PAGE_ERRORS[code] || 'Trang e-GP báo lỗi.' } : { state: 'ready', message: 'Đã kết nối trang tra cứu e-GP.', at: Date.now() });
        if (reloadWaiter) { reloadWaiter(); reloadWaiter = null; }
      }
      return search.handlePageMessage(message);
    });
    return { channel, search };
  }, []);

  // iOS tạm dừng app khi ra màn hình chính: thời gian đó không tính là e-GP ngừng trả.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') engine.search.touch(); });
    return () => sub.remove();
  }, [engine]);

  const run = useCallback(async (criteria) => {
    setRunning(true);
    setProgress({ phase: 'start', message: 'Đang chuẩn bị...' });
    try {
      return await engine.search.run(criteria, { onProgress: setProgress });
    } finally { setRunning(false); }
  }, [engine]);

  const value = useMemo(() => ({
    mode: 'live',
    coreVersion: EXTENSION_VERSION,
    page, running, progress,
    run,
    cancel: () => engine.search.cancel(),
    reloadPage: () => { setPage({ state: 'loading', message: 'Đang tải lại trang e-GP...' }); setWebKey((k) => k + 1); },
    showPage: setVisible,
    pageVisible: visible
  }), [page, running, progress, run, engine, visible]);

  const onShouldStart = useCallback((req) => {
    if (req.isTopFrame === false) return true;               // khung con của e-GP (vd. reCAPTCHA)
    if (isEgpUrl(req.url) || /^(about|blob|data):/.test(req.url)) return true;
    // Liên kết ra ngoài e-GP: mở bằng trình duyệt của máy, không mở trong khung tra cứu.
    if (/^https?:/.test(req.url)) Linking.openURL(req.url).catch(() => {});
    return false;
  }, []);

  return (
    <EgpContext.Provider value={value}>
      <View style={styles.root}>
        <View style={styles.app}>{children}</View>
        <View pointerEvents={visible ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, visible ? styles.front : styles.behind]}
          accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}>
          {visible ? (
            <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
              <T weight="semibold" style={styles.barTitle} numberOfLines={1}>Trang e-GP trong app</T>
              <Pressable accessibilityRole="button" onPress={() => { setPage({ state: 'loading', message: 'Đang tải lại trang e-GP...' }); setWebKey((k) => k + 1); }} style={styles.barBtn}>
                <T weight="semibold" style={styles.barBtnText}>Tải lại</T>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setVisible(false)} style={styles.barBtn}>
                <T weight="semibold" style={styles.barBtnText}>Đóng</T>
              </Pressable>
            </View>
          ) : null}
          <WebView
            key={webKey}
            ref={webRef}
            source={{ uri: EGP_SEARCH_PAGE }}
            injectedJavaScriptBeforeContentLoaded={INJECTED}
            injectedJavaScriptBeforeContentLoadedForMainFrameOnly
            onMessage={(event) => engine.channel.receive(event.nativeEvent.data)}
            onShouldStartLoadWithRequest={onShouldStart}
            originWhitelist={['https://*', 'about:*', 'blob:*', 'data:*']}
            onLoadStart={() => setPage((p) => (p.state === 'error' ? p : { state: 'loading', message: 'Đang tải trang e-GP...' }))}
            onError={(e) => setPage({ state: 'error', message: `Không mở được e-GP: ${e.nativeEvent?.description || 'lỗi mạng'}. Kiểm tra mạng rồi bấm Tải lại.` })}
            onHttpError={(e) => { if (e.nativeEvent?.statusCode >= 500 || e.nativeEvent?.statusCode === 403) setPage({ state: 'error', message: `e-GP trả mã lỗi ${e.nativeEvent.statusCode}. Thử lại sau ít phút.` }); }}
            onContentProcessDidTerminate={() => setWebKey((k) => k + 1)}
            onRenderProcessGone={() => setWebKey((k) => k + 1)}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            setSupportMultipleWindows={false}
            allowsBackForwardNavigationGestures={false}
            webviewDebuggingEnabled={__DEV__}
            style={styles.web}
          />
        </View>
      </View>
    </EgpContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  app: { flex: 1, backgroundColor: color.bg, zIndex: 1 },
  // Nằm SAU giao diện app (không trong suốt, không ẩn): iOS vẫn coi trang là đang hiển thị nên không bóp nhịp chạy.
  behind: { zIndex: 0 },
  front: { zIndex: 2, backgroundColor: color.surface },
  web: { flex: 1, backgroundColor: color.surface },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8, backgroundColor: color.brand900 },
  barTitle: { flex: 1, color: '#ffffff', fontSize: size.md },
  barBtn: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center' },
  barBtnText: { color: '#ffffff', fontSize: size.sm }
});

export const PLATFORM_NOTE = Platform.OS === 'ios'
  ? 'Trên iPhone, tra cứu chạy khi app đang mở. Ra màn hình chính lâu, iOS sẽ tạm dừng lượt tra; mở lại app, lượt tra chạy tiếp.'
  : 'Tra cứu chạy khi app đang mở.';
