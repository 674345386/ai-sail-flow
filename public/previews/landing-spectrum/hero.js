'use strict';

const variants = { a: '棱镜折射', b: '光谱地平线', c: '玻璃画框' };
const copy = {
  zh: { titleOne: '创作灵感，', titleTwo: '成为灵感', subtitle: '探索发现，让灵感先做一次实验', login: '登录', video: '视频', image: '图片', audio: '音频', start: '开始创作', overview: '认识 AI Creative Lab', promptLabel: '描述你的创作想法', placeholder: '描述你想创作的内容，例如：为我的香水制作一支有电影感的夏日广告…', drop: '松开以添加参考素材', draftTitle: '创作草稿已保存', draftNote: '这是首屏 HTML 预览。你可以复制创作描述，前往工作台继续创作。', copy: '复制创作描述', workspace: '前往工作台 ↗', empty: '先写下你的想法，或添加一份参考素材。', attachmentPrompt: '请查看附件中的参考素材，帮我继续创作。', files: '份参考素材', copied: '已复制创作描述。', copyError: '无法自动复制，可直接选中上方文字复制。', saved: '创作草稿已保存在此浏览器。', unavailable: '创作草稿已准备好，当前浏览器无法保存草稿。', fileError: '支持图片、视频和音频；最多 3 张图片、1 条视频和 1 个音频。图片最多 10 MB，视频最多 250 MB，音频最多 50 MB。', remove: '移除' },
  en: { titleOne: 'Create inspiration.', titleTwo: 'Become inspiration.', subtitle: 'Explore. Discover. Put inspiration to the test.', login: 'Sign in', video: 'Video', image: 'Image', audio: 'Audio', start: 'Start creating', overview: 'Meet AI Creative Lab', promptLabel: 'Describe your creative idea', placeholder: 'Describe what you want to create, e.g. a cinematic summer campaign for my perfume…', drop: 'Drop your references here', draftTitle: 'Your creative draft is saved', draftNote: 'This is an HTML hero preview. Copy your brief and continue in the workspace.', copy: 'Copy creative brief', workspace: 'Open workspace ↗', empty: 'Write down your idea or add a reference to begin.', attachmentPrompt: 'Please review the attached references and help me continue creating.', files: 'reference files', copied: 'Creative brief copied.', copyError: 'Select the brief above to copy it manually.', saved: 'Your draft is saved in this browser.', unavailable: 'Your draft is ready. This browser cannot store drafts.', fileError: 'Add up to 3 images (10 MB each), 1 video (250 MB), and 1 audio file (50 MB).', remove: 'Remove' }
};
let language = 'zh';
let references = [];
let dragDepth = 0;
const promptInput = document.querySelector('#creative-prompt');
const composer = document.querySelector('.composer');
const fileInput = document.querySelector('.file-input');
const attachments = document.querySelector('.attachments');
const status = document.querySelector('.composer-status');
const dialog = document.querySelector('.draft-dialog');
const storageKey = 'ai-creative-lab-spectrum-draft';
const t = () => copy[language];

function setVariant() {
  const value = location.hash.slice(1).toLowerCase();
  const variant = Object.hasOwn(variants, value) ? value : 'a';
  document.body.dataset.variant = variant;
  globalThis.labLightScene?.setVariant(variant);
  document.title = `${variants[variant]} · AI Creative Lab`;
  document.querySelector('.variant-caption').textContent = `${variant.toUpperCase()} / ${variants[variant]}`;
  for (const link of document.querySelectorAll('[data-variant-link]')) {
    if (link.dataset.variantLink === variant) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  }
}

function renderAttachments() {
  attachments.replaceChildren();
  attachments.hidden = references.length === 0;
  references.forEach((file, index) => {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = file.name;
    name.title = file.name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', `${t().remove} ${file.name}`);
    remove.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-x"></use></svg>';
    remove.addEventListener('click', () => { references.splice(index, 1); renderAttachments(); status.textContent = ''; });
    item.append(name, remove);
    attachments.append(item);
  });
}

