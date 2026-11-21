/* ============================================================================
 *  4.23.0 — BẢNG ĐỌC ĐƯỢC TRÊN MỌI CỠ MÀN HÌNH (lib/table-fit.js, theme.css)
 *
 *  Lỗi thấy trên iPad thật ngày 21/11/2026 (Hồ sơ chủ đầu tư, bản 4.22.0): cột "Nhà thầu" rộng
 *  59 px, tên công ty 39 ký tự thành 13 dòng; cột "Giá trị trúng" rộng 222 px cho con số 110 px.
 *  Nguyên nhân: `overflow-wrap:anywhere` trên mọi ô bảng của máy cảm ứng.
 *
 *  Bài này kiểm phần chia cột (hàm thuần) bằng đúng số đo của bảng đó, và canh hai quy tắc CSS
 *  để lỗi không quay lại. Phần đo trên trình duyệt thật: tools/test/bang-doc-duoc.mjs.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planColumns, cardLayout, pinColumn, ONE_LINE, CARD_BELOW } from '../GiaoSuCuiBap/lib/table-fit.js';

// Máy Windows lấy mã về với xuống dòng CRLF: đưa về LF trước khi so chuỗi nhiều dòng (CI Windows đỏ vì thiếu bước này).
const read = (file) => fs.readFileSync(new URL(`../GiaoSuCuiBap/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const C = (body, headMin, headMax, wraps, extra = {}) => ({ body, headMin, headMax, wraps, pad: 24, ...extra });
const sum = (list) => list.reduce((a, b) => a + b, 0);

/* Bảng "Nhà thầu đã trúng" đo trong nhân Safari (px CSS, gồm lề ô 24 px):
   Nhà thầu (tên dài nhất 640), Số gói, Tỷ trọng, Độc lập / Liên danh, Giá trị trúng, Giảm giá,
   Ít cạnh tranh, Chỉ 1 NT dự, Năm. */
const WINNERS = [C(640, 60, 95, true), C(45, 48, 69, false), C(66, 60, 84, false), C(70, 80, 160, false), C(152, 60, 115, false),
  C(66, 60, 86, false), C(72, 70, 118, false), C(60, 50, 105, false), C(155, 52, 52, true)];
const IPAD_PORTRAIT = 654;    // iPad 12,9" dọc, phóng 110%, trừ thanh trái và lề
const IPAD_LANDSCAPE = 960;
const PHONE = 330;

test('iPad dọc (máy trong ảnh): cột tên từ 59 px lên 275 px; các cột số đúng bằng nội dung; bảng cuộn ngang', () => {
  const plan = planColumns(WINNERS, IPAD_PORTRAIT);
  assert.equal(plan.scroll, true);
  assert.equal(plan.primary, 0);
  const [name, soGoi, tyTrong, docLap, giaTri, giamGia, itCanhTranh, motNhaThau, nam] = plan.widths;
  assert.equal(Math.round(name), 275, 'cột tên được 42% khung');
  assert.ok(name >= 59 * 4, 'rộng hơn 4 lần so với 4.22.0');
  // Tên 39 ký tự (bề rộng một dòng khoảng 420 px) nay nằm trong 2 dòng thay vì 13.
  assert.ok((420 - 24) / (name - 24) <= 2, 'tên 39 ký tự vừa hai dòng');
  // Cột số: rộng bằng nội dung hoặc bằng tiêu đề đã ngắt hai dòng, không hơn.
  assert.equal(soGoi, 69, '"Số gói": tiêu đề ngắn giữ một dòng');
  assert.equal(tyTrong, 84);
  assert.ok(docLap < 110, `"Độc lập / Liên danh" từng rộng 157 px cho "16 / 0", nay ${Math.round(docLap)} px (tiêu đề hai dòng)`);
  assert.equal(giaTri, 152, '"Giá trị trúng" từng rộng 222 px (dòng phụ không xuống dòng), nay vừa con số chính');
  assert.ok(giamGia <= 86 && itCanhTranh <= 86 && motNhaThau <= 86);
  assert.ok(nam < 155, 'cột Năm ("2023, 2024, 2025") xuống hai dòng khi chật');
  assert.equal(Math.ceil(plan.total), Math.ceil(sum(plan.widths)));
  assert.ok(plan.total > IPAD_PORTRAIT);
});

