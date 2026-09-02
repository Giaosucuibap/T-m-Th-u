import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

function filesUnder(dir, predicate = () => true) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path, predicate));
    else if (predicate(path)) out.push(path);
  }
  return out;
}

/* Thư mục KHÔNG được đóng gói vào tiện ích, nên không phải tuân luật CSP hay
 * luật "tài nguyên phải tồn tại" của trang tiện ích:
 *   tests/  test/    bài kiểm thử
 *   tools/  công cụ kiểm thử — trong đó có mock-page.html, một trang e-GP GIẢ
 *           LẬP cố tình dùng script inline để bắt chước trang thật
 *   scripts/ công cụ dựng bookmarklet
 * Danh sách này phải khớp phần loại trừ khi đóng gói (xem tools/pack.mjs). */
const NON_SHIPPED_DIRS = ['tests', 'test', 'tools', 'scripts', 'node_modules', 'dist'];

function extensionFiles(extension) {
  return filesUnder(ROOT, (path) => {
    if (extname(path) !== extension) return false;
    const rel = relative(ROOT, path);
    return !NON_SHIPPED_DIRS.some((dir) => rel === dir || rel.startsWith(`${dir}${sep}`));
  });
}

function assertLocalFile(value, owner) {
  assert.equal(typeof value, 'string', `${owner}: resource path must be a string`);
  assert.ok(value.length > 0, `${owner}: resource path must not be empty`);
  assert.equal(isAbsolute(value), false, `${owner}: absolute path is not extension-local: ${value}`);
  const path = resolve(ROOT, value.replace(/^\//, ''));
  assert.ok(path === ROOT || path.startsWith(`${ROOT}${sep}`), `${owner}: path escapes extension root: ${value}`);
  assert.ok(existsSync(path), `${owner}: missing resource ${value}`);
  assert.ok(statSync(path).isFile(), `${owner}: resource is not a file: ${value}`);
}

test('manifest is MV3, version-aligned, and all declared local resources exist', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, packageJson.version);
  assert.equal(manifest.background?.type, 'module');
  assert.equal(manifest.content_security_policy?.extension_pages.includes("'unsafe-eval'"), false);
  assert.equal(manifest.content_security_policy?.extension_pages.includes('http:'), false);
  assert.equal(manifest.content_security_policy?.extension_pages.includes('https:'), false);

  assertLocalFile(manifest.background?.service_worker, 'background.service_worker');
  assertLocalFile(manifest.action?.default_popup, 'action.default_popup');
  assertLocalFile(manifest.options_page, 'options_page');
  for (const [size, path] of Object.entries(manifest.icons || {})) {
    assertLocalFile(path, `icons.${size}`);
  }
  for (const [index, contentScript] of (manifest.content_scripts || []).entries()) {
    assert.ok(Array.isArray(contentScript.matches) && contentScript.matches.length > 0);
    assert.ok(['MAIN', 'ISOLATED'].includes(contentScript.world));
    for (const path of contentScript.js || []) assertLocalFile(path, `content_scripts.${index}.js`);
    for (const path of contentScript.css || []) assertLocalFile(path, `content_scripts.${index}.css`);
  }
  for (const [index, rule] of (manifest.web_accessible_resources || []).entries()) {
    for (const path of rule.resources || []) {
      if (!path.includes('*')) assertLocalFile(path, `web_accessible_resources.${index}`);
    }
  }

  assert.equal((manifest.host_permissions || []).includes('<all_urls>'), false);
  assert.equal((manifest.permissions || []).includes('webRequestBlocking'), false);
});

test('manifest public key is a valid RSA-2048-or-stronger SPKI key', () => {
  assert.ok(manifest.key, 'manifest key is required to keep a stable extension ID');
  const key = createPublicKey({
    key: Buffer.from(manifest.key, 'base64'),
    format: 'der',
    type: 'spki'
  });
  assert.equal(key.asymmetricKeyType, 'rsa');
  assert.ok((key.asymmetricKeyDetails?.modulusLength || 0) >= 2048);
});

test('manifest PNG icons have the declared dimensions and RGBA format', () => {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  for (const [declaredSize, resource] of Object.entries(manifest.icons || {})) {
    const bytes = readFileSync(join(ROOT, resource));
    assert.deepEqual(bytes.subarray(0, 8), pngSignature, `${resource}: invalid PNG signature`);
    assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR', `${resource}: missing IHDR`);
    assert.equal(bytes.readUInt32BE(16), Number(declaredSize), `${resource}: wrong width`);
    assert.equal(bytes.readUInt32BE(20), Number(declaredSize), `${resource}: wrong height`);
    assert.equal(bytes[24], 8, `${resource}: expected 8-bit channels`);
    assert.equal(bytes[25], 6, `${resource}: expected RGBA color type`);
  }
});

