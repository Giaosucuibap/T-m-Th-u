/* ============================================================================
 *  PHÁT HÀNH AN TOÀN — bản mới chỉ thay khi người dùng đồng ý; quay về bản trước được
 *
 *  Dấu trang luôn tải tệp MỚI NHẤT trong kho rồi chạy nó. Trước 4.22.0, "chạy" nghĩa là
 *  dùng luôn: có bản mới là máy người dùng đổi ngay, không hỏi, không có đường lui. Từ
 *  4.22.0, đoạn mã ở đầu tệp này chạy TRƯỚC khi phần mềm khởi động và quyết định bản nào
 *  thật sự được dùng:
 *
 *    - Bản vừa tải về trùng bản đang dùng              → chạy luôn.
 *    - Khác bản đang dùng                              → hỏi: "Cập nhật ngay" / "Để sau".
 *        · Để sau → trao quyền cho BẢN ĐANG DÙNG (cất sẵn trong IndexedDB), 3 ngày sau hỏi lại.
 *        · Cập nhật → bản đang dùng thành "bản trước", bản mới thành bản đang dùng.
 *    - Người dùng đã "Quay về bản trước" (ghim)        → luôn trao quyền cho bản đã ghim.
 *    - Lần mở trước của một bản KHÔNG xong (treo, vỡ)  → hỏi: thử lại, hay dùng bản kia.
 *
 *  Vì tệp mới nhất luôn là tệp chạy đầu tiên, mọi quyết định và mọi hộp thoại nằm ở tệp mới
 *  nhất; bản được trao quyền không cần biết gì về cơ chế này — kể cả bản 4.21.0 cũ.
 *
 *  Ba bản của tệp cuibap.js nằm trong ngăn `goi` của kho gscb-safari:
 *    js    — bản tải về mới nhất (dấu trang cũng đọc khoá này khi mất mạng tới GitHub);
 *    dung  — bản đang dùng;      truoc — bản trước đó.
 *  Tình trạng nằm ở ngăn `meta`, khoá `phat-hanh`:
 *    { dung: {version, build, at}, truoc: {version, build}, moi: {version, build, notes},
 *      ghim: true|false, hoan: {build, until}, tuDong: true|false }
 * ========================================================================== */
const REL = Object.freeze({ state: 'phat-hanh', kept: 'goi-ban', tried: 'khoi-dong-thu', ok: 'khoi-dong-ok',
  newest: 'js', use: 'dung', prev: 'truoc', deferMs: 3 * 24 * 3600 * 1000 });
const ME = Object.freeze({ version: PACK.version, build: PACK.build });

/** Phiên bản và mã bản dựng ghi ở dòng đầu của một tệp cuibap.js; không phải tệp của Cùi Bắp thì null. */
function bundleInfo(text) {
  if (typeof text !== 'string' || text.indexOf('__GSCB_SAFARI__') < 0) return null;
  const m = /Giáo Sư Cùi Bắp (\d+\.\d+\.\d+)[^\n]*?Bản dựng ([0-9a-f]{12})/.exec(text.slice(0, 600));
  return m ? { version: m[1], build: m[2] } : null;
}

/** Chạy một tệp cuibap.js đã cất: eval trước; trang cấm eval thì dùng thẻ script nội tuyến. */
function runBundleText(text) {
  try { (0, eval)(text); return; } catch (error) { if (TOP.__GSCB_SAFARI__) throw error; }
  const script = TOP.document.createElement('script');
  script.textContent = text;
  TOP.document.documentElement.appendChild(script);
  script.remove();
}

