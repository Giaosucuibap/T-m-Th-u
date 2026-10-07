import {
  parseMoney,
  parseDate,
  normalizeVersion,
  extractCandidateObjects,
  normalizeCandidate,
  scoreTender,
  DEFAULT_SETTINGS
} from './lib/core.js';
import { redactSettings, stripSecretsDeep } from './lib/redact.js';
import { safeRunForBackup } from './lib/backup.js';
import { canaryCheck } from './lib/canary.js';
import { normalizeKhlcntPlan } from './lib/khlcnt.js';
import { dateGate } from './lib/match-gate.js';
import { matchesAreaCodes } from './lib/area-match.js';
import { dateRangeFrom, firstStampMs } from './lib/core.js';

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
  const canary=canaryCheck({tbmt:normalizeCandidate,khlcnt:normalizeKhlcntPlan},parseDate);
  const tests = {
    canary: canary.ok,
    vnDay: dateRangeFrom({fromDate:'2026-06-01',toDate:'2026-06-01'}).from===Date.parse('2026-05-31T17:00:00.000Z'),
    gate: dateGate(firstStampMs({publicDate:'01/06/2026 05:00'},['publicDate']),dateRangeFrom({fromDate:'2026-06-01',toDate:'2026-06-01'}))==='MATCH',
    area: matchesAreaCodes({provinceCode:'703'},'Lâm Đồng').ok===true,
    money: parseMoney('68.500.000.000 đồng') === 68500000000,
    date: Boolean(parseDate('20/08/2026 09:00')),
    version: normalizeVersion(1) === '01',
    extract: extractCandidateObjects({ content: [sample] }).length === 1,
    normalize: cand?.notifyNo === 'IB2600123456',
    score: score.score > 0
  };
  $('result').textContent = JSON.stringify({...tests,allPassed:Object.values(tests).every(v=>v===true),canaryDetail:canary,_phạmVi:'Mẫu kiểm thử cục bộ; không xác nhận kết nối hay độ đầy đủ của dữ liệu e-GP hiện tại.'}, null, 2);
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
    template: state.template ? stripSecretsDeep({ ...state.template, body: '[đã ẩn trong file chẩn đoán]' }) : null,
    lastTemplate: state.lastTemplate ? stripSecretsDeep({ ...state.lastTemplate, body: '[đã ẩn]' }) : null,
    runs: state.runs.slice(0, 50).map(safeRunForBackup),
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
      <th style="text-align:left;padding:6px 8px">Quan sát gần nhất</th>
    </tr></thead>
    <tbody>${list.map((r) => `<tr style="border-top:1px solid #e2e8f0">
      <td style="padding:6px 8px;font-family:ui-monospace,Consolas,monospace">${esc(r.path)}</td>
      <td style="padding:6px 8px">${esc(r.method)} · ${r.status}</td>
      <td style="padding:6px 8px;text-align:right">${r.soBanGhi == null ? '—' : r.soBanGhi}</td>
      <td style="padding:6px 8px;color:#475569">${esc((r.truong || []).join(', ')) || '—'}</td>
      <td style="padding:6px 8px;white-space:nowrap">${r.luc?esc(new Date(r.luc).toLocaleString('vi-VN')):'—'}<div class="small muted">${Number(r.observedCount)||1} lần ghi nhận</div></td>
    </tr>`).join('')}</tbody></table>`;
}

async function epLoad() {
  const s = await msg('GET_STATE');
  const list = (s && s.endpointMap) || [];
  document.getElementById('epMsg').textContent =
    list.length ? `Đã ghi ${list.length} endpoint. Bảng hiển thị phản hồi gần nhất của từng endpoint.` : '';
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
    + `truong: ${(r.truong || []).join(', ')}; lan: ${Number(r.observedCount)||1}; gan nhat: ${r.luc||'—'}`).join('\n');
  try {
    await navigator.clipboard.writeText(text || '(trống)');
    document.getElementById('epMsg').textContent = '✅ Đã chép. Dán vào chỗ trao đổi để gửi đi.';
  } catch {
    document.getElementById('epMsg').textContent = 'Không chép được — hãy bôi đen bảng rồi chép tay.';
  }
};

epLoad();

const LIVE_LABEL={GREEN:'Các hồ sơ mẫu đã kiểm tra đạt',RED:'Có mẫu không khớp hoặc kiểm tra thất bại',UNKNOWN:'Chưa đủ dữ liệu để xác nhận',RUNNING:'Đang kiểm tra các hồ sơ mẫu'};
let liveTimer;
async function loadLiveCanary(){
  clearTimeout(liveTimer);
  try{
    const response=await msg('CANARY_STATUS');
    if(!response?.ok)throw new Error(response?.message||'Chưa đọc được trạng thái kiểm tra.');
    const live=response.liveCanary||{},status=Object.hasOwn(LIVE_LABEL,live.status)?live.status:'UNKNOWN';
    $('live-status').className=`notice ${status==='GREEN'?'ok':status==='RED'?'error':''}`;
    $('live-status').textContent=`${LIVE_LABEL[status]}${live.reason?' · '+live.reason:''}`;
    $('live-time').textContent=`Lần kiểm tra: ${live.checkedAt?new Date(live.checkedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'chưa có'} · Lịch kế tiếp: ${live.nextRunAt?new Date(live.nextRunAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'chưa xác định'} · Giờ Việt Nam`;
    $('live-cases').innerHTML=(live.cases||[]).map(item=>`<p><b>${esc(item.id)}</b> · ${esc(item.type)} · ${esc(item.status)}${item.reason?' — '+esc(item.reason):''}</p>`).join('');
    $('live-run').disabled=status==='RUNNING'||Boolean(state?.settings?.readOnlyMode);
    if(status==='RUNNING'&&!document.hidden)liveTimer=setTimeout(loadLiveCanary,3000);
  }catch(e){$('live-status').className='notice';$('live-status').textContent=`Chưa xác định · ${e.message||e}`;}
}
$('live-run').addEventListener('click',async()=>{
  $('live-run').disabled=true;
  try{const result=await msg('CANARY_RUN');if(!result?.ok)throw new Error(result?.message||'Chưa bắt đầu được kiểm tra.');await loadLiveCanary();}
  catch(e){$('live-status').className='notice';$('live-status').textContent=String(e.message||e);$('live-run').disabled=false;}
});
$('live-refresh').addEventListener('click',loadLiveCanary);
async function checkNative(){
  $('native-check').disabled=true;
  try{
    const result=await msg('AGENT_STATUS');
    const installed=result?.installed===true,upstream=result?.upstream===true;
    $('native-status').className=`notice ${installed&&upstream?'ok':''}`;
    $('native-status').textContent=installed?(upstream?'Cầu nối Native Messaging và phần mềm hỗ trợ e-GP đang phản hồi.':'Cầu nối đã cài; phần mềm hỗ trợ e-GP chưa phản hồi. Hãy mở phần mềm hỗ trợ rồi kiểm tra lại.'):(result?.message||'Chưa kết nối được cầu nối Native Messaging. Xem hướng dẫn cài trên máy.');
  }catch(e){$('native-status').textContent=`Chưa kiểm tra được cầu nối: ${e.message||e}`;}finally{$('native-check').disabled=false;}
}
$('native-check').addEventListener('click',checkNative);
$('native-guide').href=chrome.runtime.getURL('HUONG-DAN-NATIVE.md');
window.addEventListener('pagehide',()=>clearTimeout(liveTimer));
loadLiveCanary();
