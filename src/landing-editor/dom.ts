import { emptyLandingDocument, landingStyleToCss, type LandingDocument, type LandingLanguage } from '../../shared/landing-editor';

export type EditableElement = HTMLElement | SVGSVGElement;
export type LandingNode = { id: string; parentId: string | null; depth: number; element: EditableElement; label: string; tag: string };
type TextSnapshot = { original: string; applied?: string };
type AttributeSnapshot = { original: string | null; applied?: string | null };
const excluded = '[data-lpe-ui],.lbg-panel,.landing-toc,[role="dialog"],dialog,input[type="file"],script,style,link,source,br,wbr';
const names: Record<string, string> = { 'landing-nav': '顶部导航', 'landing-announcement': '公告栏', 'lp-hero': '首屏 · Prompt',
  'lp-body': '首屏内容', 'lp-heading': '首屏标题组', 'lp-composer': 'Prompt 输入框', 'lp-marquee': '模型跑马灯',
  'lvs-showcase': '创作案例', 'scenes-showcase': '应用场景', 'ls-statement': '创作展示', 'ls-steps': '制作流程',
  'ls-compare': '效果对比', 'ls-tools': '创作工具', 'ls-creator': '创作者', 'ls-cta': '开始创作区',
  'gf-pricing': '价格方案', 'gf-faq': '常见问题', 'gf-footer': '页脚', lbg: '动态背景',
};
const tagNames: Record<string, string> = { img: '图片', video: '视频', svg: '图标', canvas: '画布', button: '按钮', a: '链接',
  h1: '主标题', h2: '标题', h3: '小标题', p: '段落', span: '文字', textarea: '输入框', input: '输入', section: '区块', div: '容器', nav: '导航', figure: '媒体组' };