function fileKind(file) {
  if (/^image\/(jpeg|png|webp)$/.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name)) return 'image';
  if (/^video\/(mp4|quicktime|webm)$/.test(file.type) || /\.(mp4|mov|webm)$/i.test(file.name)) return 'video';
  if (/^audio\//.test(file.type) || /\.(mp3|m4a|wav|aac|flac|ogg|opus)$/i.test(file.name)) return 'audio';
  return null;
}

function addFiles(incoming) {
  if (!incoming.length) return;
  const all = [...references];
  for (const file of incoming) {
    if (all.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) continue;
    all.push(file);
  }
  const counts = { image: 0, video: 0, audio: 0 };
  const limits = { image: 10, video: 250, audio: 50 };
  const valid = all.every(file => {
    const kind = fileKind(file);
    if (!kind || file.size > limits[kind] * 1024 * 1024) return false;
    counts[kind] += 1;
    return counts.image <= 3 && counts.video <= 1 && counts.audio <= 1;
  });
  if (!valid) { status.textContent = t().fileError; return; }
  references = all;
  renderAttachments();
  promptInput.removeAttribute('aria-invalid');
  status.textContent = '';
}

document.querySelector('.attach').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { addFiles([...fileInput.files]); fileInput.value = ''; });
composer.addEventListener('paste', event => {
  const files = [...(event.clipboardData?.files || [])];
  if (files.length) { if (!event.clipboardData.getData('text/plain')) event.preventDefault(); addFiles(files); }
});
composer.addEventListener('dragenter', event => {
  if (!event.dataTransfer.types.includes('Files')) return;
  event.preventDefault(); dragDepth++; composer.classList.add('is-dragging');
});
composer.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
composer.addEventListener('dragleave', event => { event.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) composer.classList.remove('is-dragging'); });
composer.addEventListener('drop', event => {
  if (!event.dataTransfer.files.length) return;
  event.preventDefault(); dragDepth = 0; composer.classList.remove('is-dragging'); addFiles([...event.dataTransfer.files]);
});
promptInput.addEventListener('input', () => { status.textContent = ''; promptInput.removeAttribute('aria-invalid'); });
promptInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); composer.requestSubmit(); }
});
composer.addEventListener('submit', event => {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt && !references.length) { status.textContent = t().empty; promptInput.setAttribute('aria-invalid', 'true'); promptInput.focus(); return; }
  const text = prompt || t().attachmentPrompt;
  let saved = false;
  try { localStorage.setItem(storageKey, JSON.stringify({ prompt, savedAt: new Date().toISOString() })); saved = true; } catch {}
  document.querySelector('#draft-title').textContent = saved ? t().draftTitle : (language === 'zh' ? '创作草稿已准备好' : 'Your creative draft is ready');
  document.querySelector('.draft-text').textContent = text;
  document.querySelector('.draft-files').textContent = references.length ? `${references.length} ${t().files} · ${references.map(file => file.name).join('、')}` : '';
  document.querySelector('.copy-status').textContent = '';
  status.textContent = saved ? t().saved : t().unavailable;
  dialog.showModal();
});
document.querySelector('.copy-prompt').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector('.draft-text').textContent);
    document.querySelector('.copy-status').textContent = t().copied;
  } catch {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('.draft-text'));
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    document.querySelector('.copy-status').textContent = t().copyError;
  }
});
dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
document.querySelector('.language').addEventListener('click', () => {
  language = language === 'zh' ? 'en' : 'zh';
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.body.dataset.language = language;
  document.querySelector('.pointer-hint').textContent = language === 'zh' ? '移动鼠标，探索光的折射' : 'Move your cursor. Explore the spectrum.';
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t()[element.dataset.i18n];
  promptInput.placeholder = t().placeholder;
  const languageButton = document.querySelector('.language');
  languageButton.innerHTML = language === 'zh' ? '中文 <span aria-hidden="true">/ EN</span>' : 'EN <span aria-hidden="true">/ 中文</span>';
  languageButton.setAttribute('aria-label', language === 'zh' ? 'Switch to English' : '切换到中文');
  languageButton.title = languageButton.getAttribute('aria-label');
  status.textContent = ''; renderAttachments();
});
window.addEventListener('hashchange', setVariant);
try { const saved = JSON.parse(localStorage.getItem(storageKey)); if (saved && typeof saved.prompt === 'string') promptInput.value = saved.prompt.slice(0, 6000); } catch {}
setVariant();
