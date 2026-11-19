import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { User } from '@supabase/supabase-js';
import { Check, Cloud, CloudOff, Grid2X2, Image as ImageIcon, ListChecks, LoaderCircle, Search, Sparkles, Trash2, Upload, Video, X } from 'lucide-react';
import type { LibraryCounts, LibraryMedia, LibraryPage, LibrarySort, MediaKind } from '../shared/media-library';
import type { Project, TierNewFrame, WorkspaceProject } from '../shared/domain';
import { frameLabel, framePositions, shotLevel, type FramePosition } from '../shared/tier-prompt';
import { levelInfo } from '../shared/replication-levels';
import { deleteLibraryMedia, loadMediaLibrary, loadMediaSelection, loadMediaStatus, syncMediaLibrary, uploadLibraryFiles, type LibrarySelectionItem, type MediaLibraryChange } from './mediaLibrary';
import { publicAuthRequired } from './auth';
import './asset-library.css';

type Filter = 'all' | MediaKind | 'recent';
type Sort = LibrarySort;
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
export function recentGeneratedMedia(project: Project | null, frameBusy: string[] = [], workspaceProject?: WorkspaceProject | null): LibraryMedia[] {
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
          associations: [{ projectId: project.parentProjectId || '', projectTitle: workspaceProject?.title || '暂无记录', creativeId: project.id, creativeTitle: project.title }],
          // omit filename → App referenceMedia uses fetch-via-libraryFile (not account library-assets API)
        });
      };
      push(frame);
      if (frame.previous) push(frame.previous);
    }
  });
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const emptyCounts: LibraryCounts = { all: 0, image: 0, video: 0 };
const emptyPage: LibraryPage = { items: [], counts: emptyCounts, matchingTotal: 0, indexing: false };
function useLibrary(user: User | null, filter: Filter, query: string, sort: Sort, active = true) {
  const userId = user?.id;
  const kind = filter === 'all' || filter === 'recent' ? undefined : filter;
  const search = query.trim();
  const scope = JSON.stringify([userId, kind, search, sort]);
  const [data, setData] = useState({ scope, page: emptyPage });
  const page = data.scope === scope ? data.page : emptyPage;
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState('');
  const sequence = useRef(0);
  const inFlight = useRef(false);

  const request = useCallback(async (cursor?: string) => {
    if (cursor && inFlight.current) return;
    const ticket = ++sequence.current;
    inFlight.current = true;
    setLoading(true);
    setWarning('');
    try {
      const result = await loadMediaLibrary(userId, { kind, query: search, sort, cursor });
      if (ticket !== sequence.current) return;
      setData(previous => {
        if (!cursor || previous.scope !== scope) return { scope, page: result };
        const items = new Map(previous.page.items.map(item => [item.id, item]));
        for (const item of result.items) items.set(item.id, item);
        return { scope, page: { ...result, items: [...items.values()] } };
      });
    } catch (error) { if (ticket === sequence.current) setWarning(message(error)); }
    finally {
      if (ticket === sequence.current) { inFlight.current = false; setLoading(false); }
    }
  }, [scope, userId, kind, search, sort]);

  useEffect(() => {
    if (!active || publicAuthRequired && !userId) return;
    const timer = window.setTimeout(() => void request(), search ? 250 : 0);
    const changed = (event: Event) => {
      const { deletedIds, uploaded, refresh } = (event as CustomEvent<MediaLibraryChange>).detail;
      const deleted = new Set(deletedIds);
      const added = uploaded.filter(item => (!kind || item.kind === kind) && item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
      if (deleted.size || added.length && sort === 'recent') setData(previous => {
        if (previous.scope !== scope) return previous;
        const items = new Map([...added].reverse().filter(item => sort === 'recent').map(item => [item.id, item]));
        for (const item of previous.page.items) if (!deleted.has(item.id) && !items.has(item.id)) items.set(item.id, item);
        return { scope, page: { ...previous.page, items: [...items.values()] } };
      });
      if (refresh) { window.clearTimeout(timer); void request(); }
    };
    window.addEventListener('media-library-changed', changed);
    return () => { window.clearTimeout(timer); sequence.current++; window.removeEventListener('media-library-changed', changed); };
  }, [active, kind, request, scope, search, sort, userId]);

  const pendingIds = page.items.filter(item => item.backup === 'pending').slice(0, 50).map(item => item.id).join(',');
  useEffect(() => {
    if (!active || !userId || !page.indexing && !pendingIds) return;
    const controller = new AbortController();
    let timer: number;
    const poll = async () => {
      try {
        const result = await loadMediaStatus(pendingIds ? pendingIds.split(',') : [], AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]));
        if (controller.signal.aborted) return;
        if (page.indexing && !result.indexing) { void request(); return; }
        setData(previous => {
          if (previous.scope !== scope) return previous;
          const items = previous.page.items.map(item => Object.hasOwn(result.status, item.id) ? { ...item, backup: result.status[item.id] || undefined } : item);
          return { scope, page: { ...previous.page, items } };
        });
      } catch { /* Retry a transient status failure while the view is active. */ }
      if (!controller.signal.aborted) timer = window.setTimeout(poll, 2000);
    };
    timer = window.setTimeout(poll, 2000);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [active, userId, page.indexing, pendingIds, request, scope]);

  const loadMore = useCallback(() => { if (page.nextCursor) void request(page.nextCursor); }, [page.nextCursor, request]);
  return { ...page, loading: active && (!publicAuthRequired || !!userId) && (loading || data.scope !== scope && !warning || page.indexing && !page.items.length),
    warning: warning || page.warning, refresh: request, loadMore };
}

