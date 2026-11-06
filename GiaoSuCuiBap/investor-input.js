import { parseInvestorFilter } from './lib/investor-filter.js';
import { foldText } from './lib/core.js';

const controllers = new WeakMap();
const textKey = value => String(value ?? '').trim().toLocaleLowerCase('vi');
const defaultSend = (type, payload) => chrome.runtime.sendMessage({type, payload});
const safeSource = value => {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; }
  catch { return ''; }
};

/** The caret identifies one OR alternative; commas remain part of its name. */
export function investorTermRange(value, caret = String(value ?? '').length) {
  const text = String(value ?? '');
  const at = Math.max(0, Math.min(text.length, Number(caret) || 0));
  const left = at === 0 ? 0 : Math.max(text.lastIndexOf(';', at - 1), text.lastIndexOf('\n', at - 1), text.lastIndexOf('\r', at - 1)) + 1;
  const tail = text.slice(at).search(/[;\r\n]/);
  return {start: left, end: tail < 0 ? text.length : at + tail, query: text.slice(left, tail < 0 ? text.length : at + tail).trim()};
}

/** Validate the whole list before committing a choice, without truncation. */
export function applyInvestorChoice(value, queryValue, {caret, append = false} = {}) {
  const choice = String(queryValue ?? '').trim();
  if (!choice || /[;\r\n]/.test(choice)) return {ok: false, message: 'Danh mục trả về tên hoặc mã không hợp lệ.'};
  const text = String(value ?? '');
  const range = investorTermRange(text, caret ?? text.length);
  return parseInvestorFilter(append ? [text.trim(), choice].filter(Boolean).join('; ')
    : text.slice(0, range.start) + choice + text.slice(range.end));
}

const provinceKey = value => foldText(String(value ?? '')).replace(/[^a-z0-9]+/g, ' ').trim().replace(/^(?:tinh|thanh pho|tp)\s+/, '');
export function directoryEntryWithinProvince(entry, province) {
  const names = String(province ?? '').split(/[,;\r\n]+/).map(provinceKey).filter(Boolean);
  if (!names.length) return true;
  const accepted = [entry?.provinceName, ...(entry?.provinceAliases || [])].map(provinceKey).filter(Boolean);
  return accepted.some(name => names.includes(name));
}

function evidenceText(entry) {
  const observed = entry.status === 'observed';
  const source = entry.evidenceLabel || (observed ? 'Đã thấy trên e-GP; chưa xác minh hoạt động' : 'Nguồn chính thức');
  return `${source}${entry.sourceDate && !source.includes(entry.sourceDate) ? ' · ' + entry.sourceDate : ''}`;
}

/** Shared entry point for an organization chosen from the combined area picker. */
export function selectInvestorDirectoryEntry(input, entry, {append = false} = {}) {
  const controller = controllers.get(input);
  if (controller) return controller.select(entry, {append});
  const parsed = applyInvestorChoice(input.value, entry?.queryValue, {caret: input.selectionStart, append});
  if (!parsed.ok) return false;
  input.value = parsed.value;
  input.dispatchEvent(new Event('input', {bubbles: true}));
  input.dispatchEvent(new Event('change', {bubbles: true}));
  return true;
}

