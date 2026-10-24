import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Check, Cloud, Grid2X2, Image as ImageIcon, LoaderCircle, Search, Sparkles, Upload, Video, X } from 'lucide-react';
import type { LibraryMedia, MediaKind } from '../shared/media-library';
import type { Project, TierNewFrame } from '../shared/domain';
import { frameLabel, framePositions, shotLevel, type FramePosition } from '../shared/tier-prompt';
import { levelInfo } from '../shared/replication-levels';
import { loadMediaLibrary, syncMediaLibrary, uploadLibraryFiles } from './mediaLibrary';
import './asset-library.css';

type Filter = 'all' | MediaKind | 'recent';
type Sort = 'recent' | 'oldest' | 'name';
type Category = { id: Filter; label: string; icon: typeof Grid2X2 };
const libraryCategories: Category[] = [{ id: 'all', label: '全部', icon: Grid2X2 }, { id: 'image', label: '图片', icon: ImageIcon }, { id: 'video', label: '视频', icon: Video }];
const modalCategories: Category[] = [...libraryCategories, { id: 'recent', label: '最近生成', icon: Sparkles }];
const message = (error: unknown) => error instanceof Error ? error.message : '素材暂时无法读取，请重试。';
function sizeLabel(size: number) { return size ? `${(size / 1024 / 1024).toFixed(1)} MB` : ''; }

/** Same 已过期 rule as shared/tier-prompt.ts for middle/last derived from an older first. */
function frameOutdated(version: Pick<TierNewFrame, 'kind' | 'firstFrom'>, position: FramePosition, newFirstFilename: string | undefined, chained: boolean) {
  const dependsOnFirst = chained && position !== 'first';
  return dependsOnFirst && version.kind !== 'uploaded' && version.firstFrom !== newFirstFilename;
}

/** Synthetic library rows from the current project's completed new keyframes (and one previous each). */
export function recentGeneratedMedia(project: Project | null, frameBusy: string[] = []): LibraryMedia[] {
  if (!project?.analysis?.shots?.length) return [];
  const busy = new Set(frameBusy);
  const rows: LibraryMedia[] = [];
  project.analysis.shots.forEach((shot, index) => {
    const newFrames = project.replication?.shots?.[shot.id]?.newFrames;
    if (!newFrames) return;
    const shotName = `镜头${String(index + 1).padStart(2, '0')}`;
    const use = levelInfo(shotLevel(project, shot.id)).frameUse;
    const chained = use === 'layout' || use === 'none';
    const newFirstFilename = newFrames.first?.filename;
    for (const position of framePositions) {
      if (busy.has(`${shot.id}:${position}`)) continue;
      const frame = newFrames[position];
      if (!frame) continue;
      const name = `${shotName} · ${frameLabel[position]}`;
      const push = (version: Pick<TierNewFrame, 'filename' | 'url' | 'kind' | 'createdAt' | 'firstFrom'>) => {
        if (frameOutdated(version, position, newFirstFilename, chained)) return;
        const mime = /\.jpe?g$/i.test(version.filename) ? 'image/jpeg' : /\.webp$/i.test(version.filename) ? 'image/webp' : 'image/png';
        rows.push({
          id: `recent:${version.filename}`,
          kind: 'image',
          name,
          mime,
          size: 0,
          createdAt: version.createdAt,
          url: version.url,
          // omit filename → App referenceMedia uses fetch-via-libraryFile (not account library-assets API)
        });
      };
      push(frame);
      if (frame.previous) push(frame.previous);
    }
  });
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function useLibrary(user: User | null, active = true) {
  const [items, setItems] = useState<LibraryMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState('');
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const ticket = ++sequence.current;
    setLoading(true);
    try {
      const result = await loadMediaLibrary(user, local => { if (ticket === sequence.current) setItems(local); });
      if (ticket === sequence.current) { setItems(result.items); setWarning(result.warning); }
    } catch (error) { if (ticket === sequence.current) setWarning(message(error)); }
    finally { if (ticket === sequence.current) setLoading(false); }
  }, [user?.id]);
  useEffect(() => {
    if (!active) return;
    void refresh();
    const changed = () => { void refresh(); };
    window.addEventListener('media-library-changed', changed);
    return () => { sequence.current++; window.removeEventListener('media-library-changed', changed); };
  }, [active, refresh]);
  return { items, loading, warning, refresh };
}

