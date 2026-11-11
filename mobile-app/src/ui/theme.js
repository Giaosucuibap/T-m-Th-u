/* Hệ thống thiết kế của app — cùng bảng màu và phông chữ với tiện ích Chrome
 * (theme.css): xanh ngọc đậm gần màu nước/thủy lợi, chữ Be Vietnam Pro. */
export const color = Object.freeze({
  brand950: '#05211e', brand900: '#0a2f2b', brand800: '#0c4039', brand700: '#0f766e', brand600: '#11867c',
  brand300: '#5eead4', brand100: '#ccefe8', brand50: '#ebf7f4',
  ink: '#0b1626', text: '#1e293b', text2: '#334155', muted: '#475569', subtle: '#5b6b7f',
  bg: '#f3f5f8', surface: '#ffffff', surface2: '#f8fafc', surface3: '#eef2f6',
  line: '#e2e8f0', lineStrong: '#cbd5e1',
  ok: '#166534', okBg: '#dcfce7', okLine: '#86efac',
  warn: '#92400e', warnBg: '#fef3c7', warnLine: '#fcd34d',
  bad: '#b42318', badBg: '#fee4e2', badLine: '#fca5a5',
  info: '#1e40af', infoBg: '#e0ecff', infoLine: '#a5c4fd',
  gold: '#a16207'
});

export const font = Object.freeze({
  regular: 'BeVietnamPro_400Regular',
  medium: 'BeVietnamPro_500Medium',
  semibold: 'BeVietnamPro_600SemiBold',
  bold: 'BeVietnamPro_700Bold'
});

export const size = Object.freeze({ xs: 12.5, sm: 13.5, base: 15, md: 16, lg: 18, xl: 22, xxl: 28 });
export const radius = Object.freeze({ sm: 8, md: 12, lg: 16, pill: 999 });
export const space = Object.freeze({ xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 });

export const shadow = Object.freeze({
  card: { shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 2 }
});

/** Màu nhãn theo trạng thái đối chiếu tiêu chí (lib/match-gate.js). */
export const gateTone = Object.freeze({
  MATCH: { fg: color.ok, bg: color.okBg, line: color.okLine, label: 'Khớp tiêu chí' },
  INSUFFICIENT: { fg: color.warn, bg: color.warnBg, line: color.warnLine, label: 'Chưa đủ dữ liệu' },
  OUT_OF_RANGE: { fg: color.muted, bg: color.surface3, line: color.line, label: 'Ngoài tiêu chí' }
});

/** Màu điểm phù hợp — cùng ngưỡng với scoreTender(): 85 / 70 / 55. */
export function scoreTone(score) {
  if (score >= 85) return { fg: '#ffffff', bg: color.brand700 };
  if (score >= 70) return { fg: color.brand800, bg: color.brand100 };
  if (score >= 55) return { fg: color.info, bg: color.infoBg };
  return { fg: color.muted, bg: color.surface3 };
}