test('iPad xoay ngang: cùng bảng đó VỪA màn hình, không phải cuộn; cột tên vẫn đủ rộng cho trọn từ', () => {
  const plan = planColumns(WINNERS, IPAD_LANDSCAPE);
  assert.equal(plan.scroll, false);
  assert.ok(Math.abs(sum(plan.widths) - IPAD_LANDSCAPE) < 1, 'tổng các cột đúng bằng khung');
  assert.ok(plan.widths[0] >= 176, `cột tên ${Math.round(plan.widths[0])} px`);
  assert.equal(plan.widths[4], 152);
});

test('Điện thoại: cuộn ngang, cột tên 150 px và không quá nửa khung (để còn ghim được)', () => {
  const plan = planColumns(WINNERS, PHONE);
  assert.equal(plan.scroll, true);
  assert.equal(plan.widths[0], 150);
  assert.ok(plan.widths[0] <= PHONE * 0.5);
});

test('Màn hình rộng: tên nằm một dòng, tiêu đề nào đủ chỗ thì một dòng, không cột nào hẹp hơn nội dung', () => {
  const plan = planColumns(WINNERS, 1900);
  assert.equal(plan.scroll, false);
  assert.ok(plan.widths[0] >= 640, 'tên dài nhất vừa một dòng');
  WINNERS.forEach((c, i) => assert.ok(plan.widths[i] >= Math.min(c.body, 640) - 0.5 && plan.widths[i] >= c.headMax - 0.5, `cột ${i + 1}`));
  assert.ok(Math.abs(sum(plan.widths) - 1900) < 1);
  // Vừa đủ chỗ cho tên một dòng nhưng chưa đủ cho mọi tiêu đề: tiêu đề cần ít chỗ nhất được trước, không chia vụn.
  const tight = planColumns(WINNERS, 1500);
  assert.ok(tight.widths[0] >= 640);
  assert.ok(tight.widths[7] >= 105, '"Chỉ 1 NT dự" (thiếu 34 px) được một dòng');
});

test('Không bao giờ chia cho cột nào hẹp hơn từ dài nhất của tiêu đề, hay hẹp hơn nội dung một dòng của cột số', () => {
  for (const avail of [200, 330, 500, 654, 800, 960, 1200, 1900]) {
    const plan = planColumns(WINNERS, avail);
    WINNERS.forEach((c, i) => {
      assert.ok(plan.widths[i] >= c.headMin - 0.5, `khung ${avail}: cột ${i + 1} hẹp hơn tiêu đề`);
      if (!c.wraps) assert.ok(plan.widths[i] >= c.body - 0.5, `khung ${avail}: cột số ${i + 1} hẹp hơn nội dung`);
    });
    assert.ok(plan.widths.every((w) => Number.isFinite(w) && w >= 28), `khung ${avail}`);
    assert.ok(plan.scroll ? plan.total > avail : Math.abs(plan.total - avail) < 1, `khung ${avail}`);
  }
});

test('Cột chữ ngắn (dưới chừng 13 ký tự) giữ một dòng; cột chữ dài hai dòng; rất dài thì chạm trần và xuống thêm dòng', () => {
  assert.equal(ONE_LINE, 104);
  const short = planColumns([C(120, 40, 60, true), C(60, 40, 60, false)], 100);       // chữ 96 px
  assert.equal(short.widths[0], 120);
  const two = planColumns([C(424, 60, 95, true), C(900, 40, 60, false)], 700);        // chữ 400 px → hai dòng 224 + lề
  assert.ok(Math.abs(two.widths[0] - (400 / 2 * 1.12 + 24)) < 0.01);
  const capped = planColumns([C(1200, 60, 95, true), C(900, 40, 60, false)], 700);    // quá dài: trần 42% khung
  assert.equal(capped.widths[0], 294);
});

test('Hai cột chữ dài (tên gói + nhà thầu trúng): cột đầu là cột chính, cột sau nhận trần thấp hơn', () => {
  const cols = [C(110, 60, 90, false), C(1400, 60, 90, true), C(700, 60, 130, true), C(130, 50, 110, false), C(140, 50, 100, false)];
  const plan = planColumns(cols, 654);
  assert.equal(plan.primary, 1);
  assert.equal(plan.scroll, true);
  assert.equal(Math.round(plan.widths[1]), 275);
  assert.equal(Math.round(plan.widths[2]), 222);
  assert.ok(plan.widths[1] > plan.widths[2]);
});

