import { foldText, cleanText } from './core.js';
import { codesForProvinceName, recordCodes } from './area-match.js';
import { parseInvestorFilter } from './investor-filter.js';

const array = v => Array.isArray(v) ? v : [];
const unique = v => [...new Set(v.filter(Boolean))];
export const directoryFold = v => foldText(v).replace(/([a-z])(\d)/g,'$1 $2').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
export const provinceIdentity = v => directoryFold(v).replace(/^(?:tinh|thanh pho|tp)\s+/,'');
/** Use current legal labels for display while keeping portal numeric identities
 * and legacy names untouched in the area catalog used for filtering. */
export function directoryProvinceNames(names=[],data={}) {
  const current=new Map(array(data.provinces).map(name=>[provinceIdentity(name),name]));
  return unique(array(names).map(name=>current.get(provinceIdentity(name))||name));
}
const legalKey = v => directoryFold(v).replace(/\b(?:tinh|thanh pho)\b/g,'').replace(/\s+/g,' ').trim();
const resolveKey = legalKey;
const scopedLegalKey = (name,province) => legalKey(name).replace(/\bbqlda\b/g,'ban quan ly du an').replace(/\bqlda\b/g,'quan ly du an').replace(/\bdtxd\b/g,'dau tu xay dung').replace(new RegExp(' '+provinceIdentity(province)+'$'),'');
export const isEgpOrganizationCode = v => /^vn(?:[a-z]\w{5,}|\d{8,}(?:-\d+)?)$/i.test(String(v||''));
const safeSource = v => {try {const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
const scopeNames = v => String(v||'').split(/[,;\n]+/).map(provinceIdentity).filter(Boolean);

/** Official existence and an e-GP identity are separate evidence. A tax number
 * in a government PDF is never promoted into a portal code. */
export function officialDirectoryEntries(data={}) {
  return array(data.entries).flatMap(raw=>{
    const name=cleanText(raw.name||raw.legalName), provinceName=cleanText(raw.provinceName);
    const sources=array(raw.sources).map(s=>({...s,url:safeSource(s.url)})).filter(s=>s.url);
    if(!name||!provinceName||!sources.length||[raw.status,raw.legalState].some(s=>['inactive','dissolved','superseded','unverified','proposal','needs-verification','needs-review','uncertain'].includes(s)))return [];
    const proof=raw.egpProof, candidateCode=String(raw.eGpCode||raw.egpCode||'');
    const proofBound=isEgpOrganizationCode(candidateCode)&&proof?.sourceUrl?.startsWith('https://muasamcong.mpi.gov.vn/')
      && proof.reference && proof.codeAtSource?.toLowerCase()===candidateCode.toLowerCase()
      && provinceIdentity(proof.provinceName)===provinceIdentity(provinceName)
      && scopedLegalKey(proof.nameAtSource,provinceName)===scopedLegalKey(name,provinceName);
    const eGpCode=proofBound?candidateCode:'';
    const desiredDate=raw.evidenceDate||raw.sourceDate||'';
    const primary=sources.find(s=>s.date===desiredDate)||sources[0];
    const date=primary.date||desiredDate;
    const provinceAliases=unique([provinceName,provinceIdentity(provinceName),...codesForProvinceName(provinceName)]);
    return [{...raw,id:raw.id||`official:${provinceIdentity(provinceName)}:${legalKey(name)}`,kind:'organization',name,provinceName,provinceAliases,
      aliases:unique(array(raw.aliases).map(cleanText)),sources,status:'official',sourceUrl:primary.url,sourceDate:date,
      checkedAt:raw.verifiedAt||raw.reviewedAt||raw.checkedAt||data.checkedAt||'',eGpCode,queryValue:eGpCode||name,
      evidenceLabel:`Nguồn chính thức${date?' · '+date:''}${eGpCode?' · mã e-GP đã đối chiếu':' · tìm theo tên; chưa xác nhận mã e-GP'}`}];
  });
}

/** Pair each name with its own code only. Project geography means observed
 * participation in that province, not the registered address of the entity. */
export function observationsFromRows(rows, areas={}, seenAt=new Date().toISOString()) {
  const out=[];
  for(const row of array(rows)){
    const codes=recordCodes(row);
    const provincials=array(areas.provinces).filter(p=>codes.includes(String(p.code)));
    const named=array(row.locations).map(p=>p?.provName||p?.provinceName).filter(Boolean);
    // A name/code contradiction must not create suggestions in both provinces.
    // Prefer explicit numeric geography and require the names to agree with it.
    if(codes.length&&named.some(name=>!codesForProvinceName(name,areas).some(code=>codes.includes(String(code)))))continue;
    const names=unique(provincials.map(p=>p.name).concat(named).filter(Boolean));
    const sourceUrl=safeSource(row.detailUrl||row.sourcePageUrl);
    const reference=cleanText(row.notifyNo||row.planNo);
    if(!sourceUrl.startsWith('https://muasamcong.mpi.gov.vn/')||!reference||!names.length)continue;
    for(const [codeField,nameField] of [['investorCode','investorName'],['procuringEntityCode','procuringEntityName']]){
      const eGpCode=cleanText(row[codeField]),name=typeof row[nameField]==='string'?cleanText(row[nameField]):'';
      if(!isEgpOrganizationCode(eGpCode)||!name)continue;
      for(const provinceName of names)out.push({id:`observed:${provinceIdentity(provinceName)}:${eGpCode.toLowerCase()}`,kind:'organization',name,eGpCode,provinceName,
        provinceAliases:unique([provinceName,provinceIdentity(provinceName),...codesForProvinceName(provinceName)]),aliases:[],status:'observed',queryValue:eGpCode,
        checkedAt:seenAt,sourceDate:seenAt.slice(0,10),sourceUrl,
        egpProof:{sourceUrl,reference,version:String(row.version||row.notifyVersion||'00'),nameAtSource:name,codeAtSource:eGpCode,provinceName,codeField,seenAt,recordDecisionDate:row.decisionDate||row.publicDate||''},
        evidenceLabel:'Mã e-GP trong hồ sơ tại tỉnh · chưa xác nhận tình trạng pháp lý hiện tại'});
    }
  }
  return out;
}

export function mergeDirectoryObservations(old=[], fresh=[]) {
  const map=new Map();
  for(const raw of [...array(old),...array(fresh)]){
    const proof=raw?.egpProof;
    if(raw?.status!=='observed'||!isEgpOrganizationCode(raw.eGpCode)||!raw.name||!raw.provinceName
      ||!safeSource(proof?.sourceUrl).startsWith('https://muasamcong.mpi.gov.vn/')||!proof.reference
      ||String(proof.codeAtSource||'').toLowerCase()!==String(raw.eGpCode).toLowerCase()
      ||provinceIdentity(proof.provinceName)!==provinceIdentity(raw.provinceName)
      ||scopedLegalKey(proof.nameAtSource,raw.provinceName)!==scopedLegalKey(raw.name,raw.provinceName))continue;
    const id=`observed:${provinceIdentity(raw.provinceName)}:${String(raw.eGpCode).toLowerCase()}`, prior=map.get(id);
    if(prior&&String(prior.checkedAt)>String(raw.checkedAt))continue;
    map.set(id,{...raw,id,aliases:unique([...array(prior?.aliases),...array(raw.aliases),prior?.name].filter(n=>n!==raw.name)).slice(-16)});
  }
  return [...map.values()].sort((a,b)=>String(b.checkedAt).localeCompare(String(a.checkedAt))).slice(0,10000);
}

/** Index once after an ingest. Never scan the warehouse or call e-GP per key. */
export function createOrganizationDirectory(data={}, observations=[]) {
  const official=officialDirectoryEntries(data), observed=mergeDirectoryObservations([],observations);
  const consumed=new Set(), entries=official.map(entry=>{
    // A successor's former name is not proof that the former organization's
    // code now belongs to it. Only a current full name links the two sources.
    const matches=observed.filter(o=>provinceIdentity(o.provinceName)===provinceIdentity(entry.provinceName)&&scopedLegalKey(o.name,o.provinceName)===scopedLegalKey(entry.name,entry.provinceName));
    // Older project history cannot displace a more recent bound identity.
    const seedDate=entry.egpProof?.recordDecisionDate||'';
    const relevant=entry.eGpCode?matches.filter(o=>!seedDate||!o.egpProof?.recordDecisionDate||String(o.egpProof.recordDecisionDate)>=String(seedDate)):matches;
    const codes=unique([entry.eGpCode,...relevant.map(o=>o.eGpCode)].filter(Boolean).map(code=>code.toLowerCase()));
    if(codes.length>1)return {...entry,eGpCode:'',queryValue:entry.name,codeConflict:true,evidenceLabel:entry.evidenceLabel.replace(/mã e-GP đã đối chiếu|tìm theo tên; chưa xác nhận mã e-GP/,'nhiều mã e-GP cần đối chiếu · tìm theo tên')};
    if(entry.eGpCode||codes.length!==1)return {...entry,codeConflict:Boolean(entry.codeConflict)};
    const latest=matches[0];matches.forEach(o=>consumed.add(o.id));
    return {...entry,eGpCode:latest.eGpCode,queryValue:latest.eGpCode,egpProof:latest.egpProof,evidenceLabel:entry.evidenceLabel.replace('tìm theo tên; chưa xác nhận mã e-GP','mã e-GP đã đối chiếu')};
  }).concat(observed.filter(o=>!consumed.has(o.id)));
  const indexed=entries.map(entry=>{
    const province=provinceIdentity(entry.provinceName),labels=unique([entry.name,...array(entry.aliases),entry.eGpCode].map(resolveKey));
    const qualified=unique(labels.concat(labels.map(label=>label+' '+province)));
    return {entry,labels:qualified,words:qualified.map(l=>l.split(' ')),province};
  });
  const provinceIndex=new Map();
  for(const item of indexed)for(const key of unique([item.province,...array(item.entry.provinceAliases).map(provinceIdentity)])){
    if(!provinceIndex.has(key))provinceIndex.set(key,[]);provinceIndex.get(key).push(item);
  }
  const scoped=provinces=>!provinces.length?indexed:[...new Set(provinces.flatMap(p=>provinceIndex.get(p)||[]))];
  const inScope=(item,provinces)=>!provinces.length||provinces.some(p=>item.province===p||array(item.entry.provinceAliases).map(provinceIdentity).includes(p));
  function search({province='',query='',limit=20,officialOnly=false}={}) {
    const provinces=scopeNames(province),q=resolveKey(query),tokens=q.split(' ').filter(Boolean),candidates=scoped(provinces);
    const ranked=candidates.filter(i=>(!officialOnly||i.entry.status==='official')).map(i=>{
      const labels=i.labels;
      const score=!q?1:labels.some(l=>l===q)?100:labels.some(l=>l.startsWith(q))?80:i.words.some(words=>tokens.every(t=>words.some(w=>w.startsWith(t))))?50:0;
      return {entry:i.entry,score};
    }).filter(i=>i.score).sort((a,b)=>b.score-a.score||(a.entry.status==='official'?0:1)-(b.entry.status==='official'?0:1)||a.entry.name.localeCompare(b.entry.name,'vi'));
    const total=ranked.length, count=Math.min(Math.max(Number(limit)||20,1),500);
    const officialCount=candidates.filter(i=>i.entry.status==='official').length;
    return {ok:true,entries:ranked.slice(0,count).map(i=>i.entry),total,coverage:{officialCount,observedCount:candidates.filter(i=>i.entry.status==='observed').length,
      checkedAt:data.checkedAt||'',text:`${officialCount} đơn vị có nguồn chính thức trong danh mục${data.checkedAt?' · rà soát '+data.checkedAt:''}. Danh mục không thay thế xác nhận pháp lý; mã e-GP được ghi riêng khi có hồ sơ đối chiếu.`}};
  }
  function resolve(value,province='') {
    const parsed=parseInvestorFilter(value);if(!parsed.ok)return parsed;
    const provinces=scopeNames(province),resolved=[],substitutions=[];
    for(const term of parsed.terms){
      const q=resolveKey(term);
      // Free geographic fragments (e.g. Đức Trọng) keep their original OR
      // semantics. Only exact complete names or explicitly curated aliases
      // resolve; fuzzy suggestions require a human selection.
      const matches=scoped(provinces).filter(i=>i.entry.status==='official'&&i.labels.includes(q));
      const values=unique(matches.map(i=>i.entry.queryValue));
      if(unique(matches.map(i=>i.entry.id)).length>1)return {ok:false,error:'ambiguous-directory',message:`Tên “${term}” khớp nhiều đơn vị. Chọn tỉnh và một đơn vị trong danh sách gợi ý.`};
      if(matches.some(i=>i.entry.codeConflict))return {ok:false,error:'ambiguous-directory-code',message:`Đơn vị “${term}” có nhiều mã e-GP cần đối chiếu. Chọn mã cụ thể từ hồ sơ nguồn trong danh sách gợi ý.`};
      if(values.length===1){resolved.push(values[0]);if(values[0]!==term)substitutions.push({input:term,value:values[0],id:matches[0].entry.id,name:matches[0].entry.name,sourceUrl:matches[0].entry.sourceUrl});}
      else resolved.push(term);
    }
    const checked=parseInvestorFilter(resolved.join('; '));
    return {...checked,substitutions,inputValue:parsed.value};
  }
  return {search,resolve,entries};
}
