"""Run the frozen candidate's independent unit or static gate with hash receipts."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / 'GiaoSuCuiBap'
OUTPUT = ROOT / 'test-results'
NODE = Path('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')

def inventory(root, prefix=''):
    hashes = {}
    for directory, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = sorted(name for name in dirs if name not in {'node_modules', '__pycache__'} and not (Path(directory) / name).is_symlink())
        for name in sorted(files):
            path = Path(directory) / name
            if path.is_symlink():
                continue
            hashes[prefix + path.relative_to(root).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return dict(sorted(hashes.items()))

def stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat()

mode = sys.argv[1]
assert mode in {'unit', 'static'}
OUTPUT.mkdir(exist_ok=True)
source_before = inventory(EXTENSION)
test_before = inventory(ROOT / 'tests', 'tests/')
unit_hashes = {key: value for key, value in test_before.items() if key.endswith('.test.mjs') and key.count('/') == 1}
command = ([str(NODE), '--test', '--test-concurrency=4', '--test-reporter=tap', 'tests/*.test.mjs'] if mode == 'unit'
           else [str(NODE), '--experimental-vm-modules', 'tests/static-imports-4140.mjs'])
started_at = stamp()
started = time.monotonic()
result = subprocess.run(command, cwd=ROOT, capture_output=True, timeout=300)
stdout = result.stdout.decode('utf-8', errors='replace')
stderr = result.stderr.decode('utf-8', errors='replace')
(OUTPUT / ('unit-4140.tap' if mode == 'unit' else 'static-imports-4140.stdout.json')).write_text(stdout, encoding='utf-8')
(OUTPUT / f'{mode}-4140.stderr.txt').write_text(stderr, encoding='utf-8')
source_after = inventory(EXTENSION)
test_after = inventory(ROOT / 'tests', 'tests/')
report = {'startedAt': started_at, 'checkedAt': stamp(), 'durationMs': round((time.monotonic() - started) * 1000),
          'command': command, 'exitCode': result.returncode,
          'sourceUnchanged': source_before == source_after, 'testSourcesUnchanged': test_before == test_after,
          'executedUnitSourcesUnchanged': source_before == source_after and test_before == test_after,
          'extensionTreeDigest': hashlib.sha256(json.dumps(source_before, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')).hexdigest(),
          'sourceHashes': source_before, 'sourceHashesAfter': source_after,
          'testHashes': unit_hashes, 'testSourceHashes': test_before, 'testSourceHashesAfter': test_after}
if mode == 'unit':
    counts = {}
    for field in ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']:
        values = re.findall(r'^# ' + field + r' (\d+)\s*$', stdout, flags=re.M)
        counts[field] = int(values[-1]) if values else None
    failures = re.findall(r'^not ok .*$', stdout, flags=re.M)
    report.update(testFiles=len(unit_hashes), counts=counts, failures=failures)
    success = counts['tests'] is not None and counts['tests'] > 0 and counts['pass'] == counts['tests'] and all(counts[key] == 0 for key in ['fail', 'cancelled', 'skipped']) and not failures
else:
    try:
        details = json.loads(stdout)
    except Exception as error:
        details = {'failures': [f'Static result could not be parsed: {error}']}
    report.update(details)
    report['testHarnessHash'] = test_before['tests/static-imports-4140.mjs']
    success = not details['failures'] and details.get('javascriptFiles', 0) > 0 and details.get('linkedModules') == details.get('javascriptFiles')
report['ok'] = bool(result.returncode == 0 and success and report['sourceUnchanged'] and report['testSourcesUnchanged'])
(OUTPUT / f'{mode}-result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({key: value for key, value in report.items() if key not in {'sourceHashes', 'sourceHashesAfter', 'testHashes', 'testSourceHashes', 'testSourceHashesAfter'}}, ensure_ascii=False, indent=2))
raise SystemExit(0 if report['ok'] else 1)