test('Cột vẽ thanh và cột tác giả ghi cứng bề rộng: giữ mức tối thiểu; chỗ thừa dồn cho cột vẽ thanh', () => {
  const cols = [C(80, 40, 60, true), C(50, 40, 70, false), C(24, 0, 0, true, { bar: true }), C(130, 60, 110, false), C(40, 40, 44, false, { fixed: 44 })];
  const plan = planColumns(cols, 900);
  assert.equal(plan.scroll, false);
  assert.ok(plan.widths[2] > 400, 'cột thanh nhận phần còn lại');
  assert.equal(plan.widths[4], 44);
  assert.equal(plan.widths[3], 130);
  const tight = planColumns(cols, 300);
  assert.equal(tight.widths[2], 96, 'cột thanh không hẹp hơn 96 px');
});

test('Dữ liệu bất thường không làm hỏng phép chia: không có tiêu đề, bảng không cột, khung 0 px', () => {
  const noHead = planColumns([C(300, 0, 0, true), C(80, 0, 0, false)], 500);
  assert.equal(noHead.scroll, false);
  assert.ok(Math.abs(sum(noHead.widths) - 500) < 1);
  assert.deepEqual(planColumns([], 500), { widths: [], total: 500, scroll: false, primary: -1 });
  const zero = planColumns([C(300, 40, 60, true)], 0);
  assert.equal(zero.scroll, true);
  assert.ok(zero.widths[0] >= 150);
});

/* --------------------------------------------------------------------- CANH CSS --- */
const theme = read('theme.css');
const rules = theme.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.trim()).filter(Boolean);

