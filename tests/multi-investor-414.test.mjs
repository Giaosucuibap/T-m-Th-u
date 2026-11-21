import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInvestorFilter,compileInvestorFilter,matchesInvestorFilter,MAX_INVESTOR_TERMS,MAX_INVESTOR_TEXT_LENGTH} from '../GiaoSuCuiBap/lib/investor-filter.js';
import {passesHardFilter,hardFilterReason} from '../GiaoSuCuiBap/lib/hard-filter.js';
import {validateCriteria,safeSavedSearches} from '../GiaoSuCuiBap/lib/workspace.js';
import {observationsFromBidOpen,observationsFromWinner,discountProfile,competitionStats,winThreshold,investorMatrix} from '../GiaoSuCuiBap/lib/analytics.js';

const selected='Đức Trọng; Đơn Dương; Phan Thiết';
const criteria={investor:selected,province:'Lâm Đồng',provinces:['703']};
const owner=(investorName,extra={})=>({investorName,provinceCode:'703',...extra});
const observation=(notifyNo,investorName,extra={})=>({notifyNo,investorName,taxCode:'0101234567',contractorName:'Nhà thầu A',confidence:'exact',source:'bbmt',discountPercent:5,packageBasis:3e9,bidderCount:2,field:'XL',...extra});

test('414 investor list trims, deduplicates Vietnamese names and preserves comma inside one organization',()=>{
  const parsed=parseInvestorFilter('  Đức Trọng ; duc trong\r\n ĐƠN DƯƠNG\nPhan Thiết;Ban QLDA, khu vực A; ');
  assert.equal(parsed.ok,true);assert.deepEqual(parsed.terms,['Đức Trọng','ĐƠN DƯƠNG','Phan Thiết','Ban QLDA, khu vực A']);
  assert.equal(parsed.value,'Đức Trọng; ĐƠN DƯƠNG; Phan Thiết; Ban QLDA, khu vực A');
  assert.equal(parseInvestorFilter(parsed.value).value,parsed.value);
  assert.deepEqual(parseInvestorFilter('0012345678; VN0012345678; 0012345678-001; vn0012345678-001').terms,['0012345678','0012345678-001']);
});

test('414 absent or blank investor is intentionally no filter; malformed selections never broaden the search',()=>{
  for(const value of [null,undefined,'','  \t '])assert.equal(matchesInvestorFilter({},value).state,'MATCH');
  for(const value of [false,0,123456789,[],['Đức Trọng'],{},'; ;\n','...','null','undefined','NaN','Đức Trọng; !!!']){
    assert.equal(parseInvestorFilter(value).ok,false,JSON.stringify(value));
    const result=matchesInvestorFilter(owner('Đức Trọng'),value);assert.equal(result.state,'INSUFFICIENT');assert.equal(result.reason,'invalid-investor-filter');
    assert.equal(validateCriteria({...criteria,investor:value}).ok,false,JSON.stringify(value));
    assert.equal(passesHardFilter(owner('Đức Trọng'),{investor:value}).state,'INSUFFICIENT');
  }
  assert.equal(hardFilterReason('invalid-investor-filter'),'Danh sách chủ đầu tư không hợp lệ');
});

test('414 investor count and size limits reject the full selection rather than truncate later entries',()=>{
  assert.equal(MAX_INVESTOR_TERMS,20);assert.equal(MAX_INVESTOR_TEXT_LENGTH,500);
  assert.equal(parseInvestorFilter(Array.from({length:20},(_,i)=>`Đơn vị ${i}`).join(';')).ok,true);
  const tooMany=Array.from({length:21},(_,i)=>`Đơn vị ${i}`).join(';');
  for(const value of [tooMany,'Đức Trọng; '+ 'a'.repeat(500), 'a'.repeat(250)+'\n'+'b'.repeat(249)]){
    assert.equal(parseInvestorFilter(value).ok,false);assert.equal(validateCriteria({...criteria,investor:value}).field,'investor');
    assert.equal(matchesInvestorFilter(owner('Đức Trọng'),value).ok,false);
  }
  assert.equal(parseInvestorFilter('a'.repeat(500)).ok,true);
});