/** Hộp chọn hiện TRƯỚC khi phần mềm khởi động. Trả 'primary' hoặc 'secondary'. */
function releaseDialog({ title, body, notes = [], primary, secondary, foot = '', auto }) {
  if (auto === 'primary' || auto === 'secondary') return Promise.resolve(auto);
  return new Promise((resolve) => {
    const doc = TOP.document;
    const host = doc.createElement('div');
    host.id = 'gscb-chon-ban';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:block';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
:host{all:initial}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.veil{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));background:rgba(5,33,30,.72);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
.card{width:min(520px,100%);max-height:100%;overflow:auto;-webkit-overflow-scrolling:touch;background:#fff;color:#0b1626;border-radius:18px;padding:22px 22px 18px;box-shadow:0 24px 64px rgba(0,0,0,.35)}
.kicker{font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#0f766e;margin:0 0 6px}
h2{font-size:21px;line-height:1.3;margin:0 0 8px;font-weight:700}
p{margin:0 0 10px;color:#334155}
ul{margin:0 0 14px;padding:0 0 0 20px;color:#1e293b}
li{margin:4px 0}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}
button{flex:1 1 180px;min-height:48px;padding:10px 16px;border-radius:12px;border:1px solid #cbd5e1;background:#f1f5f9;color:#0b1626;font:inherit;font-weight:600;cursor:pointer}
button.main{background:#0f766e;border-color:#0f766e;color:#fff}
button:active{filter:brightness(.92)}
.foot{margin:12px 0 0;font-size:14px;color:#475569}
@media (prefers-color-scheme:dark){.card{background:#151b23;color:#e6edf3}p{color:#c3ccd6}ul{color:#dbe3ea}.kicker{color:#5eead4}button{background:#232c38;border-color:#3a4654;color:#e6edf3}button.main{background:#14b8a6;border-color:#14b8a6;color:#04201c}.foot{color:#9fb0c0}}
</style><div class="veil"><div class="card" role="dialog" aria-modal="true" aria-labelledby="t"><p class="kicker">Giáo Sư Cùi Bắp</p><h2 id="t"></h2><p data-el="body"></p><ul data-el="notes"></ul><div class="row"><button class="main" data-pick="primary"></button><button data-pick="secondary"></button></div><p class="foot" data-el="foot"></p></div></div>`;
    const el = (sel) => shadow.querySelector(sel);
    el('h2').textContent = title;
    el('[data-el="body"]').textContent = body;
    el('[data-pick="primary"]').textContent = primary;
    el('[data-pick="secondary"]').textContent = secondary;
    el('[data-el="foot"]').textContent = foot;
    const list = el('[data-el="notes"]');
    for (const line of notes) { const li = doc.createElement('li'); li.textContent = String(line).slice(0, 200); list.appendChild(li); }
    if (!notes.length) list.remove();
    shadow.addEventListener('click', (event) => {
      const pick = event.target && event.target.closest ? event.target.closest('[data-pick]') : null;
      if (!pick) return;
      host.remove();
      resolve(pick.dataset.pick);
    });
    doc.documentElement.appendChild(host);
  });
}

/** Lần mở gần nhất của bản `build` có dở dang không (bắt đầu mà không báo xong). */
async function bootFailedBefore(db, build, now) {
  const tried = await idbGet(db, 'meta', REL.tried), ok = await idbGet(db, 'meta', REL.ok);
  if (!tried || tried.build !== build) return false;
  if (ok && ok.build === build && ok.at >= tried.at) return false;
  const age = now - tried.at;
  return age > 5000 && age < 14 * 24 * 3600 * 1000;       // dưới 5 giây: người dùng chạm hai lần liền; quá 14 ngày: chuyện cũ
}

/** Ghi "bản này đã mở xong" — bản được trao quyền đời cũ không tự ghi, nên bản mới nhất ghi hộ. */
async function markBootOk(build) {
  const db = await idbOpen();
  if (!db) return;
  try { await idbWrite(db, 'meta', { puts: [[REL.ok, { build, at: Date.now() }]] }); } catch { /* không ghi được cũng không sao */ } finally { try { db.close(); } catch { /* đã đóng */ } }
}

/**
 * Chạy trước boot(). Trả true khi đã trao quyền cho một bản khác (bản này KHÔNG khởi động),
 * false khi chính bản này được dùng.
 */
async function chooseRelease() {
  const hand = TOP.__GSCB_HANDOVER__;
  if (hand && hand.to === ME.build) return false;                  // mình là bản được trao quyền
  if (OPTS.noRelease) return false;
  const db = await idbOpen();
  if (!db) return false;
  try { return await decideRelease(db); }
  catch (error) { note('error', 'phát hành', error); return false; }
  finally { try { db.close(); } catch { /* đã đóng */ } }
}

async function decideRelease(db) {
  const now = Date.now();
  const src = TOP.__GSCB_SRC__ || (TOP.__GSCB_SRC__ = {});
  const myInfo = typeof src.text === 'string' ? bundleInfo(src.text) : null;
  const myText = myInfo && myInfo.build === ME.build ? src.text : null;       // chỉ có khi vừa tải về từ GitHub
  const auto = OPTS.release || {};
  const save = (state) => idbWrite(db, 'meta', { puts: [[REL.state, state]] });
  const put = (slot, text) => idbWrite(db, 'goi', { puts: [[slot, text]] });
  const textOf = async (slot, build) => { const text = await idbGet(db, 'goi', slot); const info = bundleInfo(text); return info && info.build === build ? text : null; };
  let state = await idbGet(db, 'meta', REL.state);
  if (!state || typeof state !== 'object') state = {};

  // Lần đầu có cơ chế này: bản từng chạy trước đó (ngăn `js`, kể cả bản 4.21.0) là "bản đang dùng".
  if (!state.dung) {
    const oldText = await idbGet(db, 'goi', REL.newest);
    const old = bundleInfo(oldText);
    if (old && old.build !== ME.build) { await put(REL.use, oldText); state.dung = { version: old.version, build: old.build, at: 0, co: true }; await save(state); }
  }
  // Bản vừa tải về luôn nằm ở ngăn `js`: dấu trang dùng khi mất mạng, và là nguồn của "Cập nhật".
  if (myText && (await idbGet(db, 'meta', REL.kept)) !== ME.build) { await put(REL.newest, myText); await idbWrite(db, 'meta', { puts: [[REL.kept, ME.build]] }); }
  src.text = null;
  const mine = async () => myText || (await textOf(REL.newest, ME.build)) || (await textOf(REL.use, ME.build));

  /** Trao quyền cho một bản đã cất. `why`: 'ghim' | 'hoan' | 'cuu'. Không chạy được bản đó thì bản này tự chạy. */
  const handOver = async (text, info, why) => {
    await idbWrite(db, 'meta', { puts: [[REL.tried, { build: info.build, at: now }]] });
    const placeholder = TOP.__GSCB_SAFARI__;
    TOP.__GSCB_HANDOVER__ = { from: ME.build, fromVersion: ME.version, to: info.build, why, at: now };
    TOP.__GSCB_SRC__ = { ref: `bản đang dùng ${info.version} (${info.build}), do bản ${ME.version} trao quyền`, cached: Boolean(src.cached), text: null };
    delete TOP.__GSCB_SAFARI__;                                   // bỏ chỗ giữ tạm để bản kia khởi động như thường
    let failure = '';
    try { runBundleText(text); if (!TOP.__GSCB_SAFARI__) failure = 'bản đó không khởi động'; } catch (error) { failure = String(error && error.message || error); }
    if (failure && !TOP.__GSCB_SAFARI__) {
      note('error', 'phát hành', `Không chạy được bản ${info.version} (${info.build}): ${failure}. Dùng bản ${ME.version}.`);
      TOP.__GSCB_HANDOVER__ = null; TOP.__GSCB_SRC__ = src; TOP.__GSCB_SAFARI__ = placeholder;
      return runMe();
    }
    void afterHandOver(info, why);
    return true;
  };
  /** Chính bản này được dùng. */
  const runMe = async () => {
    await idbWrite(db, 'meta', { puts: [[REL.tried, { build: ME.build, at: now }]] });
    return false;
  };
  /** Bản này thay bản đang dùng. */
  const promote = async (useText) => {
    const text = await mine();
    if (useText && state.dung) { await put(REL.prev, useText); state.truoc = { version: state.dung.version, build: state.dung.build }; }
    if (text) await put(REL.use, text);
    state.dung = { ...ME, at: now, co: Boolean(text) }; state.ghim = false; state.hoan = null; state.moi = null;
    await save(state);
    return runMe();
  };

  /* ---------------------------------------------- bản này CHÍNH LÀ bản đang dùng (hoặc lần đầu) */
  if (!state.dung || state.dung.build === ME.build) {
    const first = !state.dung;
    if (first) state.dung = { ...ME, at: now };
    // Cất chính bản này vào ngăn `dung` (một lần cho mỗi bản dựng) để sau này còn trao quyền lại được.
    let dirty = first || Boolean(state.ghim || state.hoan || state.moi);
    if (!state.dung.co) { const text = await mine(); if (text) { await put(REL.use, text); state.dung.co = true; dirty = true; } }
    state.ghim = false; state.hoan = null; state.moi = null;
    if (dirty) await save(state);
    // Lần mở trước của chính bản này dở dang, và còn bản trước để lui về: hỏi.
    const prevText = state.truoc && await bootFailedBefore(db, ME.build, now) ? await textOf(REL.prev, state.truoc.build) : null;
    if (prevText) {
      const pick = await releaseDialog({ title: 'Lần mở trước chưa xong', auto: auto.recover === 'rollback' ? 'secondary' : auto.recover === 'retry' ? 'primary' : undefined,
        body: `Bản ${ME.version} lần trước chưa mở xong trên máy này. Anh có thể thử lại, hoặc quay về bản trước ${state.truoc.version} đang cất sẵn trong máy.`,
        primary: 'Thử lại bản này', secondary: `Quay về bản ${state.truoc.version}`, foot: 'Dữ liệu của anh không bị ảnh hưởng dù chọn bên nào.' });
      if (pick === 'secondary') {
        const useText = await mine(), before = state.truoc;
        await put(REL.use, prevText); if (useText) await put(REL.prev, useText);
        state.truoc = { version: ME.version, build: ME.build }; state.dung = { ...before, at: now, co: true }; state.ghim = true;
        await save(state);
        return handOver(prevText, before, 'cuu');
      }
    }
    return runMe();
  }

  /* ---------------------------------------------------------- bản này KHÁC bản đang dùng */
  const inUse = state.dung;
  const useText = await textOf(REL.use, inUse.build);
  if (!useText) return promote(null);                             // không còn bản đang dùng để giữ: dùng bản này
  const deferred = Boolean(state.hoan && state.hoan.build === ME.build && now < state.hoan.until);
  const useFailed = await bootFailedBefore(db, inUse.build, now);
  let decision;
  if (useFailed) {
    const pick = await releaseDialog({ title: 'Lần mở trước chưa xong', auto: auto.recover === 'retry' ? 'secondary' : auto.recover ? 'primary' : undefined,
      body: `Bản đang dùng (${inUse.version}) lần trước chưa mở xong trên máy này. Bản ${ME.version} vừa tải về có thể đã sửa chuyện đó.`,
      notes: PACK.notes || [], primary: `Dùng bản ${ME.version}`, secondary: `Thử lại bản ${inUse.version}`, foot: 'Dữ liệu của anh không bị ảnh hưởng dù chọn bên nào.' });
    decision = pick === 'primary' ? 'update' : 'keep';
  } else if (state.ghim) decision = 'keep';
  else if (state.tuDong === true) decision = 'update';
  else if (deferred) decision = 'keep';
  else {
    const pick = await releaseDialog({ title: `Có bản mới ${ME.version}`, auto: auto.update === 'update' ? 'primary' : auto.update === 'keep' ? 'secondary' : undefined,
      body: `Anh đang dùng bản ${inUse.version}${inUse.version === ME.version ? ` (bản dựng ${inUse.build})` : ''}. Bản mới chỉ thay khi anh đồng ý.`,
      notes: PACK.notes || [], primary: 'Cập nhật ngay', secondary: 'Để sau',
      foot: 'Nếu bản mới trục trặc: Tuỳ chọn › Phiên bản › Quay về bản trước. Dữ liệu của anh giữ nguyên.' });
    decision = pick === 'primary' ? 'update' : 'later';
  }
  if (decision === 'update') return promote(useText);
  if (decision === 'later') state.hoan = { build: ME.build, until: now + REL.deferMs };
  state.moi = { ...ME, notes: PACK.notes || [] };
  await save(state);
  return handOver(useText, inUse, state.ghim ? 'ghim' : 'hoan');
}

/** Sau khi trao quyền: chờ bản kia mở xong thì ghi nhận, và nhắc người dùng còn bản mới. */
async function afterHandOver(info, why) {
  const deadline = Date.now() + 90_000;
  let hubOther = null;
  while (Date.now() < deadline) {
    await sleep(400);
    const app = TOP.__GSCB_SAFARI__;
    hubOther = app && app._hub && app._hub.ui && typeof app._hub.ui.hasPage === 'function' && app._hub.ui.hasPage() ? app._hub : null;
    if (hubOther) break;
  }
  if (!hubOther) return;
  void markBootOk(info.build);
  const toNewest = () => { void switchRelease('newest').then(() => reloadForRelease(hubOther.ui, `Đã chọn bản ${ME.version}`)); };
  try {
    if (why === 'hoan') hubOther.ui.toast({ id: 'ban-moi', title: `Có bản mới ${ME.version}`, message: (PACK.notes || []).join(' ') || 'Chạm Cập nhật khi anh sẵn sàng.', buttons: ['Cập nhật'], onButton: toNewest });
    else hubOther.ui.toast({ id: 'ban-ghim', title: `Đang dùng bản ${info.version}`, message: `Anh đã chọn quay về bản này. Bản ${ME.version} vẫn cất sẵn trong máy.`, buttons: [`Dùng bản ${ME.version}`], onButton: toNewest });
  } catch (error) { note('info', 'phát hành', `Không hiện được lời nhắc bản mới: ${error.message}`); }
}

/** Trang phải tải lại thì bản vừa chọn mới chạy (dấu trang quyết định lại từ đầu). */
function reloadForRelease(ui, title) {
  try { ui.toast({ id: 'tai-lai', title, message: 'Trang sẽ tự tải lại. Xong thì chạm lại dấu trang Cùi Bắp.', sticky: true }); } catch { /* giao diện đã gỡ */ }
  setTimeout(() => { try { TOP.location.reload(); } catch { /* trang đang đóng */ } }, OPTS.noReload ? 1e9 : 1800);
}

/**
 * Đổi bản đang dùng (gọi từ Tuỳ chọn › Phiên bản, hoặc từ lời nhắc sau khi trao quyền):
 *   'previous' — quay về bản trước và GHIM ở đó;   'newest' — dùng bản mới nhất đã tải về.
 * Chỉ đổi dữ liệu trong kho; bản mới chọn chạy từ lần chạm dấu trang kế tiếp.
 */
async function switchRelease(target) {
  const db = await idbOpen();
  if (!db) throw new Error('Không mở được kho dữ liệu của Safari.');
  try {
    const state = (await idbGet(db, 'meta', REL.state)) || {};
    const useText = state.dung ? await idbGet(db, 'goi', REL.use) : null;
    if (target === 'previous') {
      const prevText = await idbGet(db, 'goi', REL.prev), prev = bundleInfo(prevText);
      if (!prev || !state.dung) throw new Error('Máy này chưa cất bản trước nào.');
      await idbWrite(db, 'goi', { puts: [[REL.use, prevText], ...(typeof useText === 'string' ? [[REL.prev, useText]] : [])] });
      state.truoc = { version: state.dung.version, build: state.dung.build };
      state.dung = { version: prev.version, build: prev.build, at: Date.now(), co: true };
      state.ghim = true; state.hoan = null;
    } else {
      const newText = await idbGet(db, 'goi', REL.newest), newest = bundleInfo(newText);
      if (!newest) throw new Error('Máy này chưa có bản mới nào đã tải về.');
      if (state.dung && state.dung.build !== newest.build && typeof useText === 'string') { await idbWrite(db, 'goi', { puts: [[REL.prev, useText]] }); state.truoc = { version: state.dung.version, build: state.dung.build }; }
      await idbWrite(db, 'goi', { puts: [[REL.use, newText]] });
      state.dung = { version: newest.version, build: newest.build, at: Date.now(), co: true };
      state.ghim = false; state.hoan = null; state.moi = null;
    }
    await idbWrite(db, 'meta', { puts: [[REL.state, state]] });
    return state;
  } finally { try { db.close(); } catch { /* đã đóng */ } }
}

/** Tình trạng phát hành để hiện ở Tuỳ chọn và Chẩn đoán (đọc thẳng từ kho, luôn mới). */
async function readRelease() {
  const db = await idbOpen();
  if (!db) return { state: {}, hand: TOP.__GSCB_HANDOVER__ || null };
  try { return { state: (await idbGet(db, 'meta', REL.state)) || {}, hand: TOP.__GSCB_HANDOVER__ || null }; }
  finally { try { db.close(); } catch { /* đã đóng */ } }
}
async function setReleaseAsk(ask) {
  const db = await idbOpen();
  if (!db) return;
  try { const state = (await idbGet(db, 'meta', REL.state)) || {}; state.tuDong = !ask; await idbWrite(db, 'meta', { puts: [[REL.state, state]] }); }
  finally { try { db.close(); } catch { /* đã đóng */ } }
}
