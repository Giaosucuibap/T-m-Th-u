import test from 'node:test';
import assert from 'node:assert/strict';

import { buildXlsx, colName, XLSX_MIME, xlsxDataUrl } from '../lib/xlsx.js';

function storedZipEntries(bytes) {
  const buffer = Buffer.from(bytes);
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    assert.equal(method, 0, 'the built-in writer should use ZIP store mode');
    assert.equal(compressedSize, uncompressedSize);

    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.set(name, data);
    offset = dataStart + compressedSize;
  }
  return entries;
}

test('Excel column names cover single- and multi-letter columns', () => {
  assert.equal(colName(1), 'A');
  assert.equal(colName(26), 'Z');
  assert.equal(colName(27), 'AA');
  assert.equal(colName(52), 'AZ');
  assert.equal(colName(703), 'AAA');
});

test('buildXlsx creates a complete, escaped OOXML workbook', () => {
  const bytes = buildXlsx({
    sheetName: 'Gói/[thầu]:2026?*',
    columns: [
      { header: 'Tên & mã', key: 'name' },
      { header: 'Giá', key: 'price', type: 'money' },
      { header: 'Giảm giá', key: 'discount', type: 'percent' },
      { header: 'Nguồn', key: 'url', type: 'url' }
    ],
    rows: [{
      name: 'Kênh <mương> & đập\u0007',
      price: 1_234_567_890,
      discount: 2.76,
      url: 'https://muasamcong.mpi.gov.vn/vi/web/guest/contractor-selection?x=1&y=2'
    }]
  });

  assert.ok(bytes instanceof Uint8Array);
  assert.equal(Buffer.from(bytes).readUInt32LE(0), 0x04034b50);

  const entries = storedZipEntries(bytes);
  const required = [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/worksheets/sheet1.xml',
    'xl/worksheets/_rels/sheet1.xml.rels'
  ];
  for (const name of required) assert.ok(entries.has(name), `missing ${name}`);

  const workbook = entries.get('xl/workbook.xml').toString('utf8');
  const sheet = entries.get('xl/worksheets/sheet1.xml').toString('utf8');
  const sheetRels = entries.get('xl/worksheets/_rels/sheet1.xml.rels').toString('utf8');
  const styles = entries.get('xl/styles.xml').toString('utf8');

  assert.match(workbook, /<sheet name="Gói  thầu  2026  "/);
  assert.match(sheet, /<pane ySplit="1"[^>]+state="frozen"/);
  assert.match(sheet, /<autoFilter ref="A1:D2"\/>/);
  assert.match(sheet, /Kênh &lt;mương&gt; &amp; đập/);
  assert.doesNotMatch(sheet, /\u0007/);
  assert.match(sheet, /<c r="B2" s="2"><v>1234567890<\/v><\/c>/);
  assert.match(sheet, /<c r="C2" s="3"><v>0\.0276<\/v><\/c>/);
  assert.match(sheet, /x=1&amp;y=2/);
  assert.match(sheet, /xmlns:r="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships"/);
  assert.match(sheet, /<hyperlinks><hyperlink ref="D2" r:id="rId1"\/><\/hyperlinks>/);
  assert.match(
    sheetRels,
    /Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/hyperlink"/
  );
  assert.match(sheetRels, /Target="https:\/\/muasamcong\.mpi\.gov\.vn\/vi\/web\/guest\/contractor-selection\?x=1&amp;y=2"/);
  assert.match(sheetRels, /TargetMode="External"/);
  assert.match(styles, /numFmtId="164"/);
  assert.match(styles, /numFmtId="165"/);
});

test('URL cells create relationships only for bounded HTTP(S) URLs', () => {
  const bytes = buildXlsx({
    sheetName: 'Liên kết',
    columns: [{ header: 'Nguồn', key: 'url', type: 'url' }],
    rows: [
      { url: 'https://example.com/a?x=1&y=2' },
      { url: 'http://example.org/public' },
      { url: 'javascript:alert(1)' },
      { url: 'ftp://example.com/file' },
      { url: 'không phải URL' },
      { url: 'https://' },
      { url: `https://example.com/${'x'.repeat(4097)}` }
    ]
  });

  const entries = storedZipEntries(bytes);
  const sheet = entries.get('xl/worksheets/sheet1.xml').toString('utf8');
  const rels = entries.get('xl/worksheets/_rels/sheet1.xml.rels').toString('utf8');

  assert.match(sheet, /<hyperlink ref="A2" r:id="rId1"\/>/);
  assert.match(sheet, /<hyperlink ref="A3" r:id="rId2"\/>/);
  for (const ref of ['A4', 'A5', 'A6', 'A7', 'A8']) {
    assert.doesNotMatch(sheet, new RegExp(`<hyperlink ref="${ref}"`));
  }
  assert.equal((rels.match(/<Relationship Id=/g) || []).length, 2);
  assert.match(rels, /Target="https:\/\/example\.com\/a\?x=1&amp;y=2"/);
  assert.match(rels, /Target="http:\/\/example\.org\/public"/);
  assert.doesNotMatch(rels, /javascript:|ftp:|không phải URL/);
});

test('a sheet with no valid URL does not emit hyperlink metadata', () => {
  const bytes = buildXlsx({
    columns: [{ header: 'Nguồn', key: 'url', type: 'url' }],
    rows: [{ url: 'javascript:alert(1)' }, { url: 'not-a-url' }]
  });
  const entries = storedZipEntries(bytes);
  const sheet = entries.get('xl/worksheets/sheet1.xml').toString('utf8');

  assert.equal(entries.has('xl/worksheets/_rels/sheet1.xml.rels'), false);
  assert.doesNotMatch(sheet, /<hyperlinks>/);
});

test('buildXlsx supports multiple sheets and xlsxDataUrl round-trips bytes', () => {
  const bytes = buildXlsx({
    sheets: [
      { sheetName: 'Tổng quan', columns: [{ header: 'Mã', key: 'id' }], rows: [{ id: 'IB1' }] },
      { sheetName: 'Rủi ro', columns: [{ header: 'Mức', key: 'level' }], rows: [{ level: 'Cao' }] }
    ]
  });
  const entries = storedZipEntries(bytes);
  assert.ok(entries.has('xl/worksheets/sheet1.xml'));
  assert.ok(entries.has('xl/worksheets/sheet2.xml'));
  assert.match(entries.get('xl/workbook.xml').toString('utf8'), /sheetId="2" r:id="rId2"/);

  const url = xlsxDataUrl(bytes);
  assert.ok(url.startsWith(`data:${XLSX_MIME};base64,`));
  const encoded = url.slice(url.indexOf(',') + 1);
  assert.deepEqual(Buffer.from(encoded, 'base64'), Buffer.from(bytes));
});