// Structure is independent of translated copy, viewport and transient React classes.
export function landingNodeId(structuralPath: string) {
  let a = 2166136261, b = 5381;
  for (let i = 0; i < structuralPath.length; i++) { const c = structuralPath.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b, 33) ^ c; }
  return `lpe-${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}
const classes = (element: Element) => [...element.classList].filter(value => !/^(?:lpe-|is-|active$|open$|selected$|spin$)/.test(value));
const textChildren = (element: Element) => [...element.childNodes].filter((node): node is Text => node.nodeType === Node.TEXT_NODE);

export function createLandingEditorDom(root: HTMLElement, onScan: () => void) {
  let nodes = new Map<string, LandingNode>();
  let copies = new Map<string, EditableElement[]>();
  const textSnapshots = new WeakMap<Text, TextSnapshot>();
  const attributeSnapshots = new WeakMap<Element, Map<string, AttributeSnapshot>>();
  const naturalPositions = new WeakMap<Element, string>();
  let document = emptyLandingDocument(), language: LandingLanguage = 'en';
  let appliedIds = new Set<string>();
  let frame = 0, disposed = false;
  const style = window.document.createElement('style');
  style.dataset.lpeStyles = 'true';
  window.document.head.appendChild(style);
  root.dataset.lpeRoot = 'true';

  function captureText(node: Text) {
    let snapshot = textSnapshots.get(node);
    if (!snapshot) { snapshot = { original: node.data }; textSnapshots.set(node, snapshot); }
    else if (snapshot.applied !== undefined && node.data !== snapshot.applied) { snapshot.original = node.data; snapshot.applied = undefined; }
    else if (snapshot.applied === undefined) snapshot.original = node.data;
    return snapshot;
  }
  function textNodes(element: Element) { return textChildren(element).filter(node => captureText(node).original.trim() !== ''); }
  function label(element: EditableElement) {
    const list = classes(element);
    const known = list.map(value => names[value]).find(Boolean);
    const text = textNodes(element).map(node => node.data).join(' ').trim();
    const name = known || element.getAttribute('aria-label') || tagNames[element.tagName.toLowerCase()] || element.tagName.toLowerCase();
    return text && text !== name ? `${name} · ${text.replace(/\s+/g, ' ').slice(0, 34)}` : name;
  }
  function snapshotAttribute(element: Element, key: string) {
    let map = attributeSnapshots.get(element);
    if (!map) { map = new Map(); attributeSnapshots.set(element, map); }
    let snapshot = map.get(key);
    const current = element.getAttribute(key);
    if (!snapshot) { snapshot = { original: current }; map.set(key, snapshot); }
    else if (snapshot.applied !== undefined && current !== snapshot.applied) { snapshot.original = current; snapshot.applied = undefined; }
    else if (snapshot.applied === undefined) snapshot.original = current;
    return snapshot;
  }
  function setAttribute(element: Element, key: string, value: string | null) {
    if (element.getAttribute(key) === value) return;
    if (value === null) element.removeAttribute(key); else element.setAttribute(key, value);
  }

  function render() {
    const rules: string[] = [];
    for (const [id, patch] of Object.entries(document.elements)) {
      const selector = `[data-lpe-root]${id === 'page' ? '' : ' '}[data-lpe-node="${id}"]`;
      if (patch.hidden) rules.push(`${selector}{display:none!important}`);
      const cssFor = (value: NonNullable<typeof patch.desktop>) => {
        const element = nodes.get(id)?.element;
        const background = element?.parentElement === root && element.classList.contains('lbg');
        const editableStyle = background ? { ...value, zIndex: undefined } : value;
        let css = landingStyleToCss(editableStyle);
        if (editableStyle.zIndex !== undefined && element) {
          if (!naturalPositions.has(element)) naturalPositions.set(element, getComputedStyle(element).position);
          if (naturalPositions.get(element) === 'static') css += ';position:relative!important';
        }
        return css;
      };
      if (patch.desktop) rules.push(`@media(min-width:821px){${selector}{${cssFor(patch.desktop)}}}`);
      if (patch.mobile) rules.push(`@media(max-width:820px){${selector}{${cssFor(patch.mobile)}}}`);
      if (patch.attributes?.backgroundImage !== undefined) rules.push(`${selector}{background-image:${patch.attributes.backgroundImage ? `url(${JSON.stringify(patch.attributes.backgroundImage)})` : 'none'}!important;background-size:cover!important;background-position:center!important}`);
      if (patch.text?.[language]?.some(value => value.includes('\n'))) rules.push(`${selector}{white-space:pre-wrap!important}`);
    }
    const css = rules.join('\n');
    if (style.textContent !== css) style.textContent = css;
    for (const [id, elements] of copies) {
      const patch = document.elements[id];
      if (!patch && !appliedIds.has(id)) continue;
      for (const element of elements) {
        const text = textNodes(element);
        const replacement = patch?.text?.[language];
        text.forEach((node, index) => {
          const snapshot = captureText(node);
          const next = replacement?.[index] ?? snapshot.original;
          if (node.data !== next) node.data = next;
          snapshot.applied = replacement?.[index] !== undefined ? next : undefined;
        });
        for (const key of ['src', 'poster', 'href', 'alt', 'title', 'placeholder'] as const) {
          const snapshot = snapshotAttribute(element, key);
          const next = key === 'placeholder' ? patch?.placeholder?.[language] : patch?.attributes?.[key];
          if (next !== undefined) { setAttribute(element, key, next); snapshot.applied = next; }
          else if (snapshot.applied !== undefined) { setAttribute(element, key, snapshot.original); snapshot.applied = undefined; }
        }
      }
    }
    appliedIds = new Set(Object.keys(document.elements));
  }

  function scan() {
    if (disposed) return;
    const next = new Map<string, LandingNode>(), nextCopies = new Map<string, EditableElement[]>();
    const visit = (element: Element, structuralPath: string, parentId: string | null, depth: number) => {
      if (element.matches(excluded) || !(element instanceof HTMLElement || element instanceof SVGSVGElement)) return;
      const id = element === root ? 'page' : landingNodeId(structuralPath);
      element.dataset.lpeNode = id;
      const node = { id, parentId, depth, element, label: element === root ? '整个页面' : label(element), tag: element.tagName.toLowerCase() };
      if (!next.has(id)) next.set(id, node);
      nextCopies.set(id, [...(nextCopies.get(id) || []), element]);
      if (element instanceof SVGSVGElement) return;
      const counters = new Map<string, number>();
      const canonical = new Map<string, { path: string; source: string }[]>();
      for (const child of [...element.children]) {
        if (child.matches(excluded)) continue;
        const kind = `${child.tagName.toLowerCase()}${child.id ? `#${child.id}` : `.${classes(child)[0] || ''}`}`;
        const state = child.getAttribute('data-scene') || child.getAttribute('data-landing-state') || '';
        const key = kind + (state ? `@${state}` : '');
        const index = counters.get(key) || 0; counters.set(key, index + 1);
        const source = child.querySelector('video')?.getAttribute('data-preview') || child.getAttribute('src') || '';
        let path = `${structuralPath}/${key}:${index}`;
        const originals = canonical.get(key) || [];
        if (child.getAttribute('aria-hidden') === 'true') {
          const original = originals.find(item => item.source === source);
          if (original) path = original.path;
        } else { originals.push({ path, source }); canonical.set(key, originals); }
        visit(child, path, id, depth + 1);
      }
    };
    visit(root, 'page', null, 0);
    nodes = next; copies = nextCopies;
    render(); onScan();
  }
  function schedule() { if (!frame && !disposed) frame = requestAnimationFrame(() => { frame = 0; scan(); }); }
  const observer = new MutationObserver(schedule);
  scan();
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['src', 'href', 'alt', 'poster', 'placeholder', 'class', 'data-scene', 'data-landing-state'] });

  return {
    root,
    list: () => [...nodes.values()],
    get: (id: string | null) => id ? nodes.get(id) : undefined,
    pick(target: EventTarget | null) {
      if (!(target instanceof Element) || target.closest(excluded)) return undefined;
      const id = target.closest<EditableElement>('[data-lpe-node]')?.dataset.lpeNode;
      return id ? nodes.get(id) : undefined;
    },
    info(id: string | null) {
      const node = id ? nodes.get(id) : undefined;
      if (!node) return null;
      const element = node.element;
      const computed = getComputedStyle(element), rect = element.getBoundingClientRect();
      return { ...node, rect, computed, texts: textNodes(element).map(text => text.data),
        src: element.getAttribute('src') || element.getAttribute('data-preview') || '',
        poster: element.getAttribute('poster') || '', href: element.getAttribute('href') || '',
        alt: element.getAttribute('alt') || '', placeholder: element.getAttribute('placeholder') || '',
      };
    },
    apply(next: LandingDocument, lang: LandingLanguage) { document = next; language = lang; render(); },
    refresh: schedule,
    dispose() {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      document = emptyLandingDocument(); render(); style.remove();
      for (const elements of copies.values()) for (const element of elements) delete element.dataset.lpeNode;
      delete root.dataset.lpeRoot;
    },
  };
}
export type LandingEditorDom = ReturnType<typeof createLandingEditorDom>;
