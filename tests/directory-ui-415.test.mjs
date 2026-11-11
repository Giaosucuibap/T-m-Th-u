import test from 'node:test';
import assert from 'node:assert/strict';
import {investorTermRange,applyInvestorChoice,directoryEntryWithinProvince} from '../GiaoSuCuiBap/investor-input.js';
import {createWardPicker} from '../GiaoSuCuiBap/ward-picker.js';

test('directory selection replaces the active alternative and preserves both surrounding choices',()=>{
  const value='Đức Trọng; ban 1 tỉnh lâm đồng; Đơn Dương';
  const caret=value.indexOf('tỉnh')+2;
  const range=investorTermRange(value,caret);
  assert.equal(range.query,'ban 1 tỉnh lâm đồng');
  const parsed=applyInvestorChoice(value,'vn0012345678',{caret});
  assert.equal(parsed.ok,true);
  assert.equal(parsed.value,'Đức Trọng; vn0012345678; Đơn Dương');
});
test('organization choice appends without treating commas inside an official name as delimiters',()=>{
  assert.equal(applyInvestorChoice('Đơn Dương','Ban quản lý dự án, khu vực Phan Thiết',{append:true}).value,'Đơn Dương; Ban quản lý dự án, khu vực Phan Thiết');
  assert.equal(applyInvestorChoice('vn0012345678','VN0012345678',{append:true}).value,'vn0012345678');
});
test('selection never silently truncates beyond owner count or length limits',()=>{
  const full=Array.from({length:20},(_,i)=>`Đơn vị ${i}`).join('; ');
  assert.equal(applyInvestorChoice(full,'Đơn vị mới',{append:true}).ok,false);
  assert.equal(applyInvestorChoice('A'.repeat(495),'Đơn vị mới',{append:true}).ok,false);
  assert.equal(applyInvestorChoice('Đơn vị','Mục 1; Mục 2').ok,false);
  assert.equal(applyInvestorChoice('Đơn vị','').ok,false);
});
test('selected directory province accepts only canonical names and explicitly provided aliases/codes',()=>{
  const entry={provinceName:'Tỉnh Lâm Đồng',provinceAliases:['Lâm Đồng','703','68']};
  assert.equal(directoryEntryWithinProvince(entry,'lam dong'),true);
  assert.equal(directoryEntryWithinProvince(entry,'Tỉnh Lâm Đồng, Đắk Lắk'),true);
  assert.equal(directoryEntryWithinProvince(entry,'703'),true);
  assert.equal(directoryEntryWithinProvince(entry,'68'),true);
  assert.equal(directoryEntryWithinProvince(entry,''),true);
  for(const wrong of ['Huế','Bình Thuận','Đắk Nông','Lâm Đồng Giả'])assert.equal(directoryEntryWithinProvince(entry,wrong),false,wrong);
});
test('caret boundaries support empty insertion, leading delimiter and newline alternatives',()=>{
  assert.deepEqual(investorTermRange('',0),{start:0,end:0,query:''});
  assert.deepEqual(investorTermRange('; Ban 1',0),{start:0,end:0,query:''});
  assert.equal(applyInvestorChoice('Đức Trọng\nBan 1','vn0012345678').value,'Đức Trọng; vn0012345678');
});

test('combined picker transfer is atomic when owner listeners synchronously read and persist criteria',async()=>{
  const board={id:'B1',name:'Ban Quản lý dự án số 1',provinceName:'Tỉnh Lâm Đồng',queryValue:'vn0012345678',eGpCode:'vn0012345678'};
  const ward={value:'',setCustomValidity(){},dispatchEvent(){}};
  const reads=[];let picker;
  const investor={value:'Đơn Dương',selectionStart:9,dispatchEvent(){reads.push(picker.read());}};
  picker=createWardPicker({province:{value:'Tỉnh Lâm Đồng'},ward,investor,list:{innerHTML:''},hint:{textContent:''},send:async()=>({ok:true,wardIdentities:[],organizationOptions:[board]})});
  await picker.load();ward.value='Ban QLDA · Ban Quản lý dự án số 1 · Tỉnh Lâm Đồng · mã e-GP vn0012345678';
  assert.deepEqual(picker.read(),{ward:''});
  assert.equal(investor.value,'Đơn Dương; vn0012345678');
  assert.deepEqual(reads,[{ward:''},{ward:''}]);
});

test('combined picker rejects an overflowing owner list without converting the organization to a ward code',async()=>{
  const board={id:'B1',name:'Ban Quản lý dự án số 1',provinceName:'Tỉnh Lâm Đồng',queryValue:'vn0012345678',eGpCode:'vn0012345678'};
  let validity='';const ward={value:'',setCustomValidity(value){validity=value;},reportValidity(){}};
  const original=Array.from({length:20},(_,i)=>`Đơn vị ${i}`).join('; ');
  const investor={value:original,selectionStart:original.length,dispatchEvent(){throw Error('Failed transfer must not announce changed owner criteria');}};
  const picker=createWardPicker({province:{value:'Tỉnh Lâm Đồng'},ward,investor,list:{innerHTML:''},hint:{textContent:''},send:async()=>({ok:true,wardIdentities:[],organizationOptions:[board]})});
  await picker.load();ward.value='Ban QLDA · Ban Quản lý dự án số 1 · Tỉnh Lâm Đồng · mã e-GP vn0012345678';
  const criteria=picker.read();assert.match(validity,/Chưa thêm được/);assert.equal(investor.value,original);assert.equal(criteria.wardIdentities,undefined);assert.ok(criteria.ward.startsWith('Ban QLDA'));
});