function LibraryMore({ loading, auto, load }: { loading: boolean; auto: boolean; load: () => void }) {
  const element = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (loading || !auto || !element.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) load(); });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [auto, load, loading]);
  return <div className="media-library-more"><button type="button" className="btn" ref={element} disabled={loading} onClick={load}>{loading ? '正在读取素材…' : '加载更多素材'}</button></div>;
}

function useMediaDeletion() {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  type Request = { items: LibrarySelectionItem[]; resolve: (deleted: boolean) => void };
  const [request, setRequest] = useState<Request | null>(null);
  const pending = useRef<Request | null>(null);
  const running = useRef(false);
  const settle = (deleted: boolean) => {
    const current = pending.current;
    pending.current = null; setRequest(null); current?.resolve(deleted);
  };
  useEffect(() => () => { pending.current?.resolve(false); pending.current = null; }, []);
  const remove = (items: LibrarySelectionItem[]) => new Promise<boolean>(resolve => {
    if (!items.length || pending.current || running.current) { resolve(false); return; }
    const next = { items: [...items], resolve };
    pending.current = next; setRequest(next); setDeleteError('');
  });
  const confirm = async () => {
    if (!pending.current || running.current) return;
    running.current = true; setDeleting(true); setDeleteError('');
    try { await deleteLibraryMedia(pending.current.items); settle(true); }
    catch (error) { setDeleteError(error instanceof Error ? error.message : '素材删除未完成，请重试。'); }
    finally { running.current = false; setDeleting(false); }
  };
  const confirmation = request && <MediaDeleteDialog items={request.items} deleting={deleting} error={deleteError} onConfirm={confirm} onCancel={() => { if (!running.current) settle(false); }} />;
  return { deleting, deleteError, clearDeleteError: () => setDeleteError(''), remove, confirmation };
}

function MediaDeleteDialog({ items, deleting, error, onConfirm, onCancel }: {
  items: LibrarySelectionItem[]; deleting: boolean; error: string; onConfirm: () => Promise<void>; onCancel: () => void;
}) {
  const headingId = useId(), descriptionId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal(); cancel.current?.focus();
    return () => {
      element.close(); document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
      else document.querySelector<HTMLElement>('.asset-library, .all-media-page')?.focus();
    };
  }, []);
  return createPortal(<dialog ref={dialog} className="media-delete-dialog" role="alertdialog" aria-labelledby={headingId} aria-describedby={descriptionId} aria-busy={deleting}
    onCancel={event => { event.preventDefault(); if (!deleting) onCancel(); }}
    onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget && !deleting) onCancel(); }}
    onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <form className="media-delete-dialog-content" onSubmit={event => { event.preventDefault(); void onConfirm(); }}>
      <h2 id={headingId}>{items.length === 1 ? '删除素材' : '批量删除素材'}</h2>
      <div className="media-delete-target">{items.length === 1 ? <span data-no-i18n title={items[0].name}>{items[0].name}</span> : <span>{`已选择 ${items.length} 个素材`}</span>}</div>
      <p id={descriptionId}>将永久删除素材库、服务器和 Supabase 中的对应文件，已有创意中的相关引用将无法继续使用。</p>
      {error && <p className="media-delete-dialog-error" role="alert">{error}</p>}
      <footer><button type="button" ref={cancel} disabled={deleting} onClick={onCancel}>取消</button><button type="submit" className="media-delete-confirm" disabled={deleting}>{deleting && <LoaderCircle className="spin" size={14} />}{deleting ? '正在删除…' : '确认删除'}</button></footer>
    </form>
  </dialog>, document.body);
}

