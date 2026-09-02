import {
  parseMoney,
  parseDate,
  normalizeVersion,
  extractCandidateObjects,
  normalizeCandidate,
  scoreTender,
  DEFAULT_SETTINGS
} from './lib/core.js';
import { redactSettings } from './lib/redact.js';

const $ = (id) => document.getElementById(id);
const msg = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });

let state;

function esc(v) {
  return String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

async function load() {
  state = await msg('GET_STATE');
  $('summary').innerHTML = `<h2>Giáo Sư Cùi Bắp ${esc(state.manifest.version)}</h2>
    <p><b>Extension ID:</b> ${esc(state.extensionId)}</p>
    <p><b>Dữ liệu:</b> ${state.tenders.length} gói · ${state.runs.length} lượt quét</p>
    <p><b>Bộ lọc:</b> ${state.template ? 'Đã lưu' : 'Chưa lưu'} · <b>Bộ lọc vừa quan sát:</b> ${state.lastTemplate ? 'Có' : 'Chưa có'}</p>
    <p><b>Lịch:</b> ${state.alarm ? new Date(state.alarm.scheduledTime).toLocaleString('vi-VN') : 'Tắt'}</p>`;
  $('runs').innerHTML = state.runs.slice(0, 20)
    .map((r) => `<p><span class="pill">${esc(r.status)}</span> ${esc(r.message)}
      <span class="muted small">${new Date(r.startedAt).toLocaleString('vi-VN')}</span></p>`)
    .join('') || '<p class="muted">Chưa có.</p>';
}

$('test').onclick = () => {
  const sample = {
    notifyNo: 'IB2600123456',
    notifyVersion: 1,
    bidName: 'Thi công nâng cấp hồ chứa tại Lâm Đồng',
    investField: 'Xây lắp',
    bidPrice: '68.500.000.000',
    bidCloseDate: '20/08/2026 09:00'
  };
  const cand = normalizeCandidate(sample, { sourcePageUrl: 'https://muasamcong.mpi.gov.vn/' });
  const score = scoreTender(cand, DEFAULT_SETTINGS);
  const tests = {
    money: parseMoney('68.500.000.000 đồng') === 68500000000,
    date: Boolean(parseDate('20/08/2026 09:00')),
    version: normalizeVersion(1) === '01',
    extract: extractCandidateObjects({ content: [sample] }).length === 1,
    normalize: cand?.notifyNo === 'IB2600123456',
    score: score.score > 0
  };
  $('result').textContent = JSON.stringify(tests, null, 2);
};

$('export').onclick = async () => {
  const safe = redactSettings(state.settings);
  const payload = {
    version: state.manifest.version,
    extensionId: state.extensionId,
    exportedAt: new Date().toISOString(),
    _luuY: 'Tep nay da che bi mat (Bot Token, Chat ID). An toan de gui di.',
    _daChe: safe.redacted,
    settings: safe.settings,
    template: state.template ? { ...state.template, body: '[đã ẩn trong file chẩn đoán]' } : null,
    lastTemplate: state.lastTemplate ? { ...state.lastTemplate, body: '[đã ẩn]' } : null,
    runs: state.runs.slice(0, 50),
    counts: { tenders: state.tenders.length }
  };
  const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
  chrome.downloads.download({ url, filename: 'GiaoSuCuiBap/diagnostic.json', saveAs: true });
  $('result').textContent = safe.redacted.length
    ? `Da che ${safe.redacted.length} truong bi mat truoc khi xuat: ${safe.redacted.join(', ')} - Tep nay an toan de gui cho nguoi ho tro.`
    : 'Khong co truong bi mat nao trong cau hinh. Tep an toan de gui di.';
};

load();

/* ==========================================================================
 *  BẢN ĐỒ ENDPOINT e-GP
 *
 *  Mấy vòng sửa vừa rồi tốn thời gian vì tôi ĐOÁN e-GP để dữ liệu ở đâu, và
 *  đoán sai liên tục. Bảng này thay việc đoán bằng việc ghi lại: người dùng
 *  thao tác bình thường, phần mềm ghi đường dẫn và tên trường của mọi phản
 *  hồi JSON. Chỉ hình dạng, không nội dung.
 * ======================================================================== */

function epRender(list) {
  const box = document.getElementById('endpoints');
  if (!list.length) {
    box.innerHTML = '<div class="muted small">Chưa ghi được gì. Mở e-GP, thao tác một lượt, '
      + 'rồi quay lại bấm ↻ Làm mới.</div>';
    return;
  }
  box.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr>
      <th style="text-align:left;padding:6px 8px">Đường dẫn</th>
      <th style="text-align:left;padding:6px 8px">PT</th>
      <th style="text-align:right;padding:6px 8px">Bản ghi</th>
      <th style="text-align:left;padding:6px 8px">Các trường trong phản hồi</th>
    </tr></thead>
    <tbody>${list.map((r) => `<tr style="border-top:1px solid #e2e8f0">
      <td style="padding:6px 8px;font-family:ui-monospace,Consolas,monospace">${esc(r.path)}</td>
      <td style="padding:6px 8px">${esc(r.method)} · ${r.status}</td>
      <td style="padding:6px 8px;text-align:right">${r.soBanGhi == null ? '—' : r.soBanGhi}</td>
      <td style="padding:6px 8px;color:#475569">${esc((r.truong || []).join(', ')) || '—'}</td>
    </tr>`).join('')}</tbody></table>`;
}

async function epLoad() {
  const s = await msg('GET_STATE');
  const list = (s && s.endpointMap) || [];
  document.getElementById('epMsg').textContent =
    list.length ? `Đã ghi ${list.length} endpoint.` : '';
  epRender(list);
  return list;
}

document.getElementById('epRefresh').onclick = epLoad;

document.getElementById('epClear').onclick = async () => {
  await msg('CLEAR_ENDPOINT_MAP');
  epLoad();
};

document.getElementById('epCopy').onclick = async () => {
  const list = await epLoad();
  const text = list.map((r) => `${r.method} ${r.path} [${r.status}] `
    + `${r.kieu}${r.soBanGhi == null ? '' : '(' + r.soBanGhi + ')'} `
    + `truong: ${(r.truong || []).join(', ')}`).join('\n');
  try {
    await navigator.clipboard.writeText(text || '(trống)');
    document.getElementById('epMsg').textContent = '✅ Đã chép. Dán vào chỗ trao đổi để gửi đi.';
  } catch {
    document.getElementById('epMsg').textContent = 'Không chép được — hãy bôi đen bảng rồi chép tay.';
  }
};

epLoad();
