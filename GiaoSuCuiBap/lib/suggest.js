/* ============================================================================
 *  Ô GỢI Ý RIÊNG CỦA PHẦN MỀM — tỉnh/thành, xã/phường, Ban QLDA (4.23.0)
 *
 *  LỖI THẤY TRÊN iPad THẬT (ảnh ngày 21/11/2026): gõ "thành phố đồng" để tìm Đồng Nai mà
 *  không có gợi ý, thanh trên bàn phím vẫn hiện Bắc Ninh · Cần Thơ · Đà Nẵng.
 *
 *  Danh mục KHÔNG cũ: phần mềm lấy tên tỉnh/thành thẳng từ e-GP và đã có "Thành phố Đồng Nai".
 *  Lỗi nằm ở chỗ các ô này dùng danh sách gợi ý CÓ SẴN của trình duyệt (<datalist>):
 *    - trên iPad nó chỉ hiện đúng 3 gợi ý trên thanh bàn phím, không có danh sách để cuộn;
 *    - nó so chữ rất cứng: không hiểu gõ không dấu, và (suy từ hành vi trong ảnh; chưa đọc được
 *      mã nguồn WebKit để khẳng định) chỉ bỏ qua hoa/thường với chữ không dấu, nên "đ" thường
 *      không khớp "Đ" hoa trong "Đồng Nai".
 *  Mô-đun này thay danh sách của trình duyệt bằng danh sách của chính phần mềm, dùng chung cho
 *  mọi màn hình: gõ không dấu, gõ "tp" / "tỉnh" / "thành phố", viết tắt (hcm), tên tỉnh cũ đã
 *  sáp nhập đều ra; danh sách đầy đủ, cuộn được, mỗi dòng đủ cao cho ngón tay.
 *
 *  Phần xếp hạng nằm ở lib/province-names.js (hàm thuần, có bài kiểm thử). Tệp này chỉ lo
 *  giao diện. Ô nhập vẫn là ô chữ bình thường: không chọn gợi ý mà gõ tay thì mọi thứ chạy
 *  như trước.
 * ========================================================================== */
import { TOUCH } from './device.js';
import { foldName, provinceCore, buildProvinceOptions, rankProvinces, rankPlain, wardCore, mergedInto, tokenAt, applyPick, highlightParts } from './province-names.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const defaultSend = (type, payload) => chrome.runtime.sendMessage({ type, payload });
const bareName = (value) => String(value || '').replace(/^(?:Tỉnh|Thành phố|TP\.?)\s+/i, '').trim();
/** Danh sách gợi ý không hẹp hơn mức này (px CSS) khi còn chỗ — đủ cho "Tỉnh Lâm Đồng · gồm tỉnh Bình Thuận cũ…". */
const POP_WIDTH = 300;
const controllers = new WeakMap();
let serial = 0;

/* Danh mục tỉnh/thành: hỏi nền một lần cho cả trang. */
let provinceRequest = null;
function loadProvinces(send) {
  provinceRequest ||= Promise.resolve().then(() => send('AREA_OPTIONS', { provincesOnly: true }))
    .then((r) => (r && r.ok ? { current: r.provinces || [], legacy: r.legacyProvinces || [], stale: Boolean(r.stale) } : { current: [], legacy: [], failed: (r && r.message) || 'e-GP chưa trả danh mục' }))
    .catch((error) => ({ current: [], legacy: [], failed: String((error && error.message) || error) }));
  return provinceRequest;
}

/** Một dòng trong danh mục xã/phường — nhãn do ward-picker.js đặt: "Tên · mã … · tỉnh … · hiện hành". */
function plainOption(label) {
  const parts = String(label || '').split(' · ').map((p) => p.trim()).filter(Boolean);
  const org = parts[0] === 'Ban QLDA' && parts.length > 1;
  const title = org ? parts[1] : parts[0] || '';
  return { value: label, title, badge: org ? 'Ban QLDA' : '', sub: parts.slice(org ? 2 : 1).join(' · '), core: wardCore(title), full: foldName(label), old: /· mã cũ$/.test(label) };
}

