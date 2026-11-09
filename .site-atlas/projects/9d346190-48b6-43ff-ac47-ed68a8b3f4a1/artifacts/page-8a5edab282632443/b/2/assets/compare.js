const names = { a: '暖白留白', b: '灵感光场', c: '专注画布' };
const storageKey = 'ai-sail-flow:landing-prompt-choice:2026-11-08';
const comparison = document.getElementById('comparison');
const fullPreview = document.querySelector('.full-preview');
const frame = document.getElementById('full-frame');
const backButton = document.querySelector('.back-button');
let current = 'a';
let selected = null;
let toastTimeout;
function toast(message) {
  const node = document.querySelector('.review-toast');
  node.textContent = message; node.classList.add('is-visible');
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => node.classList.remove('is-visible'), 3500);
}
function refreshSelection() {
  document.querySelectorAll('.option').forEach(option => {
    const active = option.dataset.key === selected;
    option.classList.toggle('is-selected', active);
    option.querySelector('[data-select]').textContent = active ? `已选 ${selected.toUpperCase()}` : `选择 ${option.dataset.key.toUpperCase()}`;
  });
  const status = document.querySelector('.saved-choice');
  status.classList.toggle('has-choice', Boolean(selected));
  status.textContent = selected ? `已选择 ${selected.toUpperCase()} · ${names[selected]}` : '尚未选择方案';
  document.querySelector('.choose-current').textContent = selected === current ? `已选 ${current.toUpperCase()} · 可重新选择` : `选择方案 ${current.toUpperCase()}`;
}
async function choose(key) {
  const buttons = [...document.querySelectorAll('[data-select],.choose-current')];
  buttons.forEach(b => b.disabled = true);
  try {
    const response = await fetch('/api/selection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
    if (!response.ok) throw new Error('save-failed');
    selected = key;
    try { localStorage.setItem(storageKey, key); } catch {}
    refreshSelection();
    toast(`已保存：${key.toUpperCase()} · ${names[key]}。你可以在对话中继续提出修改。`);
  } catch {
    selected = key;
    let stored = false;
    try { localStorage.setItem(storageKey, key); stored = true; } catch {}
    refreshSelection();
    toast(stored ? `已在本浏览器记住 ${key.toUpperCase()}。请在对话中告知选定方案。` : `已选 ${key.toUpperCase()}，请在对话中告知选定方案。`);
  } finally { buttons.forEach(b => b.disabled = false); }
}
function openVariant(key, updateHash = true) {
  if (!names[key]) return;
  current = key;
  comparison.hidden = true; fullPreview.hidden = false; backButton.hidden = false;
  document.querySelector('.review-scope').hidden = true;
  document.querySelectorAll('[data-switch]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.switch === key)));
  frame.src = `${key}.html`;
  document.querySelector('.standalone').href = `${key}.html`;
  if (updateHash) history.replaceState(null, '', `#${key}`);
  refreshSelection();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function closePreview() {
  comparison.hidden = false; fullPreview.hidden = true; backButton.hidden = true;
  document.querySelector('.review-scope').hidden = false;
  frame.src = 'about:blank';
  history.replaceState(null, '', location.pathname + location.search);
}
document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openVariant(b.dataset.open)));
document.querySelectorAll('[data-switch]').forEach(b => b.addEventListener('click', () => openVariant(b.dataset.switch)));
document.querySelectorAll('[data-select]').forEach(b => b.addEventListener('click', () => choose(b.dataset.select)));
document.querySelector('.choose-current').addEventListener('click', () => choose(current));
backButton.addEventListener('click', closePreview);
document.querySelectorAll('[data-size]').forEach(b => b.addEventListener('click', () => {
  document.querySelector('.preview-stage').classList.toggle('is-mobile', b.dataset.size === 'mobile');
  document.querySelectorAll('[data-size]').forEach(other => other.setAttribute('aria-pressed', String(b === other)));
}));
document.querySelector('.variant-tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const keys = ['a', 'b', 'c'];
  const index = (keys.indexOf(current) + (event.key === 'ArrowRight' ? 1 : -1) + 3) % 3;
  openVariant(keys[index]); document.querySelector(`[data-switch="${keys[index]}"]`).focus();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !fullPreview.hidden) closePreview(); });
const thumbObserver = new ResizeObserver(entries => entries.forEach(entry => entry.target.style.setProperty('--thumb-scale', String(entry.contentRect.width / 1440))));
document.querySelectorAll('.thumbnail').forEach(node => thumbObserver.observe(node));
try { const saved = localStorage.getItem(storageKey); if (names[saved]) selected = saved; } catch {}
refreshSelection();
fetch('/api/selection').then(response => response.ok ? response.json() : null).then(data => { if (data?.key && names[data.key]) { selected = data.key; refreshSelection(); } }).catch(() => {});
const initial = location.hash.slice(1);
if (names[initial]) openVariant(initial, false);
window.addEventListener('hashchange', () => { const key = location.hash.slice(1); if (names[key]) openVariant(key, false); else closePreview(); });
