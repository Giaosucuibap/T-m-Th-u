/* LỆNH ĐIỀU HƯỚNG (tách khỏi background.js ở 4.19.0): mở các trang của tiện ích
   và mở e-GP. Dữ liệu hoá thành bảng — thêm trang mới là thêm một dòng. */
export const PAGE_COMMANDS = Object.freeze({
  OPEN_DASHBOARD: 'dashboard.html', OPEN_CONTRACTORS: 'contractors.html', OPEN_WINNERS: 'winners.html', OPEN_PROFILE: 'profile.html',
  OPEN_INVESTOR: 'investor.html', OPEN_AREA: 'market.html', OPEN_SEARCH: 'search.html', OPEN_PLANS: 'plans.html',
  OPEN_IPHONE: 'mobile/iphone.html', OPEN_ANALYTICS: 'analytics.html', OPEN_BID_OPEN: 'bidopen.html'
});

export function navigationHandlers({ tabs, runtime, getState, isEgpUrl, defaultEgpUrl }) {
  const map = {};
  for (const [type, page] of Object.entries(PAGE_COMMANDS)) map[type] = async () => { await tabs.create({ url: runtime.getURL(page) }); return { ok: true }; };
  map.OPEN_OPTIONS = async () => { await runtime.openOptionsPage(); return { ok: true }; };
  // Chỉ mở địa chỉ e-GP chính thức; mẫu tìm kiếm hỏng thì về trang tra cứu mặc định.
  map.OPEN_EGP = async () => { const s = await getState(); const url = s.template?.sourcePageUrl; await tabs.create({ url: isEgpUrl(url) ? url : defaultEgpUrl }); return { ok: true }; };
  return map;
}
