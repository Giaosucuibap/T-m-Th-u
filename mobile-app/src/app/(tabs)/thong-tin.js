/* THÔNG TIN & TRỢ GIÚP — kết nối, cài app lên màn hình chính (iPhone/iPad), lịch sử tra cứu,
   giới hạn cần biết, xoá dữ liệu. */
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useEgp } from '../../egp/EgpProvider';
import { useApp } from '../../state/AppState';
import { T, Card, Button, Badge, Notice, Field } from '../../ui/kit.js';
import { useLayout } from '../../ui/layout.js';
import { color, size, space, radius } from '../../ui/theme.js';
import { ago, criteriaSummary, priceOrNull } from '../../core/format.js';

const REMOTE_LIMITS = [
  'Máy tính công ty làm việc tra e-GP (Chrome + tiện ích). Máy tính hoặc Chrome tắt thì điện thoại không tra được (vẫn xem được kết quả gần nhất); Bộ săn tự động và tin nhắn Telegram vẫn chạy trên máy tính như cũ.',
  'Qua ĐỊA CHỈ CỐ ĐỊNH: máy tính khởi động lại không phải quét lại mã — app tự tìm máy tính. Chỉ khi trên máy tính bấm "Đổi khoá" mới phải quét mã một lần nữa.',
  'Mỗi lượt đọc tối đa 20 trang (1.000 gói) cho mỗi truy vấn. Vượt mức này, kết quả ghi rõ "chưa đầy đủ" — hãy thu hẹp tiêu chí.',
  'Kết quả và danh sách theo dõi lưu trong Safari trên điện thoại này và trên máy tính công ty; không gửi về máy chủ nào khác. Ai có link đều tra được bằng máy tính — đừng gửi link cho người ngoài.'
];

const LIMITS = [
  'Tra cứu chạy khi app đang mở trên màn hình. iPhone không cho app tự chạy nền theo giờ như máy tính, nên Bộ săn tự động và tin nhắn Telegram vẫn do tiện ích Chrome trên máy tính đảm nhận.',
  'App dùng chính trang tra cứu công khai của e-GP. Khi e-GP đổi giao diện hoặc cấu trúc dữ liệu, có thể cần cập nhật lõi tra cứu (dùng chung với tiện ích).',
  'Mỗi lượt đọc tối đa 20 trang (1.000 gói) cho mỗi truy vấn. Vượt mức này, app ghi rõ "chưa đầy đủ" — hãy thu hẹp tiêu chí.',
  'Bản này chưa lọc theo xã/phường, chưa soi biên bản mở thầu và kết quả lựa chọn nhà thầu — các việc đó vẫn làm trên tiện ích Chrome.',
  'Dữ liệu (tiêu chí, kết quả, gói theo dõi) chỉ lưu trên điện thoại này, không gửi về máy chủ nào.'
];

