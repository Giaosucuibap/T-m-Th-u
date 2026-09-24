import { DEFAULT_SETTINGS } from './core.js';
import { safeRunForBackup } from './backup.js';
import { safeSavedSearches, runTenders } from './workspace.js';
import { safeContracts } from './contracts.js';
import { resultRevision } from './result-view.js';

/** Read only the search workspace stores, then return a single requested scope.
 * Historical run summaries deliberately omit every other run's result snapshots. */
export function createSearchStateRuntime({storage}) {
  async function read(payload={}) {
    const s=await storage.get({settings:DEFAULT_SETTINGS,tenders:[],runs:[],activeRun:null,savedSearches:[],schemaHealth:null,liveCanary:null,checklists:{},pastContracts:[],participations:[]});
    const warehouse=payload.scope==='warehouse';
    const runId=warehouse?'':String(payload.runId || s.activeRun?.id || s.runs.find(r=>r.mode==='form')?.id || s.runs[0]?.id || '');
    const selected=s.runs.find(r=>r.id===runId)||(s.activeRun?.id===runId?s.activeRun:null);
    const selectedRun=warehouse?null:selected?safeRunForBackup(selected):null;
    let tenders=warehouse?s.tenders:runTenders(s.tenders,selected);
    if(warehouse&&payload.keys!==undefined){
      if(!Array.isArray(payload.keys)||payload.keys.length>10000||payload.keys.some(k=>typeof k!=='string'))throw Error('Phạm vi kho không hợp lệ.');
      const keys=new Set(payload.keys);tenders=tenders.filter(t=>keys.has(t.key));
    }
    const keys=new Set(tenders.map(t=>t.key));
    const runs=s.runs.map(run=>{if(!warehouse&&run.id===runId)return selectedRun;const {foundKeys,resultStates,...meta}=safeRunForBackup(run);return meta;});
    const settings={...DEFAULT_SETTINGS,...s.settings};
    const response={ok:true,scope:warehouse?'warehouse':'run',runId,tenders,runs,selectedRun,
      activeRun:s.activeRun?safeRunForBackup(s.activeRun.id===runId?s.activeRun:{...s.activeRun,foundKeys:[],resultStates:{}}):null,
      savedSearches:safeSavedSearches(s.savedSearches),settings:{provinces:settings.provinces,minPrice:settings.minPrice,maxPrice:settings.maxPrice,operatorName:settings.operatorName||'',readOnlyMode:Boolean(settings.readOnlyMode)},
      schemaHealth:s.schemaHealth||null,liveCanary:s.liveCanary||null,
      checklists:Object.fromEntries(Object.entries(s.checklists||{}).filter(([key])=>keys.has(key))),
      pastContracts:safeContracts(s.pastContracts),participations:(s.participations||[]).filter(t=>keys.has(t.tenderKey)||tenders.some(row=>row.notifyNo===t.notifyNo)).slice(0,800)};
    response.revision=resultRevision(response);
    if(payload.revision===response.revision)return {ok:true,unchanged:true,revision:response.revision,runId,scope:response.scope};
    return response;
  }
  return {read};
}
