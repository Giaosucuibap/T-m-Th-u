/* Thông báo cục bộ (nhắc hạn nộp hồ sơ) qua expo-notifications. Không dùng
 * thông báo đẩy từ máy chủ: mọi lời nhắc được hẹn sẵn ngay trên điện thoại. */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const REMINDER_KIND = 'local';
const CHANNEL = 'han-nop';
let configured = false;

export function configureNotifications() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false })
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Nhắc hạn nộp hồ sơ', importance: Notifications.AndroidImportance.HIGH }).catch(() => {});
  }
}

/** Xin quyền gửi thông báo đúng lúc người dùng bấm "Theo dõi" lần đầu. */
export async function ensurePermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return Boolean(asked.granted);
}

export const notificationApi = {
  async schedule({ title, body, data, at }) {
    return Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}) }
    });
  },
  async cancel(id) { await Notifications.cancelScheduledNotificationAsync(id); },
  async pendingCount() { return (await Notifications.getAllScheduledNotificationsAsync()).length; }
};

const tenderKeyOf = (response) => {
  const key = response?.notification?.request?.content?.data?.tenderKey;
  return key ? String(key) : null;
};

/** Bấm vào lời nhắc → mở đúng gói thầu. Trả về hàm huỷ đăng ký. */
export function onReminderOpened(handler) {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const key = tenderKeyOf(response);
    if (key) handler(key);
  });
  return () => sub.remove();
}

/** App đang tắt hẳn mà người dùng bấm lời nhắc: lấy lời nhắc đã mở app. */
export async function reminderThatOpenedApp() {
  try { return tenderKeyOf(await Notifications.getLastNotificationResponseAsync()); } catch { return null; }
}
