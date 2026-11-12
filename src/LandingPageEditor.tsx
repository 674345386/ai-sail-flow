import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, ChevronRight, Download, Eye, EyeOff, ImagePlus, Layers3, LoaderCircle, Monitor, MousePointer2, Move, Pencil, Redo2, RotateCcw, Save, Search, Smartphone, Type, Undo2, Upload, X } from 'lucide-react';
import { api, downloadBlob } from './api';
import { useLang } from './i18n';
import { emptyLandingDocument, landingDocumentSchema, safeLandingUrl, type LandingDocument, type LandingElementPatch, type LandingStyle, type LandingViewport } from '../shared/landing-editor';
import { createLandingEditorDom, type LandingEditorDom, type LandingNode } from './landing-editor/dom';
import './landing-editor.css';

const DRAFT_KEY = 'sail-landing-page-draft-v1';
type Rect = { left: number; top: number; width: number; height: number };
type History = { past: LandingDocument[]; future: LandingDocument[]; group: string; at: number };
const sameElements = (a: LandingDocument, b: LandingDocument) => JSON.stringify(a.elements) === JSON.stringify(b.elements);
function colorHex(value: string) {
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  const rgb = value.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
  return rgb ? '#' + rgb.slice(1, 4).map(part => Math.min(255, Number(part)).toString(16).padStart(2, '0')).join('') : '#ffffff';
}