test('all extension JavaScript files pass the Node syntax parser', () => {
  const failures = [];
  for (const path of extensionFiles('.js')) {
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    if (result.status !== 0) {
      failures.push(`${relative(ROOT, path)}\n${result.stderr || result.stdout}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('every relative JavaScript import resolves and every named import is exported', () => {
  const missingFiles = [];
  const missingExports = [];
  const exportCache = new Map();

  function exportedNames(path) {
    if (exportCache.has(path)) return exportCache.get(path);
    const source = readFileSync(path, 'utf8');
    const names = new Set();
    for (const match of source.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
      names.add(match[1]);
    }
    for (const match of source.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
      for (const item of match[1].split(',')) {
        const name = item.trim().split(/\s+as\s+/i)[1] || item.trim().split(/\s+as\s+/i)[0];
        if (name) names.add(name.trim());
      }
    }
    exportCache.set(path, names);
    return names;
  }

  for (const sourcePath of extensionFiles('.js')) {
    const source = readFileSync(sourcePath, 'utf8');
    const specifiers = [
      ...source.matchAll(/\bfrom\s*(['"])([^'"]+)\1/g),
      ...source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)
    ].map((match) => match[2]).filter((value) => value.startsWith('.'));

    for (const specifier of specifiers) {
      const target = resolve(dirname(sourcePath), specifier);
      if (!existsSync(target)) missingFiles.push(`${relative(ROOT, sourcePath)} -> ${specifier}`);
    }

    for (const match of source.matchAll(/\bimport\s*\{([\s\S]*?)\}\s*from\s*(['"])([^'"]+)\2/g)) {
      const specifier = match[3];
      if (!specifier.startsWith('.')) continue;
      const target = resolve(dirname(sourcePath), specifier);
      if (!existsSync(target)) continue;
      const exports = exportedNames(target);
      for (const item of match[1].split(',')) {
        const imported = item.trim().split(/\s+as\s+/i)[0];
        if (imported && !exports.has(imported)) {
          missingExports.push(`${relative(ROOT, sourcePath)} imports ${imported} from ${specifier}`);
        }
      }
    }
  }

  assert.deepEqual(missingFiles, []);
  assert.deepEqual(missingExports, []);
});

test('HTML and CSS local asset references resolve inside the extension', () => {
  const failures = [];
  const documents = [...extensionFiles('.html'), ...extensionFiles('.css')];

  function checkReference(owner, rawValue) {
    const value = rawValue.trim().replace(/^['"]|['"]$/g, '');
    if (!value || /^(?:#|[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) return;
    const clean = value.split('#')[0].split('?')[0];
    if (!clean) return;
    let decoded;
    try { decoded = decodeURIComponent(clean); } catch { decoded = clean; }
    const target = resolve(dirname(owner), decoded.replace(/^\//, ''));
    if (!(target === ROOT || target.startsWith(`${ROOT}${sep}`)) || !existsSync(target)) {
      failures.push(`${relative(ROOT, owner)} -> ${value}`);
    }
  }

  for (const path of documents) {
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/\b(?:src|href)\s*=\s*(['"])(.*?)\1/gi)) {
      checkReference(path, match[2]);
    }
    for (const match of source.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
      checkReference(path, match[2]);
    }
  }
  assert.deepEqual(failures, []);
});

test('HTML entrypoints have no duplicate IDs or executable inline scripts', () => {
  const duplicateIds = [];
  const inlineScripts = [];
  const moduleErrors = [];

  for (const path of extensionFiles('.html')) {
    const source = readFileSync(path, 'utf8');
    const ids = new Map();
    for (const match of source.matchAll(/<[^>]+\bid\s*=\s*(['"])(.*?)\1[^>]*>/gi)) {
      ids.set(match[2], (ids.get(match[2]) || 0) + 1);
    }
    for (const [id, count] of ids) {
      if (count > 1) duplicateIds.push(`${relative(ROOT, path)}#${id} (${count})`);
    }

    for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      const attributes = match[1];
      const body = match[2].trim();
      const src = attributes.match(/\bsrc\s*=\s*(['"])(.*?)\1/i)?.[2];
      const type = attributes.match(/\btype\s*=\s*(['"])(.*?)\1/i)?.[2] || '';
      if (!src && body && type !== 'application/json') {
        inlineScripts.push(relative(ROOT, path));
      }
      if (src && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) {
        const scriptPath = resolve(dirname(path), src.split(/[?#]/)[0]);
        const script = existsSync(scriptPath) ? readFileSync(scriptPath, 'utf8') : '';
        if (/^\s*import\s/m.test(script) && type !== 'module') {
          moduleErrors.push(`${relative(ROOT, path)} -> ${src}`);
        }
      }
    }
  }

  assert.deepEqual(duplicateIds, []);
  assert.deepEqual(inlineScripts, []);
  assert.deepEqual(moduleErrors, []);
});
