/* ============================================================================
 *  SAO LƯU TỰ ĐỘNG LÊN TELEGRAM — phần có trạng thái (4.22.0)
 *
 *  Gọi từ ba chỗ: nút "Gửi bản sao lưu ngay" ở Cấu hình (force), lúc phần mềm khởi
 *  động, và nhịp 30 phút sẵn có. Mỗi lần chỉ một lượt chạy; kết quả lần gần nhất nằm
 *  ở kho cục bộ của trình duyệt (khoá telegramBackup) để trang Cấu hình hiển thị.
 * ========================================================================== */
import { backupDecision, backupFingerprint, backupCaption, backupReasonText, packBackup, fileSizeText, BACKUP_STATE_KEY } from './telegram-backup.js';

export function createBackupRuntime({ getState, local, backupObject, sendDocument, now = () => Date.now() }) {
  let running = null;

  async function readLast() {
    const data = await local.get({ [BACKUP_STATE_KEY]: {} });
    const last = data[BACKUP_STATE_KEY];
    return last && typeof last === 'object' && !Array.isArray(last) ? last : {};
  }

  async function attempt({ force = false } = {}) {
    const s = await getState();
    const settings = s.settings || {};
    const configured = Boolean(String(settings.telegramBotToken || '').trim() && String(settings.telegramChatId || '').trim());
    const last = await readLast();
    const base = { enabled: settings.telegramBackupDaily === true, configured, readOnly: Boolean(settings.readOnlyMode), last, now: now(), force };
    // Lượt xét rẻ trước (không dựng tệp): tắt, chưa cấu hình, vừa gửi hôm nay…
    const early = backupDecision(base);
    if (!early.send) return { ok: false, skipped: true, reason: early.reason, message: backupReasonText(early.reason), last };

    const payload = await backupObject();
    const fingerprint = backupFingerprint(payload);
    const decision = backupDecision({ ...base, fingerprint });
    const stamp = new Date(now()).toISOString();
    if (!decision.send) {
      const next = { ...last, attemptAt: stamp, result: decision.reason, message: backupReasonText(decision.reason) };
      await local.set({ [BACKUP_STATE_KEY]: next });
      return { ok: false, skipped: true, reason: decision.reason, message: next.message, last: next };
    }
    const file = await packBackup(payload, { now: now() });
    if (file.error) {
      const next = { ...last, attemptAt: stamp, result: file.error, message: backupReasonText(file.error) };
      await local.set({ [BACKUP_STATE_KEY]: next });
      return { ok: false, reason: file.error, message: next.message, last: next };
    }
    const sent = await sendDocument(settings, { bytes: file.bytes, filename: file.filename, mime: file.mime, caption: backupCaption(payload, now()) }, { kind: 'backup' });
    const next = sent?.ok
      ? { okAt: stamp, attemptAt: stamp, fingerprint, bytes: file.bytes.byteLength, file: file.filename, gz: file.gz, result: 'ok',
        message: `Đã gửi ${file.filename} (${fileSizeText(file.bytes.byteLength)}) vào Telegram.` }
      : { ...last, attemptAt: stamp, result: 'error', message: String(sent?.message || 'Không gửi được tệp sao lưu.').slice(0, 300) };
    await local.set({ [BACKUP_STATE_KEY]: next });
    return { ok: Boolean(sent?.ok), reason: decision.reason, message: next.message, last: next };
  }

  /** Chạy một lượt; lượt đang chạy thì dùng chung kết quả, không gửi hai tệp. */
  function run(options = {}) {
    if (!running) running = attempt(options).finally(() => { running = null; });
    return running;
  }

  async function status() {
    const s = await getState();
    const settings = s.settings || {};
    return { ok: true, enabled: settings.telegramBackupDaily === true,
      configured: Boolean(String(settings.telegramBotToken || '').trim() && String(settings.telegramChatId || '').trim()),
      last: await readLast() };
  }

  return { run, status };
}
