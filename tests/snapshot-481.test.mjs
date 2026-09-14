import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotRecord,tokenDiff} from '../lib/html-diff.js';

test('DOM diagnostics retain selector structure without form values, scripts or URL query',()=>{
  const raw='<div id="bidOpeningMinutes" class="el-pagination"><input value="private-value"><script>const token="private-token";</script>private-name</div>';
  const snapshot=snapshotRecord(raw,{url:'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?token=private-url'});
  assert.equal(snapshot.structuralOnly,true);
  assert.ok(snapshot.html.includes('bidOpeningMinutes'));
  assert.ok(snapshot.html.includes('el-pagination'));
  assert.ok(!JSON.stringify(snapshot).includes('private-'));
  assert.equal(tokenDiff(snapshot.html,snapshot.html).changed,0);
});
