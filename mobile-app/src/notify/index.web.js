/* Bản web (Safari): trang web không hẹn được thông báo cục bộ. Nhắc hạn trên
 * Safari làm bằng LỊCH iPhone (tệp .ics có 3 lời nhắc) — xem egp.calendar(). */
export const REMINDER_KIND = 'calendar';
export function configureNotifications() {}
export async function ensurePermission() { return false; }
export const notificationApi = {
  async schedule() { throw new Error('Trang web không hẹn được thông báo; dùng Thêm vào Lịch.'); },
  async cancel() {},
  async pendingCount() { return 0; }
};
export function onReminderOpened() { return () => {}; }
export async function reminderThatOpenedApp() { return null; }