/**
 * Gắn danh sách gợi ý vào một ô nhập.
 * @param {HTMLInputElement} input
 * @param {{kind?: 'province'|'ward'|'plain', multi?: boolean, bare?: boolean, list?: HTMLElement|null, send?: Function}} options
 *   kind  'province' = danh mục tỉnh/thành của e-GP; 'ward' / 'plain' = lấy từ <datalist> của trang
 *   multi ô nhận nhiều tên cách nhau bằng dấu phẩy (chỉ thay đoạn đang gõ)
 *   bare  điền tên không kèm "Tỉnh" / "Thành phố" (các ô lọc theo chữ trong kho)
 */
export function attachSuggest(input, { kind = 'plain', multi = false, bare = false, list = null, send = defaultSend } = {}) {
  if (!input || controllers.has(input)) return controllers.get(input) || null;
  const id = `sg-${++serial}`;
  const host = input.parentElement;
  if (getComputedStyle(host).position === 'static') host.classList.add('sg-host');
  input.removeAttribute('list');            // tắt danh sách có sẵn của trình duyệt (thanh 3 gợi ý trên bàn phím iPad)
  input.classList.add('sg-input');
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', id);
  input.setAttribute('autocomplete', 'off'); input.setAttribute('autocorrect', 'off'); input.setAttribute('autocapitalize', 'off'); input.setAttribute('spellcheck', 'false');
  input.setAttribute('enterkeyhint', 'done');

  const pop = document.createElement('div');
  pop.className = 'sg-pop'; pop.id = id; pop.setAttribute('role', 'listbox'); pop.hidden = true;
  pop.setAttribute('aria-label', kind === 'province' ? 'Tỉnh, thành phố theo danh mục e-GP' : 'Gợi ý');
  const clear = document.createElement('button');
  clear.type = 'button'; clear.className = 'sg-clear'; clear.hidden = true; clear.setAttribute('aria-label', 'Xoá ô này'); clear.textContent = '×';
  const note = document.createElement('div');
  note.className = 'sg-note'; note.hidden = true; note.setAttribute('role', 'status');
  input.after(clear, pop, note);

  let options = [], items = [], active = -1, open = false, state = kind === 'province' ? 'loading' : 'ready', failed = '';

  const readList = () => (list ? Array.from(list.querySelectorAll('option'), (o) => o.value).filter(Boolean) : []);
  function rebuild(provinces) {
    if (kind === 'province') {
      const fromPage = readList();
      const current = provinces && provinces.current.length ? provinces.current : fromPage;
      options = buildProvinceOptions(current, provinces ? provinces.legacy : []);
      failed = provinces && provinces.failed && !options.length ? provinces.failed : '';
      state = options.length ? 'ready' : provinces ? 'empty' : 'loading';
    } else {
      options = readList().map(plainOption);
      state = 'ready';
    }
    if (open) refresh();
  }
  if (kind === 'province') { rebuild(null); loadProvinces(send).then(rebuild); } else rebuild(null);
  if (list && typeof MutationObserver === 'function') new MutationObserver(() => { if (kind !== 'province' || !options.length) rebuild(null); else if (open) refresh(); }).observe(list, { childList: true });

  const range = () => tokenAt(input.value, input.selectionStart ?? input.value.length, multi);
  const valueOf = (option) => (bare ? bareName(option.value) : option.value);

  /** Khung giới hạn bề ngang của danh sách: phần tử cha gần nhất có cắt nội dung, không thì vùng nội dung của trang. */
  function frameRect() {
    for (let el = host; el && el !== document.documentElement; el = el.parentElement) {
      if (el.tagName === 'MAIN' || el.tagName === 'DIALOG' || getComputedStyle(el).overflowX !== 'visible') return el.getBoundingClientRect();
    }
    return document.documentElement.getBoundingClientRect();
  }
  function place() {
    const top = input.offsetTop + input.offsetHeight;
    // Ô nhập hẹp (biểu mẫu bốn cột trên iPad xoay ngang, máy tính): danh sách vẫn rộng đủ đọc — nới sang phải nếu
    // còn chỗ, không thì canh theo mép phải của ô. Không bao giờ vượt khỏi khung chứa.
    let width = input.offsetWidth, left = input.offsetLeft;
    if (width < POP_WIDTH) {
      const rect = input.getBoundingClientRect(), scale = width ? rect.width / width : 1, frame = frameRect();
      const right = (frame.right - rect.left) / scale - 10, back = (rect.right - frame.left) / scale - 10;
      if (right >= POP_WIDTH) width = POP_WIDTH;
      else if (back >= POP_WIDTH) { left -= POP_WIDTH - width; width = POP_WIDTH; }
      else width = Math.max(width, Math.min(POP_WIDTH, right));
    }
    pop.style.top = `${top + 5}px`; pop.style.left = `${left}px`; pop.style.width = `${width}px`;
    clear.style.top = `${input.offsetTop}px`; clear.style.height = `${input.offsetHeight}px`; clear.style.left = `${input.offsetLeft + input.offsetWidth - clear.offsetWidth}px`;
  }
  /** Chỗ trống (px màn hình) từ đáy ô nhập tới đáy vùng còn nhìn thấy — đã trừ bàn phím ảo nếu biết. */
  function roomBelow() {
    const rect = input.getBoundingClientRect();
    let bottom = window.innerHeight;
    try {
      const top = window.top;
      if (top !== window && top.visualViewport && window.frameElement) bottom = Math.min(bottom, top.visualViewport.offsetTop + top.visualViewport.height - window.frameElement.getBoundingClientRect().top);
      else if (window.visualViewport) bottom = Math.min(bottom, window.visualViewport.offsetTop + window.visualViewport.height);
    } catch { /* khung khác nguồn: dùng chiều cao của khung */ }
    return { room: bottom - rect.bottom, scale: input.offsetWidth ? rect.width / input.offsetWidth : 1 };
  }
  /** Ô vừa đưa lên đầu màn hình có thể nằm DƯỚI thanh tiêu đề dính của trang (trên điện thoại thanh đó cao tới
   *  180 px, hơn mức scroll-margin 96 px của ô): kéo trang xuống đúng phần bị che cho ô và danh sách lộ ra. */
  function uncover() {
    for (let pass = 0; pass < 2; pass++) {
      const rect = input.getBoundingClientRect();
      const over = document.elementFromPoint(rect.left + Math.min(24, rect.width / 2), rect.top + 3);
      if (!over || over === input || host.contains(over)) return;
      let bar = over;
      while (bar && bar !== document.body && !/sticky|fixed/.test(getComputedStyle(bar).position)) bar = bar.parentElement;
      if (!bar || bar === document.body) return;
      const scale = input.offsetWidth ? rect.width / input.offsetWidth : 1;
      window.scrollBy(0, -Math.ceil((bar.getBoundingClientRect().bottom - rect.top) / (scale || 1) + 10));
    }
  }
  function size(allowScroll) {
    if (!open) return;
    place();
    let { room, scale } = roomBelow();
    if (room < 210) {
      // Các trang đặt cuộn "mượt" (scroll-behavior:smooth): cuộn mượt thì phép tính chỗ trống ngay sau đó vẫn thấy
      // vị trí CŨ (đo 21/11/2026: trang mới nhích 7 px, danh sách nằm ngoài màn hình). Tạm tắt để cuộn tức thì.
      const root = document.documentElement, smooth = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      try {
        // Máy cảm ứng: bàn phím che nửa dưới — đưa ô nhập lên đầu vùng nhìn. Máy tính: chỉ nhích trang vừa đủ cho danh sách.
        if (allowScroll && typeof input.scrollIntoView === 'function') { input.scrollIntoView({ block: 'start' }); uncover(); }
        else if (!TOUCH) window.scrollBy(0, Math.max(0, Math.min(250 - room, input.getBoundingClientRect().top - 90)) / (scale || 1));
      } finally { root.style.scrollBehavior = smooth; }
      ({ room, scale } = roomBelow());
    }
    pop.style.maxHeight = `${Math.round(Math.max(132, Math.min(380, room - 14)) / (scale || 1))}px`;
  }

  function render() {
    const typed = range().query;
    let html = '';
    if (state === 'loading') html = '<div class="sg-empty">Đang lấy danh mục tỉnh, thành phố từ e-GP…</div>';
    else if (state === 'empty') html = `<div class="sg-empty">Chưa lấy được danh mục tỉnh, thành phố từ e-GP${failed ? ` (${esc(failed).slice(0, 120)})` : ''}. Bạn vẫn gõ tên đầy đủ được.</div>`;
    else if (!options.length) html = `<div class="sg-empty">${kind === 'ward' ? 'Chọn tỉnh trước để có danh sách xã/phường và Ban QLDA.' : 'Chưa có gợi ý.'}</div>`;
    else {
      const what = kind === 'province' ? 'tỉnh, thành phố' : kind === 'ward' ? 'xã/phường, Ban QLDA' : 'mục';
      const more = kind !== 'province' && !typed && options.length > items.length ? ` · đang hiện ${items.length}` : '';
      html = `<div class="sg-head">${typed ? `${items.length} kết quả cho “${esc(typed)}”` : `${options.filter((o) => !o.legacy).length} ${what}${kind === 'province' ? ' theo danh mục e-GP' : ''}${more} · gõ vài chữ để lọc, không cần dấu`}</div>`;
      if (!items.length) html += `<div class="sg-empty">Không có ${what} nào khớp “${esc(typed)}”. Thử gõ ít chữ hơn.</div>`;
      let legacyShown = false;
      html += items.map((item, i) => {
        const o = item.option;
        const title = kind === 'province' ? valueOf(o) : o.title;
        const [a, b, c] = item.via === 'merged' || item.via === 'spelling' || item.via === 'near' || item.via === 'group' ? [title, '', ''] : highlightParts(title, typed);
        const divider = o.legacy && !legacyShown ? '<div class="sg-divider">Tên cũ trước sáp nhập</div>' : '';
        if (o.legacy) legacyShown = true;
        const sub = [o.badge ? `<b class="sg-badge">${esc(o.badge)}</b>` : '', esc(item.note || o.sub || '')].filter(Boolean).join(' ');
        return `${divider}<div class="sg-opt${i === active ? ' is-active' : ''}${o.legacy ? ' is-legacy' : ''}" role="option" id="${id}-o${i}" data-i="${i}" aria-selected="${i === active}">`
          + `<span class="sg-title">${esc(a)}${b ? `<mark>${esc(b)}</mark>` : ''}${esc(c)}</span>${sub ? `<span class="sg-sub">${sub}</span>` : ''}</div>`;
      }).join('');
      if (multi && items.length) html += `<div class="sg-foot">Thêm tỉnh nữa: ${TOUCH ? 'chọn xong chạm lại vào ô, ' : ''}gõ dấu phẩy rồi gõ tên tiếp theo.</div>`;
    }
    pop.innerHTML = html;
    if (active >= 0) input.setAttribute('aria-activedescendant', `${id}-o${active}`); else input.removeAttribute('aria-activedescendant');
  }
  function refresh() {
    const typed = range().query;
    items = kind === 'province' ? rankProvinces(options, typed) : rankPlain(options, typed);
    active = typed && items.length ? 0 : -1;
    render();
  }
  function show(allowScroll = TOUCH) {
    if (input.disabled || input.readOnly) return;
    if (!open) { open = true; pop.hidden = false; input.setAttribute('aria-expanded', 'true'); }
    refresh(); size(allowScroll);
  }
  function hide() {
    if (!open) return;
    open = false; pop.hidden = true; active = -1;
    input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
  }
  /** Ghi giá trị và báo cho trang biết (như người dùng vừa gõ) — nhưng không tự mở lại danh sách. */
  let committing = false;
  function commit(text, caret) {
    input.value = text;
    try { input.setSelectionRange(caret, caret); } catch { /* ô không hỗ trợ đặt con trỏ */ }
    committing = true;
    try {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } finally { committing = false; }
    sync();
  }
  function pick(index) {
    const item = items[index];
    if (!item) return;
    const next = applyPick(input.value, range(), valueOf(item.option), multi);
    hide();
    commit(next.value, next.caret);
    // Chọn xong thì hạ bàn phím để thấy lại biểu mẫu và nút Tìm (ảnh iPad thật: bàn phím che gần nửa màn hình).
    // Ô nhận nhiều tỉnh cũng vậy — muốn thêm tỉnh thì chạm lại vào ô, gõ dấu phẩy rồi gõ tên tiếp theo.
    if (TOUCH) input.blur();
  }
  function move(step) {
    if (!items.length) return;
    active = (active + step + items.length) % items.length;
    render();
    const row = pop.querySelector('.sg-opt.is-active');
    if (row) { const top = row.offsetTop, bottom = top + row.offsetHeight; if (top < pop.scrollTop) pop.scrollTop = top - 34; else if (bottom > pop.scrollTop + pop.clientHeight) pop.scrollTop = bottom - pop.clientHeight; }
  }
  /** Nút xoá, và lời nhắc khi tên đang gõ là tỉnh cũ đã sáp nhập. */
  function sync() {
    clear.hidden = !input.value || input.disabled;
    if (!clear.hidden) place();
    if (kind !== 'province' || bare) return;
    const text = input.value;
    const names = multi ? text.split(/\s*[;|\n]+\s*|,(?=\s*[^0-9])/).map((s) => s.trim()).filter(Boolean) : [text.trim()].filter(Boolean);
    const old = names.map((name) => ({ name, merged: mergedInto(name) })).find((x) => x.merged && !options.some((o) => !o.legacy && o.core === provinceCore(x.name)));
    const target = old && options.find((o) => !o.legacy && o.core === old.merged.intoCore);
    if (!old || !target || (document.activeElement === input && open)) { note.hidden = true; note.textContent = ''; return; }
    note.innerHTML = `“${esc(old.name)}” đã nhập vào <b>${esc(target.value)}</b> từ 1/7/2025. Giữ tên cũ thì chỉ ra hồ sơ đăng trước ngày đó. <button type="button" class="sg-fix">Đổi sang ${esc(target.value)}</button>`;
    note.hidden = false;
    note.querySelector('.sg-fix').addEventListener('click', () => {
      const at = input.value.indexOf(old.name);
      if (at < 0) return;
      commit(input.value.slice(0, at) + target.value + input.value.slice(at + old.name.length), at + target.value.length);
    });
  }

  input.addEventListener('focus', () => {
    show();
    // Bàn phím ảo trượt lên SAU khi ô được chọn (ảnh iPad thật 21/11/2026: bàn phím cao khoảng 400 điểm, còn 113 điểm
    // dưới ô nhập). Trình duyệt báo việc đó qua visualViewport; tính lại thêm hai nhịp phòng khi sự kiện không tới.
    if (TOUCH) { setTimeout(again, 380); setTimeout(again, 900); }
  });
  input.addEventListener('click', () => { if (!open) show(); });
  // Chỉ mở khi NGƯỜI DÙNG đang gõ trong ô. Trang tự điền (lấy từ cấu hình, điền lại tiêu chí đã lưu,
  // "Hiểu câu này") cũng phát sự kiện input — lúc đó ô không được chọn và danh sách không được bật ra.
  // Đang gõ mà danh sách không còn chỗ hiện (ô nằm sát bàn phím, hoặc trang vừa bị kéo đi): trên máy cảm ứng thì đưa ô
  // lên đầu màn hình MỘT lần — sau đó đã đủ chỗ nên không nhảy nữa.
  input.addEventListener('input', () => { if (committing) return; if (document.activeElement === input) show(TOUCH); sync(); });
  input.addEventListener('change', sync);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); if (open) move(1); else show(false); }
    else if (event.key === 'ArrowUp') { if (open) { event.preventDefault(); move(-1); } }
    else if (event.key === 'Enter') { if (open && active >= 0 && foldName(valueOf(items[active].option)) !== foldName(range().query)) { event.preventDefault(); pick(active); } else hide(); }
    else if (event.key === 'Escape') { if (open) { event.stopPropagation(); hide(); } }
    else if (event.key === 'Tab') hide();
  });
  input.addEventListener('blur', (event) => {
    // Con trỏ sang một ô / nút KHÁC: đóng ngay. Giữ danh sách thêm 160 ms ở đây thì nó còn che nút "Tìm gói thầu" đúng
    // lúc người dùng bấm (bài đo kết quả tức thì 21/11/2026: lần bấm bị trễ 0,85 giây vì nút bị che).
    const next = event.relatedTarget;
    if (next && next !== clear && !pop.contains(next)) { hide(); sync(); return; }
    // Không biết con trỏ đi đâu (chạm vào một dòng gợi ý trên iPad làm ô mất con trỏ trước khi lần chạm tới nơi): chờ một nhịp.
    setTimeout(() => { if (document.activeElement !== input) { hide(); sync(); } }, 160);
  });
  pop.addEventListener('mousedown', (event) => event.preventDefault());   // giữ con trỏ (và bàn phím) ở ô nhập khi chạm vào danh sách
  pop.addEventListener('click', (event) => { const row = event.target.closest('.sg-opt'); if (row) pick(Number(row.dataset.i)); });
  clear.addEventListener('mousedown', (event) => event.preventDefault());
  clear.addEventListener('click', () => { commit('', 0); input.focus(); show(); });
  document.addEventListener('pointerdown', (event) => { if (open && event.target !== input && !pop.contains(event.target) && event.target !== clear) hide(); }, true);
  function again() { if (open) size(document.activeElement === input && TOUCH); else if (!clear.hidden) place(); }
  window.addEventListener('resize', again);
  try { const vv = (window.top !== window && window.top.visualViewport) || window.visualViewport; if (vv) vv.addEventListener('resize', again); } catch { /* khung khác nguồn */ }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (open || !clear.hidden) place(); }).observe(input);
  sync();

  const controller = { refresh: () => rebuild(null), hide, show, get open() { return open; }, get options() { return options; } };
  controllers.set(input, controller);
  return controller;
}

