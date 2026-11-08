/* ============================================================================
 *  IN ĐƯỜNG DẪN MỞ BẢN THỬ TRONG EXPO GO (dùng trong GitHub Actions)
 *
 *  node scripts/link-ban-thu.mjs <eas-update.json>  >> "$GITHUB_STEP_SUMMARY"
 *
 *  Đọc kết quả `eas update --json` + app.json (projectId do `eas init` ghi),
 *  in ra Markdown: mã QR (quét bằng camera iPhone → mở Expo Go), đường dẫn
 *  exp:// và trang bản cập nhật trên expo.dev. Không in bí mật nào.
 * ========================================================================== */
import fs from 'node:fs';

const file = process.argv[2];
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const updates = (Array.isArray(raw) ? raw : [raw]).filter((u) => u && typeof u === 'object');
const app = JSON.parse(fs.readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
const projectId = app?.extra?.eas?.projectId || '';
const ios = updates.find((u) => String(u.platform || '').toLowerCase() === 'ios') || updates[0] || {};
const groupId = ios.group || ios.groupId || ios.updateGroupId || '';
const runtime = ios.runtimeVersion || '';
const safe = (v) => String(v).replace(/[^A-Za-z0-9:._-]/g, '');

const lines = ['## Bản thử app cho iPhone (Expo Go)', ''];
if (!projectId || !groupId) {
  lines.push('Không đọc được mã dự án hoặc mã nhóm bản cập nhật từ kết quả `eas update`. Xem nhật ký bước "Đăng bản thử".');
  console.log(lines.join('\n'));
  process.exit(1);
}
const qr = `https://qr.expo.dev/eas-update?projectId=${safe(projectId)}&groupId=${safe(groupId)}`;
let deepLink = '';
try {
  const res = await fetch(`${qr}&format=url`);
  if (res.ok) deepLink = (await res.text()).trim();
} catch { /* mạng lỗi: vẫn còn mã QR */ }

lines.push(
  `- Phiên bản chạy: \`${safe(runtime) || 'không rõ'}\` (Expo Go phải là SDK 58)`,
  `- Mã dự án: \`${safe(projectId)}\` · nhóm bản cập nhật: \`${safe(groupId)}\``,
  '',
  '**Cách mở:** trên máy tính mở trang này, rồi dùng **camera iPhone** quét mã QR dưới đây → bấm thông báo "Mở trong Expo Go".',
  '',
  `![Mã QR mở bản thử trong Expo Go](${qr})`,
  ''
);
if (deepLink) lines.push(`Đường dẫn trực tiếp (bấm trên iPhone đã cài Expo Go): \`${deepLink}\``, '');
lines.push('Cách khác: mở Expo Go, đăng nhập đúng tài khoản Expo đã tạo mã EXPO_TOKEN → mục **Projects** → **Giáo Sư Cùi Bắp** → bản mới nhất.');
console.log(lines.join('\n'));
