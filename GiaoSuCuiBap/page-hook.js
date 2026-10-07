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
  const EGP_ORIGIN = 'https://muasamcong.mpi.gov.vn';
  const PORTAL_SERVICE_ROOT = '/o/egp-portal-contractor-selection-v2';
  const SEARCH_ENDPOINT = `${PORTAL_SERVICE_ROOT}/services/smart/search`;
  const LOT_OPEN_DETAIL_ENDPOINTS = new Set([
    `${PORTAL_SERVICE_ROOT}/services/expose/ldtkqmt/bid-notification-p/lotOpenDetail`,
    '/services/expose/ldtkqmt/bid-notification-p/lotOpenDetail'
  ]);
  const BID_OPEN_ENDPOINTS = new Set([
    `${PORTAL_SERVICE_ROOT}/services/expose/ldtkqmt/bid-notification-p/bid-open`,
    '/services/expose/ldtkqmt/bid-notification-p/bid-open'
  ]);
  const BID_OPEN_NOTIFY_ENDPOINTS = new Set([
    `${PORTAL_SERVICE_ROOT}/services/exposeldtkqmt/bid-notification-p/notify`,
    '/services/exposeldtkqmt/bid-notification-p/notify'
  ]);
  const BID_OPEN_ROUND_ENDPOINTS = new Set([
    `${PORTAL_SERVICE_ROOT}/services/expose/ldtkqmt/bid-notification-p/roundmng`,
    '/services/expose/ldtkqmt/bid-notification-p/roundmng'
  ]);
  const KHAC_OPEN_ENDPOINTS = new Set([
    `${PORTAL_SERVICE_ROOT}/services/expose/kqmt/bid-notify-contractor-out/get-by-id`,
    '/services/expose/kqmt/bid-notify-contractor-out/get-by-id'
  ]);
  const KHLCNT_DETAIL_ENDPOINTS = new Set([
    `${PORTAL_SERVICE_ROOT}/services/expose/lcnt/bid-po-bidp-plan-project-view/get-by-id`
  ]);

  /* Hai endpoint mà trang chi tiết tự gọi, có kèm danh sách tệp đính kèm:
   *   lcnt_tbmt_hsmt                     -> hồ sơ mời thầu (E-HSMT)
   *   expose/contractor-input-result/get -> quyết định phê duyệt + báo cáo đánh giá
   * Chỉ ĐỌC phản hồi, không can thiệp — đúng nguyên tắc thu thụ động. */
  const ATTACHMENT_ENDPOINTS = new Set([
    `${PORTAL_SERVICE_ROOT}/services/lcnt_tbmt_hsmt`,
    `${PORTAL_SERVICE_ROOT}/services/expose/contractor-input-result/get`,
    '/services/lcnt_tbmt_hsmt',
    '/services/expose/contractor-input-result/get'
  ]);

  function officialEgpUrl(value) {
    try {
      const url = new URL(String(value || ''), location.href);
      return url.protocol === 'https:' && url.origin === EGP_ORIGIN
        && !url.username && !url.password ? url : null;
    } catch {
      return null;
    }
  }

  function isExactEgpEndpoint(value, paths) {
    const url = officialEgpUrl(value);
    return Boolean(url && paths.has(url.pathname));
  }

  function isSearchRequest(value, method) {
    const url = officialEgpUrl(value);
    return Boolean(url && url.pathname === SEARCH_ENDPOINT && String(method || '').toUpperCase() === 'POST');
  }

  const isAttachmentUrl = (value) => isExactEgpEndpoint(value, ATTACHMENT_ENDPOINTS);

  // Kế hoạch tra cứu đang chạy; null = không can thiệp bất kỳ request nào.
  // Khối truy vấn do background.js dựng sẵn (lib/kqlcnt.js hoặc lib/bbmt.js)
  // rồi truyền xuống, nên tệp này không phải lặp lại logic lọc của bất kỳ ai.
  let kqlcntPlan = null;

  const RELEVANT = new Set(['notifyNo', 'notify_no', 'tbmtNo', 'bidNo', 'bidName', 'notifyName', 'packageName', 'publicDate', 'publishDate', 'investorName', 'procuringEntityName', 'bidPrice', 'packagePrice', 'bidPackagePrice', 'notifyVersion', 'notifyVersionNo', 'investField', 'investFieldName', 'fieldName', 'closeDate', 'bidCloseDate', 'projectName', 'provinceName', 'executionLocation']);
  const IDENTITY = ['notifyNo', 'bidName', 'notifyName', 'bidNo'];

  const PLAN_KEYS = new Set(['id', 'query', 'pageSize', 'queryIndex']);
  const QUERY_KEYS = new Set(['index', 'filters', 'keyWord', 'matchType', 'matchFields']);
  const FILTER_KEYS = new Set(['fieldName', 'searchType', 'fieldValues', 'from', 'to']);
  const SEARCH_TYPES = new Set(['in', 'range', 'not_null', 'greater_equal', 'less_equal']);
  const MATCH_TYPES = new Set(['all-0', 'all-1', 'any-0', 'any-1', 'exact']);
  const RECORD_TYPES = new Set(['es-notify-contractor', 'es-plan-project-p']);
  const NOTICE_STEPS = new Set([
    'notify-contractor-step-1-tbmt',
    'notify-contractor-step-2-kqmt',
    'notify-contractor-step-3-dsntdkt',
    'notify-contractor-step-4-kqlcnt'
  ]);
  const SECRET_FIELD = /(token|captcha|csrf|xsrf|jwt|session|auth|signature|secret|cookie|password)/i;
  const FIELD_NAME = /^[A-Za-z0-9_.-]{1,120}$/;
  const PLAN_ID = /^[A-Za-z0-9_-]{1,120}$/;
  const MAX_QUERY_CHARS = 100000;
  const MAX_ENVELOPE_CHARS = MAX_QUERY_CHARS * 2;
  const MAX_FILTERS = 80;
  const MAX_VALUES = 200;

  function isPlainObject(value) {
    // postMessage đi từ ISOLATED world sang MAIN world, nên prototype có thể
    // thuộc realm khác. Dùng nhãn built-in thay vì so Object.prototype trực tiếp.
    return Boolean(value && typeof value === 'object' && !Array.isArray(value)
      && Object.prototype.toString.call(value) === '[object Object]');
  }

  function safeFilterValue(value) {
    if (typeof value === 'string') return value.length <= 4000;
    if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 1e18;
    return typeof value === 'boolean' || value === null;
  }

  function validFilter(filter) {
    if (!isPlainObject(filter) || Object.keys(filter).some((key) => !FILTER_KEYS.has(key))) return false;
    if (!FIELD_NAME.test(String(filter.fieldName || '')) || SECRET_FIELD.test(filter.fieldName)) return false;
    if (!SEARCH_TYPES.has(String(filter.searchType || ''))) return false;

    const values = filter.fieldValues;
    if (values !== undefined && (!Array.isArray(values) || values.length > MAX_VALUES || values.some((v) => !safeFilterValue(v)))) return false;
    if (filter.from !== undefined && !safeFilterValue(filter.from)) return false;
    if (filter.to !== undefined && !safeFilterValue(filter.to)) return false;
    if (filter.searchType === 'range') return filter.from !== undefined || filter.to !== undefined;
    return Array.isArray(values);
  }

  function filterValues(filters, name) {
    const matches = filters.filter((filter) => filter.fieldName === name);
    if (matches.length !== 1 || matches[0].searchType !== 'in') return null;
    return matches[0].fieldValues;
  }

  function validQuery(query) {
    if (!isPlainObject(query) || Object.keys(query).some((key) => !QUERY_KEYS.has(key))) return false;
    if (query.index !== 'es-contractor-selection') return false;
    if (!Array.isArray(query.filters) || query.filters.length < 1 || query.filters.length > MAX_FILTERS) return false;
    if (!query.filters.every(validFilter)) return false;

    const types = filterValues(query.filters, 'type');
    if (!types || types.length !== 1 || !RECORD_TYPES.has(types[0])) return false;
    const stepFilters = query.filters.filter((filter) => filter.fieldName === 'stepCode');
    if (types[0] === 'es-notify-contractor') {
      const steps = filterValues(query.filters, 'stepCode');
      // Permit a stage-independent query only for one exact, complete public
      // notice ID. IB2600534292 moved to online quotation on 14/09/2026;
      // assuming all live notice identities use steps 1–4 hid that real record.
      const exactNotice = !stepFilters.length && /^IB\d{10}$/.test(query.keyWord || '')
        && query.matchType === 'exact' && Array.isArray(query.matchFields)
        && query.matchFields.length === 1 && query.matchFields[0] === 'notifyNo';
      if (!exactNotice && (!steps || steps.length < 1 || steps.some((step) => !NOTICE_STEPS.has(step)))) return false;
    } else if (stepFilters.length) {
      return false;
    }

    const hasKeyword = Object.prototype.hasOwnProperty.call(query, 'keyWord');
    if (hasKeyword && (typeof query.keyWord !== 'string' || !query.keyWord.trim() || query.keyWord.length > 500)) return false;
    if (Object.prototype.hasOwnProperty.call(query, 'matchType') && !MATCH_TYPES.has(query.matchType)) return false;
    if (Object.prototype.hasOwnProperty.call(query, 'matchFields')) {
      if (!Array.isArray(query.matchFields) || query.matchFields.length < 1 || query.matchFields.length > 20) return false;
      if (query.matchFields.some((field) => !FIELD_NAME.test(String(field || '')) || SECRET_FIELD.test(field))) return false;
    }
    if (hasKeyword !== Object.prototype.hasOwnProperty.call(query, 'matchType')) return false;
    if (hasKeyword !== Object.prototype.hasOwnProperty.call(query, 'matchFields')) return false;

    try {
      return JSON.stringify(query).length <= MAX_QUERY_CHARS;
    } catch {
      return false;
    }
  }

  function validatedPlan(value) {
    if (!isPlainObject(value) || Object.keys(value).some((key) => !PLAN_KEYS.has(key))) return null;
    if (typeof value.id !== 'string' || !PLAN_ID.test(value.id) || !validQuery(value.query)) return null;
    if (!Number.isInteger(value.pageSize) || ![10, 20, 50].includes(value.pageSize)) return null;
    try {
      if(value.queryIndex!=null&&(!Number.isSafeInteger(value.queryIndex)||value.queryIndex<0))return null;
      return { id: value.id, queryIndex:value.queryIndex??0, query: JSON.parse(JSON.stringify(value.query)), pageSize: value.pageSize };
    } catch {
      return null;
    }
  }

  // Tên trường phân trang thường gặp trên e-GP và các framework phổ biến.
  const post = (type, payload) => window.postMessage({ source: SOURCE, type, payload, v: 440 }, location.origin);

  /* ------------------------------------------------------------------------
   *  e-GP CÓ ĐANG BẬN KHÔNG — và yêu cầu của lượt tra cứu ĐÃ RỜI TRÌNH DUYỆT CHƯA
   *
   *  Lỗi chập chờn "e-GP chưa trả dữ liệu cho lượt tra cứu" sinh ra từ đúng chỗ
   *  này. Trang tra cứu e-GP TỰ TẢI danh sách mặc định ngay khi mở. Nếu tiện ích
   *  thao tác (đổi ô số bản ghi) lúc yêu cầu mặc định đó chưa xong, giao diện
   *  e-GP coi trang đang bận và BỎ QUA thao tác — không yêu cầu nào được gửi.
   *  Tiện ích không biết điều đó, ngồi chờ hết 25 giây rồi đổ lỗi cho e-GP.
   *  Bấm lại thì tab đã rảnh nên chạy được: đúng triệu chứng "lúc được lúc mất".
   *
   *  Nay hook báo về hai điều nó thấy tận mắt:
   *    EGP_SEARCH_ACTIVITY — số yêu cầu tìm kiếm của e-GP đang chờ phản hồi,
   *                          gồm cả yêu cầu e-GP tự phát. Còn > 0 là trang bận.
   *    KQLCNT_REQUEST_SENT — yêu cầu MANG TIÊU CHÍ của lượt tra cứu đã thật sự
   *                          được gửi đi. Không thấy tín hiệu này nghĩa là thao
   *                          tác vừa rồi đã bị bỏ qua, phải làm lại — không phải
   *                          ngồi chờ phản hồi của một yêu cầu không tồn tại.
   * ---------------------------------------------------------------------- */
  let searchesInFlight = 0;
  const searchStarted = (planId, queryIndex, body) => {
    searchesInFlight += 1;
    post('EGP_SEARCH_ACTIVITY', { inFlight: searchesInFlight });
    if (planId) post('KQLCNT_REQUEST_SENT', { planId, queryIndex, pageNumber: nativePageIndex(body) });
  };
  /* Có lượt tra cứu đang chạy mà e-GP gửi một yêu cầu tìm kiếm tiện ích KHÔNG
     gắn được tiêu chí: thân yêu cầu không còn đúng dạng đã biết (e-GP đổi cấu
     trúc), hoặc quá lớn. Báo ngay để lượt tra cứu dừng với lý do thật, thay vì
     chờ phản hồi của một yêu cầu không mang tiêu chí rồi kết luận sai. */
  const rejectedSearch = (body) => {
    if (!kqlcntPlan) return;
    let reason = 'shape';
    if (typeof body !== 'string' || !body) reason = 'empty';
    else if (body.length > MAX_ENVELOPE_CHARS) reason = 'oversized';
    post('KQLCNT_REQUEST_REJECTED', { planId: kqlcntPlan.id, queryIndex: kqlcntPlan.queryIndex ?? 0, reason });
  };
  const searchSettled = () => {
    searchesInFlight = Math.max(0, searchesInFlight - 1);
    post('EGP_SEARCH_ACTIVITY', { inFlight: searchesInFlight });
  };

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
      const parsed = officialEgpUrl(url);
      if (!parsed) return;
      const path = parsed.pathname;
      // Report each response so a later success or schema change replaces an
      // earlier error. The background keeps one bounded entry per endpoint.
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

  // Accept explicit, shallow response envelopes; never search arbitrary objects.
  function openingRows(data,depth=0){
    if(Array.isArray(data))return data;
    if(!data||typeof data!=='object'||depth>3||data.success===false)return null;
    for(const key of ['data','result','content','rows']){
      if(Object.hasOwn(data,key)){const rows=openingRows(data[key],depth+1);if(rows)return rows;}
    }
    return null;
  }

  // Verified against the official detail-v2 template for IB2600486024:
  // single-package bids come from bid-open, not the separate lotOpenDetail.
  // Copy only published bidder fields; never forward arbitrary response data.
  function openingBoolean(flag) {
    return flag === true || flag === 1 ? true : flag === false || flag === 0 ? false : null;
  }
  function bidOpeningKind(url, data) {
    if (isExactEgpEndpoint(url, KHAC_OPEN_ENDPOINTS)) {
      const flag = openingBoolean(data?.bidoNotifyContractorP?.isMultiLot);
      return flag === null ? null : flag ? 'lot' : 'package';
    }
    return isExactEgpEndpoint(url, BID_OPEN_ENDPOINTS) ? 'package' : 'lot';
  }
  function packageOpeningRows(rows) {
    if (!Array.isArray(rows)) return null;
    // An unrecognized nonempty response must not masquerade as an empty table.
    if (rows.some(row => !isPlainObject(row) || (!row.contractorCode && !row.contractorName && !row.ventureName))) return null;
    return rows.map(row => ({
      contractorCode: row.contractorCode,
      contractorName: row.contractorName || row.ventureName,
      ventureName: row.ventureName,
      ventureCode: row.ventureCode,
      lotPrice: row.bidPrice,
      lotFinalPrice: row.bidFinalPrice,
      discountPercent: row.saleNumber,
      bidGuaranteeAmount: row.bidGuarantee,
      bidGuaranteeEff: row.bidGuaranteeValidity,
      techScore: row.techScore
    }));
  }

  function bidOpeningRows(url, data) {
    if (isExactEgpEndpoint(url, LOT_OPEN_DETAIL_ENDPOINTS)) return openingRows(data);
    if (!isPlainObject(data) || data.success === false) return null;
    const submission = data.bidSubmissionByContractorViewResponse;
    if (isExactEgpEndpoint(url, BID_OPEN_ENDPOINTS)) return packageOpeningRows(submission?.bidSubmissionDTOList);
    if (!isExactEgpEndpoint(url, KHAC_OPEN_ENDPOINTS) || !isPlainObject(data.bidoNotifyContractorP)) return null;
    // The official loadDetailKqmtVk and its KHAC table select precisely these
    // two arrays by bidoNotifyContractorP.isMultiLot. Missing is not false.
    const kind = bidOpeningKind(url, data);
    if (kind === 'package') return packageOpeningRows(submission?.bidSubmissionDTOList);
    if (kind !== 'lot' || !Array.isArray(submission?.bidoLotOpenDetailDTOS)) return null;
    const lots = submission.bidoLotOpenDetailDTOS;
    if (lots.some(row => !isPlainObject(row) || !row.lotNo || (!row.contractorCode && !row.contractorName && !row.ventureName))) return null;
    const bidders = Array.isArray(submission.bidSubmissionDTOList) ? submission.bidSubmissionDTOList : [];
    return lots.map(row => {
      const bidder = bidders.find(item => isPlainObject(item) && item.contractorCode && item.contractorCode === row.contractorCode);
      return {
        contractorCode: row.contractorCode,
        contractorName: row.contractorName || bidder?.contractorName || row.ventureName || bidder?.ventureName,
        ventureName: bidder?.ventureName || row.ventureName,
        ventureCode: bidder?.ventureCode || row.ventureCode,
        lotNo: row.lotNo,
        lotName: row.lotName,
        lotPrice: row.lotPrice,
        lotFinalPrice: row.lotFinalPrice,
        discountPercent: row.discountPercent,
        bidGuaranteeAmount: bidder?.bidGuarantee ?? row.bidGuarantee,
        bidGuaranteeEff: bidder?.bidGuaranteeValidity ?? row.bidGuaranteeValidity,
        techScore: row.techScore
      };
    });
  }

  function bidOpeningPriceBasis(url, data) {
    if (!isPlainObject(data) || data.success === false) return null;
    if (isExactEgpEndpoint(url, BID_OPEN_ROUND_ENDPOINTS)) {
      // Official loadDetailKqmtLdt assigns this exact DTO from roundmng.
      const round = data.bidoBidroundMngViewDTO;
      if (!isPlainObject(round)) return null;
      const isMultiLot = openingBoolean(round.isMultiLot);
      return isMultiLot === null ? null : {bidPrice:null, bidEstimatePrice:null, isMultiLot, source:'round'};
    }
    const isKhac = isExactEgpEndpoint(url, KHAC_OPEN_ENDPOINTS);
    if (!isKhac && !isExactEgpEndpoint(url, BID_OPEN_NOTIFY_ENDPOINTS)) return null;
    const notification = isKhac ? data.bidoNotifyContractorP : data.bidNoContractorResponse?.bidNotification;
    if (!isPlainObject(notification)) return null;
    const positive = value => {
      if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value))) return null;
      const number = Number(value);
      return Number.isFinite(number) && number > 0 ? number : null;
    };
    const bidPrice = positive(notification.bidPrice);
    const bidEstimatePrice = positive(notification.bidEstimatePrice);
    const isMultiLot = openingBoolean(notification.isMultiLot);
    // Even an explicit notification without a price must finish the price
    // observation. It is different from a notify response that has not arrived.
    return {bidPrice, bidEstimatePrice, isMultiLot, source:'notify'};
  }

  const bidOpeningMetadataByPage = new Map();
  function publishBidOpeningPriceBasis(pageUrl, status, incoming) {
    const previous = bidOpeningMetadataByPage.get(pageUrl) || {};
    const merged = {
      bidPrice: incoming.bidPrice ?? previous.bidPrice ?? null,
      bidEstimatePrice: incoming.bidEstimatePrice ?? previous.bidEstimatePrice ?? null,
      isMultiLot: incoming.isMultiLot ?? previous.isMultiLot ?? null
    };
    bidOpeningMetadataByPage.set(pageUrl, merged);
    if (bidOpeningMetadataByPage.size > 20) bidOpeningMetadataByPage.delete(bidOpeningMetadataByPage.keys().next().value);
    post('BBMT_PRICE_BASIS', {url:pageUrl, status, ...merged, source:incoming.source});
  }

  function publishOpeningMetadata(responseUrl, pageUrl, status, data) {
    if (status < 200 || status >= 300) return;
    const basis = bidOpeningPriceBasis(responseUrl, data);
    if (!basis) return;
    publishBidOpeningPriceBasis(pageUrl, status, basis);
    // KHAC get-by-id includes both verified price metadata and the actual table
    // classifier, unlike LDT's independently delivered notify/round responses.
    if (isExactEgpEndpoint(responseUrl, KHAC_OPEN_ENDPOINTS) && basis.isMultiLot !== null) {
      publishBidOpeningPriceBasis(pageUrl, status, {...basis, source:'round'});
    }
  }

  // Public detail DTO witnessed on the native PL2600333000 page. Observe only
  // the page's own request; never request a detail API or forward its envelope.
  function publishKhlcntDetail(responseUrl, pageUrl, status, data) {
    if(status<200||status>=300||!isExactEgpEndpoint(responseUrl,KHLCNT_DETAIL_ENDPOINTS)
      ||!officialEgpUrl(pageUrl)||!isPlainObject(data)||data.success===false)return;
    const sourceHeader=data.bidPoBidpPlanProjectDetailView;
    if(!isPlainObject(sourceHeader))return;
    const headerKeys=['id','planNo','planVersion','name','decisionDate','publicDate','bidPack'];
    const childKeys=['id','idPlan','planNo','bidNo','bidName','bidField','bidPrice','bidPriceUnit','investField',
      'notifyNo','notifyVersion','investorCode','investorName'];
    const locationKeys=['provCode','provinceCode','provName','provinceName','districtCode','districtName',
      'wardCode','wardName','parentCode','parentAreaCode','wardParentCode','latitude','longitude'];
    const project=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)&&(
      value[key]===null||typeof value[key]==='number'&&Number.isFinite(value[key])&&Math.abs(value[key])<=1e18
      ||typeof value[key]==='string'&&value[key].length<=(['name','bidName','investorName'].includes(key)?4000:160)
    )).map(key=>[key,value[key]]));
    const header=project(sourceHeader,headerKeys);
    if(!header.id||!/^PL\d{10}$/.test(header.planNo||''))return;
    const primary=data.bidpPlanDetailToProjectList;
    const packages=Array.isArray(primary)&&(primary.length||Number(header.bidPack)===0)?primary:data.lsBidpPlanDetailDTO;
    if(!Array.isArray(packages)||packages.length>500||packages.some(row=>!isPlainObject(row)))return;
    if(packages.some(row=>row.locations!=null&&(!Array.isArray(row.locations)||row.locations.length>50||row.locations.some(location=>!isPlainObject(location)))))return;
    // An empty array without an explicit zero package count is incomplete,
    // rather than evidence that a published plan contains no packages.
    if(!packages.length&&(header.bidPack===null||header.bidPack===undefined||header.bidPack===''||Number(header.bidPack)!==0))return;
    const rows=packages.map(row=>{
      const result=project(row,childKeys);
      if(Array.isArray(row.locations)&&row.locations.length<=50&&row.locations.every(isPlainObject)){
        result.locations=row.locations.map(location=>project(location,locationKeys));
      }
      return result;
    });
    post('KHLCNT_DETAIL',{url:pageUrl,status,header,packages:rows});
  }

  async function inspectResponse(response, request, planId = '', queryIndex = 0) {
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
      if (!officialEgpUrl(responseUrl)) return;
      recordEndpoint(responseUrl, request.method, response.status, data);
      if (planId) {
        post('KQLCNT_PAGE', {
          planId, queryIndex, sourcePageIndex:nativePageIndex(request.body),
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          retryAfter: response.status === 429 ? (response.headers.get('retry-after') || '').slice(0, 100) : '',
          data
        });
      }
      const bidders = response.ok ? bidOpeningRows(responseUrl, data) : null;
      if (bidders) {
        post('BBMT_BIDDERS', { url: request.pageUrl, rows: bidders, status: response.status,
          kind: bidOpeningKind(responseUrl, data) });
      }
      publishOpeningMetadata(responseUrl, request.pageUrl, response.status, data);
      publishKhlcntDetail(responseUrl, request.pageUrl, response.status, data);
      if (isAttachmentUrl(responseUrl) && data) {
        post('EGP_ATTACHMENTS', { url: location.href, payload: data });
      }
      if (!planId && !isExactEgpEndpoint(responseUrl,KHLCNT_DETAIL_ENDPOINTS) && data && hasRelevant(data)) {
        post('NETWORK_CAPTURE', { request, data, responseUrl: response.url, status: response.status, capturedAt: new Date().toISOString() });
      }
    } catch {
      if(planId)post('KQLCNT_PAGE',{planId,queryIndex,ok:false,status:response.status||0,
        retryAfter:response.status===429?(response.headers.get('retry-after')||'').slice(0,100):'',
        schemaIssue:true,failureReason:'Không đọc được dữ liệu phản hồi e-GP.',data:null});
    }
  }

  // ------- Chặn fetch để quan sát (không can thiệp request gốc) -------
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    let request;
    try { request = await serializeFetchRequest(input, init); } catch { request = { url: String(input), method: 'GET', headers: {}, body: '' }; }
    let fetchInput = input;
    let fetchInit = init;
    let planId = '', queryIndex = 0;
    if (kqlcntPlan && isSearchRequest(request.url, request.method)) {
      const refined = refineKqlcntBody(request.url, request.method, request.body);
      if (refined !== null) {
        planId = kqlcntPlan.id;
        queryIndex = kqlcntPlan.queryIndex;
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
    request.pageUrl=location.href;
    const isSearch = isSearchRequest(request.url, request.method);
    if (isSearch && kqlcntPlan && !planId) rejectedSearch(request.body);
    if (isSearch) searchStarted(planId, queryIndex, request.body);
    let response;
    try { response = await originalFetch(fetchInput, fetchInit); }
    catch(error){
      if (isSearch) searchSettled();
      if(planId)post('KQLCNT_PAGE',{planId,queryIndex,ok:false,status:0,
        failureReason:'Kết nối e-GP bị gián đoạn.',data:null});
      throw error;
    }
    if (isSearch) searchSettled();
    void inspectResponse(response, request, planId, queryIndex);
    return response;
  };

  // ------- Chặn XHR để quan sát -------
  const XHROpen = XMLHttpRequest.prototype.open;
  const XHRSend = XMLHttpRequest.prototype.send;
  const XHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__br = { method: String(method || 'GET').toUpperCase(), url: String(url), headers: {}, body: '' };
    this.__brKqlcnt = '';
    this.__brQueryIndex = 0;
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
      // được chuyển về đúng nơi. Chỉ thay tiêu chí khi kế hoạch đã qua allowlist
      // và request do chính giao diện e-GP phát tới đúng endpoint chính thức.
      if (kqlcntPlan && isSearchRequest(this.__br.url, this.__br.method)) {
        const refined = refineKqlcntBody(this.__br.url, this.__br.method, this.__br.body);
        if (refined !== null) {
          this.__brKqlcnt = kqlcntPlan.id;
          this.__brQueryIndex = kqlcntPlan.queryIndex;
          body = refined;
          this.__br.body = refined;
        }
      }

      this.__br.pageUrl=location.href;
      const isSearch=isSearchRequest(this.__br.url,this.__br.method);
      if(isSearch&&kqlcntPlan&&!this.__brKqlcnt)rejectedSearch(this.__br.body);
      if(isSearch){
        searchStarted(this.__brKqlcnt,this.__brQueryIndex,this.__br.body);
        this.addEventListener('loadend',searchSettled,{once:true});
      }
      const onFailure=()=>{
        removeFailureListeners();
        if(this.__brKqlcnt)post('KQLCNT_PAGE',{planId:this.__brKqlcnt,queryIndex:this.__brQueryIndex,ok:false,status:this.status||0,
          failureReason:'Kết nối e-GP bị gián đoạn hoặc hết thời gian chờ.',data:null});
      };
      const removeFailureListeners=()=>{
        for(const type of ['error','timeout','abort'])this.removeEventListener?.(type,onFailure);
      };
      for(const type of ['error','timeout','abort'])this.addEventListener(type,onFailure,{once:true});
      this.addEventListener('load', () => {
        removeFailureListeners();
        /* Phản hồi của lượt tra cứu được chuyển về TRƯỚC mọi việc khác, trong
           khối try RIÊNG. Trước đây nó nằm chung một khối try với các bộ quan
           sát phía sau, mà khối catch thì rỗng: chỉ cần một dòng nào đó ném lỗi
           là phản hồi bị nuốt mất, tiện ích chờ hết giờ rồi đổ lỗi cho e-GP. */
        let data = null;
        try { data = this.responseType === 'json' ? this.response : safeParse(this.responseText || ''); } catch { data = null; }
        if (this.__brKqlcnt) {
          try {
            post('KQLCNT_PAGE', {
              planId: this.__brKqlcnt, queryIndex: this.__brQueryIndex, sourcePageIndex:nativePageIndex(this.__br.body),
              ok: this.status >= 200 && this.status < 300,
              status: this.status,
              retryAfter: this.status === 429 ? (this.getResponseHeader?.('retry-after') || '').slice(0, 100) : '',
              data
            });
          } catch {
            post('KQLCNT_PAGE', { planId: this.__brKqlcnt, queryIndex: this.__brQueryIndex, ok: false,
              status: this.status || 0, schemaIssue: true, failureReason: 'Không đọc được dữ liệu phản hồi e-GP.', data: null });
          }
        }
        try {
          // Bảng nhà thầu tham dự của một Biên bản mở thầu. Luôn chuyển tiếp,
          // kể cả khi người dùng tự mở trang — dữ liệu này chỉ có ở đây.
          const bidders = this.status>=200 && this.status<300 ? bidOpeningRows(this.responseURL || this.__br.url, data) : null;
          if (bidders) {
            post('BBMT_BIDDERS', { url: this.__br.pageUrl, rows: bidders, status: this.status,
              kind: bidOpeningKind(this.responseURL || this.__br.url, data) });
          }
          publishOpeningMetadata(this.responseURL || this.__br.url, this.__br.pageUrl, this.status, data);
          publishKhlcntDetail(this.responseURL || this.__br.url, this.__br.pageUrl, this.status, data);
          // Danh sách tệp đính kèm của gói đang xem. Chuyển nguyên phản hồi về
          // cho tầng nền bóc tách (lib/attachments.js) — tệp này không tự đoán
          // tên trường của e-GP.
          if (isAttachmentUrl(this.__br.url) && data) {
            post('EGP_ATTACHMENTS', { url: location.href, payload: data });
          }
          // Dữ liệu của một lượt tra cứu KQLCNT đi theo luồng riêng, không đổ
          // vào kho gói thầu để hai tính năng không lẫn dữ liệu của nhau.
          recordEndpoint(this.__br.url, this.__br.method, this.status, data);
          if (!this.__brKqlcnt && !isExactEgpEndpoint(this.responseURL || this.__br.url,KHLCNT_DETAIL_ENDPOINTS) && data && hasRelevant(data)) {
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
  function nativePageIndex(body){
    try{
      const value=JSON.parse(body)?.[0]?.pageNumber;
      return value!==null&&value!==undefined&&value!==''&&Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;
    }catch{return null;}
  }

  function refineKqlcntBody(url, method, rawBody) {
    if (!kqlcntPlan || !kqlcntPlan.query || !rawBody) return null;
    if (!isSearchRequest(url, method) || !validQuery(kqlcntPlan.query)) return null;
    if (typeof rawBody !== 'string' || rawBody.length > MAX_ENVELOPE_CHARS) return null;

    let parsed;
    try { parsed = JSON.parse(rawBody); } catch { return null; }
    if (!Array.isArray(parsed) || parsed.length !== 1 || !isPlainObject(parsed[0])) return null;

    const envelope = { ...parsed[0], query: [kqlcntPlan.query] };
    envelope.pageSize = String(kqlcntPlan.pageSize);
    return JSON.stringify([envelope]);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== CONTENT_SOURCE) return;

    // content.js hỏi trang có đang bận không, trước khi gửi tiêu chí.
    if (event.data.type === 'EGP_ACTIVITY_PROBE') {
      post('EGP_SEARCH_ACTIVITY', { inFlight: searchesInFlight });
      return;
    }
    // Bật/tắt chế độ tinh chỉnh tiêu chí cho lượt tra cứu KQLCNT.
    if (event.data.type === 'KQLCNT_PLAN') {
      const plan = event.data.payload || null;
      kqlcntPlan = plan === null ? null : validatedPlan(plan);
      post('KQLCNT_PLAN_ACK', { planId: kqlcntPlan ? kqlcntPlan.id : null, queryIndex:kqlcntPlan?.queryIndex??0, accepted: plan === null || Boolean(kqlcntPlan) });
    }
  });

  post('HOOK_READY', { url: location.href });
})();
