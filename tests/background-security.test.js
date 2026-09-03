import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(ROOT, 'background.js'), 'utf8');
const contentSource = readFileSync(join(ROOT, 'content.js'), 'utf8');
const optionsSource = readFileSync(join(ROOT, 'options.js'), 'utf8');
const pageHookSource = readFileSync(join(ROOT, 'page-hook.js'), 'utf8');

function between(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing source marker: ${startMarker}`);
  assert.ok(end > start, `missing source marker after ${startMarker}: ${endMarker}`);
  return text.slice(start, end);
}

test('backup export serializes only the explicit safe-backup projection', () => {
  const body = between(source, 'async function exportBackup', '\n/* ==========================================================================');

  assert.match(body, /const cleanTemplates\s*=\s*sanitizedTemplateState\(s\)/);
  assert.match(body, /const exportState\s*=\s*buildSafeBackupState\(s,cleanTemplates,DEFAULT_SETTINGS\)/);
  assert.match(body, /backupMode:'SAFE'/);
  assert.match(body, /\.\.\.exportState/);
  assert.doesNotMatch(body, /\{\s*\.\.\.s\s*,/);
  assert.doesNotMatch(body, /backupMode:'FULL'/);
});

test('extension installation and upgrades scrub legacy templates and close live work', () => {
  const body = between(
    source,
    'chrome.runtime.onInstalled.addListener',
    'chrome.runtime.onStartup.addListener'
  );

  assert.match(body, /if\(s0\.activeRun\)await cancelActiveRun\(\)/);
  assert.match(body, /await cancelLookups\(null,/);
  assert.match(body, /const cleanTemplates\s*=\s*sanitizedTemplateState\(s0\)/);
  assert.match(body, /\[KEYS\.runs\]:\(s0\.runs\|\|\[\]\)\.slice\(0,100\)\s*\.map\(run=>safeRunForBackup\(run,\{terminalize:true\}\)\)/);
  assert.match(body, /\[KEYS\.activeRun\]:null/);
  assert.match(body, /\[KEYS\.template\]:cleanTemplates\.template/);
  assert.match(body, /\[KEYS\.templates\]:cleanTemplates\.templates/);
  assert.match(body, /\[KEYS\.lastTemplate\]:cleanTemplates\.lastTemplate/);
  assert.match(body, /Number\(settings\.maxPagesHint\)===5/);
  assert.match(body, /settings\.maxPagesHint=DEFAULT_SETTINGS\.maxPagesHint/);
});

test('backup import preserves terminal states and terminalizes live or unknown states safely', () => {
  const body = between(source, 'function sanitizeBackupImport', '\n/* ========================================================================');

  assert.match(body, /new Set\(\['SUCCESS','PARTIAL','ERROR','CANCELLED','TIMEOUT'\]\)/);
  assert.match(body, /new Set\(\['STARTING','OPENING','RUNNING','LISTING','SCANNING'\]\)/);
  assert.match(body, /terminalStatuses\.has\(rawStatus\)\?rawStatus:\(nonterminalStatuses\.has\(rawStatus\)\?'CANCELLED':'ERROR'\)/);
  assert.match(body, /finishedAt:r&&r\.finishedAt\|\|new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(body, /\?\s*rawStatus\s*:\s*'SUCCESS'/);
});

test('job starts use atomic storage claims before dispatching work to an e-GP tab', () => {
  const claimBody = between(source, 'const ACTIVE_JOB_STATUSES', 'async function startWinnerLookup');

  assert.match(claimBody, /async function claimLookupJob\(key,job\)\{\s*return withLock\(async\(\)=>\{/s);
  assert.match(claimBody, /current&&ACTIVE_JOB_STATUSES\.has\(String\(current\.status\|\|''\)\)/);
  assert.match(claimBody, /await save\(\{\[KEYS\[key\]\]:job\}\)/);
  assert.match(claimBody, /async function claimActiveRun\(run\)\{\s*return withLock\(async\(\)=>\{/s);
  assert.match(claimBody, /s\.activeRun&&ACTIVE_JOB_STATUSES\.has/);

  for (const key of ['winnerLookup', 'bidOpenScan', 'investorScan', 'areaScan', 'planLookup']) {
    assert.match(source, new RegExp(`await claimLookupJob\\('${key}',`), `${key} must be claimed atomically`);
  }
  assert.equal(
    (source.match(/await claimActiveRun\(run\)/g) || []).length,
    2,
    'both template scans and form-driven TBMT scans must claim activeRun'
  );
});

test('content pagination retries until ACK and never advances after an unacknowledged page', () => {
  const sendBody = between(contentSource, 'async function kqSend', '\n\n  /* --- Điều khiển biểu mẫu');
  const harvestBody = between(contentSource, 'async function kqRunHarvest', '\n  function kqFinish');

  assert.match(sendBody, /\{requireAck=false,attempts=3\}=\{\}/);
  assert.match(sendBody, /for\(let attempt=1;attempt<=attempts;attempt\+\+\)/);
  assert.match(sendBody, /if\(!requireAck\|\|response\?\.ok===true\)return/);
  assert.match(sendBody, /if\(attempt<attempts\)await new Promise/);
  assert.equal(
    (harvestBody.match(/\{requireAck:true,attempts:3\}/g) || []).length,
    2,
    'each data page and the terminal page need an explicit ACK'
  );
  assert.match(harvestBody, /if\(!ack\?\.ok\)\{ deliveryFailed=true; break; \}/);
  assert.match(harvestBody, /const transferFailed=!finalAck\?\.ok/);
});

test('background ACKs duplicate pages idempotently and renews the lease only after durable receipt', () => {
  const routeBody = between(source, 'async function routeKqlcntResults', 'async function routeKqlcntDone');
  const leaseBody = between(source, 'async function renewProgressLease', 'function receivedPageIndexes');

  assert.match(routeBody, /receivedPageIndexes\(target\.job\)\.has\(payload\.pageIndex\)/);
  assert.match(routeBody, /return \{ok:true,duplicate:true,pageIndex:payload\.pageIndex\}/);
  assert.match(routeBody, /if\(!effective\.done&&result\?\.ok!==false\)/);
  const recordAt = routeBody.indexOf('await recordReceivedPage(');
  const leaseAt = routeBody.indexOf('await renewProgressLease(');
  assert.ok(recordAt >= 0 && leaseAt > recordAt, 'receipt must be recorded before renewing its lease');

  assert.match(leaseBody, /lastProgressAt:at/);
  assert.match(leaseBody, /chrome\.alarms\.create\(TIMEOUT_PREFIX\+id,\{when:Date\.now\(\)\+timeoutMs\}\)/);
  assert.ok(
    (source.match(/lastProgressAt\|\|[^\n]*startedAt/g) || []).length >= 2,
    'stale-job reconciliation must prefer the progress lease over the start time'
  );
});

test('cold-start reconciliation closes a BBMT detail coordinator that cannot be resumed', () => {
  const body = between(source, 'async function reconcileStaleLookups', '\n\n// Mỗi lần service worker');

  assert.match(source, /key:'bidOpenScan'[^\n]+statuses:\['LISTING','SCANNING','RUNNING'\]/);
  assert.match(body, /const coordinatorLost=coldStart&&kind\.key==='bidOpenScan'&&cur\.status==='SCANNING'/);
  assert.match(body, /ownTabGone\|\|age>RUN_STALE_MS\|\|coordinatorLost/);
  assert.match(source, /reconcileStaleLookups\(\{coldStart:true\}\)\.catch\(\(\)=>\{\}\)/);
});

test('background and options enforce the same 30 MB backup import cap', () => {
  assert.match(source, /JSON\.stringify\(data\|\|\{\}\)\.length>30_000_000/);
  assert.match(optionsSource, /f\.size > 30_000_000/);
});

test('the default e-GP route always loads the contractor-selection search bridge', () => {
  // EGP_SCAN_PAGE của lib/core.js là nguồn sự thật duy nhất về phạm vi content
  // script; tests/content-script-scope.test.js đối chiếu nó với manifest.
  assert.match(source, /const EGP_DEFAULT_URL=EGP_SCAN_PAGE;/);
  assert.match(source, /chrome\.tabs\.create\(\{url:EGP_SEARCH_PAGE,/);
  assert.doesNotMatch(source, /const EGP_DEFAULT_URL\s*=\s*['"][^'"]*\/home/);

  // Route mặc định đúng vẫn CHƯA đủ: prepareScanTabFor còn tái dùng tab e-GP
  // đang mở nguyên trạng, kể cả trang chủ. Chốt luôn đường thứ hai này.
  assert.match(source, /scanTargetUrl\(template\?\.sourcePageUrl\)/);
  assert.match(source, /hasContentScript\(current\?\.url\)/);
  assert.match(source, /!hasContentScript\(tab\.url\)/);

  assert.match(pageHookSource, /url\.origin === EGP_ORIGIN/);
  assert.match(pageHookSource, /url\.pathname === SEARCH_ENDPOINT/);
  assert.match(pageHookSource, /String\(method \|\| ''\)\.toUpperCase\(\) === 'POST'/);
  assert.match(pageHookSource, /const PLAN_KEYS = new Set\(\['id', 'query', 'pageSize'\]\)/);
  assert.match(pageHookSource, /!\[10, 20, 50\]\.includes\(value\.pageSize\)/);
  assert.match(pageHookSource, /SECRET_FIELD\.test\(filter\.fieldName\)/);
  assert.match(pageHookSource, /kqlcntPlan = plan === null \? null : validatedPlan\(plan\)/);
  assert.doesNotMatch(pageHookSource, /includes\(['"]\/services\/smart\/search/);
});
