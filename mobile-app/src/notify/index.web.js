/* Bản web xem trước: không hẹn thông báo thật, chỉ giả lập để giao diện chạy đủ. */
let seq = 0;
export function configureNotifications() {}
export async function ensurePermission() { return true; }
export const notificationApi = {
  async schedule() { seq += 1; return `web-${seq}`; },
  async cancel() {},
  async pendingCount() { return 0; }
};
export function onReminderOpened() { return () => {}; }
export async function reminderThatOpenedApp() { return null; }
