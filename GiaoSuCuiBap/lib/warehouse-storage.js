import { firstStampMs } from './core.js';
import { recordCodes } from './area-match.js';

// One owner (the extension worker), three transactional record stores. Small
// settings remain in chrome.storage; its revision also wakes existing views.
export const WAREHOUSE_DB = 'gscb-warehouse-v1';
const LARGE = ['tenders', 'runs', 'participations'];
const STORES = [...LARGE, 'runHeaders', 'meta'];
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
const req = request => new Promise((resolve,reject) => {
  request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
});
const completed = tx => new Promise((resolve,reject) => {
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Giao dịch kho bị hủy.'));
  tx.onerror=()=>{}; // onabort is the final outcome, not an individual request.
});
function header(row) {const {foundKeys,resultStates,...rest}=row;return rest;}
function record(kind,value,slot) {
  const out={slot,value};
  if(kind==='tenders')Object.assign(out,{key:String(value?.key||''),provinceCodes:recordCodes(value||{}),closeStamp:firstStampMs(value||{},['closeDate'])??undefined});
  if(kind==='runs')out.id=String(value?.id||'');
  if(kind==='participations')Object.assign(out,{tenderKey:String(value?.tenderKey||''),notifyNo:String(value?.notifyNo||'')});
  return out;
}
function replace(tx,kind,rows) {
  if(!Array.isArray(rows))throw Error(`Kho ${kind} phải là danh sách. Dữ liệu cũ được giữ lại.`);
  const store=tx.objectStore(kind);store.clear();
  if(kind==='runs')tx.objectStore('runHeaders').clear();
  rows.forEach((value,slot)=>{
    store.put(record(kind,value,slot));
    if(kind==='runs')tx.objectStore('runHeaders').put({slot,id:String(value?.id||''),value:header(value||{})});
  });
}
function openDb(factory,name) {
  return new Promise((resolve,reject)=>{
    const r=factory.open(name,1);
    r.onupgradeneeded=()=>{
      const db=r.result;
      for(const kind of LARGE){
        const s=db.createObjectStore(kind,{keyPath:'slot'});
        if(kind==='tenders'){s.createIndex('key','key');s.createIndex('provinceCodes','provinceCodes',{multiEntry:true});s.createIndex('closeStamp','closeStamp');}
        if(kind==='runs')s.createIndex('id','id');
        if(kind==='participations'){s.createIndex('tenderKey','tenderKey');s.createIndex('notifyNo','notifyNo');}
      }
      db.createObjectStore('runHeaders',{keyPath:'slot'}).createIndex('id','id');
      db.createObjectStore('meta');
    };
    r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};
    r.onerror=()=>reject(r.error);
    r.onblocked=()=>reject(Error('Kho đang mở ở phiên bản khác. Đóng các trang tiện ích rồi thử lại.'));
  });
}

