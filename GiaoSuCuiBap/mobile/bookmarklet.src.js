/* ============================================================================
 *  Giáo Sư Cùi Bắp Mobile — bookmarklet cho iPhone / iPad (Safari)
 *
 *  VÌ SAO PHẢI LÀM KIỂU NÀY
 *  ------------------------
 *  Tiện ích Chrome (Manifest V3) KHÔNG chạy được trên iOS: Apple bắt mọi trình
 *  duyệt trên iPhone dùng WebKit, và Chrome/Firefox bản iOS không hỗ trợ tiện
 *  ích. Chỉ Safari hỗ trợ Safari Web Extension, mà muốn đóng gói thì phải có
 *  máy Mac + Xcode, và ngay cả khi có thì các API mà bản desktop đang dùng
 *  (chrome.downloads, chrome.notifications, chạy nền dài) đều không có trên iOS.
 *
 *  Bookmarklet thì chạy được ngay, không cần Mac, không cần App Store: nó là
 *  một dấu trang chứa mã JavaScript, bấm vào là chạy trên đúng trang e-GP đang
 *  mở. Nhờ chạy BÊN TRONG trang, nó dùng lại đúng cơ chế của bản desktop —
 *  để chính e-GP phát request kèm token hợp lệ, mình chỉ thay phần tiêu chí.
 *
 *  LÀM ĐƯỢC GÌ TRÊN ĐIỆN THOẠI
 *    • Tra nhà thầu trúng thầu theo mã số thuế  (chức năng 2 của bản desktop)
 *    • Tra kế hoạch lựa chọn nhà thầu theo chủ đầu tư (chức năng 4)
 *
 *  KHÔNG làm được trên điện thoại: quét định kỳ hằng ngày và soi hàng trăm
 *  biên bản mở thầu (chức năng 1 và 3) — hai việc đó cần chạy nền nhiều phút,
 *  Safari trên iOS sẽ ngắt. Cứ để máy tính làm, điện thoại dùng để tra nhanh.
 * ========================================================================== */
