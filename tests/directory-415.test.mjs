import test from 'node:test';import assert from 'node:assert/strict';
import {createOrganizationDirectory,officialDirectoryEntries,observationsFromRows,mergeDirectoryObservations,directoryProvinceNames} from '../GiaoSuCuiBap/lib/organization-directory.js';
import {createDirectoryRuntime,ORGANIZATION_CACHE_KEY} from '../GiaoSuCuiBap/lib/runtime-directory.js';
const url='https://lamdong.gov.vn/decision/checked',portal='https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?notifyNo=IB2600000001';
const board={id:'lamdong-1',name:'Ban Quản lý dự án đầu tư xây dựng số 1',provinceName:'Tỉnh Lâm Đồng',aliases:['ban 1','Ban QLDA số 1 Lâm Đồng'],status:'observed-operating',sources:[{url,date:'2026-09-24'}],verifiedAt:'2026-10-05'};
const data={checkedAt:'2026-10-05',entries:[board,{...board,id:'laocai-1',provinceName:'Tỉnh Lào Cai'}]};
const areas={provinces:[{code:'703',name:'Tỉnh Lâm Đồng'},{code:'68',name:'Tỉnh Lâm Đồng'},{code:'10',name:'Tỉnh Lào Cai'}]};
const row=(extra={})=>({key:'a',notifyNo:'IB2600000001',version:'00',investorName:board.name,investorCode:'vnz000123456',locations:[{provCode:'68',provName:'Tỉnh Lâm Đồng'}],detailUrl:portal,...extra});
const obs=(extra={})=>observationsFromRows([row(extra)],areas,'2026-10-05T03:00:00Z');

test('415 directory shows only sourced current organizations, never fabricated tax-derived portal codes',()=>{
 const list=officialDirectoryEntries({entries:[board,{...board,id:'tax',eGpCode:'vn5800000000'},{...board,id:'gone',status:'superseded'},{...board,id:'nosource',sources:[]}]});
 assert.equal(list.length,2);for(const item of list){assert.equal(item.eGpCode,'');assert.equal(item.queryValue,board.name);assert.equal(item.kind,'organization');}
});
test('415 abbreviations and province-qualified shorthand resolve to the selected official name',()=>{
 const d=createOrganizationDirectory(data);for(const q of ['ban 1 tỉnh lâm đồng','BAN1 LÂM ĐỒNG','ban 1']){
  const r=d.resolve(q,'Tỉnh Lâm Đồng');assert.equal(r.ok,true);assert.equal(r.value,board.name);
 }
 assert.equal(d.search({province:'Lâm Đồng',query:'ban1'}).entries[0].id,'lamdong-1');
 assert.equal(d.search({province:'Lào Cai',query:'ban1'}).entries[0].id,'laocai-1');
});
test('415 a shared board number without province is ambiguous and cannot start a broad query',()=>{
 const r=createOrganizationDirectory(data).resolve('ban1');assert.equal(r.ok,false);assert.equal(r.error,'ambiguous-directory');
});
test('415 geographic owner fragments retain multi-owner OR behavior',()=>{
 const d=createOrganizationDirectory({...data,entries:[board,{...board,name:'Ban QLDA khu vực Đức Trọng',aliases:['Ban QLDA Đức Trọng']}]});
 assert.equal(d.resolve('Đức Trọng; Đơn Dương; Phan Thiết','Lâm Đồng').value,'Đức Trọng; Đơn Dương; Phan Thiết');
});
test('415 fuzzy suggestions require selection; a partial phrase never asserts an identity',()=>{
 const d=createOrganizationDirectory(data);assert.ok(d.search({province:'Lâm Đồng',query:'ban quản lý số'}).total>0);
 assert.equal(d.resolve('ban quản lý số','Lâm Đồng').value,'ban quản lý số');
 assert.equal(d.search({province:'Tỉnh Đồng Nai',query:'ban1'}).total,0);
});
test('415 matched current full names can adopt a portal identity with explicit province proof',()=>{
 const d=createOrganizationDirectory(data,obs());const r=d.resolve('ban1 tỉnh Lâm Đồng','Lâm Đồng');assert.equal(r.value,'vnz000123456');
 const e=d.search({province:'Lâm Đồng',query:'ban1'}).entries[0];assert.equal(e.status,'official');assert.equal(e.egpProof.reference,'IB2600000001');assert.ok(e.evidenceLabel.includes('đã đối chiếu'));
});
test('415 a trailing province name on e-GP does not create a duplicate of the current board',()=>{
 const d=createOrganizationDirectory(data,obs({investorName:board.name+' tỉnh Lâm Đồng'}));assert.equal(d.resolve('ban1','Lâm Đồng').value,'vnz000123456');
});
test('415 another province or similar board number cannot donate its code',()=>{
 for(const o of [obs({locations:[{provCode:'10',provName:'Tỉnh Lào Cai'}]}),obs({investorName:board.name.replace('số 1','số 11')})]){
  assert.equal(createOrganizationDirectory(data,o).resolve('ban1','Lâm Đồng').value,board.name);
 }
});
test('415 predecessor aliases cannot transfer an old organization code to its successor',()=>{
 const d=createOrganizationDirectory({...data,entries:[{...board,aliases:['Ban QLDA huyện cũ']}]},obs({investorName:'Ban QLDA huyện cũ'}));
 assert.equal(d.resolve('Ban QLDA huyện cũ','Lâm Đồng').value,board.name);
 assert.equal(d.search({province:'Lâm Đồng',query:'huyện cũ'}).entries.find(e=>e.status==='observed').queryValue,'vnz000123456');
});
test('415 conflicting live codes stay separate and cannot silently pick the first',()=>{
 const d=createOrganizationDirectory(data,[...obs(),...obs({investorCode:'vnz000654321'})]);const r=d.resolve('ban1','Lâm Đồng');assert.equal(r.error,'ambiguous-directory-code');
 assert.equal(d.entries.filter(e=>e.eGpCode).length,2);assert.equal(d.entries.find(e=>e.id==='lamdong-1').codeConflict,true);
});

