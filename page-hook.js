/*
 * Giáo Sư Cùi Bắp — page-hook.js  (chạy trong MAIN world của trang e-GP)
 *
 * 1) Quan sát mọi phản hồi JSON mà giao diện e-GP tải (fetch + XHR) và đẩy về
 *    content script khi thấy dữ liệu có mã TBMT.
 * 2) Phát lại (replay) đúng NGUYÊN TRẠNG yêu cầu tìm kiếm đã lưu — không sửa
 *    pageSize/limit — để tránh HTTP 400 (bản 1.0.0 tự tăng pageSize gây lỗi).
 * 3) Phân trang THẬT: chỉ tăng CHỈ SỐ TRANG (page/offset), giữ nguyên kích
 *    thước trang, nhằm trích xuất TẤT CẢ gói thầu thay vì chỉ trang đầu.
 * 4) TRA CỨU KQLCNT: tinh chỉnh tiêu chí tìm kiếm ngay trên request mà CHÍNH
 *    TRANG e-GP phát ra khi người dùng bấm "Tìm kiếm", để máy chủ lọc sẵn theo
 *    mã số thuế nhà thầu trúng thầu (xem khối "TRA CỨU KQLCNT" ở cuối tệp).
 */
(() => {
  if (window.__BID_RADAR_ONE_HOOK__) return;
  window.__BID_RADAR_ONE_HOOK__ = true;

  const SOURCE = 'BID_RADAR_ONE_PAGE';
  const CONTENT_SOURCE = 'BID_RADAR_ONE_CONTENT';

  /* --- TRA CỨU NHÀ THẦU (KQLCNT / Biên bản mở thầu) ---------------------- */
  const SEARCH_ENDPOINT = '/o/egp-portal-contractor-selection-v2/services/smart/search';
  const LOT_OPEN_DETAIL_ENDPOINT = '/services/expose/ldtkqmt/bid-notification-p/lotOpenDetail';

  /* Hai endpoint mà trang chi tiết tự gọi, có kèm danh sách tệp đính kèm:
   *   lcnt_tbmt_hsmt                     -> hồ sơ mời thầu (E-HSMT)
   *   expose/contractor-input-result/get -> quyết định phê duyệt + báo cáo đánh giá
   * Chỉ ĐỌC phản hồi, không can thiệp — đúng nguyên tắc thu thụ động. */
  const ATTACHMENT_ENDPOINTS = ['/services/lcnt_tbmt_hsmt', '/services/expose/contractor-input-result/get'];
  const isAttachmentUrl = (u) => ATTACHMENT_ENDPOINTS.some((e) => String(u || '').indexOf(e) !== -1);

  // Kế hoạch tra cứu đang chạy; null = không can thiệp bất kỳ request nào.
  // Khối truy vấn do background.js dựng sẵn (lib/kqlcnt.js hoặc lib/bbmt.js)
  // rồi truyền xuống, nên tệp này không phải lặp lại logic lọc của bất kỳ ai.
  let kqlcntPlan = null;

  const RELEVANT = new Set(['notifyNo', 'notify_no', 'tbmtNo', 'bidNo', 'bidName', 'notifyName', 'packageName', 'publicDate', 'publishDate', 'investorName', 'procuringEntityName', 'bidPrice', 'packagePrice', 'bidPackagePrice', 'notifyVersion', 'notifyVersionNo', 'investField', 'investFieldName', 'fieldName', 'closeDate', 'bidCloseDate', 'projectName', 'provinceName', 'executionLocation']);
  const IDENTITY = ['notifyNo', 'bidName', 'notifyName', 'bidNo'];

  // Tên trường phân trang thường gặp trên e-GP và các framework phổ biến.
  const PAGE_KEYS = ['pageNumber', 'pageNo', 'pageIndex', 'pageNum', 'currentPage', 'current', 'page'];
  const OFFSET_KEYS = ['offset', 'from', 'start', 'startIndex', 'skip', 'firstResult'];
  const SIZE_KEYS = ['pageSize', 'size', 'limit', 'rowsPerPage', 'numberOfRows', 'perPage', 'length'];
  const TOTAL_PAGE_KEYS = ['totalPages', 'totalPage', 'pageTotal', 'totalPageCount'];
  const TOTAL_COUNT_KEYS = ['total', 'totalRow', 'totalRows', 'totalRecord', 'totalRecords', 'totalCount', 'totalElements', 'recordsTotal', 'totalItems'];

  const post = (type, payload) => window.postMessage({ source: SOURCE, type, payload }, '*');

  /* ------------------------------------------------------------------------
   *  BẢN ĐỒ ENDPOINT — ghi e-GP GỌI CÁI GÌ, không ghi NỘI DUNG gì
   *
   *  Vì sao cần: nhiều lần sửa vừa rồi là đoán mò xem e-GP để dữ liệu ở đâu,
   *  và đoán sai liên tục. Thay vì đoán tiếp, ghi lại đường dẫn + tên trường
   *  cấp một + số bản ghi của mọi phản hồi JSON. Người dùng thao tác bình
   *  thường trên e-GP, phần mềm học được trang nào gọi endpoint nào.
   *
   *  CHỈ ghi HÌNH DẠNG: đường dẫn, phương thức, mã HTTP, tên trường, số lượng.
   *  KHÔNG ghi giá trị, không ghi tên công ty, không ghi mã số thuế. Thu thụ
   *  động đúng nghĩa — không hề đụng vào request nào của e-GP.
   * --------------------------------------------------------------------- */
  const seenEndpoints = new Set();

  function shapeOf(data, depth) {
    if (Array.isArray(data)) {
      return { kieu: 'mang', soBanGhi: data.length,
        truong: data.length && depth < 2 ? shapeOf(data[0], depth + 1).truong : [] };
    }
    if (data && typeof data === 'object') {
      const keys = Object.keys(data).slice(0, 40);
      return { kieu: 'doi-tuong', soBanGhi: null, truong: keys };
    }
    return { kieu: typeof data, soBanGhi: null, truong: [] };
  }

  function recordEndpoint(url, method, status, data) {
    try {
      let path = String(url || '');
      const i = path.indexOf('://');
      if (i !== -1) path = path.slice(path.indexOf('/', i + 3));
      path = path.split('?')[0];
      if (!path) return;
      const key = (method || 'GET') + ' ' + path;
      if (seenEndpoints.has(key)) return;
      seenEndpoints.add(key);
      const sh = shapeOf(data, 0);
      post('EGP_ENDPOINT_SEEN', {
        path, method: method || 'GET', status: status || 0,
        kieu: sh.kieu, soBanGhi: sh.soBanGhi, truong: sh.truong,
        trang: location.pathname, luc: new Date().toISOString()
      });
    } catch {}
  }
  const safeParse = (text) => { try { return JSON.parse(text); } catch { return null; } };

  function hasRelevant(value) {
    const seen = new WeakSet();
    let count = 0;
    let found = false;
    (function walk(v, depth) {
      if (found || depth > 10 || count > 12000 || v == null) return;
      count++;
      if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
      if (typeof v !== 'object') return;
      if (seen.has(v)) return;
      seen.add(v);
      const keys = Object.keys(v);
      if (keys.some((k) => RELEVANT.has(k)) && keys.some((k) => IDENTITY.includes(k))) { found = true; return; }
      for (const x of Object.values(v)) walk(x, depth + 1);
    })(value, 0);
    return found;
  }

  // Đếm số bản ghi gói thầu trong một phản hồi — để biết trang còn dữ liệu không.
  function countCandidates(value) {
    const seen = new WeakSet();
    let n = 0;
    let nodes = 0;
    (function walk(v, depth) {
      if (depth > 12 || nodes > 20000 || v == null) return;
      nodes++;
      if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
      if (typeof v !== 'object') return;
      if (seen.has(v)) return;
      seen.add(v);
      const keys = Object.keys(v);
      if (keys.some((k) => RELEVANT.has(k)) && keys.some((k) => IDENTITY.includes(k))) n++;
      for (const x of Object.values(v)) walk(x, depth + 1);
    })(value, 0);
    return n;
  }

  // Đọc tổng số trang / tổng số bản ghi (nếu API trả về) để dừng đúng lúc.
  function readTotals(value) {
    let totalPages = null;
    let totalCount = null;
    const seen = new WeakSet();
    (function walk(v, depth) {
      if (depth > 8 || v == null || typeof v !== 'object' || seen.has(v)) return;
      seen.add(v);
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === 'number') {
          if (totalPages == null && TOTAL_PAGE_KEYS.includes(k)) totalPages = val;
          if (totalCount == null && TOTAL_COUNT_KEYS.includes(k)) totalCount = val;
        } else walk(val, depth + 1);
      }
    })(value, 0);
    return { totalPages, totalCount };
  }

  function headersToObject(headers) {
    const out = {};
    try { for (const [k, v] of new Headers(headers || {}).entries()) out[k] = v; } catch {}
    return out;
  }

  function cookieValue(name) {
    const hit = document.cookie.split(';').map((x) => x.trim()).find((x) => x.startsWith(`${name}=`));
    return hit ? decodeURIComponent(hit.slice(name.length + 1)) : '';
  }

  function withLiveSecurityHeaders(headers) {
    const out = { ...(headers || {}) };
    const hasCsrf = Object.keys(out).some((k) => /^x-(xsrf|csrf)-token$/i.test(k));
    const token = cookieValue('XSRF-TOKEN') || cookieValue('CSRF-TOKEN') || cookieValue('csrfToken') || cookieValue('_csrf');
    if (token && !hasCsrf) out['x-xsrf-token'] = token;
    return out;
  }

  async function serializeFetchRequest(input, init = {}) {
    const isReq = typeof Request !== 'undefined' && input instanceof Request;
    const url = isReq ? input.url : String(input);
    const method = String(init.method || (isReq ? input.method : 'GET')).toUpperCase();
    const headers = { ...headersToObject(isReq ? input.headers : {}), ...headersToObject(init.headers || {}) };
    let body = init.body ?? '';
    if (!body && isReq && !['GET', 'HEAD'].includes(method)) {
      try { body = await input.clone().text(); } catch {}
    }
    if (body instanceof URLSearchParams) body = body.toString();
    if (typeof body !== 'string' && body) {
      try { body = JSON.stringify(body); } catch { body = ''; }
    }
    return { url, method, headers, body: String(body || '') };
  }

  async function inspectResponse(response, request) {
    try {
      const clone = response.clone();
      const ctype = clone.headers.get('content-type') || '';
      let data = null;
      if (/json/i.test(ctype)) data = await clone.json();
      else {
        const text = await clone.text();
        if (/^\s*[\[{]/.test(text)) data = safeParse(text);
      }
      if (data && hasRelevant(data)) {
        post('NETWORK_CAPTURE', { request, data, responseUrl: response.url, status: response.status, capturedAt: new Date().toISOString() });
      }
    } catch {}
  }

  // ------- Chặn fetch để quan sát (không can thiệp request gốc) -------
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    let request;
    try { request = await serializeFetchRequest(input, init); } catch { request = { url: String(input), method: 'GET', headers: {}, body: '' }; }
    const response = await originalFetch(input, init);
    inspectResponse(response, request);
    return response;
  };

  // ------- Chặn XHR để quan sát -------
  const XHROpen = XMLHttpRequest.prototype.open;
  const XHRSend = XMLHttpRequest.prototype.send;
  const XHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__br = { method: String(method || 'GET').toUpperCase(), url: String(url), headers: {}, body: '' };
    return XHROpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this.__br) this.__br.headers[name] = value;
    return XHRSetHeader.call(this, name, value);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (this.__br) {
      try { this.__br.body = typeof body === 'string' ? body : body ? JSON.stringify(body) : ''; } catch { this.__br.body = ''; }

      // Đánh dấu mọi request tìm kiếm thuộc lượt tra cứu đang chạy, để phản hồi
      // được chuyển về đúng nơi. Việc THAY tiêu chí là tuỳ chọn: khi kế hoạch
      // không kèm `query` (tính năng KHLCNT), giữ nguyên truy vấn của e-GP.
      if (kqlcntPlan && String(this.__br.url || '').indexOf(SEARCH_ENDPOINT) !== -1) {
        this.__brKqlcnt = kqlcntPlan.id;
        const refined = refineKqlcntBody(this.__br.url, this.__br.body);
        if (refined !== null) {
          body = refined;
          this.__br.body = refined;
        }
      }

      this.addEventListener('load', () => {
        try {
          const data = this.responseType === 'json' ? this.response : safeParse(this.responseText || '');
          if (this.__brKqlcnt) {
            post('KQLCNT_PAGE', {
              planId: this.__brKqlcnt,
              ok: this.status >= 200 && this.status < 300,
              status: this.status,
              data
            });
          }
          // Bảng nhà thầu tham dự của một Biên bản mở thầu. Luôn chuyển tiếp,
          // kể cả khi người dùng tự mở trang — dữ liệu này chỉ có ở đây.
          if (String(this.__br.url || '').indexOf(LOT_OPEN_DETAIL_ENDPOINT) !== -1 && Array.isArray(data)) {
            post('BBMT_BIDDERS', { url: location.href, rows: data, status: this.status });
          }
          // Danh sách tệp đính kèm của gói đang xem. Chuyển nguyên phản hồi về
          // cho tầng nền bóc tách (lib/attachments.js) — tệp này không tự đoán
          // tên trường của e-GP.
          if (isAttachmentUrl(this.__br.url) && data) {
            post('EGP_ATTACHMENTS', { url: location.href, payload: data });
          }
          // Dữ liệu của một lượt tra cứu KQLCNT đi theo luồng riêng, không đổ
          // vào kho gói thầu để hai tính năng không lẫn dữ liệu của nhau.
          recordEndpoint(this.__br.url, this.__br.method, this.status, data);
          if (!this.__brKqlcnt && data && hasRelevant(data)) {
            post('NETWORK_CAPTURE', { request: this.__br, data, responseUrl: this.responseURL, status: this.status, capturedAt: new Date().toISOString() });
          }
        } catch {}
      }, { once: true });
    }
    return XHRSend.call(this, body);
  };

  // ====================================================================
  //  PHÂN TRANG: dựng request cho trang thứ `ordinal` (0 = trang đã lưu).
  //  Chỉ dịch chuyển chỉ số trang, KHÔNG BAO GIỜ đổi pageSize.
  // ====================================================================
  function locatePaging(obj) {
    let page = null;
    let offset = null;
    let size = null;
    const seen = new WeakSet();
    (function walk(v, depth) {
      if (!v || typeof v !== 'object' || depth > 8 || seen.has(v)) return;
      seen.add(v);
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === 'number') {
          if (!page && PAGE_KEYS.includes(k)) page = { parent: v, key: k, value: val };
          if (!offset && OFFSET_KEYS.includes(k)) offset = { parent: v, key: k, value: val };
          if (!size && SIZE_KEYS.includes(k)) size = { parent: v, key: k, value: val };
        } else walk(val, depth + 1);
      }
    })(obj, 0);
    return { page, offset, size };
  }

  // Trả về {url, body} cho trang thứ ordinal; null nếu không thể phân trang.
  function buildRequestForPage(request, ordinal) {
    const method = (request.method || 'GET').toUpperCase();
    const isBodyMethod = !['GET', 'HEAD'].includes(method);
    const baseBody = String(request.body || '');

    if (isBodyMethod && baseBody) {
      if (ordinal === 0) return { url: request.url, body: baseBody };
      const parsed = safeParse(baseBody);
      if (!parsed) return null;
      const p = locatePaging(parsed);
      if (p.page) {
        p.page.parent[p.page.key] = p.page.value + ordinal;
      } else if (p.offset && p.size) {
        p.offset.parent[p.offset.key] = p.offset.value + ordinal * p.size.value;
      } else if (p.offset) {
        p.offset.parent[p.offset.key] = p.offset.value + ordinal;
      } else {
        return null;
      }
      return { url: request.url, body: JSON.stringify(parsed) };
    }

    // Phương thức GET: phân trang qua query string.
    let u;
    try { u = new URL(request.url); } catch { return { url: request.url, body: '' }; }
    if (ordinal === 0) return { url: u.href, body: '' };
    const params = u.searchParams;
    const pageKey = PAGE_KEYS.find((k) => params.has(k));
    const offKey = OFFSET_KEYS.find((k) => params.has(k));
    const sizeKey = SIZE_KEYS.find((k) => params.has(k));
    if (pageKey) {
      params.set(pageKey, String(Number(params.get(pageKey) || 0) + ordinal));
    } else if (offKey) {
      const sz = sizeKey ? Number(params.get(sizeKey)) || 10 : 10;
      params.set(offKey, String(Number(params.get(offKey) || 0) + ordinal * sz));
    } else {
      return null;
    }
    return { url: u.href, body: '' };
  }

  async function replaySearch(request, maxPages, runId) {
    const method = (request.method || 'GET').toUpperCase();
    const isBodyMethod = !['GET', 'HEAD'].includes(method);
    const cap = Math.max(1, Math.min(Number(maxPages) || 5, 40));
    let pagesFetched = 0;
    let recordsSeen = 0;
    /* Tổng số gói e-GP nói là CÓ, và tổng số trang. Phải mang được hai con số
       này về: không có chúng thì phần mềm không thể nói cho người dùng biết
       lượt quét đã lấy hết hay mới lấy được một phần. */
    let serverTotalCount = null;
    let serverTotalPages = null;
    let stoppedBy = 'end';   // end | cap | no-paging | page-error

    for (let ordinal = 0; ordinal < cap; ordinal++) {
      const built = buildRequestForPage(request, ordinal);
      if (!built) { stoppedBy = 'no-paging'; break; } // Không phân trang được → dừng sau các trang đã lấy.

      const options = { method, headers: withLiveSecurityHeaders(request.headers), credentials: 'include', cache: 'no-store' };
      const body = String(built.body || '');
      if (isBodyMethod && body) options.body = body; // Phát lại NGUYÊN TRẠNG thân request.

      let response;
      try {
        response = await originalFetch(built.url, options);
      } catch (error) {
        if (ordinal === 0) { post('REPLAY_COMPLETE', { runId, ok: false, error: String(error?.message || error) }); return; }
        break;
      }

      if (!response.ok) {
        // Trang đầu bị từ chối = template hết hiệu lực → báo để dựng lại bộ lọc.
        if (ordinal === 0) {
          post('REPLAY_COMPLETE', { runId, ok: false, status: response.status, expired: true, error: `e-GP trả HTTP ${response.status} cho bộ lọc đã lưu.` });
          return;
        }
        stoppedBy = 'page-error';
        break; // Trang sau lỗi → giữ dữ liệu đã lấy, dừng lại.
      }

      const text = await response.clone().text();
      const data = safeParse(text);
      const pageCount = data ? countCandidates(data) : 0;
      const totals = data ? readTotals(data) : {};
      if (totals.totalCount != null) serverTotalCount = totals.totalCount;
      if (totals.totalPages != null) serverTotalPages = totals.totalPages;
      if (data && pageCount > 0) {
        post('NETWORK_CAPTURE', { request: { ...request, url: built.url, body }, data, responseUrl: response.url, status: response.status, capturedAt: new Date().toISOString(), runId, page: ordinal + 1, total: totals.totalCount, totalPages: totals.totalPages });
      }
      pagesFetched++;
      recordsSeen += pageCount;

      // Điều kiện dừng.
      if (pageCount === 0 && ordinal > 0) break;
      if (totals.totalPages != null && ordinal + 1 >= totals.totalPages) break;
      if (buildRequestForPage(request, ordinal + 1) === null) { stoppedBy = 'no-paging'; break; }
      // Còn trang nhưng đã chạm trần số trang cho phép.
      if (ordinal + 1 >= cap) { stoppedBy = 'cap'; break; }

      // Nghỉ nhẹ giữa các trang để không dồn dập lên máy chủ e-GP.
      await new Promise((r) => setTimeout(r, 350));
    }

    /* Báo về ĐỦ bốn con số. Trước đây chỉ gửi `pages` và `records`, nên khi lượt
       quét dừng vì chạm trần số trang thì không ai biết — giao diện vẫn nói
       "Đã quét xong" trong khi e-GP còn hàng trăm gói chưa lấy. Với người đi
       tìm thầu thì đó là mất cơ hội chứ không phải chuyện hiển thị. */
    post('REPLAY_COMPLETE', {
      runId, ok: true,
      pages: pagesFetched,
      records: recordsSeen,
      totalCount: serverTotalCount,
      totalPages: serverTotalPages,
      pageCap: cap,
      truncated: stoppedBy === 'cap'
        || (serverTotalPages != null && pagesFetched < serverTotalPages),
      stoppedBy
    });
  }

  // ====================================================================
  //  TRA CỨU KQLCNT
  //
  //  e-GP bảo vệ endpoint tìm kiếm bằng reCAPTCHA v3: mỗi request phải kèm
  //  một token do chính trang sinh ra tại thời điểm người dùng thao tác
  //  (thiếu token máy chủ trả HTTP 400). Vì vậy tiện ích KHÔNG tự gọi API,
  //  mà để giao diện e-GP thực hiện đúng thao tác tìm kiếm của nó — kèm
  //  token hợp lệ của chính nó — rồi chỉ tinh chỉnh TIÊU CHÍ tìm kiếm trong
  //  thân request đó, để máy chủ lọc sẵn theo nhà thầu trúng thầu.
  //
  //  Phân trang cũng do giao diện e-GP tự bấm (xem content.js), nên nhịp
  //  truy vấn đúng bằng nhịp một người dùng bấm chuột.
  // ====================================================================

  /**
   * Nếu đang có kế hoạch tra cứu và request này là request tìm kiếm của e-GP,
   * trả về thân request đã thay tiêu chí. Ngược lại trả về null (không đụng tới).
   *
   * Khối `plan.query` được background.js dựng sẵn bằng lib/kqlcnt.js hoặc
   * lib/bbmt.js — nơi có kiểm thử — nên ở đây chỉ việc gắn vào, giữ nguyên
   * phân trang mà giao diện e-GP đang dùng.
   */
  function refineKqlcntBody(url, rawBody) {
    if (!kqlcntPlan || !kqlcntPlan.query || !rawBody) return null;
    if (String(url || '').indexOf(SEARCH_ENDPOINT) === -1) return null;

    let parsed;
    try { parsed = JSON.parse(rawBody); } catch { return null; }
    if (!Array.isArray(parsed) || !parsed[0] || typeof parsed[0] !== 'object') return null;

    const envelope = { ...parsed[0], query: [kqlcntPlan.query] };
    if (kqlcntPlan.pageSize) envelope.pageSize = String(kqlcntPlan.pageSize);
    return JSON.stringify([envelope]);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== CONTENT_SOURCE) return;

    if (event.data.type === 'REPLAY_REQUEST') {
      const { request, maxPagesHint = 5, runId } = event.data.payload || {};
      if (!request?.url) { post('REPLAY_COMPLETE', { runId, ok: false, error: 'Chưa có bộ lọc đã ghi nhớ.' }); return; }
      replaySearch(request, maxPagesHint, runId);
      return;
    }

    // Bật/tắt chế độ tinh chỉnh tiêu chí cho lượt tra cứu KQLCNT.
    if (event.data.type === 'KQLCNT_PLAN') {
      const plan = event.data.payload || null;
      kqlcntPlan = plan && plan.id ? plan : null;
      post('KQLCNT_PLAN_ACK', { planId: kqlcntPlan ? kqlcntPlan.id : null });
    }
  });

  post('HOOK_READY', { url: location.href });
})();
