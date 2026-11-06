/* Independent read-only audit. Run with Node; not part of the unit-test glob.
 * Audits existing completed public e-GP captures, not current network availability.
 * Python is used solely to reproduce canonical hashes of complete JSON records.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const candidate = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.resolve(candidate, '../..');
const checkedAt = '2026-10-05';
const output = path.join(candidate, 'test-results/directory-data-audit/audit.json');
const paths = {
  product: 'candidate/4.15.0/GiaoSuCuiBap/lib/organization-directory-data.js',
  compiled: 'test-results/4.15.0/research/compiled/directory.json',
  ledger: 'test-results/4.15.0/research/compiled/portal-code-ledger.json',
  national: 'test-results/4.15.0/research/national/national-boards-verified.json',
  lamdong: 'test-results/4.15.0/research/lamdong/lamdong-boards-2026-10-05.json',
  legalReview: 'test-results/4.15.0/research/national/national-legal-status-review-2026-10-05.json',
  guide: 'candidate/4.15.0/HUONG-DAN-4.15.0.md',
  report: 'candidate/4.15.0/BAO-CAO-CAP-NHAT-4.15.0.md',
};
const checks = [], failures = [], warnings = [], files = new Map();
function check(name, ok, detail = undefined) {
  const item = { name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) };
  checks.push(item); if (!ok) failures.push(item);
}
function fullPath(relative) {
  const resolved = path.resolve(workspace, relative);
  if (!resolved.startsWith(workspace + path.sep)) throw new Error('Evidence path escaped workspace');
  return resolved;
}
function bytes(relative) {
  const raw = fs.readFileSync(fullPath(relative));
  files.set(relative.replaceAll('\\', '/'), { sha256: crypto.createHash('sha256').update(raw).digest('hex'), bytes: raw.length });
  return raw;
}
function readText(relative) { return bytes(relative).toString('utf8').replace(/^\uFEFF/, ''); }
function readJson(relative) { return JSON.parse(readText(relative)); }
function fold(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function provinceIdentity(value) { return fold(value).replace(/^(?:tinh|thanh pho)\s+/, ''); }
function organizationIdentity(value, province) {
  let name = fold(value).replace(/\bbqlda\b/g, 'ban quan ly du an').replace(/\bqlda\b/g, 'quan ly du an').replace(/\bdtxd\b/g, 'dau tu xay dung');
  const suffix = provinceIdentity(province);
  // Only normalize the selected province qualifier; do not strip arbitrary legal words.
  for (const qualified of [`tinh ${suffix}`, `thanh pho ${suffix}`, suffix]) {
    if (name.endsWith(' ' + qualified)) { name = name.slice(0, -(qualified.length + 1)); break; }
  }
  // Mandated city renames can place the selected province before "số 1/2".
  for (const qualified of [`tinh ${suffix}`, `thanh pho ${suffix}`]) name = name.replaceAll(qualified, suffix);
  return name.replace(/\s+/g, ' ').trim();
}
function versionOf(row) {
  const v = Object.hasOwn(row, 'planVersion') ? row.planVersion : Object.hasOwn(row, 'notifyVersion') ? row.notifyVersion : row.version ?? '00';
  return String(v).padStart(2, '0');
}
function dateAdmissible(value) {
  if (value === null || value === undefined || value === '') return true;
  return /^\d{4}(?:-\d{2})?(?:-\d{2})?/.test(String(value)) && String(value).slice(0, 10) <= checkedAt;
}
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function equal(a, b) { return stable(a) === stable(b); }

const sourceText = readText(paths.product);
const matched = sourceText.match(/export const ORGANIZATION_DIRECTORY\s*=\s*([\s\S]*);\s*$/);
if (!matched) throw new Error('Product data is not a literal JSON export');
const directory = JSON.parse(matched[1]);
const compiled = readJson(paths.compiled), ledger = readJson(paths.ledger);
const national = readJson(paths.national), lamdong = readJson(paths.lamdong);
const legalReview = readJson(paths.legalReview);
const entries = directory.entries, byId = new Map(entries.map(e => [e.id, e]));
const expectedRecords = [...(lamdong.records ?? lamdong.entries), ...(national.records ?? national.entries)];
const provinceNames = [...new Set(entries.map(e => e.provinceName))].sort();
const codedEntries = entries.filter(e => e.eGpCode);
check('product-data-equals-compiled-json', equal(directory, compiled));
check('173-unique-official-records', entries.length === 173 && byId.size === 173 && expectedRecords.length === 173);
check('34-current-province-names', provinceNames.length === 34 && equal(provinceNames, [...directory.provinces].sort()));
check('9-cities-and-25-provinces', provinceNames.filter(n => n.startsWith('Thành phố ')).length === 9 && provinceNames.filter(n => n.startsWith('Tỉnh ')).length === 25);
check('coverage-is-not-exhaustiveness-claim', directory.coverage.exhaustive === false && directory.coverage.provinceCount === 34 && directory.coverage.officialRecords === 173 && directory.coverage.portalIdentities === 57 && directory.checkedAt === checkedAt);
check('57-bound-portal-identities', codedEntries.length === 57 && ledger.length === 57 && new Set(ledger.map(e => e.id)).size === 57);
check('31-lamdong-records-all-proof-bound', entries.filter(e => e.provinceName === 'Tỉnh Lâm Đồng').length === 31 && codedEntries.filter(e => e.provinceName === 'Tỉnh Lâm Đồng').length === 31);
check('no-tax-id-guesses', entries.every(e => e.taxCode === null));

const officialResults = [];
for (const original of expectedRecords) {
  const entry = byId.get(original.id);
  const expectedName = original.name ?? original.legalName;
  const sourceList = original.sourceRefs ? original.sourceRefs.map(id => lamdong.sources.find(s => s.id === id)).filter(Boolean) : original.sources;
  const sourceMatch = Boolean(entry && sourceList?.length && sourceList.every(s => entry.sources.some(t => t.url === s.url && (t.date || t.evidenceDate || '') === (s.date || s.evidenceDate || ''))));
  const ok = Boolean(entry && entry.name === expectedName && entry.provinceName === original.provinceName && sourceMatch && entry.sources.every(s => typeof s.url === 'string' && s.url.startsWith('https://') && dateAdmissible(s.date || s.evidenceDate)));
  officialResults.push({ id: original.id, ok, sourceCount: entry?.sources?.length ?? 0 });
  check(`official-research-record:${original.id}`, ok);
}
for (const city of ['Thành phố Đồng Nai', 'Thành phố Quảng Ninh', 'Thành phố Bắc Ninh']) {
  check(`current-city:${city}`, provinceNames.includes(city) && !provinceNames.includes(city.replace('Thành phố', 'Tỉnh')));
}
const renamedIds = ['tinh-quang-ninh-ban-quan-ly-du-an-dau-tu-xay-dung-khu-vuc-i-tinh-quang-ninh', 'tinh-dong-nai-ban-quan-ly-du-an-dau-tu-xay-dung-tinh-dong-nai', ...entries.filter(e => e.provinceName === 'Thành phố Bắc Ninh' && /thành phố Bắc Ninh/.test(e.name)).map(e => e.id)];
check('6-mandated-city-name-records-have-primary-resolution-source', renamedIds.length === 6 && renamedIds.every(id => byId.get(id)?.sources.some(s => /datafiles\.chinhphu\.vn.*nq(?:30|36|39)/.test(s.url))));
const sonLa = entries.filter(e => e.provinceName === 'Tỉnh Sơn La' && e.organizationLevel === 'subordinate-board');
check('11-sonla-boards-preserve-parent-organization', sonLa.length === 11 && sonLa.every(e => e.parentOrganizationName === 'Ban Quản lý dự án đầu tư xây dựng các công trình Nông nghiệp và Phát triển nông thôn tỉnh Sơn La' && e.sources.some(s => /congbao\.sonla\.gov\.vn/.test(s.url))));
const excluded = national.excludedRecords ?? [];
const excludedCaoBang = 'tinh-cao-bang-ban-quan-ly-du-an-dau-tu-xay-dung-cac-cong-trinh-giao-thong-tinh-cao-bang';
check('caobang-merged-transport-board-excluded', excluded.some(e => e.id === excludedCaoBang && e.status === 'merged-excluded-from-current-suggestions') && !byId.has(excludedCaoBang));
check('legal-review-as-of-no-future-claim', dateAdmissible(legalReview.asOf ?? legalReview.checkedAt));
check('phuquy-is-special-zone-current-name', byId.get('ld-area-phu-quy')?.name === 'Ban Quản lý dự án đầu tư xây dựng đặc khu Phú Quý');
check('ban-1-alias-has-only-curated-official-identity', byId.get('ld-pmb-1')?.aliases?.some(a => fold(a) === 'ban 1') && byId.get('ld-pmb-1')?.eGpCode === 'vn5800939408');

const receiptPaths = [...new Set(ledger.map(p => p.evidenceFile))].sort();
const receipts = new Map(receiptPaths.map(p => [p, readJson(p)]));
const normalizedRows = [], eligible = new Set();
for (const [file, receipt] of receipts) {
  check(`completed-public-receipt:${file}`, receipt.fixture === false && receipt.passed === true && Boolean(receipt.completedAt) && dateAdmissible(receipt.completedAt) && (receipt.errors ?? []).length === 0);
  for (let j = 0; j < (receipt.jobs ?? []).length; j++) {
    const job = receipt.jobs[j].job;
    for (const row of job.plans ?? []) eligible.add(`${row.planNo}\u0000${String(row.version ?? '00').padStart(2, '0')}`);
    for (const field of ['plans', 'insufficientPlans', 'excludedPlans']) for (let k = 0; k < (job[field] ?? []).length; k++) {
      normalizedRows.push({ file, pointer: `/jobs/${j}/job/${field}/${k}`, row: job[field][k] });
    }
  }
}

// This helper reads the COMPLETE original source records and hashes each one.
// It emits only procurement identity fields for matching; no network/auth data.
const hashHelper = String.raw`
import json,hashlib,pathlib,sys
sys.stdout.reconfigure(encoding='utf-8')
sys.stdin.reconfigure(encoding='utf-8')
config=json.loads(sys.stdin.read());root=pathlib.Path(config['root'])
wanted=set(config['hashes']);out=[]
safe=['planNo','notifyNo','planVersion','notifyVersion','version','investorName','investorCode','procuringEntityName','procuringEntityCode','locations','decisionDate','publicDate','capturedAt','detailUrl','id','notifyId']
danger={'authorization','cookie','access_token','refresh_token','password','secret','sessionid','jwt'}
def scan(value):
 if isinstance(value,dict): return any(str(k).lower() in danger or scan(v) for k,v in value.items())
 if isinstance(value,list): return any(scan(v) for v in value)
 return False
def append(file,pointer,row,seen,format):
 sha=hashlib.sha256(json.dumps(row,sort_keys=True,ensure_ascii=False).encode('utf-8')).hexdigest()
 if sha in wanted: out.append({'evidenceFile':file,'pointer':pointer,'sourceRecordSha256':sha,'seenAt':seen,'sourceFormat':format,'containsAuthField':scan(row),'publicRecord':{k:row[k] for k in safe if k in row}})
for file in config['files']:
 doc=json.loads((root/file).read_text(encoding='utf-8-sig'))
 if doc.get('responses'):
  for i,response in enumerate(doc['responses']):
   for j,row in enumerate((response.get('page') or {}).get('content') or []): append(file,f'/responses/{i}/page/content/{j}',row,response.get('at'),'public-response')
 else:
  for i,item in enumerate(doc.get('jobs') or []):
   for field in ['plans','insufficientPlans','excludedPlans']:
    for j,row in enumerate(item['job'].get(field) or []): append(file,f'/jobs/{i}/job/{field}/{j}',row,row.get('capturedAt') or doc.get('completedAt'),'production-normalized-public-capture')
print(json.dumps(out,ensure_ascii=False))
`;
const python = process.env.DIRECTORY_AUDIT_PYTHON || 'C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const hashed = spawnSync(python, ['-c', hashHelper], { input: JSON.stringify({ root: workspace, files: receiptPaths, hashes: ledger.map(p => p.sourceRecordSha256) }), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
if (hashed.status !== 0) throw new Error(`Complete-record hash helper failed: ${hashed.stderr}`);
const records = JSON.parse(hashed.stdout);
const proofResults = [];
for (const proof of ledger) {
  const entry = byId.get(proof.id);
  const flatProof = entry ? { id: entry.id, name: entry.name, provinceName: entry.provinceName, eGpCode: entry.eGpCode, ...entry.egpProof } : null;
  const candidates = records.filter(r => r.sourceRecordSha256 === proof.sourceRecordSha256 && r.evidenceFile === proof.evidenceFile && r.sourceFormat === proof.sourceFormat && r.seenAt === proof.seenAt);
  const source = candidates.find(r => {
    const raw = r.publicRecord, nameField = proof.codeField === 'investorCode' ? 'investorName' : proof.codeField === 'procuringEntityCode' ? 'procuringEntityName' : null;
    return nameField && raw[nameField] === proof.nameAtSource && raw[proof.codeField] === proof.codeAtSource && (raw.planNo || raw.notifyNo) === proof.reference && versionOf(raw) === proof.version;
  });
  const raw = source?.publicRecord;
  const reasons = [];
  if (!equal(flatProof, proof)) reasons.push('entry/ledger differs');
  if (!source) reasons.push('full source record hash/pair/reference/version/timestamp not found');
  if (!/^vn(?:[a-z]\w{5,}|\d{8,}(?:-\d+)?)$/i.test(proof.eGpCode) || proof.eGpCode !== proof.codeAtSource || entry?.egpCodeVerified !== true) reasons.push('portal code invalid/unbound');
  if (organizationIdentity(proof.name, proof.provinceName) !== organizationIdentity(proof.nameAtSource, proof.provinceName)) reasons.push('source full organization name differs beyond controlled abbreviation/province rename');
  if (source?.containsAuthField) reasons.push('source record contains auth field');
  if (!raw?.locations?.some(l => provinceIdentity(l.provName) === provinceIdentity(proof.provinceName) && String(l.provCode) === proof.provinceCode)) reasons.push('province name/code is not from same original record');
  if (!dateAdmissible(proof.seenAt) || !dateAdmissible(proof.recordDecisionDate) || !dateAdmissible(raw?.publicDate) || (raw?.decisionDate ?? null) !== (proof.recordDecisionDate ?? null)) reasons.push('inadmissible or unmatched source date');
  if (!eligible.has(`${proof.reference}\u0000${proof.version}`)) reasons.push('reference/version absent from completed matched portal job');
  let url;
  try { url = new URL(proof.sourceUrl); } catch { reasons.push('invalid URL'); }
  if (url && (url.origin !== 'https://muasamcong.mpi.gov.vn' || url.username || url.password || ![url.searchParams.get('planNo'), url.searchParams.get('notifyNo')].includes(proof.reference))) reasons.push('URL origin/reference invalid');
  const corresponding = normalizedRows.filter(n => n.row.planNo === proof.reference && String(n.row.version ?? '00').padStart(2, '0') === proof.version && n.row.detailUrl === proof.sourceUrl);
  if (!corresponding.length) reasons.push('exact reference/version URL absent from captured normalized public row');
  check(`proof-bound-source:${proof.id}`, reasons.length === 0, reasons.length ? reasons : undefined);
  proofResults.push({ id: proof.id, name: proof.name, provinceName: proof.provinceName, eGpCode: proof.eGpCode, sourceFormat: proof.sourceFormat, evidenceFile: proof.evidenceFile, sourcePointer: source?.pointer ?? null, sourceRecordSha256: proof.sourceRecordSha256, sourceUrl: proof.sourceUrl, reference: proof.reference, version: proof.version, codeField: proof.codeField, provinceCode: proof.provinceCode, nameAtSource: proof.nameAtSource, seenAt: proof.seenAt, recordDecisionDate: proof.recordDecisionDate, ok: reasons.length === 0, reasons });
}
check('no-orphan-proof-or-code', entries.every(e => Boolean(e.eGpCode) === Boolean(e.egpProof) && Boolean(e.eGpCode) === Boolean(e.egpCodeVerified)));

const documents = [];
for (const relative of [paths.guide, paths.report]) {
  const text = readText(relative), qa = text.includes('{{QA_SUMMARY}}'), live = text.includes('{{LIVE_SUMMARY}}');
  const falseCompleteClaim = /(?:100%[^\n]{0,50}(?:đã kiểm|hoàn tất|thành công)|(?:tất cả|toàn bộ)[^\n]{0,50}(?:live|e-GP trực tiếp)[^\n]{0,50}đã (?:qua|thành công))/i.test(text);
  documents.push({ file: relative, qaPlaceholder: qa, livePlaceholder: live, falseCompleteClaim });
  check(`document-has-no-unsubstantiated-live-completion:${relative}`, !falseCompleteClaim);
  if (qa || live) warnings.push({ code: 'DOCUMENT_AWAITS_FINAL_QA_LIVE_SUMMARY', file: relative, message: 'Release documentation still contains final QA/LIVE placeholders; parent must replace with observed results before packaging.' });
}
const formats = Object.fromEntries([...new Set(ledger.map(p => p.sourceFormat))].map(format => [format, ledger.filter(p => p.sourceFormat === format).length]));
const report = {
  schema: 1, version: '4.15.0', checkedAt, generatedAt: new Date().toISOString(), passed: failures.length === 0,
  auditType: 'independent read-only directory/source-record integrity audit',
  publicProcurementFieldsOnly: true, performedNetworkCalls: false,
  sourceEvidenceScope: 'Existing completed public e-GP probe receipts only; current end-to-end acceptance is recorded separately in directory-plans-live.json and directory-flows-live.json.',
  hashMethod: 'SHA-256 of complete actual source record, Python json.dumps(sort_keys=True, ensure_ascii=False) with default separators, encoded UTF-8; full files hashed byte-for-byte separately.',
  counts: { officialRecords: entries.length, provinceCount: provinceNames.length, cityCount: provinceNames.filter(n => n.startsWith('Thành phố ')).length, portalIdentities: ledger.length, lamdongRecords: entries.filter(e => e.provinceName === 'Tỉnh Lâm Đồng').length, lamdongPortalIdentities: codedEntries.filter(e => e.provinceName === 'Tỉnh Lâm Đồng').length, sourceFormats: formats, checks: checks.length, failures: failures.length },
  productSha256: files.get(paths.product)?.sha256, files: Object.fromEntries(files),
  checks, failures, warnings, officialResults, proofResults, documents,
  releaseDocumentationReady: documents.every(d => !d.qaPlaceholder && !d.livePlaceholder && !d.falseCompleteClaim),
  limits: ['Seed coverage is not an exhaustive inventory of all currently operating boards.', 'A dated legal or operating source is not a guarantee of permanent legal status.', 'Public proof of an e-GP identity is distinct from successful end-to-end search in current network conditions.', '31 normalized captures are labeled explicitly; they are not represented as raw HAR responses.'],
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ passed: report.passed, counts: report.counts, productSha256: report.productSha256, report: output, warnings: warnings.length, releaseDocumentationReady: report.releaseDocumentationReady }, null, 2));
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1; }
