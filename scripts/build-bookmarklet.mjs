import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'mobile', 'bookmarklet.src.js');
const mirrorPath = path.join(root, 'mobile', 'bookmarklet.min.js');
const urlPath = path.join(root, 'mobile', 'bookmarklet.url.txt');
const htmlPath = path.join(root, 'mobile', 'iphone.html');

// Không dùng regex-minifier tự chế vì có thể làm hỏng chuỗi/biểu thức chính quy.
// Tệp mirror cố ý giữ nguyên source; ZIP quan trọng hơn vài KB và luôn tái lập được.
const source = fs.readFileSync(sourcePath, 'utf8').trim();
const bookmarklet = `javascript:${encodeURIComponent(source)}`;
let html = fs.readFileSync(htmlPath, 'utf8');

if (!/<textarea id="code" readonly>[\s\S]*?<\/textarea>/.test(html)) {
  throw new Error('Không tìm thấy ô mã bookmarklet trong mobile/iphone.html');
}
if (!/<a class="bm" href="[\s\S]*?">/.test(html)) {
  throw new Error('Không tìm thấy liên kết bookmarklet trong mobile/iphone.html');
}

html = html
  .replace(/<textarea id="code" readonly>[\s\S]*?<\/textarea>/,
    `<textarea id="code" readonly>${bookmarklet}</textarea>`)
  .replace(/<a class="bm" href="[\s\S]*?">/,
    `<a class="bm" href="${bookmarklet}">`);

fs.writeFileSync(mirrorPath, `${source}\n`);
fs.writeFileSync(urlPath, `${bookmarklet}\n`);
fs.writeFileSync(htmlPath, html);

console.log(`Bookmarklet synchronized: ${source.length} source chars, ${bookmarklet.length} URL chars.`);