function MediaMetadata({ item }: { item: LibraryMedia }) {
  const date = new Date(item.createdAt);
  const validDate = Number.isFinite(date.getTime());
  const projects = [...new Map(item.associations?.map(association => [association.projectId, association.projectTitle])).values()];
  return <dl className="asset-library-metadata">
    <div><dt>添加时间</dt><dd>{validDate ? <time dateTime={item.createdAt}>{date.toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</time> : '暂无记录'}</dd></div>
    <div><dt>所属项目</dt><dd>{projects.length ? projects.map((title, index) => <span key={index} title={title} data-no-i18n>{title}</span>) : item.associations ? '未关联项目' : '暂无记录'}</dd></div>
    <div><dt>所属创意</dt><dd>{item.associations?.length ? item.associations.map(association => <span key={association.creativeId} title={`${association.projectTitle} / ${association.creativeTitle}`} data-no-i18n>{association.creativeTitle}</span>) : item.associations ? '未关联创意' : '暂无记录'}</dd></div>
  </dl>;
}

function DeleteMediaButton({ item, disabled, onDelete }: { item: LibraryMedia; disabled: boolean; onDelete: () => void }) {
  return <button type="button" className="media-delete-button" disabled={disabled} onClick={event => { event.stopPropagation(); onDelete(); }} title={`删除 ${item.name}`} aria-label={`删除 ${item.name}`}><X size={12} /></button>;
}

function sortMedia(items: LibraryMedia[], sort: Sort) {
  return [...items].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : (sort === 'oldest' ? 1 : -1) * a.createdAt.localeCompare(b.createdAt));
}

function Thumbnail({ item }: { item: LibraryMedia }) {
  return <span className="media-thumbnail">
    {item.thumbnail || item.id.startsWith('recent:') ? <img src={item.thumbnail || item.url} alt="" loading="lazy" onError={event => { event.currentTarget.hidden = true; }} onLoad={event => { event.currentTarget.hidden = false; }} /> : null}
    {item.kind === 'video' && <span className="media-video-mark"><Video size={14} /></span>}
  </span>;
}

function BackupStatus({ item, size }: { item: LibraryMedia; size: number }) {
  if (item.backup === 'pending') return <span title="正在同步到云端…" aria-label="正在同步到云端…"><LoaderCircle className="spin" size={size} /></span>;
  if (item.backup === 'failed') return <span title="素材备份失败" aria-label="素材备份失败"><CloudOff size={size} /></span>;
  if (item.cloudPath || item.backup === 'synced') return <span title="已同步云端" aria-label="已同步云端"><Cloud size={size} /></span>;
  return null;
}

function Categories({ filter, onFilter, counts, categories, recentCount = 0 }: {
  filter: Filter; onFilter: (filter: Filter) => void; counts: LibraryCounts; categories: Category[]; recentCount?: number;
}) {
  return <>{categories.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={`asset-library-category ${filter === id ? 'active' : ''}`} aria-pressed={filter === id} onClick={() => onFilter(id)}>
    <Icon size={16} /><span>{label}</span><small>{id === 'recent' ? recentCount : counts[id]}</small>
  </button>)}</>;
}

function SearchTools({ query, onQuery, sort, onSort, recentMode = false }: { query: string; onQuery: (query: string) => void; sort: Sort; onSort: (sort: Sort) => void; recentMode?: boolean }) {
  return <><label className="asset-library-search"><Search size={16} /><input value={query} onChange={event => onQuery(event.target.value)} placeholder="搜索素材" aria-label="搜索素材" maxLength={240} /></label>
    <select className="media-sort" value={sort} onChange={event => onSort(event.target.value as Sort)} aria-label="素材排序"><option value="recent">{recentMode ? '按时间' : '最近上传'}</option><option value="oldest">{recentMode ? '最早' : '最早上传'}</option><option value="name">名称</option></select></>;
}

