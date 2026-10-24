(async () => {
  const docs = '/api/docs/guides/image-generation';
  const poster = document.getElementById('ip-hero-poster');
  if (poster) {
    const video = document.createElement('video');
    video.className = 'ip-hero-video';
    video.src = '/home-assets/hero.mp4';
    video.poster = poster.src;
    video.muted = true; video.loop = true; video.playsInline = true;
    video.autoplay = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    video.preload = 'metadata';
    video.setAttribute('aria-hidden', 'true');
    poster.after(video);
    const control = document.createElement('button');
    control.className = 'ip-video-toggle';
    control.type = 'button';
    const update = () => {
      control.textContent = video.paused ? '▶' : 'Ⅱ';
      control.setAttribute('aria-label', video.paused ? 'Play background video' : 'Pause background video');
    };
    control.addEventListener('click', () => { video.paused ? video.play().catch(() => {}) : video.pause(); });
    video.addEventListener('play', update); video.addEventListener('pause', update);
    video.addEventListener('error', () => { video.hidden = true; control.hidden = true; });
    poster.parentElement.append(control);
    update();
  }

  // Content and media for these panels come from the reference's actual data.
  const platformButtons = Array.from(document.querySelectorAll('button[aria-current]'));
  const panelFrame = document.querySelector('[role="tabpanel"]')?.closest('[class*="rounded-2xl"]');
  const panelHost = panelFrame?.parentElement;
  const template = panelFrame?.cloneNode(true);
  const make = (tag, className = '', text = '') => {
    const element = document.createElement(tag); element.className = className; element.textContent = text; return element;
  };
  const bindTabs = (tabs, onSelect) => {
    tabs.forEach((tab, index) => {
      const select = () => {
        tabs.forEach(t => {
          const selected = t === tab;
          t.setAttribute('aria-selected', String(selected));
          t.tabIndex = selected ? 0 : -1;
          (t.firstElementChild || t).style.opacity = selected ? '1' : '.35';
        });
        onSelect(index, tab);
      };
      tab.addEventListener('click', select);
      tab.addEventListener('keydown', event => {
        const delta = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0;
        if (delta) { event.preventDefault(); const next = tabs[(index + delta + tabs.length) % tabs.length]; next.click(); next.focus(); }
        if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); const next = tabs[event.key === 'Home' ? 0 : tabs.length - 1]; next.click(); next.focus(); }
      });
    });
    tabs[0]?.click();
  };
  let data;
  try { data = await fetch('/home-assets/showcase.json').then(response => response.json()); }
  catch { /* Keep the complete initial server-rendered panel if data is unavailable. */ }
  if (data && panelHost && template) {
    const creative = () => {
      const frame = template.cloneNode(true);
      panelHost.replaceChildren(frame);
      const panel = frame.querySelector('[role="tabpanel"]');
      bindTabs(Array.from(frame.querySelectorAll('[role="tab"]')), (index, tab) => {
        const item = data.creative[index];
        panel.id = tab.getAttribute('aria-controls');
        panel.setAttribute('aria-labelledby', tab.id);
        const image = make('img', 'ip-showcase-image');
        image.src = item.poster; image.alt = item.label;
        panel.replaceChildren(image);
      });
    };
    const dev = () => {
      const frame = make('div', 'overflow-hidden rounded-2xl bg-offBlack p-8 text-white lg:p-14');
      const tablist = make('div', 'flex flex-wrap items-baseline gap-x-6 gap-y-2');
      tablist.setAttribute('role', 'tablist');
      tablist.setAttribute('aria-label', data.homepage.devSectionEyebrow);
      const body = make('div'); body.setAttribute('role', 'tabpanel');
      const keys = ['workflows', 'recipes', 'characters'];
      keys.forEach((key, index) => {
        const button = make('button', 'rw-h4 cursor-pointer', ['Workflows', 'Recipes', 'Characters'][index]);
        button.type = 'button'; button.id = 'dev-tab-' + key;
        button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'dev-panel-' + key);
        tablist.append(button);
      });
      frame.append(tablist, body); panelHost.replaceChildren(frame);
      bindTabs(Array.from(tablist.children), (index, tab) => {
        const key = keys[index];
        body.id = 'dev-panel-' + key; body.setAttribute('aria-labelledby', tab.id); body.replaceChildren();
        const description = data.homepage[['devSectionDescription', 'devTabRecipesDesc', 'devTabCharactersDesc'][index]];
        if (key === 'recipes') {
          body.append(make('p', 'mt-10 max-w-xl rw-bodycopy1', description));
          const grid = make('div', 'grid grid-cols-1 gap-4 mt-8 md:grid-cols-3');
          data.recipes.forEach(recipe => {
            const a = make('a', 'block rounded-xl bg-white/5 p-3 hover:bg-white/10'); a.href = docs;
            const image = make('img', 'aspect-video w-full object-cover rounded-lg'); image.src = recipe.poster; image.alt = recipe.title; image.loading = 'lazy';
            a.append(image, make('h4', 'mt-3 rw-bodycopy2', recipe.title), make('p', 'mt-2 text-darkGray rw-bodycopy3', data.homepage[recipe.descriptionKey])); grid.append(a);
          });
          body.append(grid);
        } else {
          const row = make('div', 'ip-dev-grid gap-10 mt-10');
          const copy = make('div'); copy.append(make('p', 'rw-bodycopy1', description));
          if (key === 'workflows') {
            const list = make('ul', 'mt-10');
            [data.homepage.devBullet1, data.homepage.devBullet2].forEach(text => list.append(make('li', 'border-t border-white/15 py-4 rw-bodycopy3', text)));
            copy.append(list);
          }
          const link = make('a', 'inline-block mt-8 text-sm hover:underline', 'View documentation ↗'); link.href = docs; copy.append(link);
          const video = make('video', 'aspect-square w-full rounded-xl object-cover');
          video.src = data.devVideos[key]; video.muted = true; video.loop = true; video.playsInline = true; video.controls = true; video.preload = 'metadata';
          video.autoplay = !matchMedia('(prefers-reduced-motion: reduce)').matches;
          row.append(copy, video); body.append(row);
        }
      });
    };
    const robotics = () => {
      const r = data.robotics;
      const frame = make('div', 'rounded-2xl border border-black/10 bg-white p-8 lg:p-14');
      frame.append(make('p', 'mb-2 text-sm text-darkGrayAlt', r.platformEyebrow));
      const intro = make('div', 'ip-robotics-intro gap-6 mb-10');
      intro.append(make('h2', 'text-[36px] leading-none tracking-tight', r.toolkitHeading), make('p', 'text-[18px] leading-tight text-darkText', r.toolkitIntro));
      const grid = make('div', 'grid grid-cols-1 gap-6 md:grid-cols-2');
      const paths = ['/product/robotics/policy-model', '/model-licensing', '/product/robotics/policy-evaluation', '/product/robotics/data-augmentation'];
      ['policyModel', 'videoLicensing', 'policyEval', 'dataAug'].forEach((key, index) => {
        const a = make('a', 'block rounded-lg border border-lightGray bg-white p-6 lg:p-8 hover:bg-offWhiteAlt'); a.href = 'https://runway.com' + paths[index];
        a.append(make('h3', 'text-2xl leading-none mb-3', r[key + 'Title']), make('p', 'text-[16px] leading-tight text-darkText mb-6', r[key + 'Desc']), make('span', 'text-sm', 'Learn more ↗')); grid.append(a);
      });
      frame.append(intro, grid); panelHost.replaceChildren(frame);
    };
    const renderers = [creative, dev, robotics];
    platformButtons.forEach((button, index) => button.addEventListener('click', () => {
      platformButtons.forEach(b => { b.setAttribute('aria-current', String(b === button)); b.firstElementChild.style.opacity = b === button ? '1' : '.5'; });
      renderers[index]?.();
    }));
    creative();
  }
  document.querySelector('[aria-label="Dismiss banner"]')?.addEventListener('click', event => {
    event.currentTarget.closest('[data-app-banner], .app-banner')?.remove();
  });
  const language = document.querySelector('[aria-label="Change language"]');
  language?.addEventListener('click', () => {
    const previous = document.querySelector('.ip-language-menu');
    if (previous) { previous.remove(); return; }
    const menu = document.createElement('nav');
    menu.className = 'ip-language-menu';
    menu.setAttribute('aria-label', 'Languages');
    for (const [label, path] of [['English', '/'], ['日本語', 'https://runway.com/ja'], ['한국어', 'https://runway.com/ko'], ['Français', 'https://runway.com/fr'], ['Português', 'https://runway.com/pt-br']]) {
      const a = document.createElement('a'); a.textContent = label; a.href = path; menu.append(a);
    }
    document.body.append(menu);
  });
})();
