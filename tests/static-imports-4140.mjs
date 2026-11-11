// Link production modules without evaluating browser globals or executing UI.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath,pathToFileURL} from 'node:url';
const source=fileURLToPath(new URL('../GiaoSuCuiBap/',import.meta.url));
const files=fs.readdirSync(source,{recursive:true,withFileTypes:true}).filter(entry=>entry.isFile()&&entry.name.endsWith('.js')).map(entry=>path.join(entry.parentPath,entry.name));
const modules=new Map(),failures=[];
for(const filename of files){try{const identifier=pathToFileURL(filename).href;modules.set(identifier,new vm.SourceTextModule(fs.readFileSync(filename,'utf8'),{identifier}));}catch(error){failures.push({file:path.relative(source,filename),kind:'syntax',message:error.message});}}
const resolve=(specifier,referencing)=>{const url=new URL(specifier,referencing.identifier).href;const module=modules.get(url);if(!module)throw Error(`Unresolved module ${specifier} from ${referencing.identifier}`);return module;};
for(const [url,module] of modules){if(module.status!=='unlinked')continue;try{await module.link(resolve);}catch(error){failures.push({file:path.relative(source,fileURLToPath(url)),kind:'import-binding',message:error.message});}}
console.log(JSON.stringify({javascriptFiles:files.length,linkedModules:[...modules.values()].filter(module=>module.status==='linked').length,failures}));
process.exitCode=failures.length?1:0;