export function MediaLibraryPage({ user, onSelect, onUpload, onSignIn }: { user: User | null; onSelect: (item: LibraryMedia) => void; onUpload: () => void; onSignIn: () => void }) {
  const [filter, setFilter] = useState<Exclude<Filter, 'recent'>>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const { items: visible, counts, matchingTotal, loading, warning, nextCursor, refresh, loadMore } = useLibrary(user, filter, query, sort);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<Map<string, LibrarySelectionItem>>(new Map());
  const [selectingAll, setSelectingAll] = useState(false);
  const [selectionError, setSelectionError] = useState('');
  const selectionScope = useRef(0);
  const latestRefresh = useRef(refresh);
  latestRefresh.current = refresh;
  const { deleting, deleteError, clearDeleteError, remove, confirmation } = useMediaDeletion();
  const sync = async () => {
    setSyncing(true); setSyncError('');
    try { await syncMediaLibrary(user); }
    catch (error) { setSyncError(message(error)); }
    finally { setSyncing(false); void latestRefresh.current(); }
  };
  const selectedItems = [...selection.values()];
  const allSelected = matchingTotal > 0 && selection.size === matchingTotal;
  const toggleSelection = (item: LibrarySelectionItem) => setSelection(current => {
    const next = new Map(current);
    if (next.has(item.id)) next.delete(item.id); else next.set(item.id, { id: item.id, name: item.name });
    return next;
  });
  const clearSelection = () => {
    selectionScope.current++;
    setSelection(new Map());
    setSelectingAll(false);
    setSelectionError('');
  };
  useEffect(clearSelection, [user?.id]);
  const toggleAll = async () => {
    if (allSelected) { clearSelection(); return; }
    const ticket = ++selectionScope.current;
    setSelectingAll(true);
    setSelectionError('');
    try {
      const result = nextCursor ? await loadMediaSelection({ kind: filter === 'all' ? undefined : filter, query: query.trim() })
        : { items: visible, total: matchingTotal };
      if (ticket !== selectionScope.current) return;
      if (result.items.length < result.total) { setSelectionError('匹配素材超过 1,000 个，请缩小搜索范围后全选。'); return; }
      setSelection(new Map(result.items.map(({ id, name }) => [id, { id, name }])));
    } catch (error) { if (ticket === selectionScope.current) setSelectionError(message(error)); }
    finally { if (ticket === selectionScope.current) setSelectingAll(false); }
  };
  return <section className="all-media-page" tabIndex={-1}>
    <header className="all-media-heading"><div><h1>所有媒体</h1><p>上传过的图片与视频，随时查看、随时复用。</p></div><div className="all-media-heading-actions"><button className="btn" type="button" aria-pressed={selecting} disabled={deleting || (!visible.length && !selecting)} onClick={() => { setSelecting(!selecting); clearSelection(); }}><ListChecks size={16} />{selecting ? '取消批量' : '批量管理'}</button><button className="btn primary" type="button" disabled={deleting} onClick={onUpload}><Upload size={16} />添加素材</button></div></header>
    <div className="all-media-toolbar"><div className="all-media-tabs"><Categories filter={filter} onFilter={next => { if (next !== 'recent') { setFilter(next); clearSelection(); } }} counts={counts} categories={libraryCategories} /></div><SearchTools query={query} onQuery={next => { setQuery(next); clearSelection(); }} sort={sort} onSort={setSort} /></div>
    <div className="media-sync-note"><Cloud size={14} />{!publicAuthRequired ? <span>本机上传的素材保存在当前设备</span> : user ? <><span>{syncing ? '正在同步到云端…' : '已启用私有云端素材库'}</span><button type="button" disabled={syncing} onClick={() => void sync()}>同步素材</button></> : <><span>登录后查看账号的私有素材库</span><button type="button" onClick={onSignIn}>登录</button></>}</div>
    {selecting && <div className="all-media-selection-bar"><label className="all-media-select-all"><input type="checkbox" checked={allSelected} ref={node => { if (node) node.indeterminate = selectedItems.length > 0 && !allSelected; }} disabled={deleting || selectingAll || !visible.length} onChange={() => void toggleAll()} />全选当前结果</label><span role="status">{`已选择 ${selectedItems.length} 个素材`}</span><button className="btn media-bulk-delete" type="button" disabled={deleting || selectingAll || !selectedItems.length} onClick={async () => { if (await remove(selectedItems)) clearSelection(); }}>{deleting ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}{deleting ? '正在删除…' : `删除所选 (${selectedItems.length})`}</button></div>}
    {selectionError && <div className="asset-library-error" role="alert">{selectionError}</div>}
    {(warning || syncError || deleteError) && <div className="asset-library-error" role="alert">{deleteError || warning || syncError}<button type="button" disabled={deleting || syncing} onClick={() => { clearDeleteError(); if (syncError && !warning && !deleteError) void sync(); else void refresh(); }}>重试</button></div>}
    {deleting && !selecting && <p className="media-delete-status" role="status"><LoaderCircle className="spin" size={14} />正在删除素材…</p>}
    {visible.length ? <div className="all-media-grid">{visible.map(item => <div className="all-media-item" key={item.id}><button type="button" className={`all-media-card ${selecting && selection.has(item.id) ? 'selected' : ''}`} disabled={deleting} onClick={() => selecting ? toggleSelection(item) : onSelect(item)} aria-pressed={selecting ? selection.has(item.id) : undefined} aria-label={`${selecting ? selection.has(item.id) ? '取消选择' : '选择' : '查看'} ${item.name}`}>
      <Thumbnail item={item} /><span className="all-media-card-name" title={item.name}>{item.name}</span><span className="all-media-card-meta">{item.kind === 'image' ? '图片' : '视频'}{sizeLabel(item.size) && ` · ${sizeLabel(item.size)}`}<BackupStatus item={item} size={12} /></span>
      {selecting && <span className="media-select-mark" aria-hidden="true">{selection.has(item.id) && <Check size={15} />}</span>}
    </button>{!selecting && <DeleteMediaButton item={item} disabled={deleting} onDelete={() => void remove([item])} />}</div>)}</div> : <div className="asset-library-empty">{loading ? <><LoaderCircle className="spin" size={24} /><span>正在读取素材…</span></> : <><Grid2X2 size={30} /><strong>{query ? '没有找到匹配的素材' : '这里会收录你上传的素材'}</strong><span>{query ? '试试其他名称或分类。' : '添加图片或视频，之后可以在不同创意中引用。'}</span>{!query && <button className="btn" type="button" onClick={onUpload}>添加素材</button>}</>}</div>}
    {nextCursor && <LibraryMore loading={loading} auto={!warning} load={loadMore} />}
    {confirmation}
  </section>;
}

