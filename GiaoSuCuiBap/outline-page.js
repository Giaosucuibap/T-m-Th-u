const key = new URLSearchParams(location.search).get('key') || '';
const r = await chrome.runtime.sendMessage({ type: 'METHOD_OUTLINE', payload: { key } });
const o = r?.outline || { title: 'Chưa chọn gói', sections: [], disclaimer: '' };
document.getElementById('title').textContent = o.title;
document.getElementById('disc').textContent = o.disclaimer || '';
document.getElementById('sections').innerHTML = (o.sections || []).map((s) => `<li>${s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</li>`).join('');
document.getElementById('docx').onclick = () => chrome.runtime.sendMessage({ type: 'EXPORT_OUTLINE_DOCX', payload: { key } });
