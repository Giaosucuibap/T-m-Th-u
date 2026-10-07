import { ORGANIZATION_DIRECTORY } from './organization-directory-data.js';
import { createOrganizationDirectory, observationsFromRows, mergeDirectoryObservations, directoryProvinceNames } from './organization-directory.js';

export const ORGANIZATION_CACHE_KEY='organizationDirectoryObservations';
/** A small separate store and a reusable index. Typing does not read tenders,
 * run histories, credentials, or issue any portal search. */
export function createDirectoryRuntime({local,storage,data=ORGANIZATION_DIRECTORY,getCatalog}={}) {
  let cached=null,loading=null,queue=Promise.resolve(),seen=new Set(),epoch=0;
  const serial=fn=>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next;};
  const rowsOf=patch=>[
    ...(Array.isArray(patch.tenders)?patch.tenders:[]),
    ...['planLookup','winnerLookup','areaScan','investorScan','bidOpenScan'].flatMap(k=>{
      const j=patch[k]||{};return ['packages','insufficientPackages','excludedPackages','plans','insufficientPlans','excludedPlans'].flatMap(p=>Array.isArray(j[p])?j[p]:[]);
    })];
  function index(entries){cached={entries,directory:createOrganizationDirectory(data,entries)};return cached;}
  async function ready(){
    if(cached)return cached;if(loading)return loading;
    const generation=epoch;
    loading=(async()=>{
      const stored=(await local.get({[ORGANIZATION_CACHE_KEY]:null}))[ORGANIZATION_CACHE_KEY];
      if(generation!==epoch){await queue;return cached||index([]);}
      if(stored?.schema===1)return index(mergeDirectoryObservations([],stored.entries));
      // Upgrade migration once only, then only the small organization store.
      const old=await storage.get({tenders:[],planLookup:null,winnerLookup:null,areaScan:null,investorScan:null,bidOpenScan:null,areas:null,provinceCatalog:null});
      const entries=mergeDirectoryObservations([],observationsFromRows(rowsOf(old),old.provinceCatalog||old.areas||{}));
      return serial(async()=>{
        if(generation!==epoch)return cached||index([]);
        await local.set({[ORGANIZATION_CACHE_KEY]:{schema:1,entries,migratedAt:new Date().toISOString()}});return index(entries);
      });
    })().finally(()=>{loading=null;});return loading;
  }
  async function observe(patch){
    const generation=epoch;
    const keyOf=r=>JSON.stringify([r?.key,r?.investorCode,r?.investorName,r?.procuringEntityCode,r?.procuringEntityName,r?.provinceCode,r?.locations,r?.detailUrl]);
    const rows=rowsOf(patch).filter(r=>{
      return !seen.has(keyOf(r));
    });
    if(!rows.length)return;if(seen.size>50000)seen=new Set();
    await ready();
    return serial(async()=>{
      if(generation!==epoch)return;
      const state=cached,catalog=(await getCatalog?.())||{};
      const fresh=observationsFromRows(rows,catalog);
      if(!fresh.length)return;
      const entries=mergeDirectoryObservations(state.entries,fresh);
      await local.set({[ORGANIZATION_CACHE_KEY]:{schema:1,entries,updatedAt:new Date().toISOString()}});index(entries);
      // Missing geography or a transient persistence failure must be retryable.
      for(const row of rows)if(observationsFromRows([row],catalog).length)seen.add(keyOf(row));
    });
  }
  return {
    provinceNames:names=>directoryProvinceNames(names,data),
    search:async payload=>(await ready()).directory.search(payload),
    resolve:async(value,province)=>(await ready()).directory.resolve(value,province),
    observe,
    clear:()=>{epoch++;return serial(async()=>{await local.set({[ORGANIZATION_CACHE_KEY]:{schema:1,entries:[],clearedAt:new Date().toISOString()}});seen.clear();index([]);});},
    invalidate:()=>{epoch++;cached=null;seen.clear();}
  };
}