export default function InfoScreen() {
  const egp = useEgp();
  const app = useApp();
  const router = useRouter();
  const version = Constants.expoConfig?.version || '1.0.0';
  const layout = useLayout();

  function rerun(row) {
    const c = row.criteria || {};
    app.saveForm({ province: c.province || '', category: c.category || '', keyword: c.keyword || '', investor: c.investor || '',
      minPrice: priceOrNull(c.minPrice) ? String(priceOrNull(c.minPrice)) : '', maxPrice: priceOrNull(c.maxPrice) ? String(priceOrNull(c.maxPrice)) : '', mustKeywords: c.mustKeywords || '', excludeKeywords: c.excludeKeywords || '' });
    router.navigate('/');
  }

  function confirmClear() {
    const title = 'Xoá dữ liệu trên máy?';
    const body = 'Xoá tiêu chí, kết quả, lịch sử, danh sách theo dõi và huỷ mọi lời nhắc. Không hoàn tác được.';
    // Alert của React Native không chạy trên Safari (bản web): dùng hộp xác nhận của trình duyệt.
    if (Platform.OS === 'web') { if (window.confirm(`${title}\n\n${body}`)) void app.clearAll(); return; }
    Alert.alert(title, body, [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xoá', style: 'destructive', onPress: () => app.clearAll() }
    ]);
  }

  const state = { ready: ['Sẵn sàng', color.ok, color.okBg], loading: ['Đang mở', color.warn, color.warnBg], error: ['Có lỗi', color.bad, color.badBg] }[egp.page.state] || ['—', color.muted, color.surface3];

  return (
    <ScrollView contentContainerStyle={[styles.content, layout.centered && { width: '100%', maxWidth: 760, alignSelf: 'center' }]}>
      <Card>
        <T weight="bold" style={styles.app}>Giáo Sư Cùi Bắp</T>
        <T style={styles.muted}>Tìm gói thầu e-GP trên điện thoại · bản {version}</T>
        <T style={styles.small}>Lõi tra cứu e-GP {egp.coreVersion} — dùng nguyên văn mã đã kiểm thử của tiện ích Chrome cùng tên.</T>
      </Card>

      <Card>
        <View style={styles.rowBetween}>
          <T weight="semibold" style={styles.h2}>{egp.mode === 'remote' ? 'Kết nối máy tính công ty' : 'Kết nối e-GP'}</T>
          <Badge label={state[0]} fg={state[1]} bg={state[2]} />
        </View>
        <T style={styles.muted}>{egp.page.message}</T>
        {egp.mode === 'remote' && egp.connection ? <T style={styles.small}>{CONNECTION_TEXT[egp.connection.kind] || ''}</T> : null}
        {egp.mode === 'live' ? (
          <View style={styles.row2}>
            <Button title="Xem trang e-GP" kind="secondary" style={{ flex: 1 }} onPress={() => egp.showPage(true)} />
            <Button title="Tải lại" kind="secondary" style={{ flex: 1 }} onPress={() => egp.reloadPage()} />
          </View>
        ) : null}
        <T style={styles.small}>{egp.mode === 'remote'
          ? 'Máy tính công ty và Chrome phải đang bật. Không kết nối được: trên máy tính mở tiện ích › Link điện thoại để xem trạng thái.'
          : 'Gặp lỗi khi tra: bấm "Xem trang e-GP" để xem trang có mở được không (mạng, bảo trì, e-GP chặn truy cập), rồi "Tải lại".'}</T>
        {egp.mode === 'remote' ? <Button title="Kiểm tra lại kết nối" kind="secondary" onPress={() => egp.reloadPage()} /> : null}
      </Card>

      {egp.mode === 'remote' && Platform.OS === 'web' ? <InstallCard egp={egp} /> : null}
      {egp.mode === 'remote' && Platform.OS === 'web' && (!egp.hasKey || egp.standalone) ? <KeyPasteCard egp={egp} /> : null}

      <Card>
        <T weight="semibold" style={styles.h2}>Lịch sử tra cứu</T>
        {app.history.length ? app.history.map((row) => (
          <Pressable key={row.id} accessibilityRole="button" onPress={() => rerun(row)} style={({ pressed }) => [styles.hist, pressed && { opacity: 0.7 }]}>
            <T weight="semibold" style={styles.histTitle} numberOfLines={2}>{criteriaSummary(row.criteria)}</T>
            <T style={styles.small}>{ago(row.at)} · khớp {row.counts?.match ?? 0}/{row.counts?.unique ?? 0} gói · {row.status === 'SUCCESS' ? 'đã lấy đủ' : row.status === 'PARTIAL' ? 'chưa đầy đủ' : row.status === 'CANCELLED' ? 'đã dừng' : 'lỗi'}</T>
            <T weight="semibold" style={styles.link}>Dùng lại tiêu chí này ›</T>
          </Pressable>
        )) : <T style={styles.muted}>Chưa có lượt tra nào.</T>}
      </Card>

      <Card>
        <T weight="semibold" style={styles.h2}>Những điều cần biết</T>
        {(egp.mode === 'remote' ? REMOTE_LIMITS : LIMITS).map((line) => <T key={line} style={styles.limit}>• {line}</T>)}
      </Card>

      <Notice tone="info" title="Nhắc hạn nộp">
        {egp.mode === 'remote' || egp.mode === 'demo'
          ? 'Trên Safari: mở gói thầu › "Thêm vào Lịch iPhone". Lịch nhắc còn 3 ngày, 24 giờ, 3 giờ trước hạn nộp.'
          : 'Lời nhắc là thông báo hẹn sẵn trên iPhone. Nếu không thấy thông báo: Cài đặt › Thông báo › chọn app › bật Cho phép thông báo.'}
      </Notice>

      <Button title="Xoá dữ liệu trên máy" kind="danger" onPress={confirmClear} />
    </ScrollView>
  );
}

const CONNECTION_TEXT = {
  relay: 'Kết nối qua ĐỊA CHỈ CỐ ĐỊNH — máy tính khởi động lại, app tự tìm lại máy tính, không phải quét mã.',
  direct: 'Kết nối qua link tạm của máy tính — link đổi khi máy tính khởi động lại. Nên ghép địa chỉ cố định (tiện ích › Link điện thoại).',
  'relay-bad': 'Khoá trên máy này đã cũ — quét lại mã QR trên máy tính.',
  'relay-empty': 'Địa chỉ cố định chưa có máy tính nào báo địa chỉ.',
  offline: 'Chưa có mạng.'
};