/** Names are OR alternatives; province remains an independent required scope. */
export function initInvestorInput(input, {province = true, provinceInput, send = defaultSend} = {}) {
  if (!input || controllers.has(input)) return input;
  const provinceField = province === false ? null : (provinceInput || document.getElementById('province'));
  input.maxLength = 500;
  input.placeholder = 'Đức Trọng; Đơn Dương; Phan Thiết';
  input.autocomplete = 'off';
  const parent = input.parentElement;
  const wrap = document.createElement('div');
  wrap.className = 'investor-directory-control';
  parent.insertBefore(wrap, input);
  wrap.append(input);
  const list = document.createElement('div');
  list.id = `${input.id}-directory-list`;
  list.className = 'investor-directory-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Chủ đầu tư và Ban quản lý dự án');
  list.hidden = true;
  wrap.append(list);
  const selections = document.createElement('div');
  selections.className = 'investor-directory-selections';
  selections.hidden = true;
  wrap.insertAdjacentElement('afterend', selections);
  const hint = document.createElement('small');
  hint.id = `${input.id}-multi-hint`;
  hint.className = 'muted investor-multi-hint';
  hint.textContent = 'Cách bằng dấu ; · tối đa 20 tên/mã. Khớp một trong các tên hoặc mã' + (province ? ', đồng thời thuộc tỉnh đã chọn.' : ' trong kho quan sát đã lưu.');
  selections.insertAdjacentElement('afterend', hint);
  const message = document.createElement('small');
  message.id = `${input.id}-directory-message`;
  message.className = 'investor-directory-message muted';
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  message.hidden = true;
  hint.insertAdjacentElement('afterend', message);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), hint.id, message.id].filter(Boolean).join(' '));
  input.title = 'Gõ tên hoặc tên viết tắt để xem gợi ý có nguồn. Chọn gợi ý dùng mã e-GP đã đối chiếu nếu có; mục chưa có mã tìm theo tên. Dấu ; tách các mục, dấu phẩy trong tên được giữ nguyên.';

  let entries = [], active = -1, request = 0, timer, blurTimer, selected = new Map(), choosing = false;
  const cache = new Map();
  const provinceValue = () => provinceField?.value.trim() || '';
  const notice = (text, error = false) => {
    message.textContent = text;
    message.hidden = !text;
    message.classList.toggle('is-error', error);
  };
  const close = () => {
    list.hidden = true;
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  function syncSelections() {
    const parsed = parseInvestorFilter(input.value);
    const terms = new Set((parsed.terms || []).map(textKey));
    selected = new Map([...selected].filter(([key]) => terms.has(key)));
    selections.replaceChildren();
    const wrong = [];
    for (const [key, entry] of selected) {
      const chip = document.createElement('div');
      chip.className = 'investor-directory-chip';
      const mismatch = provinceField && !directoryEntryWithinProvince(entry, provinceValue());
      if (mismatch) { chip.classList.add('is-mismatch'); wrong.push(entry.name); }
      const name = document.createElement('span');
      name.textContent = entry.name;
      const detail = document.createElement('small');
      detail.textContent = [entry.provinceName, entry.eGpCode ? `Mã e-GP ${entry.eGpCode}` : 'Tìm theo tên; chưa có mã e-GP'].filter(Boolean).join(' · ');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'investor-directory-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Xóa lựa chọn ${entry.name}`);
      remove.addEventListener('click', () => {
        const current = parseInvestorFilter(input.value);
        if (!current.ok) return;
        input.value = current.terms.filter(term => textKey(term) !== key).join('; ');
        selected.delete(key);
        input.dispatchEvent(new Event('input', {bubbles: true}));
        input.dispatchEvent(new Event('change', {bubbles: true}));
        syncSelections();
      });
      chip.append(name, detail, remove);
      selections.append(chip);
    }
    selections.hidden = !selected.size;
    const invalid = wrong.length ? `Lựa chọn đã lưu gắn với tỉnh khác: ${wrong.join('; ')}. Chọn lại tỉnh phù hợp hoặc xóa lựa chọn đó trước khi tra cứu.` : '';
    input.setCustomValidity(invalid);
    input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
    if (invalid) { close(); notice(invalid, true); }
    else if (message.classList.contains('is-error')) notice('');
    return invalid;
  }
  function setActive(index) {
    const options = [...list.querySelectorAll('[role="option"]')];
    if (!options.length) return;
    active = Math.max(0, Math.min(index, options.length - 1));
    options.forEach((option, i) => {
      option.setAttribute('aria-selected', String(i === active));
      option.classList.toggle('is-active', i === active);
    });
    input.setAttribute('aria-activedescendant', options[active].id);
    options[active].scrollIntoView({block: 'nearest'});
  }
  function render(result) {
    entries = (result.entries || []).filter(entry => entry && entry.name && entry.queryValue
      && (!provinceField || directoryEntryWithinProvince(entry, provinceValue()))).slice(0, 20);
    list.replaceChildren();
    active = -1;
    input.removeAttribute('aria-activedescendant');
    entries.forEach((entry, index) => {
      const option = document.createElement('div');
      option.className = 'investor-directory-option';
      option.id = `${list.id}-${index}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.dataset.index = String(index);
      const name = document.createElement('strong');
      name.textContent = entry.name;
      const meta = document.createElement('span');
      meta.className = 'investor-directory-meta';
      meta.textContent = [entry.provinceName, entry.eGpCode ? `Mã e-GP ${entry.eGpCode}` : 'Tìm theo tên; chưa có mã e-GP'].filter(Boolean).join(' · ');
      const evidence = document.createElement('span');
      evidence.className = 'investor-directory-evidence';
      evidence.textContent = evidenceText(entry);
      option.append(name, meta, evidence);
      const source = safeSource(entry.sourceUrl);
      if (source) {
        const link = document.createElement('a');
        link.href = source;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.tabIndex = -1;
        link.className = 'investor-directory-source';
        link.textContent = 'Xem nguồn ↗';
        link.setAttribute('aria-label', `Xem nguồn của ${entry.name}`);
        option.append(link);
      }
      list.append(option);
    });
    const footer = document.createElement('div');
    footer.className = 'investor-directory-coverage';
    const count = Number.isFinite(Number(result.total)) ? Number(result.total) : entries.length;
    footer.textContent = [entries.length ? `${entries.length}/${count} gợi ý${count > entries.length ? ' · gõ thêm để thu hẹp' : ''}` : 'Chưa có gợi ý khớp; có thể nhập tên hoặc mã để tra cứu.', result.coverage?.text].filter(Boolean).join(' · ');
    list.append(footer);
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  async function loadSuggestions() {
    // A validity focus must leave the mismatched selection's remove button
    // visible; typing a replacement first releases this mismatch guard.
    if(syncSelections())return;
    const id = ++request;
    const atProvince = provinceValue();
    const query = investorTermRange(input.value, input.selectionStart ?? input.value.length).query;
    const key = `${atProvince}\n${query}`;
    try {
      let result = cache.get(key);
      if (!result || Date.now() - result.at > 60_000) {
        const response = await send('INVESTOR_DIRECTORY', {province: atProvince, query, limit: 20});
        if (!response?.ok) throw new Error(response?.message || 'Chưa tải được danh mục chủ đầu tư.');
        result = {at: Date.now(), value: response};
        cache.set(key, result);
        if (cache.size > 40) cache.delete(cache.keys().next().value);
      }
      if (id !== request || atProvince !== provinceValue() || document.activeElement !== input) return;
      render(result.value);
    } catch {
      if (id !== request || document.activeElement !== input) return;
      close();
      if (!syncSelections()) notice('Chưa tải được gợi ý. Bạn vẫn có thể nhập tên hoặc mã; kiểm tra nguồn trước khi chọn đơn vị.');
    }
  }
  function select(entry, {append = false} = {}) {
    if(!entry?.queryValue || !entry.name)return false;
    if (provinceField && !directoryEntryWithinProvince(entry, provinceValue())) {
      notice('Gợi ý này không nằm trong phạm vi tỉnh đã chọn. Kiểm tra lại tỉnh trước khi thêm.', true);
      return false;
    }
    const parsed = applyInvestorChoice(input.value, entry.queryValue, {caret: input.selectionStart ?? input.value.length, append});
    if (!parsed.ok) { notice(parsed.message, true); return false; }
    choosing = true;
    selected.set(textKey(entry.queryValue), entry);
    input.value = parsed.value;
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
    choosing = false;
    close();
    clearTimeout(timer);
    request++;
    if (!syncSelections()) notice(`${entry.name} · ${entry.eGpCode ? 'dùng mã e-GP đã đối chiếu' : 'tìm theo tên; chưa có mã e-GP'}. ${evidenceText(entry)}`);
    return true;
  }
  controllers.set(input, {select, validate: syncSelections});
  input.addEventListener('focus', () => { clearTimeout(blurTimer); clearTimeout(timer); loadSuggestions(); });
  input.addEventListener('input', () => {
    syncSelections();
    request++;
    clearTimeout(timer);
    if (!choosing) { close(); timer = setTimeout(loadSuggestions, 180); }
  });
  input.addEventListener('change', syncSelections);
  input.addEventListener('click', () => { clearTimeout(timer); timer=setTimeout(loadSuggestions,180); });
  input.addEventListener('keyup', event => {
    if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      clearTimeout(timer);timer=setTimeout(loadSuggestions,180);
    }
  });
  input.addEventListener('blur', () => { clearTimeout(timer); request++; blurTimer=setTimeout(close, 120); });
  input.addEventListener('keydown', async event => {
    if (event.key === 'Escape') { close(); request++; clearTimeout(timer); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.hidden) await loadSuggestions();
      if (document.activeElement === input) setActive(active < 0 ? (event.key === 'ArrowDown' ? 0 : entries.length - 1) : active + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter' && !list.hidden && active >= 0 && entries[active]) {
      event.preventDefault();
      // Some legacy pages attach a second Enter handler to this same input.
      // Choosing a suggestion must not start their network scan as well.
      event.stopImmediatePropagation();
      select(entries[active]);
    }
  });
  list.addEventListener('mousedown', event => { if (!event.target.closest('a')) event.preventDefault(); });
  list.addEventListener('click', event => {
    if (event.target.closest('a')) return;
    const option = event.target.closest('[role="option"]');
    if (option) select(entries[Number(option.dataset.index)]);
  });
  for (const event of ['input', 'change']) provinceField?.addEventListener(event, () => {
    request++;
    clearTimeout(timer);
    close();
    syncSelections();
  });
  return input;
}

export function readInvestorInput(input) {
  const mismatch = controllers.get(input)?.validate();
  if (mismatch) { input.reportValidity(); return null; }
  const parsed = parseInvestorFilter(input.value);
  if (!parsed.ok) {
    input.setCustomValidity(parsed.message || 'Kiểm tra danh sách chủ đầu tư.');
    input.reportValidity();
    input.setCustomValidity('');
    return null;
  }
  input.value = parsed.value;
  return parsed;
}