function filtered(items: LibraryMedia[], filter: Exclude<Filter, 'recent'>, query: string, sort: Sort) {
  const text = query.trim().toLocaleLowerCase();
  return items.filter(item => (filter === 'all' || item.kind === filter) && item.name.toLocaleLowerCase().includes(text))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : (sort === 'oldest' ? 1 : -1) * a.createdAt.localeCompare(b.createdAt));
}

function sortMedia(items: LibraryMedia[], sort: Sort) {
  return [...items].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : (sort === 'oldest' ? 1 : -1) * a.createdAt.localeCompare(b.createdAt));
}

function Thumbnail({ item }: { item: LibraryMedia }) {
  return <span className="media-thumbnail">
    {item.kind === 'image' || item.thumbnail ? <img src={item.thumbnail || item.url} alt="" loading="lazy" /> : <video src={item.url} muted playsInline preload="metadata" onLoadedMetadata={event => { event.currentTarget.currentTime = Math.min(.2, event.currentTarget.duration / 2); }} />}
    {item.kind === 'video' && <span className="media-video-mark"><Video size={14} /></span>}
  </span>;
}

function Categories({ filter, onFilter, items, categories, recentCount = 0 }: {
  filter: Filter; onFilter: (filter: Filter) => void; items: LibraryMedia[]; categories: Category[]; recentCount?: number;
}) {
  return <>{categories.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={`asset-library-category ${filter === id ? 'active' : ''}`} aria-pressed={filter === id} onClick={() => onFilter(id)}>
    <Icon size={16} /><span>{label}</span><small>{id === 'all' ? items.length : id === 'recent' ? recentCount : items.filter(item => item.kind === id).length}</small>
  </button>)}</>;
}

function SearchTools({ query, onQuery, sort, onSort, recentMode = false }: { query: string; onQuery: (query: string) => void; sort: Sort; onSort: (sort: Sort) => void; recentMode?: boolean }) {
  return <><label className="asset-library-search"><Search size={16} /><input value={query} onChange={event => onQuery(event.target.value)} placeholder="搜索素材" aria-label="搜索素材" /></label>
    <select className="media-sort" value={sort} onChange={event => onSort(event.target.value as Sort)} aria-label="素材排序"><option value="recent">{recentMode ? '按时间' : '最近上传'}</option><option value="oldest">{recentMode ? '最早' : '最早上传'}</option><option value="name">名称</option></select></>;
}

export function MediaLibraryPage({ user, onSelect, onUpload, onSignIn }: { user: User | null; onSelect: (item: LibraryMedia) => void; onUpload: () => void; onSignIn: () => void }) {
  const { items, loading, warning, refresh } = useLibrary(user);
  const [filter, setFilter] = useState<Exclude<Filter, 'recent'>>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const sync = useCallback(async () => {
    setSyncing(true); setSyncError('');
    try { await syncMediaLibrary(user); } catch (error) { setSyncError(message(error)); } finally { setSyncing(false); }
  }, [user?.id]);
  useEffect(() => { if (user) void sync(); }, [sync]);
  const visible = useMemo(() => filtered(items, filter, query, sort), [items, filter, query, sort]);
  return <section className="all-media-page">
    <header className="all-media-heading"><div><h1>所有媒体</h1><p>上传过的图片与视频，随时查看、随时复用。</p></div><button className="btn primary" type="button" onClick={onUpload}><Upload size={16} />添加素材</button></header>
    <div className="all-media-toolbar"><div className="all-media-tabs"><Categories filter={filter} onFilter={next => { if (next !== 'recent') setFilter(next); }} items={items} categories={libraryCategories} /></div><SearchTools query={query} onQuery={setQuery} sort={sort} onSort={setSort} /></div>
    <div className="media-sync-note"><Cloud size={14} />{user ? <><span>{syncing ? '正在同步到云端…' : '已启用私有云端素材库'}</span><button type="button" disabled={syncing} onClick={() => void sync()}>同步素材</button></> : <><span>当前设备的素材已收录</span><button type="button" onClick={onSignIn}>登录后同步云端</button></>}</div>
    {(warning || syncError) && <div className="asset-library-error" role="alert">{warning || syncError}<button type="button" onClick={() => { void refresh(); if (user) void sync(); }}>重试</button></div>}
    {visible.length ? <div className="all-media-grid">{visible.map(item => <button type="button" className="all-media-card" key={item.id} onClick={() => onSelect(item)} aria-label={`查看 ${item.name}`}>
      <Thumbnail item={item} /><span className="all-media-card-name" title={item.name}>{item.name}</span><span className="all-media-card-meta">{item.kind === 'image' ? '图片' : '视频'}{sizeLabel(item.size) && ` · ${sizeLabel(item.size)}`}{item.cloudPath && <Cloud size={12} aria-label="已同步云端" />}</span>
    </button>)}</div> : <div className="asset-library-empty">{loading ? <><LoaderCircle className="spin" size={24} /><span>正在读取素材…</span></> : <><Grid2X2 size={30} /><strong>{query ? '没有找到匹配的素材' : '这里会收录你上传的素材'}</strong><span>{query ? '试试其他名称或分类。' : '添加图片或视频，之后可以在不同创意中引用。'}</span>{!query && <button className="btn" type="button" onClick={onUpload}>添加素材</button>}</>}</div>}
  </section>;
}

