/* Giáo Sư Cùi Bắp — mobile/iphone.js
 *
 * Tách khỏi iphone.html vì trang này được mở bằng chrome.runtime.getURL(),
 * tức là trang tiện ích, tức là dính CSP `script-src 'self'` của Manifest V3:
 * script viết thẳng trong HTML không chạy. Nút "Sao chép" trước đây chết câm.
 */
document.getElementById('btn').addEventListener('click', async () => {
  const t = document.getElementById('code');
  const m = document.getElementById('msg');
  try {
    await navigator.clipboard.writeText(t.value);
    m.textContent = '✅ Đã sao chép. Giờ dán vào ô địa chỉ của dấu trang.';
  } catch {
    t.focus();
    t.setSelectionRange(0, t.value.length);
    m.textContent = 'Hãy giữ và chọn Sao chép thủ công.';
  }
});
