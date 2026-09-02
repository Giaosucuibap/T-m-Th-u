/* Giáo Sư Cùi Bắp — onboarding.js
 *
 * Tách ra khỏi onboarding.html vì Manifest V3 áp CSP mặc định
 * `script-src 'self'` cho trang tiện ích: script viết thẳng trong HTML
 * KHÔNG chạy. Nút "Mở e-GP để tạo bộ lọc" trước đây là script inline nên
 * bấm không có phản ứng gì.
 */
document.getElementById('open').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_EGP' });
});