test('414 the three investor groups are OR choices while the selected province remains AND',()=>{
  for(const name of ['UBND xã Đức Trọng','Ban quản lý dự án khu vực Đơn Dương','Văn phòng HĐND và UBND phường Phan Thiết']){
    const result=passesHardFilter(owner(name),criteria);assert.equal(result.state,'MATCH',name);
    assert.equal(passesHardFilter(owner(name,{provinceCode:'75'}),criteria).state,'OUT_OF_RANGE',name);
  }
  assert.equal(passesHardFilter(owner('UBND xã Bảo Lâm'),criteria).state,'OUT_OF_RANGE');
  assert.equal(passesHardFilter({investorName:'UBND xã Đức Trọng'},criteria).state,'INSUFFICIENT');
});

test('414 investor names cannot be inferred from package titles, project names or delivery locations',()=>{
  const misplaced={bidName:'Thi công Đức Trọng',projectName:'Đơn Dương',location:'Phan Thiết - Lâm Đồng',provinceCode:'703'};
  assert.equal(passesHardFilter(misplaced,criteria).reason,'insufficient-investor');
  assert.equal(passesHardFilter({...misplaced,investorName:'UBND xã Bảo Lâm'},criteria).state,'OUT_OF_RANGE');
});

test('414 words must all belong to one owner identity and match full words',()=>{
  for(const row of [owner('Ban Đức',{procuringEntityName:'UBND Trọng'}),owner('',{investorNames:['Ban Đức','UBND Trọng']}),owner('UBND xã Đức Trọng2'),owner('Ban quản lý Phan ThiếtA')]){
    assert.equal(matchesInvestorFilter(row,selected).state,'OUT_OF_RANGE',JSON.stringify(row));
  }
  assert.equal(matchesInvestorFilter(owner('Ban khác',{procuringEntityName:'Ban QLDA Đơn Dương'}),selected).state,'MATCH');
  assert.equal(matchesInvestorFilter(owner('Ban khác',{investorNames:['UBND xã Đức Trọng']}),selected).state,'MATCH');
});

test('414 adding an OR choice never removes a previous single-entry match, including legacy token ordering',()=>{
  const rows=[owner('Ban quản lý đầu tư dự án'),owner('Dự án do Ban quản lý thực hiện'),owner('UBND xã Đức Trọng'),owner('Đơn Dương')];
  for(const single of ['Ban quản lý dự án','Đức Trọng','Đơn Dương'])for(const row of rows){
    if(matchesInvestorFilter(row,single).ok)assert.equal(matchesInvestorFilter(row,`${single}; Phan Thiết`).ok,true);
  }
  assert.equal(matchesInvestorFilter(rows[0],'Ban quản lý dự án').ok,true);
});

test('414 codes compare complete identities with vn and branch aliases, preserving leading zeros',()=>{
  for(const investorCode of ['vn0012345678','0012345678'])assert.equal(matchesInvestorFilter({investorCode},'0012345678; Đức Trọng').ok,true);
  for(const investorCode of ['vn0012345678-001','0012345678001'])assert.equal(matchesInvestorFilter({investorCode},'0012345678-001').ok,true);
  for(const investorCode of ['00123456780','0012345678-002','012345678'])assert.equal(matchesInvestorFilter({investorCode},'0012345678-001').state,'OUT_OF_RANGE');
  assert.equal(matchesInvestorFilter({investorName:'Ban 0012345678'},'0012345678').state,'INSUFFICIENT');
  assert.equal(matchesInvestorFilter({procuringEntityCode:'vn0012345678'},'0012345678').ok,true);
  assert.equal(matchesInvestorFilter({investorCodes:['vn0012345678']},'0012345678').ok,true);
});

test('414 mixed code/name OR preserves unknown-versus-outside semantics',()=>{
  assert.equal(matchesInvestorFilter(owner('UBND xã Bảo Lâm'),'0012345678; Đức Trọng').state,'INSUFFICIENT');
  assert.equal(matchesInvestorFilter(owner('UBND xã Bảo Lâm',{investorCode:'vn0098765432'}),'0012345678; Đức Trọng').state,'OUT_OF_RANGE');
  assert.equal(matchesInvestorFilter({investorCode:'vn0098765432'},'0012345678; Đức Trọng').state,'INSUFFICIENT');
  assert.equal(matchesInvestorFilter(owner('UBND xã Đức Trọng'),'0012345678; Đức Trọng').state,'MATCH');
  for(const investorName of [null,undefined,'null','NaN',{},[]])assert.equal(matchesInvestorFilter({investorName},selected).state,'INSUFFICIENT');
});