/**
 * Gắn cho mọi ô phù hợp trên trang (shell.js gọi một lần):
 *  - ô có <datalist> (tỉnh, xã/phường…): thay danh sách của trình duyệt;
 *  - ô #province không có <datalist> (các trang lọc trong kho) và ô có data-suggest="province":
 *    thêm gợi ý; ô lọc theo chữ trong kho thì điền tên không kèm "Tỉnh" / "Thành phố".
 */
export function enhanceSuggest({ send = defaultSend, root = document } = {}) {
  const done = [];
  for (const input of root.querySelectorAll('input[list], input#province, input[data-suggest]')) {
    if (controllers.has(input) || input.type === 'hidden' || input.dataset.suggest === 'off') continue;
    const list = input.getAttribute('list') ? document.getElementById(input.getAttribute('list')) : null;
    const kind = input.dataset.suggest === 'province' || input.id === 'province' || (list && list.id === 'province-list') ? 'province' : input.id === 'ward' || (list && list.id === 'ward-list') ? 'ward' : 'plain';
    if (kind === 'plain' && !list) continue;
    const label = input.id ? root.querySelector(`label[for="${input.id}"]`) : null;
    const multi = input.dataset.multi === '1' || (kind === 'province' && /nhiều tỉnh/i.test(`${input.placeholder} ${label ? label.textContent : ''}`));
    done.push(attachSuggest(input, { kind, multi, bare: kind === 'province' && !list, list, send }));
  }
  return done;
}
