import { DEFAULT_SETTINGS } from './core.js';
import { safeRunForBackup } from './backup.js';
import { safeSavedSearches, runTenders } from './workspace.js';
import { safeContracts } from './contracts.js';
import { resultRevision } from './result-view.js';

/** Read only the search workspace stores, then return a single requested scope.
 * Historical run summaries deliberately omit every other run's result snapshots. */
export function createSearchStateRuntime({storage}) {
  async function read(payload={}) {
    const coherent=typeof storage.readSearchScope==='function';
    const indexed=!coherent&&typeof storage.lookup==='function';
    const s=coherent?await storage.readSearchScope(payload):await storage.get({settings:DEFAULT_SETTINGS,...(indexed?{}:{tenders:[],runs:[],participations:[]}),activeRun:null,savedSearches:[],schemaHealth:null,liveCanary:null,checklists:{},pastContracts:[]});
    if(indexed)s.runs=await storage.runHeaders();
    const warehouse=payload.scope==='warehouse';
    const runId=warehouse?'':String(payload.runId || s.activeRun?.id || s.runs.find(r=>r.mode==='form')?.id || s.runs[0]?.id || '');
    const selected=(indexed?(await storage.lookup('runs','id',[runId]))[0]:s.runs.find(r=>r.id===runId))||(s.activeRun?.id===runId?s.activeRun:null);
    const selectedRun=warehouse?null:selected?safeRunForBackup(selected):null;
    if(warehouse&&payload.keys!==undefined&&(!Array.isArray(payload.keys)||payload.keys.length>10000||payload.keys.some(k=>typeof k!=='string')))throw Error('Phạm vi kho không hợp lệ.');
    if(indexed)s.tenders=warehouse&&payload.keys===undefined?(await storage.get({tenders:[]})).tenders:await storage.lookup('tenders','key',warehouse?payload.keys:(selected?.foundKeys||[]));
    let tenders=warehouse?s.tenders:runTenders(s.tenders,selected);
    if(warehouse&&payload.keys!==undefined){
      if(!Array.isArray(payload.keys)||payload.keys.length>10000||payload.keys.some(k=>typeof k!=='string'))throw Error('Phạm vi kho không hợp lệ.');
      const keys=new Set(payload.keys);tenders=tenders.filter(t=>keys.has(t.key));
    }
    const keys=new Set(tenders.map(t=>t.key));
    const noticeIds=new Set(tenders.map(t=>t.notifyNo).filter(value=>typeof value==='string'&&value.trim()));
    if(indexed)s.participations=await storage.participationsFor([...keys],[...noticeIds]);
    // Drop hidden snapshots before sanitizing: sanitizing thousands of rows
    // only to throw them away dominates a refresh on a long scan history.
    const runs=s.runs.map(run=>{if(!warehouse&&run.id===runId&&selectedRun)return selectedRun;const {foundKeys,resultStates,...meta}=run;return safeRunForBackup(meta);});
    const settings={...DEFAULT_SETTINGS,...s.settings};
    const response={ok:true,scope:warehouse?'warehouse':'run',runId,tenders,runs,selectedRun,
      activeRun:s.activeRun?safeRunForBackup(s.activeRun.id===runId?s.activeRun:{...s.activeRun,foundKeys:[],resultStates:{}}):null,
      savedSearches:safeSavedSearches(s.savedSearches),settings:{provinces:settings.provinces,minPrice:settings.minPrice,maxPrice:settings.maxPrice,operatorName:settings.operatorName||'',readOnlyMode:Boolean(settings.readOnlyMode)},
      schemaHealth:s.schemaHealth||null,liveCanary:s.liveCanary||null,
      checklists:Object.fromEntries(Object.entries(s.checklists||{}).filter(([key])=>keys.has(key))),
      pastContracts:safeContracts(s.pastContracts),participations:(s.participations||[]).filter(t=>keys.has(t.tenderKey)||noticeIds.has(t.notifyNo)).slice(0,800)};
    response.revision=resultRevision(response);
    if(payload.revision===response.revision)return {ok:true,unchanged:true,revision:response.revision,runId,scope:response.scope};
    return response;
  }
  return {read};
}
