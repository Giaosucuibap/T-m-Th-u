import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('iPhone bookmarklet source, URL and embedded controls are synchronized', () => {
  const source = fs.readFileSync(new URL('../mobile/bookmarklet.src.js', import.meta.url), 'utf8').trim();
  const mirror = fs.readFileSync(new URL('../mobile/bookmarklet.min.js', import.meta.url), 'utf8').trim();
  const url = fs.readFileSync(new URL('../mobile/bookmarklet.url.txt', import.meta.url), 'utf8').trim();
  const html = fs.readFileSync(new URL('../mobile/iphone.html', import.meta.url), 'utf8');
  const textarea = html.match(/<textarea id="code" readonly>([\s\S]*?)<\/textarea>/)?.[1];
  const link = html.match(/<a class="bm" href="([\s\S]*?)">/)?.[1];
  assert.equal(mirror, source);
  assert.equal(decodeURIComponent(url.slice('javascript:'.length)), source);
  assert.equal(textarea, url);
  assert.equal(link, url);
});
