/* ============================================================================
 *  e-GP ĐỔI ĐỊA CHỈ: muasamcong.mpi.gov.vn → muasamcong.mof.gov.vn  (4.17.1)
 *    • Đường dẫn phần mềm TỰ TẠO dùng địa chỉ mới.
 *    • Chỗ KIỂM TRA nhận cả hai địa chỉ (tab cũ, dữ liệu đã lưu vẫn dùng được).
 *    • Liên kết cũ đưa ra cho người dùng bấm được đổi sang địa chỉ mới.
 *    • Không nhận tên miền giả/lồng.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {EGP_ORIGIN, EGP_HOSTS, isEgpUrl, isEgpOrigin, currentEgpUrl, EGP_TAB_PATTERNS} from '../GiaoSuCuiBap/lib/egp-host.js';
import {EGP_SEARCH_PAGE, buildKqlcntDetailUrl} from '../GiaoSuCuiBap/lib/kqlcnt.js';
import {normalizeCandidate, canonicalEgpUrl, hasContentScript, scanTargetUrl} from '../GiaoSuCuiBap/lib/core.js';
import {safeSource} from '../GiaoSuCuiBap/lib/workspace.js';

const MOI='https://muasamcong.mof.gov.vn', CU='https://muasamcong.mpi.gov.vn';
const read=f=>fs.readFileSync(new URL(`../GiaoSuCuiBap/${f}`,import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('địa chỉ mặc định là địa chỉ MỚI; danh sách nhận đúng hai địa chỉ', ()=>{
  assert.equal(EGP_ORIGIN,MOI);
  assert.deepEqual(EGP_HOSTS,['muasamcong.mof.gov.vn','muasamcong.mpi.gov.vn']);
  assert.deepEqual(EGP_TAB_PATTERNS,[`${MOI}/*`,`${CU}/*`]);
  assert.ok(EGP_SEARCH_PAGE.startsWith(`${MOI}/vi/web/guest/contractor-selection`));
});

test('nhận cả hai địa chỉ; từ chối tên miền giả, http, cổng lạ, tài khoản nhúng', ()=>{
  for(const u of [`${MOI}/vi/web/guest/contractor-selection`,`${CU}/web/guest/home`])assert.equal(isEgpUrl(u),true,u);
  for(const u of ['https://muasamcong.mof.gov.vn.evil.com/','https://evil.com/?muasamcong.mof.gov.vn','http://muasamcong.mof.gov.vn/',
    'https://muasamcong.mof.gov.vn:8443/','https://a@muasamcong.mof.gov.vn/','https://x.muasamcong.mof.gov.vn/','https://muasamcong.gov.vn/','javascript:alert(1)'])
    assert.equal(isEgpUrl(u),false,u);
  assert.equal(isEgpOrigin(MOI),true);assert.equal(isEgpOrigin(CU),true);assert.equal(isEgpOrigin('https://muasamcong.mof.gov.vn.evil.com'),false);
});

test('liên kết cũ đưa cho người dùng bấm được đổi sang địa chỉ mới, giữ nguyên đường dẫn và tham số', ()=>{
  const cu=`${CU}/vi/web/guest/contractor-selection?notifyNo=IB2600000001&step=tbmt`;
  assert.equal(currentEgpUrl(cu),`${MOI}/vi/web/guest/contractor-selection?notifyNo=IB2600000001&step=tbmt`);
  assert.equal(safeSource(cu),currentEgpUrl(cu));
  assert.equal(canonicalEgpUrl(cu),currentEgpUrl(cu));
  assert.equal(safeSource('https://evil.com/x'),'');
  assert.equal(currentEgpUrl('https://example.com/a'),'https://example.com/a','đường dẫn khác giữ nguyên');
});

test('liên kết chi tiết TỰ TẠO dùng địa chỉ mới (TBMT, KQLCNT)', ()=>{
  const t=normalizeCandidate({notifyNo:'IB2600000001',notifyVersion:'00',notifyId:'123',bidName:'Gói',bidPrice:1e9,stepCode:'notify-contractor-step-1-tbmt'});
  assert.ok(t.detailUrl.startsWith(`${MOI}/`),t.detailUrl);
  assert.ok(buildKqlcntDetailUrl({notifyNo:'IB2600000001',id:'1',notifyVersion:'00'}).startsWith(`${MOI}/`));
});

test('tab e-GP người dùng đang mở ở địa chỉ CŨ vẫn được nhận là trang có tiện ích; lượt quét mở địa chỉ mới', ()=>{
  assert.equal(hasContentScript(`${CU}/vi/web/guest/contractor-selection?render=search`),true);
  assert.equal(hasContentScript(`${MOI}/vi/web/guest/contractor-selection?render=search`),true);
  assert.ok(scanTargetUrl(`${CU}/vi/web/guest/contractor-selection?render=search`).startsWith(`${MOI}/`));
  assert.ok(scanTargetUrl('').startsWith(`${MOI}/`));
});

test('manifest: quyền và chỗ chạy tiện ích có CẢ HAI địa chỉ, cùng phạm vi; phiên bản 4.17.1', ()=>{
  const m=JSON.parse(read('manifest.json'));
  assert.deepEqual(m.host_permissions.filter(h=>h.includes('muasamcong')),[`${MOI}/*`,`${CU}/*`]);
  for(const cs of m.content_scripts){
    const mof=cs.matches.filter(x=>x.startsWith(MOI)).map(x=>x.slice(MOI.length));
    const mpi=cs.matches.filter(x=>x.startsWith(CU)).map(x=>x.slice(CU.length));
    assert.deepEqual(mof,mpi,'cùng phạm vi trang ở hai địa chỉ');
    assert.ok(mof.length>0);
  }
  assert.equal(m.version,'4.17.1');
});

test('trang e-GP ở địa chỉ mới: content.js nhận đúng trang tra cứu; page-hook nhận yêu cầu của trang', ()=>{
  const content=read('content.js');
  const start=content.indexOf('  function kqNativeSearchRoute(){'),end=content.indexOf('\n  }\n',start)+4;
  const fn=content.slice(start,end);
  for(const [href,want] of [[`${MOI}/vi/web/guest/contractor-selection`,true],[`${CU}/vi/web/guest/contractor-selection`,true],
    ['https://muasamcong.mof.gov.vn.evil.com/vi/web/guest/contractor-selection',false]]){
    const ctx=vm.createContext({URL,location:{href}});vm.runInContext(fn,ctx);
    assert.equal(ctx.kqNativeSearchRoute(),want,href);
  }
  assert.match(read('page-hook.js'),/const EGP_ORIGINS = new Set\(\['https:\/\/muasamcong\.mof\.gov\.vn', 'https:\/\/muasamcong\.mpi\.gov\.vn'\]\);/);
  assert.match(read('page-hook.js'),/EGP_ORIGINS\.has\(url\.origin\)/);
});

test('không còn chỗ nào TỰ TẠO đường dẫn tới địa chỉ cũ (ngoài bộ địa chỉ dùng chung và dữ liệu tham chiếu lịch sử)', ()=>{
  const files=['background.js','content.js','page-hook.js','popup.js','dashboard.js','diagnostics.js','search.html','hunts.html',
    ...fs.readdirSync(new URL('../GiaoSuCuiBap/lib/',import.meta.url)).filter(f=>f.endsWith('.js')).map(f=>`lib/${f}`)]
    .filter(f=>!['lib/egp-host.js','lib/organization-directory-data.js'].includes(f));
  const bad=[];
  for(const f of files){
    const lines=read(f).split('\n');
    lines.forEach((l,i)=>{
      // Chuỗi địa chỉ cũ dạng chữ thường (không phải trong mẫu kiểm tra `(?:mof|mpi)` hay chú thích).
      if(/['"`]https:\/\/muasamcong\.mpi\.gov\.vn/.test(l)&&!/^\s*(\/\/|\*)/.test(l)&&!/EGP_ORIGINS = new Set/.test(l))bad.push(`${f}:${i+1}`);
    });
  }
  assert.deepEqual(bad,[]);
});