test('414 price, category, keyword and province gates still apply to an investor OR match',()=>{
  const row=owner('UBND xã Đức Trọng',{price:3e9,investField:'XL',bidName:'Thi công kênh mương'});
  assert.equal(passesHardFilter(row,{...criteria,minPrice:3e9,maxPrice:3e9,category:'XL',keyword:'kênh mương'}).ok,true);
  for(const patch of [{minPrice:4e9},{category:'TV'},{keyword:'trường học'},{excludeKeywords:'kênh'}])assert.equal(passesHardFilter(row,{...criteria,...patch}).state,'OUT_OF_RANGE');
});

test('414 saved searches preserve OR entries, normalized identity and province scope after a round trip',()=>{
  const raw={...criteria,investor:' Đức Trọng\nĐơn Dương; PHAN THIẾT; duc trong '};
  const saved=safeSavedSearches([{id:'a',name:'Ba địa bàn',criteria:raw},{id:'invalid',name:'Bị lỗi',criteria:{...raw,investor:';'}}]);
  assert.equal(saved.length,1);assert.equal(saved[0].criteria.investor,'Đức Trọng; Đơn Dương; PHAN THIẾT');
  assert.deepEqual(saved[0].criteria.provinces,['703']);assert.deepEqual(safeSavedSearches(saved),saved);
  assert.equal(passesHardFilter(owner('Ban QLDA Đơn Dương'),saved[0].criteria).ok,true);
});

test('414 compiled investor predicates never cache stale row text or mutate criteria and records',()=>{
  const match=compileInvestorFilter(selected),row=owner('UBND xã Đức Trọng');
  assert.equal(match(row).ok,true);row.investorName='UBND xã Bảo Lâm';assert.equal(match(row).ok,false);
  const before=JSON.stringify(row);match(row);assert.equal(JSON.stringify(row),before);
  assert.equal(matchesInvestorFilter(null,selected).state,'INSUFFICIENT');assert.equal(matchesInvestorFilter([],selected).state,'INSUFFICIENT');
});

test('414 observations retain code and procuring-entity evidence for the same analytics filter',()=>{
  const identity={investorName:'Ban A',investorCode:'vn0012345678',procuringEntityName:'Ban QLDA Đức Trọng',procuringEntityCode:'vn0098765432',investorNames:['Ban khác'],investorCodes:['vn0055555555']};
  const bbmt=observationsFromBidOpen({...identity,notifyNo:'IB1',bidders:[{taxCode:'0101234567',name:'Nhà thầu A',discountPercent:5}]})[0];
  const winner=observationsFromWinner({...identity,notifyNo:'IB2',winningTaxCodes:['0101234567'],winningPrice:10})[0];
  for(const row of [bbmt,winner])for(const value of ['0012345678','0098765432','0055555555',selected])assert.equal(matchesInvestorFilter(row,value).ok,true,value);
});

test('414 discount, competition, winner thresholds and owner matrix use the same OR filter',()=>{
  const rows=[observation('IB1','UBND xã Đức Trọng',{won:true}),observation('IB2','Ban QLDA Đơn Dương',{won:true}),observation('IB3','UBND phường Phan Thiết',{won:true}),observation('IB4','UBND xã Bảo Lâm',{won:true})];
  assert.equal(discountProfile(rows,{investor:selected}).total,3);assert.equal(competitionStats(rows,{investor:selected}).packageCount,3);
  assert.equal(winThreshold(rows,{investor:selected}).total,3);assert.equal(investorMatrix(rows,{investor:selected,minPackages:1}).length,3);
  for(const investor of [';',{}]){
    assert.equal(discountProfile(rows,{investor}).total,0);assert.equal(competitionStats(rows,{investor}).packageCount,0);
    assert.equal(winThreshold(rows,{investor}).total,0);assert.equal(investorMatrix(rows,{investor,minPackages:1}).length,0);
  }
});

test('414 analytics ignores a stale investorFold string when the original owner name no longer matches',()=>{
  const rows=[observation('IB1','UBND xã Bảo Lâm',{investorFold:'ubnd xa duc trong'})];
  assert.equal(discountProfile(rows,{investor:'Đức Trọng'}).total,0);assert.equal(competitionStats(rows,{investor:'Đức Trọng'}).packageCount,0);
});
