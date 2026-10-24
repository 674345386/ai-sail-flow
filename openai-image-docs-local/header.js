(() => {
  const header = document.querySelector('.ip-site-header');
  if (!header) return;
  const menus = Array.from(header.querySelectorAll('details'));
  const mobile = header.querySelector('#ip-head-mobile');
  const mobileButton = header.querySelector('.ip-head-mobile-toggle');
  const closeMenus = () => menus.forEach(menu => { menu.open = false; });
  menus.forEach(menu => menu.addEventListener('toggle', () => {
    if (menu.open) menus.forEach(other => { if (other !== menu) other.open = false; });
  }));
  document.addEventListener('click', event => { if (!header.contains(event.target)) closeMenus(); });
  const closeMobile = () => { mobile.hidden = true; mobileButton.setAttribute('aria-expanded', 'false'); };
  mobileButton.addEventListener('click', () => {
    mobile.hidden = !mobile.hidden;
    mobileButton.setAttribute('aria-expanded', String(!mobile.hidden));
  });
  matchMedia('(min-width:1200px)').addEventListener('change', event => { if (event.matches) closeMobile(); });
  const dialog = document.getElementById('ip-head-search-dialog');
  const input = document.getElementById('ip-head-search-input');
  const results = dialog.querySelector('.ip-head-search-results');
  const entries = Array.from(document.querySelectorAll('main h1,main h2,main h3')).map((heading, index) => {
    if (!heading.id) heading.id = 'home-section-' + index;
    return { title: heading.textContent.trim(), href: '#' + heading.id };
  });
  entries.unshift({ title: 'Image generation — API documentation', href: '/api/docs/guides/image-generation' });
  entries.unshift({ title: 'Blog', href: '/blog/' }, { title: 'Product', href: '/product/' }, { title: 'Developers', href: '/developers/' });
  const render = () => {
    const query = input.value.trim().toLowerCase(); results.replaceChildren();
    for (const entry of entries.filter(entry => !query || entry.title.toLowerCase().includes(query)).slice(0, 12)) {
      const link = document.createElement('a'); link.href = entry.href; link.textContent = entry.title;
      link.addEventListener('click', () => dialog.close()); results.append(link);
    }
    if (!results.children.length) { const p = document.createElement('p'); p.textContent = 'No results. Try another keyword.'; results.append(p); }
  };
  const openSearch = () => { closeMenus(); closeMobile(); render(); if (!dialog.open) dialog.showModal(); input.focus(); };
  header.querySelectorAll('[data-ip-search]').forEach(button => button.addEventListener('click', openSearch));
  input.addEventListener('input', render);
  dialog.querySelector('.ip-head-search-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    if (event.key === 'Escape') { closeMenus(); closeMobile(); }
  });
})();
