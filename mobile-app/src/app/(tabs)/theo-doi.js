/* GÓI ĐANG THEO DÕI — xếp theo hạn nộp, gói sắp đóng lên đầu. */
import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../state/AppState';
import { T, Notice, TenderRow } from '../../ui/kit.js';
import { color, size, space } from '../../ui/theme.js';
import { vnParts, formatDateTimeVn } from '../../core/format.js';

export default function WatchScreen() {
  const app = useApp();
  const router = useRouter();
  const now = Date.now();
  const list = useMemo(() => {
    const all = Object.values(app.watch || {});
    const close = (t) => vnParts(t.closeDate)?.ms ?? Infinity;
    const open = all.filter((t) => close(t) > now).sort((a, b) => close(a) - close(b));
    const closed = all.filter((t) => close(t) <= now).sort((a, b) => close(b) - close(a));
    return [...open, ...closed];
  }, [app.watch, now]);

  return (
    <FlatList
      data={list}
      keyExtractor={(t) => t.key}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={{ gap: space.md, marginBottom: space.md }}>
          <Notice tone="info" title="Nhắc hạn nộp hồ sơ">
            {'Mỗi gói theo dõi được hẹn sẵn 3 lời nhắc trên điện thoại: còn 3 ngày, còn 24 giờ, còn 3 giờ trước đóng thầu. Lời nhắc vẫn kêu khi app đang đóng. Khi tra lại thấy gói được gia hạn, app tự hẹn lại theo hạn mới.'}
          </Notice>
          {list.length ? <T style={styles.count}>{list.length} gói</T> : null}
        </View>
      }
      renderItem={({ item }) => (
        <View style={{ gap: 6 }}>
          <TenderRow tender={item} watched onPress={() => router.push({ pathname: '/goi/[key]', params: { key: item.key } })} />
          <T style={styles.meta}>
            {item.reminderIds?.length ? `🔔 ${item.reminderIds.length} lời nhắc đã hẹn` : '🔕 Chưa hẹn lời nhắc (đã qua các mốc, hoặc chưa cho phép thông báo)'}
            {item.previousCloseDate ? ` · hạn cũ ${formatDateTimeVn(item.previousCloseDate)}` : ''}
          </T>
        </View>
      )}
      ItemSeparatorComponent={() => <View style={{ height: space.lg }} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <T weight="semibold" style={styles.emptyTitle}>Chưa theo dõi gói nào</T>
          <T style={styles.emptyText}>Ở danh sách kết quả, bấm vào một gói rồi chọn "Theo dõi & nhắc hạn".</T>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 40 },
  count: { fontSize: size.sm, color: color.subtle },
  meta: { fontSize: size.xs, color: color.subtle, paddingHorizontal: 4 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: size.lg, color: color.ink },
  emptyText: { fontSize: size.base, color: color.muted, textAlign: 'center', lineHeight: 22 }
});
