// Independent behavioral probes. All identifiers/records below are synthetic;
// this script does not query or seed the production directory.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {createOrganizationDirectory,observationsFromRows,mergeDirectoryObservations} from '../GiaoSuCuiBap/lib/organization-directory.js';
import {createDirectoryRuntime,ORGANIZATION_CACHE_KEY} from '../GiaoSuCuiBap/lib/runtime-directory.js';
const name='Ban Quản lý dự án đầu tư xây dựng khu vực Kiểm Thử';
const provinceName='Tỉnh Lâm Đồng',a='vn0012345678',b='vn0012345679';
const sourceUrl='https://muasamcong.mpi.gov.vn/web/guest/contractor-selection';
const areas={provinces:[{code:'703',name:provinceName},{code:'75',name:'Tỉnh Đồng Nai'}]};
const proof=(code)=>({sourceUrl,reference:'IB2699999901',codeAtSource:code,nameAtSource:name,provinceName,seenAt:'2026-10-05T01:00:00Z'});
const official={id:'fixture-board',name,provinceName,aliases:['ban khu vực kiểm thử'],sources:[{url:'https://lamdong.gov.vn/',date:'2026-09-20'}],eGpCode:a,egpProof:proof(a)};
const newer=observationsFromRows([{key:'fixture-current',notifyNo:'IB2699999902',investorCode:b,investorName:name,provinceCode:'703',detailUrl:sourceUrl}],areas,'2026-10-05T02:00:00Z');
const withConflict=createOrganizationDirectory({schema:1,entries:[official]},newer);
const conflictEntry=withConflict.entries.find(entry=>entry.id==='fixture-board');
const conflictResolution=withConflict.resolve('ban khu vực kiểm thử',provinceName);
const inconsistentRows=[{key:'fixture-geography',notifyNo:'IB2699999903',investorCode:a,investorName:name,provinceCode:'75',locations:[{provCode:'75',provName:provinceName}],detailUrl:sourceUrl}];
const inconsistent=observationsFromRows(inconsistentRows,areas,'2026-10-05T02:00:00Z');
const inconsistentDirectory=createOrganizationDirectory({},inconsistent);
const spoofed={...newer[0],id:'fixture-bad-pair',eGpCode:a,queryValue:a,egpProof:proof(b)};
const unbound=mergeDirectoryObservations([],[spoofed]);
const promoted=createOrganizationDirectory({schema:1,entries:[{...official,eGpCode:undefined,egpProof:undefined}]},unbound).entries.find(entry=>entry.id==='fixture-board');
let releaseRead;const localData={};
const delayedLocal={get:()=>new Promise(resolve=>{releaseRead=()=>resolve({[ORGANIZATION_CACHE_KEY]:null});}),set:async patch=>Object.assign(localData,structuredClone(patch))};
const delayedRuntime=createDirectoryRuntime({local:delayedLocal,storage:{get:async()=>({tenders:[{key:'fixture-upgrade',notifyNo:'IB2699999904',investorCode:a,investorName:name,provinceCode:'703',detailUrl:sourceUrl}],provinceCatalog:areas})},data:{}});
const initialSearch=delayedRuntime.search({province:provinceName});
await delayedRuntime.clear();releaseRead();await initialSearch;
const afterClear=await delayedRuntime.search({province:provinceName});
const results=[
  {case:'Stored verified code A versus newly observed code B for same legal name/province',expected:'Mark conflict and use the legal name or require disambiguation; never silently choose either conflicting code',ok:conflictEntry.codeConflict===true&&!conflictEntry.eGpCode&&(!conflictResolution.ok||conflictResolution.value===name),actual:{entry:conflictEntry,resolution:conflictResolution}},
  {case:'Location code/name contradiction cannot produce a province-bound suggestion',expected:'No Lâm Đồng suggestion from a location whose numeric code explicitly identifies Đồng Nai',ok:inconsistentDirectory.search({province:provinceName}).total===0,actual:inconsistentDirectory.search({province:provinceName})},
  {case:'Stored observation code must equal its codeAtSource proof',expected:'Reject malformed code/proof pairing and never promote it to an official identifier',ok:unbound.length===0&&!promoted?.eGpCode,actual:{accepted:unbound,promoted}},
  {case:'Clearing observed directory while first-load migration is in flight',expected:'The earlier migration must not resurrect observations after clear completes',ok:afterClear.total===0&&localData[ORGANIZATION_CACHE_KEY]?.entries.length===0,actual:{directory:afterClear,persisted:localData[ORGANIZATION_CACHE_KEY]}}
];
const out=path.join(process.cwd(),'test-results/directory-independent-audit');await fs.mkdir(out,{recursive:true});
const sourceHashes={};for(const file of ['lib/organization-directory.js','lib/runtime-directory.js'])sourceHashes[file]=crypto.createHash('sha256').update(await fs.readFile(path.join(process.cwd(),'GiaoSuCuiBap',file))).digest('hex');
await fs.writeFile(path.join(out,'model-audit.json'),JSON.stringify({fixture:true,checkedAt:new Date().toISOString(),sourceHashes,results},null,2));
for(const result of results)console.log(JSON.stringify({case:result.case,ok:result.ok}));
process.exitCode=results.every(result=>result.ok)?0:1;
