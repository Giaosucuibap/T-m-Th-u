import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(ROOT, 'background.js'), 'utf8');

test('backup export scrubs every e-GP template before serialization', () => {
  const start = source.indexOf('async function exportBackup');
  const end = source.indexOf('\n/*', start + 1);
  const body = source.slice(start, end);

  assert.ok(start >= 0 && end > start, 'exportBackup must exist');
  assert.match(body, /const cleanTemplates\s*=\s*sanitizedTemplateState\(s\)/);
  assert.match(body, /const exportState\s*=\s*\{\.\.\.s,\.\.\.cleanTemplates\}/);
  assert.match(body, /\.\.\.exportState,settings/);
  assert.doesNotMatch(body, /JSON\.stringify\([^)]*\.\.\.s\b/s);
});

test('extension installation and upgrades scrub legacy request templates', () => {
  const start = source.indexOf('chrome.runtime.onInstalled.addListener');
  const end = source.indexOf('chrome.runtime.onStartup.addListener', start + 1);
  const body = source.slice(start, end);

  assert.ok(start >= 0 && end > start, 'onInstalled migration must exist');
  assert.match(body, /const cleanTemplates\s*=\s*sanitizedTemplateState\(s0\)/);
  assert.match(body, /\[KEYS\.template\]:cleanTemplates\.template/);
  assert.match(body, /\[KEYS\.templates\]:cleanTemplates\.templates/);
  assert.match(body, /\[KEYS\.lastTemplate\]:cleanTemplates\.lastTemplate/);
});

test('backup import preserves partial terminal runs and fails closed on unknown states', () => {
  const start = source.indexOf('function sanitizeBackupImport');
  const end = source.indexOf('\n/*', start + 1);
  const body = source.slice(start, end);

  assert.ok(start >= 0 && end > start, 'sanitizeBackupImport must exist');
  assert.match(body, /new Set\(\['SUCCESS','PARTIAL','ERROR','CANCELLED','TIMEOUT'\]\)/);
  assert.match(body, /new Set\(\['STARTING','OPENING','RUNNING','LISTING','SCANNING'\]\)/);
  assert.match(body, /nonterminalStatuses\.has\(rawStatus\)\?'CANCELLED':'ERROR'/);
  assert.doesNotMatch(body, /\?\s*rawStatus\s*:\s*'SUCCESS'/);
});
