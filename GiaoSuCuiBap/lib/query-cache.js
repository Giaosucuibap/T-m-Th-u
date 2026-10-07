const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
export const QUERY_CACHE_TTL_MS=120_000;
export async function queryHash(payload,cryptoApi=globalThis.crypto){
  const key=JSON.stringify(stable({schema:1,mode:payload.mode,query:payload.query,pageSize:payload.pageSize,maxPages:payload.maxPages}));
  return [...new Uint8Array(await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(key)))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
/** Cache holds public list responses only. It never stores request bodies,
 * cookies or the live native request envelope, and is omitted from backups. */
export function createQueryCache({now=Date.now,ttlMs=QUERY_CACHE_TTL_MS,maxEntries=8,maxBytes=4_000_000}={}){
  const entries=new Map();
  function get(key){const item=entries.get(key);if(!item)return null;if(now()-item.fetchedAt<0||now()>=item.expiresAt){entries.delete(key);return null;}return structuredClone({...item,ageMs:now()-item.fetchedAt});}
  function put(key,pages,done,{fetchedAt=now()}={}){
    if(!done||done.ok===false||!pages.length||!pages.at(-1).done||pages.some(p=>p.schemaIssue||p.cancelled))return false;
    // Only a complete delivered sequence can be replayed. A source page cap
    // remains explicitly partial; unknown totals cannot become complete.
    const data=pages.filter(p=>!p.done),indices=new Set(data.map(p=>p.pageIndex));
    if(indices.size!==data.length||data.some((p,i)=>p.pageIndex!==i))return false;
    // Start freshness at the native request, not at the last page. A slow scan
    // must not make its oldest pages appear newly collected when it finishes.
    const observedNow=now();
    if(!Number.isFinite(fetchedAt)||fetchedAt>observedNow||observedNow>=fetchedAt+ttlMs)return false;
    const entry={pages:structuredClone(pages),done:structuredClone(done),fetchedAt,expiresAt:fetchedAt+ttlMs};
    if(JSON.stringify(entry).length>maxBytes)return false;
    entries.delete(key);entries.set(key,entry);
    while(entries.size>maxEntries)entries.delete(entries.keys().next().value);
    let bytes=[...entries.values()].reduce((sum,e)=>sum+JSON.stringify(e).length,0);
    while(bytes>maxBytes&&entries.size){const first=entries.keys().next().value;bytes-=JSON.stringify(entries.get(first)).length;entries.delete(first);}
    return entries.has(key);
  }
  return {get,put,clear:()=>entries.clear(),size:()=>entries.size};
}
