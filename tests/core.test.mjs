import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseDate, bidStatus, scoreTender, DEFAULT_SETTINGS, normalizeCandidate, mergeTender} from '../GiaoSuCuiBap/lib/core.js';
import {statusOf,filterAndSort} from '../GiaoSuCuiBap/lib/decision.js';
import {safeRunForBackup,buildSafeBackupState} from '../GiaoSuCuiBap/lib/backup.js';
import {validateCriteria,matchesQuery,runTenders,safeSavedSearches,buildDeadlineCalendar,deadlineInfo,safeSource,matchesAdditionalKeyword} from '../GiaoSuCuiBap/lib/workspace.js';
const now=Date.parse('2026-09-05T03:00:00Z');
const tender=(key,minutes)=>({key,notifyNo:key,bidName:'Xây dựng trường học ở Lâm Đồng',closeDate:new Date(now+minutes*60000).toISOString(),price:3500000000,location:'Lâm Đồng',investorName:'Ban quản lý dự án',detailUrl:'https://muasamcong.mpi.gov.vn/web/guest/contractor-selection'});
test('Vietnamese local time is UTC+7 regardless of host timezone',()=>{
  assert.equal(parseDate('05/09/2026 10:00:00'),'2026-09-05T03:00:00.000Z');
  assert.equal(parseDate('2026-09-05 10:00:00'),'2026-09-05T03:00:00.000Z');
  assert.equal(parseDate('2026-09-05T10:00:00+07:00'),'2026-09-05T03:00:00.000Z');
  assert.equal(parseDate('2026-09-05T03:00:00Z'),'2026-09-05T03:00:00.000Z');
  assert.equal(parseDate('2026-09-05'),'2026-09-04T17:00:00.000Z');
});
test('Invalid dates rejected, leap day allowed',()=>{for(const d of ['31/02/2026','29/02/2025','2026-13-02','2026-09-01T25:00:00'])assert.equal(parseDate(d),null,d);assert.ok(parseDate('29/02/2024'));});
test('Exact deadline closes; missing TBMT and missing time remain distinct',()=>{assert.equal(bidStatus(tender('IB1',0),now),'CLOSED');assert.equal(bidStatus(tender('IB1',1),now),'OPEN');assert.equal(bidStatus(tender('IB1',-1),now),'CLOSED');assert.equal(bidStatus({bidNo:'BP1'},now),'PLAN');assert.equal(bidStatus({notifyNo:'IB1',closeDate:'bad'},now),'UNKNOWN');});
test('Stored OPEN status cannot revive an expired bid',()=>{assert.equal(statusOf({...tender('IB1',-1),closeDate:'2020-01-01T00:00:00Z',status:'OPEN'}),'CLOSED');});
test('Deadline wording reports durations instead of calendar-day guesses',()=>{assert.equal(deadlineInfo(tender('IB1',5),now).label,'Còn 5 phút');assert.equal(deadlineInfo(tender('IB1',90),now).label,'Còn 1 giờ 30 phút');assert.equal(deadlineInfo(tender('IB1',0),now).label,'Đã đóng thầu');});
test('Vietnamese money expressions and input validation',()=>{
  for(const v of ['3,5 tỷ','3.500.000.000','3500000000'])assert.equal(validateCriteria({minPrice:v}).criteria.minPrice,3500000000,v);
  assert.equal(validateCriteria({maxPrice:'500 triệu'}).criteria.maxPrice,500000000);
  for(const raw of [{},{minPrice:'abc'},{minPrice:'-100'},{minPrice:'Infinity'},{minPrice:'5 tỷ',maxPrice:'3 tỷ'},{minPrice:'1e9'},{minPrice:'9999999999999999999'}])assert.equal(validateCriteria(raw).ok,false,JSON.stringify(raw));
});
test('Local query supports AND terms, Vietnamese accents, phrases and exclusions',()=>{const hay='Xây dựng trường học, Lâm Đồng';assert.ok(matchesQuery(hay,'"truong hoc" lam dong'));assert.ok(matchesQuery(hay,'truong -benh'));assert.equal(matchesQuery(hay,'truong -dong'),false);assert.equal(matchesQuery(hay,'truong ha noi'),false);assert.ok(matchesQuery(hay,'-"bệnh viện"'));});
test('Run isolation never mixes unrelated or absent results',()=>{const all=[{key:'a'},{key:'b'}];assert.deepEqual(runTenders(all,{foundKeys:['b']}),[{key:'b'}]);assert.deepEqual(runTenders(all,{}),[]);assert.deepEqual(runTenders(all,{foundKeys:[]}),[]);});
test('Investor plus keyword keeps BOTH requested criteria',()=>{const c={investor:'Ban QLDA',keyword:'truong hoc'};assert.ok(matchesAdditionalKeyword({bidName:'Xây trường học'},c));assert.equal(matchesAdditionalKeyword({bidName:'Xây trạm bơm'},c),false);assert.ok(matchesAdditionalKeyword({bidName:'Xây trạm bơm'},{investor:'Ban QLDA'}));});
test('Deadline sort uses exact times within the same day',()=>{const earlier={...tender('A',1),closeDate:'2099-01-01T10:00:00Z',score:10};const later={...tender('B',1),closeDate:'2099-01-01T12:00:00Z',score:99};assert.equal(filterAndSort([later,earlier],{sortBy:'deadline'})[0].key,'A');});
test('Backup preserves scope and criteria while removing queued secrets',()=>{const run=safeRunForBackup({id:'r',mode:'form',status:'RUNNING',captured:2,foundKeys:['a','b','a'],criteria:{keyword:'xay dung',token:'secret'},queue:[{token:'secret'}],pendingAlerts:[{}]},{terminalize:true});assert.equal(run.status,'PARTIAL');assert.deepEqual(run.foundKeys,['a','b']);assert.equal(run.criteria.keyword,'xay dung');assert.equal(JSON.stringify(run).includes('secret'),false);assert.equal('queue' in run,false);});
test('Named searches are bounded, sanitized, and backed up without credentials',()=>{const rows=safeSavedSearches([{id:'a',name:'Lâm Đồng',criteria:{province:'Lâm Đồng',token:'do-not-export'}},{id:'a',name:'duplicate',criteria:{keyword:'x'}},{id:'b',name:'bad',criteria:{minPrice:-1}}]);assert.equal(rows.length,1);const b=buildSafeBackupState({savedSearches:rows,settings:{telegramBotToken:'abc',telegramChatId:'123'}},{},DEFAULT_SETTINGS);assert.equal(b.savedSearches[0].name,'Lâm Đồng');assert.equal(JSON.stringify(b).includes('telegramBotToken'),false);});
test('Calendar escapes injection, folds UTF-8 at 75 bytes, excludes closed/unknown',()=>{
  const item=tender('IB123::00',60);item.bidName='Gói xây dựng trường học '.repeat(12)+'\nBEGIN:VEVENT;,';
  const result=buildDeadlineCalendar([item,item,tender('CLOSED',-2),{notifyNo:'UNKNOWN'}],now);
  assert.equal(result.count,1);assert.equal((result.text.match(/\r\nBEGIN:VEVENT\r\n/g)||[]).length,1);assert.ok(result.text.includes('DTSTART:20260905T040000Z'));assert.ok(result.text.includes('TRIGGER:-PT24H'));
  for(const line of result.text.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75,line);
  assert.ok(result.text.includes('\\nBEGIN:VEVENT\\;\\,'));
});
test('Source links reject scripts and lookalike hosts',()=>{for(const u of ['javascript:alert(1)','https://muasamcong.mpi.gov.vn.evil.com','https://user@muasamcong.mpi.gov.vn','http://muasamcong.mpi.gov.vn','https://muasamcong.mpi.gov.vn:999/'])assert.equal(safeSource(u),'');assert.ok(safeSource(tender('A',1).detailUrl));});
test('Filtering does not mutate storage order, status derives from deadline',()=>{const all=[{...tender('A',1),score:20,closeDate:'2099-01-01T00:00:00Z'},{...tender('B',1),score:90,closeDate:'2020-01-01T00:00:00Z',status:'OPEN'}];assert.deepEqual(filterAndSort(all,{status:'OPEN',text:'truong -benh'}).map(t=>t.key),['A']);assert.equal(all[0].key,'A');});
test('Existing normalization and merge preserve user decisions and changes',()=>{const raw={notifyNo:'IB2600000123',notifyVersion:'00',bidName:'Xây dựng trường học',bidPrice:3000000000,bidCloseDate:'05/10/2026 10:00',investorName:'Ban QLDA'};const normalized=normalizeCandidate(raw);assert.ok(normalized);const next=mergeTender({...normalized,watchlisted:true,decisionState:'BID',decisionOwner:'An'}, {...normalized,price:4000000000},DEFAULT_SETTINGS);assert.equal(next.watchlisted,true);assert.equal(next.decisionState,'BID');assert.equal(next.decisionOwner,'An');assert.ok(next.changeLog.some(x=>x.field==='price'));assert.ok(scoreTender(next).score>=0);});
test('Manifest entry points and imports exist, no unexpected host permissions added',()=>{const base=new URL('../GiaoSuCuiBap/',import.meta.url);const m=JSON.parse(fs.readFileSync(new URL('manifest.json',base)));
  /* Ghim cứng một số phiên bản ở đây thì mọi lần nâng bản đều báo đỏ vì lý do không
     liên quan gì tới điều bài này bảo vệ, và người sửa quen tay sửa số cho xong.
     Bất biến thật: manifest, version_name (con số Chrome HIỆN cho người dùng) và
     package.json phải cùng một phiên bản. */
  const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',base)));
  assert.match(m.version,/^\d+\.\d+\.\d+$/);assert.equal(m.version,pkg.version,'manifest.json và package.json lệch phiên bản');
  if(m.version_name!==undefined)assert.equal(m.version_name,m.version,'version_name lệch version — Chrome sẽ hiện số cũ');for(const file of [m.background.service_worker,m.action.default_popup,m.options_page,...Object.values(m.icons),...m.content_scripts.flatMap(s=>s.js)])assert.ok(fs.existsSync(new URL(file,base)),file);const old=JSON.parse(fs.readFileSync(new URL('./fixtures/original-manifest.json',import.meta.url)));assert.deepEqual(m.host_permissions,old.host_permissions.filter(p=>!p.includes('localhost')));assert.ok(m.permissions.includes('nativeMessaging'));assert.equal(m.key,old.key);});