export function createWarehouseStorage({local,indexedDB:factory=globalThis.indexedDB,name=WAREHOUSE_DB}={}) {
  if(!local)throw Error('Thiếu bộ lưu trữ cục bộ.');
  let dbPromise, queue=Promise.resolve();
  const serial=fn=>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next;};
  async function flush(db) {
    let tx=db.transaction('meta','readonly');
    const pending=await req(tx.objectStore('meta').get('pendingLocal'));
    if(!pending)return;
    if(pending.clear)await local.clear();
    await local.set({...pending.patch,warehouseRevision:pending.revision,warehouseStorage:{engine:'indexeddb',schema:1}});
    // Only erase legacy arrays after the complete IDB transaction is durable.
    if(local.remove)await local.remove(LARGE);
    tx=db.transaction('meta','readwrite');const done=completed(tx);tx.objectStore('meta').delete('pendingLocal');await done;
  }
  async function ready() {
    if(!factory)return null; // Node replay / environments without IndexedDB.
    if(!dbPromise)dbPromise=(async()=>{
      const db=await openDb(factory,name);
      try {
        let tx=db.transaction('meta','readonly');
        const initialized=await req(tx.objectStore('meta').get('initialized'));
        if(!initialized){
          const legacy=await local.get({tenders:[],runs:[],participations:[],warehouseStorage:null});
          if(legacy.warehouseStorage?.engine==='indexeddb')throw Error('Dấu mốc kho đã chuyển còn tồn tại nhưng cơ sở dữ liệu không còn. Hãy khôi phục từ tệp sao lưu; không tự tạo kho rỗng');
          tx=db.transaction(STORES,'readwrite');const done=completed(tx);
          try {
            for(const key of LARGE)replace(tx,key,legacy[key]||[]);
            tx.objectStore('meta').put(true,'initialized');
            tx.objectStore('meta').put({patch:{},revision:crypto.randomUUID()},'pendingLocal');
          }catch(e){tx.abort();await done.catch(()=>{});throw e;}
          await done;
        }
        await flush(db);return db;
      }catch(e){db.close();throw e;}
    })().catch(e=>{dbPromise=null;throw Error(`Không mở được kho dữ liệu: ${e.message}. Đã dừng thao tác; không thay thế kho bằng danh sách rỗng.`);});
    return dbPromise;
  }
  async function getInternal(query=null) {
    const db=await ready();if(!db)return local.get(query);
    await flush(db);
    const names=query==null?null:typeof query==='string'?[query]:Array.isArray(query)?query:Object.keys(query);
    const large=LARGE.filter(k=>names===null||names.includes(k));
    let small=query;
    if(names!==null)small=typeof query==='object'&&!Array.isArray(query)?Object.fromEntries(Object.entries(query).filter(([k])=>!LARGE.includes(k))):names.filter(k=>!LARGE.includes(k));
    const data=await local.get(small);
    if(large.length){
      const tx=db.transaction(large,'readonly');
      const rows=await Promise.all(large.map(k=>req(tx.objectStore(k).getAll())));
      large.forEach((k,i)=>data[k]=rows[i].map(r=>r.value));
    }
    return data;
  }
  async function setInternal(patch) {
    const db=await ready();if(!db)return local.set(patch);
    await flush(db);
    const large=LARGE.filter(k=>own(patch,k));
    if(!large.length)return local.set(patch);
    const small=Object.fromEntries(Object.entries(patch).filter(([k])=>!LARGE.includes(k)));
    const tx=db.transaction(STORES,'readwrite'),done=completed(tx);
    try {
      for(const k of large)replace(tx,k,patch[k]);
      tx.objectStore('meta').put({patch:small,revision:crypto.randomUUID()},'pendingLocal');
    }catch(e){tx.abort();await done.catch(()=>{});throw e;}
    await done;await flush(db);
  }
  async function lookupInternal(kind,index,keys) {
    const db=await ready();
    if(!db){const all=(await local.get({[kind]:[]}))[kind];const wanted=new Set(keys);return all.filter(r=>wanted.has(String(r?.[index]||'')));}
    await flush(db);
    if(!keys.length)return [];
    const tx=db.transaction(kind,'readonly'),store=tx.objectStore(kind).index(index);
    const lists=await Promise.all([...new Set(keys)].map(k=>req(store.getAll(k))));
    return [...new Map(lists.flat().map(r=>[r.slot,r])).values()].sort((a,b)=>a.slot-b.slot).map(r=>r.value);
  }
  return {
    engine:factory?'indexeddb':'local',
    get:query=>serial(()=>getInternal(query)),
    set:patch=>serial(()=>setInternal(patch)),
    readSearchScope:payload=>serial(async()=>{
      const defaults={settings:{},activeRun:null,savedSearches:[],schemaHealth:null,liveCanary:null,checklists:{},pastContracts:[]};
      const db=await ready();if(!db)return getInternal({...defaults,tenders:[],runs:[],participations:[]});
      await flush(db);const data=await local.get(defaults),warehouse=payload.scope==='warehouse';
      if(warehouse&&payload.keys!==undefined&&(!Array.isArray(payload.keys)||payload.keys.length>10000||payload.keys.some(k=>typeof k!=='string')))throw Error('Phạm vi kho không hợp lệ.');
      // Keep all record reads in ONE readonly transaction and ONE queue slot:
      // ingest cannot replace run snapshots between headers, keys and rows.
      const tx=db.transaction(['runHeaders','runs','tenders','participations'],'readonly'),done=completed(tx);
      data.runs=(await req(tx.objectStore('runHeaders').getAll())).map(r=>r.value);
      const runId=warehouse?'':String(payload.runId||data.activeRun?.id||data.runs.find(r=>r.mode==='form')?.id||data.runs[0]?.id||'');
      const selected=warehouse?null:(await req(tx.objectStore('runs').index('id').get(runId)))?.value;
      if(selected)data.runs=data.runs.map(r=>r.id===runId?selected:r);
      const run=selected||(data.activeRun?.id===runId?data.activeRun:null);
      let records;
      if(warehouse&&payload.keys===undefined)records=await req(tx.objectStore('tenders').getAll());
      else {
        const keys=[...new Set(warehouse?payload.keys:(run?.foundKeys||[]))];
        records=(await Promise.all(keys.map(k=>req(tx.objectStore('tenders').index('key').getAll(k))))).flat().sort((a,b)=>a.slot-b.slot);
      }
      data.tenders=records.map(r=>r.value);
      const keys=new Set(data.tenders.map(t=>t.key)),notices=new Set(data.tenders.map(t=>t.notifyNo).filter(n=>typeof n==='string'&&n.trim())),parts=tx.objectStore('participations');
      const reads=[...[...keys].map(k=>req(parts.index('tenderKey').getAll(k))),...[...notices].map(k=>req(parts.index('notifyNo').getAll(k)))];
      data.participations=[...new Map((await Promise.all(reads)).flat().map(r=>[r.slot,r])).values()].sort((a,b)=>a.slot-b.slot).map(r=>r.value);
      await done;return data;
    }),
    lookup:(kind,index,keys)=>serial(()=>lookupInternal(kind,index,keys)),
    participationsFor:(keys,noticeIds)=>serial(async()=>{
      const db=await ready();
      const ks=new Set(keys),ns=new Set(noticeIds.filter(Boolean));
      if(!db)return (await local.get({participations:[]})).participations.filter(p=>ks.has(p.tenderKey)||ns.has(p.notifyNo));
      await flush(db);if(!ks.size&&!ns.size)return [];
      const tx=db.transaction('participations','readonly'),s=tx.objectStore('participations');
      const reads=[...[...ks].map(k=>req(s.index('tenderKey').getAll(k))),...[...ns].map(k=>req(s.index('notifyNo').getAll(k)))];
      return [...new Map((await Promise.all(reads)).flat().map(r=>[r.slot,r])).values()].sort((a,b)=>a.slot-b.slot).map(r=>r.value);
    }),
    runHeaders:()=>serial(async()=>{
      const db=await ready();if(!db)return (await local.get({runs:[]})).runs.map(header);
      await flush(db);const tx=db.transaction('runHeaders','readonly');return (await req(tx.objectStore('runHeaders').getAll())).map(r=>r.value);
    }),
    clear:()=>serial(async()=>{
      const db=await ready();if(!db)return local.clear();
      await flush(db);const tx=db.transaction(STORES,'readwrite'),done=completed(tx);
      for(const k of STORES)tx.objectStore(k).clear();
      tx.objectStore('meta').put(true,'initialized');
      tx.objectStore('meta').put({clear:true,patch:{},revision:crypto.randomUUID()},'pendingLocal');
      await done;await flush(db);
    }),
    close:()=>serial(async()=>{if(dbPromise)(await dbPromise).close();dbPromise=null;})
  };
}
const appStores=new WeakMap();
export function getAppStorage(local=globalThis.chrome?.storage.local) {
  if(!local)throw Error('Thiếu bộ lưu trữ tiện ích.');
  if(!appStores.has(local))appStores.set(local,createWarehouseStorage({local}));
  return appStores.get(local);
}
