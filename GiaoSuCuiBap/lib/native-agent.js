import { looksLikeFileId, safeDownloadName } from './attachments.js';

export const NATIVE_HOST = 'vn.giaosucuibap.hsmt';

/** Only extension pages can reach this bridge; the native host accepts two commands. */
export function createNativeAgent({ runtime = chrome.runtime } = {}) {
  const call = async message => {
    try {
      // A native port keeps the MV3 worker alive for the duration of a download.
      const result = await new Promise((resolve, reject) => {
        const port = runtime.connectNative(NATIVE_HOST);
        let settled = false;
        port.onMessage.addListener(reply => { if (!settled) { settled = true; resolve(reply); port.disconnect(); } });
        port.onDisconnect.addListener(() => { const error = runtime.lastError; if (!settled) { settled = true; reject(new Error(error?.message || 'Native host disconnected')); } });
        port.postMessage(message);
      });
      if (!result || typeof result.ok !== 'boolean') return { ok: false, code: 'INVALID_REPLY', message: 'Cầu nối trả phản hồi không hợp lệ.' };
      return result;
    } catch {
      return { ok: false, installed: false, code: 'HOST_UNAVAILABLE', message: 'Chưa kết nối được cầu nối E-HSMT. Mở hướng dẫn cài cầu nối native messaging.' };
    }
  };
  return {
    async agentStatus() {
      const result = await call({ command: 'ping' });
      return { ...result, transport: 'native', installed: result.installed ?? result.code !== 'HOST_UNAVAILABLE', running: Boolean(result.upstream), reachable: Boolean(result.upstream),
        message: result.message || (result.upstream ? 'Cầu nối và phần mềm hỗ trợ e-GP đang phản hồi.' : 'Cầu nối đã cài; hãy mở phần mềm hỗ trợ e-GP để tải hồ sơ.') };
    },
    async downloadAttachments(payload = {}) {
      const files = Array.isArray(payload.files) ? payload.files : (Array.isArray(payload.attachments) ? payload.attachments : []);
      if (files.length > 100) return { ok: false, downloaded: 0, failed: [], message: 'Mỗi lượt tải tối đa 100 tệp. Hãy chia thành các lượt nhỏ hơn.' };
      const results = [];
      for (const file of files.slice(0, 100)) {
        if (!looksLikeFileId(file?.fileId)) { results.push({ ...file, ok: false, message: 'Mã tệp không hợp lệ.' }); continue; }
        const result = await call({ command: 'download', fileId: file.fileId.trim(), fileName: safeDownloadName(file.notifyNo || payload.notifyNo || '', file) });
        results.push({ ...file, ...result, pending: false });
      }
      const downloaded = results.filter(r => r.ok).length;
      const failed = results.filter(r => !r.ok).map(r => ({ file: r.fileName || r.fileId || '', message: r.message }));
      return { ok: results.length > 0 && !failed.length, results, downloaded, failed,
        message: results.length ? `Đã tải ${downloaded}/${results.length} tệp qua cầu nối E-HSMT.${failed.length ? ' ' + failed[0].message : ''}` : 'Không có tệp đính kèm để tải.' };
    }
  };
}