type AssetLibraryProps = {
  open: boolean; user: User | null; target: 'all' | MediaKind; initialSelection?: LibraryMedia | null;
  onClose: () => void; onReference: (item: LibraryMedia) => Promise<void>; onSignIn: () => void;
  project?: Project | null; workspaceProject?: WorkspaceProject | null; frameBusy?: string[];
};
export default function AssetLibrary(props: AssetLibraryProps) {
  if (!props.open) return null;
  return <AssetLibraryDialog key={JSON.stringify([props.user?.id, props.target, props.initialSelection?.id])} {...props} />;
}

function AssetLibraryDialog({ open, user, target, initialSelection, onClose, onReference, onSignIn, project = null, workspaceProject = null, frameBusy = [] }: AssetLibraryProps) {
  const [selected, setSelected] = useState<LibraryMedia | null>(initialSelection || null);
  const [filter, setFilter] = useState<Filter>(target);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const { items, counts, loading, warning, nextCursor, refresh, loadMore } = useLibrary(user, filter, filter === 'recent' ? '' : query, sort, open);
  const [operation, setBusy] = useState('');
  const [error, setError] = useState('');
  const { deleting, deleteError, clearDeleteError, remove, confirmation } = useMediaDeletion();
  const busy = operation || (deleting ? '正在删除素材…' : '');
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const busyRef = useRef(busy); busyRef.current = busy;
  const recentItems = useMemo(() => recentGeneratedMedia(project, frameBusy, workspaceProject), [project, frameBusy, workspaceProject]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (document.querySelector('.media-delete-dialog[open]')) return;
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
    return items;
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
      setFilter(target); setQuery(''); setSelected(uploaded.at(-1) || null);
    } catch (error) { setError(message(error)); }
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
      {(error || warning || deleteError) && <div className="asset-library-error" role="alert">{deleteError || error || warning}<button type="button" disabled={!!busy} onClick={() => { setError(''); clearDeleteError(); void refresh(); }}>重试读取</button></div>}
      <div className="asset-library-body">
        <aside className="asset-library-categories"><Categories filter={filter} onFilter={setFilter} counts={counts} categories={modalCategories} recentCount={recentItems.length} />
          <div className="asset-library-account"><Cloud size={14} /><small>{publicAuthRequired ? '私有云端素材' : '当前设备素材'}</small>{publicAuthRequired && !user && <button type="button" disabled={!!busy} onClick={onSignIn}>登录</button>}</div>
          <button className="asset-library-local-upload" type="button" disabled={!!busy} onClick={() => input.current?.click()}><Upload size={16} /><span>本地上传内容</span></button>
          <input ref={input} hidden type="file" multiple={target !== 'video'} accept={target === 'image' ? 'image/jpeg,image/png,image/webp' : target === 'video' ? 'video/mp4,video/quicktime,video/webm,.mov' : 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.mov'} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void upload(files); }} />
        </aside>
        <div className="asset-library-results">{visible.length ? <div className="asset-library-list">{visible.map(item => <div className="asset-library-item" key={item.id}><button type="button" className={`asset-library-row ${current?.id === item.id ? 'selected' : ''}`} disabled={!!busy} aria-pressed={current?.id === item.id} onClick={() => setSelected(item)}>
          <Thumbnail item={item} /><span className="asset-library-row-text"><strong title={item.name}>{item.name}</strong><small>{item.kind === 'image' ? '图片' : '视频'}<BackupStatus item={item} size={11} /></small></span>{current?.id === item.id && <Check size={14} />}
        </button>{!item.id.startsWith('recent:') && <DeleteMediaButton item={item} disabled={!!busy} onDelete={async () => { if (await remove([item])) setSelected(previous => previous?.id === item.id ? null : previous); }} />}</div>)}</div> : <div className="asset-library-empty">{loading && filter !== 'recent' ? <><LoaderCircle className="spin" size={22} /><span>正在读取素材…</span></> : <><Grid2X2 size={26} /><strong>{query ? '没有匹配的素材' : filter === 'recent' ? '还没有最近生成的关键帧' : '还没有这类素材'}</strong><span>{query ? '试试其他名称或分类。' : filter === 'recent' ? '在当前创意中生成关键帧后会出现在这里。' : '点击左下角“本地上传内容”，收录第一份素材。'}</span></>}</div>}{filter !== 'recent' && nextCursor && <LibraryMore loading={loading} auto={!warning} load={loadMore} />}</div>
        <aside className="asset-library-preview"><div className="asset-library-preview-media">{current ? current.kind === 'image' ? <img key={current.id} src={current.url} alt={current.name} /> : <video key={current.id} src={current.url} poster={current.thumbnail} controls playsInline preload="metadata" /> : <div className="asset-library-preview-empty"><ImageIcon size={34} /><span>选择素材预览</span></div>}</div>
          <div className="asset-library-preview-info"><strong title={current?.name}>{current?.name || '素材预览'}</strong><span>{current ? `${current.kind === 'image' ? '图片' : '视频'}${sizeLabel(current.size) ? ` · ${sizeLabel(current.size)}` : ''}` : '可引用到当前创意'}</span>{current && <MediaMetadata item={current} />}{current && !compatible && <small>当前入口仅可引用{target === 'image' ? '图片' : '视频'}，可切换左侧分类。</small>}</div>
          <button className="asset-library-add" type="button" disabled={!compatible || !!busy} onClick={() => void reference()}>{busy ? <><LoaderCircle className="spin" size={16} />{busy}</> : '添加到当前创意'}</button>
        </aside>
      </div>
    </section>
    {confirmation}
  </div>;
}
