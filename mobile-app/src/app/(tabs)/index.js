/* MÀN HÌNH TÌM GÓI THẦU — tiêu chí → tra trên e-GP → danh sách đã chấm điểm. */
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useEgp, PLATFORM_NOTE } from '../../egp/EgpProvider';
import { useApp } from '../../state/AppState';
import { T, Card, Button, Chip, Field, Badge, Notice, ProgressBar, TenderRow } from '../../ui/kit.js';
import { color, size, space, radius } from '../../ui/theme.js';
import { ago, criteriaSummary } from '../../core/format.js';

const PROVINCE_CHIPS = ['Lâm Đồng', 'Đồng Nai', 'Khánh Hòa', 'Đắk Lắk', 'Gia Lai', 'Quảng Ngãi'];
const CATEGORY_CHIPS = [['', 'Tất cả'], ['XL', 'Xây lắp'], ['TV', 'Tư vấn'], ['HH', 'Hàng hóa'], ['PTV', 'Phi tư vấn'], ['HON_HOP', 'Hỗn hợp']];
const EMPTY_FORM = Object.freeze({ province: 'Lâm Đồng', category: 'XL', keyword: '', investor: '', minPrice: '', maxPrice: '', mustKeywords: '', excludeKeywords: '' });

const STATUS = {
  SUCCESS: { label: 'Đã lấy đủ', fg: color.ok, bg: color.okBg },
  PARTIAL: { label: 'Chưa đầy đủ', fg: color.warn, bg: color.warnBg },
  CANCELLED: { label: 'Đã dừng', fg: color.muted, bg: color.surface3 },
  ERROR: { label: 'Không thành công', fg: color.bad, bg: color.badBg }
};

