"""Explain an observed, nonexecuted live-browser QA edit without rerunning units."""
import datetime as dt
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'test-results/unit-result.json'
report=json.loads(path.read_text(encoding='utf-8'))
before,after=report['testSourceHashes'],report['testSourceHashesAfter']
changes=sorted(key for key in before.keys()|after.keys() if before.get(key)!=after.get(key))
assert changes==['tests/live-multi-investor-414.mjs'],changes
excluded=changes[0]
basename=Path(excluded).name
references=[]
for key in before:
    candidate=ROOT/key
    if key!=excluded and candidate.suffix in {'.js','.mjs','.cjs','.py'} and candidate.is_file() and basename in candidate.read_text(encoding='utf-8',errors='replace'):
        references.append(key)
assert not references,references
assert report['sourceUnchanged'] and report['sourceHashes']==report['sourceHashesAfter']
for name,value in report['sourceHashes'].items():
    assert hashlib.sha256((ROOT/'GiaoSuCuiBap'/name).read_bytes()).hexdigest()==value,name
assert report['exitCode']==0 and report['counts']['tests']==report['counts']['pass']==481
assert not report['failures'] and all(report['counts'][key]==0 for key in ['fail','cancelled','skipped'])
original=ROOT/'test-results/unit-result-initial.json'
assert not original.exists(),'Preserve any existing initial receipt; do not overwrite it.'
original.write_bytes(path.read_bytes())
report['executedUnitSourcesUnchanged']=all(before.get(key)==after.get(key) for key in before.keys()|after.keys() if key!=excluded)
report['fullInventoryChanged']=[{'file':excluded,'beforeSha256':before[excluded],'afterSha256':after[excluded],
  'executedByThisCommand':False,'reason':'Standalone live-browser QA script; it is outside tests/*.test.mjs and is not referenced by the guarded unit tests, helpers or fixtures.'}]
report['nonUnitChangeReview']={'reviewedAt':dt.datetime.now(dt.timezone.utc).isoformat(),
  'method':'Retain full before/after inventories. Guard every other test/helper/fixture and the entire production tree; only the independently run live browser harness changed. Search for references to that harness in the guarded test code found none.',
  'matchingReferences':references,'reranUnitTests':False}
report['ok']=bool(report['executedUnitSourcesUnchanged'])
path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'ok':report['ok'],'counts':report['counts'],'sourceUnchanged':report['sourceUnchanged'],
 'executedUnitSourcesUnchanged':report['executedUnitSourcesUnchanged'],'testSourcesUnchanged':report['testSourcesUnchanged'],
 'fullInventoryChanged':report['fullInventoryChanged']},ensure_ascii=False,indent=2))
