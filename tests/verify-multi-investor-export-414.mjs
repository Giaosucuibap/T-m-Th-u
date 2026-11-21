/** Bounded export fixture: actual production exporter + actual OOXML writer.
 * Data is explicitly synthetic. This is not an e-GP live-search measurement. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createScopedExportFixtures, ownerText, workbookSheetXml} from './fixtures/multi-investor-export-414.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'test-results', 'excel-multi-investor-414');
fs.mkdirSync(destination, {recursive: true});
const extension = path.join(root, 'GiaoSuCuiBap');
function sourceHashes(directory = extension, prefix = '') {
  const hashes = {};
  for (const entry of fs.readdirSync(directory, {withFileTypes: true}).sort((a,b) => a.name.localeCompare(b.name))) {
    const relative = `${prefix}${entry.name}`, target = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(hashes, sourceHashes(target, `${relative}/`));
    else if (entry.isFile()) hashes[relative] = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  }
  return hashes;
}
const before = sourceHashes();
const {outputs} = await createScopedExportFixtures();
const files = [];
for (const output of outputs) {
  const reconciliation = output.spec.sheets.find(sheet => sheet.sheetName === 'Đối soát');
  assert.equal(reconciliation.rows.find(row => row.label === 'Tiêu chí gốc · Chủ đầu tư').value, ownerText);
  assert.equal(reconciliation.rows.find(row => row.label === 'Số bản ghi sau bộ lọc xuất').value, 3);
  assert.match(workbookSheetXml(output, 'Đối soát'), /Đức Trọng; Đơn Dương; Phan Thiết/);
  const filename = `${output.kind}-pham-vi-3-chu-dau-tu.xlsx`;
  fs.writeFileSync(path.join(destination, filename), output.bytes);
  files.push({filename, kind: output.kind, detailSheet: output.detailSheet,
    sha256: crypto.createHash('sha256').update(output.bytes).digest('hex'),
    sheets: output.spec.sheets.map(sheet => ({name: sheet.sheetName, columns: sheet.columns.map(column => column.header), rows: sheet.rows.length}))});
}
const report = {ok: true, synthetic: true, liveExporter: true, createdAt: new Date().toISOString(),
  sourceHashes: before, sourceUnchanged: JSON.stringify(before) === JSON.stringify(sourceHashes()),
  criteria: {investor: ownerText, province: 'Tỉnh Lâm Đồng', provinces: ['68','703']},
  expected: {source: 5, matched: 3, insufficient: 1, outside: 1}, files};
assert.equal(report.sourceUnchanged, true, 'Product source changed during workbook generation');
fs.writeFileSync(path.join(destination, 'export-fixture-verification.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ok: true, files: files.length, destination}));