function PageStatus({ egp }) {
  const tone = { ready: [color.ok, 'Sẵn sàng'], loading: [color.gold, 'Đang mở'], error: [color.bad, 'Có lỗi'] }[egp.page.state] || [color.subtle, '—'];
  return (
    <View style={styles.status}>
      <View style={[styles.dot, { backgroundColor: tone[0] }]} />
      <T style={styles.statusText} numberOfLines={2}><T weight="semibold" style={styles.statusText}>e-GP: {tone[1]}</T>{egp.page.state === 'error' ? ` — ${egp.page.message}` : ''}</T>
      {egp.mode === 'live' ? (
        <Pressable accessibilityRole="button" onPress={() => egp.showPage(true)} hitSlop={10}>
          <T weight="semibold" style={styles.link}>Xem trang</T>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function SearchScreen() {
  const egp = useEgp();
  const app = useApp();
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState('MATCH');

  // Nạp tiêu chí lần trước (hoặc tiêu chí chọn lại từ Lịch sử ở màn Thông tin).
  useEffect(() => {
    if (!app.ready || !app.form) return;
    setForm((cur) => ({ ...EMPTY_FORM, ...app.form }));
    if (app.form.investor || app.form.mustKeywords || app.form.excludeKeywords) setAdvanced(true);
  }, [app.ready, app.form]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const result = app.last;
  const tenders = useMemo(() => {
    const list = result?.tenders || [];
    return view === 'MATCH' ? list.filter((t) => t.filterState === 'MATCH') : list;
  }, [result, view]);

  async function onSearch() {
    Keyboard.dismiss();
    setError(null);
    await app.saveForm(form);
    const r = await egp.run(form);
    if (r.status === 'INVALID' || r.status === 'BUSY') { setError({ field: r.field, message: r.message }); return; }
    await app.saveResult(r);
    setView(r.counts?.match ? 'MATCH' : 'ALL');
    if (r.status === 'ERROR') setError({ message: r.message });
  }

  const p = egp.progress;
  const pct = p && p.totalPages ? p.pagesRead / Math.min(p.totalPages, 20) : null;
  const status = result ? STATUS[result.status] || STATUS.ERROR : null;

  const header = (
    <View style={{ gap: space.lg }}>
      <PageStatus egp={egp} />
      <Card>
        <T weight="semibold" style={styles.h2}>Tiêu chí</T>
        <View style={{ gap: space.sm }}>
          <Field label="Tỉnh/thành" value={form.province} onChangeText={set('province')} placeholder="Ví dụ: Lâm Đồng; Khánh Hòa"
            error={error?.field === 'province' ? error.message : null} hint="Nhiều tỉnh cách nhau bằng dấu chấm phẩy. Bỏ trống = toàn quốc." />
          <View style={styles.chips}>
            {PROVINCE_CHIPS.map((name) => <Chip key={name} label={name} active={form.province.trim() === name} onPress={() => set('province')(name)} />)}
          </View>
        </View>
        <View style={{ gap: space.sm }}>
          <T weight="medium" style={styles.label}>Loại gói thầu</T>
          <View style={styles.chips}>
            {CATEGORY_CHIPS.map(([value, label]) => <Chip key={value || 'all'} label={label} active={form.category === value} onPress={() => set('category')(value)} />)}
          </View>
        </View>
        <Field label="Từ khóa trong tên gói" value={form.keyword} onChangeText={set('keyword')} placeholder="Ví dụ: kênh mương, hồ chứa, IB2600…"
          returnKeyType="search" onSubmitEditing={onSearch} error={error?.field === 'keyword' ? error.message : null} />
        <View style={styles.row2}>
          <View style={{ flex: 1 }}><Field label="Giá từ" value={form.minPrice} onChangeText={set('minPrice')} placeholder="3 tỷ" error={error?.field === 'minPrice' ? error.message : null} /></View>
          <View style={{ flex: 1 }}><Field label="Giá đến" value={form.maxPrice} onChangeText={set('maxPrice')} placeholder="50 tỷ" error={error?.field === 'maxPrice' ? error.message : null} /></View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setAdvanced((v) => !v)} style={styles.toggle}>
          <T weight="semibold" style={styles.link}>{advanced ? '▾ Ẩn tiêu chí nâng cao' : '▸ Tiêu chí nâng cao (chủ đầu tư, bắt buộc, loại trừ)'}</T>
        </Pressable>
        {advanced ? (
          <View style={{ gap: space.md }}>
            <Field label="Chủ đầu tư / bên mời thầu" value={form.investor} onChangeText={set('investor')} placeholder="Tên hoặc mã; nhiều đơn vị cách nhau bằng ;"
              error={error?.field === 'investor' ? error.message : null} />
            <Field label="Bắt buộc có trong tên gói" value={form.mustKeywords} onChangeText={set('mustKeywords')} placeholder="Ví dụ: thủy lợi" />
            <Field label="Loại trừ nếu tên gói có" value={form.excludeKeywords} onChangeText={set('excludeKeywords')} placeholder="Ví dụ: tư vấn, thiết bị" />
          </View>
        ) : null}
        {error && !error.field ? <Notice tone="bad">{error.message}</Notice> : null}
        {egp.running
          ? <Button title="Dừng tra cứu" kind="danger" onPress={() => egp.cancel()} />
          : <Button title="Tìm trên e-GP" icon="⌕" onPress={onSearch} />}
      </Card>

      {egp.running && p ? (
        <Card style={{ borderColor: color.brand100 }}>
          <T weight="semibold" style={styles.h2}>Đang tra cứu trên e-GP</T>
          <T style={styles.muted}>{p.message}</T>
          <ProgressBar value={pct} />
          <T style={styles.small}>{PLATFORM_NOTE}</T>
        </Card>
      ) : null}

      {result && !egp.running ? (
        <Card>
          <View style={styles.resultHead}>
            <Badge label={status.label} fg={status.fg} bg={status.bg} />
            <T style={styles.small}>{ago(result.finishedAt)}</T>
          </View>
          <T weight="semibold" style={styles.resultTitle}>{criteriaSummary(result.criteria)}</T>
          <View style={styles.counts}>
            <Count n={result.counts?.match} label="khớp tiêu chí" tone={color.ok} />
            <Count n={result.counts?.insufficient} label="thiếu dữ liệu" tone={color.warn} />
            <Count n={result.counts?.outOfRange} label="ngoài tiêu chí" tone={color.muted} />
          </View>
          <T style={styles.small}>{result.coverage?.text}</T>
          {(result.notes || []).map((n) => <Notice key={n} tone="warn">{n}</Notice>)}
          {(result.closeDateChanges || []).length ? <Notice tone="info" title="Gói đang theo dõi đổi hạn nộp">{`${result.closeDateChanges.length} gói có hạn nộp mới — lời nhắc đã được hẹn lại.`}</Notice> : null}
          {result.tenders?.length ? (
            <View style={styles.segment}>
              <Seg active={view === 'MATCH'} label={`Khớp tiêu chí (${result.counts?.match ?? 0})`} onPress={() => setView('MATCH')} />
              <Seg active={view === 'ALL'} label={`Tất cả (${result.tenders.length})`} onPress={() => setView('ALL')} />
            </View>
          ) : null}
        </Card>
      ) : null}

      {!result && !egp.running ? (
        <Notice tone="info" title="Cách dùng">
          {'Chọn tỉnh và loại gói rồi bấm "Tìm trên e-GP". App mở trang tra cứu chính thức của e-GP ngay trong máy, gắn tiêu chí vào chính yêu cầu tìm kiếm của trang, rồi chấm điểm từng gói theo năng lực Trường An. Bấm vào gói để xem chi tiết và bật nhắc hạn nộp.'}
        </Notice>
      ) : null}
    </View>
  );

  return (
    <FlatList
      data={egp.running ? [] : tenders}
      keyExtractor={(t) => t.key}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={{ marginBottom: space.md }}
      renderItem={({ item }) => <TenderRow tender={item} watched={Boolean(app.watch[item.key])} onPress={() => router.push({ pathname: '/goi/[key]', params: { key: item.key } })} />}
      ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
      ListEmptyComponent={result && !egp.running && result.tenders?.length && view === 'MATCH'
        ? <Notice tone="info">{'Không có gói nào khớp đủ tiêu chí. Bấm "Tất cả" để xem các gói e-GP trả về kèm lý do không khớp.'}</Notice> : null}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    />
  );
}

function Count({ n, label, tone }) {
  return (
    <View style={styles.count}>
      <T weight="bold" style={[styles.countN, { color: tone }]}>{n ?? 0}</T>
      <T style={styles.small}>{label}</T>
    </View>
  );
}

function Seg({ active, label, onPress }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.seg, active && styles.segActive]}>
      <T weight={active ? 'semibold' : 'medium'} style={[styles.segText, active && { color: color.brand800 }]}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 40 },
  h2: { fontSize: size.lg, color: color.ink },
  label: { fontSize: size.sm, color: color.text2 },
  muted: { fontSize: size.base, color: color.text2 },
  small: { fontSize: size.xs, color: color.subtle, lineHeight: 18 },
  link: { color: color.brand700, fontSize: size.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row2: { flexDirection: 'row', gap: space.md },
  toggle: { minHeight: 40, justifyContent: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: color.line, paddingHorizontal: space.md, paddingVertical: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { flex: 1, fontSize: size.sm, color: color.text2 },
  resultHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultTitle: { fontSize: size.md, color: color.ink },
  counts: { flexDirection: 'row', gap: space.sm },
  count: { flex: 1, backgroundColor: color.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: color.line, paddingVertical: 10, alignItems: 'center' },
  countN: { fontSize: size.xl },
  segment: { flexDirection: 'row', backgroundColor: color.surface3, borderRadius: radius.md, padding: 4, gap: 4 },
  seg: { flex: 1, minHeight: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line },
  segText: { fontSize: size.sm, color: color.muted }
});
