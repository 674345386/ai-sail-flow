import { compositions, compositionSVG } from './compositions.js';

const storageKey = 'sail-landing-composition-selection-v1';
let selected = new Set();
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(saved)) selected = new Set(saved.filter(id => compositions.some(frame => frame.id === id)));
} catch { /* Selection still works when storage is unavailable. */ }

const gallery = document.querySelector('#gallery');
const output = document.querySelector('#selection');
const copyButton = document.querySelector('#copy-selection');
const status = document.querySelector('#copy-status');
const guidesInput = document.querySelector('#guides');
const copyInput = document.querySelector('#copy-preview');

gallery.innerHTML = compositions.map(frame => `
  <article class="composition" data-id="${frame.id}" aria-labelledby="title-${frame.id}">
    <button class="frame" type="button" aria-label="放大 ${frame.id} ${frame.name}" aria-expanded="false">
      ${compositionSVG(frame)}
    </button>
    <div class="composition-topline">
      <h2 id="title-${frame.id}"><span>${frame.id}</span>${frame.name}</h2>
      <button class="choose" type="button" aria-label="选择 ${frame.id} ${frame.name}" aria-pressed="false">选此方向</button>
    </div>
    <p class="composition-description">${frame.description}</p>
    <div class="details"><span>建议镜头 ${frame.lens}</span><span>${frame.scale}</span><span>${frame.space}</span><a href="./${frame.id}.svg" download="${frame.id}-${frame.name}-构图白模.svg">下载白模</a></div>
  </article>`).join('');

function syncSelection() {
  const chosen = compositions.filter(frame => selected.has(frame.id));
  output.textContent = chosen.length ? chosen.map(frame => `${frame.id} ${frame.name}`).join('、') : '尚未选择';
  copyButton.disabled = !chosen.length;
  gallery.querySelectorAll('.composition').forEach(article => {
    const active = selected.has(article.dataset.id);
    article.classList.toggle('is-selected', active);
    const button = article.querySelector('.choose');
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? '已选 · 取消' : '选此方向';
  });
  try { localStorage.setItem(storageKey, JSON.stringify([...selected])); } catch { /* Optional persistence. */ }
}

function syncFrames() {
  for (const frame of compositions) {
    gallery.querySelector(`[data-id="${frame.id}"] .frame`).innerHTML = compositionSVG(frame, {
      guides: guidesInput.checked, copy: copyInput.checked,
    });
  }
}

gallery.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  const article = target?.closest('.composition');
  if (!article) return;
  if (target.closest('.choose')) {
    const id = article.dataset.id;
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    status.textContent = '';
    syncSelection();
  } else if (target.closest('.frame')) {
    const expanded = article.classList.toggle('is-expanded');
    const frame = compositions.find(item => item.id === article.dataset.id);
    const button = article.querySelector('.frame');
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', `${expanded ? '还原' : '放大'} ${frame.id} ${frame.name}`);
    if (expanded) article.scrollIntoView({ block: 'start' });
  }
});

guidesInput.addEventListener('change', syncFrames);
copyInput.addEventListener('change', syncFrames);

copyButton.addEventListener('click', async () => {
  const chosen = compositions.filter(frame => selected.has(frame.id));
  const text = `我选择远景构图：${chosen.map(frame => `${frame.id} ${frame.name}`).join('、')}。请先保持构图与主体比例，下一步做同一构图的两种光线版本。`;
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = '已复制，粘贴到聊天即可';
  } catch {
    status.textContent = '请直接将已选编号发到聊天';
    output.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(output);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
});

syncSelection();