export default function AssetLibrary({ open, user, target, initialSelection, onClose, onReference, onSignIn, project = null, frameBusy = [] }: {
  open: boolean; user: User | null; target: 'all' | MediaKind; initialSelection?: LibraryMedia | null;
  onClose: () => void; onReference: (item: LibraryMedia) => Promise<void>; onSignIn: () => void;
  project?: Project | null; frameBusy?: string[];
}) {
  const { items, loading, warning, refresh } = useLibrary(user, open);
  const [selected, setSelected] = useState<LibraryMedia | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const busyRef = useRef(busy); busyRef.current = busy;
  const recentItems = useMemo(() => recentGeneratedMedia(project, frameBusy), [project, frameBusy]);
  useEffect(() => {
    if (!open) return;
    setFilter(target); setSelected(initialSelection || null); setQuery(''); setSort('recent'); setError('');
    if (user) void syncMediaLibrary(user).catch(error => setError(message(error)));
  }, [open, target, initialSelection?.id, user?.id]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab' || !dialog.current) return;
      const nodes = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not([hidden]), select, video[controls], [tabindex="0"]')];
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [open]);
  const visible = useMemo(() => {
    if (filter === 'recent') {
      // Images only; when opened for video reference the list stays empty but the category still shows.
      if (target === 'video') return [];
      const text = query.trim().toLocaleLowerCase();
      return sortMedia(recentItems.filter(item => item.name.toLocaleLowerCase().includes(text)), sort);
    }
    return filtered(items, filter, query, sort);
  }, [items, filter, query, sort, recentItems, target]);
  const current = (filter === 'recent' ? recentItems : items).find(item => item.id === selected?.id) || selected;
  const compatible = !!current && (target === 'all' || current.kind === target);
  const upload = async (files: File[]) => {
    if (!files.length) return;
    setError('');
    for (const file of files) {
      const kind = file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name) ? 'video' : 'image';
      if (target !== 'all' && kind !== target) { setError(target === 'image' ? '请选择图片文件。' : '请选择视频文件。'); return; }
      const limit = kind === 'image' ? 10 : 250;
      if (file.size > limit * 1024 * 1024) { setError(`${file.name} 超过 ${limit} MB，请选择更小的文件。`); return; }
    }
    setBusy('正在上传并收录素材…');
    try {
      const uploaded = await uploadLibraryFiles(files);
      setFilter(target); setQuery(''); setSelected(uploaded.at(-1) || null); void refresh();
      if (user) void syncMediaLibrary(user).catch(error => setError(message(error)));
    } catch (error) { setError(message(error)); void refresh(); }
    finally { setBusy(''); }
  };
  const reference = async () => {
    if (!current || !compatible) return;
    setBusy('正在引用素材…'); setError('');
    try { await onReference(current); close.current(); } catch (error) { setError(message(error)); } finally { setBusy(''); }
  };
  if (!open) return null;
  return <div className="asset-library-scrim" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="asset-library" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="asset-library-title" aria-busy={!!busy}>
      <header className="asset-library-header"><h2 id="asset-library-title">快捷素材库</h2><span>{target === 'image' ? '选择产品 / 主体参考图' : target === 'video' ? '选择参考视频' : '查看并引用素材'}</span><button className="asset-library-close" type="button" disabled={!!busy} onClick={onClose} aria-label="关闭素材库"><X size={19} /></button></header>
      <div className="asset-library-toolbar"><span className="asset-library-scope">所有媒体</span><SearchTools query={query} onQuery={setQuery} sort={sort} onSort={setSort} recentMode={filter === 'recent'} /></div>
      {(error || warning) && <div className="asset-library-error" role="alert">{error || warning}<button type="button" disabled={!!busy} onClick={() => { setError(''); void refresh(); }}>重试读取</button></div>}
      <div className="asset-library-body">
        <aside className="asset-library-categories"><Categories filter={filter} onFilter={setFilter} items={items} categories={modalCategories} recentCount={recentItems.length} />
          <div className="asset-library-account"><Cloud size={14} /><small>{user ? '私有云端素材' : '当前设备素材'}</small>{!user && <button type="button" disabled={!!busy} onClick={onSignIn}>登录同步</button>}</div>
          <button className="asset-library-local-upload" type="button" disabled={!!busy} onClick={() => input.current?.click()}><Upload size={16} /><span>本地上传内容</span></button>
          <input ref={input} hidden type="file" multiple={target !== 'video'} accept={target === 'image' ? 'image/jpeg,image/png,image/webp' : target === 'video' ? 'video/mp4,video/quicktime,video/webm,.mov' : 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.mov'} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void upload(files); }} />
        </aside>
        <div className="asset-library-results">{visible.length ? <div className="asset-library-list">{visible.map(item => <button type="button" className={`asset-library-row ${current?.id === item.id ? 'selected' : ''}`} aria-pressed={current?.id === item.id} key={item.id} onClick={() => setSelected(item)}>
          <Thumbnail item={item} /><span className="asset-library-row-text"><strong title={item.name}>{item.name}</strong><small>{item.kind === 'image' ? '图片' : '视频'}{item.cloudPath && <Cloud size={11} />}</small></span>{current?.id === item.id && <Check size={14} />}
        </button>)}</div> : <div className="asset-library-empty">{loading && filter !== 'recent' ? <><LoaderCircle className="spin" size={22} /><span>正在读取素材…</span></> : <><Grid2X2 size={26} /><strong>{query ? '没有匹配的素材' : filter === 'recent' ? '还没有最近生成的关键帧' : '还没有这类素材'}</strong><span>{query ? '试试其他名称或分类。' : filter === 'recent' ? '在当前创意中生成关键帧后会出现在这里。' : '点击左下角“本地上传内容”，收录第一份素材。'}</span></>}</div>}</div>
        <aside className="asset-library-preview"><div className="asset-library-preview-media">{current ? current.kind === 'image' ? <img key={current.id} src={current.url} alt={current.name} /> : <video key={current.id} src={current.url} poster={current.thumbnail} controls playsInline preload="metadata" /> : <div className="asset-library-preview-empty"><ImageIcon size={34} /><span>选择素材预览</span></div>}</div>
          <div className="asset-library-preview-info"><strong title={current?.name}>{current?.name || '素材预览'}</strong><span>{current ? `${current.kind === 'image' ? '图片' : '视频'}${sizeLabel(current.size) ? ` · ${sizeLabel(current.size)}` : ''}` : '可引用到当前创意'}</span>{current && !compatible && <small>当前入口仅可引用{target === 'image' ? '图片' : '视频'}，可切换左侧分类。</small>}</div>
          <button className="asset-library-add" type="button" disabled={!compatible || !!busy} onClick={() => void reference()}>{busy ? <><LoaderCircle className="spin" size={16} />{busy}</> : '添加到当前创意'}</button>
        </aside>
      </div>
    </section>
  </div>;
}
