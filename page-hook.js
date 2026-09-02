/*
 * Giáo Sư Cùi Bắp — page-hook.js  (chạy trong MAIN world của trang e-GP)
 *
 * 1) Quan sát mọi phản hồi JSON mà giao diện e-GP tải (fetch + XHR) và đẩy về
 *    content script khi thấy dữ liệu có mã TBMT.
 * 2) Chỉ chấp nhận request tìm kiếm đúng origin/endpoint/schema; không nhận
 *    URL, phương thức hay header tùy ý từ bridge.
 * 3) Phân trang bằng thao tác của giao diện e-GP, giữ CAPTCHA/token hiện hành.
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

  function headersToObject(headers) {
    const out = {};
    try { for (const [k, v] of new Headers(headers || {}).entries()) out[k] = v; } catch {}
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

  async function inspectResponse(response, request, planId = '') {
    try {
      const clone = response.clone();
      const ctype = clone.headers.get('content-type') || '';
      let data = null;
      if (/json/i.test(ctype)) data = await clone.json();
      else {
        const text = await clone.text();
        if (/^\s*[\[{]/.test(text)) data = safeParse(text);
      }
      const responseUrl = response.url || request.url || '';
      recordEndpoint(responseUrl, request.method, response.status, data);
      if (planId) {
        post('KQLCNT_PAGE', {
          planId,
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          data
        });
      }
      if (String(responseUrl).includes(LOT_OPEN_DETAIL_ENDPOINT) && Array.isArray(data)) {
        post('BBMT_BIDDERS', { url: location.href, rows: data, status: response.status });
      }
      if (isAttachmentUrl(responseUrl) && data) {
        post('EGP_ATTACHMENTS', { url: location.href, payload: data });
      }
      if (!planId && data && hasRelevant(data)) {
        post('NETWORK_CAPTURE', { request, data, responseUrl: response.url, status: response.status, capturedAt: new Date().toISOString() });
      }
    } catch {}
  }

  // ------- Chặn fetch để quan sát (không can thiệp request gốc) -------
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    let request;
    try { request = await serializeFetchRequest(input, init); } catch { request = { url: String(input), method: 'GET', headers: {}, body: '' }; }
    let fetchInput = input;
    let fetchInit = init;
    let planId = '';
    if (kqlcntPlan && String(request.url || '').includes(SEARCH_ENDPOINT)) {
      const refined = refineKqlcntBody(request.url, request.body);
      if (refined !== null) {
        planId = kqlcntPlan.id;
        request.body = refined;
        try {
          if (typeof Request !== 'undefined' && input instanceof Request) {
            fetchInput = new Request(input, { body: refined });
            fetchInit = undefined;
          } else {
            fetchInit = { ...(init || {}), method: request.method, body: refined };
          }
        } catch {
          planId = '';
          fetchInput = input;
          fetchInit = init;
        }
      }
    }
    const response = await originalFetch(fetchInput, fetchInit);
    void inspectResponse(response, request, planId);
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
        const refined = refineKqlcntBody(this.__br.url, this.__br.body);
        if (refined !== null) {
          this.__brKqlcnt = kqlcntPlan.id;
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

    // Bật/tắt chế độ tinh chỉnh tiêu chí cho lượt tra cứu KQLCNT.
    if (event.data.type === 'KQLCNT_PLAN') {
      const plan = event.data.payload || null;
      kqlcntPlan = plan && plan.id ? plan : null;
      post('KQLCNT_PLAN_ACK', { planId: kqlcntPlan ? kqlcntPlan.id : null });
    }
  });

  post('HOOK_READY', { url: location.href });
})();
