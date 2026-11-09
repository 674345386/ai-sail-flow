/* Isolated design prototypes. These controls never call generation services. */
const variant = document.documentElement.dataset.variant || 'a';
const icons = {
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  down: '<path d="m7 10 5 5 5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="m9 5 11 7-11 7z"/>',
  pause: '<path d="M9 5v14M16 5v14"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-5-5L4 21"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
const svg = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const copy = {
  a: { title: '好创意，从一句话开始。', sub: '描述你的想法，让 AI-Sail Flow 帮你完成下一支作品。', placeholder: '描述你想创作的内容，例如：为我的香水制作一支有电影感的夏日广告…', cta: '开始创作' },
  b: { title: '让想法，自由发生。', sub: '从第一个灵感，到走向全球的创意。', placeholder: '告诉我，你想创造什么？', cta: '让灵感成真' },
  c: { title: '从这里，开始下一幕。', sub: '', placeholder: '今天，想创作什么？', cta: '开始创作' },
}[variant];
const models = window.CAPY_MODELS;
const modelStrip = () => `<div class="model-marquee" role="region" aria-label="模型展示，来自 CapyAI 参考页面" tabindex="0"><div class="model-track">${[false, true].map(duplicate => `<div class="model-group" ${duplicate ? 'aria-hidden="true"' : 'role="list"'}>${models.map(m => `<span class="model-item" ${duplicate ? '' : 'role="listitem"'}><img class="model-logo ${m.icon === 'openai' || m.icon === 'grok' ? 'mono-logo' : ''}" src="assets/icons/${m.icon}.svg" width="25" height="25" alt=""><span>${m.label}</span></span>`).join('')}</div>`).join('')}</div></div>`;
const composer = () => `<form class="composer" aria-label="创意输入" novalidate>
  <div class="attachments" aria-live="polite"></div>
  <label class="sr-only" for="creative-prompt">描述你的创作想法</label>
  <textarea id="creative-prompt" name="prompt" rows="3" maxlength="6000" placeholder="${copy.placeholder}" required></textarea>
  <div class="composer-toolbar">
    <div class="composer-tools">
      <button type="button" class="icon-button attach-button" title="添加参考图片或视频" aria-label="添加参考图片或视频">${svg('plus', 22)}</button>
      <input type="file" class="file-input" accept="image/*,video/*" multiple hidden>
      <div class="creation-modes" role="group" aria-label="创作类型"><button type="button" class="mode-button is-active" data-mode="视频" aria-pressed="true">${svg('film', 16)}<span>视频</span></button><button type="button" class="mode-button" data-mode="图片" aria-pressed="false">${svg('image', 16)}<span>图片</span></button></div>
      <span class="toolbar-divider" aria-hidden="true"></span>
      <label class="model-select"><img src="assets/icons/seedance.svg" alt="" width="18" height="18"><select name="model" aria-label="选择创作模型"><optgroup label="视频"><option>Seedance 2.0</option><option>Veo 3.1</option><option>Omni Flash</option></optgroup><optgroup label="图片">${models.map(m => `<option>${m.label}</option>`).join('')}</optgroup></select>${svg('down', 14)}</label>
    </div>
    <button type="submit" class="submit-button"><span>${copy.cta}</span>${svg('arrow', 20)}</button>
  </div>
</form>`;
const film = () => `<section class="film-section" id="overview" aria-labelledby="film-title">
  <div class="film-stage">
    <div class="film-media" aria-hidden="true"><img src="assets/hero-poster.jpg" width="1920" height="1080" alt="" loading="lazy"><video muted loop playsinline preload="none" poster="assets/hero-poster.jpg" data-src="assets/hero.mp4"></video></div>
    <div class="film-scrim" aria-hidden="true"></div>
    <div class="film-copy"><p class="film-kicker">为电商出海而创作</p><h2 id="film-title">AI-Sail Flow</h2><p class="film-description">您的专属 AI 出海创意视频工作室，<br>从真实视频与市场洞察出发，让好创意走向全球。</p><div class="film-actions"><button type="button" class="film-primary" data-action="create">自动制作视频${svg('arrow', 17)}</button><button type="button" class="film-secondary" data-action="create">进入 AI-Sail Flow 制作${svg('arrow', 17)}</button></div></div>
    <button class="film-play icon-button" type="button" aria-label="播放介绍视频">${svg('play', 17)}</button>
  </div>
</section>`;
document.getElementById('app').innerHTML = `
<header class="site-header">
  <a class="brand" href="#create" aria-label="AI-Sail Flow 首页"><img src="assets/brand.svg" alt="" width="29" height="29"><span>AI-Sail Flow</span></a>
  <nav class="main-nav" aria-label="主导航"><a class="nav-active" href="#create">创作</a><a href="#overview">Studio mode</a><a href="#create" data-focus>Agent mode</a><a href="#overview">探索 Flow</a><a href="#overview">价格</a></nav>
  <div class="header-actions"><button type="button" class="language-button" aria-label="当前语言：中文">${svg('globe', 15)}<span>中文</span>${svg('down', 12)}</button><button type="button" class="login-button" data-demo="登录">登录${svg('arrow', 15)}</button></div>
</header>
<main>
  <section class="prompt-hero" id="create" aria-label="AI 创作入口">
    <div class="hero-body">
      ${variant === 'a' ? modelStrip() : ''}
      ${variant !== 'c' ? `<div class="hero-heading"><h1>${copy.title}</h1><p>${copy.sub}</p></div>` : '<h1 class="sr-only">从这里，开始下一幕。</h1>'}
      ${variant === 'c' ? '<div class="c-editor-caption"><span>每个好作品，都从一个想法开始。</span><span class="live-indicator"><i></i>AI-Sail Flow</span></div>' : ''}
      ${composer()}
      ${variant !== 'a' ? modelStrip() : ''}
    </div>
    <a class="scroll-cue" href="#overview"><span>认识 AI-Sail Flow</span>${svg('arrow', 15)}</a>
  </section>
  ${film()}
</main>
<footer class="site-footer"><a class="brand" href="#create"><img src="assets/brand.svg" alt="" width="24" height="24"><span>AI-Sail Flow</span></a><span>让好创意，走向全球。</span><a href="#create">回到创作${svg('arrow', 14)}</a></footer>
<div class="toast" role="status" aria-live="polite"></div>`;

const prompt = document.getElementById('creative-prompt');
const form = document.querySelector('.composer');
const select = form.querySelector('select');
const imageOption = 'GPT Image 2.6 Flare';
let mode = '视频';
let lastVideoModel = 'Seedance 2.0';
let lastImageModel = imageOption;
const isImageModel = value => models.some(m => m.label === value);
function setMode(nextMode) {
  mode = nextMode;
  form.querySelectorAll('.mode-button').forEach(b => { const active = b.dataset.mode === mode; b.classList.toggle('is-active', active); b.setAttribute('aria-pressed', String(active)); });
}
form.querySelectorAll('.mode-button').forEach(button => button.addEventListener('click', () => {
  if (mode === '视频') lastVideoModel = select.value; else lastImageModel = select.value;
  setMode(button.dataset.mode);
  select.value = mode === '视频' ? lastVideoModel : lastImageModel;
  updateModelIcon();
}));
function updateModelIcon() {
  const item = models.find(m => m.label === select.value);
  const icon = item?.icon || (select.value === 'Seedance 2.0' ? 'seedance' : 'gemini');
  const img = form.querySelector('.model-select img');
  img.src = `assets/icons/${icon}.svg`;
  img.classList.toggle('mono-logo', ['openai', 'grok'].includes(icon));
}
select.addEventListener('change', () => { setMode(isImageModel(select.value) ? '图片' : '视频'); updateModelIcon(); });
let toastTimer;
function toast(message) {
  const target = document.querySelector('.toast');
  target.textContent = message; target.classList.add('is-visible');
  window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => target.classList.remove('is-visible'), 3600);
}
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!prompt.value.trim()) { prompt.setAttribute('aria-invalid', 'true'); prompt.focus(); toast('先写下你的想法，再开始创作。'); return; }
  prompt.removeAttribute('aria-invalid');
  const button = form.querySelector('.submit-button');
  button.innerHTML = `<span>创意已准备好</span>${svg('check', 20)}`;
  toast('交互预览：已保留这段创意，未发起生成任务。');
  window.setTimeout(() => { button.innerHTML = `<span>${copy.cta}</span>${svg('arrow', 20)}`; }, 2200);
});
prompt.addEventListener('input', () => prompt.removeAttribute('aria-invalid'));
prompt.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } });
const fileInput = form.querySelector('.file-input');
form.querySelector('.attach-button').addEventListener('click', () => fileInput.click());
const uploadUrls = new Set();
fileInput.addEventListener('change', () => {
  const target = form.querySelector('.attachments');
  [...fileInput.files].slice(0, 5 - target.children.length).forEach(file => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;
    const url = URL.createObjectURL(file); uploadUrls.add(url);
    const chip = document.createElement('span'); chip.className = 'attachment-chip';
    if (file.type.startsWith('image/')) { const img = document.createElement('img'); img.src = url; img.alt = ''; chip.append(img); }
    else chip.insertAdjacentHTML('beforeend', svg('film', 16));
    const label = document.createElement('span'); label.textContent = file.name; chip.append(label);
    const remove = document.createElement('button'); remove.type = 'button'; remove.setAttribute('aria-label', `移除 ${file.name}`); remove.innerHTML = svg('close', 13);
    remove.addEventListener('click', () => { URL.revokeObjectURL(url); uploadUrls.delete(url); chip.remove(); });
    chip.append(remove); target.append(chip);
  });
  if (fileInput.files.length > 5) toast('预览最多添加 5 个参考素材。');
  fileInput.value = ''; prompt.focus();
});
window.addEventListener('pagehide', () => uploadUrls.forEach(url => URL.revokeObjectURL(url)));
document.querySelectorAll('[data-action="create"], [data-focus]').forEach(button => button.addEventListener('click', () => { document.getElementById('create').scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth' }); window.setTimeout(() => prompt.focus({ preventScroll: true }), reduced.matches ? 0 : 450); }));
document.querySelectorAll('[data-demo]').forEach(button => button.addEventListener('click', () => toast('当前为设计预览，登录会在正式页面中使用。')));
document.querySelector('.language-button').addEventListener('click', () => toast('当前展示中文版设计。'));

const video = document.querySelector('.film-media video');
const playButton = document.querySelector('.film-play');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let videoVisible = false;
let manuallyPaused = false;
let videoFailed = false;
function syncVideo() {
  if (videoFailed) return;
  if (videoVisible && !document.hidden && !manuallyPaused && !reduced.matches) {
    if (!video.getAttribute('src')) video.src = video.dataset.src;
    video.play().catch(() => {});
  } else video.pause();
}
const observer = new IntersectionObserver(([entry]) => { videoVisible = entry.isIntersecting && entry.intersectionRatio >= .2; syncVideo(); }, { threshold: .2 });
observer.observe(video);
document.addEventListener('visibilitychange', syncVideo);
reduced.addEventListener('change', syncVideo);
video.addEventListener('play', () => { playButton.innerHTML = svg('pause', 17); playButton.setAttribute('aria-label', '暂停介绍视频'); });
video.addEventListener('pause', () => { playButton.innerHTML = svg('play', 17); playButton.setAttribute('aria-label', '播放介绍视频'); });
video.addEventListener('error', () => { videoFailed = true; video.style.display = 'none'; toast('视频暂时无法播放，请稍后重试。'); });
playButton.addEventListener('click', () => {
  if (video.paused) { manuallyPaused = false; videoFailed = false; video.style.display = ''; if (!video.getAttribute('src')) video.src = video.dataset.src; video.play().catch(() => toast('视频暂时无法播放，请稍后重试。')); }
  else { manuallyPaused = true; video.pause(); }
});

if (new URLSearchParams(location.search).has('thumb')) { document.documentElement.classList.add('thumbnail-mode'); video.removeAttribute('data-src'); observer.disconnect(); }