/** Cài lên màn hình chính: iOS lấy địa chỉ đang mở làm địa chỉ biểu tượng — tạm đặt khoá vào sau dấu #. */
function InstallCard({ egp }) {
  const [step, setStep] = useState(false);
  if (egp.standalone) {
    return (
      <Card>
        <View style={styles.rowBetween}>
          <T weight="semibold" style={styles.h2}>App trên màn hình chính</T>
          <Badge label="Đang chạy như app" fg={color.ok} bg={color.okBg} />
        </View>
        <T style={styles.muted}>Mở bằng biểu tượng "Cùi Bắp" trên màn hình chính. Máy tính khởi động lại thì app tự tìm lại, không phải quét mã.</T>
      </Card>
    );
  }
  if (egp.connection?.kind === 'direct') {
    return (
      <Notice tone="warn" title="Cài lên màn hình chính">
        {'Trang đang mở bằng link tạm của máy tính (đổi mỗi khi máy tính khởi động lại) — biểu tượng cài từ link này sẽ hỏng khi link đổi. Trên máy tính: tiện ích › Link điện thoại › "Địa chỉ cố định" › Ghép nối, rồi quét mã QR mới.'}
      </Notice>
    );
  }
  return (
    <Card>
      <T weight="semibold" style={styles.h2}>Cài thành app trên màn hình chính</T>
      {!step ? (
        <>
          <T style={styles.muted}>Một lần cho mỗi máy (iPhone, iPad): có biểu tượng "Cùi Bắp" như app, mở toàn màn hình, không phải quét mã lại.</T>
          <Button title="Bắt đầu cài" onPress={() => { egp.installMode(true); setStep(true); }} disabled={!egp.hasKey} />
        </>
      ) : (
        <>
          <T style={styles.step}>1. Bấm nút <T weight="bold" style={styles.step}>Chia sẻ</T> của Safari (ô vuông có mũi tên lên — iPhone: thanh dưới; iPad: góc trên bên phải).</T>
          <T style={styles.step}>2. Kéo xuống, chọn <T weight="bold" style={styles.step}>"Thêm vào MH chính"</T> (Add to Home Screen).</T>
          <T style={styles.step}>3. Bấm <T weight="bold" style={styles.step}>Thêm</T>. Biểu tượng "Cùi Bắp" hiện trên màn hình chính.</T>
          <T style={styles.small}>Lúc này thanh địa chỉ tạm chứa khoá truy cập (để biểu tượng mới tự có khoá) — đừng chụp hay gửi thanh địa chỉ cho ai. Bấm "Xong" để xoá khoá khỏi thanh địa chỉ.</T>
          <Button title="Xong" kind="secondary" onPress={() => { egp.installMode(false); setStep(false); }} />
        </>
      )}
    </Card>
  );
}

/** App trên màn hình chính chưa có khoá (hoặc cần đổi): dán link kết nối từ Telegram / tin nhắn. */
function KeyPasteCard({ egp }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  return (
    <Card>
      <T weight="semibold" style={styles.h2}>Dán link kết nối</T>
      <T style={styles.small}>Link dạng https://…/#k=… (trong tin Telegram hoặc chép từ máy tính). Máy này sẽ dùng khoá trong link.</T>
      <Field label="Link kết nối" value={text} onChangeText={(v) => { setText(v); setErr(''); }} placeholder="https://…/#k=…" autoCapitalize="none" autoCorrect={false} error={err || null} />
      <Button title="Dùng link này" kind="secondary" onPress={() => { if (!egp.applyKeyFromText(text)) setErr('Link không có khoá hợp lệ.'); }} />
    </Card>
  );
}

const styles = StyleSheet.create({
  step: { fontSize: size.base, color: color.ink, lineHeight: 23 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: 48 },
  app: { fontSize: size.xl, color: color.brand800 },
  h2: { fontSize: size.lg, color: color.ink },
  muted: { fontSize: size.base, color: color.text2, lineHeight: 22 },
  small: { fontSize: size.xs, color: color.subtle, lineHeight: 18 },
  link: { fontSize: size.sm, color: color.brand700 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row2: { flexDirection: 'row', gap: space.sm },
  hist: { borderWidth: 1, borderColor: color.line, borderRadius: radius.md, padding: space.md, gap: 4, backgroundColor: color.surface2 },
  histTitle: { fontSize: size.base, color: color.ink },
  limit: { fontSize: size.sm, color: color.text2, lineHeight: 21 }
});
