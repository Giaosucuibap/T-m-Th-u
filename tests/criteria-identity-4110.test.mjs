import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCriteria,safeSavedSearches} from '../GiaoSuCuiBap/lib/workspace.js';
import {validateHunt,safeHunts} from '../GiaoSuCuiBap/lib/hunts.js';
import {createHuntRuntime} from '../GiaoSuCuiBap/lib/runtime-hunt.js';
import {passesHardFilter} from '../GiaoSuCuiBap/lib/hard-filter.js';
import {DEFAULT_SETTINGS} from '../GiaoSuCuiBap/lib/core.js';
import {buildSafeBackupState,sanitizeBackupFeatures} from '../GiaoSuCuiBap/lib/backup.js';

const identity={code:'54321',parentCode:'703',name:'Xã Đức Trọng'};
const source={province:'Lâm Đồng',ward:'Xã Đức Trọng',category:'XL',wardIdentities:[identity]};
const match={investField:'XL',locations:[{provCode:'703',districtCode:'54321'}]};
const other={investField:'XL',locations:[{provCode:'68',districtCode:'54321',districtName:'Xã Đức Trọng'}]};

test('411 SAVE_HUNT validation retains the selected code-parent pair through storage and repeated normalization',()=>{
  const before=JSON.stringify(source);const result=validateHunt({id:'exact-ward',name:'Đức Trọng',criteria:source});assert.equal(result.ok,true);
  const stored=safeHunts(JSON.parse(JSON.stringify([result.hunt])))[0];assert.deepEqual(stored.criteria.wardIdentities,[identity]);assert.deepEqual(safeHunts([stored])[0],stored);
  assert.equal(passesHardFilter(match,stored.criteria).state,'MATCH');assert.equal(passesHardFilter(other,stored.criteria).state,'OUT_OF_RANGE');assert.equal(JSON.stringify(source),before);
});
test('411 SAVE_SEARCH and backup roundtrips preserve exact ward identity without widening duplicate-name locations',()=>{
  const saved=safeSavedSearches([{id:'exact',name:'Đức Trọng',criteria:source}]);assert.equal(saved.length,1);assert.deepEqual(saved[0].criteria.wardIdentities,[identity]);assert.deepEqual(safeSavedSearches(JSON.parse(JSON.stringify(saved))),saved);
  const hunt=validateHunt({id:'exact-hunt',name:'Đức Trọng',criteria:source}).hunt;
  const backup=buildSafeBackupState({hunts:[hunt],tenders:[]},{},DEFAULT_SETTINGS);
  const restored=sanitizeBackupFeatures(JSON.parse(JSON.stringify(backup))).hunts[0];assert.deepEqual(restored.criteria.wardIdentities,[identity]);assert.equal(passesHardFilter(other,restored.criteria).state,'OUT_OF_RANGE');
});
test('411 validators sanitize explicit identities and preserve scalar aliases while rejecting incomplete or contradictory pairs',()=>{
  const raw={...source,provinces:['68','703'],wardCode:' 54321 ',wardParentCode:'703',wards:['54321','OTHER'],wardIdentities:[{...identity,token:'SECRET',current:false},{...identity}]};
  const r=validateCriteria(raw);assert.equal(r.ok,true);assert.deepEqual(r.criteria.wardIdentities,[identity]);assert.deepEqual(r.criteria.provinces,['68','703']);assert.deepEqual(r.criteria.wards,['54321']);assert.equal(r.criteria.wardCode,'54321');assert.equal(r.criteria.wardParentCode,'703');assert.doesNotMatch(JSON.stringify(r.criteria),/SECRET|current/);
  assert.deepEqual(validateCriteria({wardCode:'54321',wardParentCode:'703'}).criteria.wardIdentities,[{code:'54321',parentCode:'703'}]);
  for(const patch of [{wardIdentities:[{code:'54321'}]},{wardIdentities:[{code:'../54321',parentCode:'703'}]},{wardIdentities:[{code:'54321',parentCode:'7031'}]},{wardIdentities:'54321'},
    {wardCode:'54321',wardParentCode:''},{wardCode:'OTHER',wardParentCode:'703'},{provinces:['68']},{wardIdentities:[{code:'null',parentCode:'703'}]}]) assert.equal(validateCriteria({...source,...patch}).ok,false,JSON.stringify(patch));
});
test('411 legacy name-only saved criteria remain unresolved until catalog validation and never acquire guessed ward identities',()=>{
  const r=validateCriteria({province:'Lâm Đồng',ward:'Đức Trọng'});assert.equal(r.ok,true);assert.equal(r.criteria.wardIdentities,undefined);
  assert.equal(passesHardFilter(match,r.criteria).state,'INSUFFICIENT');
  const codeOnly=validateCriteria({provinces:['703'],wards:['54321']});assert.equal(codeOnly.ok,true);assert.deepEqual(codeOnly.criteria.wards,['54321']);assert.equal(codeOnly.criteria.wardIdentities,undefined);assert.equal(passesHardFilter(match,codeOnly.criteria).state,'INSUFFICIENT');
  assert.equal(validateCriteria({wardIdentities:[],provinces:[],wards:[]}).ok,false);
});
test('411 scheduled TBMT and KHLCNT hunts dispatch the same exact identities that were saved',async()=>{
  for(const kind of ['tbmt','plan']){
    const hunt=validateHunt({id:'selected',name:'Đức Trọng',kind,criteria:source}).hunt;let state={settings:{},hunts:[hunt]};let payload;
    const start=async value=>{payload=value;return{ok:true};};
    const runtime=createHuntRuntime({getState:async()=>state,save:async value=>{state={...state,...value};},escapeHtml:String,sendTelegram:async()=>{},nextDailyTime:()=>0,
      startPlanLookup:start,startTbmtSearch:start,KEYS:{hunts:'hunts'},HUNT_RETRY_PREFIX:'retry:',withLock:async fn=>fn(),chrome:{alarms:{getAll:async()=>[],clear:async()=>{},create:async()=>{}}}});
    assert.equal((await runtime.runHuntById(hunt.id)).ok,true);assert.deepEqual(payload.wardIdentities,[identity]);assert.equal(payload.huntId,'selected');assert.equal(passesHardFilter(other,payload).state,'OUT_OF_RANGE');
  }
});
