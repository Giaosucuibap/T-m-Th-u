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

/* ĐỘ ỔN ĐỊNH TRA CỨU (4.17.0) — số đo thật từ sổ giai đoạn, không ước đoán. */
let traceData=null;
const giay=(v)=>v===null||v===undefined?'—':`${(v/1000).toFixed(1)} s`;
const phanTram=(v)=>v===null||v===undefined?'—':`${(v*100).toFixed(v>0&&v<0.1?1:0)}%`;
export function renderTrace(data){
  const s=data.summary||{},d=data.last7d||{},stages=data.stages||{},modes=data.modes||{};
  if(!s.runs&&!s.cached)return {summary:'<p class="muted">Chưa có lượt tra cứu nào được đo. Chạy một lượt tra cứu rồi quay lại đây.</p>',modes:'',recent:''};
  const loi=Object.entries(s.failures||{}).sort((a,b)=>b[1]-a[1])
    .map(([k,n])=>`<li>${esc(stages[k]||k)}: <b>${n}</b> lượt</li>`).join('');
  const summary=`<p><b>${s.ok}/${s.runs}</b> lượt hỏi e-GP thành công · tỉ lệ lỗi <b>${phanTram(s.errorRate)}</b> (7 ngày qua: ${phanTram(d.errorRate)} trên ${d.runs||0} lượt)</p>
    <p>Thời gian một lượt thành công: trung vị <b>${giay(s.p50)}</b>, chậm nhất 5% từ <b>${giay(s.p95)}</b> · chờ trang đầu: trung vị ${giay(s.firstPageP50)}, p95 ${giay(s.firstPageP95)} · mở tab e-GP: trung vị ${giay(s.openP50)}</p>
    <p class="muted small">${s.cached} lượt lấy ngay từ bộ nhớ đệm · ${s.cancelled} lượt bạn tự dừng · ${s.reReads} lần phải đọc lại trang do e-GP chập chờn (đã tự xử lý).</p>
    ${loi?`<p><b>Hỏng ở đâu:</b></p><ul>${loi}</ul>`:'<p>Chưa có lượt nào hỏng.</p>'}`;
  const rows=Object.entries(s.byMode||{}).map(([m,v])=>`<tr><td>${esc(modes[m]||m)}</td><td>${v.ok}/${v.runs}</td><td>${phanTram(v.errorRate)}</td><td>${giay(v.p50)}</td><td>${giay(v.p95)}</td><td>${giay(v.firstPageP50)}</td></tr>`).join('');
  const modesHtml=rows?`<table><thead><tr><th>Chức năng</th><th>Thành công</th><th>Tỉ lệ lỗi</th><th>Trung vị</th><th>p95</th><th>Trang đầu (trung vị)</th></tr></thead><tbody>${rows}</tbody></table>`:'';
  const recent=(data.recent||[]).map(r=>`<tr><td>${esc(new Date(r.at).toLocaleString('vi-VN'))}</td><td>${esc(modes[r.mode]||r.mode)}</td><td>${r.cached?'Bộ nhớ đệm':esc(stages[r.stage]||r.stage)}</td><td>${giay(r.totalMs)}</td><td>${giay(r.firstPageMs)}</td><td>${giay(r.openMs)}${r.warm?' (mở sẵn)':''}</td><td>${r.pages}</td><td>${r.reReads}</td>${r.status?`<td>HTTP ${r.status}</td>`:'<td></td>'}</tr>`).join('');
  const recentHtml=recent?`<table><thead><tr><th>Lúc</th><th>Chức năng</th><th>Kết quả</th><th>Tổng</th><th>Trang đầu</th><th>Mở tab</th><th>Trang</th><th>Đọc lại</th><th></th></tr></thead><tbody>${recent}</tbody></table>`:'';
  return {summary,modes:modesHtml,recent:recentHtml};
}
async function loadTrace(){
  try{
    traceData=await msg('RUN_TRACE_SUMMARY');
    if(!traceData?.ok)throw new Error(traceData?.message||'Chưa đọc được sổ đo.');
    const html=renderTrace(traceData);
    $('trace-summary').innerHTML=html.summary;$('trace-modes').innerHTML=html.modes;$('trace-recent').innerHTML=html.recent;
  }catch(e){$('trace-summary').textContent=String(e.message||e);}
}
$('trace-refresh').onclick=loadTrace;
$('trace-clear').onclick=async()=>{
  if(!confirm('Xóa toàn bộ sổ đo độ ổn định? Không ảnh hưởng dữ liệu gói thầu.'))return;
  const r=await msg('CLEAR_RUN_TRACE');$('trace-summary').textContent=r?.ok?'Đã xóa sổ đo.':r?.message||'Chưa xóa được.';
  if(r?.ok)loadTrace();
};
loadTrace();

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
    counts: { tenders: state.tenders.length },
    // Chỉ số và nhãn giai đoạn — không có tiêu chí hay dữ liệu gói thầu.
    runTrace: traceData?.ok ? { summary: traceData.summary, last7d: traceData.last7d, recent: traceData.recent } : null
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
