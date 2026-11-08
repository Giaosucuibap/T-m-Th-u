/* CHI TIẾT GÓI THẦU — thông tin, điểm phù hợp, đối chiếu tiêu chí, theo dõi & nhắc hạn. */
import { useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useApp } from '../../state/AppState';
import { T, Card, Button, Badge, Notice, KeyValue } from '../../ui/kit.js';
import { color, size, space, gateTone, scoreTone } from '../../ui/theme.js';
import { formatVndFull, formatVndShort, formatDateTimeVn, timeLeft } from '../../core/format.js';
import { isEgpUrl } from '../../core/egp/egp-host.js';

export default function TenderDetail() {
  const { key } = useLocalSearchParams();
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const tender = app.findTender(String(key || ''));

  if (!tender) {
    return (
      <View style={styles.missing}>
        <Notice tone="warn" title="Không còn dữ liệu gói này">{'Gói không có trong kết quả gần nhất hay danh sách theo dõi. Hãy tra lại trên màn Tìm gói.'}</Notice>
      </View>
    );
  }

  const watched = Boolean(app.watch[tender.key]);
  const left = timeLeft(tender.closeDate);
  const tone = scoreTone(tender.score || 0);
  const gate = gateTone[tender.filterState] || gateTone.INSUFFICIENT;
  const failed = (tender.filterReasons || []).filter((r) => r.state !== 'MATCH');

  async function onWatch() {
    setBusy(true);
    try {
      const r = await app.toggleWatch(tender);
      if (!r.watched) setNote({ tone: 'info', text: 'Đã bỏ theo dõi và huỷ các lời nhắc của gói này.' });
      else if (r.reminders) setNote({ tone: 'ok', text: `Đã theo dõi. Hẹn ${r.reminders} lời nhắc trước hạn nộp.${r.skipped === 'ios-limit' ? ' (iPhone chỉ giữ tối đa 64 lời nhắc — đã ưu tiên mốc sát hạn.)' : ''}` });
      else if (r.skipped === 'no-permission') setNote({ tone: 'warn', text: 'Đã theo dõi, nhưng chưa được phép gửi thông báo. Vào Cài đặt › Thông báo › Expo Go (hoặc Giáo Sư Cùi Bắp) để bật.' });
      else setNote({ tone: 'info', text: 'Đã theo dõi. Gói đã qua các mốc nhắc (hoặc đã đóng thầu) nên không hẹn lời nhắc.' });
    } finally { setBusy(false); }
  }

  async function onOpenEgp() {
    if (!tender.detailUrl || !isEgpUrl(tender.detailUrl)) { Alert.alert('Chưa có liên kết', 'e-GP chưa cung cấp đường dẫn chi tiết cho gói này.'); return; }
    await WebBrowser.openBrowserAsync(tender.detailUrl, { toolbarColor: color.brand900, controlsColor: color.brand300 });
  }

  function onShare() {
    const lines = [tender.bidName, `${tender.codeLabel || 'Mã'}: ${tender.displayCode}`,
      `Chủ đầu tư: ${tender.investorName || 'chưa rõ'}`, `Giá gói thầu: ${formatVndFull(tender.price)}`,
      `Đóng thầu: ${formatDateTimeVn(tender.closeDate)} (${left.text.toLowerCase()})`, tender.detailUrl].filter(Boolean);
    Share.share({ message: lines.join('\n') }).catch(() => {});
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <View style={styles.head}>
          <View style={[styles.score, { backgroundColor: tone.bg }]}>
            <T weight="bold" style={{ color: tone.fg, fontSize: size.xl }}>{tender.score ?? '–'}</T>
            <T style={{ color: tone.fg, fontSize: 10 }}>điểm</T>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <T weight="semibold" selectable style={styles.title}>{tender.bidName}</T>
            <T style={styles.small}>{tender.recommendation}</T>
          </View>
        </View>
        <View style={styles.badges}>
          <Badge label={left.text} fg={left.state === 'closed' ? color.muted : left.urgent ? color.bad : color.ok} bg={left.state === 'closed' ? color.surface3 : left.urgent ? color.badBg : color.okBg} />
          <Badge label={gate.label} fg={gate.fg} bg={gate.bg} />
          {watched ? <Badge label="★ Đang theo dõi" fg={color.gold} bg={color.warnBg} /> : null}
        </View>
        <T weight="bold" style={styles.price}>{formatVndShort(tender.price)}</T>
        <View style={{ gap: space.sm }}>
          <Button title={watched ? 'Bỏ theo dõi' : 'Theo dõi & nhắc hạn'} kind={watched ? 'secondary' : 'primary'} busy={busy} onPress={onWatch} />
          <View style={styles.row2}>
            <Button title="Mở trên e-GP" kind="secondary" style={{ flex: 1 }} onPress={onOpenEgp} />
            <Button title="Chia sẻ" kind="secondary" style={{ flex: 1 }} onPress={onShare} />
          </View>
        </View>
        {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      </Card>

      <Card>
        <T weight="semibold" style={styles.h2}>Thông tin công khai</T>
        <KeyValue k={tender.codeLabel || 'Mã'} v={tender.displayCode} strong />
        <KeyValue k="Chủ đầu tư" v={tender.investorName || 'Chưa rõ'} />
        {tender.procuringEntityName ? <KeyValue k="Bên mời thầu" v={tender.procuringEntityName} /> : null}
        <KeyValue k="Giá gói thầu" v={formatVndFull(tender.price)} strong />
        <KeyValue k="Thời điểm đóng thầu" v={formatDateTimeVn(tender.closeDate)} strong />
        {tender.previousCloseDate ? <KeyValue k="Hạn cũ (trước khi đổi)" v={formatDateTimeVn(tender.previousCloseDate)} /> : null}
        <KeyValue k="Ngày đăng" v={formatDateTimeVn(tender.publicDate)} />
        <KeyValue k="Địa điểm" v={tender.location || 'Chưa rõ'} />
        {tender.contractType ? <KeyValue k="Loại hợp đồng" v={tender.contractType} /> : null}
        {tender.bidForm ? <KeyValue k="Hình thức" v={`${tender.bidForm}${tender.isInternet === true ? ' · qua mạng' : ''}`} /> : null}
        <T style={styles.small}>Nguồn: Hệ thống mạng đấu thầu quốc gia (e-GP). Hồ sơ chính thức luôn xem trên e-GP.</T>
      </Card>

      <Card>
        <T weight="semibold" style={styles.h2}>Vì sao điểm {tender.score ?? '–'}</T>
        {(tender.reasons || []).map((r) => <T key={r} style={styles.reason}>• {r}</T>)}
        <T style={styles.small}>Điểm phù hợp chấm theo hồ sơ năng lực mặc định (thủy lợi, kênh mương, hồ đập, trạm bơm, hạ tầng; tỉnh ưu tiên Lâm Đồng và lân cận) — cùng công thức với tiện ích Chrome.</T>
      </Card>

      <Card>
        <T weight="semibold" style={styles.h2}>Đối chiếu tiêu chí đã chọn</T>
        <Badge label={gate.label} fg={gate.fg} bg={gate.bg} />
        {failed.length
          ? failed.map((r) => <T key={`${r.field}-${r.reason}`} style={styles.reason}>• {r.label}</T>)
          : <T style={styles.reason}>Khớp mọi tiêu chí của lượt tra.</T>}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 48 },
  missing: { padding: space.lg },
  head: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  score: { width: 60, height: 60, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: size.lg, color: color.ink, lineHeight: 25 },
  small: { fontSize: size.xs, color: color.subtle, lineHeight: 18 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  price: { fontSize: size.xxl, color: color.brand800 },
  row2: { flexDirection: 'row', gap: space.sm },
  h2: { fontSize: size.lg, color: color.ink },
  reason: { fontSize: size.base, color: color.text2, lineHeight: 22 }
});