export default function LandingPageEditor({ accountKey = '' }: { accountKey?: string }) {
  const { lang, setLang } = useLang();
  const marker = useRef<HTMLSpanElement>(null);
  const runtime = useRef<LandingEditorDom | null>(null);
  const [scan, setScan] = useState(0);
  const [document, setDocument] = useState<LandingDocument>(emptyLandingDocument);
  const documentRef = useRef(document);
  const [saved, setSaved] = useState<LandingDocument>(emptyLandingDocument);
  const savedRef = useRef(saved);
  const [loaded, setLoaded] = useState(false), [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectionRect, setSelectionRect] = useState<Rect | null>(null);
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  const [layersOpen, setLayersOpen] = useState(false), [layerSearch, setLayerSearch] = useState('');
  const [viewport, setViewport] = useState<LandingViewport>(() => window.innerWidth > 820 ? 'desktop' : 'mobile');
  const viewportRef = useRef(viewport); viewportRef.current = viewport;
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [localDraft, setLocalDraft] = useState<LandingDocument | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [inline, setInline] = useState<{ id: string; value: string; count: number } | null>(null);
  const [preview, setPreview] = useState<LandingViewport | null>(null);
  const previewFrame = useRef<HTMLIFrameElement>(null);
  const [lockRatio, setLockRatio] = useState(true), [snap, setSnap] = useState(false);
  const inlineCancelled = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null), importInput = useRef<HTMLInputElement>(null);
  const uploadField = useRef<'src' | 'poster' | 'backgroundImage'>('src');
  const history = useRef<History>({ past: [], future: [], group: '', at: 0 });
  const gesture = useRef<{ id: string; kind: string; clientX: number; clientY: number; x: number; y: number; width: number; height: number; left: number; top: number } | null>(null);
  const previewMessage = useRef(false);
  const isPreview = new URLSearchParams(window.location.search).has('landingPreview');
  const isRequested = useRef(new URLSearchParams(window.location.search).get('edit') === 'landing');
  const dirty = !sameElements(document, saved);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const editingRef = useRef(editing); editingRef.current = editing;
  const langRef = useRef(lang); langRef.current = lang;
  const actionRef = useRef({ save: () => {}, undo: () => {}, redo: () => {} });

  const commit = useCallback((next: LandingDocument, group = '') => {
    if (sameElements(documentRef.current, next)) return;
    const now = Date.now(), stack = history.current;
    if (!group || group !== stack.group || now - stack.at > 800) {
      stack.past.push(documentRef.current); if (stack.past.length > 80) stack.past.shift();
    }
    stack.future = []; stack.group = group; stack.at = now;
    documentRef.current = next; setDocument(next);
    runtime.current?.apply(next, langRef.current);
  }, []);

  const changeElement = useCallback((id: string, patch: Partial<LandingElementPatch>, group = '') => {
    const current = documentRef.current;
    commit({ ...current, elements: { ...current.elements, [id]: { ...current.elements[id], ...patch } } }, group);
  }, [commit]);
  const changeStyle = useCallback((id: string, patch: Partial<LandingStyle>, group = '') => {
    const current = documentRef.current.elements[id] || {};
    const scope = viewportRef.current;
    changeElement(id, { [scope]: { ...current[scope], ...patch } }, group);
  }, [changeElement]);

  const undo = () => {
    const previous = history.current.past.pop(); if (!previous) return;
    history.current.future.push(documentRef.current); history.current.group = '';
    documentRef.current = previous; setDocument(previous);
  };
  const redo = () => {
    const next = history.current.future.pop(); if (!next) return;
    history.current.past.push(documentRef.current); history.current.group = '';
    documentRef.current = next; setDocument(next);
  };
  const save = async () => {
    if (busy || !loaded) return;
    const submitted = documentRef.current;
    setBusy(true); setNotice('正在保存页面…');
    try {
      const result = await api<LandingDocument>('/api/landing-page', { method: 'PUT', body: JSON.stringify({ revision: savedRef.current.revision, elements: submitted.elements }) });
      const newerEdits = !sameElements(documentRef.current, submitted);
      const next = newerEdits ? { ...result, elements: documentRef.current.elements } : result;
      savedRef.current = result; documentRef.current = next; setSaved(result); setDocument(next);
      history.current.group = ''; setLocalDraft(null);
      try { if (newerEdits) localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); else localStorage.removeItem(DRAFT_KEY); } catch { /* The latest edits remain in memory. */ }
      setNotice(newerEdits ? '上一版已保存，保存期间的新修改仍在草稿中，请再次保存。' : '已保存，刷新页面后仍然有效。');
    } catch (error) { setNotice(error instanceof Error ? error.message : '保存失败，草稿仍保留。'); }
    finally { setBusy(false); }
  };
  actionRef.current = { save: () => { finishInline(); void save(); }, undo, redo };

  useEffect(() => {
    let active = true;
    void fetch('/api/landing-page', { credentials: 'same-origin', cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('页面编辑配置读取失败，请刷新重试。');
      const result = landingDocumentSchema.parse(await response.json());
      if (!active) return;
      savedRef.current = result; setSaved(result);
      if (!previewMessage.current) { documentRef.current = result; setDocument(result); }
      setLoaded(true);
      try { const parsed = landingDocumentSchema.safeParse(JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'));
        if (parsed.success && !sameElements(parsed.data, result)) setLocalDraft(parsed.data);
      } catch { /* An invalid local draft never replaces the saved page. */ }
    }).catch(error => { if (active) setNotice(error instanceof Error ? error.message : '页面配置读取失败。'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!isPreview) void api<{ canEdit: boolean }>('/api/landing-page/access').then(value => { if (active) setCanEdit(value.canEdit); }).catch(() => { if (active) setCanEdit(false); });
    return () => { active = false; };
  }, [accountKey, isPreview]);

  useEffect(() => {
    if (loaded && canEdit && isRequested.current) { isRequested.current = false; setEditing(true); }
  }, [loaded, canEdit]);

  useLayoutEffect(() => {
    const root = marker.current?.closest<HTMLElement>('.landing-page');
    if (!root) return;
    const dom = createLandingEditorDom(root, () => setScan(value => value + 1)); runtime.current = dom;
    return () => { dom.dispose(); runtime.current = null; };
  }, []);

  useLayoutEffect(() => {
    const dom = runtime.current; if (!dom) return;
    dom.apply(editing || isPreview ? document : saved, lang);
    dom.root.classList.toggle('lpe-editing', editing);
    dom.root.classList.toggle('lpe-previewing', isPreview);
    dom.refresh();
  }, [document, saved, editing, lang, isPreview]);

  useEffect(() => {
    if (!editing || !loaded) return;
    if (!dirty) { if (!localDraft) { try { localStorage.removeItem(DRAFT_KEY); } catch { /* Storage is optional. */ } } return; }
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(document)); }
      catch { setNotice('浏览器草稿存储已满，请点击“保存页面”或导出备份。'); }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [document, dirty, loaded, editing, localDraft]);

  const sendPreview = useCallback(() => {
    previewFrame.current?.contentWindow?.postMessage({ type: 'sail-landing-preview', document: documentRef.current, lang: langRef.current }, window.location.origin);
  }, []);
  useEffect(() => { if (preview) sendPreview(); }, [preview, document, lang, sendPreview]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (isPreview && window.parent !== window && event.source === window.parent && event.data?.type === 'sail-landing-preview') {
        const result = landingDocumentSchema.safeParse(event.data.document);
        if (!result.success) return;
        previewMessage.current = true; documentRef.current = result.data; setDocument(result.data);
        if (event.data.lang === 'en' || event.data.lang === 'zh-CN') setLang(event.data.lang);
      } else if (event.source === previewFrame.current?.contentWindow && event.data?.type === 'sail-landing-preview-ready') sendPreview();
    };
    window.addEventListener('message', receive);
    if (isPreview && window.parent !== window) window.parent.postMessage({ type: 'sail-landing-preview-ready' }, window.location.origin);
    return () => window.removeEventListener('message', receive);
  }, [isPreview, sendPreview, setLang]);

  useEffect(() => {
    const dom = runtime.current; if (!dom || !editing) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const info = dom.info(selected);
      setSelectionRect(info && info.rect.width && info.rect.height ? { left: info.rect.left, top: info.rect.top, width: info.rect.width, height: info.rect.height } : null);
      const hover = dom.info(hovered);
      setHoverRect(hover && hovered !== selected ? { left: hover.rect.left, top: hover.rect.top, width: hover.rect.width, height: hover.rect.height } : null);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(dom.root); const node = dom.get(selected); if (node) observer.observe(node.element);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); };
  }, [selected, hovered, editing, document, scan]);

  useEffect(() => {
    if (!editing) return;
    const dom = runtime.current; if (!dom) return;
    const root = dom.root;
    const playing = new Set<HTMLVideoElement>();
    root.querySelectorAll('video').forEach(video => { if (!video.paused) playing.add(video); video.pause(); });
    const preventPlayback = (event: Event) => { if (event.target instanceof HTMLVideoElement) { playing.add(event.target); event.target.pause(); } };
    root.addEventListener('play', preventPlayback, true);
    const click = (event: Event) => { if (root.dataset.lpeInteract !== 'true' && dom.pick(event.target)) { event.preventDefault(); event.stopPropagation(); } };
    const hover = (event: PointerEvent) => { if (!gesture.current) setHovered(dom.pick(event.target)?.id || null); };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary || busy) return;
      let node = dom.pick(event.target); if (!node) return;
      if (event.altKey && node.parentId) node = dom.get(node.parentId) || node;
      event.preventDefault(); event.stopPropagation();
      setSelected(node.id); selectedRef.current = node.id; setInline(null);
      const info = dom.info(node.id)!;
      const style = documentRef.current.elements[node.id]?.[viewportRef.current];
      gesture.current = { id: node.id, kind: 'move', clientX: event.clientX, clientY: event.clientY, x: style?.x || 0, y: style?.y || 0,
        width: info.rect.width, height: info.rect.height, left: info.rect.left, top: info.rect.top };
    };
    const double = (event: MouseEvent) => {
      const node = dom.pick(event.target); if (!node) return;
      const info = dom.info(node.id); if (!info?.texts.length) return;
      event.preventDefault(); event.stopPropagation(); gesture.current = null;
      setSelected(node.id); setInline({ id: node.id, value: info.texts.join('\n'), count: info.texts.length }); inlineCancelled.current = false;
    };
    const key = (event: KeyboardEvent) => {
      const typing = event.target instanceof Element && !!event.target.closest('input,textarea,select,[contenteditable="true"]');
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); actionRef.current.save(); return; }
      if (typing) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) actionRef.current.redo(); else actionRef.current.undo(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); actionRef.current.redo(); return; }
      const id = selectedRef.current; if (!id) return;
      if (event.key === 'Escape') { setSelected(null); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); changeElement(id, { hidden: true }); return; }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); const step = event.shiftKey ? 10 : 1;
        const style = documentRef.current.elements[id]?.[viewportRef.current];
        changeStyle(id, { x: (style?.x || 0) + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
          y: (style?.y || 0) + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) }, `keyboard-${id}`);
      }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(documentRef.current)); } catch { /* The browser can still ask before leaving. */ } event.preventDefault(); event.returnValue = ''; } };
    root.addEventListener('click', click, true); root.addEventListener('submit', click, true);
    root.addEventListener('pointerdown', down, true); root.addEventListener('pointermove', hover, true); root.addEventListener('dblclick', double, true);
    window.addEventListener('keydown', key); window.addEventListener('beforeunload', beforeUnload);
    return () => {
      root.removeEventListener('play', preventPlayback, true);
      playing.forEach(video => { if (video.isConnected) void video.play().catch(() => {}); });
      root.removeEventListener('click', click, true); root.removeEventListener('submit', click, true);
      root.removeEventListener('pointerdown', down, true); root.removeEventListener('pointermove', hover, true); root.removeEventListener('dblclick', double, true);
      window.removeEventListener('keydown', key); window.removeEventListener('beforeunload', beforeUnload); gesture.current = null;
    };
  }, [editing, busy, changeElement, changeStyle]);

  useEffect(() => {
    if (!editing) return;
    const move = (event: PointerEvent) => {
      const drag = gesture.current; if (!drag) return;
      let dx = event.clientX - drag.clientX, dy = event.clientY - drag.clientY;
      if (Math.abs(dx) + Math.abs(dy) < 3) return;
      event.preventDefault();
      const grid = snap || event.shiftKey ? 8 : 1;
      const round = (value: number) => Math.round(value / grid) * grid;
      if (drag.kind === 'move') changeStyle(drag.id, { x: round(drag.x + dx), y: round(drag.y + dy) }, `gesture-${drag.id}`);
      else {
        let width = Math.max(16, drag.width + (drag.kind.includes('w') ? -dx : dx));
        let height = Math.max(16, drag.height + (drag.kind.includes('n') ? -dy : dy));
        if (lockRatio || event.shiftKey) { height = width * drag.height / drag.width; }
        width = Math.min(10000, round(width)); height = Math.min(20000, round(height));
        const x = drag.x + (drag.kind.includes('w') ? drag.width - width : 0), y = drag.y + (drag.kind.includes('n') ? drag.height - height : 0);
        changeStyle(drag.id, { width, height, x, y }, `gesture-${drag.id}`);
        const rect = runtime.current?.get(drag.id)?.element.getBoundingClientRect();
        if (rect) {
          const correctionX = drag.left + (drag.kind.includes('w') ? drag.width - width : 0) - rect.left;
          const correctionY = drag.top + (drag.kind.includes('n') ? drag.height - height : 0) - rect.top;
          if (Math.abs(correctionX) > .5 || Math.abs(correctionY) > .5) changeStyle(drag.id, { x: Math.round(x + correctionX), y: Math.round(y + correctionY) }, `gesture-${drag.id}`);
        }
      }
    };
    const end = () => { if (gesture.current) history.current.group = ''; gesture.current = null; };
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end); window.addEventListener('blur', end);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); window.removeEventListener('blur', end); };
  }, [editing, snap, lockRatio, changeStyle]);

  const enter = () => {
    const url = new URL(window.location.href); url.searchParams.set('edit', 'landing'); window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    setEditing(true); setNotice('点击选中，直接拖动；双击文字修改。Alt + 点击选择上层容器。');
  };
  const exit = () => {
    if (dirtyRef.current) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(documentRef.current)); } catch { /* Keep the in-memory draft. */ } setLocalDraft(documentRef.current); }
    const url = new URL(window.location.href); url.searchParams.delete('edit'); window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    setEditing(false); setInline(null); setSelected(null); setPreview(null);
  };
  const selectNode = (node: LandingNode) => { setSelected(node.id); node.element.scrollIntoView({ block: 'center', behavior: 'auto' }); };
  const startResize = (event: ReactPointerEvent<HTMLButtonElement>, direction: string) => {
    event.preventDefault(); event.stopPropagation(); if (!selected || busy) return;
    const info = runtime.current?.info(selected); if (!info) return;
    const style = documentRef.current.elements[selected]?.[viewport];
    gesture.current = { id: selected, kind: direction, clientX: event.clientX, clientY: event.clientY,
      x: style?.x || 0, y: style?.y || 0, width: info.rect.width, height: info.rect.height, left: info.rect.left, top: info.rect.top };
  };
  const changeAttribute = (field: 'src' | 'poster' | 'href' | 'alt' | 'backgroundImage', value: string) => {
    if (!selected) return;
    changeElement(selected, { attributes: { ...documentRef.current.elements[selected]?.attributes, [field]: value } }, `${selected}-${field}`);
  };
  const upload = async (file: File) => {
    const id = selectedRef.current; if (!id) return;
    const field = uploadField.current;
    const video = file.type.startsWith('video/');
    if (video && (field !== 'src' || runtime.current?.get(id)?.tag !== 'video')) { setNotice('这个位置需要图片，请选择图片文件。'); return; }
    if (file.size > (video ? 100 : 10) * 1024 * 1024) { setNotice(video ? '视频最多 100 MB。' : '图片最多 10 MB。'); return; }
    setBusy(true); setNotice('正在上传素材…');
    try {
      const body = new FormData(); body.append('file', file);
      const result = await api<{ url: string; kind: string }>('/api/landing-page/assets', { method: 'POST', body });
      changeElement(id, { attributes: { ...documentRef.current.elements[id]?.attributes, [field]: result.url } });
      setNotice('素材已替换，点击“保存页面”后生效。');
    } catch (error) { setNotice(error instanceof Error ? error.message : '上传失败，请重试。'); }
    finally { setBusy(false); }
  };
  const chooseFile = (field: 'src' | 'poster' | 'backgroundImage') => {
    uploadField.current = field;
    if (fileInput.current) { fileInput.current.accept = field === 'src' && runtime.current?.get(selected)?.tag === 'video' ? 'video/mp4,video/webm' : 'image/png,image/jpeg,image/webp,image/gif,image/avif'; fileInput.current.click(); }
  };

  const info = runtime.current?.info(selected);
  const patch = selected ? document.elements[selected] || {} : {};
  const scope = patch[viewport] || {};
  const num = (key: keyof LandingStyle) => {
    if (scope[key] !== undefined) return Number(scope[key]);
    if (!info) return 0;
    if (key === 'x' || key === 'y' || key === 'rotate' || key === 'order') return 0;
    if (key === 'width' || key === 'height') return Math.round(info.rect[key]);
    if (key === 'lineHeight') return Number((parseFloat(info.computed.lineHeight) / parseFloat(info.computed.fontSize) || 1.5).toFixed(2));
    return Number(parseFloat(info.computed[key as keyof CSSStyleDeclaration] as string).toFixed(2)) || 0;
  };
  const field = (label: string, key: keyof LandingStyle, min = -20000, max = 20000, step = 1) => <label className="lpe-number"><span>{label}</span><input aria-label={label} type="number" min={min} max={max} step={step} value={num(key)} onChange={event => {
    if (!selected) return; const value = event.currentTarget.value;
    if (value === '') changeStyle(selected, { [key]: undefined }, `${selected}-${key}`);
    else if (Number.isFinite(Number(value))) changeStyle(selected, { [key]: Math.max(min, Math.min(max, Number(value))) }, `${selected}-${key}`);
  }} disabled={key === 'zIndex' && info?.element.parentElement === runtime.current?.root && info?.element.classList.contains('lbg')} title={key === 'zIndex' && info?.element.classList.contains('lbg') ? '页面底色始终固定在最底层' : undefined} /><button type="button" aria-label={`恢复${label}`} title={`恢复${label}`} disabled={scope[key] === undefined} onClick={() => { if (selected) changeStyle(selected, { [key]: undefined }); }}><RotateCcw size={11} /></button></label>;
  const finishInline = () => {
    if (!inline || inlineCancelled.current) return;
    const parts = inline.count === 1 ? [inline.value] : inline.value.split('\n');
    const values = Array.from({ length: inline.count }, (_, index) => index === inline.count - 1 ? parts.slice(index).join('\n') : parts[index] || '');
    changeElement(inline.id, { text: { ...documentRef.current.elements[inline.id]?.text, [lang]: values } }); setInline(null);
  };
  const layerNodes = runtime.current?.list().filter(node => !layerSearch || `${document.elements[node.id]?.name || ''} ${node.label} ${node.tag}`.toLowerCase().includes(layerSearch.toLowerCase())) || [];

  return <><span ref={marker} hidden data-lpe-ui />{createPortal(<div className="lpe-ui" data-lpe-ui data-no-i18n>
    {!editing && !isPreview && canEdit && <button className="lpe-launch" type="button" disabled={!loaded} onClick={enter}><Pencil size={16} />编辑落地页{localDraft && <span className="lpe-draft-dot" title="有未保存草稿" />}</button>}
    {editing && <>
      <header className="lpe-toolbar">
        <div className="lpe-toolbar-brand"><span><MousePointer2 size={18} /></span><strong>页面编辑器</strong><small>{dirty ? '有未保存修改' : `已保存 · v${saved.revision}`}</small></div>
        <div className="lpe-toolbar-tools"><button type="button" className={layersOpen ? 'active' : ''} aria-pressed={layersOpen} onClick={() => setLayersOpen(value => !value)}><Layers3 size={16} /><span>图层</span></button><span className="lpe-divider" /><button type="button" disabled={!history.current.past.length || busy} onClick={undo} title="撤销 · ⌘/Ctrl Z" aria-label="撤销"><Undo2 size={17} /></button><button type="button" disabled={!history.current.future.length || busy} onClick={redo} title="重做 · ⌘/Ctrl Shift Z" aria-label="重做"><Redo2 size={17} /></button><span className="lpe-divider" /><button type="button" onClick={() => setPreview(window.innerWidth <= 820 ? 'mobile' : 'desktop')}><Eye size={16} /><span>预览</span></button></div>
        <div className="lpe-toolbar-actions"><button type="button" onClick={() => downloadBlob(new Blob([JSON.stringify(documentRef.current, null, 2)], { type: 'application/json' }), 'landing-page.json')} title="导出页面编辑备份" aria-label="导出备份"><Download size={16} /></button><button type="button" onClick={() => importInput.current?.click()} title="导入页面编辑备份" aria-label="导入备份"><Upload size={16} /></button><button className="lpe-save" type="button" disabled={busy || !dirty} onClick={() => { void save(); }}>{busy ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}<span>{busy ? '处理中…' : '保存页面'}</span></button><button type="button" onClick={exit}><X size={17} /><span>退出</span></button></div>
      </header>
      {localDraft && <div className="lpe-draft-banner"><span>发现上次未保存的草稿{localDraft.revision !== saved.revision ? '（保存版本已变化，请先导出备份）' : ''}</span><button type="button" onClick={() => { commit({ ...documentRef.current, elements: localDraft.elements }); setLocalDraft(null); }}>恢复草稿</button><button type="button" aria-label="忽略草稿" onClick={() => setLocalDraft(null)}><X size={13} /></button></div>}
      {layersOpen && <aside className="lpe-layers"><header><strong>页面图层</strong><button type="button" aria-label="关闭图层" onClick={() => setLayersOpen(false)}><X size={15} /></button></header><label className="lpe-layer-search"><Search size={14} /><input placeholder="搜索文字、区块、图片…" value={layerSearch} onChange={event => setLayerSearch(event.target.value)} /></label><div className="lpe-layer-list">{layerNodes.map(node => <div className={`lpe-layer-row ${selected === node.id ? 'selected' : ''} ${document.elements[node.id]?.hidden ? 'hidden-node' : ''}`} key={node.id} style={{ paddingLeft: Math.min(node.depth, 7) * 9 + 5 }}><button type="button" onClick={() => selectNode(node)}><span className="lpe-layer-tag">{node.tag === 'img' || node.tag === 'video' ? <ImagePlus size={12} /> : node.tag.match(/^h[1-6]$|p|span|strong/) ? <Type size={12} /> : <Layers3 size={12} />}</span><span>{document.elements[node.id]?.name || node.label}</span></button><button type="button" className="lpe-layer-eye" aria-label={document.elements[node.id]?.hidden ? '显示元素' : '隐藏元素'} onClick={() => changeElement(node.id, { hidden: !document.elements[node.id]?.hidden })}>{document.elements[node.id]?.hidden ? <EyeOff size={12} /> : <Eye size={12} />}</button></div>)}</div><footer>{layerNodes.length} 个可编辑元素</footer></aside>}
      <aside className="lpe-inspector" aria-label="元素属性">
        <header><span><Pencil size={14} />属性</span><div className="lpe-scope" role="group" aria-label="编辑哪种屏幕的布局"><button type="button" aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')}><Monitor size={12} />桌面</button><button type="button" aria-pressed={viewport === 'mobile'} onClick={() => setViewport('mobile')}><Smartphone size={12} />手机</button></div></header>
        {info && selected ? <div className="lpe-properties" key={selected}>
          <div className="lpe-selection-heading"><span>{info.tag.toUpperCase()}</span><strong>{patch.name || info.label}</strong>{info.parentId && <button type="button" title="选择上层容器 · Alt + 点击" aria-label="选择上层容器" onClick={() => { setSelected(info.parentId); }}><ArrowUp size={14} /></button>}</div>
          <label className="lpe-field"><span>图层名称</span><input value={patch.name || ''} placeholder={info.label} maxLength={120} onChange={event => changeElement(selected, { name: event.target.value }, `${selected}-name`)} /></label>
          {viewport !== (window.innerWidth > 820 ? 'desktop' : 'mobile') && <p className="lpe-field-hint">正在修改{viewport === 'mobile' ? '手机' : '桌面'}布局，请点“预览”查看对应尺寸的效果。</p>}
          {info.element.getAttribute('role') === 'tab' && <button type="button" className="lpe-wide-button" onClick={() => { const root = runtime.current?.root; if (!root) return; root.dataset.lpeInteract = 'true'; try { if (info.element instanceof HTMLElement) info.element.click(); } finally { delete root.dataset.lpeInteract; } }}><ChevronRight size={14} />切换到此标签内容</button>}
          {info.tag === 'summary' && <button type="button" className="lpe-wide-button" onClick={() => { const details = info.element.closest('details'); if (details) details.open = !details.open; }}>展开 / 收起此条内容</button>}
          <section className="lpe-property-section"><h3>位置与尺寸 <Move size={13} /></h3><p className="lpe-field-hint">位置为相对原布局的偏移，留空恢复自适应。</p><div className="lpe-field-grid">{field('X 偏移', 'x')}{field('Y 偏移', 'y')}{field('宽度', 'width', 1, 10000)}{field('高度', 'height', 1, 20000)}{field('旋转', 'rotate', -360, 360)}{field('层级', 'zIndex', -10, 100)}</div><div className="lpe-checkboxes"><label><input type="checkbox" checked={lockRatio} onChange={event => setLockRatio(event.target.checked)} />缩放锁定比例</label><label><input type="checkbox" checked={snap} onChange={event => setSnap(event.target.checked)} />8px 吸附</label></div></section>
          {info.texts.length > 0 && <section className="lpe-property-section"><h3>文字内容 <span>{lang === 'en' ? 'English' : '简体中文'}</span></h3>{info.texts.map((value, index) => <label className="lpe-field" key={index}><span>{info.texts.length > 1 ? `文字 ${index + 1}` : '内容'}</span><textarea rows={Math.min(5, Math.max(2, Math.ceil(value.length / 25)))} maxLength={12000} value={patch.text?.[lang]?.[index] ?? value} onChange={event => { const values = [...(documentRef.current.elements[selected]?.text?.[lang] || info.texts)]; values[index] = event.target.value; changeElement(selected, { text: { ...documentRef.current.elements[selected]?.text, [lang]: values } }, `${selected}-text-${index}`); }} /></label>)}</section>}
          {(info.tag === 'textarea' || info.tag === 'input') && <section className="lpe-property-section"><h3>输入框提示文字</h3><textarea className="lpe-full-input" rows={3} value={patch.placeholder?.[lang] ?? info.placeholder} onChange={event => changeElement(selected, { placeholder: { ...documentRef.current.elements[selected]?.placeholder, [lang]: event.target.value } }, `${selected}-placeholder`)} /></section>}
          <section className="lpe-property-section"><h3>字体与颜色</h3><div className="lpe-field-grid">{field('字号', 'fontSize', 6, 400)}{field('字重', 'fontWeight', 100, 900, 100)}{field('行高', 'lineHeight', 0.5, 5, 0.05)}{field('字距', 'letterSpacing', -20, 100, 0.1)}</div><div className="lpe-field-grid"><label className="lpe-field"><span>字体</span><select value={scope.fontFamily || ''} onChange={event => changeStyle(selected, { fontFamily: event.target.value as LandingStyle['fontFamily'] || undefined })}><option value="">沿用原样式</option><option value="ui">界面字体</option><option value="serif">衬线字体</option><option value="mono">等宽字体</option></select></label><label className="lpe-field"><span>对齐</span><select value={scope.textAlign || ''} onChange={event => changeStyle(selected, { textAlign: event.target.value as LandingStyle['textAlign'] || undefined })}><option value="">沿用原样式</option><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option><option value="justify">两端对齐</option></select></label></div><div className="lpe-field-grid">{(['color', 'backgroundColor'] as const).map(key => <label className="lpe-color" key={key}><span>{key === 'color' ? '文字颜色' : '背景颜色'}</span><div><input type="color" aria-label={key === 'color' ? '文字颜色' : '背景颜色'} value={colorHex(scope[key] || info.computed[key])} onChange={event => changeStyle(selected, { [key]: event.target.value }, `${selected}-${key}`)} /><code>{scope[key] || colorHex(info.computed[key])}</code><button type="button" title="恢复颜色" aria-label="恢复颜色" onClick={() => changeStyle(selected, { [key]: undefined })}><RotateCcw size={11} /></button></div></label>)}</div></section>
          {(info.tag === 'img' || info.tag === 'video') && <section className="lpe-property-section"><h3>{info.tag === 'video' ? '视频素材' : '图片素材'}</h3>{info.tag === 'img' && (patch.attributes?.src || info.src) && <img className="lpe-image-preview" src={patch.attributes?.src || info.src} alt="当前素材" />}<button type="button" className="lpe-wide-button" disabled={busy} onClick={() => chooseFile('src')}><ImagePlus size={15} />上传替换{info.tag === 'video' ? '视频' : '图片'}</button><label className="lpe-field"><span>素材地址</span><input key={`${selected}-src-${patch.attributes?.src || ''}`} defaultValue={patch.attributes?.src ?? info.src} onBlur={event => { if (safeLandingUrl(event.target.value)) changeAttribute('src', event.target.value); else { event.target.value = patch.attributes?.src ?? info.src; setNotice('请输入站内路径或 HTTP/HTTPS 素材地址。'); } }} /></label>{info.tag === 'video' && <><button type="button" className="lpe-wide-button" disabled={busy} onClick={() => chooseFile('poster')}><ImagePlus size={14} />替换封面图</button><label className="lpe-field"><span>封面地址</span><input key={`${selected}-poster-${patch.attributes?.poster || ''}`} defaultValue={patch.attributes?.poster ?? info.poster} onBlur={event => { if (safeLandingUrl(event.target.value)) changeAttribute('poster', event.target.value); else setNotice('封面地址无效。'); }} /></label></>}<label className="lpe-field"><span>图片描述</span><input value={patch.attributes?.alt ?? info.alt} onChange={event => changeAttribute('alt', event.target.value)} /></label><div className="lpe-field-grid"><label className="lpe-field"><span>填充方式</span><select value={scope.objectFit || ''} onChange={event => changeStyle(selected, { objectFit: event.target.value as LandingStyle['objectFit'] || undefined })}><option value="">原样式</option><option value="cover">铺满裁切</option><option value="contain">完整显示</option><option value="fill">拉伸填满</option></select></label><label className="lpe-field"><span>焦点位置</span><select value={scope.objectPosition || ''} onChange={event => changeStyle(selected, { objectPosition: event.target.value as LandingStyle['objectPosition'] || undefined })}><option value="">原样式</option><option value="center">居中</option><option value="top">顶部</option><option value="bottom">底部</option><option value="left">左侧</option><option value="right">右侧</option></select></label></div></section>}
          {info.tag === 'a' && <section className="lpe-property-section"><h3>链接</h3><input className="lpe-full-input" key={`${selected}-href`} defaultValue={patch.attributes?.href ?? info.href} onBlur={event => { if (safeLandingUrl(event.target.value, true)) changeAttribute('href', event.target.value); else setNotice('请输入有效的链接地址。'); }} /></section>}
          <details className="lpe-property-section"><summary>间距与外观<ChevronDown size={13} /></summary><h4>内边距</h4><div className="lpe-field-grid">{field('上内距', 'paddingTop', 0, 2000)}{field('右内距', 'paddingRight', 0, 2000)}{field('下内距', 'paddingBottom', 0, 2000)}{field('左内距', 'paddingLeft', 0, 2000)}</div><h4>外边距</h4><div className="lpe-field-grid">{field('上外距', 'marginTop', -2000, 2000)}{field('右外距', 'marginRight', -2000, 2000)}{field('下外距', 'marginBottom', -2000, 2000)}{field('左外距', 'marginLeft', -2000, 2000)}{field('子项间距', 'gap', 0, 1000)}{field('排列顺序', 'order', -1000, 1000)}{field('圆角', 'borderRadius', 0, 1000)}{field('透明度', 'opacity', 0, 1, 0.05)}</div><button type="button" className="lpe-wide-button" disabled={busy} onClick={() => chooseFile('backgroundImage')}><ImagePlus size={14} />上传背景图片</button>{patch.attributes?.backgroundImage && <button type="button" className="lpe-text-button" onClick={() => changeAttribute('backgroundImage', '')}>移除背景图片</button>}</details>
          <div className="lpe-element-actions"><button type="button" onClick={() => changeElement(selected, { hidden: !patch.hidden })}>{patch.hidden ? <Eye size={14} /> : <EyeOff size={14} />}{patch.hidden ? '显示元素' : '隐藏元素'}</button><button type="button" onClick={() => { const elements = { ...documentRef.current.elements }; delete elements[selected]; commit({ ...documentRef.current, elements }); }}><RotateCcw size={14} />恢复此元素</button></div>
        </div> : <div className="lpe-empty"><MousePointer2 size={31} strokeWidth={1.2} /><h2>点击页面上的任意元素</h2><p>拖动调整位置，四角调整大小。<br />文字、图片和容器都可以编辑。</p><button type="button" onClick={() => setLayersOpen(true)}><Layers3 size={15} />从图层列表选择</button><div><span>Alt + 点击</span>选择上层容器<br /><span>方向键</span>移动 1px<br /><span>Shift + 方向键</span>移动 10px<br /><span>双击文字</span>原位编辑</div></div>}
        <footer className="lpe-inspector-footer"><span>内容按当前语言保存 · 布局按屏幕分开保存</span><div><button type="button" onClick={() => setLang(lang === 'en' ? 'zh-CN' : 'en')}>{lang === 'en' ? 'English' : '简体中文'}<ChevronDown size={12} /></button><button type="button" className="lpe-reset-page" onClick={() => setConfirmReset(value => !value)}><RotateCcw size={12} />恢复原版</button></div>{confirmReset && <p>将清除所有页面编辑，可撤销。<button type="button" onClick={() => { commit({ ...documentRef.current, elements: {} }); setConfirmReset(false); setNotice('已恢复原版草稿，点击保存后生效。'); }}>确认恢复</button><button type="button" onClick={() => setConfirmReset(false)}>取消</button></p>}</footer>
      </aside>
      {hoverRect && !gesture.current && !inline && <div className="lpe-hover-outline" style={hoverRect} />}
      {selectionRect && !preview && <div className="lpe-selection-outline" style={selectionRect}><span className="lpe-outline-label">{patch.name || info?.label}<small>{Math.round(selectionRect.width)} × {Math.round(selectionRect.height)}</small></span>{['nw', 'ne', 'sw', 'se'].map(direction => <button type="button" key={direction} className={`lpe-resize-handle ${direction}`} aria-label={`缩放 ${direction}`} onPointerDown={event => startResize(event, direction)} />)}</div>}
      {inline && selectionRect && <textarea className="lpe-inline-text" autoFocus style={{ left: selectionRect.left, top: selectionRect.top, width: Math.max(180, selectionRect.width), minHeight: Math.max(44, selectionRect.height), fontSize: info?.computed.fontSize, lineHeight: info?.computed.lineHeight, fontFamily: info?.computed.fontFamily }} value={inline.value} onChange={event => setInline({ ...inline, value: event.target.value })} onBlur={finishInline} onKeyDown={event => { if (event.key === 'Escape') { inlineCancelled.current = true; setInline(null); } else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); finishInline(); } }} />}
      <div className="lpe-status" role="status"><span className={dirty ? 'unsaved' : ''} />{notice || (dirty ? '修改已暂存于浏览器，点击保存页面后生效。' : '页面已保存。')}</div>
      {preview && <div className="lpe-preview-shell"><header><button type="button" onClick={() => setPreview(null)}><ArrowLeft size={15} />返回编辑</button><div role="group" aria-label="预览屏幕"><button type="button" aria-pressed={preview === 'desktop'} onClick={() => setPreview('desktop')}><Monitor size={15} />桌面</button><button type="button" aria-pressed={preview === 'mobile'} onClick={() => setPreview('mobile')}><Smartphone size={15} />手机</button></div><span>实时预览 · 包含未保存修改</span></header><div className="lpe-preview-stage"><iframe ref={previewFrame} className={preview} title={preview === 'mobile' ? '手机页面预览' : '桌面页面预览'} src="/?landingPreview=1" onLoad={sendPreview} /></div></div>}
      <input ref={fileInput} type="file" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} />
      <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (file.size > 3 * 1024 * 1024) { setNotice('备份文件不能超过 3 MB。'); return; } void file.text().then(text => { const imported = landingDocumentSchema.parse(JSON.parse(text)); commit({ ...documentRef.current, elements: imported.elements }); setNotice('备份已导入，检查后点击保存页面。'); }).catch(() => setNotice('备份格式无效，原有编辑已保留。')); }} />
    </>}
  </div>, window.document.body)}</>;
}
