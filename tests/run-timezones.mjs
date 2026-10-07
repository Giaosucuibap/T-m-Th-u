import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const tests=['accuracy-4101.test.mjs','core.test.mjs','bbmt.test.mjs','live-canary-4110.test.mjs','runtime-412.test.mjs','export-412.test.mjs','warehouse-413.test.mjs'].map(name=>path.join(root,'tests',name));
for(const TZ of ['UTC','Asia/Ho_Chi_Minh','America/New_York','Asia/Tokyo']){
 console.log(`Timezone: ${TZ}`);
 const result=spawnSync(process.execPath,['--test','--test-reporter=tap',...tests],{
  cwd:root,env:{...process.env,TZ},stdio:'inherit',windowsHide:true
 });
 if(result.status!==0){process.exitCode=result.status||1;break;}
}
