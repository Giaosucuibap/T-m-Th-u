/* Các khối giao diện dùng chung. Chữ tối thiểu 13,5pt, vùng bấm ≥ 44pt (chuẩn Apple). */
import { Pressable, StyleSheet, Text, TextInput, View, ActivityIndicator } from 'react-native';
import { color, font, size, radius, space, shadow, gateTone, scoreTone } from './theme.js';
import { formatVndShort, timeLeft } from '../core/format.js';

export function T({ style, weight = 'regular', children, ...rest }) {
  return <Text {...rest} style={[styles.text, { fontFamily: font[weight] || font.regular }, style]}>{children}</Text>;
}

export function Card({ style, children, ...rest }) {
  return <View {...rest} style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }) {
  return (
    <View style={styles.sectionRow}>
      <T weight="semibold" style={styles.sectionTitle}>{children}</T>
      {right}
    </View>
  );
}

export function Button({ title, onPress, kind = 'primary', disabled, busy, icon, style, accessibilityLabel }) {
  const k = BUTTON[kind] || BUTTON.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || title} disabled={disabled || busy} onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: k.bg, borderColor: k.line }, (disabled || busy) && styles.disabled, pressed && styles.pressed, style]}>
      {busy ? <ActivityIndicator color={k.fg} /> : null}
      {icon && !busy ? <T style={{ color: k.fg, fontSize: size.md }}>{icon}</T> : null}
      <T weight="semibold" style={{ color: k.fg, fontSize: size.base }}>{title}</T>
    </Pressable>
  );
}
const BUTTON = {
  primary: { bg: color.brand700, fg: '#ffffff', line: color.brand700 },
  secondary: { bg: color.surface, fg: color.brand800, line: color.lineStrong },
  danger: { bg: color.surface, fg: color.bad, line: color.badLine },
  quiet: { bg: 'transparent', fg: color.brand700, line: 'transparent' }
};

export function Chip({ label, active, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: Boolean(active) }} onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}>
      <T weight={active ? 'semibold' : 'medium'} style={[styles.chipText, active && styles.chipTextActive]}>{label}</T>
    </Pressable>
  );
}

export function Field({ label, hint, error, ...input }) {
  return (
    <View style={styles.field}>
      <T weight="medium" style={styles.fieldLabel}>{label}</T>
      <TextInput placeholderTextColor={color.subtle} autoCorrect={false} {...input}
        style={[styles.input, error && { borderColor: color.bad }]} />
      {error ? <T style={styles.fieldError}>{error}</T> : hint ? <T style={styles.fieldHint}>{hint}</T> : null}
    </View>
  );
}

export function Badge({ label, fg = color.text2, bg = color.surface3, style }) {
  return <View style={[styles.badge, { backgroundColor: bg }, style]}><T weight="semibold" style={[styles.badgeText, { color: fg }]}>{label}</T></View>;
}

export function Notice({ tone = 'info', title, children }) {
  const t = { info: [color.info, color.infoBg, color.infoLine], warn: [color.warn, color.warnBg, color.warnLine], bad: [color.bad, color.badBg, color.badLine], ok: [color.ok, color.okBg, color.okLine] }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t[1], borderColor: t[2] }]}>
      {title ? <T weight="semibold" style={{ color: t[0], fontSize: size.sm }}>{title}</T> : null}
      {typeof children === 'string' ? <T style={{ color: t[0], fontSize: size.sm, lineHeight: 20 }}>{children}</T> : children}
    </View>
  );
}

export function ProgressBar({ value }) {
  const pct = Number.isFinite(value) ? Math.max(0.04, Math.min(1, value)) : null;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, pct === null ? styles.fillUnknown : { width: `${pct * 100}%` }]} />
    </View>
  );
}

/** Một dòng gói thầu trong danh sách: tên, mã, chủ đầu tư, giá, hạn nộp, điểm. */
export function TenderRow({ tender, onPress, watched, now = Date.now() }) {
  const left = timeLeft(tender.closeDate, now);
  const tone = scoreTone(tender.score || 0);
  const gate = gateTone[tender.filterState];
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.rowTop}>
        <View style={[styles.score, { backgroundColor: tone.bg }]}>
          <T weight="bold" style={{ color: tone.fg, fontSize: size.md }}>{tender.score ?? '–'}</T>
        </View>
        <View style={{ flex: 1 }}>
          <T weight="semibold" numberOfLines={3} style={styles.rowTitle}>{tender.bidName}</T>
          <T numberOfLines={1} style={styles.rowMeta}>{tender.investorName || tender.procuringEntityName || 'Chưa rõ chủ đầu tư'}</T>
        </View>
      </View>
      <View style={styles.rowBottom}>
        <T weight="semibold" style={styles.price}>{formatVndShort(tender.price)}</T>
        <Badge label={left.text} fg={left.state === 'closed' ? color.muted : left.urgent ? color.bad : color.ok}
          bg={left.state === 'closed' ? color.surface3 : left.urgent ? color.badBg : color.okBg} />
        {gate && tender.filterState !== 'MATCH' ? <Badge label={gate.label} fg={gate.fg} bg={gate.bg} /> : null}
        {watched ? <Badge label="★ Theo dõi" fg={color.gold} bg={color.warnBg} /> : null}
      </View>
      <T style={styles.code}>{tender.displayCode}{tender.location ? ` · ${tender.location}` : ''}</T>
    </Pressable>
  );
}

export function KeyValue({ k, v, strong }) {
  return (
    <View style={styles.kv}>
      <T style={styles.kvKey}>{k}</T>
      <T weight={strong ? 'semibold' : 'regular'} selectable style={styles.kvValue}>{v}</T>
    </View>
  );
}

export const styles = StyleSheet.create({
  text: { color: color.text, fontSize: size.base },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, padding: space.lg, gap: space.md, ...shadow.card },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  sectionTitle: { fontSize: size.lg, color: color.ink },
  button: { minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.75 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.surface, justifyContent: 'center' },
  chipActive: { backgroundColor: color.brand700, borderColor: color.brand700 },
  chipText: { fontSize: size.sm, color: color.text2 },
  chipTextActive: { color: '#ffffff' },
  field: { gap: 6 },
  fieldLabel: { fontSize: size.sm, color: color.text2 },
  input: { minHeight: 48, borderWidth: 1, borderColor: color.lineStrong, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: size.md, color: color.ink, backgroundColor: color.surface, fontFamily: font.regular },
  fieldHint: { fontSize: size.xs, color: color.subtle },
  fieldError: { fontSize: size.xs, color: color.bad },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { fontSize: size.xs },
  notice: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: 4 },
  track: { height: 8, borderRadius: 4, backgroundColor: color.surface3, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: color.brand600 },
  fillUnknown: { width: '35%', opacity: 0.6 },
  row: { backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, padding: space.md, gap: space.sm, ...shadow.card },
  rowTop: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  score: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: size.base, color: color.ink, lineHeight: 21 },
  rowMeta: { fontSize: size.sm, color: color.muted, marginTop: 2 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  price: { fontSize: size.md, color: color.brand800 },
  code: { fontSize: size.xs, color: color.subtle },
  kv: { gap: 2, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  kvKey: { fontSize: size.xs, color: color.subtle },
  kvValue: { fontSize: size.base, color: color.ink }
});