test('415 an equally recent conflicting code cannot silently retain the seed code',()=>{
 const seed={...board,eGpCode:'vnz000123456',egpProof:obs()[0].egpProof};
 const d=createOrganizationDirectory({entries:[seed]},obs({investorCode:'vnz000654321'}));
 const e=d.entries.find(e=>e.id===seed.id);assert.equal(e.codeConflict,true);assert.equal(e.eGpCode,'');assert.equal(d.resolve('ban1','Lâm Đồng').error,'ambiguous-directory-code');
});
test('415 old project history does not replace a newer portal identity',()=>{
 const seed={...board,eGpCode:'vnz000123456',egpProof:{...obs()[0].egpProof,recordDecisionDate:'2026-09-24'}};
 const d=createOrganizationDirectory({entries:[seed]},obs({investorCode:'vnz000654321',decisionDate:'2024-01-01'}));
 assert.equal(d.resolve('ban1','Lâm Đồng').value,'vnz000123456');
});
test('415 contradictory province name and numeric code cannot teach cross-province identities',()=>{
 const catalog={provinces:[...areas.provinces,{code:'75',name:'Tỉnh Đồng Nai'}]};
 assert.equal(observationsFromRows([row({locations:[{provCode:'75',provName:'Tỉnh Lâm Đồng'}]})],catalog).length,0);
});
test('415 current legal city labels retain exact portal identities and legacy name resolution',()=>{
 const provinces=['Thành phố Đồng Nai','Thành phố Bắc Ninh','Thành phố Quảng Ninh'];
 assert.deepEqual(directoryProvinceNames(['Tỉnh Đồng Nai','Tỉnh Bắc Ninh','Tỉnh Quảng Ninh','Thành phố Đồng Nai','Tỉnh Lâm Đồng'],{provinces}),[...provinces,'Tỉnh Lâm Đồng']);
 const d=createOrganizationDirectory({provinces,entries:[{...board,provinceName:provinces[0]}]});
 for(const province of ['Đồng Nai','Tỉnh Đồng Nai','Thành phố Đồng Nai','75'])assert.equal(d.resolve('ban1',province).value,board.name);
});
test('415 observe only verified own name/code pairs, never independent name/code arrays',()=>{
 assert.equal(observationsFromRows([row({investorCode:'',investorNames:[board.name],investorCodes:['vnz000123456']})],areas).length,0);
 const records=obs({procuringEntityName:'Công ty tư vấn A',procuringEntityCode:'vn0100000001'});assert.equal(records.length,2);
 assert.equal(records.find(r=>r.name==='Công ty tư vấn A').eGpCode,'vn0100000001');
});
test('415 missing source, missing province, missing reference and invalid IDs cannot become suggestions',()=>{
 for(const extra of [{detailUrl:'https://evil.example/fake'},{detailUrl:''},{notifyNo:''},{locations:[]},{investorCode:'5800000000'},{investorName:{text:'bad'}}])assert.equal(obs(extra).length,0,JSON.stringify(extra));
});
test('415 code observations retain leading zeros, verified source revision and explicit legal uncertainty',()=>{
 const e=obs({investorCode:'vn0012345678',version:'02'})[0];assert.equal(e.queryValue,'vn0012345678');assert.equal(e.egpProof.version,'02');assert.equal(e.status,'observed');assert.ok(e.evidenceLabel.includes('chưa xác nhận'));
});
test('415 latest observation aliases are code-bound and reject malformed persisted entries',()=>{
 const old=obs({investorName:'Tên cũ'}),fresh=observationsFromRows([row()],areas,'2026-10-05T04:00:00Z');
 const list=mergeDirectoryObservations(old,[...fresh,{...fresh[0],eGpCode:'not-code'}]);assert.equal(list.length,1);assert.equal(list[0].name,board.name);assert.ok(list[0].aliases.includes('Tên cũ'));
});
test('415 persisted observations cannot donate codes through a mismatched source pair',()=>{
 const valid=obs()[0];for(const proof of [{...valid.egpProof,codeAtSource:'vnz000654321'},{...valid.egpProof,nameAtSource:'Tên khác'},{...valid.egpProof,provinceName:'Tỉnh Lào Cai'},{...valid.egpProof,reference:''}]){
  const corrupt={...valid,egpProof:proof};assert.equal(mergeDirectoryObservations([corrupt]).length,0);assert.equal(createOrganizationDirectory(data,[corrupt]).resolve('ban1','Lâm Đồng').value,board.name);
 }
});
test('415 input limits stay fail-closed after expanding a shorthand',()=>{
 const long={...board,name:'Ban '+('quản lý '.repeat(70)),aliases:['ban dài']};assert.equal(createOrganizationDirectory({entries:[long]}).resolve('ban dài','Lâm Đồng').ok,false);
 assert.equal(createOrganizationDirectory(data).resolve(Array(21).fill('ban').map((s,i)=>s+i).join('; '),'Lâm Đồng').ok,false);
});
test('415 static portal proof is bound to its own organization, code, province and reference',()=>{
 const proof=obs()[0].egpProof, record={...board,eGpCode:'vnz000123456',egpProof:proof};
 assert.equal(officialDirectoryEntries({entries:[record]})[0].eGpCode,'vnz000123456');
 for(const bad of [{...proof,nameAtSource:board.name.replace('số 1','số 2')},{...proof,provinceName:'Tỉnh Lào Cai'},{...proof,codeAtSource:'vnz000654321'},{...proof,reference:''}])assert.equal(officialDirectoryEntries({entries:[{...record,egpProof:bad}]})[0].eGpCode,'');
 assert.equal(officialDirectoryEntries({entries:[{...record,legalState:'superseded'}]}).length,0);
});
test('415 multiple province names separated by commas share the same exact scope rule',()=>{
 const result=createOrganizationDirectory(data).search({province:'Lâm Đồng, Lào Cai',query:'ban1'});assert.equal(result.total,2);
});
test('415 a row with missing catalog proof can learn its identity when the catalog arrives',async()=>{
 const state={[ORGANIZATION_CACHE_KEY]:{schema:1,entries:[]}},local={get:async q=>({...q,...state}),set:async p=>Object.assign(state,structuredClone(p))};let catalog={};
 const runtime=createDirectoryRuntime({local,storage:{get:async()=>({})},data,getCatalog:async()=>catalog});
 const entry=row({locations:[],provinceCode:'68'});await runtime.observe({tenders:[entry]});assert.equal(state[ORGANIZATION_CACHE_KEY].entries.length,0);
 catalog=areas;await runtime.observe({tenders:[entry]});assert.equal(state[ORGANIZATION_CACHE_KEY].entries.length,1);
});
test('415 runtime migrates the warehouse once, then keystrokes only use its small cached index',async()=>{
 let warehouseReads=0,localReads=0;const state={},storage={get:async()=>{warehouseReads++;return {tenders:[row()],provinceCatalog:areas};}},local={get:async q=>{localReads++;return Object.fromEntries(Object.entries(q).map(([k,v])=>[k,state[k]??v]));},set:async p=>Object.assign(state,structuredClone(p))};
 const runtime=createDirectoryRuntime({local,storage,data,getCatalog:async()=>areas});
 await Promise.all(Array.from({length:20},()=>runtime.search({province:'Lâm Đồng',query:'ban'})));
 assert.equal(warehouseReads,1);assert.equal(localReads,1);assert.equal((await runtime.resolve('ban1','Lâm Đồng')).value,'vnz000123456');
 assert.equal(state[ORGANIZATION_CACHE_KEY].entries.length,1);await runtime.clear();assert.equal((await runtime.resolve('ban1','Lâm Đồng')).value,board.name);
 assert.equal(warehouseReads,1);
});
test('415 directory ingest persistence has its own queue and survives a worker restart',async()=>{
 const state={[ORGANIZATION_CACHE_KEY]:{schema:1,entries:[]}},storage={get:async()=>{throw Error('Unexpected warehouse read');}},local={get:async q=>({...q,...state}),set:async p=>Object.assign(state,structuredClone(p))};
 const create=()=>createDirectoryRuntime({local,storage,data,getCatalog:async()=>areas}),runtime=create();
 await Promise.all([runtime.observe({tenders:[row()]}),runtime.observe({planLookup:{plans:[row({investorCode:'vnz000654321',investorName:'Công ty B'})]}})]);
 assert.equal(state[ORGANIZATION_CACHE_KEY].entries.length,2);assert.equal((await create().resolve('ban1','Lâm Đồng')).value,'vnz000123456');
});
test('415 clearing observations during first-load migration cannot resurrect old suggestions',async()=>{
 let release,entered;const waiting=new Promise(r=>entered=r),blocked=new Promise(r=>release=r),state={};
 const local={get:async q=>{entered();await blocked;return {...q};},set:async p=>Object.assign(state,structuredClone(p))};
 const runtime=createDirectoryRuntime({local,storage:{get:async()=>({tenders:[row()],provinceCatalog:areas})},data,getCatalog:async()=>areas});
 const search=runtime.search({province:'Lâm Đồng'});await waiting;await runtime.clear();release();await search;
 assert.equal(state[ORGANIZATION_CACHE_KEY].entries.length,0);assert.equal((await runtime.resolve('ban1','Lâm Đồng')).value,board.name);
});
