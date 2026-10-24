/* Search the complete mirrored guide without a hosted search service. */
(() => {
  const content = document.querySelector('#mainContent') || document.querySelector('main');
  const sections = Array.from(content?.querySelectorAll('h1,h2,h3') || []).map(heading => {
    let sibling = heading.nextElementSibling;
    const parts = [];
    for (let i = 0; sibling && i < 3 && !/^H[123]$/.test(sibling.tagName); i++, sibling = sibling.nextElementSibling) parts.push(sibling.textContent.trim());
    return { title: heading.textContent.trim(), id: heading.id || heading.closest('[id]')?.id, text: parts.join(' ').replace(/\s+/g, ' ').slice(0, 450) };
  }).filter(item => item.id);

  document.addEventListener('click', async event => {
    const button = event.target.closest?.('[data-page-copy-action]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const label = button.querySelector('[data-page-copy-label]');
    const original = label?.textContent;
    try {
      await navigator.clipboard.writeText(content?.innerText || '');
      button.dataset.copied = 'true';
      if (label) label.textContent = 'Copied';
      setTimeout(() => {
        button.dataset.copied = 'false';
        if (label) label.textContent = original;
      }, 1400);
    } catch {
      if (label) label.textContent = 'Copy unavailable';
      setTimeout(() => { if (label) label.textContent = original; }, 1800);
    }
  }, true);

  document.querySelectorAll('[data-site-search-input]').forEach(input => {
    const box = document.createElement('div');
    box.className = 'local-search-results';
    box.setAttribute('role', 'list');
    const searchRoot = input.closest('[data-site-search-root]');
    const emptyState = searchRoot?.querySelector('[data-site-search-empty-state]');
    if (emptyState) emptyState.replaceWith(box);
    else searchRoot?.append(box);
    if (searchRoot) searchRoot.dataset.siteSearchProvider = 'local';
    const render = () => {
      const query = input.value.trim().toLowerCase();
      box.replaceChildren();
      const matches = (query ? sections.filter(item => (item.title + ' ' + item.text).toLowerCase().includes(query)) : sections).slice(0, 12);
      for (const item of matches) {
        const anchor = document.createElement('a');
        anchor.href = '#' + item.id;
        anchor.textContent = item.title;
        const excerpt = document.createElement('small');
        excerpt.textContent = item.text.slice(0, 130);
        anchor.append(excerpt);
        anchor.addEventListener('click', () => {
          document.querySelector('[data-header-search-close]')?.click();
          document.querySelector('#header-drawer-button[aria-expanded="true"]')?.click();
          document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        box.append(anchor);
      }
      if (!matches.length) {
        const empty = document.createElement('p');
        empty.className = 'local-search-empty';
        empty.textContent = 'No matches in this guide. Try a different keyword.';
        box.append(empty);
      }
    };
    input.addEventListener('input', render);
    render();
  });
})();