test('CANH LỖI CŨ: không quy tắc nào đặt overflow-wrap:anywhere (hay word-break:break-all) lên ô bảng nói chung', () => {
  const bad = [];
  for (const file of ['theme.css', 'workspace.css', 'app.css']) {
    const css = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of css.split('}')) {
      const [selector, body = ''] = rule.split('{').slice(-2);
      if (!/overflow-wrap\s*:\s*anywhere|word-break\s*:\s*break-all/.test(body)) continue;
      // Quy tắc CHUNG cho mọi ô bảng (td / th không gắn với lớp hay mã của một bảng cụ thể) là lỗi 4.22.0:
      // `html[data-touch] main td{overflow-wrap:anywhere}`. Bảng riêng tự đặt cho mình (.comparison td…) thì được —
      // bộ dàn cột vẫn giữ mức sàn cho từng cột.
      for (const part of String(selector || '').split(',')) {
        const one = part.trim();
        if (/(^|[\s>+~])t[dh]\s*$/.test(one) && !/[.#]/.test(one.replace(/\[[^\]]*\]/g, ''))) bad.push(`${file}: ${one}`);
      }
    }
  }
  assert.deepEqual(bad, []);
  // Phép canh phải thật sự bắt được quy tắc của 4.22.0.
  const old = 'html[data-touch] main p,html[data-touch] main li,html[data-touch] main dd,html[data-touch] main td';
  assert.ok(old.split(',').some((one) => /(^|[\s>+~])t[dh]\s*$/.test(one.trim()) && !/[.#]/.test(one.replace(/\[[^\]]*\]/g, ''))));
  assert.ok(rules.some((r) => /^main td,main th,dialog td,dialog th\{overflow-wrap:break-word$/.test(r)), 'ô bảng dùng break-word');
});

test('theme.css có đủ kiểu cho lúc đo, khung cuộn, cột ghim, bản in; không còn mẹo display:block cho bảng', () => {
  for (const needle of ['table.fit-mb{width:max-content!important}', 'table.fit-mh.fit-min{width:1px!important}', '.table-scroll{position:relative;max-width:100%;overflow-x:auto',
    'table[data-fit-pin="1"]>*>tr:not(.fit-x)>:nth-child(1)', 'table[data-fit-pin="4"]>*>tr:not(.fit-x)>:nth-child(4){position:sticky;left:0', 'table.fit-on th{white-space:normal', 'table td .sub{display:block;white-space:normal}',
    'table.fit-on>*>tr>td[style*="width"],table.fit-on>*>tr>th[style*="width"]{width:auto!important}', '.table-scroll>table{margin:0!important;overflow:visible!important}', 'table.fit-tight{font-size:13.5px}',
    'body.print-snapshot .table-scroll{overflow:visible!important', 'table.fit-on>*>tr>.fit-w.fit-w{box-sizing:border-box!important;width:var(--fit-w)!important}', 'body.print-snapshot table.fit-on>*>tr>.fit-w.fit-w{width:auto!important}']) assert.ok(theme.includes(needle), needle);
  assert.ok(!/main table:not\(\.brief-table\)\{display:block/.test(theme), 'mẹo 4.22.0 (bảng thành khối, tự cuộn) đã bỏ');
});

test('Bề rộng cột đặt trên Ô, không dùng <col>: nhân Safari không nhân mức phóng (zoom) cho bề rộng của <col>', () => {
  const fit = read('lib/table-fit.js');
  assert.match(fit, /cell\.style\.setProperty\('--fit-w'/);
  assert.ok(!/createElement\('col(group)?'\)/.test(fit), 'không tạo <colgroup> / <col>');
  assert.ok(!/<col[ >]/.test(theme.replace(/\/\*[\s\S]*?\*\//g, '')));
});

test('shell.js bật bộ dàn cột và ô gợi ý cho mọi trang (trừ cửa sổ bật lên), và ghi bề rộng thật của phần nội dung', () => {
  const shell = read('shell.js');
  assert.match(shell, /import \{ watchTables \} from '\.\/lib\/table-fit\.js';/);
  assert.match(shell, /import \{ enhanceSuggest \} from '\.\/lib\/suggest\.js';/);
  assert.match(shell, /if \(!IS_POPUP\) \{[\s\S]{0,700}watchTables\(\);[\s\S]{0,200}enhanceSuggest\(\);/);
  assert.match(shell, /dataset\.room !== room/);
  for (const rule of ['html[data-room="s"] .metrics{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}', 'html[data-room="xs"] .metrics{display:flex;flex-wrap:wrap}', 'html[data-room="s"] .scope,']) assert.ok(theme.includes(rule), rule);
  // Mọi trang đều nạp shell.js, nên mọi bảng và mọi ô tỉnh/thành đều được xử lý.
  const dir = new URL('../GiaoSuCuiBap/', import.meta.url);
  const pages = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
  assert.ok(pages.length >= 25);
  for (const page of pages) assert.match(read(page), /src="shell\.js"/, page);
});

test('Không còn ô nào dựa vào danh sách gợi ý của trình duyệt mà mô-đun không biết: mọi <datalist> là tỉnh hoặc xã/phường', () => {
  const dir = new URL('../GiaoSuCuiBap/', import.meta.url);
  const lists = new Set();
  for (const page of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) for (const m of read(page).matchAll(/list="([^"]+)"/g)) lists.add(m[1]);
  assert.deepEqual([...lists].sort(), ['province-list', 'ward-list']);
  const suggest = read('lib/suggest.js');
  assert.match(suggest, /input\.removeAttribute\('list'\)/);
  assert.match(suggest, /querySelectorAll\('input\[list\], input#province, input\[data-suggest\]'\)/);
});

/* ---------------------------------------------------------------------------
 *  Vòng đo ở cỡ iPhone (20/11/2026) — 27 vi phạm, ba nguyên nhân
 * ------------------------------------------------------------------------- */
test('cột chữ phụ không hẹp hơn 168 px kể cả trên điện thoại (trước là 130 px: "CÔNG TY TNHH NAM SƠN" thành 3 dòng)', () => {
  // Bảng "Gói đã trúng": Vai trò | Mã TBMT | Gói thầu (chính) | Nhà thầu trúng | Chủ đầu tư | Giá gói | Giá trúng | Giảm giá | Phê duyệt
  const cols = [C(110, 60, 80, false), C(177, 60, 95, false), C(900, 60, 95, true), C(640, 70, 140, true), C(520, 60, 110, true), C(161, 60, 120, false), C(171, 60, 130, false), C(141, 60, 90, false), C(133, 60, 100, false)];
  const plan = planColumns(cols, PHONE);
  assert.equal(plan.scroll, true);
  assert.equal(plan.primary, 2);
  assert.ok(plan.widths[3] >= 168 && plan.widths[4] >= 168, `cột chữ phụ: ${plan.widths[3]} · ${plan.widths[4]}`);
  // iPad không đổi: 34% của 654 px vẫn lớn hơn mức sàn.
  const ipad = planColumns(cols, IPAD_PORTRAIT);
  assert.equal(Math.round(ipad.widths[3]), Math.round(IPAD_PORTRAIT * 0.34));
});

test('ghim cột: cột tên trong ba cột đầu và cuộn tới được; không thì ghim cột đầu (trước: ghim cột thứ tư, không bao giờ dính)', () => {
  // "Đối tác liên danh": MST đối tác | Số gói chung | Giá trị gói | Chủ đầu tư (cột chữ dài duy nhất, đứng thứ tư) | Năm
  const partners = [C(125, 60, 110, false), C(76, 50, 110, false), C(159, 60, 100, false), C(520, 60, 110, true), C(64, 50, 50, false)];
  const plan = planColumns(partners, 320);
  assert.equal(plan.primary, 3);
  assert.equal(pinColumn(plan, 320), 0, 'cột chữ dài đứng thứ tư: ghim cột đầu (mã số thuế)');
  // Cột tên đứng thứ ba, bảng cuộn đủ xa: ghim nó, hai cột trước trôi đi.
  assert.equal(pinColumn({ primary: 2, widths: [110, 177, 150, 168, 168, 161], total: 934 }, 356), 2);
  // Cột tên đứng thứ hai nhưng bảng chỉ cuộn được 40 px, không đủ để cột đầu (60 px) trôi hết: ghim cột đầu.
  assert.equal(pinColumn({ primary: 1, widths: [60, 200, 100, 80], total: 440 }, 400), 0);
  assert.equal(pinColumn({ primary: 0, widths: [200, 100], total: 300 }, 200), 0);
  assert.equal(pinColumn({ primary: -1, widths: [80, 80, 80], total: 240 }, 200), 0);
});

test('điện thoại — bố cục thẻ: cột tên làm tiêu đề thẻ; ô không vừa nửa thẻ thì chiếm cả hàng; số ngắn đi đôi', () => {
  assert.equal(CARD_BELOW, 430);
  const cols = [C(110, 60, 80, false), C(177, 60, 95, false), C(900, 60, 95, true), C(640, 70, 140, true), C(161, 60, 120, false), C(86, 60, 90, false), C(40, 30, 40, false, { bar: true })];
  const { main, wide } = cardLayout(cols, PHONE);
  assert.equal(main, 2, 'cột chữ dài đầu tiên (Gói thầu) lên đầu thẻ');
  // Nửa thẻ = (330 − 24 − 12) / 2 = 147 px phần chữ.
  assert.deepEqual(wide, [false, true, true, true, false, false, true]);
  // Bảng không có cột chữ dài: cột đầu làm tiêu đề thẻ.
  assert.equal(cardLayout([C(90, 60, 60, false), C(80, 60, 60, false), C(70, 60, 60, false), C(60, 50, 50, false)], PHONE).main, 0);
  // Cột chữ dài đứng thứ tư trở đi không làm tiêu đề (dòng được nhận ra bằng cột đầu).
  assert.equal(cardLayout([C(90, 60, 60, false), C(80, 60, 60, false), C(70, 60, 60, false), C(600, 50, 50, true)], PHONE).main, 0);
});

test('CSS chế độ thẻ chỉ có trên màn hình và không áp dụng trong lúc đo; ô số liệu và dòng nhắc không đẩy trang rộng ra', () => {
  for (const rule of ['@media screen{\n  table.fit-cards:not(.fit-m){display:block', 'table.fit-cards:not(.fit-m)>tbody>tr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)',
    'td[data-fit-label]:not([data-fit-label=""])::before{content:attr(data-fit-label)', 'td.fit-wide{grid-column:1/-1', 'td.fit-main{order:-1',
    '.table-scroll-hint{position:sticky;left:0;display:inline-block;box-sizing:border-box;max-width:100%', 'html[data-room="xs"] .metrics>*{flex:1 1 138px;max-width:100%']) assert.ok(theme.includes(rule), rule);
  assert.ok(!/\.table-scroll-hint\{[^}]*white-space:nowrap/.test(theme), 'dòng nhắc "vuốt ngang" phải được xuống dòng');
  // Nút cần cầu nối Windows không hiện trên bản Safari (iPad không có cầu nối).
  assert.ok(theme.includes('html[data-platform="safari"] [data-dl]{display:none!important}'));
  // Mũi tên sắp xếp vẽ bằng CSS, không chiếm bề rộng cột (đặt absolute, không ghi toạ độ: đứng đúng chỗ trong dòng).
  assert.match(theme, /table th\.fit-sort\{position:relative;/);
  assert.match(theme, /table th\.fit-sort::after\{content:"";position:absolute;display:inline-block;width:8px;height:11px;margin:\.34em 0 0 3px/);
  assert.ok(!/fit-sort[^{]*::after\{[^}]*content:"\\21/.test(theme), 'không dùng ký tự mũi tên của phông chữ');
  const fit = read('lib/table-fit.js');
  assert.match(fit, /job\.cards = job\.simple && job\.plan\.scroll && job\.avail < CARD_BELOW/);
  assert.match(fit, /table\.classList\.remove\('fit-tight', 'fit-cards'\);[\s\S]{0,900}getComputedStyle\(cell\)/, 'gỡ chế độ gọn/thẻ TRƯỚC khi đọc kiểu của ô');
});

test('bảng so sánh gói trên điện thoại: tiêu đề cột là cả tên gói không còn kéo mỗi cột lên 473–605 px', () => {
  // Tiêu chí | ba gói (tiêu đề một dòng 840–1 080 px, nội dung ô khoảng 300 px)
  const cols = [C(120, 70, 110, false, { rowHead: true }), C(300, 90, 840, true), C(300, 90, 840, true), C(320, 90, 1080, true)];
  const plan = planColumns(cols, 302);
  assert.equal(plan.scroll, true);
  for (const w of plan.widths.slice(1)) assert.ok(w <= 300, `cột gói rộng ${w}`);
  assert.ok(plan.total < 302 * 2.5, `cả bảng ${plan.total} px (trước: 1 673 px)`);
  assert.equal(pinColumn(plan, 302, cols), 0, 'cột "Tiêu chí" (tiêu đề dòng) đứng yên khi vuốt giữa các gói');
  // Tiêu đề hai, ba từ của cột số vẫn theo quy tắc hai dòng như cũ.
  const short = planColumns([C(640, 60, 95, true), C(70, 80, 160, false), C(152, 60, 115, false)], 330);
  assert.ok(short.widths[1] >= 80 && short.widths[1] <= 120, `"Độc lập / Liên danh": ${short.widths[1]}`);
});

test('cột chữ có một từ không ngắt được (đường dẫn, tên tệp): bề rộng thật thành mức sàn, kể cả khi ép cho vừa khung', () => {
  // Ba cột: tên tệp (chữ dài, có từ liền 300 px), ngày, dung lượng. Khung 520 px.
  const base = [C(420, 60, 90, true), C(110, 50, 70, false), C(90, 50, 80, false)];
  const before = planColumns(base, 520);
  assert.equal(before.scroll, false);
  // Sau khi đo thấy cột đầu thực tế rộng 330 px (từ không ngắt được), bộ dàn cột ghi fixed = 330 và chia lại.
  const after = planColumns([{ ...base[0], fixed: 330 }, base[1], base[2]], 520);
  assert.ok(after.widths[0] >= 330, `cột tên tệp ${after.widths[0]}`);
  // Khung hẹp tới mức không chứa nổi: phải cuộn, không được ép cột xuống dưới mức sàn đó.
  const narrow = planColumns([{ ...base[0], fixed: 330 }, base[1], base[2]], 400);
  assert.equal(narrow.scroll, true);
  assert.ok(narrow.widths[0] >= 330);
  const fit = read('lib/table-fit.js');
  assert.match(fit, /const spill = !job\.plan\.scroll && job\.table\.getBoundingClientRect\(\)\.width \/ job\.scale > job\.avail \+ 2;/);
});
