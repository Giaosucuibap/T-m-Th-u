import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createNativeAgent,NATIVE_HOST} from '../GiaoSuCuiBap/lib/native-agent.js';

const root=fileURLToPath(new URL('../',import.meta.url));
/* Các bài "production"/"fixture"/"installer" biên dịch bằng csc.exe của .NET và
   CHẠY tệp .exe — chỉ làm được trên Windows. Trên máy khác chúng không thể chạy,
   nên bỏ qua KÈM LÝ DO thay vì báo đỏ: một bài đỏ vì sai hệ điều hành dạy người
   ta làm ngơ trước màu đỏ. Ba bài "bridge" chỉ kiểm lib/native-agent.js bằng
   JavaScript thuần, nên vẫn chạy ở mọi nơi. */
const WIN=process.platform==='win32';
const CAN_WINDOWS=WIN?{}:{skip:'cần Windows: biên dịch bằng csc.exe và chạy tệp .exe'};
const production=path.join(root,'native-agent','GiaoSuCuiBap.NativeHost.exe');
const origin='chrome-extension://injgpddgeaedalfgbnnbobdidghjncoj/';
const uuid=n=>`12345678-1234-1234-1234-${String(n).padStart(12,'0')}`;
const pack=body=>{const data=Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body),'utf8');const header=Buffer.alloc(4);header.writeUInt32LE(data.length);return Buffer.concat([header,data]);};
const header=n=>{const data=Buffer.alloc(4);data.writeUInt32LE(n);return data;};
async function host(exe,input,args=[origin]) {
  return new Promise((resolve,reject)=>{
    const child=spawn(exe,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
    const out=[],err=[];const timer=setTimeout(()=>{child.kill();reject(new Error('Native process timed out'));},10000);
    child.stdout.on('data',chunk=>out.push(chunk));child.stderr.on('data',chunk=>err.push(chunk));
    child.stdin.on('error',error=>{if(!['EPIPE','EOF','ECONNRESET'].includes(error.code))reject(error);});
    child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolve({code,stdout:Buffer.concat(out),stderr:Buffer.concat(err).toString('utf8')});});
    child.stdin.end(input);
  });
}
function reply(result) {
  assert.equal(result.code,0,result.stderr);assert.ok(result.stdout.length>=4);
  const size=result.stdout.readUInt32LE(0);assert.equal(result.stdout.length,size+4,'Exactly one complete native frame, no console logging');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(result.stdout.subarray(4)));
}
const log=[], requests=[];let fixture,outputDir,server,fixtureDir;
const pdf=Buffer.from('%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
before(async()=>{
  if(!WIN)return;
  assert.ok(fs.existsSync(production),'Production binary must be built first');
  server=http.createServer((req,res)=>{
    requests.push(req.url);
    if(req.url==='/'){res.writeHead(200);res.end('fixture upstream');return;}
    const url=new URL(req.url,'http://127.0.0.1');
    assert.equal(url.pathname,'/api/download/file/browser/public');
    assert.equal([...url.searchParams.keys()].join(','),'fileId');
    const n=Number(url.searchParams.get('fileId').slice(-12));
    if(n===2){res.writeHead(200,{'content-type':'application/pdf','content-length':'0'});res.end();return;}
    if(n===3){res.writeHead(200,{'content-type':'text/html'});res.end('<html>Error</html>');return;}
    if(n===4){res.writeHead(200,{'content-type':'application/pdf','content-length':pdf.length+500});res.write(pdf);setTimeout(()=>res.destroy(),30);return;}
    if(n===5){res.writeHead(302,{location:'/must-not-follow'});res.end();return;}
    if(n===6){res.writeHead(200,{'content-type':'application/octet-stream'});res.write('<');setTimeout(()=>res.end('html><body>Error</body></html>'),60);return;}
    if(n===7){res.writeHead(200,{'content-type':'application/octet-stream'});res.end('{"success":false,"error":"Access denied"}');return;}
    if(n===8){res.writeHead(503);res.end('temporarily unavailable');return;}
    if(n===9){res.writeHead(200,{'content-type':'application/pdf','content-length':99999});res.write(pdf);const timer=setInterval(()=>res.write('x'),80);res.on('close',()=>clearInterval(timer));return;}
    if(n===10){res.writeHead(200,{'content-type':'application/pdf','content-length':'2147483649'});res.end();return;}
    if(n===17){res.writeHead(200,{'content-type':'application/octet-stream'});res.end('<head>Failure %PDF-not-a-real-document</head>');return;}
    if(n===18){res.writeHead(200,{'content-type':'application/octet-stream'});res.end('{"data":"%PDF-not-a-real-document"}');return;}
    const signatures={11:Buffer.from('504b0304','hex'),12:Buffer.from('d0cf11e0a1b11ae1','hex'),13:Buffer.from('526172211a0700','hex'),14:Buffer.from('377abcaf271c','hex'),15:Buffer.from('89504e470d0a1a0a','hex'),16:Buffer.from('ffd8ff','hex')};
    const body=signatures[n]?Buffer.concat([signatures[n],Buffer.from('synthetic signature fixture')]):pdf;
    res.writeHead(200,{'content-type':'application/octet-stream','content-length':body.length});res.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;assert.notEqual(port,1234);
  const results=path.join(root,'test-results');fs.mkdirSync(results,{recursive:true});
  fixtureDir=fs.mkdtempSync(path.join(results,'native-agent-4110-fixture-'));outputDir=path.join(fixtureDir,'downloads');
  const source=fs.readFileSync(path.join(root,'native-agent','NativeHost.cs'),'utf8');
  assert.match(source,/const string Upstream = "http:\/\/127\.0\.0\.1:1234"/);
  assert.match(source,/const int MaxElapsedMs = 300000;/);
  // FIXTURE ONLY: separate compiled copy, random loopback port, 1-second
  // deadline to exercise the production timeout logic without a 5-min wait.
  const fixtureSource=source.replace('http://127.0.0.1:1234',`http://127.0.0.1:${port}`).replace('const int MaxElapsedMs = 300000;','const int MaxElapsedMs = 1000;');
  const cs=path.join(fixtureDir,'NativeHost.fixture.cs');fixture=path.join(fixtureDir,'NativeHost.fixture.exe');fs.writeFileSync(cs,fixtureSource);
  fs.writeFileSync(path.join(fixtureDir,'settings.json'),JSON.stringify({downloadDirectory:outputDir}));
  const built=spawnSync('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/target:exe','/optimize+','/r:System.Web.Extensions.dll',`/out:${fixture}`,cs],{windowsHide:true,encoding:'utf8'});
  assert.equal(built.status,0,built.stdout+built.stderr);
  log.push({fixture:true,port,outputDir,deadlineMs:1000,productionDeadlineMs:300000,productionSha256:createHash('sha256').update(fs.readFileSync(production)).digest('hex')});
});
after(async()=>{
  if(!WIN)return;
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(root,'test-results','native-agent-4110.json'),JSON.stringify({fixture:true,records:log,requests},null,2));
});

test('411 production host rejects wrong or absent extension origins before parsing a frame',CAN_WINDOWS,async()=>{
  for(const args of [[],['https://muasamcong.mpi.gov.vn'],['chrome-extension://other/'],[origin+'evil'],['chrome-extension://injgpddgeaedalfgbnnbobdidghjncoj.evil/']]) {
    const r=await host(production,pack({command:'ping'}),args);assert.equal(r.code,2);assert.equal(r.stdout.length,0);
  }
});
test('411 production framing measures UTF-8 bytes and rejects invalid UTF-8 and invalid JSON',CAN_WINDOWS,async()=>{
  for(const command of ['unsupported','Lệnh chưa có 📁']) assert.equal(reply(await host(production,pack({command}))).code,'INVALID_COMMAND');
  for(const body of [Buffer.from([0xff]),Buffer.from('{'),Buffer.from('null'),Buffer.from('[]')]) assert.equal(reply(await host(production,pack(body))).code,'INVALID_MESSAGE');
  const truncated=Buffer.concat([header(100),Buffer.from('{')]);assert.equal(reply(await host(production,truncated)).code,'INVALID_MESSAGE');
});
test('411 production rejects empty, oversized, and incomplete headers without allocating message bodies',CAN_WINDOWS,async()=>{
  for(const size of [0,65537,0xffffffff]){const r=await host(production,header(size));assert.equal(r.code,3);assert.equal(r.stdout.length,0);}
  const r=await host(production,Buffer.from([1,2]));assert.equal(r.code,4);assert.equal(r.stdout.length,0);
});
test('411 production command allowlist rejects arbitrary URLs, paths, process execution and forged destination fields',CAN_WINDOWS,async()=>{
  const valid={command:'download',fileId:uuid(1),fileName:'test.pdf'};
  for(const extra of [{url:'https://example.invalid/file.pdf'},{path:'C:\\outside.pdf'},{downloadDirectory:'C:\\outside'},{args:['cmd.exe']},{origin}]) assert.equal(reply(await host(production,pack({...valid,...extra}))).code,'INVALID_MESSAGE');
  for(const command of ['exec','open','write','fetch','Download'])assert.equal(reply(await host(production,pack({command}))).code,'INVALID_COMMAND');
  for(const fileId of ['../file','http://127.0.0.1:1234/','x'.repeat(36),uuid(1)+'&url=x'])assert.equal(reply(await host(production,pack({...valid,fileId}))).code,'INVALID_FILE_ID');
});
test('411 production rejects traversal, device names, executable suffixes and invalid Windows names',CAN_WINDOWS,async()=>{
  for(const fileName of ['../test.pdf','..\\test.pdf','C:\\test.pdf','test.pdf:stream','CON.pdf','LPT1.pdf','report.exe','report.pdf.','report.pdf ','a'.repeat(181)+'.pdf','test?.pdf']) {
    assert.equal(reply(await host(production,pack({command:'download',fileId:uuid(1),fileName}))).code,'INVALID_DESTINATION',fileName);
  }
});
test('411 fixture downloads Unicode filenames with byte-exact content and never overwrites existing files',CAN_WINDOWS,async()=>{
  const name='Hồ sơ Đức Trọng 📁.pdf';
  const first=reply(await host(fixture,pack({command:'download',fileId:uuid(1),fileName:name})));assert.equal(first.ok,true);assert.equal(first.bytes,pdf.length);assert.deepEqual(fs.readFileSync(first.filename),pdf);
  const second=reply(await host(fixture,pack({command:'download',fileId:uuid(1),fileName:name})));assert.equal(second.ok,true);assert.notEqual(second.filename,first.filename);assert.match(second.filename,/ \(1\)\.pdf$/);assert.deepEqual(fs.readFileSync(first.filename),pdf);assert.deepEqual(fs.readFileSync(second.filename),pdf);
  log.push({case:'unicode-and-no-overwrite',first,second});
});
test('411 fixture verifies each declared attachment family by file signature',CAN_WINDOWS,async()=>{
  for(const [id,extensions] of [[11,['zip','docx','xlsx']],[12,['doc','xls']],[13,['rar']],[14,['7z']],[15,['png']],[16,['jpg','jpeg']]]) for(const ext of extensions) {
    const r=reply(await host(fixture,pack({command:'download',fileId:uuid(id),fileName:`signature-${ext}.${ext}`})));assert.equal(r.ok,true,ext);assert.ok(r.bytes>0);
  }
  const mismatch=reply(await host(fixture,pack({command:'download',fileId:uuid(11),fileName:'wrong.pdf'})));assert.equal(mismatch.ok,false);assert.equal(fs.existsSync(path.join(outputDir,'wrong.pdf')),false);
});
test('411 fixture never reports empty, HTML, split-HTML, JSON, interrupted, redirected or oversized responses as success',CAN_WINDOWS,async()=>{
  for(const [id,label] of [[2,'empty'],[3,'html'],[4,'interrupted'],[5,'redirect'],[6,'fragmented-html'],[7,'json'],[8,'unavailable'],[10,'too-large'],[17,'html-with-pdf-magic'],[18,'json-with-pdf-magic']]) {
    const filename=`${label}.pdf`,r=reply(await host(fixture,pack({command:'download',fileId:uuid(id),fileName:filename})));
    assert.equal(r.ok,false,label);assert.equal(fs.existsSync(path.join(outputDir,filename)),false);assert.equal(fs.readdirSync(outputDir).some(n=>n.endsWith('.partial')),false);log.push({case:label,...r});
  }
  assert.equal(requests.some(url=>url.includes('must-not-follow')),false);
});
test('411 fixture enforces total download deadline despite continuing small reads',CAN_WINDOWS,async()=>{
  const start=Date.now();const r=reply(await host(fixture,pack({command:'download',fileId:uuid(9),fileName:'timed-out.pdf'})));
  assert.equal(r.ok,false);assert.ok(Date.now()-start<6000);assert.equal(fs.existsSync(path.join(outputDir,'timed-out.pdf')),false);assert.equal(fs.readdirSync(outputDir).some(n=>n.endsWith('.partial')),false);log.push({case:'total-deadline',elapsedMs:Date.now()-start,...r});
});
test('411 installer validates local folders before writes without invoking installation or registration',CAN_WINDOWS,()=>{
  const installer=fs.readFileSync(path.join(root,'native-agent','install.ps1'),'utf8');
  const match=installer.match(/\$downloadPath -notmatch '([^']+)'/);assert.ok(match);const pattern=new RegExp(match[1]);
  assert.equal(pattern.test('D:\\Documents\\Hồ sơ'),true);for(const value of ['\\\\server\\share','https://example.invalid','/tmp/files'])assert.equal(pattern.test(value),false);
  assert.ok(installer.indexOf('$downloadPath -notmatch')<installer.indexOf('New-Item -ItemType Directory'));
  assert.match(installer,/HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts/);assert.doesNotMatch(installer,/HKLM:/);
  assert.match(installer,/chrome-extension:\/\/injgpddgeaedalfgbnnbobdidghjncoj\//);
});

function runtimeStub(respond) {
  const calls=[];let disconnected=0;
  const runtime={connectNative(hostName){assert.equal(hostName,NATIVE_HOST);const messages=[],disconnects=[];return{
    onMessage:{addListener(fn){messages.push(fn);}},onDisconnect:{addListener(fn){disconnects.push(fn);}},
    postMessage(message){calls.push(message);queueMicrotask(()=>{const value=respond(message,calls.length);if(value instanceof Error){runtime.lastError={message:value.message};disconnects.forEach(fn=>fn());delete runtime.lastError;}else messages.forEach(fn=>fn(value));});},
    disconnect(){disconnected++;disconnects.forEach(fn=>fn());}
  };}};
  return{runtime,calls,get disconnected(){return disconnected;}};
}
test('411 bridge keeps a native port until response and exposes truthful upstream status',async()=>{
  for(const upstream of [true,false]){const stub=runtimeStub(()=>({ok:true,installed:true,upstream}));const r=await createNativeAgent(stub).agentStatus();assert.equal(r.running,upstream);assert.equal(r.reachable,upstream);assert.equal(r.installed,true);assert.equal(stub.disconnected,1);assert.deepEqual(stub.calls,[{command:'ping'}]);}
  const unavailable=await createNativeAgent(runtimeStub(()=>new Error('not found'))).agentStatus();assert.equal(unavailable.installed,false);assert.equal(unavailable.ok,false);
  assert.equal((await createNativeAgent(runtimeStub(()=>({message:'invalid'}))).agentStatus()).code,'INVALID_REPLY');
});
test('411 bridge reports mixed success with a failed array; malformed entries do not issue native commands',async()=>{
  const stub=runtimeStub((msg,n)=>n===1?{ok:true,bytes:10,filename:'D:\\fixture.pdf'}:{ok:false,message:'Download failed'});
  const result=await createNativeAgent(stub).downloadAttachments({notifyNo:'IB2600000001',files:[{fileId:uuid(1),fileName:'Hồ sơ.pdf'},{fileId:uuid(2),fileName:'B.pdf'},null,{fileId:'bad',fileName:'C.pdf'}]});
  assert.equal(result.ok,false);assert.equal(result.downloaded,1);assert.equal(result.failed.length,3);assert.equal(result.results.length,4);assert.equal(stub.calls.length,2);
  assert.deepEqual(Object.keys(stub.calls[0]).sort(),['command','fileId','fileName']);assert.match(stub.calls[0].fileName,/^IB2600000001_/);assert.equal(stub.disconnected,2);
});
test('411 bridge rejects over-limit batches as a whole and never silently succeeds on a prefix',async()=>{
  const stub=runtimeStub(()=>({ok:true}));const r=await createNativeAgent(stub).downloadAttachments({files:Array.from({length:101},()=>({fileId:uuid(1),fileName:'A.pdf'}))});assert.equal(r.ok,false);assert.equal(r.downloaded,0);assert.equal(stub.calls.length,0);
  const empty=await createNativeAgent(stub).downloadAttachments({files:[]});assert.equal(empty.ok,false);assert.equal(empty.downloaded,0);
});
