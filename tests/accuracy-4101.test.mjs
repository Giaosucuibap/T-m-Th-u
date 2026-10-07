import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, normalizeCandidate, normalizeVersion, standardCode, parseDate, dateRangeFrom, firstStampMs } from '../GiaoSuCuiBap/lib/core.js';
import { matchesAreaCodes, codesForProvinceName, recordCodes } from '../GiaoSuCuiBap/lib/area-match.js';
import { passesHardFilter, hardFilterReason } from '../GiaoSuCuiBap/lib/hard-filter.js';
import { coverageOf, dateGate, classifyByDate } from '../GiaoSuCuiBap/lib/match-gate.js';
import { canaryCheck } from '../GiaoSuCuiBap/lib/canary.js';
import { normalizeKhlcntPlan, classifyPlansByCriteria, filterPlansByArea, dedupeKhlcnt, buildKhlcntQuery } from '../GiaoSuCuiBap/lib/khlcnt.js';
import { normalizeKqlcntRecord, dedupeKqlcnt } from '../GiaoSuCuiBap/lib/kqlcnt.js';
import { normalizeBbmtPackage, bbmtStamp } from '../GiaoSuCuiBap/lib/bbmt.js';

const ld = {provinceCode:'68',provinceCodes:['68'],provinces:['Tỉnh Lâm Đồng'],location:'Tỉnh Lâm Đồng'};
const raw = {notifyNo:'IB2600000001',bidName:'Xây dựng trường học',locations:[{provCode:'68',provName:'Tỉnh Lâm Đồng'}]};
const state = (record,criteria) => passesHardFilter(record,criteria).state;
test('Province identity accepts current and known legacy codes, rejects different codes',()=>{
  for(const provinceCode of ['68','703']) assert.equal(matchesAreaCodes({provinceCode},'Lâm Đồng').ok,true);
  assert.equal(matchesAreaCodes(ld,'Đồng Nai').ok,false);
  assert.equal(matchesAreaCodes({provinceCode:'75'},'Lâm Đồng, Đồng Nai').ok,true);
});
for(const province of ['Tỉnh Đồng Nai','Tỉnh Thanh Hóa','Tỉnh Khánh Hòa']) test(`Canonical label preserves province filter: ${province}`,()=>{
  assert.equal(filterPlansByArea([ld],{province}).kept.length,0);
});
test('Unknown province selection fails closed, including partially recognised multi-selection',()=>{
  assert.equal(matchesAreaCodes({},'Tỉnh Thanh Hóa').state,'INSUFFICIENT');
  assert.equal(matchesAreaCodes(ld,'Tỉnh Không tồn tại').state,'INSUFFICIENT');
  assert.equal(matchesAreaCodes(ld,'Lâm Đồng,Tỉnh Không tồn tại').state,'INSUFFICIENT');
  assert.equal(matchesAreaCodes({},'').state,'MATCH');
});
test('Resolved catalog codes take precedence and exact cached names include every legacy entry',()=>{
  const areas={provinces:[{name:'Tỉnh Thanh Hóa',code:'38'},{name:'Tỉnh Thanh Hóa',code:'401'}]};
  assert.deepEqual(codesForProvinceName('Thanh Hóa',areas),['38','401']);
  assert.equal(matchesAreaCodes({provinceCode:'401'},{province:'Thanh Hóa',provinces:['38','401']}).ok,true);
  assert.equal(matchesAreaCodes(ld,{province:'Thanh Hóa',provinces:['38','401']}).ok,false);
});
test('A conflicting province code cannot be overridden by matching text; ward digits are not province codes',()=>{
  assert.equal(matchesAreaCodes({...ld,provinceCode:'75',provinceCodes:[]},'Lâm Đồng').ok,false);
  assert.deepEqual(recordCodes({wardCode:'68001',parentCode:'68',areaCode:'68001'}),[]);
  assert.equal(matchesAreaCodes({provinceCode:'68001'},'Lâm Đồng').state,'INSUFFICIENT');
});
test('Text fallback is explicit and canonical, while an unlocated record stays insufficient',()=>{
  assert.equal(matchesAreaCodes({location:'Xã A - Tỉnh Thanh Hóa'},'Thanh Hóa').reason,'text-fallback');
  assert.equal(matchesAreaCodes({location:'Xã A'},'Thanh Hóa').state,'INSUFFICIENT');
});
test('Missing prices never become zero in either a minimum or maximum gate',()=>{
  for(const price of [null,undefined,'',' ','null','NaN',Infinity]) for(const bounds of [{minPrice:3e9},{maxPrice:3e9}]) {
    const result=passesHardFilter({price},bounds);
    assert.equal(result.state,'INSUFFICIENT',String(price)); assert.equal(result.reason,'insufficient-price');
  }
  assert.equal(state(normalizeCandidate(raw),{maxPrice:3e9}),'INSUFFICIENT');
  assert.equal(state({price:0},{maxPrice:3e9}),'MATCH');
});
test('Known prices respect inclusive bounds without rounding fractional source values',()=>{
  assert.equal(state({price:1e9},{minPrice:3e9}),'OUT_OF_RANGE');
  assert.equal(state({price:3e9},{minPrice:3e9,maxPrice:3e9}),'MATCH');
  assert.equal(state({price:2609041591.923},{maxPrice:3e9}),'MATCH');
  assert.equal(state({price:2609041591.923},{minPrice:2609041592}),'OUT_OF_RANGE');
  assert.equal(state({price:'2609041591.923'},{minPrice:2609041592}),'OUT_OF_RANGE');
});
test('Invalid bounds are visible insufficient decisions, not silently disabled filters',()=>{
  for(const criteria of [{minPrice:'bad'},{minPrice:5,maxPrice:3},{minPrice:-1}]) assert.equal(state({price:10},criteria),'INSUFFICIENT');
});
test('Investor names compare complete tokens and codes compare full identities',()=>{
  assert.equal(state({investorName:'Chủ đầu tư B'},{investor:'Chủ đầu tư A'}),'OUT_OF_RANGE');
  assert.equal(state({investorName:'Ban quản lý đầu tư dự án'},{investor:'Ban quản lý dự án'}),'MATCH');
  assert.equal(state({investorCode:'vn0123456789'},{investor:'0123456789'}),'MATCH');
  assert.equal(state({investorCode:'vn01234567890'},{investor:'0123456789'}),'OUT_OF_RANGE');
  assert.equal(state({investorName:'null'},{investor:'Ban QLDA'}),'INSUFFICIENT');
});
test('Ward check rejects another ward and does not turn investor-name inference into verified location',()=>{
  assert.equal(state({location:'Xã Bảo Lâm',wardCode:'A',provinceCode:'68'},{ward:'Xã Đạ Tẻh',wardCode:'B',wardParentCode:'68'}),'OUT_OF_RANGE');
  assert.equal(state({investorName:'Ban QLDA Đạ Tẻh'},{ward:'Xã Đạ Tẻh'}),'INSUFFICIENT');
  assert.equal(state({location:'Xã Đạ Tẻh - Tỉnh Lâm Đồng'},{ward:'Đạ Tẻh'}),'INSUFFICIENT');
  assert.equal(state({wardCode:'B',provinceCode:'68'},{wardCode:'B',wardParentCode:'68'}),'MATCH');
});
test('Keyword applies with or without investor; score cannot bypass title gates',()=>{
  assert.equal(state({bidName:'Xây trạm bơm',score:100},{keyword:'trường học'}),'OUT_OF_RANGE');
  assert.equal(state({bidName:'Tư vấn thiết kế',score:100},{mustKeywords:'thi công'}),'OUT_OF_RANGE');
  assert.equal(state({bidName:'Lắp phần mềm'},{excludeKeywords:'phần mềm'}),'OUT_OF_RANGE');
  assert.equal(state({bidName:'',notifyNo:'IB2600000001'},{mustKeywords:'thi công'}),'INSUFFICIENT');
});
test('Identifier keywords match record identities without contaminating free-text title checks',()=>{
  assert.equal(state({notifyNo:'IB2600000001',bidName:'Tên khác'},{keyword:'IB2600000001'}),'MATCH');
  assert.equal(state({planNo:'PL2600085770',bidName:'Tên khác'},{keyword:'PL2600085770'}),'MATCH');
  assert.equal(state({notifyNo:'IB2600000002',bidName:'Tên khác'},{keyword:'IB2600000001'}),'OUT_OF_RANGE');
});
test('Subtype filtering retains 4.8.1 abbreviations and reports an unknown field',()=>{
  for(const [bidName,category] of [['TVGS thi công','TV_SUPERVISION'],['TVTK công trình','TV_DESIGN'],['TVKS địa chất','TV_SURVEY']]) {
    assert.equal(state({bidName,investField:'TV'},{category}),'MATCH');
    assert.equal(state({bidName},{category}),'INSUFFICIENT');
  }
  assert.equal(state({bidName:'Gói số 1'},{category:'XL'}),'INSUFFICIENT');
  assert.equal(state({bidName:'Xây nhà',investField:'XL'},{category:'TV'}),'OUT_OF_RANGE');
});
test('Every failed criterion is recorded and a definite mismatch dominates a missing field',()=>{
  const result=passesHardFilter({provinceCode:'75',price:null,bidName:'Tư vấn thiết kế'},{province:'Lâm Đồng',minPrice:1e9,mustKeywords:'thi công'});
  assert.equal(result.state,'OUT_OF_RANGE'); assert.equal(result.ok,false);
  assert.deepEqual(result.reasons.map(r=>r.field),['province','price','mustKeywords']);
  assert.equal(hardFilterReason(result),'Khác tỉnh/thành đã chọn');
});
test('Vietnam day and year edges have the same epoch in every host timezone',()=>{
  const expected={from:Date.parse('2025-12-31T17:00:00Z'),to:Date.parse('2026-12-31T16:59:59.999Z')};
  assert.deepEqual(dateRangeFrom({fromYear:2026,toYear:2026}),expected);
  const range=dateRangeFrom({fromDate:'2026-06-01',toDate:'2026-06-01'});
  assert.equal(dateGate(firstStampMs({date:'01/06/2026 05:00:00'},['date']),range),'MATCH');
  assert.equal(dateGate(firstStampMs({date:'2026-06-01T23:59:59'},['date']),range),'MATCH');
});
test('Date groups are disjoint; missing requested dates are not matches',()=>{
  const range={from:10,to:20}, rows=[{t:10},{t:null},{t:9}];
  const groups=classifyByDate(rows,range,r=>r.t);
  assert.equal(groups.match.length,1);assert.equal(groups.insufficient.length,1);assert.equal(groups.outOfRange.length,1);
  assert.equal(dateGate(null,null),'MATCH');
  assert.equal(state({},{fromDate:'2026-06-01',toDate:'2026-06-30'}),'INSUFFICIENT');
  assert.equal(state({},{fromDate:'2026-02-31'}),'INSUFFICIENT');
});
test('A single date/year bound stays open and reversed dates preserve full calendar days',()=>{
  const future=dateRangeFrom({fromDate:'2099-06-01'});
  assert.equal(dateGate(Date.parse('2099-07-01T00:00:00Z'),future),'MATCH');
  assert.equal(dateGate(Date.parse('2099-05-31T00:00:00Z'),future),'OUT_OF_RANGE');
  assert.equal(dateGate(Date.parse('1990-01-01T00:00:00Z'),dateRangeFrom({toDate:'1999-12-31'})),'MATCH');
  assert.equal(dateGate(Date.parse('2100-01-01T00:00:00Z'),dateRangeFrom({fromYear:2099})),'MATCH');
  assert.equal(dateGate(Date.parse('1900-01-01T00:00:00Z'),dateRangeFrom({toYear:1999})),'MATCH');
  assert.deepEqual(dateRangeFrom({fromDate:'2026-06-30',toDate:'2026-06-01'}),dateRangeFrom({fromDate:'2026-06-01',toDate:'2026-06-30'}));
  assert.equal(Number.isFinite(JSON.parse(JSON.stringify(future)).to),true);
});
test('Approval filtering retains late-published plans and never substitutes publication for approval',()=>{
  const criteria={fromDate:'2026-09-01',toDate:'2026-09-30'};
  const query=buildKhlcntQuery(criteria);
  assert.equal(query.filters.some(f=>f.fieldName==='publicDate'),false);
  const plan={key:'p',decisionDate:'2026-09-01T10:00:00',publicDate:'2026-11-10T10:00:00',packages:[{name:'Xây trường',price:1e9}]};
  assert.equal(classifyPlansByCriteria([plan],criteria).match.length,1);
  const missing={...plan,decisionDate:null,publicDate:'2026-09-01T10:00:00'};
  assert.equal(classifyPlansByCriteria([missing],criteria).insufficient.length,1);
});
test('Coverage distinguishes known empty sources, unknown totals, and completed pages',()=>{
  assert.equal(coverageOf({serverTotal:0,totalPages:0,fetched:0,done:true}).complete,true);
  assert.equal(coverageOf({fetched:50,match:50,done:true}).complete,false);
  assert.equal(coverageOf({serverTotal:150,fetched:50,pagesRead:1,totalPages:3}).complete,false);
  assert.equal(coverageOf({serverTotal:150,fetched:150,pagesRead:3,totalPages:3}).complete,true);
  assert.equal(coverageOf({serverTotal:150,fetched:150,pagesRead:3,totalPages:3,done:false}).complete,false);
  assert.equal(coverageOf({serverTotal:150,fetched:150,pagesRead:3,totalPages:3,partial:true,done:true}).complete,false);
});
test('Coverage counts unique contiguous pages and rejects contradictory classification totals',()=>{
  const full=coverageOf({serverTotal:3,fetched:3,totalPages:3,pageIndexes:[0,1,1,2],done:true});
  assert.equal(full.pagesRead,3);assert.equal(full.complete,true);assert.equal(full.done,true);
  assert.equal(coverageOf({serverTotal:3,fetched:3,totalPages:3,pageIndexes:[0,2,3],done:true}).complete,false);
  assert.equal(coverageOf({serverTotal:1,fetched:1,match:1,insufficient:1}).consistent,false);
  assert.equal(coverageOf().serverTotal,null);
});
test('Canary must fail empty, null, throwing, or field-corrupting normalizers',()=>{
  for(const normalizer of [()=>null,()=>({}),()=>{throw Error('schema');}]) {const result=canaryCheck(normalizer,parseDate);assert.equal(result.ok,false);assert.equal(result.pass,0);}
  const corrupt=raw=>({...normalizeCandidate(raw),price:123});
  assert.equal(canaryCheck({tbmt:corrupt,khlcnt:normalizeKhlcntPlan},parseDate).ok,false);
  assert.equal(canaryCheck({tbmt:normalizeCandidate,khlcnt:normalizeKhlcntPlan},()=> 'wrong-date').pass,0);
});
test('Canary requires correct per-type normalizers, expected price/date/id and all four records',()=>{
  const result=canaryCheck({tbmt:normalizeCandidate,khlcnt:normalizeKhlcntPlan},parseDate);
  assert.equal(result.ok,true);assert.equal(result.pass,4);assert.equal(result.total,4);assert.equal(result.offline,true);
  assert.equal(canaryCheck(normalizeCandidate,parseDate).ok,false);
});
test('Plan criteria apply to child price/title and preserve originals for reconciliation',()=>{
  const plan={key:'p',planNo:'PL2600085770',name:'Kênh mương lớn',provinces:['Lâm Đồng'],packageCount:4,totalPackagePrice:8.7e9,packages:[
    {name:'Thi công kênh mương',price:8e9},{name:'Thi công kênh mương A',price:2e8},{name:'Thi công kênh mương B',price:3e8},{name:'Phần mềm kênh mương',price:2e8}]};
  const result=classifyPlansByCriteria([plan],{province:'Lâm Đồng',minPrice:1e8,maxPrice:4e8,mustKeywords:'kênh mương',excludeKeywords:'phần mềm'});
  assert.equal(result.match.length,1);assert.equal(result.match[0].packageCount,2);assert.equal(result.match[0].totalPackagePrice,5e8);
  assert.equal(result.match[0].originalTotalPackagePrice,8.7e9);assert.equal(result.outOfRange[0].packageCount,2);
  assert.equal(plan.packages.length,4);assert.deepEqual(result.counts,{packages:4,match:2,insufficient:0,outOfRange:2,missingPackageTables:0});
});
test('Plan missing price/date is retained separately and never counted as a matching package',()=>{
  const plan={key:'p',planNo:'PL2600085770',packages:[{name:'Xây trường',price:2e9},{name:'Xây nhà',price:null}]};
  const byPrice=classifyPlansByCriteria([plan],{maxPrice:3e9});
  assert.equal(byPrice.match[0].packageCount,1);assert.equal(byPrice.insufficient[0].packageCount,1);assert.equal(byPrice.counts.packages,2);
  const byDate=classifyPlansByCriteria([plan],{fromDate:'2026-06-01',toDate:'2026-06-30'});
  assert.equal(byDate.match.length,0);assert.equal(byDate.insufficient[0].packageCount,2);
  assert.equal(classifyPlansByCriteria([{key:'p'}],{}).insufficient[0].filterReason,'insufficient-packages');
});
test('A project title or mixed plan field cannot classify an unrelated child',()=>{
  const plan={key:'p',name:'Tư vấn thiết kế',fieldCodes:['XL','TV'],packages:[{name:'Mua phần mềm',price:2e8}]};
  assert.equal(classifyPlansByCriteria([plan],{keyword:'thiết kế'}).match.length,0);
  assert.equal(classifyPlansByCriteria([plan],{category:'TV'}).match.length,0);
});
test('Literal-null versions normalize consistently across TBMT, KHLCNT, KQLCNT and BBMT',()=>{
  for(const value of [null,'null','undefined','NaN',' NULL ']) {assert.equal(cleanText(value),'');assert.equal(normalizeVersion(value),'00');}
  assert.equal(standardCode('IB2600000001-null','IB2600000001','null'),'IB2600000001-00');
  assert.equal(normalizeCandidate({...raw,notifyVersion:'null'}).version,'00');
  assert.equal(normalizeKhlcntPlan({planNo:'PL2600085770',planVersion:'null'}).planNoStand,'PL2600085770-00');
  assert.equal(normalizeKqlcntRecord({...raw,notifyVersion:'null'}).notifyNoStand,'IB2600000001-00');
  assert.equal(normalizeBbmtPackage({...raw,notifyVersion:'null'}).notifyNoStand,'IB2600000001-00');
});
test('Normalization keeps catalog identities for future gates and legacy dates sort chronologically',()=>{
  const result=normalizeCandidate({...raw,investorCode:'vn0123456789'});
  assert.deepEqual(result.provinceCodes,['68']);assert.equal(result.investorCode,'vn0123456789');
  const plans=[{key:'A',decisionDate:'13/06/2026 05:00:00'},{key:'B',decisionDate:'14/07/2026 05:00:00'}];
  assert.deepEqual(dedupeKhlcnt(plans).map(p=>p.key),['B','A']);
  assert.deepEqual(dedupeKqlcnt(plans).map(p=>p.key),['B','A']);
  assert.equal(bbmtStamp({bidRealityOpenDate:'14/07/2026 05:00:00'}),Date.parse('2026-07-13T22:00:00Z'));
});
test('BBMT normalization preserves investor codes and code-only locations used by the listing gate',()=>{
  const raw={notifyNo:'IB2600000011',bidName:'Thi công kênh mương',bidPrice:3e9,investorName:'Ban QLDA',investorCode:'vn0123456789',
    procuringEntityName:'Bên mời thầu',procuringEntityCode:'vn0987654321',investField:'XL',locations:[{provCode:'68',wardCode:'B',wardName:'Xã Đạ Tẻh'}],bidRealityOpenDate:'2026-09-14T10:00:00'};
  const normal=normalizeBbmtPackage(raw);
  for(const investor of ['vn0123456789','vn0987654321']) assert.equal(state(normal,{investor}),'MATCH');
  assert.equal(state(normal,{provinces:['68'],ward:'Đạ Tẻh',wardCode:'B',wardParentCode:'68',category:'XL'}),'MATCH');
  assert.equal(state(normal,{provinces:['38']}),'OUT_OF_RANGE');
  assert.deepEqual(normal.provinceCodes,['68']);
  assert.equal(state(normalizeBbmtPackage({...raw,locations:[],provinceCode:'38'}),{provinces:['38']}),'MATCH');
});
test('KHLCNT preserves both investor identities, direct province codes, and ward names for the common gate',()=>{
  const normal=normalizeKhlcntPlan({planNo:'PL2600085770',investorName:'Chủ đầu tư',investorCode:'vn0123456789',procuringEntityName:'Bên mời thầu',
    procuringEntityCode:'vn0987654321',provCode:'38',wardCode:'A',wardName:'Xã A',bidName:['Thi công trường'],bidPrice:[1e9]});
  assert.deepEqual(normal.investorCodes,['vn0123456789','vn0987654321']);
  assert.deepEqual(normal.provinceCodes,['38']);
  for(const investor of ['vn0123456789','vn0987654321']) {
    assert.equal(classifyPlansByCriteria([normal],{investor,provinces:['38'],ward:'Xã A',wardCode:'A',wardParentCode:'38'}).match.length,1);
  }
  assert.equal(classifyPlansByCriteria([normal],{investor:'Chủ đầu tư'}).match.length,1);
  assert.equal(classifyPlansByCriteria([normal],{investor:'vn1111111111'}).outOfRange.length,1);
});
