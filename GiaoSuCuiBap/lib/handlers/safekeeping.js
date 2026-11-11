/* Giữ dữ liệu an toàn (4.22.0): sao lưu tự động lên Telegram. Xem lib/runtime-backup.js. */
export function safekeepingHandlers({ backupRuntime }) {
  return {
    TELEGRAM_BACKUP_STATUS: async () => backupRuntime.status(),
    TELEGRAM_BACKUP_NOW: async () => backupRuntime.run({ force: true })
  };
}