(function () {
  var W = window;
  if (W.__BID_RADAR_MOBILE__) { W.__BID_RADAR_MOBILE__.show(); return; }

  var SEARCH_EP = '/o/egp-portal-contractor-selection-v2/services/smart/search';
  var IDX = 'es-contractor-selection';
  var T_NOTIFY = 'es-notify-contractor';
  var T_PLAN = 'es-plan-project-p';
  var STEP_KQLCNT = 'notify-contractor-step-4-kqlcnt';
  var PAGE_SIZE = 50;
  var PAUSE = 900;

  var plan = null;      // {query} — có thì ghi đè tiêu chí của request
  var waiter = null;    // hàm chờ một trang kết quả
  var stopped = false;

  /* ---------------------------------------------------------------- utils */
  function clean(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function fold(v) {
    return clean(v).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  }
  function mst(v) {
    var d = clean(v).replace(/^vn/i, '').replace(/[^0-9]/g, '');
    return (d.length === 10 || d.length === 13) ? d.slice(0, 10) : '';
  }
  function money(v) {
    var n = Number(v);
    return isFinite(n) && v !== null && v !== '' ? Math.round(n).toLocaleString('vi-VN') + ' đ' : '—';
  }
  function dmy(v) {
    if (!v) return '—';
    var d = new Date(v);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('vi-VN');
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function first(v) { return Array.isArray(v) ? (v.length ? v[0] : null) : v; }
  function list(v) { return Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]); }

  /* --------------------------------------------------- chặn request tìm kiếm */
  var XO = XMLHttpRequest.prototype.open;
  var XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    var self = this;
    try {
      if (plan && b && String(this.__u || '').indexOf(SEARCH_EP) !== -1) {
        var p = JSON.parse(b);
        if (Array.isArray(p) && p[0]) {
          p[0].pageSize = String(PAGE_SIZE);
          p[0].query = [plan.query];        // giữ nguyên pageNumber của trang
          b = JSON.stringify(p);
        }
        this.addEventListener('load', function () {
          var j = null;
          try { j = JSON.parse(self.responseText); } catch (e) {}
          if (waiter) waiter({ ok: self.status >= 200 && self.status < 300, status: self.status, data: j });
        }, { once: true });
      }
    } catch (e) {}
    return XS.call(this, b);
  };

  /* ------------------------------------------------ điều khiển trang kết quả */
  function pageSizeSelect() {
    var all = [].slice.call(document.querySelectorAll('select'));
    for (var i = 0; i < all.length; i++) {
      var vals = [].slice.call(all[i].options).map(function (o) { return o.value; });
      if (vals.indexOf('50') !== -1 && vals.indexOf('10') !== -1) return all[i];
    }
    return null;
  }
  function onResultsPage() { return !!(pageSizeSelect() && document.querySelector('.el-pagination')); }

  function await1(ms) {
    return new Promise(function (res) {
      var t = setTimeout(function () { waiter = null; res(null); }, ms || 25000);
      waiter = function (p) { clearTimeout(t); waiter = null; res(p); };
    });
  }
  /* Bắt e-GP phát lại truy vấn trang đầu bằng chính ô "số bản ghi/trang". */
  function firstPage() {
    var s = pageSizeSelect();
    if (!s) return Promise.resolve(null);
    var w = await1();
    s.value = s.value === '50' ? '20' : '50';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return w;
  }
  function nextPage() {
    var b = document.querySelector('.el-pagination .btn-next');
    if (!b || b.disabled) return Promise.resolve(null);
    var w = await1();
    b.click();
    return w;
  }

  /** Lấy hết các trang của một truy vấn. */
  async function harvest(query, onProgress) {
    plan = { query: query };
    stopped = false;
    var rows = [], total = 0, pages = 0, tp = 1;
    var page = await firstPage();
    while (page && page.ok && !stopped) {
      var env = page.data && page.data.page;
      var content = env && env.content ? env.content : [];
      tp = Number(env && env.totalPages) || tp;
      total = Number(env && env.totalElements) || total;
      rows = rows.concat(content);
      pages++;
      if (onProgress) onProgress(rows.length, total, pages, tp);
      if (pages >= tp || !content.length) break;
      await new Promise(function (r) { setTimeout(r, PAUSE); });
      if (stopped) break;
      page = await nextPage();
    }
    plan = null;
    if (!page) return { rows: rows, total: total, failed: pages === 0 };
    return { rows: rows, total: total, stopped: stopped };
  }

  /* ------------------------------------------------------------ truy vấn */
  function queryWinner(taxCode) {
    return {
      index: IDX,
      filters: [
        { fieldName: 'type', searchType: 'in', fieldValues: [T_NOTIFY] },
        { fieldName: 'stepCode', searchType: 'in', fieldValues: [STEP_KQLCNT] },
        { fieldName: 'winningCode', searchType: 'in', fieldValues: ['vn' + taxCode] }
      ]
    };
  }
  function queryPlan(investor) {
    return {
      index: IDX,
      keyWord: investor,
      matchType: 'all-0',
      matchFields: ['investorName', 'investorCode', 'procuringEntityName', 'procuringEntityCode'],
      filters: [{ fieldName: 'type', searchType: 'in', fieldValues: [T_PLAN] }]
    };
  }

  /* --------------------------------------------------------- đọc bản ghi */
  function readWinner(r, focus) {
    var codes = list(r.winningCode).map(mst).filter(Boolean);
    var members = list(r.winningContractorName).map(clean).filter(Boolean);
    var venture = !!clean(r.ventureName) || members.length > 1;
    var basis = Number(first(r.bidPrice));
    var win = Number(first(r.bidWinningPrice));
    var rate = (isFinite(basis) && isFinite(win) && basis > 0)
      ? Math.round(((basis - win) / basis) * 10000) / 100 : null;
    return {
      code: clean(r.notifyNo) + '-' + (clean(r.notifyVersion) || '00'),
      name: clean(first(r.bidName)),
      investor: clean(r.investorName),
      basis: isFinite(basis) ? basis : null,
      win: isFinite(win) ? win : null,
      rate: rate,
      venture: venture,
      members: members,
      date: r.decisionDate || r.publicDateKqlcnt,
      mine: codes.indexOf(focus) !== -1
    };
  }
  function readPlan(r) {
    var names = list(r.bidNamePlanNew).map(function (x) { return clean(x && x.name); }).filter(Boolean);
    if (!names.length) names = list(r.bidName).map(clean).filter(Boolean);
    var prices = list(r.bidPrice);
    var locs = list(r.locations);
    return {
      code: clean(r.planNoStand) || clean(r.planNo),
      name: clean(r.name),
      project: clean(r.pname),
      investor: clean(r.investorName),
      investorCode: clean(r.investorCode),
      wards: locs.map(function (l) { return clean(l && l.districtName); }).filter(Boolean),
      location: locs.map(function (l) {
        return [clean(l && l.districtName), clean(l && l.provName)].filter(Boolean).join(' - ');
      }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).join('; '),
      packages: names.map(function (n, i) { return { name: n, price: Number(prices[i]) }; }),
      total: names.reduce(function (s, n, i) { return s + (Number(prices[i]) || 0); }, 0),
      unannounced: Number(r.haveBidNotNotify) === 1,
      date: r.decisionDate || r.publicDate
    };
  }

  /* ------------------------------------------------------------------ UI */
  var css = '#brm{position:fixed;inset:0;z-index:2147483647;background:#f1f5f9;font:14px/1.45 -apple-system,system-ui,sans-serif;color:#0f172a;display:flex;flex-direction:column;overscroll-behavior:contain}'
    + '#brm *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}'
    + '#brm header{background:#0f172a;color:#fff;padding:14px 14px calc(10px + env(safe-area-inset-top,0));padding-top:calc(14px + env(safe-area-inset-top,0));display:flex;align-items:center;gap:10px}'
    + '#brm header b{font-size:16px;flex:1}'
    + '#brm .x{background:#334155;color:#fff;border:0;border-radius:9px;padding:8px 13px;font-size:15px;font-weight:800}'
    + '#brm .tabs{display:flex;gap:6px;padding:10px 12px 0}'
    + '#brm .tab{flex:1;padding:11px 8px;border-radius:10px 10px 0 0;background:#e2e8f0;font-weight:800;font-size:13px;text-align:center;border:0}'
    + '#brm .tab.on{background:#fff;color:#0f766e}'
    + '#brm .body{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:12px;padding-bottom:calc(24px + env(safe-area-inset-bottom,0))}'
    + '#brm .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:13px;margin-bottom:11px}'
    + '#brm label{display:block;font-weight:750;font-size:13px;margin:9px 0 5px}'
    + '#brm input{width:100%;padding:13px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:16px;background:#fff;color:#0f172a}'
    + '#brm .go{width:100%;padding:15px;border:0;border-radius:11px;background:#0f766e;color:#fff;font-weight:800;font-size:16px;margin-top:12px}'
    + '#brm .go[disabled]{opacity:.55}'
    + '#brm .stop{background:#c2410c}'
    + '#brm .muted{color:#64748b;font-size:12px;line-height:1.55}'
    + '#brm .m{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:11px}'
    + '#brm .m div{background:#fff;border:1px solid #e2e8f0;border-radius:11px;padding:11px}'
    + '#brm .m b{display:block;font-size:19px;font-variant-numeric:tabular-nums}'
    + '#brm .it{background:#fff;border:1px solid #e2e8f0;border-radius:11px;padding:12px;margin-bottom:9px}'
    + '#brm .it h4{margin:0 0 5px;font-size:14px;line-height:1.35}'
    + '#brm .it .r{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;margin-top:3px}'
    + '#brm .mine{border-color:#0f766e;background:#f0fdfa}'
    + '#brm .pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;background:#e2e8f0}'
    + '#brm .win{background:#dcfce7;color:#166534}#brm .ven{background:#fef3c7;color:#92400e}'
    + '#brm .err{border-color:#fecaca;background:#fef2f2}'
    + '#brm a{color:#0f766e;font-weight:700}';

  var el = document.createElement('div');
  el.id = 'brm';
  el.innerHTML =
    '<header><b>📡 Giáo Sư Cùi Bắp</b><button class="x" id="brmX">Đóng</button></header>'
    + '<div class="tabs"><button class="tab on" data-t="w">🏆 Trúng thầu</button>'
    + '<button class="tab" data-t="p">📋 Kế hoạch</button></div>'
    + '<div class="body">'
    + '<div class="card" id="brmFw">'
    + '<label>Mã số thuế nhà thầu</label><input id="brmMst" inputmode="numeric" placeholder="VD: 5400512273">'
    + '<button class="go" id="brmGoW">Tra cứu trên e-GP</button>'
    + '<div class="muted" style="margin-top:9px">Lọc theo mã số thuế nên lấy được cả gói trúng theo <b>liên danh</b> — tra theo tên sẽ bỏ sót.</div></div>'
    + '<div class="card" id="brmFp" style="display:none">'
    + '<label>Chủ đầu tư (tên hoặc mã định danh)</label><input id="brmInv" placeholder="VD: Ban Quản lý dự án khu vực Hàm Tân">'
    + '<label>Lọc thêm theo Xã/Phường (tuỳ chọn)</label><input id="brmWard" placeholder="VD: Xã Hàm Thuận">'
    + '<button class="go" id="brmGoP">Tra cứu trên e-GP</button>'
    + '<div class="muted" style="margin-top:9px">Bắt buộc nhập chủ đầu tư. Ô Xã/Phường lọc <b>trên kết quả đã tải về</b>, không phải lọc từ máy chủ.</div></div>'
    + '<div id="brmOut"></div></div>';

  var style = document.createElement('style');
  style.textContent = css;

  function $(id) { return document.getElementById(id); }
  var out;

  function show() { el.style.display = 'flex'; document.documentElement.style.overflow = 'hidden'; }
  function hide() { el.style.display = 'none'; document.documentElement.style.overflow = ''; }

  function note(html, bad) {
    out.innerHTML = '<div class="card' + (bad ? ' err' : '') + '">' + html + '</div>';
  }
  function guard() {
    if (onResultsPage()) return true;
    note('<b>Chưa ở trang kết quả.</b><div class="muted" style="margin-top:6px">'
      + 'Hãy đóng bảng này, bấm <b>Tìm kiếm</b> trên e-GP một lần để hiện danh sách kết quả, '
      + 'rồi mở lại Giáo Sư Cùi Bắp. Bảng tra cứu cần trang kết quả để hoạt động.</div>', true);
    return false;
  }
  function running(btn, on, label) {
    btn.disabled = on;
    btn.textContent = on ? '⏳ ' + (label || 'Đang tra…') : 'Tra cứu trên e-GP';
    btn.classList.toggle('stop', false);
  }

  /* --------------------------------------------------------- tra trúng thầu */
  async function runWinner() {
    var code = mst($('brmMst').value);
    if (!code) { note('Mã số thuế phải là <b>10 chữ số</b>. Kiểm tra lại giúp mình.', true); return; }
    if (!guard()) return;
    var btn = $('brmGoW');
    running(btn, true);
    note('<b>Đang hỏi e-GP…</b>');
    var res = await harvest(queryWinner(code), function (n, t) {
      note('<b>Đang tải…</b> ' + n + (t ? '/' + t : '') + ' gói');
    });
    running(btn, false);
    if (res.failed) { note('e-GP chưa trả dữ liệu. Thử lại sau ít phút.', true); return; }
    var items = res.rows.map(function (r) { return readWinner(r, code); });
    if (!items.length) { note('e-GP không ghi nhận gói nào mà MST <b>' + esc(code) + '</b> trúng thầu.', true); return; }

    var totalWin = items.reduce(function (s, x) { return s + (x.win || 0); }, 0);
    var basisSum = items.reduce(function (s, x) { return s + (x.rate === null ? 0 : x.basis); }, 0);
    var winSum = items.reduce(function (s, x) { return s + (x.rate === null ? 0 : x.win); }, 0);
    var overall = basisSum > 0 ? Math.round(((basisSum - winSum) / basisSum) * 10000) / 100 : null;
    var solo = items.filter(function (x) { return !x.venture; }).length;

    out.innerHTML =
      '<div class="m"><div><span class="muted">Số gói trúng</span><b>' + items.length + '</b>'
      + '<span class="muted">' + solo + ' độc lập · ' + (items.length - solo) + ' liên danh</span></div>'
      + '<div><span class="muted">Tổng giá trúng</span><b style="font-size:15px;color:#166534">' + money(totalWin) + '</b>'
      + '<span class="muted">giảm bình quân ' + (overall === null ? '—' : overall.toFixed(2).replace('.', ',') + '%') + '</span></div></div>'
      + items.map(function (x) {
        return '<div class="it' + (x.mine ? ' mine' : '') + '"><h4>' + esc(x.name) + '</h4>'
          + '<div class="muted">' + esc(x.code) + ' · ' + esc(x.investor) + '</div>'
          + '<div class="r"><span class="muted">Giá gói/dự toán</span><span>' + money(x.basis) + '</span></div>'
          + '<div class="r"><span class="muted">Giá trúng thầu</span><span style="font-weight:800;color:#166534">' + money(x.win) + '</span></div>'
          + '<div class="r"><span class="muted">Giảm giá</span><span>' + (x.rate === null ? '—' : x.rate.toFixed(2).replace('.', ',') + '%') + '</span></div>'
          + '<div style="margin-top:7px"><span class="pill ' + (x.venture ? 'ven' : 'win') + '">'
          + (x.venture ? 'Liên danh' : 'Độc lập') + '</span> <span class="muted">' + dmy(x.date) + '</span></div>'
          + (x.venture && x.members.length ? '<div class="muted" style="margin-top:5px">' + esc(x.members.join(' · ')) + '</div>' : '')
          + '</div>';
      }).join('')
      + (res.stopped ? '<div class="card err">Đã dừng giữa chừng, danh sách chưa đủ.</div>' : '');
  }

  /* ------------------------------------------------------- tra kế hoạch LCNT */
  async function runPlan() {
    var inv = clean($('brmInv').value);
    if (!inv) { note('Hãy nhập tên hoặc mã chủ đầu tư.', true); return; }
    if (!guard()) return;
    var ward = fold($('brmWard').value);
    var btn = $('brmGoP');
    running(btn, true);
    note('<b>Đang hỏi e-GP…</b>');
    var res = await harvest(queryPlan(inv), function (n, t) {
      note('<b>Đang tải…</b> ' + n + (t ? '/' + t : '') + ' kế hoạch');
    });
    running(btn, false);
    if (res.failed) { note('e-GP chưa trả dữ liệu. Thử lại sau ít phút.', true); return; }

    var items = res.rows.map(readPlan);
    var all = items.length;
    if (ward) items = items.filter(function (p) {
      return p.wards.some(function (w) { return fold(w).indexOf(ward) !== -1; });
    });
    if (!items.length) {
      note('Không có kế hoạch nào khớp' + (ward ? ' xã/phường bạn nhập (đã xem ' + all + ' kế hoạch của chủ đầu tư này)' : '') + '.', true);
      return;
    }
    var pkgs = items.reduce(function (s, p) { return s + p.packages.length; }, 0);
    var val = items.reduce(function (s, p) { return s + p.total; }, 0);

    out.innerHTML =
      '<div class="m"><div><span class="muted">Kế hoạch</span><b>' + items.length + '</b>'
      + '<span class="muted">' + (ward ? 'lọc từ ' + all + ' KH' : 'e-GP báo ' + res.total) + '</span></div>'
      + '<div><span class="muted">Tổng số gói</span><b>' + pkgs + '</b>'
      + '<span class="muted">' + money(val) + '</span></div></div>'
      + items.map(function (p) {
        return '<div class="it"><h4>' + esc(p.name) + '</h4>'
          + '<div class="muted">' + esc(p.code) + (p.unannounced ? ' · <span class="pill win">Còn gói chưa mời thầu</span>' : '') + '</div>'
          + '<div class="muted" style="margin-top:4px">🏛 ' + esc(p.investor) + '</div>'
          + '<div class="muted">📍 ' + esc(p.location || '—') + '</div>'
          + '<div class="muted">' + p.packages.length + ' gói · ' + money(p.total) + ' · duyệt ' + dmy(p.date) + '</div>'
          + p.packages.map(function (g) {
            return '<div class="r" style="border-top:1px solid #f1f5f9;padding-top:5px;margin-top:5px">'
              + '<span>' + esc(g.name) + '</span><span class="muted" style="white-space:nowrap">' + money(g.price) + '</span></div>';
          }).join('')
          + '</div>';
      }).join('')
      + (res.stopped ? '<div class="card err">Đã dừng giữa chừng, danh sách chưa đủ.</div>' : '');
  }

  /* --------------------------------------------------------------- gắn vào */
  document.documentElement.appendChild(style);
  document.documentElement.appendChild(el);
  out = $('brmOut');

  $('brmX').addEventListener('click', function () { stopped = true; hide(); });
  $('brmGoW').addEventListener('click', runWinner);
  $('brmGoP').addEventListener('click', runPlan);
  [].slice.call(el.querySelectorAll('.tab')).forEach(function (t) {
    t.addEventListener('click', function () {
      [].slice.call(el.querySelectorAll('.tab')).forEach(function (x) { x.classList.remove('on'); });
      t.classList.add('on');
      var w = t.getAttribute('data-t') === 'w';
      $('brmFw').style.display = w ? '' : 'none';
      $('brmFp').style.display = w ? 'none' : '';
      out.innerHTML = '';
    });
  });

  if (!onResultsPage()) guard();
  W.__BID_RADAR_MOBILE__ = { show: show, hide: hide };
})();
