/* THÔNG TIN & TRỢ GIÚP — kết nối e-GP, lịch sử tra cứu, giới hạn cần biết, xoá dữ liệu. */
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useEgp } from '../../egp/EgpProvider';
import { useApp } from '../../state/AppState';
import { T, Card, Button, Badge, Notice } from '../../ui/kit.js';
import { color, size, space, radius } from '../../ui/theme.js';
import { ago, criteriaSummary } from '../../core/format.js';

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

  function rerun(row) {
    const c = row.criteria || {};
    app.saveForm({ province: c.province || '', category: c.category || '', keyword: c.keyword || '', investor: c.investor || '',
      minPrice: c.minPrice ? String(c.minPrice) : '', maxPrice: c.maxPrice ? String(c.maxPrice) : '', mustKeywords: c.mustKeywords || '', excludeKeywords: c.excludeKeywords || '' });
    router.navigate('/');
  }

  function confirmClear() {
    Alert.alert('Xoá dữ liệu trên máy?', 'Xoá tiêu chí, kết quả, lịch sử, danh sách theo dõi và huỷ mọi lời nhắc. Không hoàn tác được.', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xoá', style: 'destructive', onPress: () => app.clearAll() }
    ]);
  }

  const state = { ready: ['Sẵn sàng', color.ok, color.okBg], loading: ['Đang mở', color.warn, color.warnBg], error: ['Có lỗi', color.bad, color.badBg] }[egp.page.state] || ['—', color.muted, color.surface3];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <T weight="bold" style={styles.app}>Giáo Sư Cùi Bắp</T>
        <T style={styles.muted}>Tìm gói thầu e-GP trên điện thoại · bản {version}</T>
        <T style={styles.small}>Lõi tra cứu e-GP {egp.coreVersion} — dùng nguyên văn mã đã kiểm thử của tiện ích Chrome cùng tên.</T>
      </Card>

      <Card>
        <View style={styles.rowBetween}>
          <T weight="semibold" style={styles.h2}>Kết nối e-GP</T>
          <Badge label={state[0]} fg={state[1]} bg={state[2]} />
        </View>
        <T style={styles.muted}>{egp.page.message}</T>
        {egp.mode === 'live' ? (
          <View style={styles.row2}>
            <Button title="Xem trang e-GP" kind="secondary" style={{ flex: 1 }} onPress={() => egp.showPage(true)} />
            <Button title="Tải lại" kind="secondary" style={{ flex: 1 }} onPress={() => egp.reloadPage()} />
          </View>
        ) : null}
        <T style={styles.small}>Gặp lỗi khi tra: bấm "Xem trang e-GP" để xem trang có mở được không (mạng, bảo trì, e-GP chặn truy cập), rồi "Tải lại".</T>
      </Card>

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
        {LIMITS.map((line) => <T key={line} style={styles.limit}>• {line}</T>)}
      </Card>

      <Notice tone="info" title="Nhắc hạn nộp">
        {'Lời nhắc là thông báo hẹn sẵn trên iPhone. Nếu không thấy thông báo: Cài đặt › Thông báo › chọn app › bật Cho phép thông báo.'}
      </Notice>

      <Button title="Xoá dữ liệu trên máy" kind="danger" onPress={confirmClear} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
